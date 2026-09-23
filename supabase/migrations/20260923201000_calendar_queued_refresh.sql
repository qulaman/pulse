-- Правка мероприятия переписывает то, что ещё ждёт окна доставки (D-94 §4).
--
-- Зачем: приглашение, перенос и отмена ждут окна 08:00–21:00. Директор создал встречу
-- в 22:00 на завтра в 10:00 и в 23:00 перенёс её на 11:00 — утром человек получил бы
-- «Приглашение · 10:00» и следом «Перенос · 11:00». Строка, которая ещё не ушла,
-- переписывается новым временем, местом и названием, и второе извещение тому же
-- человеку не создаётся. Ушедшее не трогается: кто уже знает старое время, узнаёт
-- «Перенос», как раньше.
--
-- Тело — целиком из 20260923200000_calendar_edit_delete.sql плюс переписывание очереди
-- и переименование (новое название без переноса извещения не создаёт, но ждущую
-- строку поправляет).

create or replace function notify_outbox_event() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_moved   boolean := new.starts_at is distinct from old.starts_at;
  v_placed  boolean := new.location is distinct from old.location;
  v_renamed boolean := new.title is distinct from old.title;
  v_when    text := to_char(new.starts_at at time zone 'Asia/Aqtobe', 'DD.MM HH24:MI');
  v_url     text := '/calendar?e=' || new.id;
  v_fresh   uuid[] := '{}';
begin
  if new.cancelled_at is null and (v_moved or v_placed or v_renamed) then
    -- a line still waiting for the window carries the meeting as it is now, instead of
    -- being followed by a second one (the invitation keeps its shape: title · time)
    with rewritten as (
      update notification_deliveries d
         set meta = d.meta || jsonb_build_object(
               'title', case when d.event_kind = 'event_moved' and v_moved then 'Перенос'
                             else d.meta->>'title' end,
               'body', left(new.title, 80) || ' · ' || v_when ||
                       case when d.event_kind = 'event_moved' then coalesce(' · ' || new.location, '')
                            else '' end)
       where d.company_id = new.company_id
         and d.status = 'queued'
         and d.event_kind in ('event_invite', 'event_moved')
         and d.meta->>'url' = v_url
         -- only for those still on the list: a line left behind for somebody taken off it
         -- (set_event_participants does not clear the queue) is not refreshed
         and exists (select 1 from event_participants ep
                      where ep.event_id = new.id and ep.user_id = d.user_id)
      returning d.user_id
    )
    select coalesce(array_agg(user_id), '{}') into v_fresh from rewritten;

    -- перенос или новое место: знать обязаны все, кто собирался прийти
    if (v_moved or v_placed) and coalesce(new.ends_at, new.starts_at) > now() then
      insert into notification_deliveries (company_id, user_id, event_kind, meta)
      select new.company_id, ep.user_id, 'event_moved',
             jsonb_build_object(
               'title', case when v_moved then 'Перенос' else 'Новое место' end,
               'body', left(new.title, 80) || ' · ' || v_when || coalesce(' · ' || new.location, ''),
               'url', v_url)
        from event_participants ep
       where ep.event_id = new.id and ep.user_id <> new.author_id and ep.status <> 'declined'
         and not (ep.user_id = any(v_fresh));
    end if;
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
