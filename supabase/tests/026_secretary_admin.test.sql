-- Секретарь ведёт настройки и команду рядом с директором (D-104): правит карточки,
-- роли и «работает в компании» всех, кроме директоров, директором никого не делает,
-- свою роль и активность не трогает; настройки и название компании меняет, сотрудник —
-- нет. Фикстуры — supabase/seed.sql: директор …0001, Динара (менеджер) …0002,
-- Ерлан Б. …0005, Марат …0007, Айгуль …0008.
begin;
select plan(20);

-- Айгуль — секретарь. Роль меняет директор (trg_profiles_guard), поэтому сначала его
-- claims, и только потом роль authenticated.
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
update profiles set role = 'secretary' where id = '10000000-0000-0000-0000-000000000008';

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000008","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- 1. Чужая карточка: должность, роль, руководитель, увольнение
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ update profiles set "position" = 'Снабженец' where id = '10000000-0000-0000-0000-000000000007' $$,
  'the secretary edits a colleague''s position'
);
select is(
  (select "position" from profiles where id = '10000000-0000-0000-0000-000000000007'),
  'Снабженец',
  'and it is stored'
);
select lives_ok(
  $$ update profiles set role = 'manager' where id = '10000000-0000-0000-0000-000000000007' $$,
  'she gives Марат the manager role'
);
select is(
  (select role::text from profiles where id = '10000000-0000-0000-0000-000000000007'),
  'manager',
  'and the role is stored'
);
select lives_ok(
  $$ update profiles set manager_id = '10000000-0000-0000-0000-000000000001' where id = '10000000-0000-0000-0000-000000000005' $$,
  'she sets Ерлан''s manager'
);
select lives_ok(
  $$ update profiles set is_active = false where id = '10000000-0000-0000-0000-000000000005' $$,
  'she switches off a person who left'
);
select is(
  (select is_active from profiles where id = '10000000-0000-0000-0000-000000000005'),
  false,
  'and the person is inactive'
);

-- ---------------------------------------------------------------------------
-- 2. Директора не трогает и никого директором не делает
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ update profiles set role = 'director' where id = '10000000-0000-0000-0000-000000000007' $$,
  'P0001',
  'forbidden_field_update',
  'she cannot make anyone a director'
);
update profiles set "position" = 'Взломано' where id = '10000000-0000-0000-0000-000000000001';
select is(
  (select "position" from profiles where id = '10000000-0000-0000-0000-000000000001'),
  'Директор',
  'the director''s card is out of her reach'
);
update profiles set is_active = false where id = '10000000-0000-0000-0000-000000000001';
select is(
  (select is_active from profiles where id = '10000000-0000-0000-0000-000000000001'),
  true,
  'and so is switching the director off'
);

-- ---------------------------------------------------------------------------
-- 3. Своя карточка: имя и должность — да, роль и активность — нет
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ update profiles set "position" = 'Офис-менеджер' where id = '10000000-0000-0000-0000-000000000008' $$,
  'she edits her own position'
);
select throws_ok(
  $$ update profiles set role = 'employee' where id = '10000000-0000-0000-0000-000000000008' $$,
  'P0001',
  'forbidden_field_update',
  'she cannot change her own role'
);
select throws_ok(
  $$ update profiles set is_active = false where id = '10000000-0000-0000-0000-000000000008' $$,
  'P0001',
  'forbidden_field_update',
  'nor switch herself off'
);

-- ---------------------------------------------------------------------------
-- 4. Настройки и название компании
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select update_company_settings('{"points_enabled": true}'::jsonb) $$,
  'the secretary saves a settings section'
);
select is(
  (select settings->>'points_enabled' from companies where id = '11111111-1111-1111-1111-111111111111'),
  'true',
  'and the section is stored'
);
select lives_ok(
  $$ select update_company_profile('Компания Тест') $$,
  'she renames the company'
);
select is(
  (select name from companies where id = '11111111-1111-1111-1111-111111111111'),
  'Компания Тест',
  'and the name is stored'
);

-- ---------------------------------------------------------------------------
-- 5. Негатив: сотрудник не правит ни чужие карточки, ни настройки
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}';
update profiles set "position" = 'Взломано' where id = '10000000-0000-0000-0000-000000000007';
select is(
  (select "position" from profiles where id = '10000000-0000-0000-0000-000000000007'),
  'Снабженец',
  'an employee cannot touch a colleague''s card'
);
select throws_ok(
  $$ select update_company_settings('{"points_enabled": false}'::jsonb) $$,
  'P0001',
  'forbidden',
  'nor the settings'
);
select throws_ok(
  $$ select update_company_profile('Взломано') $$,
  'P0001',
  'forbidden',
  'nor the company name'
);

set local role postgres;
select * from finish();
rollback;
