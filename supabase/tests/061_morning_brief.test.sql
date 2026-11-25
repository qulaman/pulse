-- D-191: the employee's morning brief (employee_morning_briefs_due, migration 20261124110000).
-- One push a local working day a person, inside the company window: the person's own tasks by
-- urgency — overdue, rework, new, due later today — and today's meetings still ahead. Nothing
-- before the window or after it, nothing a second time the same day (the unique key refuses a twin
-- outright), nothing for an empty day, the director, the kiosk, a person away or let go, a person
-- without a switched-on phone, a company that switched it off, a day off. A task of another company
-- is never counted (принцип 6). The words: morning_brief_body in all its forms.
-- Own fixtures: company A — director DA, E1 (a mix + meetings), E2 (nothing), E3 on leave, E4 let
-- go, E5 with a switched-off phone, M1 a manager (rework), S1 a secretary (a meeting only), TV the
-- kiosk; company B — EB (one new task, plus a stray task row of company A); company C (the brief
-- off) — EC; company W (today is not a working day) — EW. All windows 08:00–21:00.
begin;
select plan(30);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
create temp table d191 as
select (now() at time zone 'Asia/Aqtobe')::date as today,
       (((now() at time zone 'Asia/Aqtobe')::date + time '08:30') at time zone 'Asia/Aqtobe') as at;
grant select on d191 to public;

insert into companies (id, name, settings)
select x.id, x.name,
       jsonb_build_object('delivery_window', jsonb_build_object('from', '08:00', 'to', '21:00'),
                          'daily_report', jsonb_build_object('workdays', x.workdays))
       || x.extra
  from d191,
       lateral (values
         ('19100000-0000-0000-0000-000000000a00'::uuid, 'pgtap-191 Компания A', jsonb_build_array(1, 2, 3, 4, 5, 6, 7), '{}'::jsonb),
         ('19100000-0000-0000-0000-000000000b00'::uuid, 'pgtap-191 Компания B', jsonb_build_array(1, 2, 3, 4, 5, 6, 7), '{"morning_brief": {"enabled": true}}'::jsonb),
         ('19100000-0000-0000-0000-000000000c00'::uuid, 'pgtap-191 Компания C', jsonb_build_array(1, 2, 3, 4, 5, 6, 7), '{"morning_brief": {"enabled": false}}'::jsonb),
         ('19100000-0000-0000-0000-000000000d00'::uuid, 'pgtap-191 Компания W',
          (select jsonb_agg(w) from generate_series(1, 7) w where w <> extract(isodow from today)::int), '{}'::jsonb)
       ) x(id, name, workdays, extra);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', 'pgtap-191-' || u.tag || '@demo.local', now(), now(),
       '', '', '', '', '', '', '', ''
  from (values ('19100000-0000-0000-0000-0000000000a1'::uuid, 'da'),
               ('19100000-0000-0000-0000-0000000000a2'::uuid, 'e1'),
               ('19100000-0000-0000-0000-0000000000a3'::uuid, 'e2'),
               ('19100000-0000-0000-0000-0000000000a4'::uuid, 'e3'),
               ('19100000-0000-0000-0000-0000000000a5'::uuid, 'e4'),
               ('19100000-0000-0000-0000-0000000000a6'::uuid, 'e5'),
               ('19100000-0000-0000-0000-0000000000a7'::uuid, 'm1'),
               ('19100000-0000-0000-0000-0000000000a8'::uuid, 's1'),
               ('19100000-0000-0000-0000-0000000000a9'::uuid, 'tv'),
               ('19100000-0000-0000-0000-0000000000b1'::uuid, 'db'),
               ('19100000-0000-0000-0000-0000000000b2'::uuid, 'eb'),
               ('19100000-0000-0000-0000-0000000000c1'::uuid, 'dc'),
               ('19100000-0000-0000-0000-0000000000c2'::uuid, 'ec'),
               ('19100000-0000-0000-0000-0000000000d1'::uuid, 'dw'),
               ('19100000-0000-0000-0000-0000000000d2'::uuid, 'ew')) u(id, tag);

insert into profiles (id, company_id, full_name, role, is_active, availability, created_at) values
  ('19100000-0000-0000-0000-0000000000a1', '19100000-0000-0000-0000-000000000a00', 'pgtap-191 Директор A', 'director', true, 'active', now() - interval '30 days'),
  ('19100000-0000-0000-0000-0000000000a2', '19100000-0000-0000-0000-000000000a00', 'pgtap-191 E1', 'employee', true, 'active', now() - interval '30 days'),
  ('19100000-0000-0000-0000-0000000000a3', '19100000-0000-0000-0000-000000000a00', 'pgtap-191 E2', 'employee', true, 'active', now() - interval '30 days'),
  ('19100000-0000-0000-0000-0000000000a4', '19100000-0000-0000-0000-000000000a00', 'pgtap-191 E3', 'employee', true, 'vacation', now() - interval '30 days'),
  ('19100000-0000-0000-0000-0000000000a5', '19100000-0000-0000-0000-000000000a00', 'pgtap-191 E4', 'employee', false, 'active', now() - interval '30 days'),
  ('19100000-0000-0000-0000-0000000000a6', '19100000-0000-0000-0000-000000000a00', 'pgtap-191 E5', 'employee', true, 'active', now() - interval '30 days'),
  ('19100000-0000-0000-0000-0000000000a7', '19100000-0000-0000-0000-000000000a00', 'pgtap-191 M1', 'manager', true, 'active', now() - interval '30 days'),
  ('19100000-0000-0000-0000-0000000000a8', '19100000-0000-0000-0000-000000000a00', 'pgtap-191 S1', 'secretary', true, 'active', now() - interval '30 days'),
  ('19100000-0000-0000-0000-0000000000a9', '19100000-0000-0000-0000-000000000a00', 'pgtap-191 TV', 'tv', true, 'active', now() - interval '30 days'),
  ('19100000-0000-0000-0000-0000000000b1', '19100000-0000-0000-0000-000000000b00', 'pgtap-191 Директор B', 'director', true, 'active', now() - interval '30 days'),
  ('19100000-0000-0000-0000-0000000000b2', '19100000-0000-0000-0000-000000000b00', 'pgtap-191 EB', 'employee', true, 'active', now() - interval '30 days'),
  ('19100000-0000-0000-0000-0000000000c1', '19100000-0000-0000-0000-000000000c00', 'pgtap-191 Директор C', 'director', true, 'active', now() - interval '30 days'),
  ('19100000-0000-0000-0000-0000000000c2', '19100000-0000-0000-0000-000000000c00', 'pgtap-191 EC', 'employee', true, 'active', now() - interval '30 days'),
  ('19100000-0000-0000-0000-0000000000d1', '19100000-0000-0000-0000-000000000d00', 'pgtap-191 Директор W', 'director', true, 'active', now() - interval '30 days'),
  ('19100000-0000-0000-0000-0000000000d2', '19100000-0000-0000-0000-000000000d00', 'pgtap-191 EW', 'employee', true, 'active', now() - interval '30 days');

-- everybody has a phone switched on, but E5's is switched off
insert into push_subscriptions (company_id, user_id, endpoint, p256dh, auth, enabled)
select p.company_id, p.id, 'https://push.example/pgtap-191/' || p.id, 'k', 'a', p.id <> '19100000-0000-0000-0000-0000000000a6'
  from profiles p where p.full_name like 'pgtap-191 %';

-- tasks, by the clock of «today 08:30»
insert into tasks (company_id, author_id, assignee_id, title, status, deadline, scheduled_send_at)
select x.company_id, x.author_id, x.assignee_id, 'pgtap-191 ' || x.title, x.status::task_status,
       case when x.due is null then null else ((today + x.due) at time zone 'Asia/Aqtobe') end,
       case when x.status = 'scheduled' then at + interval '2 hours' end
  from d191,
       (values
         -- E1: overdue since yesterday, a new one, one due at 17:00 — counted
         ('19100000-0000-0000-0000-000000000a00'::uuid, '19100000-0000-0000-0000-0000000000a1'::uuid, '19100000-0000-0000-0000-0000000000a2'::uuid, 'просрочена', 'accepted', interval '-1 day 6 hours'),
         ('19100000-0000-0000-0000-000000000a00', '19100000-0000-0000-0000-0000000000a1', '19100000-0000-0000-0000-0000000000a2', 'новая', 'sent', interval '3 days 18 hours'),
         ('19100000-0000-0000-0000-000000000a00', '19100000-0000-0000-0000-0000000000a1', '19100000-0000-0000-0000-0000000000a2', 'к пяти', 'accepted', interval '17 hours'),
         -- E1: held, closed, without a deadline, due tomorrow, on review — not counted
         ('19100000-0000-0000-0000-000000000a00', '19100000-0000-0000-0000-0000000000a1', '19100000-0000-0000-0000-0000000000a2', 'отложена', 'scheduled', interval '20 hours'),
         ('19100000-0000-0000-0000-000000000a00', '19100000-0000-0000-0000-0000000000a1', '19100000-0000-0000-0000-0000000000a2', 'готова', 'done', interval '-1 day'),
         ('19100000-0000-0000-0000-000000000a00', '19100000-0000-0000-0000-0000000000a1', '19100000-0000-0000-0000-0000000000a2', 'без срока', 'accepted', null),
         ('19100000-0000-0000-0000-000000000a00', '19100000-0000-0000-0000-0000000000a1', '19100000-0000-0000-0000-0000000000a2', 'завтра', 'accepted', interval '1 day 12 hours'),
         ('19100000-0000-0000-0000-000000000a00', '19100000-0000-0000-0000-0000000000a1', '19100000-0000-0000-0000-0000000000a2', 'на проверке', 'pending_review', interval '-2 days'),
         -- M1: returned for rework
         ('19100000-0000-0000-0000-000000000a00', '19100000-0000-0000-0000-0000000000a1', '19100000-0000-0000-0000-0000000000a7', 'доработка', 'rework', null),
         -- those who never hear: on leave, let go, a phone off, the director, the kiosk
         ('19100000-0000-0000-0000-000000000a00', '19100000-0000-0000-0000-0000000000a1', '19100000-0000-0000-0000-0000000000a4', 'в отпуске', 'sent', null),
         ('19100000-0000-0000-0000-000000000a00', '19100000-0000-0000-0000-0000000000a1', '19100000-0000-0000-0000-0000000000a5', 'уволен', 'sent', null),
         ('19100000-0000-0000-0000-000000000a00', '19100000-0000-0000-0000-0000000000a1', '19100000-0000-0000-0000-0000000000a6', 'без телефона', 'sent', null),
         ('19100000-0000-0000-0000-000000000a00', '19100000-0000-0000-0000-0000000000a1', '19100000-0000-0000-0000-0000000000a1', 'себе', 'sent', null),
         ('19100000-0000-0000-0000-000000000a00', '19100000-0000-0000-0000-0000000000a1', '19100000-0000-0000-0000-0000000000a9', 'стене', 'sent', null),
         -- EB: one new task of B, and a stray row of company A pointing at EB — never counted
         ('19100000-0000-0000-0000-000000000b00', '19100000-0000-0000-0000-0000000000b1', '19100000-0000-0000-0000-0000000000b2', 'новая B', 'sent', null),
         ('19100000-0000-0000-0000-000000000a00', '19100000-0000-0000-0000-0000000000a1', '19100000-0000-0000-0000-0000000000b2', 'чужая', 'sent', null),
         -- the company that switched it off, the company on a day off
         ('19100000-0000-0000-0000-000000000c00', '19100000-0000-0000-0000-0000000000c1', '19100000-0000-0000-0000-0000000000c2', 'выключено', 'sent', null),
         ('19100000-0000-0000-0000-000000000d00', '19100000-0000-0000-0000-0000000000d1', '19100000-0000-0000-0000-0000000000d2', 'выходной', 'sent', null)
       ) x(company_id, author_id, assignee_id, title, status, due);

-- meetings today: E1 goes at 15:00, declined 11:00, a cancelled one at 10:00, one tomorrow;
-- S1 goes at 11:30; the director is invited at 12:00
insert into events (id, company_id, author_id, title, starts_at, cancelled_at)
select x.id, '19100000-0000-0000-0000-000000000a00'::uuid, '19100000-0000-0000-0000-0000000000a1'::uuid, 'pgtap-191 ' || x.title,
       (today + x.at_time) at time zone 'Asia/Aqtobe', case when x.cancelled then now() end
  from d191,
       (values ('19100000-0000-0000-0000-0000000000e1'::uuid, 'планёрка', interval '15 hours', false),
               ('19100000-0000-0000-0000-0000000000e2'::uuid, 'отказался', interval '11 hours', false),
               ('19100000-0000-0000-0000-0000000000e3'::uuid, 'отменена', interval '10 hours', true),
               ('19100000-0000-0000-0000-0000000000e4'::uuid, 'завтра', interval '1 day 9 hours', false),
               ('19100000-0000-0000-0000-0000000000e5'::uuid, 'секретарь', interval '11 hours 30 minutes', false),
               ('19100000-0000-0000-0000-0000000000e6'::uuid, 'директор', interval '12 hours', false)) x(id, title, at_time, cancelled);
insert into event_participants (event_id, user_id, status) values
  ('19100000-0000-0000-0000-0000000000e1', '19100000-0000-0000-0000-0000000000a2', 'going'),
  ('19100000-0000-0000-0000-0000000000e2', '19100000-0000-0000-0000-0000000000a2', 'declined'),
  ('19100000-0000-0000-0000-0000000000e3', '19100000-0000-0000-0000-0000000000a2', 'going'),
  ('19100000-0000-0000-0000-0000000000e4', '19100000-0000-0000-0000-0000000000a2', 'invited'),
  ('19100000-0000-0000-0000-0000000000e5', '19100000-0000-0000-0000-0000000000a8', 'invited'),
  ('19100000-0000-0000-0000-0000000000e6', '19100000-0000-0000-0000-0000000000a1', 'going')
on conflict do nothing;

create temp view brief191 as
select d.*, p.full_name as who, p.company_id as person_company
  from notification_deliveries d
  join profiles p on p.id = d.user_id
 where d.event_kind = 'morning_brief' and p.full_name like 'pgtap-191 %';
grant select on brief191 to public;

-- ---------------------------------------------------------------------------
-- 1. Only the sweep calls it
-- ---------------------------------------------------------------------------
select results_eq(
  $$select has_function_privilege('anon', 'employee_morning_briefs_due(timestamptz)', 'execute'),
           has_function_privilege('authenticated', 'employee_morning_briefs_due(timestamptz)', 'execute'),
           has_function_privilege('service_role', 'employee_morning_briefs_due(timestamptz)', 'execute')$$,
  $$values (false, false, true)$$,
  'the tick is the service role''s alone'
);

-- ---------------------------------------------------------------------------
-- 2. Outside the window — nothing
-- ---------------------------------------------------------------------------
create temp table run_early as select employee_morning_briefs_due((select at - interval '1 hour' from d191)) as n;
select is((select count(*)::int from brief191), 0, 'before the window opens (07:30) nobody gets the brief');
create temp table run_late as select employee_morning_briefs_due((select at + interval '13 hours' from d191)) as n;
select is((select count(*)::int from brief191), 0, 'after the window closes (21:30) nobody gets the brief');

-- ---------------------------------------------------------------------------
-- 3. In the window — once, to whom it is due, with the right words
-- ---------------------------------------------------------------------------
create temp table run_first as select employee_morning_briefs_due((select at from d191)) as n;

select is(
  (select meta ->> 'body' from brief191 where who = 'pgtap-191 E1'),
  '3 дела на сегодня, 1 просрочено, 1 новое · встреча в 15:00',
  'E1: overdue first, then new; the one due today counted; held, closed, undated, tomorrow''s and on-review tasks are not; the declined and cancelled meetings are not'
);
select is((select meta ->> 'title' from brief191 where who = 'pgtap-191 E1'), 'Доброе утро', 'at 08:30 it greets the morning');
select results_eq(
  $$select meta ->> 'url', meta ->> 'tag', meta ->> 'date', task_id is null, status::text, deliver_after = (select at from d191), category
      from brief191 where who = 'pgtap-191 E1'$$,
  $$select '/feed', 'morning:' || to_char(today, 'YYYY-MM-DD'), to_char(today, 'YYYY-MM-DD'), true, 'queued', true, 'tasks' from d191$$,
  'the row goes through the queue now, opens Лента, one bubble a day, no task — no task receipts show it'
);
select is((select meta ->> 'body' from brief191 where who = 'pgtap-191 M1'), 'Задача на доработке', 'a manager hears of the task returned to him');
select is((select meta ->> 'body' from brief191 where who = 'pgtap-191 S1'), 'Встреча в 11:30', 'a secretary with only a meeting hears of the meeting');
select is((select meta ->> 'body' from brief191 where who = 'pgtap-191 EB'), 'Новая задача',
          'company B: only B''s task is counted — a stray row of company A is not (принцип 6)');

select is((select count(*)::int from brief191 where who = 'pgtap-191 E2'), 0, 'an empty day — no push');
select is((select count(*)::int from brief191 where who = 'pgtap-191 E3'), 0, 'on leave — no push');
select is((select count(*)::int from brief191 where who = 'pgtap-191 E4'), 0, 'let go — no push');
select is((select count(*)::int from brief191 where who = 'pgtap-191 E5'), 0, 'no switched-on phone — no row to fail');
select is((select count(*)::int from brief191 where who like 'pgtap-191 Директор%'), 0, 'never the director');
select is((select count(*)::int from brief191 where who = 'pgtap-191 TV'), 0, 'never the kiosk');
select is((select count(*)::int from brief191 where who = 'pgtap-191 EC'), 0, 'a company with the brief switched off — no push');
select is((select count(*)::int from brief191 where who = 'pgtap-191 EW'), 0, 'not on the company''s day off');
select is((select count(*)::int from brief191 where company_id <> person_company), 0, 'every row stays in its person''s company');

-- ---------------------------------------------------------------------------
-- 4. Never twice a day
-- ---------------------------------------------------------------------------
select is(employee_morning_briefs_due((select at + interval '1 minute' from d191)), 0, 'a second sweep the same day queues nothing');
select is((select count(*)::int from brief191), 4, 'E1, M1, S1 and EB — one row each');
select throws_ok(
  $$insert into notification_deliveries (company_id, user_id, event_kind, meta)
    select '19100000-0000-0000-0000-000000000a00', '19100000-0000-0000-0000-0000000000a2', 'morning_brief',
           jsonb_build_object('title', 'x', 'body', 'x', 'date', to_char(today, 'YYYY-MM-DD')) from d191$$,
  '23505', null::text,
  'the unique key refuses a twin even past the check — two sweeps in one second cannot both write'
);

-- ---------------------------------------------------------------------------
-- 5. The words
-- ---------------------------------------------------------------------------
select is(morning_brief_body(0, 0, 0, 0, null, 0, null), null, 'nothing — no words');
select is(morning_brief_body(1, 0, 0, 0, null, 0, null), 'Просроченная задача', 'one overdue');
select is(morning_brief_body(0, 0, 2, 0, null, 0, null), '2 новые задачи', 'two new');
select is(morning_brief_body(5, 0, 0, 0, null, 0, null), '5 просроченных задач', 'five overdue');
select is(morning_brief_body(0, 3, 0, 0, null, 0, null), '3 задачи на доработке', 'three returned');
select is(
  morning_brief_body(0, 0, 0, 1, (select (today + time '18:00') at time zone 'Asia/Aqtobe' from d191), 0, null),
  'Задача на сегодня, срок в 18:00', 'one due today, with its time'
);
select is(morning_brief_body(1, 0, 1, 0, null, 0, null), '2 дела на сегодня, 1 просрочено, 1 новое', 'a mix: overdue before new');
select is(
  morning_brief_body(2, 1, 0, 2, null, 2, (select (today + time '11:30') at time zone 'Asia/Aqtobe' from d191)),
  '5 дел на сегодня, 2 просрочено, 1 на доработке · 2 встречи, первая в 11:30', 'a mix and two meetings'
);
select is(
  morning_brief_body(0, 0, 0, 0, null, 1, (select (today + time '15:00') at time zone 'Asia/Aqtobe' from d191)),
  'Встреча в 15:00', 'a meeting alone starts with a capital'
);

select * from finish();
rollback;
