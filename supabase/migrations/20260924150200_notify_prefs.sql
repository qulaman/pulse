-- D-114, stage 3: the director tunes his own pushes; nobody else has a switch.
--
-- Employees, the secretary and the shopkeeper live by one fixed policy — the company delivery
-- window for what can wait, everything else at once (the kinds below). The director gets his
-- own layer on top of the same rows, stored per person in `notification_prefs` — not in
-- company.settings: those are the company's and the secretary edits them too (D-104).
--
-- Every row gets a `category` (what the director's screen calls it) when it is queued, and
-- the BEFORE INSERT trigger routes a director's row:
--   off     -> never sent: `failed` with `last_error = 'muted'` (the way no_subscription is kept)
--   quiet   -> sent without sound (`silent`; iPhone ignores it — Safari's limit)
--   digest  -> `mode = 'digest'`, folded into one «Сводка» push by director_digests_due()
--   now     -> as before
-- On top: «Не беспокоить» hours hold everything that does not pass and tell it at the end in
-- one «Пока вы отдыхали»; a calendar meeting holds all but the urgent when he asked for it;
-- «важные люди» (by the task's assignee) always come at once; «текст на блокировке» hides the
-- words (`private`, the worker sends only the kind of news). The alarm («Охрана») and the
-- product's own pushes (digest, test) are never touched; his own «напомни мне» always comes.
--
-- Defaults are today's behaviour: every category «сразу», no quiet hours, no meetings rule.
-- The two new signals (D-114) are on: «не открыл задачу» after 30 minutes, overdue in a digest.
-- The defaults live twice — here (notify_prefs_defaults) and in lib/push/prefs.ts — keep both.
--
-- set_notify_prefs() re-queues the director's waiting rows through the same trigger, so a
-- change applies to what is already in the queue, not only to what comes next.

-- ---------------------------------------------------------------------------
-- 1. Where a row stands in the director's rules
-- ---------------------------------------------------------------------------
alter table notification_deliveries
  add column if not exists category  text,
  add column if not exists mode      text not null default 'now',
  add column if not exists held      text,
  add column if not exists silent    boolean not null default false,
  add column if not exists private   boolean not null default false,
  add column if not exists digest_id uuid references notification_deliveries (id) on delete set null;

alter table notification_deliveries drop constraint if exists notification_deliveries_mode_check;
alter table notification_deliveries add constraint notification_deliveries_mode_check
  check (mode in ('now', 'digest'));
alter table notification_deliveries drop constraint if exists notification_deliveries_held_check;
alter table notification_deliveries add constraint notification_deliveries_held_check
  check (held is null or held in ('quiet', 'meeting', 'schedule'));

create index if not exists notification_deliveries_digest_idx
  on notification_deliveries (user_id, deliver_after)
  where status = 'queued' and mode = 'digest';

-- ---------------------------------------------------------------------------
-- 2. The director's rules: one row per director, read by him only, written by the RPC
-- ---------------------------------------------------------------------------
create table if not exists notification_prefs (
  user_id    uuid primary key references profiles on delete cascade,
  company_id uuid not null references companies,
  prefs      jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table notification_prefs enable row level security;

-- an employee has no row and cannot have one: there is no insert/update policy at all, and
-- the RPC refuses anybody but a director
drop policy if exists notification_prefs_select on notification_prefs;
create policy notification_prefs_select on notification_prefs for select using (
  user_id = auth.uid() and company_id = auth_company_id() and auth_role() = 'director'
);

create or replace function notify_prefs_defaults() returns jsonb
language sql immutable
as $fn$
  select '{
    "modes": {"review": "now", "declined": "now", "questions": "now", "messages": "now",
              "unseen": "now", "overdue": "digest", "secretary": "now", "calendar": "now", "shop": "now"},
    "unseen_after_min": 30,
    "digest_every": "hour",
    "day_summary_at": null,
    "quiet": {"on": false, "from": "21:00", "to": "08:00", "weekends": false},
    "pass": {"reminders": true, "visitors": true, "vip": false},
    "meetings": false,
    "vip": [],
    "lock_text": "full"
  }'::jsonb;
$fn$;

/** The director's rules with the defaults filled in; nested objects merge key by key. */
create or replace function notify_prefs_of(p_user uuid) returns jsonb
language sql stable security definer set search_path = public
as $fn$
  with d as (select notify_prefs_defaults() as j),
       p as (select coalesce((select prefs from notification_prefs where user_id = p_user), '{}'::jsonb) as j)
  select d.j || p.j || jsonb_build_object(
           'modes', (d.j -> 'modes') || case when jsonb_typeof(p.j -> 'modes') = 'object' then p.j -> 'modes' else '{}'::jsonb end,
           'quiet', (d.j -> 'quiet') || case when jsonb_typeof(p.j -> 'quiet') = 'object' then p.j -> 'quiet' else '{}'::jsonb end,
           'pass',  (d.j -> 'pass')  || case when jsonb_typeof(p.j -> 'pass')  = 'object' then p.j -> 'pass'  else '{}'::jsonb end,
           'vip',   case when jsonb_typeof(p.j -> 'vip') = 'array' then p.j -> 'vip' else '[]'::jsonb end)
    from d, p;
$fn$;

/** «21:00» -> 21:00; anything else -> the default (a bad string must never break a trigger). */
create or replace function notify_hhmm(p_value text, p_default time) returns time
language sql immutable
as $fn$
  select case when p_value ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then p_value::time else p_default end;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. The category of a row: what the director's screen calls this kind of news
-- ---------------------------------------------------------------------------
create or replace function delivery_category(p_kind text, p_meta jsonb) returns text
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_errand text := p_meta ->> 'errand_id';
begin
  if p_kind = 'pending_review' then return 'review'; end if;
  if p_kind = 'declined' then return 'declined'; end if;
  if p_kind = 'question' or (p_kind = 'message' and p_meta ->> 'is_question' = 'true') then return 'questions'; end if;
  if p_kind in ('message', 'reply') then return 'messages'; end if;
  if p_kind = 'task_unseen' then return 'unseen'; end if;
  if p_kind = 'task_overdue' then return 'overdue'; end if;
  if p_kind like 'errand\_%' then
    -- the alarm and its receipts («Охрана на месте») are never tuned away
    if p_meta ->> 'urgent' = 'true'
       or (v_errand ~ '^[0-9a-f-]{36}$' and exists (select 1 from errands e where e.id = v_errand::uuid and e.urgent)) then
      return 'alarm';
    end if;
    return 'secretary';
  end if;
  if p_kind like 'visit\_%' then return 'secretary'; end if;
  if p_kind like 'event\_%' then return 'calendar'; end if;
  if p_kind like 'shop\_%' then return 'shop'; end if;
  if p_kind = 'note_reminder' then return 'reminders'; end if;
  if p_kind in ('digest', 'day_summary', 'test') then return 'system'; end if;
  -- task_sent / rework / done / revoked / deadline_extended / announcement
  return 'tasks';
end
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Time helpers on the Aqtobe clock
-- ---------------------------------------------------------------------------
/** When «Не беспокоить» ends, if it is on at p_at; null when the director may be pushed. */
create or replace function director_quiet_until(p_prefs jsonb, p_at timestamptz) returns timestamptz
language plpgsql stable
as $fn$
declare
  q         jsonb := p_prefs -> 'quiet';
  v_from    time;
  v_to      time;
  v_local   timestamp := p_at at time zone 'Asia/Aqtobe';
  v_t       time;
  v_weekend boolean;
  v_quiet   boolean;
  v_end     timestamp;
begin
  if q is null or q ->> 'on' is distinct from 'true' then
    return null;
  end if;
  v_from := notify_hhmm(q ->> 'from', '21:00');
  v_to := notify_hhmm(q ->> 'to', '08:00');
  v_t := v_local::time;
  v_weekend := q ->> 'weekends' = 'true';

  if v_from = v_to then
    v_quiet := false;
  elsif v_from < v_to then
    v_quiet := v_t >= v_from and v_t < v_to;
  else
    v_quiet := v_t >= v_from or v_t < v_to;
  end if;
  if v_weekend and extract(isodow from v_local) in (6, 7) then
    v_quiet := true;
  end if;
  if not v_quiet then
    return null;
  end if;

  -- the next «to» after now that is not on a weekend day (when weekends are quiet)
  v_end := date_trunc('day', v_local) + v_to;
  if v_end <= v_local then
    v_end := v_end + interval '1 day';
  end if;
  if v_weekend then
    while extract(isodow from v_end) in (6, 7) loop
      v_end := v_end + interval '1 day';
    end loop;
  end if;
  return v_end at time zone 'Asia/Aqtobe';
end
$fn$;

/** The end of the calendar meeting the director is in at p_at (no end = one hour); null — none. */
create or replace function director_meeting_until(p_user uuid, p_at timestamptz) returns timestamptz
language sql stable security definer set search_path = public
as $fn$
  select max(coalesce(e.ends_at, e.starts_at + interval '1 hour'))
    from events e
    join event_participants ep on ep.event_id = e.id and ep.user_id = p_user
   where e.cancelled_at is null
     and ep.status <> 'declined'
     and e.starts_at <= p_at
     and coalesce(e.ends_at, e.starts_at + interval '1 hour') > p_at;
$fn$;

/** The next «Сводка» after p_at: every 30 minutes, every hour, or at 12:00 and 17:00. */
create or replace function director_digest_slot(p_prefs jsonb, p_at timestamptz) returns timestamptz
language plpgsql stable
as $fn$
declare
  v_every text := coalesce(p_prefs ->> 'digest_every', 'hour');
  v_local timestamp := p_at at time zone 'Asia/Aqtobe';
  v_slot  timestamp;
  v_quiet timestamptz;
begin
  if v_every = '30min' then
    v_slot := date_trunc('hour', v_local)
              + case when extract(minute from v_local) < 30 then interval '30 minutes' else interval '60 minutes' end;
  elsif v_every = 'twice' then
    v_slot := date_trunc('day', v_local) + time '12:00';
    if v_slot <= v_local then v_slot := date_trunc('day', v_local) + time '17:00'; end if;
    if v_slot <= v_local then v_slot := date_trunc('day', v_local) + interval '1 day' + time '12:00'; end if;
  else
    v_slot := date_trunc('hour', v_local) + interval '1 hour';
  end if;
  -- a slot inside «Не беспокоить» moves to its end: one «Пока вы отдыхали», not a night digest
  v_quiet := director_quiet_until(p_prefs, v_slot at time zone 'Asia/Aqtobe');
  return coalesce(v_quiet, v_slot at time zone 'Asia/Aqtobe');
end
$fn$;

-- ---------------------------------------------------------------------------
-- 5. The routing trigger (same trigger, same name as since 20260911230000; the employee
--    branch is the body of 20260918150000_calendar_events.sql plus shop_order)
-- ---------------------------------------------------------------------------
create or replace function notification_deliveries_deliver_after() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_role    text;
  v_prefs   jsonb;
  v_mode    text := 'now';
  v_vip     boolean := false;
  v_until   timestamptz;
  v_now     timestamptz := now();
  -- computed first, applied at the end: a broken rule leaves the row as it was
  r_mode    text := 'now';
  r_held    text;
  r_after   timestamptz;
  r_silent  boolean := false;
  r_private boolean := false;
  r_muted   boolean := false;
begin
  new.category := delivery_category(new.event_kind, new.meta);
  select p.role::text into v_role from profiles p where p.id = new.user_id;

  if v_role is distinct from 'director' then
    -- the fixed policy (D-114): what reaches an employee, a secretary or a shopkeeper and can
    -- wait, waits for the company window; a task whose moment the producer already decided
    -- (batch / «отправить сейчас» / scheduled reassign), a reminder, a request to the
    -- secretary do not
    if new.event_kind in ('reply', 'rework', 'done', 'revoked', 'deadline_extended', 'announcement',
                          'shop_order', 'shop_approved', 'shop_ready', 'shop_cancelled',
                          'event_invite', 'event_moved', 'event_cancelled') then
      new.deliver_after := greatest(new.deliver_after, coalesce(next_delivery_slot(new.company_id, v_now), v_now));
    end if;
    -- a message to somebody who is not the task's author is a message to an employee
    if new.event_kind = 'message' and exists (
         select 1 from tasks t where t.id = new.task_id and t.author_id <> new.user_id
       ) then
      new.deliver_after := greatest(new.deliver_after, coalesce(next_delivery_slot(new.company_id, v_now), v_now));
    end if;
    return new;
  end if;

  -- the director: the alarm and the product's own pushes are never tuned away
  if new.category in ('alarm', 'system') then
    return new;
  end if;

  begin
    v_prefs := notify_prefs_of(new.user_id);
    if new.category not in ('reminders', 'tasks') then
      v_mode := coalesce(v_prefs -> 'modes' ->> new.category, 'now');
      if v_mode not in ('now', 'quiet', 'digest', 'off') then
        v_mode := 'now';
      end if;
    end if;

    if v_mode = 'off' then
      r_muted := true;
    else
      if new.task_id is not null then
        select exists (
          select 1 from tasks t
           where t.id = new.task_id and t.assignee_id is not null
             and (v_prefs -> 'vip') ? t.assignee_id::text
        ) into v_vip;
      end if;
      -- an important person's news is never quiet and never waits for the digest
      if v_vip and v_mode in ('quiet', 'digest') then
        v_mode := 'now';
      end if;
      r_silent := v_mode = 'quiet';
      r_private := v_prefs ->> 'lock_text' = 'short';

      v_until := director_quiet_until(v_prefs, v_now);
      if v_until is not null and not (
           (new.category = 'reminders' and coalesce(v_prefs -> 'pass' ->> 'reminders', 'true') = 'true')
        or (new.event_kind = 'visit_arrived' and coalesce(v_prefs -> 'pass' ->> 'visitors', 'true') = 'true')
        or (v_vip and v_prefs -> 'pass' ->> 'vip' = 'true')
      ) then
        r_mode := 'digest';
        r_held := 'quiet';
        r_after := v_until;
      elsif v_prefs ->> 'meetings' = 'true'
            and not (new.category = 'reminders' or new.event_kind in ('event_reminder', 'visit_arrived') or v_vip)
            and director_meeting_until(new.user_id, v_now) is not null then
        r_mode := 'digest';
        r_held := 'meeting';
        r_after := director_meeting_until(new.user_id, v_now);
      elsif v_mode = 'digest' then
        r_mode := 'digest';
        r_held := 'schedule';
        r_after := director_digest_slot(v_prefs, v_now);
      end if;
    end if;
  exception when others then
    -- never let a rule break the producer's transaction: the row goes as before
    r_mode := 'now'; r_held := null; r_after := null; r_silent := false; r_private := false; r_muted := false;
  end;

  if r_muted then
    new.status := 'failed';
    new.attempts := 3;
    new.last_error := 'muted';
    return new;
  end if;
  new.mode := r_mode;
  new.held := r_held;
  new.silent := r_silent;
  new.private := r_private;
  if r_after is not null then
    new.deliver_after := greatest(new.deliver_after, r_after);
  end if;
  return new;
end
$fn$;

-- ---------------------------------------------------------------------------
-- 6. The worker claims only what goes now; digest rows wait for their tick
-- ---------------------------------------------------------------------------
create or replace function claim_deliveries(p_limit int default 50) returns setof notification_deliveries
language sql security definer set search_path = public
as $fn$
  update notification_deliveries d
     set claimed_at = now()
   where d.id in (
           select q.id from notification_deliveries q
            where q.status = 'queued'
              and q.channel = 'push'
              and q.mode = 'now'
              and q.attempts < 3
              and q.deliver_after <= now()
              and (q.claimed_at is null or q.claimed_at < now() - interval '2 minutes')
            order by q.created_at
            limit greatest(1, least(p_limit, 500))
            for update skip locked
         )
  returning d.*;
$fn$;

-- ---------------------------------------------------------------------------
-- 7. Saving the rules: the director only; the waiting queue obeys at once
-- ---------------------------------------------------------------------------
create or replace function set_notify_prefs(p_prefs jsonb) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_user    uuid := auth.uid();
  v_company uuid := auth_company_id();
begin
  -- a whole object each time: saving the same rules twice is the same state (принцип 7)
  if v_user is null or auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_prefs) is distinct from 'object' or length(p_prefs::text) > 8000 then
    raise exception 'bad_prefs' using errcode = 'P0001';
  end if;

  insert into notification_prefs (user_id, company_id, prefs, updated_at)
  values (v_user, v_company, p_prefs, now())
  on conflict (user_id) do update set prefs = excluded.prefs, updated_at = now();

  -- what still waits is routed again by the trigger: a digest-held word goes now if its
  -- category went back to «сразу», a quiet night that was switched off lets the morning in
  with gone as (
    delete from notification_deliveries
     where user_id = v_user and status = 'queued' and claimed_at is null
    returning company_id, user_id, task_id, event_kind, channel, tier, attempts, meta, created_at, seen_at
  )
  insert into notification_deliveries (company_id, user_id, task_id, event_kind, channel, tier, attempts, meta, created_at, seen_at)
  select company_id, user_id, task_id, event_kind, channel, tier, attempts, meta, created_at, seen_at from gone;

  return notify_prefs_of(v_user);
end
$fn$;

revoke execute on function notify_prefs_of(uuid) from public, anon, authenticated;
revoke execute on function delivery_category(text, jsonb) from public, anon, authenticated;
revoke execute on function director_meeting_until(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function set_notify_prefs(jsonb) from public, anon;
grant execute on function notify_prefs_of(uuid) to service_role;
grant execute on function delivery_category(text, jsonb) to service_role;
grant execute on function director_meeting_until(uuid, timestamptz) to service_role;
grant execute on function set_notify_prefs(jsonb) to authenticated, service_role;
