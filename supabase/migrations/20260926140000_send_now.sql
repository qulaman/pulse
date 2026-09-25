-- D-129: «отправить сейчас» after the fact.
--
-- Outside the delivery window (D-38) a task waits as `scheduled` and every word to the team
-- waits in the outbox with `deliver_after` = the window's opening (D-51 §2, D-114). The
-- director could choose «now» only on the board, before the batch left; once a task was
-- «Отправлю позже» or a message «отправлю в 08:00», nothing brought it forward — a night task
-- that turned out urgent waited for the morning anyway. And the board's «отправить сейчас»
-- sent the tasks of the batch but not its announcement: that one still waited.
--
-- 1. task_status_guard: `scheduled -> sent` is the tick's and now also the director's move.
--    Body of 20260910130000_declined_revoke.sql; one line changes.
-- 2. send_task_now(task_id, client_request_id): one move for a task — a held task goes out,
--    and whatever this task queued for the morning to the team (a message, «Доработать»,
--    «Настоять», a new deadline, «Принято», a recall) leaves now. The director's own held
--    pushes («Не беспокоить», a digest, D-114) are the director's settings and stay.
-- 3. send_announcements_now(announcement_ids, client_request_id): the same for the Эфир —
--    the board's «отправить сейчас» for the batch's announcement, the Эфир card for one
--    announcement dictated at night.

-- ---------------------------------------------------------------------------
-- 1. The guard: the director may send a held task now
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
    ok := uid is null or urole = 'director';               -- the tick, or «Отправить сейчас» (D-129)
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
-- 2. A task: the held task and its held words leave now
-- ---------------------------------------------------------------------------
create or replace function send_task_now(
  task_id uuid,
  client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid     uuid := client_request_id;      -- the parameters shadow column names
  v_task     uuid := task_id;
  v_company  uuid := auth_company_id();
  v_user     uuid := auth.uid();
  v_status   task_status;
  v_released int := 0;
  v_result   jsonb;
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
   where t.id = v_task and t.company_id = v_company
   for update;

  if not found then
    raise exception 'task_not_found' using errcode = 'P0001';
  end if;

  -- a held task goes out: the outbox trigger queues `task_sent` without a wait (the producer
  -- chose the moment), tv_events tells the wall; the moment it left is now, not the morning
  if v_status = 'scheduled' then
    update tasks t set status = 'sent', scheduled_send_at = now() where t.id = v_task;
    v_status := 'sent';
  end if;

  -- what this task queued for the morning to the team leaves with it
  update notification_deliveries d
     set deliver_after = now()
   where d.task_id = v_task
     and d.company_id = v_company
     and d.status = 'queued'
     and d.deliver_after > now()
     and not exists (select 1 from profiles p where p.id = d.user_id and p.role = 'director');
  get diagnostics v_released = row_count;

  v_result := jsonb_build_object('task_id', v_task, 'status', v_status, 'released', v_released);

  if v_crid is not null then
    update ingest_batches b set result = v_result
     where b.company_id = v_company and b.client_request_id = v_crid;
  end if;

  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;

revoke execute on function send_task_now(uuid, uuid) from public, anon;
grant execute on function send_task_now(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Announcements: their held pushes leave now
-- ---------------------------------------------------------------------------
create or replace function send_announcements_now(
  announcement_ids uuid[],
  client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid     uuid := client_request_id;
  v_ids      text[] := (select array_agg(a::text) from unnest(announcement_ids) a);
  v_company  uuid := auth_company_id();
  v_user     uuid := auth.uid();
  v_released int := 0;
  v_result   jsonb;
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

  update notification_deliveries d
     set deliver_after = now()
   where d.company_id = v_company
     and d.event_kind = 'announcement'
     and d.status = 'queued'
     and d.deliver_after > now()
     and d.meta->>'announcement_id' = any (coalesce(v_ids, '{}'))
     and not exists (select 1 from profiles p where p.id = d.user_id and p.role = 'director');
  get diagnostics v_released = row_count;

  v_result := jsonb_build_object('released', v_released);

  if v_crid is not null then
    update ingest_batches b set result = v_result
     where b.company_id = v_company and b.client_request_id = v_crid;
  end if;

  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;

revoke execute on function send_announcements_now(uuid[], uuid) from public, anon;
grant execute on function send_announcements_now(uuid[], uuid) to authenticated;
