-- Two fixes from the review of the same day:
--   1. reassign_task bypassed the delivery window: a reassign at 23:00 pushed the new person
--      at night, while the same order by voice would wait for the morning (D-38). Now the
--      clone follows the company window exactly like confirm_voice_batch — outside it the
--      task is `scheduled` for the window's start and cron sends it (next_delivery_slot is
--      the shared rule, available to every producer).
--   2. notify_outbox_reply also fired on the director's own rework comment / the employee's
--      decline reason, which transition_task inserts as messages — one tap, two pushes.

create or replace function next_delivery_slot(p_company uuid, p_now timestamptz default now())
returns timestamptz
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_window jsonb;
  v_from   time;
  v_to     time;
  v_local  timestamp;
begin
  select coalesce(c.settings->'delivery_window', '{"from":"08:00","to":"21:00"}'::jsonb)
    into v_window from companies c where c.id = p_company;
  v_from  := coalesce(v_window->>'from', '08:00')::time;
  v_to    := coalesce(v_window->>'to',   '21:00')::time;
  v_local := p_now at time zone 'Asia/Aqtobe';
  if v_local::time >= v_from and v_local::time < v_to then
    return null;                                          -- inside the window: send now
  end if;
  if v_local::time < v_from then
    return (v_local::date + v_from) at time zone 'Asia/Aqtobe';
  end if;
  return ((v_local::date + 1) + v_from) at time zone 'Asia/Aqtobe';
end;
$fn$;

grant execute on function next_delivery_slot(uuid, timestamptz) to authenticated, service_role;

create or replace function reassign_task(
  task_id uuid,
  new_assignee_id uuid,
  client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid     uuid := client_request_id;
  v_task     tasks%rowtype;
  v_company  uuid := auth_company_id();
  v_user     uuid := auth.uid();
  v_result   jsonb;
  v_new_id   uuid;
  v_name     text;
  v_slot     timestamptz;
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  if v_crid is not null then
    insert into ingest_batches (company_id, user_id, client_request_id, result)
    values (v_company, v_user, v_crid, '{}'::jsonb)
    on conflict on constraint ingest_batches_company_request_key do nothing;
    if not found then
      select b.result into v_result
        from ingest_batches b
       where b.company_id = v_company and b.client_request_id = v_crid;
      return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('duplicate', true);
    end if;
  end if;

  select * into v_task from tasks t where t.id = task_id and t.company_id = v_company;
  if not found then
    raise exception 'task_not_found' using errcode = 'P0001';
  end if;
  if v_task.status not in ('sent', 'accepted', 'in_progress', 'rework', 'declined') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  if new_assignee_id = v_task.assignee_id then
    raise exception 'same_assignee' using errcode = 'P0001';
  end if;

  select p.full_name into v_name
    from profiles p
   where p.id = new_assignee_id and p.company_id = v_company and p.is_active and p.role <> 'tv';
  if not found then
    raise exception 'assignee_not_found' using errcode = 'P0001';
  end if;

  -- the same order for a new person; outside the delivery window it waits for the morning (D-38)
  v_slot := next_delivery_slot(v_company, now());
  insert into tasks (company_id, author_id, assignee_id, group_id, parent_task_id, title, body,
                     deadline, priority, status, scheduled_send_at, source, source_audio_path, source_transcript)
  values (v_company, v_user, new_assignee_id, v_task.group_id, v_task.id, v_task.title, v_task.body,
          v_task.deadline, v_task.priority,
          case when v_slot is null then 'sent'::task_status else 'scheduled'::task_status end,
          v_slot, v_task.source, v_task.source_audio_path, v_task.source_transcript)
  returning id into v_new_id;

  -- the old one closes with a pointer to where the work went
  update tasks set status = 'revoked' where id = v_task.id;
  insert into task_messages (company_id, task_id, sender_id, type, content, meta)
  values (v_company, v_task.id, v_user, 'system', 'Переназначено: ' || v_name,
          jsonb_build_object('reassigned_to', v_new_id, 'assignee_id', new_assignee_id));

  v_result := jsonb_build_object('old_task_id', v_task.id, 'new_task_id', v_new_id, 'assignee', v_name,
                                 'scheduled_send_at', v_slot);
  if v_crid is not null then
    update ingest_batches set result = v_result
     where company_id = v_company and ingest_batches.client_request_id = v_crid;
  end if;
  return v_result;
end;
$fn$;

-- a rework comment or a decline reason already has its own push (rework / declined)
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
  if coalesce((new.meta->>'rework_comment')::boolean, false)
     or coalesce((new.meta->>'decline_reason')::boolean, false) then
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
