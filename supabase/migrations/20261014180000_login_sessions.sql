-- D-135, second step: a sign-in that was taken away stops working at once.
--
-- Before: «Работает в компании → выкл» made the app's server answer «Аккаунт отключён», but
-- the helpers every policy asks — auth_company_id(), auth_role() — did not look at is_active,
-- so a fired person's phone kept reading the company straight from the base, and its refresh
-- token kept minting new tokens. Pushes addressed to that person (a task, a thread) still went
-- out: only the broadcasts skipped inactive people. And there was no way to sign a lost phone out.
--
-- 1. auth_session_live(): the token's session still exists in auth.sessions. A token without a
--    session_id (pgTAP claims, scripts) counts as live — every token GoTrue mints carries one.
--    auth_company_id() and auth_role() now answer only for a person who works in the company and
--    whose session lives: every company policy and every RPC that asks them closes at once, not
--    when the token expires (up to an hour).
-- 2. profiles_select: one's own row also needs a live session — the server reads it first
--    (getSessionProfile), so a revoked phone gets 401 and lands on the sign-in screen; a fired
--    person with a live session still reads their own row and hears «Аккаунт отключён».
--    Other own-row policies (notes, push devices, read cursors) keep reading with a revoked
--    token until it expires — at most an hour, own rows only.
-- 3. revoke_sessions(user, keep_current, keep_endpoint) — «Выйти со всех устройств»: the
--    sessions are deleted (refresh tokens go with them), push subscriptions removed, open codes
--    cancelled. The person for themselves (and then may keep this phone: «на других
--    устройствах»); the director and the secretary for a person of their company by the rule of
--    the password reset (lib/people/access.ts canResetLogin: a director only by that director).
-- 4. Firing (is_active true → false) does the same by itself — whatever path made the change.

-- ---------------------------------------------------------------------------
-- 1. Live session, and the helpers that ask for it
-- ---------------------------------------------------------------------------
create or replace function auth_session_live() returns boolean
language sql stable security definer set search_path = public
as $fn$
  select coalesce(auth.jwt() ->> 'session_id', '') = ''
      or exists (select 1 from auth.sessions s where s.id = (auth.jwt() ->> 'session_id')::uuid)
$fn$;

create or replace function auth_company_id() returns uuid
language sql stable security definer set search_path = public
as $fn$ select company_id from profiles where id = auth.uid() and is_active and auth_session_live() $fn$;

create or replace function auth_role() returns text
language sql stable security definer set search_path = public
as $fn$ select role::text from profiles where id = auth.uid() and is_active and auth_session_live() $fn$;

-- ---------------------------------------------------------------------------
-- 2. One's own profile row needs a live session too
-- ---------------------------------------------------------------------------
alter policy profiles_select on public.profiles
  using (
    ((company_id = (select auth_company_id())) and ((select auth_role()) <> 'tv'))
    or (id = (select auth.uid()) and (select auth_session_live()))
  );

-- ---------------------------------------------------------------------------
-- 3. «Выйти со всех устройств»
-- ---------------------------------------------------------------------------
create or replace function revoke_sessions(
  p_user_id uuid,
  p_keep_current boolean default false,
  p_keep_endpoint text default null
) returns json
language plpgsql security definer set search_path = public
as $fn$
declare
  v_me       uuid := auth.uid();
  v_role     text;
  v_company  uuid;
  v_target   profiles%rowtype;
  v_keep     uuid;
  v_sessions int;
  v_devices  int;
begin
  select role::text, company_id into v_role, v_company from profiles where id = v_me and is_active;
  select * into v_target from profiles where id = p_user_id;
  if v_company is null or v_target.id is null or v_target.company_id <> v_company then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_me <> p_user_id
     and not (v_role in ('director', 'secretary') and v_target.role::text <> 'director') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  -- «на других устройствах»: the phone that asks keeps its own session and its own pushes
  if p_keep_current and v_me = p_user_id then
    v_keep := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  end if;

  delete from auth.sessions where user_id = p_user_id and (v_keep is null or id <> v_keep);
  get diagnostics v_sessions = row_count;

  delete from push_subscriptions
   where user_id = p_user_id
     and (not (p_keep_current and v_me = p_user_id) or p_keep_endpoint is null or endpoint <> p_keep_endpoint);
  get diagnostics v_devices = row_count;

  update login_codes set cancelled_at = now()
   where user_id = p_user_id and used_at is null and cancelled_at is null;

  return json_build_object('sessions', v_sessions, 'devices', v_devices);
end;
$fn$;

revoke execute on function revoke_sessions(uuid, boolean, text) from public, anon;
grant execute on function revoke_sessions(uuid, boolean, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Firing signs the person out everywhere
-- ---------------------------------------------------------------------------
create or replace function profiles_on_deactivate() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  if old.is_active and not new.is_active then
    delete from auth.sessions where user_id = new.id;
    delete from push_subscriptions where user_id = new.id;
    update login_codes set cancelled_at = now()
     where user_id = new.id and used_at is null and cancelled_at is null;
  end if;
  return null;
end;
$fn$;

create trigger trg_profiles_deactivated
after update of is_active on profiles
for each row execute function profiles_on_deactivate();
