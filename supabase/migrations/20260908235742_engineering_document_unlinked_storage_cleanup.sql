-- Allow the existing upload-compensation path to remove only an unlinked
-- Engineering Documents object.  Committed revision objects remain immutable:
-- the policy rejects any object whose revision id or file path is present in
-- engineering_document_revisions. Cleanup is additionally limited to the
-- authenticated user that uploaded the temporary object so another creator in
-- the same company cannot delete a concurrent in-flight upload.

create or replace function private.engineering_document_storage_object_is_unlinked(
  p_company_id uuid,
  p_name text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and p_company_id is not null
    and p_name ~* '^companies/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/documents/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/revisions/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]+\.pdf$'
    and private.storage_company_id(p_name) = p_company_id
    and (
      (select public.has_company_permission(p_company_id, 'engineering.documents.create'))
      or (select public.has_company_permission(p_company_id, 'engineering.documents.manage'))
    )
    and not exists (
      select 1
      from public.engineering_document_revisions r
      where r.company_id = p_company_id
        and (
          r.file_path = p_name
          or r.id::text = split_part(p_name, '/', 6)
        )
    );
$$;

revoke execute on function private.engineering_document_storage_object_is_unlinked(uuid, text) from public, anon;
grant execute on function private.engineering_document_storage_object_is_unlinked(uuid, text) to authenticated;

drop policy if exists "company engineering documents cleanup unlinked" on storage.objects;
create policy "company engineering documents cleanup unlinked" on storage.objects
for delete to authenticated
using (
  bucket_id = 'engineering-documents'
  and owner_id = (select auth.uid()::text)
  and name ~* '^companies/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/documents/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/revisions/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]+\.pdf$'
  and private.storage_company_id(name) is not null
  and (
    (select public.has_company_permission(private.storage_company_id(name), 'engineering.documents.create'))
    or (select public.has_company_permission(private.storage_company_id(name), 'engineering.documents.manage'))
  )
  and (select private.engineering_document_storage_object_is_unlinked(private.storage_company_id(name), name))
);
