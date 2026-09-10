-- Эфир goes live: announcements and their acks join the realtime publication
-- (same replayable guard as 20260910120000).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'announcements'
  ) then
    alter publication supabase_realtime add table announcements;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'announcement_acks'
  ) then
    alter publication supabase_realtime add table announcement_acks;
  end if;
end
$$;
