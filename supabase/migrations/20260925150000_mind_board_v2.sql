-- Доска v2 (D-121): ветки, ведущий, «Список / Карта».
--
-- Зачем подпункты: доска — карта мыслей директора к мини-брифингу. Плоский список не
-- держит «Продажи Q4 → план, отчёт к пятнице»: подробность пункта теряется или разбухает
-- в одну длинную строку. Один уровень вложенности — ровно столько, сколько читается со
-- стены через кабинет; второй уровень превратил бы доску в документ.
--
-- Зачем подпункт — тоже строка `notes`: вся механика пункта (голос до ИИ, ожидание без
-- сети, корзина, «Поручить») достаётся ему даром, как пункту досталась механика заметки
-- (D-102 §1). Связь — `parent_id`; порядок — тот же `position`, но среди братьев.
--
-- Зачем каскад корзины триггером: пункт уходит в корзину вместе с подпунктами и
-- возвращается вместе с ними — одним UPDATE с телефона, без многострочной логики на
-- клиенте. Подпункт, удалённый отдельно раньше, остаётся в корзине: у него своё время.
--
-- Зачем «ведущий» строкой `tv_state`: директор на совещании листает пункты с пульта, а
-- стена подсвечивает обсуждаемый. Это та же команда стене, что заставка, — версия строки,
-- киоск перечитывает `tv_board()`, нового сокета нет (D-96 §6).
--
-- Зачем отдельная функция `tv_board_control`, а не ещё параметры `tv_control`: ◀ ▶ жмут
-- десятки раз за совещание, проверка у них своя (пункт доски, что на стене, и только её
-- автор), а у `tv_control` уже одиннадцать параметров.

-- ---------------------------------------------------------------------------
-- 1. notes.parent_id — подпункт пункта доски
-- ---------------------------------------------------------------------------
alter table notes
  add column parent_id uuid references notes on delete cascade,
  add constraint notes_parent_board_check check (parent_id is null or board_id is not null),
  add constraint notes_parent_self_check check (parent_id is null or parent_id <> id);

comment on column notes.parent_id is 'the point this sub-point belongs to (D-121); one level only; position orders siblings';

create index notes_parent_idx on notes (parent_id, position) where parent_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Ветка держит форму: подпункт — только у живого пункта той же доски и того же
--    автора, и только одного уровня. Вернувшийся из корзины подпункт, чей пункт всё ещё
--    в корзине (или сам стал подпунктом), возвращается пунктом — не сиротой.
-- ---------------------------------------------------------------------------
create function mind_board_branch_guard() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_parent notes;
begin
  if new.parent_id is null then
    return new;
  end if;

  select * into v_parent from notes p where p.id = new.parent_id;

  -- back from the bin while its point is not on the board: it comes back as a point
  if tg_op = 'UPDATE' and old.deleted_at is not null and new.deleted_at is null
     and (not found or v_parent.deleted_at is not null or v_parent.parent_id is not null) then
    new.parent_id := null;
    new.position := coalesce(v_parent.position, new.position);
    return new;
  end if;

  -- nothing about the branch moved: no check (a text edit of a sub-point)
  if tg_op = 'UPDATE' and new.parent_id is not distinct from old.parent_id
     and new.board_id is not distinct from old.board_id then
    return new;
  end if;

  if not found
     or v_parent.board_id is distinct from new.board_id
     or v_parent.user_id <> new.user_id
     or v_parent.company_id <> new.company_id
     or v_parent.parent_id is not null then
    raise exception 'bad_parent' using errcode = 'P0001';
  end if;

  if v_parent.deleted_at is not null then
    -- said without network under a point deleted meanwhile: it rides in the bin with its
    -- point and comes back with it, nothing is lost (D-95 §2)
    if tg_op = 'INSERT' then
      new.deleted_at := v_parent.deleted_at;
      return new;
    end if;
    raise exception 'bad_parent' using errcode = 'P0001';
  end if;

  -- one level: a point with live sub-points of its own does not become a sub-point
  if tg_op = 'UPDATE' and exists (
    select 1 from notes c where c.parent_id = new.id and c.deleted_at is null
  ) then
    raise exception 'bad_parent' using errcode = 'P0001';
  end if;

  return new;
end;
$fn$;

create trigger trg_notes_branch_guard
  before insert or update of parent_id, board_id, deleted_at on notes
  for each row execute function mind_board_branch_guard();

-- ---------------------------------------------------------------------------
-- 3. Корзина веткой: пункт уводит живые подпункты со своим временем и возвращает
--    ровно их — удалённые раньше отдельно остаются в корзине.
-- ---------------------------------------------------------------------------
create function mind_board_branch_cascade() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  if new.board_id is null or new.parent_id is not null then
    return null;
  end if;
  if old.deleted_at is null and new.deleted_at is not null then
    update notes c set deleted_at = new.deleted_at
     where c.parent_id = new.id and c.deleted_at is null;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update notes c set deleted_at = null
     where c.parent_id = new.id and c.deleted_at = old.deleted_at;
  end if;
  return null;
end;
$fn$;

create trigger trg_notes_branch_cascade
  after update of deleted_at on notes
  for each row execute function mind_board_branch_cascade();

-- ---------------------------------------------------------------------------
-- 4. tv_state: подсвеченный пункт и вид доски на стене
-- ---------------------------------------------------------------------------
alter table tv_state
  add column board_point uuid references notes on delete set null,
  add column board_view  text not null default 'list' check (board_view in ('list', 'map'));

comment on column tv_state.board_point is 'the point of the board on the wall being discussed now (D-121); null = none';
comment on column tv_state.board_view is 'how the wall draws a board: list or map (D-121); stays between boards';

-- another board or another scene ends the spotlight: it belongs to one meeting
create function tv_state_board_point_reset() returns trigger
language plpgsql set search_path = public
as $fn$
begin
  if new.board_point is not null
     and (new.scene <> 'board' or new.board_id is distinct from old.board_id) then
    new.board_point := null;
  end if;
  return new;
end;
$fn$;

create trigger trg_tv_state_board_point
  before update on tv_state
  for each row execute function tv_state_board_point_reset();

-- ---------------------------------------------------------------------------
-- 5. tv_board_control — ведущий с пульта: подсветить пункт, снять подсветку, вид.
--    Подсветить можно только живой пункт (не подпункт) с текстом той доски, что сейчас
--    на стене, и только её автору. Вид — настройка стены, как часы: любому директору.
--    Идемпотентности по `client_request_id` нет — команда абсолютна (D-76 §3).
-- ---------------------------------------------------------------------------
create function tv_board_control(
  p_point       uuid    default null,   -- spotlight this point of the board on the wall
  p_clear_point boolean default false,  -- true = no spotlight
  p_view        text    default null    -- 'list' | 'map'; null = unchanged
) returns tv_state
language plpgsql security definer set search_path = public
as $fn$
declare
  v_company uuid;
  v_state   tv_state;
  v_has     boolean;
  v_row     tv_state;
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  v_company := auth_company_id();

  if p_view is not null and p_view not in ('list', 'map') then
    raise exception 'bad_view' using errcode = 'P0001';
  end if;
  if p_point is not null and p_clear_point then
    raise exception 'bad_point' using errcode = 'P0001';
  end if;

  select * into v_state from tv_state s where s.company_id = v_company for update;
  v_has := found;
  if not v_has then
    -- the wall row is born with the first remote command (tv_control)
    raise exception 'no_wall' using errcode = 'P0001';
  end if;

  if p_point is not null and (
       v_state.scene <> 'board' or v_state.board_id is null
       or v_state.board_until is null or v_state.board_until <= now()
       or not exists (
         select 1 from mind_boards b
          where b.id = v_state.board_id and b.user_id = auth.uid() and b.deleted_at is null
       )
       or not exists (
         select 1 from notes n
          where n.id = p_point and n.board_id = v_state.board_id and n.parent_id is null
            and n.deleted_at is null and btrim(n.text) <> ''
       )
     ) then
    raise exception 'bad_point' using errcode = 'P0001';
  end if;

  update tv_state s set
    board_point = case when p_clear_point then null
                       when p_point is not null then p_point
                       else s.board_point end,
    board_view  = coalesce(p_view, s.board_view),
    version     = s.version + 1,
    updated_by  = auth.uid(),
    updated_at  = now()
   where s.company_id = v_company
  returning * into v_row;

  return v_row;
end;
$fn$;

revoke execute on function tv_board_control(uuid, boolean, text) from public, anon;
grant execute on function tv_board_control(uuid, boolean, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. tv_board v2 — пункты веткой (`children`), подсветка (`focus`) и вид (`view`).
--    Счётчики — по пунктам верхнего уровня: «5 пунктов · 2 отмечено» говорит о повестке,
--    подпункты — её подробности. Подсветка, чей пункт удалён или опустел, не светит.
--    Гость и пометки — как в D-102 §7–8.
-- ---------------------------------------------------------------------------
create or replace function tv_board(p_guest boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_state tv_state;
  v_board mind_boards;
  v_guest boolean;
  v_names boolean;
  v_focus uuid;
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

  select n.id into v_focus from notes n
   where n.id = v_state.board_point and n.board_id = v_board.id and n.parent_id is null
     and n.deleted_at is null and btrim(n.text) <> '';

  return jsonb_build_object(
    'hidden', false,
    'board', jsonb_build_object(
      'id', v_board.id,
      'title', v_board.title,
      'updated_at', v_board.updated_at,
      'view', v_state.board_view,
      'focus', v_focus,
      'total', (select count(*) from notes n
                 where n.board_id = v_board.id and n.parent_id is null
                   and n.deleted_at is null and btrim(n.text) <> ''),
      'done', (select count(*) from notes n
                where n.board_id = v_board.id and n.parent_id is null
                  and n.deleted_at is null and btrim(n.text) <> '' and n.done_at is not null),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', p.id,
                 'text', p.text,
                 'done', p.done_at is not null,
                 'created_at', p.created_at,
                 'assignee', case when v_names and t.status is not null and t.status <> 'revoked'
                                  then split_part(pr.full_name, ' ', 1) end,
                 'handed_done', coalesce(t.status = 'done', false),
                 'children', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'id', c.id,
                            'text', c.text,
                            'done', c.done_at is not null,
                            'created_at', c.created_at,
                            'assignee', case when v_names and ct.status is not null and ct.status <> 'revoked'
                                             then split_part(cpr.full_name, ' ', 1) end,
                            'handed_done', coalesce(ct.status = 'done', false)
                          ) order by c.position, c.created_at)
                     from (
                       select * from notes c0
                        where c0.parent_id = p.id and c0.deleted_at is null and btrim(c0.text) <> ''
                        order by c0.position, c0.created_at
                        limit 50
                     ) c
                     left join tasks ct on ct.id = c.converted_task_id
                     left join profiles cpr on cpr.id = ct.assignee_id
                 ), '[]'::jsonb)
               ) order by p.position, p.created_at)
          from (
            select * from notes n
             where n.board_id = v_board.id and n.parent_id is null
               and n.deleted_at is null and btrim(n.text) <> ''
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
