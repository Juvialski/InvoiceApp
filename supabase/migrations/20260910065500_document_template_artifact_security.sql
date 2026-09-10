-- Wave 4A hardening: keep application-owned DOCX validation and issued artifact
-- provenance behind the trusted server boundary. Browser-authenticated users
-- retain scoped reads, but cannot write template bytes, forge validated
-- metadata, activate versions, or manufacture immutable generation evidence.
--
-- Modern Supabase sb_secret_ keys are not JWTs. The Data API authorizes them
-- through the service_role Postgres role, so the exact EXECUTE grants below
-- are the server-only caller boundary. Do not inspect auth.role() inside these
-- SECURITY DEFINER functions; that claim may be absent for a modern secret key.

-- Settings access is appropriate for template source files, but it must not
-- expose issued artifacts containing supplier/client financial information.
drop policy if exists "company document templates read" on storage.objects;
create policy "company document templates read" on storage.objects
for select to authenticated
using (
  bucket_id = 'company-document-templates'
  and private.storage_company_id(name) is not null
  and (
    (
      name like 'companies/%/document-templates/%'
      and (
        (select public.has_company_permission(private.storage_company_id(name), 'company.settings.read'))
        or (select public.has_company_permission(private.storage_company_id(name), 'company.settings.manage'))
        or (private.storage_template_document_type(name) = 'PURCHASE_ORDER' and (select public.has_company_permission(private.storage_company_id(name), 'procurement.read')))
        or (private.storage_template_document_type(name) = 'CLIENT_INVOICE' and (select public.has_company_permission(private.storage_company_id(name), 'projects.read')))
      )
    )
    or
    (
      name like 'companies/%/document-template-artifacts/%'
      and (
        (private.storage_template_document_type(name) = 'PURCHASE_ORDER' and (select public.has_company_permission(private.storage_company_id(name), 'procurement.read')))
        or (private.storage_template_document_type(name) = 'CLIENT_INVOICE' and (select public.has_company_permission(private.storage_company_id(name), 'projects.read')))
      )
    )
  )
);

-- All template/artifact writes now arrive through the server after the route
-- has validated the DOCX and authorized the originating company user. The
-- service role bypasses Storage RLS; authenticated browsers intentionally have
-- no INSERT/UPDATE/DELETE policy on this bucket.
drop policy if exists "company document templates insert" on storage.objects;

-- Existing mutation functions contain the authoritative company-permission,
-- state-transition, and immutability rules. Remove direct browser execution so
-- callers cannot bypass application-owned DOCX validation by invoking them
-- directly through PostgREST.
revoke all on function public.create_document_template_version(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.update_document_template_bindings(uuid, jsonb, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.activate_document_template_version(uuid) from public, anon, authenticated, service_role;
revoke all on function public.retire_document_template_version(uuid) from public, anon, authenticated, service_role;

-- These service-only wrappers temporarily expose the already-authorized
-- originating user's identity to the existing mutation functions. That keeps
-- their established has_company_permission checks authoritative while making
-- the application server the only path to validated template mutation.
create or replace function public.server_create_document_template_version(
  p_payload jsonb,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_actor_user_id is null then
    raise exception 'Document template mutation requires an originating user' using errcode = '22023';
  end if;
  perform set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_result := public.create_document_template_version(p_payload);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return v_result;
exception when others then
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  raise;
end;
$$;

create or replace function public.server_update_document_template_bindings(
  p_version_id uuid,
  p_bindings jsonb,
  p_validation_state text,
  p_validation_report jsonb,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_actor_user_id is null then
    raise exception 'Document template mutation requires an originating user' using errcode = '22023';
  end if;
  perform set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_result := public.update_document_template_bindings(p_version_id, p_bindings, p_validation_state, p_validation_report);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return v_result;
exception when others then
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  raise;
end;
$$;

create or replace function public.server_activate_document_template_version(
  p_version_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_actor_user_id is null then
    raise exception 'Document template mutation requires an originating user' using errcode = '22023';
  end if;
  perform set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_result := public.activate_document_template_version(p_version_id);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return v_result;
exception when others then
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  raise;
end;
$$;

create or replace function public.server_retire_document_template_version(
  p_version_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if p_actor_user_id is null then
    raise exception 'Document template mutation requires an originating user' using errcode = '22023';
  end if;
  perform set_config('request.jwt.claim.sub', p_actor_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_result := public.retire_document_template_version(p_version_id);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return v_result;
exception when others then
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  raise;
end;
$$;

revoke all on function public.server_create_document_template_version(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.server_update_document_template_bindings(uuid, jsonb, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.server_activate_document_template_version(uuid, uuid) from public, anon, authenticated;
revoke all on function public.server_retire_document_template_version(uuid, uuid) from public, anon, authenticated;
grant execute on function public.server_create_document_template_version(jsonb, uuid) to service_role;
grant execute on function public.server_update_document_template_bindings(uuid, jsonb, text, jsonb, uuid) to service_role;
grant execute on function public.server_activate_document_template_version(uuid, uuid) to service_role;
grant execute on function public.server_retire_document_template_version(uuid, uuid) to service_role;

create or replace function public.record_document_generation_evidence(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_generated_by_user_id uuid := nullif(btrim(coalesce(p_payload->>'generatedByUserId', p_payload->>'generated_by_user_id', '')), '')::uuid;
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
  v_expected_artifact_path text;
  v_row public.document_generation_evidence;
  v_template public.document_template_versions;
  v_snapshot public.issued_document_snapshots;
begin
  if v_generated_by_user_id is null then
    raise exception 'Document generation evidence requires an authenticated originating user' using errcode = '22023';
  end if;
  if v_company_id is null or v_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Generation evidence must belong to the deployment company' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.company_members m
    where m.company_id = v_company_id
      and m.user_id = v_generated_by_user_id
      and m.status = 'ACTIVE'
  ) then
    raise exception 'Document generation evidence requires an active company member' using errcode = '42501';
  end if;

  select v.* into v_template
  from public.document_template_versions v
  where v.id = v_template_version_id
    and v.company_id = v_company_id
  for share;
  if not found or v_template.document_type is distinct from v_document_type then
    raise exception 'Document template version is outside the company or document type' using errcode = '42501';
  end if;

  select s.* into v_snapshot
  from public.issued_document_snapshots s
  where s.id = v_snapshot_id
    and s.company_id = v_company_id
  for share;
  if not found
    or v_snapshot.template_version_id is distinct from v_template_version_id
    or v_snapshot.document_type is distinct from v_document_type
    or v_snapshot.document_id is distinct from v_document_id then
    raise exception 'Generation evidence must reference the pinned issued snapshot and template version' using errcode = '42501';
  end if;

  v_expected_artifact_path := format(
    'companies/%s/document-template-artifacts/%s/%s/%s/%s.docx',
    v_company_id,
    v_snapshot_id,
    v_document_type,
    v_template_version_id,
    v_hash
  );

  if v_artifact_type <> 'DOCX'
    or v_artifact_path is null
    or v_artifact_path is distinct from v_expected_artifact_path
    or private.storage_company_id(v_artifact_path) is distinct from v_company_id
    or v_provider not in ('supabase', 's3', 'gcs', 'memory', 'custom')
    or v_bucket is null
    or v_size is null
    or v_size <= 0
    or v_size > 10485760
    or v_template_hash <> lower(v_template.content_sha256)
    or v_template_hash !~ '^[0-9a-f]{64}$'
    or v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Document generation evidence integrity metadata is invalid' using errcode = '22023';
  end if;

  insert into public.document_generation_evidence (
    company_id, snapshot_id, template_version_id, document_type, document_id,
    template_content_sha256, artifact_type, artifact_storage_path,
    artifact_storage_provider, artifact_storage_bucket, artifact_size,
    artifact_sha256, generated_by_user_id
  ) values (
    v_company_id, v_snapshot_id, v_template_version_id, v_document_type, v_document_id,
    v_template_hash, v_artifact_type, v_artifact_path, v_provider, v_bucket,
    v_size, v_hash, v_generated_by_user_id
  ) on conflict (snapshot_id, template_version_id, artifact_type, artifact_sha256) do nothing;

  select e.* into v_row
  from public.document_generation_evidence e
  where e.snapshot_id = v_snapshot_id
    and e.template_version_id = v_template_version_id
    and e.artifact_type = v_artifact_type
    and e.artifact_sha256 = v_hash;
  return to_jsonb(v_row);
end;
$$;

revoke all on function public.record_document_generation_evidence(jsonb) from public, anon, authenticated;
grant execute on function public.record_document_generation_evidence(jsonb) to service_role;
