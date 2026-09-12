-- Supplier-payables settlement consistency.
--
-- Verification intentionally creates the canonical supplier Expense in DRAFT.
-- That state is not the same as a generic direct DRAFT Expense: the verified
-- supplier relationship is already a payable obligation. Keep the exception
-- narrow, company-bound, and inside the existing settlement RPC.

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
  v_expense public.expenses%rowtype;
  v_match public.financial_transaction_matches%rowtype;
  v_existing public.financial_transaction_matches%rowtype;
  v_supplier_invoice_id uuid;
  v_supplier_invoice_review_status text;
  v_supplier_invoice_lifecycle text;
  v_supplier_draft_eligible boolean := false;
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
    select i.currency,
      case when i.lifecycle_status = 'VOID' then 'VOID' else i.review_status end
      into v_target_currency, v_target_status
    from public.invoices i
    where i.id = p_target_id and i.company_id = p_company_id
    for update;
    if not found then raise exception 'Invoice is outside the selected company or unavailable' using errcode = '42501'; end if;
    if v_target_status <> 'VERIFIED' then raise exception 'Only active VERIFIED supplier invoices can be settled' using errcode = '42501'; end if;
    if exists (
      select 1 from public.expenses e
      where e.company_id = p_company_id
        and e.supplier_invoice_id = p_target_id
        and e.status <> 'VOID'
    ) then
      raise exception 'This supplier invoice has an active linked Expense; settle the linked Expense instead' using errcode = '42501';
    end if;
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
    select e.* into v_expense
    from public.expenses e
    where e.id = p_target_id and e.company_id = p_company_id
    for update;
    if not found then raise exception 'Expense is outside the selected company or unavailable' using errcode = '42501'; end if;
    v_target_currency := v_expense.currency;
    v_target_status := v_expense.status;
    v_target_basis := v_expense.amount;
    v_supplier_invoice_id := v_expense.supplier_invoice_id;
    if v_supplier_invoice_id is not null then
      select i.review_status, coalesce(i.lifecycle_status, 'ACTIVE')
        into v_supplier_invoice_review_status, v_supplier_invoice_lifecycle
      from public.invoices i
      where i.id = v_supplier_invoice_id and i.company_id = p_company_id
      for update;
      if not found then
        raise exception 'The supplier invoice for this Expense is outside the selected company or unavailable' using errcode = '42501';
      end if;
      if v_supplier_invoice_lifecycle = 'VOID' or v_supplier_invoice_review_status <> 'VERIFIED' then
        if v_target_status = 'DRAFT' then
          raise exception 'Only a DRAFT Expense linked to an active VERIFIED supplier invoice can receive settlement evidence' using errcode = '42501';
        end if;
        raise exception 'Only a supplier-linked Expense with an active VERIFIED supplier invoice can receive settlement evidence' using errcode = '42501';
      end if;
      v_supplier_draft_eligible := v_target_status = 'DRAFT';
    end if;
    if v_target_status not in ('APPROVED', 'PAID') and not v_supplier_draft_eligible then
      raise exception 'Only APPROVED or PAID expenses can be reconciled' using errcode = '42501';
    end if;
    if v_supplier_invoice_id is not null and (
      select count(*) from public.expenses e
      where e.company_id = p_company_id
        and e.supplier_invoice_id = v_supplier_invoice_id
        and e.status <> 'VOID'
    ) > 1 then
      raise exception 'More than one active Expense is linked to this supplier invoice; resolve the financial authority conflict first' using errcode = '42501';
    end if;
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

  if coalesce(v_target_basis, 0) <= 0 then raise exception 'Settlement target has no positive payable amount'; end if;
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
    and m.status = 'CONFIRMED'
    and (
      (m.target_type = v_target_type and m.target_id = p_target_id)
      or (v_target_type = 'EXPENSE' and v_supplier_invoice_id is not null and m.target_type = 'INVOICE' and m.target_id = v_supplier_invoice_id)
    );
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

-- The summary is the read-side counterpart to the guarded target contract.
-- Supplier-linked invoices are presented through their Expense authority, but
-- legacy invoice-target matches remain included so historical evidence is not
-- silently lost. Document-reported payment is evidence only.
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
  v_supplier_invoice_id uuid;
  v_supplier_expense_id uuid;
  v_supplier_invoice_verified boolean := false;
  v_supplier_authority_conflict boolean := false;
  v_business_date date;
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
  select pg_catalog.timezone(coalesce(c.timezone, 'Asia/Manila'), now())::date
    into v_business_date
  from public.companies c
  where c.id = p_company_id;
  v_business_date := coalesce(v_business_date, pg_catalog.timezone('Asia/Manila', now())::date);

  if v_target_type = 'INVOICE' then
    select i.currency,
      case when i.lifecycle_status = 'VOID' then 'VOID' else i.review_status end,
      i.due_date,
      case when coalesce(i.current_data ->> 'amountPaid', '') ~ '^[-+]?[0-9]+([.][0-9]+)?$' then (i.current_data ->> 'amountPaid')::numeric else 0 end,
      i.review_status = 'VERIFIED' and coalesce(i.lifecycle_status, 'ACTIVE') <> 'VOID'
      into v_currency, v_lifecycle, v_due_date, v_document_paid, v_supplier_invoice_verified
    from public.invoices i
    where i.id = p_target_id and i.company_id = p_company_id;
    if not found then raise exception 'Invoice unavailable' using errcode = '42501'; end if;
    select count(*) > 1 into v_supplier_authority_conflict
    from public.expenses e
    where e.company_id = p_company_id
      and e.supplier_invoice_id = p_target_id
      and e.status <> 'VOID';
    select e.id, e.amount, e.status
      into v_supplier_expense_id, v_basis, v_lifecycle
    from public.expenses e
    where e.company_id = p_company_id
      and e.supplier_invoice_id = p_target_id
      and e.status <> 'VOID'
    order by e.created_at asc, e.id asc
    limit 1;
    if found then
      v_supplier_invoice_id := p_target_id;
      v_lifecycle := case when exists (select 1 from public.invoices i where i.id = p_target_id and i.lifecycle_status = 'VOID') then 'VOID' else v_lifecycle end;
    else
      v_basis := private.invoice_cash_payable_basis(p_target_id, p_company_id);
      v_supplier_invoice_verified := v_lifecycle = 'VERIFIED';
    end if;
  elsif v_target_type = 'PAYROLL' then
    select c.default_currency, pr.status into v_currency, v_lifecycle
    from public.payroll_runs pr
    join public.companies c on c.id = pr.company_id
    where pr.id = p_target_id and pr.company_id = p_company_id;
    if not found then raise exception 'Payroll run unavailable' using errcode = '42501'; end if;
    v_basis := private.payroll_net_pay_basis(p_target_id, p_company_id);
  elsif v_target_type = 'EXPENSE' then
    select e.currency, e.status, e.amount, e.supplier_invoice_id
      into v_currency, v_lifecycle, v_basis, v_supplier_invoice_id
    from public.expenses e
    where e.id = p_target_id and e.company_id = p_company_id;
    if not found then raise exception 'Expense unavailable' using errcode = '42501'; end if;
    if v_supplier_invoice_id is not null then
      select i.due_date,
        i.review_status = 'VERIFIED' and coalesce(i.lifecycle_status, 'ACTIVE') <> 'VOID',
        case when coalesce(i.current_data ->> 'amountPaid', '') ~ '^[-+]?[0-9]+([.][0-9]+)?$' then (i.current_data ->> 'amountPaid')::numeric else 0 end
        into v_due_date, v_supplier_invoice_verified, v_document_paid
      from public.invoices i
      where i.id = v_supplier_invoice_id and i.company_id = p_company_id;
      if found then
        v_supplier_expense_id := p_target_id;
        select count(*) > 1 into v_supplier_authority_conflict
        from public.expenses e
        where e.company_id = p_company_id
          and e.supplier_invoice_id = v_supplier_invoice_id
          and e.status <> 'VOID';
      end if;
    end if;
  elsif v_target_type = 'CLIENT_COLLECTION' then
    select c.currency, c.status into v_currency, v_lifecycle
    from public.client_collections c
    where c.id = p_target_id and c.company_id = p_company_id;
    if not found then raise exception 'Client collection unavailable' using errcode = '42501'; end if;
    select coalesce(sum(a.amount), 0)::numeric(20,2) into v_basis
    from public.client_collection_allocations a
    where a.company_id = p_company_id and a.collection_id = p_target_id;
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
  where m.company_id = p_company_id
    and (
      (m.target_type = v_target_type and m.target_id = p_target_id)
      or (v_target_type = 'INVOICE' and v_supplier_expense_id is not null and m.target_type = 'EXPENSE' and m.target_id = v_supplier_expense_id)
      or (v_target_type = 'EXPENSE' and v_supplier_invoice_id is not null and m.target_type = 'INVOICE' and m.target_id = v_supplier_invoice_id)
    );
  if v_can_read_cash then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'transactionId', m.transaction_id, 'status', m.status, 'amount', m.matched_amount,
      'confirmedAt', m.confirmed_at, 'confirmedByUserId', m.confirmed_by_user_id,
      'reversedAt', m.reversed_at, 'reversedByUserId', m.reversed_by_user_id, 'reversalReason', m.reversal_reason,
      'confirmationSource', m.confirmation_source, 'accountId', ft.account_id, 'accountName', fa.display_name,
      'accountType', fa.account_type, 'maskedIdentifier', fa.masked_identifier, 'transactionDate', ft.transaction_date,
      'referenceNumber', ft.reference_number, 'description', ft.description, 'currency', ft.currency,
      'targetType', m.target_type, 'targetId', m.target_id
    ) order by coalesce(m.confirmed_at, m.created_at) desc), '[]'::jsonb) into v_history
    from public.financial_transaction_matches m
    join public.financial_transactions ft on ft.id = m.transaction_id and ft.company_id = m.company_id
    join public.financial_accounts fa on fa.id = ft.account_id and fa.company_id = ft.company_id
    where m.company_id = p_company_id
      and m.status in ('CONFIRMED', 'REVERSED')
      and (
        (m.target_type = v_target_type and m.target_id = p_target_id)
        or (v_target_type = 'INVOICE' and v_supplier_expense_id is not null and m.target_type = 'EXPENSE' and m.target_id = v_supplier_expense_id)
        or (v_target_type = 'EXPENSE' and v_supplier_invoice_id is not null and m.target_type = 'INVOICE' and m.target_id = v_supplier_invoice_id)
      );
  end if;

  v_document_paid := least(coalesce(v_basis, 0), greatest(coalesce(v_document_paid, 0), 0));
  v_cash_paid := least(coalesce(v_basis, 0), greatest(coalesce(v_cash_paid, 0), 0));
  -- An extracted Amount Paid is evidence only. Confirmed cash is the sole
  -- amount that reduces the operational supplier payable.
  v_effective := v_cash_paid;

  return jsonb_build_object(
    'targetType', v_target_type, 'targetId', p_target_id, 'currency', v_currency, 'lifecycleStatus', v_lifecycle,
    'settlementBasis', round(coalesce(v_basis, 0), 2), 'reconciledCashPaid', round(v_cash_paid, 2),
    'documentReportedPaid', case when v_target_type = 'INVOICE' or v_supplier_invoice_id is not null then round(v_document_paid, 2) else 0 end,
    'effectiveSettled', round(v_effective, 2), 'outstanding', round(greatest(coalesce(v_basis, 0) - v_effective, 0), 2),
    'authorityConflict', v_supplier_authority_conflict,
    'settlementState', case
      when v_lifecycle = 'VOID' then 'VOID'
      when v_supplier_authority_conflict then 'UNPAID'
      when v_target_type = 'INVOICE' and not v_supplier_invoice_verified then 'UNPAID'
      when v_target_type = 'EXPENSE' and v_supplier_invoice_id is not null and not v_supplier_invoice_verified then 'UNPAID'
      when v_target_type = 'CLIENT_COLLECTION' and v_cash_paid <= 0.005 then 'UNLINKED'
      when v_target_type = 'CLIENT_COLLECTION' and v_cash_paid >= v_basis - 0.005 then 'LINKED'
      when v_target_type = 'CLIENT_COLLECTION' then 'PARTIALLY_LINKED'
      when v_target_type = 'PAYROLL' and v_cash_paid <= 0.005 then 'UNSETTLED'
      when v_target_type = 'PAYROLL' and v_cash_paid >= v_basis - 0.005 then 'SETTLED'
      when v_target_type = 'PAYROLL' then 'PARTIALLY_DISBURSED'
      when v_target_type = 'SUBCONTRACT_CLAIM' and v_cash_paid <= 0.005 then 'UNSETTLED'
      when v_target_type = 'SUBCONTRACT_CLAIM' and v_cash_paid >= v_basis - 0.005 then 'SETTLED'
      when v_target_type = 'SUBCONTRACT_CLAIM' then 'PARTIALLY_PAID'
      when v_effective >= v_basis - 0.005 and v_basis > 0.005 then 'PAID'
      when v_supplier_invoice_verified and v_due_date is not null and v_due_date < v_business_date and v_effective < v_basis - 0.005 then 'OVERDUE'
      when v_effective > 0.005 then 'PARTIALLY_PAID'
      else 'UNPAID' end,
    'basisSource', case
      when v_supplier_expense_id is not null and v_target_type in ('INVOICE', 'EXPENSE') then 'EXPENSE_AMOUNT'
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
