-- Заявки секретарю (наряд 015A, D-79): просьба директора уходит всем секретарям, забирает
-- первая нажавшая, остальные роли заявок не видят вовсе, а тик эскалации повторяет пуш
-- ровно один раз. Фикстуры — supabase/seed.sql: директор …0001, Динара (менеджер) …0002,
-- киоск …0004, Ерлан Д. …0006, Марат …0007, Айгуль …0008.
begin;
select plan(37);

-- двое секретарей: заявка уходит обоим, забирает одна. Роль меняет только директор
-- (trg_profiles_guard), поэтому сначала его claims, и только потом роль authenticated.
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
update profiles set role = 'secretary'
 where id in ('10000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000006');

set local role authenticated;

-- ---------------------------------------------------------------------------
-- 1. Хелпер команды: секретарь в команде, киоск и директор — нет
-- ---------------------------------------------------------------------------
select ok(team_role('secretary'), 'the secretary counts as the team');
select ok(not team_role('tv'), 'the kiosk does not');
select ok(not team_role('director'), 'and neither does the director');

-- ---------------------------------------------------------------------------
-- 2. «Кофе, без сахара»: одна строка, два пуша, оба без ожидания окна доставки
-- ---------------------------------------------------------------------------
create temp table e1 as
with ins as (
  insert into errands (company_id, author_id, kind, label, note, client_request_id)
  values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001',
          'coffee', 'Кофе', 'без сахара', '5e000000-0000-0000-0000-000000000001')
  returning id
)
select id from ins;

select is((select count(*) from errands), 1::bigint, 'the errand is in the table');
select is((select status::text from errands), 'sent', 'and it starts as sent');
select is(
  (select count(*) from notification_deliveries where event_kind = 'errand_sent'),
  2::bigint,
  'both secretaries were asked'
);
select is(
  (select count(*) from notification_deliveries
    where event_kind = 'errand_sent' and meta->>'errand_id' = (select id::text from e1)),
  2::bigint,
  'and every row points at the errand'
);
select ok(
  (select bool_and(deliver_after <= now()) from notification_deliveries where event_kind = 'errand_sent'),
  'an errand never waits for the delivery window (D-38 does not apply)'
);

-- ---------------------------------------------------------------------------
-- 3. Тот же client_request_id второй заявки не создаёт
-- ---------------------------------------------------------------------------
select throws_ok(
  $q$ insert into errands (company_id, author_id, kind, label, client_request_id)
      values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001',
              'coffee', 'Кофе', '5e000000-0000-0000-0000-000000000001') $q$,
  '23505', null, 'a replay of the same request is refused by the unique index'
);
select is((select count(*) from errands), 1::bigint, 'and the table still holds one errand');

-- ---------------------------------------------------------------------------
-- 4. Негатив: заявки не видит ни сотрудник, ни менеджер, ни киоск; вставляет только директор
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000007","role":"authenticated"}';
select is((select count(*) from errands), 0::bigint, 'Марат sees no errands at all');
select throws_ok(
  $q$ insert into errands (company_id, author_id, kind, label)
      values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000007',
              'coffee', 'Кофе') $q$,
  '42501', null, 'and cannot ask for anything himself'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*) from errands), 0::bigint, 'the manager sees none either');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is((select count(*) from errands), 0::bigint, 'and the kiosk never reads them (D-45)');

-- ---------------------------------------------------------------------------
-- 5. Айгуль забирает заявку; директор узнаёт об этом без рода
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated"}';
select is(
  (select transition_errand((select id from e1), 'accepted', null,
                            '5e000000-0000-0000-0000-00000000000a')->>'status'),
  'accepted',
  'Айгуль takes the errand'
);
select is(
  (select claimed_by from errands where id = (select id from e1)),
  '10000000-0000-0000-0000-000000000008'::uuid,
  'and the row remembers who took it'
);
select ok(
  (select accepted_at is not null from errands where id = (select id from e1)),
  'the moment is stored too'
);
select is(
  (select meta->>'title' from notification_deliveries
    where event_kind = 'errand_accepted' and user_id = '10000000-0000-0000-0000-000000000001'),
  'Принято · Айгуль',
  'the director hears «Принято · Айгуль» — no gendered verb (docs/DESIGN.md)'
);

-- ---------------------------------------------------------------------------
-- 6. Второй секретарь опоздал
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}';
select throws_ok(
  format($q$ select transition_errand(%L::uuid, 'accepted') $q$, (select id from e1)),
  'P0001', 'already_claimed', 'the second secretary is told somebody was faster'
);

-- ---------------------------------------------------------------------------
-- 7. Повтор того же client_request_id ничего не меняет
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated"}';
create temp table accepted_before as
select accepted_at from errands where id = (select id from e1);

select is(
  (select transition_errand((select id from e1), 'accepted', null,
                            '5e000000-0000-0000-0000-00000000000a')->>'duplicate'),
  'true',
  'a replayed transition is flagged as a duplicate'
);
select is(
  (select accepted_at from errands where id = (select id from e1)),
  (select accepted_at from accepted_before),
  'and changes nothing in the row'
);

-- ---------------------------------------------------------------------------
-- 8. «Готово» закрывает только тот, кто взял
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}';
select throws_ok(
  format($q$ select transition_errand(%L::uuid, 'done') $q$, (select id from e1)),
  'P0001', 'bad_transition', 'somebody else does not close an errand they never took'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated"}';
select is(
  (select transition_errand((select id from e1), 'done')->>'status'), 'done',
  'Айгуль closes it'
);
select ok(
  (select done_at is not null from errands where id = (select id from e1)),
  'and the moment of it is stored'
);
select is(
  (select meta->>'title' from notification_deliveries
    where event_kind = 'errand_done' and user_id = '10000000-0000-0000-0000-000000000001'),
  'Готово · Айгуль',
  'the director is told it is done'
);

-- ---------------------------------------------------------------------------
-- 9. «Не могу» с причиной
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
create temp table e2 as
with ins as (
  insert into errands (company_id, author_id, kind, label)
  values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001',
          'coffee', 'Кофе')
  returning id
)
select id from ins;

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated"}';
select is(
  (select transition_errand((select id from e2), 'declined', 'нет молока')->>'status'),
  'declined',
  'the secretary cannot do it'
);
select is(
  (select decline_reason from errands where id = (select id from e2)), 'нет молока',
  'and says why'
);
select is(
  (select meta->>'body' from notification_deliveries
    where event_kind = 'errand_declined' and user_id = '10000000-0000-0000-0000-000000000001'),
  'Кофе · нет молока',
  'the director gets the reason with the label'
);

-- ---------------------------------------------------------------------------
-- 10. Отмена: отзывает только автор, очередь пустеет без пуша
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
create temp table e3 as
with ins as (
  insert into errands (company_id, author_id, kind, label)
  values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001',
          'tea', 'Чай')
  returning id
)
select id from ins;

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated"}';
select throws_ok(
  format($q$ select transition_errand(%L::uuid, 'cancelled') $q$, (select id from e3)),
  'P0001', 'forbidden', 'the secretary does not cancel what the director asked'
);

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (select transition_errand((select id from e3), 'cancelled')->>'status'), 'cancelled',
  'the director takes his own request back'
);
select is(
  (select count(*) from notification_deliveries
    where event_kind = 'errand_sent' and status = 'queued'
      and meta->>'errand_id' = (select id::text from e3)),
  0::bigint,
  'and what had not left the queue never leaves it'
);

-- ---------------------------------------------------------------------------
-- 11. Эскалация: один повтор через три минуты, второй тик молчит
-- ---------------------------------------------------------------------------
create temp table e4 as
with ins as (
  insert into errands (company_id, author_id, kind, label)
  values ('11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001',
          'doctor', 'Врач')
  returning id
)
select id from ins;

set local role service_role;
select is(errands_due_escalation(now() + interval '4 minutes'), 1,
          'the tick picks up the one errand nobody took');
select ok(
  (select escalated_at is not null from errands where id = (select id from e4)),
  'and marks it escalated'
);
select is(
  (select count(*) from notification_deliveries
    where event_kind = 'errand_sent' and meta->>'errand_id' = (select id::text from e4)),
  4::bigint,
  'both secretaries were asked twice'
);
select is(
  (select count(*) from notification_deliveries
    where event_kind = 'errand_sent' and meta->>'repeat' = 'true'
      and meta->>'errand_id' = (select id::text from e4)),
  2::bigint,
  'and the repeat is marked as one'
);
select is(errands_due_escalation(now() + interval '4 minutes'), 0,
          'the second tick of the same minute sends nothing');

-- ---------------------------------------------------------------------------
-- 12. Секретарь стоит в рейтинге рядом со всеми (team_role)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (select count(*) from fn_rating(now() - interval '7 days', now() + interval '1 minute') r
    where r.user_id = '10000000-0000-0000-0000-000000000008'),
  1::bigint,
  'the secretary is in the rating'
);

set local role postgres;
select * from finish();
rollback;
