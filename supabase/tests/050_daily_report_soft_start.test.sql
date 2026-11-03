-- D-155 §1, §7 (tasks/026): the daily report starts softly. The morning tick writes `missed` for
-- everybody due, the minus only for one who handed in a report before that day; a company
-- holiday is a day off — no `missed`, no reminder, a report handed in without +1;
-- «Чем занимался» may stay empty on a day with tasks, never on a day without;
-- daily_report_refund_early_fines gives back the minuses taken before the first report (not a
-- right one, not one «Оспорить» already gave back, never twice; an open dispute on one is settled
-- by it), the wall does not count it as earned, and such a minus is not disputed again.
-- Own fixtures: company C with points on and a 10-point fine, its director and two people —
-- P1 handed in a report three days ago, P2 never did.
begin;
select plan(32);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
-- today's arrival and leaving, both inside today and before now() (Asia/Aqtobe)
create temp table d155 as
select today, day0 + (now() - day0) * 0.25 as arr, day0 + (now() - day0) * 0.75 as lft
  from (select (now() at time zone 'Asia/Aqtobe')::date as today,
               ((now() at time zone 'Asia/Aqtobe')::date)::timestamp at time zone 'Asia/Aqtobe' as day0) d;
grant select on d155 to public;

-- every weekday a working day; yesterday and today are holidays; days up to 3 days ago are closed
insert into companies (id, name, settings)
select '15500000-0000-0000-0000-000000000c00', 'pgtap-155 Компания',
       jsonb_build_object(
         'points_enabled', true,
         'points_rules', jsonb_build_object('daily_report', 1, 'daily_report_missed', 10),
         'delivery_window', jsonb_build_object('from', '08:00', 'to', '21:00'),
         'daily_report', jsonb_build_object(
           'enabled', true,
           'workdays', jsonb_build_array(1, 2, 3, 4, 5, 6, 7),
           'remind_at', '18:00',
           'started_on', to_char(today - 10, 'YYYY-MM-DD'),
           'checked_on', to_char(today - 3, 'YYYY-MM-DD'),
           -- a broken entry next to the real ones must not break anything
           'holidays', jsonb_build_array(to_char(today - 1, 'YYYY-MM-DD'), to_char(today, 'YYYY-MM-DD'), 'не дата', 42)))
  from d155;

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-000000000000', '15500000-0000-0000-0000-000000000001',
        'authenticated', 'authenticated', 'pgtap-155-p1@demo.local', now(), now(), '', '', '', '', '', '', '', ''),
       ('00000000-0000-0000-0000-000000000000', '15500000-0000-0000-0000-000000000002',
        'authenticated', 'authenticated', 'pgtap-155-p2@demo.local', now(), now(), '', '', '', '', '', '', '', ''),
       ('00000000-0000-0000-0000-000000000000', '15500000-0000-0000-0000-000000000003',
        'authenticated', 'authenticated', 'pgtap-155-dir@demo.local', now(), now(), '', '', '', '', '', '', '', '');
insert into profiles (id, company_id, full_name, role, is_active, availability, created_at) values
  ('15500000-0000-0000-0000-000000000001', '15500000-0000-0000-0000-000000000c00', 'pgtap-155 Сдавал', 'employee',
   true, 'active', now() - interval '60 days'),
  ('15500000-0000-0000-0000-000000000002', '15500000-0000-0000-0000-000000000c00', 'pgtap-155 Не сдавал', 'employee',
   true, 'active', now() - interval '60 days'),
  ('15500000-0000-0000-0000-000000000003', '15500000-0000-0000-0000-000000000c00', 'pgtap-155 Директор', 'director',
   true, 'active', now() - interval '60 days');

-- P1: a report handed in three days ago
insert into daily_reports (company_id, user_id, report_date, status, arrived_at, left_at, summary, submitted_at)
select '15500000-0000-0000-0000-000000000c00', '15500000-0000-0000-0000-000000000001', today - 3, 'submitted',
       (today - 3 + time '09:00') at time zone 'Asia/Aqtobe', (today - 3 + time '18:00') at time zone 'Asia/Aqtobe',
       'pgtap-155', (today - 3 + time '18:05') at time zone 'Asia/Aqtobe'
  from d155;

-- P2: two minuses of the old rule, before any report — one of them already given back by «Оспорить»
insert into daily_reports (id, company_id, user_id, report_date, status)
select '15500000-0000-0000-0000-0000000000d5'::uuid, '15500000-0000-0000-0000-000000000c00'::uuid,
       '15500000-0000-0000-0000-000000000002'::uuid, today - 5, 'missed' from d155
union all
select '15500000-0000-0000-0000-0000000000d6'::uuid, '15500000-0000-0000-0000-000000000c00'::uuid,
       '15500000-0000-0000-0000-000000000002'::uuid, today - 6, 'missed' from d155;
insert into point_transactions (id, company_id, user_id, amount, reason, source, rule_code, daily_report_id)
select '15500000-0000-0000-0000-0000000000f5'::uuid, '15500000-0000-0000-0000-000000000c00'::uuid,
       '15500000-0000-0000-0000-000000000002'::uuid, -10, 'не сдан отчёт за ' || to_char(today - 5, 'DD.MM'),
       'auto_rule'::point_source, 'daily_report_missed', '15500000-0000-0000-0000-0000000000d5'::uuid from d155
union all
select '15500000-0000-0000-0000-0000000000f6'::uuid, '15500000-0000-0000-0000-000000000c00'::uuid,
       '15500000-0000-0000-0000-000000000002'::uuid, -10, 'не сдан отчёт за ' || to_char(today - 6, 'DD.MM'),
       'auto_rule'::point_source, 'daily_report_missed', '15500000-0000-0000-0000-0000000000d6'::uuid from d155;
insert into point_transactions (id, company_id, user_id, amount, reason, source, rule_code, quiet)
values ('15500000-0000-0000-0000-0000000000e6', '15500000-0000-0000-0000-000000000c00',
        '15500000-0000-0000-0000-000000000002', 10, 'возврат: спор', 'manual', 'refund', true);
insert into point_disputes (company_id, transaction_id, user_id, text, status, resolved_at, refund_id)
values ('15500000-0000-0000-0000-000000000c00', '15500000-0000-0000-0000-0000000000f6',
        '15500000-0000-0000-0000-000000000002', 'pgtap-155 спор', 'refunded', now(),
        '15500000-0000-0000-0000-0000000000e6');

-- P2: a third minus of the old rule with a dispute the director has not answered yet
insert into daily_reports (id, company_id, user_id, report_date, status)
select '15500000-0000-0000-0000-0000000000d7'::uuid, '15500000-0000-0000-0000-000000000c00'::uuid,
       '15500000-0000-0000-0000-000000000002'::uuid, today - 7, 'missed' from d155;
insert into point_transactions (id, company_id, user_id, amount, reason, source, rule_code, daily_report_id)
select '15500000-0000-0000-0000-0000000000f7'::uuid, '15500000-0000-0000-0000-000000000c00'::uuid,
       '15500000-0000-0000-0000-000000000002'::uuid, -10, 'не сдан отчёт за ' || to_char(today - 7, 'DD.MM'),
       'auto_rule'::point_source, 'daily_report_missed', '15500000-0000-0000-0000-0000000000d7'::uuid from d155;
insert into point_disputes (id, company_id, transaction_id, user_id, text, status)
values ('15500000-0000-0000-0000-0000000000a7', '15500000-0000-0000-0000-000000000c00',
        '15500000-0000-0000-0000-0000000000f7', '15500000-0000-0000-0000-000000000002', 'pgtap-155 открытый спор', 'open');

-- ---------------------------------------------------------------------------
-- 1. The morning tick: `missed` for both, the minus for the one who handed in before
-- ---------------------------------------------------------------------------
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select daily_reports_due_missed((select (today + time '08:00') at time zone 'Asia/Aqtobe' from d155));

set local role postgres;
select is(
  (select count(*)::int from daily_reports r, d155
    where r.company_id = '15500000-0000-0000-0000-000000000c00' and r.report_date = d155.today - 2 and r.status = 'missed'),
  2,
  'a past working day without a report: both get the missed row'
);
select results_eq(
  $$select r.user_id, pt.amount, pt.rule_code
      from point_transactions pt join daily_reports r on r.id = pt.daily_report_id, d155
     where r.company_id = '15500000-0000-0000-0000-000000000c00' and r.report_date = d155.today - 2$$,
  $$values ('15500000-0000-0000-0000-000000000001'::uuid, -10, 'daily_report_missed'::text)$$,
  'the minus goes only to the one who handed in a report before that day'
);
select is(
  (select count(*)::int from daily_reports r, d155
    where r.company_id = '15500000-0000-0000-0000-000000000c00' and r.report_date = d155.today - 1),
  0,
  'yesterday was a holiday: no missed row'
);
select is(
  (select settings -> 'daily_report' ->> 'checked_on' from companies where id = '15500000-0000-0000-0000-000000000c00'),
  (select to_char(today - 1, 'YYYY-MM-DD') from d155),
  'and the holiday is closed like any other day, a broken entry in the list did not stop the tick'
);

-- ---------------------------------------------------------------------------
-- 2. A holiday: no reminder, the screen says so, a report goes without +1
-- ---------------------------------------------------------------------------
set local role service_role;
select daily_report_reminders_due((select (today + time '18:05') at time zone 'Asia/Aqtobe' from d155));
set local role postgres;
select is(
  (select count(*)::int from notification_deliveries
    where company_id = '15500000-0000-0000-0000-000000000c00' and event_kind = 'daily_report_remind'),
  0,
  'a holiday: nobody is reminded'
);
set local role service_role;
select daily_report_reminders_due((select (today + 1 + time '18:05') at time zone 'Asia/Aqtobe' from d155));
set local role postgres;
select is(
  (select count(*)::int from notification_deliveries
    where company_id = '15500000-0000-0000-0000-000000000c00' and event_kind = 'daily_report_remind'),
  2,
  'the working day after it reminds both as before'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"15500000-0000-0000-0000-000000000002","role":"authenticated"}';
select results_eq(
  $$select (d ->> 'holiday')::boolean, (d ->> 'workday')::boolean, (d -> 'points' ->> 'penalty')::int
      from (select my_daily_report()::jsonb as d) x$$,
  $$values (true, false, 0)$$,
  'the screen of one who never handed in: a holiday, not a working day, a miss costs nothing'
);
set local request.jwt.claims = '{"sub":"15500000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (my_daily_report()::jsonb -> 'points' ->> 'penalty')::int,
  10,
  'the screen of one who has handed in before: a miss costs 10'
);
select is(
  (my_daily_report((select today - 2 from d155))::jsonb ->> 'holiday')::boolean,
  false,
  'a day not in the list is no holiday'
);

set local request.jwt.claims = '{"sub":"15500000-0000-0000-0000-000000000002","role":"authenticated"}';
select is(
  (submit_daily_report((select arr from d155), (select lft from d155),
                       'pgtap-155 в праздник', '15500000-0000-0000-0000-0000000000a1')::jsonb ->> 'points_awarded')::int,
  0,
  'a report on a holiday is taken, without +1'
);
set local role postgres;
select is(
  (select count(*)::int from point_transactions pt join daily_reports r on r.id = pt.daily_report_id, d155
    where r.user_id = '15500000-0000-0000-0000-000000000002' and r.report_date = d155.today),
  0,
  'no point row for the holiday'
);

-- ---------------------------------------------------------------------------
-- 3. Empty words: refused on a day without tasks, taken on a day with one
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"15500000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select submit_daily_report((select arr from d155), (select lft from d155), '  ', '15500000-0000-0000-0000-0000000000a2') $$,
  'P0001', 'summary_required',
  'no tasks that day and no words: summary_required'
);

-- P1's task, handed over and accepted today
set local role postgres;
insert into tasks (company_id, author_id, assignee_id, title, status, completed_at, closed_at)
select '15500000-0000-0000-0000-000000000c00', '15500000-0000-0000-0000-000000000003',
       '15500000-0000-0000-0000-000000000001', 'pgtap-155 задача дня', 'done', arr, lft
  from d155;
set local role authenticated;
set local request.jwt.claims = '{"sub":"15500000-0000-0000-0000-000000000001","role":"authenticated"}';
select results_eq(
  $$select r ->> 'status', r ->> 'summary', jsonb_array_length(r -> 'tasks')
      from (select submit_daily_report((select arr from d155), (select lft from d155), '  ',
                                       '15500000-0000-0000-0000-0000000000a3')::jsonb -> 'report' as r) x$$,
  $$values ('submitted'::text, ''::text, 1)$$,
  'a task done that day and no words: the report is taken, the words stay empty'
);

-- ---------------------------------------------------------------------------
-- 4. The minuses of the old rule go back
-- ---------------------------------------------------------------------------
set local role authenticated;
select throws_ok(
  $$ select daily_report_refund_early_fines() $$,
  '42501', null::text,
  'the refund is the service role''s only'
);

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select cmp_ok(
  daily_report_refund_early_fines(),
  '>=',
  1,
  'the refund gives something back'
);
set local role postgres;
select results_eq(
  $$select pt.user_id, pt.amount, pt.source::text, pt.daily_report_id, pt.reason
      from point_transactions pt
     where pt.company_id = '15500000-0000-0000-0000-000000000c00' and pt.rule_code = 'daily_report_missed_refund'
     order by pt.daily_report_id$$,
  $$select '15500000-0000-0000-0000-000000000002'::uuid, 10, 'auto_rule'::text,
           '15500000-0000-0000-0000-0000000000d5'::uuid,
           'возврат штрафа за ' || to_char(today - 5, 'DD.MM') || ': до первого отчёта не штрафуем'
      from d155
    union all
    select '15500000-0000-0000-0000-000000000002'::uuid, 10, 'auto_rule'::text,
           '15500000-0000-0000-0000-0000000000d7'::uuid,
           'возврат штрафа за ' || to_char(today - 7, 'DD.MM') || ': до первого отчёта не штрафуем'
      from d155$$,
  'the minuses taken before the first report come back, by the rule, keyed by their reports'
);
select results_eq(
  $$select d.status, d.refund_id = f.id, d.resolved_at is not null, d.answer
      from point_disputes d
      join point_transactions f on f.daily_report_id = '15500000-0000-0000-0000-0000000000d7'
                               and f.rule_code = 'daily_report_missed_refund'
     where d.id = '15500000-0000-0000-0000-0000000000a7'$$,
  $$values ('refunded'::text, true, true, 'вернули: до первого отчёта не штрафуем'::text)$$,
  'an open dispute on a minus given back is settled by that refund'
);
select is(
  (select count(*)::int from point_transactions
    where user_id = '15500000-0000-0000-0000-000000000001' and rule_code = 'daily_report_missed_refund'),
  0,
  'a minus right by the new rule stays'
);
select is(
  (select count(*)::int from point_transactions
    where daily_report_id = '15500000-0000-0000-0000-0000000000d6' and rule_code = 'daily_report_missed_refund'),
  0,
  'a minus «Оспорить» already gave back is not given back twice'
);
set local role service_role;
select is(
  daily_report_refund_early_fines(),
  0,
  'the refund again: nothing more'
);
set local role postgres;
select is(
  (select balance::int from point_balances where user_id = '15500000-0000-0000-0000-000000000002'),
  0,
  'the balance of one who never handed in is whole again'
);
select is(
  (select count(*)::int from tv_events where company_id = '15500000-0000-0000-0000-000000000c00' and kind = 'points'),
  0,
  'the refund is not a line on the wall'
);
select is(
  (select count(*)::int from ether_events where company_id = '15500000-0000-0000-0000-000000000c00'),
  0,
  'nor on Эфир'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"15500000-0000-0000-0000-000000000003","role":"authenticated"}';
select is(
  (tv_rating()::jsonb -> 'team' ->> 'earned')::int,
  0,
  'nor «заработано» on the wall: a minus given back is no earning'
);
select throws_ok(
  $$ select resolve_points_dispute('15500000-0000-0000-0000-0000000000a7', true, null, '15500000-0000-0000-0000-0000000000b3') $$,
  'P0001', 'already_resolved',
  'the director''s «Вернуть» on that dispute cannot pay a second time'
);
select results_eq(
  $$select (r ->> 'missed')::int, (r ->> 'points')::int
      from jsonb_array_elements(team_daily_report_period((select today - 7 from d155), (select today from d155))::jsonb -> 'rows') r
     where r ->> 'user_id' = '15500000-0000-0000-0000-000000000002'$$,
  $$values (4, 0)$$,
  'the director''s period: four days missed, the minuses given back count once — 0'
);

set local request.jwt.claims = '{"sub":"15500000-0000-0000-0000-000000000002","role":"authenticated"}';
select results_eq(
  $$select (e ->> 'report_date')::date, e ->> 'status', (e ->> 'points')::int
      from jsonb_array_elements(my_daily_report_history()::jsonb) e, d155
     where (e ->> 'report_date')::date in (d155.today - 5, d155.today - 6, d155.today - 7)
     order by 1$$,
  $$select today - 7, 'missed'::text, 0 from d155
    union all select today - 6, 'missed'::text, 0 from d155
    union all select today - 5, 'missed'::text, 0 from d155$$,
  'the history shows every minus given back the same way: the day''s points net to 0'
);
set local request.jwt.claims = '{"sub":"15500000-0000-0000-0000-000000000001","role":"authenticated"}';
select results_eq(
  $$select e ->> 'status', (e ->> 'points')::int
      from jsonb_array_elements(my_daily_report_history()::jsonb) e, d155
     where (e ->> 'report_date')::date = d155.today - 2$$,
  $$values ('missed'::text, -10)$$,
  'the right minus stays in the history'
);

-- ---------------------------------------------------------------------------
-- 5. «Оспорить»: a minus given back is settled, a right one is still disputed
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"15500000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select dispute_points('15500000-0000-0000-0000-0000000000f5', 'pgtap-155 верните', '15500000-0000-0000-0000-0000000000b1') $$,
  'P0001', 'already_refunded',
  'a minus the refund gave back: already_refunded'
);
set local request.jwt.claims = '{"sub":"15500000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (select dispute_points(pt.id, 'pgtap-155 я был на объекте', '15500000-0000-0000-0000-0000000000b2')::jsonb ->> 'status'
     from point_transactions pt join daily_reports r on r.id = pt.daily_report_id, d155
    where r.user_id = '15500000-0000-0000-0000-000000000001' and r.report_date = d155.today - 2
      and pt.rule_code = 'daily_report_missed'),
  'open',
  'a right minus is still disputed'
);

set local role postgres;
select is(
  daily_report_workday('{"daily_report": {"holidays": "сломано"}}'::jsonb, date '2026-03-23'),
  true,
  'a list that is not an array is no holidays at all'
);
select is(
  daily_report_workday('{}'::jsonb, date '2026-03-23'),
  true,
  'no list at all: a working Monday stays one, not null'
);

select * from finish();
rollback;
