-- D-144. Связка телефон–ТВ: стадии поручений на стене и доска недели в круге заставок.
--
-- 1. Рядом с поручённым пунктом стена пишет, как далеко зашло дело: «отправлено», «в работе»,
--    «на приёмке», «сдано» — только нейтральные слова: ни отказов, ни просрочек на ТВ (D-45).
--    Смена статуса или исполнителя поднимает версию `tv_state`, если пункт — на доске стены:
--    в кабинете видно, как человек принял дело, без перезагрузки.
-- 2. Доска недели (пересматривает D-102 §6 «доска гаснет в 21:00»): директор ставит свою доску
--    в круг заставок до воскресенья 21:00 — она идёт по кругу с лицом, календарём и командой,
--    и после совещания, когда доска с совещания сошла со стены. Ночью стена спит, как прежде.
--    Гостю доска недели не показывается никогда: «Показать гостю» — про доску совещания (D-33).
--    Завершённая или удалённая доска уходит из круга сама.
-- Контракт `tv_board` v3 сохранён: новые поля — `stage` у строк и `week` у доски.

-- ---------------------------------------------------------------------------
-- 1. Доска недели — в строке стены
-- ---------------------------------------------------------------------------
alter table tv_state
  add column week_board_id    uuid references mind_boards on delete set null,
  add column week_board_until timestamptz;

comment on column tv_state.week_board_id is
  'the week board (D-144): a board of the director in the round of screensavers till the end of the week; null = none';
comment on column tv_state.week_board_until is
  'the week board leaves the round at this time: the coming Sunday 21:00 Aqtobe (D-144)';

-- the coming Sunday 21:00 Aqtobe; after it — the next one
create function tv_week_end() returns timestamptz
language sql stable set search_path = public
as $fn$
  select case when v.sunday > now() then v.sunday else v.sunday + interval '7 days' end
    from (select ((date_trunc('week', now() at time zone 'Asia/Aqtobe')::date + 6) + time '21:00')
                   at time zone 'Asia/Aqtobe' as sunday) v;
$fn$;

comment on function tv_week_end() is 'the end of the week of a week board: the coming Sunday 21:00 Aqtobe (D-144)';

-- the neutral stage of a handed line, as the wall may say it (D-45): no declines, no lateness
create function tv_stage(p_status task_status) returns text
language sql immutable set search_path = public
as $fn$
  select case p_status
           when 'sent' then 'sent'
           when 'accepted' then 'work'
           when 'in_progress' then 'work'
           when 'rework' then 'work'
           when 'pending_review' then 'review'
           when 'done' then 'done'
         end;
$fn$;

comment on function tv_stage(task_status) is
  'how far a handed board line went, in the wall''s neutral words: sent / work / review / done; declined, scheduled, revoked — none (D-144, D-45)';

-- ---------------------------------------------------------------------------
-- 2. tv_week_board — «Доска недели»: поставить свою живую доску в круг или снять (null).
--    Команда абсолютна, повтор безопасен (D-76 §3). Включает круг заставок, если стена на
--    лице: доска недели живёт в круге. Доску совещания и выбранную руками тихую заставку
--    (часы на совещании) не трогает — круг включат с пульта или «Убрать».
-- ---------------------------------------------------------------------------
create function tv_week_board(p_board uuid default null) returns tv_state
language plpgsql security definer set search_path = public
as $fn$
declare
  v_company uuid;
  v_row     tv_state;
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  v_company := auth_company_id();

  -- only the author's own live board: privacy follows the author (D-75 §3)
  if p_board is not null and not exists (
    select 1 from mind_boards b
     where b.id = p_board and b.company_id = v_company and b.user_id = auth.uid()
       and b.deleted_at is null and b.finished_at is null
  ) then
    raise exception 'bad_board' using errcode = 'P0001';
  end if;

  insert into tv_state (company_id) values (v_company) on conflict (company_id) do nothing;

  update tv_state s set
    week_board_id    = p_board,
    week_board_until = case when p_board is not null then tv_week_end() end,
    -- on the face the round starts and the week board takes its turn; a meeting's board or a
    -- scene picked by hand (the quiet clock of a meeting) stays as it is
    carousel         = case when p_board is not null and s.scene = 'face' then true else s.carousel end,
    version          = s.version + 1,
    updated_by       = auth.uid(),
    updated_at       = now()
   where s.company_id = v_company
  returning * into v_row;

  return v_row;
end;
$fn$;

revoke execute on function tv_week_board(uuid) from public, anon;
grant execute on function tv_week_board(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. tv_board v4 — доска совещания, а без неё — доска недели (в круге и после совещания);
--    стадия у поручённых строк. Гостю — ни имён, ни стадий (D-33).
-- ---------------------------------------------------------------------------
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
  if auth_role() not in ('tv', 'director') then
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

-- ---------------------------------------------------------------------------
-- 4. Живьём: правка доски недели будит стену, как правка доски совещания; завершённая или
--    удалённая доска уходит из круга. Смена статуса или исполнителя поручения с доски на
--    стене поднимает версию `tv_state` — стадия на стене меняется сразу.
-- ---------------------------------------------------------------------------
create or replace function mind_board_touch_tv() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  if new.finished_at is not null or new.deleted_at is not null then
    update tv_state s set week_board_id = null, week_board_until = null,
                          version = s.version + 1, updated_at = now()
     where s.company_id = new.company_id and s.week_board_id = new.id;
  end if;
  if exists (
    select 1 from tv_state s
     where s.company_id = new.company_id
       and ((s.scene = 'board' and s.board_id = new.id)
            or (s.week_board_id = new.id and coalesce(s.week_board_until > now(), false)))
  ) then
    perform tv_touch(new.company_id);
  end if;
  return null;
end;
$fn$;

create function tasks_board_touch_tv() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  if new.status is distinct from old.status or new.assignee_id is distinct from old.assignee_id then
    if exists (
      select 1 from notes n
        join tv_state s on s.company_id = n.company_id
       where n.converted_task_id = new.id and n.board_id is not null and n.deleted_at is null
         and ((s.scene = 'board' and s.board_id = n.board_id)
              or (s.week_board_id = n.board_id and coalesce(s.week_board_until > now(), false)))
    ) then
      perform tv_touch(new.company_id);
    end if;
  end if;
  return null;
end;
$fn$;

create trigger trg_tasks_board_touch_tv
  after update of status, assignee_id on tasks
  for each row execute function tasks_board_touch_tv();

revoke execute on function tasks_board_touch_tv() from public, anon, authenticated;
