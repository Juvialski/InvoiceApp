-- Cash & Banking: company-scoped accounts, statements, transactions, and
-- confirmation-based reconciliation. This migration is additive and keeps
-- opening balances, imports, and transaction provenance separate.

insert into public.company_permission_catalog (permission_key, description)
values
  ('cash.summary.read', 'Read company cash accounts, balances, and cash summaries.'),
  ('cash.transactions.read', 'Read company cash transactions and ledgers.'),
  ('cash.accounts.manage', 'Create, update, deactivate, and record manual cash account data.'),
  ('cash.transactions.manage', 'Create and edit manual cash transactions.'),
  ('cash.import', 'Preview and import bank or e-wallet statements.'),
  ('cash.reconcile', 'Suggest, confirm, and review cash transaction matches.'),
  ('cash.connections.manage', 'Manage future provider connection metadata without storing credentials.')
on conflict (permission_key) do update set description = excluded.description;

insert into public.company_role_permissions (role_key, permission_key)
select 'COMPANY_ADMIN', permission_key
from public.company_permission_catalog
where permission_key like 'cash.%'
on conflict do nothing;

insert into public.company_role_permissions (role_key, permission_key)
values
  ('FINANCE', 'cash.summary.read'),
  ('FINANCE', 'cash.transactions.read'),
  ('FINANCE', 'cash.accounts.manage'),
  ('FINANCE', 'cash.transactions.manage'),
  ('FINANCE', 'cash.import'),
  ('FINANCE', 'cash.reconcile'),
  ('FINANCE', 'cash.connections.manage')
on conflict do nothing;

insert into private.company_tenant_policy_catalog (table_name, read_permission, write_permission, allow_insert, allow_update, allow_delete)
values
  ('financial_accounts', 'cash.summary.read', 'cash.accounts.manage', true, true, false),
  ('financial_balance_snapshots', 'cash.summary.read', 'cash.accounts.manage', true, false, false),
  ('financial_transactions', 'cash.transactions.read', 'cash.transactions.manage', true, true, false),
  ('financial_import_batches', 'cash.import', 'cash.import', true, true, false),
  ('financial_transaction_matches', 'cash.reconcile', 'cash.reconcile', true, true, false)
on conflict (table_name) do update set
  read_permission = excluded.read_permission,
  write_permission = excluded.write_permission,
  allow_insert = excluded.allow_insert,
  allow_update = excluded.allow_update,
  allow_delete = excluded.allow_delete;

create table if not exists public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  account_type text not null check (account_type in ('BANK', 'EWALLET', 'CASH')),
  institution_code text,
  institution_name text not null check (length(btrim(institution_name)) between 1 and 160),
  display_name text not null check (length(btrim(display_name)) between 1 and 160),
  masked_identifier text check (masked_identifier is null or masked_identifier ~ '^[•*xX#]+[[:space:]]?[0-9]{4}$'),
  currency text not null default 'PHP' check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  opening_balance numeric(20,2) not null default 0,
  opening_balance_date date not null default current_date,
  connection_type text not null default 'MANUAL' check (connection_type in ('MANUAL', 'STATEMENT', 'PROVIDER')),
  provider text,
  provider_account_id text,
  active boolean not null default true,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.financial_import_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  account_id uuid not null references public.financial_accounts(id) on delete restrict,
  source_type text not null check (source_type in ('CSV', 'XLSX', 'PDF')),
  file_name text not null default 'statement',
  file_fingerprint text not null check (length(btrim(file_fingerprint)) between 8 and 256),
  statement_from date,
  statement_to date,
  opening_balance numeric(20,2),
  closing_balance numeric(20,2),
  row_count integer not null default 0 check (row_count >= 0),
  imported_count integer not null default 0 check (imported_count >= 0),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  status text not null default 'PREVIEW' check (status in ('PREVIEW', 'IMPORTED', 'FAILED')),
  reconciliation_difference numeric(20,2),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.financial_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  account_id uuid not null references public.financial_accounts(id) on delete restrict,
  captured_at timestamptz not null default now(),
  ledger_balance numeric(20,2) not null,
  available_balance numeric(20,2),
  pending_balance numeric(20,2) check (pending_balance is null or pending_balance >= 0),
  source text not null check (source in ('MANUAL', 'STATEMENT', 'PROVIDER')),
  import_batch_id uuid references public.financial_import_batches(id) on delete set null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  account_id uuid not null references public.financial_accounts(id) on delete restrict,
  transaction_date date not null,
  posted_at timestamptz,
  reference_number text,
  description text not null check (length(btrim(description)) between 1 and 500),
  direction text not null check (direction in ('CREDIT', 'DEBIT')),
  amount numeric(20,2) not null check (amount > 0),
  currency text not null check (currency = upper(currency) and currency ~ '^[A-Z]{3}$'),
  running_balance numeric(20,2),
  status text not null default 'POSTED' check (status in ('PENDING', 'POSTED', 'REVERSED')),
  source text not null check (source in ('MANUAL', 'CSV', 'XLSX', 'PDF', 'PROVIDER')),
  provider_transaction_id text,
  source_fingerprint text not null check (length(btrim(source_fingerprint)) between 8 and 256),
  import_batch_id uuid references public.financial_import_batches(id) on delete set null,
  reconciliation_status text not null default 'UNMATCHED' check (reconciliation_status in ('UNMATCHED', 'SUGGESTED', 'PARTIAL', 'MATCHED', 'IGNORED')),
  transfer_group_id uuid,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, source_fingerprint)
);

create table if not exists public.financial_transaction_matches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  transaction_id uuid not null references public.financial_transactions(id) on delete restrict,
  target_type text not null check (target_type in ('EXPENSE', 'INVOICE', 'PAYROLL', 'TRANSFER', 'OTHER')),
  target_id uuid,
  matched_amount numeric(20,2) not null check (matched_amount > 0),
  status text not null default 'SUGGESTED' check (status in ('SUGGESTED', 'CONFIRMED', 'REJECTED')),
  confidence numeric(5,2) check (confidence is null or confidence between 0 and 100),
  confirmed_by_user_id uuid references auth.users(id) on delete set null,
  confirmed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists financial_accounts_company_active_idx on public.financial_accounts(company_id, active, display_name);
create index if not exists financial_import_batches_company_account_created_idx on public.financial_import_batches(company_id, account_id, created_at desc);
create unique index if not exists financial_import_batches_account_file_unique on public.financial_import_batches(account_id, file_fingerprint) where status = 'IMPORTED';
create index if not exists financial_balance_snapshots_account_captured_idx on public.financial_balance_snapshots(account_id, captured_at desc);
create index if not exists financial_transactions_company_account_date_idx on public.financial_transactions(company_id, account_id, transaction_date desc);
create index if not exists financial_transactions_account_fingerprint_idx on public.financial_transactions(account_id, source_fingerprint);
create index if not exists financial_transactions_company_reconciliation_idx on public.financial_transactions(company_id, reconciliation_status, transaction_date desc);
create index if not exists financial_transaction_matches_transaction_idx on public.financial_transaction_matches(transaction_id, status);
create index if not exists financial_transaction_matches_target_idx on public.financial_transaction_matches(company_id, target_type, target_id);

-- The company audit catalog is append-only. Extend its allowlist without
-- changing any previously recorded financial or access history.
alter table public.company_audit_events drop constraint if exists company_audit_events_event_type_check;
alter table public.company_audit_events add constraint company_audit_events_event_type_check check (event_type in (
  'COMPANY_CREATED', 'COMPANY_UPDATED', 'COMPANY_SUSPENDED', 'COMPANY_ARCHIVED', 'COMPANY_REACTIVATED',
  'USER_INVITED', 'INVITE_REVOKED', 'INVITE_ACCEPTED', 'MEMBER_ROLE_CHANGED', 'MEMBER_SUSPENDED',
  'MEMBER_REACTIVATED', 'MEMBER_REVOKED', 'CASH_ACCOUNT_CREATED', 'CASH_ACCOUNT_UPDATED',
  'CASH_ACCOUNT_DEACTIVATED', 'CASH_BALANCE_SNAPSHOT_RECORDED', 'CASH_STATEMENT_IMPORTED',
  'CASH_STATEMENT_REJECTED', 'CASH_TRANSACTION_CREATED', 'CASH_TRANSACTION_UPDATED',
  'CASH_RECONCILIATION_CONFIRMED', 'CASH_RECONCILIATION_REMOVED', 'CASH_TRANSFER_MATCHED'
));

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
  if not found then raise exception 'Financial account is outside the company' using errcode = '42501'; end if;
  if tg_table_name = 'financial_transactions' and new.currency is distinct from v_account.currency then
    raise exception 'Transaction currency must match its financial account' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function private.validate_financial_actor()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
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
  select * into v_transaction
  from public.financial_transactions ft
  where ft.id = new.transaction_id and ft.company_id = new.company_id;
  if not found then raise exception 'Matched transaction is outside the company' using errcode = '42501'; end if;
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

create or replace function private.audit_financial_event()
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
  if tg_table_name = 'financial_accounts' then
    v_event := case when tg_op = 'INSERT' then 'CASH_ACCOUNT_CREATED' when new.active = false and old.active is distinct from false then 'CASH_ACCOUNT_DEACTIVATED' else 'CASH_ACCOUNT_UPDATED' end;
    v_target_id := new.id;
    v_metadata := jsonb_build_object('display_name', new.display_name, 'account_type', new.account_type, 'currency', new.currency, 'masked_identifier', new.masked_identifier);
  elsif tg_table_name = 'financial_balance_snapshots' then
    v_event := 'CASH_BALANCE_SNAPSHOT_RECORDED';
    v_target_id := new.id;
    v_metadata := jsonb_build_object('account_id', new.account_id, 'source', new.source, 'captured_at', new.captured_at);
  elsif tg_table_name = 'financial_import_batches' then
    v_event := case when new.status = 'FAILED' then 'CASH_STATEMENT_REJECTED' else 'CASH_STATEMENT_IMPORTED' end;
    v_target_id := new.id;
    v_metadata := jsonb_build_object('account_id', new.account_id, 'file_name', new.file_name, 'row_count', new.row_count, 'imported_count', new.imported_count, 'duplicate_count', new.duplicate_count, 'rejected_count', new.rejected_count);
  elsif tg_table_name = 'financial_transactions' and new.source = 'MANUAL' then
    v_event := case when tg_op = 'INSERT' then 'CASH_TRANSACTION_CREATED' else 'CASH_TRANSACTION_UPDATED' end;
    v_target_id := new.id;
    v_metadata := jsonb_build_object('account_id', new.account_id, 'transaction_date', new.transaction_date, 'direction', new.direction, 'amount', new.amount, 'source', new.source);
  elsif tg_table_name = 'financial_transaction_matches' and tg_op = 'UPDATE' and old.status = 'CONFIRMED' and new.status = 'REJECTED' then
    v_event := 'CASH_RECONCILIATION_REMOVED';
    v_target_id := new.transaction_id;
    v_metadata := jsonb_build_object('match_id', new.id, 'target_type', new.target_type, 'target_id', new.target_id, 'matched_amount', new.matched_amount);
  elsif tg_table_name = 'financial_transaction_matches' and new.status = 'CONFIRMED' then
    v_event := case when new.target_type = 'TRANSFER' then 'CASH_TRANSFER_MATCHED' else 'CASH_RECONCILIATION_CONFIRMED' end;
    v_target_id := new.transaction_id;
    v_metadata := jsonb_build_object('match_id', new.id, 'target_type', new.target_type, 'target_id', new.target_id, 'matched_amount', new.matched_amount);
  else
    return new;
  end if;
  perform private.write_company_audit(new.company_id, v_event, 'financial', v_target_id, v_metadata);
  return new;
end;
$$;

drop trigger if exists financial_accounts_company_boundary on public.financial_accounts;
create trigger financial_accounts_company_boundary before insert or update on public.financial_accounts for each row execute function private.enforce_company_row_boundary();
drop trigger if exists financial_import_batches_company_boundary on public.financial_import_batches;
create trigger financial_import_batches_company_boundary before insert or update on public.financial_import_batches for each row execute function private.enforce_company_row_boundary();
drop trigger if exists financial_balance_snapshots_company_boundary on public.financial_balance_snapshots;
create trigger financial_balance_snapshots_company_boundary before insert or update on public.financial_balance_snapshots for each row execute function private.enforce_company_row_boundary();
drop trigger if exists financial_transactions_company_boundary on public.financial_transactions;
create trigger financial_transactions_company_boundary before insert or update on public.financial_transactions for each row execute function private.enforce_company_row_boundary();
drop trigger if exists financial_transaction_matches_company_boundary on public.financial_transaction_matches;
create trigger financial_transaction_matches_company_boundary before insert or update on public.financial_transaction_matches for each row execute function private.enforce_company_row_boundary();

drop trigger if exists financial_transactions_account_reference on public.financial_transactions;
create trigger financial_transactions_account_reference before insert or update on public.financial_transactions for each row execute function private.validate_financial_account_reference();
drop trigger if exists financial_import_batches_account_reference on public.financial_import_batches;
create trigger financial_import_batches_account_reference before insert or update on public.financial_import_batches for each row execute function private.validate_financial_account_reference();
drop trigger if exists financial_balance_snapshots_account_reference on public.financial_balance_snapshots;
create trigger financial_balance_snapshots_account_reference before insert or update on public.financial_balance_snapshots for each row execute function private.validate_financial_account_reference();
drop trigger if exists financial_transaction_matches_integrity on public.financial_transaction_matches;
create trigger financial_transaction_matches_integrity before insert or update on public.financial_transaction_matches for each row execute function private.validate_financial_match();

drop trigger if exists financial_accounts_actor on public.financial_accounts;
create trigger financial_accounts_actor before insert or update on public.financial_accounts for each row execute function private.validate_financial_actor();
drop trigger if exists financial_import_batches_actor on public.financial_import_batches;
create trigger financial_import_batches_actor before insert or update on public.financial_import_batches for each row execute function private.validate_financial_actor();
drop trigger if exists financial_balance_snapshots_actor on public.financial_balance_snapshots;
create trigger financial_balance_snapshots_actor before insert or update on public.financial_balance_snapshots for each row execute function private.validate_financial_actor();
drop trigger if exists financial_transactions_actor on public.financial_transactions;
create trigger financial_transactions_actor before insert or update on public.financial_transactions for each row execute function private.validate_financial_actor();
drop trigger if exists financial_transaction_matches_actor on public.financial_transaction_matches;
create trigger financial_transaction_matches_actor before insert or update on public.financial_transaction_matches for each row execute function private.validate_financial_actor();

drop trigger if exists financial_accounts_updated_at on public.financial_accounts;
create trigger financial_accounts_updated_at before update on public.financial_accounts for each row execute function private.set_company_updated_at();
drop trigger if exists financial_transactions_updated_at on public.financial_transactions;
create trigger financial_transactions_updated_at before update on public.financial_transactions for each row execute function private.set_company_updated_at();
drop trigger if exists financial_import_batches_updated_at on public.financial_import_batches;
create trigger financial_import_batches_updated_at before update on public.financial_import_batches for each row execute function private.set_company_updated_at();
drop trigger if exists financial_transaction_matches_updated_at on public.financial_transaction_matches;
create trigger financial_transaction_matches_updated_at before update on public.financial_transaction_matches for each row execute function private.set_company_updated_at();
drop trigger if exists financial_accounts_audit on public.financial_accounts;
create trigger financial_accounts_audit after insert or update on public.financial_accounts for each row execute function private.audit_financial_event();
drop trigger if exists financial_balance_snapshots_audit on public.financial_balance_snapshots;
create trigger financial_balance_snapshots_audit after insert on public.financial_balance_snapshots for each row execute function private.audit_financial_event();
drop trigger if exists financial_import_batches_audit on public.financial_import_batches;
create trigger financial_import_batches_audit after insert or update on public.financial_import_batches for each row execute function private.audit_financial_event();
drop trigger if exists financial_transaction_matches_audit on public.financial_transaction_matches;
create trigger financial_transaction_matches_audit after insert or update on public.financial_transaction_matches for each row execute function private.audit_financial_event();
drop trigger if exists financial_transactions_audit on public.financial_transactions;
create trigger financial_transactions_audit after insert or update on public.financial_transactions for each row execute function private.audit_financial_event();

alter table public.financial_accounts enable row level security;
alter table public.financial_balance_snapshots enable row level security;
alter table public.financial_transactions enable row level security;
alter table public.financial_import_batches enable row level security;
alter table public.financial_transaction_matches enable row level security;

drop policy if exists financial_accounts_company_select on public.financial_accounts;
create policy financial_accounts_company_select on public.financial_accounts for select to authenticated using ((select public.has_company_permission(company_id, 'cash.summary.read')));
drop policy if exists financial_accounts_company_insert on public.financial_accounts;
create policy financial_accounts_company_insert on public.financial_accounts for insert to authenticated with check ((select public.has_company_permission(company_id, 'cash.accounts.manage')));
drop policy if exists financial_accounts_company_update on public.financial_accounts;
create policy financial_accounts_company_update on public.financial_accounts for update to authenticated using ((select public.has_company_permission(company_id, 'cash.accounts.manage'))) with check ((select public.has_company_permission(company_id, 'cash.accounts.manage')));

drop policy if exists financial_balance_snapshots_company_select on public.financial_balance_snapshots;
create policy financial_balance_snapshots_company_select on public.financial_balance_snapshots for select to authenticated using ((select public.has_company_permission(company_id, 'cash.summary.read')));
drop policy if exists financial_balance_snapshots_company_insert on public.financial_balance_snapshots;
create policy financial_balance_snapshots_company_insert on public.financial_balance_snapshots for insert to authenticated with check ((select public.has_company_permission(company_id, 'cash.accounts.manage')));

drop policy if exists financial_transactions_company_select on public.financial_transactions;
create policy financial_transactions_company_select on public.financial_transactions for select to authenticated using ((select public.has_company_permission(company_id, 'cash.transactions.read')));
drop policy if exists financial_transactions_company_insert on public.financial_transactions;
create policy financial_transactions_company_insert on public.financial_transactions for insert to authenticated with check ((select public.has_company_permission(company_id, 'cash.transactions.manage')));
drop policy if exists financial_transactions_company_update on public.financial_transactions;
create policy financial_transactions_company_update on public.financial_transactions for update to authenticated using ((select public.has_company_permission(company_id, 'cash.transactions.manage')) or (select public.has_company_permission(company_id, 'cash.reconcile'))) with check ((select public.has_company_permission(company_id, 'cash.transactions.manage')) or (select public.has_company_permission(company_id, 'cash.reconcile')));

drop policy if exists financial_import_batches_company_select on public.financial_import_batches;
create policy financial_import_batches_company_select on public.financial_import_batches for select to authenticated using ((select public.has_company_permission(company_id, 'cash.import')));
drop policy if exists financial_import_batches_company_insert on public.financial_import_batches;
create policy financial_import_batches_company_insert on public.financial_import_batches for insert to authenticated with check ((select public.has_company_permission(company_id, 'cash.import')));
drop policy if exists financial_import_batches_company_update on public.financial_import_batches;
create policy financial_import_batches_company_update on public.financial_import_batches for update to authenticated using ((select public.has_company_permission(company_id, 'cash.import'))) with check ((select public.has_company_permission(company_id, 'cash.import')));

drop policy if exists financial_transaction_matches_company_select on public.financial_transaction_matches;
create policy financial_transaction_matches_company_select on public.financial_transaction_matches for select to authenticated using ((select public.has_company_permission(company_id, 'cash.reconcile')));
drop policy if exists financial_transaction_matches_company_insert on public.financial_transaction_matches;
create policy financial_transaction_matches_company_insert on public.financial_transaction_matches for insert to authenticated with check ((select public.has_company_permission(company_id, 'cash.reconcile')));
drop policy if exists financial_transaction_matches_company_update on public.financial_transaction_matches;
create policy financial_transaction_matches_company_update on public.financial_transaction_matches for update to authenticated using ((select public.has_company_permission(company_id, 'cash.reconcile'))) with check ((select public.has_company_permission(company_id, 'cash.reconcile')));

revoke all on table public.financial_accounts, public.financial_balance_snapshots, public.financial_transactions, public.financial_import_batches, public.financial_transaction_matches from public, anon, authenticated;
grant select, insert, update on table public.financial_accounts to authenticated;
grant select, insert on table public.financial_balance_snapshots to authenticated;
grant select, insert, update on table public.financial_transactions to authenticated;
grant select, insert, update on table public.financial_import_batches to authenticated;
grant select, insert, update on table public.financial_transaction_matches to authenticated;
revoke delete on table public.financial_accounts, public.financial_balance_snapshots, public.financial_transactions, public.financial_import_batches, public.financial_transaction_matches from authenticated;

create or replace function public.commit_financial_import(
  p_company_id uuid,
  p_account_id uuid,
  p_source_type text,
  p_file_name text,
  p_file_fingerprint text,
  p_statement_from date default null,
  p_statement_to date default null,
  p_opening_balance numeric default null,
  p_closing_balance numeric default null,
  p_row_count integer default 0,
  p_duplicate_count integer default 0,
  p_rejected_count integer default 0,
  p_rows jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_existing public.financial_import_batches;
  v_batch public.financial_import_batches;
  v_row jsonb;
  v_imported integer := 0;
  v_duplicates integer := 0;
  v_date text;
  v_amount numeric;
  v_direction text;
  v_fingerprint text;
  v_transaction_id uuid;
begin
  if v_user_id is null or not (select public.has_company_permission(p_company_id, 'cash.import')) then
    raise exception 'Cash statement import permission is required' using errcode = '42501';
  end if;
  if p_source_type not in ('CSV', 'XLSX') then raise exception 'Only CSV and XLSX statements are supported' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_rows, '[]'::jsonb)) <> 'array' then raise exception 'Statement rows must be a JSON array' using errcode = '22023'; end if;
  if not exists (select 1 from public.financial_accounts fa where fa.id = p_account_id and fa.company_id = p_company_id and fa.active) then
    raise exception 'Financial account is unavailable for this company' using errcode = '42501';
  end if;
  select * into v_existing
  from public.financial_import_batches fib
  where fib.account_id = p_account_id and fib.company_id = p_company_id and fib.file_fingerprint = p_file_fingerprint and fib.status = 'IMPORTED'
  order by fib.created_at desc limit 1;
  if found then
    return jsonb_build_object('batch_id', v_existing.id, 'imported_count', 0, 'duplicate_count', v_existing.row_count, 'rejected_count', v_existing.rejected_count);
  end if;

  for v_row in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if jsonb_typeof(v_row) <> 'object' then raise exception 'Each statement row must be an object' using errcode = '22023'; end if;
    v_date := v_row->>'transaction_date';
    v_direction := v_row->>'direction';
    v_fingerprint := v_row->>'source_fingerprint';
    begin v_amount := (v_row->>'amount')::numeric; exception when others then raise exception 'Statement amount is invalid' using errcode = '22023'; end;
    if v_date !~ '^\d{4}-\d{2}-\d{2}$' or v_direction not in ('CREDIT', 'DEBIT') or v_amount is null or v_amount <= 0 or length(coalesce(v_fingerprint, '')) < 8 then
      raise exception 'Statement row failed server validation' using errcode = '22023';
    end if;
  end loop;

  insert into public.financial_import_batches (
    company_id, account_id, source_type, file_name, file_fingerprint, statement_from, statement_to,
    opening_balance, closing_balance, row_count, duplicate_count, rejected_count, status,
    created_by_user_id, completed_at
  ) values (
    p_company_id, p_account_id, p_source_type, coalesce(nullif(btrim(p_file_name), ''), 'statement'), p_file_fingerprint,
    p_statement_from, p_statement_to, p_opening_balance, p_closing_balance, coalesce(p_row_count, 0), 0,
    coalesce(p_rejected_count, 0), 'IMPORTED', v_user_id, now()
  ) returning * into v_batch;

  for v_row in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_transaction_id := null;
    insert into public.financial_transactions (
      company_id, account_id, transaction_date, posted_at, reference_number, description, direction, amount,
      currency, running_balance, status, source, source_fingerprint, import_batch_id, reconciliation_status,
      created_by_user_id
    )
    select p_company_id, p_account_id, (v_row->>'transaction_date')::date, nullif(v_row->>'posted_at', '')::timestamptz,
      nullif(v_row->>'reference_number', ''), btrim(v_row->>'description'), v_row->>'direction', (v_row->>'amount')::numeric,
      upper(v_row->>'currency'), nullif(v_row->>'running_balance', '')::numeric, 'POSTED', p_source_type,
      v_row->>'source_fingerprint', v_batch.id, 'UNMATCHED', v_user_id
    where not exists (
      select 1 from public.financial_transactions existing
      where existing.account_id = p_account_id and existing.source_fingerprint = v_row->>'source_fingerprint'
    )
    returning id into v_transaction_id;
    if v_transaction_id is null then v_duplicates := v_duplicates + 1; else v_imported := v_imported + 1; end if;
  end loop;

  update public.financial_import_batches fib
  set imported_count = v_imported, duplicate_count = v_duplicates, updated_at = now()
  where fib.id = v_batch.id;
  if p_closing_balance is not null then
    insert into public.financial_balance_snapshots (
      company_id, account_id, captured_at, ledger_balance, source, import_batch_id, created_by_user_id
    ) values (p_company_id, p_account_id, now(), p_closing_balance, 'STATEMENT', v_batch.id, v_user_id);
  end if;
  return jsonb_build_object('batch_id', v_batch.id, 'imported_count', v_imported, 'duplicate_count', v_duplicates, 'rejected_count', coalesce(p_rejected_count, 0));
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
  v_user_id uuid := (select auth.uid());
  v_left public.financial_transactions;
  v_right public.financial_transactions;
begin
  if v_user_id is null or not (select public.has_company_permission(p_company_id, 'cash.reconcile')) then
    raise exception 'Cash reconciliation permission is required' using errcode = '42501';
  end if;
  select * into v_left from public.financial_transactions ft where ft.id = p_left_transaction_id and ft.company_id = p_company_id for update;
  select * into v_right from public.financial_transactions ft where ft.id = p_right_transaction_id and ft.company_id = p_company_id for update;
  if not found or v_left.id is null or v_right.id is null then raise exception 'Both transfer transactions must belong to the company' using errcode = '42501'; end if;
  if v_left.account_id = v_right.account_id or v_left.currency <> v_right.currency or v_left.direction = v_right.direction or abs(v_left.amount - v_right.amount) > 0.01 or p_matched_amount <= 0 or p_matched_amount > v_left.amount then
    raise exception 'Transfer transactions must be opposite, same-currency, equal-value movements across accounts' using errcode = '22023';
  end if;
  if exists (select 1 from public.financial_transaction_matches ftm where ftm.transaction_id in (v_left.id, v_right.id) and ftm.status = 'CONFIRMED' and ftm.target_type <> 'TRANSFER') then
    raise exception 'Transactions with confirmed operating matches cannot be paired as transfers' using errcode = '22023';
  end if;
  update public.financial_transactions set transfer_group_id = p_transfer_group_id, reconciliation_status = 'MATCHED', updated_at = now() where id in (v_left.id, v_right.id);
  insert into public.financial_transaction_matches (company_id, created_by_user_id, transaction_id, target_type, target_id, matched_amount, status, confirmed_by_user_id, confirmed_at, notes)
  values
    (p_company_id, v_user_id, v_left.id, 'TRANSFER', v_right.id, p_matched_amount, 'CONFIRMED', v_user_id, now(), 'Confirmed internal transfer'),
    (p_company_id, v_user_id, v_right.id, 'TRANSFER', v_left.id, p_matched_amount, 'CONFIRMED', v_user_id, now(), 'Confirmed internal transfer');
  return jsonb_build_object('transfer_group_id', p_transfer_group_id, 'left_transaction_id', v_left.id, 'right_transaction_id', v_right.id);
end;
$$;

revoke execute on function public.commit_financial_import(uuid, uuid, text, text, text, date, date, numeric, numeric, integer, integer, integer, jsonb) from public, anon;
revoke execute on function public.confirm_financial_transfer(uuid, uuid, uuid, numeric, uuid) from public, anon;
grant execute on function public.commit_financial_import(uuid, uuid, text, text, text, date, date, numeric, numeric, integer, integer, integer, jsonb) to authenticated;
grant execute on function public.confirm_financial_transfer(uuid, uuid, uuid, numeric, uuid) to authenticated;

revoke execute on function private.validate_financial_account_reference() from public, anon, authenticated;
revoke execute on function private.validate_financial_actor() from public, anon, authenticated;
revoke execute on function private.validate_financial_match() from public, anon, authenticated;
revoke execute on function private.audit_financial_event() from public, anon, authenticated;
