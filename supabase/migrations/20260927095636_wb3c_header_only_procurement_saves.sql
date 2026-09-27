-- Preserve RFQ/PO line identities and relationships during the WB-3C
-- header-only workbook edits. Passing p_lines = NULL is accepted only for an
-- existing draft record; ordinary form/XLSX saves continue to replace lines
-- through their existing path. RFQ invitations are preserved by passing a
-- NULL p_invited_vendor_ids, as before.

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

  if p_lines is null and nullif(btrim(p_rfq->>'id'), '') is null then
    raise exception 'RFQ lines can only be preserved for an existing draft RFQ' using errcode = '22000';
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

  if p_lines is not null then
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
  end if;

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
  if p_lines is null and v_po_id is null then
    raise exception 'Purchase Order lines can only be preserved for an existing draft Purchase Order' using errcode = '22000';
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

    if p_lines is not null then
      delete from public.purchase_order_lines
       where purchase_order_id = v_po_id and company_id = v_company_id;
    end if;
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

  if p_lines is not null then
    for v_line_row in select value from jsonb_array_elements(p_lines) loop
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
  end if;

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

revoke all on function public.save_rfq(jsonb, jsonb, uuid[], timestamptz) from public, anon;
grant execute on function public.save_rfq(jsonb, jsonb, uuid[], timestamptz) to authenticated;
revoke all on function public.save_purchase_order(jsonb, jsonb, timestamptz) from public, anon;
grant execute on function public.save_purchase_order(jsonb, jsonb, timestamptz) to authenticated;
