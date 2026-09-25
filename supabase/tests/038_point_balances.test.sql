-- point_balances (D-126): the balance summed by the database under the caller's RLS, and the
-- unique key of inbox_items that makes the voice upload idempotent.
begin;
select plan(9);

-- ledger rows for Марат (a hold among them) and for the employee, written as the owner
insert into point_transactions (company_id, user_id, amount, reason, source)
select p.company_id, p.id, v.amount, 'pgtap balances', v.source::point_source
  from profiles p,
       (values (10, 'manual'), (-3, 'manual'), (-4, 'shop_hold')) as v(amount, source)
 where p.id = '10000000-0000-0000-0000-000000000007';
insert into point_transactions (company_id, user_id, amount, reason, source)
select p.company_id, p.id, 7, 'pgtap balances', 'manual'
  from profiles p
 where p.id = '10000000-0000-0000-0000-000000000005';

-- the director reads anyone's line, and it is the plain sum of the ledger
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (select balance from point_balances where user_id = '10000000-0000-0000-0000-000000000007'),
  (select sum(amount)::bigint from point_transactions where user_id = '10000000-0000-0000-0000-000000000007'),
  'director: balance = SUM(point_transactions) of the person'
);
select is(
  (select spent from point_balances where user_id = '10000000-0000-0000-0000-000000000007'),
  (select -sum(amount)::bigint from point_transactions
    where user_id = '10000000-0000-0000-0000-000000000007' and source in ('shop_hold', 'shop_release')),
  'director: spent = holds minus releases'
);
select is(
  (select earned_30d from point_balances where user_id = '10000000-0000-0000-0000-000000000007'),
  (select coalesce(sum(amount), 0)::bigint from point_transactions
    where user_id = '10000000-0000-0000-0000-000000000007'
      and amount > 0 and source not in ('shop_hold', 'shop_release')
      and created_at >= now() - interval '30 days'),
  'director: earned_30d counts awards only, shop rows and deductions left out'
);

-- the employee reads exactly their own line
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000005","role":"authenticated"}';
select is(
  (select count(*) from point_balances where user_id <> '10000000-0000-0000-0000-000000000005'),
  0::bigint,
  'employee: no balance of anybody else'
);
select is(
  (select count(*) from point_balances where user_id = '10000000-0000-0000-0000-000000000005'),
  1::bigint,
  'employee: their own line is there'
);
select is(
  (select balance from point_balances where user_id = '10000000-0000-0000-0000-000000000005'),
  (select sum(amount)::bigint from point_transactions where user_id = '10000000-0000-0000-0000-000000000005'),
  'employee: own balance = SUM of own ledger'
);

-- nobody signed in reads nothing at all
set local role anon;
select throws_ok(
  $$ select * from point_balances $$,
  '42501', null,
  'anon: no access to point_balances'
);

-- inbox_items: one staging row per capture
set local role postgres;
insert into inbox_items (company_id, user_id, status, client_request_id)
select company_id, id, 'recorded', '43000000-0000-0000-0000-000000000001'
  from profiles where id = '10000000-0000-0000-0000-000000000001';
select throws_ok(
  $$ insert into inbox_items (company_id, user_id, status, client_request_id)
     select company_id, id, 'recorded', '43000000-0000-0000-0000-000000000001'
       from profiles where id = '10000000-0000-0000-0000-000000000001' $$,
  '23505', null,
  'inbox_items: a second row of the same capture is a conflict'
);
select lives_ok(
  $$ insert into inbox_items (company_id, user_id, status)
     select company_id, id, 'recorded' from profiles where id = '10000000-0000-0000-0000-000000000001';
     insert into inbox_items (company_id, user_id, status)
     select company_id, id, 'recorded' from profiles where id = '10000000-0000-0000-0000-000000000001' $$,
  'inbox_items: rows without a request id never collide'
);

select * from finish();
rollback;
