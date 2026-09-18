-- Пульт ТВ (наряд 013A, решение D-76): что показывает стена в кабинете.
--
-- Зачем строка, а не broadcast: киоск перезагружается каждую ночь в 04:00 и по деплою.
-- Эфемерная команда после перезагрузки теряется, строка — нет; пульт директора читает
-- ту же строку и потому всегда показывает, что на стене прямо сейчас (D-76 §1).
--
-- Зачем писать только через RPC: политик insert/update/delete у таблицы нет вовсе,
-- поэтому «сотрудник командует экраном» невозможно даже при ошибке в клиенте —
-- проверка роли живёт внутри security definer функции (D-76 §2).
--
-- Зачем команда абсолютная, а не дельта: повтор той же команды даёт ту же строку,
-- поэтому client_request_id здесь не нужен — сознательное исключение из принципа 7
-- CLAUDE.md (D-76 §3). Пульт не ставит команды в оффлайн-очередь.
--
-- Зачем `expires_at`: фокус на сотруднике живёт 10 минут и гаснет по часам киоска,
-- без cron и без таймеров на пульте (D-76 §5). Повторная команда продлевает.
--
-- Зачем `version` / `applied_version` / `seen_at`: доставка с квитанциями (принцип 8)
-- действует и для экрана — пульт отличает «на стене» от «отправлено, экран не показал»
-- и от «экран не отвечает с 9:14» (D-76 §9).
--
-- Что на стену не выносится: маска гостя (D-33) считается здесь, в БД, а не на клиенте;
-- негатив по именам (отказ, доработка, просрочка) в фокус не попадает вовсе (D-45) —
-- срок печатается нейтрально, датой.

create table tv_state (
  company_id          uuid primary key references companies,
  mode                text not null default 'ether'
                      check (mode in ('ether','employee','task')),
  employee_id         uuid references profiles on delete set null,
  task_id             uuid references tasks on delete set null,
  scene               text not null default 'face'
                      check (scene in ('face','clock','team')),
  guest               boolean not null default false,
  expires_at          timestamptz,            -- focus ends here; null = no focus
  version             int not null default 0, -- bumped by every tv_control; the kiosk acks it
  reload_requested_at timestamptz,
  seen_at             timestamptz,            -- kiosk heartbeat
  applied_version     int,                    -- last version the kiosk rendered
  updated_by          uuid references profiles,
  updated_at          timestamptz not null default now()
);

comment on table tv_state is 'one row per company: what the wall shows; written only by tv_control / tv_heartbeat (D-76)';
comment on column tv_state.expires_at is 'focus on an employee dies by the kiosk clock, no cron (D-76)';
comment on column tv_state.applied_version is 'receipt of the wall: equal to version means the kiosk has rendered it';

create trigger trg_tv_state_updated_at
  before update on tv_state
  for each row execute function moddatetime(updated_at);

alter table tv_state enable row level security;

-- read: the kiosk and the director of the company. Writes have no policy at all —
-- the row is born and changed inside tv_control / tv_heartbeat and nowhere else.
create policy tv_state_select on tv_state for select
  using (company_id = auth_company_id() and auth_role() in ('tv', 'director'));

-- Realtime: postgres_changes under RLS, same replayable guard as 20260910120000
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tv_state'
  ) then
    alter publication supabase_realtime add table tv_state;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- tv_control -- единственная дверь к строке. Команда абсолютная: null-параметр
-- означает «не трогай», а не «сбрось». Возвращает итоговую строку, чтобы пульт
-- не перечитывал её отдельным запросом.
-- ---------------------------------------------------------------------------
create or replace function tv_control(
  p_mode        text    default null,   -- null = unchanged
  p_employee_id uuid    default null,
  p_task_id     uuid    default null,
  p_scene       text    default null,   -- null = unchanged
  p_guest       boolean default null,   -- null = unchanged
  p_reload      boolean default false
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

  if p_scene is not null and p_scene not in ('face', 'clock', 'team') then
    raise exception 'bad_scene' using errcode = 'P0001';
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
    company_id, mode, employee_id, task_id, scene, guest, expires_at,
    version, reload_requested_at, updated_by, updated_at
  ) values (
    v_company,
    coalesce(v_mode, 'ether'),
    v_employee,
    v_task,
    coalesce(p_scene, 'face'),
    coalesce(p_guest, false),
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
    version             = s.version + 1,
    reload_requested_at = case when p_reload then now() else s.reload_requested_at end,
    updated_by          = auth.uid(),
    updated_at          = now()
  returning * into v_row;

  return v_row;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- tv_focus -- данные фокуса одним вызовом. Роль `tv` по-прежнему не читает ни
-- `tasks`, ни `profiles`: функция сама берёт строку своей компании и отдаёт уже
-- готовое. Маска гостя — та же, что в tv_emit (D-33); негатива в выдаче нет (D-45).
-- ---------------------------------------------------------------------------
create or replace function tv_focus() returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_company uuid;
  v_state   tv_state;
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

  return jsonb_build_object(
    'mode', 'employee',
    'guest', v_state.guest,
    'expires_at', v_state.expires_at,
    'employee', (
      select jsonb_build_object(
               'id', p.id,
               -- гость видит имя без фамилии, та же маска, что у ленты экрана (D-33)
               'name', case when v_state.guest
                            then split_part(p.full_name, ' ', 1)
                            else p.full_name end,
               'position', p."position"
             )
        from profiles p where p.id = v_state.employee_id
    ),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id,
               -- гостю названий не показываем вовсе: экран скажет «Поручение»
               'title', case when v_state.guest then null else t.title end,
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
           limit 8
        ) t
    ), '[]'::jsonb)
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- tv_heartbeat -- квитанция экрана. Зовёт только киоск: директор, открывший /tv
-- с ноутбука, за стену не расписывается. Строку создаёт сам, если пульт ещё ни
-- разу не командовал.
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
end;
$fn$;

revoke execute on function tv_control(text, uuid, uuid, text, boolean, boolean) from public, anon;
revoke execute on function tv_focus() from public, anon;
revoke execute on function tv_heartbeat(int) from public, anon;
grant execute on function tv_control(text, uuid, uuid, text, boolean, boolean) to authenticated, service_role;
grant execute on function tv_focus() to authenticated, service_role;
grant execute on function tv_heartbeat(int) to authenticated, service_role;
