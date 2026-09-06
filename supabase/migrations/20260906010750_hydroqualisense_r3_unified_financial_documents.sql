-- HydroQualiSense R3: unified supplier invoice / expense and client invoice
-- document workflow. This migration is additive and preserves all existing
-- invoice, expense, billing, procurement, and audit history.

-- 1. Source ownership and lightweight client billing contact defaults.
alter table public.expenses
  add column if not exists supplier_invoice_id uuid,
  add column if not exists vendor_id uuid,
  add column if not exists purchase_order_id uuid;

alter table public.projects
  add column if not exists billing_contact_name text,
  add column if not exists billing_email text,
  add column if not exists billing_address text;

alter table public.client_billings
  add column if not exists due_date date,
  add column if not exists payment_terms text,
  add column if not exists billing_contact_name text,
  add column if not exists billing_email text,
  add column if not exists billing_address text;

create or replace function public.prevent_issued_client_invoice_metadata_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status <> 'DRAFT' and (
    new.due_date is distinct from old.due_date
    or new.payment_terms is distinct from old.payment_terms
    or new.billing_contact_name is distinct from old.billing_contact_name
    or new.billing_email is distinct from old.billing_email
    or new.billing_address is distinct from old.billing_address
  ) then
    raise exception 'Submitted, issued, cancelled, or voided client invoice metadata is immutable'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists client_billings_issued_metadata_immutable on public.client_billings;
create trigger client_billings_issued_metadata_immutable
before update on public.client_billings
for each row execute function public.prevent_issued_client_invoice_metadata_mutation();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.invoices'::regclass
      and conname = 'invoices_company_id_id_key'
  ) then
    alter table public.invoices add constraint invoices_company_id_id_key unique (company_id, id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.vendors'::regclass
      and conname = 'vendors_company_id_id_key'
  ) then
    alter table public.vendors add constraint vendors_company_id_id_key unique (company_id, id);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.expenses'::regclass
      and conname = 'expenses_company_id_id_key'
  ) then
    alter table public.expenses add constraint expenses_company_id_id_key unique (company_id, id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.expenses'::regclass
      and conname = 'expenses_supplier_invoice_fk'
  ) then
    alter table public.expenses
      add constraint expenses_supplier_invoice_fk
      foreign key (company_id, supplier_invoice_id)
      references public.invoices(company_id, id)
      on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.expenses'::regclass
      and conname = 'expenses_vendor_fk'
  ) then
    alter table public.expenses
      add constraint expenses_vendor_fk
      foreign key (company_id, vendor_id)
      references public.vendors(company_id, id)
      on delete restrict;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.expenses'::regclass
      and conname = 'expenses_purchase_order_fk'
  ) then
    alter table public.expenses
      add constraint expenses_purchase_order_fk
      foreign key (company_id, purchase_order_id)
      references public.purchase_orders(company_id, id)
      on delete restrict;
  end if;
end $$;

create unique index if not exists expenses_company_supplier_invoice_unique
  on public.expenses(company_id, supplier_invoice_id)
  where supplier_invoice_id is not null;
create index if not exists expenses_company_vendor_idx
  on public.expenses(company_id, vendor_id, expense_date desc)
  where vendor_id is not null;
create index if not exists expenses_company_purchase_order_idx
  on public.expenses(company_id, purchase_order_id, expense_date desc)
  where purchase_order_id is not null;
create index if not exists client_billings_company_project_due_idx
  on public.client_billings(company_id, project_id, due_date, updated_at desc);

create or replace function public.validate_supplier_expense_provenance()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.supplier_invoice_id is not null
     and new.supplier_invoice_id is distinct from old.supplier_invoice_id then
    raise exception 'Supplier invoice provenance is immutable after an expense is linked'
      using errcode = '42501';
  end if;
  if new.supplier_invoice_id is not null and not exists (
    select 1 from public.invoices i
    where i.id = new.supplier_invoice_id
      and i.company_id = new.company_id
      and coalesce(i.lifecycle_status, 'ACTIVE') <> 'VOID'
      and coalesce(i.review_status, 'NEEDS_REVIEW') = 'VERIFIED'
  ) then
    raise exception 'Supplier invoice provenance must reference the same company and a verified, non-void invoice'
      using errcode = '42501';
  end if;
  if new.vendor_id is not null and not exists (
    select 1 from public.vendors v
    where v.id = new.vendor_id and v.company_id = new.company_id
  ) then
    raise exception 'Expense vendor provenance is outside the company'
      using errcode = '42501';
  end if;
  if new.purchase_order_id is not null and not exists (
    select 1 from public.purchase_orders po
    where po.id = new.purchase_order_id and po.company_id = new.company_id
  ) then
    raise exception 'Expense purchase order provenance is outside the company'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_supplier_provenance on public.expenses;
create trigger expenses_supplier_provenance
before insert or update on public.expenses
for each row execute function public.validate_supplier_expense_provenance();

-- 2. One authoritative company document profile. The initial values come from
-- the supplied HSC PO template; later edits are admin-controlled and issued
-- snapshots preserve the values used at issuance.
create table if not exists public.company_document_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  legal_name text not null,
  address text,
  contact_number text,
  email text,
  vat_tin text,
  logo_path text,
  payment_instructions text,
  default_terms text,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_document_profiles_company_unique unique (company_id),
  constraint company_document_profiles_legal_name_check check (length(btrim(legal_name)) between 1 and 200)
);

insert into public.company_document_profiles (
  company_id, legal_name, address, contact_number, email, vat_tin, logo_path,
  created_at, updated_at
)
select
  c.id,
  'HydroQualiSense Solutions Corp.',
  '01 Pasong Tulo, Santa Rita Bata, San Miguel, Bulacan',
  '09760721144',
  'hydroqualisensesolutions@gmail.com',
  '777-823-517-000',
  '/brand/hydroqualisense-po-logo.png',
  now(), now()
from public.companies c
on conflict (company_id) do nothing;

drop trigger if exists company_document_profiles_company_boundary on public.company_document_profiles;
create trigger company_document_profiles_company_boundary
before insert or update on public.company_document_profiles
for each row execute function private.enforce_company_row_boundary();

drop trigger if exists company_document_profiles_updated_at on public.company_document_profiles;
create trigger company_document_profiles_updated_at
before update on public.company_document_profiles
for each row execute function private.set_company_updated_at();

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
    new.id,
    'HydroQualiSense Solutions Corp.',
    '01 Pasong Tulo, Santa Rita Bata, San Miguel, Bulacan',
    '09760721144',
    'hydroqualisensesolutions@gmail.com',
    '777-823-517-000',
    '/brand/hydroqualisense-po-logo.png'
  ) on conflict (company_id) do nothing;
  return new;
end;
$$;

drop trigger if exists companies_document_profile_seed on public.companies;
create trigger companies_document_profile_seed
after insert on public.companies
for each row execute function private.seed_company_document_profile();

alter table public.company_document_profiles enable row level security;
drop policy if exists company_document_profiles_select on public.company_document_profiles;
create policy company_document_profiles_select on public.company_document_profiles
for select to authenticated
using (
  (select public.has_company_permission(company_id, 'company.settings.read'))
  or (select public.has_company_permission(company_id, 'company.settings.manage'))
);
drop policy if exists company_document_profiles_insert on public.company_document_profiles;
create policy company_document_profiles_insert on public.company_document_profiles
for insert to authenticated
with check ((select public.has_company_permission(company_id, 'company.settings.manage')));
drop policy if exists company_document_profiles_update on public.company_document_profiles;
create policy company_document_profiles_update on public.company_document_profiles
for update to authenticated
using ((select public.has_company_permission(company_id, 'company.settings.manage')))
with check ((select public.has_company_permission(company_id, 'company.settings.manage')));
revoke delete on table public.company_document_profiles from authenticated;
grant select, insert, update on table public.company_document_profiles to authenticated;

create or replace function public.get_company_document_profile(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile jsonb;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required to read the company document profile' using errcode = '42501';
  end if;
  if p_company_id is null or p_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Document profile must belong to the deployment company' using errcode = '42501';
  end if;
  if not (
    (select private.has_company_permission(p_company_id, 'company.settings.read'))
    or (select private.has_company_permission(p_company_id, 'company.settings.manage'))
  ) then
    raise exception 'Company document profile permission denied' using errcode = '42501';
  end if;
  select to_jsonb(p.*) into v_profile
  from public.company_document_profiles p
  where p.company_id = p_company_id;
  return coalesce(v_profile, jsonb_build_object('company_id', p_company_id));
end;
$$;

create or replace function public.upsert_company_document_profile(p_company_id uuid, p_profile jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_legal_name text := nullif(btrim(coalesce(p_profile->>'legalName', p_profile->>'legal_name', '')), '');
  v_address text := nullif(left(btrim(coalesce(p_profile->>'address', '')), 500), '');
  v_contact_number text := nullif(left(btrim(coalesce(p_profile->>'contactNumber', p_profile->>'contact_number', '')), 100), '');
  v_email text := nullif(left(btrim(coalesce(p_profile->>'email', '')), 200), '');
  v_vat_tin text := nullif(left(btrim(coalesce(p_profile->>'vatTin', p_profile->>'vat_tin', '')), 100), '');
  v_logo_path text := nullif(left(btrim(coalesce(p_profile->>'logoPath', p_profile->>'logo_path', '')), 500), '');
  v_payment_instructions text := nullif(left(btrim(coalesce(p_profile->>'paymentInstructions', p_profile->>'payment_instructions', '')), 1000), '');
  v_default_terms text := nullif(left(btrim(coalesce(p_profile->>'defaultTerms', p_profile->>'default_terms', '')), 2000), '');
  v_row public.company_document_profiles;
begin
  if v_user_id is null then raise exception 'Authentication is required to update the company document profile' using errcode = '42501'; end if;
  if p_company_id is null or p_company_id is distinct from (select private.deployment_company_id()) then raise exception 'Document profile must belong to the deployment company' using errcode = '42501'; end if;
  if not (select private.has_company_permission(p_company_id, 'company.settings.manage')) then raise exception 'Company settings management permission is required' using errcode = '42501'; end if;
  if v_legal_name is null or length(v_legal_name) > 200 then raise exception 'A company document legal name is required' using errcode = '22023'; end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Company document email is invalid' using errcode = '22023'; end if;

  insert into public.company_document_profiles (
    company_id, legal_name, address, contact_number, email, vat_tin, logo_path,
    payment_instructions, default_terms, updated_by_user_id
  ) values (
    p_company_id, v_legal_name, v_address, v_contact_number, v_email, v_vat_tin,
    v_logo_path, v_payment_instructions, v_default_terms, v_user_id
  )
  on conflict (company_id) do update set
    legal_name = excluded.legal_name,
    address = excluded.address,
    contact_number = excluded.contact_number,
    email = excluded.email,
    vat_tin = excluded.vat_tin,
    logo_path = excluded.logo_path,
    payment_instructions = excluded.payment_instructions,
    default_terms = excluded.default_terms,
    updated_by_user_id = excluded.updated_by_user_id;

  select p.* into v_row from public.company_document_profiles p where p.company_id = p_company_id;
  return to_jsonb(v_row);
end;
$$;

revoke all on function public.get_company_document_profile(uuid) from public, anon;
revoke all on function public.upsert_company_document_profile(uuid, jsonb) from public, anon;
grant execute on function public.get_company_document_profile(uuid) to authenticated;
grant execute on function public.upsert_company_document_profile(uuid, jsonb) to authenticated;

-- 3. Immutable document snapshots. The source rows remain authoritative for
-- drafts; these rows preserve exactly what was issued for later rendering or
-- resend even after vendor, project, or company-profile edits.
create table if not exists public.issued_document_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  document_type text not null check (document_type in ('PURCHASE_ORDER', 'CLIENT_INVOICE')),
  document_id uuid not null,
  document_number text not null,
  template_version text not null,
  snapshot jsonb not null,
  storage_path text,
  mime_type text not null default 'application/pdf',
  file_size bigint,
  sha256 text,
  generated_at timestamptz not null default now(),
  generated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint issued_document_snapshots_one_per_document unique (company_id, document_type, document_id),
  constraint issued_document_snapshots_number_check check (length(btrim(document_number)) between 1 and 120)
);

create index if not exists issued_document_snapshots_company_type_idx
  on public.issued_document_snapshots(company_id, document_type, generated_at desc);

drop trigger if exists issued_document_snapshots_company_boundary on public.issued_document_snapshots;
create trigger issued_document_snapshots_company_boundary
before insert on public.issued_document_snapshots
for each row execute function private.enforce_company_row_boundary();

create or replace function public.validate_issued_document_snapshot_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.document_type = 'PURCHASE_ORDER' and not exists (
    select 1 from public.purchase_orders po where po.id = new.document_id and po.company_id = new.company_id and po.status in ('ISSUED', 'CLOSED', 'CANCELLED')
  ) then
    raise exception 'Purchase order snapshot is outside the company or was not issued' using errcode = '42501';
  end if;
  if new.document_type = 'CLIENT_INVOICE' and not exists (
    select 1 from public.client_billings b where b.id = new.document_id and b.company_id = new.company_id and b.status in ('ISSUED', 'VOIDED')
  ) then
    raise exception 'Client invoice snapshot is outside the company or was not issued' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists issued_document_snapshots_scope on public.issued_document_snapshots;
create trigger issued_document_snapshots_scope
before insert on public.issued_document_snapshots
for each row execute function public.validate_issued_document_snapshot_scope();

create or replace function private.prevent_issued_document_snapshot_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Issued document snapshots are immutable; issue a corrected document through the existing correction lifecycle'
    using errcode = '42501';
end;
$$;

drop trigger if exists issued_document_snapshots_immutable on public.issued_document_snapshots;
create trigger issued_document_snapshots_immutable
before update or delete on public.issued_document_snapshots
for each row execute function private.prevent_issued_document_snapshot_mutation();

alter table public.issued_document_snapshots enable row level security;
drop policy if exists issued_document_snapshots_select on public.issued_document_snapshots;
create policy issued_document_snapshots_select on public.issued_document_snapshots
for select to authenticated
using (
  (document_type = 'PURCHASE_ORDER' and (select public.has_company_permission(company_id, 'procurement.read')))
  or (document_type = 'CLIENT_INVOICE' and (select public.has_company_permission(company_id, 'projects.read')))
);
revoke all on table public.issued_document_snapshots from public, anon, authenticated;
grant select on table public.issued_document_snapshots to authenticated;

-- Snapshot builders are private so only the permission-checked wrappers and
-- issuance triggers can create rows.
create or replace function private.ensure_purchase_order_document_snapshot(
  p_purchase_order_id uuid,
  p_processor_name text default null,
  p_processor_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_po public.purchase_orders;
  v_vendor public.vendors;
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
  select po.* into v_po from public.purchase_orders po where po.id = p_purchase_order_id for update;
  if not found then raise exception 'Purchase order was not found' using errcode = '23503'; end if;
  if v_po.status not in ('ISSUED', 'CLOSED') then raise exception 'Only issued purchase orders can have an issued document snapshot' using errcode = '42501'; end if;
  select c.* into v_company from public.companies c where c.id = v_po.company_id;
  select v.* into v_vendor from public.vendors v where v.id = v_po.vendor_id and v.company_id = v_po.company_id;
  select p.* into v_project from public.projects p where p.id = v_po.project_id and p.company_id = v_po.company_id;
  select p.* into v_profile from public.company_document_profiles p where p.company_id = v_po.company_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'lineNumber', l.line_number, 'description', l.description, 'quantity', l.quantity,
    'unit', l.unit, 'unitPrice', l.unit_price, 'amount', l.amount,
    'projectCostCodeId', l.project_cost_code_id
  ) order by l.line_number), '[]'::jsonb), coalesce(sum(l.amount), 0)::numeric(18,2)
  into v_lines, v_total
  from public.purchase_order_lines l
  where l.company_id = v_po.company_id and l.purchase_order_id = v_po.id;

  select p.* into v_processor from public.profiles p where p.id = coalesce(v_po.issued_by_user_id, (select auth.uid()));
  v_processor_name := coalesce(nullif(btrim(p_processor_name), ''), nullif(btrim(v_processor.full_name), ''), 'Authorized Purchasing User');
  v_processor_title := nullif(btrim(p_processor_title), '');
  v_snapshot := jsonb_build_object(
    'documentType', 'PURCHASE_ORDER', 'documentNumber', v_po.po_number,
    'status', 'ISSUED', 'issueDate', v_po.issue_date, 'currency', v_po.currency,
    'description', v_po.description, 'notes', v_po.notes,
    'termsAndConditions', v_profile.default_terms,
    'company', jsonb_build_object(
      'legalName', coalesce(v_profile.legal_name, v_company.name),
      'address', v_profile.address, 'contactNumber', v_profile.contact_number,
      'email', v_profile.email, 'vatTin', v_profile.vat_tin, 'logoPath', v_profile.logo_path
    ),
    'supplier', jsonb_build_object(
      'name', v_vendor.name, 'address', v_vendor.address, 'email', v_vendor.email,
      'phone', v_vendor.phone, 'vatTin', v_vendor.tax_id
    ),
    'project', jsonb_build_object(
      'id', v_project.id, 'projectCode', v_project.project_code, 'projectName', v_project.project_name,
      'deliverTo', coalesce(v_project.site_address, v_project.location)
    ),
    'lines', v_lines, 'totalAmount', v_total,
    'processor', jsonb_build_object('name', v_processor_name, 'title', v_processor_title),
    'templateVersion', 'HSC-PO-v1'
  );
  select s.id, s.snapshot into v_snapshot_id, v_existing_snapshot
  from public.issued_document_snapshots s
  where s.company_id = v_po.company_id and s.document_type = 'PURCHASE_ORDER' and s.document_id = v_po.id;
  if v_snapshot_id is not null then
    return jsonb_build_object('id', v_snapshot_id, 'companyId', v_po.company_id, 'documentType', 'PURCHASE_ORDER', 'documentId', v_po.id, 'documentNumber', v_po.po_number, 'templateVersion', 'HSC-PO-v1', 'snapshot', v_existing_snapshot);
  end if;
  if v_snapshot_id is null then
    insert into public.issued_document_snapshots (
      company_id, document_type, document_id, document_number, template_version,
      snapshot, generated_by_user_id
    ) values (
      v_po.company_id, 'PURCHASE_ORDER', v_po.id, v_po.po_number, 'HSC-PO-v1',
      v_snapshot, coalesce(v_po.issued_by_user_id, (select auth.uid()))
    ) on conflict (company_id, document_type, document_id) do nothing
    returning id into v_snapshot_id;
    if v_snapshot_id is null then
      select s.id, s.snapshot into v_snapshot_id, v_existing_snapshot
      from public.issued_document_snapshots s
      where s.company_id = v_po.company_id and s.document_type = 'PURCHASE_ORDER' and s.document_id = v_po.id;
      return jsonb_build_object('id', v_snapshot_id, 'companyId', v_po.company_id, 'documentType', 'PURCHASE_ORDER', 'documentId', v_po.id, 'documentNumber', v_po.po_number, 'templateVersion', 'HSC-PO-v1', 'snapshot', v_existing_snapshot);
    end if;
  end if;
  return jsonb_build_object('id', v_snapshot_id, 'companyId', v_po.company_id, 'documentType', 'PURCHASE_ORDER', 'documentId', v_po.id, 'documentNumber', v_po.po_number, 'templateVersion', 'HSC-PO-v1', 'snapshot', v_snapshot);
end;
$$;

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
  select b.* into v_billing from public.client_billings b where b.id = p_client_billing_id for update;
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
  if v_snapshot_id is null then
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
  end if;
  return jsonb_build_object('id', v_snapshot_id, 'companyId', v_billing.company_id, 'documentType', 'CLIENT_INVOICE', 'documentId', v_billing.id, 'documentNumber', v_billing.billing_number, 'templateVersion', 'HSC-CLIENT-INVOICE-v1', 'snapshot', v_snapshot);
end;
$$;

create or replace function public.create_purchase_order_document_snapshot(
  p_purchase_order_id uuid,
  p_processor_name text default null,
  p_processor_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_company_id uuid;
begin
  select company_id into v_company_id from public.purchase_orders where id = p_purchase_order_id;
  if not found then raise exception 'Purchase order was not found' using errcode = '23503'; end if;
  if not (select private.has_company_permission(v_company_id, 'procurement.read')) then raise exception 'Purchase order document permission denied' using errcode = '42501'; end if;
  if (p_processor_name is not null or p_processor_title is not null) and not (select private.has_company_permission(v_company_id, 'procurement.manage')) then raise exception 'Processor override requires procurement management permission' using errcode = '42501'; end if;
  return private.ensure_purchase_order_document_snapshot(p_purchase_order_id, p_processor_name, p_processor_title);
end;
$$;

create or replace function public.create_client_invoice_document_snapshot(
  p_client_billing_id uuid,
  p_processor_name text default null,
  p_processor_title text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_company_id uuid;
begin
  select company_id into v_company_id from public.client_billings where id = p_client_billing_id;
  if not found then raise exception 'Client invoice was not found' using errcode = '23503'; end if;
  if not (select private.has_company_permission(v_company_id, 'projects.read')) then raise exception 'Client invoice document permission denied' using errcode = '42501'; end if;
  if (p_processor_name is not null or p_processor_title is not null) and not (select private.has_company_permission(v_company_id, 'projects.manage')) then raise exception 'Processor override requires project management permission' using errcode = '42501'; end if;
  return private.ensure_client_invoice_document_snapshot(p_client_billing_id, p_processor_name, p_processor_title);
end;
$$;

-- Capture the first snapshot in the same transaction as issuance. The public
-- wrappers remain useful for already-issued records and future rendering.
create or replace function private.capture_purchase_order_issued_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'ISSUED' then
    if tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.status is distinct from new.status) then
      perform private.ensure_purchase_order_document_snapshot(new.id, null, null);
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.capture_client_invoice_issued_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'ISSUED' then
    if tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.status is distinct from new.status) then
      perform private.ensure_client_invoice_document_snapshot(new.id, null, null);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists purchase_orders_issued_document_snapshot on public.purchase_orders;
create trigger purchase_orders_issued_document_snapshot
after insert or update on public.purchase_orders
for each row execute function private.capture_purchase_order_issued_snapshot();
drop trigger if exists client_billings_issued_document_snapshot on public.client_billings;
create trigger client_billings_issued_document_snapshot
after insert or update on public.client_billings
for each row execute function private.capture_client_invoice_issued_snapshot();

revoke execute on function private.ensure_purchase_order_document_snapshot(uuid, text, text) from public, anon, authenticated;
revoke execute on function private.ensure_client_invoice_document_snapshot(uuid, text, text) from public, anon, authenticated;
revoke execute on function private.capture_purchase_order_issued_snapshot() from public, anon, authenticated;
revoke execute on function private.capture_client_invoice_issued_snapshot() from public, anon, authenticated;
revoke all on function public.create_purchase_order_document_snapshot(uuid, text, text) from public, anon;
revoke all on function public.create_client_invoice_document_snapshot(uuid, text, text) from public, anon;
grant execute on function public.create_purchase_order_document_snapshot(uuid, text, text) to authenticated;
grant execute on function public.create_client_invoice_document_snapshot(uuid, text, text) to authenticated;

-- 4. Verification is one transaction: verify the source invoice and create
-- exactly one draft Expense that owns the future supplier payable/cost.
create or replace function private.document_party_name_key(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(regexp_replace(
    regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', ' ', 'g'),
    '\m(inc|incorporated|corp|corporation|company|co|ltd|limited)\M', ' ', 'g'
  ));
$$;

create or replace function public.verify_supplier_invoice_and_create_expense(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_invoice public.invoices;
  v_expense public.expenses;
  v_company_id uuid;
  v_category text;
  v_vendor_name text;
  v_description text;
  v_project_id uuid;
  v_cost_code_id uuid;
  v_po_id uuid;
  v_allocation_count integer := 0;
  v_expected_buyer_name text;
  v_actual_buyer_name text;
  v_expected_buyer_tin text;
  v_actual_buyer_tin text;
  v_verified_at timestamptz;
  v_updated_at timestamptz;
begin
  if v_user_id is null then raise exception 'Authentication is required to verify supplier invoices' using errcode = '42501'; end if;
  select i.* into v_invoice from public.invoices i where i.id = p_invoice_id for update;
  if not found then raise exception 'Supplier invoice was not found' using errcode = '23503'; end if;
  v_company_id := v_invoice.company_id;
  if not (select private.has_company_permission(v_company_id, 'invoices.verify')) then raise exception 'Invoice verification permission is required' using errcode = '42501'; end if;
  if not (select private.has_company_permission(v_company_id, 'expenses.manage')) then raise exception 'Expense management permission is required to verify a supplier invoice' using errcode = '42501'; end if;
  if coalesce(v_invoice.lifecycle_status, 'ACTIVE') = 'VOID' then raise exception 'Voided supplier invoices cannot be verified' using errcode = '42501'; end if;
  select coalesce(p.legal_name, c.name), p.vat_tin
    into v_expected_buyer_name, v_expected_buyer_tin
  from public.companies c
  left join public.company_document_profiles p on p.company_id = c.id
  where c.id = v_company_id;
  v_actual_buyer_name := nullif(btrim(coalesce(v_invoice.current_data->'customer'->>'registeredName', v_invoice.current_data->'customer'->>'companyName', v_invoice.current_data->'customer'->>'name')), '');
  v_actual_buyer_tin := nullif(regexp_replace(coalesce(v_invoice.current_data->'customer'->>'taxId', ''), '\D', '', 'g'), '');
  v_expected_buyer_tin := nullif(regexp_replace(coalesce(v_expected_buyer_tin, ''), '\D', '', 'g'), '');
  if v_actual_buyer_name is not null and private.document_party_name_key(v_actual_buyer_name) <> '' and private.document_party_name_key(v_expected_buyer_name) <> ''
     and position(private.document_party_name_key(v_actual_buyer_name) in private.document_party_name_key(v_expected_buyer_name)) = 0
     and position(private.document_party_name_key(v_expected_buyer_name) in private.document_party_name_key(v_actual_buyer_name)) = 0 then
    raise exception 'Buyer mismatch: the supplier invoice appears to be issued to another company' using errcode = '23514';
  end if;
  if v_actual_buyer_tin is not null and v_expected_buyer_tin is not null and v_actual_buyer_tin <> v_expected_buyer_tin then
    raise exception 'Buyer mismatch: the supplier invoice TIN does not match the deployment company' using errcode = '23514';
  end if;

  select e.* into v_expense
  from public.expenses e
  where e.company_id = v_company_id and e.supplier_invoice_id = v_invoice.id
  for update;
  if found then
    if v_expense.status = 'VOID' then raise exception 'The linked Expense is VOID; use the Expense correction workflow before re-verifying' using errcode = '42501'; end if;
    if v_invoice.review_status <> 'VERIFIED' or v_invoice.current_data->>'linkedExpenseId' is distinct from v_expense.id::text then
      update public.invoices
      set current_data = jsonb_set(coalesce(current_data, '{}'::jsonb), '{linkedExpenseId}', to_jsonb(v_expense.id), true),
          review_status = 'VERIFIED', verified_at = coalesce(verified_at, now()), updated_at = now()
      where id = v_invoice.id and company_id = v_company_id;
    end if;
    select i.verified_at, i.updated_at into v_verified_at, v_updated_at from public.invoices i where i.id = v_invoice.id;
    return jsonb_build_object('invoiceId', v_invoice.id, 'reviewStatus', 'VERIFIED', 'verifiedAt', v_verified_at, 'updatedAt', v_updated_at, 'expense', to_jsonb(v_expense), 'idempotent', true);
  end if;

  v_vendor_name := coalesce(nullif(btrim(v_invoice.current_data->'vendor'->>'name'), ''), 'Supplier');
  v_category := coalesce(nullif(btrim(v_invoice.current_data->>'category'), ''), 'Miscellaneous');
  v_description := coalesce(nullif(btrim(v_invoice.current_data->>'description'), ''), format('Supplier invoice %s', coalesce(nullif(btrim(v_invoice.invoice_number), ''), left(v_invoice.id::text, 8))));

  select count(*)::integer into v_allocation_count
  from public.invoice_project_allocations a
  where a.company_id = v_company_id and a.invoice_id = v_invoice.id and coalesce(a.allocation_amount, 0) > 0;
  if v_allocation_count = 1 then
    select a.project_id, a.project_cost_code_id into v_project_id, v_cost_code_id
    from public.invoice_project_allocations a
    where a.company_id = v_company_id and a.invoice_id = v_invoice.id and coalesce(a.allocation_amount, 0) > 0
    order by a.created_at asc limit 1;
  end if;
  select m.purchase_order_id into v_po_id
  from public.purchase_order_invoice_matches m
  where m.company_id = v_company_id and m.invoice_id = v_invoice.id and m.status = 'CONFIRMED'
  order by m.confirmed_at desc nulls last, m.created_at desc limit 1;

  -- The provenance trigger intentionally accepts only verified supplier
  -- invoices. Move the invoice into the verified state inside this same
  -- transaction before attaching the Expense; any later failure rolls back
  -- both changes together.
  update public.invoices
  set review_status = 'VERIFIED', verified_at = coalesce(verified_at, now()), updated_at = now()
  where id = v_invoice.id and company_id = v_company_id;

  insert into public.expenses (
    id, user_id, company_id, project_id, project_cost_code_id, expense_date,
    category, description, payee, amount, currency, reference_number, status,
    supplier_invoice_id, vendor_id, purchase_order_id, notes
  ) values (
    gen_random_uuid(), v_user_id, v_company_id, v_project_id, v_cost_code_id,
    coalesce(v_invoice.invoice_date, current_date), v_category, v_description,
    v_vendor_name, greatest(coalesce(v_invoice.grand_total, 0), 0),
    upper(coalesce(nullif(btrim(v_invoice.currency), ''), 'PHP')),
    nullif(btrim(v_invoice.invoice_number), ''), 'DRAFT', v_invoice.id,
    v_invoice.vendor_id, v_po_id,
    format('Authoritative supplier payable created from preserved supplier invoice %s.', coalesce(nullif(btrim(v_invoice.invoice_number), ''), v_invoice.id::text))
  ) returning * into v_expense;

  update public.invoices
  set current_data = jsonb_set(coalesce(current_data, '{}'::jsonb), '{linkedExpenseId}', to_jsonb(v_expense.id), true),
      review_status = 'VERIFIED', verified_at = coalesce(verified_at, now()), updated_at = now()
  where id = v_invoice.id and company_id = v_company_id;
  select i.verified_at, i.updated_at into v_verified_at, v_updated_at from public.invoices i where i.id = v_invoice.id;
  insert into public.invoice_review_events (
    user_id, company_id, invoice_id, event_type, new_value
  ) values (
    v_user_id, v_company_id, v_invoice.id, 'VERIFIED_WITH_EXPENSE',
    jsonb_build_object('expenseId', v_expense.id, 'purchaseOrderId', v_po_id, 'projectId', v_project_id)
  );
  return jsonb_build_object('invoiceId', v_invoice.id, 'reviewStatus', 'VERIFIED', 'verifiedAt', v_verified_at, 'updatedAt', v_updated_at, 'expense', to_jsonb(v_expense), 'idempotent', false);
end;
$$;

revoke all on function public.verify_supplier_invoice_and_create_expense(uuid) from public, anon;
grant execute on function public.verify_supplier_invoice_and_create_expense(uuid) to authenticated;

-- 5. Supplier invoices linked to an Expense no longer expose a second cash
-- settlement basis. Existing legacy invoices without this relationship keep
-- their prior settlement semantics.
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
  if exists (
    select 1 from public.expenses e
    where e.company_id = p_company_id and e.supplier_invoice_id = p_invoice_id and e.status <> 'VOID'
  ) then return 0; end if;
  select greatest(round(coalesce(i.grand_total, 0), 2), 0), i.current_data into v_total, v_current
  from public.invoices i where i.id = p_invoice_id and i.company_id = p_company_id;
  if not found then return null; end if;
  v_top_net_text := v_current->>'netAmountPayable';
  if v_top_net_text is not null and v_top_net_text ~ '^[-+]?[0-9]+([.][0-9]+)?$' then v_top_net := v_top_net_text::numeric; end if;
  if v_top_net is not null and v_top_net > 0 and v_top_net <= v_total + 0.01 then return least(round(v_top_net, 2), v_total); end if;
  v_nested_net_text := v_current->'philippineTaxDetails'->>'netAmountPayable';
  v_withholding_text := coalesce(v_current->>'withholdingTaxAmount', v_current->'philippineTaxDetails'->>'withholdingTaxAmount');
  if v_nested_net_text is not null and v_nested_net_text ~ '^[-+]?[0-9]+([.][0-9]+)?$' then v_nested_net := v_nested_net_text::numeric; end if;
  if v_withholding_text is not null and v_withholding_text ~ '^[-+]?[0-9]+([.][0-9]+)?$' then v_withholding := v_withholding_text::numeric; end if;
  if v_nested_net is not null and v_nested_net > 0 and v_nested_net <= v_total + 0.01 and v_withholding is not null and v_withholding > 0 then return least(round(v_nested_net, 2), v_total); end if;
  return v_total;
end;
$$;

-- Keep the latest cash-summary RBAC/overdue contract while making transferred
-- invoice ownership explicit to callers.
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
  v_due_date date;
  v_document_paid numeric := 0;
  v_cash_paid numeric := 0;
  v_effective numeric := 0;
  v_history jsonb := '[]'::jsonb;
  v_permission text;
  v_can_read_cash boolean := false;
  v_transferred boolean := false;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='42501'; end if;
  v_permission := case p_target_type when 'INVOICE' then 'invoices.read' when 'PAYROLL' then 'payroll.summary.read' when 'EXPENSE' then 'expenses.read' else null end;
  if v_permission is null or not (select private.has_company_permission(p_company_id, v_permission)) then raise exception 'Settlement summary permission denied' using errcode='42501'; end if;
  v_can_read_cash := (select private.has_company_permission(p_company_id, 'cash.transactions.read'));

  if p_target_type='INVOICE' then
    select i.currency, i.review_status, i.due_date,
      case when coalesce(i.current_data->>'amountPaid','') ~ '^[-+]?[0-9]+([.][0-9]+)?$' then (i.current_data->>'amountPaid')::numeric else 0 end
      into v_currency,v_lifecycle,v_due_date,v_document_paid
    from public.invoices i where i.id=p_target_id and i.company_id=p_company_id;
    if not found then raise exception 'Invoice unavailable' using errcode='42501'; end if;
    v_transferred := exists(select 1 from public.expenses e where e.company_id=p_company_id and e.supplier_invoice_id=p_target_id and e.status <> 'VOID');
    if v_transferred then v_lifecycle := 'TRANSFERRED_TO_EXPENSE'; v_basis := 0; else v_basis := private.invoice_cash_payable_basis(p_target_id,p_company_id); end if;
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

  select coalesce(sum(m.matched_amount) filter (where m.status='CONFIRMED'),0) into v_cash_paid
  from public.financial_transaction_matches m
  where m.company_id=p_company_id and m.target_type=p_target_type and m.target_id=p_target_id;
  if v_can_read_cash then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',m.id,'transactionId',m.transaction_id,'status',m.status,'amount',m.matched_amount,
      'confirmedAt',m.confirmed_at,'confirmedByUserId',m.confirmed_by_user_id,
      'reversedAt',m.reversed_at,'reversedByUserId',m.reversed_by_user_id,'reversalReason',m.reversal_reason,
      'confirmationSource',m.confirmation_source,'accountId',ft.account_id,'accountName',fa.display_name,
      'accountType',fa.account_type,'maskedIdentifier',fa.masked_identifier,'transactionDate',ft.transaction_date,
      'referenceNumber',ft.reference_number,'description',ft.description,'currency',ft.currency
    ) order by coalesce(m.confirmed_at,m.created_at) desc),'[]'::jsonb) into v_history
    from public.financial_transaction_matches m
    join public.financial_transactions ft on ft.id=m.transaction_id and ft.company_id=m.company_id
    join public.financial_accounts fa on fa.id=ft.account_id and fa.company_id=ft.company_id
    where m.company_id=p_company_id and m.target_type=p_target_type and m.target_id=p_target_id and m.status in ('CONFIRMED','REVERSED');
  end if;
  v_document_paid := least(v_basis, greatest(coalesce(v_document_paid,0),0));
  v_cash_paid := least(v_basis, greatest(coalesce(v_cash_paid,0),0));
  v_effective := case when p_target_type='INVOICE' then greatest(v_document_paid,v_cash_paid) else v_cash_paid end;
  return jsonb_build_object(
    'targetType',p_target_type,'targetId',p_target_id,'currency',v_currency,'lifecycleStatus',v_lifecycle,
    'settlementBasis',round(coalesce(v_basis,0),2),'reconciledCashPaid',round(v_cash_paid,2),
    'documentReportedPaid',case when p_target_type='INVOICE' then round(v_document_paid,2) else 0 end,
    'effectiveSettled',round(v_effective,2),'outstanding',round(greatest(v_basis-v_effective,0),2),
    'settlementState',case
      when v_transferred then 'TRANSFERRED_TO_EXPENSE'
      when p_target_type='PAYROLL' and v_cash_paid<=0.005 then 'UNSETTLED'
      when p_target_type='PAYROLL' and v_cash_paid>=v_basis-0.005 then 'SETTLED'
      when p_target_type='PAYROLL' then 'PARTIALLY_DISBURSED'
      when v_effective>=v_basis-0.005 then 'PAID'
      when p_target_type='INVOICE' and v_due_date is not null and v_due_date < current_date and v_effective < v_basis-0.005 then 'OVERDUE'
      when v_effective>0.005 then 'PARTIALLY_PAID' else 'UNPAID' end,
    'basisSource',case when v_transferred then 'SUPPLIER_EXPENSE' when p_target_type='INVOICE' and private.invoice_cash_payable_basis(p_target_id,p_company_id) <> (select i.grand_total from public.invoices i where i.id=p_target_id) then 'EXPLICIT_NET_PAYABLE' when p_target_type='PAYROLL' then 'EMPLOYEE_NET_PAY' when p_target_type='EXPENSE' then 'EXPENSE_AMOUNT' else 'GROSS_DOCUMENT_AMOUNT' end,
    'legacyPaidWithoutBankLink',p_target_type='PAYROLL' and v_lifecycle='PAID' and v_cash_paid<=0.005,
    'historyRedacted',not v_can_read_cash,'history',v_history
  );
end;
$$;

revoke execute on function private.invoice_cash_payable_basis(uuid,uuid) from public, anon, authenticated;
revoke all on function public.get_financial_settlement_summary(uuid,text,uuid) from public, anon;
grant execute on function public.get_financial_settlement_summary(uuid,text,uuid) to authenticated;

-- Send audit is append-only and stores evidence, never OAuth credentials.
create table if not exists public.document_send_audits (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  snapshot_id uuid not null references public.issued_document_snapshots(id) on delete restrict,
  document_type text not null check (document_type in ('PURCHASE_ORDER', 'CLIENT_INVOICE')),
  document_id uuid not null,
  sender_user_id uuid not null references auth.users(id) on delete restrict,
  recipients jsonb not null default '[]'::jsonb,
  cc jsonb not null default '[]'::jsonb,
  subject text not null,
  attachment_name text not null,
  attachment_sha256 text,
  gmail_message_id text,
  status text not null check (status in ('SENT', 'FAILED')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists document_send_audits_company_document_idx
  on public.document_send_audits(company_id, document_type, document_id, created_at desc);

drop trigger if exists document_send_audits_company_boundary on public.document_send_audits;
create trigger document_send_audits_company_boundary
before insert on public.document_send_audits
for each row execute function private.enforce_company_row_boundary();

create or replace function public.validate_document_send_audit_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or new.sender_user_id is distinct from (select auth.uid()) then
    raise exception 'Document send audit actor must be the authenticated sender' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.issued_document_snapshots s
    where s.id = new.snapshot_id and s.company_id = new.company_id
      and s.document_type = new.document_type and s.document_id = new.document_id
  ) then
    raise exception 'Document send audit must reference the same company-scoped immutable snapshot' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists document_send_audits_scope on public.document_send_audits;
create trigger document_send_audits_scope
before insert on public.document_send_audits
for each row execute function public.validate_document_send_audit_scope();
alter table public.document_send_audits enable row level security;
drop policy if exists document_send_audits_select on public.document_send_audits;
create policy document_send_audits_select on public.document_send_audits
for select to authenticated
using (
  (select public.has_company_permission(company_id, 'gmail.read'))
  and ((document_type = 'PURCHASE_ORDER' and (select public.has_company_permission(company_id, 'procurement.read')))
    or (document_type = 'CLIENT_INVOICE' and (select public.has_company_permission(company_id, 'projects.read'))))
);
drop policy if exists document_send_audits_insert on public.document_send_audits;
create policy document_send_audits_insert on public.document_send_audits
for insert to authenticated
with check ((select public.has_company_permission(company_id, 'gmail.manage')));
revoke update, delete on table public.document_send_audits from authenticated;
grant select, insert on table public.document_send_audits to authenticated;

-- Keep trigger functions private and inaccessible as public SQL entry points.
revoke execute on function public.validate_supplier_expense_provenance() from public, anon, authenticated;
revoke execute on function private.prevent_issued_document_snapshot_mutation() from public, anon, authenticated;
revoke execute on function public.validate_issued_document_snapshot_scope() from public, anon, authenticated;
revoke execute on function public.validate_document_send_audit_scope() from public, anon, authenticated;
revoke execute on function private.document_party_name_key(text) from public, anon, authenticated;
revoke execute on function private.seed_company_document_profile() from public, anon, authenticated;

-- The collection-settlement migration owns the latest four-target summary.
-- Reapply that complete shape here while adding the supplier-invoice transfer
-- state; omitting CLIENT_COLLECTION would regress the existing cash contract.
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
  v_due_date date;
  v_document_paid numeric := 0;
  v_cash_paid numeric := 0;
  v_effective numeric := 0;
  v_history jsonb := '[]'::jsonb;
  v_permission text;
  v_can_read_cash boolean := false;
  v_target_type text := upper(btrim(coalesce(p_target_type, '')));
  v_transferred boolean := false;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  v_permission := case v_target_type
    when 'INVOICE' then 'invoices.read'
    when 'PAYROLL' then 'payroll.summary.read'
    when 'EXPENSE' then 'expenses.read'
    when 'CLIENT_COLLECTION' then 'projects.read'
    else null
  end;
  if v_permission is null or not (select private.has_company_permission(p_company_id, v_permission)) then raise exception 'Settlement summary permission denied' using errcode = '42501'; end if;
  v_can_read_cash := (select private.has_company_permission(p_company_id, 'cash.transactions.read'));

  if v_target_type = 'INVOICE' then
    select i.currency, case when i.lifecycle_status = 'VOID' then 'VOID' else i.review_status end, i.due_date,
      case when coalesce(i.current_data ->> 'amountPaid', '') ~ '^[-+]?[0-9]+([.][0-9]+)?$' then (i.current_data ->> 'amountPaid')::numeric else 0 end
      into v_currency, v_lifecycle, v_due_date, v_document_paid
    from public.invoices i where i.id = p_target_id and i.company_id = p_company_id;
    if not found then raise exception 'Invoice unavailable' using errcode = '42501'; end if;
    v_transferred := exists(select 1 from public.expenses e where e.company_id = p_company_id and e.supplier_invoice_id = p_target_id and e.status <> 'VOID');
    if v_transferred then v_lifecycle := 'TRANSFERRED_TO_EXPENSE'; v_basis := 0; else v_basis := private.invoice_cash_payable_basis(p_target_id, p_company_id); end if;
  elsif v_target_type = 'PAYROLL' then
    select c.default_currency, pr.status into v_currency, v_lifecycle
    from public.payroll_runs pr join public.companies c on c.id = pr.company_id
    where pr.id = p_target_id and pr.company_id = p_company_id;
    if not found then raise exception 'Payroll run unavailable' using errcode = '42501'; end if;
    v_basis := private.payroll_net_pay_basis(p_target_id, p_company_id);
  elsif v_target_type = 'EXPENSE' then
    select e.currency, e.status, e.amount into v_currency, v_lifecycle, v_basis
    from public.expenses e where e.id = p_target_id and e.company_id = p_company_id;
    if not found then raise exception 'Expense unavailable' using errcode = '42501'; end if;
  elsif v_target_type = 'CLIENT_COLLECTION' then
    select c.currency, c.status into v_currency, v_lifecycle
    from public.client_collections c where c.id = p_target_id and c.company_id = p_company_id;
    if not found then raise exception 'Client collection unavailable' using errcode = '42501'; end if;
    select coalesce(sum(a.amount), 0)::numeric(20,2) into v_basis
    from public.client_collection_allocations a where a.company_id = p_company_id and a.collection_id = p_target_id;
  else
    raise exception 'Unsupported settlement target type' using errcode = '22023';
  end if;

  select coalesce(sum(m.matched_amount) filter (where m.status = 'CONFIRMED'), 0) into v_cash_paid
  from public.financial_transaction_matches m
  where m.company_id = p_company_id and m.target_type = v_target_type and m.target_id = p_target_id;
  if v_can_read_cash then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'transactionId', m.transaction_id, 'status', m.status, 'amount', m.matched_amount,
      'confirmedAt', m.confirmed_at, 'confirmedByUserId', m.confirmed_by_user_id,
      'reversedAt', m.reversed_at, 'reversedByUserId', m.reversed_by_user_id, 'reversalReason', m.reversal_reason,
      'confirmationSource', m.confirmation_source, 'accountId', ft.account_id, 'accountName', fa.display_name,
      'accountType', fa.account_type, 'maskedIdentifier', fa.masked_identifier, 'transactionDate', ft.transaction_date,
      'referenceNumber', ft.reference_number, 'description', ft.description, 'currency', ft.currency
    ) order by coalesce(m.confirmed_at, m.created_at) desc), '[]'::jsonb) into v_history
    from public.financial_transaction_matches m
    join public.financial_transactions ft on ft.id = m.transaction_id and ft.company_id = m.company_id
    join public.financial_accounts fa on fa.id = ft.account_id and fa.company_id = ft.company_id
    where m.company_id = p_company_id and m.target_type = v_target_type and m.target_id = p_target_id and m.status in ('CONFIRMED', 'REVERSED');
  end if;
  v_document_paid := least(v_basis, greatest(coalesce(v_document_paid, 0), 0));
  v_cash_paid := least(v_basis, greatest(coalesce(v_cash_paid, 0), 0));
  v_effective := case when v_target_type = 'INVOICE' then greatest(v_document_paid, v_cash_paid) else v_cash_paid end;
  return jsonb_build_object(
    'targetType', v_target_type, 'targetId', p_target_id, 'currency', v_currency, 'lifecycleStatus', v_lifecycle,
    'settlementBasis', round(coalesce(v_basis, 0), 2), 'reconciledCashPaid', round(v_cash_paid, 2),
    'documentReportedPaid', case when v_target_type = 'INVOICE' then round(v_document_paid, 2) else 0 end,
    'effectiveSettled', round(v_effective, 2), 'outstanding', round(greatest(v_basis - v_effective, 0), 2),
    'settlementState', case
      when v_transferred then 'TRANSFERRED_TO_EXPENSE'
      when v_target_type = 'CLIENT_COLLECTION' and v_cash_paid <= 0.005 then 'UNLINKED'
      when v_target_type = 'CLIENT_COLLECTION' and v_cash_paid >= v_basis - 0.005 then 'LINKED'
      when v_target_type = 'CLIENT_COLLECTION' then 'PARTIALLY_LINKED'
      when v_lifecycle = 'VOID' then 'VOID'
      when v_target_type = 'PAYROLL' and v_cash_paid <= 0.005 then 'UNSETTLED'
      when v_target_type = 'PAYROLL' and v_cash_paid >= v_basis - 0.005 then 'SETTLED'
      when v_target_type = 'PAYROLL' then 'PARTIALLY_DISBURSED'
      when v_effective >= v_basis - 0.005 then 'PAID'
      when v_target_type = 'INVOICE' and v_due_date is not null and v_due_date < current_date and v_effective < v_basis - 0.005 then 'OVERDUE'
      when v_effective > 0.005 then 'PARTIALLY_PAID' else 'UNPAID' end,
    'basisSource', case
      when v_transferred then 'SUPPLIER_EXPENSE'
      when v_target_type = 'CLIENT_COLLECTION' then 'CLIENT_COLLECTION_ALLOCATIONS'
      when v_target_type = 'INVOICE' and private.invoice_cash_payable_basis(p_target_id, p_company_id) <> (select i.grand_total from public.invoices i where i.id = p_target_id) then 'EXPLICIT_NET_PAYABLE'
      when v_target_type = 'PAYROLL' then 'EMPLOYEE_NET_PAY'
      when v_target_type = 'EXPENSE' then 'EXPENSE_AMOUNT'
      else 'GROSS_DOCUMENT_AMOUNT' end,
    'legacyPaidWithoutBankLink', v_target_type = 'PAYROLL' and v_lifecycle = 'PAID' and v_cash_paid <= 0.005,
    'historyRedacted', not v_can_read_cash,
    'collectionTotal', case when v_target_type = 'CLIENT_COLLECTION' then round(v_basis, 2) else null end,
    'linkedAmount', case when v_target_type = 'CLIENT_COLLECTION' then round(v_cash_paid, 2) else null end,
    'remainingUnlinkedAmount', case when v_target_type = 'CLIENT_COLLECTION' then round(greatest(v_basis - v_cash_paid, 0), 2) else null end,
    'linkState', case when v_target_type <> 'CLIENT_COLLECTION' then null when v_cash_paid <= 0.005 then 'UNLINKED' when v_cash_paid >= v_basis - 0.005 then 'LINKED' else 'PARTIALLY_LINKED' end,
    'history', v_history
  );
end;
$$;
revoke all on function public.get_financial_settlement_summary(uuid, text, uuid) from public, anon;
grant execute on function public.get_financial_settlement_summary(uuid, text, uuid) to authenticated;
