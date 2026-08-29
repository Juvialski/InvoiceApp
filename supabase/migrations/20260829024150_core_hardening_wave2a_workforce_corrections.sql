-- Engoryx Core Hardening Wave 2A: workforce, project assignment, and payroll
-- source correction lifecycles.
--
-- This migration is forward-only. It adds effective-dated worker context and
-- correction metadata, closes direct destructive table paths, and exposes
-- small SECURITY DEFINER lifecycle RPCs. Every RPC derives the configured
-- deployment company and rechecks the active member permission before it
-- locks/reclassifies/deletes a record.

alter table public.workers
  add column if not exists default_labor_context text not null default 'UNALLOCATED_REVIEW',
  add column if not exists default_project_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.workers'::regclass
      and conname = 'workers_default_project_id_fkey'
  ) then
    alter table public.workers
      add constraint workers_default_project_id_fkey
      foreign key (default_project_id) references public.projects(id) on delete set null;
  end if;
end $$;

alter table public.workers
  drop constraint if exists workers_default_labor_context_check;
alter table public.workers
  add constraint workers_default_labor_context_check
  check (
    default_labor_context in ('PROJECT', 'ADMIN_OFFICE', 'GENERAL_OVERHEAD', 'UNALLOCATED_REVIEW')
    and (default_labor_context = 'PROJECT' or default_project_id is null)
  );

alter table public.work_entries
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text;

alter table public.attendance_records
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text;

alter table public.leave_requests
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text;

alter table public.overtime_requests
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text;

create index if not exists payroll_import_rows_company_worker_idx
  on public.payroll_import_rows(company_id, worker_id)
  where worker_id is not null;
create index if not exists payroll_entries_company_worker_idx
  on public.payroll_entries(company_id, worker_id, payroll_run_id);
create index if not exists payroll_project_assignments_company_worker_dates_idx
  on public.project_worker_assignments(company_id, worker_id, project_id, start_date, end_date);

-- Keep the audit allowlist a strict superset of the 61 event types already
-- supported through Wave 1.
alter table public.company_audit_events
  drop constraint if exists company_audit_events_event_type_check;
alter table public.company_audit_events
  add constraint company_audit_events_event_type_check check (event_type in (
    'COMPANY_CREATED', 'COMPANY_UPDATED', 'COMPANY_SUSPENDED', 'COMPANY_ARCHIVED', 'COMPANY_REACTIVATED',
    'USER_INVITED', 'INVITE_REVOKED', 'INVITE_ACCEPTED', 'INVITATION_SENT', 'INVITATION_DELIVERY_FAILED',
    'MEMBER_ROLE_CHANGED', 'MEMBER_SUSPENDED', 'MEMBER_REACTIVATED', 'MEMBER_REVOKED', 'MEMBER_PERMISSIONS_UPDATED',
    'PAYROLL_REPAIR_APPLIED', 'PAYROLL_CALENDAR_REBUILT', 'PAYROLL_UNAPPROVED_RESET',
    'COMPANY_AI_CREDENTIAL_CONFIGURED', 'COMPANY_AI_CREDENTIAL_ROTATED',
    'COMPANY_AI_CREDENTIAL_TESTED', 'COMPANY_AI_CREDENTIAL_ENABLED',
    'COMPANY_AI_CREDENTIAL_DISABLED', 'COMPANY_AI_CREDENTIAL_REMOVED',
    'PAYROLL_WORKSPACE_RESET',
    'CASH_ACCOUNT_CREATED', 'CASH_ACCOUNT_UPDATED', 'CASH_ACCOUNT_DEACTIVATED',
    'CASH_BALANCE_SNAPSHOT_RECORDED', 'CASH_STATEMENT_IMPORTED', 'CASH_STATEMENT_REJECTED',
    'CASH_TRANSACTION_CREATED', 'CASH_TRANSACTION_UPDATED',
    'CASH_RECONCILIATION_CONFIRMED', 'CASH_RECONCILIATION_REMOVED', 'CASH_TRANSFER_MATCHED',
    'CASH_SETTLEMENT_CONFIRMED', 'CASH_SETTLEMENT_REVERSED',
    'ENGINEERING_DOCUMENT_CREATED', 'ENGINEERING_DOCUMENT_UPDATED', 'ENGINEERING_DOCUMENT_ARCHIVED',
    'ENGINEERING_REVISION_UPLOADED', 'ENGINEERING_ANNOTATION_SAVED', 'ENGINEERING_ANNOTATION_DELETED',
    'ENGINEERING_RFI_CREATED', 'ENGINEERING_RFI_OPENED', 'ENGINEERING_RFI_RESPONDED', 'ENGINEERING_RFI_CLOSED', 'ENGINEERING_RFI_VOIDED',
    'ENGINEERING_SUBMITTAL_CREATED', 'ENGINEERING_SUBMITTAL_SUBMITTED', 'ENGINEERING_SUBMITTAL_REVIEW_STARTED', 'ENGINEERING_SUBMITTAL_REVIEWED',
    'ENGINEERING_SUBMITTAL_RESUBMITTED', 'ENGINEERING_SUBMITTAL_CLOSED', 'ENGINEERING_SUBMITTAL_VOIDED',
    'ENGINEERING_DAILY_SITE_LOG_CREATED', 'ENGINEERING_DAILY_SITE_LOG_UPDATED', 'ENGINEERING_DAILY_SITE_LOG_SUBMITTED',
    'ENGINEERING_DAILY_SITE_LOG_FINALIZED', 'ENGINEERING_DAILY_SITE_LOG_VOIDED',
    'WORKER_OFFBOARDED', 'WORKER_REACTIVATED', 'WORKER_DELETED_UNUSED',
    'PROJECT_ASSIGNMENT_ENDED', 'PROJECT_ASSIGNMENT_DELETED_UNUSED',
    'COMPENSATION_PROFILE_ENDED', 'COMPENSATION_PROFILE_SUPERSEDED', 'COMPENSATION_PROFILE_DELETED_UNUSED',
    'PAYROLL_COMPONENT_DEACTIVATED', 'PAYROLL_COMPONENT_DELETED_UNUSED',
    'WORK_ENTRY_VOIDED', 'WORK_ENTRY_DELETED_UNUSED',
    'ATTENDANCE_VOIDED', 'ATTENDANCE_DELETED_UNUSED',
    'LEAVE_CANCELLED', 'LEAVE_DELETED_UNUSED',
    'OVERTIME_CANCELLED', 'OVERTIME_DELETED_UNUSED'
  ));

-- The catalog remains useful metadata, but the covered delete operations are
-- now available only through the guarded lifecycle RPCs below.
update private.company_tenant_policy_catalog
set allow_delete = false
where table_name in (
  'workers',
  'project_worker_assignments',
  'worker_compensation_profiles',
  'recurring_payroll_components',
  'work_entries',
  'attendance_records',
  'leave_requests',
  'overtime_requests'
);

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'workers',
    'project_worker_assignments',
    'worker_compensation_profiles',
    'recurring_payroll_components',
    'work_entries',
    'attendance_records',
    'leave_requests',
    'overtime_requests'
  ] loop
    execute format('drop policy if exists %I on public.%I', v_table || '_company_delete', v_table);
    execute format('drop policy if exists %I on public.%I', v_table || '_delete_own', v_table);
    execute format('revoke delete on table public.%I from anon, authenticated', v_table);
  end loop;
end $$;

create or replace function private.require_workforce_permission(
  p_company_id uuid,
  p_permission_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or p_company_id is null
     or p_company_id is distinct from (select private.deployment_company_id())
     or not (select private.has_company_permission(p_company_id, p_permission_key)) then
    raise exception 'The current user is not authorized for this workforce operation'
      using errcode = '42501';
  end if;
end;
$$;

revoke execute on function private.require_workforce_permission(uuid, text) from public, anon, authenticated;

create or replace function private.worker_lifecycle_preflight(
  p_worker_id uuid,
  p_company_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_worker public.workers;
  v_assignments bigint;
  v_attendance bigint;
  v_work_entries bigint;
  v_leave bigint;
  v_overtime bigint;
  v_payroll_entries bigint;
  v_profiles bigint;
  v_components bigint;
  v_import_rows bigint;
  v_department_managers bigint;
  v_total bigint;
  v_can_delete boolean;
begin
  select w.* into v_worker
  from public.workers w
  where w.id = p_worker_id and w.company_id = p_company_id;
  if not found then
    raise exception 'Worker does not exist in the deployment company' using errcode = '42501';
  end if;

  select count(*) into v_assignments from public.project_worker_assignments a where a.company_id = p_company_id and a.worker_id = p_worker_id;
  select count(*) into v_attendance from public.attendance_records a where a.company_id = p_company_id and a.worker_id = p_worker_id;
  select count(*) into v_work_entries from public.work_entries e where e.company_id = p_company_id and e.worker_id = p_worker_id;
  select count(*) into v_leave from public.leave_requests l where l.company_id = p_company_id and l.worker_id = p_worker_id;
  select count(*) into v_overtime from public.overtime_requests o where o.company_id = p_company_id and o.worker_id = p_worker_id;
  select count(*) into v_payroll_entries from public.payroll_entries e where e.company_id = p_company_id and e.worker_id = p_worker_id;
  select count(*) into v_profiles from public.worker_compensation_profiles p where p.company_id = p_company_id and p.worker_id = p_worker_id;
  select count(*) into v_components from public.recurring_payroll_components c where c.company_id = p_company_id and c.worker_id = p_worker_id;
  select count(*) into v_import_rows from public.payroll_import_rows r where r.company_id = p_company_id and r.worker_id = p_worker_id;
  select count(*) into v_department_managers from public.departments d where d.company_id = p_company_id and d.manager_worker_id = p_worker_id;

  v_total := v_assignments + v_attendance + v_work_entries + v_leave + v_overtime
    + v_payroll_entries + v_profiles + v_components + v_import_rows + v_department_managers;
  v_can_delete := v_total = 0;

  return jsonb_build_object(
    'workerId', p_worker_id,
    'displayName', v_worker.display_name,
    'employmentStatus', v_worker.employment_status,
    'active', v_worker.active,
    'canDelete', v_can_delete,
    'recommendedAction', case when v_can_delete then 'DELETE_UNUSED' else 'OFFBOARD' end,
    'blockedReason', case when v_can_delete then null else 'This employee has historical workforce or payroll records and cannot be permanently deleted. Offboard the employee instead.' end,
    'dependencies', jsonb_build_object(
      'projectAssignments', v_assignments,
      'attendanceRecords', v_attendance,
      'workEntries', v_work_entries,
      'leaveRequests', v_leave,
      'overtimeRequests', v_overtime,
      'payrollEntries', v_payroll_entries,
      'compensationProfiles', v_profiles,
      'recurringComponents', v_components,
      'payrollImportRows', v_import_rows,
      'departmentManagerReferences', v_department_managers
    )
  );
end;
$$;

create or replace function private.assignment_has_usage(
  p_assignment_id uuid,
  p_company_id uuid,
  p_worker_id uuid,
  p_project_id uuid,
  p_start_date date,
  p_end_date date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.work_entries e
    where e.company_id = p_company_id
      and e.worker_id = p_worker_id
      and e.project_id = p_project_id
      and e.work_date >= p_start_date
      and (p_end_date is null or e.work_date <= p_end_date)
  )
  or exists (
    select 1 from public.overtime_requests o
    where o.company_id = p_company_id
      and o.worker_id = p_worker_id
      and o.project_id = p_project_id
      and o.overtime_date >= p_start_date
      and (p_end_date is null or o.overtime_date <= p_end_date)
  )
  or exists (
    select 1
    from public.payroll_project_allocations a
    join public.payroll_entries e on e.id = a.payroll_entry_id and e.company_id = a.company_id
    where a.company_id = p_company_id
      and e.worker_id = p_worker_id
      and a.project_id = p_project_id
  )
  or exists (
    select 1 from public.payroll_entries e
    where e.company_id = p_company_id
      and e.worker_id = p_worker_id
      and coalesce(e.calculation_snapshot, '{}'::jsonb)::text like '%' || p_assignment_id::text || '%'
  );
$$;

create or replace function private.worker_compensation_profile_has_usage(
  p_profile_id uuid,
  p_company_id uuid,
  p_worker_id uuid,
  p_effective_from date,
  p_effective_to date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.payroll_entries e
    left join public.payroll_runs r on r.id = e.payroll_run_id and r.company_id = e.company_id
    left join public.payroll_periods p on p.id = r.period_id and p.company_id = r.company_id
    where e.company_id = p_company_id
      and e.worker_id = p_worker_id
      and (
        coalesce(e.calculation_snapshot, '{}'::jsonb)::text like '%' || p_profile_id::text || '%'
        or (
          r.status in ('APPROVED', 'PAID', 'VOID')
          and p.period_start <= coalesce(p_effective_to, date '9999-12-31')
          and p.period_end >= p_effective_from
        )
      )
  );
$$;

create or replace function private.recurring_component_has_usage(
  p_component_id uuid,
  p_company_id uuid,
  p_worker_id uuid,
  p_effective_from date,
  p_effective_to date
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.payroll_entries e
    left join public.payroll_runs r on r.id = e.payroll_run_id and r.company_id = e.company_id
    left join public.payroll_periods p on p.id = r.period_id and p.company_id = r.company_id
    where e.company_id = p_company_id
      and e.worker_id = p_worker_id
      and (
        coalesce(e.calculation_snapshot, '{}'::jsonb)::text like '%' || p_component_id::text || '%'
        or (
          r.status in ('APPROVED', 'PAID', 'VOID')
          and p.period_start <= coalesce(p_effective_to, date '9999-12-31')
          and p.period_end >= p_effective_from
        )
      )
  );
$$;

revoke execute on function private.assignment_has_usage(uuid, uuid, uuid, uuid, date, date) from public, anon, authenticated;
revoke execute on function private.worker_compensation_profile_has_usage(uuid, uuid, uuid, date, date) from public, anon, authenticated;
revoke execute on function private.recurring_component_has_usage(uuid, uuid, uuid, date, date) from public, anon, authenticated;

-- The original integrity trigger predated non-project labor contexts and
-- required every work entry to join a project. Keep its period/date checks,
-- but make ADMIN_OFFICE, GENERAL_OVERHEAD, and UNALLOCATED_REVIEW valid
-- non-project sources without weakening company/worker ownership.
create or replace function public.validate_payroll_work_entry_integrity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_period_start date;
  v_period_end date;
begin
  if new.period_id is null then
    if tg_op = 'UPDATE' and old.period_id is null then return new; end if;
    raise exception 'Work entry must link to a payroll period' using errcode = '22023';
  end if;
  select p.period_start, p.period_end into v_period_start, v_period_end
  from public.payroll_periods p
  where p.id = new.period_id and p.company_id = new.company_id;
  if not found then raise exception 'Work entry payroll period is outside the company' using errcode = '42501'; end if;
  if new.work_date < v_period_start or new.work_date > v_period_end then raise exception 'Work entry date must fall within its payroll period' using errcode = '22023'; end if;
  if not exists (select 1 from public.workers w where w.id = new.worker_id and w.company_id = new.company_id) then raise exception 'Work entry worker is outside the company' using errcode = '42501'; end if;
  if new.labor_context = 'PROJECT' then
    if new.project_id is null or not exists (select 1 from public.projects p where p.id = new.project_id and p.company_id = new.company_id) then raise exception 'Project work entry requires a project in the same company' using errcode = '42501'; end if;
  elsif new.project_id is not null then
    raise exception 'Non-project labor contexts cannot reference a project' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists work_entries_payroll_integrity on public.work_entries;
create trigger work_entries_payroll_integrity
before insert or update on public.work_entries
for each row execute function public.validate_payroll_work_entry_integrity();

create or replace function private.worker_lifecycle_preflight_authorized(p_worker_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := (select private.deployment_company_id());
begin
  perform private.require_workforce_permission(v_company_id, 'workers.read');
  return private.worker_lifecycle_preflight(p_worker_id, v_company_id);
end;
$$;

create or replace function public.preview_worker_lifecycle(p_worker_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.worker_lifecycle_preflight_authorized(p_worker_id);
$$;

create or replace function public.apply_worker_lifecycle(
  p_worker_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := (select private.deployment_company_id());
  v_worker public.workers;
  v_preflight jsonb;
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
  v_changed boolean := false;
begin
  perform private.require_workforce_permission(v_company_id, 'workers.manage');
  if v_action not in ('OFFBOARD', 'REACTIVATE', 'DELETE_UNUSED') then
    raise exception 'Worker lifecycle action is invalid' using errcode = '22023';
  end if;
  if v_action in ('OFFBOARD', 'REACTIVATE') and v_reason is null then
    raise exception 'A reason is required for this worker lifecycle action' using errcode = '22023';
  end if;

  select w.* into v_worker
  from public.workers w
  where w.id = p_worker_id and w.company_id = v_company_id
  for update;
  if not found then
    raise exception 'Worker does not exist in the deployment company' using errcode = '42501';
  end if;
  v_preflight := private.worker_lifecycle_preflight(p_worker_id, v_company_id);

  if v_action = 'DELETE_UNUSED' then
    if coalesce((v_preflight ->> 'canDelete')::boolean, false) is not true then
      raise exception 'This employee has historical workforce or payroll records and cannot be permanently deleted. Offboard the employee instead.' using errcode = '42501';
    end if;
    perform private.write_company_audit(
      v_company_id,
      'WORKER_DELETED_UNUSED',
      'worker',
      p_worker_id,
      jsonb_build_object('action', v_action, 'reason', coalesce(v_reason, 'Confirmed unused employee deletion'), 'preflight', v_preflight)
    );
    delete from public.workers where id = p_worker_id and company_id = v_company_id;
    return jsonb_build_object('entityType', 'WORKER', 'entityId', p_worker_id, 'action', v_action, 'deleted', true, 'preflight', v_preflight);
  end if;

  if v_action = 'OFFBOARD' then
    if v_worker.active or v_worker.employment_status is distinct from 'OFFBOARDED' then
      update public.workers
      set active = false,
          employment_status = 'OFFBOARDED',
          end_date = coalesce(end_date, current_date),
          updated_at = now()
      where id = p_worker_id and company_id = v_company_id
      returning * into v_worker;
      v_changed := true;
    end if;
    if v_changed then
      perform private.write_company_audit(v_company_id, 'WORKER_OFFBOARDED', 'worker', p_worker_id, jsonb_build_object('action', v_action, 'reason', v_reason, 'preflight', v_preflight));
    end if;
  else
    if not v_worker.active or v_worker.employment_status is distinct from 'ACTIVE' or v_worker.end_date is not null or v_worker.archived_at is not null then
      update public.workers
      set active = true,
          employment_status = 'ACTIVE',
          end_date = null,
          archived_at = null,
          updated_at = now()
      where id = p_worker_id and company_id = v_company_id
      returning * into v_worker;
      v_changed := true;
    end if;
    if v_changed then
      perform private.write_company_audit(v_company_id, 'WORKER_REACTIVATED', 'worker', p_worker_id, jsonb_build_object('action', v_action, 'reason', v_reason, 'preflight', v_preflight));
    end if;
  end if;

  return jsonb_build_object('entityType', 'WORKER', 'entityId', p_worker_id, 'action', v_action, 'deleted', false, 'preflight', v_preflight, 'record', to_jsonb(v_worker));
end;
$$;

revoke execute on function public.preview_worker_lifecycle(uuid) from public, anon;
revoke execute on function public.apply_worker_lifecycle(uuid, text, text) from public, anon;
grant execute on function public.preview_worker_lifecycle(uuid) to authenticated;
grant execute on function public.apply_worker_lifecycle(uuid, text, text) to authenticated;

create or replace function public.guard_worker_lifecycle_edit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.default_labor_context <> 'PROJECT' and new.default_project_id is not null then
    raise exception 'Only PROJECT workers may have a default project' using errcode = '22023';
  end if;
  if new.default_project_id is not null and not exists (
    select 1 from public.projects p
    where p.id = new.default_project_id
      and p.company_id = new.company_id
      and p.status <> 'ARCHIVED'
      and p.archived_at is null
  ) then
    raise exception 'Worker default project must be an active project in the same company' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and (new.active is distinct from old.active
       or new.employment_status is distinct from old.employment_status
       or new.end_date is distinct from old.end_date
       or new.archived_at is distinct from old.archived_at)
     and current_user <> 'postgres' then
    raise exception 'Use the worker offboard or reactivate lifecycle action for employment status changes' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists workers_lifecycle_edit_guard on public.workers;
create trigger workers_lifecycle_edit_guard
before insert or update on public.workers
for each row execute function public.guard_worker_lifecycle_edit();

create or replace function private.assignment_lifecycle_preflight(
  p_assignment_id uuid,
  p_company_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment public.project_worker_assignments;
  v_work_entries bigint;
  v_overtime bigint;
  v_allocations bigint;
  v_snapshots bigint;
begin
  select a.* into v_assignment
  from public.project_worker_assignments a
  where a.id = p_assignment_id and a.company_id = p_company_id;
  if not found then
    raise exception 'Project assignment does not exist in the deployment company' using errcode = '42501';
  end if;
  select count(*) into v_work_entries from public.work_entries e where e.company_id = p_company_id and e.worker_id = v_assignment.worker_id and e.project_id = v_assignment.project_id and e.work_date >= v_assignment.start_date and (v_assignment.end_date is null or e.work_date <= v_assignment.end_date);
  select count(*) into v_overtime from public.overtime_requests o where o.company_id = p_company_id and o.worker_id = v_assignment.worker_id and o.project_id = v_assignment.project_id and o.overtime_date >= v_assignment.start_date and (v_assignment.end_date is null or o.overtime_date <= v_assignment.end_date);
  select count(*) into v_allocations
  from public.payroll_project_allocations a
  join public.payroll_entries e on e.id = a.payroll_entry_id and e.company_id = a.company_id
  where a.company_id = p_company_id and e.worker_id = v_assignment.worker_id and a.project_id = v_assignment.project_id;
  select count(*) into v_snapshots from public.payroll_entries e where e.company_id = p_company_id and e.worker_id = v_assignment.worker_id and coalesce(e.calculation_snapshot, '{}'::jsonb)::text like '%' || p_assignment_id::text || '%';
  return jsonb_build_object(
    'assignmentId', p_assignment_id,
    'workerId', v_assignment.worker_id,
    'projectId', v_assignment.project_id,
    'hasDownstreamUsage', (v_work_entries + v_overtime + v_allocations + v_snapshots) > 0,
    'canDelete', (v_work_entries + v_overtime + v_allocations + v_snapshots) = 0,
    'dependencies', jsonb_build_object('workEntries', v_work_entries, 'overtimeRequests', v_overtime, 'payrollAllocations', v_allocations, 'snapshotReferences', v_snapshots)
  );
end;
$$;

create or replace function public.guard_project_worker_assignment_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_usage boolean;
begin
  if tg_op <> 'DELETE' then
    if not exists (select 1 from public.workers w where w.id = new.worker_id and w.company_id = new.company_id) then
      raise exception 'Assignment worker must belong to the same company' using errcode = '42501';
    end if;
    if not exists (select 1 from public.projects p where p.id = new.project_id and p.company_id = new.company_id) then
      raise exception 'Assignment project must belong to the same company' using errcode = '42501';
    end if;
    if tg_op = 'INSERT' and (select p.status = 'ARCHIVED' or p.archived_at is not null from public.projects p where p.id = new.project_id) then
      raise exception 'Archived projects cannot receive new worker assignments' using errcode = '42501';
    end if;
    if new.active and not exists (select 1 from public.workers w where w.id = new.worker_id and w.company_id = new.company_id and w.active and w.employment_status not in ('OFFBOARDED', 'INACTIVE')) then
      raise exception 'Offboarded or inactive workers cannot receive new active assignments' using errcode = '42501';
    end if;
    if not new.active and new.end_date is null then new.end_date := current_date; end if;
  end if;
  if tg_op = 'UPDATE' then
    v_usage := private.assignment_has_usage(old.id, old.company_id, old.worker_id, old.project_id, old.start_date, old.end_date);
    if v_usage and (
      new.worker_id is distinct from old.worker_id
      or new.project_id is distinct from old.project_id
      or new.start_date is distinct from old.start_date
      or new.pay_type is distinct from old.pay_type
      or new.rate is distinct from old.rate
    ) then
      raise exception 'Used project assignments cannot be rewritten; end the assignment instead' using errcode = '42501';
    end if;
  elsif tg_op = 'DELETE' then
    if private.assignment_has_usage(old.id, old.company_id, old.worker_id, old.project_id, old.start_date, old.end_date) then
      raise exception 'This project assignment has downstream workforce or payroll history and cannot be deleted; end it instead' using errcode = '42501';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists project_worker_assignments_lifecycle_guard on public.project_worker_assignments;
create trigger project_worker_assignments_lifecycle_guard
before insert or update or delete on public.project_worker_assignments
for each row execute function public.guard_project_worker_assignment_lifecycle();

create or replace function public.apply_project_worker_assignment_lifecycle(
  p_assignment_id uuid,
  p_action text,
  p_end_date date default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := (select private.deployment_company_id());
  v_assignment public.project_worker_assignments;
  v_preflight jsonb;
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
  v_end_date date;
  v_last_used_date date;
begin
  perform private.require_workforce_permission(v_company_id, 'workers.manage');
  if v_action not in ('END', 'DELETE_UNUSED') then raise exception 'Project assignment lifecycle action is invalid' using errcode = '22023'; end if;
  if v_action = 'END' and v_reason is null then raise exception 'A reason is required to end a project assignment' using errcode = '22023'; end if;
  select a.* into v_assignment from public.project_worker_assignments a where a.id = p_assignment_id and a.company_id = v_company_id for update;
  if not found then raise exception 'Project assignment does not exist in the deployment company' using errcode = '42501'; end if;
  v_preflight := private.assignment_lifecycle_preflight(p_assignment_id, v_company_id);
  if v_action = 'DELETE_UNUSED' then
    if coalesce((v_preflight ->> 'canDelete')::boolean, false) is not true then raise exception 'This project assignment has downstream workforce or payroll history and cannot be deleted; end it instead' using errcode = '42501'; end if;
    perform private.write_company_audit(v_company_id, 'PROJECT_ASSIGNMENT_DELETED_UNUSED', 'project_worker_assignment', p_assignment_id, jsonb_build_object('action', v_action, 'reason', coalesce(v_reason, 'Confirmed unused assignment deletion'), 'preflight', v_preflight));
    delete from public.project_worker_assignments where id = p_assignment_id and company_id = v_company_id;
    return jsonb_build_object('entityType', 'PROJECT_ASSIGNMENT', 'entityId', p_assignment_id, 'action', v_action, 'deleted', true, 'preflight', v_preflight);
  end if;
  v_end_date := coalesce(p_end_date, v_assignment.end_date, current_date);
  if v_end_date < v_assignment.start_date then raise exception 'Assignment end date cannot be before its start date' using errcode = '22023'; end if;
  select max(used_date) into v_last_used_date from (
    select max(e.work_date) as used_date from public.work_entries e where e.company_id = v_company_id and e.worker_id = v_assignment.worker_id and e.project_id = v_assignment.project_id and e.work_date >= v_assignment.start_date and (v_assignment.end_date is null or e.work_date <= v_assignment.end_date)
    union all
    select max(o.overtime_date) from public.overtime_requests o where o.company_id = v_company_id and o.worker_id = v_assignment.worker_id and o.project_id = v_assignment.project_id and o.overtime_date >= v_assignment.start_date and (v_assignment.end_date is null or o.overtime_date <= v_assignment.end_date)
  ) dates;
  if v_last_used_date is not null and v_end_date < v_last_used_date then raise exception 'Assignment cannot end before its recorded workforce usage date' using errcode = '42501'; end if;
  update public.project_worker_assignments set active = false, end_date = v_end_date, updated_at = now() where id = p_assignment_id and company_id = v_company_id returning * into v_assignment;
  perform private.write_company_audit(v_company_id, 'PROJECT_ASSIGNMENT_ENDED', 'project_worker_assignment', p_assignment_id, jsonb_build_object('action', v_action, 'reason', v_reason, 'effectiveDate', v_end_date, 'preflight', v_preflight));
  return jsonb_build_object('entityType', 'PROJECT_ASSIGNMENT', 'entityId', p_assignment_id, 'action', v_action, 'deleted', false, 'preflight', v_preflight, 'record', to_jsonb(v_assignment));
end;
$$;

revoke execute on function public.apply_project_worker_assignment_lifecycle(uuid, text, date, text) from public, anon;
grant execute on function public.apply_project_worker_assignment_lifecycle(uuid, text, date, text) to authenticated;

create or replace function public.guard_worker_compensation_profile_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.workers w where w.id = new.worker_id and w.company_id = new.company_id) then
    raise exception 'Compensation profile worker must belong to the same company' using errcode = '42501';
  end if;
  if new.default_labor_context <> 'PROJECT' and new.default_project_id is not null then
    raise exception 'Only PROJECT compensation profiles may have a default project' using errcode = '22023';
  end if;
  if new.default_project_id is not null and not exists (select 1 from public.projects p where p.id = new.default_project_id and p.company_id = new.company_id and p.status <> 'ARCHIVED' and p.archived_at is null) then
    raise exception 'Compensation profile default project must be active and in the same company' using errcode = '42501';
  end if;
  if new.active and exists (
    select 1 from public.worker_compensation_profiles p
    where p.company_id = new.company_id and p.worker_id = new.worker_id and p.id <> new.id and p.active
      and p.effective_from <= coalesce(new.effective_to, date '9999-12-31')
      and coalesce(p.effective_to, date '9999-12-31') >= new.effective_from
  ) then
    raise exception 'Overlapping active compensation profile periods are not allowed' using errcode = '23P01';
  end if;
  if tg_op = 'UPDATE'
     and private.worker_compensation_profile_has_usage(old.id, old.company_id, old.worker_id, old.effective_from, old.effective_to)
     and (
       new.worker_id is distinct from old.worker_id
       or new.effective_from is distinct from old.effective_from
       or new.frequency is distinct from old.frequency
       or new.rate is distinct from old.rate
       or new.default_labor_context is distinct from old.default_labor_context
       or new.default_project_id is distinct from old.default_project_id
     ) then
    raise exception 'Historically consumed compensation profiles cannot be rewritten; end or supersede them' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' and private.worker_compensation_profile_has_usage(old.id, old.company_id, old.worker_id, old.effective_from, old.effective_to) then
    raise exception 'Historically consumed compensation profiles cannot be deleted; end or supersede them' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists worker_compensation_profiles_lifecycle_guard on public.worker_compensation_profiles;
create trigger worker_compensation_profiles_lifecycle_guard
before insert or update or delete on public.worker_compensation_profiles
for each row execute function public.guard_worker_compensation_profile_lifecycle();

create or replace function public.save_worker_compensation_profile(
  p_profile_id uuid,
  p_worker_id uuid,
  p_effective_from date,
  p_effective_to date,
  p_frequency text,
  p_rate numeric,
  p_default_labor_context text,
  p_default_project_id uuid default null,
  p_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := (select private.deployment_company_id());
  v_profile public.worker_compensation_profiles;
  v_previous public.worker_compensation_profiles;
  v_id uuid := coalesce(p_profile_id, gen_random_uuid());
  v_superseded_count integer := 0;
begin
  perform private.require_workforce_permission(v_company_id, 'workers.manage');
  if p_effective_to is not null and p_effective_to < p_effective_from then raise exception 'Compensation profile end date cannot be before its start date' using errcode = '22023'; end if;
  if p_rate is null or p_rate < 0 or p_frequency not in ('MONTHLY', 'DAILY', 'HOURLY') then raise exception 'Compensation profile pay fields are invalid' using errcode = '22023'; end if;
  if p_default_labor_context not in ('PROJECT', 'ADMIN_OFFICE', 'GENERAL_OVERHEAD', 'UNALLOCATED_REVIEW') then raise exception 'Compensation profile labor context is invalid' using errcode = '22023'; end if;
  if p_default_labor_context <> 'PROJECT' and p_default_project_id is not null then raise exception 'Only PROJECT compensation profiles may have a default project' using errcode = '22023'; end if;
  if not exists (select 1 from public.workers w where w.id = p_worker_id and w.company_id = v_company_id) then raise exception 'Compensation profile worker does not exist in the deployment company' using errcode = '42501'; end if;
  if exists (select 1 from public.worker_compensation_profiles p where p.id = v_id and p.company_id <> v_company_id) then raise exception 'Compensation profile is outside the deployment company' using errcode = '42501'; end if;

  select p.* into v_profile from public.worker_compensation_profiles p where p.id = v_id and p.company_id = v_company_id for update;
  if found then
    update public.worker_compensation_profiles set worker_id = p_worker_id, effective_from = p_effective_from, effective_to = p_effective_to, frequency = p_frequency, rate = p_rate, default_labor_context = p_default_labor_context, default_project_id = p_default_project_id, active = coalesce(p_active, true), updated_at = now() where id = v_id and company_id = v_company_id returning * into v_profile;
  else
    -- A new effective profile supersedes overlapping older setup rows by
    -- ending them the day before the new profile begins. Finalized payroll is
    -- snapshot-based and is never recalculated by this operation.
    for v_previous in
      select p.* from public.worker_compensation_profiles p
      where p.company_id = v_company_id and p.worker_id = p_worker_id and p.active
        and p.effective_from <= coalesce(p_effective_to, date '9999-12-31')
        and coalesce(p.effective_to, date '9999-12-31') >= p_effective_from
      order by p.effective_from, p.id
      for update
    loop
      if v_previous.effective_from >= p_effective_from then raise exception 'Overlapping compensation profiles must be corrected in effective-date order' using errcode = '23P01'; end if;
      update public.worker_compensation_profiles set effective_to = p_effective_from - 1, updated_at = now() where id = v_previous.id and company_id = v_company_id;
      v_superseded_count := v_superseded_count + 1;
    end loop;
    insert into public.worker_compensation_profiles (id, user_id, company_id, worker_id, effective_from, effective_to, frequency, rate, default_labor_context, default_project_id, active)
    values (v_id, (select auth.uid()), v_company_id, p_worker_id, p_effective_from, p_effective_to, p_frequency, p_rate, p_default_labor_context, p_default_project_id, coalesce(p_active, true))
    returning * into v_profile;
  end if;
  if v_superseded_count > 0 then
    perform private.write_company_audit(v_company_id, 'COMPENSATION_PROFILE_SUPERSEDED', 'worker_compensation_profile', v_profile.id, jsonb_build_object('supersededCount', v_superseded_count, 'effectiveFrom', p_effective_from));
  end if;
  return to_jsonb(v_profile);
end;
$$;

revoke execute on function public.save_worker_compensation_profile(uuid, uuid, date, date, text, numeric, text, uuid, boolean) from public, anon;
grant execute on function public.save_worker_compensation_profile(uuid, uuid, date, date, text, numeric, text, uuid, boolean) to authenticated;

create or replace function public.apply_compensation_profile_lifecycle(
  p_profile_id uuid,
  p_action text,
  p_end_date date default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := (select private.deployment_company_id());
  v_profile public.worker_compensation_profiles;
  v_preflight jsonb;
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
  v_end_date date;
begin
  perform private.require_workforce_permission(v_company_id, 'workers.manage');
  if v_action not in ('END', 'SUPERSEDE', 'DELETE_UNUSED') then raise exception 'Compensation profile lifecycle action is invalid' using errcode = '22023'; end if;
  if v_action in ('END', 'SUPERSEDE') and v_reason is null then raise exception 'A reason is required to end a compensation profile' using errcode = '22023'; end if;
  select p.* into v_profile from public.worker_compensation_profiles p where p.id = p_profile_id and p.company_id = v_company_id for update;
  if not found then raise exception 'Compensation profile does not exist in the deployment company' using errcode = '42501'; end if;
  v_preflight := jsonb_build_object('profileId', p_profile_id, 'consumed', private.worker_compensation_profile_has_usage(v_profile.id, v_company_id, v_profile.worker_id, v_profile.effective_from, v_profile.effective_to));
  if v_action = 'DELETE_UNUSED' then
    if coalesce((v_preflight ->> 'consumed')::boolean, false) then raise exception 'Historically consumed compensation profiles cannot be deleted; end or supersede them' using errcode = '42501'; end if;
    perform private.write_company_audit(v_company_id, 'COMPENSATION_PROFILE_DELETED_UNUSED', 'worker_compensation_profile', p_profile_id, jsonb_build_object('action', v_action, 'reason', coalesce(v_reason, 'Confirmed unused profile deletion'), 'preflight', v_preflight));
    delete from public.worker_compensation_profiles where id = p_profile_id and company_id = v_company_id;
    return jsonb_build_object('entityType', 'COMPENSATION_PROFILE', 'entityId', p_profile_id, 'action', v_action, 'deleted', true, 'preflight', v_preflight);
  end if;
  v_end_date := coalesce(p_end_date, v_profile.effective_to, current_date);
  if v_end_date < v_profile.effective_from then raise exception 'Compensation profile end date cannot be before its start date' using errcode = '22023'; end if;
  update public.worker_compensation_profiles set active = false, effective_to = v_end_date, updated_at = now() where id = p_profile_id and company_id = v_company_id returning * into v_profile;
  perform private.write_company_audit(v_company_id, case when v_action = 'SUPERSEDE' then 'COMPENSATION_PROFILE_SUPERSEDED' else 'COMPENSATION_PROFILE_ENDED' end, 'worker_compensation_profile', p_profile_id, jsonb_build_object('action', v_action, 'reason', v_reason, 'effectiveTo', v_end_date, 'preflight', v_preflight));
  return jsonb_build_object('entityType', 'COMPENSATION_PROFILE', 'entityId', p_profile_id, 'action', v_action, 'deleted', false, 'preflight', v_preflight, 'record', to_jsonb(v_profile));
end;
$$;

revoke execute on function public.apply_compensation_profile_lifecycle(uuid, text, date, text) from public, anon;
grant execute on function public.apply_compensation_profile_lifecycle(uuid, text, date, text) to authenticated;

create or replace function public.guard_recurring_component_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.workers w where w.id = new.worker_id and w.company_id = new.company_id) then
    raise exception 'Recurring component worker must belong to the same company' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and private.recurring_component_has_usage(old.id, old.company_id, old.worker_id, old.effective_from, old.effective_to)
     and (
       new.worker_id is distinct from old.worker_id
       or new.type is distinct from old.type
       or new.code is distinct from old.code
       or new.name is distinct from old.name
       or new.amount is distinct from old.amount
       or new.rate is distinct from old.rate
       or new.effective_from is distinct from old.effective_from
     ) then
    raise exception 'Historically consumed payroll components cannot be rewritten; deactivate or end them' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' and private.recurring_component_has_usage(old.id, old.company_id, old.worker_id, old.effective_from, old.effective_to) then
    raise exception 'Historically consumed payroll components cannot be deleted; deactivate or end them' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists recurring_payroll_components_lifecycle_guard on public.recurring_payroll_components;
create trigger recurring_payroll_components_lifecycle_guard
before insert or update or delete on public.recurring_payroll_components
for each row execute function public.guard_recurring_component_lifecycle();

create or replace function public.apply_recurring_component_lifecycle(
  p_component_id uuid,
  p_action text,
  p_end_date date default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := (select private.deployment_company_id());
  v_component public.recurring_payroll_components;
  v_preflight jsonb;
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
  v_end_date date;
begin
  perform private.require_workforce_permission(v_company_id, 'workers.manage');
  if v_action not in ('DEACTIVATE', 'END', 'DELETE_UNUSED') then raise exception 'Recurring component lifecycle action is invalid' using errcode = '22023'; end if;
  if v_action in ('DEACTIVATE', 'END') and v_reason is null then raise exception 'A reason is required to deactivate a payroll component' using errcode = '22023'; end if;
  select c.* into v_component from public.recurring_payroll_components c where c.id = p_component_id and c.company_id = v_company_id for update;
  if not found then raise exception 'Recurring payroll component does not exist in the deployment company' using errcode = '42501'; end if;
  v_preflight := jsonb_build_object('componentId', p_component_id, 'consumed', private.recurring_component_has_usage(v_component.id, v_company_id, v_component.worker_id, v_component.effective_from, v_component.effective_to));
  if v_action = 'DELETE_UNUSED' then
    if coalesce((v_preflight ->> 'consumed')::boolean, false) then raise exception 'Historically consumed payroll components cannot be deleted; deactivate or end them' using errcode = '42501'; end if;
    perform private.write_company_audit(v_company_id, 'PAYROLL_COMPONENT_DELETED_UNUSED', 'recurring_payroll_component', p_component_id, jsonb_build_object('action', v_action, 'reason', coalesce(v_reason, 'Confirmed unused component deletion'), 'preflight', v_preflight));
    delete from public.recurring_payroll_components where id = p_component_id and company_id = v_company_id;
    return jsonb_build_object('entityType', 'RECURRING_COMPONENT', 'entityId', p_component_id, 'action', v_action, 'deleted', true, 'preflight', v_preflight);
  end if;
  v_end_date := coalesce(p_end_date, v_component.effective_to, current_date);
  if v_end_date < v_component.effective_from then raise exception 'Payroll component end date cannot be before its start date' using errcode = '22023'; end if;
  update public.recurring_payroll_components set active = false, effective_to = v_end_date, updated_at = now() where id = p_component_id and company_id = v_company_id returning * into v_component;
  perform private.write_company_audit(v_company_id, 'PAYROLL_COMPONENT_DEACTIVATED', 'recurring_payroll_component', p_component_id, jsonb_build_object('action', v_action, 'reason', v_reason, 'effectiveTo', v_end_date, 'preflight', v_preflight));
  return jsonb_build_object('entityType', 'RECURRING_COMPONENT', 'entityId', p_component_id, 'action', v_action, 'deleted', false, 'preflight', v_preflight, 'record', to_jsonb(v_component));
end;
$$;

revoke execute on function public.apply_recurring_component_lifecycle(uuid, text, date, text) from public, anon;
grant execute on function public.apply_recurring_component_lifecycle(uuid, text, date, text) to authenticated;

create or replace function public.guard_workforce_source_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_table_name = 'work_entries' then
    if tg_op = 'DELETE' and old.status <> 'DRAFT' and current_user <> 'postgres' then raise exception 'Only draft work entries without downstream use may be deleted; void a used entry instead' using errcode = '42501'; end if;
    if tg_op = 'UPDATE' and old.status = 'VOID' and old is distinct from new then raise exception 'Voided work entries are immutable' using errcode = '42501'; end if;
    if tg_op = 'UPDATE' and new.status = 'VOID' and old.status <> 'VOID' and nullif(btrim(new.void_reason), '') is null then raise exception 'A reason is required to void a work entry' using errcode = '22023'; end if;
    if tg_op = 'INSERT' and new.status = 'VOID' and nullif(btrim(new.void_reason), '') is null then raise exception 'A reason is required to create a void work entry' using errcode = '22023'; end if;
  elsif tg_table_name = 'attendance_records' then
    if tg_op = 'DELETE' and old.record_status <> 'DRAFT' and current_user <> 'postgres' then raise exception 'Only draft attendance may be deleted; void confirmed attendance instead' using errcode = '42501'; end if;
    if tg_op = 'UPDATE' and old.record_status = 'VOID' and old is distinct from new then raise exception 'Voided attendance is immutable' using errcode = '42501'; end if;
    if tg_op = 'UPDATE' and new.record_status = 'VOID' and old.record_status <> 'VOID' and nullif(btrim(new.void_reason), '') is null then raise exception 'A reason is required to void attendance' using errcode = '22023'; end if;
    if tg_op = 'INSERT' and new.record_status = 'VOID' and nullif(btrim(new.void_reason), '') is null then raise exception 'A reason is required to create void attendance' using errcode = '22023'; end if;
  elsif tg_table_name = 'leave_requests' then
    if tg_op = 'DELETE' and old.status <> 'DRAFT' and current_user <> 'postgres' then raise exception 'Only draft leave requests may be deleted; cancel an operational request instead' using errcode = '42501'; end if;
    if tg_op = 'UPDATE' and old.status = 'CANCELLED' and old is distinct from new then raise exception 'Cancelled leave requests are immutable' using errcode = '42501'; end if;
    if tg_op = 'UPDATE' and new.status = 'CANCELLED' and old.status <> 'CANCELLED' and nullif(btrim(new.cancellation_reason), '') is null then raise exception 'A reason is required to cancel leave' using errcode = '22023'; end if;
    if tg_op = 'INSERT' and new.status = 'CANCELLED' and nullif(btrim(new.cancellation_reason), '') is null then raise exception 'A reason is required to create cancelled leave' using errcode = '22023'; end if;
  elsif tg_table_name = 'overtime_requests' then
    if tg_op = 'DELETE' and old.status <> 'DRAFT' and current_user <> 'postgres' then raise exception 'Only draft overtime requests may be deleted; cancel an operational request instead' using errcode = '42501'; end if;
    if tg_op = 'UPDATE' and old.status = 'CANCELLED' and old is distinct from new then raise exception 'Cancelled overtime requests are immutable' using errcode = '42501'; end if;
    if tg_op = 'UPDATE' and new.status = 'CANCELLED' and old.status <> 'CANCELLED' and nullif(btrim(new.cancellation_reason), '') is null then raise exception 'A reason is required to cancel overtime' using errcode = '22023'; end if;
    if tg_op = 'INSERT' and new.status = 'CANCELLED' and nullif(btrim(new.cancellation_reason), '') is null then raise exception 'A reason is required to create cancelled overtime' using errcode = '22023'; end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array['work_entries', 'attendance_records', 'leave_requests', 'overtime_requests'] loop
    execute format('drop trigger if exists %I on public.%I', v_table || '_lifecycle_guard', v_table);
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.guard_workforce_source_lifecycle()', v_table || '_lifecycle_guard', v_table);
  end loop;
end $$;

create or replace function public.apply_workforce_source_lifecycle(
  p_entity_type text,
  p_entity_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := (select private.deployment_company_id());
  v_entity text := upper(btrim(coalesce(p_entity_type, '')));
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
  v_record jsonb;
  v_deleted boolean := false;
begin
  if v_entity in ('WORK_ENTRY', 'ATTENDANCE', 'LEAVE', 'OVERTIME') then
    perform private.require_workforce_permission(v_company_id, 'payroll.manage');
  else
    raise exception 'Workforce source entity is invalid' using errcode = '22023';
  end if;
  if v_action not in ('DELETE_DRAFT', 'VOID', 'CANCEL') then raise exception 'Workforce source lifecycle action is invalid' using errcode = '22023'; end if;
  if v_action in ('VOID', 'CANCEL') and v_reason is null then raise exception 'A reason is required for this source correction' using errcode = '22023'; end if;

  if v_entity = 'WORK_ENTRY' then
    if v_action = 'DELETE_DRAFT' then
      delete from public.work_entries e where e.id = p_entity_id and e.company_id = v_company_id and e.status = 'DRAFT' returning to_jsonb(e) into v_record;
      if v_record is null then raise exception 'Only an unused draft work entry may be deleted' using errcode = '42501'; end if;
      v_deleted := true;
      perform private.write_company_audit(v_company_id, 'WORK_ENTRY_DELETED_UNUSED', 'work_entry', p_entity_id, jsonb_build_object('action', v_action, 'reason', 'Confirmed unused draft deletion'));
    elsif v_action = 'VOID' then
      update public.work_entries e set status = 'VOID', voided_at = now(), void_reason = v_reason, updated_at = now() where e.id = p_entity_id and e.company_id = v_company_id and e.status <> 'VOID' returning to_jsonb(e) into v_record;
      if v_record is null then raise exception 'Work entry does not exist or is already void' using errcode = '42501'; end if;
      perform private.write_company_audit(v_company_id, 'WORK_ENTRY_VOIDED', 'work_entry', p_entity_id, jsonb_build_object('action', v_action, 'reason', v_reason));
    else raise exception 'Work entries support DELETE_DRAFT or VOID only' using errcode = '22023'; end if;
  elsif v_entity = 'ATTENDANCE' then
    if v_action = 'DELETE_DRAFT' then
      delete from public.attendance_records a where a.id = p_entity_id and a.company_id = v_company_id and a.record_status = 'DRAFT' returning to_jsonb(a) into v_record;
      if v_record is null then raise exception 'Only draft attendance may be deleted' using errcode = '42501'; end if;
      v_deleted := true;
      perform private.write_company_audit(v_company_id, 'ATTENDANCE_DELETED_UNUSED', 'attendance_record', p_entity_id, jsonb_build_object('action', v_action, 'reason', 'Confirmed unused draft deletion'));
    elsif v_action = 'VOID' then
      update public.attendance_records a set record_status = 'VOID', voided_at = now(), void_reason = v_reason, updated_at = now() where a.id = p_entity_id and a.company_id = v_company_id and a.record_status <> 'VOID' returning to_jsonb(a) into v_record;
      if v_record is null then raise exception 'Attendance does not exist or is already void' using errcode = '42501'; end if;
      perform private.write_company_audit(v_company_id, 'ATTENDANCE_VOIDED', 'attendance_record', p_entity_id, jsonb_build_object('action', v_action, 'reason', v_reason));
    else raise exception 'Attendance supports DELETE_DRAFT or VOID only' using errcode = '22023'; end if;
  elsif v_entity = 'LEAVE' then
    if v_action = 'DELETE_DRAFT' then
      delete from public.leave_requests l where l.id = p_entity_id and l.company_id = v_company_id and l.status = 'DRAFT' returning to_jsonb(l) into v_record;
      if v_record is null then raise exception 'Only draft leave requests may be deleted' using errcode = '42501'; end if;
      v_deleted := true;
      perform private.write_company_audit(v_company_id, 'LEAVE_DELETED_UNUSED', 'leave_request', p_entity_id, jsonb_build_object('action', v_action, 'reason', 'Confirmed unused draft deletion'));
    elsif v_action = 'CANCEL' then
      update public.leave_requests l set status = 'CANCELLED', cancelled_at = now(), cancellation_reason = v_reason, updated_at = now() where l.id = p_entity_id and l.company_id = v_company_id and l.status in ('PENDING', 'APPROVED') returning to_jsonb(l) into v_record;
      if v_record is null then raise exception 'Only pending or approved leave may be cancelled' using errcode = '42501'; end if;
      perform private.write_company_audit(v_company_id, 'LEAVE_CANCELLED', 'leave_request', p_entity_id, jsonb_build_object('action', v_action, 'reason', v_reason));
    else raise exception 'Leave supports DELETE_DRAFT or CANCEL only' using errcode = '22023'; end if;
  else
    if v_action = 'DELETE_DRAFT' then
      delete from public.overtime_requests o where o.id = p_entity_id and o.company_id = v_company_id and o.status = 'DRAFT' returning to_jsonb(o) into v_record;
      if v_record is null then raise exception 'Only draft overtime requests may be deleted' using errcode = '42501'; end if;
      v_deleted := true;
      perform private.write_company_audit(v_company_id, 'OVERTIME_DELETED_UNUSED', 'overtime_request', p_entity_id, jsonb_build_object('action', v_action, 'reason', 'Confirmed unused draft deletion'));
    elsif v_action = 'CANCEL' then
      update public.overtime_requests o set status = 'CANCELLED', cancelled_at = now(), cancellation_reason = v_reason, updated_at = now() where o.id = p_entity_id and o.company_id = v_company_id and o.status in ('PENDING', 'APPROVED') returning to_jsonb(o) into v_record;
      if v_record is null then raise exception 'Only pending or approved overtime may be cancelled' using errcode = '42501'; end if;
      perform private.write_company_audit(v_company_id, 'OVERTIME_CANCELLED', 'overtime_request', p_entity_id, jsonb_build_object('action', v_action, 'reason', v_reason));
    else raise exception 'Overtime supports DELETE_DRAFT or CANCEL only' using errcode = '22023'; end if;
  end if;

  return jsonb_build_object('entityType', v_entity, 'entityId', p_entity_id, 'action', v_action, 'deleted', v_deleted, 'record', coalesce(v_record, '{}'::jsonb));
end;
$$;

revoke execute on function public.apply_workforce_source_lifecycle(text, uuid, text, text) from public, anon;
grant execute on function public.apply_workforce_source_lifecycle(text, uuid, text, text) to authenticated;

-- Finalized source guards already protect approved/paid/locked ranges. These
-- additional transition checks make direct table updates follow the same
-- correction semantics as the RPCs.
create or replace function public.guard_overtime_request_operation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.status is distinct from new.status and not (
    (old.status = 'DRAFT' and new.status in ('PENDING', 'CANCELLED'))
    or (old.status = 'PENDING' and new.status in ('APPROVED', 'REJECTED', 'CANCELLED'))
    or (old.status = 'APPROVED' and new.status = 'CANCELLED')
  ) then
    raise exception 'Invalid overtime status transition: % to %', old.status, new.status using errcode = '42501';
  end if;
  if new.labor_context = 'PROJECT' and (new.project_id is null or not exists (select 1 from public.projects p where p.id = new.project_id and p.company_id = new.company_id and p.status <> 'ARCHIVED' and p.archived_at is null)) then
    raise exception 'Project overtime requires an active project in the same company' using errcode = '42501';
  end if;
  if new.labor_context <> 'PROJECT' and new.project_id is not null then raise exception 'Non-project overtime cannot reference a project' using errcode = '22023'; end if;
  return new;
end;
$$;

drop trigger if exists overtime_requests_operation_guard on public.overtime_requests;
create trigger overtime_requests_operation_guard
before insert or update on public.overtime_requests
for each row execute function public.guard_overtime_request_operation();

revoke execute on function public.guard_worker_lifecycle_edit() from public, anon, authenticated;
revoke execute on function public.guard_project_worker_assignment_lifecycle() from public, anon, authenticated;
revoke execute on function public.guard_worker_compensation_profile_lifecycle() from public, anon, authenticated;
revoke execute on function public.guard_recurring_component_lifecycle() from public, anon, authenticated;
revoke execute on function public.guard_workforce_source_lifecycle() from public, anon, authenticated;
revoke execute on function public.guard_overtime_request_operation() from public, anon, authenticated;
