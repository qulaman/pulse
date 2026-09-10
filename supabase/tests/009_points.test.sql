-- Points behind the flag (D-48), award_points, fn_rating, update_company_settings.
begin;
select plan(9);

-- employee cannot flip settings
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';
select throws_ok(
  $$ select update_company_settings('{"points_enabled": true}'::jsonb) $$,
  'P0001', 'forbidden',
  'employee cannot edit company settings'
);

-- director awards +10 to Марат with a reason
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (select (award_points('10000000-0000-0000-0000-000000000007'::uuid, 10, 'за скорость'))->>'balance')::int,
  10,
  'director: +10 → balance 10'
);
select throws_ok(
  $$ select award_points('10000000-0000-0000-0000-000000000007'::uuid, -5, '  ') $$,
  'P0001', 'reason_required',
  'taking points away without a reason is refused'
);

-- the rating sees Марат on top, with the requester flagged
select is(
  (select r.display_name from fn_rating(now() - interval '7 days', now() + interval '1 minute') r
    where r.rank = 1 limit 1),
  'Марат Оспанов',
  'fn_rating: Марат ranks first'
);

-- employee sees the rating too (top5 + own row) but no one else's raw transactions
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';
select ok(
  (select count(*) from fn_rating(now() - interval '7 days', now() + interval '1 minute')) between 1 and 6,
  'employee: rating is top-5 plus own row at most'
);
select is(
  (select count(*) from point_transactions), 0::bigint,
  'employee reads no transactions of other people'
);

-- points stay skipped in confirm while the flag is off …
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (select (confirm_voice_batch(
    '{"source":"typed","transcript":"очки","confirmed_entities":[
       {"kind":"points","assignee_id":"10000000-0000-0000-0000-000000000007","amount":5,"reason":"тест"}]}'::jsonb,
    '42000000-0000-0000-0000-000000000001'::uuid))->'skipped'->0->>'reason'),
  'points_disabled',
  'confirm: points skipped while points_enabled is off'
);

-- … and are persisted once the director switches them on
select is(
  (select (update_company_settings('{"points_enabled": true}'::jsonb))->>'points_enabled'),
  'true',
  'director: points_enabled switched on'
);
select is(
  jsonb_array_length((select confirm_voice_batch(
    '{"source":"typed","transcript":"очки","confirmed_entities":[
       {"kind":"points","assignee_id":"10000000-0000-0000-0000-000000000007","amount":5,"reason":"тест"}]}'::jsonb,
    '42000000-0000-0000-0000-000000000002'::uuid)->'point_ids')),
  1,
  'confirm: points persisted once enabled'
);

set local role postgres;
select * from finish();
rollback;
