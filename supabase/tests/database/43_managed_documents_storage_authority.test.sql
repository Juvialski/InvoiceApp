begin;
select no_plan();

create temp table managed_storage_ids as
select
  '00000000-0000-4000-8000-000000004301'::uuid as admin_user,
  '00000000-0000-4000-8000-000000004302'::uuid as viewer_user,
  'aaaaaaaa-0000-4000-8000-000000004301'::uuid as company_id,
  'bbbbbbbb-0000-4000-8000-000000004301'::uuid as document_id,
  'cccccccc-0000-4000-8000-000000004301'::uuid as version_id,
  'companies/aaaaaaaa-0000-4000-8000-000000004301/managed-documents/bbbbbbbb-0000-4000-8000-000000004301/versions/cccccccc-0000-4000-8000-000000004301/template-output.docx'::text as storage_path;
grant select on managed_storage_ids to authenticated, service_role;

insert into auth.users (id, email, encrypted_password, created_at, updated_at)
values
  ((select admin_user from managed_storage_ids), 'managed-storage-admin@test.local', 'x', now(), now()),
  ((select viewer_user from managed_storage_ids), 'managed-storage-viewer@test.local', 'x', now(), now());

insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values (
  (select company_id from managed_storage_ids),
  'Managed Storage Runtime Company',
  'managed-storage-runtime-company',
  'ACTIVE',
  'PHP',
  'Asia/Manila',
  (select admin_user from managed_storage_ids),
  (select admin_user from managed_storage_ids)
);

insert into public.company_members (company_id, user_id, role_key, status)
values
  ((select company_id from managed_storage_ids), (select admin_user from managed_storage_ids), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_id from managed_storage_ids), (select viewer_user from managed_storage_ids), 'VIEWER', 'ACTIVE');

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_id from managed_storage_ids))
on conflict (singleton) do update set company_id = excluded.company_id;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $sql$select public.server_register_generated_document_artifact(
    jsonb_build_object(
      'companyId', (select company_id from managed_storage_ids),
      'documentId', (select document_id from managed_storage_ids),
      'versionId', (select version_id from managed_storage_ids),
      'title', 'Template-only retained artifact',
      'description', 'Must inherit template read authority all the way to Storage.',
      'category', 'GENERATED_DOCUMENT',
      'origin', 'GENERATED_DOCUMENT',
      'sourceDomain', 'DOCUMENT_TEMPLATE',
      'sourceType', 'RUNTIME_TEMPLATE',
      'artifactType', 'DOCX',
      'fileName', 'template-output.docx',
      'mimeType', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'sizeBytes', 128,
      'storageProvider', 'supabase',
      'storageBucket', 'company-managed-documents',
      'storagePath', (select storage_path from managed_storage_ids),
      'sha256', repeat('a', 64)
    ),
    (select admin_user from managed_storage_ids)
  )$sql$,
  'trusted server can register a template-scoped managed artifact for an authorized admin'
);

select throws_ok(
  $sql$select public.server_register_generated_document_artifact(
    jsonb_build_object(
      'companyId', (select company_id from managed_storage_ids),
      'documentId', 'bbbbbbbb-0000-4000-8000-000000004311',
      'versionId', 'cccccccc-0000-4000-8000-000000004311',
      'title', 'Invalid Purchase Order artifact',
      'category', 'GENERATED_ARTIFACT',
      'origin', 'GENERATED_ARTIFACT',
      'sourceDomain', 'PURCHASE_ORDER',
      'sourceType', 'PURCHASE_ORDER',
      'sourceRecordId', 'dddddddd-0000-4000-8000-000000004311',
      'artifactType', 'PDF',
      'fileName', 'missing-po.pdf',
      'mimeType', 'application/pdf',
      'sizeBytes', 128,
      'storageProvider', 'supabase',
      'storageBucket', 'company-managed-documents',
      'storagePath', format(
        'companies/%s/managed-documents/bbbbbbbb-0000-4000-8000-000000004311/versions/cccccccc-0000-4000-8000-000000004311/missing-po.pdf',
        (select company_id from managed_storage_ids)
      ),
      'sha256', repeat('b', 64)
    ),
    (select admin_user from managed_storage_ids)
  )$sql$,
  '42501',
  'Generated artifact purchase order source is outside the company',
  'generated Purchase Order artifacts cannot point at a missing or foreign source record'
);

select throws_ok(
  $sql$select public.server_register_generated_document_artifact(
    jsonb_build_object(
      'companyId', (select company_id from managed_storage_ids),
      'documentId', 'bbbbbbbb-0000-4000-8000-000000004312',
      'versionId', 'cccccccc-0000-4000-8000-000000004312',
      'title', 'Invalid Client Invoice artifact',
      'category', 'GENERATED_ARTIFACT',
      'origin', 'GENERATED_ARTIFACT',
      'sourceDomain', 'CLIENT_INVOICE',
      'sourceType', 'CLIENT_INVOICE',
      'sourceRecordId', 'dddddddd-0000-4000-8000-000000004312',
      'artifactType', 'PDF',
      'fileName', 'missing-client-invoice.pdf',
      'mimeType', 'application/pdf',
      'sizeBytes', 128,
      'storageProvider', 'supabase',
      'storageBucket', 'company-managed-documents',
      'storagePath', format(
        'companies/%s/managed-documents/bbbbbbbb-0000-4000-8000-000000004312/versions/cccccccc-0000-4000-8000-000000004312/missing-client-invoice.pdf',
        (select company_id from managed_storage_ids)
      ),
      'sha256', repeat('c', 64)
    ),
    (select admin_user from managed_storage_ids)
  )$sql$,
  '42501',
  'Generated artifact client invoice source is outside the company',
  'generated Client Invoice artifacts cannot point at a missing or foreign source record'
);
reset role;

insert into storage.objects (bucket_id, name)
values ('company-managed-documents', (select storage_path from managed_storage_ids));

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select viewer_user::text from managed_storage_ids), true);
select is(
  public.has_company_permission((select company_id from managed_storage_ids), 'documents.read'),
  true,
  'viewer retains standalone Documents read permission'
);
select is(
  public.has_company_permission((select company_id from managed_storage_ids), 'company.settings.read'),
  false,
  'viewer does not inherit template administration read permission'
);

select throws_ok(
  $sql$select storage_path from public.managed_document_versions
    where document_id = (select document_id from managed_storage_ids)$sql$,
  '42501',
  null,
  'authenticated clients cannot select raw managed Storage paths'
);
select is_empty(
  $$select 1 from public.managed_documents where id = (select document_id from managed_storage_ids)$$,
  'template-scoped managed artifact metadata stays hidden from a Documents-only viewer'
);
select is_empty(
  $$select 1 from storage.objects
    where bucket_id = 'company-managed-documents'
      and name = (select storage_path from managed_storage_ids)$$,
  'private Storage cannot bypass the source-domain authority enforced by managed metadata RLS'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select admin_user::text from managed_storage_ids), true);
select isnt_empty(
  $$select 1 from public.managed_documents where id = (select document_id from managed_storage_ids)$$,
  'authorized template admin can read retained managed artifact metadata'
);
select isnt_empty(
  $$select 1 from storage.objects
    where bucket_id = 'company-managed-documents'
      and name = (select storage_path from managed_storage_ids)$$,
  'authorized template admin can read the matching private Storage object'
);
reset role;

select * from finish();
rollback;
