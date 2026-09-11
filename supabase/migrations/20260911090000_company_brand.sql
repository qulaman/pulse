-- Company profile for the director (D-44, docs/DESIGN.md §"Кастомизация"): the name,
-- a logo in the header and on the login screen, an optional accent. Brand fields live
-- in company.settings.brand (update_company_settings merges the section); the name
-- is a column and gets its own director-only RPC.

create or replace function update_company_profile(p_name text) returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_company uuid := auth_company_id();
  v_name    text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if auth_role() is distinct from 'director' then
    raise exception 'forbidden' using errcode = 'P0001';
  end if;
  if v_name is null or length(v_name) > 120 then
    raise exception 'invalid_name' using errcode = 'P0001';
  end if;
  update companies set name = v_name where id = v_company;
  return jsonb_build_object('name', v_name);
end;
$fn$;

revoke execute on function update_company_profile(text) from public, anon;
grant execute on function update_company_profile(text) to authenticated, service_role;

-- Logos: public bucket (the login screen shows it before anyone signs in),
-- path {company_id}/logo-{stamp}.ext, written by the server with the service role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand', 'brand', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict do nothing;

create policy brand_public_read on storage.objects for select to anon, authenticated
using (bucket_id = 'brand');
