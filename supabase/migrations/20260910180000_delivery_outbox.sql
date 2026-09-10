-- Delivery subsystem, tier 1 (docs/BACKEND.md §4, docs/DATABASE.md): the outbox and
-- the push subscriptions. Triggers INSERT queued rows and never call HTTP; a worker
-- (API sweep now, Edge Function later — the table is the contract) sends them.

-- ---------------------------------------------------------------------------
-- push_subscriptions: one row per browser the person allowed notifications in
-- ---------------------------------------------------------------------------
create table push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies,
  user_id    uuid not null references profiles on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

create policy push_subscriptions_select on push_subscriptions for select using (
  company_id = auth_company_id() and (user_id = auth.uid() or auth_role() = 'director')
);
create policy push_subscriptions_insert on push_subscriptions for insert with check (
  company_id = auth_company_id() and user_id = auth.uid()
);
create policy push_subscriptions_delete on push_subscriptions for delete using (
  company_id = auth_company_id() and user_id = auth.uid()
);

-- ---------------------------------------------------------------------------
-- notification_deliveries: the outbox with receipts
-- ---------------------------------------------------------------------------
create table notification_deliveries (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies,
  user_id    uuid not null references profiles on delete cascade,
  task_id    uuid references tasks on delete cascade,
  event_kind text not null,                      -- task_sent | question | pending_review | declined | announcement
  channel    delivery_channel not null default 'push',
  status     delivery_status not null default 'queued',
  tier       int not null default 1,
  attempts   int not null default 0,
  last_error text,
  meta       jsonb not null default '{}',        -- {title, body, url} rendered by the trigger
  created_at timestamptz not null default now(),
  sent_at    timestamptz,
  seen_at    timestamptz,
  acted_at   timestamptz
);
create index notification_deliveries_queued_idx on notification_deliveries (status, created_at) where status = 'queued';
create index notification_deliveries_task_idx on notification_deliveries (task_id, event_kind);
create index notification_deliveries_user_idx on notification_deliveries (user_id, status);

comment on column notification_deliveries.seen_at is 'D-32: the notification was shown or the app was opened — never "delivered"';

alter table notification_deliveries enable row level security;

-- the director reads receipts; a person reads their own rows; writes — service role only
create policy notification_deliveries_select on notification_deliveries for select using (
  company_id = auth_company_id() and (user_id = auth.uid() or auth_role() = 'director')
);

-- ---------------------------------------------------------------------------
-- trg_notify_outbox: one queued push per event, text rendered here once
-- ---------------------------------------------------------------------------
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

  return new;
end
$fn$;

create trigger trg_notify_outbox_tasks
after insert or update of status on tasks
for each row execute function notify_outbox_task();

create or replace function notify_outbox_question() returns trigger
language plpgsql security definer set search_path = public
as $fn$
declare
  v_task tasks%rowtype;
begin
  if coalesce(new.meta->>'is_question', 'false') <> 'true' then
    return new;
  end if;
  select * into v_task from tasks where id = new.task_id;
  if v_task.id is null or v_task.author_id = new.sender_id then
    return new;
  end if;
  insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta)
  values (new.company_id, v_task.author_id, v_task.id, 'question',
          jsonb_build_object('title', 'Вопрос по задаче', 'body', left(coalesce(new.content, v_task.title), 120), 'url', '/tasks/' || v_task.id));
  return new;
end
$fn$;

create trigger trg_notify_outbox_questions
after insert on task_messages
for each row execute function notify_outbox_question();

create or replace function notify_outbox_announcement() returns trigger
language plpgsql security definer set search_path = public
as $fn$
begin
  insert into notification_deliveries (company_id, user_id, event_kind, meta)
  select new.company_id, p.id, 'announcement',
         jsonb_build_object('title', 'Объявление', 'body', left(new.transcript, 120), 'url', '/ether')
    from profiles p
   where p.company_id = new.company_id
     and p.is_active
     and p.role <> 'tv'
     and p.id <> new.author_id;
  return new;
end
$fn$;

create trigger trg_notify_outbox_announcements
after insert on announcements
for each row execute function notify_outbox_announcement();

-- receipts change live on the director's card
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notification_deliveries'
  ) then
    alter publication supabase_realtime add table notification_deliveries;
  end if;
end
$$;
