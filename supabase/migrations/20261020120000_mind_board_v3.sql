-- Доски v3 (D-140): закрепить и завершить доску, новая доска из неотмеченного, пункт с веткой
-- на другую доску, срок доски на стене по выбору и «+30 минут» с пульта.
-- Владелец (2026-10-20): «нужно полностью доработать доски в программе. именно удобство
-- создания и управления, редактирования и вывода на тв» → план из четырёх нарядов →
-- «делай как рекомендуешь но все наряды делай сам».
--
-- Зачем «Завершить», а не только удалить: планёрки повторяются, к прошлой возвращаются
-- («что мы решили в прошлый вторник») — удалять её жалко, а в списке она мешает. Завершённая
-- доска уходит в свой раздел внизу вкладки и с полки пульта, но остаётся целой.
--
-- Зачем «Новая доска из этой» функцией: доска и её пункты — две таблицы, одна операция
-- (CLAUDE.md, принцип 7). Повтор с тем же `client_request_id` отдаёт ту же доску.
--
-- Зачем ветка едет триггером: перенос пункта на другую доску — одна строка с телефона, как
-- «удалить» и «вернуть» (D-121 §2); подпункты едут за ним сами и не остаются сиротами.
--
-- Зачем потолок срока: «на час» и «+30 мин» не отменяют D-102 §6 — доска, забытая вечером,
-- не должна гореть утром перед командой. Любой срок — не дальше сегодняшних 21:00 по Актобе
-- или двух часов от «сейчас», если это позже. «+30 мин» шлёт итоговое время, а не прибавку:
-- повтор после потерянного ответа даёт ту же строку (команда пульта абсолютна, D-76 §3).

-- ---------------------------------------------------------------------------
-- 0. Потолок срока доски на стене
-- ---------------------------------------------------------------------------
create function tv_board_cap() returns timestamptz
language sql stable set search_path = public
as $fn$
  select greatest(((now() at time zone 'Asia/Aqtobe')::date + time '21:00') at time zone 'Asia/Aqtobe',
                  now() + interval '2 hours');
$fn$;

comment on function tv_board_cap() is
  'the latest a board may stay on the wall: today''s 21:00 Aqtobe, or two hours from now if later (D-102 §6, D-140)';

-- ---------------------------------------------------------------------------
-- 1. mind_boards: закреплена, завершена
-- ---------------------------------------------------------------------------
alter table mind_boards
  add column pinned_at   timestamptz,
  add column finished_at timestamptz;

comment on column mind_boards.pinned_at is 'the board is pinned to the top of the list (D-140); null = not pinned';
comment on column mind_boards.finished_at is 'the meeting of this board is over (D-140): it leaves the list for «Завершённые» and the remote''s shelf, intact';

-- ---------------------------------------------------------------------------
-- 2. Пункт переезжает на другую доску вместе с веткой. Подпункты из корзины — тоже:
--    «Вернуть» должно вернуть их к их пункту, а не на старую доску.
-- ---------------------------------------------------------------------------
create function mind_board_branch_follow() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  if new.parent_id is not null or new.board_id is null
     or old.board_id is not distinct from new.board_id then
    return null;
  end if;
  update notes c set board_id = new.board_id
   where c.parent_id = new.id and c.board_id is distinct from new.board_id;
  return null;
end;
$fn$;

create trigger trg_notes_branch_follow
  after update of board_id on notes
  for each row execute function mind_board_branch_follow();

-- ---------------------------------------------------------------------------
-- 3. «Новая доска из этой»: неотмеченные и не поручённые пункты со словами — с такими же
--    подпунктами, в том же порядке. Только текст: голос и история остаются на старой доске
--    (она и есть запись того совещания). Только своя живая доска.
-- ---------------------------------------------------------------------------
create function mind_board_copy(
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
       and n.done_at is null and n.converted_task_id is null and btrim(n.text) <> ''
     order by n.position, n.created_at
  loop
    v_n := v_n + 1;
    v_new := gen_random_uuid();
    insert into notes (id, company_id, user_id, text, board_id, position, client_request_id)
    values (v_new, v_company, v_uid, v_point.text, v_board.id, v_n, gen_random_uuid());

    insert into notes (id, company_id, user_id, text, board_id, parent_id, position, client_request_id)
    select gen_random_uuid(), v_company, v_uid, c.text, v_board.id, v_new,
           row_number() over (order by c.position, c.created_at), gen_random_uuid()
      from notes c
     where c.parent_id = v_point.id and c.deleted_at is null
       and c.done_at is null and c.converted_task_id is null and btrim(c.text) <> '';
  end loop;

  select * into v_board from mind_boards b where b.id = p_id;
  return v_board;
end;
$fn$;

comment on function mind_board_copy(uuid, uuid, text, uuid) is
  'a new board of the open points of another (D-140): unticked, not handed over, with words; their sub-points alike';

revoke execute on function mind_board_copy(uuid, uuid, text, uuid) from public, anon;
grant execute on function mind_board_copy(uuid, uuid, text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. tv_control — контракт D-123 плюс `p_board_minutes`: доска на стене на столько минут
--    (от 5 до 720, не дальше потолка `tv_board_cap`) вместо «до 21:00». Новые параметры
--    `create or replace` не добавляет.
-- ---------------------------------------------------------------------------
drop function tv_control(text, uuid, uuid, text, boolean, boolean, text, text, uuid, boolean, boolean, text, boolean);

create function tv_control(
  p_mode          text    default null,   -- null = unchanged
  p_employee_id   uuid    default null,
  p_task_id       uuid    default null,
  p_scene         text    default null,   -- null = unchanged
  p_guest         boolean default null,   -- null = unchanged
  p_reload        boolean default false,
  p_clock         text    default null,   -- null = unchanged
  p_calendar      text    default null,   -- null = unchanged
  p_board         uuid    default null,   -- puts this board on the wall
  p_board_guest   boolean default null,   -- null = unchanged
  p_wake          boolean default null,   -- true = awake two hours from now, false = asleep, null = unchanged
  p_rating        text    default null,   -- week | month, null = unchanged
  p_carousel      boolean default null,   -- true = the wall changes scenes by itself, null = unchanged
  p_board_minutes int     default null    -- with p_board: on the wall this long; null = till the end of the day
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
  v_awake_until timestamptz := case when p_wake then now() + interval '2 hours' end;
  -- a scene or a board picked by hand stops the round; turning the round on takes a board down
  v_pick        boolean := p_scene is not null or p_board is not null;
  v_round_on    boolean := coalesce(p_carousel, false);
  v_row         tv_state;
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  v_company := auth_company_id();

  if p_scene is not null and p_scene not in ('face', 'clock', 'team', 'calendar', 'rating') then
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
  if p_rating is not null and p_rating not in ('week', 'month') then
    raise exception 'bad_rating' using errcode = 'P0001';
  end if;
  if p_board_minutes is not null and (p_board is null or p_board_minutes not between 5 and 720) then
    raise exception 'bad_minutes' using errcode = 'P0001';
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
    if p_board_minutes is not null then
      -- «на полчаса», «на час» (D-140) — never past the end of the day
      v_board_until := least(now() + make_interval(mins => p_board_minutes), tv_board_cap());
    elsif extract(hour from now() at time zone 'Asia/Aqtobe') < 21 then
      -- till the end of the working day; put up at night -- two hours (D-102 §6)
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
      -- a declined, revoked or scheduled order never goes up on the wall (D-45, D-123)
      if not exists (
        select 1 from tasks t
         where t.id = p_task_id and t.company_id = v_company
           and t.status in ('sent', 'accepted', 'in_progress', 'rework', 'pending_review', 'done')
      ) then
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
    rating_view, carousel, board_id, board_until, board_guest, awake_until,
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
    coalesce(p_rating, 'week'),
    case when p_carousel is not null then p_carousel else false end,
    p_board,
    v_board_until,
    case when p_board is not null then false else coalesce(p_board_guest, false) end,
    v_awake_until,
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
    scene               = case when p_board is not null then 'board'
                               when p_scene is not null then p_scene
                               -- the round never stands on a board
                               when v_round_on and s.scene = 'board' then 'face'
                               else s.scene end,
    guest               = coalesce(p_guest, s.guest),
    -- a hand on the switch owns guest mode: no timer after an explicit on or off (D-96 §5)
    guest_until         = case when p_guest is not null then null else s.guest_until end,
    clock_style         = coalesce(p_clock, s.clock_style),
    calendar_view       = coalesce(p_calendar, s.calendar_view),
    rating_view         = coalesce(p_rating, s.rating_view),
    -- the switch owns the round; a scene or a board picked by hand stops it
    carousel            = case when p_carousel is not null then p_carousel
                               when v_pick then false
                               else s.carousel end,
    -- another scene (or the round) takes the board off the wall; a new board starts hidden from guests
    board_id            = case when p_board is not null then p_board
                               when p_scene is not null or v_round_on then null
                               else s.board_id end,
    board_until         = case when p_board is not null then v_board_until
                               when p_scene is not null or v_round_on then null
                               else s.board_until end,
    board_guest         = case when p_board is not null or p_scene is not null or v_round_on then false
                               when p_guest is not null and not p_guest then false
                               when p_board_guest is not null then p_board_guest
                               else s.board_guest end,
    -- only the wake key moves it: other commands leave the night as it is (D-105)
    awake_until         = case when p_wake is not null then v_awake_until else s.awake_until end,
    version             = s.version + 1,
    reload_requested_at = case when p_reload then now() else s.reload_requested_at end,
    updated_by          = auth.uid(),
    updated_at          = now()
  returning * into v_row;

  return v_row;
end;
$fn$;

revoke execute on function tv_control(text, uuid, uuid, text, boolean, boolean, text, text, uuid, boolean, boolean, text, boolean, int) from public, anon;
grant execute on function tv_control(text, uuid, uuid, text, boolean, boolean, text, text, uuid, boolean, boolean, text, boolean, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. tv_board_control — контракт D-121 плюс `p_board_until`: «+30 мин» к доске, что стоит
--    на стене, — итоговым временем (повтор безопасен). Продлевает только автор живой доски;
--    не дальше потолка `tv_board_cap`.
-- ---------------------------------------------------------------------------
drop function tv_board_control(uuid, boolean, text);

create function tv_board_control(
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
            and n.deleted_at is null and btrim(n.text) <> ''
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

revoke execute on function tv_board_control(uuid, boolean, text, timestamptz) from public, anon;
grant execute on function tv_board_control(uuid, boolean, text, timestamptz) to authenticated, service_role;
