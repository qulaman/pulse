-- Стена v5 (D-182) поверх «Отчётов» (D-183): минус за пропущенный отчёт, возвращённый директором
-- по уважительной причине (`daily_report_excused`), — не заработанные очки. «Очков за день» в итоге дня
-- и «очков за неделю» в итоге недели считаются, как «заработано» рейтинга (`tv_rating`, D-183):
-- без возвратов. Тело — 20261118140000_tv_wall_v5.sql, две строки добавлены.

create or replace function tv_summary(p_guest boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_company   uuid := auth_company_id();
  v_now       timestamptz := now();
  v_guest     boolean := coalesce(p_guest, false);
  -- сутки компании, а не UTC: в БД всё в UTC, показываем в Asia/Aqtobe (CLAUDE.md §6)
  v_day       timestamptz := date_trunc('day', v_now at time zone 'Asia/Aqtobe') at time zone 'Asia/Aqtobe';
  v_week      timestamptz := v_day - interval '6 days';
  v_clock     text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  v_settings  jsonb;
  v_points    boolean;
  v_directors uuid[];
  v_done      int;
  v_people    int;
  v_pace      jsonb;
  v_week_res  jsonb;
begin
  if auth.uid() is not null and auth_role() not in ('tv', 'director') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_company is null then
    return '{}'::jsonb;
  end if;

  select c.settings into v_settings from companies c where c.id = v_company;
  v_points := coalesce((v_settings->>'points_enabled')::boolean, false);

  -- the office's owner: the wall calls «через 15 минут» only for the director's own meetings
  select coalesce(array_agg(p.id), '{}') into v_directors
    from profiles p
   where p.company_id = v_company and p.role = 'director' and p.is_active;

  -- what the director accepted today, and from how many people
  select count(*), count(distinct t.assignee_id) into v_done, v_people
    from tasks t
   where t.company_id = v_company and t.status = 'done' and t.closed_at >= v_day;

  -- the pace of the day: today against the same weekday of the last four weeks — by this hour and
  -- the whole day, days without a single accepted task left out (a holiday is no «usual day») — and
  -- the best day of eight weeks. Today itself is not in the record: the wall compares against it.
  with done as (
    select t.closed_at
      from tasks t
     where t.company_id = v_company and t.status = 'done'
       and t.closed_at >= v_day - interval '56 days' and t.closed_at < v_day
  ),
  days as (
    select g.n, v_day - make_interval(days => g.n) as d0
      from generate_series(1, 56) g(n)
  ),
  per_day as (
    select d.n,
           count(x.closed_at) as total,
           count(x.closed_at) filter (where x.closed_at < d.d0 + (v_now - v_day)) as by_now
      from days d
      left join done x on x.closed_at >= d.d0 and x.closed_at < d.d0 + interval '1 day'
     group by d.n
  )
  select jsonb_build_object(
           'done', v_done,
           'usual_now', coalesce(round(avg(p.by_now) filter (where p.n % 7 = 0 and p.n <= 28 and p.total > 0), 1), 0),
           'usual_day', coalesce(round(avg(p.total) filter (where p.n % 7 = 0 and p.n <= 28 and p.total > 0), 1), 0),
           'best_day', coalesce(max(p.total), 0)
         )
    into v_pace
    from per_day p;

  -- the week's result: the last seven days of the company, today included (the same days as `week`)
  with week_days as (
    select (g.day at time zone 'Asia/Aqtobe')::date as day,
           (select count(*) from tasks t
             where t.company_id = v_company and t.status = 'done'
               and t.closed_at >= g.day and t.closed_at < g.day + interval '1 day') as done
      from generate_series(v_week, v_day, interval '1 day') g(day)
  )
  select jsonb_build_object(
           'done', (select coalesce(sum(w.done), 0) from week_days w),
           -- earned, as the rating's «заработано»: rewards and rules, no minus, no refund (D-155)
           'points', case when v_guest or not v_points then null else (
             select coalesce(sum(t.amount), 0)
               from point_transactions t
              where t.company_id = v_company and t.created_at >= v_week
                and t.amount > 0 and t.source in ('manual', 'reaction', 'auto_rule')
                and t.rule_code is distinct from 'refund'
                and t.rule_code is distinct from 'daily_report_missed_refund'
                and t.rule_code is distinct from 'daily_report_excused'
           ) end,
           'best_day', (
             select jsonb_build_object('day', w.day, 'done', w.done)
               from week_days w
              where w.done > 0
              order by w.done desc, w.day desc
              limit 1
           ),
           -- the first of the rating with points, else the one who handed in most; a guest — first name only
           'leader', (
             select case when v_guest then split_part(x.name, ' ', 1) else x.name end
               from (
                 select coalesce(
                   case when v_points then (
                     select r.display_name
                       from fn_rating(v_week, v_now + interval '1 minute') r
                      where r.points > 0
                      order by r.rank, r.display_name
                      limit 1
                   ) end,
                   (select p.full_name
                      from tasks t
                      join profiles p on p.id = t.assignee_id
                     where t.company_id = v_company and t.status = 'done' and t.closed_at >= v_week
                       and p.is_active and team_role(p.role)
                     group by p.id, p.full_name
                     order by count(*) desc, p.full_name
                     limit 1)
                 ) as name
               ) x
              where x.name is not null
           )
         )
    into v_week_res;

  return jsonb_build_object(
    'guest', v_guest,
    'points_enabled', v_points,
    'now', v_now,

    -- the program of the wall's day (D-182): night = after the delivery window till its start,
    -- evening = from the hour Лента asks for the daily report; a broken value reads as the default
    'program', jsonb_build_object(
      'night_from', case when v_settings->'delivery_window'->>'to' ~ v_clock
                         then v_settings->'delivery_window'->>'to' else '21:00' end,
      'night_to', case when v_settings->'delivery_window'->>'from' ~ v_clock
                       then v_settings->'delivery_window'->>'from' else '08:00' end,
      'evening_from', case when v_settings->'daily_report'->>'ask_from' ~ v_clock
                           then v_settings->'daily_report'->>'ask_from' else '17:00' end
    ),

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

    -- ближайшие встречи: бегущая строка и сцена «часы». Гостю — ни названия, ни места (D-33).
    -- `director` — директор созвал встречу или идёт на неё (не отказался)
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id,
               'title', case when v_guest then null else e.title end,
               'starts_at', e.starts_at,
               'location', case when v_guest then null else e.location end,
               'people', (select count(*) from event_participants ep
                           where ep.event_id = e.id and ep.status <> 'declined'),
               'director', e.author_id = any (v_directors)
                           or exists (select 1 from event_participants ep
                                       where ep.event_id = e.id and ep.status <> 'declined'
                                         and ep.user_id = any (v_directors))
             ) order by e.starts_at)
        from (
          select * from events e
           where e.company_id = v_company and e.cancelled_at is null
             and e.starts_at >= v_now - interval '30 minutes'
             and e.starts_at < v_day + interval '2 days'
           order by e.starts_at limit 6
        ) e
    ), '[]'::jsonb),

    -- вердикт: только числа, ни одного имени — негатив на ТВ безличен (D-45); гостю — нули (D-33)
    'counts', case when v_guest
      then jsonb_build_object('overdue', 0, 'declined', 0, 'review', 0, 'questions', 0)
      else (
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
      ) end,

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
               'name',   case when v_guest then split_part(r.display_name, ' ', 1) else r.display_name end,
               -- гостю очки не показываем: остаётся порядок мест
               'points', case when v_guest then null else r.points end,
               'rank',   r.rank
             ) order by r.rank)
        from fn_rating(v_now - interval '7 days', v_now + interval '1 minute') r
       where r.rank <= 5
    ), '[]'::jsonb),

    -- карусель 2: загрузка людей — сколько на ком работы и сколько принято сегодня; ни слова о
    -- долгах (D-45): `overdue` — ноль для старых сборок, которые его ждут
    'load', coalesce((
      select jsonb_agg(jsonb_build_object('name', l.name, 'active', l.active, 'overdue', 0, 'done_today', l.done_today)
                       order by l.sort_name)
        from (
          -- сортировочное имя остаётся внутри подзапроса: в выдачу гостю фамилия не попадает
          select case when v_guest then split_part(p.full_name, ' ', 1) else p.full_name end as name,
                 p.full_name as sort_name,
                 count(t.id) filter (where t.status in ('sent','accepted','in_progress','rework')) as active,
                 count(t.id) filter (where t.status = 'done' and t.closed_at >= v_day) as done_today
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
               'name',  case when v_guest then split_part(p.full_name, ' ', 1) else p.full_name end,
               'title', i.title,
               'at',    o.delivered_at
             ) order by o.delivered_at desc)
        from orders o
        join profiles p on p.id = o.user_id
        join shop_items i on i.id = o.item_id
       where o.company_id = v_company and o.status = 'delivered'
         and o.delivered_at >= v_now - interval '14 days'
    ), '[]'::jsonb),

    -- «Объявление» (D-182): последнее сегодняшнее и сколько людей его прочли. Гостю — нет: текст
    -- объявления — внутреннее слово компании (D-33)
    'announcement', case when v_guest then null else (
      select jsonb_build_object(
               'id', a.id,
               'text', case when char_length(btrim(a.transcript)) > 400
                            then left(btrim(a.transcript), 399) || '…'
                            else btrim(a.transcript) end,
               'at', a.created_at,
               'acks', (select count(*) from announcement_acks k
                         where k.announcement_id = a.id and k.user_id <> a.author_id)
             )
        from announcements a
       where a.company_id = v_company and a.created_at >= v_day and btrim(a.transcript) <> ''
       order by a.created_at desc
       limit 1
    ) end,

    -- «Итог дня» (D-182): принято, заработано (гостю и без очков — нет), сколько людей сдали,
    -- до трёх наград — только поощрения директора и реакции, как в заставке «Рейтинг» (D-133)
    'day', jsonb_build_object(
      'done', v_done,
      'points', case when v_guest or not v_points then null else (
        select coalesce(sum(t.amount), 0)
          from point_transactions t
         where t.company_id = v_company and t.created_at >= v_day
           and t.amount > 0 and t.source in ('manual', 'reaction', 'auto_rule')
           and t.rule_code is distinct from 'refund'
           and t.rule_code is distinct from 'daily_report_missed_refund'
           and t.rule_code is distinct from 'daily_report_excused'
      ) end,
      'people', v_people,
      'awards', case when v_guest or not v_points then '[]'::jsonb else coalesce((
        select jsonb_agg(jsonb_build_object('name', a.name, 'amount', a.amount, 'reason', a.reason, 'at', a.at)
                         order by a.at desc)
          from (
            select p.full_name as name, t.amount, t.reason, t.created_at as at
              from point_transactions t
              join profiles p on p.id = t.user_id
             where t.company_id = v_company and t.created_at >= v_day
               and t.amount > 0 and ((t.source = 'manual' and not t.quiet) or t.source = 'reaction')
             order by t.created_at desc
             limit 3
          ) a
      ), '[]'::jsonb) end
    ),

    'week_result', v_week_res,
    'pace', v_pace
  );
end;
$fn$;
