-- D-148: repeating orders come alive. Until now «каждый понедельник …» wrote a recurrence_rules row
-- with a model-made RRULE and nothing ever read it (IDEAS И-19). Now:
--   1. the rule is data — every / interval_n / weekdays / month_day / at_time — the same fields the
--      parser names and lib/recurrence/schedule.ts counts in TypeScript; this file holds the same
--      arithmetic in SQL (recurrence_falls_on / recurrence_in_phase / recurrence_next_on);
--   2. a BEFORE trigger keeps next_on / next_run_at / anchor_on: a new rule starts on the nearest
--      day whose task is still to be made, an edit or a resume recomputes from now, a pause clears;
--   3. recurrence_spawn(p_now) — a tick of /api/push/sweep: a due task rule makes an ordinary task
--      (status sent, or scheduled for the delivery window) with the deadline of that day; a due
--      meeting series makes its next meeting as the current one begins. tasks/events carry
--      (recurrence_rule_id, recurrence_on) under a unique index — one day, one thing, whatever runs twice;
--   4. confirm_voice_batch: the recurrence branch writes the fields; an event with `repeat` becomes
--      the first meeting of a series (target 'event');
--   5. the series' own meetings invite nobody: participants know the meeting, the reminder still comes.
-- confirm_voice_batch is the 20261014200000_voice_minus.sql version word for word except the
-- recurrence branch and the series tail of the event branch.

-- ---------------------------------------------------------------------------
-- 1. The rule as data
-- ---------------------------------------------------------------------------
alter table recurrence_rules
  add column target            text not null default 'task' check (target in ('task', 'event')),
  add column every             text not null default 'week' check (every in ('day', 'workday', 'week', 'month')),
  add column interval_n        int  not null default 1 check (interval_n between 1 and 12),
  add column weekdays          int[] not null default '{}' check (weekdays <@ array[1, 2, 3, 4, 5, 6, 7]),
  add column month_day         int  not null default 0 check (month_day between 0 and 31),
  add column at_time           time not null default '18:00',   -- a task: the deadline of its day; a meeting: its start
  add column duration_min      int check (duration_min between 1 and 1440), -- a meeting's length, when the first had an end
  add column location          text,
  add column remind_before_min int  not null default 30 check (remind_before_min between 0 and 1440),
  add column everyone          boolean not null default false,
  add column participant_ids   uuid[] not null default '{}',
  add column source_audio_path text,                             -- the phrase that set the rule: every task plays it
  add column source_transcript text,
  add column anchor_on         date,                             -- the first occurrence: «раз в две недели» counts from it
  add column next_on           date,                             -- the day the next run makes a task / a meeting for
  add column last_on           date,                             -- the day of the last one made
  add column stopped_reason    text,                             -- 'assignee_inactive': the tick stopped it, not the director
  add column created_at        timestamptz not null default now(),
  add column updated_at        timestamptz not null default now();

alter table recurrence_rules alter column rrule drop not null;
alter table recurrence_rules alter column assignee_id drop not null;
alter table recurrence_rules
  add constraint recurrence_rules_assignee_check check (target = 'event' or assignee_id is not null);

comment on column recurrence_rules.rrule is
  'legacy RFC 5545 text written before D-148; the rule is every / interval_n / weekdays / month_day / at_time';
comment on column recurrence_rules.next_run_at is
  'D-148: when recurrence_spawn makes the next thing — a task at the delivery window of its day, a meeting as the previous one begins';

-- a task or a meeting made by a rule knows its day: one per (rule, day), even if the tick runs twice
alter table tasks add column recurrence_on date;
alter table tasks drop constraint tasks_recurrence_rule_fk;
alter table tasks
  add constraint tasks_recurrence_rule_fk foreign key (recurrence_rule_id) references recurrence_rules on delete set null;
create unique index tasks_recurrence_once on tasks (recurrence_rule_id, recurrence_on) where recurrence_rule_id is not null;

alter table events
  add column recurrence_rule_id uuid references recurrence_rules on delete set null,
  add column recurrence_on      date;
create unique index events_recurrence_once on events (recurrence_rule_id, recurrence_on) where recurrence_rule_id is not null;

create index recurrence_rules_company_idx on recurrence_rules (company_id, created_at desc);

-- the list on «Задачи» follows the tick (next_on moves) without a reload
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'recurrence_rules'
  ) then
    alter publication supabase_realtime add table recurrence_rules;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. The arithmetic (lib/recurrence/schedule.ts, day for day)
-- ---------------------------------------------------------------------------
create or replace function recurrence_falls_on(r recurrence_rules, d date) returns boolean
language sql immutable set search_path = public
as $fn$
  select case r.every
    when 'day'     then true
    when 'workday' then extract(isodow from d) <= 5
    when 'week'    then extract(isodow from d)::int = any (r.weekdays)
    -- a month shorter than the day takes its last day: «в конце месяца» is 31
    when 'month'   then extract(day from d)::int =
                        least(r.month_day, extract(day from (date_trunc('month', d) + interval '1 month - 1 day'))::int)
    else false
  end
$fn$;

create or replace function recurrence_in_phase(r recurrence_rules, d date) returns boolean
language sql immutable set search_path = public
as $fn$
  select r.interval_n <= 1 or r.anchor_on is null or case r.every
    when 'day'  then (((d - r.anchor_on) % r.interval_n) + r.interval_n) % r.interval_n = 0
    -- weeks are counted between Mondays
    when 'week' then ((((d - (extract(isodow from d)::int - 1))
                        - (r.anchor_on - (extract(isodow from r.anchor_on)::int - 1))) / 7 % r.interval_n)
                      + r.interval_n) % r.interval_n = 0
    when 'month' then ((((extract(year from d)::int - extract(year from r.anchor_on)::int) * 12
                         + extract(month from d)::int - extract(month from r.anchor_on)::int) % r.interval_n)
                       + r.interval_n) % r.interval_n = 0
    else true
  end
$fn$;

-- the first day after p_after that the rule falls on, in step with its anchor; null if none
create or replace function recurrence_next_on(r recurrence_rules, p_after date) returns date
language plpgsql immutable set search_path = public
as $fn$
declare
  d date;
begin
  for i in 1..800 loop
    d := p_after + i;
    if recurrence_falls_on(r, d) and recurrence_in_phase(r, d) then
      return d;
    end if;
  end loop;
  return null;
end
$fn$;

-- when the task of day p_on is made: as that day's delivery window opens; a deadline no later than
-- the opening is made the morning before, or it would arrive already late
create or replace function recurrence_run_at(r recurrence_rules, p_on date) returns timestamptz
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_from time;
begin
  select coalesce(c.settings->'delivery_window'->>'from', '08:00')::time
    into v_from from companies c where c.id = r.company_id;
  v_from := coalesce(v_from, '08:00');
  return ((case when r.at_time <= v_from then p_on - 1 else p_on end) + v_from) at time zone 'Asia/Aqtobe';
end
$fn$;

revoke execute on function recurrence_falls_on(recurrence_rules, date) from public, anon, authenticated;
revoke execute on function recurrence_in_phase(recurrence_rules, date) from public, anon, authenticated;
revoke execute on function recurrence_next_on(recurrence_rules, date) from public, anon, authenticated;
revoke execute on function recurrence_run_at(recurrence_rules, date) from public, anon, authenticated;
grant execute on function recurrence_falls_on(recurrence_rules, date) to service_role;
grant execute on function recurrence_in_phase(recurrence_rules, date) to service_role;
grant execute on function recurrence_next_on(recurrence_rules, date) to service_role;
grant execute on function recurrence_run_at(recurrence_rules, date) to service_role;

-- ---------------------------------------------------------------------------
-- 3. The schedule keeps itself
-- ---------------------------------------------------------------------------
create or replace function recurrence_rules_schedule() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_now      timestamptz := now();
  v_today    date := (now() at time zone 'Asia/Aqtobe')::date;
  v_reanchor boolean;
  d          date;
begin
  new.updated_at := v_now;

  if tg_op = 'UPDATE' and auth.uid() is not null
     and coalesce(current_setting('pulse.recurrence_spawn', true), '') <> 'on' then
    -- a person edits the rule; who it belongs to and the bookkeeping are not theirs to write
    if new.company_id is distinct from old.company_id
       or new.author_id is distinct from old.author_id
       or new.target is distinct from old.target then
      raise exception 'forbidden_field_update' using errcode = 'P0001';
    end if;
    new.next_on     := old.next_on;
    new.next_run_at := old.next_run_at;
    new.anchor_on   := old.anchor_on;
    new.last_on     := old.last_on;
    new.stopped_reason := case when new.is_active then null else old.stopped_reason end;
  end if;

  -- a task only for somebody of this company (D-134: the rule must never reach across)
  if new.assignee_id is not null and not exists (
    select 1 from profiles p where p.id = new.assignee_id and p.company_id = new.company_id
  ) then
    raise exception 'assignee_required' using errcode = 'P0001';
  end if;

  -- the rule as code trusts it (normalizeRule)
  new.weekdays := coalesce((select array_agg(distinct x order by x) from unnest(new.weekdays) x where x between 1 and 7), '{}');
  if new.every = 'week' and cardinality(new.weekdays) = 0 then new.weekdays := '{1}'; end if;
  if new.every <> 'week' then new.weekdays := '{}'; end if;
  if new.every = 'month' and new.month_day = 0 then new.month_day := 1; end if;
  if new.every <> 'month' then new.month_day := 0; end if;
  if new.every = 'workday' then new.interval_n := 1; end if;

  if not new.is_active then
    new.next_on := null;                                  -- paused: nothing waits
    new.next_run_at := null;
    return new;
  end if;

  v_reanchor := tg_op = 'INSERT'
             or new.every <> old.every or new.interval_n <> old.interval_n
             or new.weekdays <> old.weekdays or new.month_day <> old.month_day;
  if tg_op = 'UPDATE' and old.is_active and not v_reanchor and new.at_time = old.at_time then
    return new;                                           -- nothing about the schedule changed
  end if;

  if new.target = 'event' then
    -- a series keeps its next meeting ahead: the day after the last one made (or from today)
    if new.anchor_on is null then new.anchor_on := v_today; end if;
    d := recurrence_next_on(new, greatest(coalesce(new.last_on, v_today - 1), v_today - 1));
    if d = v_today and (d + new.at_time) at time zone 'Asia/Aqtobe' <= v_now then
      d := recurrence_next_on(new, d);
    end if;
    new.next_on := d;
    -- the next meeting is made as the last one begins; nothing ahead — at the next tick
    new.next_run_at := case
      when d is null then null
      when new.last_on is not null and (new.last_on + new.at_time) at time zone 'Asia/Aqtobe' > v_now
        then (new.last_on + new.at_time) at time zone 'Asia/Aqtobe'
      else v_now
    end;
    return new;
  end if;

  -- a task rule: the nearest day whose task is still to be made; a new schedule starts its phase there
  d := null;
  for i in 0..800 loop
    if recurrence_falls_on(new, v_today + i)
       and (v_reanchor or recurrence_in_phase(new, v_today + i))
       and recurrence_run_at(new, v_today + i) > v_now then
      d := v_today + i;
      exit;
    end if;
  end loop;
  if v_reanchor then new.anchor_on := d; end if;
  new.next_on := d;
  new.next_run_at := case when d is null then null else recurrence_run_at(new, d) end;
  return new;
end
$fn$;

create trigger trg_recurrence_rules_schedule
  before insert or update on recurrence_rules
  for each row execute function recurrence_rules_schedule();

-- rows written before D-148 carry only an RRULE: read the simple ones, stop the rest
update recurrence_rules r
   set every = case
                 when r.rrule ~* 'BYDAY=' or r.rrule ~* 'FREQ=WEEKLY' then 'week'
                 when r.rrule ~* 'FREQ=MONTHLY' then 'month'
                 else 'day'
               end,
       interval_n = least(greatest(coalesce(substring(r.rrule from '(?i)INTERVAL=(\d+)')::int, 1), 1), 12),
       weekdays = coalesce((
         select array_agg(distinct case regexp_replace(upper(x), '[^A-Z]', '', 'g')
                                     when 'MO' then 1 when 'TU' then 2 when 'WE' then 3 when 'TH' then 4
                                     when 'FR' then 5 when 'SA' then 6 when 'SU' then 7 end)
           from regexp_split_to_table(substring(r.rrule from '(?i)BYDAY=([A-Z0-9,+-]+)'), ',') x
       ), '{}'),
       month_day = case
                     when substring(r.rrule from '(?i)BYMONTHDAY=(-?\d+)')::int < 0 then 31
                     else coalesce(least(substring(r.rrule from '(?i)BYMONTHDAY=(\d+)')::int, 31), 1)
                   end,
       at_time = case
                   when r.rrule ~* 'BYHOUR=\d+'
                   then make_time(least(substring(r.rrule from '(?i)BYHOUR=(\d+)')::int, 23),
                                  least(coalesce(substring(r.rrule from '(?i)BYMINUTE=(\d+)')::int, 0), 59), 0)
                   else '18:00'::time
                 end
 where r.rrule is not null;

update recurrence_rules set is_active = false
 where rrule is not null and rrule !~* 'FREQ=(DAILY|WEEKLY|MONTHLY)';

-- tasks made by a rule are the rule's: nobody but the director rewrites the link
create or replace function tasks_field_guard() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;                                            -- service role / cron
  end if;
  if auth_role() = 'director' or auth.uid() = old.author_id then
    return new;                                            -- may edit content
  end if;

  if new.company_id         is distinct from old.company_id
     or new.author_id       is distinct from old.author_id
     or new.assignee_id     is distinct from old.assignee_id
     or new.parent_task_id  is distinct from old.parent_task_id
     or new.group_id        is distinct from old.group_id
     or new.title           is distinct from old.title
     or new.body            is distinct from old.body
     or new.deadline        is distinct from old.deadline
     or new.priority        is distinct from old.priority
     or new.source          is distinct from old.source
     or new.source_audio_path  is distinct from old.source_audio_path
     or new.source_transcript  is distinct from old.source_transcript
     or new.scheduled_send_at  is distinct from old.scheduled_send_at
     or new.recurrence_rule_id is distinct from old.recurrence_rule_id
     or new.recurrence_on   is distinct from old.recurrence_on
     or new.passed_to       is distinct from old.passed_to
     or new.created_at      is distinct from old.created_at then
    raise exception 'forbidden_field_update' using errcode = 'P0001';
  end if;

  -- Stamps are the status guard's business: without a transition they are frozen.
  if new.status = old.status and (
       new.accepted_at   is distinct from old.accepted_at
    or new.completed_at  is distinct from old.completed_at
    or new.closed_at     is distinct from old.closed_at) then
    raise exception 'forbidden_field_update' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The tick
-- ---------------------------------------------------------------------------
create or replace function recurrence_spawn(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  r        recurrence_rules%rowtype;
  v_count  int := 0;
  v_at     timestamptz;                  -- the task's deadline / the meeting's start
  v_send   timestamptz;
  v_status task_status;
  v_id     uuid;
  v_next   date;
  v_made   boolean;
begin
  -- the series' own meetings invite nobody (notify_outbox_event_participant)
  perform set_config('pulse.recurrence_spawn', 'on', true);

  for r in
    select * from recurrence_rules
     where is_active and next_run_at is not null and next_run_at <= p_now and next_on is not null
     order by next_run_at
     limit 500
     for update skip locked
  loop
    v_at   := (r.next_on + r.at_time) at time zone 'Asia/Aqtobe';
    v_made := false;
    v_id   := null;

    if r.target = 'task' then
      if not exists (
        select 1 from profiles p where p.id = r.assignee_id and p.company_id = r.company_id and p.is_active
      ) then
        -- the person has left: the rule stops and says why on «Повторы»
        update recurrence_rules set is_active = false, stopped_reason = 'assignee_inactive' where id = r.id;
        continue;
      end if;

      -- a day a sleeping tick missed is not made late
      if v_at > p_now then
        v_send   := next_delivery_slot(r.company_id, p_now);
        v_status := case when v_send is null then 'sent'::task_status else 'scheduled'::task_status end;
        insert into tasks (
          company_id, author_id, assignee_id, title, body, deadline, priority, status,
          scheduled_send_at, source_audio_path, source_transcript, recurrence_rule_id, recurrence_on
        ) values (
          r.company_id, r.author_id, r.assignee_id, r.title, r.body, v_at, r.priority, v_status,
          v_send, r.source_audio_path, r.source_transcript, r.id, r.next_on
        )
        on conflict (recurrence_rule_id, recurrence_on) where recurrence_rule_id is not null do nothing
        returning id into v_id;
        v_made := true;
      end if;

      v_next := recurrence_next_on(r, r.next_on);
      update recurrence_rules
         set last_on     = case when v_made then r.next_on else last_on end,
             next_on     = v_next,
             next_run_at = case when v_next is null then null else recurrence_run_at(r, v_next) end
       where id = r.id;

    else
      if v_at > p_now then
        insert into events (
          company_id, author_id, title, body, location, starts_at, ends_at, remind_before_min,
          everyone, audio_path, source_transcript, recurrence_rule_id, recurrence_on
        ) values (
          r.company_id, r.author_id, r.title, r.body, r.location, v_at,
          case when r.duration_min is null then null else v_at + make_interval(mins => r.duration_min) end,
          r.remind_before_min, r.everyone, r.source_audio_path, r.source_transcript, r.id, r.next_on
        )
        on conflict (recurrence_rule_id, recurrence_on) where recurrence_rule_id is not null do nothing
        returning id into v_id;

        if v_id is not null then
          insert into event_participants (event_id, user_id, status, responded_at)
          values (v_id, r.author_id, 'going', p_now);
          -- «всем» is the company of this day, a list — those of it who still work here
          insert into event_participants (event_id, user_id)
          select v_id, p.id from profiles p
           where p.company_id = r.company_id and p.is_active and p.role <> 'tv' and p.id <> r.author_id
             and (r.everyone or p.id = any (r.participant_ids))
          on conflict do nothing;
        end if;
        v_made := true;
      end if;

      v_next := recurrence_next_on(r, r.next_on);
      update recurrence_rules
         set last_on     = case when v_made then r.next_on else last_on end,
             next_on     = v_next,
             -- the following meeting is made as this one begins; one missed — at the next tick
             next_run_at = case when v_next is null then null when v_made then v_at else p_now end
       where id = r.id;
    end if;

    if v_id is not null then
      v_count := v_count + 1;
    end if;
  end loop;

  perform set_config('pulse.recurrence_spawn', '', true);
  return v_count;
end
$fn$;

revoke execute on function recurrence_spawn(timestamptz) from public, anon, authenticated;
-- only the sweep calls the tick: no person has this button
grant execute on function recurrence_spawn(timestamptz) to service_role;

-- the invitation trigger of 20260918150000_calendar_events.sql, plus: a series' own meeting is
-- not an invitation — the people know the meeting, and its reminder still comes
create or replace function notify_outbox_event_participant() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_event events%rowtype;
begin
  if current_setting('pulse.recurrence_spawn', true) = 'on' then
    return null;
  end if;
  select * into v_event from events where id = new.event_id;
  -- себя не приглашают, отменённое мероприятие не зовёт никого
  if v_event.id is null or v_event.cancelled_at is not null or new.user_id = v_event.author_id then
    return null;
  end if;

  insert into notification_deliveries (company_id, user_id, event_kind, meta)
  values (v_event.company_id, new.user_id, 'event_invite',
          jsonb_build_object(
            'title', 'Приглашение',
            'body', left(v_event.title, 80) || ' · ' ||
                    to_char(v_event.starts_at at time zone 'Asia/Aqtobe', 'DD.MM HH24:MI'),
            'url', '/calendar?e=' || v_event.id));
  return null;
end
$fn$;

-- ---------------------------------------------------------------------------
-- 5. Confirm writes the rule as fields; a meeting with `repeat` starts a series
-- ---------------------------------------------------------------------------
create or replace function confirm_voice_batch(
  payload jsonb,
  client_request_id uuid,
  p_now timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid       uuid := client_request_id;   -- the parameter shadows a column name
  v_company    uuid;
  v_user       uuid := auth.uid();
  v_result     jsonb;
  v_window     jsonb;
  v_from       time;
  v_to         time;
  v_local      timestamp;                   -- p_now seen from Asia/Aqtobe
  v_quiet      boolean;
  v_force      boolean := coalesce((payload->>'force_now')::boolean, false);
  v_window_at  timestamptz;                 -- next start of the delivery window
  v_entity     jsonb;
  v_kind       text;
  v_groups     jsonb := '{}'::jsonb;               -- entity group key -> generated uuid
  v_gkey       text;
  v_group      uuid;
  v_assignee   uuid;
  v_status     task_status;
  v_send_at    timestamptz;
  v_id         uuid;
  v_task_ids   uuid[] := '{}'::uuid[];
  v_ann_ids    uuid[] := '{}'::uuid[];
  v_rem_ids    uuid[] := '{}'::uuid[];
  v_rec_ids    uuid[] := '{}'::uuid[];
  v_note_ids   uuid[] := '{}'::uuid[];
  v_event_ids  uuid[] := '{}'::uuid[];
  v_starts     timestamptz;                 -- when the meeting begins
  v_ends       timestamptz;
  v_pid        uuid;                        -- one participant of it
  v_point_ids  uuid[] := '{}'::uuid[];
  v_settings   jsonb;
  v_points_on  boolean;
  v_amount     int;
  v_skipped    jsonb := '[]'::jsonb;
  v_scheduled  boolean := false;
  v_inbox      uuid := nullif(payload->>'inbox_id', '')::uuid;
  v_note       uuid := nullif(payload->>'note_id', '')::uuid;   -- the note this batch came from
  v_every      text;                        -- a rule's step (D-148)
  v_repeat     text;                        -- a meeting's step (D-148)
  v_start_at   timestamp;                   -- the meeting's start on the Aqtobe clock
  v_rule       uuid;
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  v_company := auth_company_id();

  -- 1. idempotency: a duplicate returns the stored result and creates nothing
  insert into ingest_batches (company_id, user_id, client_request_id, result)
  values (v_company, v_user, v_crid, '{}'::jsonb)
  on conflict on constraint ingest_batches_company_request_key do nothing;

  if not found then
    select b.result into v_result
      from ingest_batches b
     where b.company_id = v_company and b.client_request_id = v_crid;
    return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('duplicate', true);
  end if;

  -- 2. quiet hours (D-38): outside the delivery window tasks wait for its start
  select c.settings into v_settings from companies c where c.id = v_company;
  v_window    := coalesce(v_settings->'delivery_window', '{"from":"08:00","to":"21:00"}'::jsonb);
  v_points_on := coalesce((v_settings->>'points_enabled')::boolean, false);

  v_from  := coalesce(v_window->>'from', '08:00')::time;
  v_to    := coalesce(v_window->>'to',   '21:00')::time;
  v_local := p_now at time zone 'Asia/Aqtobe';
  v_quiet := not (v_local::time >= v_from and v_local::time < v_to);

  if v_quiet then
    if v_local::time < v_from then
      v_window_at := (v_local::date + v_from) at time zone 'Asia/Aqtobe';
    else
      v_window_at := ((v_local::date + 1) + v_from) at time zone 'Asia/Aqtobe';
    end if;
  end if;

  -- 3. entities: only what the director confirmed on /confirm
  for v_entity in
    select value from jsonb_array_elements(coalesce(payload->'confirmed_entities', '[]'::jsonb))
  loop
    v_kind := v_entity->>'kind';

    if v_kind in ('task', 'delegation') then
      v_assignee := nullif(v_entity->>'assignee_id', '')::uuid;
      if v_assignee is null then
        raise exception 'assignee_required' using errcode = 'P0001';
      end if;

      -- one spoken phrase for several people = N copies sharing a group_id (D-02)
      v_group := null;
      v_gkey  := nullif(v_entity->>'group_id', '');
      if v_gkey is not null then
        if v_groups ? v_gkey then
          v_group := (v_groups->>v_gkey)::uuid;
        else
          v_group  := gen_random_uuid();
          v_groups := v_groups || jsonb_build_object(v_gkey, v_group::text);
        end if;
      end if;

      v_send_at := nullif(v_entity->>'scheduled_send_at', '')::timestamptz;
      if v_send_at is not null then
        v_status := 'scheduled';                       -- explicit "отправь утром"
      elsif v_quiet and not v_force then
        v_status  := 'scheduled';
        v_send_at := v_window_at;
      else
        v_status := 'sent';
      end if;
      v_scheduled := v_scheduled or v_status = 'scheduled';

      insert into tasks (
        company_id, author_id, assignee_id, group_id, title, body, deadline,
        priority, status, source, source_audio_path, source_transcript, scheduled_send_at
      ) values (
        v_company, v_user, v_assignee, v_group,
        v_entity->>'title',
        case when v_kind = 'delegation' then v_entity->>'note' else v_entity->>'body' end,
        nullif(v_entity->>'deadline_iso', '')::timestamptz,
        coalesce(nullif(v_entity->>'priority', '')::task_priority, 'normal'),
        v_status,
        nullif(payload->>'source', '')::ai_source,
        nullif(payload->>'audio_path', ''),
        nullif(payload->>'transcript', ''),
        v_send_at
      ) returning id into v_id;
      v_task_ids := v_task_ids || v_id;

    elsif v_kind = 'announcement' then
      insert into announcements (company_id, author_id, audio_path, transcript)
      values (v_company, v_user, nullif(payload->>'audio_path', ''), v_entity->>'text')
      returning id into v_id;
      v_ann_ids := v_ann_ids || v_id;

    elsif v_kind = 'reminder' then
      -- «напомни мне …» is a note with a time (D-95): the director sees it in «Заметки»,
      -- moves or drops it there, and notes_due_reminders sends it when the time comes
      insert into notes (company_id, user_id, text, raw_transcript, audio_path, inbox_item_id, remind_at)
      values (v_company, v_user, v_entity->>'text', payload->>'transcript',
              nullif(payload->>'audio_path', ''), v_inbox,
              nullif(v_entity->>'remind_at_iso', '')::timestamptz)
      returning id into v_id;
      v_rem_ids := v_rem_ids || v_id;

    elsif v_kind = 'event' then
      -- a meeting without a time is not a meeting: /confirm keeps such a card blocked
      v_starts := nullif(v_entity->>'starts_at_iso', '')::timestamptz;
      if v_starts is null then
        raise exception 'event_time_required' using errcode = 'P0001';
      end if;
      v_ends := nullif(v_entity->>'ends_at_iso', '')::timestamptz;
      insert into events (company_id, author_id, title, body, location, starts_at, ends_at,
                          remind_before_min, everyone, audio_path, source_transcript, inbox_item_id)
      values (v_company, v_user, v_entity->>'title', v_entity->>'body', v_entity->>'location',
              v_starts, v_ends,
              coalesce((v_entity->>'remind_before_min')::int, 30),
              coalesce((v_entity->>'everyone')::boolean, false),
              nullif(payload->>'audio_path', ''), nullif(payload->>'transcript', ''), v_inbox)
      returning id into v_id;
      v_event_ids := v_event_ids || v_id;
      -- the author is always in, and always going
      insert into event_participants (event_id, user_id, status, responded_at)
      values (v_id, v_user, 'going', p_now);
      if coalesce((v_entity->>'everyone')::boolean, false) then
        insert into event_participants (event_id, user_id)
        select v_id, p.id from profiles p
         where p.company_id = v_company and p.is_active and p.role <> 'tv' and p.id <> v_user
        on conflict do nothing;
      else
        for v_pid in
          select value::uuid from jsonb_array_elements_text(coalesce(v_entity->'participant_ids', '[]'::jsonb))
        loop
          -- somebody else's company or an inactive person is skipped silently (D-56: ids are the server's)
          insert into event_participants (event_id, user_id)
          select v_id, p.id from profiles p
           where p.id = v_pid and p.company_id = v_company and p.is_active and p.role <> 'tv' and p.id <> v_user
          on conflict do nothing;
        end loop;
      end if;

      -- a series (D-148): this meeting is its first; the next is made as this one begins
      v_repeat := coalesce(nullif(v_entity->>'repeat', ''), 'none');
      if v_repeat in ('day', 'workday', 'week', 'biweek', 'month') then
        v_start_at := v_starts at time zone 'Asia/Aqtobe';
        insert into recurrence_rules (
          company_id, author_id, assignee_id, target, title, body, every, interval_n, weekdays, month_day,
          at_time, duration_min, location, remind_before_min, everyone, participant_ids,
          source_audio_path, source_transcript, anchor_on, last_on, is_active
        ) values (
          v_company, v_user, null, 'event', v_entity->>'title', v_entity->>'body',
          case v_repeat when 'biweek' then 'week' else v_repeat end,
          case v_repeat when 'biweek' then 2 else 1 end,
          case when v_repeat in ('week', 'biweek') then array[extract(isodow from v_start_at)::int] else '{}'::int[] end,
          case when v_repeat = 'month' then extract(day from v_start_at)::int else 0 end,
          v_start_at::time,
          case when v_ends > v_starts
               then least(greatest(round(extract(epoch from (v_ends - v_starts)) / 60)::int, 1), 1440) end,
          v_entity->>'location',
          coalesce((v_entity->>'remind_before_min')::int, 30),
          coalesce((v_entity->>'everyone')::boolean, false),
          coalesce((select array_agg(p.id) from profiles p
                     where p.company_id = v_company
                       and p.id::text in (select jsonb_array_elements_text(coalesce(v_entity->'participant_ids', '[]'::jsonb)))),
                   '{}'::uuid[]),
          nullif(payload->>'audio_path', ''), nullif(payload->>'transcript', ''),
          v_start_at::date, v_start_at::date, true
        ) returning id into v_rule;
        update events set recurrence_rule_id = v_rule, recurrence_on = v_start_at::date where id = v_id;
        v_rec_ids := v_rec_ids || v_rule;
      end if;

    elsif v_kind = 'note' then
      -- a thought of the director: no assignee, no deadline, nobody else ever reads it
      insert into notes (company_id, user_id, text, raw_transcript, audio_path, inbox_item_id)
      values (v_company, v_user, v_entity->>'text', payload->>'transcript',
              nullif(payload->>'audio_path', ''), v_inbox)
      returning id into v_id;
      v_note_ids := v_note_ids || v_id;

    elsif v_kind = 'recurrence' then
      -- a repeating order (D-148): the fields the parser named; the trigger finds its first day
      v_assignee := nullif(v_entity->>'assignee_id', '')::uuid;
      if v_assignee is null then
        raise exception 'assignee_required' using errcode = 'P0001';
      end if;
      v_every := coalesce(nullif(v_entity->>'every', ''), 'week');
      if v_every not in ('day', 'workday', 'week', 'month') then
        v_every := 'week';
      end if;
      insert into recurrence_rules (
        company_id, author_id, assignee_id, target, title, body, priority, every, interval_n,
        weekdays, month_day, at_time, source_audio_path, source_transcript, is_active
      ) values (
        v_company, v_user, v_assignee, 'task', v_entity->>'title', null, 'normal', v_every,
        least(greatest(coalesce(round(nullif(v_entity->>'interval', '')::numeric)::int, 1), 1), 12),
        coalesce((select array_agg(round(x::numeric)::int)
                    from jsonb_array_elements_text(coalesce(v_entity->'weekdays', '[]'::jsonb)) x), '{}'::int[]),
        least(greatest(coalesce(round(nullif(v_entity->>'month_day', '')::numeric)::int, 0), 0), 31),
        coalesce(nullif(v_entity->>'due_time', '')::time, '18:00'::time),
        nullif(payload->>'audio_path', ''), nullif(payload->>'transcript', ''), true
      ) returning id into v_id;
      v_rec_ids := v_rec_ids || v_id;

    elsif v_kind = 'points' then
      -- off by default for the pilot (G.22); the director switches them on in settings (D-48)
      v_assignee := nullif(v_entity->>'assignee_id', '')::uuid;
      v_amount   := nullif(v_entity->>'amount', '')::int;
      if not v_points_on then
        v_skipped := v_skipped || jsonb_build_object('kind', v_kind, 'reason', 'points_disabled');
      elsif v_assignee is null then
        raise exception 'assignee_required' using errcode = 'P0001';
      elsif v_amount is null or v_amount = 0 then
        -- nothing to award or take
        v_skipped := v_skipped || jsonb_build_object('kind', v_kind, 'reason', 'points_blocked');
      else
        -- a minus the director said is a minus (D-137, revises D-30); the person may dispute it (D-133)
        insert into point_transactions (company_id, user_id, amount, reason, source, actor_id)
        values (v_company, v_assignee, v_amount,
                coalesce(nullif(trim(v_entity->>'reason'), ''), case when v_amount < 0 then 'снял директор' else 'от директора' end),
                'manual', v_user)
        returning id into v_id;
        v_point_ids := v_point_ids || v_id;
      end if;

    elsif v_kind = 'query' then
      -- a question is answered by /api/voice/query, nothing is persisted here
      v_skipped := v_skipped || jsonb_build_object('kind', v_kind, 'reason', 'query_not_persisted');

    else
      v_skipped := v_skipped || jsonb_build_object('kind', v_kind, 'reason', 'unknown_kind');
    end if;
  end loop;

  -- 4. the edit ratio metric lands on the parse row of the same batch (D-35)
  update ai_logs l
     set confirmed_entities = payload->'confirmed_entities',
         was_edited         = (payload->>'was_edited')::boolean,
         edit_fields        = case
                                when payload ? 'edit_fields'
                                then (select array_agg(x)
                                        from jsonb_array_elements_text(payload->'edit_fields') x)
                              end
   where l.company_id = v_company
     and l.client_request_id = v_crid
     and l.kind = 'parse';

  if v_inbox is not null then
    update inbox_items i set status = 'confirmed'
     where i.id = v_inbox and i.company_id = v_company;
  end if;

  -- the note this batch was started from becomes 'converted' (D-75 §5); somebody
  -- else's note and a deleted one are silently left alone
  if v_note is not null then
    update notes n
       set converted_task_id         = coalesce(v_task_ids[1], n.converted_task_id),
           converted_announcement_id = coalesce(v_ann_ids[1], n.converted_announcement_id),
           converted_at              = p_now
     where n.id = v_note and n.user_id = v_user and n.deleted_at is null;
  end if;

  v_result := jsonb_build_object(
    'task_ids',        to_jsonb(v_task_ids),
    'announcement_ids', to_jsonb(v_ann_ids),
    'reminder_ids',    to_jsonb(v_rem_ids),
    'recurrence_ids',  to_jsonb(v_rec_ids),
    'note_ids',        to_jsonb(v_note_ids),
    'event_ids',       to_jsonb(v_event_ids),
    'point_ids',       to_jsonb(v_point_ids),
    'skipped',         v_skipped,
    'scheduled',       v_scheduled
  );

  update ingest_batches b set result = v_result
   where b.company_id = v_company and b.client_request_id = v_crid;

  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;
