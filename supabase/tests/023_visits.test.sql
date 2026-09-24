-- «К вам посетитель» (D-96): объявляет секретарь, отвечает директор, стена узнаёт через
-- версию tv_state и расписывается квитанцией, текст секретаря гостю не показывается.
-- Фикстуры — supabase/seed.sql: директор …0001, менеджер …0002, киоск …0004, Марат …0007,
-- Айгуль …0008 (здесь — секретарь).
begin;
select plan(36);

-- роль меняет только директор (trg_profiles_guard): сначала его claims
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
update profiles set role = 'secretary' where id = '10000000-0000-0000-0000-000000000008';

set local role authenticated;

-- ---------------------------------------------------------------------------
-- 1. Секретарь объявляет: строка, пуш директору сразу, версия стены +1
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated"}';
create temp table v1 as
select (announce_visit('Иванов, по поставкам', '7a000000-0000-0000-0000-000000000001')).id as id;

select is((select count(*) from visits), 1::bigint, 'the secretary sees the visit');
select is((select status from visits), 'waiting', 'it waits for the director');
select is((select tv_version from visits), 1, 'it rode on the wall''s first version');

select is(
  (select (announce_visit('Иванов, по поставкам', '7a000000-0000-0000-0000-000000000001')).id),
  (select id from v1),
  'a replay of the same request returns the same visit'
);
select is((select count(*) from visits), 1::bigint, 'and creates no second one');

set local role postgres;
select is(
  (select count(*) from notification_deliveries where event_kind = 'visit_arrived'
     and user_id = '10000000-0000-0000-0000-000000000001'),
  1::bigint,
  'the director got one push'
);
select ok(
  (select bool_and(deliver_after <= now()) from notification_deliveries where event_kind = 'visit_arrived'),
  'and it never waits for the delivery window (D-38 does not apply)'
);
select is((select version from tv_state), 1, 'the wall row was born at version 1');
set local role authenticated;

-- ---------------------------------------------------------------------------
-- 2. Кто видит: директор и секретарь — да; сотрудник, менеджер, киоск — нет
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select count(*) from visits), 1::bigint, 'the director sees it');
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select is((select count(*) from visits), 0::bigint, 'an employee does not');
select throws_ok($$ select announce_visit('я', null) $$, 'P0001', 'forbidden', 'and cannot announce');
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*) from visits), 0::bigint, 'the manager does not see it either');
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is((select count(*) from visits), 0::bigint, 'the kiosk never reads the table');

-- ---------------------------------------------------------------------------
-- 3. Стена: надпись с текстом, квитанция по версии
-- ---------------------------------------------------------------------------
select is((select tv_overlay()->'visit'->>'status'), 'waiting', 'the wall gets the notice');
select is((select tv_overlay()->'visit'->>'note'), 'Иванов, по поставкам', 'with the secretary''s words');
select is((select (tv_overlay()->>'waiting')::int), 1, 'one visitor waits');

select lives_ok($$ select tv_heartbeat(1) $$, 'the kiosk acks version 1');
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated"}';
select isnt((select shown_at from visits), null::timestamptz, 'and the secretary sees «на экране»');

-- ---------------------------------------------------------------------------
-- 4. Отвечает только директор
-- ---------------------------------------------------------------------------
select throws_ok($$ select answer_visit((select id from v1), 'invited') $$, 'P0001', 'forbidden',
                 'the secretary does not answer for the director');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$ select answer_visit((select id from v1), 'maybe') $$, 'P0001', 'bad_answer',
                 'an unknown answer is refused');

select lives_ok($$ select answer_visit((select id from v1), 'wait') $$, 'the director asks to wait');
select is((select status from visits), 'wait', 'the visit waits');
select lives_ok($$ select answer_visit((select id from v1), 'wait') $$, 'the same answer twice is harmless');

select lives_ok($$ select answer_visit((select id from v1), 'invited') $$, 'then lets them in');
select is((select status from visits), 'invited', 'the visit is invited');
select ok((select guest from tv_state), 'the wall switched guest mode on by itself');
select ok(
  (select guest_until between now() + interval '59 minutes' and now() + interval '61 minutes' from tv_state),
  'for an hour'
);
select throws_ok($$ select answer_visit((select id from v1), 'declined') $$, 'P0001', 'bad_transition',
                 'a decided visit is decided');

-- ---------------------------------------------------------------------------
-- 5. Приглашённый уходит со стены: «Заходите» там никто не видит (D-116 §1);
--    маска гостя для текста секретаря — в 032
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is((select tv_overlay()->'visit'), 'null'::jsonb, 'the invited visitor leaves the wall at once');
select is((select (tv_overlay()->>'waiting')::int), 0, 'nobody waits any more');

set local role postgres;
select is(
  (select count(*) from notification_deliveries where event_kind = 'visit_answered'
     and user_id = '10000000-0000-0000-0000-000000000008'),
  2::bigint,
  'the secretary heard both answers'
);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- 6. Закрытие и истечение
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated"}';
select lives_ok($$ select close_visit((select id from v1)) $$, 'the secretary puts the card away');
select isnt((select closed_at from visits), null::timestamptz, 'the visit is closed');

select lives_ok($$ select announce_visit(null, null) $$, 'a visitor without a name is fine too');
set local role postgres;
update visits set created_at = now() - interval '25 minutes' where closed_at is null;
select is(visits_due_expiry(), 1, 'twenty minutes without an answer — the notice goes out');
select is((select status from visits where closed_at is null), 'expired', 'and the secretary learns it');

select * from finish();
rollback;
