-- tasks/027 (D-155 §3, D-18): a voice recording is kept `closed_days` (90 by default) after what it
-- belongs to is closed, and `orphan_days` (30) when nothing came of it; transcripts and texts stay
-- for good; a recording marked «в корпус» is never removed. The sweep step (/api/push/sweep,
-- lib/voice/retention.ts) asks voice_purge_due which files are due, removes them through the
-- Storage API (never by SQL from storage.objects) and then clears the paths with voice_mark_purged.
--
-- Where a recording stands, and from when that row counts as closed:
--   tasks.source_audio_path              done / revoked — closed_at (the status guard stamps it on
--                                        both); any other status, declined included, is open
--   task_messages.file_path, type voice  with its task (the thread's voice messages, D-66)
--   announcements.audio_path             created_at (out means closed)
--   events.audio_path                    coalesce(ends_at, starts_at), once that moment has passed
--   notes.audio_path                     never while the row lives (the trash purge drops the row)
--   errands.audio_path                   done / declined / cancelled — coalesce(done_at, updated_at)
--   recurrence_rules.source_audio_path   a stopped rule — updated_at; an active one is open
--   inbox_items.audio_path only, or none a recording nothing came of: orphan_days from the upload
-- A file several rows stand behind goes only when all of them are closed, counting from the latest.
-- Field guards let the service role through: tasks_field_guard returns at auth.uid() is null,
-- recurrence_rules_schedule guards only for auth.uid() is not null, the other tables have none.

-- ---------------------------------------------------------------------------
-- 1. The company's term in days — the same keys and defaults as lib/settings.ts
-- ---------------------------------------------------------------------------
create or replace function voice_retention_days(p_settings jsonb, p_key text, p_default int) returns int
language plpgsql immutable set search_path = public
as $fn$
declare
  v_raw jsonb := p_settings -> 'voice_retention' -> p_key;
  v_num numeric;
begin
  -- a broken value or one outside a week … ten years reads as the default (VoiceRetentionSchema)
  if jsonb_typeof(v_raw) is distinct from 'number' then
    return p_default;
  end if;
  v_num := v_raw::numeric;
  if v_num <> trunc(v_num) or v_num < 7 or v_num > 3650 then
    return p_default;
  end if;
  return v_num::int;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. «В корпус»: a recording kept for checking the recognition, never purged
-- ---------------------------------------------------------------------------
create table voice_kept (
  path       text primary key,                  -- the object name in the voice bucket
  company_id uuid not null references companies,
  kept_by    uuid references profiles,
  created_at timestamptz not null default now()
);

comment on table voice_kept is 'voice recordings kept «в корпус» (D-155 §3): voice_purge_due never returns them; written only by voice_keep (or SQL by hand)';

alter table voice_kept enable row level security;

-- the director and the secretary of the company read it; nobody writes it but the functions
create policy voice_kept_select on voice_kept for select to authenticated using (
  company_id = (select auth_company_id())
  and (select auth_role()) in ('director', 'secretary')
);

-- An absolute state, not a step: «keep» twice is one row, «don't keep» twice is none — a repeat is
-- harmless, so no client_request_id (an exception of principle 7 of the same kind as tv_control).
create or replace function voice_keep(p_path text, p_keep boolean) returns boolean
language plpgsql security definer set search_path = public
as $fn$
declare
  v_company uuid := auth_company_id();
begin
  if v_company is null or auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  -- objects live at {company_id}/{user_id}/{uuid}.{ext}: only the director's own company
  if p_path is null or p_keep is null or not starts_with(p_path, v_company::text || '/') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;

  if p_keep then
    insert into voice_kept (path, company_id, kept_by)
    values (p_path, v_company, auth.uid())
    on conflict do nothing;
  else
    delete from voice_kept k where k.path = p_path and k.company_id = v_company;
  end if;
  return p_keep;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 3. Which files of the voice bucket are due — read from storage.objects, removed by Storage API
-- ---------------------------------------------------------------------------
create or replace function voice_purge_due(p_now timestamptz default now(), p_limit int default 500)
returns table (company_id uuid, path text)
language sql stable security definer set search_path = public
as $fn$
  with files as (
    select o.name as path,
           o.created_at,
           -- the company is the first segment; a name without a uuid there is not ours to judge
           case when split_part(o.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then split_part(o.name, '/', 1)::uuid end as company_id
      from storage.objects o
     where o.bucket_id = 'voice'
  ),
  -- every row a recording stands behind; 'infinity' = still open
  refs (path, closed_at) as (
    select t.source_audio_path,
           case when t.status in ('done', 'revoked') then coalesce(t.closed_at, 'infinity') else 'infinity' end
      from tasks t
     where t.source_audio_path is not null
    union all
    select m.file_path,
           case when t.status in ('done', 'revoked') then coalesce(t.closed_at, 'infinity') else 'infinity' end
      from task_messages m
      join tasks t on t.id = m.task_id
     where m.type = 'voice' and m.file_path is not null
    union all
    select a.audio_path, a.created_at
      from announcements a
     where a.audio_path is not null
    union all
    select e.audio_path,
           case when coalesce(e.ends_at, e.starts_at) <= p_now then coalesce(e.ends_at, e.starts_at) else 'infinity' end
      from events e
     where e.audio_path is not null
    union all
    select n.audio_path, 'infinity'::timestamptz
      from notes n
     where n.audio_path is not null
    union all
    select r.audio_path,
           case when r.status in ('done', 'declined', 'cancelled') then coalesce(r.done_at, r.updated_at) else 'infinity' end
      from errands r
     where r.audio_path is not null
    union all
    select rr.source_audio_path,
           case when not rr.is_active then rr.updated_at else 'infinity' end
      from recurrence_rules rr
     where rr.source_audio_path is not null
  ),
  closed as (
    select refs.path, max(refs.closed_at) as last_closed
      from refs
     group by refs.path
  )
  select f.company_id, f.path
    from files f
    join companies c on c.id = f.company_id
    left join closed cl on cl.path = f.path
   where not exists (select 1 from voice_kept k where k.path = f.path)
     and case
           when cl.path is null
             then f.created_at + make_interval(days => voice_retention_days(c.settings, 'orphan_days', 30)) <= p_now
           when cl.last_closed = 'infinity'
             then false
           else cl.last_closed + make_interval(days => voice_retention_days(c.settings, 'closed_days', 90)) <= p_now
         end
   order by f.created_at
   limit greatest(coalesce(p_limit, 500), 0);
$fn$;

-- ---------------------------------------------------------------------------
-- 4. The files Storage removed: their paths become null everywhere, texts stay
-- ---------------------------------------------------------------------------
create or replace function voice_mark_purged(p_paths text[]) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_rows  int;
  v_total int := 0;
begin
  if p_paths is null or cardinality(p_paths) = 0 then
    return 0;
  end if;

  update tasks t set source_audio_path = null where t.source_audio_path = any(p_paths);
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  update task_messages m set file_path = null where m.type = 'voice' and m.file_path = any(p_paths);
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  update announcements a set audio_path = null where a.audio_path = any(p_paths);
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  update events e set audio_path = null where e.audio_path = any(p_paths);
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  update notes n set audio_path = null where n.audio_path = any(p_paths);
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  update errands r set audio_path = null where r.audio_path = any(p_paths);
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  update recurrence_rules rr set source_audio_path = null where rr.source_audio_path = any(p_paths);
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  update inbox_items i set audio_path = null where i.audio_path = any(p_paths);
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  return v_total;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. Grants: «в корпус» — a signed-in director; the term and the purge — the sweep only
-- ---------------------------------------------------------------------------
revoke execute on function voice_retention_days(jsonb, text, int) from public, anon, authenticated;
revoke execute on function voice_keep(text, boolean) from public, anon, authenticated;
revoke execute on function voice_purge_due(timestamptz, int) from public, anon, authenticated;
revoke execute on function voice_mark_purged(text[]) from public, anon, authenticated;

grant execute on function voice_keep(text, boolean) to authenticated;
grant execute on function voice_retention_days(jsonb, text, int) to service_role;
grant execute on function voice_purge_due(timestamptz, int) to service_role;
grant execute on function voice_mark_purged(text[]) to service_role;
