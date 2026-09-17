-- Messages get receipts (D-64, наряд 011B). Until now a word in a thread reached the
-- other side only if it fitted one of two shapes: `question` (the employee asked) or
-- `reply` (the author answered). Everything else — «Сделал», a photo from the site, a
-- manager's line — was silent: the board showed it, the phone did not. One event kind
-- replaces both:
--   * `message` — any real word of a thread (text / voice / photo) to every participant
--     but its sender; the reason of a «Не могу», the rework comment and the report of a
--     handover keep their own pushes (declined / rework / pending_review) and are skipped;
--   * messages that arrive while the previous one is still queued collapse into that row
--     («3 новых сообщения · последние слова») — one buzz per burst, not three;
--   * a message to an employee waits for the delivery window, a message to the director
--     (the task's author) leaves at once, exactly as `question` did (open D-51 §2);
--   * mark_thread_read() closes the receipts it covers: «Прочитал» from the notification
--     shade is a read cursor, not a separate ack.
-- Rows of the old kinds stay in the table as history.

-- 1 -- the old shapes go ------------------------------------------------------
drop trigger if exists trg_notify_outbox_questions on task_messages;
drop trigger if exists trg_notify_outbox_replies on task_messages;
drop function if exists notify_outbox_question();
drop function if exists notify_outbox_reply();

-- 2 -- one event for every word of a thread -----------------------------------
create or replace function notify_outbox_message() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_task     tasks%rowtype;
  v_sender   text;
  v_words    text;
  v_title    text;
  v_question boolean := coalesce((new.meta->>'is_question')::boolean, false);
  v_person   uuid;
begin
  -- status lines and system notes are not words of the conversation
  if new.type not in ('text', 'voice', 'photo') then
    return new;
  end if;
  -- these three have a push of their own — declined / rework / pending_review
  if coalesce((new.meta->>'decline_reason')::boolean, false)
     or coalesce((new.meta->>'rework_comment')::boolean, false)
     or coalesce((new.meta->>'report')::boolean, false) then
    return new;
  end if;

  select * into v_task from tasks t where t.id = new.task_id;
  if v_task.id is null then
    return new;
  end if;

  select case when p.role = 'director' then 'Директор'
              else nullif(split_part(coalesce(p.full_name, ''), ' ', 1), '') end
    into v_sender
    from profiles p where p.id = new.sender_id;
  v_sender := coalesce(v_sender, 'Сообщение');

  v_words := case new.type
    when 'photo' then 'Фото' || case when coalesce(new.content, '') <> '' then ': ' || left(new.content, 100) else '' end
    when 'voice' then 'Голосовое' || case when coalesce(new.content, '') <> '' then ': ' || left(new.content, 100) else '' end
    else left(coalesce(new.content, ''), 120)
  end;

  v_title := case when v_question
                  then 'Вопрос по «' || left(v_task.title, 60) || '»'
                  else v_sender || ' · «' || left(v_task.title, 60) || '»' end;

  -- everybody in the thread but the one who wrote: the author and the assignee, and so a
  -- manager writing as the author's stand-in is not lost either
  for v_person in
    select distinct person
      from unnest(array[v_task.author_id, v_task.assignee_id]) as person
     where person is not null and person <> new.sender_id
  loop
    -- still queued? then this is the same buzz — fold the new words into it
    update notification_deliveries d
       set meta = d.meta || jsonb_build_object(
             'count', coalesce((d.meta->>'count')::int, 1) + 1,
             'title', v_title,
             'body', (coalesce((d.meta->>'count')::int, 1) + 1)::text || ' '
                     || case when coalesce((d.meta->>'count')::int, 1) + 1 between 2 and 4
                             then 'новых сообщения' else 'новых сообщений' end
                     || ' · ' || v_words,
             'last_seq', new.seq,
             'message_id', new.id)
     where d.user_id = v_person
       and d.task_id = v_task.id
       and d.event_kind = 'message'
       and d.status = 'queued';

    if not found then
      insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta)
      values (new.company_id, v_person, v_task.id, 'message',
              jsonb_build_object(
                'title', v_title,
                'body', v_words,
                'url', '/tasks/' || v_task.id,
                -- one notification per task on the phone: a new word replaces the old bubble
                'tag', 'task:' || v_task.id,
                'count', 1,
                'last_seq', new.seq,
                'message_id', new.id,
                'is_question', v_question));
    end if;
  end loop;

  return new;
end
$fn$;

create trigger trg_notify_outbox_messages
after insert on task_messages
for each row execute function notify_outbox_message();

-- 3 -- quiet hours: the employee's phone waits, the director's does not --------
create or replace function notification_deliveries_deliver_after() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  -- what reaches an employee's phone waits for the window; the director's own alerts and a
  -- task whose moment the producer already decided (batch / «отправить сейчас» / scheduled
  -- reassign) do not
  if new.event_kind in ('reply', 'rework', 'done', 'revoked', 'deadline_extended', 'announcement') then
    new.deliver_after := coalesce(next_delivery_slot(new.company_id, now()), now());
  end if;
  -- a message to somebody who is not the task's author is a message to an employee
  if new.event_kind = 'message' and exists (
       select 1 from tasks t where t.id = new.task_id and t.author_id <> new.user_id
     ) then
    new.deliver_after := coalesce(next_delivery_slot(new.company_id, now()), now());
  end if;
  return new;
end
$fn$;

-- 4 -- reading the thread is the ack ------------------------------------------
create or replace function mark_thread_read(task_id uuid, seq bigint) returns bigint
language plpgsql security definer set search_path = public
as $fn$
-- the parameters are named after their columns (the client calls with named args), so
-- a bare `task_id` in the conflict target has to mean the column; the parameters are
-- read positionally below
#variable_conflict use_column
declare
  v_seq bigint;
begin
  if not exists (
    select 1 from tasks t where t.id = $1 and t.company_id = auth_company_id()
  ) then
    raise exception 'task_not_found' using errcode = 'P0001';
  end if;

  insert into task_reads (task_id, user_id, company_id, last_seq, seen_at)
  values ($1, auth.uid(), auth_company_id(), $2, now())
  on conflict (task_id, user_id) do update
     set last_seq = greatest(task_reads.last_seq, excluded.last_seq),
         seen_at  = now()
  returning last_seq into v_seq;

  -- «Прочитал» — from the thread or from the notification shade — closes every message
  -- receipt the cursor now covers (D-32: the person acted on it themselves)
  update notification_deliveries d
     set acted_at = coalesce(d.acted_at, now()),
         seen_at  = coalesce(d.seen_at, now())
   where d.user_id = auth.uid()
     and d.task_id = $1
     and d.event_kind = 'message'
     and d.acted_at is null
     and coalesce((d.meta->>'last_seq')::bigint, 0) <= $2;

  return v_seq;
end
$fn$;
