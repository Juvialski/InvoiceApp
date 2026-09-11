begin;
select no_plan();

create temp table rfq_payload_ids as
select
  '00000000-0000-4000-8000-000000003701'::uuid as admin_user,
  'aaaaaaaa-0000-4000-8000-000000003701'::uuid as company_id,
  '10000000-0000-4000-8000-000000003701'::uuid as project_id,
  '20000000-0000-4000-8000-000000003701'::uuid as vendor_id,
  '30000000-0000-4000-8000-000000003701'::uuid as rfq_id,
  '40000000-0000-4000-8000-000000003701'::uuid as rfq_line_id,
  null::uuid as quotation_id;
grant select, update on rfq_payload_ids to authenticated, service_role;

set local role postgres;
select set_config('request.jwt.claim.role', 'service_role', true);
insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values ((select admin_user from rfq_payload_ids), 'rfq-payload-admin@test.local', 'x', now(), now(), now());
insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values ((select company_id from rfq_payload_ids), 'RFQ Payload Company', 'rfq-payload', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from rfq_payload_ids), (select admin_user from rfq_payload_ids));
insert into public.company_members (company_id, user_id, role_key, status)
values ((select company_id from rfq_payload_ids), (select admin_user from rfq_payload_ids), 'COMPANY_ADMIN', 'ACTIVE');
insert into public.projects (id, user_id, company_id, project_code, project_name, status, contract_value, project_budget, currency, tax_treatment)
values ((select project_id from rfq_payload_ids), (select admin_user from rfq_payload_ids), (select company_id from rfq_payload_ids), 'RFQ-PAYLOAD-PROJECT', 'RFQ Payload Project', 'ACTIVE', 10000, 8000, 'PHP', 'VAT');
insert into public.vendors (id, user_id, company_id, name, normalized_name, default_currency)
values ((select vendor_id from rfq_payload_ids), (select admin_user from rfq_payload_ids), (select company_id from rfq_payload_ids), 'RFQ Payload Supplier', 'rfq payload supplier', 'PHP');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select admin_user::text from rfq_payload_ids), true);

with saved as (
  select public.save_rfq(
    jsonb_build_object(
      'companyId', (select company_id from rfq_payload_ids),
      'rfqNumber', 'RFQ-PAYLOAD-001',
      'title', 'Quotation payload case test',
      'projectId', (select project_id from rfq_payload_ids),
      'currency', 'PHP'
    ),
    jsonb_build_array(jsonb_build_object(
      'description', 'Payload test material',
      'quantity', 3,
      'unit', 'pcs'
    )),
    array[(select vendor_id from rfq_payload_ids)]::uuid[]
  ) as payload
)
update rfq_payload_ids
set rfq_id = (saved.payload->'rfq'->>'id')::uuid,
    rfq_line_id = (saved.payload->'lines'->0->>'id')::uuid
from saved;

select lives_ok(
  $$select public.transition_rfq_status((select rfq_id from rfq_payload_ids), 'ISSUED', null)$$,
  'RFQ payload fixture can be issued'
);

with saved as (
  select public.save_supplier_quotation(
    jsonb_build_object(
      'companyId', (select company_id from rfq_payload_ids),
      'rfqId', (select rfq_id from rfq_payload_ids),
      'vendorId', (select vendor_id from rfq_payload_ids),
      'quotationNumber', 'QUO-PAYLOAD-001',
      'quotationDate', '2026-09-11',
      'currency', 'PHP',
      'leadTimeDays', 7
    ),
    jsonb_build_array(jsonb_build_object(
      'rfqLineId', (select rfq_line_id from rfq_payload_ids),
      'description', 'Payload test material',
      'quantity', 3,
      'unit', 'pcs',
      'unitPrice', 1250,
      'leadTimeDays', 7,
      'isNoBid', false,
      'notes', 'CamelCase payload values'
    ))
  ) as payload
)
update rfq_payload_ids
set quotation_id = (saved.payload->'quotation'->>'id')::uuid
from saved;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is((select quotation_id from rfq_payload_ids), (select id from public.supplier_quotations where quotation_number = 'QUO-PAYLOAD-001'), 'quotation payload RPC returns the persisted quotation identity');

select is((select total_amount from public.supplier_quotations where id = (select quotation_id from rfq_payload_ids)), 3750::numeric, 'camelCase unitPrice contributes to quotation total');
select is((select unit_price from public.supplier_quotation_lines where quotation_id = (select quotation_id from rfq_payload_ids)), 1250::numeric, 'camelCase unitPrice is persisted');
select is((select amount from public.supplier_quotation_lines where quotation_id = (select quotation_id from rfq_payload_ids)), 3750::numeric, 'quotation line amount is derived from quantity and unit price');
select is((select lead_time_days from public.supplier_quotation_lines where quotation_id = (select quotation_id from rfq_payload_ids)), 7, 'camelCase leadTimeDays is persisted');
select is((select is_no_bid from public.supplier_quotation_lines where quotation_id = (select quotation_id from rfq_payload_ids)), false, 'camelCase isNoBid is persisted');

select * from finish();
rollback;
