-- ============================================================================
-- P2B-4 Client Progress Billing Foundation
--
-- Client billing is revenue-side project history. It is deliberately separate
-- from supplier invoices, project costs, commitments, cash, settlements, and
-- accounting postings. Only ISSUED billing contributes to billed-to-date.
-- ============================================================================

-- Keep the append-only company audit allowlist a strict superset of every
-- event accepted by the current main branch, then add the P2B-4 lifecycle
-- events. Draft edits are audited as well as lifecycle transitions.
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
    'CASH_ACCOUNT_CREATED', 'CASH_ACCOUNT_UPDATED', 'CASH_ACCOUNT_DEACTIVATED', 'CASH_ACCOUNT_REACTIVATED',
    'CASH_BALANCE_SNAPSHOT_RECORDED', 'CASH_STATEMENT_IMPORTED', 'CASH_STATEMENT_REJECTED',
    'CASH_TRANSACTION_CREATED', 'CASH_TRANSACTION_UPDATED', 'CASH_TRANSACTION_CORRECTED',
    'CASH_TRANSACTION_REVERSED', 'CASH_TRANSACTION_IGNORED', 'CASH_TRANSACTION_REVIEW_RESTORED',
    'CASH_RECONCILIATION_CONFIRMED', 'CASH_RECONCILIATION_REMOVED', 'CASH_TRANSFER_MATCHED', 'CASH_TRANSFER_REVERSED',
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
    'EXPENSE_DELETED_UNUSED', 'EXPENSE_VOIDED', 'EXPENSE_ARCHIVED', 'EXPENSE_RESTORED',
    'ACCESS_AUTHORIZATION_CREATED', 'ACCESS_AUTHORIZATION_PERMISSIONS_UPDATED',
    'ACCESS_AUTHORIZATION_REVOKED', 'ACCESS_AUTHORIZATION_ACCEPTED',
    'MEMBERSHIP_CREATED', 'PERMISSION_OVERRIDES_TRANSFERRED',
    'CLIENT_BILLING_CREATED', 'CLIENT_BILLING_UPDATED', 'CLIENT_BILLING_SUBMITTED',
    'CLIENT_BILLING_RETURNED_TO_DRAFT', 'CLIENT_BILLING_ISSUED',
    'CLIENT_BILLING_CANCELLED', 'CLIENT_BILLING_VOIDED'
  ));

-- 1. Billing header and line domain. The header intentionally has no copied
-- total column: every total is derived from client_billing_lines.amount.
create table if not exists public.client_billings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  project_id uuid not null,
  billing_number text not null check (length(btrim(billing_number)) between 1 and 80 and billing_number = upper(btrim(billing_number))),
  billing_date date not null default current_date,
  period_start date,
  period_end date,
  client_name_snapshot text,
  client_reference_snapshot text,
  currency text not null default 'PHP' check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'SUBMITTED', 'ISSUED', 'CANCELLED', 'VOIDED')),
  notes text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  submitted_by_user_id uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  issued_by_user_id uuid references auth.users(id) on delete set null,
  issued_at timestamptz,
  cancelled_by_user_id uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  cancellation_reason text,
  voided_by_user_id uuid references auth.users(id) on delete set null,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_billings_company_id_id_key unique (company_id, id),
  constraint client_billings_company_project_fk
    foreign key (company_id, project_id)
    references public.projects(company_id, id) on delete restrict,
  constraint client_billings_period_order_check
    check (period_end is null or period_start is null or period_end >= period_start),
  constraint client_billings_cancellation_reason_check
    check (cancellation_reason is null or length(btrim(cancellation_reason)) between 3 and 500),
  constraint client_billings_void_reason_check
    check (void_reason is null or length(btrim(void_reason)) between 3 and 500)
);

create unique index if not exists client_billings_company_number_unique
  on public.client_billings(company_id, lower(billing_number));
create index if not exists client_billings_company_project_status_idx
  on public.client_billings(company_id, project_id, status, billing_date desc, updated_at desc);

create table if not exists public.client_billing_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  billing_id uuid not null,
  line_number integer not null check (line_number >= 1),
  description text not null check (length(btrim(description)) between 1 and 500),
  amount numeric(18,2) not null default 0 check (amount >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_billing_lines_company_billing_line_key unique (company_id, billing_id, line_number),
  constraint client_billing_lines_company_billing_fk
    foreign key (company_id, billing_id)
    references public.client_billings(company_id, id) on delete cascade
);

create index if not exists client_billing_lines_company_billing_idx
  on public.client_billing_lines(company_id, billing_id, line_number asc);

-- Lifecycle history is separate from the broad company audit register so the
-- project workspace can show a billing-specific timeline without exposing an
-- unrelated company's audit records.
create table if not exists public.client_billing_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  billing_id uuid not null,
  event_type text not null check (event_type in ('CREATED', 'UPDATED', 'SUBMITTED', 'RETURNED_TO_DRAFT', 'ISSUED', 'CANCELLED', 'VOIDED')),
  from_status text,
  to_status text not null,
  reason text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint client_billing_events_company_billing_fk
    foreign key (company_id, billing_id)
    references public.client_billings(company_id, id) on delete restrict
);

create index if not exists client_billing_events_company_billing_idx
  on public.client_billing_events(company_id, billing_id, created_at desc, id desc);

-- Reuse the existing project permission vocabulary. Billing is project
-- commercial history, not a parallel authorization system.
insert into private.company_tenant_policy_catalog (table_name, read_permission, write_permission, allow_insert, allow_update, allow_delete)
values
  ('client_billings', 'projects.read', 'projects.manage', true, true, false),
  ('client_billing_lines', 'projects.read', 'projects.manage', true, true, true)
on conflict (table_name) do update set
  read_permission = excluded.read_permission,
  write_permission = excluded.write_permission,
  allow_insert = excluded.allow_insert,
  allow_update = excluded.allow_update,
  allow_delete = excluded.allow_delete;

-- 2. Header and line relationship/lifecycle guards.
create or replace function private.validate_client_billing_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_project public.projects;
  v_project_currency text;
  v_project_is_archived boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication is required for client billing activity' using errcode = '42501';
  end if;
  if new.company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Client billing must belong to the deployment company' using errcode = '42501';
  end if;

  select p.*
    into v_project
  from public.projects p
  where p.id = new.project_id
  for key share;

  if not found then
    raise exception 'Client billing requires an existing project' using errcode = '23503';
  end if;
  if v_project.company_id is distinct from new.company_id then
    raise exception 'Client billing project is outside the company' using errcode = '42501';
  end if;
  v_project_is_archived := v_project.status = 'ARCHIVED' or v_project.archived_at is not null;

  -- Issued billing may be voided after project archive so finalized history can
  -- be corrected. No new draft, submission, or issue can target an archived or
  -- cancelled project.
  if v_project_is_archived
     and not (tg_op = 'UPDATE' and old.status = 'ISSUED' and new.status = 'VOIDED' and current_user in ('postgres', 'service_role')) then
    raise exception 'Archived projects cannot receive new client billing activity' using errcode = '42501';
  end if;
  if v_project.status = 'CANCELLED'
     and not (tg_op = 'UPDATE' and old.status = 'ISSUED' and new.status = 'VOIDED' and current_user in ('postgres', 'service_role')) then
    raise exception 'Cancelled projects cannot receive new client billing activity' using errcode = '42501';
  end if;

  v_project_currency := upper(btrim(coalesce(v_project.currency, '')));
  if new.currency is null then
    new.currency := v_project_currency;
  else
    new.currency := upper(btrim(new.currency));
  end if;
  if new.currency is distinct from v_project_currency then
    raise exception 'Client billing currency must match the project currency' using errcode = '22023';
  end if;
  new.billing_number := upper(btrim(new.billing_number));
  new.client_name_snapshot := nullif(btrim(coalesce(new.client_name_snapshot, v_project.client_name)), '');
  new.client_reference_snapshot := nullif(btrim(coalesce(new.client_reference_snapshot, v_project.client_reference)), '');

  if tg_op = 'INSERT' then
    if not (select public.has_company_permission(new.company_id, 'projects.manage')) then
      raise exception 'Unauthorized to create client billings' using errcode = '42501';
    end if;
    if new.status <> 'DRAFT' then
      raise exception 'Client billings must be created as DRAFT and transitioned through the guarded lifecycle' using errcode = '42501';
    end if;
    new.created_at := now();
    new.updated_at := now();
    new.created_by_user_id := v_user_id;
    new.updated_by_user_id := v_user_id;
    new.submitted_by_user_id := null;
    new.submitted_at := null;
    new.issued_by_user_id := null;
    new.issued_at := null;
    new.cancelled_by_user_id := null;
    new.cancelled_at := null;
    new.cancellation_reason := null;
    new.voided_by_user_id := null;
    new.voided_at := null;
    new.void_reason := null;
    return new;
  end if;

  if new.company_id is distinct from old.company_id then
    raise exception 'Client billing company is immutable' using errcode = '42501';
  end if;
  if new.created_by_user_id is distinct from old.created_by_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Client billing creation provenance is immutable' using errcode = '42501';
  end if;

  if old.status <> 'DRAFT' and (
    new.billing_number is distinct from old.billing_number or
    new.project_id is distinct from old.project_id or
    new.billing_date is distinct from old.billing_date or
    new.period_start is distinct from old.period_start or
    new.period_end is distinct from old.period_end or
    new.client_name_snapshot is distinct from old.client_name_snapshot or
    new.client_reference_snapshot is distinct from old.client_reference_snapshot or
    new.currency is distinct from old.currency or
    new.notes is distinct from old.notes
  ) then
    raise exception 'Submitted, issued, cancelled, or voided client billing terms are immutable' using errcode = '42501';
  end if;

  if new.status is distinct from old.status and current_user not in ('postgres', 'service_role') then
    raise exception 'Use the guarded client billing lifecycle workflow for status changes' using errcode = '42501';
  end if;

  if current_user not in ('postgres', 'service_role') and (
    new.submitted_by_user_id is distinct from old.submitted_by_user_id or
    new.submitted_at is distinct from old.submitted_at or
    new.issued_by_user_id is distinct from old.issued_by_user_id or
    new.issued_at is distinct from old.issued_at or
    new.cancelled_by_user_id is distinct from old.cancelled_by_user_id or
    new.cancelled_at is distinct from old.cancelled_at or
    new.cancellation_reason is distinct from old.cancellation_reason or
    new.voided_by_user_id is distinct from old.voided_by_user_id or
    new.voided_at is distinct from old.voided_at or
    new.void_reason is distinct from old.void_reason
  ) then
    raise exception 'Client billing lifecycle audit metadata is immutable outside a lifecycle transition' using errcode = '42501';
  end if;

  if old.status = 'DRAFT' and new.status = 'DRAFT' then
    if not (select public.has_company_permission(new.company_id, 'projects.manage')) then
      raise exception 'Unauthorized to edit client billings' using errcode = '42501';
    end if;
    new.updated_by_user_id := v_user_id;
  end if;
  return new;
end;
$$;

create or replace function private.validate_client_billing_line_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_billing public.client_billings;
  v_company_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required for client billing line activity' using errcode = '42501';
  end if;
  v_company_id := case when tg_op = 'DELETE' then old.company_id else new.company_id end;
  if v_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Client billing lines must belong to the deployment company' using errcode = '42501';
  end if;

  select b.*
    into v_billing
  from public.client_billings b
  where b.company_id = v_company_id
    and b.id = case when tg_op = 'DELETE' then old.billing_id else new.billing_id end
  for key share;

  if not found then
    raise exception 'Client billing line requires an existing billing header' using errcode = '23503';
  end if;
  if v_billing.status <> 'DRAFT' then
    raise exception 'Only draft client billing lines may be changed' using errcode = '42501';
  end if;
  if not (select public.has_company_permission(v_company_id, 'projects.manage')) then
    raise exception 'Unauthorized to change client billing lines' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.company_id is distinct from old.company_id or new.billing_id is distinct from old.billing_id) then
    raise exception 'Client billing line ownership is immutable' using errcode = '42501';
  end if;
  if tg_op <> 'DELETE' then
    new.description := btrim(new.description);
    if new.amount < 0 then
      raise exception 'Client billing line amount cannot be negative' using errcode = '22023';
    end if;
    new.updated_at := now();
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function private.prevent_client_billing_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Client billing history is immutable; cancel or void it through the guarded lifecycle workflow' using errcode = '42501';
end;
$$;

create or replace function private.prevent_client_billing_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Client billing lifecycle history is append-only' using errcode = '42501';
end;
$$;

drop trigger if exists client_billings_company_boundary on public.client_billings;
create trigger client_billings_company_boundary
  before insert or update on public.client_billings
  for each row execute function private.enforce_company_row_boundary();

drop trigger if exists client_billings_scope_guard on public.client_billings;
create trigger client_billings_scope_guard
  before insert or update on public.client_billings
  for each row execute function private.validate_client_billing_scope();

drop trigger if exists client_billings_updated_at on public.client_billings;
create trigger client_billings_updated_at
  before update on public.client_billings
  for each row execute function private.set_company_updated_at();

drop trigger if exists client_billings_delete_guard on public.client_billings;
create trigger client_billings_delete_guard
  before delete on public.client_billings
  for each row execute function private.prevent_client_billing_delete();

drop trigger if exists client_billing_lines_company_boundary on public.client_billing_lines;
create trigger client_billing_lines_company_boundary
  before insert or update on public.client_billing_lines
  for each row execute function private.enforce_company_row_boundary();

drop trigger if exists client_billing_lines_scope_guard on public.client_billing_lines;
create trigger client_billing_lines_scope_guard
  before insert or update or delete on public.client_billing_lines
  for each row execute function private.validate_client_billing_line_scope();

drop trigger if exists client_billing_events_mutation_guard on public.client_billing_events;
create trigger client_billing_events_mutation_guard
  before update or delete on public.client_billing_events
  for each row execute function private.prevent_client_billing_event_mutation();

-- 3. Explicit RLS/grants. The header has no authenticated DELETE grant; line
-- deletion is available only for draft replacement and is trigger-guarded.
alter table public.client_billings enable row level security;
alter table public.client_billing_lines enable row level security;
alter table public.client_billing_events enable row level security;

drop policy if exists client_billings_company_select on public.client_billings;
create policy client_billings_company_select on public.client_billings
  for select to authenticated
  using ((select public.has_company_permission(company_id, 'projects.read')));
drop policy if exists client_billings_company_insert on public.client_billings;
create policy client_billings_company_insert on public.client_billings
  for insert to authenticated
  with check ((select public.has_company_permission(company_id, 'projects.manage')));
drop policy if exists client_billings_company_update on public.client_billings;
create policy client_billings_company_update on public.client_billings
  for update to authenticated
  using ((select public.has_company_permission(company_id, 'projects.manage')))
  with check ((select public.has_company_permission(company_id, 'projects.manage')));

drop policy if exists client_billing_lines_company_select on public.client_billing_lines;
create policy client_billing_lines_company_select on public.client_billing_lines
  for select to authenticated
  using ((select public.has_company_permission(company_id, 'projects.read')));
drop policy if exists client_billing_lines_company_insert on public.client_billing_lines;
create policy client_billing_lines_company_insert on public.client_billing_lines
  for insert to authenticated
  with check ((select public.has_company_permission(company_id, 'projects.manage')));
drop policy if exists client_billing_lines_company_update on public.client_billing_lines;
create policy client_billing_lines_company_update on public.client_billing_lines
  for update to authenticated
  using ((select public.has_company_permission(company_id, 'projects.manage')))
  with check ((select public.has_company_permission(company_id, 'projects.manage')));
drop policy if exists client_billing_lines_company_delete on public.client_billing_lines;
create policy client_billing_lines_company_delete on public.client_billing_lines
  for delete to authenticated
  using ((select public.has_company_permission(company_id, 'projects.manage')));

drop policy if exists client_billing_events_company_select on public.client_billing_events;
create policy client_billing_events_company_select on public.client_billing_events
  for select to authenticated
  using ((select public.has_company_permission(company_id, 'projects.read')));

revoke all on table public.client_billings, public.client_billing_lines, public.client_billing_events from public, anon;
grant select, insert, update on table public.client_billings to authenticated;
grant select, insert, update, delete on table public.client_billing_lines to authenticated;
grant select on table public.client_billing_events to authenticated;

-- 4. Atomic draft save. All header totals returned by this RPC are derived
-- from the replacement line set; no client-supplied total is trusted.
create or replace function public.create_or_update_client_billing(
  p_billing jsonb,
  p_lines jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid := nullif(coalesce(p_billing->>'companyId', p_billing->>'company_id'), '')::uuid;
  v_billing_id uuid := nullif(coalesce(p_billing->>'id', ''), '')::uuid;
  v_project_id uuid := nullif(coalesce(p_billing->>'projectId', p_billing->>'project_id'), '')::uuid;
  v_billing_number text := upper(btrim(coalesce(p_billing->>'billingNumber', p_billing->>'billing_number', '')));
  v_billing_date date := nullif(coalesce(p_billing->>'billingDate', p_billing->>'billing_date', ''), '')::date;
  v_period_start date := nullif(coalesce(p_billing->>'periodStart', p_billing->>'period_start', ''), '')::date;
  v_period_end date := nullif(coalesce(p_billing->>'periodEnd', p_billing->>'period_end', ''), '')::date;
  v_client_name text := nullif(btrim(coalesce(p_billing->>'clientNameSnapshot', p_billing->>'client_name_snapshot', '')), '');
  v_client_reference text := nullif(btrim(coalesce(p_billing->>'clientReferenceSnapshot', p_billing->>'client_reference_snapshot', '')), '');
  v_currency text;
  v_notes text := nullif(btrim(coalesce(p_billing->>'notes', '')), '');
  v_project public.projects;
  v_existing public.client_billings;
  v_line_row jsonb;
  v_line_number integer := 0;
  v_description text;
  v_amount numeric(18,2);
  v_total numeric(18,2);
  v_billing_json jsonb;
  v_lines_json jsonb;
  v_event_type text;
  v_audit_event text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to save client billings' using errcode = '42501';
  end if;
  if p_billing is null or jsonb_typeof(p_billing) <> 'object' then
    raise exception 'Client billing header must be a JSON object' using errcode = '22023';
  end if;
  if v_company_id is null or v_project_id is null then
    raise exception 'Company and project are required for client billing' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then
    raise exception 'Client billing lines must be a JSON array' using errcode = '22023';
  end if;
  perform private.require_project_permission(v_company_id, 'projects.manage');

  select p.*
    into v_project
  from public.projects p
  where p.id = v_project_id
    and p.company_id = v_company_id
  for key share;
  if not found then
    raise exception 'Project does not exist in the deployment company' using errcode = '42501';
  end if;
  if v_project.status in ('ARCHIVED', 'CANCELLED') or v_project.archived_at is not null then
    raise exception 'Archived or cancelled projects cannot receive new client billing activity' using errcode = '42501';
  end if;

  v_currency := upper(btrim(coalesce(nullif(p_billing->>'currency', ''), v_project.currency)));
  if v_currency is distinct from upper(btrim(v_project.currency)) then
    raise exception 'Client billing currency must match the project currency' using errcode = '22023';
  end if;
  if v_billing_number = '' then
    raise exception 'Billing number is required' using errcode = '22023';
  end if;
  if v_period_end is not null and v_period_start is not null and v_period_end < v_period_start then
    raise exception 'Billing period end cannot precede its start' using errcode = '22023';
  end if;
  v_client_name := coalesce(v_client_name, nullif(btrim(v_project.client_name), ''));
  v_client_reference := coalesce(v_client_reference, nullif(btrim(v_project.client_reference), ''));

  if v_billing_id is not null then
    select b.* into v_existing
    from public.client_billings b
    where b.id = v_billing_id and b.company_id = v_company_id
    for update;
    if not found then
      raise exception 'Client billing was not found in the deployment company' using errcode = '23503';
    end if;
    if v_existing.status <> 'DRAFT' then
      raise exception 'Only draft client billings can be edited' using errcode = '42501';
    end if;

    update public.client_billings
    set billing_number = v_billing_number,
        project_id = v_project_id,
        billing_date = coalesce(v_billing_date, current_date),
        period_start = v_period_start,
        period_end = v_period_end,
        client_name_snapshot = v_client_name,
        client_reference_snapshot = v_client_reference,
        currency = v_currency,
        notes = v_notes,
        updated_by_user_id = v_user_id
    where id = v_billing_id and company_id = v_company_id;
    v_event_type := 'UPDATED';
    v_audit_event := 'CLIENT_BILLING_UPDATED';
  else
    v_billing_id := gen_random_uuid();
    insert into public.client_billings (
      id, company_id, project_id, billing_number, billing_date, period_start,
      period_end, client_name_snapshot, client_reference_snapshot, currency,
      status, notes, created_by_user_id, updated_by_user_id
    ) values (
      v_billing_id, v_company_id, v_project_id, v_billing_number,
      coalesce(v_billing_date, current_date), v_period_start, v_period_end,
      v_client_name, v_client_reference, v_currency, 'DRAFT', v_notes,
      v_user_id, v_user_id
    );
    v_event_type := 'CREATED';
    v_audit_event := 'CLIENT_BILLING_CREATED';
  end if;

  delete from public.client_billing_lines
  where company_id = v_company_id and billing_id = v_billing_id;

  for v_line_row in select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_line_number := v_line_number + 1;
    v_description := btrim(coalesce(v_line_row->>'description', ''));
    v_amount := round(coalesce(nullif(v_line_row->>'amount', '')::numeric, 0), 2);
    if v_description = '' then
      raise exception 'Every client billing line needs a description' using errcode = '22023';
    end if;
    if v_amount < 0 then
      raise exception 'Client billing line amount cannot be negative' using errcode = '22023';
    end if;
    insert into public.client_billing_lines (
      company_id, billing_id, line_number, description, amount, notes
    ) values (
      v_company_id, v_billing_id, v_line_number, v_description, v_amount,
      nullif(btrim(coalesce(v_line_row->>'notes', '')), '')
    );
  end loop;

  select coalesce(sum(l.amount), 0)::numeric(18,2)
    into v_total
  from public.client_billing_lines l
  where l.company_id = v_company_id and l.billing_id = v_billing_id;

  insert into public.client_billing_events (
    company_id, billing_id, event_type, from_status, to_status, actor_user_id
  ) values (
    v_company_id, v_billing_id, v_event_type,
    case when v_existing.id is null then null else v_existing.status end,
    'DRAFT', v_user_id
  );
  perform private.write_company_audit(
    v_company_id, v_audit_event, 'client_billing', v_billing_id,
    jsonb_build_object('billingNumber', v_billing_number, 'status', 'DRAFT', 'totalAmount', v_total)
  );

  select to_jsonb(b.*) into v_billing_json
  from public.client_billings b
  where b.id = v_billing_id and b.company_id = v_company_id;
  select coalesce(jsonb_agg(to_jsonb(l.*) order by l.line_number asc), '[]'::jsonb)
    into v_lines_json
  from public.client_billing_lines l
  where l.company_id = v_company_id and l.billing_id = v_billing_id;
  return jsonb_build_object('billing', v_billing_json, 'lines', v_lines_json, 'totalAmount', v_total);
end;
$$;

-- 5. Guarded lifecycle. Issuance locks the project row before reading the
-- cumulative issued total. Every issuance therefore serializes on the same
-- project lock and rechecks the contract ceiling after waiting.
create or replace function public.transition_client_billing(
  p_billing_id uuid,
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
  v_billing public.client_billings;
  v_project public.projects;
  v_target text := upper(btrim(coalesce(p_target_status, '')));
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
  v_company_id uuid;
  v_current_total numeric(18,2);
  v_issued_total numeric(18,2);
  v_contract_value numeric(18,2);
  v_billing_json jsonb;
  v_lines_json jsonb;
  v_event_type text;
  v_audit_event text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to transition client billings' using errcode = '42501';
  end if;
  select b.* into v_billing
  from public.client_billings b
  where b.id = p_billing_id;
  if not found then
    raise exception 'Client billing was not found' using errcode = '23503';
  end if;
  v_company_id := v_billing.company_id;
  perform private.require_project_permission(v_company_id, 'projects.manage');

  -- Project-first lock ordering is shared by every issuance call for the
  -- project; it is the concurrency boundary for the over-billing check.
  select p.* into v_project
  from public.projects p
  where p.id = v_billing.project_id and p.company_id = v_company_id
  for update;
  if not found then
    raise exception 'Client billing project was not found in the deployment company' using errcode = '42501';
  end if;
  select b.* into v_billing
  from public.client_billings b
  where b.id = p_billing_id and b.company_id = v_company_id
  for update;

  if v_target not in ('DRAFT', 'SUBMITTED', 'ISSUED', 'CANCELLED', 'VOIDED') then
    raise exception 'Invalid client billing target status: %', v_target using errcode = '22023';
  end if;
  if v_billing.status = 'DRAFT' and v_target not in ('SUBMITTED', 'CANCELLED') then
    raise exception 'Draft client billings can only be submitted or cancelled' using errcode = '42501';
  elsif v_billing.status = 'SUBMITTED' and v_target not in ('DRAFT', 'ISSUED', 'CANCELLED') then
    raise exception 'Submitted client billings can only return to draft, be issued, or be cancelled' using errcode = '42501';
  elsif v_billing.status = 'ISSUED' and v_target <> 'VOIDED' then
    raise exception 'Issued client billings can only be voided with a reason' using errcode = '42501';
  elsif v_billing.status in ('CANCELLED', 'VOIDED') then
    raise exception 'Cancelled or voided client billings cannot undergo further transitions' using errcode = '42501';
  end if;

  if v_target in ('DRAFT', 'SUBMITTED', 'ISSUED')
     and (v_project.status in ('ARCHIVED', 'CANCELLED') or v_project.archived_at is not null) then
    raise exception 'Only PLANNING, ACTIVE, ON_HOLD, and COMPLETED projects may create, submit, or issue client billings' using errcode = '42501';
  end if;
  if v_target in ('DRAFT', 'CANCELLED', 'VOIDED') and v_reason is null then
    if v_target = 'DRAFT' then
      raise exception 'A reason is required to return a submitted client billing to draft' using errcode = '22023';
    elsif v_target = 'VOIDED' then
      raise exception 'A reason is required to void an issued client billing' using errcode = '22023';
    else
      raise exception 'A reason is required to cancel a client billing' using errcode = '22023';
    end if;
  end if;
  if v_reason is not null and length(v_reason) < 3 then
    raise exception 'Client billing lifecycle reason must be at least 3 characters' using errcode = '22023';
  end if;

  select coalesce(sum(l.amount), 0)::numeric(18,2)
    into v_current_total
  from public.client_billing_lines l
  where l.company_id = v_company_id and l.billing_id = p_billing_id;

  if v_target = 'ISSUED' then
    v_contract_value := v_project.contract_value;
    if v_contract_value is null or v_contract_value <= 0 then
      raise exception 'Client billing cannot be issued until the project has a positive contract value' using errcode = '23514';
    end if;
    if v_current_total <= 0 then
      raise exception 'Client billing must have a positive line total before it can be issued' using errcode = '23514';
    end if;
    select coalesce(sum(l.amount), 0)::numeric(18,2)
      into v_issued_total
    from public.client_billings b
    join public.client_billing_lines l
      on l.company_id = b.company_id and l.billing_id = b.id
    where b.company_id = v_company_id
      and b.project_id = v_billing.project_id
      and b.status = 'ISSUED'
      and b.id <> p_billing_id;
    if v_issued_total + v_current_total > v_contract_value then
      raise exception 'Client billing would exceed the project contract value by %',
        (v_issued_total + v_current_total - v_contract_value)::numeric(18,2)
        using errcode = '23514';
    end if;
  end if;

  update public.client_billings
  set status = v_target,
      updated_by_user_id = v_user_id,
      submitted_by_user_id = case when v_target = 'SUBMITTED' then v_user_id else submitted_by_user_id end,
      submitted_at = case when v_target = 'SUBMITTED' then now() else submitted_at end,
      issued_by_user_id = case when v_target = 'ISSUED' then v_user_id else issued_by_user_id end,
      issued_at = case when v_target = 'ISSUED' then now() else issued_at end,
      cancelled_by_user_id = case when v_target = 'CANCELLED' then v_user_id else cancelled_by_user_id end,
      cancelled_at = case when v_target = 'CANCELLED' then now() else cancelled_at end,
      cancellation_reason = case when v_target = 'CANCELLED' then v_reason else cancellation_reason end,
      voided_by_user_id = case when v_target = 'VOIDED' then v_user_id else voided_by_user_id end,
      voided_at = case when v_target = 'VOIDED' then now() else voided_at end,
      void_reason = case when v_target = 'VOIDED' then v_reason else void_reason end
  where id = p_billing_id and company_id = v_company_id;

  v_event_type := case v_target
    when 'DRAFT' then 'RETURNED_TO_DRAFT'
    when 'SUBMITTED' then 'SUBMITTED'
    when 'ISSUED' then 'ISSUED'
    when 'CANCELLED' then 'CANCELLED'
    when 'VOIDED' then 'VOIDED'
  end;
  v_audit_event := case v_target
    when 'DRAFT' then 'CLIENT_BILLING_RETURNED_TO_DRAFT'
    when 'SUBMITTED' then 'CLIENT_BILLING_SUBMITTED'
    when 'ISSUED' then 'CLIENT_BILLING_ISSUED'
    when 'CANCELLED' then 'CLIENT_BILLING_CANCELLED'
    when 'VOIDED' then 'CLIENT_BILLING_VOIDED'
  end;
  insert into public.client_billing_events (
    company_id, billing_id, event_type, from_status, to_status, reason, actor_user_id
  ) values (
    v_company_id, p_billing_id, v_event_type, v_billing.status, v_target, v_reason, v_user_id
  );
  perform private.write_company_audit(
    v_company_id, v_audit_event, 'client_billing', p_billing_id,
    jsonb_build_object(
      'billingNumber', v_billing.billing_number,
      'fromStatus', v_billing.status,
      'toStatus', v_target,
      'reason', v_reason,
      'totalAmount', v_current_total,
      'issuedTotalBefore', case when v_target = 'ISSUED' then v_issued_total else null end
    )
  );

  select to_jsonb(b.*) into v_billing_json
  from public.client_billings b
  where b.id = p_billing_id and b.company_id = v_company_id;
  select coalesce(jsonb_agg(to_jsonb(l.*) order by l.line_number asc), '[]'::jsonb)
    into v_lines_json
  from public.client_billing_lines l
  where l.company_id = v_company_id and l.billing_id = p_billing_id;
  return jsonb_build_object('billing', v_billing_json, 'lines', v_lines_json, 'totalAmount', v_current_total);
end;
$$;

revoke all on function public.create_or_update_client_billing(jsonb, jsonb) from public, anon;
revoke all on function public.transition_client_billing(uuid, text, text) from public, anon;
grant execute on function public.create_or_update_client_billing(jsonb, jsonb) to authenticated;
grant execute on function public.transition_client_billing(uuid, text, text) to authenticated;

-- 6. Forward project lifecycle preflight update. Keep the complete latest
-- P2B-2/P2B-3 dependency set and add client billing history so a billed project
-- can never qualify for permanent unused deletion.
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
  v_client_billings bigint;
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
    raise exception 'The current user is not authorized for project lifecycle preflight' using errcode = '42501';
  end if;

  select p.* into v_project
  from public.projects p
  where p.id = p_project_id and p.company_id = p_company_id;
  if not found then
    raise exception 'Project does not exist in the deployment company' using errcode = '42501';
  end if;

  select count(*) into v_invoice_allocations from public.invoice_project_allocations a where a.company_id = p_company_id and a.project_id = p_project_id;
  select count(*) into v_expenses from public.expenses e where e.company_id = p_company_id and e.project_id = p_project_id;
  select count(*) into v_assignments from public.project_worker_assignments a where a.company_id = p_company_id and a.project_id = p_project_id;
  select count(*) into v_work_entries from public.work_entries e where e.company_id = p_company_id and e.project_id = p_project_id;
  select count(*) into v_overtime_requests from public.overtime_requests o where o.company_id = p_company_id and o.project_id = p_project_id;
  select count(*) into v_payroll_allocations from public.payroll_project_allocations a where a.company_id = p_company_id and a.project_id = p_project_id;
  select count(*) into v_payroll_entry_contexts
  from public.payroll_entries e
  where e.company_id = p_company_id
    and (e.cost_context ->> 'projectId' = p_project_id::text
      or e.cost_context ->> 'project_id' = p_project_id::text
      or e.calculation_snapshot #>> '{costContext,projectId}' = p_project_id::text
      or e.calculation_snapshot #>> '{costContext,project_id}' = p_project_id::text
      or e.calculation_snapshot::text like '%' || p_project_id::text || '%');
  select count(*) into v_import_rows from public.payroll_import_rows r where r.company_id = p_company_id and r.project_id = p_project_id;
  select count(*) into v_worker_defaults from public.workers w where w.company_id = p_company_id and w.default_project_id = p_project_id;
  select count(*) into v_compensation_defaults from public.worker_compensation_profiles cp where cp.company_id = p_company_id and cp.default_project_id = p_project_id;
  select count(*) into v_engineering_documents from public.engineering_documents d where d.company_id = p_company_id and d.project_id = p_project_id;
  select count(*) into v_engineering_rfis from public.engineering_rfis r where r.company_id = p_company_id and r.project_id = p_project_id;
  select count(*) into v_engineering_submittals from public.engineering_submittals s where s.company_id = p_company_id and s.project_id = p_project_id;
  select count(*) into v_daily_site_logs from public.engineering_daily_site_logs l where l.company_id = p_company_id and l.project_id = p_project_id;
  select count(*) into v_accounting_events from public.project_accounting_events e where e.company_id = p_company_id and e.project_id = p_project_id;
  select count(*) into v_purchase_orders from public.purchase_orders po where po.company_id = p_company_id and po.project_id = p_project_id;
  select count(*) into v_subcontracts from public.subcontracts sc where sc.company_id = p_company_id and sc.project_id = p_project_id;
  select count(*) into v_subcontract_claims from public.subcontract_progress_claims c where c.company_id = p_company_id and c.project_id = p_project_id;
  select count(*) into v_subcontract_variations from public.subcontract_variations sv where sv.company_id = p_company_id and sv.project_id = p_project_id;
  select count(*) into v_client_billings from public.client_billings b where b.company_id = p_company_id and b.project_id = p_project_id;

  v_total := v_invoice_allocations + v_expenses + v_assignments + v_work_entries
    + v_overtime_requests + v_payroll_allocations + v_payroll_entry_contexts
    + v_import_rows + v_worker_defaults + v_compensation_defaults
    + v_engineering_documents + v_engineering_rfis + v_engineering_submittals
    + v_daily_site_logs + v_accounting_events + v_purchase_orders + v_subcontracts
    + v_subcontract_claims + v_subcontract_variations + v_client_billings;
  v_can_delete := v_total = 0;
  v_can_reactivate := coalesce(
    v_project.status = 'ARCHIVED'
      and v_project.archived_at is not null
      and v_project.archived_from_status in ('PLANNING', 'ACTIVE', 'ON_HOLD'), false);

  return jsonb_build_object(
    'projectId', p_project_id,
    'projectCode', v_project.project_code,
    'projectName', v_project.project_name,
    'status', v_project.status,
    'archivedAt', v_project.archived_at,
    'archivedFromStatus', v_project.archived_from_status,
    'canDelete', v_can_delete,
    'canReactivate', v_can_reactivate,
    'recommendedAction', case when v_can_delete then 'DELETE_UNUSED' when v_can_reactivate then 'REACTIVATE' else 'ARCHIVE' end,
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
      'projectAccountingEvents', v_accounting_events,
      'purchaseOrders', v_purchase_orders,
      'subcontracts', v_subcontracts,
      'subcontractProgressClaims', v_subcontract_claims,
      'subcontractVariations', v_subcontract_variations,
      'clientBillings', v_client_billings
    )
  );
end;
$$;

revoke execute on function private.validate_client_billing_scope() from public, anon, authenticated;
revoke execute on function private.validate_client_billing_line_scope() from public, anon, authenticated;
revoke execute on function private.prevent_client_billing_delete() from public, anon, authenticated;
revoke execute on function private.prevent_client_billing_event_mutation() from public, anon, authenticated;
revoke execute on function private.project_lifecycle_preflight(uuid, uuid) from public, anon, authenticated;
