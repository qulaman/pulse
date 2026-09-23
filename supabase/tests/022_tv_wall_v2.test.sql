-- Стена v2 (D-96): часы со стрелками и заставка «календарь» через тот же tv_control,
-- карточка сотрудника с числами по стадиям, неделя мероприятий для киоска, гость с
-- таймером гаснет сам, а ручной переключатель таймер снимает.
-- Фикстуры — supabase/seed.sql: директор …0001, киоск …0004, Марат …0007.
begin;
select plan(22);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- 1. Вид часов и заставка «календарь» — тем же пультом
-- ---------------------------------------------------------------------------
select lives_ok($$ select tv_control(p_clock => 'analog') $$, 'the director switches the wall to hands');
select is((select clock_style from tv_state), 'analog', 'the row keeps the hands');
select lives_ok($$ select tv_control(p_scene => 'calendar') $$, 'the calendar is a scene of its own');
select is((select scene from tv_state), 'calendar', 'and the row says so');
select is((select clock_style from tv_state), 'analog', 'the scene did not reset the clock');
select throws_ok($$ select tv_control(p_clock => 'sundial') $$, 'P0001', 'bad_clock', 'an unknown clock is refused');
select throws_ok($$ select tv_control(p_scene => 'disco') $$, 'P0001', 'bad_scene', 'an unknown scene still is');

-- ---------------------------------------------------------------------------
-- 2. Гость с таймером гаснет сам; ручной переключатель таймер снимает
-- ---------------------------------------------------------------------------
set local role postgres;
update tv_state set guest = true, guest_until = now() - interval '1 minute';
set local role authenticated;
select ok(not (select tv_guest_on(s) from tv_state s), 'a guest mode past its hour is off');

set local role postgres;
update tv_state set guest_until = now() + interval '30 minutes';
set local role authenticated;
select ok((select tv_guest_on(s) from tv_state s), 'and on while its hour lasts');

select lives_ok($$ select tv_control(p_guest => true) $$, 'the hand switches guest mode on');
select is((select guest_until from tv_state), null::timestamptz, 'and the timer is gone: on until switched off');

select lives_ok($$ select tv_control(p_guest => false) $$, 'the hand switches it off');

-- ---------------------------------------------------------------------------
-- 3. Карточка сотрудника: числа по стадиям, сданное сегодня
-- ---------------------------------------------------------------------------
set local role postgres;
insert into tasks (company_id, author_id, assignee_id, title, status)
values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000007', 'Стена v2: новая', 'sent');
set local role authenticated;

select lives_ok($$ select tv_control('employee', '10000000-0000-0000-0000-000000000007'::uuid) $$,
                'Марат on the wall');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select ok((select (tv_focus()->'counts'->>'new')::int >= 1), 'the kiosk gets the count of new orders');
select ok((select tv_focus()->'counts' ? 'work'), 'and of the work in hand');
select ok((select tv_focus()->'counts' ? 'review'), 'and of the work on review');
select ok((select tv_focus()->'done_today' ? 'count'), 'what was done today is counted');
select ok((select jsonb_typeof(tv_focus()->'tasks') = 'array'), 'the tasks are still a list (v1 contract)');

-- ---------------------------------------------------------------------------
-- 4. Неделя мероприятий: киоск читает функцией, таблицу — нет
-- ---------------------------------------------------------------------------
select ok((select jsonb_typeof(tv_calendar(false, 7)->'events') = 'array'), 'the kiosk reads the week');
select is((select count(*) from events), 0::bigint, 'but never the events table itself (D-78 §4)');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select throws_ok($$ select tv_calendar() $$, 'P0001', 'forbidden', 'an employee does not call the wall''s week');
select throws_ok($$ select tv_control(p_clock => 'digital') $$, 'P0001', 'forbidden',
                 'and cannot change the clock');

set local role postgres;
select * from finish();
rollback;
