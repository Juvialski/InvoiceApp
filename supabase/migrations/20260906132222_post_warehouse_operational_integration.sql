-- HydroQualiSense post-Warehouse operational integration.
--
-- This migration keeps the existing supplier invoice, Expense, procurement,
-- Warehouse, and project-equipment records as the source of truth. It adds
-- only the missing reconciliation/authority boundaries and preserves all
-- prior history.

-- ============================================================================
-- P0. Supplier invoice allocation -> linked Expense projection
-- ============================================================================

-- Company is part of every cross-domain relationship. These composite
-- references make a forged same-UUID/different-company link impossible even
-- when an older client bypasses an application helper.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.invoice_project_allocations'::regclass
      and conname = 'invoice_project_allocations_company_invoice_fk'
  ) then
    alter table public.invoice_project_allocations
      add constraint invoice_project_allocations_company_invoice_fk
      foreign key (company_id, invoice_id)
      references public.invoices(company_id, id)
      on delete cascade;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.invoice_project_allocations'::regclass
      and conname = 'invoice_project_allocations_company_project_fk'
  ) then
    alter table public.invoice_project_allocations
      add constraint invoice_project_allocations_company_project_fk
      foreign key (company_id, project_id)
      references public.projects(company_id, id)
      on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.expenses'::regclass
      and conname = 'expenses_company_project_fk'
  ) then
    alter table public.expenses
      add constraint expenses_company_project_fk
      foreign key (company_id, project_id)
      references public.projects(company_id, id)
      on delete restrict;
  end if;
end $$;

-- The established Expense correction trigger protects approved/paid supplier
-- history. Allocation projection is a narrower database-internal metadata
-- reconciliation and must be allowed to change only project convenience fields
-- while the transaction-local flag is set by the private sync function.
create or replace function private.guard_expense_correction_edit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_changed boolean;
begin
  if current_setting('app.supplier_expense_projection_sync', true) = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if current_user not in ('postgres', 'service_role')
       and (new.status = 'VOID' or new.archived_at is not null or new.voided_at is not null or new.voided_by_user_id is not null or new.void_reason is not null) then
      raise exception 'Create an expense in an active status; use the expense correction workflow for lifecycle changes' using errcode = '42501';
    end if;
    if new.supplier_invoice_id is not null and current_user not in ('postgres', 'service_role') then
      raise exception 'Supplier-derived Expenses must be created by the guarded supplier verification workflow' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.archived_at is distinct from old.archived_at
     or new.voided_at is distinct from old.voided_at
     or new.voided_by_user_id is distinct from old.voided_by_user_id
     or new.void_reason is distinct from old.void_reason
     or (new.status is distinct from old.status and (new.status = 'VOID' or old.status = 'VOID')) then
    if current_user not in ('postgres', 'service_role') then
      raise exception 'Use the Expense correction workflow for void, archive, or restore actions' using errcode = '42501';
    end if;
  end if;
  v_business_changed := new.project_id is distinct from old.project_id
    or new.project_cost_code_id is distinct from old.project_cost_code_id
    or new.expense_date is distinct from old.expense_date
    or new.category is distinct from old.category
    or new.description is distinct from old.description
    or new.payee is distinct from old.payee
    or new.amount is distinct from old.amount
    or new.currency is distinct from old.currency
    or new.payment_method is distinct from old.payment_method
    or new.reference_number is distinct from old.reference_number
    or new.receipt_source_document_id is distinct from old.receipt_source_document_id
    or new.supplier_invoice_id is distinct from old.supplier_invoice_id
    or new.vendor_id is distinct from old.vendor_id
    or new.purchase_order_id is distinct from old.purchase_order_id
    or new.notes is distinct from old.notes;
  if old.supplier_invoice_id is null and new.supplier_invoice_id is not null and current_user not in ('postgres', 'service_role') then
    raise exception 'Supplier invoice linkage is owned by the guarded verification workflow' using errcode = '42501';
  end if;
  if old.supplier_invoice_id is not null and v_business_changed then
    raise exception 'Supplier-derived Expense financial and provenance fields are immutable; void and create a deliberate correction instead' using errcode = '42501';
  end if;
  if current_user in ('postgres', 'service_role') then return new; end if;
  if old.status = 'PAID' and (new.status is distinct from old.status or v_business_changed) then raise exception 'Paid Expenses are immutable; use the Expense correction workflow for an auditable correction' using errcode = '42501'; end if;
  if old.status = 'APPROVED' and (new.status not in ('APPROVED', 'PAID') or v_business_changed) then raise exception 'Approved Expenses must use the Expense correction workflow for an auditable correction' using errcode = '42501'; end if;
  if old.status = 'VOID' and v_business_changed then raise exception 'Voided Expenses are immutable; original values and history must remain preserved' using errcode = '42501'; end if;
  return new;
end;
$$;
revoke execute on function private.guard_expense_correction_edit() from public, anon, authenticated;

-- ============================================================================
-- P2. Company Equipment authority and auditable assignment history
-- ============================================================================

insert into public.company_permission_catalog(permission_key, description)
values
  ('equipment.read', 'Read the company Equipment Registry and assignment history.'),
  ('equipment.manage', 'Create and manage canonical Equipment and Project assignments.')
on conflict (permission_key) do update set description = excluded.description;

-- Existing operational roles retain read-through visibility; only the company
-- administrator receives the new mutation authority until a later scoped-role
-- design explicitly broadens it.
insert into public.company_role_permissions(role_key, permission_key)
values
  ('COMPANY_ADMIN', 'equipment.read'),
  ('COMPANY_ADMIN', 'equipment.manage'),
  ('FINANCE', 'equipment.read'),
  ('VIEWER', 'equipment.read')
on conflict do nothing;

insert into private.company_tenant_policy_catalog(table_name, read_permission, write_permission, allow_insert, allow_update, allow_delete)
values
  ('engineering_equipment_registry', 'equipment.read', 'equipment.manage', false, false, false),
  ('engineering_equipment_assignments', 'equipment.read', 'equipment.manage', false, false, false),
  ('engineering_equipment_events', 'equipment.read', 'equipment.manage', false, false, false)
on conflict (table_name) do update set
  read_permission = excluded.read_permission,
  write_permission = excluded.write_permission,
  allow_insert = excluded.allow_insert,
  allow_update = excluded.allow_update,
  allow_delete = excluded.allow_delete;

create table if not exists public.engineering_equipment_registry (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  asset_reference text check (asset_reference is null or length(btrim(asset_reference)) between 1 and 120),
  equipment_name text not null check (length(btrim(equipment_name)) between 1 and 180),
  equipment_type text check (equipment_type is null or length(btrim(equipment_type)) <= 120),
  equipment_source text not null default 'OTHER' check (equipment_source in ('OWNED', 'RENTED', 'SUBCONTRACTOR', 'OTHER')),
  provider_name text check (provider_name is null or length(btrim(provider_name)) <= 180),
  lifecycle_status text not null default 'AVAILABLE' check (lifecycle_status in ('AVAILABLE', 'MAINTENANCE', 'OUT_OF_SERVICE', 'RETIRED')),
  notes text check (notes is null or length(notes) <= 2000),
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engineering_equipment_registry_company_id_id_key unique(company_id, id)
);

create unique index if not exists engineering_equipment_registry_company_asset_unique
  on public.engineering_equipment_registry(company_id, lower(btrim(asset_reference)))
  where asset_reference is not null;
create index if not exists engineering_equipment_registry_company_status_name_idx
  on public.engineering_equipment_registry(company_id, lifecycle_status, lower(equipment_name));

create table if not exists public.engineering_equipment_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  equipment_id uuid not null,
  project_id uuid not null,
  assignment_start date not null default current_date,
  assignment_end date,
  assigned_by_user_id uuid references auth.users(id) on delete set null,
  returned_by_user_id uuid references auth.users(id) on delete set null,
  notes text check (notes is null or length(notes) <= 2000),
  transfer_from_assignment_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engineering_equipment_assignments_company_id_id_key unique(company_id, id),
  constraint engineering_equipment_assignments_dates_check check (assignment_end is null or assignment_end >= assignment_start),
  constraint engineering_equipment_assignments_equipment_fk
    foreign key(company_id, equipment_id) references public.engineering_equipment_registry(company_id, id) on delete restrict,
  constraint engineering_equipment_assignments_project_fk
    foreign key(company_id, project_id) references public.projects(company_id, id) on delete restrict,
  constraint engineering_equipment_assignments_transfer_fk
    foreign key(company_id, transfer_from_assignment_id) references public.engineering_equipment_assignments(company_id, id) on delete restrict
);

create unique index if not exists engineering_equipment_assignments_one_active_idx
  on public.engineering_equipment_assignments(company_id, equipment_id)
  where assignment_end is null;
create index if not exists engineering_equipment_assignments_company_project_idx
  on public.engineering_equipment_assignments(company_id, project_id, assignment_start desc);
create index if not exists engineering_equipment_assignments_company_equipment_history_idx
  on public.engineering_equipment_assignments(company_id, equipment_id, assignment_start desc, created_at desc);

create table if not exists public.engineering_equipment_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  equipment_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('CREATED', 'UPDATED', 'ASSIGNED', 'TRANSFERRED', 'RETURNED', 'LIFECYCLE_CHANGED', 'LEGACY_LINKED')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint engineering_equipment_events_company_id_id_key unique(company_id, id),
  constraint engineering_equipment_events_equipment_fk
    foreign key(company_id, equipment_id) references public.engineering_equipment_registry(company_id, id) on delete restrict
);
create index if not exists engineering_equipment_events_company_equipment_idx
  on public.engineering_equipment_events(company_id, equipment_id, created_at desc);

-- Preserve the existing project register and field-observation foreign keys;
-- this link is only a deterministic bridge to the canonical company asset.
alter table public.engineering_project_equipment
  add column if not exists canonical_equipment_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.engineering_project_equipment'::regclass
      and conname = 'engineering_project_equipment_canonical_equipment_fk'
  ) then
    alter table public.engineering_project_equipment
      add constraint engineering_project_equipment_canonical_equipment_fk
      foreign key(company_id, canonical_equipment_id)
      references public.engineering_equipment_registry(company_id, id)
      on delete restrict;
  end if;
end $$;

create index if not exists engineering_project_equipment_canonical_equipment_idx
  on public.engineering_project_equipment(company_id, canonical_equipment_id)
  where canonical_equipment_id is not null;

-- Only a unique, non-empty legacy asset reference is deterministic enough to
-- become a canonical identity. Duplicate/missing references remain visible in
-- the existing project register and require human resolution.
insert into public.engineering_equipment_registry(
  id, company_id, asset_reference, equipment_name, equipment_type, equipment_source,
  provider_name, lifecycle_status, notes, created_by_user_id, updated_by_user_id,
  created_at, updated_at
)
select
  e.id,
  e.company_id,
  upper(btrim(e.asset_reference)),
  e.equipment_name,
  e.equipment_type,
  e.equipment_source,
  e.provider_name,
  case
    when e.status = 'OUT_OF_SERVICE' then 'OUT_OF_SERVICE'
    when e.status = 'INACTIVE' then 'OUT_OF_SERVICE'
    else 'AVAILABLE'
  end,
  concat_ws(E'\n', nullif(e.notes, ''), 'Migrated from the project Equipment Register; canonical identity is keyed by the deterministic asset reference.'),
  e.created_by_user_id,
  e.updated_by_user_id,
  coalesce(e.created_at, now()),
  coalesce(e.updated_at, now())
from public.engineering_project_equipment e
where e.asset_reference is not null
  and length(btrim(e.asset_reference)) > 0
  and not exists (
    select 1 from public.engineering_project_equipment duplicate
    where duplicate.company_id = e.company_id
      and duplicate.asset_reference is not null
      and lower(btrim(duplicate.asset_reference)) = lower(btrim(e.asset_reference))
      and duplicate.id <> e.id
  )
on conflict (id) do nothing;

update public.engineering_project_equipment legacy
set canonical_equipment_id = registry.id
from public.engineering_equipment_registry registry
where legacy.company_id = registry.company_id
  and legacy.id = registry.id
  and legacy.canonical_equipment_id is null;

-- Existing ACTIVE project rows with a still-open assignment become assignment
-- history. Closed/returned/ambiguous legacy rows are not guessed into a new
-- active assignment.
insert into public.engineering_equipment_assignments(
  company_id, equipment_id, project_id, assignment_start, assignment_end,
  assigned_by_user_id, notes, created_at, updated_at
)
select
  legacy.company_id,
  legacy.canonical_equipment_id,
  legacy.project_id,
  coalesce(legacy.assignment_start, current_date),
  null,
  coalesce(legacy.updated_by_user_id, legacy.created_by_user_id),
  'Migrated from an active project Equipment Register row; field observations remain evidence only.',
  coalesce(legacy.created_at, now()),
  coalesce(legacy.updated_at, now())
from public.engineering_project_equipment legacy
where legacy.canonical_equipment_id is not null
  and legacy.status = 'ACTIVE'
  and legacy.assignment_end is null
  and not exists (
    select 1 from public.engineering_equipment_assignments existing
    where existing.company_id = legacy.company_id
      and existing.equipment_id = legacy.canonical_equipment_id
      and existing.assignment_end is null
  );

create or replace view public.engineering_equipment_current
with (security_invoker = true)
as
select
  registry.id,
  registry.company_id,
  registry.asset_reference,
  registry.equipment_name,
  registry.equipment_type,
  registry.equipment_source,
  registry.provider_name,
  registry.lifecycle_status,
  case when assignment.id is not null then 'ASSIGNED' else registry.lifecycle_status end as current_state,
  assignment.id as current_assignment_id,
  assignment.project_id as current_project_id,
  assignment.assignment_start as current_assignment_start,
  registry.notes,
  registry.created_by_user_id,
  registry.updated_by_user_id,
  registry.created_at,
  registry.updated_at
from public.engineering_equipment_registry registry
left join public.engineering_equipment_assignments assignment
  on assignment.company_id = registry.company_id
 and assignment.equipment_id = registry.id
 and assignment.assignment_end is null;

revoke all on public.engineering_equipment_current from public, anon, authenticated;
grant select on public.engineering_equipment_current to authenticated;

alter table public.engineering_equipment_registry enable row level security;
alter table public.engineering_equipment_assignments enable row level security;
alter table public.engineering_equipment_events enable row level security;
revoke all on public.engineering_equipment_registry, public.engineering_equipment_assignments, public.engineering_equipment_events from public, anon, authenticated;
grant select on public.engineering_equipment_registry, public.engineering_equipment_assignments, public.engineering_equipment_events to authenticated;

drop policy if exists engineering_equipment_registry_read on public.engineering_equipment_registry;
create policy engineering_equipment_registry_read on public.engineering_equipment_registry
for select to authenticated using ((select public.has_company_permission(company_id, 'equipment.read')));
drop policy if exists engineering_equipment_assignments_read on public.engineering_equipment_assignments;
create policy engineering_equipment_assignments_read on public.engineering_equipment_assignments
for select to authenticated using ((select public.has_company_permission(company_id, 'equipment.read')));
drop policy if exists engineering_equipment_events_read on public.engineering_equipment_events;
create policy engineering_equipment_events_read on public.engineering_equipment_events
for select to authenticated using ((select public.has_company_permission(company_id, 'equipment.read')));

create or replace function private.validate_engineering_equipment_registry_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or new.company_id is distinct from (select private.deployment_company_id())
     or not (select private.has_company_permission(new.company_id, 'equipment.manage')) then
    raise exception 'Equipment management permission is required for this deployment company' using errcode = '42501';
  end if;
  new.asset_reference := nullif(upper(btrim(new.asset_reference)), '');
  new.equipment_name := btrim(new.equipment_name);
  new.equipment_type := nullif(btrim(new.equipment_type), '');
  new.equipment_source := upper(coalesce(nullif(btrim(new.equipment_source), ''), 'OTHER'));
  new.provider_name := nullif(btrim(new.provider_name), '');
  new.notes := nullif(btrim(new.notes), '');
  if tg_op = 'INSERT' then
    new.lifecycle_status := 'AVAILABLE';
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
    raise exception 'Canonical Equipment identity and creation provenance are immutable' using errcode = '55000';
  end if;
  if new.lifecycle_status is distinct from old.lifecycle_status
     and coalesce(current_setting('app.equipment_lifecycle_transition', true), '') <> 'on' then
    raise exception 'Equipment lifecycle changes require the guarded lifecycle operation' using errcode = '42501';
  end if;
  new.updated_by_user_id := v_actor;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.validate_engineering_equipment_registry_scope() from public, anon, authenticated;

create or replace function private.validate_engineering_equipment_assignment_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_equipment_company_id uuid;
  v_equipment_status text;
  v_project_company_id uuid;
  v_project_status text;
begin
  if v_actor is null or new.company_id is distinct from (select private.deployment_company_id())
     or not (select private.has_company_permission(new.company_id, 'equipment.manage')) then
    raise exception 'Equipment assignment management permission is required' using errcode = '42501';
  end if;
  select company_id, lifecycle_status into v_equipment_company_id, v_equipment_status
  from public.engineering_equipment_registry where id = new.equipment_id;
  if v_equipment_company_id is null or v_equipment_company_id is distinct from new.company_id then
    raise exception 'Equipment assignment is outside the company' using errcode = '42501';
  end if;
  select company_id, status into v_project_company_id, v_project_status
  from public.projects where id = new.project_id;
  if v_project_company_id is null or v_project_company_id is distinct from new.company_id then
    raise exception 'Equipment assignment project is outside the company' using errcode = '42501';
  end if;
  if v_project_status = 'ARCHIVED' then
    raise exception 'Archived projects cannot receive Equipment assignments' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    if v_equipment_status <> 'AVAILABLE' then
      raise exception 'Only AVAILABLE Equipment can receive a new assignment' using errcode = '42501';
    end if;
    new.assigned_by_user_id := coalesce(new.assigned_by_user_id, v_actor);
    return new;
  end if;
  if coalesce(current_setting('app.equipment_assignment_transition', true), '') <> 'on'
     or old.id is distinct from new.id
     or old.company_id is distinct from new.company_id
     or old.equipment_id is distinct from new.equipment_id
     or old.project_id is distinct from new.project_id
     or old.assignment_start is distinct from new.assignment_start
     or old.assigned_by_user_id is distinct from new.assigned_by_user_id
     or old.created_at is distinct from new.created_at then
    raise exception 'Equipment assignment history is immutable; use return or transfer' using errcode = '42501';
  end if;
  if old.assignment_end is not null then
    raise exception 'Equipment assignment is already closed' using errcode = '42501';
  end if;
  new.returned_by_user_id := coalesce(new.returned_by_user_id, v_actor);
  return new;
end;
$$;

revoke all on function private.validate_engineering_equipment_assignment_scope() from public, anon, authenticated;

drop trigger if exists engineering_equipment_registry_company_boundary on public.engineering_equipment_registry;
create trigger engineering_equipment_registry_company_boundary before insert or update on public.engineering_equipment_registry
for each row execute function private.enforce_company_row_boundary();
drop trigger if exists engineering_equipment_registry_scope on public.engineering_equipment_registry;
create trigger engineering_equipment_registry_scope before insert or update on public.engineering_equipment_registry
for each row execute function private.validate_engineering_equipment_registry_scope();
drop trigger if exists engineering_equipment_assignments_company_boundary on public.engineering_equipment_assignments;
create trigger engineering_equipment_assignments_company_boundary before insert or update on public.engineering_equipment_assignments
for each row execute function private.enforce_company_row_boundary();
drop trigger if exists engineering_equipment_assignments_scope on public.engineering_equipment_assignments;
create trigger engineering_equipment_assignments_scope before insert or update on public.engineering_equipment_assignments
for each row execute function private.validate_engineering_equipment_assignment_scope();
drop trigger if exists engineering_equipment_assignments_updated_at on public.engineering_equipment_assignments;
create trigger engineering_equipment_assignments_updated_at before update on public.engineering_equipment_assignments
for each row execute function private.set_company_updated_at();
drop trigger if exists engineering_equipment_events_company_boundary on public.engineering_equipment_events;
create trigger engineering_equipment_events_company_boundary before insert on public.engineering_equipment_events
for each row execute function private.enforce_company_row_boundary();

create or replace function public.save_engineering_equipment(p_equipment jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := (select private.resolve_transition_company());
  v_actor uuid := (select auth.uid());
  v_id uuid := nullif(p_equipment->>'id', '')::uuid;
  v_existing public.engineering_equipment_registry;
  v_row public.engineering_equipment_registry;
  v_name text := btrim(coalesce(p_equipment->>'equipmentName', ''));
  v_status text := upper(coalesce(nullif(p_equipment->>'lifecycleStatus', ''), 'AVAILABLE'));
begin
  if v_actor is null or not (select private.has_company_permission(v_company_id, 'equipment.manage')) then
    raise exception 'Equipment management permission is required' using errcode = '42501';
  end if;
  if nullif(p_equipment->>'companyId', '') is not null and (p_equipment->>'companyId')::uuid is distinct from v_company_id then
    raise exception 'Equipment company context does not match the deployment company' using errcode = '42501';
  end if;
  if v_name = '' then raise exception 'Equipment name is required' using errcode = '22023'; end if;
  if v_id is not null then
    select * into v_existing from public.engineering_equipment_registry where id = v_id for update;
    if found and v_existing.company_id is distinct from v_company_id then
      raise exception 'Equipment is outside the deployment company' using errcode = '42501';
    end if;
  end if;
  if v_existing.id is not null then
    if v_status is distinct from v_existing.lifecycle_status then
      raise exception 'Use the guarded Equipment lifecycle operation to change availability state' using errcode = '42501';
    end if;
    update public.engineering_equipment_registry set
      asset_reference = nullif(upper(btrim(p_equipment->>'assetReference')), ''),
      equipment_name = v_name,
      equipment_type = nullif(btrim(p_equipment->>'equipmentType'), ''),
      equipment_source = upper(coalesce(nullif(btrim(p_equipment->>'equipmentSource'), ''), v_existing.equipment_source)),
      provider_name = nullif(btrim(p_equipment->>'providerName'), ''),
      notes = nullif(btrim(p_equipment->>'notes'), '')
    where id = v_id and company_id = v_company_id returning * into v_row;
    insert into public.engineering_equipment_events(company_id, equipment_id, actor_user_id, event_type, metadata)
    values (v_company_id, v_row.id, v_actor, 'UPDATED', jsonb_build_object('source', 'equipment_registry'));
  else
    if v_status <> 'AVAILABLE' then raise exception 'New Equipment must begin AVAILABLE' using errcode = '22023'; end if;
    insert into public.engineering_equipment_registry(
      id, company_id, asset_reference, equipment_name, equipment_type, equipment_source,
      provider_name, lifecycle_status, notes, created_by_user_id, updated_by_user_id
    ) values (
      coalesce(v_id, gen_random_uuid()), v_company_id,
      nullif(upper(btrim(p_equipment->>'assetReference')), ''), v_name,
      nullif(btrim(p_equipment->>'equipmentType'), ''),
      upper(coalesce(nullif(btrim(p_equipment->>'equipmentSource'), ''), 'OTHER')),
      nullif(btrim(p_equipment->>'providerName'), ''), 'AVAILABLE',
      nullif(btrim(p_equipment->>'notes'), ''), v_actor, v_actor
    ) returning * into v_row;
    insert into public.engineering_equipment_events(company_id, equipment_id, actor_user_id, event_type, metadata)
    values (v_company_id, v_row.id, v_actor, 'CREATED', jsonb_build_object('source', 'equipment_registry'));
  end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.assign_engineering_equipment(
  p_equipment_id uuid,
  p_project_id uuid,
  p_assignment_start date default current_date,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := (select private.resolve_transition_company());
  v_actor uuid := (select auth.uid());
  v_equipment public.engineering_equipment_registry;
  v_active public.engineering_equipment_assignments;
  v_assignment public.engineering_equipment_assignments;
  v_project_status text;
begin
  if v_actor is null or not (select private.has_company_permission(v_company_id, 'equipment.manage')) then raise exception 'Equipment management permission is required' using errcode = '42501'; end if;
  if p_equipment_id is null or p_project_id is null then raise exception 'Equipment and project are required' using errcode = '22023'; end if;
  select * into v_equipment from public.engineering_equipment_registry where id = p_equipment_id and company_id = v_company_id for update;
  if not found then raise exception 'Equipment is unavailable in the deployment company' using errcode = '42501'; end if;
  select p.status into v_project_status from public.projects p where p.id = p_project_id and p.company_id = v_company_id for update;
  if v_project_status is null then raise exception 'Project is unavailable in the deployment company' using errcode = '42501'; end if;
  if v_project_status = 'ARCHIVED' then raise exception 'Archived projects cannot receive Equipment assignments' using errcode = '42501'; end if;
  select * into v_active from public.engineering_equipment_assignments a where a.company_id = v_company_id and a.equipment_id = p_equipment_id and a.assignment_end is null for update;
  if found then
    if v_active.project_id = p_project_id and v_active.assignment_start = coalesce(p_assignment_start, current_date) then
      return jsonb_build_object('equipment', to_jsonb(v_equipment), 'assignment', to_jsonb(v_active), 'idempotent', true);
    end if;
    raise exception 'Equipment already has an active Project assignment' using errcode = '23505';
  end if;
  if v_equipment.lifecycle_status <> 'AVAILABLE' then raise exception 'Equipment is not available for assignment in its current lifecycle state' using errcode = '42501'; end if;
  insert into public.engineering_equipment_assignments(company_id, equipment_id, project_id, assignment_start, assigned_by_user_id, notes)
  values (v_company_id, p_equipment_id, p_project_id, coalesce(p_assignment_start, current_date), v_actor, nullif(btrim(p_notes), '')) returning * into v_assignment;
  insert into public.engineering_equipment_events(company_id, equipment_id, actor_user_id, event_type, metadata)
  values (v_company_id, p_equipment_id, v_actor, 'ASSIGNED', jsonb_build_object('assignmentId', v_assignment.id, 'projectId', p_project_id));
  return jsonb_build_object('equipment', to_jsonb(v_equipment), 'assignment', to_jsonb(v_assignment), 'idempotent', false);
end;
$$;

create or replace function public.transfer_engineering_equipment(
  p_equipment_id uuid,
  p_project_id uuid,
  p_assignment_start date default current_date,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := (select private.resolve_transition_company());
  v_actor uuid := (select auth.uid());
  v_equipment public.engineering_equipment_registry;
  v_active public.engineering_equipment_assignments;
  v_assignment public.engineering_equipment_assignments;
  v_project_status text;
  v_start date := coalesce(p_assignment_start, current_date);
begin
  if v_actor is null or not (select private.has_company_permission(v_company_id, 'equipment.manage')) then raise exception 'Equipment management permission is required' using errcode = '42501'; end if;
  select * into v_equipment from public.engineering_equipment_registry where id = p_equipment_id and company_id = v_company_id for update;
  if not found then raise exception 'Equipment is unavailable in the deployment company' using errcode = '42501'; end if;
  select p.status into v_project_status from public.projects p where p.id = p_project_id and p.company_id = v_company_id for update;
  if v_project_status is null or v_project_status = 'ARCHIVED' then raise exception 'Transfer target Project is unavailable or archived' using errcode = '42501'; end if;
  select * into v_active from public.engineering_equipment_assignments a where a.company_id = v_company_id and a.equipment_id = p_equipment_id and a.assignment_end is null for update;
  if not found then raise exception 'Equipment has no active assignment to transfer' using errcode = '22023'; end if;
  if v_active.project_id = p_project_id and v_active.assignment_start = v_start then
    return jsonb_build_object('equipment', to_jsonb(v_equipment), 'assignment', to_jsonb(v_active), 'idempotent', true);
  end if;
  if v_start < v_active.assignment_start then raise exception 'Transfer date cannot precede the active assignment start' using errcode = '22023'; end if;
  perform set_config('app.equipment_assignment_transition', 'on', true);
  update public.engineering_equipment_assignments
  set assignment_end = v_start, returned_by_user_id = v_actor, notes = concat_ws(E'\n', notes, nullif(btrim(p_notes), ''))
  where id = v_active.id and company_id = v_company_id;
  insert into public.engineering_equipment_assignments(company_id, equipment_id, project_id, assignment_start, assigned_by_user_id, notes, transfer_from_assignment_id)
  values (v_company_id, p_equipment_id, p_project_id, v_start, v_actor, nullif(btrim(p_notes), ''), v_active.id) returning * into v_assignment;
  insert into public.engineering_equipment_events(company_id, equipment_id, actor_user_id, event_type, metadata)
  values (v_company_id, p_equipment_id, v_actor, 'TRANSFERRED', jsonb_build_object('fromAssignmentId', v_active.id, 'assignmentId', v_assignment.id, 'fromProjectId', v_active.project_id, 'projectId', p_project_id));
  return jsonb_build_object('equipment', to_jsonb(v_equipment), 'assignment', to_jsonb(v_assignment), 'idempotent', false);
end;
$$;

create or replace function public.return_engineering_equipment(
  p_equipment_id uuid,
  p_assignment_end date default current_date,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := (select private.resolve_transition_company());
  v_actor uuid := (select auth.uid());
  v_equipment public.engineering_equipment_registry;
  v_active public.engineering_equipment_assignments;
  v_end date := coalesce(p_assignment_end, current_date);
begin
  if v_actor is null or not (select private.has_company_permission(v_company_id, 'equipment.manage')) then raise exception 'Equipment management permission is required' using errcode = '42501'; end if;
  select * into v_equipment from public.engineering_equipment_registry where id = p_equipment_id and company_id = v_company_id for update;
  if not found then raise exception 'Equipment is unavailable in the deployment company' using errcode = '42501'; end if;
  select * into v_active from public.engineering_equipment_assignments a where a.company_id = v_company_id and a.equipment_id = p_equipment_id and a.assignment_end is null for update;
  if not found then return jsonb_build_object('equipment', to_jsonb(v_equipment), 'assignment', null, 'idempotent', true); end if;
  if v_end < v_active.assignment_start then raise exception 'Return date cannot precede the active assignment start' using errcode = '22023'; end if;
  perform set_config('app.equipment_assignment_transition', 'on', true);
  update public.engineering_equipment_assignments
  set assignment_end = v_end, returned_by_user_id = v_actor, notes = concat_ws(E'\n', notes, nullif(btrim(p_notes), ''))
  where id = v_active.id and company_id = v_company_id;
  insert into public.engineering_equipment_events(company_id, equipment_id, actor_user_id, event_type, metadata)
  values (v_company_id, p_equipment_id, v_actor, 'RETURNED', jsonb_build_object('assignmentId', v_active.id, 'projectId', v_active.project_id));
  return jsonb_build_object('equipment', to_jsonb(v_equipment), 'assignment', null, 'idempotent', false);
end;
$$;

create or replace function public.set_engineering_equipment_lifecycle(
  p_equipment_id uuid,
  p_lifecycle_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := (select private.resolve_transition_company());
  v_actor uuid := (select auth.uid());
  v_equipment public.engineering_equipment_registry;
  v_active public.engineering_equipment_assignments;
  v_previous_status text;
  v_status text := upper(btrim(coalesce(p_lifecycle_status, '')));
begin
  if v_actor is null or not (select private.has_company_permission(v_company_id, 'equipment.manage')) then raise exception 'Equipment management permission is required' using errcode = '42501'; end if;
  if v_status not in ('AVAILABLE', 'MAINTENANCE', 'OUT_OF_SERVICE', 'RETIRED') then raise exception 'Equipment lifecycle state is invalid' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'A lifecycle reason is required' using errcode = '22023'; end if;
  select * into v_equipment from public.engineering_equipment_registry where id = p_equipment_id and company_id = v_company_id for update;
  if not found then raise exception 'Equipment is unavailable in the deployment company' using errcode = '42501'; end if;
  v_previous_status := v_equipment.lifecycle_status;
  select * into v_active from public.engineering_equipment_assignments a where a.company_id = v_company_id and a.equipment_id = p_equipment_id and a.assignment_end is null for update;
  if v_status = 'AVAILABLE' and found then raise exception 'Return or transfer the active assignment before making Equipment AVAILABLE' using errcode = '42501'; end if;
  if v_equipment.lifecycle_status = v_status and not found then return jsonb_build_object('equipment', to_jsonb(v_equipment), 'idempotent', true); end if;
  if found then
    perform set_config('app.equipment_assignment_transition', 'on', true);
    update public.engineering_equipment_assignments
    set assignment_end = current_date, returned_by_user_id = v_actor, notes = concat_ws(E'\n', notes, btrim(p_reason))
    where id = v_active.id and company_id = v_company_id;
  end if;
  perform set_config('app.equipment_lifecycle_transition', 'on', true);
  update public.engineering_equipment_registry
  set lifecycle_status = v_status, notes = concat_ws(E'\n', notes, btrim(p_reason)), updated_by_user_id = v_actor, updated_at = now()
  where id = p_equipment_id and company_id = v_company_id returning * into v_equipment;
  insert into public.engineering_equipment_events(company_id, equipment_id, actor_user_id, event_type, metadata)
  values (v_company_id, p_equipment_id, v_actor, 'LIFECYCLE_CHANGED', jsonb_build_object('from', v_previous_status, 'to', v_status, 'reason', btrim(p_reason), 'closedAssignmentId', case when v_active.id is null then null else v_active.id end));
  return jsonb_build_object('equipment', to_jsonb(v_equipment), 'idempotent', false);
end;
$$;

revoke all on function public.save_engineering_equipment(jsonb) from public, anon;
revoke all on function public.assign_engineering_equipment(uuid, uuid, date, text) from public, anon;
revoke all on function public.transfer_engineering_equipment(uuid, uuid, date, text) from public, anon;
revoke all on function public.return_engineering_equipment(uuid, date, text) from public, anon;
revoke all on function public.set_engineering_equipment_lifecycle(uuid, text, text) from public, anon;
grant execute on function public.save_engineering_equipment(jsonb) to authenticated;
grant execute on function public.assign_engineering_equipment(uuid, uuid, date, text) to authenticated;
grant execute on function public.transfer_engineering_equipment(uuid, uuid, date, text) to authenticated;
grant execute on function public.return_engineering_equipment(uuid, date, text) to authenticated;
grant execute on function public.set_engineering_equipment_lifecycle(uuid, text, text) to authenticated;

-- The registry and assignment tables are read-only through the Data API. All
-- writes, including assignment closure, pass the guarded operations above.

-- ============================================================================
-- P1. Reviewed purchased-material evidence -> existing Procurement receipts
-- ============================================================================

-- A source document can support a financial supplier invoice, delivery
-- evidence, or both. The relationship is provenance only; it does not post
-- stock or create an Expense by itself.
alter table public.purchase_order_receipts
  add column if not exists source_document_id uuid,
  add column if not exists source_invoice_id uuid;
alter table public.purchase_order_receipt_lines
  add column if not exists inventory_item_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.source_documents'::regclass
      and conname = 'source_documents_company_id_id_key'
  ) then
    alter table public.source_documents
      add constraint source_documents_company_id_id_key unique (company_id, id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.purchase_order_receipts'::regclass
      and conname = 'purchase_order_receipts_source_document_fk'
  ) then
    alter table public.purchase_order_receipts
      add constraint purchase_order_receipts_source_document_fk
      foreign key (company_id, source_document_id)
      references public.source_documents(company_id, id)
      on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.purchase_order_receipts'::regclass
      and conname = 'purchase_order_receipts_source_invoice_fk'
  ) then
    alter table public.purchase_order_receipts
      add constraint purchase_order_receipts_source_invoice_fk
      foreign key (company_id, source_invoice_id)
      references public.invoices(company_id, id)
      on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.purchase_order_receipt_lines'::regclass
      and conname = 'purchase_order_receipt_lines_inventory_item_fk'
  ) then
    alter table public.purchase_order_receipt_lines
      add constraint purchase_order_receipt_lines_inventory_item_fk
      foreign key (company_id, inventory_item_id)
      references public.inventory_items(company_id, id)
      on delete restrict;
  end if;
end $$;

create index if not exists purchase_order_receipts_company_source_invoice_idx
  on public.purchase_order_receipts(company_id, source_invoice_id)
  where source_invoice_id is not null;
create index if not exists purchase_order_receipts_company_source_document_idx
  on public.purchase_order_receipts(company_id, source_document_id)
  where source_document_id is not null;

create or replace function private.validate_purchase_order_receipt_source_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice_source_document_id uuid;
begin
  if new.source_invoice_id is not null then
    select i.source_document_id into v_invoice_source_document_id
    from public.invoices i
    where i.company_id = new.company_id and i.id = new.source_invoice_id;
    if not found then
      raise exception 'Purchase order receipt source invoice is outside the company' using errcode = '42501';
    end if;
    if new.source_document_id is not null
       and v_invoice_source_document_id is not null
       and new.source_document_id is distinct from v_invoice_source_document_id then
      raise exception 'Purchase order receipt source document does not match the source invoice' using errcode = '42501';
    end if;
  end if;
  if new.source_document_id is not null
     and not exists (
       select 1 from public.source_documents d
       where d.company_id = new.company_id and d.id = new.source_document_id
     ) then
    raise exception 'Purchase order receipt source document is outside the company' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_purchase_order_receipt_source_scope() from public, anon, authenticated;

drop trigger if exists purchase_order_receipts_source_scope on public.purchase_order_receipts;
create trigger purchase_order_receipts_source_scope
before insert or update on public.purchase_order_receipts
for each row execute function private.validate_purchase_order_receipt_source_scope();

create or replace function private.validate_purchase_order_receipt_line_inventory_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item_company_id uuid;
  v_item_unit text;
  v_receipt_company_id uuid;
  v_po_line_unit text;
begin
  if new.inventory_item_id is null then return new; end if;
  select i.company_id, lower(btrim(i.stock_unit)) into v_item_company_id, v_item_unit
  from public.inventory_items i
  where i.id = new.inventory_item_id;
  if v_item_company_id is null or v_item_company_id is distinct from new.company_id then
    raise exception 'Receipt line canonical Inventory Item is outside the company' using errcode = '42501';
  end if;
  select r.company_id, lower(btrim(pol.unit)) into v_receipt_company_id, v_po_line_unit
  from public.purchase_order_receipts r
  join public.purchase_order_lines pol on pol.company_id = r.company_id and pol.id = new.purchase_order_line_id
  where r.company_id = new.company_id and r.id = new.purchase_order_receipt_id;
  if v_receipt_company_id is null or v_po_line_unit is null or v_item_unit is distinct from v_po_line_unit then
    raise exception 'Receipt line canonical Inventory Item must use the exact Purchase Order unit; no conversion is applied' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_purchase_order_receipt_line_inventory_scope() from public, anon, authenticated;
drop trigger if exists purchase_order_receipt_lines_inventory_item_scope on public.purchase_order_receipt_lines;
create trigger purchase_order_receipt_lines_inventory_item_scope
before insert on public.purchase_order_receipt_lines
for each row execute function private.validate_purchase_order_receipt_line_inventory_scope();

-- The existing receipt RPC remains the only way to create receipt history. This
-- replacement adds source provenance and makes a caller-supplied receipt id a
-- safe retry key; it never changes committed quantities or resurrects a voided
-- receipt.
create or replace function public.record_purchase_order_receipt(
  p_receipt jsonb,
  p_lines jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid := nullif(p_receipt->>'companyId', '')::uuid;
  v_po_id uuid := nullif(p_receipt->>'purchaseOrderId', '')::uuid;
  v_receipt_number text := upper(btrim(p_receipt->>'receiptNumber'));
  v_receipt_date date := coalesce(nullif(p_receipt->>'receiptDate', '')::date, current_date);
  v_supplier_ref text := nullif(btrim(p_receipt->>'supplierDeliveryReference'), '');
  v_notes text := nullif(btrim(p_receipt->>'notes'), '');
  v_source_document_id uuid := nullif(p_receipt->>'sourceDocumentId', '')::uuid;
  v_source_invoice_id uuid := nullif(p_receipt->>'sourceInvoiceId', '')::uuid;
  v_receipt_id uuid := nullif(p_receipt->>'id', '')::uuid;
  v_po_status text;
  v_existing public.purchase_order_receipts;
  v_line_row jsonb;
  v_line_idx integer := 0;
  v_line_id uuid;
  v_po_line_id uuid;
  v_qty numeric(14,4);
  v_line_notes text;
  v_inventory_item_id uuid;
  v_res_receipt jsonb;
  v_res_lines jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to record receipts' using errcode = '42501';
  end if;
  if v_company_id is null or v_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Receipt company must match the deployment company' using errcode = '42501';
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

  -- Lock the PO before checking its status and before checking line quantity.
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

  if v_receipt_id is not null then
    select * into v_existing
    from public.purchase_order_receipts r
    where r.id = v_receipt_id and r.company_id = v_company_id
    for update;
    if found then
      if v_existing.purchase_order_id is distinct from v_po_id
         or v_existing.receipt_number is distinct from v_receipt_number
         or v_existing.source_document_id is distinct from v_source_document_id
         or v_existing.source_invoice_id is distinct from v_source_invoice_id then
        raise exception 'Receipt retry id is already bound to different provenance' using errcode = '23514';
      end if;
      if v_existing.status <> 'RECEIVED' then
        raise exception 'The receipt retry id belongs to a voided receipt and cannot be reused' using errcode = '42501';
      end if;
      select to_jsonb(r) into v_res_receipt
      from public.purchase_order_receipts r where r.id = v_receipt_id and r.company_id = v_company_id;
      select coalesce(jsonb_agg(to_jsonb(l) order by l.line_number asc), '[]'::jsonb) into v_res_lines
      from public.purchase_order_receipt_lines l where l.purchase_order_receipt_id = v_receipt_id and l.company_id = v_company_id;
      return jsonb_build_object('receipt', v_res_receipt, 'lines', v_res_lines, 'idempotent', true);
    end if;
  else
    v_receipt_id := gen_random_uuid();
  end if;

  insert into public.purchase_order_receipts (
    id, company_id, purchase_order_id, receipt_number, receipt_date,
    supplier_delivery_reference, notes, source_document_id, source_invoice_id,
    status, created_by_user_id, updated_by_user_id
  ) values (
    v_receipt_id, v_company_id, v_po_id, v_receipt_number, v_receipt_date,
    v_supplier_ref, v_notes, v_source_document_id, v_source_invoice_id,
    'RECEIVED', v_user_id, v_user_id
  );

  for v_line_row in select value from jsonb_array_elements(p_lines) loop
    v_qty := coalesce((v_line_row->>'receivedQuantity')::numeric, 0);
    if v_qty <= 0 then continue; end if;
    v_line_idx := v_line_idx + 1;
    v_line_id := nullif(v_line_row->>'id', '')::uuid;
    if v_line_id is null then v_line_id := gen_random_uuid(); end if;
    v_po_line_id := nullif(v_line_row->>'purchaseOrderLineId', '')::uuid;
    v_line_notes := nullif(btrim(v_line_row->>'notes'), '');
    v_inventory_item_id := nullif(v_line_row->>'inventoryItemId', '')::uuid;
    insert into public.purchase_order_receipt_lines (
      id, company_id, purchase_order_receipt_id, purchase_order_line_id,
      inventory_item_id, line_number, received_quantity, notes
    ) values (
      v_line_id, v_company_id, v_receipt_id, v_po_line_id,
      v_inventory_item_id, v_line_idx, v_qty, v_line_notes
    );
  end loop;
  if v_line_idx = 0 then
    raise exception 'Receipt must contain at least one positive received quantity' using errcode = '22023';
  end if;

  select to_jsonb(r) into v_res_receipt
  from public.purchase_order_receipts r where r.id = v_receipt_id and r.company_id = v_company_id;
  select coalesce(jsonb_agg(to_jsonb(l) order by l.line_number asc), '[]'::jsonb) into v_res_lines
  from public.purchase_order_receipt_lines l where l.purchase_order_receipt_id = v_receipt_id and l.company_id = v_company_id;
  return jsonb_build_object('receipt', v_res_receipt, 'lines', v_res_lines, 'idempotent', false);
end;
$$;

revoke all on function public.record_purchase_order_receipt(jsonb, jsonb) from public, anon;
grant execute on function public.record_purchase_order_receipt(jsonb, jsonb) to authenticated;

create index if not exists invoice_project_allocations_company_invoice_amount_idx
  on public.invoice_project_allocations(company_id, invoice_id, allocation_amount)
  where allocation_amount is not null;

-- A percentage allocation is materialized to allocation_amount by the guarded
-- replacement RPC. The fallback keeps older/directly-created percentage rows
-- from being misclassified while retaining the invoice's original currency.
create or replace function private.supplier_invoice_project_projection(
  p_company_id uuid,
  p_invoice_id uuid
)
returns table(project_id uuid, project_cost_code_id uuid, positive_allocation_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  with candidates as (
    select
      a.project_id,
      a.project_cost_code_id,
      case
        when a.allocation_type = 'PERCENTAGE'
          then round(coalesce(i.grand_total, 0) * coalesce(a.allocation_percentage, 0) / 100, 2)
        else coalesce(a.allocation_amount, 0)
      end as effective_amount
    from public.invoice_project_allocations a
    join public.invoices i
      on i.company_id = p_company_id
     and i.id = p_invoice_id
     and i.company_id = a.company_id
     and i.id = a.invoice_id
    where a.company_id = p_company_id
      and a.invoice_id = p_invoice_id
  ), positive as (
    select * from candidates where effective_amount > 0
  )
  select
    case when count(*) = 1 then (array_agg(project_id))[1] else null end,
    case when count(*) = 1 then (array_agg(project_cost_code_id))[1] else null end,
    count(*)::integer
  from positive;
$$;

revoke all on function private.supplier_invoice_project_projection(uuid, uuid) from public, anon, authenticated;

-- Supplier-derived Expense.project_id is a convenience projection only. Any
-- direct attempt to make it disagree with canonical invoice allocations fails;
-- the allocation reconciliation trigger sets a transaction-local internal flag
-- for its own atomic projection update.
create or replace function private.enforce_supplier_expense_project_projection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_projection record;
  v_internal boolean := coalesce(current_setting('app.supplier_expense_projection_sync', true), '') = 'on';
begin
  if new.supplier_invoice_id is null then
    return new;
  end if;

  select * into v_projection
  from private.supplier_invoice_project_projection(new.company_id, new.supplier_invoice_id);

  if not v_internal and (
    new.project_id is distinct from case when v_projection.positive_allocation_count = 1 then v_projection.project_id else null end
    or new.project_cost_code_id is distinct from case when v_projection.positive_allocation_count = 1 then v_projection.project_cost_code_id else null end
  ) then
    raise exception 'Supplier-derived Expense project attribution is controlled by invoice_project_allocations; change the canonical invoice allocation instead'
      using errcode = '42501';
  end if;

  new.project_id := case when v_projection.positive_allocation_count = 1 then v_projection.project_id else null end;
  new.project_cost_code_id := case when v_projection.positive_allocation_count = 1 then v_projection.project_cost_code_id else null end;
  return new;
end;
$$;

revoke all on function private.enforce_supplier_expense_project_projection() from public, anon, authenticated;

-- Reconcile every active linked Expense and the durable invoice convenience
-- pointer in the same transaction as an allocation insert/update/delete.
create or replace function private.reconcile_supplier_expense_project_projection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := case when tg_op = 'DELETE' then old.company_id else new.company_id end;
  v_invoice_id uuid := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
  v_expense_id uuid;
  v_projection record;
begin
  perform 1
  from public.invoices i
  where i.company_id = v_company_id and i.id = v_invoice_id
  for update;

  select * into v_projection
  from private.supplier_invoice_project_projection(v_company_id, v_invoice_id);

  for v_expense_id in
    select e.id
    from public.expenses e
    where e.company_id = v_company_id
      and e.supplier_invoice_id = v_invoice_id
      and e.status <> 'VOID'
    order by e.id
    for update
  loop
    perform set_config('app.supplier_expense_projection_sync', 'on', true);
    update public.expenses
    set project_id = case when v_projection.positive_allocation_count = 1 then v_projection.project_id else null end,
        project_cost_code_id = case when v_projection.positive_allocation_count = 1 then v_projection.project_cost_code_id else null end
    where id = v_expense_id and company_id = v_company_id;
  end loop;
  perform set_config('app.supplier_expense_projection_sync', '', true);

  select e.id into v_expense_id
  from public.expenses e
  where e.company_id = v_company_id
    and e.supplier_invoice_id = v_invoice_id
    and e.status <> 'VOID'
  order by e.created_at asc, e.id asc
  limit 1;

  update public.invoices i
  set current_data = case
        when v_expense_id is null then coalesce(i.current_data, '{}'::jsonb) - 'linkedExpenseId'
        else jsonb_set(coalesce(i.current_data, '{}'::jsonb), '{linkedExpenseId}', to_jsonb(v_expense_id), true)
      end,
      updated_at = now()
  where i.company_id = v_company_id
    and i.id = v_invoice_id
    and i.current_data->>'linkedExpenseId' is distinct from v_expense_id::text;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.reconcile_supplier_expense_project_projection() from public, anon, authenticated;

drop trigger if exists expenses_supplier_project_projection on public.expenses;
create trigger expenses_supplier_project_projection
before insert or update on public.expenses
for each row execute function private.enforce_supplier_expense_project_projection();

drop trigger if exists invoice_project_allocations_supplier_expense_sync on public.invoice_project_allocations;
create trigger invoice_project_allocations_supplier_expense_sync
after insert or update or delete on public.invoice_project_allocations
for each row execute function private.reconcile_supplier_expense_project_projection();

-- Deterministic forward repair. A split allocation deliberately produces NULL
-- on the Expense convenience field; the canonical allocation rows remain the
-- complete financial ownership history. No amount, status, or source history
-- is rewritten.
do $$
declare
  v_expense record;
  v_projection record;
  v_linked_expense uuid;
begin
  perform set_config('app.supplier_expense_projection_sync', 'on', true);
  for v_expense in
    select e.id, e.company_id, e.supplier_invoice_id
    from public.expenses e
    where e.supplier_invoice_id is not null
      and e.status <> 'VOID'
    order by e.company_id, e.id
  loop
    select * into v_projection
    from private.supplier_invoice_project_projection(v_expense.company_id, v_expense.supplier_invoice_id);
    update public.expenses
    set project_id = case when v_projection.positive_allocation_count = 1 then v_projection.project_id else null end,
        project_cost_code_id = case when v_projection.positive_allocation_count = 1 then v_projection.project_cost_code_id else null end
    where id = v_expense.id and company_id = v_expense.company_id;
  end loop;
  perform set_config('app.supplier_expense_projection_sync', '', true);

  for v_expense in
    select i.id, i.company_id
    from public.invoices i
    where (i.current_data ? 'linkedExpenseId')
       or exists (
         select 1 from public.expenses e
         where e.company_id = i.company_id
           and e.supplier_invoice_id = i.id
           and e.status <> 'VOID'
       )
  loop
    select e.id into v_linked_expense
    from public.expenses e
    where e.company_id = v_expense.company_id
      and e.supplier_invoice_id = v_expense.id
      and e.status <> 'VOID'
    order by e.created_at asc, e.id asc
    limit 1;
    update public.invoices
    set current_data = case
          when v_linked_expense is null then coalesce(current_data, '{}'::jsonb) - 'linkedExpenseId'
          else jsonb_set(coalesce(current_data, '{}'::jsonb), '{linkedExpenseId}', to_jsonb(v_linked_expense), true)
        end,
        updated_at = now()
    where id = v_expense.id and company_id = v_expense.company_id
      and current_data->>'linkedExpenseId' is distinct from v_linked_expense::text;
  end loop;
end $$;

-- A reviewed Procurement receipt line may carry a human-confirmed canonical
-- item. Warehouse posting must use that same item; legacy receipt lines with
-- no match remain eligible only for an explicit exact-unit human selection.
create or replace function private.validate_inventory_movement_receipt_item_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt_item_id uuid;
begin
  if new.source_type <> 'PURCHASE_ORDER_RECEIPT' then return new; end if;
  select l.inventory_item_id into v_receipt_item_id
  from public.purchase_order_receipt_lines l
  where l.company_id = new.company_id
    and l.purchase_order_receipt_id = new.purchase_order_receipt_id
    and l.purchase_order_line_id = new.purchase_order_line_id;
  if v_receipt_item_id is not null and v_receipt_item_id is distinct from new.inventory_item_id then
    raise exception 'Warehouse movement must use the canonical Inventory Item confirmed on the Procurement receipt line' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_inventory_movement_receipt_item_scope() from public, anon, authenticated;
drop trigger if exists inventory_movements_receipt_item_scope on public.inventory_movements;
create trigger inventory_movements_receipt_item_scope
before insert on public.inventory_movements
for each row execute function private.validate_inventory_movement_receipt_item_scope();
