begin;
select no_plan();

select has_table('public', 'engineering_project_materials', 'materials register exists');
select has_table('public', 'engineering_project_equipment', 'equipment register exists');
select has_table('public', 'engineering_daily_site_log_work', 'structured work observations exist');
select has_table('public', 'engineering_daily_site_log_material_deliveries', 'structured material delivery observations exist');
select has_table('public', 'engineering_daily_site_log_issues', 'structured field issues exist');
select has_function('public', 'save_engineering_project_material', 'material register save RPC exists');
select has_function('public', 'save_engineering_project_equipment', 'equipment register save RPC exists');
select has_function('public', 'create_engineering_daily_site_log_v2', 'Daily Site Log v2 create RPC exists');
select has_function('public', 'update_engineering_daily_site_log_draft_v2', 'Daily Site Log v2 update RPC exists');

select is_empty(
  $$select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('engineering_daily_site_log_work', 'engineering_daily_site_log_material_deliveries', 'engineering_daily_site_log_issues')
      and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')$$,
  'structured Site Log observations are not directly writable by authenticated clients'
);
select is_empty(
  $$select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in ('save_engineering_project_material', 'save_engineering_project_equipment', 'create_engineering_daily_site_log_v2', 'update_engineering_daily_site_log_draft_v2')
      and lower(grantee) in ('anon', 'public')
      and privilege_type = 'EXECUTE'$$,
  'materials, equipment, and Site Log v2 RPCs are not anonymously callable'
);

create temp table p3bc_ids as
select
  'd3b30000-0000-4000-8000-000000000001'::uuid as admin_user,
  'd3b30000-0000-4000-8000-000000000002'::uuid as viewer_user,
  'd3b30000-0000-4000-8000-000000000003'::uuid as outsider_user,
  'd3b10000-0000-4000-8000-000000000001'::uuid as company_a,
  'd3b10000-0000-4000-8000-000000000002'::uuid as company_b,
  'd3b20000-0000-4000-8000-000000000001'::uuid as project_a,
  'd3b20000-0000-4000-8000-000000000002'::uuid as project_a_other,
  'd3b20000-0000-4000-8000-000000000003'::uuid as project_b,
  'd3b40000-0000-4000-8000-000000000001'::uuid as vendor_a,
  'd3b50000-0000-4000-8000-000000000001'::uuid as po_a,
  'd3b60000-0000-4000-8000-000000000001'::uuid as po_line_a,
  'd3b70000-0000-4000-8000-000000000001'::uuid as receipt_a,
  'd3b80000-0000-4000-8000-000000000001'::uuid as material_a,
  'd3b90000-0000-4000-8000-000000000001'::uuid as equipment_a,
  'd3b90000-0000-4000-8000-000000000002'::uuid as equipment_other_project,
  'd3bb0000-0000-4000-8000-000000000001'::uuid as cost_code_a,
  'd3bb0000-0000-4000-8000-000000000002'::uuid as cost_code_other_project,
  'd3ba0000-0000-4000-8000-000000000001'::uuid as site_log_a;
grant select on p3bc_ids to authenticated, service_role;

insert into auth.users (id, email, encrypted_password, created_at, updated_at)
select id, email, 'x', now(), now()
from (values
  ((select admin_user from p3bc_ids), 'p3bc-admin@test.local'),
  ((select viewer_user from p3bc_ids), 'p3bc-viewer@test.local'),
  ((select outsider_user from p3bc_ids), 'p3bc-outsider@test.local')
) users(id, email)
on conflict (id) do nothing;

insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values
  ((select company_a from p3bc_ids), 'P3BC Company A', 'p3bc-company-a', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from p3bc_ids), (select admin_user from p3bc_ids)),
  ((select company_b from p3bc_ids), 'P3BC Company B', 'p3bc-company-b', 'ACTIVE', 'USD', 'UTC', (select outsider_user from p3bc_ids), (select outsider_user from p3bc_ids));

insert into public.company_members (company_id, user_id, role_key, status)
values
  ((select company_a from p3bc_ids), (select admin_user from p3bc_ids), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_a from p3bc_ids), (select viewer_user from p3bc_ids), 'VIEWER', 'ACTIVE'),
  ((select company_b from p3bc_ids), (select outsider_user from p3bc_ids), 'COMPANY_ADMIN', 'ACTIVE');

insert into public.projects (id, user_id, company_id, project_code, project_name, client_name, client_reference, status, contract_value, project_budget, currency)
values
  ((select project_a from p3bc_ids), (select admin_user from p3bc_ids), (select company_a from p3bc_ids), 'P3BC-A', 'Field Operations Project', 'Client A', 'P3BC-A-REF', 'ACTIVE', 100000, 70000, 'PHP'),
  ((select project_a_other from p3bc_ids), (select admin_user from p3bc_ids), (select company_a from p3bc_ids), 'P3BC-A2', 'Other Company A Project', 'Client A', 'P3BC-A2-REF', 'ACTIVE', 100000, 70000, 'PHP'),
  ((select project_b from p3bc_ids), (select outsider_user from p3bc_ids), (select company_b from p3bc_ids), 'P3BC-B', 'Other Company Project', 'Client B', 'P3BC-B-REF', 'ACTIVE', 100000, 70000, 'USD');

insert into public.project_cost_codes (id, company_id, project_id, code, name, approved_budget_amount, created_by_user_id, updated_by_user_id)
values
  ((select cost_code_a from p3bc_ids), (select company_a from p3bc_ids), (select project_a from p3bc_ids), 'FIELD', 'Field operations', 0, (select admin_user from p3bc_ids), (select admin_user from p3bc_ids)),
  ((select cost_code_other_project from p3bc_ids), (select company_a from p3bc_ids), (select project_a_other from p3bc_ids), 'FIELD', 'Other project field operations', 0, (select admin_user from p3bc_ids), (select admin_user from p3bc_ids));

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_a from p3bc_ids))
on conflict (singleton) do update set company_id = excluded.company_id;

insert into public.vendors (id, user_id, company_id, name, normalized_name, default_currency)
values ((select vendor_a from p3bc_ids), (select admin_user from p3bc_ids), (select company_a from p3bc_ids), 'P3BC Supplier', 'p3bc supplier', 'PHP');

set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from p3bc_ids), true);

reset role;
insert into public.purchase_orders (id, company_id, po_number, vendor_id, project_id, currency, status, created_by_user_id, updated_by_user_id)
values ((select po_a from p3bc_ids), (select company_a from p3bc_ids), 'P3BC-PO-001', (select vendor_a from p3bc_ids), (select project_a from p3bc_ids), 'PHP', 'DRAFT', (select admin_user from p3bc_ids), (select admin_user from p3bc_ids));
insert into public.purchase_order_lines (id, company_id, purchase_order_id, line_number, description, quantity, unit, unit_price, amount)
values ((select po_line_a from p3bc_ids), (select company_a from p3bc_ids), (select po_a from p3bc_ids), 1, 'Concrete batch', 100, 'cu.m', 1000, 100000);
reset role;
select public.transition_purchase_order_status((select po_a from p3bc_ids), 'APPROVED', null);
select public.transition_purchase_order_status((select po_a from p3bc_ids), 'ISSUED', null);
select public.record_purchase_order_receipt(
  jsonb_build_object('id', (select receipt_a from p3bc_ids), 'companyId', (select company_a from p3bc_ids), 'purchaseOrderId', (select po_a from p3bc_ids), 'receiptNumber', 'P3BC-REC-001', 'receiptDate', '2026-09-04', 'supplierDeliveryReference', 'DEL-001'),
  jsonb_build_array(jsonb_build_object('purchaseOrderLineId', (select po_line_a from p3bc_ids), 'receivedQuantity', 60))
);
set local role authenticated;

select public.save_engineering_project_material(jsonb_build_object(
  'id', (select material_a from p3bc_ids), 'companyId', (select company_a from p3bc_ids), 'projectId', (select project_a from p3bc_ids),
  'materialName', 'Ready mix concrete', 'referenceCode', 'MAT-001', 'category', 'Concrete', 'unit', 'cu.m',
  'requiredQuantity', 100, 'purchaseOrderId', (select po_a from p3bc_ids), 'purchaseOrderLineId', (select po_line_a from p3bc_ids), 'status', 'ACTIVE'
));
select is((select required_quantity from public.engineering_project_materials where id = (select material_a from p3bc_ids)), 100::numeric, 'material required quantity is stored as planning metadata');

select throws_ok(
  $$select public.save_engineering_project_material(jsonb_build_object(
    'companyId', (select company_a from p3bc_ids), 'projectId', (select project_a_other from p3bc_ids),
    'materialName', 'Cross-project material', 'unit', 'pcs', 'requiredQuantity', 1,
    'purchaseOrderId', (select po_a from p3bc_ids), 'purchaseOrderLineId', (select po_line_a from p3bc_ids)
  ))$$,
  '42501', null,
  'material cannot link a purchase order from another project'
);
select throws_ok(
  $$select public.save_engineering_project_material(jsonb_build_object(
    'companyId', (select company_b from p3bc_ids), 'projectId', (select project_b from p3bc_ids), 'materialName', 'Cross-company material', 'unit', 'pcs'
  ))$$,
  '42501', null,
  'material RPC cannot target another deployment company'
);

select public.save_engineering_project_equipment(jsonb_build_object(
  'id', (select equipment_a from p3bc_ids), 'companyId', (select company_a from p3bc_ids), 'projectId', (select project_a from p3bc_ids),
  'assetReference', 'EQ-001', 'equipmentName', 'Excavator 20T', 'equipmentType', 'Earthworks', 'equipmentSource', 'OWNED',
  'assignmentStart', '2026-09-01', 'status', 'ACTIVE'
));
select is((public.preview_project_lifecycle((select project_a from p3bc_ids))->'dependencies'->>'projectMaterials')::bigint, 1::bigint, 'project lifecycle preflight counts material register history');
select is((public.preview_project_lifecycle((select project_a from p3bc_ids))->'dependencies'->>'projectEquipment')::bigint, 1::bigint, 'project lifecycle preflight counts equipment register history');
select public.save_engineering_project_equipment(jsonb_build_object(
  'id', (select equipment_other_project from p3bc_ids), 'companyId', (select company_a from p3bc_ids), 'projectId', (select project_a_other from p3bc_ids),
  'assetReference', 'EQ-002', 'equipmentName', 'Other project roller', 'equipmentType', 'Compaction', 'equipmentSource', 'RENTED',
  'assignmentStart', '2026-09-01', 'status', 'ACTIVE'
));

select public.create_engineering_daily_site_log_v2(
  (select company_a from p3bc_ids), (select site_log_a from p3bc_ids), (select project_a from p3bc_ids), date '2026-09-04',
  'P3BC-DSL-001', 'Concrete placement and access-road preparation', '46 cu.m placed at the north bay', 'No schedule calculation is implied', 'Field record for P3BC',
  jsonb_build_object('condition', 'CLEAR', 'temperature', 30, 'temperature_unit', 'C'),
  jsonb_build_array(jsonb_build_object('id', 'd3bc0000-0000-4000-8000-000000000001', 'crew_label', 'Concrete crew', 'project_cost_code_id', (select cost_code_a from p3bc_ids), 'headcount', 12, 'regular_hours', 8)),
  jsonb_build_array(jsonb_build_object('id', 'd3bc0000-0000-4000-8000-000000000002', 'equipment_id', (select equipment_a from p3bc_ids), 'equipment_name', 'Excavator 20T', 'equipment_type', 'Earthworks', 'asset_reference', 'EQ-001', 'operating_hours', 7.5, 'idle_hours', 1, 'condition_status', 'Operational')),
  jsonb_build_array(),
  jsonb_build_array(jsonb_build_object('id', 'd3bc0000-0000-4000-8000-000000000003', 'description', 'Concrete placed at north bay', 'quantity', 46, 'unit', 'cu.m', 'work_location', 'North bay')),
  jsonb_build_array(jsonb_build_object('id', 'd3bc0000-0000-4000-8000-000000000004', 'material_id', (select material_a from p3bc_ids), 'material_name_snapshot', 'Ready mix concrete', 'quantity_observed', 46, 'unit_snapshot', 'cu.m', 'purchase_order_id', (select po_a from p3bc_ids), 'purchase_order_line_id', (select po_line_a from p3bc_ids), 'purchase_order_receipt_id', (select receipt_a from p3bc_ids), 'supplier_delivery_reference', 'DEL-001', 'delivery_condition', 'Accepted')),
  jsonb_build_array(jsonb_build_object('id', 'd3bc0000-0000-4000-8000-000000000005', 'category', 'EQUIPMENT', 'description', 'Excavator inspection remains open', 'severity', 'HIGH', 'status', 'OPEN', 'mitigation', 'Inspection requested'))
);

select is((select count(*) from public.engineering_daily_site_log_work where site_log_id = (select site_log_a from p3bc_ids)), 1::bigint, 'v2 RPC stores structured work');
select is((select count(*) from public.engineering_daily_site_log_material_deliveries where site_log_id = (select site_log_a from p3bc_ids)), 1::bigint, 'v2 RPC stores material delivery observations');
select is((select count(*) from public.engineering_daily_site_log_issues where site_log_id = (select site_log_a from p3bc_ids)), 1::bigint, 'v2 RPC stores structured field issues');
select is((select equipment_id from public.engineering_daily_site_log_equipment where site_log_id = (select site_log_a from p3bc_ids)), (select equipment_a from p3bc_ids), 'equipment observation stores stable register link');
select is((select project_id from public.engineering_daily_site_log_crew where site_log_id = (select site_log_a from p3bc_ids)), (select project_a from p3bc_ids), 'crew observation stores the authoritative parent project snapshot');
select is((select project_cost_code_id from public.engineering_daily_site_log_crew where site_log_id = (select site_log_a from p3bc_ids)), (select cost_code_a from p3bc_ids), 'crew observation stores the same-project cost-code link');

select throws_ok(
  $$select public.create_engineering_daily_site_log_v2(
    (select company_a from p3bc_ids), 'd3ba0000-0000-4000-8000-000000000002'::uuid, (select project_a from p3bc_ids), date '2026-09-05',
    'P3BC-DSL-002', 'Cross-project crew cost code should fail', null, null, null,
    jsonb_build_object('condition', 'CLEAR'), jsonb_build_array(jsonb_build_object('id', 'd3bc0000-0000-4000-8000-000000000006', 'crew_label', 'Crew', 'project_cost_code_id', (select cost_code_other_project from p3bc_ids), 'headcount', 1)),
    jsonb_build_array(), jsonb_build_array(), jsonb_build_array(), jsonb_build_array(), jsonb_build_array()
  )$$,
  '42501', null,
  'Site Log crew cost code cannot cross projects'
);

select public.submit_engineering_daily_site_log((select company_a from p3bc_ids), (select site_log_a from p3bc_ids));
select public.finalize_engineering_daily_site_log((select company_a from p3bc_ids), (select site_log_a from p3bc_ids));
select throws_ok(
  $$update public.engineering_daily_site_log_work set description = 'forged' where site_log_id = (select site_log_a from p3bc_ids)$$,
  '42501', null,
  'authenticated clients cannot bypass finalized Site Log child write boundary'
);

reset role;
select throws_ok(
  $$delete from public.project_cost_codes where id = (select cost_code_a from p3bc_ids)$$,
  '23503', null,
  'referenced Site Log crew cost codes cannot be deleted'
);
set local role authenticated;

select public.save_engineering_project_material(jsonb_build_object(
  'id', (select material_a from p3bc_ids), 'companyId', (select company_a from p3bc_ids), 'projectId', (select project_a from p3bc_ids),
  'materialName', 'Ready mix concrete - revised register label', 'referenceCode', 'MAT-001', 'category', 'Concrete', 'unit', 'cu.m',
  'requiredQuantity', 100, 'purchaseOrderId', (select po_a from p3bc_ids), 'purchaseOrderLineId', (select po_line_a from p3bc_ids), 'status', 'ACTIVE'
));
select public.save_engineering_project_equipment(jsonb_build_object(
  'id', (select equipment_a from p3bc_ids), 'companyId', (select company_a from p3bc_ids), 'projectId', (select project_a from p3bc_ids),
  'assetReference', 'EQ-001', 'equipmentName', 'Excavator 20T - revised register label', 'equipmentType', 'Earthworks', 'equipmentSource', 'OWNED',
  'assignmentStart', '2026-09-01', 'status', 'OUT_OF_SERVICE'
));
select is((select material_name_snapshot from public.engineering_daily_site_log_material_deliveries where site_log_id = (select site_log_a from p3bc_ids)), 'Ready mix concrete', 'material delivery snapshot survives register edits');
select is((select equipment_name from public.engineering_daily_site_log_equipment where site_log_id = (select site_log_a from p3bc_ids)), 'Excavator 20T', 'equipment observation snapshot survives register edits');

select throws_ok(
  $$select public.create_engineering_daily_site_log_v2(
    (select company_a from p3bc_ids), 'd3ba0000-0000-4000-8000-000000000003'::uuid, (select project_a from p3bc_ids), date '2026-09-05',
    'P3BC-DSL-002', 'Cross-project equipment should fail', null, null, null,
    jsonb_build_object('condition', 'CLEAR'), jsonb_build_array(jsonb_build_object('crew_label', 'Crew', 'headcount', 1)),
    jsonb_build_array(jsonb_build_object('id', 'd3bc0000-0000-4000-8000-000000000006', 'equipment_id', (select equipment_other_project from p3bc_ids), 'equipment_name', 'Other project roller')),
    jsonb_build_array(), jsonb_build_array(), jsonb_build_array(), jsonb_build_array()
  )$$,
  '42501', null,
  'Site Log equipment link cannot cross projects'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select viewer_user::text from p3bc_ids), true);
select is((select count(*) from public.engineering_project_materials where company_id = (select company_a from p3bc_ids)), 1::bigint, 'project reader can read company materials');
select is((select count(*) from public.engineering_project_equipment where company_id = (select company_a from p3bc_ids)), 2::bigint, 'project reader can read company equipment');
select throws_ok(
  $$select public.save_engineering_project_equipment(jsonb_build_object('companyId', (select company_a from p3bc_ids), 'projectId', (select project_a from p3bc_ids), 'equipmentName', 'Viewer attempt'))$$,
  '42501', null,
  'project reader cannot mutate the registers'
);

select set_config('request.jwt.claim.sub', (select outsider_user::text from p3bc_ids), true);
select is((select count(*) from public.engineering_project_materials where company_id = (select company_a from p3bc_ids)), 0::bigint, 'another company cannot read company materials');
select is((select count(*) from public.engineering_daily_site_log_material_deliveries where company_id = (select company_a from p3bc_ids)), 0::bigint, 'another company cannot read Site Log deliveries');

reset role;
select * from finish();
rollback;
