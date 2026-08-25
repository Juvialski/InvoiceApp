-- Company-scoped payroll/workforce FACTORY RESET recovery tool.
--
-- This is deliberately separate from routine payroll maintenance:
--   * it deletes the ENTIRE payroll/workforce domain of exactly one company,
--     including finalized history, after an exact typed confirmation;
--   * invoices, projects, expenses, vendors, Gmail intake, members, roles,
--     AI configuration, and general company settings are never touched;
--   * every statement filters on company_id — a global wipe is impossible;
--   * teardown happens inside one transaction: either the whole workspace
--     resets or nothing changes.
--
-- Domain lifecycle guards (finalized immutability, workforce-source period
-- protection, run transition rules) are disabled only for the duration of
-- this explicit destructive operation and re-enabled before returning.
-- The application recreates one canonical default schedule and calendar
-- afterwards using its own domain code; no schedule logic lives here.

-- The audit-event allowlist must only ever GROW: this list is the complete
-- superset of every event accepted by migrations 105000, 122000, and 123000,
-- plus PAYROLL_WORKSPACE_RESET. Narrowing it would violate existing rows
-- (SQLSTATE 23514) on any database that already recorded AI credential events.
alter table public.company_audit_events
  drop constraint if exists company_audit_events_event_type_check;
alter table public.company_audit_events
  add constraint company_audit_events_event_type_check check (event_type in (
    'COMPANY_CREATED', 'COMPANY_UPDATED', 'COMPANY_SUSPENDED', 'COMPANY_ARCHIVED', 'COMPANY_REACTIVATED',
    'USER_INVITED', 'INVITE_REVOKED', 'INVITE_ACCEPTED',
    'MEMBER_ROLE_CHANGED', 'MEMBER_SUSPENDED', 'MEMBER_REACTIVATED', 'MEMBER_REVOKED',
    'PAYROLL_REPAIR_APPLIED', 'PAYROLL_CALENDAR_REBUILT', 'PAYROLL_UNAPPROVED_RESET',
    'COMPANY_AI_CREDENTIAL_CONFIGURED', 'COMPANY_AI_CREDENTIAL_ROTATED',
    'COMPANY_AI_CREDENTIAL_TESTED', 'COMPANY_AI_CREDENTIAL_ENABLED',
    'COMPANY_AI_CREDENTIAL_DISABLED', 'COMPANY_AI_CREDENTIAL_REMOVED',
    'PAYROLL_WORKSPACE_RESET'
  ));

create or replace function private.assert_payroll_workspace_reset_authorized(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required for the payroll workspace reset'
      using errcode = '42501';
  end if;
  if p_company_id is null then
    raise exception 'An active company is required for the payroll workspace reset'
      using errcode = '22023';
  end if;
  if not exists (select 1 from public.companies c where c.id = p_company_id) then
    raise exception 'Company does not exist'
      using errcode = '22023';
  end if;
  if not private.has_company_permission(p_company_id, 'payroll.settings')
     or not private.has_company_permission(p_company_id, 'payroll.manage') then
    raise exception 'You do not have permission to run payroll recovery in this company'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function private.payroll_workspace_reset_counts(p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'payroll_schedules', (select count(*) from public.payroll_schedules t where t.company_id = p_company_id),
    'payroll_schedule_versions', (select count(*) from public.payroll_schedule_versions t where t.company_id = p_company_id),
    'payroll_periods', (select count(*) from public.payroll_periods t where t.company_id = p_company_id),
    'payroll_runs', (select count(*) from public.payroll_runs t where t.company_id = p_company_id),
    'payroll_entries', (select count(*) from public.payroll_entries t where t.company_id = p_company_id),
    'payroll_project_allocations', (select count(*) from public.payroll_project_allocations t where t.company_id = p_company_id),
    'payroll_adjustments', (select count(*) from public.payroll_adjustments t where t.company_id = p_company_id),
    'payroll_import_batches', (select count(*) from public.payroll_import_batches t where t.company_id = p_company_id),
    'payroll_import_rows', (select count(*) from public.payroll_import_rows t where t.company_id = p_company_id),
    'payroll_import_templates', (select count(*) from public.payroll_import_templates t where t.company_id = p_company_id),
    'labor_cost_centers', (select count(*) from public.labor_cost_centers t where t.company_id = p_company_id),
    'work_entries', (select count(*) from public.work_entries t where t.company_id = p_company_id),
    'attendance_records', (select count(*) from public.attendance_records t where t.company_id = p_company_id),
    'overtime_requests', (select count(*) from public.overtime_requests t where t.company_id = p_company_id),
    'leave_requests', (select count(*) from public.leave_requests t where t.company_id = p_company_id),
    'payroll_holidays', (select count(*) from public.payroll_holidays t where t.company_id = p_company_id),
    'project_worker_assignments', (select count(*) from public.project_worker_assignments t where t.company_id = p_company_id),
    'worker_compensation_profiles', (select count(*) from public.worker_compensation_profiles t where t.company_id = p_company_id),
    'recurring_payroll_components', (select count(*) from public.recurring_payroll_components t where t.company_id = p_company_id),
    'workers', (select count(*) from public.workers t where t.company_id = p_company_id),
    'departments', (select count(*) from public.departments t where t.company_id = p_company_id)
  );
$$;

create or replace function private.payroll_workspace_reset_total_rows(p_counts jsonb)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select coalesce(sum((e.value)::numeric), 0)::bigint from jsonb_each_text(p_counts) e;
$$;

create or replace function public.preview_payroll_workspace_reset(
  p_company_id uuid,
  p_reference_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_counts jsonb;
begin
  perform private.assert_payroll_workspace_reset_authorized(p_company_id);
  v_counts := private.payroll_workspace_reset_counts(p_company_id);
  return jsonb_build_object(
    'referenceDate', coalesce(p_reference_date, current_date),
    'counts', v_counts,
    'totalRows', private.payroll_workspace_reset_total_rows(v_counts),
    'eligible', true
  );
end;
$$;

create or replace function public.apply_payroll_workspace_reset(
  p_company_id uuid,
  p_reference_date date default current_date,
  p_confirmation text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_counts jsonb;
begin
  perform private.assert_payroll_workspace_reset_authorized(p_company_id);
  if p_confirmation is distinct from 'RESET PAYROLL WORKSPACE' then
    raise exception 'Type RESET PAYROLL WORKSPACE to confirm this action'
      using errcode = '42501';
  end if;

  -- Serialize concurrent resets/maintenance for this company only.
  perform 1 from public.companies c where c.id = p_company_id for update;

  v_counts := private.payroll_workspace_reset_counts(p_company_id);

  -- Flush any trigger events queued by statements that ran earlier in this
  -- transaction before taking AccessExclusiveLocks; Postgres refuses
  -- ALTER TABLE on a table with pending trigger events.
  execute 'SET CONSTRAINTS ALL IMMEDIATE';

  -- Explicit destructive recovery may remove finalized rows, so the domain
  -- lifecycle guards are suspended for exactly this transaction scope.
  alter table public.payroll_periods disable trigger scheduled_payroll_period_mutation_guard;
  alter table public.payroll_periods disable trigger payroll_periods_workforce_source_guard;
  alter table public.payroll_runs disable trigger payroll_runs_transition_guard;
  alter table public.payroll_entries disable trigger payroll_entries_mutation_guard;
  alter table public.payroll_project_allocations disable trigger payroll_project_allocations_mutation_guard;
  alter table public.payroll_adjustments disable trigger payroll_adjustments_mutation_guard;
  alter table public.work_entries disable trigger work_entries_finalized_source_guard;
  alter table public.attendance_records disable trigger attendance_records_finalized_source_guard;
  alter table public.leave_requests disable trigger leave_requests_finalized_source_guard;
  alter table public.overtime_requests disable trigger overtime_requests_finalized_source_guard;

  -- Children before parents, following the actual foreign-key graph.
  delete from public.payroll_project_allocations a where a.company_id = p_company_id;
  delete from public.payroll_adjustments a where a.company_id = p_company_id;
  delete from public.payroll_import_rows pir where pir.company_id = p_company_id;
  delete from public.payroll_entries e where e.company_id = p_company_id;
  delete from public.payroll_runs r where r.company_id = p_company_id;
  -- Batches must go before their detected_template_id parent; the template FK
  -- is ON DELETE SET NULL, but removing batches first keeps template deletion
  -- a pure company-scoped delete with no cross-table side effects.
  delete from public.payroll_import_batches b where b.company_id = p_company_id;
  -- Templates are part of the payroll/import domain: preview counts them, so
  -- apply must delete them too (full factory reset, matching the preview).
  delete from public.payroll_import_templates t where t.company_id = p_company_id;
  delete from public.work_entries w where w.company_id = p_company_id;
  delete from public.attendance_records a where a.company_id = p_company_id;
  delete from public.overtime_requests o where o.company_id = p_company_id;
  delete from public.leave_requests l where l.company_id = p_company_id;
  delete from public.payroll_holidays h where h.company_id = p_company_id;
  delete from public.project_worker_assignments a where a.company_id = p_company_id;
  delete from public.worker_compensation_profiles p where p.company_id = p_company_id;
  delete from public.recurring_payroll_components c where c.company_id = p_company_id;
  delete from public.workers w where w.company_id = p_company_id;
  delete from public.departments d where d.company_id = p_company_id;
  delete from public.labor_cost_centers c where c.company_id = p_company_id;
  delete from public.payroll_periods p where p.company_id = p_company_id;
  -- Schedule versions cascade with their schedule.
  delete from public.payroll_schedules s where s.company_id = p_company_id;

  -- Flush deferred constraint-trigger events (e.g. allocation total checks
  -- queued by the deletes above) before touching DDL again; Postgres refuses
  -- ALTER TABLE on a table with pending trigger events.
  execute 'SET CONSTRAINTS ALL IMMEDIATE';

  -- Restore every domain guard before leaving; rollback also restores them.
  alter table public.overtime_requests enable trigger overtime_requests_finalized_source_guard;
  alter table public.leave_requests enable trigger leave_requests_finalized_source_guard;
  alter table public.attendance_records enable trigger attendance_records_finalized_source_guard;
  alter table public.work_entries enable trigger work_entries_finalized_source_guard;
  alter table public.payroll_adjustments enable trigger payroll_adjustments_mutation_guard;
  alter table public.payroll_project_allocations enable trigger payroll_project_allocations_mutation_guard;
  alter table public.payroll_entries enable trigger payroll_entries_mutation_guard;
  alter table public.payroll_runs enable trigger payroll_runs_transition_guard;
  alter table public.payroll_periods enable trigger payroll_periods_workforce_source_guard;
  alter table public.payroll_periods enable trigger scheduled_payroll_period_mutation_guard;

  perform private.write_company_audit(p_company_id, 'PAYROLL_WORKSPACE_RESET', 'company', p_company_id, jsonb_build_object(
    'action', 'FACTORY_RESET_PAYROLL',
    'reference_date', coalesce(p_reference_date, current_date),
    'counts', v_counts,
    'total_rows', private.payroll_workspace_reset_total_rows(v_counts)
  ));

  return jsonb_build_object(
    'referenceDate', coalesce(p_reference_date, current_date),
    'counts', v_counts,
    'totalRows', private.payroll_workspace_reset_total_rows(v_counts),
    'eligible', true,
    'applied', true
  );
end;
$$;

revoke execute on function public.preview_payroll_workspace_reset(uuid, date) from public, anon;
revoke execute on function public.apply_payroll_workspace_reset(uuid, date, text) from public, anon;
grant execute on function public.preview_payroll_workspace_reset(uuid, date) to authenticated;
grant execute on function public.apply_payroll_workspace_reset(uuid, date, text) to authenticated;
revoke execute on function private.assert_payroll_workspace_reset_authorized(uuid) from public, anon, authenticated;
revoke execute on function private.payroll_workspace_reset_counts(uuid) from public, anon, authenticated;
revoke execute on function private.payroll_workspace_reset_total_rows(jsonb) from public, anon, authenticated;
