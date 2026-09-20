-- UX-W4 Client Billing draft worksheet save hardening.
--
-- Draft header, metadata, and replacement lines are one authoritative
-- aggregate mutation. Existing edits require the updated_at token captured
-- when the draft worksheet opened; stale edits fail inside the locked RPC.

drop function if exists public.create_or_update_client_billing(jsonb, jsonb);

create or replace function public.create_or_update_client_billing(
  p_billing jsonb,
  p_lines jsonb default '[]'::jsonb,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid := nullif(coalesce(p_billing->>'companyId', p_billing->>'company_id'), '')::uuid;
  v_billing_id uuid := nullif(coalesce(p_billing->>'id', ''), '')::uuid;
  v_project_id uuid := nullif(coalesce(p_billing->>'projectId', p_billing->>'project_id'), '')::uuid;
  v_billing_number text := upper(btrim(coalesce(p_billing->>'billingNumber', p_billing->>'billing_number', '')));
  v_billing_date date := nullif(coalesce(p_billing->>'billingDate', p_billing->>'billing_date', ''), '')::date;
  v_due_date date := nullif(coalesce(p_billing->>'dueDate', p_billing->>'due_date', ''), '')::date;
  v_payment_terms text := nullif(btrim(coalesce(p_billing->>'paymentTerms', p_billing->>'payment_terms', '')), '');
  v_period_start date := nullif(coalesce(p_billing->>'periodStart', p_billing->>'period_start', ''), '')::date;
  v_period_end date := nullif(coalesce(p_billing->>'periodEnd', p_billing->>'period_end', ''), '')::date;
  v_client_name text := nullif(btrim(coalesce(p_billing->>'clientNameSnapshot', p_billing->>'client_name_snapshot', '')), '');
  v_client_reference text := nullif(btrim(coalesce(p_billing->>'clientReferenceSnapshot', p_billing->>'client_reference_snapshot', '')), '');
  v_billing_contact_name text := nullif(btrim(coalesce(p_billing->>'billingContactName', p_billing->>'billing_contact_name', '')), '');
  v_billing_email text := nullif(btrim(coalesce(p_billing->>'billingEmail', p_billing->>'billing_email', '')), '');
  v_billing_address text := nullif(btrim(coalesce(p_billing->>'billingAddress', p_billing->>'billing_address', '')), '');
  v_currency text;
  v_project public.projects;
  v_existing public.client_billings;
  v_line_row jsonb;
  v_line_number integer := 0;
  v_description text;
  v_amount numeric(18,2);
  v_total numeric(18,2);
  v_billing_json jsonb;
  v_lines_json jsonb;
  v_event_type text;
  v_audit_event text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required to save client billings' using errcode = '42501';
  end if;
  if p_billing is null or jsonb_typeof(p_billing) <> 'object' then
    raise exception 'Client billing header must be a JSON object' using errcode = '22023';
  end if;
  if v_company_id is null or v_project_id is null then
    raise exception 'Company and project are required for client billing' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_lines, '[]'::jsonb)) <> 'array' then
    raise exception 'Client billing lines must be a JSON array' using errcode = '22023';
  end if;
  perform private.require_project_permission(v_company_id, 'projects.manage');

  select p.*
    into v_project
  from public.projects p
  where p.id = v_project_id
    and p.company_id = v_company_id
  for key share;
  if not found then
    raise exception 'Project does not exist in the deployment company' using errcode = '42501';
  end if;
  if v_project.status in ('ARCHIVED', 'CANCELLED') or v_project.archived_at is not null then
    raise exception 'Archived or cancelled projects cannot receive new client billing activity' using errcode = '42501';
  end if;

  v_currency := upper(btrim(coalesce(nullif(p_billing->>'currency', ''), v_project.currency)));
  if v_currency is distinct from upper(btrim(v_project.currency)) then
    raise exception 'Client billing currency must match the project currency' using errcode = '22023';
  end if;
  if v_billing_number = '' then
    raise exception 'Billing number is required' using errcode = '22023';
  end if;
  if v_due_date is not null and v_billing_date is not null and v_due_date < v_billing_date then
    raise exception 'Due date cannot precede the invoice date' using errcode = '22023';
  end if;
  if v_period_end is not null and v_period_start is not null and v_period_end < v_period_start then
    raise exception 'Billing period end cannot precede its start' using errcode = '22023';
  end if;
  v_client_name := coalesce(v_client_name, nullif(btrim(v_project.client_name), ''));
  v_client_reference := coalesce(v_client_reference, nullif(btrim(v_project.client_reference), ''));

  if v_billing_id is not null then
    select b.* into v_existing
    from public.client_billings b
    where b.id = v_billing_id and b.company_id = v_company_id
    for update;
    if not found then
      raise exception 'Client billing was not found in the deployment company' using errcode = '23503';
    end if;
    if v_existing.status <> 'DRAFT' then
      raise exception 'Only draft client billings can be edited' using errcode = '42501';
    end if;
    if p_expected_updated_at is null or v_existing.updated_at is distinct from p_expected_updated_at then
      raise exception 'Client billing changed after the draft worksheet opened; refresh and review the current record before saving.'
        using errcode = '40001', detail = 'EXPECTED_VERSION_MISMATCH';
    end if;

    update public.client_billings
    set billing_number = v_billing_number,
        project_id = v_project_id,
        billing_date = coalesce(v_billing_date, current_date),
        due_date = v_due_date,
        payment_terms = v_payment_terms,
        period_start = v_period_start,
        period_end = v_period_end,
        client_name_snapshot = v_client_name,
        client_reference_snapshot = v_client_reference,
        billing_contact_name = v_billing_contact_name,
        billing_email = v_billing_email,
        billing_address = v_billing_address,
        currency = v_currency,
        notes = nullif(btrim(coalesce(p_billing->>'notes', '')), ''),
        updated_by_user_id = v_user_id
    where id = v_billing_id and company_id = v_company_id;
    v_event_type := 'UPDATED';
    v_audit_event := 'CLIENT_BILLING_UPDATED';
  else
    v_billing_id := gen_random_uuid();
    insert into public.client_billings (
      id, company_id, project_id, billing_number, billing_date, due_date,
      payment_terms, period_start, period_end, client_name_snapshot,
      client_reference_snapshot, billing_contact_name, billing_email,
      billing_address, currency, status, notes, created_by_user_id,
      updated_by_user_id
    ) values (
      v_billing_id, v_company_id, v_project_id, v_billing_number,
      coalesce(v_billing_date, current_date), v_due_date, v_payment_terms,
      v_period_start, v_period_end, v_client_name, v_client_reference,
      v_billing_contact_name, v_billing_email, v_billing_address, v_currency,
      'DRAFT', nullif(btrim(coalesce(p_billing->>'notes', '')), ''),
      v_user_id, v_user_id
    );
    v_event_type := 'CREATED';
    v_audit_event := 'CLIENT_BILLING_CREATED';
  end if;

  delete from public.client_billing_lines
  where company_id = v_company_id and billing_id = v_billing_id;

  for v_line_row in select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_line_number := v_line_number + 1;
    v_description := btrim(coalesce(v_line_row->>'description', ''));
    v_amount := round(coalesce(nullif(v_line_row->>'amount', '')::numeric, 0), 2);
    if v_description = '' then
      raise exception 'Every client billing line needs a description' using errcode = '22023';
    end if;
    if v_amount < 0 then
      raise exception 'Client billing line amount cannot be negative' using errcode = '22023';
    end if;
    insert into public.client_billing_lines (
      company_id, billing_id, line_number, description, amount, notes
    ) values (
      v_company_id, v_billing_id, v_line_number, v_description, v_amount,
      nullif(btrim(coalesce(v_line_row->>'notes', '')), '')
    );
  end loop;

  select coalesce(sum(l.amount), 0)::numeric(18,2)
    into v_total
  from public.client_billing_lines l
  where l.company_id = v_company_id and l.billing_id = v_billing_id;

  insert into public.client_billing_events (
    company_id, billing_id, event_type, from_status, to_status, actor_user_id
  ) values (
    v_company_id, v_billing_id, v_event_type,
    case when v_existing.id is null then null else v_existing.status end,
    'DRAFT', v_user_id
  );
  perform private.write_company_audit(
    v_company_id, v_audit_event, 'client_billing', v_billing_id,
    jsonb_build_object('billingNumber', v_billing_number, 'status', 'DRAFT', 'totalAmount', v_total)
  );

  select to_jsonb(b.*) into v_billing_json
  from public.client_billings b
  where b.id = v_billing_id and b.company_id = v_company_id;
  select coalesce(jsonb_agg(to_jsonb(l.*) order by l.line_number asc), '[]'::jsonb)
    into v_lines_json
  from public.client_billing_lines l
  where l.company_id = v_company_id and l.billing_id = v_billing_id;
  return jsonb_build_object('billing', v_billing_json, 'lines', v_lines_json, 'totalAmount', v_total);
end;
$$;

revoke all on function public.create_or_update_client_billing(jsonb, jsonb, timestamptz) from public, anon;
grant execute on function public.create_or_update_client_billing(jsonb, jsonb, timestamptz) to authenticated;
