-- D-148: a repeating order makes its tasks. confirm_voice_batch writes the rule as fields, the
-- trigger finds its first day, recurrence_spawn makes one task per day (never two), a missed day is
-- not made late, a pause clears the wait, a person who left stops the rule; a meeting with
-- `repeat` starts a series whose next meeting invites nobody; another company sees nothing.
-- Fixtures — supabase/seed.sql: director …0001, Айгуль …0008, Марат …0007.
begin;
select plan(25);

update profiles set role = 'employee', is_active = true
 where id in ('10000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000008');
update companies set settings = coalesce(settings, '{}') || '{"delivery_window": {"from": "08:00", "to": "21:00"}}'::jsonb
 where id = '11111111-1111-1111-1111-111111111111';
-- the rules dev already has would answer the same ticks
update recurrence_rules set is_active = false where is_active;

-- another company, to prove a rule never reaches across
insert into companies (id, name) values ('99999999-9999-9999-9999-999999999999', 'Чужая компания');
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values ('00000000-0000-0000-0000-000000000000', '99999999-0000-0000-0000-000000000001',
        'authenticated', 'authenticated', 'foreign-148@demo.local', now(), now(), '', '', '', '', '', '', '', '');
insert into profiles (id, company_id, full_name, role) values
  ('99999999-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999', 'Чужой Директор', 'director');

-- the days the test expects, counted the plain way
create temp table d148 as
select (select d::date from generate_series((now() at time zone 'Asia/Aqtobe')::date,
                                            (now() at time zone 'Asia/Aqtobe')::date + 7, interval '1 day') d
         where extract(isodow from d) = 1
           and ((d::date + time '08:00') at time zone 'Asia/Aqtobe') > now()
         order by d limit 1) as monday,
       (select d::date from generate_series((now() at time zone 'Asia/Aqtobe')::date + 1,
                                            (now() at time zone 'Asia/Aqtobe')::date + 7, interval '1 day') d
         where extract(isodow from d) = 3
         order by d limit 1) as wednesday;
grant select on d148 to public;

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- 1. the director says «каждый понедельник Айгуль отчёт по ПЗТМ»
select is(
  jsonb_array_length((select confirm_voice_batch(
    '{"source":"voice","transcript":"Каждый понедельник Айгуль отчёт по ПЗТМ","audio_path":"pgtap/148.webm","confirmed_entities":[
       {"kind":"recurrence","assignee_id":"10000000-0000-0000-0000-000000000008","title":"pgtap-148 Отчёт по ПЗТМ",
        "every":"week","interval":1,"weekdays":[1],"month_day":0,"due_time":"18:00"}]}'::jsonb,
    '14800000-0000-0000-0000-000000000001'::uuid)->'recurrence_ids')),
  1,
  'confirm writes the rule'
);

select results_eq(
  $$select every, interval_n, weekdays, at_time, target, source_audio_path from recurrence_rules where title = 'pgtap-148 Отчёт по ПЗТМ'$$,
  $$values ('week'::text, 1, '{1}'::int[], time '18:00', 'task'::text, 'pgtap/148.webm'::text)$$,
  'as fields, with the phrase that set it'
);

select is(
  (select next_on from recurrence_rules where title = 'pgtap-148 Отчёт по ПЗТМ'),
  (select monday from d148),
  'its first day is the nearest Monday whose task is still to be made'
);

select is(
  (select next_run_at from recurrence_rules where title = 'pgtap-148 Отчёт по ПЗТМ'),
  (select (monday + time '08:00') at time zone 'Asia/Aqtobe' from d148),
  'made as that day''s delivery window opens'
);

-- 2. the tick
set local role postgres;
set local request.jwt.claims = '{"role":"service_role"}';

select is(
  recurrence_spawn((select (monday + time '07:59') at time zone 'Asia/Aqtobe' from d148)),
  0,
  'before its moment the tick makes nothing'
);

select is(
  recurrence_spawn((select (monday + time '08:01') at time zone 'Asia/Aqtobe' from d148)),
  1,
  'at its moment — one task'
);

select results_eq(
  $$select t.assignee_id, t.status::text, t.deadline, t.recurrence_on, t.source_audio_path
      from tasks t join recurrence_rules r on r.id = t.recurrence_rule_id
     where r.title = 'pgtap-148 Отчёт по ПЗТМ'$$,
  $$select '10000000-0000-0000-0000-000000000008'::uuid, 'sent'::text,
           (monday + time '18:00') at time zone 'Asia/Aqtobe', monday, 'pgtap/148.webm'::text from d148$$,
  'an ordinary task: to Айгуль, sent, due Monday 18:00, with the original voice'
);

select is(
  (select array[last_on, next_on] from recurrence_rules where title = 'pgtap-148 Отчёт по ПЗТМ'),
  (select array[monday, monday + 7] from d148),
  'the rule steps to the next Monday'
);

select is(
  (select count(*)::int from notification_deliveries nd
     join tasks t on t.id = nd.task_id
     join recurrence_rules r on r.id = t.recurrence_rule_id
    where r.title = 'pgtap-148 Отчёт по ПЗТМ' and nd.user_id = '10000000-0000-0000-0000-000000000008'),
  1,
  'Айгуль gets her push like for any task'
);

-- the same day again (a tick replayed, a clock moved back): still one task
update recurrence_rules set next_on = (select monday from d148), next_run_at = now() - interval '1 minute'
 where title = 'pgtap-148 Отчёт по ПЗТМ';
select is(
  recurrence_spawn((select (monday + time '08:02') at time zone 'Asia/Aqtobe' from d148)),
  0,
  'a day already made is not made twice'
);
select is(
  (select count(*)::int from tasks t join recurrence_rules r on r.id = t.recurrence_rule_id
    where r.title = 'pgtap-148 Отчёт по ПЗТМ'),
  1,
  'one task for the day'
);

-- a day a sleeping tick missed is skipped, not made late
update recurrence_rules set next_on = (select monday + 7 from d148)
 where title = 'pgtap-148 Отчёт по ПЗТМ';
select is(
  recurrence_spawn((select (monday + 7 + time '19:00') at time zone 'Asia/Aqtobe' from d148)),
  0,
  'a missed day makes nothing after its deadline'
);
select is(
  (select next_on from recurrence_rules where title = 'pgtap-148 Отчёт по ПЗТМ'),
  (select monday + 14 from d148),
  'and the rule goes on to the next one'
);

-- 3. the director's hands
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

update recurrence_rules set is_active = false where title = 'pgtap-148 Отчёт по ПЗТМ';
select is(
  (select row(next_on, next_run_at)::text from recurrence_rules where title = 'pgtap-148 Отчёт по ПЗТМ'),
  '(,)',
  'a pause clears the wait'
);

update recurrence_rules set is_active = true, weekdays = '{3}' where title = 'pgtap-148 Отчёт по ПЗТМ';
select is(
  (select extract(isodow from next_on)::int from recurrence_rules where title = 'pgtap-148 Отчёт по ПЗТМ'),
  3,
  'a resume with a new day recomputes from now'
);

select throws_ok(
  $$update recurrence_rules set author_id = '10000000-0000-0000-0000-000000000007' where title = 'pgtap-148 Отчёт по ПЗТМ'$$,
  'P0001', 'forbidden_field_update',
  'whose rule it is does not change'
);

select throws_ok(
  $$update recurrence_rules set assignee_id = '99999999-0000-0000-0000-000000000001' where title = 'pgtap-148 Отчёт по ПЗТМ'$$,
  'P0001', 'assignee_required',
  'a person of another company is never the assignee'
);

-- an employee reads the rule of her task but cannot touch it
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated"}';
select is(
  (select count(*)::int from recurrence_rules where title = 'pgtap-148 Отчёт по ПЗТМ'),
  1,
  'the employee sees the rule (the line on her task)'
);
update recurrence_rules set title = 'взлом' where title = 'pgtap-148 Отчёт по ПЗТМ';
select is(
  (select count(*)::int from recurrence_rules where title = 'взлом'),
  0,
  'and cannot change it'
);

-- another company sees nothing
set local request.jwt.claims = '{"sub":"99999999-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (select count(*)::int from recurrence_rules where title like 'pgtap-148%'),
  0,
  'company B does not see company A''s rules'
);

-- 4. a person who left stops the rule
set local role postgres;
set local request.jwt.claims = '{"role":"service_role"}';
update profiles set is_active = false where id = '10000000-0000-0000-0000-000000000008';
update recurrence_rules set next_run_at = now() - interval '1 minute' where title = 'pgtap-148 Отчёт по ПЗТМ';
select recurrence_spawn(now());
select is(
  (select row(is_active, stopped_reason)::text from recurrence_rules where title = 'pgtap-148 Отчёт по ПЗТМ'),
  '(f,assignee_inactive)',
  'the assignee left — the rule stops and says why'
);
update profiles set is_active = true where id = '10000000-0000-0000-0000-000000000008';

-- 5. a meeting series: «каждую среду в десять планёрка, Марат»
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select confirm_voice_batch(
  jsonb_build_object('source', 'voice', 'transcript', 'Каждую среду в десять планёрка с Маратом',
    'confirmed_entities', jsonb_build_array(jsonb_build_object(
      'kind', 'event', 'title', 'pgtap-148 Планёрка', 'body', null, 'location', 'в офисе',
      'starts_at_iso', to_char((select wednesday from d148), 'YYYY-MM-DD') || 'T10:00:00+05:00',
      'ends_at_iso', to_char((select wednesday from d148), 'YYYY-MM-DD') || 'T10:30:00+05:00',
      'participant_ids', jsonb_build_array('10000000-0000-0000-0000-000000000007'),
      'everyone', false, 'remind_before_min', 15, 'repeat', 'week'))),
  '14800000-0000-0000-0000-000000000002'::uuid);

set local role postgres;
set local request.jwt.claims = '{"role":"service_role"}';
select results_eq(
  $$select r.target, r.weekdays, r.at_time, r.duration_min, r.next_on, r.next_run_at
      from recurrence_rules r where r.title = 'pgtap-148 Планёрка'$$,
  $$select 'event'::text, '{3}'::int[], time '10:00', 30, wednesday + 7, (wednesday + time '10:00') at time zone 'Asia/Aqtobe' from d148$$,
  'the meeting starts a weekly series; the next is made as this one begins'
);

select is(
  recurrence_spawn((select (wednesday + time '10:01') at time zone 'Asia/Aqtobe' from d148)),
  1,
  'as the first meeting begins, the next one is made'
);

select results_eq(
  $$select e.starts_at, e.ends_at, e.location, e.remind_before_min,
           (select count(*)::int from event_participants p where p.event_id = e.id)
      from events e join recurrence_rules r on r.id = e.recurrence_rule_id
     where r.title = 'pgtap-148 Планёрка' and e.recurrence_on = (select wednesday + 7 from d148)$$,
  $$select (wednesday + 7 + time '10:00') at time zone 'Asia/Aqtobe', (wednesday + 7 + time '10:30') at time zone 'Asia/Aqtobe',
           'в офисе'::text, 15, 2 from d148$$,
  'next Wednesday, same time and place, the same people'
);

select is(
  (select count(*)::int from notification_deliveries nd
    where nd.event_kind = 'event_invite' and nd.user_id = '10000000-0000-0000-0000-000000000007'
      and nd.meta->>'url' in (select '/calendar?e=' || e.id from events e where e.title = 'pgtap-148 Планёрка')),
  1,
  'Марат was invited once — to the first meeting, not to every one'
);

select * from finish();
rollback;
