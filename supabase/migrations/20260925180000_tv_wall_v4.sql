-- Стена v4 (D-123): заставка «Рейтинг», одно дело во весь экран, смена заставок по кругу.
-- Владелец (2026-09-25): «нет экрана общего рейтинга сотрудников» → план → «1, 3, 4, 6
-- согласен, делай пока не доведешь до идеала».
--
-- Рейтинг на стене — только первая пятёрка: даже при `rating_mode = full` последнее место
-- по имени в кабинете — публичный стыд (D-45). Падения, минуса и штрафов нет; при госте в
-- кабинете заставка скрыта целиком (D-33); очки выключены — заставки нет.
--
-- Одно дело (`mode = 'task'`, заложен D-76 §3) — хронология одного поручения во весь экран:
-- директор нажал «На экран» на экране задачи. Отказанное, отозванное и отложенное дело на
-- стену не встаёт, а если стало таким, пока стоит, — стена возвращается в эфир (D-45).
--
-- Смена заставок — флаг `carousel`: пока он включён, киоск сам меняет лицо, рейтинг,
-- календарь и команду по своим часам, без cron. Любая явная заставка или доска с пульта
-- его выключает — выбор руками сильнее круга.

-- ---------------------------------------------------------------------------
-- 1. Строка стены: сцена «рейтинг», вид рейтинга, круг заставок
-- ---------------------------------------------------------------------------
alter table tv_state
  add column rating_view text not null default 'week'
    check (rating_view in ('week', 'month')),
  add column carousel boolean not null default false;

comment on column tv_state.rating_view is 'the rating scene counts the last week or the last month (D-123)';
comment on column tv_state.carousel is 'the wall changes its ether scenes by itself, by the kiosk clock (D-123)';

alter table tv_state drop constraint tv_state_scene_check;
alter table tv_state add constraint tv_state_scene_check
  check (scene in ('face', 'clock', 'team', 'calendar', 'board', 'rating'));

-- ---------------------------------------------------------------------------
-- 2. tv_control — контракт D-105 плюс `p_rating` и `p_carousel`; «одно дело» — только
--    живое или принятое. Новые параметры `create or replace` не добавляет.
-- ---------------------------------------------------------------------------
drop function tv_control(text, uuid, uuid, text, boolean, boolean, text, text, uuid, boolean, boolean);

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
  p_wake        boolean default null,   -- true = awake two hours from now, false = asleep, null = unchanged
  p_rating      text    default null,   -- week | month, null = unchanged
  p_carousel    boolean default null    -- true = the wall changes scenes by itself, null = unchanged
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

revoke execute on function tv_control(text, uuid, uuid, text, boolean, boolean, text, text, uuid, boolean, boolean, text, boolean) from public, anon;
grant execute on function tv_control(text, uuid, uuid, text, boolean, boolean, text, text, uuid, boolean, boolean, text, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. tv_rating — заставка «Рейтинг»: первая пятёрка периода, рост, награды, итог команды
-- ---------------------------------------------------------------------------
-- Та же арифметика, что `fn_rating` (экран «Рейтинг»): сумма транзакций за период от
-- «сейчас» (неделя — 7 суток, месяц — месяц), место — dense_rank по очкам и имени, рост —
-- к предыдущему такому же отрезку. Строки по смотрящему не режутся: киоск видит пятёрку
-- так же, как директор. Гость в кабинете — `{hidden: true}` и больше ничего (D-33).
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
    select p.id, p.full_name, p."position", p.avatar_url
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
           (count(*) filter (where k.deadline is null or k.closed_at <= k.deadline))::int as on_time
      from tasks k
     where k.company_id = v_company and k.status = 'done' and k.closed_at >= v_from
     group by k.assignee_id
  ),
  ranked as (
    select pe.id, pe.full_name, pe."position", pe.avatar_url,
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
    -- what was given and why: only rewards, never a penalty or a shop hold (D-45)
    select p.full_name as name, t.amount, t.reason, t.created_at as at
      from point_transactions t
      join profiles p on p.id = t.user_id
     where t.company_id = v_company and t.created_at >= v_from
       and t.amount > 0 and t.source in ('manual', 'reaction', 'auto_rule')
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
               'points', r.pts, 'rank', r.rnk, 'delta', r.delta, 'done', r.done, 'on_time', r.on_time
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
                    and t.amount > 0 and t.source in ('manual', 'reaction', 'auto_rule')),
      'people', (select count(*) from ranked r where r.pts > 0)
    )
  ) into v_result;

  return v_result;
end;
$fn$;

comment on function tv_rating(boolean, text) is
  'the rating scene: the first five of the week or the month, the riser, the latest rewards, the team (D-123)';

revoke execute on function tv_rating(boolean, text) from public, anon;
grant execute on function tv_rating(boolean, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. tv_focus v4 — плюс «одно дело во весь экран» (`mode = 'task'`). Контракт v3 — без
--    изменений для `employee`.
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
           (count(*) filter (where k.deadline is null or k.closed_at <= k.deadline))::int
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

comment on function tv_focus() is
  'what stands on the wall: a person with their orders and rating (D-96, D-120) or one order with its whole story (D-123)';
