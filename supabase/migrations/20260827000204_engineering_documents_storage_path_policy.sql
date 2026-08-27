-- Phase 1A additive hardening: Storage accepts only the immutable revision
-- object layout. The metadata RPC still binds the document and revision in
-- Postgres after the upload completes.

drop policy if exists "company engineering documents insert" on storage.objects;
create policy "company engineering documents insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'engineering-documents'
  and name ~* '^companies/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/documents/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/revisions/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]+\.pdf$'
  and private.storage_company_id(name) is not null
  and (
    (select public.has_company_permission(private.storage_company_id(name), 'engineering.documents.create'))
    or (select public.has_company_permission(private.storage_company_id(name), 'engineering.documents.manage'))
  )
);
