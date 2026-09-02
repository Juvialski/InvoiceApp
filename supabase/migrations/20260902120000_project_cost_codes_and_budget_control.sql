-- ============================================================================
-- Migration: 20260902120000_project_cost_codes_and_budget_control.sql
-- Description: P1B Project Cost Codes, Budget Control Invariants & Allocation References
-- ============================================================================

-- 1. Create project_cost_codes table
create table if not exists public.project_cost_codes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  code text not null check (length(btrim(code)) between 1 and 50 and code = upper(btrim(code))),
  name text not null check (length(btrim(name)) between 1 and 200),
  description text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'ARCHIVED')),
  approved_budget_amount numeric(18,2) not null default 0 check (approved_budget_amount >= 0),
  forecast_amount numeric(18,2) check (forecast_amount is null or forecast_amount >= 0),
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint project_cost_codes_company_project_id_key unique (company_id, project_id, id)
);

-- Unique index on code per project (case-insensitive)
create unique index if not exists project_cost_codes_company_project_code_unique
  on public.project_cost_codes (company_id, project_id, lower(code));

create index if not exists project_cost_codes_company_project_status_idx
  on public.project_cost_codes (company_id, project_id, status, updated_at desc);

-- 2. Triggers on project_cost_codes
drop trigger if exists project_cost_codes_company_boundary on public.project_cost_codes;
create trigger project_cost_codes_company_boundary
  before insert or update on public.project_cost_codes
  for each row execute function private.enforce_company_row_boundary();

drop trigger if exists project_cost_codes_updated_at on public.project_cost_codes;
create trigger project_cost_codes_updated_at
  before update on public.project_cost_codes
  for each row execute function private.set_company_updated_at();

drop trigger if exists project_cost_codes_project_activity on public.project_cost_codes;
create trigger project_cost_codes_project_activity
  before insert or update on public.project_cost_codes
  for each row execute function public.prevent_archived_project_activity();

-- 3. Budget total assertion trigger function
create or replace function public.assert_project_cost_code_budget_totals(target_project uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project_budget numeric;
  v_allocated_total numeric;
  v_company_id uuid;
begin
  if target_project is null then return; end if;

  select p.company_id, p.project_budget
    into v_company_id, v_project_budget
  from public.projects p
  where p.id = target_project;

  if v_project_budget is null then return; end if;

  select coalesce(sum(cc.approved_budget_amount), 0)
    into v_allocated_total
  from public.project_cost_codes cc
  where cc.project_id = target_project
    and cc.company_id = v_company_id
    and cc.status = 'ACTIVE';

  if v_allocated_total > v_project_budget + 0.01 then
    raise exception 'Active cost code budgets (%) exceed project approved budget (%) by %',
      v_allocated_total, v_project_budget, round(v_allocated_total - v_project_budget, 2)
      using errcode = '23514';
  end if;
end;
$$;

create or replace function public.validate_project_cost_code_budget_total()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.project_id is distinct from new.project_id) then
    perform public.assert_project_cost_code_budget_totals(old.project_id);
  end if;
  if tg_op <> 'DELETE' then
    perform public.assert_project_cost_code_budget_totals(new.project_id);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists project_cost_code_budget_total_check on public.project_cost_codes;
create constraint trigger project_cost_code_budget_total_check
  after insert or update or delete on public.project_cost_codes
  deferrable initially deferred
  for each row execute function public.validate_project_cost_code_budget_total();

-- Check when project.project_budget is reduced
create or replace function public.validate_project_budget_reduction()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.project_budget is distinct from old.project_budget then
    perform public.assert_project_cost_code_budget_totals(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists projects_budget_reduction_check on public.projects;
create constraint trigger projects_budget_reduction_check
  after update of project_budget on public.projects
  deferrable initially deferred
  for each row execute function public.validate_project_budget_reduction();

-- 4. Alter child tables to add project_cost_code_id
alter table public.invoice_project_allocations
  add column if not exists project_cost_code_id uuid;

alter table public.invoice_project_allocations
  drop constraint if exists invoice_project_allocations_cost_code_fk;
alter table public.invoice_project_allocations
  add constraint invoice_project_allocations_cost_code_fk
  foreign key (company_id, project_id, project_cost_code_id)
  references public.project_cost_codes(company_id, project_id, id)
  on delete restrict;

create index if not exists invoice_project_allocations_cost_code_idx
  on public.invoice_project_allocations(company_id, project_cost_code_id)
  where project_cost_code_id is not null;

alter table public.payroll_project_allocations
  add column if not exists project_cost_code_id uuid;

alter table public.payroll_project_allocations
  drop constraint if exists payroll_project_allocations_cost_code_fk;
alter table public.payroll_project_allocations
  add constraint payroll_project_allocations_cost_code_fk
  foreign key (company_id, project_id, project_cost_code_id)
  references public.project_cost_codes(company_id, project_id, id)
  on delete restrict;

create index if not exists payroll_project_allocations_cost_code_idx
  on public.payroll_project_allocations(company_id, project_cost_code_id)
  where project_cost_code_id is not null;

alter table public.expenses
  add column if not exists project_cost_code_id uuid;

alter table public.expenses
  drop constraint if exists expenses_cost_code_fk;
alter table public.expenses
  add constraint expenses_cost_code_fk
  foreign key (company_id, project_id, project_cost_code_id)
  references public.project_cost_codes(company_id, project_id, id)
  on delete restrict;

create index if not exists expenses_cost_code_idx
  on public.expenses(company_id, project_cost_code_id)
  where project_cost_code_id is not null;

-- 5. Update validation triggers on child tables
create or replace function public.validate_invoice_project_allocation_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.invoices i
    join public.projects p on p.id = new.project_id
    where i.id = new.invoice_id
      and i.company_id = new.company_id
      and p.company_id = new.company_id
  ) then
    raise exception 'Invoice and project must belong to the same company';
  end if;

  if new.project_cost_code_id is not null and not exists (
    select 1
    from public.project_cost_codes cc
    where cc.id = new.project_cost_code_id
      and cc.project_id = new.project_id
      and cc.company_id = new.company_id
  ) then
    raise exception 'Cost code does not belong to the same project and company';
  end if;
  return new;
end;
$$;

create or replace function public.validate_payroll_project_allocation_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.payroll_entries pe
    join public.projects p on p.id = new.project_id
    where pe.id = new.payroll_entry_id
      and pe.company_id = new.company_id
      and p.company_id = new.company_id
  ) then
    raise exception 'Payroll allocation entry and project must belong to the same company';
  end if;

  if new.project_cost_code_id is not null and not exists (
    select 1
    from public.project_cost_codes cc
    where cc.id = new.project_cost_code_id
      and cc.project_id = new.project_id
      and cc.company_id = new.company_id
  ) then
    raise exception 'Cost code does not belong to the same project and company';
  end if;
  return new;
end;
$$;

create or replace function public.validate_expense_project_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.project_id is not null and not exists (
    select 1 from public.projects p where p.id = new.project_id and p.company_id = new.company_id
  ) then
    raise exception 'Expense project is outside the company';
  end if;
  if new.receipt_source_document_id is not null and not exists (
    select 1 from public.source_documents d where d.id = new.receipt_source_document_id and d.company_id = new.company_id
  ) then
    raise exception 'Expense receipt source is outside the company';
  end if;
  if new.project_cost_code_id is not null then
    if new.project_id is null then
      raise exception 'Cost code requires an associated project';
    end if;
    if not exists (
      select 1
      from public.project_cost_codes cc
      where cc.id = new.project_cost_code_id
        and cc.project_id = new.project_id
        and cc.company_id = new.company_id
    ) then
      raise exception 'Cost code does not belong to the same project and company';
    end if;
  end if;
  return new;
end;
$$;

-- 6. Update replace_invoice_project_allocations to support project_cost_code_id
create or replace function public.replace_invoice_project_allocations(
  p_invoice_id uuid,
  p_allocations jsonb default '[]'::jsonb
)
returns setof public.invoice_project_allocations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid;
  v_invoice_total numeric;
  v_payload jsonb := coalesce(p_allocations, '[]'::jsonb);
  v_row jsonb;
  v_item jsonb;
  v_project_id uuid;
  v_allocation_id uuid;
  v_cost_code_id uuid;
  v_allocation_type text;
  v_allocation_percentage numeric;
  v_allocation_amount numeric;
  v_total numeric := 0;
  v_percentage_total numeric := 0;
  v_seen_project_ids uuid[] := array[]::uuid[];
  v_new_allocations jsonb := '[]'::jsonb;
  v_previous_allocations jsonb;
  v_archived_at timestamptz;
  v_project_status text;
begin
  if v_user_id is null then raise exception 'Authentication is required to replace invoice project allocations' using errcode = '42501'; end if;
  if p_invoice_id is null then raise exception 'Invoice id is required' using errcode = '22023'; end if;
  if jsonb_typeof(v_payload) <> 'array' then raise exception 'Invoice project allocations must be a JSON array' using errcode = '22023'; end if;

  select i.company_id, i.grand_total into v_company_id, v_invoice_total
  from public.invoices i
  where i.id = p_invoice_id
    and (select public.has_company_permission(i.company_id, 'invoices.manage'))
  for update;
  if not found then raise exception 'Invoice does not exist in an authorized company' using errcode = '42501'; end if;

  for v_row in select value from jsonb_array_elements(v_payload) loop
    if jsonb_typeof(v_row) <> 'object' then raise exception 'Each invoice project allocation must be an object' using errcode = '22023'; end if;
    if exists (
      select 1 from jsonb_object_keys(v_row) as field_name
      where field_name not in ('id', 'project_id', 'allocation_type', 'allocation_percentage', 'allocation_amount', 'notes', 'project_cost_code_id', 'cost_code_id', 'projectCostCodeId', 'costCodeId')
    ) then
      raise exception 'Invoice project allocation contains an unsupported field' using errcode = '22023';
    end if;
    if not (v_row ? 'project_id') or jsonb_typeof(v_row->'project_id') <> 'string' or nullif(btrim(v_row->>'project_id'), '') is null then raise exception 'Every invoice project allocation requires a project id' using errcode = '22023'; end if;
    begin v_project_id := (v_row->>'project_id')::uuid; exception when invalid_text_representation then raise exception 'Invoice project allocation project id must be a UUID' using errcode = '22P02'; end;
    if v_project_id = any(v_seen_project_ids) then raise exception 'A project may appear only once in an invoice allocation replacement' using errcode = '23505'; end if;
    v_seen_project_ids := array_append(v_seen_project_ids, v_project_id);

    select p.archived_at, p.status into v_archived_at, v_project_status
    from public.projects p where p.id = v_project_id and p.company_id = v_company_id and (select public.has_company_permission(p.company_id, 'projects.manage'));
    if not found then raise exception 'Project does not exist in the authorized company' using errcode = '42501'; end if;
    if v_archived_at is not null or v_project_status = 'ARCHIVED' then raise exception 'Archived projects cannot receive invoice allocations' using errcode = '42501'; end if;

    v_cost_code_id := null;
    if coalesce(v_row->>'project_cost_code_id', v_row->>'cost_code_id', v_row->>'projectCostCodeId', v_row->>'costCodeId') is not null then
      begin
        v_cost_code_id := (coalesce(v_row->>'project_cost_code_id', v_row->>'cost_code_id', v_row->>'projectCostCodeId', v_row->>'costCodeId'))::uuid;
      exception when invalid_text_representation then
        raise exception 'Invoice project allocation cost code id must be a UUID' using errcode = '22P02';
      end;
      if not exists (
        select 1 from public.project_cost_codes cc
        where cc.id = v_cost_code_id and cc.project_id = v_project_id and cc.company_id = v_company_id
      ) then
        raise exception 'Cost code does not belong to the same project and company' using errcode = '42501';
      end if;
    end if;

    if not (v_row ? 'allocation_type') or jsonb_typeof(v_row->'allocation_type') <> 'string' then raise exception 'Every invoice project allocation requires an allocation type' using errcode = '22023'; end if;
    v_allocation_type := v_row->>'allocation_type';
    if v_allocation_type not in ('AMOUNT', 'PERCENTAGE') then raise exception 'Invoice project allocation type must be AMOUNT or PERCENTAGE' using errcode = '22023'; end if;
    v_allocation_id := null;
    if v_row ? 'id' and jsonb_typeof(v_row->'id') not in ('null', 'string') then raise exception 'Invoice project allocation id must be a UUID string' using errcode = '22023'; end if;
    if nullif(btrim(v_row->>'id'), '') is not null then begin v_allocation_id := (v_row->>'id')::uuid; exception when invalid_text_representation then raise exception 'Invoice project allocation id must be a UUID' using errcode = '22P02'; end; end if;

    v_allocation_percentage := null;
    v_allocation_amount := null;
    if v_allocation_type = 'PERCENTAGE' then
      if not (v_row ? 'allocation_percentage') or jsonb_typeof(v_row->'allocation_percentage') <> 'number' then raise exception 'Percentage allocations require a numeric allocation_percentage' using errcode = '22023'; end if;
      if v_row ? 'allocation_amount' and jsonb_typeof(v_row->'allocation_amount') <> 'null' then raise exception 'Percentage allocations must not provide allocation_amount' using errcode = '22023'; end if;
      v_allocation_percentage := (v_row->>'allocation_percentage')::numeric;
      if v_allocation_percentage < 0 or v_allocation_percentage > 100 or v_allocation_percentage <> round(v_allocation_percentage, 4) then raise exception 'Allocation percentage must be between 0 and 100 with at most four decimal places' using errcode = '22023'; end if;
      v_percentage_total := v_percentage_total + v_allocation_percentage;
      if v_percentage_total > 100 then raise exception 'Invoice project allocation percentages cannot exceed 100%% in total' using errcode = '22003'; end if;
      v_allocation_amount := round(v_invoice_total * v_allocation_percentage / 100, 2);
    else
      if not (v_row ? 'allocation_amount') or jsonb_typeof(v_row->'allocation_amount') <> 'number' then raise exception 'Amount allocations require a numeric allocation_amount' using errcode = '22023'; end if;
      if v_row ? 'allocation_percentage' and jsonb_typeof(v_row->'allocation_percentage') <> 'null' then raise exception 'Amount allocations must not provide allocation_percentage' using errcode = '22023'; end if;
      v_allocation_amount := (v_row->>'allocation_amount')::numeric;
      if v_allocation_amount < 0 or v_allocation_amount <> round(v_allocation_amount, 2) then raise exception 'Allocation amount must be non-negative with at most two decimal places' using errcode = '22023'; end if;
    end if;
    if v_allocation_amount > 9999999999999999.99 then raise exception 'Allocation amount exceeds the supported precision' using errcode = '22003'; end if;
    v_total := round(v_total + v_allocation_amount, 2);
    v_new_allocations := v_new_allocations || jsonb_build_array(jsonb_build_object(
      'id', v_allocation_id,
      'project_id', v_project_id,
      'project_cost_code_id', v_cost_code_id,
      'allocation_type', v_allocation_type,
      'allocation_percentage', v_allocation_percentage,
      'allocation_amount', v_allocation_amount,
      'notes', case when v_row ? 'notes' and jsonb_typeof(v_row->'notes') <> 'null' then v_row->>'notes' else null end
    ));
  end loop;

  if v_total > v_invoice_total + 0.01 then raise exception 'Invoice project allocation exceeds invoice total by %', round(v_total - v_invoice_total, 2) using errcode = '22003'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'project_id', a.project_id,
    'project_cost_code_id', a.project_cost_code_id,
    'allocation_type', a.allocation_type,
    'allocation_percentage', a.allocation_percentage,
    'allocation_amount', a.allocation_amount,
    'notes', a.notes
  ) order by a.project_id), '[]'::jsonb)
    into v_previous_allocations
  from public.invoice_project_allocations a
  where a.invoice_id = p_invoice_id and a.company_id = v_company_id;

  delete from public.invoice_project_allocations a
  where a.invoice_id = p_invoice_id and a.company_id = v_company_id
    and not exists (select 1 from jsonb_array_elements(v_new_allocations) item where (item->>'project_id')::uuid = a.project_id);

  for v_item in select value from jsonb_array_elements(v_new_allocations) loop
    insert into public.invoice_project_allocations (id, user_id, company_id, invoice_id, project_id, project_cost_code_id, allocation_type, allocation_percentage, allocation_amount, currency, notes)
    values (
      coalesce(nullif(v_item->>'id', '')::uuid, gen_random_uuid()),
      v_user_id,
      v_company_id,
      p_invoice_id,
      (v_item->>'project_id')::uuid,
      nullif(v_item->>'project_cost_code_id', '')::uuid,
      v_item->>'allocation_type',
      nullif(v_item->>'allocation_percentage', '')::numeric,
      nullif(v_item->>'allocation_amount', '')::numeric,
      null,
      nullif(v_item->>'notes', '')
    )
    on conflict (company_id, invoice_id, project_id) do update set
      project_cost_code_id = excluded.project_cost_code_id,
      allocation_type = excluded.allocation_type,
      allocation_percentage = excluded.allocation_percentage,
      allocation_amount = excluded.allocation_amount,
      currency = excluded.currency,
      notes = excluded.notes,
      updated_at = now();
  end loop;

  insert into public.project_accounting_events (user_id, company_id, project_id, entity_type, entity_id, event_type, description, metadata)
  values (
    v_user_id,
    v_company_id,
    null,
    'INVOICE',
    p_invoice_id,
    'PROJECT_ALLOCATIONS_REPLACED',
    'Invoice project allocations replaced',
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'company_id', v_company_id,
      'invoice_total', v_invoice_total,
      'previous_allocations', v_previous_allocations,
      'new_allocations', v_new_allocations,
      'allocated_total', v_total,
      'remaining_amount', round(v_invoice_total - v_total, 2)
    )
  );

  return query select a.* from public.invoice_project_allocations a where a.invoice_id = p_invoice_id and a.company_id = v_company_id order by a.project_id, a.id;
end;
$$;

-- 7. Update replace_payroll_run_entries to support project_cost_code_id
create or replace function public.replace_payroll_run_entries(
  p_run_id uuid,
  p_entries jsonb,
  p_allocations jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_company_id uuid;
  current_status text;
  entry_row jsonb;
  allocation_row jsonb;
begin
  select pr.company_id, pr.status into current_company_id, current_status
  from public.payroll_runs pr
  where pr.id = p_run_id and (select public.has_company_permission(pr.company_id, 'payroll.manage'))
  for update;
  if current_status is null then raise exception 'Payroll run is outside an authorized company' using errcode = '42501'; end if;
  if current_status not in ('DRAFT', 'CALCULATED') then raise exception 'Locked payroll runs cannot be rebuilt'; end if;
  if exists (select 1 from (select value->>'workerId' as worker_id, count(*) as row_count from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) group by value->>'workerId' having count(*) > 1) duplicates) then raise exception 'A payroll run cannot contain duplicate workers'; end if;

  delete from public.payroll_project_allocations where payroll_entry_id in (select id from public.payroll_entries where payroll_run_id = p_run_id and company_id = current_company_id);
  delete from public.payroll_entries where payroll_run_id = p_run_id and company_id = current_company_id;

  for entry_row in select value from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    insert into public.payroll_entries (id, user_id, company_id, payroll_run_id, worker_id, base_pay, regular_pay, overtime_pay, allowances, other_earnings, gross_pay, deductions, other_deductions, employer_costs, net_pay, project_allocated_cost, calculation_snapshot, cost_context, import_row_id)
    values ((entry_row->>'id')::uuid, current_user_id, current_company_id, p_run_id, (entry_row->>'workerId')::uuid, coalesce((entry_row->>'basePay')::numeric, 0), coalesce((entry_row->>'regularPay')::numeric, 0), coalesce((entry_row->>'overtimePay')::numeric, 0), coalesce((entry_row->>'allowances')::numeric, 0), coalesce((entry_row->>'otherEarnings')::numeric, 0), coalesce((entry_row->>'grossPay')::numeric, 0), coalesce((entry_row->>'deductions')::numeric, 0), coalesce((entry_row->>'otherDeductions')::numeric, 0), coalesce((entry_row->>'employerCosts')::numeric, 0), coalesce((entry_row->>'netPay')::numeric, 0), coalesce((entry_row->>'projectAllocatedCost')::numeric, 0), coalesce(entry_row->'calculationSnapshot', '{}'::jsonb), coalesce(entry_row->'costContext', '{}'::jsonb), nullif(entry_row->>'importRowId', '')::uuid);
  end loop;

  for allocation_row in select value from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) loop
    insert into public.payroll_project_allocations (id, user_id, company_id, payroll_entry_id, project_id, project_cost_code_id, allocation_amount, allocation_percentage, source)
    values (
      (allocation_row->>'id')::uuid,
      current_user_id,
      current_company_id,
      (allocation_row->>'payrollEntryId')::uuid,
      (allocation_row->>'projectId')::uuid,
      nullif(coalesce(allocation_row->>'projectCostCodeId', allocation_row->>'costCodeId', allocation_row->>'project_cost_code_id', allocation_row->>'cost_code_id'), '')::uuid,
      coalesce((allocation_row->>'allocationAmount')::numeric, 0),
      nullif(allocation_row->>'allocationPercentage', '')::numeric,
      coalesce(allocation_row->>'source', 'MANUAL')
    );
  end loop;
end;
$$;

-- 8. Register in private.company_tenant_policy_catalog and apply RLS
insert into private.company_tenant_policy_catalog (table_name, read_permission, write_permission, allow_insert, allow_update, allow_delete)
values ('project_cost_codes', 'projects.read', 'projects.manage', true, true, false)
on conflict (table_name) do update set
  read_permission = excluded.read_permission,
  write_permission = excluded.write_permission,
  allow_insert = excluded.allow_insert,
  allow_update = excluded.allow_update,
  allow_delete = excluded.allow_delete;

alter table public.project_cost_codes enable row level security;

drop policy if exists project_cost_codes_company_select on public.project_cost_codes;
create policy project_cost_codes_company_select on public.project_cost_codes
  for select to authenticated using ((select public.has_company_permission(company_id, 'projects.read')));

drop policy if exists project_cost_codes_company_insert on public.project_cost_codes;
create policy project_cost_codes_company_insert on public.project_cost_codes
  for insert to authenticated with check ((select public.has_company_permission(company_id, 'projects.manage')));

drop policy if exists project_cost_codes_company_update on public.project_cost_codes;
create policy project_cost_codes_company_update on public.project_cost_codes
  for update to authenticated using ((select public.has_company_permission(company_id, 'projects.manage')))
  with check ((select public.has_company_permission(company_id, 'projects.manage')));

revoke delete on table public.project_cost_codes from anon, authenticated;
grant select, insert, update on table public.project_cost_codes to authenticated;
