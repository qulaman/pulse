-- D-95: напоминания живут в заметках, корзина заметок чистится сама через 3 дня.
--
-- Зачем напоминание — заметка, а не строка `reminders`: `reminders` писала только
-- confirm_voice_batch, а читать её было некому — «напомни мне в пятницу …» молча
-- пропадало, и увидеть или отменить его директору было негде. Заметка со временем
-- видна в «Заметках» (группа «Напоминания»), её можно перенести и снять, а минутный
-- свип зовёт notes_due_reminders — так же, как events_due_reminders (D-78). Слияние
-- рекомендовано D-75 §8 (б). Таблица `reminders` остаётся (история), в неё больше
-- никто не пишет; её строки перенесены в заметки ниже.
--
-- Зачем удаление по сроку: владелец (2026-09-23) — «автоочистка корзины 3 дня».
-- Удалённая заметка ждёт в корзине 3 дня, потом её строка удаляется тем же свипом.
-- Файл голоса остаётся в бакете — срок хранения аудио решает D-18, как и при
-- «Удалить навсегда».

alter table notes
  add column remind_at   timestamptz,           -- when to remind the author; null = no reminder
  add column reminded_at timestamptz;           -- set once by notes_due_reminders; reset when remind_at moves

comment on column notes.remind_at is 'D-95: remind the author at this moment (push); a note with a time is a reminder';
comment on column notes.reminded_at is 'D-95: set by notes_due_reminders when the reminder went out; a new remind_at clears it';

-- the minute tick: what still owes a reminder
create index notes_remind_due_idx on notes (remind_at)
  where remind_at is not null and reminded_at is null and deleted_at is null;
-- the minute tick: what has waited in the bin long enough
create index notes_trash_idx on notes (deleted_at) where deleted_at is not null;

-- a moved reminder rings again, at the new time
create or replace function notes_reset_reminder() returns trigger
language plpgsql set search_path = public
as $fn$
begin
  if new.remind_at is distinct from old.remind_at then
    new.reminded_at := null;
  end if;
  return new;
end
$fn$;

create trigger trg_notes_reset_reminder
  before update on notes
  for each row execute function notes_reset_reminder();

-- ---------------------------------------------------------------------------
-- notes_due_reminders -- минутный тик свипа POST /api/push/sweep (сервисный ключ).
-- Идемпотентность — на notes.reminded_at: повтор той же минуты не шлёт второй раз.
-- Тихих часов нет: время выбрал сам директор (как «Скоро» мероприятия, D-78). После
-- простоя свипа опоздавшее напоминание всё равно уходит — с временем, на которое
-- его ставили: обещание «напомню» дороже тишины.
-- ---------------------------------------------------------------------------
create or replace function notes_due_reminders(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_note  notes%rowtype;
  v_head  text;
  v_count int := 0;
begin
  for v_note in
    select * from notes n
     where n.remind_at is not null
       and n.reminded_at is null
       and n.deleted_at is null
       and n.remind_at <= p_now
     order by n.remind_at
     for update skip locked
  loop
    v_head := nullif(btrim(split_part(btrim(v_note.text), E'\n', 1)), '');
    insert into notification_deliveries (company_id, user_id, event_kind, meta)
    select v_note.company_id, v_note.user_id, 'note_reminder',
           jsonb_build_object(
             'title', 'Напоминание',
             'body', left(coalesce(v_head, 'Голосовая заметка'), 120) ||
                     case when p_now - v_note.remind_at > interval '15 minutes'
                          then ' · было на ' || to_char(v_note.remind_at at time zone 'Asia/Aqtobe', 'DD.MM HH24:MI')
                          else '' end,
             'url', '/notes?n=' || v_note.id,
             'tag', 'note-' || v_note.id)
      from profiles p
     where p.id = v_note.user_id and p.is_active;

    update notes set reminded_at = p_now where id = v_note.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- notes_purge_trash -- тот же тик: корзина хранит удалённое 3 дня (D-95).
-- ---------------------------------------------------------------------------
create or replace function notes_purge_trash(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_count int;
begin
  delete from notes n where n.deleted_at is not null and n.deleted_at < p_now - interval '3 days';
  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

revoke execute on function notes_due_reminders(timestamptz) from public, anon, authenticated;
revoke execute on function notes_purge_trash(timestamptz) from public, anon, authenticated;
-- тик зовёт только свип: у человека этих кнопок нет
grant execute on function notes_due_reminders(timestamptz) to service_role;
grant execute on function notes_purge_trash(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- confirm_voice_batch -- пересоздана целиком (тело 20260918150000_calendar_events.sql),
-- изменена одна ветка: `reminder` пишет заметку с remind_at вместо строки `reminders`.
-- Ключ ответа `reminder_ids` сохранён — теперь это id заметок.
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
  v_pid        uuid;                        -- one participant of it
  v_point_ids  uuid[] := '{}'::uuid[];
  v_settings   jsonb;
  v_points_on  boolean;
  v_amount     int;
  v_skipped    jsonb := '[]'::jsonb;
  v_scheduled  boolean := false;
  v_inbox      uuid := nullif(payload->>'inbox_id', '')::uuid;
  v_note       uuid := nullif(payload->>'note_id', '')::uuid;   -- the note this batch came from
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
      insert into events (company_id, author_id, title, body, location, starts_at, ends_at,
                          remind_before_min, everyone, audio_path, source_transcript, inbox_item_id)
      values (v_company, v_user, v_entity->>'title', v_entity->>'body', v_entity->>'location',
              v_starts, nullif(v_entity->>'ends_at_iso', '')::timestamptz,
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

    elsif v_kind = 'note' then
      -- a thought of the director: no assignee, no deadline, nobody else ever reads it
      insert into notes (company_id, user_id, text, raw_transcript, audio_path, inbox_item_id)
      values (v_company, v_user, v_entity->>'text', payload->>'transcript',
              nullif(payload->>'audio_path', ''), v_inbox)
      returning id into v_id;
      v_note_ids := v_note_ids || v_id;

    elsif v_kind = 'recurrence' then
      v_assignee := nullif(v_entity->>'assignee_id', '')::uuid;
      if v_assignee is null then
        raise exception 'assignee_required' using errcode = 'P0001';
      end if;
      insert into recurrence_rules (
        company_id, author_id, assignee_id, title, body, priority, rrule, is_active, next_run_at
      ) values (
        v_company, v_user, v_assignee, v_entity->>'title', null, 'normal',
        v_entity->>'rrule', true, p_now
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
      elsif v_amount is null or v_amount <= 0 then
        -- taking points away by voice is forbidden (D-30)
        v_skipped := v_skipped || jsonb_build_object('kind', v_kind, 'reason', 'points_blocked');
      else
        insert into point_transactions (company_id, user_id, amount, reason, source, actor_id)
        values (v_company, v_assignee, v_amount,
                coalesce(nullif(v_entity->>'reason', ''), 'от директора'), 'manual', v_user)
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

-- ---------------------------------------------------------------------------
-- Старые строки `reminders` — в заметки. Связь — client_request_id = id напоминания,
-- так повторный прогон ничего не удваивает. Прошедшие и отправленные помечены как
-- сработавшие: пачка давних напоминаний не должна прозвенеть разом после выката.
-- ---------------------------------------------------------------------------
insert into notes (company_id, user_id, text, remind_at, reminded_at, client_request_id, created_at)
select r.company_id, r.user_id, r.text, r.remind_at,
       case when r.remind_at is not null and (r.sent or r.remind_at <= now()) then now() end,
       r.id, r.created_at
  from reminders r
 where not exists (select 1 from notes n where n.client_request_id = r.id);

comment on table reminders is 'retired by D-95: a reminder is a note with remind_at; kept for history, nothing writes here';
