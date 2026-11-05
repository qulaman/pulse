-- settings.dev_tools (owner, 2026-11-04): «Лаборатория» and «Данные» open for a company by this flag
-- only. update_company_settings neither takes the key from a director or a secretary nor loses it
-- when anything else is saved. Fixtures are this file's own: dev data never leans in.
begin;
select plan(6);

insert into companies (id, name, settings) values
  ('05300000-0000-0000-0000-00000000000a', 'pgtap-053 закрыта', '{"mascot_seasons": true}'::jsonb),
  ('05300000-0000-0000-0000-00000000000b', 'pgtap-053 открыта', '{"dev_tools": true}'::jsonb);

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at,
                        confirmation_token, recovery_token, email_change, email_change_token_new,
                        email_change_token_current, phone_change, phone_change_token, reauthentication_token)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, now(), now(),
       '', '', '', '', '', '', '', ''
  from (values
    ('05300000-0000-0000-0000-000000000001'::uuid, 'pgtap-053-director@demo.local'),
    ('05300000-0000-0000-0000-000000000002'::uuid, 'pgtap-053-secretary@demo.local'),
    ('05300000-0000-0000-0000-000000000003'::uuid, 'pgtap-053-director-open@demo.local')
  ) as u(id, email);

insert into profiles (id, company_id, full_name, role, is_active) values
  ('05300000-0000-0000-0000-000000000001', '05300000-0000-0000-0000-00000000000a', 'pgtap-053 Директор', 'director', true),
  ('05300000-0000-0000-0000-000000000002', '05300000-0000-0000-0000-00000000000a', 'pgtap-053 Секретарь', 'secretary', true),
  ('05300000-0000-0000-0000-000000000003', '05300000-0000-0000-0000-00000000000b', 'pgtap-053 Директор открытой', 'director', true);

set local role authenticated;

-- a closed company: neither the director nor the secretary opens it for itself
set local request.jwt.claims = '{"sub":"05300000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  update_company_settings('{"dev_tools": true}'::jsonb) -> 'dev_tools',
  null,
  'the director cannot open the tools with a direct call'
);

set local request.jwt.claims = '{"sub":"05300000-0000-0000-0000-000000000002","role":"authenticated"}';
select is(
  update_company_settings('{"dev_tools": true, "mascot_seasons": false}'::jsonb) -> 'dev_tools',
  null,
  'neither can the secretary, inside a patch of something else'
);

select is(
  update_company_settings('{}'::jsonb) -> 'mascot_seasons',
  'false'::jsonb,
  'the rest of that patch went through'
);

-- an open company: saving anything keeps the flag, and it cannot be switched off from here either
set local request.jwt.claims = '{"sub":"05300000-0000-0000-0000-000000000003","role":"authenticated"}';
select is(
  update_company_settings('{"mascot_seasons": false}'::jsonb) -> 'dev_tools',
  'true'::jsonb,
  'a save of another key keeps the flag'
);

select is(
  update_company_settings('{"dev_tools": false}'::jsonb) -> 'dev_tools',
  'true'::jsonb,
  'and the patch cannot close it'
);

set local role postgres;
select is(
  (select count(*)::int from companies
    where id in ('05300000-0000-0000-0000-00000000000a', '05300000-0000-0000-0000-00000000000b')
      and settings ? 'dev_tools'),
  1,
  'the row of the closed company holds no key'
);

select * from finish();
rollback;
