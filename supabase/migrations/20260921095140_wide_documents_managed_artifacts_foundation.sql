-- Wide Documents: company-scoped standalone documents, immutable versions,
-- and a provenance-only retained generated-artifact index.
--
-- The managed layer owns only standalone document identity and file history.
-- Existing Purchase Orders, Client Invoices, reports, templates, source
-- documents, delivery history, and all financial/workflow state remain owned by
-- their existing domains.

insert into public.company_permission_catalog (permission_key, description)
values
  ('documents.read', 'Read standalone company documents and authorized retained artifacts.'),
  ('documents.manage', 'Create, version, and archive standalone company documents.')
on conflict (permission_key) do update set description = excluded.description;

insert into public.company_role_permissions (role_key, permission_key)
values
  ('COMPANY_ADMIN', 'documents.read'),
  ('COMPANY_ADMIN', 'documents.manage'),
  ('FINANCE', 'documents.read'),
  ('FINANCE', 'documents.manage'),
  ('VIEWER', 'documents.read')
on conflict do nothing;

create table if not exists public.managed_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  project_id uuid,
  title text not null,
  description text,
  category text not null check (category in ('WARRANTY_CERTIFICATE', 'EQUIPMENT_MATERIALS_CHECKLIST', 'GENERAL_UPLOAD', 'GENERATED_DOCUMENT', 'GENERATED_ARTIFACT')),
  origin text not null check (origin in ('MANUAL_UPLOAD', 'GENERATED_DOCUMENT', 'GENERATED_ARTIFACT')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
  current_version_id uuid,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_by_user_id uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  archive_reason text,
  constraint managed_documents_company_id_id_key unique (company_id, id),
  constraint managed_documents_title_check check (length(btrim(title)) between 1 and 200),
  constraint managed_documents_description_check check (description is null or length(description) <= 4000),
  constraint managed_documents_archive_check check (
    (status = 'ACTIVE' and archived_at is null and archived_by_user_id is null)
    or (status = 'ARCHIVED' and archived_at is not null)
  )
);

create table if not exists public.managed_document_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  document_id uuid not null,
  version_number integer not null check (version_number > 0),
  source_origin text not null check (source_origin in ('MANUAL_UPLOAD', 'GENERATED_DOCUMENT', 'GENERATED_ARTIFACT')),
  original_filename text not null check (original_filename ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$'),
  mime_type text not null check (length(btrim(mime_type)) between 1 and 160),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  storage_provider text not null default 'supabase' check (storage_provider in ('supabase', 's3', 'gcs', 'memory', 'custom')),
  storage_bucket text not null check (length(btrim(storage_bucket)) between 1 and 120),
  storage_path text not null check (storage_path like 'companies/%'),
  sha256 text not null check (sha256 ~ '^[0-9a-fA-F]{64}$'),
  template_version_id uuid,
  uploaded_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint managed_document_versions_company_id_id_key unique (company_id, id),
  constraint managed_document_versions_document_fk
    foreign key (company_id, document_id)
    references public.managed_documents(company_id, id)
    on delete restrict,
  constraint managed_document_versions_template_fk
    foreign key (template_version_id, company_id)
    references public.document_template_versions(id, company_id)
    on delete restrict,
  constraint managed_document_versions_number_unique unique (company_id, document_id, version_number)
);

alter table public.managed_documents
  drop constraint if exists managed_documents_current_version_fk;
alter table public.managed_documents
  add constraint managed_documents_current_version_fk
    foreign key (company_id, current_version_id)
    references public.managed_document_versions(company_id, id)
    on delete restrict;

alter table public.managed_documents
  drop constraint if exists managed_documents_project_fk;
alter table public.managed_documents
  add constraint managed_documents_project_fk
    foreign key (company_id, project_id)
    references public.projects(company_id, id)
    on delete restrict;

create table if not exists public.document_artifact_registrations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  managed_document_id uuid not null,
  managed_version_id uuid not null,
  source_domain text not null check (source_domain in ('PURCHASE_ORDER', 'CLIENT_INVOICE', 'PROJECT', 'REPORT', 'DOCUMENT_TEMPLATE', 'GENERAL')),
  source_type text not null check (length(btrim(source_type)) between 1 and 120),
  source_record_id uuid,
  source_record_reference text,
  artifact_type text not null check (artifact_type in ('DOCX', 'PDF', 'XLSX', 'CSV', 'OTHER')),
  display_name text not null check (length(btrim(display_name)) between 1 and 200),
  template_version_id uuid,
  template_content_sha256 text check (template_content_sha256 is null or template_content_sha256 ~ '^[0-9a-fA-F]{64}$'),
  source_artifact_version_id uuid,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint document_artifact_registrations_document_fk
    foreign key (company_id, managed_document_id)
    references public.managed_documents(company_id, id)
    on delete restrict,
  constraint document_artifact_registrations_version_fk
    foreign key (company_id, managed_version_id)
    references public.managed_document_versions(company_id, id)
    on delete restrict,
  constraint document_artifact_registrations_template_fk
    foreign key (template_version_id, company_id)
    references public.document_template_versions(id, company_id)
    on delete restrict,
  constraint document_artifact_registrations_source_version_fk
    foreign key (company_id, source_artifact_version_id)
    references public.managed_document_versions(company_id, id)
    on delete restrict,
  constraint document_artifact_registrations_source_reference_check
    check (source_record_reference is null or length(btrim(source_record_reference)) between 1 and 255),
  constraint document_artifact_registrations_version_unique unique (company_id, managed_version_id)
);

create index if not exists managed_documents_company_status_updated_idx
  on public.managed_documents(company_id, status, updated_at desc);
create index if not exists managed_documents_company_project_updated_idx
  on public.managed_documents(company_id, project_id, updated_at desc)
  where project_id is not null;
create index if not exists managed_document_versions_company_document_created_idx
  on public.managed_document_versions(company_id, document_id, version_number desc, created_at desc);
create index if not exists document_artifact_registrations_company_source_idx
  on public.document_artifact_registrations(company_id, source_domain, source_type, source_record_id, created_at desc);
create index if not exists document_artifact_registrations_company_document_idx
  on public.document_artifact_registrations(company_id, managed_document_id, created_at desc);

insert into storage.buckets (id, name, public, file_size_limit)
values ('company-managed-documents', 'company-managed-documents', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

create or replace function private.document_artifact_read_permission(p_source_domain text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case upper(coalesce(p_source_domain, ''))
    when 'PURCHASE_ORDER' then 'procurement.read'
    when 'CLIENT_INVOICE' then 'projects.read'
    when 'PROJECT' then 'projects.read'
    when 'REPORT' then 'reports.financial.read'
    when 'DOCUMENT_TEMPLATE' then 'company.settings.read'
    else 'documents.read'
  end;
$$;

create or replace function private.can_read_document_artifact(p_company_id uuid, p_source_domain text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_permission text;
begin
  if (select auth.uid()) is null
     or p_company_id is null
     or p_company_id is distinct from (select private.deployment_company_id()) then
    return false;
  end if;
  v_permission := private.document_artifact_read_permission(p_source_domain);
  return private.has_company_permission(p_company_id, v_permission)
    or (upper(coalesce(p_source_domain, '')) = 'GENERAL' and private.has_company_permission(p_company_id, 'documents.manage'));
end;
$$;

create or replace function private.can_read_managed_document(p_company_id uuid, p_document_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or p_company_id is null
     or p_company_id is distinct from (select private.deployment_company_id()) then
    return false;
  end if;
  if exists (
    select 1
    from public.document_artifact_registrations r
    where r.company_id = p_company_id
      and r.managed_document_id = p_document_id
  ) then
    return exists (
      select 1
      from public.document_artifact_registrations r
      where r.company_id = p_company_id
        and r.managed_document_id = p_document_id
        and private.can_read_document_artifact(r.company_id, r.source_domain)
    );
  end if;
  return private.has_company_permission(p_company_id, 'documents.read')
    or private.has_company_permission(p_company_id, 'documents.manage');
end;
$$;

create or replace function private.can_read_managed_storage_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $
  select exists (
    select 1
    from public.managed_document_versions v
    where v.storage_provider = 'supabase'
      and v.storage_bucket = 'company-managed-documents'
      and v.storage_path = p_name
      and private.can_read_managed_document(v.company_id, v.document_id)
  );
$;

revoke execute on function private.document_artifact_read_permission(text) from public, anon;
revoke execute on function private.can_read_document_artifact(uuid, text) from public, anon;
revoke execute on function private.can_read_managed_document(uuid, uuid) from public, anon;
revoke execute on function private.can_read_managed_storage_object(text) from public, anon;
grant execute on function private.document_artifact_read_permission(text) to authenticated, service_role;
grant execute on function private.can_read_document_artifact(uuid, text) to authenticated, service_role;
grant execute on function private.can_read_managed_document(uuid, uuid) to authenticated, service_role;
grant execute on function private.can_read_managed_storage_object(text) to authenticated, service_role;

alter table public.managed_documents enable row level security;
alter table public.managed_document_versions enable row level security;
alter table public.document_artifact_registrations enable row level security;

drop policy if exists managed_documents_select on public.managed_documents;
create policy managed_documents_select on public.managed_documents
for select to authenticated
using ((select private.can_read_managed_document(company_id, id)));

drop policy if exists managed_document_versions_select on public.managed_document_versions;
create policy managed_document_versions_select on public.managed_document_versions
for select to authenticated
using ((select private.can_read_managed_document(company_id, document_id)));

drop policy if exists document_artifact_registrations_select on public.document_artifact_registrations;
create policy document_artifact_registrations_select on public.document_artifact_registrations
for select to authenticated
using ((select private.can_read_document_artifact(company_id, source_domain)));

revoke all on table public.managed_documents, public.managed_document_versions, public.document_artifact_registrations from public, anon, authenticated;
grant select on table public.managed_documents, public.managed_document_versions, public.document_artifact_registrations to authenticated;

drop policy if exists "company managed documents read" on storage.objects;
create policy "company managed documents read" on storage.objects
for select to authenticated
using (
  bucket_id = 'company-managed-documents'
  and name ~* '^companies/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/managed-documents/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/versions/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9._-]+$'
  and private.storage_company_id(name) is not null
  and (select private.can_read_managed_storage_object(name))
);
drop policy if exists "company managed documents insert" on storage.objects;
drop policy if exists "company managed documents update" on storage.objects;
drop policy if exists "company managed documents delete" on storage.objects;

create or replace function private.validate_managed_document_row()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Managed document must belong to the deployment company' using errcode = '42501';
  end if;
  if new.project_id is not null and not exists (
    select 1 from public.projects p
    where p.company_id = new.company_id and p.id = new.project_id
  ) then
    raise exception 'Managed document project is outside the company' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if old.id is distinct from new.id
      or old.company_id is distinct from new.company_id
      or old.title is distinct from new.title
      or old.description is distinct from new.description
      or old.category is distinct from new.category
      or old.origin is distinct from new.origin
      or old.project_id is distinct from new.project_id
      or old.created_by_user_id is distinct from new.created_by_user_id
      or old.created_at is distinct from new.created_at then
      raise exception 'Managed document identity is immutable after creation' using errcode = '42501';
    end if;
    if old.status = 'ARCHIVED' and new.status <> 'ARCHIVED' then
      raise exception 'Archived managed documents cannot be reactivated' using errcode = '42501';
    end if;
  end if;
  if new.current_version_id is not null and not exists (
    select 1 from public.managed_document_versions v
    where v.company_id = new.company_id and v.id = new.current_version_id and v.document_id = new.id
  ) then
    raise exception 'Managed document current version does not belong to the document' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function private.prevent_managed_document_version_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Managed document versions are retained and cannot be deleted' using errcode = '42501';
  end if;
  if old.id is distinct from new.id
    or old.company_id is distinct from new.company_id
    or old.document_id is distinct from new.document_id
    or old.version_number is distinct from new.version_number
    or old.source_origin is distinct from new.source_origin
    or old.original_filename is distinct from new.original_filename
    or old.mime_type is distinct from new.mime_type
    or old.size_bytes is distinct from new.size_bytes
    or old.storage_provider is distinct from new.storage_provider
    or old.storage_bucket is distinct from new.storage_bucket
    or old.storage_path is distinct from new.storage_path
    or old.sha256 is distinct from new.sha256
    or old.template_version_id is distinct from new.template_version_id
    or old.uploaded_by_user_id is distinct from new.uploaded_by_user_id
    or old.created_at is distinct from new.created_at then
    raise exception 'Managed document version content and identity are immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.prevent_document_artifact_registration_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Retained artifact registrations are immutable' using errcode = '42501';
end;
$$;

drop trigger if exists managed_documents_company_boundary on public.managed_documents;
create trigger managed_documents_company_boundary
before insert or update on public.managed_documents
for each row execute function private.validate_managed_document_row();
drop trigger if exists managed_document_versions_no_mutation on public.managed_document_versions;
create trigger managed_document_versions_no_mutation
before update or delete on public.managed_document_versions
for each row execute function private.prevent_managed_document_version_mutation();
drop trigger if exists document_artifact_registrations_no_mutation on public.document_artifact_registrations;
create trigger document_artifact_registrations_no_mutation
before update or delete on public.document_artifact_registrations
for each row execute function private.prevent_document_artifact_registration_mutation();

create or replace function private.managed_document_actor(p_company_id uuid, p_permission text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null
     or p_company_id is null
     or p_company_id is distinct from (select private.deployment_company_id())
     or not exists (
       select 1 from public.company_members m
       where m.company_id = p_company_id and m.user_id = v_actor and m.status = 'ACTIVE'
     )
     or not private.has_company_permission(p_company_id, p_permission) then
    raise exception 'Managed document permission denied' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

create or replace function private.register_managed_document_artifact_internal(
  p_company_id uuid,
  p_actor_user_id uuid,
  p_document_id uuid,
  p_version_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_origin text,
  p_project_id uuid,
  p_source_origin text,
  p_original_filename text,
  p_mime_type text,
  p_size_bytes bigint,
  p_storage_provider text,
  p_storage_bucket text,
  p_storage_path text,
  p_sha256 text,
  p_source_domain text,
  p_source_type text,
  p_source_record_id uuid,
  p_source_record_reference text,
  p_artifact_type text,
  p_template_version_id uuid,
  p_template_content_sha256 text,
  p_source_artifact_version_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.managed_documents;
  v_version public.managed_document_versions;
  v_registration public.document_artifact_registrations;
begin
  if p_company_id is null or p_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Managed artifact must belong to the deployment company' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.company_members m
    where m.company_id = p_company_id and m.user_id = p_actor_user_id and m.status = 'ACTIVE'
  ) then
    raise exception 'Managed artifact actor is not an active company member' using errcode = '42501';
  end if;
  if p_title is null or length(btrim(p_title)) not between 1 and 200
     or p_category not in ('WARRANTY_CERTIFICATE', 'EQUIPMENT_MATERIALS_CHECKLIST', 'GENERAL_UPLOAD', 'GENERATED_DOCUMENT', 'GENERATED_ARTIFACT')
     or p_origin not in ('MANUAL_UPLOAD', 'GENERATED_DOCUMENT', 'GENERATED_ARTIFACT')
     or p_source_origin not in ('MANUAL_UPLOAD', 'GENERATED_DOCUMENT', 'GENERATED_ARTIFACT')
     or p_artifact_type not in ('DOCX', 'PDF', 'XLSX', 'CSV', 'OTHER')
     or p_original_filename !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$'
     or p_mime_type is null or length(btrim(p_mime_type)) > 160
     or p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 26214400
     or p_storage_provider not in ('supabase', 's3', 'gcs', 'memory', 'custom')
     or p_storage_bucket is null or length(btrim(p_storage_bucket)) > 120
     or p_storage_path is null or p_storage_path not like 'companies/%'
     or p_sha256 !~ '^[0-9a-fA-F]{64}$'
     or p_source_domain not in ('PURCHASE_ORDER', 'CLIENT_INVOICE', 'PROJECT', 'REPORT', 'DOCUMENT_TEMPLATE', 'GENERAL')
     or p_source_type is null or length(btrim(p_source_type)) > 120
     or (p_template_content_sha256 is not null and p_template_content_sha256 !~ '^[0-9a-fA-F]{64}$') then
    raise exception 'Managed artifact metadata is invalid' using errcode = '22023';
  end if;
  if p_project_id is not null and not exists (
    select 1 from public.projects p where p.company_id = p_company_id and p.id = p_project_id
  ) then
    raise exception 'Managed artifact project is outside the company' using errcode = '42501';
  end if;
  if p_template_version_id is not null and not exists (
    select 1 from public.document_template_versions v
    where v.company_id = p_company_id and v.id = p_template_version_id
  ) then
    raise exception 'Managed artifact template version is outside the company' using errcode = '42501';
  end if;

  insert into public.managed_documents (
    id, company_id, project_id, title, description, category, origin,
    status, created_by_user_id
  ) values (
    p_document_id, p_company_id, p_project_id, btrim(p_title), nullif(btrim(p_description), ''),
    p_category, p_origin, 'ACTIVE', p_actor_user_id
  ) on conflict (company_id, id) do nothing;

  select d.* into v_document
  from public.managed_documents d
  where d.company_id = p_company_id and d.id = p_document_id
  for update;
  if not found then
    raise exception 'Managed artifact document could not be created' using errcode = '22023';
  end if;

  insert into public.managed_document_versions (
    id, company_id, document_id, version_number, source_origin, original_filename,
    mime_type, size_bytes, storage_provider, storage_bucket, storage_path, sha256,
    template_version_id, uploaded_by_user_id
  ) values (
    p_version_id, p_company_id, p_document_id,
    coalesce((select max(version_number) + 1 from public.managed_document_versions v where v.company_id = p_company_id and v.document_id = p_document_id), 1),
    p_source_origin, p_original_filename, p_mime_type, p_size_bytes, p_storage_provider,
    p_storage_bucket, p_storage_path, lower(p_sha256), p_template_version_id, p_actor_user_id
  ) on conflict (company_id, id) do nothing;

  select v.* into v_version
  from public.managed_document_versions v
  where v.company_id = p_company_id and v.id = p_version_id;
  if not found then
    raise exception 'Managed artifact version could not be created' using errcode = '22023';
  end if;

  update public.managed_documents
  set current_version_id = v_version.id, updated_at = now()
  where company_id = p_company_id and id = p_document_id;

  select d.* into v_document
  from public.managed_documents d
  where d.company_id = p_company_id and d.id = p_document_id;

  if p_origin <> 'MANUAL_UPLOAD' then
    insert into public.document_artifact_registrations (
      company_id, managed_document_id, managed_version_id, source_domain, source_type,
      source_record_id, source_record_reference, artifact_type, display_name,
      template_version_id, template_content_sha256, source_artifact_version_id,
      created_by_user_id
    ) values (
      p_company_id, p_document_id, v_version.id, p_source_domain, p_source_type,
      p_source_record_id, nullif(btrim(p_source_record_reference), ''), p_artifact_type,
      btrim(p_title), p_template_version_id, nullif(lower(p_template_content_sha256), ''),
      p_source_artifact_version_id, p_actor_user_id
    ) on conflict (company_id, managed_version_id) do nothing;
  end if;

  if p_origin = 'MANUAL_UPLOAD' then
    return jsonb_build_object('document', to_jsonb(v_document), 'version', to_jsonb(v_version));
  end if;
  select r.* into v_registration
  from public.document_artifact_registrations r
  where r.company_id = p_company_id and r.managed_version_id = v_version.id;
  return jsonb_build_object('document', to_jsonb(v_document), 'version', to_jsonb(v_version), 'artifact', to_jsonb(v_registration));
end;
$$;

create or replace function public.create_managed_document_with_version(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.managed_document_actor(nullif(btrim(coalesce(p_payload->>'companyId', '')), '')::uuid, 'documents.manage');
  v_company_id uuid := nullif(btrim(coalesce(p_payload->>'companyId', '')), '')::uuid;
  v_document_id uuid := coalesce(nullif(btrim(coalesce(p_payload->>'documentId', '')), '')::uuid, gen_random_uuid());
  v_version_id uuid := coalesce(nullif(btrim(coalesce(p_payload->>'versionId', '')), '')::uuid, gen_random_uuid());
  v_project_id uuid := nullif(btrim(coalesce(p_payload->>'projectId', '')), '')::uuid;
  v_title text := nullif(left(btrim(coalesce(p_payload->>'title', '')), 200), '');
  v_description text := nullif(left(btrim(coalesce(p_payload->>'description', '')), 4000), '');
  v_filename text := btrim(coalesce(p_payload->>'fileName', ''));
  v_mime text := lower(btrim(coalesce(p_payload->>'mimeType', '')));
  v_provider text := lower(btrim(coalesce(p_payload->>'storageProvider', 'supabase')));
  v_bucket text := left(btrim(coalesce(p_payload->>'storageBucket', '')), 120);
  v_path text := btrim(coalesce(p_payload->>'storagePath', ''));
  v_hash text := lower(btrim(coalesce(p_payload->>'sha256', '')));
  v_size bigint := nullif(p_payload->>'sizeBytes', '')::bigint;
begin
  if v_project_id is not null and not private.has_company_permission(v_company_id, 'projects.read') then
    raise exception 'Project-linked managed documents require project read permission' using errcode = '42501';
  end if;
  if v_title is null or v_filename !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$'
     or v_path is distinct from format('companies/%s/managed-documents/%s/versions/%s/%s', v_company_id, v_document_id, v_version_id, v_filename)
     or v_mime is null or v_size is null or v_hash !~ '^[0-9a-f]{64}$'
     or v_provider not in ('supabase', 's3', 'gcs', 'memory', 'custom')
     or v_bucket = '' or v_size <= 0 or v_size > 10485760 then
    raise exception 'Managed document upload metadata is invalid' using errcode = '22023';
  end if;
  return private.register_managed_document_artifact_internal(
    v_company_id, v_actor, v_document_id, v_version_id, v_title, v_description,
    upper(coalesce(nullif(btrim(p_payload->>'category'), ''), 'GENERAL_UPLOAD')), 'MANUAL_UPLOAD', v_project_id,
    'MANUAL_UPLOAD', v_filename, v_mime, v_size, v_provider, v_bucket, v_path, v_hash,
    'GENERAL', 'MANUAL_UPLOAD', null, null, 'OTHER', null, null, null
  ) - 'artifact';
end;
$$;

create or replace function public.create_managed_document_version(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.managed_document_actor(nullif(btrim(coalesce(p_payload->>'companyId', '')), '')::uuid, 'documents.manage');
  v_company_id uuid := nullif(btrim(coalesce(p_payload->>'companyId', '')), '')::uuid;
  v_document_id uuid := nullif(btrim(coalesce(p_payload->>'documentId', '')), '')::uuid;
  v_version_id uuid := coalesce(nullif(btrim(coalesce(p_payload->>'versionId', '')), '')::uuid, gen_random_uuid());
  v_expected_updated_at timestamptz := nullif(btrim(coalesce(p_payload->>'expectedUpdatedAt', '')), '')::timestamptz;
  v_filename text := btrim(coalesce(p_payload->>'fileName', ''));
  v_mime text := lower(btrim(coalesce(p_payload->>'mimeType', '')));
  v_provider text := lower(btrim(coalesce(p_payload->>'storageProvider', 'supabase')));
  v_bucket text := left(btrim(coalesce(p_payload->>'storageBucket', '')), 120);
  v_path text := btrim(coalesce(p_payload->>'storagePath', ''));
  v_hash text := lower(btrim(coalesce(p_payload->>'sha256', '')));
  v_size bigint := nullif(p_payload->>'sizeBytes', '')::bigint;
  v_document public.managed_documents;
  v_version public.managed_document_versions;
begin
  select d.* into v_document from public.managed_documents d where d.company_id = v_company_id and d.id = v_document_id for update;
  if not found then raise exception 'Managed document was not found in this company' using errcode = '40400'; end if;
  if v_document.status <> 'ACTIVE' then raise exception 'Archived managed documents cannot receive new versions' using errcode = '40900'; end if;
  if v_expected_updated_at is null or v_document.updated_at is distinct from v_expected_updated_at then
    raise exception 'EXPECTED_VERSION_MISMATCH' using errcode = '40001';
  end if;
  if v_filename !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$'
     or v_path is distinct from format('companies/%s/managed-documents/%s/versions/%s/%s', v_company_id, v_document_id, v_version_id, v_filename)
     or v_mime = '' or v_size is null or v_hash !~ '^[0-9a-f]{64}$'
     or v_provider not in ('supabase', 's3', 'gcs', 'memory', 'custom')
     or v_bucket = '' or v_size <= 0 or v_size > 10485760 then
    raise exception 'Managed document version metadata is invalid' using errcode = '22023';
  end if;
  insert into public.managed_document_versions (
    id, company_id, document_id, version_number, source_origin, original_filename,
    mime_type, size_bytes, storage_provider, storage_bucket, storage_path, sha256,
    uploaded_by_user_id
  ) values (
    v_version_id, v_company_id, v_document_id,
    coalesce((select max(version_number) + 1 from public.managed_document_versions where company_id = v_company_id and document_id = v_document_id), 1),
    'MANUAL_UPLOAD', v_filename, v_mime, v_size, v_provider, v_bucket, v_path, v_hash, v_actor
  ) returning * into v_version;
  update public.managed_documents set current_version_id = v_version.id, updated_at = now() where company_id = v_company_id and id = v_document_id;
  select d.* into v_document from public.managed_documents d where d.company_id = v_company_id and d.id = v_document_id;
  return jsonb_build_object('document', to_jsonb(v_document), 'version', to_jsonb(v_version));
end;
$$;

create or replace function public.archive_managed_document(p_document_id uuid, p_expected_updated_at timestamptz, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := (select private.deployment_company_id());
  v_actor uuid := private.managed_document_actor(v_company_id, 'documents.manage');
  v_document public.managed_documents;
begin
  select d.* into v_document from public.managed_documents d where d.company_id = v_company_id and d.id = p_document_id for update;
  if not found then raise exception 'Managed document was not found in this company' using errcode = '40400'; end if;
  if p_expected_updated_at is null or v_document.updated_at is distinct from p_expected_updated_at then
    raise exception 'EXPECTED_VERSION_MISMATCH' using errcode = '40001';
  end if;
  if v_document.status = 'ARCHIVED' then return to_jsonb(v_document); end if;
  update public.managed_documents
  set status = 'ARCHIVED', archived_at = now(), archived_by_user_id = v_actor,
      archive_reason = nullif(left(btrim(p_reason), 1000), ''), updated_at = now()
  where company_id = v_company_id and id = p_document_id
  returning * into v_document;
  return to_jsonb(v_document);
end;
$$;

create or replace function public.register_generated_document_artifact(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := nullif(btrim(coalesce(p_payload->>'companyId', '')), '')::uuid;
  v_source_domain text := upper(btrim(coalesce(p_payload->>'sourceDomain', 'GENERAL')));
  v_permission text := private.document_artifact_read_permission(v_source_domain);
  v_actor uuid := private.managed_document_actor(v_company_id, v_permission);
  v_document_id uuid := coalesce(nullif(btrim(coalesce(p_payload->>'documentId', '')), '')::uuid, gen_random_uuid());
  v_version_id uuid := coalesce(nullif(btrim(coalesce(p_payload->>'versionId', '')), '')::uuid, gen_random_uuid());
  v_filename text := btrim(coalesce(p_payload->>'fileName', ''));
  v_path text := btrim(coalesce(p_payload->>'storagePath', ''));
  v_category text := upper(btrim(coalesce(p_payload->>'category', 'GENERATED_DOCUMENT')));
  v_origin text := upper(btrim(coalesce(p_payload->>'origin', 'GENERATED_DOCUMENT')));
  v_project_id uuid := nullif(btrim(coalesce(p_payload->>'projectId', '')), '')::uuid;
  v_source_record_id uuid := nullif(btrim(coalesce(p_payload->>'sourceRecordId', '')), '')::uuid;
  v_source_type text := btrim(coalesce(p_payload->>'sourceType', v_source_domain));
  v_artifact_type text := upper(btrim(coalesce(p_payload->>'artifactType', 'DOCX')));
  v_template_version_id uuid := nullif(btrim(coalesce(p_payload->>'templateVersionId', '')), '')::uuid;
  v_template_hash text := nullif(lower(btrim(coalesce(p_payload->>'templateContentSha256', ''))), '');
  v_mime text := lower(btrim(coalesce(p_payload->>'mimeType', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')));
  v_provider text := lower(btrim(coalesce(p_payload->>'storageProvider', 'supabase')));
  v_bucket text := left(btrim(coalesce(p_payload->>'storageBucket', '')), 120);
  v_hash text := lower(btrim(coalesce(p_payload->>'sha256', '')));
  v_size bigint := nullif(p_payload->>'sizeBytes', '')::bigint;
begin
  if v_source_domain = 'PROJECT' and not private.has_company_permission(v_company_id, 'projects.read') then
    raise exception 'Project-generated artifacts require project read permission' using errcode = '42501';
  end if;
  if v_source_domain = 'GENERAL' and not private.has_company_permission(v_company_id, 'company.settings.read') then
    raise exception 'General generated artifacts require company settings read permission' using errcode = '42501';
  end if;
  if v_source_record_id is not null and v_source_domain = 'PROJECT' and not exists (
    select 1 from public.projects p where p.company_id = v_company_id and p.id = v_source_record_id
  ) then
    raise exception 'Generated artifact project source is outside the company' using errcode = '42501';
  end if;
  if v_path is distinct from format('companies/%s/managed-documents/%s/versions/%s/%s', v_company_id, v_document_id, v_version_id, v_filename) then
    raise exception 'Generated artifact storage path is invalid' using errcode = '22023';
  end if;
  return private.register_managed_document_artifact_internal(
    v_company_id, v_actor, v_document_id, v_version_id,
    left(btrim(coalesce(p_payload->>'title', 'Generated document')), 200),
    left(btrim(coalesce(p_payload->>'description', '')), 4000), v_category, v_origin, v_project_id,
    v_origin, v_filename, v_mime, v_size, v_provider, v_bucket, v_path, v_hash,
    v_source_domain, v_source_type, v_source_record_id,
    nullif(left(btrim(coalesce(p_payload->>'sourceRecordReference', '')), 255), ''),
    v_artifact_type, v_template_version_id, v_template_hash, null
  );
end;
$$;

create or replace function private.register_document_generation_artifact()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_record_reference text;
  v_title text;
  v_source_version_id uuid;
  v_document_id uuid := gen_random_uuid();
  v_version_id uuid := gen_random_uuid();
  v_extension text := lower(new.artifact_type);
begin
  if new.document_type = 'PURCHASE_ORDER' then
    select po.po_number into v_source_record_reference from public.purchase_orders po where po.company_id = new.company_id and po.id = new.document_id;
  elsif new.document_type = 'CLIENT_INVOICE' then
    select cb.billing_number into v_source_record_reference from public.client_billings cb where cb.company_id = new.company_id and cb.id = new.document_id;
  end if;
  v_source_record_reference := coalesce(nullif(btrim(v_source_record_reference), ''), new.document_id::text);
  v_title := left(format('%s %s (%s)', replace(new.document_type, '_', ' '), v_source_record_reference, new.artifact_type), 200);
  if new.artifact_type = 'PDF' then
    select v.id into v_source_version_id
    from public.managed_document_versions v
    where v.company_id = new.company_id
      and v.storage_path = new.source_artifact_storage_path
      and v.sha256 = lower(new.source_artifact_sha256)
    order by v.created_at desc
    limit 1;
  end if;
  perform private.register_managed_document_artifact_internal(
    new.company_id, new.generated_by_user_id, v_document_id, v_version_id,
    v_title, 'Retained output for the authoritative issued document.', 'GENERATED_ARTIFACT', 'GENERATED_ARTIFACT',
    null, 'GENERATED_ARTIFACT',
    format('artifact.%s', v_extension),
    case when new.artifact_type = 'PDF' then 'application/pdf' else 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' end,
    new.artifact_size, new.artifact_storage_provider, new.artifact_storage_bucket,
    new.artifact_storage_path, new.artifact_sha256, new.document_type, new.document_type,
    new.document_id, v_source_record_reference, new.artifact_type, new.template_version_id,
    new.template_content_sha256, v_source_version_id
  );
  return new;
end;
$$;

drop trigger if exists document_generation_evidence_artifact_index on public.document_generation_evidence;
create trigger document_generation_evidence_artifact_index
after insert on public.document_generation_evidence
for each row execute function private.register_document_generation_artifact();

revoke all on function public.create_managed_document_with_version(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.create_managed_document_version(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.archive_managed_document(uuid, timestamptz, text) from public, anon, authenticated, service_role;
revoke all on function public.register_generated_document_artifact(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.create_managed_document_with_version(jsonb) to service_role;
grant execute on function public.create_managed_document_version(jsonb) to service_role;
grant execute on function public.archive_managed_document(uuid, timestamptz, text) to service_role;
grant execute on function public.register_generated_document_artifact(jsonb) to service_role;

create or replace function public.server_create_managed_document_with_version(p_payload jsonb, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if p_actor_user_id is null then raise exception 'Managed document mutation requires an originating user' using errcode = '22023'; end if;
  perform set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_result := public.create_managed_document_with_version(p_payload);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return v_result;
exception when others then
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  raise;
end;
$$;

create or replace function public.server_create_managed_document_version(p_payload jsonb, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if p_actor_user_id is null then raise exception 'Managed document mutation requires an originating user' using errcode = '22023'; end if;
  perform set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_result := public.create_managed_document_version(p_payload);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return v_result;
exception when others then
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  raise;
end;
$$;

create or replace function public.server_archive_managed_document(p_document_id uuid, p_expected_updated_at timestamptz, p_reason text, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if p_actor_user_id is null then raise exception 'Managed document mutation requires an originating user' using errcode = '22023'; end if;
  perform set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_result := public.archive_managed_document(p_document_id, p_expected_updated_at, p_reason);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return v_result;
exception when others then
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  raise;
end;
$$;

create or replace function public.server_register_generated_document_artifact(p_payload jsonb, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if p_actor_user_id is null then raise exception 'Managed artifact mutation requires an originating user' using errcode = '22023'; end if;
  perform set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_result := public.register_generated_document_artifact(p_payload);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return v_result;
exception when others then
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  raise;
end;
$$;

revoke all on function public.server_create_managed_document_with_version(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.server_create_managed_document_version(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.server_archive_managed_document(uuid, timestamptz, text, uuid) from public, anon, authenticated;
revoke all on function public.server_register_generated_document_artifact(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.server_create_managed_document_with_version(jsonb, uuid) to service_role;
grant execute on function public.server_create_managed_document_version(jsonb, uuid) to service_role;
grant execute on function public.server_archive_managed_document(uuid, timestamptz, text, uuid) to service_role;
grant execute on function public.server_register_generated_document_artifact(jsonb, uuid) to service_role;

revoke execute on function private.validate_managed_document_row() from public, anon, authenticated;
revoke execute on function private.prevent_managed_document_version_mutation() from public, anon, authenticated;
revoke execute on function private.prevent_document_artifact_registration_mutation() from public, anon, authenticated;
revoke execute on function private.managed_document_actor(uuid, text) from public, anon, authenticated;
revoke execute on function private.register_managed_document_artifact_internal(uuid, uuid, uuid, uuid, text, text, text, text, uuid, text, text, text, bigint, text, text, text, text, text, text, uuid, text, text, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function private.register_document_generation_artifact() from public, anon, authenticated;
