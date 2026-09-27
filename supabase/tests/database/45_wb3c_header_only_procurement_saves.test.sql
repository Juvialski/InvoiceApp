begin;
select no_plan();

create temp table wb3c_header_save_ids as
select
  '00000000-0000-4000-8000-000000004501'::uuid as admin_user,
  'aaaaaaaa-0000-4000-8000-000000004501'::uuid as company_id,
  '10000000-0000-4000-8000-000000004501'::uuid as project_id,
  '20000000-0000-4000-8000-000000004501'::uuid as vendor_id,
  '30000000-0000-4000-8000-000000004501'::uuid as rfq_id,
  '31000000-0000-4000-8000-000000004501'::uuid as rfq_line_id,
  '32000000-0000-4000-8000-000000004501'::uuid as invited_vendor_id,
  '40000000-0000-4000-8000-000000004501'::uuid as po_id,
  '41000000-0000-4000-8000-000000004501'::uuid as po_line_id;
grant select on wb3c_header_save_ids to authenticated, service_role;

set local role postgres;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', (select admin_user::text from wb3c_header_save_ids), true);

insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ((select admin_user from wb3c_header_save_ids), 'wb3c-header-save@test.local', 'x', now(), now(), now());

insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values ((select company_id from wb3c_header_save_ids), 'WB-3C Header Save Company', 'wb3c-header-save', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from wb3c_header_save_ids), (select admin_user from wb3c_header_save_ids));

insert into public.company_members (company_id, user_id, role_key, status)
values ((select company_id from wb3c_header_save_ids), (select admin_user from wb3c_header_save_ids), 'COMPANY_ADMIN', 'ACTIVE');

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_id from wb3c_header_save_ids));

insert into public.projects (id, user_id, company_id, project_code, project_name, status, contract_value, project_budget, currency, tax_treatment)
values ((select project_id from wb3c_header_save_ids), (select admin_user from wb3c_header_save_ids), (select company_id from wb3c_header_save_ids), 'WB3C-HEADER', 'WB-3C Header Save Project', 'ACTIVE', 1000, 800, 'PHP', 'VAT');

insert into public.vendors (id, user_id, company_id, name, normalized_name, default_currency)
values ((select vendor_id from wb3c_header_save_ids), (select admin_user from wb3c_header_save_ids), (select company_id from wb3c_header_save_ids), 'WB-3C Header Save Supplier', 'wb-3c header save supplier', 'PHP');

insert into public.rfqs (id, company_id, rfq_number, title, project_id, currency, status, created_by_user_id, updated_by_user_id, created_at, updated_at)
values ((select rfq_id from wb3c_header_save_ids), (select company_id from wb3c_header_save_ids), 'RFQ-WB3C-001', 'Original RFQ title', (select project_id from wb3c_header_save_ids), 'PHP', 'DRAFT', (select admin_user from wb3c_header_save_ids), (select admin_user from wb3c_header_save_ids), '2026-01-01 00:00:00+00', '2026-09-20 00:00:00+00');

insert into public.rfq_lines (id, company_id, rfq_id, line_number, description, quantity, unit, notes, created_at, updated_at)
values ((select rfq_line_id from wb3c_header_save_ids), (select company_id from wb3c_header_save_ids), (select rfq_id from wb3c_header_save_ids), 1, 'Preserved RFQ line', 2, 'pcs', 'Keep line provenance', '2026-01-02 00:00:00+00', '2026-09-20 00:00:00+00');

insert into public.rfq_invited_vendors (id, company_id, rfq_id, vendor_id, invited_at, notes, created_at)
values ((select invited_vendor_id from wb3c_header_save_ids), (select company_id from wb3c_header_save_ids), (select rfq_id from wb3c_header_save_ids), (select vendor_id from wb3c_header_save_ids), '2026-01-03 00:00:00+00', 'Keep invitation history', '2026-01-03 00:00:00+00');

insert into public.purchase_orders (id, company_id, po_number, vendor_id, project_id, currency, status, description, created_by_user_id, updated_by_user_id, created_at, updated_at)
values ((select po_id from wb3c_header_save_ids), (select company_id from wb3c_header_save_ids), 'PO-WB3C-001', (select vendor_id from wb3c_header_save_ids), (select project_id from wb3c_header_save_ids), 'PHP', 'DRAFT', 'Original PO description', (select admin_user from wb3c_header_save_ids), (select admin_user from wb3c_header_save_ids), '2026-01-01 00:00:00+00', '2026-09-20 00:00:00+00');

insert into public.purchase_order_lines (id, company_id, purchase_order_id, line_number, description, quantity, unit, unit_price, amount, created_at, updated_at)
values ((select po_line_id from wb3c_header_save_ids), (select company_id from wb3c_header_save_ids), (select po_id from wb3c_header_save_ids), 1, 'Preserved PO line', 3, 'pcs', 12.50, 37.50, '2026-01-02 00:00:00+00', '2026-09-20 00:00:00+00');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select admin_user::text from wb3c_header_save_ids), true);

select lives_ok(
  $$select public.save_rfq(
    jsonb_build_object(
      'id', (select rfq_id from wb3c_header_save_ids),
      'companyId', (select company_id from wb3c_header_save_ids),
      'rfqNumber', 'RFQ-WB3C-001',
      'title', 'Updated RFQ title',
      'projectId', (select project_id from wb3c_header_save_ids),
      'currency', 'PHP',
      'dueDate', '2026-10-20'
    ),
    null::jsonb,
    null::uuid[],
    '2026-09-20 00:00:00+00'::timestamptz
  )$$,
  'header-only RFQ save succeeds with the expected version'
);
select is((select title from public.rfqs where id = (select rfq_id from wb3c_header_save_ids)), 'Updated RFQ title', 'RFQ header values are updated');
select is((select id from public.rfq_lines where rfq_id = (select rfq_id from wb3c_header_save_ids)), (select rfq_line_id from wb3c_header_save_ids), 'RFQ line identity is preserved');
select is((select description from public.rfq_lines where rfq_id = (select rfq_id from wb3c_header_save_ids)), 'Preserved RFQ line', 'RFQ line content is preserved');
select is((select updated_at from public.rfq_lines where rfq_id = (select rfq_id from wb3c_header_save_ids)), '2026-09-20 00:00:00+00'::timestamptz, 'RFQ line history timestamp is preserved');
select is((select id from public.rfq_invited_vendors where rfq_id = (select rfq_id from wb3c_header_save_ids)), (select invited_vendor_id from wb3c_header_save_ids), 'RFQ invitation identity is preserved');
select is((select notes from public.rfq_invited_vendors where rfq_id = (select rfq_id from wb3c_header_save_ids)), 'Keep invitation history', 'RFQ invitation details are preserved');

select lives_ok(
  $$select public.save_purchase_order(
    jsonb_build_object(
      'id', (select po_id from wb3c_header_save_ids),
      'companyId', (select company_id from wb3c_header_save_ids),
      'poNumber', 'PO-WB3C-001',
      'vendorId', (select vendor_id from wb3c_header_save_ids),
      'projectId', (select project_id from wb3c_header_save_ids),
      'currency', 'PHP',
      'description', 'Updated PO description'
    ),
    null::jsonb,
    '2026-09-20 00:00:00+00'::timestamptz
  )$$,
  'header-only Purchase Order save succeeds with the expected version'
);
select is((select description from public.purchase_orders where id = (select po_id from wb3c_header_save_ids)), 'Updated PO description', 'Purchase Order description is updated');
select is((select id from public.purchase_order_lines where purchase_order_id = (select po_id from wb3c_header_save_ids)), (select po_line_id from wb3c_header_save_ids), 'Purchase Order line identity is preserved');
select is((select description from public.purchase_order_lines where purchase_order_id = (select po_id from wb3c_header_save_ids)), 'Preserved PO line', 'Purchase Order line content is preserved');
select is((select updated_at from public.purchase_order_lines where purchase_order_id = (select po_id from wb3c_header_save_ids)), '2026-09-20 00:00:00+00'::timestamptz, 'Purchase Order line history timestamp is preserved');

select throws_ok(
  $$select public.save_rfq(
    jsonb_build_object('companyId', (select company_id from wb3c_header_save_ids), 'rfqNumber', 'RFQ-WB3C-NEW', 'title', 'New RFQ'),
    null::jsonb,
    null::uuid[],
    null::timestamptz
  )$$,
  '22000',
  'RFQ lines can only be preserved for an existing draft RFQ',
  'header-only line preservation cannot create an RFQ'
);
select throws_ok(
  $$select public.save_purchase_order(
    jsonb_build_object(
      'companyId', (select company_id from wb3c_header_save_ids),
      'poNumber', 'PO-WB3C-NEW',
      'vendorId', (select vendor_id from wb3c_header_save_ids),
      'projectId', (select project_id from wb3c_header_save_ids),
      'currency', 'PHP'
    ),
    null::jsonb,
    null::timestamptz
  )$$,
  '22000',
  'Purchase Order lines can only be preserved for an existing draft Purchase Order',
  'header-only line preservation cannot create a Purchase Order'
);

select * from finish();
rollback;
