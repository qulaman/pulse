-- The tail of the company boundary (principle 6, after 20261124090000_tenant_guards): small gaps,
-- none of them an open door today, closed so they never become one.
--   1. task_of_my_company — a task id of the caller's company; a definer helper, so a task
--                         policy can ask it without reading `tasks` under its own policy
--   2. tasks              — a parent task written through PostgREST is of the caller's company
--   3. task_reads         — a read cursor names a task of the caller's company (the app writes
--                         them through mark_thread_read; this holds the direct way)
--   4. revoke_sessions    — the caller's role counts only from a live session, as everywhere
--   5. voice_purge_due    — a row of one company never keeps another company's recording
--   6. eight functions    — `auth_role() not in (…)` let a NULL role through (an account whose
--                         session was closed, a profile switched off): the check fails closed now.
--                         Bodies are the ones in force, copied unchanged but for that line
-- New functions start closed (20261124120000): each grant below is the function's own.

-- ---------------------------------------------------------------------------
-- 1. task_of_my_company
-- ---------------------------------------------------------------------------
create function task_of_my_company(p_task uuid) returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from tasks t where t.id = p_task and t.company_id = auth_company_id()) $$;

grant execute on function task_of_my_company(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. tasks: the policies of 20261124090000, plus the parent task
-- ---------------------------------------------------------------------------
alter policy tasks_insert on public.tasks
  with check (
    company_id = (select auth_company_id())
    and author_id = (select auth.uid())
    and (select auth_role()) = any (array['director', 'manager'])
    and (assignee_id is null
         or exists (select 1 from profiles p where p.id = assignee_id and p.company_id = (select auth_company_id())))
    and (parent_task_id is null or task_of_my_company(parent_task_id))
  );

alter policy tasks_update on public.tasks
  with check (
    company_id = (select auth_company_id())
    and (assignee_id is null
         or exists (select 1 from profiles p where p.id = assignee_id and p.company_id = (select auth_company_id())))
    and exists (select 1 from profiles p where p.id = author_id and p.company_id = (select auth_company_id()))
    and (parent_task_id is null or task_of_my_company(parent_task_id))
  );

-- ---------------------------------------------------------------------------
-- 3. task_reads
-- ---------------------------------------------------------------------------
alter policy task_reads_insert on public.task_reads
  with check (
    user_id = (select auth.uid()) and company_id = (select auth_company_id()) and task_of_my_company(task_id)
  );

alter policy task_reads_update on public.task_reads
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid()) and company_id = (select auth_company_id()) and task_of_my_company(task_id)
  );

-- ---------------------------------------------------------------------------
-- 4. revoke_sessions: the body of 20261014180000_login_sessions.sql, the caller counts from a live session
-- ---------------------------------------------------------------------------
create or replace function revoke_sessions(
  p_user_id uuid,
  p_keep_current boolean default false,
  p_keep_endpoint text default null
) returns json
language plpgsql security definer set search_path = public
as $fn$
declare
  v_me       uuid := auth.uid();
  v_role     text;
  v_company  uuid;
  v_target   profiles%rowtype;
  v_keep     uuid;
  v_sessions int;
  v_devices  int;
begin
  select role::text, company_id into v_role, v_company from profiles where id = v_me and is_active and auth_session_live();
  select * into v_target from profiles where id = p_user_id;
  if v_company is null or v_target.id is null or v_target.company_id <> v_company then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_me <> p_user_id
     and not (v_role in ('director', 'secretary') and v_target.role::text <> 'director') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  -- «на других устройствах»: the phone that asks keeps its own session and its own pushes
  if p_keep_current and v_me = p_user_id then
    v_keep := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  end if;

  delete from auth.sessions where user_id = p_user_id and (v_keep is null or id <> v_keep);
  get diagnostics v_sessions = row_count;

  delete from push_subscriptions
   where user_id = p_user_id
     and (not (p_keep_current and v_me = p_user_id) or p_keep_endpoint is null or endpoint <> p_keep_endpoint);
  get diagnostics v_devices = row_count;

  update login_codes set cancelled_at = now()
   where user_id = p_user_id and used_at is null and cancelled_at is null;

  return json_build_object('sessions', v_sessions, 'devices', v_devices);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. voice_purge_due: the body of 20261103121000_voice_retention.sql, references counted per company
-- ---------------------------------------------------------------------------
create or replace function voice_purge_due(p_now timestamptz default now(), p_limit int default 500)
returns table (company_id uuid, path text)
language sql stable security definer set search_path = public
as $fn$
  with files as (
    select o.name as path,
           o.created_at,
           -- the company is the first segment; a name without a uuid there is not ours to judge
           case when split_part(o.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then split_part(o.name, '/', 1)::uuid end as company_id
      from storage.objects o
     where o.bucket_id = 'voice'
  ),
  -- every row a recording stands behind; 'infinity' = still open
  refs (company_id, path, closed_at) as (
    select t.company_id, t.source_audio_path,
           case when t.status in ('done', 'revoked') then coalesce(t.closed_at, 'infinity') else 'infinity' end
      from tasks t
     where t.source_audio_path is not null
    union all
    select m.company_id, m.file_path,
           case when t.status in ('done', 'revoked') then coalesce(t.closed_at, 'infinity') else 'infinity' end
      from task_messages m
      join tasks t on t.id = m.task_id
     where m.type = 'voice' and m.file_path is not null
    union all
    select a.company_id, a.audio_path, a.created_at
      from announcements a
     where a.audio_path is not null
    union all
    select e.company_id, e.audio_path,
           case when coalesce(e.ends_at, e.starts_at) <= p_now then coalesce(e.ends_at, e.starts_at) else 'infinity' end
      from events e
     where e.audio_path is not null
    union all
    select n.company_id, n.audio_path, 'infinity'::timestamptz
      from notes n
     where n.audio_path is not null
    union all
    select r.company_id, r.audio_path,
           case when r.status in ('done', 'declined', 'cancelled') then coalesce(r.done_at, r.updated_at) else 'infinity' end
      from errands r
     where r.audio_path is not null
    union all
    select rr.company_id, rr.source_audio_path,
           case when not rr.is_active then rr.updated_at else 'infinity' end
      from recurrence_rules rr
     where rr.source_audio_path is not null
  ),
  closed as (
    select refs.company_id, refs.path, max(refs.closed_at) as last_closed
      from refs
     group by refs.company_id, refs.path
  )
  select f.company_id, f.path
    from files f
    join companies c on c.id = f.company_id
    left join closed cl on cl.path = f.path and cl.company_id = f.company_id
   where not exists (select 1 from voice_kept k where k.path = f.path)
     and case
           when cl.path is null
             then f.created_at + make_interval(days => voice_retention_days(c.settings, 'orphan_days', 30)) <= p_now
           when cl.last_closed = 'infinity'
             then false
           else cl.last_closed + make_interval(days => voice_retention_days(c.settings, 'closed_days', 90)) <= p_now
         end
   order by f.created_at
   limit greatest(coalesce(p_limit, 500), 0);
$fn$;

-- ---------------------------------------------------------------------------
-- 6. The role check fails closed
-- ---------------------------------------------------------------------------
-- close_visit: the body of 20260923230100_visits.sql, the role check fails closed
create or replace function close_visit(p_id uuid) returns visits
language plpgsql security definer set search_path = public
as $fn$
declare
  v_company uuid := auth_company_id();
  v_row     visits;
begin
  if coalesce(auth_role(), '') not in ('secretary', 'director') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select * into v_row from visits v where v.id = p_id and v.company_id = v_company for update;
  if not found then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_row.closed_at is not null then
    return v_row;
  end if;

  update visits v
     set closed_at = now(),
         -- the notice leaves the wall only if it was on it
         tv_version = case when v.status in ('waiting', 'wait') then tv_touch(v_company) else v.tv_version end
   where v.id = p_id
  returning * into v_row;
  return v_row;
end;
$fn$;

-- set_shop_order_status: the body of 20260917170000_shop_fixes.sql, the role check fails closed
create or replace function set_shop_order_status(
  p_order_id uuid,
  p_status order_status,
  client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid    uuid := client_request_id;
  v_company uuid := auth_company_id();
  v_user    uuid := auth.uid();
  v_order   orders%rowtype;
  v_title   text;
  v_kind    text;
  v_head    text;
  v_result  jsonb;
begin
  if coalesce(auth_role(), '') not in ('director', 'shopkeeper') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_status not in ('approved', 'delivered') then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;

  if v_crid is not null then
    insert into ingest_batches (company_id, user_id, client_request_id, result)
    values (v_company, v_user, v_crid, '{}'::jsonb)
    on conflict on constraint ingest_batches_company_request_key do nothing;
    if not found then
      select b.result into v_result from ingest_batches b
       where b.company_id = v_company and b.client_request_id = v_crid;
      return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('duplicate', true);
    end if;
  end if;

  select * into v_order from orders
   where id = p_order_id and company_id = v_company
   for update;
  if v_order.id is null then
    raise exception 'order_not_found' using errcode = 'P0001';
  end if;
  -- завхоз тоже сотрудник и тоже копит очки: свой заказ он не проводит сам
  if v_order.user_id = v_user then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_status = 'approved' and v_order.status <> 'pending' then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;
  if p_status = 'delivered' and v_order.status not in ('pending', 'approved') then
    raise exception 'wrong_status' using errcode = 'P0001';
  end if;

  -- выдача новых транзакций не пишет: холд финален (D-10)
  update orders
     set status = p_status,
         approved_at = case when p_status = 'approved' then now() else approved_at end,
         delivered_at = case when p_status = 'delivered' then now() else delivered_at end
   where id = v_order.id;

  select title into v_title from shop_items where id = v_order.item_id;
  v_kind := case when p_status = 'approved' then 'shop_approved' else 'shop_ready' end;
  v_head := case when p_status = 'approved' then 'Заказ подтверждён' else 'Заказ готов' end;

  insert into notification_deliveries (company_id, user_id, event_kind, meta)
  values (v_company, v_order.user_id, v_kind,
          jsonb_build_object('title', v_head,
                             'body', coalesce(v_title, 'товар'),
                             'url', '/shop'));

  v_result := jsonb_build_object('id', v_order.id, 'status', p_status);
  if v_crid is not null then
    update ingest_batches b set result = v_result
     where b.company_id = v_company and b.client_request_id = v_crid;
  end if;
  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;

-- tv_board: the body of 20261021150000_board_live_week.sql, the role check fails closed
create or replace function tv_board(p_guest boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_state tv_state;
  v_board mind_boards;
  v_id    uuid;
  v_week  boolean := false;
  v_guest boolean;
  v_names boolean;
  v_focus uuid;
begin
  if coalesce(auth_role(), '') not in ('tv', 'director') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select * into v_state from tv_state s where s.company_id = auth_company_id();
  if not found then
    return jsonb_build_object('board', null, 'hidden', false);
  end if;

  if not v_state.carousel and v_state.scene = 'board' and v_state.board_id is not null
     and coalesce(v_state.board_until > now(), false) then
    v_id := v_state.board_id;
  elsif v_state.week_board_id is not null and coalesce(v_state.week_board_until > now(), false)
        and (v_state.carousel or v_state.scene = 'board') then
    -- the week board: its turn in the round, or the wall after the meeting's board ran out (D-144)
    v_id := v_state.week_board_id;
    v_week := true;
  else
    return jsonb_build_object('board', null, 'hidden', false);
  end if;

  select * into v_board from mind_boards b
   where b.id = v_id and b.company_id = v_state.company_id and b.deleted_at is null
     and (not v_week or b.finished_at is null);
  if not found then
    return jsonb_build_object('board', null, 'hidden', false);
  end if;

  v_guest := coalesce(p_guest, false) or tv_guest_on(v_state);
  -- «Показать гостю» opens the meeting's board only: the week board stays the director's (D-33)
  if v_guest and (v_week or not v_state.board_guest) then
    return jsonb_build_object('board', null, 'hidden', true);
  end if;
  -- shown to a guest: the director's words stay, the names and stages in the tags go (D-33)
  v_names := not v_guest;

  -- the presenter lights a point of the meeting's board; the week board has no presenter
  if not v_week then
    select n.id into v_focus from notes n
     where n.id = v_state.board_point and n.board_id = v_board.id and n.parent_id is null
       and n.deleted_at is null and (btrim(n.text) <> '' or n.sketch is not null);
  end if;

  return jsonb_build_object(
    'hidden', false,
    'board', jsonb_build_object(
      'id', v_board.id,
      'title', v_board.title,
      'updated_at', v_board.updated_at,
      'view', v_state.board_view,
      'focus', v_focus,
      'week', v_week,
      'total', (select count(*) from notes n
                 where n.board_id = v_board.id and n.parent_id is null
                   and n.deleted_at is null and (btrim(n.text) <> '' or n.sketch is not null)),
      'done', (select count(*) from notes n
                where n.board_id = v_board.id and n.parent_id is null
                  and n.deleted_at is null and (btrim(n.text) <> '' or n.sketch is not null) and n.done_at is not null),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', p.id,
                 'text', p.text,
                 'sketch', p.sketch,
                 'done', p.done_at is not null,
                 'created_at', p.created_at,
                 'assignee', case when v_names and t.status is not null and t.status <> 'revoked'
                                  then split_part(pr.full_name, ' ', 1) end,
                 'handed_done', coalesce(t.status = 'done', false),
                 'stage', case when v_names and t.status is not null and t.status <> 'revoked'
                               then tv_stage(t.status) end,
                 'children', coalesce((
                   select jsonb_agg(jsonb_build_object(
                            'id', c.id,
                            'text', c.text,
                            'sketch', c.sketch,
                            'done', c.done_at is not null,
                            'created_at', c.created_at,
                            'assignee', case when v_names and ct.status is not null and ct.status <> 'revoked'
                                             then split_part(cpr.full_name, ' ', 1) end,
                            'handed_done', coalesce(ct.status = 'done', false),
                            'stage', case when v_names and ct.status is not null and ct.status <> 'revoked'
                                          then tv_stage(ct.status) end
                          ) order by c.position, c.created_at)
                     from (
                       select * from notes c0
                        where c0.parent_id = p.id and c0.deleted_at is null
                          and (btrim(c0.text) <> '' or c0.sketch is not null)
                        order by c0.position, c0.created_at
                        limit 50
                     ) c
                     left join tasks ct on ct.id = c.converted_task_id
                     left join profiles cpr on cpr.id = ct.assignee_id
                 ), '[]'::jsonb)
               ) order by p.position, p.created_at)
          from (
            select * from notes n
             where n.board_id = v_board.id and n.parent_id is null
               and n.deleted_at is null and (btrim(n.text) <> '' or n.sketch is not null)
             order by n.position, n.created_at
             limit 200
          ) p
          left join tasks t on t.id = p.converted_task_id
          left join profiles pr on pr.id = t.assignee_id
      ), '[]'::jsonb)
    )
  );
end;
$fn$;

-- tv_calendar: the body of 20260923233000_tv_calendar_month.sql, the role check fails closed
create or replace function tv_calendar(p_guest boolean default false, p_days int default 7, p_from date default null)
returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_company uuid;
  v_from    timestamptz;
  v_days    int := least(greatest(coalesce(p_days, 7), 1), 42);
begin
  if coalesce(auth_role(), '') not in ('tv', 'director') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  v_company := auth_company_id();
  -- сутки компании, а не UTC (CLAUDE.md §6)
  v_from := coalesce(p_from, (now() at time zone 'Asia/Aqtobe')::date)::timestamp at time zone 'Asia/Aqtobe';

  return jsonb_build_object(
    'from', v_from,
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
             and e.starts_at >= v_from
             and e.starts_at < v_from + make_interval(days => v_days)
           order by e.starts_at
           limit 200
        ) e
    ), '[]'::jsonb)
  );
end;
$fn$;

-- tv_focus: the body of 20261124100000_on_time_by_handover.sql, the role check fails closed
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
  if coalesce(auth_role(), '') not in ('tv', 'director') then
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

-- tv_overlay: the body of 20261118140000_tv_wall_v5.sql, the role check fails closed
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
  if coalesce(auth_role(), '') not in ('tv', 'director') then
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

-- tv_rating: the body of 20261124100000_on_time_by_handover.sql, the role check fails closed
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
  if coalesce(auth_role(), '') not in ('tv', 'director') then
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

-- tv_summary: the body of 20261124140000_tv_wall_good_news_round.sql, the role check fails closed
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
  if auth.uid() is not null and coalesce(auth_role(), '') not in ('tv', 'director') then
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
        -- «в работе» is the wall's stage of a taken task (lib/tv/words.ts): an order not yet accepted is «Поручено»
        'in_work', count(*) filter (where t.status in ('accepted','in_progress','rework'))
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
       -- good news only (D-45): a zero or a minus never goes up by name, for a guest neither
       where r.rank <= 5 and r.points > 0
    ), '[]'::jsonb),

    -- carousel 2: the people's load — how much is in hand, how much was accepted today and over the week,
    -- the position (none for a guest); not a word about debts (D-45): `overdue` is zero for old builds that read it
    'load', coalesce((
      select jsonb_agg(jsonb_build_object('name', l.name, 'active', l.active, 'overdue', 0, 'done_today', l.done_today,
                                          'done_week', l.done_week, 'position', l.position)
                       order by l.sort_name)
        from (
          -- сортировочное имя остаётся внутри подзапроса: в выдачу гостю фамилия не попадает
          select case when v_guest then split_part(p.full_name, ' ', 1) else p.full_name end as name,
                 p.full_name as sort_name,
                 case when v_guest then null else nullif(btrim(p.position), '') end as position,
                 count(t.id) filter (where t.status in ('accepted','in_progress','rework')) as active,
                 count(t.id) filter (where t.status = 'done' and t.closed_at >= v_day) as done_today,
                 -- the week of `week` and `week_result`: the last seven days of the company, today included
                 count(t.id) filter (where t.status = 'done' and t.closed_at >= v_week) as done_week
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

-- ---------------------------------------------------------------------------
-- 7. push_subscriptions: no browser reads a device's keys. The director's device list and the
--    sender read them under the service role; the setup screen reads the switch and the last
--    answer. Without the keys a known endpoint cannot be taken over (/api/push/subscribe hands an
--    endpoint on only with matching keys)
-- ---------------------------------------------------------------------------
revoke select on public.push_subscriptions from anon, authenticated;
grant select (id, company_id, user_id, endpoint, user_agent, created_at, label, enabled,
              last_ok_at, last_error, last_error_at, updated_at)
  on public.push_subscriptions to authenticated;
