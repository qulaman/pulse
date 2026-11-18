-- D-182: a wall joins its company without a keyboard. The TV opens /tv-connect and shows six
-- digits; the director types them on the remote («Подключить экран»); the TV's next poll gets a
-- session of the company's kiosk user (role `tv`), minted the way a code sign-in mints one
-- (D-135, app/api/auth/code). The old way stays: an 8-digit login code typed on the TV.
--
-- 1. tv_pairings — one row per code on a screen. The screen is nobody: the row has no company
--    until a director confirms it, and the director's own company is what it gets. Kept: an HMAC
--    of the code (the server's key, lib/login-code/server.ts), a SHA-256 of the screen's secret
--    (256 random bits in an httpOnly cookie of that one browser — the session goes only to it),
--    the hashed address (the limit on issuing), the device label. A code lives 10 minutes and
--    works once; an open code is unique across the base. Clients never read or write the table —
--    no policies; the server reaches it through the functions below.
-- 2. tv_pair_attempts — the director's confirmations, for the limit: 5 misses in 10 minutes.
-- 3. tv_pair_issue / tv_pair_poll / tv_pair_release — service role only: the screen has no
--    session. tv_pair_confirm — the director under his own token: the role and the company come
--    from auth_role() / auth_company_id(), never from the caller.
-- Cleanup without pg_cron: issuing drops expired open codes and day-old rows, confirming drops
-- day-old attempts.

-- ---------------------------------------------------------------------------
-- 1. Codes on screens
-- ---------------------------------------------------------------------------
create table tv_pairings (
  id                 uuid primary key default gen_random_uuid(),
  code_hash          text not null,
  secret_hash        text not null,
  ip_hash            text not null,
  device             text,
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null,
  cancelled_at       timestamptz,
  company_id         uuid references companies(id) on delete cascade,
  tv_user_id         uuid references profiles(id) on delete cascade,
  confirmed_by       uuid references profiles(id) on delete cascade,
  confirmed_at       timestamptz,
  confirm_request_id uuid,
  claimed_at         timestamptz,
  -- a confirmation names everything at once: the company, its screen and the director
  constraint tv_pairings_confirmed check (
    (confirmed_at is null and company_id is null and tv_user_id is null and confirmed_by is null)
    or (confirmed_at is not null and company_id is not null and tv_user_id is not null and confirmed_by is not null)
  ),
  constraint tv_pairings_claimed check (claimed_at is null or confirmed_at is not null)
);

comment on table tv_pairings is 'codes on walls waiting for the director (D-182): HMAC of the code, hash of the screen''s cookie secret; 10 minutes, once; service role and tv_pair_confirm only';
comment on column tv_pairings.secret_hash is 'SHA-256 of the random secret in the httpOnly cookie of the browser that shows the code: only it gets the session';
comment on column tv_pairings.claimed_at is 'the screen picked the session up; the same screen may ask again for two minutes (a lost answer)';

-- an open code is unique across the whole base: the code alone finds the screen
create unique index tv_pairings_open_code on tv_pairings (code_hash) where confirmed_at is null and cancelled_at is null;
create unique index tv_pairings_secret on tv_pairings (secret_hash);
create unique index tv_pairings_confirm_request on tv_pairings (confirm_request_id) where confirm_request_id is not null;
create index tv_pairings_ip on tv_pairings (ip_hash, created_at);
create index tv_pairings_created on tv_pairings (created_at);
create index tv_pairings_company on tv_pairings (company_id) where company_id is not null;
create index tv_pairings_tv_user on tv_pairings (tv_user_id) where tv_user_id is not null;
create index tv_pairings_confirmed_by on tv_pairings (confirmed_by) where confirmed_by is not null;

alter table tv_pairings enable row level security;
-- no policies: no client role reads or writes codes

-- ---------------------------------------------------------------------------
-- 2. The director's attempts, for the limit
-- ---------------------------------------------------------------------------
create table tv_pair_attempts (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  user_id uuid not null references profiles(id) on delete cascade,
  ok      boolean not null
);

comment on table tv_pair_attempts is 'confirmations of wall codes (D-182): 5 misses in 10 minutes per person; kept a day';

create index tv_pair_attempts_user on tv_pair_attempts (user_id, at) where not ok;
create index tv_pair_attempts_at on tv_pair_attempts (at);

alter table tv_pair_attempts enable row level security;

revoke all on table tv_pairings, tv_pair_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Functions
-- ---------------------------------------------------------------------------

-- A code for a screen. The same browser asking again (a reload, a code that ran out) cancels
-- its previous open code — unless that one is confirmed and not yet picked up: then the screen
-- polls instead ('confirmed'). Limits: 20 codes in 10 minutes from one address, 1000 open codes
-- in the whole base (a typo then has nothing to land on). An open code with the same hash →
-- 'collision', the server draws another one.
create or replace function tv_pair_issue(
  p_code_hash text,
  p_secret_hash text,
  p_ip_hash text,
  p_device text default null,
  p_prev_secret_hash text default null,
  p_ttl_seconds int default 600
) returns json
language plpgsql security definer set search_path = public
as $fn$
declare
  v_id      uuid;
  v_expires timestamptz;
  v_count   int;
  v_oldest  timestamptz;
begin
  if coalesce(p_code_hash, '') = '' or coalesce(p_secret_hash, '') = '' or coalesce(p_ip_hash, '') = '' then
    raise exception 'bad_input' using errcode = 'P0001';
  end if;
  if p_ttl_seconds < 60 or p_ttl_seconds > 1800 then
    raise exception 'bad_ttl' using errcode = 'P0001';
  end if;

  if p_prev_secret_hash is not null and exists (
    select 1 from tv_pairings
     where secret_hash = p_prev_secret_hash and confirmed_at is not null and claimed_at is null
       and confirmed_at > now() - interval '30 minutes') then
    return json_build_object('ok', false, 'error', 'confirmed');
  end if;

  -- housekeeping: an expired open code still holds its hash in the unique index
  delete from tv_pairings
   where (confirmed_at is null and expires_at <= now())
      or created_at < now() - interval '1 day';

  select count(*) into v_count from tv_pairings
   where ip_hash = p_ip_hash and created_at > now() - interval '10 minutes';
  if v_count >= 20 then
    select created_at into v_oldest from tv_pairings
     where ip_hash = p_ip_hash and created_at > now() - interval '10 minutes'
     order by created_at desc offset 19 limit 1;
    return json_build_object('ok', false, 'error', 'too_many',
      'retry_after', greatest(1, ceil(extract(epoch from (v_oldest + interval '10 minutes' - now()))))::int);
  end if;

  if (select count(*) from tv_pairings
       where confirmed_at is null and cancelled_at is null and expires_at > now()) >= 1000 then
    return json_build_object('ok', false, 'error', 'busy', 'retry_after', 60);
  end if;

  if p_prev_secret_hash is not null then
    update tv_pairings set cancelled_at = now()
     where secret_hash = p_prev_secret_hash and confirmed_at is null and cancelled_at is null;
  end if;

  begin
    insert into tv_pairings (code_hash, secret_hash, ip_hash, device, expires_at)
    values (p_code_hash, p_secret_hash, p_ip_hash, left(p_device, 40), now() + make_interval(secs => p_ttl_seconds))
    returning id, expires_at into v_id, v_expires;
  exception when unique_violation then
    raise exception 'collision' using errcode = 'P0001';
  end;

  return json_build_object('ok', true, 'id', v_id, 'expires_at', v_expires, 'expires_in', p_ttl_seconds);
end;
$fn$;

-- The screen asks by its secret. 'waiting' (with the seconds left by the base's clock — a TV's
-- clock may be off), 'expired', 'gone' (cancelled, unknown, or picked up long ago), or
-- 'confirmed' with the kiosk user to mint the session for. Picked up once: the same secret
-- asking again within two minutes gets it again (the answer was lost on the way); a confirmation
-- older than 30 minutes, a screen or a director that no longer works give nothing.
create or replace function tv_pair_poll(p_secret_hash text) returns json
language plpgsql security definer set search_path = public
as $fn$
declare
  v_row tv_pairings%rowtype;
begin
  select * into v_row from tv_pairings where secret_hash = p_secret_hash;
  if not found or v_row.cancelled_at is not null then
    return json_build_object('state', 'gone');
  end if;

  if v_row.confirmed_at is not null then
    if v_row.confirmed_at <= now() - interval '30 minutes'
       or (v_row.claimed_at is not null and v_row.claimed_at <= now() - interval '2 minutes')
       or not exists (select 1 from profiles p
                       where p.id = v_row.tv_user_id and p.company_id = v_row.company_id
                         and p.role = 'tv' and p.is_active)
       or not exists (select 1 from profiles p
                       where p.id = v_row.confirmed_by and p.company_id = v_row.company_id
                         and p.role = 'director' and p.is_active) then
      return json_build_object('state', 'gone');
    end if;
    update tv_pairings set claimed_at = coalesce(claimed_at, now()) where id = v_row.id;
    return json_build_object('state', 'confirmed', 'id', v_row.id,
      'user_id', v_row.tv_user_id, 'company_id', v_row.company_id);
  end if;

  if v_row.expires_at <= now() then
    return json_build_object('state', 'expired');
  end if;
  return json_build_object('state', 'waiting', 'id', v_row.id,
    'expires_in', greatest(0, ceil(extract(epoch from (v_row.expires_at - now()))))::int);
end;
$fn$;

-- The session could not be minted after the pick-up: the screen's next poll tries again.
create or replace function tv_pair_release(p_id uuid) returns void
language sql security definer set search_path = public
as $fn$
  update tv_pairings set claimed_at = null where id = p_id and confirmed_at is not null;
$fn$;

-- The director confirms a code from the wall: the wall becomes his company's screen. Only a
-- working director with a live session (auth_role / auth_company_id); the screen is the one
-- named (a working kiosk of HIS company) or the company's only one — several and none named →
-- 'which_screen', none at all → 'no_screen'. Five misses in ten minutes close it for the person
-- ('too_many' with the seconds to wait). The code is taken in one statement (two phones with
-- the same code — one wins) and works once. The same request again returns the first result
-- (principle 7).
create or replace function tv_pair_confirm(
  p_code_hash text,
  p_request_id uuid,
  p_screen_id uuid default null
) returns json
language plpgsql security definer set search_path = public
as $fn$
declare
  v_me      uuid := auth.uid();
  v_company uuid := auth_company_id();
  v_role    text := auth_role();
  v_screen  uuid;
  v_screens int;
  v_row     tv_pairings%rowtype;
  v_ok      boolean;
  v_misses  int;
  v_fifth   timestamptz;
begin
  if v_me is null or v_company is null or v_role is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_request_id is null or coalesce(p_code_hash, '') = '' then
    raise exception 'bad_input' using errcode = 'P0001';
  end if;

  select * into v_row from tv_pairings where confirm_request_id = p_request_id;
  if found then
    if v_row.confirmed_by = v_me then
      return json_build_object('ok', true, 'duplicate', true,
        'screen', (select full_name from profiles where id = v_row.tv_user_id), 'device', v_row.device);
    end if;
    return json_build_object('ok', false, 'error', 'bad_code');
  end if;

  if p_screen_id is not null then
    select id into v_screen from profiles
     where id = p_screen_id and company_id = v_company and role = 'tv' and is_active;
    if v_screen is null then
      return json_build_object('ok', false, 'error', 'no_screen');
    end if;
  else
    select count(*) into v_screens from profiles where company_id = v_company and role = 'tv' and is_active;
    if v_screens = 0 then
      return json_build_object('ok', false, 'error', 'no_screen');
    elsif v_screens > 1 then
      return json_build_object('ok', false, 'error', 'which_screen');
    end if;
    select id into v_screen from profiles where company_id = v_company and role = 'tv' and is_active;
  end if;

  -- confirming is rare and human: the place to forget old attempts
  delete from tv_pair_attempts where at < now() - interval '1 day';

  select count(*) into v_misses from tv_pair_attempts
   where user_id = v_me and not ok and at > now() - interval '10 minutes';
  if v_misses >= 5 then
    select at into v_fifth from tv_pair_attempts
     where user_id = v_me and not ok and at > now() - interval '10 minutes'
     order by at desc offset 4 limit 1;
    return json_build_object('ok', false, 'error', 'too_many',
      'retry_after', greatest(1, ceil(extract(epoch from (v_fifth + interval '10 minutes' - now()))))::int);
  end if;

  update tv_pairings
     set confirmed_at = now(), confirmed_by = v_me, company_id = v_company, tv_user_id = v_screen,
         confirm_request_id = p_request_id
   where code_hash = p_code_hash and confirmed_at is null and cancelled_at is null and expires_at > now()
  returning * into v_row;
  v_ok := found;

  insert into tv_pair_attempts (user_id, ok) values (v_me, v_ok);

  if not v_ok then
    return json_build_object('ok', false, 'error', 'bad_code');
  end if;
  return json_build_object('ok', true, 'duplicate', false,
    'screen', (select full_name from profiles where id = v_screen), 'device', v_row.device);
end;
$fn$;

revoke execute on function tv_pair_issue(text, text, text, text, text, int) from public, anon, authenticated;
revoke execute on function tv_pair_poll(text) from public, anon, authenticated;
revoke execute on function tv_pair_release(uuid) from public, anon, authenticated;
revoke execute on function tv_pair_confirm(text, uuid, uuid) from public, anon;

grant execute on function tv_pair_issue(text, text, text, text, text, int) to service_role;
grant execute on function tv_pair_poll(text) to service_role;
grant execute on function tv_pair_release(uuid) to service_role;
grant execute on function tv_pair_confirm(text, uuid, uuid) to authenticated, service_role;
