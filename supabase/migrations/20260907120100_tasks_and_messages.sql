-- Tasks and task messages: tables, indexes, status machine triggers, RLS.

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table tasks (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies,
  author_id          uuid not null references profiles,
  assignee_id        uuid not null references profiles,
  parent_task_id     uuid references tasks,
  group_id           uuid,                  -- multi-assignee: N copies share it (D-02)
  title              text not null,
  body               text,
  deadline           timestamptz,           -- null = no deadline, never invented
  priority           task_priority not null default 'normal',
  status             task_status not null default 'sent',
  source             ai_source,
  source_audio_path  text,
  source_transcript  text,
  scheduled_send_at  timestamptz,           -- only meaningful while status='scheduled'
  recurrence_rule_id uuid,                  -- fk added together with recurrence_rules
  accepted_at        timestamptz,
  completed_at       timestamptz,
  closed_at          timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table tasks is 'Overdue is computed, never stored: deadline < now() and status in (sent, accepted, in_progress, rework)';

create trigger trg_tasks_updated_at
  before update on tasks
  for each row execute function moddatetime(updated_at);

-- ---------------------------------------------------------------------------
-- task_messages -- the event backbone; feeds, Pulse and TV read from here
-- ---------------------------------------------------------------------------
create table task_messages (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies,
  task_id    uuid not null references tasks on delete cascade,
  sender_id  uuid not null references profiles,
  seq        bigserial,                     -- monotonic cursor: where seq > :last_seq
  type       message_type not null,
  content    text,
  file_path  text,
  meta       jsonb not null default '{}',
  created_at timestamptz not null default now()
);

comment on column task_messages.meta is 'status_change -> {old_status,new_status}; question -> {is_question:true, answered_at}';

-- ---------------------------------------------------------------------------
-- Indexes (docs/DATABASE.md)
-- ---------------------------------------------------------------------------
create index tasks_company_assignee_status_idx on tasks (company_id, assignee_id, status);
create index tasks_company_deadline_idx on tasks (company_id, deadline)
  where status in ('sent','accepted','in_progress','rework');
create index tasks_company_pending_review_idx on tasks (company_id, status)
  where status = 'pending_review';
create index tasks_group_id_idx on tasks (group_id);
create index task_messages_task_created_idx on task_messages (task_id, created_at);
create index task_messages_company_seq_idx on task_messages (company_id, seq desc);

-- ---------------------------------------------------------------------------
-- Trigger 1: status transition matrix (docs/BACKEND.md section 7).
-- auth.uid() is null means service role / cron: the role is not checked, the
-- matrix still is.
-- ---------------------------------------------------------------------------
create or replace function task_status_guard() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  uid   uuid    := auth.uid();
  urole text    := auth_role();
  ok    boolean := false;
begin
  if new.status = old.status then
    return new;
  end if;

  if old.status = 'scheduled' and new.status = 'sent' then
    ok := uid is null;                                     -- cron scheduled-send only
  elsif old.status = 'sent' and new.status = 'accepted' then
    ok := uid is null or uid = old.assignee_id;
  elsif old.status in ('sent','accepted') and new.status = 'declined' then
    ok := uid is null or uid = old.assignee_id;
  elsif old.status = 'accepted' and new.status = 'pending_review' then
    ok := uid is null or uid = old.assignee_id;
  elsif old.status = 'pending_review' and new.status in ('done','rework') then
    ok := uid is null or urole = 'director';
  elsif old.status = 'rework' and new.status = 'accepted' then
    ok := uid is null or uid = old.assignee_id;
  elsif new.status = 'revoked' and old.status not in ('done','declined','revoked') then
    ok := uid is null or urole = 'director';
  end if;

  if not ok then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  if new.status = 'accepted' and new.accepted_at is null then
    new.accepted_at := now();
  end if;
  if new.status = 'pending_review' then
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  if new.status in ('done','declined','revoked') then
    new.closed_at := coalesce(new.closed_at, now());
  end if;

  return new;
end;
$fn$;

create trigger trg_task_status_guard
  before update of status on tasks
  for each row execute function task_status_guard();

-- ---------------------------------------------------------------------------
-- Trigger 2: every status change leaves a row in task_messages.
-- security definer: the row is written on behalf of the system, and cron has no uid.
-- ---------------------------------------------------------------------------
create or replace function task_status_message() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  if new.status = old.status then
    return null;
  end if;

  insert into task_messages (company_id, task_id, sender_id, type, meta)
  values (
    new.company_id,
    new.id,
    coalesce(auth.uid(), new.author_id),
    'status_change',
    jsonb_build_object('old_status', old.status::text, 'new_status', new.status::text)
  );

  return null;
end;
$fn$;

create trigger trg_task_status_message
  after update of status on tasks
  for each row execute function task_status_message();

-- ---------------------------------------------------------------------------
-- Trigger 3: the first non-question message from the task author (director)
-- closes every open question of that task (G.7).
-- security definer: task_messages is append-only, there is no update policy.
-- ---------------------------------------------------------------------------
create or replace function task_question_answered() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  if coalesce((new.meta->>'is_question')::boolean, false) then
    return null;
  end if;

  if not exists (
    select 1 from tasks t
    where t.id = new.task_id and t.author_id = new.sender_id
  ) then
    return null;
  end if;

  update task_messages m
     set meta = m.meta || jsonb_build_object('answered_at', to_jsonb(now()))
   where m.task_id = new.task_id
     and coalesce((m.meta->>'is_question')::boolean, false)
     and m.meta->>'answered_at' is null;

  return null;
end;
$fn$;

create trigger trg_question_answered
  after insert on task_messages
  for each row execute function task_question_answered();

-- ---------------------------------------------------------------------------
-- RLS: tasks
-- ---------------------------------------------------------------------------
alter table tasks enable row level security;

create policy tasks_select on tasks for select using (
  company_id = auth_company_id()
  and (status <> 'scheduled' or author_id = auth.uid())   -- scheduled: author only
  and ( assignee_id = auth.uid() or author_id = auth.uid()
        or auth_role() = 'director'
        or (auth_role() = 'manager' and assignee_id in (select subordinates(auth.uid()))) )
);

create policy tasks_insert on tasks for insert with check (
  company_id = auth_company_id() and author_id = auth.uid()
  and auth_role() in ('director','manager')
);

-- update: same visibility as select; legal transitions are trigger 1's job
create policy tasks_update on tasks for update
using (
  company_id = auth_company_id()
  and (status <> 'scheduled' or author_id = auth.uid())
  and ( assignee_id = auth.uid() or author_id = auth.uid()
        or auth_role() = 'director'
        or (auth_role() = 'manager' and assignee_id in (select subordinates(auth.uid()))) )
)
with check (company_id = auth_company_id());

-- delete: director only, and only while the task has not been sent yet
create policy tasks_delete on tasks for delete using (
  company_id = auth_company_id() and auth_role() = 'director' and status = 'scheduled'
);

-- ---------------------------------------------------------------------------
-- RLS: task_messages -- participants of the task; append-only
-- ---------------------------------------------------------------------------
alter table task_messages enable row level security;

create policy task_messages_select on task_messages for select using (
  exists (
    select 1 from tasks t
    where t.id = task_messages.task_id
      and t.company_id = auth_company_id()
      and ( t.assignee_id = auth.uid() or t.author_id = auth.uid()
            or auth_role() = 'director'
            or (auth_role() = 'manager' and t.assignee_id in (select subordinates(auth.uid()))) )
  )
);

create policy task_messages_insert on task_messages for insert with check (
  sender_id = auth.uid()
  and company_id = auth_company_id()
  and exists (
    select 1 from tasks t
    where t.id = task_messages.task_id
      and t.company_id = auth_company_id()
      and ( t.assignee_id = auth.uid() or t.author_id = auth.uid()
            or auth_role() = 'director'
            or (auth_role() = 'manager' and t.assignee_id in (select subordinates(auth.uid()))) )
  )
);

-- update/delete: no policies (append-only; answered_at is set by trigger 3)
