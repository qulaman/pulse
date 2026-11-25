-- The company boundary (20261124090000_tenant_guards.sql, principle 6): a signed-in person of
-- company A cannot move a card into B, put B's people on A's tasks, meetings or errands, call the
-- internal helpers, list the brand bucket, or ask about B's people; what A does inside A still
-- works. New functions start closed (20261124120000_functions_closed_by_default.sql); the small
-- gaps after them are shut too (20261124180000_tenant_guards_tail.sql). Fixtures
-- are this file's own (two companies): dev data never leans in.
begin;
select plan(50);

-- ---------------------------------------------------------------------------
-- Fixtures: company A — a director, a manager, an employee; company B — a director, an employee
-- ---------------------------------------------------------------------------
insert into companies (id, name, settings) values
  ('e5ec0000-0000-0000-0000-00000000000a', 'pgtap-sec A', '{}'::jsonb),
  ('e5ec0000-0000-0000-0000-00000000000b', 'pgtap-sec B', '{}'::jsonb);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, now(), now(),
       '', '', '', '', '', '', '', ''
  from (values
    ('e5ec0000-0000-0000-0000-000000000001'::uuid, 'pgtap-sec-director-a@demo.local'),
    ('e5ec0000-0000-0000-0000-000000000002'::uuid, 'pgtap-sec-manager-a@demo.local'),
    ('e5ec0000-0000-0000-0000-000000000003'::uuid, 'pgtap-sec-employee-a@demo.local'),
    ('e5ec0000-0000-0000-0000-000000000011'::uuid, 'pgtap-sec-director-b@demo.local'),
    ('e5ec0000-0000-0000-0000-000000000013'::uuid, 'pgtap-sec-employee-b@demo.local')
  ) as u(id, email);

insert into profiles (id, company_id, full_name, role, is_active) values
  ('e5ec0000-0000-0000-0000-000000000001', 'e5ec0000-0000-0000-0000-00000000000a', 'pgtap-sec Директор A', 'director', true),
  ('e5ec0000-0000-0000-0000-000000000002', 'e5ec0000-0000-0000-0000-00000000000a', 'pgtap-sec Руководитель A', 'manager', true),
  ('e5ec0000-0000-0000-0000-000000000003', 'e5ec0000-0000-0000-0000-00000000000a', 'pgtap-sec Сотрудник A', 'employee', true),
  ('e5ec0000-0000-0000-0000-000000000011', 'e5ec0000-0000-0000-0000-00000000000b', 'pgtap-sec Директор B', 'director', true),
  ('e5ec0000-0000-0000-0000-000000000013', 'e5ec0000-0000-0000-0000-00000000000b', 'pgtap-sec Сотрудник B', 'employee', true);

update profiles set manager_id = 'e5ec0000-0000-0000-0000-000000000011'
 where id = 'e5ec0000-0000-0000-0000-000000000013';

insert into tasks (id, company_id, author_id, assignee_id, title, status) values
  ('e5ec0000-0000-0000-0000-0000000000f1', 'e5ec0000-0000-0000-0000-00000000000a',
   'e5ec0000-0000-0000-0000-000000000001', 'e5ec0000-0000-0000-0000-000000000003', 'pgtap-sec задача A', 'sent');

insert into events (id, company_id, author_id, title, starts_at) values
  ('e5ec0000-0000-0000-0000-0000000000e1', 'e5ec0000-0000-0000-0000-00000000000a',
   'e5ec0000-0000-0000-0000-000000000001', 'pgtap-sec встреча A', now() + interval '1 day');

-- ---------------------------------------------------------------------------
-- 1. A card stays in its company — the director's own card first of all
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"e5ec0000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$ update profiles set company_id = 'e5ec0000-0000-0000-0000-00000000000b' where id = 'e5ec0000-0000-0000-0000-000000000001' $$,
  'P0001', 'forbidden_field_update', 'a director cannot move his own card into another company'
);
select throws_ok(
  $$ update profiles set company_id = 'e5ec0000-0000-0000-0000-00000000000b' where id = 'e5ec0000-0000-0000-0000-000000000003' $$,
  'P0001', 'forbidden_field_update', 'nor a card of his people'
);
select lives_ok(
  $$ update profiles set position = 'pgtap-sec директор' where id = 'e5ec0000-0000-0000-0000-000000000001' $$,
  'his own card is still his to edit'
);
select throws_ok(
  $$ update profiles set manager_id = 'e5ec0000-0000-0000-0000-000000000011' where id = 'e5ec0000-0000-0000-0000-000000000003' $$,
  'P0001', 'forbidden_field_update', 'a manager from another company is refused'
);
select lives_ok(
  $$ update profiles set manager_id = 'e5ec0000-0000-0000-0000-000000000002' where id = 'e5ec0000-0000-0000-0000-000000000003' $$,
  'a manager of the same company is set as before'
);

-- ---------------------------------------------------------------------------
-- 2. Tasks written straight through PostgREST
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into tasks (company_id, author_id, assignee_id, title, status)
     values ('e5ec0000-0000-0000-0000-00000000000a', 'e5ec0000-0000-0000-0000-000000000001',
             'e5ec0000-0000-0000-0000-000000000013', 'pgtap-sec чужому', 'sent') $$,
  '42501', null, 'a task for a person of another company is refused'
);
select lives_ok(
  $$ insert into tasks (company_id, author_id, assignee_id, title, status)
     values ('e5ec0000-0000-0000-0000-00000000000a', 'e5ec0000-0000-0000-0000-000000000001',
             'e5ec0000-0000-0000-0000-000000000003', 'pgtap-sec своему', 'sent') $$,
  'a task for one of his own people goes in'
);
select throws_ok(
  $$ update tasks set assignee_id = 'e5ec0000-0000-0000-0000-000000000013' where id = 'e5ec0000-0000-0000-0000-0000000000f1' $$,
  '42501', null, 'a task cannot be handed to another company by an update'
);
select throws_ok(
  $$ update tasks set author_id = 'e5ec0000-0000-0000-0000-000000000011' where id = 'e5ec0000-0000-0000-0000-0000000000f1' $$,
  '42501', null, 'nor given an author from another company'
);
select lives_ok(
  $$ update tasks set title = 'pgtap-sec задача A, правка' where id = 'e5ec0000-0000-0000-0000-0000000000f1' $$,
  'an ordinary update of his task still goes through'
);

-- ---------------------------------------------------------------------------
-- 3. Meetings and errands
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ update events set author_id = 'e5ec0000-0000-0000-0000-000000000011' where id = 'e5ec0000-0000-0000-0000-0000000000e1' $$,
  '42501', null, 'a meeting cannot get an author from another company'
);
select lives_ok(
  $$ update events set title = 'pgtap-sec встреча A, правка' where id = 'e5ec0000-0000-0000-0000-0000000000e1' $$,
  'his meeting is still his to edit'
);
select throws_ok(
  $$ insert into errands (company_id, author_id, kind, label, status, claimed_by)
     values ('e5ec0000-0000-0000-0000-00000000000a', 'e5ec0000-0000-0000-0000-000000000001',
             'coffee', 'pgtap-sec кофе', 'accepted', 'e5ec0000-0000-0000-0000-000000000013') $$,
  '42501', null, 'an errand cannot name a person of another company as the one who took it'
);
select lives_ok(
  $$ insert into errands (company_id, author_id, kind, label)
     values ('e5ec0000-0000-0000-0000-00000000000a', 'e5ec0000-0000-0000-0000-000000000001', 'coffee', 'pgtap-sec кофе') $$,
  'an ordinary errand goes in as before'
);

-- ---------------------------------------------------------------------------
-- 4. subordinates answers about the caller's company only
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from subordinates('e5ec0000-0000-0000-0000-000000000011')),
  0, 'B''s people are not listed to A'
);
select is(
  (select count(*)::int from subordinates('e5ec0000-0000-0000-0000-000000000002')),
  1, 'A''s own manager still has his people'
);

-- ---------------------------------------------------------------------------
-- 5. Internal helpers are closed to a signed-in client
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select tv_emit('e5ec0000-0000-0000-0000-00000000000b', 'announcement', null, null, 'pgtap-sec', null) $$,
  '42501', null, 'nobody writes on another company''s wall'
);
select throws_ok($$ select tv_events_prune(0) $$, '42501', null, 'nor clears the walls of every company');
select throws_ok(
  $$ select task_streak_of('e5ec0000-0000-0000-0000-00000000000b', 'e5ec0000-0000-0000-0000-000000000013') $$,
  '42501', null, 'nor reads another company''s streaks'
);
select throws_ok(
  $$ select next_delivery_slot('e5ec0000-0000-0000-0000-00000000000b', now()) $$,
  '42501', null, 'nor another company''s delivery window'
);
reset role;

-- ---------------------------------------------------------------------------
-- 6. Grants and the bucket, as the catalog states them
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'task_sent_at(uuid, timestamptz)', 'execute'),
  'task_sent_at is internal'
);
select ok(
  not has_function_privilege('anon', 'delete_task(uuid)', 'execute')
  and not has_function_privilege('anon', 'purge_closed_tasks()', 'execute')
  and not has_function_privilege('anon', 'reassign_task(uuid, uuid, uuid, timestamptz, boolean, text)', 'execute'),
  'task RPCs need a sign-in'
);
select ok(
  has_function_privilege('authenticated', 'delete_task(uuid)', 'execute')
  and has_function_privilege('authenticated', 'subordinates(uuid)', 'execute'),
  'a signed-in person keeps the RPCs and the policy helper'
);
select ok(
  has_function_privilege('service_role', 'tv_events_prune(integer)', 'execute')
  and has_function_privilege('service_role', 'tv_emit(uuid, text, uuid, uuid, text, integer, text)', 'execute'),
  'the sweep keeps its prune; the service role keeps tv_emit'
);
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind = 'f'
      and p.prosecdef
      and p.prorettype <> 'trigger'::regtype
      -- the sign-in helpers, and subordinates: the policies name no role, an anon read evaluates
      -- them; without a company they answer nothing
      and p.proname not in ('auth_company_id', 'auth_role', 'auth_session_live', 'subordinates')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and has_function_privilege('anon', p.oid, 'execute')),
  '', 'no definer function but the policy helpers is open to anon'
);
select is(
  (select count(*)::int from notification_deliveries where user_id = 'e5ec0000-0000-0000-0000-000000000013'),
  0, 'nothing was queued for the phone of B''s employee'
);
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'brand_public_read'),
  0, 'the brand bucket has no select policy: public by link, never listed'
);

-- ---------------------------------------------------------------------------
-- 7. The service role (ticks, the ops console) is not held by the profile guard
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"role":"service_role"}';
select lives_ok(
  $$ update profiles set manager_id = null where id = 'e5ec0000-0000-0000-0000-000000000003' $$,
  'the service role edits a card as before'
);

-- the employee of A, signed in, still cannot move his own card either
set local role authenticated;
set local request.jwt.claims = '{"sub":"e5ec0000-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_ok(
  $$ update profiles set company_id = 'e5ec0000-0000-0000-0000-00000000000b' where id = 'e5ec0000-0000-0000-0000-000000000003' $$,
  'P0001', 'forbidden_field_update', 'an employee cannot move his own card'
);
select lives_ok(
  $$ update profiles set position = 'pgtap-sec сотрудник' where id = 'e5ec0000-0000-0000-0000-000000000003' $$,
  'and still edits his own card'
);
reset role;

-- ---------------------------------------------------------------------------
-- 8. New functions start closed (20261124120000_functions_closed_by_default.sql): callable by
--    the service role only until a migration grants them; what anon may call is a list by name
-- ---------------------------------------------------------------------------
-- a function created the way a migration creates one (as postgres, in public)
create function public.pgtap_closed_probe() returns int language sql as $$ select 1 $$;

select ok(
  not has_function_privilege('authenticated', 'public.pgtap_closed_probe()', 'execute'),
  'a new function is closed to a signed-in client'
);
select ok(
  not has_function_privilege('anon', 'public.pgtap_closed_probe()', 'execute'),
  'and to anon'
);
select ok(
  has_function_privilege('service_role', 'public.pgtap_closed_probe()', 'execute'),
  'the service role keeps it'
);

grant execute on function public.pgtap_closed_probe() to authenticated;
select ok(
  has_function_privilege('authenticated', 'public.pgtap_closed_probe()', 'execute'),
  'a migration opens it to people with its own grant'
);

-- a function postgres creates in `extensions` (an extension installed later) stays open as usual
create function extensions.pgtap_ext_probe() returns int language sql as $$ select 1 $$;
select ok(
  has_function_privilege('authenticated', 'extensions.pgtap_ext_probe()', 'execute'),
  'an extension''s function in extensions stays callable'
);

-- everything anon may call, by name: the policy helpers (the policies that name no role call
-- them for anon too) and pure helpers that read only their arguments
select is(
  (select coalesce(string_agg(p.proname, ' ' order by p.proname), '')
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind = 'f'
      and p.prorettype <> 'trigger'::regtype
      and p.proname <> 'pgtap_closed_probe'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and has_function_privilege('anon', p.oid, 'execute')
      and p.proname not in (
        'auth_company_id', 'auth_role', 'auth_session_live', 'subordinates', 'team_role',
        'daily_report_checked_on', 'daily_report_clock', 'daily_report_holiday', 'daily_report_on',
        'daily_report_started_on', 'daily_report_state', 'daily_report_workday',
        'director_digest_slot', 'director_quiet_until', 'morning_brief_on', 'notify_hhmm',
        'notify_prefs_defaults', 'points_rule', 'reaction_glyph', 'reaction_points', 'ru_plural',
        'tv_board_cap', 'tv_stage', 'tv_week_end'
      )),
  '', 'anon can call nothing but the listed helpers'
);

-- ---------------------------------------------------------------------------
-- 9. The tail (20261124180000_tenant_guards_tail.sql): parent tasks, read cursors, a closed
--    session, a NULL role, recordings kept across companies
-- ---------------------------------------------------------------------------
insert into tasks (id, company_id, author_id, assignee_id, title, status) values
  ('e5ec0000-0000-0000-0000-0000000000f2', 'e5ec0000-0000-0000-0000-00000000000b',
   'e5ec0000-0000-0000-0000-000000000011', 'e5ec0000-0000-0000-0000-000000000011', 'pgtap-sec задача B', 'scheduled');

set local role authenticated;
set local request.jwt.claims = '{"sub":"e5ec0000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ insert into tasks (company_id, author_id, assignee_id, title, status, parent_task_id)
     values ('e5ec0000-0000-0000-0000-00000000000a', 'e5ec0000-0000-0000-0000-000000000001',
             'e5ec0000-0000-0000-0000-000000000003', 'pgtap-sec под чужой', 'sent', 'e5ec0000-0000-0000-0000-0000000000f2') $$,
  '42501', null, 'a task cannot hang under a task of another company'
);
select lives_ok(
  $$ insert into tasks (company_id, author_id, assignee_id, title, status, parent_task_id)
     values ('e5ec0000-0000-0000-0000-00000000000a', 'e5ec0000-0000-0000-0000-000000000001',
             'e5ec0000-0000-0000-0000-000000000003', 'pgtap-sec под своей', 'sent', 'e5ec0000-0000-0000-0000-0000000000f1') $$,
  'under one of its own it can'
);
select throws_ok(
  $$ update tasks set parent_task_id = 'e5ec0000-0000-0000-0000-0000000000f2' where id = 'e5ec0000-0000-0000-0000-0000000000f1' $$,
  '42501', null, 'nor be moved under one by an update'
);
select throws_ok(
  $$ insert into task_reads (task_id, user_id, company_id)
     values ('e5ec0000-0000-0000-0000-0000000000f2', 'e5ec0000-0000-0000-0000-000000000001', 'e5ec0000-0000-0000-0000-00000000000a') $$,
  '42501', null, 'a read cursor cannot name a task of another company'
);
select lives_ok(
  $$ insert into task_reads (task_id, user_id, company_id)
     values ('e5ec0000-0000-0000-0000-0000000000f1', 'e5ec0000-0000-0000-0000-000000000001', 'e5ec0000-0000-0000-0000-00000000000a') $$,
  'one of its own goes in'
);

-- a token whose session is gone counts for nothing in revoke_sessions either
set local request.jwt.claims = '{"sub":"e5ec0000-0000-0000-0000-000000000001","role":"authenticated","session_id":"e5ec0000-0000-0000-0000-0000000000dd"}';
select throws_ok(
  $$ select revoke_sessions('e5ec0000-0000-0000-0000-000000000003') $$,
  'P0001', 'not_found', 'a closed session cannot sign other people out'
);
set local request.jwt.claims = '{"sub":"e5ec0000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select revoke_sessions('e5ec0000-0000-0000-0000-000000000003') $$,
  'a live one still can'
);

-- a signed-in account without a working profile has no role: the checks refuse it
set local request.jwt.claims = '{"sub":"e5ec0000-0000-0000-0000-0000000000cc","role":"authenticated"}';
select throws_ok($$ select tv_overlay() $$, 'P0001', 'forbidden', 'no role, no wall overlay');
select throws_ok($$ select tv_summary(false) $$, 'P0001', 'forbidden', 'no wall summary');
select throws_ok(
  $$ select close_visit('e5ec0000-0000-0000-0000-0000000000ee') $$,
  'P0001', 'forbidden', 'no closing of a visit'
);
reset role;

-- a recording of B that only a note of A names is not kept for A's sake
insert into storage.objects (bucket_id, name, created_at, updated_at, metadata) values
  ('voice', 'e5ec0000-0000-0000-0000-00000000000b/e5ec0000-0000-0000-0000-000000000013/e5ec0000-0000-0000-0000-0000000000ab.webm',
   now() - interval '400 days', now() - interval '400 days', '{"size": 10}');
insert into notes (company_id, user_id, text, audio_path) values
  ('e5ec0000-0000-0000-0000-00000000000a', 'e5ec0000-0000-0000-0000-000000000001', 'pgtap-sec чужая запись',
   'e5ec0000-0000-0000-0000-00000000000b/e5ec0000-0000-0000-0000-000000000013/e5ec0000-0000-0000-0000-0000000000ab.webm');
select is(
  (select count(*)::int from voice_purge_due(now(), 100000)
    where path = 'e5ec0000-0000-0000-0000-00000000000b/e5ec0000-0000-0000-0000-000000000013/e5ec0000-0000-0000-0000-0000000000ab.webm'),
  1, 'another company''s note does not keep B''s recording past its time'
);
insert into notes (company_id, user_id, text, audio_path) values
  ('e5ec0000-0000-0000-0000-00000000000b', 'e5ec0000-0000-0000-0000-000000000011', 'pgtap-sec своя запись',
   'e5ec0000-0000-0000-0000-00000000000b/e5ec0000-0000-0000-0000-000000000013/e5ec0000-0000-0000-0000-0000000000ab.webm');
select is(
  (select count(*)::int from voice_purge_due(now(), 100000)
    where path = 'e5ec0000-0000-0000-0000-00000000000b/e5ec0000-0000-0000-0000-000000000013/e5ec0000-0000-0000-0000-0000000000ab.webm'),
  0, 'B''s own note keeps it, as before'
);

-- the keys of a device stay on the server side
insert into push_subscriptions (company_id, user_id, endpoint, p256dh, auth) values
  ('e5ec0000-0000-0000-0000-00000000000a', 'e5ec0000-0000-0000-0000-000000000003',
   'https://push.example/pgtap-sec-employee', 'pgtap-p256dh', 'pgtap-auth');
set local role authenticated;
set local request.jwt.claims = '{"sub":"e5ec0000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select p256dh, auth from push_subscriptions $$,
  '42501', null, 'a director cannot read the keys of his people''s devices'
);
select is(
  (select count(*)::int from push_subscriptions where user_id = 'e5ec0000-0000-0000-0000-000000000003'),
  1, 'he still sees the device itself'
);
reset role;

select * from finish();
rollback;
