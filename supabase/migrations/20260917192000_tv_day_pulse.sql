-- ТВ-режим: фон экрана — настоящий пульс дня, а не декоративный зубец.
-- `tv_summary` отдаёт ещё один ключ: `pulse` — 24 числа, по событию на час суток компании
-- (Asia/Aqtobe). Экран рисует по ним кривую дня дальним слоем: к обеду она растёт, к вечеру
-- оседает, и стена показывает ритм компании, а не орнамент. Остальное тело функции — один
-- в один из 20260917191000 (create or replace требует всю функцию целиком).

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
