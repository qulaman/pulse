-- Связь директора и секретаря (D-99): обещание «через 5 мин», вопрос и ответ, результат
-- «Готово», «Напомнить ещё раз», тревога без окна отмены, «не на месте», срок просьбы.
-- Фикстуры — supabase/seed.sql: директор …0001, Марат …0007, Айгуль …0008.
begin;
select plan(19);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
update profiles set role = 'secretary'
 where id in ('10000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000007');

-- Марат отошёл: просьба уходит одной Айгуль
update profiles set away_until = now() + interval '30 minutes' where id = '10000000-0000-0000-0000-000000000007';

create temp table e1 as
with ins as (
  insert into errands (company_id, author_id, kind, label)
  values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001', 'coffee', 'Кофе')
  returning id
)
select id from ins;
grant select on e1 to authenticated;

select is(
  (select count(*) from notification_deliveries where event_kind = 'errand_sent' and meta->>'errand_id' = (select id::text from e1)),
  1::bigint,
  'the request goes only to the secretary who is at the desk'
);
select is(
  (select user_id::text from notification_deliveries where event_kind = 'errand_sent' and meta->>'errand_id' = (select id::text from e1)),
  '10000000-0000-0000-0000-000000000008',
  'and that is Айгуль'
);

set local role authenticated;

-- a question before taking it, answered by the director
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated"}';
select is(
  (select errand_ask((select id from e1), 'С сахаром?', '9a000000-0000-0000-0000-000000000001')->>'question'),
  'С сахаром?',
  'a secretary asks about a request nobody took yet'
);
select is(
  (select errand_ask((select id from e1), 'С сахаром?', '9a000000-0000-0000-0000-000000000001')->>'duplicate'),
  'true',
  'the same key twice is a duplicate'
);
select is(
  (select count(*) from notification_deliveries where event_kind = 'errand_question' and meta->>'errand_id' = (select id::text from e1)),
  1::bigint,
  'the director gets the question as a push'
);
select throws_ok(
  format($q$ select errand_answer(%L::uuid, 'Да') $q$, (select id from e1)),
  'P0001', 'forbidden', 'only the one who asked for it answers'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (select errand_answer((select id from e1), 'Да')->>'answer'),
  'Да',
  'the director answers in one tap'
);
select is(
  (select count(*) from notification_deliveries where event_kind = 'errand_answer' and meta->>'errand_id' = (select id::text from e1)),
  1::bigint,
  'and the answer goes back to the secretary'
);
select lives_ok(format($q$ select errand_nudge(%L::uuid) $q$, (select id from e1)), 'the director nudges a request nobody took');
select throws_ok(
  format($q$ select errand_nudge(%L::uuid) $q$, (select id from e1)),
  'P0001', 'too_soon', 'but not twice within a minute'
);

-- taken with a promise, closed with a result
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated"}';
select lives_ok(format($q$ select transition_errand(%L::uuid, 'accepted') $q$, (select id from e1)), 'Айгуль takes it');
select is(
  (select count(*) from notification_deliveries where event_kind = 'errand_accepted' and meta->>'errand_id' = (select id::text from e1)),
  0::bigint,
  'an ordinary «принято» sends the director no push'
);
select ok(
  (select (errand_eta((select id from e1), 5)->>'eta_at')::timestamptz > now()),
  'the promise «через 5 мин» is kept on the row'
);
select lives_ok(format($q$ select transition_errand(%L::uuid, 'done') $q$, (select id from e1)), 'and closes it');
select is(
  (select errand_result((select id from e1), 'На столе')->>'result'),
  'На столе',
  'with what to pass back'
);
select is(
  (select count(*) from notification_deliveries where event_kind = 'errand_done' and meta->>'errand_id' = (select id::text from e1)),
  1::bigint,
  'the director hears «готово» once — the one with the result'
);

-- the alarm: queued at once for everybody at the desk, marked urgent
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
create temp table e2 as
with ins as (
  insert into errands (company_id, author_id, kind, label, urgent)
  values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001', 'security', 'Охрана', true)
  returning id
)
select id from ins;
select is(
  (select meta->>'title' from notification_deliveries where event_kind = 'errand_sent' and meta->>'errand_id' = (select id::text from e2) limit 1),
  '🚨 Вызови охрану!',
  'the alarm has its own title'
);

-- a request with an end ends by itself
create temp table e3 as
with ins as (
  insert into errands (company_id, author_id, kind, label, status, claimed_by, accepted_at, until_at)
  values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001', 'dnd', 'Не беспокоить',
          'accepted', '10000000-0000-0000-0000-000000000008', now() - interval '40 minutes', now() - interval '1 minute')
  returning id
)
select id from ins;
reset role;
select is(errands_expire(), 1, 'the sweep ends the «не беспокоить» whose time is up');
select is((select status::text from errands where id = (select id from e3)), 'done', 'as done');

select * from finish();
rollback;
