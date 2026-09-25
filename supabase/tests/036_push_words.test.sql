-- A push says who and when (D-125): task pushes name the other side and carry a deadline that
-- is still ahead, a request without a note names who asks, a visitor without a name gets the
-- question the director answers. push_when() speaks like humanAqtobe() on the card.
-- Fixtures — supabase/seed.sql: director …0001, …0006 (employee), …0008 (secretary here);
-- names and roles are pinned below, dev's may differ.
begin;
select plan(20);

-- the rest of dev's queue must not get in the way
update notification_deliveries set claimed_at = now() where status = 'queued';

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
update profiles set full_name = 'Ерлан Сапаров' where id = '10000000-0000-0000-0000-000000000001';
update profiles set full_name = 'Айгуль Нурланова', role = 'employee' where id = '10000000-0000-0000-0000-000000000006';
update profiles set full_name = 'Сауле Ахметова', role = 'secretary' where id = '10000000-0000-0000-0000-000000000008';

-- ---------------------------------------------------------------------------
-- 1. push_when — Friday 25.09.2026 10:00 Aqtobe is «now»
-- ---------------------------------------------------------------------------
select is(push_when('2026-09-25 13:00+00', '2026-09-25 05:00+00'), 'сегодня 18:00', 'today');
select is(push_when('2026-09-26 13:00+00', '2026-09-25 05:00+00'), 'завтра 18:00', 'tomorrow');
select is(push_when('2026-09-29 13:00+00', '2026-09-25 05:00+00'), 'вт 18:00', 'within the week — the weekday');
select is(push_when('2026-10-05 13:00+00', '2026-09-25 05:00+00'), '05.10 18:00', 'further — the date');
select is(push_when('2027-01-05 04:00+00', '2026-09-25 05:00+00'), '05.01.2027 09:00', 'another year — with the year');
select is(push_when('2026-09-25 19:30+00', '2026-09-25 18:00+00'), 'завтра 00:30', 'the day turns at Aqtobe midnight, not UTC');
select is(push_when(null), null, 'no date — no words');

-- ---------------------------------------------------------------------------
-- 2. A new task: who gave it and until when
-- ---------------------------------------------------------------------------
set local role authenticated;
insert into tasks (id, company_id, author_id, assignee_id, title, status, deadline) values
  ('93000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006',
   'Купить две пачки А4', 'sent', now() + interval '2 days'),
  ('93000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006',
   'Сверить склад', 'sent', null),
  ('93000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006',
   'Старый отчёт', 'sent', now() - interval '1 hour');

set local role service_role;
select is(
  (select meta->>'title' from notification_deliveries
    where task_id = '93000000-0000-0000-0000-000000000001' and event_kind = 'task_sent'),
  'Новая задача · Ерлан',
  'the employee sees who gave the task'
);
select is(
  (select meta->>'body' from notification_deliveries
    where task_id = '93000000-0000-0000-0000-000000000001' and event_kind = 'task_sent'),
  'Купить две пачки А4 · срок ' || push_when(now() + interval '2 days'),
  'and until when'
);
select is(
  (select meta->>'body' from notification_deliveries
    where task_id = '93000000-0000-0000-0000-000000000002' and event_kind = 'task_sent'),
  'Сверить склад',
  'a task without a deadline is just its title'
);
select is(
  (select meta->>'body' from notification_deliveries
    where task_id = '93000000-0000-0000-0000-000000000003' and event_kind = 'task_sent'),
  'Старый отчёт',
  'a deadline already behind is not announced'
);

-- ---------------------------------------------------------------------------
-- 3. The way back and forth: each side hears the other's name
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}';
select transition_task(task_id := '93000000-0000-0000-0000-000000000001'::uuid, to_status := 'accepted'::task_status, payload := '{}'::jsonb);
select transition_task(task_id := '93000000-0000-0000-0000-000000000001'::uuid, to_status := 'pending_review'::task_status, payload := '{}'::jsonb);
select transition_task(task_id := '93000000-0000-0000-0000-000000000002'::uuid, to_status := 'declined'::task_status, payload := '{"reason":"Нет доступа"}'::jsonb);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select transition_task(task_id := '93000000-0000-0000-0000-000000000001'::uuid, to_status := 'rework'::task_status, payload := '{"comment":"Не та бумага"}'::jsonb);
select transition_task(task_id := '93000000-0000-0000-0000-000000000003'::uuid, to_status := 'revoked'::task_status, payload := '{}'::jsonb);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}';
select transition_task(task_id := '93000000-0000-0000-0000-000000000001'::uuid, to_status := 'accepted'::task_status, payload := '{}'::jsonb);
select transition_task(task_id := '93000000-0000-0000-0000-000000000001'::uuid, to_status := 'pending_review'::task_status, payload := '{}'::jsonb);
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select transition_task(task_id := '93000000-0000-0000-0000-000000000001'::uuid, to_status := 'done'::task_status, payload := '{}'::jsonb);

set local role service_role;
select is(
  (select meta->>'title' from notification_deliveries
    where task_id = '93000000-0000-0000-0000-000000000001' and event_kind = 'pending_review'
    order by created_at limit 1),
  'На приёмку · Айгуль',
  'the director sees who hands it in'
);
select is(
  (select meta->>'title' from notification_deliveries
    where task_id = '93000000-0000-0000-0000-000000000002' and event_kind = 'declined'),
  'Не может · Айгуль',
  'and who cannot — with no gendered verb'
);
select is(
  (select meta->>'title' || ' / ' || (meta->>'body') from notification_deliveries
    where task_id = '93000000-0000-0000-0000-000000000001' and event_kind = 'rework'),
  'На доработку · Ерлан / Купить две пачки А4 · срок ' || push_when(now() + interval '2 days'),
  'a rework names the director and keeps the deadline'
);
select is(
  (select meta->>'title' from notification_deliveries
    where task_id = '93000000-0000-0000-0000-000000000003' and event_kind = 'revoked'),
  'Отозвано · Ерлан',
  'a revoked task says who took it back'
);
select is(
  (select meta->>'title' from notification_deliveries
    where task_id = '93000000-0000-0000-0000-000000000001' and event_kind = 'done'),
  'Принято · Ерлан',
  'and who accepted the work'
);

-- ---------------------------------------------------------------------------
-- 4. «Кофе» names who asks; a note still wins
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
insert into errands (company_id, author_id, kind, label, client_request_id)
values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001',
        'coffee', 'Кофе', '5e000000-0000-0000-0000-000000000125');
insert into errands (company_id, author_id, kind, label, note, client_request_id)
values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001',
        'tea', 'Чай', 'зелёный', '5e000000-0000-0000-0000-000000000126');

set local role service_role;
select ok(
  (select count(*) > 0 and bool_and(n.meta->>'body' = 'Просит Ерлан')
     from notification_deliveries n join errands e on e.id::text = n.meta->>'errand_id'
    where n.event_kind = 'errand_sent' and e.client_request_id = '5e000000-0000-0000-0000-000000000125'),
  'a request without a note says who asks'
);
select ok(
  (select count(*) > 0 and bool_and(n.meta->>'body' = 'зелёный')
     from notification_deliveries n join errands e on e.id::text = n.meta->>'errand_id'
    where n.event_kind = 'errand_sent' and e.client_request_id = '5e000000-0000-0000-0000-000000000126'),
  'a note keeps its own words'
);

-- ---------------------------------------------------------------------------
-- 5. A visitor without a name gets the question; a named one keeps the name
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated"}';
select announce_visit(null, '7a000000-0000-0000-0000-000000000125');
select announce_visit('Иванов, по поставкам', '7a000000-0000-0000-0000-000000000126');

set local role service_role;
select is(
  (select n.meta->>'body' from notification_deliveries n join visits v on v.id::text = n.meta->>'visit_id'
    where n.event_kind = 'visit_arrived' and v.client_request_id = '7a000000-0000-0000-0000-000000000125' limit 1),
  'Пусть заходит или подождёт?',
  'a nameless visitor still gets words'
);
select is(
  (select n.meta->>'body' from notification_deliveries n join visits v on v.id::text = n.meta->>'visit_id'
    where n.event_kind = 'visit_arrived' and v.client_request_id = '7a000000-0000-0000-0000-000000000126' limit 1),
  'Иванов, по поставкам',
  'a named one keeps the secretary''s words'
);

select * from finish();
rollback;
