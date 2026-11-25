-- Row-level security by role and by company (principle 6). Every policy on a public table is for a
-- signed-in user; a visitor without a session reads no row of any table; a signed-in director,
-- secretary or employee of company A reads no row of company B. The table lists are taken from the
-- catalog, so a table added later is checked without touching this file.
-- Fixtures are this file's own: two companies with people and rows in both.
begin;
select plan(12);

-- ---------------------------------------------------------------------------
-- Fixtures: company A — director, secretary, employee; company B — director, employee and a row
-- in most tables
-- ---------------------------------------------------------------------------
insert into companies (id, name, slug, settings) values
  ('06500000-0000-0000-0000-00000000000a', 'pgtap-065 A', 'pgtap-065-a', '{}'::jsonb),
  ('06500000-0000-0000-0000-00000000000b', 'pgtap-065 B', 'pgtap-065-b', '{}'::jsonb);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, now(), now(),
       '', '', '', '', '', '', '', ''
  from (values
    ('06500000-0000-0000-0000-000000000001'::uuid, 'pgtap-065-a-director@demo.local'),
    ('06500000-0000-0000-0000-000000000002'::uuid, 'pgtap-065-a-secretary@demo.local'),
    ('06500000-0000-0000-0000-000000000003'::uuid, 'pgtap-065-a-employee@demo.local'),
    ('06500000-0000-0000-0000-000000000011'::uuid, 'pgtap-065-b-director@demo.local'),
    ('06500000-0000-0000-0000-000000000012'::uuid, 'pgtap-065-b-employee@demo.local')
  ) as u(id, email);

insert into profiles (id, company_id, full_name, role, is_active) values
  ('06500000-0000-0000-0000-000000000001', '06500000-0000-0000-0000-00000000000a', 'pgtap-065 Директор А', 'director', true),
  ('06500000-0000-0000-0000-000000000002', '06500000-0000-0000-0000-00000000000a', 'pgtap-065 Секретарь А', 'secretary', true),
  ('06500000-0000-0000-0000-000000000003', '06500000-0000-0000-0000-00000000000a', 'pgtap-065 Сотрудник А', 'employee', true),
  ('06500000-0000-0000-0000-000000000011', '06500000-0000-0000-0000-00000000000b', 'pgtap-065 Директор Б', 'director', true),
  ('06500000-0000-0000-0000-000000000012', '06500000-0000-0000-0000-00000000000b', 'pgtap-065 Сотрудник Б', 'employee', true);

-- company A: one task for its own employee (the positive control)
insert into tasks (id, company_id, author_id, assignee_id, title, status) values
  ('06500000-0000-0000-0000-0000000000a1', '06500000-0000-0000-0000-00000000000a',
   '06500000-0000-0000-0000-000000000001', '06500000-0000-0000-0000-000000000003', 'pgtap-065 задача А', 'sent');

-- company B: a row in most tables; the tasks trigger chain adds deliveries and wall events
insert into tasks (id, company_id, author_id, assignee_id, title, status) values
  ('06500000-0000-0000-0000-0000000000b1', '06500000-0000-0000-0000-00000000000b',
   '06500000-0000-0000-0000-000000000011', '06500000-0000-0000-0000-000000000012', 'pgtap-065 задача Б', 'sent');
insert into task_messages (company_id, task_id, sender_id, type, content) values
  ('06500000-0000-0000-0000-00000000000b', '06500000-0000-0000-0000-0000000000b1',
   '06500000-0000-0000-0000-000000000011', 'text', 'pgtap-065 сообщение Б');
insert into task_reads (task_id, user_id, company_id) values
  ('06500000-0000-0000-0000-0000000000b1', '06500000-0000-0000-0000-000000000012', '06500000-0000-0000-0000-00000000000b');
insert into announcements (id, company_id, author_id, transcript) values
  ('06500000-0000-0000-0000-0000000000b2', '06500000-0000-0000-0000-00000000000b',
   '06500000-0000-0000-0000-000000000011', 'pgtap-065 объявление Б');
insert into announcement_acks (announcement_id, user_id) values
  ('06500000-0000-0000-0000-0000000000b2', '06500000-0000-0000-0000-000000000012');
insert into events (id, company_id, author_id, title, starts_at) values
  ('06500000-0000-0000-0000-0000000000b3', '06500000-0000-0000-0000-00000000000b',
   '06500000-0000-0000-0000-000000000011', 'pgtap-065 встреча Б', now() + interval '1 day');
insert into event_participants (event_id, user_id) values
  ('06500000-0000-0000-0000-0000000000b3', '06500000-0000-0000-0000-000000000012');
insert into notes (company_id, user_id, text) values
  ('06500000-0000-0000-0000-00000000000b', '06500000-0000-0000-0000-000000000011', 'pgtap-065 заметка Б');
insert into mind_boards (company_id, user_id, title) values
  ('06500000-0000-0000-0000-00000000000b', '06500000-0000-0000-0000-000000000011', 'pgtap-065 доска Б');
insert into reminders (company_id, user_id, text) values
  ('06500000-0000-0000-0000-00000000000b', '06500000-0000-0000-0000-000000000011', 'pgtap-065 напоминание Б');
insert into inbox_items (company_id, user_id) values
  ('06500000-0000-0000-0000-00000000000b', '06500000-0000-0000-0000-000000000011');
insert into daily_reports (company_id, user_id, report_date, status) values
  ('06500000-0000-0000-0000-00000000000b', '06500000-0000-0000-0000-000000000012', current_date - 1, 'missed');
insert into point_transactions (company_id, user_id, amount, reason, source) values
  ('06500000-0000-0000-0000-00000000000b', '06500000-0000-0000-0000-000000000012', 5, 'pgtap-065 очки Б', 'manual');
insert into shop_items (company_id, title, price) values
  ('06500000-0000-0000-0000-00000000000b', 'pgtap-065 награда Б', 10);
insert into errands (company_id, author_id, kind, label) values
  ('06500000-0000-0000-0000-00000000000b', '06500000-0000-0000-0000-000000000011', 'tea', 'pgtap-065 заявка Б');
insert into visits (company_id, author_id, kind, status) values
  ('06500000-0000-0000-0000-00000000000b', '06500000-0000-0000-0000-000000000011', 'visitor', 'waiting');
insert into ether_events (company_id, kind, user_id, title) values
  ('06500000-0000-0000-0000-00000000000b', 'praise', '06500000-0000-0000-0000-000000000012', 'pgtap-065 похвала Б');
insert into push_subscriptions (company_id, user_id, endpoint, p256dh, auth) values
  ('06500000-0000-0000-0000-00000000000b', '06500000-0000-0000-0000-000000000012',
   'https://push.invalid/pgtap-065', 'p256dh', 'auth');
insert into profile_phones (user_id, company_id, phone) values
  ('06500000-0000-0000-0000-000000000012', '06500000-0000-0000-0000-00000000000b', '+7 700 000 0065');
insert into ai_logs (company_id, user_id, kind, provider, model, status) values
  ('06500000-0000-0000-0000-00000000000b', '06500000-0000-0000-0000-000000000011', 'parse', 'pgtap', 'pgtap', 'ok');

-- What a role can see: one row per table, filled by `rls_065_count` under the role being checked.
create temp table rls_065_seen (who text, tbl text, n bigint);
grant all on rls_065_seen to public;

-- Every public table with company_id (and companies itself, and the two link tables through their
-- parent) — the rows of `company` the current role can read. A table the role has no grant on
-- counts as 0: it reads nothing.
create function pg_temp.rls_065_count(who text, company uuid) returns void
language plpgsql as $$
declare
  t text;
  n bigint;
begin
  for t in
    select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
       and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'company_id' and not a.attisdropped)
  loop
    begin
      execute format('select count(*) from public.%I where company_id = $1 or $1 is null', t) into n using company;
    exception when insufficient_privilege then n := 0;
    end;
    insert into rls_065_seen values (who, t, n);
  end loop;
  begin
    select count(*) into n from public.companies where id = company or company is null;
  exception when insufficient_privilege then n := 0;
  end;
  insert into rls_065_seen values (who, 'companies', n);
  begin
    select count(*) into n from public.announcement_acks k
     where k.announcement_id = '06500000-0000-0000-0000-0000000000b2' or company is null;
  exception when insufficient_privilege then n := 0;
  end;
  insert into rls_065_seen values (who, 'announcement_acks', n);
  begin
    select count(*) into n from public.event_participants p
     where p.event_id = '06500000-0000-0000-0000-0000000000b3' or company is null;
  exception when insufficient_privilege then n := 0;
  end;
  insert into rls_065_seen values (who, 'event_participants', n);
end $$;
grant execute on function pg_temp.rls_065_count(text, uuid) to public;

-- ---------------------------------------------------------------------------
-- 1. The catalog: every policy names the signed-in role, RLS is on everywhere
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from pg_policy p join pg_class c on c.oid = p.polrelid
    where c.relnamespace = 'public'::regnamespace and p.polroles <> array['authenticated'::regrole::oid]),
  0::bigint,
  'every policy on a public table is for authenticated only'
);

select is(
  (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and not c.relrowsecurity),
  0::bigint,
  'row-level security is on for every public table'
);

-- the fixture is not empty: company B owns rows in at least 20 tables
select pg_temp.rls_065_count('postgres', '06500000-0000-0000-0000-00000000000b');
select cmp_ok(
  (select count(*) from rls_065_seen where who = 'postgres' and n > 0),
  '>=', 20::bigint,
  'fixture: company B has rows in 20+ tables'
);

-- ---------------------------------------------------------------------------
-- 2. No session: nothing of anybody
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select pg_temp.rls_065_count('anon', null);
set local role postgres;

select is(
  (select coalesce(sum(n), 0) from rls_065_seen where who = 'anon'),
  0::numeric,
  'anon reads no row of any table with company_id'
);
select is(
  (select string_agg(tbl, ', ' order by tbl) from rls_065_seen where who = 'anon' and n > 0),
  null,
  'anon: no table lets a row through'
);

-- ---------------------------------------------------------------------------
-- 3. Company A does not see company B — the director, the secretary and the employee
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"06500000-0000-0000-0000-000000000001","role":"authenticated"}';
select pg_temp.rls_065_count('a_director', '06500000-0000-0000-0000-00000000000b');
set local request.jwt.claims = '{"sub":"06500000-0000-0000-0000-000000000002","role":"authenticated"}';
select pg_temp.rls_065_count('a_secretary', '06500000-0000-0000-0000-00000000000b');
set local request.jwt.claims = '{"sub":"06500000-0000-0000-0000-000000000003","role":"authenticated"}';
select pg_temp.rls_065_count('a_employee', '06500000-0000-0000-0000-00000000000b');
set local role postgres;

select is(
  (select string_agg(tbl, ', ' order by tbl) from rls_065_seen where who = 'a_director' and n > 0),
  null,
  'director of A reads no row of company B'
);
select is(
  (select string_agg(tbl, ', ' order by tbl) from rls_065_seen where who = 'a_secretary' and n > 0),
  null,
  'secretary of A reads no row of company B'
);
select is(
  (select string_agg(tbl, ', ' order by tbl) from rls_065_seen where who = 'a_employee' and n > 0),
  null,
  'employee of A reads no row of company B'
);

-- ---------------------------------------------------------------------------
-- 4. The positive control: the same people do see their own company
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"06500000-0000-0000-0000-000000000003","role":"authenticated"}';
select is(
  (select count(*) from tasks where id = '06500000-0000-0000-0000-0000000000a1'),
  1::bigint,
  'employee of A sees the task given to him'
);
set local request.jwt.claims = '{"sub":"06500000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (select count(*) from profiles where company_id = '06500000-0000-0000-0000-00000000000a'),
  3::bigint,
  'director of A sees the three people of A'
);

-- and company B's own director does see B's task (the rows exist and are readable to B)
set local request.jwt.claims = '{"sub":"06500000-0000-0000-0000-000000000011","role":"authenticated"}';
select is(
  (select count(*) from tasks where id = '06500000-0000-0000-0000-0000000000b1'),
  1::bigint,
  'director of B sees the task of B'
);

-- a signed-in user of B does not see the task of A either
select is(
  (select count(*) from tasks where id = '06500000-0000-0000-0000-0000000000a1'),
  0::bigint,
  'director of B does not see the task of A'
);

set local role postgres;
select * from finish();
rollback;
