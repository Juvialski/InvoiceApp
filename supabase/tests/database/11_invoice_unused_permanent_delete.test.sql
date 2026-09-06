begin;
select no_plan();

create temp table invoice_unused_delete_ids as
select
  '00000000-0000-4000-8000-000000000401'::uuid as admin_user,
  '00000000-0000-4000-8000-000000000402'::uuid as denied_user,
  'aaaaaaaa-0000-4000-8000-000000000401'::uuid as company_a,
  'bbbbbbbb-0000-4000-8000-000000000401'::uuid as company_b,
  '10000000-0000-4000-8000-000000000401'::uuid as project_a,
  '20000000-0000-4000-8000-000000000401'::uuid as project_b,
  'b2000000-0000-4000-8000-000000000401'::uuid as invoice_extracted,
  'b2000000-0000-4000-8000-000000000402'::uuid as invoice_shared_source,
  'b2000000-0000-4000-8000-000000000403'::uuid as invoice_allocated,
  'b2000000-0000-4000-8000-000000000404'::uuid as invoice_po_matched,
  'b2000000-0000-4000-8000-000000000405'::uuid as invoice_paid,
  'b2000000-0000-4000-8000-000000000406'::uuid as invoice_verified,
  'b2000000-0000-4000-8000-000000000407'::uuid as invoice_settled,
  'b2000000-0000-4000-8000-000000000408'::uuid as invoice_void_only,
  'b2000000-0000-4000-8000-000000000409'::uuid as invoice_accounting,
  'b2000000-0000-4000-8000-000000000410'::uuid as invoice_cross_company,
  'b2000000-0000-4000-8000-000000000411'::uuid as invoice_unknown_history,
  'a2000000-0000-4000-8000-000000000401'::uuid as source_extracted,
  'a2000000-0000-4000-8000-000000000402'::uuid as source_shared,
  'c2000000-0000-4000-8000-000000000401'::uuid as shared_expense,
  'd2000000-0000-4000-8000-000000000401'::uuid as vendor,
  'd2000000-0000-4000-8000-000000000402'::uuid as purchase_order,
  'd2000000-0000-4000-8000-000000000403'::uuid as purchase_order_line,
  'e2000000-0000-4000-8000-000000000401'::uuid as financial_account,
  'e2000000-0000-4000-8000-000000000402'::uuid as financial_transaction,
  'f2000000-0000-4000-8000-000000000401'::uuid as settlement_match;

grant select on invoice_unused_delete_ids to authenticated, service_role;

insert into auth.users (id, email, encrypted_password, created_at, updated_at)
select id, email, 'x', now(), now()
from (values
  ((select admin_user from invoice_unused_delete_ids), 'unused-delete-admin@test.local'),
  ((select denied_user from invoice_unused_delete_ids), 'unused-delete-denied@test.local')
) users(id, email)
on conflict (id) do nothing;

select set_config('request.jwt.claim.sub', (select admin_user::text from invoice_unused_delete_ids), true);

insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values
  ((select company_a from invoice_unused_delete_ids), 'Unused Delete Test Company', 'unused-delete-a', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from invoice_unused_delete_ids), (select admin_user from invoice_unused_delete_ids)),
  ((select company_b from invoice_unused_delete_ids), 'Unused Delete Other Company', 'unused-delete-b', 'ACTIVE', 'USD', 'UTC', (select admin_user from invoice_unused_delete_ids), null);

insert into public.company_members (company_id, user_id, role_key, status)
values
  ((select company_a from invoice_unused_delete_ids), (select admin_user from invoice_unused_delete_ids), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_a from invoice_unused_delete_ids), (select denied_user from invoice_unused_delete_ids), 'FINANCE', 'ACTIVE');

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_a from invoice_unused_delete_ids));

insert into public.company_member_permission_overrides (company_id, membership_id, permission_key, effect, created_by_user_id)
select cm.company_id, cm.id, 'invoices.manage', 'DENY', (select admin_user from invoice_unused_delete_ids)
from public.company_members cm
where cm.company_id = (select company_a from invoice_unused_delete_ids)
  and cm.user_id = (select denied_user from invoice_unused_delete_ids);

insert into public.projects (id, user_id, company_id, project_code, project_name, status, project_budget, currency, tax_treatment)
values
  ((select project_a from invoice_unused_delete_ids), (select admin_user from invoice_unused_delete_ids), (select company_a from invoice_unused_delete_ids), 'UNUSED-A', 'Unused Delete Project', 'ACTIVE', 100000, 'PHP', 'VAT'),
  ((select project_b from invoice_unused_delete_ids), (select admin_user from invoice_unused_delete_ids), (select company_b from invoice_unused_delete_ids), 'UNUSED-B', 'Unused Delete Other Project', 'ACTIVE', 100000, 'USD', 'VAT');

insert into public.vendors (id, user_id, company_id, name, normalized_name, default_currency)
values ((select vendor from invoice_unused_delete_ids), (select admin_user from invoice_unused_delete_ids), (select company_a from invoice_unused_delete_ids), 'Unused Delete Supplier', 'unused delete supplier', 'PHP');

insert into public.purchase_orders (id, company_id, po_number, vendor_id, project_id, currency, status, created_by_user_id)
values ((select purchase_order from invoice_unused_delete_ids), (select company_a from invoice_unused_delete_ids), 'UD-PO-001', (select vendor from invoice_unused_delete_ids), (select project_a from invoice_unused_delete_ids), 'PHP', 'DRAFT', (select admin_user from invoice_unused_delete_ids));

insert into public.purchase_order_lines (id, company_id, purchase_order_id, line_number, description, quantity, unit, unit_price, amount)
values ((select purchase_order_line from invoice_unused_delete_ids), (select company_a from invoice_unused_delete_ids), (select purchase_order from invoice_unused_delete_ids), 1, 'Matched test material', 1, 'pcs', 150, 150);

insert into public.source_documents (id, user_id, company_id, source_type, filename, mime_type, file_size, storage_path, sha256, processing_status, document_type)
values
  ((select source_extracted from invoice_unused_delete_ids), (select admin_user from invoice_unused_delete_ids), (select company_a from invoice_unused_delete_ids), 'UPLOAD', 'extracted-test.pdf', 'application/pdf', 100, 'companies/aaaaaaaa-0000-4000-8000-000000000401/invoices/manual/2026/09/extracted-test.pdf', repeat('1', 64), 'EXTRACTED', 'INVOICE'),
  ((select source_shared from invoice_unused_delete_ids), (select admin_user from invoice_unused_delete_ids), (select company_a from invoice_unused_delete_ids), 'UPLOAD', 'shared-source.pdf', 'application/pdf', 100, 'companies/aaaaaaaa-0000-4000-8000-000000000401/invoices/manual/2026/09/shared-source.pdf', repeat('2', 64), 'EXTRACTED', 'INVOICE');

insert into public.invoices (id, user_id, company_id, source_document_id, invoice_number, invoice_date, currency, grand_total, payment_status, review_status, current_data, vendor_id, verified_at)
values
  ((select invoice_extracted from invoice_unused_delete_ids), (select admin_user from invoice_unused_delete_ids), (select company_a from invoice_unused_delete_ids), (select source_extracted from invoice_unused_delete_ids), 'UD-EXTRACTED-001', date '2026-09-01', 'PHP', 100, 'UNPAID', 'NEEDS_REVIEW', jsonb_build_object('invoiceNumber', 'UD-EXTRACTED-001', 'grandTotal', 100, 'currency', 'PHP', 'status', 'UNPAID', 'reviewStatus', 'NEEDS_REVIEW', 'items', jsonb_build_array(jsonb_build_object('id', 'ud-line-1', 'description', 'Extracted test line'))), (select vendor from invoice_unused_delete_ids), null),
  ((select invoice_shared_source from invoice_unused_delete_ids), (select admin_user from invoice_unused_delete_ids), (select company_a from invoice_unused_delete_ids), (select source_shared from invoice_unused_delete_ids), 'UD-SHARED-001', date '2026-09-02', 'PHP', 80, 'UNPAID', 'NEEDS_REVIEW', jsonb_build_object('invoiceNumber', 'UD-SHARED-001', 'grandTotal', 80, 'currency', 'PHP', 'status', 'UNPAID', 'reviewStatus', 'NEEDS_REVIEW', 'items', '[]'::jsonb), (select vendor from invoice_unused_delete_ids), null),
  ((select invoice_allocated from invoice_unused_delete_ids), (select admin_user from invoice_unused_delete_ids), (select company_a from invoice_unused_delete_ids), null, 'UD-ALLOCATED-001', date '2026-09-03', 'PHP', 200, 'UNPAID', 'NEEDS_REVIEW', '{}'::jsonb, null, null),
  ((select invoice_po_matched from invoice_unused_delete_ids), (select admin_user from invoice_unused_delete_ids), (select company_a from invoice_unused_delete_ids), null, 'UD-PO-INV-001', date '2026-09-04', 'PHP', 150, 'UNPAID', 'NEEDS_REVIEW', jsonb_build_object('invoiceNumber', 'UD-PO-INV-001', 'grandTotal', 150, 'currency', 'PHP', 'items', jsonb_build_array(jsonb_build_object('id', 'po-line-1'))), (select vendor from invoice_unused_delete_ids), null),
  ((select invoice_paid from invoice_unused_delete_ids), (select admin_user from invoice_unused_delete_ids), (select company_a from invoice_unused_delete_ids), null, 'UD-PAID-001', date '2026-09-05', 'PHP', 50, 'PAID', 'NEEDS_REVIEW', jsonb_build_object('status', 'PAID', 'amountPaid', 50), null, null),
  ((select invoice_verified from invoice_unused_delete_ids), (select admin_user from invoice_unused_delete_ids), (select company_a from invoice_unused_delete_ids), null, 'UD-VERIFIED-001', date '2026-09-06', 'PHP', 60, 'UNPAID', 'VERIFIED', jsonb_build_object('reviewStatus', 'VERIFIED'), null, now()),
  ((select invoice_settled from invoice_unused_delete_ids), (select admin_user from invoice_unused_delete_ids), (select company_a from invoice_unused_delete_ids), null, 'UD-SETTLED-001', date '2026-09-07', 'PHP', 70, 'UNPAID', 'VERIFIED', jsonb_build_object('reviewStatus', 'VERIFIED'), null, now()),
  ((select invoice_void_only from invoice_unused_delete_ids), (select admin_user from invoice_unused_delete_ids), (select company_a from invoice_unused_delete_ids), null, 'UD-VOID-ONLY-001', date '2026-09-08', 'PHP', 20, 'UNPAID', 'NEEDS_REVIEW', '{}'::jsonb, null, null),
  ((select invoice_accounting from invoice_unused_delete_ids), (select admin_user from invoice_unused_delete_ids), (select company_a from invoice_unused_delete_ids), null, 'UD-ACCOUNTING-001', date '2026-09-09', 'PHP', 30, 'UNPAID', 'NEEDS_REVIEW', '{}'::jsonb, null, null),
  ((select invoice_cross_company from invoice_unused_delete_ids), (select admin_user from invoice_unused_delete_ids), (select company_b from invoice_unused_delete_ids), null, 'UD-CROSS-COMPANY-001', date '2026-09-10', 'USD', 40, 'UNPAID', 'NEEDS_REVIEW', '{}'::jsonb, null, null),
  ((select invoice_unknown_history from invoice_unused_delete_ids), (select admin_user from invoice_unused_delete_ids), (select company_a from invoice_unused_delete_ids), null, 'UD-UNKNOWN-HISTORY-001', date '2026-09-11', 'PHP', 40, 'UNPAID', 'NEEDS_REVIEW', '{}'::jsonb, null, null);

insert into public.invoice_line_items (user_id, company_id, invoice_id, item_index, description, quantity, unit_price, line_total, item_data)
values ((select admin_user from invoice_unused_delete_ids), (select company_a from invoice_unused_delete_ids), (select invoice_extracted from invoice_unused_delete_ids), 0, 'Extracted test line', 1, 100, 100, jsonb_build_object('source', 'extraction'));

insert into public.invoice_extractions (user_id, company_id, invoice_id, model, structured_result)
values ((select admin_user from invoice_unused_delete_ids), (select company_a from invoice_unused_delete_ids), (select invoice_extracted from invoice_unused_delete_ids), 'fixture', jsonb_build_object('invoiceNumber', 'UD-EXTRACTED-001'));

insert into public.invoice_review_events (user_id, company_id, invoice_id, event_type, previous_value, new_value)
values
  ((select admin_user from invoice_unused_delete_ids), (select company_a from invoice_unused_delete_ids), (select invoice_extracted from invoice_unused_delete_ids), 'AI_EXTRACTION_CREATED', '{}'::jsonb, jsonb_build_object('fixture', true)),
  ((select admin_user from invoice_unused_delete_ids), (select company_a from invoice_unused_delete_ids), (select invoice_extracted from invoice_unused_delete_ids), 'REOPENED', '{}'::jsonb, jsonb_build_object('fixture', true));

insert into public.invoice_review_events (user_id, company_id, invoice_id, event_type, previous_value, new_value)
values ((select admin_user from invoice_unused_delete_ids), (select company_a from invoice_unused_delete_ids), (select invoice_unknown_history from invoice_unused_delete_ids), 'FUTURE_OPERATIONAL_EVENT', '{}'::jsonb, jsonb_build_object('fixture', true));

insert into public.expenses (id, user_id, company_id, project_id, expense_date, category, description, amount, currency, status, receipt_source_document_id)
values ((select shared_expense from invoice_unused_delete_ids), (select admin_user from invoice_unused_delete_ids), (select company_a from invoice_unused_delete_ids), null, date '2026-09-02', 'Test', 'Shared source evidence remains', 1, 'PHP', 'DRAFT', (select source_shared from invoice_unused_delete_ids));

insert into public.invoice_project_allocations (user_id, company_id, invoice_id, project_id, allocation_type, allocation_amount, currency)
values ((select admin_user from invoice_unused_delete_ids), (select company_a from invoice_unused_delete_ids), (select invoice_allocated from invoice_unused_delete_ids), (select project_a from invoice_unused_delete_ids), 'AMOUNT', 200, 'PHP');

insert into public.project_accounting_events (user_id, company_id, project_id, entity_type, entity_id, event_type, description)
values ((select admin_user from invoice_unused_delete_ids), (select company_a from invoice_unused_delete_ids), (select project_a from invoice_unused_delete_ids), 'INVOICE', (select invoice_accounting from invoice_unused_delete_ids), 'INVOICE_COST_RECORDED', 'Protected invoice accounting history');

set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from invoice_unused_delete_ids), true);

select public.transition_purchase_order_status((select purchase_order from invoice_unused_delete_ids), 'APPROVED', null);
select public.transition_purchase_order_status((select purchase_order from invoice_unused_delete_ids), 'ISSUED', null);
select public.confirm_purchase_order_invoice_match((select invoice_po_matched from invoice_unused_delete_ids), (select purchase_order from invoice_unused_delete_ids), 'MANUAL', 'Protected procurement history', '[]'::jsonb);

select is((public.preview_invoice_correction((select invoice_extracted from invoice_unused_delete_ids))->>'canDelete')::boolean, true, 'realistic extracted invoice is delete-eligible');
select is((public.preview_invoice_correction((select invoice_extracted from invoice_unused_delete_ids))->>'protectedDependencyCount')::bigint, 0::bigint, 'extraction-only invoice has no protected downstream dependency');
select ok((public.preview_invoice_correction((select invoice_extracted from invoice_unused_delete_ids))->>'disposableDependencyCount')::bigint >= 3, 'extraction-only invoice reports its disposable children');
select is((public.preview_invoice_correction((select invoice_extracted from invoice_unused_delete_ids))->'blockingDependencies'->>'purchaseOrderMatches')::bigint, 0::bigint, 'extraction-only invoice has no PO blocker');
select is((public.preview_invoice_correction((select invoice_extracted from invoice_unused_delete_ids))->'disposableDependencies'->>'lineItems')::bigint, 1::bigint, 'extracted line item remains diagnostic disposable provenance');
select public.apply_invoice_correction((select invoice_extracted from invoice_unused_delete_ids), 'VOID', 'Disposable test record cleanup');
select public.apply_invoice_correction((select invoice_extracted from invoice_unused_delete_ids), 'ARCHIVE', 'Disposable test record cleanup');
select is((public.preview_invoice_correction((select invoice_extracted from invoice_unused_delete_ids))->>'canDelete')::boolean, true, 'VOID plus archived unused invoice remains delete-eligible');
select is((public.preview_invoice_correction((select invoice_extracted from invoice_unused_delete_ids))->>'recommendedAction'), 'DELETE_UNUSED', 'unused VOID plus archived invoice recommends direct deletion');
select is((public.preview_invoice_correction((select invoice_extracted from invoice_unused_delete_ids))->>'blockedReason'), null, 'cleanup lifecycle state does not produce a deletion blocker');
select is((public.preview_invoice_correction((select invoice_extracted from invoice_unused_delete_ids))->>'protectedDependencyCount')::bigint, 0::bigint, 'cleanup lifecycle history is not protected downstream dependency');
select is((public.preview_invoice_correction((select invoice_extracted from invoice_unused_delete_ids))->'blockingDependencies'->>'protectedReviewEvents')::bigint, 0::bigint, 'VOID and ARCHIVE review events are non-blocking');
select is((public.preview_invoice_correction((select invoice_extracted from invoice_unused_delete_ids))->'blockingDependencies'->>'protectedCompanyAuditEvents')::bigint, 0::bigint, 'VOID and ARCHIVE audit events are non-blocking');
select is((public.preview_invoice_correction((select invoice_extracted from invoice_unused_delete_ids))->'cleanupLifecycleHistory'->>'reviewEvents')::bigint, 2::bigint, 'cleanup review history remains diagnostic');
select is((public.preview_invoice_correction((select invoice_extracted from invoice_unused_delete_ids))->'retainedNonBlockingHistory'->>'companyAuditEvents')::bigint, 2::bigint, 'cleanup audit history is retained and non-blocking');
select public.apply_invoice_correction((select invoice_extracted from invoice_unused_delete_ids), 'RESTORE', 'Confirm cleanup history before deletion');
select public.apply_invoice_correction((select invoice_extracted from invoice_unused_delete_ids), 'ARCHIVE', 'Disposable test record cleanup');
select is((public.preview_invoice_correction((select invoice_extracted from invoice_unused_delete_ids))->'cleanupLifecycleHistory'->>'reviewEvents')::bigint, 4::bigint, 'RESTORE history remains diagnostic before deletion');
select is((public.preview_invoice_correction((select invoice_extracted from invoice_unused_delete_ids))->'retainedNonBlockingHistory'->>'companyAuditEvents')::bigint, 4::bigint, 'retained audit history includes VOID ARCHIVE RESTORE cleanup');
select is((public.apply_invoice_correction((select invoice_extracted from invoice_unused_delete_ids), 'DELETE_UNUSED', 'Unused extraction after lifecycle cleanup')->>'deleted')::boolean, true, 'realistic extracted VOID plus archived invoice can be permanently deleted without restore dance');
select is((select count(*) from public.invoices where id = (select invoice_extracted from invoice_unused_delete_ids)), 0::bigint, 'extracted invoice row is gone');
select is((select count(*) from public.invoice_line_items where invoice_id = (select invoice_extracted from invoice_unused_delete_ids)), 0::bigint, 'extracted invoice line item cascade is completed');
select is((select count(*) from public.invoice_extractions where invoice_id = (select invoice_extracted from invoice_unused_delete_ids)), 0::bigint, 'extracted invoice snapshot cascade is completed');
select is((select count(*) from public.invoice_review_events where invoice_id = (select invoice_extracted from invoice_unused_delete_ids)), 0::bigint, 'extracted invoice review provenance cascade is completed');
select is((select count(*) from public.source_documents where id = (select source_extracted from invoice_unused_delete_ids)), 1::bigint, 'exclusive source metadata remains for conservative storage retention');
select is((select count(*) from public.company_audit_events where company_id = (select company_a from invoice_unused_delete_ids) and event_type = 'INVOICE_VOIDED' and target_id = (select invoice_extracted from invoice_unused_delete_ids)), 1::bigint, 'VOID audit history remains after unused deletion');
select is((select count(*) from public.company_audit_events where company_id = (select company_a from invoice_unused_delete_ids) and event_type = 'INVOICE_ARCHIVED' and target_id = (select invoice_extracted from invoice_unused_delete_ids)), 2::bigint, 'ARCHIVE audit history remains after unused deletion');
select is((select count(*) from public.company_audit_events where company_id = (select company_a from invoice_unused_delete_ids) and event_type = 'INVOICE_RESTORED' and target_id = (select invoice_extracted from invoice_unused_delete_ids)), 1::bigint, 'RESTORE audit history remains after unused deletion');
select is((select count(*) from public.company_audit_events where company_id = (select company_a from invoice_unused_delete_ids) and event_type = 'INVOICE_DELETED_UNUSED' and target_id = (select invoice_extracted from invoice_unused_delete_ids)), 1::bigint, 'unused deletion remains audited');

select public.apply_invoice_correction((select invoice_shared_source from invoice_unused_delete_ids), 'ARCHIVE', 'Archive unused source test');
select is((public.preview_invoice_correction((select invoice_shared_source from invoice_unused_delete_ids))->>'canDelete')::boolean, true, 'active archived unused invoice remains delete-eligible');
select is((public.preview_invoice_correction((select invoice_shared_source from invoice_unused_delete_ids))->>'recommendedAction'), 'DELETE_UNUSED', 'archived unused invoice recommends direct deletion');
select is((public.preview_invoice_correction((select invoice_shared_source from invoice_unused_delete_ids))->'storageCleanup'->>'relationship'), 'RETAINED_SHARED_OR_REFERENCED', 'shared source evidence is classified for retention');
select is((public.apply_invoice_correction((select invoice_shared_source from invoice_unused_delete_ids), 'DELETE_UNUSED', null)->>'deleted')::boolean, true, 'source-shared archived unused invoice can be deleted');
select is((select count(*) from public.expenses where id = (select shared_expense from invoice_unused_delete_ids)), 1::bigint, 'shared source consumer remains');
select is((select count(*) from public.source_documents where id = (select source_shared from invoice_unused_delete_ids)), 1::bigint, 'shared source metadata is never destructively removed');

select public.apply_invoice_correction((select invoice_void_only from invoice_unused_delete_ids), 'VOID', 'Disposable void-only test');
select is((public.preview_invoice_correction((select invoice_void_only from invoice_unused_delete_ids))->>'canDelete')::boolean, true, 'unused VOID invoice remains directly delete-eligible');
select is((public.preview_invoice_correction((select invoice_void_only from invoice_unused_delete_ids))->>'archivedAt'), null, 'void-only deletion does not require archive restoration');
select is((public.apply_invoice_correction((select invoice_void_only from invoice_unused_delete_ids), 'DELETE_UNUSED', null)->>'deleted')::boolean, true, 'unused VOID invoice can be deleted directly');

select public.apply_invoice_correction((select invoice_allocated from invoice_unused_delete_ids), 'VOID', 'Keep allocated test history');
select public.apply_invoice_correction((select invoice_allocated from invoice_unused_delete_ids), 'ARCHIVE', 'Keep allocated test history');
select is((public.preview_invoice_correction((select invoice_allocated from invoice_unused_delete_ids))->>'canDelete')::boolean, false, 'project-allocated invoice cannot be deleted');
select ok((public.preview_invoice_correction((select invoice_allocated from invoice_unused_delete_ids))->>'blockedReason') like '%project cost allocation%', 'project allocation explains the deletion blocker');
select throws_ok($$select public.apply_invoice_correction('b2000000-0000-4000-8000-000000000403'::uuid, 'DELETE_UNUSED', null)$$, '42501', null, 'project allocation rejects permanent deletion');
select is((select count(*) from public.invoices where id = (select invoice_allocated from invoice_unused_delete_ids)), 1::bigint, 'project-allocated invoice remains preserved');

select public.apply_invoice_correction((select invoice_po_matched from invoice_unused_delete_ids), 'VOID', 'Keep PO match history');
select public.apply_invoice_correction((select invoice_po_matched from invoice_unused_delete_ids), 'ARCHIVE', 'Keep PO match history');
select is((public.preview_invoice_correction((select invoice_po_matched from invoice_unused_delete_ids))->>'canDelete')::boolean, false, 'PO-matched invoice cannot be deleted');
select is((public.preview_invoice_correction((select invoice_po_matched from invoice_unused_delete_ids))->'blockingDependencies'->>'purchaseOrderMatches')::bigint, 1::bigint, 'PO match is an explicit protected blocker');
select ok((public.preview_invoice_correction((select invoice_po_matched from invoice_unused_delete_ids))->>'blockedReason') like '%Purchase Order%', 'PO match explains the deletion blocker');
select throws_ok($$select public.apply_invoice_correction('b2000000-0000-4000-8000-000000000404'::uuid, 'DELETE_UNUSED', null)$$, '42501', null, 'PO match rejects permanent deletion');
select is((select count(*) from public.purchase_order_invoice_matches where invoice_id = (select invoice_po_matched from invoice_unused_delete_ids)), 1::bigint, 'PO match history remains preserved');

select public.apply_invoice_correction((select invoice_paid from invoice_unused_delete_ids), 'VOID', 'Keep paid test history');
select public.apply_invoice_correction((select invoice_paid from invoice_unused_delete_ids), 'ARCHIVE', 'Keep paid test history');
select is((public.preview_invoice_correction((select invoice_paid from invoice_unused_delete_ids))->>'canDelete')::boolean, false, 'paid invoice cannot be deleted');
select ok((public.preview_invoice_correction((select invoice_paid from invoice_unused_delete_ids))->>'blockedReason') like '%paid%', 'paid evidence explains the deletion blocker');
select throws_ok($$select public.apply_invoice_correction('b2000000-0000-4000-8000-000000000405'::uuid, 'DELETE_UNUSED', null)$$, '42501', null, 'paid invoice rejects permanent deletion');

select public.apply_invoice_correction((select invoice_verified from invoice_unused_delete_ids), 'VOID', 'Keep verified test history');
select public.apply_invoice_correction((select invoice_verified from invoice_unused_delete_ids), 'ARCHIVE', 'Keep verified test history');
select is((public.preview_invoice_correction((select invoice_verified from invoice_unused_delete_ids))->>'canDelete')::boolean, false, 'verified invoice cannot be deleted');
select is((public.preview_invoice_correction((select invoice_verified from invoice_unused_delete_ids))->'blockingDependencies'->>'verifiedHistory')::bigint, 1::bigint, 'verified history is an explicit protected blocker');
select ok((public.preview_invoice_correction((select invoice_verified from invoice_unused_delete_ids))->>'blockedReason') like '%verified%', 'verified history explains the deletion blocker');
select throws_ok($$select public.apply_invoice_correction('b2000000-0000-4000-8000-000000000406'::uuid, 'DELETE_UNUSED', null)$$, '42501', null, 'verified invoice rejects permanent deletion');

select public.apply_invoice_correction((select invoice_accounting from invoice_unused_delete_ids), 'VOID', 'Keep accounting test history');
select public.apply_invoice_correction((select invoice_accounting from invoice_unused_delete_ids), 'ARCHIVE', 'Keep accounting test history');
select is((public.preview_invoice_correction((select invoice_accounting from invoice_unused_delete_ids))->>'canDelete')::boolean, false, 'project-accounting invoice cannot be deleted');
select is((public.preview_invoice_correction((select invoice_accounting from invoice_unused_delete_ids))->'blockingDependencies'->>'projectAccountingEvents')::bigint, 1::bigint, 'project-accounting history is an explicit protected blocker');
select ok((public.preview_invoice_correction((select invoice_accounting from invoice_unused_delete_ids))->>'blockedReason') like '%project accounting event%', 'project-accounting history explains the deletion blocker');
select throws_ok($$select public.apply_invoice_correction('b2000000-0000-4000-8000-000000000409'::uuid, 'DELETE_UNUSED', null)$$, '42501', null, 'project-accounting history rejects permanent deletion');

select public.save_financial_account((select company_a from invoice_unused_delete_ids), (select financial_account from invoice_unused_delete_ids), 'BANK', 'FIXTURE', 'Unused Delete Bank', 'Settlement fixture', '•••• 4401', 'PHP', 0, date '2026-01-01', 'MANUAL', null, null);
select public.create_financial_transaction((select company_a from invoice_unused_delete_ids), (select financial_transaction from invoice_unused_delete_ids), (select financial_account from invoice_unused_delete_ids), date '2026-09-07', timestamptz '2026-09-07 09:00:00+00', null, 'Settled invoice fixture', 'DEBIT', 70, 'PHP', 'unused-delete-settlement');
select public.confirm_financial_settlement((select company_a from invoice_unused_delete_ids), (select financial_transaction from invoice_unused_delete_ids), 'INVOICE', (select invoice_settled from invoice_unused_delete_ids), 70, (select settlement_match from invoice_unused_delete_ids), null, 'Settlement fixture', 'RECONCILIATION_UI');
select throws_ok($$select public.apply_invoice_correction('b2000000-0000-4000-8000-000000000407'::uuid, 'VOID', 'Settlement test')$$, '42501', null, 'confirmed settlement still blocks void');
select public.apply_invoice_correction((select invoice_settled from invoice_unused_delete_ids), 'ARCHIVE', 'Keep settlement history');
select is((public.preview_invoice_correction((select invoice_settled from invoice_unused_delete_ids))->>'canDelete')::boolean, false, 'settled invoice cannot be deleted');
select is((public.preview_invoice_correction((select invoice_settled from invoice_unused_delete_ids))->>'confirmedSettlementCount')::bigint, 1::bigint, 'confirmed settlement is an explicit protected blocker');
select throws_ok($$select public.apply_invoice_correction('b2000000-0000-4000-8000-000000000407'::uuid, 'DELETE_UNUSED', null)$$, '42501', null, 'settled invoice rejects permanent deletion');
select is((select count(*) from public.invoices where id = (select invoice_settled from invoice_unused_delete_ids)), 1::bigint, 'settled invoice remains preserved');

select throws_ok($$select public.apply_invoice_correction('b2000000-0000-4000-8000-000000000410'::uuid, 'DELETE_UNUSED', null)$$, '42501', null, 'cross-company invoice target is rejected');

select is((public.preview_invoice_correction((select invoice_unknown_history from invoice_unused_delete_ids))->>'canDelete')::boolean, false, 'unknown review history fails closed');
select is((public.preview_invoice_correction((select invoice_unknown_history from invoice_unused_delete_ids))->'blockingDependencies'->>'protectedReviewEvents')::bigint, 1::bigint, 'unknown review history is an explicit protected blocker');
select throws_ok($$select public.apply_invoice_correction('b2000000-0000-4000-8000-000000000411'::uuid, 'DELETE_UNUSED', null)$$, '42501', null, 'unknown review history rejects permanent deletion');

select set_config('request.jwt.claim.sub', (select denied_user::text from invoice_unused_delete_ids), true);
select throws_ok($$select public.apply_invoice_correction('b2000000-0000-4000-8000-000000000403'::uuid, 'DELETE_UNUSED', null)$$, '42501', null, 'invoice management permission deny blocks deletion');
select is((select count(*) from public.invoices where id = (select invoice_allocated from invoice_unused_delete_ids)), 1::bigint, 'unauthorized delete leaves invoice unchanged');

select * from finish();
rollback;
