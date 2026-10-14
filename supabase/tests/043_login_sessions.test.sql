-- A sign-in taken away stops working at once (D-135, second step): a deleted session closes the
-- company to its token, a fired person reads nothing of the company, «Выйти со всех устройств»
-- removes sessions, push devices and open codes — by the rule of the password reset — and
-- firing does the same by itself.
-- Fixtures — supabase/seed.sql: company 1111…, director …0001, …0007 and …0008 (roles pinned here).
begin;
select plan(21);

update profiles set role = 'secretary', is_active = true where id = '10000000-0000-0000-0000-000000000007';
update profiles set role = 'employee', is_active = true where id = '10000000-0000-0000-0000-000000000008';

-- two phones of Айгуль, one of the director
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('96000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000008', now(), now()),
  ('96000000-0000-0000-0000-0000000000a2', '10000000-0000-0000-0000-000000000008', now(), now()),
  ('96000000-0000-0000-0000-0000000000d1', '10000000-0000-0000-0000-000000000001', now(), now());
insert into auth.refresh_tokens (token, user_id, session_id, revoked, created_at, updated_at) values
  ('t-96-a1', '10000000-0000-0000-0000-000000000008', '96000000-0000-0000-0000-0000000000a1', false, now(), now());
insert into push_subscriptions (company_id, user_id, endpoint, p256dh, auth) values
  ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000008', 'https://push.example/96-a1', 'k', 'a'),
  ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000008', 'https://push.example/96-a2', 'k', 'a');

-- ---------------------------------------------------------------------------
-- 1. A live session sees the company; a deleted one does not
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated","session_id":"96000000-0000-0000-0000-0000000000a1"}';
select ok(auth_company_id() is not null, 'a live session: the company answers');
select ok((select count(*) from profiles) > 1, 'and the roster is readable');
reset role;
delete from auth.sessions where id = '96000000-0000-0000-0000-0000000000a1';
select is((select count(*)::int from auth.refresh_tokens where token = 't-96-a1'), 0, 'a deleted session takes its refresh tokens with it');
set local role authenticated;
select ok(auth_company_id() is null, 'the token of a deleted session: no company');
select ok(auth_role() is null, 'no role');
select is((select count(*)::int from profiles), 0, 'not even its own profile row — the server answers 401');
select is((select count(*)::int from tasks), 0, 'no tasks');
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated"}';
select ok(auth_company_id() is not null, 'a token without a session id (scripts, tests) still counts as live');
reset role;

-- ---------------------------------------------------------------------------
-- 2. «Выйти со всех устройств» — who may
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated"}';
select throws_ok(
  $$ select revoke_sessions('10000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'an employee cannot sign the director out'
);
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select throws_ok(
  $$ select revoke_sessions('10000000-0000-0000-0000-000000000001') $$,
  'P0001', 'forbidden', 'nor can the secretary'
);
reset role;

-- ---------------------------------------------------------------------------
-- 3. The secretary signs Айгуль out everywhere
-- ---------------------------------------------------------------------------
select issue_login_code('10000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', 'h-96-1');
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select ok(
  (revoke_sessions('10000000-0000-0000-0000-000000000008') ->> 'devices')::int >= 2,
  'the secretary signs Айгуль out: her push devices go (dev may hold one more of hers)'
);
reset role;
select is((select count(*)::int from auth.sessions where user_id = '10000000-0000-0000-0000-000000000008'), 0, 'no sessions left');
select is((select count(*)::int from push_subscriptions where user_id = '10000000-0000-0000-0000-000000000008'), 0, 'no push devices left');
select is(
  (select count(*)::int from login_codes where user_id = '10000000-0000-0000-0000-000000000008' and used_at is null and cancelled_at is null),
  0,
  'her open code is cancelled'
);
select is((select count(*)::int from auth.sessions where id = '96000000-0000-0000-0000-0000000000d1'), 1, 'the director''s session is untouched');

-- ---------------------------------------------------------------------------
-- 4. «На других устройствах»: this phone stays
-- ---------------------------------------------------------------------------
insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('96000000-0000-0000-0000-0000000000b1', '10000000-0000-0000-0000-000000000008', now(), now()),
  ('96000000-0000-0000-0000-0000000000b2', '10000000-0000-0000-0000-000000000008', now(), now());
insert into push_subscriptions (company_id, user_id, endpoint, p256dh, auth) values
  ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000008', 'https://push.example/96-b1', 'k', 'a'),
  ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000008', 'https://push.example/96-b2', 'k', 'a');
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated","session_id":"96000000-0000-0000-0000-0000000000b1"}';
select is(
  revoke_sessions('10000000-0000-0000-0000-000000000008', true, 'https://push.example/96-b1') ->> 'sessions',
  '1',
  'one other phone signed out'
);
reset role;
select is(
  (select array_agg(id::text order by id) from auth.sessions where user_id = '10000000-0000-0000-0000-000000000008'),
  array['96000000-0000-0000-0000-0000000000b1'],
  'this phone keeps its session'
);
select is(
  (select array_agg(endpoint order by endpoint) from push_subscriptions where user_id = '10000000-0000-0000-0000-000000000008'),
  array['https://push.example/96-b1'],
  'and its pushes'
);

-- ---------------------------------------------------------------------------
-- 5. Firing signs out everywhere by itself
-- ---------------------------------------------------------------------------
select issue_login_code('10000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', 'h-96-2');
-- the director fires her (the guard reads who is editing)
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
update profiles set is_active = false where id = '10000000-0000-0000-0000-000000000008';
select ok(
  not exists (select 1 from auth.sessions where user_id = '10000000-0000-0000-0000-000000000008')
  and not exists (select 1 from push_subscriptions where user_id = '10000000-0000-0000-0000-000000000008')
  and not exists (select 1 from login_codes where user_id = '10000000-0000-0000-0000-000000000008' and used_at is null and cancelled_at is null),
  'fired: sessions, push devices and open codes are gone'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated"}';
select ok(auth_company_id() is null, 'a fired person reads nothing of the company');
select is(
  (select is_active from profiles where id = '10000000-0000-0000-0000-000000000008'),
  false,
  'but sees their own row — the server says «Аккаунт отключён»'
);
reset role;

select * from finish();
rollback;
