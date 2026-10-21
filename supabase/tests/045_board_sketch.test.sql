-- Пункт-рисунок (D-141): рисунок — только у строки доски, небольшой объект; стена видит пункт
-- с рисунком и без слов, ведущий его подсвечивает, копия доски переносит рисунок; чужая
-- компания рисунка не видит.
-- Фикстуры — supabase/seed.sql: директор …0001, киоск …0004. Чужая компания — внутри отката.
begin;
select plan(14);

insert into companies (id, name) values ('99999999-9999-9999-9999-999999999999', 'Чужая компания 045');
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-000000000000', '99999999-0000-0000-0000-000000000045',
        'authenticated', 'authenticated', 'foreign045@demo.local', now(), now(), '', '', '', '', '', '', '', '');
insert into profiles (id, company_id, full_name, role) values
  ('99999999-0000-0000-0000-000000000045', '99999999-9999-9999-9999-999999999999', 'Чужой Директор', 'director');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

insert into mind_boards (id, company_id, user_id, title)
values ('e0000000-0000-4000-8000-000000000001', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Схема склада 045');
insert into notes (id, company_id, user_id, text, board_id, position)
values ('e0000000-0000-4000-8000-0000000000a1', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Аренда', 'e0000000-0000-4000-8000-000000000001', 1);

select lives_ok($$
  insert into notes (id, company_id, user_id, text, board_id, position, sketch)
  values ('e0000000-0000-4000-8000-0000000000b1', '11111111-1111-1111-1111-111111111111',
          '10000000-0000-0000-0000-000000000001', '', 'e0000000-0000-4000-8000-000000000001', 2,
          '{"v":1,"strokes":[{"c":"accent","w":1,"p":[10,20,300,400,800,450]}]}')
$$, 'a drawing is a point of the board, words or not');
select throws_ok($$
  insert into notes (company_id, user_id, text, sketch)
  values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001', 'Мысль',
          '{"v":1,"strokes":[]}')
$$, '23514', null, 'a loose thought carries no drawing');
select throws_ok($$
  update notes set sketch = '[1,2,3]' where id = 'e0000000-0000-4000-8000-0000000000a1'
$$, '23514', null, 'a drawing is an object');
select throws_ok($$
  update notes set sketch = '{"v":1,"strokes":[]}' where id = 'e0000000-0000-4000-8000-0000000000a1'
$$, '23514', null, 'a drawing has lines');
select throws_ok($$
  update notes set sketch = jsonb_build_object('v', 1, 'strokes', jsonb_build_array(jsonb_build_object(
           'c', 'text', 'w', 1, 'p', (select jsonb_agg(g) from generate_series(1, 40000) g))))
   where id = 'e0000000-0000-4000-8000-0000000000a1'
$$, '23514', null, 'and stays small');
select lives_ok($$
  update notes set sketch = '{"v":1,"strokes":[{"c":"warn","w":2,"p":[0,0,1600,900]}]}'
   where id = 'e0000000-0000-4000-8000-0000000000a1'
$$, 'a point with words gets a drawing too');
update notes set sketch = null where id = 'e0000000-0000-4000-8000-0000000000a1';

-- the wall: the drawing without words is a point; the presenter lights it
select tv_control(p_guest => false);
select tv_control(p_board => 'e0000000-0000-4000-8000-000000000001');
select lives_ok($$ select tv_board_control(p_point => 'e0000000-0000-4000-8000-0000000000b1') $$,
                'the presenter lights a drawing without words');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is((tv_board(false)->'board'->>'total')::int, 2, 'the wall counts the drawing as a point');
select is(tv_board(false)->'board'->'items'->1->'sketch'->'strokes'->0->>'c', 'accent', 'and gets the drawing with it');
select is(tv_board(false)->'board'->>'focus', 'e0000000-0000-4000-8000-0000000000b1', 'lit on the wall');
select is(tv_board(false)->'board'->'items'->0->'sketch', 'null'::jsonb, 'a point without a drawing has none');

-- another company sees neither the point nor the drawing
set local request.jwt.claims = '{"sub":"99999999-0000-0000-0000-000000000045","role":"authenticated"}';
select is((select count(*) from notes where id = 'e0000000-0000-4000-8000-0000000000b1'), 0::bigint,
          'another company does not see the drawing');

-- the copy carries the open drawing over
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select mind_board_copy('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002', 'Схема · копия', 'e0000000-0000-4000-8000-0000000000cc');
select is((select count(*) from notes where board_id = 'e0000000-0000-4000-8000-000000000002'), 2::bigint,
          'the copy takes the drawing point as well');
select is((select sketch->'strokes'->0->>'c' from notes where board_id = 'e0000000-0000-4000-8000-000000000002' and btrim(text) = ''),
          'accent', 'with its drawing');

select * from finish();
rollback;
