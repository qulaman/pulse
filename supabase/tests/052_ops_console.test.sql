-- tasks/029 (D-157): the developers' console. Who passes ops.assert and who does not, what a ticket
-- is worth, the exact grants of every ops_* function, the journal nobody can change, quiet edits, the
-- change of director, the wipe and the purge of company A with company B untouched.
-- The whole file is one transaction: now() stands still, so ages are made by moving timestamps.
-- Fixtures are this file's own (two companies, sessions, claims): dev data never leans in.
begin;
select plan(238);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function pg_temp.u(n int) returns uuid language sql immutable as $$
  select ('05200000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid
$$;
create function pg_temp.a() returns uuid language sql immutable as $$ select '05200000-0000-0000-0000-00000000000a'::uuid $$;
create function pg_temp.b() returns uuid language sql immutable as $$ select '05200000-0000-0000-0000-00000000000b'::uuid $$;

-- A ticket from the good operator, called as service role: under his JWT and back again
create function pg_temp.ticket(p_action text, p_company uuid, p_crid uuid default gen_random_uuid())
returns uuid language plpgsql as $$
declare
  v_answer jsonb;
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', pg_temp.u(21), 'role', 'authenticated', 'session_id', pg_temp.u(241))::text, true);
  v_answer := ops_ticket(p_action, p_company, jsonb_build_object('pgtap', true), 'pgtap-052 причина', p_crid);
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  return (v_answer ->> 'ticket')::uuid;
end;
$$;

-- One row in every table a company owns. Ties the foreign keys the wipe and the purge must undo.
create function pg_temp.fill(p_company uuid, p_boss uuid, p_worker uuid, p_tag text) returns void
language plpgsql as $$
declare
  v_task   uuid;
  v_tx     uuid;
  v_item   uuid;
  v_order  uuid;
  v_ann    uuid;
  v_event  uuid;
  v_board  uuid;
  v_point  uuid;
  v_report uuid;
  v_path   text := p_company || '/' || p_boss || '/' || p_tag;
begin
  insert into tasks (company_id, author_id, assignee_id, title, status, source_audio_path)
  values (p_company, p_boss, p_worker, 'pgtap-052 дело', 'accepted', v_path || '-voice.webm')
  returning id into v_task;
  insert into tasks (company_id, author_id, assignee_id, title, status, parent_task_id)
  values (p_company, p_boss, p_worker, 'pgtap-052 подзадача', 'sent', v_task);
  insert into task_messages (company_id, task_id, sender_id, type, content)
  values (p_company, v_task, p_worker, 'text', 'pgtap-052');
  insert into task_reactions (task_id, author_id, company_id, code) values (v_task, p_boss, p_company, 'like');
  insert into task_reads (task_id, user_id, company_id) values (v_task, p_boss, p_company);

  insert into announcements (company_id, author_id, transcript)
  values (p_company, p_boss, 'pgtap-052 объявление') returning id into v_ann;
  insert into announcement_acks (announcement_id, user_id) values (v_ann, p_worker);

  insert into events (company_id, author_id, title, starts_at)
  values (p_company, p_boss, 'pgtap-052 встреча', now() + interval '3 days') returning id into v_event;
  insert into event_participants (event_id, user_id) values (v_event, p_worker);

  insert into mind_boards (company_id, user_id, title) values (p_company, p_boss, 'pgtap-052 доска') returning id into v_board;
  insert into notes (company_id, user_id, text, board_id, position)
  values (p_company, p_boss, 'pgtap-052 пункт', v_board, 1) returning id into v_point;
  insert into notes (company_id, user_id, text, board_id, position, parent_id)
  values (p_company, p_boss, 'pgtap-052 ветка', v_board, 1, v_point);
  insert into notes (company_id, user_id, text, audio_path)
  values (p_company, p_boss, 'pgtap-052 мысль', v_path || '-note.webm');

  insert into shop_items (company_id, title, price, stock) values (p_company, 'pgtap-052 товар', 10, 5) returning id into v_item;
  insert into orders (company_id, user_id, item_id, price, stock_reserved)
  values (p_company, p_worker, v_item, 10, true) returning id into v_order;

  insert into daily_reports (company_id, user_id, report_date, status)
  values (p_company, p_worker, current_date, 'missed') returning id into v_report;

  insert into point_transactions (company_id, user_id, amount, reason, source)
  values (p_company, p_worker, 50, 'pgtap-052 похвала', 'manual') returning id into v_tx;
  insert into point_transactions (company_id, user_id, amount, reason, source, order_id)
  values (p_company, p_worker, -10, 'pgtap-052 заказ', 'shop_hold', v_order);
  insert into point_transactions (company_id, user_id, amount, reason, source, rule_code, daily_report_id)
  values (p_company, p_worker, -1, 'pgtap-052 отчёт', 'auto_rule', 'report_missed', v_report);
  insert into point_disputes (company_id, transaction_id, user_id, text) values (p_company, v_tx, p_worker, 'pgtap-052 спор');
  insert into ether_events (company_id, kind, user_id, title, order_id, transaction_id)
  values (p_company, 'merch', p_worker, 'pgtap-052 эфир', v_order, v_tx);

  insert into errands (company_id, author_id, kind, label) values (p_company, p_boss, 'coffee', 'pgtap-052 кофе');
  insert into visits (company_id, author_id) values (p_company, p_worker);
  insert into recurrence_rules (company_id, author_id, assignee_id, target, title, every)
  values (p_company, p_boss, p_worker, 'task', 'pgtap-052 каждый день', 'day');
  insert into inbox_items (company_id, user_id, status) values (p_company, p_boss, 'parsed');
  insert into ingest_batches (company_id, user_id, client_request_id) values (p_company, p_boss, gen_random_uuid());
  insert into ai_logs (company_id, user_id, kind, provider, model, status, input_tokens, output_tokens)
  values (p_company, p_boss, 'parse', 'deepseek', 'deepseek-chat', 'error:parse_failed', 100, 10);
  insert into reminders (company_id, user_id, text) values (p_company, p_boss, 'pgtap-052 напомнить');
  insert into tv_events (company_id, kind, task_id) values (p_company, 'task_sent', v_task);

  insert into notification_prefs (user_id, company_id) values (p_boss, p_company) on conflict do nothing;
  insert into push_subscriptions (company_id, user_id, endpoint, p256dh, auth)
  values (p_company, p_worker, 'https://push.invalid/' || p_tag || '/' || p_company, 'k', 'a');
  insert into login_codes (company_id, user_id, issued_by, code_hash, expires_at)
  values (p_company, p_worker, p_boss, 'pgtap-052-' || p_tag || p_company, now() + interval '10 minutes');
  insert into voice_kept (path, company_id, kept_by) values (v_path || '-kept.webm', p_company, p_boss);

  insert into tv_state (company_id, mode, employee_id, task_id, scene, guest, guest_until, board_id, board_until,
                        board_point, week_board_id, week_board_until, updated_by)
  values (p_company, 'task', p_worker, v_task, 'board', true, now() + interval '1 hour', v_board, now() + interval '1 hour',
          v_point, v_board, now() + interval '1 hour', p_boss)
  on conflict (company_id) do update
    set mode = 'task', employee_id = p_worker, task_id = v_task, scene = 'board', guest = true,
        guest_until = now() + interval '1 hour', board_id = v_board, board_until = now() + interval '1 hour',
        board_point = v_point, week_board_id = v_board, week_board_until = now() + interval '1 hour';

  insert into storage.objects (bucket_id, name, metadata) values
    ('voice', v_path || '-voice.webm', '{"size": 100}'),
    ('voice', v_path || '-note.webm', '{"size": 100}'),
    ('voice', v_path || '-kept.webm', '{"size": 100}'),
    ('photos', v_path || '-photo.jpg', '{"size": 200}'),
    ('brand', p_company || '/logo-' || p_tag || '.png', '{"size": 300}'),
    ('avatars', p_company || '/' || p_tag || '-face.jpg', '{"size": 50}');
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: company A and company B; operators outside both
-- ---------------------------------------------------------------------------
insert into companies (id, name, slug, settings) values
  (pg_temp.a(), 'pgtap-052 A', 'pgtap-052-a', '{"points_enabled": true, "parser": {"model": "deepseek-chat"}}'),
  (pg_temp.b(), 'pgtap-052 B', 'pgtap-052-b', '{}');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000', pg_temp.u(x.n), 'authenticated', 'authenticated', x.email, now(), now(),
       '', '', '', '', '', '', '', ''
  from (values
    (1,  'pgtap-052-director-a@demo.local'),
    (2,  'p-052-employee-a@people.invalid'),
    (3,  'pgtap-052-secretary-a@demo.local'),
    (4,  'pgtap-052-kiosk-a@demo.local'),
    (5,  'pgtap-052-inactive-a@demo.local'),
    (11, 'pgtap-052-director-b@demo.local'),
    (12, 'pgtap-052-employee-b@demo.local'),
    (21, 'pgtap-052-operator@demo.local'),
    (22, 'pgtap-052-operator-revoked@demo.local'),
    (23, 'pgtap-052-operator-with-profile@demo.local'),
    (24, 'pgtap-052-operator-second@demo.local'),
    (25, 'pgtap-052-stranger@demo.local')
  ) as x(n, email);

insert into profiles (id, company_id, full_name, role, is_active, manager_id, streak_count, streak_updated_at) values
  (pg_temp.u(1),  pg_temp.a(), 'pgtap-052 Директор A', 'director', true, null, 0, null),
  (pg_temp.u(2),  pg_temp.a(), 'pgtap-052 Сотрудник A', 'employee', true, pg_temp.u(1), 5, now()),
  (pg_temp.u(3),  pg_temp.a(), 'pgtap-052 Секретарь A', 'secretary', true, pg_temp.u(1), 0, null),
  (pg_temp.u(4),  pg_temp.a(), 'TV Kiosk', 'tv', true, null, 0, null),
  (pg_temp.u(5),  pg_temp.a(), 'pgtap-052 Ушедший A', 'employee', false, null, 0, null),
  (pg_temp.u(11), pg_temp.b(), 'pgtap-052 Директор B', 'director', true, null, 0, null),
  (pg_temp.u(12), pg_temp.b(), 'pgtap-052 Сотрудник B', 'employee', true, pg_temp.u(11), 0, null),
  (pg_temp.u(23), pg_temp.b(), 'pgtap-052 С профилем', 'employee', true, null, 0, null);

insert into ops.operators (user_id, note, revoked_at) values
  (pg_temp.u(21), 'pgtap-052 good', null),
  (pg_temp.u(22), 'pgtap-052 revoked', now() - interval '1 day'),
  (pg_temp.u(23), 'pgtap-052 has a profile', null),
  (pg_temp.u(24), 'pgtap-052 second', null);

-- sessions of the good operator: 241 fresh; 242 aal1; 243 ten minutes old; 244 thirteen hours old; 245 over
insert into auth.sessions (id, user_id, created_at, updated_at, aal, not_after) values
  (pg_temp.u(241), pg_temp.u(21), now(), now(), 'aal2', null),
  (pg_temp.u(242), pg_temp.u(21), now(), now(), 'aal1', null),
  (pg_temp.u(243), pg_temp.u(21), now(), now(), 'aal2', null),
  (pg_temp.u(244), pg_temp.u(21), now(), now(), 'aal2', null),
  (pg_temp.u(245), pg_temp.u(21), now(), now(), 'aal2', now() - interval '1 minute'),
  (pg_temp.u(246), pg_temp.u(22), now(), now(), 'aal2', null),
  (pg_temp.u(247), pg_temp.u(23), now(), now(), 'aal2', null),
  (pg_temp.u(248), pg_temp.u(24), now(), now(), 'aal2', null),
  (pg_temp.u(249), pg_temp.u(1),  now(), now(), 'aal1', null);

insert into auth.mfa_amr_claims (id, session_id, created_at, updated_at, authentication_method) values
  (gen_random_uuid(), pg_temp.u(241), now(), now(), 'totp'),
  (gen_random_uuid(), pg_temp.u(242), now(), now(), 'password'),
  (gen_random_uuid(), pg_temp.u(243), now() - interval '2 hours', now() - interval '10 minutes', 'totp'),
  (gen_random_uuid(), pg_temp.u(244), now() - interval '13 hours', now() - interval '13 hours', 'totp'),
  (gen_random_uuid(), pg_temp.u(244), now(), now(), 'password'),
  (gen_random_uuid(), pg_temp.u(245), now(), now(), 'totp'),
  (gen_random_uuid(), pg_temp.u(246), now(), now(), 'totp'),
  (gen_random_uuid(), pg_temp.u(247), now(), now(), 'totp'),
  (gen_random_uuid(), pg_temp.u(248), now(), now(), 'totp');

select pg_temp.fill(pg_temp.a(), pg_temp.u(1), pg_temp.u(2), 'one');
select pg_temp.fill(pg_temp.b(), pg_temp.u(11), pg_temp.u(12), 'b');

create temp table t_b_counts on commit drop as select ops.table_counts(pg_temp.b()) as counts;
create temp table t_b_files on commit drop as
  select name from storage.objects where name like pg_temp.b()::text || '/%';
grant all on t_b_counts, t_b_files to public;

-- ---------------------------------------------------------------------------
-- 1. Grants, by the catalog: a new ops_* without a line here fails this test
-- ---------------------------------------------------------------------------
create temp table t_grants (fn text primary key, grantees text) on commit drop;
insert into t_grants values
  ('ops_login_state', 'authenticated'),
  ('ops_ticket', 'authenticated'),
  ('ops_companies', 'authenticated'),
  ('ops_company_card', 'authenticated'),
  ('ops_company_footprint', 'authenticated'),
  ('ops_audit_list', 'authenticated'),
  ('ops_operators', 'authenticated'),
  ('ops_slug_free', 'service_role'),
  ('ops_prepare_company', 'service_role'),
  ('ops_create_company', 'service_role'),
  ('ops_log_action', 'service_role'),
  ('ops_add_person', 'service_role'),
  ('ops_update_company', 'service_role'),
  ('ops_update_person', 'service_role'),
  ('ops_revoke_sessions', 'service_role'),
  ('ops_adjust_points', 'service_role'),
  ('ops_change_director', 'service_role'),
  ('ops_task_get', 'service_role'),
  ('ops_update_task', 'service_role'),
  ('ops_delete_task', 'service_role'),
  ('ops_wipe_activity', 'service_role'),
  ('ops_purge_company', 'service_role'),
  ('ops_export_begin', 'service_role'),
  ('ops_export_page', 'service_role'),
  ('ops_export_files', 'service_role'),
  ('ops_export_finish', 'service_role'),
  ('ops_storage_next', 'service_role'),
  ('ops_storage_done', 'service_role'),
  ('ops_storage_left', 'service_role'),
  ('ops_grant_operator', 'service_role'),
  ('ops_revoke_operator', 'service_role');

select is_empty(
  $$with actual as (
      select p.proname::text as fn,
             (select coalesce(string_agg(case g.grantee when 0 then 'PUBLIC' else g.grantee::regrole::text end, ','
                                         order by case g.grantee when 0 then 'PUBLIC' else g.grantee::regrole::text end), '')
                from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) g
               where g.grantee <> p.proowner) as grantees
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname like 'ops\_%'
    )
    select coalesce(a.fn, t.fn), a.grantees, t.grantees
      from actual a full join t_grants t on t.fn = a.fn
     where a.grantees is distinct from t.grantees$$,
  'every public.ops_* carries exactly the grants of this list, and every name on it exists'
);

select is_empty(
  $$select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'ops\_%'
       and (not p.prosecdef or not exists (select 1 from unnest(p.proconfig) c where c like 'search\_path=%'))$$,
  'every public.ops_* is security definer with a search_path'
);

select is_empty(
  $$select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'ops'
       and (exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) g where g.grantee <> p.proowner)
            or (p.proname <> 'audit_frozen' and not p.prosecdef))$$,
  'every ops.* belongs to its owner alone'
);

select is_empty(
  $$select t.fn from t_grants t join pg_proc p on p.proname = t.fn
     where t.grantees = 'authenticated' and t.fn <> 'ops_login_state'
       and p.prosrc !~ 'ops\.assert\(43200\)'$$,
  'every reading function starts from ops.assert'
);

select is_empty(
  $$select t.fn from t_grants t join pg_proc p on p.proname = t.fn
     where t.grantees = 'service_role'
       and t.fn not in ('ops_slug_free', 'ops_prepare_company', 'ops_export_page', 'ops_export_files', 'ops_export_finish',
                        'ops_storage_next', 'ops_storage_done', 'ops_storage_left', 'ops_grant_operator', 'ops_revoke_operator')
       and (p.prosrc !~ 'ops\.take\(' or p.prosrc !~ 'ops\.log\(')$$,
  'every writing function takes a ticket and leaves a journal row'
);

select ok(not has_schema_privilege('authenticated', 'ops', 'usage')
          and not has_schema_privilege('anon', 'ops', 'usage')
          and not has_schema_privilege('service_role', 'ops', 'usage'),
          'the ops schema is closed to all three API roles');

select is_empty(
  $$select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'ops' and c.relkind = 'r'
       and (not c.relrowsecurity
            or exists (select 1 from pg_policy p where p.polrelid = c.oid)
            or exists (select 1 from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) g where g.grantee <> c.relowner))$$,
  'ops tables: RLS on, no policies, no grants'
);

select is_empty(
  $$select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and not (c.relname = any(ops.export_tables()))
       and c.relname not in ('notes', 'mind_boards', 'login_codes', 'login_attempts', 'push_subscriptions', 'notification_deliveries')$$,
  'every public table is on the export''s white list or named as left out'
);

select is_empty(
  $$select c.conrelid::regclass::text, a.attname
      from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and n.nspname = 'public'
       and c.confrelid in ('public.companies'::regclass, 'public.profiles'::regclass)
       and not exists (select 1 from pg_index i
                        where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1] and i.indpred is null)$$,
  'every foreign key to companies and profiles has an index behind it'
);

-- ---------------------------------------------------------------------------
-- 2. Who passes ops.assert
-- ---------------------------------------------------------------------------
set local role authenticated;

set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok($$select ops_companies()$$, 'P0001', 'ops_denied', 'no user in the token — denied');

set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000021","role":"authenticated"}';
select throws_ok($$select ops_companies()$$, 'P0001', 'ops_denied', 'no session in the token — denied');

set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000021","role":"authenticated","session_id":"05200000-0000-0000-0000-000000000242"}';
select throws_ok($$select ops_companies()$$, 'P0001', 'ops_denied', 'an operator at aal1 — denied');
select throws_ok($$select ops_company_card(pg_temp.a())$$, 'P0001', 'ops_denied', 'aal1: the card — denied');
select throws_ok($$select ops_company_footprint(pg_temp.a())$$, 'P0001', 'ops_denied', 'aal1: the footprint — denied');
select throws_ok($$select ops_audit_list(null, 10, null)$$, 'P0001', 'ops_denied', 'aal1: the journal — denied');
select throws_ok($$select ops_operators()$$, 'P0001', 'ops_denied', 'aal1: the operators — denied');
select throws_ok($$select ops_ticket('update_company', pg_temp.a(), '{}', 'причина длинная', gen_random_uuid())$$,
                 'P0001', 'ops_denied', 'aal1: a ticket — denied');
select is(ops_login_state(), '{"operator": true}'::jsonb, 'ops_login_state answers an operator even at aal1');

set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000021","role":"authenticated","session_id":"05200000-0000-0000-0000-000000000245"}';
select throws_ok($$select ops_companies()$$, 'P0001', 'ops_denied', 'a session past not_after — denied');

set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000021","role":"authenticated","session_id":"05200000-0000-0000-0000-000000000244"}';
select throws_ok($$select ops_companies()$$, 'P0001', 'ops_fresh_required', 'the last code thirteen hours ago — ask it again');

set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000021","role":"authenticated","session_id":"05200000-0000-0000-0000-000000000248"}';
select throws_ok($$select ops_companies()$$, 'P0001', 'ops_denied', 'a session of somebody else — denied');

set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000022","role":"authenticated","session_id":"05200000-0000-0000-0000-000000000246"}';
select throws_ok($$select ops_companies()$$, 'P0001', 'ops_denied', 'a revoked operator — denied');
select throws_ok($$select ops_ticket('update_company', pg_temp.a(), '{}', 'причина длинная', gen_random_uuid())$$,
                 'P0001', 'ops_denied', 'a revoked operator gets no ticket');
select is(ops_login_state(), '{"operator": false}'::jsonb, 'ops_login_state: a revoked operator is none');

set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000023","role":"authenticated","session_id":"05200000-0000-0000-0000-000000000247"}';
select throws_ok($$select ops_companies()$$, 'P0001', 'ops_denied', 'an operator with a profile — denied');
select is(ops_login_state(), '{"operator": false}'::jsonb, 'ops_login_state: a person of a company is none');

set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000001","role":"authenticated","session_id":"05200000-0000-0000-0000-000000000249"}';
select throws_ok($$select ops_companies()$$, 'P0001', 'ops_denied', 'a director of a company — denied');
select throws_ok($$select ops_ticket('wipe_activity', pg_temp.a(), '{}', 'причина длинная', gen_random_uuid())$$,
                 'P0001', 'ops_denied', 'a director gets no ticket');

-- the writing side is out of reach of a signed-in person, operator or not
set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000021","role":"authenticated","session_id":"05200000-0000-0000-0000-000000000241"}';
select throws_ok($$select ops_wipe_activity(gen_random_uuid(), pg_temp.a(), 'x')$$, '42501', null, 'authenticated cannot call a writing function');
select throws_ok($$select ops_storage_next(1)$$, '42501', null, 'authenticated cannot call the file queue');
select throws_ok($$select * from ops.audit$$, '42501', null, 'authenticated cannot read the journal directly');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$select ops_ticket('wipe_activity', null, '{}', 'причина длинная', gen_random_uuid())$$, '42501', null, 'anon cannot ask a ticket');
select throws_ok($$select ops_login_state()$$, '42501', null, 'anon cannot ask the state');

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select throws_ok($$select ops_companies()$$, '42501', null, 'the service role has no reading function: they are for a session');
select throws_ok($$select * from ops.tickets$$, '42501', null, 'the service role cannot read tickets directly');

-- a made-up ticket opens nothing
select throws_ok($$select ops_create_company(gen_random_uuid(), '{}')$$, 'P0001', 'ops_bad_ticket', 'ops_create_company wants a ticket');
select throws_ok($$select ops_log_action(gen_random_uuid(), 'issue_login_code', pg_temp.a(), '{}')$$, 'P0001', 'ops_bad_ticket', 'ops_log_action wants a ticket');
select throws_ok($$select ops_add_person(gen_random_uuid(), pg_temp.a(), pg_temp.u(25), 'Имя', 'employee', null, '{}')$$, 'P0001', 'ops_bad_ticket', 'ops_add_person wants a ticket');
select throws_ok($$select ops_update_company(gen_random_uuid(), pg_temp.a(), 'x', null, null)$$, 'P0001', 'ops_bad_ticket', 'ops_update_company wants a ticket');
select throws_ok($$select ops_update_person(gen_random_uuid(), pg_temp.a(), pg_temp.u(2), '{}')$$, 'P0001', 'ops_bad_ticket', 'ops_update_person wants a ticket');
select throws_ok($$select ops_revoke_sessions(gen_random_uuid(), pg_temp.a(), pg_temp.u(2))$$, 'P0001', 'ops_bad_ticket', 'ops_revoke_sessions wants a ticket');
select throws_ok($$select ops_adjust_points(gen_random_uuid(), pg_temp.a(), pg_temp.u(2), 5, 'причина')$$, 'P0001', 'ops_bad_ticket', 'ops_adjust_points wants a ticket');
select throws_ok($$select ops_change_director(gen_random_uuid(), pg_temp.a(), pg_temp.u(1), pg_temp.u(2), 'keep')$$, 'P0001', 'ops_bad_ticket', 'ops_change_director wants a ticket');
select throws_ok($$select ops_task_get(gen_random_uuid(), null, gen_random_uuid())$$, 'P0001', 'ops_bad_ticket', 'ops_task_get wants a ticket');
select throws_ok($$select ops_update_task(gen_random_uuid(), pg_temp.a(), gen_random_uuid(), '{}')$$, 'P0001', 'ops_bad_ticket', 'ops_update_task wants a ticket');
select throws_ok($$select ops_delete_task(gen_random_uuid(), pg_temp.a(), gen_random_uuid())$$, 'P0001', 'ops_bad_ticket', 'ops_delete_task wants a ticket');
select throws_ok($$select ops_wipe_activity(gen_random_uuid(), pg_temp.a(), 'pgtap-052 A')$$, 'P0001', 'ops_bad_ticket', 'ops_wipe_activity wants a ticket');
select throws_ok($$select ops_purge_company(gen_random_uuid(), pg_temp.a(), 'pgtap-052 A')$$, 'P0001', 'ops_bad_ticket', 'ops_purge_company wants a ticket');
select throws_ok($$select ops_export_begin(gen_random_uuid(), pg_temp.a())$$, 'P0001', 'ops_bad_ticket', 'ops_export_begin wants a ticket');
select throws_ok($$select ops_prepare_company(gen_random_uuid())$$, 'P0001', 'ops_bad_ticket', 'ops_prepare_company wants a ticket');

-- ---------------------------------------------------------------------------
-- 3. What the good operator reads
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000021","role":"authenticated","session_id":"05200000-0000-0000-0000-000000000241"}';

select is((select r ->> 'people' from jsonb_array_elements(ops_companies()) r where r ->> 'id' = pg_temp.a()::text),
          '3', 'the registry counts the living people without the kiosk');
select is((select r ->> 'parse_errors_24h' from jsonb_array_elements(ops_companies()) r where r ->> 'id' = pg_temp.a()::text),
          '1', 'the registry shows a failed parse');
select is(ops_company_card(pg_temp.a()) -> 'settings' ->> 'parser_provider', 'deepseek', 'the card reads the provider off the model');
select is((select p ->> 'email' from jsonb_array_elements(ops_company_card(pg_temp.a()) -> 'people') p where p ->> 'id' = pg_temp.u(2)::text),
          null, 'the card: a service address is no email');
select is((select p ->> 'points' from jsonb_array_elements(ops_company_card(pg_temp.a()) -> 'people') p where p ->> 'id' = pg_temp.u(2)::text),
          '39', 'the card: points are the sum of the rows');
select is(ops_company_card(pg_temp.a()) -> 'spend_30d' -> 0 ->> 'input_tokens', '100', 'the card: the spend of 30 days');
select is(ops_company_footprint(pg_temp.a()) -> 'tables' ->> 'tasks', '2', 'the footprint counts the tasks');
select is(ops_company_footprint(pg_temp.a()) -> 'tables' ->> 'announcement_acks', '1', 'the footprint counts children through the parent');
select is(ops_company_footprint(pg_temp.a()) -> 'files' -> 'voice', '{"count": 3, "bytes": 300}'::jsonb, 'the footprint counts the files of a bucket');
select is(ops_company_footprint(pg_temp.a()) -> 'files' -> 'brand', '{"count": 2, "bytes": 350}'::jsonb, 'people''s photos count with the logo');
select is(ops_company_footprint(pg_temp.a()) ->> 'kept_files', '1', 'the footprint counts the files «в корпус»');
select throws_ok($$select ops_company_card('05200000-0000-0000-0000-0000000000ff')$$, 'P0001', 'not_found', 'no such company on the card');

-- ---------------------------------------------------------------------------
-- 4. Tickets
-- ---------------------------------------------------------------------------
select throws_ok($$select ops_ticket('update_company', pg_temp.a(), '{}', ' abc ', gen_random_uuid())$$,
                 'P0001', 'reason_required', 'a reason shorter than five characters — refused');
select throws_ok($$select ops_ticket('drop_everything', pg_temp.a(), '{}', 'причина длинная', gen_random_uuid())$$,
                 'P0001', 'unknown_action', 'an action outside OPS_ACTIONS — refused');

select is((select count(*)::int from unnest(array[
             'create_company', 'update_company', 'add_person', 'update_person', 'issue_login_code', 'revoke_sessions',
             'change_director', 'adjust_points', 'task_lookup', 'update_task', 'delete_task', 'wipe_activity',
             'export_company', 'purge_company']) a
            where ops_ticket(a, null, '{}', 'причина длинная', gen_random_uuid()) ? 'ticket'),
          14, 'all fourteen actions of the contract are accepted');

-- the code ten minutes old: enough for the three light actions, not for the rest
set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000021","role":"authenticated","session_id":"05200000-0000-0000-0000-000000000243"}';
select throws_ok($$select ops_ticket('wipe_activity', pg_temp.a(), '{}', 'причина длинная', gen_random_uuid())$$,
                 'P0001', 'ops_fresh_required', 'a dangerous action wants a code of the last five minutes');
select ok(ops_ticket('create_company', null, '{}', 'причина длинная', gen_random_uuid()) ? 'ticket', 'create_company passes on the twelve hours');
select ok(ops_ticket('add_person', pg_temp.a(), '{}', 'причина длинная', gen_random_uuid()) ? 'ticket', 'add_person passes on the twelve hours');
select ok(ops_ticket('revoke_sessions', pg_temp.a(), '{}', 'причина длинная', gen_random_uuid()) ? 'ticket', 'revoke_sessions passes on the twelve hours');
select ok(ops_companies() is not null, 'a code ten minutes old reads');

-- a repeated code moves updated_at of the same row: the age counts from there
reset role;
update auth.mfa_amr_claims set updated_at = now() where session_id = pg_temp.u(243);
set local role authenticated;
select ok(ops_ticket('wipe_activity', pg_temp.a(), '{}', 'причина длинная', gen_random_uuid()) ? 'ticket',
          'the second code of a session counts, not the first');
reset role;
update auth.mfa_amr_claims set updated_at = now() - interval '10 minutes' where session_id = pg_temp.u(243);

-- the same request before its ticket is taken: the same ticket, its minute starts anew
set local role authenticated;
set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000021","role":"authenticated","session_id":"05200000-0000-0000-0000-000000000241"}';
create temp table t_first on commit drop as
  select ops_ticket('update_company', pg_temp.a(), '{}', 'причина длинная', pg_temp.u(301)) as answer;
reset role;
grant all on t_first to public;
update ops.tickets set created_at = now() - interval '30 seconds' where client_request_id = pg_temp.u(301);
set local role authenticated;
select is(ops_ticket('update_company', pg_temp.a(), '{}', 'причина длинная', pg_temp.u(301)), (select answer from t_first),
          'a repeat before the take is the same ticket');
reset role;
select is((select created_at from ops.tickets where client_request_id = pg_temp.u(301)), now(), 'and its minute starts anew');

-- the same request id for another action or company is no repeat
set local role authenticated;
select throws_ok($$select ops_ticket('wipe_activity', pg_temp.a(), '{}', 'причина длинная', pg_temp.u(301))$$,
                 'P0001', 'ops_bad_ticket', 'the same id with another action — refused');
select throws_ok($$select ops_ticket('update_company', pg_temp.b(), '{}', 'причина длинная', pg_temp.u(301))$$,
                 'P0001', 'ops_bad_ticket', 'the same id with another company — refused');

-- a ticket is for one action of one company, once, for sixty seconds
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select throws_ok($$select ops_update_company((select (answer ->> 'ticket')::uuid from t_first), pg_temp.b(), null, null, null)$$,
                 'P0001', 'ops_bad_ticket', 'a ticket of company A does not open company B');
select throws_ok($$select ops_update_person((select (answer ->> 'ticket')::uuid from t_first), pg_temp.a(), pg_temp.u(2), '{}')$$,
                 'P0001', 'ops_bad_ticket', 'a ticket of one action does not open another');
select lives_ok($$select ops_update_company((select (answer ->> 'ticket')::uuid from t_first), pg_temp.a(), null, null, '{"lab_for_all": true}')$$,
                'the ticket works');
select throws_ok($$select ops_update_company((select (answer ->> 'ticket')::uuid from t_first), pg_temp.a(), null, null, '{}')$$,
                 'P0001', 'ops_bad_ticket', 'and works once');

reset role;
select is((select company_name from ops.audit where client_request_id = pg_temp.u(301)), 'pgtap-052 A', 'the journal names the company');
select is((select count(*)::int from ops.audit where client_request_id = pg_temp.u(301) and operator_id = pg_temp.u(21)
                                                 and reason = 'причина длинная' and action = 'update_company'),
          1, 'the journal says who, what and why');

-- the request done: the journal answers, whoever else asks is refused
create temp table t_journal_peek on commit drop as select result from ops.audit where client_request_id = pg_temp.u(301);
grant all on t_journal_peek to public;
set local role authenticated;
set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000021","role":"authenticated","session_id":"05200000-0000-0000-0000-000000000241"}';
select is(ops_ticket('update_company', pg_temp.a(), '{}', 'причина длинная', pg_temp.u(301)),
          jsonb_build_object('duplicate', true, 'result', (select result from t_journal_peek)),
          'a repeat of a done request answers from the journal');
set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000024","role":"authenticated","session_id":"05200000-0000-0000-0000-000000000248"}';
select throws_ok($$select ops_ticket('update_company', pg_temp.a(), '{}', 'причина длинная', pg_temp.u(301))$$,
                 'P0001', 'ops_bad_ticket', 'another operator gets no answer from somebody else''s request');

-- sixty seconds
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
create temp table t_clock (id uuid) on commit drop;
grant all on t_clock to public;
insert into t_clock select pg_temp.ticket('update_company', pg_temp.a());
reset role;
update ops.tickets set created_at = now() - interval '61 seconds' where id = (select id from t_clock);
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select throws_ok($$select ops_update_company((select id from t_clock), pg_temp.a(), null, null, null)$$,
                 'P0001', 'ops_bad_ticket', 'a ticket of 61 seconds ago — refused');
reset role;
update ops.tickets set created_at = now() - interval '59 seconds' where id = (select id from t_clock);
set local role service_role;
select lives_ok($$select ops_update_company((select id from t_clock), pg_temp.a(), null, null, null)$$,
                'a ticket of 59 seconds ago — taken');

-- a ticket does not outlive its operator
reset role;
insert into ops.tickets (id, operator_id, session_id, action, company_id, reason, client_request_id)
values (pg_temp.u(311), pg_temp.u(22), pg_temp.u(246), 'update_company', pg_temp.a(), 'причина длинная', pg_temp.u(312));
set local role service_role;
select throws_ok($$select ops_update_company(pg_temp.u(311), pg_temp.a(), null, null, null)$$,
                 'P0001', 'ops_bad_ticket', 'a ticket of a revoked operator — refused');

-- ---------------------------------------------------------------------------
-- 5. The journal cannot be changed
-- ---------------------------------------------------------------------------
reset role;
select throws_ok($$update ops.audit set reason = 'другая причина'$$, 'P0001', 'audit_immutable', 'the journal: no UPDATE');
select throws_ok($$delete from ops.audit$$, 'P0001', 'audit_immutable', 'the journal: no DELETE');
select throws_ok($$truncate ops.audit$$, 'P0001', 'audit_immutable', 'the journal: no TRUNCATE');

-- ---------------------------------------------------------------------------
-- 6. Quiet: a console's action gives birth to no push
-- ---------------------------------------------------------------------------
select set_config('pulse.ops_quiet', '', true);
insert into task_messages (company_id, task_id, sender_id, type, content)
select pg_temp.a(), t.id, pg_temp.u(2), 'text', 'pgtap-052 слышно'
  from tasks t where t.company_id = pg_temp.a() and t.title = 'pgtap-052 дело';
select is((select status::text from notification_deliveries
            where company_id = pg_temp.a() and meta ->> 'body' like '%pgtap-052 слышно%'), 'queued',
          'outside the console a message queues a push');

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select lives_ok($$select ops_log_action(pg_temp.ticket('issue_login_code', pg_temp.a()), 'issue_login_code', pg_temp.a(), '{"user_id": "x"}')$$,
                'ops_log_action journals what was done outside the base');
reset role;
delete from notification_deliveries where meta ->> 'body' like '%pgtap-052 слышно%';
insert into task_messages (company_id, task_id, sender_id, type, content)
select pg_temp.a(), t.id, pg_temp.u(2), 'text', 'pgtap-052 тихо'
  from tasks t where t.company_id = pg_temp.a() and t.title = 'pgtap-052 дело';
select is((select status::text || '/' || attempts || '/' || last_error from notification_deliveries
            where company_id = pg_temp.a() and meta ->> 'body' like '%pgtap-052 тихо%'), 'failed/3/muted',
          'inside it the row is put out the way muted is');
delete from notification_deliveries where meta ->> 'body' like '%pgtap-052 тихо%';

-- ---------------------------------------------------------------------------
-- 7. A company, people and points
-- ---------------------------------------------------------------------------
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';

select ok(not ops_slug_free('pgtap-052-a'), 'a taken address is not free');
select ok(ops_slug_free('pgtap-052-new'), 'a new address is free');

create temp table t_new (ticket uuid, ids jsonb) on commit drop;
grant all on t_new to public;
insert into t_new (ticket) select pg_temp.ticket('create_company', null);
update t_new set ids = ops_prepare_company(ticket);
select is(ops_prepare_company((select ticket from t_new)), (select ids from t_new), 'a repeat of the preparation brings the same people');

reset role;
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000', x.id, 'authenticated', 'authenticated', x.id || '@people.invalid', now(), now(),
       '', '', '', '', '', '', '', ''
  from t_new, lateral (values ((ids ->> 'director_id')::uuid), ((ids ->> 'tv_id')::uuid)) as x(id);

set local role service_role;
select throws_ok($$select ops_create_company((select ticket from t_new), '{"name": "pgtap-052 C", "slug": "pgtap-052-a", "director": {"full_name": "Имя"}}')$$,
                 'P0001', 'slug_taken', 'a taken address — refused');
select lives_ok(
  $$select ops_create_company((select ticket from t_new), '{"name": "pgtap-052 C", "slug": "pgtap-052-c", "settings": {"points_enabled": true},
      "director": {"full_name": "pgtap-052 Директор C", "position": "Основатель", "aliases": ["Шеф"]},
      "shop": [{"title": "pgtap-052 Куртка", "description": "тёплая", "icon": "🧥", "price": 200, "stock": null, "sort": 10}]}')$$,
  'a company is created');
select is((select settings from companies where slug = 'pgtap-052-c'), '{"points_enabled": true}'::jsonb, 'only the explicit settings');
select is((select count(*)::int from profiles p join companies c on c.id = p.company_id
            where c.slug = 'pgtap-052-c' and ((p.role = 'director' and p.position = 'Основатель' and p.aliases = '{Шеф}')
                                              or (p.role = 'tv' and p.full_name = 'TV Kiosk'))),
          2, 'the director and the kiosk');
select is((select count(*)::int from shop_items s join companies c on c.id = s.company_id where c.slug = 'pgtap-052-c'), 1, 'the shop');
select is((select count(*)::int from tv_state s join companies c on c.id = s.company_id where c.slug = 'pgtap-052-c'), 1, 'the wall');

select lives_ok($$select issue_login_code(((select ids from t_new) ->> 'director_id')::uuid, null, 'pgtap-052-first-code')$$,
                'a code with no issuer inside the company');
reset role;
select is((select issued_by from login_codes where code_hash = 'pgtap-052-first-code'), null, 'issued_by stays empty');
set local role service_role;
select throws_ok($$select issue_login_code(pg_temp.u(2), pg_temp.u(11), 'pgtap-052-foreign-code')$$, 'P0001', 'not_found',
                 'an issuer of another company is still refused');

select throws_ok($$select ops_update_company(pg_temp.ticket('update_company', pg_temp.a()), pg_temp.a(), null, null, '{"parser_rules": {}}')$$,
                 'P0001', 'parser_rules_forbidden', 'parser rules go through the lab only');
select throws_ok($$select ops_update_company(pg_temp.ticket('update_company', pg_temp.a()), pg_temp.a(), null, 'pgtap-052-b', null)$$,
                 'P0001', 'slug_taken', 'the address of company B — refused');
select lives_ok($$select ops_update_company(pg_temp.ticket('update_company', pg_temp.a()), pg_temp.a(), 'pgtap-052 A', 'pgtap-052-a2', '{"mascot_seasons": false}')$$,
                'the name, the address and a section change');
select is((select settings ->> 'mascot_seasons' || '/' || slug from companies where id = pg_temp.a()), 'false/pgtap-052-a2', 'settings are merged, not replaced');
select is((select settings ->> 'dev_tools' from companies where id = pg_temp.a()), null, 'no dev_tools yet');
select lives_ok($$select ops_update_company(pg_temp.ticket('update_company', pg_temp.a()), pg_temp.a(), null, null, '{"dev_tools": true}')$$,
                'the console opens dev_tools for a company');
select is((select settings ->> 'dev_tools' from companies where id = pg_temp.a()), 'true', 'dev_tools is written');
set local role authenticated;
set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000021","role":"authenticated","session_id":"05200000-0000-0000-0000-000000000241"}';
select is(ops_company_card(pg_temp.a()) -> 'settings' ->> 'dev_tools', 'true', 'the card shows dev_tools');
select is(ops_company_card(pg_temp.b()) -> 'settings' ->> 'dev_tools', 'false', 'no key reads as closed');
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';

select throws_ok($$select ops_add_person(pg_temp.ticket('add_person', pg_temp.a()), pg_temp.a(), pg_temp.u(25), 'Имя', 'director', null, '{}')$$,
                 'P0001', 'use_change_director', 'nobody is added as a director');
select lives_ok($$select ops_add_person(pg_temp.ticket('add_person', pg_temp.a()), pg_temp.a(), pg_temp.u(25), 'pgtap-052 Новый', 'manager', 'Завскладом', '{Новый}')$$,
                'a person is added');

select throws_ok($$select ops_update_person(pg_temp.ticket('update_person', pg_temp.a()), pg_temp.a(), pg_temp.u(2), '{"role": "director"}')$$,
                 'P0001', 'use_change_director', 'nobody becomes a director by an edit');
select throws_ok($$select ops_update_person(pg_temp.ticket('update_person', pg_temp.a()), pg_temp.a(), pg_temp.u(1), '{"role": "employee"}')$$,
                 'P0001', 'use_change_director', 'a director stops being one only by the change');
select throws_ok($$select ops_update_person(pg_temp.ticket('update_person', pg_temp.a()), pg_temp.a(), pg_temp.u(1), '{"is_active": false}')$$,
                 'P0001', 'use_change_director', 'a director is not switched off by an edit');
select throws_ok($$select ops_update_person(pg_temp.ticket('update_person', pg_temp.a()), pg_temp.a(), pg_temp.u(2), '{"company_id": "x"}')$$,
                 'P0001', 'bad_patch', 'a field outside the list — refused');
select throws_ok($$select ops_update_person(pg_temp.ticket('update_person', pg_temp.b()), pg_temp.b(), pg_temp.u(2), '{"position": "x"}')$$,
                 'P0001', 'not_found', 'a person of A through company B — not found');
select lives_ok($$select ops_update_person(pg_temp.ticket('update_person', pg_temp.a()), pg_temp.a(), pg_temp.u(1), '{"full_name": "pgtap-052 Директор A", "position": "Глава"}')$$,
                'a director''s name and position can be corrected');
select lives_ok($$select ops_update_person(pg_temp.ticket('update_person', pg_temp.a()), pg_temp.a(), pg_temp.u(3), '{"position": "Офис"}')$$,
                'a person is corrected');

select is(ops_adjust_points(pg_temp.ticket('adjust_points', pg_temp.a()), pg_temp.a(), pg_temp.u(2), -100, 'pgtap-052 поправка'),
          '{"balance": -61}'::jsonb, 'a correction may take the balance below zero');
select is(ops_adjust_points(pg_temp.ticket('adjust_points', pg_temp.a()), pg_temp.a(), pg_temp.u(2), 7, 'pgtap-052 поправка вверх'),
          '{"balance": -54}'::jsonb, 'a correction upwards');
select is((select count(*)::int from tv_events where company_id = pg_temp.a() and payload::text like '%поправка%'), 0, 'a correction stays off the wall');
select is((select count(*)::int from ether_events where company_id = pg_temp.a() and title like '%поправка%'), 0, 'and out of the ether');
select is((select count(*)::int from point_transactions
            where user_id = pg_temp.u(2) and rule_code = 'ops_adjust' and source = 'manual' and quiet and actor_id is null),
          2, 'a correction is one new row each time: manual, quiet, no actor');
select is(ops_revoke_sessions(pg_temp.ticket('revoke_sessions', pg_temp.a()), pg_temp.a(), pg_temp.u(2)),
          '{"sessions": 0, "devices": 1}'::jsonb, 'the devices of a person are dropped');
select throws_ok($$select ops_revoke_sessions(pg_temp.ticket('revoke_sessions', pg_temp.b()), pg_temp.b(), pg_temp.u(2))$$,
                 'P0001', 'not_found', 'a person of A through company B — not found');

-- a task, by id
select throws_ok($$select ops_task_get(pg_temp.ticket('task_lookup', pg_temp.b()), pg_temp.b(),
                     (select id from tasks where company_id = pg_temp.a() limit 1))$$,
                 'P0001', 'not_found', 'a task of A through company B — not found');
select is(ops_task_get(pg_temp.ticket('task_lookup', null), null,
            (select id from tasks where company_id = pg_temp.a() and title = 'pgtap-052 дело')) ->> 'assignee',
          'pgtap-052 Сотрудник A', 'a task is found across companies when none is named');
reset role;
select ok((select result from ops.audit where action = 'task_lookup' order by id desc limit 1) ? 'task_id'
          and not (select result::text from ops.audit where action = 'task_lookup' order by id desc limit 1) like '%pgtap-052 дело%',
          'the journal keeps the id, never the words of a task');
set local role service_role;
select lives_ok($$select ops_update_task(pg_temp.ticket('update_task', pg_temp.a()), pg_temp.a(),
                    (select id from tasks where company_id = pg_temp.a() and title = 'pgtap-052 дело'), '{"body": "pgtap-052 тело"}')$$,
                'a task is edited');
select throws_ok($$select ops_update_task(pg_temp.ticket('update_task', pg_temp.a()), pg_temp.a(),
                    (select id from tasks where company_id = pg_temp.a() limit 1), '{"status": "done"}')$$,
                 'P0001', 'bad_patch', 'a status is not edited');
select lives_ok($$select ops_delete_task(pg_temp.ticket('delete_task', pg_temp.a()), pg_temp.a(),
                    (select id from tasks where company_id = pg_temp.a() and title = 'pgtap-052 дело'))$$,
                'a task with a child, a thread and points is deleted');
select is((select count(*)::int from tasks where company_id = pg_temp.a()), 1, 'its child stays');

-- ---------------------------------------------------------------------------
-- 8. The change of director
-- ---------------------------------------------------------------------------
reset role;
insert into tasks (id, company_id, author_id, assignee_id, title, status)
select pg_temp.u(400 + s.n), pg_temp.a(), pg_temp.u(1), pg_temp.u(3), 'pgtap-052 статус ' || s.status, s.status::task_status
  from (values (1, 'scheduled'), (2, 'sent'), (3, 'accepted'), (4, 'in_progress'), (5, 'pending_review'),
               (6, 'rework'), (7, 'declined'), (8, 'done'), (9, 'revoked')) as s(n, status);
insert into task_messages (company_id, task_id, sender_id, type, content, meta)
values (pg_temp.a(), pg_temp.u(403), pg_temp.u(3), 'text', 'pgtap-052 вопрос', '{"is_question": true}');
insert into recurrence_rules (id, company_id, author_id, assignee_id, target, title, every, is_active) values
  (pg_temp.u(411), pg_temp.a(), pg_temp.u(1), pg_temp.u(3), 'task', 'pgtap-052 идёт', 'day', true),
  (pg_temp.u(412), pg_temp.a(), pg_temp.u(1), pg_temp.u(3), 'task', 'pgtap-052 стоит', 'day', false);
insert into events (id, company_id, author_id, title, starts_at, ends_at, cancelled_at) values
  (pg_temp.u(421), pg_temp.a(), pg_temp.u(1), 'pgtap-052 впереди', now() + interval '1 day', null, null),
  (pg_temp.u(422), pg_temp.a(), pg_temp.u(1), 'pgtap-052 прошло', now() - interval '2 days', now() - interval '1 day', null),
  (pg_temp.u(423), pg_temp.a(), pg_temp.u(1), 'pgtap-052 отменено', now() + interval '1 day', null, now());
insert into event_participants (event_id, user_id, status) values (pg_temp.u(421), pg_temp.u(2), 'declined');
insert into errands (id, company_id, author_id, kind, label, status) values
  (pg_temp.u(431), pg_temp.a(), pg_temp.u(1), 'tea', 'pgtap-052 чай', 'accepted'),
  (pg_temp.u(432), pg_temp.a(), pg_temp.u(1), 'tea', 'pgtap-052 готово', 'done');

create temp table t_queued on commit drop as
  select id from notification_deliveries where status = 'queued';
grant all on t_queued to public;

set local role service_role;
select throws_ok($$select ops_change_director(pg_temp.ticket('change_director', pg_temp.a()), pg_temp.a(), pg_temp.u(2), pg_temp.u(3), 'keep')$$,
                 'P0001', 'not_director', 'the old one must be a director');
select throws_ok($$select ops_change_director(pg_temp.ticket('change_director', pg_temp.a()), pg_temp.a(), pg_temp.u(1), pg_temp.u(1), 'keep')$$,
                 'P0001', 'already_director', 'the new one must not be one already');
select throws_ok($$select ops_change_director(pg_temp.ticket('change_director', pg_temp.a()), pg_temp.a(), pg_temp.u(1), pg_temp.u(12), 'keep')$$,
                 'P0001', 'not_found', 'the new one comes from the same company');
select throws_ok($$select ops_change_director(pg_temp.ticket('change_director', pg_temp.a()), pg_temp.a(), pg_temp.u(1), pg_temp.u(5), 'keep')$$,
                 'P0001', 'inactive', 'an inactive person is no director');
select throws_ok($$select ops_change_director(pg_temp.ticket('change_director', pg_temp.a()), pg_temp.a(), pg_temp.u(1), pg_temp.u(4), 'keep')$$,
                 'P0001', 'bad_role', 'a kiosk is no director');
select throws_ok($$select ops_change_director(pg_temp.ticket('change_director', pg_temp.a()), pg_temp.a(), pg_temp.u(1), pg_temp.u(2), 'fired')$$,
                 'P0001', 'bad_fate', 'the old one''s fate comes from the list');

create temp table t_move (result jsonb) on commit drop;
grant all on t_move to public;
insert into t_move select ops_change_director(pg_temp.ticket('change_director', pg_temp.a()), pg_temp.a(), pg_temp.u(1), pg_temp.u(2), 'deactivate');

reset role;
select is((select role::text from profiles where id = pg_temp.u(2)), 'director', 'the new one is the director');
select is((select is_active from profiles where id = pg_temp.u(1)), false, 'deactivate: the old one is off');
select is((select count(*)::int from auth.sessions where user_id = pg_temp.u(1)), 0, 'and his sessions are gone');
select is((select count(*)::int from tasks where id between pg_temp.u(401) and pg_temp.u(407) and author_id = pg_temp.u(2)),
          7, 'all seven open statuses are carried over');
select is((select count(*)::int from tasks where id between pg_temp.u(408) and pg_temp.u(409) and author_id = pg_temp.u(1)),
          2, 'done and revoked stay with the old one');
select is((select count(*)::int from task_messages
            where task_id between pg_temp.u(401) and pg_temp.u(409) and type = 'system' and meta ->> 'director_changed' = 'true'),
          7, 'a system line in the thread of each carried task');
select is((select meta ->> 'answered_at' from task_messages where task_id = pg_temp.u(403) and meta ->> 'is_question' = 'true'),
          null, 'that line does not answer a question still open');
select is((select author_id from recurrence_rules where id = pg_temp.u(411)), pg_temp.u(2), 'an active rule moves');
select is((select author_id from recurrence_rules where id = pg_temp.u(412)), pg_temp.u(1), 'a stopped one stays');
select is((select author_id from events where id = pg_temp.u(421)), pg_temp.u(2), 'an event ahead moves');
select is((select status from event_participants where event_id = pg_temp.u(421) and user_id = pg_temp.u(2)), 'going', 'and the new one is going');
select is((select count(*)::int from events where id in (pg_temp.u(422), pg_temp.u(423)) and author_id = pg_temp.u(1)), 2, 'past and cancelled stay');
select is((select manager_id from profiles where id = pg_temp.u(3)), pg_temp.u(2), 'the team reports to the new one');
select is((select manager_id from profiles where id = pg_temp.u(2)), null, 'and he reports to nobody');
select is((select count(*)::int from errands where company_id = pg_temp.a() and author_id = pg_temp.u(1) and status = 'cancelled'),
          2, 'open errands are cancelled');
select is((select status::text from errands where id = pg_temp.u(432)), 'done', 'a done errand stays');
select is((select coalesce(board_id::text, '') || coalesce(week_board_id::text, '') || coalesce(board_point::text, '') || scene
             from tv_state where company_id = pg_temp.a()), 'face', 'his boards leave the wall, the scene with them');
select is((select count(*)::int from mind_boards where company_id = pg_temp.a() and user_id = pg_temp.u(1)), 1, 'his boards stay his');
select is((select count(*)::int from notes where company_id = pg_temp.a() and user_id = pg_temp.u(1)), 3, 'his notes stay his');
select is((select count(*)::int from point_transactions where company_id = pg_temp.a()), 5, 'points stay');
select is_empty($$select id from notification_deliveries where status = 'queued' and id not in (select id from t_queued)$$,
                'a change of director pushes nobody');
select is((select jsonb_array_length(result -> 'tasks') from t_move), 8, 'the answer names the tasks, the leftover subtask among them');
select is((select a.result from ops.audit a where a.action = 'change_director' order by a.id desc limit 1), (select result from t_move),
          'the journal keeps every changed id');
select ok((select result -> 'tasks' ? pg_temp.u(407)::text from t_move), 'a declined task among them');

set local role service_role;
select is(ops_change_director(pg_temp.ticket('change_director', pg_temp.a()), pg_temp.a(), pg_temp.u(2), pg_temp.u(3), 'demote') ->> 'old_fate',
          'demote', 'the next change');
reset role;
select is((select role::text from profiles where id = pg_temp.u(2)), 'employee', 'demote: the old one is an employee');
set local role service_role;
select is(ops_change_director(pg_temp.ticket('change_director', pg_temp.a()), pg_temp.a(), pg_temp.u(3), pg_temp.u(2), 'keep') ->> 'old_fate',
          'keep', 'one more');
reset role;
select is((select count(*)::int from profiles where company_id = pg_temp.a() and role = 'director' and is_active), 2, 'keep: both are directors');

-- ---------------------------------------------------------------------------
-- 9. The wipe
-- ---------------------------------------------------------------------------
select pg_temp.fill(pg_temp.a(), pg_temp.u(2), pg_temp.u(3), 'two');
insert into notification_deliveries (company_id, user_id, event_kind) values (pg_temp.a(), pg_temp.u(2), 'pgtap-052');

set local role service_role;
select throws_ok($$select ops_wipe_activity(pg_temp.ticket('wipe_activity', pg_temp.a()), pg_temp.a(), 'pgtap-052 a')$$,
                 'P0001', 'confirm_mismatch', 'the name must match to the letter');

create temp table t_wipe (result jsonb) on commit drop;
grant all on t_wipe to public;
insert into t_wipe select ops_wipe_activity(pg_temp.ticket('wipe_activity', pg_temp.a()), pg_temp.a(), 'pgtap-052 A');

reset role;
select is_empty(
  $$select t from unnest(array['notification_deliveries', 'tv_events', 'reminders', 'ether_events', 'point_disputes',
                               'point_transactions', 'daily_reports', 'orders', 'mind_boards', 'notes', 'announcements',
                               'announcement_acks', 'tasks', 'task_messages', 'task_reactions', 'task_reads', 'events',
                               'event_participants', 'errands', 'visits', 'recurrence_rules', 'inbox_items', 'ai_logs',
                               'ingest_batches']) t
     where (ops.table_counts(pg_temp.a()) ->> t)::bigint <> 0$$,
  'the wipe empties every activity table of A'
);
select ok((select (ops.table_counts(pg_temp.a()) ->> t)::bigint > 0 from unnest(array['profiles']) t), 'people stay');
select is((select count(*)::int from push_subscriptions where company_id = pg_temp.a()), 1, 'subscriptions stay');
select is((select count(*)::int from login_codes where company_id = pg_temp.a()) > 0, true, 'login codes stay');
select is((select count(*)::int from voice_kept where company_id = pg_temp.a()), 2, 'the marks «в корпус» stay');
select is((select sum(stock)::int from shop_items where company_id = pg_temp.a()), 12, 'each of the two open orders gave its unit back');
select is((select max(streak_count)::int || coalesce(max(streak_updated_at)::text, '') from profiles where company_id = pg_temp.a()), '0', 'streaks are zero');
select is((select mode || scene || guest::text || coalesce(guest_until::text, '') || coalesce(employee_id::text, '') || coalesce(task_id::text, '')
                  || coalesce(expires_at::text, '') || coalesce(board_id::text, '') || coalesce(week_board_id::text, '') || coalesce(board_point::text, '')
             from tv_state where company_id = pg_temp.a()), 'etherfacefalse', 'the wall goes back to the ether');
select is((select (result -> 'rows' ->> 'tasks')::int from t_wipe), 12, 'the answer counts what went');
select is((select (result ->> 'files_queued')::int from t_wipe), 6, 'voice and photos of A are queued');
select is((select count(*)::int from ops.storage_queue where company_id = pg_temp.a() and name like '%-kept.webm'), 0, 'a file «в корпус» stays');
select is((select count(*)::int from ops.storage_queue where company_id = pg_temp.a() and bucket = 'brand'), 0, 'the logo stays');
select is((select count(*)::int from ops.storage_queue where company_id = pg_temp.a() and bucket = 'avatars'), 0, 'people''s photos stay: people do');
select is((select count(*)::int from storage.objects where name like pg_temp.a()::text || '/%' and bucket_id = 'voice'), 6, 'files are only queued: Storage removes them');
select is(ops.table_counts(pg_temp.b()), (select counts from t_b_counts), 'the wipe of A did not touch company B');
select is((select count(*)::int from ops.storage_queue where company_id = pg_temp.b()
              or name like pg_temp.b()::text || '/%'), 0, 'nor its files');

-- ---------------------------------------------------------------------------
-- 10. The export
-- ---------------------------------------------------------------------------
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
create temp table t_export (id uuid) on commit drop;
grant all on t_export to public;
insert into t_export select ops_export_begin(pg_temp.ticket('export_company', pg_temp.b()), pg_temp.b());

select is(jsonb_array_length(ops_export_page((select id from t_export), 'tasks', 0, 500)), 2, 'a table of the company, whole');
select is(jsonb_array_length(ops_export_page((select id from t_export), 'tasks', 1, 500)), 1, 'by offset');
select is(jsonb_array_length(ops_export_page((select id from t_export), 'announcement_acks', 0, 500)), 1, 'a child through its parent');
select is((select count(*)::int from jsonb_array_elements(ops_export_page((select id from t_export), 'profiles', 0, 500)) r
            where r ->> 'company_id' <> pg_temp.b()::text), 0, 'only its own rows');
select is(jsonb_array_length(ops_export_page((select id from t_export), 'companies', 0, 500)), 1, 'the company itself');
select throws_ok($$select ops_export_page((select id from t_export), 'notes', 0, 500)$$, 'P0001', 'bad_table', 'notes are private: not exported');
select throws_ok($$select ops_export_page((select id from t_export), 'mind_boards', 0, 500)$$, 'P0001', 'bad_table', 'boards too');
select throws_ok($$select ops_export_page((select id from t_export), 'login_codes', 0, 500)$$, 'P0001', 'bad_table', 'codes are not exported');
select throws_ok($$select ops_export_page((select id from t_export), 'pg_authid', 0, 500)$$, 'P0001', 'bad_table', 'nothing outside the list');
select is(jsonb_array_length(ops_export_files((select id from t_export), 0, 50)), 5, 'the files of every bucket, without the recording of a note');
select is((select count(*)::int from jsonb_array_elements(ops_export_files((select id from t_export), 0, 50)) f
            where f ->> 'bucket' = 'avatars' and (f ->> 'bytes')::int = 50), 1, 'people''s photos go with them, they will not come back after a purge');
select is((select count(*)::int from jsonb_array_elements(ops_export_files((select id from t_export), 0, 50)) f
            where f ->> 'name' like '%-note.webm'), 0, 'a note''s recording stays out');

select throws_ok($$select ops_purge_company(pg_temp.ticket('purge_company', pg_temp.b()), pg_temp.b(), 'pgtap-052 B')$$,
                 'P0001', 'export_required', 'an unfinished export opens no purge');
select lives_ok($$select ops_export_finish((select id from t_export), repeat('a', 64), '{"tasks": 2}')$$, 'the export is finished');
select lives_ok($$select ops_export_finish((select id from t_export), repeat('a', 64), '{"tasks": 2}')$$, 'a repeat of the finish is no failure');
select throws_ok($$select ops_export_page((select id from t_export), 'tasks', 0, 500)$$, 'P0001', 'export_expired', 'a finished export is closed');

create temp table t_late (id uuid) on commit drop;
grant all on t_late to public;
insert into t_late select ops_export_begin(pg_temp.ticket('export_company', pg_temp.b()), pg_temp.b());
reset role;
update ops.exports set created_at = now() - interval '31 minutes' where id = (select id from t_late);
set local role service_role;
select throws_ok($$select ops_export_page((select id from t_late), 'tasks', 0, 500)$$, 'P0001', 'export_expired', 'an export lives thirty minutes');
select throws_ok($$select ops_export_finish((select id from t_late), repeat('b', 64), '{}')$$, 'P0001', 'export_expired', 'and cannot be finished later');

-- ---------------------------------------------------------------------------
-- 11. The purge
-- ---------------------------------------------------------------------------
reset role;
select pg_temp.fill(pg_temp.a(), pg_temp.u(2), pg_temp.u(3), 'three');
insert into tasks (company_id, author_id, assignee_id, title, status)
values (pg_temp.a(), pg_temp.u(5), pg_temp.u(5), 'pgtap-052 старое', 'done');
-- an old export of another company opens nothing here
set local role service_role;
select throws_ok($$select ops_purge_company(pg_temp.ticket('purge_company', pg_temp.a()), pg_temp.a(), 'pgtap-052 A')$$,
                 'P0001', 'export_required', 'the purge wants a finished export of this company');

create temp table t_a_export (id uuid) on commit drop;
grant all on t_a_export to public;
insert into t_a_export select ops_export_begin(pg_temp.ticket('export_company', pg_temp.a()), pg_temp.a());
select lives_ok($$select ops_export_finish((select id from t_a_export), repeat('c', 64), '{}')$$, 'the export of A');

reset role;
update ops.exports set finished_at = now() - interval '25 hours' where id = (select id from t_a_export);
set local role service_role;
select throws_ok($$select ops_purge_company(pg_temp.ticket('purge_company', pg_temp.a()), pg_temp.a(), 'pgtap-052 A')$$,
                 'P0001', 'export_required', 'an export of yesterday-and-more is too old');
reset role;
update ops.exports set finished_at = now() - interval '23 hours' where id = (select id from t_a_export);
set local role service_role;
select throws_ok($$select ops_purge_company(pg_temp.ticket('purge_company', pg_temp.a()), pg_temp.a(), 'не то имя')$$,
                 'P0001', 'confirm_mismatch', 'the name must match');

create temp table t_purge (result jsonb) on commit drop;
grant all on t_purge to public;
insert into t_purge select ops_purge_company(pg_temp.ticket('purge_company', pg_temp.a()), pg_temp.a(), 'pgtap-052 A');

reset role;
select is_empty($$select e.key from jsonb_each(ops.table_counts(pg_temp.a())) e where e.value::text::bigint <> 0$$,
                'not a single row of A in any table');
select is((select count(*)::int from auth.users where id in (pg_temp.u(1), pg_temp.u(2), pg_temp.u(3), pg_temp.u(4), pg_temp.u(5), pg_temp.u(25))),
          0, 'the logins of A are gone');
select is((select company_name from ops.audit where action = 'purge_company' order by id desc limit 1), 'pgtap-052 A', 'the journal remembers the name');
select ok((select (result -> 'rows' ->> 'profiles')::int from t_purge) = 6, 'the answer counts the people');
select is((select count(*)::int from ops.storage_queue where company_id = pg_temp.a() and bucket = 'brand'), 3, 'the logo is queued too');
select is((select count(*)::int from ops.storage_queue where company_id = pg_temp.a() and bucket = 'avatars'), 3, 'people''s photos too');
select is((select count(*)::int from ops.storage_queue where company_id = pg_temp.a() and name like '%-kept.webm'), 3, 'and the files «в корпус»');
select is((select count(*)::int from storage.objects where name like pg_temp.a()::text || '/%'), 18, 'Storage still holds them: the queue removes them');
select is(ops.table_counts(pg_temp.b()), (select counts from t_b_counts), 'the purge of A did not touch company B');
select is_empty($$select name from t_b_files except select name from storage.objects$$, 'nor the files of B');
select is((select count(*)::int from ops.storage_queue where name like pg_temp.b()::text || '/%'), 0, 'nor is any queued');

-- the file queue
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select is(jsonb_array_length(ops_storage_next(5)), 5, 'the queue hands out a batch');
select is(ops_storage_left(pg_temp.a()), 18, 'and counts what is left of a company');
select ok(ops_storage_left(null) >= 18, 'or of all of them');
select lives_ok($$select ops_storage_done(array(select (f ->> 'id')::bigint from jsonb_array_elements(ops_storage_next(5)) f))$$, 'a done batch leaves');
select is(ops_storage_left(pg_temp.a()), 13, 'so the queue shortens');

-- ---------------------------------------------------------------------------
-- 12. Operators, by the script
-- ---------------------------------------------------------------------------
select throws_ok($$select ops_grant_operator(pg_temp.u(12), 'pgtap-052')$$, 'P0001', 'has_profile', 'somebody of a company is no operator');
select throws_ok($$select ops_grant_operator('05200000-0000-0000-0000-0000000000ff', 'pgtap-052')$$, 'P0001', 'not_found', 'nobody is no operator');
select lives_ok($$select ops_grant_operator(pg_temp.u(22), 'pgtap-052 returned')$$, 'an operator comes back');
select lives_ok($$select ops_revoke_operator(pg_temp.u(24))$$, 'an operator is revoked');
reset role;
select is((select revoked_at is null from ops.operators where user_id = pg_temp.u(22)), true, 'the grant clears revoked_at');
select is((select count(*)::int from auth.sessions where user_id = pg_temp.u(24)), 0, 'the revocation drops his sessions');
select is((select count(*)::int from ops.audit where action in ('grant_operator', 'revoke_operator') and operator_id is null), 2, 'both are journaled, by nobody');
set local role authenticated;
set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000024","role":"authenticated","session_id":"05200000-0000-0000-0000-000000000248"}';
select throws_ok($$select ops_operators()$$, 'P0001', 'ops_denied', 'a revoked operator is out at once');

-- what the good operator sees of it all
set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000021","role":"authenticated","session_id":"05200000-0000-0000-0000-000000000241"}';
select is((select count(*)::int from jsonb_array_elements(ops_audit_list(null, 200, pg_temp.b())) r
            where r ->> 'company_id' <> pg_temp.b()::text), 0, 'the journal filters by company');
select is(jsonb_array_length(ops_audit_list(null, 3, null)), 3, 'and pages');
select ok((ops_audit_list((ops_audit_list(null, 1, null) -> 0 ->> 'id')::bigint, 1, null) -> 0 ->> 'id')::bigint
          < (ops_audit_list(null, 1, null) -> 0 ->> 'id')::bigint, 'before an id');
select is((select r ->> 'operator_email' from jsonb_array_elements(ops_audit_list(null, 200, null)) r
            where r ->> 'action' = 'purge_company' limit 1), 'pgtap-052-operator@demo.local', 'the journal names the operator');
select ok((select count(*) >= 3 from jsonb_array_elements(ops_operators()) o where o ->> 'email' like 'pgtap-052-operator%'), 'the operators are listed');

select * from finish();
rollback;
