-- Read cursors are private to the person who set them (D-61).
begin;
select plan(4);

-- the director marks task 004 read up to seq 5
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
insert into task_reads (task_id, user_id, company_id, last_seq)
values ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 5);
select is(
  (select last_seq from task_reads where task_id = '20000000-0000-0000-0000-000000000004'),
  5,
  'director sees own cursor'
);

-- nobody can write a cursor for somebody else
select throws_ok(
  $$ insert into task_reads (task_id, user_id, company_id, last_seq)
     values ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 1) $$,
  '42501',
  null,
  'director cannot write a cursor for the employee'
);

-- the assignee (Марат) of the same task does not see the director's cursor
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select is(
  (select count(*) from task_reads where task_id = '20000000-0000-0000-0000-000000000004'),
  0::bigint,
  'employee does not see the director''s cursor'
);

-- and keeps their own
insert into task_reads (task_id, user_id, company_id, last_seq)
values ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 2);
select is(
  (select last_seq from task_reads where task_id = '20000000-0000-0000-0000-000000000004'),
  2,
  'employee sees own cursor only'
);

set local role postgres;
select * from finish();
rollback;
