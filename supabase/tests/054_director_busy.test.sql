-- director_busy (owner, 2026-11-04): the secretary sees when the director is busy and nothing else.
-- Only the director and the secretary of the company call it; a NULL role (nobody signed in, a
-- dismissed person) does not pass; spans overlap into one, cancelled and refused meetings do not
-- count, no end = one hour, several directors are one calendar; no word of a meeting comes back.
-- Fixtures are this file's own (two companies): dev data never leans in.
begin;
select plan(20);

-- ---------------------------------------------------------------------------
-- Fixtures: company A — two directors, a secretary, an employee, the kiosk, a dismissed secretary;
-- company B — a director and a secretary
-- ---------------------------------------------------------------------------
insert into companies (id, name, settings) values
  ('05200000-0000-0000-0000-00000000000a', 'pgtap-052 A', '{}'::jsonb),
  ('05200000-0000-0000-0000-00000000000b', 'pgtap-052 B', '{}'::jsonb);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, now(), now(),
       '', '', '', '', '', '', '', ''
  from (values
    ('05200000-0000-0000-0000-000000000001'::uuid, 'pgtap-052-director@demo.local'),
    ('05200000-0000-0000-0000-000000000002'::uuid, 'pgtap-052-director2@demo.local'),
    ('05200000-0000-0000-0000-000000000003'::uuid, 'pgtap-052-secretary@demo.local'),
    ('05200000-0000-0000-0000-000000000004'::uuid, 'pgtap-052-employee@demo.local'),
    ('05200000-0000-0000-0000-000000000005'::uuid, 'pgtap-052-tv@demo.local'),
    ('05200000-0000-0000-0000-000000000006'::uuid, 'pgtap-052-left@demo.local'),
    ('05200000-0000-0000-0000-000000000007'::uuid, 'pgtap-052-director-b@demo.local'),
    ('05200000-0000-0000-0000-000000000008'::uuid, 'pgtap-052-secretary-b@demo.local')
  ) as u(id, email);

insert into profiles (id, company_id, full_name, role, is_active) values
  ('05200000-0000-0000-0000-000000000001', '05200000-0000-0000-0000-00000000000a', 'pgtap-052 Директор', 'director', true),
  ('05200000-0000-0000-0000-000000000002', '05200000-0000-0000-0000-00000000000a', 'pgtap-052 Второй директор', 'director', true),
  ('05200000-0000-0000-0000-000000000003', '05200000-0000-0000-0000-00000000000a', 'pgtap-052 Секретарь', 'secretary', true),
  ('05200000-0000-0000-0000-000000000004', '05200000-0000-0000-0000-00000000000a', 'pgtap-052 Сотрудник', 'employee', true),
  ('05200000-0000-0000-0000-000000000005', '05200000-0000-0000-0000-00000000000a', 'pgtap-052 Киоск', 'tv', true),
  ('05200000-0000-0000-0000-000000000006', '05200000-0000-0000-0000-00000000000a', 'pgtap-052 Уволена', 'secretary', false),
  ('05200000-0000-0000-0000-000000000007', '05200000-0000-0000-0000-00000000000b', 'pgtap-052 Директор B', 'director', true),
  ('05200000-0000-0000-0000-000000000008', '05200000-0000-0000-0000-00000000000b', 'pgtap-052 Секретарь B', 'secretary', true);

-- company A, a day in 2030 on the UTC clock:
--   e1 + e2  09:00–10:00 and 09:30–11:00 overlap         → one span 09:00–11:00
--   e3       11:00–11:30 touches them                    → the same span, up to 11:30
--   e4       13:00, no end                               → 13:00–14:00
--   e5       15:00–16:00 of the second director          → a span of its own
--   e6       17:00–18:00 cancelled                       → nothing
--   e7       19:00–20:00 the director refused            → nothing
--   e8       21:00–22:00 an employee's, no director      → nothing
insert into events (id, company_id, author_id, title, location, starts_at, ends_at, cancelled_at) values
  ('05200000-0000-0000-0000-0000000000e1', '05200000-0000-0000-0000-00000000000a', '05200000-0000-0000-0000-000000000001', 'pgtap-052 сделка века', 'pgtap-052 тайная комната', '2030-03-05 09:00+00', '2030-03-05 10:00+00', null),
  ('05200000-0000-0000-0000-0000000000e2', '05200000-0000-0000-0000-00000000000a', '05200000-0000-0000-0000-000000000001', 'pgtap-052 вторая', null, '2030-03-05 09:30+00', '2030-03-05 11:00+00', null),
  ('05200000-0000-0000-0000-0000000000e3', '05200000-0000-0000-0000-00000000000a', '05200000-0000-0000-0000-000000000001', 'pgtap-052 третья', null, '2030-03-05 11:00+00', '2030-03-05 11:30+00', null),
  ('05200000-0000-0000-0000-0000000000e4', '05200000-0000-0000-0000-00000000000a', '05200000-0000-0000-0000-000000000001', 'pgtap-052 без конца', null, '2030-03-05 13:00+00', null, null),
  ('05200000-0000-0000-0000-0000000000e5', '05200000-0000-0000-0000-00000000000a', '05200000-0000-0000-0000-000000000002', 'pgtap-052 второго директора', null, '2030-03-05 15:00+00', '2030-03-05 16:00+00', null),
  ('05200000-0000-0000-0000-0000000000e6', '05200000-0000-0000-0000-00000000000a', '05200000-0000-0000-0000-000000000001', 'pgtap-052 отменённая', null, '2030-03-05 17:00+00', '2030-03-05 18:00+00', '2030-03-01 00:00+00'),
  ('05200000-0000-0000-0000-0000000000e7', '05200000-0000-0000-0000-00000000000a', '05200000-0000-0000-0000-000000000004', 'pgtap-052 отказался', null, '2030-03-05 19:00+00', '2030-03-05 20:00+00', null),
  ('05200000-0000-0000-0000-0000000000e8', '05200000-0000-0000-0000-00000000000a', '05200000-0000-0000-0000-000000000004', 'pgtap-052 без директора', null, '2030-03-05 21:00+00', '2030-03-05 22:00+00', null),
  ('05200000-0000-0000-0000-0000000000f1', '05200000-0000-0000-0000-00000000000b', '05200000-0000-0000-0000-000000000007', 'pgtap-052 компании B', null, '2030-03-05 06:00+00', '2030-03-05 07:00+00', null);

insert into event_participants (event_id, user_id, status) values
  ('05200000-0000-0000-0000-0000000000e1', '05200000-0000-0000-0000-000000000001', 'going'),
  ('05200000-0000-0000-0000-0000000000e2', '05200000-0000-0000-0000-000000000001', 'going'),
  ('05200000-0000-0000-0000-0000000000e3', '05200000-0000-0000-0000-000000000001', 'invited'),
  ('05200000-0000-0000-0000-0000000000e4', '05200000-0000-0000-0000-000000000001', 'going'),
  ('05200000-0000-0000-0000-0000000000e5', '05200000-0000-0000-0000-000000000002', 'going'),
  ('05200000-0000-0000-0000-0000000000e6', '05200000-0000-0000-0000-000000000001', 'going'),
  ('05200000-0000-0000-0000-0000000000e7', '05200000-0000-0000-0000-000000000004', 'going'),
  ('05200000-0000-0000-0000-0000000000e7', '05200000-0000-0000-0000-000000000001', 'declined'),
  ('05200000-0000-0000-0000-0000000000e8', '05200000-0000-0000-0000-000000000004', 'going'),
  ('05200000-0000-0000-0000-0000000000f1', '05200000-0000-0000-0000-000000000007', 'going');

-- ---------------------------------------------------------------------------
-- 1. Who may call
-- ---------------------------------------------------------------------------
set local role authenticated;

set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000004","role":"authenticated"}';
select throws_ok(
  $$select * from director_busy('2030-03-05 00:00+00', '2030-03-06 00:00+00')$$,
  'P0001', 'forbidden', 'an employee is refused'
);

set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000005","role":"authenticated"}';
select throws_ok(
  $$select * from director_busy('2030-03-05 00:00+00', '2030-03-06 00:00+00')$$,
  'P0001', 'forbidden', 'the kiosk is refused'
);

-- is_active false: auth_role() and auth_company_id() answer NULL — the case `not in` would let through
set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000006","role":"authenticated"}';
select throws_ok(
  $$select * from director_busy('2030-03-05 00:00+00', '2030-03-06 00:00+00')$$,
  'P0001', 'forbidden', 'a dismissed secretary is refused: a NULL role does not pass'
);

set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-0000000000ff","role":"authenticated"}';
select throws_ok(
  $$select * from director_busy('2030-03-05 00:00+00', '2030-03-06 00:00+00')$$,
  'P0001', 'forbidden', 'somebody with no profile is refused'
);

set local role postgres;
select is(
  has_function_privilege('anon', 'director_busy(timestamptz, timestamptz)', 'execute'),
  false,
  'anon has no execute at all'
);

-- ---------------------------------------------------------------------------
-- 2. What the secretary gets
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000003","role":"authenticated"}';

select results_eq(
  $$select starts_at, ends_at from director_busy('2030-03-05 00:00+00', '2030-03-06 00:00+00')$$,
  $$values ('2030-03-05 09:00+00'::timestamptz, '2030-03-05 11:30+00'::timestamptz),
           ('2030-03-05 13:00+00'::timestamptz, '2030-03-05 14:00+00'::timestamptz),
           ('2030-03-05 15:00+00'::timestamptz, '2030-03-05 16:00+00'::timestamptz)$$,
  'overlapping and touching meetings are one span; no end = an hour; two directors are one calendar; cancelled, refused and nobody-director ones are out'
);

select is(
  (select count(*)::int from director_busy('2030-03-05 12:00+00', '2030-03-05 13:30+00')),
  1,
  'a span that reaches into the range counts'
);

select is(
  (select count(*)::int from director_busy('2030-03-05 11:30+00', '2030-03-05 13:00+00')),
  0,
  'a span that only touches the edge of the range does not'
);

select is(
  pg_get_function_result('director_busy(timestamptz, timestamptz)'::regprocedure),
  'TABLE(starts_at timestamp with time zone, ends_at timestamp with time zone)',
  'the function has two columns and no other'
);

select is(
  (select count(*)::int
     from director_busy('2030-03-05 00:00+00', '2030-03-06 00:00+00') b
    where to_jsonb(b)::text ~ 'pgtap-052|сделка|тайная'),
  0,
  'no title and no place in what comes back'
);

select is(
  (select count(*)::int
     from (select jsonb_object_keys(to_jsonb(b)) as key
             from director_busy('2030-03-05 00:00+00', '2030-03-06 00:00+00') b) keys
    where key not in ('starts_at', 'ends_at')),
  0,
  'nothing but the two instants'
);

select is(
  (select count(*)::int from events where title = 'pgtap-052 сделка века'),
  0,
  'and her calendar under RLS still does not hold the meeting itself'
);

-- ---------------------------------------------------------------------------
-- 3. Another company
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from director_busy('2030-03-05 05:00+00', '2030-03-05 08:00+00')),
  0,
  'company A does not see the director of company B'
);

set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000008","role":"authenticated"}';
select results_eq(
  $$select starts_at, ends_at from director_busy('2030-03-05 00:00+00', '2030-03-06 00:00+00')$$,
  $$values ('2030-03-05 06:00+00'::timestamptz, '2030-03-05 07:00+00'::timestamptz)$$,
  'and the secretary of company B sees only her own director'
);

-- ---------------------------------------------------------------------------
-- 4. The range
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select * from director_busy('2030-03-01 00:00+00', '2030-04-02 00:00+00')$$,
  'P0001', 'bad_range', 'more than 31 days is refused'
);

select throws_ok(
  $$select * from director_busy('2030-03-06 00:00+00', '2030-03-05 00:00+00')$$,
  'P0001', 'bad_range', 'a backward range is refused'
);

select throws_ok(
  $$select * from director_busy(null, '2030-03-05 00:00+00')$$,
  'P0001', 'bad_range', 'a missing end of the range is refused'
);

select lives_ok(
  $$select * from director_busy('2030-03-01 00:00+00', '2030-04-01 00:00+00')$$,
  'exactly 31 days go through'
);

-- ---------------------------------------------------------------------------
-- 5. The director himself may ask; the secretary still changes nothing
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (select count(*)::int from director_busy('2030-03-05 00:00+00', '2030-03-06 00:00+00')),
  3,
  'the director gets the same spans'
);

set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000003","role":"authenticated"}';
select is_empty(
  $$update events set title = 'pgtap-052 переписано' where id = '05200000-0000-0000-0000-0000000000e1' returning id$$,
  'she still cannot change a meeting of the director'
);

select * from finish();
rollback;
