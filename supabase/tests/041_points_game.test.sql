-- D-133: очки и game feel — авто-правила на переходах задачи, серия в базе, реакции директора
-- с ценой, «Оспорить» минус, публичные события Эфира.
-- Counts are scoped to this file's rows: dev holds other people's tasks, ledgers and queues.
-- Fixtures — supabase/seed.sql: director …0001, Марат …0007, Ерлан Б. …0005.
begin;
select plan(44);

update profiles set role = 'employee', is_active = true, availability = 'active'
 where id in ('10000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000005');
update companies
   set settings = (coalesce(settings, '{}') - 'points_rules' - 'ether_events')
                  || '{"points_enabled": true, "delivery_window": {"from": "00:00", "to": "23:59"}}'::jsonb
 where id = '11111111-1111-1111-1111-111111111111';

insert into tasks (id, company_id, author_id, assignee_id, title, status, deadline, created_at, completed_at) values
  -- sent five minutes ago: «Принял» now is quick
  ('97000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'pgtap быстро', 'sent',
   now() + interval '2 days', now() - interval '5 minutes', null),
  -- sent an hour ago: no bonus (its push row is dropped below)
  ('97000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'pgtap медленно', 'sent',
   now() + interval '2 days', now() - interval '1 hour', null),
  -- handed in after the half of its time, before the deadline: «в срок»
  ('97000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'pgtap в срок', 'pending_review',
   now() + interval '1 hour', now() - interval '5 hours', now() - interval '1 hour'),
  -- handed in within the first half: «досрочно»
  ('97000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'pgtap досрочно', 'pending_review',
   now() + interval '10 hours', now() - interval '10 hours', now() - interval '9 hours'),
  -- handed in after the deadline: the penalty is off by default
  ('97000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'pgtap поздно', 'pending_review',
   now() - interval '2 hours', now() - interval '5 hours', now() - interval '1 hour'),
  -- for Ерлан, to accept with points switched off
  ('97000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'pgtap без очков', 'pending_review',
   now() + interval '1 hour', now() - interval '5 hours', now() - interval '1 hour'),
  -- not reactable: still waiting for its morning
  ('97000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'pgtap отложена', 'scheduled',
   null, now(), null);
delete from notification_deliveries where task_id = '97000000-0000-0000-0000-000000000002';

-- ---------------------------------------------------------------------------
-- 1. Auto-rules
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select transition_task('97000000-0000-0000-0000-000000000001', 'accepted');
select transition_task('97000000-0000-0000-0000-000000000002', 'accepted');

set local role postgres;
select is(
  (select amount from point_transactions where task_id = '97000000-0000-0000-0000-000000000001' and rule_code = 'quick_accept'),
  1,
  'accepted within 10 minutes of the push: +1'
);
select is(
  (select count(*)::int from point_transactions where task_id = '97000000-0000-0000-0000-000000000002' and source = 'auto_rule'),
  0,
  'accepted an hour later: nothing'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select transition_task('97000000-0000-0000-0000-000000000003', 'done');
select transition_task('97000000-0000-0000-0000-000000000004', 'done');
select transition_task('97000000-0000-0000-0000-000000000005', 'done');

set local role postgres;
select is(
  (select amount from point_transactions where task_id = '97000000-0000-0000-0000-000000000003' and rule_code = 'on_time'),
  3,
  'handed in by the deadline: +3'
);
select is(
  (select amount from point_transactions where task_id = '97000000-0000-0000-0000-000000000004' and rule_code = 'early'),
  5,
  'handed in within the first half of the time: +5'
);
select is(
  (select count(*)::int from point_transactions where task_id = '97000000-0000-0000-0000-000000000004' and rule_code = 'on_time'),
  0,
  '«досрочно» replaces «в срок», never both'
);
select is(
  (select count(*)::int from point_transactions where task_id = '97000000-0000-0000-0000-000000000005' and source = 'auto_rule'),
  0,
  'late: no penalty while late_on is off (D-28)'
);
select is(
  (select reason from point_transactions where task_id = '97000000-0000-0000-0000-000000000003' and rule_code = 'on_time'),
  'в срок: «pgtap в срок»',
  'the reason names the rule and the task'
);
select is(
  (select count(*)::int from tv_events where task_id in ('97000000-0000-0000-0000-000000000003', '97000000-0000-0000-0000-000000000004')
      and kind = 'points'),
  0,
  'an automatic bonus is not a line on the wall'
);

-- the penalty, switched on, is not taken from somebody on leave
update companies set settings = settings || '{"points_rules": {"late_on": true, "late": 7}}'::jsonb
 where id = '11111111-1111-1111-1111-111111111111';
insert into tasks (id, company_id, author_id, assignee_id, title, status, deadline, created_at, completed_at) values
  ('97000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'pgtap штраф', 'pending_review',
   now() - interval '2 hours', now() - interval '5 hours', now() - interval '1 hour'),
  ('97000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'pgtap отпуск', 'pending_review',
   now() - interval '2 hours', now() - interval '5 hours', now() - interval '1 hour');
update profiles set availability = 'vacation' where id = '10000000-0000-0000-0000-000000000005';

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select transition_task('97000000-0000-0000-0000-000000000008', 'done');
select transition_task('97000000-0000-0000-0000-000000000009', 'done');

set local role postgres;
select is(
  (select amount from point_transactions where task_id = '97000000-0000-0000-0000-000000000008' and rule_code = 'late'),
  -7,
  'late with the penalty on: the configured minus'
);
select is(
  (select count(*)::int from point_transactions where task_id = '97000000-0000-0000-0000-000000000009' and source = 'auto_rule'),
  0,
  'late while on leave: no penalty (D-09)'
);
update profiles set availability = 'active' where id = '10000000-0000-0000-0000-000000000005';

-- points off: nothing at all
update companies set settings = settings || '{"points_enabled": false}'::jsonb
 where id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select transition_task('97000000-0000-0000-0000-000000000006', 'done');
set local role postgres;
select is(
  (select count(*)::int from point_transactions where task_id = '97000000-0000-0000-0000-000000000006'),
  0,
  'points switched off: no automatic row'
);
update companies set settings = (settings - 'points_rules') || '{"points_enabled": true}'::jsonb
 where id = '11111111-1111-1111-1111-111111111111';

-- ---------------------------------------------------------------------------
-- 2. The streak
-- ---------------------------------------------------------------------------
select is(
  (select streak_count from profiles where id = '10000000-0000-0000-0000-000000000007'),
  task_streak_of('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000007'),
  '«Принято» writes the streak into the profile'
);
-- three closings ahead of everything on dev: on time, late, on time — the newest run is one
insert into tasks (id, company_id, author_id, assignee_id, title, status, deadline, created_at, completed_at, closed_at) values
  ('97000000-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'pgtap серия 1', 'done',
   now() + interval '1 hour', now() - interval '1 hour', now(), now() + interval '1 minute'),
  ('97000000-0000-0000-0000-000000000012', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'pgtap серия 2', 'done',
   now() - interval '1 hour', now() - interval '2 hours', now(), now() + interval '2 minutes'),
  ('97000000-0000-0000-0000-000000000013', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'pgtap без срока', 'done',
   null, now() - interval '1 hour', now(), now() + interval '3 minutes'),
  ('97000000-0000-0000-0000-000000000014', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'pgtap серия 3', 'done',
   now() + interval '1 hour', now() - interval '1 hour', now(), now() + interval '4 minutes');
select is(
  task_streak_of('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000007'),
  1,
  'the run stops at the first late handover; a task without a deadline neither counts nor breaks'
);

-- ---------------------------------------------------------------------------
-- 3. Reactions
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (react_to_task('97000000-0000-0000-0000-000000000003', 'fire', '97000000-0000-0000-0000-0000000000a1') ->> 'points')::int,
  10,
  '🔥 pays 10 by default'
);
select is(
  (react_to_task('97000000-0000-0000-0000-000000000003', 'fire', '97000000-0000-0000-0000-0000000000a1') ->> 'duplicate'),
  'true',
  'a replay of the key is a duplicate'
);
select react_to_task('97000000-0000-0000-0000-000000000003', 'heart');
select is(
  (select sum(amount)::int from point_transactions where task_id = '97000000-0000-0000-0000-000000000003' and source = 'reaction'),
  100,
  '🔥 → ❤️: the difference is paid, the task''s reaction rows add up to 100'
);
select react_to_task('97000000-0000-0000-0000-000000000003', 'like');
select is(
  (select sum(amount)::int from point_transactions where task_id = '97000000-0000-0000-0000-000000000003' and source = 'reaction'),
  1,
  '❤️ → 👍: the difference is taken back, the rows add up to 1'
);
select is(
  (select count(*)::int from notification_deliveries
    where task_id = '97000000-0000-0000-0000-000000000003' and event_kind = 'reaction' and status = 'queued'),
  1,
  'one queued push for the task, rewritten — never three'
);
select react_to_task('97000000-0000-0000-0000-000000000003', null);
select is(
  (select coalesce(sum(amount), 0)::int from point_transactions where task_id = '97000000-0000-0000-0000-000000000003' and source = 'reaction'),
  0,
  'taken off: the rows add up to zero'
);
select is(
  (select count(*)::int from task_reactions where task_id = '97000000-0000-0000-0000-000000000003'),
  0,
  'taken off: the reaction row is gone'
);
select react_to_task('97000000-0000-0000-0000-000000000004', 'clap');
select is(
  (select count(*)::int from point_transactions where task_id = '97000000-0000-0000-0000-000000000004' and source = 'reaction'),
  0,
  '👏 is free by default: no row'
);
select throws_ok(
  $$ select react_to_task('97000000-0000-0000-0000-000000000007', 'fire') $$,
  'P0001', 'not_reactable',
  'a scheduled task takes no reaction'
);
select throws_ok(
  $$ select react_to_task('97000000-0000-0000-0000-000000000004', 'rocket') $$,
  'P0001', 'unknown_reaction',
  'only the seven reactions exist'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select is(
  (select code from task_reactions where task_id = '97000000-0000-0000-0000-000000000004'),
  'clap',
  'the assignee sees the reaction to their task'
);
select throws_ok(
  $$ select react_to_task('97000000-0000-0000-0000-000000000004', 'fire') $$,
  'P0001', 'forbidden',
  'only the director reacts'
);
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';
select is(
  (select count(*)::int from task_reactions where task_id = '97000000-0000-0000-0000-000000000004'),
  0,
  'a colleague does not see it'
);

-- ---------------------------------------------------------------------------
-- 4. «Оспорить»
-- ---------------------------------------------------------------------------
set local role postgres;
insert into point_transactions (id, company_id, user_id, amount, reason, source, actor_id) values
  ('97000000-0000-0000-0000-0000000000d1', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000007', -5, 'pgtap опоздал на планёрку', 'manual', '10000000-0000-0000-0000-000000000001'),
  ('97000000-0000-0000-0000-0000000000d2', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000007', 5, 'pgtap плюс', 'manual', '10000000-0000-0000-0000-000000000001');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select lives_ok(
  $$ select dispute_points('97000000-0000-0000-0000-0000000000d1', 'Я был у заказчика, директор знал') $$,
  'the person disputes their own minus'
);
select throws_ok(
  $$ select dispute_points('97000000-0000-0000-0000-0000000000d1', 'ещё раз') $$,
  'P0001', 'already_disputed',
  'one dispute per minus'
);
select throws_ok(
  $$ select dispute_points('97000000-0000-0000-0000-0000000000d2', 'за что плюс?') $$,
  'P0001', 'not_disputable',
  'a plus is not disputed'
);
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';
select is(
  (select count(*)::int from point_disputes where transaction_id = '97000000-0000-0000-0000-0000000000d1'),
  0,
  'a colleague does not see the dispute'
);
select throws_ok(
  $$ select dispute_points('97000000-0000-0000-0000-0000000000d1', 'чужое') $$,
  'P0001', 'not_found',
  'nobody disputes somebody else''s minus'
);

set local role postgres;
select is(
  (select category from notification_deliveries
    where event_kind = 'points_dispute' and user_id = '10000000-0000-0000-0000-000000000001'
      and meta ->> 'body' like '%pgtap опоздал%'),
  'shop',
  'the director gets «Оспаривает» under «Магазин и очки»'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select throws_ok(
  $$ select resolve_points_dispute((select id from point_disputes where transaction_id = '97000000-0000-0000-0000-0000000000d1'), true) $$,
  'P0001', 'forbidden',
  'only the director answers a dispute'
);
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (resolve_points_dispute((select id from point_disputes where transaction_id = '97000000-0000-0000-0000-0000000000d1'), true, 'Верно, вернул') ->> 'status'),
  'refunded',
  '«Вернуть очки»'
);
select throws_ok(
  $$ select resolve_points_dispute((select id from point_disputes where transaction_id = '97000000-0000-0000-0000-0000000000d1'), false) $$,
  'P0001', 'already_resolved',
  'a dispute is answered once'
);

set local role postgres;
select is(
  (select amount from point_transactions t
     join point_disputes d on d.refund_id = t.id
    where d.transaction_id = '97000000-0000-0000-0000-0000000000d1' and t.quiet and t.rule_code = 'refund'),
  5,
  'the refund is one quiet row of the same size; the minus stays in the ledger'
);
select is(
  (select count(*)::int from tv_events where payload ->> 'title' like 'возврат: pgtap%'),
  0,
  'a refund never reaches the wall'
);
select is(
  (select meta ->> 'title' from notification_deliveries
    where event_kind = 'points_answer' and user_id = '10000000-0000-0000-0000-000000000007'
      and meta ->> 'body' = 'Верно, вернул'),
  'Очки вернули · +5',
  'the person hears the answer'
);

-- ---------------------------------------------------------------------------
-- 5. Эфир
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select award_points('10000000-0000-0000-0000-000000000007', 20, 'pgtap за выручку');
select award_points('10000000-0000-0000-0000-000000000007', 15, 'pgtap тихо', null, false);
select award_points('10000000-0000-0000-0000-000000000007', -3, 'pgtap минус');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';
select is(
  (select amount from ether_events where kind = 'praise' and title = 'pgtap за выручку'),
  20,
  'a praise is a public line on Эфир, a colleague reads it'
);
select is(
  (select count(*)::int from ether_events where title in ('pgtap тихо', 'pgtap минус')),
  0,
  'an unticked «Сказать в Эфире» and a minus never get there'
);

set local role postgres;
select ok(
  (select quiet from point_transactions where reason = 'pgtap тихо'),
  'the quiet award is marked'
);
select is(
  (select count(*)::int from tv_events where payload ->> 'title' = 'pgtap тихо'),
  0,
  'a quiet award stays off the wall too'
);

-- a reward handed out is news for the team
insert into orders (id, company_id, user_id, item_id, price, status)
select '97000000-0000-0000-0000-0000000000e1', '11111111-1111-1111-1111-111111111111',
       '10000000-0000-0000-0000-000000000007', i.id, 200, 'approved'
  from shop_items i where i.company_id = '11111111-1111-1111-1111-111111111111' order by i.price limit 1;
update orders set status = 'delivered', delivered_at = now() where id = '97000000-0000-0000-0000-0000000000e1';
select is(
  (select count(*)::int from ether_events where kind = 'merch' and order_id = '97000000-0000-0000-0000-0000000000e1'),
  1,
  'a delivered order is a «получил» line on Эфир'
);

update companies set settings = settings || '{"ether_events": {"merch": true, "praise": false}}'::jsonb
 where id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select award_points('10000000-0000-0000-0000-000000000007', 20, 'pgtap выключено');
set local role postgres;
select is(
  (select count(*)::int from ether_events where title = 'pgtap выключено'),
  0,
  'praise switched off in the settings: nothing on Эфир'
);

select * from finish();
rollback;
