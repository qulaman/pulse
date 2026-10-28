-- D-152: the daily report. The team hands in today's report through submit_daily_report (+1 once
-- per working day, never on an edit or a replay, nothing on a day off or with points off); the
-- morning tick daily_reports_due_missed writes `missed` and −10 for a past working day without
-- one — once, not for people away, not before `started_on` (an empty one is set to the tick's
-- day and fines nobody) and closes each day once (`checked_on`: one back from leave is not fined
-- for it); a report sent offline before midnight is taken for yesterday until the tick closes
-- it; the evening tick reminds who still owes. The report is seen by its author and the
-- director of its company only; rows are written by the functions alone.
-- Counts are scoped to this file's people: dev holds other people and other companies.
-- Fixtures — supabase/seed.sql: director …0001, Динара …0002, Тимур …0003, Ерлан Б. …0005,
-- Ерлан Д. …0006, Марат …0007, Айгуль …0008; roles are pinned below (Марат is a secretary on dev).
begin;
select plan(61);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
-- A = Марат (employee), B = Ерлан Б. (employee, never hands in), S = Ерлан Д. (secretary),
-- M = Динара (manager), Тимур — sick, Айгуль — on leave
update profiles set role = 'director', is_active = true, availability = 'active'
 where id = '10000000-0000-0000-0000-000000000001';
update profiles set role = 'employee', is_active = true, availability = 'active', created_at = now() - interval '60 days'
 where id in ('10000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000005');
update profiles set role = 'secretary', is_active = true, availability = 'active', created_at = now() - interval '60 days'
 where id = '10000000-0000-0000-0000-000000000006';
update profiles set role = 'manager', is_active = true, availability = 'active', created_at = now() - interval '60 days'
 where id = '10000000-0000-0000-0000-000000000002';
update profiles set role = 'shopkeeper', is_active = true, availability = 'sick', created_at = now() - interval '60 days'
 where id = '10000000-0000-0000-0000-000000000003';
update profiles set role = 'employee', is_active = true, availability = 'vacation', created_at = now() - interval '60 days'
 where id = '10000000-0000-0000-0000-000000000008';

-- every day a working day, so the test does not depend on the weekday it runs on; no started_on yet
update companies
   set settings = (coalesce(settings, '{}') - 'points_rules' - 'daily_report')
                  || '{"points_enabled": true, "delivery_window": {"from": "08:00", "to": "21:00"},
                       "daily_report": {"enabled": true, "workdays": [1,2,3,4,5,6,7], "remind_at": "18:00"}}'::jsonb
 where id = '11111111-1111-1111-1111-111111111111';

-- the days and moments the test uses, counted the plain way (Asia/Aqtobe)
create temp table d152 as
select today,
       day0,
       -- today's arrival and leaving, both inside today and before now()
       day0 + (now() - day0) * 0.25 as arr,
       day0 + (now() - day0) * 0.75 as lft,
       (today + time '08:00') at time zone 'Asia/Aqtobe' as first_tick_at,
       (today + time '18:05') at time zone 'Asia/Aqtobe' as remind_at,
       (today + 1 + time '08:00') at time zone 'Asia/Aqtobe' as tick_at,
       (today + 2 + time '08:00') at time zone 'Asia/Aqtobe' as late_tick_at
  from (select (now() at time zone 'Asia/Aqtobe')::date as today,
               ((now() at time zone 'Asia/Aqtobe')::date)::timestamp at time zone 'Asia/Aqtobe' as day0) d;
grant select on d152 to public;

-- two more people of company A: one who left, one who joins after today
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-000000000000', '15200000-0000-0000-0000-000000000001',
        'authenticated', 'authenticated', 'pgtap-152-left@demo.local', now(), now(), '', '', '', '', '', '', '', ''),
       ('00000000-0000-0000-0000-000000000000', '15200000-0000-0000-0000-000000000002',
        'authenticated', 'authenticated', 'pgtap-152-new@demo.local', now(), now(), '', '', '', '', '', '', '', '');
insert into profiles (id, company_id, full_name, role, is_active, created_at) values
  ('15200000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'pgtap-152 Ушёл', 'employee',
   false, now() - interval '60 days'),
  ('15200000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'pgtap-152 Новенький', 'employee',
   true, (select (today + 1 + time '01:00') at time zone 'Asia/Aqtobe' from d152));

-- another company, to prove a report never reaches across
insert into companies (id, name) values ('99999999-9999-9999-9999-999999999152', 'Чужая компания 152');
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-000000000000', '99999999-0000-0000-0000-000000000152',
        'authenticated', 'authenticated', 'foreign-152@demo.local', now(), now(), '', '', '', '', '', '', '', '');
insert into profiles (id, company_id, full_name, role) values
  ('99999999-0000-0000-0000-000000000152', '99999999-9999-9999-9999-999999999152', 'Чужой Директор', 'director');

-- ---------------------------------------------------------------------------
-- 1. No started_on: the first tick sets it and fines nobody
-- ---------------------------------------------------------------------------
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select is(
  daily_reports_due_missed((select first_tick_at from d152)),
  0,
  'the first tick with no started_on fines nobody'
);

set local role postgres;
select is(
  (select (settings -> 'daily_report' ->> 'started_on')::date from companies
    where id = '11111111-1111-1111-1111-111111111111'),
  (select today from d152),
  'and writes its own day into started_on'
);
select is(
  (select count(*)::int from daily_reports where company_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'the days before it stay untouched: not a single row'
);

-- ---------------------------------------------------------------------------
-- 2. What a submit refuses
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select throws_ok(
  $$ select submit_daily_report((select lft from d152), (select arr from d152), 'pgtap-152', '15200000-0000-0000-0000-0000000000f1') $$,
  'P0001', 'bad_times',
  'left before arrived: bad_times'
);
select throws_ok(
  $$ select submit_daily_report((select day0 - interval '30 hours' from d152), (select day0 - interval '26 hours' from d152), 'pgtap-152',
                                '15200000-0000-0000-0000-0000000000f2') $$,
  'P0001', 'bad_times',
  'the day before yesterday: never'
);
select throws_ok(
  $$ select submit_daily_report((select arr from d152), (select lft from d152), '   ', '15200000-0000-0000-0000-0000000000f3') $$,
  'P0001', 'summary_required',
  '«Чем занимался» is required'
);
select throws_ok(
  $$ select submit_daily_report((select arr from d152), (select lft from d152), repeat('ы', 4001),
                                '15200000-0000-0000-0000-0000000000f4') $$,
  'P0001', 'summary_too_long',
  'at most 4000 characters'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select submit_daily_report((select arr from d152), (select lft from d152), 'pgtap-152', '15200000-0000-0000-0000-0000000000f5') $$,
  'P0001', 'not_team_member',
  'the director hands in no report'
);
select throws_ok(
  $$ select my_daily_report() $$,
  'P0001', 'not_team_member',
  'and has no report screen of his own'
);

set local role postgres;
update companies set settings = jsonb_set(settings, '{daily_report,enabled}', 'false')
 where id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select throws_ok(
  $$ select submit_daily_report((select arr from d152), (select lft from d152), 'pgtap-152', '15200000-0000-0000-0000-0000000000f6') $$,
  'P0001', 'daily_report_disabled',
  'the module switched off takes no report'
);
set local role postgres;
update companies set settings = jsonb_set(settings, '{daily_report,enabled}', 'true')
 where id = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- 2b. A report sent offline before midnight that lands after it: yesterday's, while open
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is(
  (submit_daily_report((select day0 - interval '9 hours' from d152), (select day0 - interval '1 hour' from d152),
                       'pgtap-152 вчерашний, без сети', '15200000-0000-0000-0000-0000000000c1')::jsonb -> 'report' ->> 'report_date')::date,
  (select today - 1 from d152),
  'yesterday not closed yet and without a row: the late report is taken for yesterday'
);
select throws_ok(
  $$ select submit_daily_report((select day0 - interval '8 hours' from d152), (select day0 - interval '2 hours' from d152),
                                'pgtap-152 вчерашний ещё раз', '15200000-0000-0000-0000-0000000000c2') $$,
  'P0001', 'bad_times',
  'yesterday already has its row: a late one never overwrites it'
);

set local role postgres;
update companies set settings = jsonb_set(settings, '{daily_report,checked_on}', to_jsonb(to_char((select today - 1 from d152), 'YYYY-MM-DD')))
 where id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_ok(
  $$ select submit_daily_report((select day0 - interval '9 hours' from d152), (select day0 - interval '1 hour' from d152),
                                'pgtap-152 вчерашний после тика', '15200000-0000-0000-0000-0000000000c3') $$,
  'P0001', 'bad_times',
  'yesterday closed by the morning tick: too late'
);

-- ---------------------------------------------------------------------------
-- 3. +1 exactly once
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select is(
  (submit_daily_report((select arr from d152), (select lft from d152), 'pgtap-152 сделал отчёт',
                       '15200000-0000-0000-0000-0000000000a1')::jsonb ->> 'points_awarded')::int,
  1,
  'the first report of a working day: +1'
);
select is(
  (submit_daily_report((select arr from d152), (select lft from d152), 'pgtap-152 сделал отчёт',
                       '15200000-0000-0000-0000-0000000000a1')::jsonb ->> 'points_awarded')::int,
  0,
  'a replay of the same key pays nothing'
);
select is(
  (submit_daily_report((select arr from d152), (select lft from d152), 'pgtap-152 правка',
                       '15200000-0000-0000-0000-0000000000a2')::jsonb ->> 'points_awarded')::int,
  0,
  'an edit of today''s report pays nothing'
);

set local role postgres;
select results_eq(
  $$select pt.amount, pt.source::text, pt.rule_code, pt.reason
      from point_transactions pt join daily_reports r on r.id = pt.daily_report_id
     where r.user_id = '10000000-0000-0000-0000-000000000007'$$,
  $$select 1, 'auto_rule'::text, 'daily_report'::text, 'отчёт за день ' || to_char(today, 'DD.MM') from d152$$,
  'one +1 row for the report, by the rule, with the day in the reason'
);
select results_eq(
  $$select report_date, status, summary from daily_reports where user_id = '10000000-0000-0000-0000-000000000007'$$,
  $$select today, 'submitted'::text, 'pgtap-152 правка'::text from d152$$,
  'one row for the day, the edit in it'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select results_eq(
  $$select (d ->> 'today')::boolean, (d -> 'report' ->> 'points')::int,
           (d -> 'points' ->> 'reward')::int, (d -> 'points' ->> 'penalty')::int
      from (select my_daily_report()::jsonb as d) x$$,
  $$values (true, 1, 1, 10)$$,
  'the person''s screen: today, the report brought +1, the rules are 1 and 10'
);

set local role postgres;
select is(
  (select count(*)::int from tv_events where kind = 'points' and payload ->> 'title' like 'отчёт за день%'),
  0,
  'the +1 for a report is not a line on the wall'
);
select is(
  (select count(*)::int from ether_events e join point_transactions pt on pt.id = e.transaction_id
    where pt.daily_report_id is not null),
  0,
  'nor on Эфир'
);

-- ---------------------------------------------------------------------------
-- 4. No points on a day off and with points switched off
-- ---------------------------------------------------------------------------
update companies
   set settings = jsonb_set(settings, '{daily_report,workdays}',
                            (select jsonb_agg(d) from generate_series(1, 7) d, d152 where d <> extract(isodow from today)::int))
 where id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}';
select is(
  (submit_daily_report((select arr from d152), (select lft from d152), 'pgtap-152 секретарь в выходной',
                       '15200000-0000-0000-0000-0000000000b1')::jsonb ->> 'points_awarded')::int,
  0,
  'a day off: the report is taken, no points'
);
select is(
  (my_daily_report()::jsonb ->> 'workday')::boolean,
  false,
  'and the screen says it is not a working day'
);

set local role postgres;
select is(
  (select count(*)::int from point_transactions pt join daily_reports r on r.id = pt.daily_report_id
    where r.user_id = '10000000-0000-0000-0000-000000000006'),
  0,
  'no point row for a day off'
);
update companies
   set settings = jsonb_set(settings, '{daily_report,workdays}', '[1,2,3,4,5,6,7]') || '{"points_enabled": false}'::jsonb
 where id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is(
  (submit_daily_report((select arr from d152), (select lft from d152), 'pgtap-152 руководитель без очков',
                       '15200000-0000-0000-0000-0000000000b2')::jsonb ->> 'points_awarded')::int,
  0,
  'points switched off: the report is taken, no points'
);
set local role postgres;
select is(
  (select count(*)::int from point_transactions pt join daily_reports r on r.id = pt.daily_report_id, d152
    where r.user_id = '10000000-0000-0000-0000-000000000002' and r.report_date = d152.today),
  0,
  'no point row with points switched off'
);
update companies set settings = settings || '{"points_enabled": true}'::jsonb
 where id = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- 5. Who sees a report; nobody writes the table by hand
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';
select is(
  (select count(*)::int from daily_reports where user_id = '10000000-0000-0000-0000-000000000007'),
  0,
  'a colleague does not see the report'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}';
select is(
  (select count(*)::int from daily_reports where user_id = '10000000-0000-0000-0000-000000000007'),
  0,
  'the secretary does not see somebody else''s report'
);
select is(
  (select count(*)::int from daily_reports where user_id = '10000000-0000-0000-0000-000000000006'),
  1,
  'but sees her own'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (select count(*)::int from daily_reports
    where user_id in ('10000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000006')),
  2,
  'the director of the company sees them'
);

set local request.jwt.claims = '{"sub":"99999999-0000-0000-0000-000000000152","role":"authenticated"}';
select is(
  (select count(*)::int from daily_reports where company_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'the director of company B sees nothing of company A'
);
select is(
  (select count(*)::int from jsonb_array_elements(team_daily_report_day()::jsonb -> 'rows') r
    where r ->> 'user_id' = '10000000-0000-0000-0000-000000000007'),
  0,
  'and his day lists nobody of company A'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select throws_ok(
  $$ insert into daily_reports (company_id, user_id, report_date, status)
     values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000007',
             (select today - 1 from d152), 'missed') $$,
  '42501', null::text,
  'no insert by hand: rows come from the functions'
);
do $$ begin
  update daily_reports set summary = 'pgtap-152 взлом' where user_id = '10000000-0000-0000-0000-000000000007';
exception when insufficient_privilege then null;
end $$;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin
  delete from daily_reports where user_id = '10000000-0000-0000-0000-000000000007';
exception when insufficient_privilege then null;
end $$;
set local role postgres;
select is(
  (select summary from daily_reports where user_id = '10000000-0000-0000-0000-000000000007'),
  'pgtap-152 правка',
  'no update by hand, not even by the author'
);
select is(
  (select count(*)::int from daily_reports where user_id = '10000000-0000-0000-0000-000000000007'),
  1,
  'no delete by hand, not even by the director'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select throws_ok(
  $$ select daily_reports_due_missed(now()) $$,
  '42501', null::text,
  'the morning tick is the service role''s only'
);

-- ---------------------------------------------------------------------------
-- 6. The director's day and period
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select results_eq(
  $$select (r ->> 'user_id')::uuid, r ->> 'state'
      from jsonb_array_elements(team_daily_report_day()::jsonb -> 'rows') r
     where (r ->> 'user_id')::uuid in ('10000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000005',
                                      '10000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000008')
     order by 1$$,
  $$values ('10000000-0000-0000-0000-000000000003'::uuid, 'away'::text),
           ('10000000-0000-0000-0000-000000000005'::uuid, 'pending'::text),
           ('10000000-0000-0000-0000-000000000007'::uuid, 'submitted'::text),
           ('10000000-0000-0000-0000-000000000008'::uuid, 'away'::text)$$,
  'today for the director: handed in, still to hand in, sick and on leave are away'
);

-- one who left keeps the report of the day in the director's history
set local role postgres;
update profiles set is_active = false where id = '10000000-0000-0000-0000-000000000006';
set local role authenticated;
select is(
  (select r ->> 'state' from jsonb_array_elements(team_daily_report_day()::jsonb -> 'rows') r
    where r ->> 'user_id' = '10000000-0000-0000-0000-000000000006'),
  'submitted',
  'a person who left, with a report that day, is still in «День»'
);
set local role postgres;
update profiles set is_active = true where id = '10000000-0000-0000-0000-000000000006';
set local role authenticated;

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';
select throws_ok(
  $$ select team_daily_report_day() $$,
  'P0001', 'forbidden',
  'an employee has no team day'
);
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}';
select throws_ok(
  $$ select team_daily_report_day() $$,
  'P0001', 'forbidden',
  'nor has the secretary'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select team_daily_report_period((select today - 92 from d152), (select today from d152)) $$,
  'P0001', null::text,
  'a period of 93 days is refused'
);
select lives_ok(
  $$ select team_daily_report_period((select today - 91 from d152), (select today from d152)) $$,
  'a period of 92 days, both ends counted, is fine'
);

-- ---------------------------------------------------------------------------
-- 7. The evening reminder
-- ---------------------------------------------------------------------------
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select daily_report_reminders_due((select remind_at from d152));
set local role postgres;
select is(
  (select count(*)::int from notification_deliveries
    where user_id = '10000000-0000-0000-0000-000000000005' and event_kind = 'daily_report_remind'
      and meta ->> 'url' = '/report'),
  1,
  'who still owes today''s report is reminded, the tap opens /report'
);
select is(
  (select count(*)::int from notification_deliveries
    where event_kind = 'daily_report_remind'
      and user_id in ('10000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000006',
                      '10000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000003',
                      '15200000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001')),
  0,
  'not who handed in, not who is away, not who left, not the director'
);
set local role service_role;
select daily_report_reminders_due((select remind_at + interval '10 minutes' from d152));
set local role postgres;
select is(
  (select count(*)::int from notification_deliveries
    where user_id = '10000000-0000-0000-0000-000000000005' and event_kind = 'daily_report_remind'),
  1,
  'once a day per person'
);

-- ---------------------------------------------------------------------------
-- 8. The morning tick: −10 once
-- ---------------------------------------------------------------------------
-- before the company's morning (delivery window from 08:00) yesterday stays open
set local role service_role;
select is(
  daily_reports_due_missed((select tick_at - interval '1 minute' from d152)),
  0,
  'the tick before the morning closes nothing'
);
set local role postgres;
select is(
  (select count(*)::int from daily_reports where user_id = '10000000-0000-0000-0000-000000000005'),
  0,
  'a report sent offline before midnight still has the night to arrive'
);
set local role service_role;
select daily_reports_due_missed((select tick_at from d152));
set local role postgres;
select results_eq(
  $$select report_date, status from daily_reports where user_id = '10000000-0000-0000-0000-000000000005'$$,
  $$select today, 'missed'::text from d152$$,
  'a working day without a report is written as missed'
);
select results_eq(
  $$select pt.amount, pt.source::text, pt.rule_code, pt.reason
      from point_transactions pt join daily_reports r on r.id = pt.daily_report_id
     where r.user_id = '10000000-0000-0000-0000-000000000005'$$,
  $$select -10, 'auto_rule'::text, 'daily_report_missed'::text, 'не сдан отчёт за ' || to_char(today, 'DD.MM') from d152$$,
  'and costs −10, by the rule, with the day in the reason'
);
select results_eq(
  $$select status, (select count(*)::int from point_transactions pt
                      where pt.daily_report_id = r.id and pt.rule_code = 'daily_report_missed')
      from daily_reports r where user_id = '10000000-0000-0000-0000-000000000007'$$,
  $$values ('submitted'::text, 0)$$,
  'a handed-in day stays handed in and costs nothing'
);
select is(
  (select count(*)::int from daily_reports
    where user_id in ('10000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000003')),
  0,
  'on leave and sick: not fined'
);
select is(
  (select count(*)::int from daily_reports
    where user_id in ('15200000-0000-0000-0000-000000000001', '15200000-0000-0000-0000-000000000002')),
  0,
  'who left, and who joined after the day: not fined'
);
select is(
  (select count(*)::int from daily_reports r, d152
    where r.company_id = '11111111-1111-1111-1111-111111111111' and r.report_date < d152.today and r.status = 'missed'),
  0,
  'the days before started_on (and the closed yesterday): not fined'
);

set local role service_role;
select is(
  daily_reports_due_missed((select tick_at from d152)),
  0,
  'the tick again: nothing more'
);
set local role postgres;
select is(
  (select count(*)::int from point_transactions pt join daily_reports r on r.id = pt.daily_report_id
    where r.user_id = '10000000-0000-0000-0000-000000000005'),
  1,
  'still one −10'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';
select results_eq(
  $$select e ->> 'status', (e ->> 'points')::int
      from jsonb_array_elements(my_daily_report_history()::jsonb) e, d152
     where (e ->> 'report_date')::date = d152.today$$,
  $$values ('missed'::text, -10)$$,
  'the person''s history: not handed in, −10'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select results_eq(
  $$select (r ->> 'submitted')::int, (r ->> 'missed')::int, (r ->> 'points')::int
      from jsonb_array_elements(team_daily_report_period((select today - 6 from d152), (select today from d152))::jsonb -> 'rows') r
     where r ->> 'user_id' = '10000000-0000-0000-0000-000000000007'$$,
  $$values (1, 0, 1)$$,
  'the period: the one who hands in — one report, +1'
);
select results_eq(
  $$select (r ->> 'submitted')::int, (r ->> 'missed')::int, (r ->> 'points')::int
      from jsonb_array_elements(team_daily_report_period((select today - 6 from d152), (select today from d152))::jsonb -> 'rows') r
     where r ->> 'user_id' = '10000000-0000-0000-0000-000000000005'$$,
  $$values (0, 1, -10)$$,
  'the period: the one who does not — one missed, −10'
);

-- ---------------------------------------------------------------------------
-- 9. Back from leave: the days away stay free
-- ---------------------------------------------------------------------------
-- Айгуль is active again by the next tick, but the day she was away (skipped for it, then
-- closed by checked_on) must not be fined now.
set local role postgres;
update profiles set availability = 'active' where id = '10000000-0000-0000-0000-000000000008';
set local role service_role;
select daily_reports_due_missed((select late_tick_at from d152));
set local role postgres;
select is(
  (select count(*)::int from daily_reports r, d152
    where r.user_id = '10000000-0000-0000-0000-000000000005' and r.report_date = d152.today + 1 and r.status = 'missed'),
  1,
  'the next tick fines the next day'
);
select is(
  (select count(*)::int from daily_reports r, d152
    where r.user_id = '10000000-0000-0000-0000-000000000008' and r.report_date = d152.today),
  0,
  'but not the day Айгуль was on leave, now that she is back'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (select r ->> 'state' from jsonb_array_elements(team_daily_report_day()::jsonb -> 'rows') r
    where r ->> 'user_id' = '10000000-0000-0000-0000-000000000008'),
  'away',
  'the closed day without her row stays «away» for the director'
);

select * from finish();
rollback;
