-- Engoryx Core Hardening Wave 2C: engineering correction and removal lifecycles.
--
-- Existing engineering records are historical operational data, not disposable
-- CRUD rows.  This migration adds bounded preview/apply RPCs, keeps immutable
-- revisions/rounds/responses intact, and introduces an append-only Site Log
-- addendum path for corrections after finalization.

-- Document lifecycle metadata is additive.  Existing SUPERSEDED rows receive
-- only the best available historical timestamp/actor; no revision or source
-- data is rewritten.
alter table public.engineering_documents
  add column if not exists lifecycle_reason text,
  add column if not exists lifecycle_actor_user_id uuid references auth.users(id) on delete set null,
  add column if not exists superseded_at timestamptz,
  add column if not exists superseded_by_user_id uuid references auth.users(id) on delete set null;

update public.engineering_documents
set superseded_at = coalesce(superseded_at, updated_at, created_at, now()),
    superseded_by_user_id = coalesce(superseded_by_user_id, created_by_user_id),
    lifecycle_reason = coalesce(lifecycle_reason, 'Pre-existing superseded document')
where status = 'SUPERSEDED';

alter table public.engineering_documents
  drop constraint if exists engineering_documents_lifecycle_reason_check;
alter table public.engineering_documents
  add constraint engineering_documents_lifecycle_reason_check
  check (lifecycle_reason is null or length(btrim(lifecycle_reason)) between 3 and 1000);

create index if not exists engineering_documents_company_lifecycle_idx
  on public.engineering_documents(company_id, status, archived_at);

create table if not exists public.engineering_daily_site_log_addenda (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  site_log_id uuid not null references public.engineering_daily_site_logs(id) on delete restrict,
  addendum_number integer not null check (addendum_number >= 1),
  reason text not null check (length(btrim(reason)) between 3 and 1000),
  correction_text text not null check (length(btrim(correction_text)) between 1 and 8000),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (site_log_id, addendum_number)
);

create index if not exists engineering_daily_site_log_addenda_company_log_idx
  on public.engineering_daily_site_log_addenda(company_id, site_log_id, addendum_number);

insert into private.company_tenant_policy_catalog
  (table_name, read_permission, write_permission, allow_insert, allow_update, allow_delete)
values
  ('engineering_daily_site_log_addenda', 'engineering.sitelogs.read', 'engineering.sitelogs.manage', false, false, false)
on conflict (table_name) do update set
  read_permission = excluded.read_permission,
  write_permission = excluded.write_permission,
  allow_insert = excluded.allow_insert,
  allow_update = excluded.allow_update,
  allow_delete = excluded.allow_delete;

-- Keep the append-only audit allowlist a strict superset of the current main
-- branch (90 events), then add this wave's six engineering lifecycle events.
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
    'CASH_ACCOUNT_CREATED', 'CASH_ACCOUNT_UPDATED', 'CASH_ACCOUNT_DEACTIVATED',
    'CASH_BALANCE_SNAPSHOT_RECORDED', 'CASH_STATEMENT_IMPORTED', 'CASH_STATEMENT_REJECTED',
    'CASH_TRANSACTION_CREATED', 'CASH_TRANSACTION_UPDATED',
    'CASH_RECONCILIATION_CONFIRMED', 'CASH_RECONCILIATION_REMOVED', 'CASH_TRANSFER_MATCHED',
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
    'WORK_ENTRY_VOIDED', 'WORK_ENTRY_DELETED_UNUSED',
    'ATTENDANCE_VOIDED', 'ATTENDANCE_DELETED_UNUSED',
    'LEAVE_CANCELLED', 'LEAVE_DELETED_UNUSED',
    'OVERTIME_CANCELLED', 'OVERTIME_DELETED_UNUSED',
    'PROJECT_DELETED_UNUSED', 'PROJECT_ARCHIVED', 'PROJECT_REACTIVATED',
    'INVOICE_DELETED_UNUSED', 'INVOICE_VOIDED', 'INVOICE_ARCHIVED', 'INVOICE_RESTORED',
    'EXPENSE_DELETED_UNUSED', 'EXPENSE_VOIDED', 'EXPENSE_ARCHIVED', 'EXPENSE_RESTORED'
  ));

-- A lifecycle RPC is the only client-facing path for deletion or lifecycle
-- metadata changes.  Security-definer RPCs run as the migration owner; the
-- trigger exception is deliberately narrower than a normal authenticated
-- table update.
create or replace function private.engineering_lifecycle_actor(
  p_company_id uuid,
  p_permission_key text,
  p_entity_label text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null
     or p_company_id is null
     or p_company_id is distinct from (select private.deployment_company_id())
     or not (select private.has_company_permission(p_company_id, p_permission_key)) then
    raise exception 'The current user is not authorized to correct this %', coalesce(p_entity_label, 'engineering record')
      using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

create or replace function private.engineering_lifecycle_project_available(
  p_company_id uuid,
  p_project_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_project_id is null
    or exists (
      select 1 from public.projects p
      where p.id = p_project_id
        and p.company_id = p_company_id
        and p.archived_at is null
    );
$$;

create or replace function private.guard_engineering_document_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'DRAFT'
       or new.archived_at is not null
       or new.lifecycle_reason is not null
       or new.lifecycle_actor_user_id is not null
       or new.superseded_at is not null
       or new.superseded_by_user_id is not null then
      raise exception 'Create an engineering document in DRAFT; use the document lifecycle workflow for state changes'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status
     or new.archived_at is distinct from old.archived_at
     or new.lifecycle_reason is distinct from old.lifecycle_reason
     or new.lifecycle_actor_user_id is distinct from old.lifecycle_actor_user_id
     or new.superseded_at is distinct from old.superseded_at
     or new.superseded_by_user_id is distinct from old.superseded_by_user_id then
    raise exception 'Use the engineering document lifecycle workflow for archive or supersede actions'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.prevent_engineering_document_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role') and old.status = 'DRAFT' then
    return old;
  end if;
  raise exception 'Engineering documents are historical records; use the guarded unused-document lifecycle action'
    using errcode = '55000';
end;
$$;

create or replace function private.guard_engineering_revision_parent_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.engineering_documents d
    where d.id = new.document_id
      and d.company_id = new.company_id
      and d.status in ('ARCHIVED', 'SUPERSEDED')
  ) then
    raise exception 'Archived or superseded engineering documents cannot receive new revisions' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists engineering_documents_lifecycle_guard on public.engineering_documents;
create trigger engineering_documents_lifecycle_guard
before insert or update on public.engineering_documents
for each row execute function private.guard_engineering_document_lifecycle();

drop trigger if exists engineering_documents_no_delete on public.engineering_documents;
create trigger engineering_documents_no_delete
before delete on public.engineering_documents
for each row execute function private.prevent_engineering_document_delete();

drop trigger if exists engineering_document_revisions_parent_lifecycle on public.engineering_document_revisions;
create trigger engineering_document_revisions_parent_lifecycle
before insert on public.engineering_document_revisions
for each row execute function private.guard_engineering_revision_parent_lifecycle();

-- Preserve a reason/actor in document audit metadata and distinguish
-- SUPERSEDE from a generic metadata update.  Existing archive behavior stays
-- compatible with the Phase 1A audit trigger.
create or replace function private.audit_engineering_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event text;
  v_target_id uuid;
  v_metadata jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'engineering_documents' then
    if tg_op = 'INSERT' then
      v_event := 'ENGINEERING_DOCUMENT_CREATED';
    elsif new.status = 'ARCHIVED' and old.status is distinct from 'ARCHIVED' then
      v_event := 'ENGINEERING_DOCUMENT_ARCHIVED';
    elsif new.status = 'SUPERSEDED' and old.status is distinct from 'SUPERSEDED' then
      v_event := 'ENGINEERING_DOCUMENT_SUPERSEDED';
    else
      v_event := 'ENGINEERING_DOCUMENT_UPDATED';
    end if;
    v_target_id := new.id;
    v_metadata := jsonb_build_object(
      'document_number', new.document_number,
      'title', new.title,
      'discipline', new.discipline,
      'document_type', new.document_type,
      'status', new.status,
      'project_id', new.project_id,
      'reason', new.lifecycle_reason,
      'lifecycle_actor_user_id', new.lifecycle_actor_user_id
    );
  elsif tg_table_name = 'engineering_document_revisions' then
    v_event := 'ENGINEERING_REVISION_UPLOADED';
    v_target_id := new.id;
    v_metadata := jsonb_build_object(
      'document_id', new.document_id,
      'revision_number', new.revision_number,
      'file_name', new.file_name,
      'file_size_bytes', new.file_size_bytes,
      'file_type', new.file_type
    );
  elsif tg_table_name = 'drawing_annotations' then
    if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.status = 'DELETED' and old.status is distinct from 'DELETED') then
      v_event := 'ENGINEERING_ANNOTATION_DELETED';
      v_target_id := coalesce(new.id, old.id);
      v_metadata := jsonb_build_object(
        'document_id', coalesce(new.document_id, old.document_id),
        'revision_id', coalesce(new.revision_id, old.revision_id),
        'annotation_type', coalesce(new.annotation_type, old.annotation_type),
        'page_number', coalesce(new.page_number, old.page_number)
      );
      perform private.write_company_audit(coalesce(new.company_id, old.company_id), v_event, 'engineering', v_target_id, v_metadata);
      return coalesce(new, old);
    else
      v_event := 'ENGINEERING_ANNOTATION_SAVED';
      v_target_id := new.id;
      v_metadata := jsonb_build_object(
        'document_id', new.document_id,
        'revision_id', new.revision_id,
        'annotation_type', new.annotation_type,
        'page_number', new.page_number,
        'status', new.status
      );
    end if;
  else
    return new;
  end if;

  perform private.write_company_audit(new.company_id, v_event, 'engineering', v_target_id, v_metadata);
  return new;
end;
$$;

-- Formal coordination children remain append-only.  The sole exception is a
-- disposable first DRAFT round removed as part of the guarded unused-
-- submittal deletion transaction.
create or replace function private.prevent_coordination_history_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and tg_table_name = 'engineering_submittal_rounds'
     and current_user in ('postgres', 'service_role')
     and old.status = 'DRAFT'
     and not exists (select 1 from public.engineering_submittal_reviews r where r.round_id = old.id)
     and not exists (select 1 from public.engineering_submittal_document_links l where l.round_id = old.id) then
    return old;
  end if;
  raise exception 'Formal engineering coordination history is append-only' using errcode = '55000';
end;
$$;

create or replace function private.prevent_engineering_coordination_parent_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role') and old.status = 'DRAFT' then
    return old;
  end if;
  raise exception 'Formal engineering coordination records are historical; use the guarded unused-record lifecycle action'
    using errcode = '55000';
end;
$$;

drop trigger if exists engineering_rfis_no_delete on public.engineering_rfis;
create trigger engineering_rfis_no_delete
before delete on public.engineering_rfis
for each row execute function private.prevent_engineering_coordination_parent_delete();

drop trigger if exists engineering_submittals_no_delete on public.engineering_submittals;
create trigger engineering_submittals_no_delete
before delete on public.engineering_submittals
for each row execute function private.prevent_engineering_coordination_parent_delete();

create or replace function private.guard_engineering_coordination_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;
  if tg_table_name = 'engineering_rfis' and (
    new.status is distinct from old.status
    or new.opened_at is distinct from old.opened_at
    or new.answered_at is distinct from old.answered_at
    or new.closed_at is distinct from old.closed_at
    or new.voided_at is distinct from old.voided_at
    or new.close_void_reason is distinct from old.close_void_reason
  ) then
    raise exception 'Use the guarded RFI lifecycle workflow for status changes' using errcode = '42501';
  elsif tg_table_name = 'engineering_submittals' and (
    new.status is distinct from old.status
    or new.current_round is distinct from old.current_round
    or new.submitted_at is distinct from old.submitted_at
    or new.closed_at is distinct from old.closed_at
    or new.voided_at is distinct from old.voided_at
    or new.close_void_reason is distinct from old.close_void_reason
  ) then
    raise exception 'Use the guarded submittal lifecycle workflow for status changes' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists engineering_rfis_lifecycle_guard on public.engineering_rfis;
create trigger engineering_rfis_lifecycle_guard
before update on public.engineering_rfis
for each row execute function private.guard_engineering_coordination_lifecycle();

drop trigger if exists engineering_submittals_lifecycle_guard on public.engineering_submittals;
create trigger engineering_submittals_lifecycle_guard
before update on public.engineering_submittals
for each row execute function private.guard_engineering_coordination_lifecycle();

-- Draft Site Log events may be removed only as part of deleting the entire
-- disposable draft.  Submitted/finalized/voided event history is immutable.
create or replace function private.prevent_daily_site_log_history_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and current_user in ('postgres', 'service_role')
     and exists (
       select 1 from public.engineering_daily_site_logs l
       where l.id = old.site_log_id and l.status = 'DRAFT'
     ) then
    return old;
  end if;
  raise exception 'Daily Site Log lifecycle history is append-only' using errcode = '55000';
end;
$$;

create or replace function private.prevent_daily_site_log_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role') and old.status = 'DRAFT' then
    return old;
  end if;
  raise exception 'Daily Site Logs are preserved as formal field history' using errcode = '55000';
end;
$$;

drop trigger if exists engineering_daily_site_logs_no_delete on public.engineering_daily_site_logs;
create trigger engineering_daily_site_logs_no_delete
before delete on public.engineering_daily_site_logs
for each row execute function private.prevent_daily_site_log_delete();

drop trigger if exists engineering_daily_site_log_events_append_only on public.engineering_daily_site_log_events;
create trigger engineering_daily_site_log_events_append_only
before update or delete on public.engineering_daily_site_log_events
for each row execute function private.prevent_daily_site_log_history_mutation();

create or replace function private.validate_daily_site_log_addendum_reference()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.engineering_daily_site_logs l
    where l.id = new.site_log_id and l.company_id = new.company_id
  ) then
    raise exception 'Daily Site Log addendum is outside the company' using errcode = '42501';
  end if;
  if (select auth.uid()) is not null and new.created_by_user_id is distinct from (select auth.uid()) then
    raise exception 'Daily Site Log addendum actor must be the authenticated user' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.prevent_daily_site_log_addendum_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Daily Site Log addenda are append-only historical corrections' using errcode = '55000';
end;
$$;

drop trigger if exists engineering_daily_site_log_addenda_reference on public.engineering_daily_site_log_addenda;
create trigger engineering_daily_site_log_addenda_reference
before insert on public.engineering_daily_site_log_addenda
for each row execute function private.validate_daily_site_log_addendum_reference();

drop trigger if exists engineering_daily_site_log_addenda_append_only on public.engineering_daily_site_log_addenda;
create trigger engineering_daily_site_log_addenda_append_only
before update or delete on public.engineering_daily_site_log_addenda
for each row execute function private.prevent_daily_site_log_addendum_mutation();

-- All new lifecycle surfaces are authenticated-only, and direct client DELETE
-- is closed even when a stale tenant-policy catalog or role grant exists.
update private.company_tenant_policy_catalog
set allow_delete = false
where table_name in (
  'engineering_documents', 'engineering_document_revisions', 'drawing_annotations',
  'engineering_rfis', 'engineering_rfi_responses', 'engineering_rfi_document_links',
  'engineering_submittals', 'engineering_submittal_rounds', 'engineering_submittal_reviews', 'engineering_submittal_document_links',
  'engineering_daily_site_logs', 'engineering_daily_site_log_weather', 'engineering_daily_site_log_crew',
  'engineering_daily_site_log_equipment', 'engineering_daily_site_log_safety', 'engineering_daily_site_log_events',
  'engineering_daily_site_log_addenda'
);

revoke delete on table public.engineering_documents, public.engineering_document_revisions, public.drawing_annotations,
  public.engineering_rfis, public.engineering_rfi_responses, public.engineering_rfi_document_links,
  public.engineering_submittals, public.engineering_submittal_rounds, public.engineering_submittal_reviews,
  public.engineering_submittal_document_links, public.engineering_daily_site_logs,
  public.engineering_daily_site_log_weather, public.engineering_daily_site_log_crew,
  public.engineering_daily_site_log_equipment, public.engineering_daily_site_log_safety,
  public.engineering_daily_site_log_events
from anon, authenticated;

alter table public.engineering_daily_site_log_addenda enable row level security;
revoke all on table public.engineering_daily_site_log_addenda from public, anon, authenticated;
grant select on table public.engineering_daily_site_log_addenda to authenticated;
drop policy if exists engineering_daily_site_log_addenda_read on public.engineering_daily_site_log_addenda;
create policy engineering_daily_site_log_addenda_read on public.engineering_daily_site_log_addenda
for select to authenticated
using ((select private.has_company_permission(company_id, 'engineering.sitelogs.read')));

-- -------------------------------------------------------------------------
-- Bounded preflights
-- -------------------------------------------------------------------------

create or replace function private.engineering_document_lifecycle_preflight(
  p_document_id uuid,
  p_company_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_document public.engineering_documents;
  v_project_available boolean;
  v_revisions bigint := 0;
  v_annotations bigint := 0;
  v_rfi_links bigint := 0;
  v_submittal_links bigint := 0;
  v_storage_objects bigint := 0;
  v_audit_events bigint := 0;
  v_total bigint := 0;
  v_can_delete boolean;
  v_can_archive boolean;
  v_can_supersede boolean;
  v_recommended text;
  v_blocked_reason text;
begin
  select d.* into v_document
  from public.engineering_documents d
  where d.id = p_document_id and d.company_id = p_company_id;
  if not found then
    raise exception 'Engineering document does not exist in the deployment company' using errcode = '42501';
  end if;

  v_project_available := private.engineering_lifecycle_project_available(p_company_id, v_document.project_id);
  select count(*) into v_revisions from public.engineering_document_revisions r where r.company_id = p_company_id and r.document_id = p_document_id;
  select count(*) into v_annotations from public.drawing_annotations a where a.company_id = p_company_id and a.document_id = p_document_id;
  select count(*) into v_rfi_links from public.engineering_rfi_document_links l where l.company_id = p_company_id and l.document_id = p_document_id;
  select count(*) into v_submittal_links from public.engineering_submittal_document_links l where l.company_id = p_company_id and l.document_id = p_document_id;
  select count(*) into v_storage_objects
  from storage.objects o
  where o.bucket_id = 'engineering-documents'
    and o.name like format('companies/%s/documents/%s/%%', p_company_id, p_document_id);
  select count(*) into v_audit_events
  from public.company_audit_events e
  where e.company_id = p_company_id
    and e.target_id = p_document_id
    and lower(e.target_type) in ('engineering', 'engineering_document', 'document')
    and e.event_type not in ('ENGINEERING_DOCUMENT_CREATED', 'ENGINEERING_DOCUMENT_UPDATED');

  v_total := v_revisions + v_annotations + v_rfi_links + v_submittal_links + v_storage_objects + v_audit_events;
  v_can_delete := v_document.status = 'DRAFT' and v_project_available and v_total = 0;
  v_can_archive := v_project_available and v_document.status not in ('ARCHIVED', 'SUPERSEDED');
  v_can_supersede := v_project_available and v_document.status not in ('ARCHIVED', 'SUPERSEDED');
  v_recommended := case
    when v_can_delete then 'DELETE_UNUSED'
    when v_document.status = 'SUPERSEDED' then 'NONE'
    when v_document.status = 'ARCHIVED' then 'NONE'
    when v_total > 0 then 'ARCHIVE'
    else 'SUPERSEDE'
  end;
  v_blocked_reason := case
    when not v_project_available then 'The document belongs to an archived or unavailable project; historical records remain preserved.'
    when v_document.status <> 'DRAFT' then 'Only an unused DRAFT document shell can be permanently deleted. Revisions and historical records must remain preserved.'
    when v_total > 0 then 'This document has revisions, annotations, document links, Storage objects, or lifecycle history. Archive or supersede it instead of deleting its historical source.'
    else null
  end;

  return jsonb_build_object(
    'entityType', 'DOCUMENT', 'entityId', p_document_id, 'status', v_document.status,
    'projectId', v_document.project_id, 'archivedAt', v_document.archived_at, 'supersededAt', v_document.superseded_at,
    'canDelete', v_can_delete, 'canArchive', v_can_archive, 'canSupersede', v_can_supersede,
    'recommendedAction', v_recommended, 'blockedReason', v_blocked_reason,
    'totalDependencyCount', v_total,
    'dependencies', jsonb_build_object(
      'revisions', v_revisions, 'annotations', v_annotations, 'rfiLinks', v_rfi_links,
      'submittalLinks', v_submittal_links, 'storageObjects', v_storage_objects, 'auditEvents', v_audit_events
    )
  );
end;
$$;

create or replace function private.engineering_rfi_lifecycle_preflight(
  p_rfi_id uuid,
  p_company_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rfi public.engineering_rfis;
  v_project_available boolean;
  v_responses bigint := 0;
  v_document_links bigint := 0;
  v_audit_events bigint := 0;
  v_total bigint := 0;
  v_can_delete boolean;
  v_can_void boolean;
  v_can_correct boolean;
  v_recommended text;
  v_blocked_reason text;
begin
  select r.* into v_rfi from public.engineering_rfis r where r.id = p_rfi_id and r.company_id = p_company_id;
  if not found then raise exception 'RFI does not exist in the deployment company' using errcode = '42501'; end if;
  v_project_available := private.engineering_lifecycle_project_available(p_company_id, v_rfi.project_id);
  select count(*) into v_responses from public.engineering_rfi_responses r where r.company_id = p_company_id and r.rfi_id = p_rfi_id;
  select count(*) into v_document_links from public.engineering_rfi_document_links l where l.company_id = p_company_id and l.rfi_id = p_rfi_id;
  select count(*) into v_audit_events
  from public.company_audit_events e
  where e.company_id = p_company_id and e.target_id = p_rfi_id
    and lower(e.target_type) in ('engineering_rfi', 'rfi')
    and e.event_type not in ('ENGINEERING_RFI_CREATED');
  v_total := v_responses + v_document_links + v_audit_events;
  v_can_delete := v_rfi.status = 'DRAFT' and v_project_available and v_total = 0;
  v_can_void := v_rfi.status not in ('CLOSED', 'VOID') and v_project_available;
  v_can_correct := v_rfi.status in ('OPEN', 'ANSWERED') and v_project_available;
  v_recommended := case when v_can_delete then 'DELETE_UNUSED' when v_can_void then 'VOID' else 'NONE' end;
  v_blocked_reason := case
    when not v_project_available then 'The RFI belongs to an archived or unavailable project; formal history remains preserved.'
    when v_rfi.status <> 'DRAFT' then 'This RFI is already formal history. Use an append-only response correction or void it with a reason.'
    when v_total > 0 then 'This draft RFI has responses, revision links, or lifecycle history and cannot be permanently deleted.'
    else null
  end;
  return jsonb_build_object(
    'entityType', 'RFI', 'entityId', p_rfi_id, 'status', v_rfi.status, 'projectId', v_rfi.project_id,
    'canDelete', v_can_delete, 'canVoid', v_can_void, 'canCorrect', v_can_correct,
    'recommendedAction', v_recommended, 'blockedReason', v_blocked_reason, 'totalDependencyCount', v_total,
    'dependencies', jsonb_build_object('responses', v_responses, 'documentLinks', v_document_links, 'auditEvents', v_audit_events)
  );
end;
$$;

create or replace function private.engineering_submittal_lifecycle_preflight(
  p_submittal_id uuid,
  p_company_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_submittal public.engineering_submittals;
  v_project_available boolean;
  v_rounds bigint := 0;
  v_reviews bigint := 0;
  v_document_links bigint := 0;
  v_audit_events bigint := 0;
  v_extra_rounds bigint := 0;
  v_current_round_status text;
  v_total bigint := 0;
  v_can_delete boolean;
  v_can_void boolean;
  v_recommended text;
  v_blocked_reason text;
begin
  select s.* into v_submittal from public.engineering_submittals s where s.id = p_submittal_id and s.company_id = p_company_id;
  if not found then raise exception 'Technical submittal does not exist in the deployment company' using errcode = '42501'; end if;
  v_project_available := private.engineering_lifecycle_project_available(p_company_id, v_submittal.project_id);
  select count(*) into v_rounds from public.engineering_submittal_rounds r where r.company_id = p_company_id and r.submittal_id = p_submittal_id;
  select count(*) into v_reviews from public.engineering_submittal_reviews r where r.company_id = p_company_id and r.submittal_id = p_submittal_id;
  select count(*) into v_document_links from public.engineering_submittal_document_links l where l.company_id = p_company_id and l.submittal_id = p_submittal_id;
  select count(*) into v_audit_events
  from public.company_audit_events e
  where e.company_id = p_company_id and e.target_id = p_submittal_id
    and lower(e.target_type) in ('engineering_submittal', 'submittal')
    and e.event_type not in ('ENGINEERING_SUBMITTAL_CREATED');
  select r.status into v_current_round_status
  from public.engineering_submittal_rounds r
  where r.company_id = p_company_id and r.submittal_id = p_submittal_id and r.round_number = v_submittal.current_round;
  v_extra_rounds := greatest(v_rounds - 1, 0);
  v_total := v_reviews + v_document_links + v_audit_events + v_extra_rounds;
  v_can_delete := v_submittal.status = 'DRAFT' and v_project_available and v_rounds = 1 and v_current_round_status = 'DRAFT' and v_total = 0;
  v_can_void := v_submittal.status not in ('CLOSED', 'VOID') and v_project_available;
  v_recommended := case when v_can_delete then 'DELETE_UNUSED' when v_can_void then 'VOID' else 'NONE' end;
  v_blocked_reason := case
    when not v_project_available then 'The submittal belongs to an archived or unavailable project; rounds and review history remain preserved.'
    when v_submittal.status <> 'DRAFT' then 'Submitted, reviewed, closed, or void submittals cannot be permanently deleted. Preserve their rounds and decisions.'
    when v_rounds <> 1 or v_current_round_status is distinct from 'DRAFT' then 'The initial draft round is no longer disposable.'
    when v_total > 0 then 'This submittal has review decisions, revision links, additional rounds, or lifecycle history and cannot be permanently deleted.'
    else null
  end;
  return jsonb_build_object(
    'entityType', 'SUBMITTAL', 'entityId', p_submittal_id, 'status', v_submittal.status, 'projectId', v_submittal.project_id,
    'currentRound', v_submittal.current_round, 'currentRoundStatus', v_current_round_status,
    'canDelete', v_can_delete, 'canVoid', v_can_void, 'recommendedAction', v_recommended,
    'blockedReason', v_blocked_reason, 'totalDependencyCount', v_total,
    'dependencies', jsonb_build_object('rounds', v_rounds, 'reviews', v_reviews, 'documentLinks', v_document_links, 'additionalRounds', v_extra_rounds, 'auditEvents', v_audit_events)
  );
end;
$$;

create or replace function private.engineering_daily_site_log_lifecycle_preflight(
  p_site_log_id uuid,
  p_company_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_log public.engineering_daily_site_logs;
  v_project_available boolean;
  v_weather bigint := 0;
  v_crew bigint := 0;
  v_equipment bigint := 0;
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
  select count(*) into v_safety from public.engineering_daily_site_log_safety s where s.company_id = p_company_id and s.site_log_id = p_site_log_id;
  select count(*), count(*) filter (where event_type in ('SUBMITTED', 'FINALIZED', 'VOIDED')) into v_events, v_formal_events
  from public.engineering_daily_site_log_events e where e.company_id = p_company_id and e.site_log_id = p_site_log_id;
  select count(*) into v_addenda from public.engineering_daily_site_log_addenda a where a.company_id = p_company_id and a.site_log_id = p_site_log_id;
  v_draft_observations := v_weather + v_crew + v_equipment + v_safety;
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
    'dependencies', jsonb_build_object('weather', v_weather, 'crew', v_crew, 'equipment', v_equipment, 'safety', v_safety, 'events', v_events, 'formalEvents', v_formal_events, 'draftObservations', v_draft_observations, 'narrativeFields', v_narrative_fields, 'addenda', v_addenda)
  );
end;
$$;

create or replace function private.engineering_document_lifecycle_preflight_authorized(p_document_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid := (select private.deployment_company_id());
begin perform private.engineering_lifecycle_actor(v_company_id, 'engineering.documents.read', 'engineering document'); return private.engineering_document_lifecycle_preflight(p_document_id, v_company_id); end;
$$;

create or replace function private.engineering_rfi_lifecycle_preflight_authorized(p_rfi_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid := (select private.deployment_company_id());
begin perform private.engineering_lifecycle_actor(v_company_id, 'engineering.rfis.read', 'RFI'); return private.engineering_rfi_lifecycle_preflight(p_rfi_id, v_company_id); end;
$$;

create or replace function private.engineering_submittal_lifecycle_preflight_authorized(p_submittal_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid := (select private.deployment_company_id());
begin perform private.engineering_lifecycle_actor(v_company_id, 'engineering.submittals.read', 'technical submittal'); return private.engineering_submittal_lifecycle_preflight(p_submittal_id, v_company_id); end;
$$;

create or replace function private.engineering_daily_site_log_lifecycle_preflight_authorized(p_site_log_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_company_id uuid := (select private.deployment_company_id());
begin perform private.engineering_lifecycle_actor(v_company_id, 'engineering.sitelogs.read', 'Daily Site Log'); return private.engineering_daily_site_log_lifecycle_preflight(p_site_log_id, v_company_id); end;
$$;

-- -------------------------------------------------------------------------
-- Public preview and guarded mutation RPCs
-- -------------------------------------------------------------------------

create or replace function public.preview_engineering_document_lifecycle(p_document_id uuid)
returns jsonb language sql security definer set search_path = '' as $$ select private.engineering_document_lifecycle_preflight_authorized(p_document_id); $$;

create or replace function public.preview_engineering_rfi_lifecycle(p_rfi_id uuid)
returns jsonb language sql security definer set search_path = '' as $$ select private.engineering_rfi_lifecycle_preflight_authorized(p_rfi_id); $$;

create or replace function public.preview_engineering_submittal_lifecycle(p_submittal_id uuid)
returns jsonb language sql security definer set search_path = '' as $$ select private.engineering_submittal_lifecycle_preflight_authorized(p_submittal_id); $$;

create or replace function public.preview_engineering_daily_site_log_lifecycle(p_site_log_id uuid)
returns jsonb language sql security definer set search_path = '' as $$ select private.engineering_daily_site_log_lifecycle_preflight_authorized(p_site_log_id); $$;

create or replace function public.apply_engineering_document_lifecycle(
  p_document_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_company_id uuid := (select private.deployment_company_id());
  v_document public.engineering_documents;
  v_preflight jsonb;
  v_before jsonb;
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 1000), '');
begin
  v_actor := private.engineering_lifecycle_actor(v_company_id, 'engineering.documents.manage', 'engineering document');
  if v_action not in ('DELETE_UNUSED', 'ARCHIVE', 'SUPERSEDE') then raise exception 'Engineering document lifecycle action is invalid' using errcode = '22023'; end if;
  select d.* into v_document from public.engineering_documents d where d.id = p_document_id and d.company_id = v_company_id for update;
  if not found then raise exception 'Engineering document does not exist in the deployment company' using errcode = '42501'; end if;
  v_preflight := private.engineering_document_lifecycle_preflight(p_document_id, v_company_id);
  v_before := to_jsonb(v_document);

  if v_action = 'DELETE_UNUSED' then
    if coalesce((v_preflight ->> 'canDelete')::boolean, false) is not true then raise exception '%', coalesce(v_preflight ->> 'blockedReason', 'This engineering document cannot be permanently deleted.') using errcode = '42501'; end if;
    perform private.write_company_audit(v_company_id, 'ENGINEERING_DOCUMENT_DELETED_UNUSED', 'engineering_document', p_document_id,
      jsonb_build_object('action', v_action, 'reason', coalesce(v_reason, 'Confirmed unused engineering document deletion'), 'preflight', v_preflight, 'recordBeforeDelete', v_before));
    delete from public.engineering_documents where id = p_document_id and company_id = v_company_id;
    return jsonb_build_object('entityType', 'DOCUMENT', 'entityId', p_document_id, 'action', v_action, 'deleted', true, 'changed', true, 'preflight', v_preflight);
  end if;

  if v_reason is null or length(btrim(v_reason)) < 3 then raise exception 'A reason of at least 3 characters is required for this engineering document lifecycle action' using errcode = '22023'; end if;
  if v_action = 'ARCHIVE' then
    if coalesce((v_preflight ->> 'canArchive')::boolean, false) is not true then raise exception '%', coalesce(v_preflight ->> 'blockedReason', 'This engineering document cannot be archived.') using errcode = '42501'; end if;
    update public.engineering_documents set status = 'ARCHIVED', archived_at = coalesce(archived_at, now()), lifecycle_reason = v_reason, lifecycle_actor_user_id = v_actor, updated_at = now() where id = p_document_id and company_id = v_company_id returning * into v_document;
  else
    if coalesce((v_preflight ->> 'canSupersede')::boolean, false) is not true then raise exception '%', coalesce(v_preflight ->> 'blockedReason', 'This engineering document cannot be superseded.') using errcode = '42501'; end if;
    update public.engineering_documents set status = 'SUPERSEDED', superseded_at = coalesce(superseded_at, now()), superseded_by_user_id = v_actor, lifecycle_reason = v_reason, lifecycle_actor_user_id = v_actor, updated_at = now() where id = p_document_id and company_id = v_company_id returning * into v_document;
  end if;
  return jsonb_build_object('entityType', 'DOCUMENT', 'entityId', p_document_id, 'action', v_action, 'deleted', false, 'changed', true, 'preflight', v_preflight, 'record', to_jsonb(v_document));
end;
$$;

create or replace function public.apply_engineering_rfi_lifecycle(
  p_rfi_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_company_id uuid := (select private.deployment_company_id()); v_rfi public.engineering_rfis; v_preflight jsonb; v_before jsonb;
  v_action text := upper(btrim(coalesce(p_action, ''))); v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 1000), '');
begin
  v_actor := private.engineering_lifecycle_actor(v_company_id, 'engineering.rfis.manage', 'RFI');
  if v_action not in ('DELETE_UNUSED', 'VOID') then raise exception 'RFI lifecycle action is invalid' using errcode = '22023'; end if;
  select r.* into v_rfi from public.engineering_rfis r where r.id = p_rfi_id and r.company_id = v_company_id for update;
  if not found then raise exception 'RFI does not exist in the deployment company' using errcode = '42501'; end if;
  v_preflight := private.engineering_rfi_lifecycle_preflight(p_rfi_id, v_company_id); v_before := to_jsonb(v_rfi);
  if v_action = 'DELETE_UNUSED' then
    if coalesce((v_preflight ->> 'canDelete')::boolean, false) is not true then raise exception '%', coalesce(v_preflight ->> 'blockedReason', 'This RFI cannot be permanently deleted.') using errcode = '42501'; end if;
    perform private.write_company_audit(v_company_id, 'ENGINEERING_RFI_DELETED_UNUSED', 'engineering_rfi', p_rfi_id, jsonb_build_object('action', v_action, 'reason', coalesce(v_reason, 'Confirmed unused RFI deletion'), 'preflight', v_preflight, 'recordBeforeDelete', v_before));
    delete from public.engineering_rfis where id = p_rfi_id and company_id = v_company_id;
    return jsonb_build_object('entityType', 'RFI', 'entityId', p_rfi_id, 'action', v_action, 'deleted', true, 'changed', true, 'preflight', v_preflight);
  end if;
  if coalesce((v_preflight ->> 'canVoid')::boolean, false) is not true then raise exception '%', coalesce(v_preflight ->> 'blockedReason', 'This RFI cannot be voided.') using errcode = '42501'; end if;
  if v_reason is null or length(btrim(v_reason)) < 3 then raise exception 'A reason of at least 3 characters is required to void an RFI' using errcode = '22023'; end if;
  update public.engineering_rfis set status = 'VOID', voided_at = now(), close_void_reason = v_reason, updated_at = now() where id = p_rfi_id and company_id = v_company_id returning * into v_rfi;
  perform private.write_company_audit(v_company_id, 'ENGINEERING_RFI_VOIDED', 'engineering_rfi', p_rfi_id, jsonb_build_object('action', v_action, 'reason', v_reason, 'preflight', v_preflight, 'recordBeforeVoid', v_before));
  return jsonb_build_object('entityType', 'RFI', 'entityId', p_rfi_id, 'action', v_action, 'deleted', false, 'changed', true, 'preflight', v_preflight, 'record', to_jsonb(v_rfi));
end;
$$;

create or replace function public.apply_engineering_submittal_lifecycle(
  p_submittal_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_company_id uuid := (select private.deployment_company_id()); v_submittal public.engineering_submittals; v_preflight jsonb; v_before jsonb;
  v_action text := upper(btrim(coalesce(p_action, ''))); v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 1000), '');
begin
  v_actor := private.engineering_lifecycle_actor(v_company_id, 'engineering.submittals.manage', 'technical submittal');
  if v_action not in ('DELETE_UNUSED', 'VOID') then raise exception 'Technical submittal lifecycle action is invalid' using errcode = '22023'; end if;
  select s.* into v_submittal from public.engineering_submittals s where s.id = p_submittal_id and s.company_id = v_company_id for update;
  if not found then raise exception 'Technical submittal does not exist in the deployment company' using errcode = '42501'; end if;
  v_preflight := private.engineering_submittal_lifecycle_preflight(p_submittal_id, v_company_id); v_before := to_jsonb(v_submittal);
  if v_action = 'DELETE_UNUSED' then
    if coalesce((v_preflight ->> 'canDelete')::boolean, false) is not true then raise exception '%', coalesce(v_preflight ->> 'blockedReason', 'This technical submittal cannot be permanently deleted.') using errcode = '42501'; end if;
    perform private.write_company_audit(v_company_id, 'ENGINEERING_SUBMITTAL_DELETED_UNUSED', 'engineering_submittal', p_submittal_id, jsonb_build_object('action', v_action, 'reason', coalesce(v_reason, 'Confirmed unused technical submittal deletion'), 'preflight', v_preflight, 'recordBeforeDelete', v_before));
    delete from public.engineering_submittal_rounds where submittal_id = p_submittal_id and company_id = v_company_id;
    delete from public.engineering_submittals where id = p_submittal_id and company_id = v_company_id;
    return jsonb_build_object('entityType', 'SUBMITTAL', 'entityId', p_submittal_id, 'action', v_action, 'deleted', true, 'changed', true, 'preflight', v_preflight);
  end if;
  if coalesce((v_preflight ->> 'canVoid')::boolean, false) is not true then raise exception '%', coalesce(v_preflight ->> 'blockedReason', 'This technical submittal cannot be voided.') using errcode = '42501'; end if;
  if v_reason is null or length(btrim(v_reason)) < 3 then raise exception 'A reason of at least 3 characters is required to void a technical submittal' using errcode = '22023'; end if;
  update public.engineering_submittals set status = 'VOID', voided_at = now(), close_void_reason = v_reason, updated_at = now() where id = p_submittal_id and company_id = v_company_id returning * into v_submittal;
  update public.engineering_submittal_rounds set status = 'VOID', completed_at = coalesce(completed_at, now()), updated_at = now() where submittal_id = p_submittal_id and company_id = v_company_id and status in ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW');
  perform private.write_company_audit(v_company_id, 'ENGINEERING_SUBMITTAL_VOIDED', 'engineering_submittal', p_submittal_id, jsonb_build_object('action', v_action, 'reason', v_reason, 'preflight', v_preflight, 'recordBeforeVoid', v_before));
  return jsonb_build_object('entityType', 'SUBMITTAL', 'entityId', p_submittal_id, 'action', v_action, 'deleted', false, 'changed', true, 'preflight', v_preflight, 'record', to_jsonb(v_submittal));
end;
$$;

create or replace function public.apply_engineering_daily_site_log_lifecycle(
  p_site_log_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_company_id uuid := (select private.deployment_company_id()); v_log public.engineering_daily_site_logs; v_preflight jsonb; v_before jsonb;
  v_action text := upper(btrim(coalesce(p_action, ''))); v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 1000), '');
begin
  v_actor := private.engineering_lifecycle_actor(v_company_id, 'engineering.sitelogs.manage', 'Daily Site Log');
  if v_action not in ('DELETE_UNUSED', 'VOID') then raise exception 'Daily Site Log lifecycle action is invalid' using errcode = '22023'; end if;
  select l.* into v_log from public.engineering_daily_site_logs l where l.id = p_site_log_id and l.company_id = v_company_id for update;
  if not found then raise exception 'Daily Site Log does not exist in the deployment company' using errcode = '42501'; end if;
  v_preflight := private.engineering_daily_site_log_lifecycle_preflight(p_site_log_id, v_company_id); v_before := to_jsonb(v_log);
  if v_action = 'DELETE_UNUSED' then
    if coalesce((v_preflight ->> 'canDelete')::boolean, false) is not true then raise exception '%', coalesce(v_preflight ->> 'blockedReason', 'This Daily Site Log cannot be permanently deleted.') using errcode = '42501'; end if;
    perform private.write_company_audit(v_company_id, 'ENGINEERING_DAILY_SITE_LOG_DELETED_UNUSED', 'engineering_daily_site_log', p_site_log_id, jsonb_build_object('action', v_action, 'reason', coalesce(v_reason, 'Confirmed unused Daily Site Log deletion'), 'preflight', v_preflight, 'recordBeforeDelete', v_before));
    delete from public.engineering_daily_site_log_weather where site_log_id = p_site_log_id and company_id = v_company_id;
    delete from public.engineering_daily_site_log_crew where site_log_id = p_site_log_id and company_id = v_company_id;
    delete from public.engineering_daily_site_log_equipment where site_log_id = p_site_log_id and company_id = v_company_id;
    delete from public.engineering_daily_site_log_safety where site_log_id = p_site_log_id and company_id = v_company_id;
    delete from public.engineering_daily_site_log_events where site_log_id = p_site_log_id and company_id = v_company_id;
    delete from public.engineering_daily_site_logs where id = p_site_log_id and company_id = v_company_id;
    return jsonb_build_object('entityType', 'SITE_LOG', 'entityId', p_site_log_id, 'action', v_action, 'deleted', true, 'changed', true, 'preflight', v_preflight);
  end if;
  if coalesce((v_preflight ->> 'canVoid')::boolean, false) is not true then raise exception '%', coalesce(v_preflight ->> 'blockedReason', 'This Daily Site Log cannot be voided.') using errcode = '42501'; end if;
  if v_reason is null or length(btrim(v_reason)) < 3 then raise exception 'A reason of at least 3 characters is required to void a Daily Site Log' using errcode = '22023'; end if;
  update public.engineering_daily_site_logs set status = 'VOID', voided_at = now(), voided_by_user_id = v_actor, void_reason = v_reason, updated_at = now() where id = p_site_log_id and company_id = v_company_id returning * into v_log;
  perform private.record_daily_site_log_event(v_company_id, p_site_log_id, 'VOIDED', v_preflight ->> 'status', 'VOID', v_actor, v_reason);
  perform private.write_company_audit(v_company_id, 'ENGINEERING_DAILY_SITE_LOG_VOIDED', 'engineering_daily_site_log', p_site_log_id, jsonb_build_object('action', v_action, 'reason', v_reason, 'preflight', v_preflight, 'recordBeforeVoid', v_before));
  return jsonb_build_object('entityType', 'SITE_LOG', 'entityId', p_site_log_id, 'action', v_action, 'deleted', false, 'changed', true, 'preflight', v_preflight, 'record', to_jsonb(v_log));
end;
$$;

create or replace function public.create_engineering_daily_site_log_addendum(
  p_site_log_id uuid,
  p_reason text,
  p_correction_text text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid; v_company_id uuid := (select private.deployment_company_id()); v_log public.engineering_daily_site_logs; v_addendum public.engineering_daily_site_log_addenda; v_number integer;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 1000), ''); v_text text := nullif(left(btrim(coalesce(p_correction_text, '')), 8000), '');
begin
  v_actor := private.engineering_lifecycle_actor(v_company_id, 'engineering.sitelogs.manage', 'Daily Site Log');
  if v_reason is null or length(btrim(v_reason)) < 3 then raise exception 'A reason of at least 3 characters is required for a Daily Site Log addendum' using errcode = '22023'; end if;
  if v_text is null then raise exception 'Correction or addendum text is required' using errcode = '22023'; end if;
  select l.* into v_log from public.engineering_daily_site_logs l where l.id = p_site_log_id and l.company_id = v_company_id for update;
  if not found then raise exception 'Daily Site Log does not exist in the deployment company' using errcode = '42501'; end if;
  if v_log.status <> 'FINALIZED' then raise exception 'Addenda are available only for FINALIZED Daily Site Logs' using errcode = '55000'; end if;
  if not private.engineering_lifecycle_project_available(v_company_id, v_log.project_id) then raise exception 'The Daily Site Log project is archived or unavailable' using errcode = '42501'; end if;
  select coalesce(max(a.addendum_number), 0) + 1 into v_number from public.engineering_daily_site_log_addenda a where a.company_id = v_company_id and a.site_log_id = p_site_log_id;
  insert into public.engineering_daily_site_log_addenda(company_id, site_log_id, addendum_number, reason, correction_text, created_by_user_id)
  values (v_company_id, p_site_log_id, v_number, v_reason, v_text, v_actor) returning * into v_addendum;
  perform private.write_company_audit(v_company_id, 'ENGINEERING_DAILY_SITE_LOG_ADDENDUM', 'engineering_daily_site_log', p_site_log_id,
    jsonb_build_object('addendumId', v_addendum.id, 'addendumNumber', v_number, 'reason', v_reason));
  return to_jsonb(v_addendum);
end;
$$;

-- Preserve the Phase 1B/1C function names for older callers, but route their
-- VOID operations through the same deployment-derived Wave 2C boundary.
create or replace function public.void_engineering_rfi(p_company_id uuid, p_rfi_id uuid, p_reason text)
returns jsonb language sql security definer set search_path = '' as $$
  select public.apply_engineering_rfi_lifecycle(p_rfi_id, 'VOID', p_reason);
$$;

create or replace function public.void_engineering_submittal(p_company_id uuid, p_submittal_id uuid, p_reason text)
returns jsonb language sql security definer set search_path = '' as $$
  select public.apply_engineering_submittal_lifecycle(p_submittal_id, 'VOID', p_reason);
$$;

create or replace function public.void_engineering_daily_site_log(p_company_id uuid, p_daily_site_log_id uuid, p_reason text)
returns jsonb language sql security definer set search_path = '' as $$
  select public.apply_engineering_daily_site_log_lifecycle(p_daily_site_log_id, 'VOID', p_reason);
$$;

-- Explicitly revoke internal helpers, then grant only the bounded public
-- lifecycle functions to authenticated callers.
revoke all on function private.engineering_lifecycle_actor(uuid, text, text) from public, anon, authenticated;
revoke all on function private.engineering_lifecycle_project_available(uuid, uuid) from public, anon, authenticated;
revoke all on function private.guard_engineering_document_lifecycle() from public, anon, authenticated;
revoke all on function private.prevent_engineering_document_delete() from public, anon, authenticated;
revoke all on function private.guard_engineering_revision_parent_lifecycle() from public, anon, authenticated;
revoke all on function private.prevent_coordination_history_mutation() from public, anon, authenticated;
revoke all on function private.prevent_engineering_coordination_parent_delete() from public, anon, authenticated;
revoke all on function private.guard_engineering_coordination_lifecycle() from public, anon, authenticated;
revoke all on function private.engineering_document_lifecycle_preflight(uuid, uuid) from public, anon, authenticated;
revoke all on function private.engineering_rfi_lifecycle_preflight(uuid, uuid) from public, anon, authenticated;
revoke all on function private.engineering_submittal_lifecycle_preflight(uuid, uuid) from public, anon, authenticated;
revoke all on function private.engineering_daily_site_log_lifecycle_preflight(uuid, uuid) from public, anon, authenticated;
revoke all on function private.engineering_document_lifecycle_preflight_authorized(uuid) from public, anon, authenticated;
revoke all on function private.engineering_rfi_lifecycle_preflight_authorized(uuid) from public, anon, authenticated;
revoke all on function private.engineering_submittal_lifecycle_preflight_authorized(uuid) from public, anon, authenticated;
revoke all on function private.engineering_daily_site_log_lifecycle_preflight_authorized(uuid) from public, anon, authenticated;
revoke all on function private.validate_daily_site_log_addendum_reference() from public, anon, authenticated;
revoke all on function private.prevent_daily_site_log_addendum_mutation() from public, anon, authenticated;

revoke all on function public.preview_engineering_document_lifecycle(uuid) from public, anon;
revoke all on function public.preview_engineering_rfi_lifecycle(uuid) from public, anon;
revoke all on function public.preview_engineering_submittal_lifecycle(uuid) from public, anon;
revoke all on function public.preview_engineering_daily_site_log_lifecycle(uuid) from public, anon;
revoke all on function public.apply_engineering_document_lifecycle(uuid, text, text) from public, anon;
revoke all on function public.apply_engineering_rfi_lifecycle(uuid, text, text) from public, anon;
revoke all on function public.apply_engineering_submittal_lifecycle(uuid, text, text) from public, anon;
revoke all on function public.apply_engineering_daily_site_log_lifecycle(uuid, text, text) from public, anon;
revoke all on function public.create_engineering_daily_site_log_addendum(uuid, text, text) from public, anon;
grant execute on function public.preview_engineering_document_lifecycle(uuid) to authenticated;
grant execute on function public.preview_engineering_rfi_lifecycle(uuid) to authenticated;
grant execute on function public.preview_engineering_submittal_lifecycle(uuid) to authenticated;
grant execute on function public.preview_engineering_daily_site_log_lifecycle(uuid) to authenticated;
grant execute on function public.apply_engineering_document_lifecycle(uuid, text, text) to authenticated;
grant execute on function public.apply_engineering_rfi_lifecycle(uuid, text, text) to authenticated;
grant execute on function public.apply_engineering_submittal_lifecycle(uuid, text, text) to authenticated;
grant execute on function public.apply_engineering_daily_site_log_lifecycle(uuid, text, text) to authenticated;
grant execute on function public.create_engineering_daily_site_log_addendum(uuid, text, text) to authenticated;

-- Addenda are useful in the realtime engineering workspace, while the source
-- document/revision and formal coordination histories remain unchanged.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables)
     and not exists (
       select 1 from pg_publication p
       join pg_publication_rel pr on pr.prpubid = p.oid
       join pg_class c on c.oid = pr.prrelid
       join pg_namespace n on n.oid = c.relnamespace
       where p.pubname = 'supabase_realtime' and n.nspname = 'public' and c.relname = 'engineering_daily_site_log_addenda'
     ) then
    alter publication supabase_realtime add table public.engineering_daily_site_log_addenda;
  end if;
end $$;
