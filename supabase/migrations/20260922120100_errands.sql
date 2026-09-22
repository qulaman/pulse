-- Заявки директора секретарю (наряд 015A, решение D-79).
--
-- Зачем своя сущность, а не задача: у «кофе», «врача» и «зайди ко мне» нет приёмки
-- директором, нет дедлайна, нет очков и нет /confirm. Заявка живёт пять минут и
-- гаснет; свой короткий автомат `sent → accepted → done | declined | cancelled`
-- честнее, чем девять статусов задачи, из которых используются два.
--
-- Зачем роль, а не флаг: секретарь — обычный сотрудник (задачи, Лента, Эфир, магазин,
-- рейтинг) плюс право читать и вести заявки. Секретарей может быть несколько; заявка
-- уходит всем, забирает первая нажавшая «Принял» (`already_claimed` остальным).
--
-- Зачем `team_role()`: списки «кто в команде» перечисляли роли руками в SQL и в TS.
-- Следующая роль стоила бы правки в каждом. Теперь один хелпер в SQL и одна
-- константа в TS; здесь на него переведены `fn_rating` и карусель загрузки `tv_summary`.
--
-- Зачем `kind` и `label` рядом: каталог кнопок — данные компании
-- (`company.settings.secretary.actions`, V-02). Кнопку могут переименовать, а история
-- обязана остаться той, какой была в момент просьбы: `kind` — код, `label` — снимок.
--
-- Зачем нет `target_user_id`: «зайди ко мне» зовёт секретаря. Позвать произвольного
-- сотрудника — это примитив «личное сообщение» (D-75 §8а), а не заявка (G.15).
--
-- Зачем заявки мимо окна доставки (D-38): заявка живёт минуты, «кофе в 21:05» утром
-- не нужен. Поэтому `notification_deliveries_deliver_after()` здесь не трогается —
-- неизвестный ему `event_kind` уходит сразу.
--
-- Зачем `escalated_at` в самой строке: один повторный пуш через `escalate_after_min`
-- идемпотентен без отдельной таблицы — как `events.reminded_at` у мероприятий.
--
-- Чего здесь нет: очков за заявки, стены и ТВ (D-45: функции стены заявок не читают),
-- Telegram-яруса, заявок от сотрудников, повторяющихся заявок.

-- ---------------------------------------------------------------------------
-- 1. Хелпер команды и списки, которые больше не перечисляют роли руками
-- ---------------------------------------------------------------------------
create or replace function team_role(r user_role) returns boolean
language sql immutable
as $$ select r in ('employee', 'manager', 'shopkeeper', 'secretary') $$;

comment on function team_role(user_role) is 'who counts as the team: everybody but the director and the kiosk';

-- fn_rating — тело целиком из 20260910140000_points_and_settings.sql, где список
-- ролей заменён на team_role(): секретарь стоит в рейтинге рядом со всеми.
create or replace function fn_rating(p_from timestamptz, p_to timestamptz)
returns table (
  user_id uuid, display_name text, points int, rank int, delta_vs_prev int,
  on_time_pct numeric, is_me boolean
)
language plpgsql security definer set search_path = public
as $fn$
declare
  v_company uuid := auth_company_id();
  v_user    uuid := auth.uid();
  v_mode    text;
  v_span    interval := p_to - p_from;
begin
  if v_company is null then
    return;
  end if;
  select coalesce(c.settings->>'rating_mode', 'top5') into v_mode from companies c where c.id = v_company;

  return query
  with people as (
    select p.id, p.full_name
      from profiles p
     where p.company_id = v_company and p.is_active
       and team_role(p.role)
  ),
  cur as (
    select t.user_id, sum(t.amount)::int as pts
      from point_transactions t
     where t.company_id = v_company and t.created_at >= p_from and t.created_at < p_to
     group by t.user_id
  ),
  prev as (
    select t.user_id, sum(t.amount)::int as pts
      from point_transactions t
     where t.company_id = v_company and t.created_at >= p_from - v_span and t.created_at < p_from
     group by t.user_id
  ),
  done as (
    select k.assignee_id,
           count(*) filter (where k.deadline is null or k.closed_at <= k.deadline)::numeric as on_time,
           count(*)::numeric as total
      from tasks k
     where k.company_id = v_company and k.status = 'done'
       and k.closed_at >= p_from and k.closed_at < p_to
     group by k.assignee_id
  ),
  ranked as (
    select pe.id as uid, pe.full_name as name,
           coalesce(cur.pts, 0) as pts,
           coalesce(cur.pts, 0) - coalesce(prev.pts, 0) as delta,
           case when done.total > 0 then round(100 * done.on_time / done.total, 0) else null end as otp,
           dense_rank() over (order by coalesce(cur.pts, 0) desc, pe.full_name) as rnk
      from people pe
      left join cur  on cur.user_id = pe.id
      left join prev on prev.user_id = pe.id
      left join done on done.assignee_id = pe.id
  )
  select r.uid, r.name, r.pts, r.rnk::int, r.delta, r.otp, r.uid = v_user
    from ranked r
   where v_mode = 'full' or auth_role() = 'director' or r.rnk <= 5 or r.uid = v_user
   order by r.rnk, r.name;
end;
$fn$;

-- tv_summary — тело целиком из 20260918150000_calendar_events.sql §10, где та же
-- строка карусели «загрузка людей» заменена на team_role(). Заявки стена не читает (D-45).
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

    -- фон экрана: пульс дня — сколько событий пришлось на каждый час суток компании
    'pulse', coalesce((
      select jsonb_agg(coalesce(c.events, 0) order by c.hour)
        from (
          select h.hour,
                 (select count(*) from tv_events e
                   where e.company_id = v_company
                     and e.created_at >= v_day + make_interval(hours => h.hour)
                     and e.created_at <  v_day + make_interval(hours => h.hour + 1)) as events
            from generate_series(0, 23) h(hour)
        ) c
    ), '[]'::jsonb),

    -- ближайшие встречи: бегущая строка и сцена «часы». Гостю — ни названия, ни места (D-33)
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id,
               'title', case when p_guest then null else e.title end,
               'starts_at', e.starts_at,
               'location', case when p_guest then null else e.location end,
               'people', (select count(*) from event_participants ep
                           where ep.event_id = e.id and ep.status <> 'declined')
             ) order by e.starts_at)
        from (
          select * from events e
           where e.company_id = v_company and e.cancelled_at is null
             and e.starts_at >= v_now - interval '30 minutes'
             and e.starts_at < v_day + interval '2 days'
           order by e.starts_at limit 6
        ) e
    ), '[]'::jsonb),

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
        'sent',    count(*) filter (where t.created_at >= v_day and t.status <> 'scheduled'),
        'done',    count(*) filter (where t.status = 'done' and t.closed_at >= v_day),
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

    -- карусель 2: загрузка людей — сколько на ком работы, и ни слова о долгах (D-45)
    'load', coalesce((
      select jsonb_agg(jsonb_build_object('name', l.name, 'active', l.active) order by l.sort_name)
        from (
          -- сортировочное имя остаётся внутри подзапроса: в выдачу гостю фамилия не попадает
          select case when p_guest then split_part(p.full_name, ' ', 1) else p.full_name end as name,
                 p.full_name as sort_name,
                 count(t.id) filter (where t.status in ('sent','accepted','in_progress','rework')) as active
            from profiles p
            left join tasks t on t.assignee_id = p.id and t.company_id = v_company
           where p.company_id = v_company and p.is_active
             and team_role(p.role)
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

    -- карусель 4: выдачи наград за две недели
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

-- ---------------------------------------------------------------------------
-- 2. Тип и таблица
-- ---------------------------------------------------------------------------
create type errand_status as enum ('sent', 'accepted', 'done', 'declined', 'cancelled');

create table errands (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies,
  author_id         uuid not null references profiles,       -- the director who asked
  kind              text not null,                           -- code from company.settings.secretary.actions
  label             text not null,                           -- the button's label at the time of asking
  note              text,                                    -- «без сахара», «в переговорную»
  status            errand_status not null default 'sent',
  claimed_by        uuid references profiles,                -- the secretary who took it
  decline_reason    text,
  audio_path        text,                                    -- voice bucket; never edited (principle 5)
  source_transcript text,
  inbox_item_id     uuid references inbox_items on delete set null,
  client_request_id uuid,
  escalated_at      timestamptz,                             -- the one repeat push went out
  created_at        timestamptz not null default now(),
  accepted_at       timestamptz,
  done_at           timestamptz,
  updated_at        timestamptz not null default now()
);

comment on table errands is 'director''s short requests to the secretary; kind = catalog code, label = its snapshot; never shown on the wall';

create trigger trg_errands_updated_at
  before update on errands
  for each row execute function moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- 3. Индексы: живые заявки компании, история автора, идемпотентность вставки
-- ---------------------------------------------------------------------------
create index errands_company_active_idx on errands (company_id, created_at desc)
  where status in ('sent', 'accepted');
create index errands_author_idx on errands (author_id, created_at desc);
-- idempotency of a direct insert from the client (CLAUDE.md principle 7)
create unique index errands_client_request_idx on errands (client_request_id)
  where client_request_id is not null;

-- ---------------------------------------------------------------------------
-- 4. RLS: читают автор, любой секретарь компании и директор; `tv` — никогда.
--    Политик update/delete нет вовсе: переходы идут только через transition_errand.
-- ---------------------------------------------------------------------------
alter table errands enable row level security;

create policy errands_select on errands for select using (
  company_id = (select auth_company_id())
  and (author_id = (select auth.uid()) or (select auth_role()) in ('director', 'secretary'))
);

create policy errands_insert on errands for insert with check (
  company_id = (select auth_company_id())
  and author_id = (select auth.uid())
  and (select auth_role()) = 'director'
);

-- Realtime: карточка у секретаря зажигается и гаснет без перезагрузки.
-- Guard — как в 20260910120000_realtime_publication.sql: миграция обязана быть
-- переигрываемой на всём флоте (V-02).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'errands'
  ) then
    alter publication supabase_realtime add table errands;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. Outbox (принцип 8): просьба — секретарям, ответ — автору.
--    Колонка task_id у заявок пуста, адрес карточки лежит в meta.errand_id.
-- ---------------------------------------------------------------------------
create or replace function notify_outbox_errand() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_name text;
begin
  if tg_op = 'INSERT' then
    if new.status = 'sent' then
      insert into notification_deliveries (company_id, user_id, event_kind, meta)
      select new.company_id, p.id, 'errand_sent',
             jsonb_build_object(
               'title', new.label,
               'body', coalesce(new.note, ''),
               'errand_id', new.id,
               'url', '/secretary?e=' || new.id)
        from profiles p
       where p.company_id = new.company_id
         and p.role = 'secretary'
         and p.is_active
         and p.id <> new.author_id;
    end if;
    return null;
  end if;

  if new.status is not distinct from old.status then
    return null;
  end if;

  if new.status = 'accepted' then
    select split_part(pr.full_name, ' ', 1) into v_name from profiles pr where pr.id = new.claimed_by;
    insert into notification_deliveries (company_id, user_id, event_kind, meta)
    values (new.company_id, new.author_id, 'errand_accepted',
            jsonb_build_object(
              -- род не угадываем: «Принято · Айгуль», а не «приняла» (docs/DESIGN.md)
              'title', 'Принято · ' || coalesce(v_name, 'секретарь'),
              'body', new.label,
              'errand_id', new.id,
              'url', '/secretary?e=' || new.id));

  elsif new.status = 'done' then
    select split_part(pr.full_name, ' ', 1) into v_name from profiles pr where pr.id = new.claimed_by;
    insert into notification_deliveries (company_id, user_id, event_kind, meta)
    values (new.company_id, new.author_id, 'errand_done',
            jsonb_build_object(
              'title', 'Готово · ' || coalesce(v_name, 'секретарь'),
              'body', new.label,
              'errand_id', new.id,
              'url', '/secretary?e=' || new.id));

  elsif new.status = 'declined' then
    -- отказать может и тот, кто заявку не брал: тогда имя — у того, кто позвал RPC
    select split_part(pr.full_name, ' ', 1) into v_name
      from profiles pr where pr.id = coalesce(new.claimed_by, auth.uid());
    insert into notification_deliveries (company_id, user_id, event_kind, meta)
    values (new.company_id, new.author_id, 'errand_declined',
            jsonb_build_object(
              'title', 'Не может · ' || coalesce(v_name, 'секретарь'),
              'body', new.label || coalesce(' · ' || new.decline_reason, ''),
              'errand_id', new.id,
              'url', '/secretary?e=' || new.id));

  elsif new.status = 'cancelled' then
    -- пуша нет: отменённую просьбу молча снимаем с очереди, карточка гаснет по Realtime
    delete from notification_deliveries
     where status = 'queued' and meta->>'errand_id' = new.id::text;
  end if;

  return null;
end
$fn$;

create trigger trg_notify_outbox_errand
  after insert or update of status on errands
  for each row execute function notify_outbox_errand();

-- ---------------------------------------------------------------------------
-- 6. transition_errand — весь автомат заявки одной транзакцией. Идемпотентность
--    через ingest_batches, как у transition_task (20260917140000).
-- ---------------------------------------------------------------------------
create or replace function transition_errand(
  p_id uuid,
  p_to text,
  p_reason text default null,
  client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid    uuid := client_request_id;      -- the parameter shadows a column name
  v_company uuid := auth_company_id();
  v_user    uuid := auth.uid();
  v_role    text := auth_role();
  v_result  jsonb;
  v_row     errands%rowtype;
  v_new     errands%rowtype;
begin
  if p_to not in ('accepted', 'done', 'declined', 'cancelled') then
    raise exception 'bad_status' using errcode = 'P0001';
  end if;

  if v_crid is not null then
    insert into ingest_batches (company_id, user_id, client_request_id, result)
    values (v_company, v_user, v_crid, '{}'::jsonb)
    on conflict on constraint ingest_batches_company_request_key do nothing;

    if not found then
      select b.result into v_result
        from ingest_batches b
       where b.company_id = v_company and b.client_request_id = v_crid;
      return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('duplicate', true);
    end if;
  end if;

  select * into v_row from errands e
   where e.id = p_id and e.company_id = v_company
   for update;
  if v_row.id is null then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  if p_to = 'accepted' then
    if v_role is distinct from 'secretary' then
      raise exception 'forbidden' using errcode = 'P0001';
    end if;
    -- забирает первая нажавшая: второй секретарь строку уже не найдёт в 'sent'
    update errands e
       set status = 'accepted', claimed_by = v_user, accepted_at = now()
     where e.id = p_id and e.status = 'sent'
    returning * into v_new;
    if v_new.id is null then
      raise exception 'already_claimed' using errcode = 'P0001';
    end if;

  elsif p_to = 'done' then
    if v_row.status <> 'accepted' or v_row.claimed_by is distinct from v_user then
      raise exception 'bad_transition' using errcode = 'P0001';
    end if;
    update errands e set status = 'done', done_at = now()
     where e.id = p_id
    returning * into v_new;

  elsif p_to = 'declined' then
    if v_row.status = 'sent' then
      if v_role is distinct from 'secretary' then
        raise exception 'forbidden' using errcode = 'P0001';
      end if;
    elsif v_row.status = 'accepted' then
      if v_row.claimed_by is distinct from v_user then
        raise exception 'bad_transition' using errcode = 'P0001';
      end if;
    else
      raise exception 'bad_transition' using errcode = 'P0001';
    end if;
    update errands e
       set status = 'declined',
           decline_reason = nullif(p_reason, ''),
           claimed_by = coalesce(e.claimed_by, v_user)
     where e.id = p_id
    returning * into v_new;

  else  -- cancelled: отзывает только тот, кто просил
    if v_row.author_id is distinct from v_user then
      raise exception 'forbidden' using errcode = 'P0001';
    end if;
    if v_row.status not in ('sent', 'accepted') then
      raise exception 'bad_transition' using errcode = 'P0001';
    end if;
    update errands e set status = 'cancelled'
     where e.id = p_id
    returning * into v_new;
  end if;

  v_result := to_jsonb(v_new);

  if v_crid is not null then
    update ingest_batches b set result = v_result
     where b.company_id = v_company and b.client_request_id = v_crid;
  end if;

  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 7. errands_due_escalation — минутный тик POST /api/push/sweep: один повторный
--    пуш через settings.secretary.escalate_after_min. Идемпотентность держится на
--    errands.escalated_at, как у events.reminded_at.
-- ---------------------------------------------------------------------------
create or replace function errands_due_escalation(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_errand errands%rowtype;
  v_count  int := 0;
begin
  for v_errand in
    select e.* from errands e
      join companies c on c.id = e.company_id
     where e.status = 'sent'
       and e.escalated_at is null
       and e.created_at + make_interval(
             mins => coalesce((c.settings->'secretary'->>'escalate_after_min')::int, 3)) <= p_now
       -- после долгого простоя вчерашние просьбы не спамят
       and e.created_at > p_now - interval '1 hour'
     order by e.created_at
     for update of e skip locked
  loop
    insert into notification_deliveries (company_id, user_id, event_kind, meta)
    select v_errand.company_id, p.id, 'errand_sent',
           jsonb_build_object(
             'title', 'Ещё раз: ' || v_errand.label,
             'body', coalesce(v_errand.note, ''),
             'errand_id', v_errand.id,
             'url', '/secretary?e=' || v_errand.id,
             'repeat', true)
      from profiles p
     where p.company_id = v_errand.company_id
       and p.role = 'secretary'
       and p.is_active
       and p.id <> v_errand.author_id;

    update errands e set escalated_at = p_now where e.id = v_errand.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 8. Гранты: переходы зовёт человек, тик — только свип сервисным ключом
-- ---------------------------------------------------------------------------
revoke execute on function transition_errand(uuid, text, text, uuid) from public, anon;
revoke execute on function errands_due_escalation(timestamptz) from public, anon, authenticated;

grant execute on function transition_errand(uuid, text, text, uuid) to authenticated, service_role;
grant execute on function errands_due_escalation(timestamptz) to service_role;
