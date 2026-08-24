-- Company boundary triggers and relationship integrity.
-- All trigger functions are invoker functions with an empty search_path unless
-- they are explicitly used as a narrow internal lookup helper.

create or replace function private.enforce_company_row_boundary()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.company_id is null then
    if tg_table_name = 'payroll_schedule_versions' then
      select ps.company_id
        into new.company_id
      from public.payroll_schedules ps
      where ps.id = new.schedule_id;
      if new.company_id is null then
        raise exception 'Payroll schedule version requires an existing company-scoped schedule'
          using errcode = '42501';
      end if;
    else
      new.company_id := private.resolve_transition_company();
    end if;
  end if;

  if tg_op = 'UPDATE' and new.company_id is distinct from old.company_id then
    raise exception 'Company ownership is immutable; move records through an explicit audited workflow'
      using errcode = '42501';
  end if;

  if new.company_id is null then
    raise exception 'company_id is required'
      using errcode = '23502';
  end if;
  return new;
end;
$$;

create or replace function private.prevent_company_audit_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Company audit events are append-only';
end;
$$;

create or replace function private.set_company_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.write_company_audit(
  p_company_id uuid,
  p_event_type text,
  p_target_type text,
  p_target_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required for company audit events'
      using errcode = '42501';
  end if;
  if not exists (select 1 from public.companies c where c.id = p_company_id) then
    raise exception 'Company does not exist'
      using errcode = '22023';
  end if;
  insert into public.company_audit_events (
    company_id, actor_user_id, event_type, target_type, target_id, metadata
  ) values (
    p_company_id,
    (select auth.uid()),
    p_event_type,
    p_target_type,
    p_target_id,
    case when jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) = 'object' then coalesce(p_metadata, '{}'::jsonb) else '{}'::jsonb end
  );
end;
$$;

grant execute on function private.enforce_company_row_boundary() to authenticated;
grant execute on function private.prevent_company_audit_mutation() to authenticated;
grant execute on function private.set_company_updated_at() to authenticated;
revoke execute on function private.write_company_audit(uuid, text, text, uuid, jsonb) from public, anon, authenticated;

drop trigger if exists company_company_updated_at on public.companies;
create trigger company_company_updated_at
before update on public.companies
for each row execute function private.set_company_updated_at();

drop trigger if exists company_members_updated_at on public.company_members;
create trigger company_members_updated_at
before update on public.company_members
for each row execute function private.set_company_updated_at();

drop trigger if exists company_invitations_updated_at on public.company_invitations;
create trigger company_invitations_updated_at
before update on public.company_invitations
for each row execute function private.set_company_updated_at();

drop trigger if exists company_audit_append_only on public.company_audit_events;
create trigger company_audit_append_only
before update or delete on public.company_audit_events
for each row execute function private.prevent_company_audit_mutation();

do $$
declare
  r record;
begin
  for r in select table_name from private.company_tenant_policy_catalog loop
    execute format('drop trigger if exists %I on public.%I', r.table_name || '_company_boundary', r.table_name);
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function private.enforce_company_row_boundary()',
      r.table_name || '_company_boundary', r.table_name
    );
  end loop;
end $$;

create or replace function public.validate_invoice_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.source_document_id is not null and not exists (
    select 1 from public.source_documents d where d.id = new.source_document_id and d.company_id = new.company_id
  ) then
    raise exception 'Invoice source document is outside the company';
  end if;
  if new.source_email_id is not null and not exists (
    select 1 from public.email_messages e where e.id = new.source_email_id and e.company_id = new.company_id
  ) then
    raise exception 'Invoice source email is outside the company';
  end if;
  if new.vendor_id is not null and not exists (
    select 1 from public.vendors v where v.id = new.vendor_id and v.company_id = new.company_id
  ) then
    raise exception 'Invoice vendor is outside the company';
  end if;
  if new.duplicate_of_id is not null and not exists (
    select 1 from public.invoices source_invoice where source_invoice.id = new.duplicate_of_id and source_invoice.company_id = new.company_id
  ) then
    raise exception 'Duplicate invoice reference is outside the company';
  end if;
  return new;
end;
$$;

create or replace function public.validate_source_document_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.email_message_id is not null and not exists (
    select 1 from public.email_messages e where e.id = new.email_message_id and e.company_id = new.company_id
  ) then
    raise exception 'Source document email is outside the company';
  end if;
  return new;
end;
$$;

create or replace function public.validate_invoice_child_company()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.invoices i where i.id = new.invoice_id and i.company_id = new.company_id
  ) then
    raise exception 'Invoice child record is outside the company';
  end if;
  return new;
end;
$$;

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
  return new;
end;
$$;

create or replace function public.validate_project_worker_assignment_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.workers w
    join public.projects p on p.id = new.project_id
    where w.id = new.worker_id and w.company_id = new.company_id and p.company_id = new.company_id
  ) then
    raise exception 'Worker and project must belong to the same company';
  end if;
  return new;
end;
$$;

create or replace function public.validate_work_entry_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.workers w
    join public.projects p on p.id = new.project_id
    where w.id = new.worker_id and w.company_id = new.company_id and p.company_id = new.company_id
  ) then
    raise exception 'Work entry worker and project must belong to the same company';
  end if;
  if new.period_id is not null and not exists (
    select 1 from public.payroll_periods pp where pp.id = new.period_id and pp.company_id = new.company_id
  ) then
    raise exception 'Work entry payroll period is outside the company';
  end if;
  return new;
end;
$$;

create or replace function public.validate_payroll_period_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.schedule_id is not null and not exists (
    select 1 from public.payroll_schedules ps where ps.id = new.schedule_id and ps.company_id = new.company_id
  ) then
    raise exception 'Payroll schedule is outside the company';
  end if;
  if new.schedule_version_id is not null and not exists (
    select 1 from public.payroll_schedule_versions psv where psv.id = new.schedule_version_id and psv.company_id = new.company_id
  ) then
    raise exception 'Payroll schedule version is outside the company';
  end if;
  if new.schedule_id is not null and new.schedule_version_id is not null and not exists (
    select 1 from public.payroll_schedule_versions psv where psv.id = new.schedule_version_id and psv.schedule_id = new.schedule_id
  ) then
    raise exception 'Payroll period schedule and version do not match';
  end if;
  return new;
end;
$$;

create or replace function public.validate_payroll_run_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.payroll_periods pp where pp.id = new.period_id and pp.company_id = new.company_id
  ) then
    raise exception 'Payroll period is outside the company';
  end if;
  if new.import_batch_id is not null and not exists (
    select 1 from public.payroll_import_batches pib where pib.id = new.import_batch_id and pib.company_id = new.company_id
  ) then
    raise exception 'Payroll import batch is outside the company';
  end if;
  return new;
end;
$$;

create or replace function public.validate_payroll_entry_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.payroll_runs pr
    join public.workers w on w.id = new.worker_id
    where pr.id = new.payroll_run_id and pr.company_id = new.company_id and w.company_id = new.company_id
  ) then
    raise exception 'Payroll entry run and worker must belong to the same company';
  end if;
  if new.import_row_id is not null and not exists (
    select 1 from public.payroll_import_rows pir where pir.id = new.import_row_id and pir.company_id = new.company_id
  ) then
    raise exception 'Payroll import row is outside the company';
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
    where pe.id = new.payroll_entry_id and pe.company_id = new.company_id and p.company_id = new.company_id
  ) then
    raise exception 'Payroll allocation entry and project must belong to the same company';
  end if;
  return new;
end;
$$;

create or replace function public.validate_payroll_adjustment_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.payroll_entries pe where pe.id = new.payroll_entry_id and pe.company_id = new.company_id
  ) then
    raise exception 'Payroll adjustment is outside the company';
  end if;
  return new;
end;
$$;

create or replace function public.validate_department_metadata_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.manager_worker_id is not null and not exists (
    select 1 from public.workers w where w.id = new.manager_worker_id and w.company_id = new.company_id
  ) then
    raise exception 'Department manager must belong to the same company';
  end if;
  return new;
end;
$$;

create or replace function public.validate_worker_metadata_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.department_id is not null and not exists (
    select 1 from public.departments d where d.id = new.department_id and d.company_id = new.company_id
  ) then
    raise exception 'Worker department must belong to the same company';
  end if;
  if new.manager_worker_id is not null and not exists (
    select 1 from public.workers manager where manager.id = new.manager_worker_id and manager.company_id = new.company_id
  ) then
    raise exception 'Worker manager must belong to the same company';
  end if;
  return new;
end;
$$;

create or replace function public.validate_worker_compensation_profile_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.workers w where w.id = new.worker_id and w.company_id = new.company_id
  ) then
    raise exception 'Payroll profile worker is outside the company';
  end if;
  if new.default_project_id is not null and not exists (
    select 1 from public.projects p where p.id = new.default_project_id and p.company_id = new.company_id
  ) then
    raise exception 'Payroll profile default project is outside the company';
  end if;
  return new;
end;
$$;

create or replace function public.validate_recurring_payroll_component_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.workers w where w.id = new.worker_id and w.company_id = new.company_id
  ) then
    raise exception 'Payroll component worker is outside the company';
  end if;
  return new;
end;
$$;

create or replace function public.validate_payroll_import_batch_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.detected_template_id is not null and not exists (
    select 1 from public.payroll_import_templates t where t.id = new.detected_template_id and t.company_id = new.company_id
  ) then
    raise exception 'Payroll import template is outside the company';
  end if;
  if new.committed_payroll_period_id is not null and not exists (
    select 1 from public.payroll_periods p where p.id = new.committed_payroll_period_id and p.company_id = new.company_id
  ) then
    raise exception 'Payroll import period is outside the company';
  end if;
  if new.committed_payroll_run_id is not null and not exists (
    select 1 from public.payroll_runs r where r.id = new.committed_payroll_run_id and r.company_id = new.company_id
  ) then
    raise exception 'Payroll import run is outside the company';
  end if;
  return new;
end;
$$;

create or replace function public.validate_payroll_import_row_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.payroll_import_batches b where b.id = new.batch_id and b.company_id = new.company_id) then
    raise exception 'Payroll import batch is outside the company';
  end if;
  if new.worker_id is not null and not exists (select 1 from public.workers w where w.id = new.worker_id and w.company_id = new.company_id) then
    raise exception 'Payroll import worker is outside the company';
  end if;
  if new.project_id is not null and not exists (select 1 from public.projects p where p.id = new.project_id and p.company_id = new.company_id) then
    raise exception 'Payroll import project is outside the company';
  end if;
  if new.cost_center_id is not null and not exists (select 1 from public.labor_cost_centers c where c.id = new.cost_center_id and c.company_id = new.company_id) then
    raise exception 'Payroll import cost center is outside the company';
  end if;
  if new.committed_work_entry_id is not null and not exists (select 1 from public.work_entries w where w.id = new.committed_work_entry_id and w.company_id = new.company_id) then
    raise exception 'Payroll import work entry is outside the company';
  end if;
  if new.committed_payroll_entry_id is not null and not exists (select 1 from public.payroll_entries pe where pe.id = new.committed_payroll_entry_id and pe.company_id = new.company_id) then
    raise exception 'Payroll import payroll entry is outside the company';
  end if;
  return new;
end;
$$;

create or replace function public.validate_schedule_version_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.payroll_schedules ps where ps.id = new.schedule_id and ps.company_id = new.company_id
  ) then
    raise exception 'Payroll schedule version is outside the company';
  end if;
  return new;
end;
$$;

create or replace function public.validate_project_accounting_event_ownership()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.project_id is not null and not exists (
    select 1 from public.projects p where p.id = new.project_id and p.company_id = new.company_id
  ) then
    raise exception 'Project accounting event is outside the company';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_company_relationship on public.invoices;
create trigger invoices_company_relationship before insert or update on public.invoices for each row execute function public.validate_invoice_ownership();
drop trigger if exists source_documents_company_relationship on public.source_documents;
create trigger source_documents_company_relationship before insert or update on public.source_documents for each row execute function public.validate_source_document_ownership();
drop trigger if exists invoice_line_items_company_relationship on public.invoice_line_items;
create trigger invoice_line_items_company_relationship before insert or update on public.invoice_line_items for each row execute function public.validate_invoice_child_company();
drop trigger if exists invoice_extractions_company_relationship on public.invoice_extractions;
create trigger invoice_extractions_company_relationship before insert or update on public.invoice_extractions for each row execute function public.validate_invoice_child_company();
drop trigger if exists invoice_review_events_company_relationship on public.invoice_review_events;
create trigger invoice_review_events_company_relationship before insert or update on public.invoice_review_events for each row execute function public.validate_invoice_child_company();
drop trigger if exists payroll_schedule_versions_company_relationship on public.payroll_schedule_versions;
create trigger payroll_schedule_versions_company_relationship before insert or update on public.payroll_schedule_versions for each row execute function public.validate_schedule_version_ownership();
drop trigger if exists payroll_periods_company_relationship on public.payroll_periods;
create trigger payroll_periods_company_relationship before insert or update on public.payroll_periods for each row execute function public.validate_payroll_period_ownership();
drop trigger if exists project_accounting_events_company_relationship on public.project_accounting_events;
create trigger project_accounting_events_company_relationship before insert or update on public.project_accounting_events for each row execute function public.validate_project_accounting_event_ownership();

drop trigger if exists invoice_project_allocations_ownership on public.invoice_project_allocations;
create trigger invoice_project_allocations_ownership before insert or update on public.invoice_project_allocations for each row execute function public.validate_invoice_project_allocation_ownership();
drop trigger if exists expenses_ownership on public.expenses;
create trigger expenses_ownership before insert or update on public.expenses for each row execute function public.validate_expense_project_ownership();
drop trigger if exists project_worker_assignments_ownership on public.project_worker_assignments;
create trigger project_worker_assignments_ownership before insert or update on public.project_worker_assignments for each row execute function public.validate_project_worker_assignment_ownership();
drop trigger if exists work_entries_ownership on public.work_entries;
create trigger work_entries_ownership before insert or update on public.work_entries for each row execute function public.validate_work_entry_ownership();
drop trigger if exists payroll_runs_ownership on public.payroll_runs;
create trigger payroll_runs_ownership before insert or update on public.payroll_runs for each row execute function public.validate_payroll_run_ownership();
drop trigger if exists payroll_entries_ownership on public.payroll_entries;
create trigger payroll_entries_ownership before insert or update on public.payroll_entries for each row execute function public.validate_payroll_entry_ownership();
drop trigger if exists payroll_project_allocations_ownership on public.payroll_project_allocations;
create trigger payroll_project_allocations_ownership before insert or update on public.payroll_project_allocations for each row execute function public.validate_payroll_project_allocation_ownership();
drop trigger if exists payroll_adjustments_ownership on public.payroll_adjustments;
create trigger payroll_adjustments_ownership before insert or update on public.payroll_adjustments for each row execute function public.validate_payroll_adjustment_ownership();
drop trigger if exists departments_metadata_ownership on public.departments;
create trigger departments_metadata_ownership before insert or update on public.departments for each row execute function public.validate_department_metadata_ownership();
drop trigger if exists workers_metadata_ownership on public.workers;
create trigger workers_metadata_ownership before insert or update on public.workers for each row execute function public.validate_worker_metadata_ownership();
drop trigger if exists worker_compensation_profiles_ownership on public.worker_compensation_profiles;
create trigger worker_compensation_profiles_ownership before insert or update on public.worker_compensation_profiles for each row execute function public.validate_worker_compensation_profile_ownership();
drop trigger if exists recurring_payroll_components_ownership on public.recurring_payroll_components;
create trigger recurring_payroll_components_ownership before insert or update on public.recurring_payroll_components for each row execute function public.validate_recurring_payroll_component_ownership();
drop trigger if exists payroll_import_batches_ownership on public.payroll_import_batches;
create trigger payroll_import_batches_ownership before insert or update on public.payroll_import_batches for each row execute function public.validate_payroll_import_batch_ownership();
drop trigger if exists payroll_import_rows_ownership on public.payroll_import_rows;
create trigger payroll_import_rows_ownership before insert or update on public.payroll_import_rows for each row execute function public.validate_payroll_import_row_ownership();

create or replace function public.guard_single_active_payroll_schedule()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.active then
    update public.payroll_schedules
    set active = false, updated_at = now()
    where company_id = new.company_id
      and id <> new.id
      and active;
  end if;
  return new;
end;
$$;

drop trigger if exists payroll_schedules_single_active_guard on public.payroll_schedules;
create trigger payroll_schedules_single_active_guard
before insert or update on public.payroll_schedules
for each row execute function public.guard_single_active_payroll_schedule();

create or replace function public.validate_payroll_work_entry_integrity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  period_company uuid;
  period_start date;
  period_end date;
begin
  if new.period_id is null then
    if tg_op = 'UPDATE' and old.period_id is null then
      return new;
    end if;
    raise exception 'Work entry must link to a payroll period';
  end if;

  select pp.company_id, pp.period_start, pp.period_end
    into period_company, period_start, period_end
  from public.payroll_periods pp
  where pp.id = new.period_id;

  if period_company is null or period_company is distinct from new.company_id then
    raise exception 'Work entry payroll period is outside the company';
  end if;
  if new.work_date < period_start or new.work_date > period_end then
    raise exception 'Work entry date must fall within its payroll period';
  end if;
  return new;
end;
$$;

create or replace function public.guard_payroll_run_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'DRAFT' then
      raise exception 'Payroll runs must be created in DRAFT status';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status in ('APPROVED', 'PAID') then
      raise exception 'Approved or paid payroll runs cannot be deleted';
    end if;
    return old;
  end if;

  if new.user_id is distinct from old.user_id
     or new.company_id is distinct from old.company_id
     or new.period_id is distinct from old.period_id then
    raise exception 'Payroll run actor, company, and period linkage are immutable';
  end if;

  if new.status = old.status then
    if old.status in ('APPROVED', 'PAID', 'VOID') and old is distinct from new then
      raise exception 'Approved, paid, or void payroll runs are immutable';
    end if;
    return new;
  end if;

  if not (
    (old.status = 'DRAFT' and new.status in ('CALCULATED', 'VOID'))
    or (old.status = 'CALCULATED' and new.status in ('APPROVED', 'VOID'))
    or (old.status = 'APPROVED' and new.status in ('PAID', 'VOID'))
  ) then
    raise exception 'Invalid payroll run transition: % -> %', old.status, new.status;
  end if;

  if old.status = 'APPROVED' and new.status in ('PAID', 'VOID') then
    if new.notes is distinct from old.notes or new.approved_at is distinct from old.approved_at then
      raise exception 'Approved payroll runs allow only the next state transition';
    end if;
  end if;

  if new.status = 'APPROVED' then
    if not exists (
      select 1 from public.payroll_entries pe
      where pe.payroll_run_id = new.id and pe.company_id = new.company_id
    ) then
      raise exception 'Payroll run approval requires at least one payroll entry';
    end if;
    if exists (
      select 1 from public.payroll_entries pe
      where pe.payroll_run_id = new.id and pe.company_id = new.company_id
        and (pe.calculation_snapshot is null or jsonb_typeof(pe.calculation_snapshot) <> 'object' or pe.calculation_snapshot = '{}'::jsonb)
    ) then
      raise exception 'Payroll run approval requires a non-empty object snapshot on every entry';
    end if;
    new.approved_at := coalesce(new.approved_at, now());
    new.paid_at := null;
  elsif new.status = 'PAID' then
    new.paid_at := coalesce(old.paid_at, now());
  end if;
  return new;
end;
$$;

create or replace function public.guard_payroll_entry_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' and exists (
    select 1 from public.payroll_runs pr
    where pr.id = old.payroll_run_id and pr.company_id = old.company_id and pr.status in ('APPROVED', 'PAID', 'VOID')
  ) then
    raise exception 'Payroll entries cannot be changed after the run is approved, paid, or void';
  end if;
  if tg_op <> 'DELETE' and exists (
    select 1 from public.payroll_runs pr
    where pr.id = new.payroll_run_id and pr.company_id = new.company_id and pr.status in ('APPROVED', 'PAID', 'VOID')
  ) then
    raise exception 'Payroll entries cannot be added to an approved, paid, or void run';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.guard_payroll_allocation_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' and exists (
    select 1
    from public.payroll_entries pe join public.payroll_runs pr on pr.id = pe.payroll_run_id
    where pe.id = old.payroll_entry_id and pe.company_id = old.company_id and pr.company_id = old.company_id and pr.status in ('APPROVED', 'PAID', 'VOID')
  ) then
    raise exception 'Payroll allocations cannot be changed after the run is approved, paid, or void';
  end if;
  if tg_op <> 'DELETE' and exists (
    select 1
    from public.payroll_entries pe join public.payroll_runs pr on pr.id = pe.payroll_run_id
    where pe.id = new.payroll_entry_id and pe.company_id = new.company_id and pr.company_id = new.company_id and pr.status in ('APPROVED', 'PAID', 'VOID')
  ) then
    raise exception 'Payroll allocations cannot be added to an approved, paid, or void run';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.guard_payroll_adjustment_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' and exists (
    select 1
    from public.payroll_entries pe join public.payroll_runs pr on pr.id = pe.payroll_run_id
    where pe.id = old.payroll_entry_id and pe.company_id = old.company_id and pr.company_id = old.company_id and pr.status in ('APPROVED', 'PAID', 'VOID')
  ) then
    raise exception 'Payroll adjustments cannot be changed after the run is approved, paid, or void';
  end if;
  if tg_op <> 'DELETE' and exists (
    select 1
    from public.payroll_entries pe join public.payroll_runs pr on pr.id = pe.payroll_run_id
    where pe.id = new.payroll_entry_id and pe.company_id = new.company_id and pr.company_id = new.company_id and pr.status in ('APPROVED', 'PAID', 'VOID')
  ) then
    raise exception 'Payroll adjustments cannot be added to an approved, paid, or void run';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.assert_payroll_project_allocation_totals(target_entry uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  entry_company uuid;
  entry_cost numeric;
  allocated_amount numeric;
  allocated_percentage numeric;
begin
  select pe.company_id, pe.project_allocated_cost into entry_company, entry_cost
  from public.payroll_entries pe where pe.id = target_entry;
  if entry_cost is null then return; end if;
  select coalesce(sum(ppa.allocation_amount), 0), coalesce(sum(ppa.allocation_percentage), 0)
    into allocated_amount, allocated_percentage
  from public.payroll_project_allocations ppa
  where ppa.payroll_entry_id = target_entry and ppa.company_id = entry_company;
  if allocated_percentage > 100.01 then
    raise exception 'Payroll allocation percentages exceed 100%% by %', round(allocated_percentage - 100, 2);
  end if;
  if allocated_amount > entry_cost + 0.01 then
    raise exception 'Payroll project allocation exceeds payroll entry cost by %', round(allocated_amount - entry_cost, 2);
  end if;
end;
$$;

create or replace function public.validate_payroll_project_allocation_totals()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.payroll_entry_id is distinct from new.payroll_entry_id) then
    perform public.assert_payroll_project_allocation_totals(old.payroll_entry_id);
  end if;
  if tg_op <> 'DELETE' then perform public.assert_payroll_project_allocation_totals(new.payroll_entry_id); end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function public.validate_payroll_entry_allocation_total()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.assert_payroll_project_allocation_totals(new.id);
  return new;
end;
$$;

create or replace function public.validate_invoice_project_allocation_total()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_invoice uuid;
  invoice_company uuid;
  invoice_total numeric;
  allocated_total numeric;
begin
  if tg_op = 'DELETE' then target_invoice := old.invoice_id; else target_invoice := new.invoice_id; end if;
  select i.company_id, i.grand_total into invoice_company, invoice_total from public.invoices i where i.id = target_invoice;
  if invoice_total is null then if tg_op = 'DELETE' then return old; else return new; end if; end if;
  select coalesce(sum(case when a.allocation_type = 'PERCENTAGE' then invoice_total * coalesce(a.allocation_percentage, 0) / 100 else coalesce(a.allocation_amount, 0) end), 0)
    into allocated_total
  from public.invoice_project_allocations a
  where a.invoice_id = target_invoice and a.company_id = invoice_company;
  if allocated_total > invoice_total + 0.01 then
    raise exception 'Invoice project allocation exceeds invoice total by %', round(allocated_total - invoice_total, 2);
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists invoice_project_allocation_total_check on public.invoice_project_allocations;
create constraint trigger invoice_project_allocation_total_check
after insert or update or delete on public.invoice_project_allocations
deferrable initially deferred for each row execute function public.validate_invoice_project_allocation_total();
drop trigger if exists payroll_project_allocation_total_check on public.payroll_project_allocations;
create constraint trigger payroll_project_allocation_total_check
after insert or update or delete on public.payroll_project_allocations
deferrable initially deferred for each row execute function public.validate_payroll_project_allocation_totals();
drop trigger if exists payroll_entry_allocation_total_check on public.payroll_entries;
create constraint trigger payroll_entry_allocation_total_check
after insert or update on public.payroll_entries
deferrable initially deferred for each row execute function public.validate_payroll_entry_allocation_total();

drop trigger if exists work_entries_payroll_integrity on public.work_entries;
create trigger work_entries_payroll_integrity before insert or update on public.work_entries for each row execute function public.validate_payroll_work_entry_integrity();
drop trigger if exists payroll_runs_transition_guard on public.payroll_runs;
create trigger payroll_runs_transition_guard before insert or update or delete on public.payroll_runs for each row execute function public.guard_payroll_run_transition();
drop trigger if exists payroll_entries_mutation_guard on public.payroll_entries;
create trigger payroll_entries_mutation_guard before insert or update or delete on public.payroll_entries for each row execute function public.guard_payroll_entry_mutation();
drop trigger if exists payroll_project_allocations_mutation_guard on public.payroll_project_allocations;
create trigger payroll_project_allocations_mutation_guard before insert or update or delete on public.payroll_project_allocations for each row execute function public.guard_payroll_allocation_mutation();
drop trigger if exists payroll_adjustments_mutation_guard on public.payroll_adjustments;
create trigger payroll_adjustments_mutation_guard before insert or update or delete on public.payroll_adjustments for each row execute function public.guard_payroll_adjustment_mutation();

-- Keep the existing immutable extraction/review protection, but lock its
-- trigger function search_path as well.
create or replace function public.prevent_invoice_record_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Immutable invoice extraction snapshots and review history cannot be changed';
end;
$$;
