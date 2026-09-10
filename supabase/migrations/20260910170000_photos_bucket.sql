-- Photos in task reports (docs/CONCEPT.md: «сфотографировал — отправил»).
-- Private bucket `photos`, path {company_id}/{owner_id}/{uuid}.ext — the same
-- ownership shape as `voice`; anybody else sees the object only through a
-- server-issued signed URL after the task_messages RLS said yes (D-18).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict do nothing;

create policy photos_insert_own on storage.objects for insert to authenticated
with check (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = public.auth_company_id()::text
  and (storage.foldername(name))[2] = auth.uid()::text
);

create policy photos_select_own on storage.objects for select to authenticated
using (
  bucket_id = 'photos'
  and (storage.foldername(name))[1] = public.auth_company_id()::text
  and (storage.foldername(name))[2] = auth.uid()::text
);

-- update/delete: no policies (a report is evidence; retention is cron's job)
