-- extend_task_deadline («Продлить») and reassign_task («Переназначить»): director-only,
-- a system line in the thread, the outbox row for the person, the old task closed.
begin;
select plan(9);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- «Продлить» on an accepted task
select is(
  (select extend_task_deadline(
     task_id := '20000000-0000-0000-0000-000000000003'::uuid,
     new_deadline := '2030-09-12 08:00:00+00'::timestamptz)->>'task_id'),
  '20000000-0000-0000-0000-000000000003',
  'director extends the deadline of an accepted task'
);
select is(
  (select deadline from tasks where id = '20000000-0000-0000-0000-000000000003'),
  '2030-09-12 08:00:00+00'::timestamptz,
  'the new deadline is stored'
);
select is(
  (select content from task_messages
    where task_id = '20000000-0000-0000-0000-000000000003' and type = 'system'
    order by created_at desc limit 1),
  'Срок продлён до 12.09 13:00',
  'the thread says when the new deadline is, in Aqtobe time'
);
select is(
  (select count(*) from notification_deliveries
    where task_id = '20000000-0000-0000-0000-000000000003' and event_kind = 'deadline_extended'
      and user_id = '10000000-0000-0000-0000-000000000006'),
  1::bigint,
  'the assignee gets a push about the new deadline'
);

-- a done task cannot be extended
select throws_ok(
  $$ select extend_task_deadline(
       task_id := '20000000-0000-0000-0000-000000000006'::uuid,
       new_deadline := now() + interval '1 day') $$,
  'P0001', 'invalid_transition',
  'a closed task keeps its deadline'
);

-- «Переназначить» a declined task to another person
select is(
  (select reassign_task(
     task_id := '20000000-0000-0000-0000-000000000008'::uuid,
     new_assignee_id := '10000000-0000-0000-0000-000000000005'::uuid)->>'old_task_id'),
  '20000000-0000-0000-0000-000000000008',
  'director reassigns a declined task'
);
select is(
  (select status from tasks where id = '20000000-0000-0000-0000-000000000008'),
  'revoked'::task_status,
  'the old task is revoked'
);
select is(
  (select count(*) from tasks
    where parent_task_id = '20000000-0000-0000-0000-000000000008'
      and assignee_id = '10000000-0000-0000-0000-000000000005' and status = 'sent'),
  1::bigint,
  'a fresh sent task for the new person points at the old one'
);

-- an employee may do neither
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';
select throws_ok(
  $$ select reassign_task(
       task_id := '20000000-0000-0000-0000-000000000002'::uuid,
       new_assignee_id := '10000000-0000-0000-0000-000000000006'::uuid) $$,
  'P0001', 'forbidden',
  'an employee cannot reassign'
);

select * from finish();
rollback;
