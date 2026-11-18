-- D-183: the director's «Отчёты». «Уважительная причина» (excuse_daily_report) keeps a missed day
-- missed, writes the reason and gives the minus back once — a quiet row, not on the wall, not
-- disputed afterwards; refuses a submitted report, a second excuse, an open dispute, empty words.
-- «Напомнить» (remind_daily_report) queues one push a person a day through the window: not to one
-- who handed in, one away, one not due, one reminded already, nor too late for the day — and the
-- evening sweep then skips the reminded one. The director's day shows the reminder and its
-- receipt and counts the excused apart; the period counts only the days a report was due;
-- person_daily_reports reads one person's reports with the dispute on each minus. None of the
-- three is the employee's, and company B's director reaches nothing of company A (принцип 6).
-- Own fixtures: company A — director DA, E1 (missed −10 three days ago, a submitted report four
-- days ago and today, a missed −10 five days ago with an open dispute), E2 (a report on a day off
-- six days ago and one yesterday), E3 on leave, E4 who is never reminded by the director;
-- company B — director DB and EB. Six days ago is not a working weekday in A; today is.
begin;
select plan(43);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
create temp table d181 as
select (now() at time zone 'Asia/Aqtobe')::date as today;
grant select on d181 to public;

-- every weekday but the one six days ago is a working day; the window is the whole day, so
-- «Напомнить» goes now whatever the hour the test runs; days up to yesterday are closed
insert into companies (id, name, settings)
select '18100000-0000-0000-0000-000000000a00'::uuid, 'pgtap-181 Компания A',
       jsonb_build_object(
         'points_enabled', true,
         'points_rules', jsonb_build_object('daily_report', 1, 'daily_report_missed', 10),
         'delivery_window', jsonb_build_object('from', '00:00', 'to', '23:59'),
         'daily_report', jsonb_build_object(
           'enabled', true,
           'workdays', (select jsonb_agg(w) from generate_series(1, 7) w
                         where w <> extract(isodow from today - 6)::int),
           'remind_at', '18:00',
           'started_on', to_char(today - 10, 'YYYY-MM-DD'),
           'checked_on', to_char(today - 1, 'YYYY-MM-DD')))
  from d181
union all
select '18100000-0000-0000-0000-000000000b00'::uuid, 'pgtap-181 Компания B',
       jsonb_build_object('points_enabled', true,
                          'delivery_window', jsonb_build_object('from', '00:00', 'to', '23:59'),
                          'daily_report', jsonb_build_object('enabled', true, 'workdays', jsonb_build_array(1, 2, 3, 4, 5, 6, 7)))
  from d181;

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, now(), now(),
       '', '', '', '', '', '', '', ''
  from (values ('18100000-0000-0000-0000-0000000000a1'::uuid, 'pgtap-181-da@demo.local'),
               ('18100000-0000-0000-0000-0000000000a2'::uuid, 'pgtap-181-e1@demo.local'),
               ('18100000-0000-0000-0000-0000000000a3'::uuid, 'pgtap-181-e2@demo.local'),
               ('18100000-0000-0000-0000-0000000000a4'::uuid, 'pgtap-181-e3@demo.local'),
               ('18100000-0000-0000-0000-0000000000a5'::uuid, 'pgtap-181-e4@demo.local'),
               ('18100000-0000-0000-0000-0000000000b1'::uuid, 'pgtap-181-db@demo.local'),
               ('18100000-0000-0000-0000-0000000000b2'::uuid, 'pgtap-181-eb@demo.local')) u(id, email);

insert into profiles (id, company_id, full_name, role, is_active, availability, created_at) values
  ('18100000-0000-0000-0000-0000000000a1', '18100000-0000-0000-0000-000000000a00', 'pgtap-181 Директор A', 'director', true, 'active', now() - interval '60 days'),
  ('18100000-0000-0000-0000-0000000000a2', '18100000-0000-0000-0000-000000000a00', 'pgtap-181 E1', 'employee', true, 'active', now() - interval '60 days'),
  ('18100000-0000-0000-0000-0000000000a3', '18100000-0000-0000-0000-000000000a00', 'pgtap-181 E2', 'employee', true, 'active', now() - interval '60 days'),
  ('18100000-0000-0000-0000-0000000000a4', '18100000-0000-0000-0000-000000000a00', 'pgtap-181 E3', 'employee', true, 'vacation', now() - interval '60 days'),
  ('18100000-0000-0000-0000-0000000000a5', '18100000-0000-0000-0000-000000000a00', 'pgtap-181 E4', 'employee', true, 'active', now() - interval '60 days'),
  ('18100000-0000-0000-0000-0000000000b1', '18100000-0000-0000-0000-000000000b00', 'pgtap-181 Директор B', 'director', true, 'active', now() - interval '60 days'),
  ('18100000-0000-0000-0000-0000000000b2', '18100000-0000-0000-0000-000000000b00', 'pgtap-181 EB', 'employee', true, 'active', now() - interval '60 days');

-- E1: R3 missed five days ago (−10, open dispute), R2 handed in four days ago, R1 missed three
-- days ago (−10), R5 handed in today
insert into daily_reports (id, company_id, user_id, report_date, status, arrived_at, left_at, summary, submitted_at)
select x.id, '18100000-0000-0000-0000-000000000a00'::uuid, x.uid, today + x.shift, x.status,
       case when x.status = 'submitted' then (today + x.shift + time '09:00') at time zone 'Asia/Aqtobe' end,
       case when x.status = 'submitted' then (today + x.shift + time '18:00') at time zone 'Asia/Aqtobe' end,
       case when x.status = 'submitted' then 'pgtap-181' end,
       case when x.status = 'submitted' then (today + x.shift + time '18:05') at time zone 'Asia/Aqtobe' end
  from d181,
       (values ('18100000-0000-0000-0000-0000000000d3'::uuid, '18100000-0000-0000-0000-0000000000a2'::uuid, -5, 'missed'),
               ('18100000-0000-0000-0000-0000000000d2'::uuid, '18100000-0000-0000-0000-0000000000a2'::uuid, -4, 'submitted'),
               ('18100000-0000-0000-0000-0000000000d1'::uuid, '18100000-0000-0000-0000-0000000000a2'::uuid, -3, 'missed'),
               ('18100000-0000-0000-0000-0000000000d5'::uuid, '18100000-0000-0000-0000-0000000000a2'::uuid, 0, 'submitted'),
               -- E2: a report on the day off and one yesterday
               ('18100000-0000-0000-0000-0000000000e6'::uuid, '18100000-0000-0000-0000-0000000000a3'::uuid, -6, 'submitted'),
               ('18100000-0000-0000-0000-0000000000e1'::uuid, '18100000-0000-0000-0000-0000000000a3'::uuid, -1, 'submitted'),
               -- company B: EB missed yesterday
               ('18100000-0000-0000-0000-0000000000f1'::uuid, '18100000-0000-0000-0000-0000000000b2'::uuid, -1, 'missed')
       ) x(id, uid, shift, status);

insert into point_transactions (id, company_id, user_id, amount, reason, source, rule_code, daily_report_id) values
  ('18100000-0000-0000-0000-0000000000c1', '18100000-0000-0000-0000-000000000a00', '18100000-0000-0000-0000-0000000000a2',
   -10, 'не сдан отчёт', 'auto_rule', 'daily_report_missed', '18100000-0000-0000-0000-0000000000d1'),
  ('18100000-0000-0000-0000-0000000000c3', '18100000-0000-0000-0000-000000000a00', '18100000-0000-0000-0000-0000000000a2',
   -10, 'не сдан отчёт', 'auto_rule', 'daily_report_missed', '18100000-0000-0000-0000-0000000000d3');
insert into point_disputes (id, company_id, transaction_id, user_id, text, status)
values ('18100000-0000-0000-0000-0000000000c4', '18100000-0000-0000-0000-000000000a00',
        '18100000-0000-0000-0000-0000000000c3', '18100000-0000-0000-0000-0000000000a2', 'pgtap-181 я был на объекте', 'open');

-- ---------------------------------------------------------------------------
-- 1. Not the employee's, not the guest's
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"18100000-0000-0000-0000-0000000000a3","role":"authenticated"}';
select throws_ok(
  $$ select excuse_daily_report('18100000-0000-0000-0000-0000000000d1', 'сам себе') $$,
  'P0001', 'forbidden',
  'an employee cannot excuse a day'
);
select throws_ok(
  $$ select remind_daily_report(array['18100000-0000-0000-0000-0000000000a2'::uuid]) $$,
  'P0001', 'forbidden',
  'an employee cannot remind'
);
select throws_ok(
  $$ select person_daily_reports('18100000-0000-0000-0000-0000000000a2', (select today - 6 from d181), (select today from d181)) $$,
  'P0001', 'forbidden',
  'an employee cannot read another person''s reports'
);
set local role postgres;
select results_eq(
  $$select has_function_privilege('anon', 'excuse_daily_report(uuid,text,uuid)', 'execute'),
           has_function_privilege('anon', 'remind_daily_report(uuid[],uuid)', 'execute'),
           has_function_privilege('anon', 'person_daily_reports(uuid,date,date)', 'execute'),
           has_function_privilege('authenticated', 'excuse_daily_report(uuid,text,uuid)', 'execute'),
           has_function_privilege('authenticated', 'daily_report_json(daily_reports)', 'execute')$$,
  $$values (false, false, false, true, false)$$,
  'the three RPCs are for a signed-in caller only; the report''s inner shape is not callable'
);

-- ---------------------------------------------------------------------------
-- 2. Company B's director reaches nothing of company A (принцип 6)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"18100000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select throws_ok(
  $$ select excuse_daily_report('18100000-0000-0000-0000-0000000000d1', 'чужой', '18100000-0000-0000-0000-000000000101') $$,
  'P0001', 'not_found',
  'B''s director cannot excuse A''s report'
);
select results_eq(
  $$select jsonb_array_length(x -> 'reminded'), x -> 'skipped' -> 0 ->> 'reason'
      from (select remind_daily_report(array['18100000-0000-0000-0000-0000000000a3'::uuid],
                                       '18100000-0000-0000-0000-000000000102')::jsonb as x) s$$,
  $$values (0, 'not_due'::text)$$,
  'B''s director reminding A''s person: nothing queued, the answer is the one for nobody'
);
select is(
  person_daily_reports('18100000-0000-0000-0000-0000000000a2', (select today - 6 from d181), (select today from d181))::jsonb,
  '[]'::jsonb,
  'B''s director reads none of A''s reports'
);
set local role postgres;
select is(
  (select count(*)::int from notification_deliveries where user_id = '18100000-0000-0000-0000-0000000000a3'),
  0,
  'and no push went to A''s person'
);
select is(
  (select excused_at from daily_reports where id = '18100000-0000-0000-0000-0000000000d1'),
  null::timestamptz,
  'and A''s report is untouched'
);

-- ---------------------------------------------------------------------------
-- 3. «Уважительная причина»
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"18100000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select throws_ok(
  $$ select excuse_daily_report('18100000-0000-0000-0000-0000000000d2', 'сдан же', '18100000-0000-0000-0000-000000000103') $$,
  'P0001', 'not_missed',
  'a handed-in report: not_missed'
);
select throws_ok(
  $$ select excuse_daily_report('18100000-0000-0000-0000-0000000000d1', '   ', '18100000-0000-0000-0000-000000000104') $$,
  'P0001', 'reason_required',
  'empty words: reason_required'
);
select throws_ok(
  $$ select excuse_daily_report('18100000-0000-0000-0000-0000000000d3', 'был на объекте', '18100000-0000-0000-0000-000000000105') $$,
  'P0001', 'disputed',
  'an open dispute on the minus is answered first: disputed'
);
select results_eq(
  $$select (x ->> 'points_returned')::int, x -> 'report' ->> 'status', x -> 'report' ->> 'excused_reason',
           (x -> 'report' ->> 'excused_at') is not null, (x -> 'report' ->> 'points')::int, (x ->> 'duplicate')::boolean
      from (select excuse_daily_report('18100000-0000-0000-0000-0000000000d1', '  Болел, справка  ',
                                       '18100000-0000-0000-0000-000000000106')::jsonb as x) s$$,
  $$values (10, 'missed'::text, 'Болел, справка'::text, true, 0, false)$$,
  'the excuse: the day stays missed, the reason is kept trimmed, the minus comes back — the report nets 0'
);
set local role postgres;
select results_eq(
  $$select amount, source::text, rule_code, quiet, actor_id, reason
      from point_transactions where daily_report_id = '18100000-0000-0000-0000-0000000000d1' and amount > 0$$,
  $$values (10, 'manual'::text, 'daily_report_excused'::text, true,
            '18100000-0000-0000-0000-0000000000a1'::uuid, 'Уважительная причина: Болел, справка'::text)$$,
  'one quiet row of the director gives the minus back; the minus stays in the ledger'
);
select results_eq(
  $$select excused_by, excused_reason from daily_reports where id = '18100000-0000-0000-0000-0000000000d1'$$,
  $$values ('18100000-0000-0000-0000-0000000000a1'::uuid, 'Болел, справка'::text)$$,
  'the row knows who excused it'
);
set local role authenticated;
select results_eq(
  $$select (x ->> 'points_returned')::int, (x ->> 'duplicate')::boolean
      from (select excuse_daily_report('18100000-0000-0000-0000-0000000000d1', 'Болел, справка',
                                       '18100000-0000-0000-0000-000000000106')::jsonb as x) s$$,
  $$values (10, true)$$,
  'a replay of the same tap answers the first answer'
);
select throws_ok(
  $$ select excuse_daily_report('18100000-0000-0000-0000-0000000000d1', 'ещё раз', '18100000-0000-0000-0000-000000000107') $$,
  'P0001', 'already_excused',
  'a second excuse: already_excused'
);
set local role postgres;
select is(
  (select sum(amount)::int from point_transactions where daily_report_id = '18100000-0000-0000-0000-0000000000d1'),
  0,
  'net points of the excused report: 0, given back once'
);
-- the early-fines refund (D-155 §1) run again does not pay the excused minus back a second time.
-- Inside a savepoint: without E1's report of four days ago both minuses are «before the first
-- report», so the refund gives d3 back (the control) and must skip the excused d1.
savepoint early_fines;
delete from daily_reports where id = '18100000-0000-0000-0000-0000000000d2';
select daily_report_refund_early_fines();
select results_eq(
  $$select (select sum(amount)::int from point_transactions where daily_report_id = '18100000-0000-0000-0000-0000000000d1'),
           (select sum(amount)::int from point_transactions where daily_report_id = '18100000-0000-0000-0000-0000000000d3')$$,
  $$values (0, 0)$$,
  'a re-run of daily_report_refund_early_fines gives the other early minus back and skips the excused one'
);
rollback to savepoint early_fines;
select is(
  (select count(*)::int from tv_events where company_id = '18100000-0000-0000-0000-000000000a00'),
  0,
  'the give-back is no line on the wall'
);
select is(
  (select count(*)::int from ether_events where company_id = '18100000-0000-0000-0000-000000000a00'),
  0,
  'nor on Эфир'
);
set local role authenticated;
select is(
  (tv_rating()::jsonb -> 'team' ->> 'earned')::int,
  0,
  'nor «заработано» on the wall'
);
set local request.jwt.claims = '{"sub":"18100000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select throws_ok(
  $$ select dispute_points('18100000-0000-0000-0000-0000000000c1', 'верните', '18100000-0000-0000-0000-000000000108') $$,
  'P0001', 'already_refunded',
  'an excused minus is not disputed again: already_refunded'
);
select results_eq(
  $$select e ->> 'excused_reason', (e ->> 'points')::int
      from jsonb_array_elements(my_daily_report_history()::jsonb) e
     where e ->> 'id' = '18100000-0000-0000-0000-0000000000d1'$$,
  $$values ('Болел, справка'::text, 0)$$,
  'the person sees the reason on their own day, the points net 0'
);

-- ---------------------------------------------------------------------------
-- 4. «Напомнить»
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"18100000-0000-0000-0000-0000000000a1","role":"authenticated"}';
-- the temp table is made by the owner; the call inside still runs as the director (the claims)
set local role postgres;
create temp table r181 as
select remind_daily_report(array[
         '18100000-0000-0000-0000-0000000000a2', -- E1: handed in today
         '18100000-0000-0000-0000-0000000000a3', -- E2: owes
         '18100000-0000-0000-0000-0000000000a3', -- E2 twice in one call
         '18100000-0000-0000-0000-0000000000a4', -- E3: on leave
         '18100000-0000-0000-0000-0000000000a1', -- the director: not the team
         '18100000-0000-0000-0000-0000000000b2'  -- EB: another company
       ]::uuid[], '18100000-0000-0000-0000-000000000109')::jsonb as x;
select results_eq(
  $$select x -> 'reminded', x ->> 'deliver_after', (x ->> 'duplicate')::boolean from r181$$,
  $$values ('["18100000-0000-0000-0000-0000000000a3"]'::jsonb, null::text, false)$$,
  'only the one who owes today''s report is reminded, once, now (inside the window)'
);
select results_eq(
  $$select s ->> 'user_id', s ->> 'reason' from r181, jsonb_array_elements(x -> 'skipped') s order by 1$$,
  $$values ('18100000-0000-0000-0000-0000000000a1'::text, 'not_due'::text),
           ('18100000-0000-0000-0000-0000000000a2', 'submitted'),
           ('18100000-0000-0000-0000-0000000000a4', 'away'),
           ('18100000-0000-0000-0000-0000000000b2', 'not_due')$$,
  'the rest are skipped with the reason: handed in, away, not the team, another company'
);
set local role postgres;
select results_eq(
  $$select d.company_id, d.meta ->> 'title', d.meta ->> 'url', d.meta ->> 'by', d.meta ->> 'date' = to_char(d181.today, 'YYYY-MM-DD'),
           d.meta ->> 'tag' = 'daily-report:' || to_char(d181.today, 'YYYY-MM-DD'), d.deliver_after <= now(), d.status::text
      from notification_deliveries d, d181
     where d.user_id = '18100000-0000-0000-0000-0000000000a3' and d.event_kind = 'daily_report_remind'$$,
  $$values ('18100000-0000-0000-0000-000000000a00'::uuid, 'Директор ждёт отчёт за день'::text, '/report'::text,
            'director'::text, true, true, true, 'queued'::text)$$,
  'one queued push: the director''s words, today''s date, the report screen'
);
set local role authenticated;
select results_eq(
  $$select x -> 'reminded', (x ->> 'duplicate')::boolean
      from (select remind_daily_report(array['18100000-0000-0000-0000-0000000000a3'::uuid],
                                       '18100000-0000-0000-0000-000000000109')::jsonb as x) s$$,
  $$values ('["18100000-0000-0000-0000-0000000000a3"]'::jsonb, true)$$,
  'a replay of the same tap answers the first answer'
);
select results_eq(
  $$select jsonb_array_length(x -> 'reminded'), x -> 'skipped' -> 0 ->> 'reason'
      from (select remind_daily_report(array['18100000-0000-0000-0000-0000000000a3'::uuid],
                                       '18100000-0000-0000-0000-000000000110')::jsonb as x) s$$,
  $$values (0, 'already'::text)$$,
  'a second «Напомнить» the same day: already'
);
set local role postgres;
select is(
  (select count(*)::int from notification_deliveries
    where user_id = '18100000-0000-0000-0000-0000000000a3' and event_kind = 'daily_report_remind'),
  1,
  'still one push to that person'
);

-- the evening sweep: E4 owes and was not reminded — the sweep's own; E2 was — nothing more
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select daily_report_reminders_due((select (today + time '18:05') at time zone 'Asia/Aqtobe' from d181));
set local role postgres;
select results_eq(
  $$select user_id, count(*)::int, max(meta ->> 'by')
      from notification_deliveries
     where company_id = '18100000-0000-0000-0000-000000000a00' and event_kind = 'daily_report_remind'
     group by user_id order by user_id$$,
  $$values ('18100000-0000-0000-0000-0000000000a3'::uuid, 1, 'director'::text),
           ('18100000-0000-0000-0000-0000000000a5'::uuid, 1, null::text)$$,
  'the sweep skips the one the director reminded and reminds the one he did not'
);

-- too late for the day: the window is over until tomorrow — not queued (E3 back from leave)
update companies
   set settings = jsonb_set(settings, '{delivery_window}', '{"from": "00:00", "to": "00:00"}')
 where id = '18100000-0000-0000-0000-000000000a00';
update profiles set availability = 'active' where id = '18100000-0000-0000-0000-0000000000a4';
set local role authenticated;
set local request.jwt.claims = '{"sub":"18100000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select results_eq(
  $$select jsonb_array_length(x -> 'reminded'), x -> 'skipped' -> 0 ->> 'reason'
      from (select remind_daily_report(array['18100000-0000-0000-0000-0000000000a4'::uuid],
                                       '18100000-0000-0000-0000-000000000111')::jsonb as x) s$$,
  $$values (0, 'late'::text)$$,
  'a push the window would hold past today is not queued: late'
);
select throws_ok(
  $$ select remind_daily_report(array[]::uuid[]) $$,
  'P0001', 'bad_request',
  'nobody to remind: bad_request'
);
select throws_ok(
  $$ select remind_daily_report((select array_agg(gen_random_uuid()) from generate_series(1, 101))) $$,
  'P0001', 'bad_request',
  'more than 100 at once: bad_request'
);
set local role postgres;
update companies
   set settings = jsonb_set(settings, '{delivery_window}', '{"from": "00:00", "to": "23:59"}')
 where id = '18100000-0000-0000-0000-000000000a00';
update profiles set availability = 'vacation' where id = '18100000-0000-0000-0000-0000000000a4';

-- ---------------------------------------------------------------------------
-- 5. The director's day: the reminder and its receipt, the excused apart
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"18100000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select results_eq(
  $$select r ->> 'user_id', r -> 'reminded' ->> 'by', (r -> 'reminded' ->> 'at') is not null,
           r -> 'reminded' ->> 'sent_at', r -> 'reminded' ->> 'seen_at'
      from jsonb_array_elements(team_daily_report_day()::jsonb -> 'rows') r
     where r ->> 'user_id' in ('18100000-0000-0000-0000-0000000000a3', '18100000-0000-0000-0000-0000000000a5')
     order by 1$$,
  $$values ('18100000-0000-0000-0000-0000000000a3'::text, 'director'::text, true, null::text, null::text),
           ('18100000-0000-0000-0000-0000000000a5', 'auto', true, null, null)$$,
  'today: who was reminded, by whom, with the receipt (queued: not sent, not seen)'
);
select is(
  (select r -> 'reminded' from jsonb_array_elements(team_daily_report_day()::jsonb -> 'rows') r
    where r ->> 'user_id' = '18100000-0000-0000-0000-0000000000a2'),
  'null'::jsonb,
  'one nobody reminded: reminded is null'
);
select results_eq(
  $$select (t ->> 'missed')::int, (t ->> 'excused')::int,
           (select r ->> 'state' from jsonb_array_elements(x -> 'rows') r
             where r ->> 'user_id' = '18100000-0000-0000-0000-0000000000a2'),
           (select r -> 'report' ->> 'excused_reason' from jsonb_array_elements(x -> 'rows') r
             where r ->> 'user_id' = '18100000-0000-0000-0000-0000000000a2')
      from (select team_daily_report_day((select today - 3 from d181))::jsonb as x) s,
           lateral (select x -> 'totals' as t) tt$$,
  $$values (0, 1, 'missed'::text, 'Болел, справка'::text)$$,
  'three days ago: the excused day is still missed in the row, counted as excused, not as missed'
);

-- ---------------------------------------------------------------------------
-- 6. The period: only due days, the excused apart
-- ---------------------------------------------------------------------------
set local role postgres;
create temp table p181 as
select team_daily_report_period((select today - 6 from d181), (select today from d181))::jsonb as x;
grant select on p181 to public;
select results_eq(
  $$select (r ->> 'workdays')::int, (r ->> 'submitted')::int, (r ->> 'missed')::int, (r ->> 'excused')::int,
           (r ->> 'submit_rate')::numeric, (r ->> 'points')::int
      from p181, jsonb_array_elements(x -> 'rows') r
     where r ->> 'user_id' = '18100000-0000-0000-0000-0000000000a2'$$,
  $$values (6, 2, 1, 1, 0.667, -10)$$,
  'E1: six due days, two handed in, one missed, one excused; the rate leaves the excused out; −10 left'
);
select results_eq(
  $$select (r ->> 'workdays')::int, (r ->> 'submitted')::int
      from p181, jsonb_array_elements(x -> 'rows') r
     where r ->> 'user_id' = '18100000-0000-0000-0000-0000000000a3'$$,
  $$values (6, 1)$$,
  'E2: a report on the day off is not counted as handed in'
);
select is(
  (select count(*)::int from p181, jsonb_array_elements(x -> 'rows') r
    where (r ->> 'submitted')::int + (r ->> 'missed')::int + (r ->> 'excused')::int > (r ->> 'workdays')::int),
  0,
  'nobody hands in more days than were due'
);
select results_eq(
  $$select (x -> 'totals' ->> 'submitted')::int, (x -> 'totals' ->> 'missed')::int, (x -> 'totals' ->> 'excused')::int,
           (select (d ->> 'submitted')::int from jsonb_array_elements(x -> 'days') d
             where (d ->> 'date')::date = (select today - 6 from d181))
      from p181$$,
  $$values (3, 1, 1, 0)$$,
  'the team''s totals and the day off''s line count the same way'
);

-- ---------------------------------------------------------------------------
-- 7. One person's reports
-- ---------------------------------------------------------------------------
set local role authenticated;
select results_eq(
  $$select (e ->> 'report_date')::date - d181.today, e ->> 'status', e -> 'dispute' ->> 'text',
           (e -> 'dispute' ->> 'resolved')::boolean, e ->> 'excused_reason'
      from jsonb_array_elements(person_daily_reports('18100000-0000-0000-0000-0000000000a2',
                                                     (select today - 6 from d181), (select today from d181))::jsonb) e, d181$$,
  $$values (0, 'submitted'::text, null::text, null::boolean, null::text),
           (-3, 'missed', null, null, 'Болел, справка'),
           (-4, 'submitted', null, null, null),
           (-5, 'missed', 'pgtap-181 я был на объекте', false, null)$$,
  'E1''s reports newest first, the open dispute on its minus, the excuse on its day'
);
select throws_ok(
  $$ select person_daily_reports('18100000-0000-0000-0000-0000000000a2', (select today - 92 from d181), (select today from d181)) $$,
  'P0001', 'bad_period',
  'more than 92 days: bad_period'
);

select * from finish();
rollback;
