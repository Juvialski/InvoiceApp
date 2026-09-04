-- ============================================================================
-- P2B-5 Client Collections / Receivables Foundation
--
-- Client collection is commercial receivable-side history. It is deliberately
-- separate from client billings, supplier invoices, project costs, commitments,
-- cash, banking transactions, settlements, and accounting postings.
--
-- Only RECORDED collections against ISSUED billings contribute to collected-to-date.
-- Over-collection is guarded at the database level with deterministic row-level locks.
-- ============================================================================

-- Keep the append-only company audit allowlist a strict superset of every
-- event accepted by current main, then add the P2B-5 collection lifecycle events.
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
    'CLIENT_BILLING_CANCELLED', 'CLIENT_BILLING_VOIDED',
    'CLIENT_COLLECTION_CREATED', 'CLIENT_COLLECTION_UPDATED',
    'CLIENT_COLLECTION_RECORDED', 'CLIENT_COLLECTION_REVERSED'
  ));

-- 1. Collection header, allocation, and event tables.
create table if not exists public.client_collections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  project_id uuid not null,
  collection_number text not null check (length(btrim(collection_number)) between 1 and 80 and collection_number = upper(btrim(collection_number))),
  collection_date date not null default current_date,
  external_reference text check (external_reference is null or length(btrim(external_reference)) between 1 and 100),
  payer_snapshot text check (payer_snapshot is null or length(btrim(payer_snapshot)) between 1 and 200),
  currency text not null default 'PHP' check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'RECORDED', 'REVERSED')),
  notes text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  recorded_by_user_id uuid references auth.users(id) on delete set null,
  recorded_at timestamptz,
  reversed_by_user_id uuid references auth.users(id) on delete set null,
  reversed_at timestamptz,
  reversal_reason text check (reversal_reason is null or length(btrim(reversal_reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_collections_company_id_id_key unique (company_id, id),
  constraint client_collections_company_project_fk
    foreign key (company_id, project_id)
    references public.projects(company_id, id) on delete restrict
);

create unique index if not exists client_collections_company_number_unique
  on public.client_collections(company_id, lower(collection_number));

create index if not exists client_collections_company_project_status_idx
  on public.client_collections(company_id, project_id, status, collection_date desc, updated_at desc);

create table if not exists public.client_collection_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  collection_id uuid not null,
  billing_id uuid not null,
  amount numeric(18,2) not null check (amount > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_collection_allocations_company_id_id_key unique (company_id, id),
  constraint client_collection_allocations_company_col_bill_key unique (company_id, collection_id, billing_id),
  constraint client_collection_allocations_company_collection_fk
    foreign key (company_id, collection_id)
    references public.client_collections(company_id, id) on delete cascade,
  constraint client_collection_allocations_company_billing_fk
    foreign key (company_id, billing_id)
    references public.client_billings(company_id, id) on delete restrict
);

create index if not exists client_collection_allocations_company_col_idx
  on public.client_collection_allocations(company_id, collection_id);

create index if not exists client_collection_allocations_company_bill_idx
  on public.client_collection_allocations(company_id, billing_id);

create table if not exists public.client_collection_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  collection_id uuid not null,
  event_type text not null check (event_type in ('CREATED', 'UPDATED', 'RECORDED', 'REVERSED')),
  from_status text,
  to_status text not null,
  reason text,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint client_collection_events_company_collection_fk
    foreign key (company_id, collection_id)
    references public.client_collections(company_id, id) on delete restrict
);

create index if not exists client_collection_events_company_col_idx
  on public.client_collection_events(company_id, collection_id, created_at desc, id desc);

-- 2. Tenant policy catalog integration.
insert into private.company_tenant_policy_catalog (table_name, read_permission, write_permission, allow_insert, allow_update, allow_delete)
values
  ('client_collections', 'projects.read', 'projects.manage', true, true, false),
  ('client_collection_allocations', 'projects.read', 'projects.manage', true, true, true)
on conflict (table_name) do update set
  read_permission = excluded.read_permission,
  write_permission = excluded.write_permission,
  allow_insert = excluded.allow_insert,
  allow_update = excluded.allow_update,
  allow_delete = excluded.allow_delete;

-- 3. Scope validation and immutability triggers.
create or replace function private.validate_client_collection_scope()
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
    raise exception 'Authentication is required for client collection activity' using errcode = '42501';
  end if;
  if new.company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Client collection must belong to the deployment company' using errcode = '42501';
  end if;

  select p.*
    into v_project
  from public.projects p
  where p.id = new.project_id
  for key share;

  if not found then
    raise exception 'Client collection requires an existing project' using errcode = '23503';
  end if;
  if v_project.company_id is distinct from new.company_id then
    raise exception 'Client collection project is outside the company' using errcode = '42501';
  end if;
  v_project_is_archived := v_project.status = 'ARCHIVED' or v_project.archived_at is not null;

  -- Reversal of existing recorded collection is permitted after project archive
  -- for historical correction. No new collection creation or recording can target
  -- an archived or cancelled project.
  if v_project_is_archived
     and not (tg_op = 'UPDATE' and old.status = 'RECORDED' and new.status = 'REVERSED' and current_user in ('postgres', 'service_role')) then
    raise exception 'Archived projects cannot receive new client collection activity' using errcode = '42501';
  end if;
  if v_project.status = 'CANCELLED'
     and not (tg_op = 'UPDATE' and old.status = 'RECORDED' and new.status = 'REVERSED' and current_user in ('postgres', 'service_role')) then
    raise exception 'Cancelled projects cannot receive new client collection activity' using errcode = '42501';
  end if;

  v_project_currency := upper(btrim(coalesce(v_project.currency, '')));
  if new.currency is null then
    new.currency := v_project_currency;
  else
    new.currency := upper(btrim(new.currency));
  end if;
  if new.currency is distinct from v_project_currency then
    raise exception 'Client collection currency must match the project currency' using errcode = '22023';
  end if;
  new.collection_number := upper(btrim(new.collection_number));
  new.payer_snapshot := nullif(btrim(coalesce(new.payer_snapshot, v_project.client_name)), '');
  new.external_reference := nullif(btrim(new.external_reference), '');

  if tg_op = 'INSERT' then
    if not (select public.has_company_permission(new.company_id, 'projects.manage')) then
      raise exception 'Unauthorized to create client collections' using errcode = '42501';
    end if;
    if new.status <> 'DRAFT' then
      raise exception 'Client collections must be created as DRAFT and finalized through the guarded lifecycle' using errcode = '42501';
    end if;
    new.created_at := now();
    new.updated_at := now();
    new.created_by_user_id := v_user_id;
    new.updated_by_user_id := v_user_id;
    new.recorded_by_user_id := null;
    new.recorded_at := null;
    new.reversed_by_user_id := null;
    new.reversed_at := null;
    new.reversal_reason := null;
    return new;
  end if;

  if new.company_id is distinct from old.company_id then
    raise exception 'Client collection company is immutable' using errcode = '42501';
  end if;
  if new.created_by_user_id is distinct from old.created_by_user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Client collection creation provenance is immutable' using errcode = '42501';
  end if;

  if old.status <> 'DRAFT' and (
    new.collection_number is distinct from old.collection_number or
    new.project_id is distinct from old.project_id or
    new.collection_date is distinct from old.collection_date or
    new.external_reference is distinct from old.external_reference or
    new.payer_snapshot is distinct from old.payer_snapshot or
    new.currency is distinct from old.currency or
    new.notes is distinct from old.notes
  ) then
    raise exception 'Recorded or reversed client collection terms are immutable' using errcode = '42501';
  end if;

  if new.status is distinct from old.status and current_user not in ('postgres', 'service_role') then
    raise exception 'Use the guarded client collection lifecycle workflow for status changes' using errcode = '42501';
  end if;

  if current_user not in ('postgres', 'service_role') and (
    new.recorded_by_user_id is distinct from old.recorded_by_user_id or
    new.recorded_at is distinct from old.recorded_at or
    new.reversed_by_user_id is distinct from old.reversed_by_user_id or
    new.reversed_at is distinct from old.reversed_at or
    new.reversal_reason is distinct from old.reversal_reason
  ) then
    raise exception 'Client collection lifecycle audit metadata is immutable outside a lifecycle transition' using errcode = '42501';
  end if;

  if old.status = 'DRAFT' and new.status = 'DRAFT' then
    if not (select public.has_company_permission(new.company_id, 'projects.manage')) then
      raise exception 'Unauthorized to edit client collections' using errcode = '42501';
    end if;
    new.updated_by_user_id := v_user_id;
  end if;
  return new;
end;
$$;

create or replace function private.validate_client_collection_allocation_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_collection public.client_collections;
  v_billing public.client_billings;
  v_company_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required for client collection allocation activity' using errcode = '42501';
  end if;
  v_company_id := case when tg_op = 'DELETE' then old.company_id else new.company_id end;
  if v_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Client collection allocations must belong to the deployment company' using errcode = '42501';
  end if;

  select c.*
    into v_collection
  from public.client_collections c
  where c.company_id = v_company_id
    and c.id = case when tg_op = 'DELETE' then old.collection_id else new.collection_id end
  for key share;

  if not found then
    raise exception 'Client collection allocation requires an existing collection header' using errcode = '23503';
  end if;
  if v_collection.status <> 'DRAFT' then
    raise exception 'Only draft client collection allocations may be changed' using errcode = '42501';
  end if;
  if not (select public.has_company_permission(v_company_id, 'projects.manage')) then
    raise exception 'Unauthorized to change client collection allocations' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and (
    new.company_id is distinct from old.company_id or
    new.collection_id is distinct from old.collection_id or
    new.billing_id is distinct from old.billing_id
  ) then
    raise exception 'Client collection allocation ownership is immutable' using errcode = '42501';
  end if;

  if tg_op <> 'DELETE' then
    select b.*
      into v_billing
    from public.client_billings b
    where b.company_id = v_company_id
      and b.id = new.billing_id
    for key share;

    if not found then
      raise exception 'Target client billing does not exist in the company' using errcode = '23503';
    end if;
    if v_billing.project_id is distinct from v_collection.project_id then
      raise exception 'Collection allocation billing must belong to the collection project' using errcode = '42501';
    end if;
    if v_billing.currency is distinct from v_collection.currency then
      raise exception 'Collection allocation billing currency must match collection currency' using errcode = '22023';
    end if;
    if v_billing.status <> 'ISSUED' then
      raise exception 'Only ISSUED client billings may receive collection allocations' using errcode = '42501';
    end if;
    if new.amount <= 0 then
      raise exception 'Client collection allocation amount must be positive' using errcode = '22023';
    end if;
    new.updated_at := now();
    return new;
  end if;

  return old;
end;
$$;

create or replace function private.prevent_client_collection_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Client collection history is immutable; reverse it through the guarded lifecycle workflow' using errcode = '42501';
end;
$$;

create or replace function private.prevent_client_collection_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Client collection lifecycle history is append-only' using errcode = '42501';
end;
$$;

drop trigger if exists client_collections_company_boundary on public.client_collections;
create trigger client_collections_company_boundary
  before insert or update on public.client_collections
  for each row execute function private.enforce_company_row_boundary();

drop trigger if exists client_collections_scope_guard on public.client_collections;
create trigger client_collections_scope_guard
  before insert or update on public.client_collections
  for each row execute function private.validate_client_collection_scope();

drop trigger if exists client_collections_updated_at on public.client_collections;
create trigger client_collections_updated_at
  before update on public.client_collections
  for each row execute function private.set_company_updated_at();

drop trigger if exists client_collections_delete_guard on public.client_collections;
create trigger client_collections_delete_guard
  before delete on public.client_collections
  for each row execute function private.prevent_client_collection_delete();

drop trigger if exists client_collection_allocations_company_boundary on public.client_collection_allocations;
create trigger client_collection_allocations_company_boundary
  before insert or update on public.client_collection_allocations
  for each row execute function private.enforce_company_row_boundary();

drop trigger if exists client_collection_allocations_scope_guard on public.client_collection_allocations;
create trigger client_collection_allocations_scope_guard
  before insert or update or delete on public.client_collection_allocations
  for each row execute function private.validate_client_collection_allocation_scope();

drop trigger if exists client_collection_events_mutation_guard on public.client_collection_events;
create trigger client_collection_events_mutation_guard
  before update or delete on public.client_collection_events
  for each row execute function private.prevent_client_collection_event_mutation();

-- 4. Explicit RLS policies and role grants.
alter table public.client_collections enable row level security;
alter table public.client_collection_allocations enable row level security;
alter table public.client_collection_events enable row level security;

drop policy if exists client_collections_company_select on public.client_collections;
create policy client_collections_company_select on public.client_collections
  for select to authenticated
  using ((select public.has_company_permission(company_id, 'projects.read')));

drop policy if exists client_collections_company_insert on public.client_collections;
create policy client_collections_company_insert on public.client_collections
  for insert to authenticated
  with check ((select public.has_company_permission(company_id, 'projects.manage')));

drop policy if exists client_collections_company_update on public.client_collections;
create policy client_collections_company_update on public.client_collections
  for update to authenticated
  using ((select public.has_company_permission(company_id, 'projects.manage')))
  with check ((select public.has_company_permission(company_id, 'projects.manage')));

drop policy if exists client_collection_allocations_company_select on public.client_collection_allocations;
create policy client_collection_allocations_company_select on public.client_collection_allocations
  for select to authenticated
  using ((select public.has_company_permission(company_id, 'projects.read')));

drop policy if exists client_collection_allocations_company_insert on public.client_collection_allocations;
create policy client_collection_allocations_company_insert on public.client_collection_allocations
  for insert to authenticated
  with check ((select public.has_company_permission(company_id, 'projects.manage')));

drop policy if exists client_collection_allocations_company_update on public.client_collection_allocations;
create policy client_collection_allocations_company_update on public.client_collection_allocations
  for update to authenticated
  using ((select public.has_company_permission(company_id, 'projects.manage')))
  with check ((select public.has_company_permission(company_id, 'projects.manage')));

drop policy if exists client_collection_allocations_company_delete on public.client_collection_allocations;
create policy client_collection_allocations_company_delete on public.client_collection_allocations
  for delete to authenticated
  using ((select public.has_company_permission(company_id, 'projects.manage')));

drop policy if exists client_collection_events_company_select on public.client_collection_events;
create policy client_collection_events_company_select on public.client_collection_events
  for select to authenticated
  using ((select public.has_company_permission(company_id, 'projects.read')));

revoke all on table public.client_collections, public.client_collection_allocations, public.client_collection_events from public, anon, authenticated;
grant select, insert, update on table public.client_collections to authenticated;
grant select, insert, update, delete on table public.client_collection_allocations to authenticated;
grant select on table public.client_collection_events to authenticated;

-- 5. Guarded RPCs: Draft Save, Record (with over-collection concurrency locks), and Reversal.
create or replace function public.create_or_update_client_collection(
  p_collection jsonb,
  p_allocations jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid := nullif(coalesce(p_collection->>'companyId', p_collection->>'company_id'), '')::uuid;
  v_collection_id uuid := nullif(coalesce(p_collection->>'id', ''), '')::uuid;
  v_project_id uuid := nullif(coalesce(p_collection->>'projectId', p_collection->>'project_id'), '')::uuid;
  v_collection_number text := upper(btrim(coalesce(p_collection->>'collectionNumber', p_collection->>'collection_number', '')));
  v_collection_date date := nullif(coalesce(p_collection->>'collectionDate', p_collection->>'collection_date', ''), '')::date;
  v_external_reference text := nullif(btrim(coalesce(p_collection->>'externalReference', p_collection->>'external_reference', '')), '');
  v_payer_snapshot text := nullif(btrim(coalesce(p_collection->>'payerSnapshot', p_collection->>'payer_snapshot', '')), '');
  v_currency text;
  v_notes text := nullif(btrim(coalesce(p_collection->>'notes', '')), '');
  v_project public.projects;
  v_existing public.client_collections;
  v_alloc_row jsonb;
  v_billing_id uuid;
  v_amount numeric(18,2);
  v_total numeric(18,2) := 0;
  v_billing public.client_billings;
  v_collection_json jsonb;
  v_allocations_json jsonb;
  v_event_type text;
  v_audit_event text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to save client collections' using errcode = '42501';
  end if;
  if p_collection is null or jsonb_typeof(p_collection) <> 'object' then
    raise exception 'Client collection header must be a JSON object' using errcode = '22023';
  end if;
  if v_company_id is null or v_project_id is null then
    raise exception 'Company and project are required for client collection' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_allocations, '[]'::jsonb)) <> 'array' then
    raise exception 'Client collection allocations must be a JSON array' using errcode = '22023';
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
    raise exception 'Archived or cancelled projects cannot receive new client collection activity' using errcode = '42501';
  end if;

  v_currency := upper(btrim(coalesce(nullif(p_collection->>'currency', ''), v_project.currency)));
  if v_currency is distinct from upper(btrim(v_project.currency)) then
    raise exception 'Client collection currency must match the project currency' using errcode = '22023';
  end if;
  if v_collection_number = '' then
    raise exception 'Collection number is required' using errcode = '22023';
  end if;
  v_payer_snapshot := coalesce(v_payer_snapshot, nullif(btrim(v_project.client_name), ''));

  if v_collection_id is not null then
    select c.* into v_existing
    from public.client_collections c
    where c.id = v_collection_id and c.company_id = v_company_id
    for update;
    if not found then
      raise exception 'Client collection was not found in the deployment company' using errcode = '23503';
    end if;
    if v_existing.status <> 'DRAFT' then
      raise exception 'Only draft client collections can be edited' using errcode = '42501';
    end if;

    update public.client_collections
    set collection_number = v_collection_number,
        project_id = v_project_id,
        collection_date = coalesce(v_collection_date, current_date),
        external_reference = v_external_reference,
        payer_snapshot = v_payer_snapshot,
        currency = v_currency,
        notes = v_notes,
        updated_by_user_id = v_user_id
    where id = v_collection_id and company_id = v_company_id;
    v_event_type := 'UPDATED';
    v_audit_event := 'CLIENT_COLLECTION_UPDATED';
  else
    v_collection_id := gen_random_uuid();
    insert into public.client_collections (
      id, company_id, project_id, collection_number, collection_date,
      external_reference, payer_snapshot, currency, status, notes,
      created_by_user_id, updated_by_user_id
    ) values (
      v_collection_id, v_company_id, v_project_id, v_collection_number,
      coalesce(v_collection_date, current_date), v_external_reference,
      v_payer_snapshot, v_currency, 'DRAFT', v_notes,
      v_user_id, v_user_id
    );
    v_event_type := 'CREATED';
    v_audit_event := 'CLIENT_COLLECTION_CREATED';
  end if;

  delete from public.client_collection_allocations
  where company_id = v_company_id and collection_id = v_collection_id;

  for v_alloc_row in select value from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) loop
    v_billing_id := nullif(coalesce(v_alloc_row->>'billingId', v_alloc_row->>'billing_id'), '')::uuid;
    v_amount := round(coalesce(nullif(v_alloc_row->>'amount', '')::numeric, 0), 2);
    if v_billing_id is null then
      raise exception 'Every collection allocation must target a client billing' using errcode = '22023';
    end if;
    if v_amount <= 0 then
      raise exception 'Collection allocation amount must be positive' using errcode = '22023';
    end if;

    select b.* into v_billing
    from public.client_billings b
    where b.id = v_billing_id and b.company_id = v_company_id
    for key share;
    if not found then
      raise exception 'Target client billing does not exist in the company' using errcode = '23503';
    end if;
    if v_billing.project_id is distinct from v_project_id then
      raise exception 'Collection allocation billing must belong to the collection project' using errcode = '42501';
    end if;
    if v_billing.currency is distinct from v_currency then
      raise exception 'Collection allocation billing currency must match collection currency' using errcode = '22023';
    end if;
    if v_billing.status <> 'ISSUED' then
      raise exception 'Only ISSUED client billings may receive collection allocations' using errcode = '42501';
    end if;

    insert into public.client_collection_allocations (
      company_id, collection_id, billing_id, amount, notes
    ) values (
      v_company_id, v_collection_id, v_billing_id, v_amount,
      nullif(btrim(coalesce(v_alloc_row->>'notes', '')), '')
    );
    v_total := v_total + v_amount;
  end loop;

  insert into public.client_collection_events (
    company_id, collection_id, event_type, from_status, to_status, actor_user_id
  ) values (
    v_company_id, v_collection_id, v_event_type,
    case when v_existing.id is null then null else v_existing.status end,
    'DRAFT', v_user_id
  );

  perform private.write_company_audit(
    v_company_id, v_audit_event, 'client_collection', v_collection_id,
    jsonb_build_object('collectionNumber', v_collection_number, 'status', 'DRAFT', 'totalAmount', v_total)
  );

  select to_jsonb(c.*) into v_collection_json
  from public.client_collections c
  where c.id = v_collection_id and c.company_id = v_company_id;

  select coalesce(jsonb_agg(to_jsonb(a.*) order by a.created_at asc), '[]'::jsonb)
    into v_allocations_json
  from public.client_collection_allocations a
  where a.company_id = v_company_id and a.collection_id = v_collection_id;

  return jsonb_build_object('collection', v_collection_json, 'allocations', v_allocations_json, 'totalAmount', v_total);
end;
$$;

create or replace function public.record_client_collection(
  p_collection_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_collection public.client_collections;
  v_project public.projects;
  v_company_id uuid;
  v_alloc record;
  v_billing public.client_billings;
  v_billing_total numeric(18,2);
  v_already_collected numeric(18,2);
  v_total_amount numeric(18,2) := 0;
  v_collection_json jsonb;
  v_allocations_json jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to record client collections' using errcode = '42501';
  end if;

  select c.* into v_collection
  from public.client_collections c
  where c.id = p_collection_id;
  if not found then
    raise exception 'Client collection was not found' using errcode = '23503';
  end if;
  v_company_id := v_collection.company_id;
  perform private.require_project_permission(v_company_id, 'projects.manage');

  if v_collection.status <> 'DRAFT' then
    raise exception 'Only draft client collections can be recorded' using errcode = '42501';
  end if;

  -- 1. Project-first lock ordering ensures deterministic serialization across all collections for this project.
  select p.* into v_project
  from public.projects p
  where p.id = v_collection.project_id and p.company_id = v_company_id
  for update;
  if not found then
    raise exception 'Project was not found in the deployment company' using errcode = '42501';
  end if;
  if v_project.status in ('ARCHIVED', 'CANCELLED') or v_project.archived_at is not null then
    raise exception 'Archived or cancelled projects cannot receive new collection activity' using errcode = '42501';
  end if;

  -- 2. Lock collection header row.
  select c.* into v_collection
  from public.client_collections c
  where c.id = p_collection_id and c.company_id = v_company_id
  for update;

  -- Must have at least one allocation.
  if not exists (
    select 1 from public.client_collection_allocations
    where company_id = v_company_id and collection_id = p_collection_id
  ) then
    raise exception 'Client collection must have at least one allocation before it can be recorded' using errcode = '22023';
  end if;

  -- 3. Deterministic lock ordering on target billing rows.
  perform 1
  from public.client_billings
  where company_id = v_company_id
    and id in (
      select billing_id
      from public.client_collection_allocations
      where company_id = v_company_id and collection_id = p_collection_id
    )
  order by id
  for update;

  -- 4. Recompute active recorded allocations for each target billing and enforce over-collection invariant.
  for v_alloc in
    select a.billing_id, a.amount
    from public.client_collection_allocations a
    where a.company_id = v_company_id and a.collection_id = p_collection_id
    order by a.billing_id
  loop
    select b.* into v_billing
    from public.client_billings b
    where b.id = v_alloc.billing_id and b.company_id = v_company_id;

    if v_billing.status <> 'ISSUED' then
      raise exception 'Only ISSUED client billings may receive collection allocations (billing % is %)',
        v_billing.billing_number, v_billing.status using errcode = '42501';
    end if;

    select coalesce(sum(l.amount), 0)::numeric(18,2)
      into v_billing_total
    from public.client_billing_lines l
    where l.company_id = v_company_id and l.billing_id = v_alloc.billing_id;

    select coalesce(sum(a.amount), 0)::numeric(18,2)
      into v_already_collected
    from public.client_collection_allocations a
    join public.client_collections c
      on c.company_id = a.company_id and c.id = a.collection_id
    where a.company_id = v_company_id
      and a.billing_id = v_alloc.billing_id
      and c.status = 'RECORDED'
      and c.id <> p_collection_id;

    if (v_already_collected + v_alloc.amount) > v_billing_total then
      raise exception 'Collection allocation of % exceeds remaining uncollected billing amount of % for billing %',
        v_alloc.amount, (v_billing_total - v_already_collected)::numeric(18,2), v_billing.billing_number
        using errcode = '23514';
    end if;

    v_total_amount := v_total_amount + v_alloc.amount;
  end loop;

  -- 5. Record collection.
  update public.client_collections
  set status = 'RECORDED',
      recorded_by_user_id = v_user_id,
      recorded_at = now(),
      updated_by_user_id = v_user_id,
      updated_at = now()
  where id = p_collection_id and company_id = v_company_id;

  insert into public.client_collection_events (
    company_id, collection_id, event_type, from_status, to_status, actor_user_id
  ) values (
    v_company_id, p_collection_id, 'RECORDED', 'DRAFT', 'RECORDED', v_user_id
  );

  perform private.write_company_audit(
    v_company_id, 'CLIENT_COLLECTION_RECORDED', 'client_collection', p_collection_id,
    jsonb_build_object(
      'collectionNumber', v_collection.collection_number,
      'status', 'RECORDED',
      'totalAmount', v_total_amount
    )
  );

  select to_jsonb(c.*) into v_collection_json
  from public.client_collections c
  where c.id = p_collection_id and c.company_id = v_company_id;

  select coalesce(jsonb_agg(to_jsonb(a.*) order by a.created_at asc), '[]'::jsonb)
    into v_allocations_json
  from public.client_collection_allocations a
  where a.company_id = v_company_id and a.collection_id = p_collection_id;

  return jsonb_build_object('collection', v_collection_json, 'allocations', v_allocations_json, 'totalAmount', v_total_amount);
end;
$$;

create or replace function public.reverse_client_collection(
  p_collection_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_collection public.client_collections;
  v_company_id uuid;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
  v_total_amount numeric(18,2);
  v_collection_json jsonb;
  v_allocations_json jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to reverse client collections' using errcode = '42501';
  end if;
  if v_reason is null or length(v_reason) < 3 then
    raise exception 'A reason of at least 3 characters is required to reverse a recorded client collection' using errcode = '22023';
  end if;

  select c.* into v_collection
  from public.client_collections c
  where c.id = p_collection_id;
  if not found then
    raise exception 'Client collection was not found' using errcode = '23503';
  end if;
  v_company_id := v_collection.company_id;
  perform private.require_project_permission(v_company_id, 'projects.manage');

  if v_collection.status <> 'RECORDED' then
    raise exception 'Only RECORDED client collections can be reversed' using errcode = '42501';
  end if;

  -- Lock project and collection rows.
  perform 1
  from public.projects p
  where p.id = v_collection.project_id and p.company_id = v_company_id
  for update;

  select c.* into v_collection
  from public.client_collections c
  where c.id = p_collection_id and c.company_id = v_company_id
  for update;

  -- Lock target billings in deterministic order.
  perform 1
  from public.client_billings
  where company_id = v_company_id
    and id in (
      select billing_id
      from public.client_collection_allocations
      where company_id = v_company_id and collection_id = p_collection_id
    )
  order by id
  for update;

  select coalesce(sum(amount), 0)::numeric(18,2)
    into v_total_amount
  from public.client_collection_allocations
  where company_id = v_company_id and collection_id = p_collection_id;

  update public.client_collections
  set status = 'REVERSED',
      reversed_by_user_id = v_user_id,
      reversed_at = now(),
      reversal_reason = v_reason,
      updated_by_user_id = v_user_id,
      updated_at = now()
  where id = p_collection_id and company_id = v_company_id;

  insert into public.client_collection_events (
    company_id, collection_id, event_type, from_status, to_status, reason, actor_user_id
  ) values (
    v_company_id, p_collection_id, 'REVERSED', 'RECORDED', 'REVERSED', v_reason, v_user_id
  );

  perform private.write_company_audit(
    v_company_id, 'CLIENT_COLLECTION_REVERSED', 'client_collection', p_collection_id,
    jsonb_build_object(
      'collectionNumber', v_collection.collection_number,
      'status', 'REVERSED',
      'reason', v_reason,
      'totalAmount', v_total_amount
    )
  );

  select to_jsonb(c.*) into v_collection_json
  from public.client_collections c
  where c.id = p_collection_id and c.company_id = v_company_id;

  select coalesce(jsonb_agg(to_jsonb(a.*) order by a.created_at asc), '[]'::jsonb)
    into v_allocations_json
  from public.client_collection_allocations a
  where a.company_id = v_company_id and a.collection_id = p_collection_id;

  return jsonb_build_object('collection', v_collection_json, 'allocations', v_allocations_json, 'totalAmount', v_total_amount);
end;
$$;

revoke all on function public.create_or_update_client_collection(jsonb, jsonb) from public, anon;
revoke all on function public.record_client_collection(uuid) from public, anon;
revoke all on function public.reverse_client_collection(uuid, text) from public, anon;
grant execute on function public.create_or_update_client_collection(jsonb, jsonb) to authenticated;
grant execute on function public.record_client_collection(uuid) to authenticated;
grant execute on function public.reverse_client_collection(uuid, text) to authenticated;

-- 6. Project lifecycle preflight update: count client_collections so a project
-- with collection history cannot qualify as unused/deletable.
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
  v_client_collections bigint;
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
  select count(*) into v_client_collections from public.client_collections c where c.company_id = p_company_id and c.project_id = p_project_id;

  v_total := v_invoice_allocations + v_expenses + v_assignments + v_work_entries
    + v_overtime_requests + v_payroll_allocations + v_payroll_entry_contexts
    + v_import_rows + v_worker_defaults + v_compensation_defaults
    + v_engineering_documents + v_engineering_rfis + v_engineering_submittals
    + v_daily_site_logs + v_accounting_events + v_purchase_orders + v_subcontracts
    + v_subcontract_claims + v_subcontract_variations + v_client_billings
    + v_client_collections;
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
      'clientBillings', v_client_billings,
      'clientCollections', v_client_collections
    )
  );
end;
$$;

revoke execute on function private.validate_client_collection_scope() from public, anon, authenticated;
revoke execute on function private.validate_client_collection_allocation_scope() from public, anon, authenticated;
revoke execute on function private.prevent_client_collection_delete() from public, anon, authenticated;
revoke execute on function private.prevent_client_collection_event_mutation() from public, anon, authenticated;
revoke execute on function private.project_lifecycle_preflight(uuid, uuid) from public, anon, authenticated;

-- 7. Safe Realtime publication extension.
do $$
declare
  table_name text;
begin
  if exists (
    select 1 from pg_publication
    where pubname = 'supabase_realtime' and not puballtables
  ) then
    foreach table_name in array array[
      'client_collections',
      'client_collection_allocations',
      'client_collection_events'
    ] loop
      if to_regclass(format('public.%I', table_name)) is not null
         and not exists (
           select 1
           from pg_publication p
           join pg_publication_rel pr on pr.prpubid = p.oid
           join pg_class c on c.oid = pr.prrelid
           join pg_namespace n on n.oid = c.relnamespace
           where p.pubname = 'supabase_realtime'
             and n.nspname = 'public'
             and c.relname = table_name
         ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end $$;
