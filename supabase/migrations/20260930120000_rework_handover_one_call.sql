-- D-130, wave 1 («ничего не теряется»): «Выполнено» after a rework is one call.
--
-- The employee taps «Выполнено» once, but the status matrix walks rework → accepted →
-- pending_review, and the client made that two calls with two keys (lib/tasks/mutations.ts):
-- the report travelled with the second one, so a tab closed or a network lost between them
-- left the task in «accepted» and the words gone. D-128 already walks rework → accepted →
-- declined inside transition_task for «Не могу»; the handover takes the same path.
--
-- transition_task is otherwise the D-128 version (20260926120000_task_lifecycle.sql) word for
-- word. Grants are unchanged: create or replace keeps them.

create or replace function transition_task(
  task_id uuid,
  to_status task_status,
  payload jsonb default '{}',
  client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid    uuid := client_request_id;      -- the parameters shadow column names
  v_task    uuid := task_id;
  v_company uuid := auth_company_id();
  v_user    uuid := auth.uid();
  v_result  jsonb;
  v_status  task_status;
  v_author  uuid;
  v_title   text;
  v_reason  text := nullif(payload->>'reason', '');
  v_comment text := nullif(payload->>'comment', '');
  v_report_text text := nullif(payload->'report'->>'text', '');
  v_report_path text := nullif(payload->'report'->>'file_path', '');
  v_partial boolean := coalesce((payload->'report'->>'partial')::boolean, false);
  v_suggest uuid := nullif(payload->>'suggest_assignee_id', '')::uuid;
  v_suggest_name text;
  v_meta    jsonb := '{"decline_reason": true}'::jsonb;
begin
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

  -- «Это к другому»: the colleague is checked before anything moves
  if to_status = 'declined' and v_suggest is not null then
    select p.full_name into v_suggest_name
      from profiles p
     where p.id = v_suggest and p.company_id = v_company and p.is_active and p.role <> 'tv';
    if not found then
      raise exception 'assignee_not_found' using errcode = 'P0001';
    end if;
    if v_suggest = v_user then
      raise exception 'same_assignee' using errcode = 'P0001';
    end if;
    v_meta := v_meta || jsonb_build_object('suggest_assignee_id', v_suggest, 'suggest_name', v_suggest_name);
    -- the suggestion travels on the reason's row: a refusal without words still carries one
    v_reason := coalesce(v_reason, 'Это не ко мне');
  end if;

  -- From a rework the assignee's next move is one tap — «Выполнено» or «Не могу» — but the guard
  -- knows only accepted → pending_review and accepted → declined, and rework → accepted is the
  -- assignee's own step: the same hand walks it here, in the same transaction as the handover,
  -- the guard's rules untouched. The client used to make it two calls, and a tab closed between
  -- them lost the report (D-130); rework → accepted queues no push of its own.
  if to_status in ('declined', 'pending_review') then
    update tasks t set status = 'accepted'
     where t.id = v_task and t.company_id = v_company and t.status = 'rework';
  end if;

  update tasks t set status = to_status
   where t.id = v_task and t.company_id = v_company
  returning t.status, t.author_id, t.title into v_status, v_author, v_title;

  if not found then
    raise exception 'task_not_found' using errcode = 'P0001';
  end if;

  -- the reason of "Не могу" / the comment of a rework becomes a visible message
  if v_reason is not null then
    insert into task_messages (company_id, task_id, sender_id, type, content, meta)
    values (v_company, v_task, coalesce(v_user, v_author), 'text', v_reason, v_meta);

    -- the director's push says why, not only that (the trigger queued it a moment ago)
    update notification_deliveries d
       set meta = d.meta || jsonb_build_object(
             'body', '«' || left(coalesce(v_title, 'Задача'), 60) || '» · ' || left(v_reason, 90)
                     || coalesce(' · предлагает: ' || nullif(split_part(v_suggest_name, ' ', 1), ''), ''))
     where d.task_id = v_task and d.event_kind = 'declined' and d.status = 'queued'
       and d.created_at >= now();
  elsif v_comment is not null then
    insert into task_messages (company_id, task_id, sender_id, type, content, meta)
    values (v_company, v_task, coalesce(v_user, v_author), 'text', v_comment,
            '{"rework_comment": true}'::jsonb);
  end if;

  -- what was done, in the same transaction as the handover
  if v_report_text is not null or v_report_path is not null or v_partial then
    insert into task_messages (company_id, task_id, sender_id, type, content, file_path, meta)
    values (v_company, v_task, coalesce(v_user, v_author),
            case when v_report_path is not null then 'photo'::message_type else 'text'::message_type end,
            coalesce(v_report_text, case when v_partial and v_report_path is null then 'Сделано не всё' end),
            v_report_path,
            jsonb_build_object('report', true) || case when v_partial then '{"partial": true}'::jsonb else '{}'::jsonb end);
  end if;

  -- «сделано не всё» reaches the director's push too
  if v_partial and to_status = 'pending_review' then
    update notification_deliveries d
       set meta = d.meta || jsonb_build_object('title', coalesce(d.meta->>'title', 'На приёмку') || ' · не всё')
     where d.task_id = v_task and d.event_kind = 'pending_review' and d.status = 'queued'
       and d.created_at >= now();
  end if;

  v_result := jsonb_build_object('task_id', v_task, 'status', v_status);

  if v_crid is not null then
    update ingest_batches b set result = v_result
     where b.company_id = v_company and b.client_request_id = v_crid;
  end if;

  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;
