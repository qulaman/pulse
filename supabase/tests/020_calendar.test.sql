-- Календарь и мероприятия (наряд 014A, D-78): голос директора создаёт встречу с составом,
-- участник видит только свою, отвечает за себя, а минутный тик напоминает ровно один раз.
-- Фикстуры — supabase/seed.sql: директор …0001, Динара (менеджер) …0002, киоск …0004,
-- Ерлан Б. …0005, Марат …0007, Айгуль …0008.
begin;
select plan(43);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- 1. «Собери планёрку завтра в десять»: одна строка, трое участников, два приглашения
-- ---------------------------------------------------------------------------
create temp table run as
select confirm_voice_batch(
  payload := ('{
    "source": "voice",
    "transcript": "завтра в десять планёрка в офисе, Марат и Айгуль",
    "confirmed_entities": [
      {"kind":"event","title":"Планёрка",
       "starts_at_iso":"' || to_char((current_date + 1)::timestamp + time '10:00',
                                     'YYYY-MM-DD"T"HH24:MI:SS') || '+05:00",
       "ends_at_iso":null,"body":null,"location":"в офисе",
       "remind_before_min":30,"everyone":false,
       "participant_ids":["10000000-0000-0000-0000-000000000007",
                          "10000000-0000-0000-0000-000000000008"],
       "source_span":"завтра в десять планёрка в офисе"}
    ]
  }')::jsonb,
  client_request_id := '4e000000-0000-0000-0000-000000000001'::uuid,
  p_now := now()
) as r;

select is(jsonb_array_length((select r->'event_ids' from run)), 1,
          'one event came back from the batch');
select is((select count(*) from events), 1::bigint, 'and one event lies in the table');
select is((select count(*) from event_participants), 3::bigint, 'three people are in it');
select is(
  (select status from event_participants
    where event_id = (select (r->'event_ids'->>0)::uuid from run)
      and user_id = '10000000-0000-0000-0000-000000000001'),
  'going',
  'the author is a participant, and is going'
);
select is(
  (select count(*) from event_participants
    where event_id = (select (r->'event_ids'->>0)::uuid from run) and status = 'invited'),
  2::bigint,
  'the other two are invited'
);
select is(
  (select count(*) from notification_deliveries where event_kind = 'event_invite'),
  2::bigint,
  'two invitations went to the outbox — the author invites nobody to his own meeting'
);
select is(
  (select count(*) from notification_deliveries
    where event_kind = 'event_invite' and user_id = '10000000-0000-0000-0000-000000000001'),
  0::bigint,
  'and none of them is addressed to the author'
);

-- ---------------------------------------------------------------------------
-- 2. Тот же client_request_id ничего не создаёт
-- ---------------------------------------------------------------------------
create temp table again as
select confirm_voice_batch(
  payload := '{"source":"voice","transcript":"повтор","confirmed_entities":[
      {"kind":"event","title":"Дубль","starts_at_iso":"2026-12-01T10:00:00+05:00",
       "participant_ids":[]}]}'::jsonb,
  client_request_id := '4e000000-0000-0000-0000-000000000001'::uuid,
  p_now := now()
) as r;

select is((select r->>'duplicate' from again), 'true', 'the replay is flagged as a duplicate');
select is((select count(*) from events), 1::bigint, 'and it created no second event');

-- ---------------------------------------------------------------------------
-- 3. Встреча без времени — не встреча
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select confirm_voice_batch(
       payload := '{"source":"voice","transcript":"надо бы собраться","confirmed_entities":[
           {"kind":"event","title":"Собраться","starts_at_iso":null,"participant_ids":[]}]}'::jsonb,
       client_request_id := '4e000000-0000-0000-0000-000000000002'::uuid,
       p_now := now()) $$,
  'P0001', 'event_time_required', 'an event without a time is refused'
);

-- ---------------------------------------------------------------------------
-- 4. Видимость: участник — да, посторонний, менеджер и киоск — нет
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select is((select count(*) from events), 1::bigint, 'Марат sees the meeting he is invited to');
select is((select count(*) from event_participants), 3::bigint, 'and the whole guest list of it');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';
select is((select count(*) from events), 0::bigint, 'an employee outside the list sees nothing');
select is((select count(*) from event_participants), 0::bigint, 'and no participants either');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*) from events), 0::bigint, 'the manager was not invited and does not see it');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is((select count(*) from events), 0::bigint, 'the kiosk reads no events at all');
select is((select count(*) from event_participants), 0::bigint, 'and no participants at all');

-- ---------------------------------------------------------------------------
-- 5. Ответ участника: «Не смогу» с причиной, потом «Буду»; чужой ответ не принимается
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select is(
  (select (respond_event((select (r->'event_ids'->>0)::uuid from run), 'declined', 'Занят срочным')).status),
  'declined',
  'Марат cannot come'
);
select is(
  (select reason from event_participants
    where event_id = (select (r->'event_ids'->>0)::uuid from run)
      and user_id = '10000000-0000-0000-0000-000000000007'),
  'Занят срочным',
  'and the reason is stored with the answer'
);
select is(
  (select count(*) from notification_deliveries
    where event_kind = 'event_declined' and user_id = '10000000-0000-0000-0000-000000000001'),
  1::bigint,
  'the author hears about it at once'
);
select is(
  (select (respond_event((select (r->'event_ids'->>0)::uuid from run), 'going')).status),
  'going',
  'he changes his mind'
);
select is(
  (select reason from event_participants
    where event_id = (select (r->'event_ids'->>0)::uuid from run)
      and user_id = '10000000-0000-0000-0000-000000000007'),
  null,
  'and the old reason is gone'
);
select throws_ok(
  format($$ select respond_event(%L::uuid, 'maybe') $$, (select (r->'event_ids'->>0)::uuid from run)),
  'P0001', 'bad_status', 'there is no third answer'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';
select throws_ok(
  format($$ select respond_event(%L::uuid, 'going') $$, (select (r->'event_ids'->>0)::uuid from run)),
  'P0001', 'forbidden', 'a stranger does not answer for a meeting he was not called to'
);

-- ---------------------------------------------------------------------------
-- 6. Состав правит только директор
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$ select set_event_participants(%L::uuid, array['10000000-0000-0000-0000-000000000005']::uuid[]) $$,
         (select (r->'event_ids'->>0)::uuid from run)),
  'P0001', 'forbidden', 'an employee does not rewrite the guest list'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  format($$ select set_event_participants(%L::uuid,
                    array['10000000-0000-0000-0000-000000000005']::uuid[],
                    array['10000000-0000-0000-0000-000000000008']::uuid[]) $$,
         (select (r->'event_ids'->>0)::uuid from run)),
  'the director swaps one person for another'
);
select is((select count(*) from event_participants), 3::bigint, 'the list is three people long again');
select is(
  (select count(*) from notification_deliveries
    where event_kind = 'event_invite' and user_id = '10000000-0000-0000-0000-000000000005'),
  1::bigint,
  'and the newcomer got his invitation'
);

-- ---------------------------------------------------------------------------
-- 7. Перенос: отметка напоминания гаснет, участники узнают, сотрудник не переносит
-- ---------------------------------------------------------------------------
select is(
  (with moved as (
     update events set starts_at = starts_at + interval '1 hour' returning 1)
   select count(*) from moved),
  1::bigint,
  'the director moves the meeting by an hour'
);
select is(
  (select count(*) from notification_deliveries where event_kind = 'event_moved'),
  2::bigint,
  'everybody but the author is told'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select is(
  (with moved as (
     update events set starts_at = starts_at + interval '1 hour' returning 1)
   select count(*) from moved),
  0::bigint,
  'a participant moves nothing'
);

-- ---------------------------------------------------------------------------
-- 8. Тик напоминаний: одна встреча, по строке каждому идущему, одна строка стене
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select events_due_reminders(now()) $$,
  '42501', null, 'an employee cannot run the tick'
);

set local role postgres;
select is(
  (select events_due_reminders((select starts_at - interval '20 minutes' from events))),
  1,
  'the tick picks the meeting up'
);
select ok((select reminded_at is not null from events), 'and marks it reminded');
select is(
  (select count(*) from notification_deliveries where event_kind = 'event_reminder'),
  3::bigint,
  'every participant who is coming gets a reminder, the author included'
);
select is(
  (select count(*) from tv_events where kind = 'event' and payload->>'title' = 'Планёрка'
     and payload_guest->>'title' is null),
  1::bigint,
  'the wall learns about it, and the guest sees no title (D-33)'
);
select is(
  (select events_due_reminders((select starts_at - interval '20 minutes' from events))),
  0,
  'and the second tick of the same minute sends nothing'
);

-- ---------------------------------------------------------------------------
-- 9. Стена: сводка отдаёт встречу, гостю — без названия
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is(
  (select tv_summary(false)->'events'->0->>'title'), 'Планёрка',
  'the kiosk sees the meeting in the summary'
);
select is(
  (select tv_summary(false)->'events'->0->>'people'), '3',
  'with the number of people who are coming'
);
select is(
  (select tv_summary(true)->'events'->0->>'title'), null,
  'and a visitor sees no title at all'
);

-- ---------------------------------------------------------------------------
-- 10. Отмена: всех предупредили, из сводки встреча ушла
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok($$ update events set cancelled_at = now() $$, 'the director calls it off');
select is(
  (select count(*) from notification_deliveries where event_kind = 'event_cancelled'),
  2::bigint,
  'everybody but the author is told about that too'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is(
  (select jsonb_array_length(tv_summary(false)->'events')), 0,
  'and the wall has nothing ahead any more'
);

set local role postgres;
select * from finish();
rollback;
