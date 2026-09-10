begin;
select no_plan();

create temp table wave4c_ids as
select
  '00000000-0000-4000-8000-000000004301'::uuid as admin_user,
  '00000000-0000-4000-8000-000000004302'::uuid as viewer_user,
  'aaaaaaaa-0000-4000-8000-000000004301'::uuid as company_id,
  '10000000-0000-4000-8000-000000004301'::uuid as project_id,
  '20000000-0000-4000-8000-000000004301'::uuid as vendor_id,
  '40000000-0000-4000-8000-000000004301'::uuid as po_id,
  '50000000-0000-4000-8000-000000004301'::uuid as po_line_id,
  '11111111-1111-4111-8111-111111114301'::uuid as template_id,
  '11111111-1111-4111-8111-111111114302'::uuid as version_id;
grant select on wave4c_ids to authenticated, service_role;

insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ((select admin_user from wave4c_ids), 'wave4c-admin@test.local', 'x', now(), now(), now()),
  ((select viewer_user from wave4c_ids), 'wave4c-viewer@test.local', 'x', now(), now(), now());
insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values ((select company_id from wave4c_ids), 'Wave 4C Delivery Company', 'wave4c-delivery', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from wave4c_ids), (select admin_user from wave4c_ids));
insert into public.company_members (company_id, user_id, role_key, status)
values
  ((select company_id from wave4c_ids), (select admin_user from wave4c_ids), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_id from wave4c_ids), (select viewer_user from wave4c_ids), 'VIEWER', 'ACTIVE');
insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_id from wave4c_ids))
on conflict (singleton) do update set company_id = excluded.company_id;
insert into public.projects (id, user_id, company_id, project_code, project_name, status, contract_value, project_budget, currency, tax_treatment)
values ((select project_id from wave4c_ids), (select admin_user from wave4c_ids), (select company_id from wave4c_ids), 'W4C-PROJECT', 'Wave 4C Delivery Project', 'ACTIVE', 10000, 8000, 'PHP', 'VAT');
insert into public.vendors (id, user_id, company_id, name, normalized_name, default_currency)
values ((select vendor_id from wave4c_ids), (select admin_user from wave4c_ids), (select company_id from wave4c_ids), 'Wave 4C Supplier', 'wave 4c supplier', 'PHP');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok($$select public.server_create_document_template_version(
  jsonb_build_object(
    'companyId', (select company_id from wave4c_ids),
    'documentType', 'PURCHASE_ORDER',
    'displayName', 'Wave 4C Purchase Order',
    'variantKey', 'STANDARD',
    'origin', 'STARTER',
    'sourceStoragePath', format('companies/%s/document-templates/%s/PURCHASE_ORDER/%s/template.docx', (select company_id from wave4c_ids), (select template_id from wave4c_ids), (select version_id from wave4c_ids)),
    'contentStoragePath', format('companies/%s/document-templates/%s/PURCHASE_ORDER/%s/template.docx', (select company_id from wave4c_ids), (select template_id from wave4c_ids), (select version_id from wave4c_ids)),
    'storageProvider', 'supabase',
    'storageBucket', 'company-document-templates',
    'mimeType', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'contentSize', 100,
    'contentSha256', repeat('a', 64),
    'sourceSha256', repeat('a', 64),
    'bindings', '[]'::jsonb,
    'validationState', 'VALID',
    'validationReport', '{}'::jsonb,
    'templateId', (select template_id from wave4c_ids),
    'versionId', (select version_id from wave4c_ids)
  ),
  (select admin_user from wave4c_ids)
)$$, 'trusted server creates the company-template fixture');
select lives_ok($$select public.server_activate_document_template_version((select version_id from wave4c_ids), (select admin_user from wave4c_ids))$$, 'trusted server activates the company-template fixture');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select admin_user::text from wave4c_ids), true);
insert into public.purchase_orders (id, company_id, po_number, vendor_id, project_id, currency, status, created_by_user_id, updated_by_user_id)
values ((select po_id from wave4c_ids), (select company_id from wave4c_ids), 'W4C-PO-001', (select vendor_id from wave4c_ids), (select project_id from wave4c_ids), 'PHP', 'DRAFT', (select admin_user from wave4c_ids), (select admin_user from wave4c_ids));
insert into public.purchase_order_lines (id, company_id, purchase_order_id, line_number, description, quantity, unit, unit_price, amount)
values ((select po_line_id from wave4c_ids), (select company_id from wave4c_ids), (select po_id from wave4c_ids), 1, 'Wave 4C delivery material', 2, 'pcs', 100, 200);
select lives_ok($$select public.transition_purchase_order_status((select po_id from wave4c_ids), 'APPROVED', null)$$, 'PO fixture can be approved');
select lives_ok($$select public.transition_purchase_order_status((select po_id from wave4c_ids), 'ISSUED', null)$$, 'PO fixture can be issued with a pinned template');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok($$select public.record_document_generation_evidence(jsonb_build_object(
  'generatedByUserId', (select admin_user from wave4c_ids),
  'companyId', (select company_id from wave4c_ids),
  'snapshotId', (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_id from wave4c_ids)),
  'templateVersionId', (select version_id from wave4c_ids),
  'documentType', 'PURCHASE_ORDER',
  'documentId', (select po_id from wave4c_ids),
  'templateContentSha256', repeat('a', 64),
  'artifactType', 'DOCX',
  'artifactStoragePath', format('companies/%s/document-template-artifacts/%s/PURCHASE_ORDER/%s/%s.docx', (select company_id from wave4c_ids), (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_id from wave4c_ids)), (select version_id from wave4c_ids), repeat('b', 64)),
  'artifactStorageProvider', 'supabase',
  'artifactStorageBucket', 'company-document-templates',
  'artifactSize', 1024,
  'artifactSha256', repeat('b', 64)
))$$, 'trusted server records the merged DOCX evidence');
select lives_ok($$select public.record_document_generation_evidence(jsonb_build_object(
  'generatedByUserId', (select admin_user from wave4c_ids),
  'companyId', (select company_id from wave4c_ids),
  'snapshotId', (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_id from wave4c_ids)),
  'templateVersionId', (select version_id from wave4c_ids),
  'documentType', 'PURCHASE_ORDER',
  'documentId', (select po_id from wave4c_ids),
  'templateContentSha256', repeat('a', 64),
  'artifactType', 'PDF',
  'artifactStoragePath', format('companies/%s/document-template-artifacts/%s/PURCHASE_ORDER/%s/%s.pdf', (select company_id from wave4c_ids), (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_id from wave4c_ids)), (select version_id from wave4c_ids), repeat('c', 64)),
  'artifactStorageProvider', 'supabase',
  'artifactStorageBucket', 'company-document-templates',
  'artifactSize', 2048,
  'artifactSha256', repeat('c', 64),
  'sourceArtifactType', 'DOCX',
  'sourceArtifactStoragePath', format('companies/%s/document-template-artifacts/%s/PURCHASE_ORDER/%s/%s.docx', (select company_id from wave4c_ids), (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_id from wave4c_ids)), (select version_id from wave4c_ids), repeat('b', 64)),
  'sourceArtifactStorageProvider', 'supabase',
  'sourceArtifactStorageBucket', 'company-document-templates',
  'sourceArtifactSize', 1024,
  'sourceArtifactSha256', repeat('b', 64),
  'converterId', 'libreoffice',
  'converterVersion', 'LibreOffice 25.2'
))$$, 'trusted server records the finalized company-template PDF evidence');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select admin_user::text from wave4c_ids), true);
create temp table wave4c_attempts as
select
  (claim->'intent'->>'id')::uuid as first_intent_id,
  claim->'intent'->>'attachment_source' as first_source,
  claim->'intent'->>'trusted_sha256' as first_audit_hash,
  claim->'intent'->>'artifact_storage_path' as first_artifact_path,
  claim->'intent'->>'source_artifact_sha256' as first_source_hash,
  claim->>'claimed' as first_claimed
from (
  select public.claim_document_send_intent(
    (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_id from wave4c_ids)),
    'PURCHASE_ORDER', (select po_id from wave4c_ids), 'wave4c-first', repeat('c', 64),
    '["supplier@wave4c.test"]'::jsonb, '["finance@wave4c.test"]'::jsonb, 'Wave 4C PO', 'W4C-PO-001.pdf'
  ) as claim
) payload;
grant select on wave4c_attempts to authenticated, service_role;
select is((select first_source from wave4c_attempts), 'COMPANY_TEMPLATE_PDF', 'company-template PDF provenance is derived from trusted generation evidence');
select is((select first_audit_hash from wave4c_attempts), repeat('c', 64), 'send intent stores the exact PDF content hash');
select matches((select first_artifact_path from wave4c_attempts), 'document-template-artifacts.*pdf', 'send intent stores the exact PDF artifact path');
select is((select first_source_hash from wave4c_attempts), repeat('b', 64), 'send intent stores the exact merged DOCX source hash');
select is((select first_claimed from wave4c_attempts), 'true', 'first delivery attempt is claimed');
select lives_ok($$select public.complete_document_send_intent((select first_intent_id from wave4c_attempts), 'SENT', 'gmail-wave4c-first', null)$$, 'first delivery attempt can be completed');
select lives_ok($$select public.record_document_send_audit((select first_intent_id from wave4c_attempts), 'gmail-wave4c-first', 'SENT', null)$$, 'first delivery audit can be recorded');

select is((public.claim_document_send_intent(
  (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_id from wave4c_ids)),
  'PURCHASE_ORDER', (select po_id from wave4c_ids), 'wave4c-first', repeat('c', 64),
  '["supplier@wave4c.test"]'::jsonb, '["finance@wave4c.test"]'::jsonb, 'Wave 4C PO', 'W4C-PO-001.pdf'
))->>'idempotent', 'true', 'network retry with the same key is idempotent');

create temp table wave4c_resend as
select (claim->'intent'->>'id')::uuid as resend_intent_id
from (
  select public.claim_document_send_intent(
    (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_id from wave4c_ids)),
    'PURCHASE_ORDER', (select po_id from wave4c_ids), 'wave4c-explicit-resend', repeat('c', 64),
    '["supplier@wave4c.test"]'::jsonb, '[]'::jsonb, 'Wave 4C PO resend', 'W4C-PO-001.pdf'
  ) as claim
) payload;
grant select on wave4c_resend to authenticated, service_role;
select isnt((select resend_intent_id from wave4c_resend), (select first_intent_id from wave4c_attempts), 'explicit resend receives a separate durable intent');
select lives_ok($$select public.complete_document_send_intent((select resend_intent_id from wave4c_resend), 'FAILED', null, 'Gmail rejected this attempt')$$, 'failed resend attempt can be completed');
select lives_ok($$select public.record_document_send_audit((select resend_intent_id from wave4c_resend), null, 'FAILED', 'Gmail rejected this attempt')$$, 'failed resend audit can be recorded');
select is((select count(*) from public.document_send_audits where document_id = (select po_id from wave4c_ids)), 2::bigint, 'separate resend attempts remain separate audit history');
select is((public.claim_document_send_intent(
  (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_id from wave4c_ids)),
  'PURCHASE_ORDER', (select po_id from wave4c_ids), 'wave4c-explicit-resend', repeat('c', 64),
  '["supplier@wave4c.test"]'::jsonb, '[]'::jsonb, 'Wave 4C PO resend', 'W4C-PO-001.pdf'
))->>'newAttemptRequired', 'true', 'an audited failed attempt cannot be mutated by reusing its idempotency key');

create temp table wave4c_unknown as
select (claim->'intent'->>'id')::uuid as unknown_intent_id
from (
  select public.claim_document_send_intent(
    (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_id from wave4c_ids)),
    'PURCHASE_ORDER', (select po_id from wave4c_ids), 'wave4c-unknown', repeat('d', 64),
    '["supplier@wave4c.test"]'::jsonb, '[]'::jsonb, 'Wave 4C unknown', 'W4C-PO-001.pdf'
  ) as claim
) payload;
grant select on wave4c_unknown to authenticated, service_role;
select is((public.claim_document_send_intent(
  (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_id from wave4c_ids)),
  'PURCHASE_ORDER', (select po_id from wave4c_ids), 'wave4c-unknown', repeat('d', 64),
  '["supplier@wave4c.test"]'::jsonb, '[]'::jsonb, 'Wave 4C unknown', 'W4C-PO-001.pdf'
))->>'reconcileRequired', 'true', 'UNKNOWN delivery state remains locked for retry');
select lives_ok($$select public.complete_document_send_intent((select unknown_intent_id from wave4c_unknown), 'UNKNOWN', null, 'Gmail delivery could not be confirmed')$$, 'UNKNOWN delivery state is durable');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select viewer_user::text from wave4c_ids), true);
select is((select count(*) from public.document_send_intents where company_id = (select company_id from wave4c_ids) and document_id = (select po_id from wave4c_ids)), 3::bigint, 'document readers can see delivery intents without send authority');
select is((select count(*) from public.document_send_audits where company_id = (select company_id from wave4c_ids) and document_id = (select po_id from wave4c_ids)), 2::bigint, 'document readers can see immutable delivery audits without send authority');
select throws_ok($$select public.claim_document_send_intent(
  (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_id from wave4c_ids)),
  'PURCHASE_ORDER', (select po_id from wave4c_ids), 'wave4c-viewer-send', repeat('e', 64),
  '["supplier@wave4c.test"]'::jsonb, '[]'::jsonb, 'Viewer attempt', 'W4C-PO-001.pdf'
)$$, '42501', null, 'document readers cannot claim a send without documents.send');
select throws_ok($$insert into public.document_send_audits (company_id, snapshot_id, document_type, document_id, sender_user_id, subject, attachment_name, status)
  values ((select company_id from wave4c_ids), (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_id from wave4c_ids)), 'PURCHASE_ORDER', (select po_id from wave4c_ids), (select viewer_user from wave4c_ids), 'Forged', 'forged.pdf', 'SENT')$$,
  '42501', null, 'browser clients cannot forge delivery audit rows');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select admin_user::text from wave4c_ids), true);
select lives_ok($$select public.transition_purchase_order_status((select po_id from wave4c_ids), 'CANCELLED', 'Wave 4C lifecycle guard')$$, 'issued PO can be cancelled through the existing lifecycle');
select throws_ok($$select public.claim_document_send_intent(
  (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_id from wave4c_ids)),
  'PURCHASE_ORDER', (select po_id from wave4c_ids), 'wave4c-cancelled', repeat('f', 64),
  '["supplier@wave4c.test"]'::jsonb, '[]'::jsonb, 'Cancelled PO', 'W4C-PO-001.pdf'
)$$, '42501', null, 'cancelled Purchase Orders cannot receive a new delivery');

create temp table wave4c_billing as
select (public.create_or_update_client_billing(
  jsonb_build_object('companyId', (select company_id from wave4c_ids), 'projectId', (select project_id from wave4c_ids), 'billingNumber', 'W4C-INV-001', 'billingDate', '2026-09-10', 'currency', 'PHP'),
  jsonb_build_array(jsonb_build_object('description', 'Wave 4C client billing', 'amount', 200))
)->'billing'->>'id') as billing_id;
grant select on wave4c_billing to authenticated, service_role;
select lives_ok($$select public.transition_client_billing((select billing_id::uuid from wave4c_billing), 'SUBMITTED', null)$$, 'client invoice fixture can be submitted');
select lives_ok($$select public.transition_client_billing((select billing_id::uuid from wave4c_billing), 'ISSUED', null)$$, 'client invoice fixture can be issued');
select lives_ok($$select public.claim_document_send_intent(
  (select id from public.issued_document_snapshots where document_type = 'CLIENT_INVOICE' and document_id = (select billing_id::uuid from wave4c_billing)),
  'CLIENT_INVOICE', (select billing_id::uuid from wave4c_billing), 'wave4c-client-first', repeat('1', 64),
  '["client@wave4c.test"]'::jsonb, '[]'::jsonb, 'Wave 4C Client Invoice', 'W4C-INV-001.pdf'
)$$, 'issued client invoice can receive a delivery intent');
select lives_ok($$select public.transition_client_billing((select billing_id::uuid from wave4c_billing), 'VOIDED', 'Wave 4C lifecycle guard')$$, 'issued client invoice can be voided through the existing lifecycle');
select throws_ok($$select public.claim_document_send_intent(
  (select id from public.issued_document_snapshots where document_type = 'CLIENT_INVOICE' and document_id = (select billing_id::uuid from wave4c_billing)),
  'CLIENT_INVOICE', (select billing_id::uuid from wave4c_billing), 'wave4c-client-after-void', repeat('2', 64),
  '["client@wave4c.test"]'::jsonb, '[]'::jsonb, 'Voided client invoice', 'W4C-INV-001.pdf'
)$$, '42501', null, 'voided Client Invoices cannot receive a new delivery');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select admin_user::text from wave4c_ids), true);
create temp table wave4d_general as
select (claim->'intent'->>'id')::uuid as intent_id
from (
  select public.claim_document_send_intent(
    null,
    'GENERAL_EMAIL',
    null,
    'wave4d-general-first',
    null,
    '["recipient@wave4d.test"]'::jsonb,
    '[]'::jsonb,
    'Wave 4D plain email',
    null,
    repeat('a', 64)
  ) as claim
) payload;
grant select on wave4d_general to authenticated, service_role;
select is((select count(*) from public.document_send_intents where id = (select intent_id from wave4d_general) and delivery_kind = 'GENERAL_EMAIL' and document_type = 'GENERAL_EMAIL' and snapshot_id is null and document_id is null and attachment_source = 'NONE'), 1::bigint, 'plain email uses the existing delivery intent without document provenance');
select lives_ok($$select public.complete_document_send_intent((select intent_id from wave4d_general), 'SENT', 'gmail-wave4d-general', null)$$, 'plain email can complete through the shared delivery intent');
select is((select count(*) from public.document_send_audits where send_intent_id = (select intent_id from wave4d_general) and delivery_kind = 'GENERAL_EMAIL' and attachment_name is null and attachment_sha256 is null), 1::bigint, 'plain email terminal history is recorded without an attachment');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select viewer_user::text from wave4c_ids), true);
select is((select count(*) from public.document_send_intents where id = (select intent_id from wave4d_general)), 0::bigint, 'plain email history is not visible without outbound permission');

select * from finish();
rollback;
