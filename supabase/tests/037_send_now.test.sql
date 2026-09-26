-- «Отправить сейчас» after the fact (D-129): the director sends a held task at once, and the
-- words a task queued for the morning leave with it; the director's own held pushes stay; a
-- held announcement goes the same way. Only the director has the button.
-- Fixtures — supabase/seed.sql: director …0001, …0007 (pinned an employee here — dev's may differ).
begin;
select plan(18);

-- the rest of dev's queue must not get in the way
update notification_deliveries set claimed_at = now() where status = 'queued';
update profiles set role = 'employee' where id = '10000000-0000-0000-0000-000000000007';
-- night for the whole test: the window is one minute long
update companies set settings = jsonb_set(coalesce(settings, '{}'), '{delivery_window}', '{"from":"00:00","to":"00:01"}')
 where id = '11111111-1111-1111-1111-111111111111';

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

insert into tasks (id, company_id, author_id, assignee_id, title, status, scheduled_send_at) values
  ('94000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007',
   'Встретить проверку в 7:30', 'scheduled', now() + interval '8 hours'),
  ('94000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007',
   'Сверить накладные', 'sent', null),
  ('94000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007',
   'Заказать щебень', 'sent', null);

-- ---------------------------------------------------------------------------
-- 1. Only the director has the button
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select throws_ok(
  $$ select send_task_now('94000000-0000-0000-0000-000000000001', null) $$,
  'P0001', 'forbidden', 'an employee cannot send a held task'
);
select throws_ok(
  $$ select send_announcements_now(array['94000000-0000-0000-0000-000000000009'::uuid], null) $$,
  'P0001', 'forbidden', 'an employee cannot send a held announcement'
);
-- the guard reads the claims; RLS is bypassed so the row is really there to update
reset role;
select throws_ok(
  $$ update tasks set status = 'sent' where id = '94000000-0000-0000-0000-000000000001' $$,
  'P0001', 'invalid_transition', 'an employee cannot release a held task through the guard'
);

-- ---------------------------------------------------------------------------
-- 2. A held task goes out now
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  send_task_now('94000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-0000000000a1') ->> 'status',
  'sent',
  'the director sends a held task now'
);
reset role;
select ok(
  (select status = 'sent' and scheduled_send_at <= now() from tasks where id = '94000000-0000-0000-0000-000000000001'),
  'the task is sent, and it left now — not in the morning'
);
select is(
  (select count(*) from notification_deliveries
    where task_id = '94000000-0000-0000-0000-000000000001' and event_kind = 'task_sent'
      and user_id = '10000000-0000-0000-0000-000000000007' and deliver_after <= now()),
  1::bigint,
  'one push for the assignee, due at once despite the night'
);
select is(
  (select count(*) from tv_events where task_id = '94000000-0000-0000-0000-000000000001' and kind = 'task_sent'),
  1::bigint,
  'and one wall event'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (send_task_now('94000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-0000000000a1') ->> 'duplicate')::boolean,
  true,
  'a replay of the same tap is the same call'
);
reset role;
select is(
  (select count(*) from notification_deliveries
    where task_id = '94000000-0000-0000-0000-000000000001' and event_kind = 'task_sent'),
  1::bigint,
  'and queues no second push'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  send_task_now('94000000-0000-0000-0000-000000000001', null) ->> 'released',
  '0',
  'a task already out has nothing more to send'
);

-- ---------------------------------------------------------------------------
-- 3. The words a task queued for the morning leave with it
-- ---------------------------------------------------------------------------
insert into task_messages (company_id, task_id, sender_id, type, content) values
  ('11111111-1111-1111-1111-111111111111', '94000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000001', 'text', 'Накладные в синей папке'),
  ('11111111-1111-1111-1111-111111111111', '94000000-0000-0000-0000-000000000003',
   '10000000-0000-0000-0000-000000000001', 'text', 'Щебень фракции 20–40');
select ok(
  (select bool_and(deliver_after > now()) from notification_deliveries
    where task_id in ('94000000-0000-0000-0000-000000000002', '94000000-0000-0000-0000-000000000003')
      and event_kind = 'message' and user_id = '10000000-0000-0000-0000-000000000007'),
  'at night the director''s words wait for the morning'
);

-- the director's own push of the same task, held by their «Не беспокоить»
reset role;
insert into notification_deliveries (company_id, user_id, task_id, event_kind, meta, deliver_after)
values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001',
        '94000000-0000-0000-0000-000000000002', 'message', '{"title":"t","body":"b"}', now() + interval '6 hours');
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  send_task_now('94000000-0000-0000-0000-000000000002', '94000000-0000-0000-0000-0000000000a2') ->> 'released',
  '1',
  '«отправить сейчас» on a sent task releases its held word'
);
reset role;
select ok(
  (select bool_and(deliver_after <= now()) from notification_deliveries
    where task_id = '94000000-0000-0000-0000-000000000002' and user_id = '10000000-0000-0000-0000-000000000007'),
  'the employee gets it now'
);
select ok(
  (select deliver_after > now() from notification_deliveries
    where task_id = '94000000-0000-0000-0000-000000000002' and user_id = '10000000-0000-0000-0000-000000000001'),
  'the director''s own held push keeps the director''s settings'
);
select ok(
  (select bool_and(deliver_after > now()) from notification_deliveries
    where task_id = '94000000-0000-0000-0000-000000000003' and event_kind = 'message'
      and user_id = '10000000-0000-0000-0000-000000000007'),
  'another task''s words keep waiting'
);
select is(
  (select status::text from tasks where id = '94000000-0000-0000-0000-000000000002'),
  'sent',
  'the task itself does not move'
);

-- ---------------------------------------------------------------------------
-- 4. A held announcement
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
insert into announcements (id, company_id, author_id, transcript)
values ('94000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Завтра офис открыт с 10:00');
select is(
  send_announcements_now(array['94000000-0000-0000-0000-000000000009'::uuid], null) ->> 'released',
  (select count(*)::text from notification_deliveries d
    where d.event_kind = 'announcement' and d.meta->>'announcement_id' = '94000000-0000-0000-0000-000000000009'
      and not exists (select 1 from profiles p where p.id = d.user_id and p.role = 'director')),
  'every held push of the announcement is released'
);
reset role;
select ok(
  (select bool_and(deliver_after <= now()) from notification_deliveries d
    where d.event_kind = 'announcement' and d.meta->>'announcement_id' = '94000000-0000-0000-0000-000000000009'
      and not exists (select 1 from profiles p where p.id = d.user_id and p.role = 'director')),
  'the team hears it now'
);

select * from finish();
rollback;
