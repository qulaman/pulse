-- What the director is told on top of the events (D-114): held rows become one «Сводка», one
-- held row goes as itself, what he saw in the app is not told again; «Задача не открыта»
-- after N minutes inside the window, once; «Просрочено» once per deadline; «Итог дня» once.
-- Counts are scoped to this file's rows: dev holds other people's tasks and queues.
-- Fixtures — supabase/seed.sql: director …0001, Марат …0007, Ерлан Б. …0005.
begin;
select plan(16);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
update profiles set role = 'employee' where id = '10000000-0000-0000-0000-000000000007';
update companies set settings = jsonb_set(coalesce(settings, '{}'), '{delivery_window}', '{"from":"00:00","to":"23:59"}')
 where id = '11111111-1111-1111-1111-111111111111';
-- dev's own queue of the director would join the digest: close it for this run
update notification_deliveries set status = 'sent'
 where user_id = '10000000-0000-0000-0000-000000000001' and status = 'queued';

insert into tasks (id, company_id, author_id, assignee_id, title, status, deadline) values
  ('94000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'Сверка с банком', 'sent', null),
  ('94000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'Акт сверки', 'sent',
   now() - interval '1 hour');

-- ---------------------------------------------------------------------------
-- 1. Digests
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_notify_prefs('{"modes":{"messages":"digest","questions":"digest","declined":"digest"}}'::jsonb);
reset role;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
insert into task_messages (company_id, task_id, sender_id, type, content, meta)
values ('11111111-1111-1111-1111-111111111111', '94000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000007', 'text', 'Какой банк?', '{"is_question": true}');
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';
update tasks set status = 'declined' where id = '94000000-0000-0000-0000-000000000002';

select is(
  (select count(*) from notification_deliveries
    where user_id = '10000000-0000-0000-0000-000000000001' and status = 'queued' and mode = 'digest'
      and task_id in ('94000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000002')),
  2::bigint,
  'a question and a refusal wait for the digest'
);
select director_digests_due(now());
select is(
  (select count(*) from notification_deliveries
    where user_id = '10000000-0000-0000-0000-000000000001' and event_kind = 'digest' and created_at = now()),
  0::bigint,
  'before its slot the digest is not made'
);
select director_digests_due(now() + interval '2 hours');
select is(
  (select meta ->> 'title' || ': ' || (meta ->> 'body') from notification_deliveries
    where user_id = '10000000-0000-0000-0000-000000000001' and event_kind = 'digest' and created_at = now()),
  'Сводка: 1 отказ · 1 вопрос',
  'at its slot two held words become one push'
);
select is(
  (select count(*) from notification_deliveries d
    where d.task_id in ('94000000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000002')
      and d.user_id = '10000000-0000-0000-0000-000000000001' and d.status = 'sent' and d.digest_id is not null),
  2::bigint,
  'the held rows are marked as told inside the digest'
);
select director_digests_due(now() + interval '3 hours');
select is(
  (select count(*) from notification_deliveries
    where user_id = '10000000-0000-0000-0000-000000000001' and event_kind = 'digest' and created_at = now()),
  1::bigint,
  'a second tick makes no second digest'
);

-- one held word goes as itself; a word seen in the app is not told again
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
insert into task_messages (company_id, task_id, sender_id, type, content)
values ('11111111-1111-1111-1111-111111111111', '94000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000007', 'text', 'Выписка готова');
select director_digests_due(now() + interval '2 hours');
select is(
  (select mode || '/' || status::text from notification_deliveries
    where task_id = '94000000-0000-0000-0000-000000000001' and event_kind = 'message'
      and user_id = '10000000-0000-0000-0000-000000000001' and meta ->> 'body' = 'Выписка готова'),
  'now/queued',
  'a single held word goes out as itself'
);
-- the worker took it; the next word is a row of its own, not folded into the sent one
update notification_deliveries set status = 'sent'
 where user_id = '10000000-0000-0000-0000-000000000001' and meta ->> 'body' = 'Выписка готова';
insert into task_messages (company_id, task_id, sender_id, type, content)
values ('11111111-1111-1111-1111-111111111111', '94000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000007', 'text', 'Банк ответил');
update notification_deliveries set seen_at = now()
 where task_id = '94000000-0000-0000-0000-000000000001' and meta ->> 'body' like '%Банк ответил%';
select director_digests_due(now() + interval '2 hours');
select is(
  (select status::text || '/' || last_error from notification_deliveries
    where task_id = '94000000-0000-0000-0000-000000000001' and meta ->> 'body' like '%Банк ответил%'
      and user_id = '10000000-0000-0000-0000-000000000001'),
  'failed/seen_in_app',
  'what the director saw in the app is not told again'
);

-- ---------------------------------------------------------------------------
-- 2. «Задача не открыта»
-- ---------------------------------------------------------------------------
update notification_deliveries set status = 'sent', sent_at = now() - interval '40 minutes'
 where task_id = '94000000-0000-0000-0000-000000000001' and event_kind = 'task_sent';
select unseen_task_alerts_due(now());
select is(
  (select meta ->> 'title' from notification_deliveries
    where task_id = '94000000-0000-0000-0000-000000000001' and event_kind = 'task_unseen'),
  'Задача не открыта · Марат',
  'forty minutes unseen: the director is told'
);
select unseen_task_alerts_due(now() + interval '5 minutes');
select is(
  (select count(*) from notification_deliveries
    where task_id = '94000000-0000-0000-0000-000000000001' and event_kind = 'task_unseen'),
  1::bigint,
  'once per sending'
);
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select set_notify_prefs('{"unseen_after_min":60}'::jsonb);
reset role;
delete from notification_deliveries
 where task_id = '94000000-0000-0000-0000-000000000001' and event_kind = 'task_unseen';
select unseen_task_alerts_due(now());
select is(
  (select count(*) from notification_deliveries
    where task_id = '94000000-0000-0000-0000-000000000001' and event_kind = 'task_unseen'),
  0::bigint,
  'with an hour set, forty minutes is not yet news'
);
update companies set settings = jsonb_set(settings, '{delivery_window}', '{"from":"00:00","to":"00:01"}')
 where id = '11111111-1111-1111-1111-111111111111';
select unseen_task_alerts_due(now() + interval '1 hour');
select is(
  (select count(*) from notification_deliveries
    where task_id = '94000000-0000-0000-0000-000000000001' and event_kind = 'task_unseen'),
  0::bigint,
  'outside the working window nobody is expected to open anything'
);

-- ---------------------------------------------------------------------------
-- 3. «Просрочено»
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
update tasks set status = 'sent' where id = '94000000-0000-0000-0000-000000000002';
select overdue_alerts_due(now());
select is(
  (select meta ->> 'title' from notification_deliveries
    where task_id = '94000000-0000-0000-0000-000000000002' and event_kind = 'task_overdue'),
  'Просрочено · Ерлан',
  'a passed deadline on an open task is told'
);
select overdue_alerts_due(now() + interval '1 minute');
select is(
  (select count(*) from notification_deliveries
    where task_id = '94000000-0000-0000-0000-000000000002' and event_kind = 'task_overdue'),
  1::bigint,
  'once per deadline'
);
update tasks set deadline = now() - interval '10 minutes' where id = '94000000-0000-0000-0000-000000000002';
select overdue_alerts_due(now());
select is(
  (select count(*) from notification_deliveries
    where task_id = '94000000-0000-0000-0000-000000000002' and event_kind = 'task_overdue'),
  2::bigint,
  'a new deadline that passes again is news again'
);

-- ---------------------------------------------------------------------------
-- 4. «Итог дня»
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_notify_prefs(jsonb_build_object('day_summary_at',
  to_char((now() - interval '5 minutes') at time zone 'Asia/Aqtobe', 'HH24:MI')));
reset role;
select director_day_summaries_due(now());
select is(
  (select count(*) from notification_deliveries
    where user_id = '10000000-0000-0000-0000-000000000001' and event_kind = 'day_summary' and created_at = now()),
  1::bigint,
  'at the director''s time the day summary is made'
);
select director_day_summaries_due(now() + interval '1 minute');
select is(
  (select count(*) from notification_deliveries
    where user_id = '10000000-0000-0000-0000-000000000001' and event_kind = 'day_summary' and created_at = now()),
  1::bigint,
  'once a day'
);

select * from finish();
rollback;
