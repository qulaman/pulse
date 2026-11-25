-- The company boundary, tightened where a signed-in person of one company could reach another
-- (principle 6, D-134: every client lives in one base). The browser talks to PostgREST directly,
-- so each rule stands in SQL, not in a route. Nothing here changes what a legitimate screen does:
-- every caller of what is closed below is a security-definer function, the service role, or none.
--   1. profiles_guard   — the company of a card never changes under a user's token, the
--                         director's own card included; a manager is a person of the same company
--   2. tasks            — an assignee and an author are of the caller's company
--                         (insert and update through PostgREST; the RPCs check this themselves)
--   3. events, errands  — the author of a meeting and the secretary named on a new errand are
--                         of the company (edits and the secretary's moves go through RPCs)
--   4. brand bucket     — not listable: the bucket is public by link, a list told anybody every
--                         company's id
--   5. grants           — Supabase grants every new function to anon and authenticated by name,
--                         so `revoke … from public, anon` left authenticated in. Internal helpers
--                         are closed to clients; RPCs the app calls signed in are closed to anon
--   6. subordinates     — the list is of the caller's company only (the task policies ask it
--                         about the caller, so they read the same rows); grants unchanged

-- ---------------------------------------------------------------------------
-- 1. profiles_guard: the body of 20261104120000_person_contact.sql, plus the company and the manager
-- ---------------------------------------------------------------------------
create or replace function profiles_guard() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    return new;                                            -- service role / cron
  end if;

  -- a card stays in its company whoever edits it: a director moving his own card would become
  -- the director of another company (the ops console moves nothing — it runs as the service role)
  if new.company_id is distinct from old.company_id then
    raise exception 'forbidden_field_update' using errcode = 'P0001';
  end if;
  -- a manager is somebody of the same company
  if new.manager_id is distinct from old.manager_id and new.manager_id is not null
     and not exists (select 1 from profiles m where m.id = new.manager_id and m.company_id = new.company_id) then
    raise exception 'forbidden_field_update' using errcode = 'P0001';
  end if;

  v_role := auth_role();
  if v_role = 'director' then
    return new;
  end if;

  -- the secretary manages the roster: role, activity and manager of anyone but a
  -- director; nobody becomes a director by her hand
  if v_role = 'secretary' and old.id <> auth.uid() then
    if old.role = 'director'
       or new.role = 'director'
       or new.company_id        is distinct from old.company_id
       or new.streak_count      is distinct from old.streak_count
       or new.streak_updated_at is distinct from old.streak_updated_at then
      raise exception 'forbidden_field_update' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if new.role              is distinct from old.role
     or new.company_id     is distinct from old.company_id
     or new.is_active      is distinct from old.is_active
     or new.manager_id     is distinct from old.manager_id
     or new.streak_count   is distinct from old.streak_count
     or new.streak_updated_at is distinct from old.streak_updated_at then
    raise exception 'forbidden_field_update' using errcode = 'P0001';
  end if;

  -- the secretary keeps her own card too (canEditPerson); an employee does not put a picture of
  -- their choosing on the wall through their own row
  if v_role is distinct from 'secretary' and new.avatar_url is distinct from old.avatar_url then
    raise exception 'forbidden_field_update' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. tasks: nobody of another company on a task row written through PostgREST. The app writes
--    tasks only through RPCs (confirm_voice_batch, reassign_task, transition_task …), which run
--    as definer and check the assignee themselves; these policies hold the direct way in
-- ---------------------------------------------------------------------------
alter policy tasks_insert on public.tasks
  with check (
    company_id = (select auth_company_id())
    and author_id = (select auth.uid())
    and (select auth_role()) = any (array['director', 'manager'])
    and (assignee_id is null
         or exists (select 1 from profiles p where p.id = assignee_id and p.company_id = (select auth_company_id())))
  );

alter policy tasks_update on public.tasks
  with check (
    company_id = (select auth_company_id())
    and (assignee_id is null
         or exists (select 1 from profiles p where p.id = assignee_id and p.company_id = (select auth_company_id())))
    and exists (select 1 from profiles p where p.id = author_id and p.company_id = (select auth_company_id()))
  );

-- ---------------------------------------------------------------------------
-- 3. events and errands
-- ---------------------------------------------------------------------------
-- edit_event / delete_event run as definer; a direct update keeps the author in the company
alter policy events_update on public.events
  with check (
    company_id = (select auth_company_id())
    and (select auth_role()) = 'director'
    and exists (select 1 from profiles p where p.id = author_id and p.company_id = (select auth_company_id()))
  );

-- the route inserts only the request itself (taking it is transition_errand's); whoever a row
-- names as the secretary who took it is of the company — the sweep's reminders push that person
alter policy errands_insert on public.errands
  with check (
    company_id = (select auth_company_id())
    and author_id = (select auth.uid())
    and (select auth_role()) = 'director'
    and (claimed_by is null
         or exists (select 1 from profiles p where p.id = claimed_by and p.company_id = (select auth_company_id())))
  );

-- ---------------------------------------------------------------------------
-- 4. The brand bucket: public by link (getPublicUrl, <img>), written and removed only by the
--    server under the service role — a select policy only served listing it
-- ---------------------------------------------------------------------------
drop policy if exists brand_public_read on storage.objects;

-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------
-- internal: called by triggers, ticks and RPCs that run as definer, and by the sweep (service role)
revoke execute on function tv_emit(uuid, text, uuid, uuid, text, integer, text) from public, anon, authenticated;
revoke execute on function tv_events_prune(integer) from public, anon, authenticated;
revoke execute on function task_streak_of(uuid, uuid) from public, anon, authenticated;
revoke execute on function task_sent_at(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function next_delivery_slot(uuid, timestamptz) from public, anon, authenticated;
grant execute on function tv_emit(uuid, text, uuid, uuid, text, integer, text) to service_role;
grant execute on function tv_events_prune(integer) to service_role;
grant execute on function next_delivery_slot(uuid, timestamptz) to service_role;

-- RPCs of a signed-in person: nobody calls them without signing in
revoke execute on function delete_task(uuid) from public, anon;
revoke execute on function purge_closed_tasks() from public, anon;
revoke execute on function extend_task_deadline(uuid, timestamptz, uuid) from public, anon;
revoke execute on function reassign_task(uuid, uuid, uuid, timestamptz, boolean, text) from public, anon;
revoke execute on function nudge_task(uuid, uuid) from public, anon;
revoke execute on function request_deadline(uuid, timestamptz, text, uuid) from public, anon;
revoke execute on function answer_deadline_request(uuid, boolean, uuid) from public, anon;

-- ---------------------------------------------------------------------------
-- 6. subordinates: used by the task and message policies with the caller's own id, so the same
--    rows come back there; asked about somebody of another company — or by nobody — it says
--    nothing. Its grants stay as they are: the policies name no role, so an anon read of tasks
--    evaluates it too, and without EXECUTE that read would fail instead of coming back empty
-- ---------------------------------------------------------------------------
create or replace function subordinates(mgr uuid) returns setof uuid
language sql stable security definer set search_path = public
as $$ select id from profiles where manager_id = mgr and company_id = (select auth_company_id()) $$;
