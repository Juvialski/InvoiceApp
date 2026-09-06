-- HydroQualiSense R4 review hardening.
--
-- 1. FX snapshot visibility follows the source domain instead of allowing any
--    one broad read permission to reveal every FX source row.
-- 2. FX confirmation requires both company-settings management and read access
--    to the requested financial source.
-- 3. A linked supplier Invoice and its authoritative Expense share one frozen
--    conversion rate. Confirming either side creates the corresponding immutable
--    alias snapshot in the same transaction, so supplier-tax/reporting views do
--    not require a second manual FX confirmation for the same economic event.

-- Preserve the original R4 implementation as a private primitive. The public
-- wrapper below adds source-scoped authorization and linked-source synchronization
-- without duplicating the original source validation / immutable insert logic.
alter function public.upsert_financial_fx_snapshot(text, uuid, numeric, date, text, text)
  set schema private;
alter function private.upsert_financial_fx_snapshot(text, uuid, numeric, date, text, text)
  rename to upsert_financial_fx_snapshot_unscoped;

revoke all on function private.upsert_financial_fx_snapshot_unscoped(text, uuid, numeric, date, text, text)
  from public, anon, authenticated;

-- Source-detail visibility is permission-specific. A project reader does not
-- thereby gain supplier-Expense FX evidence, and an invoice reader does not gain
-- Client Billing FX evidence.
drop policy if exists financial_fx_snapshots_select on public.financial_fx_snapshots;
create policy financial_fx_snapshots_select on public.financial_fx_snapshots
for select to authenticated
using (
  (source_type = 'EXPENSE' and (select public.has_company_permission(company_id, 'expenses.read')))
  or (source_type = 'SUPPLIER_INVOICE' and (select public.has_company_permission(company_id, 'invoices.read')))
  or (source_type = 'CLIENT_BILLING' and (select public.has_company_permission(company_id, 'projects.read')))
);

create or replace function public.upsert_financial_fx_snapshot(
  p_source_type text,
  p_source_id uuid,
  p_rate numeric,
  p_rate_date date,
  p_rate_source text default 'MANUAL',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid := (select private.deployment_company_id());
  v_source_type text := upper(btrim(coalesce(p_source_type, '')));
  v_result jsonb;
  v_alias_result jsonb;
  v_linked_id uuid;
  v_effective_rate numeric;
  v_effective_rate_date date;
  v_effective_rate_source text;
  v_effective_note text;
  v_source_currency text;
  v_alias_currency text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to confirm FX rates' using errcode = '42501';
  end if;
  if v_company_id is null then
    raise exception 'The deployment company is unavailable' using errcode = '42501';
  end if;
  if v_source_type not in ('EXPENSE', 'SUPPLIER_INVOICE', 'CLIENT_BILLING') then
    raise exception 'Unsupported FX source type' using errcode = '22023';
  end if;
  if not (select private.has_company_permission(v_company_id, 'company.settings.manage')) then
    raise exception 'Company settings permission is required to confirm FX rates' using errcode = '42501';
  end if;

  if v_source_type = 'EXPENSE'
     and not (select private.has_company_permission(v_company_id, 'expenses.read')) then
    raise exception 'Expense read permission is required to confirm this FX rate' using errcode = '42501';
  elsif v_source_type = 'SUPPLIER_INVOICE'
     and not (select private.has_company_permission(v_company_id, 'invoices.read')) then
    raise exception 'Supplier invoice read permission is required to confirm this FX rate' using errcode = '42501';
  elsif v_source_type = 'CLIENT_BILLING'
     and not (select private.has_company_permission(v_company_id, 'projects.read')) then
    raise exception 'Project read permission is required to confirm this FX rate' using errcode = '42501';
  end if;

  v_result := private.upsert_financial_fx_snapshot_unscoped(
    v_source_type,
    p_source_id,
    p_rate,
    p_rate_date,
    p_rate_source,
    p_note
  );

  -- Use the already-frozen requested snapshot as the source for any linked alias.
  -- This makes retries deterministic: a later retry cannot sneak a new rate into
  -- the alias after the requested source was already confirmed.
  v_effective_rate := nullif(v_result->'snapshot'->>'rate', '')::numeric;
  v_effective_rate_date := nullif(v_result->'snapshot'->>'rateDate', '')::date;
  v_effective_rate_source := nullif(v_result->'snapshot'->>'rateSource', '');
  v_effective_note := nullif(v_result->'snapshot'->>'note', '');
  v_source_currency := nullif(v_result->'snapshot'->>'sourceCurrency', '');

  if v_source_type = 'EXPENSE' then
    select e.supplier_invoice_id
      into v_linked_id
    from public.expenses e
    where e.id = p_source_id
      and e.company_id = v_company_id
      and e.status <> 'VOID';

    if v_linked_id is not null then
      v_alias_result := private.upsert_financial_fx_snapshot_unscoped(
        'SUPPLIER_INVOICE',
        v_linked_id,
        v_effective_rate,
        v_effective_rate_date,
        v_effective_rate_source,
        v_effective_note
      );
    end if;
  elsif v_source_type = 'SUPPLIER_INVOICE' then
    select e.id
      into v_linked_id
    from public.expenses e
    where e.company_id = v_company_id
      and e.supplier_invoice_id = p_source_id
      and e.status <> 'VOID'
    order by e.created_at asc
    limit 1;

    if v_linked_id is not null then
      v_alias_result := private.upsert_financial_fx_snapshot_unscoped(
        'EXPENSE',
        v_linked_id,
        v_effective_rate,
        v_effective_rate_date,
        v_effective_rate_source,
        v_effective_note
      );
    end if;
  end if;

  if v_alias_result is not null then
    v_alias_currency := nullif(v_alias_result->'snapshot'->>'sourceCurrency', '');
    if v_alias_currency is distinct from v_source_currency
       or nullif(v_alias_result->'snapshot'->>'baseCurrency', '') is distinct from nullif(v_result->'snapshot'->>'baseCurrency', '')
       or nullif(v_alias_result->'snapshot'->>'rate', '')::numeric is distinct from v_effective_rate
       or nullif(v_alias_result->'snapshot'->>'rateDate', '')::date is distinct from v_effective_rate_date
       or nullif(v_alias_result->'snapshot'->>'rateSource', '') is distinct from v_effective_rate_source then
      raise exception 'Linked supplier Invoice and Expense contain conflicting FX evidence; use an audited correction path before reporting'
        using errcode = '23514';
    end if;
  end if;

  return v_result;
end;
$$;

revoke all on function public.upsert_financial_fx_snapshot(text, uuid, numeric, date, text, text)
  from public, anon, authenticated;
grant execute on function public.upsert_financial_fx_snapshot(text, uuid, numeric, date, text, text)
  to authenticated;
