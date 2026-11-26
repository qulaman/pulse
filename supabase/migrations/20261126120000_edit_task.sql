-- «Изменить задачу» (D-200): the director rewrites an open task in one call — its words, its
-- details, «срочно», its deadline and its person. The task stays where it is with its person:
-- a line in the thread says what changed and what the words were, one push says «Задача
-- изменена»; a new person takes it the way «Передать» gives it (D-128). Closed tasks stay history.
-- 1. task_handover: the copy for a new person and the old one closed — reassign_task's body,
--    now shared with edit_task, so the copy can carry the new words. Internal: called only from
--    the definer functions below, closed to clients (20261124120000_functions_closed_by_default).
-- 2. reassign_task: the same function and signature (its grant stays), the copy made by
--    task_handover. Body before — 20260926120000_task_lifecycle.sql:630.
-- 3. edit_task.
-- 4. tasks_field_guard: a refused task takes a new deadline too. Body before —
--    20261123120000_deadline_fixes.sql:183.

-- ---------------------------------------------------------------------------
-- 1. The copy for a new person
-- ---------------------------------------------------------------------------
create or replace function task_handover(
  p_task     tasks,
  p_assignee uuid,
  p_name     text,
  p_title    text,
  p_body     text,
  p_priority task_priority,
  p_deadline timestamptz,
  p_note     text
) returns uuid
language plpgsql security definer set search_path = public
as $fn$
declare
  v_company uuid := p_task.company_id;
  v_user    uuid := auth.uid();
  v_new_id  uuid;
  v_from    text;
  v_slot    timestamptz;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select nullif(split_part(coalesce(p.full_name, ''), ' ', 1), '') into v_from
    from profiles p where p.id = p_task.assignee_id;

  -- the same order for a new person; outside the delivery window it waits for the morning (D-38)
  v_slot := next_delivery_slot(v_company, now());
  insert into tasks (company_id, author_id, assignee_id, group_id, parent_task_id, title, body,
                     deadline, priority, status, scheduled_send_at, source, source_audio_path, source_transcript)
  values (v_company, v_user, p_assignee, p_task.group_id, p_task.id, p_title, p_body,
          p_deadline, p_priority,
          case when v_slot is null then 'sent'::task_status else 'scheduled'::task_status end,
          v_slot, p_task.source, p_task.source_audio_path, p_task.source_transcript)
  returning id into v_new_id;

  -- the new person learns where it came from — the name, never the old holder's reason (D-45)
  insert into task_messages (company_id, task_id, sender_id, type, content, meta)
  values (v_company, v_new_id, v_user, 'system',
          'Передана' || coalesce(' от ' || v_from, ''),
          jsonb_build_object('passed_from', p_task.id, 'from_assignee_id', p_task.assignee_id));
  if v_note is not null then
    insert into task_messages (company_id, task_id, sender_id, type, content, meta)
    values (v_company, v_new_id, v_user, 'text', v_note, '{"handoff_note": true}'::jsonb);
    -- the director's word rides in the task's own push, not in a second one
    update notification_deliveries d
       set meta = d.meta || jsonb_build_object('body', coalesce(d.meta->>'body', p_title) || ' · ' || left(v_note, 90))
     where d.task_id = v_new_id and d.event_kind = 'task_sent' and d.status = 'queued';
  end if;

  -- the old one closes with a pointer to where the work went, in its own words
  update tasks set passed_to = p_assignee, status = 'revoked' where id = p_task.id;
  -- …and its holder hears «передана», not «отозвано» (the trigger queued the row a moment ago)
  update notification_deliveries d
     set meta = d.meta || jsonb_build_object('title', 'Задача передана · ' || split_part(p_name, ' ', 1))
   where d.task_id = p_task.id and d.event_kind = 'revoked' and d.status = 'queued'
     and d.created_at >= now();
  insert into task_messages (company_id, task_id, sender_id, type, content, meta)
  values (v_company, p_task.id, v_user, 'system', 'Передана: ' || p_name,
          jsonb_build_object('reassigned_to', v_new_id, 'assignee_id', p_assignee));

  return v_new_id;
end;
$fn$;

revoke execute on function task_handover(tasks, uuid, text, text, text, task_priority, timestamptz, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. «Переназначить»: a deadline and a word for the new person, the truth for the old one
-- ---------------------------------------------------------------------------
create or replace function reassign_task(
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
  v_deadline timestamptz;
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

  v_deadline := case when change_deadline then new_deadline else v_task.deadline end;
  v_new_id := task_handover(v_task, new_assignee_id, v_name, v_task.title, v_task.body, v_task.priority, v_deadline, note);

  v_result := jsonb_build_object('old_task_id', v_task.id, 'new_task_id', v_new_id, 'assignee', v_name,
                                 'scheduled_send_at', (select t.scheduled_send_at from tasks t where t.id = v_new_id),
                                 'deadline', v_deadline);
  if v_crid is not null then
    update ingest_batches set result = v_result
     where company_id = v_company and ingest_batches.client_request_id = v_crid;
  end if;
  return v_result;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. «Изменить задачу»
-- ---------------------------------------------------------------------------
-- The form sends the whole task as it should be: the words and the details always, «срочно» and
-- the deadline when they change (`change_deadline`), another person when one is picked.
-- - closed tasks (`done`, `revoked`) stay history: `invalid_transition`
-- - empty words: `empty_title`; a deadline behind: `deadline_in_past`; before a held task goes
--   out: `deadline_before_send`; a person not of this company or gone: `assignee_not_found`;
--   another person for handed-in work (accept or return it first): `invalid_transition`
-- - nothing changed — nothing is written, `unchanged`
-- - a task held for later (`scheduled`) changes quietly, its person too: nobody has seen it yet
-- - another person — task_handover: the old holder keeps the old words with «передана», the new
--   one gets the new words, deadline and voice
-- - only the deadline — exactly «Срок» (extend_task_deadline)
-- - the words change in place: the task keeps its status (the employee does not accept it
--   again); a line «Текст изменён · было «…»», a deadline line as «Срок» writes it, and one push
--   «Задача изменена» within the delivery window — or none, when the task's first push still
--   waits for the window (it takes the new words), or when an earlier «изменена» still waits
--   (it is rewritten, not chased by a second)
create or replace function edit_task(
  task_id           uuid,
  new_title         text,
  new_body          text default null,
  new_priority      task_priority default null,
  change_deadline   boolean default false,
  new_deadline      timestamptz default null,
  new_assignee_id   uuid default null,
  note              text default null,
  client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid      uuid := client_request_id;
  v_task      tasks%rowtype;
  v_company   uuid := auth_company_id();
  v_user      uuid := auth.uid();
  v_result    jsonb;
  v_title     text := btrim(coalesce(new_title, ''));
  v_body      text := nullif(btrim(coalesce(new_body, '')), '');
  v_priority  task_priority;
  v_deadline  timestamptz;
  v_name      text;
  v_new_id    uuid;
  v_text      boolean;
  v_details   boolean;
  v_urgency   boolean;
  v_date      boolean;
  v_parts     text[] := '{}';
  v_line      text;
  v_label     text;
  v_when      text;
  v_request   boolean;
  v_stricter  boolean;
  v_push      text;
  v_due       text;
  v_handoff   text;
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

  select * into v_task from tasks t where t.id = task_id and t.company_id = v_company for update;
  if not found then
    raise exception 'task_not_found' using errcode = 'P0001';
  end if;
  if v_task.status not in ('scheduled', 'sent', 'accepted', 'in_progress', 'rework', 'pending_review', 'declined') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  if v_title = '' then
    raise exception 'empty_title' using errcode = 'P0001';
  end if;

  v_priority := coalesce(new_priority, v_task.priority);
  v_deadline := case when change_deadline then new_deadline else v_task.deadline end;
  -- the stored words are read as the form shows them: a batch may have kept stray spaces or ''
  v_text     := v_title is distinct from btrim(v_task.title);
  v_details  := v_body is distinct from nullif(btrim(coalesce(v_task.body, '')), '');
  v_urgency  := v_priority is distinct from v_task.priority;
  v_date     := v_deadline is distinct from v_task.deadline;

  -- a deadline that stays as it was is never judged again: an overdue task may still change its words
  if v_date and v_deadline is not null and v_deadline <= now() then
    raise exception 'deadline_in_past' using errcode = 'P0001';
  end if;
  if v_date and v_task.status = 'scheduled' and v_deadline is not null
     and v_task.scheduled_send_at is not null and v_deadline <= v_task.scheduled_send_at then
    raise exception 'deadline_before_send' using errcode = 'P0001';
  end if;

  -- ---- another person ----
  if new_assignee_id is not null and new_assignee_id is distinct from v_task.assignee_id then
    -- handed-in work is judged first: «Принять» or «На доработку», then it may change hands
    if v_task.status = 'pending_review' then
      raise exception 'invalid_transition' using errcode = 'P0001';
    end if;
    select p.full_name into v_name
      from profiles p
     where p.id = new_assignee_id and p.company_id = v_company and p.is_active and p.role <> 'tv';
    if not found then
      raise exception 'assignee_not_found' using errcode = 'P0001';
    end if;

    if v_task.status = 'scheduled' then
      -- nobody has seen it: the same task simply goes to another person when its time comes
      update tasks
         set assignee_id = new_assignee_id, title = v_title, body = v_body, priority = v_priority, deadline = v_deadline
       where id = v_task.id;
      v_result := jsonb_build_object('task_id', v_task.id, 'assignee', v_name, 'deadline', v_deadline, 'moved', true);
    else
      v_new_id := task_handover(v_task, new_assignee_id, v_name, v_title, v_body, v_priority, v_deadline, note);
      v_result := jsonb_build_object('old_task_id', v_task.id, 'new_task_id', v_new_id, 'assignee', v_name,
                                     'scheduled_send_at', (select t.scheduled_send_at from tasks t where t.id = v_new_id),
                                     'deadline', v_deadline);
    end if;

  -- ---- nothing changed ----
  elsif not (v_text or v_details or v_urgency or v_date) then
    v_result := jsonb_build_object('task_id', v_task.id, 'unchanged', true);

  -- ---- held for later: quietly ----
  elsif v_task.status = 'scheduled' then
    update tasks set title = v_title, body = v_body, priority = v_priority, deadline = v_deadline where id = v_task.id;
    v_result := jsonb_build_object('task_id', v_task.id, 'deadline', v_deadline, 'edited', true);

  -- ---- only the date: «Срок» word for word (a refused task has no «Срок»: the way below) ----
  elsif not (v_text or v_details or v_urgency) and v_task.status <> 'declined' then
    v_result := extend_task_deadline(v_task.id, v_deadline, null) || jsonb_build_object('edited', true);

  -- ---- the words, in place ----
  else
    update tasks set title = v_title, body = v_body, priority = v_priority, deadline = v_deadline where id = v_task.id;

    if v_date then
      -- the deadline as «Срок» says it (extend_task_deadline): a waiting request is answered by it
      update task_messages m
         set meta = m.meta || jsonb_build_object('answered_at', to_jsonb(now()), 'answer', 'changed',
                                                 'final_deadline', v_deadline)
       where m.task_id = v_task.id
         and m.meta->>'time_request' = 'true'
         and m.meta->>'answered_at' is null;
      v_request := found;
      v_stricter := v_deadline is not null and (v_task.deadline is null or v_deadline < v_task.deadline);
      v_when := to_char(v_deadline at time zone 'Asia/Aqtobe', 'DD.MM HH24:MI');
      v_label := case
        when v_deadline is null then 'Срок снят'
        when v_request then 'Новый срок: до ' || v_when
        when v_task.deadline is null then 'Назначен срок: до ' || v_when
        when v_stricter then 'Срок перенесён раньше: до ' || v_when
        else 'Срок продлён до ' || v_when
      end;
      insert into task_messages (company_id, task_id, sender_id, type, content, meta)
      values (v_company, v_task.id, v_user, 'system', v_label,
              jsonb_build_object('deadline_changed', true,
                                 'old_deadline', v_task.deadline,
                                 'new_deadline', v_deadline,
                                 'stricter', v_stricter));
    end if;

    -- one line that says what changed, and what the words were
    if v_text and v_details then
      v_parts := v_parts || 'текст и подробности изменены'::text;
    elsif v_text then
      v_parts := v_parts || 'текст изменён'::text;
    elsif v_details then
      v_parts := v_parts || (case when v_task.body is null then 'добавлены подробности'
                                  when v_body is null then 'подробности убраны'
                                  else 'подробности изменены' end)::text;
    end if;
    if v_urgency then
      v_parts := v_parts || (case when v_priority = 'high' then 'отмечена срочной'
                                  when v_task.priority = 'high' then 'больше не срочная'
                                  else 'срочность изменена' end)::text;
    end if;
    if cardinality(v_parts) > 0 then
      v_line := array_to_string(v_parts, ', ');
      v_line := upper(left(v_line, 1)) || substr(v_line, 2);
      if v_text then
        v_line := v_line || ' · было «' || left(v_task.title, 120)
                  || case when char_length(v_task.title) > 120 then '…' else '' end || '»';
      end if;
      insert into task_messages (company_id, task_id, sender_id, type, content, meta)
      values (v_company, v_task.id, v_user, 'system', v_line,
              jsonb_build_object('task_edited', true,
                                 'old_title', v_task.title, 'new_title', v_title,
                                 'old_body', v_task.body, 'new_body', v_body,
                                 'old_priority', v_task.priority, 'new_priority', v_priority));
    end if;

    -- one push. The task's first push still waiting for the window carries the new words itself,
    -- with the director's word of a handover kept in it (task_handover)
    v_due := case when v_deadline > now() then ' · срок ' || push_when(v_deadline) else '' end;
    select m.content into v_handoff
      from task_messages m
     where m.task_id = v_task.id and m.meta->>'handoff_note' = 'true'
     order by m.seq desc limit 1;
    update notification_deliveries d
       set meta = d.meta || jsonb_build_object('body', left(v_title, 120) || v_due || coalesce(' · ' || left(v_handoff, 90), ''))
     where d.task_id = v_task.id and d.user_id = v_task.assignee_id
       and d.event_kind = 'task_sent' and d.status = 'queued';
    if not found then
      v_push := 'Задача изменена'
                || case when not v_date then ''
                        when v_deadline is null then ' · срок снят'
                        else ' · срок ' || push_when(v_deadline) end;
      -- an earlier «изменена» still waiting is rewritten, not chased by a second
      update notification_deliveries d
         set meta = d.meta || jsonb_build_object('title', v_push, 'body', left(v_title, 120))
       where d.task_id = v_task.id and d.user_id = v_task.assignee_id
         and d.event_kind = 'task_edited' and d.status = 'queued';
      if not found then
        insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta, deliver_after)
        values (v_company, v_task.assignee_id, v_task.id, 'task_edited',
                jsonb_build_object('title', v_push, 'body', left(v_title, 120),
                                   'url', '/tasks/' || v_task.id, 'tag', 'task:' || v_task.id),
                coalesce(next_delivery_slot(v_company, now()), now()));
      end if;
    end if;

    v_result := jsonb_build_object('task_id', v_task.id, 'deadline', v_deadline, 'edited', true);
  end if;

  if v_crid is not null then
    update ingest_batches set result = v_result
     where company_id = v_company and ingest_batches.client_request_id = v_crid;
  end if;
  return v_result;
end;
$fn$;

revoke execute on function edit_task(uuid, text, text, task_priority, boolean, timestamptz, uuid, text, uuid) from public, anon;
grant execute on function edit_task(uuid, text, text, task_priority, boolean, timestamptz, uuid, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The deadline is the director's while the task is open — a refused one included
-- ---------------------------------------------------------------------------
-- edit_task gives a refused task a new date before «Настоять» (D-200); everything else as in
-- 20261123120000_deadline_fixes.sql:183
create or replace function tasks_field_guard() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;                                            -- service role / cron
  end if;
  -- every deadline change of the app is a director's RPC on an open task
  -- fails closed: a caller with no role (an inactive profile) is not the director
  if new.deadline is distinct from old.deadline
     and (auth_role() is distinct from 'director'
          or old.status not in ('scheduled', 'sent', 'accepted', 'in_progress', 'rework', 'pending_review', 'declined')) then
    raise exception 'forbidden_field_update' using errcode = 'P0001';
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
     or new.recurrence_on   is distinct from old.recurrence_on
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
