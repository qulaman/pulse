-- Календарь на стене: «Неделя» или «Месяц» (D-98).
--
-- Зачем `calendar_view` в строке стены: как заставка и вид часов (D-96 §2), это состояние
-- экрана — его переключают с пульта в кабинете, а киоск узнаёт через строку, которую
-- уже слушает (D-76 §1).
--
-- Зачем `tv_control` снова пересоздаётся через drop: у него новый параметр `p_calendar`,
-- а `create or replace` не меняет список параметров. Пульт зовёт функцию по именам —
-- клиент без `p_calendar` работает с новой функцией как прежде.
--
-- Зачем `tv_calendar` получил `p_from` и до 42 дней: месяц на стене — сетка из шести
-- недель с понедельника первой недели месяца, это до 42 дней не с сегодняшнего числа.
-- Роль `tv` по-прежнему не читает `events` (D-78 §4); маска гостя — здесь же (D-33).

alter table tv_state
  add column calendar_view text not null default 'week'
    check (calendar_view in ('week', 'month'));

comment on column tv_state.calendar_view is 'the calendar scene shows today + the week, or the month grid (D-98)';

-- ---------------------------------------------------------------------------
-- tv_control — контракт D-76 / D-96 плюс вид календаря
-- ---------------------------------------------------------------------------
drop function tv_control(text, uuid, uuid, text, boolean, boolean, text);

create function tv_control(
  p_mode        text    default null,   -- null = unchanged
  p_employee_id uuid    default null,
  p_task_id     uuid    default null,
  p_scene       text    default null,   -- null = unchanged
  p_guest       boolean default null,   -- null = unchanged
  p_reload      boolean default false,
  p_clock       text    default null,   -- null = unchanged
  p_calendar    text    default null    -- null = unchanged
) returns tv_state
language plpgsql security definer set search_path = public
as $fn$
declare
  v_company  uuid;
  v_mode     text;
  v_employee uuid;
  v_task     uuid;
  v_expires  timestamptz;
  v_touch    boolean := false;          -- does this call move the focus at all?
  v_row      tv_state;
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  v_company := auth_company_id();

  if p_scene is not null and p_scene not in ('face', 'clock', 'team', 'calendar') then
    raise exception 'bad_scene' using errcode = 'P0001';
  end if;
  if p_clock is not null and p_clock not in ('digital', 'analog') then
    raise exception 'bad_clock' using errcode = 'P0001';
  end if;
  if p_calendar is not null and p_calendar not in ('week', 'month') then
    raise exception 'bad_calendar' using errcode = 'P0001';
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
    expires_at, version, reload_requested_at, updated_by, updated_at
  ) values (
    v_company,
    coalesce(v_mode, 'ether'),
    v_employee,
    v_task,
    coalesce(p_scene, 'face'),
    coalesce(p_guest, false),
    null,
    coalesce(p_clock, 'digital'),
    coalesce(p_calendar, 'week'),
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
    scene               = coalesce(p_scene, s.scene),
    guest               = coalesce(p_guest, s.guest),
    -- a hand on the switch owns guest mode: no timer after an explicit on or off (D-96 §5)
    guest_until         = case when p_guest is not null then null else s.guest_until end,
    clock_style         = coalesce(p_clock, s.clock_style),
    calendar_view       = coalesce(p_calendar, s.calendar_view),
    version             = s.version + 1,
    reload_requested_at = case when p_reload then now() else s.reload_requested_at end,
    updated_by          = auth.uid(),
    updated_at          = now()
  returning * into v_row;

  return v_row;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- tv_calendar — диапазон с `p_from` (по умолчанию сегодня по Актобе), до 42 дней
-- ---------------------------------------------------------------------------
drop function tv_calendar(boolean, int);

create function tv_calendar(p_guest boolean default false, p_days int default 7, p_from date default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_company uuid;
  v_from    timestamptz;
  v_days    int := least(greatest(coalesce(p_days, 7), 1), 42);
begin
  if auth_role() not in ('tv', 'director') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  v_company := auth_company_id();
  -- сутки компании, а не UTC (CLAUDE.md §6)
  v_from := coalesce(p_from, (now() at time zone 'Asia/Aqtobe')::date)::timestamp at time zone 'Asia/Aqtobe';

  return jsonb_build_object(
    'from', v_from,
    'days', v_days,
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id,
               'title', case when p_guest then null else e.title end,
               'starts_at', e.starts_at,
               'ends_at', e.ends_at,
               'location', case when p_guest then null else e.location end,
               'everyone', e.everyone,
               'people', (select count(*) from event_participants ep
                           where ep.event_id = e.id and ep.status <> 'declined'),
               'going', (select count(*) from event_participants ep
                          where ep.event_id = e.id and ep.status = 'going')
             ) order by e.starts_at)
        from (
          select * from events e
           where e.company_id = v_company and e.cancelled_at is null
             and e.starts_at >= v_from
             and e.starts_at < v_from + make_interval(days => v_days)
           order by e.starts_at
           limit 200
        ) e
    ), '[]'::jsonb)
  );
end;
$fn$;

revoke execute on function tv_control(text, uuid, uuid, text, boolean, boolean, text, text) from public, anon;
revoke execute on function tv_calendar(boolean, int, date) from public, anon;
grant execute on function tv_control(text, uuid, uuid, text, boolean, boolean, text, text) to authenticated, service_role;
grant execute on function tv_calendar(boolean, int, date) to authenticated, service_role;
