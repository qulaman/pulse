-- D-104: the secretary runs the company's settings and roster next to the director.
--   1. update_company_settings / update_company_profile: director or secretary
--   2. profiles: a secretary edits any row of her company but a director's and never
--      makes anyone a director (policy + guard); on her own row role, activity and
--      manager stay locked, so she can neither climb nor lock herself out
-- Logins (password, email) are the admin API's job — the route checks the same rules
-- (lib/people/access.ts), the database is not involved.

-- ---------------------------------------------------------------------------
-- 1. company settings and name
-- ---------------------------------------------------------------------------
create or replace function update_company_settings(patch jsonb) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_company  uuid := auth_company_id();
  v_settings jsonb;
begin
  if coalesce(auth_role(), '') not in ('director', 'secretary') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  update companies c set settings = c.settings || coalesce(patch, '{}'::jsonb)
   where c.id = v_company
  returning c.settings into v_settings;
  return coalesce(v_settings, '{}'::jsonb);
end;
$fn$;

create or replace function update_company_profile(p_name text) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_company uuid := auth_company_id();
  v_name    text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if coalesce(auth_role(), '') not in ('director', 'secretary') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_name is null or length(v_name) > 120 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  update companies set name = v_name where id = v_company;
  return jsonb_build_object('name', v_name);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. profiles
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

  return new;
end;
$$;

-- a director's row is out of reach (USING), and no row leaves as a director's (WITH CHECK)
create policy profiles_update_secretary on profiles for update
  using (company_id = auth_company_id() and auth_role() = 'secretary' and role <> 'director')
  with check (company_id = auth_company_id() and auth_role() = 'secretary' and role <> 'director');
