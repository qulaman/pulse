-- The read cursor moves through mark_thread_read() and only forward (D-61, наряд 011E):
-- an offline replay of an older «Прочитал» must not light the row up again, and the
-- cursor of one person is never the cursor of another.
begin;
select plan(6);

-- a task of another company, to prove the function refuses what the caller cannot see
insert into companies (id, name) values ('99999999-9999-9999-9999-999999999999', 'Чужая компания');
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-000000000000', '99999999-0000-0000-0000-000000000001',
        'authenticated', 'authenticated', 'foreign@demo.local', now(), now(), '', '', '', '', '', '', '', '');
insert into profiles (id, company_id, full_name, role) values
  ('99999999-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999', 'Чужой Директор', 'director');
insert into tasks (id, company_id, author_id, assignee_id, title, status) values
  ('99999999-0000-0000-0000-000000000002', '99999999-9999-9999-9999-999999999999',
   '99999999-0000-0000-0000-000000000001', '99999999-0000-0000-0000-000000000001', 'Чужая задача', 'sent');

-- the director reads Марат's thread (task 004) up to seq 5
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  mark_thread_read('20000000-0000-0000-0000-000000000004'::uuid, 5::bigint),
  5::bigint,
  'the cursor is set and returned'
);

-- the same «Прочитал» replayed from the outbox with an older seq changes nothing
select is(
  mark_thread_read('20000000-0000-0000-0000-000000000004'::uuid, 2::bigint),
  5::bigint,
  'an older seq never drags the cursor back'
);
select is(
  (select last_seq from task_reads
    where task_id = '20000000-0000-0000-0000-000000000004'
      and user_id = '10000000-0000-0000-0000-000000000001'),
  5::bigint,
  'the stored cursor is the greatest of the two'
);

-- a task of another company is not a task this caller has
select throws_ok(
  $$ select mark_thread_read('99999999-0000-0000-0000-000000000002'::uuid, 1::bigint) $$,
  'P0001',
  'task_not_found',
  'a thread of another company cannot be marked read'
);

-- Марат keeps his own cursor on the same task
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select is(
  mark_thread_read('20000000-0000-0000-0000-000000000004'::uuid, 3::bigint),
  3::bigint,
  'the employee writes their own row'
);

set local role postgres;
select is(
  (select last_seq from task_reads
    where task_id = '20000000-0000-0000-0000-000000000004'
      and user_id = '10000000-0000-0000-0000-000000000001'),
  5::bigint,
  'and leaves the director''s cursor where it was'
);

select * from finish();
rollback;
