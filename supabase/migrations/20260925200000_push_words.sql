-- D-125: a push says who and when, not only what.
--
-- Until now a new task arrived as «Новая задача» + its title — the same words for every task
-- of every director, no deadline, and a few pushes had no words at all («Кофе» with an empty
-- body, «К вам посетитель» without a name). The texts are still rendered by the producers
-- (G.20c: the worker composes nothing); what changes is the words:
--
-- 1. push_when(ts) — «сегодня 18:00» / «завтра 18:00» / «пт 18:00» / «26.09 18:00» in
--    Asia/Aqtobe, the same words as humanAqtobe() on the task card.
-- 2. Tasks: «<event> · <who>» — the name of the other side (the director for the employee,
--    the employee for the director), the pattern of «Готово · Марат» and «Задача не принята ·
--    Марат»; no gendered verbs (docs/DESIGN.md). A new task and a rework carry the deadline in
--    the body while it is still ahead: «Купить две пачки А4 · срок сегодня 18:00».
-- 3. Errands: a request without a note says who asks — «Кофе» / «Просит Ерлан».
-- 4. Visits: a visitor without a name gets the question the director answers.
--
-- Nothing else in these three triggers changes; the director's «текст на блокировке: только
-- что случилось» still hides all of it (lib/push/policy.ts lockScreenText).

-- ---------------------------------------------------------------------------
-- 1. «сегодня 18:00» in SQL
-- ---------------------------------------------------------------------------
create or replace function push_when(p_at timestamptz, p_now timestamptz default now()) returns text
language sql stable set search_path = public
as $fn$
  select case
           when p_at is null then null
           else case
                  when d = 0 then 'сегодня '
                  when d = 1 then 'завтра '
                  when d = -1 then 'вчера '
                  when d between 2 and 6
                    then (array['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'])[extract(dow from w)::int + 1] || ' '
                  when extract(year from w) = extract(year from n) then to_char(w, 'DD.MM ')
                  else to_char(w, 'DD.MM.YYYY ')
                end || to_char(w, 'HH24:MI')
         end
    from (select p_at at time zone 'Asia/Aqtobe' as w,
                 p_now at time zone 'Asia/Aqtobe' as n,
                 (p_at at time zone 'Asia/Aqtobe')::date - (p_now at time zone 'Asia/Aqtobe')::date as d) x
$fn$;

revoke execute on function push_when(timestamptz, timestamptz) from public, anon;

-- ---------------------------------------------------------------------------
-- 2. Tasks: body of 20260924150000_push_foundation.sql; only the words change
-- ---------------------------------------------------------------------------
create or replace function notify_outbox_task() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_title    text := left(coalesce(new.title, 'Задача'), 120);
  v_after    timestamptz := now();
  v_author   text;
  v_assignee text;
  v_due      text;
begin
  -- the other side of the push, by first name — the way the team calls each other
  select nullif(split_part(p.full_name, ' ', 1), '') into v_author from profiles p where p.id = new.author_id;
  select nullif(split_part(p.full_name, ' ', 1), '') into v_assignee from profiles p where p.id = new.assignee_id;
  -- a deadline still ahead says when; one already behind says nothing (the card shows it red)
  v_due := case when new.deadline > now() then ' · срок ' || push_when(new.deadline) else '' end;

  -- to the assignee: the task went out (insert as sent, or scheduled -> sent by the tick);
  -- a batch or a reassign already chose its moment, «Настоять» (declined -> sent) did not —
  -- at night it waits for the window like any other word to an employee
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status is distinct from 'sent') then
    if tg_op = 'UPDATE' and old.status = 'declined' then
      v_after := coalesce(next_delivery_slot(new.company_id, now()), now());
    end if;
    insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta, deliver_after)
    values (new.company_id, new.assignee_id, new.id, 'task_sent',
            jsonb_build_object('title', 'Новая задача' || coalesce(' · ' || v_author, ''),
                               'body', v_title || v_due, 'url', '/tasks/' || new.id),
            v_after);
  end if;

  if tg_op = 'UPDATE' and new.status = 'pending_review' and old.status is distinct from 'pending_review' then
    insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta)
    values (new.company_id, new.author_id, new.id, 'pending_review',
            jsonb_build_object('title', 'На приёмку' || coalesce(' · ' || v_assignee, ''),
                               'body', v_title, 'url', '/tasks/' || new.id));
  end if;

  if tg_op = 'UPDATE' and new.status = 'declined' and old.status is distinct from 'declined' then
    insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta)
    values (new.company_id, new.author_id, new.id, 'declined',
            jsonb_build_object('title', 'Не может' || coalesce(' · ' || v_assignee, ''),
                               'body', v_title, 'url', '/tasks/' || new.id));
  end if;

  -- back to the assignee: what the director decided
  if tg_op = 'UPDATE' and new.status = 'rework' and old.status is distinct from 'rework' then
    insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta)
    values (new.company_id, new.assignee_id, new.id, 'rework',
            jsonb_build_object('title', 'На доработку' || coalesce(' · ' || v_author, ''),
                               'body', v_title || v_due, 'url', '/tasks/' || new.id));
  end if;

  if tg_op = 'UPDATE' and new.status = 'done' and old.status is distinct from 'done' then
    insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta)
    values (new.company_id, new.assignee_id, new.id, 'done',
            jsonb_build_object('title', 'Принято' || coalesce(' · ' || v_author, ''),
                               'body', v_title, 'url', '/tasks/' || new.id));
  end if;

  if tg_op = 'UPDATE' and new.status = 'revoked' and old.status is distinct from 'revoked'
     and old.status in ('sent', 'accepted', 'in_progress', 'rework', 'pending_review') then
    insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta)
    values (new.company_id, new.assignee_id, new.id, 'revoked',
            jsonb_build_object('title', 'Отозвано' || coalesce(' · ' || v_author, ''),
                               'body', v_title, 'url', '/tasks/' || new.id));
  end if;

  return new;
end
$fn$;

-- ---------------------------------------------------------------------------
-- 3. Errands: body of 20260924096000_errand_due.sql; an empty body names who asks
-- ---------------------------------------------------------------------------
create or replace function notify_outbox_errand() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_name   text;
  v_due    text;
  v_author text;
begin
  if tg_op = 'INSERT' then
    if new.status = 'sent' then
      -- a bare «Кофе» said nothing of who wants it: the body names the person (D-125)
      select nullif(split_part(pr.full_name, ' ', 1), '') into v_author from profiles pr where pr.id = new.author_id;
      v_due := case
                 when new.due_at is null then ''
                 when (new.due_at at time zone 'Asia/Aqtobe')::date > (new.created_at at time zone 'Asia/Aqtobe')::date
                   then ' · завтра к ' || to_char(new.due_at at time zone 'Asia/Aqtobe', 'HH24:MI')
                 else ' · к ' || to_char(new.due_at at time zone 'Asia/Aqtobe', 'HH24:MI')
               end;
      insert into notification_deliveries (company_id, user_id, event_kind, meta)
      select new.company_id, r, 'errand_sent',
             jsonb_build_object(
               'title', case
                          when new.urgent and new.kind = 'security' then '🚨 Вызови охрану!'
                          when new.urgent then '🚨 Срочно: ' || new.label
                          else new.label || v_due
                        end,
               'body', coalesce(new.note, case when new.urgent then 'Директор ждёт'
                                            else coalesce('Просит ' || v_author, '') end),
               'errand_id', new.id,
               'url', '/secretary?e=' || new.id,
               'urgent', new.urgent)
        from errand_recipients(new.company_id, new.author_id) r;
    end if;
    return null;
  end if;

  if new.status is not distinct from old.status then
    return null;
  end if;

  if new.status = 'accepted' then
    -- «принято» директор видит на столе секретаря; пуш — только по тревоге
    if new.urgent then
      select split_part(pr.full_name, ' ', 1) into v_name from profiles pr where pr.id = new.claimed_by;
      insert into notification_deliveries (company_id, user_id, event_kind, meta)
      values (new.company_id, new.author_id, 'errand_accepted',
              jsonb_build_object(
                'title', 'Принято · ' || coalesce(v_name, 'секретарь'),
                'body', new.label,
                'errand_id', new.id,
                'tag', 'errand-' || new.id,
                'url', '/pulse'));
    end if;

  elsif new.status = 'done' then
    -- обычное «готово» — на столе; с результатом пуш шлёт errand_result
    if new.urgent then
      select split_part(pr.full_name, ' ', 1) into v_name from profiles pr where pr.id = new.claimed_by;
      insert into notification_deliveries (company_id, user_id, event_kind, meta)
      values (new.company_id, new.author_id, 'errand_done',
              jsonb_build_object(
                'title', 'Готово · ' || coalesce(v_name, 'секретарь'),
                'body', case when new.kind = 'security' then 'Охрана на месте' else new.label || coalesce(': ' || new.result, '') end,
                'errand_id', new.id,
                'tag', 'errand-' || new.id,
                'url', '/pulse'));
    end if;

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

-- ---------------------------------------------------------------------------
-- 4. Visits: body of 20260924180000_visit_messages.sql; a nameless visitor gets the question
-- ---------------------------------------------------------------------------
create or replace function notify_outbox_visit() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_title text;
begin
  if tg_op = 'INSERT' then
    insert into notification_deliveries (company_id, user_id, event_kind, meta)
    select new.company_id, p.id,
           case when new.kind = 'message' then 'visit_message' else 'visit_arrived' end,
           jsonb_build_object(
             'title', case when new.kind = 'message' then 'Сообщение от секретаря' else 'К вам посетитель' end,
             -- a visitor without a name still gets words: the question the director answers (D-125)
             'body', coalesce(new.note, case when new.kind = 'message' then '' else 'Пусть заходит или подождёт?' end),
             'visit_id', new.id,
             'url', '/pulse')
      from profiles p
     where p.company_id = new.company_id and p.role = 'director' and p.is_active;
    return null;
  end if;

  -- the card put away before anybody answered: the push that has not left yet is dropped
  if new.closed_at is not null and old.closed_at is null and new.status in ('waiting', 'wait') then
    delete from notification_deliveries
     where status = 'queued' and meta->>'visit_id' = new.id::text;
    return null;
  end if;

  if new.status is not distinct from old.status then
    return null;
  end if;

  if new.kind = 'message' then
    -- read on the wall or on the remote: a push still waiting in a digest or a quiet hour
    -- would only repeat words the director has already seen
    if new.status = 'read' then
      delete from notification_deliveries
       where status = 'queued' and claimed_at is null and event_kind = 'visit_message'
         and meta->>'visit_id' = new.id::text;
      return null;
    end if;
    v_title := case new.status when 'expired' then 'Директор не прочитал' end;
  else
    v_title := case new.status
                 when 'invited'  then 'Директор: пусть заходит'
                 when 'wait'     then 'Директор просит подождать'
                 when 'declined' then 'Директор не примет'
                 when 'expired'  then 'Директор не ответил'
               end;
  end if;
  if v_title is null then
    return null;
  end if;

  insert into notification_deliveries (company_id, user_id, event_kind, meta)
  values (new.company_id, new.author_id, 'visit_answered',
          jsonb_build_object(
            'title', v_title,
            'body', coalesce(new.note, 'Посетитель'),
            'visit_id', new.id,
            'url', '/feed'));
  return null;
end
$fn$;
