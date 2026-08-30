-- Engoryx Core Hardening Wave 5: focused financial and data-integrity fixes.
-- This migration is forward-only. It closes confirmed authority, stale-write,
-- lifecycle, currency, and source-freshness gaps found in the Wave 5 audit.

-- A malformed extracted net payable must never create a larger cash obligation
-- than the invoice's gross document amount.
create or replace function private.invoice_cash_payable_basis(p_invoice_id uuid, p_company_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_total numeric;
  v_current jsonb;
  v_top_net numeric;
  v_nested_net numeric;
  v_withholding numeric;
  v_text text;
begin
  select greatest(round(coalesce(i.grand_total, 0), 2), 0), i.current_data
    into v_total, v_current
  from public.invoices i
  where i.id = p_invoice_id and i.company_id = p_company_id;
  if not found then return null; end if;

  v_text := v_current ->> 'netAmountPayable';
  if v_text is not null and v_text ~ '^[-+]?[0-9]+([.][0-9]+)?$' then v_top_net := v_text::numeric; end if;
  if v_top_net is not null and v_top_net > 0 and v_top_net <= v_total + 0.01 then
    return least(round(v_top_net, 2), v_total);
  end if;

  v_text := v_current -> 'philippineTaxDetails' ->> 'netAmountPayable';
  if v_text is not null and v_text ~ '^[-+]?[0-9]+([.][0-9]+)?$' then v_nested_net := v_text::numeric; end if;
  v_text := coalesce(v_current ->> 'withholdingTaxAmount', v_current -> 'philippineTaxDetails' ->> 'withholdingTaxAmount');
  if v_text is not null and v_text ~ '^[-+]?[0-9]+([.][0-9]+)?$' then v_withholding := v_text::numeric; end if;
  if v_nested_net is not null and v_nested_net > 0
     and v_nested_net <= v_total + 0.01
     and v_withholding is not null and v_withholding > 0 then
    return least(round(v_nested_net, 2), v_total);
  end if;

  return v_total;
end;
$$;
revoke execute on function private.invoice_cash_payable_basis(uuid, uuid) from public, anon, authenticated;

-- Payroll periods are calendar/supporting records. APPROVED and PAID are
-- payroll-run finalization states, not an alternate period approval path.
create or replace function public.guard_payroll_period_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Migration fixtures and trusted maintenance functions have no auth.uid;
  -- authenticated client writes pass the explicit checks below. SECURITY
  -- DEFINER changes current_user, so auth.uid is the caller boundary here.
  if (select auth.uid()) is null then return new; end if;
  -- The source-revision trigger performs a bounded internal metadata update
  -- while preserving the initiating user's auth.uid. It must not require the
  -- payroll.manage permission merely to revise an open period's freshness.
  if current_setting('app.payroll_source_revision_internal', true) = 'true' then return new; end if;
  if tg_op = 'INSERT' then
    if new.status in ('APPROVED', 'PAID') then
      raise exception 'Payroll period APPROVED/PAID is supporting metadata only; finalize the payroll run with payroll.approve' using errcode = '42501';
    end if;
    if not (select private.has_company_permission(new.company_id, 'payroll.manage')) then
      raise exception 'Payroll period management permission is required' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.company_id is distinct from old.company_id
     or new.user_id is distinct from old.user_id then
    raise exception 'Payroll period ownership and company are immutable' using errcode = '42501';
  end if;
  if old.status in ('APPROVED', 'PAID', 'VOID') and old is distinct from new then
    raise exception 'Finalized or void payroll periods are immutable; payroll run status owns finalization' using errcode = '42501';
  end if;
  if new.status is distinct from old.status and new.status in ('APPROVED', 'PAID') then
    raise exception 'Payroll period APPROVED/PAID is supporting metadata only; finalize the payroll run with payroll.approve' using errcode = '42501';
  end if;
  if not (select private.has_company_permission(new.company_id, 'payroll.manage')) then
    raise exception 'Payroll period management permission is required' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists payroll_period_status_guard on public.payroll_periods;
create trigger payroll_period_status_guard
before insert or update on public.payroll_periods
for each row execute function public.guard_payroll_period_status();
revoke execute on function public.guard_payroll_period_status() from public, anon, authenticated;

-- Final payroll-run transitions require the effective approval permission at
-- the database boundary. Manage-only members can prepare/recalculate; they
-- cannot approve, pay, or void an already approved run.
create or replace function public.guard_payroll_run_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := coalesce(new.company_id, old.company_id);
  v_has_manage boolean;
  v_has_approve boolean;
begin
  if (select auth.uid()) is null then return case when tg_op = 'DELETE' then old else new end; end if;

  v_has_manage := (select private.has_company_permission(v_company_id, 'payroll.manage'));
  v_has_approve := (select private.has_company_permission(v_company_id, 'payroll.approve'));

  if tg_op = 'INSERT' then
    if new.status <> 'DRAFT' then raise exception 'Payroll runs must be created in DRAFT status' using errcode = '42501'; end if;
    if not v_has_manage then raise exception 'Payroll management permission is required to create a run' using errcode = '42501'; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status in ('APPROVED', 'PAID') then raise exception 'Approved or paid payroll runs cannot be deleted' using errcode = '42501'; end if;
    if not v_has_manage then raise exception 'Payroll management permission is required to delete a run' using errcode = '42501'; end if;
    return old;
  end if;

  if new.company_id is distinct from old.company_id
     or new.user_id is distinct from old.user_id
     or new.period_id is distinct from old.period_id
     or new.import_batch_id is distinct from old.import_batch_id then
    raise exception 'Payroll run ownership, company, period, and import provenance are immutable' using errcode = '42501';
  end if;

  if new.status = old.status then
    if old.status in ('APPROVED', 'PAID', 'VOID') and old is distinct from new then
      raise exception 'Approved, paid, or void payroll runs are immutable' using errcode = '42501';
    end if;
    if not v_has_manage then raise exception 'Payroll management permission is required to edit an open run' using errcode = '42501'; end if;
    return new;
  end if;

  if new.status in ('APPROVED', 'PAID') or (old.status = 'APPROVED' and new.status = 'VOID') then
    if not v_has_approve then raise exception 'Payroll approval permission is required for final payroll transitions' using errcode = '42501'; end if;
  elsif not v_has_manage then
    raise exception 'Payroll management permission is required for this payroll transition' using errcode = '42501';
  end if;

  if not (
    (old.status = 'DRAFT' and new.status in ('CALCULATED', 'VOID'))
    or (old.status = 'CALCULATED' and new.status in ('APPROVED', 'VOID'))
    or (old.status = 'APPROVED' and new.status in ('PAID', 'VOID'))
  ) then
    raise exception 'Invalid payroll run transition: % -> %', old.status, new.status using errcode = '42501';
  end if;

  if old.status = 'APPROVED' and new.status in ('PAID', 'VOID') then
    if new.notes is distinct from old.notes
       or new.approved_at is distinct from old.approved_at
       or new.calculated_at is distinct from old.calculated_at
       or new.calculated_source_revision is distinct from old.calculated_source_revision
       or new.source_fingerprint is distinct from old.source_fingerprint
       or new.paid_at is distinct from old.paid_at and new.status = 'VOID' then
      raise exception 'Approved payroll runs allow only the next state transition; calculated history is immutable' using errcode = '42501';
    end if;
  end if;

  -- Approval finalizes the already-calculated result. The approval member may
  -- change status and the server owns approved_at/paid_at, but calculated
  -- evidence cannot be rewritten in the same UPDATE.
  if old.status = 'CALCULATED' and new.status = 'APPROVED' then
    if new.calculated_at is distinct from old.calculated_at
       or new.calculated_source_revision is distinct from old.calculated_source_revision
       or new.source_fingerprint is distinct from old.source_fingerprint then
      raise exception 'Calculated payroll evidence is immutable during approval' using errcode = '42501';
    end if;
  end if;

  if new.status = 'APPROVED' then
    if not exists (select 1 from public.payroll_entries pe where pe.payroll_run_id = new.id and pe.company_id = new.company_id) then
      raise exception 'Payroll run approval requires at least one payroll entry' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.payroll_entries pe
      where pe.payroll_run_id = new.id and pe.company_id = new.company_id
        and (pe.calculation_snapshot is null or jsonb_typeof(pe.calculation_snapshot) <> 'object' or pe.calculation_snapshot = '{}'::jsonb
          or pe.project_allocated_cost > pe.gross_pay + 0.01 or pe.net_pay > pe.gross_pay + 0.01)
    ) then
      raise exception 'Payroll approval requires valid snapshots, project labor within gross pay, and net pay within gross pay' using errcode = '42501';
    end if;
    new.approved_at := coalesce(old.approved_at, now());
    new.paid_at := null;
  elsif new.status = 'PAID' then
    new.paid_at := coalesce(old.paid_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists payroll_runs_transition_guard on public.payroll_runs;
create trigger payroll_runs_transition_guard
before insert or update or delete on public.payroll_runs
for each row execute function public.guard_payroll_run_transition();
revoke execute on function public.guard_payroll_run_transition() from public, anon, authenticated;

-- Approval-only members need to read/update the run row that they are
-- authorized to finalize. The trigger above prevents them from editing the
-- calculated payload or changing an open run as a side effect.
drop policy if exists payroll_runs_company_select on public.payroll_runs;
create policy payroll_runs_company_select on public.payroll_runs
for select to authenticated
using (
  (select public.has_company_permission(company_id, 'payroll.summary.read'))
  or (select public.has_company_permission(company_id, 'payroll.approve'))
);
drop policy if exists payroll_runs_company_update on public.payroll_runs;
create policy payroll_runs_company_update on public.payroll_runs
for update to authenticated
using (
  (select public.has_company_permission(company_id, 'payroll.manage'))
  or (select public.has_company_permission(company_id, 'payroll.approve'))
)
with check (
  (select public.has_company_permission(company_id, 'payroll.manage'))
  or (select public.has_company_permission(company_id, 'payroll.approve'))
);

-- Project labor and employee net pay are both subsets of gross pay. These
-- checks stop a direct payroll.manage write from manufacturing project cost or
-- an overlarge settlement basis while the run is still open.
create or replace function public.validate_payroll_entry_financial_integrity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.project_allocated_cost > new.gross_pay + 0.01 then
    raise exception 'Payroll project labor cannot exceed gross pay' using errcode = '22023';
  end if;
  if new.net_pay > new.gross_pay + 0.01 then
    raise exception 'Payroll net pay cannot exceed gross pay' using errcode = '22023';
  end if;
  return new;
end;
$$;
drop trigger if exists payroll_entries_financial_integrity on public.payroll_entries;
create trigger payroll_entries_financial_integrity
before insert or update on public.payroll_entries
for each row execute function public.validate_payroll_entry_financial_integrity();
revoke execute on function public.validate_payroll_entry_financial_integrity() from public, anon, authenticated;

-- Source corrections must revise only overlapping open/unlocked periods. The
-- old trigger treated date-less worker/profile/component changes as affecting
-- every open period and missed the old period when a source was reassigned.
create or replace function public.bump_payroll_source_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb := coalesce(to_jsonb(new), '{}'::jsonb);
  v_old jsonb := coalesce(to_jsonb(old), '{}'::jsonb);
  v_company_id uuid := nullif(coalesce(v_new ->> 'company_id', v_old ->> 'company_id'), '')::uuid;
  v_new_period_id uuid := nullif(v_new ->> 'period_id', '')::uuid;
  v_old_period_id uuid := nullif(v_old ->> 'period_id', '')::uuid;
  v_project_id uuid := nullif(coalesce(v_new ->> 'id', v_old ->> 'id'), '')::uuid;
  v_start_date date;
  v_end_date date;
  v_relevant boolean := true;
begin
  if tg_table_name = 'projects' then
    if tg_op = 'UPDATE' and old.status is not distinct from new.status and old.archived_at is not distinct from new.archived_at then return new; end if;
    perform set_config('app.payroll_source_revision_internal', 'true', true);
    update public.payroll_periods p
    set source_revision = p.source_revision + 1, source_revision_updated_at = now(), updated_at = now()
    where p.company_id = v_company_id and p.locked_at is null and p.status not in ('APPROVED', 'PAID', 'VOID')
      and (exists (select 1 from public.work_entries w where w.company_id = p.company_id and w.project_id = v_project_id and w.period_id = p.id)
        or exists (select 1 from public.project_worker_assignments a where a.company_id = p.company_id and a.project_id = v_project_id and a.start_date <= p.period_end and (a.end_date is null or a.end_date >= p.period_start))
        or exists (select 1 from public.overtime_requests o where o.company_id = p.company_id and o.project_id = v_project_id and o.overtime_date between p.period_start and p.period_end));
    perform set_config('app.payroll_source_revision_internal', '', true);
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE' then
    if tg_table_name = 'workers' then
      v_relevant := not (
        (v_new ->> 'active') is not distinct from (v_old ->> 'active')
        and (v_new ->> 'employment_status') is not distinct from (v_old ->> 'employment_status')
        and (v_new ->> 'default_pay_type') is not distinct from (v_old ->> 'default_pay_type')
        and (v_new ->> 'default_rate') is not distinct from (v_old ->> 'default_rate')
        and (v_new ->> 'default_labor_context') is not distinct from (v_old ->> 'default_labor_context')
        and (v_new ->> 'default_project_id') is not distinct from (v_old ->> 'default_project_id')
        and (v_new ->> 'hire_date') is not distinct from (v_old ->> 'hire_date')
        and (v_new ->> 'end_date') is not distinct from (v_old ->> 'end_date')
        and (v_new ->> 'archived_at') is not distinct from (v_old ->> 'archived_at')
      );
    elsif tg_table_name = 'project_worker_assignments' then
      v_relevant := not ((v_new ->> 'worker_id') is not distinct from (v_old ->> 'worker_id') and (v_new ->> 'project_id') is not distinct from (v_old ->> 'project_id') and (v_new ->> 'start_date') is not distinct from (v_old ->> 'start_date') and (v_new ->> 'end_date') is not distinct from (v_old ->> 'end_date') and (v_new ->> 'pay_type') is not distinct from (v_old ->> 'pay_type') and (v_new ->> 'rate') is not distinct from (v_old ->> 'rate') and (v_new ->> 'active') is not distinct from (v_old ->> 'active'));
    elsif tg_table_name = 'worker_compensation_profiles' then
      v_relevant := not ((v_new ->> 'worker_id') is not distinct from (v_old ->> 'worker_id') and (v_new ->> 'effective_from') is not distinct from (v_old ->> 'effective_from') and (v_new ->> 'effective_to') is not distinct from (v_old ->> 'effective_to') and (v_new ->> 'frequency') is not distinct from (v_old ->> 'frequency') and (v_new ->> 'rate') is not distinct from (v_old ->> 'rate') and (v_new ->> 'default_labor_context') is not distinct from (v_old ->> 'default_labor_context') and (v_new ->> 'default_project_id') is not distinct from (v_old ->> 'default_project_id') and (v_new ->> 'active') is not distinct from (v_old ->> 'active'));
    elsif tg_table_name = 'recurring_payroll_components' then
      v_relevant := not ((v_new ->> 'worker_id') is not distinct from (v_old ->> 'worker_id') and (v_new ->> 'type') is not distinct from (v_old ->> 'type') and (v_new ->> 'code') is not distinct from (v_old ->> 'code') and (v_new ->> 'amount') is not distinct from (v_old ->> 'amount') and (v_new ->> 'rate') is not distinct from (v_old ->> 'rate') and (v_new ->> 'effective_from') is not distinct from (v_old ->> 'effective_from') and (v_new ->> 'effective_to') is not distinct from (v_old ->> 'effective_to') and (v_new ->> 'active') is not distinct from (v_old ->> 'active'));
    elsif tg_table_name = 'payroll_holidays' then
      v_relevant := not ((v_new ->> 'holiday_date') is not distinct from (v_old ->> 'holiday_date') and (v_new ->> 'active') is not distinct from (v_old ->> 'active'));
    end if;
    if not v_relevant then return new; end if;
  end if;

  if tg_table_name = 'workers' then
    v_start_date := least(nullif(v_new ->> 'hire_date', '')::date, nullif(v_old ->> 'hire_date', '')::date);
    if nullif(v_new ->> 'end_date', '') is null or nullif(v_old ->> 'end_date', '') is null then v_end_date := date '9999-12-31'; else v_end_date := greatest(nullif(v_new ->> 'end_date', '')::date, nullif(v_old ->> 'end_date', '')::date); end if;
    if v_start_date is null then v_start_date := date '0001-01-01'; end if;
  elsif tg_table_name = 'project_worker_assignments' then
    v_start_date := least(nullif(v_new ->> 'start_date', '')::date, nullif(v_old ->> 'start_date', '')::date);
    if nullif(v_new ->> 'end_date', '') is null or nullif(v_old ->> 'end_date', '') is null then v_end_date := date '9999-12-31'; else v_end_date := greatest(nullif(v_new ->> 'end_date', '')::date, nullif(v_old ->> 'end_date', '')::date); end if;
  elsif tg_table_name in ('worker_compensation_profiles', 'recurring_payroll_components') then
    v_start_date := least(nullif(v_new ->> 'effective_from', '')::date, nullif(v_old ->> 'effective_from', '')::date);
    if nullif(v_new ->> 'effective_to', '') is null or nullif(v_old ->> 'effective_to', '') is null then v_end_date := date '9999-12-31'; else v_end_date := greatest(nullif(v_new ->> 'effective_to', '')::date, nullif(v_old ->> 'effective_to', '')::date); end if;
  elsif tg_table_name = 'payroll_holidays' then
    v_start_date := least(nullif(v_new ->> 'holiday_date', '')::date, nullif(v_old ->> 'holiday_date', '')::date);
    v_end_date := greatest(nullif(v_new ->> 'holiday_date', '')::date, nullif(v_old ->> 'holiday_date', '')::date);
  else
    v_start_date := least(nullif(v_new ->> 'attendance_date', '')::date, nullif(v_new ->> 'overtime_date', '')::date, nullif(v_new ->> 'start_date', '')::date, nullif(v_new ->> 'work_date', '')::date, nullif(v_old ->> 'attendance_date', '')::date, nullif(v_old ->> 'overtime_date', '')::date, nullif(v_old ->> 'start_date', '')::date, nullif(v_old ->> 'work_date', '')::date);
    v_end_date := greatest(nullif(v_new ->> 'end_date', '')::date, nullif(v_new ->> 'attendance_date', '')::date, nullif(v_new ->> 'overtime_date', '')::date, nullif(v_new ->> 'work_date', '')::date, nullif(v_old ->> 'end_date', '')::date, nullif(v_old ->> 'attendance_date', '')::date, nullif(v_old ->> 'overtime_date', '')::date, nullif(v_old ->> 'work_date', '')::date);
  end if;

  perform set_config('app.payroll_source_revision_internal', 'true', true);
  update public.payroll_periods p
  set source_revision = p.source_revision + 1, source_revision_updated_at = now(), updated_at = now()
  where p.company_id = v_company_id and p.locked_at is null and p.status not in ('APPROVED', 'PAID', 'VOID')
    and (p.id = v_new_period_id or p.id = v_old_period_id
      or (v_start_date is not null and v_end_date is not null and p.period_start <= v_end_date and p.period_end >= v_start_date)
      or (v_start_date is null and v_end_date is null));
  perform set_config('app.payroll_source_revision_internal', '', true);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke execute on function public.bump_payroll_source_revision() from public, anon, authenticated;

-- Currency is deployment-wide for payroll because the legacy schema has no
-- run currency column. Once payroll history exists, changing the deployment
-- currency would relabel historical settlement and labor totals.
create or replace function private.guard_company_payroll_currency_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.default_currency is distinct from old.default_currency
     and exists (select 1 from public.payroll_runs r where r.company_id = new.id) then
    raise exception 'Deployment currency cannot change after payroll history exists; preserve historical payroll currency' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists companies_payroll_currency_guard on public.companies;
create trigger companies_payroll_currency_guard
before update of default_currency on public.companies
for each row execute function private.guard_company_payroll_currency_change();
revoke execute on function private.guard_company_payroll_currency_change() from public, anon, authenticated;

-- Guarded calculation replacement. The expected period revision is checked
-- while the run and period are locked, before any existing entries are deleted.
create or replace function private.replace_payroll_run_entries_guarded(
  p_run_id uuid,
  p_expected_source_revision bigint,
  p_entries jsonb,
  p_allocations jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid;
  v_period_id uuid;
  v_status text;
  v_current_revision bigint;
  v_entry jsonb;
  v_allocation jsonb;
begin
  if v_user_id is null then raise exception 'Authentication is required to replace payroll run entries' using errcode = '42501'; end if;
  select r.company_id, r.period_id, r.status into v_company_id, v_period_id, v_status
  from public.payroll_runs r
  where r.id = p_run_id and (select private.has_company_permission(r.company_id, 'payroll.manage'))
    and r.company_id = (select private.deployment_company_id())
  for update;
  if not found then raise exception 'Payroll run is outside an authorized deployment company' using errcode = '42501'; end if;
  if v_status not in ('DRAFT', 'CALCULATED') then raise exception 'Locked payroll runs cannot be rebuilt' using errcode = '42501'; end if;
  select p.source_revision into v_current_revision from public.payroll_periods p where p.id = v_period_id and p.company_id = v_company_id for update;
  if v_current_revision is null or p_expected_source_revision is null or v_current_revision <> p_expected_source_revision then
    raise exception 'Payroll sources changed after calculation preview; prepare the recalculation again' using errcode = '40001';
  end if;
  if exists (select 1 from (select value ->> 'workerId' as worker_id, count(*) as row_count from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) group by value ->> 'workerId' having count(*) > 1) duplicates) then
    raise exception 'A payroll run cannot contain duplicate workers' using errcode = '22023';
  end if;

  delete from public.payroll_project_allocations where payroll_entry_id in (select e.id from public.payroll_entries e where e.payroll_run_id = p_run_id and e.company_id = v_company_id);
  delete from public.payroll_entries where payroll_run_id = p_run_id and company_id = v_company_id;
  for v_entry in select value from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    insert into public.payroll_entries (id, user_id, company_id, payroll_run_id, worker_id, base_pay, regular_pay, overtime_pay, allowances, other_earnings, gross_pay, deductions, other_deductions, employer_costs, net_pay, project_allocated_cost, calculation_snapshot, cost_context, import_row_id)
    values ((v_entry ->> 'id')::uuid, v_user_id, v_company_id, p_run_id, (v_entry ->> 'workerId')::uuid, coalesce((v_entry ->> 'basePay')::numeric, 0), coalesce((v_entry ->> 'regularPay')::numeric, 0), coalesce((v_entry ->> 'overtimePay')::numeric, 0), coalesce((v_entry ->> 'allowances')::numeric, 0), coalesce((v_entry ->> 'otherEarnings')::numeric, 0), coalesce((v_entry ->> 'grossPay')::numeric, 0), coalesce((v_entry ->> 'deductions')::numeric, 0), coalesce((v_entry ->> 'otherDeductions')::numeric, 0), coalesce((v_entry ->> 'employerCosts')::numeric, 0), coalesce((v_entry ->> 'netPay')::numeric, 0), coalesce((v_entry ->> 'projectAllocatedCost')::numeric, 0), coalesce(v_entry -> 'calculationSnapshot', '{}'::jsonb), coalesce(v_entry -> 'costContext', '{}'::jsonb), nullif(v_entry ->> 'importRowId', '')::uuid);
  end loop;
  for v_allocation in select value from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) loop
    insert into public.payroll_project_allocations (id, user_id, company_id, payroll_entry_id, project_id, allocation_amount, allocation_percentage, source)
    values ((v_allocation ->> 'id')::uuid, v_user_id, v_company_id, (v_allocation ->> 'payrollEntryId')::uuid, (v_allocation ->> 'projectId')::uuid, coalesce((v_allocation ->> 'allocationAmount')::numeric, 0), nullif(v_allocation ->> 'allocationPercentage', '')::numeric, coalesce(v_allocation ->> 'source', 'MANUAL'));
  end loop;
end;
$$;

-- Keep the old public signature present for historical function resolution,
-- but remove its client execution path. Current callers use the revision-bound
-- four-argument contract below; import commit uses the private helper.
revoke all on function public.replace_payroll_run_entries(uuid, jsonb, jsonb) from public, anon, authenticated;

create or replace function public.replace_payroll_run_entries(
  p_run_id uuid,
  p_expected_source_revision bigint,
  p_entries jsonb,
  p_allocations jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.replace_payroll_run_entries_guarded(p_run_id, p_expected_source_revision, p_entries, p_allocations);
end;
$$;
revoke all on function public.replace_payroll_run_entries(uuid, bigint, jsonb, jsonb) from public, anon;
grant execute on function public.replace_payroll_run_entries(uuid, bigint, jsonb, jsonb) to authenticated;
revoke execute on function private.replace_payroll_run_entries_guarded(uuid, bigint, jsonb, jsonb) from public, anon, authenticated;

-- Rebind import commit to the private helper so its new period can be
-- committed atomically without exposing an unguarded replacement RPC.
create or replace function public.commit_payroll_import(
  p_batch_id uuid,
  p_period jsonb,
  p_run jsonb,
  p_entries jsonb,
  p_allocations jsonb,
  p_rows jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid;
  v_period_id uuid := (p_period ->> 'id')::uuid;
  v_run_id uuid := (p_run ->> 'id')::uuid;
  v_row jsonb;
  v_period_status text := coalesce(p_period ->> 'status', 'DRAFT');
begin
  if v_user_id is null then raise exception 'Authentication is required to commit payroll imports' using errcode = '42501'; end if;
  if v_period_status not in ('DRAFT', 'OPEN', 'CALCULATED') then raise exception 'Payroll imports cannot create a finalized period status' using errcode = '42501'; end if;
  select b.company_id into v_company_id
  from public.payroll_import_batches b
  where b.id = p_batch_id and b.status not in ('COMMITTED', 'VOIDED')
    and (select private.has_company_permission(b.company_id, 'payroll.import'))
    and (select private.has_company_permission(b.company_id, 'payroll.manage'))
    and b.company_id = (select private.deployment_company_id())
  for update;
  if v_company_id is null then raise exception 'Payroll import batch is unavailable in an authorized deployment company' using errcode = '42501'; end if;

  insert into public.payroll_periods (id, user_id, company_id, period_start, period_end, pay_date, status, notes)
  values (v_period_id, v_user_id, v_company_id, (p_period ->> 'periodStart')::date, (p_period ->> 'periodEnd')::date, nullif(p_period ->> 'payDate', '')::date, v_period_status, p_period ->> 'notes');
  insert into public.payroll_runs (id, user_id, company_id, period_id, import_batch_id, status, notes)
  values (v_run_id, v_user_id, v_company_id, v_period_id, p_batch_id, 'DRAFT', p_run ->> 'notes');
  perform private.replace_payroll_run_entries_guarded(v_run_id, 0, p_entries, p_allocations);
  for v_row in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    update public.payroll_import_rows r
    set status = coalesce(v_row ->> 'status', 'COMMITTED'), committed_payroll_entry_id = nullif(v_row ->> 'committedPayrollEntryId', '')::uuid, updated_at = now()
    where r.id = (v_row ->> 'id')::uuid and r.batch_id = p_batch_id and r.company_id = v_company_id;
    if not found then raise exception 'Payroll import row is outside the company' using errcode = '42501'; end if;
  end loop;
  update public.payroll_import_batches b
  set status = 'COMMITTED', committed_payroll_period_id = v_period_id, committed_payroll_run_id = v_run_id, committed_at = now(), updated_at = now()
  where b.id = p_batch_id and b.company_id = v_company_id;
end;
$$;
revoke all on function public.commit_payroll_import(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.commit_payroll_import(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;

-- Final settlement summaries must expose a VOID lifecycle state instead of a
-- plausible PAID/UNPAID state for a record that no longer has an active duty.
create or replace function public.get_financial_settlement_summary(
  p_company_id uuid,
  p_target_type text,
  p_target_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_basis numeric := 0;
  v_currency text;
  v_lifecycle text;
  v_due_date date;
  v_document_paid numeric := 0;
  v_cash_paid numeric := 0;
  v_effective numeric := 0;
  v_history jsonb := '[]'::jsonb;
  v_permission text;
  v_can_read_cash boolean := false;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  v_permission := case p_target_type when 'INVOICE' then 'invoices.read' when 'PAYROLL' then 'payroll.summary.read' when 'EXPENSE' then 'expenses.read' else null end;
  if v_permission is null or not (select private.has_company_permission(p_company_id, v_permission)) then raise exception 'Settlement summary permission denied' using errcode = '42501'; end if;
  v_can_read_cash := (select private.has_company_permission(p_company_id, 'cash.transactions.read'));
  if p_target_type = 'INVOICE' then
    select i.currency, case when i.lifecycle_status = 'VOID' then 'VOID' else i.review_status end, i.due_date, case when coalesce(i.current_data ->> 'amountPaid', '') ~ '^[-+]?[0-9]+([.][0-9]+)?$' then (i.current_data ->> 'amountPaid')::numeric else 0 end into v_currency, v_lifecycle, v_due_date, v_document_paid
    from public.invoices i where i.id = p_target_id and i.company_id = p_company_id;
    if not found then raise exception 'Invoice unavailable' using errcode = '42501'; end if;
    v_basis := private.invoice_cash_payable_basis(p_target_id, p_company_id);
  elsif p_target_type = 'PAYROLL' then
    select c.default_currency, pr.status into v_currency, v_lifecycle from public.payroll_runs pr join public.companies c on c.id = pr.company_id where pr.id = p_target_id and pr.company_id = p_company_id;
    if not found then raise exception 'Payroll run unavailable' using errcode = '42501'; end if;
    v_basis := private.payroll_net_pay_basis(p_target_id, p_company_id);
  else
    select e.currency, e.status, e.amount into v_currency, v_lifecycle, v_basis from public.expenses e where e.id = p_target_id and e.company_id = p_company_id;
    if not found then raise exception 'Expense unavailable' using errcode = '42501'; end if;
  end if;
  select coalesce(sum(m.matched_amount) filter (where m.status = 'CONFIRMED'), 0) into v_cash_paid from public.financial_transaction_matches m where m.company_id = p_company_id and m.target_type = p_target_type and m.target_id = p_target_id;
  if v_can_read_cash then
    select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'transactionId', m.transaction_id, 'status', m.status, 'amount', m.matched_amount, 'confirmedAt', m.confirmed_at, 'confirmedByUserId', m.confirmed_by_user_id, 'reversedAt', m.reversed_at, 'reversedByUserId', m.reversed_by_user_id, 'reversalReason', m.reversal_reason, 'confirmationSource', m.confirmation_source, 'accountId', ft.account_id, 'accountName', fa.display_name, 'accountType', fa.account_type, 'maskedIdentifier', fa.masked_identifier, 'transactionDate', ft.transaction_date, 'referenceNumber', ft.reference_number, 'description', ft.description, 'currency', ft.currency) order by coalesce(m.confirmed_at, m.created_at) desc), '[]'::jsonb) into v_history
    from public.financial_transaction_matches m join public.financial_transactions ft on ft.id = m.transaction_id and ft.company_id = m.company_id join public.financial_accounts fa on fa.id = ft.account_id and fa.company_id = ft.company_id
    where m.company_id = p_company_id and m.target_type = p_target_type and m.target_id = p_target_id and m.status in ('CONFIRMED', 'REVERSED');
  end if;
  v_document_paid := least(v_basis, greatest(coalesce(v_document_paid, 0), 0));
  v_cash_paid := least(v_basis, greatest(coalesce(v_cash_paid, 0), 0));
  v_effective := case when p_target_type = 'INVOICE' then greatest(v_document_paid, v_cash_paid) else v_cash_paid end;
  return jsonb_build_object('targetType', p_target_type, 'targetId', p_target_id, 'currency', v_currency, 'lifecycleStatus', v_lifecycle, 'settlementBasis', round(coalesce(v_basis, 0), 2), 'reconciledCashPaid', round(v_cash_paid, 2), 'documentReportedPaid', case when p_target_type = 'INVOICE' then round(v_document_paid, 2) else 0 end, 'effectiveSettled', round(v_effective, 2), 'outstanding', round(greatest(v_basis - v_effective, 0), 2), 'settlementState', case when v_lifecycle = 'VOID' then 'VOID' when p_target_type = 'PAYROLL' and v_cash_paid <= 0.005 then 'UNSETTLED' when p_target_type = 'PAYROLL' and v_cash_paid >= v_basis - 0.005 then 'SETTLED' when p_target_type = 'PAYROLL' then 'PARTIALLY_DISBURSED' when v_effective >= v_basis - 0.005 then 'PAID' when p_target_type = 'INVOICE' and v_due_date is not null and v_due_date < current_date and v_effective < v_basis - 0.005 then 'OVERDUE' when v_effective > 0.005 then 'PARTIALLY_PAID' else 'UNPAID' end, 'basisSource', case when p_target_type = 'INVOICE' and private.invoice_cash_payable_basis(p_target_id, p_company_id) <> (select i.grand_total from public.invoices i where i.id = p_target_id) then 'EXPLICIT_NET_PAYABLE' when p_target_type = 'PAYROLL' then 'EMPLOYEE_NET_PAY' when p_target_type = 'EXPENSE' then 'EXPENSE_AMOUNT' else 'GROSS_DOCUMENT_AMOUNT' end, 'legacyPaidWithoutBankLink', p_target_type = 'PAYROLL' and v_lifecycle = 'PAID' and v_cash_paid <= 0.005, 'historyRedacted', not v_can_read_cash, 'history', v_history);
end;
$$;
revoke all on function public.get_financial_settlement_summary(uuid, text, uuid) from public, anon;
grant execute on function public.get_financial_settlement_summary(uuid, text, uuid) to authenticated;

-- Allocation replacement is optimistic-concurrency guarded. The legacy
-- two-argument function remains defined for upgrade compatibility but is no
-- longer executable by browser roles.
create or replace function public.replace_invoice_project_allocations(
  p_invoice_id uuid,
  p_allocations jsonb,
  p_expected_updated_at timestamptz
)
returns setof public.invoice_project_allocations
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_company_id uuid := (select private.deployment_company_id());
  v_updated_at timestamptz;
begin
  if v_actor is null or p_expected_updated_at is null then
    raise exception 'Invoice freshness is required for allocation replacement' using errcode = '42501';
  end if;
  select i.updated_at into v_updated_at
  from public.invoices i
  where i.id = p_invoice_id
    and i.company_id = v_company_id
    and (select private.has_company_permission(v_company_id, 'invoices.manage'))
  for update;
  if not found then raise exception 'Invoice does not exist in the authorized deployment company' using errcode = '42501'; end if;
  if v_updated_at is distinct from p_expected_updated_at then
    raise exception 'Invoice allocations changed in another session; refresh before replacing them' using errcode = '40001';
  end if;

  perform public.replace_invoice_project_allocations(p_invoice_id, p_allocations);
  update public.invoices
  set updated_at = now()
  where id = p_invoice_id and company_id = v_company_id;
  return query
    select a.* from public.invoice_project_allocations a
    where a.invoice_id = p_invoice_id and a.company_id = v_company_id
    order by a.project_id, a.id;
end;
$$;

revoke all on function public.replace_invoice_project_allocations(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.replace_invoice_project_allocations(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.replace_invoice_project_allocations(uuid, jsonb, timestamptz) to authenticated;
