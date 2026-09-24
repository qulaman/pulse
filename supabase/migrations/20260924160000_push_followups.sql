-- D-114, follow-ups (owner, 2026-09-24: «остальные решения за тобой. таблицу доставок сразу нужно
-- подумать о самоочистке»).
--
-- 1. «Задача не открыта» became «Задача не принята». «Увидел» is set the moment the phone shows
--    the notification (D-32), so a signal «not seen for 30 minutes» fired only for a dead phone.
--    What the director needs is «nobody pressed «Принял»»: the task is still `sent` N minutes
--    after its push, whatever the phone did — and the body says what we know: «увидел в 9:14»,
--    «не открывал с 9:14», «уведомления не включены». Same kind (`task_unseen`), same setting.
-- 2. «Уведомления не доходят · Марат»: a push to a member of the team failed (no device, or
--    three push-service errors) in the last day and nothing reached them since — the director
--    is told once a week per person, a new category `team` in his rules («сразу» by default).
-- 3. The day summary counts «не приняты» (still `sent`), not «не открыто»; the digest names the
--    people without notifications.
-- 4. Self-cleaning outbox: a delivery that went (or failed) lives 30 days, a queued one that
--    nothing sent in 7 days is stale; the minute sweep deletes at most 2000 of them per tick.
--    The receipts on screen read the newest rows only; push_health looks back 14 days.

-- ---------------------------------------------------------------------------
-- 1. The rules know `team`
-- ---------------------------------------------------------------------------
create or replace function notify_prefs_defaults() returns jsonb
language sql immutable
as $fn$
  select '{
    "modes": {"review": "now", "declined": "now", "questions": "now", "messages": "now",
              "unseen": "now", "overdue": "digest", "secretary": "now", "calendar": "now", "shop": "now",
              "team": "now"},
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
  if p_kind = 'team_channel' then return 'team'; end if;
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
-- 2. «Задача не принята»
-- ---------------------------------------------------------------------------
create or replace function unseen_task_alerts_due(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_count int;
begin
  with due as (
    select distinct on (t.id)
           t.id, t.company_id, t.author_id, t.title,
           coalesce(d.sent_at, d.created_at) as pushed_at, d.seen_at, d.status as push_status, d.last_error,
           coalesce(split_part(p.full_name, ' ', 1), 'Сотрудник') as who
      from notification_deliveries d
      join tasks t on t.id = d.task_id and t.status = 'sent'
      join profiles a on a.id = t.author_id and a.role = 'director' and a.is_active
      left join profiles p on p.id = t.assignee_id
     where d.event_kind = 'task_sent'
       and d.status in ('sent', 'failed')
       and coalesce(d.sent_at, d.created_at) > p_now - interval '24 hours'
       and coalesce(d.sent_at, d.created_at) <= p_now - make_interval(mins =>
             case when notify_prefs_of(t.author_id) ->> 'unseen_after_min' ~ '^[0-9]{1,3}$'
                  then greatest(5, least(240, (notify_prefs_of(t.author_id) ->> 'unseen_after_min')::int))
                  else 30 end)
       and coalesce(notify_prefs_of(t.author_id) -> 'modes' ->> 'unseen', 'now') <> 'off'
       -- only in working hours: at night nobody is expected to press anything
       and next_delivery_slot(t.company_id, p_now) is null
       and not exists (
             select 1 from notification_deliveries u
              where u.task_id = t.id and u.event_kind = 'task_unseen'
                and u.created_at >= coalesce(d.sent_at, d.created_at))
     order by t.id, d.created_at desc
  )
  insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta)
  select company_id, author_id, id, 'task_unseen',
         jsonb_build_object(
           'title', 'Задача не принята · ' || who,
           'body', '«' || left(coalesce(title, 'Задача'), 80) || '» · ' ||
                   case when push_status = 'failed' and last_error = 'no_subscription' then 'уведомления не включены'
                        when push_status = 'failed' then 'пуш не прошёл'
                        when seen_at is not null then 'увидел в ' || to_char(seen_at at time zone 'Asia/Aqtobe', 'HH24:MI')
                        else 'не открывал с ' || to_char(pushed_at at time zone 'Asia/Aqtobe', 'HH24:MI') end,
           'url', '/tasks/' || id,
           'tag', 'task:' || id)
    from due;
  get diagnostics v_count = row_count;
  return v_count;
end
$fn$;

-- ---------------------------------------------------------------------------
-- 3. «Уведомления не доходят · Марат»
-- ---------------------------------------------------------------------------
create or replace function team_channel_alerts_due(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_count int;
begin
  with dead as (
    select distinct on (d.user_id)
           d.user_id, d.company_id, d.created_at as failed_at, d.last_error,
           coalesce(split_part(p.full_name, ' ', 1), 'Сотрудник') as who
      from notification_deliveries d
      join profiles p on p.id = d.user_id and p.is_active and p.role not in ('director', 'tv')
     where d.status = 'failed'
       and (d.last_error = 'no_subscription' or d.last_error like 'push %')
       and d.created_at > p_now - interval '24 hours'
       and d.created_at <= p_now
       -- something reached them since: the channel is alive again
       and not exists (
             select 1 from notification_deliveries ok
              where ok.user_id = d.user_id and ok.status = 'sent' and ok.sent_at > d.created_at)
       -- once a week per person
       and not exists (
             select 1 from notification_deliveries a
              where a.event_kind = 'team_channel' and a.meta ->> 'person_id' = d.user_id::text
                and a.created_at > p_now - interval '7 days')
     order by d.user_id, d.created_at desc
  )
  insert into notification_deliveries (company_id, user_id, event_kind, meta)
  select dead.company_id, dir.id, 'team_channel',
         jsonb_build_object(
           'title', 'Уведомления не доходят · ' || dead.who,
           'body', case when dead.last_error = 'no_subscription'
                        then 'Уведомления не включены — задачи увидит, только открыв Pulse. Карточка → «Прислать проверку»'
                        else 'Пуш в ' || to_char(dead.failed_at at time zone 'Asia/Aqtobe', 'HH24:MI') ||
                             ' не прошёл — пусть откроет Pulse и включит уведомления заново' end,
           'url', '/people/' || dead.user_id || '/edit',
           'tag', 'team:' || dead.user_id,
           'person_id', dead.user_id)
    from dead
    join profiles dir on dir.company_id = dead.company_id and dir.role = 'director' and dir.is_active
   where coalesce(notify_prefs_of(dir.id) -> 'modes' ->> 'team', 'now') <> 'off';
  get diagnostics v_count = row_count;
  return v_count;
end
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Digests name the people without notifications (body of 20260924150300 + `team`)
-- ---------------------------------------------------------------------------
create or replace function director_digests_due(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  r        record;
  v_count  int := 0;
  v_id     uuid;
  v_title  text;
  v_body   text;
begin
  -- already seen in the app: nothing left to tell
  update notification_deliveries
     set status = 'failed', attempts = 3, last_error = 'seen_in_app'
   where status = 'queued' and mode = 'digest' and deliver_after <= p_now
     and seen_at is not null and claimed_at is null;

  for r in
    select d.user_id,
           d.company_id,
           count(*)::int as total,
           count(*) filter (where d.category = 'review')::int as review,
           count(*) filter (where d.category = 'declined')::int as declined,
           count(*) filter (where d.category = 'questions')::int as questions,
           coalesce(sum(case when d.category = 'messages'
                             then case when d.meta ->> 'count' ~ '^[0-9]+$' then (d.meta ->> 'count')::int else 1 end
                        end), 0)::int as messages,
           count(*) filter (where d.category = 'unseen')::int as unseen,
           count(*) filter (where d.category = 'overdue')::int as overdue,
           count(*) filter (where d.category = 'team')::int as team,
           count(*) filter (where d.category = 'secretary')::int as secretary,
           count(*) filter (where d.category = 'calendar')::int as calendar,
           count(*) filter (where d.category = 'shop')::int as shop,
           count(*) filter (where d.category not in ('review', 'declined', 'questions', 'messages', 'unseen',
                                                     'overdue', 'team', 'secretary', 'calendar', 'shop')
                               or d.category is null)::int as other,
           bool_or(d.held = 'quiet') as quiet,
           bool_or(d.held = 'meeting') as meeting
      from notification_deliveries d
     where d.status = 'queued' and d.mode = 'digest' and d.deliver_after <= p_now and d.claimed_at is null
     group by d.user_id, d.company_id
  loop
    if r.total = 1 then
      -- one word needs no summary: it goes out as itself, with its own text and link
      update notification_deliveries
         set mode = 'now', deliver_after = p_now
       where user_id = r.user_id and status = 'queued' and mode = 'digest'
         and deliver_after <= p_now and claimed_at is null;
      v_count := v_count + 1;
      continue;
    end if;

    v_title := case when r.quiet then 'Пока вы отдыхали'
                    when r.meeting then 'Пока вы были на встрече'
                    else 'Сводка' end;
    v_body := concat_ws(' · ',
      case when r.review > 0 then r.review || ' на приёмку' end,
      case when r.declined > 0 then ru_plural(r.declined, 'отказ', 'отказа', 'отказов') end,
      case when r.questions > 0 then ru_plural(r.questions, 'вопрос', 'вопроса', 'вопросов') end,
      case when r.messages > 0 then ru_plural(r.messages, 'сообщение', 'сообщения', 'сообщений') end,
      case when r.unseen > 0 then 'не приняли ' || ru_plural(r.unseen, 'задачу', 'задачи', 'задач') end,
      case when r.overdue > 0 then ru_plural(r.overdue, 'просрочка', 'просрочки', 'просрочек') end,
      case when r.team > 0 then 'без уведомлений: ' || r.team end,
      case when r.secretary > 0 then r.secretary || ' от секретаря' end,
      case when r.calendar > 0 then r.calendar || ' в календаре' end,
      case when r.shop > 0 then ru_plural(r.shop, 'заказ', 'заказа', 'заказов') end,
      case when r.other > 0 then 'ещё ' || r.other end);

    insert into notification_deliveries (company_id, user_id, event_kind, meta)
    values (r.company_id, r.user_id, 'digest',
            jsonb_build_object('title', v_title, 'body', v_body, 'url', '/pulse', 'tag', 'digest'))
    returning id into v_id;

    update notification_deliveries
       set status = 'sent', sent_at = p_now, digest_id = v_id
     where user_id = r.user_id and status = 'queued' and mode = 'digest'
       and deliver_after <= p_now and claimed_at is null;
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$fn$;

-- ---------------------------------------------------------------------------
-- 5. «Итог дня»: «не приняты» — still `sent` (body of 20260924150300 otherwise)
-- ---------------------------------------------------------------------------
create or replace function director_day_summaries_due(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  r         record;
  v_count   int := 0;
  v_local   timestamp := p_now at time zone 'Asia/Aqtobe';
  v_day     timestamptz := date_trunc('day', v_local) at time zone 'Asia/Aqtobe';
  v_start   timestamp;
  v_body    text;
  v_done    int;
  v_review  int;
  v_work    int;
  v_waiting int;
  v_late    int;
begin
  for r in
    select p.id, p.company_id, notify_prefs_of(p.id) ->> 'day_summary_at' as at
      from profiles p
     where p.role = 'director' and p.is_active
  loop
    continue when r.at is null or r.at !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';
    v_start := date_trunc('day', v_local) + r.at::time;
    -- at the director's time, and not hours later after a dead tick
    continue when v_local < v_start or v_local >= v_start + interval '3 hours';
    continue when exists (
      select 1 from notification_deliveries s
       where s.user_id = r.id and s.event_kind = 'day_summary' and s.created_at >= v_day);

    select count(*) filter (where t.status = 'done' and t.closed_at >= v_day),
           count(*) filter (where t.status = 'pending_review'),
           count(*) filter (where t.status in ('sent', 'accepted', 'in_progress', 'rework')),
           count(*) filter (where t.status = 'sent'),
           count(*) filter (where t.status in ('sent', 'accepted', 'in_progress', 'rework')
                              and t.deadline is not null and t.deadline < p_now)
      into v_done, v_review, v_work, v_waiting, v_late
      from tasks t
     where t.author_id = r.id;

    v_body := concat_ws(' · ',
      case when v_done > 0 then 'принято ' || v_done end,
      case when v_review > 0 then 'на приёмке ' || v_review end,
      case when v_work > 0 then 'в работе ' || v_work end,
      case when v_waiting > 0 then 'не приняты ' || v_waiting end,
      case when v_late > 0 then 'просрочено ' || v_late end);

    insert into notification_deliveries (company_id, user_id, event_kind, meta)
    values (r.company_id, r.id, 'day_summary',
            jsonb_build_object('title', 'Итог дня',
                               'body', coalesce(nullif(v_body, ''), 'Сегодня без задач в работе'),
                               'url', '/sent', 'tag', 'day-summary'));
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$fn$;

-- ---------------------------------------------------------------------------
-- 6. The outbox cleans itself
-- ---------------------------------------------------------------------------
create index if not exists notification_deliveries_created_idx on notification_deliveries (created_at);

create or replace function notification_deliveries_purge(
  p_now timestamptz default now(),
  p_keep_days int default 30,
  p_stale_days int default 7,
  p_batch int default 2000
) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_count int;
begin
  -- a small batch per minute: never a long lock on the table the worker lives in
  delete from notification_deliveries d
   where d.id in (
           select x.id from notification_deliveries x
            where x.created_at < p_now - make_interval(days => greatest(1, least(p_stale_days, p_keep_days)))
              and (x.status = 'queued'
                   or x.created_at < p_now - make_interval(days => greatest(1, p_keep_days)))
            order by x.created_at
            limit greatest(1, least(p_batch, 10000))
            for update skip locked
         );
  get diagnostics v_count = row_count;
  return v_count;
end
$fn$;

revoke execute on function team_channel_alerts_due(timestamptz) from public, anon, authenticated;
revoke execute on function notification_deliveries_purge(timestamptz, int, int, int) from public, anon, authenticated;
-- only the sweep calls the ticks
grant execute on function team_channel_alerts_due(timestamptz) to service_role;
grant execute on function notification_deliveries_purge(timestamptz, int, int, int) to service_role;
