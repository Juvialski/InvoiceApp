-- QA hardening: operational document identity must be deployment-scoped.
-- Existing rows are deliberately preserved. New company rows derive only the
-- approved bootstrap company name and leave every other legal/contact field
-- incomplete until an administrator supplies it.

create or replace function private.seed_company_document_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.company_document_profiles (
    company_id, legal_name, address, contact_number, email, vat_tin, logo_path
  ) values (
    new.id, btrim(new.name), null, null, null, null, null
  ) on conflict (company_id) do nothing;
  return new;
end;
$$;

drop trigger if exists companies_document_profile_seed on public.companies;
create trigger companies_document_profile_seed
after insert on public.companies
for each row execute function private.seed_company_document_profile();

revoke execute on function private.seed_company_document_profile() from public, anon, authenticated;

comment on function private.seed_company_document_profile()
  is 'Seeds only the explicitly supplied deployment company name; never copies product legal/contact identity into a new client profile.';

-- Supplier buyer validation is fail-closed when either side of a known buyer
-- identity cannot be resolved. Existing active Expense links remain idempotent
-- and return before source revalidation, preserving historical correction rules.
create or replace function public.verify_supplier_invoice_and_create_expense(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_invoice public.invoices;
  v_vendor public.vendors;
  v_expense public.expenses;
  v_company_id uuid;
  v_category text;
  v_description text;
  v_project_id uuid;
  v_cost_code_id uuid;
  v_po_id uuid;
  v_expected_buyer_name text;
  v_actual_buyer_name text;
  v_expected_buyer_tin text;
  v_actual_buyer_tin text;
  v_verified_at timestamptz;
  v_updated_at timestamptz;
begin
  if v_actor is null then
    raise exception 'Authentication is required to verify supplier invoices' using errcode = '42501';
  end if;

  select i.* into v_invoice
  from public.invoices i
  where i.id = p_invoice_id
  for update;
  if not found then
    raise exception 'Supplier invoice was not found' using errcode = '23503';
  end if;

  v_company_id := v_invoice.company_id;
  if not (select private.has_company_permission(v_company_id, 'invoices.verify')) then
    raise exception 'Invoice verification permission is required' using errcode = '42501';
  end if;
  if not (select private.has_company_permission(v_company_id, 'expenses.manage')) then
    raise exception 'Expense management permission is required to verify a supplier invoice' using errcode = '42501';
  end if;
  if coalesce(v_invoice.lifecycle_status, 'ACTIVE') = 'VOID' then
    raise exception 'Voided supplier invoices cannot be verified' using errcode = '42501';
  end if;

  select e.* into v_expense
  from public.expenses e
  where e.company_id = v_company_id
    and e.supplier_invoice_id = v_invoice.id
  for update;
  if found then
    if v_expense.status = 'VOID' then
      raise exception 'The linked Expense is VOID; use the Expense correction workflow before re-verifying' using errcode = '42501';
    end if;
    if v_invoice.review_status <> 'VERIFIED'
       or v_invoice.current_data->>'linkedExpenseId' is distinct from v_expense.id::text then
      update public.invoices
      set current_data = jsonb_set(coalesce(current_data, '{}'::jsonb), '{linkedExpenseId}', to_jsonb(v_expense.id), true),
          review_status = 'VERIFIED',
          verified_at = coalesce(verified_at, now()),
          updated_at = now()
      where id = v_invoice.id
        and company_id = v_company_id;
    end if;
    select i.verified_at, i.updated_at
      into v_verified_at, v_updated_at
    from public.invoices i
    where i.id = v_invoice.id;
    return jsonb_build_object(
      'invoiceId', v_invoice.id,
      'reviewStatus', 'VERIFIED',
      'verifiedAt', v_verified_at,
      'updatedAt', v_updated_at,
      'expense', to_jsonb(v_expense),
      'idempotent', true
    );
  end if;

  if v_invoice.vendor_id is null then
    raise exception 'Resolve the supplier invoice to a canonical Vendor before verification' using errcode = '22023';
  end if;
  select v.* into v_vendor
  from public.vendors v
  where v.id = v_invoice.vendor_id
    and v.company_id = v_company_id
  for share;
  if not found then
    raise exception 'The selected supplier Vendor is unavailable in this deployment company' using errcode = '23503';
  end if;
  if nullif(btrim(v_invoice.invoice_number), '') is null then
    raise exception 'Invoice number is required before supplier verification' using errcode = '22023';
  end if;
  if v_invoice.invoice_date is null then
    raise exception 'Invoice date is required before supplier verification; it cannot be replaced with today''s date' using errcode = '22023';
  end if;
  if v_invoice.currency is null or upper(btrim(v_invoice.currency)) !~ '^[A-Z]{3}$' then
    raise exception 'Invoice currency is required before supplier verification; it cannot default to PHP' using errcode = '22023';
  end if;
  if v_invoice.grand_total is null or v_invoice.grand_total <= 0 then
    raise exception 'A positive supplier invoice total is required before verification; unknown is not zero' using errcode = '22023';
  end if;
  v_category := nullif(btrim(coalesce(v_invoice.current_data->>'category', '')), '');
  if v_category is null then
    raise exception 'Expense category is unresolved; confirm it before supplier verification' using errcode = '22023';
  end if;
  v_description := nullif(btrim(coalesce(v_invoice.current_data->>'description', '')), '');
  if v_description is null then
    raise exception 'Expense description is unresolved; confirm it before supplier verification' using errcode = '22023';
  end if;

  select p.legal_name, p.vat_tin
    into v_expected_buyer_name, v_expected_buyer_tin
  from public.company_document_profiles p
  where p.company_id = v_company_id;
  v_actual_buyer_name := nullif(btrim(coalesce(
    v_invoice.current_data->'customer'->>'registeredName',
    v_invoice.current_data->'customer'->>'companyName',
    v_invoice.current_data->'customer'->>'name'
  )), '');
  v_actual_buyer_tin := nullif(regexp_replace(coalesce(v_invoice.current_data->'customer'->>'taxId', ''), '\D', '', 'g'), '');
  v_expected_buyer_tin := nullif(regexp_replace(coalesce(v_expected_buyer_tin, ''), '\D', '', 'g'), '');
  if v_expected_buyer_name is null or private.document_party_name_key(v_expected_buyer_name) = '' then
    raise exception 'Buyer identity is unresolved; complete the deployment company document profile before supplier verification' using errcode = '22023';
  end if;
  if v_actual_buyer_name is not null
     and private.document_party_name_key(v_actual_buyer_name) <> ''
     and position(private.document_party_name_key(v_actual_buyer_name) in private.document_party_name_key(v_expected_buyer_name)) = 0
     and position(private.document_party_name_key(v_expected_buyer_name) in private.document_party_name_key(v_actual_buyer_name)) = 0 then
    raise exception 'Buyer mismatch: the supplier invoice appears to be issued to another company' using errcode = '23514';
  end if;
  if v_actual_buyer_tin is not null and v_expected_buyer_tin is null then
    raise exception 'Buyer identity is unresolved; complete the deployment company document TIN before supplier verification' using errcode = '22023';
  end if;
  if v_actual_buyer_tin is not null
     and v_expected_buyer_tin is not null
     and v_actual_buyer_tin <> v_expected_buyer_tin then
    raise exception 'Buyer mismatch: the supplier invoice TIN does not match the deployment company' using errcode = '23514';
  end if;

  select projection.project_id, projection.project_cost_code_id
    into v_project_id, v_cost_code_id
  from private.supplier_invoice_project_projection(v_company_id, v_invoice.id) as projection;

  select m.purchase_order_id into v_po_id
  from public.purchase_order_invoice_matches m
  where m.company_id = v_company_id
    and m.invoice_id = v_invoice.id
    and m.status = 'CONFIRMED'
  order by m.confirmed_at desc nulls last, m.created_at desc
  limit 1;

  update public.invoices
  set review_status = 'VERIFIED',
      verified_at = coalesce(verified_at, now()),
      updated_at = now()
  where id = v_invoice.id
    and company_id = v_company_id;

  insert into public.expenses (
    id, user_id, company_id, project_id, project_cost_code_id, expense_date,
    category, description, payee, amount, currency, reference_number, status,
    supplier_invoice_id, vendor_id, purchase_order_id, notes
  ) values (
    gen_random_uuid(), v_actor, v_company_id, v_project_id, v_cost_code_id,
    v_invoice.invoice_date, v_category, v_description, v_vendor.name,
    v_invoice.grand_total, upper(v_invoice.currency),
    nullif(btrim(v_invoice.invoice_number), ''), 'DRAFT', v_invoice.id,
    v_vendor.id, v_po_id,
    format('Authoritative supplier payable created from preserved supplier invoice %s.', v_invoice.invoice_number)
  ) returning * into v_expense;

  update public.invoices
  set current_data = jsonb_set(coalesce(current_data, '{}'::jsonb), '{linkedExpenseId}', to_jsonb(v_expense.id), true),
      review_status = 'VERIFIED',
      verified_at = coalesce(verified_at, now()),
      updated_at = now()
  where id = v_invoice.id
    and company_id = v_company_id;
  select i.verified_at, i.updated_at
    into v_verified_at, v_updated_at
  from public.invoices i
  where i.id = v_invoice.id;

  insert into public.invoice_review_events (user_id, company_id, invoice_id, event_type, new_value)
  values (
    v_actor, v_company_id, v_invoice.id, 'VERIFIED_WITH_EXPENSE',
    jsonb_build_object('expenseId', v_expense.id, 'purchaseOrderId', v_po_id, 'projectId', v_project_id)
  );

  return jsonb_build_object(
    'invoiceId', v_invoice.id,
    'reviewStatus', 'VERIFIED',
    'verifiedAt', v_verified_at,
    'updatedAt', v_updated_at,
    'expense', to_jsonb(v_expense),
    'idempotent', false
  );
end;
$$;

revoke all on function public.verify_supplier_invoice_and_create_expense(uuid) from public, anon;
grant execute on function public.verify_supplier_invoice_and_create_expense(uuid) to authenticated;

-- Explicit first-deployment AI operator authority. This is intentionally a
-- service-role RPC called by the authenticated server route. It does not add
-- platform-admin authority to a Company Admin and it can never rotate an
-- already configured credential.
create or replace function public.bootstrap_deployment_company_ai_credential(
  p_company_id uuid,
  p_operator_user_id uuid,
  p_ciphertext text,
  p_iv text,
  p_auth_tag text,
  p_encryption_version integer,
  p_key_last4 text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := (select private.deployment_company_id());
  v_version integer := 1;
  v_existing boolean;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user) <> 'service_role'
     and current_user <> 'service_role' then
    raise exception 'Deployment AI bootstrap is server-only' using errcode = '42501';
  end if;
  if p_company_id is null or p_company_id is distinct from v_company_id then
    raise exception 'Deployment AI bootstrap cannot target another company' using errcode = '42501';
  end if;
  if p_operator_user_id is null then
    raise exception 'An authenticated initial deployment operator is required' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.company_members cm
    join public.companies c on c.id = cm.company_id
    where cm.company_id = p_company_id
      and cm.user_id = p_operator_user_id
      and cm.role_key = 'COMPANY_ADMIN'
      and cm.status = 'ACTIVE'
      and c.status = 'ACTIVE'
  ) then
    raise exception 'The initial deployment operator must be the active Company Admin' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.company_audit_events ae
    where ae.company_id = p_company_id
      and ae.event_type = 'COMPANY_CREATED'
      and coalesce((ae.metadata ->> 'bootstrap')::boolean, false)
      and ae.metadata ->> 'initial_admin_user_id' = p_operator_user_id::text
  ) then
    raise exception 'Initial deployment operator authorization is required' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_ciphertext, '')), '') is null
     or nullif(btrim(coalesce(p_iv, '')), '') is null
     or nullif(btrim(coalesce(p_auth_tag, '')), '') is null
     or p_encryption_version <> 1
     or p_key_last4 is null
     or length(p_key_last4) not between 1 and 4 then
    raise exception 'The encrypted credential envelope is invalid' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_company_id::text || ':deployment-ai-bootstrap', 0)
  );

  select exists (
    select 1
    from public.company_ai_settings s
    where s.company_id = p_company_id
  ) or exists (
    select 1
    from public.company_ai_credentials c
    where c.company_id = p_company_id
  ) into v_existing;
  if v_existing then
    -- A retry after a network interruption is safe and metadata-only. A
    -- different key is never allowed to overwrite the first configuration.
    return private.company_ai_config_json(p_company_id) || jsonb_build_object('idempotent', true);
  end if;

  insert into public.company_ai_settings (
    company_id, provider, enabled, credential_configured, credential_last4,
    credential_version, status, last_test_status, updated_at
  ) values (
    p_company_id, 'GEMINI', true, true, p_key_last4,
    v_version, 'ACTIVE', 'NOT_TESTED', now()
  );

  insert into public.company_ai_credentials (
    company_id, provider, ciphertext, iv, auth_tag, encryption_version,
    credential_version, key_last4, status, created_by, updated_by, rotated_at
  ) values (
    p_company_id, 'GEMINI', p_ciphertext, p_iv, p_auth_tag, p_encryption_version,
    v_version, p_key_last4, 'ACTIVE', p_operator_user_id, p_operator_user_id, now()
  );

  insert into public.company_audit_events (
    company_id, actor_user_id, event_type, target_type, target_id, metadata
  ) values (
    p_company_id, null, 'COMPANY_AI_CREDENTIAL_CONFIGURED', 'company_ai_credential', null,
    jsonb_build_object(
      'provider', 'GEMINI',
      'credential_version', v_version,
      'key_last4', p_key_last4,
      'bootstrap', true,
      'operator_user_id', p_operator_user_id
    )
  );

  return private.company_ai_config_json(p_company_id) || jsonb_build_object('idempotent', false);
end;
$$;

create or replace function public.server_get_company_ai_config(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user) <> 'service_role'
     and current_user <> 'service_role' then
    raise exception 'Server-only AI configuration lookup is required' using errcode = '42501';
  end if;
  if p_company_id is null or p_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'AI configuration must belong to the deployment company' using errcode = '42501';
  end if;
  if not exists (select 1 from public.companies c where c.id = p_company_id) then
    raise exception 'Company does not exist' using errcode = '22023';
  end if;
  return private.company_ai_config_json(p_company_id);
end;
$$;

create or replace function public.server_record_company_ai_test(p_company_id uuid, p_test_status text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user) <> 'service_role'
     and current_user <> 'service_role' then
    raise exception 'Server-only AI test recording is required' using errcode = '42501';
  end if;
  if p_company_id is null or p_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'AI configuration must belong to the deployment company' using errcode = '42501';
  end if;
  if p_test_status not in ('SUCCESS', 'INVALID_CREDENTIAL', 'QUOTA_LIMITED', 'PROVIDER_UNAVAILABLE', 'PROVIDER_ACCESS_DENIED', 'MODEL_UNAVAILABLE') then
    raise exception 'Invalid AI test status' using errcode = '22023';
  end if;
  v_status := case
    when p_test_status = 'SUCCESS' then 'ACTIVE'
    when p_test_status = 'INVALID_CREDENTIAL' then 'INVALID'
    else coalesce((select s.status from public.company_ai_settings s where s.company_id = p_company_id and s.provider = 'GEMINI'), 'NOT_CONFIGURED')
  end;
  update public.company_ai_settings
  set status = v_status,
      enabled = case when p_test_status = 'INVALID_CREDENTIAL' then false else enabled end,
      last_tested_at = now(),
      last_test_status = p_test_status,
      updated_at = now()
  where company_id = p_company_id and provider = 'GEMINI';
  if p_test_status = 'INVALID_CREDENTIAL' then
    update public.company_ai_credentials set status = 'INVALID', updated_at = now() where company_id = p_company_id and provider = 'GEMINI';
  elsif p_test_status = 'SUCCESS' then
    update public.company_ai_credentials set status = 'ACTIVE', updated_at = now() where company_id = p_company_id and provider = 'GEMINI';
  end if;
  insert into public.company_audit_events (
    company_id, actor_user_id, event_type, target_type, target_id, metadata
  ) values (
    p_company_id, null, 'COMPANY_AI_CREDENTIAL_TESTED', 'company_ai_credential', null,
    jsonb_build_object('provider', 'GEMINI', 'test_status', p_test_status, 'server_recorded', true)
  );
  return private.company_ai_config_json(p_company_id);
end;
$$;

revoke all on function public.bootstrap_deployment_company_ai_credential(uuid, uuid, text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.bootstrap_deployment_company_ai_credential(uuid, uuid, text, text, text, integer, text) to service_role;
revoke all on function public.server_get_company_ai_config(uuid) from public, anon, authenticated;
grant execute on function public.server_get_company_ai_config(uuid) to service_role;
revoke all on function public.server_record_company_ai_test(uuid, text) from public, anon, authenticated;
grant execute on function public.server_record_company_ai_test(uuid, text) to service_role;

comment on function public.bootstrap_deployment_company_ai_credential(uuid, uuid, text, text, text, integer, text)
  is 'One-time authenticated initial deployment operator bootstrap for encrypted company AI credentials; service-role/server only and never platform-admin authority.';
