-- Messages, four fixes around the read cursor (D-61, наряд 011E):
--   1. task_reads.last_seq becomes bigint — task_messages.seq is a bigserial, an int
--      cursor would silently clamp on a long-lived company thread.
--   2. mark_thread_read() is the only way the cursor moves: monotonic (greatest), so an
--      offline replay of an older «Прочитал» can no longer drag it backwards.
--   3. Two indexes for the reads the board does on every fetch: the thread's last word
--      (task_id, seq desc) and the question / decline notes it embeds per task.
--   4. The task_messages and task_reads policies re-created with (select auth.uid()) —
--      the initplan is evaluated once per statement instead of once per row. Same bodies.

-- 1 ---------------------------------------------------------------------------
alter table task_reads alter column last_seq type bigint;

-- 2 ---------------------------------------------------------------------------
-- The caller's own cursor only (auth.uid()), and only on a task of their company —
-- security definer writes past the row policies, so the visibility check is explicit.
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

  return v_seq;
end
$fn$;

comment on function mark_thread_read(uuid, bigint) is
  'Moves the caller''s read cursor on a task thread forward only (D-61); returns the cursor after the write.';

revoke execute on function mark_thread_read(uuid, bigint) from public, anon;
grant execute on function mark_thread_read(uuid, bigint) to authenticated, service_role;

-- 3 ---------------------------------------------------------------------------
-- the last word of a thread, one row per task, on every board fetch
create index if not exists task_messages_task_seq_idx on task_messages (task_id, seq desc);
-- the notes the board embeds: open questions and decline reasons, newest first
create index if not exists task_messages_board_notes_idx on task_messages (task_id, created_at desc)
  where meta->>'is_question' = 'true' or meta->>'decline_reason' = 'true';

-- 4 ---------------------------------------------------------------------------
drop policy task_messages_select on task_messages;
create policy task_messages_select on task_messages for select using (
  exists (
    select 1 from tasks t
    where t.id = task_messages.task_id
      and t.company_id = (select auth_company_id())
      and ( t.assignee_id = (select auth.uid()) or t.author_id = (select auth.uid())
            or (select auth_role()) = 'director'
            or ((select auth_role()) = 'manager' and t.assignee_id in (select subordinates((select auth.uid())))) )
  )
);

drop policy task_messages_insert on task_messages;
create policy task_messages_insert on task_messages for insert with check (
  sender_id = (select auth.uid())
  and company_id = (select auth_company_id())
  and exists (
    select 1 from tasks t
    where t.id = task_messages.task_id
      and t.company_id = (select auth_company_id())
      and ( t.assignee_id = (select auth.uid()) or t.author_id = (select auth.uid())
            or (select auth_role()) = 'director'
            or ((select auth_role()) = 'manager' and t.assignee_id in (select subordinates((select auth.uid())))) )
  )
);

-- the client writes through mark_thread_read() now; the policies stay — harmless, and
-- they keep a direct read/write of one's own cursor possible
drop policy task_reads_select on task_reads;
create policy task_reads_select on task_reads for select using (user_id = (select auth.uid()));

drop policy task_reads_insert on task_reads;
create policy task_reads_insert on task_reads for insert with check (
  user_id = (select auth.uid()) and company_id = (select auth_company_id())
);

drop policy task_reads_update on task_reads;
create policy task_reads_update on task_reads for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and company_id = (select auth_company_id()));
