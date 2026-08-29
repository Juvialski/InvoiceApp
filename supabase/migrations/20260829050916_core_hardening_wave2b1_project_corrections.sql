-- Engoryx Core Hardening Wave 2B1: project correction and removal lifecycle.
--
-- Project identity is retained whenever any operational, financial, workforce,
-- payroll, engineering, import, or accounting reference exists. Permanent
-- deletion is available only through the guarded unused-project RPC after the
-- database rechecks every known dependency while the project row is locked.

alter table public.projects
  add column if not exists archived_from_status text;

alter table public.projects
  drop constraint if exists projects_archived_from_status_check;
alter table public.projects
  add constraint projects_archived_from_status_check
  check (archived_from_status is null or archived_from_status in ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'));

create index if not exists projects_company_archived_from_status_idx
  on public.projects(company_id, status, archived_from_status);
create index if not exists payroll_import_rows_company_project_idx
  on public.payroll_import_rows(company_id, project_id)
  where project_id is not null;
create index if not exists workers_company_default_project_idx
  on public.workers(company_id, default_project_id)
  where default_project_id is not null;
create index if not exists worker_compensation_profiles_company_default_project_idx
  on public.worker_compensation_profiles(company_id, default_project_id)
  where default_project_id is not null;

-- Extend the append-only audit allowlist without dropping any previously
-- supported event type.
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
    'OVERTIME_CANCELLED', 'OVERTIME_DELETED_UNUSED',
    'PROJECT_DELETED_UNUSED', 'PROJECT_ARCHIVED', 'PROJECT_REACTIVATED'
  ));

-- Projects already have no authenticated DELETE grant in the company policy
-- catalog. Reassert the boundary in the same forward migration that exposes
-- the safe replacement lifecycle.
update private.company_tenant_policy_catalog
set allow_delete = false
where table_name = 'projects';

drop policy if exists projects_company_delete on public.projects;
drop policy if exists projects_delete_own on public.projects;
revoke delete on table public.projects from anon, authenticated;

create or replace function private.require_project_permission(
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
    raise exception 'The current user is not authorized for this project operation'
      using errcode = '42501';
  end if;
end;
$$;

revoke execute on function private.require_project_permission(uuid, text) from public, anon, authenticated;

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
  v_total bigint;
  v_can_delete boolean;
  v_can_reactivate boolean;
begin
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

  -- Project labor context is a historical snapshot rather than a foreign key.
  -- Include both camelCase and snake_case forms so an old imported snapshot
  -- cannot make an apparently unused project eligible for deletion.
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

  v_total := v_invoice_allocations + v_expenses + v_assignments + v_work_entries
    + v_overtime_requests + v_payroll_allocations + v_payroll_entry_contexts
    + v_import_rows + v_worker_defaults + v_compensation_defaults
    + v_engineering_documents + v_engineering_rfis + v_engineering_submittals
    + v_daily_site_logs + v_accounting_events;
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
      'projectAccountingEvents', v_accounting_events
    )
  );
end;
$$;

create or replace function private.project_lifecycle_preflight_authorized(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := (select private.deployment_company_id());
begin
  perform private.require_project_permission(v_company_id, 'projects.read');
  return private.project_lifecycle_preflight(p_project_id, v_company_id);
end;
$$;

create or replace function public.preview_project_lifecycle(p_project_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.project_lifecycle_preflight_authorized(p_project_id);
$$;

create or replace function public.apply_project_lifecycle(
  p_project_id uuid,
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
  v_project public.projects;
  v_preflight jsonb;
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
begin
  perform private.require_project_permission(v_company_id, 'projects.manage');

  if v_action not in ('DELETE_UNUSED', 'ARCHIVE', 'REACTIVATE') then
    raise exception 'Project lifecycle action is invalid'
      using errcode = '22023';
  end if;

  select p.*
    into v_project
  from public.projects p
  where p.id = p_project_id
    and p.company_id = v_company_id
  for update;

  if not found then
    raise exception 'Project does not exist in the deployment company'
      using errcode = '42501';
  end if;

  -- The project lock is acquired before this read. Foreign-key child inserts
  -- must take a compatible key-share lock, so the delete path observes a
  -- committed dependency or waits for this transaction before proceeding.
  v_preflight := private.project_lifecycle_preflight(p_project_id, v_company_id);

  if v_action = 'DELETE_UNUSED' then
    if coalesce((v_preflight ->> 'canDelete')::boolean, false) is not true then
      raise exception 'This project has operational or financial history and cannot be permanently deleted. Archive it instead.'
        using errcode = '42501';
    end if;

    perform private.write_company_audit(
      v_company_id,
      'PROJECT_DELETED_UNUSED',
      'project',
      p_project_id,
      jsonb_build_object(
        'action', v_action,
        'reason', coalesce(v_reason, 'Confirmed unused project deletion'),
        'preflight', v_preflight
      )
    );

    delete from public.projects
    where id = p_project_id and company_id = v_company_id;

    return jsonb_build_object(
      'entityType', 'PROJECT',
      'entityId', p_project_id,
      'action', v_action,
      'deleted', true,
      'preflight', v_preflight
    );
  end if;

  if v_action = 'ARCHIVE' then
    -- Archive is idempotent: repeated clicks do not create duplicate audit
    -- events or rewrite the original archive timestamp.
    if v_project.status = 'ARCHIVED' and v_project.archived_at is not null then
      return jsonb_build_object(
        'entityType', 'PROJECT',
        'entityId', p_project_id,
        'action', v_action,
        'deleted', false,
        'changed', false,
        'preflight', v_preflight,
        'record', to_jsonb(v_project)
      );
    end if;
    if v_reason is null then
      raise exception 'A reason is required to archive a project'
        using errcode = '22023';
    end if;

    update public.projects
    set status = 'ARCHIVED',
        archived_at = coalesce(v_project.archived_at, now()),
        archived_from_status = case
          when v_project.status = 'ARCHIVED' then v_project.archived_from_status
          else v_project.status
        end,
        updated_at = now()
    where id = p_project_id and company_id = v_company_id
    returning * into v_project;

    perform private.write_company_audit(
      v_company_id,
      'PROJECT_ARCHIVED',
      'project',
      p_project_id,
      jsonb_build_object(
        'action', v_action,
        'reason', v_reason,
        'fromStatus', v_preflight ->> 'status',
        'preflight', v_preflight
      )
    );

    return jsonb_build_object(
      'entityType', 'PROJECT',
      'entityId', p_project_id,
      'action', v_action,
      'deleted', false,
      'changed', true,
      'preflight', v_preflight,
      'record', to_jsonb(v_project)
    );
  end if;

  if v_reason is null then
    raise exception 'A reason is required to reactivate a project'
      using errcode = '22023';
  end if;
  if coalesce((v_preflight ->> 'canReactivate')::boolean, false) is not true then
    raise exception 'This project cannot be reactivated because its prior state is unavailable or terminal'
      using errcode = '42501';
  end if;

  update public.projects
  set status = v_project.archived_from_status,
      archived_at = null,
      archived_from_status = null,
      updated_at = now()
  where id = p_project_id and company_id = v_company_id
  returning * into v_project;

  perform private.write_company_audit(
    v_company_id,
    'PROJECT_REACTIVATED',
    'project',
    p_project_id,
    jsonb_build_object(
      'action', v_action,
      'reason', v_reason,
      'fromStatus', 'ARCHIVED',
      'toStatus', v_project.status,
      'preflight', v_preflight
    )
  );

  return jsonb_build_object(
    'entityType', 'PROJECT',
    'entityId', p_project_id,
    'action', v_action,
    'deleted', false,
    'changed', true,
    'preflight', v_preflight,
    'record', to_jsonb(v_project)
  );
end;
$$;

revoke execute on function public.preview_project_lifecycle(uuid) from public, anon;
revoke execute on function public.apply_project_lifecycle(uuid, text, text) from public, anon;
grant execute on function public.preview_project_lifecycle(uuid) to authenticated;
grant execute on function public.apply_project_lifecycle(uuid, text, text) to authenticated;

-- Lifecycle fields cannot be changed by a generic metadata upsert. The guarded
-- RPCs run as the database owner, matching the established Wave 2A pattern.
create or replace function public.guard_project_lifecycle_edit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     and current_user not in ('postgres', 'service_role')
     and (
       new.status = 'ARCHIVED'
       or new.archived_at is not null
       or new.archived_from_status is not null
     ) then
    raise exception 'Create an archived project through the project lifecycle workflow'
      using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and current_user <> 'postgres'
     and (
       new.status is distinct from old.status
       or new.archived_at is distinct from old.archived_at
       or new.archived_from_status is distinct from old.archived_from_status
     ) then
    raise exception 'Use the project archive or reactivate lifecycle action for project state changes'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_lifecycle_edit_guard on public.projects;
create trigger projects_lifecycle_edit_guard
before update on public.projects
for each row execute function public.guard_project_lifecycle_edit();

revoke execute on function public.guard_project_lifecycle_edit() from public, anon, authenticated;

-- Existing direct project-cost triggers are retained, but now recognize both
-- status and timestamp so an inconsistent archived row cannot receive new cost.
create or replace function public.prevent_archived_project_cost_assignment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.project_id is null then return new; end if;
  if exists (
    select 1
    from public.projects p
    where p.id = new.project_id
      and p.company_id = new.company_id
      and (p.status = 'ARCHIVED' or p.archived_at is not null)
  ) then
    raise exception 'Archived projects cannot receive new operational records'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- This trigger covers project-bearing engineering child rows and staged import
-- rows whose project relationship is indirect or not covered by the original
-- cost-assignment trigger. It intentionally blocks INSERT and UPDATE only;
-- historical rows remain queryable and are never deleted by project archive.
create or replace function public.prevent_archived_project_activity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project_id uuid;
begin
  if tg_table_name in (
    'invoice_project_allocations', 'expenses', 'project_worker_assignments',
    'work_entries', 'overtime_requests', 'payroll_project_allocations',
    'payroll_import_rows', 'engineering_documents', 'engineering_rfis',
    'engineering_submittals', 'engineering_daily_site_logs',
    'project_accounting_events'
  ) then
    v_project_id := new.project_id;
  elsif tg_table_name in ('engineering_document_revisions', 'drawing_annotations') then
    select d.project_id into v_project_id
    from public.engineering_documents d
    where d.id = new.document_id and d.company_id = new.company_id;
  elsif tg_table_name in ('engineering_rfi_responses', 'engineering_rfi_document_links') then
    select r.project_id into v_project_id
    from public.engineering_rfis r
    where r.id = new.rfi_id and r.company_id = new.company_id;
  elsif tg_table_name in ('engineering_submittal_rounds', 'engineering_submittal_reviews', 'engineering_submittal_document_links') then
    select s.project_id into v_project_id
    from public.engineering_submittals s
    where s.id = new.submittal_id and s.company_id = new.company_id;
  elsif tg_table_name in (
    'engineering_daily_site_log_weather', 'engineering_daily_site_log_crew',
    'engineering_daily_site_log_equipment', 'engineering_daily_site_log_safety',
    'engineering_daily_site_log_events'
  ) then
    select l.project_id into v_project_id
    from public.engineering_daily_site_logs l
    where l.id = new.site_log_id and l.company_id = new.company_id;
  end if;

  if v_project_id is not null and exists (
    select 1
    from public.projects p
    where p.id = v_project_id
      and p.company_id = new.company_id
      and (p.status = 'ARCHIVED' or p.archived_at is not null)
  ) then
    raise exception 'Archived projects cannot receive new operational records'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'invoice_project_allocations', 'expenses', 'project_worker_assignments',
    'work_entries', 'overtime_requests', 'payroll_project_allocations',
    'payroll_import_rows', 'engineering_documents', 'engineering_document_revisions',
    'drawing_annotations', 'engineering_rfis', 'engineering_rfi_responses',
    'engineering_rfi_document_links', 'engineering_submittals',
    'engineering_submittal_rounds', 'engineering_submittal_reviews',
    'engineering_submittal_document_links', 'engineering_daily_site_logs',
    'engineering_daily_site_log_weather', 'engineering_daily_site_log_crew',
    'engineering_daily_site_log_equipment', 'engineering_daily_site_log_safety',
    'engineering_daily_site_log_events', 'project_accounting_events'
  ] loop
    execute format('drop trigger if exists %I on public.%I', v_table || '_project_activity', v_table);
    execute format(
      'create trigger %I before insert or update on public.%I for each row execute function public.prevent_archived_project_activity()',
      v_table || '_project_activity', v_table
    );
  end loop;
end $$;

revoke execute on function public.prevent_archived_project_cost_assignment() from public, anon, authenticated;
revoke execute on function public.prevent_archived_project_activity() from public, anon, authenticated;
