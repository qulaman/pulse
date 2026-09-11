-- Two director actions the spec promised on «Требует вас» (docs/FRONTEND.md, declined /
-- overdue rows) and the assistant now offers in the briefing:
--   extend_task_deadline — «Продлить»: a new deadline on an open task, a system line in
--                          the thread, a push to the assignee («Срок продлён»);
--   reassign_task        — «Переназначить»: the task is cloned to another person as a fresh
--                          `sent` task (the outbox trigger notifies them), the old one is
--                          revoked with a system line pointing at the new one (D-01: an
--                          edit is revoke + new).
-- Both are security definer RPCs (principle 7: multi-table = one function), director-only,
-- idempotent through ingest_batches like transition_task / revoke_task.

create or replace function extend_task_deadline(
  task_id uuid,
  new_deadline timestamptz,
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
  v_label   text;
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

  update tasks set deadline = new_deadline where id = v_task.id;

  -- «Срок продлён до 12.09 13:00» / «Срок снят» — the thread keeps the change, Aqtobe wall time
  v_label := case
    when new_deadline is null then 'Срок снят'
    else 'Срок продлён до ' || to_char(new_deadline at time zone 'Asia/Aqtobe', 'DD.MM HH24:MI')
  end;
  insert into task_messages (company_id, task_id, sender_id, type, content, meta)
  values (v_company, v_task.id, v_user, 'system', v_label,
          jsonb_build_object('deadline_changed', true,
                             'old_deadline', v_task.deadline,
                             'new_deadline', new_deadline));

  if new_deadline is not null then
    insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta)
    values (v_company, v_task.assignee_id, v_task.id, 'deadline_extended',
            jsonb_build_object('title', v_label, 'body', left(v_task.title, 120), 'url', '/tasks/' || v_task.id));
  end if;

  v_result := jsonb_build_object('task_id', v_task.id, 'deadline', new_deadline);
  if v_crid is not null then
    update ingest_batches set result = v_result
     where company_id = v_company and ingest_batches.client_request_id = v_crid;
  end if;
  return v_result;
end;
$fn$;

create or replace function reassign_task(
  task_id uuid,
  new_assignee_id uuid,
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
  v_new_id   uuid;
  v_name     text;
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

  select p.full_name into v_name
    from profiles p
   where p.id = new_assignee_id and p.company_id = v_company and p.is_active and p.role <> 'tv';
  if not found then
    raise exception 'assignee_not_found' using errcode = 'P0001';
  end if;

  -- the same order for a new person: a fresh `sent` task, the outbox trigger tells them
  insert into tasks (company_id, author_id, assignee_id, group_id, parent_task_id, title, body,
                     deadline, priority, status, source, source_audio_path, source_transcript)
  values (v_company, v_user, new_assignee_id, v_task.group_id, v_task.id, v_task.title, v_task.body,
          v_task.deadline, v_task.priority, 'sent', v_task.source, v_task.source_audio_path, v_task.source_transcript)
  returning id into v_new_id;

  -- the old one closes with a pointer to where the work went
  update tasks set status = 'revoked' where id = v_task.id;
  insert into task_messages (company_id, task_id, sender_id, type, content, meta)
  values (v_company, v_task.id, v_user, 'system', 'Переназначено: ' || v_name,
          jsonb_build_object('reassigned_to', v_new_id, 'assignee_id', new_assignee_id));

  v_result := jsonb_build_object('old_task_id', v_task.id, 'new_task_id', v_new_id, 'assignee', v_name);
  if v_crid is not null then
    update ingest_batches set result = v_result
     where company_id = v_company and ingest_batches.client_request_id = v_crid;
  end if;
  return v_result;
end;
$fn$;

grant execute on function extend_task_deadline(uuid, timestamptz, uuid) to authenticated, service_role;
grant execute on function reassign_task(uuid, uuid, uuid)              to authenticated, service_role;
