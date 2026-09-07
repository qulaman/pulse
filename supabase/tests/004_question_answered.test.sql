-- G.7: the first answer of the director closes every open question of the task.
begin;
select plan(3);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select count(*) from task_messages
    where task_id = '20000000-0000-0000-0000-000000000002'
      and meta->>'is_question' = 'true'
      and meta->>'answered_at' is null),
  1::bigint,
  'the seeded task has exactly one open question'
);

select lives_ok(
  $$ insert into task_messages (company_id, task_id, sender_id, type, content)
     values ('11111111-1111-1111-1111-111111111111',
             '20000000-0000-0000-0000-000000000002',
             '10000000-0000-0000-0000-000000000001',
             'text', 'Копии, оригиналы не нужны') $$,
  'director answers in the task thread'
);

select is(
  (select count(*) from task_messages
    where task_id = '20000000-0000-0000-0000-000000000002'
      and meta->>'is_question' = 'true'
      and meta->>'answered_at' is null),
  0::bigint,
  'the answer stamped answered_at on the open question'
);

set local role postgres;
select * from finish();
rollback;
