-- Доски v3 (D-140): закрепить и завершить, ветка едет за пунктом на другую доску, «Новая доска
-- из этой», срок доски на стене по выбору и «+30 минут».
-- Фикстуры — supabase/seed.sql: директор …0001, второй директор …0009, киоск …0004, Марат …0007.
-- Чужая компания — своя, внутри отката. Счёт — только своих строк.
begin;
select plan(36);

update profiles set role = 'employee' where id = '10000000-0000-0000-0000-000000000007';
update profiles set role = 'director' where id = '10000000-0000-0000-0000-000000000009';

insert into companies (id, name) values ('99999999-9999-9999-9999-999999999999', 'Чужая компания 044');
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-000000000000', '99999999-0000-0000-0000-000000000044',
        'authenticated', 'authenticated', 'foreign044@demo.local', now(), now(), '', '', '', '', '', '', '', '');
insert into profiles (id, company_id, full_name, role) values
  ('99999999-0000-0000-0000-000000000044', '99999999-9999-9999-9999-999999999999', 'Чужой Директор', 'director');

-- a handed point needs a real task behind it
insert into tasks (id, company_id, author_id, assignee_id, title, status)
values ('d0000000-0000-4000-8000-0000000000f1', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'Поручено 044', 'sent');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- boards A, B (the director's) and S (the source of a copy)
insert into mind_boards (id, company_id, user_id, title)
values ('d0000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Доска A 044'),
       ('d0000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Доска B 044'),
       ('d0000000-0000-4000-8000-000000000003', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Планёрка · 20 окт.');

-- ---------------------------------------------------------------------------
-- 1. Закрепить и завершить — только автор
-- ---------------------------------------------------------------------------
select lives_ok($$
  update mind_boards set pinned_at = now(), finished_at = now() where id = 'd0000000-0000-4000-8000-000000000001'
$$, 'the author pins and finishes a board');
select is((select pinned_at from mind_boards where id = 'd0000000-0000-4000-8000-000000000001'), now(), 'pinned');
select is((select finished_at from mind_boards where id = 'd0000000-0000-4000-8000-000000000001'), now(), 'finished');
update mind_boards set finished_at = null where id = 'd0000000-0000-4000-8000-000000000001';

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000009","role":"authenticated"}';
update mind_boards set pinned_at = null where id = 'd0000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"99999999-0000-0000-0000-000000000044","role":"authenticated"}';
update mind_boards set pinned_at = null where id = 'd0000000-0000-4000-8000-000000000001';
select is((select count(*) from mind_boards where id = 'd0000000-0000-4000-8000-000000000001'), 0::bigint,
          'another company does not see the board');
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select pinned_at from mind_boards where id = 'd0000000-0000-4000-8000-000000000001'), now(),
          'neither another director nor another company unpins it');

-- ---------------------------------------------------------------------------
-- 2. Пункт переезжает на другую доску вместе с веткой
-- ---------------------------------------------------------------------------
insert into notes (id, company_id, user_id, text, board_id, position)
values ('d0000000-0000-4000-8000-0000000000a1', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Новый склад', 'd0000000-0000-4000-8000-000000000001', 1),
       ('d0000000-0000-4000-8000-0000000000a2', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Продажи', 'd0000000-0000-4000-8000-000000000001', 2);
insert into notes (id, company_id, user_id, text, board_id, parent_id, position)
values ('d0000000-0000-4000-8000-0000000000c1', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Аренда', 'd0000000-0000-4000-8000-000000000001',
        'd0000000-0000-4000-8000-0000000000a1', 1),
       ('d0000000-0000-4000-8000-0000000000c2', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Охрана', 'd0000000-0000-4000-8000-000000000001',
        'd0000000-0000-4000-8000-0000000000a1', 2);
update notes set deleted_at = now() - interval '1 hour' where id = 'd0000000-0000-4000-8000-0000000000c2';

select lives_ok($$
  update notes set board_id = 'd0000000-0000-4000-8000-000000000002', position = 7
   where id = 'd0000000-0000-4000-8000-0000000000a1'
$$, 'a point moves to another board');
select is((select count(*) from notes
            where parent_id = 'd0000000-0000-4000-8000-0000000000a1'
              and board_id = 'd0000000-0000-4000-8000-000000000002'), 2::bigint,
          'its sub-points follow it, the one in the bin too');
select is((select count(*) from notes where board_id = 'd0000000-0000-4000-8000-000000000001' and deleted_at is null),
          1::bigint, 'the old board keeps the rest');
update notes set deleted_at = null where id = 'd0000000-0000-4000-8000-0000000000c2';
select is((select parent_id from notes where id = 'd0000000-0000-4000-8000-0000000000c2'),
          'd0000000-0000-4000-8000-0000000000a1'::uuid, 'a sub-point back from the bin is back under its point');
select throws_ok($$
  update notes set board_id = 'd0000000-0000-4000-8000-000000000001' where id = 'd0000000-0000-4000-8000-0000000000c1'
$$, 'P0001', 'bad_parent', 'a sub-point does not leave its point for another board');

-- a loose thought goes onto a board
insert into notes (id, company_id, user_id, text)
values ('d0000000-0000-4000-8000-0000000000e1', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Мысль к планёрке');
select lives_ok($$
  update notes set board_id = 'd0000000-0000-4000-8000-000000000002', position = 8
   where id = 'd0000000-0000-4000-8000-0000000000e1'
$$, 'a thought becomes a point of a board');

-- not onto somebody else's board
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000009","role":"authenticated"}';
insert into mind_boards (id, company_id, user_id, title)
values ('d0000000-0000-4000-8000-000000000009', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000009', 'Доска второго директора');
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok($$
  update notes set board_id = 'd0000000-0000-4000-8000-000000000009' where id = 'd0000000-0000-4000-8000-0000000000a2'
$$, '42501', null, 'a point does not move onto another director''s board');

-- ---------------------------------------------------------------------------
-- 3. «Новая доска из этой»
-- ---------------------------------------------------------------------------
insert into notes (id, company_id, user_id, text, board_id, position, done_at, converted_task_id, deleted_at)
values ('d0000000-0000-4000-8000-0000000000b1', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Открытый вопрос', 'd0000000-0000-4000-8000-000000000003', 1, null, null, null),
       ('d0000000-0000-4000-8000-0000000000b2', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Решили', 'd0000000-0000-4000-8000-000000000003', 2, now(), null, null),
       ('d0000000-0000-4000-8000-0000000000b3', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Поручили', 'd0000000-0000-4000-8000-000000000003', 3, null,
        'd0000000-0000-4000-8000-0000000000f1', null),
       ('d0000000-0000-4000-8000-0000000000b4', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', '', 'd0000000-0000-4000-8000-000000000003', 4, null, null, null),
       ('d0000000-0000-4000-8000-0000000000b5', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Удалили', 'd0000000-0000-4000-8000-000000000003', 5, null, null, now()),
       ('d0000000-0000-4000-8000-0000000000b6', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Второй открытый', 'd0000000-0000-4000-8000-000000000003', 0.5, null, null, null);
insert into notes (id, company_id, user_id, text, board_id, parent_id, position, done_at)
values ('d0000000-0000-4000-8000-0000000000d1', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Срок — пятница', 'd0000000-0000-4000-8000-000000000003',
        'd0000000-0000-4000-8000-0000000000b1', 2, null),
       ('d0000000-0000-4000-8000-0000000000d2', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Уже сделали', 'd0000000-0000-4000-8000-000000000003',
        'd0000000-0000-4000-8000-0000000000b1', 3, now()),
       ('d0000000-0000-4000-8000-0000000000d3', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Кто отвечает', 'd0000000-0000-4000-8000-000000000003',
        'd0000000-0000-4000-8000-0000000000b1', 1, null);

select lives_ok($$
  select mind_board_copy('d0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000004',
                         '  Планёрка · 27 окт.  ', 'd0000000-0000-4000-8000-0000000000aa')
$$, 'a new board of the open points');
select is((select title from mind_boards where id = 'd0000000-0000-4000-8000-000000000004'), 'Планёрка · 27 окт.',
          'under the title given, trimmed');
select is((select array_agg(text order by position) from notes
            where board_id = 'd0000000-0000-4000-8000-000000000004' and parent_id is null),
          array['Второй открытый', 'Открытый вопрос'],
          'only unticked, not handed, live points with words — in the order of the board');
select is((select array_agg(c.text order by c.position) from notes c
             join notes p on p.id = c.parent_id
            where c.board_id = 'd0000000-0000-4000-8000-000000000004' and p.text = 'Открытый вопрос'),
          array['Кто отвечает', 'Срок — пятница'], 'with their open sub-points, in their order');
select is((select count(*) from notes where board_id = 'd0000000-0000-4000-8000-000000000003' and deleted_at is null),
          8::bigint, 'the old board stays as it was');
select is((select id from mind_board_copy('d0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000005',
                                          'Ещё раз', 'd0000000-0000-4000-8000-0000000000aa')),
          'd0000000-0000-4000-8000-000000000004'::uuid, 'a replay hands back the same board');
select is((select count(*) from notes where board_id = 'd0000000-0000-4000-8000-000000000004'), 4::bigint,
          'and copies nothing twice');
select is((select count(*) from mind_boards where id = 'd0000000-0000-4000-8000-000000000005'), 0::bigint,
          'no second board');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000009","role":"authenticated"}';
select throws_ok($$
  select mind_board_copy('d0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000006', 'Чужая', 'd0000000-0000-4000-8000-0000000000ab')
$$, 'P0001', 'bad_board', 'another director cannot copy the board');
select throws_ok($$
  select mind_board_copy('d0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000006', 'Чужая', 'd0000000-0000-4000-8000-0000000000aa')
$$, 'P0001', 'forbidden', 'nor take over a copy by its key');
set local request.jwt.claims = '{"sub":"99999999-0000-0000-0000-000000000044","role":"authenticated"}';
select throws_ok($$
  select mind_board_copy('d0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000007', 'Чужая', 'd0000000-0000-4000-8000-0000000000ac')
$$, 'P0001', 'bad_board', 'another company cannot copy it');
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
update mind_boards set deleted_at = now() where id = 'd0000000-0000-4000-8000-000000000002';
select throws_ok($$
  select mind_board_copy('d0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000008', 'Из корзины', 'd0000000-0000-4000-8000-0000000000ad')
$$, 'P0001', 'bad_board', 'a board in the bin is not copied');

-- ---------------------------------------------------------------------------
-- 4. Срок на стене: на сколько минут, «+30 минут» итоговым временем, потолок дня
-- ---------------------------------------------------------------------------
select tv_control(p_guest => false);
select is((select board_until from tv_control(p_board => 'd0000000-0000-4000-8000-000000000001', p_board_minutes => 30)),
          now() + interval '30 minutes', 'a board goes up for half an hour');
select throws_ok($$ select tv_control(p_board_minutes => 30) $$, 'P0001', 'bad_minutes', 'minutes without a board are refused');
select throws_ok($$ select tv_control(p_board => 'd0000000-0000-4000-8000-000000000001', p_board_minutes => 2) $$,
                 'P0001', 'bad_minutes', 'so are two minutes');
select is((select board_until from tv_control(p_board => 'd0000000-0000-4000-8000-000000000001', p_board_minutes => 720)),
          tv_board_cap(), 'twelve hours asked — the end of the day given (D-102 §6)');
select tv_control(p_board => 'd0000000-0000-4000-8000-000000000001', p_board_minutes => 30);
select is((select board_until from tv_board_control(p_board_until => now() + interval '60 minutes')), now() + interval '60 minutes',
          '«+30 мин» sets the new end');
select is((select board_until from tv_board_control(p_board_until => now() + interval '60 minutes')), now() + interval '60 minutes',
          'a repeat of the same command changes nothing');
select is((select board_until from tv_board_control(p_board_until => now() + interval '12 hours')), tv_board_cap(),
          'never past the end of the day');
select throws_ok($$ select tv_board_control(p_board_until => now() - interval '1 minute') $$, 'P0001', 'bad_until',
                 'a time in the past is refused');
select ok((select board_until from tv_control(p_board => 'd0000000-0000-4000-8000-000000000001')) > now(),
          'without minutes — till the end of the day, as before');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000009","role":"authenticated"}';
select throws_ok($$ select tv_board_control(p_board_until => now() + interval '30 minutes') $$, 'P0001', 'bad_board',
                 'another director does not extend a board that is not theirs');
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select throws_ok($$ select tv_board_control(p_board_until => now() + interval '30 minutes') $$, 'P0001', 'forbidden', 'nor does the kiosk');
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select tv_control(p_scene => 'clock');
select throws_ok($$ select tv_board_control(p_board_until => now() + interval '30 minutes') $$, 'P0001', 'bad_board',
                 'no board on the wall — nothing to extend');

select * from finish();
rollback;
