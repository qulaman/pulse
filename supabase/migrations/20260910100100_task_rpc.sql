-- Task transitions as RPC: the single door for every status change
-- (docs/BACKEND.md section 0.3, section 3, section 7), plus the "Настоять"
-- transition declined -> sent for the director (G.20).

-- ---------------------------------------------------------------------------
-- 1. Status matrix: declined -> sent by the director ("Настоять", G.20).
--    Re-sending re-opens the task, so its closing stamp goes away.
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
  elsif old.status in ('sent','accepted') and new.status = 'declined' then
    ok := uid is null or uid = old.assignee_id;
  elsif old.status = 'accepted' and new.status = 'pending_review' then
    ok := uid is null or uid = old.assignee_id;
  elsif old.status = 'pending_review' and new.status in ('done','rework') then
    ok := uid is null or urole = 'director';
  elsif old.status = 'rework' and new.status = 'accepted' then
    ok := uid is null or uid = old.assignee_id;
  elsif old.status = 'declined' and new.status = 'sent' then
    ok := uid is null or urole = 'director';               -- "Настоять" (G.20)
  elsif new.status = 'revoked' and old.status not in ('done','declined','revoked') then
    ok := uid is null or urole = 'director';
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
-- 2. transition_task -- every status change goes through here.
--    RLS does not apply inside a security definer function, so the right to
--    make this particular transition is checked by trg_task_status_guard,
--    which reads auth.uid() / auth_role() of the caller.
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
  v_reason  text := nullif(payload->>'reason', '');
  v_comment text := nullif(payload->>'comment', '');
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

  update tasks t set status = to_status
   where t.id = v_task and t.company_id = v_company
  returning t.status, t.author_id into v_status, v_author;

  if not found then
    raise exception 'task_not_found' using errcode = 'P0001';
  end if;

  -- the reason of "Не могу" / the comment of a rework becomes a visible message
  if v_reason is not null then
    insert into task_messages (company_id, task_id, sender_id, type, content, meta)
    values (v_company, v_task, coalesce(v_user, v_author), 'text', v_reason,
            '{"decline_reason": true}'::jsonb);
  elsif v_comment is not null then
    insert into task_messages (company_id, task_id, sender_id, type, content, meta)
    values (v_company, v_task, coalesce(v_user, v_author), 'text', v_comment,
            '{"rework_comment": true}'::jsonb);
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
-- 3. revoke_task (D-01) -- director only. A task still in `scheduled` was
--    delivered to nobody, so it is deleted outright; anything else is revoked
--    and stays visible to the assignee as "отозвано директором".
-- ---------------------------------------------------------------------------
create or replace function revoke_task(
  task_id uuid,
  client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid    uuid := client_request_id;
  v_task    uuid := task_id;
  v_company uuid := auth_company_id();
  v_user    uuid := auth.uid();
  v_result  jsonb;
  v_status  task_status;
  v_action  text;
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

  select t.status into v_status
    from tasks t
   where t.id = v_task and t.company_id = v_company;

  if not found then
    raise exception 'task_not_found' using errcode = 'P0001';
  end if;

  if v_status = 'scheduled' then
    delete from tasks t where t.id = v_task;
    v_action := 'deleted';
  else
    update tasks t set status = 'revoked' where t.id = v_task;  -- guard checks terminality
    v_action := 'revoked';
  end if;

  v_result := jsonb_build_object('task_id', v_task, 'action', v_action);

  if v_crid is not null then
    update ingest_batches b set result = v_result
     where b.company_id = v_company and b.client_request_id = v_crid;
  end if;

  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Grants: signed-in users only. execute is granted to PUBLIC by default,
--    so it has to be revoked before the grant means anything.
-- ---------------------------------------------------------------------------
revoke execute on function confirm_voice_batch(jsonb, uuid, timestamptz) from public, anon;
revoke execute on function transition_task(uuid, task_status, jsonb, uuid)  from public, anon;
revoke execute on function revoke_task(uuid, uuid)                          from public, anon;

grant execute on function confirm_voice_batch(jsonb, uuid, timestamptz) to authenticated, service_role;
grant execute on function transition_task(uuid, task_status, jsonb, uuid)  to authenticated, service_role;
grant execute on function revoke_task(uuid, uuid)                          to authenticated, service_role;
