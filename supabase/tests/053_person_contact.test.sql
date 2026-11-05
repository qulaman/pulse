-- The card's phone and photo (the owner, 2026-11-04): a soft check on the phone; the phone is read
-- by the director, the secretary and the person, by no colleague; avatar_url and the phone are
-- written by the director and the secretary, a person's own row does not open them;
-- bucket `avatars` is public by direct URL, cannot be listed, and takes files only from the
-- director and the secretary, only into their own company's folder. Company A never sees or
-- writes company B.
-- Fixtures are this file's own: two companies, dev data never leans in.
begin;
select plan(41);

-- ---------------------------------------------------------------------------
-- Fixtures: company A — director, secretary, employee; company B — director, employee
-- ---------------------------------------------------------------------------
insert into companies (id, name) values
  ('05200000-0000-0000-0000-00000000000a', 'pgtap-052 A'),
  ('05200000-0000-0000-0000-00000000000b', 'pgtap-052 B');

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, now(), now(),
       '', '', '', '', '', '', '', ''
  from (values
    ('05200000-0000-0000-0000-000000000001'::uuid, 'pgtap-052-director-a@demo.local'),
    ('05200000-0000-0000-0000-000000000002'::uuid, 'pgtap-052-secretary-a@demo.local'),
    ('05200000-0000-0000-0000-000000000003'::uuid, 'pgtap-052-employee-a@demo.local'),
    ('05200000-0000-0000-0000-000000000004'::uuid, 'pgtap-052-director-b@demo.local'),
    ('05200000-0000-0000-0000-000000000005'::uuid, 'pgtap-052-employee-b@demo.local')
  ) as u(id, email);

insert into profiles (id, company_id, full_name, role, is_active) values
  ('05200000-0000-0000-0000-000000000001', '05200000-0000-0000-0000-00000000000a', 'pgtap-052 Директор A', 'director', true),
  ('05200000-0000-0000-0000-000000000002', '05200000-0000-0000-0000-00000000000a', 'pgtap-052 Секретарь A', 'secretary', true),
  ('05200000-0000-0000-0000-000000000003', '05200000-0000-0000-0000-00000000000a', 'pgtap-052 Сотрудник A', 'employee', true),
  ('05200000-0000-0000-0000-000000000004', '05200000-0000-0000-0000-00000000000b', 'pgtap-052 Директор B', 'director', true),
  ('05200000-0000-0000-0000-000000000005', '05200000-0000-0000-0000-00000000000b', 'pgtap-052 Сотрудник B', 'employee', true);

insert into profile_phones (user_id, company_id, phone) values
  ('05200000-0000-0000-0000-000000000001', '05200000-0000-0000-0000-00000000000a', '+7 700 000 00 01'),
  ('05200000-0000-0000-0000-000000000005', '05200000-0000-0000-0000-00000000000b', '+7 700 000 00 05');

-- ---------------------------------------------------------------------------
-- 1. The phone: soft, but not anything at all; and not a column everybody reads
-- ---------------------------------------------------------------------------
select hasnt_column('public', 'profiles', 'phone', 'profiles has no phone: every employee reads that table');
select lives_ok(
  $$ update profile_phones set phone = '8 (7132) 55-12-34' where user_id = '05200000-0000-0000-0000-000000000001' $$,
  'the way people write phones is taken'
);
select throws_ok(
  $$ update profile_phones set phone = 'марат' where user_id = '05200000-0000-0000-0000-000000000001' $$,
  '23514', null, 'words are not a phone'
);
select throws_ok(
  $$ update profile_phones set phone = '12-34' where user_id = '05200000-0000-0000-0000-000000000001' $$,
  '23514', null, 'four digits are not a phone'
);
update profile_phones set phone = '+7 700 000 00 01' where user_id = '05200000-0000-0000-0000-000000000001';

-- ---------------------------------------------------------------------------
-- 2. Who reads and who writes them. The employee: their own phone at most, and only to read
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000003","role":"authenticated"}';
select is(
  (select count(*) from profile_phones),
  0::bigint,
  'the employee does not read a colleague''s phone'
);
select throws_ok(
  $$ insert into profile_phones (user_id, company_id, phone)
     values ('05200000-0000-0000-0000-000000000003', '05200000-0000-0000-0000-00000000000a', '+7 700 000 00 03') $$,
  '42501', null, 'nor writes their own'
);
select throws_ok(
  $$ update profiles set avatar_url = 'https://example.com/me.png' where id = '05200000-0000-0000-0000-000000000003' $$,
  'P0001', 'forbidden_field_update', 'nor puts a picture of their choosing on the wall'
);
select is(
  (select count(*) from profiles where company_id = '05200000-0000-0000-0000-00000000000b'),
  0::bigint,
  'the employee of A sees nobody of B'
);

-- the director of A
set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ insert into profile_phones (user_id, company_id, phone)
     values ('05200000-0000-0000-0000-000000000003', '05200000-0000-0000-0000-00000000000a', '+7 700 000 00 03') $$,
  'the director writes a phone on a card'
);
select is(
  (select count(*) from profile_phones),
  2::bigint,
  'and reads the phones of the company, not of B'
);

-- the employee again: the phone on their own card is theirs to read
set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000003","role":"authenticated"}';
select is(
  (select phone from profile_phones where user_id = '05200000-0000-0000-0000-000000000003'),
  '+7 700 000 00 03',
  'the person reads their own phone'
);
select is((select count(*) from profile_phones), 1::bigint, 'and only that');

-- the secretary of A: anyone's but a director's, her own included
set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000002","role":"authenticated"}';
select lives_ok(
  $$ update profiles set avatar_url = 'https://x.supabase.co/storage/v1/object/public/avatars/a/b.jpg' where id = '05200000-0000-0000-0000-000000000003' $$,
  'the secretary writes a photo on a colleague''s card'
);
select lives_ok(
  $$ insert into profile_phones (user_id, company_id, phone)
     values ('05200000-0000-0000-0000-000000000002', '05200000-0000-0000-0000-00000000000a', '+7 700 000 00 02') $$,
  'and a phone on her own'
);
select is((select count(*) from profile_phones), 3::bigint, 'she reads the phones of the company');
update profile_phones set phone = '+7 000 000 00 00' where user_id = '05200000-0000-0000-0000-000000000001';
reset role;
set local request.jwt.claims = '{}';
select is(
  (select phone from profile_phones where user_id = '05200000-0000-0000-0000-000000000001'),
  '+7 700 000 00 01',
  'the director''s card is out of her reach'
);

-- company B against company A
set local role authenticated;
set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000004","role":"authenticated"}';
select is(
  (select count(*) from profiles where company_id = '05200000-0000-0000-0000-00000000000a'),
  0::bigint,
  'the director of B sees nobody of A'
);
select is(
  (select count(*) from profile_phones where company_id = '05200000-0000-0000-0000-00000000000a'),
  0::bigint,
  'and none of their phones'
);
select throws_ok(
  $$ insert into profile_phones (user_id, company_id, phone)
     values ('05200000-0000-0000-0000-000000000005', '05200000-0000-0000-0000-00000000000a', '+7 999 999 99 99') $$,
  '42501', null, 'and cannot file a phone under company A'
);
update profile_phones set phone = '+7 999 999 99 99' where user_id = '05200000-0000-0000-0000-000000000003';
update profiles set avatar_url = 'https://example.com/b.png' where id = '05200000-0000-0000-0000-000000000003';
reset role;
set local request.jwt.claims = '{}';
select is(
  (select phone from profile_phones where user_id = '05200000-0000-0000-0000-000000000003'),
  '+7 700 000 00 03',
  'and writes nothing on their phone'
);
select isnt(
  (select avatar_url from profiles where id = '05200000-0000-0000-0000-000000000003'),
  'https://example.com/b.png',
  'nor on their photo'
);

-- one request makes one card in a company; the same id in another company is another request
update profiles set client_request_id = '05300000-0000-4000-8000-000000000001' where id = '05200000-0000-0000-0000-000000000002';
select throws_ok(
  $$ update profiles set client_request_id = '05300000-0000-4000-8000-000000000001' where id = '05200000-0000-0000-0000-000000000003' $$,
  '23505', null, 'one request id, one card'
);
select lives_ok(
  $$ update profiles set client_request_id = '05300000-0000-4000-8000-000000000001' where id = '05200000-0000-0000-0000-000000000005' $$,
  'the same id belongs to another company without a clash'
);

-- ---------------------------------------------------------------------------
-- 3. The bucket: public by direct URL, small, images only, and no way to list or remove
-- ---------------------------------------------------------------------------
select is((select public from storage.buckets where id = 'avatars'), true, 'avatars is public by direct URL');
select is((select file_size_limit from storage.buckets where id = 'avatars'), 1048576::bigint, 'a megabyte at most');
select is(
  (select allowed_mime_types from storage.buckets where id = 'avatars'),
  array['image/jpeg', 'image/png', 'image/webp'],
  'images only, no SVG'
);
select is(
  (select count(*) from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and cmd <> 'INSERT'
      and (coalesce(qual, '') like '%avatars%' or coalesce(with_check, '') like '%avatars%')),
  0::bigint,
  'insert is the only policy on the bucket: no select, so it cannot be listed'
);

-- ---------------------------------------------------------------------------
-- 4. Writing a file
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('avatars', '05200000-0000-0000-0000-00000000000a/10000000-0000-4000-8000-000000000001.jpg') $$,
  'the director writes into the company''s folder'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('avatars', '05200000-0000-0000-0000-00000000000b/10000000-0000-4000-8000-000000000002.jpg') $$,
  '42501', null, 'not into the folder of company B'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name) values ('avatars', '10000000-0000-4000-8000-000000000003.jpg') $$,
  '42501', null, 'not outside a folder'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('avatars', '05200000-0000-0000-0000-00000000000a/deep/10000000-0000-4000-8000-000000000004.jpg') $$,
  '42501', null, 'not deeper than the company''s folder'
);

set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000002","role":"authenticated"}';
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('avatars', '05200000-0000-0000-0000-00000000000a/10000000-0000-4000-8000-000000000005.jpg') $$,
  'the secretary writes into the company''s folder'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('avatars', '05200000-0000-0000-0000-00000000000b/10000000-0000-4000-8000-000000000006.jpg') $$,
  '42501', null, 'not into the folder of company B'
);

set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000003","role":"authenticated"}';
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('avatars', '05200000-0000-0000-0000-00000000000a/10000000-0000-4000-8000-000000000007.jpg') $$,
  '42501', null, 'the employee writes nothing, not even into their own company''s folder'
);

set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000004","role":"authenticated"}';
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('avatars', '05200000-0000-0000-0000-00000000000a/10000000-0000-4000-8000-000000000008.jpg') $$,
  '42501', null, 'the director of B does not write into the folder of company A'
);

-- ---------------------------------------------------------------------------
-- 5. Listing and removing: nobody, the writer included; the server does it under the service role
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (select count(*) from storage.objects where bucket_id = 'avatars'),
  0::bigint,
  'the director cannot list even the company''s own files'
);
-- Storage's own trigger refuses a direct delete outright; where it does not, no policy lets it through
do $$ begin delete from storage.objects where bucket_id = 'avatars'; exception when insufficient_privilege then null; end $$;
update storage.objects set name = '05200000-0000-0000-0000-00000000000a/stolen.jpg' where bucket_id = 'avatars';

set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000004","role":"authenticated"}';
select is(
  (select count(*) from storage.objects where bucket_id = 'avatars'),
  0::bigint,
  'the director of B sees nothing in there'
);

reset role;
set local request.jwt.claims = '{}';
set local role anon;
select is(
  (select count(*) from storage.objects where bucket_id = 'avatars'),
  0::bigint,
  'neither does somebody signed out'
);
reset role;
select is(
  (select count(*) from storage.objects where bucket_id = 'avatars'),
  2::bigint,
  'the two files are still there: the delete above removed nothing'
);
select is(
  (select count(*) from storage.objects where bucket_id = 'avatars' and name like '%stolen%'),
  0::bigint,
  'and the rename changed nothing'
);

-- a fired secretary writes nothing: the session helpers read is_active
update profiles set is_active = false where id = '05200000-0000-0000-0000-000000000002';
set local role authenticated;
set local request.jwt.claims = '{"sub":"05200000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('avatars', '05200000-0000-0000-0000-00000000000a/10000000-0000-4000-8000-000000000009.jpg') $$,
  '42501', null, 'a secretary who left writes nothing'
);
reset role;

select * from finish();
rollback;
