begin;
select no_plan();

create temp table wave4_ids as
select
  '00000000-0000-4000-8000-000000004101'::uuid as admin_user,
  'aaaaaaaa-0000-4000-8000-000000004101'::uuid as company_id,
  'bbbbbbbb-0000-4000-8000-000000004101'::uuid as other_company_id,
  '10000000-0000-4000-8000-000000004101'::uuid as project_id,
  '20000000-0000-4000-8000-000000004101'::uuid as vendor_id,
  '40000000-0000-4000-8000-000000004101'::uuid as po_one_id,
  '50000000-0000-4000-8000-000000004101'::uuid as po_one_line_id;
grant select on wave4_ids to authenticated, service_role;
create temp table wave4_template_ids (version_one_id uuid, version_two_id uuid, client_version_id uuid, template_id uuid);
create temp table wave4_billing_ids (billing_id uuid);
grant insert, select, update on wave4_template_ids to authenticated, service_role;
grant insert, select on wave4_billing_ids to authenticated, service_role;

select has_table('public', 'document_templates', 'document template roots exist');
select has_table('public', 'document_template_versions', 'document template versions exist');
select has_table('public', 'document_generation_evidence', 'document generation evidence exists');
select has_column('public', 'document_generation_evidence', 'source_artifact_sha256', 'PDF evidence retains merged DOCX source hash');
select has_column('public', 'document_generation_evidence', 'converter_id', 'PDF evidence retains converter identity');
select has_column('public', 'document_generation_evidence', 'converter_version', 'PDF evidence retains converter version');
select has_column('public', 'issued_document_snapshots', 'template_version_id', 'issued snapshots pin template versions');
select has_column('public', 'issued_document_snapshots', 'template_sha256', 'issued snapshots retain template hash');
select has_function('public', 'create_document_template_version', 'internal template creation RPC exists');
select has_function('public', 'update_document_template_bindings', 'internal template binding RPC exists');
select has_function('public', 'activate_document_template_version', 'internal template activation RPC exists');
select has_function('public', 'server_create_document_template_version', 'server template creation wrapper exists');
select has_function('public', 'server_update_document_template_bindings', 'server template binding wrapper exists');
select has_function('public', 'server_activate_document_template_version', 'server template activation wrapper exists');
select has_function('public', 'server_retire_document_template_version', 'server template retirement wrapper exists');
select has_function('public', 'record_document_generation_evidence', 'generation evidence RPC exists');
select isnt_empty($$select 1 from pg_class where oid = 'public.document_templates'::regclass and relrowsecurity$$, 'document template roots have RLS');
select isnt_empty($$select 1 from pg_class where oid = 'public.document_template_versions'::regclass and relrowsecurity$$, 'document template versions have RLS');
select isnt_empty($$select 1 from pg_class where oid = 'public.document_generation_evidence'::regclass and relrowsecurity$$, 'generation evidence has RLS');
select is_empty($$select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name in ('document_templates', 'document_template_versions', 'document_generation_evidence') and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')$$, 'template tables are not directly mutable by the browser');
select isnt_empty($$select 1 from pg_constraint where conrelid = 'public.document_template_versions'::regclass and conname = 'document_template_versions_mime_check'$$, 'template versions accept only standard DOCX MIME metadata');
select isnt_empty($$select 1 from pg_policy where polrelid = 'public.document_template_versions'::regclass and polname = 'document_template_versions_select'$$, 'template version select policy exists');
select is((select public from storage.buckets where id = 'company-document-templates'), false, 'company template Storage bucket is private');
select isnt_empty($$select 1 from pg_policy where polrelid = 'storage.objects'::regclass and polname = 'company document templates read'$$, 'company template Storage read policy exists');
select is_empty($$select 1 from pg_policy where polrelid = 'storage.objects'::regclass and polname = 'company document templates insert'$$, 'browser-authenticated users cannot write document-template bytes directly');
select ok(not has_function_privilege('authenticated', 'public.create_document_template_version(jsonb)', 'EXECUTE'), 'browser-authenticated users cannot bypass server template creation');
select ok(not has_function_privilege('authenticated', 'public.update_document_template_bindings(uuid,jsonb,text,jsonb)', 'EXECUTE'), 'browser-authenticated users cannot bypass server template validation');
select ok(not has_function_privilege('authenticated', 'public.activate_document_template_version(uuid)', 'EXECUTE'), 'browser-authenticated users cannot activate templates directly');
select ok(not has_function_privilege('authenticated', 'public.record_document_generation_evidence(jsonb)', 'EXECUTE'), 'browser-authenticated users cannot call the generation-evidence RPC directly');
select ok(has_function_privilege('service_role', 'public.server_create_document_template_version(jsonb,uuid)', 'EXECUTE'), 'trusted service role can create validated template metadata');
select ok(has_function_privilege('service_role', 'public.server_update_document_template_bindings(uuid,jsonb,text,jsonb,uuid)', 'EXECUTE'), 'trusted service role can update validated template mappings');
select ok(has_function_privilege('service_role', 'public.server_activate_document_template_version(uuid,uuid)', 'EXECUTE'), 'trusted service role can activate validated templates');
select ok(has_function_privilege('service_role', 'public.server_retire_document_template_version(uuid,uuid)', 'EXECUTE'), 'trusted service role can retire templates');
select ok(has_function_privilege('service_role', 'public.record_document_generation_evidence(jsonb)', 'EXECUTE'), 'trusted service role can record generation evidence');

insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ((select admin_user from wave4_ids), 'wave4-admin@test.local', 'x', now(), now(), now());
insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values ((select company_id from wave4_ids), 'Wave 4 Company', 'wave4-company', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from wave4_ids), (select admin_user from wave4_ids));
insert into public.company_members (company_id, user_id, role_key, status)
values ((select company_id from wave4_ids), (select admin_user from wave4_ids), 'COMPANY_ADMIN', 'ACTIVE');
insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_id from wave4_ids))
on conflict (singleton) do update set company_id = excluded.company_id;
insert into public.projects (id, user_id, company_id, project_code, project_name, status, contract_value, project_budget, currency, tax_treatment)
values ((select project_id from wave4_ids), (select admin_user from wave4_ids), (select company_id from wave4_ids), 'W4-PROJECT', 'Wave 4 Project', 'ACTIVE', 10000, 8000, 'PHP', 'VAT');
insert into public.vendors (id, user_id, company_id, name, normalized_name, default_currency)
values ((select vendor_id from wave4_ids), (select admin_user from wave4_ids), (select company_id from wave4_ids), 'Wave 4 Supplier', 'wave 4 supplier', 'PHP');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select admin_user::text from wave4_ids), true);
select throws_ok($$select public.create_document_template_version('{}'::jsonb)$$, '42501', null, 'authenticated company admins cannot invoke template mutation RPCs directly');
select throws_ok($$select public.record_document_generation_evidence('{}'::jsonb)$$, '42501', null, 'authenticated users cannot forge generation evidence');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
with created as (
  select public.server_create_document_template_version(
    jsonb_build_object(
      'companyId', (select company_id from wave4_ids),
      'documentType', 'PURCHASE_ORDER',
      'displayName', 'Wave 4 Purchase Order',
      'variantKey', 'STANDARD',
      'origin', 'STARTER',
      'sourceStoragePath', format('companies/%s/document-templates/11111111-1111-4111-8111-111111111101/PURCHASE_ORDER/11111111-1111-4111-8111-111111111102/template.docx', (select company_id from wave4_ids)),
      'contentStoragePath', format('companies/%s/document-templates/11111111-1111-4111-8111-111111111101/PURCHASE_ORDER/11111111-1111-4111-8111-111111111102/template.docx', (select company_id from wave4_ids)),
      'storageProvider', 'supabase', 'storageBucket', 'company-document-templates',
      'mimeType', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'contentSize', 100, 'contentSha256', repeat('a', 64), 'sourceSha256', repeat('a', 64),
      'bindings', '[]'::jsonb, 'validationState', 'VALID', 'validationReport', '{}'::jsonb,
      'templateId', '11111111-1111-4111-8111-111111111101', 'versionId', '11111111-1111-4111-8111-111111111102'
    ),
    (select admin_user from wave4_ids)
  ) as payload
)
insert into wave4_template_ids(version_one_id, template_id)
select (payload->>'id')::uuid, (payload->>'template_id')::uuid from created;
select is((select count(*) from public.document_template_versions where company_id = (select company_id from wave4_ids)), 1::bigint, 'trusted server creates one company-bound template version for the authorized admin');
select is((select status from public.document_template_versions where id = (select version_one_id from wave4_template_ids)), 'DRAFT', 'new template versions always begin as drafts');
select lives_ok($$select public.server_activate_document_template_version((select version_one_id from wave4_template_ids), (select admin_user from wave4_ids))$$, 'trusted server can activate a validated template for the authorized admin');
select is((select status from public.document_template_versions where id = (select version_one_id from wave4_template_ids)), 'ACTIVE', 'activated version is active');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select admin_user::text from wave4_ids), true);
insert into public.purchase_orders (id, company_id, po_number, vendor_id, project_id, currency, status, created_by_user_id, updated_by_user_id)
values ((select po_one_id from wave4_ids), (select company_id from wave4_ids), 'W4-PO-001', (select vendor_id from wave4_ids), (select project_id from wave4_ids), 'PHP', 'DRAFT', (select admin_user from wave4_ids), (select admin_user from wave4_ids));
insert into public.purchase_order_lines (id, company_id, purchase_order_id, line_number, description, quantity, unit, unit_price, amount)
values ((select po_one_line_id from wave4_ids), (select company_id from wave4_ids), (select po_one_id from wave4_ids), 1, 'Wave 4 material', 2, 'pcs', 100, 200);
select lives_ok($$select public.transition_purchase_order_status((select po_one_id from wave4_ids), 'APPROVED', null)$$, 'PO can be approved with template configured');
select lives_ok($$select public.transition_purchase_order_status((select po_one_id from wave4_ids), 'ISSUED', null)$$, 'PO can be issued with template configured');
select is((select template_version_id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_one_id from wave4_ids)), (select version_one_id from wave4_template_ids), 'issuance pins the active immutable template version');
select is((select template_sha256 from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_one_id from wave4_ids)), repeat('a', 64), 'issuance pins the template content hash');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok($$select public.record_document_generation_evidence(jsonb_build_object(
  'generatedByUserId', (select admin_user from wave4_ids),
  'companyId', (select company_id from wave4_ids),
  'snapshotId', (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_one_id from wave4_ids)),
  'templateVersionId', (select version_one_id from wave4_template_ids), 'documentType', 'PURCHASE_ORDER', 'documentId', (select po_one_id from wave4_ids),
  'templateContentSha256', repeat('a', 64), 'artifactType', 'DOCX',
  'artifactStoragePath', format(
    'companies/%s/document-template-artifacts/%s/PURCHASE_ORDER/%s/%s.docx',
    (select company_id from wave4_ids),
    (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_one_id from wave4_ids)),
    (select version_one_id from wave4_template_ids),
    repeat('b', 64)
  ),
  'artifactStorageProvider', 'supabase', 'artifactStorageBucket', 'company-document-templates', 'artifactSize', 120, 'artifactSha256', repeat('b', 64)
))$$, 'trusted server can record issued DOCX evidence against the pinned snapshot and deterministic artifact path');
select is((select count(*) from public.document_generation_evidence where snapshot_id = (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_one_id from wave4_ids))), 1::bigint, 'generation evidence is durable and company scoped');
select is((select generated_by_user_id from public.document_generation_evidence where snapshot_id = (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_one_id from wave4_ids))), (select admin_user from wave4_ids), 'generation evidence retains the originating authenticated user');
select lives_ok($$select public.record_document_generation_evidence(jsonb_build_object(
  'generatedByUserId', (select admin_user from wave4_ids),
  'companyId', (select company_id from wave4_ids),
  'snapshotId', (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_one_id from wave4_ids)),
  'templateVersionId', (select version_one_id from wave4_template_ids),
  'documentType', 'PURCHASE_ORDER',
  'documentId', (select po_one_id from wave4_ids),
  'templateContentSha256', repeat('a', 64),
  'artifactType', 'PDF',
  'artifactStoragePath', format(
    'companies/%s/document-template-artifacts/%s/PURCHASE_ORDER/%s/%s.pdf',
    (select company_id from wave4_ids),
    (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_one_id from wave4_ids)),
    (select version_one_id from wave4_template_ids),
    repeat('c', 64)
  ),
  'artifactStorageProvider', 'supabase',
  'artifactStorageBucket', 'company-document-templates',
  'artifactSize', 240,
  'artifactSha256', repeat('c', 64),
  'sourceArtifactType', 'DOCX',
  'sourceArtifactStoragePath', format(
    'companies/%s/document-template-artifacts/%s/PURCHASE_ORDER/%s/%s.docx',
    (select company_id from wave4_ids),
    (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_one_id from wave4_ids)),
    (select version_one_id from wave4_template_ids),
    repeat('b', 64)
  ),
  'sourceArtifactStorageProvider', 'supabase',
  'sourceArtifactStorageBucket', 'company-document-templates',
  'sourceArtifactSize', 120,
  'sourceArtifactSha256', repeat('b', 64),
  'converterId', 'libreoffice',
  'converterVersion', 'LibreOffice 25.2.3.2'
))$$, 'trusted server can record PDF evidence against the exact merged DOCX source artifact');
select is((select count(*) from public.document_generation_evidence where snapshot_id = (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_one_id from wave4_ids))), 2::bigint, 'PDF evidence is appended without replacing the immutable DOCX evidence');
select is((select source_artifact_sha256 from public.document_generation_evidence where snapshot_id = (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_one_id from wave4_ids)) and artifact_type = 'PDF'), repeat('b', 64), 'PDF evidence retains the exact merged DOCX hash');
select is((select converter_id from public.document_generation_evidence where snapshot_id = (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_one_id from wave4_ids)) and artifact_type = 'PDF'), 'libreoffice', 'PDF evidence retains converter identity');
select throws_ok($$select public.record_document_generation_evidence(jsonb_build_object(
  'generatedByUserId', (select admin_user from wave4_ids), 'companyId', (select company_id from wave4_ids),
  'snapshotId', (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_one_id from wave4_ids)),
  'templateVersionId', (select version_one_id from wave4_template_ids), 'documentType', 'PURCHASE_ORDER', 'documentId', (select po_one_id from wave4_ids),
  'templateContentSha256', repeat('a', 64), 'artifactType', 'PDF',
  'artifactStoragePath', format('companies/%s/document-template-artifacts/%s/PURCHASE_ORDER/%s/%s.pdf', (select company_id from wave4_ids), (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_one_id from wave4_ids)), (select version_one_id from wave4_template_ids), repeat('d', 64)),
  'artifactStorageProvider', 'supabase', 'artifactStorageBucket', 'company-document-templates', 'artifactSize', 240, 'artifactSha256', repeat('d', 64),
  'sourceArtifactType', 'DOCX',
  'sourceArtifactStoragePath', format('companies/%s/document-template-artifacts/%s/PURCHASE_ORDER/%s/%s.docx', (select company_id from wave4_ids), (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_one_id from wave4_ids)), (select version_one_id from wave4_template_ids), repeat('d', 64)),
  'sourceArtifactStorageProvider', 'supabase', 'sourceArtifactStorageBucket', 'company-document-templates', 'sourceArtifactSize', 120, 'sourceArtifactSha256', repeat('d', 64),
  'converterId', 'libreoffice', 'converterVersion', 'LibreOffice 25.2.3.2'
))$$, '42501', null, 'PDF evidence cannot reference a DOCX source artifact that has no immutable evidence row');

with created as (
  select public.server_create_document_template_version(
    jsonb_build_object(
      'companyId', (select company_id from wave4_ids), 'documentType', 'CLIENT_INVOICE',
      'displayName', 'Wave 4 Client Invoice', 'variantKey', 'STANDARD', 'origin', 'STARTER',
      'sourceStoragePath', format('companies/%s/document-templates/33333333-3333-4333-8333-333333333301/CLIENT_INVOICE/33333333-3333-4333-8333-333333333302/template.docx', (select company_id from wave4_ids)),
      'contentStoragePath', format('companies/%s/document-templates/33333333-3333-4333-8333-333333333301/CLIENT_INVOICE/33333333-3333-4333-8333-333333333302/template.docx', (select company_id from wave4_ids)),
      'storageProvider', 'supabase', 'storageBucket', 'company-document-templates', 'mimeType', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'contentSize', 100, 'contentSha256', repeat('f', 64), 'sourceSha256', repeat('f', 64), 'bindings', '[]'::jsonb, 'validationState', 'VALID', 'validationReport', '{}'::jsonb,
      'templateId', '33333333-3333-4333-8333-333333333301', 'versionId', '33333333-3333-4333-8333-333333333302'
    ),
    (select admin_user from wave4_ids)
  ) as payload
)
insert into wave4_template_ids(client_version_id, template_id)
select (payload->>'id')::uuid, (payload->>'template_id')::uuid from created;
select lives_ok($$select public.server_activate_document_template_version((select client_version_id from wave4_template_ids where client_version_id is not null), (select admin_user from wave4_ids))$$, 'trusted server can activate the validated client invoice template');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select admin_user::text from wave4_ids), true);
with created as (
  select public.create_or_update_client_billing(
    jsonb_build_object('companyId', (select company_id from wave4_ids), 'projectId', (select project_id from wave4_ids), 'billingNumber', 'W4-INV-001', 'billingDate', '2026-09-10', 'currency', 'PHP'),
    jsonb_build_array(jsonb_build_object('description', 'Wave 4 billed work', 'amount', 200))
  ) as payload
)
insert into wave4_billing_ids(billing_id)
select (payload->'billing'->>'id')::uuid from created;
select lives_ok($$select public.transition_client_billing((select billing_id from wave4_billing_ids), 'SUBMITTED', null)$$, 'client invoice can be submitted with a template configured');
select lives_ok($$select public.transition_client_billing((select billing_id from wave4_billing_ids), 'ISSUED', null)$$, 'client invoice can be issued with a template configured');
select is((select template_version_id from public.issued_document_snapshots where document_type = 'CLIENT_INVOICE' and document_id = (select billing_id from wave4_billing_ids)), (select client_version_id from wave4_template_ids where client_version_id is not null), 'client invoice issuance pins its active immutable template version');
select is((select template_sha256 from public.issued_document_snapshots where document_type = 'CLIENT_INVOICE' and document_id = (select billing_id from wave4_billing_ids)), repeat('f', 64), 'client invoice issuance pins its template content hash');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
with created as (
  select public.server_create_document_template_version(
    jsonb_build_object(
      'companyId', (select company_id from wave4_ids), 'templateId', (select template_id from wave4_template_ids where version_one_id is not null),
      'documentType', 'PURCHASE_ORDER', 'displayName', 'Wave 4 Purchase Order v2', 'origin', 'DUPLICATED',
      'sourceStoragePath', format('companies/%s/document-templates/11111111-1111-4111-8111-111111111101/PURCHASE_ORDER/22222222-2222-4222-8222-222222222202/template.docx', (select company_id from wave4_ids)),
      'contentStoragePath', format('companies/%s/document-templates/11111111-1111-4111-8111-111111111101/PURCHASE_ORDER/22222222-2222-4222-8222-222222222202/template.docx', (select company_id from wave4_ids)),
      'storageProvider', 'supabase', 'storageBucket', 'company-document-templates', 'mimeType', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'contentSize', 100, 'contentSha256', repeat('c', 64), 'sourceSha256', repeat('c', 64), 'bindings', '[]'::jsonb, 'validationState', 'VALID', 'validationReport', '{}'::jsonb
    ),
    (select admin_user from wave4_ids)
  ) as payload
)
insert into wave4_template_ids(version_two_id, template_id)
select (payload->>'id')::uuid, (payload->>'template_id')::uuid from created;
select lives_ok($$select public.server_activate_document_template_version((select version_two_id from wave4_template_ids where version_two_id is not null), (select admin_user from wave4_ids))$$, 'a second validated version can replace the active template');
select is((select status from public.document_template_versions where id = (select version_one_id from wave4_template_ids where version_one_id is not null)), 'RETIRED', 'replacing the active template retires only the prior version');
select is((select template_version_id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_one_id from wave4_ids)), (select version_one_id from wave4_template_ids where version_one_id is not null), 'historical issued documents retain the original template version after replacement');
select is((select count(*) from public.document_generation_evidence where template_version_id = (select version_one_id from wave4_template_ids where version_one_id is not null)), 2::bigint, 'historical DOCX and PDF generation evidence remains readable after replacement');
select throws_ok($$select public.server_create_document_template_version(jsonb_build_object('companyId', (select other_company_id from wave4_ids), 'documentType', 'PURCHASE_ORDER', 'displayName', 'Cross company', 'origin', 'STARTER', 'sourceStoragePath', format('companies/%s/document-templates/x/PURCHASE_ORDER/y/template.docx', (select other_company_id from wave4_ids)), 'contentStoragePath', format('companies/%s/document-templates/x/PURCHASE_ORDER/y/template.docx', (select other_company_id from wave4_ids)), 'storageBucket', 'company-document-templates', 'mimeType', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'contentSize', 100, 'contentSha256', repeat('e', 64)), (select admin_user from wave4_ids))$$, '42501', null, 'server wrapper cannot target another deployment company');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select admin_user::text from wave4_ids), true);
select throws_ok($$update public.document_template_versions set content_sha256 = repeat('d', 64) where id = (select version_one_id from wave4_template_ids where version_one_id is not null)$$, '42501', null, 'template content cannot be edited directly');
select throws_ok($$delete from public.document_template_versions where id = (select version_one_id from wave4_template_ids where version_one_id is not null)$$, '42501', null, 'template versions cannot be deleted');

select * from finish();
rollback;
