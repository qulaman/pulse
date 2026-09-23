-- Доски директора (D-102, наряд 019A): пункты голосом в «Заметках», доска на стене.
--
-- Зачем пункт — строка `notes`, а не своя таблица: у заметки уже есть всё, что нужно
-- пункту, — голос сохраняется до ИИ (принцип 5), без сети мысль ждёт на телефоне
-- (D-95 §2), распознавание дописывает слова по `note_id`, «Поручить» идёт через
-- /confirm (D-75 §5), удалённое лежит в корзине 3 дня. Доска — только контейнер:
-- название и порядок. Своя таблица пунктов повторила бы эту механику целиком.
--
-- Зачем `mind_boards`, а не `boards`: «доска» в доках и коде — это доска Пульса (D-60).
--
-- Зачем приватность по автору: доска — те же мысли директора (D-75 §3). Стена получает
-- только ту доску, которую автор сам на неё поставил, и только функцией `tv_board` —
-- роль `tv` таблиц `notes` и `mind_boards` не читает.
--
-- Зачем заставка, а не режим: фокус на сотруднике (10 минут) и надпись о посетителе
-- ложатся поверх заставки, а кончившись, возвращают стену к ней. Доска — фон
-- совещания, её не должен сбрасывать зашедший сотрудник (D-102 §4).
--
-- Зачем срок до 21:00: забытая на ночь доска утром загорелась бы перед всей командой.
-- Поставленная после 21:00 живёт два часа (D-102 §6).
--
-- Зачем прятать при госте: на доске — внутренние мысли. «Пусть заходит» включает гостя
-- сам (D-96 §5), значит доска уходит со стены, когда входит посетитель; показать её
-- гостю — отдельный переключатель на пульте, `board_guest` (D-102 §7).

-- ---------------------------------------------------------------------------
-- 1. mind_boards — контейнер пунктов
-- ---------------------------------------------------------------------------
create table mind_boards (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies,
  user_id           uuid not null references profiles,
  title             text not null check (char_length(btrim(title)) between 1 and 120),
  deleted_at        timestamptz,
  client_request_id uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table mind_boards is 'director''s boards (D-102): a title and an order; the points are rows of notes with board_id';

create trigger trg_mind_boards_updated_at
  before update on mind_boards
  for each row execute function moddatetime(updated_at);

-- the list of one author: live boards, the latest touched first
create index mind_boards_user_active_idx on mind_boards (user_id, updated_at desc) where deleted_at is null;
-- idempotency of a direct insert from the client (CLAUDE.md principle 7)
create unique index mind_boards_client_request_idx on mind_boards (client_request_id) where client_request_id is not null;
-- the minute tick: what has waited in the bin long enough
create index mind_boards_trash_idx on mind_boards (deleted_at) where deleted_at is not null;

alter table mind_boards enable row level security;

-- the same condition as notes: own boards of own company, whatever the role (D-75 §3)
create policy mind_boards_select on mind_boards for select using (
  company_id = (select auth_company_id()) and user_id = (select auth.uid())
);

create policy mind_boards_insert on mind_boards for insert with check (
  company_id = (select auth_company_id()) and user_id = (select auth.uid())
);

create policy mind_boards_update on mind_boards for update
using (
  company_id = (select auth_company_id()) and user_id = (select auth.uid())
)
with check (
  company_id = (select auth_company_id()) and user_id = (select auth.uid())
);

create policy mind_boards_delete on mind_boards for delete using (
  company_id = (select auth_company_id()) and user_id = (select auth.uid())
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'mind_boards'
  ) then
    alter publication supabase_realtime add table mind_boards;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. notes — пункт доски: board_id, position, done_at
-- ---------------------------------------------------------------------------
alter table notes
  add column board_id uuid references mind_boards on delete cascade,
  add column position double precision,
  add column done_at  timestamptz,
  add constraint notes_board_position_check check (board_id is null or position is not null);

comment on column notes.board_id is 'the board this note is a point of (D-102); null = a loose thought';
comment on column notes.position is 'order of the point on its board; fractional, so a move writes one row';
comment on column notes.done_at is 'the point is ticked off on its board';

create index notes_board_idx on notes (board_id, position) where board_id is not null;

-- a point can only go onto a board of the same author: a foreign board id is refused
drop policy notes_insert on notes;
create policy notes_insert on notes for insert with check (
  company_id = (select auth_company_id()) and user_id = (select auth.uid())
  and (board_id is null or exists (
    select 1 from mind_boards b
     where b.id = board_id and b.user_id = (select auth.uid()) and b.company_id = (select auth_company_id())
  ))
);

drop policy notes_update on notes;
create policy notes_update on notes for update
using (
  company_id = (select auth_company_id()) and user_id = (select auth.uid())
)
with check (
  company_id = (select auth_company_id()) and user_id = (select auth.uid())
  and (board_id is null or exists (
    select 1 from mind_boards b
     where b.id = board_id and b.user_id = (select auth.uid()) and b.company_id = (select auth_company_id())
  ))
);

-- ---------------------------------------------------------------------------
-- 3. tv_state — доска на стене
-- ---------------------------------------------------------------------------
alter table tv_state
  add column board_id    uuid references mind_boards on delete set null,
  add column board_until timestamptz,
  add column board_guest boolean not null default false;

comment on column tv_state.board_id is 'the board on the wall while scene = board (D-102)';
comment on column tv_state.board_until is 'the board leaves the wall here: 21:00 Aqtobe, or two hours when put up at night';
comment on column tv_state.board_guest is 'the director showed the board to a guest; reset by a new board and by guest off';

do $$
declare
  v_name text;
begin
  for v_name in
    select conname from pg_constraint
     where conrelid = 'tv_state'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) like '%scene%'
  loop
    execute format('alter table tv_state drop constraint %I', v_name);
  end loop;
end
$$;

alter table tv_state add constraint tv_state_scene_check
  check (scene in ('face', 'clock', 'team', 'calendar', 'board'));

-- ---------------------------------------------------------------------------
-- 4. tv_control — контракт D-76 / D-96 / D-98 плюс доска. Доску ставит только
--    `p_board` (сцена 'board' параметром `p_scene` не принимается), и только автор.
-- ---------------------------------------------------------------------------
drop function tv_control(text, uuid, uuid, text, boolean, boolean, text, text);

create function tv_control(
  p_mode        text    default null,   -- null = unchanged
  p_employee_id uuid    default null,
  p_task_id     uuid    default null,
  p_scene       text    default null,   -- null = unchanged
  p_guest       boolean default null,   -- null = unchanged
  p_reload      boolean default false,
  p_clock       text    default null,   -- null = unchanged
  p_calendar    text    default null,   -- null = unchanged
  p_board       uuid    default null,   -- puts this board on the wall
  p_board_guest boolean default null    -- null = unchanged
) returns tv_state
language plpgsql security definer set search_path = public
as $fn$
declare
  v_company     uuid;
  v_mode        text;
  v_employee    uuid;
  v_task        uuid;
  v_expires     timestamptz;
  v_touch       boolean := false;       -- does this call move the focus at all?
  v_board_until timestamptz;
  v_row         tv_state;
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  v_company := auth_company_id();

  if p_scene is not null and p_scene not in ('face', 'clock', 'team', 'calendar') then
    raise exception 'bad_scene' using errcode = 'P0001';
  end if;
  if p_scene is not null and p_board is not null then
    raise exception 'bad_scene' using errcode = 'P0001';
  end if;
  if p_clock is not null and p_clock not in ('digital', 'analog') then
    raise exception 'bad_clock' using errcode = 'P0001';
  end if;
  if p_calendar is not null and p_calendar not in ('week', 'month') then
    raise exception 'bad_calendar' using errcode = 'P0001';
  end if;

  if p_board is not null then
    -- only the author's own live board: privacy follows the author (D-75 §3)
    if not exists (
      select 1 from mind_boards b
       where b.id = p_board and b.company_id = v_company
         and b.user_id = auth.uid() and b.deleted_at is null
    ) then
      raise exception 'bad_board' using errcode = 'P0001';
    end if;
    -- till the end of the working day; put up at night -- two hours (D-102 §6)
    if extract(hour from now() at time zone 'Asia/Aqtobe') < 21 then
      v_board_until := ((now() at time zone 'Asia/Aqtobe')::date + time '21:00') at time zone 'Asia/Aqtobe';
    else
      v_board_until := now() + interval '2 hours';
    end if;
  end if;

  if p_mode is not null then
    v_touch := true;
    if p_mode = 'employee' then
      if p_employee_id is null then
        raise exception 'bad_employee' using errcode = 'P0001';
      end if;
      if not exists (
        select 1 from profiles p
         where p.id = p_employee_id and p.company_id = v_company and p.is_active
      ) then
        raise exception 'bad_employee' using errcode = 'P0001';
      end if;
      v_mode     := 'employee';
      v_employee := p_employee_id;
      v_task     := null;
      v_expires  := now() + interval '10 minutes';

    elsif p_mode = 'task' then
      if p_task_id is null then
        raise exception 'bad_task' using errcode = 'P0001';
      end if;
      if not exists (select 1 from tasks t where t.id = p_task_id and t.company_id = v_company) then
        raise exception 'bad_task' using errcode = 'P0001';
      end if;
      v_mode     := 'task';
      v_employee := null;
      v_task     := p_task_id;
      v_expires  := now() + interval '10 minutes';

    elsif p_mode = 'ether' then
      v_mode     := 'ether';
      v_employee := null;
      v_task     := null;
      v_expires  := null;

    else
      raise exception 'bad_mode' using errcode = 'P0001';
    end if;
  end if;

  insert into tv_state as s (
    company_id, mode, employee_id, task_id, scene, guest, guest_until, clock_style, calendar_view,
    board_id, board_until, board_guest,
    expires_at, version, reload_requested_at, updated_by, updated_at
  ) values (
    v_company,
    coalesce(v_mode, 'ether'),
    v_employee,
    v_task,
    case when p_board is not null then 'board' else coalesce(p_scene, 'face') end,
    coalesce(p_guest, false),
    null,
    coalesce(p_clock, 'digital'),
    coalesce(p_calendar, 'week'),
    p_board,
    v_board_until,
    case when p_board is not null then false else coalesce(p_board_guest, false) end,
    v_expires,
    1,
    case when p_reload then now() end,
    auth.uid(),
    now()
  )
  on conflict (company_id) do update set
    mode                = case when v_touch then v_mode     else s.mode end,
    employee_id         = case when v_touch then v_employee else s.employee_id end,
    task_id             = case when v_touch then v_task     else s.task_id end,
    expires_at          = case when v_touch then v_expires  else s.expires_at end,
    scene               = case when p_board is not null then 'board' else coalesce(p_scene, s.scene) end,
    guest               = coalesce(p_guest, s.guest),
    -- a hand on the switch owns guest mode: no timer after an explicit on or off (D-96 §5)
    guest_until         = case when p_guest is not null then null else s.guest_until end,
    clock_style         = coalesce(p_clock, s.clock_style),
    calendar_view       = coalesce(p_calendar, s.calendar_view),
    -- another scene takes the board off the wall; a new board starts hidden from guests
    board_id            = case when p_board is not null then p_board
                               when p_scene is not null then null
                               else s.board_id end,
    board_until         = case when p_board is not null then v_board_until
                               when p_scene is not null then null
                               else s.board_until end,
    board_guest         = case when p_board is not null or p_scene is not null then false
                               when p_guest is not null and not p_guest then false
                               when p_board_guest is not null then p_board_guest
                               else s.board_guest end,
    version             = s.version + 1,
    reload_requested_at = case when p_reload then now() else s.reload_requested_at end,
    updated_by          = auth.uid(),
    updated_at          = now()
  returning * into v_row;

  return v_row;
end;
$fn$;

revoke execute on function tv_control(text, uuid, uuid, text, boolean, boolean, text, text, uuid, boolean) from public, anon;
grant execute on function tv_control(text, uuid, uuid, text, boolean, boolean, text, text, uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. tv_board — доска, стоящая на стене, готовой картинкой. Роль `tv` таблиц не
--    читает; гостю без `board_guest` — только «скрыта» (D-33); пометки у пунктов
--    нейтральные: имя исполнителя и «сдано», без отказов и просрочек (D-45).
-- ---------------------------------------------------------------------------
create function tv_board(p_guest boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_state tv_state;
  v_board mind_boards;
  v_guest boolean;
  v_names boolean;
begin
  if auth_role() not in ('tv', 'director') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select * into v_state from tv_state s where s.company_id = auth_company_id();
  if not found or v_state.scene <> 'board' or v_state.board_id is null
     or v_state.board_until is null or v_state.board_until <= now() then
    return jsonb_build_object('board', null, 'hidden', false);
  end if;

  select * into v_board from mind_boards b
   where b.id = v_state.board_id and b.company_id = v_state.company_id and b.deleted_at is null;
  if not found then
    return jsonb_build_object('board', null, 'hidden', false);
  end if;

  v_guest := coalesce(p_guest, false) or tv_guest_on(v_state);
  if v_guest and not v_state.board_guest then
    return jsonb_build_object('board', null, 'hidden', true);
  end if;
  -- shown to a guest: the director's words stay, the names in the tags go (D-33)
  v_names := not v_guest;

  return jsonb_build_object(
    'hidden', false,
    'board', jsonb_build_object(
      'id', v_board.id,
      'title', v_board.title,
      'updated_at', v_board.updated_at,
      'total', (select count(*) from notes n
                 where n.board_id = v_board.id and n.deleted_at is null and btrim(n.text) <> ''),
      'done', (select count(*) from notes n
                where n.board_id = v_board.id and n.deleted_at is null and btrim(n.text) <> ''
                  and n.done_at is not null),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', p.id,
                 'text', p.text,
                 'done', p.done_at is not null,
                 'created_at', p.created_at,
                 'assignee', case when v_names and t.status is not null and t.status <> 'revoked'
                                  then split_part(pr.full_name, ' ', 1) end,
                 'handed_done', coalesce(t.status = 'done', false)
               ) order by p.position, p.created_at)
          from (
            select * from notes n
             where n.board_id = v_board.id and n.deleted_at is null and btrim(n.text) <> ''
             order by n.position, n.created_at
             limit 200
          ) p
          left join tasks t on t.id = p.converted_task_id
          left join profiles pr on pr.id = t.assignee_id
      ), '[]'::jsonb)
    )
  );
end;
$fn$;

revoke execute on function tv_board(boolean) from public, anon;
grant execute on function tv_board(boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Живьём: правка пункта трогает доску, правка доски на стене поднимает версию
--    `tv_state` (D-96 §6) — киоск перечитывает `tv_board`, нового сокета нет.
-- ---------------------------------------------------------------------------
create function mind_board_point_changed() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_board uuid := coalesce(new.board_id, old.board_id);
begin
  if v_board is null then
    return null;
  end if;
  -- the bin purge of a long-deleted point changes nothing anyone sees
  if tg_op = 'DELETE' and old.deleted_at is not null then
    return null;
  end if;
  update mind_boards b set updated_at = now() where b.id = v_board;
  if tg_op = 'UPDATE' and old.board_id is not null and old.board_id is distinct from new.board_id then
    update mind_boards b set updated_at = now() where b.id = old.board_id;
  end if;
  return null;
end;
$fn$;

create trigger trg_notes_mind_board
  after insert or update or delete on notes
  for each row execute function mind_board_point_changed();

create function mind_board_touch_tv() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  if exists (
    select 1 from tv_state s
     where s.company_id = new.company_id and s.scene = 'board' and s.board_id = new.id
  ) then
    perform tv_touch(new.company_id);
  end if;
  return null;
end;
$fn$;

create trigger trg_mind_boards_touch_tv
  after update on mind_boards
  for each row execute function mind_board_touch_tv();

-- ---------------------------------------------------------------------------
-- 7. Корзина: удалённая доска ждёт 3 дня, потом уходит вместе с пунктами (D-95 §4)
-- ---------------------------------------------------------------------------
create or replace function notes_purge_trash(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_notes  int;
  v_boards int;
begin
  delete from notes n where n.deleted_at is not null and n.deleted_at < p_now - interval '3 days';
  get diagnostics v_notes = row_count;
  delete from mind_boards b where b.deleted_at is not null and b.deleted_at < p_now - interval '3 days';
  get diagnostics v_boards = row_count;
  return v_notes + v_boards;
end;
$fn$;

revoke execute on function notes_purge_trash(timestamptz) from public, anon, authenticated;
grant execute on function notes_purge_trash(timestamptz) to service_role;
