-- Календарь на стене: «Неделя / Месяц» (D-98). Вид переключает только директор, тем же
-- пультом; неделю и месяц киоск читает функцией, таблицу events — нет.
-- Фикстуры — supabase/seed.sql: директор …0001, киоск …0004, Марат …0007.
begin;
select plan(11);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok($$ select tv_control(p_scene => 'calendar', p_calendar => 'month') $$,
                'one command puts the month on the wall');
select is((select scene from tv_state), 'calendar', 'the scene is the calendar');
select is((select calendar_view from tv_state), 'month', 'and the view is the month');
select lives_ok($$ select tv_control(p_clock => 'analog') $$, 'another command');
select is((select calendar_view from tv_state), 'month', 'leaves the month alone');
select throws_ok($$ select tv_control(p_calendar => 'year') $$, 'P0001', 'bad_calendar', 'an unknown view is refused');

-- the kiosk reads six weeks from a given Monday, and still never the table
set local role postgres;
insert into events (company_id, author_id, title, starts_at)
values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001',
        'Месяц: планёрка', now() + interval '20 days');
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is(
  (select (tv_calendar(false, 42, (now() at time zone 'Asia/Aqtobe')::date)->>'days')::int),
  42, 'forty-two days fit'
);
select ok(
  (select tv_calendar(false, 42, (now() at time zone 'Asia/Aqtobe')::date)->'events' @> '[{"title": "Месяц: планёрка"}]'::jsonb),
  'an event three weeks out is in the month'
);
select ok(
  (select not (tv_calendar(false, 7)->'events' @> '[{"title": "Месяц: планёрка"}]'::jsonb)),
  'and not in the week'
);
select is((select count(*) from events), 0::bigint, 'the kiosk still does not read events');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select throws_ok($$ select tv_control(p_calendar => 'week') $$, 'P0001', 'forbidden', 'an employee cannot switch the view');

set local role postgres;
select * from finish();
rollback;
