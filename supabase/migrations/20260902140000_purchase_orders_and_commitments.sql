-- ============================================================================
-- Migration: 20260902140000_purchase_orders_and_commitments.sql
-- Description: P2A-1 Supplier + Purchase Order Commitment Foundation
-- ============================================================================

-- 1. Create purchase_orders table
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  po_number text not null check (length(btrim(po_number)) between 1 and 60 and po_number = upper(btrim(po_number))),
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  currency text not null default 'PHP' check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'APPROVED', 'ISSUED', 'CLOSED', 'CANCELLED')),
  issue_date date,
  description text,
  notes text,
  cancellation_reason text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  approved_by_user_id uuid references auth.users(id) on delete set null,
  issued_by_user_id uuid references auth.users(id) on delete set null,
  cancelled_by_user_id uuid references auth.users(id) on delete set null,
  closed_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  issued_at timestamptz,
  cancelled_at timestamptz,
  closed_at timestamptz,
  constraint purchase_orders_company_id_id_key unique (company_id, id),
  constraint purchase_orders_company_project_id_key unique (company_id, project_id, id)
);

-- Unique index on po_number per company
create unique index if not exists purchase_orders_company_po_number_unique
  on public.purchase_orders (company_id, lower(po_number));

create index if not exists purchase_orders_company_project_status_idx
  on public.purchase_orders (company_id, project_id, status, updated_at desc);

create index if not exists purchase_orders_company_vendor_idx
  on public.purchase_orders (company_id, vendor_id, updated_at desc);

create index if not exists purchase_orders_company_status_idx
  on public.purchase_orders (company_id, status, updated_at desc);

-- 2. Create purchase_order_lines table
create table if not exists public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  purchase_order_id uuid not null references public.purchase_orders(id) on delete cascade,
  line_number integer not null default 1 check (line_number >= 1),
  description text not null check (length(btrim(description)) between 1 and 500),
  quantity numeric(14,4) not null default 1 check (quantity > 0),
  unit text not null default 'pcs' check (length(btrim(unit)) between 1 and 50),
  unit_price numeric(18,2) not null default 0 check (unit_price >= 0),
  amount numeric(18,2) not null default 0 check (amount >= 0),
  project_cost_code_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_order_lines_company_po_line_key unique (company_id, purchase_order_id, line_number)
);

create index if not exists purchase_order_lines_company_po_idx
  on public.purchase_order_lines (company_id, purchase_order_id, line_number asc);

create index if not exists purchase_order_lines_cost_code_idx
  on public.purchase_order_lines (company_id, project_cost_code_id)
  where project_cost_code_id is not null;

-- 3. Scope and integrity validation triggers

create or replace function private.validate_purchase_order_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project_company_id uuid;
  v_project_status text;
  v_project_archived_at timestamptz;
  v_vendor_company_id uuid;
begin
  -- Validate project ownership and activity
  select p.company_id, p.status, p.archived_at
    into v_project_company_id, v_project_status, v_project_archived_at
  from public.projects p
  where p.id = new.project_id;

  if v_project_company_id is null then
    raise exception 'Purchase order requires an existing project' using errcode = '23503';
  end if;

  if v_project_company_id is distinct from new.company_id then
    raise exception 'Purchase order project is outside the company' using errcode = '42501';
  end if;

  if v_project_status = 'ARCHIVED' or v_project_archived_at is not null then
    raise exception 'Archived projects cannot receive purchase order activity' using errcode = '42501';
  end if;

  -- Validate vendor ownership
  select v.company_id
    into v_vendor_company_id
  from public.vendors v
  where v.id = new.vendor_id;

  if v_vendor_company_id is null then
    raise exception 'Purchase order requires an existing vendor' using errcode = '23503';
  end if;

  if v_vendor_company_id is distinct from new.company_id then
    raise exception 'Purchase order vendor is outside the company' using errcode = '42501';
  end if;

  -- Lifecycle and immutability rules on UPDATE
  if tg_op = 'UPDATE' then
    if old.status <> 'DRAFT' and new.status = 'DRAFT' then
      raise exception 'Cannot revert an approved, issued, closed, or cancelled purchase order to draft' using errcode = '42501';
    end if;

    if old.status in ('CLOSED', 'CANCELLED') and new.status is distinct from old.status then
      raise exception 'Closed or cancelled purchase orders cannot change status' using errcode = '42501';
    end if;

    if old.status <> 'DRAFT' then
      if old.vendor_id is distinct from new.vendor_id then
        raise exception 'Cannot change vendor on a non-draft purchase order' using errcode = '42501';
      end if;
      if old.project_id is distinct from new.project_id then
        raise exception 'Cannot change project on a non-draft purchase order' using errcode = '42501';
      end if;
      if old.currency is distinct from new.currency then
        raise exception 'Cannot change currency on a non-draft purchase order' using errcode = '42501';
      end if;
      if old.po_number is distinct from new.po_number then
        raise exception 'Cannot change PO number on a non-draft purchase order' using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_purchase_order_scope() from public, anon, authenticated;

create or replace function private.prevent_non_draft_purchase_order_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status <> 'DRAFT' then
    raise exception 'Only draft purchase orders may be deleted. Approved, issued, closed, or cancelled orders must remain auditable.'
      using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke execute on function private.prevent_non_draft_purchase_order_delete() from public, anon, authenticated;

-- Attach triggers on purchase_orders
drop trigger if exists purchase_orders_company_boundary on public.purchase_orders;
create trigger purchase_orders_company_boundary
  before insert or update on public.purchase_orders
  for each row execute function private.enforce_company_row_boundary();

drop trigger if exists purchase_orders_updated_at on public.purchase_orders;
create trigger purchase_orders_updated_at
  before update on public.purchase_orders
  for each row execute function private.set_company_updated_at();

drop trigger if exists purchase_orders_scope_guard on public.purchase_orders;
create trigger purchase_orders_scope_guard
  before insert or update on public.purchase_orders
  for each row execute function private.validate_purchase_order_scope();

drop trigger if exists purchase_orders_delete_guard on public.purchase_orders;
create trigger purchase_orders_delete_guard
  before delete on public.purchase_orders
  for each row execute function private.prevent_non_draft_purchase_order_delete();

-- Line validation trigger
create or replace function private.validate_purchase_order_line_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_po_company_id uuid;
  v_po_project_id uuid;
  v_po_status text;
  v_cost_code_status text;
begin
  -- Validate parent purchase order
  if tg_op = 'DELETE' then
    select po.company_id, po.status
      into v_po_company_id, v_po_status
    from public.purchase_orders po
    where po.id = old.purchase_order_id;

    if v_po_status is not null and v_po_status <> 'DRAFT' then
      raise exception 'Cannot delete lines from a non-draft purchase order' using errcode = '42501';
    end if;
    return old;
  end if;

  select po.company_id, po.project_id, po.status
    into v_po_company_id, v_po_project_id, v_po_status
  from public.purchase_orders po
  where po.id = new.purchase_order_id;

  if v_po_company_id is null then
    raise exception 'Purchase order line requires an existing purchase order' using errcode = '23503';
  end if;

  if v_po_company_id is distinct from new.company_id then
    raise exception 'Purchase order line is outside the company' using errcode = '42501';
  end if;

  if v_po_status <> 'DRAFT' and tg_op = 'INSERT' then
    raise exception 'Cannot add lines to a non-draft purchase order' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and v_po_status <> 'DRAFT' then
    if old.description is distinct from new.description or
       old.quantity is distinct from new.quantity or
       old.unit is distinct from new.unit or
       old.unit_price is distinct from new.unit_price or
       old.amount is distinct from new.amount or
       old.project_cost_code_id is distinct from new.project_cost_code_id then
      raise exception 'Cannot modify line details or amounts on a non-draft purchase order' using errcode = '42501';
    end if;
  end if;

  -- Ensure amount is consistent with quantity * unit_price
  new.amount := round(new.quantity * new.unit_price, 2);

  -- Validate cost code if provided
  if new.project_cost_code_id is not null then
    select cc.status
      into v_cost_code_status
    from public.project_cost_codes cc
    where cc.id = new.project_cost_code_id
      and cc.project_id = v_po_project_id
      and cc.company_id = new.company_id;

    if v_cost_code_status is null then
      raise exception 'Cost code does not belong to the same project and company' using errcode = '42501';
    end if;

    if v_cost_code_status <> 'ACTIVE' then
      if tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.project_cost_code_id is distinct from new.project_cost_code_id) then
        raise exception 'Archived cost codes cannot receive new purchase order line assignments' using errcode = '42501';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_purchase_order_line_scope() from public, anon, authenticated;

drop trigger if exists purchase_order_lines_company_boundary on public.purchase_order_lines;
create trigger purchase_order_lines_company_boundary
  before insert or update on public.purchase_order_lines
  for each row execute function private.enforce_company_row_boundary();

drop trigger if exists purchase_order_lines_updated_at on public.purchase_order_lines;
create trigger purchase_order_lines_updated_at
  before update on public.purchase_order_lines
  for each row execute function private.set_company_updated_at();

drop trigger if exists purchase_order_lines_scope_guard on public.purchase_order_lines;
create trigger purchase_order_lines_scope_guard
  before insert or update or delete on public.purchase_order_lines
  for each row execute function private.validate_purchase_order_line_scope();

-- 4. Permissions and Role Grants
insert into public.company_permission_catalog (permission_key, description)
values
  ('procurement.read', 'Read company purchase orders, line items, and commitments.'),
  ('procurement.manage', 'Create and manage draft purchase orders.'),
  ('procurement.approve', 'Approve, issue, close, and cancel purchase orders.')
on conflict (permission_key) do update set description = excluded.description;

insert into public.company_role_permissions (role_key, permission_key)
values
  ('COMPANY_ADMIN', 'procurement.read'), ('COMPANY_ADMIN', 'procurement.manage'), ('COMPANY_ADMIN', 'procurement.approve'),
  ('PLATFORM_OWNER', 'procurement.read'), ('PLATFORM_OWNER', 'procurement.manage'), ('PLATFORM_OWNER', 'procurement.approve'),
  ('FINANCE', 'procurement.read'), ('FINANCE', 'procurement.manage'), ('FINANCE', 'procurement.approve'),
  ('VIEWER', 'procurement.read')
on conflict do nothing;

-- 6. Register in private.company_tenant_policy_catalog and apply RLS
insert into private.company_tenant_policy_catalog (table_name, read_permission, write_permission, allow_insert, allow_update, allow_delete)
values
  ('purchase_orders', 'procurement.read', 'procurement.manage', true, true, true),
  ('purchase_order_lines', 'procurement.read', 'procurement.manage', true, true, true)
on conflict (table_name) do update set
  read_permission = excluded.read_permission,
  write_permission = excluded.write_permission,
  allow_insert = excluded.allow_insert,
  allow_update = excluded.allow_update,
  allow_delete = excluded.allow_delete;

alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;

-- Policies for purchase_orders
drop policy if exists purchase_orders_company_select on public.purchase_orders;
create policy purchase_orders_company_select on public.purchase_orders
  for select to authenticated using ((select public.has_company_permission(company_id, 'procurement.read')));

drop policy if exists purchase_orders_company_insert on public.purchase_orders;
create policy purchase_orders_company_insert on public.purchase_orders
  for insert to authenticated with check ((select public.has_company_permission(company_id, 'procurement.manage')));

drop policy if exists purchase_orders_company_update on public.purchase_orders;
create policy purchase_orders_company_update on public.purchase_orders
  for update to authenticated using (
    (select public.has_company_permission(company_id, 'procurement.manage')) or
    (select public.has_company_permission(company_id, 'procurement.approve'))
  ) with check (
    (select public.has_company_permission(company_id, 'procurement.manage')) or
    (select public.has_company_permission(company_id, 'procurement.approve'))
  );

drop policy if exists purchase_orders_company_delete on public.purchase_orders;
create policy purchase_orders_company_delete on public.purchase_orders
  for delete to authenticated using ((select public.has_company_permission(company_id, 'procurement.manage')));

-- Policies for purchase_order_lines
drop policy if exists purchase_order_lines_company_select on public.purchase_order_lines;
create policy purchase_order_lines_company_select on public.purchase_order_lines
  for select to authenticated using ((select public.has_company_permission(company_id, 'procurement.read')));

drop policy if exists purchase_order_lines_company_insert on public.purchase_order_lines;
create policy purchase_order_lines_company_insert on public.purchase_order_lines
  for insert to authenticated with check ((select public.has_company_permission(company_id, 'procurement.manage')));

drop policy if exists purchase_order_lines_company_update on public.purchase_order_lines;
create policy purchase_order_lines_company_update on public.purchase_order_lines
  for update to authenticated using ((select public.has_company_permission(company_id, 'procurement.manage')))
  with check ((select public.has_company_permission(company_id, 'procurement.manage')));

drop policy if exists purchase_order_lines_company_delete on public.purchase_order_lines;
create policy purchase_order_lines_company_delete on public.purchase_order_lines
  for delete to authenticated using ((select public.has_company_permission(company_id, 'procurement.manage')));

grant select, insert, update, delete on table public.purchase_orders to authenticated;
grant select, insert, update, delete on table public.purchase_order_lines to authenticated;

-- 7. Guarded RPC Functions

create or replace function public.save_purchase_order(
  p_po jsonb,
  p_lines jsonb default '[]'::jsonb
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
  v_line_row jsonb;
  v_line_idx integer := 0;
  v_line_id uuid;
  v_cost_code_id uuid;
  v_res_lines jsonb := '[]'::jsonb;
  v_res_po jsonb;
begin
  if v_company_id is null then
    raise exception 'Company ID is required' using errcode = '42501';
  end if;

  if not (select public.has_company_permission(v_company_id, 'procurement.manage')) then
    raise exception 'Unauthorized to create or edit purchase orders' using errcode = '42501';
  end if;

  if v_po_id is not null then
    select po.status into v_existing_status
    from public.purchase_orders po
    where po.id = v_po_id and po.company_id = v_company_id
    for update;

    if v_existing_status is null then
      raise exception 'Purchase order not found in company' using errcode = '23503';
    end if;

    if v_existing_status <> 'DRAFT' then
      raise exception 'Only draft purchase orders can be edited' using errcode = '42501';
    end if;

    update public.purchase_orders
    set
      po_number = v_po_number,
      vendor_id = v_vendor_id,
      project_id = v_project_id,
      currency = v_currency,
      issue_date = v_issue_date,
      description = v_description,
      notes = v_notes,
      updated_by_user_id = v_user_id,
      updated_at = now()
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

  return jsonb_build_object(
    'purchaseOrder', v_res_po,
    'lines', v_res_lines
  );
end;
$$;

create or replace function public.transition_purchase_order_status(
  p_po_id uuid,
  p_target_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid;
  v_current_status text;
  v_target_status text := upper(btrim(p_target_status));
  v_audit_event text;
  v_res_po jsonb;
  v_res_lines jsonb;
begin
  select po.company_id, po.status
    into v_company_id, v_current_status
  from public.purchase_orders po
  where po.id = p_po_id
  for update;

  if v_company_id is null then
    raise exception 'Purchase order not found' using errcode = '23503';
  end if;

  if not (select public.has_company_permission(v_company_id, 'procurement.approve')) then
    raise exception 'Unauthorized to change purchase order lifecycle status' using errcode = '42501';
  end if;

  if v_target_status not in ('APPROVED', 'ISSUED', 'CLOSED', 'CANCELLED') then
    raise exception 'Invalid target status: %', v_target_status using errcode = '22023';
  end if;

  if v_current_status = 'DRAFT' and v_target_status not in ('APPROVED', 'CANCELLED') then
    raise exception 'Draft purchase orders can only be approved or cancelled' using errcode = '42501';
  end if;

  if v_current_status = 'APPROVED' and v_target_status not in ('ISSUED', 'CANCELLED') then
    raise exception 'Approved purchase orders can only be issued or cancelled' using errcode = '42501';
  end if;

  if v_current_status = 'ISSUED' and v_target_status not in ('CLOSED', 'CANCELLED') then
    raise exception 'Issued purchase orders can only be closed or cancelled' using errcode = '42501';
  end if;

  if v_current_status in ('CLOSED', 'CANCELLED') then
    raise exception 'Closed or cancelled purchase orders cannot undergo further transitions' using errcode = '42501';
  end if;

  if v_target_status = 'APPROVED' then
    v_audit_event := 'PURCHASE_ORDER_APPROVED';
    update public.purchase_orders
    set status = 'APPROVED',
        approved_at = now(),
        approved_by_user_id = v_user_id,
        updated_at = now(),
        updated_by_user_id = v_user_id
    where id = p_po_id and company_id = v_company_id;
  elsif v_target_status = 'ISSUED' then
    v_audit_event := 'PURCHASE_ORDER_ISSUED';
    update public.purchase_orders
    set status = 'ISSUED',
        issued_at = now(),
        issued_by_user_id = v_user_id,
        updated_at = now(),
        updated_by_user_id = v_user_id
    where id = p_po_id and company_id = v_company_id;
  elsif v_target_status = 'CLOSED' then
    v_audit_event := 'PURCHASE_ORDER_CLOSED';
    update public.purchase_orders
    set status = 'CLOSED',
        closed_at = now(),
        closed_by_user_id = v_user_id,
        updated_at = now(),
        updated_by_user_id = v_user_id
    where id = p_po_id and company_id = v_company_id;
  elsif v_target_status = 'CANCELLED' then
    v_audit_event := 'PURCHASE_ORDER_CANCELLED';
    update public.purchase_orders
    set status = 'CANCELLED',
        cancelled_at = now(),
        cancelled_by_user_id = v_user_id,
        cancellation_reason = p_reason,
        updated_at = now(),
        updated_by_user_id = v_user_id
    where id = p_po_id and company_id = v_company_id;
  end if;

  select to_jsonb(po.*) into v_res_po
  from public.purchase_orders po
  where po.id = p_po_id and po.company_id = v_company_id;

  select coalesce(jsonb_agg(to_jsonb(pol.*) order by pol.line_number asc), '[]'::jsonb)
  into v_res_lines
  from public.purchase_order_lines pol
  where pol.purchase_order_id = p_po_id and pol.company_id = v_company_id;

  return jsonb_build_object(
    'purchaseOrder', v_res_po,
    'lines', v_res_lines
  );
end;
$$;

create or replace function public.delete_draft_purchase_order(p_po_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid;
  v_status text;
  v_po_number text;
begin
  select po.company_id, po.status, po.po_number
    into v_company_id, v_status, v_po_number
  from public.purchase_orders po
  where po.id = p_po_id
  for update;

  if v_company_id is null then return; end if;

  if not (select public.has_company_permission(v_company_id, 'procurement.manage')) then
    raise exception 'Unauthorized to delete purchase orders' using errcode = '42501';
  end if;

  if v_status <> 'DRAFT' then
    raise exception 'Only draft purchase orders may be deleted' using errcode = '42501';
  end if;

  delete from public.purchase_order_lines where purchase_order_id = p_po_id and company_id = v_company_id;
  delete from public.purchase_orders where id = p_po_id and company_id = v_company_id;
end;
$$;

grant execute on function public.save_purchase_order to authenticated;
grant execute on function public.transition_purchase_order_status to authenticated;
grant execute on function public.delete_draft_purchase_order to authenticated;
