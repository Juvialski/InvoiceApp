-- Atomic multi-target financial settlement confirmation for reviewed split allocations.
-- Reuses confirm_financial_settlement so every row receives the same tenancy,
-- RBAC, lifecycle, direction, currency, target-overage, transaction-overage,
-- provenance, audit, and idempotency checks as a single settlement.

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

  -- Lock the transaction once before iterating. Each nested single-settlement
  -- call locks it again reentrantly and locks its own target. Because this
  -- function is one PostgreSQL statement, any later failure rolls back every
  -- earlier insert in the batch.
  perform 1
  from public.financial_transactions ft
  where ft.id = p_transaction_id and ft.company_id = p_company_id
  for update;
  if not found then
    raise exception 'Financial transaction is outside the selected company or unavailable' using errcode = '42501';
  end if;

  for v_item in select value from jsonb_array_elements(p_allocations)
  loop
    v_target_type := upper(coalesce(v_item->>'target_type', ''));
    if v_target_type not in ('INVOICE', 'PAYROLL', 'EXPENSE') then
      raise exception 'Unsupported settlement target type in batch' using errcode = '22023';
    end if;
    begin
      v_target_id := (v_item->>'target_id')::uuid;
      v_match_id := coalesce(nullif(v_item->>'match_id', '')::uuid, gen_random_uuid());
      v_amount := (v_item->>'matched_amount')::numeric;
      v_confidence := case when nullif(v_item->>'confidence', '') is null then null else (v_item->>'confidence')::numeric end;
    exception when others then
      raise exception 'Settlement batch contains malformed identifiers or amounts' using errcode = '22023';
    end;
    v_notes := nullif(btrim(coalesce(v_item->>'notes', '')), '');

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

revoke all on function public.confirm_financial_settlement_batch(uuid,uuid,jsonb,text) from public, anon;
grant execute on function public.confirm_financial_settlement_batch(uuid,uuid,jsonb,text) to authenticated;
