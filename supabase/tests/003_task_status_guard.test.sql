-- Status transition matrix (docs/BACKEND.md section 7) enforced by trg_task_status_guard.
begin;
select plan(7);

-- assignee (Ерлан Б.) accepts a sent task
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';

select lives_ok(
  $$ update tasks set status = 'accepted' where id = '20000000-0000-0000-0000-000000000002' $$,
  'assignee: sent -> accepted'
);

select ok(
  (select accepted_at is not null from tasks where id = '20000000-0000-0000-0000-000000000002'),
  'accepted_at is stamped by the guard'
);

-- assignee (Айгуль) may not close her own task
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated"}';
select throws_ok(
  $$ update tasks set status = 'done' where id = '20000000-0000-0000-0000-000000000005' $$,
  'P0001',
  'invalid_transition',
  'assignee cannot do pending_review -> done'
);

-- only the director closes a task
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ update tasks set status = 'done' where id = '20000000-0000-0000-0000-000000000005' $$,
  'director: pending_review -> done'
);

select is(
  (select count(*) from task_messages
    where task_id = '20000000-0000-0000-0000-000000000005'
      and type = 'status_change'
      and meta->>'new_status' = 'done'),
  1::bigint,
  'the status change left a status_change message'
);

select throws_ok(
  $$ update tasks set status = 'accepted' where id = '20000000-0000-0000-0000-000000000006' $$,
  'P0001',
  'invalid_transition',
  'done is terminal: done -> accepted is refused'
);

select lives_ok(
  $$ update tasks set status = 'revoked' where id = '20000000-0000-0000-0000-000000000010' $$,
  'director: sent -> revoked'
);

set local role postgres;
select * from finish();
rollback;
