-- «Изменить задачу» (20261126120000_edit_task, D-200): the director rewrites an open task in one
-- call. The words change in place — the status stays, one line says what was, one push says
-- «Задача изменена» (a second edit rewrites the waiting push, a first push still waiting takes the
-- new words); only a date is «Срок» word for word; a task held for later changes quietly, its
-- person too; another person is «Передать» with the new words; a refused task takes a new date;
-- handed-in work keeps its person; closed tasks, empty words and a time behind are refused; the
-- employee and company B's director reach nothing (принцип 6); reassign_task still works.
-- Own fixtures: company A — director DA, employees EA, EB, gone EC; company B — director DB.
begin;
select plan(53);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into companies (id, name, settings) values
  ('06800000-0000-0000-0000-000000000a00', 'pgtap-068 Компания A',
   '{"delivery_window": {"from": "00:00", "to": "23:59"}}'),
  ('06800000-0000-0000-0000-000000000b00', 'pgtap-068 Компания B',
   '{"delivery_window": {"from": "00:00", "to": "23:59"}}');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, now(), now(),
       '', '', '', '', '', '', '', ''
  from (values ('06800000-0000-0000-0000-0000000000a1'::uuid, 'pgtap-068-da@demo.local'),
               ('06800000-0000-0000-0000-0000000000a2'::uuid, 'pgtap-068-ea@demo.local'),
               ('06800000-0000-0000-0000-0000000000a3'::uuid, 'pgtap-068-eb@demo.local'),
               ('06800000-0000-0000-0000-0000000000a4'::uuid, 'pgtap-068-ec@demo.local'),
               ('06800000-0000-0000-0000-0000000000b1'::uuid, 'pgtap-068-db@demo.local')) u(id, email);

insert into profiles (id, company_id, full_name, role, is_active, availability) values
  ('06800000-0000-0000-0000-0000000000a1', '06800000-0000-0000-0000-000000000a00', 'pgtap-068 Директор A', 'director', true, 'active'),
  ('06800000-0000-0000-0000-0000000000a2', '06800000-0000-0000-0000-000000000a00', 'Ерлан pgtap-068', 'employee', true, 'active'),
  ('06800000-0000-0000-0000-0000000000a3', '06800000-0000-0000-0000-000000000a00', 'Марат pgtap-068', 'employee', true, 'active'),
  ('06800000-0000-0000-0000-0000000000a4', '06800000-0000-0000-0000-000000000a00', 'Ушедший pgtap-068', 'employee', false, 'active'),
  ('06800000-0000-0000-0000-0000000000b1', '06800000-0000-0000-0000-000000000b00', 'pgtap-068 Директор B', 'director', true, 'active');

-- t1 in work (the words); t2 in work (only a date); t3 held for later; t4 in work (another person);
-- t5 handed in; t6 accepted by the director; t7 refused; t8 just sent, its push still waiting;
-- t9 in work (reassign_task as before); t10 in work, overdue (words only); t11 in work, stored with
-- stray spaces and empty details as a batch may keep them (only a date)
insert into tasks (id, company_id, author_id, assignee_id, title, body, priority, status, deadline, scheduled_send_at, accepted_at, completed_at, closed_at) values
  ('06800000-0000-0000-0000-000000000001', '06800000-0000-0000-0000-000000000a00', '06800000-0000-0000-0000-0000000000a1',
   '06800000-0000-0000-0000-0000000000a2', 'Позвонить поставщику', null, 'normal', 'accepted',
   now() + interval '1 day', null, now() - interval '1 hour', null, null),
  ('06800000-0000-0000-0000-000000000002', '06800000-0000-0000-0000-000000000a00', '06800000-0000-0000-0000-0000000000a1',
   '06800000-0000-0000-0000-0000000000a2', 'Смета pgtap-068', null, 'normal', 'accepted',
   now() + interval '1 day', null, now() - interval '1 hour', null, null),
  ('06800000-0000-0000-0000-000000000003', '06800000-0000-0000-0000-000000000a00', '06800000-0000-0000-0000-0000000000a1',
   '06800000-0000-0000-0000-0000000000a2', 'Отложенная pgtap-068', null, 'normal', 'scheduled',
   now() + interval '3 day', now() + interval '1 day', null, null, null),
  ('06800000-0000-0000-0000-000000000004', '06800000-0000-0000-0000-000000000a00', '06800000-0000-0000-0000-0000000000a1',
   '06800000-0000-0000-0000-0000000000a2', 'Отчёт pgtap-068', 'старые подробности', 'normal', 'accepted',
   now() + interval '1 day', null, now() - interval '1 hour', null, null),
  ('06800000-0000-0000-0000-000000000005', '06800000-0000-0000-0000-000000000a00', '06800000-0000-0000-0000-0000000000a1',
   '06800000-0000-0000-0000-0000000000a2', 'Сданная pgtap-068', null, 'normal', 'pending_review',
   now() + interval '1 day', null, now() - interval '2 hour', now() - interval '1 hour', null),
  ('06800000-0000-0000-0000-000000000006', '06800000-0000-0000-0000-000000000a00', '06800000-0000-0000-0000-0000000000a1',
   '06800000-0000-0000-0000-0000000000a2', 'Принятая pgtap-068', null, 'normal', 'done',
   now() + interval '1 day', null, now() - interval '3 hour', now() - interval '2 hour', now() - interval '1 hour'),
  ('06800000-0000-0000-0000-000000000007', '06800000-0000-0000-0000-000000000a00', '06800000-0000-0000-0000-0000000000a1',
   '06800000-0000-0000-0000-0000000000a2', 'Отказ pgtap-068', null, 'normal', 'declined',
   now() + interval '1 day', null, null, null, now() - interval '1 hour'),
  ('06800000-0000-0000-0000-000000000009', '06800000-0000-0000-0000-000000000a00', '06800000-0000-0000-0000-0000000000a1',
   '06800000-0000-0000-0000-0000000000a2', 'Передать pgtap-068', null, 'normal', 'accepted',
   now() + interval '1 day', null, now() - interval '1 hour', null, null),
  ('06800000-0000-0000-0000-000000000010', '06800000-0000-0000-0000-000000000a00', '06800000-0000-0000-0000-0000000000a1',
   '06800000-0000-0000-0000-0000000000a2', 'Просроченная pgtap-068', null, 'normal', 'accepted',
   now() - interval '1 day', null, now() - interval '2 day', null, null),
  ('06800000-0000-0000-0000-000000000011', '06800000-0000-0000-0000-000000000a00', '06800000-0000-0000-0000-0000000000a1',
   '06800000-0000-0000-0000-0000000000a2', 'Пробелы pgtap-068 ', '', 'normal', 'accepted',
   now() + interval '1 day', null, now() - interval '1 hour', null, null);

-- t8 goes out the way a batch sends it: the outbox trigger queues its first push
insert into tasks (id, company_id, author_id, assignee_id, title, status, deadline) values
  ('06800000-0000-0000-0000-000000000008', '06800000-0000-0000-0000-000000000a00', '06800000-0000-0000-0000-0000000000a1',
   '06800000-0000-0000-0000-0000000000a2', 'Новая pgtap-068', 'sent', now() + interval '1 day');

-- ---------------------------------------------------------------------------
-- 1. The words change in place
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"06800000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is(
  (select edit_task('06800000-0000-0000-0000-000000000001', '  Позвонить поставщику насчёт цемента  ',
                    'Узнать цену за тонну', 'high', client_request_id := '06800000-0000-0000-0000-00000000c001') ->> 'edited'),
  'true',
  'the director rewrites the words of a task in work'
);
select is(
  (select edit_task('06800000-0000-0000-0000-000000000001', 'Позвонить поставщику насчёт цемента',
                    'Узнать цену за тонну', 'high', client_request_id := '06800000-0000-0000-0000-00000000c001') ->> 'duplicate'),
  'true',
  'a repeat of the same request is a duplicate'
);
reset role;
select is(
  (select title || ' / ' || body || ' / ' || priority::text from tasks where id = '06800000-0000-0000-0000-000000000001'),
  'Позвонить поставщику насчёт цемента / Узнать цену за тонну / high',
  'the words are stored trimmed, the details and «срочно» with them'
);
select is(
  (select status from tasks where id = '06800000-0000-0000-0000-000000000001'),
  'accepted'::task_status,
  'the task stays in work: nobody accepts it again'
);
select is(
  (select content from task_messages where task_id = '06800000-0000-0000-0000-000000000001' and meta ? 'task_edited'),
  'Текст и подробности изменены, отмечена срочной · было «Позвонить поставщику»',
  'one line says what changed and what the words were'
);
select is(
  (select meta ->> 'old_title' from task_messages where task_id = '06800000-0000-0000-0000-000000000001' and meta ? 'task_edited'),
  'Позвонить поставщику',
  'the old words are kept in the line'
);
select is(
  (select count(*)::int from notification_deliveries
    where task_id = '06800000-0000-0000-0000-000000000001' and event_kind = 'task_edited'
      and user_id = '06800000-0000-0000-0000-0000000000a2'),
  1,
  'the employee gets one push about it'
);
select is(
  (select meta ->> 'title' from notification_deliveries
    where task_id = '06800000-0000-0000-0000-000000000001' and event_kind = 'task_edited'),
  'Задача изменена',
  'the push says «Задача изменена»'
);

-- a second edit while the first push still waits rewrites it, and a deadline rides in it
set local role authenticated;
set local request.jwt.claims = '{"sub":"06800000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select lives_ok(
  $$ select edit_task('06800000-0000-0000-0000-000000000001', 'Позвонить поставщику насчёт песка',
                      'Узнать цену за тонну', 'high', true, now() + interval '2 day') $$,
  'a second edit with a new deadline'
);
reset role;
select is(
  (select count(*)::int from notification_deliveries
    where task_id = '06800000-0000-0000-0000-000000000001' and event_kind = 'task_edited'),
  1,
  'the waiting push is rewritten, not chased by a second'
);
select ok(
  (select meta ->> 'title' like 'Задача изменена · срок %' and meta ->> 'body' = 'Позвонить поставщику насчёт песка'
     from notification_deliveries
    where task_id = '06800000-0000-0000-0000-000000000001' and event_kind = 'task_edited'),
  'it says the new deadline and the new words'
);
select is(
  (select count(*)::int from task_messages
    where task_id = '06800000-0000-0000-0000-000000000001' and content like 'Срок продлён до %' and meta ? 'deadline_changed'),
  1,
  'the deadline gets its own line, as «Срок» writes it'
);
select is(
  (select deadline from tasks where id = '06800000-0000-0000-0000-000000000001'),
  now() + interval '2 day',
  'the new deadline is stored'
);

-- ---------------------------------------------------------------------------
-- 2. Nothing changed; only a date; an overdue task changes its words
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"06800000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is(
  (select edit_task('06800000-0000-0000-0000-000000000002', 'Смета pgtap-068', null) ->> 'unchanged'),
  'true',
  'the same task again is no news'
);
select lives_ok(
  $$ select edit_task('06800000-0000-0000-0000-000000000002', 'Смета pgtap-068', null,
                      change_deadline := true, new_deadline := now() + interval '5 day') $$,
  'only a new date'
);
select lives_ok(
  $$ select edit_task('06800000-0000-0000-0000-000000000010', 'Просроченная pgtap-068 — уточнено', null) $$,
  'an overdue task changes its words without a new date'
);
select lives_ok(
  $$ select edit_task('06800000-0000-0000-0000-000000000011', 'Пробелы pgtap-068', null,
                      change_deadline := true, new_deadline := now() + interval '5 day') $$,
  'only a new date on a task stored with stray spaces and empty details'
);
reset role;
select is(
  (select count(*)::int from task_messages where task_id = '06800000-0000-0000-0000-000000000002'),
  1,
  'only a date writes one line — the deadline one'
);
select is(
  (select string_agg(event_kind, ',') from notification_deliveries where task_id = '06800000-0000-0000-0000-000000000002'),
  'deadline_extended',
  'and the push of «Срок», not «изменена»'
);
select is(
  (select deadline from tasks where id = '06800000-0000-0000-0000-000000000010'),
  now() - interval '1 day',
  'the overdue deadline stays as it was'
);
select is(
  (select string_agg(event_kind, ',') from notification_deliveries where task_id = '06800000-0000-0000-0000-000000000011')
  || ' / ' || (select count(*)::text from task_messages where task_id = '06800000-0000-0000-0000-000000000011' and meta ? 'task_edited'),
  'deadline_extended / 0',
  'stray spaces and empty details are no change of words: the date goes as «Срок»'
);

-- ---------------------------------------------------------------------------
-- 3. Held for later: quietly, its person too
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"06800000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select is(
  (select edit_task('06800000-0000-0000-0000-000000000003', 'Отложенная — новые слова', 'подробности',
                    new_assignee_id := '06800000-0000-0000-0000-0000000000a3') ->> 'moved'),
  'true',
  'a task held for later goes to another person in place'
);
reset role;
select is(
  (select assignee_id::text || ' / ' || title || ' / ' || status::text from tasks where id = '06800000-0000-0000-0000-000000000003'),
  '06800000-0000-0000-0000-0000000000a3 / Отложенная — новые слова / scheduled',
  'the same task, the new person and words, still held'
);
select is(
  (select count(*)::int from task_messages where task_id = '06800000-0000-0000-0000-000000000003'),
  0,
  'no line in a thread nobody sees yet'
);
select is(
  (select count(*)::int from notification_deliveries where task_id = '06800000-0000-0000-0000-000000000003'),
  0,
  'no push either'
);

-- ---------------------------------------------------------------------------
-- 4. Another person: «Передать» with the new words
-- ---------------------------------------------------------------------------
create temp table r068 (r jsonb);
grant all on r068 to public;
set local role authenticated;
set local request.jwt.claims = '{"sub":"06800000-0000-0000-0000-0000000000a1","role":"authenticated"}';
insert into r068
select edit_task('06800000-0000-0000-0000-000000000004', 'Отчёт за ноябрь', 'новые подробности', 'high',
                 true, now() + interval '4 day', '06800000-0000-0000-0000-0000000000a3', 'Возьми у Ерлана файлы');
reset role;
select is(
  (select status::text || ' / ' || passed_to::text || ' / ' || title from tasks where id = '06800000-0000-0000-0000-000000000004'),
  'revoked / 06800000-0000-0000-0000-0000000000a3 / Отчёт pgtap-068',
  'the old one is closed as «передана» and keeps its old words'
);
select is(
  (select t.title || ' / ' || t.body || ' / ' || t.priority::text || ' / ' || t.status::text || ' / ' || t.assignee_id::text
     from tasks t, r068 where t.id = (r068.r ->> 'new_task_id')::uuid),
  'Отчёт за ноябрь / новые подробности / high / sent / 06800000-0000-0000-0000-0000000000a3',
  'the new person gets the new words, details and «срочно»'
);
select is(
  (select t.deadline from tasks t, r068 where t.id = (r068.r ->> 'new_task_id')::uuid),
  now() + interval '4 day',
  'and the new deadline'
);
select is(
  (select t.parent_task_id from tasks t, r068 where t.id = (r068.r ->> 'new_task_id')::uuid),
  '06800000-0000-0000-0000-000000000004'::uuid,
  'the copy points back to where it came from'
);
select is(
  (select m.content from task_messages m, r068 where m.task_id = (r068.r ->> 'new_task_id')::uuid and m.meta ? 'handoff_note'),
  'Возьми у Ерлана файлы',
  'the word to the new person is in their thread'
);
select is(
  (select meta ->> 'title' from notification_deliveries
    where task_id = '06800000-0000-0000-0000-000000000004' and event_kind = 'revoked'),
  'Задача передана · Марат',
  'the old holder hears «передана»'
);
select is(
  (select r ->> 'assignee' from r068),
  'Марат pgtap-068',
  'the answer names the new person'
);
-- the new person's first push still waits: a fix of its words keeps the director's word in it
set local role authenticated;
set local request.jwt.claims = '{"sub":"06800000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select lives_ok(
  $$ select edit_task((select (r ->> 'new_task_id')::uuid from r068), 'Отчёт за ноябрь — с цифрами', 'новые подробности') $$,
  'the new task changes its words while its first push waits'
);
reset role;
select is(
  (select d.meta ->> 'body' from notification_deliveries d, r068
    where d.task_id = (r068.r ->> 'new_task_id')::uuid and d.event_kind = 'task_sent'),
  'Отчёт за ноябрь — с цифрами · срок ' || push_when(now() + interval '4 day') || ' · Возьми у Ерлана файлы',
  'the waiting push has the new words, the deadline and the word of the handover'
);

-- ---------------------------------------------------------------------------
-- 5. A refused task takes a new date; a first push still waiting takes the new words
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"06800000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select lives_ok(
  $$ select edit_task('06800000-0000-0000-0000-000000000007', 'Отказ pgtap-068', null,
                      change_deadline := true, new_deadline := now() + interval '6 day') $$,
  'a refused task takes a new deadline'
);
select lives_ok(
  $$ select edit_task('06800000-0000-0000-0000-000000000008', 'Новая pgtap-068 — точнее', null) $$,
  'a task just sent changes its words'
);
reset role;
select is(
  (select deadline from tasks where id = '06800000-0000-0000-0000-000000000007'),
  now() + interval '6 day',
  'the refused task has the new deadline'
);
select is(
  (select status from tasks where id = '06800000-0000-0000-0000-000000000007'),
  'declined'::task_status,
  'and waits for «Настоять» as before'
);
select is(
  (select meta ->> 'title' from notification_deliveries
    where task_id = '06800000-0000-0000-0000-000000000007' and event_kind = 'task_edited'),
  'Задача изменена · срок ' || push_when(now() + interval '6 day'),
  'its person hears of the new date'
);
select is(
  (select count(*)::int from notification_deliveries where task_id = '06800000-0000-0000-0000-000000000008'),
  1,
  'no second push while the first still waits'
);
select ok(
  (select meta ->> 'body' like 'Новая pgtap-068 — точнее%' from notification_deliveries
    where task_id = '06800000-0000-0000-0000-000000000008' and event_kind = 'task_sent'),
  'the waiting first push carries the new words'
);

-- ---------------------------------------------------------------------------
-- 6. What is refused
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"06800000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select throws_ok(
  $$ select edit_task('06800000-0000-0000-0000-000000000005', 'Сданная pgtap-068', null,
                      new_assignee_id := '06800000-0000-0000-0000-0000000000a3') $$,
  'P0001', 'invalid_transition',
  'handed-in work keeps its person until it is judged'
);
select lives_ok(
  $$ select edit_task('06800000-0000-0000-0000-000000000005', 'Сданная pgtap-068 — поправил', null) $$,
  'handed-in work may change its words'
);
select throws_ok(
  $$ select edit_task('06800000-0000-0000-0000-000000000006', 'Принятая — новые слова', null) $$,
  'P0001', 'invalid_transition',
  'an accepted task stays history'
);
select throws_ok(
  $$ select edit_task('06800000-0000-0000-0000-000000000002', '   ', null) $$,
  'P0001', 'empty_title',
  'empty words are refused'
);
select throws_ok(
  $$ select edit_task('06800000-0000-0000-0000-000000000002', 'Смета pgtap-068', null,
                      change_deadline := true, new_deadline := now() - interval '1 minute') $$,
  'P0001', 'deadline_in_past',
  'a time already behind is refused'
);
select throws_ok(
  $$ select edit_task('06800000-0000-0000-0000-000000000002', 'Смета pgtap-068', null,
                      new_assignee_id := '06800000-0000-0000-0000-0000000000a4') $$,
  'P0001', 'assignee_not_found',
  'a person who left is not a new holder'
);
select throws_ok(
  $$ select edit_task('06800000-0000-0000-0000-000000000002', 'Смета pgtap-068', null,
                      new_assignee_id := '06800000-0000-0000-0000-0000000000b1') $$,
  'P0001', 'assignee_not_found',
  'nor a person of another company'
);

set local request.jwt.claims = '{"sub":"06800000-0000-0000-0000-0000000000a2","role":"authenticated"}';
select throws_ok(
  $$ select edit_task('06800000-0000-0000-0000-000000000002', 'Смета — мои слова', null) $$,
  'P0001', 'forbidden',
  'the employee does not rewrite the task'
);
set local request.jwt.claims = '{"sub":"06800000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select throws_ok(
  $$ select edit_task('06800000-0000-0000-0000-000000000002', 'Смета — чужие слова', null) $$,
  'P0001', 'task_not_found',
  'company B''s director does not reach company A''s task'
);
reset role;
select is(
  (select title from tasks where id = '06800000-0000-0000-0000-000000000002'),
  'Смета pgtap-068',
  'nothing refused wrote anything'
);

-- ---------------------------------------------------------------------------
-- 7. reassign_task works as before on the shared copy
-- ---------------------------------------------------------------------------
create temp table r068b (r jsonb);
grant all on r068b to public;
set local role authenticated;
set local request.jwt.claims = '{"sub":"06800000-0000-0000-0000-0000000000a1","role":"authenticated"}';
insert into r068b
select reassign_task('06800000-0000-0000-0000-000000000009', '06800000-0000-0000-0000-0000000000a3');
reset role;
select is(
  (select t.title || ' / ' || t.status::text from tasks t, r068b where t.id = (r068b.r ->> 'new_task_id')::uuid),
  'Передать pgtap-068 / sent',
  '«Передать» gives the same words to the new person'
);
select is(
  (select status::text || ' / ' || passed_to::text from tasks where id = '06800000-0000-0000-0000-000000000009'),
  'revoked / 06800000-0000-0000-0000-0000000000a3',
  'and closes the old one with a pointer'
);

select * from finish();
rollback;
