-- The employee's side of the receipts (принцип 8, owner 2026-09-11): until now the outbox
-- knew only what reaches the director (question, pending_review, declined) and the very
-- first «task_sent». What the director does back stayed silent — an answer to a question,
-- a rework, an acceptance, a revoke. Three more event kinds, same table, same worker:
--   reply   — the author wrote in the thread of somebody else's task (text / voice / photo)
--   rework  — the task came back («Директор вернул задачу»)
--   done    — accepted («Принято»)
--   revoked — taken back («Отозвано директором»), also after a reassign
-- Quiet hours and delivery stay the worker's business; here only the rows are queued.

create or replace function notify_outbox_task() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_title text := left(coalesce(new.title, 'Задача'), 120);
begin
  -- to the assignee: the task went out (insert as sent, or scheduled -> sent by cron)
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status is distinct from 'sent') then
    insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta)
    values (new.company_id, new.assignee_id, new.id, 'task_sent',
            jsonb_build_object('title', 'Новая задача', 'body', v_title, 'url', '/tasks/' || new.id));
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

-- the director wrote in the thread: the assignee hears it («Директор ответил: Да»)
create or replace function notify_outbox_reply() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_task tasks%rowtype;
  v_body text;
begin
  if new.type not in ('text', 'voice', 'photo') then
    return new;
  end if;
  select * into v_task from tasks where id = new.task_id;
  if v_task.id is null or v_task.author_id <> new.sender_id or v_task.assignee_id = new.sender_id then
    return new;
  end if;
  v_body := case new.type
    when 'voice' then 'Голосовое сообщение'
    when 'photo' then coalesce(nullif(new.content, ''), 'Фото')
    else left(coalesce(new.content, ''), 120)
  end;
  insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta)
  values (new.company_id, v_task.assignee_id, v_task.id, 'reply',
          jsonb_build_object('title', 'Директор ответил', 'body', v_body, 'url', '/tasks/' || v_task.id));
  return new;
end
$fn$;

drop trigger if exists trg_notify_outbox_replies on task_messages;
create trigger trg_notify_outbox_replies
after insert on task_messages
for each row execute function notify_outbox_reply();
