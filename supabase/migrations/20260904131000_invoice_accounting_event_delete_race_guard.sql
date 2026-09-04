-- Serialize polymorphic invoice accounting-event writes with guarded invoice deletion.
-- project_accounting_events intentionally has no invoice FK, so invoice-targeted
-- events must lock the invoice parent explicitly to avoid racing DELETE_UNUSED.

create or replace function private.lock_invoice_target_for_project_accounting_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if upper(btrim(coalesce(new.entity_type, ''))) = 'INVOICE' and new.entity_id is not null then
    perform 1
    from public.invoices i
    where i.id = new.entity_id
      and i.company_id = new.company_id
    for key share;

    if not found then
      raise exception 'Invoice accounting event target does not exist in the company'
        using errcode = '23503';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.lock_invoice_target_for_project_accounting_event() from public, anon, authenticated;

drop trigger if exists project_accounting_events_invoice_target_lock on public.project_accounting_events;
create trigger project_accounting_events_invoice_target_lock
before insert or update of company_id, entity_type, entity_id on public.project_accounting_events
for each row
execute function private.lock_invoice_target_for_project_accounting_event();
