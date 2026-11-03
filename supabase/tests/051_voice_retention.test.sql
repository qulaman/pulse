-- tasks/027 (D-155 §3, D-18): how long a voice recording is kept. voice_purge_due names the files
-- of the voice bucket whose term ran out — closed_days after all the rows that stand behind the file
-- are closed, orphan_days after the upload for a file nothing came of — never one kept «в корпус»;
-- voice_mark_purged clears the path everywhere; voice_keep marks only the director's own company.
-- Fixtures are this file's own (two companies, rows of storage.objects): dev data never leans in.
begin;
select plan(35);

-- ---------------------------------------------------------------------------
-- Fixtures: company A (default terms) — director, employee, secretary;
-- company B (closed_days 180) — director, employee
-- ---------------------------------------------------------------------------
insert into companies (id, name, settings) values
  ('05100000-0000-0000-0000-00000000000a', 'pgtap-051 A', '{}'::jsonb),
  ('05100000-0000-0000-0000-00000000000b', 'pgtap-051 B',
   '{"voice_retention": {"closed_days": 180, "orphan_days": 30}}'::jsonb);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, now(), now(),
       '', '', '', '', '', '', '', ''
  from (values
    ('05100000-0000-0000-0000-000000000001'::uuid, 'pgtap-051-director-a@demo.local'),
    ('05100000-0000-0000-0000-000000000002'::uuid, 'pgtap-051-employee-a@demo.local'),
    ('05100000-0000-0000-0000-000000000003'::uuid, 'pgtap-051-secretary-a@demo.local'),
    ('05100000-0000-0000-0000-000000000004'::uuid, 'pgtap-051-director-b@demo.local'),
    ('05100000-0000-0000-0000-000000000005'::uuid, 'pgtap-051-employee-b@demo.local')
  ) as u(id, email);

insert into profiles (id, company_id, full_name, role, is_active) values
  ('05100000-0000-0000-0000-000000000001', '05100000-0000-0000-0000-00000000000a', 'pgtap-051 Директор A', 'director', true),
  ('05100000-0000-0000-0000-000000000002', '05100000-0000-0000-0000-00000000000a', 'pgtap-051 Сотрудник A', 'employee', true),
  ('05100000-0000-0000-0000-000000000003', '05100000-0000-0000-0000-00000000000a', 'pgtap-051 Секретарь A', 'secretary', true),
  ('05100000-0000-0000-0000-000000000004', '05100000-0000-0000-0000-00000000000b', 'pgtap-051 Директор B', 'director', true),
  ('05100000-0000-0000-0000-000000000005', '05100000-0000-0000-0000-00000000000b', 'pgtap-051 Сотрудник B', 'employee', true);

-- the files: name = {company}/{user}/{tag}.webm, uploaded long ago unless the case is about the upload
insert into storage.objects (bucket_id, name, created_at)
select 'voice', v.name, now() - make_interval(days => v.age)
  from (values
    ('05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/done91.webm', 400),
    ('05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/done89.webm', 400),
    ('05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/declined.webm', 400),
    ('05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/revoked91.webm', 400),
    ('05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000002/thread-done.webm', 400),
    ('05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000002/thread-open.webm', 400),
    ('05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/two-rows.webm', 400),
    ('05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/announce91.webm', 400),
    ('05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/event-ended.webm', 400),
    ('05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/event-ahead.webm', 400),
    ('05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/note.webm', 400),
    ('05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/errand-done.webm', 400),
    ('05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/errand-sent.webm', 400),
    ('05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/rule-active.webm', 400),
    ('05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/inbox31.webm', 31),
    ('05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/inbox29.webm', 29),
    ('05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/kept.webm', 400),
    ('05100000-0000-0000-0000-00000000000b/05100000-0000-0000-0000-000000000004/b-done91.webm', 400),
    ('05100000-0000-0000-0000-00000000000b/05100000-0000-0000-0000-000000000004/b-inbox31.webm', 31),
    ('smoke-051/no-company.webm', 400),
    ('05100000-0000-0000-0000-0000000000ff/05100000-0000-0000-0000-000000000001/gone-company.webm', 400)
  ) as v(name, age);

-- tasks: closed_at as the status guard would have stamped it
insert into tasks (id, company_id, author_id, assignee_id, title, status, closed_at, source_audio_path) values
  ('05100000-0000-0000-0000-0000000000c1', '05100000-0000-0000-0000-00000000000a', '05100000-0000-0000-0000-000000000001',
   '05100000-0000-0000-0000-000000000002', 'pgtap-051 сдано 91', 'done', now() - interval '91 days',
   '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/done91.webm'),
  ('05100000-0000-0000-0000-0000000000c2', '05100000-0000-0000-0000-00000000000a', '05100000-0000-0000-0000-000000000001',
   '05100000-0000-0000-0000-000000000002', 'pgtap-051 сдано 89', 'done', now() - interval '89 days',
   '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/done89.webm'),
  ('05100000-0000-0000-0000-0000000000c3', '05100000-0000-0000-0000-00000000000a', '05100000-0000-0000-0000-000000000001',
   '05100000-0000-0000-0000-000000000002', 'pgtap-051 не могу', 'declined', now() - interval '300 days',
   '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/declined.webm'),
  ('05100000-0000-0000-0000-0000000000c4', '05100000-0000-0000-0000-00000000000a', '05100000-0000-0000-0000-000000000001',
   '05100000-0000-0000-0000-000000000002', 'pgtap-051 отозвано 91', 'revoked', now() - interval '91 days',
   '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/revoked91.webm'),
  -- a task passed on: the old one closed long ago, the new one with the same recording still open
  ('05100000-0000-0000-0000-0000000000c5', '05100000-0000-0000-0000-00000000000a', '05100000-0000-0000-0000-000000000001',
   '05100000-0000-0000-0000-000000000002', 'pgtap-051 старая', 'done', now() - interval '300 days',
   '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/two-rows.webm'),
  ('05100000-0000-0000-0000-0000000000c6', '05100000-0000-0000-0000-00000000000a', '05100000-0000-0000-0000-000000000001',
   '05100000-0000-0000-0000-000000000002', 'pgtap-051 новая', 'accepted', null,
   '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/two-rows.webm'),
  ('05100000-0000-0000-0000-0000000000c7', '05100000-0000-0000-0000-00000000000a', '05100000-0000-0000-0000-000000000001',
   '05100000-0000-0000-0000-000000000002', 'pgtap-051 в работе', 'accepted', null, null),
  ('05100000-0000-0000-0000-0000000000c8', '05100000-0000-0000-0000-00000000000b', '05100000-0000-0000-0000-000000000004',
   '05100000-0000-0000-0000-000000000005', 'pgtap-051 B сдано 91', 'done', now() - interval '91 days',
   '05100000-0000-0000-0000-00000000000b/05100000-0000-0000-0000-000000000004/b-done91.webm');

-- the thread's voice messages go with their task
insert into task_messages (company_id, task_id, sender_id, type, file_path) values
  ('05100000-0000-0000-0000-00000000000a', '05100000-0000-0000-0000-0000000000c1', '05100000-0000-0000-0000-000000000002',
   'voice', '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000002/thread-done.webm'),
  ('05100000-0000-0000-0000-00000000000a', '05100000-0000-0000-0000-0000000000c7', '05100000-0000-0000-0000-000000000002',
   'voice', '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000002/thread-open.webm');

insert into announcements (company_id, author_id, audio_path, transcript, created_at) values
  ('05100000-0000-0000-0000-00000000000a', '05100000-0000-0000-0000-000000000001',
   '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/announce91.webm',
   'pgtap-051 объявление', now() - interval '91 days');

insert into events (company_id, author_id, title, starts_at, ends_at, audio_path) values
  ('05100000-0000-0000-0000-00000000000a', '05100000-0000-0000-0000-000000000001', 'pgtap-051 прошло',
   now() - interval '92 days', now() - interval '91 days',
   '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/event-ended.webm'),
  ('05100000-0000-0000-0000-00000000000a', '05100000-0000-0000-0000-000000000001', 'pgtap-051 впереди',
   now() + interval '3 days', null,
   '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/event-ahead.webm');

insert into notes (company_id, user_id, text, audio_path, created_at) values
  ('05100000-0000-0000-0000-00000000000a', '05100000-0000-0000-0000-000000000001', 'pgtap-051 мысль',
   '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/note.webm', now() - interval '400 days');

insert into errands (company_id, author_id, kind, label, status, done_at, audio_path) values
  ('05100000-0000-0000-0000-00000000000a', '05100000-0000-0000-0000-000000000001', 'coffee', 'pgtap-051 кофе',
   'done', now() - interval '91 days',
   '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/errand-done.webm'),
  ('05100000-0000-0000-0000-00000000000a', '05100000-0000-0000-0000-000000000001', 'tea', 'pgtap-051 чай',
   'sent', null,
   '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/errand-sent.webm');

insert into recurrence_rules (company_id, author_id, assignee_id, target, title, every, source_audio_path, is_active) values
  ('05100000-0000-0000-0000-00000000000a', '05100000-0000-0000-0000-000000000001', '05100000-0000-0000-0000-000000000002',
   'task', 'pgtap-051 каждый день', 'day',
   '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/rule-active.webm', true);

-- drafts of the pipeline only: nothing came of these
insert into inbox_items (company_id, user_id, status, audio_path) values
  ('05100000-0000-0000-0000-00000000000a', '05100000-0000-0000-0000-000000000001', 'discarded',
   '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/inbox31.webm'),
  ('05100000-0000-0000-0000-00000000000a', '05100000-0000-0000-0000-000000000001', 'parsed',
   '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/inbox29.webm'),
  ('05100000-0000-0000-0000-00000000000b', '05100000-0000-0000-0000-000000000004', 'discarded',
   '05100000-0000-0000-0000-00000000000b/05100000-0000-0000-0000-000000000004/b-inbox31.webm');

-- «в корпус» by hand, as the task allows
insert into voice_kept (path, company_id, kept_by) values
  ('05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/kept.webm',
   '05100000-0000-0000-0000-00000000000a', '05100000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- 1. The term in days: the same defaults and bounds as lib/settings.ts
-- ---------------------------------------------------------------------------
select is(voice_retention_days('{}'::jsonb, 'closed_days', 90), 90, 'no section — the default');
select is(voice_retention_days('{"voice_retention": {"closed_days": 180}}'::jsonb, 'closed_days', 90), 180, 'a set term is read');
select is(voice_retention_days('{"voice_retention": {"closed_days": "forever"}}'::jsonb, 'closed_days', 90), 90, 'a broken term — the default');
select is(voice_retention_days('{"voice_retention": {"orphan_days": 3}}'::jsonb, 'orphan_days', 30), 30, 'below a week — the default');

-- ---------------------------------------------------------------------------
-- 2. voice_purge_due, as the sweep calls it
-- ---------------------------------------------------------------------------
set local role service_role;

select ok(exists (select 1 from voice_purge_due(now(), 100000)
                   where path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/done91.webm'),
          'a task done 91 days ago — due');
select ok(not exists (select 1 from voice_purge_due(now(), 100000)
                       where path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/done89.webm'),
          'a task done 89 days ago — kept');
select ok(not exists (select 1 from voice_purge_due(now(), 100000)
                       where path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/declined.webm'),
          'declined long ago — kept: the director decides');
select ok(exists (select 1 from voice_purge_due(now(), 100000)
                   where path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/revoked91.webm'),
          'revoked 91 days ago — due');
select ok(exists (select 1 from voice_purge_due(now(), 100000)
                   where path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000002/thread-done.webm'),
          'a voice message of a task done 91 days ago — due with it');
select ok(not exists (select 1 from voice_purge_due(now(), 100000)
                       where path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000002/thread-open.webm'),
          'a voice message of an open task — kept');
select ok(not exists (select 1 from voice_purge_due(now(), 100000)
                       where path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/two-rows.webm'),
          'one row closed long ago, another open — kept');
select ok(exists (select 1 from voice_purge_due(now(), 100000)
                   where path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/announce91.webm'),
          'an announcement 91 days ago — due');
select ok(exists (select 1 from voice_purge_due(now(), 100000)
                   where path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/event-ended.webm')
          and not exists (select 1 from voice_purge_due(now(), 100000)
                   where path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/event-ahead.webm'),
          'an event ended 91 days ago — due, one ahead — kept');
select ok(not exists (select 1 from voice_purge_due(now(), 100000)
                       where path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/note.webm'),
          'a living note, however old — kept');
select ok(exists (select 1 from voice_purge_due(now(), 100000)
                   where path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/errand-done.webm')
          and not exists (select 1 from voice_purge_due(now(), 100000)
                   where path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/errand-sent.webm'),
          'an errand done 91 days ago — due, one still asked — kept');
select ok(not exists (select 1 from voice_purge_due(now(), 100000)
                       where path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/rule-active.webm'),
          'an active repeating order — kept');
select ok(exists (select 1 from voice_purge_due(now(), 100000)
                   where path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/inbox31.webm'),
          'only a draft, uploaded 31 days ago — due');
select ok(not exists (select 1 from voice_purge_due(now(), 100000)
                       where path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/inbox29.webm'),
          'only a draft, uploaded 29 days ago — kept');
select ok(not exists (select 1 from voice_purge_due(now(), 100000)
                       where path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/kept.webm'),
          'kept «в корпус» — never');
select ok(not exists (select 1 from voice_purge_due(now(), 100000)
                       where path = '05100000-0000-0000-0000-00000000000b/05100000-0000-0000-0000-000000000004/b-done91.webm'),
          'closed_days = 180: a task done 91 days ago — kept');
select is((select d.company_id from voice_purge_due(now(), 100000) d
            where d.path = '05100000-0000-0000-0000-00000000000b/05100000-0000-0000-0000-000000000004/b-inbox31.webm'),
          '05100000-0000-0000-0000-00000000000b'::uuid,
          'a file of company B comes under company B, never in A''s list');
select ok(not exists (select 1 from voice_purge_due(now(), 100000)
                       where path in ('smoke-051/no-company.webm',
                                      '05100000-0000-0000-0000-0000000000ff/05100000-0000-0000-0000-000000000001/gone-company.webm')),
          'no uuid in the first segment, or no such company — skipped');
select is((select count(*)::int from voice_purge_due(now(), 1)), 1, 'p_limit caps the batch');

-- ---------------------------------------------------------------------------
-- 3. voice_keep: the director of the company, absolute state, own company only
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"05100000-0000-0000-0000-000000000001","role":"authenticated"}';

select throws_ok(
  $$select voice_keep('05100000-0000-0000-0000-00000000000b/05100000-0000-0000-0000-000000000004/b-inbox31.webm', true)$$,
  'P0001', 'forbidden',
  'director A marking a file of company B — forbidden'
);
select lives_ok(
  $$select voice_keep('05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/inbox31.webm', true),
           voice_keep('05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/inbox31.webm', true)$$,
  'director A marks own file «в корпус» twice'
);
select is((select count(*)::int from voice_kept
            where path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/inbox31.webm'),
          1, 'twice is one row, and the director reads it');

set local role service_role;
select ok(not exists (select 1 from voice_purge_due(now(), 100000)
                       where path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/inbox31.webm'),
          'the marked draft leaves the purge list');

set local role authenticated;
set local request.jwt.claims = '{"sub":"05100000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$select voice_keep('05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000002/thread-done.webm', true)$$,
  'P0001', 'forbidden',
  'an employee cannot mark'
);

set local request.jwt.claims = '{"sub":"05100000-0000-0000-0000-000000000003","role":"authenticated"}';
select is((select count(*)::int from voice_kept where company_id = '05100000-0000-0000-0000-00000000000a'),
          2, 'the secretary of A reads A''s marks');

set local request.jwt.claims = '{"sub":"05100000-0000-0000-0000-000000000004","role":"authenticated"}';
select is((select count(*)::int from voice_kept where company_id = '05100000-0000-0000-0000-00000000000a'),
          0, 'the director of B sees none of A''s marks');

set local request.jwt.claims = '{"sub":"05100000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$select voice_keep('05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/inbox31.webm', false)$$,
  'director A takes the mark off'
);

-- the purge functions are the sweep's, never a signed-in person's
select throws_ok($$select * from voice_purge_due()$$, '42501', null, 'authenticated cannot call voice_purge_due');
select throws_ok($$select voice_mark_purged(array['x'])$$, '42501', null, 'authenticated cannot call voice_mark_purged');

-- ---------------------------------------------------------------------------
-- 4. voice_mark_purged: the path becomes null in every table, the texts stay
-- ---------------------------------------------------------------------------
reset role;
update tasks set source_audio_path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/everywhere.webm'
 where id = '05100000-0000-0000-0000-0000000000c7';
update task_messages set file_path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/everywhere.webm'
 where task_id = '05100000-0000-0000-0000-0000000000c7';
update announcements set audio_path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/everywhere.webm'
 where company_id = '05100000-0000-0000-0000-00000000000a';
update events set audio_path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/everywhere.webm'
 where company_id = '05100000-0000-0000-0000-00000000000a' and title = 'pgtap-051 впереди';
update notes set audio_path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/everywhere.webm'
 where company_id = '05100000-0000-0000-0000-00000000000a';
update errands set audio_path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/everywhere.webm'
 where company_id = '05100000-0000-0000-0000-00000000000a' and status = 'sent';
update recurrence_rules set source_audio_path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/everywhere.webm'
 where company_id = '05100000-0000-0000-0000-00000000000a';
update inbox_items set audio_path = '05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/everywhere.webm'
 where company_id = '05100000-0000-0000-0000-00000000000a' and status = 'parsed';

-- as the sweep: the service role and no user in the token, so the field guards see auth.uid() is null
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select is(voice_mark_purged(array['05100000-0000-0000-0000-00000000000a/05100000-0000-0000-0000-000000000001/everywhere.webm']),
          8, 'voice_mark_purged clears the path in all eight tables');
select ok(
  not exists (select 1 from tasks where source_audio_path like '%/everywhere.webm')
  and not exists (select 1 from task_messages where file_path like '%/everywhere.webm')
  and not exists (select 1 from announcements where audio_path like '%/everywhere.webm')
  and not exists (select 1 from events where audio_path like '%/everywhere.webm')
  and not exists (select 1 from notes where audio_path like '%/everywhere.webm')
  and not exists (select 1 from errands where audio_path like '%/everywhere.webm')
  and not exists (select 1 from recurrence_rules where source_audio_path like '%/everywhere.webm')
  and not exists (select 1 from inbox_items where audio_path like '%/everywhere.webm')
  and exists (select 1 from notes where company_id = '05100000-0000-0000-0000-00000000000a' and text = 'pgtap-051 мысль')
  and exists (select 1 from tasks where source_audio_path like '%/done91.webm'),
  'no row keeps the purged path, the text stays, other paths are untouched'
);

select * from finish();
rollback;
