-- ============================================================================
-- P3B + P3C Materials, Equipment & Enhanced Daily Site Operations
--
-- Registers remain current project metadata. Daily Site Log children remain
-- immutable operational observations after submission/finalization. Procurement
-- receipts remain the only formal received-quantity source.
-- ============================================================================

-- Tenant-safe composite FK targets used by this wave. The source tables already
-- have globally unique primary keys; these keys make company ownership part of
-- the database-enforced relationship as well.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.projects'::regclass
      and conname = 'projects_company_id_id_key'
  ) then
    alter table public.projects add constraint projects_company_id_id_key unique (company_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.purchase_order_lines'::regclass
      and conname = 'purchase_order_lines_company_id_id_key'
  ) then
    alter table public.purchase_order_lines add constraint purchase_order_lines_company_id_id_key unique (company_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.engineering_daily_site_logs'::regclass
      and conname = 'engineering_daily_site_logs_company_id_id_key'
  ) then
    alter table public.engineering_daily_site_logs add constraint engineering_daily_site_logs_company_id_id_key unique (company_id, id);
  end if;
end $$;

-- Keep the append-only audit allowlist aligned with current main. Register
-- provenance is carried by server-derived row attribution and existing audit
-- boundaries; this wave does not invent new audit event types.
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
    'CLIENT_COLLECTION_CREATED', 'CLIENT_COLLECTION_UPDATED', 'CLIENT_COLLECTION_RECORDED', 'CLIENT_COLLECTION_REVERSED'
  ));

-- 1. Current project registers.
create table if not exists public.engineering_project_materials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  project_id uuid not null,
  material_name text not null check (length(btrim(material_name)) between 1 and 200),
  reference_code text check (reference_code is null or length(btrim(reference_code)) <= 100),
  category text check (category is null or length(btrim(category)) <= 120),
  unit text not null default 'pcs' check (length(btrim(unit)) between 1 and 50),
  required_quantity numeric(14,4) not null default 0 check (required_quantity >= 0),
  project_cost_code_id uuid,
  purchase_order_id uuid,
  purchase_order_line_id uuid,
  status text not null default 'ACTIVE' check (status in ('PLANNED', 'ACTIVE', 'ON_HOLD', 'CLOSED', 'CANCELLED')),
  notes text check (notes is null or length(notes) <= 2000),
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engineering_project_materials_company_id_id_key unique (company_id, id),
  constraint engineering_project_materials_project_fk
    foreign key (company_id, project_id) references public.projects(company_id, id) on delete restrict,
  constraint engineering_project_materials_cost_code_fk
    foreign key (company_id, project_id, project_cost_code_id)
    references public.project_cost_codes(company_id, project_id, id) on delete restrict,
  constraint engineering_project_materials_po_fk
    foreign key (company_id, purchase_order_id)
    references public.purchase_orders(company_id, id) on delete restrict,
  constraint engineering_project_materials_po_line_fk
    foreign key (company_id, purchase_order_line_id)
    references public.purchase_order_lines(company_id, id) on delete restrict
);

create table if not exists public.engineering_project_equipment (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  project_id uuid not null,
  asset_reference text check (asset_reference is null or length(btrim(asset_reference)) <= 120),
  equipment_name text not null check (length(btrim(equipment_name)) between 1 and 180),
  equipment_type text check (equipment_type is null or length(btrim(equipment_type)) <= 120),
  equipment_source text not null default 'OTHER' check (equipment_source in ('OWNED', 'RENTED', 'SUBCONTRACTOR', 'OTHER')),
  provider_name text check (provider_name is null or length(btrim(provider_name)) <= 180),
  assignment_start date,
  assignment_end date,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE', 'OUT_OF_SERVICE', 'RETURNED')),
  notes text check (notes is null or length(notes) <= 2000),
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engineering_project_equipment_company_id_id_key unique (company_id, id),
  constraint engineering_project_equipment_project_fk
    foreign key (company_id, project_id) references public.projects(company_id, id) on delete restrict,
  constraint engineering_project_equipment_assignment_dates_check
    check (assignment_end is null or assignment_start is null or assignment_end >= assignment_start)
);

-- 2. Structured historical Daily Site Log observations.
alter table public.engineering_daily_site_log_crew
  add column if not exists project_cost_code_id uuid;
alter table public.engineering_daily_site_log_equipment
  add column if not exists equipment_id uuid;

create table if not exists public.engineering_daily_site_log_work (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  site_log_id uuid not null,
  project_id uuid not null,
  description text not null check (length(btrim(description)) between 1 and 2000),
  project_cost_code_id uuid,
  quantity numeric(14,4) check (quantity is null or quantity >= 0),
  unit text check (unit is null or length(btrim(unit)) between 1 and 50),
  work_location text check (work_location is null or length(btrim(work_location)) <= 180),
  notes text check (notes is null or length(notes) <= 2000),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engineering_daily_site_log_work_company_id_id_key unique (company_id, id),
  constraint engineering_daily_site_log_work_log_fk
    foreign key (company_id, site_log_id) references public.engineering_daily_site_logs(company_id, id) on delete restrict,
  constraint engineering_daily_site_log_work_project_fk
    foreign key (company_id, project_id) references public.projects(company_id, id) on delete restrict,
  constraint engineering_daily_site_log_work_cost_code_fk
    foreign key (company_id, project_id, project_cost_code_id)
    references public.project_cost_codes(company_id, project_id, id) on delete restrict
);

create table if not exists public.engineering_daily_site_log_material_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  site_log_id uuid not null,
  project_id uuid not null,
  material_id uuid,
  material_name_snapshot text not null check (length(btrim(material_name_snapshot)) between 1 and 200),
  quantity_observed numeric(14,4) not null check (quantity_observed > 0),
  unit_snapshot text not null check (length(btrim(unit_snapshot)) between 1 and 50),
  supplier_delivery_reference text check (supplier_delivery_reference is null or length(btrim(supplier_delivery_reference)) <= 120),
  purchase_order_id uuid,
  purchase_order_line_id uuid,
  purchase_order_receipt_id uuid,
  delivery_condition text check (delivery_condition is null or length(btrim(delivery_condition)) <= 120),
  location text check (location is null or length(btrim(location)) <= 180),
  project_cost_code_id uuid,
  notes text check (notes is null or length(notes) <= 2000),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engineering_daily_site_log_material_deliveries_company_id_id_key unique (company_id, id),
  constraint engineering_daily_site_log_material_deliveries_log_fk
    foreign key (company_id, site_log_id) references public.engineering_daily_site_logs(company_id, id) on delete restrict,
  constraint engineering_daily_site_log_material_deliveries_project_fk
    foreign key (company_id, project_id) references public.projects(company_id, id) on delete restrict,
  constraint engineering_daily_site_log_material_deliveries_material_fk
    foreign key (company_id, material_id) references public.engineering_project_materials(company_id, id) on delete restrict,
  constraint engineering_daily_site_log_material_deliveries_po_fk
    foreign key (company_id, purchase_order_id) references public.purchase_orders(company_id, id) on delete restrict,
  constraint engineering_daily_site_log_material_deliveries_po_line_fk
    foreign key (company_id, purchase_order_line_id) references public.purchase_order_lines(company_id, id) on delete restrict,
  constraint engineering_daily_site_log_material_deliveries_receipt_fk
    foreign key (company_id, purchase_order_receipt_id) references public.purchase_order_receipts(company_id, id) on delete restrict,
  constraint engineering_daily_site_log_material_deliveries_cost_code_fk
    foreign key (company_id, project_id, project_cost_code_id)
    references public.project_cost_codes(company_id, project_id, id) on delete restrict
);

create table if not exists public.engineering_daily_site_log_issues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  site_log_id uuid not null,
  project_id uuid not null,
  category text not null check (length(btrim(category)) between 1 and 80),
  description text not null check (length(btrim(description)) between 1 and 2000),
  severity text not null default 'MEDIUM' check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status text not null default 'OPEN' check (status in ('OPEN', 'IN_PROGRESS', 'RESOLVED')),
  mitigation text check (mitigation is null or length(mitigation) <= 2000),
  responsible_party text check (responsible_party is null or length(btrim(responsible_party)) <= 180),
  project_cost_code_id uuid,
  resolved_at date,
  notes text check (notes is null or length(notes) <= 2000),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engineering_daily_site_log_issues_company_id_id_key unique (company_id, id),
  constraint engineering_daily_site_log_issues_log_fk
    foreign key (company_id, site_log_id) references public.engineering_daily_site_logs(company_id, id) on delete restrict,
  constraint engineering_daily_site_log_issues_project_fk
    foreign key (company_id, project_id) references public.projects(company_id, id) on delete restrict,
  constraint engineering_daily_site_log_issues_cost_code_fk
    foreign key (company_id, project_id, project_cost_code_id)
    references public.project_cost_codes(company_id, project_id, id) on delete restrict
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.engineering_daily_site_log_equipment'::regclass
      and conname = 'engineering_daily_site_log_equipment_register_fk'
  ) then
    alter table public.engineering_daily_site_log_equipment
      add constraint engineering_daily_site_log_equipment_register_fk
      foreign key (company_id, equipment_id)
      references public.engineering_project_equipment(company_id, id) on delete restrict;
  end if;
end $$;

create index if not exists engineering_project_materials_company_project_status_idx
  on public.engineering_project_materials(company_id, project_id, status, updated_at desc);
create index if not exists engineering_project_materials_cost_code_idx
  on public.engineering_project_materials(company_id, project_cost_code_id)
  where project_cost_code_id is not null;
create index if not exists engineering_project_materials_po_line_idx
  on public.engineering_project_materials(company_id, purchase_order_line_id)
  where purchase_order_line_id is not null;
create index if not exists engineering_project_materials_po_idx
  on public.engineering_project_materials(company_id, purchase_order_id)
  where purchase_order_id is not null;
create index if not exists engineering_project_equipment_company_project_status_idx
  on public.engineering_project_equipment(company_id, project_id, status, updated_at desc);
create index if not exists engineering_daily_site_log_crew_cost_code_idx
  on public.engineering_daily_site_log_crew(company_id, project_cost_code_id)
  where project_cost_code_id is not null;
create index if not exists engineering_daily_site_log_equipment_register_idx
  on public.engineering_daily_site_log_equipment(company_id, equipment_id)
  where equipment_id is not null;
create index if not exists engineering_daily_site_log_work_company_log_idx
  on public.engineering_daily_site_log_work(company_id, site_log_id, sort_order);
create index if not exists engineering_daily_site_log_work_project_idx
  on public.engineering_daily_site_log_work(company_id, project_id);
create index if not exists engineering_daily_site_log_material_deliveries_company_log_idx
  on public.engineering_daily_site_log_material_deliveries(company_id, site_log_id, sort_order);
create index if not exists engineering_daily_site_log_material_deliveries_material_idx
  on public.engineering_daily_site_log_material_deliveries(company_id, material_id, project_id)
  where material_id is not null;
create index if not exists engineering_daily_site_log_material_deliveries_project_idx
  on public.engineering_daily_site_log_material_deliveries(company_id, project_id);
create index if not exists engineering_daily_site_log_issues_company_log_idx
  on public.engineering_daily_site_log_issues(company_id, site_log_id, sort_order);
create index if not exists engineering_daily_site_log_issues_open_idx
  on public.engineering_daily_site_log_issues(company_id, project_id, severity, resolved_at)
  where status <> 'RESOLVED';
create index if not exists engineering_daily_site_log_issues_project_idx
  on public.engineering_daily_site_log_issues(company_id, project_id);

-- 3. Tenant-policy metadata and least-privilege grants.
insert into private.company_tenant_policy_catalog (table_name, read_permission, write_permission, allow_insert, allow_update, allow_delete)
values
  ('engineering_project_materials', 'projects.read', 'projects.manage', true, true, false),
  ('engineering_project_equipment', 'projects.read', 'projects.manage', true, true, false),
  ('engineering_daily_site_log_work', 'engineering.sitelogs.read', 'engineering.sitelogs.update', false, false, false),
  ('engineering_daily_site_log_material_deliveries', 'engineering.sitelogs.read', 'engineering.sitelogs.update', false, false, false),
  ('engineering_daily_site_log_issues', 'engineering.sitelogs.read', 'engineering.sitelogs.update', false, false, false)
on conflict (table_name) do update set
  read_permission = excluded.read_permission,
  write_permission = excluded.write_permission,
  allow_insert = excluded.allow_insert,
  allow_update = excluded.allow_update,
  allow_delete = excluded.allow_delete;

create or replace function private.validate_engineering_register_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_project_company_id uuid;
  v_project_status text;
  v_po_project_id uuid;
  v_line_po_id uuid;
begin
  if tg_op = 'DELETE' then return old; end if;
  if v_user_id is null then
    raise exception 'Authentication is required for materials and equipment activity' using errcode = '42501';
  end if;

  select p.company_id, p.status into v_project_company_id, v_project_status
  from public.projects p where p.id = new.project_id;
  if v_project_company_id is null or v_project_company_id is distinct from new.company_id then
    raise exception 'Materials and equipment must reference a project in the same company' using errcode = '42501';
  end if;
  if v_project_status = 'ARCHIVED' then
    raise exception 'Archived projects cannot receive materials or equipment activity' using errcode = '42501';
  end if;

  if tg_table_name = 'engineering_project_materials' then
    if tg_op = 'UPDATE' and (
      new.id is distinct from old.id
      or new.company_id is distinct from old.company_id
      or new.project_id is distinct from old.project_id
      or new.created_by_user_id is distinct from old.created_by_user_id
      or new.created_at is distinct from old.created_at
    ) then
      raise exception 'Material register identity and project ownership are immutable' using errcode = '55000';
    end if;
    if new.project_cost_code_id is not null and not exists (
      select 1 from public.project_cost_codes cc
      where cc.id = new.project_cost_code_id and cc.company_id = new.company_id and cc.project_id = new.project_id
    ) then
      raise exception 'Material cost code must belong to the same project and company' using errcode = '42501';
    end if;
    if new.purchase_order_id is not null then
      select po.project_id into v_po_project_id from public.purchase_orders po
      where po.id = new.purchase_order_id and po.company_id = new.company_id;
      if v_po_project_id is null or v_po_project_id is distinct from new.project_id then
        raise exception 'Material purchase order must belong to the same project and company' using errcode = '42501';
      end if;
    end if;
    if new.purchase_order_line_id is not null then
      select pol.purchase_order_id into v_line_po_id from public.purchase_order_lines pol
      where pol.id = new.purchase_order_line_id and pol.company_id = new.company_id;
      if v_line_po_id is null or new.purchase_order_id is null or v_line_po_id is distinct from new.purchase_order_id then
        raise exception 'Material purchase order line must belong to the selected purchase order' using errcode = '42501';
      end if;
      select po.project_id into v_po_project_id from public.purchase_orders po
      where po.id = v_line_po_id and po.company_id = new.company_id;
      if v_po_project_id is distinct from new.project_id then
        raise exception 'Material purchase order line must belong to the same project' using errcode = '42501';
      end if;
    end if;
  elsif tg_table_name = 'engineering_project_equipment' then
    if tg_op = 'UPDATE' and (
      new.id is distinct from old.id
      or new.company_id is distinct from old.company_id
      or new.project_id is distinct from old.project_id
      or new.created_by_user_id is distinct from old.created_by_user_id
      or new.created_at is distinct from old.created_at
    ) then
      raise exception 'Equipment register identity and project ownership are immutable' using errcode = '55000';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.prevent_engineering_register_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_name = 'engineering_project_materials' and exists (
    select 1 from public.engineering_daily_site_log_material_deliveries d where d.company_id = old.company_id and d.material_id = old.id
  ) then
    raise exception 'Material register records with site delivery history must be retained and lifecycle-managed' using errcode = '55000';
  end if;
  if tg_table_name = 'engineering_project_equipment' and exists (
    select 1 from public.engineering_daily_site_log_equipment e where e.company_id = old.company_id and e.equipment_id = old.id
  ) then
    raise exception 'Equipment with Daily Site Log history must be retained and lifecycle-managed' using errcode = '55000';
  end if;
  return old;
end;
$$;

create or replace function private.validate_daily_site_log_field_child_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_log_company_id uuid;
  v_log_project_id uuid;
  v_log_status text;
  v_po_id uuid;
  v_po_project_id uuid;
  v_receipt_po_id uuid;
begin
  if tg_op = 'DELETE' then return old; end if;
  select l.company_id, l.project_id, l.status into v_log_company_id, v_log_project_id, v_log_status
  from public.engineering_daily_site_logs l where l.id = new.site_log_id;
  if v_log_company_id is null or v_log_company_id is distinct from new.company_id then
    raise exception 'Daily Site Log observation is outside the company' using errcode = '42501';
  end if;
  if tg_table_name in ('engineering_daily_site_log_work', 'engineering_daily_site_log_material_deliveries', 'engineering_daily_site_log_issues') then
    if new.project_id is distinct from v_log_project_id then
      raise exception 'Daily Site Log observation project does not match the parent log' using errcode = '42501';
    end if;
    if new.project_cost_code_id is not null and not exists (
      select 1 from public.project_cost_codes cc
      where cc.id = new.project_cost_code_id and cc.company_id = new.company_id and cc.project_id = v_log_project_id
    ) then
      raise exception 'Daily Site Log cost code must belong to the same project and company' using errcode = '42501';
    end if;
  elsif tg_table_name = 'engineering_daily_site_log_crew' then
    if new.project_cost_code_id is not null and not exists (
      select 1 from public.project_cost_codes cc
      where cc.id = new.project_cost_code_id and cc.company_id = new.company_id and cc.project_id = v_log_project_id
    ) then
      raise exception 'Daily Site Log cost code must belong to the same project and company' using errcode = '42501';
    end if;
  end if;

  if tg_table_name = 'engineering_daily_site_log_equipment' then
    if new.equipment_id is not null and not exists (
      select 1 from public.engineering_project_equipment e
      where e.id = new.equipment_id and e.company_id = new.company_id and e.project_id = v_log_project_id
    ) then
      raise exception 'Daily Site Log equipment must be assigned to the same project and company' using errcode = '42501';
    end if;
  end if;

  if tg_table_name = 'engineering_daily_site_log_material_deliveries' then
    if new.material_id is not null and not exists (
      select 1 from public.engineering_project_materials m
      where m.id = new.material_id and m.company_id = new.company_id and m.project_id = v_log_project_id
    ) then
      raise exception 'Material delivery observation must reference a material in the same project and company' using errcode = '42501';
    end if;
    if new.purchase_order_id is not null then
      select po.project_id into v_po_project_id from public.purchase_orders po
      where po.id = new.purchase_order_id and po.company_id = new.company_id;
      if v_po_project_id is null or v_po_project_id is distinct from v_log_project_id then
        raise exception 'Material delivery purchase order must belong to the same project' using errcode = '42501';
      end if;
    end if;
    if new.purchase_order_line_id is not null then
      select pol.purchase_order_id into v_po_id from public.purchase_order_lines pol
      where pol.id = new.purchase_order_line_id and pol.company_id = new.company_id;
      if v_po_id is null or new.purchase_order_id is null or v_po_id is distinct from new.purchase_order_id then
        raise exception 'Material delivery purchase order line must belong to the selected purchase order' using errcode = '42501';
      end if;
    end if;
    if new.purchase_order_receipt_id is not null then
      select r.purchase_order_id, po.project_id into v_receipt_po_id, v_po_project_id
      from public.purchase_order_receipts r
      join public.purchase_orders po on po.id = r.purchase_order_id and po.company_id = r.company_id
      where r.id = new.purchase_order_receipt_id and r.company_id = new.company_id and r.status = 'RECEIVED';
      if v_receipt_po_id is null or new.purchase_order_id is null or v_receipt_po_id is distinct from new.purchase_order_id or v_po_project_id is distinct from v_log_project_id then
        raise exception 'Material delivery receipt reference must be a valid received receipt for the same project purchase order' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.validate_engineering_register_scope() from public, anon, authenticated;
revoke all on function private.prevent_engineering_register_delete() from public, anon, authenticated;
revoke all on function private.validate_daily_site_log_field_child_scope() from public, anon, authenticated;

drop trigger if exists engineering_project_materials_company_boundary on public.engineering_project_materials;
create trigger engineering_project_materials_company_boundary before insert or update on public.engineering_project_materials
for each row execute function private.enforce_company_row_boundary();
drop trigger if exists engineering_project_materials_updated_at on public.engineering_project_materials;
create trigger engineering_project_materials_updated_at before update on public.engineering_project_materials
for each row execute function private.set_company_updated_at();
drop trigger if exists engineering_project_materials_scope_guard on public.engineering_project_materials;
create trigger engineering_project_materials_scope_guard before insert or update on public.engineering_project_materials
for each row execute function private.validate_engineering_register_scope();
drop trigger if exists engineering_project_materials_delete_guard on public.engineering_project_materials;
create trigger engineering_project_materials_delete_guard before delete on public.engineering_project_materials
for each row execute function private.prevent_engineering_register_delete();

drop trigger if exists engineering_project_equipment_company_boundary on public.engineering_project_equipment;
create trigger engineering_project_equipment_company_boundary before insert or update on public.engineering_project_equipment
for each row execute function private.enforce_company_row_boundary();
drop trigger if exists engineering_project_equipment_updated_at on public.engineering_project_equipment;
create trigger engineering_project_equipment_updated_at before update on public.engineering_project_equipment
for each row execute function private.set_company_updated_at();
drop trigger if exists engineering_project_equipment_scope_guard on public.engineering_project_equipment;
create trigger engineering_project_equipment_scope_guard before insert or update on public.engineering_project_equipment
for each row execute function private.validate_engineering_register_scope();
drop trigger if exists engineering_project_equipment_delete_guard on public.engineering_project_equipment;
create trigger engineering_project_equipment_delete_guard before delete on public.engineering_project_equipment
for each row execute function private.prevent_engineering_register_delete();

drop trigger if exists engineering_daily_site_log_crew_field_scope on public.engineering_daily_site_log_crew;
create trigger engineering_daily_site_log_crew_field_scope before insert or update on public.engineering_daily_site_log_crew
for each row execute function private.validate_daily_site_log_field_child_scope();
drop trigger if exists engineering_daily_site_log_equipment_field_scope on public.engineering_daily_site_log_equipment;
create trigger engineering_daily_site_log_equipment_field_scope before insert or update on public.engineering_daily_site_log_equipment
for each row execute function private.validate_daily_site_log_field_child_scope();
drop trigger if exists engineering_daily_site_log_work_field_scope on public.engineering_daily_site_log_work;
create trigger engineering_daily_site_log_work_field_scope before insert or update on public.engineering_daily_site_log_work
for each row execute function private.validate_daily_site_log_field_child_scope();
drop trigger if exists engineering_daily_site_log_material_deliveries_field_scope on public.engineering_daily_site_log_material_deliveries;
create trigger engineering_daily_site_log_material_deliveries_field_scope before insert or update on public.engineering_daily_site_log_material_deliveries
for each row execute function private.validate_daily_site_log_field_child_scope();
drop trigger if exists engineering_daily_site_log_issues_field_scope on public.engineering_daily_site_log_issues;
create trigger engineering_daily_site_log_issues_field_scope before insert or update on public.engineering_daily_site_log_issues
for each row execute function private.validate_daily_site_log_field_child_scope();

drop trigger if exists engineering_daily_site_log_work_formal_guard on public.engineering_daily_site_log_work;
create trigger engineering_daily_site_log_work_formal_guard before update or delete on public.engineering_daily_site_log_work
for each row execute function private.prevent_daily_site_log_child_formal_mutation();
drop trigger if exists engineering_daily_site_log_material_deliveries_formal_guard on public.engineering_daily_site_log_material_deliveries;
create trigger engineering_daily_site_log_material_deliveries_formal_guard before update or delete on public.engineering_daily_site_log_material_deliveries
for each row execute function private.prevent_daily_site_log_child_formal_mutation();
drop trigger if exists engineering_daily_site_log_issues_formal_guard on public.engineering_daily_site_log_issues;
create trigger engineering_daily_site_log_issues_formal_guard before update or delete on public.engineering_daily_site_log_issues
for each row execute function private.prevent_daily_site_log_child_formal_mutation();

-- 4. RLS. Registers are directly readable and writable only through projects
-- permissions. New historical child rows are read-only to clients and are
-- written only inside the guarded Daily Site Log v2 RPCs.
alter table public.engineering_project_materials enable row level security;
alter table public.engineering_project_equipment enable row level security;
alter table public.engineering_daily_site_log_work enable row level security;
alter table public.engineering_daily_site_log_material_deliveries enable row level security;
alter table public.engineering_daily_site_log_issues enable row level security;

revoke all on public.engineering_project_materials, public.engineering_project_equipment,
  public.engineering_daily_site_log_work, public.engineering_daily_site_log_material_deliveries,
  public.engineering_daily_site_log_issues from public, anon, authenticated;
grant select, insert, update on public.engineering_project_materials, public.engineering_project_equipment to authenticated;
grant select on public.engineering_daily_site_log_work, public.engineering_daily_site_log_material_deliveries,
  public.engineering_daily_site_log_issues to authenticated;

drop policy if exists engineering_project_materials_read on public.engineering_project_materials;
create policy engineering_project_materials_read on public.engineering_project_materials for select to authenticated
using ((select public.has_company_permission(company_id, 'projects.read')));
drop policy if exists engineering_project_materials_insert on public.engineering_project_materials;
create policy engineering_project_materials_insert on public.engineering_project_materials for insert to authenticated
with check ((select public.has_company_permission(company_id, 'projects.manage')));
drop policy if exists engineering_project_materials_update on public.engineering_project_materials;
create policy engineering_project_materials_update on public.engineering_project_materials for update to authenticated
using ((select public.has_company_permission(company_id, 'projects.manage')))
with check ((select public.has_company_permission(company_id, 'projects.manage')));

drop policy if exists engineering_project_equipment_read on public.engineering_project_equipment;
create policy engineering_project_equipment_read on public.engineering_project_equipment for select to authenticated
using ((select public.has_company_permission(company_id, 'projects.read')));
drop policy if exists engineering_project_equipment_insert on public.engineering_project_equipment;
create policy engineering_project_equipment_insert on public.engineering_project_equipment for insert to authenticated
with check ((select public.has_company_permission(company_id, 'projects.manage')));
drop policy if exists engineering_project_equipment_update on public.engineering_project_equipment;
create policy engineering_project_equipment_update on public.engineering_project_equipment for update to authenticated
using ((select public.has_company_permission(company_id, 'projects.manage')))
with check ((select public.has_company_permission(company_id, 'projects.manage')));

drop policy if exists engineering_daily_site_log_work_read on public.engineering_daily_site_log_work;
create policy engineering_daily_site_log_work_read on public.engineering_daily_site_log_work for select to authenticated
using ((select public.has_company_permission(company_id, 'engineering.sitelogs.read')));
drop policy if exists engineering_daily_site_log_material_deliveries_read on public.engineering_daily_site_log_material_deliveries;
create policy engineering_daily_site_log_material_deliveries_read on public.engineering_daily_site_log_material_deliveries for select to authenticated
using ((select public.has_company_permission(company_id, 'engineering.sitelogs.read')));
drop policy if exists engineering_daily_site_log_issues_read on public.engineering_daily_site_log_issues;
create policy engineering_daily_site_log_issues_read on public.engineering_daily_site_log_issues for select to authenticated
using ((select public.has_company_permission(company_id, 'engineering.sitelogs.read')));

-- Existing child formal guard applies to the newly structured observations too.
-- It also protects equipment_id and the optional crew cost-code relationship.

create or replace function private.field_register_actor(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not (select public.has_company_permission(p_company_id, 'projects.manage')) then
    raise exception 'Materials and equipment permission denied' using errcode = '42501';
  end if;
  return v_actor;
end;
$$;
revoke all on function private.field_register_actor(uuid) from public, anon, authenticated;

-- Server-derived attribution and company context for register writes.
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
      status, notes, created_by_user_id, updated_by_user_id
    ) values (
      coalesce(v_id, gen_random_uuid()), v_company_id, v_project_id, btrim(p_material->>'materialName'),
      nullif(btrim(p_material->>'referenceCode'), ''), nullif(btrim(p_material->>'category'), ''),
      btrim(coalesce(nullif(p_material->>'unit', ''), 'pcs')),
      coalesce(nullif(p_material->>'requiredQuantity', '')::numeric, 0),
      nullif(p_material->>'projectCostCodeId', '')::uuid,
      nullif(p_material->>'purchaseOrderId', '')::uuid,
      nullif(p_material->>'purchaseOrderLineId', '')::uuid,
      coalesce(nullif(p_material->>'status', ''), 'ACTIVE'), nullif(btrim(p_material->>'notes'), ''), v_actor, v_actor
    ) returning * into v_row;
    v_id := v_row.id;
  end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.save_engineering_project_equipment(p_equipment jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := private.resolve_transition_company();
  v_actor uuid;
  v_id uuid := nullif(p_equipment->>'id', '')::uuid;
  v_project_id uuid := nullif(p_equipment->>'projectId', '')::uuid;
  v_existing public.engineering_project_equipment;
  v_row public.engineering_project_equipment;
  v_was_existing boolean := false;
begin
  v_actor := private.field_register_actor(v_company_id);
  if nullif(p_equipment->>'companyId', '') is not null and (p_equipment->>'companyId')::uuid is distinct from v_company_id then
    raise exception 'Client company context does not match the deployment company' using errcode = '42501';
  end if;
  if v_id is not null then
    select * into v_existing from public.engineering_project_equipment where id = v_id for update;
    if found then
      if v_existing.company_id is distinct from v_company_id then
        raise exception 'Equipment register record is outside the deployment company' using errcode = '42501';
      end if;
      v_was_existing := true;
    end if;
  end if;
  if v_was_existing then
    update public.engineering_project_equipment set
      project_id = v_project_id,
      asset_reference = nullif(btrim(p_equipment->>'assetReference'), ''),
      equipment_name = btrim(p_equipment->>'equipmentName'),
      equipment_type = nullif(btrim(p_equipment->>'equipmentType'), ''),
      equipment_source = coalesce(nullif(p_equipment->>'equipmentSource', ''), 'OTHER'),
      provider_name = nullif(btrim(p_equipment->>'providerName'), ''),
      assignment_start = nullif(p_equipment->>'assignmentStart', '')::date,
      assignment_end = nullif(p_equipment->>'assignmentEnd', '')::date,
      status = coalesce(nullif(p_equipment->>'status', ''), 'ACTIVE'),
      notes = nullif(btrim(p_equipment->>'notes'), ''),
      updated_by_user_id = v_actor,
      updated_at = now()
    where id = v_id and company_id = v_company_id
    returning * into v_row;
  else
    insert into public.engineering_project_equipment(
      id, company_id, project_id, asset_reference, equipment_name, equipment_type,
      equipment_source, provider_name, assignment_start, assignment_end, status,
      notes, created_by_user_id, updated_by_user_id
    ) values (
      coalesce(v_id, gen_random_uuid()), v_company_id, v_project_id,
      nullif(btrim(p_equipment->>'assetReference'), ''), btrim(p_equipment->>'equipmentName'),
      nullif(btrim(p_equipment->>'equipmentType'), ''), coalesce(nullif(p_equipment->>'equipmentSource', ''), 'OTHER'),
      nullif(btrim(p_equipment->>'providerName'), ''), nullif(p_equipment->>'assignmentStart', '')::date,
      nullif(p_equipment->>'assignmentEnd', '')::date, coalesce(nullif(p_equipment->>'status', ''), 'ACTIVE'),
      nullif(btrim(p_equipment->>'notes'), ''), v_actor, v_actor
    ) returning * into v_row;
    v_id := v_row.id;
  end if;
  return to_jsonb(v_row);
end;
$$;

revoke execute on function public.save_engineering_project_material(jsonb) from public, anon;
revoke execute on function public.save_engineering_project_equipment(jsonb) from public, anon;
grant execute on function public.save_engineering_project_material(jsonb) to authenticated;
grant execute on function public.save_engineering_project_equipment(jsonb) to authenticated;

-- 5. Daily Site Log v2 aggregate helpers. The original RPCs remain available
-- for older clients; the v2 RPCs add structured field rows without changing the
-- original function signatures.
create or replace function private.patch_daily_site_log_child_links(
  p_daily_site_log_id uuid,
  p_crew jsonb,
  p_equipment jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
begin
  for v_item in select value from jsonb_array_elements(coalesce(p_crew, '[]'::jsonb)) loop
    if nullif(v_item->>'id', '') is not null then
      update public.engineering_daily_site_log_crew
      set project_cost_code_id = nullif(v_item->>'project_cost_code_id', '')::uuid
      where id = (v_item->>'id')::uuid and site_log_id = p_daily_site_log_id;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(p_equipment, '[]'::jsonb)) loop
    if nullif(v_item->>'id', '') is not null then
      update public.engineering_daily_site_log_equipment
      set equipment_id = nullif(v_item->>'equipment_id', '')::uuid
      where id = (v_item->>'id')::uuid and site_log_id = p_daily_site_log_id;
    end if;
  end loop;
end;
$$;

create or replace function private.insert_daily_site_log_field_rows(
  p_company_id uuid,
  p_daily_site_log_id uuid,
  p_project_id uuid,
  p_work jsonb,
  p_material_deliveries jsonb,
  p_issues jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_index integer := 0;
begin
  if p_work is null or jsonb_typeof(p_work) <> 'array' then
    raise exception 'Work accomplished rows must be an array' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_work) loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'Work accomplished rows must be objects' using errcode = '22023'; end if;
    insert into public.engineering_daily_site_log_work(
      id, company_id, site_log_id, project_id, description, project_cost_code_id,
      quantity, unit, work_location, notes, sort_order
    ) values (
      coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid()), p_company_id, p_daily_site_log_id, p_project_id,
      btrim(v_item->>'description'), nullif(v_item->>'project_cost_code_id', '')::uuid,
      nullif(v_item->>'quantity', '')::numeric, nullif(btrim(v_item->>'unit'), ''),
      nullif(btrim(v_item->>'work_location'), ''), nullif(btrim(v_item->>'notes'), ''),
      coalesce(nullif(v_item->>'sort_order', '')::integer, v_index)
    );
    v_index := v_index + 1;
  end loop;

  if p_material_deliveries is null or jsonb_typeof(p_material_deliveries) <> 'array' then
    raise exception 'Material delivery rows must be an array' using errcode = '22023';
  end if;
  v_index := 0;
  for v_item in select value from jsonb_array_elements(p_material_deliveries) loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'Material delivery rows must be objects' using errcode = '22023'; end if;
    insert into public.engineering_daily_site_log_material_deliveries(
      id, company_id, site_log_id, project_id, material_id, material_name_snapshot,
      quantity_observed, unit_snapshot, supplier_delivery_reference, purchase_order_id,
      purchase_order_line_id, purchase_order_receipt_id, delivery_condition, location,
      project_cost_code_id, notes, sort_order
    ) values (
      coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid()), p_company_id, p_daily_site_log_id, p_project_id,
      nullif(v_item->>'material_id', '')::uuid, btrim(v_item->>'material_name_snapshot'),
      (v_item->>'quantity_observed')::numeric, btrim(v_item->>'unit_snapshot'),
      nullif(btrim(v_item->>'supplier_delivery_reference'), ''), nullif(v_item->>'purchase_order_id', '')::uuid,
      nullif(v_item->>'purchase_order_line_id', '')::uuid, nullif(v_item->>'purchase_order_receipt_id', '')::uuid,
      nullif(btrim(v_item->>'delivery_condition'), ''), nullif(btrim(v_item->>'location'), ''),
      nullif(v_item->>'project_cost_code_id', '')::uuid, nullif(btrim(v_item->>'notes'), ''),
      coalesce(nullif(v_item->>'sort_order', '')::integer, v_index)
    );
    v_index := v_index + 1;
  end loop;

  if p_issues is null or jsonb_typeof(p_issues) <> 'array' then
    raise exception 'Issue rows must be an array' using errcode = '22023';
  end if;
  v_index := 0;
  for v_item in select value from jsonb_array_elements(p_issues) loop
    if jsonb_typeof(v_item) <> 'object' then raise exception 'Issue rows must be objects' using errcode = '22023'; end if;
    insert into public.engineering_daily_site_log_issues(
      id, company_id, site_log_id, project_id, category, description, severity,
      status, mitigation, responsible_party, project_cost_code_id, resolved_at,
      notes, sort_order
    ) values (
      coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid()), p_company_id, p_daily_site_log_id, p_project_id,
      btrim(v_item->>'category'), btrim(v_item->>'description'), coalesce(nullif(v_item->>'severity', ''), 'MEDIUM'),
      coalesce(nullif(v_item->>'status', ''), 'OPEN'), nullif(btrim(v_item->>'mitigation'), ''),
      nullif(btrim(v_item->>'responsible_party'), ''), nullif(v_item->>'project_cost_code_id', '')::uuid,
      nullif(v_item->>'resolved_at', '')::date, nullif(btrim(v_item->>'notes'), ''),
      coalesce(nullif(v_item->>'sort_order', '')::integer, v_index)
    );
    v_index := v_index + 1;
  end loop;
end;
$$;

revoke all on function private.patch_daily_site_log_child_links(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function private.insert_daily_site_log_field_rows(uuid, uuid, uuid, jsonb, jsonb, jsonb) from public, anon, authenticated;

drop trigger if exists engineering_daily_site_log_work_updated_at on public.engineering_daily_site_log_work;
create trigger engineering_daily_site_log_work_updated_at before update on public.engineering_daily_site_log_work
for each row execute function private.set_company_updated_at();
drop trigger if exists engineering_daily_site_log_material_deliveries_updated_at on public.engineering_daily_site_log_material_deliveries;
create trigger engineering_daily_site_log_material_deliveries_updated_at before update on public.engineering_daily_site_log_material_deliveries
for each row execute function private.set_company_updated_at();
drop trigger if exists engineering_daily_site_log_issues_updated_at on public.engineering_daily_site_log_issues;
create trigger engineering_daily_site_log_issues_updated_at before update on public.engineering_daily_site_log_issues
for each row execute function private.set_company_updated_at();

create or replace function public.create_engineering_daily_site_log_v2(
  p_company_id uuid,
  p_daily_site_log_id uuid,
  p_project_id uuid,
  p_site_date date,
  p_report_number text default null,
  p_work_summary text default '',
  p_progress_notes text default null,
  p_delays_constraints text default null,
  p_general_notes text default null,
  p_weather jsonb default null,
  p_crew jsonb default '[]'::jsonb,
  p_equipment jsonb default '[]'::jsonb,
  p_safety jsonb default '[]'::jsonb,
  p_work jsonb default '[]'::jsonb,
  p_material_deliveries jsonb default '[]'::jsonb,
  p_issues jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_row public.engineering_daily_site_logs;
  v_report_number text;
begin
  v_actor := private.daily_site_log_actor(p_company_id, 'engineering.sitelogs.create');
  perform private.assert_daily_site_log_project(p_company_id, p_project_id);
  if p_site_date is null then raise exception 'Site date is required' using errcode = '22023'; end if;
  v_report_number := coalesce(nullif(btrim(p_report_number), ''), 'DSL-' || to_char(p_site_date, 'YYYYMMDD'));

  select * into v_row from public.engineering_daily_site_logs l
  where l.id = p_daily_site_log_id and l.company_id = p_company_id for update;
  if found then
    if v_row.project_id <> p_project_id or v_row.site_date <> p_site_date then
      raise exception 'The requested Daily Site Log identity does not match the existing record' using errcode = '23505';
    end if;
    return to_jsonb(v_row);
  end if;

  insert into public.engineering_daily_site_logs(
    id, company_id, project_id, site_date, report_number, prepared_by_user_id,
    work_summary, progress_notes, delays_constraints, general_notes
  ) values (
    p_daily_site_log_id, p_company_id, p_project_id, p_site_date, v_report_number, v_actor,
    coalesce(p_work_summary, ''), nullif(btrim(p_progress_notes), ''),
    nullif(btrim(p_delays_constraints), ''), nullif(btrim(p_general_notes), '')
  ) returning * into v_row;

  perform private.replace_daily_site_log_children(p_company_id, p_daily_site_log_id, p_weather, p_crew, p_equipment, p_safety);
  perform private.patch_daily_site_log_child_links(p_daily_site_log_id, p_crew, p_equipment);
  perform private.insert_daily_site_log_field_rows(p_company_id, p_daily_site_log_id, p_project_id, p_work, p_material_deliveries, p_issues);
  perform private.record_daily_site_log_event(p_company_id, p_daily_site_log_id, 'CREATED', null, 'DRAFT', v_actor);
  perform private.write_company_audit(p_company_id, 'ENGINEERING_DAILY_SITE_LOG_CREATED', 'engineering_daily_site_log', p_daily_site_log_id,
    jsonb_build_object('project_id', p_project_id, 'site_date', p_site_date, 'report_number', v_report_number, 'schema', 'P3C'));
  return to_jsonb(v_row);
end;
$$;

create or replace function public.update_engineering_daily_site_log_draft_v2(
  p_company_id uuid,
  p_daily_site_log_id uuid,
  p_project_id uuid,
  p_site_date date,
  p_report_number text default null,
  p_work_summary text default '',
  p_progress_notes text default null,
  p_delays_constraints text default null,
  p_general_notes text default null,
  p_weather jsonb default null,
  p_crew jsonb default '[]'::jsonb,
  p_equipment jsonb default '[]'::jsonb,
  p_safety jsonb default '[]'::jsonb,
  p_work jsonb default '[]'::jsonb,
  p_material_deliveries jsonb default '[]'::jsonb,
  p_issues jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_row public.engineering_daily_site_logs;
  v_report_number text;
begin
  v_actor := private.daily_site_log_actor(p_company_id, 'engineering.sitelogs.update');
  perform private.assert_daily_site_log_project(p_company_id, p_project_id);
  select * into v_row from public.engineering_daily_site_logs l
  where l.id = p_daily_site_log_id and l.company_id = p_company_id for update;
  if not found then raise exception 'Daily Site Log was not found in this company' using errcode = 'P0002'; end if;
  if v_row.status <> 'DRAFT' then raise exception 'Submitted or finalized Site Logs are read-only' using errcode = '55000'; end if;
  if v_row.project_id <> p_project_id then raise exception 'Daily Site Log project cannot change' using errcode = '42501'; end if;
  v_report_number := coalesce(nullif(btrim(p_report_number), ''), v_row.report_number);

  delete from public.engineering_daily_site_log_work where site_log_id = p_daily_site_log_id and company_id = p_company_id;
  delete from public.engineering_daily_site_log_material_deliveries where site_log_id = p_daily_site_log_id and company_id = p_company_id;
  delete from public.engineering_daily_site_log_issues where site_log_id = p_daily_site_log_id and company_id = p_company_id;
  delete from public.engineering_daily_site_log_weather where site_log_id = p_daily_site_log_id and company_id = p_company_id;
  delete from public.engineering_daily_site_log_crew where site_log_id = p_daily_site_log_id and company_id = p_company_id;
  delete from public.engineering_daily_site_log_equipment where site_log_id = p_daily_site_log_id and company_id = p_company_id;
  delete from public.engineering_daily_site_log_safety where site_log_id = p_daily_site_log_id and company_id = p_company_id;
  perform private.replace_daily_site_log_children(p_company_id, p_daily_site_log_id, p_weather, p_crew, p_equipment, p_safety);
  perform private.patch_daily_site_log_child_links(p_daily_site_log_id, p_crew, p_equipment);
  perform private.insert_daily_site_log_field_rows(p_company_id, p_daily_site_log_id, p_project_id, p_work, p_material_deliveries, p_issues);
  update public.engineering_daily_site_logs set
    site_date = p_site_date,
    report_number = v_report_number,
    work_summary = coalesce(p_work_summary, ''),
    progress_notes = nullif(btrim(p_progress_notes), ''),
    delays_constraints = nullif(btrim(p_delays_constraints), ''),
    general_notes = nullif(btrim(p_general_notes), ''),
    updated_at = now()
  where id = p_daily_site_log_id and company_id = p_company_id
  returning * into v_row;
  perform private.record_daily_site_log_event(p_company_id, p_daily_site_log_id, 'UPDATED', 'DRAFT', 'DRAFT', v_actor);
  perform private.write_company_audit(p_company_id, 'ENGINEERING_DAILY_SITE_LOG_UPDATED', 'engineering_daily_site_log', p_daily_site_log_id,
    jsonb_build_object('project_id', p_project_id, 'site_date', p_site_date, 'report_number', v_report_number, 'schema', 'P3C'));
  return to_jsonb(v_row);
end;
$$;

revoke execute on function public.create_engineering_daily_site_log_v2(uuid, uuid, uuid, date, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;
revoke execute on function public.update_engineering_daily_site_log_draft_v2(uuid, uuid, uuid, date, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_engineering_daily_site_log_v2(uuid, uuid, uuid, date, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.update_engineering_daily_site_log_draft_v2(uuid, uuid, uuid, date, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- Forward correction to the existing lifecycle preflight: a DRAFT containing
-- one of the new structured observations is used history, not an untouched
-- shell eligible for permanent deletion.
create or replace function private.engineering_daily_site_log_lifecycle_preflight(
  p_site_log_id uuid,
  p_company_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log public.engineering_daily_site_logs;
  v_project_available boolean;
  v_weather bigint := 0;
  v_crew bigint := 0;
  v_equipment bigint := 0;
  v_work bigint := 0;
  v_material_deliveries bigint := 0;
  v_issues bigint := 0;
  v_safety bigint := 0;
  v_events bigint := 0;
  v_formal_events bigint := 0;
  v_addenda bigint := 0;
  v_draft_observations bigint := 0;
  v_narrative_fields bigint := 0;
  v_total bigint := 0;
  v_can_delete boolean;
  v_can_void boolean;
  v_can_addendum boolean;
  v_recommended text;
  v_blocked_reason text;
begin
  select l.* into v_log from public.engineering_daily_site_logs l where l.id = p_site_log_id and l.company_id = p_company_id;
  if not found then raise exception 'Daily Site Log does not exist in the deployment company' using errcode = '42501'; end if;
  v_project_available := private.engineering_lifecycle_project_available(p_company_id, v_log.project_id);
  select count(*) into v_weather from public.engineering_daily_site_log_weather w where w.company_id = p_company_id and w.site_log_id = p_site_log_id;
  select count(*) into v_crew from public.engineering_daily_site_log_crew c where c.company_id = p_company_id and c.site_log_id = p_site_log_id;
  select count(*) into v_equipment from public.engineering_daily_site_log_equipment e where e.company_id = p_company_id and e.site_log_id = p_site_log_id;
  select count(*) into v_work from public.engineering_daily_site_log_work w where w.company_id = p_company_id and w.site_log_id = p_site_log_id;
  select count(*) into v_material_deliveries from public.engineering_daily_site_log_material_deliveries d where d.company_id = p_company_id and d.site_log_id = p_site_log_id;
  select count(*) into v_issues from public.engineering_daily_site_log_issues i where i.company_id = p_company_id and i.site_log_id = p_site_log_id;
  select count(*) into v_safety from public.engineering_daily_site_log_safety s where s.company_id = p_company_id and s.site_log_id = p_site_log_id;
  select count(*), count(*) filter (where event_type in ('SUBMITTED', 'FINALIZED', 'VOIDED')) into v_events, v_formal_events
  from public.engineering_daily_site_log_events e where e.company_id = p_company_id and e.site_log_id = p_site_log_id;
  select count(*) into v_addenda from public.engineering_daily_site_log_addenda a where a.company_id = p_company_id and a.site_log_id = p_site_log_id;
  v_draft_observations := v_weather + v_crew + v_equipment + v_work + v_material_deliveries + v_issues + v_safety;
  v_narrative_fields := (case when length(btrim(coalesce(v_log.work_summary, ''))) > 0 then 1 else 0 end)
    + (case when v_log.progress_notes is not null and length(btrim(v_log.progress_notes)) > 0 then 1 else 0 end)
    + (case when v_log.delays_constraints is not null and length(btrim(v_log.delays_constraints)) > 0 then 1 else 0 end)
    + (case when v_log.general_notes is not null and length(btrim(v_log.general_notes)) > 0 then 1 else 0 end);
  v_total := v_formal_events + v_addenda + v_draft_observations + v_narrative_fields;
  v_can_delete := v_log.status = 'DRAFT' and v_project_available and v_total = 0 and v_log.submitted_at is null and v_log.finalized_at is null and v_log.voided_at is null;
  v_can_void := v_log.status in ('DRAFT', 'SUBMITTED') and v_project_available;
  v_can_addendum := v_log.status = 'FINALIZED' and v_project_available;
  v_recommended := case when v_can_delete then 'DELETE_UNUSED' when v_can_void then 'VOID' when v_can_addendum then 'ADDENDUM' else 'NONE' end;
  v_blocked_reason := case
    when not v_project_available then 'The Site Log belongs to an archived or unavailable project; field history remains preserved.'
    when v_log.status = 'FINALIZED' then 'FINALIZED observations are immutable. Add an append-only correction/addendum instead of rewriting the original field report.'
    when v_log.status = 'VOID' then 'VOID Site Logs are terminal historical records.'
    when v_log.status = 'DRAFT' and (v_draft_observations > 0 or v_narrative_fields > 0) then 'This draft contains field observations or narrative content. Correct it, or void it with a reason; permanent deletion is limited to an untouched draft.'
    when v_total > 0 then 'This Site Log has formal submission/finalization history or an addendum and cannot be permanently deleted.'
    else null
  end;
  return jsonb_build_object(
    'entityType', 'SITE_LOG', 'entityId', p_site_log_id, 'status', v_log.status, 'projectId', v_log.project_id,
    'canDelete', v_can_delete, 'canVoid', v_can_void, 'canAddendum', v_can_addendum, 'recommendedAction', v_recommended,
    'blockedReason', v_blocked_reason, 'totalDependencyCount', v_total,
    'dependencies', jsonb_build_object('weather', v_weather, 'crew', v_crew, 'equipment', v_equipment, 'work', v_work, 'materialDeliveries', v_material_deliveries, 'issues', v_issues, 'safety', v_safety, 'events', v_events, 'formalEvents', v_formal_events, 'draftObservations', v_draft_observations, 'narrativeFields', v_narrative_fields, 'addenda', v_addenda)
  );
end;
$$;
revoke all on function private.engineering_daily_site_log_lifecycle_preflight(uuid, uuid) from public, anon, authenticated;

-- Extend the existing project lifecycle preflight without duplicating its
-- mature financial/engineering dependency query. The renamed base function is
-- retained for idempotent upgrade compatibility; every existing caller of the
-- original name now receives the field-register counts too.
do $$
begin
  if to_regprocedure('private.project_lifecycle_preflight(uuid,uuid)') is not null
     and to_regprocedure('private.project_lifecycle_preflight_base(uuid,uuid)') is null then
    alter function private.project_lifecycle_preflight(uuid, uuid) rename to project_lifecycle_preflight_base;
  end if;
end $$;

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
  v_base_total := coalesce((v_base->>'totalDependencyCount')::bigint, 0);
  v_base_can_delete := coalesce((v_base->>'canDelete')::boolean, false);
  v_total := v_base_total + v_materials + v_equipment;
  v_can_delete := v_base_can_delete and v_materials = 0 and v_equipment = 0;
  v_action := case
    when v_can_delete then 'DELETE_UNUSED'
    when coalesce((v_base->>'canReactivate')::boolean, false) then 'REACTIVATE'
    else 'ARCHIVE'
  end;
  v_reason := case
    when v_can_delete then null
    when v_base_can_delete and (v_materials > 0 or v_equipment > 0) then 'This project has Materials or Equipment register history and cannot be permanently deleted. Archive it instead.'
    else v_base->>'blockedReason'
  end;
  v_base := jsonb_set(v_base, '{dependencies,projectMaterials}', to_jsonb(v_materials), true);
  v_base := jsonb_set(v_base, '{dependencies,projectEquipment}', to_jsonb(v_equipment), true);
  v_base := jsonb_set(v_base, '{totalDependencyCount}', to_jsonb(v_total), true);
  v_base := jsonb_set(v_base, '{canDelete}', to_jsonb(v_can_delete), true);
  v_base := jsonb_set(v_base, '{recommendedAction}', to_jsonb(v_action), true);
  v_base := jsonb_set(v_base, '{blockedReason}', coalesce(to_jsonb(v_reason), 'null'::jsonb), true);
  return v_base;
end;
$$;
revoke all on function private.project_lifecycle_preflight(uuid, uuid) from public, anon, authenticated;
revoke all on function private.project_lifecycle_preflight_base(uuid, uuid) from public, anon, authenticated;
