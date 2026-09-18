-- Календарь и мероприятия (наряд 014A, решение D-78).
--
-- Зачем своя сущность, а не `announcement` и не `reminders`: у мероприятия есть время
-- начала, место и состав участников, и каждый из них отвечает за себя. Напоминание
-- живёт ради момента срабатывания, объявление — ради текста; встреча — ради людей,
-- которые на неё придут.
--
-- Зачем участники списком, а не копиями: задача копируется на каждого адресата (D-02),
-- потому что каждый отвечает за свою; мероприятие одно на всех, и копия ломала бы счёт
-- «4 из 6 будут». Одна строка `events` и N строк `event_participants`.
--
-- Зачем автор всегда участник со статусом `going`: он сам назначил встречу, он на ней
-- будет, и напоминание должно прийти и ему.
--
-- Зачем видимость «директор — всё, остальные — своё»: состав встречи не является общим
-- списком компании. Роль `tv` не читает ни одну из двух таблиц вовсе: стена получает
-- мероприятия через `tv_summary()` и `tv_events`, где название маскируется гостю (D-33).
--
-- Зачем outbox, а не прямой push: доставка в этом продукте всегда с квитанциями
-- (CLAUDE.md принцип 8). Приглашение, перенос и отмена ждут окна доставки; напоминание
-- уходит сразу — его момент выбрал директор, а не система.
--
-- Зачем `reminded_at` в самой строке: тик напоминаний идемпотентен без отдельной
-- таблицы, а перенос времени обнуляет отметку — напоминание сработает заново.
--
-- Чего здесь нет: негатива на стене (D-45) — отказ участника остаётся между ним и
-- автором, в `tv_events` уходит только «скоро начнётся».

-- ---------------------------------------------------------------------------
-- 1. Таблицы
-- ---------------------------------------------------------------------------
create table events (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies,
  author_id         uuid not null references profiles,
  title             text not null,
  body              text,                       -- agenda / «не опаздывать»
  location          text,
  starts_at         timestamptz not null,
  ends_at           timestamptz,                -- null = no fixed end
  remind_before_min int not null default 30 check (remind_before_min between 0 and 1440),
  everyone          boolean not null default false,  -- display only; participants are materialised
  reminded_at       timestamptz,                -- set once by events_due_reminders; reset when starts_at moves
  cancelled_at      timestamptz,
  audio_path        text,                       -- voice bucket; never edited
  source_transcript text,
  inbox_item_id     uuid references inbox_items on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table events is 'a meeting or an outing the director set by voice; participants are one row each (not copies, unlike tasks D-02)';

create table event_participants (
  event_id     uuid not null references events on delete cascade,
  user_id      uuid not null references profiles on delete cascade,
  status       text not null default 'invited' check (status in ('invited','going','declined')),
  reason       text,                            -- «Не смогу» — why
  responded_at timestamptz,
  created_at   timestamptz not null default now(),
  primary key (event_id, user_id)
);

comment on table event_participants is 'who is invited and what they answered; the author is always a participant with status going';

create trigger trg_events_updated_at
  before update on events
  for each row execute function moddatetime(updated_at);

-- the calendar of one company: what lies ahead, cancelled meetings aside
create index events_company_starts_idx on events (company_id, starts_at) where cancelled_at is null;
-- the minute tick: what still owes a reminder
create index events_due_idx on events (starts_at) where reminded_at is null and cancelled_at is null;
create index event_participants_user_idx on event_participants (user_id);

-- ---------------------------------------------------------------------------
-- 2. Видимость: две security definer функции, чтобы политики двух таблиц не
--    ссылались друг на друга (иначе Postgres падает с infinite recursion in policy)
-- ---------------------------------------------------------------------------
create or replace function is_event_participant(p_event uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from event_participants
     where event_id = p_event and user_id = auth.uid()
  )
$$;

create or replace function can_see_event(p_event uuid) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from events e
     where e.id = p_event
       and e.company_id = auth_company_id()
       and (auth_role() = 'director' or e.author_id = auth.uid() or is_event_participant(p_event))
  )
$$;

revoke execute on function is_event_participant(uuid) from public, anon;
revoke execute on function can_see_event(uuid) from public, anon;
grant execute on function is_event_participant(uuid) to authenticated, service_role;
grant execute on function can_see_event(uuid) to authenticated, service_role;

alter table events enable row level security;
alter table event_participants enable row level security;

-- директор видит календарь компании; остальные — только то, куда позваны или что созвали
create policy events_select on events for select using (
  company_id = auth_company_id()
  and auth_role() <> 'tv'
  and (auth_role() = 'director' or author_id = auth.uid() or is_event_participant(id))
);

-- правит мероприятие только директор: заголовок, время, место, повод, отмену.
-- политик insert/delete нет вовсе — создаёт confirm_voice_batch, чистит db:clean
create policy events_update on events for update
using (
  company_id = auth_company_id() and auth_role() = 'director'
)
with check (
  company_id = auth_company_id() and auth_role() = 'director'
);

-- состав своего мероприятия видит каждый участник; пишут только RPC
create policy event_participants_select on event_participants for select using (
  auth_role() <> 'tv' and can_see_event(event_id)
);

-- Realtime: приглашение и перенос долетают до открытого календаря без перезагрузки.
-- Guard — как в 20260910120000_realtime_publication.sql: миграция обязана быть
-- переигрываемой на всём флоте (V-02).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'events'
  ) then
    alter publication supabase_realtime add table events;
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'event_participants'
  ) then
    alter publication supabase_realtime add table event_participants;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Outbox: приглашение, перенос, отмена (образец meta — notify_outbox_task)
-- ---------------------------------------------------------------------------
create or replace function notify_outbox_event_participant() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_event events%rowtype;
begin
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

create trigger trg_notify_outbox_event_participant
  after insert on event_participants
  for each row execute function notify_outbox_event_participant();

create or replace function notify_outbox_event() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  -- перенос: знать обязаны все, кто собирался прийти
  if new.starts_at is distinct from old.starts_at and new.cancelled_at is null then
    insert into notification_deliveries (company_id, user_id, event_kind, meta)
    select new.company_id, ep.user_id, 'event_moved',
           jsonb_build_object(
             'title', 'Перенос',
             'body', left(new.title, 80) || ' · ' ||
                     to_char(new.starts_at at time zone 'Asia/Aqtobe', 'DD.MM HH24:MI'),
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

create trigger trg_notify_outbox_event
  after update on events
  for each row execute function notify_outbox_event();

-- перенос обнуляет отметку: напоминание сработает заново, по новому времени
create or replace function events_reset_reminder() returns trigger
language plpgsql set search_path = public
as $fn$
begin
  if new.starts_at is distinct from old.starts_at then
    new.reminded_at := null;
  end if;
  return new;
end
$fn$;

create trigger trg_events_reset_reminder
  before update on events
  for each row execute function events_reset_reminder();

-- ---------------------------------------------------------------------------
-- 4. Тихие часы: приглашение, перенос и отмена ждут окна доставки; напоминание
--    («Скоро») и «не сможет» уходят сразу — их момент выбрал человек, а не система.
--    Тело целиком из 20260917170000_shop_fixes.sql плюс три вида мероприятия.
-- ---------------------------------------------------------------------------
create or replace function notification_deliveries_deliver_after() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  -- what reaches an employee's phone waits for the window; the director's own alerts and a
  -- task whose moment the producer already decided (batch / «отправить сейчас» / scheduled
  -- reassign) do not
  if new.event_kind in ('reply', 'rework', 'done', 'revoked', 'deadline_extended', 'announcement',
                        'shop_approved', 'shop_ready', 'shop_cancelled',
                        'event_invite', 'event_moved', 'event_cancelled') then
    new.deliver_after := coalesce(next_delivery_slot(new.company_id, now()), now());
  end if;
  -- a message to somebody who is not the task's author is a message to an employee
  if new.event_kind = 'message' and exists (
       select 1 from tasks t where t.id = new.task_id and t.author_id <> new.user_id
     ) then
    new.deliver_after := coalesce(next_delivery_slot(new.company_id, now()), now());
  end if;
  return new;
end
$fn$;

-- ---------------------------------------------------------------------------
-- 5. Стена узнаёт о мероприятии тем же каналом, что о задачах
-- ---------------------------------------------------------------------------
do $$
declare
  v_name text;
begin
  select conname into v_name from pg_constraint
   where conrelid = 'tv_events'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) like '%task_sent%';
  if v_name is not null then
    execute format('alter table tv_events drop constraint %I', v_name);
  end if;
  alter table tv_events add constraint tv_events_kind_check check (kind in (
    'task_sent','task_accepted','task_review','task_done',
    'points','announcement','merch','event'));
end
$$;

-- ---------------------------------------------------------------------------
-- 6. confirm_voice_batch — пересоздана целиком (тело 20260917200000_notes.sql плюс
--    ветка `event`): подтверждённое мероприятие становится строкой `events`, автор
--    сразу участник со статусом going, «всем» материализуется составом компании.
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
      insert into reminders (company_id, user_id, text, remind_at)
      values (v_company, v_user, v_entity->>'text',
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
-- 7. respond_event -- «Буду» / «Не смогу»: абсолютное состояние, повтор безвреден,
--    поэтому client_request_id не заводится (то же исключение, что в D-76 §3).
-- ---------------------------------------------------------------------------
create or replace function respond_event(
  p_event uuid,
  p_status text,
  p_reason text default null
) returns event_participants
language plpgsql security definer set search_path = public
as $fn$
declare
  v_event events%rowtype;
  v_row   event_participants%rowtype;
  v_user  uuid := auth.uid();
  v_name  text;
begin
  if p_status not in ('going', 'declined') then
    raise exception 'bad_status' using errcode = 'P0001';
  end if;

  select * into v_event from events
   where id = p_event and company_id = auth_company_id() and cancelled_at is null;
  if v_event.id is null then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  -- отвечает только тот, кого позвали: чужое мероприятие ответа не принимает
  update event_participants
     set status       = p_status,
         reason       = case when p_status = 'declined' then nullif(p_reason, '') else null end,
         responded_at = now()
   where event_id = p_event and user_id = v_user
  returning * into v_row;

  if v_row.event_id is null then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  -- автор узнаёт об отказе сразу: состав встречи меняется здесь и сейчас
  if p_status = 'declined' and v_event.author_id <> v_user then
    select split_part(full_name, ' ', 1) into v_name from profiles where id = v_user;
    insert into notification_deliveries (company_id, user_id, event_kind, meta)
    values (v_event.company_id, v_event.author_id, 'event_declined',
            jsonb_build_object(
              'title', 'Не сможет',
              'body', coalesce(v_name, 'Сотрудник') || ' · ' || left(v_event.title, 80) ||
                      coalesce(': ' || v_row.reason, ''),
              'url', '/calendar?e=' || v_event.id));
  end if;

  return v_row;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 8. set_event_participants -- состав правит только директор
-- ---------------------------------------------------------------------------
create or replace function set_event_participants(
  p_event uuid,
  p_add uuid[] default '{}',
  p_remove uuid[] default '{}'
) returns void
language plpgsql security definer set search_path = public
as $fn$
declare
  v_event events%rowtype;
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select * into v_event from events
   where id = p_event and company_id = auth_company_id();
  if v_event.id is null then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  -- somebody else's company or an inactive person is skipped silently (D-56)
  insert into event_participants (event_id, user_id)
  select p_event, p.id from profiles p
   where p.id = any(coalesce(p_add, '{}'::uuid[]))
     and p.company_id = v_event.company_id and p.is_active and p.role <> 'tv'
  on conflict do nothing;

  -- the author stays: it is their meeting
  delete from event_participants
   where event_id = p_event
     and user_id = any(coalesce(p_remove, '{}'::uuid[]))
     and user_id <> v_event.author_id;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 9. events_due_reminders -- минутный тик: зовёт его свип POST /api/push/sweep
--    сервисным ключом. Идемпотентность держится на events.reminded_at, а не на
--    расписании: повторный вызов той же минуты не шлёт ничего второй раз.
-- ---------------------------------------------------------------------------
create or replace function events_due_reminders(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_event events%rowtype;
  v_count int := 0;
begin
  for v_event in
    select * from events e
     where e.cancelled_at is null
       and e.reminded_at is null
       and e.starts_at - make_interval(mins => e.remind_before_min) <= p_now
       -- после долгого простоя вчерашние встречи не спамят
       and e.starts_at > p_now - interval '1 hour'
     order by e.starts_at
     for update skip locked
  loop
    insert into notification_deliveries (company_id, user_id, event_kind, meta)
    select v_event.company_id, ep.user_id, 'event_reminder',
           jsonb_build_object(
             'title', 'Скоро',
             'body', left(v_event.title, 80) || ' · ' ||
                     to_char(v_event.starts_at at time zone 'Asia/Aqtobe', 'HH24:MI') ||
                     coalesce(' · ' || v_event.location, ''),
             'url', '/calendar?e=' || v_event.id)
      from event_participants ep
     where ep.event_id = v_event.id and ep.status <> 'declined';

    -- стена узнаёт тем же каналом, что о задачах; гостю названия нет (D-33)
    perform tv_emit(v_event.company_id, 'event', null, null, v_event.title, null, null);

    update events set reminded_at = p_now where id = v_event.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$fn$;

revoke execute on function respond_event(uuid, text, text) from public, anon;
revoke execute on function set_event_participants(uuid, uuid[], uuid[]) from public, anon;
revoke execute on function events_due_reminders(timestamptz) from public, anon, authenticated;

grant execute on function respond_event(uuid, text, text) to authenticated, service_role;
grant execute on function set_event_participants(uuid, uuid[], uuid[]) to authenticated, service_role;
-- тик зовёт только свип: у человека этой кнопки нет
grant execute on function events_due_reminders(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 10. tv_summary -- тело целиком из 20260917192000_tv_day_pulse.sql плюс ключ
--     `events`: ближайшие встречи для бегущей строки и сцены «часы».
-- ---------------------------------------------------------------------------
create or replace function tv_summary(p_guest boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_company  uuid := auth_company_id();
  v_now      timestamptz := now();
  -- сутки компании, а не UTC: в БД всё в UTC, показываем в Asia/Aqtobe (CLAUDE.md §6)
  v_day      timestamptz := date_trunc('day', v_now at time zone 'Asia/Aqtobe') at time zone 'Asia/Aqtobe';
  v_week     timestamptz := v_day - interval '6 days';
  v_settings jsonb;
begin
  if auth.uid() is not null and auth_role() not in ('tv', 'director') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_company is null then
    return '{}'::jsonb;
  end if;

  select c.settings into v_settings from companies c where c.id = v_company;

  return jsonb_build_object(
    'guest', coalesce(p_guest, false),
    'points_enabled', coalesce((v_settings->>'points_enabled')::boolean, false),
    'now', v_now,

    -- фон экрана: пульс дня — сколько событий пришлось на каждый час суток компании
    'pulse', coalesce((
      select jsonb_agg(coalesce(c.events, 0) order by c.hour)
        from (
          select h.hour,
                 (select count(*) from tv_events e
                   where e.company_id = v_company
                     and e.created_at >= v_day + make_interval(hours => h.hour)
                     and e.created_at <  v_day + make_interval(hours => h.hour + 1)) as events
            from generate_series(0, 23) h(hour)
        ) c
    ), '[]'::jsonb),

    -- ближайшие встречи: бегущая строка и сцена «часы». Гостю — ни названия, ни места (D-33)
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id,
               'title', case when p_guest then null else e.title end,
               'starts_at', e.starts_at,
               'location', case when p_guest then null else e.location end,
               'people', (select count(*) from event_participants ep
                           where ep.event_id = e.id and ep.status <> 'declined')
             ) order by e.starts_at)
        from (
          select * from events e
           where e.company_id = v_company and e.cancelled_at is null
             and e.starts_at >= v_now - interval '30 minutes'
             and e.starts_at < v_day + interval '2 days'
           order by e.starts_at limit 6
        ) e
    ), '[]'::jsonb),

    -- вердикт: только числа, ни одного имени — негатив на ТВ безличен (D-45)
    'counts', (
      select jsonb_build_object(
        'overdue',  count(*) filter (where t.deadline < v_now and t.status in ('sent','accepted','in_progress','rework')),
        'declined', count(*) filter (where t.status = 'declined'),
        'review',   count(*) filter (where t.status = 'pending_review'),
        'questions', (
          select count(distinct m.task_id)
            from task_messages m
            join tasks q on q.id = m.task_id
           where m.company_id = v_company
             and (m.meta->>'is_question')::boolean is true
             and m.meta->>'answered_at' is null
             and q.status not in ('done','revoked','declined')
        )
      )
      from tasks t where t.company_id = v_company
    ),

    -- три числа дня
    'today', (
      select jsonb_build_object(
        'sent',    count(*) filter (where t.created_at >= v_day and t.status <> 'scheduled'),
        'done',    count(*) filter (where t.status = 'done' and t.closed_at >= v_day),
        'in_work', count(*) filter (where t.status in ('sent','accepted','in_progress','rework'))
      )
      from tasks t where t.company_id = v_company
    ),

    -- карусель 1: топ-5 недели, через тот же fn_rating, что и экран «Рейтинг»
    'rating', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name',   case when p_guest then split_part(r.display_name, ' ', 1) else r.display_name end,
               -- гостю очки не показываем: остаётся порядок мест
               'points', case when p_guest then null else r.points end,
               'rank',   r.rank
             ) order by r.rank)
        from fn_rating(v_now - interval '7 days', v_now + interval '1 minute') r
       where r.rank <= 5
    ), '[]'::jsonb),

    -- карусель 2: загрузка людей — сколько на ком работы, и ни слова о долгах (D-45)
    'load', coalesce((
      select jsonb_agg(jsonb_build_object('name', l.name, 'active', l.active) order by l.sort_name)
        from (
          -- сортировочное имя остаётся внутри подзапроса: в выдачу гостю фамилия не попадает
          select case when p_guest then split_part(p.full_name, ' ', 1) else p.full_name end as name,
                 p.full_name as sort_name,
                 count(t.id) filter (where t.status in ('sent','accepted','in_progress','rework')) as active
            from profiles p
            left join tasks t on t.assignee_id = p.id and t.company_id = v_company
           where p.company_id = v_company and p.is_active
             and p.role in ('employee','manager','shopkeeper')
           group by p.id, p.full_name
        ) l
    ), '[]'::jsonb),

    -- карусель 3: неделя — сколько задач закрыто по дням (график рисуется руками, без Recharts)
    'week', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'done', d.done) order by d.day)
        from (
          select (g.day at time zone 'Asia/Aqtobe')::date as day,
                 (select count(*) from tasks t
                   where t.company_id = v_company and t.status = 'done'
                     and t.closed_at >= g.day and t.closed_at < g.day + interval '1 day') as done
            from generate_series(v_week, v_day, interval '1 day') g(day)
        ) d
    ), '[]'::jsonb),

    -- карусель 4: выдачи наград за две недели
    'merch', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name',  case when p_guest then split_part(p.full_name, ' ', 1) else p.full_name end,
               'title', i.title,
               'at',    o.delivered_at
             ) order by o.delivered_at desc)
        from orders o
        join profiles p on p.id = o.user_id
        join shop_items i on i.id = o.item_id
       where o.company_id = v_company and o.status = 'delivered'
         and o.delivered_at >= v_now - interval '14 days'
    ), '[]'::jsonb)
  );
end;
$fn$;
