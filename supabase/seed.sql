-- Dev fixtures only. This file is NEVER applied to prod (docs/SETUP.md section 3.4).
-- Contract: docs/DATABASE.md "seed.sql". Password for every demo user: demo1234.

set search_path = public, extensions;

-- pgTAP lives in dev only: RLS tests run against the linked dev project.
create extension if not exists pgtap with schema extensions;

-- ---------------------------------------------------------------------------
-- Company
-- ---------------------------------------------------------------------------
insert into companies (id, name, settings) values
  ('11111111-1111-1111-1111-111111111111', 'Demo Group',
   '{"delivery_window": {"from": "08:00", "to": "21:00"}}');

-- ---------------------------------------------------------------------------
-- auth.users + identities (8 demo accounts)
-- ---------------------------------------------------------------------------
-- GoTrue scans these token columns into Go strings: a NULL there breaks every
-- password grant with "Database error querying schema" (found live, task 006).
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000',
  u.id,
  'authenticated',
  'authenticated',
  u.email,
  crypt('demo1234', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now(),
  '', '', '', '', '', '', '', ''
from (values
  ('10000000-0000-0000-0000-000000000001'::uuid, 'director@demo.local'),
  ('10000000-0000-0000-0000-000000000002'::uuid, 'dinara@demo.local'),
  ('10000000-0000-0000-0000-000000000003'::uuid, 'timur@demo.local'),
  ('10000000-0000-0000-0000-000000000004'::uuid, 'tv@demo.local'),
  ('10000000-0000-0000-0000-000000000005'::uuid, 'erlan.b@demo.local'),
  ('10000000-0000-0000-0000-000000000006'::uuid, 'erlan.d@demo.local'),
  ('10000000-0000-0000-0000-000000000007'::uuid, 'marat@demo.local'),
  ('10000000-0000-0000-0000-000000000008'::uuid, 'aigul@demo.local')
) as u(id, email);

-- password sign-in resolves the account through auth.identities
insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select
  u.id::text,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email',
  now(), now(), now()
from auth.users u
where u.email like '%@demo.local';

-- ---------------------------------------------------------------------------
-- Profiles: director, manager, shopkeeper, tv kiosk + 4 employees.
-- Two "Ерлан" with colliding aliases are the name-matcher fixture.
-- ---------------------------------------------------------------------------
insert into profiles (id, company_id, full_name, role, "position", aliases, manager_id, availability) values
  ('10000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Директор Демо', 'director', 'Директор', '{"Директор"}', null, 'active'),
  ('10000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Динара Ахметова', 'manager', 'Руководитель отдела', '{"Динара"}', null, 'active'),
  ('10000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   'Тимур Салимов', 'shopkeeper', 'Кладовщик', '{"Тимур"}', null, 'active'),
  ('10000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'TV Kiosk', 'tv', null, '{}', null, 'active'),
  ('10000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
   'Ерлан Байжанов', 'employee', 'Менеджер', '{"Ерлан","Ерлан Б."}', null, 'active'),
  ('10000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111',
   'Ерлан Досов', 'employee', 'Менеджер', '{"Ерлан","Ерлан Д."}', null, 'active'),
  ('10000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111',
   'Марат Оспанов', 'employee', 'Специалист', '{"Марат"}',
   '10000000-0000-0000-0000-000000000002', 'active'),
  ('10000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111',
   'Айгуль Сапарова', 'employee', 'Специалист', '{"Айгуль"}', null, 'vacation');

-- ---------------------------------------------------------------------------
-- Tasks: one per enum status, one group_id pair, one overdue, one open question.
-- Inserted with their final status directly -- the guard trigger fires on update only.
-- ---------------------------------------------------------------------------
insert into tasks (
  id, company_id, author_id, assignee_id, group_id, title, body, deadline, status,
  scheduled_send_at, accepted_at, completed_at, closed_at, source
) values
  -- scheduled: invisible to the assignee until cron sends it
  ('20000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005',
   null, 'Подготовить отчёт по складу', null, null, 'scheduled',
   now() + interval '1 day', null, null, null, 'voice'),

  -- sent + overdue + open question; group pair with the next one
  ('20000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005',
   '30000000-0000-0000-0000-000000000001', 'Собрать документы по Казхрому', 'До конца недели',
   now() - interval '1 day', 'sent', null, null, null, null, 'voice'),

  -- sent, second copy of the multi-assignee command
  ('20000000-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006',
   '30000000-0000-0000-0000-000000000001', 'Собрать документы по Казхрому', 'До конца недели',
   now() + interval '2 day', 'sent', null, null, null, null, 'voice'),

  ('20000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006',
   null, 'Позвонить в КазАзот', null, now() + interval '3 day', 'accepted',
   null, now() - interval '2 hour', null, null, 'typed'),

  ('20000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007',
   null, 'Проверить остатки на Актобе-складе', null, null, 'in_progress',
   null, now() - interval '5 hour', null, null, 'voice'),

  ('20000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000008',
   null, 'Сверить счета за август', null, null, 'pending_review',
   null, now() - interval '1 day', now() - interval '1 hour', null, 'typed'),

  ('20000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000006',
   null, 'Отправить макет в Полиграф', null, null, 'done',
   null, now() - interval '3 day', now() - interval '2 day', now() - interval '2 day', 'voice'),

  ('20000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000007',
   null, 'Переделать смету по ERG', 'Не те цены', now() + interval '1 day', 'rework',
   null, now() - interval '2 day', now() - interval '1 day', null, 'voice'),

  ('20000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000008',
   null, 'Выехать на объект в субботу', null, null, 'declined',
   null, null, null, now() - interval '6 hour', 'voice'),

  ('20000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005',
   null, 'Забрать пропуска', null, null, 'revoked',
   null, null, null, now() - interval '4 hour', 'typed');

-- ---------------------------------------------------------------------------
-- Messages: one open question on the overdue task, one decline reason.
-- ---------------------------------------------------------------------------
insert into task_messages (company_id, task_id, sender_id, type, content, meta) values
  ('11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000005', 'text',
   'Какие именно документы нужны — оригиналы или копии?', '{"is_question": true}'),
  ('11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000008',
   '10000000-0000-0000-0000-000000000008', 'text', 'Не могу: в отпуске', '{"reason": "vacation"}');

-- ---------------------------------------------------------------------------
-- Эфир: one announcement, one ack.
-- ---------------------------------------------------------------------------
insert into announcements (id, company_id, author_id, audio_path, transcript) values
  ('50000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   '10000000-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111/10000000-0000-0000-0000-000000000001/ann-1.m4a',
   'В пятницу собрание в 10:00 в большой переговорной.');

insert into announcement_acks (announcement_id, user_id) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000005');

-- ---------------------------------------------------------------------------
-- Voice pipeline: the parse row confirm_voice_batch has to complete, and the
-- inbox draft it was parsed from.
-- ---------------------------------------------------------------------------
insert into ai_logs (
  id, company_id, user_id, kind, source, provider, model, transcript,
  parsed_entities, status, client_request_id
) values (
  '60000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
  '10000000-0000-0000-0000-000000000001', 'parse', 'voice', 'anthropic', 'claude-haiku-4-5',
  'Ерлану и Марату собрать документы по Казхрому до пятницы.',
  '[]', 'ok', '40000000-0000-0000-0000-000000000001'
);

insert into inbox_items (
  id, company_id, user_id, status, audio_path, transcript, entities, client_request_id
) values (
  '70000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
  '10000000-0000-0000-0000-000000000001', 'parsed',
  '11111111-1111-1111-1111-111111111111/10000000-0000-0000-0000-000000000001/inbox-1.m4a',
  'Ерлану и Марату собрать документы по Казхрому до пятницы.',
  '[]', '40000000-0000-0000-0000-000000000001'
);

-- ---------------------------------------------------------------------------
-- Storage fixture: a voice file of Айгуль -- nobody else may read it by policy.
-- ---------------------------------------------------------------------------
insert into storage.objects (bucket_id, name, owner, owner_id) values
  ('voice',
   '11111111-1111-1111-1111-111111111111/10000000-0000-0000-0000-000000000008/x.m4a',
   '10000000-0000-0000-0000-000000000008',
   '10000000-0000-0000-0000-000000000008')
on conflict do nothing;   -- storage rows survive `db reset --linked`
