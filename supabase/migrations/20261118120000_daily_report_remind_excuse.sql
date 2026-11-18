-- D-183: the director's «Отчёты» on the desk — «Напомнить», «Уважительная причина», one person's
-- reports, and the period counted on the days a report was due.
--
-- 1. daily_reports.excused_at / excused_by / excused_reason — the director excused a missed day.
--    The day stays `missed` (the history keeps it); the minus, if one was taken, comes back as ONE
--    appended row: +|net|, rule_code `daily_report_excused`, keyed by the report (the unique
--    (daily_report_id, rule_code) index), a quiet manual row of the director like a dispute
--    refund — never on Эфир or the wall (D-45): the triggers skip quiet rows, tv_rating's
--    «заработано» leaves it out like the other give-backs. The balance stays a sum (принцип 4).
-- 2. excuse_daily_report — the move above; an open dispute on the minus is answered first
--    (`disputed`), and an excused minus is not disputed afterwards (dispute_points says
--    already_refunded), so the minus never comes back twice.
-- 3. remind_daily_report — «Напомнить»: one `daily_report_remind` push a person a day, through
--    the outbox and the company's delivery window; the evening sweep (daily_report_reminders_due)
--    sees the same row by meta->>'date' and stays quiet. meta.by = 'director' tells it from the
--    sweep's own. A push the window would hold past the day it is about is not queued (`late`),
--    as the sweep does.
-- 4. team_daily_report_day — rows[].reminded (the day's last «Сдайте отчёт» and its receipt),
--    totals.excused; totals.missed without the excused.
-- 5. team_daily_report_period — submitted and missed count only the days a report was due (the
--    same rule as `workdays`): a report handed in on a day off no longer makes «6 из 5»; the
--    excused leave `missed` for their own `excused`.
-- 6. person_daily_reports — one person's reports for the director's «Дневник», with the dispute
--    on each minus.
-- Bodies are copies of the definitions in force (supabase/SCHEMA.md) plus the change; create or
-- replace keeps their grants.

-- ---------------------------------------------------------------------------
-- 1. daily_reports: the excuse
-- ---------------------------------------------------------------------------
alter table daily_reports
  add column excused_at     timestamptz,
  add column excused_by     uuid references profiles,
  add column excused_reason text,
  add constraint daily_reports_excused_reason_check
    check (excused_reason is null or (length(excused_reason) between 1 and 300 and length(trim(excused_reason)) > 0)),
  add constraint daily_reports_excused_check
    check (excused_at is null or (status = 'missed' and excused_reason is not null));

comment on column daily_reports.excused_at is 'D-183: the director excused this missed day (excuse_daily_report); the minus came back as a daily_report_excused row';
comment on column daily_reports.excused_reason is 'D-183: the director''s words for the excuse, 1..300 characters';

create index daily_reports_excused_by_idx on daily_reports (excused_by);

-- ---------------------------------------------------------------------------
-- a report as the screens read it (DailyReport): the 20261103120000 body plus the excuse
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
    'excused_reason', p_report.excused_reason)
$$;

-- ---------------------------------------------------------------------------
-- 2. excuse_daily_report — «Уважительная причина» on a missed day
-- ---------------------------------------------------------------------------
create or replace function excuse_daily_report(
  p_report uuid,
  p_reason text,
  client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid     uuid := client_request_id;
  v_company  uuid := auth_company_id();
  v_user     uuid := auth.uid();
  v_reason   text := left(trim(coalesce(p_reason, '')), 300);
  v_report   daily_reports%rowtype;
  v_net      int;
  v_returned int := 0;
  v_result   jsonb;
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_reason = '' then
    raise exception 'reason_required' using errcode = 'P0001';
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

  select * into v_report from daily_reports r
   where r.id = p_report and r.company_id = v_company
   for update;
  if v_report.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_report.status <> 'missed' then
    raise exception 'not_missed' using errcode = 'P0001';
  end if;
  if v_report.excused_at is not null then
    raise exception 'already_excused' using errcode = 'P0001';
  end if;
  -- the person disputes the minus: the director answers the dispute, not around it
  if exists (select 1 from point_disputes d
               join point_transactions t on t.id = d.transaction_id
              where t.daily_report_id = v_report.id and d.status = 'open') then
    raise exception 'disputed' using errcode = 'P0001';
  end if;

  -- what the report took, as daily_report_json counts it: a minus given back by «Оспорить» or
  -- by the soft start is net 0 already
  select coalesce(sum(t.amount + coalesce(f.amount, 0)), 0)::int into v_net
    from point_transactions t
    left join point_disputes d on d.transaction_id = t.id
    left join point_transactions f on f.id = d.refund_id and f.daily_report_id is null
   where t.daily_report_id = v_report.id;

  update daily_reports r
     set excused_at = now(), excused_by = v_user, excused_reason = v_reason
   where r.id = v_report.id
  returning * into v_report;

  if v_net < 0 then
    -- the minus stays in the ledger; one quiet row of the director gives it back (принцип 4, D-45)
    insert into point_transactions (company_id, user_id, amount, reason, source, rule_code,
                                    daily_report_id, actor_id, quiet)
    values (v_company, v_report.user_id, -v_net, 'Уважительная причина: ' || v_reason, 'manual',
            'daily_report_excused', v_report.id, v_user, true)
    on conflict (daily_report_id, rule_code) where daily_report_id is not null do nothing;
    if found then
      v_returned := -v_net;
    end if;
  end if;

  v_result := jsonb_build_object('report', daily_report_json(v_report), 'points_returned', v_returned);
  if v_crid is not null then
    update ingest_batches b set result = v_result
     where b.company_id = v_company and b.client_request_id = v_crid;
  end if;
  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;

comment on function excuse_daily_report(uuid, text, uuid) is 'D-183: the director excuses a missed day — the reason is kept, the minus comes back once (daily_report_excused)';

-- ---------------------------------------------------------------------------
-- dispute_points — the 20261103120000 body plus one refusal: a minus the director excused
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
  -- D-155 §1: a daily-report minus given back by daily_report_refund_early_fines is settled;
  -- D-183: so is one the director excused
  if v_tx.daily_report_id is not null and (
       exists (select 1 from point_transactions f
                where f.daily_report_id = v_tx.daily_report_id and f.rule_code = 'daily_report_missed_refund')
       or exists (select 1 from daily_reports r
                   where r.id = v_tx.daily_report_id and r.excused_at is not null)) then
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
-- 3. remind_daily_report — «Напомнить» the ones who owe today's report
-- ---------------------------------------------------------------------------
create or replace function remind_daily_report(
  p_user_ids uuid[],
  client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid      uuid := client_request_id;
  v_company   uuid := auth_company_id();
  v_user      uuid := auth.uid();
  v_now       timestamptz := now();
  v_today     date := (now() at time zone 'Asia/Aqtobe')::date;
  v_day       text := to_char((now() at time zone 'Asia/Aqtobe')::date, 'YYYY-MM-DD');
  v_end       timestamptz := ((now() at time zone 'Asia/Aqtobe')::date + 1)::timestamp at time zone 'Asia/Aqtobe';
  v_settings  jsonb;
  v_due       boolean;
  v_slot      timestamptz;
  v_id        uuid;
  v_found     uuid;
  v_active    boolean;
  v_team      boolean;
  v_away      boolean;
  v_reason    text;
  v_reminded  jsonb := '[]'::jsonb;
  v_skipped   jsonb := '[]'::jsonb;
  v_result    jsonb;
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_user_ids is null or cardinality(p_user_ids) not between 1 and 100 then
    raise exception 'bad_request' using errcode = 'P0001';
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

  select c.settings into v_settings from companies c where c.id = v_company;
  v_due := daily_report_on(v_settings) and daily_report_workday(v_settings, v_today);
  -- inside the window: now; before it: its start today; after it: tomorrow — too late for today
  v_slot := next_delivery_slot(v_company, v_now);

  for v_id in select distinct u from unnest(p_user_ids) u where u is not null order by u
  loop
    -- two taps at once (two tabs, «всем» and one) queue one push: one person-day at a time
    perform pg_advisory_xact_lock(hashtextextended('daily_report_remind:' || v_id::text || ':' || v_day, 0));

    v_found := null;
    select p.id, p.is_active, team_role(p.role), p.availability <> 'active'
      into v_found, v_active, v_team, v_away
      from profiles p
     where p.id = v_id and p.company_id = v_company;

    -- somebody of another company reads exactly as nobody: not_due
    v_reason := case
      when v_found is null or not v_active or not v_team or not v_due then 'not_due'
      when exists (select 1 from daily_reports r
                    where r.user_id = v_id and r.company_id = v_company and r.report_date = v_today) then 'submitted'
      when v_away then 'away'
      when exists (select 1 from notification_deliveries d
                    where d.user_id = v_id and d.event_kind = 'daily_report_remind'
                      and d.meta ->> 'date' = v_day) then 'already'
      when coalesce(v_slot, v_now) >= v_end then 'late'
    end;

    if v_reason is not null then
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('user_id', v_id, 'reason', v_reason));
      continue;
    end if;

    insert into notification_deliveries (company_id, user_id, event_kind, meta, deliver_after)
    values (v_company, v_id, 'daily_report_remind',
            jsonb_build_object(
              'title', 'Директор ждёт отчёт за день',
              'body', 'Что сделали сегодня — одной строкой; задачи дня уже в отчёте',
              'url', '/report',
              'tag', 'daily-report:' || v_day,
              'date', v_day,
              'by', 'director'),
            coalesce(v_slot, v_now));
    v_reminded := v_reminded || jsonb_build_array(v_id);
  end loop;

  v_result := jsonb_build_object(
    'reminded', v_reminded,
    'skipped', v_skipped,
    -- null: the pushes go now; else the window's start they wait for
    'deliver_after', case when jsonb_array_length(v_reminded) > 0 then v_slot end);
  if v_crid is not null then
    update ingest_batches b set result = v_result
     where b.company_id = v_company and b.client_request_id = v_crid;
  end if;
  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;

comment on function remind_daily_report(uuid[], uuid) is 'D-183: «Напомнить» — one daily_report_remind push a person a day (the evening sweep included), through the delivery window';

-- ---------------------------------------------------------------------------
-- 4. team_daily_report_day — the 20261028120000 body plus rows[].reminded and totals.excused
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
              'reminded', x.reminded
            ) order by array_position(array['submitted', 'pending', 'missed', 'away', 'off'], x.state), x.full_name),
            '[]'::jsonb),
    'totals', jsonb_build_object(
      'team', count(*),
      'submitted', count(*) filter (where x.state = 'submitted'),
      'missed', count(*) filter (where x.state = 'missed' and not x.excused),
      'excused', count(*) filter (where x.state = 'missed' and x.excused),
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
-- 5. team_daily_report_period — the 20261103120000 body; submitted and missed only on the days a
-- report was due (as `workdays`), the excused apart
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
        select g.day,
               (count(*) filter (where g.due and g.state = 'submitted'))::int as submitted,
               (count(*) filter (where g.due and g.state = 'missed' and not g.excused))::int as missed,
               (count(*) filter (where g.due and g.state = 'missed' and g.excused))::int as excused
          from grid g
         group by g.day
      ) gd on gd.day = dd.day
      left join (select k.handed_day as day, count(*)::int as n from tk k where k.handed_day is not null group by k.handed_day) hd
        on hd.day = dd.day
      left join (select k.closed_day as day, count(*)::int as n from tk k where k.closed_day is not null group by k.closed_day) cd
        on cd.day = dd.day
  ),
  team as (
    select (count(*) filter (where g.due and g.state = 'submitted'))::int as submitted,
           (count(*) filter (where g.due and g.state = 'missed' and not g.excused))::int as missed,
           (count(*) filter (where g.due and g.state = 'missed' and g.excused))::int as excused
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
               'excused', dl.excused,
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

-- ---------------------------------------------------------------------------
-- 6. person_daily_reports — one person's reports for the director's «Дневник», newest first
-- ---------------------------------------------------------------------------
create or replace function person_daily_reports(p_user_id uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_company uuid := auth_company_id();
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from + 1 > 92 then
    raise exception 'bad_period' using errcode = 'P0001';
  end if;

  -- somebody of another company has no reports here: an empty list, as for nobody
  return coalesce((
    select jsonb_agg(daily_report_json(r) || jsonb_build_object('dispute', (
             -- the person's «Оспорить» on this report's minus
             select jsonb_build_object('id', d.id, 'transaction_id', d.transaction_id, 'text', d.text,
                                       'created_at', d.created_at, 'resolved', d.status <> 'open')
               from point_disputes d
               join point_transactions t on t.id = d.transaction_id
              where t.daily_report_id = r.id and d.company_id = v_company
              order by d.created_at desc
              limit 1))
           order by r.report_date desc)
      from daily_reports r
     where r.company_id = v_company and r.user_id = p_user_id
       and r.report_date between p_from and p_to
  ), '[]'::jsonb);
end;
$fn$;

comment on function person_daily_reports(uuid, date, date) is 'D-183: one person''s reports for the director, ≤ 92 days, newest first, each with the dispute on its minus';

-- ---------------------------------------------------------------------------
-- tv_rating — the 20261103120000 body word for word, except: an excused minus given back is not
-- «заработано» on the wall either (D-45)
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
                    -- D-155 §1: a minus given back is no earning, like a refund by «Оспорить»;
                    -- D-183: nor one the director excused
                    and t.rule_code is distinct from 'refund'
                    and t.rule_code is distinct from 'daily_report_missed_refund'
                    and t.rule_code is distinct from 'daily_report_excused'),
      'people', (select count(*) from ranked r where r.pts > 0)
    )
  ) into v_result;

  return v_result;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 6b. daily_report_refund_early_fines — the 20261103120000 body plus one skip: a minus the director
-- already gave back with «Уважительная причина» (D-183) is not paid back a second time on a re-run
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
       and r.excused_at is null
       and not exists (select 1 from point_transactions e
                        where e.daily_report_id = t.daily_report_id and e.rule_code = 'daily_report_excused')
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

comment on function daily_report_refund_early_fines() is 'D-155 §1: gives back the daily-report minuses taken before the person''s first report; a replay adds nothing; an excused minus (D-183) is skipped';

revoke execute on function daily_report_refund_early_fines() from public, anon, authenticated;
grant execute on function daily_report_refund_early_fines() to service_role;

-- ---------------------------------------------------------------------------
-- 7. grants: the three new RPCs for a signed-in caller (each checks the director itself)
-- ---------------------------------------------------------------------------
revoke execute on function excuse_daily_report(uuid, text, uuid) from public, anon;
revoke execute on function remind_daily_report(uuid[], uuid) from public, anon;
revoke execute on function person_daily_reports(uuid, date, date) from public, anon;

grant execute on function excuse_daily_report(uuid, text, uuid) to authenticated, service_role;
grant execute on function remind_daily_report(uuid[], uuid) to authenticated, service_role;
grant execute on function person_daily_reports(uuid, date, date) to authenticated, service_role;
