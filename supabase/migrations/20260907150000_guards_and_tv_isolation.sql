-- Tightening after the review of task 005:
--   1. profiles_guard: service role bypasses; system-owned fields are protected too
--   2. tv role reads nothing but its own profile row (docs/DATABASE.md RLS matrix)
--   3. tasks: a non-director who is not the author may change nothing but the status
--   4. status guard stamps accepted_at / completed_at / closed_at itself — clients
--      cannot pre-date a stamp to farm the fast-accept bonus

-- ---------------------------------------------------------------------------
-- 1. profiles_guard
-- ---------------------------------------------------------------------------
create or replace function profiles_guard() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;                                            -- service role / cron
  end if;

  if auth_role() is distinct from 'director' then
    if new.role              is distinct from old.role
       or new.company_id     is distinct from old.company_id
       or new.is_active      is distinct from old.is_active
       or new.manager_id     is distinct from old.manager_id
       or new.streak_count   is distinct from old.streak_count
       or new.streak_updated_at is distinct from old.streak_updated_at then
      raise exception 'forbidden_field_update' using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. tv isolation: the kiosk user sees only its own profile row (for the role
--    guard of the /tv layout) and no company row at all
-- ---------------------------------------------------------------------------
drop policy companies_select on companies;
create policy companies_select on companies for select
  using (id = auth_company_id() and auth_role() <> 'tv');

drop policy profiles_select on profiles;
create policy profiles_select on profiles for select
  using (
    (company_id = auth_company_id() and auth_role() <> 'tv')
    or id = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 3. tasks field guard.
-- Trigger order is alphabetical: trg_task_status_guard runs before
-- trg_tasks_field_guard, so by the time this fires the stamps have already been
-- set by the status guard for a legal transition.
-- ---------------------------------------------------------------------------
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

create trigger trg_tasks_field_guard
  before update on tasks
  for each row execute function tasks_field_guard();

-- ---------------------------------------------------------------------------
-- 4. status guard: stamps are always set by the transition, never taken from
--    the client. accepted_at survives rework -> accepted (first acceptance).
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

  return new;
end;
$fn$;
