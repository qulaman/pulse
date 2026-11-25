-- D-191 (И-34): the employee's morning brief — one push when the company's delivery window opens:
-- «Доброе утро · 2 дела на сегодня, 1 просрочено · встреча в 15:00»; a tap opens Лента (/feed).
--
-- 1. employee_morning_briefs_due(p_now) — a tick of /api/push/sweep, right after recurrence_spawn
--    and publish_due_scheduled, so the tasks this very sweep gives out are counted. To whom: the
--    team (team_role: employee, manager, shopkeeper, secretary — never the director, never the
--    kiosk), active, not on leave or sick, of a company that has the brief on
--    (settings.morning_brief.enabled, on by default), on the company's working day
--    (daily_report_workday: settings.daily_report.workdays and holidays, Monday to Friday by
--    default), inside the company's delivery window (next_delivery_slot is null), and only to a
--    person with a switched-on device: without one the row could only fail as no_subscription,
--    and every such failure feeds the director's «Уведомления не доходят» — the brief is no reason
--    to wake that signal. Once a local day a person: the unique key below makes a second row
--    impossible even when two sweeps run in the same second (not the «not exists» alone that let
--    daily_report_remind twin).
--    What it counts — the person's own tasks: new (`sent`), returned (`rework`), overdue (open
--    with a deadline behind), in work with the deadline later today; a held task (`scheduled`)
--    is not theirs yet. Meetings: today's still ahead, not cancelled, not declined — how many and
--    the first one's time. Nothing of either — no push.
--    On the daily Hobby cron (vercel.json `0 3 * * *`, 08:xx Asia/Aqtobe) the brief goes at
--    08:00 with the window's default start; a window opening later gets none until the minute
--    tick (В-8) — the daily sweep comes before it.
-- 2. morning_brief_body() — the words, apart so a test reads every form: the most urgent first
--    (overdue, rework, new), «вы»-form, no names, no company.
-- 3. morning_brief_on(settings) — the switch, read like daily_report_on.
-- The kind `morning_brief` is a new text value of notification_deliveries.event_kind (no enum,
-- no check). The routing trigger leaves it as is for a non-director (not in the window list: the
-- tick queues it inside the window), delivery_category files it under `tasks` — read only on the
-- director's rows, and a director never gets one. No task_id: no task's receipts ever show it.

-- ---------------------------------------------------------------------------
-- the switch: settings.morning_brief.enabled, on unless false (lib/settings.ts holds the default)
-- ---------------------------------------------------------------------------
create or replace function morning_brief_on(p_settings jsonb) returns boolean
language sql immutable
as $fn$
  select coalesce(p_settings -> 'morning_brief' ->> 'enabled', 'true') <> 'false'
$fn$;

comment on function morning_brief_on(jsonb) is 'D-191: settings.morning_brief.enabled — the employee morning brief, on by default';

-- ---------------------------------------------------------------------------
-- the words: the tasks by urgency, then the meetings; null when there is nothing to say
-- ---------------------------------------------------------------------------
create or replace function morning_brief_body(
  p_late     int,
  p_rework   int,
  p_new      int,
  p_today    int,
  p_due      timestamptz,
  p_meetings int,
  p_first    timestamptz
) returns text
language sql stable
as $fn$
  select nullif(concat_ws(' · ',
           w.tasks,
           case when w.tasks is null then upper(left(w.meet, 1)) || substr(w.meet, 2) else w.meet end), '')
    from (
      select
        case
          when n.total = 0 then null
          -- one thing: say what it is
          when n.total = 1 then
            case when n.late = 1 then 'Просроченная задача'
                 when n.rework = 1 then 'Задача на доработке'
                 when n.fresh = 1 then 'Новая задача'
                 else 'Задача на сегодня' || coalesce(', срок в ' || to_char(p_due at time zone 'Asia/Aqtobe', 'HH24:MI'), '') end
          -- all of one kind: the kind and the number
          when n.late = n.total then ru_plural(n.total, 'просроченная задача', 'просроченные задачи', 'просроченных задач')
          when n.rework = n.total then ru_plural(n.total, 'задача', 'задачи', 'задач') || ' на доработке'
          when n.fresh = n.total then ru_plural(n.total, 'новая задача', 'новые задачи', 'новых задач')
          when n.today = n.total then ru_plural(n.total, 'задача', 'задачи', 'задач') || ' на сегодня'
                                      || coalesce(', первый срок в ' || to_char(p_due at time zone 'Asia/Aqtobe', 'HH24:MI'), '')
          -- a mix: the number of the day, then the urgent part first; «today» ones are the rest
          else ru_plural(n.total, 'дело', 'дела', 'дел') || ' на сегодня, ' || concat_ws(', ',
                 case when n.late > 0 then n.late || ' просрочено' end,
                 case when n.rework > 0 then n.rework || ' на доработке' end,
                 case when n.fresh > 0 then ru_plural(n.fresh, 'новое', 'новых', 'новых') end)
        end as tasks,
        case
          when n.meetings = 0 then null
          when n.meetings = 1 then 'встреча в ' || to_char(p_first at time zone 'Asia/Aqtobe', 'HH24:MI')
          else ru_plural(n.meetings, 'встреча', 'встречи', 'встреч') || ', первая в ' || to_char(p_first at time zone 'Asia/Aqtobe', 'HH24:MI')
        end as meet
        from (
          select greatest(coalesce(p_late, 0), 0) as late,
                 greatest(coalesce(p_rework, 0), 0) as rework,
                 greatest(coalesce(p_new, 0), 0) as fresh,
                 greatest(coalesce(p_today, 0), 0) as today,
                 greatest(coalesce(p_late, 0), 0) + greatest(coalesce(p_rework, 0), 0)
                   + greatest(coalesce(p_new, 0), 0) + greatest(coalesce(p_today, 0), 0) as total,
                 case when p_first is null then 0 else greatest(coalesce(p_meetings, 0), 0) end as meetings
        ) n
    ) w
$fn$;

comment on function morning_brief_body(int, int, int, int, timestamptz, int, timestamptz) is
  'D-191: the morning brief''s body — overdue, rework, new, today''s tasks and the meetings; null when empty';

-- ---------------------------------------------------------------------------
-- once a local day a person, whatever the race
-- ---------------------------------------------------------------------------
create unique index if not exists notification_deliveries_morning_brief_key
  on notification_deliveries (user_id, (meta ->> 'date'))
  where event_kind = 'morning_brief';

-- ---------------------------------------------------------------------------
-- employee_morning_briefs_due — the tick
-- ---------------------------------------------------------------------------
create or replace function employee_morning_briefs_due(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_local timestamp := p_now at time zone 'Asia/Aqtobe';
  v_today date := (p_now at time zone 'Asia/Aqtobe')::date;
  v_day   text := to_char((p_now at time zone 'Asia/Aqtobe')::date, 'YYYY-MM-DD');
  v_end   timestamptz := ((p_now at time zone 'Asia/Aqtobe')::date + 1)::timestamp at time zone 'Asia/Aqtobe';
  -- a window that opens late (or a first tick after an outage) still greets by the clock
  v_title text := case when v_local::time < time '12:00' then 'Доброе утро'
                       when v_local::time < time '18:00' then 'Добрый день'
                       else 'Добрый вечер' end;
  v_count int;
begin
  with people as (
    select p.id, p.company_id
      from companies c
      join profiles p
        on p.company_id = c.id and p.is_active and team_role(p.role) and p.availability = 'active'
     where morning_brief_on(c.settings)
       and daily_report_workday(c.settings, v_today)
       -- the company's window is open: not before its start, not after its end
       and next_delivery_slot(c.id, p_now) is null
       -- a phone to show it on (see the header)
       and exists (select 1 from push_subscriptions s where s.user_id = p.id and s.enabled)
       and not exists (
             select 1 from notification_deliveries d
              where d.user_id = p.id and d.event_kind = 'morning_brief' and d.meta ->> 'date' = v_day)
  ),
  -- each task in one bucket, the most urgent one it fits
  work as (
    select t.assignee_id as user_id,
           case when t.deadline is not null and t.deadline < p_now then 'late'
                when t.status = 'rework' then 'rework'
                when t.status = 'sent' then 'new'
                else 'today' end as bucket,
           t.deadline
      from people pe
      join tasks t on t.assignee_id = pe.id and t.company_id = pe.company_id
     where t.status in ('sent', 'rework')
        or (t.status in ('accepted', 'in_progress') and t.deadline is not null and t.deadline < v_end)
  ),
  counts as (
    select user_id,
           count(*) filter (where bucket = 'late')::int as late,
           count(*) filter (where bucket = 'rework')::int as rework,
           count(*) filter (where bucket = 'new')::int as fresh,
           count(*) filter (where bucket = 'today')::int as today,
           min(deadline) filter (where bucket = 'today') as due
      from work
     group by user_id
  ),
  meetings as (
    select ep.user_id, count(*)::int as n, min(e.starts_at) as first_at
      from people pe
      join event_participants ep on ep.user_id = pe.id and ep.status <> 'declined'
      join events e on e.id = ep.event_id and e.company_id = pe.company_id
     where e.cancelled_at is null
       and e.starts_at >= p_now
       and e.starts_at < v_end
     group by ep.user_id
  ),
  briefs as (
    select pe.id, pe.company_id,
           morning_brief_body(c.late, c.rework, c.fresh, c.today, c.due, m.n, m.first_at) as body
      from people pe
      left join counts c on c.user_id = pe.id
      left join meetings m on m.user_id = pe.id
  )
  insert into notification_deliveries (company_id, user_id, event_kind, meta, deliver_after)
  select b.company_id, b.id, 'morning_brief',
         jsonb_build_object(
           'title', v_title,
           'body', b.body,
           'url', '/feed',
           'tag', 'morning:' || v_day,
           'date', v_day),
         p_now
    from briefs b
   where b.body is not null
  on conflict (user_id, (meta ->> 'date')) where event_kind = 'morning_brief' do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end
$fn$;

comment on function employee_morning_briefs_due(timestamptz) is
  'D-191: the employee morning brief — one push a local working day in the company window; sweep tick after publish_due_scheduled';

-- ---------------------------------------------------------------------------
-- grants: only the sweep calls the tick; the words are its inner piece
-- ---------------------------------------------------------------------------
revoke execute on function employee_morning_briefs_due(timestamptz) from public, anon, authenticated;
revoke execute on function morning_brief_body(int, int, int, int, timestamptz, int, timestamptz) from public, anon, authenticated;
grant execute on function employee_morning_briefs_due(timestamptz) to service_role;
grant execute on function morning_brief_body(int, int, int, int, timestamptz, int, timestamptz) to service_role;
