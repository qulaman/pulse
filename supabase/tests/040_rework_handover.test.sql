-- D-130: «Выполнено» after a rework is one call — transition_task walks rework → accepted →
-- pending_review itself, the report travels in the same transaction, a replay of the key is a
-- duplicate, and nobody else can walk that edge.
-- Counts are scoped to this file's rows: dev holds other people's tasks and queues.
-- Fixtures — supabase/seed.sql: director …0001, Марат …0007, Ерлан Б. …0005.
begin;
select plan(12);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
update profiles set role = 'employee', is_active = true
 where id in ('10000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000005');
update companies set settings = jsonb_set(coalesce(settings, '{}'), '{delivery_window}', '{"from":"00:00","to":"23:59"}')
 where id = '11111111-1111-1111-1111-111111111111';

insert into tasks (id, company_id, author_id, assignee_id, title, status, deadline, created_at, accepted_at) values
  ('96000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'Смета ERG, доработка', 'rework',
   now() + interval '1 day', now() - interval '1 day', now() - interval '1 day'),
  ('96000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'Договор, доработка', 'rework',
   now() + interval '1 day', now() - interval '1 day', now() - interval '1 day'),
  ('96000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'Пропуска, новая', 'sent',
   now() + interval '1 day', now() - interval '1 hour', null);

-- ---------------------------------------------------------------------------
-- 1. The assignee hands the rework in with one call, the report inside it
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';

select lives_ok(
  $$ select transition_task('96000000-0000-0000-0000-000000000001', 'pending_review',
       '{"report":{"text":"Исправил итог и НДС"}}'::jsonb, '96000000-0000-0000-0000-0000000000a1') $$,
  'rework → pending_review by the assignee in one call'
);
select is(
  (select status from tasks where id = '96000000-0000-0000-0000-000000000001'),
  'pending_review'::task_status,
  'the task is on the director''s review'
);
select ok(
  (select completed_at is not null from tasks where id = '96000000-0000-0000-0000-000000000001'),
  'the handover time is set'
);
select is(
  (select content from task_messages
    where task_id = '96000000-0000-0000-0000-000000000001' and meta ->> 'report' = 'true'),
  'Исправил итог и НДС',
  'the report is in the thread, from the same transaction'
);
select is(
  ((transition_task('96000000-0000-0000-0000-000000000001', 'pending_review',
     '{"report":{"text":"Исправил итог и НДС"}}'::jsonb, '96000000-0000-0000-0000-0000000000a1')) ->> 'duplicate'),
  'true',
  'a replay of the same key is a duplicate'
);
select is(
  (select count(*)::int from task_messages
    where task_id = '96000000-0000-0000-0000-000000000001' and meta ->> 'report' = 'true'),
  1,
  'the replay wrote no second report'
);
reset role;
select is(
  (select count(*)::int from notification_deliveries
    where task_id = '96000000-0000-0000-0000-000000000001' and event_kind = 'pending_review'
      and user_id = '10000000-0000-0000-0000-000000000001'),
  1,
  'the director gets one «на приёмку»'
);
select is(
  (select count(*)::int from notification_deliveries
    where task_id = '96000000-0000-0000-0000-000000000001' and event_kind not in ('pending_review', 'message')),
  0,
  'the step through «accepted» pushes nothing of its own'
);

-- ---------------------------------------------------------------------------
-- 2. Nobody else walks that edge, and it is not a way around «Принял»
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';
select throws_ok(
  $$ select transition_task('96000000-0000-0000-0000-000000000002', 'pending_review', '{}'::jsonb) $$,
  'P0001', 'invalid_transition',
  'another employee cannot hand in someone''s rework'
);
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select transition_task('96000000-0000-0000-0000-000000000002', 'pending_review', '{}'::jsonb) $$,
  'P0001', 'invalid_transition',
  'the director cannot hand it in for the employee'
);
reset role;
select is(
  (select status from tasks where id = '96000000-0000-0000-0000-000000000002'),
  'rework'::task_status,
  'a refused call leaves the rework as it was'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select throws_ok(
  $$ select transition_task('96000000-0000-0000-0000-000000000003', 'pending_review', '{}'::jsonb) $$,
  'P0001', 'invalid_transition',
  'a new task still has to be taken first — only rework is walked'
);

reset role;
select * from finish();
rollback;
