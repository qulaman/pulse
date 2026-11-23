-- «Срок» — three rules of the deadline.
-- 1. extend_task_deadline: a task held for later (`scheduled`) takes a new deadline quietly — the
--    assignee does not see it yet, so no thread line and no push; a time already behind is refused
--    (`deadline_in_past`), and so is one before a held task goes out (`deadline_before_send`); the same
--    deadline again changes nothing and says `unchanged`.
--    Body — 20260926120000_task_lifecycle.sql:418.
-- 2. task_question_answered: a system line of the author (a new deadline, a handover) answers only
--    the open questions about time («Когда срок?»); the author's own words answer every open
--    question. «About time» is the client's WHEN in lib/tasks/answers.ts.
--    Body — 20260926120000_task_lifecycle.sql:599.
-- 3. tasks_field_guard: tasks.deadline changes only by the director, and only on an open task.
--    Body — 20261022120000_recurrence_live.sql:278.

-- ---------------------------------------------------------------------------
-- 1. «Срок»
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
  if v_task.status not in ('scheduled', 'sent', 'accepted', 'in_progress', 'rework', 'pending_review') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  if new_deadline is not null and new_deadline <= now() then
    raise exception 'deadline_in_past' using errcode = 'P0001';
  end if;
  -- a task held for later would reach its person already late
  if v_task.status = 'scheduled' and new_deadline is not null
     and v_task.scheduled_send_at is not null and new_deadline <= v_task.scheduled_send_at then
    raise exception 'deadline_before_send' using errcode = 'P0001';
  end if;

  -- the same deadline again is no news: no line, no push, a waiting request stays waiting
  if new_deadline is not distinct from v_task.deadline then
    v_result := jsonb_build_object('task_id', v_task.id, 'deadline', new_deadline, 'unchanged', true);
    if v_crid is not null then
      update ingest_batches set result = v_result
       where company_id = v_company and ingest_batches.client_request_id = v_crid;
    end if;
    return v_result;
  end if;

  -- a task held for later is not the assignee's yet: the date changes, nobody is told
  if v_task.status = 'scheduled' then
    update tasks set deadline = new_deadline where id = v_task.id;
    v_result := jsonb_build_object('task_id', v_task.id, 'deadline', new_deadline);
    if v_crid is not null then
      update ingest_batches set result = v_result
       where company_id = v_company and ingest_batches.client_request_id = v_crid;
    end if;
    return v_result;
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
-- 2. A system line answers only a question about time
-- ---------------------------------------------------------------------------
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

  -- «Когда срок?» is answered by a new deadline; «Какой формат?» waits for the author's words.
  -- The pattern is WHEN of lib/tasks/answers.ts; word edges are spelled out, as there.
  update task_messages m
     set meta = m.meta || jsonb_build_object('answered_at', to_jsonb(now()))
   where m.task_id = new.task_id
     and coalesce((m.meta->>'is_question')::boolean, false)
     and m.meta->>'answered_at' is null
     and (new.type <> 'system'
          or coalesce(m.content, '') ~* ('^[[:space:]]*(когда|к какому|до какого|на когда)([[:space:]?,.!]|$)'
                                         || '|(^|[[:space:],])срок([[:space:]?,.!]|$)'));

  return null;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. The deadline is the director's, and only while the task is open
-- ---------------------------------------------------------------------------
-- tasks made by a rule are the rule's: nobody but the director rewrites the link
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
          or old.status not in ('scheduled', 'sent', 'accepted', 'in_progress', 'rework', 'pending_review')) then
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
