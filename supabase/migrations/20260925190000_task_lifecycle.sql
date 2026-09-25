-- D-128: the life of a task between the director and the employee — the places that had no
-- path. After «Принял» the employee could only hand in; «Буду позже» and «Это не ко мне» were
-- refusals; a reassigned task told the old holder «Отозвано директором» and gave the new one
-- no context and a deadline already behind; nobody reminded anybody of anything. The rule of
-- this migration: the employee proposes in one tap, the director decides in one tap. No new
-- statuses — a proposal is a message with a flag, the way «Уточнить» is (D-03).
--
--   1. tasks.passed_to        — who took over a reassigned task (the old holder's card says so)
--   2. task_status_guard      — «Не могу» also from rework (sent/accepted already allowed it)
--   3. transition_task        — a refusal may suggest a colleague; a report may say «не всё»;
--                               the director's push carries the reason
--   4. request_deadline       — the employee asks for another deadline; on a new task it is
--                               «возьму, но к …»: accepted at once, the request waits
--   5. answer_deadline_request — «Согласовать» / «Оставить прежний»
--   6. extend_task_deadline   — honest words: later is «продлён» (quiet), earlier or a first
--                               deadline is «перенесён» / «назначен» (loud); closes a request
--   7. nudge_task             — «Напомнить»: one push, not more often than every 30 minutes
--   8. reassign_task          — a new deadline and a word for the new person; the old holder
--                               hears «Задача передана», the new one «Передана от …»
--   9. notify_outbox_message  — a request is the director's «вопрос», never folded into chat
--  10. overdue_alerts_due     — no «Просрочено» while the employee's request waits
--  11. deadline_reminders_due — «Скоро срок» to the employee an hour before (minute sweep)
--
-- Nothing here touches notify_outbox_task: the words of the task pushes belong to D-125
-- (a parallel migration); the producers below adjust the rows they cause instead.

-- ---------------------------------------------------------------------------
-- 1. Who took over
-- ---------------------------------------------------------------------------
alter table tasks add column if not exists passed_to uuid references profiles(id);

comment on column tasks.passed_to is
  'D-128: set by reassign_task on the revoked original — the person the work went to.';

create or replace function tasks_field_guard() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;                                            -- service role / cron
  end if;
  if auth_role() = 'director' or auth.uid() = old.author_id then
    return new;                                            -- may edit content
  end if;

  if new.company_id         is distinct from old.company_id
     or new.author_id       is distinct from old.author_id
     or new.assignee_id     is distinct from old.assignee_id
     or new.parent_task_id  is distinct from old.parent_task_id
     or new.group_id        is distinct from old.group_id
     or new.title           is distinct from old.title
     or new.body            is distinct from old.body
     or new.deadline        is distinct from old.deadline
     or new.priority        is distinct from old.priority
     or new.source          is distinct from old.source
     or new.source_audio_path  is distinct from old.source_audio_path
     or new.source_transcript  is distinct from old.source_transcript
     or new.scheduled_send_at  is distinct from old.scheduled_send_at
     or new.recurrence_rule_id is distinct from old.recurrence_rule_id
     or new.passed_to       is distinct from old.passed_to
     or new.created_at      is distinct from old.created_at then
    raise exception 'forbidden_field_update' using errcode = 'P0001';
  end if;

  -- Stamps are the status guard's business: without a transition they are frozen.
  if new.status = old.status and (
       new.accepted_at   is distinct from old.accepted_at
    or new.completed_at  is distinct from old.completed_at
    or new.closed_at     is distinct from old.closed_at) then
    raise exception 'forbidden_field_update' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. «Не могу» from any work in hand, rework included
-- ---------------------------------------------------------------------------
create or replace function task_status_guard() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  uid   uuid    := auth.uid();
  urole text    := auth_role();
  ok    boolean := false;
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status = 'scheduled' and new.status = 'sent' then
    ok := uid is null;                                     -- cron scheduled-send only
  elsif old.status = 'sent' and new.status = 'accepted' then
    ok := uid is null or uid = old.assignee_id;
  elsif old.status in ('sent','accepted','in_progress','rework') and new.status = 'declined' then
    ok := uid is null or uid = old.assignee_id;            -- D-128: rework too
  elsif old.status = 'accepted' and new.status = 'pending_review' then
    ok := uid is null or uid = old.assignee_id;
  elsif old.status = 'pending_review' and new.status in ('done','rework') then
    ok := uid is null or urole = 'director';
  elsif old.status = 'rework' and new.status = 'accepted' then
    ok := uid is null or uid = old.assignee_id;
  elsif old.status = 'declined' and new.status = 'sent' then
    ok := uid is null or urole = 'director';               -- "Настоять" (G.20)
  elsif new.status = 'revoked' and old.status not in ('done','revoked') then
    ok := uid is null or urole = 'director';               -- incl. declined: "Отменить"
  end if;

  if not ok then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  new.accepted_at  := old.accepted_at;
  new.completed_at := old.completed_at;
  new.closed_at    := old.closed_at;

  if new.status = 'accepted' and old.status = 'sent' then
    new.accepted_at := now();
  end if;
  if new.status = 'pending_review' then
    new.completed_at := now();
  end if;
  if new.status in ('done','declined','revoked') then
    new.closed_at := now();
  end if;
  if old.status = 'declined' and new.status = 'sent' then
    new.closed_at := null;                                 -- the task is open again
  end if;

  return new;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. transition_task: a suggestion with the refusal, «не всё» with the report
-- ---------------------------------------------------------------------------
create or replace function transition_task(
  task_id uuid,
  to_status task_status,
  payload jsonb default '{}',
  client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid    uuid := client_request_id;      -- the parameters shadow column names
  v_task    uuid := task_id;
  v_company uuid := auth_company_id();
  v_user    uuid := auth.uid();
  v_result  jsonb;
  v_status  task_status;
  v_author  uuid;
  v_title   text;
  v_reason  text := nullif(payload->>'reason', '');
  v_comment text := nullif(payload->>'comment', '');
  v_report_text text := nullif(payload->'report'->>'text', '');
  v_report_path text := nullif(payload->'report'->>'file_path', '');
  v_partial boolean := coalesce((payload->'report'->>'partial')::boolean, false);
  v_suggest uuid := nullif(payload->>'suggest_assignee_id', '')::uuid;
  v_suggest_name text;
  v_meta    jsonb := '{"decline_reason": true}'::jsonb;
begin
  if v_crid is not null then
    insert into ingest_batches (company_id, user_id, client_request_id, result)
    values (v_company, v_user, v_crid, '{}'::jsonb)
    on conflict on constraint ingest_batches_company_request_key do nothing;

    if not found then
      select b.result into v_result
        from ingest_batches b
       where b.company_id = v_company and b.client_request_id = v_crid;
      return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('duplicate', true);
    end if;
  end if;

  -- «Это к другому»: the colleague is checked before anything moves
  if to_status = 'declined' and v_suggest is not null then
    select p.full_name into v_suggest_name
      from profiles p
     where p.id = v_suggest and p.company_id = v_company and p.is_active and p.role <> 'tv';
    if not found then
      raise exception 'assignee_not_found' using errcode = 'P0001';
    end if;
    if v_suggest = v_user then
      raise exception 'same_assignee' using errcode = 'P0001';
    end if;
    v_meta := v_meta || jsonb_build_object('suggest_assignee_id', v_suggest, 'suggest_name', v_suggest_name);
    -- the suggestion travels on the reason's row: a refusal without words still carries one
    v_reason := coalesce(v_reason, 'Это не ко мне');
  end if;

  update tasks t set status = to_status
   where t.id = v_task and t.company_id = v_company
  returning t.status, t.author_id, t.title into v_status, v_author, v_title;

  if not found then
    raise exception 'task_not_found' using errcode = 'P0001';
  end if;

  -- the reason of "Не могу" / the comment of a rework becomes a visible message
  if v_reason is not null then
    insert into task_messages (company_id, task_id, sender_id, type, content, meta)
    values (v_company, v_task, coalesce(v_user, v_author), 'text', v_reason, v_meta);

    -- the director's push says why, not only that (the trigger queued it a moment ago)
    update notification_deliveries d
       set meta = d.meta || jsonb_build_object(
             'body', '«' || left(coalesce(v_title, 'Задача'), 60) || '» · ' || left(v_reason, 90)
                     || coalesce(' · предлагает: ' || nullif(split_part(v_suggest_name, ' ', 1), ''), ''))
     where d.task_id = v_task and d.event_kind = 'declined' and d.status = 'queued'
       and d.created_at >= now();
  elsif v_comment is not null then
    insert into task_messages (company_id, task_id, sender_id, type, content, meta)
    values (v_company, v_task, coalesce(v_user, v_author), 'text', v_comment,
            '{"rework_comment": true}'::jsonb);
  end if;

  -- what was done, in the same transaction as the handover
  if v_report_text is not null or v_report_path is not null or v_partial then
    insert into task_messages (company_id, task_id, sender_id, type, content, file_path, meta)
    values (v_company, v_task, coalesce(v_user, v_author),
            case when v_report_path is not null then 'photo'::message_type else 'text'::message_type end,
            coalesce(v_report_text, case when v_partial and v_report_path is null then 'Сделано не всё' end),
            v_report_path,
            jsonb_build_object('report', true) || case when v_partial then '{"partial": true}'::jsonb else '{}'::jsonb end);
  end if;

  -- «сделано не всё» reaches the director's push too
  if v_partial and to_status = 'pending_review' then
    update notification_deliveries d
       set meta = d.meta || jsonb_build_object('title', coalesce(d.meta->>'title', 'На приёмку') || ' · не всё')
     where d.task_id = v_task and d.event_kind = 'pending_review' and d.status = 'queued'
       and d.created_at >= now();
  end if;

  v_result := jsonb_build_object('task_id', v_task, 'status', v_status);

  if v_crid is not null then
    update ingest_batches b set result = v_result
     where b.company_id = v_company and b.client_request_id = v_crid;
  end if;

  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- A request lives while the work is in the employee's hands: handed in, refused, closed —
-- it is over, and «Настоять» after a refusal starts clean
-- ---------------------------------------------------------------------------
create or replace function close_time_requests() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  if new.status = old.status or new.status in ('sent', 'accepted', 'in_progress', 'rework') then
    return null;
  end if;
  update task_messages m
     set meta = m.meta || jsonb_build_object('answered_at', to_jsonb(now()), 'answer', 'closed')
   where m.task_id = new.id
     and m.meta->>'time_request' = 'true'
     and m.meta->>'answered_at' is null;
  return null;
end;
$fn$;

drop trigger if exists trg_close_time_requests on tasks;
create trigger trg_close_time_requests
  after update of status on tasks
  for each row execute function close_time_requests();

-- ---------------------------------------------------------------------------
-- 4. «Нужно больше времени» / «Возьму, но к …»
-- ---------------------------------------------------------------------------
create or replace function request_deadline(
  task_id uuid,
  proposed timestamptz,
  words text default null,
  client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid     uuid := client_request_id;
  v_task     tasks%rowtype;
  v_company  uuid := auth_company_id();
  v_user     uuid := auth.uid();
  v_result   jsonb;
  v_words    text := nullif(btrim(coalesce(words, '')), '');
  v_accepted boolean := false;
  v_id       uuid;
begin
  if v_crid is not null then
    insert into ingest_batches (company_id, user_id, client_request_id, result)
    values (v_company, v_user, v_crid, '{}'::jsonb)
    on conflict on constraint ingest_batches_company_request_key do nothing;
    if not found then
      select b.result into v_result
        from ingest_batches b
       where b.company_id = v_company and b.client_request_id = v_crid;
      return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('duplicate', true);
    end if;
  end if;

  select * into v_task from tasks t where t.id = task_id and t.company_id = v_company;
  if not found then
    raise exception 'task_not_found' using errcode = 'P0001';
  end if;
  -- only the one who holds the work asks for its time
  if v_task.assignee_id is distinct from v_user then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_task.status not in ('sent', 'accepted', 'in_progress', 'rework') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  if proposed is null or proposed <= now() or proposed > now() + interval '365 days' then
    raise exception 'bad_deadline' using errcode = 'P0001';
  end if;

  -- «возьму, но к …»: the task is taken now, the time waits for the director
  if v_task.status = 'sent' then
    update tasks set status = 'accepted' where id = v_task.id;
    v_accepted := true;
    -- «принял» on the director's receipt, as the transition route does for «Принял» (D-32)
    update notification_deliveries d
       set acted_at = now(), seen_at = coalesce(d.seen_at, now())
     where d.task_id = v_task.id and d.user_id = v_user and d.event_kind = 'task_sent' and d.acted_at is null;
  end if;

  -- a newer request replaces the one still waiting
  update task_messages m
     set meta = m.meta || jsonb_build_object('answered_at', to_jsonb(now()), 'answer', 'replaced')
   where m.task_id = v_task.id
     and m.meta->>'time_request' = 'true'
     and m.meta->>'answered_at' is null;

  -- the words stay readable anywhere: the date is absolute, Aqtobe wall time
  insert into task_messages (company_id, task_id, sender_id, type, content, meta)
  values (v_company, v_task.id, v_user, 'text',
          'Прошу срок до ' || to_char(proposed at time zone 'Asia/Aqtobe', 'DD.MM HH24:MI')
            || coalesce(' · ' || v_words, ''),
          jsonb_build_object('time_request', true,
                             'proposed_deadline', proposed,
                             'old_deadline', v_task.deadline,
                             'words', v_words))
  returning id into v_id;

  v_result := jsonb_build_object('task_id', v_task.id, 'request_id', v_id,
                                 'proposed', proposed, 'accepted', v_accepted);
  if v_crid is not null then
    update ingest_batches set result = v_result
     where company_id = v_company and ingest_batches.client_request_id = v_crid;
  end if;
  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. «Согласовать» / «Оставить прежний»
-- ---------------------------------------------------------------------------
create or replace function answer_deadline_request(
  task_id uuid,
  approve boolean,
  client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid     uuid := client_request_id;
  v_task     tasks%rowtype;
  v_company  uuid := auth_company_id();
  v_user     uuid := auth.uid();
  v_result   jsonb;
  v_req      task_messages%rowtype;
  v_proposed timestamptz;
  v_label    text;
  v_when     text;
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  if v_crid is not null then
    insert into ingest_batches (company_id, user_id, client_request_id, result)
    values (v_company, v_user, v_crid, '{}'::jsonb)
    on conflict on constraint ingest_batches_company_request_key do nothing;
    if not found then
      select b.result into v_result
        from ingest_batches b
       where b.company_id = v_company and b.client_request_id = v_crid;
      return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('duplicate', true);
    end if;
  end if;

  select * into v_task from tasks t where t.id = task_id and t.company_id = v_company;
  if not found then
    raise exception 'task_not_found' using errcode = 'P0001';
  end if;
  if v_task.status not in ('sent', 'accepted', 'in_progress', 'rework') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  select * into v_req
    from task_messages m
   where m.task_id = v_task.id
     and m.meta->>'time_request' = 'true'
     and m.meta->>'answered_at' is null
   order by m.seq desc
   limit 1;
  if not found then
    raise exception 'no_request' using errcode = 'P0001';
  end if;
  v_proposed := (v_req.meta->>'proposed_deadline')::timestamptz;

  if approve then
    update tasks set deadline = v_proposed where id = v_task.id;
    update task_messages
       set meta = meta || jsonb_build_object('answered_at', to_jsonb(now()), 'answer', 'approved')
     where id = v_req.id;
    v_when  := to_char(v_proposed at time zone 'Asia/Aqtobe', 'DD.MM HH24:MI');
    v_label := 'Срок согласован: до ' || v_when;
    insert into task_messages (company_id, task_id, sender_id, type, content, meta)
    values (v_company, v_task.id, v_user, 'system', v_label,
            jsonb_build_object('deadline_changed', true,
                               'old_deadline', v_task.deadline,
                               'new_deadline', v_proposed,
                               'request_id', v_req.id));
    -- good news waits for the window and does not ring (policy of deadline_extended)
    insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta)
    values (v_company, v_task.assignee_id, v_task.id, 'deadline_extended',
            jsonb_build_object('title', 'Срок согласован · до ' || v_when,
                               'body', left(v_task.title, 120),
                               'url', '/tasks/' || v_task.id,
                               'tag', 'task:' || v_task.id));
  else
    update task_messages
       set meta = meta || jsonb_build_object('answered_at', to_jsonb(now()), 'answer', 'kept')
     where id = v_req.id;
    v_when  := case when v_task.deadline is null then null
                    else to_char(v_task.deadline at time zone 'Asia/Aqtobe', 'DD.MM HH24:MI') end;
    v_label := coalesce('Срок прежний: до ' || v_when, 'Срок прежний — без срока');
    insert into task_messages (company_id, task_id, sender_id, type, content, meta)
    values (v_company, v_task.id, v_user, 'system', v_label,
            jsonb_build_object('deadline_kept', true, 'request_id', v_req.id));
    -- «нет» is news the employee has to hear: it rings, and waits for the window like any word
    insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta, deliver_after)
    values (v_company, v_task.assignee_id, v_task.id, 'deadline_kept',
            jsonb_build_object('title', coalesce('Срок прежний · до ' || v_when, 'Срок прежний'),
                               'body', left(v_task.title, 120),
                               'url', '/tasks/' || v_task.id,
                               'tag', 'task:' || v_task.id),
            coalesce(next_delivery_slot(v_company, now()), now()));
  end if;

  v_result := jsonb_build_object('task_id', v_task.id, 'approved', approve,
                                 'deadline', case when approve then v_proposed else v_task.deadline end);
  if v_crid is not null then
    update ingest_batches set result = v_result
     where company_id = v_company and ingest_batches.client_request_id = v_crid;
  end if;
  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 6. «Срок»: the words say which way it moved
-- ---------------------------------------------------------------------------
create or replace function extend_task_deadline(
  task_id uuid,
  new_deadline timestamptz,
  client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid     uuid := client_request_id;
  v_task     tasks%rowtype;
  v_company  uuid := auth_company_id();
  v_user     uuid := auth.uid();
  v_result   jsonb;
  v_label    text;
  v_when     text;
  v_request  boolean;
  v_stricter boolean;
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  if v_crid is not null then
    insert into ingest_batches (company_id, user_id, client_request_id, result)
    values (v_company, v_user, v_crid, '{}'::jsonb)
    on conflict on constraint ingest_batches_company_request_key do nothing;
    if not found then
      select b.result into v_result
        from ingest_batches b
       where b.company_id = v_company and b.client_request_id = v_crid;
      return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('duplicate', true);
    end if;
  end if;

  select * into v_task from tasks t where t.id = task_id and t.company_id = v_company;
  if not found then
    raise exception 'task_not_found' using errcode = 'P0001';
  end if;
  if v_task.status not in ('sent', 'accepted', 'in_progress', 'rework', 'pending_review') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  -- the director named another date: a request still waiting is answered by it
  update task_messages m
     set meta = m.meta || jsonb_build_object('answered_at', to_jsonb(now()), 'answer', 'changed',
                                             'final_deadline', new_deadline)
   where m.task_id = v_task.id
     and m.meta->>'time_request' = 'true'
     and m.meta->>'answered_at' is null;
  v_request := found;

  update tasks set deadline = new_deadline where id = v_task.id;

  -- a deadline that appears or comes closer is stricter news than one that moves away
  v_stricter := new_deadline is not null and (v_task.deadline is null or new_deadline < v_task.deadline);
  v_when := to_char(new_deadline at time zone 'Asia/Aqtobe', 'DD.MM HH24:MI');
  v_label := case
    when new_deadline is null then 'Срок снят'
    when v_request then 'Новый срок: до ' || v_when
    when v_task.deadline is null then 'Назначен срок: до ' || v_when
    when v_stricter then 'Срок перенесён раньше: до ' || v_when
    else 'Срок продлён до ' || v_when
  end;
  insert into task_messages (company_id, task_id, sender_id, type, content, meta)
  values (v_company, v_task.id, v_user, 'system', v_label,
          jsonb_build_object('deadline_changed', true,
                             'old_deadline', v_task.deadline,
                             'new_deadline', new_deadline,
                             'stricter', v_stricter));

  if new_deadline is not null then
    if v_stricter then
      -- sooner work rings; it still waits for the window like any word to an employee
      insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta, deliver_after)
      values (v_company, v_task.assignee_id, v_task.id, 'deadline_moved',
              jsonb_build_object('title', case when v_task.deadline is null then 'Назначен срок' else 'Срок перенесён' end
                                          || ' · до ' || v_when,
                                 'body', left(v_task.title, 120),
                                 'url', '/tasks/' || v_task.id,
                                 'tag', 'task:' || v_task.id),
              coalesce(next_delivery_slot(v_company, now()), now()));
    else
      insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta)
      values (v_company, v_task.assignee_id, v_task.id, 'deadline_extended',
              jsonb_build_object('title', v_label, 'body', left(v_task.title, 120),
                                 'url', '/tasks/' || v_task.id, 'tag', 'task:' || v_task.id));
    end if;
  end if;

  v_result := jsonb_build_object('task_id', v_task.id, 'deadline', new_deadline);
  if v_crid is not null then
    update ingest_batches set result = v_result
     where company_id = v_company and ingest_batches.client_request_id = v_crid;
  end if;
  return v_result;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 7. «Напомнить»
-- ---------------------------------------------------------------------------
create or replace function nudge_task(
  task_id uuid,
  client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid    uuid := client_request_id;
  v_task    tasks%rowtype;
  v_company uuid := auth_company_id();
  v_user    uuid := auth.uid();
  v_result  jsonb;
  v_last    timestamptz;
  v_after   timestamptz;
  v_slot    timestamptz;
  v_title   text;
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  if v_crid is not null then
    insert into ingest_batches (company_id, user_id, client_request_id, result)
    values (v_company, v_user, v_crid, '{}'::jsonb)
    on conflict on constraint ingest_batches_company_request_key do nothing;
    if not found then
      select b.result into v_result
        from ingest_batches b
       where b.company_id = v_company and b.client_request_id = v_crid;
      return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('duplicate', true);
    end if;
  end if;

  select * into v_task from tasks t where t.id = task_id and t.company_id = v_company;
  if not found then
    raise exception 'task_not_found' using errcode = 'P0001';
  end if;
  if v_task.status not in ('sent', 'accepted', 'in_progress', 'rework') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  -- one reminder per half hour: a second tap is a receipt, not a second buzz
  select max(m.created_at) into v_last
    from task_messages m
   where m.task_id = v_task.id and m.meta->>'nudge' = 'true';
  if v_last is not null and v_last > now() - interval '30 minutes' then
    v_result := jsonb_build_object('task_id', v_task.id, 'too_soon', true, 'last_at', v_last);
  else
    v_slot  := next_delivery_slot(v_company, now());
    v_after := coalesce(v_slot, now());
    v_title := case
      when v_task.status = 'sent' then 'Директор ждёт: примите задачу'
      when v_task.deadline is not null and v_task.deadline < now() then 'Директор напоминает · срок прошёл'
      else 'Директор напоминает'
    end;
    insert into task_messages (company_id, task_id, sender_id, type, content, meta)
    values (v_company, v_task.id, v_user, 'system', 'Директор напомнил', '{"nudge": true}'::jsonb);
    insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta, deliver_after)
    values (v_company, v_task.assignee_id, v_task.id, 'task_nudge',
            jsonb_build_object('title', v_title,
                               'body', left(v_task.title, 120)
                                       || case when v_task.deadline > now()
                                               then ' · срок ' || to_char(v_task.deadline at time zone 'Asia/Aqtobe', 'DD.MM HH24:MI')
                                               else '' end,
                               'url', '/tasks/' || v_task.id,
                               'tag', 'task:' || v_task.id),
            v_after);
    v_result := jsonb_build_object('task_id', v_task.id, 'too_soon', false, 'last_at', now(),
                                   'deliver_after', v_slot);
  end if;

  if v_crid is not null then
    update ingest_batches set result = v_result
     where company_id = v_company and ingest_batches.client_request_id = v_crid;
  end if;
  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;

-- a reminder is not an answer: it leaves the employee's open question open
create or replace function task_question_answered() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  if coalesce((new.meta->>'is_question')::boolean, false)
     or coalesce((new.meta->>'nudge')::boolean, false) then
    return null;
  end if;

  if not exists (
    select 1 from tasks t
    where t.id = new.task_id and t.author_id = new.sender_id
  ) then
    return null;
  end if;

  update task_messages m
     set meta = m.meta || jsonb_build_object('answered_at', to_jsonb(now()))
   where m.task_id = new.task_id
     and coalesce((m.meta->>'is_question')::boolean, false)
     and m.meta->>'answered_at' is null;

  return null;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 8. «Переназначить»: a deadline and a word for the new person, the truth for the old one
-- ---------------------------------------------------------------------------
drop function if exists reassign_task(uuid, uuid, uuid);

create function reassign_task(
  task_id uuid,
  new_assignee_id uuid,
  client_request_id uuid default null,
  new_deadline timestamptz default null,
  change_deadline boolean default false,
  note text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid     uuid := client_request_id;
  v_task     tasks%rowtype;
  v_company  uuid := auth_company_id();
  v_user     uuid := auth.uid();
  v_result   jsonb;
  v_new_id   uuid;
  v_name     text;
  v_from     text;
  v_slot     timestamptz;
  v_deadline timestamptz;
  v_note     text := nullif(btrim(coalesce(note, '')), '');
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  if v_crid is not null then
    insert into ingest_batches (company_id, user_id, client_request_id, result)
    values (v_company, v_user, v_crid, '{}'::jsonb)
    on conflict on constraint ingest_batches_company_request_key do nothing;
    if not found then
      select b.result into v_result
        from ingest_batches b
       where b.company_id = v_company and b.client_request_id = v_crid;
      return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('duplicate', true);
    end if;
  end if;

  select * into v_task from tasks t where t.id = task_id and t.company_id = v_company;
  if not found then
    raise exception 'task_not_found' using errcode = 'P0001';
  end if;
  if v_task.status not in ('sent', 'accepted', 'in_progress', 'rework', 'declined') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  if new_assignee_id = v_task.assignee_id then
    raise exception 'same_assignee' using errcode = 'P0001';
  end if;
  if change_deadline and new_deadline is not null and new_deadline <= now() then
    raise exception 'bad_deadline' using errcode = 'P0001';
  end if;

  select p.full_name into v_name
    from profiles p
   where p.id = new_assignee_id and p.company_id = v_company and p.is_active and p.role <> 'tv';
  if not found then
    raise exception 'assignee_not_found' using errcode = 'P0001';
  end if;
  select nullif(split_part(coalesce(p.full_name, ''), ' ', 1), '') into v_from
    from profiles p where p.id = v_task.assignee_id;

  v_deadline := case when change_deadline then new_deadline else v_task.deadline end;

  -- the same order for a new person; outside the delivery window it waits for the morning (D-38)
  v_slot := next_delivery_slot(v_company, now());
  insert into tasks (company_id, author_id, assignee_id, group_id, parent_task_id, title, body,
                     deadline, priority, status, scheduled_send_at, source, source_audio_path, source_transcript)
  values (v_company, v_user, new_assignee_id, v_task.group_id, v_task.id, v_task.title, v_task.body,
          v_deadline, v_task.priority,
          case when v_slot is null then 'sent'::task_status else 'scheduled'::task_status end,
          v_slot, v_task.source, v_task.source_audio_path, v_task.source_transcript)
  returning id into v_new_id;

  -- the new person learns where it came from — the name, never the old holder's reason (D-45)
  insert into task_messages (company_id, task_id, sender_id, type, content, meta)
  values (v_company, v_new_id, v_user, 'system',
          'Передана' || coalesce(' от ' || v_from, ''),
          jsonb_build_object('passed_from', v_task.id, 'from_assignee_id', v_task.assignee_id));
  if v_note is not null then
    insert into task_messages (company_id, task_id, sender_id, type, content, meta)
    values (v_company, v_new_id, v_user, 'text', v_note, '{"handoff_note": true}'::jsonb);
    -- the director's word rides in the task's own push, not in a second one
    update notification_deliveries d
       set meta = d.meta || jsonb_build_object('body', coalesce(d.meta->>'body', v_task.title) || ' · ' || left(v_note, 90))
     where d.task_id = v_new_id and d.event_kind = 'task_sent' and d.status = 'queued';
  end if;

  -- the old one closes with a pointer to where the work went
  update tasks set passed_to = new_assignee_id, status = 'revoked' where id = v_task.id;
  -- …and its holder hears «передана», not «отозвано» (the trigger queued the row a moment ago)
  update notification_deliveries d
     set meta = d.meta || jsonb_build_object('title', 'Задача передана · ' || split_part(v_name, ' ', 1))
   where d.task_id = v_task.id and d.event_kind = 'revoked' and d.status = 'queued'
     and d.created_at >= now();
  insert into task_messages (company_id, task_id, sender_id, type, content, meta)
  values (v_company, v_task.id, v_user, 'system', 'Передана: ' || v_name,
          jsonb_build_object('reassigned_to', v_new_id, 'assignee_id', new_assignee_id));

  v_result := jsonb_build_object('old_task_id', v_task.id, 'new_task_id', v_new_id, 'assignee', v_name,
                                 'scheduled_send_at', v_slot, 'deadline', v_deadline);
  if v_crid is not null then
    update ingest_batches set result = v_result
     where company_id = v_company and ingest_batches.client_request_id = v_crid;
  end if;
  return v_result;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 9. Messages: a request is the director's «вопрос»; the handover note rides in task_sent
-- ---------------------------------------------------------------------------
create or replace function notify_outbox_message() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_task     tasks%rowtype;
  v_sender   text;
  v_words    text;
  v_title    text;
  v_question boolean := coalesce((new.meta->>'is_question')::boolean, false);
  v_request  boolean := coalesce((new.meta->>'time_request')::boolean, false);
  v_person   uuid;
begin
  -- status lines and system notes are not words of the conversation
  if new.type not in ('text', 'voice', 'photo') then
    return new;
  end if;
  -- these have a push of their own — declined / rework / pending_review / task_sent
  if coalesce((new.meta->>'decline_reason')::boolean, false)
     or coalesce((new.meta->>'rework_comment')::boolean, false)
     or coalesce((new.meta->>'report')::boolean, false)
     or coalesce((new.meta->>'handoff_note')::boolean, false) then
    return new;
  end if;

  select * into v_task from tasks t where t.id = new.task_id;
  if v_task.id is null then
    return new;
  end if;

  select case when p.role = 'director' then 'Директор'
              else nullif(split_part(coalesce(p.full_name, ''), ' ', 1), '') end
    into v_sender
    from profiles p where p.id = new.sender_id;
  v_sender := coalesce(v_sender, 'Сообщение');

  v_words := case
    when v_request then '«' || left(v_task.title, 60) || '» · ' || left(regexp_replace(coalesce(new.content, ''), '^Прошу срок ', ''), 100)
    when new.type = 'photo' then 'Фото' || case when coalesce(new.content, '') <> '' then ': ' || left(new.content, 100) else '' end
    when new.type = 'voice' then 'Голосовое' || case when coalesce(new.content, '') <> '' then ': ' || left(new.content, 100) else '' end
    else left(coalesce(new.content, ''), 120)
  end;

  v_title := case
    when v_request then 'Просит срок · ' || v_sender
    when v_question then 'Вопрос по «' || left(v_task.title, 60) || '»'
    else v_sender || ' · «' || left(v_task.title, 60) || '»'
  end;

  -- everybody in the thread but the one who wrote: the author and the assignee, and so a
  -- manager writing as the author's stand-in is not lost either
  for v_person in
    select distinct person
      from unnest(array[v_task.author_id, v_task.assignee_id]) as person
     where person is not null and person <> new.sender_id
  loop
    -- still queued? then this is the same buzz — fold the new words into it; a request for
    -- time is a decision to make, never folded into chat
    if not v_request then
      update notification_deliveries d
         set meta = d.meta || jsonb_build_object(
               'count', coalesce((d.meta->>'count')::int, 1) + 1,
               'title', v_title,
               'body', (coalesce((d.meta->>'count')::int, 1) + 1)::text || ' '
                       || case when coalesce((d.meta->>'count')::int, 1) + 1 between 2 and 4
                               then 'новых сообщения' else 'новых сообщений' end
                       || ' · ' || v_words,
               'last_seq', new.seq,
               'message_id', new.id)
       where d.user_id = v_person
         and d.task_id = v_task.id
         and d.event_kind = 'message'
         and d.status = 'queued'
         and coalesce(d.meta->>'time_request', 'false') <> 'true';
    end if;

    if v_request or not found then
      insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta)
      values (new.company_id, v_person, v_task.id, 'message',
              jsonb_build_object(
                'title', v_title,
                'body', v_words,
                'url', '/tasks/' || v_task.id,
                -- one notification per task on the phone: a new word replaces the old bubble
                'tag', 'task:' || v_task.id,
                'count', 1,
                'last_seq', new.seq,
                'message_id', new.id,
                -- the director files a request under «Вопросы» (delivery_category)
                'is_question', v_question or v_request,
                'time_request', v_request));
    end if;
  end loop;

  return new;
end
$fn$;

-- ---------------------------------------------------------------------------
-- 10. «Просрочено» stays quiet while the employee's request for time waits for an answer
-- ---------------------------------------------------------------------------
create or replace function overdue_alerts_due(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_count int;
begin
  insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta)
  select t.company_id, t.author_id, t.id, 'task_overdue',
         jsonb_build_object(
           'title', 'Просрочено · ' || coalesce(split_part(p.full_name, ' ', 1), 'без исполнителя'),
           'body', '«' || left(coalesce(t.title, 'Задача'), 80) || '» · срок был ' ||
                   case when (t.deadline at time zone 'Asia/Aqtobe')::date = (p_now at time zone 'Asia/Aqtobe')::date
                        then to_char(t.deadline at time zone 'Asia/Aqtobe', 'HH24:MI')
                        else to_char(t.deadline at time zone 'Asia/Aqtobe', 'DD.MM HH24:MI') end,
           'url', '/tasks/' || t.id,
           'tag', 'task:' || t.id,
           'deadline', t.deadline)
    from tasks t
    join profiles a on a.id = t.author_id and a.role = 'director' and a.is_active
    left join profiles p on p.id = t.assignee_id
   where t.status in ('sent', 'accepted', 'in_progress', 'rework')
     and t.deadline is not null
     and t.deadline <= p_now
     and t.deadline > p_now - interval '3 days'
     and coalesce(notify_prefs_of(t.author_id) -> 'modes' ->> 'overdue', 'digest') <> 'off'
     and not exists (
           select 1 from notification_deliveries o
            where o.task_id = t.id and o.event_kind = 'task_overdue'
              and (o.meta ->> 'deadline')::timestamptz = t.deadline)
     -- the director already holds «просит срок» for this task: that is the news, not the lateness
     and not exists (
           select 1 from task_messages r
            where r.task_id = t.id
              and r.meta ->> 'time_request' = 'true'
              and r.meta ->> 'answered_at' is null);
  get diagnostics v_count = row_count;
  return v_count;
end
$fn$;

-- ---------------------------------------------------------------------------
-- 11. «Скоро срок» — the employee hears it an hour ahead, while there is still time to ask
-- ---------------------------------------------------------------------------
create or replace function deadline_reminders_due(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_count int;
begin
  insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta, deliver_after)
  select t.company_id, t.assignee_id, t.id, 'deadline_soon',
         jsonb_build_object(
           'title', 'Скоро срок · ' || to_char(t.deadline at time zone 'Asia/Aqtobe', 'HH24:MI'),
           'body', '«' || left(coalesce(t.title, 'Задача'), 80) || '» · не успеваете — попросите время',
           'url', '/tasks/' || t.id,
           'tag', 'task:' || t.id,
           'deadline', t.deadline),
         coalesce(next_delivery_slot(t.company_id, p_now), p_now)
    from tasks t
    join profiles p on p.id = t.assignee_id and p.is_active and p.role <> 'tv'
   where t.status in ('sent', 'accepted', 'in_progress', 'rework')
     and t.deadline is not null
     and t.deadline > p_now
     and t.deadline <= p_now + interval '60 minutes'
     -- a task given for less than three hours is all «скоро»: no reminder, no noise
     and t.deadline - t.created_at > interval '3 hours'
     -- a reminder the quiet hours would hold past the deadline is not sent at all
     and coalesce(next_delivery_slot(t.company_id, p_now), p_now) < t.deadline
     and not exists (
           select 1 from notification_deliveries d
            where d.task_id = t.id and d.event_kind = 'deadline_soon'
              and (d.meta ->> 'deadline')::timestamptz = t.deadline);
  get diagnostics v_count = row_count;
  return v_count;
end
$fn$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant execute on function request_deadline(uuid, timestamptz, text, uuid)                     to authenticated, service_role;
grant execute on function answer_deadline_request(uuid, boolean, uuid)                        to authenticated, service_role;
grant execute on function nudge_task(uuid, uuid)                                              to authenticated, service_role;
grant execute on function reassign_task(uuid, uuid, uuid, timestamptz, boolean, text)         to authenticated, service_role;

revoke execute on function deadline_reminders_due(timestamptz) from public, anon, authenticated;
grant execute on function deadline_reminders_due(timestamptz) to service_role;
revoke execute on function close_time_requests() from public, anon, authenticated;
