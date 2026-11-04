-- tasks/029 (D-157): the developers' console. Operators live outside every company, in a schema
-- PostgREST does not expose; the app reaches it only through public.ops_* functions.
--
-- How the guard works:
--   operator   a row in ops.operators without revoked_at and no row in profiles. Positive on purpose:
--              «has no profile» alone means nothing.
--   reading    public.ops_* under the operator's JWT, the first line of each is ops.assert(43200).
--   writing    by ticket: ops_ticket (under the JWT) checks the operator, the TOTP's age and the reason
--              and issues a one-time ticket for 60 seconds. The writing functions belong to service_role
--              only; the first line is ops.take, the last one ops.log. Without a real operator's session
--              there is no ticket, so a check forgotten in a route is not a hole.
--   quiet      ops.take sets pulse.ops_quiet for the transaction: notification_deliveries_deliver_after
--              puts the row out the way `muted` does. A service edit pushes nobody.
--   journal    ops.audit is append-only, triggers refuse UPDATE, DELETE and TRUNCATE.
-- Under the service role auth.uid() is null: the field guards let the call through as they do the tick.
-- Files are only ever queued (ops.storage_queue): Supabase refuses a direct delete from storage.objects.

-- ---------------------------------------------------------------------------
-- 1. Schema and tables: RLS on, no policies, no grants
-- ---------------------------------------------------------------------------
create schema ops;
revoke all on schema ops from public;

create table ops.operators (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  note       text,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table ops.tickets (
  id                uuid primary key default gen_random_uuid(),
  operator_id       uuid not null references ops.operators (user_id) on delete cascade,
  session_id        uuid not null,
  action            text not null,
  company_id        uuid,
  target            jsonb not null default '{}'::jsonb,
  reason            text not null,
  client_request_id uuid not null unique,
  created_at        timestamptz not null default now(),
  taken_at          timestamptz
);
create index tickets_created_idx on ops.tickets (created_at);

-- no foreign keys: the journal outlives the company, the person and the operator
create table ops.audit (
  id                bigint generated always as identity primary key,
  at                timestamptz not null default now(),
  operator_id       uuid,
  session_id        uuid,
  action            text not null,
  company_id        uuid,
  company_name      text,
  target            jsonb not null default '{}'::jsonb,
  reason            text not null,
  client_request_id uuid unique,
  result            jsonb
);
create index audit_company_idx on ops.audit (company_id, id desc);

-- the ids made up front, so a repeat of the creation goes with the same people
create table ops.company_requests (
  client_request_id uuid primary key,
  director_id       uuid not null,
  tv_id             uuid not null,
  created_at        timestamptz not null default now()
);

-- a row goes when its file is gone from Storage
create table ops.storage_queue (
  id         bigint generated always as identity primary key,
  company_id uuid not null,
  bucket     text not null,
  name       text not null,
  queued_at  timestamptz not null default now(),
  unique (bucket, name)
);
create index storage_queue_company_idx on ops.storage_queue (company_id);

create table ops.exports (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,
  operator_id uuid not null,
  created_at  timestamptz not null default now(),
  finished_at timestamptz,
  sha256      text,
  counts      jsonb
);
create index exports_company_idx on ops.exports (company_id, finished_at desc);

alter table ops.operators enable row level security;
alter table ops.tickets enable row level security;
alter table ops.audit enable row level security;
alter table ops.company_requests enable row level security;
alter table ops.storage_queue enable row level security;
alter table ops.exports enable row level security;
revoke all on all tables in schema ops from public, anon, authenticated, service_role;
revoke all on all sequences in schema ops from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The journal cannot be changed
-- ---------------------------------------------------------------------------
create function ops.audit_frozen() returns trigger
language plpgsql set search_path = public
as $fn$
begin
  raise exception 'audit_immutable' using errcode = 'P0001';
end;
$fn$;

create trigger audit_frozen before update or delete or truncate on ops.audit
  for each statement execute function ops.audit_frozen();

-- ---------------------------------------------------------------------------
-- 3. The guard: assert, take, log
-- ---------------------------------------------------------------------------

-- GoTrue keeps one row per (session, method) and moves updated_at on every new verification, so a
-- repeated code shows in updated_at: created_at stays at the first one.
create function ops.assert(p_fresh_seconds int)
returns table (operator_id uuid, session_id uuid)
language plpgsql security definer set search_path = public
as $fn$
declare
  v_user    uuid := auth.uid();
  v_session uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  v_aal     text;
  v_until   timestamptz;
  v_totp    timestamptz;
begin
  if v_user is null or v_session is null then
    raise exception 'ops_denied' using errcode = 'P0001';
  end if;
  if not exists (select 1 from ops.operators o where o.user_id = v_user and o.revoked_at is null) then
    raise exception 'ops_denied' using errcode = 'P0001';
  end if;
  if exists (select 1 from profiles p where p.id = v_user) then
    raise exception 'ops_denied' using errcode = 'P0001';
  end if;

  select s.aal::text, s.not_after into v_aal, v_until
    from auth.sessions s
   where s.id = v_session and s.user_id = v_user;
  if not found or v_aal is distinct from 'aal2' or v_until <= now() then
    raise exception 'ops_denied' using errcode = 'P0001';
  end if;

  select max(greatest(c.created_at, c.updated_at)) into v_totp
    from auth.mfa_amr_claims c
   where c.session_id = v_session and c.authentication_method = 'totp';
  if v_totp is null or v_totp < now() - make_interval(secs => p_fresh_seconds) then
    raise exception 'ops_fresh_required' using errcode = 'P0001';
  end if;

  return query select v_user, v_session;
end;
$fn$;

create function ops.take(p_ticket uuid, p_action text, p_company uuid) returns ops.tickets
language plpgsql security definer set search_path = public
as $fn$
declare
  v_ticket ops.tickets;
begin
  select * into v_ticket from ops.tickets t where t.id = p_ticket for update;
  if not found
     or v_ticket.taken_at is not null
     or v_ticket.action is distinct from p_action
     or v_ticket.company_id is distinct from p_company
     or v_ticket.created_at <= now() - interval '60 seconds'
     or not exists (
       select 1 from ops.operators o
        where o.user_id = v_ticket.operator_id and o.revoked_at is null
     ) then
    raise exception 'ops_bad_ticket' using errcode = 'P0001';
  end if;

  update ops.tickets t set taken_at = now() where t.id = p_ticket returning * into v_ticket;
  perform set_config('pulse.ops_quiet', '1', true);
  return v_ticket;
end;
$fn$;

-- p_company_name is for the purge: by the last line the company is gone
create function ops.log(p_ticket ops.tickets, p_result jsonb, p_company_name text default null) returns void
language sql security definer set search_path = public
as $fn$
  insert into ops.audit (operator_id, session_id, action, company_id, company_name, target, reason,
                         client_request_id, result)
  values ((p_ticket).operator_id, (p_ticket).session_id, (p_ticket).action, (p_ticket).company_id,
          coalesce(p_company_name, (select c.name from companies c where c.id = (p_ticket).company_id)),
          (p_ticket).target, (p_ticket).reason, (p_ticket).client_request_id, p_result);
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Helpers
-- ---------------------------------------------------------------------------

-- The health of a company, the same words in the registry and on the card. A queued row counts once
-- it is due: a push waiting for the delivery window is not stuck. `muted` is nobody's failure;
-- `no_subscription` stays inside failed_7d and is told apart by its own number.
create function ops.signals(p_company uuid) returns jsonb
language sql stable security definer set search_path = public
as $fn$
  select jsonb_build_object(
           'parse_errors_24h',
           (select count(*)::int from ai_logs l
             where l.company_id = p_company and l.kind = 'parse' and l.status <> 'ok'
               and l.created_at > now() - interval '24 hours'),
           'queue_depth', q.depth,
           'queue_age_seconds', q.age,
           'failed_7d', f.failed,
           'failed_no_subscription_7d', f.no_subscription)
    from (select count(*)::int as depth,
                 extract(epoch from now() - min(d.deliver_after))::int as age
            from notification_deliveries d
           where d.company_id = p_company and d.status = 'queued' and d.deliver_after <= now()) q,
         (select count(*)::int as failed,
                 count(*) filter (where d.last_error = 'no_subscription')::int as no_subscription
            from notification_deliveries d
           where d.company_id = p_company and d.status = 'failed'
             and d.created_at > now() - interval '7 days'
             and d.last_error is distinct from 'muted') f;
$fn$;

-- Rows per table: every public table with company_id, found in the catalog so a new table is never
-- missed, plus the two children reached only through their parent. The footprint's numbers and the
-- purge's postcondition are the same query.
create function ops.table_counts(p_company uuid) returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_table text;
  v_rows  bigint;
  v_out   jsonb := '{}'::jsonb;
begin
  for v_table in
    select c.relname
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p')
       and a.attname = 'company_id' and not a.attisdropped
     order by c.relname
  loop
    execute format('select count(*) from public.%I where company_id = $1', v_table)
       into v_rows using p_company;
    v_out := v_out || jsonb_build_object(v_table, v_rows);
  end loop;

  select count(*) into v_rows
    from announcement_acks k join announcements a on a.id = k.announcement_id
   where a.company_id = p_company;
  v_out := v_out || jsonb_build_object('announcement_acks', v_rows);

  select count(*) into v_rows
    from event_participants p join events e on e.id = p.event_id
   where e.company_id = p_company;
  v_out := v_out || jsonb_build_object('event_participants', v_rows);

  select count(*) into v_rows from companies c where c.id = p_company;
  return v_out || jsonb_build_object('companies', v_rows);
end;
$fn$;

-- What a cleanup took: the counts before minus the counts after, zeros left out
create function ops.rows_taken(p_before jsonb, p_after jsonb) returns jsonb
language sql immutable security definer set search_path = public
as $fn$
  select coalesce(jsonb_object_agg(b.key, b.value::text::bigint - coalesce((p_after ->> b.key)::bigint, 0)), '{}'::jsonb)
    from jsonb_each(p_before) b
   where b.value::text::bigint <> coalesce((p_after ->> b.key)::bigint, 0);
$fn$;

create function ops.clear_rows(p_company uuid, p_tables text[]) returns void
language plpgsql security definer set search_path = public
as $fn$
declare
  v_table text;
begin
  foreach v_table in array p_tables loop
    execute format('delete from public.%I where company_id = $1', v_table) using p_company;
  end loop;
end;
$fn$;

-- Objects live at {company_id}/...: the first segment names the company in every bucket, so
-- p_buckets null takes them all, a bucket added later included. p_keep_living spares what stays
-- after a wipe: files «в корпус» and photos of the shop.
create function ops.queue_files(p_company uuid, p_buckets text[], p_keep_living boolean) returns int
language plpgsql security definer set search_path = public
as $fn$
declare
  v_rows int;
begin
  insert into ops.storage_queue (company_id, bucket, name)
  select p_company, o.bucket_id, o.name
    from storage.objects o
   where (p_buckets is null or o.bucket_id = any(p_buckets))
     and o.name like p_company::text || '/%'
     and not (p_keep_living and (
       (o.bucket_id = 'voice' and exists (select 1 from voice_kept k where k.path = o.name))
       or (o.bucket_id = 'photos' and exists (
         select 1 from shop_items s where s.company_id = p_company and s.photo_path = o.name))
     ))
  on conflict (bucket, name) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$fn$;

create function ops.task_json(p_task uuid, p_company uuid) returns jsonb
language sql stable security definer set search_path = public
as $fn$
  select jsonb_build_object(
           'id', t.id, 'title', t.title, 'body', t.body, 'deadline', t.deadline, 'status', t.status,
           'author', a.full_name, 'assignee', b.full_name, 'created_at', t.created_at)
    from tasks t
    left join profiles a on a.id = t.author_id
    left join profiles b on b.id = t.assignee_id
   where t.id = p_task and (p_company is null or t.company_id = p_company);
$fn$;

-- The export's white list. Left out on purpose: notes and mind_boards (private, D-75), login_codes,
-- login_attempts, push_subscriptions, notification_deliveries. A new table is out until named here;
-- supabase/tests/052 fails until it is named on one side or the other.
create function ops.export_tables() returns text[]
language sql immutable security definer set search_path = public
as $fn$
  select array[
    'companies', 'profiles', 'tasks', 'task_messages', 'task_reactions', 'task_reads',
    'announcements', 'announcement_acks', 'events', 'event_participants', 'errands', 'visits',
    'recurrence_rules', 'inbox_items', 'ingest_batches', 'ai_logs', 'daily_reports',
    'point_transactions', 'point_disputes', 'ether_events', 'shop_items', 'orders', 'reminders',
    'tv_state', 'tv_events', 'voice_kept', 'notification_prefs'
  ]::text[];
$fn$;

-- The company of a live export: unfinished and younger than 30 minutes
create function ops.export_company(p_export uuid) returns uuid
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_company uuid;
begin
  select e.company_id into v_company
    from ops.exports e
   where e.id = p_export and e.finished_at is null and e.created_at > now() - interval '30 minutes';
  if not found then
    raise exception 'export_expired' using errcode = 'P0001';
  end if;
  return v_company;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. Under the operator's JWT
-- ---------------------------------------------------------------------------

-- The only one without ops.assert: it answers at aal1 and tells nothing but the caller's own status
create function public.ops_login_state() returns jsonb
language sql stable security definer set search_path = public
as $fn$
  select jsonb_build_object(
    'operator',
    exists (select 1 from ops.operators o where o.user_id = auth.uid() and o.revoked_at is null)
    and not exists (select 1 from profiles p where p.id = auth.uid()));
$fn$;

create function public.ops_ticket(p_action text, p_company uuid, p_target jsonb, p_reason text, p_client_request_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_operator uuid;
  v_session  uuid;
  v_reason   text := btrim(coalesce(p_reason, ''));
  v_done     ops.audit;
  v_result   jsonb;
  v_ticket   uuid;
begin
  select a.operator_id, a.session_id into v_operator, v_session from ops.assert(43200) a;

  -- OPS_ACTIONS of lib/ops/contract.ts
  if p_action is null or p_action not in (
    'create_company', 'update_company', 'add_person', 'update_person', 'issue_login_code',
    'revoke_sessions', 'change_director', 'adjust_points', 'task_lookup', 'update_task',
    'delete_task', 'wipe_activity', 'export_company', 'purge_company'
  ) then
    raise exception 'unknown_action' using errcode = 'P0001';
  end if;
  if char_length(v_reason) < 5 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  if p_client_request_id is null then
    raise exception 'ops_bad_ticket' using errcode = 'P0001';
  end if;
  if p_action not in ('create_company', 'add_person', 'revoke_sessions') then
    perform ops.assert(300);
  end if;

  -- wait for a twin of this request in flight: its journal row is visible to the very next statement
  perform 1 from ops.tickets t where t.client_request_id = p_client_request_id for update;

  select * into v_done from ops.audit a where a.client_request_id = p_client_request_id;
  if found then
    if v_done.operator_id is distinct from v_operator
       or v_done.action is distinct from p_action
       or (p_company is not null and v_done.company_id is distinct from p_company) then
      raise exception 'ops_bad_ticket' using errcode = 'P0001';
    end if;
    v_result := v_done.result;
    -- a task's words stay out of the journal: a repeat reads them anew
    if p_action = 'task_lookup' then
      v_result := v_result || jsonb_build_object(
        'task', ops.task_json((v_done.result ->> 'task_id')::uuid, v_done.company_id));
      if v_result -> 'task' = 'null'::jsonb then
        raise exception 'not_found' using errcode = 'P0001';
      end if;
    end if;
    return jsonb_build_object('duplicate', true, 'result', v_result);
  end if;

  delete from ops.tickets t where t.created_at < now() - interval '1 day';

  insert into ops.tickets (operator_id, session_id, action, company_id, target, reason, client_request_id)
  values (v_operator, v_session, p_action, p_company, coalesce(p_target, '{}'::jsonb), v_reason, p_client_request_id)
  on conflict (client_request_id) do update
    set created_at = now(),
        session_id = excluded.session_id,
        target     = excluded.target,
        reason     = excluded.reason
    where ops.tickets.taken_at is null
      and ops.tickets.operator_id = excluded.operator_id
      and ops.tickets.action = excluded.action
      and ops.tickets.company_id is not distinct from excluded.company_id
  returning id into v_ticket;

  if v_ticket is null then
    raise exception 'ops_bad_ticket' using errcode = 'P0001';
  end if;
  return jsonb_build_object('ticket', v_ticket);
end;
$fn$;

create function public.ops_companies() returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_rows jsonb;
begin
  perform ops.assert(43200);

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', c.id, 'name', c.name, 'slug', c.slug, 'created_at', c.created_at,
             'people', p.people, 'active_7d', s.active_7d, 'last_seen_at', s.last_seen_at,
             'last_parse_at', l.last_parse_at)
           || (ops.signals(c.id) - 'failed_no_subscription_7d')
           order by c.name), '[]'::jsonb)
    into v_rows
    from companies c
    cross join lateral (
      select count(*)::int as people
        from profiles x
       where x.company_id = c.id and x.is_active and x.role <> 'tv'
    ) p
    cross join lateral (
      -- the kiosk is always on: its session says nothing about the company
      select count(distinct x.id) filter (where y.seen > now() - interval '7 days')::int as active_7d,
             max(y.seen) as last_seen_at
        from profiles x
        join lateral (
          select coalesce(z.refreshed_at at time zone 'UTC', z.updated_at, z.created_at) as seen
            from auth.sessions z
           where z.user_id = x.id
        ) y on true
       where x.company_id = c.id and x.role <> 'tv'
    ) s
    cross join lateral (
      select max(a.created_at) as last_parse_at
        from ai_logs a
       where a.company_id = c.id and a.kind = 'parse'
    ) l;

  return v_rows;
end;
$fn$;

create function public.ops_company_card(p_company uuid) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_company companies%rowtype;
  v_model   text;
  v_people  jsonb;
  v_spend   jsonb;
begin
  perform ops.assert(43200);

  select * into v_company from companies c where c.id = p_company;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  v_model := v_company.settings -> 'parser' ->> 'model';

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', p.id, 'full_name', p.full_name, 'role', p.role, 'position', p.position,
             'is_active', p.is_active,
             -- a service address on .invalid (lib/people/email.ts) is no email at all
             'email', case when u.email is null or lower(u.email) like '%@people.invalid' then null
                           else u.email end,
             'last_seen_at', s.last_seen_at, 'sessions', s.sessions, 'devices', d.devices, 'points', b.points)
           order by case p.role when 'director' then 0 when 'tv' then 2 else 1 end, p.full_name), '[]'::jsonb)
    into v_people
    from profiles p
    left join auth.users u on u.id = p.id
    cross join lateral (
      select count(*)::int as sessions,
             max(coalesce(x.refreshed_at at time zone 'UTC', x.updated_at, x.created_at)) as last_seen_at
        from auth.sessions x
       where x.user_id = p.id
    ) s
    cross join lateral (
      select count(*)::int as devices from push_subscriptions x where x.user_id = p.id
    ) d
    cross join lateral (
      select coalesce(sum(x.amount), 0)::int as points
        from point_transactions x
       where x.company_id = p_company and x.user_id = p.id
    ) b
   where p.company_id = p_company;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.calls desc), '[]'::jsonb)
    into v_spend
    from (
      select l.provider, l.model, count(*)::int as calls,
             coalesce(sum(l.input_tokens), 0)::bigint as input_tokens,
             coalesce(sum(l.output_tokens), 0)::bigint as output_tokens,
             coalesce(sum(l.cache_read_tokens), 0)::bigint as cache_read_tokens
        from ai_logs l
       where l.company_id = p_company and l.created_at > now() - interval '30 days'
       group by l.provider, l.model
    ) x;

  return jsonb_build_object(
    'id', v_company.id,
    'name', v_company.name,
    'slug', v_company.slug,
    'created_at', v_company.created_at,
    -- no `provider` key in settings: the model says it, as the parser itself decides
    'settings', jsonb_build_object(
      'parser_provider', case when v_model like 'deepseek%' then 'deepseek'
                              when v_model like 'claude%' then 'anthropic' end,
      'parser_model', v_model,
      'points_enabled', coalesce(v_company.settings ->> 'points_enabled', 'false') = 'true',
      'lab_for_all', coalesce(v_company.settings ->> 'lab_for_all', 'false') = 'true',
      'dev_tools', coalesce((v_company.settings ->> 'dev_tools')::boolean, false)),
    'people', v_people,
    'spend_30d', v_spend,
    'tv_seen_at', (select s.seen_at from tv_state s where s.company_id = p_company),
    'signals', ops.signals(p_company));
end;
$fn$;

create function public.ops_company_footprint(p_company uuid) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
begin
  perform ops.assert(43200);

  if not exists (select 1 from companies c where c.id = p_company) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'tables', ops.table_counts(p_company),
    -- three keys, the contract's. People's photos count under `brand`: like the logo they are public
    -- files a wipe keeps and a purge removes, so both previews add up
    'files', (
      select jsonb_object_agg(b.key, jsonb_build_object('count', f.files, 'bytes', f.bytes))
        from (values ('voice', array['voice']), ('photos', array['photos']), ('brand', array['brand', 'avatars']))
          as b(key, buckets)
        cross join lateral (
          select count(*)::int as files,
                 coalesce(sum((o.metadata ->> 'size')::bigint), 0)::bigint as bytes
            from storage.objects o
           where o.bucket_id = any(b.buckets) and o.name like p_company::text || '/%'
        ) f
    ),
    'kept_files', (select count(*)::int from voice_kept k where k.company_id = p_company),
    'files_queued', (select count(*)::int from ops.storage_queue q where q.company_id = p_company),
    'last_export', (
      select jsonb_build_object('at', e.finished_at, 'sha256', e.sha256)
        from ops.exports e
       where e.company_id = p_company and e.finished_at is not null
       order by e.finished_at desc
       limit 1
    ));
end;
$fn$;

create function public.ops_audit_list(p_before bigint, p_limit int, p_company uuid) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_rows jsonb;
begin
  perform ops.assert(43200);

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', a.id, 'at', a.at, 'operator_id', a.operator_id, 'operator_email', u.email,
             'action', a.action, 'company_id', a.company_id, 'company_name', a.company_name,
             'target', a.target, 'reason', a.reason, 'result', a.result)
           order by a.id desc), '[]'::jsonb)
    into v_rows
    from (
      select *
        from ops.audit x
       where (p_before is null or x.id < p_before)
         and (p_company is null or x.company_id = p_company)
       order by x.id desc
       limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) a
    left join auth.users u on u.id = a.operator_id;

  return v_rows;
end;
$fn$;

create function public.ops_operators() returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_rows jsonb;
begin
  perform ops.assert(43200);

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'user_id', o.user_id, 'email', u.email, 'note', o.note, 'created_at', o.created_at,
             'revoked_at', o.revoked_at, 'last_seen_at', s.last_seen_at)
           order by o.created_at), '[]'::jsonb)
    into v_rows
    from ops.operators o
    left join auth.users u on u.id = o.user_id
    cross join lateral (
      select max(coalesce(x.refreshed_at at time zone 'UTC', x.updated_at, x.created_at)) as last_seen_at
        from auth.sessions x
       where x.user_id = o.user_id
    ) s;

  return v_rows;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 6. service_role: a company and its people
-- ---------------------------------------------------------------------------
create function public.ops_slug_free(p_slug text) returns boolean
language sql stable security definer set search_path = public
as $fn$
  select not exists (select 1 from companies c where c.slug = p_slug);
$fn$;

create function public.ops_prepare_company(p_ticket uuid) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_request uuid;
  v_row     ops.company_requests;
begin
  select t.client_request_id into v_request
    from ops.tickets t
   where t.id = p_ticket and t.action = 'create_company';
  if not found then
    raise exception 'ops_bad_ticket' using errcode = 'P0001';
  end if;

  insert into ops.company_requests (client_request_id, director_id, tv_id)
  values (v_request, gen_random_uuid(), gen_random_uuid())
  on conflict (client_request_id) do nothing;

  select * into v_row from ops.company_requests r where r.client_request_id = v_request;
  return jsonb_build_object('director_id', v_row.director_id, 'tv_id', v_row.tv_id);
end;
$fn$;

-- p_payload: {name, slug, settings, director: {full_name, position, aliases}, shop: [...]}. The people's
-- ids are the ones ops_prepare_company made; settings go in as given, the rest are the schema's defaults.
create function public.ops_create_company(p_ticket uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_ticket  ops.tickets;
  v_request ops.company_requests;
  v_company uuid := gen_random_uuid();
  v_name    text := nullif(btrim(coalesce(p_payload ->> 'name', '')), '');
  v_slug    text := p_payload ->> 'slug';
  v_result  jsonb;
begin
  v_ticket := ops.take(p_ticket, 'create_company', null);

  select * into v_request from ops.company_requests r where r.client_request_id = v_ticket.client_request_id;
  if not found then
    raise exception 'ops_bad_ticket' using errcode = 'P0001';
  end if;
  if v_name is null or char_length(v_name) > 120 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if exists (select 1 from companies c where c.slug = v_slug) then
    raise exception 'slug_taken' using errcode = 'P0001';
  end if;

  insert into companies (id, name, slug, settings)
  values (v_company, v_name, v_slug, coalesce(p_payload -> 'settings', '{}'::jsonb));

  insert into profiles (id, company_id, full_name, role, position, aliases)
  values (v_request.director_id, v_company, btrim(p_payload -> 'director' ->> 'full_name'), 'director',
          coalesce(nullif(btrim(coalesce(p_payload -> 'director' ->> 'position', '')), ''), 'Директор'),
          coalesce(array(select jsonb_array_elements_text(p_payload -> 'director' -> 'aliases')), '{}'));

  insert into profiles (id, company_id, full_name, role)
  values (v_request.tv_id, v_company, 'TV Kiosk', 'tv');

  insert into shop_items (company_id, title, description, icon, price, stock, sort)
  select v_company, x.title, x.description, x.icon, x.price, x.stock, coalesce(x.sort, 100)
    from jsonb_to_recordset(coalesce(p_payload -> 'shop', '[]'::jsonb))
      as x(title text, description text, icon text, price int, stock int, sort int);

  insert into tv_state (company_id) values (v_company);

  v_result := jsonb_build_object('company_id', v_company, 'director_id', v_request.director_id,
                                 'tv_id', v_request.tv_id, 'slug', v_slug);
  v_ticket.company_id := v_company;
  perform ops.log(v_ticket, v_result);
  return v_result;
end;
$fn$;

-- For actions done outside the base: the code of a person, a file of a bucket
create function public.ops_log_action(p_ticket uuid, p_action text, p_company uuid, p_result jsonb) returns void
language plpgsql security definer set search_path = public
as $fn$
declare
  v_ticket ops.tickets;
begin
  v_ticket := ops.take(p_ticket, p_action, p_company);
  perform ops.log(v_ticket, p_result);
end;
$fn$;

create function public.ops_add_person(p_ticket uuid, p_company uuid, p_user uuid, p_full_name text, p_role text,
                                      p_position text, p_aliases text[]) returns void
language plpgsql security definer set search_path = public
as $fn$
declare
  v_ticket ops.tickets;
  v_name   text := nullif(btrim(coalesce(p_full_name, '')), '');
begin
  v_ticket := ops.take(p_ticket, 'add_person', p_company);

  if p_role = 'director' then
    raise exception 'use_change_director' using errcode = 'P0001';
  end if;
  if p_role is null or p_role not in ('manager', 'employee', 'shopkeeper', 'secretary') then
    raise exception 'bad_role' using errcode = 'P0001';
  end if;
  if v_name is null or char_length(v_name) > 120 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if not exists (select 1 from companies c where c.id = p_company) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  insert into profiles (id, company_id, full_name, role, position, aliases)
  values (p_user, p_company, v_name, p_role::user_role, nullif(btrim(coalesce(p_position, '')), ''),
          coalesce(p_aliases, '{}'));

  perform ops.log(v_ticket, jsonb_build_object('user_id', p_user));
end;
$fn$;

create function public.ops_update_company(p_ticket uuid, p_company uuid, p_name text, p_slug text, p_settings jsonb)
returns void
language plpgsql security definer set search_path = public
as $fn$
declare
  v_ticket ops.tickets;
  v_name   text := nullif(btrim(coalesce(p_name, '')), '');
begin
  v_ticket := ops.take(p_ticket, 'update_company', p_company);

  -- the company's parser rules pass the corpus run in «Лаб → Парсер» or are not saved (D-138).
  -- dev_tools goes through: update_company_settings drops it, this is the one way it is written
  if p_settings is not null and p_settings ? 'parser_rules' then
    raise exception 'parser_rules_forbidden' using errcode = 'P0001';
  end if;
  if p_settings is not null and jsonb_typeof(p_settings) <> 'object' then
    raise exception 'bad_patch' using errcode = 'P0001';
  end if;
  if p_name is not null and (v_name is null or char_length(v_name) > 120) then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if p_slug is not null and exists (select 1 from companies c where c.slug = p_slug and c.id <> p_company) then
    raise exception 'slug_taken' using errcode = 'P0001';
  end if;

  update companies c
     set name     = coalesce(v_name, c.name),
         slug     = coalesce(p_slug, c.slug),
         settings = c.settings || coalesce(p_settings, '{}'::jsonb)
   where c.id = p_company;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  perform ops.log(v_ticket, jsonb_build_object(
    'name', p_name is not null,
    'slug', p_slug is not null,
    'settings', coalesce((select jsonb_agg(k) from jsonb_object_keys(coalesce(p_settings, '{}'::jsonb)) k), '[]'::jsonb)));
end;
$fn$;

create function public.ops_update_person(p_ticket uuid, p_company uuid, p_user uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = public
as $fn$
declare
  v_ticket ops.tickets;
  v_person profiles%rowtype;
  v_patch  jsonb := coalesce(p_patch, '{}'::jsonb);
  v_name   text := nullif(btrim(coalesce(v_patch ->> 'full_name', '')), '');
  v_role   text := v_patch ->> 'role';
begin
  v_ticket := ops.take(p_ticket, 'update_person', p_company);

  if jsonb_typeof(v_patch) <> 'object'
     or exists (select 1 from jsonb_object_keys(v_patch) k
                 where k not in ('full_name', 'position', 'role', 'is_active')) then
    raise exception 'bad_patch' using errcode = 'P0001';
  end if;

  select * into v_person from profiles p where p.id = p_user and p.company_id = p_company for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  -- a director's name may be mistyped; who the director is changes through ops_change_director only
  if v_role = 'director'
     or (v_person.role = 'director' and (v_patch ? 'role' or v_patch ? 'is_active')) then
    raise exception 'use_change_director' using errcode = 'P0001';
  end if;
  if v_patch ? 'role' and (v_role is null or v_person.role = 'tv'
                           or v_role not in ('manager', 'employee', 'shopkeeper', 'secretary')) then
    raise exception 'bad_role' using errcode = 'P0001';
  end if;
  if v_patch ? 'full_name' and (v_name is null or char_length(v_name) > 120) then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  if v_patch ? 'is_active' and jsonb_typeof(v_patch -> 'is_active') <> 'boolean' then
    raise exception 'bad_patch' using errcode = 'P0001';
  end if;

  update profiles p
     set full_name = case when v_patch ? 'full_name' then v_name else p.full_name end,
         position  = case when v_patch ? 'position' then nullif(btrim(coalesce(v_patch ->> 'position', '')), '')
                          else p.position end,
         role      = case when v_patch ? 'role' then v_role::user_role else p.role end,
         is_active = case when v_patch ? 'is_active' then (v_patch ->> 'is_active')::boolean else p.is_active end
   where p.id = p_user;

  perform ops.log(v_ticket, jsonb_build_object(
    'user_id', p_user,
    'fields', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(v_patch) k)));
end;
$fn$;

-- The body of revoke_sessions without its role check: the ticket stands for it
create function public.ops_revoke_sessions(p_ticket uuid, p_company uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_ticket   ops.tickets;
  v_sessions int;
  v_devices  int;
  v_result   jsonb;
begin
  v_ticket := ops.take(p_ticket, 'revoke_sessions', p_company);

  if not exists (select 1 from profiles p where p.id = p_user and p.company_id = p_company) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  delete from auth.sessions s where s.user_id = p_user;
  get diagnostics v_sessions = row_count;

  delete from push_subscriptions s where s.user_id = p_user;
  get diagnostics v_devices = row_count;

  update login_codes c set cancelled_at = now()
   where c.user_id = p_user and c.used_at is null and c.cancelled_at is null;

  v_result := jsonb_build_object('sessions', v_sessions, 'devices', v_devices);
  perform ops.log(v_ticket, v_result || jsonb_build_object('user_id', p_user));
  return v_result;
end;
$fn$;

-- A correction is a new row, never an edit (principle 4). A balance may go below zero: it is a correction.
create function public.ops_adjust_points(p_ticket uuid, p_company uuid, p_user uuid, p_amount int, p_reason text)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_ticket  ops.tickets;
  v_balance int;
  v_result  jsonb;
begin
  v_ticket := ops.take(p_ticket, 'adjust_points', p_company);

  if not exists (select 1 from profiles p where p.id = p_user and p.company_id = p_company) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  insert into point_transactions (company_id, user_id, amount, reason, source, rule_code, actor_id, quiet)
  values (p_company, p_user, p_amount, coalesce(nullif(btrim(coalesce(p_reason, '')), ''), v_ticket.reason),
          'manual', 'ops_adjust', null, true);

  select coalesce(sum(t.amount), 0)::int into v_balance
    from point_transactions t
   where t.company_id = p_company and t.user_id = p_user;

  v_result := jsonb_build_object('balance', v_balance);
  perform ops.log(v_ticket, v_result || jsonb_build_object('user_id', p_user, 'amount', p_amount));
  return v_result;
end;
$fn$;

create function public.ops_change_director(p_ticket uuid, p_company uuid, p_old uuid, p_new uuid, p_old_fate text)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_ticket  ops.tickets;
  v_old     profiles%rowtype;
  v_new     profiles%rowtype;
  v_tasks   uuid[];
  v_rules   uuid[];
  v_events  uuid[];
  v_errands uuid[];
  v_team    uuid[];
  v_wall    boolean;
  v_result  jsonb;
begin
  v_ticket := ops.take(p_ticket, 'change_director', p_company);

  if p_old_fate is null or p_old_fate not in ('deactivate', 'demote', 'keep') then
    raise exception 'bad_fate' using errcode = 'P0001';
  end if;

  -- two handovers of one company never cross
  perform 1 from companies c where c.id = p_company for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  select * into v_old from profiles p where p.id = p_old and p.company_id = p_company;
  select * into v_new from profiles p where p.id = p_new and p.company_id = p_company;
  if v_old.id is null or v_new.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_old.role <> 'director' then
    raise exception 'not_director' using errcode = 'P0001';
  end if;
  if v_new.role = 'director' then
    raise exception 'already_director' using errcode = 'P0001';
  end if;
  if v_new.role = 'tv' then
    raise exception 'bad_role' using errcode = 'P0001';
  end if;
  if not v_new.is_active then
    raise exception 'inactive' using errcode = 'P0001';
  end if;

  update profiles p set role = 'director' where p.id = p_new;

  with moved as (
    update tasks t set author_id = p_new
     where t.company_id = p_company and t.author_id = p_old
       and t.status in ('scheduled', 'sent', 'accepted', 'in_progress', 'pending_review', 'rework', 'declined')
    returning t.id
  )
  select coalesce(array_agg(m.id), '{}') into v_tasks from moved m;

  -- the old director signs the line, once the task is no longer his: a line from the task's author
  -- would count as the answer to a question still open (task_question_answered)
  insert into task_messages (company_id, task_id, sender_id, type, content, meta)
  select p_company, x, p_old, 'system', 'Новый директор: ' || v_new.full_name,
         jsonb_build_object('director_changed', true, 'old_director', p_old, 'new_director', p_new)
    from unnest(v_tasks) x;

  with moved as (
    update recurrence_rules r set author_id = p_new
     where r.company_id = p_company and r.author_id = p_old and r.is_active
    returning r.id
  )
  select coalesce(array_agg(m.id), '{}') into v_rules from moved m;

  with moved as (
    update events e set author_id = p_new
     where e.company_id = p_company and e.author_id = p_old
       and e.cancelled_at is null and coalesce(e.ends_at, e.starts_at) > now()
    returning e.id
  )
  select coalesce(array_agg(m.id), '{}') into v_events from moved m;

  insert into event_participants (event_id, user_id, status, responded_at)
  select x, p_new, 'going', now() from unnest(v_events) x
  on conflict (event_id, user_id) do update set status = 'going', responded_at = now();

  with moved as (
    update profiles p set manager_id = case when p.id = p_new then null else p_new end
     where p.company_id = p_company and p.manager_id = p_old
    returning p.id
  )
  select coalesce(array_agg(m.id), '{}') into v_team from moved m;

  -- his boards are private: off the wall, and the wall does not stay on a scene with no board
  with up as (
    select s.company_id,
           exists (select 1 from mind_boards b where b.id = s.board_id and b.user_id = p_old) as board,
           exists (select 1 from mind_boards b where b.id = s.week_board_id and b.user_id = p_old) as week,
           exists (select 1 from notes n where n.id = s.board_point and n.user_id = p_old) as point
      from tv_state s
     where s.company_id = p_company
  ), changed as (
    update tv_state s
       set board_id         = case when u.board then null else s.board_id end,
           board_until      = case when u.board then null else s.board_until end,
           board_guest      = case when u.board then false else s.board_guest end,
           scene            = case when u.board and s.scene = 'board' then 'face' else s.scene end,
           board_point      = case when u.board or u.point then null else s.board_point end,
           week_board_id    = case when u.week then null else s.week_board_id end,
           week_board_until = case when u.week then null else s.week_board_until end,
           version          = s.version + 1
      from up u
     where s.company_id = u.company_id and (u.board or u.week or u.point)
    returning s.company_id
  )
  select exists (select 1 from changed) into v_wall;

  with moved as (
    update errands e set status = 'cancelled'
     where e.company_id = p_company and e.author_id = p_old and e.status in ('sent', 'accepted')
    returning e.id
  )
  select coalesce(array_agg(m.id), '{}') into v_errands from moved m;

  if p_old_fate = 'deactivate' then
    update profiles p set is_active = false where p.id = p_old;   -- trg_profiles_deactivated: sessions go
  elsif p_old_fate = 'demote' then
    update profiles p set role = 'employee' where p.id = p_old;
  end if;

  v_result := jsonb_build_object(
    'old_id', p_old, 'new_id', p_new, 'old_fate', p_old_fate,
    'tasks', to_jsonb(v_tasks), 'rules', to_jsonb(v_rules), 'events', to_jsonb(v_events),
    'errands', to_jsonb(v_errands), 'team', to_jsonb(v_team), 'wall', v_wall);
  perform ops.log(v_ticket, v_result);
  return v_result;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 7. service_role: a task
-- ---------------------------------------------------------------------------

-- The journal keeps the id and the status, never the task's words: they would outlive the company.
-- A repeat of the same request reads them anew in ops_ticket.
create function public.ops_task_get(p_ticket uuid, p_company_or_null uuid, p_task uuid) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_ticket ops.tickets;
  v_task   jsonb;
begin
  v_ticket := ops.take(p_ticket, 'task_lookup', p_company_or_null);

  v_task := ops.task_json(p_task, p_company_or_null);
  if v_task is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  select t.company_id into v_ticket.company_id from tasks t where t.id = p_task;
  perform ops.log(v_ticket, jsonb_build_object('task_id', p_task, 'status', v_task ->> 'status'));
  return v_task;
end;
$fn$;

create function public.ops_update_task(p_ticket uuid, p_company uuid, p_task uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = public
as $fn$
declare
  v_ticket ops.tickets;
  v_patch  jsonb := coalesce(p_patch, '{}'::jsonb);
begin
  v_ticket := ops.take(p_ticket, 'update_task', p_company);

  if jsonb_typeof(v_patch) <> 'object'
     or exists (select 1 from jsonb_object_keys(v_patch) k where k not in ('title', 'body', 'deadline'))
     or (v_patch ? 'title' and nullif(btrim(coalesce(v_patch ->> 'title', '')), '') is null) then
    raise exception 'bad_patch' using errcode = 'P0001';
  end if;

  update tasks t
     set title    = case when v_patch ? 'title' then v_patch ->> 'title' else t.title end,
         body     = case when v_patch ? 'body' then v_patch ->> 'body' else t.body end,
         deadline = case when v_patch ? 'deadline' then (v_patch ->> 'deadline')::timestamptz else t.deadline end
   where t.id = p_task and t.company_id = p_company;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  perform ops.log(v_ticket, jsonb_build_object(
    'task_id', p_task,
    'fields', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(v_patch) k)));
end;
$fn$;

-- The body of delete_task without its role check: the ticket stands for it
create function public.ops_delete_task(p_ticket uuid, p_company uuid, p_task uuid) returns void
language plpgsql security definer set search_path = public
as $fn$
declare
  v_ticket ops.tickets;
  v_status task_status;
begin
  v_ticket := ops.take(p_ticket, 'delete_task', p_company);

  select t.status into v_status
    from tasks t
   where t.id = p_task and t.company_id = p_company;

  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  update point_transactions p set task_id = null where p.task_id = p_task;
  update tasks t set parent_task_id = null where t.parent_task_id = p_task;
  delete from tasks t where t.id = p_task;

  perform ops.log(v_ticket, jsonb_build_object('task_id', p_task, 'status', v_status));
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 8. service_role: cleaning a company and removing it
-- ---------------------------------------------------------------------------

-- The order goes by the foreign keys of dev: point_transactions hold ether_events, point_disputes and
-- daily_reports' rule rows; shop_items are held by orders; mind_boards cascade to their notes; tasks go
-- in one statement for parent_task_id; profiles in one for manager_id.
create function public.ops_wipe_activity(p_ticket uuid, p_company uuid, p_confirm_name text) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_ticket ops.tickets;
  v_name   text;
  v_before jsonb;
  v_files  int;
  v_result jsonb;
begin
  v_ticket := ops.take(p_ticket, 'wipe_activity', p_company);

  select c.name into v_name from companies c where c.id = p_company for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_confirm_name is distinct from v_name then
    raise exception 'confirm_mismatch' using errcode = 'P0001';
  end if;

  v_files := ops.queue_files(p_company, array['voice', 'photos'], true);
  v_before := ops.table_counts(p_company);

  -- back to the ether, and no scene left on a board that no longer exists
  update tv_state s
     set mode = 'ether', employee_id = null, task_id = null, expires_at = null,
         board_id = null, board_until = null, board_guest = false,
         week_board_id = null, week_board_until = null, board_point = null,
         scene = case when s.scene = 'board' then 'face' else s.scene end,
         guest = false, guest_until = null, version = s.version + 1
   where s.company_id = p_company;

  -- a unit is returned only to the item it was reserved from, as cancel_shop_order does
  update shop_items s set stock = s.stock + x.units
    from (select o.item_id, count(*)::int as units
            from orders o
           where o.company_id = p_company and o.status in ('pending', 'approved') and o.stock_reserved
           group by o.item_id) x
   where s.id = x.item_id and s.stock is not null;

  perform ops.clear_rows(p_company, array[
    'notification_deliveries', 'tv_events', 'reminders',
    'ether_events', 'point_disputes', 'point_transactions', 'daily_reports',
    'orders',
    'mind_boards', 'notes',
    'announcements',
    'tasks',
    'events', 'errands', 'visits', 'recurrence_rules', 'inbox_items', 'ai_logs', 'ingest_batches'
  ]);

  update profiles p set streak_count = 0, streak_updated_at = null where p.company_id = p_company;

  v_result := jsonb_build_object('rows', ops.rows_taken(v_before, ops.table_counts(p_company)),
                                 'files_queued', v_files);
  perform ops.log(v_ticket, v_result);
  return v_result;
end;
$fn$;

create function public.ops_purge_company(p_ticket uuid, p_company uuid, p_confirm_name text) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_ticket ops.tickets;
  v_name   text;
  v_before jsonb;
  v_left   jsonb;
  v_files  int;
  v_people uuid[];
  v_result jsonb;
begin
  v_ticket := ops.take(p_ticket, 'purge_company', p_company);

  select c.name into v_name from companies c where c.id = p_company for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_confirm_name is distinct from v_name then
    raise exception 'confirm_mismatch' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from ops.exports e
     where e.company_id = p_company and e.finished_at > now() - interval '24 hours'
  ) then
    raise exception 'export_required' using errcode = 'P0001';
  end if;

  v_files := ops.queue_files(p_company, null, false);
  select coalesce(array_agg(p.id), '{}') into v_people from profiles p where p.company_id = p_company;
  v_before := ops.table_counts(p_company);

  delete from tv_state s where s.company_id = p_company;

  perform ops.clear_rows(p_company, array[
    'notification_deliveries', 'push_subscriptions', 'notification_prefs', 'login_codes', 'voice_kept',
    'tv_events', 'reminders',
    'ether_events', 'point_disputes', 'point_transactions', 'daily_reports',
    'orders', 'shop_items',
    'mind_boards', 'notes',
    'announcements',
    'tasks',
    'events', 'errands', 'visits', 'recurrence_rules', 'inbox_items', 'ai_logs', 'ingest_batches'
  ]);

  delete from profiles p where p.company_id = p_company;
  delete from auth.users u where u.id = any(v_people);
  delete from ops.company_requests r where r.director_id = any(v_people) or r.tv_id = any(v_people);
  delete from companies c where c.id = p_company;

  v_left := ops.table_counts(p_company);
  if exists (select 1 from jsonb_each(v_left) l where l.value::text::bigint <> 0) then
    raise exception 'purge_incomplete' using errcode = 'P0001', detail = v_left::text;
  end if;

  v_result := jsonb_build_object('rows', ops.rows_taken(v_before, v_left), 'files_queued', v_files);
  perform ops.log(v_ticket, v_result, v_name);
  return v_result;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 9. service_role: the export. A ticket opens it; 30 minutes later it is closed
-- ---------------------------------------------------------------------------
create function public.ops_export_begin(p_ticket uuid, p_company uuid) returns uuid
language plpgsql security definer set search_path = public
as $fn$
declare
  v_ticket ops.tickets;
  v_id     uuid;
begin
  v_ticket := ops.take(p_ticket, 'export_company', p_company);

  if not exists (select 1 from companies c where c.id = p_company) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  insert into ops.exports (company_id, operator_id)
  values (p_company, v_ticket.operator_id)
  returning id into v_id;

  perform ops.log(v_ticket, jsonb_build_object('export_id', v_id, 'tables', to_jsonb(ops.export_tables())));
  return v_id;
end;
$fn$;

create function public.ops_export_page(p_export uuid, p_table text, p_offset int, p_limit int) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_company uuid := ops.export_company(p_export);
  v_where   text;
  v_rows    jsonb;
begin
  if p_table is null or not (p_table = any(ops.export_tables())) then
    raise exception 'bad_table' using errcode = 'P0001';
  end if;

  v_where := case p_table
    when 'companies'          then 'id = $1'
    when 'announcement_acks'  then 'announcement_id in (select a.id from public.announcements a where a.company_id = $1)'
    when 'event_participants' then 'event_id in (select e.id from public.events e where e.company_id = $1)'
    else 'company_id = $1'
  end;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb)
       from (select * from public.%I where %s order by ctid offset $2 limit $3) t',
    p_table, v_where)
    into v_rows
    using v_company, greatest(coalesce(p_offset, 0), 0), least(greatest(coalesce(p_limit, 500), 1), 1000);

  return v_rows;
end;
$fn$;

-- A note's recording is as private as the note (D-75): its file stays out with it
create function public.ops_export_files(p_export uuid, p_offset int, p_limit int) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_company uuid := ops.export_company(p_export);
  v_files   jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('bucket', f.bucket_id, 'name', f.name, 'bytes', f.bytes)
                            order by f.bucket_id, f.name), '[]'::jsonb)
    into v_files
    from (
      select o.bucket_id, o.name, coalesce((o.metadata ->> 'size')::bigint, 0) as bytes
        from storage.objects o
       where o.name like v_company::text || '/%'
         and not exists (select 1 from notes n where n.company_id = v_company and n.audio_path = o.name)
       order by o.bucket_id, o.name
      offset greatest(coalesce(p_offset, 0), 0)
       limit least(greatest(coalesce(p_limit, 50), 1), 1000)
    ) f;

  return v_files;
end;
$fn$;

-- A repeat of the same finish changes nothing and is no failure: the answer may have been lost
create function public.ops_export_finish(p_export uuid, p_sha256 text, p_counts jsonb) returns void
language plpgsql security definer set search_path = public
as $fn$
begin
  update ops.exports e
     set finished_at = now(), sha256 = p_sha256, counts = p_counts
   where e.id = p_export and e.finished_at is null and e.created_at > now() - interval '30 minutes';
  if not found and not exists (select 1 from ops.exports e where e.id = p_export and e.sha256 = p_sha256) then
    raise exception 'export_expired' using errcode = 'P0001';
  end if;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 10. service_role: the removal of files, no ticket: this is cleaning up after a done action
-- ---------------------------------------------------------------------------
create function public.ops_storage_next(p_limit int) returns jsonb
language sql stable security definer set search_path = public
as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'bucket', q.bucket, 'name', q.name) order by q.id), '[]'::jsonb)
    from (
      select * from ops.storage_queue x
       order by x.id
       limit least(greatest(coalesce(p_limit, 100), 1), 1000)
    ) q;
$fn$;

create function public.ops_storage_done(p_ids bigint[]) returns void
language sql security definer set search_path = public
as $fn$
  delete from ops.storage_queue q where q.id = any(p_ids);
$fn$;

-- p_company null: the whole queue
create function public.ops_storage_left(p_company uuid) returns int
language sql stable security definer set search_path = public
as $fn$
  select count(*)::int from ops.storage_queue q where p_company is null or q.company_id = p_company;
$fn$;

-- ---------------------------------------------------------------------------
-- 11. service_role: operators, for scripts/ops-grant.ts only
-- ---------------------------------------------------------------------------
create function public.ops_grant_operator(p_user uuid, p_note text) returns void
language plpgsql security definer set search_path = public
as $fn$
begin
  if not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  -- somebody of a company is never an operator: ops.assert would refuse him anyway
  if exists (select 1 from profiles p where p.id = p_user) then
    raise exception 'has_profile' using errcode = 'P0001';
  end if;

  insert into ops.operators (user_id, note)
  values (p_user, p_note)
  on conflict (user_id) do update
    set revoked_at = null,
        note       = coalesce(excluded.note, ops.operators.note);

  insert into ops.audit (action, target, reason)
  values ('grant_operator', jsonb_build_object('user_id', p_user),
          coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'scripts/ops-grant.ts'));
end;
$fn$;

create function public.ops_revoke_operator(p_user uuid) returns void
language plpgsql security definer set search_path = public
as $fn$
declare
  v_sessions int;
begin
  update ops.operators o set revoked_at = now() where o.user_id = p_user and o.revoked_at is null;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  delete from auth.sessions s where s.user_id = p_user;
  get diagnostics v_sessions = row_count;

  insert into ops.audit (action, target, reason, result)
  values ('revoke_operator', jsonb_build_object('user_id', p_user), 'scripts/ops-grant.ts',
          jsonb_build_object('sessions', v_sessions));
end;
$fn$;

-- ---------------------------------------------------------------------------
-- 12. Exact grants: the default ACL of public hands every function to anon, authenticated and
--     service_role; supabase/tests/052 compares the result with its own list
-- ---------------------------------------------------------------------------
do $$
declare
  v_fn regprocedure;
begin
  for v_fn in
    select p.oid::regprocedure
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'ops' or (n.nspname = 'public' and p.proname like 'ops\_%')
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_fn);
  end loop;
end;
$$;

grant execute on function public.ops_login_state() to authenticated;
grant execute on function public.ops_ticket(text, uuid, jsonb, text, uuid) to authenticated;
grant execute on function public.ops_companies() to authenticated;
grant execute on function public.ops_company_card(uuid) to authenticated;
grant execute on function public.ops_company_footprint(uuid) to authenticated;
grant execute on function public.ops_audit_list(bigint, int, uuid) to authenticated;
grant execute on function public.ops_operators() to authenticated;

grant execute on function public.ops_slug_free(text) to service_role;
grant execute on function public.ops_prepare_company(uuid) to service_role;
grant execute on function public.ops_create_company(uuid, jsonb) to service_role;
grant execute on function public.ops_log_action(uuid, text, uuid, jsonb) to service_role;
grant execute on function public.ops_add_person(uuid, uuid, uuid, text, text, text, text[]) to service_role;
grant execute on function public.ops_update_company(uuid, uuid, text, text, jsonb) to service_role;
grant execute on function public.ops_update_person(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.ops_revoke_sessions(uuid, uuid, uuid) to service_role;
grant execute on function public.ops_adjust_points(uuid, uuid, uuid, int, text) to service_role;
grant execute on function public.ops_change_director(uuid, uuid, uuid, uuid, text) to service_role;
grant execute on function public.ops_task_get(uuid, uuid, uuid) to service_role;
grant execute on function public.ops_update_task(uuid, uuid, uuid, jsonb) to service_role;
grant execute on function public.ops_delete_task(uuid, uuid, uuid) to service_role;
grant execute on function public.ops_wipe_activity(uuid, uuid, text) to service_role;
grant execute on function public.ops_purge_company(uuid, uuid, text) to service_role;
grant execute on function public.ops_export_begin(uuid, uuid) to service_role;
grant execute on function public.ops_export_page(uuid, text, int, int) to service_role;
grant execute on function public.ops_export_files(uuid, int, int) to service_role;
grant execute on function public.ops_export_finish(uuid, text, jsonb) to service_role;
grant execute on function public.ops_storage_next(int) to service_role;
grant execute on function public.ops_storage_done(bigint[]) to service_role;
grant execute on function public.ops_storage_left(uuid) to service_role;
grant execute on function public.ops_grant_operator(uuid, text) to service_role;
grant execute on function public.ops_revoke_operator(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 13. A code issued from the console has no issuer inside the company: the journal says who
-- ---------------------------------------------------------------------------
alter table login_codes alter column issued_by drop not null;

create or replace function public.issue_login_code(p_user_id uuid, p_issued_by uuid, p_code_hash text, p_ttl_seconds integer default 900, p_request_id uuid default null::uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_company uuid;
  v_active  boolean;
  v_id      uuid;
  v_expires timestamptz;
begin
  if p_request_id is not null and exists (select 1 from login_codes where issue_request_id = p_request_id) then
    raise exception 'duplicate' using errcode = 'P0001';
  end if;

  select company_id, is_active into v_company, v_active from profiles where id = p_user_id;
  if v_company is null
     or (p_issued_by is not null
         and not exists (select 1 from profiles where id = p_issued_by and company_id = v_company and is_active)) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not v_active then
    raise exception 'inactive' using errcode = 'P0001';
  end if;
  if p_ttl_seconds < 60 or p_ttl_seconds > 86400 then
    raise exception 'bad_ttl' using errcode = 'P0001';
  end if;

  -- issuing is rare and human: the place to forget old rows
  delete from login_attempts where at < now() - interval '1 day';
  delete from login_codes where issued_at < now() - interval '30 days';

  -- an expired open code still holds its hash in the unique index
  update login_codes set cancelled_at = now()
   where used_at is null and cancelled_at is null and expires_at <= now()
     and (code_hash = p_code_hash or user_id = p_user_id);

  if (select count(*) from login_codes
       where company_id = v_company and used_at is null and cancelled_at is null
         and expires_at > now() and user_id <> p_user_id) >= 30 then
    raise exception 'too_many_codes' using errcode = 'P0001';
  end if;

  update login_codes set cancelled_at = now()
   where user_id = p_user_id and used_at is null and cancelled_at is null;

  begin
    insert into login_codes (company_id, user_id, issued_by, code_hash, expires_at, issue_request_id)
    values (v_company, p_user_id, p_issued_by, p_code_hash, now() + make_interval(secs => p_ttl_seconds), p_request_id)
    returning id, expires_at into v_id, v_expires;
  exception when unique_violation then
    raise exception 'collision' using errcode = 'P0001';
  end;

  return json_build_object('id', v_id, 'expires_at', v_expires);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 14. Quiet: a row born inside a console's action is put out the way `muted` is
-- ---------------------------------------------------------------------------
create or replace function public.notification_deliveries_deliver_after()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role    text;
  v_prefs   jsonb;
  v_mode    text := 'now';
  v_vip     boolean := false;
  v_until   timestamptz;
  v_now     timestamptz := now();
  -- computed first, applied at the end: a broken rule leaves the row as it was
  r_mode    text := 'now';
  r_held    text;
  r_after   timestamptz;
  r_silent  boolean := false;
  r_private boolean := false;
  r_muted   boolean := false;
begin
  new.category := delivery_category(new.event_kind, new.meta);

  -- tasks/029: ops.take set this for the transaction, a service edit pushes nobody
  if current_setting('pulse.ops_quiet', true) = '1' then
    new.status := 'failed';
    new.attempts := 3;
    new.last_error := 'muted';
    return new;
  end if;

  select p.role::text into v_role from profiles p where p.id = new.user_id;

  if v_role is distinct from 'director' then
    -- the fixed policy (D-114): what reaches an employee, a secretary or a shopkeeper and can
    -- wait, waits for the company window; a task whose moment the producer already decided
    -- (batch / «отправить сейчас» / scheduled reassign), a reminder, a request to the
    -- secretary do not
    if new.event_kind in ('reply', 'rework', 'done', 'revoked', 'deadline_extended', 'announcement',
                          'shop_order', 'shop_approved', 'shop_ready', 'shop_cancelled',
                          'event_invite', 'event_moved', 'event_cancelled',
                          'reaction', 'points_answer') then
      new.deliver_after := greatest(new.deliver_after, coalesce(next_delivery_slot(new.company_id, v_now), v_now));
    end if;
    -- a message to somebody who is not the task's author is a message to an employee
    if new.event_kind = 'message' and exists (
         select 1 from tasks t where t.id = new.task_id and t.author_id <> new.user_id
       ) then
      new.deliver_after := greatest(new.deliver_after, coalesce(next_delivery_slot(new.company_id, v_now), v_now));
    end if;
    return new;
  end if;

  -- the director: the alarm and the product's own pushes are never tuned away
  if new.category in ('alarm', 'system') then
    return new;
  end if;

  begin
    v_prefs := notify_prefs_of(new.user_id);
    if new.category not in ('reminders', 'tasks') then
      v_mode := coalesce(v_prefs -> 'modes' ->> new.category, 'now');
      if v_mode not in ('now', 'quiet', 'digest', 'off') then
        v_mode := 'now';
      end if;
    end if;

    if v_mode = 'off' then
      r_muted := true;
    else
      if new.task_id is not null then
        select exists (
          select 1 from tasks t
           where t.id = new.task_id and t.assignee_id is not null
             and (v_prefs -> 'vip') ? t.assignee_id::text
        ) into v_vip;
      end if;
      -- an important person's news is never quiet and never waits for the digest
      if v_vip and v_mode in ('quiet', 'digest') then
        v_mode := 'now';
      end if;
      r_silent := v_mode = 'quiet';
      r_private := v_prefs ->> 'lock_text' = 'short';

      v_until := director_quiet_until(v_prefs, v_now);
      if v_until is not null and not (
           (new.category = 'reminders' and coalesce(v_prefs -> 'pass' ->> 'reminders', 'true') = 'true')
        or (new.event_kind = 'visit_arrived' and coalesce(v_prefs -> 'pass' ->> 'visitors', 'true') = 'true')
        or (v_vip and v_prefs -> 'pass' ->> 'vip' = 'true')
      ) then
        r_mode := 'digest';
        r_held := 'quiet';
        r_after := v_until;
      elsif v_prefs ->> 'meetings' = 'true'
            and not (new.category = 'reminders' or new.event_kind in ('event_reminder', 'visit_arrived') or v_vip)
            and director_meeting_until(new.user_id, v_now) is not null then
        r_mode := 'digest';
        r_held := 'meeting';
        r_after := director_meeting_until(new.user_id, v_now);
      elsif v_mode = 'digest' then
        r_mode := 'digest';
        r_held := 'schedule';
        r_after := director_digest_slot(v_prefs, v_now);
      end if;
    end if;
  exception when others then
    -- never let a rule break the producer's transaction: the row goes as before
    r_mode := 'now'; r_held := null; r_after := null; r_silent := false; r_private := false; r_muted := false;
  end;

  if r_muted then
    new.status := 'failed';
    new.attempts := 3;
    new.last_error := 'muted';
    return new;
  end if;
  new.mode := r_mode;
  new.held := r_held;
  new.silent := r_silent;
  new.private := r_private;
  if r_after is not null then
    new.deliver_after := greatest(new.deliver_after, r_after);
  end if;
  return new;
end
$function$;

-- ---------------------------------------------------------------------------
-- 15. The indexes a company's removal needs: foreign keys with no index behind them turn every
--     delete from the parent into a scan. No cascades are added: the order above stays visible.
-- ---------------------------------------------------------------------------
create index if not exists errands_company_id_idx on errands (company_id);
create index if not exists events_company_id_idx on events (company_id);
create index if not exists login_codes_company_id_idx on login_codes (company_id);
create index if not exists mind_boards_company_id_idx on mind_boards (company_id);
create index if not exists notes_company_id_idx on notes (company_id);
create index if not exists notification_deliveries_company_id_idx on notification_deliveries (company_id);
create index if not exists notification_prefs_company_id_idx on notification_prefs (company_id);
create index if not exists push_subscriptions_company_id_idx on push_subscriptions (company_id);
create index if not exists reminders_company_id_idx on reminders (company_id);
create index if not exists task_reads_company_id_idx on task_reads (company_id);
create index if not exists visits_company_id_idx on visits (company_id);
create index if not exists voice_kept_company_id_idx on voice_kept (company_id);

create index if not exists ai_logs_user_id_idx on ai_logs (user_id);
create index if not exists announcement_acks_user_id_idx on announcement_acks (user_id);
create index if not exists announcements_author_id_idx on announcements (author_id);
create index if not exists errands_claimed_by_idx on errands (claimed_by);
create index if not exists events_author_id_idx on events (author_id);
create index if not exists inbox_items_user_id_idx on inbox_items (user_id);
create index if not exists ingest_batches_user_id_idx on ingest_batches (user_id);
create index if not exists mind_boards_user_id_idx on mind_boards (user_id);
create index if not exists notes_user_id_idx on notes (user_id);
create index if not exists orders_user_id_idx on orders (user_id);
create index if not exists point_transactions_actor_id_idx on point_transactions (actor_id);
create index if not exists point_transactions_user_id_idx on point_transactions (user_id);
create index if not exists profiles_manager_id_idx on profiles (manager_id);
create index if not exists recurrence_rules_assignee_id_idx on recurrence_rules (assignee_id);
create index if not exists recurrence_rules_author_id_idx on recurrence_rules (author_id);
create index if not exists reminders_user_id_idx on reminders (user_id);
create index if not exists task_reads_user_id_idx on task_reads (user_id);
create index if not exists tasks_assignee_id_idx on tasks (assignee_id);
create index if not exists tasks_passed_to_idx on tasks (passed_to);
create index if not exists tv_events_actor_id_idx on tv_events (actor_id);
create index if not exists tv_state_employee_id_idx on tv_state (employee_id);
create index if not exists tv_state_updated_by_idx on tv_state (updated_by);
create index if not exists visits_answered_by_idx on visits (answered_by);
create index if not exists visits_author_id_idx on visits (author_id);
create index if not exists voice_kept_kept_by_idx on voice_kept (kept_by);
