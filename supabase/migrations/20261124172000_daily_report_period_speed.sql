-- The team's reports over a period (team_daily_report_period: «Табель», «Сводка») answer without
-- a pause on a team of fifty and a quarter (D-194).
--
-- 1. daily_report_holiday and daily_report_workday say the same as before, written with immutable
--    parts only (to_char and to_jsonb are stable), so the planner inlines them — and
--    daily_report_state that calls them — into the query instead of running a function per row.
--    Bodies: 20261103120000_daily_report_soft_start.sql (supabase/SCHEMA.md).
-- 2. team_daily_report_period works the settings out once per day of the period, not once per
--    person and day, and reads the company's reports of the period once by its index. The answer
--    is the same, field for field. Body: 20261124130000_reports_count_the_team.sql, changed only
--    where marked «F, 11.4».
-- Grants are kept by create or replace.

-- ---------------------------------------------------------------------------
-- 1. settings helpers
-- ---------------------------------------------------------------------------

-- holidays: a string match against the list — a broken entry never breaks the tick; no list
-- (or not an array) is no holiday, never null. The day is spelled YYYY-MM-DD by hand: to_char is
-- not immutable.
create or replace function daily_report_holiday(p_settings jsonb, p_day date) returns boolean
language sql immutable
as $$
  select coalesce(jsonb_typeof(p_settings -> 'daily_report' -> 'holidays') = 'array'
                  and (p_settings -> 'daily_report' -> 'holidays') ?
                      (lpad(extract(year from p_day)::int::text, 4, '0') || '-' ||
                       lpad(extract(month from p_day)::int::text, 2, '0') || '-' ||
                       lpad(extract(day from p_day)::int::text, 2, '0')), false)
$$;

-- ISO weekdays (1 = Monday); Monday to Friday unless the company chose its own; never a holiday
create or replace function daily_report_workday(p_settings jsonb, p_day date) returns boolean
language sql immutable
as $$
  select case when jsonb_typeof(p_settings -> 'daily_report' -> 'workdays') = 'array'
              then (p_settings -> 'daily_report' -> 'workdays') @> (extract(isodow from p_day)::int)::text::jsonb
              else extract(isodow from p_day)::int between 1 and 5 end
         and not daily_report_holiday(p_settings, p_day)
$$;

-- ---------------------------------------------------------------------------
-- 2. team_daily_report_period
-- ---------------------------------------------------------------------------
create or replace function team_daily_report_period(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_company  uuid := auth_company_id();
  v_settings jsonb;
  v_today    date := (now() at time zone 'Asia/Aqtobe')::date;
  v_begin    date;
  v_on       boolean;
  v_checked  date;
  v_start    timestamptz;
  v_end      timestamptz;
  v_result   jsonb;
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from + 1 > 92 then
    raise exception 'bad_period' using errcode = 'P0001';
  end if;
  select c.settings into v_settings from companies c where c.id = v_company;
  v_begin := coalesce(daily_report_started_on(v_settings), v_today);
  v_on := daily_report_on(v_settings);
  v_checked := daily_report_checked_on(v_settings);
  v_start := p_from::timestamp at time zone 'Asia/Aqtobe';
  v_end := (p_to + 1)::timestamp at time zone 'Asia/Aqtobe';

  -- the team now, and whoever left but has a report in the period: history keeps its people
  with people as (
    select p.id, p.full_name, p."position", p.avatar_url, p.availability, p.created_at,
           (p.is_active and team_role(p.role)) as active
      from profiles p
     where p.company_id = v_company
       and ((p.is_active and team_role(p.role))
         or exists (select 1 from daily_reports r
                     where r.user_id = p.id and r.report_date between p_from and p_to))
  ),
  -- the days of the period, each with what the settings say of it worked out once per day,
  -- not once per person and day (D-194)
  days as (
    select g::date as day,
           daily_report_workday(v_settings, g::date) as workday,
           ((g::date + 1)::timestamp at time zone 'Asia/Aqtobe') as day_end
      from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g
  ),
  -- the company's reports of the period, read once through (company_id, report_date) (D-194)
  reps as (
    select r.id, r.user_id, r.report_date, r.status, r.arrived_at, r.left_at, r.submitted_at, r.excused_at
      from daily_reports r
     where r.company_id = v_company and r.report_date between p_from and p_to
  ),
  -- every person on every day of the period, with the day's report and state; for one who left
  -- only the days with a row were due (a person gone is never fined)
  grid as (
    select pe.id as user_id, dd.day, r.status, r.arrived_at, r.left_at, r.submitted_at, pe.active,
           r.excused_at is not null as excused,
           -- daily_report_state, branch for branch, with the day's part taken from `days` (D-194);
           -- supabase/tests/066_daily_report_period_cells.test.sql holds the two equal
           case when r.status = 'submitted' then 'submitted'
                when r.status = 'missed' then 'missed'
                when not pe.active or not v_on or not dd.workday or dd.day < v_begin
                  or pe.created_at >= dd.day_end then 'off'
                when pe.availability <> 'active' then 'away'
                when dd.day <= v_checked then 'away'
                when dd.day < v_today then 'missed'
                else 'pending'
           end as state,
           (dd.workday and dd.day >= v_begin and dd.day <= v_today
             and pe.created_at < dd.day_end
             and (pe.active or r.id is not null)) as due
      from people pe
     cross join days dd
      left join reps r on r.user_id = pe.id and r.report_date = dd.day
  ),
  -- D-183: a day counts for submitted / missed / excused only when it was due — a report handed
  -- in on a day off is kept and shown, but «сдал» never exceeds `workdays`
  per as (
    select g.user_id,
           (count(*) filter (where g.due))::int as workdays,
           (count(*) filter (where g.due and g.state = 'submitted'))::int as submitted,
           (count(*) filter (where g.due and g.state = 'missed' and not g.excused))::int as missed,
           (count(*) filter (where g.due and g.state = 'missed' and g.excused))::int as excused,
           avg(extract(epoch from (g.arrived_at at time zone 'Asia/Aqtobe')::time)) filter (where g.status = 'submitted') as arrived_s,
           avg(extract(epoch from (g.left_at at time zone 'Asia/Aqtobe')::time)) filter (where g.status = 'submitted') as left_s,
           avg(extract(epoch from (g.left_at - g.arrived_at)) / 3600) filter (where g.status = 'submitted') as hours_avg,
           -- when the report is handed in, as the phone recorded it — not the typed «Ушёл» (D-194)
           avg(extract(epoch from (g.submitted_at at time zone 'Asia/Aqtobe')::time)) filter (where g.status = 'submitted' and g.submitted_at is not null) as submitted_s,
           coalesce(sum(extract(epoch from (g.left_at - g.arrived_at)) / 3600) filter (where g.status = 'submitted'), 0) as hours_sum
      from grid g
     group by g.user_id
  ),
  -- the team's tasks handed over or accepted in the period, by local day
  tk as (
    select t.assignee_id as user_id,
           case when t.completed_at >= v_start and t.completed_at < v_end
                then (t.completed_at at time zone 'Asia/Aqtobe')::date end as handed_day,
           case when t.status = 'done' and t.closed_at >= v_start and t.closed_at < v_end
                then (t.closed_at at time zone 'Asia/Aqtobe')::date end as closed_day,
           case when t.deadline is not null and t.completed_at is not null
                then t.completed_at <= t.deadline end as on_time
      from tasks t
      join people pe on pe.id = t.assignee_id
     where t.company_id = v_company
       and ((t.completed_at >= v_start and t.completed_at < v_end)
         or (t.status = 'done' and t.closed_at >= v_start and t.closed_at < v_end))
  ),
  tk_per as (
    select k.user_id,
           (count(*) filter (where k.handed_day is not null))::int as handed_over,
           (count(*) filter (where k.closed_day is not null))::int as closed,
           (count(*) filter (where k.handed_day is not null and k.on_time))::int as on_time,
           (count(*) filter (where k.handed_day is not null and not k.on_time))::int as late
      from tk k
     group by k.user_id
  ),
  -- what the report rules brought in the period, a refunded dispute counted back — once; an
  -- excuse's row carries the report, so it nets here by itself
  pts as (
    select t.user_id, sum(t.amount + coalesce(f.amount, 0))::int as points
      from reps r
      join point_transactions t on t.daily_report_id = r.id
      left join point_disputes d on d.transaction_id = t.id
      left join point_transactions f on f.id = d.refund_id and f.daily_report_id is null
     group by t.user_id
  ),
  day_line as (
    select dd.day, dd.workday,
           coalesce(gd.submitted, 0) as submitted,
           coalesce(gd.missed, 0) as missed,
           coalesce(gd.excused, 0) as excused,
           coalesce(hd.n, 0) as handed_over,
           coalesce(cd.n, 0) as closed
      from days dd
      left join (
        -- the team now only: whoever left keeps a row, not a weight in the line of the days (D-194)
        select g.day,
               (count(*) filter (where g.active and g.due and g.state = 'submitted'))::int as submitted,
               (count(*) filter (where g.active and g.due and g.state = 'missed' and not g.excused))::int as missed,
               (count(*) filter (where g.active and g.due and g.state = 'missed' and g.excused))::int as excused
          from grid g
         group by g.day
      ) gd on gd.day = dd.day
      left join (select k.handed_day as day, count(*)::int as n from tk k where k.handed_day is not null group by k.handed_day) hd
        on hd.day = dd.day
      left join (select k.closed_day as day, count(*)::int as n from tk k where k.closed_day is not null group by k.closed_day) cd
        on cd.day = dd.day
  ),
  -- the headline is the team's now (lib/people/team.ts): a director who let people go does not get a failed period
  team as (
    select (count(*) filter (where g.active and g.due and g.state = 'submitted'))::int as submitted,
           (count(*) filter (where g.active and g.due and g.state = 'missed' and not g.excused))::int as missed,
           (count(*) filter (where g.active and g.due and g.state = 'missed' and g.excused))::int as excused
      from grid g
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', pe.id,
               'full_name', pe.full_name,
               'position', pe."position",
               'avatar_url', pe.avatar_url,
               'workdays', coalesce(pr.workdays, 0),
               'submitted', coalesce(pr.submitted, 0),
               'missed', coalesce(pr.missed, 0),
               'excused', coalesce(pr.excused, 0),
               'submit_rate', case when coalesce(pr.submitted, 0) + coalesce(pr.missed, 0) > 0
                                   then round(pr.submitted::numeric / (pr.submitted + pr.missed), 3) end,
               'avg_arrived', case when pr.arrived_s is not null
                                   then to_char(make_interval(secs => (round(pr.arrived_s / 60) * 60)::float8), 'HH24:MI') end,
               'avg_left', case when pr.left_s is not null
                                then to_char(make_interval(secs => (round(pr.left_s / 60) * 60)::float8), 'HH24:MI') end,
               'avg_hours', round(pr.hours_avg::numeric, 1),
               'hours_total', round(coalesce(pr.hours_sum, 0)::numeric, 1),
               'handed_over', coalesce(kp.handed_over, 0),
               'closed', coalesce(kp.closed, 0),
               'on_time', coalesce(kp.on_time, 0),
               'late', coalesce(kp.late, 0),
               'points', coalesce(pt.points, 0),
               'usual_submitted', case when pr.submitted_s is not null
                                       then to_char(make_interval(secs => (round(pr.submitted_s / 60) * 60)::float8), 'HH24:MI') end,
               'gone', not pe.active
             ) order by pe.active desc, pe.full_name)
        from people pe
        left join per pr on pr.user_id = pe.id
        left join tk_per kp on kp.user_id = pe.id
        left join pts pt on pt.user_id = pe.id
    ), '[]'::jsonb),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', dl.day,
               'workday', dl.workday,
               'submitted', dl.submitted,
               'missed', dl.missed,
               'excused', dl.excused,
               'handed_over', dl.handed_over,
               'closed', dl.closed
             ) order by dl.day)
        from day_line dl
    ), '[]'::jsonb),
    'totals', (
      select jsonb_build_object(
               'team', (select count(*) from people where active),
               'submitted', tm.submitted,
               'missed', tm.missed,
               'excused', tm.excused,
               'submit_rate', case when tm.submitted + tm.missed > 0
                                   then round(tm.submitted::numeric / (tm.submitted + tm.missed), 3) end,
               'handed_over', (select count(*) from tk k where k.handed_day is not null),
               'closed', (select count(*) from tk k where k.closed_day is not null),
               'hours_total', round(coalesce((select sum(pr.hours_sum) from per pr), 0)::numeric, 1))
        from team tm
    )
  ) into v_result;

  return v_result;
end;
$fn$;
