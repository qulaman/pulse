-- Доска v2 (D-121): подпункты одного уровня, корзина веткой, ведущий с пульта, вид стены.
-- Фикстуры — supabase/seed.sql: директор …0001, киоск …0004, Марат …0007.
-- На dev Марат бывает секретарём — внутри отката он сотрудник. Счёт — только своих строк.
begin;
select plan(40);

update profiles set role = 'employee' where id = '10000000-0000-0000-0000-000000000007';

create temp table snap (v int);
grant all on snap to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- a board with two points; the first gets two sub-points
insert into mind_boards (id, company_id, user_id, title)
values ('c0000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Брифинг 034'),
       ('c0000000-0000-4000-8000-000000000002', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Другая 034');
insert into notes (id, company_id, user_id, text, board_id, position)
values ('c0000000-0000-4000-8000-0000000000a1', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Продажи Q4', 'c0000000-0000-4000-8000-000000000001', 1),
       ('c0000000-0000-4000-8000-0000000000a2', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Новый склад', 'c0000000-0000-4000-8000-000000000001', 2),
       ('c0000000-0000-4000-8000-0000000000b1', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Чужая доска', 'c0000000-0000-4000-8000-000000000002', 1);

select lives_ok($$
  insert into notes (id, company_id, user_id, text, board_id, parent_id, position)
  values ('c0000000-0000-4000-8000-0000000000c1', '11111111-1111-1111-1111-111111111111',
          '10000000-0000-0000-0000-000000000001', 'План 120 млн', 'c0000000-0000-4000-8000-000000000001',
          'c0000000-0000-4000-8000-0000000000a1', 1),
         ('c0000000-0000-4000-8000-0000000000c2', '11111111-1111-1111-1111-111111111111',
          '10000000-0000-0000-0000-000000000001', 'Отчёт к пятнице', 'c0000000-0000-4000-8000-000000000001',
          'c0000000-0000-4000-8000-0000000000a1', 2)
$$, 'a point gets two sub-points');

select throws_ok($$
  insert into notes (company_id, user_id, text, board_id, parent_id, position)
  values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001', 'Глубже',
          'c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-0000000000c1', 1)
$$, 'P0001', 'bad_parent', 'a sub-point of a sub-point is refused: one level');

select throws_ok($$
  insert into notes (company_id, user_id, text, board_id, parent_id, position)
  values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001', 'Мимо',
          'c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-0000000000b1', 1)
$$, 'P0001', 'bad_parent', 'a sub-point under a point of another board is refused');

select throws_ok($$
  insert into notes (company_id, user_id, text, parent_id)
  values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001', 'Мысль',
          'c0000000-0000-4000-8000-0000000000a1')
$$, 'P0001', 'bad_parent', 'a loose thought is never a sub-point');

select throws_ok($$
  update notes set parent_id = 'c0000000-0000-4000-8000-0000000000a2'
   where id = 'c0000000-0000-4000-8000-0000000000a1'
$$, 'P0001', 'bad_parent', 'a point with sub-points does not become a sub-point');

select lives_ok($$
  update notes set parent_id = 'c0000000-0000-4000-8000-0000000000a1', position = 3
   where id = 'c0000000-0000-4000-8000-0000000000a2'
$$, 'a point without sub-points moves under another one');
select lives_ok($$
  update notes set parent_id = null, position = 2
   where id = 'c0000000-0000-4000-8000-0000000000a2'
$$, 'and back to the top');

select lives_ok($$
  update notes set text = 'План 125 млн' where id = 'c0000000-0000-4000-8000-0000000000c1'
$$, 'a sub-point''s text changes freely');

-- the bin takes the branch and gives it back; a sub-point deleted on its own keeps its time
update notes set deleted_at = now() - interval '1 hour' where id = 'c0000000-0000-4000-8000-0000000000c2';
update notes set deleted_at = now() where id = 'c0000000-0000-4000-8000-0000000000a1';
select is((select deleted_at from notes where id = 'c0000000-0000-4000-8000-0000000000c1'), now(),
          'deleting a point takes its live sub-points with the same time');
select is((select deleted_at from notes where id = 'c0000000-0000-4000-8000-0000000000c2'), now() - interval '1 hour',
          'a sub-point deleted earlier keeps its own time');

select lives_ok($$
  insert into notes (id, company_id, user_id, text, board_id, parent_id, position)
  values ('c0000000-0000-4000-8000-0000000000c3', '11111111-1111-1111-1111-111111111111',
          '10000000-0000-0000-0000-000000000001', 'Сказано без сети', 'c0000000-0000-4000-8000-000000000001',
          'c0000000-0000-4000-8000-0000000000a1', 3)
$$, 'a sub-point that lands under a deleted point is not lost');
select is((select deleted_at from notes where id = 'c0000000-0000-4000-8000-0000000000c3'), now(),
          'it rides in the bin with its point');

update notes set deleted_at = null where id = 'c0000000-0000-4000-8000-0000000000a1';
select is((select count(*) from notes where parent_id = 'c0000000-0000-4000-8000-0000000000a1' and deleted_at is null),
          2::bigint, 'restoring the point brings back exactly the sub-points deleted with it');
select is((select deleted_at is not null from notes where id = 'c0000000-0000-4000-8000-0000000000c2'), true,
          'the one deleted on its own stays in the bin');

-- a sub-point restored while its point is in the bin comes back as a point
update notes set deleted_at = now() where id = 'c0000000-0000-4000-8000-0000000000a1';
update notes set deleted_at = null where id = 'c0000000-0000-4000-8000-0000000000c1';
select is((select parent_id from notes where id = 'c0000000-0000-4000-8000-0000000000c1'), null::uuid,
          'a sub-point restored without its point becomes a point');
select is((select deleted_at from notes where id = 'c0000000-0000-4000-8000-0000000000c1'), null::timestamptz,
          'and is on the board');
update notes set deleted_at = null where id = 'c0000000-0000-4000-8000-0000000000a1';
select is((select count(*) from notes where parent_id = 'c0000000-0000-4000-8000-0000000000a1' and deleted_at is null),
          1::bigint, 'its point comes back with the rest of the branch');
update notes set parent_id = 'c0000000-0000-4000-8000-0000000000a1', position = 1
 where id = 'c0000000-0000-4000-8000-0000000000c1';

-- an employee cannot hang a sub-point onto the director's point
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select throws_ok($$
  insert into notes (company_id, user_id, text, board_id, parent_id, position)
  values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000007', 'Чужое',
          'c0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-0000000000a1', 9)
$$, 'P0001', 'bad_parent', 'an employee cannot add a sub-point to the director''s board');
select throws_ok($$ select tv_board_control(p_view => 'map') $$, 'P0001', 'forbidden',
                 'an employee does not drive the wall');

-- the wall: a branch, the spotlight, the view
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select tv_control(p_guest => false);
select lives_ok($$ select tv_control(p_board => 'c0000000-0000-4000-8000-000000000001') $$, 'the board goes up');
select is((select board_point from tv_state), null::uuid, 'a new board starts without a spotlight');

insert into snap select version from tv_state;
select lives_ok($$ select tv_board_control(p_point => 'c0000000-0000-4000-8000-0000000000a2') $$,
                'the author spotlights a point');
select is((select board_point from tv_state), 'c0000000-0000-4000-8000-0000000000a2'::uuid, 'the spotlight is on it');
select ok((select version from tv_state) > (select v from snap), 'the wall hears about it');
select throws_ok($$ select tv_board_control(p_point => 'c0000000-0000-4000-8000-0000000000c1') $$,
                 'P0001', 'bad_point', 'a sub-point is not spotlighted on its own');
select throws_ok($$ select tv_board_control(p_point => 'c0000000-0000-4000-8000-0000000000b1') $$,
                 'P0001', 'bad_point', 'nor a point of another board');
select throws_ok($$ select tv_board_control(p_point => 'c0000000-0000-4000-8000-0000000000a2', p_clear_point => true) $$,
                 'P0001', 'bad_point', 'spotlight and clear at once is refused');
select throws_ok($$ select tv_board_control(p_view => 'grid') $$, 'P0001', 'bad_view', 'an unknown view is refused');
select is((select board_view from tv_board_control(p_view => 'map')), 'map', 'the map view');
select is((select board_point from tv_state), 'c0000000-0000-4000-8000-0000000000a2'::uuid,
          'the view keeps the spotlight');

-- the kiosk reads the branch, the spotlight and the view
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select throws_ok($$ select tv_board_control(p_view => 'list') $$, 'P0001', 'forbidden', 'the kiosk does not drive itself');
select is(tv_board(false)->'board'->>'view', 'map', 'the wall draws the map');
select is(tv_board(false)->'board'->>'focus', 'c0000000-0000-4000-8000-0000000000a2', 'with the spotlight');
select is((tv_board(false)->'board'->>'total')::int, 2, 'counting the points of the top level');
select is(jsonb_array_length(tv_board(false)->'board'->'items'), 2, 'two points');
select is(jsonb_array_length(tv_board(false)->'board'->'items'->0->'children'), 2, 'the first carries two live sub-points');
select is(tv_board(false)->'board'->'items'->0->'children'->0->>'text', 'План 125 млн', 'in their order');

-- a deleted spotlight does not shine; another scene ends it
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
update notes set deleted_at = now() where id = 'c0000000-0000-4000-8000-0000000000a2';
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is(tv_board(false)->'board'->'focus', 'null'::jsonb, 'a deleted point is not spotlighted');
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select tv_board_control(p_point => 'c0000000-0000-4000-8000-0000000000a1');
select is((select board_point from tv_control(p_scene => 'clock')), null::uuid, 'another scene ends the spotlight');
select throws_ok($$ select tv_board_control(p_point => 'c0000000-0000-4000-8000-0000000000a1') $$,
                 'P0001', 'bad_point', 'no board on the wall — nothing to spotlight');

select * from finish();
rollback;
