begin;
select plan(42);

create temp table inventory_ids as
select
  '00000000-0000-4000-8000-000000000961'::uuid as admin_user,
  '00000000-0000-4000-8000-000000000962'::uuid as viewer_user,
  '00000000-0000-4000-8000-000000000963'::uuid as other_user,
  'aaaaaaaa-0000-4000-8000-000000000961'::uuid as company_id,
  'bbbbbbbb-0000-4000-8000-000000000962'::uuid as other_company_id,
  '10000000-0000-4000-8000-000000000961'::uuid as project_id,
  '20000000-0000-4000-8000-000000000961'::uuid as item_id,
  '30000000-0000-4000-8000-000000000961'::uuid as material_id,
  '40000000-0000-4000-8000-000000000961'::uuid as purchase_order_id,
  '50000000-0000-4000-8000-000000000961'::uuid as purchase_order_line_id,
  '60000000-0000-4000-8000-000000000961'::uuid as receipt_id;
grant select on inventory_ids to authenticated, service_role;

insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select id, email, 'x', now(), now(), now()
from (values
  ((select admin_user from inventory_ids), 'inventory-admin@test.local'),
  ((select viewer_user from inventory_ids), 'inventory-viewer@test.local'),
  ((select other_user from inventory_ids), 'inventory-other@test.local')
) users(id, email)
on conflict (id) do nothing;

insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values
  ((select company_id from inventory_ids), 'Inventory Company', 'inventory-company', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from inventory_ids), (select admin_user from inventory_ids)),
  ((select other_company_id from inventory_ids), 'Other Inventory Company', 'other-inventory-company', 'ACTIVE', 'PHP', 'Asia/Manila', (select other_user from inventory_ids), (select other_user from inventory_ids));

insert into public.company_members (company_id, user_id, role_key, status)
values
  ((select company_id from inventory_ids), (select admin_user from inventory_ids), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_id from inventory_ids), (select viewer_user from inventory_ids), 'VIEWER', 'ACTIVE');

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_id from inventory_ids))
on conflict (singleton) do update set company_id = excluded.company_id;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from inventory_ids), true);

select has_table('public', 'inventory_items', 'canonical inventory item table exists');
select has_table('public', 'inventory_movements', 'inventory movement ledger exists');
select has_view('public', 'inventory_movement_details', 'movement detail read-through view exists');
select has_view('public', 'inventory_item_balances', 'derived inventory balance view exists');
select isnt_empty('select 1 from pg_class where oid = ''public.inventory_items''::regclass and relrowsecurity', 'inventory items use RLS');
select isnt_empty('select 1 from pg_class where oid = ''public.inventory_movements''::regclass and relrowsecurity', 'inventory movements use RLS');
select is_empty(
  $$select 1 from information_schema.role_table_grants where table_schema = 'public' and table_name in ('inventory_items', 'inventory_movements') and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE')$$,
  'authenticated callers have no direct inventory mutation grants'
);

select throws_ok(
  $$select public.save_inventory_item(jsonb_build_object('companyId', (select other_company_id from inventory_ids), 'itemName', 'Cross Company Item', 'stockUnit', 'pcs'))$$,
  '42501', null, 'inventory item company context cannot be forged'
);

create temp table inventory_item_result as
select (public.save_inventory_item(jsonb_build_object(
  'companyId', (select company_id from inventory_ids),
  'id', (select item_id from inventory_ids),
  'itemName', 'Ready Mix Concrete',
  'itemCode', 'INV-CON-001',
  'category', 'Concrete',
  'stockUnit', 'cu.m',
  'createdByUserId', (select viewer_user from inventory_ids)
))->>'id') as item_id;
select is((select item_id::uuid from inventory_item_result), (select item_id from inventory_ids), 'canonical inventory item is created');
select is((select created_by_user_id from public.inventory_items where id = (select item_id from inventory_ids)), (select admin_user from inventory_ids), 'inventory item actor is database-derived');

select set_config('request.jwt.claim.sub', (select viewer_user::text from inventory_ids), true);
select is((select count(*) from public.inventory_items where company_id = (select company_id from inventory_ids)), 1::bigint, 'viewer can read inventory items through RLS');
select throws_ok(
  $$select public.save_inventory_item(jsonb_build_object('itemName', 'Viewer Item', 'stockUnit', 'pcs'))$$,
  '42501', null, 'viewer cannot manage inventory items without inventory.manage'
);
select set_config('request.jwt.claim.sub', (select admin_user::text from inventory_ids), true);

create temp table opening_result as
select (public.record_inventory_movement(jsonb_build_object(
  'companyId', (select company_id from inventory_ids),
  'itemId', (select item_id from inventory_ids),
  'movementType', 'OPENING',
  'quantity', 100,
  'reason', 'Initial physical count',
  'reference', 'COUNT-001',
  'idempotencyKey', 'inventory-opening-001',
  'effectiveDate', '2026-09-06'
))->>'id') as movement_id;
select is((select count(*) from public.inventory_movements where company_id = (select company_id from inventory_ids)), 1::bigint, 'opening stock creates one authoritative movement');
select is((select on_hand_quantity from public.inventory_item_balances where inventory_item_id = (select item_id from inventory_ids)), 100::numeric, 'opening movement increases derived on-hand once');
select is(
  (public.record_inventory_movement(jsonb_build_object('companyId', (select company_id from inventory_ids), 'itemId', (select item_id from inventory_ids), 'movementType', 'OPENING', 'quantity', 100, 'reason', 'Initial physical count', 'idempotencyKey', 'inventory-opening-001'))->>'id'),
  (select movement_id from opening_result),
  'opening retry returns the existing movement by idempotency key'
);
select throws_ok(
  $$select public.record_inventory_movement(jsonb_build_object('itemId', (select item_id from inventory_ids), 'movementType', 'RECEIPT', 'quantity', 5, 'reason', 'Conflicting retry', 'idempotencyKey', 'inventory-opening-001'))$$,
  '23505', null, 'idempotency key cannot be reused for a different movement'
);

select lives_ok($sql$
  insert into public.projects (id, user_id, company_id, project_code, project_name, status, contract_value, project_budget, currency, tax_treatment)
  values ((select project_id from inventory_ids), (select admin_user from inventory_ids), (select company_id from inventory_ids), 'INV-PROJ-001', 'Inventory Test Project', 'ACTIVE', 1000, 800, 'PHP', 'VAT')
$sql$, 'test project can be created for project allocation');

select lives_ok($sql$
  select public.save_engineering_project_material(jsonb_build_object(
    'id', (select material_id from inventory_ids),
    'companyId', (select company_id from inventory_ids),
    'projectId', (select project_id from inventory_ids),
    'materialName', 'Ready Mix Concrete',
    'unit', 'cu.m',
    'requiredQuantity', 80,
    'inventoryItemId', (select item_id from inventory_ids),
    'status', 'ACTIVE'
  ))
$sql$, 'project material requirement can link to the canonical item');
select is((select inventory_item_id from public.engineering_project_materials where id = (select material_id from inventory_ids)), (select item_id from inventory_ids), 'project material link is persisted');
select throws_ok(
  $$select public.save_engineering_project_material(jsonb_build_object('id', (select material_id from inventory_ids), 'projectId', (select project_id from inventory_ids), 'materialName', 'Ready Mix Concrete', 'unit', 'kg', 'requiredQuantity', 80, 'inventoryItemId', (select item_id from inventory_ids)))$$,
  '22023', null, 'incompatible project requirement unit fails closed'
);

create temp table inventory_vendor as
select ((public.create_or_update_vendor(jsonb_build_object('name', 'Inventory Supplier', 'taxId', '888-777-666-000')))->'vendor'->>'id')::uuid as id;

insert into public.purchase_orders (id, company_id, po_number, vendor_id, project_id, currency, status, created_by_user_id, updated_by_user_id)
values ((select purchase_order_id from inventory_ids), (select company_id from inventory_ids), 'INV-PO-001', (select id from inventory_vendor), (select project_id from inventory_ids), 'PHP', 'DRAFT', (select admin_user from inventory_ids), (select admin_user from inventory_ids));

insert into public.purchase_order_lines (id, company_id, purchase_order_id, line_number, description, quantity, unit, unit_price, amount)
values ((select purchase_order_line_id from inventory_ids), (select company_id from inventory_ids), (select purchase_order_id from inventory_ids), 1, 'Ready Mix Concrete', 25, 'cu.m', 10, 250);
select lives_ok($sql$select public.transition_purchase_order_status((select purchase_order_id from inventory_ids), 'APPROVED', null)$sql$, 'PO can be approved for receipt provenance setup');
select lives_ok($sql$select public.transition_purchase_order_status((select purchase_order_id from inventory_ids), 'ISSUED', null)$sql$, 'PO can be issued for receipt provenance setup');
select lives_ok($sql$select public.record_purchase_order_receipt(jsonb_build_object('id', (select receipt_id from inventory_ids), 'companyId', (select company_id from inventory_ids), 'purchaseOrderId', (select purchase_order_id from inventory_ids), 'receiptNumber', 'INV-REC-001', 'receiptDate', '2026-09-06'), jsonb_build_array(jsonb_build_object('purchaseOrderLineId', (select purchase_order_line_id from inventory_ids), 'receivedQuantity', 25)))$sql$, 'valid PO receipt remains available as separate procurement evidence');

select lives_ok($sql$select public.record_inventory_movement(jsonb_build_object(
  'companyId', (select company_id from inventory_ids),
  'itemId', (select item_id from inventory_ids),
  'movementType', 'RECEIPT',
  'quantity', 25,
  'sourceType', 'PURCHASE_ORDER_RECEIPT',
  'purchaseOrderReceiptId', (select receipt_id from inventory_ids),
  'purchaseOrderLineId', (select purchase_order_line_id from inventory_ids),
  'reason', 'Receive into warehouse',
  'idempotencyKey', 'inventory-receipt-001'
))$sql$, 'explicit procurement receipt can create one warehouse receipt movement');
select throws_ok(
  $$select public.record_inventory_movement(jsonb_build_object('itemId', (select item_id from inventory_ids), 'movementType', 'RECEIPT', 'quantity', 25, 'sourceType', 'PURCHASE_ORDER_RECEIPT', 'purchaseOrderReceiptId', (select receipt_id from inventory_ids), 'purchaseOrderLineId', (select purchase_order_line_id from inventory_ids), 'reason', 'Duplicate warehouse post', 'idempotencyKey', 'inventory-receipt-002'))$$,
  '23505', null, 'the same PO receipt line cannot be posted to warehouse stock twice'
);
select is((select on_hand_quantity from public.inventory_item_balances where inventory_item_id = (select item_id from inventory_ids)), 125::numeric, 'procurement stock-in is quantity-only and does not alter procurement records');

select lives_ok($sql$select public.record_inventory_movement(jsonb_build_object('itemId', (select item_id from inventory_ids), 'movementType', 'PROJECT_ISSUE', 'quantity', 80, 'projectId', (select project_id from inventory_ids), 'projectMaterialId', (select material_id from inventory_ids), 'reason', 'Issue to test project', 'idempotencyKey', 'inventory-issue-001'))$sql$, 'project issue is recorded against the canonical item');
select is((select on_hand_quantity from public.inventory_item_balances where inventory_item_id = (select item_id from inventory_ids)), 45::numeric, 'project issue reduces derived warehouse on-hand');
select throws_ok(
  $$select public.record_inventory_movement(jsonb_build_object('itemId', (select item_id from inventory_ids), 'movementType', 'PROJECT_ISSUE', 'quantity', 46, 'projectId', (select project_id from inventory_ids), 'reason', 'Over issue attempt', 'idempotencyKey', 'inventory-issue-over'))$$,
  '23514', null, 'over-issue cannot create negative stock'
);

create temp table return_result as
select (public.record_inventory_movement(jsonb_build_object('itemId', (select item_id from inventory_ids), 'movementType', 'PROJECT_RETURN', 'quantity', 20, 'projectId', (select project_id from inventory_ids), 'projectMaterialId', (select material_id from inventory_ids), 'reason', 'Return from test project', 'idempotencyKey', 'inventory-return-001'))->>'id') as movement_id;
select is((select on_hand_quantity from public.inventory_item_balances where inventory_item_id = (select item_id from inventory_ids)), 65::numeric, 'project return increases warehouse on-hand');
select throws_ok(
  $$select public.record_inventory_movement(jsonb_build_object('itemId', (select item_id from inventory_ids), 'movementType', 'PROJECT_RETURN', 'quantity', 61, 'projectId', (select project_id from inventory_ids), 'reason', 'Excess return attempt', 'idempotencyKey', 'inventory-return-over'))$$,
  '23514', null, 'project return cannot exceed valid unreturned issue quantity'
);

select lives_ok($sql$select public.record_inventory_movement(jsonb_build_object('itemId', (select item_id from inventory_ids), 'movementType', 'REVERSAL', 'reversalOfMovementId', (select movement_id::uuid from return_result), 'reason', 'Correct return entry', 'idempotencyKey', 'inventory-reversal-001'))$sql$, 'controlled reversal preserves the original movement');
select is((select count(*) from public.inventory_movements where reversal_of_movement_id = (select movement_id::uuid from return_result)), 1::bigint, 'one reversal is linked to the original movement');
select is((public.record_inventory_movement(jsonb_build_object('itemId', (select item_id from inventory_ids), 'movementType', 'REVERSAL', 'reversalOfMovementId', (select movement_id::uuid from return_result), 'reason', 'Correct return entry', 'idempotencyKey', 'inventory-reversal-001'))->>'reversal_of_movement_id'), (select movement_id from return_result), 'reversal retry is idempotent');
select throws_ok(
  $$select public.record_inventory_movement(jsonb_build_object('itemId', (select item_id from inventory_ids), 'movementType', 'REVERSAL', 'reversalOfMovementId', (select movement_id::uuid from return_result), 'reason', 'Second correction', 'idempotencyKey', 'inventory-reversal-002'))$$,
  '23505', null, 'duplicate reversal is rejected'
);

select lives_ok($sql$select public.void_purchase_order_receipt((select receipt_id from inventory_ids), 'Receipt was voided for reconciliation')$sql$, 'underlying procurement receipt can be voided independently');
select is((select requires_reconciliation from public.inventory_movement_details where purchase_order_receipt_id = (select receipt_id from inventory_ids) limit 1), true, 'voided PO receipt produces an explicit inventory reconciliation signal');
select is((select count(*) from public.inventory_movements where purchase_order_receipt_id = (select receipt_id from inventory_ids)), 1::bigint, 'voiding procurement evidence does not silently delete inventory stock history');

select throws_ok(
  $$select public.save_inventory_item(jsonb_build_object('id', (select item_id from inventory_ids), 'itemName', 'Ready Mix Concrete', 'stockUnit', 'kg'))$$,
  '55000', null, 'canonical stock unit remains immutable after history exists'
);
select throws_ok(
  $$update public.inventory_movements set quantity = 999 where id = (select movement_id::uuid from opening_result)$$,
  '42501', null, 'inventory movement history cannot be directly edited'
);
select is((public.preview_project_lifecycle((select project_id from inventory_ids))->'dependencies'->>'inventoryMovements')::bigint > 0, true, 'project lifecycle preflight reports inventory movement history');
select is((public.preview_project_lifecycle((select project_id from inventory_ids))->>'canDelete')::boolean, false, 'project with inventory movement history cannot be destructively deleted');

select * from finish();
rollback;
