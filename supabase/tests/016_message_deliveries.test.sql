-- Every word of a thread reaches the other side once (D-64, наряд 011B): one `message`
-- row per recipient, collapsed while it is still queued, and the three events that have
-- a push of their own are not doubled.
begin;
select plan(8);

set local role authenticated;

-- Марат writes in his own task 004 (author: the director)
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
insert into task_messages (company_id, task_id, sender_id, type, content)
values ('11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000004',
        '10000000-0000-0000-0000-000000000007', 'text', 'Сделал, отчёт в папке');

select is(
  (select count(*) from notification_deliveries
    where task_id = '20000000-0000-0000-0000-000000000004' and event_kind = 'message'),
  1::bigint,
  'one row: the author hears it, the sender does not'
);
select is(
  (select user_id from notification_deliveries
    where task_id = '20000000-0000-0000-0000-000000000004' and event_kind = 'message'),
  '10000000-0000-0000-0000-000000000001'::uuid,
  'and the one who hears it is the task author'
);
select is(
  (select (meta->>'count')::int from notification_deliveries
    where task_id = '20000000-0000-0000-0000-000000000004' and event_kind = 'message'),
  1,
  'the first word is one word'
);

-- a second word while the first is still queued: the same buzz, not a new one
insert into task_messages (company_id, task_id, sender_id, type, content)
values ('11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000004',
        '10000000-0000-0000-0000-000000000007', 'text', 'И ещё вопрос по смете');
select is(
  (select count(*) from notification_deliveries
    where task_id = '20000000-0000-0000-0000-000000000004' and event_kind = 'message'),
  1::bigint,
  'messages in a row collapse into the queued row'
);
select is(
  (select meta->>'body' from notification_deliveries
    where task_id = '20000000-0000-0000-0000-000000000004' and event_kind = 'message'),
  '2 новых сообщения · И ещё вопрос по смете',
  'the body counts them and keeps the last words'
);

-- the report of a handover and the reason of a «Не могу» keep their own pushes
insert into task_messages (company_id, task_id, sender_id, type, content, meta)
values ('11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000004',
        '10000000-0000-0000-0000-000000000007', 'text', 'Готово', '{"report": true}'::jsonb),
       ('11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000004',
        '10000000-0000-0000-0000-000000000007', 'text', 'Занят срочным', '{"decline_reason": true}'::jsonb);
select is(
  (select (meta->>'count')::int from notification_deliveries
    where task_id = '20000000-0000-0000-0000-000000000004' and event_kind = 'message'),
  2,
  'a report and a decline reason are not messages'
);

-- the director writes to the employee: the row waits for the delivery window
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
insert into task_messages (company_id, task_id, sender_id, type, content)
values ('11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000003',
        '10000000-0000-0000-0000-000000000001', 'text', 'Да, до пятницы');
select is(
  (select count(*) from notification_deliveries
    where task_id = '20000000-0000-0000-0000-000000000003' and event_kind = 'message'
      and user_id = '10000000-0000-0000-0000-000000000006'
      and deliver_after >= now() - interval '1 second'),
  1::bigint,
  'the employee hears the director, in the delivery window'
);

-- reading the thread closes the receipt
select mark_thread_read('20000000-0000-0000-0000-000000000004'::uuid, 99::bigint);
select is(
  (select count(*) from notification_deliveries
    where task_id = '20000000-0000-0000-0000-000000000004' and event_kind = 'message'
      and acted_at is not null),
  1::bigint,
  '«Прочитал» closes the message receipt it covers'
);

set local role postgres;
select * from finish();
rollback;
