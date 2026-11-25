-- «В срок» в рейтинге, на стене и в фокусе человека — по моменту сдачи, а не приёмки (D-189).
-- Очки «сдал в срок» (points_game: task_streak_of, the done trigger), ежедневный отчёт и «Период»
-- на компьютере уже судят по `completed_at`; рейтинг, стена и фокус судили по `closed_at`, и кто
-- сдал вовремя, а принят был поздно, выглядел опоздавшим. Окно периода не меняется: в счёт идут
-- задачи, принятые в периоде. `completed_at` пуст у задачи, которую директор закрыл без сдачи, —
-- тогда судит момент закрытия, как раньше.
--
-- Bodies are copied whole from the files supabase/SCHEMA.md names; the only change in each is the
-- on-time test `closed_at <= deadline` → `coalesce(completed_at, closed_at) <= deadline`.

-- fn_rating: body of 20260922120100_errands.sql:44
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
           count(*) filter (where k.deadline is null or coalesce(k.completed_at, k.closed_at) <= k.deadline)::numeric as on_time,
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

-- tv_rating: body of 20261118120000_daily_report_remind_excuse.sql:693
create or replace function tv_rating(p_guest boolean default false, p_period text default 'week') returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_company uuid;
  v_state   tv_state;
  v_points  boolean;
  v_period  text := case when p_period = 'month' then 'month' else 'week' end;
  v_span    interval;
  v_from    timestamptz;
  v_prev    timestamptz;
  v_result  jsonb;
begin
  if auth_role() not in ('tv', 'director') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  v_company := auth_company_id();

  select * into v_state from tv_state where company_id = v_company;
  if coalesce(p_guest, false) or (found and tv_guest_on(v_state)) then
    return jsonb_build_object('hidden', true);
  end if;

  select coalesce((c.settings->>'points_enabled')::boolean, false) into v_points
    from companies c where c.id = v_company;
  if not coalesce(v_points, false) then
    return jsonb_build_object('hidden', false, 'enabled', false, 'period', v_period);
  end if;

  v_span := case when v_period = 'month' then interval '1 month' else interval '7 days' end;
  v_from := now() - v_span;
  v_prev := v_from - v_span;

  with people as (
    select p.id, p.full_name, p."position", p.avatar_url, p.streak_count
      from profiles p
     where p.company_id = v_company and p.is_active
       and p.role in ('employee', 'manager', 'shopkeeper')
  ),
  cur as (
    select t.user_id, sum(t.amount)::int as pts
      from point_transactions t
     where t.company_id = v_company and t.created_at >= v_from
     group by t.user_id
  ),
  prev as (
    select t.user_id, sum(t.amount)::int as pts
      from point_transactions t
     where t.company_id = v_company and t.created_at >= v_prev and t.created_at < v_from
     group by t.user_id
  ),
  done as (
    select k.assignee_id,
           count(*)::int as total,
           (count(*) filter (where k.deadline is null or coalesce(k.completed_at, k.closed_at) <= k.deadline))::int as on_time
      from tasks k
     where k.company_id = v_company and k.status = 'done' and k.closed_at >= v_from
     group by k.assignee_id
  ),
  ranked as (
    select pe.id, pe.full_name, pe."position", pe.avatar_url, pe.streak_count,
           coalesce(cur.pts, 0) as pts,
           coalesce(cur.pts, 0) - coalesce(prev.pts, 0) as delta,
           coalesce(done.total, 0) as done,
           coalesce(done.on_time, 0) as on_time,
           dense_rank() over (order by coalesce(cur.pts, 0) desc, pe.full_name)::int as rnk
      from people pe
      left join cur  on cur.user_id = pe.id
      left join prev on prev.user_id = pe.id
      left join done on done.assignee_id = pe.id
  ),
  awards as (
    -- what was given and why: only rewards, never a penalty or a shop hold (D-45); the director's
    -- own — an automatic bonus is a «сдал» line already, a quiet award and a refund stay private (D-133)
    select p.full_name as name, t.amount, t.reason, t.created_at as at
      from point_transactions t
      join profiles p on p.id = t.user_id
     where t.company_id = v_company and t.created_at >= v_from
       and t.amount > 0 and ((t.source = 'manual' and not t.quiet) or t.source = 'reaction')
     order by t.created_at desc
     limit 3
  )
  select jsonb_build_object(
    'hidden', false,
    'enabled', true,
    'period', v_period,
    -- the first five with points: no bottom of the list on the wall (D-45)
    'top', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'name', r.full_name, 'position', r."position", 'avatar_url', r.avatar_url,
               'points', r.pts, 'rank', r.rnk, 'delta', r.delta, 'done', r.done, 'on_time', r.on_time,
               'streak', r.streak_count
             ) order by r.rnk)
        from ranked r where r.rnk <= 5 and r.pts > 0
    ), '[]'::jsonb),
    -- who grew most against the span before: growth only
    'riser', (
      select jsonb_build_object('id', r.id, 'name', r.full_name, 'avatar_url', r.avatar_url, 'delta', r.delta, 'points', r.pts)
        from ranked r where r.delta > 0 and r.pts > 0
       order by r.delta desc, r.full_name
       limit 1
    ),
    'awards', coalesce((select jsonb_agg(jsonb_build_object('name', a.name, 'amount', a.amount, 'reason', a.reason, 'at', a.at) order by a.at desc) from awards a), '[]'::jsonb),
    'team', jsonb_build_object(
      'done', (select coalesce(sum(r.done), 0) from ranked r),
      'on_time', (select coalesce(sum(r.on_time), 0) from ranked r),
      'earned', (select coalesce(sum(t.amount), 0)
                   from point_transactions t
                  where t.company_id = v_company and t.created_at >= v_from
                    and t.amount > 0 and t.source in ('manual', 'reaction', 'auto_rule')
                    -- D-155 §1: a minus given back is no earning, like a refund by «Оспорить»;
                    -- D-183: nor one the director excused
                    and t.rule_code is distinct from 'refund'
                    and t.rule_code is distinct from 'daily_report_missed_refund'
                    and t.rule_code is distinct from 'daily_report_excused'),
      'people', (select count(*) from ranked r where r.pts > 0)
    )
  ) into v_result;

  return v_result;
end;
$fn$;

-- tv_focus: body of 20260925180000_tv_wall_v4.sql:357
create or replace function tv_focus() returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_company  uuid;
  v_state    tv_state;
  v_guest    boolean;
  v_day      timestamptz;
  v_points   boolean;
  v_emp      uuid;
  v_weeks    int[];
  v_rank     int;
  v_done     int;
  v_on_time  int;
  v_rating   jsonb;
  v_task     tasks;
begin
  if auth_role() not in ('tv', 'director') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  v_company := auth_company_id();

  select * into v_state from tv_state where company_id = v_company;

  if not found or v_state.expires_at is null or v_state.expires_at <= now() then
    return jsonb_build_object('mode', 'ether');
  end if;

  v_guest := tv_guest_on(v_state);

  -- ---- one order on the whole wall (D-123) --------------------------------------------
  if v_state.mode = 'task' then
    select * into v_task from tasks t where t.id = v_state.task_id and t.company_id = v_company;
    -- declined, revoked or put off while on the wall: the wall goes back to the ether (D-45)
    if not found or v_task.status not in ('sent', 'accepted', 'in_progress', 'rework', 'pending_review', 'done') then
      return jsonb_build_object('mode', 'ether');
    end if;

    return jsonb_build_object(
      'mode', 'task',
      'guest', v_guest,
      'expires_at', v_state.expires_at,
      'employee', (
        select jsonb_build_object(
                 'id', p.id,
                 'name', case when v_guest then split_part(p.full_name, ' ', 1) else p.full_name end,
                 'position', p."position",
                 'avatar_url', case when v_guest then null else p.avatar_url end
               )
          from profiles p where p.id = v_task.assignee_id
      ),
      'task', jsonb_build_object(
        'id', v_task.id,
        -- a guest reads neither the title nor what the director wrote (D-33)
        'title', case when v_guest then null else v_task.title end,
        'body', case when v_guest then null else left(nullif(trim(v_task.body), ''), 600) end,
        'status', v_task.status,
        'deadline', v_task.deadline,
        'source', v_task.source,
        'created_at', v_task.created_at,
        'closed_at', v_task.closed_at,
        'story', tv_task_story(v_task.id),
        -- how much was said and shown, as numbers only: no words of the thread on the wall
        'counts', (
          select jsonb_build_object(
                   'photos', count(*) filter (where m.type = 'photo'),
                   'voices', count(*) filter (where m.type = 'voice'),
                   'texts', count(*) filter (where m.type = 'text'
                                              and not coalesce((m.meta->>'decline_reason')::boolean, false)
                                              and not coalesce((m.meta->>'rework_comment')::boolean, false)),
                   'questions', count(*) filter (where coalesce((m.meta->>'is_question')::boolean, false))
                 )
            from task_messages m where m.task_id = v_task.id
        )
      )
    );
  end if;

  if v_state.mode is distinct from 'employee' or v_state.employee_id is null then
    return jsonb_build_object('mode', 'ether');
  end if;

  -- ---- a person on the wall (D-96, D-120) ----------------------------------------------
  v_emp := v_state.employee_id;
  -- сутки компании, а не UTC (CLAUDE.md §6)
  v_day := date_trunc('day', now() at time zone 'Asia/Aqtobe') at time zone 'Asia/Aqtobe';
  select coalesce((c.settings->>'points_enabled')::boolean, false) into v_points
    from companies c where c.id = v_company;

  -- рейтинг человека: гостю — ничего (D-33)
  if not v_guest then
    if v_points then
      -- четыре недели очков, старая первой; окна по 7 суток от «сейчас», как у экрана «Рейтинг»
      select array[
               coalesce(sum(t.amount) filter (where t.created_at >= now() - interval '28 days'
                                                and t.created_at <  now() - interval '21 days'), 0),
               coalesce(sum(t.amount) filter (where t.created_at >= now() - interval '21 days'
                                                and t.created_at <  now() - interval '14 days'), 0),
               coalesce(sum(t.amount) filter (where t.created_at >= now() - interval '14 days'
                                                and t.created_at <  now() - interval '7 days'), 0),
               coalesce(sum(t.amount) filter (where t.created_at >= now() - interval '7 days'), 0)
             ]::int[]
        into v_weeks
        from point_transactions t
       where t.company_id = v_company and t.user_id = v_emp
         and t.created_at >= now() - interval '28 days';

      -- место — та же арифметика, что fn_rating, но без фильтра по смотрящему
      with people as (
        select p.id, p.full_name
          from profiles p
         where p.company_id = v_company and p.is_active
           and p.role in ('employee', 'manager', 'shopkeeper')
      ),
      cur as (
        select t.user_id, sum(t.amount)::int as pts
          from point_transactions t
         where t.company_id = v_company and t.created_at >= now() - interval '7 days'
         group by t.user_id
      ),
      ranked as (
        select pe.id, coalesce(cur.pts, 0) as pts,
               dense_rank() over (order by coalesce(cur.pts, 0) desc, pe.full_name) as rnk
          from people pe left join cur on cur.user_id = pe.id
      )
      select r.rnk::int into v_rank from ranked r where r.id = v_emp and r.pts > 0;
    end if;

    select count(*)::int,
           (count(*) filter (where k.deadline is null or coalesce(k.completed_at, k.closed_at) <= k.deadline))::int
      into v_done, v_on_time
      from tasks k
     where k.company_id = v_company and k.assignee_id = v_emp
       and k.status = 'done' and k.closed_at >= now() - interval '7 days';

    v_rating := jsonb_build_object(
      'points', v_points,
      -- место на стене — только из первой пятёрки (D-45)
      'rank', case when v_points and v_rank <= 5 then v_rank end,
      'weeks', case when v_points then to_jsonb(v_weeks) end,
      'done_week', v_done,
      'on_time_week', v_on_time
    );
  end if;

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
        from profiles p where p.id = v_emp
    ),
    -- числа по стадиям — по всем открытым делам, а не по показанным (limit ниже)
    'counts', (
      select jsonb_build_object(
               'new',    count(*) filter (where t.status = 'sent'),
               'work',   count(*) filter (where t.status in ('accepted', 'in_progress', 'rework')),
               'review', count(*) filter (where t.status = 'pending_review')
             )
        from tasks t
       where t.company_id = v_company and t.assignee_id = v_emp
    ),
    -- хорошее тоже видно: что директор принял сегодня (D-45 — позитив можно)
    'done_today', (
      select jsonb_build_object(
               'count', count(*),
               'titles', coalesce(
                 (select jsonb_agg(d.title order by d.closed_at desc)
                    from (select case when v_guest then null else t2.title end as title, t2.closed_at
                            from tasks t2
                           where t2.company_id = v_company and t2.assignee_id = v_emp
                             and t2.status = 'done' and t2.closed_at >= v_day
                           order by t2.closed_at desc limit 3) d),
                 '[]'::jsonb)
             )
        from tasks t
       where t.company_id = v_company and t.assignee_id = v_emp
         and t.status = 'done' and t.closed_at >= v_day
    ),
    -- очки недели (контракт v2): для любого места, не только для топ-5
    'points_week', case when v_points and not v_guest then v_weeks[4] end,
    'rating', v_rating,
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id,
               -- гостю названий не показываем вовсе: экран скажет «Поручение»
               'title', case when v_guest then null else t.title end,
               'status', t.status,
               'deadline', t.deadline,
               'source', t.source,
               'story', tv_task_story(t.id)
             ) order by t.deadline nulls last, t.created_at)
        from (
          select t2.id, t2.title, t2.status, t2.deadline, t2.created_at, t2.source
            from tasks t2
           where t2.company_id = v_company
             and t2.assignee_id = v_emp
             -- отказ, отложенная и закрытые на стену не выносятся (D-45)
             and t2.status in ('sent','accepted','in_progress','rework','pending_review')
           order by t2.deadline nulls last, t2.created_at
           limit 12
        ) t
    ), '[]'::jsonb),
    -- сданное за неделю — когда открытых дел нет, стена показывает его хронологию
    'done_recent', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', t.id,
               'title', case when v_guest then null else t.title end,
               'status', t.status,
               'deadline', t.deadline,
               'source', t.source,
               'story', tv_task_story(t.id)
             ) order by t.closed_at desc)
        from (
          select t2.id, t2.title, t2.status, t2.deadline, t2.source, t2.closed_at
            from tasks t2
           where t2.company_id = v_company
             and t2.assignee_id = v_emp
             and t2.status = 'done'
             and t2.closed_at >= now() - interval '7 days'
           order by t2.closed_at desc
           limit 6
        ) t
    ), '[]'::jsonb)
  );
end;
$fn$;
