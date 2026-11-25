-- D-189: «в срок» in the rating (fn_rating), on the wall (tv_rating) and in a person's focus
-- (tv_focus) is judged by the moment the task was handed in (`completed_at`), not the moment the
-- director accepted it (`closed_at`). A task the director closed without a hand-in has no
-- `completed_at` and is judged by its closing, as before. Company B's director sees none of A.
-- Own fixtures: company A — director DA, employee E1 with four accepted tasks this week:
--   T1 handed in a day before its deadline, accepted a day after it — on time (was late);
--   T2 handed in after its deadline — late;
--   T3 without a deadline — on time;
--   T4 closed by the director before its deadline without a hand-in — on time;
--   T5 handed in before its deadline, accepted 20 days after it — on time.
-- Company B — director DB.
begin;
select plan(5);

insert into companies (id, name, settings) values
  ('18900000-0000-0000-0000-000000000a00', 'pgtap-189 Компания A', '{"points_enabled": true, "rating_mode": "full"}'),
  ('18900000-0000-0000-0000-000000000b00', 'pgtap-189 Компания B', '{"points_enabled": true, "rating_mode": "full"}');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, now(), now(),
       '', '', '', '', '', '', '', ''
  from (values ('18900000-0000-0000-0000-0000000000a1'::uuid, 'pgtap-189-da@demo.local'),
               ('18900000-0000-0000-0000-0000000000a2'::uuid, 'pgtap-189-e1@demo.local'),
               ('18900000-0000-0000-0000-0000000000b1'::uuid, 'pgtap-189-db@demo.local')) u(id, email);

insert into profiles (id, company_id, full_name, role, is_active, availability, created_at) values
  ('18900000-0000-0000-0000-0000000000a1', '18900000-0000-0000-0000-000000000a00', 'pgtap-189 Директор A', 'director', true, 'active', now() - interval '60 days'),
  ('18900000-0000-0000-0000-0000000000a2', '18900000-0000-0000-0000-000000000a00', 'pgtap-189 E1', 'employee', true, 'active', now() - interval '60 days'),
  ('18900000-0000-0000-0000-0000000000b1', '18900000-0000-0000-0000-000000000b00', 'pgtap-189 Директор B', 'director', true, 'active', now() - interval '60 days');

-- E1 needs a point this week to stand in the wall's top
insert into point_transactions (company_id, user_id, amount, reason, source, actor_id)
values ('18900000-0000-0000-0000-000000000a00', '18900000-0000-0000-0000-0000000000a2', 5, 'pgtap-189', 'manual',
        '18900000-0000-0000-0000-0000000000a1');

insert into tasks (company_id, author_id, assignee_id, title, status, deadline, completed_at, closed_at)
select '18900000-0000-0000-0000-000000000a00', '18900000-0000-0000-0000-0000000000a1',
       '18900000-0000-0000-0000-0000000000a2', x.title, 'done', x.deadline, x.completed_at, x.closed_at
  from (values
    ('pgtap-189 T1', now() - interval '2 days', now() - interval '3 days', now() - interval '1 day'),
    ('pgtap-189 T2', now() - interval '2 days', now() - interval '36 hours', now() - interval '1 day'),
    ('pgtap-189 T3', null::timestamptz, now() - interval '3 days', now() - interval '1 day'),
    ('pgtap-189 T4', now() - interval '2 days', null::timestamptz, now() - interval '3 days'),
    ('pgtap-189 T5', now() - interval '20 days', now() - interval '21 days', now() - interval '1 hour')
  ) x(title, deadline, completed_at, closed_at);

set local role authenticated;
set local request.jwt.claims = '{"sub":"18900000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is(
  (select r.on_time_pct from fn_rating(now() - interval '7 days', now() + interval '1 minute') r
    where r.user_id = '18900000-0000-0000-0000-0000000000a2'),
  80::numeric,
  'fn_rating: handed in on time but accepted late counts on time — 4 of 5'
);

select is(
  (tv_rating()::jsonb -> 'team' ->> 'on_time')::int,
  4,
  'tv_rating: the team''s «в срок» is 4'
);
select is(
  (tv_rating()::jsonb -> 'team' ->> 'done')::int,
  5,
  'tv_rating: of 5 done'
);
select is(
  (select (p ->> 'on_time')::int from jsonb_array_elements(tv_rating()::jsonb -> 'top') p
    where p ->> 'id' = '18900000-0000-0000-0000-0000000000a2'),
  4,
  'tv_rating: E1 in the top has 4 on time'
);

-- принцип 6: B's director sees nobody of A
set local request.jwt.claims = '{"sub":"18900000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select is(
  (select count(*)::int from fn_rating(now() - interval '7 days', now() + interval '1 minute') r
    where r.user_id = '18900000-0000-0000-0000-0000000000a2'),
  0,
  'company B''s rating holds nobody of company A'
);

set local role postgres;
select * from finish();
rollback;
