-- The report of a handover joins the transition it belongs to (D-64 §3, наряд 011C).
-- «Выполнено» used to be two calls from the phone: a message with the words and the
-- photo, then the status change. On a building-site connection the first could land and
-- the second not — the director saw a report on a task still «в работе» — and the two
-- rows raced each other in the thread. Now the words travel inside transition_task:
-- one transaction, one idempotency key, `meta.report` on the message so the outbox
-- skips it (the `pending_review` push already says the same thing).
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
  v_reason  text := nullif(payload->>'reason', '');
  v_comment text := nullif(payload->>'comment', '');
  v_report_text text := nullif(payload->'report'->>'text', '');
  v_report_path text := nullif(payload->'report'->>'file_path', '');
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

  update tasks t set status = to_status
   where t.id = v_task and t.company_id = v_company
  returning t.status, t.author_id into v_status, v_author;

  if not found then
    raise exception 'task_not_found' using errcode = 'P0001';
  end if;

  -- the reason of "Не могу" / the comment of a rework becomes a visible message
  if v_reason is not null then
    insert into task_messages (company_id, task_id, sender_id, type, content, meta)
    values (v_company, v_task, coalesce(v_user, v_author), 'text', v_reason,
            '{"decline_reason": true}'::jsonb);
  elsif v_comment is not null then
    insert into task_messages (company_id, task_id, sender_id, type, content, meta)
    values (v_company, v_task, coalesce(v_user, v_author), 'text', v_comment,
            '{"rework_comment": true}'::jsonb);
  end if;

  -- what was done, in the same transaction as the handover
  if v_report_text is not null or v_report_path is not null then
    insert into task_messages (company_id, task_id, sender_id, type, content, file_path, meta)
    values (v_company, v_task, coalesce(v_user, v_author),
            case when v_report_path is not null then 'photo'::message_type else 'text'::message_type end,
            v_report_text, v_report_path, '{"report": true}'::jsonb);
  end if;

  v_result := jsonb_build_object('task_id', v_task, 'status', v_status);

  if v_crid is not null then
    update ingest_batches b set result = v_result
     where b.company_id = v_company and b.client_request_id = v_crid;
  end if;

  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;
