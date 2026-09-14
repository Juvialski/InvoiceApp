-- Wide Documents Slice 2: dynamic company-defined document template types.
-- Existing PURCHASE_ORDER and CLIENT_INVOICE keys are seeded system types.
-- New company-defined keys select only finite, application-owned source
-- contexts and never become arbitrary SQL/object paths.

create table if not exists public.document_template_type_definitions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  type_key text not null,
  display_name text not null,
  description text,
  category text,
  source_context text not null default 'GENERAL'
    check (source_context in ('PURCHASE_ORDER', 'CLIENT_INVOICE', 'PROJECT', 'GENERAL')),
  custom_fields jsonb not null default '[]'::jsonb
    check (jsonb_typeof(custom_fields) = 'array' and jsonb_array_length(custom_fields) <= 40),
  repeat_sections jsonb not null default '[]'::jsonb
    check (jsonb_typeof(repeat_sections) = 'array' and jsonb_array_length(repeat_sections) <= 5),
  output_filename_prefix text,
  schema_version text not null default '1',
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'RETIRED')),
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_template_type_definitions_key_check
    check (type_key ~ '^[A-Za-z][A-Za-z0-9_-]{1,79}$'),
  constraint document_template_type_definitions_name_check
    check (length(btrim(display_name)) between 1 and 160),
  constraint document_template_type_definitions_description_check
    check (description is null or length(description) <= 500),
  constraint document_template_type_definitions_category_check
    check (category is null or length(category) <= 100),
  constraint document_template_type_definitions_prefix_check
    check (output_filename_prefix is null or output_filename_prefix ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$'),
  constraint document_template_type_definitions_identity_unique
    unique (company_id, type_key)
);

create index if not exists document_template_type_definitions_company_status_idx
  on public.document_template_type_definitions(company_id, status, display_name);

drop trigger if exists document_template_type_definitions_updated_at on public.document_template_type_definitions;
create trigger document_template_type_definitions_updated_at
before update on public.document_template_type_definitions
for each row execute function private.set_company_updated_at();

insert into public.document_template_type_definitions (
  company_id, type_key, display_name, description, category, source_context,
  custom_fields, repeat_sections, status
)
select c.id, 'PURCHASE_ORDER', 'Purchase Order', 'Authoritative Procurement Purchase Order templates.', 'Core workflows', 'PURCHASE_ORDER', '[]'::jsonb, '[]'::jsonb, 'ACTIVE'
from public.companies c
on conflict (company_id, type_key) do nothing;

insert into public.document_template_type_definitions (
  company_id, type_key, display_name, description, category, source_context,
  custom_fields, repeat_sections, status
)
select c.id, 'CLIENT_INVOICE', 'Client Invoice', 'Authoritative Client Billing invoice templates.', 'Core workflows', 'CLIENT_INVOICE', '[]'::jsonb, '[]'::jsonb, 'ACTIVE'
from public.companies c
on conflict (company_id, type_key) do nothing;

alter table public.document_templates drop constraint if exists document_templates_document_type_check;
alter table public.document_templates add constraint document_templates_document_type_key_check
  check (document_type ~ '^[A-Za-z][A-Za-z0-9_-]{1,79}$');
alter table public.document_templates drop constraint if exists document_templates_type_definition_fk;
alter table public.document_templates add constraint document_templates_type_definition_fk
  foreign key (company_id, document_type)
  references public.document_template_type_definitions(company_id, type_key)
  on delete restrict;

alter table public.document_template_versions drop constraint if exists document_template_versions_document_type_check;
alter table public.document_template_versions add constraint document_template_versions_document_type_key_check
  check (document_type ~ '^[A-Za-z][A-Za-z0-9_-]{1,79}$');
alter table public.document_template_versions drop constraint if exists document_template_versions_type_definition_fk;
alter table public.document_template_versions add constraint document_template_versions_type_definition_fk
  foreign key (company_id, document_type)
  references public.document_template_type_definitions(company_id, type_key)
  on delete restrict;

alter table public.document_template_type_definitions enable row level security;
revoke all on table public.document_template_type_definitions from public, anon, authenticated;
grant select on table public.document_template_type_definitions to authenticated;

drop policy if exists document_template_type_definitions_select on public.document_template_type_definitions;
create policy document_template_type_definitions_select
on public.document_template_type_definitions
for select to authenticated
using (
  (select public.has_company_permission(company_id, 'company.settings.read'))
  or (select public.has_company_permission(company_id, 'company.settings.manage'))
  or (source_context = 'PURCHASE_ORDER' and (select public.has_company_permission(company_id, 'procurement.read')))
  or (source_context in ('CLIENT_INVOICE', 'PROJECT') and (select public.has_company_permission(company_id, 'projects.read')))
);

drop policy if exists document_templates_select on public.document_templates;
create policy document_templates_select on public.document_templates
for select to authenticated
using (
  (select public.has_company_permission(company_id, 'company.settings.read'))
  or (select public.has_company_permission(company_id, 'company.settings.manage'))
  or exists (
    select 1
    from public.document_template_type_definitions d
    where d.company_id = document_templates.company_id
      and d.type_key = document_templates.document_type
      and (
        (d.source_context = 'PURCHASE_ORDER' and (select public.has_company_permission(company_id, 'procurement.read')))
        or (d.source_context in ('CLIENT_INVOICE', 'PROJECT') and (select public.has_company_permission(company_id, 'projects.read')))
      )
  )
);

drop policy if exists document_template_versions_select on public.document_template_versions;
create policy document_template_versions_select on public.document_template_versions
for select to authenticated
using (
  (select public.has_company_permission(company_id, 'company.settings.read'))
  or (select public.has_company_permission(company_id, 'company.settings.manage'))
  or exists (
    select 1
    from public.document_template_type_definitions d
    where d.company_id = document_template_versions.company_id
      and d.type_key = document_template_versions.document_type
      and (
        (d.source_context = 'PURCHASE_ORDER' and (select public.has_company_permission(company_id, 'procurement.read')))
        or (d.source_context in ('CLIENT_INVOICE', 'PROJECT') and (select public.has_company_permission(company_id, 'projects.read')))
      )
  )
);

create or replace function private.storage_template_type_key(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_name, '') like 'companies/%/document-templates/%/%/%/%' then split_part(p_name, '/', 5)
    when coalesce(p_name, '') like 'companies/%/document-template-artifacts/%/%/%/%' then split_part(p_name, '/', 5)
    else null
  end;
$$;

create or replace function private.storage_template_document_type(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select private.storage_template_type_key(p_name);
$$;

revoke execute on function private.storage_template_type_key(text) from public, anon;
grant execute on function private.storage_template_type_key(text) to authenticated, service_role;
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
    or exists (
      select 1
      from public.document_template_type_definitions d
      where d.company_id = private.storage_company_id(name)
        and d.type_key = private.storage_template_type_key(name)
        and (
          (d.source_context = 'PURCHASE_ORDER' and (select public.has_company_permission(d.company_id, 'procurement.read')))
          or (d.source_context in ('CLIENT_INVOICE', 'PROJECT') and (select public.has_company_permission(d.company_id, 'projects.read')))
        )
    )
  )
);

create or replace function public.create_document_template_type(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid := nullif(btrim(coalesce(p_payload->>'companyId', p_payload->>'company_id', '')), '')::uuid;
  v_type_key text := nullif(btrim(coalesce(p_payload->>'typeKey', p_payload->>'type_key', '')), '');
  v_display_name text := nullif(left(btrim(coalesce(p_payload->>'displayName', p_payload->>'display_name', '')), 160), '');
  v_description text := nullif(left(btrim(coalesce(p_payload->>'description', '')), 500), '');
  v_category text := nullif(left(btrim(coalesce(p_payload->>'category', '')), 100), '');
  v_source_context text := upper(btrim(coalesce(p_payload->>'sourceContext', p_payload->>'source_context', 'GENERAL')));
  v_custom_fields jsonb := coalesce(p_payload->'customFields', p_payload->'custom_fields', '[]'::jsonb);
  v_repeat_sections jsonb := coalesce(p_payload->'repeatSections', p_payload->'repeat_sections', '[]'::jsonb);
  v_output_prefix text := nullif(left(btrim(coalesce(p_payload->>'outputFilenamePrefix', p_payload->>'output_filename_prefix', '')), 80), '');
  v_row public.document_template_type_definitions;
begin
  if v_user_id is null then raise exception 'Authentication is required to create a document type' using errcode = '42501'; end if;
  if v_company_id is null or v_company_id is distinct from (select private.deployment_company_id()) then raise exception 'Document type must belong to the deployment company' using errcode = '42501'; end if;
  if not (select private.has_company_permission(v_company_id, 'company.settings.manage')) then raise exception 'Company settings management permission is required' using errcode = '42501'; end if;
  if v_type_key is null or v_type_key !~ '^[A-Za-z][A-Za-z0-9_-]{1,79}$' then raise exception 'Document type key is invalid' using errcode = '22023'; end if;
  if v_display_name is null then raise exception 'A document type name is required' using errcode = '22023'; end if;
  if v_source_context not in ('PURCHASE_ORDER', 'CLIENT_INVOICE', 'PROJECT', 'GENERAL') then raise exception 'Document type source context is invalid' using errcode = '22023'; end if;
  if jsonb_typeof(v_custom_fields) <> 'array' or jsonb_array_length(v_custom_fields) > 40 or jsonb_typeof(v_repeat_sections) <> 'array' or jsonb_array_length(v_repeat_sections) > 5 then raise exception 'Document type field schema is invalid' using errcode = '22023'; end if;
  insert into public.document_template_type_definitions (
    company_id, type_key, display_name, description, category, source_context,
    custom_fields, repeat_sections, output_filename_prefix, created_by_user_id, updated_by_user_id
  ) values (
    v_company_id, v_type_key, v_display_name, v_description, v_category, v_source_context,
    v_custom_fields, v_repeat_sections, v_output_prefix, v_user_id, v_user_id
  ) returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.update_document_template_type(
  p_type_key text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid := (select private.deployment_company_id());
  v_row public.document_template_type_definitions;
  v_display_name text := nullif(left(btrim(coalesce(p_payload->>'displayName', p_payload->>'display_name', '')), 160), '');
  v_description text := nullif(left(btrim(coalesce(p_payload->>'description', '')), 500), '');
  v_category text := nullif(left(btrim(coalesce(p_payload->>'category', '')), 100), '');
  v_custom_fields jsonb;
  v_repeat_sections jsonb;
  v_output_prefix text := nullif(left(btrim(coalesce(p_payload->>'outputFilenamePrefix', p_payload->>'output_filename_prefix', '')), 80), '');
begin
  if v_user_id is null then raise exception 'Authentication is required to update a document type' using errcode = '42501'; end if;
  if not (select private.has_company_permission(v_company_id, 'company.settings.manage')) then raise exception 'Company settings management permission is required' using errcode = '42501'; end if;
  select d.* into v_row from public.document_template_type_definitions d where d.company_id = v_company_id and d.type_key = p_type_key for update;
  if not found then raise exception 'Document type was not found in the deployment company' using errcode = '40400'; end if;
  v_custom_fields := coalesce(p_payload->'customFields', p_payload->'custom_fields', v_row.custom_fields);
  v_repeat_sections := coalesce(p_payload->'repeatSections', p_payload->'repeat_sections', v_row.repeat_sections);
  if jsonb_typeof(v_custom_fields) <> 'array' or jsonb_array_length(v_custom_fields) > 40 or jsonb_typeof(v_repeat_sections) <> 'array' or jsonb_array_length(v_repeat_sections) > 5 then raise exception 'Document type field schema is invalid' using errcode = '22023'; end if;
  if exists (select 1 from public.document_template_versions v where v.company_id = v_company_id and v.document_type = p_type_key) and (v_custom_fields <> v_row.custom_fields or v_repeat_sections <> v_row.repeat_sections) then raise exception 'A type with template history cannot change its field schema; create a new type' using errcode = '42501'; end if;
  update public.document_template_type_definitions
  set display_name = coalesce(v_display_name, display_name),
      description = v_description,
      category = v_category,
      custom_fields = v_custom_fields,
      repeat_sections = v_repeat_sections,
      output_filename_prefix = v_output_prefix,
      updated_by_user_id = v_user_id,
      updated_at = now()
  where company_id = v_company_id and type_key = p_type_key
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.retire_document_template_type(p_type_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid := (select private.deployment_company_id());
  v_row public.document_template_type_definitions;
begin
  if v_user_id is null then raise exception 'Authentication is required to retire a document type' using errcode = '42501'; end if;
  if not (select private.has_company_permission(v_company_id, 'company.settings.manage')) then raise exception 'Company settings management permission is required' using errcode = '42501'; end if;
  update public.document_template_type_definitions
  set status = 'RETIRED', updated_by_user_id = v_user_id, updated_at = now()
  where company_id = v_company_id and type_key = p_type_key
  returning * into v_row;
  if not found then raise exception 'Document type was not found in the deployment company' using errcode = '40400'; end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.server_create_document_template_type(p_payload jsonb, p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_actor_user_id is null then raise exception 'Document type mutation requires an originating user' using errcode = '22023'; end if;
  perform set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_result := public.create_document_template_type(p_payload);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return v_result;
exception when others then
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  raise;
end;
$$;

create or replace function public.server_update_document_template_type(p_type_key text, p_payload jsonb, p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_actor_user_id is null then raise exception 'Document type mutation requires an originating user' using errcode = '22023'; end if;
  perform set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_result := public.update_document_template_type(p_type_key, p_payload);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return v_result;
exception when others then
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  raise;
end;
$$;

create or replace function public.server_retire_document_template_type(p_type_key text, p_actor_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_actor_user_id is null then raise exception 'Document type mutation requires an originating user' using errcode = '22023'; end if;
  perform set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_result := public.retire_document_template_type(p_type_key);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return v_result;
exception when others then
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  raise;
end;
$$;

revoke all on function public.create_document_template_type(jsonb) from public, anon, authenticated;
revoke all on function public.update_document_template_type(text, jsonb) from public, anon, authenticated;
revoke all on function public.retire_document_template_type(text) from public, anon, authenticated;
revoke all on function public.server_create_document_template_type(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.server_update_document_template_type(text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.server_retire_document_template_type(text, uuid) from public, anon, authenticated;
grant execute on function public.server_create_document_template_type(jsonb, uuid) to service_role;
grant execute on function public.server_update_document_template_type(text, jsonb, uuid) to service_role;
grant execute on function public.server_retire_document_template_type(text, uuid) to service_role;

create or replace function public.create_document_template_version(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid := nullif(btrim(coalesce(p_payload->>'companyId', p_payload->>'company_id', '')), '')::uuid;
  v_document_type text := btrim(coalesce(p_payload->>'documentType', p_payload->>'document_type', ''));
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
  if not exists (select 1 from public.document_template_type_definitions d where d.company_id = v_company_id and d.type_key = v_document_type) then raise exception 'Document template type is unsupported' using errcode = '22023'; end if;
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

revoke all on function public.create_document_template_type(jsonb) from public, anon;
revoke all on function public.update_document_template_type(text, jsonb) from public, anon;
revoke all on function public.retire_document_template_type(text) from public, anon;
revoke all on function public.server_create_document_template_type(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.server_update_document_template_type(text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.server_retire_document_template_type(text, uuid) from public, anon, authenticated;
grant execute on function public.server_create_document_template_type(jsonb, uuid) to service_role;
grant execute on function public.server_update_document_template_type(text, jsonb, uuid) to service_role;
grant execute on function public.server_retire_document_template_type(text, uuid) to service_role;
