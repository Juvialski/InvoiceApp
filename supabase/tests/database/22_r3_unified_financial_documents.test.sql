begin;
select no_plan();

create temp table r3_ids as
select
  '00000000-0000-4000-8000-000000000601'::uuid as admin_user,
  'aaaaaaaa-0000-4000-8000-000000000601'::uuid as company_id,
  '10000000-0000-4000-8000-000000000601'::uuid as project_id,
  '20000000-0000-4000-8000-000000000601'::uuid as vendor_id,
  '30000000-0000-4000-8000-000000000601'::uuid as invoice_id,
  '30000000-0000-4000-8000-000000000602'::uuid as invoice_mismatch_id,
  '40000000-0000-4000-8000-000000000601'::uuid as po_id,
  '50000000-0000-4000-8000-000000000601'::uuid as po_line_id;
grant select on r3_ids to authenticated, service_role;
create temp table r3_billing_ids (billing_id uuid not null);
grant insert, select on r3_billing_ids to authenticated;
create temp table r3_send_ids (intent_id uuid not null);
grant insert, select on r3_send_ids to authenticated;

select has_table('public', 'company_document_profiles', 'company document profile table exists');
select has_table('public', 'issued_document_snapshots', 'issued document snapshot table exists');
select has_table('public', 'document_send_audits', 'document send audit table exists');
select has_column('public', 'expenses', 'supplier_invoice_id', 'Expense supplier invoice link exists');
select has_column('public', 'expenses', 'purchase_order_id', 'Expense PO provenance exists');
select has_function('public', 'verify_supplier_invoice_and_create_expense', 'supplier verification and Expense RPC exists');
select has_function('public', 'create_purchase_order_document_snapshot', 'PO snapshot RPC exists');
select has_function('public', 'create_client_invoice_document_snapshot', 'Client Invoice snapshot RPC exists');
select isnt_empty($$select 1 from pg_class where oid = 'public.company_document_profiles'::regclass and relrowsecurity$$, 'company document profiles have RLS');
select isnt_empty($$select 1 from pg_class where oid = 'public.issued_document_snapshots'::regclass and relrowsecurity$$, 'issued snapshots have RLS');
select isnt_empty($$select 1 from pg_class where oid = 'public.document_send_audits'::regclass and relrowsecurity$$, 'send audits have RLS');
select is_empty($$select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name = 'issued_document_snapshots' and grantee = 'authenticated' and privilege_type in ('INSERT','UPDATE','DELETE')$$, 'issued snapshots are not directly mutable by the browser');

insert into auth.users (id, email, encrypted_password, created_at, updated_at)
values ((select admin_user from r3_ids), 'r3-admin@test.local', 'x', now(), now())
on conflict (id) do nothing;
insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values ((select company_id from r3_ids), 'R3 Test Company', 'r3-test-company', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from r3_ids), (select admin_user from r3_ids));
insert into public.company_members (company_id, user_id, role_key, status)
values ((select company_id from r3_ids), (select admin_user from r3_ids), 'COMPANY_ADMIN', 'ACTIVE');
insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_id from r3_ids))
on conflict (singleton) do update set company_id = excluded.company_id;
select is((select legal_name from public.company_document_profiles where company_id = (select company_id from r3_ids)), 'HydroQualiSense Solutions Corp.', 'document profile starts from the supplied HSC template identity');
select is((select vat_tin from public.company_document_profiles where company_id = (select company_id from r3_ids)), '777-823-517-000', 'document profile preserves the supplied HSC VAT TIN');
insert into public.projects (id, user_id, company_id, project_code, project_name, client_name, client_reference, billing_contact_name, billing_email, billing_address, status, contract_value, project_budget, currency, tax_treatment)
values ((select project_id from r3_ids), (select admin_user from r3_ids), (select company_id from r3_ids), 'R3-PROJ', 'R3 Water Project', 'Client R3', 'R3-REF', 'Billing Contact', 'billing@client.test', 'Client billing address', 'ACTIVE', 10000, 7000, 'PHP', 'VAT');
insert into public.vendors (id, user_id, company_id, name, normalized_name, email, address, tax_id, default_currency)
values ((select vendor_id from r3_ids), (select admin_user from r3_ids), (select company_id from r3_ids), 'R3 Supplier', 'r3 supplier', 'supplier@test.local', 'Supplier address', '111-222-333-000', 'PHP');
insert into public.invoices (id, user_id, company_id, vendor_id, invoice_number, invoice_date, currency, grand_total, review_status, document_type, current_data)
values ((select invoice_id from r3_ids), (select admin_user from r3_ids), (select company_id from r3_ids), (select vendor_id from r3_ids), 'R3-INV-001', '2026-09-06', 'PHP', 1250, 'NEEDS_REVIEW', 'INVOICE', jsonb_build_object('vendor', jsonb_build_object('name', 'R3 Supplier'), 'category', 'Materials', 'description', 'R3 supplier invoice', 'invoiceNumber', 'R3-INV-001', 'grandTotal', 1250));
insert into public.invoice_project_allocations (id, user_id, company_id, invoice_id, project_id, allocation_type, allocation_amount, currency)
values (gen_random_uuid(), (select admin_user from r3_ids), (select company_id from r3_ids), (select invoice_id from r3_ids), (select project_id from r3_ids), 'AMOUNT', 1250, 'PHP');

set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from r3_ids), true);

select lives_ok($$select public.verify_supplier_invoice_and_create_expense((select invoice_id from r3_ids))$$, 'supplier verification creates the authoritative Expense');
select is((select count(*) from public.expenses where supplier_invoice_id = (select invoice_id from r3_ids)), 1::bigint, 'exactly one Expense is linked to the supplier invoice');
select is((select amount from public.expenses where supplier_invoice_id = (select invoice_id from r3_ids)), 1250::numeric, 'linked Expense amount derives from the invoice total');
select is((select status from public.expenses where supplier_invoice_id = (select invoice_id from r3_ids)), 'DRAFT', 'new supplier Expense is Draft until approved');
select is((select review_status from public.invoices where id = (select invoice_id from r3_ids)), 'VERIFIED', 'supplier invoice is verified in the same operation');
select is((select current_data->>'linkedExpenseId' from public.invoices where id = (select invoice_id from r3_ids)), (select id::text from public.expenses where supplier_invoice_id = (select invoice_id from r3_ids)), 'invoice stores the durable linked Expense id');
select is((select legal_name from public.company_document_profiles where company_id = (select company_id from r3_ids)), 'HydroQualiSense Solutions Corp.', 'supplier verification uses the HSC document profile identity');
select is((select public.get_financial_settlement_summary((select company_id from r3_ids), 'INVOICE', (select invoice_id from r3_ids))->>'settlementState'), 'TRANSFERRED_TO_EXPENSE', 'linked supplier invoice cannot become a second payable settlement target');
select lives_ok($$select public.verify_supplier_invoice_and_create_expense((select invoice_id from r3_ids))$$, 'repeated supplier verification is idempotent');
select is((select count(*) from public.expenses where supplier_invoice_id = (select invoice_id from r3_ids)), 1::bigint, 'repeated verification does not duplicate the Expense');

reset role;
insert into public.invoices (id, user_id, company_id, vendor_id, invoice_number, invoice_date, currency, grand_total, review_status, document_type, current_data)
values ((select invoice_mismatch_id from r3_ids), (select admin_user from r3_ids), (select company_id from r3_ids), (select vendor_id from r3_ids), 'R3-INV-MISMATCH', '2026-09-06', 'PHP', 10, 'NEEDS_REVIEW', 'INVOICE', jsonb_build_object('vendor', jsonb_build_object('name', 'R3 Supplier'), 'category', 'Materials', 'description', 'R3 mismatch invoice', 'customer', jsonb_build_object('name', 'Another Company Ltd.'), 'grandTotal', 10));
set local role authenticated;
select throws_ok($$select public.verify_supplier_invoice_and_create_expense((select invoice_mismatch_id from r3_ids))$$, '23514', null, 'buyer mismatch blocks supplier invoice posting');

reset role;
insert into public.purchase_orders (id, company_id, po_number, vendor_id, project_id, currency, status, created_by_user_id, updated_by_user_id)
values ((select po_id from r3_ids), (select company_id from r3_ids), 'R3-PO-001', (select vendor_id from r3_ids), (select project_id from r3_ids), 'PHP', 'DRAFT', (select admin_user from r3_ids), (select admin_user from r3_ids));
insert into public.purchase_order_lines (id, company_id, purchase_order_id, line_number, description, quantity, unit, unit_price, amount)
values ((select po_line_id from r3_ids), (select company_id from r3_ids), (select po_id from r3_ids), 1, 'R3 Pipe', 5, 'pcs', 100, 500);
set local role authenticated;
select lives_ok($$select public.transition_purchase_order_status((select po_id from r3_ids), 'APPROVED', null)$$, 'PO can be approved');
select lives_ok($$select public.transition_purchase_order_status((select po_id from r3_ids), 'ISSUED', null)$$, 'PO can be issued');
select is((select count(*) from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_id from r3_ids)), 1::bigint, 'PO issuance captures one immutable snapshot');
select is((select snapshot->>'documentNumber' from public.issued_document_snapshots where document_type = 'PURCHASE_ORDER' and document_id = (select po_id from r3_ids)), 'R3-PO-001', 'PO snapshot preserves the issued number');
select throws_ok($$update public.issued_document_snapshots set document_number = 'CHANGED' where document_type = 'PURCHASE_ORDER' and document_id = (select po_id from r3_ids)$$, '42501', null, 'issued snapshot cannot be edited directly');
insert into r3_send_ids(intent_id)
select ((public.claim_document_send_intent(
  s.id, 'PURCHASE_ORDER', (select po_id from r3_ids), 'r3-send-key', repeat('a', 64),
  '["supplier@test.local"]'::jsonb, '[]'::jsonb, 'R3 PO', 'R3-PO-001.pdf'
))->'intent'->>'id')::uuid
from public.issued_document_snapshots s where s.document_type = 'PURCHASE_ORDER' and s.document_id = (select po_id from r3_ids);
select lives_ok($$select public.complete_document_send_intent((select intent_id from r3_send_ids), 'SENT', 'gmail-r3-1', null)$$, 'R3 send intent can be completed');
select lives_ok($$select public.record_document_send_audit((select intent_id from r3_send_ids), 'gmail-r3-1', 'SENT', null)$$, 'R3 send audit is recorded through the guarded RPC');
select is((select count(*) from public.document_send_audits where document_type = 'PURCHASE_ORDER' and document_id = (select po_id from r3_ids) and status = 'SENT'), 1::bigint, 'successful document send audit is persisted');

with saved as (
  select public.create_or_update_client_billing(
    jsonb_build_object('companyId', (select company_id from r3_ids), 'projectId', (select project_id from r3_ids), 'billingNumber', 'R3-CI-001', 'billingDate', '2026-09-06', 'currency', 'PHP'),
    jsonb_build_array(jsonb_build_object('description', 'R3 progress work', 'amount', 700))
  ) as response
)
insert into r3_billing_ids(billing_id)
select (response->'billing'->>'id')::uuid from saved;
update public.client_billings
set due_date = '2026-10-06', payment_terms = '30 days', billing_contact_name = 'Billing Contact', billing_email = 'billing@client.test', billing_address = 'Client billing address'
where id = (select billing_id from r3_billing_ids);
select lives_ok($$select public.transition_client_billing((select billing_id from r3_billing_ids), 'SUBMITTED', null)$$, 'client invoice can be submitted');
select lives_ok($$select public.transition_client_billing((select billing_id from r3_billing_ids), 'ISSUED', null)$$, 'client invoice can be issued');
select is((select count(*) from public.issued_document_snapshots where document_type = 'CLIENT_INVOICE' and document_id = (select billing_id from r3_billing_ids)), 1::bigint, 'client invoice issuance captures one immutable snapshot');
select is((select snapshot->'billTo'->>'email' from public.issued_document_snapshots where document_type = 'CLIENT_INVOICE' and document_id = (select billing_id from r3_billing_ids)), 'billing@client.test', 'client invoice snapshot preserves the billing contact');
select throws_ok($$update public.client_billings set billing_email = 'changed@test.local' where id = (select billing_id from r3_billing_ids)$$, '42501', null, 'issued client invoice contact metadata is immutable');

select * from finish();
rollback;
