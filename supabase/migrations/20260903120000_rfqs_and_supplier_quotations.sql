-- ============================================================================
-- Migration: 20260903120000_rfqs_and_supplier_quotations.sql
-- Description: P2A-4 Request for Quotations (RFQs) & Supplier Quotation Comparison
-- ============================================================================

-- RFQs and supplier quotations are PRE-COMMITMENT procurement records.
-- They do NOT create or alter Actual Cost, Committed Cost, supplier invoices,
-- expenses, project accounting postings, receipt records, or payment obligations.
-- Only the authoritative Purchase Order lifecycle (APPROVED/ISSUED) generates Committed Cost.

-- 1. RFQ Header Table
create table if not exists public.rfqs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  rfq_number text not null check (length(btrim(rfq_number)) between 1 and 60 and rfq_number = upper(btrim(rfq_number))),
  title text not null check (length(btrim(title)) between 1 and 200),
  description text,
  project_id uuid references public.projects(id) on delete restrict,
  currency text not null default 'PHP' check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'ISSUED', 'CLOSED', 'CANCELLED')),
  issue_date date,
  due_date date,
  notes text check (notes is null or length(btrim(notes)) <= 2000),
  cancellation_reason text check (cancellation_reason is null or length(btrim(cancellation_reason)) <= 500),
  selected_quotation_id uuid, -- foreign key added after supplier_quotations table creation
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  issued_by_user_id uuid references auth.users(id) on delete set null,
  closed_by_user_id uuid references auth.users(id) on delete set null,
  cancelled_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  issued_at timestamptz,
  closed_at timestamptz,
  cancelled_at timestamptz,
  constraint rfqs_company_id_id_key unique (company_id, id),
  constraint rfqs_company_project_id_key unique (company_id, project_id, id)
);

create unique index if not exists rfqs_company_rfq_number_unique
  on public.rfqs (company_id, lower(rfq_number));
create index if not exists rfqs_company_project_status_idx
  on public.rfqs (company_id, project_id, status, updated_at desc);
create index if not exists rfqs_company_status_idx
  on public.rfqs (company_id, status, updated_at desc);

-- 2. RFQ Line Items Table
create table if not exists public.rfq_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  line_number integer not null default 1 check (line_number >= 1),
  description text not null check (length(btrim(description)) between 1 and 500),
  quantity numeric(14,4) not null default 1 check (quantity > 0),
  unit text not null default 'pcs' check (length(btrim(unit)) between 1 and 50),
  project_cost_code_id uuid references public.project_cost_codes(id) on delete restrict,
  requested_delivery_date date,
  notes text check (notes is null or length(btrim(notes)) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rfq_lines_company_rfq_line_key unique (company_id, rfq_id, line_number)
);

create index if not exists rfq_lines_company_rfq_idx
  on public.rfq_lines (company_id, rfq_id, line_number asc);
create index if not exists rfq_lines_cost_code_idx
  on public.rfq_lines (company_id, project_cost_code_id)
  where project_cost_code_id is not null;

-- 3. RFQ Invited Vendors Table
create table if not exists public.rfq_invited_vendors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  rfq_id uuid not null references public.rfqs(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  invited_at timestamptz not null default now(),
  notes text check (notes is null or length(btrim(notes)) <= 500),
  created_at timestamptz not null default now(),
  constraint rfq_invited_vendors_unique unique (company_id, rfq_id, vendor_id)
);

create index if not exists rfq_invited_vendors_company_rfq_idx
  on public.rfq_invited_vendors (company_id, rfq_id);
create index if not exists rfq_invited_vendors_company_vendor_idx
  on public.rfq_invited_vendors (company_id, vendor_id);

-- 4. Supplier Quotations Header Table
create table if not exists public.supplier_quotations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  rfq_id uuid not null references public.rfqs(id) on delete restrict,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  quotation_number text not null check (length(btrim(quotation_number)) between 1 and 60),
  quotation_date date not null default current_date,
  valid_until date,
  currency text not null default 'PHP' check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  payment_terms text check (payment_terms is null or length(btrim(payment_terms)) <= 200),
  delivery_terms text check (delivery_terms is null or length(btrim(delivery_terms)) <= 200),
  lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
  notes text check (notes is null or length(btrim(notes)) <= 1000),
  total_amount numeric(18,2) not null default 0 check (total_amount >= 0),
  status text not null default 'SUBMITTED' check (status in ('SUBMITTED', 'SELECTED', 'REJECTED', 'CANCELLED')),
  selected_at timestamptz,
  selected_by_user_id uuid references auth.users(id) on delete set null,
  selection_reason text check (selection_reason is null or length(btrim(selection_reason)) <= 500),
  deselected_at timestamptz,
  deselected_by_user_id uuid references auth.users(id) on delete set null,
  deselection_reason text check (deselection_reason is null or length(btrim(deselection_reason)) <= 500),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_quotations_company_id_id_key unique (company_id, id),
  constraint supplier_quotations_rfq_vendor_num_unique unique (company_id, rfq_id, vendor_id, lower(quotation_number))
);

create index if not exists supplier_quotations_company_rfq_idx
  on public.supplier_quotations (company_id, rfq_id, status);
create index if not exists supplier_quotations_company_vendor_idx
  on public.supplier_quotations (company_id, vendor_id);

-- Link selected_quotation_id back to supplier_quotations
alter table public.rfqs
  drop constraint if exists rfqs_selected_quotation_fkey;
alter table public.rfqs
  add constraint rfqs_selected_quotation_fkey
  foreign key (selected_quotation_id)
  references public.supplier_quotations(id)
  on delete set null;

-- 5. Supplier Quotation Lines Table
create table if not exists public.supplier_quotation_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  quotation_id uuid not null references public.supplier_quotations(id) on delete cascade,
  rfq_line_id uuid references public.rfq_lines(id) on delete set null,
  line_number integer not null default 1 check (line_number >= 1),
  description text not null check (length(btrim(description)) between 1 and 500),
  quantity numeric(14,4) not null default 0 check (quantity >= 0),
  unit text not null default 'pcs' check (length(btrim(unit)) between 1 and 50),
  unit_price numeric(18,2) not null default 0 check (unit_price >= 0),
  amount numeric(18,2) not null default 0 check (amount >= 0),
  lead_time_days integer check (lead_time_days is null or lead_time_days >= 0),
  is_no_bid boolean not null default false,
  notes text check (notes is null or length(btrim(notes)) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint supplier_quotation_lines_company_quote_line_key unique (company_id, quotation_id, line_number)
);

create index if not exists supplier_quotation_lines_company_quote_idx
  on public.supplier_quotation_lines (company_id, quotation_id, line_number asc);
create index if not exists supplier_quotation_lines_company_rfq_line_idx
  on public.supplier_quotation_lines (company_id, rfq_line_id);

-- 6. Add provenance references to purchase_orders
alter table public.purchase_orders
  add column if not exists rfq_id uuid references public.rfqs(id) on delete set null,
  add column if not exists supplier_quotation_id uuid references public.supplier_quotations(id) on delete set null;

create index if not exists purchase_orders_company_rfq_idx
  on public.purchase_orders (company_id, rfq_id)
  where rfq_id is not null;
create index if not exists purchase_orders_company_quotation_idx
  on public.purchase_orders (company_id, supplier_quotation_id)
  where supplier_quotation_id is not null;

-- 7. Register with Company Tenant Policy Catalog
insert into private.company_tenant_policy_catalog (table_name, read_permission, write_permission, allow_insert, allow_update, allow_delete)
values
  ('rfqs', 'procurement.read', 'procurement.manage', false, false, false),
  ('rfq_lines', 'procurement.read', 'procurement.manage', false, false, false),
  ('rfq_invited_vendors', 'procurement.read', 'procurement.manage', false, false, false),
  ('supplier_quotations', 'procurement.read', 'procurement.manage', false, false, false),
  ('supplier_quotation_lines', 'procurement.read', 'procurement.manage', false, false, false)
on conflict (table_name) do update set
  read_permission = excluded.read_permission,
  write_permission = excluded.write_permission,
  allow_insert = excluded.allow_insert,
  allow_update = excluded.allow_update,
  allow_delete = excluded.allow_delete;

-- 8. Row Level Security
alter table public.rfqs enable row level security;
alter table public.rfq_lines enable row level security;
alter table public.rfq_invited_vendors enable row level security;
alter table public.supplier_quotations enable row level security;
alter table public.supplier_quotation_lines enable row level security;

-- Read policies: procurement.read required
drop policy if exists rfqs_company_select on public.rfqs;
create policy rfqs_company_select on public.rfqs
  for select to authenticated
  using (public.has_company_permission(company_id, 'procurement.read'));

drop policy if exists rfq_lines_company_select on public.rfq_lines;
create policy rfq_lines_company_select on public.rfq_lines
  for select to authenticated
  using (public.has_company_permission(company_id, 'procurement.read'));

drop policy if exists rfq_invited_vendors_company_select on public.rfq_invited_vendors;
create policy rfq_invited_vendors_company_select on public.rfq_invited_vendors
  for select to authenticated
  using (public.has_company_permission(company_id, 'procurement.read'));

drop policy if exists supplier_quotations_company_select on public.supplier_quotations;
create policy supplier_quotations_company_select on public.supplier_quotations
  for select to authenticated
  using (public.has_company_permission(company_id, 'procurement.read'));

drop policy if exists supplier_quotation_lines_company_select on public.supplier_quotation_lines;
create policy supplier_quotation_lines_company_select on public.supplier_quotation_lines
  for select to authenticated
  using (public.has_company_permission(company_id, 'procurement.read'));

-- Direct client writes are rejected; mutations occur strictly through guarded RPCs.
drop policy if exists rfqs_reject_insert on public.rfqs;
create policy rfqs_reject_insert on public.rfqs for insert to authenticated with check (false);
drop policy if exists rfqs_reject_update on public.rfqs;
create policy rfqs_reject_update on public.rfqs for update to authenticated using (false);
drop policy if exists rfqs_reject_delete on public.rfqs;
create policy rfqs_reject_delete on public.rfqs for delete to authenticated using (false);

drop policy if exists rfq_lines_reject_insert on public.rfq_lines;
create policy rfq_lines_reject_insert on public.rfq_lines for insert to authenticated with check (false);
drop policy if exists rfq_lines_reject_update on public.rfq_lines;
create policy rfq_lines_reject_update on public.rfq_lines for update to authenticated using (false);
drop policy if exists rfq_lines_reject_delete on public.rfq_lines;
create policy rfq_lines_reject_delete on public.rfq_lines for delete to authenticated using (false);

drop policy if exists rfq_invited_vendors_reject_insert on public.rfq_invited_vendors;
create policy rfq_invited_vendors_reject_insert on public.rfq_invited_vendors for insert to authenticated with check (false);
drop policy if exists rfq_invited_vendors_reject_update on public.rfq_invited_vendors;
create policy rfq_invited_vendors_reject_update on public.rfq_invited_vendors for update to authenticated using (false);
drop policy if exists rfq_invited_vendors_reject_delete on public.rfq_invited_vendors;
create policy rfq_invited_vendors_reject_delete on public.rfq_invited_vendors for delete to authenticated using (false);

drop policy if exists supplier_quotations_reject_insert on public.supplier_quotations;
create policy supplier_quotations_reject_insert on public.supplier_quotations for insert to authenticated with check (false);
drop policy if exists supplier_quotations_reject_update on public.supplier_quotations;
create policy supplier_quotations_reject_update on public.supplier_quotations for update to authenticated using (false);
drop policy if exists supplier_quotations_reject_delete on public.supplier_quotations;
create policy supplier_quotations_reject_delete on public.supplier_quotations for delete to authenticated using (false);

drop policy if exists supplier_quotation_lines_reject_insert on public.supplier_quotation_lines;
create policy supplier_quotation_lines_reject_insert on public.supplier_quotation_lines for insert to authenticated with check (false);
drop policy if exists supplier_quotation_lines_reject_update on public.supplier_quotation_lines;
create policy supplier_quotation_lines_reject_update on public.supplier_quotation_lines for update to authenticated using (false);
drop policy if exists supplier_quotation_lines_reject_delete on public.supplier_quotation_lines;
create policy supplier_quotation_lines_reject_delete on public.supplier_quotation_lines for delete to authenticated using (false);

-- 9. Guarded RPC: save_rfq
create or replace function public.save_rfq(
  p_rfq jsonb,
  p_lines jsonb,
  p_invited_vendor_ids uuid[] default null
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
    select status into v_existing_status from public.rfqs where id = v_rfq_id and company_id = v_company_id;
    if not found then
      raise exception 'RFQ not found' using errcode = 'P0002';
    end if;
    if v_existing_status <> 'DRAFT' then
      raise exception 'Only draft RFQs may be modified' using errcode = '22000';
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

  -- Re-populate line items
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

  -- Re-populate invited vendors if provided
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

  return jsonb_build_object(
    'rfq', v_result_rfq,
    'lines', v_result_lines
  );
end;
$$;

-- 10. Guarded RPC: transition_rfq_status
create or replace function public.transition_rfq_status(
  p_rfq_id uuid,
  p_target_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_rfq record;
  v_lines_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_rfq from public.rfqs where id = p_rfq_id;
  if not found then
    raise exception 'RFQ not found' using errcode = 'P0002';
  end if;

  if not public.has_company_permission(v_rfq.company_id, 'procurement.manage') then
    raise exception 'Insufficient permissions to transition RFQ status' using errcode = '42501';
  end if;

  if v_rfq.status in ('CLOSED', 'CANCELLED') then
    raise exception 'Closed or cancelled RFQs cannot undergo further transitions' using errcode = '22000';
  end if;

  if p_target_status = 'ISSUED' then
    if v_rfq.status <> 'DRAFT' then
      raise exception 'Only draft RFQs may be issued' using errcode = '22000';
    end if;
    select count(*) into v_lines_count from public.rfq_lines where rfq_id = p_rfq_id;
    if v_lines_count < 1 then
      raise exception 'Cannot issue an RFQ without line items' using errcode = '22000';
    end if;

    update public.rfqs set
      status = 'ISSUED',
      issued_by_user_id = v_user_id,
      issued_at = now(),
      issue_date = coalesce(issue_date, current_date),
      updated_by_user_id = v_user_id,
      updated_at = now()
    where id = p_rfq_id;

  elsif p_target_status = 'CLOSED' then
    if v_rfq.status <> 'ISSUED' then
      raise exception 'Only issued RFQs may be closed' using errcode = '22000';
    end if;

    update public.rfqs set
      status = 'CLOSED',
      closed_by_user_id = v_user_id,
      closed_at = now(),
      updated_by_user_id = v_user_id,
      updated_at = now()
    where id = p_rfq_id;

  elsif p_target_status = 'CANCELLED' then
    if length(btrim(coalesce(p_reason, ''))) < 3 then
      raise exception 'Cancellation reason is required (at least 3 characters)' using errcode = '22000';
    end if;

    update public.rfqs set
      status = 'CANCELLED',
      cancellation_reason = btrim(p_reason),
      cancelled_by_user_id = v_user_id,
      cancelled_at = now(),
      updated_by_user_id = v_user_id,
      updated_at = now()
    where id = p_rfq_id;

  else
    raise exception 'Invalid target status for RFQ: %', p_target_status using errcode = '22000';
  end if;

  return (select to_jsonb(r) from public.rfqs r where r.id = p_rfq_id);
end;
$$;

-- 11. Guarded RPC: delete_draft_rfq
create or replace function public.delete_draft_rfq(
  p_rfq_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_rfq record;
  v_quotes_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_rfq from public.rfqs where id = p_rfq_id;
  if not found then
    return;
  end if;

  if not public.has_company_permission(v_rfq.company_id, 'procurement.manage') then
    raise exception 'Insufficient permissions to delete draft RFQ' using errcode = '42501';
  end if;

  if v_rfq.status <> 'DRAFT' then
    raise exception 'Only draft RFQs may be deleted' using errcode = '22000';
  end if;

  select count(*) into v_quotes_count from public.supplier_quotations where rfq_id = p_rfq_id;
  if v_quotes_count > 0 then
    raise exception 'Cannot delete RFQ with existing supplier quotations' using errcode = '23503';
  end if;

  delete from public.rfqs where id = p_rfq_id;
end;
$$;

-- 12. Guarded RPC: save_supplier_quotation
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
  v_company_id uuid;
  v_rfq_id uuid;
  v_vendor_id uuid;
  v_quotation_id uuid;
  v_quotation_number text;
  v_quotation_date date;
  v_valid_until date;
  v_currency text;
  v_payment_terms text;
  v_delivery_terms text;
  v_lead_time_days integer;
  v_notes text;
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

  v_company_id := (p_quotation->>'companyId')::uuid;
  v_rfq_id := (p_quotation->>'rfqId')::uuid;
  v_vendor_id := (p_quotation->>'vendorId')::uuid;

  if v_company_id is null or v_rfq_id is null or v_vendor_id is null then
    raise exception 'companyId, rfqId, and vendorId are required' using errcode = '22000';
  end if;

  if not public.has_company_permission(v_company_id, 'procurement.manage') then
    raise exception 'Insufficient permissions to manage quotations' using errcode = '42501';
  end if;

  select * into v_rfq from public.rfqs where id = v_rfq_id and company_id = v_company_id;
  if not found then
    raise exception 'RFQ not found in company' using errcode = 'P0002';
  end if;

  if v_rfq.status in ('CLOSED', 'CANCELLED') then
    raise exception 'Cannot submit quotations for closed or cancelled RFQs' using errcode = '22000';
  end if;

  if not exists (select 1 from public.vendors where id = v_vendor_id and company_id = v_company_id) then
    raise exception 'Vendor does not exist in company' using errcode = '23503';
  end if;

  v_quotation_number := btrim(coalesce(p_quotation->>'quotationNumber', ''));
  if length(v_quotation_number) < 1 or length(v_quotation_number) > 60 then
    raise exception 'Quotation reference number is required (1-60 characters)' using errcode = '22000';
  end if;

  v_currency := upper(btrim(coalesce(p_quotation->>'currency', v_rfq.currency)));
  if length(v_currency) <> 3 then
    raise exception 'Currency must be a 3-letter ISO code' using errcode = '22000';
  end if;

  v_quotation_date := coalesce((p_quotation->>'quotationDate')::date, current_date);
  v_valid_until := (p_quotation->>'validUntil')::date;
  v_payment_terms := p_quotation->>'paymentTerms';
  v_delivery_terms := p_quotation->>'deliveryTerms';
  v_lead_time_days := (p_quotation->>'leadTimeDays')::integer;
  v_notes := p_quotation->>'notes';

  if (p_quotation->>'id') is not null and btrim(p_quotation->>'id') <> '' then
    v_quotation_id := (p_quotation->>'id')::uuid;
    select * into v_existing_quote from public.supplier_quotations where id = v_quotation_id and company_id = v_company_id;
    if not found then
      raise exception 'Quotation not found' using errcode = 'P0002';
    end if;
    if v_existing_quote.status = 'CANCELLED' then
      raise exception 'Cancelled quotations cannot be modified' using errcode = '22000';
    end if;

    update public.supplier_quotations set
      vendor_id = v_vendor_id,
      quotation_number = v_quotation_number,
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

  -- Re-populate quotation lines
  delete from public.supplier_quotation_lines where quotation_id = v_quotation_id and company_id = v_company_id;

  for v_line in select * from jsonb_to_recordset(p_lines) as x(
    rfqLineId text,
    description text,
    quantity numeric,
    unit text,
    unitPrice numeric,
    leadTimeDays integer,
    isNoBid boolean,
    notes text
  ) loop
    v_rfq_line_id := null;
    if v_line.rfqLineId is not null and btrim(v_line.rfqLineId) <> '' then
      v_rfq_line_id := v_line.rfqLineId::uuid;
    end if;

    if coalesce(v_line.isNoBid, false) then
      v_line_amount := 0;
    else
      v_line_amount := round((coalesce(v_line.quantity, 0) * coalesce(v_line.unitPrice, 0))::numeric, 2);
      v_total_amount := v_total_amount + v_line_amount;
    end if;

    insert into public.supplier_quotation_lines (
      company_id, quotation_id, rfq_line_id, line_number, description,
      quantity, unit, unit_price, amount, lead_time_days, is_no_bid, notes
    ) values (
      v_company_id, v_quotation_id, v_rfq_line_id, v_line_idx,
      coalesce(btrim(v_line.description), ''),
      coalesce(v_line.quantity, 0),
      coalesce(btrim(v_line.unit), 'pcs'),
      coalesce(v_line.unitPrice, 0),
      v_line_amount,
      v_line.leadTimeDays,
      coalesce(v_line.isNoBid, false),
      v_line.notes
    );
    v_line_idx := v_line_idx + 1;
  end loop;

  update public.supplier_quotations set
    total_amount = v_total_amount
  where id = v_quotation_id and company_id = v_company_id;

  select to_jsonb(q) into v_result_quote from public.supplier_quotations q where q.id = v_quotation_id;
  select coalesce(jsonb_agg(to_jsonb(l) order by l.line_number asc), '[]'::jsonb)
    into v_result_lines from public.supplier_quotation_lines l where l.quotation_id = v_quotation_id;

  return jsonb_build_object(
    'quotation', v_result_quote,
    'lines', v_result_lines
  );
end;
$$;

-- 13. Guarded RPC: select_supplier_quotation
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
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_quote from public.supplier_quotations where id = p_quotation_id;
  if not found then
    raise exception 'Quotation not found' using errcode = 'P0002';
  end if;

  if not public.has_company_permission(v_quote.company_id, 'procurement.manage') then
    raise exception 'Insufficient permissions to select preferred quotation' using errcode = '42501';
  end if;

  select * into v_rfq from public.rfqs where id = v_quote.rfq_id and company_id = v_quote.company_id;
  if not found then
    raise exception 'Associated RFQ not found' using errcode = 'P0002';
  end if;

  if v_rfq.status = 'CANCELLED' then
    raise exception 'Cannot select quotation for cancelled RFQ' using errcode = '22000';
  end if;

  -- Deselect any previously selected quote for this RFQ
  update public.supplier_quotations set
    status = 'SUBMITTED',
    deselected_at = now(),
    deselected_by_user_id = v_user_id,
    deselection_reason = 'Replaced by selection of quotation ' || v_quote.quotation_number,
    updated_at = now()
  where rfq_id = v_quote.rfq_id and company_id = v_quote.company_id and status = 'SELECTED' and id <> p_quotation_id;

  -- Mark this quotation as selected
  update public.supplier_quotations set
    status = 'SELECTED',
    selected_at = now(),
    selected_by_user_id = v_user_id,
    selection_reason = btrim(coalesce(p_reason, 'Selected preferred supplier')),
    updated_at = now()
  where id = p_quotation_id;

  -- Update RFQ header with pointer
  update public.rfqs set
    selected_quotation_id = p_quotation_id,
    updated_by_user_id = v_user_id,
    updated_at = now()
  where id = v_quote.rfq_id;

  return (select to_jsonb(q) from public.supplier_quotations q where q.id = p_quotation_id);
end;
$$;

-- 14. Guarded RPC: revert_supplier_quotation_selection
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
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_rfq from public.rfqs where id = p_rfq_id;
  if not found then
    raise exception 'RFQ not found' using errcode = 'P0002';
  end if;

  if not public.has_company_permission(v_rfq.company_id, 'procurement.manage') then
    raise exception 'Insufficient permissions to revert selection' using errcode = '42501';
  end if;

  if v_rfq.selected_quotation_id is not null then
    update public.supplier_quotations set
      status = 'SUBMITTED',
      deselected_at = now(),
      deselected_by_user_id = v_user_id,
      deselection_reason = btrim(coalesce(p_reason, 'Selection reverted by user')),
      updated_at = now()
    where id = v_rfq.selected_quotation_id;
  end if;

  update public.rfqs set
    selected_quotation_id = null,
    updated_by_user_id = v_user_id,
    updated_at = now()
  where id = p_rfq_id;

  return (select to_jsonb(r) from public.rfqs r where r.id = p_rfq_id);
end;
$$;

-- 15. Guarded RPC: convert_quotation_to_draft_po
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
  v_po_number text;
  v_line record;
  v_line_idx integer := 1;
  v_total_amount numeric(18,2) := 0;
  v_cost_code_id uuid;
  v_result_po jsonb;
  v_result_lines jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_quote from public.supplier_quotations where id = p_quotation_id;
  if not found then
    raise exception 'Quotation not found' using errcode = 'P0002';
  end if;

  if not public.has_company_permission(v_quote.company_id, 'procurement.manage') then
    raise exception 'Insufficient permissions to generate purchase order' using errcode = '42501';
  end if;

  select * into v_rfq from public.rfqs where id = v_quote.rfq_id and company_id = v_quote.company_id;
  if not found then
    raise exception 'Associated RFQ not found' using errcode = 'P0002';
  end if;

  if v_rfq.project_id is null then
    raise exception 'RFQ must be associated with a Project before converting to Purchase Order' using errcode = '22000';
  end if;

  v_po_number := upper(btrim(coalesce(p_po_number, '')));
  if length(v_po_number) < 1 or length(v_po_number) > 60 then
    raise exception 'Valid PO number is required (1-60 characters)' using errcode = '22000';
  end if;

  -- Create DRAFT Purchase Order (NEVER APPROVED or ISSUED)
  insert into public.purchase_orders (
    company_id, po_number, vendor_id, project_id, currency,
    status, description, notes, rfq_id, supplier_quotation_id,
    created_by_user_id, updated_by_user_id
  ) values (
    v_quote.company_id, v_po_number, v_quote.vendor_id, v_rfq.project_id, v_quote.currency,
    'DRAFT',
    'Generated from RFQ ' || v_rfq.rfq_number || ' / Quotation ' || v_quote.quotation_number,
    coalesce(p_notes, v_quote.notes),
    v_rfq.id, v_quote.id,
    v_user_id, v_user_id
  ) returning id into v_po_id;

  -- Copy lines from quotation (skipping no-bid lines)
  for v_line in
    select sql.*, rl.project_cost_code_id as rfq_cost_code_id
    from public.supplier_quotation_lines sql
    left join public.rfq_lines rl on rl.id = sql.rfq_line_id
    where sql.quotation_id = p_quotation_id
    order by sql.line_number asc
  loop
    if not v_line.is_no_bid and v_line.quantity > 0 then
      v_cost_code_id := v_line.rfq_cost_code_id;
      insert into public.purchase_order_lines (
        company_id, purchase_order_id, line_number, description,
        quantity, unit, unit_price, amount, project_cost_code_id
      ) values (
        v_quote.company_id, v_po_id, v_line_idx, v_line.description,
        v_line.quantity, v_line.unit, v_line.unit_price, v_line.amount,
        v_cost_code_id
      );
      v_total_amount := v_total_amount + v_line.amount;
      v_line_idx := v_line_idx + 1;
    end if;
  end loop;

  update public.purchase_orders set
    total_amount = v_total_amount
  where id = v_po_id;

  select to_jsonb(p) into v_result_po from public.purchase_orders p where p.id = v_po_id;
  select coalesce(jsonb_agg(to_jsonb(l) order by l.line_number asc), '[]'::jsonb)
    into v_result_lines from public.purchase_order_lines l where l.purchase_order_id = v_po_id;

  return jsonb_build_object(
    'purchaseOrder', v_result_po,
    'lines', v_result_lines
  );
end;
$$;
