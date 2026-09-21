-- Vendor master worksheet updates reuse the canonical Vendor RPC. This forward
-- migration adds an optional version predicate so worksheet callers can fail
-- closed on stale rows without changing existing create/link callers that do
-- not send an expected version.

create or replace function public.create_or_update_vendor(p_vendor jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_company_id uuid;
  v_vendor_id uuid;
  v_name text := nullif(btrim(coalesce(p_vendor->>'name', '')), '');
  v_normalized_name text;
  v_tax_id text := nullif(btrim(coalesce(p_vendor->>'taxId', p_vendor->>'tax_id', '')), '');
  v_tax_key text;
  v_email text := nullif(lower(btrim(coalesce(p_vendor->>'email', ''))), '');
  v_phone text := nullif(btrim(coalesce(p_vendor->>'phone', '')), '');
  v_address text := nullif(btrim(coalesce(p_vendor->>'address', '')), '');
  v_currency text := nullif(upper(btrim(coalesce(p_vendor->>'defaultCurrency', p_vendor->>'default_currency', ''))), '');
  v_category text := nullif(btrim(coalesce(p_vendor->>'defaultCategory', p_vendor->>'default_category', '')), '');
  v_has_email boolean := p_vendor ? 'email';
  v_has_phone boolean := p_vendor ? 'phone';
  v_has_address boolean := p_vendor ? 'address';
  v_has_category boolean := p_vendor ? 'defaultCategory' or p_vendor ? 'default_category';
  v_expected_updated_at timestamptz;
  v_existing public.vendors;
  v_before jsonb;
  v_created boolean := false;
  v_idempotent boolean := false;
  v_changed boolean := false;
  v_event_type text;
  v_matches integer := 0;
begin
  if v_actor is null then raise exception 'Authentication is required to manage Vendors' using errcode = '42501'; end if;
  v_company_id := private.resolve_transition_company();
  if not (select private.has_company_permission(v_company_id, 'vendors.manage')) then
    raise exception 'Vendor management permission is required' using errcode = '42501';
  end if;
  if v_name is null or length(v_name) > 200 then raise exception 'A Vendor name between 1 and 200 characters is required' using errcode = '22023'; end if;
  v_normalized_name := private.normalize_vendor_name(v_name);
  if v_normalized_name = '' then raise exception 'Vendor name must contain searchable characters' using errcode = '22023'; end if;
  v_tax_key := private.normalize_vendor_tax_id(v_tax_id);
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Vendor email is invalid' using errcode = '22023'; end if;
  if v_currency is not null and v_currency !~ '^[A-Z]{3}$' then raise exception 'Vendor default currency must be an ISO three-letter code' using errcode = '22023'; end if;

  begin
    v_vendor_id := nullif(coalesce(p_vendor->>'id', ''), '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Vendor id is invalid' using errcode = '22P02';
  end;
  begin
    v_expected_updated_at := nullif(coalesce(p_vendor->>'expectedUpdatedAt', p_vendor->>'expected_updated_at', ''), '')::timestamptz;
  exception when invalid_text_representation then
    raise exception 'Vendor expected version is invalid' using errcode = '22007';
  end;

  perform pg_advisory_xact_lock(hashtextextended(v_company_id::text || ':vendor:' || v_normalized_name || ':' || coalesce(v_tax_key, ''), 0));
  if v_tax_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_company_id::text || ':vendor-tax:' || v_tax_key, 0));
  end if;

  if v_vendor_id is not null then
    select v.* into v_existing
    from public.vendors v
    where v.id = v_vendor_id and v.company_id = v_company_id
    for update;
    if not found then raise exception 'Vendor was not found in this deployment company' using errcode = '23503'; end if;
    if v_expected_updated_at is not null and v_existing.updated_at is distinct from v_expected_updated_at then
      raise exception 'Vendor changed after it was loaded; refresh and review the current record before saving.' using errcode = '40001', detail = 'EXPECTED_VERSION_MISMATCH';
    end if;
    if v_tax_key is not null and private.normalize_vendor_tax_id(v_existing.tax_id) is not null
       and v_tax_key is distinct from private.normalize_vendor_tax_id(v_existing.tax_id) then
      raise exception 'Vendor tax identity conflicts with the existing canonical Vendor; reconcile explicitly' using errcode = '23514';
    end if;
    if v_tax_key is not null and private.normalize_vendor_tax_id(v_existing.tax_id) is null then
      null;
    elsif v_tax_key is null then
      v_tax_id := v_existing.tax_id;
      v_tax_key := private.normalize_vendor_tax_id(v_tax_id);
    end if;
    if exists (
      select 1 from public.vendors other
      where other.company_id = v_company_id and other.id <> v_existing.id
        and (
          (v_tax_key is not null and private.normalize_vendor_tax_id(other.tax_id) = v_tax_key)
          or (v_tax_key is null and private.normalize_vendor_tax_id(other.tax_id) is null and private.normalize_vendor_name(other.name) = v_normalized_name)
        )
    ) then
      raise exception 'Vendor identity conflicts with another canonical Vendor; select or reconcile explicitly' using errcode = '23514';
    end if;
    v_changed := v_existing.name is distinct from v_name
      or v_existing.normalized_name is distinct from v_normalized_name
      or v_existing.tax_id is distinct from coalesce(v_tax_id, v_existing.tax_id)
      or v_existing.email is distinct from case when v_has_email then v_email else v_existing.email end
      or v_existing.phone is distinct from case when v_has_phone then v_phone else v_existing.phone end
      or v_existing.address is distinct from case when v_has_address then v_address else v_existing.address end
      or v_existing.default_currency is distinct from coalesce(v_currency, v_existing.default_currency)
      or v_existing.default_category is distinct from case when v_has_category then v_category else v_existing.default_category end;
    v_before := to_jsonb(v_existing);
    update public.vendors v
    set name = v_name,
        normalized_name = v_normalized_name,
        tax_id = coalesce(v_tax_id, v.tax_id),
        email = case when v_has_email then v_email else v.email end,
        phone = case when v_has_phone then v_phone else v.phone end,
        address = case when v_has_address then v_address else v.address end,
        default_currency = coalesce(v_currency, v.default_currency),
        default_category = case when v_has_category then v_category else v.default_category end,
        updated_at = now()
    where v.id = v_existing.id and v.company_id = v_company_id
    returning v.* into v_existing;
    v_idempotent := not v_changed;
    v_event_type := 'UPDATED';
  else
    if v_tax_key is not null then
      select count(*)::integer into v_matches
      from public.vendors v
      where v.company_id = v_company_id and private.normalize_vendor_tax_id(v.tax_id) = v_tax_key;
      if v_matches > 1 then raise exception 'Vendor tax identity is ambiguous; reconcile the duplicate master records' using errcode = '23514'; end if;
      if v_matches = 1 then
        select v.* into v_existing from public.vendors v where v.company_id = v_company_id and private.normalize_vendor_tax_id(v.tax_id) = v_tax_key for update;
        if private.normalize_vendor_name(v_existing.name) is distinct from v_normalized_name then
          raise exception 'Vendor tax identity matches a different canonical name; select the existing Vendor explicitly' using errcode = '23514';
        end if;
      end if;
    else
      select count(*)::integer into v_matches
      from public.vendors v
      where v.company_id = v_company_id and private.normalize_vendor_tax_id(v.tax_id) is null and private.normalize_vendor_name(v.name) = v_normalized_name;
      if v_matches > 1 then raise exception 'Vendor name identity is ambiguous; select a canonical Vendor explicitly' using errcode = '23514'; end if;
      if v_matches = 1 then
        select v.* into v_existing from public.vendors v where v.company_id = v_company_id and private.normalize_vendor_tax_id(v.tax_id) is null and private.normalize_vendor_name(v.name) = v_normalized_name for update;
      elsif exists (select 1 from public.vendors v where v.company_id = v_company_id and private.normalize_vendor_name(v.name) = v_normalized_name and private.normalize_vendor_tax_id(v.tax_id) is not null) then
        raise exception 'Vendor name matches a tax-identified Vendor; select the canonical Vendor explicitly' using errcode = '23514';
      end if;
    end if;
    if v_existing.id is not null then
      v_idempotent := true;
      v_changed := v_existing.email is null and v_email is not null
        or v_existing.phone is null and v_phone is not null
        or v_existing.address is null and v_address is not null
        or v_existing.default_currency is null and v_currency is not null
        or v_existing.default_category is null and v_category is not null;
      if v_changed then
        v_before := to_jsonb(v_existing);
        update public.vendors v
        set email = coalesce(v.email, v_email), phone = coalesce(v.phone, v_phone), address = coalesce(v.address, v_address),
            default_currency = coalesce(v.default_currency, v_currency), default_category = coalesce(v.default_category, v_category), updated_at = now()
        where v.id = v_existing.id and v.company_id = v_company_id
        returning v.* into v_existing;
        v_event_type := 'ENRICHED';
      end if;
    else
      insert into public.vendors (user_id, company_id, name, normalized_name, email, phone, tax_id, address, default_currency, default_category)
      values (v_actor, v_company_id, v_name, v_normalized_name, v_email, v_phone, v_tax_id, v_address, v_currency, v_category)
      returning * into v_existing;
      v_created := true;
      v_event_type := 'CREATED';
    end if;
  end if;

  if v_created or v_changed then
    insert into public.vendor_master_events (company_id, vendor_id, actor_user_id, event_type, previous_data, new_data)
    values (v_company_id, v_existing.id, v_actor, v_event_type,
      case when v_created then null else v_before end,
      to_jsonb(v_existing));
  end if;
  return jsonb_build_object('vendor', to_jsonb(v_existing), 'created', v_created, 'updated', v_changed, 'idempotent', v_idempotent);
exception when unique_violation then
  select v.* into v_existing
  from public.vendors v
  where v.company_id = v_company_id
    and ((v_tax_key is not null and private.normalize_vendor_tax_id(v.tax_id) = v_tax_key)
      or (v_tax_key is null and private.normalize_vendor_tax_id(v.tax_id) is null and private.normalize_vendor_name(v.name) = v_normalized_name))
  order by v.created_at, v.id
  limit 1;
  if v_existing.id is not null then
    return jsonb_build_object('vendor', to_jsonb(v_existing), 'created', false, 'updated', false, 'idempotent', true);
  end if;
  raise;
end;
$$;

revoke all on function public.create_or_update_vendor(jsonb) from public, anon;
grant execute on function public.create_or_update_vendor(jsonb) to authenticated;
