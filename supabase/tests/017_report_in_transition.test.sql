-- The report of a handover travels inside the transition (D-64 §3, наряд 011C): one
-- transaction, one idempotency key, one row in the thread — and no second push, because
-- `pending_review` already says what happened.
begin;
select plan(5);

set local role authenticated;
-- Марат hands over task 004 with words and nothing else
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';

select transition_task(
  task_id := '20000000-0000-0000-0000-000000000004'::uuid,
  to_status := 'pending_review'::task_status,
  payload := '{"report":{"text":"Остатки сверил, недостача по трубе"}}'::jsonb,
  client_request_id := 'aaaaaaaa-0000-0000-0000-000000000001'::uuid);

select is(
  (select count(*) from task_messages
    where task_id = '20000000-0000-0000-0000-000000000004' and coalesce((meta->>'report')::boolean, false)),
  1::bigint,
  'the report is one message of the thread'
);
select is(
  (select content from task_messages
    where task_id = '20000000-0000-0000-0000-000000000004' and coalesce((meta->>'report')::boolean, false)),
  'Остатки сверил, недостача по трубе',
  'and it carries the words of the handover'
);
select is(
  (select status::text from tasks where id = '20000000-0000-0000-0000-000000000004'),
  'pending_review',
  'the task is waiting for the director'
);
select is(
  (select count(*) from notification_deliveries
    where task_id = '20000000-0000-0000-0000-000000000004' and event_kind = 'pending_review'),
  1::bigint,
  'one push about the handover'
);

-- the same tap replayed from the outbox changes nothing
select transition_task(
  task_id := '20000000-0000-0000-0000-000000000004'::uuid,
  to_status := 'pending_review'::task_status,
  payload := '{"report":{"text":"Остатки сверил, недостача по трубе"}}'::jsonb,
  client_request_id := 'aaaaaaaa-0000-0000-0000-000000000001'::uuid);
select is(
  (select count(*) from task_messages
    where task_id = '20000000-0000-0000-0000-000000000004' and coalesce((meta->>'report')::boolean, false)),
  1::bigint,
  'a replay of the same call adds nothing'
);

set local role postgres;
select * from finish();
rollback;
