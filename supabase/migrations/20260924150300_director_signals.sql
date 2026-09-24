-- D-114, stage 4: what the director is told on top of the events themselves.
--
-- Four ticks of the minute sweep (/api/push/sweep), each idempotent by its own marks:
--   director_digests_due()      — the held rows become one push: «Сводка · 3 на приёмку ·
--                                 2 вопроса», «Пока вы отдыхали: …», «Пока вы были на встрече: …».
--                                 A single held row goes out as itself; what the director has
--                                 already seen in the app is not told again.
--   unseen_task_alerts_due()    — «Задача не открыта · Марат»: a task still `sent`, its push not
--                                 seen for N minutes (the director's setting, 30 by default), only
--                                 inside the company window — once per sending.
--   overdue_alerts_due()        — «Просрочено · Марат»: the deadline passed, the task is open —
--                                 once per deadline (an extension earns a new one).
--   director_day_summaries_due() — «Итог дня» at the director's time, once a day.
-- Wording follows D-32: «не открыта», never «не получил» (Web Push confirms nothing).

create or replace function ru_plural(p_n int, p_one text, p_few text, p_many text) returns text
language sql immutable
as $fn$
  select p_n || ' ' || case
    when p_n % 10 = 1 and p_n % 100 <> 11 then p_one
    when p_n % 10 between 2 and 4 and p_n % 100 not between 12 and 14 then p_few
    else p_many
  end;
$fn$;

-- ---------------------------------------------------------------------------
-- 1. Digests
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
           count(*) filter (where d.category = 'secretary')::int as secretary,
           count(*) filter (where d.category = 'calendar')::int as calendar,
           count(*) filter (where d.category = 'shop')::int as shop,
           count(*) filter (where d.category not in ('review', 'declined', 'questions', 'messages', 'unseen',
                                                     'overdue', 'secretary', 'calendar', 'shop')
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
      case when r.unseen > 0 then 'не открыли ' || ru_plural(r.unseen, 'задачу', 'задачи', 'задач') end,
      case when r.overdue > 0 then ru_plural(r.overdue, 'просрочка', 'просрочки', 'просрочек') end,
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
-- 2. «Задача не открыта»
-- ---------------------------------------------------------------------------
create or replace function unseen_task_alerts_due(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_count int;
begin
  with due as (
    select distinct on (t.id)
           t.id, t.company_id, t.author_id, t.title, d.sent_at, d.status as push_status, d.last_error,
           coalesce(split_part(p.full_name, ' ', 1), 'Сотрудник') as who
      from notification_deliveries d
      join tasks t on t.id = d.task_id and t.status = 'sent'
      join profiles a on a.id = t.author_id and a.role = 'director' and a.is_active
      left join profiles p on p.id = t.assignee_id
     where d.event_kind = 'task_sent'
       and d.seen_at is null and d.acted_at is null
       and d.status in ('sent', 'failed')
       and coalesce(d.sent_at, d.created_at) > p_now - interval '24 hours'
       and coalesce(d.sent_at, d.created_at) <= p_now - make_interval(mins =>
             case when notify_prefs_of(t.author_id) ->> 'unseen_after_min' ~ '^[0-9]{1,3}$'
                  then greatest(5, least(240, (notify_prefs_of(t.author_id) ->> 'unseen_after_min')::int))
                  else 30 end)
       and coalesce(notify_prefs_of(t.author_id) -> 'modes' ->> 'unseen', 'now') <> 'off'
       -- only in working hours: at night nobody is expected to open anything
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
           'title', 'Задача не открыта · ' || who,
           'body', '«' || left(coalesce(title, 'Задача'), 80) || '» · ' ||
                   case when push_status = 'failed' and last_error = 'no_subscription'
                        then 'уведомления не включены'
                        else 'отправлена в ' || to_char(coalesce(sent_at, p_now) at time zone 'Asia/Aqtobe', 'HH24:MI') end,
           'url', '/tasks/' || id,
           'tag', 'task:' || id)
    from due;
  get diagnostics v_count = row_count;
  return v_count;
end
$fn$;

-- ---------------------------------------------------------------------------
-- 3. «Просрочено»
-- ---------------------------------------------------------------------------
create or replace function overdue_alerts_due(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_count int;
begin
  insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta)
  select t.company_id, t.author_id, t.id, 'task_overdue',
         jsonb_build_object(
           'title', 'Просрочено · ' || coalesce(split_part(p.full_name, ' ', 1), 'без исполнителя'),
           'body', '«' || left(coalesce(t.title, 'Задача'), 80) || '» · срок был ' ||
                   case when (t.deadline at time zone 'Asia/Aqtobe')::date = (p_now at time zone 'Asia/Aqtobe')::date
                        then to_char(t.deadline at time zone 'Asia/Aqtobe', 'HH24:MI')
                        else to_char(t.deadline at time zone 'Asia/Aqtobe', 'DD.MM HH24:MI') end,
           'url', '/tasks/' || t.id,
           'tag', 'task:' || t.id,
           'deadline', t.deadline)
    from tasks t
    join profiles a on a.id = t.author_id and a.role = 'director' and a.is_active
    left join profiles p on p.id = t.assignee_id
   where t.status in ('sent', 'accepted', 'in_progress', 'rework')
     and t.deadline is not null
     and t.deadline <= p_now
     and t.deadline > p_now - interval '3 days'
     and coalesce(notify_prefs_of(t.author_id) -> 'modes' ->> 'overdue', 'digest') <> 'off'
     and not exists (
           select 1 from notification_deliveries o
            where o.task_id = t.id and o.event_kind = 'task_overdue'
              and (o.meta ->> 'deadline')::timestamptz = t.deadline);
  get diagnostics v_count = row_count;
  return v_count;
end
$fn$;

-- ---------------------------------------------------------------------------
-- 4. «Итог дня»
-- ---------------------------------------------------------------------------
create or replace function director_day_summaries_due(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  r        record;
  v_count  int := 0;
  v_local  timestamp := p_now at time zone 'Asia/Aqtobe';
  v_day    timestamptz := date_trunc('day', v_local) at time zone 'Asia/Aqtobe';
  v_start  timestamp;
  v_body   text;
  v_done   int;
  v_review int;
  v_work   int;
  v_unseen int;
  v_late   int;
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
           count(*) filter (where t.status = 'sent' and exists (
             select 1 from notification_deliveries d
              where d.task_id = t.id and d.event_kind = 'task_sent'
                and d.seen_at is null and d.acted_at is null)),
           count(*) filter (where t.status in ('sent', 'accepted', 'in_progress', 'rework')
                              and t.deadline is not null and t.deadline < p_now)
      into v_done, v_review, v_work, v_unseen, v_late
      from tasks t
     where t.author_id = r.id;

    v_body := concat_ws(' · ',
      case when v_done > 0 then 'принято ' || v_done end,
      case when v_review > 0 then 'на приёмке ' || v_review end,
      case when v_work > 0 then 'в работе ' || v_work end,
      case when v_unseen > 0 then 'не открыто ' || v_unseen end,
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

revoke execute on function director_digests_due(timestamptz) from public, anon, authenticated;
revoke execute on function unseen_task_alerts_due(timestamptz) from public, anon, authenticated;
revoke execute on function overdue_alerts_due(timestamptz) from public, anon, authenticated;
revoke execute on function director_day_summaries_due(timestamptz) from public, anon, authenticated;
-- only the sweep calls the ticks
grant execute on function director_digests_due(timestamptz) to service_role;
grant execute on function unseen_task_alerts_due(timestamptz) to service_role;
grant execute on function overdue_alerts_due(timestamptz) to service_role;
grant execute on function director_day_summaries_due(timestamptz) to service_role;
