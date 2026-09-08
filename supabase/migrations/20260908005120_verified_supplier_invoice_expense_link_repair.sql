-- HydroQualiSense forward repair for supplier invoices that were already
-- verified before their authoritative Expense was linked.
--
-- The R5 posting RPC counted only allocation_amount when selecting the
-- convenience project projection. The post-Warehouse projection helper also
-- supports legacy/direct PERCENTAGE rows whose allocation_amount is NULL. In
-- that case the RPC supplied NULL project fields and the projection trigger
-- correctly rejected the insert. Reuse the canonical helper so both paths
-- apply the same positive-allocation semantics.

create or replace function public.verify_supplier_invoice_and_create_expense(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_invoice public.invoices;
  v_vendor public.vendors;
  v_expense public.expenses;
  v_company_id uuid;
  v_category text;
  v_description text;
  v_project_id uuid;
  v_cost_code_id uuid;
  v_po_id uuid;
  v_expected_buyer_name text;
  v_actual_buyer_name text;
  v_expected_buyer_tin text;
  v_actual_buyer_tin text;
  v_verified_at timestamptz;
  v_updated_at timestamptz;
begin
  if v_actor is null then
    raise exception 'Authentication is required to verify supplier invoices' using errcode = '42501';
  end if;

  select i.* into v_invoice
  from public.invoices i
  where i.id = p_invoice_id
  for update;
  if not found then
    raise exception 'Supplier invoice was not found' using errcode = '23503';
  end if;

  v_company_id := v_invoice.company_id;
  if not (select private.has_company_permission(v_company_id, 'invoices.verify')) then
    raise exception 'Invoice verification permission is required' using errcode = '42501';
  end if;
  if not (select private.has_company_permission(v_company_id, 'expenses.manage')) then
    raise exception 'Expense management permission is required to verify a supplier invoice' using errcode = '42501';
  end if;
  if coalesce(v_invoice.lifecycle_status, 'ACTIVE') = 'VOID' then
    raise exception 'Voided supplier invoices cannot be verified' using errcode = '42501';
  end if;

  -- Reuse an existing active authoritative payable and repair only the
  -- durable invoice pointer/review metadata when necessary.
  select e.* into v_expense
  from public.expenses e
  where e.company_id = v_company_id
    and e.supplier_invoice_id = v_invoice.id
  for update;
  if found then
    if v_expense.status = 'VOID' then
      raise exception 'The linked Expense is VOID; use the Expense correction workflow before re-verifying' using errcode = '42501';
    end if;
    if v_invoice.review_status <> 'VERIFIED'
       or v_invoice.current_data->>'linkedExpenseId' is distinct from v_expense.id::text then
      update public.invoices
      set current_data = jsonb_set(coalesce(current_data, '{}'::jsonb), '{linkedExpenseId}', to_jsonb(v_expense.id), true),
          review_status = 'VERIFIED',
          verified_at = coalesce(verified_at, now()),
          updated_at = now()
      where id = v_invoice.id
        and company_id = v_company_id;
    end if;
    select i.verified_at, i.updated_at
      into v_verified_at, v_updated_at
    from public.invoices i
    where i.id = v_invoice.id;
    return jsonb_build_object(
      'invoiceId', v_invoice.id,
      'reviewStatus', 'VERIFIED',
      'verifiedAt', v_verified_at,
      'updatedAt', v_updated_at,
      'expense', to_jsonb(v_expense),
      'idempotent', true
    );
  end if;

  if v_invoice.vendor_id is null then
    raise exception 'Resolve the supplier invoice to a canonical Vendor before verification' using errcode = '22023';
  end if;
  select v.* into v_vendor
  from public.vendors v
  where v.id = v_invoice.vendor_id
    and v.company_id = v_company_id
  for share;
  if not found then
    raise exception 'The selected supplier Vendor is unavailable in this deployment company' using errcode = '23503';
  end if;
  if nullif(btrim(v_invoice.invoice_number), '') is null then
    raise exception 'Invoice number is required before supplier verification' using errcode = '22023';
  end if;
  if v_invoice.invoice_date is null then
    raise exception 'Invoice date is required before supplier verification; it cannot be replaced with today''s date' using errcode = '22023';
  end if;
  if v_invoice.currency is null or upper(btrim(v_invoice.currency)) !~ '^[A-Z]{3}$' then
    raise exception 'Invoice currency is required before supplier verification; it cannot default to PHP' using errcode = '22023';
  end if;
  if v_invoice.grand_total is null or v_invoice.grand_total <= 0 then
    raise exception 'A positive supplier invoice total is required before verification; unknown is not zero' using errcode = '22023';
  end if;
  v_category := nullif(btrim(coalesce(v_invoice.current_data->>'category', '')), '');
  if v_category is null then
    raise exception 'Expense category is unresolved; confirm it before supplier verification' using errcode = '22023';
  end if;
  v_description := nullif(btrim(coalesce(v_invoice.current_data->>'description', '')), '');
  if v_description is null then
    raise exception 'Expense description is unresolved; confirm it before supplier verification' using errcode = '22023';
  end if;

  select coalesce(p.legal_name, c.name), p.vat_tin
    into v_expected_buyer_name, v_expected_buyer_tin
  from public.companies c
  left join public.company_document_profiles p on p.company_id = c.id
  where c.id = v_company_id;
  v_actual_buyer_name := nullif(btrim(coalesce(
    v_invoice.current_data->'customer'->>'registeredName',
    v_invoice.current_data->'customer'->>'companyName',
    v_invoice.current_data->'customer'->>'name'
  )), '');
  v_actual_buyer_tin := nullif(regexp_replace(coalesce(v_invoice.current_data->'customer'->>'taxId', ''), '\D', '', 'g'), '');
  v_expected_buyer_tin := nullif(regexp_replace(coalesce(v_expected_buyer_tin, ''), '\D', '', 'g'), '');
  if v_actual_buyer_name is not null
     and private.document_party_name_key(v_actual_buyer_name) <> ''
     and private.document_party_name_key(v_expected_buyer_name) <> ''
     and position(private.document_party_name_key(v_actual_buyer_name) in private.document_party_name_key(v_expected_buyer_name)) = 0
     and position(private.document_party_name_key(v_expected_buyer_name) in private.document_party_name_key(v_actual_buyer_name)) = 0 then
    raise exception 'Buyer mismatch: the supplier invoice appears to be issued to another company' using errcode = '23514';
  end if;
  if v_actual_buyer_tin is not null
     and v_expected_buyer_tin is not null
     and v_actual_buyer_tin <> v_expected_buyer_tin then
    raise exception 'Buyer mismatch: the supplier invoice TIN does not match the deployment company' using errcode = '23514';
  end if;

  -- This helper is the post-Warehouse canonical projection contract. It
  -- handles both materialized amount allocations and legacy/direct percentage
  -- allocations, while remaining company- and invoice-bound.
  select projection.project_id, projection.project_cost_code_id
    into v_project_id, v_cost_code_id
  from private.supplier_invoice_project_projection(v_company_id, v_invoice.id) as projection;

  select m.purchase_order_id into v_po_id
  from public.purchase_order_invoice_matches m
  where m.company_id = v_company_id
    and m.invoice_id = v_invoice.id
    and m.status = 'CONFIRMED'
  order by m.confirmed_at desc nulls last, m.created_at desc
  limit 1;

  -- The provenance trigger requires VERIFIED before the Expense insert. All
  -- writes remain in this function's transaction; a later failure rolls them
  -- back together.
  update public.invoices
  set review_status = 'VERIFIED',
      verified_at = coalesce(verified_at, now()),
      updated_at = now()
  where id = v_invoice.id
    and company_id = v_company_id;

  insert into public.expenses (
    id, user_id, company_id, project_id, project_cost_code_id, expense_date,
    category, description, payee, amount, currency, reference_number, status,
    supplier_invoice_id, vendor_id, purchase_order_id, notes
  ) values (
    gen_random_uuid(), v_actor, v_company_id, v_project_id, v_cost_code_id,
    v_invoice.invoice_date, v_category, v_description, v_vendor.name,
    v_invoice.grand_total, upper(v_invoice.currency),
    nullif(btrim(v_invoice.invoice_number), ''), 'DRAFT', v_invoice.id,
    v_vendor.id, v_po_id,
    format('Authoritative supplier payable created from preserved supplier invoice %s.', v_invoice.invoice_number)
  ) returning * into v_expense;

  update public.invoices
  set current_data = jsonb_set(coalesce(current_data, '{}'::jsonb), '{linkedExpenseId}', to_jsonb(v_expense.id), true),
      review_status = 'VERIFIED',
      verified_at = coalesce(verified_at, now()),
      updated_at = now()
  where id = v_invoice.id
    and company_id = v_company_id;
  select i.verified_at, i.updated_at
    into v_verified_at, v_updated_at
  from public.invoices i
  where i.id = v_invoice.id;

  insert into public.invoice_review_events (user_id, company_id, invoice_id, event_type, new_value)
  values (
    v_actor, v_company_id, v_invoice.id, 'VERIFIED_WITH_EXPENSE',
    jsonb_build_object('expenseId', v_expense.id, 'purchaseOrderId', v_po_id, 'projectId', v_project_id)
  );

  return jsonb_build_object(
    'invoiceId', v_invoice.id,
    'reviewStatus', 'VERIFIED',
    'verifiedAt', v_verified_at,
    'updatedAt', v_updated_at,
    'expense', to_jsonb(v_expense),
    'idempotent', false
  );
end;
$$;

revoke all on function public.verify_supplier_invoice_and_create_expense(uuid) from public, anon;
grant execute on function public.verify_supplier_invoice_and_create_expense(uuid) to authenticated;
