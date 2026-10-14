-- One-time sign-in codes (D-135): clients never touch codes; the server (service role) issues
-- and redeems them; a code works once, for 15 minutes, only inside its company, and only for
-- a person who still works there; a new code cancels the previous one; attempts are limited.
-- Fixtures — supabase/seed.sql: company 1111…, director …0001, …0007 (pinned an employee here).
begin;
select plan(22);

update profiles set role = 'employee', is_active = true where id = '10000000-0000-0000-0000-000000000007';

insert into companies (id, name) values ('99999999-9999-9999-9999-999999999999', 'Чужая компания');
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-000000000000', '99999999-0000-0000-0000-000000000001',
        'authenticated', 'authenticated', 'foreign@demo.local', now(), now(), '', '', '', '', '', '', '', '');
insert into profiles (id, company_id, full_name, role) values
  ('99999999-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999', 'Чужой Директор', 'director');

-- ---------------------------------------------------------------------------
-- 1. Clients have no way in
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$ select * from login_codes $$, '42501', null, 'a director cannot read codes');
select throws_ok($$ select * from login_attempts $$, '42501', null, 'nor attempts');
select throws_ok(
  $$ select issue_login_code('10000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'h-x') $$,
  '42501', null, 'a client cannot issue a code itself'
);
select throws_ok(
  $$ select redeem_login_code('h-x', 'ip') $$,
  '42501', null, 'nor redeem one'
);
reset role;

-- ---------------------------------------------------------------------------
-- 2. Issuing
-- ---------------------------------------------------------------------------
set local role service_role;
select ok(
  (issue_login_code('10000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'h-1', 900,
                    '95000000-0000-0000-0000-000000000001') ->> 'id') is not null,
  'the director issues a code for an employee'
);
select throws_ok(
  $$ select issue_login_code('10000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'h-1b', 900,
                             '95000000-0000-0000-0000-000000000001') $$,
  'P0001', 'duplicate', 'the same issue request twice makes nothing new'
);
select throws_ok(
  $$ select issue_login_code('10000000-0000-0000-0000-000000000007', '99999999-0000-0000-0000-000000000001', 'h-f') $$,
  'P0001', 'not_found', 'another company''s director cannot issue a code for our person'
);
select ok(
  (issue_login_code('10000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'h-2') ->> 'id') is not null,
  'a second code for the same person'
);
select is(
  (select count(*)::int from login_codes
    where user_id = '10000000-0000-0000-0000-000000000007' and used_at is null and cancelled_at is null),
  1,
  'the new code cancelled the previous one'
);
select ok(
  (issue_login_code('99999999-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001', 'h-own') ->> 'id') is not null,
  'a director issues a code for themselves (another device)'
);
select throws_ok(
  $$ select issue_login_code('99999999-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001', 'h-2') $$,
  'P0001', 'collision', 'an open code''s hash is unique across the whole base'
);

-- ---------------------------------------------------------------------------
-- 3. Redeeming
-- ---------------------------------------------------------------------------
select is(redeem_login_code('h-1', 'ip-a') ->> 'error', 'bad_code', 'a cancelled code does not work');
select is(redeem_login_code('h-nope', 'ip-a') ->> 'error', 'bad_code', 'a wrong code does not work');
select is(
  redeem_login_code('h-2', 'ip-a', 'dev-1', '95000000-0000-0000-0000-0000000000e1', 'iPhone') ->> 'user_id',
  '10000000-0000-0000-0000-000000000007',
  'the live code signs the person in'
);
select ok(
  (select used_at is not null and used_device = 'iPhone' from login_codes where code_hash = 'h-2'),
  'the code is taken, the device is written'
);
select is(redeem_login_code('h-2', 'ip-b') ->> 'error', 'bad_code', 'the code works once');
select is(
  redeem_login_code('h-2', 'ip-a', 'dev-1', '95000000-0000-0000-0000-0000000000e1') ->> 'user_id',
  '10000000-0000-0000-0000-000000000007',
  'the same request again (a lost answer) gets the person again'
);

-- given back after a failed session: the code works again
select release_login_code((select id from login_codes where code_hash = 'h-2'));
select is(redeem_login_code('h-2', 'ip-c') ->> 'ok', 'true', 'a released code works again');

-- expired, and a person who left
select issue_login_code('10000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'h-3');
update login_codes set expires_at = now() - interval '1 second' where code_hash = 'h-3';
select is(redeem_login_code('h-3', 'ip-d') ->> 'error', 'bad_code', 'an expired code does not work');

select issue_login_code('10000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'h-4');
update profiles set is_active = false where id = '10000000-0000-0000-0000-000000000007';
select is(redeem_login_code('h-4', 'ip-e') ->> 'error', 'bad_code', 'a person who left does not get in with a live code');
select throws_ok(
  $$ select issue_login_code('10000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', 'h-5') $$,
  'P0001', 'inactive', 'and gets no new code'
);
update profiles set is_active = true where id = '10000000-0000-0000-0000-000000000007';

-- ---------------------------------------------------------------------------
-- 4. Limits
-- ---------------------------------------------------------------------------
insert into login_attempts (ip_hash, ok) select 'ip-guess', false from generate_series(1, 10);
select is(redeem_login_code('h-4', 'ip-guess') ->> 'error', 'too_many', 'ten misses from one address close it for a while');

reset role;
select * from finish();
rollback;
