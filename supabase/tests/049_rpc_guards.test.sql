-- tasks/023: the server guards what only the routes held. confirm_voice_batch gives a task, a
-- repeating order or points only to somebody who works in the director's company (active, not the
-- tv kiosk) — one code `assignee_inactive` for a dismissed person and for another company's;
-- award_points refuses while the company has points switched off.
-- Fixtures are this file's own (two companies): dev people change roles, nothing here leans on them.
begin;
select plan(13);

-- ---------------------------------------------------------------------------
-- Fixtures: company A — director, a working employee, a dismissed one, the tv kiosk;
-- company B — one employee
-- ---------------------------------------------------------------------------
insert into companies (id, name, settings) values
  ('04900000-0000-0000-0000-00000000000a', 'pgtap-049 A',
   '{"points_enabled": false, "delivery_window": {"from": "00:00", "to": "23:59"}}'::jsonb),
  ('04900000-0000-0000-0000-00000000000b', 'pgtap-049 B', '{"points_enabled": true}'::jsonb);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, now(), now(),
       '', '', '', '', '', '', '', ''
  from (values
    ('04900000-0000-0000-0000-000000000001'::uuid, 'pgtap-049-director@demo.local'),
    ('04900000-0000-0000-0000-000000000002'::uuid, 'pgtap-049-working@demo.local'),
    ('04900000-0000-0000-0000-000000000003'::uuid, 'pgtap-049-left@demo.local'),
    ('04900000-0000-0000-0000-000000000004'::uuid, 'pgtap-049-tv@demo.local'),
    ('04900000-0000-0000-0000-000000000005'::uuid, 'pgtap-049-foreign@demo.local')
  ) as u(id, email);

insert into profiles (id, company_id, full_name, role, is_active) values
  ('04900000-0000-0000-0000-000000000001', '04900000-0000-0000-0000-00000000000a', 'pgtap-049 Директор', 'director', true),
  ('04900000-0000-0000-0000-000000000002', '04900000-0000-0000-0000-00000000000a', 'pgtap-049 Работает', 'employee', true),
  ('04900000-0000-0000-0000-000000000003', '04900000-0000-0000-0000-00000000000a', 'pgtap-049 Уволен', 'employee', false),
  ('04900000-0000-0000-0000-000000000004', '04900000-0000-0000-0000-00000000000a', 'pgtap-049 Киоск', 'tv', true),
  ('04900000-0000-0000-0000-000000000005', '04900000-0000-0000-0000-00000000000b', 'pgtap-049 Чужой', 'employee', true);

-- ---------------------------------------------------------------------------
-- 1. award_points follows points_enabled
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"04900000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$select award_points('04900000-0000-0000-0000-000000000002', 5, 'pgtap-049 выключено')$$,
  'P0001', 'points_disabled',
  'award_points: points switched off — refused'
);

set local role postgres;
update companies set settings = settings || '{"points_enabled": true}'::jsonb
 where id = '04900000-0000-0000-0000-00000000000a';
set local role authenticated;
set local request.jwt.claims = '{"sub":"04900000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$select award_points('04900000-0000-0000-0000-000000000002', 5, 'pgtap-049 за дело')$$,
  'award_points: points switched on — goes through'
);

set local role postgres;
select is(
  (select count(*)::int from point_transactions
    where user_id = '04900000-0000-0000-0000-000000000002' and reason = 'pgtap-049 за дело'),
  1,
  'and the ledger has the row'
);

-- ---------------------------------------------------------------------------
-- 2. confirm_voice_batch, a task: only somebody who works in this company
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"04900000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$select confirm_voice_batch(
    '{"source":"typed","transcript":"pgtap-049","confirmed_entities":[
       {"kind":"task","assignee_id":"04900000-0000-0000-0000-000000000003","title":"pgtap-049 уволенному"}]}'::jsonb,
    '04900000-0000-0000-0000-0000000000c1'::uuid)$$,
  'P0001', 'assignee_inactive',
  'task: a dismissed person — refused'
);

select throws_ok(
  $$select confirm_voice_batch(
    '{"source":"typed","transcript":"pgtap-049","confirmed_entities":[
       {"kind":"task","assignee_id":"04900000-0000-0000-0000-000000000005","title":"pgtap-049 чужому"}]}'::jsonb,
    '04900000-0000-0000-0000-0000000000c2'::uuid)$$,
  'P0001', 'assignee_inactive',
  'task: a person of another company — refused with the same code'
);

set local role postgres;
select is(
  (select count(*)::int from tasks where assignee_id = '04900000-0000-0000-0000-000000000005'),
  0,
  'and no task reached the other company'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"04900000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$select confirm_voice_batch(
    '{"source":"typed","transcript":"pgtap-049","confirmed_entities":[
       {"kind":"task","assignee_id":"04900000-0000-0000-0000-000000000004","title":"pgtap-049 киоску"}]}'::jsonb,
    '04900000-0000-0000-0000-0000000000c3'::uuid)$$,
  'P0001', 'assignee_inactive',
  'task: the tv kiosk — refused'
);

select is(
  jsonb_array_length((select confirm_voice_batch(
    '{"source":"typed","transcript":"pgtap-049","confirmed_entities":[
       {"kind":"task","assignee_id":"04900000-0000-0000-0000-000000000002","title":"pgtap-049 работающему"}]}'::jsonb,
    '04900000-0000-0000-0000-0000000000c4'::uuid)->'task_ids')),
  1,
  'task: a working person of this company — goes through'
);

set local role postgres;
select is(
  (select count(*)::int from tasks where assignee_id = '04900000-0000-0000-0000-000000000002'),
  1,
  'exactly one task'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"04900000-0000-0000-0000-000000000001","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- 3. a repeating order
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select confirm_voice_batch(
    '{"source":"typed","transcript":"pgtap-049","confirmed_entities":[
       {"kind":"recurrence","assignee_id":"04900000-0000-0000-0000-000000000005","title":"pgtap-049 чужой повтор",
        "every":"week","interval":1,"weekdays":[1],"month_day":0,"due_time":"18:00"}]}'::jsonb,
    '04900000-0000-0000-0000-0000000000c5'::uuid)$$,
  'P0001', 'assignee_inactive',
  'recurrence: a person of another company — refused'
);

-- ---------------------------------------------------------------------------
-- 4. points by voice
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select confirm_voice_batch(
    '{"source":"typed","transcript":"pgtap-049","confirmed_entities":[
       {"kind":"points","assignee_id":"04900000-0000-0000-0000-000000000005","amount":5,"reason":"pgtap-049 чужому"}]}'::jsonb,
    '04900000-0000-0000-0000-0000000000c6'::uuid)$$,
  'P0001', 'assignee_inactive',
  'points on: a person of another company — refused'
);

set local role postgres;
update companies set settings = settings || '{"points_enabled": false}'::jsonb
 where id = '04900000-0000-0000-0000-00000000000a';
set local role authenticated;
set local request.jwt.claims = '{"sub":"04900000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select (confirm_voice_batch(
    '{"source":"typed","transcript":"pgtap-049","confirmed_entities":[
       {"kind":"points","assignee_id":"04900000-0000-0000-0000-000000000005","amount":5,"reason":"pgtap-049 чужому"}]}'::jsonb,
    '04900000-0000-0000-0000-0000000000c7'::uuid))->'skipped'->0->>'reason'),
  'points_disabled',
  'points off: skipped as before, no exception'
);

set local role postgres;
select is(
  (select count(*)::int from point_transactions where user_id = '04900000-0000-0000-0000-000000000005'),
  0,
  'nothing in the other company''s ledger'
);

select * from finish();
rollback;
