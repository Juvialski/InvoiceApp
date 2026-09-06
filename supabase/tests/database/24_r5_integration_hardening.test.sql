begin;
select no_plan();

create temp table r5_ids as
select
  '00000000-0000-4000-8000-000000000701'::uuid as user_one,
  '00000000-0000-4000-8000-000000000702'::uuid as user_two,
  'aaaaaaaa-0000-4000-8000-000000000701'::uuid as company_id,
  '10000000-0000-4000-8000-000000000701'::uuid as project_id,
  '20000000-0000-4000-8000-000000000701'::uuid as vendor_id,
  '20000000-0000-4000-8000-000000000702'::uuid as vendor_rpc_id,
  '30000000-0000-4000-8000-000000000701'::uuid as incomplete_invoice_id,
  '30000000-0000-4000-8000-000000000702'::uuid as complete_invoice_id,
  '40000000-0000-4000-8000-000000000701'::uuid as source_document_id,
  '40000000-0000-4000-8000-000000000702'::uuid as receipt_source_id,
  '50000000-0000-4000-8000-000000000701'::uuid as purchase_order_id,
  '60000000-0000-4000-8000-000000000701'::uuid as purchase_order_line_id;
grant select on r5_ids to authenticated, service_role;

select has_table('public', 'vendor_master_events', 'canonical Vendor history exists');
select has_table('public', 'document_send_intents', 'durable document send intents exist');
select has_table('public', 'ai_request_budgets', 'durable AI request budgets exist');
select has_function('public', 'create_or_update_vendor', 'guarded Vendor resolution RPC exists');
select has_function('public', 'deactivate_vendor', 'guarded Vendor deactivation RPC exists');
select has_function('public', 'claim_document_send_intent', 'document send claim RPC exists');
select has_function('public', 'complete_document_send_intent', 'document send completion RPC exists');
select has_function('public', 'record_document_send_audit', 'guarded document send audit RPC exists');
select has_function('public', 'claim_company_ai_request', 'AI budget claim RPC exists');
select isnt_empty($$select 1 from pg_trigger where tgrelid = 'public.invoice_review_events'::regclass and tgname = 'invoice_review_events_actor_integrity'$$, 'review-event actor trigger exists');
select isnt_empty($$select 1 from pg_trigger where tgrelid = 'public.expenses'::regclass and tgname = 'expenses_correction_edit_guard'$$, 'Expense correction guard exists');
select is_empty($$select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = 'vendors' and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')$$, 'authenticated users cannot bypass the Vendor RPC');
select is_empty($$select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = 'document_send_intents' and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')$$, 'send intents cannot be directly mutated');
select is_empty($$select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = 'document_send_audits' and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')$$, 'send audits cannot be directly forged through the table');
select is_empty($$select 1 from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon' and privilege_type in ('INSERT','UPDATE','DELETE')$$, 'anonymous callers have no direct company-table mutation grants');
select is_empty($$select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace left join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x on true left join pg_roles r on r.oid = x.grantee where p.prosecdef and n.nspname = 'private' and coalesce(r.rolname, 'PUBLIC') = 'PUBLIC' and x.privilege_type = 'EXECUTE'$$, 'private SECURITY DEFINER helpers have no PUBLIC EXECUTE grant');

insert into auth.users (id, email, encrypted_password, created_at, updated_at)
values
  ((select user_one from r5_ids), 'r5-one@test.local', 'x', now(), now()),
  ((select user_two from r5_ids), 'r5-two@test.local', 'x', now(), now())
on conflict (id) do nothing;
insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values ((select company_id from r5_ids), 'R5 Integration Company', 'r5-integration-company', 'ACTIVE', 'PHP', 'Asia/Manila', (select user_one from r5_ids), (select user_one from r5_ids));
insert into public.company_members (company_id, user_id, role_key, status)
values
  ((select company_id from r5_ids), (select user_one from r5_ids), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_id from r5_ids), (select user_two from r5_ids), 'COMPANY_ADMIN', 'ACTIVE');
insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_id from r5_ids))
on conflict (singleton) do update set company_id = excluded.company_id;

insert into public.projects (id, user_id, company_id, project_code, project_name, status, contract_value, project_budget, currency, tax_treatment)
values ((select project_id from r5_ids), (select user_one from r5_ids), (select company_id from r5_ids), 'R5-PROJECT', 'R5 Project', 'ACTIVE', 10000, 8000, 'PHP', 'VAT');
insert into public.vendors (id, user_id, company_id, name, normalized_name, email, tax_id, default_currency)
values ((select vendor_id from r5_ids), (select user_one from r5_ids), (select company_id from r5_ids), 'R5 Canonical Supplier', 'r5 canonical supplier', 'supplier@r5.test', '111-222-333-000', 'PHP');
set local role authenticated;
select set_config('request.jwt.claim.sub', (select user_one::text from r5_ids), true);
insert into public.purchase_orders (id, company_id, po_number, vendor_id, project_id, currency, status, created_by_user_id, updated_by_user_id)
values ((select purchase_order_id from r5_ids), (select company_id from r5_ids), 'R5-PO-001', (select vendor_id from r5_ids), (select project_id from r5_ids), 'PHP', 'DRAFT', (select user_one from r5_ids), (select user_one from r5_ids));
insert into public.purchase_order_lines (id, company_id, purchase_order_id, line_number, description, quantity, unit, unit_price, amount)
values ((select purchase_order_line_id from r5_ids), (select company_id from r5_ids), (select purchase_order_id from r5_ids), 1, 'R5 line', 1, 'lot', 100, 100);
select lives_ok($$select public.transition_purchase_order_status((select purchase_order_id from r5_ids), 'APPROVED', null)$$, 'R5 PO can be approved');
select lives_ok($$select public.transition_purchase_order_status((select purchase_order_id from r5_ids), 'ISSUED', null)$$, 'R5 PO can be issued');
select is((select count(*) from public.issued_document_snapshots where company_id = (select company_id from r5_ids) and document_type = 'PURCHASE_ORDER' and document_id = (select purchase_order_id from r5_ids)), 1::bigint, 'issued PO has one immutable snapshot for send binding');

insert into public.invoices (id, user_id, company_id, vendor_id, invoice_number, invoice_date, currency, grand_total, review_status, document_type, current_data)
values
  ((select incomplete_invoice_id from r5_ids), (select user_one from r5_ids), (select company_id from r5_ids), null, null, null, null, null, 'NEEDS_REVIEW', 'INVOICE', jsonb_build_object('vendor', jsonb_build_object('name', 'Unresolved Supplier'))),
  ((select complete_invoice_id from r5_ids), (select user_one from r5_ids), (select company_id from r5_ids), (select vendor_id from r5_ids), 'R5-INV-001', date '2026-09-06', 'PHP', 1250, 'NEEDS_REVIEW', 'INVOICE', jsonb_build_object('vendor', jsonb_build_object('name', 'R5 Canonical Supplier'), 'category', 'Materials', 'description', 'R5 supplier materials', 'invoiceNumber', 'R5-INV-001', 'grandTotal', 1250));

select throws_ok($$select public.verify_supplier_invoice_and_create_expense((select incomplete_invoice_id from r5_ids))$$, '22023', null, 'incomplete supplier evidence cannot be verified into an Expense');
select is((select count(*) from public.expenses where company_id = (select company_id from r5_ids) and supplier_invoice_id = (select incomplete_invoice_id from r5_ids)), 0::bigint, 'incomplete supplier evidence creates no authoritative Expense');
select is((select review_status from public.invoices where id = (select incomplete_invoice_id from r5_ids)), 'NEEDS_REVIEW', 'incomplete supplier evidence remains in review');

select lives_ok($$insert into public.invoice_review_events (user_id, company_id, invoice_id, event_type, new_value) values ((select user_two from r5_ids), (select company_id from r5_ids), (select complete_invoice_id from r5_ids), 'R5_ACTOR_TEST', '{}'::jsonb)$$, 'review history insert is allowed for the authorized reviewer');
select is((select user_id from public.invoice_review_events where invoice_id = (select complete_invoice_id from r5_ids) and event_type = 'R5_ACTOR_TEST' limit 1), (select user_one from r5_ids), 'review-event actor is DB-derived and cannot be spoofed');

select lives_ok($$select public.verify_supplier_invoice_and_create_expense((select complete_invoice_id from r5_ids))$$, 'complete supplier evidence creates the authoritative Expense');
select is((select count(*) from public.expenses where company_id = (select company_id from r5_ids) and supplier_invoice_id = (select complete_invoice_id from r5_ids)), 1::bigint, 'one Expense exists for the supplier invoice');
select is((select amount from public.expenses where supplier_invoice_id = (select complete_invoice_id from r5_ids)), 1250::numeric, 'Expense amount is copied from the verified invoice');
select is((select currency from public.expenses where supplier_invoice_id = (select complete_invoice_id from r5_ids)), 'PHP', 'Expense currency is copied from the verified invoice');
select is((select payee from public.expenses where supplier_invoice_id = (select complete_invoice_id from r5_ids)), 'R5 Canonical Supplier', 'Expense payee is copied from the canonical Vendor');
select is((select review_status from public.invoices where id = (select complete_invoice_id from r5_ids)), 'VERIFIED', 'complete supplier evidence is verified atomically');
select is((public.verify_supplier_invoice_and_create_expense((select complete_invoice_id from r5_ids)))->>'idempotent', 'true', 'supplier verification retry returns the existing authoritative Expense without duplication');

select throws_ok($$update public.expenses set amount = 999 where supplier_invoice_id = (select complete_invoice_id from r5_ids)$$, '42501', null, 'supplier-derived Expense amount cannot drift through direct update');
select throws_ok($$update public.expenses set vendor_id = null where supplier_invoice_id = (select complete_invoice_id from r5_ids)$$, '42501', null, 'supplier-derived Expense Vendor cannot drift through direct update');
select lives_ok($$select public.apply_expense_correction((select id from public.expenses where supplier_invoice_id = (select complete_invoice_id from r5_ids)), 'VOID', 'R5 deliberate supplier correction')$$, 'the deliberate Expense correction lifecycle remains available');
select is((select status from public.expenses where supplier_invoice_id = (select complete_invoice_id from r5_ids)), 'VOID', 'deliberate correction changes active Expense truth and retains the row');

select throws_ok($$insert into public.vendors (user_id, company_id, name, normalized_name) values ((select user_one from r5_ids), (select company_id from r5_ids), 'R5 Direct Vendor', 'r5 direct vendor')$$, '42501', null, 'direct authenticated Vendor insertion is denied');
create temp table r5_vendor_rpc as
select ((public.create_or_update_vendor(jsonb_build_object('name', 'R5 RPC Vendor', 'taxId', '222-333-444-000', 'email', 'rpc@r5.test')))->'vendor'->>'id')::uuid as vendor_id;
select is((select count(*) from r5_vendor_rpc), 1::bigint, 'human-confirmed Vendor creation uses the guarded RPC');
select lives_ok($$select public.create_or_update_vendor(jsonb_build_object('name', 'R5 RPC Vendor', 'taxId', '222-333-444-000', 'email', 'rpc@r5.test'))$$, 'repeated Vendor creation is idempotent');
select is((select count(*) from public.vendors where company_id = (select company_id from r5_ids) and name = 'R5 RPC Vendor'), 1::bigint, 'repeated Vendor creation produces one canonical row');
select throws_ok($$select public.create_or_update_vendor(jsonb_build_object('name', 'Different Legal Name', 'taxId', '222-333-444-000'))$$, '23514', null, 'conflicting authoritative Vendor identifiers do not silently merge');
select lives_ok($$select public.deactivate_vendor((select vendor_id from r5_vendor_rpc), 'R5 no longer used')$$, 'Vendor deactivation RPC is available');

insert into public.source_documents (id, user_id, company_id, source_type, filename, mime_type, file_size, storage_path, sha256, processing_status)
values ((select source_document_id from r5_ids), (select user_one from r5_ids), (select company_id from r5_ids), 'UPLOAD', 'r5.pdf', 'application/pdf', 8, 'companies/r5/source/r5.pdf', repeat('a', 64), 'STORED');
select throws_ok($$insert into public.source_documents (user_id, company_id, source_type, filename, mime_type, file_size, storage_path, sha256, processing_status) values ((select user_one from r5_ids), (select company_id from r5_ids), 'UPLOAD', 'r5-duplicate.pdf', 'application/pdf', 8, 'companies/r5/source/r5-duplicate.pdf', repeat('a', 64), 'STORED')$$, '23505', null, 'manual source documents are deduplicated by company and content hash');
select lives_ok($$insert into public.expenses (user_id, company_id, expense_date, category, description, amount, currency, status, receipt_source_document_id) values ((select user_one from r5_ids), (select company_id from r5_ids), current_date, 'Materials', 'R5 receipt expense', 10, 'PHP', 'DRAFT', (select source_document_id from r5_ids))$$, 'first receipt-derived Expense is allowed');
select throws_ok($$insert into public.expenses (user_id, company_id, expense_date, category, description, amount, currency, status, receipt_source_document_id) values ((select user_one from r5_ids), (select company_id from r5_ids), current_date, 'Materials', 'R5 duplicate receipt expense', 10, 'PHP', 'DRAFT', (select source_document_id from r5_ids))$$, '23505', null, 'receipt-derived Expense creation is DB-idempotent');

select is((public.claim_company_ai_request((select company_id from r5_ids), 'ASSISTANT', 60, 10, 1)->>'allowed'), 'true', 'AI budget claim allows the first request');
select is((public.claim_company_ai_request((select company_id from r5_ids), 'ASSISTANT', 60, 10, 1)->>'allowed'), 'false', 'AI budget claim blocks concurrent requests at the company cap');
select lives_ok($$select public.release_company_ai_request((select company_id from r5_ids), 'ASSISTANT')$$, 'AI budget release is available');
select is((public.claim_company_ai_request((select company_id from r5_ids), 'ASSISTANT', 60, 10, 1)->>'allowed'), 'true', 'AI budget can be claimed after release');
select lives_ok($$select public.release_company_ai_request((select company_id from r5_ids), 'ASSISTANT')$$, 'second AI budget release is available');

create temp table r5_send as
select ((public.claim_document_send_intent(
  (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select purchase_order_id from r5_ids)),
  'PURCHASE_ORDER', (select purchase_order_id from r5_ids), 'r5-send-key', repeat('b', 64),
  '["supplier@r5.test"]'::jsonb, '[]'::jsonb, 'R5 Purchase Order', 'R5-PO-001.pdf'
))->'intent'->>'id')::uuid as intent_id;
select is((select count(*) from r5_send), 1::bigint, 'send claim creates one durable intent');
select is((public.claim_document_send_intent(
  (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select purchase_order_id from r5_ids)),
  'PURCHASE_ORDER', (select purchase_order_id from r5_ids), 'r5-send-key', repeat('b', 64),
  '["supplier@r5.test"]'::jsonb, '[]'::jsonb, 'R5 Purchase Order', 'R5-PO-001.pdf'
))->>'reconcileRequired', 'true', 'concurrent/retried pending send is not resent');
select lives_ok($$select public.complete_document_send_intent((select intent_id from r5_send), 'SENT', 'gmail-r5-001', null)$$, 'accepted external send completes its durable intent');
select is((public.claim_document_send_intent(
  (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select purchase_order_id from r5_ids)),
  'PURCHASE_ORDER', (select purchase_order_id from r5_ids), 'r5-send-key', repeat('b', 64),
  '["supplier@r5.test"]'::jsonb, '[]'::jsonb, 'R5 Purchase Order', 'R5-PO-001.pdf'
))->'intent'->>'status', 'SENT', 'completed send retry returns SENT without another external send');
select throws_ok($$select public.claim_document_send_intent(
  (select id from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select purchase_order_id from r5_ids)),
  'PURCHASE_ORDER', (select purchase_order_id from r5_ids), 'r5-send-key', repeat('c', 64),
  '["supplier@r5.test"]'::jsonb, '[]'::jsonb, 'R5 Purchase Order', 'R5-PO-001.pdf'
)$$, '23514', null, 'a send key cannot be rebound to different trusted PDF bytes');
select lives_ok($$select public.record_document_send_audit((select intent_id from r5_send), 'gmail-r5-001', 'SENT', null)$$, 'send audit is recorded through the guarded audit RPC');
select is((select count(*) from public.document_send_audits where send_intent_id = (select intent_id from r5_send)), 1::bigint, 'send audit is bound to the completed durable intent');

reset role;
select throws_ok($$delete from public.vendors where id = (select vendor_id from r5_ids)$$, '23503', null, 'Vendor deletion is blocked while financial history depends on the identity');
select * from finish();
rollback;
