-- «Лаборатория» and «Данные» are the developers' tools: hidden from clients (owner, 2026-11-04).
--   1. settings.dev_tools opens them. The companies that exist today keep them (the pilot and dev,
--      so the owner does not lose his bench); a new client has no key, which reads as closed.
--   2. A company cannot open them for itself. /api/settings refuses the key (a strict schema), but
--      update_company_settings is granted to authenticated and PostgREST calls it directly, so it
--      drops the key too. It also cannot lose the flag: the merge is shallow and it stays in the
--      row. The service role writes it (this migration, a support script).
-- update_company_settings is the 20260924100000_secretary_admin.sql version except for the merge.
-- The signature stays, so `create or replace` keeps the grants.

update companies set settings = settings || '{"dev_tools": true}'::jsonb;

create or replace function update_company_settings(patch jsonb) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_company  uuid := auth_company_id();
  v_settings jsonb;
begin
  if coalesce(auth_role(), '') not in ('director', 'secretary') then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  update companies c set settings = c.settings || (coalesce(patch, '{}'::jsonb) - 'dev_tools')
   where c.id = v_company
  returning c.settings into v_settings;
  return coalesce(v_settings, '{}'::jsonb);
end;
$fn$;
