begin;
select no_plan();

create temp table post_ids as
select
  '00000000-0000-4000-8000-000000001101'::uuid as user_one,
  '00000000-0000-4000-8000-000000001102'::uuid as user_two,
  'aaaaaaaa-0000-4000-8000-000000001101'::uuid as company_a,
  'aaaaaaaa-0000-4000-8000-000000001102'::uuid as company_b,
  '10000000-0000-4000-8000-000000001101'::uuid as project_a,
  '10000000-0000-4000-8000-000000001102'::uuid as project_b,
  '10000000-0000-4000-8000-000000001103'::uuid as project_other_company,
  '20000000-0000-4000-8000-000000001101'::uuid as vendor_a,
  '20000000-0000-4000-8000-000000001102'::uuid as vendor_b,
  '30000000-0000-4000-8000-000000001101'::uuid as invoice_a,
  '30000000-0000-4000-8000-000000001102'::uuid as invoice_b,
  '40000000-0000-4000-8000-000000001101'::uuid as purchase_order,
  '50000000-0000-4000-8000-000000001101'::uuid as purchase_order_line,
  '60000000-0000-4000-8000-000000001101'::uuid as receipt_one,
  '60000000-0000-4000-8000-000000001102'::uuid as receipt_two,
  '70000000-0000-4000-8000-000000001101'::uuid as inventory_item,
  '80000000-0000-4000-8000-000000001101'::uuid as equipment;
grant select on post_ids to authenticated, service_role;

select has_table('public', 'engineering_equipment_registry', 'canonical Equipment registry exists');
select has_table('public', 'engineering_equipment_assignments', 'Equipment assignment history exists');
select has_table('public', 'engineering_equipment_events', 'Equipment event history exists');
select has_view('public', 'engineering_equipment_current', 'derived Equipment state view exists');
select has_column('public', 'purchase_order_receipts', 'source_invoice_id', 'Procurement receipt source invoice provenance exists');
select has_column('public', 'purchase_order_receipts', 'source_document_id', 'Procurement receipt source document provenance exists');
select has_function('public', 'assign_engineering_equipment', 'guarded Equipment assignment RPC exists');
select has_function('public', 'transfer_engineering_equipment', 'guarded Equipment transfer RPC exists');
select has_function('public', 'return_engineering_equipment', 'guarded Equipment return RPC exists');
select has_function('public', 'set_engineering_equipment_lifecycle', 'guarded Equipment lifecycle RPC exists');
select isnt_empty($$select 1 from pg_class where oid = 'public.engineering_equipment_registry'::regclass and relrowsecurity$$, 'Equipment registry has RLS');
select isnt_empty($$select 1 from pg_class where oid = 'public.engineering_equipment_assignments'::regclass and relrowsecurity$$, 'Equipment assignments have RLS');
select is_empty($$select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name in ('engineering_equipment_registry', 'engineering_equipment_assignments', 'engineering_equipment_events') and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')$$, 'Equipment writes are RPC-only');

insert into auth.users (id, email, encrypted_password, created_at, updated_at)
values
  ((select user_one from post_ids), 'post-warehouse-one@test.local', 'x', now(), now()),
  ((select user_two from post_ids), 'post-warehouse-two@test.local', 'x', now(), now())
on conflict (id) do nothing;
insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values
  ((select company_a from post_ids), 'Post Warehouse Company A', 'post-warehouse-a', 'ACTIVE', 'PHP', 'Asia/Manila', (select user_one from post_ids), (select user_one from post_ids)),
  ((select company_b from post_ids), 'Post Warehouse Company B', 'post-warehouse-b', 'ACTIVE', 'PHP', 'Asia/Manila', (select user_two from post_ids), (select user_two from post_ids));
insert into public.company_members (company_id, user_id, role_key, status)
values
  ((select company_a from post_ids), (select user_one from post_ids), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_a from post_ids), (select user_two from post_ids), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_b from post_ids), (select user_two from post_ids), 'COMPANY_ADMIN', 'ACTIVE');
insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_a from post_ids))
on conflict (singleton) do update set company_id = excluded.company_id;

insert into public.projects (id, user_id, company_id, project_code, project_name, status, contract_value, project_budget, currency, tax_treatment)
values
  ((select project_a from post_ids), (select user_one from post_ids), (select company_a from post_ids), 'POST-A', 'Post Warehouse Project A', 'ACTIVE', 100000, 100000, 'PHP', 'VAT'),
  ((select project_b from post_ids), (select user_one from post_ids), (select company_a from post_ids), 'POST-B', 'Post Warehouse Project B', 'ACTIVE', 100000, 100000, 'PHP', 'VAT'),
  ((select project_other_company from post_ids), (select user_two from post_ids), (select company_b from post_ids), 'POST-X', 'Other Company Project', 'ACTIVE', 100000, 100000, 'PHP', 'VAT');
insert into public.vendors (id, user_id, company_id, name, normalized_name, default_currency)
values
  ((select vendor_a from post_ids), (select user_one from post_ids), (select company_a from post_ids), 'Post Warehouse Supplier A', 'post warehouse supplier a', 'PHP'),
  ((select vendor_b from post_ids), (select user_two from post_ids), (select company_b from post_ids), 'Post Warehouse Supplier B', 'post warehouse supplier b', 'PHP');
insert into public.invoices (id, user_id, company_id, vendor_id, invoice_number, invoice_date, currency, grand_total, review_status, document_type, current_data)
values
  ((select invoice_a from post_ids), (select user_one from post_ids), (select company_a from post_ids), (select vendor_a from post_ids), 'POST-INV-A', current_date, 'PHP', 100000, 'NEEDS_REVIEW', 'INVOICE', jsonb_build_object('vendor', jsonb_build_object('name', 'Post Warehouse Supplier A'), 'category', 'Materials', 'description', 'Post warehouse supplier materials', 'grandTotal', 100000)),
  ((select invoice_b from post_ids), (select user_two from post_ids), (select company_b from post_ids), (select vendor_b from post_ids), 'POST-INV-B', current_date, 'PHP', 25, 'VERIFIED', 'INVOICE', jsonb_build_object('vendor', jsonb_build_object('name', 'Post Warehouse Supplier B'), 'category', 'Materials', 'description', 'Other company invoice', 'grandTotal', 25));

insert into public.invoice_project_allocations(user_id, company_id, invoice_id, project_id, allocation_type, allocation_amount, currency)
values ((select user_one from post_ids), (select company_a from post_ids), (select invoice_a from post_ids), (select project_a from post_ids), 'AMOUNT', 100000, 'PHP');

set local role authenticated;
select set_config('request.jwt.claim.sub', (select user_one::text from post_ids), true);

select lives_ok($$select public.verify_supplier_invoice_and_create_expense((select invoice_a from post_ids))$$, 'verification creates a linked Expense from one canonical allocation');
select is((select project_id from public.expenses where company_id = (select company_a from post_ids) and supplier_invoice_id = (select invoice_a from post_ids)), (select project_a from post_ids), 'one allocation projects the linked Expense to Project A');
select is((select count(*) from public.expenses where company_id = (select company_a from post_ids) and supplier_invoice_id = (select invoice_a from post_ids)), 1::bigint, 'one supplier invoice has exactly one active linked Expense');
select is((select current_data->>'linkedExpenseId' from public.invoices where id = (select invoice_a from post_ids)), (select id::text from public.expenses where supplier_invoice_id = (select invoice_a from post_ids)), 'invoice durable link points to the authoritative Expense');

select lives_ok($$select public.replace_invoice_project_allocations((select invoice_a from post_ids), jsonb_build_array(jsonb_build_object('project_id', (select project_b from post_ids), 'allocation_type', 'AMOUNT', 'allocation_amount', 100000)), (select updated_at from public.invoices where id = (select invoice_a from post_ids)))$$, 'changing the canonical allocation reconciles the linked Expense');
select is((select project_id from public.expenses where supplier_invoice_id = (select invoice_a from post_ids)), (select project_b from post_ids), 'Project A to Project B updates Expense.project_id');
select is((select count(*) from public.expenses where supplier_invoice_id = (select invoice_a from post_ids)), 1::bigint, 'allocation changes do not create a second Expense');

select lives_ok($$select public.replace_invoice_project_allocations((select invoice_a from post_ids), jsonb_build_array(jsonb_build_object('project_id', (select project_a from post_ids), 'allocation_type', 'AMOUNT', 'allocation_amount', 60000), jsonb_build_object('project_id', (select project_b from post_ids), 'allocation_type', 'AMOUNT', 'allocation_amount', 40000)), (select updated_at from public.invoices where id = (select invoice_a from post_ids)))$$, 'single allocation can become a split allocation');
select is((select project_id from public.expenses where supplier_invoice_id = (select invoice_a from post_ids)), null::uuid, 'split allocation clears the convenience project projection');
select is((select project_cost_code_id from public.expenses where supplier_invoice_id = (select invoice_a from post_ids)), null::uuid, 'split allocation clears stale convenience cost-code projection');
select is((select amount from public.expenses where supplier_invoice_id = (select invoice_a from post_ids)), 100000::numeric, 'split allocation keeps one total financial event');
select is((select sum(allocation_amount) from public.invoice_project_allocations where invoice_id = (select invoice_a from post_ids)), 100000::numeric, 'split ownership totals the invoice once');

select lives_ok($$select public.replace_invoice_project_allocations((select invoice_a from post_ids), jsonb_build_array(jsonb_build_object('project_id', (select project_b from post_ids), 'allocation_type', 'AMOUNT', 'allocation_amount', 100000)), (select updated_at from public.invoices where id = (select invoice_a from post_ids)))$$, 'split allocation can return to one Project');
select is((select project_id from public.expenses where supplier_invoice_id = (select invoice_a from post_ids)), (select project_b from post_ids), 'split to single restores the surviving Project projection');
select lives_ok($$select public.replace_invoice_project_allocations((select invoice_a from post_ids), '[]'::jsonb, (select updated_at from public.invoices where id = (select invoice_a from post_ids)))$$, 'canonical invoice allocation can be cleared');
select is((select project_id from public.expenses where supplier_invoice_id = (select invoice_a from post_ids)), null::uuid, 'no canonical allocation produces an unallocated Expense projection');
select lives_ok($$select public.verify_supplier_invoice_and_create_expense((select invoice_a from post_ids))$$, 'linked Expense verification retry remains idempotent after allocation repair');
select is((select count(*) from public.expenses where supplier_invoice_id = (select invoice_a from post_ids)), 1::bigint, 'verification retry still has one financial event');
select throws_ok($$update public.expenses set project_id = (select project_a from post_ids) where supplier_invoice_id = (select invoice_a from post_ids)$$, '42501', null, 'direct supplier Expense project drift is blocked');
select throws_ok($$select public.replace_invoice_project_allocations((select invoice_a from post_ids), jsonb_build_array(jsonb_build_object('project_id', (select project_other_company from post_ids), 'allocation_type', 'AMOUNT', 'allocation_amount', 100000)), (select updated_at from public.invoices where id = (select invoice_a from post_ids)))$$, '42501', null, 'cross-company invoice allocation is blocked');

reset role;
insert into public.purchase_orders(id, company_id, po_number, vendor_id, project_id, currency, status, created_by_user_id, updated_by_user_id)
values ((select purchase_order from post_ids), (select company_a from post_ids), 'POST-PO-001', (select vendor_a from post_ids), (select project_a from post_ids), 'PHP', 'DRAFT', (select user_one from post_ids), (select user_one from post_ids));
insert into public.purchase_order_lines(id, company_id, purchase_order_id, line_number, description, quantity, unit, unit_price, amount)
values ((select purchase_order_line from post_ids), (select company_a from post_ids), (select purchase_order from post_ids), 1, 'Post warehouse cement', 100, 'bags', 1000, 100000);
set local role authenticated;
select lives_ok($$select public.transition_purchase_order_status((select purchase_order from post_ids), 'APPROVED', null)$$, 'source PO can be approved');
select lives_ok($$select public.transition_purchase_order_status((select purchase_order from post_ids), 'ISSUED', null)$$, 'source PO can be issued');
select lives_ok($$select public.save_inventory_item(jsonb_build_object('id', (select inventory_item from post_ids), 'companyId', (select company_a from post_ids), 'itemName', 'Post warehouse cement', 'itemCode', 'POST-INV-ITEM', 'stockUnit', 'bags'))$$, 'canonical Inventory Item can be created for explicit warehouse posting');
select is((public.record_purchase_order_receipt(jsonb_build_object('id', (select receipt_one from post_ids), 'companyId', (select company_a from post_ids), 'purchaseOrderId', (select purchase_order from post_ids), 'receiptNumber', 'POST-REC-001', 'receiptDate', current_date, 'sourceInvoiceId', (select invoice_a from post_ids)), jsonb_build_array(jsonb_build_object('purchaseOrderLineId', (select purchase_order_line from post_ids), 'inventoryItemId', (select inventory_item from post_ids), 'receivedQuantity', 40))))->'receipt'->>'source_invoice_id', (select invoice_a::text from post_ids), 'reviewed delivery evidence preserves source invoice provenance');
select is((public.record_purchase_order_receipt(jsonb_build_object('id', (select receipt_one from post_ids), 'companyId', (select company_a from post_ids), 'purchaseOrderId', (select purchase_order from post_ids), 'receiptNumber', 'POST-REC-001', 'receiptDate', current_date, 'sourceInvoiceId', (select invoice_a from post_ids)), jsonb_build_array(jsonb_build_object('purchaseOrderLineId', (select purchase_order_line from post_ids), 'inventoryItemId', (select inventory_item from post_ids), 'receivedQuantity', 40))))->>'idempotent', 'true', 'receipt retry with the same id is idempotent');
select lives_ok($$select public.record_purchase_order_receipt(jsonb_build_object('id', (select receipt_two from post_ids), 'companyId', (select company_a from post_ids), 'purchaseOrderId', (select purchase_order from post_ids), 'receiptNumber', 'POST-REC-002', 'receiptDate', current_date, 'sourceInvoiceId', (select invoice_a from post_ids)), jsonb_build_array(jsonb_build_object('purchaseOrderLineId', (select purchase_order_line from post_ids), 'inventoryItemId', (select inventory_item from post_ids), 'receivedQuantity', 25)))$$, 'second partial receipt remains a distinct receipt');
select is((select sum(l.received_quantity) from public.purchase_order_receipt_lines l join public.purchase_order_receipts r on r.id = l.purchase_order_receipt_id where r.purchase_order_id = (select purchase_order from post_ids) and r.status = 'RECEIVED'), 65::numeric, 'partial receipt quantities remain 40 and 25 rather than ordered quantity 100');
select lives_ok($$select public.record_inventory_movement(jsonb_build_object('companyId', (select company_a from post_ids), 'itemId', (select inventory_item from post_ids), 'movementType', 'RECEIPT', 'quantity', 40, 'sourceType', 'PURCHASE_ORDER_RECEIPT', 'purchaseOrderReceiptId', (select receipt_one from post_ids), 'purchaseOrderLineId', (select purchase_order_line from post_ids), 'reason', 'Explicit warehouse receipt from reviewed delivery', 'idempotencyKey', 'post-warehouse-receipt-001'))$$, 'Warehouse stock changes only after explicit Receive into Warehouse');
select is((select count(*) from public.inventory_movements where company_id = (select company_a from post_ids) and purchase_order_receipt_id = (select receipt_one from post_ids)), 1::bigint, 'one Warehouse movement is recorded for the first partial receipt');
select throws_ok($$select public.record_inventory_movement(jsonb_build_object('companyId', (select company_a from post_ids), 'itemId', (select inventory_item from post_ids), 'movementType', 'RECEIPT', 'quantity', 40, 'sourceType', 'PURCHASE_ORDER_RECEIPT', 'purchaseOrderReceiptId', (select receipt_one from post_ids), 'purchaseOrderLineId', (select purchase_order_line from post_ids), 'reason', 'Duplicate explicit warehouse receipt', 'idempotencyKey', 'post-warehouse-receipt-002'))$$, '23505', null, 'same receipt provenance cannot be posted twice');
select throws_ok($$select public.record_purchase_order_receipt(jsonb_build_object('companyId', (select company_a from post_ids), 'purchaseOrderId', (select purchase_order from post_ids), 'receiptNumber', 'POST-REC-X', 'sourceInvoiceId', (select invoice_b from post_ids)), jsonb_build_array(jsonb_build_object('purchaseOrderLineId', (select purchase_order_line from post_ids), 'receivedQuantity', 1)))$$, '42501', null, 'cross-company source invoice cannot be linked to a Procurement receipt');

select is((public.save_engineering_equipment(jsonb_build_object('id', (select equipment from post_ids), 'companyId', (select company_a from post_ids), 'assetReference', 'EX-POST-01', 'equipmentName', 'Post warehouse excavator', 'equipmentType', 'Earthworks', 'equipmentSource', 'OWNED')))->>'lifecycle_status', 'AVAILABLE', 'new canonical Equipment starts AVAILABLE');
select is((select current_state from public.engineering_equipment_current where id = (select equipment from post_ids)), 'AVAILABLE', 'derived Equipment view reports AVAILABLE before assignment');
select is((public.assign_engineering_equipment((select equipment from post_ids), (select project_a from post_ids), current_date, 'Initial assignment'))->'assignment'->>'project_id', (select project_a::text from post_ids), 'Equipment can be assigned to Project A');
select is((select current_state from public.engineering_equipment_current where id = (select equipment from post_ids)), 'ASSIGNED', 'derived state becomes ASSIGNED');
select is((select current_project_id from public.engineering_equipment_current where id = (select equipment from post_ids)), (select project_a from post_ids), 'derived current Project is Project A');
select is((select count(*) from public.engineering_equipment_assignments where equipment_id = (select equipment from post_ids) and assignment_end is null), 1::bigint, 'one active assignment exists');
select is((public.assign_engineering_equipment((select equipment from post_ids), (select project_a from post_ids), current_date, 'Retry'))->>'idempotent', 'true', 'duplicate assignment retry is idempotent');
select throws_ok($$select public.assign_engineering_equipment((select equipment from post_ids), (select project_b from post_ids), current_date, 'Concurrent second assignment')$$, '23505', null, 'second active Project assignment is rejected');
select lives_ok($$select public.transfer_engineering_equipment((select equipment from post_ids), (select project_b from post_ids), current_date, 'Transfer to Project B')$$, 'Equipment transfer closes A and starts B atomically');
select is((select count(*) from public.engineering_equipment_assignments where equipment_id = (select equipment from post_ids) and assignment_end is null), 1::bigint, 'transfer leaves exactly one active assignment');
select is((select current_project_id from public.engineering_equipment_current where id = (select equipment from post_ids)), (select project_b from post_ids), 'transfer current Project is Project B');
select is((select count(*) from public.engineering_equipment_assignments where equipment_id = (select equipment from post_ids) and project_id = (select project_a from post_ids) and assignment_end is not null), 1::bigint, 'Project A assignment remains closed history');
select lives_ok($$select public.return_engineering_equipment((select equipment from post_ids), current_date, 'Returned to company pool')$$, 'Equipment return closes active assignment');
select is((select current_state from public.engineering_equipment_current where id = (select equipment from post_ids)), 'AVAILABLE', 'returned Equipment becomes AVAILABLE');
select lives_ok($$select public.return_engineering_equipment((select equipment from post_ids), current_date, 'Duplicate return retry')$$, 'duplicate return is an idempotent no-op');
select lives_ok($$select public.set_engineering_equipment_lifecycle((select equipment from post_ids), 'MAINTENANCE', 'Scheduled maintenance')$$, 'Equipment can enter MAINTENANCE through guarded lifecycle operation');
select throws_ok($$select public.assign_engineering_equipment((select equipment from post_ids), (select project_a from post_ids), current_date, 'Maintenance assignment')$$, '42501', null, 'MAINTENANCE Equipment cannot be assigned');
select lives_ok($$select public.set_engineering_equipment_lifecycle((select equipment from post_ids), 'RETIRED', 'Retirement approved')$$, 'Equipment can be retired with a reason');
select throws_ok($$select public.assign_engineering_equipment((select equipment from post_ids), (select project_a from post_ids), current_date, 'Retired assignment')$$, '42501', null, 'RETIRED Equipment cannot be assigned');
select throws_ok($$insert into public.engineering_equipment_registry(company_id, asset_reference, equipment_name) values ((select company_a from post_ids), 'DIRECT-01', 'Direct bypass')$$, '42501', null, 'direct Equipment registry insert is denied');
select throws_ok($$select public.assign_engineering_equipment((select equipment from post_ids), (select project_other_company from post_ids), current_date, 'Cross company assignment')$$, '42501', null, 'cross-company Equipment to Project assignment is blocked');

select * from finish();
rollback;
