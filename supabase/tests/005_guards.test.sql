-- Review fixes of task 005: tv isolation, task field guard, stamp ownership,
-- protected profile fields, service-role bypass.
begin;
select plan(10);

-- tv kiosk user sees nothing but its own profile row (case 6, partial)
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is((select count(*) from tasks), 0::bigint, 'tv sees no tasks');
select is((select count(*) from companies), 0::bigint, 'tv sees no company row');
select is(
  (select count(*) from profiles),
  1::bigint,
  'tv sees exactly its own profile row'
);

-- assignee (Ерлан Б.) may change nothing but the status of his task
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';
select throws_ok(
  $$ update tasks set title = 'Другой заголовок' where id = '20000000-0000-0000-0000-000000000002' $$,
  'P0001', 'forbidden_field_update',
  'assignee cannot edit the title'
);
select throws_ok(
  $$ update tasks set assignee_id = '10000000-0000-0000-0000-000000000006'
     where id = '20000000-0000-0000-0000-000000000002' $$,
  'P0001', 'forbidden_field_update',
  'assignee cannot reassign the task'
);
select throws_ok(
  $$ update tasks set accepted_at = now() - interval '1 hour'
     where id = '20000000-0000-0000-0000-000000000002' $$,
  'P0001', 'forbidden_field_update',
  'assignee cannot touch stamps without a transition'
);

-- a client-supplied stamp is ignored on a legal transition: the guard stamps now()
select lives_ok(
  $$ update tasks set status = 'accepted', accepted_at = now() - interval '1 hour'
     where id = '20000000-0000-0000-0000-000000000002' $$,
  'assignee: sent -> accepted with a forged accepted_at'
);
select ok(
  (select accepted_at > now() - interval '1 minute'
     from tasks where id = '20000000-0000-0000-0000-000000000002'),
  'accepted_at was set by the guard, not taken from the client'
);

-- employee cannot farm his own streak
select throws_ok(
  $$ update profiles set streak_count = 99 where id = '10000000-0000-0000-0000-000000000005' $$,
  'P0001', 'forbidden_field_update',
  'employee cannot edit streak_count'
);

-- service role (no auth.uid()) runs offboarding: protected fields are writable
set local role postgres;
set local request.jwt.claims = '';
select lives_ok(
  $$ update profiles set is_active = false where id = '10000000-0000-0000-0000-000000000008' $$,
  'service role can deactivate a profile'
);

select * from finish();
rollback;
