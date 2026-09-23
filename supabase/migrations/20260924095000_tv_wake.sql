-- Разбудить стену с пульта (D-105).
--
-- Зачем: с 21:00 до 08:00 стена гаснет до тусклых часов (D-96 §8), и до сих пор ночь
-- перебивали только фокус, доска и надпись о посетителе. Директор, который задержался
-- в кабинете, не мог вернуть стене эфир: ночь считает киоск по своим часам, пульт её не
-- трогал. Теперь `tv_control(p_wake => true)` будит стену на два часа, `false` —
-- возвращает ночь сразу.
--
-- Зачем два часа, а не до утра: забытая разбудка светила бы в пустой кабинет всю ночь —
-- ровно то, от чего ночь стены защищает матрицу. Два часа — тот же срок, что у доски,
-- поставленной после 21:00 (D-102 §6); повторное нажатие продлевает от «сейчас».
--
-- Зачем отметка времени, а не флаг: гаснет по часам киоска сама, без cron и без таймера
-- на пульте — как фокус (D-76 §5) и гость визита (D-96 §5).

-- ---------------------------------------------------------------------------
-- 1. tv_state.awake_until
-- ---------------------------------------------------------------------------
alter table tv_state add column awake_until timestamptz;

comment on column tv_state.awake_until is 'the director woke the wall from the remote: the night does not dim it until then (D-105)';

-- ---------------------------------------------------------------------------
-- 2. tv_control — контракт D-102 плюс `p_wake`. Новый параметр `create or replace`
--    не добавляет — функция пересоздаётся (как в D-96 §2).
-- ---------------------------------------------------------------------------
drop function tv_control(text, uuid, uuid, text, boolean, boolean, text, text, uuid, boolean);

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
  p_board_guest boolean default null,   -- null = unchanged
  p_wake        boolean default null    -- true = awake two hours from now, false = asleep, null = unchanged
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
    board_id, board_until, board_guest, awake_until,
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

revoke execute on function tv_control(text, uuid, uuid, text, boolean, boolean, text, text, uuid, boolean, boolean) from public, anon;
grant execute on function tv_control(text, uuid, uuid, text, boolean, boolean, text, text, uuid, boolean, boolean) to authenticated, service_role;
