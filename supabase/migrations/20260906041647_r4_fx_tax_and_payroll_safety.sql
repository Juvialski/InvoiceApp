-- HydroQualiSense R4: explicit project tax classification, immutable
-- transaction-level FX evidence for base-currency reporting, and guards for
-- repeated active payroll-period creation. Existing financial/history rows are
-- preserved; legacy projects and billings become explicitly UNCLASSIFIED until
-- an authorized user confirms VAT or NON_VAT.

-- 1. Project tax treatment. UNCLASSIFIED is a structural transition state, not
-- a guessed tax answer. The application requires VAT/NON_VAT for new projects
-- and when an existing unclassified project is edited.
alter table public.projects
  add column if not exists tax_treatment text not null default 'UNCLASSIFIED';

update public.projects
set tax_treatment = 'UNCLASSIFIED'
where tax_treatment is null or btrim(tax_treatment) = '';

alter table public.projects drop constraint if exists projects_tax_treatment_check;
alter table public.projects
  add constraint projects_tax_treatment_check
  check (tax_treatment in ('VAT', 'NON_VAT', 'UNCLASSIFIED'));

create or replace function private.require_project_tax_treatment_on_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(new.tax_treatment, 'UNCLASSIFIED') = 'UNCLASSIFIED' then
    raise exception 'New projects require an explicit VAT or Non-VAT classification' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists projects_r4_tax_treatment_insert on public.projects;
create trigger projects_r4_tax_treatment_insert
before insert on public.projects
for each row execute function private.require_project_tax_treatment_on_insert();

revoke execute on function private.require_project_tax_treatment_on_insert() from public, anon, authenticated;

-- 2. Client billing carries the project classification. Draft/submitted rows
-- are synchronized from the current project; issuance freezes the value on the
-- billing row and in the immutable issued-document snapshot.
alter table public.client_billings
  add column if not exists tax_treatment text not null default 'UNCLASSIFIED';

alter table public.client_billings drop constraint if exists client_billings_tax_treatment_check;
alter table public.client_billings
  add constraint client_billings_tax_treatment_check
  check (tax_treatment in ('VAT', 'NON_VAT', 'UNCLASSIFIED'));

create or replace function private.sync_client_billing_tax_treatment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_project_tax text;
begin
  select p.tax_treatment
    into v_project_tax
  from public.projects p
  where p.id = new.project_id
    and p.company_id = new.company_id;

  if v_project_tax is null then
    v_project_tax := 'UNCLASSIFIED';
  end if;

  if tg_op = 'INSERT'
     or old.status = 'DRAFT'
     or new.status in ('DRAFT', 'SUBMITTED')
     or (tg_op = 'UPDATE' and old.status = 'SUBMITTED' and new.status = 'ISSUED') then
    new.tax_treatment := v_project_tax;
  elsif new.tax_treatment is distinct from old.tax_treatment then
    raise exception 'Issued or voided client invoice tax treatment is immutable' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists client_billings_r4_tax_treatment on public.client_billings;
create trigger client_billings_r4_tax_treatment
before insert or update on public.client_billings
for each row execute function private.sync_client_billing_tax_treatment();

revoke execute on function private.sync_client_billing_tax_treatment() from public, anon, authenticated;

create or replace function private.require_client_billing_tax_treatment_for_issue()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.status = 'SUBMITTED'
     and new.status = 'ISSUED'
     and new.tax_treatment = 'UNCLASSIFIED' then
    raise exception 'Client billing cannot be issued until the project VAT or Non-VAT classification is confirmed' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists client_billings_r4z_tax_issue on public.client_billings;
create trigger client_billings_r4z_tax_issue
before update on public.client_billings
for each row execute function private.require_client_billing_tax_treatment_for_issue();

revoke execute on function private.require_client_billing_tax_treatment_for_issue() from public, anon, authenticated;

-- Rebuild only the client-invoice snapshot builder so newly issued snapshots
-- include the classification. Existing snapshots remain immutable and are not
-- rewritten by this migration.
create or replace function private.ensure_client_invoice_document_snapshot(
  p_client_billing_id uuid,
  p_processor_name text default null,
  p_processor_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_billing public.client_billings;
  v_project public.projects;
  v_company public.companies;
  v_profile public.company_document_profiles;
  v_processor public.profiles;
  v_lines jsonb := '[]'::jsonb;
  v_total numeric(18,2) := 0;
  v_snapshot jsonb;
  v_existing_snapshot jsonb;
  v_snapshot_id uuid;
  v_processor_name text;
  v_processor_title text;
begin
  select b.* into v_billing
  from public.client_billings b
  where b.id = p_client_billing_id
  for update;
  if not found then raise exception 'Client invoice was not found' using errcode = '23503'; end if;
  if v_billing.status not in ('ISSUED', 'VOIDED') then raise exception 'Only issued client invoices can have an issued document snapshot' using errcode = '42501'; end if;
  select c.* into v_company from public.companies c where c.id = v_billing.company_id;
  select p.* into v_project from public.projects p where p.id = v_billing.project_id and p.company_id = v_billing.company_id;
  select p.* into v_profile from public.company_document_profiles p where p.company_id = v_billing.company_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineNumber', l.line_number, 'description', l.description, 'amount', l.amount, 'notes', l.notes
  ) order by l.line_number), '[]'::jsonb), coalesce(sum(l.amount), 0)::numeric(18,2)
  into v_lines, v_total
  from public.client_billing_lines l
  where l.company_id = v_billing.company_id and l.billing_id = v_billing.id;
  select p.* into v_processor from public.profiles p where p.id = coalesce(v_billing.issued_by_user_id, (select auth.uid()));
  v_processor_name := coalesce(nullif(btrim(p_processor_name), ''), nullif(btrim(v_processor.full_name), ''), 'Authorized User');
  v_processor_title := nullif(btrim(p_processor_title), '');
  v_snapshot := jsonb_build_object(
    'documentType', 'CLIENT_INVOICE', 'documentNumber', v_billing.billing_number,
    'status', 'ISSUED', 'invoiceDate', v_billing.billing_date, 'dueDate', v_billing.due_date,
    'paymentTerms', v_billing.payment_terms, 'currency', v_billing.currency,
    'taxTreatment', v_billing.tax_treatment,
    'notes', v_billing.notes, 'termsAndConditions', v_profile.default_terms,
    'company', jsonb_build_object(
      'legalName', coalesce(v_profile.legal_name, v_company.name),
      'address', v_profile.address, 'contactNumber', v_profile.contact_number,
      'email', v_profile.email, 'vatTin', v_profile.vat_tin, 'logoPath', v_profile.logo_path,
      'paymentInstructions', v_profile.payment_instructions
    ),
    'project', jsonb_build_object(
      'id', v_project.id, 'projectCode', v_project.project_code, 'projectName', v_project.project_name
    ),
    'billTo', jsonb_build_object(
      'name', coalesce(v_billing.client_name_snapshot, v_project.client_name),
      'contactName', coalesce(v_billing.billing_contact_name, v_project.billing_contact_name),
      'email', coalesce(v_billing.billing_email, v_project.billing_email),
      'address', coalesce(v_billing.billing_address, v_project.billing_address, v_project.site_address),
      'reference', coalesce(v_billing.client_reference_snapshot, v_project.client_reference)
    ),
    'lines', v_lines, 'subtotal', v_total, 'totalAmount', v_total,
    'processor', jsonb_build_object('name', v_processor_name, 'title', v_processor_title),
    'templateVersion', 'HSC-CLIENT-INVOICE-v1'
  );
  select s.id, s.snapshot into v_snapshot_id, v_existing_snapshot
  from public.issued_document_snapshots s
  where s.company_id = v_billing.company_id and s.document_type = 'CLIENT_INVOICE' and s.document_id = v_billing.id;
  if v_snapshot_id is not null then
    return jsonb_build_object('id', v_snapshot_id, 'companyId', v_billing.company_id, 'documentType', 'CLIENT_INVOICE', 'documentId', v_billing.id, 'documentNumber', v_billing.billing_number, 'templateVersion', 'HSC-CLIENT-INVOICE-v1', 'snapshot', v_existing_snapshot);
  end if;
  insert into public.issued_document_snapshots (
    company_id, document_type, document_id, document_number, template_version,
    snapshot, generated_by_user_id
  ) values (
    v_billing.company_id, 'CLIENT_INVOICE', v_billing.id, v_billing.billing_number, 'HSC-CLIENT-INVOICE-v1',
    v_snapshot, coalesce(v_billing.issued_by_user_id, (select auth.uid()))
  ) on conflict (company_id, document_type, document_id) do nothing
  returning id into v_snapshot_id;
  if v_snapshot_id is null then
    select s.id, s.snapshot into v_snapshot_id, v_existing_snapshot
    from public.issued_document_snapshots s
    where s.company_id = v_billing.company_id and s.document_type = 'CLIENT_INVOICE' and s.document_id = v_billing.id;
    return jsonb_build_object('id', v_snapshot_id, 'companyId', v_billing.company_id, 'documentType', 'CLIENT_INVOICE', 'documentId', v_billing.id, 'documentNumber', v_billing.billing_number, 'templateVersion', 'HSC-CLIENT-INVOICE-v1', 'snapshot', v_existing_snapshot);
  end if;
  return jsonb_build_object('id', v_snapshot_id, 'companyId', v_billing.company_id, 'documentType', 'CLIENT_INVOICE', 'documentId', v_billing.id, 'documentNumber', v_billing.billing_number, 'templateVersion', 'HSC-CLIENT-INVOICE-v1', 'snapshot', v_snapshot);
end;
$$;

revoke execute on function private.ensure_client_invoice_document_snapshot(uuid, text, text) from public, anon, authenticated;

-- 3. Immutable transaction-level FX snapshots. Source amounts and currencies
-- remain on their authoritative records. The snapshot stores the exact rate,
-- date, provenance, actor, and rounded base equivalent used by reporting.
create table if not exists public.financial_fx_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  source_type text not null check (source_type in ('EXPENSE', 'SUPPLIER_INVOICE', 'CLIENT_BILLING')),
  source_id uuid not null,
  source_amount numeric(18,2) not null check (source_amount > 0),
  source_currency text not null check (source_currency = upper(source_currency) and source_currency ~ '^[A-Z]{3}$'),
  base_currency text not null check (base_currency = upper(base_currency) and base_currency ~ '^[A-Z]{3}$'),
  rate numeric(20,10) not null check (rate > 0),
  rate_date date not null,
  rate_source text not null default 'MANUAL' check (rate_source in ('MANUAL', 'CONFIGURED', 'BASE_CURRENCY')),
  note text,
  entered_by_user_id uuid not null references auth.users(id) on delete restrict,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  base_amount numeric(18,2) not null check (base_amount > 0),
  constraint financial_fx_snapshots_source_unique unique (company_id, source_type, source_id),
  constraint financial_fx_snapshots_note_length check (note is null or length(btrim(note)) <= 500)
);

create index if not exists financial_fx_snapshots_company_source_idx
  on public.financial_fx_snapshots(company_id, source_type, source_id);

create or replace function private.validate_financial_fx_snapshot_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_default_currency text;
  v_source_amount numeric(18,2);
  v_source_currency text;
begin
  if (select auth.uid()) is null or new.entered_by_user_id is distinct from (select auth.uid()) then
    raise exception 'FX confirmation actor must be the authenticated user' using errcode = '42501';
  end if;
  if new.company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'FX snapshot must belong to the deployment company' using errcode = '42501';
  end if;
  if not (select private.has_company_permission(new.company_id, 'company.settings.manage')) then
    raise exception 'Company settings permission is required to confirm FX rates' using errcode = '42501';
  end if;

  select upper(c.default_currency) into v_default_currency
  from public.companies c where c.id = new.company_id;
  if v_default_currency is null or new.base_currency <> v_default_currency then
    raise exception 'FX snapshot base currency must match the company reporting currency' using errcode = '22023';
  end if;

  if new.source_type = 'EXPENSE' then
    select round(e.amount, 2), upper(e.currency) into v_source_amount, v_source_currency
    from public.expenses e where e.id = new.source_id and e.company_id = new.company_id;
  elsif new.source_type = 'SUPPLIER_INVOICE' then
    select round(i.grand_total, 2), upper(i.currency) into v_source_amount, v_source_currency
    from public.invoices i where i.id = new.source_id and i.company_id = new.company_id;
  elsif new.source_type = 'CLIENT_BILLING' then
    select round(coalesce(sum(l.amount), 0), 2), upper(b.currency)
      into v_source_amount, v_source_currency
    from public.client_billings b
    left join public.client_billing_lines l on l.company_id = b.company_id and l.billing_id = b.id
    where b.id = new.source_id and b.company_id = new.company_id
    group by b.id, b.currency;
  end if;

  if v_source_amount is null or v_source_amount <= 0 then
    raise exception 'FX snapshot source record is unavailable or has no positive amount' using errcode = '23503';
  end if;
  if v_source_currency is null or new.source_currency <> v_source_currency then
    raise exception 'FX snapshot source currency does not match the authoritative record' using errcode = '22023';
  end if;
  if new.source_amount is distinct from v_source_amount then
    raise exception 'FX snapshot source amount does not match the authoritative record' using errcode = '22023';
  end if;
  if new.source_currency = new.base_currency then
    if new.rate <> 1 or new.rate_source <> 'BASE_CURRENCY' then
      raise exception 'Base-currency records use a fixed BASE_CURRENCY rate' using errcode = '22023';
    end if;
  elsif new.rate_source = 'BASE_CURRENCY' then
    raise exception 'Foreign-currency records require an explicit FX provenance' using errcode = '22023';
  end if;
  if new.base_amount is distinct from round(new.source_amount * new.rate, 2) then
    raise exception 'FX base amount must equal the frozen source amount multiplied by the frozen rate' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists financial_fx_snapshots_scope on public.financial_fx_snapshots;
create trigger financial_fx_snapshots_scope
before insert on public.financial_fx_snapshots
for each row execute function private.validate_financial_fx_snapshot_scope();

create or replace function private.prevent_financial_fx_snapshot_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'FX conversion snapshots are immutable; use an audited financial correction path' using errcode = '42501';
end;
$$;

drop trigger if exists financial_fx_snapshots_immutable on public.financial_fx_snapshots;
create trigger financial_fx_snapshots_immutable
before update or delete on public.financial_fx_snapshots
for each row execute function private.prevent_financial_fx_snapshot_mutation();

alter table public.financial_fx_snapshots enable row level security;
drop policy if exists financial_fx_snapshots_select on public.financial_fx_snapshots;
create policy financial_fx_snapshots_select on public.financial_fx_snapshots
for select to authenticated
using (
  (select public.has_company_permission(company_id, 'company.settings.read'))
  or (select public.has_company_permission(company_id, 'expenses.read'))
  or (select public.has_company_permission(company_id, 'invoices.read'))
  or (select public.has_company_permission(company_id, 'projects.read'))
);

revoke all on table public.financial_fx_snapshots from public, anon, authenticated;
grant select on table public.financial_fx_snapshots to authenticated;

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
  v_rate_source text := upper(btrim(coalesce(p_rate_source, 'MANUAL')));
  v_base_currency text;
  v_source_amount numeric(18,2);
  v_source_currency text;
  v_snapshot public.financial_fx_snapshots;
begin
  if v_user_id is null then raise exception 'Authentication is required to confirm FX rates' using errcode = '42501'; end if;
  if v_source_type not in ('EXPENSE', 'SUPPLIER_INVOICE', 'CLIENT_BILLING') then raise exception 'Unsupported FX source type' using errcode = '22023'; end if;
  if p_source_id is null then raise exception 'FX source record is required' using errcode = '22023'; end if;
  if p_rate is null or p_rate <= 0 then raise exception 'FX rate must be greater than zero' using errcode = '22023'; end if;
  if p_rate_date is null then raise exception 'FX rate date is required' using errcode = '22023'; end if;
  if v_rate_source not in ('MANUAL', 'CONFIGURED', 'BASE_CURRENCY') then raise exception 'Unsupported FX rate provenance' using errcode = '22023'; end if;
  if not (select private.has_company_permission(v_company_id, 'company.settings.manage')) then raise exception 'Company settings permission is required to confirm FX rates' using errcode = '42501'; end if;

  select s.* into v_snapshot
  from public.financial_fx_snapshots s
  where s.company_id = v_company_id and s.source_type = v_source_type and s.source_id = p_source_id
  for update;
  if found then
    return jsonb_build_object('snapshot', jsonb_build_object(
      'id', v_snapshot.id, 'companyId', v_snapshot.company_id, 'sourceType', v_snapshot.source_type,
      'sourceId', v_snapshot.source_id, 'sourceAmount', v_snapshot.source_amount,
      'sourceCurrency', v_snapshot.source_currency, 'baseCurrency', v_snapshot.base_currency,
      'rate', v_snapshot.rate, 'rateDate', v_snapshot.rate_date, 'rateSource', v_snapshot.rate_source,
      'note', v_snapshot.note, 'enteredByUserId', v_snapshot.entered_by_user_id,
      'confirmedAt', v_snapshot.confirmed_at, 'createdAt', v_snapshot.created_at, 'baseAmount', v_snapshot.base_amount
    ), 'idempotent', true);
  end if;

  select upper(c.default_currency) into v_base_currency from public.companies c where c.id = v_company_id;
  if v_source_type = 'EXPENSE' then
    select round(e.amount, 2), upper(e.currency) into v_source_amount, v_source_currency from public.expenses e where e.id = p_source_id and e.company_id = v_company_id;
  elsif v_source_type = 'SUPPLIER_INVOICE' then
    select round(i.grand_total, 2), upper(i.currency) into v_source_amount, v_source_currency from public.invoices i where i.id = p_source_id and i.company_id = v_company_id;
  else
    select round(coalesce(sum(l.amount), 0), 2), upper(b.currency) into v_source_amount, v_source_currency
    from public.client_billings b left join public.client_billing_lines l on l.company_id = b.company_id and l.billing_id = b.id
    where b.id = p_source_id and b.company_id = v_company_id group by b.id, b.currency;
  end if;
  if v_source_amount is null or v_source_amount <= 0 or v_source_currency is null then raise exception 'FX source record is unavailable or has no positive amount' using errcode = '23503'; end if;
  if v_source_currency = v_base_currency then
    v_rate_source := 'BASE_CURRENCY';
    p_rate := 1;
  elsif v_rate_source = 'BASE_CURRENCY' then
    raise exception 'Foreign-currency records require an explicit FX provenance' using errcode = '22023';
  end if;

  insert into public.financial_fx_snapshots (
    company_id, source_type, source_id, source_amount, source_currency, base_currency,
    rate, rate_date, rate_source, note, entered_by_user_id, confirmed_at, base_amount
  ) values (
    v_company_id, v_source_type, p_source_id, v_source_amount, v_source_currency, v_base_currency,
    round(p_rate, 10), p_rate_date, v_rate_source, nullif(left(btrim(coalesce(p_note, '')), 500), ''),
    v_user_id, now(), round(v_source_amount * p_rate, 2)
  ) on conflict (company_id, source_type, source_id) do nothing
  returning * into v_snapshot;

  if v_snapshot.id is null then
    select s.* into v_snapshot from public.financial_fx_snapshots s
    where s.company_id = v_company_id and s.source_type = v_source_type and s.source_id = p_source_id;
  end if;
  return jsonb_build_object('snapshot', jsonb_build_object(
    'id', v_snapshot.id, 'companyId', v_snapshot.company_id, 'sourceType', v_snapshot.source_type,
    'sourceId', v_snapshot.source_id, 'sourceAmount', v_snapshot.source_amount,
    'sourceCurrency', v_snapshot.source_currency, 'baseCurrency', v_snapshot.base_currency,
    'rate', v_snapshot.rate, 'rateDate', v_snapshot.rate_date, 'rateSource', v_snapshot.rate_source,
    'note', v_snapshot.note, 'enteredByUserId', v_snapshot.entered_by_user_id,
    'confirmedAt', v_snapshot.confirmed_at, 'createdAt', v_snapshot.created_at, 'baseAmount', v_snapshot.base_amount
  ), 'idempotent', false);
end;
$$;

revoke all on function public.upsert_financial_fx_snapshot(text, uuid, numeric, date, text, text) from public, anon;
grant execute on function public.upsert_financial_fx_snapshot(text, uuid, numeric, date, text, text) to authenticated;
revoke execute on function private.validate_financial_fx_snapshot_scope() from public, anon, authenticated;
revoke execute on function private.prevent_financial_fx_snapshot_mutation() from public, anon, authenticated;

-- 4. Serialize active payroll-period boundaries. VOID rows remain historical
-- and may repeat as audited attempts; an active row for the same company/date
-- boundary cannot be created concurrently or through repeated submission.
create or replace function private.prevent_duplicate_active_payroll_period_boundary()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.company_id is not null and new.status <> 'VOID' then
    perform pg_advisory_xact_lock(hashtextextended(format('%s:%s:%s', new.company_id, new.period_start, new.period_end), 0));
    if exists (
      select 1 from public.payroll_periods p
      where p.company_id = new.company_id
        and p.period_start = new.period_start
        and p.period_end = new.period_end
        and p.status <> 'VOID'
        and p.id <> new.id
    ) then
      raise exception 'An active payroll period already exists for this date boundary' using errcode = '23505';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists payroll_periods_r4_active_boundary on public.payroll_periods;
create trigger payroll_periods_r4_active_boundary
before insert or update on public.payroll_periods
for each row execute function private.prevent_duplicate_active_payroll_period_boundary();

revoke execute on function private.prevent_duplicate_active_payroll_period_boundary() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.financial_fx_snapshots;
    exception when duplicate_object then
      null;
    end;
  end if;
end;
$$;
