-- "Отменить" on a declined task (CONCEPT §4: Переназначить / Отменить / Настоять)
-- is a revoke by the director. The guard used to treat declined as terminal for
-- revoke, so the button of task 010 answered 409. Only done and revoked stay final.

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
