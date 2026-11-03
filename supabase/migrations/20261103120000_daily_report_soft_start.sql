-- D-155 §1, §7 (tasks/026): the daily report starts softly.
--
-- 1. A missed report costs a minus only to a person who has handed in at least one report before
--    that day. The morning tick still writes the «missed» row for everybody due — the director
--    sees the gap in «Отчёты».
-- 2. Minuses already taken from people who had no report before that day go back: one
--    auto_rule row «daily_report_missed_refund» per fine, keyed by the same report, so a replay
--    adds nothing (the balance is a sum, принцип 4). auto_rule never reaches the wall or Эфир:
--    tv_events_points and ether_events_praise skip it, and tv_rating does not count it as
--    «заработано» — a minus is not public (D-45), nor is taking it back. An open dispute on such a
--    minus is settled by the refund itself, so the director's «Вернуть» never pays twice.
--    The refund row carries the report's id, so a report's points sum it directly; the refund a
--    dispute points to is added only when it has no report of its own (daily_report_json and
--    the period's points), or a settled dispute would count it twice.
-- 3. A minus given back that way is not disputed again: dispute_points says already_refunded.
-- 4. The company's holidays — settings.daily_report.holidays, "YYYY-MM-DD" strings — are days
--    off: a report may be handed in, but no +1, no reminder, no fine. Every function reads the
--    working day through daily_report_workday and learns the holiday from it.
-- 5. «Чем занимался» is required only on a day without tasks (D-155 §7): the table takes empty
--    words for a submitted report, submit_daily_report refuses them when the day has no tasks.
-- Bodies are copies of 20261028120000_daily_reports.sql and 20261014120000_points_game.sql plus
-- the change; create or replace keeps the grants.

-- ---------------------------------------------------------------------------
-- holidays: a string match against the list — a broken entry never breaks the tick; no list
-- (or not an array) is no holiday, never null
-- ---------------------------------------------------------------------------
create or replace function daily_report_holiday(p_settings jsonb, p_day date) returns boolean
language sql immutable
as $$
  select coalesce(jsonb_typeof(p_settings -> 'daily_report' -> 'holidays') = 'array'
                  and (p_settings -> 'daily_report' -> 'holidays') @> to_jsonb(to_char(p_day, 'YYYY-MM-DD')), false)
$$;

comment on function daily_report_holiday(jsonb, date) is 'D-155 §7: the day is in settings.daily_report.holidays — a day off whatever the weekday';

-- ISO weekdays (1 = Monday); Monday to Friday unless the company chose its own; never a holiday
create or replace function daily_report_workday(p_settings jsonb, p_day date) returns boolean
language sql immutable
as $$
  select case when jsonb_typeof(p_settings -> 'daily_report' -> 'workdays') = 'array'
              then (p_settings -> 'daily_report' -> 'workdays') @> to_jsonb(extract(isodow from p_day)::int)
              else extract(isodow from p_day)::int between 1 and 5 end
         and not daily_report_holiday(p_settings, p_day)
$$;

-- ---------------------------------------------------------------------------
-- my_daily_report — the employee's day (MyDailyReportDay): `holiday`, and `penalty` is what a
-- miss costs this person — 0 until they have handed in a report before this day
-- ---------------------------------------------------------------------------
create or replace function my_daily_report(p_date date default null) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_user     uuid := auth.uid();
  v_company  uuid := auth_company_id();
  v_role     user_role;
  v_settings jsonb;
  v_today    date := (now() at time zone 'Asia/Aqtobe')::date;
  v_day      date := coalesce(p_date, (now() at time zone 'Asia/Aqtobe')::date);
  v_report   daily_reports%rowtype;
  v_last     timestamptz;
  v_arrived  timestamptz;
  v_left     timestamptz;
begin
  select p.role into v_role from profiles p where p.id = v_user and p.company_id = v_company and p.is_active;
  if v_role is null or not team_role(v_role) then
    raise exception 'not_team_member' using errcode = 'P0001';
  end if;
  select c.settings into v_settings from companies c where c.id = v_company;

  select * into v_report from daily_reports r where r.user_id = v_user and r.report_date = v_day;

  -- prefill: arrival at the time of day of the last report sent, else the company's work start;
  -- leaving — now (the screen rounds it)
  select r.arrived_at into v_last
    from daily_reports r
   where r.user_id = v_user and r.status = 'submitted' and r.report_date <= v_day
   order by r.report_date desc
   limit 1;
  v_arrived := (v_day + coalesce(date_trunc('minute', v_last at time zone 'Asia/Aqtobe')::time,
                                 daily_report_clock(v_settings, 'work_start', '09:00')))
               at time zone 'Asia/Aqtobe';
  v_left := case when v_day = v_today then now()
                 else least(v_arrived + interval '9 hours',
                            ((v_day + 1)::timestamp at time zone 'Asia/Aqtobe') - interval '1 minute') end;

  return jsonb_build_object(
    'date', v_day,
    'today', v_day = v_today,
    'workday', daily_report_workday(v_settings, v_day),
    'holiday', daily_report_holiday(v_settings, v_day),
    'enabled', daily_report_on(v_settings),
    'report', case when v_report.id is null then null else daily_report_json(v_report) end,
    'tasks', daily_report_tasks(v_company, v_user, v_day),
    'suggest', jsonb_build_object('arrived_at', v_arrived, 'left_at', v_left),
    'points', jsonb_build_object(
      'enabled', coalesce(v_settings ->> 'points_enabled', 'false') = 'true',
      'reward', greatest(points_rule(v_settings, 'daily_report', 1), 0),
      -- D-155 §1: no fine before the person's first report — the tick's rule, said in advance
      'penalty', case when exists (select 1 from daily_reports r
                                    where r.user_id = v_user and r.status = 'submitted' and r.report_date < v_day)
                      then abs(points_rule(v_settings, 'daily_report_missed', 10)) else 0 end));
end;
$fn$;

-- ---------------------------------------------------------------------------
-- «Чем занимался» may stay empty on a day with tasks (D-155 §7): the table keeps the words
-- (empty included, never null, at most 4000), the RPC decides when they are required
-- ---------------------------------------------------------------------------
alter table daily_reports drop constraint daily_reports_check;
alter table daily_reports add constraint daily_reports_check check (
  status = 'missed' or (arrived_at is not null and left_at is not null and left_at > arrived_at
                        and submitted_at is not null and summary is not null and length(trim(summary)) <= 4000)
);

-- ---------------------------------------------------------------------------
-- submit_daily_report — today's report, sent or edited; yesterday's, sent offline before
-- midnight, while the day is still open (SubmitDailyReportResult). Words are required only on a
-- day without tasks: the day's tasks are already the report (D-155 §7); empty words stay ''.
-- ---------------------------------------------------------------------------
create or replace function submit_daily_report(
  p_arrived_at timestamptz,
  p_left_at timestamptz,
  p_summary text,
  client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid     uuid := client_request_id;
  v_user     uuid := auth.uid();
  v_company  uuid := auth_company_id();
  v_role     user_role;
  v_settings jsonb;
  v_today    date := (now() at time zone 'Asia/Aqtobe')::date;
  v_day      date;
  v_from     timestamptz;
  v_to       timestamptz;
  v_summary  text := trim(coalesce(p_summary, ''));
  v_report   daily_reports%rowtype;
  v_first    boolean;
  v_reward   int;
  v_awarded  int := 0;
begin
  select p.role into v_role from profiles p where p.id = v_user and p.company_id = v_company and p.is_active;
  if v_role is null or not team_role(v_role) then
    raise exception 'not_team_member' using errcode = 'P0001';
  end if;

  -- a replay of a stored submit (the offline queue, a retried POST) gets that report back, even
  -- after midnight
  if v_crid is not null then
    select * into v_report from daily_reports r where r.user_id = v_user and r.client_request_id = v_crid;
    if v_report.id is not null then
      return jsonb_build_object('report', daily_report_json(v_report), 'points_awarded', 0);
    end if;
  end if;

  select c.settings into v_settings from companies c where c.id = v_company;
  if not daily_report_on(v_settings) then
    raise exception 'daily_report_disabled' using errcode = 'P0001';
  end if;

  -- the report's day is the local day of the arrival: today, or yesterday for a report sent
  -- offline before midnight that arrives after it — only while yesterday has no row and the
  -- morning tick has not closed it
  if p_arrived_at is null or p_left_at is null then
    raise exception 'bad_times' using errcode = 'P0001';
  end if;
  v_day := (p_arrived_at at time zone 'Asia/Aqtobe')::date;
  if v_day <> v_today
     and not (v_day = v_today - 1
              and v_day > coalesce(daily_report_checked_on(v_settings), v_day - 1)
              and not exists (select 1 from daily_reports r where r.user_id = v_user and r.report_date = v_day)) then
    raise exception 'bad_times' using errcode = 'P0001';
  end if;
  -- both moments inside that day, leaving after arriving
  v_from := v_day::timestamp at time zone 'Asia/Aqtobe';
  v_to := (v_day + 1)::timestamp at time zone 'Asia/Aqtobe';
  if p_arrived_at < v_from or p_left_at >= v_to or p_left_at <= p_arrived_at then
    raise exception 'bad_times' using errcode = 'P0001';
  end if;
  -- D-155 §7: no words are needed when the day's tasks are in the report
  if v_summary = '' and jsonb_array_length(daily_report_tasks(v_company, v_user, v_day)) = 0 then
    raise exception 'summary_required' using errcode = 'P0001';
  end if;
  if length(v_summary) > 4000 then
    raise exception 'summary_too_long' using errcode = 'P0001';
  end if;

  if v_day = v_today then
    v_first := not exists (select 1 from daily_reports r where r.user_id = v_user and r.report_date = v_day);

    -- a second submit the same day is an edit: the snapshot of the day's tasks is taken again
    insert into daily_reports as r
      (company_id, user_id, report_date, status, arrived_at, left_at, summary, tasks, submitted_at, client_request_id)
    values
      (v_company, v_user, v_day, 'submitted', p_arrived_at, p_left_at, v_summary,
       daily_report_tasks(v_company, v_user, v_day), now(), v_crid)
    on conflict (user_id, report_date) do update
       set status = 'submitted',
           arrived_at = excluded.arrived_at,
           left_at = excluded.left_at,
           summary = excluded.summary,
           tasks = excluded.tasks,
           submitted_at = coalesce(r.submitted_at, excluded.submitted_at),
           client_request_id = excluded.client_request_id
    returning * into v_report;
  else
    -- yesterday's late report never overwrites a row: a tick that wrote «missed» meanwhile wins
    v_first := true;
    insert into daily_reports
      (company_id, user_id, report_date, status, arrived_at, left_at, summary, tasks, submitted_at, client_request_id)
    values
      (v_company, v_user, v_day, 'submitted', p_arrived_at, p_left_at, v_summary,
       daily_report_tasks(v_company, v_user, v_day), now(), v_crid)
    on conflict (user_id, report_date) do nothing
    returning * into v_report;
    if v_report.id is null then
      raise exception 'bad_times' using errcode = 'P0001';
    end if;
  end if;

  -- +1 for the first submit of a working day; the key makes a race of two first submits pay once
  if v_first and daily_report_workday(v_settings, v_day)
     and coalesce(v_settings ->> 'points_enabled', 'false') = 'true' then
    v_reward := points_rule(v_settings, 'daily_report', 1);
    if v_reward > 0 then
      insert into point_transactions (company_id, user_id, amount, reason, source, rule_code, daily_report_id)
      values (v_company, v_user, v_reward, 'отчёт за день ' || to_char(v_day, 'DD.MM'),
              'auto_rule', 'daily_report', v_report.id)
      on conflict (daily_report_id, rule_code) where daily_report_id is not null do nothing
      returning amount into v_awarded;
      v_awarded := coalesce(v_awarded, 0);
    end if;
  end if;

  return jsonb_build_object('report', daily_report_json(v_report), 'points_awarded', v_awarded);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- a report as the screens read it (DailyReport): points — the rows the report brought, a
-- refunded dispute («Оспорить», D-133) counted back. A dispute settled by
-- daily_report_refund_early_fines points at a row that is the report's own already: added once.
-- ---------------------------------------------------------------------------
create or replace function daily_report_json(p_report daily_reports) returns jsonb
language sql stable set search_path = public
as $$
  select jsonb_build_object(
    'id', p_report.id,
    'user_id', p_report.user_id,
    'report_date', p_report.report_date,
    'status', p_report.status,
    'arrived_at', p_report.arrived_at,
    'left_at', p_report.left_at,
    'summary', p_report.summary,
    'tasks', p_report.tasks,
    'submitted_at', p_report.submitted_at,
    'updated_at', p_report.updated_at,
    'points', (select coalesce(sum(t.amount + coalesce(f.amount, 0)), 0)::int
                 from point_transactions t
                 left join point_disputes d on d.transaction_id = t.id
                 left join point_transactions f on f.id = d.refund_id and f.daily_report_id is null
                where t.daily_report_id = p_report.id))
$$;

-- ---------------------------------------------------------------------------
-- team_daily_report_period — the director's period (TeamPeriod), both days inclusive, ≤ 92 days;
-- the 20261028120000 body, the refund of a settled dispute counted once (as in daily_report_json)
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
    select pe.id as user_id, dd.day, r.status, r.arrived_at, r.left_at,
           daily_report_state(v_settings, dd.day, v_today, r.status, pe.availability, pe.created_at, pe.active) as state,
           (daily_report_workday(v_settings, dd.day) and dd.day >= v_begin and dd.day <= v_today
             and pe.created_at < ((dd.day + 1)::timestamp at time zone 'Asia/Aqtobe')
             and (pe.active or r.id is not null)) as due
      from people pe
     cross join days dd
      left join daily_reports r on r.user_id = pe.id and r.report_date = dd.day
  ),
  per as (
    select g.user_id,
           (count(*) filter (where g.due))::int as workdays,
           (count(*) filter (where g.state = 'submitted'))::int as submitted,
           (count(*) filter (where g.state = 'missed'))::int as missed,
           avg(extract(epoch from (g.arrived_at at time zone 'Asia/Aqtobe')::time)) filter (where g.status = 'submitted') as arrived_s,
           avg(extract(epoch from (g.left_at at time zone 'Asia/Aqtobe')::time)) filter (where g.status = 'submitted') as left_s,
           avg(extract(epoch from (g.left_at - g.arrived_at)) / 3600) filter (where g.status = 'submitted') as hours_avg,
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
  -- what the report rules brought in the period, a refunded dispute counted back — once
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
           coalesce(hd.n, 0) as handed_over,
           coalesce(cd.n, 0) as closed
      from days dd
      left join (
        select g.day,
               (count(*) filter (where g.state = 'submitted'))::int as submitted,
               (count(*) filter (where g.state = 'missed'))::int as missed
          from grid g
         group by g.day
      ) gd on gd.day = dd.day
      left join (select k.handed_day as day, count(*)::int as n from tk k where k.handed_day is not null group by k.handed_day) hd
        on hd.day = dd.day
      left join (select k.closed_day as day, count(*)::int as n from tk k where k.closed_day is not null group by k.closed_day) cd
        on cd.day = dd.day
  ),
  team as (
    select (count(*) filter (where g.state = 'submitted'))::int as submitted,
           (count(*) filter (where g.state = 'missed'))::int as missed
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
               'points', coalesce(pt.points, 0)
             ) order by pe.full_name)
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
               'handed_over', dl.handed_over,
               'closed', dl.closed
             ) order by dl.day)
        from day_line dl
    ), '[]'::jsonb),
    'totals', (
      select jsonb_build_object(
               'team', (select count(*) from people),
               'submitted', tm.submitted,
               'missed', tm.missed,
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

-- ---------------------------------------------------------------------------
-- daily_reports_due_missed — the morning tick: a past working day without a report is missed,
-- and with points on it costs daily_report_missed (D-152 §6) — only to one who handed in a report
-- before that day (D-155 §1). Each day is closed once (settings.daily_report.checked_on); a
-- replay of the tick writes nothing twice.
-- ---------------------------------------------------------------------------
create or replace function daily_reports_due_missed(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_local   timestamp := p_now at time zone 'Asia/Aqtobe';
  v_today   date := v_local::date;
  c         record;
  v_start   date;
  v_first   date;
  v_last    date;
  v_penalty int;
  v_n       int;
  v_count   int := 0;
begin
  for c in
    select co.id, co.settings from companies co where daily_report_on(co.settings)
  loop
    v_start := daily_report_started_on(c.settings);
    if v_start is null then
      -- the module's first tick here: fines count from today, never backwards
      update companies co
         set settings = jsonb_set(co.settings, '{daily_report}',
               case when jsonb_typeof(co.settings -> 'daily_report') = 'object'
                    then co.settings -> 'daily_report' else '{}'::jsonb end
               || jsonb_build_object('started_on', to_char(v_today, 'YYYY-MM-DD')))
       where co.id = c.id;
      continue;
    end if;

    -- yesterday closes only once the company's morning has come (the delivery window opens,
    -- 08:00 by default): a minute tick would fine at 00:01 and leave no room for a report sent
    -- offline before midnight; the daily Hobby cron (08:xx Aqtobe) closes it on its run
    v_last := v_today - case when v_local::time >= (case when (c.settings -> 'delivery_window' ->> 'from') ~ '^[0-9]{2}:[0-9]{2}$'
                                                         then (c.settings -> 'delivery_window' ->> 'from')::time
                                                         else time '08:00' end)
                             then 1 else 2 end;

    -- the days not closed yet: from started_on, after the last closed one, at most a week back
    v_first := greatest(v_start, v_today - 7, daily_report_checked_on(c.settings) + 1);
    continue when v_first > v_last;

    v_penalty := case when coalesce(c.settings ->> 'points_enabled', 'false') = 'true'
                      then abs(points_rule(c.settings, 'daily_report_missed', 10)) else 0 end;

    -- not those away or inactive now, nor those who came after the day
    with missed as (
      insert into daily_reports (company_id, user_id, report_date, status)
      select c.id, p.id, d.day, 'missed'
        from (select g::date as day
                from generate_series(v_first::timestamp, v_last::timestamp, interval '1 day') g) d
        join profiles p
          on p.company_id = c.id and p.is_active and team_role(p.role) and p.availability = 'active'
         and p.created_at < ((d.day + 1)::timestamp at time zone 'Asia/Aqtobe')
       where daily_report_workday(c.settings, d.day)
      on conflict (user_id, report_date) do nothing
      returning id, user_id, report_date
    ),
    fined as (
      -- a minus is never public (D-45): tv_events_points and Эфир skip auto_rule and amounts ≤ 0
      insert into point_transactions (company_id, user_id, amount, reason, source, rule_code, daily_report_id)
      select c.id, m.user_id, -v_penalty, 'не сдан отчёт за ' || to_char(m.report_date, 'DD.MM'),
             'auto_rule'::point_source, 'daily_report_missed', m.id
        from missed m
       where v_penalty > 0
         -- D-155 §1: the row is written for everybody, the minus only for one who has handed in
         -- a report before that day
         and exists (select 1 from daily_reports r
                       where r.user_id = m.user_id and r.status = 'submitted' and r.report_date < m.report_date)
      on conflict (daily_report_id, rule_code) where daily_report_id is not null do nothing
      returning 1
    )
    select count(*)::int into v_n from missed;
    v_count := v_count + v_n;

    -- the days are closed: whoever was skipped (away, not there yet) stays free of them for good
    update companies co
       set settings = jsonb_set(co.settings, '{daily_report,checked_on}', to_jsonb(to_char(v_last, 'YYYY-MM-DD')))
     where co.id = c.id;
  end loop;
  return v_count;
end
$fn$;

-- ---------------------------------------------------------------------------
-- daily_report_refund_early_fines — gives back the minuses taken before the person's first
-- report (D-155 §1): +|amount| per fine, auto_rule, keyed by the same report. Skips a fine that is
-- right by the new rule (a report handed in before that day) and one already refunded by
-- «Оспорить»; an open dispute on a fine it gives back is settled as refunded by that row, so the
-- director's «Вернуть» cannot pay a second time. A replay inserts nothing: the
-- (daily_report_id, rule_code) key.
-- ---------------------------------------------------------------------------
create or replace function daily_report_refund_early_fines() returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_count int;
begin
  with refunded as (
    insert into point_transactions (company_id, user_id, amount, reason, source, rule_code, daily_report_id)
    select t.company_id, t.user_id, abs(t.amount),
           'возврат штрафа за ' || to_char(r.report_date, 'DD.MM') || ': до первого отчёта не штрафуем',
           'auto_rule'::point_source, 'daily_report_missed_refund', t.daily_report_id
      from point_transactions t
      join daily_reports r on r.id = t.daily_report_id
     where t.rule_code = 'daily_report_missed' and t.amount < 0
       and not exists (select 1 from daily_reports s
                        where s.user_id = r.user_id and s.status = 'submitted' and s.report_date < r.report_date)
       and not exists (select 1 from point_disputes d
                        where d.transaction_id = t.id and d.refund_id is not null)
    on conflict (daily_report_id, rule_code) where daily_report_id is not null do nothing
    returning id, daily_report_id
  ),
  settled as (
    update point_disputes d
       set status = 'refunded', refund_id = f.id, resolved_at = now(),
           answer = 'вернули: до первого отчёта не штрафуем'
      from refunded f
      join point_transactions t on t.daily_report_id = f.daily_report_id and t.rule_code = 'daily_report_missed'
     where d.transaction_id = t.id and d.status = 'open'
    returning 1
  )
  select count(*)::int into v_count from refunded;
  return v_count;
end
$fn$;

comment on function daily_report_refund_early_fines() is 'D-155 §1: gives back the daily-report minuses taken before the person''s first report; a replay adds nothing';

revoke execute on function daily_report_refund_early_fines() from public, anon, authenticated;
grant execute on function daily_report_refund_early_fines() to service_role;

-- ---------------------------------------------------------------------------
-- dispute_points — the D-133 body plus one refusal: a minus the refund above gave back
-- ---------------------------------------------------------------------------
create or replace function dispute_points(
  p_transaction uuid,
  p_text text,
  client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid    uuid := client_request_id;
  v_company uuid := auth_company_id();
  v_user    uuid := auth.uid();
  v_tx      point_transactions%rowtype;
  v_id      uuid;
  v_first   text;
  v_result  jsonb;
begin
  if length(trim(coalesce(p_text, ''))) = 0 then
    raise exception 'text_required' using errcode = 'P0001';
  end if;

  if v_crid is not null then
    insert into ingest_batches (company_id, user_id, client_request_id, result)
    values (v_company, v_user, v_crid, '{}'::jsonb)
    on conflict on constraint ingest_batches_company_request_key do nothing;
    if not found then
      select b.result into v_result from ingest_batches b
       where b.company_id = v_company and b.client_request_id = v_crid;
      return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('duplicate', true);
    end if;
  end if;

  select * into v_tx from point_transactions t
   where t.id = p_transaction and t.company_id = v_company and t.user_id = v_user;
  if v_tx.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  -- only a minus is disputed; a hold is the person's own order, not a judgement
  if v_tx.amount >= 0 or v_tx.source in ('shop_hold', 'shop_release') then
    raise exception 'not_disputable' using errcode = 'P0001';
  end if;
  -- D-155 §1: a daily-report minus given back by daily_report_refund_early_fines is settled
  if v_tx.daily_report_id is not null and exists (
       select 1 from point_transactions f
        where f.daily_report_id = v_tx.daily_report_id and f.rule_code = 'daily_report_missed_refund') then
    raise exception 'already_refunded' using errcode = 'P0001';
  end if;
  if exists (select 1 from point_disputes d where d.transaction_id = v_tx.id) then
    raise exception 'already_disputed' using errcode = 'P0001';
  end if;

  insert into point_disputes (company_id, transaction_id, user_id, text)
  values (v_company, v_tx.id, v_user, left(trim(p_text), 500))
  returning id into v_id;

  select nullif(split_part(p.full_name, ' ', 1), '') into v_first from profiles p where p.id = v_user;
  insert into notification_deliveries (company_id, user_id, event_kind, meta)
  select v_company, p.id, 'points_dispute',
         jsonb_build_object('title', 'Оспаривает' || coalesce(' · ' || v_first, ''),
                            'body', v_tx.amount || ' «' || left(v_tx.reason, 60) || '» · ' || left(trim(p_text), 90),
                            'url', '/rating#disputes')
    from profiles p
   where p.company_id = v_company and p.role = 'director' and p.is_active;

  v_result := jsonb_build_object('id', v_id, 'status', 'open');
  if v_crid is not null then
    update ingest_batches b set result = v_result
     where b.company_id = v_company and b.client_request_id = v_crid;
  end if;
  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- tv_rating — 20261014120000_points_game.sql word for word, except: a minus given back by
-- daily_report_refund_early_fines is not «заработано» on the wall — the minus was never public
-- (D-45), nor is taking it back
-- ---------------------------------------------------------------------------
create or replace function tv_rating(p_guest boolean default false, p_period text default 'week') returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_company uuid;
  v_state   tv_state;
  v_points  boolean;
  v_period  text := case when p_period = 'month' then 'month' else 'week' end;
  v_span    interval;
  v_from    timestamptz;
  v_prev    timestamptz;
  v_result  jsonb;
begin
  if auth_role() not in ('tv', 'director') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  v_company := auth_company_id();

  select * into v_state from tv_state where company_id = v_company;
  if coalesce(p_guest, false) or (found and tv_guest_on(v_state)) then
    return jsonb_build_object('hidden', true);
  end if;

  select coalesce((c.settings->>'points_enabled')::boolean, false) into v_points
    from companies c where c.id = v_company;
  if not coalesce(v_points, false) then
    return jsonb_build_object('hidden', false, 'enabled', false, 'period', v_period);
  end if;

  v_span := case when v_period = 'month' then interval '1 month' else interval '7 days' end;
  v_from := now() - v_span;
  v_prev := v_from - v_span;

  with people as (
    select p.id, p.full_name, p."position", p.avatar_url, p.streak_count
      from profiles p
     where p.company_id = v_company and p.is_active
       and p.role in ('employee', 'manager', 'shopkeeper')
  ),
  cur as (
    select t.user_id, sum(t.amount)::int as pts
      from point_transactions t
     where t.company_id = v_company and t.created_at >= v_from
     group by t.user_id
  ),
  prev as (
    select t.user_id, sum(t.amount)::int as pts
      from point_transactions t
     where t.company_id = v_company and t.created_at >= v_prev and t.created_at < v_from
     group by t.user_id
  ),
  done as (
    select k.assignee_id,
           count(*)::int as total,
           (count(*) filter (where k.deadline is null or k.closed_at <= k.deadline))::int as on_time
      from tasks k
     where k.company_id = v_company and k.status = 'done' and k.closed_at >= v_from
     group by k.assignee_id
  ),
  ranked as (
    select pe.id, pe.full_name, pe."position", pe.avatar_url, pe.streak_count,
           coalesce(cur.pts, 0) as pts,
           coalesce(cur.pts, 0) - coalesce(prev.pts, 0) as delta,
           coalesce(done.total, 0) as done,
           coalesce(done.on_time, 0) as on_time,
           dense_rank() over (order by coalesce(cur.pts, 0) desc, pe.full_name)::int as rnk
      from people pe
      left join cur  on cur.user_id = pe.id
      left join prev on prev.user_id = pe.id
      left join done on done.assignee_id = pe.id
  ),
  awards as (
    -- what was given and why: only rewards, never a penalty or a shop hold (D-45); the director's
    -- own — an automatic bonus is a «сдал» line already, a quiet award and a refund stay private (D-133)
    select p.full_name as name, t.amount, t.reason, t.created_at as at
      from point_transactions t
      join profiles p on p.id = t.user_id
     where t.company_id = v_company and t.created_at >= v_from
       and t.amount > 0 and ((t.source = 'manual' and not t.quiet) or t.source = 'reaction')
     order by t.created_at desc
     limit 3
  )
  select jsonb_build_object(
    'hidden', false,
    'enabled', true,
    'period', v_period,
    -- the first five with points: no bottom of the list on the wall (D-45)
    'top', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'name', r.full_name, 'position', r."position", 'avatar_url', r.avatar_url,
               'points', r.pts, 'rank', r.rnk, 'delta', r.delta, 'done', r.done, 'on_time', r.on_time,
               'streak', r.streak_count
             ) order by r.rnk)
        from ranked r where r.rnk <= 5 and r.pts > 0
    ), '[]'::jsonb),
    -- who grew most against the span before: growth only
    'riser', (
      select jsonb_build_object('id', r.id, 'name', r.full_name, 'avatar_url', r.avatar_url, 'delta', r.delta, 'points', r.pts)
        from ranked r where r.delta > 0 and r.pts > 0
       order by r.delta desc, r.full_name
       limit 1
    ),
    'awards', coalesce((select jsonb_agg(jsonb_build_object('name', a.name, 'amount', a.amount, 'reason', a.reason, 'at', a.at) order by a.at desc) from awards a), '[]'::jsonb),
    'team', jsonb_build_object(
      'done', (select coalesce(sum(r.done), 0) from ranked r),
      'on_time', (select coalesce(sum(r.on_time), 0) from ranked r),
      'earned', (select coalesce(sum(t.amount), 0)
                   from point_transactions t
                  where t.company_id = v_company and t.created_at >= v_from
                    and t.amount > 0 and t.source in ('manual', 'reaction', 'auto_rule')
                    -- D-155 §1: a minus given back is no earning, like a refund by «Оспорить»
                    and t.rule_code is distinct from 'refund'
                    and t.rule_code is distinct from 'daily_report_missed_refund'),
      'people', (select count(*) from ranked r where r.pts > 0)
    )
  ) into v_result;

  return v_result;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- the minuses taken so far from people without a report before that day go back now
-- ---------------------------------------------------------------------------
select daily_report_refund_early_fines();
