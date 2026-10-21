-- Связка телефон–ТВ (D-144): у поручённого пункта на стене — нейтральная стадия (без отказов,
-- D-45), гостю — ни имён, ни стадий; смена статуса будит стену. Доска недели: только своя
-- живая доска, только директор; при доске совещания ждёт, в круге — на стене, завершённая
-- уходит из круга сама; чужая компания строки стены не видит.
-- Фикстуры — supabase/seed.sql: директор …0001, киоск …0004, исполнитель …0007.
begin;
select plan(24);

insert into companies (id, name) values ('99999999-9999-9999-9999-999999999999', 'Чужая компания 046');
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-000000000000', '99999999-0000-0000-0000-000000000046',
        'authenticated', 'authenticated', 'foreign046@demo.local', now(), now(), '', '', '', '', '', '', '', '');
insert into profiles (id, company_id, full_name, role) values
  ('99999999-0000-0000-0000-000000000046', '99999999-9999-9999-9999-999999999999', 'Чужой Директор', 'director');

-- handed points need real tasks behind them: one sent, one declined
insert into tasks (id, company_id, author_id, assignee_id, title, status)
values ('f0000000-0000-4000-8000-0000000000f1', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'Поручено 046', 'sent'),
       ('f0000000-0000-4000-8000-0000000000f2', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'Отказ 046', 'declined');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- M — the meeting's board, W — the week's
insert into mind_boards (id, company_id, user_id, title)
values ('f0000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Планёрка 046'),
       ('f0000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Неделя 046');
insert into notes (id, company_id, user_id, text, board_id, position, converted_task_id)
values ('f0000000-0000-4000-8000-0000000000a1', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Отгрузка', 'f0000000-0000-4000-8000-000000000001', 1,
        'f0000000-0000-4000-8000-0000000000f1'),
       ('f0000000-0000-4000-8000-0000000000a2', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Склад', 'f0000000-0000-4000-8000-000000000001', 2,
        'f0000000-0000-4000-8000-0000000000f2'),
       ('f0000000-0000-4000-8000-0000000000b1', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Итоги недели', 'f0000000-0000-4000-8000-000000000002', 1, null);

select tv_control(p_guest => false);
select tv_control(p_board => 'f0000000-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- 1. Стадии на стене
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is(tv_board(false)->'board'->'items'->0->>'stage', 'sent', 'a sent task says «отправлено» on the wall');
select is(tv_board(false)->'board'->'items'->1->>'stage', null, 'a declined one says nothing of it (D-45)');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select tv_control(p_board_guest => true);
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is(tv_board(true)->'board'->'items'->0->>'assignee', null, 'a guest sees no name');
select is(tv_board(true)->'board'->'items'->0->>'stage', null, 'and no stage');

-- the assignee accepts: the wall row moves, the stage follows
reset role;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
create temp table v0 as select version from tv_state where company_id = '11111111-1111-1111-1111-111111111111';
update tasks set status = 'accepted' where id = 'f0000000-0000-4000-8000-0000000000f1';
select ok((select version from tv_state where company_id = '11111111-1111-1111-1111-111111111111') > (select version from v0),
          'a task of a board on the wall wakes the wall when its status changes');
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is(tv_board(false)->'board'->'items'->0->>'stage', 'work', 'accepted — «в работе»');

-- ---------------------------------------------------------------------------
-- 2. Доска недели
-- ---------------------------------------------------------------------------
select throws_ok($$ select tv_week_board('f0000000-0000-4000-8000-000000000002') $$,
                 'P0001', 'forbidden', 'the kiosk does not choose the week board');
set local request.jwt.claims = '{"sub":"99999999-0000-0000-0000-000000000046","role":"authenticated"}';
select throws_ok($$ select tv_week_board('f0000000-0000-4000-8000-000000000002') $$,
                 'P0001', 'bad_board', 'another company''s director cannot put it in the round');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select tv_week_board('f0000000-0000-4000-8000-000000000002');
select is((select carousel from tv_state where company_id = '11111111-1111-1111-1111-111111111111'), false,
          'a meeting''s board on the wall keeps the wall: the round does not start');
select is((select week_board_id from tv_state where company_id = '11111111-1111-1111-1111-111111111111'),
          'f0000000-0000-4000-8000-000000000002'::uuid, 'the week board is set');
select is((select to_char(week_board_until at time zone 'Asia/Aqtobe', 'ID HH24:MI') from tv_state
            where company_id = '11111111-1111-1111-1111-111111111111'), '7 21:00', 'till Sunday 21:00');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is(tv_board(false)->'board'->>'id', 'f0000000-0000-4000-8000-000000000001', 'the meeting''s board stays on the wall');
select is(tv_board(false)->'board'->>'week', 'false', 'it is not the week board');

-- the meeting is over: the round takes the board down, the week board takes its turn
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select tv_board_control(p_point => 'f0000000-0000-4000-8000-0000000000a1');
select tv_control(p_carousel => true);
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is(tv_board(false)->'board'->>'id', 'f0000000-0000-4000-8000-000000000002', 'in the round the wall gets the week board');
select is(tv_board(false)->'board'->>'week', 'true', 'and knows it is the week''s');
select is(tv_board(false)->'board'->>'focus', null, 'no presenter''s light on it');

-- finished, it leaves the round by itself
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
update mind_boards set finished_at = now() where id = 'f0000000-0000-4000-8000-000000000002';
select is((select week_board_id from tv_state where company_id = '11111111-1111-1111-1111-111111111111'), null,
          'a finished board leaves the round');
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is(tv_board(false)->'board', 'null'::jsonb, 'and the wall has no board then');

-- another company does not see the wall row at all
set local request.jwt.claims = '{"sub":"99999999-0000-0000-0000-000000000046","role":"authenticated"}';
select is((select count(*) from tv_state where company_id = '11111111-1111-1111-1111-111111111111'), 0::bigint,
          'another company does not see the week board');

-- the quiet clock of a meeting stays; on the face the week board starts the round; null takes it off
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select tv_control(p_scene => 'clock');
select tv_week_board('f0000000-0000-4000-8000-000000000001');
select is((select carousel from tv_state where company_id = '11111111-1111-1111-1111-111111111111'), false,
          'a scene picked by hand stays: the round does not start over the clock');
select tv_control(p_scene => 'face');
select tv_week_board('f0000000-0000-4000-8000-000000000001');
select is((select carousel from tv_state where company_id = '11111111-1111-1111-1111-111111111111'), true,
          'on the face the week board puts the wall on the round');
-- a guest never sees the week board, «Показать гостю» or not (D-33)
select tv_control(p_board_guest => true);
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is(tv_board(true)->>'hidden', 'true', 'a guest in the office: the week board is hidden');
select is(tv_board(true)->'board', 'null'::jsonb, 'nothing of it goes to the wall');
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select tv_week_board(null);
select is((select week_board_id from tv_state where company_id = '11111111-1111-1111-1111-111111111111'), null,
          'and leaves it on a word');

select * from finish();
rollback;
