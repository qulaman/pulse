-- D-194: «Отчёты» count the team now — one rule with lib/people/team.ts.
--
-- team_daily_report_day and team_daily_report_period kept the people who left (a report in the
-- day or the period) in their headline: «7 в команде» beside «3 в команде», a week «19 %» weighed
-- down by people no longer there. Now:
--   * totals.team and every people count (submitted / missed / excused / pending / away) and the
--     line of the days are of the team now (`is_active and team_role(role)`); the ones who left keep
--     their rows, each with `gone: true`, after the team;
--   * the period's rows carry `usual_submitted` ("HH:MM", the average local time of `submitted_at`
--     of handed-in reports) — «обычно сдаёт отчёт около …»; the typed «Пришёл/Ушёл» averages stay
--     in the payload for compatibility, the screens no longer show them as attendance.
-- Bodies: 20261118120000_daily_report_remind_excuse.sql (supabase/SCHEMA.md), changed only where
-- marked «B». Grants are kept by create or replace.

-- ---------------------------------------------------------------------------
-- 1. team_daily_report_day
-- ---------------------------------------------------------------------------
create or replace function team_daily_report_day(p_date date default null) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_company  uuid := auth_company_id();
  v_settings jsonb;
  v_today    date := (now() at time zone 'Asia/Aqtobe')::date;
  v_day      date := coalesce(p_date, (now() at time zone 'Asia/Aqtobe')::date);
  v_from     timestamptz;
  v_to       timestamptz;
  v_result   jsonb;
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  select c.settings into v_settings from companies c where c.id = v_company;
  v_from := v_day::timestamp at time zone 'Asia/Aqtobe';
  v_to := (v_day + 1)::timestamp at time zone 'Asia/Aqtobe';

  -- the team now, and whoever left but has a report for the day: history keeps its people
  with people as (
    select p.id, p.full_name, p."position", p.avatar_url, p.availability, p.created_at,
           (p.is_active and team_role(p.role)) as active
      from profiles p
     where p.company_id = v_company
       and ((p.is_active and team_role(p.role))
         or exists (select 1 from daily_reports r where r.user_id = p.id and r.report_date = v_day))
  ),
  x as (
    select pe.id, pe.full_name, pe."position", pe.avatar_url, pe.availability, pe.active,
           daily_report_state(v_settings, v_day, v_today, r.status, pe.availability, pe.created_at, pe.active) as state,
           r.excused_at is not null as excused,
           case when r.id is null then null else daily_report_json(r) end as report,
           case when r.status = 'submitted'
                then round((extract(epoch from (r.left_at - r.arrived_at)) / 3600)::numeric, 1) end as hours,
           coalesce(a.accepted, 0) as accepted,
           coalesce(a.handed_over, 0) as handed_over,
           coalesce(a.closed, 0) as closed,
           coalesce(m.messages, 0) as messages,
           rm.reminded
      from people pe
      left join daily_reports r on r.user_id = pe.id and r.report_date = v_day
      left join lateral (
        select (count(*) filter (where t.accepted_at >= v_from and t.accepted_at < v_to))::int as accepted,
               (count(*) filter (where t.completed_at >= v_from and t.completed_at < v_to))::int as handed_over,
               (count(*) filter (where t.status = 'done' and t.closed_at >= v_from and t.closed_at < v_to))::int as closed
          from tasks t
         where t.company_id = v_company and t.assignee_id = pe.id
           and (t.accepted_at >= v_from or t.completed_at >= v_from or t.closed_at >= v_from)
      ) a on true
      left join lateral (
        -- words in task threads: text, voice, photo — not the status lines
        select count(*)::int as messages
          from task_messages tm
         where tm.sender_id = pe.id and tm.company_id = v_company
           and tm.created_at >= v_from and tm.created_at < v_to
           and tm.type in ('text', 'voice', 'photo')
      ) m on true
      left join lateral (
        -- D-183: the day's last «Сдайте отчёт» — the director's or the sweep's — with its receipt
        select jsonb_build_object('at', d.created_at, 'by', coalesce(d.meta ->> 'by', 'auto'),
                                  'sent_at', d.sent_at, 'seen_at', d.seen_at) as reminded
          from notification_deliveries d
         where d.user_id = pe.id and d.company_id = v_company and d.event_kind = 'daily_report_remind'
           and d.meta ->> 'date' = to_char(v_day, 'YYYY-MM-DD')
         order by d.created_at desc
         limit 1
      ) rm on true
  )
  select jsonb_build_object(
    'date', v_day,
    'today', v_day = v_today,
    'workday', daily_report_workday(v_settings, v_day),
    'rows', coalesce(jsonb_agg(jsonb_build_object(
              'user_id', x.id,
              'full_name', x.full_name,
              'position', x."position",
              'avatar_url', x.avatar_url,
              'availability', x.availability,
              'state', x.state,
              'report', x.report,
              'tasks', daily_report_tasks(v_company, x.id, v_day),
              'activity', jsonb_build_object('accepted', x.accepted, 'handed_over', x.handed_over,
                                             'closed', x.closed, 'messages', x.messages),
              'hours', x.hours,
              'reminded', x.reminded,
              -- left the team since: the row is history, the day's counts are the team's (D-194)
              'gone', not x.active
            ) order by array_position(array['submitted', 'pending', 'missed', 'away', 'off'], x.state), x.full_name),
            '[]'::jsonb),
    -- the people counts are of the team now (lib/people/team.ts): whoever left keeps a row, not a weight
    'totals', jsonb_build_object(
      'team', count(*) filter (where x.active),
      'submitted', count(*) filter (where x.active and x.state = 'submitted'),
      'missed', count(*) filter (where x.active and x.state = 'missed' and not x.excused),
      'excused', count(*) filter (where x.active and x.state = 'missed' and x.excused),
      'pending', count(*) filter (where x.active and x.state = 'pending'),
      'away', count(*) filter (where x.active and x.state = 'away'),
      'handed_over', coalesce(sum(x.handed_over), 0),
      'closed', coalesce(sum(x.closed), 0)))
    into v_result
    from x;

  return v_result;
end;
$fn$;

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
  days as (
    select g::date as day
      from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g
  ),
  -- every person on every day of the period, with the day's report and state; for one who left
  -- only the days with a row were due (a person gone is never fined)
  grid as (
    select pe.id as user_id, dd.day, r.status, r.arrived_at, r.left_at, r.submitted_at, pe.active,
           r.excused_at is not null as excused,
           daily_report_state(v_settings, dd.day, v_today, r.status, pe.availability, pe.created_at, pe.active) as state,
           (daily_report_workday(v_settings, dd.day) and dd.day >= v_begin and dd.day <= v_today
             and pe.created_at < ((dd.day + 1)::timestamp at time zone 'Asia/Aqtobe')
             and (pe.active or r.id is not null)) as due
      from people pe
     cross join days dd
      left join daily_reports r on r.user_id = pe.id and r.report_date = dd.day
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
      from point_transactions t
      join daily_reports r on r.id = t.daily_report_id
      left join point_disputes d on d.transaction_id = t.id
      left join point_transactions f on f.id = d.refund_id and f.daily_report_id is null
     where r.company_id = v_company and r.report_date between p_from and p_to
     group by t.user_id
  ),
  day_line as (
    select dd.day,
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
               'workday', daily_report_workday(v_settings, dl.day),
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
