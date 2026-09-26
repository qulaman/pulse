-- D-128: the task's life between the director and the employee — «Не могу» from rework with
-- a suggested colleague, «Нужно больше времени» and its answers, honest «Срок», «Напомнить»,
-- a reassign with a new deadline and a word, «Скоро срок», no «Просрочено» while a request waits.
-- Counts are scoped to this file's rows: dev holds other people's tasks and queues.
-- Fixtures — supabase/seed.sql: director …0001, Марат …0007, Ерлан Б. …0005.
begin;
select plan(53);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
update profiles set role = 'employee', is_active = true
 where id in ('10000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000005');
update companies set settings = jsonb_set(coalesce(settings, '{}'), '{delivery_window}', '{"from":"00:00","to":"23:59"}')
 where id = '11111111-1111-1111-1111-111111111111';

insert into tasks (id, company_id, author_id, assignee_id, title, status, deadline, created_at, accepted_at) values
  ('95000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'Смета ERG', 'rework',
   now() + interval '1 day', now() - interval '1 day', now() - interval '1 day'),
  ('95000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'Договор с поставщиком', 'sent',
   now() + interval '1 day', now() - interval '1 hour', null),
  ('95000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'Пропуска на объект', 'accepted',
   now() + interval '1 day', now() - interval '1 hour', now() - interval '1 hour'),
  ('95000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'Акт приёмки', 'accepted',
   now() + interval '1 day', now() - interval '1 hour', now() - interval '1 hour'),
  ('95000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'Отчёт по складу', 'accepted',
   now() + interval '2 day', now() - interval '1 hour', now() - interval '1 hour'),
  ('95000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'Сверка кассы', 'accepted',
   now() + interval '1 day', now() - interval '1 hour', now() - interval '1 hour'),
  ('95000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'Забрать груз', 'accepted',
   now() + interval '1 hour', now() - interval '1 day', now() - interval '1 day'),
  ('95000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'Счёт Полиграфу', 'accepted',
   now() - interval '10 minute', now() - interval '1 day', now() - interval '1 day'),
  ('95000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'Счёт КазАзоту', 'accepted',
   now() - interval '10 minute', now() - interval '1 day', now() - interval '1 day'),
  ('95000000-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'Позвонить в банк', 'accepted',
   now() + interval '30 minute', now() - interval '5 hour', now() - interval '5 hour'),
  ('95000000-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'Купить бумагу', 'accepted',
   now() + interval '30 minute', now() - interval '1 hour', now() - interval '1 hour'),
  ('95000000-0000-0000-0000-000000000012', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'Фото объекта', 'accepted',
   now() + interval '1 day', now() - interval '1 hour', now() - interval '1 hour');

-- ---------------------------------------------------------------------------
-- 1. «Не могу» from rework, «Это к другому»
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';

select throws_ok(
  $$ select transition_task('95000000-0000-0000-0000-000000000001', 'declined',
       '{"reason":"Это не ко мне","suggest_assignee_id":"10000000-0000-0000-0000-000000000007"}'::jsonb) $$,
  'P0001', 'same_assignee',
  'an employee cannot suggest themselves'
);
select lives_ok(
  $$ select transition_task('95000000-0000-0000-0000-000000000001', 'declined',
       '{"reason":"Это не ко мне","suggest_assignee_id":"10000000-0000-0000-0000-000000000005"}'::jsonb) $$,
  'rework → declined by the assignee, with a suggested colleague'
);
select is(
  (select status from tasks where id = '95000000-0000-0000-0000-000000000001'),
  'declined'::task_status,
  'the task is back with the director'
);
select is(
  (select meta ->> 'suggest_assignee_id' from task_messages
    where task_id = '95000000-0000-0000-0000-000000000001' and meta ->> 'decline_reason' = 'true'),
  '10000000-0000-0000-0000-000000000005',
  'the reason row carries the suggestion'
);
reset role;
select ok(
  (select meta ->> 'body' from notification_deliveries
    where task_id = '95000000-0000-0000-0000-000000000001' and event_kind = 'declined') like '%предлагает: %',
  'the director''s push says the reason and the suggestion'
);

-- ---------------------------------------------------------------------------
-- 2. «Возьму, но к …» on a new task, a second request replaces the first
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';
select throws_ok(
  $$ select request_deadline('95000000-0000-0000-0000-000000000002', now() + interval '2 day') $$,
  'P0001', 'forbidden',
  'only the assignee asks for time'
);
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select throws_ok(
  $$ select request_deadline('95000000-0000-0000-0000-000000000002', now() - interval '1 hour') $$,
  'P0001', 'bad_deadline',
  'a time already behind is not a request'
);
select is(
  (select (request_deadline('95000000-0000-0000-0000-000000000002', now() + interval '2 day', 'жду поставку')) ->> 'accepted'),
  'true',
  'a request on a new task takes it'
);
select is(
  (select status from tasks where id = '95000000-0000-0000-0000-000000000002'),
  'accepted'::task_status,
  'the task is in work'
);
reset role;
select ok(
  (select acted_at is not null from notification_deliveries
    where task_id = '95000000-0000-0000-0000-000000000002' and event_kind = 'task_sent'),
  'the director''s receipt says «принял»'
);
select is(
  (select category from notification_deliveries
    where task_id = '95000000-0000-0000-0000-000000000002' and event_kind = 'message'
      and user_id = '10000000-0000-0000-0000-000000000001'),
  'questions',
  'the director gets the request as a question'
);
select ok(
  (select meta ->> 'title' from notification_deliveries
    where task_id = '95000000-0000-0000-0000-000000000002' and event_kind = 'message'
      and user_id = '10000000-0000-0000-0000-000000000001') like 'Просит срок · %',
  'the push says what is asked'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select lives_ok(
  $$ select request_deadline('95000000-0000-0000-0000-000000000002', now() + interval '3 day') $$,
  'a second request'
);
select is(
  (select count(*) from task_messages
    where task_id = '95000000-0000-0000-0000-000000000002' and meta ->> 'time_request' = 'true'
      and meta ->> 'answered_at' is null),
  1::bigint,
  'only the newest request waits'
);
reset role;
select is(
  (select count(*) from notification_deliveries
    where task_id = '95000000-0000-0000-0000-000000000002' and event_kind = 'message'
      and user_id = '10000000-0000-0000-0000-000000000001'),
  2::bigint,
  'each request is its own push, never folded into chat'
);

-- ---------------------------------------------------------------------------
-- 3. «Согласовать» / «Оставить прежний»
-- ---------------------------------------------------------------------------
set local role authenticated;
select throws_ok(
  $$ select answer_deadline_request('95000000-0000-0000-0000-000000000002', true) $$,
  'P0001', 'forbidden',
  'the employee does not grant their own time'
);
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select answer_deadline_request('95000000-0000-0000-0000-000000000003', true) $$,
  'P0001', 'no_request',
  'nothing to answer without a request'
);
select lives_ok(
  $$ select answer_deadline_request('95000000-0000-0000-0000-000000000002', true) $$,
  'the director grants the time'
);
select is(
  (select deadline from tasks where id = '95000000-0000-0000-0000-000000000002'),
  (select (meta ->> 'proposed_deadline')::timestamptz from task_messages
    where task_id = '95000000-0000-0000-0000-000000000002' and meta ->> 'answer' = 'approved'),
  'the deadline is the one asked for'
);
select ok(
  (select content from task_messages
    where task_id = '95000000-0000-0000-0000-000000000002' and type = 'system'
    order by seq desc limit 1) like 'Срок согласован: до %',
  'the thread says it was granted'
);
reset role;
select is(
  (select count(*) from notification_deliveries
    where task_id = '95000000-0000-0000-0000-000000000002' and event_kind = 'deadline_extended'
      and user_id = '10000000-0000-0000-0000-000000000007'),
  1::bigint,
  'the employee hears «Срок согласован»'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select lives_ok(
  $$ select request_deadline('95000000-0000-0000-0000-000000000003', now() + interval '4 day') $$,
  'a request on work in hand'
);
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select answer_deadline_request('95000000-0000-0000-0000-000000000003', false) $$,
  'the director keeps the deadline'
);
select is(
  (select deadline::date from tasks where id = '95000000-0000-0000-0000-000000000003'),
  (now() + interval '1 day')::date,
  'the deadline did not move'
);
reset role;
select is(
  (select count(*) from notification_deliveries
    where task_id = '95000000-0000-0000-0000-000000000003' and event_kind = 'deadline_kept'),
  1::bigint,
  'the employee hears «Срок прежний»'
);

-- ---------------------------------------------------------------------------
-- 4. «Срок»: a request answered by another date; earlier rings, later does not
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select lives_ok(
  $$ select request_deadline('95000000-0000-0000-0000-000000000004', now() + interval '5 day') $$,
  'a request'
);
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select extend_task_deadline('95000000-0000-0000-0000-000000000004', now() + interval '2 day') $$,
  'the director names another date'
);
select is(
  (select meta ->> 'answer' from task_messages
    where task_id = '95000000-0000-0000-0000-000000000004' and meta ->> 'time_request' = 'true'),
  'changed',
  'the request is answered by it'
);
select ok(
  (select content from task_messages
    where task_id = '95000000-0000-0000-0000-000000000004' and type = 'system'
    order by seq desc limit 1) like 'Новый срок: до %',
  'the thread says «Новый срок»'
);

select lives_ok(
  $$ select extend_task_deadline('95000000-0000-0000-0000-000000000005', now() + interval '1 day') $$,
  'the deadline comes closer'
);
select ok(
  (select content from task_messages
    where task_id = '95000000-0000-0000-0000-000000000005' and type = 'system'
    order by seq desc limit 1) like 'Срок перенесён раньше: до %',
  'the words say it is earlier'
);
reset role;
select is(
  (select count(*) from notification_deliveries
    where task_id = '95000000-0000-0000-0000-000000000005' and event_kind = 'deadline_moved'),
  1::bigint,
  'an earlier deadline rings'
);
set local role authenticated;
select lives_ok(
  $$ select extend_task_deadline('95000000-0000-0000-0000-000000000005', now() + interval '6 day') $$,
  'the deadline moves away'
);
select ok(
  (select content from task_messages
    where task_id = '95000000-0000-0000-0000-000000000005' and type = 'system'
    order by seq desc limit 1) like 'Срок продлён до %',
  'the words say it is later'
);

-- ---------------------------------------------------------------------------
-- 5. «Напомнить»: once per half hour, never an answer to a question
-- ---------------------------------------------------------------------------
reset role;
insert into task_messages (company_id, task_id, sender_id, type, content, meta)
values ('11111111-1111-1111-1111-111111111111', '95000000-0000-0000-0000-000000000006',
        '10000000-0000-0000-0000-000000000007', 'text', 'Какая касса?', '{"is_question": true}');
set local role authenticated;
select is(
  (select (nudge_task('95000000-0000-0000-0000-000000000006')) ->> 'too_soon'),
  'false',
  'the director reminds'
);
select is(
  (select (nudge_task('95000000-0000-0000-0000-000000000006')) ->> 'too_soon'),
  'true',
  'a second tap within half an hour is only a receipt'
);
reset role;
select is(
  (select count(*) from notification_deliveries
    where task_id = '95000000-0000-0000-0000-000000000006' and event_kind = 'task_nudge'),
  1::bigint,
  'one push, not two'
);
select ok(
  (select meta ->> 'answered_at' is null from task_messages
    where task_id = '95000000-0000-0000-0000-000000000006' and meta ->> 'is_question' = 'true'),
  'the employee''s question stays open'
);

-- ---------------------------------------------------------------------------
-- 6. «Переназначить» with a new deadline and a word
-- ---------------------------------------------------------------------------
set local role authenticated;
select is(
  (select (reassign_task('95000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000005',
                         null, now() + interval '3 day', true, 'Ключи у охраны')) ->> 'assignee' is not null),
  true,
  'the director reassigns with a new deadline and a word'
);
select is(
  (select deadline::date from tasks
    where parent_task_id = '95000000-0000-0000-0000-000000000007'),
  (now() + interval '3 day')::date,
  'the new task has the new deadline'
);
select ok(
  (select content from task_messages m join tasks t on t.id = m.task_id
    where t.parent_task_id = '95000000-0000-0000-0000-000000000007' and m.type = 'system') like 'Передана от %',
  'the new person learns where it came from'
);
reset role;
select is(
  (select count(*) from notification_deliveries d join tasks t on t.id = d.task_id
    where t.parent_task_id = '95000000-0000-0000-0000-000000000007' and d.event_kind = 'message'),
  0::bigint,
  'the handover word is not a second push'
);
select is(
  (select passed_to from tasks where id = '95000000-0000-0000-0000-000000000007'),
  '10000000-0000-0000-0000-000000000005'::uuid,
  'the old task knows who took over'
);
select ok(
  (select meta ->> 'title' from notification_deliveries
    where task_id = '95000000-0000-0000-0000-000000000007' and event_kind = 'revoked') like 'Задача передана · %',
  'the old holder hears «передана», not «отозвано»'
);

-- ---------------------------------------------------------------------------
-- 7. No «Просрочено» while a request waits; «Скоро срок» an hour ahead
-- ---------------------------------------------------------------------------
reset role;
update notification_deliveries set status = 'sent'
 where task_id in ('95000000-0000-0000-0000-000000000008', '95000000-0000-0000-0000-000000000009');
insert into task_messages (company_id, task_id, sender_id, type, content, meta)
values ('11111111-1111-1111-1111-111111111111', '95000000-0000-0000-0000-000000000008',
        '10000000-0000-0000-0000-000000000007', 'text', 'Прошу срок до завтра',
        jsonb_build_object('time_request', true, 'proposed_deadline', now() + interval '1 day'));
insert into notification_prefs (user_id, company_id, prefs)
values ('10000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '{"modes":{"overdue":"now"}}')
on conflict (user_id) do update
  set prefs = notification_prefs.prefs
              || jsonb_build_object('modes', coalesce(notification_prefs.prefs -> 'modes', '{}') || '{"overdue":"now"}');
select overdue_alerts_due(now());
select is(
  (select count(*) from notification_deliveries
    where task_id = '95000000-0000-0000-0000-000000000008' and event_kind = 'task_overdue'),
  0::bigint,
  'a late task with a waiting request is not «Просрочено»'
);
select is(
  (select count(*) from notification_deliveries
    where task_id = '95000000-0000-0000-0000-000000000009' and event_kind = 'task_overdue'),
  1::bigint,
  'a late task without one is'
);

select deadline_reminders_due(now());
select is(
  (select count(*) from notification_deliveries
    where task_id = '95000000-0000-0000-0000-000000000010' and event_kind = 'deadline_soon'),
  1::bigint,
  'an hour ahead the employee hears «Скоро срок»'
);
select deadline_reminders_due(now());
select is(
  (select count(*) from notification_deliveries
    where task_id = '95000000-0000-0000-0000-000000000010' and event_kind = 'deadline_soon'),
  1::bigint,
  'once per deadline'
);
select is(
  (select count(*) from notification_deliveries
    where task_id = '95000000-0000-0000-0000-000000000011' and event_kind = 'deadline_soon'),
  0::bigint,
  'a task given for less than three hours gets no reminder'
);

-- ---------------------------------------------------------------------------
-- 8. A handover closes the request; the old holder cannot rewrite passed_to
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select lives_ok(
  $$ select request_deadline('95000000-0000-0000-0000-000000000012', now() + interval '2 day') $$,
  'a request'
);
select lives_ok(
  $$ select transition_task('95000000-0000-0000-0000-000000000012', 'pending_review',
       '{"report":{"partial":true}}'::jsonb) $$,
  'handed in, «сделано не всё»'
);
select is(
  (select meta ->> 'answer' from task_messages
    where task_id = '95000000-0000-0000-0000-000000000012' and meta ->> 'time_request' = 'true'),
  'closed',
  'the request is over with the handover'
);
select throws_ok(
  $$ update tasks set passed_to = '10000000-0000-0000-0000-000000000005'
      where id = '95000000-0000-0000-0000-000000000003' $$,
  'P0001', 'forbidden_field_update',
  'the employee cannot write who took over'
);

select * from finish();
rollback;
