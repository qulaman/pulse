-- Стена v5 (D-182): программа дня, итоги дня и недели, объявление дня, темп, крупность текста,
-- здоровье киоска и надписи, которые гаснут по возрасту.
--
-- Зачем `scene_set_at`: стена сама ведёт программу дня (утро — календарь, вечер — «Итог дня»,
-- ночь — по окну доставки), а заставка, выбранная рукой, держится до конца своего отрезка.
-- Чтобы это посчитать, стене нужно знать не только «что выбрано», но и «когда»: `tv_control`
-- ставит отметку, когда команда несёт сцену или круг. Остальные команды (часы, гость, доска)
-- отметку не двигают — они не выбор заставки.
--
-- Зачем `scale`: «Крупность» с пульта — 100, 115 или 130 % текста стены. Это настройка экрана,
-- как вид часов: живёт в строке стены и переживает перезагрузку киоска.
--
-- Зачем `health`: киоск в квитанции сообщает, как он живёт (сборка, Wake Lock, сбои), — пульт
-- показывает директору «на стене всё в порядке» или что не так. Размер ограничен: квитанция
-- идёт раз в минуту, строку читает каждый пульт. Слишком большое или не объект — квитанция всё
-- равно засчитывается, здоровье остаётся прежним (стена не должна стать «не отвечает» из-за отчёта).
--
-- Зачем надписи по возрасту в `tv_overlay`: гасит их тик `visits_due_expiry`, а он на стенде идёт
-- раз в сутки (В-8). До этой правки вчерашний посетитель висел на стене до утреннего тика. Теперь
-- функция стены сама не отдаёт визит старше сроков тика — 20 минут «ждёт» от прихода, 60 минут
-- «подождёт» от ответа, 30 минут сообщение от отправки (D-96, D-116). Тик по-прежнему ставит
-- `expired` и шлёт секретарю «Директор не ответил» — его работа не меняется.
--
-- Зачем новые поля `tv_summary` (I1 договора D-182): сцены «Итог дня», «Итог недели»,
-- «Объявление» и строка темпа под лицом. Только хорошее и только суммы (D-45): ни отказов, ни
-- просрочек по именам — поэтому `load.overdue` больше не считается (ноль для старых сборок).
-- Гость (D-33): нули в вердикте, без объявления, без очков и наград, лидер — без фамилии.
-- Встреча несёт `director` — участвует ли директор: стена в его кабинете зовёт «через 15 минут»
-- только на его встречи.
--
-- Совместимость со старой сборкой (Vercel старше миграции): `tv_control` и `tv_heartbeat`
-- пересозданы с прежними параметрами в прежнем порядке и новыми в конце с умолчаниями —
-- вызовы с именованными и позиционными аргументами работают как раньше. Новые поля сводки
-- старая сборка не читает; `counts` для не-гостя считаются как прежде.

-- ---------------------------------------------------------------------------
-- 1. tv_state: когда выбрана заставка, крупность, здоровье киоска
-- ---------------------------------------------------------------------------
alter table tv_state
  add column scene_set_at timestamptz,
  add column scale        smallint not null default 100 check (scale in (100, 115, 130)),
  add column health       jsonb check (health is null or (jsonb_typeof(health) = 'object' and pg_column_size(health) <= 4096));

comment on column tv_state.scene_set_at is
  'when the remote last picked a scene or switched the round (D-182): a scene picked by hand holds till the end of its part of the day';
comment on column tv_state.scale is
  'size of the wall''s text, percent: 100, 115 or 130 — «Крупность» on the remote (D-182)';
comment on column tv_state.health is
  'the kiosk''s own report from its last heartbeat (D-182): a small object, at most 4 KB';

-- the wall's day: what was accepted today, this week, in the last eight weeks
create index if not exists tasks_company_done_closed_idx on tasks (company_id, closed_at) where status = 'done';

-- ---------------------------------------------------------------------------
-- 2. tv_control — контракт D-140 (20261020120000_mind_board_v3.sql) плюс `p_scale` и отметка
--    `scene_set_at`. Новые параметры `create or replace` не добавляет — старая подпись уходит.
-- ---------------------------------------------------------------------------
drop function tv_control(text, uuid, uuid, text, boolean, boolean, text, text, uuid, boolean, boolean, text, boolean, int);

create function tv_control(
  p_mode          text    default null,   -- null = unchanged
  p_employee_id   uuid    default null,
  p_task_id       uuid    default null,
  p_scene         text    default null,   -- null = unchanged
  p_guest         boolean default null,   -- null = unchanged
  p_reload        boolean default false,
  p_clock         text    default null,   -- null = unchanged
  p_calendar      text    default null,   -- null = unchanged
  p_board         uuid    default null,   -- puts this board on the wall
  p_board_guest   boolean default null,   -- null = unchanged
  p_wake          boolean default null,   -- true = awake two hours from now, false = asleep, null = unchanged
  p_rating        text    default null,   -- week | month, null = unchanged
  p_carousel      boolean default null,   -- true = the wall changes scenes by itself, null = unchanged
  p_board_minutes int     default null,   -- with p_board: on the wall this long; null = till the end of the day
  p_scale         int     default null    -- 100 | 115 | 130 percent of the wall's text, null = unchanged
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
  -- a scene picked or the round switched: the program of the day counts the hold from here (D-182)
  v_scene_at    timestamptz := case when p_scene is not null or p_carousel is not null then now() end;
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
  if p_board_minutes is not null and (p_board is null or p_board_minutes not between 5 and 720) then
    raise exception 'bad_minutes' using errcode = 'P0001';
  end if;
  if p_scale is not null and p_scale not in (100, 115, 130) then
    raise exception 'bad_scale' using errcode = 'P0001';
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
    if p_board_minutes is not null then
      -- «на полчаса», «на час» (D-140) — never past the end of the day
      v_board_until := least(now() + make_interval(mins => p_board_minutes), tv_board_cap());
    elsif extract(hour from now() at time zone 'Asia/Aqtobe') < 21 then
      -- till the end of the working day; put up at night -- two hours (D-102 §6)
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
    expires_at, version, reload_requested_at, updated_by, updated_at, scene_set_at, scale
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
    now(),
    v_scene_at,
    coalesce(p_scale, 100)
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
    -- only a scene or the round switch moves the mark: a clock or a guest is not a pick (D-182)
    scene_set_at        = coalesce(v_scene_at, s.scene_set_at),
    scale               = coalesce(p_scale, s.scale),
    version             = s.version + 1,
    reload_requested_at = case when p_reload then now() else s.reload_requested_at end,
    updated_by          = auth.uid(),
    updated_at          = now()
  returning * into v_row;

  return v_row;
end;
$fn$;

revoke execute on function tv_control(text, uuid, uuid, text, boolean, boolean, text, text, uuid, boolean, boolean, text, boolean, int, int) from public, anon;
grant execute on function tv_control(text, uuid, uuid, text, boolean, boolean, text, text, uuid, boolean, boolean, text, boolean, int, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. tv_heartbeat — квитанция киоска (20260923230100_visits.sql) плюс `p_health`. Только роль
--    `tv`, только строка своей компании. Здоровье не того вида или больше 4 КБ не пишется,
--    а квитанция засчитывается.
-- ---------------------------------------------------------------------------
drop function tv_heartbeat(int);

create function tv_heartbeat(p_applied_version int default null, p_health jsonb default null) returns void
language plpgsql security definer set search_path = public
as $fn$
declare
  v_company uuid;
  v_health  jsonb := case when jsonb_typeof(p_health) = 'object' and pg_column_size(p_health) <= 4096 then p_health end;
begin
  if auth_role() is distinct from 'tv' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  v_company := auth_company_id();

  insert into tv_state as s (company_id, seen_at, applied_version, health)
  values (v_company, now(), p_applied_version, v_health)
  on conflict (company_id) do update set
    seen_at         = now(),
    applied_version = coalesce(excluded.applied_version, s.applied_version),
    -- an older kiosk sends no report: the last one stays
    health          = coalesce(excluded.health, s.health);

  if p_applied_version is not null then
    update visits v set shown_at = now()
     where v.company_id = v_company and v.shown_at is null and v.closed_at is null
       and v.tv_version is not null and v.tv_version <= p_applied_version;
  end if;
end;
$fn$;

revoke execute on function tv_heartbeat(int, jsonb) from public, anon;
grant execute on function tv_heartbeat(int, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. tv_overlay — тело 20260924180000_visit_messages.sql, где надпись живёт по возрасту, а не до
--    тика: посетитель «ждёт» — 20 минут от прихода, «подождёт» — 60 минут от ответа директора,
--    сообщение — 30 минут от отправки. Те же сроки, что у `visits_due_expiry`.
-- ---------------------------------------------------------------------------
create or replace function tv_overlay() returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_company   uuid;
  v_now       timestamptz := now();
  v_state     tv_state;
  v_guest     boolean := false;
  v_visit     visits;
  v_has_visit boolean;
  v_waiting   int;
  v_message   visits;
  v_has_msg   boolean;
  v_messages  int;
begin
  if auth_role() not in ('tv', 'director') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  v_company := auth_company_id();

  select * into v_state from tv_state where company_id = v_company;
  if found then
    v_guest := tv_guest_on(v_state);
  end if;

  -- the same terms as visits_due_expiry: the minute tick may run once a day (В-8), the wall may not wait for it
  select * into v_visit from visits v
   where v.company_id = v_company and v.closed_at is null and v.kind = 'visitor'
     and ((v.status = 'waiting' and v.created_at > v_now - interval '20 minutes')
       or (v.status = 'wait' and coalesce(v.answered_at, v.created_at) > v_now - interval '60 minutes'))
   order by (v.status = 'waiting') desc, v.created_at desc
   limit 1;
  v_has_visit := found;

  select count(*) into v_waiting from visits v
   where v.company_id = v_company and v.closed_at is null and v.kind = 'visitor'
     and ((v.status = 'waiting' and v.created_at > v_now - interval '20 minutes')
       or (v.status = 'wait' and coalesce(v.answered_at, v.created_at) > v_now - interval '60 minutes'));

  -- the newest words first: the older ones are on the director's phone too
  select * into v_message from visits v
   where v.company_id = v_company and v.closed_at is null and v.kind = 'message'
     and v.status = 'waiting' and v.created_at > v_now - interval '30 minutes'
   order by v.created_at desc
   limit 1;
  v_has_msg := found;

  select count(*) into v_messages from visits v
   where v.company_id = v_company and v.closed_at is null and v.kind = 'message'
     and v.status = 'waiting' and v.created_at > v_now - interval '30 minutes';

  return jsonb_build_object(
    'visit', case when v_has_visit then jsonb_build_object(
      'id', v_visit.id,
      'status', v_visit.status,
      'note', case when v_guest then null else v_visit.note end,
      'created_at', v_visit.created_at,
      'answered_at', v_visit.answered_at
    ) end,
    'waiting', v_waiting,
    'message', case when v_has_msg then jsonb_build_object(
      'id', v_message.id,
      'note', case when v_guest then null else v_message.note end,
      'created_at', v_message.created_at
    ) end,
    'messages', v_messages
  );
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. tv_summary — тело 20260922120100_errands.sql плюс поля стены v5 (I1 договора D-182):
--    `program`, `announcement`, `day`, `week_result`, `pace`, `events[].director`,
--    `load[].done_today`; `load[].overdue` — ноль; `counts` гостю — нули.
-- ---------------------------------------------------------------------------
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
