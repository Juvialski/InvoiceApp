-- Engoryx Core Hardening Wave 2B3: Cash, Banking, and Settlement correction
-- lifecycles.
--
-- Financial accounts, statement provenance, transactions, and settlement links
-- are evidence-bearing records.  Browser table writes are therefore reduced to
-- reads (plus append-only balance snapshots); consequential changes go through
-- short, locked, company-bound RPCs with effective permission checks.

-- Transfer matches need a durable relationship identifier so a reversed pair
-- can be retried safely after the transaction rows are restored to review.
alter table public.financial_transaction_matches
  add column if not exists transfer_group_id uuid;

-- Existing transfer rows were created before transfer_group_id existed.  The
-- backfill is data-preserving and happens with actor/audit triggers paused so a
-- migration does not invent an authenticated actor for historical rows.
drop trigger if exists financial_transaction_matches_integrity on public.financial_transaction_matches;
drop trigger if exists financial_transaction_matches_actor on public.financial_transaction_matches;
drop trigger if exists financial_transaction_matches_audit on public.financial_transaction_matches;
update public.financial_transaction_matches m
set transfer_group_id = ft.transfer_group_id
from public.financial_transactions ft
where m.target_type = 'TRANSFER'
  and m.transaction_id = ft.id
  and m.company_id = ft.company_id
  and ft.transfer_group_id is not null
  and m.transfer_group_id is null;

update public.financial_transaction_matches
set reversed_by_user_id = coalesce(reversed_by_user_id, confirmed_by_user_id, created_by_user_id),
    reversed_at = coalesce(reversed_at, updated_at, created_at, now()),
    reversal_reason = coalesce(reversal_reason, 'Pre-existing REVERSED settlement')
where status = 'REVERSED';

alter table public.financial_transaction_matches
  drop constraint if exists financial_transaction_matches_reversal_check;
alter table public.financial_transaction_matches
  add constraint financial_transaction_matches_reversal_check check (
    (status = 'REVERSED'
      and reversed_by_user_id is not null
      and reversed_at is not null
      and reversal_reason is not null
      and length(btrim(reversal_reason)) between 3 and 500)
    or (status <> 'REVERSED'
      and reversed_by_user_id is null
      and reversed_at is null
      and reversal_reason is null)
  );

-- Reversal metadata keeps the original transaction row and its financial
-- meaning intact while making the lifecycle state and actor explicit.
alter table public.financial_transactions
  add column if not exists reversed_by_user_id uuid references auth.users(id) on delete restrict,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversal_reason text;

drop trigger if exists financial_transactions_actor on public.financial_transactions;
drop trigger if exists financial_transactions_audit on public.financial_transactions;
update public.financial_transactions
set reversed_by_user_id = coalesce(reversed_by_user_id, created_by_user_id),
    reversed_at = coalesce(reversed_at, updated_at, created_at, now()),
    reversal_reason = coalesce(reversal_reason, 'Pre-existing REVERSED transaction')
where status = 'REVERSED';

alter table public.financial_transactions
  drop constraint if exists financial_transactions_reversal_metadata_check;
alter table public.financial_transactions
  add constraint financial_transactions_reversal_metadata_check check (
    (status <> 'REVERSED'
      and reversed_by_user_id is null
      and reversed_at is null
      and reversal_reason is null)
    or (status = 'REVERSED'
      and reversed_by_user_id is not null
      and reversed_at is not null
      and reversal_reason is not null
      and length(btrim(reversal_reason)) between 3 and 500)
  );

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
    'MEMBERSHIP_CREATED', 'PERMISSION_OVERRIDES_TRANSFERRED'
  ));

create index if not exists financial_transaction_matches_transfer_group_idx
  on public.financial_transaction_matches(company_id, transfer_group_id, transaction_id)
  where target_type = 'TRANSFER';

-- Keep the existing account-reference invariant, and additionally prevent new
-- operational activity from targeting an inactive account.  Historical rows
-- may still be corrected/reversed after an account is deactivated.
create or replace function private.validate_financial_account_reference()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_account public.financial_accounts;
begin
  select * into v_account
  from public.financial_accounts fa
  where fa.id = new.account_id and fa.company_id = new.company_id;
  if not found then
    raise exception 'Financial account is outside the company' using errcode = '42501';
  end if;
  if tg_table_name = 'financial_transactions' then
    if new.currency is distinct from v_account.currency then
      raise exception 'Transaction currency must match its financial account' using errcode = '22023';
    end if;
  end if;
  if tg_table_name in ('financial_transactions', 'financial_balance_snapshots') then
    if new.import_batch_id is not null and not exists (
      select 1
      from public.financial_import_batches ib
      where ib.id = new.import_batch_id
        and ib.company_id = new.company_id
        and ib.account_id = new.account_id
    ) then
      raise exception 'Financial import provenance must belong to the same company and account' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'INSERT'
     and tg_table_name in ('financial_transactions', 'financial_import_batches', 'financial_balance_snapshots')
     and not v_account.active then
    raise exception 'Inactive financial accounts must be reactivated before new activity is recorded' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.validate_financial_match()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_transaction public.financial_transactions;
  v_confirmed numeric(20,2);
begin
  if (select auth.uid()) is null then
    raise exception 'Financial actor must be the authenticated user' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.created_by_user_id is distinct from (select auth.uid()) then
    raise exception 'Financial actor must be the authenticated user' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.created_by_user_id is distinct from old.created_by_user_id then
    raise exception 'Financial creation actor is immutable' using errcode = '42501';
  end if;
  if new.status = 'CONFIRMED' and new.confirmed_by_user_id is distinct from (select auth.uid()) then
    raise exception 'Confirmed reconciliation must identify the authenticated user' using errcode = '42501';
  end if;
  if new.status = 'REVERSED' and new.reversed_by_user_id is distinct from (select auth.uid()) then
    raise exception 'Reversed reconciliation must identify the authenticated user' using errcode = '42501';
  end if;
  if new.target_type = 'TRANSFER' and new.transfer_group_id is null then
    raise exception 'Transfer matches require a transfer group' using errcode = '22023';
  end if;
  if new.target_type <> 'TRANSFER' and new.transfer_group_id is not null then
    raise exception 'Only transfer matches may carry a transfer group' using errcode = '22023';
  end if;
  select * into v_transaction
  from public.financial_transactions ft
  where ft.id = new.transaction_id and ft.company_id = new.company_id;
  if not found then raise exception 'Matched transaction is outside the company' using errcode = '42501'; end if;
  if new.status = 'CONFIRMED' and v_transaction.reconciliation_status = 'IGNORED' then
    raise exception 'Return an ignored transaction to review before confirming financial evidence' using errcode = '42501';
  end if;
  if new.target_type = 'EXPENSE' and not exists (select 1 from public.expenses e where e.id = new.target_id and e.company_id = new.company_id) then
    raise exception 'Matched expense is outside the company' using errcode = '42501';
  elsif new.target_type = 'INVOICE' and not exists (select 1 from public.invoices i where i.id = new.target_id and i.company_id = new.company_id) then
    raise exception 'Matched invoice is outside the company' using errcode = '42501';
  elsif new.target_type = 'PAYROLL' and not exists (select 1 from public.payroll_runs pr where pr.id = new.target_id and pr.company_id = new.company_id) then
    raise exception 'Matched payroll run is outside the company' using errcode = '42501';
  elsif new.target_type = 'TRANSFER' and not exists (select 1 from public.financial_transactions other where other.id = new.target_id and other.company_id = new.company_id and other.id <> new.transaction_id) then
    raise exception 'Matched transfer transaction is outside the company' using errcode = '42501';
  end if;

  if new.status = 'CONFIRMED' then
    select coalesce(sum(ftm.matched_amount), 0)
      into v_confirmed
    from public.financial_transaction_matches ftm
    where ftm.transaction_id = new.transaction_id
      and ftm.status = 'CONFIRMED'
      and ftm.id <> new.id;
    if v_confirmed + new.matched_amount > v_transaction.amount then
      raise exception 'Confirmed matches cannot exceed the transaction amount' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

-- A single audit trigger serves all five financial tables.  The override GUCs
-- are set only inside the guarded RPCs after all browser table writes have been
-- revoked; they let lifecycle events carry their reason without storing bank
-- credentials or other secrets.
create or replace function private.audit_financial_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event text := nullif(current_setting('app.financial_audit_event', true), '');
  v_reason text := nullif(current_setting('app.financial_audit_reason', true), '');
  v_target_id uuid;
  v_metadata jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'financial_accounts' then
    v_event := coalesce(v_event, case when tg_op = 'INSERT' then 'CASH_ACCOUNT_CREATED' when new.active = false and old.active is distinct from false then 'CASH_ACCOUNT_DEACTIVATED' else 'CASH_ACCOUNT_UPDATED' end);
    v_target_id := new.id;
    v_metadata := jsonb_build_object(
      'display_name', new.display_name,
      'institution_name', new.institution_name,
      'account_type', new.account_type,
      'currency', new.currency,
      'masked_identifier', new.masked_identifier,
      'reason', v_reason
    );
  elsif tg_table_name = 'financial_balance_snapshots' then
    v_event := coalesce(v_event, 'CASH_BALANCE_SNAPSHOT_RECORDED');
    v_target_id := new.id;
    v_metadata := jsonb_build_object('account_id', new.account_id, 'source', new.source, 'captured_at', new.captured_at);
  elsif tg_table_name = 'financial_import_batches' then
    v_event := coalesce(v_event, case when new.status = 'FAILED' then 'CASH_STATEMENT_REJECTED' else 'CASH_STATEMENT_IMPORTED' end);
    v_target_id := new.id;
    v_metadata := jsonb_build_object('account_id', new.account_id, 'file_name', new.file_name, 'row_count', new.row_count, 'imported_count', new.imported_count, 'duplicate_count', new.duplicate_count, 'rejected_count', new.rejected_count, 'reason', v_reason);
  elsif tg_table_name = 'financial_transactions' then
    v_event := coalesce(v_event,
      case
        when tg_op = 'INSERT' then 'CASH_TRANSACTION_CREATED'
        when new.status = 'REVERSED' and old.status is distinct from 'REVERSED' then 'CASH_TRANSACTION_REVERSED'
        when new.reconciliation_status = 'IGNORED' and old.reconciliation_status is distinct from 'IGNORED' then 'CASH_TRANSACTION_IGNORED'
        when old.reconciliation_status = 'IGNORED' and new.reconciliation_status is distinct from 'IGNORED' then 'CASH_TRANSACTION_REVIEW_RESTORED'
        else 'CASH_TRANSACTION_UPDATED'
      end
    );
    v_target_id := new.id;
    v_metadata := jsonb_build_object(
      'account_id', new.account_id,
      'transaction_date', new.transaction_date,
      'direction', new.direction,
      'amount', new.amount,
      'currency', new.currency,
      'source', new.source,
      'status', new.status,
      'reconciliation_status', new.reconciliation_status,
      'reason', v_reason,
      'original_values', case when tg_op = 'UPDATE' then jsonb_build_object('account_id', old.account_id, 'transaction_date', old.transaction_date, 'direction', old.direction, 'amount', old.amount, 'currency', old.currency, 'source', old.source, 'status', old.status, 'reconciliation_status', old.reconciliation_status) else null end
    );
  elsif tg_table_name = 'financial_transaction_matches' then
    v_event := coalesce(v_event,
      case
        when tg_op = 'UPDATE' and old.status = 'CONFIRMED' and new.status = 'REVERSED' and new.target_type = 'TRANSFER' then 'CASH_TRANSFER_REVERSED'
        when tg_op = 'UPDATE' and old.status = 'CONFIRMED' and new.status = 'REVERSED' then 'CASH_SETTLEMENT_REVERSED'
        when tg_op = 'UPDATE' and old.status = 'CONFIRMED' and new.status = 'REJECTED' then 'CASH_RECONCILIATION_REMOVED'
        when new.status = 'CONFIRMED' and new.target_type = 'TRANSFER' then 'CASH_TRANSFER_MATCHED'
        when new.status = 'CONFIRMED' then 'CASH_RECONCILIATION_CONFIRMED'
        else null
      end
    );
    if v_event is null then return new; end if;
    v_target_id := new.transaction_id;
    v_metadata := jsonb_build_object('match_id', new.id, 'target_type', new.target_type, 'target_id', new.target_id, 'matched_amount', new.matched_amount, 'transfer_group_id', new.transfer_group_id, 'reason', v_reason);
  else
    return new;
  end if;

  perform private.write_company_audit(new.company_id, v_event, 'financial', v_target_id, v_metadata);
  return new;
end;
$$;

create or replace function private.require_cash_permission(
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
    raise exception 'The current user is not authorized to manage this %', coalesce(p_entity_label, 'financial record') using errcode = '42501';
  end if;
  return v_actor;
end;
$$;

revoke execute on function private.require_cash_permission(uuid, text, text) from public, anon, authenticated;

-- Account metadata may be corrected through one RPC.  Once account history
-- exists, financial identity/provenance fields are immutable; descriptive
-- labels remain editable.  Active state is intentionally handled by the
-- separate deactivate/reactivate RPCs.
create or replace function public.save_financial_account(
  p_company_id uuid,
  p_account_id uuid,
  p_account_type text,
  p_institution_code text,
  p_institution_name text,
  p_display_name text,
  p_masked_identifier text,
  p_currency text,
  p_opening_balance numeric,
  p_opening_balance_date date,
  p_connection_type text,
  p_provider text default null,
  p_provider_account_id text default null
)
returns public.financial_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_cash_permission(p_company_id, 'cash.accounts.manage', 'cash account');
  v_account public.financial_accounts;
  v_currency text := upper(btrim(coalesce(p_currency, '')));
  v_institution_name text := btrim(coalesce(p_institution_name, ''));
  v_display_name text := btrim(coalesce(p_display_name, ''));
  v_account_type text := upper(btrim(coalesce(p_account_type, '')));
  v_connection_type text := upper(btrim(coalesce(p_connection_type, '')));
  v_has_history boolean := false;
begin
  if p_account_id is null then raise exception 'Financial account id is required' using errcode = '22023'; end if;
  if v_account_type not in ('BANK', 'EWALLET', 'CASH') then raise exception 'Financial account type is invalid' using errcode = '22023'; end if;
  if v_connection_type not in ('MANUAL', 'STATEMENT', 'PROVIDER') then raise exception 'Financial account connection type is invalid' using errcode = '22023'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'Financial account currency must be an uppercase ISO code' using errcode = '22023'; end if;
  if length(v_institution_name) not between 1 and 160 or length(v_display_name) not between 1 and 160 then
    raise exception 'Financial account institution and display names are required' using errcode = '22023';
  end if;

  select fa.* into v_account
  from public.financial_accounts fa
  where fa.id = p_account_id
  for update;

  if found then
    if v_account.company_id is distinct from p_company_id then
      raise exception 'Financial account is outside the selected deployment company' using errcode = '42501';
    end if;
    v_has_history := exists (select 1 from public.financial_transactions ft where ft.company_id = p_company_id and ft.account_id = p_account_id)
      or exists (select 1 from public.financial_balance_snapshots bs where bs.company_id = p_company_id and bs.account_id = p_account_id)
      or exists (select 1 from public.financial_import_batches ib where ib.company_id = p_company_id and ib.account_id = p_account_id)
      or exists (
        select 1
        from public.financial_transaction_matches m
        join public.financial_transactions ft on ft.id = m.transaction_id and ft.company_id = m.company_id
        where m.company_id = p_company_id and ft.account_id = p_account_id
      );
    if v_has_history and (
      v_account.account_type is distinct from v_account_type
      or v_account.currency is distinct from v_currency
      or v_account.opening_balance is distinct from round(coalesce(p_opening_balance, 0), 2)
      or v_account.opening_balance_date is distinct from p_opening_balance_date
      or v_account.connection_type is distinct from v_connection_type
      or v_account.provider is distinct from nullif(btrim(p_provider), '')
      or v_account.provider_account_id is distinct from nullif(btrim(p_provider_account_id), '')
    ) then
      raise exception 'Financial identity and opening-balance fields cannot change after account history exists; edit descriptive metadata or create a new account' using errcode = '42501';
    end if;

    update public.financial_accounts
    set account_type = v_account_type,
        institution_code = nullif(btrim(p_institution_code), ''),
        institution_name = v_institution_name,
        display_name = v_display_name,
        masked_identifier = nullif(btrim(p_masked_identifier), ''),
        currency = v_currency,
        opening_balance = round(coalesce(p_opening_balance, 0), 2),
        opening_balance_date = coalesce(p_opening_balance_date, current_date),
        connection_type = v_connection_type,
        provider = nullif(btrim(p_provider), ''),
        provider_account_id = nullif(btrim(p_provider_account_id), '')
    where id = p_account_id and company_id = p_company_id
    returning * into v_account;
  else
    insert into public.financial_accounts (
      id, company_id, account_type, institution_code, institution_name,
      display_name, masked_identifier, currency, opening_balance,
      opening_balance_date, connection_type, provider, provider_account_id,
      active, created_by_user_id
    ) values (
      p_account_id, p_company_id, v_account_type, nullif(btrim(p_institution_code), ''),
      v_institution_name, v_display_name, nullif(btrim(p_masked_identifier), ''),
      v_currency, round(coalesce(p_opening_balance, 0), 2), coalesce(p_opening_balance_date, current_date),
      v_connection_type, nullif(btrim(p_provider), ''), nullif(btrim(p_provider_account_id), ''),
      true, v_actor
    ) returning * into v_account;
  end if;
  return v_account;
end;
$$;

drop function if exists public.deactivate_financial_account(uuid);
create or replace function public.deactivate_financial_account(
  p_account_id uuid,
  p_reason text
)
returns public.financial_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := (select private.deployment_company_id());
  v_account public.financial_accounts;
begin
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'A clear account deactivation reason is required' using errcode = '22023';
  end if;
  perform private.require_cash_permission(v_company_id, 'cash.accounts.manage', 'cash account');
  select fa.* into v_account from public.financial_accounts fa where fa.id = p_account_id and fa.company_id = v_company_id for update;
  if not found then raise exception 'Financial account is outside the selected deployment company or unavailable' using errcode = '42501'; end if;
  if not v_account.active then return v_account; end if;
  perform set_config('app.financial_audit_reason', btrim(p_reason), true);
  update public.financial_accounts set active = false where id = p_account_id and company_id = v_company_id returning * into v_account;
  perform set_config('app.financial_audit_reason', '', true);
  return v_account;
end;
$$;

create or replace function public.reactivate_financial_account(
  p_account_id uuid,
  p_reason text
)
returns public.financial_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := (select private.deployment_company_id());
  v_account public.financial_accounts;
begin
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'A clear account reactivation reason is required' using errcode = '22023';
  end if;
  perform private.require_cash_permission(v_company_id, 'cash.accounts.manage', 'cash account');
  select fa.* into v_account from public.financial_accounts fa where fa.id = p_account_id and fa.company_id = v_company_id for update;
  if not found then raise exception 'Financial account is outside the selected deployment company or unavailable' using errcode = '42501'; end if;
  if v_account.active then return v_account; end if;
  perform set_config('app.financial_audit_event', 'CASH_ACCOUNT_REACTIVATED', true);
  perform set_config('app.financial_audit_reason', btrim(p_reason), true);
  update public.financial_accounts set active = true where id = p_account_id and company_id = v_company_id returning * into v_account;
  perform set_config('app.financial_audit_event', '', true);
  perform set_config('app.financial_audit_reason', '', true);
  return v_account;
end;
$$;

create or replace function public.create_financial_transaction(
  p_company_id uuid,
  p_transaction_id uuid,
  p_account_id uuid,
  p_transaction_date date,
  p_posted_at timestamptz,
  p_reference_number text,
  p_description text,
  p_direction text,
  p_amount numeric,
  p_currency text,
  p_source_fingerprint text
)
returns public.financial_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_cash_permission(p_company_id, 'cash.transactions.manage', 'cash transaction');
  v_account public.financial_accounts;
  v_existing public.financial_transactions;
  v_transaction public.financial_transactions;
  v_currency text := upper(btrim(coalesce(p_currency, '')));
  v_description text := btrim(coalesce(p_description, ''));
  v_direction text := upper(btrim(coalesce(p_direction, '')));
  v_fingerprint text := btrim(coalesce(p_source_fingerprint, ''));
begin
  if p_transaction_id is null or p_account_id is null or p_transaction_date is null then raise exception 'Financial transaction identity and date are required' using errcode = '22023'; end if;
  if length(v_description) < 1 or length(v_description) > 500 then raise exception 'Financial transaction description is required' using errcode = '22023'; end if;
  if v_direction not in ('CREDIT', 'DEBIT') then raise exception 'Financial transaction direction is invalid' using errcode = '22023'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Financial transaction amount must be positive' using errcode = '22023'; end if;
  if v_currency !~ '^[A-Z]{3}$' or length(v_fingerprint) not between 8 and 256 then raise exception 'Financial transaction currency or fingerprint is invalid' using errcode = '22023'; end if;

  select fa.* into v_account from public.financial_accounts fa where fa.id = p_account_id and fa.company_id = p_company_id for update;
  if not found or not v_account.active then raise exception 'Financial account is unavailable or inactive' using errcode = '42501'; end if;
  if v_currency is distinct from v_account.currency then raise exception 'Transaction currency must match its financial account' using errcode = '22023'; end if;

  select ft.* into v_existing from public.financial_transactions ft where ft.id = p_transaction_id for update;
  if found then
    if v_existing.company_id is distinct from p_company_id then raise exception 'Financial transaction is outside the selected deployment company' using errcode = '42501'; end if;
    if v_existing.source = 'MANUAL'
       and v_existing.account_id = p_account_id
       and v_existing.transaction_date = p_transaction_date
       and v_existing.posted_at is not distinct from p_posted_at
       and v_existing.reference_number is not distinct from nullif(btrim(p_reference_number), '')
       and v_existing.description = v_description
       and v_existing.direction = v_direction
       and v_existing.amount = round(p_amount, 2)
       and v_existing.currency = v_currency
       and v_existing.source_fingerprint = v_fingerprint
       and v_existing.import_batch_id is null
       and v_existing.provider_transaction_id is null
       and v_existing.transfer_group_id is null then
      return v_existing;
    end if;
    raise exception 'Transaction request id is already used with different terms' using errcode = '23505';
  end if;

  insert into public.financial_transactions (
    id, company_id, account_id, transaction_date, posted_at, reference_number,
    description, direction, amount, currency, status, source, source_fingerprint,
    reconciliation_status, created_by_user_id
  ) values (
    p_transaction_id, p_company_id, p_account_id, p_transaction_date, p_posted_at,
    nullif(btrim(p_reference_number), ''), v_description, v_direction, round(p_amount, 2),
    v_currency, 'POSTED', 'MANUAL', v_fingerprint, 'UNMATCHED', v_actor
  ) returning * into v_transaction;
  return v_transaction;
end;
$$;

create or replace function public.correct_financial_transaction(
  p_company_id uuid,
  p_transaction_id uuid,
  p_transaction_date date,
  p_reference_number text,
  p_description text,
  p_direction text,
  p_amount numeric,
  p_reason text
)
returns public.financial_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_cash_permission(p_company_id, 'cash.transactions.manage', 'cash transaction');
  v_transaction public.financial_transactions;
  v_description text := btrim(coalesce(p_description, ''));
  v_direction text := upper(btrim(coalesce(p_direction, '')));
begin
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then raise exception 'A clear transaction correction reason is required' using errcode = '22023'; end if;
  if p_transaction_date is null or length(v_description) < 1 or length(v_description) > 500 or v_direction not in ('CREDIT', 'DEBIT') or p_amount is null or p_amount <= 0 then
    raise exception 'Transaction correction fields are invalid' using errcode = '22023';
  end if;
  select ft.* into v_transaction from public.financial_transactions ft where ft.id = p_transaction_id and ft.company_id = p_company_id for update;
  if not found then raise exception 'Financial transaction is outside the selected deployment company or unavailable' using errcode = '42501'; end if;
  if v_transaction.source <> 'MANUAL'
     or v_transaction.import_batch_id is not null
     or v_transaction.provider_transaction_id is not null
     or v_transaction.transfer_group_id is not null
     or v_transaction.status = 'REVERSED'
     or v_transaction.reconciliation_status not in ('UNMATCHED', 'SUGGESTED')
     or exists (select 1 from public.financial_transaction_matches m where m.company_id = p_company_id and m.transaction_id = p_transaction_id and m.status in ('CONFIRMED', 'REVERSED')) then
    raise exception 'Only an uncommitted, unreconciled MANUAL transaction without financial history may be edited; use reversal for used evidence' using errcode = '42501';
  end if;

  perform set_config('app.financial_audit_event', 'CASH_TRANSACTION_CORRECTED', true);
  perform set_config('app.financial_audit_reason', btrim(p_reason), true);
  update public.financial_transactions
  set transaction_date = p_transaction_date,
      posted_at = case when v_transaction.posted_at is null then null else p_transaction_date::timestamptz end,
      reference_number = nullif(btrim(p_reference_number), ''),
      description = v_description,
      direction = v_direction,
      amount = round(p_amount, 2)
  where id = p_transaction_id and company_id = p_company_id
  returning * into v_transaction;
  perform set_config('app.financial_audit_event', '', true);
  perform set_config('app.financial_audit_reason', '', true);
  return v_transaction;
end;
$$;

create or replace function public.reverse_financial_transaction(
  p_company_id uuid,
  p_transaction_id uuid,
  p_reason text
)
returns public.financial_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_cash_permission(p_company_id, 'cash.transactions.manage', 'cash transaction');
  v_transaction public.financial_transactions;
begin
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then raise exception 'A clear transaction reversal reason is required' using errcode = '22023'; end if;
  select ft.* into v_transaction from public.financial_transactions ft where ft.id = p_transaction_id and ft.company_id = p_company_id for update;
  if not found then raise exception 'Financial transaction is outside the selected deployment company or unavailable' using errcode = '42501'; end if;
  if v_transaction.status = 'REVERSED' then return v_transaction; end if;
  if v_transaction.reconciliation_status = 'IGNORED' then raise exception 'Return the ignored transaction to review before reversing it' using errcode = '42501'; end if;
  if v_transaction.transfer_group_id is not null then raise exception 'Reverse the confirmed internal transfer before reversing this transaction' using errcode = '42501'; end if;
  if exists (select 1 from public.financial_transaction_matches m where m.company_id = p_company_id and m.transaction_id = p_transaction_id and m.status = 'CONFIRMED') then
    raise exception 'Reverse confirmed settlement or transfer evidence before reversing this transaction' using errcode = '42501';
  end if;

  perform set_config('app.financial_audit_event', 'CASH_TRANSACTION_REVERSED', true);
  perform set_config('app.financial_audit_reason', btrim(p_reason), true);
  update public.financial_transactions
  set status = 'REVERSED', reconciliation_status = 'UNMATCHED', reversed_by_user_id = v_actor, reversed_at = now(), reversal_reason = btrim(p_reason)
  where id = p_transaction_id and company_id = p_company_id
  returning * into v_transaction;
  perform set_config('app.financial_audit_event', '', true);
  perform set_config('app.financial_audit_reason', '', true);
  return v_transaction;
end;
$$;

create or replace function public.ignore_financial_transaction(
  p_company_id uuid,
  p_transaction_id uuid,
  p_reason text
)
returns public.financial_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction public.financial_transactions;
begin
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then raise exception 'A clear reconciliation ignore reason is required' using errcode = '22023'; end if;
  perform private.require_cash_permission(p_company_id, 'cash.reconcile', 'cash reconciliation');
  select ft.* into v_transaction from public.financial_transactions ft where ft.id = p_transaction_id and ft.company_id = p_company_id for update;
  if not found then raise exception 'Financial transaction is outside the selected deployment company or unavailable' using errcode = '42501'; end if;
  if v_transaction.status = 'REVERSED' then raise exception 'A reversed transaction cannot be ignored' using errcode = '42501'; end if;
  if exists (select 1 from public.financial_transaction_matches m where m.company_id = p_company_id and m.transaction_id = p_transaction_id and m.status = 'CONFIRMED') then
    raise exception 'Confirmed settlement or transfer evidence cannot be hidden by Ignore' using errcode = '42501';
  end if;
  if v_transaction.reconciliation_status = 'IGNORED' then return v_transaction; end if;
  if v_transaction.transfer_group_id is not null or v_transaction.reconciliation_status not in ('UNMATCHED', 'SUGGESTED') then
    raise exception 'Only an unresolved transaction without transfer or settlement evidence may be ignored' using errcode = '42501';
  end if;
  perform set_config('app.financial_audit_event', 'CASH_TRANSACTION_IGNORED', true);
  perform set_config('app.financial_audit_reason', btrim(p_reason), true);
  update public.financial_transactions set reconciliation_status = 'IGNORED' where id = p_transaction_id and company_id = p_company_id returning * into v_transaction;
  perform set_config('app.financial_audit_event', '', true);
  perform set_config('app.financial_audit_reason', '', true);
  return v_transaction;
end;
$$;

create or replace function public.restore_financial_transaction_to_review(
  p_company_id uuid,
  p_transaction_id uuid,
  p_reason text
)
returns public.financial_transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction public.financial_transactions;
begin
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then raise exception 'A clear review-restoration reason is required' using errcode = '22023'; end if;
  perform private.require_cash_permission(p_company_id, 'cash.reconcile', 'cash reconciliation');
  select ft.* into v_transaction from public.financial_transactions ft where ft.id = p_transaction_id and ft.company_id = p_company_id for update;
  if not found then raise exception 'Financial transaction is outside the selected deployment company or unavailable' using errcode = '42501'; end if;
  if v_transaction.status = 'REVERSED' then raise exception 'A reversed transaction cannot return to review' using errcode = '42501'; end if;
  if v_transaction.reconciliation_status <> 'IGNORED' then return v_transaction; end if;
  if v_transaction.transfer_group_id is not null or exists (select 1 from public.financial_transaction_matches m where m.company_id = p_company_id and m.transaction_id = p_transaction_id and m.status = 'CONFIRMED') then
    raise exception 'A transaction with confirmed transfer or settlement evidence cannot be returned from Ignore' using errcode = '42501';
  end if;
  perform set_config('app.financial_audit_event', 'CASH_TRANSACTION_REVIEW_RESTORED', true);
  perform set_config('app.financial_audit_reason', btrim(p_reason), true);
  update public.financial_transactions set reconciliation_status = 'UNMATCHED' where id = p_transaction_id and company_id = p_company_id returning * into v_transaction;
  perform set_config('app.financial_audit_event', '', true);
  perform set_config('app.financial_audit_reason', '', true);
  return v_transaction;
end;
$$;

-- Settlement reversal remains the same public contract used by the Assistant,
-- but now carries its reason through the financial audit trigger and verifies
-- that the locked source transaction and target still exist.
create or replace function public.reverse_financial_settlement(
  p_company_id uuid,
  p_match_id uuid,
  p_reason text
)
returns public.financial_transaction_matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_cash_permission(p_company_id, 'cash.reconcile', 'financial settlement');
  v_match public.financial_transaction_matches%rowtype;
  v_result public.financial_transaction_matches%rowtype;
begin
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then raise exception 'A reversal reason is required' using errcode = '22023'; end if;
  select * into v_match from public.financial_transaction_matches m where m.id = p_match_id and m.company_id = p_company_id for update;
  if not found then raise exception 'Settlement is outside the selected company or unavailable' using errcode = '42501'; end if;
  if v_match.status = 'REVERSED' then return v_match; end if;
  if v_match.status <> 'CONFIRMED' or v_match.target_type not in ('INVOICE', 'PAYROLL', 'EXPENSE') then raise exception 'Only confirmed financial settlements can be reversed' using errcode = '22023'; end if;

  perform 1 from public.financial_transactions ft where ft.id = v_match.transaction_id and ft.company_id = p_company_id for update;
  if not found then raise exception 'Settlement transaction is unavailable' using errcode = '42501'; end if;
  if v_match.target_type = 'INVOICE' then
    if not (select private.has_company_permission(p_company_id, 'invoices.manage')) then raise exception 'Invoice settlement reversal requires invoices.manage' using errcode = '42501'; end if;
    perform 1 from public.invoices i where i.id = v_match.target_id and i.company_id = p_company_id for update;
  elsif v_match.target_type = 'PAYROLL' then
    if not (select private.has_company_permission(p_company_id, 'payroll.approve')) then raise exception 'Payroll settlement reversal requires payroll.approve' using errcode = '42501'; end if;
    perform 1 from public.payroll_runs pr where pr.id = v_match.target_id and pr.company_id = p_company_id for update;
  else
    if not (select private.has_company_permission(p_company_id, 'expenses.manage')) then raise exception 'Expense settlement reversal requires expenses.manage' using errcode = '42501'; end if;
    perform 1 from public.expenses e where e.id = v_match.target_id and e.company_id = p_company_id for update;
  end if;
  if not found then raise exception 'Settlement target is unavailable' using errcode = '42501'; end if;

  perform set_config('app.financial_audit_event', 'CASH_SETTLEMENT_REVERSED', true);
  perform set_config('app.financial_audit_reason', btrim(p_reason), true);
  update public.financial_transaction_matches
  set status = 'REVERSED', reversed_by_user_id = v_actor, reversed_at = now(), reversal_reason = btrim(p_reason)
  where id = p_match_id and company_id = p_company_id
  returning * into v_result;
  perform set_config('app.financial_audit_event', '', true);
  perform set_config('app.financial_audit_reason', '', true);
  perform private.refresh_financial_transaction_reconciliation(v_match.transaction_id, p_company_id);
  return v_result;
end;
$$;

create or replace function public.confirm_financial_transfer(
  p_company_id uuid,
  p_left_transaction_id uuid,
  p_right_transaction_id uuid,
  p_matched_amount numeric,
  p_transfer_group_id uuid default gen_random_uuid()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_left public.financial_transactions;
  v_right public.financial_transactions;
  v_existing_count integer;
  v_existing_amount numeric;
begin
  perform private.require_cash_permission(p_company_id, 'cash.reconcile', 'cash transfer');
  if p_left_transaction_id is null or p_right_transaction_id is null or p_left_transaction_id = p_right_transaction_id or p_transfer_group_id is null then
    raise exception 'Two distinct transactions and a transfer group are required' using errcode = '22023';
  end if;

  -- Lock both rows in UUID order so opposite callers cannot deadlock.
  perform 1 from public.financial_transactions ft
  where ft.company_id = p_company_id and ft.id in (p_left_transaction_id, p_right_transaction_id)
  order by ft.id
  for update;
  select ft.* into v_left from public.financial_transactions ft where ft.id = p_left_transaction_id and ft.company_id = p_company_id;
  if not found then raise exception 'Both transfer transactions must belong to the company' using errcode = '42501'; end if;
  select ft.* into v_right from public.financial_transactions ft where ft.id = p_right_transaction_id and ft.company_id = p_company_id;
  if not found then raise exception 'Both transfer transactions must belong to the company' using errcode = '42501'; end if;

  select count(*), min(m.matched_amount) into v_existing_count, v_existing_amount
  from public.financial_transaction_matches m
  where m.company_id = p_company_id
    and m.transfer_group_id = p_transfer_group_id
    and m.status = 'CONFIRMED'
    and ((m.transaction_id = v_left.id and m.target_id = v_right.id) or (m.transaction_id = v_right.id and m.target_id = v_left.id));
  if v_left.transfer_group_id = p_transfer_group_id and v_right.transfer_group_id = p_transfer_group_id and v_existing_count = 2 and abs(coalesce(v_existing_amount, 0) - round(p_matched_amount, 2)) <= 0.005 then
    return jsonb_build_object('transfer_group_id', p_transfer_group_id, 'left_transaction_id', v_left.id, 'right_transaction_id', v_right.id, 'idempotent', true);
  end if;
  if v_left.transfer_group_id is not null or v_right.transfer_group_id is not null then raise exception 'One or both transactions already belong to an internal transfer' using errcode = '22023'; end if;
  if exists (select 1 from public.financial_transaction_matches m where m.company_id = p_company_id and m.transfer_group_id = p_transfer_group_id and m.status = 'REVERSED') then
    raise exception 'A transfer group cannot be reused after reversal' using errcode = '22023';
  end if;
  if v_left.status <> 'POSTED' or v_right.status <> 'POSTED' or v_left.reconciliation_status not in ('UNMATCHED', 'SUGGESTED') or v_right.reconciliation_status not in ('UNMATCHED', 'SUGGESTED') then
    raise exception 'Only unresolved POSTED transactions can be confirmed as an internal transfer' using errcode = '22023';
  end if;
  perform 1 from public.financial_accounts fa
  where fa.company_id = p_company_id and fa.id in (v_left.account_id, v_right.account_id)
  order by fa.id
  for update;
  if not exists (select 1 from public.financial_accounts fa where fa.id = v_left.account_id and fa.company_id = p_company_id and fa.active)
     or not exists (select 1 from public.financial_accounts fa where fa.id = v_right.account_id and fa.company_id = p_company_id and fa.active) then
    raise exception 'Both transfer accounts must be active' using errcode = '42501';
  end if;
  if v_left.account_id = v_right.account_id
     or v_left.currency <> v_right.currency
     or v_left.direction = v_right.direction
     or abs(v_left.amount - v_right.amount) > 0.005
     or abs(v_left.transaction_date - v_right.transaction_date) > 3
     or p_matched_amount is null
     or abs(p_matched_amount - v_left.amount) > 0.005 then
    raise exception 'Transfer transactions must be opposite, same-currency, equal-value movements across accounts' using errcode = '22023';
  end if;
  if exists (select 1 from public.financial_transaction_matches m where m.company_id = p_company_id and m.transaction_id in (v_left.id, v_right.id) and m.status = 'CONFIRMED') then
    raise exception 'Transactions with confirmed financial evidence cannot be paired as transfers' using errcode = '22023';
  end if;

  update public.financial_transactions
  set transfer_group_id = p_transfer_group_id, reconciliation_status = 'MATCHED'
  where id in (v_left.id, v_right.id) and company_id = p_company_id;
  insert into public.financial_transaction_matches (
    company_id, created_by_user_id, transaction_id, target_type, target_id,
    matched_amount, status, confirmed_by_user_id, confirmed_at, notes, transfer_group_id
  ) values
    (p_company_id, (select auth.uid()), v_left.id, 'TRANSFER', v_right.id, round(p_matched_amount, 2), 'CONFIRMED', (select auth.uid()), now(), 'Confirmed internal transfer', p_transfer_group_id),
    (p_company_id, (select auth.uid()), v_right.id, 'TRANSFER', v_left.id, round(p_matched_amount, 2), 'CONFIRMED', (select auth.uid()), now(), 'Confirmed internal transfer', p_transfer_group_id);
  return jsonb_build_object('transfer_group_id', p_transfer_group_id, 'left_transaction_id', v_left.id, 'right_transaction_id', v_right.id, 'idempotent', false);
end;
$$;

create or replace function public.reverse_financial_transfer(
  p_company_id uuid,
  p_transfer_group_id uuid,
  p_left_transaction_id uuid,
  p_right_transaction_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_left public.financial_transactions;
  v_right public.financial_transactions;
  v_confirmed integer;
  v_reversed integer;
  v_total integer;
  v_updated integer;
begin
  perform private.require_cash_permission(p_company_id, 'cash.reconcile', 'cash transfer');
  if p_transfer_group_id is null or p_left_transaction_id is null or p_right_transaction_id is null or p_left_transaction_id = p_right_transaction_id then
    raise exception 'The exact transfer pair and group are required' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then raise exception 'A clear transfer reversal reason is required' using errcode = '22023'; end if;

  perform 1 from public.financial_transactions ft
  where ft.company_id = p_company_id and ft.id in (p_left_transaction_id, p_right_transaction_id)
  order by ft.id
  for update;
  select ft.* into v_left from public.financial_transactions ft where ft.id = p_left_transaction_id and ft.company_id = p_company_id;
  if not found then raise exception 'Both transfer transactions must belong to the company' using errcode = '42501'; end if;
  select ft.* into v_right from public.financial_transactions ft where ft.id = p_right_transaction_id and ft.company_id = p_company_id;
  if not found then raise exception 'Both transfer transactions must belong to the company' using errcode = '42501'; end if;

  select count(*), count(*) filter (where m.status = 'CONFIRMED'), count(*) filter (where m.status = 'REVERSED')
    into v_total, v_confirmed, v_reversed
  from public.financial_transaction_matches m
  where m.company_id = p_company_id
    and m.target_type = 'TRANSFER'
    and m.transfer_group_id = p_transfer_group_id
    and ((m.transaction_id = p_left_transaction_id and m.target_id = p_right_transaction_id) or (m.transaction_id = p_right_transaction_id and m.target_id = p_left_transaction_id));

  if v_total = 2 and v_confirmed = 0 and v_reversed = 2 and v_left.transfer_group_id is null and v_right.transfer_group_id is null then
    return jsonb_build_object('transfer_group_id', p_transfer_group_id, 'left_transaction_id', v_left.id, 'right_transaction_id', v_right.id, 'reversed', true, 'idempotent', true);
  end if;
  if v_left.status <> 'POSTED' or v_right.status <> 'POSTED'
     or v_left.account_id = v_right.account_id
     or v_left.currency <> v_right.currency
     or v_left.direction = v_right.direction
     or abs(v_left.amount - v_right.amount) > 0.005
     or abs(v_left.transaction_date - v_right.transaction_date) > 3
     or exists (
       select 1
       from public.financial_transaction_matches m
       where m.company_id = p_company_id
         and m.transaction_id in (p_left_transaction_id, p_right_transaction_id)
         and m.status = 'CONFIRMED'
         and not (m.target_type = 'TRANSFER' and m.transfer_group_id = p_transfer_group_id and ((m.transaction_id = p_left_transaction_id and m.target_id = p_right_transaction_id) or (m.transaction_id = p_right_transaction_id and m.target_id = p_left_transaction_id)))
     )
     or v_left.transfer_group_id is distinct from p_transfer_group_id
     or v_right.transfer_group_id is distinct from p_transfer_group_id
     or v_total <> 2
     or v_confirmed <> 2
     or v_reversed <> 0 then
    raise exception 'The transfer pair is no longer the exact confirmed relationship being reversed' using errcode = '22023';
  end if;

  perform set_config('app.financial_audit_event', 'CASH_TRANSFER_REVERSED', true);
  perform set_config('app.financial_audit_reason', btrim(p_reason), true);
  update public.financial_transaction_matches
  set status = 'REVERSED', reversed_by_user_id = (select auth.uid()), reversed_at = now(), reversal_reason = btrim(p_reason)
  where company_id = p_company_id
    and target_type = 'TRANSFER'
    and transfer_group_id = p_transfer_group_id
    and status = 'CONFIRMED'
    and ((transaction_id = p_left_transaction_id and target_id = p_right_transaction_id) or (transaction_id = p_right_transaction_id and target_id = p_left_transaction_id));
  get diagnostics v_updated = row_count;
  perform set_config('app.financial_audit_event', '', true);
  perform set_config('app.financial_audit_reason', '', true);
  if v_updated <> 2 then raise exception 'Transfer reversal did not update both relationship rows' using errcode = '40001'; end if;

  update public.financial_transactions
  set transfer_group_id = null, reconciliation_status = 'UNMATCHED'
  where company_id = p_company_id and id in (p_left_transaction_id, p_right_transaction_id);
  return jsonb_build_object('transfer_group_id', p_transfer_group_id, 'left_transaction_id', v_left.id, 'right_transaction_id', v_right.id, 'reversed', true, 'idempotent', false);
end;
$$;

-- Committed statement batches and imported rows are provenance, not editable
-- client records.  The trusted import RPC remains able to finish its own batch
-- update under its SECURITY DEFINER owner.
create or replace function private.prevent_financial_import_batch_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Committed statement provenance is append-only' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and current_user not in ('postgres', 'service_role') then
    raise exception 'Committed statement provenance can only be changed by its guarded import operation' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists financial_import_batches_immutable on public.financial_import_batches;
create trigger financial_import_batches_immutable
before update or delete on public.financial_import_batches
for each row execute function private.prevent_financial_import_batch_mutation();

-- Only append-only balance snapshots retain a direct insert path.  All other
-- financial tables are read-only to authenticated clients; RPCs bypass table
-- RLS as the guarded owner after checking auth.uid/effective permissions.
drop policy if exists financial_accounts_company_insert on public.financial_accounts;
drop policy if exists financial_accounts_company_update on public.financial_accounts;
drop policy if exists financial_transactions_company_insert on public.financial_transactions;
drop policy if exists financial_transactions_company_update on public.financial_transactions;
drop policy if exists financial_import_batches_company_insert on public.financial_import_batches;
drop policy if exists financial_import_batches_company_update on public.financial_import_batches;
drop policy if exists financial_transaction_matches_company_insert on public.financial_transaction_matches;
drop policy if exists financial_transaction_matches_company_update on public.financial_transaction_matches;

revoke insert, update, delete on table public.financial_accounts, public.financial_transactions, public.financial_import_batches, public.financial_transaction_matches from public, anon, authenticated;
revoke update, delete on table public.financial_balance_snapshots from public, anon, authenticated;
grant select on table public.financial_accounts, public.financial_transactions, public.financial_import_batches, public.financial_transaction_matches to authenticated;
grant select, insert on table public.financial_balance_snapshots to authenticated;

update private.company_tenant_policy_catalog
set allow_insert = false, allow_update = false, allow_delete = false
where table_name in ('financial_accounts', 'financial_transactions', 'financial_import_batches', 'financial_transaction_matches');

-- Reinstall trigger bindings after the historical metadata backfills above.
drop trigger if exists financial_transactions_account_reference on public.financial_transactions;
create trigger financial_transactions_account_reference before insert or update on public.financial_transactions for each row execute function private.validate_financial_account_reference();
drop trigger if exists financial_import_batches_account_reference on public.financial_import_batches;
create trigger financial_import_batches_account_reference before insert or update on public.financial_import_batches for each row execute function private.validate_financial_account_reference();
drop trigger if exists financial_balance_snapshots_account_reference on public.financial_balance_snapshots;
create trigger financial_balance_snapshots_account_reference before insert or update on public.financial_balance_snapshots for each row execute function private.validate_financial_account_reference();
drop trigger if exists financial_transaction_matches_integrity on public.financial_transaction_matches;
create trigger financial_transaction_matches_integrity before insert or update on public.financial_transaction_matches for each row execute function private.validate_financial_match();

drop trigger if exists financial_transactions_actor on public.financial_transactions;
create trigger financial_transactions_actor before insert or update on public.financial_transactions for each row execute function private.validate_financial_actor();
drop trigger if exists financial_transaction_matches_actor on public.financial_transaction_matches;
create trigger financial_transaction_matches_actor before insert or update on public.financial_transaction_matches for each row execute function private.validate_financial_actor();

drop trigger if exists financial_accounts_audit on public.financial_accounts;
create trigger financial_accounts_audit after insert or update on public.financial_accounts for each row execute function private.audit_financial_event();
drop trigger if exists financial_import_batches_audit on public.financial_import_batches;
create trigger financial_import_batches_audit after insert or update on public.financial_import_batches for each row execute function private.audit_financial_event();
drop trigger if exists financial_transactions_audit on public.financial_transactions;
create trigger financial_transactions_audit after insert or update on public.financial_transactions for each row execute function private.audit_financial_event();
drop trigger if exists financial_transaction_matches_audit on public.financial_transaction_matches;
create trigger financial_transaction_matches_audit after insert or update on public.financial_transaction_matches for each row execute function private.audit_financial_event();

-- Client-visible execution is limited to the lifecycle RPCs.  Existing
-- settlement confirmation, batch confirmation, and summary grants are
-- reasserted so this forward migration remains safe on upgraded databases.
revoke all on function public.save_financial_account(uuid, uuid, text, text, text, text, text, text, numeric, date, text, text, text) from public, anon;
revoke all on function public.deactivate_financial_account(uuid, text) from public, anon;
revoke all on function public.reactivate_financial_account(uuid, text) from public, anon;
revoke all on function public.create_financial_transaction(uuid, uuid, uuid, date, timestamptz, text, text, text, numeric, text, text) from public, anon;
revoke all on function public.correct_financial_transaction(uuid, uuid, date, text, text, text, numeric, text) from public, anon;
revoke all on function public.reverse_financial_transaction(uuid, uuid, text) from public, anon;
revoke all on function public.ignore_financial_transaction(uuid, uuid, text) from public, anon;
revoke all on function public.restore_financial_transaction_to_review(uuid, uuid, text) from public, anon;
revoke all on function public.reverse_financial_settlement(uuid, uuid, text) from public, anon;
revoke all on function public.confirm_financial_transfer(uuid, uuid, uuid, numeric, uuid) from public, anon;
revoke all on function public.reverse_financial_transfer(uuid, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.save_financial_account(uuid, uuid, text, text, text, text, text, text, numeric, date, text, text, text) to authenticated;
grant execute on function public.deactivate_financial_account(uuid, text) to authenticated;
grant execute on function public.reactivate_financial_account(uuid, text) to authenticated;
grant execute on function public.create_financial_transaction(uuid, uuid, uuid, date, timestamptz, text, text, text, numeric, text, text) to authenticated;
grant execute on function public.correct_financial_transaction(uuid, uuid, date, text, text, text, numeric, text) to authenticated;
grant execute on function public.reverse_financial_transaction(uuid, uuid, text) to authenticated;
grant execute on function public.ignore_financial_transaction(uuid, uuid, text) to authenticated;
grant execute on function public.restore_financial_transaction_to_review(uuid, uuid, text) to authenticated;
grant execute on function public.reverse_financial_settlement(uuid, uuid, text) to authenticated;
grant execute on function public.confirm_financial_transfer(uuid, uuid, uuid, numeric, uuid) to authenticated;
grant execute on function public.reverse_financial_transfer(uuid, uuid, uuid, uuid, text) to authenticated;
