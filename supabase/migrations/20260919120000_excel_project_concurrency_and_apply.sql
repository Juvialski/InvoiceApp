-- Excel-native optimistic concurrency and grouped project-control Apply.
--
-- Workbook metadata is comparison evidence only. These RPCs remain the
-- authoritative company/permission/lifecycle boundary and reject a stale
-- expected updated_at token inside the same transaction as the mutation.

-- Replace the former unversioned RFQ save signature. The final parameter has
-- a default so ordinary application callers retain their existing arity while
-- workbook Apply can provide an atomic freshness precondition.
drop function if exists public.save_rfq(jsonb, jsonb, uuid[]);

create or replace function public.save_rfq(
  p_rfq jsonb,
  p_lines jsonb,
  p_invited_vendor_ids uuid[] default null,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid;
  v_rfq_id uuid;
  v_rfq_number text;
  v_title text;
  v_description text;
  v_project_id uuid;
  v_currency text;
  v_issue_date date;
  v_due_date date;
  v_notes text;
  v_existing_status text;
  v_existing_updated_at timestamptz;
  v_line record;
  v_line_idx integer := 1;
  v_cost_code_id uuid;
  v_vendor_id uuid;
  v_result_rfq jsonb;
  v_result_lines jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_company_id := (p_rfq->>'companyId')::uuid;
  if v_company_id is null then
    raise exception 'companyId is required' using errcode = '22000';
  end if;

  if not public.has_company_permission(v_company_id, 'procurement.manage') then
    raise exception 'Insufficient permissions to create or manage RFQs' using errcode = '42501';
  end if;

  v_rfq_number := upper(btrim(coalesce(p_rfq->>'rfqNumber', '')));
  if length(v_rfq_number) < 1 or length(v_rfq_number) > 60 then
    raise exception 'Valid RFQ number is required (1-60 characters)' using errcode = '22000';
  end if;

  v_title := btrim(coalesce(p_rfq->>'title', ''));
  if length(v_title) < 1 or length(v_title) > 200 then
    raise exception 'Valid RFQ title is required (1-200 characters)' using errcode = '22000';
  end if;

  v_currency := upper(btrim(coalesce(p_rfq->>'currency', 'PHP')));
  if length(v_currency) <> 3 then
    raise exception 'Currency must be a 3-letter ISO code' using errcode = '22000';
  end if;

  v_description := p_rfq->>'description';
  v_notes := p_rfq->>'notes';
  v_issue_date := (p_rfq->>'issueDate')::date;
  v_due_date := (p_rfq->>'dueDate')::date;

  if (p_rfq->>'projectId') is not null and btrim(p_rfq->>'projectId') <> '' then
    v_project_id := (p_rfq->>'projectId')::uuid;
    if not exists (select 1 from public.projects where id = v_project_id and company_id = v_company_id) then
      raise exception 'Project does not exist in company' using errcode = '23503';
    end if;
  end if;

  if (p_rfq->>'id') is not null and btrim(p_rfq->>'id') <> '' then
    v_rfq_id := (p_rfq->>'id')::uuid;
    select r.status, r.updated_at
      into v_existing_status, v_existing_updated_at
      from public.rfqs r
     where r.id = v_rfq_id and r.company_id = v_company_id
     for update;
    if not found then
      raise exception 'RFQ not found' using errcode = 'P0002';
    end if;
    if v_existing_status <> 'DRAFT' then
      raise exception 'Only draft RFQs may be modified' using errcode = '22000';
    end if;
    if p_expected_updated_at is null or v_existing_updated_at is distinct from p_expected_updated_at then
      raise exception 'RFQ changed after export; refresh and review the current record before applying the workbook.' using errcode = '40001', detail = 'EXPECTED_VERSION_MISMATCH';
    end if;

    update public.rfqs set
      rfq_number = v_rfq_number,
      title = v_title,
      description = v_description,
      project_id = v_project_id,
      currency = v_currency,
      issue_date = v_issue_date,
      due_date = v_due_date,
      notes = v_notes,
      updated_by_user_id = v_user_id,
      updated_at = now()
    where id = v_rfq_id and company_id = v_company_id;
  else
    insert into public.rfqs (
      company_id, rfq_number, title, description, project_id, currency,
      status, issue_date, due_date, notes, created_by_user_id, updated_by_user_id
    ) values (
      v_company_id, v_rfq_number, v_title, v_description, v_project_id, v_currency,
      'DRAFT', v_issue_date, v_due_date, v_notes, v_user_id, v_user_id
    ) returning id into v_rfq_id;
  end if;

  delete from public.rfq_lines where rfq_id = v_rfq_id and company_id = v_company_id;

  for v_line in select * from jsonb_to_recordset(p_lines) as x(
    description text,
    quantity numeric,
    unit text,
    projectCostCodeId text,
    requestedDeliveryDate text,
    notes text
  ) loop
    if length(btrim(coalesce(v_line.description, ''))) < 1 then
      raise exception 'Line % description is required', v_line_idx using errcode = '22000';
    end if;
    if v_line.quantity is null or v_line.quantity <= 0 then
      raise exception 'Line % quantity must be positive', v_line_idx using errcode = '22000';
    end if;

    v_cost_code_id := null;
    if v_line.projectCostCodeId is not null and btrim(v_line.projectCostCodeId) <> '' then
      v_cost_code_id := v_line.projectCostCodeId::uuid;
      if not exists (select 1 from public.project_cost_codes where id = v_cost_code_id and company_id = v_company_id) then
        raise exception 'Project cost code does not exist in company' using errcode = '23503';
      end if;
    end if;

    insert into public.rfq_lines (
      company_id, rfq_id, line_number, description, quantity, unit,
      project_cost_code_id, requested_delivery_date, notes
    ) values (
      v_company_id, v_rfq_id, v_line_idx, btrim(v_line.description),
      v_line.quantity, coalesce(btrim(v_line.unit), 'pcs'),
      v_cost_code_id, (v_line.requestedDeliveryDate)::date, v_line.notes
    );
    v_line_idx := v_line_idx + 1;
  end loop;

  if p_invited_vendor_ids is not null then
    delete from public.rfq_invited_vendors where rfq_id = v_rfq_id and company_id = v_company_id;
    foreach v_vendor_id in array p_invited_vendor_ids loop
      if not exists (select 1 from public.vendors where id = v_vendor_id and company_id = v_company_id) then
        raise exception 'Vendor does not exist in company' using errcode = '23503';
      end if;
      insert into public.rfq_invited_vendors (company_id, rfq_id, vendor_id)
      values (v_company_id, v_rfq_id, v_vendor_id)
      on conflict do nothing;
    end loop;
  end if;

  select to_jsonb(r) into v_result_rfq from public.rfqs r where r.id = v_rfq_id;
  select coalesce(jsonb_agg(to_jsonb(l) order by l.line_number asc), '[]'::jsonb)
    into v_result_lines from public.rfq_lines l where l.rfq_id = v_rfq_id;

  return jsonb_build_object('rfq', v_result_rfq, 'lines', v_result_lines);
end;
$$;

-- Replace the former unversioned Purchase Order save signature.
drop function if exists public.save_purchase_order(jsonb, jsonb);

create or replace function public.save_purchase_order(
  p_po jsonb,
  p_lines jsonb default '[]'::jsonb,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid := (p_po->>'companyId')::uuid;
  v_po_id uuid := nullif(p_po->>'id', '')::uuid;
  v_po_number text := upper(btrim(p_po->>'poNumber'));
  v_vendor_id uuid := (p_po->>'vendorId')::uuid;
  v_project_id uuid := (p_po->>'projectId')::uuid;
  v_currency text := upper(btrim(coalesce(p_po->>'currency', 'PHP')));
  v_issue_date date := nullif(p_po->>'issueDate', '')::date;
  v_description text := nullif(btrim(p_po->>'description'), '');
  v_notes text := nullif(btrim(p_po->>'notes'), '');
  v_existing_status text;
  v_existing_updated_at timestamptz;
  v_line_row jsonb;
  v_line_idx integer := 0;
  v_line_id uuid;
  v_cost_code_id uuid;
  v_res_lines jsonb := '[]'::jsonb;
  v_res_po jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to save purchase orders' using errcode = '42501';
  end if;
  if v_company_id is null then
    raise exception 'Company ID is required' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then
    raise exception 'Purchase order lines must be a JSON array' using errcode = '22023';
  end if;
  if not (select public.has_company_permission(v_company_id, 'procurement.manage')) then
    raise exception 'Unauthorized to create or edit purchase orders' using errcode = '42501';
  end if;

  if v_po_id is not null then
    select po.status, po.updated_at
      into v_existing_status, v_existing_updated_at
      from public.purchase_orders po
     where po.id = v_po_id and po.company_id = v_company_id
     for update;
    if v_existing_status is null then
      raise exception 'Purchase order not found in company' using errcode = '23503';
    end if;
    if v_existing_status <> 'DRAFT' then
      raise exception 'Only draft purchase orders can be edited' using errcode = '42501';
    end if;
    if p_expected_updated_at is null or v_existing_updated_at is distinct from p_expected_updated_at then
      raise exception 'Purchase order changed after export; refresh and review the current record before applying the workbook.' using errcode = '40001', detail = 'EXPECTED_VERSION_MISMATCH';
    end if;

    update public.purchase_orders
       set po_number = v_po_number,
           vendor_id = v_vendor_id,
           project_id = v_project_id,
           currency = v_currency,
           issue_date = v_issue_date,
           description = v_description,
           notes = v_notes,
           updated_by_user_id = v_user_id
     where id = v_po_id and company_id = v_company_id;

    delete from public.purchase_order_lines
     where purchase_order_id = v_po_id and company_id = v_company_id;
  else
    v_po_id := gen_random_uuid();
    insert into public.purchase_orders (
      id, company_id, po_number, vendor_id, project_id, currency, status,
      issue_date, description, notes, created_by_user_id, updated_by_user_id
    ) values (
      v_po_id, v_company_id, v_po_number, v_vendor_id, v_project_id, v_currency, 'DRAFT',
      v_issue_date, v_description, v_notes, v_user_id, v_user_id
    );
  end if;

  for v_line_row in select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_line_idx := v_line_idx + 1;
    v_line_id := nullif(v_line_row->>'id', '')::uuid;
    if v_line_id is null then v_line_id := gen_random_uuid(); end if;
    v_cost_code_id := nullif(coalesce(v_line_row->>'projectCostCodeId', v_line_row->>'costCodeId'), '')::uuid;

    insert into public.purchase_order_lines (
      id, company_id, purchase_order_id, line_number, description,
      quantity, unit, unit_price, amount, project_cost_code_id
    ) values (
      v_line_id, v_company_id, v_po_id, v_line_idx,
      btrim(v_line_row->>'description'),
      coalesce((v_line_row->>'quantity')::numeric, 1),
      coalesce(nullif(btrim(v_line_row->>'unit'), ''), 'pcs'),
      coalesce((v_line_row->>'unitPrice')::numeric, 0),
      round(coalesce((v_line_row->>'quantity')::numeric, 1) * coalesce((v_line_row->>'unitPrice')::numeric, 0), 2),
      v_cost_code_id
    );
  end loop;

  select to_jsonb(po.*) into v_res_po
    from public.purchase_orders po
   where po.id = v_po_id and po.company_id = v_company_id;
  select coalesce(jsonb_agg(to_jsonb(pol.*) order by pol.line_number asc), '[]'::jsonb)
    into v_res_lines
    from public.purchase_order_lines pol
   where pol.purchase_order_id = v_po_id and pol.company_id = v_company_id;

  return jsonb_build_object('purchaseOrder', v_res_po, 'lines', v_res_lines);
end;
$$;

-- Version-aware project save. The payload deliberately contains only the
-- project master/editor fields; lifecycle and derived financial values remain
-- guarded by existing triggers and owning domains.
create or replace function public.save_project(
  p_project jsonb,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid := nullif(p_project->>'companyId', '')::uuid;
  v_project_id uuid := nullif(p_project->>'id', '')::uuid;
  v_existing public.projects%rowtype;
  v_project_code text := upper(btrim(coalesce(p_project->>'projectCode', '')));
  v_project_name text := btrim(coalesce(p_project->>'projectName', ''));
  v_tax_treatment text := upper(btrim(coalesce(p_project->>'taxTreatment', 'UNCLASSIFIED')));
begin
  if v_user_id is null then
    raise exception 'Authentication is required to save projects' using errcode = '42501';
  end if;
  if v_company_id is null then
    raise exception 'Company ID is required' using errcode = '42501';
  end if;
  if not public.has_company_permission(v_company_id, 'projects.manage') then
    raise exception 'Insufficient permissions to create or manage projects' using errcode = '42501';
  end if;
  if length(v_project_code) < 1 or length(v_project_name) < 1 then
    raise exception 'Project code and project name are required' using errcode = '22000';
  end if;
  if v_tax_treatment not in ('VAT', 'NON_VAT', 'UNCLASSIFIED') then
    raise exception 'Project tax treatment is invalid' using errcode = '22000';
  end if;

  if v_project_id is not null then
    select p.* into v_existing
      from public.projects p
     where p.id = v_project_id and p.company_id = v_company_id
     for update;
    if not found then
      -- A caller may use a client-generated UUID for a new project.
      v_existing := null;
    elsif p_expected_updated_at is null or v_existing.updated_at is distinct from p_expected_updated_at then
      raise exception 'Project changed after export; refresh and review the current record before applying the workbook.' using errcode = '40001', detail = 'EXPECTED_VERSION_MISMATCH';
    end if;
  end if;

  if v_existing.id is null then
    insert into public.projects (
      id, user_id, company_id, project_code, project_name, description,
      client_name, client_reference, billing_contact_name, billing_email,
      billing_address, location, site_address, project_manager, status,
      start_date, target_end_date, actual_end_date, contract_value,
      project_budget, currency, tax_treatment, notes, archived_at,
      archived_from_status
    ) values (
      coalesce(v_project_id, gen_random_uuid()), v_user_id, v_company_id,
      v_project_code, v_project_name, nullif(p_project->>'description', ''),
      nullif(p_project->>'clientName', ''), nullif(p_project->>'clientReference', ''),
      nullif(p_project->>'billingContactName', ''), nullif(p_project->>'billingEmail', ''),
      nullif(p_project->>'billingAddress', ''), nullif(p_project->>'location', ''),
      nullif(p_project->>'siteAddress', ''), nullif(p_project->>'projectManager', ''),
      coalesce(nullif(p_project->>'status', ''), 'PLANNING'),
      nullif(p_project->>'startDate', '')::date, nullif(p_project->>'targetEndDate', '')::date,
      nullif(p_project->>'actualEndDate', '')::date, nullif(p_project->>'contractValue', '')::numeric,
      coalesce(nullif(p_project->>'projectBudget', '')::numeric, 0),
      upper(coalesce(nullif(p_project->>'currency', ''), 'PHP')),
      v_tax_treatment, nullif(p_project->>'notes', ''),
      nullif(p_project->>'archivedAt', '')::timestamptz,
      nullif(p_project->>'archivedFromStatus', '')
    ) returning * into v_existing;
  else
    update public.projects
       set project_code = v_project_code,
           project_name = v_project_name,
           description = nullif(p_project->>'description', ''),
           client_name = nullif(p_project->>'clientName', ''),
           client_reference = nullif(p_project->>'clientReference', ''),
           billing_contact_name = nullif(p_project->>'billingContactName', ''),
           billing_email = nullif(p_project->>'billingEmail', ''),
           billing_address = nullif(p_project->>'billingAddress', ''),
           location = nullif(p_project->>'location', ''),
           site_address = nullif(p_project->>'siteAddress', ''),
           project_manager = nullif(p_project->>'projectManager', ''),
           status = coalesce(nullif(p_project->>'status', ''), status),
           start_date = nullif(p_project->>'startDate', '')::date,
           target_end_date = nullif(p_project->>'targetEndDate', '')::date,
           actual_end_date = nullif(p_project->>'actualEndDate', '')::date,
           contract_value = nullif(p_project->>'contractValue', '')::numeric,
           project_budget = coalesce(nullif(p_project->>'projectBudget', '')::numeric, 0),
           currency = upper(coalesce(nullif(p_project->>'currency', ''), currency)),
           tax_treatment = v_tax_treatment,
           notes = nullif(p_project->>'notes', '')
     where id = v_existing.id and company_id = v_company_id
     returning * into v_existing;
  end if;

  return jsonb_build_object('project', to_jsonb(v_existing));
end;
$$;

-- Atomically apply one project's master-data edits and existing cost-code
-- edits. The caller supplies only rows it proposes to change; absent rows are
-- retained. All cost codes for the project are locked before the final budget
-- ceiling is calculated, preventing concurrent budget edits from racing the
-- deferred row trigger.
create or replace function public.apply_project_cost_control_group(
  p_project_id uuid,
  p_expected_project_updated_at timestamptz,
  p_project jsonb,
  p_cost_codes jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid;
  v_project public.projects%rowtype;
  v_project_budget numeric;
  v_total_active_budget numeric;
  v_cost_code jsonb;
  v_cost_code_id uuid;
  v_current public.project_cost_codes%rowtype;
  v_expected_updated_at timestamptz;
  v_proposed_status text;
  v_proposed_budget numeric;
  v_seen_ids uuid[] := '{}'::uuid[];
  v_project_row jsonb;
  v_cost_code_rows jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to apply project workbook changes' using errcode = '42501';
  end if;
  if p_project_id is null or p_expected_project_updated_at is null then
    raise exception 'Project identity and expected version are required' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_project, '{}'::jsonb)) <> 'object' then
    raise exception 'Project payload must be an object' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_cost_codes, '[]'::jsonb)) <> 'array' then
    raise exception 'Cost-code payload must be an array' using errcode = '22023';
  end if;

  select p.* into v_project
    from public.projects p
   where p.id = p_project_id
   for update;
  if not found then
    raise exception 'Project does not exist in the deployment company' using errcode = '42501';
  end if;
  v_company_id := v_project.company_id;
  if not public.has_company_permission(v_company_id, 'projects.manage') then
    raise exception 'Insufficient permissions to manage this project' using errcode = '42501';
  end if;
  if v_project.updated_at is distinct from p_expected_project_updated_at then
    raise exception 'Project changed after export; refresh and review the current record before applying the workbook.' using errcode = '40001', detail = 'EXPECTED_VERSION_MISMATCH';
  end if;
  if nullif(p_project->>'id', '')::uuid is distinct from p_project_id then
    raise exception 'Workbook project identity does not match the selected project' using errcode = '42501';
  end if;
  if nullif(p_project->>'companyId', '')::uuid is not null and nullif(p_project->>'companyId', '')::uuid is distinct from v_company_id then
    raise exception 'Workbook project company identity is outside the active company' using errcode = '42501';
  end if;
  if nullif(p_project->>'currency', '') is not null
     and upper(nullif(p_project->>'currency', '')) is distinct from v_project.currency then
    raise exception 'Project currency is protected in workbook Apply' using errcode = '42501';
  end if;
  if nullif(p_project->>'taxTreatment', '') is not null
     and upper(nullif(p_project->>'taxTreatment', '')) not in ('VAT', 'NON_VAT')
     and upper(nullif(p_project->>'taxTreatment', '')) is distinct from v_project.tax_treatment then
    raise exception 'A classified project cannot be changed back to an unclassified tax treatment through workbook Apply' using errcode = '42501';
  end if;
  if nullif(p_project->>'status', '') is not null and nullif(p_project->>'status', '') is distinct from v_project.status then
    raise exception 'Project lifecycle status is controlled by the project lifecycle workflow' using errcode = '42501';
  end if;
  if nullif(p_project->>'archivedAt', '')::timestamptz is distinct from v_project.archived_at then
    raise exception 'Project archive metadata is protected' using errcode = '42501';
  end if;
  if nullif(p_project->>'archivedFromStatus', '') is distinct from v_project.archived_from_status then
    raise exception 'Project archive provenance is protected' using errcode = '42501';
  end if;

  -- Lock every current cost code before deriving the final active allocation.
  perform 1
    from public.project_cost_codes cc
   where cc.company_id = v_company_id and cc.project_id = p_project_id
   for update;
  select coalesce(sum(case when cc.status = 'ACTIVE' then cc.approved_budget_amount else 0 end), 0)
    into v_total_active_budget
    from public.project_cost_codes cc
   where cc.company_id = v_company_id and cc.project_id = p_project_id;

  v_project_budget := coalesce(nullif(p_project->>'projectBudget', '')::numeric, v_project.project_budget);
  if v_project_budget < 0 then
    raise exception 'Project approved budget must be non-negative' using errcode = '22023';
  end if;

  for v_cost_code in select value from jsonb_array_elements(p_cost_codes) loop
    if jsonb_typeof(v_cost_code) <> 'object' then
      raise exception 'Each cost-code proposal must be an object' using errcode = '22023';
    end if;
    v_cost_code_id := nullif(v_cost_code->>'id', '')::uuid;
    if v_cost_code_id is null then
      raise exception 'New cost codes are not supported by the workbook Apply path' using errcode = '0A000';
    end if;
    if v_cost_code_id = any(v_seen_ids) then
      raise exception 'A cost code may appear only once in a workbook Apply group' using errcode = '23505';
    end if;
    v_seen_ids := array_append(v_seen_ids, v_cost_code_id);

    select cc.* into v_current
      from public.project_cost_codes cc
     where cc.id = v_cost_code_id
       and cc.company_id = v_company_id
       and cc.project_id = p_project_id
     for update;
    if not found then
      raise exception 'Cost code is unknown, cross-company, or belongs to another project' using errcode = '42501';
    end if;
    if nullif(v_cost_code->>'projectId', '')::uuid is distinct from p_project_id then
      raise exception 'Cost-code parent identity cannot be changed' using errcode = '42501';
    end if;
    v_expected_updated_at := nullif(v_cost_code->>'updatedAt', '')::timestamptz;
    if v_expected_updated_at is null or v_current.updated_at is distinct from v_expected_updated_at then
      raise exception 'Cost code changed after export; refresh and review the current record before applying the workbook.' using errcode = '40001', detail = 'EXPECTED_VERSION_MISMATCH';
    end if;
    v_proposed_status := coalesce(nullif(v_cost_code->>'status', ''), v_current.status);
    if v_proposed_status is distinct from v_current.status then
      raise exception 'Cost-code lifecycle status is controlled by the archive/reactivate workflow' using errcode = '42501';
    end if;
    v_proposed_budget := coalesce(nullif(v_cost_code->>'approvedBudgetAmount', '')::numeric, v_current.approved_budget_amount);
    if v_proposed_budget < 0 then
      raise exception 'Cost-code approved budget must be non-negative' using errcode = '22023';
    end if;
    if v_current.status = 'ACTIVE' then
      v_total_active_budget := v_total_active_budget - v_current.approved_budget_amount + v_proposed_budget;
    end if;
  end loop;

  if v_total_active_budget > v_project_budget + 0.01 then
    raise exception 'Active cost-code budgets (%) exceed the project approved budget (%) by %',
      v_total_active_budget, v_project_budget, round(v_total_active_budget - v_project_budget, 2)
      using errcode = '23514';
  end if;

  update public.projects
     set project_code = upper(btrim(coalesce(p_project->>'projectCode', v_project.project_code))),
         project_name = btrim(coalesce(p_project->>'projectName', v_project.project_name)),
         description = nullif(coalesce(p_project->>'description', v_project.description), ''),
         client_name = nullif(coalesce(p_project->>'clientName', v_project.client_name), ''),
         client_reference = nullif(coalesce(p_project->>'clientReference', v_project.client_reference), ''),
         billing_contact_name = nullif(coalesce(p_project->>'billingContactName', v_project.billing_contact_name), ''),
         billing_email = nullif(coalesce(p_project->>'billingEmail', v_project.billing_email), ''),
         billing_address = nullif(coalesce(p_project->>'billingAddress', v_project.billing_address), ''),
         location = nullif(coalesce(p_project->>'location', v_project.location), ''),
         site_address = nullif(coalesce(p_project->>'siteAddress', v_project.site_address), ''),
         project_manager = nullif(coalesce(p_project->>'projectManager', v_project.project_manager), ''),
         start_date = nullif(coalesce(p_project->>'startDate', v_project.start_date::text), '')::date,
         target_end_date = nullif(coalesce(p_project->>'targetEndDate', v_project.target_end_date::text), '')::date,
         actual_end_date = nullif(coalesce(p_project->>'actualEndDate', v_project.actual_end_date::text), '')::date,
         contract_value = nullif(coalesce(p_project->>'contractValue', v_project.contract_value::text), '')::numeric,
         project_budget = v_project_budget,
         currency = v_project.currency,
         tax_treatment = upper(coalesce(nullif(p_project->>'taxTreatment', ''), v_project.tax_treatment)),
         notes = nullif(coalesce(p_project->>'notes', v_project.notes), '')
   where id = p_project_id and company_id = v_company_id
   returning * into v_project;

  for v_cost_code in select value from jsonb_array_elements(p_cost_codes) loop
    v_cost_code_id := (v_cost_code->>'id')::uuid;
    update public.project_cost_codes
       set code = upper(btrim(coalesce(v_cost_code->>'code', code))),
           name = btrim(coalesce(v_cost_code->>'name', name)),
           description = nullif(coalesce(v_cost_code->>'description', description), ''),
           approved_budget_amount = coalesce(nullif(v_cost_code->>'approvedBudgetAmount', '')::numeric, approved_budget_amount),
           forecast_amount = nullif(coalesce(v_cost_code->>'forecastAmount', forecast_amount::text), '')::numeric,
           updated_by_user_id = v_user_id
     where id = v_cost_code_id and company_id = v_company_id and project_id = p_project_id;
  end loop;

  select to_jsonb(p) into v_project_row from public.projects p where p.id = p_project_id;
  select coalesce(jsonb_agg(to_jsonb(cc) order by cc.code), '[]'::jsonb)
    into v_cost_code_rows
    from public.project_cost_codes cc
   where cc.company_id = v_company_id and cc.project_id = p_project_id;
  return jsonb_build_object('project', v_project_row, 'costCodes', v_cost_code_rows);
end;
$$;

revoke all on function public.save_rfq(jsonb, jsonb, uuid[], timestamptz) from public, anon;
grant execute on function public.save_rfq(jsonb, jsonb, uuid[], timestamptz) to authenticated;
revoke all on function public.save_purchase_order(jsonb, jsonb, timestamptz) from public, anon;
grant execute on function public.save_purchase_order(jsonb, jsonb, timestamptz) to authenticated;
revoke all on function public.save_project(jsonb, timestamptz) from public, anon;
grant execute on function public.save_project(jsonb, timestamptz) to authenticated;
revoke all on function public.apply_project_cost_control_group(uuid, timestamptz, jsonb, jsonb) from public, anon;
grant execute on function public.apply_project_cost_control_group(uuid, timestamptz, jsonb, jsonb) to authenticated;

