begin;
select no_plan();

create temp table wave4b_ids as
select
  '00000000-0000-4000-8000-000000004201'::uuid as admin_user,
  'aaaaaaaa-0000-4000-8000-000000004201'::uuid as company_id,
  '10000000-0000-4000-8000-000000004201'::uuid as project_id,
  '20000000-0000-4000-8000-000000004201'::uuid as vendor_id,
  '40000000-0000-4000-8000-000000004201'::uuid as po_id,
  '50000000-0000-4000-8000-000000004201'::uuid as po_line_id,
  '11111111-1111-4111-8111-111111114201'::uuid as po_template_id,
  '11111111-1111-4111-8111-111111114202'::uuid as po_version_id,
  '33333333-3333-4333-8333-333333334201'::uuid as invoice_template_id,
  '33333333-3333-4333-8333-333333334202'::uuid as invoice_version_id;
grant select on wave4b_ids to authenticated, service_role;

create temp table wave4b_billing_ids (billing_id uuid);
grant insert, select on wave4b_billing_ids to authenticated, service_role;

insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ((select admin_user from wave4b_ids), 'wave4b-lifecycle@test.local', 'x', now(), now(), now());
insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values ((select company_id from wave4b_ids), 'Wave 4B Lifecycle Company', 'wave4b-lifecycle', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from wave4b_ids), (select admin_user from wave4b_ids));
insert into public.company_members (company_id, user_id, role_key, status)
values ((select company_id from wave4b_ids), (select admin_user from wave4b_ids), 'COMPANY_ADMIN', 'ACTIVE');
insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_id from wave4b_ids))
on conflict (singleton) do update set company_id = excluded.company_id;
insert into public.projects (id, user_id, company_id, project_code, project_name, status, contract_value, project_budget, currency, tax_treatment)
values ((select project_id from wave4b_ids), (select admin_user from wave4b_ids), (select company_id from wave4b_ids), 'W4B-PROJECT', 'Wave 4B Lifecycle Project', 'ACTIVE', 10000, 8000, 'PHP', 'VAT');
insert into public.vendors (id, user_id, company_id, name, normalized_name, default_currency)
values ((select vendor_id from wave4b_ids), (select admin_user from wave4b_ids), (select company_id from wave4b_ids), 'Wave 4B Supplier', 'wave 4b supplier', 'PHP');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok($$select public.server_create_document_template_version(
  jsonb_build_object(
    'companyId', (select company_id from wave4b_ids),
    'documentType', 'PURCHASE_ORDER',
    'displayName', 'Wave 4B Purchase Order',
    'variantKey', 'STANDARD',
    'origin', 'STARTER',
    'sourceStoragePath', format('companies/%s/document-templates/%s/PURCHASE_ORDER/%s/template.docx', (select company_id from wave4b_ids), (select po_template_id from wave4b_ids), (select po_version_id from wave4b_ids)),
    'contentStoragePath', format('companies/%s/document-templates/%s/PURCHASE_ORDER/%s/template.docx', (select company_id from wave4b_ids), (select po_template_id from wave4b_ids), (select po_version_id from wave4b_ids)),
    'storageProvider', 'supabase',
    'storageBucket', 'company-document-templates',
    'mimeType', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'contentSize', 100,
    'contentSha256', repeat('a', 64),
    'sourceSha256', repeat('a', 64),
    'bindings', '[]'::jsonb,
    'validationState', 'VALID',
    'validationReport', '{}'::jsonb,
    'templateId', (select po_template_id from wave4b_ids),
    'versionId', (select po_version_id from wave4b_ids)
  ),
  (select admin_user from wave4b_ids)
)$$, 'trusted server creates the PO template fixture');
select lives_ok($$select public.server_activate_document_template_version((select po_version_id from wave4b_ids), (select admin_user from wave4b_ids))$$, 'trusted server activates the PO template fixture');

select lives_ok($$select public.server_create_document_template_version(
  jsonb_build_object(
    'companyId', (select company_id from wave4b_ids),
    'documentType', 'CLIENT_INVOICE',
    'displayName', 'Wave 4B Client Invoice',
    'variantKey', 'STANDARD',
    'origin', 'STARTER',
    'sourceStoragePath', format('companies/%s/document-templates/%s/CLIENT_INVOICE/%s/template.docx', (select company_id from wave4b_ids), (select invoice_template_id from wave4b_ids), (select invoice_version_id from wave4b_ids)),
    'contentStoragePath', format('companies/%s/document-templates/%s/CLIENT_INVOICE/%s/template.docx', (select company_id from wave4b_ids), (select invoice_template_id from wave4b_ids), (select invoice_version_id from wave4b_ids)),
    'storageProvider', 'supabase',
    'storageBucket', 'company-document-templates',
    'mimeType', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'contentSize', 100,
    'contentSha256', repeat('f', 64),
    'sourceSha256', repeat('f', 64),
    'bindings', '[]'::jsonb,
    'validationState', 'VALID',
    'validationReport', '{}'::jsonb,
    'templateId', (select invoice_template_id from wave4b_ids),
    'versionId', (select invoice_version_id from wave4b_ids)
  ),
  (select admin_user from wave4b_ids)
)$$, 'trusted server creates the client invoice template fixture');
select lives_ok($$select public.server_activate_document_template_version((select invoice_version_id from wave4b_ids), (select admin_user from wave4b_ids))$$, 'trusted server activates the client invoice template fixture');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select admin_user::text from wave4b_ids), true);
insert into public.purchase_orders (id, company_id, po_number, vendor_id, project_id, currency, status, created_by_user_id, updated_by_user_id)
values ((select po_id from wave4b_ids), (select company_id from wave4b_ids), 'W4B-PO-001', (select vendor_id from wave4b_ids), (select project_id from wave4b_ids), 'PHP', 'DRAFT', (select admin_user from wave4b_ids), (select admin_user from wave4b_ids));
insert into public.purchase_order_lines (id, company_id, purchase_order_id, line_number, description, quantity, unit, unit_price, amount)
values ((select po_line_id from wave4b_ids), (select company_id from wave4b_ids), (select po_id from wave4b_ids), 1, 'Wave 4B lifecycle material', 2, 'pcs', 100, 200);
select lives_ok($$select public.transition_purchase_order_status((select po_id from wave4b_ids), 'APPROVED', null)$$, 'PO fixture can be approved');
select lives_ok($$select public.transition_purchase_order_status((select po_id from wave4b_ids), 'ISSUED', null)$$, 'PO fixture can be issued and pinned');

with created as (
  select public.create_or_update_client_billing(
    jsonb_build_object(
      'companyId', (select company_id from wave4b_ids),
      'projectId', (select project_id from wave4b_ids),
      'billingNumber', 'W4B-INV-001',
      'billingDate', '2026-09-10',
      'currency', 'PHP'
    ),
    jsonb_build_array(jsonb_build_object('description', 'Wave 4B lifecycle billing', 'amount', 200))
  ) as payload
)
insert into wave4b_billing_ids(billing_id)
select (payload->'billing'->>'id')::uuid from created;
select lives_ok($$select public.transition_client_billing((select billing_id from wave4b_billing_ids), 'SUBMITTED', null)$$, 'client invoice fixture can be submitted');
select lives_ok($$select public.transition_client_billing((select billing_id from wave4b_billing_ids), 'ISSUED', null)$$, 'client invoice fixture can be issued and pinned');

select is((select count(*) from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_id from wave4b_ids)), 1::bigint, 'PO issuance snapshot exists before cancellation');
select is((select count(*) from public.issued_document_snapshots where document_type = 'CLIENT_INVOICE' and document_id = (select billing_id from wave4b_billing_ids)), 1::bigint, 'client invoice issuance snapshot exists before voiding');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
update public.purchase_orders set status = 'CANCELLED' where id = (select po_id from wave4b_ids);
update public.client_billings set status = 'VOIDED' where id = (select billing_id from wave4b_billing_ids);

select throws_ok($$select public.record_document_generation_evidence(jsonb_build_object(
  'generatedByUserId', (select admin_user from wave4b_ids),
  'companyId', (select company_id from wave4b_ids),
  'snapshotId', (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_id from wave4b_ids)),
  'templateVersionId', (select po_version_id from wave4b_ids),
  'documentType', 'PURCHASE_ORDER',
  'documentId', (select po_id from wave4b_ids),
  'templateContentSha256', repeat('a', 64),
  'artifactType', 'DOCX',
  'artifactStoragePath', format('companies/%s/document-template-artifacts/%s/PURCHASE_ORDER/%s/%s.docx', (select company_id from wave4b_ids), (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_id from wave4b_ids)), (select po_version_id from wave4b_ids), repeat('b', 64)),
  'artifactStorageProvider', 'supabase',
  'artifactStorageBucket', 'company-document-templates',
  'artifactSize', 120,
  'artifactSha256', repeat('b', 64)
))$$, '42501', null, 'cancelled PO cannot create new company-template generation evidence from its old issuance snapshot');

select throws_ok($$select public.record_document_generation_evidence(jsonb_build_object(
  'generatedByUserId', (select admin_user from wave4b_ids),
  'companyId', (select company_id from wave4b_ids),
  'snapshotId', (select id from public.issued_document_snapshots where document_type = 'CLIENT_INVOICE' and document_id = (select billing_id from wave4b_billing_ids)),
  'templateVersionId', (select invoice_version_id from wave4b_ids),
  'documentType', 'CLIENT_INVOICE',
  'documentId', (select billing_id from wave4b_billing_ids),
  'templateContentSha256', repeat('f', 64),
  'artifactType', 'DOCX',
  'artifactStoragePath', format('companies/%s/document-template-artifacts/%s/CLIENT_INVOICE/%s/%s.docx', (select company_id from wave4b_ids), (select id from public.issued_document_snapshots where document_type = 'CLIENT_INVOICE' and document_id = (select billing_id from wave4b_billing_ids)), (select invoice_version_id from wave4b_ids), repeat('e', 64)),
  'artifactStorageProvider', 'supabase',
  'artifactStorageBucket', 'company-document-templates',
  'artifactSize', 120,
  'artifactSha256', repeat('e', 64)
))$$, '42501', null, 'voided client invoice cannot create new company-template generation evidence from its old issuance snapshot');

select * from finish();
rollback;