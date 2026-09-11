-- Forward correction for the quotation line payload contract.
--
-- The application sends camelCase JSON keys.  Unquoted identifiers in
-- jsonb_to_recordset are folded to lowercase by PostgreSQL, so the previous
-- function silently read unitPrice/leadTimeDays/isNoBid as NULL and persisted
-- zero prices.  Keep the JSON contract and quote the recordset field names.

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
    "rfqLineId" text,
    description text,
    quantity numeric,
    unit text,
    "unitPrice" numeric,
    "leadTimeDays" integer,
    "isNoBid" boolean,
    notes text
  ) loop
    if length(btrim(coalesce(v_line.description, ''))) < 1 then
      raise exception 'Quotation line % description is required', v_line_idx using errcode = '22023';
    end if;

    v_rfq_line_id := nullif(btrim(coalesce(v_line."rfqLineId", '')), '')::uuid;
    if v_rfq_line_id is not null and not exists (
      select 1 from public.rfq_lines l
      where l.id = v_rfq_line_id and l.rfq_id = v_rfq_id and l.company_id = v_company_id
    ) then
      raise exception 'Quotation line % maps to an RFQ line outside this RFQ', v_line_idx using errcode = '42501';
    end if;

    if not coalesce(v_line."isNoBid", false) and coalesce(v_line.quantity, 0) <= 0 then
      raise exception 'Quotation line % quantity must be positive unless marked no-bid', v_line_idx using errcode = '22023';
    end if;
    if coalesce(v_line."unitPrice", 0) < 0 then
      raise exception 'Quotation line % unit price cannot be negative', v_line_idx using errcode = '22023';
    end if;

    if coalesce(v_line."isNoBid", false) then
      v_line_amount := 0;
    else
      v_line_amount := round((v_line.quantity * coalesce(v_line."unitPrice", 0))::numeric, 2);
      v_total_amount := v_total_amount + v_line_amount;
    end if;

    insert into public.supplier_quotation_lines (
      company_id, quotation_id, rfq_line_id, line_number, description,
      quantity, unit, unit_price, amount, lead_time_days, is_no_bid, notes
    ) values (
      v_company_id, v_quotation_id, v_rfq_line_id, v_line_idx,
      btrim(v_line.description), coalesce(v_line.quantity, 0),
      coalesce(nullif(btrim(v_line.unit), ''), 'pcs'), coalesce(v_line."unitPrice", 0),
      v_line_amount, v_line."leadTimeDays", coalesce(v_line."isNoBid", false), v_line.notes
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
