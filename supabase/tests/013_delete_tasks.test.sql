-- Hard deletes are the director's only: delete_task / purge_closed_tasks (2026-09-16).
begin;
select plan(6);

-- an employee (Ерлан Б.) may not delete, not even his own task
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';
select throws_ok(
  $$ select delete_task(task_id := '20000000-0000-0000-0000-000000000002'::uuid) $$,
  'P0001', 'forbidden',
  'employee cannot delete a task'
);
select throws_ok(
  $$ select purge_closed_tasks() $$,
  'P0001', 'forbidden',
  'employee cannot purge closed tasks'
);

-- the director deletes a done task; its messages go with it
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (select delete_task(task_id := '20000000-0000-0000-0000-000000000006'::uuid)->>'deleted'),
  '1',
  'director: done task deleted'
);
select is(
  (select count(*) from tasks where id = '20000000-0000-0000-0000-000000000006'),
  0::bigint,
  'the deleted task is gone'
);

-- purge takes the rest of the closed ones (declined 008, revoked 009), leaves the open ones
select ok(
  (select (purge_closed_tasks()->>'deleted')::int >= 2),
  'director: purge removed the closed tasks'
);
select is(
  (select count(*) from tasks where company_id = '11111111-1111-1111-1111-111111111111' and status in ('done','declined','revoked')),
  0::bigint,
  'no closed task is left, open ones untouched'
);

set local role postgres;
select * from finish();
rollback;
