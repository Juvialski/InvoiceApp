-- Engoryx Core Hardening Wave 2B2: invoice and expense correction semantics.
--
-- This migration keeps visibility organization (archive) separate from
-- financial correction (void), closes direct table bypasses, and exposes
-- locked database preflight/mutation paths. Cash settlement reversal remains
-- explicitly deferred to Wave 2B3.

alter table public.invoices
  add column if not exists lifecycle_status text not null default 'ACTIVE';
alter table public.invoices
  add column if not exists voided_at timestamptz;
alter table public.invoices
  add column if not exists voided_by_user_id uuid references auth.users(id) on delete restrict;
alter table public.invoices
  add column if not exists void_reason text;

alter table public.invoices
  drop constraint if exists invoices_lifecycle_status_check;
alter table public.invoices
  add constraint invoices_lifecycle_status_check
  check (lifecycle_status in ('ACTIVE', 'VOID'));
alter table public.invoices
  drop constraint if exists invoices_void_metadata_check;
alter table public.invoices
  add constraint invoices_void_metadata_check
  check (
    (lifecycle_status = 'ACTIVE'
      and voided_at is null
      and voided_by_user_id is null
      and void_reason is null)
    or (lifecycle_status = 'VOID'
      and voided_at is not null
      and voided_by_user_id is not null
      and void_reason is not null
      and length(btrim(void_reason)) between 3 and 500)
  );

alter table public.expenses
  add column if not exists voided_at timestamptz;
alter table public.expenses
  add column if not exists voided_by_user_id uuid references auth.users(id) on delete restrict;
alter table public.expenses
  add column if not exists void_reason text;

-- Existing VOID expense rows predate the explicit correction metadata. Keep
-- them visible and preserve their creator as the best available historical
-- actor without inventing a new financial event.
update public.expenses
set voided_at = coalesce(voided_at, updated_at, created_at, now()),
    voided_by_user_id = coalesce(voided_by_user_id, user_id),
    void_reason = coalesce(void_reason, 'Pre-existing VOID status')
where status = 'VOID';

alter table public.expenses
  drop constraint if exists expenses_void_metadata_check;
alter table public.expenses
  add constraint expenses_void_metadata_check
  check (
    (status <> 'VOID'
      and voided_at is null
      and voided_by_user_id is null
      and void_reason is null)
    or (status = 'VOID'
      and voided_at is not null
      and voided_by_user_id is not null
      and void_reason is not null
      and length(btrim(void_reason)) between 3 and 500)
  );

create index if not exists invoices_company_lifecycle_idx
  on public.invoices(company_id, lifecycle_status, archived_at, review_status);
create index if not exists expenses_company_lifecycle_idx
  on public.expenses(company_id, status, archived_at);
create index if not exists project_accounting_events_company_entity_idx
  on public.project_accounting_events(company_id, entity_type, entity_id);

-- Keep the append-only company audit allowlist a strict superset of every
-- event accepted by the current main branch, then add this wave's events.
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
    'PROJECT_DELETED_UNUSED', 'PROJECT_ARCHIVED', 'PROJECT_REACTIVATED',
    'INVOICE_DELETED_UNUSED', 'INVOICE_VOIDED', 'INVOICE_ARCHIVED', 'INVOICE_RESTORED',
    'EXPENSE_DELETED_UNUSED', 'EXPENSE_VOIDED', 'EXPENSE_ARCHIVED', 'EXPENSE_RESTORED'
  ));

-- Both entities retain ordinary company-scoped reads/updates, but direct
-- DELETE is closed. Permanent deletion is available only through the guarded
-- unused-record RPC below.
update private.company_tenant_policy_catalog
set allow_delete = false
where table_name in ('invoices', 'expenses');

drop policy if exists invoices_company_delete on public.invoices;
drop policy if exists invoices_delete_own on public.invoices;
drop policy if exists expenses_company_delete on public.expenses;
drop policy if exists expenses_delete_own on public.expenses;
revoke delete on table public.invoices, public.expenses from anon, authenticated;

create or replace function private.require_financial_correction_permission(
  p_company_id uuid,
  p_permission_key text,
  p_entity_label text
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
    raise exception 'The current user is not authorized to correct this %', coalesce(p_entity_label, 'financial record')
      using errcode = '42501';
  end if;
end;
$$;

revoke execute on function private.require_financial_correction_permission(uuid, text, text) from public, anon, authenticated;

create or replace function private.invoice_correction_preflight(
  p_invoice_id uuid,
  p_company_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
  v_line_items bigint := 0;
  v_extractions bigint := 0;
  v_review_events bigint := 0;
  v_project_allocations bigint := 0;
  v_settlement_matches bigint := 0;
  v_confirmed_settlements bigint := 0;
  v_project_accounting_events bigint := 0;
  v_source_document bigint := 0;
  v_source_email bigint := 0;
  v_duplicate_references bigint := 0;
  v_company_audit_events bigint := 0;
  v_total bigint := 0;
  v_amount_paid numeric := 0;
  v_payment_status text;
  v_can_delete boolean;
  v_can_void boolean;
  v_can_archive boolean;
  v_can_restore boolean;
  v_recommended_action text;
  v_blocked_reason text;
begin
  select i.*
    into v_invoice
  from public.invoices i
  where i.id = p_invoice_id
    and i.company_id = p_company_id;

  if not found then
    raise exception 'Invoice does not exist in the deployment company'
      using errcode = '42501';
  end if;

  select count(*) into v_line_items
  from public.invoice_line_items l
  where l.company_id = p_company_id and l.invoice_id = p_invoice_id;

  select count(*) into v_extractions
  from public.invoice_extractions e
  where e.company_id = p_company_id and e.invoice_id = p_invoice_id;

  select count(*) into v_review_events
  from public.invoice_review_events e
  where e.company_id = p_company_id and e.invoice_id = p_invoice_id;

  select count(*) into v_project_allocations
  from public.invoice_project_allocations a
  where a.company_id = p_company_id and a.invoice_id = p_invoice_id;

  select count(*), count(*) filter (where m.status = 'CONFIRMED')
    into v_settlement_matches, v_confirmed_settlements
  from public.financial_transaction_matches m
  where m.company_id = p_company_id
    and m.target_type = 'INVOICE'
    and m.target_id = p_invoice_id;

  select count(*) into v_project_accounting_events
  from public.project_accounting_events e
  where e.company_id = p_company_id
    and upper(e.entity_type) = 'INVOICE'
    and e.entity_id = p_invoice_id;

  v_source_document := case when v_invoice.source_document_id is null then 0 else 1 end;
  v_source_email := case when v_invoice.source_email_id is null then 0 else 1 end;

  select count(*) + case when v_invoice.duplicate_of_id is null then 0 else 1 end into v_duplicate_references
  from public.invoices i
  where i.company_id = p_company_id
    and i.duplicate_of_id = p_invoice_id;

  select count(*) into v_company_audit_events
  from public.company_audit_events e
  where e.company_id = p_company_id
    and e.target_id = p_invoice_id
    and lower(e.target_type) in ('invoice', 'invoices');

  v_payment_status := upper(coalesce(nullif(btrim(v_invoice.payment_status), ''), v_invoice.current_data ->> 'status', 'UNPAID'));
  if coalesce(v_invoice.current_data ->> 'amountPaid', '') ~ '^[-+]?[0-9]+([.][0-9]+)?$' then
    v_amount_paid := greatest(0, (v_invoice.current_data ->> 'amountPaid')::numeric);
  end if;

  v_total := v_line_items + v_extractions + v_review_events + v_project_allocations
    + v_settlement_matches + v_project_accounting_events + v_source_document
    + v_source_email + v_duplicate_references + v_company_audit_events;
  v_can_delete := v_invoice.lifecycle_status = 'ACTIVE'
    and v_invoice.review_status <> 'VERIFIED'
    and v_payment_status not in ('PAID', 'PARTIALLY_PAID')
    and v_amount_paid <= 0
    and v_total = 0;
  v_can_void := v_invoice.lifecycle_status = 'ACTIVE' and v_confirmed_settlements = 0;
  v_can_archive := v_invoice.archived_at is null;
  v_can_restore := v_invoice.archived_at is not null;

  v_recommended_action := case
    when v_can_delete then 'DELETE_UNUSED'
    when v_invoice.lifecycle_status = 'VOID' and v_can_restore then 'RESTORE'
    when v_invoice.lifecycle_status = 'VOID' then 'NONE'
    when v_can_void and (
      v_invoice.review_status = 'VERIFIED'
      or v_total > 0
      or v_payment_status in ('PAID', 'PARTIALLY_PAID')
      or v_amount_paid > 0
    ) then 'VOID'
    when v_can_archive then 'ARCHIVE'
    when v_can_restore then 'RESTORE'
    else 'NONE'
  end;

  v_blocked_reason := case
    when v_confirmed_settlements > 0 then format(
      'This invoice has %s confirmed settlement record%s. Do not void or delete it until the settlement evidence is corrected through the deferred Wave 2B3 cash workflow.',
      v_confirmed_settlements,
      case when v_confirmed_settlements = 1 then '' else 's' end
    )
    when v_invoice.lifecycle_status = 'VOID' then 'This invoice is already void. Its original values, extraction snapshots, allocations, and review history remain preserved.'
    when v_invoice.review_status = 'VERIFIED' then 'Verified invoices cannot be permanently deleted. Void the invoice with a reason, or archive it for visibility organization.'
    when v_payment_status in ('PAID', 'PARTIALLY_PAID') or v_amount_paid > 0 then 'This invoice contains payment evidence and cannot be permanently deleted. Archive it or void it with a reason.'
    when v_total > 0 then 'Dependent or auditable invoice history exists, so permanent deletion is unavailable. Archive it or void it with a reason.'
    when v_can_restore then 'This invoice is archived. Restore visibility to return it to the active invoice directory.'
    else null
  end;

  return jsonb_build_object(
    'entityType', 'INVOICE',
    'entityId', p_invoice_id,
    'status', v_payment_status,
    'paymentStatus', v_payment_status,
    'reviewStatus', v_invoice.review_status,
    'lifecycleStatus', v_invoice.lifecycle_status,
    'archivedAt', v_invoice.archived_at,
    'voidedAt', v_invoice.voided_at,
    'canDelete', v_can_delete,
    'canVoid', v_can_void,
    'canArchive', v_can_archive,
    'canRestore', v_can_restore,
    'recommendedAction', v_recommended_action,
    'blockedReason', v_blocked_reason,
    'totalDependencyCount', v_total,
    'confirmedSettlementCount', v_confirmed_settlements,
    'dependencies', jsonb_build_object(
      'lineItems', v_line_items,
      'extractions', v_extractions,
      'reviewEvents', v_review_events,
      'projectAllocations', v_project_allocations,
      'settlementMatches', v_settlement_matches,
      'confirmedSettlementMatches', v_confirmed_settlements,
      'projectAccountingEvents', v_project_accounting_events,
      'sourceDocument', v_source_document,
      'sourceEmail', v_source_email,
      'duplicateReferences', v_duplicate_references,
      'companyAuditEvents', v_company_audit_events
    )
  );
end;
$$;

create or replace function private.expense_correction_preflight(
  p_expense_id uuid,
  p_company_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_expense public.expenses;
  v_settlement_matches bigint := 0;
  v_confirmed_settlements bigint := 0;
  v_project_accounting_events bigint := 0;
  v_project_reference bigint := 0;
  v_receipt_source bigint := 0;
  v_company_audit_events bigint := 0;
  v_total bigint := 0;
  v_can_delete boolean;
  v_can_void boolean;
  v_can_archive boolean;
  v_can_restore boolean;
  v_recommended_action text;
  v_blocked_reason text;
begin
  select e.*
    into v_expense
  from public.expenses e
  where e.id = p_expense_id
    and e.company_id = p_company_id;

  if not found then
    raise exception 'Expense does not exist in the deployment company'
      using errcode = '42501';
  end if;

  select count(*), count(*) filter (where m.status = 'CONFIRMED')
    into v_settlement_matches, v_confirmed_settlements
  from public.financial_transaction_matches m
  where m.company_id = p_company_id
    and m.target_type = 'EXPENSE'
    and m.target_id = p_expense_id;

  select count(*) into v_project_accounting_events
  from public.project_accounting_events e
  where e.company_id = p_company_id
    and upper(e.entity_type) = 'EXPENSE'
    and e.entity_id = p_expense_id;

  v_project_reference := case when v_expense.project_id is null then 0 else 1 end;
  v_receipt_source := case when v_expense.receipt_source_document_id is null then 0 else 1 end;

  select count(*) into v_company_audit_events
  from public.company_audit_events e
  where e.company_id = p_company_id
    and e.target_id = p_expense_id
    and lower(e.target_type) in ('expense', 'expenses');

  v_total := v_settlement_matches + v_project_accounting_events + v_project_reference
    + v_receipt_source + v_company_audit_events;
  v_can_delete := v_expense.status = 'DRAFT' and v_expense.archived_at is null and v_total = 0;
  v_can_void := v_expense.status <> 'VOID' and v_confirmed_settlements = 0;
  v_can_archive := v_expense.archived_at is null;
  v_can_restore := v_expense.archived_at is not null;

  v_recommended_action := case
    when v_can_delete then 'DELETE_UNUSED'
    when v_expense.status = 'VOID' and v_can_restore then 'RESTORE'
    when v_expense.status = 'VOID' then 'NONE'
    when v_expense.status in ('APPROVED', 'PAID') and v_can_void then 'VOID'
    when v_can_void and v_total > 0 then 'VOID'
    when v_can_archive then 'ARCHIVE'
    when v_can_restore then 'RESTORE'
    else 'NONE'
  end;

  v_blocked_reason := case
    when v_confirmed_settlements > 0 then format(
      'This expense has %s confirmed settlement record%s. Do not void or delete it until the settlement evidence is corrected through the deferred Wave 2B3 cash workflow.',
      v_confirmed_settlements,
      case when v_confirmed_settlements = 1 then '' else 's' end
    )
    when v_expense.status = 'VOID' then 'This expense is already void. Its operational history remains preserved.'
    when v_expense.status in ('APPROVED', 'PAID') then 'Approved or paid expenses cannot be permanently deleted. Void the expense with a reason, or archive it without changing its financial status.'
    when v_total > 0 then 'Dependent or auditable expense history exists, so permanent deletion is unavailable. Archive it or void it with a reason.'
    when v_can_restore then 'This expense is archived. Restore visibility without changing its financial status.'
    else null
  end;

  return jsonb_build_object(
    'entityType', 'EXPENSE',
    'entityId', p_expense_id,
    'status', v_expense.status,
    'lifecycleStatus', v_expense.status,
    'archivedAt', v_expense.archived_at,
    'voidedAt', v_expense.voided_at,
    'canDelete', v_can_delete,
    'canVoid', v_can_void,
    'canArchive', v_can_archive,
    'canRestore', v_can_restore,
    'recommendedAction', v_recommended_action,
    'blockedReason', v_blocked_reason,
    'totalDependencyCount', v_total,
    'confirmedSettlementCount', v_confirmed_settlements,
    'dependencies', jsonb_build_object(
      'settlementMatches', v_settlement_matches,
      'confirmedSettlementMatches', v_confirmed_settlements,
      'projectAccountingEvents', v_project_accounting_events,
      'projectReference', v_project_reference,
      'receiptSource', v_receipt_source,
      'companyAuditEvents', v_company_audit_events
    )
  );
end;
$$;

create or replace function private.invoice_correction_preflight_authorized(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := (select private.deployment_company_id());
begin
  perform private.require_financial_correction_permission(v_company_id, 'invoices.read', 'invoice');
  return private.invoice_correction_preflight(p_invoice_id, v_company_id);
end;
$$;

create or replace function private.expense_correction_preflight_authorized(p_expense_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := (select private.deployment_company_id());
begin
  perform private.require_financial_correction_permission(v_company_id, 'expenses.read', 'expense');
  return private.expense_correction_preflight(p_expense_id, v_company_id);
end;
$$;

revoke execute on function private.invoice_correction_preflight(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.expense_correction_preflight(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.invoice_correction_preflight_authorized(uuid) from public, anon, authenticated;
revoke execute on function private.expense_correction_preflight_authorized(uuid) from public, anon, authenticated;

create or replace function public.preview_invoice_correction(p_invoice_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.invoice_correction_preflight_authorized(p_invoice_id);
$$;

create or replace function public.preview_expense_correction(p_expense_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.expense_correction_preflight_authorized(p_expense_id);
$$;

create or replace function public.apply_invoice_correction(
  p_invoice_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_company_id uuid := (select private.deployment_company_id());
  v_invoice public.invoices;
  v_preflight jsonb;
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
  v_before jsonb;
begin
  perform private.require_financial_correction_permission(v_company_id, 'invoices.manage', 'invoice');

  if v_action not in ('DELETE_UNUSED', 'VOID', 'ARCHIVE', 'RESTORE') then
    raise exception 'Invoice correction action is invalid'
      using errcode = '22023';
  end if;

  select i.*
    into v_invoice
  from public.invoices i
  where i.id = p_invoice_id
    and i.company_id = v_company_id
  for update;

  if not found then
    raise exception 'Invoice does not exist in the deployment company'
      using errcode = '42501';
  end if;

  -- The target row is locked before the dependency scan. Foreign-key child
  -- inserts and the settlement confirmation RPC must wait for this lock, so
  -- the following preflight is authoritative for the mutation transaction.
  v_preflight := private.invoice_correction_preflight(p_invoice_id, v_company_id);
  v_before := to_jsonb(v_invoice);

  if v_action = 'DELETE_UNUSED' then
    if coalesce((v_preflight ->> 'canDelete')::boolean, false) is not true then
      raise exception '%', coalesce(v_preflight ->> 'blockedReason', 'This invoice has dependent or auditable history and cannot be permanently deleted.')
        using errcode = '42501';
    end if;

    perform private.write_company_audit(
      v_company_id,
      'INVOICE_DELETED_UNUSED',
      'invoice',
      p_invoice_id,
      jsonb_build_object(
        'action', v_action,
        'reason', coalesce(v_reason, 'Confirmed unused invoice deletion'),
        'preflight', v_preflight,
        'recordBeforeDelete', v_before,
        'originalValues', v_invoice.current_data
      )
    );

    delete from public.invoices
    where id = p_invoice_id and company_id = v_company_id;

    return jsonb_build_object(
      'entityType', 'INVOICE',
      'entityId', p_invoice_id,
      'action', v_action,
      'deleted', true,
      'changed', true,
      'preflight', v_preflight
    );
  end if;

  if v_action = 'VOID' then
    if v_invoice.lifecycle_status = 'VOID' then
      return jsonb_build_object(
        'entityType', 'INVOICE',
        'entityId', p_invoice_id,
        'action', v_action,
        'deleted', false,
        'changed', false,
        'preflight', v_preflight,
        'record', to_jsonb(v_invoice)
      );
    end if;
    if coalesce((v_preflight ->> 'confirmedSettlementCount')::bigint, 0) > 0 then
      raise exception '%', v_preflight ->> 'blockedReason'
        using errcode = '42501';
    end if;
    if v_invoice.review_status = 'VERIFIED' then
      perform private.require_financial_correction_permission(v_company_id, 'invoices.verify', 'verified invoice');
    end if;
    if v_reason is null then
      raise exception 'A reason is required to void an invoice'
        using errcode = '22023';
    end if;

    update public.invoices
    set lifecycle_status = 'VOID',
        voided_at = now(),
        voided_by_user_id = v_actor,
        void_reason = v_reason,
        updated_at = now()
    where id = p_invoice_id and company_id = v_company_id
    returning * into v_invoice;

    insert into public.invoice_review_events(
      user_id, company_id, invoice_id, event_type, previous_value, new_value
    ) values (
      v_actor, v_company_id, p_invoice_id, 'INVOICE_VOIDED',
      v_before,
      jsonb_build_object('lifecycleStatus', 'VOID', 'reason', v_reason, 'voidedAt', v_invoice.voided_at, 'voidedByUserId', v_actor)
    );
    perform private.write_company_audit(
      v_company_id,
      'INVOICE_VOIDED',
      'invoice',
      p_invoice_id,
      jsonb_build_object(
        'action', v_action,
        'reason', v_reason,
        'voidedAt', v_invoice.voided_at,
        'voidedByUserId', v_actor,
        'preflight', v_preflight,
        'recordBeforeVoid', v_before,
        'originalValues', (v_before -> 'current_data')
      )
    );
  elsif v_action = 'ARCHIVE' then
    if v_invoice.archived_at is not null then
      return jsonb_build_object(
        'entityType', 'INVOICE',
        'entityId', p_invoice_id,
        'action', v_action,
        'deleted', false,
        'changed', false,
        'preflight', v_preflight,
        'record', to_jsonb(v_invoice)
      );
    end if;
    if v_reason is null then
      raise exception 'A reason is required to archive an invoice'
        using errcode = '22023';
    end if;
    update public.invoices
    set archived_at = now(), updated_at = now()
    where id = p_invoice_id and company_id = v_company_id
    returning * into v_invoice;
    insert into public.invoice_review_events(
      user_id, company_id, invoice_id, event_type, previous_value, new_value
    ) values (
      v_actor, v_company_id, p_invoice_id, 'INVOICE_ARCHIVED',
      v_before,
      jsonb_build_object('archivedAt', v_invoice.archived_at, 'reason', v_reason)
    );
    perform private.write_company_audit(v_company_id, 'INVOICE_ARCHIVED', 'invoice', p_invoice_id,
      jsonb_build_object('action', v_action, 'reason', v_reason, 'preflight', v_preflight, 'recordBeforeArchive', v_before));
  else
    if v_invoice.archived_at is null then
      return jsonb_build_object(
        'entityType', 'INVOICE',
        'entityId', p_invoice_id,
        'action', v_action,
        'deleted', false,
        'changed', false,
        'preflight', v_preflight,
        'record', to_jsonb(v_invoice)
      );
    end if;
    if v_reason is null then
      raise exception 'A reason is required to restore an invoice to the visible directory'
        using errcode = '22023';
    end if;
    update public.invoices
    set archived_at = null, updated_at = now()
    where id = p_invoice_id and company_id = v_company_id
    returning * into v_invoice;
    insert into public.invoice_review_events(
      user_id, company_id, invoice_id, event_type, previous_value, new_value
    ) values (
      v_actor, v_company_id, p_invoice_id, 'INVOICE_RESTORED',
      v_before,
      jsonb_build_object('archivedAt', null, 'reason', v_reason)
    );
    perform private.write_company_audit(v_company_id, 'INVOICE_RESTORED', 'invoice', p_invoice_id,
      jsonb_build_object('action', v_action, 'reason', v_reason, 'preflight', v_preflight, 'recordBeforeRestore', v_before));
  end if;

  return jsonb_build_object(
    'entityType', 'INVOICE',
    'entityId', p_invoice_id,
    'action', v_action,
    'deleted', false,
    'changed', true,
    'preflight', v_preflight,
    'record', to_jsonb(v_invoice)
  );
end;
$$;

create or replace function public.apply_expense_correction(
  p_expense_id uuid,
  p_action text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_company_id uuid := (select private.deployment_company_id());
  v_expense public.expenses;
  v_preflight jsonb;
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
  v_before jsonb;
begin
  perform private.require_financial_correction_permission(v_company_id, 'expenses.manage', 'expense');

  if v_action not in ('DELETE_UNUSED', 'VOID', 'ARCHIVE', 'RESTORE') then
    raise exception 'Expense correction action is invalid'
      using errcode = '22023';
  end if;

  select e.*
    into v_expense
  from public.expenses e
  where e.id = p_expense_id
    and e.company_id = v_company_id
  for update;

  if not found then
    raise exception 'Expense does not exist in the deployment company'
      using errcode = '42501';
  end if;

  v_preflight := private.expense_correction_preflight(p_expense_id, v_company_id);
  v_before := to_jsonb(v_expense);

  if v_action = 'DELETE_UNUSED' then
    if coalesce((v_preflight ->> 'canDelete')::boolean, false) is not true then
      raise exception '%', coalesce(v_preflight ->> 'blockedReason', 'This expense has dependent or auditable history and cannot be permanently deleted.')
        using errcode = '42501';
    end if;
    perform private.write_company_audit(
      v_company_id,
      'EXPENSE_DELETED_UNUSED',
      'expense',
      p_expense_id,
      jsonb_build_object(
        'action', v_action,
        'reason', coalesce(v_reason, 'Confirmed unused draft expense deletion'),
        'preflight', v_preflight,
        'recordBeforeDelete', v_before
      )
    );
    delete from public.expenses
    where id = p_expense_id and company_id = v_company_id;
    return jsonb_build_object(
      'entityType', 'EXPENSE',
      'entityId', p_expense_id,
      'action', v_action,
      'deleted', true,
      'changed', true,
      'preflight', v_preflight
    );
  end if;

  if v_action = 'VOID' then
    if v_expense.status = 'VOID' then
      return jsonb_build_object(
        'entityType', 'EXPENSE',
        'entityId', p_expense_id,
        'action', v_action,
        'deleted', false,
        'changed', false,
        'preflight', v_preflight,
        'record', to_jsonb(v_expense)
      );
    end if;
    if coalesce((v_preflight ->> 'confirmedSettlementCount')::bigint, 0) > 0 then
      raise exception '%', v_preflight ->> 'blockedReason'
        using errcode = '42501';
    end if;
    if v_reason is null then
      raise exception 'A reason is required to void an expense'
        using errcode = '22023';
    end if;
    update public.expenses
    set status = 'VOID',
        voided_at = now(),
        voided_by_user_id = v_actor,
        void_reason = v_reason,
        updated_at = now()
    where id = p_expense_id and company_id = v_company_id
    returning * into v_expense;
    perform private.write_company_audit(v_company_id, 'EXPENSE_VOIDED', 'expense', p_expense_id,
      jsonb_build_object('action', v_action, 'reason', v_reason, 'voidedAt', v_expense.voided_at, 'voidedByUserId', v_actor, 'preflight', v_preflight, 'recordBeforeVoid', v_before));
  elsif v_action = 'ARCHIVE' then
    if v_expense.archived_at is not null then
      return jsonb_build_object(
        'entityType', 'EXPENSE',
        'entityId', p_expense_id,
        'action', v_action,
        'deleted', false,
        'changed', false,
        'preflight', v_preflight,
        'record', to_jsonb(v_expense)
      );
    end if;
    if v_reason is null then
      raise exception 'A reason is required to archive an expense'
        using errcode = '22023';
    end if;
    update public.expenses
    set archived_at = now(), updated_at = now()
    where id = p_expense_id and company_id = v_company_id
    returning * into v_expense;
    perform private.write_company_audit(v_company_id, 'EXPENSE_ARCHIVED', 'expense', p_expense_id,
      jsonb_build_object('action', v_action, 'reason', v_reason, 'preflight', v_preflight, 'recordBeforeArchive', v_before));
  else
    if v_expense.archived_at is null then
      return jsonb_build_object(
        'entityType', 'EXPENSE',
        'entityId', p_expense_id,
        'action', v_action,
        'deleted', false,
        'changed', false,
        'preflight', v_preflight,
        'record', to_jsonb(v_expense)
      );
    end if;
    if v_reason is null then
      raise exception 'A reason is required to restore an expense to the visible directory'
        using errcode = '22023';
    end if;
    update public.expenses
    set archived_at = null, updated_at = now()
    where id = p_expense_id and company_id = v_company_id
    returning * into v_expense;
    perform private.write_company_audit(v_company_id, 'EXPENSE_RESTORED', 'expense', p_expense_id,
      jsonb_build_object('action', v_action, 'reason', v_reason, 'preflight', v_preflight, 'recordBeforeRestore', v_before));
  end if;

  return jsonb_build_object(
    'entityType', 'EXPENSE',
    'entityId', p_expense_id,
    'action', v_action,
    'deleted', false,
    'changed', true,
    'preflight', v_preflight,
    'record', to_jsonb(v_expense)
  );
end;
$$;

revoke all on function public.preview_invoice_correction(uuid) from public, anon;
revoke all on function public.preview_expense_correction(uuid) from public, anon;
revoke all on function public.apply_invoice_correction(uuid, text, text) from public, anon;
revoke all on function public.apply_expense_correction(uuid, text, text) from public, anon;
grant execute on function public.preview_invoice_correction(uuid) to authenticated;
grant execute on function public.preview_expense_correction(uuid) to authenticated;
grant execute on function public.apply_invoice_correction(uuid, text, text) to authenticated;
grant execute on function public.apply_expense_correction(uuid, text, text) to authenticated;

-- Generic updates cannot forge lifecycle transitions or rewrite a voided
-- record. Verified invoices must be explicitly reopened before their
-- business values can change, and review-state changes require invoices.verify.
create or replace function private.guard_invoice_correction_edit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_changed boolean;
begin
  if tg_op = 'INSERT' then
    if current_user not in ('postgres', 'service_role')
       and (
         new.lifecycle_status <> 'ACTIVE'
         or new.archived_at is not null
         or new.voided_at is not null
         or new.voided_by_user_id is not null
         or new.void_reason is not null
       ) then
      raise exception 'Create an invoice in the active state; use the invoice correction workflow for lifecycle changes'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if current_user in ('postgres', 'service_role') then
    return new;
  end if;

  if new.lifecycle_status is distinct from old.lifecycle_status
     or new.archived_at is distinct from old.archived_at
     or new.voided_at is distinct from old.voided_at
     or new.voided_by_user_id is distinct from old.voided_by_user_id
     or new.void_reason is distinct from old.void_reason then
    raise exception 'Use the invoice correction workflow for delete, void, archive, or restore actions'
      using errcode = '42501';
  end if;

  v_business_changed := new.vendor_id is distinct from old.vendor_id
    or new.invoice_number is distinct from old.invoice_number
    or new.invoice_date is distinct from old.invoice_date
    or new.due_date is distinct from old.due_date
    or new.currency is distinct from old.currency
    or new.grand_total is distinct from old.grand_total
    or new.payment_status is distinct from old.payment_status
    or new.duplicate_status is distinct from old.duplicate_status
    or new.duplicate_of_id is distinct from old.duplicate_of_id
    or new.document_type is distinct from old.document_type
    or (coalesce(new.current_data, '{}'::jsonb) - ARRAY[
      'reviewStatus', 'verifiedAt', 'archivedAt', 'lifecycleStatus',
      'voidedAt', 'voidedByUserId', 'voidReason',
      'review_status', 'verified_at', 'archived_at', 'lifecycle_status',
      'voided_at', 'voided_by_user_id', 'void_reason'
    ]::text[]) is distinct from (coalesce(old.current_data, '{}'::jsonb) - ARRAY[
      'reviewStatus', 'verifiedAt', 'archivedAt', 'lifecycleStatus',
      'voidedAt', 'voidedByUserId', 'voidReason',
      'review_status', 'verified_at', 'archived_at', 'lifecycle_status',
      'voided_at', 'voided_by_user_id', 'void_reason'
    ]::text[]);

  if old.lifecycle_status = 'VOID'
     and (v_business_changed or new.review_status is distinct from old.review_status) then
    raise exception 'Voided invoices are immutable; original values and history must remain preserved'
      using errcode = '42501';
  end if;

  if old.review_status = 'VERIFIED'
     and v_business_changed then
    raise exception 'Verified invoices must be reopened through the verification workflow before editing'
      using errcode = '42501';
  end if;

  if new.review_status is distinct from old.review_status
     and not (select private.has_company_permission(new.company_id, 'invoices.verify')) then
    raise exception 'Invoice review-state changes require invoices.verify'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists invoices_correction_edit_guard on public.invoices;
create trigger invoices_correction_edit_guard
before insert or update on public.invoices
for each row execute function private.guard_invoice_correction_edit();
revoke execute on function private.guard_invoice_correction_edit() from public, anon, authenticated;

create or replace function private.guard_expense_correction_edit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_changed boolean;
begin
  if tg_op = 'INSERT' then
    if current_user not in ('postgres', 'service_role')
       and (new.status = 'VOID' or new.archived_at is not null or new.voided_at is not null or new.voided_by_user_id is not null or new.void_reason is not null) then
      raise exception 'Create an expense in an active status; use the expense correction workflow for lifecycle changes'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if current_user in ('postgres', 'service_role') then
    return new;
  end if;

  if new.archived_at is distinct from old.archived_at
     or new.voided_at is distinct from old.voided_at
     or new.voided_by_user_id is distinct from old.voided_by_user_id
     or new.void_reason is distinct from old.void_reason
     or (new.status is distinct from old.status and (new.status = 'VOID' or old.status = 'VOID')) then
      raise exception 'Use the expense correction workflow for void, archive, or restore actions'
      using errcode = '42501';
  end if;

  v_business_changed := new.project_id is distinct from old.project_id
    or new.expense_date is distinct from old.expense_date
    or new.category is distinct from old.category
    or new.description is distinct from old.description
    or new.payee is distinct from old.payee
    or new.amount is distinct from old.amount
    or new.currency is distinct from old.currency
    or new.payment_method is distinct from old.payment_method
    or new.reference_number is distinct from old.reference_number
    or new.receipt_source_document_id is distinct from old.receipt_source_document_id
    or new.notes is distinct from old.notes;

  if old.status = 'PAID'
     and (new.status is distinct from old.status or v_business_changed) then
    raise exception 'Paid expenses are immutable; use the expense correction workflow for an auditable correction'
      using errcode = '42501';
  end if;

  if old.status = 'APPROVED'
     and (new.status not in ('APPROVED', 'PAID') or v_business_changed) then
    raise exception 'Approved expenses must use the expense correction workflow for an auditable correction'
      using errcode = '42501';
  end if;

  if old.status = 'VOID'
     and (
       new.project_id is distinct from old.project_id
       or new.expense_date is distinct from old.expense_date
       or new.category is distinct from old.category
       or new.description is distinct from old.description
       or new.payee is distinct from old.payee
       or new.amount is distinct from old.amount
       or new.currency is distinct from old.currency
       or new.payment_method is distinct from old.payment_method
       or new.reference_number is distinct from old.reference_number
       or new.receipt_source_document_id is distinct from old.receipt_source_document_id
       or new.notes is distinct from old.notes
     ) then
    raise exception 'Voided expenses are immutable; original values and history must remain preserved'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_correction_edit_guard on public.expenses;
create trigger expenses_correction_edit_guard
before insert or update on public.expenses
for each row execute function private.guard_expense_correction_edit();
revoke execute on function private.guard_expense_correction_edit() from public, anon, authenticated;

-- A voided invoice/expense cannot receive a new confirmed cash match. Existing
-- confirmed evidence can still be reversed by the dedicated Wave 2B3 path.
create or replace function private.prevent_voided_financial_target()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'CONFIRMED' and new.target_type = 'INVOICE'
     and exists (
       select 1 from public.invoices i
       where i.id = new.target_id and i.company_id = new.company_id and i.lifecycle_status = 'VOID'
     ) then
    raise exception 'Voided invoices cannot receive confirmed settlement evidence'
      using errcode = '42501';
  end if;
  if new.status = 'CONFIRMED' and new.target_type = 'EXPENSE'
     and exists (
       select 1 from public.expenses e
       where e.id = new.target_id and e.company_id = new.company_id and e.status = 'VOID'
     ) then
    raise exception 'Voided expenses cannot receive confirmed settlement evidence'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists financial_transaction_matches_void_target_guard on public.financial_transaction_matches;
create trigger financial_transaction_matches_void_target_guard
before insert or update on public.financial_transaction_matches
for each row execute function private.prevent_voided_financial_target();
revoke execute on function private.prevent_voided_financial_target() from public, anon, authenticated;

-- Preserve invoice allocation evidence after voiding and prevent the existing
-- replace-allocation RPC or Assistant upsert from reassigning a voided invoice.
create or replace function private.guard_invoice_project_allocation_lifecycle()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice public.invoices;
begin
  if tg_op = 'DELETE' then
    select i.* into v_invoice
    from public.invoices i
    where i.id = old.invoice_id and i.company_id = old.company_id;
    if v_invoice.lifecycle_status = 'VOID' then
      raise exception 'Voided invoice project allocations are preserved and cannot be deleted'
        using errcode = '42501';
    end if;
    return old;
  end if;

  select i.* into v_invoice
  from public.invoices i
  where i.id = new.invoice_id and i.company_id = new.company_id;
  if not found then
    raise exception 'Invoice allocation target is outside the company'
      using errcode = '42501';
  end if;
  if v_invoice.lifecycle_status = 'VOID' then
    raise exception 'Voided invoices cannot receive new project allocations'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists invoice_project_allocations_lifecycle_guard on public.invoice_project_allocations;
create trigger invoice_project_allocations_lifecycle_guard
before insert or update or delete on public.invoice_project_allocations
for each row execute function private.guard_invoice_project_allocation_lifecycle();
revoke execute on function private.guard_invoice_project_allocation_lifecycle() from public, anon, authenticated;

-- Project accounting events do not have a foreign key to invoice/expense
-- entity ids. Lock and validate those references so a correction cannot miss
-- a concurrent history event and leave an orphaned audit reference.
create or replace function private.guard_financial_history_reference()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice public.invoices;
  v_expense public.expenses;
begin
  if upper(coalesce(new.entity_type, '')) = 'INVOICE' and new.entity_id is not null then
    select i.* into v_invoice
    from public.invoices i
    where i.id = new.entity_id and i.company_id = new.company_id
    for key share;
    if not found then
      raise exception 'Invoice accounting history target is outside the company'
        using errcode = '42501';
    end if;
    if v_invoice.lifecycle_status = 'VOID' then
      raise exception 'Voided invoices cannot receive new project accounting events'
        using errcode = '42501';
    end if;
  elsif upper(coalesce(new.entity_type, '')) = 'EXPENSE' and new.entity_id is not null then
    select e.* into v_expense
    from public.expenses e
    where e.id = new.entity_id and e.company_id = new.company_id
    for key share;
    if not found then
      raise exception 'Expense accounting history target is outside the company'
        using errcode = '42501';
    end if;
    if v_expense.status = 'VOID' then
      raise exception 'Voided expenses cannot receive new project accounting events'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists project_accounting_events_financial_history_guard on public.project_accounting_events;
create trigger project_accounting_events_financial_history_guard
before insert or update on public.project_accounting_events
for each row execute function private.guard_financial_history_reference();
revoke execute on function private.guard_financial_history_reference() from public, anon, authenticated;

-- Expose invoice VOID state through the existing settlement summary so the
-- reconciliation and Assistant validation paths cannot treat a voided
-- VERIFIED invoice as an active payable. This does not alter settlement rows.
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
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='42501'; end if;
  v_permission := case p_target_type when 'INVOICE' then 'invoices.read' when 'PAYROLL' then 'payroll.summary.read' when 'EXPENSE' then 'expenses.read' else null end;
  if v_permission is null or not (select private.has_company_permission(p_company_id, v_permission)) then raise exception 'Settlement summary permission denied' using errcode='42501'; end if;
  v_can_read_cash := (select private.has_company_permission(p_company_id, 'cash.transactions.read'));

  if p_target_type='INVOICE' then
    select i.currency, case when i.lifecycle_status = 'VOID' then 'VOID' else i.review_status end, i.due_date,
      case when coalesce(i.current_data->>'amountPaid','') ~ '^[-+]?[0-9]+([.][0-9]+)?$' then (i.current_data->>'amountPaid')::numeric else 0 end
      into v_currency,v_lifecycle,v_due_date,v_document_paid
    from public.invoices i where i.id=p_target_id and i.company_id=p_company_id;
    if not found then raise exception 'Invoice unavailable' using errcode='42501'; end if;
    v_basis := private.invoice_cash_payable_basis(p_target_id,p_company_id);
  elsif p_target_type='PAYROLL' then
    select c.default_currency,pr.status into v_currency,v_lifecycle
    from public.payroll_runs pr join public.companies c on c.id=pr.company_id
    where pr.id=p_target_id and pr.company_id=p_company_id;
    if not found then raise exception 'Payroll run unavailable' using errcode='42501'; end if;
    v_basis := private.payroll_net_pay_basis(p_target_id,p_company_id);
  else
    select e.currency,e.status,e.amount into v_currency,v_lifecycle,v_basis
    from public.expenses e where e.id=p_target_id and e.company_id=p_company_id;
    if not found then raise exception 'Expense unavailable' using errcode='42501'; end if;
  end if;

  select coalesce(sum(m.matched_amount) filter (where m.status='CONFIRMED'),0)
    into v_cash_paid
  from public.financial_transaction_matches m
  where m.company_id=p_company_id and m.target_type=p_target_type and m.target_id=p_target_id;

  if v_can_read_cash then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',m.id,'transactionId',m.transaction_id,'status',m.status,'amount',m.matched_amount,
      'confirmedAt',m.confirmed_at,'confirmedByUserId',m.confirmed_by_user_id,
      'reversedAt',m.reversed_at,'reversedByUserId',m.reversed_by_user_id,'reversalReason',m.reversal_reason,
      'confirmationSource',m.confirmation_source,'accountId',ft.account_id,'accountName',fa.display_name,
      'accountType',fa.account_type,'maskedIdentifier',fa.masked_identifier,'transactionDate',ft.transaction_date,
      'referenceNumber',ft.reference_number,'description',ft.description,'currency',ft.currency
    ) order by coalesce(m.confirmed_at,m.created_at) desc),'[]'::jsonb)
      into v_history
    from public.financial_transaction_matches m
    join public.financial_transactions ft on ft.id=m.transaction_id and ft.company_id=m.company_id
    join public.financial_accounts fa on fa.id=ft.account_id and fa.company_id=ft.company_id
    where m.company_id=p_company_id and m.target_type=p_target_type and m.target_id=p_target_id and m.status in ('CONFIRMED','REVERSED');
  end if;

  v_document_paid := least(v_basis, greatest(coalesce(v_document_paid,0),0));
  v_cash_paid := least(v_basis, greatest(coalesce(v_cash_paid,0),0));
  v_effective := case when p_target_type='INVOICE' then greatest(v_document_paid,v_cash_paid) else v_cash_paid end;

  return jsonb_build_object(
    'targetType',p_target_type,'targetId',p_target_id,'currency',v_currency,'lifecycleStatus',v_lifecycle,
    'settlementBasis',round(coalesce(v_basis,0),2),'reconciledCashPaid',round(v_cash_paid,2),
    'documentReportedPaid',case when p_target_type='INVOICE' then round(v_document_paid,2) else 0 end,
    'effectiveSettled',round(v_effective,2),'outstanding',round(greatest(v_basis-v_effective,0),2),
    'settlementState',case
      when p_target_type='PAYROLL' and v_cash_paid<=0.005 then 'UNSETTLED'
      when p_target_type='PAYROLL' and v_cash_paid>=v_basis-0.005 then 'SETTLED'
      when p_target_type='PAYROLL' then 'PARTIALLY_DISBURSED'
      when v_effective>=v_basis-0.005 then 'PAID'
      when p_target_type='INVOICE' and v_due_date is not null and v_due_date < current_date and v_effective < v_basis-0.005 then 'OVERDUE'
      when v_effective>0.005 then 'PARTIALLY_PAID'
      else 'UNPAID' end,
    'basisSource',case when p_target_type='INVOICE' and private.invoice_cash_payable_basis(p_target_id,p_company_id) <> (select i.grand_total from public.invoices i where i.id=p_target_id) then 'EXPLICIT_NET_PAYABLE' when p_target_type='PAYROLL' then 'EMPLOYEE_NET_PAY' when p_target_type='EXPENSE' then 'EXPENSE_AMOUNT' else 'GROSS_DOCUMENT_AMOUNT' end,
    'legacyPaidWithoutBankLink',p_target_type='PAYROLL' and v_lifecycle='PAID' and v_cash_paid<=0.005,
    'historyRedacted',not v_can_read_cash,'history',v_history
  );
end;
$$;

revoke all on function public.get_financial_settlement_summary(uuid, text, uuid) from public, anon;
grant execute on function public.get_financial_settlement_summary(uuid, text, uuid) to authenticated;
