-- D-137: a minus the director says by voice is a minus (revises D-30) — confirm_voice_batch writes
-- it like a plus, with the phrase's reason or «снял директор»; zero is still skipped; the person
-- may dispute it (D-133); it never reaches Эфир.
-- Fixtures — supabase/seed.sql: director …0001, Марат …0007.
begin;
select plan(6);

update profiles set role = 'employee', is_active = true where id = '10000000-0000-0000-0000-000000000007';
update companies set settings = coalesce(settings, '{}') || '{"points_enabled": true}'::jsonb
 where id = '11111111-1111-1111-1111-111111111111';

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  jsonb_array_length((select confirm_voice_batch(
    '{"source":"voice","transcript":"Марату минус десять за опоздание","confirmed_entities":[
       {"kind":"points","assignee_id":"10000000-0000-0000-0000-000000000007","amount":-10,"reason":"pgtap за опоздание"}]}'::jsonb,
    '43700000-0000-0000-0000-000000000001'::uuid)->'point_ids')),
  1,
  'a minus said by the director is written'
);
select is(
  (select amount from point_transactions where reason = 'pgtap за опоздание'),
  -10,
  'as said: −10, manual'
);
select is(
  (select (confirm_voice_batch(
    '{"source":"voice","transcript":"Марату минус пять","confirmed_entities":[
       {"kind":"points","assignee_id":"10000000-0000-0000-0000-000000000007","amount":-5}]}'::jsonb,
    '43700000-0000-0000-0000-000000000002'::uuid)->'point_ids'->>0) is not null),
  true,
  'a minus without a reason goes too'
);
select is(
  (select (confirm_voice_batch(
    '{"source":"voice","transcript":"Марату ноль","confirmed_entities":[
       {"kind":"points","assignee_id":"10000000-0000-0000-0000-000000000007","amount":0}]}'::jsonb,
    '43700000-0000-0000-0000-000000000003'::uuid))->'skipped'->0->>'reason'),
  'points_blocked',
  'zero is still nothing'
);

set local role postgres;
select is(
  (select reason from point_transactions
    where user_id = '10000000-0000-0000-0000-000000000007' and amount = -5 and source = 'manual'
      and created_at = now()),
  'снял директор',
  'no reason in the phrase — «снял директор»'
);
select is(
  (select count(*)::int from ether_events where title in ('pgtap за опоздание', 'снял директор') and created_at = now()),
  0,
  'a minus never reaches Эфир'
);

select * from finish();
rollback;
