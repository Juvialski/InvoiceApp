-- ============================================================================
-- Migration: 20260902150000_purchase_order_receipts.sql
-- Description: P2A-2 Purchase Order Delivery / Receipt Tracking
-- ============================================================================

-- Receipts track goods and service deliveries against ISSUED purchase orders.
-- A receipt is an operational delivery record, NOT an Actual Cost posting or Expense.

-- 1. Receipt header and line tables
create table if not exists public.purchase_order_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete restrict,
  receipt_number text not null check (length(btrim(receipt_number)) between 1 and 60 and receipt_number = upper(btrim(receipt_number))),
  receipt_date date not null default current_date,
  supplier_delivery_reference text check (supplier_delivery_reference is null or length(btrim(supplier_delivery_reference)) <= 100),
  notes text check (notes is null or length(btrim(notes)) <= 1000),
  status text not null default 'RECEIVED' check (status in ('RECEIVED', 'VOIDED')),
  void_reason text check (void_reason is null or length(btrim(void_reason)) <= 500),
  voided_by_user_id uuid references auth.users(id) on delete set null,
  voided_at timestamptz,
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_order_receipts_company_id_id_key unique (company_id, id),
  constraint purchase_order_receipts_company_po_id_key unique (company_id, purchase_order_id, id)
);

create unique index if not exists purchase_order_receipts_company_number_unique
  on public.purchase_order_receipts (company_id, lower(receipt_number));
create index if not exists purchase_order_receipts_company_po_status_idx
  on public.purchase_order_receipts (company_id, purchase_order_id, status, receipt_date desc);
create index if not exists purchase_order_receipts_company_status_idx
  on public.purchase_order_receipts (company_id, status, receipt_date desc);

create table if not exists public.purchase_order_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  purchase_order_receipt_id uuid not null references public.purchase_order_receipts(id) on delete restrict,
  purchase_order_line_id uuid not null references public.purchase_order_lines(id) on delete restrict,
  line_number integer not null default 1 check (line_number >= 1),
  received_quantity numeric(14,4) not null check (received_quantity > 0),
  notes text check (notes is null or length(btrim(notes)) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_order_receipt_lines_company_receipt_line_key unique (company_id, purchase_order_receipt_id, line_number),
  constraint purchase_order_receipt_lines_company_receipt_po_line_key unique (company_id, purchase_order_receipt_id, purchase_order_line_id)
);

create index if not exists purchase_order_receipt_lines_company_receipt_idx
  on public.purchase_order_receipt_lines (company_id, purchase_order_receipt_id, line_number asc);
create index if not exists purchase_order_receipt_lines_company_po_line_idx
  on public.purchase_order_receipt_lines (company_id, purchase_order_line_id);

-- 2. Tenant policy catalog & RLS
insert into private.company_tenant_policy_catalog (table_name, read_permission, write_permission, allow_insert, allow_update, allow_delete)
values
  ('purchase_order_receipts', 'procurement.read', 'procurement.manage', true, true, false),
  ('purchase_order_receipt_lines', 'procurement.read', 'procurement.manage', true, true, false)
on conflict (table_name) do update set
  read_permission = excluded.read_permission,
  write_permission = excluded.write_permission,
  allow_insert = excluded.allow_insert,
  allow_update = excluded.allow_update,
  allow_delete = excluded.allow_delete;

alter table public.purchase_order_receipts enable row level security;
alter table public.purchase_order_receipt_lines enable row level security;

drop policy if exists purchase_order_receipts_company_select on public.purchase_order_receipts;
create policy purchase_order_receipts_company_select on public.purchase_order_receipts
  for select to authenticated
  using ((select public.has_company_permission(company_id, 'procurement.read')));

drop policy if exists purchase_order_receipts_company_insert on public.purchase_order_receipts;
create policy purchase_order_receipts_company_insert on public.purchase_order_receipts
  for insert to authenticated
  with check ((select public.has_company_permission(company_id, 'procurement.manage')));

drop policy if exists purchase_order_receipts_company_update on public.purchase_order_receipts;
create policy purchase_order_receipts_company_update on public.purchase_order_receipts
  for update to authenticated
  using ((select public.has_company_permission(company_id, 'procurement.manage')))
  with check ((select public.has_company_permission(company_id, 'procurement.manage')));

drop policy if exists purchase_order_receipts_company_delete on public.purchase_order_receipts;
create policy purchase_order_receipts_company_delete on public.purchase_order_receipts
  for delete to authenticated
  using ((select public.has_company_permission(company_id, 'procurement.manage')));

drop policy if exists purchase_order_receipt_lines_company_select on public.purchase_order_receipt_lines;
create policy purchase_order_receipt_lines_company_select on public.purchase_order_receipt_lines
  for select to authenticated
  using ((select public.has_company_permission(company_id, 'procurement.read')));

drop policy if exists purchase_order_receipt_lines_company_insert on public.purchase_order_receipt_lines;
create policy purchase_order_receipt_lines_company_insert on public.purchase_order_receipt_lines
  for insert to authenticated
  with check ((select public.has_company_permission(company_id, 'procurement.manage')));

drop policy if exists purchase_order_receipt_lines_company_update on public.purchase_order_receipt_lines;
create policy purchase_order_receipt_lines_company_update on public.purchase_order_receipt_lines
  for update to authenticated
  using ((select public.has_company_permission(company_id, 'procurement.manage')))
  with check ((select public.has_company_permission(company_id, 'procurement.manage')));

drop policy if exists purchase_order_receipt_lines_company_delete on public.purchase_order_receipt_lines;
create policy purchase_order_receipt_lines_company_delete on public.purchase_order_receipt_lines
  for delete to authenticated
  using ((select public.has_company_permission(company_id, 'procurement.manage')));

grant select, insert, update, delete on table public.purchase_order_receipts to authenticated;
grant select, insert, update, delete on table public.purchase_order_receipt_lines to authenticated;

-- 3. Database Guards & Lifecycle Triggers
create or replace function private.validate_purchase_order_receipt_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_po_company_id uuid;
  v_po_status text;
  v_has_manage boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'Historical purchase order receipts are immutable and cannot be deleted. Void the receipt instead.' using errcode = '42501';
  end if;

  if v_user_id is null then
    raise exception 'Authentication is required for purchase order receipt activity' using errcode = '42501';
  end if;

  v_has_manage := (select public.has_company_permission(new.company_id, 'procurement.manage'));
  if not v_has_manage then
    raise exception 'Unauthorized to record or manage purchase order receipts' using errcode = '42501';
  end if;

  select po.company_id, po.status
    into v_po_company_id, v_po_status
  from public.purchase_orders po
  where po.id = new.purchase_order_id;

  if v_po_company_id is null then
    raise exception 'Purchase order receipt requires an existing purchase order' using errcode = '23503';
  end if;
  if v_po_company_id is distinct from new.company_id then
    raise exception 'Purchase order receipt company does not match purchase order company' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if v_po_status <> 'ISSUED' then
      raise exception 'Receipts can only be recorded against ISSUED purchase orders (current status: %)', v_po_status using errcode = '42501';
    end if;

    new.status := 'RECEIVED';
    new.created_by_user_id := v_user_id;
    new.updated_by_user_id := v_user_id;
    new.voided_by_user_id := null;
    new.voided_at := null;
    new.void_reason := null;
    return new;
  end if;

  -- UPDATE validation
  if new.company_id is distinct from old.company_id then
    raise exception 'Purchase order receipt company is immutable' using errcode = '42501';
  end if;
  if new.purchase_order_id is distinct from old.purchase_order_id then
    raise exception 'Purchase order receipt cannot be moved to another purchase order' using errcode = '42501';
  end if;
  if new.created_by_user_id is distinct from old.created_by_user_id or new.created_at is distinct from old.created_at then
    raise exception 'Purchase order receipt creation provenance is immutable' using errcode = '42501';
  end if;

  if new.receipt_number is distinct from old.receipt_number or
     new.receipt_date is distinct from old.receipt_date or
     new.supplier_delivery_reference is distinct from old.supplier_delivery_reference then
    raise exception 'Recorded receipt terms and delivery references are immutable' using errcode = '42501';
  end if;

  if old.status = 'VOIDED' and new.status <> 'VOIDED' then
    raise exception 'Voided receipts cannot be un-voided' using errcode = '42501';
  end if;

  if old.status = 'VOIDED' and (
    new.notes is distinct from old.notes or
    new.void_reason is distinct from old.void_reason
  ) then
    raise exception 'Voided receipts are immutable and cannot be modified' using errcode = '42501';
  end if;

  if old.status = 'RECEIVED' and new.status = 'VOIDED' then
    if length(btrim(coalesce(new.void_reason, ''))) < 3 then
      raise exception 'Void reason must contain at least 3 characters' using errcode = '23514';
    end if;
    new.voided_by_user_id := v_user_id;
    new.voided_at := now();
    new.void_reason := btrim(new.void_reason);
  end if;

  new.updated_by_user_id := v_user_id;
  return new;
end;
$$;

revoke all on function private.validate_purchase_order_receipt_scope() from public, anon, authenticated;

create or replace function private.validate_purchase_order_receipt_line_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_receipt_company_id uuid;
  v_receipt_po_id uuid;
  v_receipt_status text;
  v_po_line_po_id uuid;
  v_po_line_company_id uuid;
  v_po_line_ordered_qty numeric(14,4);
  v_already_received numeric(14,4);
begin
  if tg_op = 'DELETE' then
    raise exception 'Historical purchase order receipt lines are immutable and cannot be deleted.' using errcode = '42501';
  end if;

  select por.company_id, por.purchase_order_id, por.status
    into v_receipt_company_id, v_receipt_po_id, v_receipt_status
  from public.purchase_order_receipts por
  where por.id = new.purchase_order_receipt_id;

  if v_receipt_company_id is null then
    raise exception 'Purchase order receipt line requires an existing receipt' using errcode = '23503';
  end if;
  if v_receipt_company_id is distinct from new.company_id then
    raise exception 'Purchase order receipt line company mismatch' using errcode = '42501';
  end if;
  if v_receipt_status <> 'RECEIVED' then
    raise exception 'Cannot add or modify lines on a voided receipt' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if new.company_id is distinct from old.company_id or
       new.purchase_order_receipt_id is distinct from old.purchase_order_receipt_id or
       new.purchase_order_line_id is distinct from old.purchase_order_line_id or
       new.received_quantity is distinct from old.received_quantity then
      raise exception 'Recorded receipt line items and quantities are immutable' using errcode = '42501';
    end if;
    return new;
  end if;

  -- Row lock the PO line to prevent concurrent over-receipt races
  select pol.purchase_order_id, pol.company_id, pol.quantity
    into v_po_line_po_id, v_po_line_company_id, v_po_line_ordered_qty
  from public.purchase_order_lines pol
  where pol.id = new.purchase_order_line_id
  for update;

  if v_po_line_company_id is null then
    raise exception 'Receipt line requires an existing purchase order line' using errcode = '23503';
  end if;
  if v_po_line_company_id is distinct from new.company_id or v_po_line_po_id is distinct from v_receipt_po_id then
    raise exception 'Receipt line must reference a purchase order line from the same purchase order and company' using errcode = '42501';
  end if;

  -- Calculate total already received from active (non-voided) receipts
  select coalesce(sum(porl.received_quantity), 0)
    into v_already_received
  from public.purchase_order_receipt_lines porl
  join public.purchase_order_receipts por on por.id = porl.purchase_order_receipt_id
  where porl.purchase_order_line_id = new.purchase_order_line_id
    and por.status = 'RECEIVED';

  if (v_already_received + new.received_quantity) > v_po_line_ordered_qty then
    raise exception 'Over-receipt is not permitted: ordered %, previously received %, attempting to receive % (total would be %)',
      v_po_line_ordered_qty, v_already_received, new.received_quantity, (v_already_received + new.received_quantity)
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_purchase_order_receipt_line_scope() from public, anon, authenticated;

-- Attach database triggers
drop trigger if exists purchase_order_receipts_company_boundary on public.purchase_order_receipts;
create trigger purchase_order_receipts_company_boundary
  before insert or update on public.purchase_order_receipts
  for each row execute function private.enforce_company_row_boundary();

drop trigger if exists purchase_order_receipts_updated_at on public.purchase_order_receipts;
create trigger purchase_order_receipts_updated_at
  before update on public.purchase_order_receipts
  for each row execute function private.set_company_updated_at();

drop trigger if exists purchase_order_receipts_scope_guard on public.purchase_order_receipts;
create trigger purchase_order_receipts_scope_guard
  before insert or update or delete on public.purchase_order_receipts
  for each row execute function private.validate_purchase_order_receipt_scope();

drop trigger if exists purchase_order_receipt_lines_company_boundary on public.purchase_order_receipt_lines;
create trigger purchase_order_receipt_lines_company_boundary
  before insert or update on public.purchase_order_receipt_lines
  for each row execute function private.enforce_company_row_boundary();

drop trigger if exists purchase_order_receipt_lines_updated_at on public.purchase_order_receipt_lines;
create trigger purchase_order_receipt_lines_updated_at
  before update on public.purchase_order_receipt_lines
  for each row execute function private.set_company_updated_at();

drop trigger if exists purchase_order_receipt_lines_scope_guard on public.purchase_order_receipt_lines;
create trigger purchase_order_receipt_lines_scope_guard
  before insert or update or delete on public.purchase_order_receipt_lines
  for each row execute function private.validate_purchase_order_receipt_line_scope();

-- 4. Guarded RPC: Record Purchase Order Receipt
create or replace function public.record_purchase_order_receipt(
  p_receipt jsonb,
  p_lines jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid := (p_receipt->>'companyId')::uuid;
  v_po_id uuid := (p_receipt->>'purchaseOrderId')::uuid;
  v_receipt_number text := upper(btrim(p_receipt->>'receiptNumber'));
  v_receipt_date date := coalesce(nullif(p_receipt->>'receiptDate', '')::date, current_date);
  v_supplier_ref text := nullif(btrim(p_receipt->>'supplierDeliveryReference'), '');
  v_notes text := nullif(btrim(p_receipt->>'notes'), '');
  v_receipt_id uuid := nullif(p_receipt->>'id', '')::uuid;
  v_po_status text;
  v_line_row jsonb;
  v_line_idx integer := 0;
  v_line_id uuid;
  v_po_line_id uuid;
  v_qty numeric(14,4);
  v_line_notes text;
  v_res_receipt jsonb;
  v_res_lines jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to record receipts' using errcode = '42501';
  end if;
  if v_company_id is null then
    raise exception 'Company ID is required' using errcode = '42501';
  end if;
  if v_po_id is null then
    raise exception 'Purchase order ID is required' using errcode = '23503';
  end if;
  if not (select public.has_company_permission(v_company_id, 'procurement.manage')) then
    raise exception 'Unauthorized to record purchase order receipts' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'At least one receipt line item is required' using errcode = '22023';
  end if;

  -- Lock PO for concurrency control
  select po.status into v_po_status
  from public.purchase_orders po
  where po.id = v_po_id and po.company_id = v_company_id
  for update;

  if v_po_status is null then
    raise exception 'Purchase order not found in company' using errcode = '23503';
  end if;
  if v_po_status <> 'ISSUED' then
    raise exception 'Receipts can only be recorded against ISSUED purchase orders (current status: %)', v_po_status using errcode = '42501';
  end if;

  if v_receipt_id is null then
    v_receipt_id := gen_random_uuid();
  end if;

  insert into public.purchase_order_receipts (
    id, company_id, purchase_order_id, receipt_number, receipt_date,
    supplier_delivery_reference, notes, status, created_by_user_id, updated_by_user_id
  ) values (
    v_receipt_id, v_company_id, v_po_id, v_receipt_number, v_receipt_date,
    v_supplier_ref, v_notes, 'RECEIVED', v_user_id, v_user_id
  );

  for v_line_row in select value from jsonb_array_elements(p_lines) loop
    v_qty := coalesce((v_line_row->>'receivedQuantity')::numeric, 0);
    if v_qty <= 0 then
      continue; -- skip zero lines
    end if;

    v_line_idx := v_line_idx + 1;
    v_line_id := nullif(v_line_row->>'id', '')::uuid;
    if v_line_id is null then v_line_id := gen_random_uuid(); end if;
    v_po_line_id := (v_line_row->>'purchaseOrderLineId')::uuid;
    v_line_notes := nullif(btrim(v_line_row->>'notes'), '');

    insert into public.purchase_order_receipt_lines (
      id, company_id, purchase_order_receipt_id, purchase_order_line_id,
      line_number, received_quantity, notes
    ) values (
      v_line_id, v_company_id, v_receipt_id, v_po_line_id,
      v_line_idx, v_qty, v_line_notes
    );
  end loop;

  if v_line_idx = 0 then
    raise exception 'Receipt must contain at least one positive received quantity' using errcode = '22023';
  end if;

  select to_jsonb(por.*) into v_res_receipt
  from public.purchase_order_receipts por
  where por.id = v_receipt_id and por.company_id = v_company_id;

  select coalesce(jsonb_agg(to_jsonb(porl.*) order by porl.line_number asc), '[]'::jsonb)
    into v_res_lines
  from public.purchase_order_receipt_lines porl
  where porl.purchase_order_receipt_id = v_receipt_id and porl.company_id = v_company_id;

  return jsonb_build_object('receipt', v_res_receipt, 'lines', v_res_lines);
end;
$$;

-- 5. Guarded RPC: Void Purchase Order Receipt
create or replace function public.void_purchase_order_receipt(
  p_receipt_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid;
  v_status text;
  v_res_receipt jsonb;
  v_res_lines jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to void receipts' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Void reason must contain at least 3 characters' using errcode = '23514';
  end if;

  select por.company_id, por.status
    into v_company_id, v_status
  from public.purchase_order_receipts por
  where por.id = p_receipt_id
  for update;

  if v_company_id is null then
    raise exception 'Purchase order receipt not found' using errcode = '23503';
  end if;
  if not (select public.has_company_permission(v_company_id, 'procurement.manage')) then
    raise exception 'Unauthorized to void purchase order receipts' using errcode = '42501';
  end if;
  if v_status <> 'RECEIVED' then
    raise exception 'Only active received receipts may be voided' using errcode = '42501';
  end if;

  update public.purchase_order_receipts
  set status = 'VOIDED',
      void_reason = btrim(p_reason),
      voided_by_user_id = v_user_id,
      voided_at = now(),
      updated_by_user_id = v_user_id
  where id = p_receipt_id and company_id = v_company_id;

  select to_jsonb(por.*) into v_res_receipt
  from public.purchase_order_receipts por
  where por.id = p_receipt_id and por.company_id = v_company_id;

  select coalesce(jsonb_agg(to_jsonb(porl.*) order by porl.line_number asc), '[]'::jsonb)
    into v_res_lines
  from public.purchase_order_receipt_lines porl
  where porl.purchase_order_receipt_id = p_receipt_id and porl.company_id = v_company_id;

  return jsonb_build_object('receipt', v_res_receipt, 'lines', v_res_lines);
end;
$$;

revoke all on function public.record_purchase_order_receipt(jsonb, jsonb) from public, anon;
revoke all on function public.void_purchase_order_receipt(uuid, text) from public, anon;
grant execute on function public.record_purchase_order_receipt(jsonb, jsonb) to authenticated;
grant execute on function public.void_purchase_order_receipt(uuid, text) to authenticated;

-- 6. Forward Migration: Update Project Lifecycle Preflight with Procurement Dependencies
create or replace function private.project_lifecycle_preflight(
  p_project_id uuid,
  p_company_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project public.projects;
  v_invoice_allocations integer := 0;
  v_expenses integer := 0;
  v_assignments integer := 0;
  v_work_entries integer := 0;
  v_overtime_requests integer := 0;
  v_payroll_allocations integer := 0;
  v_payroll_entry_contexts integer := 0;
  v_import_rows integer := 0;
  v_worker_defaults integer := 0;
  v_compensation_defaults integer := 0;
  v_engineering_documents integer := 0;
  v_engineering_rfis integer := 0;
  v_engineering_submittals integer := 0;
  v_daily_site_logs integer := 0;
  v_accounting_events integer := 0;
  v_purchase_orders integer := 0;
  v_total integer := 0;
  v_can_delete boolean := false;
  v_can_reactivate boolean := false;
begin
  select p.*
    into v_project
  from public.projects p
  where p.id = p_project_id
    and p.company_id = p_company_id;

  if not found then
    raise exception 'Project does not exist in company'
      using errcode = '42501';
  end if;

  select count(*) into v_invoice_allocations
  from public.invoice_project_allocations a
  where a.company_id = p_company_id and a.project_id = p_project_id;

  select count(*) into v_expenses
  from public.expenses e
  where e.company_id = p_company_id and e.project_id = p_project_id;

  select count(*) into v_assignments
  from public.project_worker_assignments a
  where a.company_id = p_company_id and a.project_id = p_project_id;

  select count(*) into v_work_entries
  from public.work_entries w
  where w.company_id = p_company_id and w.project_id = p_project_id;

  select count(*) into v_overtime_requests
  from public.payroll_overtime_requests r
  where r.company_id = p_company_id and r.project_id = p_project_id;

  select count(*) into v_payroll_allocations
  from public.payroll_project_allocations a
  where a.company_id = p_company_id and a.project_id = p_project_id;

  select count(*) into v_payroll_entry_contexts
  from public.payroll_entries e
  where e.company_id = p_company_id and e.project_id = p_project_id;

  select count(*) into v_import_rows
  from public.payroll_import_rows r
  where r.company_id = p_company_id and r.project_id = p_project_id;

  select count(*) into v_worker_defaults
  from public.workers w
  where w.company_id = p_company_id and w.default_project_id = p_project_id;

  select count(*) into v_compensation_defaults
  from public.worker_compensation_profiles p
  where p.company_id = p_company_id and p.default_project_id = p_project_id;

  select count(*) into v_engineering_documents
  from public.engineering_documents d
  where d.company_id = p_company_id and d.project_id = p_project_id;

  select count(*) into v_engineering_rfis
  from public.engineering_rfis r
  where r.company_id = p_company_id and r.project_id = p_project_id;

  select count(*) into v_engineering_submittals
  from public.engineering_submittals s
  where s.company_id = p_company_id and s.project_id = p_project_id;

  select count(*) into v_daily_site_logs
  from public.engineering_daily_site_logs l
  where l.company_id = p_company_id and l.project_id = p_project_id;

  select count(*) into v_accounting_events
  from public.project_accounting_events e
  where e.company_id = p_company_id and e.project_id = p_project_id;

  select count(*) into v_purchase_orders
  from public.purchase_orders po
  where po.company_id = p_company_id and po.project_id = p_project_id;

  v_total := v_invoice_allocations + v_expenses + v_assignments + v_work_entries
    + v_overtime_requests + v_payroll_allocations + v_payroll_entry_contexts
    + v_import_rows + v_worker_defaults + v_compensation_defaults
    + v_engineering_documents + v_engineering_rfis + v_engineering_submittals
    + v_daily_site_logs + v_accounting_events + v_purchase_orders;

  v_can_delete := v_total = 0;
  v_can_reactivate := coalesce(
    v_project.status = 'ARCHIVED'
      and v_project.archived_at is not null
      and v_project.archived_from_status in ('PLANNING', 'ACTIVE', 'ON_HOLD'),
    false
  );

  return jsonb_build_object(
    'projectId', p_project_id,
    'projectCode', v_project.project_code,
    'projectName', v_project.project_name,
    'status', v_project.status,
    'archivedAt', v_project.archived_at,
    'archivedFromStatus', v_project.archived_from_status,
    'canDelete', v_can_delete,
    'canReactivate', v_can_reactivate,
    'recommendedAction', case
      when v_can_delete then 'DELETE_UNUSED'
      when v_can_reactivate then 'REACTIVATE'
      else 'ARCHIVE'
    end,
    'blockedReason', case
      when v_can_delete then null
      when v_project.status = 'ARCHIVED' and not v_can_reactivate then 'This project is archived and its prior state is unavailable or terminal; keep it archived.'
      else 'This project has operational or financial history and cannot be permanently deleted. Archive it instead.'
    end,
    'totalDependencyCount', v_total,
    'dependencies', jsonb_build_object(
      'invoiceProjectAllocations', v_invoice_allocations,
      'expenses', v_expenses,
      'projectWorkerAssignments', v_assignments,
      'workEntries', v_work_entries,
      'overtimeRequests', v_overtime_requests,
      'payrollProjectAllocations', v_payroll_allocations,
      'payrollEntryProjectContexts', v_payroll_entry_contexts,
      'payrollImportRows', v_import_rows,
      'workerDefaultProjects', v_worker_defaults,
      'compensationProfileDefaultProjects', v_compensation_defaults,
      'engineeringDocuments', v_engineering_documents,
      'engineeringRfis', v_engineering_rfis,
      'engineeringSubmittals', v_engineering_submittals,
      'engineeringDailySiteLogs', v_daily_site_logs,
      'projectAccountingEvents', v_accounting_events,
      'purchaseOrders', v_purchase_orders
    )
  );
end;
$$;

revoke all on function private.project_lifecycle_preflight(uuid, uuid) from public, anon, authenticated;
