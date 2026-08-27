-- Tighten invoice cash-settlement basis after auditing legacy/demo extraction data.
-- A nested PH netAmountPayable may represent a remaining balance in historical
-- documents, so it is trusted as the original cash obligation only when an
-- explicit withholding amount establishes the net-payable semantics.

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
  v_top_net_text text;
  v_nested_net_text text;
  v_withholding_text text;
  v_top_net numeric;
  v_nested_net numeric;
  v_withholding numeric;
begin
  select i.grand_total, i.current_data into v_total, v_current
  from public.invoices i
  where i.id = p_invoice_id and i.company_id = p_company_id;
  if not found then return null; end if;

  v_top_net_text := v_current->>'netAmountPayable';
  if v_top_net_text is not null and v_top_net_text ~ '^[-+]?[0-9]+([.][0-9]+)?$' then
    v_top_net := v_top_net_text::numeric;
  end if;
  if v_top_net is not null and v_top_net > 0 then return round(v_top_net, 2); end if;

  v_nested_net_text := v_current->'philippineTaxDetails'->>'netAmountPayable';
  v_withholding_text := coalesce(v_current->>'withholdingTaxAmount', v_current->'philippineTaxDetails'->>'withholdingTaxAmount');
  if v_nested_net_text is not null and v_nested_net_text ~ '^[-+]?[0-9]+([.][0-9]+)?$' then
    v_nested_net := v_nested_net_text::numeric;
  end if;
  if v_withholding_text is not null and v_withholding_text ~ '^[-+]?[0-9]+([.][0-9]+)?$' then
    v_withholding := v_withholding_text::numeric;
  end if;
  if v_nested_net is not null and v_nested_net > 0 and v_withholding is not null and v_withholding > 0 then
    return round(v_nested_net, 2);
  end if;

  return round(coalesce(v_total, 0), 2);
end;
$$;

revoke execute on function private.invoice_cash_payable_basis(uuid,uuid) from public, anon, authenticated;
