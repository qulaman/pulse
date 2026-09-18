-- Пульт ТВ (наряд 013A, D-76): состояние стены живёт строкой, командует только директор,
-- киоск читает и расписывается, сотрудник не видит и не командует.
-- Фикстуры — supabase/seed.sql: директор …0001, менеджер …0002, киоск …0004, Марат …0007.
begin;
select plan(33);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- 1. Директор ставит Марата на стену: фокус на 10 минут, версия 1
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select tv_control('employee', '10000000-0000-0000-0000-000000000007'::uuid) $$,
  'the director puts an employee on the wall'
);

select is((select mode from tv_state), 'employee', 'the row says employee');
select is((select employee_id from tv_state), '10000000-0000-0000-0000-000000000007'::uuid,
          'and it points at Марат');
select ok(
  (select expires_at between now() + interval '9 minutes' and now() + interval '11 minutes' from tv_state),
  'the focus dies in ten minutes'
);
select is((select version from tv_state), 1, 'the first command is version 1');

-- ---------------------------------------------------------------------------
-- 2. Сцена и гость меняются, не трогая фокус
-- ---------------------------------------------------------------------------
create temp table before_scene as select expires_at from tv_state;

select lives_ok(
  $$ select tv_control(null, null, null, 'clock', true) $$,
  'scene and guest change on their own'
);
select is((select scene from tv_state), 'clock', 'the scene is the clock now');
select is((select guest from tv_state), true, 'the visitor mask is on');
select is((select mode from tv_state), 'employee', 'and the focus is untouched');
select is((select expires_at from tv_state), (select expires_at from before_scene),
          'the focus deadline did not move');
select is((select version from tv_state), 2, 'the second command is version 2');

-- ---------------------------------------------------------------------------
-- 3. Кто видит строку: киоск и директор — да, остальные — нет
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is((select count(*) from tv_state), 1::bigint, 'the kiosk sees the row');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select is((select count(*) from tv_state), 0::bigint, 'the employee sees nothing');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*) from tv_state), 0::bigint, 'the manager sees nothing either');

-- ---------------------------------------------------------------------------
-- 4. Негатив: командует только директор и только осмысленным
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select throws_ok($$ select tv_control('ether') $$, 'P0001', 'forbidden',
                 'the employee cannot command the wall');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select throws_ok($$ select tv_control('ether') $$, 'P0001', 'forbidden',
                 'the kiosk cannot command itself');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select tv_control('employee', '10000000-0000-0000-0000-0000000000ff'::uuid) $$,
  'P0001', 'bad_employee', 'an unknown person is refused'
);
select throws_ok($$ select tv_control('ether', null, null, 'disco') $$,
                 'P0001', 'bad_scene', 'an unknown scene is refused');

-- ---------------------------------------------------------------------------
-- 5. tv_focus под гостем: имя без фамилии, ни одного заголовка
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is(
  (select tv_focus()->>'mode'), 'employee', 'the kiosk gets the focus'
);
select ok(
  (select position(' ' in (tv_focus()->'employee'->>'name')) = 0),
  'the guest sees a first name only (D-33)'
);
select ok(
  (select bool_and(task->>'title' is null)
     from jsonb_array_elements(tv_focus()->'tasks') task),
  'and no task title at all'
);

-- ---------------------------------------------------------------------------
-- 6. Гость выключен — имя и заголовки вернулись
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$ select tv_control(null, null, null, null, false) $$, 'the visitor mask goes off');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select ok(
  (select position(' ' in (tv_focus()->'employee'->>'name')) > 0
      and (tv_focus()->'tasks'->0->>'title') is not null),
  'the surname and the titles are back'
);

-- ---------------------------------------------------------------------------
-- 7. Квитанция экрана: расписывается только киоск
-- ---------------------------------------------------------------------------
select lives_ok($$ select tv_heartbeat(3) $$, 'the kiosk signs for what it rendered');

set local role postgres;
select is((select applied_version from tv_state), 3, 'the applied version is stored');
select ok((select seen_at is not null from tv_state), 'and the wall has been seen');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select throws_ok($$ select tv_heartbeat(3) $$, 'P0001', 'forbidden',
                 'an employee does not sign for the wall');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$ select tv_heartbeat(3) $$, 'P0001', 'forbidden',
                 'and neither does the director on a laptop');

-- ---------------------------------------------------------------------------
-- 8. Возврат в эфир гасит цель и срок
-- ---------------------------------------------------------------------------
select lives_ok($$ select tv_control('ether') $$, 'the director gives the wall back to the ether');

set local role postgres;
select ok(
  (select employee_id is null and expires_at is null and version = 4 from tv_state),
  'the focus is gone and the version moved on'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is((select tv_focus()->>'mode'), 'ether', 'and the kiosk is back on the ether');

-- ---------------------------------------------------------------------------
-- 9. Писать в строку не может никто: политик insert/update/delete нет вовсе
-- ---------------------------------------------------------------------------
select is(
  (with touched as (update tv_state set guest = true returning 1) select count(*) from touched),
  0::bigint,
  'the kiosk cannot write the row directly'
);
select is(
  (with gone as (delete from tv_state returning 1) select count(*) from gone),
  0::bigint,
  'and cannot delete it'
);

set local role postgres;
select * from finish();
rollback;
