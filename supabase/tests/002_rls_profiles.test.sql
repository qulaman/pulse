-- RLS on profiles: the whole company is readable, protected fields are not writable.
begin;
select plan(4);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';

select is(
  (select count(*) from profiles),
  8::bigint,
  'employee sees every profile of his company'
);

select throws_ok(
  $$ update profiles set role = 'director' where id = '10000000-0000-0000-0000-000000000005' $$,
  'P0001',
  'forbidden_field_update',
  'employee cannot promote himself'
);

select lives_ok(
  $$ update profiles set "position" = 'Старший менеджер' where id = '10000000-0000-0000-0000-000000000005' $$,
  'employee can edit his own position'
);

select is(
  (select "position" from profiles where id = '10000000-0000-0000-0000-000000000005'),
  'Старший менеджер',
  'the new position is stored'
);

set local role postgres;
select * from finish();
rollback;
