-- «Табель» and «Сводка» without a pause (D-194): team_daily_report_period works out the
-- day's settings once per day instead of calling daily_report_state for every person and day. This
-- file holds the two equal: on a fixture that reaches every branch of daily_report_state (submitted,
-- missed, excused, a day off, a holiday, before the fines started, before the person came, on
-- leave, a day the tick closed, past, today, one who left), the period's counts per person and per
-- day are the ones daily_report_state gives cell by cell. It also checks that the settings helpers
-- stay inlinable (no function call per row) and say the same as their to_char / to_jsonb spelling.
begin;
select plan(8);

-- ---------------------------------------------------------------------------
-- Fixtures: one company; fines from 20 days ago, the tick closed up to 8 days ago, a holiday
-- 5 days ago
-- ---------------------------------------------------------------------------
create temp table f066 as
select (now() at time zone 'Asia/Aqtobe')::date as today;
grant select on f066 to public;

insert into companies (id, name, settings)
select '06600000-0000-0000-0000-00000000000a', 'pgtap-066',
       jsonb_build_object('points_enabled', true, 'daily_report', jsonb_build_object(
         'started_on', to_char(today - 20, 'YYYY-MM-DD'),
         'checked_on', to_char(today - 8, 'YYYY-MM-DD'),
         'holidays', jsonb_build_array(to_char(today - 5, 'YYYY-MM-DD'), 'не дата', 7)))
  from f066;

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, now(), now(),
       '', '', '', '', '', '', '', ''
  from (values
    ('06600000-0000-0000-0000-000000000001'::uuid, 'pgtap-066-director@demo.local'),
    ('06600000-0000-0000-0000-000000000002'::uuid, 'pgtap-066-works@demo.local'),
    ('06600000-0000-0000-0000-000000000003'::uuid, 'pgtap-066-leave@demo.local'),
    ('06600000-0000-0000-0000-000000000004'::uuid, 'pgtap-066-new@demo.local'),
    ('06600000-0000-0000-0000-000000000005'::uuid, 'pgtap-066-left@demo.local'),
    ('06600000-0000-0000-0000-000000000006'::uuid, 'pgtap-066-secretary@demo.local'),
    ('06600000-0000-0000-0000-000000000007'::uuid, 'pgtap-066-tv@demo.local')
  ) as u(id, email);

insert into profiles (id, company_id, full_name, role, is_active, availability, created_at) values
  ('06600000-0000-0000-0000-000000000001', '06600000-0000-0000-0000-00000000000a', 'pgtap-066 Директор', 'director', true, 'active', now() - interval '90 days'),
  ('06600000-0000-0000-0000-000000000002', '06600000-0000-0000-0000-00000000000a', 'pgtap-066 Работает', 'employee', true, 'active', now() - interval '90 days'),
  ('06600000-0000-0000-0000-000000000003', '06600000-0000-0000-0000-00000000000a', 'pgtap-066 В отпуске', 'employee', true, 'vacation', now() - interval '90 days'),
  ('06600000-0000-0000-0000-000000000004', '06600000-0000-0000-0000-00000000000a', 'pgtap-066 Новый', 'manager', true, 'active', now() - interval '6 days'),
  ('06600000-0000-0000-0000-000000000005', '06600000-0000-0000-0000-00000000000a', 'pgtap-066 Ушёл', 'employee', false, 'active', now() - interval '90 days'),
  ('06600000-0000-0000-0000-000000000006', '06600000-0000-0000-0000-00000000000a', 'pgtap-066 Секретарь', 'secretary', true, 'active', now() - interval '90 days'),
  ('06600000-0000-0000-0000-000000000007', '06600000-0000-0000-0000-00000000000a', 'pgtap-066 Киоск', 'tv', true, 'active', now() - interval '90 days');

-- reports: «Работает» hands in on every third day, misses on every fourth (excused on some);
-- «Ушёл» and «Секретарь» have a few, one of the secretary's on a Saturday
insert into daily_reports (company_id, user_id, report_date, status, arrived_at, left_at, summary, submitted_at,
                           excused_at, excused_reason)
select '06600000-0000-0000-0000-00000000000a', p.user_id, d.day,
       case when p.kind = 'missed' then 'missed' else 'submitted' end,
       case when p.kind <> 'missed' then (d.day + time '09:10') at time zone 'Asia/Aqtobe' end,
       case when p.kind <> 'missed' then (d.day + time '18:20') at time zone 'Asia/Aqtobe' end,
       case when p.kind <> 'missed' then 'pgtap-066 день' end,
       case when p.kind <> 'missed' then (d.day + time '18:25') at time zone 'Asia/Aqtobe' end,
       case when p.kind = 'missed' and extract(day from d.day)::int % 2 = 0 then now() end,
       case when p.kind = 'missed' and extract(day from d.day)::int % 2 = 0 then 'pgtap-066 причина' end
  from f066 f
 cross join lateral (select (f.today - n) as day, n from generate_series(0, 30) n) d
 cross join lateral (
   select '06600000-0000-0000-0000-000000000002'::uuid as user_id,
          case when d.n % 3 = 0 then 'submitted' when d.n % 4 = 0 then 'missed' end as kind
   union all
   select '06600000-0000-0000-0000-000000000005', case when d.n in (2, 9, 15) then 'submitted' when d.n = 12 then 'missed' end
   union all
   select '06600000-0000-0000-0000-000000000006',
          case when extract(isodow from d.day) = 6 and d.n < 14 then 'submitted' when d.n in (1, 4) then 'submitted' end
 ) p
 where p.kind is not null;

-- ---------------------------------------------------------------------------
-- The reference: daily_report_state for every cell, counted the way the period counts
-- ---------------------------------------------------------------------------
create temp table ref066 as
with s as (
  select c.settings, f.today, f.today - 25 as p_from, f.today as p_to
    from companies c, f066 f where c.id = '06600000-0000-0000-0000-00000000000a'
),
people as (
  select p.id, p.availability, p.created_at, (p.is_active and team_role(p.role)) as active
    from profiles p, s
   where p.company_id = '06600000-0000-0000-0000-00000000000a'
     and ((p.is_active and team_role(p.role))
       or exists (select 1 from daily_reports r where r.user_id = p.id and r.report_date between s.p_from and s.p_to))
),
cells as (
  select pe.id as user_id, g::date as day, pe.active, r.excused_at is not null as excused,
         daily_report_state(s.settings, g::date, s.today, r.status, pe.availability, pe.created_at, pe.active) as state,
         (daily_report_workday(s.settings, g::date) and g::date >= coalesce(daily_report_started_on(s.settings), s.today)
           and g::date <= s.today and pe.created_at < ((g::date + 1)::timestamp at time zone 'Asia/Aqtobe')
           and (pe.active or r.id is not null)) as due
    from s
   cross join people pe
   cross join generate_series(s.p_from::timestamp, s.p_to::timestamp, interval '1 day') g
    left join daily_reports r on r.user_id = pe.id and r.report_date = g::date
)
select * from cells;

create temp table got066 (r jsonb);
grant all on got066 to public;
set local role authenticated;
set local request.jwt.claims = '{"sub":"06600000-0000-0000-0000-000000000001","role":"authenticated"}';
insert into got066 select team_daily_report_period(f.today - 25, f.today) from f066 f;
set local role postgres;

-- the fixture reaches every branch
select is(
  (select array_agg(distinct state order by state) from ref066),
  array['away', 'missed', 'off', 'pending', 'submitted'],
  'fixture: the cells reach every state of daily_report_state'
);

-- ---------------------------------------------------------------------------
-- 1. Per person: workdays, submitted, missed, excused
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from (
     select (x ->> 'user_id')::uuid, (x ->> 'workdays')::int, (x ->> 'submitted')::int, (x ->> 'missed')::int, (x ->> 'excused')::int
       from got066, jsonb_array_elements(r -> 'rows') x
     except
     select user_id, (count(*) filter (where due))::int, (count(*) filter (where due and state = 'submitted'))::int,
            (count(*) filter (where due and state = 'missed' and not excused))::int,
            (count(*) filter (where due and state = 'missed' and excused))::int
       from ref066 group by user_id) d),
  0::bigint,
  'period rows: every count is the one daily_report_state gives'
);
select is(
  (select count(*) from (
     select user_id, (count(*) filter (where due))::int, (count(*) filter (where due and state = 'submitted'))::int,
            (count(*) filter (where due and state = 'missed' and not excused))::int,
            (count(*) filter (where due and state = 'missed' and excused))::int
       from ref066 group by user_id
     except
     select (x ->> 'user_id')::uuid, (x ->> 'workdays')::int, (x ->> 'submitted')::int, (x ->> 'missed')::int, (x ->> 'excused')::int
       from got066, jsonb_array_elements(r -> 'rows') x) d),
  0::bigint,
  'period rows: nobody of the reference is missing'
);

-- ---------------------------------------------------------------------------
-- 2. Per day: workday and the team's submitted / missed / excused
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from (
     select (x ->> 'date')::date, (x ->> 'workday')::boolean, (x ->> 'submitted')::int, (x ->> 'missed')::int, (x ->> 'excused')::int
       from got066, jsonb_array_elements(r -> 'days') x
     except
     select day, daily_report_workday((select settings from companies where id = '06600000-0000-0000-0000-00000000000a'), day),
            (count(*) filter (where active and due and state = 'submitted'))::int,
            (count(*) filter (where active and due and state = 'missed' and not excused))::int,
            (count(*) filter (where active and due and state = 'missed' and excused))::int
       from ref066 group by day) d),
  0::bigint,
  'period days: the line of the days is the one daily_report_state gives'
);
select is(
  (select jsonb_array_length(r -> 'days') from got066),
  26,
  'period days: one entry per day'
);

-- ---------------------------------------------------------------------------
-- 3. The settings helpers: the same answer as the to_char / to_jsonb spelling, and inlined
-- ---------------------------------------------------------------------------
create temp table s066 (s jsonb);
insert into s066 values
  ('{}'), ('{"daily_report": {}}'),
  ('{"daily_report": {"workdays": [1,2,3,4,5,6,7], "holidays": ["2026-01-01", "2026-03-08", "2027-01-07", "x", 5, null]}}'),
  ('{"daily_report": {"workdays": [6, 7, "1"], "holidays": {"2026-01-01": true}}}'),
  ('{"daily_report": {"workdays": 5, "holidays": "2026-03-08"}}');

select is(
  (select count(*) from s066 h, generate_series(date '2025-12-25', date '2027-01-10', interval '1 day') g
    where daily_report_workday(h.s, g::date) is distinct from (
            case when jsonb_typeof(h.s -> 'daily_report' -> 'workdays') = 'array'
                 then (h.s -> 'daily_report' -> 'workdays') @> to_jsonb(extract(isodow from g::date)::int)
                 else extract(isodow from g::date)::int between 1 and 5 end
            and not coalesce(jsonb_typeof(h.s -> 'daily_report' -> 'holidays') = 'array'
                             and (h.s -> 'daily_report' -> 'holidays') @> to_jsonb(to_char(g::date, 'YYYY-MM-DD')), false))),
  0::bigint,
  'daily_report_workday / daily_report_holiday: the same as the to_char / to_jsonb spelling'
);

create temp table plan066 (line text);
do $$
declare l text;
begin
  for l in execute 'explain (verbose, costs off) select daily_report_state(s, current_date, current_date, null, ''active'', now(), true) from s066' loop
    insert into plan066 values (l);
  end loop;
end $$;
select is(
  (select count(*) from plan066 where line ~ 'daily_report_(state|workday|holiday|on|started_on|checked_on)\('),
  0::bigint,
  'daily_report_state and the settings helpers are inlined into the query'
);
select cmp_ok(
  (select count(*) from plan066),
  '>', 0::bigint,
  'the plan was read'
);

select * from finish();
rollback;
