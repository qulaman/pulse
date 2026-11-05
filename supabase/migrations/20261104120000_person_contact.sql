-- The owner, 2026-11-04: a card gets a phone and a photo; departments stay out; a card without
-- history may be deleted (the rule itself lives in lib/people/history.ts, narrowing D-104 §7).
--   1. profile_phones      — a table of its own, not a column: everybody in the company reads
--                            `profiles`, and a personal phone is not everybody's (ПД). Read by the
--                            director, the secretary and the person; written by the first two.
--                            Free-form, the check only stops what is plainly not a phone
--   2. profiles_guard      — the photo belongs to whoever keeps the roster: the director and the
--                            secretary; a person's own row does not open it
--   3. profiles.client_request_id — creating a person is retried too (principle 7): one request
--                            makes one card, per company, even when two arrive at once
--   4. bucket `avatars`    — public by direct URL (the wall, the login's arrival, <img>), never
--                            listable: no select policy. Written by the director and the secretary
--                            into their own company's folder, by the client. Nothing else from the
--                            client: no update (a name is random, a file never changes), no delete
--                            (Storage needs select to delete, and there is none) — the old file is
--                            removed by the server under the service role (/api/people/[id]/avatar)

-- ---------------------------------------------------------------------------
-- 1. The phone
-- ---------------------------------------------------------------------------
create table profile_phones (
  user_id    uuid primary key references profiles on delete cascade,
  company_id uuid not null references companies,
  phone      text not null check (
    phone ~ '^\+?[0-9() .-]{5,32}$' and length(regexp_replace(phone, '[^0-9]', '', 'g')) >= 5
  )
);

create index profile_phones_company on profile_phones (company_id);

comment on table profile_phones is
  'as typed; soft format only (lib/people/phone.ts says the same). Not on profiles: every employee reads that table.';

alter table profile_phones enable row level security;

create policy profile_phones_select on profile_phones for select using (
  company_id = auth_company_id()
  and (auth_role() in ('director', 'secretary') or user_id = auth.uid())
);

-- the same reach as profiles_guard: the director — any card, the secretary — any but a director's
create policy profile_phones_write on profile_phones for all
using (
  company_id = auth_company_id()
  and exists (
    select 1 from profiles p
     where p.id = user_id
       and p.company_id = auth_company_id()
       and (auth_role() = 'director' or (auth_role() = 'secretary' and p.role <> 'director'))
  )
)
with check (
  company_id = auth_company_id()
  and exists (
    select 1 from profiles p
     where p.id = user_id
       and p.company_id = auth_company_id()
       and (auth_role() = 'director' or (auth_role() = 'secretary' and p.role <> 'director'))
  )
);

-- ---------------------------------------------------------------------------
-- 2. profiles_guard: the secretary_admin version, plus the card's photo
-- ---------------------------------------------------------------------------
create or replace function profiles_guard() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_role text;
begin
  if auth.uid() is null then
    return new;                                            -- service role / cron
  end if;

  v_role := auth_role();
  if v_role = 'director' then
    return new;
  end if;

  -- the secretary manages the roster: role, activity and manager of anyone but a
  -- director; nobody becomes a director by her hand
  if v_role = 'secretary' and old.id <> auth.uid() then
    if old.role = 'director'
       or new.role = 'director'
       or new.company_id        is distinct from old.company_id
       or new.streak_count      is distinct from old.streak_count
       or new.streak_updated_at is distinct from old.streak_updated_at then
      raise exception 'forbidden_field_update' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if new.role              is distinct from old.role
     or new.company_id     is distinct from old.company_id
     or new.is_active      is distinct from old.is_active
     or new.manager_id     is distinct from old.manager_id
     or new.streak_count   is distinct from old.streak_count
     or new.streak_updated_at is distinct from old.streak_updated_at then
    raise exception 'forbidden_field_update' using errcode = 'P0001';
  end if;

  -- the secretary keeps her own card too (canEditPerson); an employee does not put a picture of
  -- their choosing on the wall through their own row
  if v_role is distinct from 'secretary' and new.avatar_url is distinct from old.avatar_url then
    raise exception 'forbidden_field_update' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. One request, one card
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists client_request_id uuid;

create unique index if not exists profiles_client_request
  on profiles (company_id, client_request_id)
  where client_request_id is not null;

-- ---------------------------------------------------------------------------
-- 4. The photos
-- ---------------------------------------------------------------------------
-- 1 MB: the client sends a 512 px JPEG, the limit is for whoever skips the client
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict do nothing;

-- {company_id}/{file}: exactly one folder, and it is the writer's own company
create policy avatars_insert_roster on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and public.auth_role() in ('director', 'secretary')
  and array_length(storage.foldername(name), 1) = 1
  and (storage.foldername(name))[1] = public.auth_company_id()::text
);
