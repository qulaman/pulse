-- Стена v2 (D-96): карточка сотрудника читается с двух метров, часы со стрелками,
-- календарь недели заставкой, гость в кабинете выключается сам.
--
-- Зачем `clock_style` в строке, а не в настройках компании: это состояние стены, как
-- заставка, — его переключают с пульта в кабинете, а киоск обязан узнать об этом через
-- ту же строку, которую уже слушает (D-76 §1). Настройки компании киоск не читает.
--
-- Зачем `guest_until`: «Пусть заходит» директора (визит от секретаря, миграция
-- 20260923230100) включает режим гостя сам — человек сейчас войдёт в кабинет с экраном.
-- Выключить его забудут, поэтому такое включение живёт час и гаснет по часам киоска,
-- как фокус (D-76 §5), без cron. Ручной переключатель на пульте ставит `guest_until =
-- null` — ручное включение не истекает.
--
-- Зачем `tv_control` пересоздаётся через drop: у функции новый параметр `p_clock`,
-- а `create or replace` не умеет менять список параметров. Вызов с пульта — по именам,
-- поэтому старый клиент (без `p_clock`) продолжает работать с новой функцией.
--
-- Зачем `tv_focus` v2: на стене было шесть строк мелким шрифтом, статус — цветное слово
-- справа. Теперь карточка — три колонки по стадиям с крупными числами над ними и «Сегодня
-- сдано». Числа считаются по всем открытым делам, а не по показанным. Правила прежние:
-- отказов, «просрочено» и красного нет (D-45), гостю — имя без фамилии, без заголовков и
-- без фото (D-33).
--
-- Зачем `tv_calendar`: роль `tv` по-прежнему не читает `events` (D-78 §4); неделя вперёд
-- для заставки «Календарь» приходит одним вызовом, маска гостя — здесь же, в БД.

-- ---------------------------------------------------------------------------
-- 1. Строка стены: вид часов, заставка «календарь», срок гостя
-- ---------------------------------------------------------------------------
alter table tv_state
  add column clock_style text not null default 'digital'
    check (clock_style in ('digital', 'analog')),
  add column guest_until timestamptz;

comment on column tv_state.clock_style is 'digits or hands, everywhere the wall draws a clock (D-96)';
comment on column tv_state.guest_until is 'guest mode switched on by a visit dies here by the kiosk clock; null = on until switched off (D-96)';

-- the scene check was declared inline and is named by Postgres: find it by its text
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
  check (scene in ('face', 'clock', 'team', 'calendar'));

-- ---------------------------------------------------------------------------
-- 2. Гость сейчас: включён и не истёк. Одно правило для фокуса, баннера и пульта.
-- ---------------------------------------------------------------------------
create or replace function tv_guest_on(p_state tv_state) returns boolean
language sql stable
as $fn$
  select coalesce(p_state.guest, false)
     and (p_state.guest_until is null or p_state.guest_until > now());
$fn$;

comment on function tv_guest_on(tv_state) is 'guest mode is on and not expired (D-33, D-96)';

-- ---------------------------------------------------------------------------
-- 3. tv_control — тот же контракт (D-76 §2–3) плюс вид часов. Ручной «Гость в кабинете»
--    не истекает: `guest_until` сбрасывается любым явным `p_guest`.
-- ---------------------------------------------------------------------------
drop function tv_control(text, uuid, uuid, text, boolean, boolean);

create function tv_control(
  p_mode        text    default null,   -- null = unchanged
  p_employee_id uuid    default null,
  p_task_id     uuid    default null,
  p_scene       text    default null,   -- null = unchanged
  p_guest       boolean default null,   -- null = unchanged
  p_reload      boolean default false,
  p_clock       text    default null    -- null = unchanged
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
    company_id, mode, employee_id, task_id, scene, guest, guest_until, clock_style, expires_at,
    version, reload_requested_at, updated_by, updated_at
  ) values (
    v_company,
    coalesce(v_mode, 'ether'),
    v_employee,
    v_task,
    coalesce(p_scene, 'face'),
    coalesce(p_guest, false),
    null,
    coalesce(p_clock, 'digital'),
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
    -- a hand on the switch owns guest mode: no timer after an explicit on or off
    guest_until         = case when p_guest is not null then null else s.guest_until end,
    clock_style         = coalesce(p_clock, s.clock_style),
    version             = s.version + 1,
    reload_requested_at = case when p_reload then now() else s.reload_requested_at end,
    updated_by          = auth.uid(),
    updated_at          = now()
  returning * into v_row;

  return v_row;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. tv_focus v2 — карточка сотрудника на стене. Контракт v1 сохранён (mode, guest,
--    expires_at, employee.{id,name,position}, tasks[]), добавлены поля.
-- ---------------------------------------------------------------------------
create or replace function tv_focus() returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_company  uuid;
  v_state    tv_state;
  v_guest    boolean;
  v_day      timestamptz;
  v_points   boolean;
begin
  if auth_role() not in ('tv', 'director') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  v_company := auth_company_id();

  select * into v_state from tv_state where company_id = v_company;

  if not found
     or v_state.mode is distinct from 'employee'
     or v_state.employee_id is null
     or v_state.expires_at is null
     or v_state.expires_at <= now() then
    return jsonb_build_object('mode', 'ether');
  end if;

  v_guest := tv_guest_on(v_state);
  -- сутки компании, а не UTC (CLAUDE.md §6)
  v_day := date_trunc('day', now() at time zone 'Asia/Aqtobe') at time zone 'Asia/Aqtobe';
  select coalesce((c.settings->>'points_enabled')::boolean, false) into v_points
    from companies c where c.id = v_company;

  return jsonb_build_object(
    'mode', 'employee',
    'guest', v_guest,
    'expires_at', v_state.expires_at,
    'employee', (
      select jsonb_build_object(
               'id', p.id,
               -- гость видит имя без фамилии, та же маска, что у ленты экрана (D-33)
               'name', case when v_guest then split_part(p.full_name, ' ', 1) else p.full_name end,
               'position', p."position",
               -- лицо человека постороннему не показываем: гостю — только инициалы
               'avatar_url', case when v_guest then null else p.avatar_url end
             )
        from profiles p where p.id = v_state.employee_id
    ),
    -- числа над колонками — по всем открытым делам, а не по показанным (limit ниже)
    'counts', (
      select jsonb_build_object(
               'new',    count(*) filter (where t.status = 'sent'),
               'work',   count(*) filter (where t.status in ('accepted', 'in_progress', 'rework')),
               'review', count(*) filter (where t.status = 'pending_review')
             )
        from tasks t
       where t.company_id = v_company and t.assignee_id = v_state.employee_id
    ),
    -- хорошее тоже видно: что директор принял сегодня (D-45 — позитив можно)
    'done_today', (
      select jsonb_build_object(
               'count', count(*),
               'titles', coalesce(
                 (select jsonb_agg(d.title order by d.closed_at desc)
                    from (select case when v_guest then null else t2.title end as title, t2.closed_at
                            from tasks t2
                           where t2.company_id = v_company and t2.assignee_id = v_state.employee_id
                             and t2.status = 'done' and t2.closed_at >= v_day
                           order by t2.closed_at desc limit 3) d),
                 '[]'::jsonb)
             )
        from tasks t
       where t.company_id = v_company and t.assignee_id = v_state.employee_id
         and t.status = 'done' and t.closed_at >= v_day
    ),
    -- очки недели: только когда очки включены и в комнате нет гостя (D-33, D-40)
    'points_week', case
      when v_points and not v_guest then (
        select r.points from fn_rating(now() - interval '7 days', now() + interval '1 minute') r
         where r.user_id = v_state.employee_id
      )
    end,
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id,
               -- гостю названий не показываем вовсе: экран скажет «Поручение»
               'title', case when v_guest then null else t.title end,
               'status', t.status,
               'deadline', t.deadline
             ) order by t.deadline nulls last, t.created_at)
        from (
          select t2.id, t2.title, t2.status, t2.deadline, t2.created_at
            from tasks t2
           where t2.company_id = v_company
             and t2.assignee_id = v_state.employee_id
             -- отказ, отложенная и закрытые на стену не выносятся (D-45)
             and t2.status in ('sent','accepted','in_progress','rework','pending_review')
           order by t2.deadline nulls last, t2.created_at
           limit 12
        ) t
    ), '[]'::jsonb)
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. tv_calendar — неделя вперёд для заставки «Календарь». Роль `tv` таблицу events
--    не читает (D-78 §4): функция отдаёт готовое, гостю — без названий и мест (D-33).
-- ---------------------------------------------------------------------------
create or replace function tv_calendar(p_guest boolean default false, p_days int default 7) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_company uuid;
  v_day     timestamptz;
  v_days    int := least(greatest(coalesce(p_days, 7), 1), 14);
begin
  if auth_role() not in ('tv', 'director') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  v_company := auth_company_id();
  v_day := date_trunc('day', now() at time zone 'Asia/Aqtobe') at time zone 'Asia/Aqtobe';

  return jsonb_build_object(
    'from', v_day,
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
             and e.starts_at >= v_day
             and e.starts_at < v_day + make_interval(days => v_days)
           order by e.starts_at
           limit 60
        ) e
    ), '[]'::jsonb)
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 6. Гранты — та же схема, что у tv_focus (20260918100000)
-- ---------------------------------------------------------------------------
revoke execute on function tv_control(text, uuid, uuid, text, boolean, boolean, text) from public, anon;
revoke execute on function tv_calendar(boolean, int) from public, anon;
revoke execute on function tv_guest_on(tv_state) from public, anon;
grant execute on function tv_control(text, uuid, uuid, text, boolean, boolean, text) to authenticated, service_role;
grant execute on function tv_calendar(boolean, int) to authenticated, service_role;
grant execute on function tv_guest_on(tv_state) to authenticated, service_role;
