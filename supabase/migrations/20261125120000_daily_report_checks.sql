-- D-198: the director reads every report — «Просмотрено» by sight, «Проверено» by hand — and the
-- report asks no «Пришёл / Ушёл» any more.
--
-- 1. daily_reports.seen_at / seen_by — the first time a director had the whole report on screen;
--    checked_at / checked_by — «Проверено»; changed_after_check_at — the person changed the words
--    after a check (the check came off then, the report waits for the director again). Only a
--    submitted report carries them. A mark is not a change of the report: the updated_at trigger
--    leaves updated_at alone when only these move — the screens read updated_at as «изменён».
-- 2. The times are optional: a new client sends none (both null); a submit of an older build
--    waiting in an outbox still carries both and is kept as typed. Times are never shown (D-194).
-- 3. daily_report_json — the 20261118120000 body plus the review fields.
-- 4. submit_daily_report — the 20261103120000 body; the times may be null, the day is the tap's
--    (p_day, new and optional), else the arrival's (an older build), else today; an edit that
--    changes the words takes «Просмотрено» and «Проверено» off and says the check was undone.
--    A new argument list is a new function: dropped and created, granted anew.
-- 5. mark_daily_reports_seen — the director's screen saw these reports; set once.
-- 6. check_daily_reports — «Проверено» on / off, deduped by client_request_id (ingest_batches).
-- 7. team_daily_reports_feed — every report, days in a row, newest first, with the director's
--    filters (a person, words, «не проверены»); the day's counts are the «Табель»'s.
-- 8. my_daily_report_history — p_before for «Показать ещё» (a new argument list: drop + create).
-- 9. daily_report_reminders_due — the push asks what was done, not when the person came and left.
-- New functions start closed (20261124120000): each grant below is the function's own. Bodies
-- are copies of the definitions in force (supabase/SCHEMA.md) plus the change.

-- ---------------------------------------------------------------------------
-- 1. daily_reports: the review marks
-- ---------------------------------------------------------------------------
alter table daily_reports
  add column seen_at                timestamptz,
  add column seen_by                uuid references profiles,
  add column checked_at             timestamptz,
  add column checked_by             uuid references profiles,
  add column changed_after_check_at timestamptz,
  add constraint daily_reports_review_check
    check (status = 'submitted' or (seen_at is null and checked_at is null and changed_after_check_at is null));

comment on column daily_reports.seen_at is 'D-198: «Просмотрено» — the first time a director had the whole report on screen (mark_daily_reports_seen); null again once the person changes the words';
comment on column daily_reports.seen_by is 'D-198: the director whose screen saw it first';
comment on column daily_reports.checked_at is 'D-198: «Проверено» — check_daily_reports; a mark without points, taken off by a change of the words';
comment on column daily_reports.checked_by is 'D-198: the director who checked it';
comment on column daily_reports.changed_after_check_at is 'D-198: the person changed the words after a check — «изменён после проверки»; the next check clears it';

create index daily_reports_seen_by_idx on daily_reports (seen_by) where seen_by is not null;
create index daily_reports_checked_by_idx on daily_reports (checked_by) where checked_by is not null;

-- the marks move nothing else: updated_at stays the report's own (the screens' «изменён», the
-- Realtime patch in lib/daily-report/review.ts). Every other column moves it, a future one too.
drop trigger trg_daily_reports_updated_at on daily_reports;
create trigger trg_daily_reports_updated_at
  before update on daily_reports
  for each row
  when ((to_jsonb(old) - array['seen_at', 'seen_by', 'checked_at', 'checked_by', 'changed_after_check_at', 'updated_at'])
        is distinct from
        (to_jsonb(new) - array['seen_at', 'seen_by', 'checked_at', 'checked_by', 'changed_after_check_at', 'updated_at']))
  execute function moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- 2. the times are optional: both or neither; when both, leaving after arriving
--    (the 20261103120000 constraint otherwise)
-- ---------------------------------------------------------------------------
alter table daily_reports drop constraint daily_reports_check;
alter table daily_reports add constraint daily_reports_check check (
  status = 'missed' or (
    ((arrived_at is null and left_at is null)
      or (arrived_at is not null and left_at is not null and left_at > arrived_at))
    and submitted_at is not null and summary is not null and length(trim(summary)) <= 4000)
);

-- ---------------------------------------------------------------------------
-- 3. a report as the screens read it (DailyReport): the 20261118120000 body plus the review
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
                where t.daily_report_id = p_report.id),
    'excused_at', p_report.excused_at,
    'excused_reason', p_report.excused_reason,
    'seen_at', p_report.seen_at,
    'checked_at', p_report.checked_at,
    'checked_by', p_report.checked_by,
    'changed_after_check_at', p_report.changed_after_check_at)
$$;

-- the review fields alone (ReviewMark) — what the two marking RPCs answer with
create or replace function daily_report_review_json(p_report daily_reports) returns jsonb
language sql stable set search_path = public
as $$
  select jsonb_build_object(
    'id', p_report.id,
    'seen_at', p_report.seen_at,
    'checked_at', p_report.checked_at,
    'checked_by', p_report.checked_by,
    'changed_after_check_at', p_report.changed_after_check_at)
$$;

-- ---------------------------------------------------------------------------
-- 4. submit_daily_report — today's report, sent or edited; yesterday's, sent offline before
-- midnight, while the day is still open (SubmitDailyReportResult). Words are required only on a
-- day without tasks: the day's tasks are already the report (D-155 §7); empty words stay ''.
-- ---------------------------------------------------------------------------
drop function submit_daily_report(timestamptz, timestamptz, text, uuid);

create function submit_daily_report(
  p_arrived_at timestamptz default null,
  p_left_at timestamptz default null,
  p_summary text default null,
  client_request_id uuid default null,
  p_day date default null
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

  -- D-198: the times are both given (an older build) or both left out
  if (p_arrived_at is null) <> (p_left_at is null) then
    raise exception 'bad_times' using errcode = 'P0001';
  end if;
  -- the report's day: the local day of the arrival (an older build), else the tap's day, else
  -- today. Today, or yesterday for a report sent offline before midnight that arrives after it —
  -- only while yesterday has no row and the morning tick has not closed it
  v_day := coalesce((p_arrived_at at time zone 'Asia/Aqtobe')::date, p_day, v_today);
  if p_day is not null and v_day <> p_day then
    raise exception 'bad_times' using errcode = 'P0001';
  end if;
  if v_day <> v_today
     and not (v_day = v_today - 1
              and v_day > coalesce(daily_report_checked_on(v_settings), v_day - 1)
              and not exists (select 1 from daily_reports r where r.user_id = v_user and r.report_date = v_day)) then
    raise exception 'bad_times' using errcode = 'P0001';
  end if;
  -- both moments, when given, inside that day, leaving after arriving
  if p_arrived_at is not null then
    v_from := v_day::timestamp at time zone 'Asia/Aqtobe';
    v_to := (v_day + 1)::timestamp at time zone 'Asia/Aqtobe';
    if p_arrived_at < v_from or p_left_at >= v_to or p_left_at <= p_arrived_at then
      raise exception 'bad_times' using errcode = 'P0001';
    end if;
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

    -- a second submit the same day is an edit: the snapshot of the day's tasks is taken again.
    -- D-198: new words are a new report for the director — not seen, not checked; a checked one
    -- says the check came off. The same words (the tasks' snapshot alone) keep the marks.
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
           client_request_id = excluded.client_request_id,
           seen_at = case when r.summary is distinct from excluded.summary then null else r.seen_at end,
           seen_by = case when r.summary is distinct from excluded.summary then null else r.seen_by end,
           checked_at = case when r.summary is distinct from excluded.summary then null else r.checked_at end,
           checked_by = case when r.summary is distinct from excluded.summary then null else r.checked_by end,
           changed_after_check_at = case when r.summary is distinct from excluded.summary and r.checked_at is not null
                                         then now() else r.changed_after_check_at end
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

comment on function submit_daily_report(timestamptz, timestamptz, text, uuid, date) is 'D-152, D-198: the person hands in or edits today''s report; times optional (both or neither), p_day — the tap''s day for a submit replayed after midnight';

-- ---------------------------------------------------------------------------
-- 5. mark_daily_reports_seen — «Просмотрено»: the director's screen held these reports whole for
-- a while (lib/daily-report/review.ts). Set once; only the company's submitted reports.
-- ---------------------------------------------------------------------------
create or replace function mark_daily_reports_seen(p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_company uuid := auth_company_id();
  v_user    uuid := auth.uid();
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
    return jsonb_build_object('reports', '[]'::jsonb);
  end if;
  if cardinality(p_ids) > 200 then
    raise exception 'bad_ids' using errcode = 'P0001';
  end if;

  update daily_reports r
     set seen_at = now(), seen_by = v_user
   where r.id = any(p_ids) and r.company_id = v_company and r.status = 'submitted' and r.seen_at is null;

  return jsonb_build_object('reports', coalesce((
    select jsonb_agg(daily_report_review_json(r))
      from daily_reports r
     where r.id = any(p_ids) and r.company_id = v_company and r.status = 'submitted'
  ), '[]'::jsonb));
end;
$fn$;

comment on function mark_daily_reports_seen(uuid[]) is 'D-198: «Просмотрено» — the director''s screen saw these submitted reports; the first time only';

-- ---------------------------------------------------------------------------
-- 6. check_daily_reports — «Проверено» on / off for up to 200 reports (CheckDailyReportsResult);
-- a replay of the same client_request_id gets the first answer (принцип 7)
-- ---------------------------------------------------------------------------
create or replace function check_daily_reports(
  p_ids uuid[],
  p_on boolean,
  client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid    uuid := client_request_id;
  v_company uuid := auth_company_id();
  v_user    uuid := auth.uid();
  v_result  jsonb;
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_ids is null or cardinality(p_ids) < 1 or cardinality(p_ids) > 200 or p_on is null then
    raise exception 'bad_ids' using errcode = 'P0001';
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

  if p_on then
    -- a check is a look too; it clears «изменён после проверки»
    update daily_reports r
       set checked_at = now(), checked_by = v_user,
           seen_at = coalesce(r.seen_at, now()), seen_by = coalesce(r.seen_by, v_user),
           changed_after_check_at = null
     where r.id = any(p_ids) and r.company_id = v_company and r.status = 'submitted' and r.checked_at is null;
  else
    update daily_reports r
       set checked_at = null, checked_by = null
     where r.id = any(p_ids) and r.company_id = v_company and r.status = 'submitted' and r.checked_at is not null;
  end if;

  v_result := jsonb_build_object('reports', coalesce((
    select jsonb_agg(daily_report_review_json(r))
      from daily_reports r
     where r.id = any(p_ids) and r.company_id = v_company and r.status = 'submitted'
  ), '[]'::jsonb));
  if v_crid is not null then
    update ingest_batches b set result = v_result
     where b.company_id = v_company and b.client_request_id = v_crid;
  end if;
  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;

comment on function check_daily_reports(uuid[], boolean, uuid) is 'D-198: «Проверено» on / off — the director''s mark on the company''s submitted reports, no points, no push';

-- ---------------------------------------------------------------------------
-- 7. team_daily_reports_feed — the director's «Подряд» (ReportsFeedPage): the days of
-- [p_before − p_days, p_before), newest first. A day is listed when it is today or has reports or
-- missed people under the filters. The day's counts are the «Табель»'s (team_daily_report_period,
-- 20261124172000): the team now, the days a report was due, the excused apart — and they do not
-- depend on the filters. `due` = submitted + missed + excused + pending: away and off are not due.
-- ---------------------------------------------------------------------------
create or replace function team_daily_reports_feed(
  p_before    date default null,
  p_days      int default 7,
  p_user      uuid default null,
  p_query     text default null,
  p_unchecked boolean default false
) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_company   uuid := auth_company_id();
  v_settings  jsonb;
  v_today     date := (now() at time zone 'Asia/Aqtobe')::date;
  v_from      date;
  v_to        date;
  v_begin     date;
  v_on        boolean;
  v_checked   date;
  v_query     text := nullif(left(trim(coalesce(p_query, '')), 200), '');
  v_like      text;
  v_unchecked boolean := coalesce(p_unchecked, false);
  -- words or «не проверены»: the reports alone, nobody «без отчёта»
  v_narrow    boolean;
  v_more      date;
  v_days      jsonb;
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_days is null or p_days < 1 or p_days > 31 then
    raise exception 'bad_period' using errcode = 'P0001';
  end if;
  select c.settings into v_settings from companies c where c.id = v_company;
  v_begin := coalesce(daily_report_started_on(v_settings), v_today);
  v_on := daily_report_on(v_settings);
  v_checked := daily_report_checked_on(v_settings);
  -- nothing after today: by default the window ends with it
  v_to := least(coalesce(p_before, v_today + 1), v_today + 1) - 1;
  v_from := v_to + 1 - p_days;
  v_narrow := v_query is not null or v_unchecked;
  if v_query is not null then
    -- the words as typed, not as a pattern
    v_like := '%' || replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with people as (
    -- the team now: the day's counts and «без отчёта» are theirs (lib/people/team.ts)
    select p.id, p.full_name, p.avatar_url, p.availability, p.created_at
      from profiles p
     where p.company_id = v_company and p.is_active and team_role(p.role)
  ),
  days as (
    select g::date as day,
           daily_report_workday(v_settings, g::date) as workday,
           ((g::date + 1)::timestamp at time zone 'Asia/Aqtobe') as day_end
      from generate_series(v_from::timestamp, v_to::timestamp, interval '1 day') g
  ),
  reps as (
    select r.id, r.user_id, r.report_date, r.status, r.excused_at
      from daily_reports r
     where r.company_id = v_company and r.report_date between v_from and v_to
  ),
  -- every person on every day, as the period's grid (team_daily_report_period, branch for branch)
  grid as (
    select pe.id as user_id, pe.full_name, pe.avatar_url, dd.day, r.id as report_id,
           r.excused_at is not null as excused,
           case when r.status = 'submitted' then 'submitted'
                when r.status = 'missed' then 'missed'
                when not v_on or not dd.workday or dd.day < v_begin
                  or pe.created_at >= dd.day_end then 'off'
                when pe.availability <> 'active' then 'away'
                when dd.day <= v_checked then 'away'
                when dd.day < v_today then 'missed'
                else 'pending'
           end as state,
           (dd.workday and dd.day >= v_begin and dd.day <= v_today and pe.created_at < dd.day_end) as due
      from people pe
     cross join days dd
      left join reps r on r.user_id = pe.id and r.report_date = dd.day
  ),
  counts as (
    select g.day,
           (count(*) filter (where g.due and g.state = 'submitted'))::int as submitted,
           (count(*) filter (where g.due and g.state = 'missed' and not g.excused))::int as missed,
           (count(*) filter (where g.due and g.state = 'missed' and g.excused))::int as excused,
           (count(*) filter (where g.due and g.state = 'pending'))::int as pending
      from grid g
     group by g.day
  ),
  missed as (
    select g.day,
           jsonb_agg(jsonb_build_object(
             'user_id', g.user_id,
             'full_name', g.full_name,
             'avatar_url', g.avatar_url,
             'excused', g.excused,
             'report_id', g.report_id
           ) order by g.full_name, g.user_id) as people
      from grid g
     where not v_narrow and g.due and g.state = 'missed' and (p_user is null or g.user_id = p_user)
     group by g.day
  ),
  -- the reports under the filters, the latest hand-in first; whoever left keeps their reports
  hits as (
    select r.report_date as day,
           jsonb_agg(daily_report_json(r) || jsonb_build_object(
             'full_name', p.full_name,
             'position', p."position",
             'avatar_url', p.avatar_url,
             'gone', not (p.is_active and team_role(p.role))
           ) order by r.submitted_at desc, r.id) as reports
      from daily_reports r
      join profiles p on p.id = r.user_id
     where r.company_id = v_company and r.report_date between v_from and v_to
       and r.status = 'submitted'
       and (p_user is null or r.user_id = p_user)
       and (not v_unchecked or r.checked_at is null)
       and (v_like is null or r.summary ilike v_like
            or exists (select 1 from jsonb_array_elements(r.tasks) t where t ->> 'title' ilike v_like))
     group by r.report_date
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'date', dd.day,
           'today', dd.day = v_today,
           'workday', dd.workday,
           'due', coalesce(c.submitted + c.missed + c.excused + c.pending, 0),
           'submitted', coalesce(c.submitted, 0),
           'missed', coalesce(c.missed, 0),
           'excused', coalesce(c.excused, 0),
           'pending', coalesce(c.pending, 0),
           'reports', coalesce(f.reports, '[]'::jsonb),
           'missed_people', coalesce(m.people, '[]'::jsonb)
         ) order by dd.day desc), '[]'::jsonb)
    into v_days
    from days dd
    left join counts c on c.day = dd.day
    left join hits f on f.day = dd.day
    left join missed m on m.day = dd.day
   where dd.day = v_today or f.reports is not null or m.people is not null;

  -- the page before: from the latest earlier day with something to list, so a search does not
  -- walk empty months; null — nothing earlier (before the module started or the first report)
  if not v_narrow and v_on and v_from - 1 >= v_begin and v_from - 1 > coalesce(v_checked, v_from - 2) then
    -- the morning tick has not closed the day before the window: its missed people are worked
    -- out, not stored
    v_more := v_from - 1;
  else
    select max(r.report_date) into v_more
      from daily_reports r
      join profiles p on p.id = r.user_id
     where r.company_id = v_company and r.report_date < v_from
       and (p_user is null or r.user_id = p_user)
       and case when r.status = 'submitted'
                then (not v_unchecked or r.checked_at is null)
                     and (v_like is null or r.summary ilike v_like
                          or exists (select 1 from jsonb_array_elements(r.tasks) t where t ->> 'title' ilike v_like))
                else not v_narrow and p.is_active and team_role(p.role)
           end;
  end if;

  return jsonb_build_object(
    'days', v_days,
    'from', v_from,
    'next_before', case when v_more is not null then v_more + 1 end);
end;
$fn$;

comment on function team_daily_reports_feed(date, int, uuid, text, boolean) is 'D-198: the director''s feed of reports — days in a row, newest first, a person / words / «не проверены»; the day''s counts are the «Табель»''s';

-- ---------------------------------------------------------------------------
-- 8. my_daily_report_history — the person's reports, newest first, submitted and missed; days
-- strictly before p_before («Показать ещё»). The 20261028120000 body plus p_before.
-- ---------------------------------------------------------------------------
drop function my_daily_report_history(int);

create function my_daily_report_history(p_limit int default 30, p_before date default null) returns jsonb
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
                       and (p_before is null or x.report_date < p_before)
                     order by x.report_date desc
                     limit least(greatest(coalesce(p_limit, 30), 1), 366))
  ), '[]'::jsonb);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 9. daily_report_reminders_due — «Сдайте отчёт за день» at remind_at to whoever owes today's
-- report, once a day a person; through the outbox and the delivery window. The 20261028120000
-- body; the words as the director's «Напомнить» says them (20261118120000): no times asked.
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
           'body', 'Что сделали сегодня — одной строкой; задачи дня уже в отчёте',
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
-- grants: the RPCs of the screens to a signed-in caller (each body checks the role and the
-- company); the review shape is an inner piece
-- ---------------------------------------------------------------------------
revoke execute on function submit_daily_report(timestamptz, timestamptz, text, uuid, date) from public, anon;
revoke execute on function my_daily_report_history(int, date) from public, anon;
revoke execute on function mark_daily_reports_seen(uuid[]) from public, anon;
revoke execute on function check_daily_reports(uuid[], boolean, uuid) from public, anon;
revoke execute on function team_daily_reports_feed(date, int, uuid, text, boolean) from public, anon;

grant execute on function submit_daily_report(timestamptz, timestamptz, text, uuid, date) to authenticated, service_role;
grant execute on function my_daily_report_history(int, date) to authenticated, service_role;
grant execute on function mark_daily_reports_seen(uuid[]) to authenticated, service_role;
grant execute on function check_daily_reports(uuid[], boolean, uuid) to authenticated, service_role;
grant execute on function team_daily_reports_feed(date, int, uuid, text, boolean) to authenticated, service_role;

revoke execute on function daily_report_review_json(daily_reports) from public, anon, authenticated;
grant execute on function daily_report_review_json(daily_reports) to service_role;
