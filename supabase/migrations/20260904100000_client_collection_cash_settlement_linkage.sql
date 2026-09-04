-- P2B-6 Client Collection <-> Cash & Banking Settlement Linkage
--
-- Client collections remain commercial receivables truth. This migration only
-- adds bank/cash evidence linkage through the existing financial transaction
-- match model and guarded settlement RPCs.

-- 1. Extend the existing settlement target contract. No parallel settlement
-- table is introduced and historical target types remain valid.
alter table public.financial_transaction_matches
  drop constraint if exists financial_transaction_matches_target_type_check;

alter table public.financial_transaction_matches
  add constraint financial_transaction_matches_target_type_check
  check (target_type in ('EXPENSE', 'INVOICE', 'PAYROLL', 'CLIENT_COLLECTION', 'TRANSFER', 'OTHER'));

-- 2. Keep the generic match trigger aligned with the guarded RPC. Direct
-- authenticated writes are already revoked, but the trigger remains a second
-- line of defence for company, direction, lifecycle, currency, and allocation
-- invariants.
create or replace function private.validate_financial_match()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_transaction public.financial_transactions;
  v_collection public.client_collections;
  v_confirmed numeric(20,2);
  v_target_confirmed numeric(20,2);
  v_collection_total numeric(20,2);
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
  if not found then
    raise exception 'Matched transaction is outside the company' using errcode = '42501';
  end if;

  if new.target_type = 'EXPENSE' and not exists (
    select 1 from public.expenses e where e.id = new.target_id and e.company_id = new.company_id
  ) then
    raise exception 'Matched expense is outside the company' using errcode = '42501';
  elsif new.target_type = 'INVOICE' and not exists (
    select 1 from public.invoices i where i.id = new.target_id and i.company_id = new.company_id
  ) then
    raise exception 'Matched invoice is outside the company' using errcode = '42501';
  elsif new.target_type = 'PAYROLL' and not exists (
    select 1 from public.payroll_runs pr where pr.id = new.target_id and pr.company_id = new.company_id
  ) then
    raise exception 'Matched payroll run is outside the company' using errcode = '42501';
  elsif new.target_type = 'CLIENT_COLLECTION' then
    select * into v_collection
    from public.client_collections c
    where c.id = new.target_id and c.company_id = new.company_id;
    if not found then
      raise exception 'Matched client collection is outside the company' using errcode = '42501';
    end if;
  elsif new.target_type = 'TRANSFER' and not exists (
    select 1
    from public.financial_transactions other
    where other.id = new.target_id
      and other.company_id = new.company_id
      and other.id <> new.transaction_id
  ) then
    raise exception 'Matched transfer transaction is outside the company' using errcode = '42501';
  end if;

  if new.status = 'CONFIRMED' then
    if v_transaction.status <> 'POSTED' then
      raise exception 'Only POSTED transactions can be confirmed as settlement evidence' using errcode = '42501';
    end if;
    if new.target_type = 'CLIENT_COLLECTION' then
      if v_transaction.direction <> 'CREDIT' then
        raise exception 'Client collection settlements require a CREDIT transaction' using errcode = '22023';
      end if;
      if upper(v_transaction.currency) <> upper(v_collection.currency) then
        raise exception 'Settlement currency mismatch: transaction % vs target %', v_transaction.currency, v_collection.currency using errcode = '22023';
      end if;
      if v_collection.status <> 'RECORDED' then
        raise exception 'Only RECORDED client collections can receive settlement evidence' using errcode = '42501';
      end if;
      select coalesce(sum(a.amount), 0)::numeric(20,2)
        into v_collection_total
      from public.client_collection_allocations a
      where a.company_id = new.company_id and a.collection_id = new.target_id;
      select coalesce(sum(m.matched_amount), 0)::numeric(20,2)
        into v_target_confirmed
      from public.financial_transaction_matches m
      where m.company_id = new.company_id
        and m.target_type = 'CLIENT_COLLECTION'
        and m.target_id = new.target_id
        and m.status = 'CONFIRMED'
        and m.id <> new.id;
      if v_target_confirmed + new.matched_amount > v_collection_total + 0.005 then
        raise exception 'Confirmed matches cannot exceed the client collection allocation total' using errcode = '22023';
      end if;
    elsif new.target_type in ('INVOICE', 'PAYROLL', 'EXPENSE') then
      if v_transaction.direction <> 'DEBIT' then
        raise exception 'Supplier invoice, payroll, and expense settlements require a DEBIT transaction' using errcode = '22023';
      end if;
    end if;
  end if;

  if new.status = 'CONFIRMED' then
    select coalesce(sum(ftm.matched_amount), 0)::numeric(20,2)
      into v_confirmed
    from public.financial_transaction_matches ftm
    where ftm.company_id = new.company_id
      and ftm.transaction_id = new.transaction_id
      and ftm.status = 'CONFIRMED'
      and ftm.id <> new.id;
    if v_confirmed + new.matched_amount > v_transaction.amount + 0.005 then
      raise exception 'Confirmed matches cannot exceed the transaction amount' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists financial_transaction_matches_scope_guard on public.financial_transaction_matches;
drop trigger if exists financial_transaction_matches_integrity on public.financial_transaction_matches;
create trigger financial_transaction_matches_integrity
  before insert or update on public.financial_transaction_matches
  for each row execute function private.validate_financial_match();

-- 3. A collection cannot be reversed while a confirmed bank-evidence link is
-- active. This trigger protects direct privileged SQL paths as well as the
-- public lifecycle RPC; the RPC below adds deterministic locking before it
-- reaches this trigger.
create or replace function private.guard_client_collection_finalized_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'DRAFT' then
    if new.status not in ('DRAFT', 'RECORDED') then
      raise exception 'Draft client collections can only remain draft or be recorded through the guarded lifecycle'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.status = 'RECORDED' then
    if new.status <> 'REVERSED' then
      raise exception 'Recorded client collections are immutable and can only be reversed once through the guarded lifecycle'
        using errcode = '42501';
    end if;
    if exists (
      select 1
      from public.financial_transaction_matches m
      where m.company_id = old.company_id
        and m.target_type = 'CLIENT_COLLECTION'
        and m.target_id = old.id
        and m.status = 'CONFIRMED'
    ) then
      raise exception 'Reverse active cash settlement links before reversing this client collection'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if old.status = 'REVERSED' then
    raise exception 'Reversed client collections are terminal and immutable'
      using errcode = '42501';
  end if;

  raise exception 'Unsupported client collection lifecycle state: %', old.status
    using errcode = '42501';
end;
$$;

drop trigger if exists client_collections_finalized_state_guard on public.client_collections;
create trigger client_collections_finalized_state_guard
  before update on public.client_collections
  for each row execute function private.guard_client_collection_finalized_update();

-- 4. Existing single-target settlement confirmation, extended only for the
-- incoming client-collection target. Transaction is locked before target;
-- matching targets are locked before both active ceilings are recomputed.
create or replace function public.confirm_financial_settlement(
  p_company_id uuid,
  p_transaction_id uuid,
  p_target_type text,
  p_target_id uuid,
  p_matched_amount numeric,
  p_match_id uuid default null,
  p_confidence numeric default null,
  p_notes text default null,
  p_confirmation_source text default 'RECONCILIATION_UI'
)
returns public.financial_transaction_matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_transaction public.financial_transactions%rowtype;
  v_collection public.client_collections%rowtype;
  v_match public.financial_transaction_matches%rowtype;
  v_existing public.financial_transaction_matches%rowtype;
  v_tx_allocated numeric := 0;
  v_target_allocated numeric := 0;
  v_target_basis numeric := 0;
  v_target_currency text;
  v_target_status text;
  v_target_type text := upper(btrim(coalesce(p_target_type, '')));
  v_matched_amount numeric := round(coalesce(p_matched_amount, 0), 2);
  v_id uuid := coalesce(p_match_id, gen_random_uuid());
begin
  if v_actor is null or not (select private.has_company_permission(p_company_id, 'cash.reconcile')) then
    raise exception 'Financial settlement permission denied' using errcode = '42501';
  end if;
  if v_target_type not in ('INVOICE', 'PAYROLL', 'EXPENSE', 'CLIENT_COLLECTION') or p_target_id is null then
    raise exception 'Settlement target must be an invoice, payroll run, expense, or client collection' using errcode = '22023';
  end if;
  if v_matched_amount <= 0 then
    raise exception 'Settlement amount must be positive' using errcode = '22023';
  end if;

  select * into v_transaction
  from public.financial_transactions ft
  where ft.id = p_transaction_id and ft.company_id = p_company_id
  for update;
  if not found then
    raise exception 'Financial transaction is outside the selected company or unavailable' using errcode = '42501';
  end if;
  if v_transaction.status <> 'POSTED' then
    raise exception 'Only POSTED transactions can settle a financial obligation';
  end if;
  if v_target_type = 'CLIENT_COLLECTION' and v_transaction.direction <> 'CREDIT' then
    raise exception 'Client collection settlements require a CREDIT transaction' using errcode = '22023';
  elsif v_target_type in ('INVOICE', 'PAYROLL', 'EXPENSE') and v_transaction.direction <> 'DEBIT' then
    raise exception 'Supplier invoice, payroll, and expense settlements require a DEBIT transaction' using errcode = '22023';
  end if;

  select * into v_existing
  from public.financial_transaction_matches m
  where m.id = v_id;
  if found then
    if v_existing.company_id = p_company_id
       and v_existing.transaction_id = p_transaction_id
       and v_existing.target_type = v_target_type
       and v_existing.target_id = p_target_id
       and abs(v_existing.matched_amount - v_matched_amount) <= 0.005
       and v_existing.status = 'CONFIRMED' then
      return v_existing;
    end if;
    raise exception 'Settlement request id is already used with different terms' using errcode = '23505';
  end if;

  if v_target_type = 'INVOICE' then
    if not (select private.has_company_permission(p_company_id, 'invoices.manage')) then
      raise exception 'Invoice settlement requires invoices.manage' using errcode = '42501';
    end if;
    select i.currency, i.review_status into v_target_currency, v_target_status
    from public.invoices i
    where i.id = p_target_id and i.company_id = p_company_id
    for update;
    if not found then raise exception 'Invoice is outside the selected company or unavailable' using errcode = '42501'; end if;
    if v_target_status <> 'VERIFIED' then raise exception 'Only VERIFIED supplier invoices can be settled'; end if;
    v_target_basis := private.invoice_cash_payable_basis(p_target_id, p_company_id);
  elsif v_target_type = 'PAYROLL' then
    if not (select private.has_company_permission(p_company_id, 'payroll.approve')) then
      raise exception 'Payroll settlement requires payroll.approve' using errcode = '42501';
    end if;
    select pr.status, c.default_currency into v_target_status, v_target_currency
    from public.payroll_runs pr
    join public.companies c on c.id = pr.company_id
    where pr.id = p_target_id and pr.company_id = p_company_id
    for update of pr;
    if not found then raise exception 'Payroll run is outside the selected company or unavailable' using errcode = '42501'; end if;
    if v_target_status not in ('APPROVED', 'PAID') then raise exception 'Only APPROVED or legacy PAID payroll runs can be linked to disbursement evidence'; end if;
    v_target_basis := private.payroll_net_pay_basis(p_target_id, p_company_id);
  elsif v_target_type = 'EXPENSE' then
    if not (select private.has_company_permission(p_company_id, 'expenses.manage')) then
      raise exception 'Expense settlement requires expenses.manage' using errcode = '42501';
    end if;
    select e.currency, e.status, e.amount into v_target_currency, v_target_status, v_target_basis
    from public.expenses e
    where e.id = p_target_id and e.company_id = p_company_id
    for update;
    if not found then raise exception 'Expense is outside the selected company or unavailable' using errcode = '42501'; end if;
    if v_target_status not in ('APPROVED', 'PAID') then raise exception 'Only APPROVED or PAID expenses can be reconciled'; end if;
  else
    if not (select private.has_company_permission(p_company_id, 'projects.manage')) then
      raise exception 'Client collection settlement requires projects.manage' using errcode = '42501';
    end if;
    select * into v_collection
    from public.client_collections c
    where c.id = p_target_id and c.company_id = p_company_id
    for update;
    if not found then raise exception 'Client collection is outside the selected company or unavailable' using errcode = '42501'; end if;
    v_target_currency := v_collection.currency;
    v_target_status := v_collection.status;
    if v_target_status <> 'RECORDED' then
      raise exception 'Only RECORDED client collections can receive settlement evidence' using errcode = '42501';
    end if;
    select coalesce(sum(a.amount), 0)::numeric(20,2)
      into v_target_basis
    from public.client_collection_allocations a
    where a.company_id = p_company_id and a.collection_id = p_target_id;
  end if;

  if v_target_basis <= 0 then raise exception 'Settlement target has no positive payable amount'; end if;
  if upper(coalesce(v_target_currency, '')) <> upper(v_transaction.currency) then
    raise exception 'Settlement currency mismatch: transaction % vs target %', v_transaction.currency, coalesce(v_target_currency, 'UNKNOWN') using errcode = '22023';
  end if;

  select coalesce(sum(m.matched_amount), 0)
    into v_tx_allocated
  from public.financial_transaction_matches m
  where m.company_id = p_company_id
    and m.transaction_id = p_transaction_id
    and m.status = 'CONFIRMED';
  if v_tx_allocated + v_matched_amount > v_transaction.amount + 0.005 then
    raise exception 'Settlement exceeds remaining transaction amount';
  end if;

  select coalesce(sum(m.matched_amount), 0)
    into v_target_allocated
  from public.financial_transaction_matches m
  where m.company_id = p_company_id
    and m.target_type = v_target_type
    and m.target_id = p_target_id
    and m.status = 'CONFIRMED';
  if v_target_allocated + v_matched_amount > v_target_basis + 0.005 then
    raise exception 'Settlement exceeds remaining target obligation';
  end if;

  perform set_config('app.financial_audit_event', 'CASH_SETTLEMENT_CONFIRMED', true);
  perform set_config('app.financial_audit_reason', coalesce(nullif(btrim(coalesce(p_notes, '')), ''), ''), true);
  insert into public.financial_transaction_matches(
    id, company_id, created_by_user_id, transaction_id, target_type, target_id,
    matched_amount, status, confidence, confirmed_by_user_id, confirmed_at,
    notes, confirmation_source
  ) values (
    v_id, p_company_id, v_actor, p_transaction_id, v_target_type, p_target_id,
    v_matched_amount, 'CONFIRMED', p_confidence, v_actor, now(),
    nullif(btrim(coalesce(p_notes, '')), ''),
    coalesce(nullif(btrim(p_confirmation_source), ''), 'RECONCILIATION_UI')
  ) returning * into v_match;
  perform set_config('app.financial_audit_event', '', true);
  perform set_config('app.financial_audit_reason', '', true);

  perform private.refresh_financial_transaction_reconciliation(p_transaction_id, p_company_id);
  return v_match;
end;
$$;

-- 5. Batch confirmation reuses the single-target authority and sorts target
-- locks so one bank transaction can be split safely across multiple targets.
create or replace function public.confirm_financial_settlement_batch(
  p_company_id uuid,
  p_transaction_id uuid,
  p_allocations jsonb,
  p_confirmation_source text default 'RECONCILIATION_UI'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_count integer;
  v_item jsonb;
  v_match public.financial_transaction_matches%rowtype;
  v_results jsonb := '[]'::jsonb;
  v_target_type text;
  v_target_id uuid;
  v_amount numeric;
  v_match_id uuid;
  v_confidence numeric;
  v_notes text;
begin
  if v_actor is null or not (select private.has_company_permission(p_company_id, 'cash.reconcile')) then
    raise exception 'Financial settlement permission denied' using errcode = '42501';
  end if;
  if jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'Settlement allocations must be an array' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_allocations);
  if v_count < 1 or v_count > 20 then
    raise exception 'Settlement batch must contain between 1 and 20 allocations' using errcode = '22023';
  end if;

  perform 1
  from public.financial_transactions ft
  where ft.id = p_transaction_id and ft.company_id = p_company_id
  for update;
  if not found then
    raise exception 'Financial transaction is outside the selected company or unavailable' using errcode = '42501';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_allocations)
    order by upper(coalesce(value ->> 'target_type', '')), coalesce(value ->> 'target_id', '')
  loop
    v_target_type := upper(coalesce(v_item ->> 'target_type', ''));
    if v_target_type not in ('INVOICE', 'PAYROLL', 'EXPENSE', 'CLIENT_COLLECTION') then
      raise exception 'Unsupported settlement target type in batch' using errcode = '22023';
    end if;
    begin
      v_target_id := (v_item ->> 'target_id')::uuid;
      v_match_id := coalesce(nullif(v_item ->> 'match_id', '')::uuid, gen_random_uuid());
      v_amount := (v_item ->> 'matched_amount')::numeric;
      v_confidence := case when nullif(v_item ->> 'confidence', '') is null then null else (v_item ->> 'confidence')::numeric end;
    exception when others then
      raise exception 'Settlement batch contains malformed identifiers or amounts' using errcode = '22023';
    end;
    v_notes := nullif(btrim(coalesce(v_item ->> 'notes', '')), '');

    v_match := public.confirm_financial_settlement(
      p_company_id,
      p_transaction_id,
      v_target_type,
      v_target_id,
      v_amount,
      v_match_id,
      v_confidence,
      v_notes,
      coalesce(nullif(btrim(p_confirmation_source), ''), 'RECONCILIATION_UI')
    );
    v_results := v_results || jsonb_build_array(to_jsonb(v_match));
  end loop;

  return jsonb_build_object(
    'transaction_id', p_transaction_id,
    'allocation_count', v_count,
    'matches', v_results
  );
end;
$$;

-- 6. Guarded reversal preserves the existing append-only match history and
-- adds project permission for client-collection evidence.
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
  v_actor uuid := (select auth.uid());
  v_match public.financial_transaction_matches%rowtype;
  v_result public.financial_transaction_matches%rowtype;
begin
  if v_actor is null or not (select private.has_company_permission(p_company_id, 'cash.reconcile')) then
    raise exception 'Financial settlement permission denied' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'A reversal reason is required' using errcode = '22023';
  end if;

  select * into v_match
  from public.financial_transaction_matches m
  where m.id = p_match_id and m.company_id = p_company_id
  for update;
  if not found then raise exception 'Settlement is outside the selected company or unavailable' using errcode = '42501'; end if;
  if v_match.status = 'REVERSED' then return v_match; end if;
  if v_match.status <> 'CONFIRMED' or v_match.target_type not in ('INVOICE', 'PAYROLL', 'EXPENSE', 'CLIENT_COLLECTION') then
    raise exception 'Only confirmed financial settlements can be reversed' using errcode = '22023';
  end if;

  perform 1
  from public.financial_transactions ft
  where ft.id = v_match.transaction_id and ft.company_id = p_company_id
  for update;
  if not found then raise exception 'Settlement transaction is unavailable' using errcode = '42501'; end if;

  if v_match.target_type = 'INVOICE' then
    if not (select private.has_company_permission(p_company_id, 'invoices.manage')) then raise exception 'Invoice settlement reversal requires invoices.manage' using errcode = '42501'; end if;
    perform 1 from public.invoices i where i.id = v_match.target_id and i.company_id = p_company_id for update;
  elsif v_match.target_type = 'PAYROLL' then
    if not (select private.has_company_permission(p_company_id, 'payroll.approve')) then raise exception 'Payroll settlement reversal requires payroll.approve' using errcode = '42501'; end if;
    perform 1 from public.payroll_runs pr where pr.id = v_match.target_id and pr.company_id = p_company_id for update;
  elsif v_match.target_type = 'EXPENSE' then
    if not (select private.has_company_permission(p_company_id, 'expenses.manage')) then raise exception 'Expense settlement reversal requires expenses.manage' using errcode = '42501'; end if;
    perform 1 from public.expenses e where e.id = v_match.target_id and e.company_id = p_company_id for update;
  else
    if not (select private.has_company_permission(p_company_id, 'projects.manage')) then raise exception 'Client collection settlement reversal requires projects.manage' using errcode = '42501'; end if;
    perform 1 from public.client_collections c where c.id = v_match.target_id and c.company_id = p_company_id for update;
  end if;
  if not found then raise exception 'Settlement target is unavailable' using errcode = '42501'; end if;

  perform set_config('app.financial_audit_event', 'CASH_SETTLEMENT_REVERSED', true);
  perform set_config('app.financial_audit_reason', btrim(p_reason), true);
  update public.financial_transaction_matches
  set status = 'REVERSED',
      reversed_by_user_id = v_actor,
      reversed_at = now(),
      reversal_reason = btrim(p_reason),
      updated_at = now()
  where id = p_match_id and company_id = p_company_id
  returning * into v_result;
  perform set_config('app.financial_audit_event', '', true);
  perform set_config('app.financial_audit_reason', '', true);

  perform private.refresh_financial_transaction_reconciliation(v_match.transaction_id, p_company_id);
  return v_result;
end;
$$;

-- 7. Canonical settlement summary. Client collections use allocation-derived
-- total and explicit linkage terminology; they never become unpaid commercial
-- collections merely because bank reconciliation is incomplete.
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
  v_target_type text := upper(btrim(coalesce(p_target_type, '')));
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  v_permission := case v_target_type
    when 'INVOICE' then 'invoices.read'
    when 'PAYROLL' then 'payroll.summary.read'
    when 'EXPENSE' then 'expenses.read'
    when 'CLIENT_COLLECTION' then 'projects.read'
    else null
  end;
  if v_permission is null or not (select private.has_company_permission(p_company_id, v_permission)) then
    raise exception 'Settlement summary permission denied' using errcode = '42501';
  end if;
  v_can_read_cash := (select private.has_company_permission(p_company_id, 'cash.transactions.read'));

  if v_target_type = 'INVOICE' then
    select i.currency,
      case when i.lifecycle_status = 'VOID' then 'VOID' else i.review_status end,
      i.due_date,
      case when coalesce(i.current_data ->> 'amountPaid', '') ~ '^[-+]?[0-9]+([.][0-9]+)?$' then (i.current_data ->> 'amountPaid')::numeric else 0 end
      into v_currency, v_lifecycle, v_due_date, v_document_paid
    from public.invoices i where i.id = p_target_id and i.company_id = p_company_id;
    if not found then raise exception 'Invoice unavailable' using errcode = '42501'; end if;
    v_basis := private.invoice_cash_payable_basis(p_target_id, p_company_id);
  elsif v_target_type = 'PAYROLL' then
    select c.default_currency, pr.status into v_currency, v_lifecycle
    from public.payroll_runs pr join public.companies c on c.id = pr.company_id
    where pr.id = p_target_id and pr.company_id = p_company_id;
    if not found then raise exception 'Payroll run unavailable' using errcode = '42501'; end if;
    v_basis := private.payroll_net_pay_basis(p_target_id, p_company_id);
  elsif v_target_type = 'EXPENSE' then
    select e.currency, e.status, e.amount into v_currency, v_lifecycle, v_basis
    from public.expenses e where e.id = p_target_id and e.company_id = p_company_id;
    if not found then raise exception 'Expense unavailable' using errcode = '42501'; end if;
  elsif v_target_type = 'CLIENT_COLLECTION' then
    select c.currency, c.status into v_currency, v_lifecycle
    from public.client_collections c where c.id = p_target_id and c.company_id = p_company_id;
    if not found then raise exception 'Client collection unavailable' using errcode = '42501'; end if;
    select coalesce(sum(a.amount), 0)::numeric(20,2)
      into v_basis
    from public.client_collection_allocations a
    where a.company_id = p_company_id and a.collection_id = p_target_id;
  else
    raise exception 'Unsupported settlement target type' using errcode = '22023';
  end if;

  select coalesce(sum(m.matched_amount) filter (where m.status = 'CONFIRMED'), 0)
    into v_cash_paid
  from public.financial_transaction_matches m
  where m.company_id = p_company_id and m.target_type = v_target_type and m.target_id = p_target_id;

  if v_can_read_cash then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id,
      'transactionId', m.transaction_id,
      'status', m.status,
      'amount', m.matched_amount,
      'confirmedAt', m.confirmed_at,
      'confirmedByUserId', m.confirmed_by_user_id,
      'reversedAt', m.reversed_at,
      'reversedByUserId', m.reversed_by_user_id,
      'reversalReason', m.reversal_reason,
      'confirmationSource', m.confirmation_source,
      'accountId', ft.account_id,
      'accountName', fa.display_name,
      'accountType', fa.account_type,
      'maskedIdentifier', fa.masked_identifier,
      'transactionDate', ft.transaction_date,
      'referenceNumber', ft.reference_number,
      'description', ft.description,
      'currency', ft.currency
    ) order by coalesce(m.confirmed_at, m.created_at) desc), '[]'::jsonb)
      into v_history
    from public.financial_transaction_matches m
    join public.financial_transactions ft on ft.id = m.transaction_id and ft.company_id = m.company_id
    join public.financial_accounts fa on fa.id = ft.account_id and fa.company_id = ft.company_id
    where m.company_id = p_company_id
      and m.target_type = v_target_type
      and m.target_id = p_target_id
      and m.status in ('CONFIRMED', 'REVERSED');
  end if;

  v_document_paid := least(v_basis, greatest(coalesce(v_document_paid, 0), 0));
  v_cash_paid := least(v_basis, greatest(coalesce(v_cash_paid, 0), 0));
  v_effective := case when v_target_type = 'INVOICE' then greatest(v_document_paid, v_cash_paid) else v_cash_paid end;

  return jsonb_build_object(
    'targetType', v_target_type,
    'targetId', p_target_id,
    'currency', v_currency,
    'lifecycleStatus', v_lifecycle,
    'settlementBasis', round(coalesce(v_basis, 0), 2),
    'reconciledCashPaid', round(v_cash_paid, 2),
    'documentReportedPaid', case when v_target_type = 'INVOICE' then round(v_document_paid, 2) else 0 end,
    'effectiveSettled', round(v_effective, 2),
    'outstanding', round(greatest(v_basis - v_effective, 0), 2),
    'settlementState', case
      when v_target_type = 'CLIENT_COLLECTION' and v_cash_paid <= 0.005 then 'UNLINKED'
      when v_target_type = 'CLIENT_COLLECTION' and v_cash_paid >= v_basis - 0.005 then 'LINKED'
      when v_target_type = 'CLIENT_COLLECTION' then 'PARTIALLY_LINKED'
      when v_lifecycle = 'VOID' then 'VOID'
      when v_target_type = 'PAYROLL' and v_cash_paid <= 0.005 then 'UNSETTLED'
      when v_target_type = 'PAYROLL' and v_cash_paid >= v_basis - 0.005 then 'SETTLED'
      when v_target_type = 'PAYROLL' then 'PARTIALLY_DISBURSED'
      when v_effective >= v_basis - 0.005 then 'PAID'
      when v_target_type = 'INVOICE' and v_due_date is not null and v_due_date < current_date and v_effective < v_basis - 0.005 then 'OVERDUE'
      when v_effective > 0.005 then 'PARTIALLY_PAID'
      else 'UNPAID'
    end,
    'basisSource', case
      when v_target_type = 'CLIENT_COLLECTION' then 'CLIENT_COLLECTION_ALLOCATIONS'
      when v_target_type = 'INVOICE' and private.invoice_cash_payable_basis(p_target_id, p_company_id) <> (select i.grand_total from public.invoices i where i.id = p_target_id) then 'EXPLICIT_NET_PAYABLE'
      when v_target_type = 'PAYROLL' then 'EMPLOYEE_NET_PAY'
      when v_target_type = 'EXPENSE' then 'EXPENSE_AMOUNT'
      else 'GROSS_DOCUMENT_AMOUNT'
    end,
    'legacyPaidWithoutBankLink', v_target_type = 'PAYROLL' and v_lifecycle = 'PAID' and v_cash_paid <= 0.005,
    'historyRedacted', not v_can_read_cash,
    'collectionTotal', case when v_target_type = 'CLIENT_COLLECTION' then round(v_basis, 2) else null end,
    'linkedAmount', case when v_target_type = 'CLIENT_COLLECTION' then round(v_cash_paid, 2) else null end,
    'remainingUnlinkedAmount', case when v_target_type = 'CLIENT_COLLECTION' then round(greatest(v_basis - v_cash_paid, 0), 2) else null end,
    'linkState', case
      when v_target_type <> 'CLIENT_COLLECTION' then null
      when v_cash_paid <= 0.005 then 'UNLINKED'
      when v_cash_paid >= v_basis - 0.005 then 'LINKED'
      else 'PARTIALLY_LINKED'
    end,
    'history', v_history
  );
end;
$$;

-- 8. Collection reversal locks project, all currently linked transactions in
-- stable order, then the collection before checking active matches. A pending
-- confirmation therefore either sees the reversed status or is serialized
-- before the dependency check; it cannot leave an active link behind.
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
  v_transaction_id uuid;
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
  if not found then raise exception 'Client collection was not found' using errcode = '23503'; end if;
  v_company_id := v_collection.company_id;
  perform private.require_project_permission(v_company_id, 'projects.manage');
  if v_collection.status <> 'RECORDED' then
    raise exception 'Only RECORDED client collections can be reversed' using errcode = '42501';
  end if;

  perform 1
  from public.projects p
  where p.id = v_collection.project_id and p.company_id = v_company_id
  for update;

  -- Match confirmation locks transaction before collection, so reverse uses
  -- the same order for every active linked transaction.
  for v_transaction_id in
    select distinct m.transaction_id
    from public.financial_transaction_matches m
    where m.company_id = v_company_id
      and m.target_type = 'CLIENT_COLLECTION'
      and m.target_id = p_collection_id
      and m.status = 'CONFIRMED'
    order by m.transaction_id
  loop
    perform 1
    from public.financial_transactions ft
    where ft.id = v_transaction_id and ft.company_id = v_company_id
    for update;
  end loop;

  select c.* into v_collection
  from public.client_collections c
  where c.id = p_collection_id and c.company_id = v_company_id
  for update;
  if not found then raise exception 'Client collection was not found in the deployment company' using errcode = '42501'; end if;
  if v_collection.status <> 'RECORDED' then
    raise exception 'Only RECORDED client collections can be reversed' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.financial_transaction_matches m
    where m.company_id = v_company_id
      and m.target_type = 'CLIENT_COLLECTION'
      and m.target_id = p_collection_id
      and m.status = 'CONFIRMED'
  ) then
    raise exception 'Reverse active cash settlement links before reversing this client collection' using errcode = '23514';
  end if;

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

-- 9. Preserve the guarded public API. No browser role can write confirmed
-- settlement rows directly or execute the RPC anonymously.
revoke all on function public.confirm_financial_settlement(uuid, uuid, text, uuid, numeric, uuid, numeric, text, text) from public, anon;
revoke all on function public.confirm_financial_settlement_batch(uuid, uuid, jsonb, text) from public, anon;
revoke all on function public.reverse_financial_settlement(uuid, uuid, text) from public, anon;
revoke all on function public.get_financial_settlement_summary(uuid, text, uuid) from public, anon;
grant execute on function public.confirm_financial_settlement(uuid, uuid, text, uuid, numeric, uuid, numeric, text, text) to authenticated;
grant execute on function public.confirm_financial_settlement_batch(uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.reverse_financial_settlement(uuid, uuid, text) to authenticated;
grant execute on function public.get_financial_settlement_summary(uuid, text, uuid) to authenticated;
revoke execute on function private.validate_financial_match() from public, anon, authenticated;
revoke execute on function private.guard_client_collection_finalized_update() from public, anon, authenticated;
