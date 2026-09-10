-- Harden issued DOCX generation evidence so immutable history can only be
-- recorded by the trusted server after a successful, authorized generation.
-- The originating authenticated user is still preserved explicitly for audit.

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
    raise exception 'Document generation actor is required' using errcode = '42501';
  end if;
  if v_company_id is null or v_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Generation evidence must belong to the deployment company' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.company_members cm
    where cm.company_id = v_company_id
      and cm.user_id = v_generated_by_user_id
      and cm.status = 'ACTIVE'
  ) then
    raise exception 'Document generation actor is not an active company member' using errcode = '42501';
  end if;

  select v.* into v_template
  from public.document_template_versions v
  where v.id = v_template_version_id and v.company_id = v_company_id
  for share;
  if not found then
    raise exception 'Document template version is outside the company' using errcode = '42501';
  end if;

  select s.* into v_snapshot
  from public.issued_document_snapshots s
  where s.id = v_snapshot_id and s.company_id = v_company_id
  for share;
  if not found
     or v_snapshot.template_version_id is distinct from v_template_version_id
     or v_snapshot.document_type is distinct from v_document_type
     or v_snapshot.document_id is distinct from v_document_id then
    raise exception 'Generation evidence must reference the pinned issued snapshot and template version' using errcode = '42501';
  end if;

  if v_artifact_type <> 'DOCX'
     or v_artifact_path is null
     or private.storage_company_id(v_artifact_path) is distinct from v_company_id
     or v_bucket is null
     or v_size is null
     or v_size <= 0
     or v_size > 10485760
     or v_template_hash <> lower(v_template.content_sha256)
     or v_template_hash !~ '^[0-9a-f]{64}$'
     or v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Document generation evidence integrity metadata is invalid' using errcode = '22023';
  end if;

  v_expected_artifact_path := format(
    'companies/%s/document-template-artifacts/%s/%s/%s/%s.docx',
    v_company_id,
    v_snapshot_id,
    v_document_type,
    v_template_version_id,
    v_hash
  );
  if v_artifact_path is distinct from v_expected_artifact_path then
    raise exception 'Document generation artifact path does not match its immutable identity' using errcode = '22023';
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

revoke all on function public.record_document_generation_evidence(jsonb) from public;
revoke all on function public.record_document_generation_evidence(jsonb) from anon;
revoke all on function public.record_document_generation_evidence(jsonb) from authenticated;
grant execute on function public.record_document_generation_evidence(jsonb) to service_role;

comment on function public.record_document_generation_evidence(jsonb) is
  'Server/service-role-only immutable DOCX generation evidence recorder. The trusted server supplies the already-authorized originating user as generatedByUserId.';
