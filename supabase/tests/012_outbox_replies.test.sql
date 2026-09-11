-- The employee hears back: a reply from the director, a rework, an acceptance, a revoke
-- each queue an outbox row for the assignee (migration 20260911210000_outbox_replies).
begin;
select plan(7);

-- the director answers in the thread of Марат's accepted task (003 → assignee 006)
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

insert into task_messages (company_id, task_id, sender_id, type, content)
values ('11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000003',
        '10000000-0000-0000-0000-000000000001', 'text', 'Да, до пятницы');
select is(
  (select count(*) from notification_deliveries
    where task_id = '20000000-0000-0000-0000-000000000003' and event_kind = 'reply'
      and user_id = '10000000-0000-0000-0000-000000000006'),
  1::bigint,
  'a text from the director queues a «reply» push to the assignee'
);
select is(
  (select meta->>'body' from notification_deliveries
    where task_id = '20000000-0000-0000-0000-000000000003' and event_kind = 'reply' limit 1),
  'Да, до пятницы',
  'the push carries the director''s words'
);

-- a system line (deadline change) is not a reply
insert into task_messages (company_id, task_id, sender_id, type, content)
values ('11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000003',
        '10000000-0000-0000-0000-000000000001', 'system', 'Срок продлён до 12.09 13:00');
select is(
  (select count(*) from notification_deliveries
    where task_id = '20000000-0000-0000-0000-000000000003' and event_kind = 'reply'),
  1::bigint,
  'system lines do not queue a push'
);

-- pending_review → rework: the assignee is told
select transition_task(
  task_id := '20000000-0000-0000-0000-000000000005'::uuid,
  to_status := 'rework'::task_status,
  payload := '{"comment":"Не те цены"}'::jsonb);
select is(
  (select count(*) from notification_deliveries
    where task_id = '20000000-0000-0000-0000-000000000005' and event_kind = 'rework'),
  1::bigint,
  'rework queues a push to the assignee'
);
select is(
  (select count(*) from notification_deliveries
    where task_id = '20000000-0000-0000-0000-000000000005' and event_kind = 'reply'),
  0::bigint,
  'the rework comment is not a second push'
);

-- revoke of an open task: the assignee is told
select revoke_task(task_id := '20000000-0000-0000-0000-000000000010'::uuid);
select is(
  (select count(*) from notification_deliveries
    where task_id = '20000000-0000-0000-0000-000000000010' and event_kind = 'revoked'),
  1::bigint,
  'revoke queues a push to the assignee'
);

-- the employee's own message never pings themselves
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}';
insert into task_messages (company_id, task_id, sender_id, type, content)
values ('11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000003',
        '10000000-0000-0000-0000-000000000006', 'text', 'Понял');
select is(
  (select count(*) from notification_deliveries
    where task_id = '20000000-0000-0000-0000-000000000003' and event_kind = 'reply'),
  1::bigint,
  'an employee''s message is not a reply push'
);

select * from finish();
rollback;
