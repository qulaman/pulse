-- RLS on tasks: cases 1, 3, 4, 5, 7 of docs/DATABASE.md "RLS-тесты".
-- Fixtures come from supabase/seed.sql.
begin;
select plan(6);

-- case 1: employee (Ерлан Б.) reads a task that belongs to somebody else
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';
select is(
  (select count(*) from tasks where id = '20000000-0000-0000-0000-000000000005'),
  0::bigint,
  'employee does not see a task assigned to another employee'
);

-- case 3: the same employee does not see his own task while it is scheduled
select is(
  (select count(*) from tasks where id = '20000000-0000-0000-0000-000000000001'),
  0::bigint,
  'employee does not see a scheduled task, even his own'
);

-- case 4: manager (Динара) sees the task of her direct subordinate (Марат)
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is(
  (select count(*) from tasks where id = '20000000-0000-0000-0000-000000000004'),
  1::bigint,
  'manager sees the task of a direct subordinate'
);

-- case 5: the same manager does not see the task of somebody outside her subtree
select is(
  (select count(*) from tasks where id = '20000000-0000-0000-0000-000000000002'),
  0::bigint,
  'manager does not see the task of a non-subordinate'
);

-- case 7: anon sees nothing at all
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select is((select count(*) from tasks), 0::bigint, 'anon sees no tasks');
select is((select count(*) from profiles), 0::bigint, 'anon sees no profiles');

set local role postgres;
select * from finish();
rollback;
