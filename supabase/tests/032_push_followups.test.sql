-- D-114 follow-ups: «Задача не принята» fires even when the phone showed the push; the
-- director hears «Уведомления не доходят» once a week per person; the outbox cleans itself —
-- 30 days for what went, 7 days for what never did.
-- Fixtures — supabase/seed.sql: directors …0001 and …0009, Марат …0007, Ерлан Б. …0005.
begin;
select plan(12);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
update profiles set role = 'employee' where id = '10000000-0000-0000-0000-000000000007';
update companies set settings = jsonb_set(coalesce(settings, '{}'), '{delivery_window}', '{"from":"00:00","to":"23:59"}')
 where id = '11111111-1111-1111-1111-111111111111';

insert into tasks (id, company_id, author_id, assignee_id, title, status) values
  ('95000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'Сверка остатков', 'sent');

-- ---------------------------------------------------------------------------
-- 1. «Задача не принята»: the phone showed it, nobody pressed «Принял»
-- ---------------------------------------------------------------------------
update notification_deliveries
   set status = 'sent', sent_at = now() - interval '40 minutes', seen_at = now() - interval '39 minutes'
 where task_id = '95000000-0000-0000-0000-000000000001' and event_kind = 'task_sent';
select unseen_task_alerts_due(now());
select is(
  (select meta ->> 'title' from notification_deliveries
    where task_id = '95000000-0000-0000-0000-000000000001' and event_kind = 'task_unseen'),
  'Задача не принята · Марат',
  'a shown but not accepted task is news for the director'
);
select ok(
  (select meta ->> 'body' like '«Сверка остатков» · увидел в %' from notification_deliveries
    where task_id = '95000000-0000-0000-0000-000000000001' and event_kind = 'task_unseen'),
  'and the body says the phone showed it'
);
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
update tasks set status = 'accepted' where id = '95000000-0000-0000-0000-000000000001';
delete from notification_deliveries
 where task_id = '95000000-0000-0000-0000-000000000001' and event_kind = 'task_unseen';
select unseen_task_alerts_due(now());
select is(
  (select count(*) from notification_deliveries
    where task_id = '95000000-0000-0000-0000-000000000001' and event_kind = 'task_unseen'),
  0::bigint,
  'an accepted task is not news'
);

-- ---------------------------------------------------------------------------
-- 2. «Уведомления не доходят»
-- ---------------------------------------------------------------------------
-- dev's own failures of Марат would answer first: cleared inside the rollback
delete from notification_deliveries
 where user_id = '10000000-0000-0000-0000-000000000007' and status = 'failed';
insert into notification_deliveries (company_id, user_id, event_kind, meta, status, attempts, last_error, created_at)
values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000005', 'task_sent',
        '{"title":"Новая задача"}', 'failed', 3, 'no_subscription', now() - interval '1 hour');
select team_channel_alerts_due(now());
select is(
  (select count(*) from notification_deliveries
    where event_kind = 'team_channel' and meta ->> 'person_id' = '10000000-0000-0000-0000-000000000005'),
  (select count(*) from profiles
    where company_id = '11111111-1111-1111-1111-111111111111' and role = 'director' and is_active),
  'every director hears that Ерлан gets no pushes'
);
select is(
  (select meta ->> 'title' from notification_deliveries
    where event_kind = 'team_channel' and meta ->> 'person_id' = '10000000-0000-0000-0000-000000000005'
    limit 1),
  'Уведомления не доходят · Ерлан',
  'by name'
);
select is(
  (select category from notification_deliveries
    where event_kind = 'team_channel' and meta ->> 'person_id' = '10000000-0000-0000-0000-000000000005'
    limit 1),
  'team',
  'in the director''s own category'
);
select team_channel_alerts_due(now() + interval '1 hour');
select is(
  (select count(*) from notification_deliveries
    where event_kind = 'team_channel' and meta ->> 'person_id' = '10000000-0000-0000-0000-000000000005'),
  (select count(*) from profiles
    where company_id = '11111111-1111-1111-1111-111111111111' and role = 'director' and is_active),
  'once a week, not every minute'
);

-- a channel that works again is not news
insert into notification_deliveries (company_id, user_id, event_kind, meta, status, attempts, last_error, created_at)
values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000007', 'task_sent',
        '{"title":"Новая задача"}', 'failed', 3, 'push 500', now() - interval '2 hours');
insert into notification_deliveries (company_id, user_id, event_kind, meta, status, sent_at, created_at)
values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000007', 'rework',
        '{"title":"Директор вернул задачу"}', 'sent', now() - interval '1 hour', now() - interval '1 hour');
select team_channel_alerts_due(now());
select is(
  (select count(*) from notification_deliveries
    where event_kind = 'team_channel' and meta ->> 'person_id' = '10000000-0000-0000-0000-000000000007'),
  0::bigint,
  'a push that went through after the failure closes the question'
);

-- ---------------------------------------------------------------------------
-- 3. The outbox cleans itself
-- ---------------------------------------------------------------------------
insert into notification_deliveries (company_id, user_id, event_kind, meta, status, created_at) values
  ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000007', 'done', '{"t":"old-sent"}', 'sent', '2000-01-01'),
  ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000007', 'done', '{"t":"old-queued"}', 'queued', '2000-01-02'),
  ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000007', 'done', '{"t":"ten-days"}', 'sent', now() - interval '10 days'),
  ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000007', 'done', '{"t":"week-queued"}', 'queued', now() - interval '8 days'),
  ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000007', 'done', '{"t":"fresh-queued"}', 'queued', now() - interval '1 day');
select ok(notification_deliveries_purge(now()) >= 3, 'the purge deletes what outlived its time');
select is(
  (select string_agg(meta ->> 't', ',' order by meta ->> 't') from notification_deliveries
    where meta ->> 't' in ('old-sent', 'old-queued', 'ten-days', 'week-queued', 'fresh-queued')),
  'fresh-queued,ten-days',
  'a sent push lives 30 days, a queued one 7'
);
select is(notification_deliveries_purge(now(), 30, 7, 1) <= 1, true, 'one tick deletes at most its batch');

set local role authenticated;
select throws_ok(
  $$ select notification_deliveries_purge(now()) $$,
  '42501', null, 'no person can purge the outbox'
);

select * from finish();
rollback;
