-- Пункт-рисунок (D-141): директор рисует у себя на телефоне и отправляет рисунок на доску —
-- он становится пунктом, а на стене, когда ведущий доходит до него, раскрывается во всё поле.
-- Владелец (2026-10-21): «что если сделать так — директор рисует у себя в приложении и лишь
-- после отправить на доску оно выходит на доске?» → план → «делай как рекомендуешь».
--
-- Зачем линиями, а не картинкой: рисунок — это несколько сотен точек в сетке 1600×900, десятки
-- килобайт в строке пункта; он чёткий на 4K, его можно дорисовать, а стена получает его той же
-- функцией, что и доску, — ни бакета, ни подписанных ссылок, ни нового пути доступа для киоска.
-- Зачем без потока вживую: рисуют до совещания, на совещании рисунок — просто пункт.
--
-- Пункт без слов, но с рисунком — полноценный пункт: у него номер, его подсвечивает ведущий,
-- его переносит «Новая доска из открытых». Подпись — обычный текст пункта, по желанию.

-- ---------------------------------------------------------------------------
-- 1. notes.sketch — рисунок пункта доски
-- ---------------------------------------------------------------------------
alter table notes
  add column sketch jsonb,
  -- only a line of a board carries a drawing; a drawing has lines and stays small
  add constraint notes_sketch_check check (
    sketch is null or (
      jsonb_typeof(sketch) = 'object'
      and jsonb_typeof(sketch->'strokes') = 'array' and jsonb_array_length(sketch->'strokes') > 0
      and board_id is not null
      and pg_column_size(sketch) <= 262144
    )
  );

comment on column notes.sketch is 'a drawing of a board point (D-141): {v, strokes: [{c, w, p: [x, y, …]}]} on a 1600×900 grid; null = none';

-- ---------------------------------------------------------------------------
-- 2. tv_board v3 — пункты с рисунком на стене: строка со словами ИЛИ с рисунком; рисунок
--    приходит с пунктом. Контракт v2 сохранён (стена старше базы рисунок просто не видит).
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
     and n.deleted_at is null and (btrim(n.text) <> '' or n.sketch is not null);

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
                   and n.deleted_at is null and (btrim(n.text) <> '' or n.sketch is not null)),
      'done', (select count(*) from notes n
                where n.board_id = v_board.id and n.parent_id is null
                  and n.deleted_at is null and (btrim(n.text) <> '' or n.sketch is not null) and n.done_at is not null),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', p.id,
                 'text', p.text,
                 'sketch', p.sketch,
                 'done', p.done_at is not null,
                 'created_at', p.created_at,
                 'assignee', case when v_names and t.status is not null and t.status <> 'revoked'
                                  then split_part(pr.full_name, ' ', 1) end,
                 'handed_done', coalesce(t.status = 'done', false),
                 'children', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'id', c.id,
                            'text', c.text,
                            'sketch', c.sketch,
                            'done', c.done_at is not null,
                            'created_at', c.created_at,
                            'assignee', case when v_names and ct.status is not null and ct.status <> 'revoked'
                                             then split_part(cpr.full_name, ' ', 1) end,
                            'handed_done', coalesce(ct.status = 'done', false)
                          ) order by c.position, c.created_at)
                     from (
                       select * from notes c0
                        where c0.parent_id = p.id and c0.deleted_at is null
                          and (btrim(c0.text) <> '' or c0.sketch is not null)
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
               and n.deleted_at is null and (btrim(n.text) <> '' or n.sketch is not null)
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

-- ---------------------------------------------------------------------------
-- 3. tv_board_control — контракт D-140; подсветить можно и пункт с рисунком без слов.
-- ---------------------------------------------------------------------------
create or replace function tv_board_control(
  p_point       uuid        default null,   -- spotlight this point of the board on the wall
  p_clear_point boolean     default false,  -- true = no spotlight
  p_view        text        default null,   -- 'list' | 'map'; null = unchanged
  p_board_until timestamptz default null    -- the board stays up till then (capped); null = unchanged
) returns tv_state
language plpgsql security definer set search_path = public
as $fn$
declare
  v_company uuid;
  v_state   tv_state;
  v_author  boolean;
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
  if p_board_until is not null and p_board_until <= now() then
    raise exception 'bad_until' using errcode = 'P0001';
  end if;

  select * into v_state from tv_state s where s.company_id = v_company for update;
  if not found then
    -- the wall row is born with the first remote command (tv_control)
    raise exception 'no_wall' using errcode = 'P0001';
  end if;

  -- the board on the wall is live and it is the caller's own
  v_author := v_state.scene = 'board' and v_state.board_id is not null
              and v_state.board_until is not null and v_state.board_until > now()
              and exists (
                select 1 from mind_boards b
                 where b.id = v_state.board_id and b.user_id = auth.uid() and b.deleted_at is null
              );

  if p_point is not null and (
       not v_author
       or not exists (
         select 1 from notes n
          where n.id = p_point and n.board_id = v_state.board_id and n.parent_id is null
            and n.deleted_at is null and (btrim(n.text) <> '' or n.sketch is not null)
       )
     ) then
    raise exception 'bad_point' using errcode = 'P0001';
  end if;
  if p_board_until is not null and not v_author then
    raise exception 'bad_board' using errcode = 'P0001';
  end if;

  update tv_state s set
    board_point = case when p_clear_point then null
                       when p_point is not null then p_point
                       else s.board_point end,
    board_view  = coalesce(p_view, s.board_view),
    board_until = case when p_board_until is not null then least(p_board_until, tv_board_cap())
                       else s.board_until end,
    version     = s.version + 1,
    updated_by  = auth.uid(),
    updated_at  = now()
   where s.company_id = v_company
  returning * into v_row;

  return v_row;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. mind_board_copy — контракт D-140; открытые пункты с рисунком переезжают с рисунком.
-- ---------------------------------------------------------------------------
create or replace function mind_board_copy(
  p_source            uuid,
  p_id                uuid,
  p_title             text,
  p_client_request_id uuid
) returns mind_boards
language plpgsql security definer set search_path = public
as $fn$
declare
  v_uid     uuid := auth.uid();
  v_company uuid := auth_company_id();
  v_board   mind_boards;
  v_point   notes;
  v_new     uuid;
  v_n       int := 0;
begin
  if v_uid is null or v_company is null then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  -- a replay of a copy that landed: the same board back, nothing copied twice
  select * into v_board from mind_boards b where b.client_request_id = p_client_request_id;
  if found then
    if v_board.user_id <> v_uid then
      raise exception 'forbidden' using errcode = 'P0001';
    end if;
    return v_board;
  end if;

  if not exists (
    select 1 from mind_boards b
     where b.id = p_source and b.user_id = v_uid and b.company_id = v_company and b.deleted_at is null
  ) then
    raise exception 'bad_board' using errcode = 'P0001';
  end if;

  insert into mind_boards (id, company_id, user_id, title, client_request_id)
  values (p_id, v_company, v_uid, left(btrim(p_title), 120), p_client_request_id)
  returning * into v_board;

  for v_point in
    select * from notes n
     where n.board_id = p_source and n.parent_id is null and n.deleted_at is null
       and n.done_at is null and n.converted_task_id is null
       and (btrim(n.text) <> '' or n.sketch is not null)
     order by n.position, n.created_at
  loop
    v_n := v_n + 1;
    v_new := gen_random_uuid();
    insert into notes (id, company_id, user_id, text, sketch, board_id, position, client_request_id)
    values (v_new, v_company, v_uid, v_point.text, v_point.sketch, v_board.id, v_n, gen_random_uuid());

    insert into notes (id, company_id, user_id, text, sketch, board_id, parent_id, position, client_request_id)
    select gen_random_uuid(), v_company, v_uid, c.text, c.sketch, v_board.id, v_new,
           row_number() over (order by c.position, c.created_at), gen_random_uuid()
      from notes c
     where c.parent_id = v_point.id and c.deleted_at is null
       and c.done_at is null and c.converted_task_id is null
       and (btrim(c.text) <> '' or c.sketch is not null);
  end loop;

  select * into v_board from mind_boards b where b.id = p_id;
  return v_board;
end;
$fn$;
