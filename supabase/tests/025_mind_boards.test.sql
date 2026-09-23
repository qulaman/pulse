-- Доски (D-102): приватность по автору, доска на стене только от автора, киоск читает
-- её функцией и ничего больше, гость без «Показать гостю» видит «скрыта», правка
-- доски на стене поднимает версию строки стены, корзина уносит доску с пунктами.
-- Фикстуры — supabase/seed.sql: директор …0001, киоск …0004, Марат …0007.
-- Счёт строк — только своих: dev не пустой.
begin;
select plan(27);

create temp table snap (v int);
grant all on snap to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok($$
  insert into mind_boards (id, company_id, user_id, title)
  values ('b0000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
          '10000000-0000-0000-0000-000000000001', 'Планёрка 025')
$$, 'the director creates a board');
select lives_ok($$
  insert into notes (id, company_id, user_id, text, board_id, position)
  values ('b0000000-0000-4000-8000-0000000000a1', '11111111-1111-1111-1111-111111111111',
          '10000000-0000-0000-0000-000000000001', 'Отгрузка Казхром', 'b0000000-0000-4000-8000-000000000001', 1)
$$, 'and puts a point on it');
select throws_ok($$
  insert into notes (company_id, user_id, text, board_id)
  values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001',
          'Без места', 'b0000000-0000-4000-8000-000000000001')
$$, '23514', null, 'a point without a position is refused');

select lives_ok($$ select tv_control(p_board => 'b0000000-0000-4000-8000-000000000001') $$,
                'the author puts the board on the wall');
select is((select scene from tv_state), 'board', 'the scene is the board');
select is((select board_id from tv_state), 'b0000000-0000-4000-8000-000000000001'::uuid, 'this board');
select ok((select board_until > now() from tv_state), 'until later today');
select is((select board_guest from tv_state), false, 'hidden from guests at first');
select throws_ok($$ select tv_control(p_scene => 'board') $$, 'P0001', 'bad_scene',
                 'the board scene comes only with a board');
select throws_ok($$ select tv_control(p_board => gen_random_uuid()) $$, 'P0001', 'bad_board',
                 'an unknown board is refused');

-- a point added to the board on the wall moves the wall's version
insert into snap select version from tv_state;
select lives_ok($$
  insert into notes (company_id, user_id, text, board_id, position)
  values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001',
          'Прайс на мерч', 'b0000000-0000-4000-8000-000000000001', 2)
$$, 'a second point');
select ok((select version from tv_state) > (select v from snap), 'the wall hears about it');

-- an employee sees nothing of it and cannot slip a point onto it
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select is((select count(*) from mind_boards where id = 'b0000000-0000-4000-8000-000000000001'), 0::bigint,
          'an employee does not see the board');
select is((select count(*) from notes where board_id = 'b0000000-0000-4000-8000-000000000001'), 0::bigint,
          'nor its points');
select throws_ok($$
  insert into notes (company_id, user_id, text, board_id, position)
  values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000007',
          'Чужой пункт', 'b0000000-0000-4000-8000-000000000001', 3)
$$, '42501', null, 'nor put a point onto somebody else''s board');
select throws_ok($$ select tv_control(p_board => 'b0000000-0000-4000-8000-000000000001') $$,
                 'P0001', 'forbidden', 'nor put it on the wall');

-- the kiosk reads the board through the function only
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is((select count(*) from mind_boards where id = 'b0000000-0000-4000-8000-000000000001'), 0::bigint,
          'the kiosk does not read boards');
select is((select count(*) from notes where board_id = 'b0000000-0000-4000-8000-000000000001'), 0::bigint,
          'nor notes');
select is(tv_board(false)->'board'->>'title', 'Планёрка 025', 'but gets the board on the wall');
select is(jsonb_array_length(tv_board(false)->'board'->'items'), 2, 'with both points, in order');
select is(tv_board(false)->'board'->'items'->0->>'text', 'Отгрузка Казхром', 'the first one first');
select is((tv_board(true)->>'hidden')::boolean, true, 'a guest in the office hides it');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$ select tv_control(p_board_guest => true) $$, 'the director shows it to the guest');
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is(jsonb_array_length(tv_board(true)->'board'->'items'), 2, 'then the guest sees it');

-- another scene takes it off; a deleted board never reaches the wall
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select board_id from tv_control(p_scene => 'clock')), null::uuid, 'another scene takes the board off');
select tv_control(p_board => 'b0000000-0000-4000-8000-000000000001');
update mind_boards set deleted_at = now() where id = 'b0000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is(tv_board(false)->'board', 'null'::jsonb, 'a deleted board is not on the wall');

-- the bin keeps a deleted board three days, then takes it with its points
set local role postgres;
select notes_purge_trash(now() + interval '4 days');
select is((select count(*) from notes where board_id = 'b0000000-0000-4000-8000-000000000001'), 0::bigint,
          'the purge takes the points with the board');

select * from finish();
rollback;
