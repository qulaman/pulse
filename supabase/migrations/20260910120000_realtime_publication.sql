-- Realtime: tasks and task_messages must sit in the supabase_realtime publication
-- before postgres_changes emits anything for them. RLS still applies to the
-- events themselves, so a subscriber only ever receives rows it may select.
--
-- `alter publication ... add table` raises if the table is already a member, and
-- a fresh Supabase project may already have added it — the guard keeps the
-- migration replayable across the whole client fleet (V-02).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'tasks'
  ) then
    alter publication supabase_realtime add table tasks;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_messages'
  ) then
    alter publication supabase_realtime add table task_messages;
  end if;
end
$$;
