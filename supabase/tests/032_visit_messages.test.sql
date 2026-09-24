-- «Сообщение на экран» (D-116): секретарь пишет — стена показывает, директор отвечает
-- «Понятно», гостю слова не показываются; «Пусть заходит» больше не пишет «Заходите».
-- Фикстуры — supabase/seed.sql: директор …0001, киоск …0004, Айгуль …0008 (здесь —
-- секретарь). Счёт — только по своим строкам (`created_at = now()` постоянен в транзакции):
-- файл проходит и на свежей базе, и на dev с живыми визитами.
begin;
select plan(33);

-- роль меняет только директор (trg_profiles_guard): сначала его claims
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
update profiles set role = 'secretary' where id = '10000000-0000-0000-0000-000000000008';

create temp table ver0 as
select coalesce(
  (select s.version from tv_state s
    where s.company_id = (select company_id from profiles where id = '10000000-0000-0000-0000-000000000001')),
  0
) as v;
grant select on ver0 to authenticated;
-- the wall starts without a guest (dev keeps whatever the remote said last)
update tv_state s set guest = false, guest_until = null
  from profiles p where p.id = '10000000-0000-0000-0000-000000000001' and s.company_id = p.company_id;

set local role authenticated;

-- ---------------------------------------------------------------------------
-- 1. Секретарь пишет: строка вида message, пуш директору, версия стены +1
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated"}';
select throws_ok($$ select announce_visit('  ', null, 'message') $$, 'P0001', 'empty_message',
                 'a message without words is not sent');
select throws_ok($$ select announce_visit('что-то', null, 'letter') $$, 'P0001', 'bad_kind',
                 'an unknown kind is refused');

create temp table m1 as
select (announce_visit('Звонил Ахметов, просит перезвонить', '7b000000-0000-0000-0000-000000000001', 'message')).id as id;

select is((select kind from visits where id = (select id from m1)), 'message', 'the row is a message');
select is((select status from visits where id = (select id from m1)), 'waiting', 'it waits to be read');
select is(
  (select (announce_visit('Звонил Ахметов, просит перезвонить', '7b000000-0000-0000-0000-000000000001', 'message')).id),
  (select id from m1),
  'a replay of the same request returns the same message'
);
select is((select count(*) from visits where created_at = now()), 1::bigint, 'and creates no second one');

set local role postgres;
select is(
  (select count(*) from notification_deliveries where event_kind = 'visit_message'
     and user_id = '10000000-0000-0000-0000-000000000001' and meta->>'visit_id' = (select id from m1)::text),
  1::bigint,
  'the director got one push'
);
select is(
  (select category from notification_deliveries where meta->>'visit_id' = (select id from m1)::text limit 1),
  'secretary',
  'filed under «Секретарь» in the director''s settings'
);
select is(
  (select s.version from tv_state s join profiles p on p.company_id = s.company_id
    where p.id = '10000000-0000-0000-0000-000000000001'),
  (select v + 1 from ver0),
  'the wall heard of it'
);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- 2. Стена: слова секретаря, квитанция
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is((select tv_overlay()->'message'->>'note'), 'Звонил Ахметов, просит перезвонить', 'the wall shows the words');
select is((select (tv_overlay()->>'messages')::int), 1, 'one message unread');
select isnt((select tv_overlay()->'visit'->>'id'), (select id from m1)::text, 'and it is not a visitor');
select lives_ok(format('select tv_heartbeat(%s)', (select v + 1 from ver0)), 'the kiosk acks the new version');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated"}';
select isnt((select shown_at from visits where id = (select id from m1)), null::timestamptz, 'the secretary sees «на экране»');

-- ---------------------------------------------------------------------------
-- 3. Директор: «Понятно» — только сообщению и только директор
-- ---------------------------------------------------------------------------
select throws_ok($$ select answer_visit((select id from m1), 'read') $$, 'P0001', 'forbidden',
                 'the secretary does not read for the director');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$ select answer_visit((select id from m1), 'invited') $$, 'P0001', 'bad_answer',
                 'a message is not let in');
select lives_ok($$ select answer_visit((select id from m1), 'read') $$, 'the director reads it');
select is((select status from visits where id = (select id from m1)), 'read', 'the message is read');
select lives_ok($$ select answer_visit((select id from m1), 'read') $$, 'reading twice is harmless');
select is((select tv_overlay()->'message'), 'null'::jsonb, 'and it leaves the wall');

set local role postgres;
select is(
  (select count(*) from notification_deliveries
    where event_kind = 'visit_answered' and meta->>'visit_id' = (select id from m1)::text),
  0::bigint,
  '«прочитал» is not pushed to the secretary: the card turns live'
);
select is(
  (select count(*) from notification_deliveries
    where event_kind = 'visit_message' and status = 'queued' and meta->>'visit_id' = (select id from m1)::text),
  0::bigint,
  'the director''s push that had not left is dropped: the words were read on the wall'
);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- 4. Гость в кабинете: сообщение — без слов, посетитель — без имени
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated"}';
create temp table m2 as
select (announce_visit('Жена просила перезвонить', null, 'message')).id as id;
create temp table v1 as
select (announce_visit('Иванов, по поставкам', null)).id as id;
select is((select kind from visits where id = (select id from v1)), 'visitor', 'the old call is still a visitor');

set local role postgres;
update tv_state s set guest = true, guest_until = null
  from profiles p where p.id = '10000000-0000-0000-0000-000000000001' and s.company_id = p.company_id;
set local role authenticated;

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is((select tv_overlay()->'message'->>'id'), (select id from m2)::text, 'the newest message is on the wall');
select is((select tv_overlay()->'message'->>'note'), null, 'but a guest does not see its words (D-33)');

-- ---------------------------------------------------------------------------
-- 5. «Пусть заходит» — надпись о посетителе просто уходит, «Заходите» нет
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$ select answer_visit((select id from v1), 'read') $$, 'P0001', 'bad_answer',
                 'a visitor is not «read»');
select lives_ok($$ select answer_visit((select id from v1), 'invited') $$, 'the director lets the visitor in');
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select isnt(
  (select coalesce(tv_overlay()->'visit'->>'id', '')),
  (select id from v1)::text,
  'the wall says nothing to a visitor who is not in the room'
);

-- ---------------------------------------------------------------------------
-- 6. Без «Понятно» — 30 минут, секретарь узнаёт
-- ---------------------------------------------------------------------------
set local role postgres;
update visits set created_at = now() - interval '25 minutes' where id = (select id from m2);
select lives_ok($$ select visits_due_expiry() $$, 'the minute tick runs at twenty-five minutes');
select is((select status from visits where id = (select id from m2)), 'waiting', 'and the message still hangs');
update visits set created_at = now() - interval '31 minutes' where id = (select id from m2);
select lives_ok($$ select visits_due_expiry() $$, 'the minute tick runs at thirty-one minutes');
select is((select status from visits where id = (select id from m2)), 'expired', 'thirty minutes without «Понятно» — it leaves the wall');
select is(
  (select meta->>'title' from notification_deliveries
    where event_kind = 'visit_answered' and meta->>'visit_id' = (select id from m2)::text),
  'Директор не прочитал',
  'and the secretary learns it'
);

select * from finish();
rollback;
