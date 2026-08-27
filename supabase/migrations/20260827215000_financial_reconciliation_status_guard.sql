-- Prevent browser-side transaction saves from overwriting authoritative
-- reconciliation status after settlement confirmation. Internal transfers and
-- explicit IGNORED state retain their existing dedicated semantics.

create or replace function private.derive_financial_reconciliation_status()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_allocated numeric := 0;
begin
  if new.transfer_group_id is not null or new.reconciliation_status = 'IGNORED' then
    return new;
  end if;

  if new.reconciliation_status in ('UNMATCHED','PARTIAL','MATCHED') then
    select coalesce(sum(m.matched_amount),0)
      into v_allocated
    from public.financial_transaction_matches m
    where m.company_id = new.company_id
      and m.transaction_id = new.id
      and m.status = 'CONFIRMED';

    new.reconciliation_status := case
      when v_allocated <= 0.005 then 'UNMATCHED'
      when v_allocated >= new.amount - 0.005 then 'MATCHED'
      else 'PARTIAL'
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists financial_transactions_reconciliation_status_guard on public.financial_transactions;
create trigger financial_transactions_reconciliation_status_guard
before update of reconciliation_status, amount, transfer_group_id
on public.financial_transactions
for each row execute function private.derive_financial_reconciliation_status();

revoke execute on function private.derive_financial_reconciliation_status() from public, anon, authenticated;
