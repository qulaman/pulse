-- Points and settings (owner decision D-48, 2026-09-10): the recognition page and the
-- rating arrive before the pilot but stay behind company.settings.points_enabled
-- (default off, D-40(в)). Plus the director's settings RPC for STT / parser / vocabulary.

-- ---------------------------------------------------------------------------
-- point_transactions -- append-only; balance = SUM(amount), never a column
-- ---------------------------------------------------------------------------
create table point_transactions (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies,
  user_id    uuid not null references profiles,
  amount     int  not null check (amount <> 0),
  reason     text not null check (length(trim(reason)) > 0),
  source     point_source not null,
  rule_code  text,
  task_id    uuid references tasks,
  order_id   uuid,
  actor_id   uuid references profiles,
  created_at timestamptz not null default now()
);

comment on table point_transactions is 'Append-only. Balance = SUM(amount). Shop hold is final (D-10).';

create unique index point_transactions_auto_rule_key
  on point_transactions (task_id, rule_code) where source = 'auto_rule';
create unique index point_transactions_order_source_key
  on point_transactions (order_id, source) where order_id is not null;
create index point_transactions_company_user_created_idx
  on point_transactions (company_id, user_id, created_at);

alter table point_transactions enable row level security;

create policy point_transactions_select on point_transactions for select using (
  company_id = auth_company_id()
  and (user_id = auth.uid() or auth_role() = 'director')
);

-- manual awards go through award_points(); auto/shop rows are written by definer functions
-- (no insert/update/delete policies)

-- ---------------------------------------------------------------------------
-- award_points -- the director's manual +/- (D-30: taking away needs a reason)
-- ---------------------------------------------------------------------------
create or replace function award_points(
  p_user_id uuid,
  p_amount int,
  p_reason text,
  client_request_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_crid    uuid := client_request_id;
  v_company uuid := auth_company_id();
  v_user    uuid := auth.uid();
  v_result  jsonb;
  v_id      uuid;
  v_balance int;
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if p_amount = 0 or p_amount is null then
    raise exception 'amount_required' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  if not exists (select 1 from profiles p where p.id = p_user_id and p.company_id = v_company and p.is_active) then
    raise exception 'user_not_found' using errcode = 'P0001';
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

  insert into point_transactions (company_id, user_id, amount, reason, source, actor_id)
  values (v_company, p_user_id, p_amount, trim(p_reason), 'manual', v_user)
  returning id into v_id;

  select coalesce(sum(amount), 0) into v_balance
    from point_transactions where company_id = v_company and user_id = p_user_id;

  v_result := jsonb_build_object('id', v_id, 'balance', v_balance);
  if v_crid is not null then
    update ingest_batches b set result = v_result
     where b.company_id = v_company and b.client_request_id = v_crid;
  end if;
  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;

-- ---------------------------------------------------------------------------
-- fn_rating -- points per person in a period, rating_mode from settings (D-11, D-29)
-- ---------------------------------------------------------------------------
create or replace function fn_rating(p_from timestamptz, p_to timestamptz)
returns table (
  user_id uuid, display_name text, points int, rank int, delta_vs_prev int,
  on_time_pct numeric, is_me boolean
)
language plpgsql security definer set search_path = public
as $fn$
declare
  v_company uuid := auth_company_id();
  v_user    uuid := auth.uid();
  v_mode    text;
  v_span    interval := p_to - p_from;
begin
  if v_company is null then
    return;
  end if;
  select coalesce(c.settings->>'rating_mode', 'top5') into v_mode from companies c where c.id = v_company;

  return query
  with people as (
    select p.id, p.full_name
      from profiles p
     where p.company_id = v_company and p.is_active
       and p.role in ('employee', 'manager', 'shopkeeper')
  ),
  cur as (
    select t.user_id, sum(t.amount)::int as pts
      from point_transactions t
     where t.company_id = v_company and t.created_at >= p_from and t.created_at < p_to
     group by t.user_id
  ),
  prev as (
    select t.user_id, sum(t.amount)::int as pts
      from point_transactions t
     where t.company_id = v_company and t.created_at >= p_from - v_span and t.created_at < p_from
     group by t.user_id
  ),
  done as (
    select k.assignee_id,
           count(*) filter (where k.deadline is null or k.closed_at <= k.deadline)::numeric as on_time,
           count(*)::numeric as total
      from tasks k
     where k.company_id = v_company and k.status = 'done'
       and k.closed_at >= p_from and k.closed_at < p_to
     group by k.assignee_id
  ),
  ranked as (
    select pe.id as uid, pe.full_name as name,
           coalesce(cur.pts, 0) as pts,
           coalesce(cur.pts, 0) - coalesce(prev.pts, 0) as delta,
           case when done.total > 0 then round(100 * done.on_time / done.total, 0) else null end as otp,
           dense_rank() over (order by coalesce(cur.pts, 0) desc, pe.full_name) as rnk
      from people pe
      left join cur  on cur.user_id = pe.id
      left join prev on prev.user_id = pe.id
      left join done on done.assignee_id = pe.id
  )
  select r.uid, r.name, r.pts, r.rnk::int, r.delta, r.otp, r.uid = v_user
    from ranked r
   where v_mode = 'full' or auth_role() = 'director' or r.rnk <= 5 or r.uid = v_user
   order by r.rnk, r.name;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- update_company_settings -- the director edits settings from the app (V-02: config, not code)
-- ---------------------------------------------------------------------------
create or replace function update_company_settings(patch jsonb) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_company  uuid := auth_company_id();
  v_settings jsonb;
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  update companies c set settings = c.settings || coalesce(patch, '{}'::jsonb)
   where c.id = v_company
  returning c.settings into v_settings;
  return coalesce(v_settings, '{}'::jsonb);
end;
$fn$;

revoke execute on function award_points(uuid, int, text, uuid) from public, anon;
revoke execute on function fn_rating(timestamptz, timestamptz) from public, anon;
revoke execute on function update_company_settings(jsonb) from public, anon;
grant execute on function award_points(uuid, int, text, uuid) to authenticated, service_role;
grant execute on function fn_rating(timestamptz, timestamptz) to authenticated, service_role;
grant execute on function update_company_settings(jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- confirm_voice_batch -- now persists points when settings.points_enabled (D-48)
-- ---------------------------------------------------------------------------
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
  v_point_ids  uuid[] := '{}'::uuid[];
  v_settings   jsonb;
  v_points_on  boolean;
  v_amount     int;
  v_skipped    jsonb := '[]'::jsonb;
  v_scheduled  boolean := false;
  v_inbox      uuid := nullif(payload->>'inbox_id', '')::uuid;
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
      insert into reminders (company_id, user_id, text, remind_at)
      values (v_company, v_user, v_entity->>'text',
              nullif(v_entity->>'remind_at_iso', '')::timestamptz)
      returning id into v_id;
      v_rem_ids := v_rem_ids || v_id;

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
      elsif v_amount is null or v_amount <= 0 then
        -- taking points away by voice is forbidden (D-30)
        v_skipped := v_skipped || jsonb_build_object('kind', v_kind, 'reason', 'points_blocked');
      else
        insert into point_transactions (company_id, user_id, amount, reason, source, actor_id)
        values (v_company, v_assignee, v_amount,
                coalesce(nullif(v_entity->>'reason', ''), 'от директора'), 'manual', v_user)
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

  v_result := jsonb_build_object(
    'task_ids',        to_jsonb(v_task_ids),
    'announcement_ids', to_jsonb(v_ann_ids),
    'reminder_ids',    to_jsonb(v_rem_ids),
    'recurrence_ids',  to_jsonb(v_rec_ids),
    'point_ids',       to_jsonb(v_point_ids),
    'skipped',         v_skipped,
    'scheduled',       v_scheduled
  );

  update ingest_batches b set result = v_result
   where b.company_id = v_company and b.client_request_id = v_crid;

  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;
