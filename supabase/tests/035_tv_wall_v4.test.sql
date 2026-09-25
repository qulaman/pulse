-- Стена v4 (D-123): заставка «Рейтинг», смена заставок по кругу, одно дело во весь экран.
-- Рейтинг — только первая пятёрка, только награды (не штрафы и не магазин), гостю —
-- ничего; круг выключает любой выбор руками; отказанное дело на стену не встаёт и
-- снимается со стены, если стало отказом.
-- Фикстуры — supabase/seed.sql: директор …0001, киоск …0004, Марат …0007; люди рейтинга
-- …0002, …0003, …0005, …0006, …0008. На dev роли дрейфуют — прибиваем их здесь.
begin;
select plan(32);

set local role postgres;
set local request.jwt.claims = '{}';

update companies set settings = settings || '{"points_enabled": true}'::jsonb
 where id = '11111111-1111-1111-1111-111111111111';
update profiles set role = 'employee', is_active = true
 where id in ('10000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000005',
              '10000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000008');
update profiles set is_active = true
 where id in ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003');
update tv_state set guest = false, guest_until = null
 where company_id = '11111111-1111-1111-1111-111111111111';

-- пятеро с большими очками, Тимур (…0003) шестой с одним очком; штраф и покупка — не награды
insert into point_transactions (company_id, user_id, amount, reason, source)
select '11111111-1111-1111-1111-111111111111', p.id, v.n, 'стена v4: награда', 'manual'
  from (values ('10000000-0000-0000-0000-000000000002'::uuid, 1000005), ('10000000-0000-0000-0000-000000000005'::uuid, 1000004),
               ('10000000-0000-0000-0000-000000000006'::uuid, 1000003), ('10000000-0000-0000-0000-000000000007'::uuid, 2000000),
               ('10000000-0000-0000-0000-000000000008'::uuid, 1000001)) as v(id, n)
  join profiles p on p.id = v.id;
insert into point_transactions (company_id, user_id, amount, reason, source)
values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000003', 1, 'стена v4: мелочь', 'manual'),
       ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000005', -7, 'стена v4: штраф', 'manual'),
       ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000006', -3, 'стена v4: покупка', 'shop_hold');

-- два дела Марата: живое и отказанное
insert into tasks (company_id, author_id, assignee_id, title, body, status, deadline, source)
values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000007', 'Стена v4: одно дело', 'Замерить окна на третьем этаже', 'sent',
        now() + interval '2 days', 'voice'),
       ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000007', 'Стена v4: отказ', null, 'sent', null, 'typed');
update tasks set status = 'accepted' where title = 'Стена v4: одно дело';
update tasks set status = 'declined' where title = 'Стена v4: отказ';
insert into task_messages (company_id, task_id, sender_id, type, file_path)
select company_id, id, assignee_id, 'photo', 'x/v4.jpg' from tasks where title = 'Стена v4: одно дело';

create temp table v4_tasks as select id, title from tasks where title like 'Стена v4:%';
grant select on v4_tasks to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- 1. Заставка «Рейтинг» и её вид — тем же пультом
-- ---------------------------------------------------------------------------
select lives_ok($$ select tv_control(p_scene => 'rating') $$, 'the rating is a scene of its own');
select is((select scene from tv_state), 'rating', 'and the row says so');
select lives_ok($$ select tv_control(p_rating => 'month') $$, 'the rating counts the month');
select is((select rating_view from tv_state), 'month', 'the row keeps the month');
select is((select scene from tv_state), 'rating', 'the view did not move the scene');
select throws_ok($$ select tv_control(p_rating => 'year') $$, 'P0001', 'bad_rating', 'an unknown period is refused');

-- ---------------------------------------------------------------------------
-- 2. Круг заставок: включает переключатель, выключает любой выбор руками
-- ---------------------------------------------------------------------------
select lives_ok($$ select tv_control(p_carousel => true) $$, 'the round is switched on');
select ok((select carousel from tv_state), 'the row keeps the round');
select lives_ok($$ select tv_control(p_scene => 'clock') $$, 'a scene picked by hand');
select ok(not (select carousel from tv_state), 'stops the round');
select lives_ok($$ select tv_control(p_carousel => true) $$, 'the round again');
select lives_ok($$ select tv_control(p_clock => 'analog') $$, 'the clock style');
select ok((select carousel from tv_state), 'does not stop the round');

set local role postgres;
update tv_state set scene = 'board', carousel = false
 where company_id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select lives_ok($$ select tv_control(p_carousel => true) $$, 'the round over a board');
select is((select scene from tv_state), 'face', 'takes the board down: the round never stands on a board');

-- ---------------------------------------------------------------------------
-- 3. tv_rating для киоска: пятёрка, рост, награды, итог команды
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
create temp table r as select tv_rating(false, 'week') as j;

select is((select j->'top'->0->>'id' from r), '10000000-0000-0000-0000-000000000007', 'Марат is first');
select ok((select jsonb_array_length(j->'top') <= 5 from r), 'never more than five on the wall');
select ok(not exists (select 1 from r, jsonb_array_elements(r.j->'top') e where e->>'id' = '10000000-0000-0000-0000-000000000003'),
          'the sixth is not on the wall (D-45)');
select ok(exists (select 1 from r, jsonb_array_elements(r.j->'awards') a where a->>'reason' = 'стена v4: награда'),
          'the latest rewards come with their reasons');
select ok(not exists (select 1 from r, jsonb_array_elements(r.j->'awards') a where (a->>'amount')::int <= 0),
          'no penalty and no shop hold among them');
select ok((select (j->'riser'->>'delta')::int > 0 from r), 'the riser grew');
select ok((select (j->'team'->>'earned')::bigint >= 5000000 from r), 'the team total counts rewards');

-- гость в кабинете — заставки нет вовсе
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$ select tv_control(p_guest => true) $$, 'a guest walks in');
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is((select tv_rating(false, 'week')), '{"hidden": true}'::jsonb, 'the rating hides from a guest (D-33)');

-- ---------------------------------------------------------------------------
-- 4. Одно дело во весь экран
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$ select tv_control(p_guest => false) $$, 'the guest leaves');
select lives_ok(
  format('select tv_control(''task'', null, %L::uuid)', (select id from v4_tasks where title = 'Стена v4: одно дело')),
  'the director puts one order on the wall'
);
select throws_ok(
  format('select tv_control(''task'', null, %L::uuid)', (select id from v4_tasks where title = 'Стена v4: отказ')),
  'P0001', 'bad_task', 'a declined order never goes up (D-45)'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
create temp table f as select tv_focus() as j;
select is((select j->>'mode' from f), 'task', 'the kiosk gets one order');
select ok((select j->'task'->>'title' = 'Стена v4: одно дело' and jsonb_typeof(j->'task'->'story') = 'array'
                  and (j->'task'->'counts'->>'photos')::int = 1 from f),
          'with its title, its story and its numbers');

-- стало отказом, пока стоит, — стена возвращается в эфир
set local role postgres;
set local request.jwt.claims = '{}';
update tasks set status = 'declined' where title = 'Стена v4: одно дело';
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is((select tv_focus()->>'mode'), 'ether', 'declined while on the wall — the ether is back');

-- ---------------------------------------------------------------------------
-- 5. Очки выключены — заставки нет; сотрудник заставку не зовёт
-- ---------------------------------------------------------------------------
set local role postgres;
update companies set settings = settings || '{"points_enabled": false}'::jsonb
 where id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select is((select tv_rating(false, 'week')->>'enabled'), 'false', 'no points — no rating scene');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select throws_ok($$ select tv_rating() $$, 'P0001', 'forbidden', 'an employee does not call the wall''s rating');

set local role postgres;
select * from finish();
rollback;
