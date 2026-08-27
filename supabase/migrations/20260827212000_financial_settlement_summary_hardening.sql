-- Canonical operational invoice settlement is conservative when historical
-- document/manual payment evidence may describe the same payment later linked
-- to a bank transaction: use the greater evidenced amount, never blindly add.

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
  v_effective numeric := 0;
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

  v_document_paid := least(v_basis, greatest(coalesce(v_document_paid,0),0));
  v_cash_paid := least(v_basis, greatest(coalesce(v_cash_paid,0),0));
  v_effective := case when p_target_type='INVOICE' then greatest(v_document_paid,v_cash_paid) else v_cash_paid end;

  return jsonb_build_object(
    'targetType',p_target_type,'targetId',p_target_id,'currency',v_currency,'lifecycleStatus',v_lifecycle,
    'settlementBasis',round(coalesce(v_basis,0),2),'reconciledCashPaid',round(v_cash_paid,2),
    'documentReportedPaid',case when p_target_type='INVOICE' then round(v_document_paid,2) else 0 end,
    'effectiveSettled',round(v_effective,2),
    'outstanding',round(greatest(v_basis-v_effective,0),2),
    'settlementState',case
      when p_target_type='PAYROLL' and v_cash_paid<=0.005 then 'UNSETTLED'
      when p_target_type='PAYROLL' and v_cash_paid>=v_basis-0.005 then 'SETTLED'
      when p_target_type='PAYROLL' then 'PARTIALLY_DISBURSED'
      when v_effective>=v_basis-0.005 then 'PAID'
      when v_effective>0.005 then 'PARTIALLY_PAID'
      else 'UNPAID' end,
    'basisSource',case when p_target_type='INVOICE' and private.invoice_cash_payable_basis(p_target_id,p_company_id) <> (select i.grand_total from public.invoices i where i.id=p_target_id) then 'EXPLICIT_NET_PAYABLE' when p_target_type='PAYROLL' then 'EMPLOYEE_NET_PAY' when p_target_type='EXPENSE' then 'EXPENSE_AMOUNT' else 'GROSS_DOCUMENT_AMOUNT' end,
    'legacyPaidWithoutBankLink',p_target_type='PAYROLL' and v_lifecycle='PAID' and v_cash_paid<=0.005,
    'history',v_history
  );
end;
$$;

revoke all on function public.get_financial_settlement_summary(uuid,text,uuid) from public, anon;
grant execute on function public.get_financial_settlement_summary(uuid,text,uuid) to authenticated;
