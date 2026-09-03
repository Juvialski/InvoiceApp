-- ============================================================================
-- Migration: 20260903160000_subcontract_variations.sql
-- Description: P2B-3 Subcontract Variations / Change Orders & Revised Commitments
-- ============================================================================

-- 1. Create subcontract_variations table
create table if not exists public.subcontract_variations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  subcontract_id uuid not null references public.subcontracts(id) on delete restrict,
  variation_number text not null check (
    length(btrim(variation_number)) between 1 and 60
    and variation_number = upper(btrim(variation_number))
  ),
  title text not null check (length(btrim(title)) between 1 and 255),
  description text,
  reason text,
  variation_date date not null default current_date,
  status text not null default 'DRAFT' check (
    status in ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED')
  ),
  net_amount numeric(18,2) not null default 0.00,
  currency text not null default 'PHP' check (
    currency = upper(currency) and currency ~ '^[A-Z]{3}$'
  ),
  notes text,
  rejection_reason text,
  cancellation_reason text,
  created_by_user_id uuid references auth.users(id),
  updated_by_user_id uuid references auth.users(id),
  submitted_by_user_id uuid references auth.users(id),
  approved_by_user_id uuid references auth.users(id),
  rejected_by_user_id uuid references auth.users(id),
  cancelled_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  constraint subcontract_variations_company_id_id_key unique (company_id, id),
  constraint subcontract_variations_company_project_fk
    foreign key (company_id, project_id)
    references public.projects(company_id, id) on delete restrict,
  constraint subcontract_variations_company_subcontract_fk
    foreign key (company_id, subcontract_id)
    references public.subcontracts(company_id, id) on delete restrict,
  constraint subcontract_variations_company_num_key
    unique (company_id, subcontract_id, variation_number)
);

create unique index if not exists subcontract_variations_company_num_idx
  on public.subcontract_variations (company_id, subcontract_id, lower(variation_number));

create index if not exists subcontract_variations_company_subcontract_idx
  on public.subcontract_variations (company_id, subcontract_id, status, updated_at desc);

create index if not exists subcontract_variations_company_project_idx
  on public.subcontract_variations (company_id, project_id, status, updated_at desc);

create index if not exists subcontract_variations_company_status_idx
  on public.subcontract_variations (company_id, status, updated_at desc);

-- 2. Create subcontract_variation_lines table
create table if not exists public.subcontract_variation_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  variation_id uuid not null,
  subcontract_id uuid not null,
  line_number integer not null default 1 check (line_number >= 1),
  description text not null check (length(btrim(description)) between 1 and 500),
  amount numeric(18,2) not null check (amount <> 0),
  quantity numeric(18,4) check (quantity is null or quantity > 0),
  unit text check (unit is null or length(btrim(unit)) between 1 and 50),
  unit_rate numeric(18,2) check (unit_rate is null or unit_rate >= 0),
  subcontract_line_id uuid,
  project_cost_code_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subcontract_var_lines_company_id_id_key unique (company_id, id),
  constraint subcontract_var_lines_company_var_fk
    foreign key (company_id, variation_id)
    references public.subcontract_variations(company_id, id) on delete cascade,
  constraint subcontract_var_lines_company_sc_fk
    foreign key (company_id, subcontract_id)
    references public.subcontracts(company_id, id) on delete restrict,
  constraint subcontract_var_lines_company_sc_line_fk
    foreign key (company_id, subcontract_line_id)
    references public.subcontract_lines(company_id, id) on delete restrict,
  constraint subcontract_var_lines_company_pcc_fk
    foreign key (company_id, project_cost_code_id)
    references public.project_cost_codes(company_id, id) on delete restrict,
  constraint subcontract_var_lines_company_var_line_num_key
    unique (company_id, variation_id, line_number)
);

create index if not exists subcontract_var_lines_var_idx
  on public.subcontract_variation_lines (company_id, variation_id, line_number asc);

create index if not exists subcontract_var_lines_sc_idx
  on public.subcontract_variation_lines (company_id, subcontract_id);

create index if not exists subcontract_var_lines_sc_line_idx
  on public.subcontract_variation_lines (company_id, subcontract_line_id);

create index if not exists subcontract_var_lines_pcc_idx
  on public.subcontract_variation_lines (company_id, project_cost_code_id);

-- 3. Register in tenant policy catalog and set RLS
insert into private.company_tenant_policy_catalog (
  table_name, read_permission, write_permission, allow_insert, allow_update, allow_delete
) values
  ('subcontract_variations', 'procurement.read', 'procurement.manage', true, true, true),
  ('subcontract_variation_lines', 'procurement.read', 'procurement.manage', true, true, true)
on conflict (table_name) do update set
  read_permission = excluded.read_permission,
  write_permission = excluded.write_permission,
  allow_insert = excluded.allow_insert,
  allow_update = excluded.allow_update,
  allow_delete = excluded.allow_delete;

alter table public.subcontract_variations enable row level security;
alter table public.subcontract_variation_lines enable row level security;

-- Client DML boundary: direct table reads allowed, mutations owned by guarded RPCs
grant select on table public.subcontract_variations to authenticated;
grant select on table public.subcontract_variation_lines to authenticated;
revoke insert, update, delete on table public.subcontract_variations from authenticated;
revoke insert, update, delete on table public.subcontract_variation_lines from authenticated;

-- RLS policies for read access
drop policy if exists subcontract_variations_tenant_read on public.subcontract_variations;
create policy subcontract_variations_tenant_read on public.subcontract_variations
  for select to authenticated
  using (
    company_id = (select private.deployment_company_id())
    and (
      (select private.has_company_permission(company_id, 'procurement.read'))
      or (select private.has_company_permission(company_id, 'procurement.manage'))
      or (select private.has_company_permission(company_id, 'procurement.approve'))
    )
  );

drop policy if exists subcontract_variation_lines_tenant_read on public.subcontract_variation_lines;
create policy subcontract_variation_lines_tenant_read on public.subcontract_variation_lines
  for select to authenticated
  using (
    company_id = (select private.deployment_company_id())
    and (
      (select private.has_company_permission(company_id, 'procurement.read'))
      or (select private.has_company_permission(company_id, 'procurement.manage'))
      or (select private.has_company_permission(company_id, 'procurement.approve'))
    )
  );

-- 4. Trigger to sync net_amount on variation header from lines
create or replace function private.sync_subcontract_variation_net_amount()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_var_id uuid;
  v_company_id uuid;
  v_total numeric(18,2);
begin
  v_var_id := coalesce(new.variation_id, old.variation_id);
  v_company_id := coalesce(new.company_id, old.company_id);

  select coalesce(sum(amount), 0.00)
    into v_total
  from public.subcontract_variation_lines
  where variation_id = v_var_id and company_id = v_company_id;

  update public.subcontract_variations
  set net_amount = v_total,
      updated_at = now()
  where id = v_var_id and company_id = v_company_id;

  return null;
end;
$$;

drop trigger if exists trg_sync_subcontract_variation_net_amount on public.subcontract_variation_lines;
create trigger trg_sync_subcontract_variation_net_amount
  after insert or update or delete on public.subcontract_variation_lines
  for each row
  execute function private.sync_subcontract_variation_net_amount();

-- 5. Extend subcontract_progress_claim_lines to support claiming variation scope
alter table public.subcontract_progress_claim_lines
  alter column subcontract_line_id drop not null;

alter table public.subcontract_progress_claim_lines
  add column if not exists subcontract_variation_line_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'subcontract_claim_lines_company_var_line_fk'
  ) then
    alter table public.subcontract_progress_claim_lines
      add constraint subcontract_claim_lines_company_var_line_fk
      foreign key (company_id, subcontract_variation_line_id)
      references public.subcontract_variation_lines(company_id, id) on delete restrict;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'subcontract_claim_lines_source_check'
  ) then
    alter table public.subcontract_progress_claim_lines
      add constraint subcontract_claim_lines_source_check
      check (
        (subcontract_line_id is not null and subcontract_variation_line_id is null)
        or (subcontract_line_id is null and subcontract_variation_line_id is not null)
      );
  end if;
end $$;

alter table public.subcontract_progress_claim_lines
  drop constraint if exists subcontract_claim_lines_company_claim_sc_line_key;

create unique index if not exists subcontract_claim_lines_sc_line_uidx
  on public.subcontract_progress_claim_lines (company_id, claim_id, subcontract_line_id)
  where subcontract_line_id is not null;

create unique index if not exists subcontract_claim_lines_var_line_uidx
  on public.subcontract_progress_claim_lines (company_id, claim_id, subcontract_variation_line_id)
  where subcontract_variation_line_id is not null;

create index if not exists subcontract_claim_lines_var_line_idx
  on public.subcontract_progress_claim_lines (company_id, subcontract_variation_line_id);

-- 6. Update private.project_lifecycle_preflight to include variation history
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
  v_subcontract_variations bigint;
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

  select count(*) into v_subcontract_claims
  from public.subcontract_progress_claims c
  where c.company_id = p_company_id and c.project_id = p_project_id;

  select count(*) into v_subcontract_variations
  from public.subcontract_variations sv
  where sv.company_id = p_company_id and sv.project_id = p_project_id;

  v_total := v_invoice_allocations + v_expenses + v_assignments + v_work_entries
    + v_overtime_requests + v_payroll_allocations + v_payroll_entry_contexts
    + v_import_rows + v_worker_defaults + v_compensation_defaults
    + v_engineering_documents + v_engineering_rfis + v_engineering_submittals
    + v_daily_site_logs + v_accounting_events + v_purchase_orders + v_subcontracts
    + v_subcontract_claims + v_subcontract_variations;

  v_can_delete := (v_total = 0) and (v_project.status = 'PLANNING');
  v_can_reactivate := (v_project.status = 'ARCHIVED');

  return jsonb_build_object(
    'projectId', v_project.id,
    'code', v_project.code,
    'name', v_project.name,
    'status', v_project.status,
    'canDelete', v_can_delete,
    'canReactivate', v_can_reactivate,
    'blockingReasons', case
      when v_can_delete then '[]'::jsonb
      else jsonb_build_array(
        case when v_project.status <> 'PLANNING' then 'Project status is not PLANNING' else null end,
        case when v_invoice_allocations > 0 then 'Has ' || v_invoice_allocations || ' invoice allocation(s)' else null end,
        case when v_expenses > 0 then 'Has ' || v_expenses || ' expense(s)' else null end,
        case when v_assignments > 0 then 'Has ' || v_assignments || ' worker assignment(s)' else null end,
        case when v_work_entries > 0 then 'Has ' || v_work_entries || ' work entry(ies)' else null end,
        case when v_overtime_requests > 0 then 'Has ' || v_overtime_requests || ' overtime request(s)' else null end,
        case when v_payroll_allocations > 0 then 'Has ' || v_payroll_allocations || ' payroll allocation(s)' else null end,
        case when v_payroll_entry_contexts > 0 then 'Has ' || v_payroll_entry_contexts || ' payroll cost context(s)' else null end,
        case when v_import_rows > 0 then 'Has ' || v_import_rows || ' payroll import row(s)' else null end,
        case when v_worker_defaults > 0 then 'Has ' || v_worker_defaults || ' default worker assignment(s)' else null end,
        case when v_compensation_defaults > 0 then 'Has ' || v_compensation_defaults || ' worker compensation profile(s)' else null end,
        case when v_engineering_documents > 0 then 'Has ' || v_engineering_documents || ' engineering document(s)' else null end,
        case when v_engineering_rfis > 0 then 'Has ' || v_engineering_rfis || ' engineering RFI(s)' else null end,
        case when v_engineering_submittals > 0 then 'Has ' || v_engineering_submittals || ' engineering submittal(s)' else null end,
        case when v_daily_site_logs > 0 then 'Has ' || v_daily_site_logs || ' daily site log(s)' else null end,
        case when v_accounting_events > 0 then 'Has ' || v_accounting_events || ' project accounting event(s)' else null end,
        case when v_purchase_orders > 0 then 'Has ' || v_purchase_orders || ' purchase order(s)' else null end,
        case when v_subcontracts > 0 then 'Has ' || v_subcontracts || ' subcontract(s)' else null end,
        case when v_subcontract_claims > 0 then 'Has ' || v_subcontract_claims || ' subcontract claim(s)' else null end,
        case when v_subcontract_variations > 0 then 'Has ' || v_subcontract_variations || ' subcontract variation(s)' else null end
      ) - 'null'
    end,
    'dependencyCounts', jsonb_build_object(
      'invoiceAllocations', v_invoice_allocations,
      'expenses', v_expenses,
      'workerAssignments', v_assignments,
      'workEntries', v_work_entries,
      'overtimeRequests', v_overtime_requests,
      'payrollAllocations', v_payroll_allocations,
      'payrollCostContexts', v_payroll_entry_contexts,
      'payrollImportRows', v_import_rows,
      'workerDefaults', v_worker_defaults,
      'workerCompensationProfiles', v_compensation_defaults,
      'engineeringDocuments', v_engineering_documents,
      'engineeringRfis', v_engineering_rfis,
      'engineeringSubmittals', v_engineering_submittals,
      'dailySiteLogs', v_daily_site_logs,
      'projectAccountingEvents', v_accounting_events,
      'purchaseOrders', v_purchase_orders,
      'subcontracts', v_subcontracts,
      'subcontractClaims', v_subcontract_claims,
      'subcontractVariations', v_subcontract_variations,
      'totalDependencies', v_total
    )
  );
end;
$$;

-- 7. Guarded RPC: create_or_update_subcontract_variation
create or replace function public.create_or_update_subcontract_variation(
  p_variation jsonb,
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
  v_var_id uuid;
  v_subcontract record;
  v_project record;
  v_existing record;
  v_line_row jsonb;
  v_line_idx integer := 0;
  v_line_id uuid;
  v_sc_line_id uuid;
  v_pcc_id uuid;
  v_sc_line record;
  v_pcc record;
  v_amount numeric(18,2);
  v_qty numeric(18,4);
  v_rate numeric(18,2);
  v_desc text;
  v_unit text;
  v_notes text;
  v_inserted_line_ids uuid[] := array[]::uuid[];
  v_res_var jsonb;
  v_res_lines jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  v_company_id := nullif(p_variation->>'company_id', '')::uuid;
  if v_company_id is null then
    v_company_id := (select private.deployment_company_id());
  end if;
  if v_company_id is null or v_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Unauthorized deployment company' using errcode = '42501';
  end if;

  if not (select public.has_company_permission(v_company_id, 'procurement.manage')) then
    raise exception 'Unauthorized to manage subcontract variations' using errcode = '42501';
  end if;

  -- Lock and validate parent subcontract
  select * into v_subcontract
  from public.subcontracts
  where id = (p_variation->>'subcontract_id')::uuid
    and company_id = v_company_id
  for key share;

  if v_subcontract.id is null then
    raise exception 'Parent subcontract not found in company' using errcode = '23503';
  end if;

  if v_subcontract.status not in ('APPROVED', 'ACTIVE') then
    raise exception 'Variations can only be created for approved or active subcontracts' using errcode = '22023';
  end if;

  -- Validate project status
  select * into v_project
  from public.projects
  where id = v_subcontract.project_id and company_id = v_company_id
  for key share;

  if v_project.status = 'ARCHIVED' or v_project.archived_at is not null then
    raise exception 'Archived projects cannot receive new subcontract variations' using errcode = '42501';
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'At least one variation line item is required' using errcode = '22023';
  end if;

  v_var_id := nullif(p_variation->>'id', '')::uuid;

  if v_var_id is not null then
    select * into v_existing
    from public.subcontract_variations
    where id = v_var_id and company_id = v_company_id
    for update;

    if v_existing.id is null then
      raise exception 'Variation not found in company' using errcode = '23503';
    end if;

    if v_existing.status <> 'DRAFT' then
      raise exception 'Only draft variations can be edited' using errcode = '22023';
    end if;

    update public.subcontract_variations
    set variation_number = upper(btrim(p_variation->>'variation_number')),
        title = btrim(p_variation->>'title'),
        description = nullif(btrim(p_variation->>'description'), ''),
        reason = nullif(btrim(p_variation->>'reason'), ''),
        variation_date = coalesce((p_variation->>'variation_date')::date, current_date),
        currency = v_subcontract.currency,
        notes = nullif(btrim(p_variation->>'notes'), ''),
        updated_by_user_id = v_user_id,
        updated_at = now()
    where id = v_var_id and company_id = v_company_id;
  else
    v_var_id := gen_random_uuid();
    insert into public.subcontract_variations (
      id, company_id, project_id, subcontract_id, variation_number, title,
      description, reason, variation_date, status, net_amount, currency, notes,
      created_by_user_id, updated_by_user_id, created_at, updated_at
    ) values (
      v_var_id,
      v_company_id,
      v_subcontract.project_id,
      v_subcontract.id,
      upper(btrim(p_variation->>'variation_number')),
      btrim(p_variation->>'title'),
      nullif(btrim(p_variation->>'description'), ''),
      nullif(btrim(p_variation->>'reason'), ''),
      coalesce((p_variation->>'variation_date')::date, current_date),
      'DRAFT',
      0.00,
      v_subcontract.currency,
      nullif(btrim(p_variation->>'notes'), ''),
      v_user_id,
      v_user_id,
      now(),
      now()
    );
  end if;

  -- Upsert lines
  for v_line_row in select value from jsonb_array_elements(p_lines) loop
    v_line_idx := v_line_idx + 1;
    v_line_id := nullif(v_line_row->>'id', '')::uuid;
    if v_line_id is null then
      v_line_id := gen_random_uuid();
    end if;

    v_desc := btrim(v_line_row->>'description');
    if v_desc is null or length(v_desc) = 0 then
      raise exception 'Line %: Description is required', v_line_idx using errcode = '22023';
    end if;

    v_amount := (v_line_row->>'amount')::numeric;
    if v_amount is null then
      raise exception 'Line %: Amount is required', v_line_idx using errcode = '22023';
    end if;

    v_qty := nullif(v_line_row->>'quantity', '')::numeric;
    v_rate := nullif(v_line_row->>'unit_rate', '')::numeric;
    v_unit := nullif(btrim(v_line_row->>'unit'), '');
    v_notes := nullif(btrim(v_line_row->>'notes'), '');

    v_sc_line_id := nullif(v_line_row->>'subcontract_line_id', '')::uuid;
    if v_sc_line_id is not null then
      select * into v_sc_line
      from public.subcontract_lines
      where id = v_sc_line_id and subcontract_id = v_subcontract.id and company_id = v_company_id;

      if v_sc_line.id is null then
        raise exception 'Line %: Linked subcontract line % does not belong to this subcontract', v_line_idx, v_sc_line_id using errcode = '23503';
      end if;
    end if;

    v_pcc_id := nullif(v_line_row->>'project_cost_code_id', '')::uuid;
    if v_pcc_id is not null then
      select * into v_pcc
      from public.project_cost_codes
      where id = v_pcc_id and project_id = v_subcontract.project_id and company_id = v_company_id;

      if v_pcc.id is null then
        raise exception 'Line %: Cost code does not belong to this project', v_line_idx using errcode = '23503';
      end if;
    end if;

    insert into public.subcontract_variation_lines (
      id, company_id, variation_id, subcontract_id, line_number, description,
      amount, quantity, unit, unit_rate, subcontract_line_id, project_cost_code_id,
      notes, created_at, updated_at
    ) values (
      v_line_id,
      v_company_id,
      v_var_id,
      v_subcontract.id,
      v_line_idx,
      v_desc,
      round(v_amount, 2),
      v_qty,
      v_unit,
      v_rate,
      v_sc_line_id,
      v_pcc_id,
      v_notes,
      now(),
      now()
    )
    on conflict (company_id, id) do update set
      line_number = excluded.line_number,
      description = excluded.description,
      amount = excluded.amount,
      quantity = excluded.quantity,
      unit = excluded.unit,
      unit_rate = excluded.unit_rate,
      subcontract_line_id = excluded.subcontract_line_id,
      project_cost_code_id = excluded.project_cost_code_id,
      notes = excluded.notes,
      updated_at = now();

    v_inserted_line_ids := array_append(v_inserted_line_ids, v_line_id);
  end loop;

  -- Delete removed lines
  delete from public.subcontract_variation_lines
  where variation_id = v_var_id
    and company_id = v_company_id
    and not (id = any(v_inserted_line_ids));

  select to_jsonb(v.*) into v_res_var
  from public.subcontract_variations v
  where v.id = v_var_id and v.company_id = v_company_id;

  select coalesce(jsonb_agg(to_jsonb(l.*) order by l.line_number asc), '[]'::jsonb)
    into v_res_lines
  from public.subcontract_variation_lines l
  where l.variation_id = v_var_id and l.company_id = v_company_id;

  return jsonb_build_object('variation', v_res_var, 'lines', v_res_lines);
end;
$$;

-- 8. Guarded RPC: transition_subcontract_variation
create or replace function public.transition_subcontract_variation(
  p_variation_id uuid,
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
  v_company_id uuid;
  v_var record;
  v_subcontract record;
  v_project record;
  v_target_status text := upper(btrim(p_target_status));
  v_trimmed_reason text := nullif(btrim(p_reason), '');
  v_existing_approved_variations numeric(18,2);
  v_revised_subcontract_value numeric(18,2);
  v_total_certified_gross numeric(18,2);
  v_var_line record;
  v_sc_line record;
  v_sc_line_approved_claims numeric(18,2);
  v_sc_line_net_variations numeric(18,2);
  v_res_var jsonb;
  v_res_lines jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select * into v_var
  from public.subcontract_variations
  where id = p_variation_id
  for update;

  if v_var.id is null then
    raise exception 'Subcontract variation not found' using errcode = '23503';
  end if;

  v_company_id := v_var.company_id;

  -- Lock parent subcontract for update
  select * into v_subcontract
  from public.subcontracts
  where id = v_var.subcontract_id and company_id = v_company_id
  for update;

  if v_subcontract.id is null then
    raise exception 'Parent subcontract not found' using errcode = '23503';
  end if;

  select * into v_project
  from public.projects
  where id = v_subcontract.project_id and company_id = v_company_id
  for key share;

  -- Check terminal states
  if v_var.status in ('APPROVED', 'REJECTED', 'CANCELLED') then
    raise exception 'Terminal variation cannot undergo further transitions' using errcode = '22023';
  end if;

  -- Archived project guard: only wind-down allowed
  if (v_project.status = 'ARCHIVED' or v_project.archived_at is not null) then
    if v_target_status not in ('REJECTED', 'CANCELLED') then
      raise exception 'Archived projects only permit variation wind-down to REJECTED or CANCELLED' using errcode = '42501';
    end if;
  end if;

  if v_var.status = 'DRAFT' then
    if v_target_status not in ('SUBMITTED', 'CANCELLED') then
      raise exception 'Draft variations can only be submitted or cancelled' using errcode = '22023';
    end if;

    if not (select public.has_company_permission(v_company_id, 'procurement.manage')) then
      raise exception 'Unauthorized to transition variation' using errcode = '42501';
    end if;

    if v_target_status = 'CANCELLED' and v_trimmed_reason is null then
      raise exception 'Cancellation reason is required' using errcode = '22023';
    end if;

    update public.subcontract_variations
    set status = v_target_status,
        submitted_by_user_id = case when v_target_status = 'SUBMITTED' then v_user_id else submitted_by_user_id end,
        submitted_at = case when v_target_status = 'SUBMITTED' then now() else submitted_at end,
        cancelled_by_user_id = case when v_target_status = 'CANCELLED' then v_user_id else cancelled_by_user_id end,
        cancelled_at = case when v_target_status = 'CANCELLED' then now() else cancelled_at end,
        cancellation_reason = case when v_target_status = 'CANCELLED' then v_trimmed_reason else cancellation_reason end,
        updated_by_user_id = v_user_id,
        updated_at = now()
    where id = p_variation_id and company_id = v_company_id;

  elsif v_var.status = 'SUBMITTED' then
    if v_target_status not in ('APPROVED', 'REJECTED', 'CANCELLED') then
      raise exception 'Submitted variations can only be approved, rejected, or cancelled' using errcode = '22023';
    end if;

    if v_target_status in ('APPROVED', 'REJECTED') then
      if not (select public.has_company_permission(v_company_id, 'procurement.approve')) then
        raise exception 'Approval or rejection requires procurement.approve permission' using errcode = '42501';
      end if;
    else
      if not (select public.has_company_permission(v_company_id, 'procurement.manage')) then
        raise exception 'Cancellation requires procurement.manage permission' using errcode = '42501';
      end if;
    end if;

    if v_target_status = 'REJECTED' and v_trimmed_reason is null then
      raise exception 'Rejection reason is required' using errcode = '22023';
    end if;
    if v_target_status = 'CANCELLED' and v_trimmed_reason is null then
      raise exception 'Cancellation reason is required' using errcode = '22023';
    end if;

    if v_target_status = 'APPROVED' then
      if v_subcontract.status not in ('APPROVED', 'ACTIVE') then
        raise exception 'Parent subcontract must be approved or active to approve variations' using errcode = '22023';
      end if;

      -- Check 1: Contract-level over-claim protection
      select coalesce(sum(net_amount), 0.00)
        into v_existing_approved_variations
      from public.subcontract_variations
      where subcontract_id = v_subcontract.id
        and company_id = v_company_id
        and status = 'APPROVED'
        and id <> p_variation_id;

      v_revised_subcontract_value := round(v_subcontract.original_amount + v_existing_approved_variations + v_var.net_amount, 2);

      select coalesce(sum(approved_gross_amount), 0.00)
        into v_total_certified_gross
      from public.subcontract_progress_claims
      where subcontract_id = v_subcontract.id
        and company_id = v_company_id
        and status = 'APPROVED';

      if v_revised_subcontract_value < v_total_certified_gross then
        raise exception 'Cannot approve negative variation: revised subcontract value (%) would be less than certified claims gross (%)',
          v_revised_subcontract_value, v_total_certified_gross using errcode = '23514';
      end if;

      -- Check 2: Line-level over-claim protection for any negative variation lines linked to subcontract lines
      for v_var_line in
        select *
        from public.subcontract_variation_lines
        where variation_id = p_variation_id
          and company_id = v_company_id
          and subcontract_line_id is not null
          and amount < 0
      loop
        select * into v_sc_line
        from public.subcontract_lines
        where id = v_var_line.subcontract_line_id and company_id = v_company_id;

        select coalesce(sum(cl.approved_amount), 0.00)
          into v_sc_line_approved_claims
        from public.subcontract_progress_claim_lines cl
        join public.subcontract_progress_claims c on cl.claim_id = c.id and cl.company_id = c.company_id
        where cl.subcontract_line_id = v_sc_line.id
          and cl.company_id = v_company_id
          and c.status = 'APPROVED';

        select coalesce(sum(vl.amount), 0.00)
          into v_sc_line_net_variations
        from public.subcontract_variation_lines vl
        join public.subcontract_variations v on vl.variation_id = v.id and vl.company_id = v.company_id
        where vl.subcontract_line_id = v_sc_line.id
          and vl.company_id = v_company_id
          and v.status = 'APPROVED'
          and v.id <> p_variation_id;

        if round(v_sc_line.amount + v_sc_line_net_variations + v_var_line.amount, 2) < round(v_sc_line_approved_claims, 2) then
          raise exception 'Cannot approve negative variation: revised scope for subcontract line % (%) would be less than certified amount (%)',
            v_sc_line.line_number, round(v_sc_line.amount + v_sc_line_net_variations + v_var_line.amount, 2), v_sc_line_approved_claims using errcode = '23514';
        end if;
      end loop;

      update public.subcontract_variations
      set status = 'APPROVED',
          approved_by_user_id = v_user_id,
          approved_at = now(),
          updated_by_user_id = v_user_id,
          updated_at = now()
      where id = p_variation_id and company_id = v_company_id;

    elsif v_target_status = 'REJECTED' then
      update public.subcontract_variations
      set status = 'REJECTED',
          rejected_by_user_id = v_user_id,
          rejected_at = now(),
          rejection_reason = v_trimmed_reason,
          updated_by_user_id = v_user_id,
          updated_at = now()
      where id = p_variation_id and company_id = v_company_id;

    elsif v_target_status = 'CANCELLED' then
      update public.subcontract_variations
      set status = 'CANCELLED',
          cancelled_by_user_id = v_user_id,
          cancelled_at = now(),
          cancellation_reason = v_trimmed_reason,
          updated_by_user_id = v_user_id,
          updated_at = now()
      where id = p_variation_id and company_id = v_company_id;
    end if;
  end if;

  select to_jsonb(v.*) into v_res_var
  from public.subcontract_variations v
  where v.id = p_variation_id and v.company_id = v_company_id;

  select coalesce(jsonb_agg(to_jsonb(l.*) order by l.line_number asc), '[]'::jsonb)
    into v_res_lines
  from public.subcontract_variation_lines l
  where l.variation_id = p_variation_id and l.company_id = v_company_id;

  return jsonb_build_object('variation', v_res_var, 'lines', v_res_lines);
end;
$$;

-- 9. Guarded RPC: delete_draft_subcontract_variation
create or replace function public.delete_draft_subcontract_variation(
  p_variation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid;
  v_var record;
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select * into v_var
  from public.subcontract_variations
  where id = p_variation_id
  for update;

  if v_var.id is null then
    return;
  end if;

  v_company_id := v_var.company_id;

  if not (select public.has_company_permission(v_company_id, 'procurement.manage')) then
    raise exception 'Unauthorized to delete subcontract variations' using errcode = '42501';
  end if;

  if v_var.status <> 'DRAFT' then
    raise exception 'Only draft variations may be deleted' using errcode = '22023';
  end if;

  delete from public.subcontract_variations
  where id = p_variation_id and company_id = v_company_id;
end;
$$;

-- 10. Update transition_subcontract_claim to check against Revised Subcontract Value & Variation Lines
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
  v_revised_subcontract_value numeric(18,2);
  v_net_variations numeric(18,2);
  v_effective_sc_line_amount numeric(18,2);
  v_sc_line_var_adjustments numeric(18,2);
  v_var_line record;
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

    -- Enforce Over-Claim Protection at line level
    for v_line in
      select cl.id, cl.subcontract_line_id, cl.subcontract_variation_line_id,
             cl.claimed_amount, cl.approved_amount, cl.line_number
      from public.subcontract_progress_claim_lines cl
      where cl.claim_id = p_claim_id and cl.company_id = v_company_id
    loop
      if v_line.approved_amount < 0 then
        raise exception 'Approved amount cannot be negative for line %', v_line.line_number using errcode = '22023';
      end if;
      if v_line.approved_amount > v_line.claimed_amount then
        raise exception 'Approved amount (%) exceeds claimed amount (%) for line %', v_line.approved_amount, v_line.claimed_amount, v_line.line_number using errcode = '23514';
      end if;

      if v_line.subcontract_line_id is not null then
        -- Cumulative approved against subcontract line + any approved variation lines on this line
        select scl.amount into v_effective_sc_line_amount
        from public.subcontract_lines scl
        where scl.id = v_line.subcontract_line_id and scl.company_id = v_company_id;

        select coalesce(sum(vl.amount), 0.00)
          into v_sc_line_var_adjustments
        from public.subcontract_variation_lines vl
        join public.subcontract_variations v on vl.variation_id = v.id and vl.company_id = v.company_id
        where vl.subcontract_line_id = v_line.subcontract_line_id
          and vl.company_id = v_company_id
          and v.status = 'APPROVED';

        v_effective_sc_line_amount := round(v_effective_sc_line_amount + v_sc_line_var_adjustments, 2);

        select coalesce(sum(other_cl.approved_amount), 0.00)
          into v_prev_line_approved
        from public.subcontract_progress_claim_lines other_cl
        join public.subcontract_progress_claims other_c on other_cl.claim_id = other_c.id and other_cl.company_id = other_c.company_id
        where other_cl.subcontract_line_id = v_line.subcontract_line_id
          and other_cl.company_id = v_company_id
          and other_c.status = 'APPROVED'
          and other_c.id <> p_claim_id;

        if round(v_prev_line_approved + v_line.approved_amount, 2) > v_effective_sc_line_amount then
          raise exception 'Cumulative approved amount (% + %) exceeds subcontract line % revised amount (%)',
            v_prev_line_approved, v_line.approved_amount, v_line.line_number, v_effective_sc_line_amount using errcode = '23514';
        end if;

      elsif v_line.subcontract_variation_line_id is not null then
        -- Must reference an APPROVED variation line
        select vl.*, v.status as var_status into v_var_line
        from public.subcontract_variation_lines vl
        join public.subcontract_variations v on vl.variation_id = v.id and vl.company_id = v.company_id
        where vl.id = v_line.subcontract_variation_line_id and vl.company_id = v_company_id;

        if v_var_line.id is null then
          raise exception 'Line %: Referenced variation line not found', v_line.line_number using errcode = '23503';
        end if;
        if v_var_line.var_status <> 'APPROVED' then
          raise exception 'Line %: Cannot claim unapproved variation scope', v_line.line_number using errcode = '22023';
        end if;
        if v_var_line.amount <= 0 then
          raise exception 'Line %: Cannot claim negative or zero variation line', v_line.line_number using errcode = '22023';
        end if;

        select coalesce(sum(other_cl.approved_amount), 0.00)
          into v_prev_line_approved
        from public.subcontract_progress_claim_lines other_cl
        join public.subcontract_progress_claims other_c on other_cl.claim_id = other_c.id and other_cl.company_id = other_c.company_id
        where other_cl.subcontract_variation_line_id = v_line.subcontract_variation_line_id
          and other_cl.company_id = v_company_id
          and other_c.status = 'APPROVED'
          and other_c.id <> p_claim_id;

        if round(v_prev_line_approved + v_line.approved_amount, 2) > round(v_var_line.amount, 2) then
          raise exception 'Cumulative approved amount (% + %) exceeds variation line amount (%)',
            v_prev_line_approved, v_line.approved_amount, v_var_line.amount using errcode = '23514';
        end if;
      end if;
    end loop;

    -- Check cumulative approved gross against Revised Subcontract Value
    select coalesce(sum(v.net_amount), 0.00)
      into v_net_variations
    from public.subcontract_variations v
    where v.subcontract_id = v_subcontract.id
      and v.company_id = v_company_id
      and v.status = 'APPROVED';

    v_revised_subcontract_value := round(v_subcontract.original_amount + v_net_variations, 2);

    select coalesce(sum(other_c.approved_gross_amount), 0.00)
      into v_prev_header_approved
    from public.subcontract_progress_claims other_c
    where other_c.subcontract_id = v_claim.subcontract_id
      and other_c.company_id = v_company_id
      and other_c.status = 'APPROVED'
      and other_c.id <> p_claim_id;

    select coalesce(sum(l.approved_amount), 0.00) into v_app_amount
    from public.subcontract_progress_claim_lines l
    where l.claim_id = p_claim_id and l.company_id = v_company_id;

    if round(v_prev_header_approved + v_app_amount, 2) > v_revised_subcontract_value then
      raise exception 'Cumulative approved claims (% + %) exceeds revised subcontract value (%)',
        v_prev_header_approved, v_app_amount, v_revised_subcontract_value using errcode = '23514';
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

-- 11. Update create_or_update_subcontract_claim to support subcontract_variation_line_id
create or replace function public.create_or_update_subcontract_claim(
  p_claim jsonb,
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
  v_claim_id uuid;
  v_subcontract_id uuid;
  v_project_id uuid;
  v_claim_number text;
  v_valuation_date date;
  v_period_start date;
  v_period_end date;
  v_retention_rate numeric(6,4);
  v_notes text;
  v_existing_status text;
  v_line_row jsonb;
  v_line_idx integer := 0;
  v_line_id uuid;
  v_scl_id uuid;
  v_scvl_id uuid;
  v_claimed_amount numeric(18,2);
  v_res_claim jsonb;
  v_res_lines jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  v_company_id := nullif(p_claim->>'company_id', '')::uuid;
  if v_company_id is null then
    v_company_id := (select private.deployment_company_id());
  end if;
  if v_company_id is null or v_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Unauthorized deployment company' using errcode = '42501';
  end if;

  if not (select public.has_company_permission(v_company_id, 'procurement.manage')) then
    raise exception 'Unauthorized to create or edit progress claims' using errcode = '42501';
  end if;

  v_claim_id := nullif(p_claim->>'id', '')::uuid;
  v_subcontract_id := (p_claim->>'subcontract_id')::uuid;
  v_project_id := (p_claim->>'project_id')::uuid;
  v_claim_number := upper(btrim(p_claim->>'claim_number'));
  v_valuation_date := (p_claim->>'valuation_date')::date;
  v_period_start := nullif(p_claim->>'period_start', '')::date;
  v_period_end := nullif(p_claim->>'period_end', '')::date;
  v_retention_rate := coalesce((p_claim->>'retention_rate')::numeric, 0.0000);
  v_notes := nullif(btrim(p_claim->>'notes'), '');

  if v_subcontract_id is null then
    raise exception 'Subcontract reference is required' using errcode = '22023';
  end if;
  if v_project_id is null then
    raise exception 'Project reference is required' using errcode = '22023';
  end if;
  if v_claim_number is null or length(v_claim_number) = 0 then
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
    v_scvl_id := nullif(coalesce(v_line_row->>'subcontractVariationLineId', v_line_row->>'subcontract_variation_line_id', ''), '')::uuid;
    v_claimed_amount := coalesce((v_line_row->>'claimedAmount')::numeric, (v_line_row->>'claimed_amount')::numeric, 0);

    if (v_scl_id is null and v_scvl_id is null) or (v_scl_id is not null and v_scvl_id is not null) then
      raise exception 'Line %: Exactly one of subcontract line or variation line must be specified', v_line_idx using errcode = '22023';
    end if;
    if v_claimed_amount < 0 then
      raise exception 'Line %: Claimed amount must be non-negative', v_line_idx using errcode = '22023';
    end if;

    insert into public.subcontract_progress_claim_lines (
      id, company_id, claim_id, subcontract_line_id, subcontract_variation_line_id, line_number,
      claimed_amount, approved_amount, notes
    ) values (
      v_line_id, v_company_id, v_claim_id, v_scl_id, v_scvl_id, v_line_idx,
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

-- 12. Revoke and grant RPC permissions
revoke all on function public.create_or_update_subcontract_variation(jsonb, jsonb) from public, anon;
grant execute on function public.create_or_update_subcontract_variation(jsonb, jsonb) to authenticated;

revoke all on function public.transition_subcontract_variation(uuid, text, text) from public, anon;
grant execute on function public.transition_subcontract_variation(uuid, text, text) to authenticated;

revoke all on function public.delete_draft_subcontract_variation(uuid) from public, anon;
grant execute on function public.delete_draft_subcontract_variation(uuid) to authenticated;

revoke all on function public.create_or_update_subcontract_claim(jsonb, jsonb) from public, anon;
grant execute on function public.create_or_update_subcontract_claim(jsonb, jsonb) to authenticated;

revoke all on function public.transition_subcontract_claim(uuid, text, text, jsonb) from public, anon;
grant execute on function public.transition_subcontract_claim(uuid, text, text, jsonb) to authenticated;

