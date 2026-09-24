-- The director tunes his own pushes, nobody else has a switch (D-114): the routing trigger
-- mutes, quiets, folds into a digest, holds for «Не беспокоить»; important people come at
-- once; the alarm is never touched; an employee's row keeps the fixed policy; saving the
-- rules re-routes what still waits; push_health is for the people who run the team.
-- Fixtures — supabase/seed.sql: director …0001, Марат …0007 (employee), Тимур …0003 (shopkeeper).
begin;
select plan(25);

-- a task of the director's for Марат, and a second one for Ерлан Б. (…0005)
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
-- dev keeps Марат as a secretary; here he is the employee of the seed
update profiles set role = 'employee' where id = '10000000-0000-0000-0000-000000000007';
update companies set settings = jsonb_set(coalesce(settings, '{}'), '{delivery_window}', '{"from":"00:00","to":"23:59"}')
 where id = '11111111-1111-1111-1111-111111111111';
insert into tasks (id, company_id, author_id, assignee_id, title, status) values
  ('93000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007', 'Отчёт по складу', 'sent'),
  ('93000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005', 'Договор с поставщиком', 'sent');

-- ---------------------------------------------------------------------------
-- 1. Nobody but a director has rules
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select throws_ok(
  $$ select set_notify_prefs('{"modes":{"messages":"off"}}'::jsonb) $$,
  'P0001', 'forbidden', 'an employee cannot save push rules'
);
select throws_ok(
  $$ insert into notification_prefs (user_id, company_id, prefs)
     values ('10000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', '{}') $$,
  '42501', null, 'an employee cannot write a rules row either'
);

-- ---------------------------------------------------------------------------
-- 2. Defaults are today's behaviour: the director's news goes at once
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
insert into task_messages (company_id, task_id, sender_id, type, content)
values ('11111111-1111-1111-1111-111111111111', '93000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000007', 'text', 'Отчёт почти готов');
select is(
  (select mode || '/' || category || '/' || status::text from notification_deliveries
    where task_id = '93000000-0000-0000-0000-000000000001' and event_kind = 'message'
      and user_id = '10000000-0000-0000-0000-000000000001'),
  'now/messages/queued',
  'without rules a message to the director goes at once'
);
select is(
  (select category from notification_deliveries
    where task_id = '93000000-0000-0000-0000-000000000001' and event_kind = 'task_sent'),
  'tasks',
  'an employee''s row gets a category too'
);

-- ---------------------------------------------------------------------------
-- 3. «Не присылать», «Тихо», «Сводкой», text on the lock screen
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select set_notify_prefs('{"modes":{"review":"off","declined":"quiet","messages":"digest"},"lock_text":"short"}'::jsonb) $$,
  'the director saves his rules'
);
select is(
  (select prefs -> 'modes' ->> 'review' from notification_prefs where user_id = '10000000-0000-0000-0000-000000000001'),
  'off',
  'and reads them back'
);
select is(
  (select mode || '/' || held from notification_deliveries
    where task_id = '93000000-0000-0000-0000-000000000001' and event_kind = 'message'
      and user_id = '10000000-0000-0000-0000-000000000001'),
  'digest/schedule',
  'saving re-routes what waits: the message joins the digest'
);
select ok(
  (select deliver_after > now() from notification_deliveries
    where task_id = '93000000-0000-0000-0000-000000000001' and event_kind = 'message'
      and user_id = '10000000-0000-0000-0000-000000000001'),
  'a digest row waits for its slot'
);

reset role;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';
update tasks set status = 'accepted' where id = '93000000-0000-0000-0000-000000000002';
update tasks set status = 'pending_review' where id = '93000000-0000-0000-0000-000000000002';
select is(
  (select status::text || '/' || last_error from notification_deliveries
    where task_id = '93000000-0000-0000-0000-000000000002' and event_kind = 'pending_review'),
  'failed/muted',
  '«Не присылать» never sends: the row is kept as muted'
);
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
update tasks set status = 'declined' where id = '93000000-0000-0000-0000-000000000001';
select is(
  (select silent::text || '/' || private::text || '/' || mode from notification_deliveries
    where task_id = '93000000-0000-0000-0000-000000000001' and event_kind = 'declined'),
  'true/true/now',
  '«Тихо» goes now without sound, «только что случилось» hides the words'
);

-- ---------------------------------------------------------------------------
-- 4. Important people come at once, over «Сводкой»
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select set_notify_prefs('{"modes":{"messages":"digest"},"vip":["10000000-0000-0000-0000-000000000005"]}'::jsonb);
reset role;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';
insert into task_messages (company_id, task_id, sender_id, type, content)
values ('11111111-1111-1111-1111-111111111111', '93000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000005', 'text', 'Договор подписан');
select is(
  (select mode from notification_deliveries
    where task_id = '93000000-0000-0000-0000-000000000002' and event_kind = 'message'
      and user_id = '10000000-0000-0000-0000-000000000001'),
  'now',
  'an important person''s message goes at once despite «Сводкой»'
);
select is(
  (select mode from notification_deliveries
    where task_id = '93000000-0000-0000-0000-000000000001' and event_kind = 'message'
      and user_id = '10000000-0000-0000-0000-000000000001'),
  'digest',
  'everybody else''s still waits for the digest'
);

-- ---------------------------------------------------------------------------
-- 5. «Не беспокоить»: held till the end; the director's own reminder passes
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select set_notify_prefs(jsonb_build_object('quiet', jsonb_build_object(
  'on', true,
  'from', to_char((now() - interval '1 hour') at time zone 'Asia/Aqtobe', 'HH24:MI'),
  'to', to_char((now() + interval '1 hour') at time zone 'Asia/Aqtobe', 'HH24:MI'))));
select is(
  (select held from notification_deliveries
    where task_id = '93000000-0000-0000-0000-000000000001' and event_kind = 'message'
      and user_id = '10000000-0000-0000-0000-000000000001'),
  'quiet',
  'the waiting message is now held by the quiet hours'
);
select ok(
  (select deliver_after between now() + interval '50 minutes' and now() + interval '61 minutes'
     from notification_deliveries
    where task_id = '93000000-0000-0000-0000-000000000001' and event_kind = 'message'
      and user_id = '10000000-0000-0000-0000-000000000001'),
  'until the quiet hours end'
);
reset role;
insert into notification_deliveries (company_id, user_id, event_kind, meta)
values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001', 'note_reminder',
        '{"title":"Напоминание","body":"Позвонить в банк","url":"/notes"}');
select is(
  (select mode || '/' || coalesce(held, '-') from notification_deliveries
    where user_id = '10000000-0000-0000-0000-000000000001' and event_kind = 'note_reminder'
      and meta ->> 'body' = 'Позвонить в банк'),
  'now/-',
  'his own «напомни мне» passes the quiet hours'
);
insert into notification_deliveries (company_id, user_id, event_kind, meta)
values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001', 'errand_accepted',
        '{"title":"Принято · Айгуль","body":"Охрана","urgent":true}');
select is(
  (select category || '/' || mode from notification_deliveries
    where user_id = '10000000-0000-0000-0000-000000000001' and event_kind = 'errand_accepted'
      and meta ->> 'body' = 'Охрана'),
  'alarm/now',
  'the alarm is never held'
);

-- ---------------------------------------------------------------------------
-- 6. The employees' fixed policy: no rules apply, the shopkeeper's order waits for the window
-- ---------------------------------------------------------------------------
update companies set settings = jsonb_set(settings, '{delivery_window}', '{"from":"00:00","to":"00:01"}')
 where id = '11111111-1111-1111-1111-111111111111';
insert into notification_deliveries (company_id, user_id, event_kind, meta)
values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000003', 'shop_order',
        '{"title":"Заказ в магазине","body":"Термокружка","url":"/shop"}'),
       ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001', 'shop_order',
        '{"title":"Заказ в магазине","body":"Термокружка","url":"/shop"}');
select ok(
  (select deliver_after > now() from notification_deliveries
    where user_id = '10000000-0000-0000-0000-000000000003' and event_kind = 'shop_order'
      and meta ->> 'body' = 'Термокружка'),
  'a night order waits for the window at the shopkeeper'
);
select is(
  (select held from notification_deliveries
    where user_id = '10000000-0000-0000-0000-000000000001' and event_kind = 'shop_order'
      and meta ->> 'body' = 'Термокружка'),
  'quiet',
  'and at the director it follows his own quiet hours'
);
select is(
  (select mode || '/' || silent::text from notification_deliveries
    where task_id = '93000000-0000-0000-0000-000000000001' and event_kind = 'task_sent'),
  'now/false',
  'the director''s rules never touch an employee''s row'
);

-- ---------------------------------------------------------------------------
-- 7. Meetings: only the urgent comes while the director is in one
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select set_notify_prefs('{"meetings":true}'::jsonb);
reset role;
insert into events (id, company_id, author_id, title, starts_at, ends_at)
values ('93000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
        '10000000-0000-0000-0000-000000000001', 'Совет директоров',
        now() - interval '10 minutes', now() + interval '50 minutes');
insert into event_participants (event_id, user_id, status)
values ('93000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'going')
on conflict do nothing;
insert into notification_deliveries (company_id, user_id, event_kind, meta)
values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001', 'errand_question',
        '{"title":"Айгуль спрашивает","body":"Кофе: с сахаром?"}'),
       ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001', 'visit_arrived',
        '{"title":"К вам посетитель","body":"Из банка"}');
select is(
  (select held from notification_deliveries
    where user_id = '10000000-0000-0000-0000-000000000001' and event_kind = 'errand_question'
      and meta ->> 'body' = 'Кофе: с сахаром?'),
  'meeting',
  'a question from the desk waits for the end of the meeting'
);
select is(
  (select mode from notification_deliveries
    where user_id = '10000000-0000-0000-0000-000000000001' and event_kind = 'visit_arrived'
      and meta ->> 'body' = 'Из банка'),
  'now',
  'a visitor is told at once'
);

-- ---------------------------------------------------------------------------
-- 8. A broken rule never breaks the producer; push_health is for the team's managers
-- ---------------------------------------------------------------------------
update notification_prefs set prefs = '{"modes":"garbage","quiet":{"on":true,"from":"99:99"},"vip":{"x":1}}'
 where user_id = '10000000-0000-0000-0000-000000000001';
select lives_ok(
  $$ insert into notification_deliveries (company_id, user_id, event_kind, meta)
     values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001', 'event_declined',
             '{"title":"Не сможет","body":"Марат · Планёрка"}') $$,
  'garbage rules do not break an insert'
);

insert into push_subscriptions (company_id, user_id, endpoint, p256dh, auth, label, last_ok_at)
values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000007',
        'https://push.example/93-marat', 'k', 'a', 'Android · Chrome', now());
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (select devices from push_health() where user_id = '10000000-0000-0000-0000-000000000007'),
  (select count(*)::int from push_subscriptions where user_id = '10000000-0000-0000-0000-000000000007'),
  'the director sees Марат''s devices'
);
select ok(
  (select count(*) from push_health()) > 1,
  'the director sees the whole team'
);
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select is(
  (select count(*) from push_health()),
  0::bigint,
  'an employee sees nobody''s channel'
);

select * from finish();
rollback;
