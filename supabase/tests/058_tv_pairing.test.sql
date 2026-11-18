-- A wall joins its company by a code (D-182): clients never touch the codes; the server (service
-- role) issues them and the screen polls by its secret; only a working director confirms, and the
-- screen becomes HIS company's kiosk — never another company's; a code works once, for ten
-- minutes; the session goes only to the secret that asked; misses and issuing are limited.
-- Fixtures are this file's own (two companies): dev data never leans in.
begin;
select plan(42);

-- ---------------------------------------------------------------------------
-- Fixtures: company A — a director, a secretary, an employee, the kiosk, a dismissed director;
-- company B — a director and two kiosks
-- ---------------------------------------------------------------------------
insert into companies (id, name, settings) values
  ('05800000-0000-0000-0000-00000000000a', 'pgtap-058 A', '{}'::jsonb),
  ('05800000-0000-0000-0000-00000000000b', 'pgtap-058 B', '{}'::jsonb);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, now(), now(),
       '', '', '', '', '', '', '', ''
  from (values
    ('05800000-0000-0000-0000-000000000001'::uuid, 'pgtap-058-director@demo.local'),
    ('05800000-0000-0000-0000-000000000002'::uuid, 'pgtap-058-secretary@demo.local'),
    ('05800000-0000-0000-0000-000000000003'::uuid, 'pgtap-058-employee@demo.local'),
    ('05800000-0000-0000-0000-000000000004'::uuid, 'pgtap-058-tv@demo.local'),
    ('05800000-0000-0000-0000-000000000005'::uuid, 'pgtap-058-left@demo.local'),
    ('05800000-0000-0000-0000-000000000011'::uuid, 'pgtap-058-director-b@demo.local'),
    ('05800000-0000-0000-0000-000000000012'::uuid, 'pgtap-058-tv-b@demo.local'),
    ('05800000-0000-0000-0000-000000000013'::uuid, 'pgtap-058-tv-b2@demo.local')
  ) as u(id, email);

insert into profiles (id, company_id, full_name, role, is_active) values
  ('05800000-0000-0000-0000-000000000001', '05800000-0000-0000-0000-00000000000a', 'pgtap-058 Директор A', 'director', true),
  ('05800000-0000-0000-0000-000000000002', '05800000-0000-0000-0000-00000000000a', 'pgtap-058 Секретарь A', 'secretary', true),
  ('05800000-0000-0000-0000-000000000003', '05800000-0000-0000-0000-00000000000a', 'pgtap-058 Сотрудник A', 'employee', true),
  ('05800000-0000-0000-0000-000000000004', '05800000-0000-0000-0000-00000000000a', 'pgtap-058 Экран A', 'tv', true),
  ('05800000-0000-0000-0000-000000000005', '05800000-0000-0000-0000-00000000000a', 'pgtap-058 Ушёл', 'director', false),
  ('05800000-0000-0000-0000-000000000011', '05800000-0000-0000-0000-00000000000b', 'pgtap-058 Директор B', 'director', true),
  ('05800000-0000-0000-0000-000000000012', '05800000-0000-0000-0000-00000000000b', 'pgtap-058 Экран B', 'tv', true),
  ('05800000-0000-0000-0000-000000000013', '05800000-0000-0000-0000-00000000000b', 'pgtap-058 Экран B2', 'tv', true);

-- ---------------------------------------------------------------------------
-- 1. Clients have no way in
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"05800000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$ select * from tv_pairings $$, '42501', null, 'a director cannot read wall codes');
select throws_ok($$ select * from tv_pair_attempts $$, '42501', null, 'nor attempts');
select throws_ok(
  $$ select tv_pair_issue('pgtap-058-h-x', 'pgtap-058-s-x', 'pgtap-058-ip') $$,
  '42501', null, 'a client cannot issue a wall code itself'
);
select throws_ok($$ select tv_pair_poll('pgtap-058-s-x') $$, '42501', null, 'nor poll for a session');
select throws_ok(
  $$ select tv_pair_release('05800000-0000-0000-0000-0000000000f0') $$,
  '42501', null, 'nor give a pick-up back'
);
reset role;

set local role anon;
select throws_ok($$ select * from tv_pairings $$, '42501', null, 'nobody signed in reads nothing');
select throws_ok(
  $$ select tv_pair_confirm('pgtap-058-h-x', '05800000-0000-0000-0000-0000000000c0') $$,
  '42501', null, 'and confirms nothing'
);
reset role;

-- ---------------------------------------------------------------------------
-- 2. Issuing (the server, for a screen without a session)
-- ---------------------------------------------------------------------------
set local role service_role;
select is(
  tv_pair_issue('pgtap-058-h-a', 'pgtap-058-s-a', 'pgtap-058-ip-1', 'телевизор') ->> 'ok',
  'true',
  'a screen gets a code'
);
select throws_ok(
  $$ select tv_pair_issue('pgtap-058-h-a', 'pgtap-058-s-a2', 'pgtap-058-ip-1') $$,
  'P0001', 'collision', 'an open code is unique across the whole base'
);
select tv_pair_issue('pgtap-058-h-b', 'pgtap-058-s-b', 'pgtap-058-ip-1');
select is(
  tv_pair_issue('pgtap-058-h-b2', 'pgtap-058-s-b2', 'pgtap-058-ip-1', null, 'pgtap-058-s-b') ->> 'ok',
  'true',
  'the same screen asks again'
);
select is(tv_pair_poll('pgtap-058-s-a') ->> 'state', 'waiting', 'an open code waits for the director');
select ok((tv_pair_poll('pgtap-058-s-a') ->> 'expires_in')::int between 590 and 600, 'with the seconds left by the base''s clock');
select is(tv_pair_poll('pgtap-058-s-b') ->> 'state', 'gone', 'asking again cancelled the previous code');
select is(tv_pair_poll('pgtap-058-s-nope') ->> 'state', 'gone', 'an unknown secret gets nothing');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Only a working director confirms
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"05800000-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_ok(
  $$ select tv_pair_confirm('pgtap-058-h-a', '05800000-0000-0000-0000-0000000000c1') $$,
  'P0001', 'forbidden', 'an employee cannot connect a screen'
);
set local request.jwt.claims = '{"sub":"05800000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select tv_pair_confirm('pgtap-058-h-a', '05800000-0000-0000-0000-0000000000c1') $$,
  'P0001', 'forbidden', 'nor the secretary'
);
set local request.jwt.claims = '{"sub":"05800000-0000-0000-0000-000000000004","role":"authenticated"}';
select throws_ok(
  $$ select tv_pair_confirm('pgtap-058-h-a', '05800000-0000-0000-0000-0000000000c1') $$,
  'P0001', 'forbidden', 'nor the kiosk itself'
);
set local request.jwt.claims = '{"sub":"05800000-0000-0000-0000-000000000005","role":"authenticated"}';
select throws_ok(
  $$ select tv_pair_confirm('pgtap-058-h-a', '05800000-0000-0000-0000-0000000000c1') $$,
  'P0001', 'forbidden', 'nor a director who left'
);

set local request.jwt.claims = '{"sub":"05800000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  tv_pair_confirm('pgtap-058-h-wrong', '05800000-0000-0000-0000-0000000000c2') ->> 'error',
  'bad_code',
  'a wrong code does not connect'
);
select is(
  tv_pair_confirm('pgtap-058-h-a', '05800000-0000-0000-0000-0000000000c3') ->> 'screen',
  'pgtap-058 Экран A',
  'the director connects the screen: his company''s only kiosk'
);
select is(
  tv_pair_confirm('pgtap-058-h-a', '05800000-0000-0000-0000-0000000000c3') ->> 'duplicate',
  'true',
  'the same confirmation again returns the first result'
);
select is(
  tv_pair_confirm('pgtap-058-h-a', '05800000-0000-0000-0000-0000000000c4') ->> 'error',
  'bad_code',
  'a used code does not work twice'
);
reset role;

select ok(
  (select company_id = '05800000-0000-0000-0000-00000000000a'
      and tv_user_id = '05800000-0000-0000-0000-000000000004'
      and confirmed_by = '05800000-0000-0000-0000-000000000001'
     from tv_pairings where secret_hash = 'pgtap-058-s-a'),
  'the code now names the director''s company, its screen and him'
);

-- ---------------------------------------------------------------------------
-- 4. Company A does not reach company B
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"05800000-0000-0000-0000-000000000011","role":"authenticated"}';
select is(
  tv_pair_confirm('pgtap-058-h-a', '05800000-0000-0000-0000-0000000000c5', '05800000-0000-0000-0000-000000000012') ->> 'error',
  'bad_code',
  'company B''s director cannot take a screen company A has connected'
);
select is(
  tv_pair_confirm('pgtap-058-h-a', '05800000-0000-0000-0000-0000000000c3') ->> 'error',
  'bad_code',
  'nor replay company A''s confirmation to read it back'
);
reset role;

set local role service_role;
select tv_pair_issue('pgtap-058-h-d', 'pgtap-058-s-d', 'pgtap-058-ip-2', 'компьютер');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"05800000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  tv_pair_confirm('pgtap-058-h-d', '05800000-0000-0000-0000-0000000000c6', '05800000-0000-0000-0000-000000000012') ->> 'error',
  'no_screen',
  'company A''s director cannot hand out company B''s kiosk'
);
set local request.jwt.claims = '{"sub":"05800000-0000-0000-0000-000000000011","role":"authenticated"}';
select is(
  tv_pair_confirm('pgtap-058-h-d', '05800000-0000-0000-0000-0000000000c7') ->> 'error',
  'which_screen',
  'with two kiosks the director names one'
);
select is(
  tv_pair_confirm('pgtap-058-h-d', '05800000-0000-0000-0000-0000000000c8', '05800000-0000-0000-0000-000000000013') ->> 'screen',
  'pgtap-058 Экран B2',
  'the named kiosk of his own company'
);
set local request.jwt.claims = '{"sub":"05800000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  tv_pair_confirm('pgtap-058-h-d', '05800000-0000-0000-0000-0000000000c8') ->> 'error',
  'bad_code',
  'company A''s director replaying company B''s request gets nothing back'
);
reset role;

select is(
  (select company_id from tv_pairings where secret_hash = 'pgtap-058-s-d'),
  '05800000-0000-0000-0000-00000000000b'::uuid,
  'company B''s screen stays company B''s'
);

-- ---------------------------------------------------------------------------
-- 5. The screen picks the session up — once, by its secret
-- ---------------------------------------------------------------------------
set local role service_role;
select is(
  tv_pair_poll('pgtap-058-s-a') ->> 'user_id',
  '05800000-0000-0000-0000-000000000004',
  'the screen that showed the code gets company A''s kiosk'
);
select is(
  tv_pair_poll('pgtap-058-s-a') ->> 'state',
  'confirmed',
  'asking again at once (a lost answer) gets it again'
);
select is(tv_pair_poll('pgtap-058-s-a2') ->> 'state', 'gone', 'another secret gets nothing');
reset role;
update tv_pairings set claimed_at = now() - interval '3 minutes' where secret_hash = 'pgtap-058-s-a';
set local role service_role;
select is(tv_pair_poll('pgtap-058-s-a') ->> 'state', 'gone', 'a picked-up code is spent');
select is(
  tv_pair_issue('pgtap-058-h-e', 'pgtap-058-s-e', 'pgtap-058-ip-2', null, 'pgtap-058-s-d') ->> 'error',
  'confirmed',
  'a screen whose code is confirmed polls instead of drawing a new one'
);

-- expired
select tv_pair_issue('pgtap-058-h-f', 'pgtap-058-s-f', 'pgtap-058-ip-3');
reset role;
update tv_pairings set expires_at = now() - interval '1 second' where secret_hash = 'pgtap-058-s-f';
set local role authenticated;
set local request.jwt.claims = '{"sub":"05800000-0000-0000-0000-000000000011","role":"authenticated"}';
select is(
  tv_pair_confirm('pgtap-058-h-f', '05800000-0000-0000-0000-0000000000c9', '05800000-0000-0000-0000-000000000012') ->> 'error',
  'bad_code',
  'an expired code does not work'
);
reset role;
set local role service_role;
select is(tv_pair_poll('pgtap-058-s-f') ->> 'state', 'expired', 'and the screen hears it ran out');
reset role;

-- a kiosk switched off before the pick-up
update tv_pairings set claimed_at = null where secret_hash = 'pgtap-058-s-d';
update profiles set is_active = false where id = '05800000-0000-0000-0000-000000000013';
set local role service_role;
select is(tv_pair_poll('pgtap-058-s-d') ->> 'state', 'gone', 'a kiosk that no longer works gives no session');
reset role;

-- ---------------------------------------------------------------------------
-- 6. Limits
-- ---------------------------------------------------------------------------
insert into tv_pair_attempts (user_id, ok)
select '05800000-0000-0000-0000-000000000001', false from generate_series(1, 3);

set local role service_role;
select tv_pair_issue('pgtap-058-h-g', 'pgtap-058-s-g', 'pgtap-058-ip-4');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"05800000-0000-0000-0000-000000000001","role":"authenticated"}';
-- with the two misses of section 3 these are five
select is(
  tv_pair_confirm('pgtap-058-h-g', '05800000-0000-0000-0000-0000000000ca') ->> 'error',
  'too_many',
  'five misses in ten minutes close confirming for the person'
);
select ok(
  (tv_pair_confirm('pgtap-058-h-g', '05800000-0000-0000-0000-0000000000cb') ->> 'retry_after')::int between 1 and 600,
  'and say how long to wait'
);
set local request.jwt.claims = '{"sub":"05800000-0000-0000-0000-000000000011","role":"authenticated"}';
select is(
  tv_pair_confirm('pgtap-058-h-g', '05800000-0000-0000-0000-0000000000cc', '05800000-0000-0000-0000-000000000012') ->> 'ok',
  'true',
  'another person''s misses do not close it for company B'
);
reset role;

insert into tv_pairings (code_hash, secret_hash, ip_hash, expires_at)
select 'pgtap-058-flood-' || g, 'pgtap-058-flood-s-' || g, 'pgtap-058-ip-flood', now() + interval '10 minutes'
  from generate_series(1, 20) g;
set local role service_role;
select is(
  tv_pair_issue('pgtap-058-h-h', 'pgtap-058-s-h', 'pgtap-058-ip-flood') ->> 'error',
  'too_many',
  'twenty codes in ten minutes from one address are the limit'
);
reset role;

select * from finish();
rollback;
