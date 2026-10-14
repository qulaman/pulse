-- D-135: an employee signs in with a one-time code from the director or the secretary
-- (closes D-06). No PIN, no SMS, no email needed: the code says who the person is and which
-- company (D-134: one base for every client), so nobody picks a company.
--
-- 1. companies.slug — the company's address in a link (`/c/<slug>`): the QR of an issued code
--    opens the sign-in screen in the company's brand. Set by provisioning (seed:client).
-- 2. login_codes — one-time codes. Only an HMAC of the code is kept (8 digits would be
--    brute-forced from a plain hash in seconds); 15 minutes, once; a new code for a person
--    cancels the previous one. Clients never read or write it — no policies; the server issues,
--    redeems and reads statuses with the service role through the functions below.
-- 3. login_attempts — redemption attempts for the rate limits: per address, per device and
--    across the whole base (the codes of every company sit in one pool).
-- 4. issue_login_code / redeem_login_code / release_login_code — service_role only.

-- ---------------------------------------------------------------------------
-- 1. The company's address
-- ---------------------------------------------------------------------------
alter table companies add column if not exists slug text;
alter table companies add constraint companies_slug_format check (slug is null or slug ~ '^[a-z0-9-]{2,40}$');
create unique index if not exists companies_slug_key on companies (slug) where slug is not null;
comment on column companies.slug is 'address in a link /c/<slug> (D-135): the sign-in screen in the company''s brand';

-- ---------------------------------------------------------------------------
-- 2. One-time codes
-- ---------------------------------------------------------------------------
create table login_codes (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies(id) on delete cascade,
  user_id           uuid not null references profiles(id) on delete cascade,
  issued_by         uuid not null references profiles(id) on delete cascade,
  code_hash         text not null,
  issued_at         timestamptz not null default now(),
  expires_at        timestamptz not null,
  issue_request_id  uuid,
  used_at           timestamptz,
  cancelled_at      timestamptz,
  redeem_request_id uuid,
  used_device       text
);

comment on table login_codes is 'one-time sign-in codes (D-135): HMAC only, 15 minutes, once; service role only';
comment on column login_codes.used_device is 'what signed in: iPhone / Android / компьютер — shown on the person''s card';

-- an open code's hash is unique across the whole base: the code alone finds the person
create unique index login_codes_open_hash on login_codes (code_hash) where used_at is null and cancelled_at is null;
create unique index login_codes_issue_request on login_codes (issue_request_id) where issue_request_id is not null;
create index login_codes_user on login_codes (user_id, issued_at desc);
create index login_codes_issued_by on login_codes (issued_by);
create index login_codes_company_open on login_codes (company_id) where used_at is null and cancelled_at is null;
create index login_codes_issued_at on login_codes (issued_at);

alter table login_codes enable row level security;
-- no policies: no client role reads or writes codes

-- ---------------------------------------------------------------------------
-- 3. Attempts, for the limits
-- ---------------------------------------------------------------------------
create table login_attempts (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  ip_hash text not null,
  device  text,
  ok      boolean not null
);

comment on table login_attempts is 'sign-in code attempts (D-135): limits per address, per device and across the base; kept a day';

create index login_attempts_at on login_attempts (at) where not ok;
create index login_attempts_ip on login_attempts (ip_hash, at) where not ok;
create index login_attempts_device on login_attempts (device, at) where not ok and device is not null;
create index login_attempts_all_at on login_attempts (at);

alter table login_attempts enable row level security;

revoke all on table login_codes, login_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Functions
-- ---------------------------------------------------------------------------

-- Issue a code for a person. The caller (the server) has checked who may issue for whom
-- (lib/people/access.ts canResetLogin, or the person for themselves); here: both in one
-- company, the person works there, at most 30 open codes per company. The previous open code
-- of the person is cancelled. An open code with the same hash elsewhere → 'collision', the
-- server draws another code; the same issue_request_id again → 'duplicate' (a double tap: the
-- first answer holds the code, nothing new is made).
create or replace function issue_login_code(
  p_user_id uuid,
  p_issued_by uuid,
  p_code_hash text,
  p_ttl_seconds int default 900,
  p_request_id uuid default null
) returns json
language plpgsql security definer set search_path = public
as $fn$
declare
  v_company uuid;
  v_active  boolean;
  v_id      uuid;
  v_expires timestamptz;
begin
  if p_request_id is not null and exists (select 1 from login_codes where issue_request_id = p_request_id) then
    raise exception 'duplicate' using errcode = 'P0001';
  end if;

  select company_id, is_active into v_company, v_active from profiles where id = p_user_id;
  if v_company is null
     or not exists (select 1 from profiles where id = p_issued_by and company_id = v_company and is_active) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not v_active then
    raise exception 'inactive' using errcode = 'P0001';
  end if;
  if p_ttl_seconds < 60 or p_ttl_seconds > 86400 then
    raise exception 'bad_ttl' using errcode = 'P0001';
  end if;

  -- issuing is rare and human: the place to forget old rows
  delete from login_attempts where at < now() - interval '1 day';
  delete from login_codes where issued_at < now() - interval '30 days';

  -- an expired open code still holds its hash in the unique index
  update login_codes set cancelled_at = now()
   where used_at is null and cancelled_at is null and expires_at <= now()
     and (code_hash = p_code_hash or user_id = p_user_id);

  if (select count(*) from login_codes
       where company_id = v_company and used_at is null and cancelled_at is null
         and expires_at > now() and user_id <> p_user_id) >= 30 then
    raise exception 'too_many_codes' using errcode = 'P0001';
  end if;

  update login_codes set cancelled_at = now()
   where user_id = p_user_id and used_at is null and cancelled_at is null;

  begin
    insert into login_codes (company_id, user_id, issued_by, code_hash, expires_at, issue_request_id)
    values (v_company, p_user_id, p_issued_by, p_code_hash, now() + make_interval(secs => p_ttl_seconds), p_request_id)
    returning id, expires_at into v_id, v_expires;
  exception when unique_violation then
    raise exception 'collision' using errcode = 'P0001';
  end;

  return json_build_object('id', v_id, 'expires_at', v_expires);
end;
$fn$;

-- Redeem a code: limits first, then the code is taken in one statement (two phones with the
-- same code — one wins), the attempt is written. A person who no longer works in the company
-- does not get in even with a live code. The same p_request_id again within 10 minutes (the
-- answer was lost on the way) returns the person again, so the server can mint the session anew.
create or replace function redeem_login_code(
  p_code_hash text,
  p_ip_hash text,
  p_device text default null,
  p_request_id uuid default null,
  p_used_device text default null
) returns json
language plpgsql security definer set search_path = public
as $fn$
declare
  v_row login_codes%rowtype;
  v_ok  boolean;
begin
  if p_request_id is not null then
    select * into v_row from login_codes
     where redeem_request_id = p_request_id and code_hash = p_code_hash
       and used_at > now() - interval '10 minutes';
    if found then
      return json_build_object('ok', true, 'code_id', v_row.id, 'user_id', v_row.user_id, 'company_id', v_row.company_id);
    end if;
  end if;

  if (select count(*) from login_attempts
       where ip_hash = p_ip_hash and not ok and at > now() - interval '15 minutes') >= 10
     or (p_device is not null and (select count(*) from login_attempts
       where device = p_device and not ok and at > now() - interval '15 minutes') >= 10)
     or (select count(*) from login_attempts
       where not ok and at > now() - interval '10 minutes') >= 200 then
    return json_build_object('ok', false, 'error', 'too_many');
  end if;

  update login_codes c
     set used_at = now(), redeem_request_id = p_request_id, used_device = left(p_used_device, 40)
   where c.code_hash = p_code_hash and c.used_at is null and c.cancelled_at is null and c.expires_at > now()
     and exists (select 1 from profiles p where p.id = c.user_id and p.is_active)
  returning c.* into v_row;
  v_ok := found;

  insert into login_attempts (ip_hash, device, ok) values (p_ip_hash, left(p_device, 64), v_ok);

  if not v_ok then
    return json_build_object('ok', false, 'error', 'bad_code');
  end if;
  return json_build_object('ok', true, 'code_id', v_row.id, 'user_id', v_row.user_id, 'company_id', v_row.company_id);
end;
$fn$;

-- The session could not be minted after the code was taken: give the code back while it lives,
-- so the person tries again instead of asking for a new one. If another open code took the same
-- hash meanwhile, the code stays used.
create or replace function release_login_code(p_code_id uuid) returns void
language plpgsql security definer set search_path = public
as $fn$
begin
  update login_codes set used_at = null, redeem_request_id = null, used_device = null
   where id = p_code_id and expires_at > now() and cancelled_at is null;
exception when unique_violation then
  null;
end;
$fn$;

revoke execute on function issue_login_code(uuid, uuid, text, int, uuid) from public, anon, authenticated;
revoke execute on function redeem_login_code(text, text, text, uuid, text) from public, anon, authenticated;
revoke execute on function release_login_code(uuid) from public, anon, authenticated;

grant execute on function issue_login_code(uuid, uuid, text, int, uuid) to service_role;
grant execute on function redeem_login_code(text, text, text, uuid, text) to service_role;
grant execute on function release_login_code(uuid) to service_role;
