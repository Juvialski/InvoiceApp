-- Engoryx Financial Settlement Integration
-- Cash settlement is evidence of payment/disbursement. It is deliberately
-- separate from invoice/project cost and payroll/project labor cost semantics.

alter table public.financial_transaction_matches
  add column if not exists reversed_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists reversed_at timestamptz,
  add column if not exists reversal_reason text,
  add column if not exists confirmation_source text not null default 'RECONCILIATION_UI';

alter table public.financial_transaction_matches
  drop constraint if exists financial_transaction_matches_status_check;
alter table public.financial_transaction_matches
  add constraint financial_transaction_matches_status_check
  check (status in ('SUGGESTED','CONFIRMED','REJECTED','REVERSED'));

alter table public.financial_transaction_matches
  drop constraint if exists financial_transaction_matches_reversal_check;
alter table public.financial_transaction_matches
  add constraint financial_transaction_matches_reversal_check check (
    (status = 'REVERSED' and reversed_by_user_id is not null and reversed_at is not null)
    or (status <> 'REVERSED' and reversed_by_user_id is null and reversed_at is null)
  );

create index if not exists financial_transaction_matches_active_target_idx
  on public.financial_transaction_matches(company_id, target_type, target_id, status)
  where status = 'CONFIRMED';
create index if not exists financial_transaction_matches_active_transaction_idx
  on public.financial_transaction_matches(company_id, transaction_id, status)
  where status = 'CONFIRMED';

-- Keep the audit allowlist a strict superset of every event through Phase 1C.
alter table public.company_audit_events drop constraint if exists company_audit_events_event_type_check;
alter table public.company_audit_events add constraint company_audit_events_event_type_check check (event_type in (
  'COMPANY_CREATED', 'COMPANY_UPDATED', 'COMPANY_SUSPENDED', 'COMPANY_ARCHIVED', 'COMPANY_REACTIVATED',
  'USER_INVITED', 'INVITE_REVOKED', 'INVITE_ACCEPTED',
  'MEMBER_ROLE_CHANGED', 'MEMBER_SUSPENDED', 'MEMBER_REACTIVATED', 'MEMBER_REVOKED',
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
  'ENGINEERING_DAILY_SITE_LOG_FINALIZED', 'ENGINEERING_DAILY_SITE_LOG_VOIDED'
));

create or replace function private.invoice_cash_payable_basis(p_invoice_id uuid, p_company_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_total numeric;
  v_current jsonb;
  v_net_text text;
  v_net numeric;
begin
  select i.grand_total, i.current_data into v_total, v_current
  from public.invoices i
  where i.id = p_invoice_id and i.company_id = p_company_id;
  if not found then return null; end if;
  v_net_text := coalesce(v_current->>'netAmountPayable', v_current->'philippineTaxDetails'->>'netAmountPayable');
  if v_net_text is not null and v_net_text ~ '^[-+]?[0-9]+([.][0-9]+)?$' then
    v_net := v_net_text::numeric;
  end if;
  if v_net is not null and v_net > 0 then return round(v_net, 2); end if;
  return round(coalesce(v_total, 0), 2);
end;
$$;

create or replace function private.payroll_net_pay_basis(p_run_id uuid, p_company_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select round(coalesce(sum(pe.net_pay), 0), 2)
  from public.payroll_entries pe
  join public.payroll_runs pr on pr.id = pe.payroll_run_id
  where pr.id = p_run_id and pr.company_id = p_company_id and pe.company_id = p_company_id;
$$;

create or replace function private.refresh_financial_transaction_reconciliation(p_transaction_id uuid, p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount numeric;
  v_allocated numeric;
begin
  select ft.amount into v_amount from public.financial_transactions ft
  where ft.id = p_transaction_id and ft.company_id = p_company_id for update;
  if not found then return; end if;
  select coalesce(sum(m.matched_amount),0) into v_allocated
  from public.financial_transaction_matches m
  where m.company_id = p_company_id and m.transaction_id = p_transaction_id and m.status = 'CONFIRMED';
  update public.financial_transactions
  set reconciliation_status = case
    when v_allocated <= 0.005 then 'UNMATCHED'
    when v_allocated >= v_amount - 0.005 then 'MATCHED'
    else 'PARTIAL'
  end,
  updated_at = now()
  where id = p_transaction_id and company_id = p_company_id;
end;
$$;

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
  v_match public.financial_transaction_matches%rowtype;
  v_tx_allocated numeric := 0;
  v_target_allocated numeric := 0;
  v_target_basis numeric := 0;
  v_target_currency text;
  v_target_status text;
  v_existing public.financial_transaction_matches%rowtype;
  v_id uuid := coalesce(p_match_id, gen_random_uuid());
begin
  if v_actor is null or not (select private.has_company_permission(p_company_id, 'cash.reconcile')) then
    raise exception 'Financial settlement permission denied' using errcode = '42501';
  end if;
  if p_target_type not in ('INVOICE','PAYROLL','EXPENSE') or p_target_id is null then
    raise exception 'Settlement target must be an invoice, payroll run, or expense' using errcode = '22023';
  end if;
  if p_matched_amount is null or p_matched_amount <= 0 then
    raise exception 'Settlement amount must be positive' using errcode = '22023';
  end if;

  select * into v_transaction from public.financial_transactions ft
  where ft.id = p_transaction_id and ft.company_id = p_company_id for update;
  if not found then raise exception 'Financial transaction is outside the selected company or unavailable' using errcode = '42501'; end if;
  if v_transaction.status <> 'POSTED' then raise exception 'Only POSTED transactions can settle a payable'; end if;
  if v_transaction.direction <> 'DEBIT' then raise exception 'Supplier invoice and payroll settlements require a DEBIT transaction'; end if;

  select * into v_existing from public.financial_transaction_matches m where m.id = v_id;
  if found then
    if v_existing.company_id = p_company_id
       and v_existing.transaction_id = p_transaction_id
       and v_existing.target_type = p_target_type
       and v_existing.target_id = p_target_id
       and abs(v_existing.matched_amount - round(p_matched_amount,2)) <= 0.005
       and v_existing.status = 'CONFIRMED' then
      return v_existing;
    end if;
    raise exception 'Settlement request id is already used with different terms' using errcode = '23505';
  end if;

  if p_target_type = 'INVOICE' then
    if not (select private.has_company_permission(p_company_id, 'invoices.manage')) then
      raise exception 'Invoice settlement requires invoices.manage' using errcode = '42501';
    end if;
    select i.currency, i.review_status into v_target_currency, v_target_status
    from public.invoices i where i.id = p_target_id and i.company_id = p_company_id for update;
    if not found then raise exception 'Invoice is outside the selected company or unavailable' using errcode = '42501'; end if;
    if v_target_status <> 'VERIFIED' then raise exception 'Only VERIFIED supplier invoices can be settled'; end if;
    v_target_basis := private.invoice_cash_payable_basis(p_target_id, p_company_id);
  elsif p_target_type = 'PAYROLL' then
    if not (select private.has_company_permission(p_company_id, 'payroll.approve')) then
      raise exception 'Payroll settlement requires payroll.approve' using errcode = '42501';
    end if;
    select pr.status, c.default_currency into v_target_status, v_target_currency
    from public.payroll_runs pr join public.companies c on c.id = pr.company_id
    where pr.id = p_target_id and pr.company_id = p_company_id for update of pr;
    if not found then raise exception 'Payroll run is outside the selected company or unavailable' using errcode = '42501'; end if;
    if v_target_status not in ('APPROVED','PAID') then raise exception 'Only APPROVED or legacy PAID payroll runs can be linked to disbursement evidence'; end if;
    v_target_basis := private.payroll_net_pay_basis(p_target_id, p_company_id);
  else
    if not (select private.has_company_permission(p_company_id, 'expenses.manage')) then
      raise exception 'Expense settlement requires expenses.manage' using errcode = '42501';
    end if;
    select e.currency, e.status, e.amount into v_target_currency, v_target_status, v_target_basis
    from public.expenses e where e.id = p_target_id and e.company_id = p_company_id for update;
    if not found then raise exception 'Expense is outside the selected company or unavailable' using errcode = '42501'; end if;
    if v_target_status not in ('APPROVED','PAID') then raise exception 'Only APPROVED or PAID expenses can be reconciled'; end if;
  end if;

  if v_target_basis <= 0 then raise exception 'Settlement target has no positive payable amount'; end if;
  if upper(coalesce(v_target_currency,'')) <> upper(v_transaction.currency) then
    raise exception 'Settlement currency mismatch: transaction % vs target %', v_transaction.currency, coalesce(v_target_currency,'UNKNOWN') using errcode = '22023';
  end if;

  select coalesce(sum(m.matched_amount),0) into v_tx_allocated
  from public.financial_transaction_matches m
  where m.company_id = p_company_id and m.transaction_id = p_transaction_id and m.status = 'CONFIRMED';
  if v_tx_allocated + round(p_matched_amount,2) > v_transaction.amount + 0.005 then
    raise exception 'Settlement exceeds remaining transaction amount';
  end if;

  select coalesce(sum(m.matched_amount),0) into v_target_allocated
  from public.financial_transaction_matches m
  where m.company_id = p_company_id and m.target_type = p_target_type and m.target_id = p_target_id and m.status = 'CONFIRMED';
  if v_target_allocated + round(p_matched_amount,2) > v_target_basis + 0.005 then
    raise exception 'Settlement exceeds remaining target obligation';
  end if;

  insert into public.financial_transaction_matches(
    id, company_id, created_by_user_id, transaction_id, target_type, target_id,
    matched_amount, status, confidence, confirmed_by_user_id, confirmed_at,
    notes, confirmation_source
  ) values (
    v_id, p_company_id, v_actor, p_transaction_id, p_target_type, p_target_id,
    round(p_matched_amount,2), 'CONFIRMED', p_confidence, v_actor, now(),
    nullif(btrim(coalesce(p_notes,'')),''), coalesce(nullif(btrim(p_confirmation_source),''),'RECONCILIATION_UI')
  ) returning * into v_match;

  perform private.refresh_financial_transaction_reconciliation(p_transaction_id, p_company_id);

  insert into public.company_audit_events(company_id, actor_user_id, event_type, target_type, target_id, metadata)
  values (p_company_id, v_actor, 'CASH_SETTLEMENT_CONFIRMED', p_target_type, p_target_id,
    jsonb_build_object('transaction_id',p_transaction_id,'match_id',v_match.id,'matched_amount',v_match.matched_amount,'confirmation_source',v_match.confirmation_source));
  return v_match;
end;
$$;

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
  if length(btrim(coalesce(p_reason,''))) < 3 then raise exception 'A reversal reason is required' using errcode = '22023'; end if;

  select * into v_match from public.financial_transaction_matches m
  where m.id = p_match_id and m.company_id = p_company_id for update;
  if not found then raise exception 'Settlement is outside the selected company or unavailable' using errcode = '42501'; end if;
  if v_match.status = 'REVERSED' then return v_match; end if;
  if v_match.status <> 'CONFIRMED' or v_match.target_type not in ('INVOICE','PAYROLL','EXPENSE') then
    raise exception 'Only confirmed financial settlements can be reversed';
  end if;

  perform 1 from public.financial_transactions ft where ft.id = v_match.transaction_id and ft.company_id = p_company_id for update;
  if v_match.target_type = 'INVOICE' then
    if not (select private.has_company_permission(p_company_id, 'invoices.manage')) then raise exception 'Invoice settlement reversal requires invoices.manage' using errcode='42501'; end if;
    perform 1 from public.invoices i where i.id = v_match.target_id and i.company_id = p_company_id for update;
  elsif v_match.target_type = 'PAYROLL' then
    if not (select private.has_company_permission(p_company_id, 'payroll.approve')) then raise exception 'Payroll settlement reversal requires payroll.approve' using errcode='42501'; end if;
    perform 1 from public.payroll_runs pr where pr.id = v_match.target_id and pr.company_id = p_company_id for update;
  else
    if not (select private.has_company_permission(p_company_id, 'expenses.manage')) then raise exception 'Expense settlement reversal requires expenses.manage' using errcode='42501'; end if;
    perform 1 from public.expenses e where e.id = v_match.target_id and e.company_id = p_company_id for update;
  end if;

  update public.financial_transaction_matches
  set status='REVERSED', reversed_by_user_id=v_actor, reversed_at=now(), reversal_reason=btrim(p_reason), updated_at=now()
  where id=p_match_id and company_id=p_company_id returning * into v_result;
  perform private.refresh_financial_transaction_reconciliation(v_match.transaction_id, p_company_id);
  insert into public.company_audit_events(company_id, actor_user_id, event_type, target_type, target_id, metadata)
  values (p_company_id, v_actor, 'CASH_SETTLEMENT_REVERSED', v_match.target_type, v_match.target_id,
    jsonb_build_object('transaction_id',v_match.transaction_id,'match_id',v_match.id,'matched_amount',v_match.matched_amount,'reason',btrim(p_reason)));
  return v_result;
end;
$$;

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
  v_document_paid numeric := 0;
  v_cash_paid numeric := 0;
  v_history jsonb := '[]'::jsonb;
  v_permission text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='42501'; end if;
  v_permission := case p_target_type when 'INVOICE' then 'invoices.read' when 'PAYROLL' then 'payroll.summary.read' when 'EXPENSE' then 'expenses.read' else null end;
  if v_permission is null or not (select private.has_company_permission(p_company_id, v_permission)) then raise exception 'Settlement summary permission denied' using errcode='42501'; end if;

  if p_target_type='INVOICE' then
    select i.currency, i.review_status,
      case when coalesce(i.current_data->>'amountPaid','') ~ '^[-+]?[0-9]+([.][0-9]+)?$' then (i.current_data->>'amountPaid')::numeric else 0 end
      into v_currency,v_lifecycle,v_document_paid
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

  select coalesce(sum(m.matched_amount) filter (where m.status='CONFIRMED'),0),
    coalesce(jsonb_agg(jsonb_build_object(
      'id',m.id,'transactionId',m.transaction_id,'status',m.status,'amount',m.matched_amount,
      'confirmedAt',m.confirmed_at,'confirmedByUserId',m.confirmed_by_user_id,
      'reversedAt',m.reversed_at,'reversedByUserId',m.reversed_by_user_id,'reversalReason',m.reversal_reason,
      'confirmationSource',m.confirmation_source,'accountId',ft.account_id,'accountName',fa.display_name,
      'accountType',fa.account_type,'maskedIdentifier',fa.masked_identifier,'transactionDate',ft.transaction_date,
      'referenceNumber',ft.reference_number,'description',ft.description,'currency',ft.currency
    ) order by coalesce(m.confirmed_at,m.created_at) desc),'[]'::jsonb)
    into v_cash_paid,v_history
  from public.financial_transaction_matches m
  join public.financial_transactions ft on ft.id=m.transaction_id and ft.company_id=m.company_id
  join public.financial_accounts fa on fa.id=ft.account_id and fa.company_id=ft.company_id
  where m.company_id=p_company_id and m.target_type=p_target_type and m.target_id=p_target_id and m.status in ('CONFIRMED','REVERSED');

  return jsonb_build_object(
    'targetType',p_target_type,'targetId',p_target_id,'currency',v_currency,'lifecycleStatus',v_lifecycle,
    'settlementBasis',round(coalesce(v_basis,0),2),'reconciledCashPaid',round(coalesce(v_cash_paid,0),2),
    'documentReportedPaid',case when p_target_type='INVOICE' then round(greatest(coalesce(v_document_paid,0),0),2) else 0 end,
    'effectiveSettled',round(case when coalesce(v_cash_paid,0)>0 then least(v_basis,v_cash_paid) else least(v_basis,greatest(coalesce(v_document_paid,0),0)) end,2),
    'outstanding',round(greatest(v_basis-case when coalesce(v_cash_paid,0)>0 then least(v_basis,v_cash_paid) else least(v_basis,greatest(coalesce(v_document_paid,0),0)) end,0),2),
    'settlementState',case
      when p_target_type='PAYROLL' and coalesce(v_cash_paid,0)<=0.005 then 'UNSETTLED'
      when p_target_type='PAYROLL' and coalesce(v_cash_paid,0)>=v_basis-0.005 then 'SETTLED'
      when p_target_type='PAYROLL' then 'PARTIALLY_DISBURSED'
      when (case when coalesce(v_cash_paid,0)>0 then least(v_basis,v_cash_paid) else least(v_basis,greatest(coalesce(v_document_paid,0),0)) end)>=v_basis-0.005 then 'PAID'
      when (case when coalesce(v_cash_paid,0)>0 then v_cash_paid else greatest(coalesce(v_document_paid,0),0) end)>0.005 then 'PARTIALLY_PAID'
      else 'UNPAID' end,
    'basisSource',case when p_target_type='INVOICE' and private.invoice_cash_payable_basis(p_target_id,p_company_id) <> (select i.grand_total from public.invoices i where i.id=p_target_id) then 'EXPLICIT_NET_PAYABLE' when p_target_type='PAYROLL' then 'EMPLOYEE_NET_PAY' else 'GROSS_DOCUMENT_AMOUNT' end,
    'legacyPaidWithoutBankLink',p_target_type='PAYROLL' and v_lifecycle='PAID' and coalesce(v_cash_paid,0)<=0.005,
    'history',v_history
  );
end;
$$;

-- Confirmed settlement state is no longer writable directly by the browser.
drop policy if exists financial_transaction_matches_company_insert on public.financial_transaction_matches;
drop policy if exists financial_transaction_matches_company_update on public.financial_transaction_matches;
revoke insert, update, delete on table public.financial_transaction_matches from authenticated;
grant select on table public.financial_transaction_matches to authenticated;

revoke all on function public.confirm_financial_settlement(uuid,uuid,text,uuid,numeric,uuid,numeric,text,text) from public, anon;
revoke all on function public.reverse_financial_settlement(uuid,uuid,text) from public, anon;
revoke all on function public.get_financial_settlement_summary(uuid,text,uuid) from public, anon;
grant execute on function public.confirm_financial_settlement(uuid,uuid,text,uuid,numeric,uuid,numeric,text,text) to authenticated;
grant execute on function public.reverse_financial_settlement(uuid,uuid,text) to authenticated;
grant execute on function public.get_financial_settlement_summary(uuid,text,uuid) to authenticated;

revoke execute on function private.invoice_cash_payable_basis(uuid,uuid) from public, anon, authenticated;
revoke execute on function private.payroll_net_pay_basis(uuid,uuid) from public, anon, authenticated;
revoke execute on function private.refresh_financial_transaction_reconciliation(uuid,uuid) from public, anon, authenticated;
