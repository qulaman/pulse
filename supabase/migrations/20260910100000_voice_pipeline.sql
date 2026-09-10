-- Voice pipeline persistence: ingest_batches, ai_logs, inbox_items, announcements,
-- reminders, recurrence_rules, the `voice` Storage bucket and confirm_voice_batch().
-- Contract: docs/DATABASE.md (tables, RLS matrix, indexes, Storage) + docs/BACKEND.md section 2.

-- ---------------------------------------------------------------------------
-- ingest_batches -- idempotency register of every mutating call (G.3)
-- ---------------------------------------------------------------------------
create table ingest_batches (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies,
  user_id           uuid not null references profiles,
  client_request_id uuid not null,
  result            jsonb not null default '{}',
  created_at        timestamptz not null default now(),
  constraint ingest_batches_company_request_key unique (company_id, client_request_id)
);

comment on table ingest_batches is 'A duplicate call returns the stored result and creates nothing (docs/BACKEND.md section 0.2)';

-- ---------------------------------------------------------------------------
-- ai_logs -- one row per AI call; confirm writes the parsed<->confirmed diff
-- ---------------------------------------------------------------------------
create table ai_logs (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies,
  user_id            uuid not null references profiles,
  kind               ai_log_kind not null,
  source             ai_source,
  provider           text not null,
  model              text not null,
  transcript         text,
  raw_response       jsonb,
  parsed_entities    jsonb,
  confirmed_entities jsonb,
  was_edited         boolean,
  edit_fields        text[],
  tool_calls         jsonb,
  input_tokens       int,
  output_tokens      int,
  cache_read_tokens  int,
  stt_ms             int,
  parse_ms           int,
  latency_ms         int,
  status             text not null,          -- 'ok' | 'error:<code>'
  client_request_id  uuid,
  request_id         text,
  created_at         timestamptz not null default now()
);

comment on column ai_logs.was_edited is 'edit ratio metric (D-35): filled by /api/voice/confirm on the parse row';

-- ---------------------------------------------------------------------------
-- inbox_items -- staging of the voice pipeline (G.11)
-- ---------------------------------------------------------------------------
create table inbox_items (
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references companies,
  user_id           uuid not null references profiles,
  status            inbox_status not null default 'recorded',
  audio_path        text,
  transcript        text,
  entities          jsonb,
  client_request_id uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table inbox_items is 'recorded -> transcribed -> parsed -> confirmed | discarded; a failed stage leaves the item where it was';

create trigger trg_inbox_items_updated_at
  before update on inbox_items
  for each row execute function moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- announcements + acks
-- ---------------------------------------------------------------------------
create table announcements (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies,
  author_id  uuid not null references profiles,
  audio_path text,
  transcript text not null,
  created_at timestamptz not null default now()
);

create table announcement_acks (
  announcement_id uuid not null references announcements on delete cascade,
  user_id         uuid not null references profiles,
  created_at      timestamptz not null default now(),
  primary key (announcement_id, user_id)
);

-- ---------------------------------------------------------------------------
-- recurrence_rules + reminders
-- ---------------------------------------------------------------------------
create table recurrence_rules (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies,
  author_id   uuid not null references profiles,
  assignee_id uuid not null references profiles,
  title       text not null,
  body        text,
  priority    task_priority not null default 'normal',
  rrule       text not null,
  is_active   boolean not null default true,
  next_run_at timestamptz
);

comment on column recurrence_rules.rrule is 'RFC 5545 RRULE; cron recurrence_spawn moves next_run_at inside its own transaction';

create table reminders (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies,
  user_id    uuid not null references profiles,
  text       text not null,
  remind_at  timestamptz,
  sent       boolean not null default false,
  created_at timestamptz not null default now()
);

-- tasks.recurrence_rule_id was declared without its fk (the table did not exist yet)
alter table tasks
  add constraint tasks_recurrence_rule_fk
  foreign key (recurrence_rule_id) references recurrence_rules;

-- ---------------------------------------------------------------------------
-- Indexes (docs/DATABASE.md "Индексы")
-- ---------------------------------------------------------------------------
create index ai_logs_company_created_idx on ai_logs (company_id, created_at);
-- confirm finds the parse row of the batch by this one
create index ai_logs_company_request_kind_idx on ai_logs (company_id, client_request_id, kind);
create index announcements_company_created_idx on announcements (company_id, created_at desc);
create index recurrence_rules_next_run_idx on recurrence_rules (next_run_at) where is_active;
create index reminders_remind_at_idx on reminders (remind_at) where not sent;
create index inbox_items_company_user_idx on inbox_items (company_id, user_id);

-- ---------------------------------------------------------------------------
-- RLS (docs/DATABASE.md matrix)
-- ---------------------------------------------------------------------------
alter table ingest_batches enable row level security;

-- select: director only; insert/update: no policies -- service role and security definer
create policy ingest_batches_select on ingest_batches for select using (
  company_id = auth_company_id() and auth_role() = 'director'
);

alter table ai_logs enable row level security;

create policy ai_logs_select on ai_logs for select using (
  company_id = auth_company_id() and auth_role() = 'director'
);

alter table inbox_items enable row level security;

-- select: director or the author of the draft
create policy inbox_items_select on inbox_items for select using (
  company_id = auth_company_id()
  and (user_id = auth.uid() or auth_role() = 'director')
);

create policy inbox_items_insert on inbox_items for insert with check (
  company_id = auth_company_id() and user_id = auth.uid()
);

-- the author edits his own draft until it is confirmed
create policy inbox_items_update on inbox_items for update
using (
  company_id = auth_company_id() and user_id = auth.uid() and status <> 'confirmed'
)
with check (
  company_id = auth_company_id() and user_id = auth.uid()
);

alter table announcements enable row level security;

create policy announcements_select on announcements for select using (
  company_id = auth_company_id() and auth_role() <> 'tv'
);

create policy announcements_insert on announcements for insert with check (
  company_id = auth_company_id() and author_id = auth.uid() and auth_role() = 'director'
);

alter table announcement_acks enable row level security;

create policy announcement_acks_select on announcement_acks for select using (
  auth_role() <> 'tv'
  and exists (
    select 1 from announcements a
    where a.id = announcement_acks.announcement_id and a.company_id = auth_company_id()
  )
);

create policy announcement_acks_insert on announcement_acks for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from announcements a
    where a.id = announcement_acks.announcement_id and a.company_id = auth_company_id()
  )
);

alter table reminders enable row level security;

-- own reminders only; written by confirm_voice_batch, sent by cron
create policy reminders_select on reminders for select using (
  company_id = auth_company_id() and user_id = auth.uid()
);

alter table recurrence_rules enable row level security;

create policy recurrence_rules_select on recurrence_rules for select using (
  company_id = auth_company_id() and auth_role() <> 'tv'
);

create policy recurrence_rules_insert on recurrence_rules for insert with check (
  company_id = auth_company_id() and auth_role() = 'director' and author_id = auth.uid()
);

create policy recurrence_rules_update on recurrence_rules for update
using (company_id = auth_company_id() and auth_role() = 'director')
with check (company_id = auth_company_id() and auth_role() = 'director');

create policy recurrence_rules_delete on recurrence_rules for delete using (
  company_id = auth_company_id() and auth_role() = 'director'
);

-- ---------------------------------------------------------------------------
-- Storage: private bucket `voice`, path {company_id}/{owner_id}/{uuid}.ext.
-- Reading somebody else's audio (the director listens to a task message) is a
-- server-issued signed URL, never a policy (docs/DATABASE.md "Storage", D-18).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('voice', 'voice', false)
on conflict do nothing;

create policy voice_insert_own on storage.objects for insert to authenticated
with check (
  bucket_id = 'voice'
  and (storage.foldername(name))[1] = public.auth_company_id()::text
  and (storage.foldername(name))[2] = auth.uid()::text
);

create policy voice_select_own on storage.objects for select to authenticated
using (
  bucket_id = 'voice'
  and (storage.foldername(name))[1] = public.auth_company_id()::text
  and (storage.foldername(name))[2] = auth.uid()::text
);

-- update/delete: no policies (audio is immutable; retention is cron's job)

-- ---------------------------------------------------------------------------
-- confirm_voice_batch -- the single atomic write of the voice pipeline
-- (docs/BACKEND.md section 2 "POST /api/voice/confirm", D-38 quiet hours,
--  D-02 multi-assignee copies, G.22 points are off during the pilot).
-- p_now is injectable so the quiet-hours branch is testable.
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
  select coalesce(c.settings->'delivery_window', '{"from":"08:00","to":"21:00"}'::jsonb)
    into v_window
    from companies c where c.id = v_company;

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
      -- points are switched off for the pilot (G.22)
      v_skipped := v_skipped || jsonb_build_object('kind', v_kind, 'reason', 'points_disabled');

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
    'skipped',         v_skipped,
    'scheduled',       v_scheduled
  );

  update ingest_batches b set result = v_result
   where b.company_id = v_company and b.client_request_id = v_crid;

  return v_result || jsonb_build_object('duplicate', false);
end;
$fn$;
