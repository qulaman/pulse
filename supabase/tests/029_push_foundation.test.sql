-- The delivery subsystem stops losing and doubling pushes (D-114, stage 0): held tasks go out
-- on the tick (tasks/017), a worker claims what it sends, «Настоять» at night waits for the
-- window, a deleted announcement takes its queued pushes along, «Не смогу» twice pushes once.
-- Fixtures — supabase/seed.sql: director …0001, Марат …0007.
begin;
select plan(20);

-- the company window is set per case below; the rest of dev's queue must not get in the way
update notification_deliveries set claimed_at = now() where status = 'queued';

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- one task is due (the window opened a minute ago), the other waits for the morning
insert into tasks (id, company_id, author_id, assignee_id, title, status, scheduled_send_at) values
  ('92000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007',
   'Отвезти образцы', 'scheduled', now() - interval '1 minute'),
  ('92000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007',
   'Позвонить в банк', 'scheduled', now() + interval '1 hour');

-- ---------------------------------------------------------------------------
-- 1. Held tasks (tasks/017)
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select is(
  (select count(*) from tasks where id = '92000000-0000-0000-0000-000000000001'),
  0::bigint,
  'the assignee does not see a held task'
);
select throws_ok(
  $$ select publish_due_scheduled(now()) $$,
  '42501', null, 'an employee cannot run the tick'
);

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
select is(
  (select count(*) from notification_deliveries
    where task_id = '92000000-0000-0000-0000-000000000001' and event_kind = 'task_sent'),
  0::bigint,
  'a held task queues no push'
);
select ok(publish_due_scheduled(now()) >= 1, 'the tick releases the due task');
select is(
  (select status::text from tasks where id = '92000000-0000-0000-0000-000000000001'),
  'sent',
  'the due task is sent'
);
select is(
  (select status::text from tasks where id = '92000000-0000-0000-0000-000000000002'),
  'scheduled',
  'the morning task keeps waiting'
);
select is(
  (select count(*) from notification_deliveries
    where task_id = '92000000-0000-0000-0000-000000000001' and event_kind = 'task_sent'
      and user_id = '10000000-0000-0000-0000-000000000007'),
  1::bigint,
  'the release queues one push for the assignee'
);
select is(
  (select count(*) from tv_events
    where task_id = '92000000-0000-0000-0000-000000000001' and kind = 'task_sent'),
  1::bigint,
  'and one wall event'
);
select publish_due_scheduled(now());
select is(
  (select count(*) from notification_deliveries
    where task_id = '92000000-0000-0000-0000-000000000001' and event_kind = 'task_sent'),
  1::bigint,
  'a second tick queues no second push'
);
select publish_due_scheduled(now() + interval '2 hours');
select is(
  (select status::text from tasks where id = '92000000-0000-0000-0000-000000000002'),
  'sent',
  'the morning task goes at its time'
);

-- ---------------------------------------------------------------------------
-- 2. A worker claims what it sends; the second worker gets nothing of it
-- ---------------------------------------------------------------------------
create temp table first_claim as select id from claim_deliveries(500);
select ok(
  exists (select 1 from first_claim f join notification_deliveries d on d.id = f.id
           where d.task_id = '92000000-0000-0000-0000-000000000001' and d.event_kind = 'task_sent'),
  'the first worker claims the released push'
);
select is(
  (select count(*) from claim_deliveries(500) c where c.id in (select id from first_claim)),
  0::bigint,
  'a second worker at the same moment gets none of the claimed rows'
);
update notification_deliveries set claimed_at = now() - interval '3 minutes'
 where id in (select id from first_claim);
select is(
  (select count(*) from claim_deliveries(500) c where c.id in (select id from first_claim)),
  (select count(*) from first_claim),
  'a claim older than two minutes goes back to the queue'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select throws_ok(
  $$ select * from claim_deliveries(1) $$,
  '42501', null, 'no person can claim pushes'
);

-- ---------------------------------------------------------------------------
-- 3. «Настоять» at night waits for the window (the guard reads the claims; RLS is bypassed)
-- ---------------------------------------------------------------------------
reset role;
update companies set settings = jsonb_set(coalesce(settings, '{}'), '{delivery_window}', '{"from":"00:00","to":"00:01"}')
 where id = '11111111-1111-1111-1111-111111111111';
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
insert into tasks (id, company_id, author_id, assignee_id, title, status) values
  ('92000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007',
   'Сверить накладные', 'sent');
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
update tasks set status = 'declined' where id = '92000000-0000-0000-0000-000000000003';
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
update tasks set status = 'sent' where id = '92000000-0000-0000-0000-000000000003';
select ok(
  (select deliver_after > now() from notification_deliveries
    where task_id = '92000000-0000-0000-0000-000000000003' and event_kind = 'task_sent'
    order by created_at desc, deliver_after desc limit 1),
  '«Настоять» outside the window waits for it'
);

-- ---------------------------------------------------------------------------
-- 4. A deleted announcement takes its queued pushes along
-- ---------------------------------------------------------------------------
insert into announcements (id, company_id, author_id, transcript)
values ('92000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Собрание в пятницу');
select ok(
  (select count(*) from notification_deliveries
    where event_kind = 'announcement' and meta->>'announcement_id' = '92000000-0000-0000-0000-000000000004') > 0,
  'an announcement push knows its announcement'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
delete from announcements where id = '92000000-0000-0000-0000-000000000004';
reset role;
select is(
  (select count(*) from notification_deliveries
    where event_kind = 'announcement' and meta->>'announcement_id' = '92000000-0000-0000-0000-000000000004'),
  0::bigint,
  'deleting it drops the pushes still waiting for the window'
);

-- ---------------------------------------------------------------------------
-- 5. «Не смогу» twice tells the author once
-- ---------------------------------------------------------------------------
insert into events (id, company_id, author_id, title, starts_at)
values ('92000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Планёрка', now() + interval '1 day');
insert into event_participants (event_id, user_id)
values ('92000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000007');
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select respond_event('92000000-0000-0000-0000-000000000005', 'declined', 'в командировке');
select respond_event('92000000-0000-0000-0000-000000000005', 'declined', 'в командировке до среды');
reset role;
select is(
  (select count(*) from notification_deliveries
    where event_kind = 'event_declined' and meta->>'url' = '/calendar?e=92000000-0000-0000-0000-000000000005'),
  1::bigint,
  'the author hears «не сможет» once'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select respond_event('92000000-0000-0000-0000-000000000005', 'going');
select respond_event('92000000-0000-0000-0000-000000000005', 'declined');
reset role;
select is(
  (select count(*) from notification_deliveries
    where event_kind = 'event_declined' and meta->>'url' = '/calendar?e=92000000-0000-0000-0000-000000000005'),
  2::bigint,
  'changing the mind back to «не смогу» is news again'
);
select is(
  (select count(*) from notification_deliveries
    where task_id = '92000000-0000-0000-0000-000000000001' and event_kind = 'task_sent' and claimed_at is not null),
  1::bigint,
  'the released push stays claimed by its worker'
);

select * from finish();
rollback;
