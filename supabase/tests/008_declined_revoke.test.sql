-- "Отменить" on a declined task: the director revokes it (CONCEPT §4, task 010 review).
begin;
select plan(3);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select revoke_task(task_id := '20000000-0000-0000-0000-000000000008'::uuid)->>'action'),
  'revoked',
  'director: declined -> revoked'
);
select is(
  (select status from tasks where id = '20000000-0000-0000-0000-000000000008'),
  'revoked'::task_status,
  'the declined task is now revoked'
);

-- done stays final
select throws_ok(
  $$ select revoke_task(task_id := '20000000-0000-0000-0000-000000000006'::uuid) $$,
  'P0001', 'invalid_transition',
  'director cannot revoke a done task'
);

set local role postgres;
select * from finish();
rollback;
