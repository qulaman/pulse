-- D-152 (tasks/021): the daily report.
--
-- 1. daily_reports — one row per person and Asia/Aqtobe day: «submitted» by the person (arrived,
--    left, «Чем занимался», the day's tasks as a snapshot), or «missed» — written by the morning
--    tick for a past working day without one. The author and the director read it; writes go
--    only through the functions below.
-- 2. Points: +points_rules.daily_report on the first submit of a working day, −daily_report_missed
--    for a missed one (points_enabled only) — auto_rule rows keyed by the report, never twice.
--    Neither reaches the wall or Эфир: tv_events_points and ether_events_praise skip auto_rule,
--    tv_rating's «награды» take the director's own only; the rating and the balance sum them.
-- 3. Ticks of /api/push/sweep: daily_reports_due_missed (the morning) and
--    daily_report_reminders_due («Сдайте отчёт за день» at settings.daily_report.remind_at).
-- Settings: settings.daily_report {enabled, workdays, work_start, remind_at, started_on,
-- checked_on} — lib/settings.ts holds the same defaults; the last two are written by the server.

-- ---------------------------------------------------------------------------
-- settings helpers: settings.daily_report with the defaults of lib/settings.ts
-- ---------------------------------------------------------------------------
create or replace function daily_report_on(p_settings jsonb) returns boolean
language sql immutable
as $$
  select coalesce(p_settings -> 'daily_report' ->> 'enabled', 'true') <> 'false'
$$;

-- ISO weekdays (1 = Monday); Monday to Friday unless the company chose its own
create or replace function daily_report_workday(p_settings jsonb, p_day date) returns boolean
language sql immutable
as $$
  select case when jsonb_typeof(p_settings -> 'daily_report' -> 'workdays') = 'array'
              then (p_settings -> 'daily_report' -> 'workdays') @> to_jsonb(extract(isodow from p_day)::int)
              else extract(isodow from p_day)::int between 1 and 5 end
$$;

-- "HH:MM" of settings.daily_report.<key>; a missing or broken value gives the default
create or replace function daily_report_clock(p_settings jsonb, p_key text, p_default text) returns time
language sql stable
as $$
  select (case when (p_settings -> 'daily_report' ->> p_key) ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
               then p_settings -> 'daily_report' ->> p_key
               else p_default end)::time
$$;

-- the first day a missing report is fined; null until the first morning tick writes it
create or replace function daily_report_started_on(p_settings jsonb) returns date
language sql stable
as $$
  select case when (p_settings -> 'daily_report' ->> 'started_on') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
              then (p_settings -> 'daily_report' ->> 'started_on')::date end
$$;

comment on function daily_report_started_on(jsonb) is 'D-152: fines count from this day; the first tick of the module writes today, switching it on in «Настройки» too';

-- the last day the morning tick closed: a closed day is never looked at again, so a person back
-- from leave is not fined for the days away; null until the first day is closed
create or replace function daily_report_checked_on(p_settings jsonb) returns date
language sql stable
as $$
  select case when (p_settings -> 'daily_report' ->> 'checked_on') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
              then (p_settings -> 'daily_report' ->> 'checked_on')::date end
$$;

-- ---------------------------------------------------------------------------
-- daily_reports
-- ---------------------------------------------------------------------------
create table daily_reports (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies,
  user_id           uuid not null references profiles,
  report_date       date not null,                 -- Asia/Aqtobe day
  status            text not null check (status in ('submitted', 'missed')),
  arrived_at        timestamptz,
  left_at           timestamptz,
  summary           text,
  tasks             jsonb not null default '[]',   -- DailyReportTask[] snapshot
  submitted_at      timestamptz,
  client_request_id uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, report_date),
  check (status = 'missed' or (arrived_at is not null and left_at is not null and left_at > arrived_at
         and submitted_at is not null and length(trim(summary)) between 1 and 4000))
);

comment on table daily_reports is 'D-152: one row per person and Asia/Aqtobe day — submitted by the person or missed (the morning tick); writes only through the definer functions';
comment on column daily_reports.tasks is 'the day''s tasks (lib/daily-report/types.ts DailyReportTask[]) as they were at the last submit';
comment on column daily_reports.submitted_at is 'the first submit; an edit later that day moves updated_at only';

create index daily_reports_company_date_idx on daily_reports (company_id, report_date);

create trigger trg_daily_reports_updated_at
  before update on daily_reports
  for each row execute function moddatetime(updated_at);

alter table daily_reports enable row level security;

-- the author and the director of the company; no insert/update/delete policies: writes go
-- through submit_daily_report and the morning tick only
create policy daily_reports_select on daily_reports for select using (
  company_id = (select auth_company_id())
  and (user_id = (select auth.uid()) or (select auth_role()) = 'director')
);

-- ---------------------------------------------------------------------------
-- point_transactions.daily_report_id — the report a rule paid for, once per report and rule
-- ---------------------------------------------------------------------------
alter table point_transactions add column daily_report_id uuid references daily_reports;

create unique index point_transactions_daily_report_key
  on point_transactions (daily_report_id, rule_code) where daily_report_id is not null;

comment on column point_transactions.daily_report_id is 'D-152: the report a +daily_report / −daily_report_missed row is for';

-- ---------------------------------------------------------------------------
-- the day's tasks: handed over (completed_at) that day, or accepted by the director (closed_at,
-- done only) that day. Not a definer: called by the RPCs below, never by a client.
-- ---------------------------------------------------------------------------
create or replace function daily_report_tasks(p_company uuid, p_user uuid, p_day date) returns jsonb
language sql stable set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id,
           'title', t.title,
           'status', t.status,
           'completed_at', t.completed_at,
           'closed_at', case when t.status = 'done' then t.closed_at end,
           'on_time', case when t.deadline is not null and t.completed_at is not null
                           then t.completed_at <= t.deadline end
         ) order by coalesce(t.completed_at, t.closed_at), t.id), '[]'::jsonb)
    from tasks t
   where t.company_id = p_company and t.assignee_id = p_user
     and t.status in ('pending_review', 'done')
     and ((t.completed_at >= (p_day::timestamp at time zone 'Asia/Aqtobe')
           and t.completed_at < ((p_day + 1)::timestamp at time zone 'Asia/Aqtobe'))
       or (t.status = 'done'
           and t.closed_at >= (p_day::timestamp at time zone 'Asia/Aqtobe')
           and t.closed_at < ((p_day + 1)::timestamp at time zone 'Asia/Aqtobe')))
$$;

-- ---------------------------------------------------------------------------
-- a report as the screens read it (DailyReport): points — the rows the report brought, a
-- refunded dispute («Оспорить», D-133) counted back
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
                 left join point_transactions f on f.id = d.refund_id
                where t.daily_report_id = p_report.id))
$$;

-- ---------------------------------------------------------------------------
-- where a person stands on a day (TeamDayState): one rule for the day and the period
-- ---------------------------------------------------------------------------
create or replace function daily_report_state(
  p_settings     jsonb,
  p_day          date,
  p_today        date,
  p_status       text,
  p_availability availability_t,
  p_joined       timestamptz,
  p_active       boolean
) returns text
language sql stable
as $$
  select case
           when p_status = 'submitted' then 'submitted'
           when p_status = 'missed' then 'missed'
           -- not due: the person left (never fined), the module is off, a day off, before the
           -- fines started, before the person came
           when not p_active
             or not daily_report_on(p_settings)
             or not daily_report_workday(p_settings, p_day)
             or p_day < coalesce(daily_report_started_on(p_settings), p_today)
             or p_joined >= ((p_day + 1)::timestamp at time zone 'Asia/Aqtobe') then 'off'
           when p_availability <> 'active' then 'away'
           -- a day the tick closed without a row for the person: they were away then
           when p_day <= daily_report_checked_on(p_settings) then 'away'
           -- a past due day without a report is missed before the morning tick writes it, too
           when p_day < p_today then 'missed'
           else 'pending'
         end
$$;

-- ---------------------------------------------------------------------------
-- my_daily_report — the employee's day (MyDailyReportDay)
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
    'enabled', daily_report_on(v_settings),
    'report', case when v_report.id is null then null else daily_report_json(v_report) end,
    'tasks', daily_report_tasks(v_company, v_user, v_day),
    'suggest', jsonb_build_object('arrived_at', v_arrived, 'left_at', v_left),
    'points', jsonb_build_object(
      'enabled', coalesce(v_settings ->> 'points_enabled', 'false') = 'true',
      'reward', greatest(points_rule(v_settings, 'daily_report', 1), 0),
      'penalty', abs(points_rule(v_settings, 'daily_report_missed', 10))));
end;
$fn$;

-- ---------------------------------------------------------------------------
-- submit_daily_report — today's report, sent or edited; yesterday's, sent offline before
-- midnight, while the day is still open (SubmitDailyReportResult)
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
  if v_summary = '' then
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
-- my_daily_report_history — the person's reports, newest first, submitted and missed
-- ---------------------------------------------------------------------------
create or replace function my_daily_report_history(p_limit int default 30) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_user    uuid := auth.uid();
  v_company uuid := auth_company_id();
  v_role    user_role;
begin
  select p.role into v_role from profiles p where p.id = v_user and p.company_id = v_company and p.is_active;
  if v_role is null or not team_role(v_role) then
    raise exception 'not_team_member' using errcode = 'P0001';
  end if;

  return coalesce((
    select jsonb_agg(daily_report_json(r) order by r.report_date desc)
      from daily_reports r
     where r.id in (select x.id
                      from daily_reports x
                     where x.user_id = v_user and x.company_id = v_company
                     order by x.report_date desc
                     limit least(greatest(coalesce(p_limit, 30), 1), 366))
  ), '[]'::jsonb);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- team_daily_report_day — the director's day (TeamDay)
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
    select pe.id, pe.full_name, pe."position", pe.avatar_url, pe.availability,
           daily_report_state(v_settings, v_day, v_today, r.status, pe.availability, pe.created_at, pe.active) as state,
           case when r.id is null then null else daily_report_json(r) end as report,
           case when r.status = 'submitted'
                then round((extract(epoch from (r.left_at - r.arrived_at)) / 3600)::numeric, 1) end as hours,
           coalesce(a.accepted, 0) as accepted,
           coalesce(a.handed_over, 0) as handed_over,
           coalesce(a.closed, 0) as closed,
           coalesce(m.messages, 0) as messages
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
              'hours', x.hours
            ) order by array_position(array['submitted', 'pending', 'missed', 'away', 'off'], x.state), x.full_name),
            '[]'::jsonb),
    'totals', jsonb_build_object(
      'team', count(*),
      'submitted', count(*) filter (where x.state = 'submitted'),
      'missed', count(*) filter (where x.state = 'missed'),
      'pending', count(*) filter (where x.state = 'pending'),
      'away', count(*) filter (where x.state = 'away'),
      'handed_over', coalesce(sum(x.handed_over), 0),
      'closed', coalesce(sum(x.closed), 0)))
    into v_result
    from x;

  return v_result;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- team_daily_report_period — the director's period (TeamPeriod), both days inclusive, ≤ 92 days
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
  -- what the report rules brought in the period, a refunded dispute counted back
  pts as (
    select t.user_id, sum(t.amount + coalesce(f.amount, 0))::int as points
      from point_transactions t
      join daily_reports r on r.id = t.daily_report_id
      left join point_disputes d on d.transaction_id = t.id
      left join point_transactions f on f.id = d.refund_id
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
-- and with points on it costs daily_report_missed (D-152 §6). Each day is closed once
-- (settings.daily_report.checked_on); a replay of the tick writes nothing twice.
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
-- daily_report_reminders_due — «Сдайте отчёт за день» at remind_at to whoever owes today's
-- report, once a day a person; through the outbox and the delivery window
-- ---------------------------------------------------------------------------
create or replace function daily_report_reminders_due(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_local timestamp := p_now at time zone 'Asia/Aqtobe';
  v_today date := (p_now at time zone 'Asia/Aqtobe')::date;
  v_day   text := to_char((p_now at time zone 'Asia/Aqtobe')::date, 'YYYY-MM-DD');
  v_end   timestamptz := ((p_now at time zone 'Asia/Aqtobe')::date + 1)::timestamp at time zone 'Asia/Aqtobe';
  v_count int;
begin
  insert into notification_deliveries (company_id, user_id, event_kind, meta, deliver_after)
  select p.company_id, p.id, 'daily_report_remind',
         jsonb_build_object(
           'title', 'Сдайте отчёт за день',
           'body', 'Во сколько пришли и ушли, чем занимались — задачи дня уже в отчёте',
           'url', '/report',
           'tag', 'daily-report:' || v_day,
           'date', v_day),
         coalesce(next_delivery_slot(p.company_id, p_now), p_now)
    from companies c
    join profiles p
      on p.company_id = c.id and p.is_active and team_role(p.role) and p.availability = 'active'
     and p.created_at < v_end
   where daily_report_on(c.settings)
     and daily_report_workday(c.settings, v_today)
     and v_local::time >= daily_report_clock(c.settings, 'remind_at', '18:00')
     -- a reminder the delivery window would hold past the day it is about is not sent at all
     and coalesce(next_delivery_slot(c.id, p_now), p_now) < v_end
     and not exists (select 1 from daily_reports r where r.user_id = p.id and r.report_date = v_today)
     and not exists (
           select 1 from notification_deliveries d
            where d.user_id = p.id and d.event_kind = 'daily_report_remind'
              and d.meta ->> 'date' = v_day);
  get diagnostics v_count = row_count;
  return v_count;
end
$fn$;

-- ---------------------------------------------------------------------------
-- realtime: the director's «Отчёты» take a new report without a reload
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'daily_reports'
  ) then
    alter publication supabase_realtime add table daily_reports;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- grants
-- ---------------------------------------------------------------------------
revoke execute on function my_daily_report(date) from public, anon;
revoke execute on function submit_daily_report(timestamptz, timestamptz, text, uuid) from public, anon;
revoke execute on function my_daily_report_history(int) from public, anon;
revoke execute on function team_daily_report_day(date) from public, anon;
revoke execute on function team_daily_report_period(date, date) from public, anon;

grant execute on function my_daily_report(date) to authenticated, service_role;
grant execute on function submit_daily_report(timestamptz, timestamptz, text, uuid) to authenticated, service_role;
grant execute on function my_daily_report_history(int) to authenticated, service_role;
grant execute on function team_daily_report_day(date) to authenticated, service_role;
grant execute on function team_daily_report_period(date, date) to authenticated, service_role;

revoke execute on function daily_reports_due_missed(timestamptz) from public, anon, authenticated;
revoke execute on function daily_report_reminders_due(timestamptz) from public, anon, authenticated;
grant execute on function daily_reports_due_missed(timestamptz) to service_role;
grant execute on function daily_report_reminders_due(timestamptz) to service_role;

-- the inner pieces of the RPCs: not for a client to call with somebody else's id
revoke execute on function daily_report_tasks(uuid, uuid, date) from public, anon, authenticated;
revoke execute on function daily_report_json(daily_reports) from public, anon, authenticated;
grant execute on function daily_report_tasks(uuid, uuid, date) to service_role;
grant execute on function daily_report_json(daily_reports) to service_role;
