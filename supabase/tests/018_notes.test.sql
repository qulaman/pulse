-- Заметки директора (наряд 012A, D-75): confirm_voice_batch пишет `note`,
-- идемпотентность держится, чужую заметку не видит и не правит никто.
begin;
select plan(12);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- 1. «запиши мысль …» -> одна строка в notes, сырой транскрипт рядом с текстом
-- ---------------------------------------------------------------------------
create temp table note_run as
select confirm_voice_batch(
  payload := '{
    "source": "voice",
    "transcript": "запиши мысль идея акция для Альфы",
    "confirmed_entities": [
      {"kind":"note","text":"Идея: акция для Альфы","source_span":"идея акция для Альфы"}
    ]
  }'::jsonb,
  client_request_id := '4a000000-0000-0000-0000-000000000001'::uuid,
  p_now := '2026-09-10T05:00:00Z'::timestamptz
) as r;

select is(jsonb_array_length((select r->'note_ids' from note_run)), 1,
          'one note came back from the batch');
select is((select count(*) from notes), 1::bigint, 'and one note lies in the table');
select is(
  (select raw_transcript from notes
    where id = (select (r->'note_ids'->>0)::uuid from note_run)),
  'запиши мысль идея акция для Альфы',
  'the note keeps what STT heard, next to the text'
);

-- ---------------------------------------------------------------------------
-- 2. Тот же client_request_id ничего не создаёт
-- ---------------------------------------------------------------------------
create temp table note_again as
select confirm_voice_batch(
  payload := '{"source":"voice","transcript":"повтор","confirmed_entities":[
      {"kind":"note","text":"Дубль","source_span":"дубль"}]}'::jsonb,
  client_request_id := '4a000000-0000-0000-0000-000000000001'::uuid,
  p_now := '2026-09-10T05:00:00Z'::timestamptz
) as r;

select is((select r->>'duplicate' from note_again), 'true', 'the replay is flagged as a duplicate');
select is((select count(*) from notes), 1::bigint, 'and it created no second note');

-- ---------------------------------------------------------------------------
-- 3. Приватность по автору: заметку директора не видит никто (D-75 §2)
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*) from notes), 0::bigint, 'the manager sees no note of the director');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';
select is((select count(*) from notes), 0::bigint, 'the employee sees no note of the director');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is((select count(*) from notes), 0::bigint, 'the kiosk sees no note of the director');

-- ---------------------------------------------------------------------------
-- 4. «Поручить»: batch с note_id помечает заметку конвертированной (D-75 §5)
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

create temp table convert_run as
select confirm_voice_batch(
  payload := ('{
    "source": "typed",
    "transcript": "Идея: акция для Альфы",
    "note_id": "' || (select (r->'note_ids'->>0)::uuid from note_run) || '",
    "confirmed_entities": [
      {"kind":"task","assignee_id":"10000000-0000-0000-0000-000000000007","group_id":null,
       "title":"Идея: акция для Альфы","body":null,
       "deadline_iso":null,"priority":"normal","scheduled_send_at":null}
    ]
  }')::jsonb,
  client_request_id := '4a000000-0000-0000-0000-000000000002'::uuid,
  p_now := '2026-09-10T05:00:00Z'::timestamptz
) as r;

select is(
  (select converted_task_id from notes
    where id = (select (r->'note_ids'->>0)::uuid from note_run)),
  (select (r->'task_ids'->>0)::uuid from convert_run),
  'the note points at the task it became'
);
select ok(
  (select converted_at is not null from notes
    where id = (select (r->'note_ids'->>0)::uuid from note_run)),
  'and it is marked converted'
);

-- ---------------------------------------------------------------------------
-- 5. Мягкое удаление: свою заметку директор гасит, чужую менеджер не трогает
-- ---------------------------------------------------------------------------
select is(
  (with gone as (
     update notes set deleted_at = now()
      where id = (select (r->'note_ids'->>0)::uuid from note_run)
      returning 1)
   select count(*) from gone),
  1::bigint,
  'the director soft-deletes his own note'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is(
  (with gone as (
     update notes set deleted_at = now()
      where id = (select (r->'note_ids'->>0)::uuid from note_run)
      returning 1)
   select count(*) from gone),
  0::bigint,
  'the manager cannot touch it'
);

set local role postgres;
select * from finish();
rollback;
