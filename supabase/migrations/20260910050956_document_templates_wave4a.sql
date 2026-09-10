-- Wave 4A: company-bound DOCX templates and deterministic mail merge.
-- Financial values continue to come from issued_document_snapshots. Template
-- rows describe presentation only and are never an alternate financial source.

create table if not exists public.document_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  document_type text not null check (document_type in ('PURCHASE_ORDER', 'CLIENT_INVOICE')),
  display_name text not null,
  variant_key text not null default 'STANDARD',
  is_default boolean not null default false,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_templates_identity_unique unique (id, company_id, document_type),
  constraint document_templates_variant_unique unique (company_id, document_type, variant_key),
  constraint document_templates_name_check check (length(btrim(display_name)) between 1 and 160),
  constraint document_templates_variant_check check (variant_key ~ '^[A-Za-z0-9][A-Za-z0-9._ -]{0,79}$')
);

create unique index if not exists document_templates_one_default_idx
  on public.document_templates(company_id, document_type)
  where is_default;

create table if not exists public.document_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null,
  company_id uuid not null,
  document_type text not null check (document_type in ('PURCHASE_ORDER', 'CLIENT_INVOICE')),
  display_name text not null,
  origin text not null check (origin in ('UPLOADED', 'AI_GENERATED', 'STARTER', 'DUPLICATED')),
  version_number integer not null check (version_number > 0),
  source_filename text,
  source_storage_path text not null,
  content_storage_path text not null,
  storage_provider text not null default 'supabase' check (storage_provider in ('supabase', 's3', 'gcs', 'memory', 'custom')),
  storage_bucket text not null,
  mime_type text not null default 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  content_size bigint not null check (content_size > 0 and content_size <= 10485760),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-fA-F]{64}$'),
  source_sha256 text check (source_sha256 is null or source_sha256 ~ '^[0-9a-fA-F]{64}$'),
  mapping_schema_version text not null default '1',
  bindings jsonb not null default '[]'::jsonb check (jsonb_typeof(bindings) = 'array' and jsonb_array_length(bindings) <= 100),
  validation_state text not null default 'UNVALIDATED' check (validation_state in ('UNVALIDATED', 'VALID', 'WARNINGS', 'BLOCKED')),
  validation_report jsonb not null default '{}'::jsonb check (jsonb_typeof(validation_report) = 'object'),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'RETIRED')),
  parent_version_id uuid,
  created_by_user_id uuid references auth.users(id) on delete set null,
  activated_by_user_id uuid references auth.users(id) on delete set null,
  activated_at timestamptz,
  retired_by_user_id uuid references auth.users(id) on delete set null,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  constraint document_template_versions_root_fk
    foreign key (template_id, company_id, document_type)
    references public.document_templates(id, company_id, document_type)
    on delete restrict,
  constraint document_template_versions_parent_fk
    foreign key (parent_version_id, company_id)
    references public.document_template_versions(id, company_id)
    on delete restrict,
  constraint document_template_versions_identity_unique unique (id, company_id),
  constraint document_template_versions_number_unique unique (template_id, version_number),
  constraint document_template_versions_name_check check (length(btrim(display_name)) between 1 and 160),
  constraint document_template_versions_mime_check check (mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
  constraint document_template_versions_filename_check check (source_filename is null or source_filename ~* '[.]docx$'),
  constraint document_template_versions_source_path_check check (source_storage_path like 'companies/%'),
  constraint document_template_versions_content_path_check check (content_storage_path like 'companies/%')
);

create index if not exists document_template_versions_company_type_idx
  on public.document_template_versions(company_id, document_type, status, created_at desc);

create unique index if not exists document_template_versions_one_active_idx
  on public.document_template_versions(template_id)
  where status = 'ACTIVE';

create table if not exists public.document_generation_evidence (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  snapshot_id uuid not null references public.issued_document_snapshots(id) on delete restrict,
  template_version_id uuid not null,
  document_type text not null check (document_type in ('PURCHASE_ORDER', 'CLIENT_INVOICE')),
  document_id uuid not null,
  template_content_sha256 text not null check (template_content_sha256 ~ '^[0-9a-fA-F]{64}$'),
  artifact_type text not null check (artifact_type in ('DOCX')),
  artifact_storage_path text not null check (artifact_storage_path like 'companies/%'),
  artifact_storage_provider text not null default 'supabase' check (artifact_storage_provider in ('supabase', 's3', 'gcs', 'memory', 'custom')),
  artifact_storage_bucket text not null,
  artifact_size bigint not null check (artifact_size > 0 and artifact_size <= 10485760),
  artifact_sha256 text not null check (artifact_sha256 ~ '^[0-9a-fA-F]{64}$'),
  generated_by_user_id uuid references auth.users(id) on delete set null,
  generated_at timestamptz not null default now(),
  constraint document_generation_evidence_template_fk
    foreign key (template_version_id, company_id)
    references public.document_template_versions(id, company_id)
    on delete restrict,
  constraint document_generation_evidence_snapshot_scope_unique
    unique (snapshot_id, template_version_id, artifact_type, artifact_sha256)
);

create index if not exists document_generation_evidence_company_document_idx
  on public.document_generation_evidence(company_id, document_type, document_id, generated_at desc);

alter table public.issued_document_snapshots
  add column if not exists template_version_id uuid,
  add column if not exists template_sha256 text;

alter table public.issued_document_snapshots
  drop constraint if exists issued_document_snapshots_template_version_fk;
alter table public.issued_document_snapshots
  add constraint issued_document_snapshots_template_version_fk
  foreign key (template_version_id, company_id)
  references public.document_template_versions(id, company_id)
  on delete restrict;
alter table public.issued_document_snapshots
  drop constraint if exists issued_document_snapshots_template_sha256_check;
alter table public.issued_document_snapshots
  add constraint issued_document_snapshots_template_sha256_check
  check (template_sha256 is null or template_sha256 ~ '^[0-9a-fA-F]{64}$');

insert into storage.buckets (id, name, public)
values ('company-document-templates', 'company-document-templates', false)
on conflict (id) do update set public = false;

create or replace function private.storage_template_document_type(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_name, '') like 'companies/%/document-templates/%/PURCHASE_ORDER/%' then 'PURCHASE_ORDER'
    when coalesce(p_name, '') like 'companies/%/document-templates/%/CLIENT_INVOICE/%' then 'CLIENT_INVOICE'
    when coalesce(p_name, '') like 'companies/%/document-template-artifacts/%/PURCHASE_ORDER/%' then 'PURCHASE_ORDER'
    when coalesce(p_name, '') like 'companies/%/document-template-artifacts/%/CLIENT_INVOICE/%' then 'CLIENT_INVOICE'
    else null
  end;
$$;
revoke execute on function private.storage_template_document_type(text) from public, anon;
grant execute on function private.storage_template_document_type(text) to authenticated, service_role;

drop policy if exists "company document templates read" on storage.objects;
create policy "company document templates read" on storage.objects
for select to authenticated
using (
  bucket_id = 'company-document-templates'
  and private.storage_company_id(name) is not null
  and (
    (select public.has_company_permission(private.storage_company_id(name), 'company.settings.read'))
    or (select public.has_company_permission(private.storage_company_id(name), 'company.settings.manage'))
    or (private.storage_template_document_type(name) = 'PURCHASE_ORDER' and (select public.has_company_permission(private.storage_company_id(name), 'procurement.read')))
    or (private.storage_template_document_type(name) = 'CLIENT_INVOICE' and (select public.has_company_permission(private.storage_company_id(name), 'projects.read')))
  )
);

drop policy if exists "company document templates insert" on storage.objects;
create policy "company document templates insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'company-document-templates'
  and private.storage_company_id(name) is not null
  and (select public.has_company_permission(private.storage_company_id(name), 'company.settings.manage'))
);

-- No authenticated update/delete path is exposed for template bytes. The
-- server-side compensation path may remove an object only before metadata is
-- committed, using the configured service-role storage client.

alter table public.document_templates enable row level security;
alter table public.document_template_versions enable row level security;
alter table public.document_generation_evidence enable row level security;

drop policy if exists document_templates_select on public.document_templates;
create policy document_templates_select on public.document_templates
for select to authenticated
using (
  (select public.has_company_permission(company_id, 'company.settings.read'))
  or (select public.has_company_permission(company_id, 'company.settings.manage'))
  or (document_type = 'PURCHASE_ORDER' and (select public.has_company_permission(company_id, 'procurement.read')))
  or (document_type = 'CLIENT_INVOICE' and (select public.has_company_permission(company_id, 'projects.read')))
);

drop policy if exists document_template_versions_select on public.document_template_versions;
create policy document_template_versions_select on public.document_template_versions
for select to authenticated
using (
  (select public.has_company_permission(company_id, 'company.settings.read'))
  or (select public.has_company_permission(company_id, 'company.settings.manage'))
  or (document_type = 'PURCHASE_ORDER' and (select public.has_company_permission(company_id, 'procurement.read')))
  or (document_type = 'CLIENT_INVOICE' and (select public.has_company_permission(company_id, 'projects.read')))
);

drop policy if exists document_generation_evidence_select on public.document_generation_evidence;
create policy document_generation_evidence_select on public.document_generation_evidence
for select to authenticated
using (
  (select public.has_company_permission(company_id, 'company.settings.read'))
  or (select public.has_company_permission(company_id, 'company.settings.manage'))
  or (document_type = 'PURCHASE_ORDER' and (select public.has_company_permission(company_id, 'procurement.read')))
  or (document_type = 'CLIENT_INVOICE' and (select public.has_company_permission(company_id, 'projects.read')))
);

revoke all on table public.document_templates, public.document_template_versions, public.document_generation_evidence from public, anon, authenticated;
grant select on table public.document_templates, public.document_template_versions, public.document_generation_evidence to authenticated;

create or replace function private.validate_document_template_version_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.template_id is distinct from new.template_id
    or old.company_id is distinct from new.company_id
    or old.document_type is distinct from new.document_type
    or old.display_name is distinct from new.display_name
    or old.origin is distinct from new.origin
    or old.version_number is distinct from new.version_number
    or old.source_filename is distinct from new.source_filename
    or old.source_storage_path is distinct from new.source_storage_path
    or old.content_storage_path is distinct from new.content_storage_path
    or old.storage_provider is distinct from new.storage_provider
    or old.storage_bucket is distinct from new.storage_bucket
    or old.mime_type is distinct from new.mime_type
    or old.content_size is distinct from new.content_size
    or old.content_sha256 is distinct from new.content_sha256
    or old.source_sha256 is distinct from new.source_sha256
    or old.mapping_schema_version is distinct from new.mapping_schema_version
    or old.parent_version_id is distinct from new.parent_version_id
    or old.created_by_user_id is distinct from new.created_by_user_id
    or old.created_at is distinct from new.created_at then
    raise exception 'Document template version content and identity are immutable; create a new version' using errcode = '42501';
  end if;
  if old.status <> 'DRAFT' and (old.bindings is distinct from new.bindings or old.validation_state is distinct from new.validation_state or old.validation_report is distinct from new.validation_report) then
    raise exception 'Only a draft document template version may change its mappings' using errcode = '42501';
  end if;
  if old.status = 'RETIRED' and new.status <> 'RETIRED' then
    raise exception 'A retired document template version cannot be reactivated' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists document_template_versions_immutable on public.document_template_versions;
create trigger document_template_versions_immutable
before update on public.document_template_versions
for each row execute function private.validate_document_template_version_mutation();

create or replace function private.prevent_document_template_version_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Document template versions are retained for historical reproducibility; retire or supersede them instead' using errcode = '42501';
end;
$$;

drop trigger if exists document_template_versions_no_delete on public.document_template_versions;
create trigger document_template_versions_no_delete
before delete on public.document_template_versions
for each row execute function private.prevent_document_template_version_delete();

create or replace function public.create_document_template_version(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid := nullif(btrim(coalesce(p_payload->>'companyId', p_payload->>'company_id', '')), '')::uuid;
  v_document_type text := upper(btrim(coalesce(p_payload->>'documentType', p_payload->>'document_type', '')));
  v_template_id uuid := nullif(btrim(coalesce(p_payload->>'templateId', p_payload->>'template_id', '')), '')::uuid;
  v_version_id uuid := coalesce(nullif(btrim(coalesce(p_payload->>'versionId', p_payload->>'version_id', '')), '')::uuid, gen_random_uuid());
  v_display_name text := nullif(left(btrim(coalesce(p_payload->>'displayName', p_payload->>'display_name', '')), 160), '');
  v_variant_key text := coalesce(nullif(left(btrim(coalesce(p_payload->>'variantKey', p_payload->>'variant_key', '')), 80), ''), 'STANDARD');
  v_origin text := upper(btrim(coalesce(p_payload->>'origin', '')));
  v_source_filename text := nullif(left(btrim(coalesce(p_payload->>'sourceFilename', p_payload->>'source_filename', '')), 255), '');
  v_source_path text := nullif(btrim(coalesce(p_payload->>'sourceStoragePath', p_payload->>'source_storage_path', '')), '');
  v_content_path text := nullif(btrim(coalesce(p_payload->>'contentStoragePath', p_payload->>'content_storage_path', '')), '');
  v_storage_provider text := lower(btrim(coalesce(p_payload->>'storageProvider', p_payload->>'storage_provider', 'supabase')));
  v_storage_bucket text := nullif(left(btrim(coalesce(p_payload->>'storageBucket', p_payload->>'storage_bucket', '')), 120), '');
  v_mime_type text := lower(btrim(coalesce(p_payload->>'mimeType', p_payload->>'mime_type', '')));
  v_content_size bigint := nullif(p_payload->>'contentSize', '')::bigint;
  v_content_sha256 text := lower(btrim(coalesce(p_payload->>'contentSha256', p_payload->>'content_sha256', '')));
  v_source_sha256 text := nullif(lower(btrim(coalesce(p_payload->>'sourceSha256', p_payload->>'source_sha256', ''))), '');
  v_mapping_schema_version text := coalesce(nullif(btrim(coalesce(p_payload->>'mappingSchemaVersion', p_payload->>'mapping_schema_version', '')), ''), '1');
  v_bindings jsonb := coalesce(p_payload->'bindings', '[]'::jsonb);
  v_validation_state text := upper(btrim(coalesce(p_payload->>'validationState', p_payload->>'validation_state', 'UNVALIDATED')));
  v_validation_report jsonb := coalesce(p_payload->'validationReport', p_payload->'validation_report', '{}'::jsonb);
  v_parent_version_id uuid := nullif(btrim(coalesce(p_payload->>'parentVersionId', p_payload->>'parent_version_id', '')), '')::uuid;
  v_template public.document_templates;
  v_version public.document_template_versions;
  v_version_number integer;
  v_default boolean;
begin
  if v_user_id is null then raise exception 'Authentication is required to create a document template' using errcode = '42501'; end if;
  if v_company_id is null or v_company_id is distinct from (select private.deployment_company_id()) then raise exception 'Document template must belong to the deployment company' using errcode = '42501'; end if;
  if not (select private.has_company_permission(v_company_id, 'company.settings.manage')) then raise exception 'Company settings management permission is required for document templates' using errcode = '42501'; end if;
  if v_document_type not in ('PURCHASE_ORDER', 'CLIENT_INVOICE') then raise exception 'Document template type is unsupported' using errcode = '22023'; end if;
  if v_display_name is null then raise exception 'A document template name is required' using errcode = '22023'; end if;
  if v_origin not in ('UPLOADED', 'AI_GENERATED', 'STARTER', 'DUPLICATED') then raise exception 'Document template origin is invalid' using errcode = '22023'; end if;
  if v_source_path is null or v_content_path is null or private.storage_company_id(v_source_path) is distinct from v_company_id or private.storage_company_id(v_content_path) is distinct from v_company_id then raise exception 'Document template storage paths must be company-scoped' using errcode = '22023'; end if;
  if v_storage_bucket is null or v_mime_type <> 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then raise exception 'Document template storage metadata is invalid' using errcode = '22023'; end if;
  if v_content_size is null or v_content_size <= 0 or v_content_size > 10485760 or v_content_sha256 !~ '^[0-9a-fA-F]{64}$' then raise exception 'Document template content integrity metadata is invalid' using errcode = '22023'; end if;
  if v_source_sha256 is not null and v_source_sha256 !~ '^[0-9a-fA-F]{64}$' then raise exception 'Document template source integrity metadata is invalid' using errcode = '22023'; end if;
  if jsonb_typeof(v_bindings) <> 'array' or jsonb_array_length(v_bindings) > 100 or jsonb_typeof(v_validation_report) <> 'object' then raise exception 'Document template mapping metadata is invalid' using errcode = '22023'; end if;
  if v_validation_state not in ('UNVALIDATED', 'VALID', 'WARNINGS', 'BLOCKED') then raise exception 'Document template validation state is invalid' using errcode = '22023'; end if;
  if v_parent_version_id is not null and not exists (select 1 from public.document_template_versions p where p.id = v_parent_version_id and p.company_id = v_company_id and p.document_type = v_document_type) then raise exception 'Document template parent is outside the company' using errcode = '42501'; end if;

  if v_template_id is null then v_template_id := gen_random_uuid(); end if;
  if not exists (select 1 from public.document_templates t where t.id = v_template_id and t.company_id = v_company_id and t.document_type = v_document_type) then
    v_default := not exists (select 1 from public.document_templates t where t.company_id = v_company_id and t.document_type = v_document_type and t.is_default);
    insert into public.document_templates (id, company_id, document_type, display_name, variant_key, is_default, created_by_user_id)
    values (v_template_id, v_company_id, v_document_type, v_display_name, v_variant_key, v_default, v_user_id);
  end if;

  select t.* into v_template from public.document_templates t where t.id = v_template_id and t.company_id = v_company_id and t.document_type = v_document_type for update;
  if not found then raise exception 'Document template is outside the company or has an incompatible type' using errcode = '42501'; end if;
  select coalesce(max(v.version_number), 0) + 1 into v_version_number from public.document_template_versions v where v.template_id = v_template_id;
  insert into public.document_template_versions (
    id, template_id, company_id, document_type, display_name, origin, version_number,
    source_filename, source_storage_path, content_storage_path, storage_provider,
    storage_bucket, mime_type, content_size, content_sha256, source_sha256,
    mapping_schema_version, bindings, validation_state, validation_report,
    status, parent_version_id, created_by_user_id
  ) values (
    v_version_id, v_template_id, v_company_id, v_document_type, v_display_name, v_origin, v_version_number,
    v_source_filename, v_source_path, v_content_path, v_storage_provider,
    v_storage_bucket, v_mime_type, v_content_size, v_content_sha256, v_source_sha256,
    v_mapping_schema_version, v_bindings, v_validation_state, v_validation_report,
    'DRAFT', v_parent_version_id, v_user_id
  ) returning * into v_version;
  return to_jsonb(v_version) || jsonb_build_object('template', to_jsonb(v_template));
end;
$$;

create or replace function public.update_document_template_bindings(
  p_version_id uuid,
  p_bindings jsonb,
  p_validation_state text,
  p_validation_report jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_version public.document_template_versions;
  v_state text := upper(btrim(coalesce(p_validation_state, 'UNVALIDATED')));
begin
  if v_user_id is null then raise exception 'Authentication is required to update document template mappings' using errcode = '42501'; end if;
  if p_bindings is null or jsonb_typeof(p_bindings) <> 'array' or jsonb_array_length(p_bindings) > 100 or p_validation_report is null or jsonb_typeof(p_validation_report) <> 'object' or v_state not in ('UNVALIDATED', 'VALID', 'WARNINGS', 'BLOCKED') then raise exception 'Document template mapping metadata is invalid' using errcode = '22023'; end if;
  select v.* into v_version from public.document_template_versions v where v.id = p_version_id for update;
  if not found or not (select private.has_company_permission(v_version.company_id, 'company.settings.manage')) then raise exception 'Document template permission denied' using errcode = '42501'; end if;
  if v_version.status <> 'DRAFT' then raise exception 'Only a draft document template version may be remapped' using errcode = '42501'; end if;
  update public.document_template_versions
  set bindings = p_bindings, validation_state = v_state, validation_report = p_validation_report
  where id = p_version_id;
  select v.* into v_version from public.document_template_versions v where v.id = p_version_id;
  return to_jsonb(v_version);
end;
$$;

create or replace function public.activate_document_template_version(p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_version public.document_template_versions;
begin
  if v_user_id is null then raise exception 'Authentication is required to activate a document template' using errcode = '42501'; end if;
  select v.* into v_version from public.document_template_versions v where v.id = p_version_id for update;
  if not found or not (select private.has_company_permission(v_version.company_id, 'company.settings.manage')) then raise exception 'Document template permission denied' using errcode = '42501'; end if;
  if v_version.status not in ('DRAFT', 'ACTIVE') or v_version.validation_state <> 'VALID' then raise exception 'A document template must pass validation before activation' using errcode = '22023'; end if;
  update public.document_template_versions
  set status = 'RETIRED', retired_by_user_id = v_user_id, retired_at = now()
  where template_id = v_version.template_id and status = 'ACTIVE' and id <> p_version_id;
  update public.document_template_versions
  set status = 'ACTIVE', activated_by_user_id = v_user_id, activated_at = coalesce(activated_at, now()), retired_by_user_id = null, retired_at = null
  where id = p_version_id;
  select v.* into v_version from public.document_template_versions v where v.id = p_version_id;
  return to_jsonb(v_version);
end;
$$;

create or replace function public.retire_document_template_version(p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_version public.document_template_versions;
begin
  if v_user_id is null then raise exception 'Authentication is required to retire a document template' using errcode = '42501'; end if;
  select v.* into v_version from public.document_template_versions v where v.id = p_version_id for update;
  if not found or not (select private.has_company_permission(v_version.company_id, 'company.settings.manage')) then raise exception 'Document template permission denied' using errcode = '42501'; end if;
  if v_version.status = 'RETIRED' then return to_jsonb(v_version); end if;
  update public.document_template_versions set status = 'RETIRED', retired_by_user_id = v_user_id, retired_at = now() where id = p_version_id;
  select v.* into v_version from public.document_template_versions v where v.id = p_version_id;
  return to_jsonb(v_version);
end;
$$;

create or replace function public.record_document_generation_evidence(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid := nullif(btrim(coalesce(p_payload->>'companyId', p_payload->>'company_id', '')), '')::uuid;
  v_snapshot_id uuid := nullif(btrim(coalesce(p_payload->>'snapshotId', p_payload->>'snapshot_id', '')), '')::uuid;
  v_template_version_id uuid := nullif(btrim(coalesce(p_payload->>'templateVersionId', p_payload->>'template_version_id', '')), '')::uuid;
  v_document_type text := upper(btrim(coalesce(p_payload->>'documentType', p_payload->>'document_type', '')));
  v_document_id uuid := nullif(btrim(coalesce(p_payload->>'documentId', p_payload->>'document_id', '')), '')::uuid;
  v_template_hash text := lower(btrim(coalesce(p_payload->>'templateContentSha256', p_payload->>'template_content_sha256', '')));
  v_artifact_type text := upper(btrim(coalesce(p_payload->>'artifactType', p_payload->>'artifact_type', 'DOCX')));
  v_artifact_path text := nullif(btrim(coalesce(p_payload->>'artifactStoragePath', p_payload->>'artifact_storage_path', '')), '');
  v_provider text := lower(btrim(coalesce(p_payload->>'artifactStorageProvider', p_payload->>'artifact_storage_provider', 'supabase')));
  v_bucket text := nullif(left(btrim(coalesce(p_payload->>'artifactStorageBucket', p_payload->>'artifact_storage_bucket', '')), 120), '');
  v_size bigint := nullif(p_payload->>'artifactSize', '')::bigint;
  v_hash text := lower(btrim(coalesce(p_payload->>'artifactSha256', p_payload->>'artifact_sha256', '')));
  v_row public.document_generation_evidence;
  v_template public.document_template_versions;
  v_snapshot public.issued_document_snapshots;
begin
  if v_user_id is null then raise exception 'Authentication is required to record document generation evidence' using errcode = '42501'; end if;
  if v_company_id is null or v_company_id is distinct from (select private.deployment_company_id()) then raise exception 'Generation evidence must belong to the deployment company' using errcode = '42501'; end if;
  select v.* into v_template from public.document_template_versions v where v.id = v_template_version_id and v.company_id = v_company_id for share;
  if not found then raise exception 'Document template version is outside the company' using errcode = '42501'; end if;
  select s.* into v_snapshot from public.issued_document_snapshots s where s.id = v_snapshot_id and s.company_id = v_company_id for share;
  if not found or v_snapshot.template_version_id is distinct from v_template_version_id or v_snapshot.document_type is distinct from v_document_type or v_snapshot.document_id is distinct from v_document_id then raise exception 'Generation evidence must reference the pinned issued snapshot and template version' using errcode = '42501'; end if;
  if not (
    (v_document_type = 'PURCHASE_ORDER' and (select private.has_company_permission(v_company_id, 'procurement.read')))
    or (v_document_type = 'CLIENT_INVOICE' and (select private.has_company_permission(v_company_id, 'projects.read')))
    or (select private.has_company_permission(v_company_id, 'company.settings.manage'))
  ) then raise exception 'Document generation permission denied' using errcode = '42501'; end if;
  if v_artifact_type <> 'DOCX' or v_artifact_path is null or private.storage_company_id(v_artifact_path) is distinct from v_company_id or v_bucket is null or v_size is null or v_size <= 0 or v_size > 10485760 or v_template_hash <> lower(v_template.content_sha256) or v_template_hash !~ '^[0-9a-f]{64}$' or v_hash !~ '^[0-9a-f]{64}$' then raise exception 'Document generation evidence integrity metadata is invalid' using errcode = '22023'; end if;
  insert into public.document_generation_evidence (
    company_id, snapshot_id, template_version_id, document_type, document_id,
    template_content_sha256, artifact_type, artifact_storage_path,
    artifact_storage_provider, artifact_storage_bucket, artifact_size,
    artifact_sha256, generated_by_user_id
  ) values (
    v_company_id, v_snapshot_id, v_template_version_id, v_document_type, v_document_id,
    v_template_hash, v_artifact_type, v_artifact_path, v_provider, v_bucket,
    v_size, v_hash, v_user_id
  ) on conflict (snapshot_id, template_version_id, artifact_type, artifact_sha256) do nothing;
  select e.* into v_row from public.document_generation_evidence e where e.snapshot_id = v_snapshot_id and e.template_version_id = v_template_version_id and e.artifact_type = v_artifact_type and e.artifact_sha256 = v_hash;
  return to_jsonb(v_row);
end;
$$;

revoke all on function public.create_document_template_version(jsonb) from public, anon;
revoke all on function public.update_document_template_bindings(uuid, jsonb, text, jsonb) from public, anon;
revoke all on function public.activate_document_template_version(uuid) from public, anon;
revoke all on function public.retire_document_template_version(uuid) from public, anon;
revoke all on function public.record_document_generation_evidence(jsonb) from public, anon;
grant execute on function public.create_document_template_version(jsonb) to authenticated;
grant execute on function public.update_document_template_bindings(uuid, jsonb, text, jsonb) to authenticated;
grant execute on function public.activate_document_template_version(uuid) to authenticated;
grant execute on function public.retire_document_template_version(uuid) to authenticated;
grant execute on function public.record_document_generation_evidence(jsonb) to authenticated;

-- Replace the issuance builders so a currently active, validated default
-- template is pinned at the same transaction as the immutable snapshot. If a
-- company has not configured a template yet, the legacy PDF version remains a
-- deliberate compatibility fallback and later generation refuses to guess a
-- newer template for that historical snapshot.
create or replace function private.ensure_purchase_order_document_snapshot(
  p_purchase_order_id uuid,
  p_processor_name text default null,
  p_processor_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_po public.purchase_orders;
  v_vendor public.vendors;
  v_project public.projects;
  v_company public.companies;
  v_profile public.company_document_profiles;
  v_processor public.profiles;
  v_template public.document_template_versions;
  v_lines jsonb := '[]'::jsonb;
  v_total numeric(18,2) := 0;
  v_snapshot jsonb;
  v_snapshot_id uuid;
  v_existing_snapshot jsonb;
  v_existing_template_id uuid;
  v_existing_template_hash text;
  v_existing_template_version text;
  v_template_label text := 'HSC-PO-v1';
  v_processor_name text;
  v_processor_title text;
begin
  select po.* into v_po from public.purchase_orders po where po.id = p_purchase_order_id for update;
  if not found then raise exception 'Purchase order was not found' using errcode = '23503'; end if;
  if v_po.status not in ('ISSUED', 'CLOSED') then raise exception 'Only issued purchase orders can have an issued document snapshot' using errcode = '42501'; end if;
  select s.id, s.snapshot, s.template_version, s.template_version_id, s.template_sha256
  into v_snapshot_id, v_existing_snapshot, v_existing_template_version, v_existing_template_id, v_existing_template_hash
  from public.issued_document_snapshots s
  where s.company_id = v_po.company_id and s.document_type = 'PURCHASE_ORDER' and s.document_id = v_po.id;
  if v_snapshot_id is not null then
    return jsonb_build_object('id', v_snapshot_id, 'companyId', v_po.company_id, 'documentType', 'PURCHASE_ORDER', 'documentId', v_po.id, 'documentNumber', v_po.po_number, 'templateVersion', v_existing_template_version, 'templateVersionId', v_existing_template_id, 'templateContentSha256', v_existing_template_hash, 'snapshot', v_existing_snapshot);
  end if;
  select c.* into v_company from public.companies c where c.id = v_po.company_id;
  select v.* into v_vendor from public.vendors v where v.id = v_po.vendor_id and v.company_id = v_po.company_id;
  select p.* into v_project from public.projects p where p.id = v_po.project_id and p.company_id = v_po.company_id;
  select p.* into v_profile from public.company_document_profiles p where p.company_id = v_po.company_id;
  select tv.* into v_template
  from public.document_template_versions tv
  join public.document_templates t on t.id = tv.template_id and t.company_id = tv.company_id and t.document_type = tv.document_type
  where tv.company_id = v_po.company_id and tv.document_type = 'PURCHASE_ORDER' and tv.status = 'ACTIVE' and tv.validation_state = 'VALID' and t.is_default
  order by tv.version_number desc limit 1;
  if v_template.id is not null then v_template_label := v_template.display_name || ' v' || v_template.version_number::text; end if;
  select coalesce(jsonb_agg(jsonb_build_object('lineNumber', l.line_number, 'description', l.description, 'quantity', l.quantity, 'unit', l.unit, 'unitPrice', l.unit_price, 'amount', l.amount, 'projectCostCodeId', l.project_cost_code_id) order by l.line_number), '[]'::jsonb), coalesce(sum(l.amount), 0)::numeric(18,2)
  into v_lines, v_total from public.purchase_order_lines l where l.company_id = v_po.company_id and l.purchase_order_id = v_po.id;
  select p.* into v_processor from public.profiles p where p.id = coalesce(v_po.issued_by_user_id, (select auth.uid()));
  v_processor_name := coalesce(nullif(btrim(p_processor_name), ''), nullif(btrim(v_processor.full_name), ''), 'Authorized Purchasing User');
  v_processor_title := nullif(btrim(p_processor_title), '');
  v_snapshot := jsonb_build_object(
    'documentType', 'PURCHASE_ORDER', 'documentNumber', v_po.po_number, 'status', 'ISSUED', 'issueDate', v_po.issue_date, 'currency', v_po.currency, 'description', v_po.description, 'notes', v_po.notes, 'termsAndConditions', v_profile.default_terms,
    'company', jsonb_build_object('legalName', coalesce(v_profile.legal_name, v_company.name), 'address', v_profile.address, 'contactNumber', v_profile.contact_number, 'email', v_profile.email, 'vatTin', v_profile.vat_tin, 'logoPath', v_profile.logo_path),
    'supplier', jsonb_build_object('name', v_vendor.name, 'address', v_vendor.address, 'email', v_vendor.email, 'phone', v_vendor.phone, 'vatTin', v_vendor.tax_id),
    'project', jsonb_build_object('id', v_project.id, 'projectCode', v_project.project_code, 'projectName', v_project.project_name, 'deliverTo', coalesce(v_project.site_address, v_project.location)),
    'lines', v_lines, 'totalAmount', v_total, 'processor', jsonb_build_object('name', v_processor_name, 'title', v_processor_title), 'templateVersion', v_template_label,
    'templateVersionId', v_template.id, 'templateContentSha256', v_template.content_sha256
  );
  insert into public.issued_document_snapshots (company_id, document_type, document_id, document_number, template_version, template_version_id, template_sha256, snapshot, generated_by_user_id)
  values (v_po.company_id, 'PURCHASE_ORDER', v_po.id, v_po.po_number, v_template_label, v_template.id, v_template.content_sha256, v_snapshot, coalesce(v_po.issued_by_user_id, (select auth.uid())))
  on conflict (company_id, document_type, document_id) do nothing returning id into v_snapshot_id;
  if v_snapshot_id is null then
    select s.id, s.snapshot, s.template_version, s.template_version_id, s.template_sha256 into v_snapshot_id, v_existing_snapshot, v_existing_template_version, v_existing_template_id, v_existing_template_hash from public.issued_document_snapshots s where s.company_id = v_po.company_id and s.document_type = 'PURCHASE_ORDER' and s.document_id = v_po.id;
    return jsonb_build_object('id', v_snapshot_id, 'companyId', v_po.company_id, 'documentType', 'PURCHASE_ORDER', 'documentId', v_po.id, 'documentNumber', v_po.po_number, 'templateVersion', v_existing_template_version, 'templateVersionId', v_existing_template_id, 'templateContentSha256', v_existing_template_hash, 'snapshot', v_existing_snapshot);
  end if;
  return jsonb_build_object('id', v_snapshot_id, 'companyId', v_po.company_id, 'documentType', 'PURCHASE_ORDER', 'documentId', v_po.id, 'documentNumber', v_po.po_number, 'templateVersion', v_template_label, 'templateVersionId', v_template.id, 'templateContentSha256', v_template.content_sha256, 'snapshot', v_snapshot);
end;
$$;

create or replace function private.ensure_client_invoice_document_snapshot(
  p_client_billing_id uuid,
  p_processor_name text default null,
  p_processor_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_billing public.client_billings;
  v_project public.projects;
  v_company public.companies;
  v_profile public.company_document_profiles;
  v_processor public.profiles;
  v_template public.document_template_versions;
  v_lines jsonb := '[]'::jsonb;
  v_total numeric(18,2) := 0;
  v_snapshot jsonb;
  v_snapshot_id uuid;
  v_existing_snapshot jsonb;
  v_existing_template_id uuid;
  v_existing_template_hash text;
  v_existing_template_version text;
  v_template_label text := 'HSC-CLIENT-INVOICE-v1';
  v_processor_name text;
  v_processor_title text;
begin
  select b.* into v_billing from public.client_billings b where b.id = p_client_billing_id for update;
  if not found then raise exception 'Client invoice was not found' using errcode = '23503'; end if;
  if v_billing.status not in ('ISSUED', 'VOIDED') then raise exception 'Only issued client invoices can have an issued document snapshot' using errcode = '42501'; end if;
  select s.id, s.snapshot, s.template_version, s.template_version_id, s.template_sha256 into v_snapshot_id, v_existing_snapshot, v_existing_template_version, v_existing_template_id, v_existing_template_hash from public.issued_document_snapshots s where s.company_id = v_billing.company_id and s.document_type = 'CLIENT_INVOICE' and s.document_id = v_billing.id;
  if v_snapshot_id is not null then
    return jsonb_build_object('id', v_snapshot_id, 'companyId', v_billing.company_id, 'documentType', 'CLIENT_INVOICE', 'documentId', v_billing.id, 'documentNumber', v_billing.billing_number, 'templateVersion', v_existing_template_version, 'templateVersionId', v_existing_template_id, 'templateContentSha256', v_existing_template_hash, 'snapshot', v_existing_snapshot);
  end if;
  select c.* into v_company from public.companies c where c.id = v_billing.company_id;
  select p.* into v_project from public.projects p where p.id = v_billing.project_id and p.company_id = v_billing.company_id;
  select p.* into v_profile from public.company_document_profiles p where p.company_id = v_billing.company_id;
  select tv.* into v_template
  from public.document_template_versions tv
  join public.document_templates t on t.id = tv.template_id and t.company_id = tv.company_id and t.document_type = tv.document_type
  where tv.company_id = v_billing.company_id and tv.document_type = 'CLIENT_INVOICE' and tv.status = 'ACTIVE' and tv.validation_state = 'VALID' and t.is_default
  order by tv.version_number desc limit 1;
  if v_template.id is not null then v_template_label := v_template.display_name || ' v' || v_template.version_number::text; end if;
  select coalesce(jsonb_agg(jsonb_build_object('lineNumber', l.line_number, 'description', l.description, 'amount', l.amount, 'notes', l.notes) order by l.line_number), '[]'::jsonb), coalesce(sum(l.amount), 0)::numeric(18,2) into v_lines, v_total from public.client_billing_lines l where l.company_id = v_billing.company_id and l.billing_id = v_billing.id;
  select p.* into v_processor from public.profiles p where p.id = coalesce(v_billing.issued_by_user_id, (select auth.uid()));
  v_processor_name := coalesce(nullif(btrim(p_processor_name), ''), nullif(btrim(v_processor.full_name), ''), 'Authorized User');
  v_processor_title := nullif(btrim(p_processor_title), '');
  v_snapshot := jsonb_build_object(
    'documentType', 'CLIENT_INVOICE', 'documentNumber', v_billing.billing_number, 'status', 'ISSUED', 'invoiceDate', v_billing.billing_date, 'dueDate', v_billing.due_date, 'paymentTerms', v_billing.payment_terms, 'currency', v_billing.currency, 'taxTreatment', v_billing.tax_treatment, 'notes', v_billing.notes, 'termsAndConditions', v_profile.default_terms,
    'company', jsonb_build_object('legalName', coalesce(v_profile.legal_name, v_company.name), 'address', v_profile.address, 'contactNumber', v_profile.contact_number, 'email', v_profile.email, 'vatTin', v_profile.vat_tin, 'logoPath', v_profile.logo_path, 'paymentInstructions', v_profile.payment_instructions),
    'project', jsonb_build_object('id', v_project.id, 'projectCode', v_project.project_code, 'projectName', v_project.project_name),
    'billTo', jsonb_build_object('name', coalesce(v_billing.client_name_snapshot, v_project.client_name), 'contactName', coalesce(v_billing.billing_contact_name, v_project.billing_contact_name), 'email', coalesce(v_billing.billing_email, v_project.billing_email), 'address', coalesce(v_billing.billing_address, v_project.billing_address, v_project.site_address), 'reference', coalesce(v_billing.client_reference_snapshot, v_project.client_reference)),
    'lines', v_lines, 'subtotal', v_total, 'totalAmount', v_total, 'processor', jsonb_build_object('name', v_processor_name, 'title', v_processor_title), 'templateVersion', v_template_label,
    'templateVersionId', v_template.id, 'templateContentSha256', v_template.content_sha256
  );
  insert into public.issued_document_snapshots (company_id, document_type, document_id, document_number, template_version, template_version_id, template_sha256, snapshot, generated_by_user_id)
  values (v_billing.company_id, 'CLIENT_INVOICE', v_billing.id, v_billing.billing_number, v_template_label, v_template.id, v_template.content_sha256, v_snapshot, coalesce(v_billing.issued_by_user_id, (select auth.uid())))
  on conflict (company_id, document_type, document_id) do nothing returning id into v_snapshot_id;
  if v_snapshot_id is null then
    select s.id, s.snapshot, s.template_version, s.template_version_id, s.template_sha256 into v_snapshot_id, v_existing_snapshot, v_existing_template_version, v_existing_template_id, v_existing_template_hash from public.issued_document_snapshots s where s.company_id = v_billing.company_id and s.document_type = 'CLIENT_INVOICE' and s.document_id = v_billing.id;
    return jsonb_build_object('id', v_snapshot_id, 'companyId', v_billing.company_id, 'documentType', 'CLIENT_INVOICE', 'documentId', v_billing.id, 'documentNumber', v_billing.billing_number, 'templateVersion', v_existing_template_version, 'templateVersionId', v_existing_template_id, 'templateContentSha256', v_existing_template_hash, 'snapshot', v_existing_snapshot);
  end if;
  return jsonb_build_object('id', v_snapshot_id, 'companyId', v_billing.company_id, 'documentType', 'CLIENT_INVOICE', 'documentId', v_billing.id, 'documentNumber', v_billing.billing_number, 'templateVersion', v_template_label, 'templateVersionId', v_template.id, 'templateContentSha256', v_template.content_sha256, 'snapshot', v_snapshot);
end;
$$;

revoke execute on function private.validate_document_template_version_mutation() from public, anon, authenticated;
revoke execute on function private.prevent_document_template_version_delete() from public, anon, authenticated;
revoke execute on function private.ensure_purchase_order_document_snapshot(uuid, text, text) from public, anon, authenticated;
revoke execute on function private.ensure_client_invoice_document_snapshot(uuid, text, text) from public, anon, authenticated;
