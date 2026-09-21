do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'managed_documents') then
    raise exception 'managed_documents table missing after additive upgrade';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'managed_document_versions') then
    raise exception 'managed_document_versions table missing after additive upgrade';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'document_artifact_registrations') then
    raise exception 'document_artifact_registrations table missing after additive upgrade';
  end if;
  if not exists (select 1 from public.company_permission_catalog where permission_key = 'documents.read') then
    raise exception 'documents.read permission missing after additive upgrade';
  end if;
  if not exists (select 1 from public.company_permission_catalog where permission_key = 'documents.manage') then
    raise exception 'documents.manage permission missing after additive upgrade';
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.server_create_managed_document_with_version(jsonb,uuid)'::regprocedure) then
    raise exception 'managed document create server wrapper missing after additive upgrade';
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.server_create_managed_document_version(jsonb,uuid)'::regprocedure) then
    raise exception 'managed document version server wrapper missing after additive upgrade';
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.server_archive_managed_document(uuid,timestamptz,text,uuid)'::regprocedure) then
    raise exception 'managed document archive server wrapper missing after additive upgrade';
  end if;
  if not exists (select 1 from storage.buckets where id = 'company-managed-documents' and public = false) then
    raise exception 'private managed document Storage bucket missing after additive upgrade';
  end if;
end $$;
