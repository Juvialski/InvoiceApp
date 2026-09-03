-- P2A-4 review hardening.
--
-- RFQs and supplier quotations remain pre-commitment records. This migration
-- closes cross-RFQ/project provenance gaps, makes quotation selection/conversion
-- lifecycle-safe and concurrency-safe, protects PO provenance, and exposes only
-- SELECT plus guarded RPC execution to authenticated clients.

-- ---------------------------------------------------------------------------
-- Explicit table grants: reads are still filtered by RLS; direct writes stay
-- closed because every business mutation must pass through the guarded RPCs.
-- ---------------------------------------------------------------------------

grant select on table
  public.rfqs,
  public.rfq_lines,
  public.rfq_invited_vendors,
  public.supplier_quotations,
  public.supplier_quotation_lines
  to authenticated;

revoke insert, update, delete on table
  public.rfqs,
  public.rfq_lines,
  public.rfq_invited_vendors,
  public.supplier_quotations,
  public.supplier_quotation_lines
  from authenticated, anon;

-- One quotation response may map at most one row to a given RFQ line.
create unique index if not exists supplier_quotation_lines_quote_rfq_line_unique
  on public.supplier_quotation_lines (company_id, quotation_id, rfq_line_id)
  where rfq_line_id is not null;

-- ---------------------------------------------------------------------------
-- RFQ / quotation scope backstops.
-- ---------------------------------------------------------------------------

create or replace function private.validate_rfq_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_company_id uuid;
  v_project_status text;
  v_project_archived_at timestamptz;
  v_quote_company_id uuid;
  v_quote_rfq_id uuid;
  v_quote_status text;
begin
  if new.project_id is not null then
    select p.company_id, p.status, p.archived_at
      into v_project_company_id, v_project_status, v_project_archived_at
    from public.projects p
    where p.id = new.project_id;

    if v_project_company_id is null then
      raise exception 'RFQ project does not exist' using errcode = '23503';
    end if;
    if v_project_company_id is distinct from new.company_id then
      raise exception 'RFQ project is outside the company' using errcode = '42501';
    end if;
    if v_project_status = 'ARCHIVED' or v_project_archived_at is not null then
      raise exception 'Archived projects cannot receive RFQ activity' using errcode = '42501';
    end if;
  end if;

  if new.selected_quotation_id is not null then
    select q.company_id, q.rfq_id, q.status
      into v_quote_company_id, v_quote_rfq_id, v_quote_status
    from public.supplier_quotations q
    where q.id = new.selected_quotation_id;

    if v_quote_company_id is null then
      raise exception 'Selected quotation does not exist' using errcode = '23503';
    end if;
    if v_quote_company_id is distinct from new.company_id or v_quote_rfq_id is distinct from new.id then
      raise exception 'Selected quotation does not belong to this RFQ and company' using errcode = '42501';
    end if;
    if v_quote_status <> 'SELECTED' then
      raise exception 'RFQ selected quotation must have SELECTED status' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.company_id is distinct from old.company_id or new.created_at is distinct from old.created_at or
       new.created_by_user_id is distinct from old.created_by_user_id then
      raise exception 'RFQ company and creation provenance are immutable' using errcode = '42501';
    end if;

    if old.status <> 'DRAFT' and (
      new.rfq_number is distinct from old.rfq_number or
      new.title is distinct from old.title or
      new.description is distinct from old.description or
      new.project_id is distinct from old.project_id or
      new.currency is distinct from old.currency or
      new.due_date is distinct from old.due_date or
      new.notes is distinct from old.notes
    ) then
      raise exception 'Issued, closed, or cancelled RFQ commercial terms are immutable' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_rfq_scope() from public, anon, authenticated;

drop trigger if exists rfqs_scope_guard on public.rfqs;
create trigger rfqs_scope_guard
  before insert or update on public.rfqs
  for each row execute function private.validate_rfq_scope();

create or replace function private.validate_rfq_line_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rfq_company_id uuid;
  v_rfq_project_id uuid;
  v_rfq_status text;
  v_cost_code_status text;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  select r.company_id, r.project_id, r.status
    into v_rfq_company_id, v_rfq_project_id, v_rfq_status
  from public.rfqs r
  where r.id = new.rfq_id;

  if v_rfq_company_id is null then
    raise exception 'RFQ line requires an existing RFQ' using errcode = '23503';
  end if;
  if v_rfq_company_id is distinct from new.company_id then
    raise exception 'RFQ line is outside the RFQ company' using errcode = '42501';
  end if;
  if v_rfq_status <> 'DRAFT' then
    raise exception 'RFQ lines may only be changed while the RFQ is DRAFT' using errcode = '42501';
  end if;

  if new.project_cost_code_id is not null then
    if v_rfq_project_id is null then
      raise exception 'RFQ cost code requires an RFQ Project' using errcode = '23514';
    end if;

    select cc.status into v_cost_code_status
    from public.project_cost_codes cc
    where cc.id = new.project_cost_code_id
      and cc.company_id = new.company_id
      and cc.project_id = v_rfq_project_id;

    if v_cost_code_status is null then
      raise exception 'RFQ cost code must belong to the same Project and company' using errcode = '42501';
    end if;
    if v_cost_code_status <> 'ACTIVE' then
      raise exception 'Archived cost codes cannot receive new RFQ assignments' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_rfq_line_scope() from public, anon, authenticated;

drop trigger if exists rfq_lines_scope_guard on public.rfq_lines;
create trigger rfq_lines_scope_guard
  before insert or update on public.rfq_lines
  for each row execute function private.validate_rfq_line_scope();

create or replace function private.validate_supplier_quotation_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rfq_company_id uuid;
  v_vendor_company_id uuid;
begin
  select r.company_id into v_rfq_company_id
  from public.rfqs r
  where r.id = new.rfq_id;

  if v_rfq_company_id is null then
    raise exception 'Supplier quotation requires an existing RFQ' using errcode = '23503';
  end if;
  if v_rfq_company_id is distinct from new.company_id then
    raise exception 'Supplier quotation RFQ is outside the company' using errcode = '42501';
  end if;

  select v.company_id into v_vendor_company_id
  from public.vendors v
  where v.id = new.vendor_id;

  if v_vendor_company_id is null then
    raise exception 'Supplier quotation requires an existing Vendor' using errcode = '23503';
  end if;
  if v_vendor_company_id is distinct from new.company_id then
    raise exception 'Supplier quotation Vendor is outside the company' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if new.company_id is distinct from old.company_id or new.rfq_id is distinct from old.rfq_id or
       new.vendor_id is distinct from old.vendor_id or new.created_at is distinct from old.created_at or
       new.created_by_user_id is distinct from old.created_by_user_id then
      raise exception 'Quotation company, RFQ, Vendor, and creation provenance are immutable' using errcode = '42501';
    end if;

    if old.status <> 'SUBMITTED' and (
      new.quotation_number is distinct from old.quotation_number or
      new.quotation_date is distinct from old.quotation_date or
      new.valid_until is distinct from old.valid_until or
      new.currency is distinct from old.currency or
      new.payment_terms is distinct from old.payment_terms or
      new.delivery_terms is distinct from old.delivery_terms or
      new.lead_time_days is distinct from old.lead_time_days or
      new.notes is distinct from old.notes or
      new.total_amount is distinct from old.total_amount
    ) then
      raise exception 'Selected, rejected, or cancelled quotation terms are immutable' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_supplier_quotation_scope() from public, anon, authenticated;

drop trigger if exists supplier_quotations_scope_guard on public.supplier_quotations;
create trigger supplier_quotations_scope_guard
  before insert or update on public.supplier_quotations
  for each row execute function private.validate_supplier_quotation_scope();

create or replace function private.validate_supplier_quotation_line_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote_company_id uuid;
  v_quote_rfq_id uuid;
  v_quote_status text;
  v_line_company_id uuid;
  v_line_rfq_id uuid;
begin
  if tg_op = 'DELETE' then
    return old;
  end if;

  select q.company_id, q.rfq_id, q.status
    into v_quote_company_id, v_quote_rfq_id, v_quote_status
  from public.supplier_quotations q
  where q.id = new.quotation_id;

  if v_quote_company_id is null then
    raise exception 'Quotation line requires an existing quotation' using errcode = '23503';
  end if;
  if v_quote_company_id is distinct from new.company_id then
    raise exception 'Quotation line is outside the quotation company' using errcode = '42501';
  end if;
  if v_quote_status <> 'SUBMITTED' then
    raise exception 'Quotation lines may only be changed while the quotation is SUBMITTED' using errcode = '42501';
  end if;

  if new.rfq_line_id is not null then
    select l.company_id, l.rfq_id
      into v_line_company_id, v_line_rfq_id
    from public.rfq_lines l
    where l.id = new.rfq_line_id;

    if v_line_company_id is null then
      raise exception 'Mapped RFQ line does not exist' using errcode = '23503';
    end if;
    if v_line_company_id is distinct from new.company_id or v_line_rfq_id is distinct from v_quote_rfq_id then
      raise exception 'Quotation line must map to a line on the same RFQ and company' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_supplier_quotation_line_scope() from public, anon, authenticated;

drop trigger if exists supplier_quotation_lines_scope_guard on public.supplier_quotation_lines;
create trigger supplier_quotation_lines_scope_guard
  before insert or update on public.supplier_quotation_lines
  for each row execute function private.validate_supplier_quotation_line_scope();

-- ---------------------------------------------------------------------------
-- Purchase Order provenance is explicit and immutable. A quotation-linked PO
-- can only be created from the RFQ's currently SELECTED quotation.
-- ---------------------------------------------------------------------------

create or replace function private.validate_purchase_order_procurement_provenance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rfq record;
  v_quote record;
begin
  if tg_op = 'UPDATE' and (
    new.rfq_id is distinct from old.rfq_id or
    new.supplier_quotation_id is distinct from old.supplier_quotation_id
  ) then
    raise exception 'Purchase order RFQ/quotation provenance is immutable' using errcode = '42501';
  end if;

  if new.rfq_id is null and new.supplier_quotation_id is not null then
    raise exception 'Quotation-linked purchase order requires RFQ provenance' using errcode = '23514';
  end if;

  if new.rfq_id is not null then
    select r.* into v_rfq
    from public.rfqs r
    where r.id = new.rfq_id;

    if not found then
      raise exception 'Purchase order RFQ provenance does not exist' using errcode = '23503';
    end if;
    if v_rfq.company_id is distinct from new.company_id or v_rfq.project_id is distinct from new.project_id then
      raise exception 'Purchase order RFQ provenance must match company and Project' using errcode = '42501';
    end if;
  end if;

  if new.supplier_quotation_id is not null then
    select q.* into v_quote
    from public.supplier_quotations q
    where q.id = new.supplier_quotation_id;

    if not found then
      raise exception 'Purchase order quotation provenance does not exist' using errcode = '23503';
    end if;
    if v_quote.company_id is distinct from new.company_id or v_quote.rfq_id is distinct from new.rfq_id or
       v_quote.vendor_id is distinct from new.vendor_id or v_quote.currency is distinct from new.currency then
      raise exception 'Purchase order quotation provenance does not match RFQ, Vendor, company, and currency' using errcode = '42501';
    end if;
    if v_quote.status <> 'SELECTED' or v_rfq.selected_quotation_id is distinct from v_quote.id then
      raise exception 'Purchase order may only be generated from the RFQ selected quotation' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_purchase_order_procurement_provenance() from public, anon, authenticated;

drop trigger if exists purchase_orders_procurement_provenance_guard on public.purchase_orders;
create trigger purchase_orders_procurement_provenance_guard
  before insert or update on public.purchase_orders
  for each row execute function private.validate_purchase_order_procurement_provenance();

-- ---------------------------------------------------------------------------
-- Harden quotation mutation RPCs.
-- ---------------------------------------------------------------------------

create or replace function public.save_supplier_quotation(
  p_quotation jsonb,
  p_lines jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid := nullif(p_quotation->>'companyId', '')::uuid;
  v_rfq_id uuid := nullif(p_quotation->>'rfqId', '')::uuid;
  v_vendor_id uuid := nullif(p_quotation->>'vendorId', '')::uuid;
  v_quotation_id uuid := nullif(p_quotation->>'id', '')::uuid;
  v_quotation_number text := btrim(coalesce(p_quotation->>'quotationNumber', ''));
  v_quotation_date date;
  v_valid_until date;
  v_currency text;
  v_payment_terms text := nullif(btrim(p_quotation->>'paymentTerms'), '');
  v_delivery_terms text := nullif(btrim(p_quotation->>'deliveryTerms'), '');
  v_lead_time_days integer := nullif(p_quotation->>'leadTimeDays', '')::integer;
  v_notes text := nullif(btrim(p_quotation->>'notes'), '');
  v_rfq record;
  v_existing_quote record;
  v_line record;
  v_line_idx integer := 1;
  v_line_amount numeric(18,2);
  v_total_amount numeric(18,2) := 0;
  v_rfq_line_id uuid;
  v_result_quote jsonb;
  v_result_lines jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if v_company_id is null or v_rfq_id is null or v_vendor_id is null then
    raise exception 'companyId, rfqId, and vendorId are required' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then
    raise exception 'Quotation lines must be a JSON array' using errcode = '22023';
  end if;
  if not public.has_company_permission(v_company_id, 'procurement.manage') then
    raise exception 'Insufficient permissions to manage quotations' using errcode = '42501';
  end if;

  select r.* into v_rfq
  from public.rfqs r
  where r.id = v_rfq_id and r.company_id = v_company_id
  for share;

  if not found then
    raise exception 'RFQ not found in company' using errcode = 'P0002';
  end if;
  if v_rfq.status <> 'ISSUED' then
    raise exception 'Supplier quotations may only be created or edited while the RFQ is ISSUED' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.vendors v where v.id = v_vendor_id and v.company_id = v_company_id
  ) then
    raise exception 'Vendor does not exist in company' using errcode = '23503';
  end if;
  if length(v_quotation_number) < 1 or length(v_quotation_number) > 60 then
    raise exception 'Quotation reference number is required (1-60 characters)' using errcode = '22023';
  end if;

  v_currency := upper(btrim(coalesce(nullif(p_quotation->>'currency', ''), v_rfq.currency)));
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a 3-letter ISO code' using errcode = '22023';
  end if;
  v_quotation_date := coalesce(nullif(p_quotation->>'quotationDate', '')::date, current_date);
  v_valid_until := nullif(p_quotation->>'validUntil', '')::date;

  if v_quotation_id is not null then
    select q.* into v_existing_quote
    from public.supplier_quotations q
    where q.id = v_quotation_id and q.company_id = v_company_id
    for update;

    if not found then
      raise exception 'Quotation not found' using errcode = 'P0002';
    end if;
    if v_existing_quote.rfq_id is distinct from v_rfq_id then
      raise exception 'Quotation cannot be moved to another RFQ' using errcode = '42501';
    end if;
    if v_existing_quote.vendor_id is distinct from v_vendor_id then
      raise exception 'Quotation Vendor identity is immutable; create a new quotation instead' using errcode = '42501';
    end if;
    if v_existing_quote.status <> 'SUBMITTED' then
      raise exception 'Only SUBMITTED quotations may be edited' using errcode = '42501';
    end if;

    update public.supplier_quotations
    set quotation_number = v_quotation_number,
        quotation_date = v_quotation_date,
        valid_until = v_valid_until,
        currency = v_currency,
        payment_terms = v_payment_terms,
        delivery_terms = v_delivery_terms,
        lead_time_days = v_lead_time_days,
        notes = v_notes,
        updated_at = now()
    where id = v_quotation_id and company_id = v_company_id;
  else
    insert into public.supplier_quotations (
      company_id, rfq_id, vendor_id, quotation_number, quotation_date,
      valid_until, currency, payment_terms, delivery_terms, lead_time_days,
      notes, total_amount, status, created_by_user_id
    ) values (
      v_company_id, v_rfq_id, v_vendor_id, v_quotation_number, v_quotation_date,
      v_valid_until, v_currency, v_payment_terms, v_delivery_terms, v_lead_time_days,
      v_notes, 0, 'SUBMITTED', v_user_id
    ) returning id into v_quotation_id;
  end if;

  delete from public.supplier_quotation_lines
  where quotation_id = v_quotation_id and company_id = v_company_id;

  for v_line in select * from jsonb_to_recordset(coalesce(p_lines, '[]'::jsonb)) as x(
    rfqLineId text,
    description text,
    quantity numeric,
    unit text,
    unitPrice numeric,
    leadTimeDays integer,
    isNoBid boolean,
    notes text
  ) loop
    if length(btrim(coalesce(v_line.description, ''))) < 1 then
      raise exception 'Quotation line % description is required', v_line_idx using errcode = '22023';
    end if;

    v_rfq_line_id := nullif(btrim(coalesce(v_line.rfqLineId, '')), '')::uuid;
    if v_rfq_line_id is not null and not exists (
      select 1 from public.rfq_lines l
      where l.id = v_rfq_line_id and l.rfq_id = v_rfq_id and l.company_id = v_company_id
    ) then
      raise exception 'Quotation line % maps to an RFQ line outside this RFQ', v_line_idx using errcode = '42501';
    end if;

    if not coalesce(v_line.isNoBid, false) and coalesce(v_line.quantity, 0) <= 0 then
      raise exception 'Quotation line % quantity must be positive unless marked no-bid', v_line_idx using errcode = '22023';
    end if;
    if coalesce(v_line.unitPrice, 0) < 0 then
      raise exception 'Quotation line % unit price cannot be negative', v_line_idx using errcode = '22023';
    end if;

    if coalesce(v_line.isNoBid, false) then
      v_line_amount := 0;
    else
      v_line_amount := round((v_line.quantity * coalesce(v_line.unitPrice, 0))::numeric, 2);
      v_total_amount := v_total_amount + v_line_amount;
    end if;

    insert into public.supplier_quotation_lines (
      company_id, quotation_id, rfq_line_id, line_number, description,
      quantity, unit, unit_price, amount, lead_time_days, is_no_bid, notes
    ) values (
      v_company_id, v_quotation_id, v_rfq_line_id, v_line_idx,
      btrim(v_line.description), coalesce(v_line.quantity, 0),
      coalesce(nullif(btrim(v_line.unit), ''), 'pcs'), coalesce(v_line.unitPrice, 0),
      v_line_amount, v_line.leadTimeDays, coalesce(v_line.isNoBid, false), v_line.notes
    );
    v_line_idx := v_line_idx + 1;
  end loop;

  update public.supplier_quotations
  set total_amount = v_total_amount,
      updated_at = now()
  where id = v_quotation_id and company_id = v_company_id;

  select to_jsonb(q.*) into v_result_quote
  from public.supplier_quotations q
  where q.id = v_quotation_id and q.company_id = v_company_id;

  select coalesce(jsonb_agg(to_jsonb(l.*) order by l.line_number asc), '[]'::jsonb)
    into v_result_lines
  from public.supplier_quotation_lines l
  where l.quotation_id = v_quotation_id and l.company_id = v_company_id;

  return jsonb_build_object('quotation', v_result_quote, 'lines', v_result_lines);
end;
$$;

create or replace function public.select_supplier_quotation(
  p_quotation_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_quote record;
  v_rfq record;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if length(v_reason) < 3 then
    raise exception 'Selection reason is required (at least 3 characters)' using errcode = '22023';
  end if;

  select q.* into v_quote
  from public.supplier_quotations q
  where q.id = p_quotation_id;
  if not found then
    raise exception 'Quotation not found' using errcode = 'P0002';
  end if;
  if not public.has_company_permission(v_quote.company_id, 'procurement.manage') then
    raise exception 'Insufficient permissions to select preferred quotation' using errcode = '42501';
  end if;

  select r.* into v_rfq
  from public.rfqs r
  where r.id = v_quote.rfq_id and r.company_id = v_quote.company_id
  for update;
  if not found then
    raise exception 'Associated RFQ not found' using errcode = 'P0002';
  end if;

  select q.* into v_quote
  from public.supplier_quotations q
  where q.id = p_quotation_id and q.rfq_id = v_rfq.id and q.company_id = v_rfq.company_id
  for update;
  if not found then
    raise exception 'Quotation no longer belongs to the RFQ' using errcode = '42501';
  end if;

  if v_rfq.status <> 'ISSUED' then
    raise exception 'Quotation selection is only allowed while the RFQ is ISSUED' using errcode = '42501';
  end if;
  if v_quote.status <> 'SUBMITTED' then
    raise exception 'Only SUBMITTED quotations may be selected' using errcode = '42501';
  end if;

  update public.supplier_quotations
  set status = 'SUBMITTED',
      deselected_at = now(),
      deselected_by_user_id = v_user_id,
      deselection_reason = 'Replaced by selection of quotation ' || v_quote.quotation_number,
      updated_at = now()
  where rfq_id = v_rfq.id
    and company_id = v_rfq.company_id
    and status = 'SELECTED'
    and id <> p_quotation_id;

  update public.supplier_quotations
  set status = 'SELECTED',
      selected_at = now(),
      selected_by_user_id = v_user_id,
      selection_reason = v_reason,
      updated_at = now()
  where id = p_quotation_id and company_id = v_rfq.company_id;

  update public.rfqs
  set selected_quotation_id = p_quotation_id,
      updated_by_user_id = v_user_id,
      updated_at = now()
  where id = v_rfq.id and company_id = v_rfq.company_id;

  return (select to_jsonb(q.*) from public.supplier_quotations q where q.id = p_quotation_id);
end;
$$;

create or replace function public.revert_supplier_quotation_selection(
  p_rfq_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_rfq record;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if length(v_reason) < 3 then
    raise exception 'Deselection reason is required (at least 3 characters)' using errcode = '22023';
  end if;

  select r.* into v_rfq
  from public.rfqs r
  where r.id = p_rfq_id
  for update;
  if not found then
    raise exception 'RFQ not found' using errcode = 'P0002';
  end if;
  if not public.has_company_permission(v_rfq.company_id, 'procurement.manage') then
    raise exception 'Insufficient permissions to revert selection' using errcode = '42501';
  end if;
  if v_rfq.status <> 'ISSUED' then
    raise exception 'Quotation selection may only be reverted while the RFQ is ISSUED' using errcode = '42501';
  end if;
  if v_rfq.selected_quotation_id is null then
    raise exception 'RFQ has no selected quotation to revert' using errcode = '22023';
  end if;

  update public.supplier_quotations
  set status = 'SUBMITTED',
      deselected_at = now(),
      deselected_by_user_id = v_user_id,
      deselection_reason = v_reason,
      updated_at = now()
  where id = v_rfq.selected_quotation_id
    and rfq_id = v_rfq.id
    and company_id = v_rfq.company_id
    and status = 'SELECTED';

  if not found then
    raise exception 'RFQ selected quotation pointer is inconsistent' using errcode = '23514';
  end if;

  update public.rfqs
  set selected_quotation_id = null,
      updated_by_user_id = v_user_id,
      updated_at = now()
  where id = v_rfq.id and company_id = v_rfq.company_id;

  return (select to_jsonb(r.*) from public.rfqs r where r.id = v_rfq.id);
end;
$$;

create or replace function public.convert_quotation_to_draft_po(
  p_quotation_id uuid,
  p_po_number text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_quote record;
  v_rfq record;
  v_po_id uuid;
  v_po_number text := upper(btrim(coalesce(p_po_number, '')));
  v_line record;
  v_line_idx integer := 1;
  v_purchasable_count integer;
  v_result_po jsonb;
  v_result_lines jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select q.* into v_quote
  from public.supplier_quotations q
  where q.id = p_quotation_id;
  if not found then
    raise exception 'Quotation not found' using errcode = 'P0002';
  end if;
  if not public.has_company_permission(v_quote.company_id, 'procurement.manage') then
    raise exception 'Insufficient permissions to generate purchase order' using errcode = '42501';
  end if;

  select r.* into v_rfq
  from public.rfqs r
  where r.id = v_quote.rfq_id and r.company_id = v_quote.company_id
  for update;
  if not found then
    raise exception 'Associated RFQ not found' using errcode = 'P0002';
  end if;

  select q.* into v_quote
  from public.supplier_quotations q
  where q.id = p_quotation_id and q.rfq_id = v_rfq.id and q.company_id = v_rfq.company_id
  for update;
  if not found then
    raise exception 'Quotation no longer belongs to the RFQ' using errcode = '42501';
  end if;

  if v_rfq.status not in ('ISSUED', 'CLOSED') then
    raise exception 'Selected quotation can only be converted from an issued or closed RFQ' using errcode = '42501';
  end if;
  if v_quote.status <> 'SELECTED' or v_rfq.selected_quotation_id is distinct from v_quote.id then
    raise exception 'Only the RFQ selected quotation may be converted to a Purchase Order' using errcode = '42501';
  end if;
  if v_rfq.project_id is null then
    raise exception 'RFQ must be associated with a Project before converting to Purchase Order' using errcode = '22023';
  end if;
  if length(v_po_number) < 1 or length(v_po_number) > 60 then
    raise exception 'Valid PO number is required (1-60 characters)' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.purchase_orders po
    where po.supplier_quotation_id = v_quote.id and po.status <> 'CANCELLED'
  ) then
    raise exception 'This selected quotation already has a non-cancelled Purchase Order' using errcode = '23505';
  end if;

  select count(*) into v_purchasable_count
  from public.supplier_quotation_lines ql
  where ql.quotation_id = v_quote.id
    and ql.company_id = v_quote.company_id
    and not ql.is_no_bid
    and ql.quantity > 0;

  if v_purchasable_count < 1 then
    raise exception 'Selected quotation has no purchasable lines' using errcode = '23514';
  end if;

  insert into public.purchase_orders (
    company_id, po_number, vendor_id, project_id, currency,
    status, description, notes, rfq_id, supplier_quotation_id,
    created_by_user_id, updated_by_user_id
  ) values (
    v_quote.company_id, v_po_number, v_quote.vendor_id, v_rfq.project_id, v_quote.currency,
    'DRAFT',
    'Generated from RFQ ' || v_rfq.rfq_number || ' / Quotation ' || v_quote.quotation_number,
    coalesce(nullif(btrim(p_notes), ''), v_quote.notes),
    v_rfq.id, v_quote.id,
    v_user_id, v_user_id
  ) returning id into v_po_id;

  for v_line in
    select ql.*, rl.project_cost_code_id as rfq_cost_code_id
    from public.supplier_quotation_lines ql
    left join public.rfq_lines rl
      on rl.id = ql.rfq_line_id
     and rl.rfq_id = v_rfq.id
     and rl.company_id = v_quote.company_id
    where ql.quotation_id = v_quote.id
      and ql.company_id = v_quote.company_id
      and not ql.is_no_bid
      and ql.quantity > 0
    order by ql.line_number asc
  loop
    insert into public.purchase_order_lines (
      company_id, purchase_order_id, line_number, description,
      quantity, unit, unit_price, amount, project_cost_code_id
    ) values (
      v_quote.company_id, v_po_id, v_line_idx, v_line.description,
      v_line.quantity, v_line.unit, v_line.unit_price, v_line.amount,
      v_line.rfq_cost_code_id
    );
    v_line_idx := v_line_idx + 1;
  end loop;

  select to_jsonb(po.*) into v_result_po
  from public.purchase_orders po
  where po.id = v_po_id and po.company_id = v_quote.company_id;

  select coalesce(jsonb_agg(to_jsonb(pol.*) order by pol.line_number asc), '[]'::jsonb)
    into v_result_lines
  from public.purchase_order_lines pol
  where pol.purchase_order_id = v_po_id and pol.company_id = v_quote.company_id;

  return jsonb_build_object('purchaseOrder', v_result_po, 'lines', v_result_lines);
end;
$$;

-- Guard RPC execution explicitly. PostgreSQL grants EXECUTE to PUBLIC by default.
revoke all on function public.save_rfq(jsonb, jsonb, uuid[]) from public, anon;
revoke all on function public.transition_rfq_status(uuid, text, text) from public, anon;
revoke all on function public.delete_draft_rfq(uuid) from public, anon;
revoke all on function public.save_supplier_quotation(jsonb, jsonb) from public, anon;
revoke all on function public.select_supplier_quotation(uuid, text) from public, anon;
revoke all on function public.revert_supplier_quotation_selection(uuid, text) from public, anon;
revoke all on function public.convert_quotation_to_draft_po(uuid, text, text) from public, anon;

grant execute on function public.save_rfq(jsonb, jsonb, uuid[]) to authenticated;
grant execute on function public.transition_rfq_status(uuid, text, text) to authenticated;
grant execute on function public.delete_draft_rfq(uuid) to authenticated;
grant execute on function public.save_supplier_quotation(jsonb, jsonb) to authenticated;
grant execute on function public.select_supplier_quotation(uuid, text) to authenticated;
grant execute on function public.revert_supplier_quotation_selection(uuid, text) to authenticated;
grant execute on function public.convert_quotation_to_draft_po(uuid, text, text) to authenticated;
