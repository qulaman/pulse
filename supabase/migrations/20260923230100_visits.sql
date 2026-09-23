-- «К вам посетитель» (D-96): секретарь нажимает кнопку — на стене в кабинете директора
-- надпись, у директора пуш и три кнопки ответа, у секретаря ответ и квитанция.
--
-- Зачем своя сущность, а не заявка (`errands`): заявка — просьба директора секретарю, у
-- неё свой автомат и своя приватность (D-79 §7: заявки на стену не выносятся). Визит идёт
-- в обратную сторону — от секретаря к директору — и его смысл как раз в том, чтобы
-- оказаться на стене. Автомат короткий: `waiting → wait → invited | declined`, либо
-- `expired`, если никто не ответил; `closed_at` — секретарь убрал карточку («Готово»,
-- «Отменить», «Понятно»).
--
-- Зачем стену трогает функция, а не триггер на `tv_state`: каждое изменение визита, которое
-- меняет картинку на стене, поднимает `tv_state.version` — киоск и так слушает эту строку
-- (D-76 §1), и квитанция экрана (принцип 8) работает для визита даром: киоск отмечает
-- показанную версию, `tv_heartbeat` ставит визиту `shown_at`, секретарь видит «На экране у
-- директора». Роль `tv` таблицу `visits` не читает — текст надписи отдаёт `tv_overlay()`.
--
-- Зачем «Пусть заходит» включает гостя на стене: посетитель сейчас войдёт в кабинет, где
-- висит экран. Маска D-33 включается сама на час (`tv_state.guest_until`), ручной
-- переключатель на пульте её перебивает.
--
-- Зачем визиты мимо окна доставки (D-38): человек стоит у стола секретаря сейчас.
-- `notification_deliveries_deliver_after()` не трогается — незнакомый ему вид уходит сразу.
--
-- Идемпотентность (принцип 7): объявление — новая строка, поэтому `client_request_id` с
-- уникальным индексом; ответ и закрытие — абсолютные состояния («сделай визит таким»),
-- повтор безвреден — то же исключение, что D-76 §3.
--
-- Негатив на стену не выносится (D-45): ответ «Не приму» просто убирает надпись, имя
-- сотрудника на стене не появляется вовсе — только текст секретаря, и тот гостю не виден.

-- ---------------------------------------------------------------------------
-- 1. Таблица
-- ---------------------------------------------------------------------------
create table visits (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies,
  author_id         uuid not null references profiles,          -- the secretary who announced
  note              text check (note is null or char_length(note) <= 120), -- «Иванов, по поставкам»
  status            text not null default 'waiting'
                    check (status in ('waiting', 'wait', 'invited', 'declined', 'expired')),
  answered_by       uuid references profiles,
  answered_at       timestamptz,
  tv_version        int,                                         -- tv_state.version that carried the notice
  shown_at          timestamptz,                                 -- the wall acked that version
  closed_at         timestamptz,                                 -- the secretary put the card away
  client_request_id uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table visits is 'secretary → director: «к вам посетитель»; shown on the wall in the office, answered by the director (D-96)';
comment on column visits.shown_at is 'receipt of the wall: the kiosk rendered the tv_state version that carried this visit';

create trigger trg_visits_updated_at
  before update on visits
  for each row execute function moddatetime(updated_at);

create index visits_company_live_idx on visits (company_id, created_at desc) where closed_at is null;
create unique index visits_client_request_idx on visits (client_request_id) where client_request_id is not null;

-- ---------------------------------------------------------------------------
-- 2. RLS: читают директор и секретари компании; `tv` и остальные — никогда.
--    Политик на запись нет вовсе: визит живёт только через функции ниже.
-- ---------------------------------------------------------------------------
alter table visits enable row level security;

create policy visits_select on visits for select using (
  company_id = (select auth_company_id())
  and (select auth_role()) in ('director', 'secretary')
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'visits'
  ) then
    alter publication supabase_realtime add table visits;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3. Стена узнаёт о визите: версия строки `tv_state` +1. Строку создаёт, если пульт
--    ещё ни разу не командовал.
-- ---------------------------------------------------------------------------
create or replace function tv_touch(p_company uuid, p_guest_minutes int default null) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_version int;
begin
  insert into tv_state as s (company_id, version, guest, guest_until, updated_at)
  values (p_company, 1,
          p_guest_minutes is not null,
          case when p_guest_minutes is not null then now() + make_interval(mins => p_guest_minutes) end,
          now())
  on conflict (company_id) do update set
    version     = s.version + 1,
    -- a visit invited in turns guest mode on for a while — unless a hand already switched
    -- it on for good (guest without a timer stays as it is)
    guest       = case when p_guest_minutes is not null then true else s.guest end,
    guest_until = case
                    when p_guest_minutes is null then s.guest_until
                    when s.guest and s.guest_until is null then null
                    else now() + make_interval(mins => p_guest_minutes)
                  end,
    updated_at  = now()
  returning version into v_version;
  return v_version;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Outbox (принцип 8): о приходе — директору, об ответе — секретарю
-- ---------------------------------------------------------------------------
create or replace function notify_outbox_visit() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_title text;
begin
  if tg_op = 'INSERT' then
    insert into notification_deliveries (company_id, user_id, event_kind, meta)
    select new.company_id, p.id, 'visit_arrived',
           jsonb_build_object(
             'title', 'К вам посетитель',
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

  v_title := case new.status
               when 'invited'  then 'Директор: пусть заходит'
               when 'wait'     then 'Директор просит подождать'
               when 'declined' then 'Директор не примет'
               when 'expired'  then 'Директор не ответил'
             end;
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

create trigger trg_notify_outbox_visit
  after insert or update of status, closed_at on visits
  for each row execute function notify_outbox_visit();

-- ---------------------------------------------------------------------------
-- 5. announce_visit — секретарь: «К вам посетитель». Повтор того же запроса отдаёт
--    ту же строку.
-- ---------------------------------------------------------------------------
create or replace function announce_visit(p_note text default null, client_request_id uuid default null)
returns visits
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid    uuid := client_request_id;      -- the parameter shadows a column name
  v_company uuid := auth_company_id();
  v_row     visits;
  v_note    text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if auth_role() is distinct from 'secretary' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_note is not null and char_length(v_note) > 120 then
    v_note := left(v_note, 120);
  end if;

  if v_crid is not null then
    select * into v_row from visits v where v.client_request_id = v_crid and v.company_id = v_company;
    if found then
      return v_row;
    end if;
  end if;

  insert into visits (company_id, author_id, note, client_request_id)
  values (v_company, auth.uid(), v_note, v_crid)
  returning * into v_row;

  update visits v set tv_version = tv_touch(v_company) where v.id = v_row.id
  returning * into v_row;
  return v_row;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 6. answer_visit — директор: пусть заходит / подождёт / не приму. «Подождёт» можно
--    сменить на «пусть заходит» или «не приму»; решённое — окончательно.
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
  if p_answer not in ('invited', 'wait', 'declined') then
    raise exception 'bad_answer' using errcode = 'P0001';
  end if;

  select * into v_row from visits v where v.id = p_id and v.company_id = v_company for update;
  if not found then
    raise exception 'forbidden' using errcode = 'P0001';
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
-- 7. close_visit — карточка убрана: секретарь («Готово», «Отменить», «Понятно») или
--    директор. Повтор безвреден.
-- ---------------------------------------------------------------------------
create or replace function close_visit(p_id uuid) returns visits
language plpgsql security definer set search_path = public
as $fn$
declare
  v_company uuid := auth_company_id();
  v_row     visits;
begin
  if auth_role() not in ('secretary', 'director') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select * into v_row from visits v where v.id = p_id and v.company_id = v_company for update;
  if not found then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_row.closed_at is not null then
    return v_row;
  end if;

  update visits v
     set closed_at = now(),
         -- the notice leaves the wall only if it was on it
         tv_version = case when v.status in ('waiting', 'wait') then tv_touch(v_company) else v.tv_version end
   where v.id = p_id
  returning * into v_row;
  return v_row;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 8. visits_due_expiry — минутный тик POST /api/push/sweep: визит без ответа 20 минут
--    (после «Подождёт» — час) гаснет, секретарь узнаёт «Директор не ответил».
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
       and ((v.status = 'waiting' and v.created_at <= p_now - interval '20 minutes')
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
-- 9. tv_overlay — что висит поверх любой сцены стены: визит, который ждёт ответа
--    (или только что приглашён — «Заходите» на несколько секунд). Гостю — без текста
--    секретаря (D-33: названия контрагентов не показываются).
-- ---------------------------------------------------------------------------
create or replace function tv_overlay() returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_company uuid;
  v_state   tv_state;
  v_guest   boolean := false;
  v_visit   visits;
  v_waiting int;
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
   where v.company_id = v_company and v.closed_at is null
     and (v.status in ('waiting', 'wait')
          or (v.status = 'invited' and v.answered_at > now() - interval '15 seconds'))
   order by (v.status = 'waiting') desc, v.created_at desc
   limit 1;

  if not found then
    return jsonb_build_object('visit', null, 'waiting', 0);
  end if;

  select count(*) into v_waiting from visits v
   where v.company_id = v_company and v.closed_at is null and v.status in ('waiting', 'wait');

  return jsonb_build_object(
    'visit', jsonb_build_object(
      'id', v_visit.id,
      'status', v_visit.status,
      'note', case when v_guest then null else v_visit.note end,
      'created_at', v_visit.created_at,
      'answered_at', v_visit.answered_at
    ),
    'waiting', v_waiting
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 10. tv_heartbeat — та же квитанция экрана (20260918100000), плюс отметка визитам:
--     стена показала версию, которая их несла.
-- ---------------------------------------------------------------------------
create or replace function tv_heartbeat(p_applied_version int default null) returns void
language plpgsql security definer set search_path = public
as $fn$
declare
  v_company uuid;
begin
  if auth_role() is distinct from 'tv' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  v_company := auth_company_id();

  insert into tv_state as s (company_id, seen_at, applied_version)
  values (v_company, now(), p_applied_version)
  on conflict (company_id) do update set
    seen_at         = now(),
    applied_version = coalesce(excluded.applied_version, s.applied_version);

  if p_applied_version is not null then
    update visits v set shown_at = now()
     where v.company_id = v_company and v.shown_at is null and v.closed_at is null
       and v.tv_version is not null and v.tv_version <= p_applied_version;
  end if;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 11. Гранты: люди зовут объявление, ответ и закрытие; тик — только свип;
--     tv_touch — только изнутри функций выше.
-- ---------------------------------------------------------------------------
revoke execute on function tv_touch(uuid, int) from public, anon, authenticated;
revoke execute on function announce_visit(text, uuid) from public, anon;
revoke execute on function answer_visit(uuid, text) from public, anon;
revoke execute on function close_visit(uuid) from public, anon;
revoke execute on function visits_due_expiry(timestamptz) from public, anon, authenticated;
revoke execute on function tv_overlay() from public, anon;

grant execute on function tv_touch(uuid, int) to service_role;
grant execute on function announce_visit(text, uuid) to authenticated, service_role;
grant execute on function answer_visit(uuid, text) to authenticated, service_role;
grant execute on function close_visit(uuid) to authenticated, service_role;
grant execute on function visits_due_expiry(timestamptz) to service_role;
grant execute on function tv_overlay() to authenticated, service_role;
