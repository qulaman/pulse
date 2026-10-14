-- D-137: a minus the director says by voice is a minus (owner, 2026-10-14: «раз директор сказал минус
-- значит минус»; revises D-30). confirm_voice_batch is the 20260923205000_notes_reminders_trash.sql
-- version word for word, except the points branch: a negative amount is written like a positive one
-- (manual, with the phrase's reason or «снял директор»), only zero is skipped. The person may dispute
-- it (D-133); a minus never reaches Эфир or the wall (D-45). Grants are unchanged: create or replace
-- keeps them.

create or replace function confirm_voice_batch(
  payload jsonb,
  client_request_id uuid,
  p_now timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid       uuid := client_request_id;   -- the parameter shadows a column name
  v_company    uuid;
  v_user       uuid := auth.uid();
  v_result     jsonb;
  v_window     jsonb;
  v_from       time;
  v_to         time;
  v_local      timestamp;                   -- p_now seen from Asia/Aqtobe
  v_quiet      boolean;
  v_force      boolean := coalesce((payload->>'force_now')::boolean, false);
  v_window_at  timestamptz;                 -- next start of the delivery window
  v_entity     jsonb;
  v_kind       text;
  v_groups     jsonb := '{}'::jsonb;               -- entity group key -> generated uuid
  v_gkey       text;
  v_group      uuid;
  v_assignee   uuid;
  v_status     task_status;
  v_send_at    timestamptz;
  v_id         uuid;
  v_task_ids   uuid[] := '{}'::uuid[];
  v_ann_ids    uuid[] := '{}'::uuid[];
  v_rem_ids    uuid[] := '{}'::uuid[];
  v_rec_ids    uuid[] := '{}'::uuid[];
  v_note_ids   uuid[] := '{}'::uuid[];
  v_event_ids  uuid[] := '{}'::uuid[];
  v_starts     timestamptz;                 -- when the meeting begins
  v_pid        uuid;                        -- one participant of it
  v_point_ids  uuid[] := '{}'::uuid[];
  v_settings   jsonb;
  v_points_on  boolean;
  v_amount     int;
  v_skipped    jsonb := '[]'::jsonb;
  v_scheduled  boolean := false;
  v_inbox      uuid := nullif(payload->>'inbox_id', '')::uuid;
  v_note       uuid := nullif(payload->>'note_id', '')::uuid;   -- the note this batch came from
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  v_company := auth_company_id();

  -- 1. idempotency: a duplicate returns the stored result and creates nothing
  insert into ingest_batches (company_id, user_id, client_request_id, result)
  values (v_company, v_user, v_crid, '{}'::jsonb)
  on conflict on constraint ingest_batches_company_request_key do nothing;

  if not found then
    select b.result into v_result
      from ingest_batches b
     where b.company_id = v_company and b.client_request_id = v_crid;
    return coalesce(v_result, '{}'::jsonb) || jsonb_build_object('duplicate', true);
  end if;

  -- 2. quiet hours (D-38): outside the delivery window tasks wait for its start
  select c.settings into v_settings from companies c where c.id = v_company;
  v_window    := coalesce(v_settings->'delivery_window', '{"from":"08:00","to":"21:00"}'::jsonb);
  v_points_on := coalesce((v_settings->>'points_enabled')::boolean, false);

  v_from  := coalesce(v_window->>'from', '08:00')::time;
  v_to    := coalesce(v_window->>'to',   '21:00')::time;
  v_local := p_now at time zone 'Asia/Aqtobe';
  v_quiet := not (v_local::time >= v_from and v_local::time < v_to);

  if v_quiet then
    if v_local::time < v_from then
      v_window_at := (v_local::date + v_from) at time zone 'Asia/Aqtobe';
    else
      v_window_at := ((v_local::date + 1) + v_from) at time zone 'Asia/Aqtobe';
    end if;
  end if;

  -- 3. entities: only what the director confirmed on /confirm
  for v_entity in
    select value from jsonb_array_elements(coalesce(payload->'confirmed_entities', '[]'::jsonb))
  loop
    v_kind := v_entity->>'kind';

    if v_kind in ('task', 'delegation') then
      v_assignee := nullif(v_entity->>'assignee_id', '')::uuid;
      if v_assignee is null then
        raise exception 'assignee_required' using errcode = 'P0001';
      end if;

      -- one spoken phrase for several people = N copies sharing a group_id (D-02)
      v_group := null;
      v_gkey  := nullif(v_entity->>'group_id', '');
      if v_gkey is not null then
        if v_groups ? v_gkey then
          v_group := (v_groups->>v_gkey)::uuid;
        else
          v_group  := gen_random_uuid();
          v_groups := v_groups || jsonb_build_object(v_gkey, v_group::text);
        end if;
      end if;

      v_send_at := nullif(v_entity->>'scheduled_send_at', '')::timestamptz;
      if v_send_at is not null then
        v_status := 'scheduled';                       -- explicit "отправь утром"
      elsif v_quiet and not v_force then
        v_status  := 'scheduled';
        v_send_at := v_window_at;
      else
        v_status := 'sent';
      end if;
      v_scheduled := v_scheduled or v_status = 'scheduled';

      insert into tasks (
        company_id, author_id, assignee_id, group_id, title, body, deadline,
        priority, status, source, source_audio_path, source_transcript, scheduled_send_at
      ) values (
        v_company, v_user, v_assignee, v_group,
        v_entity->>'title',
        case when v_kind = 'delegation' then v_entity->>'note' else v_entity->>'body' end,
        nullif(v_entity->>'deadline_iso', '')::timestamptz,
        coalesce(nullif(v_entity->>'priority', '')::task_priority, 'normal'),
        v_status,
        nullif(payload->>'source', '')::ai_source,
        nullif(payload->>'audio_path', ''),
        nullif(payload->>'transcript', ''),
        v_send_at
      ) returning id into v_id;
      v_task_ids := v_task_ids || v_id;

    elsif v_kind = 'announcement' then
      insert into announcements (company_id, author_id, audio_path, transcript)
      values (v_company, v_user, nullif(payload->>'audio_path', ''), v_entity->>'text')
      returning id into v_id;
      v_ann_ids := v_ann_ids || v_id;

    elsif v_kind = 'reminder' then
      -- «напомни мне …» is a note with a time (D-95): the director sees it in «Заметки»,
      -- moves or drops it there, and notes_due_reminders sends it when the time comes
      insert into notes (company_id, user_id, text, raw_transcript, audio_path, inbox_item_id, remind_at)
      values (v_company, v_user, v_entity->>'text', payload->>'transcript',
              nullif(payload->>'audio_path', ''), v_inbox,
              nullif(v_entity->>'remind_at_iso', '')::timestamptz)
      returning id into v_id;
      v_rem_ids := v_rem_ids || v_id;

    elsif v_kind = 'event' then
      -- a meeting without a time is not a meeting: /confirm keeps such a card blocked
      v_starts := nullif(v_entity->>'starts_at_iso', '')::timestamptz;
      if v_starts is null then
        raise exception 'event_time_required' using errcode = 'P0001';
      end if;
      insert into events (company_id, author_id, title, body, location, starts_at, ends_at,
                          remind_before_min, everyone, audio_path, source_transcript, inbox_item_id)
      values (v_company, v_user, v_entity->>'title', v_entity->>'body', v_entity->>'location',
              v_starts, nullif(v_entity->>'ends_at_iso', '')::timestamptz,
              coalesce((v_entity->>'remind_before_min')::int, 30),
              coalesce((v_entity->>'everyone')::boolean, false),
              nullif(payload->>'audio_path', ''), nullif(payload->>'transcript', ''), v_inbox)
      returning id into v_id;
      v_event_ids := v_event_ids || v_id;
      -- the author is always in, and always going
      insert into event_participants (event_id, user_id, status, responded_at)
      values (v_id, v_user, 'going', p_now);
      if coalesce((v_entity->>'everyone')::boolean, false) then
        insert into event_participants (event_id, user_id)
        select v_id, p.id from profiles p
         where p.company_id = v_company and p.is_active and p.role <> 'tv' and p.id <> v_user
        on conflict do nothing;
      else
        for v_pid in
          select value::uuid from jsonb_array_elements_text(coalesce(v_entity->'participant_ids', '[]'::jsonb))
        loop
          -- somebody else's company or an inactive person is skipped silently (D-56: ids are the server's)
          insert into event_participants (event_id, user_id)
          select v_id, p.id from profiles p
           where p.id = v_pid and p.company_id = v_company and p.is_active and p.role <> 'tv' and p.id <> v_user
          on conflict do nothing;
        end loop;
      end if;

    elsif v_kind = 'note' then
      -- a thought of the director: no assignee, no deadline, nobody else ever reads it
      insert into notes (company_id, user_id, text, raw_transcript, audio_path, inbox_item_id)
      values (v_company, v_user, v_entity->>'text', payload->>'transcript',
              nullif(payload->>'audio_path', ''), v_inbox)
      returning id into v_id;
      v_note_ids := v_note_ids || v_id;

    elsif v_kind = 'recurrence' then
      v_assignee := nullif(v_entity->>'assignee_id', '')::uuid;
      if v_assignee is null then
        raise exception 'assignee_required' using errcode = 'P0001';
      end if;
      insert into recurrence_rules (
        company_id, author_id, assignee_id, title, body, priority, rrule, is_active, next_run_at
      ) values (
        v_company, v_user, v_assignee, v_entity->>'title', null, 'normal',
        v_entity->>'rrule', true, p_now
      ) returning id into v_id;
      v_rec_ids := v_rec_ids || v_id;

    elsif v_kind = 'points' then
      -- off by default for the pilot (G.22); the director switches them on in settings (D-48)
      v_assignee := nullif(v_entity->>'assignee_id', '')::uuid;
      v_amount   := nullif(v_entity->>'amount', '')::int;
      if not v_points_on then
        v_skipped := v_skipped || jsonb_build_object('kind', v_kind, 'reason', 'points_disabled');
      elsif v_assignee is null then
        raise exception 'assignee_required' using errcode = 'P0001';
      elsif v_amount is null or v_amount = 0 then
        -- nothing to award or take
        v_skipped := v_skipped || jsonb_build_object('kind', v_kind, 'reason', 'points_blocked');
      else
        -- a minus the director said is a minus (D-137, revises D-30); the person may dispute it (D-133)
        insert into point_transactions (company_id, user_id, amount, reason, source, actor_id)
        values (v_company, v_assignee, v_amount,
                coalesce(nullif(trim(v_entity->>'reason'), ''), case when v_amount < 0 then 'снял директор' else 'от директора' end),
                'manual', v_user)
        returning id into v_id;
        v_point_ids := v_point_ids || v_id;
      end if;

    elsif v_kind = 'query' then
      -- a question is answered by /api/voice/query, nothing is persisted here
      v_skipped := v_skipped || jsonb_build_object('kind', v_kind, 'reason', 'query_not_persisted');

    else
      v_skipped := v_skipped || jsonb_build_object('kind', v_kind, 'reason', 'unknown_kind');
    end if;
  end loop;

  -- 4. the edit ratio metric lands on the parse row of the same batch (D-35)
  update ai_logs l
     set confirmed_entities = payload->'confirmed_entities',
         was_edited         = (payload->>'was_edited')::boolean,
         edit_fields        = case
                                when payload ? 'edit_fields'
                                then (select array_agg(x)
                                        from jsonb_array_elements_text(payload->'edit_fields') x)
                              end
   where l.company_id = v_company
     and l.client_request_id = v_crid
     and l.kind = 'parse';

  if v_inbox is not null then
    update inbox_items i set status = 'confirmed'
     where i.id = v_inbox and i.company_id = v_company;
  end if;

  -- the note this batch was started from becomes 'converted' (D-75 §5); somebody
  -- else's note and a deleted one are silently left alone
  if v_note is not null then
    update notes n
       set converted_task_id         = coalesce(v_task_ids[1], n.converted_task_id),
           converted_announcement_id = coalesce(v_ann_ids[1], n.converted_announcement_id),
           converted_at              = p_now
     where n.id = v_note and n.user_id = v_user and n.deleted_at is null;
  end if;

  v_result := jsonb_build_object(
    'task_ids',        to_jsonb(v_task_ids),
    'announcement_ids', to_jsonb(v_ann_ids),
    'reminder_ids',    to_jsonb(v_rem_ids),
    'recurrence_ids',  to_jsonb(v_rec_ids),
    'note_ids',        to_jsonb(v_note_ids),
    'event_ids',       to_jsonb(v_event_ids),
    'point_ids',       to_jsonb(v_point_ids),
    'skipped',         v_skipped,
    'scheduled',       v_scheduled
  );

  update ingest_batches b set result = v_result
   where b.company_id = v_company and b.client_request_id = v_crid;

  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;
