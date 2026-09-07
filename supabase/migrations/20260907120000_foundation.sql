-- Foundation: enums, companies, profiles, RLS helper functions and policies.
-- One migration = one feature (docs/DATABASE.md "Миграции — дисциплина").

create extension if not exists moddatetime;

-- ---------------------------------------------------------------------------
-- Enum types (docs/DATABASE.md "Enum-типы"); shop_final is intentionally absent
-- ---------------------------------------------------------------------------
create type user_role      as enum ('director','manager','employee','shopkeeper','tv');
create type availability_t as enum ('active','vacation','sick');
create type task_status    as enum ('scheduled','sent','accepted','in_progress','pending_review','done','rework','declined','revoked');
create type task_priority  as enum ('low','normal','high');
create type message_type   as enum ('text','voice','photo','status_change','system');
create type point_source   as enum ('manual','auto_rule','reaction','shop_hold','shop_release');
create type order_status   as enum ('pending','approved','delivered','cancelled');
create type delivery_channel as enum ('push','telegram','sms');
create type delivery_status  as enum ('queued','sent','failed');
create type ai_log_kind    as enum ('stt','parse','query');
create type ai_source      as enum ('voice','typed','shared');
create type absence_kind   as enum ('vacation','sick','other');
create type inbox_status   as enum ('recorded','transcribed','parsed','confirmed','discarded');

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
create table companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  settings   jsonb not null default '{}',
  created_at timestamptz not null default now()
);

comment on column companies.settings is 'auto-point rules, rating_mode, quiet hours, telegram escalation timeout';

-- ---------------------------------------------------------------------------
-- profiles (extension of auth.users; id is a fk without default)
-- ---------------------------------------------------------------------------
create table profiles (
  id                uuid primary key references auth.users on delete cascade,
  company_id        uuid not null references companies,
  full_name         text not null,
  role              user_role not null,
  "position"        text,
  avatar_url        text,
  aliases           text[] not null default '{}',
  manager_id        uuid references profiles,
  telegram_chat_id  bigint,
  is_active         boolean not null default true,
  availability      availability_t not null default 'active',
  settings          jsonb not null default '{}',
  streak_count      int not null default 0,
  streak_updated_at timestamptz,
  created_at        timestamptz not null default now()
);

comment on column profiles.aliases is 'short spoken forms used by the name matcher';
comment on column profiles.manager_id is 'delegation, depth 1 only — no recursion';

create index profiles_company_id_idx on profiles (company_id);

-- ---------------------------------------------------------------------------
-- RLS helpers (canonical pattern, docs/DATABASE.md) — security definer to avoid
-- recursive policy evaluation on profiles (42P17).
-- ---------------------------------------------------------------------------
create or replace function auth_company_id() returns uuid
language sql stable security definer set search_path = public
as $$ select company_id from profiles where id = auth.uid() $$;

create or replace function auth_role() returns text
language sql stable security definer set search_path = public
as $$ select role::text from profiles where id = auth.uid() $$;

create or replace function subordinates(mgr uuid) returns setof uuid
language sql stable security definer set search_path = public
as $$ select id from profiles where manager_id = mgr $$;

-- ---------------------------------------------------------------------------
-- Guard: only a director may change role / company_id / is_active
-- ---------------------------------------------------------------------------
create or replace function profiles_guard() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth_role() is distinct from 'director' then
    if new.role is distinct from old.role
       or new.company_id is distinct from old.company_id
       or new.is_active is distinct from old.is_active then
      raise exception 'forbidden_field_update' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_profiles_guard
  before update on profiles
  for each row execute function profiles_guard();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table companies enable row level security;

-- read: members of the company; any write is service-role only (no policy)
create policy companies_select on companies for select
  using (id = auth_company_id());

alter table profiles enable row level security;

-- read: the whole company, resolved through the helper (never a subquery on
-- profiles itself — that would recurse)
create policy profiles_select on profiles for select
  using (company_id = auth_company_id());

-- write: own row (protected fields are guarded by trg_profiles_guard) …
create policy profiles_update_self on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- … or any row of the company for a director
create policy profiles_update_director on profiles for update
  using (company_id = auth_company_id() and auth_role() = 'director')
  with check (company_id = auth_company_id() and auth_role() = 'director');

-- insert/delete: no policies — service role only (onboarding/offboarding)
