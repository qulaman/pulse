-- Полноценный календарь (D-94): мероприятие правится одной формой и удаляется.
--
-- Зачем одна функция правки, а не update строки плюс set_event_participants: форма
-- сохраняет всё сразу — название, время, место, повод, напоминание и состав, — и это
-- две таблицы. Две записи с клиента — это полуправка при обрыве сети (принцип 7:
-- многотабличное — только функцией). Команда абсолютная («сделай мероприятие таким»),
-- повтор пишет то же самое, поэтому client_request_id не заводится — то же
-- исключение, что D-76 §3 и respond_event.
--
-- Зачем порядок «убрать → обновить → добавить» внутри edit_event: триггер переноса
-- шлёт «Перенос» тем, кто в составе в момент update. Убранный не должен получить
-- перенос встречи, на которую его больше не ждут; добавленный получает приглашение
-- уже с новым временем, а не приглашение и следом перенос.
--
-- Зачем удаление, а не только отмена: владелец попросил удалять (D-94). Удалённого
-- мероприятия нет ни у кого; если оно ещё впереди, позванные узнают «Отмена».
-- Уведомления, которые ещё ждут окна доставки (приглашение ночью), снимаются с
-- очереди: человек, который о встрече не узнал, не получает и её отмену — прецедент
-- `notify_outbox_errand` (20260922120100_errands.sql).
--
-- Зачем извещение о новом месте: «планёрка переехала в переговорку» для участника
-- значит то же, что перенос времени, — иначе он придёт не туда.

-- ---------------------------------------------------------------------------
-- 1. Перенос и новое место — одним извещением; прошедшее никого не будит
-- ---------------------------------------------------------------------------
create or replace function notify_outbox_event() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_moved  boolean := new.starts_at is distinct from old.starts_at;
  v_placed boolean := new.location is distinct from old.location;
begin
  -- перенос или новое место: знать обязаны все, кто собирался прийти
  if (v_moved or v_placed) and new.cancelled_at is null
     and coalesce(new.ends_at, new.starts_at) > now() then
    insert into notification_deliveries (company_id, user_id, event_kind, meta)
    select new.company_id, ep.user_id, 'event_moved',
           jsonb_build_object(
             'title', case when v_moved then 'Перенос' else 'Новое место' end,
             'body', left(new.title, 80) || ' · ' ||
                     to_char(new.starts_at at time zone 'Asia/Aqtobe', 'DD.MM HH24:MI') ||
                     coalesce(' · ' || new.location, ''),
             'url', '/calendar?e=' || new.id)
      from event_participants ep
     where ep.event_id = new.id and ep.user_id <> new.author_id and ep.status <> 'declined';
  end if;

  -- отмена: узнают все позванные, включая отказавшихся — идти больше некуда
  if new.cancelled_at is not null and old.cancelled_at is null then
    insert into notification_deliveries (company_id, user_id, event_kind, meta)
    select new.company_id, ep.user_id, 'event_cancelled',
           jsonb_build_object('title', 'Отмена', 'body', left(new.title, 80),
                              'url', '/calendar?e=' || new.id)
      from event_participants ep
     where ep.event_id = new.id and ep.user_id <> new.author_id;
  end if;

  return null;
end
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Снять человека с мероприятия: неотправленное снимается с очереди, а тот, кто
--    уже знал о встрече и она ещё впереди, получает «Отмена» (общая часть правки
--    и удаления)
-- ---------------------------------------------------------------------------
create or replace function event_release(p_event events, p_users uuid[]) returns void
language plpgsql security definer set search_path = public
as $fn$
declare
  v_unaware uuid[];
begin
  if coalesce(array_length(p_users, 1), 0) = 0 then
    return;
  end if;

  -- всё, что по этой встрече ещё ждёт окна, этим людям уже не нужно
  with dropped as (
    delete from notification_deliveries d
     where d.company_id = p_event.company_id
       and d.status = 'queued'
       and d.user_id = any(p_users)
       and d.meta->>'url' = '/calendar?e=' || p_event.id
    returning d.user_id, d.event_kind
  )
  select coalesce(array_agg(user_id) filter (where event_kind = 'event_invite'), '{}')
    into v_unaware from dropped;

  if p_event.cancelled_at is null and coalesce(p_event.ends_at, p_event.starts_at) > now() then
    insert into notification_deliveries (company_id, user_id, event_kind, meta)
    select p_event.company_id, u, 'event_cancelled',
           jsonb_build_object(
             'title', 'Отмена',
             'body', left(p_event.title, 80) || ' · ' ||
                     to_char(p_event.starts_at at time zone 'Asia/Aqtobe', 'DD.MM HH24:MI'),
             -- the meeting may be gone by the time the push is opened: the calendar, not the row
             'url', '/calendar')
      from unnest(p_users) as u
     where u <> p_event.author_id and not (u = any(v_unaware));
  end if;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. edit_event -- форма «Изменить»: все поля и состав одной командой
-- ---------------------------------------------------------------------------
create or replace function edit_event(
  p_event uuid,
  p_title text,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null,
  p_location text default null,
  p_body text default null,
  p_remind_before_min int default 30,
  p_everyone boolean default false,
  p_participant_ids uuid[] default '{}'
) returns events
language plpgsql security definer set search_path = public
as $fn$
declare
  v_event   events%rowtype;
  v_title   text := nullif(btrim(coalesce(p_title, '')), '');
  v_keep    uuid[];
  v_removed uuid[];
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select * into v_event from events
   where id = p_event and company_id = auth_company_id() and cancelled_at is null
   for update;
  if v_event.id is null then
    raise exception 'event_not_found' using errcode = 'P0001';
  end if;

  if v_title is null then
    raise exception 'event_title_required' using errcode = 'P0001';
  end if;
  if p_starts_at is null then
    raise exception 'event_time_required' using errcode = 'P0001';
  end if;
  if p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'event_end_before_start' using errcode = 'P0001';
  end if;
  if p_remind_before_min is null or p_remind_before_min not between 0 and 1440 then
    raise exception 'event_bad_reminder' using errcode = 'P0001';
  end if;

  -- the new list: the whole active company for «все», otherwise the ids that are ours
  -- (somebody else's company or an inactive person is skipped silently, D-56)
  select coalesce(array_agg(p.id), '{}') into v_keep
    from profiles p
   where p.company_id = v_event.company_id and p.is_active and p.role <> 'tv'
     and (coalesce(p_everyone, false) or p.id = any(coalesce(p_participant_ids, '{}'::uuid[])));

  -- 1) those who are out: they hear «Отмена», not the new time (the author stays — it is their meeting)
  with gone as (
    delete from event_participants
     where event_id = p_event and user_id <> v_event.author_id and not (user_id = any(v_keep))
    returning user_id
  )
  select coalesce(array_agg(user_id), '{}') into v_removed from gone;
  perform event_release(v_event, v_removed);

  -- 2) the meeting itself: the triggers reset the reminder and tell the rest about the move
  update events
     set title             = v_title,
         starts_at         = p_starts_at,
         ends_at           = p_ends_at,
         location          = nullif(btrim(coalesce(p_location, '')), ''),
         body              = nullif(btrim(coalesce(p_body, '')), ''),
         remind_before_min = p_remind_before_min,
         everyone          = coalesce(p_everyone, false)
   where id = p_event
  returning * into v_event;

  -- 3) those who are new: the insert trigger invites them, already with the new time
  insert into event_participants (event_id, user_id)
  select p_event, u from unnest(v_keep) as u
  on conflict do nothing;

  return v_event;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. delete_event -- «Удалить»: строки больше нет ни у кого; повтор безвреден
-- ---------------------------------------------------------------------------
create or replace function delete_event(p_event uuid) returns void
language plpgsql security definer set search_path = public
as $fn$
declare
  v_event events%rowtype;
  v_users uuid[];
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select * into v_event from events
   where id = p_event and company_id = auth_company_id()
   for update;
  -- already gone: the command is absolute, a repeat has nothing left to do
  if v_event.id is null then
    return;
  end if;

  select coalesce(array_agg(user_id), '{}') into v_users
    from event_participants where event_id = p_event;
  perform event_release(v_event, v_users);

  -- a line still queued for somebody who left the list earlier (set_event_participants
  -- drops nobody's queue) points at a row that is about to vanish
  delete from notification_deliveries
   where company_id = v_event.company_id and status = 'queued'
     and meta->>'url' = '/calendar?e=' || v_event.id;

  -- participants go with the row (on delete cascade)
  delete from events where id = p_event;
end;
$fn$;

revoke execute on function event_release(events, uuid[]) from public, anon, authenticated;
revoke execute on function edit_event(uuid, text, timestamptz, timestamptz, text, text, int, boolean, uuid[]) from public, anon;
revoke execute on function delete_event(uuid) from public, anon;

-- a helper of the two commands, not a command of its own
grant execute on function event_release(events, uuid[]) to service_role;
grant execute on function edit_event(uuid, text, timestamptz, timestamptz, text, text, int, boolean, uuid[]) to authenticated, service_role;
grant execute on function delete_event(uuid) to authenticated, service_role;
