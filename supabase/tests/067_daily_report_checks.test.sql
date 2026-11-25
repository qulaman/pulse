-- D-198: the director reads every report. «Просмотрено» (mark_daily_reports_seen) is set once and
-- only on the company's submitted reports; «Проверено» (check_daily_reports) goes on and off,
-- a replay of the same client_request_id changes nothing twice; neither moves updated_at. A change
-- of the words takes both off and says «изменён после проверки»; the same submit replayed touches
-- nothing. The feed (team_daily_reports_feed) counts the day as the «Табель» does and narrows to a
-- person, words or «не проверены», pages back with next_before. The history pages with p_before.
-- The report needs no times; one time alone is refused. Company B's director reaches nothing of
-- company A, the employee and the secretary are refused (принцип 6).
-- Own fixtures (T — today in Aqtobe; every day a working day; fines from T−10, the tick closed
-- up to T−2): company A — directors DA and DA2, E1 (reports T, T−1 with a task «Купить краску»,
-- T−20), E2 (missed T−1, missed and excused T−3), E3 who left (report T−2), E4 on leave,
-- the secretary SA (in the team, no reports); company B — director DB, EB (report T−1).
begin;
select plan(56);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
create temp table d198 as
select (now() at time zone 'Asia/Aqtobe')::date as today;
grant select on d198 to public;

insert into companies (id, name, settings)
select '19800000-0000-0000-0000-000000000a00'::uuid, 'pgtap-198 Компания A',
       jsonb_build_object(
         'points_enabled', true,
         'daily_report', jsonb_build_object(
           'enabled', true,
           'workdays', jsonb_build_array(1, 2, 3, 4, 5, 6, 7),
           'started_on', to_char(today - 10, 'YYYY-MM-DD'),
           'checked_on', to_char(today - 2, 'YYYY-MM-DD')))
  from d198
union all
select '19800000-0000-0000-0000-000000000b00'::uuid, 'pgtap-198 Компания B',
       jsonb_build_object('daily_report', jsonb_build_object('enabled', true, 'workdays', jsonb_build_array(1, 2, 3, 4, 5, 6, 7)))
  from d198;

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, now(), now(),
       '', '', '', '', '', '', '', ''
  from (values ('19800000-0000-0000-0000-0000000000a1'::uuid, 'pgtap-198-da@demo.local'),
               ('19800000-0000-0000-0000-0000000000a9'::uuid, 'pgtap-198-da2@demo.local'),
               ('19800000-0000-0000-0000-0000000000a2'::uuid, 'pgtap-198-e1@demo.local'),
               ('19800000-0000-0000-0000-0000000000a3'::uuid, 'pgtap-198-e2@demo.local'),
               ('19800000-0000-0000-0000-0000000000a4'::uuid, 'pgtap-198-e3@demo.local'),
               ('19800000-0000-0000-0000-0000000000a5'::uuid, 'pgtap-198-e4@demo.local'),
               ('19800000-0000-0000-0000-0000000000a6'::uuid, 'pgtap-198-sa@demo.local'),
               ('19800000-0000-0000-0000-0000000000b1'::uuid, 'pgtap-198-db@demo.local'),
               ('19800000-0000-0000-0000-0000000000b2'::uuid, 'pgtap-198-eb@demo.local')) u(id, email);

insert into profiles (id, company_id, full_name, role, is_active, availability, created_at) values
  ('19800000-0000-0000-0000-0000000000a1', '19800000-0000-0000-0000-000000000a00', 'pgtap-198 Директор', 'director', true, 'active', now() - interval '60 days'),
  ('19800000-0000-0000-0000-0000000000a9', '19800000-0000-0000-0000-000000000a00', 'pgtap-198 Директор 2', 'director', true, 'active', now() - interval '60 days'),
  ('19800000-0000-0000-0000-0000000000a2', '19800000-0000-0000-0000-000000000a00', 'pgtap-198 E1', 'employee', true, 'active', now() - interval '60 days'),
  ('19800000-0000-0000-0000-0000000000a3', '19800000-0000-0000-0000-000000000a00', 'pgtap-198 E2', 'employee', true, 'active', now() - interval '60 days'),
  ('19800000-0000-0000-0000-0000000000a4', '19800000-0000-0000-0000-000000000a00', 'pgtap-198 E3 ушёл', 'employee', false, 'active', now() - interval '60 days'),
  ('19800000-0000-0000-0000-0000000000a5', '19800000-0000-0000-0000-000000000a00', 'pgtap-198 E4', 'employee', true, 'vacation', now() - interval '60 days'),
  ('19800000-0000-0000-0000-0000000000a6', '19800000-0000-0000-0000-000000000a00', 'pgtap-198 Секретарь', 'secretary', true, 'active', now() - interval '60 days'),
  ('19800000-0000-0000-0000-0000000000b1', '19800000-0000-0000-0000-000000000b00', 'pgtap-198 Директор B', 'director', true, 'active', now() - interval '60 days'),
  ('19800000-0000-0000-0000-0000000000b2', '19800000-0000-0000-0000-000000000b00', 'pgtap-198 EB', 'employee', true, 'active', now() - interval '60 days');

-- updated_at an hour back: a mark must leave it there, a change of the words moves it to now()
insert into daily_reports (id, company_id, user_id, report_date, status, summary, tasks, submitted_at, updated_at,
                           excused_at, excused_reason)
select x.id, x.company, x.uid, today + x.shift, x.status,
       case when x.status = 'submitted' then x.words end,
       x.tasks,
       case when x.status = 'submitted' then now() - interval '1 hour' end,
       now() - interval '1 hour',
       case when x.excused then now() - interval '1 hour' end,
       case when x.excused then 'pgtap-198 болел' end
  from d198,
       (values ('19800000-0000-0000-0000-0000000000d1'::uuid, '19800000-0000-0000-0000-000000000a00'::uuid, '19800000-0000-0000-0000-0000000000a2'::uuid, 0, 'submitted', 'pgtap-198 склад и накладные', '[]'::jsonb, false),
               ('19800000-0000-0000-0000-0000000000d2'::uuid, '19800000-0000-0000-0000-000000000a00'::uuid, '19800000-0000-0000-0000-0000000000a2'::uuid, -1, 'submitted', 'pgtap-198 вчера', '[{"id": "x", "title": "Купить краску", "status": "done"}]'::jsonb, false),
               ('19800000-0000-0000-0000-0000000000d6'::uuid, '19800000-0000-0000-0000-000000000a00'::uuid, '19800000-0000-0000-0000-0000000000a2'::uuid, -20, 'submitted', 'pgtap-198 давно', '[]'::jsonb, false),
               ('19800000-0000-0000-0000-0000000000d3'::uuid, '19800000-0000-0000-0000-000000000a00'::uuid, '19800000-0000-0000-0000-0000000000a3'::uuid, -1, 'missed', null, '[]'::jsonb, false),
               ('19800000-0000-0000-0000-0000000000d4'::uuid, '19800000-0000-0000-0000-000000000a00'::uuid, '19800000-0000-0000-0000-0000000000a3'::uuid, -3, 'missed', null, '[]'::jsonb, true),
               ('19800000-0000-0000-0000-0000000000d5'::uuid, '19800000-0000-0000-0000-000000000a00'::uuid, '19800000-0000-0000-0000-0000000000a4'::uuid, -2, 'submitted', 'pgtap-198 ушедший', '[]'::jsonb, false),
               ('19800000-0000-0000-0000-0000000000f1'::uuid, '19800000-0000-0000-0000-000000000b00'::uuid, '19800000-0000-0000-0000-0000000000b2'::uuid, -1, 'submitted', 'pgtap-198 чужое', '[]'::jsonb, false)
       ) x(id, company, uid, shift, status, words, tasks, excused);

-- ---------------------------------------------------------------------------
-- 1. Grants: for a signed-in caller only; the review shape is an inner piece
-- ---------------------------------------------------------------------------
select results_eq(
  $$select has_function_privilege('anon', 'mark_daily_reports_seen(uuid[])', 'execute'),
           has_function_privilege('anon', 'check_daily_reports(uuid[],boolean,uuid)', 'execute'),
           has_function_privilege('anon', 'team_daily_reports_feed(date,integer,uuid,text,boolean)', 'execute'),
           has_function_privilege('authenticated', 'mark_daily_reports_seen(uuid[])', 'execute'),
           has_function_privilege('authenticated', 'check_daily_reports(uuid[],boolean,uuid)', 'execute'),
           has_function_privilege('authenticated', 'team_daily_reports_feed(date,integer,uuid,text,boolean)', 'execute'),
           has_function_privilege('authenticated', 'submit_daily_report(timestamptz,timestamptz,text,uuid,date)', 'execute'),
           has_function_privilege('authenticated', 'my_daily_report_history(integer,date)', 'execute'),
           has_function_privilege('authenticated', 'daily_report_review_json(daily_reports)', 'execute'),
           has_function_privilege('anon', 'submit_daily_report(timestamptz,timestamptz,text,uuid,date)', 'execute')$$,
  $$values (false, false, false, true, true, true, true, true, false, false)$$,
  'the new RPCs are for a signed-in caller; the review shape is not callable'
);
select ok(
  (select position('Что сделали сегодня' in p.prosrc) > 0 and position('пришли' in p.prosrc) = 0
     from pg_proc p where p.proname = 'daily_report_reminders_due'),
  'the evening push asks what was done, not when the person came and left'
);

-- ---------------------------------------------------------------------------
-- 2. Not the employee's, not the secretary's
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"19800000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select throws_ok(
  $$ select mark_daily_reports_seen(array['19800000-0000-0000-0000-0000000000d1'::uuid]) $$,
  'P0001', 'forbidden', 'an employee cannot mark a report seen'
);
select throws_ok(
  $$ select check_daily_reports(array['19800000-0000-0000-0000-0000000000d1'::uuid], true) $$,
  'P0001', 'forbidden', 'an employee cannot check a report'
);
select throws_ok(
  $$ select team_daily_reports_feed() $$,
  'P0001', 'forbidden', 'an employee cannot read the feed'
);
set local request.jwt.claims = '{"sub":"19800000-0000-0000-0000-0000000000a6","role":"authenticated"}';
select throws_ok(
  $$ select check_daily_reports(array['19800000-0000-0000-0000-0000000000d1'::uuid], true) $$,
  'P0001', 'forbidden', 'the secretary cannot check a report'
);
select throws_ok(
  $$ select mark_daily_reports_seen(array['19800000-0000-0000-0000-0000000000d1'::uuid]) $$,
  'P0001', 'forbidden', 'nor mark one seen'
);
select throws_ok(
  $$ select team_daily_reports_feed() $$,
  'P0001', 'forbidden', 'nor read the feed (D-152: «Отчёты» are closed to the secretary)'
);

-- ---------------------------------------------------------------------------
-- 3. Company B's director reaches nothing of company A (принцип 6)
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"19800000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select is(
  (select count(*)::int
     from jsonb_array_elements(team_daily_reports_feed(null, 31) -> 'days') d,
          jsonb_array_elements(d -> 'reports') r
    where r ->> 'id' <> '19800000-0000-0000-0000-0000000000f1'),
  0, 'B''s feed holds B''s report only'
);
select is(
  mark_daily_reports_seen(array['19800000-0000-0000-0000-0000000000d1'::uuid]) -> 'reports',
  '[]'::jsonb, 'B''s director marks nothing of A seen'
);
select is(
  check_daily_reports(array['19800000-0000-0000-0000-0000000000d1'::uuid], true, '19800000-0000-0000-0000-000000000101') -> 'reports',
  '[]'::jsonb, 'nor checks it'
);
select is(
  (team_daily_reports_feed(null, 7, '19800000-0000-0000-0000-0000000000a2') -> 'days' -> 0 -> 'reports'),
  '[]'::jsonb, 'naming A''s person brings none of their reports'
);
set local role postgres;
select results_eq(
  $$select seen_at is null, checked_at is null from daily_reports where id = '19800000-0000-0000-0000-0000000000d1'$$,
  $$values (true, true)$$,
  'A''s report stays unmarked'
);

-- ---------------------------------------------------------------------------
-- 4. The feed: the «Табель»'s counts, the filters, the page before
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"19800000-0000-0000-0000-0000000000a1","role":"authenticated"}';
create temp table f198 as select team_daily_reports_feed() as f;
select is(
  (select jsonb_agg(d ->> 'date' order by n) from f198, jsonb_array_elements(f -> 'days') with ordinality x(d, n)),
  (select jsonb_build_array(today, today - 1, today - 2, today - 3) from d198),
  'a week: today and the days with reports or missed people, newest first'
);
select is(
  (select jsonb_build_object('today', d -> 'today', 'due', d -> 'due', 'submitted', d -> 'submitted', 'pending', d -> 'pending', 'missed', d -> 'missed')
     from f198, jsonb_array_elements(f -> 'days') d where (d ->> 'date')::date = (select today from d198)),
  '{"today": true, "due": 3, "submitted": 1, "pending": 2, "missed": 0}'::jsonb,
  'today: E1 handed in, E2 and the secretary not yet, the one on leave is not due'
);
select is(
  (select jsonb_build_object('due', d -> 'due', 'submitted', d -> 'submitted', 'missed', d -> 'missed', 'excused', d -> 'excused')
     from f198, jsonb_array_elements(f -> 'days') d where (d ->> 'date')::date = (select today - 1 from d198)),
  '{"due": 3, "submitted": 1, "missed": 2, "excused": 0}'::jsonb,
  'yesterday: E2''s missed row and the secretary''s day the tick has not closed'
);
select is(
  (select jsonb_agg(m ->> 'user_id' order by m ->> 'user_id')
     from f198, jsonb_array_elements(f -> 'days') d, jsonb_array_elements(d -> 'missed_people') m
    where (d ->> 'date')::date = (select today - 1 from d198)),
  '["19800000-0000-0000-0000-0000000000a3", "19800000-0000-0000-0000-0000000000a6"]'::jsonb,
  'without a report yesterday: E2 and the secretary'
);
select is(
  (select jsonb_build_object('due', d -> 'due', 'reports', jsonb_array_length(d -> 'reports'), 'gone', d -> 'reports' -> 0 -> 'gone',
                             'name', d -> 'reports' -> 0 -> 'full_name')
     from f198, jsonb_array_elements(f -> 'days') d where (d ->> 'date')::date = (select today - 2 from d198)),
  '{"due": 0, "reports": 1, "gone": true, "name": "pgtap-198 E3 ушёл"}'::jsonb,
  'the one who left keeps the report, out of the count'
);
select is(
  (select jsonb_build_object('due', d -> 'due', 'missed', d -> 'missed', 'excused', d -> 'excused',
                             'who', d -> 'missed_people' -> 0 -> 'excused', 'row', d -> 'missed_people' -> 0 -> 'report_id')
     from f198, jsonb_array_elements(f -> 'days') d where (d ->> 'date')::date = (select today - 3 from d198)),
  '{"due": 1, "missed": 0, "excused": 1, "who": true, "row": "19800000-0000-0000-0000-0000000000d4"}'::jsonb,
  'an excused day counts apart'
);
select is(
  (select jsonb_build_object('from', f -> 'from', 'next_before', f -> 'next_before') from f198),
  (select jsonb_build_object('from', today - 6, 'next_before', today - 19) from d198),
  'the page before starts at the latest earlier day with a report'
);
select is(
  (select jsonb_build_object('days', jsonb_agg(d ->> 'date'), 'due', min((d ->> 'due')::int), 'next', min(f ->> 'next_before'))
     from (select team_daily_reports_feed((select today - 19 from d198), 7) as f) p, jsonb_array_elements(p.f -> 'days') d),
  (select jsonb_build_object('days', jsonb_build_array(today - 20), 'due', 0, 'next', null) from d198),
  'that page: the report before the fines started, nothing due, nothing earlier'
);
select is(
  (select jsonb_agg(jsonb_build_object('date', d ->> 'date', 'n', jsonb_array_length(d -> 'reports'), 'm', jsonb_array_length(d -> 'missed_people')))
     from jsonb_array_elements(team_daily_reports_feed(null, 31, '19800000-0000-0000-0000-0000000000a2') -> 'days') d),
  (select jsonb_build_array(jsonb_build_object('date', today, 'n', 1, 'm', 0), jsonb_build_object('date', today - 1, 'n', 1, 'm', 0),
                            jsonb_build_object('date', today - 20, 'n', 1, 'm', 0)) from d198),
  'one person: their reports through the month, nobody else''s'
);
select is(
  (select jsonb_agg(jsonb_build_object('date', d ->> 'date', 'ids', (select jsonb_agg(r ->> 'id') from jsonb_array_elements(d -> 'reports') r),
                                       'm', jsonb_array_length(d -> 'missed_people')))
     from jsonb_array_elements(team_daily_reports_feed(null, 31, null, '  КРАСКУ ') -> 'days') d),
  (select jsonb_build_array(jsonb_build_object('date', today, 'ids', null, 'm', 0),
                            jsonb_build_object('date', today - 1, 'ids', jsonb_build_array('19800000-0000-0000-0000-0000000000d2'), 'm', 0)) from d198),
  'a word: found in a task''s title whatever the case; today stays, nobody «без отчёта»'
);
select is(
  (select jsonb_agg(r ->> 'id')
     from jsonb_array_elements(team_daily_reports_feed(null, 7, null, 'накладн') -> 'days') d, jsonb_array_elements(d -> 'reports') r),
  '["19800000-0000-0000-0000-0000000000d1"]'::jsonb,
  'and in the words'
);
select is(
  (team_daily_reports_feed(null, 31, null, '100%') -> 'days' -> 0 -> 'reports'),
  '[]'::jsonb,
  'a typed % is a character, not a pattern'
);
select is(
  (team_daily_reports_feed(null, 7, null, 'накладн') -> 'next_before'),
  'null'::jsonb,
  'a word with nothing earlier has no page before'
);
select throws_ok(
  $$ select team_daily_reports_feed(null, 32) $$,
  'P0001', 'bad_period', 'a page is at most a month'
);

-- ---------------------------------------------------------------------------
-- 5. «Просмотрено»: once, the company's submitted reports only, updated_at stays
-- ---------------------------------------------------------------------------
select is(
  (select jsonb_agg(m ->> 'id') from jsonb_array_elements(mark_daily_reports_seen(array[
     '19800000-0000-0000-0000-0000000000d1', '19800000-0000-0000-0000-0000000000d3', '19800000-0000-0000-0000-0000000000f1']::uuid[]) -> 'reports') m),
  '["19800000-0000-0000-0000-0000000000d1"]'::jsonb,
  'a missed day and B''s report are left out'
);
set local request.jwt.claims = '{"sub":"19800000-0000-0000-0000-0000000000a9","role":"authenticated"}';
select lives_ok(
  $$ select mark_daily_reports_seen(array['19800000-0000-0000-0000-0000000000d1'::uuid]) $$,
  'a second director''s look is fine'
);
set local role postgres;
select results_eq(
  $$select seen_by, seen_at is not null, updated_at = now() - interval '1 hour'
      from daily_reports where id = '19800000-0000-0000-0000-0000000000d1'$$,
  $$values ('19800000-0000-0000-0000-0000000000a1'::uuid, true, true)$$,
  'seen once, by the first; updated_at did not move'
);
select results_eq(
  $$select seen_at is null from daily_reports where id in ('19800000-0000-0000-0000-0000000000d3', '19800000-0000-0000-0000-0000000000f1') order by id$$,
  $$values (true), (true)$$,
  'the missed day and B''s report stay unseen'
);

-- ---------------------------------------------------------------------------
-- 6. «Проверено»: on, a replay, off, on again; bad ids
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"19800000-0000-0000-0000-0000000000a1","role":"authenticated"}';
create temp table c198 as
select check_daily_reports(array['19800000-0000-0000-0000-0000000000d1', '19800000-0000-0000-0000-0000000000d2',
                                 '19800000-0000-0000-0000-0000000000d3']::uuid[], true, '19800000-0000-0000-0000-000000000201') as r;
select is(
  (select jsonb_build_object('ids', (select jsonb_agg(m ->> 'id' order by m ->> 'id') from jsonb_array_elements(r -> 'reports') m),
                             'by', r -> 'reports' -> 0 -> 'checked_by', 'duplicate', r -> 'duplicate') from c198),
  '{"ids": ["19800000-0000-0000-0000-0000000000d1", "19800000-0000-0000-0000-0000000000d2"], "by": "19800000-0000-0000-0000-0000000000a1", "duplicate": false}'::jsonb,
  'the two submitted reports are checked, the missed day is not'
);
select is(
  (select jsonb_build_object('duplicate', x -> 'duplicate', 'same', (x - 'duplicate') = (r - 'duplicate'))
     from c198, lateral (select check_daily_reports(array['19800000-0000-0000-0000-0000000000d1'::uuid], false, '19800000-0000-0000-0000-000000000201') as x) y),
  '{"duplicate": true, "same": true}'::jsonb,
  'a replay of the same key gets the first answer and changes nothing'
);
set local role postgres;
select results_eq(
  $$select (select count(*)::int from ingest_batches where client_request_id = '19800000-0000-0000-0000-000000000201'),
           (select checked_at is not null and seen_at is not null and updated_at = now() - interval '1 hour'
              from daily_reports where id = '19800000-0000-0000-0000-0000000000d2')$$,
  $$values (1, true)$$,
  'one key row; the check saw the report too and left updated_at alone'
);
set local role authenticated;
select is(
  (check_daily_reports(array['19800000-0000-0000-0000-0000000000d2'::uuid], false, '19800000-0000-0000-0000-000000000202') -> 'reports' -> 0 -> 'checked_at'),
  'null'::jsonb,
  'the check comes off'
);
select is(
  (select jsonb_agg(r ->> 'id')
     from jsonb_array_elements(team_daily_reports_feed(null, 31, null, null, true) -> 'days') d, jsonb_array_elements(d -> 'reports') r),
  '["19800000-0000-0000-0000-0000000000d2", "19800000-0000-0000-0000-0000000000d5", "19800000-0000-0000-0000-0000000000d6"]'::jsonb,
  '«не проверены»: the unchecked submitted reports alone'
);
select is(
  (select count(*)::int
     from jsonb_array_elements(team_daily_reports_feed(null, 31, null, null, true) -> 'days') d
    where jsonb_array_length(d -> 'missed_people') > 0),
  0, 'and nobody «без отчёта» under it'
);
select throws_ok(
  $$ select check_daily_reports(array[]::uuid[], true) $$,
  'P0001', 'bad_ids', 'no ids is refused'
);
select throws_ok(
  $$ select check_daily_reports((select array_agg(gen_random_uuid()) from generate_series(1, 201)), true) $$,
  'P0001', 'bad_ids', 'nor more than 200'
);

-- ---------------------------------------------------------------------------
-- 7. A change of the words after the check: both marks off, «изменён после проверки»; the same
--    words keep them; a replay of a stored submit touches nothing
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"19800000-0000-0000-0000-0000000000a2","role":"authenticated"}';
create temp table s198 as
select submit_daily_report(null, null, 'pgtap-198 новые слова', '19800000-0000-0000-0000-000000000301') -> 'report' as r;
select is(
  (select jsonb_build_object('seen', r -> 'seen_at', 'checked', r -> 'checked_at', 'by', r -> 'checked_by',
                             'changed', r ? 'changed_after_check_at' and r -> 'changed_after_check_at' <> 'null'::jsonb,
                             'times', jsonb_build_array(r -> 'arrived_at', r -> 'left_at'))
     from s198),
  '{"seen": null, "checked": null, "by": null, "changed": true, "times": [null, null]}'::jsonb,
  'new words: not seen, not checked, changed after the check, no times'
);
set local role postgres;
select ok(
  (select updated_at = now() from daily_reports where id = '19800000-0000-0000-0000-0000000000d1'),
  'the change of the words moved updated_at'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"19800000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is(
  (check_daily_reports(array['19800000-0000-0000-0000-0000000000d1'::uuid], true, '19800000-0000-0000-0000-000000000203') -> 'reports' -> 0 -> 'changed_after_check_at'),
  'null'::jsonb,
  'the next check clears «изменён после проверки»'
);
set local request.jwt.claims = '{"sub":"19800000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select is(
  (submit_daily_report(null, null, 'pgtap-198 другие слова', '19800000-0000-0000-0000-000000000301') -> 'report' ->> 'summary'),
  'pgtap-198 новые слова',
  'a replay of the stored submit answers with the stored report'
);
set local role postgres;
select results_eq(
  $$select checked_at is not null, changed_after_check_at is null, summary
      from daily_reports where id = '19800000-0000-0000-0000-0000000000d1'$$,
  $$values (true, true, 'pgtap-198 новые слова'::text)$$,
  'and touches nothing: the report stays checked'
);
set local role authenticated;
select is(
  (submit_daily_report(null, null, 'pgtap-198 новые слова', '19800000-0000-0000-0000-000000000302') -> 'report' -> 'checked_at') <> 'null'::jsonb,
  true,
  'the same words handed in again keep the check'
);

-- ---------------------------------------------------------------------------
-- 8. No times: handed in without them; one alone is refused; the table holds the same rule
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"19800000-0000-0000-0000-0000000000a3","role":"authenticated"}';
select throws_ok(
  $$ select submit_daily_report(now() - interval '1 minute', null, 'pgtap-198 одно время') $$,
  'P0001', 'bad_times', 'one time alone is refused'
);
select throws_ok(
  $$ select submit_daily_report(null, null, 'pgtap-198 не тот день', null, (select today - 5 from d198)) $$,
  'P0001', 'bad_times', 'a day long closed is refused'
);
select lives_ok(
  $$ select submit_daily_report(p_summary => 'pgtap-198 без часов') $$,
  'a report without times goes in'
);
select lives_ok(
  $$ select submit_daily_report(now() - interval '2 minutes', now() - interval '1 minute', 'pgtap-198 со старой сборки') $$,
  'and an older build''s both times still do'
);
set local request.jwt.claims = '{"sub":"19800000-0000-0000-0000-0000000000a6","role":"authenticated"}';
select is(
  (submit_daily_report(null, null, 'pgtap-198 вчерашний тап', null, (select today - 1 from d198)) -> 'report' ->> 'report_date')::date,
  (select today - 1 from d198),
  'a tap of yesterday replayed after midnight lands on yesterday while the day is open'
);
set local role postgres;
select throws_ok(
  $$ insert into daily_reports (company_id, user_id, report_date, status, arrived_at, summary, submitted_at)
     values ('19800000-0000-0000-0000-000000000a00', '19800000-0000-0000-0000-0000000000a6',
             (select today from d198), 'submitted', now(), 'pgtap-198', now()) $$,
  '23514', null, 'the table refuses a single time too'
);
select throws_ok(
  $$ update daily_reports set checked_at = now() where id = '19800000-0000-0000-0000-0000000000d3' $$,
  '23514', null, 'a missed day carries no marks'
);

-- ---------------------------------------------------------------------------
-- 9. The history pages with p_before; the employee sees the marks of their own report
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"19800000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select is(
  (select jsonb_agg(h ->> 'id') from jsonb_array_elements(my_daily_report_history(30, (select today from d198))) h),
  '["19800000-0000-0000-0000-0000000000d2", "19800000-0000-0000-0000-0000000000d6"]'::jsonb,
  'the days strictly before p_before'
);
select is(
  (select jsonb_agg(h ->> 'id') from jsonb_array_elements(my_daily_report_history(1, (select today - 1 from d198))) h),
  '["19800000-0000-0000-0000-0000000000d6"]'::jsonb,
  'and the limit after them'
);
select is(
  jsonb_array_length(my_daily_report_history()),
  3, 'without p_before — from the newest'
);
select ok(
  (select (r -> 'checked_at') <> 'null'::jsonb and (r -> 'seen_at') <> 'null'::jsonb
     from (select my_daily_report() -> 'report' as r) x),
  'today''s report tells its author it was seen and checked'
);

set local role postgres;
select * from finish();
rollback;
