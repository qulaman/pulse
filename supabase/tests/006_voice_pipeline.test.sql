-- Voice pipeline: RLS of the staging tables, the `voice` bucket and
-- confirm_voice_batch (idempotency, multi-assignee copies, quiet hours, G.22).
begin;
select plan(21);

-- ---------------------------------------------------------------------------
-- An employee sees none of the director's pipeline (RLS cases 8-9)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';

select is((select count(*) from ai_logs), 0::bigint, 'employee reads no ai_logs');
select is((select count(*) from inbox_items), 0::bigint,
          'employee reads no inbox_items of the director');
select is((select count(*) from ingest_batches), 0::bigint, 'employee reads no ingest_batches');

-- somebody else's voice file: readable only through a server-issued signed URL (D-18)
select is(
  (select count(*) from storage.objects
    where name = '11111111-1111-1111-1111-111111111111/10000000-0000-0000-0000-000000000008/x.m4a'),
  0::bigint,
  'employee does not see the voice object of another employee'
);

-- ---------------------------------------------------------------------------
-- The director confirms a batch: 3 tasks (two of them one multi-assignee
-- phrase), 1 announcement, points and query skipped. 10:00 Aqtobe -> `sent`.
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

create temp table confirm_run as
select confirm_voice_batch(
  payload := '{
    "source": "voice",
    "audio_path": "11111111-1111-1111-1111-111111111111/10000000-0000-0000-0000-000000000001/batch-1.m4a",
    "transcript": "Ерлану и Марату собрать документы, Айгуль проверить склад, всем собрание в пятницу",
    "was_edited": true,
    "edit_fields": ["deadline"],
    "parsed_entities": [],
    "inbox_id": "70000000-0000-0000-0000-000000000001",
    "confirmed_entities": [
      {"kind":"task","assignee_id":"10000000-0000-0000-0000-000000000008","group_id":null,
       "title":"Проверить склад","body":null,
       "deadline_iso":"2026-09-12T13:00:00+05:00","priority":"high","scheduled_send_at":null},
      {"kind":"task","assignee_id":"10000000-0000-0000-0000-000000000005","group_id":"g1",
       "title":"Собрать документы","body":"Оригиналы",
       "deadline_iso":null,"priority":"normal","scheduled_send_at":null},
      {"kind":"task","assignee_id":"10000000-0000-0000-0000-000000000007","group_id":"g1",
       "title":"Собрать документы","body":"Оригиналы",
       "deadline_iso":null,"priority":"normal","scheduled_send_at":null},
      {"kind":"announcement","text":"В пятницу собрание в 10:00"},
      {"kind":"points","assignee_id":"10000000-0000-0000-0000-000000000005","amount":10,
       "reason":"быстро закрыл"},
      {"kind":"query","question":"что там у Ерлана?"}
    ]
  }'::jsonb,
  client_request_id := '40000000-0000-0000-0000-000000000001'::uuid,
  p_now := '2026-09-10T05:00:00Z'::timestamptz
) as r;

select is(jsonb_array_length((select r->'task_ids' from confirm_run)), 3,
          'three tasks were created');
select is(jsonb_array_length((select r->'announcement_ids' from confirm_run)), 1,
          'one announcement was created');
select is((select r->>'duplicate' from confirm_run), 'false', 'the first call is not a duplicate');
select is((select r->>'scheduled' from confirm_run), 'false',
          '10:00 Aqtobe is inside the delivery window: nothing is scheduled');

select is(
  (select count(*) from tasks t
    where t.id::text in (select jsonb_array_elements_text(r->'task_ids') from confirm_run)
      and t.status = 'sent'),
  3::bigint,
  'all three tasks are sent'
);

-- the two copies of one phrase share a generated group_id (D-02)
select is(
  (select count(distinct t.group_id) from tasks t
    where t.id::text in (select jsonb_array_elements_text(r->'task_ids') from confirm_run)
      and t.group_id is not null),
  1::bigint,
  'the multi-assignee copies share one group_id'
);
select is(
  (select count(*) from tasks t
    where t.id::text in (select jsonb_array_elements_text(r->'task_ids') from confirm_run)
      and t.group_id is not null),
  2::bigint,
  'exactly two tasks carry that group_id'
);

-- points are off during the pilot (G.22), a question persists nothing
select is(
  (select r->'skipped' from confirm_run),
  '[{"kind":"points","reason":"points_disabled"},{"kind":"query","reason":"query_not_persisted"}]'::jsonb,
  'points and query are reported as skipped'
);

-- the edit ratio metric landed on the parse row of the same batch (D-35)
select is(
  (select jsonb_array_length(confirmed_entities) from ai_logs
    where id = '60000000-0000-0000-0000-000000000001'),
  6,
  'ai_logs got confirmed_entities'
);
select ok(
  (select was_edited and edit_fields = '{deadline}'::text[] from ai_logs
    where id = '60000000-0000-0000-0000-000000000001'),
  'ai_logs got was_edited and edit_fields'
);
select is(
  (select status from inbox_items where id = '70000000-0000-0000-0000-000000000001'),
  'confirmed'::inbox_status,
  'the inbox draft is confirmed'
);

-- ---------------------------------------------------------------------------
-- The same client_request_id returns the stored result and creates nothing
-- ---------------------------------------------------------------------------
create temp table confirm_again as
select confirm_voice_batch(
  payload := '{"source":"voice","transcript":"повтор","confirmed_entities":[
      {"kind":"task","assignee_id":"10000000-0000-0000-0000-000000000005","group_id":null,
       "title":"Дубль","body":null,"deadline_iso":null,"priority":"normal","scheduled_send_at":null}]}'::jsonb,
  client_request_id := '40000000-0000-0000-0000-000000000001'::uuid,
  p_now := '2026-09-10T05:00:00Z'::timestamptz
) as r;

select is(
  (select r - 'duplicate' from confirm_again),
  (select r - 'duplicate' from confirm_run),
  'the duplicate call returns the very same result'
);
select is((select r->>'duplicate' from confirm_again), 'true', 'the duplicate is flagged');
select is((select count(*) from tasks where title = 'Дубль'), 0::bigint,
          'the duplicate call created no task');

-- ---------------------------------------------------------------------------
-- Quiet hours (D-38): 23:30 Aqtobe -> scheduled to the next window start
-- ---------------------------------------------------------------------------
create temp table confirm_quiet as
select confirm_voice_batch(
  payload := '{"source":"voice","transcript":"ночная задача","confirmed_entities":[
      {"kind":"task","assignee_id":"10000000-0000-0000-0000-000000000005","group_id":null,
       "title":"Ночная задача","body":null,"deadline_iso":null,"priority":"normal","scheduled_send_at":null}]}'::jsonb,
  client_request_id := '40000000-0000-0000-0000-000000000002'::uuid,
  p_now := '2026-09-10T18:30:00Z'::timestamptz
) as r;

select is(
  (select array_agg(t.status::text || ' ' || t.scheduled_send_at::text)
     from tasks t
    where t.id::text in (select jsonb_array_elements_text(r->'task_ids') from confirm_quiet)),
  array['scheduled ' || ('2026-09-11T03:00:00Z'::timestamptz)::text],
  'outside the window the task waits for 08:00 Aqtobe'
);

-- ... unless the director insists on sending it now
create temp table confirm_force as
select confirm_voice_batch(
  payload := '{"source":"voice","transcript":"срочно","force_now":true,"confirmed_entities":[
      {"kind":"task","assignee_id":"10000000-0000-0000-0000-000000000005","group_id":null,
       "title":"Срочная задача","body":null,"deadline_iso":null,"priority":"high","scheduled_send_at":null}]}'::jsonb,
  client_request_id := '40000000-0000-0000-0000-000000000003'::uuid,
  p_now := '2026-09-10T18:30:00Z'::timestamptz
) as r;

select is(
  (select array_agg(t.status::text) from tasks t
    where t.id::text in (select jsonb_array_elements_text(r->'task_ids') from confirm_force)),
  array['sent'],
  'force_now overrides the quiet hours'
);

-- ---------------------------------------------------------------------------
-- Only the director confirms a batch
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';
select throws_ok(
  $$ select confirm_voice_batch(
       payload := '{"source":"voice","transcript":"я тоже хочу","confirmed_entities":[]}'::jsonb,
       client_request_id := '40000000-0000-0000-0000-000000000009'::uuid) $$,
  'P0001', 'forbidden',
  'an employee cannot confirm a voice batch'
);

set local role postgres;
select * from finish();
rollback;
