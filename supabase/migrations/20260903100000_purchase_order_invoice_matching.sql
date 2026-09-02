-- ============================================================================
-- Migration: 20260903100000_purchase_order_invoice_matching.sql
-- Description: P2A-3 Supplier Invoice <-> Purchase Order Matching
-- ============================================================================

-- Matching connects operational supplier invoices to purchase orders.
-- A match is an operational association: it does NOT verify an invoice,
-- does NOT alter invoice payment status, does NOT create Expenses, does NOT
-- modify project budget allocations, does NOT alter Actual Cost or Committed Cost,
-- and does NOT consume delivery receipts.

-- 1. Match header and match lines tables
create table if not exists public.purchase_order_invoice_matches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  match_source text not null default 'MANUAL' check (match_source in ('MANUAL', 'PO_NUMBER_EXACT', 'SUGGESTED_CONFIRMED')),
  status text not null default 'CONFIRMED' check (status in ('CONFIRMED', 'UNMATCHED')),
  confirmed_by_user_id uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz not null default now(),
  unmatched_by_user_id uuid references auth.users(id) on delete set null,
  unmatched_at timestamptz,
  unmatch_reason text check (unmatch_reason is null or length(btrim(unmatch_reason)) between 3 and 500),
  notes text check (notes is null or length(btrim(notes)) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_order_invoice_matches_company_id_id_key unique (company_id, id)
);

-- An invoice can have at most ONE active (CONFIRMED) match at any given time.
create unique index if not exists purchase_order_invoice_matches_active_invoice_unique
  on public.purchase_order_invoice_matches (company_id, invoice_id)
  where status = 'CONFIRMED';

create index if not exists purchase_order_invoice_matches_company_inv_idx
  on public.purchase_order_invoice_matches (company_id, invoice_id);
create index if not exists purchase_order_invoice_matches_company_po_status_idx
  on public.purchase_order_invoice_matches (company_id, purchase_order_id, status);
create index if not exists purchase_order_invoice_matches_company_status_idx
  on public.purchase_order_invoice_matches (company_id, status);

create table if not exists public.purchase_order_invoice_match_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  match_id uuid not null references public.purchase_order_invoice_matches(id) on delete cascade,
  purchase_order_line_id uuid not null references public.purchase_order_lines(id) on delete restrict,
  invoice_line_id text not null check (length(btrim(invoice_line_id)) >= 1),
  line_number integer not null default 1 check (line_number >= 1),
  matched_quantity numeric(14,4) check (matched_quantity is null or matched_quantity >= 0),
  matched_amount numeric(18,2) check (matched_amount is null or matched_amount >= 0),
  notes text check (notes is null or length(btrim(notes)) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_order_invoice_match_lines_company_match_inv_line_key unique (company_id, match_id, invoice_line_id)
);

create index if not exists purchase_order_invoice_match_lines_company_match_idx
  on public.purchase_order_invoice_match_lines (company_id, match_id, line_number asc);
create index if not exists purchase_order_invoice_match_lines_company_po_line_idx
  on public.purchase_order_invoice_match_lines (company_id, purchase_order_line_id);

-- 2. Tenant policy catalog & RLS
insert into private.company_tenant_policy_catalog (table_name, read_permission, write_permission, allow_insert, allow_update, allow_delete)
values
  ('purchase_order_invoice_matches', 'procurement.read', 'procurement.manage', false, false, false),
  ('purchase_order_invoice_match_lines', 'procurement.read', 'procurement.manage', false, false, false)
on conflict (table_name) do update set
  read_permission = excluded.read_permission,
  write_permission = excluded.write_permission,
  allow_insert = excluded.allow_insert,
  allow_update = excluded.allow_update,
  allow_delete = excluded.allow_delete;

alter table public.purchase_order_invoice_matches enable row level security;
alter table public.purchase_order_invoice_match_lines enable row level security;

drop policy if exists purchase_order_invoice_matches_company_select on public.purchase_order_invoice_matches;
create policy purchase_order_invoice_matches_company_select on public.purchase_order_invoice_matches
  for select to authenticated
  using (
    (select public.has_company_permission(company_id, 'invoices.read'))
    and (select public.has_company_permission(company_id, 'procurement.read'))
  );

drop policy if exists purchase_order_invoice_match_lines_company_select on public.purchase_order_invoice_match_lines;
create policy purchase_order_invoice_match_lines_company_select on public.purchase_order_invoice_match_lines
  for select to authenticated
  using (
    (select public.has_company_permission(company_id, 'invoices.read'))
    and (select public.has_company_permission(company_id, 'procurement.read'))
  );

-- Direct client writes are rejected; mutations occur strictly via guarded RPCs.
drop policy if exists purchase_order_invoice_matches_reject_insert on public.purchase_order_invoice_matches;
create policy purchase_order_invoice_matches_reject_insert on public.purchase_order_invoice_matches
  for insert to authenticated with check (false);

drop policy if exists purchase_order_invoice_matches_reject_update on public.purchase_order_invoice_matches;
create policy purchase_order_invoice_matches_reject_update on public.purchase_order_invoice_matches
  for update to authenticated using (false);

drop policy if exists purchase_order_invoice_matches_reject_delete on public.purchase_order_invoice_matches;
create policy purchase_order_invoice_matches_reject_delete on public.purchase_order_invoice_matches
  for delete to authenticated using (false);

drop policy if exists purchase_order_invoice_match_lines_reject_insert on public.purchase_order_invoice_match_lines;
create policy purchase_order_invoice_match_lines_reject_insert on public.purchase_order_invoice_match_lines
  for insert to authenticated with check (false);

drop policy if exists purchase_order_invoice_match_lines_reject_update on public.purchase_order_invoice_match_lines;
create policy purchase_order_invoice_match_lines_reject_update on public.purchase_order_invoice_match_lines
  for update to authenticated using (false);

drop policy if exists purchase_order_invoice_match_lines_reject_delete on public.purchase_order_invoice_match_lines;
create policy purchase_order_invoice_match_lines_reject_delete on public.purchase_order_invoice_match_lines
  for delete to authenticated using (false);

revoke insert, update, delete on table public.purchase_order_invoice_matches from public, anon, authenticated;
revoke insert, update, delete on table public.purchase_order_invoice_match_lines from public, anon, authenticated;
grant select on table public.purchase_order_invoice_matches to authenticated;
grant select on table public.purchase_order_invoice_match_lines to authenticated;

-- 3. Guarded RPC: Confirm Purchase Order Invoice Match
create or replace function public.confirm_purchase_order_invoice_match(
  p_invoice_id uuid,
  p_purchase_order_id uuid,
  p_match_source text default 'MANUAL',
  p_notes text default null,
  p_lines jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_inv_company_id uuid;
  v_inv_currency text;
  v_inv_grand_total numeric(18,2);
  v_inv_vendor_id uuid;
  v_inv_lifecycle text;
  v_inv_current_data jsonb;

  v_po_company_id uuid;
  v_po_currency text;
  v_po_vendor_id uuid;
  v_po_status text;

  v_company_id uuid;
  v_match_id uuid;
  v_match_row public.purchase_order_invoice_matches%rowtype;
  v_res_lines jsonb := '[]'::jsonb;

  v_line_elem jsonb;
  v_line_idx integer := 0;
  v_po_line_id uuid;
  v_inv_line_id text;
  v_matched_qty numeric(14,4);
  v_matched_amt numeric(18,2);
  v_line_notes text;
  v_total_matched_amt numeric(18,2) := 0;
  v_seen_inv_lines text[] := '{}'::text[];
begin
  -- 1. Authentication validation
  if v_user_id is null then
    raise exception 'Authentication is required to confirm purchase order matches' using errcode = '42501';
  end if;

  -- 2. Validate match source
  if p_match_source not in ('MANUAL', 'PO_NUMBER_EXACT', 'SUGGESTED_CONFIRMED') then
    raise exception 'Invalid match source: %', p_match_source using errcode = '22023';
  end if;

  -- 3. Fetch and validate invoice
  select
    i.company_id,
    i.currency,
    i.grand_total,
    i.vendor_id,
    i.lifecycle_status,
    i.current_data
  into
    v_inv_company_id,
    v_inv_currency,
    v_inv_grand_total,
    v_inv_vendor_id,
    v_inv_lifecycle,
    v_inv_current_data
  from public.invoices i
  where i.id = p_invoice_id
  for share;

  if v_inv_company_id is null then
    raise exception 'Invoice not found' using errcode = '23503';
  end if;

  if v_inv_lifecycle = 'VOID' then
    raise exception 'Cannot match a void invoice' using errcode = '22023';
  end if;

  v_company_id := v_inv_company_id;

  -- 4. Permission validation
  if not (select public.has_company_permission(v_company_id, 'invoices.manage'))
     or not (select public.has_company_permission(v_company_id, 'procurement.manage')) then
    raise exception 'Unauthorized to confirm purchase order match' using errcode = '42501';
  end if;

  -- 5. Fetch and validate purchase order
  select
    po.company_id,
    po.currency,
    po.vendor_id,
    po.status
  into
    v_po_company_id,
    v_po_currency,
    v_po_vendor_id,
    v_po_status
  from public.purchase_orders po
  where po.id = p_purchase_order_id
  for share;

  if v_po_company_id is null then
    raise exception 'Purchase order not found' using errcode = '23503';
  end if;

  if v_po_company_id is distinct from v_company_id then
    raise exception 'Cross-company purchase order match is not permitted' using errcode = '42501';
  end if;

  if v_po_status not in ('ISSUED', 'CLOSED') then
    raise exception 'Purchase order must be ISSUED or CLOSED to match an invoice (current status: %)', v_po_status using errcode = '22023';
  end if;

  -- 6. Currency validation
  if upper(btrim(coalesce(v_inv_currency, ''))) <> upper(btrim(coalesce(v_po_currency, ''))) then
    raise exception 'Currency mismatch: invoice currency (%) does not match purchase order currency (%)', v_inv_currency, v_po_currency using errcode = '22023';
  end if;

  -- 7. Vendor validation
  if v_inv_vendor_id is null then
    raise exception 'Invoice vendor must be resolved before matching' using errcode = '22023';
  end if;

  if v_inv_vendor_id is distinct from v_po_vendor_id then
    raise exception 'Vendor mismatch: invoice vendor does not match purchase order vendor' using errcode = '22023';
  end if;

  -- 8. Existing active match validation
  if exists (
    select 1
    from public.purchase_order_invoice_matches pom
    where pom.company_id = v_company_id
      and pom.invoice_id = p_invoice_id
      and pom.status = 'CONFIRMED'
  ) then
    raise exception 'An active confirmed match already exists for this invoice' using errcode = '23505';
  end if;

  -- 9. Line-level validation
  if p_lines is not null and jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Lines must be a JSON array' using errcode = '22023';
  end if;

  if p_lines is not null and jsonb_array_length(p_lines) > 0 then
    for v_line_elem in select * from jsonb_array_elements(p_lines) loop
      v_line_idx := v_line_idx + 1;
      v_po_line_id := (v_line_elem->>'purchaseOrderLineId')::uuid;
      v_inv_line_id := btrim(coalesce(v_line_elem->>'invoiceLineId', ''));
      v_matched_qty := nullif(v_line_elem->>'matchedQuantity', '')::numeric;
      v_matched_amt := nullif(v_line_elem->>'matchedAmount', '')::numeric;
      v_line_notes := nullif(btrim(v_line_elem->>'notes'), '');

      if length(v_inv_line_id) < 1 then
        raise exception 'Invoice line ID cannot be empty (line %)', v_line_idx using errcode = '22023';
      end if;

      if v_po_line_id is null then
        raise exception 'Purchase order line ID is required (line %)', v_line_idx using errcode = '22023';
      end if;

      if v_matched_qty is not null and v_matched_qty < 0 then
        raise exception 'Matched quantity cannot be negative (line %)', v_line_idx using errcode = '22023';
      end if;

      if v_matched_amt is not null and v_matched_amt < 0 then
        raise exception 'Matched amount cannot be negative (line %)', v_line_idx using errcode = '22023';
      end if;

      -- Check duplicate invoice line in input
      if v_inv_line_id = any(v_seen_inv_lines) then
        raise exception 'Duplicate invoice line ID % in match lines', v_inv_line_id using errcode = '22023';
      end if;
      v_seen_inv_lines := array_append(v_seen_inv_lines, v_inv_line_id);

      -- Check PO line exists on this PO
      if not exists (
        select 1
        from public.purchase_order_lines pol
        where pol.id = v_po_line_id
          and pol.purchase_order_id = p_purchase_order_id
          and pol.company_id = v_company_id
      ) then
        raise exception 'Purchase order line % does not belong to purchase order %', v_po_line_id, p_purchase_order_id using errcode = '22023';
      end if;

      -- Check invoice line ID exists in invoice items
      if not exists (
        select 1
        from jsonb_array_elements(coalesce(v_inv_current_data->'items', '[]'::jsonb)) as itm
        where itm->>'id' = v_inv_line_id
      ) then
        raise exception 'Invoice line ID % does not exist in invoice items', v_inv_line_id using errcode = '22023';
      end if;

      if v_matched_amt is not null then
        v_total_matched_amt := v_total_matched_amt + v_matched_amt;
      end if;
    end loop;

    -- Validates matched total <= invoice grand total
    if v_total_matched_amt > v_inv_grand_total then
      raise exception 'Matched lines total amount (%) exceeds invoice grand total (%)', v_total_matched_amt, v_inv_grand_total using errcode = '22023';
    end if;
  end if;

  -- 10. Atomic insert of header
  insert into public.purchase_order_invoice_matches (
    company_id,
    invoice_id,
    purchase_order_id,
    match_source,
    status,
    confirmed_by_user_id,
    confirmed_at,
    notes
  ) values (
    v_company_id,
    p_invoice_id,
    p_purchase_order_id,
    p_match_source,
    'CONFIRMED',
    v_user_id,
    now(),
    nullif(btrim(p_notes), '')
  )
  returning * into v_match_row;

  v_match_id := v_match_row.id;

  -- 11. Atomic insert of lines
  if p_lines is not null and jsonb_array_length(p_lines) > 0 then
    v_line_idx := 0;
    for v_line_elem in select * from jsonb_array_elements(p_lines) loop
      v_line_idx := v_line_idx + 1;
      v_po_line_id := (v_line_elem->>'purchaseOrderLineId')::uuid;
      v_inv_line_id := btrim(coalesce(v_line_elem->>'invoiceLineId', ''));
      v_matched_qty := nullif(v_line_elem->>'matchedQuantity', '')::numeric;
      v_matched_amt := nullif(v_line_elem->>'matchedAmount', '')::numeric;
      v_line_notes := nullif(btrim(v_line_elem->>'notes'), '');

      insert into public.purchase_order_invoice_match_lines (
        company_id,
        match_id,
        purchase_order_line_id,
        invoice_line_id,
        line_number,
        matched_quantity,
        matched_amount,
        notes
      ) values (
        v_company_id,
        v_match_id,
        v_po_line_id,
        v_inv_line_id,
        v_line_idx,
        v_matched_qty,
        v_matched_amt,
        v_line_notes
      );
    end loop;
  end if;

  -- 12. Build result
  select coalesce(jsonb_agg(to_jsonb(poml.*) order by poml.line_number asc), '[]'::jsonb)
    into v_res_lines
  from public.purchase_order_invoice_match_lines poml
  where poml.match_id = v_match_id;

  return jsonb_build_object(
    'match', to_jsonb(v_match_row),
    'lines', v_res_lines
  );
end;
$$;

-- 4. Guarded RPC: Unmatch Purchase Order Invoice
create or replace function public.unmatch_purchase_order_invoice(
  p_match_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_match_row public.purchase_order_invoice_matches%rowtype;
  v_updated_match_row public.purchase_order_invoice_matches%rowtype;
  v_res_lines jsonb := '[]'::jsonb;
begin
  -- 1. Authentication validation
  if v_user_id is null then
    raise exception 'Authentication is required to unmatch purchase orders' using errcode = '42501';
  end if;

  -- 2. Reason length validation (minimum 3 characters)
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Unmatch reason must contain at least 3 characters' using errcode = '23514';
  end if;

  -- 3. Fetch match record for update
  select *
  into v_match_row
  from public.purchase_order_invoice_matches
  where id = p_match_id
  for update;

  if v_match_row.id is null then
    raise exception 'Purchase order match not found' using errcode = '23503';
  end if;

  if v_match_row.status <> 'CONFIRMED' then
    raise exception 'Match is already %', v_match_row.status using errcode = '22023';
  end if;

  -- 4. Permission validation
  if not (select public.has_company_permission(v_match_row.company_id, 'invoices.manage'))
     or not (select public.has_company_permission(v_match_row.company_id, 'procurement.manage')) then
    raise exception 'Unauthorized to unmatch purchase order' using errcode = '42501';
  end if;

  -- 5. Update match status to UNMATCHED with reason and audit trail
  update public.purchase_order_invoice_matches
  set
    status = 'UNMATCHED',
    unmatched_by_user_id = v_user_id,
    unmatched_at = now(),
    unmatch_reason = btrim(p_reason),
    updated_at = now()
  where id = p_match_id
  returning * into v_updated_match_row;

  -- 6. Collect preserved match lines
  select coalesce(jsonb_agg(to_jsonb(poml.*) order by poml.line_number asc), '[]'::jsonb)
    into v_res_lines
  from public.purchase_order_invoice_match_lines poml
  where poml.match_id = p_match_id;

  return jsonb_build_object(
    'match', to_jsonb(v_updated_match_row),
    'lines', v_res_lines
  );
end;
$$;

grant execute on function public.confirm_purchase_order_invoice_match(uuid, uuid, text, text, jsonb) to authenticated;
grant execute on function public.unmatch_purchase_order_invoice(uuid, text) to authenticated;
