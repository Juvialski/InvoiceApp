-- Wave 3: payroll settlement semantics, certified subcontract payables, and
-- evidence-driven purchase-order close guards.
--
-- Payroll approval/finalization remains separate from Cash & Banking
-- settlement. Certified subcontract claims remain their own authoritative
-- payable source; no Expense bridge or duplicate Actual Cost record is made.

-- 1. Historical PAID payroll rows remain readable, but a new payroll run may
-- not become financially paid through a direct status update. Payment state is
-- derived from confirmed settlement evidence instead.
create or replace function private.guard_payroll_payment_status_transition()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'APPROVED' and new.status = 'PAID' then
    raise exception 'Payroll payment state derives from confirmed Cash & Banking settlement evidence; record payment through the settlement workflow' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists payroll_runs_payment_status_guard on public.payroll_runs;
create trigger payroll_runs_payment_status_guard
before update on public.payroll_runs
for each row execute function private.guard_payroll_payment_status_transition();

revoke execute on function private.guard_payroll_payment_status_transition() from public, anon, authenticated;

-- 2. Closing an issued PO is only safe after every committed line has no
-- outstanding quantity. RECEIVED receipt history remains authoritative and is
-- never deleted or rewritten by this guard. Fully received POs may still close;
-- partially or wholly unreceived POs cannot silently disappear from committed
-- cost while downstream receipt/warehouse work remains incomplete.
create or replace function private.guard_purchase_order_close_obligations()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'ISSUED' and new.status = 'CLOSED' and exists (
    select 1
    from public.purchase_order_lines pol
    where pol.company_id = old.company_id
      and pol.purchase_order_id = old.id
      and pol.quantity > coalesce((
        select sum(prl.received_quantity)
        from public.purchase_order_receipt_lines prl
        join public.purchase_order_receipts pr
          on pr.company_id = prl.company_id
         and pr.id = prl.purchase_order_receipt_id
        where prl.company_id = old.company_id
          and prl.purchase_order_line_id = pol.id
          and pr.purchase_order_id = old.id
          and pr.status = 'RECEIVED'
      ), 0)
  ) then
    raise exception 'Purchase order cannot close while committed quantities remain outstanding; complete or deliberately correct the receipt history first' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists purchase_orders_close_obligation_guard on public.purchase_orders;
create trigger purchase_orders_close_obligation_guard
before update on public.purchase_orders
for each row execute function private.guard_purchase_order_close_obligations();

revoke execute on function private.guard_purchase_order_close_obligations() from public, anon, authenticated;

-- 3. Extend the existing settlement target contract to the canonical
-- subcontract progress claim. The claim's net_certified_amount is the
-- payable basis; approved_gross_amount remains the project Actual Cost basis.
alter table public.financial_transaction_matches
  drop constraint if exists financial_transaction_matches_target_type_check;

alter table public.financial_transaction_matches
  add constraint financial_transaction_matches_target_type_check
  check (target_type in ('EXPENSE', 'INVOICE', 'PAYROLL', 'CLIENT_COLLECTION', 'SUBCONTRACT_CLAIM', 'TRANSFER', 'OTHER'));

create index if not exists financial_transaction_matches_subcontract_claim_idx
  on public.financial_transaction_matches(company_id, target_id, status)
  where target_type = 'SUBCONTRACT_CLAIM';

create or replace function private.subcontract_claim_payable_basis(p_claim_id uuid, p_company_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select round(coalesce(c.net_certified_amount, 0), 2)
  from public.subcontract_progress_claims c
  where c.id = p_claim_id
    and c.company_id = p_company_id
    and c.status = 'APPROVED';
$$;

revoke execute on function private.subcontract_claim_payable_basis(uuid, uuid) from public, anon, authenticated;

-- The existing generic match validator remains authoritative for transaction
-- ceilings and the older target types. This second trigger adds the claim
-- source/lifecycle/currency/target-ceiling contract without weakening it.
create or replace function private.validate_subcontract_claim_settlement_match()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_transaction public.financial_transactions%rowtype;
  v_claim public.subcontract_progress_claims%rowtype;
  v_subcontract public.subcontracts%rowtype;
  v_target_confirmed numeric := 0;
  v_basis numeric := 0;
begin
  if new.target_type <> 'SUBCONTRACT_CLAIM' then
    return new;
  end if;

  if (select auth.uid()) is null then
    raise exception 'Financial actor must be the authenticated user' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.created_by_user_id is distinct from (select auth.uid()) then
    raise exception 'Financial actor must be the authenticated user' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.created_by_user_id is distinct from old.created_by_user_id then
    raise exception 'Financial creation actor is immutable' using errcode = '42501';
  end if;

  select * into v_transaction
  from public.financial_transactions ft
  where ft.id = new.transaction_id
    and ft.company_id = new.company_id;
  if not found then
    raise exception 'Matched transaction is outside the company' using errcode = '42501';
  end if;

  select * into v_claim
  from public.subcontract_progress_claims c
  where c.id = new.target_id
    and c.company_id = new.company_id;
  if not found then
    raise exception 'Matched subcontract claim is outside the company' using errcode = '42501';
  end if;

  select * into v_subcontract
  from public.subcontracts sc
  where sc.id = v_claim.subcontract_id
    and sc.company_id = new.company_id;
  if not found then
    raise exception 'Matched subcontract is outside the company' using errcode = '42501';
  end if;

  if new.status = 'CONFIRMED' then
    if v_transaction.status <> 'POSTED' then
      raise exception 'Only POSTED transactions can be confirmed as subcontract settlement evidence' using errcode = '42501';
    end if;
    if v_transaction.direction <> 'DEBIT' then
      raise exception 'Subcontract claim settlements require a DEBIT transaction' using errcode = '22023';
    end if;
    if v_claim.status <> 'APPROVED' then
      raise exception 'Only APPROVED subcontract claims can receive settlement evidence' using errcode = '42501';
    end if;
    if upper(v_transaction.currency) <> upper(v_subcontract.currency) then
      raise exception 'Settlement currency mismatch: transaction % vs subcontract claim %', v_transaction.currency, v_subcontract.currency using errcode = '22023';
    end if;
    v_basis := coalesce(v_claim.net_certified_amount, 0);
    if v_basis <= 0 then
      raise exception 'Subcontract claim has no positive net certified payable' using errcode = '22023';
    end if;
    select coalesce(sum(m.matched_amount), 0)
      into v_target_confirmed
    from public.financial_transaction_matches m
    where m.company_id = new.company_id
      and m.target_type = 'SUBCONTRACT_CLAIM'
      and m.target_id = new.target_id
      and m.status = 'CONFIRMED'
      and m.id <> new.id;
    if v_target_confirmed + new.matched_amount > v_basis + 0.005 then
      raise exception 'Confirmed matches cannot exceed the subcontract claim net certified payable' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists financial_transaction_matches_subcontract_claim_integrity on public.financial_transaction_matches;
create trigger financial_transaction_matches_subcontract_claim_integrity
before insert or update on public.financial_transaction_matches
for each row execute function private.validate_subcontract_claim_settlement_match();

revoke execute on function private.validate_subcontract_claim_settlement_match() from public, anon, authenticated;

-- 4. Reuse the canonical single-target settlement RPC for subcontract claims.
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
  v_claim public.subcontract_progress_claims%rowtype;
  v_subcontract public.subcontracts%rowtype;
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
  if v_target_type not in ('INVOICE', 'PAYROLL', 'EXPENSE', 'CLIENT_COLLECTION', 'SUBCONTRACT_CLAIM') or p_target_id is null then
    raise exception 'Settlement target must be an invoice, payroll run, expense, client collection, or subcontract claim' using errcode = '22023';
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
  elsif v_target_type in ('INVOICE', 'PAYROLL', 'EXPENSE', 'SUBCONTRACT_CLAIM') and v_transaction.direction <> 'DEBIT' then
    raise exception 'Supplier, payroll, expense, and subcontract settlements require a DEBIT transaction' using errcode = '22023';
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
    if v_target_status not in ('APPROVED', 'PAID') then raise exception 'Only APPROVED or historical PAID payroll runs can be linked to disbursement evidence'; end if;
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
  elsif v_target_type = 'SUBCONTRACT_CLAIM' then
    if not (select private.has_company_permission(p_company_id, 'procurement.approve')) then
      raise exception 'Subcontract claim settlement requires procurement.approve' using errcode = '42501';
    end if;
    select * into v_claim
    from public.subcontract_progress_claims c
    where c.id = p_target_id and c.company_id = p_company_id
    for update;
    if not found then raise exception 'Subcontract claim is outside the selected company or unavailable' using errcode = '42501'; end if;
    select * into v_subcontract
    from public.subcontracts sc
    where sc.id = v_claim.subcontract_id and sc.company_id = p_company_id
    for update;
    if not found then raise exception 'Subcontract is outside the selected company or unavailable' using errcode = '42501'; end if;
    v_target_currency := v_subcontract.currency;
    v_target_status := v_claim.status;
    if v_target_status <> 'APPROVED' then raise exception 'Only APPROVED subcontract claims can be settled'; end if;
    v_target_basis := coalesce(v_claim.net_certified_amount, 0);
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

revoke all on function public.confirm_financial_settlement(uuid, uuid, text, uuid, numeric, uuid, numeric, text, text) from public, anon;
grant execute on function public.confirm_financial_settlement(uuid, uuid, text, uuid, numeric, uuid, numeric, text, text) to authenticated;

-- 5. Batch settlement continues to reuse the single-target authority.
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
    if v_target_type not in ('INVOICE', 'PAYROLL', 'EXPENSE', 'CLIENT_COLLECTION', 'SUBCONTRACT_CLAIM') then
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
      p_company_id, p_transaction_id, v_target_type, v_target_id, v_amount,
      v_match_id, v_confidence, v_notes,
      coalesce(nullif(btrim(p_confirmation_source), ''), 'RECONCILIATION_UI')
    );
    v_results := v_results || jsonb_build_array(to_jsonb(v_match));
  end loop;

  return jsonb_build_object('transaction_id', p_transaction_id, 'allocation_count', v_count, 'matches', v_results);
end;
$$;

revoke all on function public.confirm_financial_settlement_batch(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.confirm_financial_settlement_batch(uuid, uuid, jsonb, text) to authenticated;

-- 6. Reversal remains append-only and uses the same domain permission as
-- certification approval for subcontract claims.
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
  if v_match.status <> 'CONFIRMED' or v_match.target_type not in ('INVOICE', 'PAYROLL', 'EXPENSE', 'CLIENT_COLLECTION', 'SUBCONTRACT_CLAIM') then
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
  elsif v_match.target_type = 'SUBCONTRACT_CLAIM' then
    if not (select private.has_company_permission(p_company_id, 'procurement.approve')) then raise exception 'Subcontract claim settlement reversal requires procurement.approve' using errcode = '42501'; end if;
    perform 1 from public.subcontract_progress_claims c where c.id = v_match.target_id and c.company_id = p_company_id for update;
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

revoke all on function public.reverse_financial_settlement(uuid, uuid, text) from public, anon;
grant execute on function public.reverse_financial_settlement(uuid, uuid, text) to authenticated;

-- 7. Canonical summary now exposes certified subcontract claims using their
-- net payable basis while preserving project Actual Cost as gross certified
-- work in the separate costing projection.
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
  v_transferred boolean := false;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  v_permission := case v_target_type
    when 'INVOICE' then 'invoices.read'
    when 'PAYROLL' then 'payroll.summary.read'
    when 'EXPENSE' then 'expenses.read'
    when 'CLIENT_COLLECTION' then 'projects.read'
    when 'SUBCONTRACT_CLAIM' then 'procurement.read'
    else null
  end;
  if v_permission is null or not (select private.has_company_permission(p_company_id, v_permission)) then raise exception 'Settlement summary permission denied' using errcode = '42501'; end if;
  v_can_read_cash := (select private.has_company_permission(p_company_id, 'cash.transactions.read'));

  if v_target_type = 'INVOICE' then
    select i.currency, case when i.lifecycle_status = 'VOID' then 'VOID' else i.review_status end, i.due_date,
      case when coalesce(i.current_data ->> 'amountPaid', '') ~ '^[-+]?[0-9]+([.][0-9]+)?$' then (i.current_data ->> 'amountPaid')::numeric else 0 end
      into v_currency, v_lifecycle, v_due_date, v_document_paid
    from public.invoices i where i.id = p_target_id and i.company_id = p_company_id;
    if not found then raise exception 'Invoice unavailable' using errcode = '42501'; end if;
    v_transferred := exists(select 1 from public.expenses e where e.company_id = p_company_id and e.supplier_invoice_id = p_target_id and e.status <> 'VOID');
    if v_transferred then v_lifecycle := 'TRANSFERRED_TO_EXPENSE'; v_basis := 0; else v_basis := private.invoice_cash_payable_basis(p_target_id, p_company_id); end if;
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
    select coalesce(sum(a.amount), 0)::numeric(20,2) into v_basis
    from public.client_collection_allocations a where a.company_id = p_company_id and a.collection_id = p_target_id;
  elsif v_target_type = 'SUBCONTRACT_CLAIM' then
    select sc.currency, c.status, c.net_certified_amount
      into v_currency, v_lifecycle, v_basis
    from public.subcontract_progress_claims c
    join public.subcontracts sc on sc.company_id = c.company_id and sc.id = c.subcontract_id
    where c.id = p_target_id and c.company_id = p_company_id;
    if not found then raise exception 'Subcontract claim unavailable' using errcode = '42501'; end if;
  else
    raise exception 'Unsupported settlement target type' using errcode = '22023';
  end if;

  select coalesce(sum(m.matched_amount) filter (where m.status = 'CONFIRMED'), 0)
    into v_cash_paid
  from public.financial_transaction_matches m
  where m.company_id = p_company_id and m.target_type = v_target_type and m.target_id = p_target_id;
  if v_can_read_cash then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'transactionId', m.transaction_id, 'status', m.status, 'amount', m.matched_amount,
      'confirmedAt', m.confirmed_at, 'confirmedByUserId', m.confirmed_by_user_id,
      'reversedAt', m.reversed_at, 'reversedByUserId', m.reversed_by_user_id, 'reversalReason', m.reversal_reason,
      'confirmationSource', m.confirmation_source, 'accountId', ft.account_id, 'accountName', fa.display_name,
      'accountType', fa.account_type, 'maskedIdentifier', fa.masked_identifier, 'transactionDate', ft.transaction_date,
      'referenceNumber', ft.reference_number, 'description', ft.description, 'currency', ft.currency
    ) order by coalesce(m.confirmed_at, m.created_at) desc), '[]'::jsonb) into v_history
    from public.financial_transaction_matches m
    join public.financial_transactions ft on ft.id = m.transaction_id and ft.company_id = m.company_id
    join public.financial_accounts fa on fa.id = ft.account_id and fa.company_id = ft.company_id
    where m.company_id = p_company_id and m.target_type = v_target_type and m.target_id = p_target_id and m.status in ('CONFIRMED', 'REVERSED');
  end if;
  v_document_paid := least(v_basis, greatest(coalesce(v_document_paid, 0), 0));
  v_cash_paid := least(v_basis, greatest(coalesce(v_cash_paid, 0), 0));
  v_effective := case when v_target_type = 'INVOICE' then greatest(v_document_paid, v_cash_paid) else v_cash_paid end;
  return jsonb_build_object(
    'targetType', v_target_type, 'targetId', p_target_id, 'currency', v_currency, 'lifecycleStatus', v_lifecycle,
    'settlementBasis', round(coalesce(v_basis, 0), 2), 'reconciledCashPaid', round(v_cash_paid, 2),
    'documentReportedPaid', case when v_target_type = 'INVOICE' then round(v_document_paid, 2) else 0 end,
    'effectiveSettled', round(v_effective, 2), 'outstanding', round(greatest(v_basis - v_effective, 0), 2),
    'settlementState', case
      when v_transferred then 'TRANSFERRED_TO_EXPENSE'
      when v_target_type = 'CLIENT_COLLECTION' and v_cash_paid <= 0.005 then 'UNLINKED'
      when v_target_type = 'CLIENT_COLLECTION' and v_cash_paid >= v_basis - 0.005 then 'LINKED'
      when v_target_type = 'CLIENT_COLLECTION' then 'PARTIALLY_LINKED'
      when v_lifecycle = 'VOID' then 'VOID'
      when v_target_type = 'PAYROLL' and v_cash_paid <= 0.005 then 'UNSETTLED'
      when v_target_type = 'PAYROLL' and v_cash_paid >= v_basis - 0.005 then 'SETTLED'
      when v_target_type = 'PAYROLL' then 'PARTIALLY_DISBURSED'
      when v_target_type = 'SUBCONTRACT_CLAIM' and v_cash_paid <= 0.005 then 'UNSETTLED'
      when v_target_type = 'SUBCONTRACT_CLAIM' and v_cash_paid >= v_basis - 0.005 then 'SETTLED'
      when v_target_type = 'SUBCONTRACT_CLAIM' then 'PARTIALLY_PAID'
      when v_effective >= v_basis - 0.005 then 'PAID'
      when v_target_type = 'INVOICE' and v_due_date is not null and v_due_date < current_date and v_effective < v_basis - 0.005 then 'OVERDUE'
      when v_effective > 0.005 then 'PARTIALLY_PAID' else 'UNPAID' end,
    'basisSource', case
      when v_transferred then 'SUPPLIER_EXPENSE'
      when v_target_type = 'CLIENT_COLLECTION' then 'CLIENT_COLLECTION_ALLOCATIONS'
      when v_target_type = 'SUBCONTRACT_CLAIM' then 'NET_CERTIFIED_SUBCONTRACT_CLAIM'
      when v_target_type = 'INVOICE' and private.invoice_cash_payable_basis(p_target_id, p_company_id) <> (select i.grand_total from public.invoices i where i.id = p_target_id) then 'EXPLICIT_NET_PAYABLE'
      when v_target_type = 'PAYROLL' then 'EMPLOYEE_NET_PAY'
      when v_target_type = 'EXPENSE' then 'EXPENSE_AMOUNT'
      else 'GROSS_DOCUMENT_AMOUNT' end,
    'legacyPaidWithoutBankLink', v_target_type = 'PAYROLL' and v_lifecycle = 'PAID' and v_cash_paid <= 0.005,
    'historyRedacted', not v_can_read_cash,
    'collectionTotal', case when v_target_type = 'CLIENT_COLLECTION' then round(v_basis, 2) else null end,
    'linkedAmount', case when v_target_type = 'CLIENT_COLLECTION' then round(v_cash_paid, 2) else null end,
    'remainingUnlinkedAmount', case when v_target_type = 'CLIENT_COLLECTION' then round(greatest(v_basis - v_cash_paid, 0), 2) else null end,
    'linkState', case when v_target_type <> 'CLIENT_COLLECTION' then null when v_cash_paid <= 0.005 then 'UNLINKED' when v_cash_paid >= v_basis - 0.005 then 'LINKED' else 'PARTIALLY_LINKED' end,
    'history', v_history
  );
end;
$$;

revoke all on function public.get_financial_settlement_summary(uuid, text, uuid) from public, anon;
grant execute on function public.get_financial_settlement_summary(uuid, text, uuid) to authenticated;

revoke execute on function private.subcontract_claim_payable_basis(uuid, uuid) from public, anon, authenticated;
