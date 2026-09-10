-- Delivery outbox, tier 1: triggers queue rows, receipts are readable by the
-- director and the addressee only, subscriptions are strictly one's own.
begin;
select plan(11);

-- ---------------------------------------------------------------------------
-- The director hands out a task: one queued push for the assignee
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

insert into tasks (id, company_id, author_id, assignee_id, title, status)
values ('90000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007',
        'Проверить склад', 'sent');

select is(
  (select count(*) from notification_deliveries
    where task_id = '90000000-0000-0000-0000-000000000001' and event_kind = 'task_sent' and status = 'queued'),
  1::bigint,
  'sent task queues exactly one push for the assignee'
);
select is(
  (select user_id from notification_deliveries where task_id = '90000000-0000-0000-0000-000000000001' and event_kind = 'task_sent'),
  '10000000-0000-0000-0000-000000000007'::uuid,
  'the push goes to the assignee'
);

-- an announcement reaches every active person except the kiosk and the author
insert into announcements (id, company_id, author_id, transcript)
values ('90000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Завтра собрание');
select is(
  (select count(*) from notification_deliveries where event_kind = 'announcement'),
  (select count(*) from profiles
    where company_id = '11111111-1111-1111-1111-111111111111' and is_active and role <> 'tv'
      and id <> '10000000-0000-0000-0000-000000000001'),
  'announcement queues one push per active person minus kiosk and author'
);

-- ---------------------------------------------------------------------------
-- A question from the assignee queues a push for the author
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
insert into task_messages (company_id, task_id, sender_id, type, content, meta)
values ('11111111-1111-1111-1111-111111111111', '90000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000007', 'text', 'Какой склад?', '{"is_question": true}');
select is(
  (select count(*) from notification_deliveries
    where task_id = '90000000-0000-0000-0000-000000000001' and event_kind = 'question'),
  1::bigint,
  'question queues a push for the author'
);

-- ---------------------------------------------------------------------------
-- Receipts: the addressee reads own rows, the director reads all, others none
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from notification_deliveries where task_id = '90000000-0000-0000-0000-000000000001' and event_kind = 'task_sent'),
  1::bigint,
  'assignee reads own delivery row'
);
select is(
  (select count(*) from notification_deliveries
    where task_id = '90000000-0000-0000-0000-000000000001' and event_kind = 'question'),
  0::bigint,
  'assignee does not read the director''s receipt row'
);

-- no update policy: an addressee cannot forge a receipt
update notification_deliveries set seen_at = now() where task_id = '90000000-0000-0000-0000-000000000001';
select is(
  (select count(*) from notification_deliveries
    where task_id = '90000000-0000-0000-0000-000000000001' and seen_at is not null),
  0::bigint,
  'addressee cannot stamp seen_at'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';
select is(
  (select count(*) from notification_deliveries where task_id = '90000000-0000-0000-0000-000000000001'),
  0::bigint,
  'another employee reads no receipts of that task'
);

-- ---------------------------------------------------------------------------
-- Subscriptions: own only
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into push_subscriptions (company_id, user_id, endpoint, p256dh, auth)
     values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000005',
             'https://push.example/own', 'k', 'a') $$,
  'employee registers own browser'
);
select throws_ok(
  $$ insert into push_subscriptions (company_id, user_id, endpoint, p256dh, auth)
     values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000007',
             'https://push.example/other', 'k', 'a') $$,
  '42501',
  null,
  'employee cannot register a browser for somebody else'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select is(
  (select count(*) from push_subscriptions where endpoint = 'https://push.example/own'),
  0::bigint,
  'another employee does not see that subscription'
);

select * from finish();
rollback;
