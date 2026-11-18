-- Стена v5 (D-182): крупность и отметка выбора заставки в строке стены, здоровье киоска в
-- квитанции, надписи гаснут по возрасту без тика, новые поля сводки — программа дня, итог дня и
-- недели, объявление, темп, встречи директора; гостю — нули и ни очков, ни объявления; чужая
-- компания не видит ни строки стены, ни сводки, ни надписей.
-- Фикстуры — supabase/seed.sql: директор …0001, киоск …0004, Ерлан …0005, Марат …0007.
-- На dev роли и имена дрейфуют — прибиваем их здесь; чужие живые визиты закрываем внутри
-- транзакции, свои строки ищем по id (файл проходит и на свежей базе, и на dev).
begin;
select plan(77);

set local role postgres;
set local request.jwt.claims = '{}';

update profiles set role = 'director', is_active = true where id = '10000000-0000-0000-0000-000000000001';
update profiles set role = 'tv', is_active = true where id = '10000000-0000-0000-0000-000000000004';
update profiles set role = 'employee', is_active = true where id = '10000000-0000-0000-0000-000000000005';
update profiles set role = 'employee', is_active = true, full_name = 'Марат Оспанов'
 where id = '10000000-0000-0000-0000-000000000007';
update companies set settings = settings || '{"points_enabled": true}'::jsonb
 where id = '11111111-1111-1111-1111-111111111111';
update tv_state set guest = false, guest_until = null
 where company_id = '11111111-1111-1111-1111-111111111111';

-- the other company: its director and its kiosk
insert into companies (id, name) values ('99999999-9999-9999-9999-999999999056', 'Чужая компания 056');
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-000000000000', '99999999-0000-0000-0000-000000000561',
        'authenticated', 'authenticated', 'foreign056d@demo.local', now(), now(), '', '', '', '', '', '', '', ''),
       ('00000000-0000-0000-0000-000000000000', '99999999-0000-0000-0000-000000000562',
        'authenticated', 'authenticated', 'foreign056t@demo.local', now(), now(), '', '', '', '', '', '', '', '');
insert into profiles (id, company_id, full_name, role) values
  ('99999999-0000-0000-0000-000000000561', '99999999-9999-9999-9999-999999999056', 'Чужой Директор', 'director'),
  ('99999999-0000-0000-0000-000000000562', '99999999-9999-9999-9999-999999999056', 'Чужой Экран', 'tv');

-- ---------------------------------------------------------------------------
-- 1. Колонки строки стены
-- ---------------------------------------------------------------------------
select has_column('public', 'tv_state', 'scene_set_at', 'the wall row knows when a scene was picked');
select has_column('public', 'tv_state', 'scale', 'the wall row keeps the size of its text');
select has_column('public', 'tv_state', 'health', 'the wall row keeps the kiosk''s report');
select col_not_null('public', 'tv_state', 'scale', 'the size is never empty');
select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'tv_state' and column_name = 'scale'),
  '100',
  'a new wall starts at 100 %'
);

insert into tv_state (company_id) values ('99999999-9999-9999-9999-999999999056');
select is((select scale from tv_state where company_id = '99999999-9999-9999-9999-999999999056'), 100::smallint,
          'the other company''s row is born at 100 %');
select is((select scene_set_at from tv_state where company_id = '99999999-9999-9999-9999-999999999056'), null,
          'with no scene picked yet');
select throws_ok(
  $$ update tv_state set scale = 120 where company_id = '99999999-9999-9999-9999-999999999056' $$,
  '23514', null, 'only 100, 115 or 130'
);
select throws_ok(
  $$ update tv_state set health = '[1, 2]'::jsonb where company_id = '99999999-9999-9999-9999-999999999056' $$,
  '23514', null, 'the report is an object'
);
select throws_ok(
  format($q$ update tv_state set health = %L::jsonb where company_id = '99999999-9999-9999-9999-999999999056' $q$,
         jsonb_build_object('junk', repeat('x', 5000))),
  '23514', null, 'and a small one'
);

-- ---------------------------------------------------------------------------
-- 2. tv_control: «Крупность» и отметка выбора заставки
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok($$ select tv_control(p_guest => false) $$, 'the wall row is there');
select lives_ok($$ select tv_control(p_scale => 115) $$, 'the remote makes the text larger');
select is((select scale from tv_state), 115::smallint, 'the row keeps 115');
select throws_ok($$ select tv_control(p_scale => 120) $$, 'P0001', 'bad_scale', 'another size is refused');

set local role postgres;
update tv_state set scene_set_at = '2000-01-01T00:00:00Z'
 where company_id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;

select lives_ok($$ select tv_control(p_clock => 'analog') $$, 'the clock style');
select is((select scene_set_at from tv_state), '2000-01-01T00:00:00Z'::timestamptz, 'is not a pick: the mark stays');
select is((select scale from tv_state), 115::smallint, 'and the size stays as it was');
select lives_ok($$ select tv_control(p_scene => 'clock') $$, 'a scene picked by hand');
select is((select scene_set_at from tv_state), now(), 'marks the moment');

set local role postgres;
update tv_state set scene_set_at = '2000-01-01T00:00:00Z'
 where company_id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;

select lives_ok($$ select tv_control(p_carousel => true) $$, 'the round switched on');
select is((select scene_set_at from tv_state), now(), 'marks the moment too');

-- the owner's remote is older than this file: the old calls stay valid
select lives_ok($$ select tv_control(null, null, null, 'face', false) $$, 'an older remote''s positional call');
select lives_ok($$ select tv_control(p_scene => 'face', p_carousel => false, p_board_minutes => null) $$,
                'and its named call without the size');
select is((select scale from tv_state), 115::smallint, 'neither touches the size');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select throws_ok($$ select tv_control(p_scale => 130) $$, 'P0001', 'forbidden', 'the kiosk does not size itself');

-- ---------------------------------------------------------------------------
-- 3. tv_heartbeat: здоровье киоска — только сам киоск, только своя строка
-- ---------------------------------------------------------------------------
select lives_ok($$ select tv_heartbeat(p_applied_version => null, p_health => '{"build":"v5","wake":true}'::jsonb) $$,
                'the kiosk reports how it lives');
select is((select health->>'build' from tv_state), 'v5', 'the report is on the wall row');
select lives_ok($$ select tv_heartbeat(7) $$, 'an older kiosk signs without a report');
select is((select applied_version from tv_state), 7, 'its receipt counts');
select is((select health->>'build' from tv_state), 'v5', 'and the last report stays');
select lives_ok(
  format('select tv_heartbeat(null, %L::jsonb)', jsonb_build_object('junk', repeat('x', 5000))),
  'too big a report — the receipt still counts'
);
select is((select health->>'build' from tv_state), 'v5', 'the oversize report is not written');
select lives_ok($$ select tv_heartbeat(null, '[1, 2]'::jsonb) $$, 'not an object — the receipt counts');
select is((select health->>'build' from tv_state), 'v5', 'and the report is not written either');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select throws_ok($$ select tv_heartbeat(null, '{"build":"x"}'::jsonb) $$, 'P0001', 'forbidden',
                 'an employee does not report for the wall');
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$ select tv_heartbeat(null, '{"build":"x"}'::jsonb) $$, 'P0001', 'forbidden',
                 'nor does the director on a laptop');
select is((select health->>'build' from tv_state), 'v5', 'the director reads the report of his wall');

-- ---------------------------------------------------------------------------
-- 4. Надписи гаснут по возрасту, не дожидаясь тика (D-96, D-116)
-- ---------------------------------------------------------------------------
set local role postgres;
set local request.jwt.claims = '{}';
update visits set closed_at = now()
 where company_id = '11111111-1111-1111-1111-111111111111' and closed_at is null;
insert into visits (company_id, author_id, kind, status, note, created_at, answered_at) values
  ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000007', 'visitor', 'waiting',
   'Вчерашний посетитель 056', now() - interval '25 minutes', null),
  ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000007', 'visitor', 'wait',
   'Давно ждёт 056', now() - interval '90 minutes', now() - interval '70 minutes'),
  ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000007', 'message', 'waiting',
   'Старое сообщение 056', now() - interval '35 minutes', null);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is((select tv_overlay()->>'visit'), null, 'a visitor waiting over 20 minutes is off the wall');
select is((select (tv_overlay()->>'waiting')::int), 0, 'and «подождёт» over an hour after the answer too');
select is((select tv_overlay()->>'message'), null, 'a message over 30 minutes old is off the wall');
select is((select (tv_overlay()->>'messages')::int), 0, 'and not counted');

set local role postgres;
set local request.jwt.claims = '{}';
insert into visits (company_id, author_id, kind, status, note, created_at, answered_at) values
  ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000007', 'visitor', 'waiting',
   'Свежий посетитель 056', now() - interval '5 minutes', null),
  ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000007', 'visitor', 'wait',
   'Ждёт после ответа 056', now() - interval '80 minutes', now() - interval '30 minutes'),
  ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000007', 'message', 'waiting',
   'Свежее сообщение 056', now() - interval '10 minutes', null);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is((select tv_overlay()->'visit'->>'note'), 'Свежий посетитель 056', 'a fresh visitor is on the wall');
select is((select (tv_overlay()->>'waiting')::int), 2,
          '«подождёт» counts its hour from the director''s answer, not from the arrival');
select is((select tv_overlay()->'message'->>'note'), 'Свежее сообщение 056', 'a fresh message is on the wall');

-- ---------------------------------------------------------------------------
-- 5. Сводка стены v5: программа, встречи директора, загрузка, объявление, итоги, темп
-- ---------------------------------------------------------------------------
set local role postgres;
set local request.jwt.claims = '{}';

update companies
   set settings = settings
                  || '{"delivery_window": {"from": "09:00", "to": "20:00"}}'::jsonb
                  || jsonb_build_object('daily_report', coalesce(settings->'daily_report', '{}'::jsonb) || '{"ask_from": "16:30"}'::jsonb)
 where id = '11111111-1111-1111-1111-111111111111';

-- three meetings right at the head of the list: the director's own, one without him, one he is invited to
insert into events (id, company_id, author_id, title, starts_at) values
  ('e5600000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', 'Планёрка директора 056', now() - interval '29 minutes'),
  ('e5600000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000007', 'Без директора 056', now() - interval '28 minutes'),
  ('e5600000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000007', 'Директор позван 056', now() - interval '27 minutes');
insert into event_participants (event_id, user_id, status) values
  ('e5600000-0000-4000-8000-000000000002', '10000000-0000-0000-0000-000000000005', 'going'),
  ('e5600000-0000-4000-8000-000000000003', '10000000-0000-0000-0000-000000000001', 'invited');

-- Марат handed one in today, the director gave him a reward; today's announcement, read by two
insert into tasks (id, company_id, author_id, assignee_id, title, status, source)
values ('f5600000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007',
        'Стена v5: сдано', 'sent', 'typed');
-- the guard's matrix, step by step: without a user every edge of it passes
update tasks set status = 'accepted' where id = 'f5600000-0000-4000-8000-000000000001';
update tasks set status = 'pending_review' where id = 'f5600000-0000-4000-8000-000000000001';
update tasks set status = 'done' where id = 'f5600000-0000-4000-8000-000000000001';
insert into point_transactions (company_id, user_id, amount, reason, source)
values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000007', 50000000,
        'Стена v5: награда', 'manual');
insert into announcements (id, company_id, author_id, transcript)
values ('a5600000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', '  Завтра субботник в 10:00  ');
insert into announcement_acks (announcement_id, user_id) values
  ('a5600000-0000-4000-8000-000000000001', '10000000-0000-0000-0000-000000000005'),
  ('a5600000-0000-4000-8000-000000000001', '10000000-0000-0000-0000-000000000007'),
  ('a5600000-0000-4000-8000-000000000001', '10000000-0000-0000-0000-000000000001');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
create temp table s as select tv_summary(false) as j;

select is((select j->'program' from s),
          '{"night_from": "20:00", "night_to": "09:00", "evening_from": "16:30"}'::jsonb,
          'the program: night after the delivery window, evening from the report hour');
select is((select e->>'director' from s, jsonb_array_elements(s.j->'events') e
            where e->>'id' = 'e5600000-0000-4000-8000-000000000001'), 'true', 'the director''s own meeting is his');
select is((select e->>'director' from s, jsonb_array_elements(s.j->'events') e
            where e->>'id' = 'e5600000-0000-4000-8000-000000000002'), 'false', 'a meeting without him is not');
select is((select e->>'director' from s, jsonb_array_elements(s.j->'events') e
            where e->>'id' = 'e5600000-0000-4000-8000-000000000003'), 'true', 'a meeting he is invited to is his');

select ok((select bool_and((l->>'overdue')::int = 0) from s, jsonb_array_elements(s.j->'load') l),
          'no overdue by name on the wall (D-45)');
select ok((select (l->>'done_today')::int >= 1 from s, jsonb_array_elements(s.j->'load') l
            where l->>'name' = 'Марат Оспанов'),
          'what a person handed in today');

select is((select j->'announcement'->>'id' from s), 'a5600000-0000-4000-8000-000000000001', 'today''s latest announcement');
select is((select j->'announcement'->>'text' from s), 'Завтра субботник в 10:00', 'its words, trimmed');
select is((select (j->'announcement'->>'acks')::int from s), 2, 'read by two — the author is not counted');

select ok((select (j->'day'->>'done')::int >= 1 and (j->'day'->>'people')::int >= 1 from s),
          'the day: accepted work and the people who handed it in');
select ok((select (j->'day'->>'points')::bigint >= 50000000 from s), 'the day: points earned');
select ok((select exists (select 1 from jsonb_array_elements(j->'day'->'awards') a
                           where a->>'reason' = 'Стена v5: награда' and a->>'name' = 'Марат Оспанов') from s),
          'the day: the award with its reason');
select ok((select (j->'week_result'->>'done')::int >= 1
                  and jsonb_typeof(j->'week_result'->'best_day') = 'object'
                  and (j->'week_result'->>'points')::bigint >= 50000000 from s),
          'the week sums up: accepted, the best day, points');
select is((select j->'week_result'->>'leader' from s), 'Марат Оспанов', 'the week''s leader by points');
select ok((select (j->'pace'->>'done')::int = (j->'day'->>'done')::int
                  and (j->'pace'->>'usual_now')::numeric <= (j->'pace'->>'usual_day')::numeric
                  and (j->'pace'->>'best_day')::int >= 0 from s),
          'the pace: today, a usual day by now and in all, a record');

-- the director declines the invitation: the meeting is not his any more
set local role postgres;
update event_participants set status = 'declined'
 where event_id = 'e5600000-0000-4000-8000-000000000003' and user_id = '10000000-0000-0000-0000-000000000001';
set local role authenticated;
select is((select e->>'director' from jsonb_array_elements(tv_summary(false)->'events') e
            where e->>'id' = 'e5600000-0000-4000-8000-000000000003'), 'false', 'a declined invitation is not his');

-- ---------------------------------------------------------------------------
-- 6. Гость в кабинете (D-33): нули, ни объявления, ни очков, лидер без фамилии
-- ---------------------------------------------------------------------------
create temp table g as select tv_summary(true) as j;

select is((select j->'counts' from g), '{"overdue": 0, "declined": 0, "review": 0, "questions": 0}'::jsonb,
          'a guest gets zeros in the verdict');
select is((select j->>'announcement' from g), null, 'no announcement for a guest');
select is((select j->'day'->>'points' from g), null, 'no points of the day');
select is((select j->'day'->'awards' from g), '[]'::jsonb, 'no awards of the day');
select is((select j->'week_result'->>'points' from g), null, 'no points of the week');
select is((select j->'week_result'->>'leader' from g), 'Марат', 'the leader by first name only');
select ok((select bool_and(e->>'title' is null) from g, jsonb_array_elements(g.j->'events') e),
          'and no meeting titles, as before');

-- ---------------------------------------------------------------------------
-- 7. Чужая компания: ни строки стены, ни сводки, ни надписей
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"99999999-0000-0000-0000-000000000561","role":"authenticated"}';
select is((select count(*) from tv_state where company_id = '11111111-1111-1111-1111-111111111111'), 0::bigint,
          'another company''s director does not see this wall''s row, its report included');
select lives_ok($$ select tv_control(p_scale => 130) $$, 'he sizes his own wall');

set local request.jwt.claims = '{"sub":"99999999-0000-0000-0000-000000000562","role":"authenticated"}';
select lives_ok($$ select tv_heartbeat(1, '{"build":"other"}'::jsonb) $$, 'the other kiosk reports');
create temp table sb as select tv_summary(false) as j;
select is((select j->>'announcement' from sb), null, 'the other kiosk gets no announcement of ours');
select ok((select not exists (select 1 from jsonb_array_elements(j->'events') e where e->>'id' like 'e5600000-%') from sb),
          'nor our meetings');
select is((select (j->'day'->>'done')::int from sb), 0, 'nor our accepted work');
select is((select j->'week_result'->>'leader' from sb), null, 'nor our leader');
select is((select tv_overlay()->>'visit'), null, 'nor our visitor');

set local role postgres;
set local request.jwt.claims = '{}';
select is((select scale from tv_state where company_id = '11111111-1111-1111-1111-111111111111'), 115::smallint,
          'this wall keeps its size');
select is((select health->>'build' from tv_state where company_id = '11111111-1111-1111-1111-111111111111'), 'v5',
          'and its report');

select * from finish();
rollback;
