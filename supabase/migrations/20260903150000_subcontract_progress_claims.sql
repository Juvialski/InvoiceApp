-- ============================================================================
-- Migration: 20260903150000_subcontract_progress_claims.sql
-- Description: P2B-2 Subcontract Progress Claims and Retention
-- ============================================================================

-- Subcontract progress claims represent certified / approved subcontract progress
-- and contractual retention. An approved claim reflects earned progress and consumes
-- the remaining subcontract commitment, but does NOT automatically create an Actual
-- Cost invoice/payment record.

-- 1. Subcontract progress claims header table
create table if not exists public.subcontract_progress_claims (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  subcontract_id uuid not null,
  project_id uuid not null,
  claim_number text not null check (length(btrim(claim_number)) between 1 and 60 and claim_number = upper(btrim(claim_number))),
  valuation_date date not null,
  period_start date,
  period_end date,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'VOIDED')),
  retention_rate numeric(5,4) not null default 0 check (retention_rate >= 0 and retention_rate <= 1),
  claimed_gross_amount numeric(18,2) not null default 0 check (claimed_gross_amount >= 0),
  approved_gross_amount numeric(18,2) not null default 0 check (approved_gross_amount >= 0),
  retention_amount numeric(18,2) not null default 0 check (retention_amount >= 0),
  net_certified_amount numeric(18,2) not null default 0 check (net_certified_amount >= 0),
  notes text,
  rejection_reason text,
  cancellation_reason text,
  void_reason text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  submitted_by_user_id uuid references auth.users(id) on delete set null,
  approved_by_user_id uuid references auth.users(id) on delete set null,
  rejected_by_user_id uuid references auth.users(id) on delete set null,
  cancelled_by_user_id uuid references auth.users(id) on delete set null,
  voided_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  voided_at timestamptz,
  constraint subcontract_claims_period_order_check
    check (period_end is null or period_start is null or period_end >= period_start),
  constraint subcontract_claims_company_id_id_key unique (company_id, id),
  constraint subcontract_claims_company_subcontract_fk
    foreign key (company_id, subcontract_id)
    references public.subcontracts(company_id, id) on delete restrict,
  constraint subcontract_claims_company_project_fk
    foreign key (company_id, project_id)
    references public.projects(company_id, id) on delete restrict
);

create unique index if not exists subcontract_claims_company_sc_number_unique
  on public.subcontract_progress_claims (company_id, subcontract_id, lower(claim_number));
create index if not exists subcontract_claims_subcontract_idx
  on public.subcontract_progress_claims (company_id, subcontract_id, updated_at desc);
create index if not exists subcontract_claims_project_idx
  on public.subcontract_progress_claims (company_id, project_id, status);
create index if not exists subcontract_claims_status_idx
  on public.subcontract_progress_claims (company_id, status);

-- 2. Subcontract progress claim line items
create table if not exists public.subcontract_progress_claim_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  claim_id uuid not null,
  subcontract_line_id uuid not null,
  line_number integer not null default 1 check (line_number >= 1),
  claimed_amount numeric(18,2) not null default 0 check (claimed_amount >= 0),
  approved_amount numeric(18,2) not null default 0 check (approved_amount >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subcontract_claim_lines_company_claim_fk
    foreign key (company_id, claim_id)
    references public.subcontract_progress_claims(company_id, id) on delete cascade,
  constraint subcontract_claim_lines_company_sc_line_fk
    foreign key (company_id, subcontract_line_id)
    references public.subcontract_lines(company_id, id) on delete restrict,
  constraint subcontract_claim_lines_company_claim_sc_line_key
    unique (company_id, claim_id, subcontract_line_id),
  constraint subcontract_claim_lines_company_claim_line_num_key
    unique (company_id, claim_id, line_number)
);

create index if not exists subcontract_claim_lines_claim_idx
  on public.subcontract_progress_claim_lines (company_id, claim_id, line_number asc);
create index if not exists subcontract_claim_lines_sc_line_idx
  on public.subcontract_progress_claim_lines (company_id, subcontract_line_id);

-- 3. Tenant policy catalog registration
insert into private.company_tenant_policy_catalog (table_name, read_permission, write_permission, allow_insert, allow_update, allow_delete)
values
  ('subcontract_progress_claims', 'procurement.read', 'procurement.manage', true, true, true),
  ('subcontract_progress_claim_lines', 'procurement.read', 'procurement.manage', true, true, true)
on conflict (table_name) do update set
  read_permission = excluded.read_permission,
  write_permission = excluded.write_permission,
  allow_insert = excluded.allow_insert,
  allow_update = excluded.allow_update,
  allow_delete = excluded.allow_delete;

-- 4. Scope and lifecycle validation trigger for claim headers
create or replace function private.validate_subcontract_claim_scope()
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
  v_sc_company_id uuid;
  v_sc_project_id uuid;
  v_sc_status text;
  v_has_manage boolean;
  v_has_approve boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication is required for subcontract progress claim activity' using errcode = '42501';
  end if;

  select p.company_id, p.status, p.archived_at
    into v_project_company_id, v_project_status, v_project_archived_at
  from public.projects p
  where p.id = new.project_id
  for key share;

  if v_project_company_id is null then
    raise exception 'Progress claim requires an existing project' using errcode = '23503';
  end if;
  if v_project_company_id is distinct from new.company_id then
    raise exception 'Progress claim project is outside the company' using errcode = '42501';
  end if;

  select sc.company_id, sc.project_id, sc.status
    into v_sc_company_id, v_sc_project_id, v_sc_status
  from public.subcontracts sc
  where sc.id = new.subcontract_id
  for key share;

  if v_sc_company_id is null then
    raise exception 'Progress claim requires an existing subcontract' using errcode = '23503';
  end if;
  if v_sc_company_id is distinct from new.company_id then
    raise exception 'Subcontract is outside the company' using errcode = '42501';
  end if;
  if v_sc_project_id is distinct from new.project_id then
    raise exception 'Subcontract belongs to a different project' using errcode = '42501';
  end if;

  v_has_manage := (select public.has_company_permission(new.company_id, 'procurement.manage'));
  v_has_approve := (select public.has_company_permission(new.company_id, 'procurement.approve'));

  -- Archived projects cannot receive new claims or progress transitions
  if v_project_status = 'ARCHIVED' or v_project_archived_at is not null then
    if tg_op = 'INSERT' then
      raise exception 'Archived projects cannot receive progress claims' using errcode = '42501';
    end if;
    if new.status is not distinct from old.status then
      raise exception 'Archived projects cannot receive progress claim modifications' using errcode = '42501';
    end if;
    if new.status not in ('CANCELLED', 'VOIDED') then
      raise exception 'Archived projects only permit progress claim wind-down to CANCELLED or VOIDED' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if not v_has_manage and not v_has_approve then
      raise exception 'Unauthorized to create progress claims' using errcode = '42501';
    end if;
    if v_sc_status not in ('APPROVED', 'ACTIVE') then
      raise exception 'Subcontracts must be APPROVED or ACTIVE to accept progress claims' using errcode = '42501';
    end if;
    if new.status <> 'DRAFT' then
      raise exception 'Progress claims must be created as DRAFT and transitioned through the guarded lifecycle' using errcode = '42501';
    end if;

    new.created_at := now();
    new.updated_at := now();
    new.created_by_user_id := v_user_id;
    new.updated_by_user_id := v_user_id;
    new.submitted_by_user_id := null;
    new.approved_by_user_id := null;
    new.rejected_by_user_id := null;
    new.cancelled_by_user_id := null;
    new.voided_by_user_id := null;
    new.submitted_at := null;
    new.approved_at := null;
    new.rejected_at := null;
    new.cancelled_at := null;
    new.voided_at := null;
    new.rejection_reason := null;
    new.cancellation_reason := null;
    new.void_reason := null;
    new.claimed_gross_amount := 0;
    new.approved_gross_amount := 0;
    new.retention_amount := 0;
    new.net_certified_amount := 0;
    return new;
  end if;

  if new.company_id is distinct from old.company_id then
    raise exception 'Progress claim company is immutable' using errcode = '42501';
  end if;
  if new.subcontract_id is distinct from old.subcontract_id then
    raise exception 'Progress claim subcontract is immutable' using errcode = '42501';
  end if;
  if new.project_id is distinct from old.project_id then
    raise exception 'Progress claim project is immutable' using errcode = '42501';
  end if;
  if new.created_by_user_id is distinct from old.created_by_user_id or new.created_at is distinct from old.created_at then
    raise exception 'Progress claim creation provenance is immutable' using errcode = '42501';
  end if;

  -- Editing within same status
  if new.status is not distinct from old.status then
    if not v_has_manage and not v_has_approve then
      raise exception 'Unauthorized to edit progress claims' using errcode = '42501';
    end if;
    if old.status <> 'DRAFT' and (
      new.claim_number is distinct from old.claim_number or
      new.valuation_date is distinct from old.valuation_date or
      new.period_start is distinct from old.period_start or
      new.period_end is distinct from old.period_end or
      new.retention_rate is distinct from old.retention_rate or
      new.notes is distinct from old.notes
    ) then
      raise exception 'Submitted, approved, rejected, cancelled, or voided claims cannot be modified directly' using errcode = '42501';
    end if;

    new.updated_by_user_id := v_user_id;
    new.updated_at := now();
    return new;
  end if;

  -- Lifecycle status transitions
  if old.status = 'DRAFT' then
    if new.status not in ('SUBMITTED', 'CANCELLED') then
      raise exception 'Draft claims can only be submitted or cancelled' using errcode = '42501';
    end if;
    if new.status = 'CANCELLED' then
      if new.cancellation_reason is null or btrim(new.cancellation_reason) = '' then
        raise exception 'Cancellation reason is required when cancelling a claim' using errcode = '22023';
      end if;
      new.cancelled_by_user_id := v_user_id;
      new.cancelled_at := now();
    elsif new.status = 'SUBMITTED' then
      new.submitted_by_user_id := v_user_id;
      new.submitted_at := now();
    end if;
  elsif old.status = 'SUBMITTED' then
    if new.status not in ('APPROVED', 'REJECTED', 'CANCELLED') then
      raise exception 'Submitted claims can only be approved, rejected, or cancelled' using errcode = '42501';
    end if;
    if new.status in ('APPROVED', 'REJECTED') and not v_has_approve then
      raise exception 'Approval or rejection of claims requires procurement.approve permission' using errcode = '42501';
    end if;
    if new.status = 'APPROVED' then
      new.approved_by_user_id := v_user_id;
      new.approved_at := now();
    elsif new.status = 'REJECTED' then
      if new.rejection_reason is null or btrim(new.rejection_reason) = '' then
        raise exception 'Rejection reason is required when rejecting a claim' using errcode = '22023';
      end if;
      new.rejected_by_user_id := v_user_id;
      new.rejected_at := now();
    elsif new.status = 'CANCELLED' then
      if new.cancellation_reason is null or btrim(new.cancellation_reason) = '' then
        raise exception 'Cancellation reason is required when cancelling a claim' using errcode = '22023';
      end if;
      new.cancelled_by_user_id := v_user_id;
      new.cancelled_at := now();
    end if;
  elsif old.status = 'APPROVED' then
    if new.status <> 'VOIDED' then
      raise exception 'Approved claims can only be voided' using errcode = '42501';
    end if;
    if not v_has_approve then
      raise exception 'Voiding an approved claim requires procurement.approve permission' using errcode = '42501';
    end if;
    if new.void_reason is null or btrim(new.void_reason) = '' then
      raise exception 'Void reason is required when voiding an approved claim' using errcode = '22023';
    end if;
    new.voided_by_user_id := v_user_id;
    new.voided_at := now();
  elsif old.status in ('REJECTED', 'CANCELLED', 'VOIDED') then
    raise exception 'Terminal claims cannot undergo further transitions' using errcode = '42501';
  end if;

  new.updated_by_user_id := v_user_id;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists validate_subcontract_claim_scope_trigger on public.subcontract_progress_claims;
create trigger validate_subcontract_claim_scope_trigger
  before insert or update on public.subcontract_progress_claims
  for each row execute function private.validate_subcontract_claim_scope();

-- 5. Scope validation for claim line items
create or replace function private.validate_subcontract_claim_line()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_claim_status text;
  v_claim_company_id uuid;
  v_claim_sc_id uuid;
  v_scl_company_id uuid;
  v_scl_subcontract_id uuid;
begin
  select c.status, c.company_id, c.subcontract_id
    into v_claim_status, v_claim_company_id, v_claim_sc_id
  from public.subcontract_progress_claims c
  where c.id = coalesce(new.claim_id, old.claim_id);

  if v_claim_status is null then
    raise exception 'Claim line requires an existing claim' using errcode = '23503';
  end if;

  if tg_op = 'DELETE' then
    if v_claim_status <> 'DRAFT' then
      raise exception 'Lines of non-draft progress claims cannot be deleted' using errcode = '42501';
    end if;
    return old;
  end if;

  if v_claim_company_id is distinct from new.company_id then
    raise exception 'Claim line company does not match claim company' using errcode = '42501';
  end if;

  select scl.company_id, scl.subcontract_id
    into v_scl_company_id, v_scl_subcontract_id
  from public.subcontract_lines scl
  where scl.id = new.subcontract_line_id;

  if v_scl_company_id is null then
    raise exception 'Claim line references a non-existent subcontract line' using errcode = '23503';
  end if;
  if v_scl_company_id is distinct from new.company_id then
    raise exception 'Subcontract line is outside company boundary' using errcode = '42501';
  end if;
  if v_scl_subcontract_id is distinct from v_claim_sc_id then
    raise exception 'Subcontract line belongs to a different subcontract' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and v_claim_status <> 'DRAFT' then
    if new.claimed_amount is distinct from old.claimed_amount or
       new.subcontract_line_id is distinct from old.subcontract_line_id or
       new.line_number is distinct from old.line_number then
      raise exception 'Claimed terms on non-draft claims are immutable' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' and v_claim_status <> 'DRAFT' then
    raise exception 'Lines can only be added to DRAFT claims' using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists validate_subcontract_claim_line_trigger on public.subcontract_progress_claim_lines;
create trigger validate_subcontract_claim_line_trigger
  before insert or update or delete on public.subcontract_progress_claim_lines
  for each row execute function private.validate_subcontract_claim_line();

-- 6. Trigger to automatically recalculate claim header totals on line mutations
create or replace function private.sync_subcontract_claim_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim_id uuid := coalesce(new.claim_id, old.claim_id);
  v_claimed_gross numeric(18,2) := 0;
  v_approved_gross numeric(18,2) := 0;
  v_rate numeric(5,4) := 0;
  v_retention numeric(18,2) := 0;
  v_net numeric(18,2) := 0;
begin
  select coalesce(sum(l.claimed_amount), 0), coalesce(sum(l.approved_amount), 0)
    into v_claimed_gross, v_approved_gross
  from public.subcontract_progress_claim_lines l
  where l.claim_id = v_claim_id;

  select c.retention_rate into v_rate
  from public.subcontract_progress_claims c
  where c.id = v_claim_id;

  v_rate := coalesce(v_rate, 0);
  v_retention := round(v_approved_gross * v_rate, 2);
  v_net := round(v_approved_gross - v_retention, 2);

  update public.subcontract_progress_claims
  set claimed_gross_amount = v_claimed_gross,
      approved_gross_amount = v_approved_gross,
      retention_amount = v_retention,
      net_certified_amount = v_net,
      updated_at = now()
  where id = v_claim_id;

  return null;
end;
$$;

drop trigger if exists sync_subcontract_claim_totals_trigger on public.subcontract_progress_claim_lines;
create trigger sync_subcontract_claim_totals_trigger
  after insert or update or delete on public.subcontract_progress_claim_lines
  for each row execute function private.sync_subcontract_claim_totals();

-- 7. RLS policies
alter table public.subcontract_progress_claims enable row level security;
alter table public.subcontract_progress_claim_lines enable row level security;

drop policy if exists subcontract_claims_company_select on public.subcontract_progress_claims;
create policy subcontract_claims_company_select on public.subcontract_progress_claims
  for select to authenticated
  using ((select public.has_company_permission(company_id, 'procurement.read')));

drop policy if exists subcontract_claims_company_insert on public.subcontract_progress_claims;
create policy subcontract_claims_company_insert on public.subcontract_progress_claims
  for insert to authenticated
  with check ((select public.has_company_permission(company_id, 'procurement.manage')));

drop policy if exists subcontract_claims_company_update on public.subcontract_progress_claims;
create policy subcontract_claims_company_update on public.subcontract_progress_claims
  for update to authenticated
  using (
    (select public.has_company_permission(company_id, 'procurement.manage')) or
    (select public.has_company_permission(company_id, 'procurement.approve'))
  )
  with check (
    (select public.has_company_permission(company_id, 'procurement.manage')) or
    (select public.has_company_permission(company_id, 'procurement.approve'))
  );

drop policy if exists subcontract_claims_company_delete on public.subcontract_progress_claims;
create policy subcontract_claims_company_delete on public.subcontract_progress_claims
  for delete to authenticated
  using ((select public.has_company_permission(company_id, 'procurement.manage')));

drop policy if exists subcontract_claim_lines_company_select on public.subcontract_progress_claim_lines;
create policy subcontract_claim_lines_company_select on public.subcontract_progress_claim_lines
  for select to authenticated
  using ((select public.has_company_permission(company_id, 'procurement.read')));

drop policy if exists subcontract_claim_lines_company_insert on public.subcontract_progress_claim_lines;
create policy subcontract_claim_lines_company_insert on public.subcontract_progress_claim_lines
  for insert to authenticated
  with check ((select public.has_company_permission(company_id, 'procurement.manage')));

drop policy if exists subcontract_claim_lines_company_update on public.subcontract_progress_claim_lines;
create policy subcontract_claim_lines_company_update on public.subcontract_progress_claim_lines
  for update to authenticated
  using (
    (select public.has_company_permission(company_id, 'procurement.manage')) or
    (select public.has_company_permission(company_id, 'procurement.approve'))
  )
  with check (
    (select public.has_company_permission(company_id, 'procurement.manage')) or
    (select public.has_company_permission(company_id, 'procurement.approve'))
  );

drop policy if exists subcontract_claim_lines_company_delete on public.subcontract_progress_claim_lines;
create policy subcontract_claim_lines_company_delete on public.subcontract_progress_claim_lines
  for delete to authenticated
  using ((select public.has_company_permission(company_id, 'procurement.manage')));

revoke all on table public.subcontract_progress_claims, public.subcontract_progress_claim_lines from public, anon;
grant select, insert, update, delete on table public.subcontract_progress_claims to authenticated;
grant select, insert, update, delete on table public.subcontract_progress_claim_lines to authenticated;

-- 8. Guarded RPC: create_or_update_subcontract_claim
create or replace function public.create_or_update_subcontract_claim(
  p_claim jsonb,
  p_lines jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid;
  v_claim_id uuid;
  v_subcontract_id uuid;
  v_project_id uuid;
  v_claim_number text;
  v_valuation_date date;
  v_period_start date;
  v_period_end date;
  v_retention_rate numeric(5,4);
  v_notes text;
  v_existing_status text;
  v_line_row jsonb;
  v_line_idx integer := 0;
  v_line_id uuid;
  v_scl_id uuid;
  v_claimed_amount numeric(18,2);
  v_res_claim jsonb;
  v_res_lines jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  v_company_id := nullif(coalesce(p_claim->>'companyId', p_claim->>'company_id', ''), '')::uuid;
  if v_company_id is null then
    v_company_id := (select private.deployment_company_id());
  end if;
  if v_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Deployment company boundary violated' using errcode = '42501';
  end if;

  if not (select public.has_company_permission(v_company_id, 'procurement.manage')) then
    raise exception 'Unauthorized to create or edit progress claims' using errcode = '42501';
  end if;

  v_claim_id := nullif(coalesce(p_claim->>'id', ''), '')::uuid;
  v_subcontract_id := nullif(coalesce(p_claim->>'subcontractId', p_claim->>'subcontract_id', ''), '')::uuid;
  v_project_id := nullif(coalesce(p_claim->>'projectId', p_claim->>'project_id', ''), '')::uuid;
  v_claim_number := upper(btrim(coalesce(p_claim->>'claimNumber', p_claim->>'claim_number', '')));
  v_valuation_date := nullif(coalesce(p_claim->>'valuationDate', p_claim->>'valuation_date', ''), '')::date;
  v_period_start := nullif(coalesce(p_claim->>'periodStart', p_claim->>'period_start', ''), '')::date;
  v_period_end := nullif(coalesce(p_claim->>'periodEnd', p_claim->>'period_end', ''), '')::date;
  v_retention_rate := coalesce((p_claim->>'retentionRate')::numeric, (p_claim->>'retention_rate')::numeric, 0);
  v_notes := nullif(btrim(coalesce(p_claim->>'notes', '')), '');

  if v_subcontract_id is null then
    raise exception 'Subcontract ID is required' using errcode = '22023';
  end if;
  if v_project_id is null then
    raise exception 'Project ID is required' using errcode = '22023';
  end if;
  if v_claim_number = '' then
    raise exception 'Claim number is required' using errcode = '22023';
  end if;
  if v_valuation_date is null then
    raise exception 'Valuation date is required' using errcode = '22023';
  end if;
  if v_retention_rate < 0 or v_retention_rate > 1 then
    raise exception 'Retention rate must be between 0 and 1' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'At least one progress claim line is required' using errcode = '22023';
  end if;

  if v_claim_id is not null then
    select c.status into v_existing_status
    from public.subcontract_progress_claims c
    where c.id = v_claim_id and c.company_id = v_company_id
    for update;

    if v_existing_status is null then
      raise exception 'Progress claim not found in company' using errcode = '23503';
    end if;
    if v_existing_status <> 'DRAFT' then
      raise exception 'Only draft progress claims can be edited' using errcode = '42501';
    end if;

    update public.subcontract_progress_claims
    set claim_number = v_claim_number,
        valuation_date = v_valuation_date,
        period_start = v_period_start,
        period_end = v_period_end,
        retention_rate = v_retention_rate,
        notes = v_notes,
        updated_by_user_id = v_user_id,
        updated_at = now()
    where id = v_claim_id and company_id = v_company_id;

    delete from public.subcontract_progress_claim_lines
    where claim_id = v_claim_id and company_id = v_company_id;
  else
    v_claim_id := gen_random_uuid();
    insert into public.subcontract_progress_claims (
      id, company_id, subcontract_id, project_id, claim_number,
      valuation_date, period_start, period_end, status, retention_rate,
      notes, created_by_user_id, updated_by_user_id
    ) values (
      v_claim_id, v_company_id, v_subcontract_id, v_project_id, v_claim_number,
      v_valuation_date, v_period_start, v_period_end, 'DRAFT', v_retention_rate,
      v_notes, v_user_id, v_user_id
    );
  end if;

  for v_line_row in select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_line_idx := v_line_idx + 1;
    v_line_id := nullif(coalesce(v_line_row->>'id', ''), '')::uuid;
    if v_line_id is null then v_line_id := gen_random_uuid(); end if;
    v_scl_id := nullif(coalesce(v_line_row->>'subcontractLineId', v_line_row->>'subcontract_line_id', ''), '')::uuid;
    v_claimed_amount := coalesce((v_line_row->>'claimedAmount')::numeric, (v_line_row->>'claimed_amount')::numeric, 0);

    if v_scl_id is null then
      raise exception 'Line %: Subcontract line reference is required', v_line_idx using errcode = '22023';
    end if;
    if v_claimed_amount < 0 then
      raise exception 'Line %: Claimed amount must be non-negative', v_line_idx using errcode = '22023';
    end if;

    insert into public.subcontract_progress_claim_lines (
      id, company_id, claim_id, subcontract_line_id, line_number,
      claimed_amount, approved_amount, notes
    ) values (
      v_line_id, v_company_id, v_claim_id, v_scl_id, v_line_idx,
      v_claimed_amount, 0, nullif(btrim(coalesce(v_line_row->>'notes', '')), '')
    );
  end loop;

  select to_jsonb(c.*) into v_res_claim
  from public.subcontract_progress_claims c
  where c.id = v_claim_id and c.company_id = v_company_id;

  select coalesce(jsonb_agg(to_jsonb(l.*) order by l.line_number asc), '[]'::jsonb)
    into v_res_lines
  from public.subcontract_progress_claim_lines l
  where l.claim_id = v_claim_id and l.company_id = v_company_id;

  return jsonb_build_object('claim', v_res_claim, 'lines', v_res_lines);
end;
$$;

-- 9. Guarded RPC: transition_subcontract_claim
create or replace function public.transition_subcontract_claim(
  p_claim_id uuid,
  p_target_status text,
  p_reason text default null,
  p_line_approvals jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid;
  v_claim record;
  v_subcontract record;
  v_target_status text := upper(btrim(p_target_status));
  v_approval_row jsonb;
  v_app_line_id uuid;
  v_app_amount numeric(18,2);
  v_line record;
  v_prev_line_approved numeric(18,2);
  v_prev_header_approved numeric(18,2);
  v_res_claim jsonb;
  v_res_lines jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select * into v_claim
  from public.subcontract_progress_claims
  where id = p_claim_id
  for update;

  if v_claim.id is null then
    raise exception 'Progress claim not found' using errcode = '23503';
  end if;

  v_company_id := v_claim.company_id;

  -- Lock the parent subcontract to guard against concurrent over-claiming
  select * into v_subcontract
  from public.subcontracts
  where id = v_claim.subcontract_id and company_id = v_company_id
  for update;

  if v_subcontract.id is null then
    raise exception 'Parent subcontract not found' using errcode = '23503';
  end if;

  if v_target_status = 'APPROVED' then
    if not (select public.has_company_permission(v_company_id, 'procurement.approve')) then
      raise exception 'Approval requires procurement.approve permission' using errcode = '42501';
    end if;

    -- If line approvals are passed, update line approved amounts first
    if p_line_approvals is not null and jsonb_typeof(p_line_approvals) = 'array' then
      for v_approval_row in select value from jsonb_array_elements(p_line_approvals) loop
        v_app_line_id := nullif(coalesce(v_approval_row->>'id', v_approval_row->>'claimLineId', v_approval_row->>'claim_line_id', ''), '')::uuid;
        v_app_amount := coalesce((v_approval_row->>'approvedAmount')::numeric, (v_approval_row->>'approved_amount')::numeric, 0);

        if v_app_line_id is not null then
          update public.subcontract_progress_claim_lines
          set approved_amount = v_app_amount
          where id = v_app_line_id and claim_id = p_claim_id and company_id = v_company_id;
        end if;
      end loop;
    else
      -- Default: approve claimed amount if not explicitly passed
      update public.subcontract_progress_claim_lines
      set approved_amount = claimed_amount
      where claim_id = p_claim_id and company_id = v_company_id;
    end if;

    -- Enforce Over-Claim Protection at line level and contract level
    for v_line in
      select cl.id, cl.subcontract_line_id, cl.claimed_amount, cl.approved_amount, scl.amount as sc_line_amount, scl.line_number
      from public.subcontract_progress_claim_lines cl
      join public.subcontract_lines scl on cl.subcontract_line_id = scl.id and cl.company_id = scl.company_id
      where cl.claim_id = p_claim_id
      for update of scl
    loop
      if v_line.approved_amount < 0 then
        raise exception 'Approved amount cannot be negative for line %', v_line.line_number using errcode = '22023';
      end if;
      if v_line.approved_amount > v_line.claimed_amount then
        raise exception 'Approved amount (%) exceeds claimed amount (%) for line %', v_line.approved_amount, v_line.claimed_amount, v_line.line_number using errcode = '23514';
      end if;

      -- Check cumulative approved against subcontract line
      select coalesce(sum(other_cl.approved_amount), 0)
        into v_prev_line_approved
      from public.subcontract_progress_claim_lines other_cl
      join public.subcontract_progress_claims other_c on other_cl.claim_id = other_c.id and other_cl.company_id = other_c.company_id
      where other_cl.subcontract_line_id = v_line.subcontract_line_id
        and other_cl.company_id = v_company_id
        and other_c.status = 'APPROVED'
        and other_c.id <> p_claim_id;

      if round(v_prev_line_approved + v_line.approved_amount, 2) > round(v_line.sc_line_amount, 2) then
        raise exception 'Cumulative approved amount (% + %) exceeds subcontract line % amount (%)',
          v_prev_line_approved, v_line.approved_amount, v_line.line_number, v_line.sc_line_amount using errcode = '23514';
      end if;
    end loop;

    -- Check cumulative approved gross against subcontract original amount
    select coalesce(sum(other_c.approved_gross_amount), 0)
      into v_prev_header_approved
    from public.subcontract_progress_claims other_c
    where other_c.subcontract_id = v_claim.subcontract_id
      and other_c.company_id = v_company_id
      and other_c.status = 'APPROVED'
      and other_c.id <> p_claim_id;

    select coalesce(sum(l.approved_amount), 0) into v_app_amount
    from public.subcontract_progress_claim_lines l
    where l.claim_id = p_claim_id;

    if round(v_prev_header_approved + v_app_amount, 2) > round(v_subcontract.original_amount, 2) then
      raise exception 'Cumulative approved claims (% + %) exceeds subcontract original amount (%)',
        v_prev_header_approved, v_app_amount, v_subcontract.original_amount using errcode = '23514';
    end if;
  end if;

  update public.subcontract_progress_claims
  set status = v_target_status,
      rejection_reason = case when v_target_status = 'REJECTED' then p_reason else rejection_reason end,
      cancellation_reason = case when v_target_status = 'CANCELLED' then p_reason else cancellation_reason end,
      void_reason = case when v_target_status = 'VOIDED' then p_reason else void_reason end
  where id = p_claim_id and company_id = v_company_id;

  select to_jsonb(c.*) into v_res_claim
  from public.subcontract_progress_claims c
  where c.id = p_claim_id and c.company_id = v_company_id;

  select coalesce(jsonb_agg(to_jsonb(l.*) order by l.line_number asc), '[]'::jsonb)
    into v_res_lines
  from public.subcontract_progress_claim_lines l
  where l.claim_id = p_claim_id and l.company_id = v_company_id;

  return jsonb_build_object('claim', v_res_claim, 'lines', v_res_lines);
end;
$$;

-- 10. Guarded RPC: delete_draft_subcontract_claim
create or replace function public.delete_draft_subcontract_claim(p_claim_id uuid)
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
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select c.company_id, c.status into v_company_id, v_status
  from public.subcontract_progress_claims c
  where c.id = p_claim_id
  for update;

  if v_company_id is null then
    return jsonb_build_object('deleted', false, 'id', p_claim_id);
  end if;
  if not (select public.has_company_permission(v_company_id, 'procurement.manage')) then
    raise exception 'Unauthorized to delete progress claims' using errcode = '42501';
  end if;
  if v_status <> 'DRAFT' then
    raise exception 'Only draft progress claims may be deleted' using errcode = '42501';
  end if;

  delete from public.subcontract_progress_claim_lines
  where claim_id = p_claim_id and company_id = v_company_id;
  delete from public.subcontract_progress_claims
  where id = p_claim_id and company_id = v_company_id;

  return jsonb_build_object('deleted', true, 'id', p_claim_id);
end;
$$;

revoke all on function public.create_or_update_subcontract_claim(jsonb, jsonb) from public, anon;
revoke all on function public.transition_subcontract_claim(uuid, text, text, jsonb) from public, anon;
revoke all on function public.delete_draft_subcontract_claim(uuid) from public, anon;
grant execute on function public.create_or_update_subcontract_claim(jsonb, jsonb) to authenticated;
grant execute on function public.transition_subcontract_claim(uuid, text, text, jsonb) to authenticated;
grant execute on function public.delete_draft_subcontract_claim(uuid) to authenticated;

-- 11. Update project lifecycle preflight to protect projects with claim history
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
  v_subcontract_claims bigint;
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
  from public.invoice_project_allocations ipa
  join public.invoices i on i.id = ipa.invoice_id
  where ipa.project_id = p_project_id
    and i.company_id = p_company_id;

  select count(*) into v_expenses
  from public.expenses e
  where e.project_id = p_project_id
    and e.company_id = p_company_id;

  select count(*) into v_assignments
  from public.project_worker_assignments pwa
  where pwa.project_id = p_project_id
    and pwa.company_id = p_company_id;

  select count(*) into v_work_entries
  from public.work_entries we
  where we.project_id = p_project_id
    and we.company_id = p_company_id;

  select count(*) into v_overtime_requests
  from public.overtime_requests otr
  where otr.project_id = p_project_id
    and otr.company_id = p_company_id;

  select count(*) into v_payroll_allocations
  from public.payroll_project_allocations ppa
  join public.payroll_runs pr on pr.id = ppa.payroll_run_id
  where ppa.project_id = p_project_id
    and pr.company_id = p_company_id;

  select count(*) into v_payroll_entry_contexts
  from public.payroll_entries pe
  join public.payroll_runs pr on pr.id = pe.payroll_run_id
  where pr.company_id = p_company_id
    and coalesce(pe.cost_context->>'projectId', pe.cost_context->>'project_id') = p_project_id::text;

  select count(*) into v_import_rows
  from public.payroll_import_rows pir
  join public.payroll_import_batches pib on pib.id = pir.batch_id
  where pib.company_id = p_company_id
    and (
      pir.raw_data->>'projectId' = p_project_id::text
      or pir.raw_data->>'project_id' = p_project_id::text
      or pir.resolved_project_id = p_project_id
    );

  select count(*) into v_worker_defaults
  from public.workers w
  where w.default_project_id = p_project_id
    and w.company_id = p_company_id;

  select count(*) into v_compensation_defaults
  from public.worker_compensation_profiles wcp
  where wcp.default_project_id = p_project_id
    and wcp.company_id = p_company_id;

  select count(*) into v_engineering_documents
  from public.engineering_documents ed
  where ed.project_id = p_project_id
    and ed.company_id = p_company_id;

  select count(*) into v_engineering_rfis
  from public.engineering_rfis rfi
  where rfi.project_id = p_project_id
    and rfi.company_id = p_company_id;

  select count(*) into v_engineering_submittals
  from public.engineering_submittals sub
  where sub.project_id = p_project_id
    and sub.company_id = p_company_id;

  select count(*) into v_daily_site_logs
  from public.engineering_daily_site_logs dsl
  where dsl.project_id = p_project_id
    and dsl.company_id = p_company_id;

  select count(*) into v_accounting_events
  from public.project_accounting_events pae
  where pae.project_id = p_project_id
    and pae.company_id = p_company_id;

  select count(*) into v_purchase_orders
  from public.purchase_orders po
  where po.project_id = p_project_id
    and po.company_id = p_company_id;

  select count(*) into v_subcontracts
  from public.subcontracts sc
  where sc.project_id = p_project_id
    and sc.company_id = p_company_id;

  select count(*) into v_subcontract_claims
  from public.subcontract_progress_claims sc_cl
  where sc_cl.project_id = p_project_id
    and sc_cl.company_id = p_company_id;

  v_total := coalesce(v_invoice_allocations, 0)
    + coalesce(v_expenses, 0)
    + coalesce(v_assignments, 0)
    + coalesce(v_work_entries, 0)
    + coalesce(v_overtime_requests, 0)
    + coalesce(v_payroll_allocations, 0)
    + coalesce(v_payroll_entry_contexts, 0)
    + coalesce(v_import_rows, 0)
    + coalesce(v_worker_defaults, 0)
    + coalesce(v_compensation_defaults, 0)
    + coalesce(v_engineering_documents, 0)
    + coalesce(v_engineering_rfis, 0)
    + coalesce(v_engineering_submittals, 0)
    + coalesce(v_daily_site_logs, 0)
    + coalesce(v_accounting_events, 0)
    + coalesce(v_purchase_orders, 0)
    + coalesce(v_subcontracts, 0)
    + coalesce(v_subcontract_claims, 0);

  v_can_delete := v_total = 0;
  v_can_reactivate := v_project.status = 'ARCHIVED'
    and v_project.archived_at is not null
    and (
      v_project.archived_from_status is null
      or v_project.archived_from_status in ('PLANNING', 'ACTIVE', 'ON_HOLD')
    );

  return jsonb_build_object(
    'projectId', v_project.id,
    'projectCode', v_project.project_code,
    'projectName', v_project.project_name,
    'status', v_project.status,
    'archivedAt', v_project.archived_at,
    'archivedFromStatus', v_project.archived_from_status,
    'canDelete', v_can_delete,
    'canReactivate', v_can_reactivate,
    'recommendedAction', case
      when v_project.status = 'ARCHIVED' and v_can_reactivate then 'REACTIVATE'
      when v_can_delete then 'DELETE_UNUSED'
      else 'ARCHIVE'
    end,
    'blockedReason', case
      when v_can_delete then null
      else format('Project has %s dependent records across engineering, procurement, financial, workforce, or subcontract domains.', v_total)
    end,
    'totalDependencyCount', v_total,
    'dependencies', jsonb_build_object(
      'invoiceProjectAllocations', coalesce(v_invoice_allocations, 0),
      'expenses', coalesce(v_expenses, 0),
      'projectWorkerAssignments', coalesce(v_assignments, 0),
      'workEntries', coalesce(v_work_entries, 0),
      'overtimeRequests', coalesce(v_overtime_requests, 0),
      'payrollProjectAllocations', coalesce(v_payroll_allocations, 0),
      'payrollEntryProjectContexts', coalesce(v_payroll_entry_contexts, 0),
      'payrollImportRows', coalesce(v_import_rows, 0),
      'workerDefaultProjects', coalesce(v_worker_defaults, 0),
      'compensationProfileDefaultProjects', coalesce(v_compensation_defaults, 0),
      'engineeringDocuments', coalesce(v_engineering_documents, 0),
      'engineeringRfis', coalesce(v_engineering_rfis, 0),
      'engineeringSubmittals', coalesce(v_engineering_submittals, 0),
      'engineeringDailySiteLogs', coalesce(v_daily_site_logs, 0),
      'projectAccountingEvents', coalesce(v_accounting_events, 0),
      'purchaseOrders', coalesce(v_purchase_orders, 0),
      'subcontracts', coalesce(v_subcontracts, 0),
      'subcontractProgressClaims', coalesce(v_subcontract_claims, 0)
    ),
    'source', 'database'
  );
end;
$$;

revoke execute on function private.project_lifecycle_preflight(uuid, uuid) from public, anon, authenticated;
