-- ТВ-режим (`/tv`): экран-наблюдатель в кабинете. Киоск — auth-пользователь роли `tv`,
-- который по RLS не видит НИЧЕГО из рабочих таблиц (20260907150000_guards_and_tv_isolation):
-- его источник данных — только эта таблица событий и `tv_summary()`
-- (docs/DATABASE.md «tv_events», docs/BACKEND.md «ТВ»).
--
-- Два поля payload вместо одного: гостевой режим («Посетитель») обязан рендериться из
-- ПРЕДМАСКИРОВАННЫХ данных — фамилий, очков и текстов в `payload_guest` физически нет,
-- маскировка не может «забыться» на клиенте. Состав маски — D-33 в редакции рекомендации
-- (финализация 2026-08-14): гостю не видны фамилии, очки И названия контрагентов, поэтому
-- заголовок поручения гостю не отдаётся вовсе — экран скажет «Поручение».
--
-- Что на ТВ не выносится: отказ, доработка и просрочка по именам — негатив видит только
-- адресат в своём канале, никогда Эфир, рейтинг или ТВ (D-45). Просрочки попадают на
-- экран лишь числом в вердикте `tv_summary()`, без имён.

create table tv_events (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies,
  kind          text not null check (kind in (
                  'task_sent','task_accepted','task_review','task_done',
                  'points','announcement','merch')),
  -- о ком событие: сотрудник, а не автор поручения
  actor_id      uuid references profiles,
  task_id       uuid references tasks on delete cascade,
  payload       jsonb not null default '{}',
  payload_guest jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

comment on table tv_events is 'Projection for the kiosk: the tv role reads nothing else. payload_guest is pre-masked (D-33).';
comment on column tv_events.payload is '{ name, title, amount }; guest copy drops the surname and every points number';

create index tv_events_company_created_idx on tv_events (company_id, created_at desc);

alter table tv_events enable row level security;

-- read: the kiosk and the director of the company; writes have no policy at all —
-- rows are born in the projection triggers (security definer) and nowhere else
create policy tv_events_select on tv_events for select
  using (company_id = auth_company_id() and auth_role() in ('tv', 'director'));

-- Realtime: postgres_changes under RLS, same replayable guard as 20260910120000
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tv_events'
  ) then
    alter publication supabase_realtime add table tv_events;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- tv_emit -- один вход для всех проекций: резолвит имя и строит обе копии payload
-- ---------------------------------------------------------------------------
create or replace function tv_emit(
  p_company uuid, p_kind text, p_actor uuid, p_task uuid, p_title text, p_amount int,
  -- что от заголовка остаётся гостю: null почти везде, название награды — можно
  p_title_guest text default null
) returns void
language plpgsql security definer set search_path = public
as $fn$
declare
  v_name  text;
  v_first text;
begin
  select full_name into v_name from profiles where id = p_actor;
  v_first := nullif(split_part(coalesce(v_name, ''), ' ', 1), '');

  insert into tv_events (company_id, kind, actor_id, task_id, payload, payload_guest)
  values (
    p_company, p_kind, p_actor, p_task,
    jsonb_build_object('name', v_name,  'title', p_title, 'amount', p_amount),
    -- гость: имя без фамилии, ни одной цифры очков, ни одного названия (D-33)
    jsonb_build_object('name', v_first, 'title', p_title_guest, 'amount', null)
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Проекции: задачи, очки, объявления, выдача мерча
-- ---------------------------------------------------------------------------
create or replace function tv_events_task() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_kind text;
begin
  if tg_op = 'INSERT' then
    -- отложенная задача живёт для адресата, а не для экрана: ждём перехода в sent
    if new.status = 'sent' then v_kind := 'task_sent'; end if;
  elsif new.status is distinct from old.status then
    v_kind := case new.status
                when 'sent'           then 'task_sent'
                when 'accepted'       then 'task_accepted'
                when 'pending_review' then 'task_review'
                when 'done'           then 'task_done'
                else null                       -- declined / rework / revoked: D-45
              end;
  end if;

  if v_kind is null then return null; end if;
  perform tv_emit(new.company_id, v_kind, new.assignee_id, new.id, new.title, null);
  return null;
end;
$fn$;

create trigger trg_tv_events_task
  after insert or update on tasks
  for each row execute function tv_events_task();

create or replace function tv_events_points() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  -- на экран идёт только поощрение: списание в магазине — движение по счёту, а минус
  -- сотруднику публично не показывают (D-45)
  if new.amount <= 0 or new.source in ('shop_hold', 'shop_release') then
    return null;
  end if;
  perform tv_emit(new.company_id, 'points', new.user_id, new.task_id, new.reason, new.amount);
  return null;
end;
$fn$;

create trigger trg_tv_events_points
  after insert on point_transactions
  for each row execute function tv_events_points();

create or replace function tv_events_announcement() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  perform tv_emit(new.company_id, 'announcement', new.author_id, null, new.transcript, null);
  return null;
end;
$fn$;

create trigger trg_tv_events_announcement
  after insert on announcements
  for each row execute function tv_events_announcement();

create or replace function tv_events_order() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_title text;
begin
  if new.status <> 'delivered' or old.status is not distinct from 'delivered' then
    return null;
  end if;
  select title into v_title from shop_items where id = new.item_id;
  -- награда — своя, не контрагент: её видит и гость
  perform tv_emit(new.company_id, 'merch', new.user_id, null, v_title, null, v_title);
  return null;
end;
$fn$;

create trigger trg_tv_events_order
  after update on orders
  for each row execute function tv_events_order();

-- ---------------------------------------------------------------------------
-- tv_events_prune -- лента экрана живёт последними событиями; хвост не нужен.
-- Вызов — руками или из pg_cron, когда расписания появятся (docs/BACKEND.md).
-- ---------------------------------------------------------------------------
create or replace function tv_events_prune(p_days int default 30) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_deleted int;
begin
  delete from tv_events where created_at < now() - make_interval(days => p_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- tv_summary -- всё, что на экране не лента: вердикт, три числа дня и карусель
-- (топ-5 → загрузка людей → неделя → выдачи мерча). Единственный вызов, который
-- роли `tv` разрешён помимо чтения tv_events (docs/DATABASE.md «tv_events»).
-- `p_guest` — гостевой режим: маска считается здесь, а не на клиенте (D-33).
-- ---------------------------------------------------------------------------
create or replace function tv_summary(p_guest boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_company  uuid := auth_company_id();
  v_now      timestamptz := now();
  -- сутки компании, а не UTC: в БД всё в UTC, показываем в Asia/Aqtobe (CLAUDE.md §6)
  v_day      timestamptz := date_trunc('day', v_now at time zone 'Asia/Aqtobe') at time zone 'Asia/Aqtobe';
  v_week     timestamptz := v_day - interval '6 days';
  v_settings jsonb;
begin
  if auth.uid() is not null and auth_role() not in ('tv', 'director') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_company is null then
    return '{}'::jsonb;
  end if;

  select c.settings into v_settings from companies c where c.id = v_company;

  return jsonb_build_object(
    'guest', coalesce(p_guest, false),
    'points_enabled', coalesce((v_settings->>'points_enabled')::boolean, false),
    'now', v_now,

    -- вердикт: только числа, ни одного имени — негатив на ТВ безличен (D-45)
    'counts', (
      select jsonb_build_object(
        'overdue',  count(*) filter (where t.deadline < v_now and t.status in ('sent','accepted','in_progress','rework')),
        'declined', count(*) filter (where t.status = 'declined'),
        'review',   count(*) filter (where t.status = 'pending_review'),
        'questions', (
          select count(distinct m.task_id)
            from task_messages m
            join tasks q on q.id = m.task_id
           where m.company_id = v_company
             and (m.meta->>'is_question')::boolean is true
             and m.meta->>'answered_at' is null
             and q.status not in ('done','revoked','declined')
        )
      )
      from tasks t where t.company_id = v_company
    ),

    -- три числа дня
    'today', (
      select jsonb_build_object(
        'sent',   count(*) filter (where t.created_at >= v_day and t.status <> 'scheduled'),
        'done',   count(*) filter (where t.status = 'done' and t.closed_at >= v_day),
        'in_work', count(*) filter (where t.status in ('sent','accepted','in_progress','rework'))
      )
      from tasks t where t.company_id = v_company
    ),

    -- карусель 1: топ-5 недели, через тот же fn_rating, что и экран «Рейтинг»
    'rating', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name',   case when p_guest then split_part(r.display_name, ' ', 1) else r.display_name end,
               -- гостю очки не показываем: остаётся порядок мест
               'points', case when p_guest then null else r.points end,
               'rank',   r.rank
             ) order by r.rank)
        from fn_rating(v_now - interval '7 days', v_now + interval '1 minute') r
       where r.rank <= 5
    ), '[]'::jsonb),

    -- карусель 2: загрузка людей
    'load', coalesce((
      select jsonb_agg(jsonb_build_object('name', l.name, 'active', l.active, 'overdue', l.overdue)
                       order by l.sort_name)
        from (
          -- сортировочное имя остаётся внутри подзапроса: в выдачу гостю фамилия не попадает
          select case when p_guest then split_part(p.full_name, ' ', 1) else p.full_name end as name,
                 p.full_name as sort_name,
                 count(t.id) filter (where t.status in ('sent','accepted','in_progress','rework')) as active,
                 count(t.id) filter (where t.deadline < v_now and t.status in ('sent','accepted','in_progress','rework')) as overdue
            from profiles p
            left join tasks t on t.assignee_id = p.id and t.company_id = v_company
           where p.company_id = v_company and p.is_active
             and p.role in ('employee','manager','shopkeeper')
           group by p.id, p.full_name
        ) l
    ), '[]'::jsonb),

    -- карусель 3: неделя — сколько задач закрыто по дням (график рисуется руками, без Recharts)
    'week', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'done', d.done) order by d.day)
        from (
          select (g.day at time zone 'Asia/Aqtobe')::date as day,
                 (select count(*) from tasks t
                   where t.company_id = v_company and t.status = 'done'
                     and t.closed_at >= g.day and t.closed_at < g.day + interval '1 day') as done
            from generate_series(v_week, v_day, interval '1 day') g(day)
        ) d
    ), '[]'::jsonb),

    -- карусель 4: выдачи мерча за две недели
    'merch', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name',  case when p_guest then split_part(p.full_name, ' ', 1) else p.full_name end,
               'title', i.title,
               'at',    o.delivered_at
             ) order by o.delivered_at desc)
        from orders o
        join profiles p on p.id = o.user_id
        join shop_items i on i.id = o.item_id
       where o.company_id = v_company and o.status = 'delivered'
         and o.delivered_at >= v_now - interval '14 days'
    ), '[]'::jsonb)
  );
end;
$fn$;

revoke execute on function tv_emit(uuid, text, uuid, uuid, text, int, text) from public, anon;
revoke execute on function tv_events_prune(int) from public, anon;
revoke execute on function tv_summary(boolean) from public, anon;
grant execute on function tv_summary(boolean) to authenticated, service_role;
grant execute on function tv_events_prune(int) to service_role;
