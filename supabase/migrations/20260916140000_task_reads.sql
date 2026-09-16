-- Read cursors on task threads (D-61). A thread is a chat: the employee reports, asks,
-- attaches a photo; the director answers. What the director has not seen yet is the
-- «Сообщения» of Пульс — and «seen» needs a cursor per person per task, not a flag on
-- the message (messages are append-only and shared). One row per (task, user): the
-- highest seq the person has seen. Written by the person only; read by the person only.

create table task_reads (
  task_id    uuid not null references tasks on delete cascade,
  user_id    uuid not null references profiles on delete cascade,
  company_id uuid not null references companies,
  last_seq   int  not null default 0,
  seen_at    timestamptz not null default now(),
  primary key (task_id, user_id)
);

comment on table task_reads is 'Per-person read cursor on a task thread: messages with seq > last_seq are unread for that person (D-61).';

alter table task_reads enable row level security;

create policy task_reads_select on task_reads for select using (user_id = auth.uid());
create policy task_reads_insert on task_reads for insert with check (user_id = auth.uid() and company_id = auth_company_id());
create policy task_reads_update on task_reads for update using (user_id = auth.uid()) with check (user_id = auth.uid() and company_id = auth_company_id());
