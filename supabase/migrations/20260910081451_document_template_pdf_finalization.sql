-- Wave 4B: high-fidelity PDF finalization for the existing immutable DOCX
-- generation contract. PDF rows remain presentation artifacts. The exact
-- merged DOCX artifact is retained as the source provenance for every PDF.

alter table public.document_generation_evidence
  add column if not exists source_artifact_type text,
  add column if not exists source_artifact_storage_path text,
  add column if not exists source_artifact_storage_provider text,
  add column if not exists source_artifact_storage_bucket text,
  add column if not exists source_artifact_size bigint,
  add column if not exists source_artifact_sha256 text,
  add column if not exists converter_id text,
  add column if not exists converter_version text;

alter table public.document_generation_evidence
  drop constraint if exists document_generation_evidence_artifact_type_check,
  drop constraint if exists document_generation_evidence_artifact_size_check,
  drop constraint if exists document_generation_evidence_source_artifact_type_check,
  drop constraint if exists document_generation_evidence_source_artifact_storage_path_check,
  drop constraint if exists document_generation_evidence_source_artifact_storage_provider_check,
  drop constraint if exists document_generation_evidence_source_artifact_size_check,
  drop constraint if exists document_generation_evidence_source_artifact_sha256_check,
  drop constraint if exists document_generation_evidence_converter_id_check,
  drop constraint if exists document_generation_evidence_converter_version_check,
  drop constraint if exists document_generation_evidence_pdf_provenance_check;

alter table public.document_generation_evidence
  add constraint document_generation_evidence_artifact_type_check
    check (artifact_type in ('DOCX', 'PDF')),
  add constraint document_generation_evidence_artifact_size_check
    check (
      artifact_size > 0
      and (
        (artifact_type = 'DOCX' and artifact_size <= 10485760)
        or (artifact_type = 'PDF' and artifact_size <= 26214400)
      )
    ),
  add constraint document_generation_evidence_source_artifact_type_check
    check (source_artifact_type is null or source_artifact_type = 'DOCX'),
  add constraint document_generation_evidence_source_artifact_storage_path_check
    check (source_artifact_storage_path is null or source_artifact_storage_path like 'companies/%'),
  add constraint document_generation_evidence_source_artifact_storage_provider_check
    check (source_artifact_storage_provider is null or source_artifact_storage_provider in ('supabase', 's3', 'gcs', 'memory', 'custom')),
  add constraint document_generation_evidence_source_artifact_size_check
    check (source_artifact_size is null or (source_artifact_size > 0 and source_artifact_size <= 10485760)),
  add constraint document_generation_evidence_source_artifact_sha256_check
    check (source_artifact_sha256 is null or source_artifact_sha256 ~ '^[0-9a-fA-F]{64}$'),
  add constraint document_generation_evidence_converter_id_check
    check (converter_id is null or converter_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'),
  add constraint document_generation_evidence_converter_version_check
    check (converter_version is null or converter_version ~ '^[A-Za-z0-9][A-Za-z0-9._+() -]{0,119}$'),
  add constraint document_generation_evidence_pdf_provenance_check
    check (
      (
        artifact_type = 'DOCX'
        and source_artifact_type is null
        and source_artifact_storage_path is null
        and source_artifact_storage_provider is null
        and source_artifact_storage_bucket is null
        and source_artifact_size is null
        and source_artifact_sha256 is null
        and converter_id is null
        and converter_version is null
      )
      or (
        artifact_type = 'PDF'
        and source_artifact_type = 'DOCX'
        and source_artifact_storage_path is not null
        and source_artifact_storage_provider is not null
        and source_artifact_storage_bucket is not null
        and source_artifact_size is not null
        and source_artifact_sha256 is not null
        and converter_id is not null
        and converter_version is not null
      )
    );

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
  v_source_artifact_type text := upper(nullif(left(btrim(coalesce(p_payload->>'sourceArtifactType', p_payload->>'source_artifact_type', '')), 20), ''));
  v_source_artifact_path text := nullif(btrim(coalesce(p_payload->>'sourceArtifactStoragePath', p_payload->>'source_artifact_storage_path', '')), '');
  v_source_artifact_provider text := lower(nullif(left(btrim(coalesce(p_payload->>'sourceArtifactStorageProvider', p_payload->>'source_artifact_storage_provider', '')), 20), ''));
  v_source_artifact_bucket text := nullif(left(btrim(coalesce(p_payload->>'sourceArtifactStorageBucket', p_payload->>'source_artifact_storage_bucket', '')), 120), '');
  v_source_artifact_size bigint := nullif(p_payload->>'sourceArtifactSize', '')::bigint;
  v_source_artifact_sha256 text := nullif(lower(btrim(coalesce(p_payload->>'sourceArtifactSha256', p_payload->>'source_artifact_sha256', ''))), '');
  v_converter_id text := nullif(left(btrim(coalesce(p_payload->>'converterId', p_payload->>'converter_id', '')), 128), '');
  v_converter_version text := nullif(left(btrim(coalesce(p_payload->>'converterVersion', p_payload->>'converter_version', '')), 120), '');
  v_expected_artifact_path text;
  v_expected_source_artifact_path text;
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
    or v_snapshot.document_id is distinct from v_document_id
    or v_snapshot.template_sha256 is null
    or lower(v_snapshot.template_sha256) is distinct from lower(v_template.content_sha256) then
    raise exception 'Generation evidence must reference the pinned issued snapshot and template version' using errcode = '42501';
  end if;

  v_expected_artifact_path := format(
    'companies/%s/document-template-artifacts/%s/%s/%s/%s.%s',
    v_company_id,
    v_snapshot_id,
    v_document_type,
    v_template_version_id,
    v_hash,
    lower(v_artifact_type)
  );

  if v_artifact_type is null
    or v_artifact_type not in ('DOCX', 'PDF')
    or v_artifact_path is null
    or v_artifact_path is distinct from v_expected_artifact_path
    or private.storage_company_id(v_artifact_path) is distinct from v_company_id
    or v_provider not in ('supabase', 's3', 'gcs', 'memory', 'custom')
    or v_bucket is null
    or v_size is null
    or v_size <= 0
    or (v_artifact_type = 'DOCX' and v_size > 10485760)
    or (v_artifact_type = 'PDF' and v_size > 26214400)
    or v_template_hash is null
    or v_template_hash <> lower(v_template.content_sha256)
    or v_template_hash !~ '^[0-9a-f]{64}$'
    or v_hash is null
    or v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Document generation evidence integrity metadata is invalid' using errcode = '22023';
  end if;

  if v_artifact_type = 'DOCX' and (
    v_source_artifact_type is not null
    or v_source_artifact_path is not null
    or v_source_artifact_provider is not null
    or v_source_artifact_bucket is not null
    or v_source_artifact_size is not null
    or v_source_artifact_sha256 is not null
    or v_converter_id is not null
    or v_converter_version is not null
  ) then
    raise exception 'DOCX generation evidence cannot contain PDF source or converter metadata' using errcode = '22023';
  end if;

  if v_artifact_type = 'PDF' then
    v_expected_source_artifact_path := format(
      'companies/%s/document-template-artifacts/%s/%s/%s/%s.docx',
      v_company_id,
      v_snapshot_id,
      v_document_type,
      v_template_version_id,
      v_source_artifact_sha256
    );
    if v_source_artifact_type is distinct from 'DOCX'
      or v_source_artifact_path is null
      or v_source_artifact_path is distinct from v_expected_source_artifact_path
      or private.storage_company_id(v_source_artifact_path) is distinct from v_company_id
      or v_source_artifact_provider is null
      or v_source_artifact_provider not in ('supabase', 's3', 'gcs', 'memory', 'custom')
      or v_source_artifact_bucket is null
      or v_source_artifact_size is null
      or v_source_artifact_size <= 0
      or v_source_artifact_size > 10485760
      or v_source_artifact_sha256 is null
      or v_source_artifact_sha256 !~ '^[0-9a-f]{64}$'
      or v_converter_id is null
      or v_converter_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
      or v_converter_version is null
      or v_converter_version !~ '^[A-Za-z0-9][A-Za-z0-9._+() -]{0,119}$' then
      raise exception 'PDF generation evidence source or converter metadata is invalid' using errcode = '22023';
    end if;
    if not exists (
      select 1
      from public.document_generation_evidence e
      where e.company_id = v_company_id
        and e.snapshot_id = v_snapshot_id
        and e.template_version_id = v_template_version_id
        and e.document_type = v_document_type
        and e.document_id = v_document_id
        and e.artifact_type = 'DOCX'
        and e.artifact_storage_path = v_source_artifact_path
        and e.artifact_storage_provider = v_source_artifact_provider
        and e.artifact_storage_bucket = v_source_artifact_bucket
        and e.artifact_size = v_source_artifact_size
        and e.artifact_sha256 = v_source_artifact_sha256
    ) then
      raise exception 'PDF generation evidence must reference an existing merged DOCX artifact' using errcode = '42501';
    end if;
  end if;

  insert into public.document_generation_evidence (
    company_id, snapshot_id, template_version_id, document_type, document_id,
    template_content_sha256, artifact_type, artifact_storage_path,
    artifact_storage_provider, artifact_storage_bucket, artifact_size,
    artifact_sha256, source_artifact_type, source_artifact_storage_path,
    source_artifact_storage_provider, source_artifact_storage_bucket,
    source_artifact_size, source_artifact_sha256, converter_id,
    converter_version, generated_by_user_id
  ) values (
    v_company_id, v_snapshot_id, v_template_version_id, v_document_type, v_document_id,
    v_template_hash, v_artifact_type, v_artifact_path, v_provider, v_bucket, v_size,
    v_hash, v_source_artifact_type, v_source_artifact_path, v_source_artifact_provider,
    v_source_artifact_bucket, v_source_artifact_size, v_source_artifact_sha256,
    v_converter_id, v_converter_version, v_generated_by_user_id
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
