-- «Спасибо» за заявку (D-97): благодарит только автор и только за «Готово»; второе «спасибо»
-- не сдвигает время первого; повтор с тем же client_request_id — дубль, а не ошибка.
-- Фикстуры — supabase/seed.sql: директор …0001, Айгуль …0008.
begin;
select plan(8);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
update profiles set role = 'secretary' where id = '10000000-0000-0000-0000-000000000008';

-- a done errand straight away: an insert that is not 'sent' queues no push
create temp table t1 as
with ins as (
  insert into errands (company_id, author_id, kind, label, status, claimed_by, accepted_at, done_at)
  values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001',
          'coffee', 'Кофе', 'done', '10000000-0000-0000-0000-000000000008', now(), now())
  returning id
)
select id from ins;

create temp table t2 as
with ins as (
  insert into errands (company_id, author_id, kind, label)
  values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001', 'tea', 'Чай')
  returning id
)
select id from ins;

grant select on t1, t2 to authenticated;
set local role authenticated;

-- the secretary cannot thank herself
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated"}';
select throws_ok(
  format($q$ select thank_errand(%L::uuid) $q$, (select id from t1)),
  'P0001', 'forbidden', 'only the one who asked says thank you'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  format($q$ select thank_errand(%L::uuid) $q$, (select id from t2)),
  'P0001', 'bad_transition', 'a request that is not done yet cannot be thanked'
);

select isnt(
  (select thank_errand((select id from t1), '7a000000-0000-0000-0000-000000000001')->>'thanked_at'),
  null,
  'the director thanks a done errand'
);
select is(
  (select thank_errand((select id from t1), '7a000000-0000-0000-0000-000000000001')->>'duplicate'),
  'true',
  'a replay of the same request is a duplicate'
);

create temp table first_thanks as select thanked_at from errands where id = (select id from t1);
select is(
  (select (thank_errand((select id from t1))->>'thanked_at')::timestamptz),
  (select thanked_at from first_thanks),
  'a second thank-you keeps the time of the first'
);
select is((select status::text from errands where id = (select id from t1)), 'done', 'the status does not move');
select is(
  (select count(*) from notification_deliveries where meta->>'errand_id' = (select id::text from t1)),
  0::bigint,
  'a thank-you sends no push'
);
select is((select thanked_at from errands where id = (select id from t2)), null, 'the other errand is untouched');

select * from finish();
rollback;
