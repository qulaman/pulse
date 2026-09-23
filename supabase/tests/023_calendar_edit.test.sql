-- Правка и удаление мероприятия (D-94): форма «Изменить» — одна команда edit_event,
-- «Удалить» — delete_event. Кто уже знал о встрече, узнаёт о переносе, новом месте и
-- отмене; кто не узнал (приглашение ещё ждало окна) — не получает ничего.
-- Фикстуры — supabase/seed.sql: директор …0001, Ерлан Б. …0005, Марат …0007, Айгуль …0008.
-- Outbox читается только в пределах этой транзакции (`created_at = now()`): тест не
-- зависит от того, что уже лежит в базе.
begin;
select plan(29);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

create temp table run as
select (confirm_voice_batch(
  payload := ('{
    "source": "typed",
    "transcript": "Планёрка",
    "confirmed_entities": [
      {"kind":"event","title":"Планёрка",
       "starts_at_iso":"' || to_char((current_date + 2)::timestamp + time '10:00',
                                     'YYYY-MM-DD"T"HH24:MI:SS') || '+05:00",
       "ends_at_iso":null,"body":null,"location":"Офис",
       "remind_before_min":30,"everyone":false,
       "participant_ids":["10000000-0000-0000-0000-000000000007",
                          "10000000-0000-0000-0000-000000000008"],
       "source_span":"Планёрка"}
    ]
  }')::jsonb,
  client_request_id := '4e000000-0000-0000-0000-000000000101'::uuid,
  p_now := now()
)->'event_ids'->>0)::uuid as id;

select is(
  (select count(*) from notification_deliveries where created_at = now() and event_kind = 'event_invite'),
  2::bigint,
  'two invitations wait in the outbox'
);

-- Марат уже получил приглашение; Айгуль — ещё нет (её строка ждёт окна)
set local role postgres;
update notification_deliveries set status = 'sent', sent_at = now()
 where created_at = now() and event_kind = 'event_invite' and user_id = '10000000-0000-0000-0000-000000000007';
set local role authenticated;

-- ---------------------------------------------------------------------------
-- 1. Права и проверки
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select throws_ok(
  format($$ select edit_event(%L::uuid, 'Своё', now() + interval '1 day') $$, (select id from run)),
  'P0001', 'forbidden', 'an employee does not edit a meeting'
);
select throws_ok(
  format($$ select delete_event(%L::uuid) $$, (select id from run)),
  'P0001', 'forbidden', 'nor delete it'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  format($$ select edit_event(%L::uuid, '   ', now() + interval '1 day') $$, (select id from run)),
  'P0001', 'event_title_required', 'a meeting keeps a name'
);
select throws_ok(
  format($$ select edit_event(%L::uuid, 'Планёрка', now() + interval '1 day', now() + interval '23 hours') $$,
         (select id from run)),
  'P0001', 'event_end_before_start', 'the end comes after the start'
);
select throws_ok(
  format($$ select edit_event(%L::uuid, 'Планёрка', now() + interval '1 day', null, null, null, 5000) $$,
         (select id from run)),
  'P0001', 'event_bad_reminder', 'a reminder lies within a day'
);

-- ---------------------------------------------------------------------------
-- 2. Айгуль убрали, место сменили: ей — ничего, Марату — «Новое место»
-- ---------------------------------------------------------------------------
select lives_ok(
  format($$ select edit_event(%L::uuid, 'Планёрка', (select starts_at from events where id = %L::uuid),
                              null, 'Переговорка', 'повестка', 60, false,
                              array['10000000-0000-0000-0000-000000000007']::uuid[]) $$,
         (select id from run), (select id from run)),
  'the director saves the form'
);
select is(
  (select array_agg(user_id order by user_id) from event_participants where event_id = (select id from run)),
  array['10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007']::uuid[],
  'the author and Marat are left'
);
select is(
  (select location || ' / ' || body || ' / ' || remind_before_min from events where id = (select id from run)),
  'Переговорка / повестка / 60',
  'the row carries the new fields'
);

set local role postgres;
select is(
  (select count(*) from notification_deliveries where created_at = now() and user_id = '10000000-0000-0000-0000-000000000008'),
  0::bigint,
  'Aigul''s unsent invitation is gone and no «Отмена» follows — she never knew'
);
select is(
  (select meta->>'title' from notification_deliveries
    where created_at = now() and event_kind = 'event_moved' and user_id = '10000000-0000-0000-0000-000000000007'),
  'Новое место',
  'Marat hears about the new place'
);
select is(
  (select count(*) from notification_deliveries where created_at = now() and user_id = '10000000-0000-0000-0000-000000000001'),
  0::bigint,
  'the author is told nothing about his own changes'
);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- 3. Перенос: время двигается, напоминание обнуляется, Марат слышит «Перенос»
-- ---------------------------------------------------------------------------
set local role postgres;
update events set reminded_at = now() where id = (select id from run);
set local role authenticated;
select lives_ok(
  format($$ select edit_event(%L::uuid, 'Планёрка', (select starts_at + interval '2 hours' from events where id = %L::uuid),
                              null, 'Переговорка', 'повестка', 60, false,
                              array['10000000-0000-0000-0000-000000000007']::uuid[]) $$,
         (select id from run), (select id from run)),
  'the director moves it two hours on'
);
select is(
  (select reminded_at from events where id = (select id from run)),
  null,
  'the reminder will fire again, at the new time'
);
set local role postgres;
select is(
  (select count(*) from notification_deliveries
    where created_at = now() and event_kind = 'event_moved' and meta->>'title' = 'Перенос'
      and user_id = '10000000-0000-0000-0000-000000000007'),
  1::bigint,
  'Marat hears «Перенос»'
);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- 4. Ерлана добавили — приглашение уже с новым временем, без «Переноса»
-- ---------------------------------------------------------------------------
select lives_ok(
  format($$ select edit_event(%L::uuid, 'Планёрка', (select starts_at from events where id = %L::uuid),
                              null, 'Переговорка', 'повестка', 60, false,
                              array['10000000-0000-0000-0000-000000000007',
                                    '10000000-0000-0000-0000-000000000005']::uuid[]) $$,
         (select id from run), (select id from run)),
  'the director adds Erlan'
);
set local role postgres;
select is(
  (select array_agg(event_kind) from notification_deliveries where created_at = now() and user_id = '10000000-0000-0000-0000-000000000005'),
  array['event_invite'],
  'Erlan gets one invitation and nothing else'
);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- 4б. Ещё перенос, пока приглашение Ерлана и «Перенос» Марата ждут окна:
--     ждущие строки переписываются, вторых извещений нет
-- ---------------------------------------------------------------------------
select lives_ok(
  format($$ select edit_event(%L::uuid, 'Планёрка', (select starts_at + interval '1 hour' from events where id = %L::uuid),
                              null, 'Переговорка', 'повестка', 60, false,
                              array['10000000-0000-0000-0000-000000000007',
                                    '10000000-0000-0000-0000-000000000005']::uuid[]) $$,
         (select id from run), (select id from run)),
  'the director moves it once more'
);
set local role postgres;
select is(
  (select array_agg(event_kind) from notification_deliveries where created_at = now() and user_id = '10000000-0000-0000-0000-000000000005'),
  array['event_invite'],
  'Erlan still has one line — the invitation'
);
select is(
  (select meta->>'body' from notification_deliveries where created_at = now() and user_id = '10000000-0000-0000-0000-000000000005'),
  'Планёрка · ' || to_char((select starts_at from events where id = (select id from run)) at time zone 'Asia/Aqtobe', 'DD.MM HH24:MI'),
  'and it already names the new time'
);
select is(
  (select count(*) from notification_deliveries
    where created_at = now() and event_kind = 'event_moved' and user_id = '10000000-0000-0000-0000-000000000007'),
  1::bigint,
  'Marat''s waiting «Перенос» is rewritten, not doubled'
);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- 5. Удаление: Марат знал — «Отмена» на /calendar; Ерлан не узнал — ничего;
--    всё, что ещё ждёт окна по этой встрече, снято
-- ---------------------------------------------------------------------------
select lives_ok(
  format($$ select delete_event(%L::uuid) $$, (select id from run)),
  'the director deletes the meeting'
);
select is((select count(*) from events where id = (select id from run)), 0::bigint, 'the row is gone');

set local role postgres;
select is(
  (select count(*) from event_participants where event_id = (select id from run)),
  0::bigint,
  'the guest list went with it'
);
select is(
  (select meta->>'url' from notification_deliveries
    where created_at = now() and event_kind = 'event_cancelled' and user_id = '10000000-0000-0000-0000-000000000007'),
  '/calendar',
  'Marat hears «Отмена», pointing at the calendar — the row is gone'
);
select is(
  (select count(*) from notification_deliveries where created_at = now() and user_id = '10000000-0000-0000-0000-000000000005'),
  0::bigint,
  'Erlan, whose invitation never left, hears nothing'
);
select is(
  (select count(*) from notification_deliveries
    where created_at = now() and status = 'queued' and meta->>'url' = '/calendar?e=' || (select id from run)),
  0::bigint,
  'nothing queued points at the deleted row'
);
set local role authenticated;

select lives_ok(
  format($$ select delete_event(%L::uuid) $$, (select id from run)),
  'a second delete is harmless'
);
select throws_ok(
  format($$ select edit_event(%L::uuid, 'Планёрка', now() + interval '1 day') $$, (select id from run)),
  'P0001', 'event_not_found', 'a deleted meeting cannot be edited'
);

set local role postgres;
select * from finish();
rollback;
