-- ============================================================================
-- Migration: 20260903140000_subcontracts_and_commitments.sql
-- Description: P2B-1 Subcontract Commitments Foundation
-- ============================================================================

-- Subcontracts represent committed commercial agreements with trade contractors.
-- Like Purchase Orders, a Subcontract is a commitment record and does NOT inflate
-- Actual Cost directly. Actual Cost is driven by lifecycle-eligible verified invoices,
-- expenses, or payroll.

-- 1. Subcontract header and line-item domain
create table if not exists public.subcontracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  subcontract_number text not null check (length(btrim(subcontract_number)) between 1 and 60 and subcontract_number = upper(btrim(subcontract_number))),
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 255),
  currency text not null default 'PHP' check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'APPROVED', 'ACTIVE', 'CLOSED', 'CANCELLED')),
  original_amount numeric(18,2) not null default 0 check (original_amount >= 0),
  start_date date,
  target_completion_date date,
  notes text,
  cancellation_reason text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  approved_by_user_id uuid references auth.users(id) on delete set null,
  activated_by_user_id uuid references auth.users(id) on delete set null,
  closed_by_user_id uuid references auth.users(id) on delete set null,
  cancelled_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  activated_at timestamptz,
  closed_at timestamptz,
  cancelled_at timestamptz,
  constraint subcontracts_completion_after_start_check
    check (target_completion_date is null or start_date is null or target_completion_date >= start_date),
  constraint subcontracts_company_id_id_key unique (company_id, id),
  constraint subcontracts_company_project_id_key unique (company_id, project_id, id)
);

create unique index if not exists subcontracts_company_subcontract_number_unique
  on public.subcontracts (company_id, lower(subcontract_number));
create index if not exists subcontracts_project_id_fk_idx
  on public.subcontracts (project_id);
create index if not exists subcontracts_vendor_id_fk_idx
  on public.subcontracts (vendor_id);
create index if not exists subcontracts_company_project_status_idx
  on public.subcontracts (company_id, project_id, status, updated_at desc);
create index if not exists subcontracts_company_vendor_idx
  on public.subcontracts (company_id, vendor_id, updated_at desc);
create index if not exists subcontracts_company_status_idx
  on public.subcontracts (company_id, status, updated_at desc);

-- Keep the newly introduced check constraint safe to reapply if an earlier
-- attempt created the table but did not finish the migration transaction.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.subcontracts'::regclass
      and conname = 'subcontracts_completion_after_start_check'
  ) then
    alter table public.subcontracts
      add constraint subcontracts_completion_after_start_check
      check (target_completion_date is null or start_date is null or target_completion_date >= start_date);
  end if;
end $$;

create table if not exists public.subcontract_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  subcontract_id uuid not null,
  line_number integer not null default 1 check (line_number >= 1),
  description text not null check (length(btrim(description)) between 1 and 500),
  amount numeric(18,2) not null default 0 check (amount >= 0),
  quantity numeric(14,4) check (quantity is null or quantity > 0),
  unit text check (unit is null or length(btrim(unit)) between 1 and 50),
  unit_rate numeric(18,2) check (unit_rate is null or unit_rate >= 0),
  project_cost_code_id uuid references public.project_cost_codes(id) on delete restrict,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subcontract_lines_company_sc_line_key unique (company_id, subcontract_id, line_number),
  constraint subcontract_lines_company_subcontract_fk
    foreign key (company_id, subcontract_id)
    references public.subcontracts(company_id, id) on delete cascade
);

create index if not exists subcontract_lines_company_sc_idx
  on public.subcontract_lines (company_id, subcontract_id, line_number asc);
create index if not exists subcontract_lines_project_cost_code_id_fk_idx
  on public.subcontract_lines (project_cost_code_id)
  where project_cost_code_id is not null;
create index if not exists subcontract_lines_cost_code_idx
  on public.subcontract_lines (company_id, project_cost_code_id);

-- The inline declaration covers a clean install; this guard also repairs a
-- partially applied earlier version without relying on ADD CONSTRAINT IF NOT
-- EXISTS, which PostgreSQL does not support.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.subcontract_lines'::regclass
      and conname = 'subcontract_lines_company_subcontract_fk'
  ) then
    alter table public.subcontract_lines
      add constraint subcontract_lines_company_subcontract_fk
      foreign key (company_id, subcontract_id)
      references public.subcontracts(company_id, id) on delete cascade;
  end if;
end $$;

-- 2. Tenant policy catalog registration & RLS
insert into private.company_tenant_policy_catalog (table_name, read_permission, write_permission, allow_insert, allow_update, allow_delete)
values
  ('subcontracts', 'procurement.read', 'procurement.manage', true, true, true),
  ('subcontract_lines', 'procurement.read', 'procurement.manage', true, true, true)
on conflict (table_name) do update set
  read_permission = excluded.read_permission,
  write_permission = excluded.write_permission,
  allow_insert = excluded.allow_insert,
  allow_update = excluded.allow_update,
  allow_delete = excluded.allow_delete;

-- 3. Header integrity and lifecycle authority
create or replace function private.validate_subcontract_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_project_company_id uuid;
  v_project_status text;
  v_project_archived_at timestamptz;
  v_vendor_company_id uuid;
  v_has_manage boolean;
  v_has_approve boolean;
  v_lines_total numeric(18,2);
begin
  if v_user_id is null then
    raise exception 'Authentication is required for subcontract activity' using errcode = '42501';
  end if;

  select p.company_id, p.status, p.archived_at
    into v_project_company_id, v_project_status, v_project_archived_at
  from public.projects p
  where p.id = new.project_id
  for key share;

  if v_project_company_id is null then
    raise exception 'Subcontract requires an existing project' using errcode = '23503';
  end if;
  if v_project_company_id is distinct from new.company_id then
    raise exception 'Subcontract project is outside the company' using errcode = '42501';
  end if;
  if v_project_status = 'ARCHIVED' or v_project_archived_at is not null then
    raise exception 'Archived projects cannot receive subcontract activity' using errcode = '42501';
  end if;

  select v.company_id into v_vendor_company_id
  from public.vendors v
  where v.id = new.vendor_id;

  if v_vendor_company_id is null then
    raise exception 'Subcontract requires an existing vendor' using errcode = '23503';
  end if;
  if v_vendor_company_id is distinct from new.company_id then
    raise exception 'Subcontract vendor is outside the company' using errcode = '42501';
  end if;

  v_has_manage := (select public.has_company_permission(new.company_id, 'procurement.manage'));
  v_has_approve := (select public.has_company_permission(new.company_id, 'procurement.approve'));

  if tg_op = 'INSERT' then
    if not v_has_manage then
      raise exception 'Unauthorized to create subcontracts' using errcode = '42501';
    end if;
    if new.status <> 'DRAFT' then
      raise exception 'Subcontracts must be created as DRAFT and transitioned through the guarded lifecycle' using errcode = '42501';
    end if;

    -- These fields are database-owned provenance/derived values. A client may
    -- provide them in a direct table INSERT, but cannot backdate or pre-load a
    -- draft commitment total.
    new.created_at := now();
    new.updated_at := now();
    new.original_amount := 0;
    new.created_by_user_id := v_user_id;
    new.updated_by_user_id := v_user_id;
    new.approved_by_user_id := null;
    new.activated_by_user_id := null;
    new.closed_by_user_id := null;
    new.cancelled_by_user_id := null;
    new.approved_at := null;
    new.activated_at := null;
    new.closed_at := null;
    new.cancelled_at := null;
    new.cancellation_reason := null;
    return new;
  end if;

  if new.company_id is distinct from old.company_id then
    raise exception 'Subcontract company is immutable' using errcode = '42501';
  end if;
  if new.created_by_user_id is distinct from old.created_by_user_id or new.created_at is distinct from old.created_at then
    raise exception 'Subcontract creation provenance is immutable' using errcode = '42501';
  end if;

  if new.status is not distinct from old.status then
    if not v_has_manage then
      raise exception 'Unauthorized to edit subcontracts' using errcode = '42501';
    end if;
    if new.original_amount is distinct from old.original_amount then
      select coalesce(sum(scl.amount), 0)
        into v_lines_total
      from public.subcontract_lines scl
      where scl.subcontract_id = old.id and scl.company_id = old.company_id;

      if new.original_amount is distinct from v_lines_total then
        raise exception 'Subcontract original amount must equal the line-item total' using errcode = '23514';
      end if;
    end if;
    if old.status <> 'DRAFT' and (
      new.subcontract_number is distinct from old.subcontract_number or
      new.vendor_id is distinct from old.vendor_id or
      new.project_id is distinct from old.project_id or
      new.currency is distinct from old.currency or
      new.title is distinct from old.title or
      new.start_date is distinct from old.start_date or
      new.target_completion_date is distinct from old.target_completion_date or
      new.notes is distinct from old.notes or
      new.original_amount is distinct from old.original_amount or
      new.cancellation_reason is distinct from old.cancellation_reason
    ) then
      raise exception 'Approved, active, closed, or cancelled subcontract terms are immutable' using errcode = '42501';
    end if;

    if new.approved_by_user_id is distinct from old.approved_by_user_id or
       new.activated_by_user_id is distinct from old.activated_by_user_id or
       new.closed_by_user_id is distinct from old.closed_by_user_id or
       new.cancelled_by_user_id is distinct from old.cancelled_by_user_id or
       new.approved_at is distinct from old.approved_at or
       new.activated_at is distinct from old.activated_at or
       new.closed_at is distinct from old.closed_at or
       new.cancelled_at is distinct from old.cancelled_at then
      raise exception 'Subcontract lifecycle audit metadata is immutable outside a lifecycle transition' using errcode = '42501';
    end if;

    new.updated_by_user_id := v_user_id;
    return new;
  end if;

  if not v_has_approve then
    raise exception 'procurement.approve permission is required for subcontract lifecycle transitions' using errcode = '42501';
  end if;

  -- Commercial terms cannot change during a lifecycle transition
  if new.subcontract_number is distinct from old.subcontract_number or
     new.vendor_id is distinct from old.vendor_id or
     new.project_id is distinct from old.project_id or
     new.currency is distinct from old.currency or
     new.title is distinct from old.title or
     new.start_date is distinct from old.start_date or
     new.target_completion_date is distinct from old.target_completion_date or
     new.notes is distinct from old.notes or
     new.original_amount is distinct from old.original_amount then
    raise exception 'Subcontract terms cannot change during a lifecycle transition' using errcode = '42501';
  end if;

  if old.status = 'DRAFT' and new.status not in ('APPROVED', 'CANCELLED') then
    raise exception 'Draft subcontracts can only be approved or cancelled' using errcode = '42501';
  elsif old.status = 'APPROVED' and new.status not in ('ACTIVE', 'CANCELLED') then
    raise exception 'Approved subcontracts can only be activated or cancelled' using errcode = '42501';
  elsif old.status = 'ACTIVE' and new.status not in ('CLOSED', 'CANCELLED') then
    raise exception 'Active subcontracts can only be closed or cancelled' using errcode = '42501';
  elsif old.status in ('CLOSED', 'CANCELLED') then
    raise exception 'Closed or cancelled subcontracts cannot undergo further transitions' using errcode = '42501';
  end if;

  if new.status = 'APPROVED' then
    select coalesce(sum(scl.amount), 0)
      into v_lines_total
    from public.subcontract_lines scl
    where scl.subcontract_id = old.id and scl.company_id = old.company_id;

    if new.original_amount is distinct from v_lines_total then
      raise exception 'Subcontract original amount must equal the line-item total' using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.subcontract_lines scl
      where scl.subcontract_id = old.id and scl.company_id = old.company_id
    ) then
      raise exception 'A subcontract requires at least one line item before approval' using errcode = '23514';
    end if;
    if coalesce(new.original_amount, 0) <= 0 then
      raise exception 'Subcontract original amount must be positive before approval' using errcode = '23514';
    end if;
  end if;

  -- Preserve prior lifecycle provenance
  new.approved_by_user_id := old.approved_by_user_id;
  new.activated_by_user_id := old.activated_by_user_id;
  new.closed_by_user_id := old.closed_by_user_id;
  new.cancelled_by_user_id := old.cancelled_by_user_id;
  new.approved_at := old.approved_at;
  new.activated_at := old.activated_at;
  new.closed_at := old.closed_at;
  new.cancelled_at := old.cancelled_at;

  if new.status = 'APPROVED' then
    new.approved_by_user_id := v_user_id;
    new.approved_at := now();
    new.cancellation_reason := null;
  elsif new.status = 'ACTIVE' then
    new.activated_by_user_id := v_user_id;
    new.activated_at := now();
    new.cancellation_reason := old.cancellation_reason;
  elsif new.status = 'CLOSED' then
    new.closed_by_user_id := v_user_id;
    new.closed_at := now();
    new.cancellation_reason := old.cancellation_reason;
  elsif new.status = 'CANCELLED' then
    if new.cancellation_reason is null or length(btrim(new.cancellation_reason)) = 0 then
      raise exception 'Cancellation reason is required when cancelling a subcontract' using errcode = '23514';
    end if;
    new.cancelled_by_user_id := v_user_id;
    new.cancelled_at := now();
    new.cancellation_reason := btrim(new.cancellation_reason);
  end if;

  new.updated_by_user_id := v_user_id;
  return new;
end;
$$;

revoke all on function private.validate_subcontract_scope() from public, anon, authenticated;

create or replace function private.prevent_non_draft_subcontract_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select public.has_company_permission(old.company_id, 'procurement.manage')) then
    raise exception 'Unauthorized to delete subcontracts' using errcode = '42501';
  end if;
  if old.status <> 'DRAFT' then
    raise exception 'Only draft subcontracts may be deleted. Approved, active, closed, or cancelled subcontracts must remain auditable.' using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke all on function private.prevent_non_draft_subcontract_delete() from public, anon, authenticated;

-- 4. Line integrity and scope validation
create or replace function private.validate_subcontract_line_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sc_company_id uuid;
  v_sc_project_id uuid;
  v_sc_status text;
  v_project_company_id uuid;
  v_project_status text;
  v_project_archived_at timestamptz;
  v_cost_code_status text;
begin
  if tg_op = 'DELETE' then
    select sc.company_id, sc.project_id, sc.status
      into v_sc_company_id, v_sc_project_id, v_sc_status
    from public.subcontracts sc
    where sc.id = old.subcontract_id
    for update;

    if v_sc_company_id is not null and v_sc_company_id is distinct from old.company_id then
      raise exception 'Subcontract line is outside the company' using errcode = '42501';
    end if;
    if (select auth.uid()) is null
       or not (select public.has_company_permission(coalesce(v_sc_company_id, old.company_id), 'procurement.manage')) then
      raise exception 'Unauthorized to modify subcontract lines' using errcode = '42501';
    end if;

    if v_sc_status is not null and v_sc_status <> 'DRAFT' then
      raise exception 'Cannot delete lines from a non-draft subcontract' using errcode = '42501';
    end if;
    return old;
  end if;

  select sc.company_id, sc.project_id, sc.status
    into v_sc_company_id, v_sc_project_id, v_sc_status
  from public.subcontracts sc
  where sc.id = new.subcontract_id
  for update;

  if v_sc_company_id is null then
    raise exception 'Subcontract line requires an existing subcontract' using errcode = '23503';
  end if;
  if v_sc_company_id is distinct from new.company_id then
    raise exception 'Subcontract line is outside the company' using errcode = '42501';
  end if;
  if (select auth.uid()) is null
     or not (select public.has_company_permission(new.company_id, 'procurement.manage')) then
    raise exception 'Unauthorized to modify subcontract lines' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' and v_sc_status <> 'DRAFT' then
    raise exception 'Cannot add lines to a non-draft subcontract' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if new.company_id is distinct from old.company_id or new.subcontract_id is distinct from old.subcontract_id then
      raise exception 'Subcontract lines cannot be moved between subcontracts or companies' using errcode = '42501';
    end if;
    if v_sc_status <> 'DRAFT' then
      raise exception 'Cannot modify lines on a non-draft subcontract' using errcode = '42501';
    end if;
  end if;

  -- Project lifecycle and cost-code status changes lock in project-then-code
  -- order. Use a locking read so a line cannot rely on a stale ACTIVE project
  -- or cost code after a concurrent archival transaction commits.
  select p.company_id, p.status, p.archived_at
    into v_project_company_id, v_project_status, v_project_archived_at
  from public.projects p
  where p.id = v_sc_project_id
  for share;

  if v_project_company_id is null then
    raise exception 'Subcontract line requires an existing project' using errcode = '23503';
  end if;
  if v_project_company_id is distinct from new.company_id then
    raise exception 'Subcontract line project is outside the company' using errcode = '42501';
  end if;
  if v_project_status = 'ARCHIVED' or v_project_archived_at is not null then
    raise exception 'Archived projects cannot receive subcontract activity' using errcode = '42501';
  end if;

  if new.quantity is not null and new.unit_rate is not null and (new.amount is null or new.amount = 0) then
    new.amount := round(new.quantity * new.unit_rate, 2);
  else
    new.amount := round(coalesce(new.amount, 0), 2);
  end if;

  if new.project_cost_code_id is not null then
    select cc.status into v_cost_code_status
    from public.project_cost_codes cc
    where cc.id = new.project_cost_code_id
      and cc.project_id = v_sc_project_id
      and cc.company_id = new.company_id
    for share;

    if v_cost_code_status is null then
      raise exception 'Cost code does not belong to the same project and company' using errcode = '42501';
    end if;
    if v_cost_code_status <> 'ACTIVE' and (tg_op = 'INSERT' or old.project_cost_code_id is distinct from new.project_cost_code_id) then
      raise exception 'Archived cost codes cannot receive new subcontract line assignments' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
  elsif new.created_at is distinct from old.created_at then
    raise exception 'Subcontract line creation provenance is immutable' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_subcontract_line_scope() from public, anon, authenticated;

-- 5. Recalculate original_amount on header whenever lines change
create or replace function private.sync_subcontract_original_amount()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sc_id uuid;
  v_company_id uuid;
  v_new_total numeric(18,2);
begin
  if tg_op = 'DELETE' then
    v_sc_id := old.subcontract_id;
    v_company_id := old.company_id;
  else
    v_sc_id := new.subcontract_id;
    v_company_id := new.company_id;
  end if;

  if (select auth.uid()) is null
     or not (select public.has_company_permission(v_company_id, 'procurement.manage')) then
    raise exception 'Unauthorized to recalculate subcontract totals' using errcode = '42501';
  end if;

  select coalesce(sum(scl.amount), 0)
    into v_new_total
  from public.subcontract_lines scl
  where scl.subcontract_id = v_sc_id and scl.company_id = v_company_id;

  update public.subcontracts
  set original_amount = v_new_total
  where id = v_sc_id and company_id = v_company_id;

  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;

revoke all on function private.sync_subcontract_original_amount() from public, anon, authenticated;

-- 6. Attach triggers
drop trigger if exists subcontracts_company_boundary on public.subcontracts;
create trigger subcontracts_company_boundary
  before insert or update on public.subcontracts
  for each row execute function private.enforce_company_row_boundary();

drop trigger if exists subcontracts_updated_at on public.subcontracts;
create trigger subcontracts_updated_at
  before update on public.subcontracts
  for each row execute function private.set_company_updated_at();

drop trigger if exists subcontracts_scope_guard on public.subcontracts;
create trigger subcontracts_scope_guard
  before insert or update on public.subcontracts
  for each row execute function private.validate_subcontract_scope();

drop trigger if exists subcontracts_delete_guard on public.subcontracts;
create trigger subcontracts_delete_guard
  before delete on public.subcontracts
  for each row execute function private.prevent_non_draft_subcontract_delete();

drop trigger if exists subcontract_lines_company_boundary on public.subcontract_lines;
create trigger subcontract_lines_company_boundary
  before insert or update on public.subcontract_lines
  for each row execute function private.enforce_company_row_boundary();

drop trigger if exists subcontract_lines_updated_at on public.subcontract_lines;
create trigger subcontract_lines_updated_at
  before update on public.subcontract_lines
  for each row execute function private.set_company_updated_at();

drop trigger if exists subcontract_lines_scope_guard on public.subcontract_lines;
create trigger subcontract_lines_scope_guard
  before insert or update or delete on public.subcontract_lines
  for each row execute function private.validate_subcontract_line_scope();

drop trigger if exists subcontract_lines_recalculate_header on public.subcontract_lines;
create trigger subcontract_lines_recalculate_header
  after insert or update or delete on public.subcontract_lines
  for each row execute function private.sync_subcontract_original_amount();

-- 7. RLS policies
alter table public.subcontracts enable row level security;
alter table public.subcontract_lines enable row level security;

drop policy if exists subcontracts_company_select on public.subcontracts;
create policy subcontracts_company_select on public.subcontracts
  for select to authenticated
  using ((select public.has_company_permission(company_id, 'procurement.read')));

drop policy if exists subcontracts_company_insert on public.subcontracts;
create policy subcontracts_company_insert on public.subcontracts
  for insert to authenticated
  with check ((select public.has_company_permission(company_id, 'procurement.manage')));

drop policy if exists subcontracts_company_update on public.subcontracts;
create policy subcontracts_company_update on public.subcontracts
  for update to authenticated
  using (
    (select public.has_company_permission(company_id, 'procurement.manage')) or
    (select public.has_company_permission(company_id, 'procurement.approve'))
  )
  with check (
    (select public.has_company_permission(company_id, 'procurement.manage')) or
    (select public.has_company_permission(company_id, 'procurement.approve'))
  );

drop policy if exists subcontracts_company_delete on public.subcontracts;
create policy subcontracts_company_delete on public.subcontracts
  for delete to authenticated
  using ((select public.has_company_permission(company_id, 'procurement.manage')));

drop policy if exists subcontract_lines_company_select on public.subcontract_lines;
create policy subcontract_lines_company_select on public.subcontract_lines
  for select to authenticated
  using ((select public.has_company_permission(company_id, 'procurement.read')));

drop policy if exists subcontract_lines_company_insert on public.subcontract_lines;
create policy subcontract_lines_company_insert on public.subcontract_lines
  for insert to authenticated
  with check ((select public.has_company_permission(company_id, 'procurement.manage')));

drop policy if exists subcontract_lines_company_update on public.subcontract_lines;
create policy subcontract_lines_company_update on public.subcontract_lines
  for update to authenticated
  using ((select public.has_company_permission(company_id, 'procurement.manage')))
  with check ((select public.has_company_permission(company_id, 'procurement.manage')));

drop policy if exists subcontract_lines_company_delete on public.subcontract_lines;
create policy subcontract_lines_company_delete on public.subcontract_lines
  for delete to authenticated
  using ((select public.has_company_permission(company_id, 'procurement.manage')));

revoke all on table public.subcontracts, public.subcontract_lines from public, anon;
grant select, insert, update, delete on table public.subcontracts to authenticated;
grant select, insert, update, delete on table public.subcontract_lines to authenticated;

-- 8. Guarded RPC: create_or_update_subcontract
create or replace function public.create_or_update_subcontract(
  p_subcontract jsonb,
  p_lines jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid := nullif(coalesce(p_subcontract->>'companyId', p_subcontract->>'company_id'), '')::uuid;
  v_sc_id uuid := nullif(p_subcontract->>'id', '')::uuid;
  v_subcontract_number text := upper(btrim(coalesce(p_subcontract->>'subcontractNumber', p_subcontract->>'subcontract_number', '')));
  v_vendor_id uuid := nullif(coalesce(p_subcontract->>'vendorId', p_subcontract->>'vendor_id'), '')::uuid;
  v_project_id uuid := nullif(coalesce(p_subcontract->>'projectId', p_subcontract->>'project_id'), '')::uuid;
  v_title text := btrim(coalesce(p_subcontract->>'title', ''));
  v_currency text := upper(btrim(coalesce(p_subcontract->>'currency', 'PHP')));
  v_start_date date := nullif(coalesce(p_subcontract->>'startDate', p_subcontract->>'start_date', ''), '')::date;
  v_target_completion_date date := nullif(coalesce(p_subcontract->>'targetCompletionDate', p_subcontract->>'target_completion_date', ''), '')::date;
  v_notes text := nullif(btrim(coalesce(p_subcontract->>'notes', '')), '');
  v_existing_status text;
  v_line_row jsonb;
  v_line_idx integer := 0;
  v_line_id uuid;
  v_cost_code_id uuid;
  v_quantity numeric(14,4);
  v_unit text;
  v_unit_rate numeric(18,2);
  v_amount numeric(18,2);
  v_res_lines jsonb := '[]'::jsonb;
  v_res_sc jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to save subcontracts' using errcode = '42501';
  end if;
  if v_company_id is null then
    raise exception 'Company ID is required' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then
    raise exception 'Subcontract lines must be a JSON array' using errcode = '22023';
  end if;
  if not (select public.has_company_permission(v_company_id, 'procurement.manage')) then
    raise exception 'Unauthorized to create or edit subcontracts' using errcode = '42501';
  end if;

  if v_sc_id is not null then
    select sc.status into v_existing_status
    from public.subcontracts sc
    where sc.id = v_sc_id and sc.company_id = v_company_id
    for update;

    if v_existing_status is null then
      raise exception 'Subcontract not found in company' using errcode = '23503';
    end if;
    if v_existing_status <> 'DRAFT' then
      raise exception 'Only draft subcontracts can be edited' using errcode = '42501';
    end if;

    update public.subcontracts
    set subcontract_number = v_subcontract_number,
        vendor_id = v_vendor_id,
        project_id = v_project_id,
        title = v_title,
        currency = v_currency,
        start_date = v_start_date,
        target_completion_date = v_target_completion_date,
        notes = v_notes,
        updated_by_user_id = v_user_id
    where id = v_sc_id and company_id = v_company_id;

    delete from public.subcontract_lines
    where subcontract_id = v_sc_id and company_id = v_company_id;
  else
    v_sc_id := gen_random_uuid();
    insert into public.subcontracts (
      id, company_id, subcontract_number, vendor_id, project_id, title,
      currency, status, original_amount, start_date, target_completion_date, notes,
      created_by_user_id, updated_by_user_id
    ) values (
      v_sc_id, v_company_id, v_subcontract_number, v_vendor_id, v_project_id, v_title,
      v_currency, 'DRAFT', 0, v_start_date, v_target_completion_date, v_notes,
      v_user_id, v_user_id
    );
  end if;

  for v_line_row in select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_line_idx := v_line_idx + 1;
    v_line_id := nullif(coalesce(v_line_row->>'id', ''), '')::uuid;
    if v_line_id is null then v_line_id := gen_random_uuid(); end if;
    v_cost_code_id := nullif(coalesce(v_line_row->>'projectCostCodeId', v_line_row->>'project_cost_code_id', v_line_row->>'costCodeId', v_line_row->>'cost_code_id', ''), '')::uuid;
    v_quantity := nullif(v_line_row->>'quantity', '')::numeric;
    v_unit := nullif(btrim(coalesce(v_line_row->>'unit', '')), '');
    v_unit_rate := nullif(coalesce(v_line_row->>'unitRate', v_line_row->>'unit_rate', ''), '')::numeric;
    v_amount := coalesce((v_line_row->>'amount')::numeric, 0);

    if v_amount = 0 and v_quantity is not null and v_unit_rate is not null then
      v_amount := round(v_quantity * v_unit_rate, 2);
    end if;

    insert into public.subcontract_lines (
      id, company_id, subcontract_id, line_number, description,
      amount, quantity, unit, unit_rate, project_cost_code_id, notes
    ) values (
      v_line_id, v_company_id, v_sc_id, v_line_idx,
      btrim(coalesce(v_line_row->>'description', '')),
      v_amount, v_quantity, v_unit, v_unit_rate, v_cost_code_id,
      nullif(btrim(coalesce(v_line_row->>'notes', '')), '')
    );
  end loop;

  select to_jsonb(sc.*) into v_res_sc
  from public.subcontracts sc
  where sc.id = v_sc_id and sc.company_id = v_company_id;

  select coalesce(jsonb_agg(to_jsonb(scl.*) order by scl.line_number asc), '[]'::jsonb)
    into v_res_lines
  from public.subcontract_lines scl
  where scl.subcontract_id = v_sc_id and scl.company_id = v_company_id;

  return jsonb_build_object('subcontract', v_res_sc, 'lines', v_res_lines);
end;
$$;

-- 9. Guarded RPC: transition_subcontract
create or replace function public.transition_subcontract(
  p_subcontract_id uuid,
  p_target_status text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_current_status text;
  v_target_status text := upper(btrim(p_target_status));
  v_res_sc jsonb;
  v_res_lines jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required to transition subcontracts' using errcode = '42501';
  end if;

  select sc.company_id, sc.status into v_company_id, v_current_status
  from public.subcontracts sc
  where sc.id = p_subcontract_id
  for update;

  if v_company_id is null then
    raise exception 'Subcontract not found' using errcode = '23503';
  end if;
  if not (select public.has_company_permission(v_company_id, 'procurement.approve')) then
    raise exception 'Unauthorized to change subcontract lifecycle status' using errcode = '42501';
  end if;
  if v_target_status is null or v_target_status not in ('APPROVED', 'ACTIVE', 'CLOSED', 'CANCELLED') then
    raise exception 'Invalid target status: %', v_target_status using errcode = '22023';
  end if;

  if v_current_status = 'DRAFT' and v_target_status not in ('APPROVED', 'CANCELLED') then
    raise exception 'Draft subcontracts can only be approved or cancelled' using errcode = '42501';
  elsif v_current_status = 'APPROVED' and v_target_status not in ('ACTIVE', 'CANCELLED') then
    raise exception 'Approved subcontracts can only be activated or cancelled' using errcode = '42501';
  elsif v_current_status = 'ACTIVE' and v_target_status not in ('CLOSED', 'CANCELLED') then
    raise exception 'Active subcontracts can only be closed or cancelled' using errcode = '42501';
  elsif v_current_status in ('CLOSED', 'CANCELLED') then
    raise exception 'Closed or cancelled subcontracts cannot undergo further transitions' using errcode = '42501';
  end if;

  update public.subcontracts
  set status = v_target_status,
      cancellation_reason = case when v_target_status = 'CANCELLED' then p_reason else cancellation_reason end
  where id = p_subcontract_id and company_id = v_company_id;

  select to_jsonb(sc.*) into v_res_sc
  from public.subcontracts sc
  where sc.id = p_subcontract_id and sc.company_id = v_company_id;

  select coalesce(jsonb_agg(to_jsonb(scl.*) order by scl.line_number asc), '[]'::jsonb)
    into v_res_lines
  from public.subcontract_lines scl
  where scl.subcontract_id = p_subcontract_id and scl.company_id = v_company_id;

  return jsonb_build_object('subcontract', v_res_sc, 'lines', v_res_lines);
end;
$$;

-- 10. Guarded RPC: delete_draft_subcontract
create or replace function public.delete_draft_subcontract(p_subcontract_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_status text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required to delete subcontracts' using errcode = '42501';
  end if;

  select sc.company_id, sc.status into v_company_id, v_status
  from public.subcontracts sc
  where sc.id = p_subcontract_id
  for update;

  if v_company_id is null then
    return jsonb_build_object('deleted', false, 'id', p_subcontract_id);
  end if;
  if not (select public.has_company_permission(v_company_id, 'procurement.manage')) then
    raise exception 'Unauthorized to delete subcontracts' using errcode = '42501';
  end if;
  if v_status <> 'DRAFT' then
    raise exception 'Only draft subcontracts may be deleted' using errcode = '42501';
  end if;

  delete from public.subcontract_lines
  where subcontract_id = p_subcontract_id and company_id = v_company_id;
  delete from public.subcontracts
  where id = p_subcontract_id and company_id = v_company_id;

  return jsonb_build_object('deleted', true, 'id', p_subcontract_id);
end;
$$;

revoke all on function public.create_or_update_subcontract(jsonb, jsonb) from public, anon;
revoke all on function public.transition_subcontract(uuid, text, text) from public, anon;
revoke all on function public.delete_draft_subcontract(uuid) from public, anon;
grant execute on function public.create_or_update_subcontract(jsonb, jsonb) to authenticated;
grant execute on function public.transition_subcontract(uuid, text, text) to authenticated;
grant execute on function public.delete_draft_subcontract(uuid) to authenticated;

-- 11. Update project lifecycle preflight to account for subcontracts
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
  v_user_id uuid := (select auth.uid());
  v_project public.projects;
  v_invoice_allocations bigint;
  v_expenses bigint;
  v_assignments bigint;
  v_work_entries bigint;
  v_overtime_requests bigint;
  v_payroll_allocations bigint;
  v_payroll_entry_contexts bigint;
  v_import_rows bigint;
  v_worker_defaults bigint;
  v_compensation_defaults bigint;
  v_engineering_documents bigint;
  v_engineering_rfis bigint;
  v_engineering_submittals bigint;
  v_daily_site_logs bigint;
  v_accounting_events bigint;
  v_purchase_orders bigint;
  v_subcontracts bigint;
  v_total bigint;
  v_can_delete boolean;
  v_can_reactivate boolean;
begin
  if v_user_id is null
     or p_company_id is null
     or p_company_id is distinct from (select private.deployment_company_id())
     or not (
       (select private.has_company_permission(p_company_id, 'projects.read'))
       or (select private.has_company_permission(p_company_id, 'projects.manage'))
     ) then
    raise exception 'The current user is not authorized for project lifecycle preflight'
      using errcode = '42501';
  end if;

  select p.*
    into v_project
  from public.projects p
  where p.id = p_project_id
    and p.company_id = p_company_id;

  if not found then
    raise exception 'Project does not exist in the deployment company'
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
  from public.work_entries e
  where e.company_id = p_company_id and e.project_id = p_project_id;

  select count(*) into v_overtime_requests
  from public.overtime_requests o
  where o.company_id = p_company_id and o.project_id = p_project_id;

  select count(*) into v_payroll_allocations
  from public.payroll_project_allocations a
  where a.company_id = p_company_id and a.project_id = p_project_id;

  select count(*) into v_payroll_entry_contexts
  from public.payroll_entries e
  where e.company_id = p_company_id
    and (
      e.cost_context ->> 'projectId' = p_project_id::text
      or e.cost_context ->> 'project_id' = p_project_id::text
      or e.calculation_snapshot #>> '{costContext,projectId}' = p_project_id::text
      or e.calculation_snapshot #>> '{costContext,project_id}' = p_project_id::text
      or e.calculation_snapshot::text like '%' || p_project_id::text || '%'
    );

  select count(*) into v_import_rows
  from public.payroll_import_rows r
  where r.company_id = p_company_id and r.project_id = p_project_id;

  select count(*) into v_worker_defaults
  from public.workers w
  where w.company_id = p_company_id and w.default_project_id = p_project_id;

  select count(*) into v_compensation_defaults
  from public.worker_compensation_profiles cp
  where cp.company_id = p_company_id and cp.default_project_id = p_project_id;

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

  select count(*) into v_subcontracts
  from public.subcontracts sc
  where sc.company_id = p_company_id and sc.project_id = p_project_id;

  v_total := v_invoice_allocations + v_expenses + v_assignments + v_work_entries
    + v_overtime_requests + v_payroll_allocations + v_payroll_entry_contexts
    + v_import_rows + v_worker_defaults + v_compensation_defaults
    + v_engineering_documents + v_engineering_rfis + v_engineering_submittals
    + v_daily_site_logs + v_accounting_events + v_purchase_orders + v_subcontracts;
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
      'purchaseOrders', v_purchase_orders,
      'subcontracts', v_subcontracts
    )
  );
end;
$$;

revoke execute on function private.project_lifecycle_preflight(uuid, uuid) from public, anon, authenticated;
