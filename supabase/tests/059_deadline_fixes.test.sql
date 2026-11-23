-- «Срок» (20261123120000_deadline_fixes): a task held for later takes a new deadline quietly;
-- a time already behind is refused; the same deadline again is no news (no «Срок продлён», no
-- «Срок снят», no push); a system line of the author answers only a question about time, the
-- author's words answer every question; the deadline changes only by the director on an open
-- task, a direct update included. The employee may not move it, and company B's director reaches
-- nothing of company A (принцип 6).
-- Own fixtures: company A — director DA, manager MA, employee EA; company B — director DB.
-- Counts are scoped to this file's tasks: dev holds other people's tasks and queues.
begin;
select plan(31);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into companies (id, name, settings) values
  ('05900000-0000-0000-0000-000000000a00', 'pgtap-059 Компания A',
   '{"delivery_window": {"from": "00:00", "to": "23:59"}}'),
  ('05900000-0000-0000-0000-000000000b00', 'pgtap-059 Компания B',
   '{"delivery_window": {"from": "00:00", "to": "23:59"}}');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, now(), now(),
       '', '', '', '', '', '', '', ''
  from (values ('05900000-0000-0000-0000-0000000000a1'::uuid, 'pgtap-059-da@demo.local'),
               ('05900000-0000-0000-0000-0000000000a2'::uuid, 'pgtap-059-ma@demo.local'),
               ('05900000-0000-0000-0000-0000000000a3'::uuid, 'pgtap-059-ea@demo.local'),
               ('05900000-0000-0000-0000-0000000000b1'::uuid, 'pgtap-059-db@demo.local')) u(id, email);

insert into profiles (id, company_id, full_name, role, is_active, availability) values
  ('05900000-0000-0000-0000-0000000000a1', '05900000-0000-0000-0000-000000000a00', 'pgtap-059 Директор A', 'director', true, 'active'),
  ('05900000-0000-0000-0000-0000000000a2', '05900000-0000-0000-0000-000000000a00', 'pgtap-059 Руководитель A', 'manager', true, 'active'),
  ('05900000-0000-0000-0000-0000000000a3', '05900000-0000-0000-0000-000000000a00', 'pgtap-059 Сотрудник A', 'employee', true, 'active'),
  ('05900000-0000-0000-0000-0000000000b1', '05900000-0000-0000-0000-000000000b00', 'pgtap-059 Директор B', 'director', true, 'active');

-- t1 held for later; t2 in work with a deadline; t3 in work without one; t4 in work with two
-- open questions; t5 the manager's; t6 done; t7 open for a direct update; t8 the question words
insert into tasks (id, company_id, author_id, assignee_id, title, status, deadline, scheduled_send_at, accepted_at, completed_at, closed_at) values
  ('05900000-0000-0000-0000-000000000001', '05900000-0000-0000-0000-000000000a00',
   '05900000-0000-0000-0000-0000000000a1', '05900000-0000-0000-0000-0000000000a3', 'pgtap-059 Отложенная', 'scheduled',
   now() + interval '2 day', now() + interval '1 day', null, null, null),
  ('05900000-0000-0000-0000-000000000002', '05900000-0000-0000-0000-000000000a00',
   '05900000-0000-0000-0000-0000000000a1', '05900000-0000-0000-0000-0000000000a3', 'pgtap-059 Смета', 'accepted',
   now() + interval '1 day', null, now() - interval '1 hour', null, null),
  ('05900000-0000-0000-0000-000000000003', '05900000-0000-0000-0000-000000000a00',
   '05900000-0000-0000-0000-0000000000a1', '05900000-0000-0000-0000-0000000000a3', 'pgtap-059 Без срока', 'accepted',
   null, null, now() - interval '1 hour', null, null),
  ('05900000-0000-0000-0000-000000000004', '05900000-0000-0000-0000-000000000a00',
   '05900000-0000-0000-0000-0000000000a1', '05900000-0000-0000-0000-0000000000a3', 'pgtap-059 Презентация', 'accepted',
   now() + interval '1 day', null, now() - interval '1 hour', null, null),
  ('05900000-0000-0000-0000-000000000005', '05900000-0000-0000-0000-000000000a00',
   '05900000-0000-0000-0000-0000000000a2', '05900000-0000-0000-0000-0000000000a3', 'pgtap-059 От руководителя', 'accepted',
   now() + interval '1 day', null, now() - interval '1 hour', null, null),
  ('05900000-0000-0000-0000-000000000006', '05900000-0000-0000-0000-000000000a00',
   '05900000-0000-0000-0000-0000000000a1', '05900000-0000-0000-0000-0000000000a3', 'pgtap-059 Закрытая', 'done',
   now() + interval '1 day', null, now() - interval '3 hour', now() - interval '2 hour', now() - interval '1 hour'),
  ('05900000-0000-0000-0000-000000000007', '05900000-0000-0000-0000-000000000a00',
   '05900000-0000-0000-0000-0000000000a1', '05900000-0000-0000-0000-0000000000a3', 'pgtap-059 Открытая', 'accepted',
   now() + interval '1 day', null, now() - interval '1 hour', null, null),
  ('05900000-0000-0000-0000-000000000008', '05900000-0000-0000-0000-000000000a00',
   '05900000-0000-0000-0000-0000000000a1', '05900000-0000-0000-0000-0000000000a3', 'pgtap-059 Вопросы', 'accepted',
   now() + interval '1 day', null, now() - interval '1 hour', null, null);

insert into task_messages (company_id, task_id, sender_id, type, content, meta)
select '05900000-0000-0000-0000-000000000a00', q.task_id, '05900000-0000-0000-0000-0000000000a3', 'text', q.content,
       '{"is_question": true}'::jsonb
  from (values ('05900000-0000-0000-0000-000000000004'::uuid, 'Какой формат?'),
               ('05900000-0000-0000-0000-000000000004'::uuid, 'Когда срок?'),
               ('05900000-0000-0000-0000-000000000008'::uuid, 'Когда срок?'),
               ('05900000-0000-0000-0000-000000000008'::uuid, 'когда сдавать?'),
               ('05900000-0000-0000-0000-000000000008'::uuid, 'До какого числа?'),
               ('05900000-0000-0000-0000-000000000008'::uuid, 'На когда ставить?'),
               ('05900000-0000-0000-0000-000000000008'::uuid, 'А какой срок?'),
               ('05900000-0000-0000-0000-000000000008'::uuid, 'Какой формат?'),
               ('05900000-0000-0000-0000-000000000008'::uuid, 'Срочно нужно?'),
               ('05900000-0000-0000-0000-000000000008'::uuid, 'Сроки какие?'),
               ('05900000-0000-0000-0000-000000000008'::uuid, 'Когда-нибудь успею?')) q(task_id, content);

-- what the queues held before the calls
create temp table d059 as
select t.id as task_id,
       (select count(*) from task_messages m where m.task_id = t.id) as messages,
       (select count(*) from notification_deliveries d where d.task_id = t.id) as deliveries
  from tasks t where t.company_id = '05900000-0000-0000-0000-000000000a00';
grant select on d059 to public;

-- ---------------------------------------------------------------------------
-- 1. A task held for later: the date changes, nobody is told
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"05900000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is(
  (select (extend_task_deadline('05900000-0000-0000-0000-000000000001', now() + interval '3 day',
                                '05900000-0000-0000-0000-00000000c001')) ->> 'task_id'),
  '05900000-0000-0000-0000-000000000001',
  'the director moves the deadline of a task held for later'
);
select is(
  (select deadline from tasks where id = '05900000-0000-0000-0000-000000000001'),
  now() + interval '3 day',
  'the new deadline is stored'
);
select is(
  (select (extend_task_deadline('05900000-0000-0000-0000-000000000001', now() + interval '3 day',
                                '05900000-0000-0000-0000-00000000c001')) ->> 'duplicate'),
  'true',
  'a repeat of the same request is a duplicate'
);
reset role;
select is(
  (select count(*) from task_messages where task_id = '05900000-0000-0000-0000-000000000001'),
  (select messages from d059 where task_id = '05900000-0000-0000-0000-000000000001'),
  'no line in the thread of a task the assignee does not see yet'
);
select is(
  (select count(*) from notification_deliveries where task_id = '05900000-0000-0000-0000-000000000001'),
  (select deliveries from d059 where task_id = '05900000-0000-0000-0000-000000000001'),
  'no push about it either'
);
select is(
  (select status from tasks where id = '05900000-0000-0000-0000-000000000001'),
  'scheduled'::task_status,
  'the task still waits for its send'
);

-- ---------------------------------------------------------------------------
-- 2. A time already behind is refused; the same deadline again is no news
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"05900000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select throws_ok(
  $$ select extend_task_deadline('05900000-0000-0000-0000-000000000002', now() - interval '1 minute') $$,
  'P0001', 'deadline_in_past',
  'a deadline already behind is refused'
);
select throws_ok(
  $$ select extend_task_deadline('05900000-0000-0000-0000-000000000001', now() + interval '12 hour') $$,
  'P0001', 'deadline_before_send',
  'a held task does not take a deadline before it goes out'
);
select throws_ok(
  $$ select extend_task_deadline('05900000-0000-0000-0000-000000000006', now() + interval '2 day') $$,
  'P0001', 'invalid_transition',
  'a closed task keeps its deadline'
);
select is(
  (select (extend_task_deadline('05900000-0000-0000-0000-000000000002', now() + interval '3 day')) ->> 'unchanged'),
  null,
  'a new date is news'
);
select is(
  (select (extend_task_deadline('05900000-0000-0000-0000-000000000002', now() + interval '3 day')) ->> 'unchanged'),
  'true',
  'the same date again says unchanged'
);
reset role;
select is(
  (select count(*) from task_messages where task_id = '05900000-0000-0000-0000-000000000002' and type = 'system'),
  1::bigint,
  'one «Срок продлён», not two'
);
select is(
  (select count(*) from notification_deliveries where task_id = '05900000-0000-0000-0000-000000000002'),
  (select deliveries + 1 from d059 where task_id = '05900000-0000-0000-0000-000000000002'),
  'one push, not two'
);

set local role authenticated;
select is(
  (select (extend_task_deadline('05900000-0000-0000-0000-000000000003', null)) ->> 'unchanged'),
  'true',
  '«без срока» on a task without a deadline changes nothing'
);
reset role;
select is(
  (select count(*) from task_messages where task_id = '05900000-0000-0000-0000-000000000003'),
  (select messages from d059 where task_id = '05900000-0000-0000-0000-000000000003'),
  'no false «Срок снят»'
);
select is(
  (select count(*) from notification_deliveries where task_id = '05900000-0000-0000-0000-000000000003'),
  (select deliveries from d059 where task_id = '05900000-0000-0000-0000-000000000003'),
  'and no push'
);

-- ---------------------------------------------------------------------------
-- 3. A new deadline answers «Когда срок?», not «Какой формат?»
-- ---------------------------------------------------------------------------
set local role authenticated;
select lives_ok(
  $$ select extend_task_deadline('05900000-0000-0000-0000-000000000004', now() + interval '4 day') $$,
  'the director moves the deadline of a task with two open questions'
);
reset role;
select ok(
  (select meta ->> 'answered_at' is not null from task_messages
    where task_id = '05900000-0000-0000-0000-000000000004' and content = 'Когда срок?'),
  'the question about time is answered by the new deadline'
);
select ok(
  (select meta ->> 'answered_at' is null from task_messages
    where task_id = '05900000-0000-0000-0000-000000000004' and content = 'Какой формат?'),
  'the question about the format stays open'
);
set local role authenticated;
select lives_ok(
  $$ insert into task_messages (company_id, task_id, sender_id, type, content)
     values ('05900000-0000-0000-0000-000000000a00', '05900000-0000-0000-0000-000000000004',
             '05900000-0000-0000-0000-0000000000a1', 'text', 'PDF, на одну страницу') $$,
  'the director answers in words'
);
reset role;
select ok(
  (select meta ->> 'answered_at' is not null from task_messages
    where task_id = '05900000-0000-0000-0000-000000000004' and content = 'Какой формат?'),
  'the director''s words answer it'
);

-- the words of a question about time, as the client's WHEN reads them
insert into task_messages (company_id, task_id, sender_id, type, content, meta)
values ('05900000-0000-0000-0000-000000000a00', '05900000-0000-0000-0000-000000000008',
        '05900000-0000-0000-0000-0000000000a1', 'system', 'Передана от Айгуль', '{"passed_from": true}');
select is(
  (select array_agg(content order by content collate "C") from task_messages
    where task_id = '05900000-0000-0000-0000-000000000008' and meta ->> 'is_question' = 'true'
      and meta ->> 'answered_at' is not null),
  array['А какой срок?', 'До какого числа?', 'Когда срок?', 'На когда ставить?', 'когда сдавать?'],
  'a system line answers the questions about time'
);
select is(
  (select array_agg(content order by content collate "C") from task_messages
    where task_id = '05900000-0000-0000-0000-000000000008' and meta ->> 'is_question' = 'true'
      and meta ->> 'answered_at' is null),
  array['Какой формат?', 'Когда-нибудь успею?', 'Сроки какие?', 'Срочно нужно?'],
  'and leaves the others open'
);

-- ---------------------------------------------------------------------------
-- 4. Only the director, only in company A
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"05900000-0000-0000-0000-0000000000a3","role":"authenticated"}';
select throws_ok(
  $$ select extend_task_deadline('05900000-0000-0000-0000-000000000002', now() + interval '5 day') $$,
  'P0001', 'forbidden',
  'the employee does not move the deadline'
);
set local request.jwt.claims = '{"sub":"05900000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select throws_ok(
  $$ select extend_task_deadline('05900000-0000-0000-0000-000000000002', now() + interval '5 day') $$,
  'P0001', 'task_not_found',
  'company B''s director does not reach company A''s task'
);
reset role;
select is(
  (select deadline from tasks where id = '05900000-0000-0000-0000-000000000002'),
  now() + interval '3 day',
  'the deadline is the one company A''s director set'
);

-- ---------------------------------------------------------------------------
-- 5. A direct update of the deadline
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"05900000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select throws_ok(
  $$ update tasks set deadline = now() + interval '5 day' where id = '05900000-0000-0000-0000-000000000005' $$,
  'P0001', 'forbidden_field_update',
  'the manager who gave the task does not rewrite its deadline'
);
select lives_ok(
  $$ update tasks set title = 'pgtap-059 От руководителя, уточнено' where id = '05900000-0000-0000-0000-000000000005' $$,
  'the author still edits the words'
);
set local request.jwt.claims = '{"sub":"05900000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select throws_ok(
  $$ update tasks set deadline = now() + interval '5 day' where id = '05900000-0000-0000-0000-000000000006' $$,
  'P0001', 'forbidden_field_update',
  'a closed task keeps its deadline, a direct update included'
);
select lives_ok(
  $$ update tasks set deadline = now() + interval '5 day' where id = '05900000-0000-0000-0000-000000000007' $$,
  'the director moves the deadline of an open task'
);
reset role;
select is(
  (select deadline from tasks where id = '05900000-0000-0000-0000-000000000007'),
  now() + interval '5 day',
  'and it is stored'
);

select * from finish();
rollback;
