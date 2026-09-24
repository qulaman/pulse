-- D-114, stage 0: the delivery subsystem stops losing and doubling pushes.
--
-- 1. publish_due_scheduled (tasks/017, never landed): a task dictated outside the delivery
--    window (D-38) or reassigned outside it (D-51 §3) waits as `scheduled` with
--    `scheduled_send_at` = the next window opening, and nothing ever released it — the pg_cron
--    job from docs/DATABASE.md was never created. The minute sweep now calls this first; the
--    status guard lets `scheduled -> sent` through only without a user, the outbox trigger
--    queues `task_sent`, tv_events emits the wall event. A repeated or overlapping tick is
--    harmless: a row is taken only while it is still `scheduled`, locked rows are skipped.
-- 2. claim_deliveries: the kick after a mutation and the minute sweep used to read the same
--    queued rows and could both send one push. A worker now claims rows first
--    (`for update skip locked` + `claimed_at`); a claim older than two minutes is a crashed
--    worker, and the row goes back to the queue.
-- 3. «Настоять» at night (declined -> sent) pushed the employee at once, past the window every
--    other employee event waits for. The re-sent task now waits for the window like the rest.
-- 4. A deleted announcement no longer reaches phones in the morning: its queued pushes carry
--    the announcement's id and go with it. The shade keeps one bubble for the Ether (tag).
-- 5. «Не смогу» pressed twice told the author twice: only the change into `declined` pushes.

-- ---------------------------------------------------------------------------
-- 1. Held tasks go out on the minute tick
-- ---------------------------------------------------------------------------
create or replace function publish_due_scheduled(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_count int;
begin
  update tasks t
     set status = 'sent'
   where t.id in (
           select s.id from tasks s
            where s.status = 'scheduled'
              and s.scheduled_send_at <= p_now
            order by s.scheduled_send_at
            for update skip locked
         );
  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

revoke execute on function publish_due_scheduled(timestamptz) from public, anon, authenticated;
-- only the sweep calls the tick: no person has this button
grant execute on function publish_due_scheduled(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 2. A worker claims what it sends
-- ---------------------------------------------------------------------------
alter table notification_deliveries add column if not exists claimed_at timestamptz;

create or replace function claim_deliveries(p_limit int default 50) returns setof notification_deliveries
language sql security definer set search_path = public
as $fn$
  update notification_deliveries d
     set claimed_at = now()
   where d.id in (
           select q.id from notification_deliveries q
            where q.status = 'queued'
              and q.channel = 'push'
              and q.attempts < 3
              and q.deliver_after <= now()
              and (q.claimed_at is null or q.claimed_at < now() - interval '2 minutes')
            order by q.created_at
            limit greatest(1, least(p_limit, 500))
            for update skip locked
         )
  returning d.*;
$fn$;

revoke execute on function claim_deliveries(int) from public, anon, authenticated;
grant execute on function claim_deliveries(int) to service_role;

-- ---------------------------------------------------------------------------
-- 3. The task trigger: body from 20260911210000_outbox_replies.sql; «Настоять» waits for
--    the window. Everything else is unchanged.
-- ---------------------------------------------------------------------------
create or replace function notify_outbox_task() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_title text := left(coalesce(new.title, 'Задача'), 120);
  v_after timestamptz := now();
begin
  -- to the assignee: the task went out (insert as sent, or scheduled -> sent by the tick);
  -- a batch or a reassign already chose its moment, «Настоять» (declined -> sent) did not —
  -- at night it waits for the window like any other word to an employee
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status is distinct from 'sent') then
    if tg_op = 'UPDATE' and old.status = 'declined' then
      v_after := coalesce(next_delivery_slot(new.company_id, now()), now());
    end if;
    insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta, deliver_after)
    values (new.company_id, new.assignee_id, new.id, 'task_sent',
            jsonb_build_object('title', 'Новая задача', 'body', v_title, 'url', '/tasks/' || new.id),
            v_after);
  end if;

  if tg_op = 'UPDATE' and new.status = 'pending_review' and old.status is distinct from 'pending_review' then
    insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta)
    values (new.company_id, new.author_id, new.id, 'pending_review',
            jsonb_build_object('title', 'На приёмку', 'body', v_title, 'url', '/tasks/' || new.id));
  end if;

  if tg_op = 'UPDATE' and new.status = 'declined' and old.status is distinct from 'declined' then
    insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta)
    values (new.company_id, new.author_id, new.id, 'declined',
            jsonb_build_object('title', 'Не может выполнить', 'body', v_title, 'url', '/tasks/' || new.id));
  end if;

  -- back to the assignee: what the director decided
  if tg_op = 'UPDATE' and new.status = 'rework' and old.status is distinct from 'rework' then
    insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta)
    values (new.company_id, new.assignee_id, new.id, 'rework',
            jsonb_build_object('title', 'Директор вернул задачу', 'body', v_title, 'url', '/tasks/' || new.id));
  end if;

  if tg_op = 'UPDATE' and new.status = 'done' and old.status is distinct from 'done' then
    insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta)
    values (new.company_id, new.assignee_id, new.id, 'done',
            jsonb_build_object('title', 'Принято', 'body', v_title, 'url', '/tasks/' || new.id));
  end if;

  if tg_op = 'UPDATE' and new.status = 'revoked' and old.status is distinct from 'revoked'
     and old.status in ('sent', 'accepted', 'in_progress', 'rework', 'pending_review') then
    insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta)
    values (new.company_id, new.assignee_id, new.id, 'revoked',
            jsonb_build_object('title', 'Отозвано директором', 'body', v_title, 'url', '/tasks/' || new.id));
  end if;

  return new;
end
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Announcements: the push knows its announcement, a delete takes the queued ones along
-- ---------------------------------------------------------------------------
create or replace function notify_outbox_announcement() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  insert into notification_deliveries (company_id, user_id, event_kind, meta)
  select new.company_id, p.id, 'announcement',
         jsonb_build_object('title', 'Объявление', 'body', left(new.transcript, 120), 'url', '/ether',
                            'tag', 'ether', 'announcement_id', new.id)
    from profiles p
   where p.company_id = new.company_id
     and p.is_active
     and p.role <> 'tv'
     and p.id <> new.author_id;
  return new;
end
$fn$;

create or replace function drop_announcement_pushes() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  -- what already reached a phone stays there; what still waits for the window does not go
  delete from notification_deliveries
   where status = 'queued'
     and event_kind = 'announcement'
     and meta->>'announcement_id' = old.id::text;
  return old;
end
$fn$;

drop trigger if exists trg_drop_announcement_pushes on announcements;
create trigger trg_drop_announcement_pushes
after delete on announcements
for each row execute function drop_announcement_pushes();

-- ---------------------------------------------------------------------------
-- 5. respond_event: body from 20260918150000_calendar_events.sql; the author hears a
--    «не сможет» once — a second tap of the same answer changes the reason, not the phone
-- ---------------------------------------------------------------------------
create or replace function respond_event(
  p_event uuid,
  p_status text,
  p_reason text default null
) returns event_participants
language plpgsql security definer set search_path = public
as $fn$
declare
  v_event events%rowtype;
  v_row   event_participants%rowtype;
  v_user  uuid := auth.uid();
  v_name  text;
  v_prev  text;
begin
  if p_status not in ('going', 'declined') then
    raise exception 'bad_status' using errcode = 'P0001';
  end if;

  select * into v_event from events
   where id = p_event and company_id = auth_company_id() and cancelled_at is null;
  if v_event.id is null then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  select status into v_prev from event_participants where event_id = p_event and user_id = v_user;

  -- отвечает только тот, кого позвали: чужое мероприятие ответа не принимает
  update event_participants
     set status       = p_status,
         reason       = case when p_status = 'declined' then nullif(p_reason, '') else null end,
         responded_at = now()
   where event_id = p_event and user_id = v_user
  returning * into v_row;

  if v_row.event_id is null then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  -- автор узнаёт об отказе сразу: состав встречи меняется здесь и сейчас — один раз
  if p_status = 'declined' and v_prev is distinct from 'declined' and v_event.author_id <> v_user then
    select split_part(full_name, ' ', 1) into v_name from profiles where id = v_user;
    insert into notification_deliveries (company_id, user_id, event_kind, meta)
    values (v_event.company_id, v_event.author_id, 'event_declined',
            jsonb_build_object(
              'title', 'Не сможет',
              'body', coalesce(v_name, 'Сотрудник') || ' · ' || left(v_event.title, 80) ||
                      coalesce(': ' || v_row.reason, ''),
              'url', '/calendar?e=' || v_event.id));
  end if;

  return v_row;
end;
$fn$;
