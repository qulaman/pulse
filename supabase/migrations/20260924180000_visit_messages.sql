-- «Сообщение на экран» (D-116): секретарь пишет директору — на стене в кабинете та же
-- надпись во всю стену, что у «К вам посетитель» (D-96), у директора пуш и одна кнопка
-- «Понятно», у секретаря квитанция стены и «Директор прочитал».
--
-- Зачем в `visits`, а не своя таблица: сообщение идёт ровно тем путём, что посетитель, —
-- секретарь → стена и телефон директора → ответ → квитанция. Версия `tv_state` (`tv_touch`),
-- отметка `shown_at` из `tv_heartbeat`, outbox, минутный свип, Realtime и RLS у визита уже
-- есть. Новое — вид строки (`kind`) и ответ «прочитал» (`read`); у сообщения автомат ещё
-- короче: `waiting → read | expired`, `closed_at` — секретарь убрал карточку.
--
-- Заодно (D-116 §1): «Пусть заходит» больше не пишет на стене «Заходите». Экран висит в
-- кабинете, посетитель стоит в приёмной — надпись не видел никто. Надпись о посетителе
-- просто уходит, стена включает гостя (D-96 §5) — это и видит входящий. `tv_overlay`
-- больше не отдаёт только что приглашённый визит.
--
-- Гость в кабинете (D-33): текст сообщения на стену не приезжает — только «Сообщение от
-- секретаря», слова — в телефоне директора. Имя секретаря на стене не пишется вовсе.
--
-- Пуш о сообщении — `visit_message`, категория «Секретарь» (`delivery_category` берёт всё
-- `visit_%`): в отличие от посетителя, «Не беспокоить» и встречу директора он не пробивает —
-- человек у стола не стоит. Секретарю пуш — только если директор так и не прочитал: «прочитал»
-- её карточка показывает живьём, повторять это пушем незачем.

-- ---------------------------------------------------------------------------
-- 1. Вид визита и ответ «прочитал»
-- ---------------------------------------------------------------------------
alter table visits
  add column kind text not null default 'visitor' check (kind in ('visitor', 'message'));

comment on column visits.kind is 'visitor = «к вам посетитель» (D-96); message = the secretary''s words on the wall (D-116)';

-- the status check was declared inline and is named by Postgres: find it by its text
do $$
declare
  v_name text;
begin
  for v_name in
    select conname from pg_constraint
     where conrelid = 'visits'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table visits drop constraint %I', v_name);
  end loop;
end
$$;

alter table visits add constraint visits_status_check check (
  (kind = 'visitor' and status in ('waiting', 'wait', 'invited', 'declined', 'expired'))
  or (kind = 'message' and status in ('waiting', 'read', 'expired'))
);

-- a message is its words: an empty one is never sent
alter table visits add constraint visits_message_note_check check (kind <> 'message' or note is not null);

-- ---------------------------------------------------------------------------
-- 2. Outbox (принцип 8): о сообщении — директору; секретарю — только «не прочитал»
-- ---------------------------------------------------------------------------
create or replace function notify_outbox_visit() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_title text;
begin
  if tg_op = 'INSERT' then
    insert into notification_deliveries (company_id, user_id, event_kind, meta)
    select new.company_id, p.id,
           case when new.kind = 'message' then 'visit_message' else 'visit_arrived' end,
           jsonb_build_object(
             'title', case when new.kind = 'message' then 'Сообщение от секретаря' else 'К вам посетитель' end,
             'body', coalesce(new.note, ''),
             'visit_id', new.id,
             'url', '/pulse')
      from profiles p
     where p.company_id = new.company_id and p.role = 'director' and p.is_active;
    return null;
  end if;

  -- the card put away before anybody answered: the push that has not left yet is dropped
  if new.closed_at is not null and old.closed_at is null and new.status in ('waiting', 'wait') then
    delete from notification_deliveries
     where status = 'queued' and meta->>'visit_id' = new.id::text;
    return null;
  end if;

  if new.status is not distinct from old.status then
    return null;
  end if;

  if new.kind = 'message' then
    -- read on the wall or on the remote: a push still waiting in a digest or a quiet hour
    -- would only repeat words the director has already seen
    if new.status = 'read' then
      delete from notification_deliveries
       where status = 'queued' and claimed_at is null and event_kind = 'visit_message'
         and meta->>'visit_id' = new.id::text;
      return null;
    end if;
    v_title := case new.status when 'expired' then 'Директор не прочитал' end;
  else
    v_title := case new.status
                 when 'invited'  then 'Директор: пусть заходит'
                 when 'wait'     then 'Директор просит подождать'
                 when 'declined' then 'Директор не примет'
                 when 'expired'  then 'Директор не ответил'
               end;
  end if;
  if v_title is null then
    return null;
  end if;

  insert into notification_deliveries (company_id, user_id, event_kind, meta)
  values (new.company_id, new.author_id, 'visit_answered',
          jsonb_build_object(
            'title', v_title,
            'body', coalesce(new.note, 'Посетитель'),
            'visit_id', new.id,
            'url', '/feed'));
  return null;
end
$fn$;

-- ---------------------------------------------------------------------------
-- 3. announce_visit — теперь и сообщение: `p_kind = 'message'`, слова обязательны.
--    Старая подпись (text, uuid) уходит, иначе вызов с двумя именованными аргументами
--    стал бы неоднозначным.
-- ---------------------------------------------------------------------------
drop function if exists announce_visit(text, uuid);

create function announce_visit(
  p_note text default null,
  client_request_id uuid default null,
  p_kind text default 'visitor'
) returns visits
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid    uuid := client_request_id;      -- the parameter shadows a column name
  v_company uuid := auth_company_id();
  v_row     visits;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
  v_kind    text := coalesce(p_kind, 'visitor');
begin
  if auth_role() is distinct from 'secretary' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_kind not in ('visitor', 'message') then
    raise exception 'bad_kind' using errcode = 'P0001';
  end if;
  if v_note is not null and char_length(v_note) > 120 then
    v_note := left(v_note, 120);
  end if;
  if v_kind = 'message' and v_note is null then
    raise exception 'empty_message' using errcode = 'P0001';
  end if;

  if v_crid is not null then
    select * into v_row from visits v where v.client_request_id = v_crid and v.company_id = v_company;
    if found then
      return v_row;
    end if;
  end if;

  insert into visits (company_id, author_id, note, client_request_id, kind)
  values (v_company, auth.uid(), v_note, v_crid, v_kind)
  returning * into v_row;

  update visits v set tv_version = tv_touch(v_company) where v.id = v_row.id
  returning * into v_row;
  return v_row;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. answer_visit — посетителю дверь («пусть заходит / подождёт / не приму»), сообщению —
--    «прочитал». Чужой ответ другому виду — `bad_answer`.
-- ---------------------------------------------------------------------------
create or replace function answer_visit(p_id uuid, p_answer text) returns visits
language plpgsql security definer set search_path = public
as $fn$
declare
  v_company uuid := auth_company_id();
  v_row     visits;
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_answer not in ('invited', 'wait', 'declined', 'read') then
    raise exception 'bad_answer' using errcode = 'P0001';
  end if;

  select * into v_row from visits v where v.id = p_id and v.company_id = v_company for update;
  if not found then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if (v_row.kind = 'message') <> (p_answer = 'read') then
    raise exception 'bad_answer' using errcode = 'P0001';
  end if;

  -- the same answer twice is the same visit (an absolute state, D-76 §3)
  if v_row.status = p_answer then
    return v_row;
  end if;
  if v_row.closed_at is not null or v_row.status not in ('waiting', 'wait') then
    raise exception 'bad_transition' using errcode = 'P0001';
  end if;

  update visits v
     set status = p_answer, answered_by = auth.uid(), answered_at = now(),
         tv_version = tv_touch(v_company, case when p_answer = 'invited' then 60 end)
   where v.id = p_id
  returning * into v_row;
  return v_row;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. visits_due_expiry — сообщение без «Понятно» уходит со стены через 30 минут
--    (посетитель — через 20, после «Подождёт» — через час).
-- ---------------------------------------------------------------------------
create or replace function visits_due_expiry(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_visit visits;
  v_count int := 0;
begin
  for v_visit in
    select * from visits v
     where v.closed_at is null
       and ((v.status = 'waiting'
             and v.created_at <= p_now - case when v.kind = 'message' then interval '30 minutes' else interval '20 minutes' end)
         or (v.status = 'wait' and coalesce(v.answered_at, v.created_at) <= p_now - interval '60 minutes'))
     order by v.created_at
     for update skip locked
  loop
    update visits v set status = 'expired', tv_version = tv_touch(v_visit.company_id)
     where v.id = v_visit.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 6. tv_overlay — что висит поверх любой сцены: посетитель, который ждёт ответа, и
--    непрочитанное сообщение секретаря. Приглашённый визит больше не отдаётся (§1).
--    Гостю — без слов секретаря (D-33).
-- ---------------------------------------------------------------------------
create or replace function tv_overlay() returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_company   uuid;
  v_state     tv_state;
  v_guest     boolean := false;
  v_visit     visits;
  v_has_visit boolean;
  v_waiting   int;
  v_message   visits;
  v_has_msg   boolean;
  v_messages  int;
begin
  if auth_role() not in ('tv', 'director') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  v_company := auth_company_id();

  select * into v_state from tv_state where company_id = v_company;
  if found then
    v_guest := tv_guest_on(v_state);
  end if;

  select * into v_visit from visits v
   where v.company_id = v_company and v.closed_at is null and v.kind = 'visitor'
     and v.status in ('waiting', 'wait')
   order by (v.status = 'waiting') desc, v.created_at desc
   limit 1;
  v_has_visit := found;

  select count(*) into v_waiting from visits v
   where v.company_id = v_company and v.closed_at is null and v.kind = 'visitor'
     and v.status in ('waiting', 'wait');

  -- the newest words first: the older ones are on the director's phone too
  select * into v_message from visits v
   where v.company_id = v_company and v.closed_at is null and v.kind = 'message'
     and v.status = 'waiting'
   order by v.created_at desc
   limit 1;
  v_has_msg := found;

  select count(*) into v_messages from visits v
   where v.company_id = v_company and v.closed_at is null and v.kind = 'message'
     and v.status = 'waiting';

  return jsonb_build_object(
    'visit', case when v_has_visit then jsonb_build_object(
      'id', v_visit.id,
      'status', v_visit.status,
      'note', case when v_guest then null else v_visit.note end,
      'created_at', v_visit.created_at,
      'answered_at', v_visit.answered_at
    ) end,
    'waiting', v_waiting,
    'message', case when v_has_msg then jsonb_build_object(
      'id', v_message.id,
      'note', case when v_guest then null else v_message.note end,
      'created_at', v_message.created_at
    ) end,
    'messages', v_messages
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 7. Гранты: новая подпись объявления; остальные функции пересозданы на месте и свои
--    гранты сохранили.
-- ---------------------------------------------------------------------------
revoke execute on function announce_visit(text, uuid, text) from public, anon;
grant execute on function announce_visit(text, uuid, text) to authenticated, service_role;
