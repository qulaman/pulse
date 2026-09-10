-- transition_task / revoke_task: the matrix of docs/BACKEND.md section 7 plus
-- "Настоять" (declined -> sent, G.20), revoke (D-01) and idempotency (G.3).
begin;
select plan(12);

-- ---------------------------------------------------------------------------
-- The assignee accepts his task
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';

select is(
  (select transition_task(
     task_id := '20000000-0000-0000-0000-000000000002'::uuid,
     to_status := 'accepted'::task_status)->>'status'),
  'accepted',
  'assignee: sent -> accepted'
);

-- ---------------------------------------------------------------------------
-- The assignee cannot close his own task
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated"}';
select throws_ok(
  $$ select transition_task(
       task_id := '20000000-0000-0000-0000-000000000005'::uuid,
       to_status := 'done'::task_status) $$,
  'P0001', 'invalid_transition',
  'assignee cannot do pending_review -> done'
);

-- ---------------------------------------------------------------------------
-- "Не могу": the reason becomes a message of the task
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}';
select is(
  (select transition_task(
     task_id := '20000000-0000-0000-0000-000000000010'::uuid,
     to_status := 'declined'::task_status,
     payload := '{"reason":"Это не ко мне"}'::jsonb)->>'status'),
  'declined',
  'assignee: sent -> declined'
);
select is(
  (select count(*) from task_messages
    where task_id = '20000000-0000-0000-0000-000000000010'
      and content = 'Это не ко мне'
      and (meta->>'decline_reason')::boolean),
  1::bigint,
  'the decline reason is stored as a message'
);

-- ---------------------------------------------------------------------------
-- "Настоять": the director sends a declined task back (G.20)
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (select transition_task(
     task_id := '20000000-0000-0000-0000-000000000008'::uuid,
     to_status := 'sent'::task_status)->>'status'),
  'sent',
  'director: declined -> sent'
);
select ok(
  (select closed_at is null from tasks where id = '20000000-0000-0000-0000-000000000008'),
  'the re-sent task is open again: closed_at is cleared'
);

-- ---------------------------------------------------------------------------
-- revoke_task (D-01): a scheduled task was delivered to nobody -> delete
-- ---------------------------------------------------------------------------
select is(
  (select revoke_task(task_id := '20000000-0000-0000-0000-000000000001'::uuid)->>'action'),
  'deleted',
  'director: a scheduled task is deleted, not revoked'
);
select is(
  (select count(*) from tasks where id = '20000000-0000-0000-0000-000000000001'),
  0::bigint,
  'the scheduled task is gone'
);

-- anything already delivered is revoked and stays visible
select is(
  (select revoke_task(task_id := '20000000-0000-0000-0000-000000000003'::uuid)->>'action'),
  'revoked',
  'director: an accepted task is revoked'
);
select is(
  (select status from tasks where id = '20000000-0000-0000-0000-000000000003'),
  'revoked'::task_status,
  'the task carries the revoked status'
);

-- ---------------------------------------------------------------------------
-- Idempotency: a retry with the same client_request_id changes nothing (G.3)
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';

create temp table rework_accept as
select transition_task(
  task_id := '20000000-0000-0000-0000-000000000007'::uuid,
  to_status := 'accepted'::task_status,
  payload := '{}'::jsonb,
  client_request_id := '41000000-0000-0000-0000-000000000001'::uuid) as r;

create temp table rework_retry as
select transition_task(
  task_id := '20000000-0000-0000-0000-000000000007'::uuid,
  to_status := 'accepted'::task_status,
  payload := '{}'::jsonb,
  client_request_id := '41000000-0000-0000-0000-000000000001'::uuid) as r;

select is(
  (select r - 'duplicate' from rework_retry),
  (select r - 'duplicate' from rework_accept),
  'the retry returns the stored result instead of raising'
);

-- ---------------------------------------------------------------------------
-- anon has no execute grant on the RPC
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$ select transition_task(
       task_id := '20000000-0000-0000-0000-000000000002'::uuid,
       to_status := 'pending_review'::task_status) $$,
  '42501', 'permission denied for function transition_task',
  'anon cannot execute transition_task'
);

set local role postgres;
select * from finish();
rollback;
