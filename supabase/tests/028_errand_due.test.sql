-- Просьба ко времени (D-106 §8): «· к 18:00» в пуше, одно напоминание за 10 минут до срока
-- тому, кто взял, ничья — кто на месте; просьба «впритык» и прошедший срок не напоминаются.
-- Фикстуры — supabase/seed.sql: директор …0001, Марат …0007, Айгуль …0008.
begin;
select plan(10);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
update profiles set role = 'secretary', away_until = null
 where id in ('10000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000007');

-- a taxi for 18:00 Aqtobe (13:00 UTC), asked in the morning
create temp table taxi as
with ins as (
  insert into errands (company_id, author_id, kind, label, due_at, created_at)
  values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001', 'taxi', 'Такси',
          '2030-01-10 13:00:00+00', '2030-01-10 05:00:00+00')
  returning id
)
select id from ins;

select is(
  (select meta->>'title' from notification_deliveries
    where event_kind = 'errand_sent' and meta->>'errand_id' = (select id::text from taxi) limit 1),
  'Такси · к 18:00',
  'the push says the time, on the Aqtobe clock'
);

-- asked late in the evening for the next afternoon: the push says «завтра»
insert into errands (company_id, author_id, kind, label, due_at, created_at)
values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001', 'taxi', 'Такси',
        '2030-01-15 12:30:00+00', '2030-01-14 17:00:00+00');
select is(
  (select meta->>'title' from notification_deliveries n join errands e on e.id::text = n.meta->>'errand_id'
    where n.event_kind = 'errand_sent' and e.due_at = '2030-01-15 12:30:00+00' limit 1),
  'Такси · завтра к 17:30',
  'a time on the next day says «завтра»'
);

select is(errands_due_remind('2030-01-10 12:40:00+00'), 0, 'twenty minutes before — no reminder yet');
select is(errands_due_remind('2030-01-10 12:50:00+00'), 1, 'ten minutes before — the reminder');
select is(
  (select count(*) from notification_deliveries
    where meta->>'errand_id' = (select id::text from taxi) and (meta->>'due')::boolean),
  2::bigint,
  'nobody took it — both secretaries at the desk hear it'
);
select is(errands_due_remind('2030-01-10 12:55:00+00'), 0, 'once, not every minute');

-- taken: the reminder goes to the one who took it
create temp table coffee as
with ins as (
  insert into errands (company_id, author_id, kind, label, due_at, created_at, status, claimed_by)
  values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001', 'coffee', 'Кофе',
          '2030-01-11 10:00:00+00', '2030-01-11 08:00:00+00', 'accepted', '10000000-0000-0000-0000-000000000008')
  returning id
)
select id from ins;
select is(errands_due_remind('2030-01-11 09:51:00+00'), 1, 'a taken request is reminded too');
select is(
  (select array_agg(user_id::text) from notification_deliveries
    where meta->>'errand_id' = (select id::text from coffee) and (meta->>'due')::boolean),
  array['10000000-0000-0000-0000-000000000008'],
  'only to Айгуль, who took it'
);

-- asked fifteen minutes ahead: it has just come, no separate reminder
insert into errands (company_id, author_id, kind, label, due_at, created_at)
values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001', 'tea', 'Чай',
        '2030-01-12 10:00:00+00', '2030-01-12 09:45:00+00');
select is(errands_due_remind('2030-01-12 09:52:00+00'), 0, 'a request asked close to its time is not reminded');

-- a long outage: a time long gone is not reminded
insert into errands (company_id, author_id, kind, label, due_at, created_at)
values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001', 'tea', 'Чай',
        '2030-01-13 10:00:00+00', '2030-01-13 06:00:00+00');
select is(errands_due_remind('2030-01-13 11:00:00+00'), 0, 'after an outage the past is not reminded');

select * from finish();
rollback;
