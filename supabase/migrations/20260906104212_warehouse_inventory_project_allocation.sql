-- HydroQualiSense Warehouse Inventory & Project Allocation.
--
-- Inventory is a quantity/custody domain only. Project material requirements,
-- procurement receipts, Daily Site Log observations, Expenses, Actual Cost,
-- Committed Cost, and Cash remain separate sources of truth.

-- 1. Extend the append-only company audit allowlist without narrowing any
-- event already accepted by the current main branch.
alter table public.company_audit_events
  drop constraint if exists company_audit_events_event_type_check;
alter table public.company_audit_events
  add constraint company_audit_events_event_type_check check (event_type in (
    'COMPANY_CREATED', 'COMPANY_UPDATED', 'COMPANY_SUSPENDED', 'COMPANY_ARCHIVED', 'COMPANY_REACTIVATED',
    'USER_INVITED', 'INVITE_REVOKED', 'INVITE_ACCEPTED', 'INVITATION_SENT', 'INVITATION_DELIVERY_FAILED',
    'MEMBER_ROLE_CHANGED', 'MEMBER_SUSPENDED', 'MEMBER_REACTIVATED', 'MEMBER_REVOKED', 'MEMBER_PERMISSIONS_UPDATED',
    'PAYROLL_REPAIR_APPLIED', 'PAYROLL_CALENDAR_REBUILT', 'PAYROLL_UNAPPROVED_RESET', 'PAYROLL_WORKSPACE_RESET',
    'COMPANY_AI_CREDENTIAL_CONFIGURED', 'COMPANY_AI_CREDENTIAL_ROTATED',
    'COMPANY_AI_CREDENTIAL_TESTED', 'COMPANY_AI_CREDENTIAL_ENABLED',
    'COMPANY_AI_CREDENTIAL_DISABLED', 'COMPANY_AI_CREDENTIAL_REMOVED',
    'CASH_ACCOUNT_CREATED', 'CASH_ACCOUNT_UPDATED', 'CASH_ACCOUNT_DEACTIVATED', 'CASH_ACCOUNT_REACTIVATED',
    'CASH_BALANCE_SNAPSHOT_RECORDED', 'CASH_STATEMENT_IMPORTED', 'CASH_STATEMENT_REJECTED',
    'CASH_TRANSACTION_CREATED', 'CASH_TRANSACTION_UPDATED', 'CASH_TRANSACTION_CORRECTED',
    'CASH_TRANSACTION_REVERSED', 'CASH_TRANSACTION_IGNORED', 'CASH_TRANSACTION_REVIEW_RESTORED',
    'CASH_RECONCILIATION_CONFIRMED', 'CASH_RECONCILIATION_REMOVED', 'CASH_TRANSFER_MATCHED', 'CASH_TRANSFER_REVERSED',
    'CASH_SETTLEMENT_CONFIRMED', 'CASH_SETTLEMENT_REVERSED',
    'ENGINEERING_DOCUMENT_CREATED', 'ENGINEERING_DOCUMENT_UPDATED', 'ENGINEERING_DOCUMENT_ARCHIVED',
    'ENGINEERING_REVISION_UPLOADED', 'ENGINEERING_ANNOTATION_SAVED', 'ENGINEERING_ANNOTATION_DELETED',
    'ENGINEERING_DOCUMENT_DELETED_UNUSED', 'ENGINEERING_DOCUMENT_SUPERSEDED',
    'ENGINEERING_RFI_CREATED', 'ENGINEERING_RFI_OPENED', 'ENGINEERING_RFI_RESPONDED', 'ENGINEERING_RFI_CLOSED', 'ENGINEERING_RFI_VOIDED',
    'ENGINEERING_RFI_DELETED_UNUSED',
    'ENGINEERING_SUBMITTAL_CREATED', 'ENGINEERING_SUBMITTAL_SUBMITTED', 'ENGINEERING_SUBMITTAL_REVIEW_STARTED', 'ENGINEERING_SUBMITTAL_REVIEWED',
    'ENGINEERING_SUBMITTAL_RESUBMITTED', 'ENGINEERING_SUBMITTAL_CLOSED', 'ENGINEERING_SUBMITTAL_VOIDED', 'ENGINEERING_SUBMITTAL_DELETED_UNUSED',
    'ENGINEERING_DAILY_SITE_LOG_CREATED', 'ENGINEERING_DAILY_SITE_LOG_UPDATED', 'ENGINEERING_DAILY_SITE_LOG_SUBMITTED',
    'ENGINEERING_DAILY_SITE_LOG_FINALIZED', 'ENGINEERING_DAILY_SITE_LOG_VOIDED',
    'ENGINEERING_DAILY_SITE_LOG_DELETED_UNUSED', 'ENGINEERING_DAILY_SITE_LOG_ADDENDUM',
    'WORKER_OFFBOARDED', 'WORKER_REACTIVATED', 'WORKER_DELETED_UNUSED',
    'PROJECT_ASSIGNMENT_ENDED', 'PROJECT_ASSIGNMENT_DELETED_UNUSED',
    'COMPENSATION_PROFILE_ENDED', 'COMPENSATION_PROFILE_SUPERSEDED', 'COMPENSATION_PROFILE_DELETED_UNUSED',
    'PAYROLL_COMPONENT_DEACTIVATED', 'PAYROLL_COMPONENT_DELETED_UNUSED',
    'WORK_ENTRY_VOIDED', 'WORK_ENTRY_DELETED_UNUSED', 'ATTENDANCE_VOIDED', 'ATTENDANCE_DELETED_UNUSED',
    'LEAVE_CANCELLED', 'LEAVE_DELETED_UNUSED', 'OVERTIME_CANCELLED', 'OVERTIME_DELETED_UNUSED',
    'PROJECT_DELETED_UNUSED', 'PROJECT_ARCHIVED', 'PROJECT_REACTIVATED',
    'INVOICE_DELETED_UNUSED', 'INVOICE_VOIDED', 'INVOICE_ARCHIVED', 'INVOICE_RESTORED',
    'EXPENSE_DELETED_UNUSED', 'EXPENSE_VOIDED', 'EXPENSE_ARCHIVED', 'EXPENSE_RESTORED',
    'ACCESS_AUTHORIZATION_CREATED', 'ACCESS_AUTHORIZATION_PERMISSIONS_UPDATED', 'ACCESS_AUTHORIZATION_REVOKED', 'ACCESS_AUTHORIZATION_ACCEPTED',
    'MEMBERSHIP_CREATED', 'PERMISSION_OVERRIDES_TRANSFERRED',
    'CLIENT_BILLING_CREATED', 'CLIENT_BILLING_UPDATED', 'CLIENT_BILLING_SUBMITTED',
    'CLIENT_BILLING_RETURNED_TO_DRAFT', 'CLIENT_BILLING_ISSUED', 'CLIENT_BILLING_CANCELLED', 'CLIENT_BILLING_VOIDED',
    'CLIENT_COLLECTION_CREATED', 'CLIENT_COLLECTION_UPDATED', 'CLIENT_COLLECTION_RECORDED', 'CLIENT_COLLECTION_REVERSED',
    'INVENTORY_ITEM_CREATED', 'INVENTORY_ITEM_UPDATED',
    'INVENTORY_MOVEMENT_RECORDED', 'INVENTORY_MOVEMENT_REVERSED'
  ));

-- 2. Permission vocabulary and role defaults. Permission checks remain
-- effective-permission checks; role names never authorize application code.
insert into public.company_permission_catalog (permission_key, description)
values
  ('inventory.read', 'Read company inventory items, balances, and movement history.'),
  ('inventory.manage', 'Manage company inventory items and authoritative stock movements.')
on conflict (permission_key) do update set description = excluded.description;

insert into public.company_role_permissions (role_key, permission_key)
values
  ('COMPANY_ADMIN', 'inventory.read'),
  ('COMPANY_ADMIN', 'inventory.manage'),
  ('FINANCE', 'inventory.read'),
  ('FINANCE', 'inventory.manage'),
  ('VIEWER', 'inventory.read')
on conflict do nothing;

insert into private.company_tenant_policy_catalog (table_name, read_permission, write_permission, allow_insert, allow_update, allow_delete)
values
  ('inventory_items', 'inventory.read', 'inventory.manage', false, false, false),
  ('inventory_movements', 'inventory.read', 'inventory.manage', false, false, false)
on conflict (table_name) do update set
  read_permission = excluded.read_permission,
  write_permission = excluded.write_permission,
  allow_insert = excluded.allow_insert,
  allow_update = excluded.allow_update,
  allow_delete = excluded.allow_delete;

-- 3. Canonical company inventory item master. The functional uniqueness keys
-- reject deterministic duplicate candidates without fuzzy identity merging.
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  item_name text not null check (length(btrim(item_name)) between 1 and 200),
  item_code text check (item_code is null or (item_code = upper(btrim(item_code)) and length(btrim(item_code)) between 1 and 100)),
  category text check (category is null or length(btrim(category)) between 1 and 120),
  stock_unit text not null default 'pcs' check (stock_unit = lower(btrim(stock_unit)) and length(btrim(stock_unit)) between 1 and 50),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_items_company_id_id_key unique (company_id, id)
);

create unique index if not exists inventory_items_company_name_unit_unique
  on public.inventory_items (company_id, lower(btrim(item_name)), lower(btrim(stock_unit)));
create unique index if not exists inventory_items_company_code_unique
  on public.inventory_items (company_id, upper(btrim(item_code)))
  where item_code is not null;
create index if not exists inventory_items_company_status_name_idx
  on public.inventory_items (company_id, status, lower(item_name));

-- 4. Authoritative append-only movement ledger. Quantity is always positive;
-- direction carries the stock effect. A REVERSAL is itself a compensating
-- movement and points to exactly one original movement.
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  inventory_item_id uuid not null,
  movement_type text not null check (movement_type in ('OPENING', 'RECEIPT', 'PROJECT_ISSUE', 'PROJECT_RETURN', 'REVERSAL')),
  direction text not null check (direction in ('IN', 'OUT')),
  quantity numeric(14,4) not null check (quantity > 0),
  stock_unit_snapshot text not null check (stock_unit_snapshot = lower(btrim(stock_unit_snapshot)) and length(btrim(stock_unit_snapshot)) between 1 and 50),
  project_id uuid,
  project_material_id uuid,
  reason text not null check (length(btrim(reason)) between 3 and 500),
  reference text check (reference is null or length(btrim(reference)) between 1 and 200),
  source_type text not null default 'MANUAL' check (source_type in ('MANUAL', 'PURCHASE_ORDER_RECEIPT')),
  purchase_order_receipt_id uuid,
  purchase_order_line_id uuid,
  reversal_of_movement_id uuid,
  idempotency_key text not null check (length(btrim(idempotency_key)) between 1 and 160),
  effective_date date not null default current_date,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint inventory_movements_company_id_id_key unique (company_id, id),
  constraint inventory_movements_item_fk
    foreign key (company_id, inventory_item_id) references public.inventory_items(company_id, id) on delete restrict,
  constraint inventory_movements_project_fk
    foreign key (company_id, project_id) references public.projects(company_id, id) on delete restrict,
  constraint inventory_movements_project_material_fk
    foreign key (company_id, project_material_id) references public.engineering_project_materials(company_id, id) on delete restrict,
  constraint inventory_movements_receipt_line_fk
    foreign key (company_id, purchase_order_receipt_id, purchase_order_line_id)
    references public.purchase_order_receipt_lines(company_id, purchase_order_receipt_id, purchase_order_line_id) on delete restrict,
  constraint inventory_movements_reversal_fk
    foreign key (company_id, reversal_of_movement_id) references public.inventory_movements(company_id, id) on delete restrict,
  constraint inventory_movements_direction_shape_check check (
    (movement_type in ('OPENING', 'RECEIPT', 'PROJECT_RETURN') and direction = 'IN')
    or (movement_type = 'PROJECT_ISSUE' and direction = 'OUT')
    or movement_type = 'REVERSAL'
  ),
  constraint inventory_movements_reversal_shape_check check (
    (movement_type = 'REVERSAL' and reversal_of_movement_id is not null)
    or (movement_type <> 'REVERSAL' and reversal_of_movement_id is null)
  ),
  constraint inventory_movements_source_shape_check check (
    (source_type = 'MANUAL' and purchase_order_receipt_id is null and purchase_order_line_id is null)
    or (source_type = 'PURCHASE_ORDER_RECEIPT' and movement_type = 'RECEIPT' and purchase_order_receipt_id is not null and purchase_order_line_id is not null)
  )
);

create unique index if not exists inventory_movements_company_idempotency_unique
  on public.inventory_movements (company_id, idempotency_key);
create unique index if not exists inventory_movements_company_receipt_line_unique
  on public.inventory_movements (company_id, purchase_order_receipt_id, purchase_order_line_id)
  where source_type = 'PURCHASE_ORDER_RECEIPT';
create unique index if not exists inventory_movements_company_reversal_unique
  on public.inventory_movements (company_id, reversal_of_movement_id)
  where reversal_of_movement_id is not null;
create index if not exists inventory_movements_company_item_history_idx
  on public.inventory_movements (company_id, inventory_item_id, effective_date desc, created_at desc);
create index if not exists inventory_movements_company_project_item_idx
  on public.inventory_movements (company_id, project_id, inventory_item_id, effective_date desc)
  where project_id is not null;
create index if not exists inventory_movements_company_project_material_idx
  on public.inventory_movements (company_id, project_material_id, created_at desc)
  where project_material_id is not null;

-- 5. Project requirements can link to a canonical item, but their planned
-- quantity remains a project requirement and never becomes warehouse stock.
alter table public.engineering_project_materials
  add column if not exists inventory_item_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.engineering_project_materials'::regclass
      and conname = 'engineering_project_materials_inventory_item_fk'
  ) then
    alter table public.engineering_project_materials
      add constraint engineering_project_materials_inventory_item_fk
      foreign key (company_id, inventory_item_id)
      references public.inventory_items(company_id, id) on delete restrict not valid;
  end if;
end $$;
alter table public.engineering_project_materials
  validate constraint engineering_project_materials_inventory_item_fk;

create index if not exists engineering_project_materials_inventory_item_idx
  on public.engineering_project_materials (company_id, inventory_item_id, project_id)
  where inventory_item_id is not null;

-- 6. Server-side item and movement guards. The guards remain active even if a
-- future privileged path is accidentally granted direct table access.
create or replace function private.inventory_actor(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null
     or p_company_id is null
     or p_company_id is distinct from (select private.deployment_company_id())
     or not (select private.has_company_permission(p_company_id, 'inventory.manage')) then
    raise exception 'Inventory management permission is required for this deployment company' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

create or replace function private.inventory_current_on_hand(p_company_id uuid, p_inventory_item_id uuid)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(sum(case when m.direction = 'IN' then m.quantity else -m.quantity end), 0)
  from public.inventory_movements m
  where m.company_id = p_company_id and m.inventory_item_id = p_inventory_item_id;
$$;

create or replace function private.inventory_project_available_to_return(
  p_company_id uuid,
  p_inventory_item_id uuid,
  p_project_id uuid
)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select greatest(
    coalesce(sum(case
      when m.movement_type = 'PROJECT_ISSUE' then m.quantity
      when m.movement_type = 'REVERSAL' and original.movement_type = 'PROJECT_ISSUE' then -m.quantity
      else 0
    end), 0)
    - coalesce(sum(case
      when m.movement_type = 'PROJECT_RETURN' then m.quantity
      when m.movement_type = 'REVERSAL' and original.movement_type = 'PROJECT_RETURN' then -m.quantity
      else 0
    end), 0),
    0
  )
  from public.inventory_movements m
  left join public.inventory_movements original
    on original.company_id = m.company_id and original.id = m.reversal_of_movement_id
  where m.company_id = p_company_id
    and m.inventory_item_id = p_inventory_item_id
    and m.project_id = p_project_id;
$$;

create or replace function private.validate_inventory_item_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_history_count bigint := 0;
begin
  if v_actor is null then
    raise exception 'Authentication is required for inventory item activity' using errcode = '42501';
  end if;
  if new.company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Inventory item must belong to the deployment company' using errcode = '42501';
  end if;
  if not (select private.has_company_permission(new.company_id, 'inventory.manage')) then
    raise exception 'Inventory management permission is required' using errcode = '42501';
  end if;

  new.item_name := btrim(new.item_name);
  new.item_code := nullif(upper(btrim(new.item_code)), '');
  new.category := nullif(btrim(new.category), '');
  new.stock_unit := lower(btrim(new.stock_unit));

  if tg_op = 'INSERT' then
    new.created_by_user_id := v_actor;
    new.updated_by_user_id := v_actor;
    new.created_at := now();
    new.updated_at := now();
    return new;
  end if;

  if new.id is distinct from old.id
     or new.company_id is distinct from old.company_id
     or new.created_by_user_id is distinct from old.created_by_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Inventory item identity and creation provenance are immutable' using errcode = '55000';
  end if;

  select count(*) into v_history_count
  from public.inventory_movements m
  where m.company_id = old.company_id and m.inventory_item_id = old.id;
  if new.stock_unit is distinct from old.stock_unit and (
    v_history_count > 0
    or exists (select 1 from public.engineering_project_materials m where m.company_id = old.company_id and m.inventory_item_id = old.id)
  ) then
    raise exception 'An inventory item stock unit cannot change after movement history or project requirement links exist' using errcode = '55000';
  end if;
  new.updated_by_user_id := v_actor;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.validate_inventory_movement_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_item public.inventory_items;
  v_project_company_id uuid;
  v_project_status text;
  v_material public.engineering_project_materials;
  v_original public.inventory_movements;
  v_receipt_status text;
  v_receipt_quantity numeric;
  v_receipt_unit text;
  v_on_hand numeric;
  v_available_to_return numeric;
  v_expected_direction text;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Inventory movement history is append-only; use a reversal movement for corrections' using errcode = '42501';
  end if;
  if v_actor is null then
    raise exception 'Authentication is required for inventory movement activity' using errcode = '42501';
  end if;
  if new.company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Inventory movement must belong to the deployment company' using errcode = '42501';
  end if;
  if not (select private.has_company_permission(new.company_id, 'inventory.manage')) then
    raise exception 'Inventory management permission is required' using errcode = '42501';
  end if;
  if new.quantity is null or new.quantity <= 0 then
    raise exception 'Inventory movement quantity must be positive' using errcode = '22023';
  end if;

  select i.* into v_item
  from public.inventory_items i
  where i.company_id = new.company_id and i.id = new.inventory_item_id
  for update;
  if not found then
    raise exception 'Inventory item does not exist in the deployment company' using errcode = '23503';
  end if;
  if new.stock_unit_snapshot is distinct from lower(btrim(v_item.stock_unit)) then
    raise exception 'Inventory movement unit must exactly match the canonical item stock unit; no conversion is applied' using errcode = '22023';
  end if;
  if new.movement_type <> 'REVERSAL' and v_item.status <> 'ACTIVE' then
    raise exception 'Inactive inventory items cannot receive new stock activity' using errcode = '42501';
  end if;

  if new.movement_type in ('OPENING', 'RECEIPT', 'PROJECT_RETURN') and new.direction <> 'IN' then
    raise exception 'This inventory movement type must increase warehouse stock' using errcode = '22023';
  elsif new.movement_type = 'PROJECT_ISSUE' and new.direction <> 'OUT' then
    raise exception 'Project issue movements must decrease warehouse stock' using errcode = '22023';
  end if;

  if new.movement_type = 'REVERSAL' then
    select m.* into v_original
    from public.inventory_movements m
    where m.company_id = new.company_id and m.id = new.reversal_of_movement_id
    for update;
    if not found then
      raise exception 'The original inventory movement for this reversal was not found' using errcode = '23503';
    end if;
    if v_original.movement_type = 'REVERSAL' then
      raise exception 'A reversal cannot itself be reversed' using errcode = '42501';
    end if;
    v_expected_direction := case when v_original.direction = 'IN' then 'OUT' else 'IN' end;
    if new.inventory_item_id is distinct from v_original.inventory_item_id
       or new.quantity is distinct from v_original.quantity
       or new.direction is distinct from v_expected_direction
       or new.stock_unit_snapshot is distinct from v_original.stock_unit_snapshot
       or new.project_id is distinct from v_original.project_id
       or new.project_material_id is distinct from v_original.project_material_id
       or new.source_type <> 'MANUAL'
       or new.purchase_order_receipt_id is not null
       or new.purchase_order_line_id is not null then
      raise exception 'Inventory reversal must be a compensating movement for the exact original event' using errcode = '42501';
    end if;
    if v_original.movement_type = 'PROJECT_ISSUE' then
      v_available_to_return := private.inventory_project_available_to_return(new.company_id, new.inventory_item_id, new.project_id);
      if v_available_to_return < new.quantity then
        raise exception 'Reverse project returns before reversing the original project issue; issued provenance would otherwise become negative' using errcode = '23514';
      end if;
    end if;
  else
    if new.reversal_of_movement_id is not null then
      raise exception 'Only REVERSAL movements may reference an original movement' using errcode = '22023';
    end if;
  end if;

  if new.movement_type in ('PROJECT_ISSUE', 'PROJECT_RETURN') then
    if new.project_id is null then
      raise exception 'Project issue and return movements require a project' using errcode = '22023';
    end if;
    select p.company_id, p.status into v_project_company_id, v_project_status
    from public.projects p
    where p.id = new.project_id;
    if v_project_company_id is null or v_project_company_id is distinct from new.company_id then
      raise exception 'Inventory project activity must reference a project in the same company' using errcode = '42501';
    end if;
    if v_project_status = 'ARCHIVED' then
      raise exception 'Archived projects cannot receive new inventory issue or return activity' using errcode = '42501';
    end if;
  elsif new.movement_type in ('OPENING', 'RECEIPT') and new.project_id is not null then
    raise exception 'Warehouse opening and receipt movements cannot be assigned to a project' using errcode = '22023';
  end if;

  if new.project_material_id is not null then
    select m.* into v_material
    from public.engineering_project_materials m
    where m.company_id = new.company_id and m.id = new.project_material_id;
    if not found then
      raise exception 'The selected project material requirement is unavailable in this company' using errcode = '23503';
    end if;
    if new.movement_type not in ('PROJECT_ISSUE', 'PROJECT_RETURN', 'REVERSAL')
       or v_material.project_id is distinct from new.project_id
       or v_material.inventory_item_id is distinct from new.inventory_item_id
       or lower(btrim(v_material.unit)) is distinct from lower(btrim(v_item.stock_unit)) then
      raise exception 'Project material linkage must match the same project, canonical item, and exact unit' using errcode = '42501';
    end if;
  end if;

  if new.source_type = 'PURCHASE_ORDER_RECEIPT' then
    if not (select private.has_company_permission(new.company_id, 'procurement.read')) then
      raise exception 'Procurement read permission is required to use purchase receipt provenance' using errcode = '42501';
    end if;
    if new.movement_type <> 'RECEIPT' or new.project_id is not null then
      raise exception 'Procurement provenance is available only for a warehouse RECEIPT' using errcode = '22023';
    end if;
    select r.status, l.received_quantity, lower(btrim(pol.unit))
      into v_receipt_status, v_receipt_quantity, v_receipt_unit
    from public.purchase_order_receipt_lines l
    join public.purchase_order_receipts r
      on r.company_id = l.company_id and r.id = l.purchase_order_receipt_id
    join public.purchase_order_lines pol
      on pol.company_id = l.company_id and pol.id = l.purchase_order_line_id
    where l.company_id = new.company_id
      and l.purchase_order_receipt_id = new.purchase_order_receipt_id
      and l.purchase_order_line_id = new.purchase_order_line_id;
    if v_receipt_status is null then
      raise exception 'The selected procurement receipt line is unavailable in this company' using errcode = '23503';
    end if;
    if v_receipt_status <> 'RECEIVED' then
      raise exception 'Only a non-voided procurement receipt line may be received into warehouse stock' using errcode = '42501';
    end if;
    if new.quantity is distinct from v_receipt_quantity then
      raise exception 'Warehouse receipt quantity must exactly equal the selected procurement receipt line quantity' using errcode = '22023';
    end if;
    if v_receipt_unit is distinct from lower(btrim(v_item.stock_unit)) then
      raise exception 'Procurement receipt unit is incompatible with the canonical inventory item; resolve the item manually' using errcode = '22023';
    end if;
  elsif new.source_type = 'MANUAL' then
    if new.purchase_order_receipt_id is not null or new.purchase_order_line_id is not null then
      raise exception 'Manual inventory movements cannot carry procurement receipt provenance' using errcode = '22023';
    end if;
  else
    raise exception 'Inventory movement source type is invalid' using errcode = '22023';
  end if;

  -- The item row lock makes this balance check safe against concurrent issue,
  -- return, receipt reversal, and correction attempts.
  v_on_hand := private.inventory_current_on_hand(new.company_id, new.inventory_item_id);
  if new.direction = 'OUT' and v_on_hand < new.quantity then
    raise exception 'Insufficient warehouse stock; the authoritative on-hand balance would become negative' using errcode = '23514';
  end if;
  if new.movement_type = 'PROJECT_RETURN' then
    v_available_to_return := private.inventory_project_available_to_return(new.company_id, new.inventory_item_id, new.project_id);
    if v_available_to_return < new.quantity then
      raise exception 'Project return exceeds valid issued quantity that has not already been returned' using errcode = '23514';
    end if;
  end if;

  new.created_by_user_id := v_actor;
  new.created_at := now();
  return new;
end;
$$;

create or replace function private.prevent_inventory_item_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.inventory_movements m
    where m.company_id = old.company_id and m.inventory_item_id = old.id
  ) then
    raise exception 'Inventory items with movement history cannot be deleted; mark the item INACTIVE instead' using errcode = '55000';
  end if;
  raise exception 'Inventory items are lifecycle-managed; mark an unused item INACTIVE instead of deleting it' using errcode = '42501';
end;
$$;

revoke all on function private.inventory_actor(uuid) from public, anon, authenticated;
revoke all on function private.inventory_current_on_hand(uuid, uuid) from public, anon, authenticated;
revoke all on function private.inventory_project_available_to_return(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.validate_inventory_item_scope() from public, anon, authenticated;
revoke all on function private.validate_inventory_movement_scope() from public, anon, authenticated;
revoke all on function private.prevent_inventory_item_delete() from public, anon, authenticated;

drop trigger if exists inventory_items_company_boundary on public.inventory_items;
create trigger inventory_items_company_boundary
  before insert or update on public.inventory_items
  for each row execute function private.enforce_company_row_boundary();
drop trigger if exists inventory_items_scope_guard on public.inventory_items;
create trigger inventory_items_scope_guard
  before insert or update on public.inventory_items
  for each row execute function private.validate_inventory_item_scope();
drop trigger if exists inventory_items_delete_guard on public.inventory_items;
create trigger inventory_items_delete_guard
  before delete on public.inventory_items
  for each row execute function private.prevent_inventory_item_delete();

drop trigger if exists inventory_movements_company_boundary on public.inventory_movements;
create trigger inventory_movements_company_boundary
  before insert on public.inventory_movements
  for each row execute function private.enforce_company_row_boundary();
drop trigger if exists inventory_movements_scope_guard on public.inventory_movements;
create trigger inventory_movements_scope_guard
  before insert or update or delete on public.inventory_movements
  for each row execute function private.validate_inventory_movement_scope();

-- 7. RLS and Data API grants. All mutations use guarded RPCs; direct table
-- mutation is intentionally unavailable to anon and authenticated callers.
alter table public.inventory_items enable row level security;
alter table public.inventory_movements enable row level security;

revoke all on table public.inventory_items, public.inventory_movements from public, anon, authenticated;
grant select on table public.inventory_items, public.inventory_movements to authenticated;

drop policy if exists inventory_items_company_select on public.inventory_items;
create policy inventory_items_company_select on public.inventory_items
  for select to authenticated
  using ((select public.has_company_permission(company_id, 'inventory.read')));

drop policy if exists inventory_movements_company_select on public.inventory_movements;
create policy inventory_movements_company_select on public.inventory_movements
  for select to authenticated
  using ((select public.has_company_permission(company_id, 'inventory.read')));

-- 8. Item and movement RPCs. The authenticated actor and deployment company
-- are derived server-side. Every consequential movement carries an idempotency
-- key and is committed under the canonical item row lock.
create or replace function public.save_inventory_item(p_item jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := (select private.resolve_transition_company());
  v_actor uuid;
  v_id uuid := nullif(p_item->>'id', '')::uuid;
  v_name text := nullif(btrim(coalesce(p_item->>'itemName', p_item->>'name', '')), '');
  v_code text := nullif(upper(btrim(coalesce(p_item->>'itemCode', p_item->>'code', ''))), '');
  v_category text := nullif(btrim(coalesce(p_item->>'category', '')), '');
  v_unit text := lower(btrim(coalesce(nullif(p_item->>'stockUnit', ''), nullif(p_item->>'unit', ''), 'pcs')));
  v_status text := upper(btrim(coalesce(nullif(p_item->>'status', ''), 'ACTIVE')));
  v_existing public.inventory_items;
  v_row public.inventory_items;
  v_was_existing boolean := false;
  v_event_type text;
begin
  v_actor := private.inventory_actor(v_company_id);
  if nullif(p_item->>'companyId', '') is not null and (p_item->>'companyId')::uuid is distinct from v_company_id then
    raise exception 'Client company context does not match the deployment company' using errcode = '42501';
  end if;
  if v_name is null or length(v_name) > 200 then
    raise exception 'An inventory item name between 1 and 200 characters is required' using errcode = '22023';
  end if;
  if v_unit = '' or length(v_unit) > 50 then
    raise exception 'A canonical inventory stock unit between 1 and 50 characters is required' using errcode = '22023';
  end if;
  if v_status not in ('ACTIVE', 'INACTIVE') then
    raise exception 'Inventory item status is invalid' using errcode = '22023';
  end if;

  if v_id is not null then
    select i.* into v_existing
    from public.inventory_items i
    where i.id = v_id
    for update;
    if found and v_existing.company_id is distinct from v_company_id then
      raise exception 'Inventory item is outside the deployment company' using errcode = '42501';
    end if;
    v_was_existing := found;
  end if;

  if v_was_existing then
    update public.inventory_items set
      item_name = v_name,
      item_code = v_code,
      category = v_category,
      stock_unit = v_unit,
      status = v_status,
      updated_by_user_id = v_actor,
      updated_at = now()
    where id = v_id and company_id = v_company_id
    returning * into v_row;
    v_event_type := 'INVENTORY_ITEM_UPDATED';
  else
    insert into public.inventory_items(
      id, company_id, item_name, item_code, category, stock_unit, status,
      created_by_user_id, updated_by_user_id
    ) values (
      coalesce(v_id, gen_random_uuid()), v_company_id, v_name, v_code, v_category, v_unit, v_status,
      v_actor, v_actor
    ) returning * into v_row;
    v_event_type := 'INVENTORY_ITEM_CREATED';
  end if;

  perform private.write_company_audit(
    v_company_id,
    v_event_type,
    'inventory_item',
    v_row.id,
    jsonb_build_object('item_name', v_row.item_name, 'item_code', v_row.item_code, 'stock_unit', v_row.stock_unit, 'status', v_row.status)
  );
  return to_jsonb(v_row);
end;
$$;

create or replace function public.record_inventory_movement(p_movement jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := (select private.resolve_transition_company());
  v_actor uuid;
  v_type text := upper(btrim(coalesce(p_movement->>'movementType', p_movement->>'movement_type', '')));
  v_item_id uuid;
  v_project_id uuid := nullif(coalesce(p_movement->>'projectId', p_movement->>'project_id', ''), '')::uuid;
  v_project_material_id uuid := nullif(coalesce(p_movement->>'projectMaterialId', p_movement->>'project_material_id', ''), '')::uuid;
  v_receipt_id uuid := nullif(coalesce(p_movement->>'purchaseOrderReceiptId', p_movement->>'purchase_order_receipt_id', ''), '')::uuid;
  v_purchase_order_line_id uuid := nullif(coalesce(p_movement->>'purchaseOrderLineId', p_movement->>'purchase_order_line_id', ''), '')::uuid;
  v_reversal_id uuid := nullif(coalesce(p_movement->>'reversalOfMovementId', p_movement->>'reversal_of_movement_id', ''), '')::uuid;
  v_idempotency_key text := nullif(btrim(coalesce(p_movement->>'idempotencyKey', p_movement->>'idempotency_key', '')), '');
  v_source_type text := upper(btrim(coalesce(nullif(p_movement->>'sourceType', ''), nullif(p_movement->>'source_type', ''), 'MANUAL')));
  v_reason text := nullif(btrim(coalesce(p_movement->>'reason', '')), '');
  v_reference text := nullif(btrim(coalesce(p_movement->>'reference', '')), '');
  v_effective_date date := coalesce(nullif(coalesce(p_movement->>'effectiveDate', p_movement->>'effective_date', ''), '')::date, current_date);
  v_quantity numeric;
  v_direction text;
  v_unit text;
  v_item public.inventory_items;
  v_original public.inventory_movements;
  v_existing public.inventory_movements;
  v_row public.inventory_movements;
  v_idempotent boolean := false;
begin
  v_actor := private.inventory_actor(v_company_id);
  if nullif(p_movement->>'companyId', '') is not null and (p_movement->>'companyId')::uuid is distinct from v_company_id then
    raise exception 'Client company context does not match the deployment company' using errcode = '42501';
  end if;
  if v_type not in ('OPENING', 'RECEIPT', 'PROJECT_ISSUE', 'PROJECT_RETURN', 'REVERSAL') then
    raise exception 'Inventory movement type is invalid' using errcode = '22023';
  end if;
  if v_idempotency_key is null or length(v_idempotency_key) > 160 then
    raise exception 'An idempotency key is required for every inventory movement' using errcode = '22023';
  end if;

  if v_type = 'REVERSAL' then
    if v_reversal_id is null then
      raise exception 'A reversal requires the original inventory movement' using errcode = '22023';
    end if;
    select m.* into v_original
    from public.inventory_movements m
    where m.id = v_reversal_id
    for update;
    if not found then
      raise exception 'The original inventory movement was not found' using errcode = '23503';
    end if;
    if v_original.company_id is distinct from v_company_id then
      raise exception 'The original inventory movement is outside the deployment company' using errcode = '42501';
    end if;
    if v_original.movement_type = 'REVERSAL' then
      raise exception 'A reversal cannot itself be reversed' using errcode = '42501';
    end if;
    v_item_id := v_original.inventory_item_id;
    v_quantity := v_original.quantity;
    v_direction := case when v_original.direction = 'IN' then 'OUT' else 'IN' end;
    v_project_id := v_original.project_id;
    v_project_material_id := v_original.project_material_id;
    v_source_type := 'MANUAL';
    v_receipt_id := null;
    v_purchase_order_line_id := null;
    if nullif(coalesce(p_movement->>'itemId', p_movement->>'item_id', ''), '') is not null
       and (coalesce(p_movement->>'itemId', p_movement->>'item_id', ''))::uuid is distinct from v_item_id then
      raise exception 'A reversal item must match the original movement' using errcode = '42501';
    end if;
    if nullif(coalesce(p_movement->>'quantity', ''), '') is not null
       and (p_movement->>'quantity')::numeric is distinct from v_quantity then
      raise exception 'A reversal quantity must match the original movement' using errcode = '42501';
    end if;
  else
    v_item_id := nullif(coalesce(p_movement->>'itemId', p_movement->>'item_id', ''), '')::uuid;
    v_quantity := nullif(coalesce(p_movement->>'quantity', ''), '')::numeric;
    v_direction := case when v_type in ('OPENING', 'RECEIPT', 'PROJECT_RETURN') then 'IN' else 'OUT' end;
    if v_item_id is null or v_quantity is null or v_quantity <= 0 then
      raise exception 'A canonical item and positive inventory movement quantity are required' using errcode = '22023';
    end if;
  end if;

  if v_reason is null then
    v_reason := case v_type
      when 'OPENING' then 'Opening stock recorded'
      when 'RECEIPT' then 'Warehouse stock receipt recorded'
      when 'PROJECT_ISSUE' then 'Material issued to project'
      when 'PROJECT_RETURN' then 'Material returned from project'
      else 'Inventory movement reversed'
    end;
  end if;

  -- A committed retry with the same key returns the same movement only when
  -- the request describes the same logical event.
  select m.* into v_existing
  from public.inventory_movements m
  where m.company_id = v_company_id and m.idempotency_key = v_idempotency_key
  for update;
  if found then
    if v_existing.movement_type is distinct from v_type
       or v_existing.inventory_item_id is distinct from v_item_id
       or v_existing.quantity is distinct from v_quantity
       or v_existing.project_id is distinct from v_project_id
       or v_existing.project_material_id is distinct from v_project_material_id
       or v_existing.purchase_order_receipt_id is distinct from v_receipt_id
       or v_existing.purchase_order_line_id is distinct from v_purchase_order_line_id
       or v_existing.reversal_of_movement_id is distinct from v_reversal_id then
      raise exception 'The idempotency key is already bound to a different inventory movement' using errcode = '23505';
    end if;
    return to_jsonb(v_existing);
  end if;

  if v_type = 'REVERSAL' then
    select m.* into v_existing
    from public.inventory_movements m
    where m.company_id = v_company_id and m.reversal_of_movement_id = v_reversal_id
    for update;
    if found then
      raise exception 'The original inventory movement has already been reversed' using errcode = '23505';
    end if;
  end if;
  if v_source_type = 'PURCHASE_ORDER_RECEIPT' then
    select m.* into v_existing
    from public.inventory_movements m
    where m.company_id = v_company_id
      and m.source_type = 'PURCHASE_ORDER_RECEIPT'
      and m.purchase_order_receipt_id = v_receipt_id
      and m.purchase_order_line_id = v_purchase_order_line_id
    for update;
    if found then
      raise exception 'This procurement receipt line has already been posted into warehouse stock' using errcode = '23505';
    end if;
  end if;

  select i.* into v_item
  from public.inventory_items i
  where i.company_id = v_company_id and i.id = v_item_id
  for update;
  if not found then
    raise exception 'Inventory item does not exist in the deployment company' using errcode = '23503';
  end if;
  v_unit := lower(btrim(v_item.stock_unit));

  begin
    insert into public.inventory_movements(
      company_id, inventory_item_id, movement_type, direction, quantity, stock_unit_snapshot,
      project_id, project_material_id, reason, reference, source_type,
      purchase_order_receipt_id, purchase_order_line_id, reversal_of_movement_id,
      idempotency_key, effective_date, created_by_user_id
    ) values (
      v_company_id, v_item_id, v_type, v_direction, v_quantity, v_unit,
      v_project_id, v_project_material_id, v_reason, v_reference, v_source_type,
      v_receipt_id, v_purchase_order_line_id, v_reversal_id,
      v_idempotency_key, v_effective_date, v_actor
    ) returning * into v_row;
  exception when unique_violation then
    -- Resolve a racing retry/provenance submission deterministically instead
    -- of making a second authoritative movement.
    select m.* into v_existing
    from public.inventory_movements m
    where m.company_id = v_company_id and m.idempotency_key = v_idempotency_key
    for update;
    if found then
      if v_existing.movement_type is distinct from v_type
         or v_existing.inventory_item_id is distinct from v_item_id
         or v_existing.quantity is distinct from v_quantity
         or v_existing.project_id is distinct from v_project_id
         or v_existing.project_material_id is distinct from v_project_material_id
         or v_existing.purchase_order_receipt_id is distinct from v_receipt_id
         or v_existing.purchase_order_line_id is distinct from v_purchase_order_line_id
         or v_existing.reversal_of_movement_id is distinct from v_reversal_id then
        raise exception 'The idempotency key is already bound to a different inventory movement' using errcode = '23505';
      end if;
      return to_jsonb(v_existing);
    end if;
    if v_type = 'REVERSAL' and exists (
      select 1 from public.inventory_movements m
      where m.company_id = v_company_id and m.reversal_of_movement_id = v_reversal_id
    ) then
      raise exception 'The original inventory movement has already been reversed' using errcode = '23505';
    end if;
    if v_source_type = 'PURCHASE_ORDER_RECEIPT' and exists (
      select 1 from public.inventory_movements m
      where m.company_id = v_company_id
        and m.source_type = 'PURCHASE_ORDER_RECEIPT'
        and m.purchase_order_receipt_id = v_receipt_id
        and m.purchase_order_line_id = v_purchase_order_line_id
    ) then
      raise exception 'This procurement receipt line has already been posted into warehouse stock' using errcode = '23505';
    end if;
    raise;
  end;

  perform private.write_company_audit(
    v_company_id,
    case when v_type = 'REVERSAL' then 'INVENTORY_MOVEMENT_REVERSED' else 'INVENTORY_MOVEMENT_RECORDED' end,
    'inventory_movement',
    v_row.id,
    jsonb_build_object(
      'movement_type', v_row.movement_type,
      'inventory_item_id', v_row.inventory_item_id,
      'quantity', v_row.quantity,
      'stock_unit', v_row.stock_unit_snapshot,
      'direction', v_row.direction,
      'project_id', v_row.project_id,
      'project_material_id', v_row.project_material_id,
      'source_type', v_row.source_type,
      'purchase_order_receipt_id', v_row.purchase_order_receipt_id,
      'purchase_order_line_id', v_row.purchase_order_line_id,
      'reversal_of_movement_id', v_row.reversal_of_movement_id,
      'reason', v_row.reason
    )
  );
  return to_jsonb(v_row);
end;
$$;

revoke all on function public.save_inventory_item(jsonb) from public, anon, authenticated;
revoke all on function public.record_inventory_movement(jsonb) from public, anon, authenticated;
grant execute on function public.save_inventory_item(jsonb) to authenticated;
grant execute on function public.record_inventory_movement(jsonb) to authenticated;

-- 9. Make the existing project-material RPC carry the optional canonical item
-- link without changing its existing project-register contract.
create or replace function public.save_engineering_project_material(p_material jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := private.resolve_transition_company();
  v_actor uuid;
  v_id uuid := nullif(p_material->>'id', '')::uuid;
  v_project_id uuid := nullif(p_material->>'projectId', '')::uuid;
  v_existing public.engineering_project_materials;
  v_row public.engineering_project_materials;
  v_was_existing boolean := false;
begin
  v_actor := private.field_register_actor(v_company_id);
  if nullif(p_material->>'companyId', '') is not null and (p_material->>'companyId')::uuid is distinct from v_company_id then
    raise exception 'Client company context does not match the deployment company' using errcode = '42501';
  end if;
  if v_id is not null then
    select * into v_existing from public.engineering_project_materials where id = v_id for update;
    if found then
      if v_existing.company_id is distinct from v_company_id then
        raise exception 'Material register record is outside the deployment company' using errcode = '42501';
      end if;
      v_was_existing := true;
    end if;
  end if;
  if v_was_existing then
    update public.engineering_project_materials set
      project_id = v_project_id,
      material_name = btrim(p_material->>'materialName'),
      reference_code = nullif(btrim(p_material->>'referenceCode'), ''),
      category = nullif(btrim(p_material->>'category'), ''),
      unit = btrim(coalesce(nullif(p_material->>'unit', ''), 'pcs')),
      required_quantity = coalesce(nullif(p_material->>'requiredQuantity', '')::numeric, 0),
      project_cost_code_id = nullif(p_material->>'projectCostCodeId', '')::uuid,
      purchase_order_id = nullif(p_material->>'purchaseOrderId', '')::uuid,
      purchase_order_line_id = nullif(p_material->>'purchaseOrderLineId', '')::uuid,
      inventory_item_id = case when p_material ? 'inventoryItemId' then nullif(p_material->>'inventoryItemId', '')::uuid else v_existing.inventory_item_id end,
      status = coalesce(nullif(p_material->>'status', ''), 'ACTIVE'),
      notes = nullif(btrim(p_material->>'notes'), ''),
      updated_by_user_id = v_actor,
      updated_at = now()
    where id = v_id and company_id = v_company_id
    returning * into v_row;
  else
    insert into public.engineering_project_materials(
      id, company_id, project_id, material_name, reference_code, category, unit,
      required_quantity, project_cost_code_id, purchase_order_id, purchase_order_line_id,
      inventory_item_id, status, notes, created_by_user_id, updated_by_user_id
    ) values (
      coalesce(v_id, gen_random_uuid()), v_company_id, v_project_id, btrim(p_material->>'materialName'),
      nullif(btrim(p_material->>'referenceCode'), ''), nullif(btrim(p_material->>'category'), ''),
      btrim(coalesce(nullif(p_material->>'unit', ''), 'pcs')),
      coalesce(nullif(p_material->>'requiredQuantity', '')::numeric, 0),
      nullif(p_material->>'projectCostCodeId', '')::uuid,
      nullif(p_material->>'purchaseOrderId', '')::uuid,
      nullif(p_material->>'purchaseOrderLineId', '')::uuid,
      nullif(p_material->>'inventoryItemId', '')::uuid,
      coalesce(nullif(p_material->>'status', ''), 'ACTIVE'), nullif(btrim(p_material->>'notes'), ''), v_actor, v_actor
    ) returning * into v_row;
  end if;
  return to_jsonb(v_row);
end;
$$;

revoke execute on function public.save_engineering_project_material(jsonb) from public, anon;
grant execute on function public.save_engineering_project_material(jsonb) to authenticated;

create or replace function private.validate_project_material_inventory_link()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item public.inventory_items;
begin
  if new.inventory_item_id is null then return new; end if;
  select i.* into v_item
  from public.inventory_items i
  where i.company_id = new.company_id and i.id = new.inventory_item_id;
  if not found then
    raise exception 'Project material canonical inventory item must belong to the same company' using errcode = '42501';
  end if;
  if lower(btrim(new.unit)) is distinct from lower(btrim(v_item.stock_unit)) then
    raise exception 'Project material unit must exactly match the canonical inventory item stock unit; no conversion is applied' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_project_material_inventory_link() from public, anon, authenticated;
drop trigger if exists engineering_project_materials_inventory_link_scope on public.engineering_project_materials;
create trigger engineering_project_materials_inventory_link_scope
  before insert or update on public.engineering_project_materials
  for each row execute function private.validate_project_material_inventory_link();

-- 10. Read-through views expose derived balance and live procurement-void
-- reconciliation state without creating a competing cached balance.
create or replace view public.inventory_movement_details
with (security_invoker = true)
as
select
  m.*,
  r.status as source_purchase_order_receipt_status,
  r.receipt_number as source_purchase_order_receipt_number,
  r.purchase_order_id as source_purchase_order_id,
  (m.source_type = 'PURCHASE_ORDER_RECEIPT' and r.status = 'VOIDED') as requires_reconciliation
from public.inventory_movements m
left join public.purchase_order_receipts r
  on r.company_id = m.company_id and r.id = m.purchase_order_receipt_id;

create or replace view public.inventory_item_balances
with (security_invoker = true)
as
select
  i.company_id,
  i.id as inventory_item_id,
  i.item_name,
  i.item_code,
  i.category,
  i.stock_unit,
  i.status,
  coalesce(sum(case when m.direction = 'IN' then m.quantity when m.direction = 'OUT' then -m.quantity else 0 end), 0) as on_hand_quantity,
  coalesce(sum(case
    when m.movement_type = 'OPENING' then m.quantity
    when m.movement_type = 'REVERSAL' and original.movement_type = 'OPENING' then -m.quantity
    else 0
  end), 0) as opening_quantity,
  coalesce(sum(case
    when m.movement_type = 'RECEIPT' then m.quantity
    when m.movement_type = 'REVERSAL' and original.movement_type = 'RECEIPT' then -m.quantity
    else 0
  end), 0) as received_quantity,
  coalesce(sum(case
    when m.movement_type = 'PROJECT_ISSUE' then m.quantity
    when m.movement_type = 'REVERSAL' and original.movement_type = 'PROJECT_ISSUE' then -m.quantity
    else 0
  end), 0) as issued_quantity,
  coalesce(sum(case
    when m.movement_type = 'PROJECT_RETURN' then m.quantity
    when m.movement_type = 'REVERSAL' and original.movement_type = 'PROJECT_RETURN' then -m.quantity
    else 0
  end), 0) as returned_quantity,
  count(m.id)::bigint as movement_count,
  max(m.created_at) as latest_movement_at,
  (array_agg(m.effective_date order by m.created_at desc, m.id desc) filter (where m.id is not null))[1] as latest_effective_date,
  (array_agg(m.movement_type order by m.created_at desc, m.id desc) filter (where m.id is not null))[1] as latest_movement_type
from public.inventory_items i
left join public.inventory_movements m
  on m.company_id = i.company_id and m.inventory_item_id = i.id
left join public.inventory_movements original
  on original.company_id = m.company_id and original.id = m.reversal_of_movement_id
group by i.company_id, i.id, i.item_name, i.item_code, i.category, i.stock_unit, i.status;

revoke all on public.inventory_movement_details, public.inventory_item_balances from public, anon, authenticated;
grant select on public.inventory_movement_details, public.inventory_item_balances to authenticated;

-- 11. Inventory movement history is also a project lifecycle dependency. The
-- existing base preflight remains authoritative for all prior domains.
create or replace function private.project_lifecycle_preflight(
  p_project_id uuid,
  p_company_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base jsonb;
  v_materials bigint := 0;
  v_equipment bigint := 0;
  v_inventory_movements bigint := 0;
  v_base_total bigint := 0;
  v_total bigint := 0;
  v_base_can_delete boolean := false;
  v_can_delete boolean := false;
  v_action text;
  v_reason text;
begin
  v_base := private.project_lifecycle_preflight_base(p_project_id, p_company_id);
  select count(*) into v_materials from public.engineering_project_materials m
  where m.company_id = p_company_id and m.project_id = p_project_id;
  select count(*) into v_equipment from public.engineering_project_equipment e
  where e.company_id = p_company_id and e.project_id = p_project_id;
  select count(*) into v_inventory_movements from public.inventory_movements m
  where m.company_id = p_company_id and m.project_id = p_project_id;
  v_base_total := coalesce((v_base->>'totalDependencyCount')::bigint, 0);
  v_base_can_delete := coalesce((v_base->>'canDelete')::boolean, false);
  v_total := v_base_total + v_materials + v_equipment + v_inventory_movements;
  v_can_delete := v_base_can_delete and v_materials = 0 and v_equipment = 0 and v_inventory_movements = 0;
  v_action := case
    when v_can_delete then 'DELETE_UNUSED'
    when coalesce((v_base->>'canReactivate')::boolean, false) then 'REACTIVATE'
    else 'ARCHIVE'
  end;
  v_reason := case
    when v_can_delete then null
    when v_base_can_delete and (v_materials > 0 or v_equipment > 0 or v_inventory_movements > 0) then 'This project has Materials, Equipment, or Inventory movement history and cannot be permanently deleted. Archive it instead.'
    else v_base->>'blockedReason'
  end;
  v_base := jsonb_set(v_base, '{dependencies,projectMaterials}', to_jsonb(v_materials), true);
  v_base := jsonb_set(v_base, '{dependencies,projectEquipment}', to_jsonb(v_equipment), true);
  v_base := jsonb_set(v_base, '{dependencies,inventoryMovements}', to_jsonb(v_inventory_movements), true);
  v_base := jsonb_set(v_base, '{totalDependencyCount}', to_jsonb(v_total), true);
  v_base := jsonb_set(v_base, '{canDelete}', to_jsonb(v_can_delete), true);
  v_base := jsonb_set(v_base, '{recommendedAction}', to_jsonb(v_action), true);
  v_base := jsonb_set(v_base, '{blockedReason}', coalesce(to_jsonb(v_reason), 'null'::jsonb), true);
  return v_base;
end;
$$;
revoke all on function private.project_lifecycle_preflight(uuid, uuid) from public, anon, authenticated;
