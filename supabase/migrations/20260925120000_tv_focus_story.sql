-- Карточка сотрудника на стене v3 (D-120): каждое дело — карточка с хронологией, слева —
-- рейтинг человека. Владелец (2026-09-25): «экран слишком простой, скучный и не
-- информативный; хочу чтобы задачи показывались как карточки с подробной хронологией;
-- хочу чтобы показывался рейтинг сотрудника».
--
-- Новых таблиц нет: хронология собирается из того, что уже пишется — метки задачи
-- (`accepted_at`, `completed_at`, `closed_at`), квитанция уведомления адресату (`seen_at`,
-- D-32: «увидел», не «получил»), лента `task_messages` (смены статуса, вопросы, фото,
-- голос, слова директора, продление срока).
--
-- D-45 держится и в хронологии: отказ, «Настоять», отзыв и тексты сообщений на стену не
-- выходят; возврат на доработку — нейтральное «снова в работе», без комментария
-- директора. Гость (D-33): события — только время и вид, без слов; рейтинга нет вовсе.
--
-- Рейтинг считается здесь же, а не через `fn_rating`: та фильтрует строки по смотрящему
-- (топ-5 для всех, кроме директора), и киоск в режиме `top5` терял очки каждого ниже
-- пятого места — `points_week` v2 приходил пустым. Арифметика та же, что у экрана
-- «Рейтинг»: сумма транзакций за 7 дней, dense_rank по очкам и имени. Место на стену —
-- только из первой пятёрки: «14-е из 15» по имени — публичный стыд (D-45).
--
-- Контракт v2 сохранён целиком (mode, guest, expires_at, employee, tasks[], counts,
-- done_today, points_week); добавлены tasks[].source и tasks[].story, done_recent, rating.

-- ---------------------------------------------------------------------------
-- 1. tv_task_story — хронология одного дела событиями {k, at, ans?, to?, rep?}
-- ---------------------------------------------------------------------------
-- k: posted | seen | accepted | question | text | photo | voice | director | deadline
--    | review | again | done. Не security definer: вызывается только из tv_focus (там
--    уже права владельца); прямой вызов закрыт grant'ами ниже.
create or replace function tv_task_story(p_task uuid) returns jsonb
language sql stable set search_path = public
as $fn$
  with t as (
    select k.id, k.assignee_id, k.author_id, k.created_at, k.accepted_at
      from tasks k where k.id = p_task
  ),
  -- последние 40 записей ленты: у дела с полусотней фото хронология всё равно сжимается
  msgs as (
    select m.type, m.sender_id, m.meta, m.created_at
      from (select * from task_messages m0 where m0.task_id = p_task
             order by m0.created_at desc, m0.seq desc limit 40) m
  ),
  ev as (
    -- поставлена: выход из отложенных, если был, иначе рождение задачи
    select 'posted'::text as k,
           coalesce((select min(m.created_at) from msgs m
                      where m.type = 'status_change'
                        and m.meta->>'old_status' = 'scheduled'
                        and m.meta->>'new_status' = 'sent'),
                    t.created_at) as at,
           null::timestamptz as ans, null::timestamptz as "to", null::text as rep, false as cleared
      from t

    union all
    -- увидел: первая отметка на уведомлении о задаче у адресата
    select 'seen', min(coalesce(d.seen_at, d.acted_at)), null, null, null, false
      from notification_deliveries d join t on d.task_id = t.id and d.user_id = t.assignee_id
     where d.event_kind = 'task_sent' and coalesce(d.seen_at, d.acted_at) is not null
    having count(*) > 0

    union all
    select 'accepted', t.accepted_at, null, null, null, false from t where t.accepted_at is not null

    union all
    -- слова адресата: вопрос (с временем ответа), фото, голос, текст. Причина отказа —
    -- никогда (D-45); отчёт при сдаче едет вместе со сдачей (rep), отдельной строкой не идёт
    select case
             when coalesce((m.meta->>'is_question')::boolean, false) then 'question'
             when m.type = 'photo' then 'photo'
             when m.type = 'voice' then 'voice'
             else 'text'
           end,
           m.created_at,
           case when coalesce((m.meta->>'is_question')::boolean, false)
                then (m.meta->>'answered_at')::timestamptz end,
           null, null, false
      from msgs m join t on m.sender_id = t.assignee_id
     where m.type in ('text', 'voice', 'photo')
       and not coalesce((m.meta->>'decline_reason')::boolean, false)
       and not coalesce((m.meta->>'report')::boolean, false)

    union all
    -- слова директора: ответ на вопрос уже стоит в строке вопроса, комментарий к доработке —
    -- негатив (D-45); остальное — «директор написал»
    select 'director', m.created_at, null, null, null, false
      from msgs m join t on m.sender_id = t.author_id and m.sender_id <> t.assignee_id
     where m.type in ('text', 'voice', 'photo')
       and not coalesce((m.meta->>'rework_comment')::boolean, false)
       and not exists (
         select 1 from msgs q
          where coalesce((q.meta->>'is_question')::boolean, false)
            and (q.meta->>'answered_at')::timestamptz = m.created_at
       )

    union all
    -- новый срок: нейтрально, датой; «срок снят» — cleared
    select 'deadline', m.created_at, null, (m.meta->>'new_deadline')::timestamptz, null,
           (m.meta->>'new_deadline') is null
      from msgs m
     where m.type = 'system' and coalesce((m.meta->>'deadline_changed')::boolean, false)

    union all
    -- смены статуса, которые можно показать: сдача (с отчётом — фото или текст), возврат
    -- в работу словами «снова в работе», приёмка. Отказ, «Настоять», отзыв — нет (D-45)
    select case m.meta->>'new_status'
             when 'pending_review' then 'review'
             when 'rework' then 'again'
             else 'done'
           end,
           m.created_at, null, null,
           case when m.meta->>'new_status' = 'pending_review' then (
             select case when bool_or(r.type = 'photo') then 'photo' else 'text' end
               from msgs r
              where coalesce((r.meta->>'report')::boolean, false) and r.created_at = m.created_at
             having count(*) > 0
           ) end,
           false
      from msgs m
     where m.type = 'status_change' and m.meta->>'new_status' in ('pending_review', 'rework', 'done')
  )
  select coalesce(
    jsonb_agg(
      jsonb_strip_nulls(jsonb_build_object(
        'k', ev.k, 'at', ev.at, 'ans', ev.ans, 'to', ev."to", 'rep', ev.rep,
        'cleared', case when ev.cleared then true end
      )) order by ev.at, ev.k
    ),
    '[]'::jsonb
  )
    from ev
   where ev.at is not null;
$fn$;

comment on function tv_task_story(uuid) is
  'the life of one order for the wall: kinds and times only, no words; no decline, no revoke, rework as «again» (D-45, D-120)';

revoke execute on function tv_task_story(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. tv_focus v3
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

  v_emp   := v_state.employee_id;
  v_guest := tv_guest_on(v_state);
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
    -- очки недели (контракт v2): теперь для любого места, не только для топ-5
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
  'the person on the wall: open orders with their story, the week done, rating for the top five (D-76, D-96, D-120)';
