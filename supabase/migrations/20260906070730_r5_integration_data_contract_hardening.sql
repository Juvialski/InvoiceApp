-- HydroQualiSense R5: cross-module identity, financial truth, and retry safety.
-- This migration is forward-only. It keeps historical source records while
-- moving consequential mutations behind database-owned contracts.

-- 1. Canonical Vendor master lifecycle and identity normalization.
alter table public.vendors
  add column if not exists active boolean not null default true,
  add column if not exists archived_at timestamptz,
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by_user_id uuid references auth.users(id) on delete restrict,
  add column if not exists deactivation_reason text;

create or replace function private.normalize_vendor_name(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select trim(regexp_replace(
    regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', ' ', 'g'),
    '\m(inc|incorporated|corp|corporation|company|co|ltd|limited)\M', ' ', 'g'
  ));
$$;

create or replace function private.normalize_vendor_tax_id(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '', 'g'), '');
$$;

-- Stop before changing historical identity keys if the proposed canonical
-- normalization is ambiguous. Conflicting tax identifiers remain distinct;
-- two no-TIN records with the same canonical name require reconciliation.
do $$
begin
  if exists (
    select 1
    from public.vendors v
    where private.normalize_vendor_tax_id(v.tax_id) is null
    group by v.company_id, private.normalize_vendor_name(v.name)
    having count(*) > 1
  ) then
    raise exception 'Vendor backfill is ambiguous: multiple no-TIN Vendors share one canonical name'
      using errcode = '23505';
  end if;
  if exists (
    select 1
    from public.vendors v
    where private.normalize_vendor_tax_id(v.tax_id) is not null
    group by v.company_id, private.normalize_vendor_tax_id(v.tax_id)
    having count(*) > 1
  ) then
    raise exception 'Vendor backfill is ambiguous: one tax identifier is attached to multiple Vendors'
      using errcode = '23505';
  end if;
end $$;

update public.vendors
set normalized_name = private.normalize_vendor_name(name)
where normalized_name is distinct from private.normalize_vendor_name(name);

alter table public.vendors drop constraint if exists vendors_deactivation_metadata_check;
alter table public.vendors
  add constraint vendors_deactivation_metadata_check check (
    (active and archived_at is null and deactivated_at is null and deactivated_by_user_id is null and deactivation_reason is null)
    or
    (not active and deactivated_at is not null and deactivated_by_user_id is not null
      and deactivation_reason is not null and length(btrim(deactivation_reason)) between 3 and 500)
  );

drop index if exists public.vendors_company_normalized_name_unique;
create unique index if not exists vendors_company_name_without_tax_unique
  on public.vendors(company_id, private.normalize_vendor_name(name))
  where private.normalize_vendor_tax_id(tax_id) is null;
create unique index if not exists vendors_company_tax_unique
  on public.vendors(company_id, private.normalize_vendor_tax_id(tax_id))
  where private.normalize_vendor_tax_id(tax_id) is not null;
create index if not exists vendors_company_active_name_idx
  on public.vendors(company_id, active, name);

-- Historical invoice links must remain explainable. The delete trigger below
-- also protects legacy relationships whose original FK used SET NULL.
alter table public.invoices drop constraint if exists invoices_vendor_id_fkey;
alter table public.invoices
  add constraint invoices_vendor_id_fkey
  foreign key (vendor_id) references public.vendors(id) on delete restrict;

create table if not exists public.vendor_master_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  vendor_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('CREATED', 'UPDATED', 'ENRICHED', 'DEACTIVATED', 'REACTIVATED')),
  previous_data jsonb,
  new_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint vendor_master_events_vendor_fk
    foreign key (company_id, vendor_id) references public.vendors(company_id, id) on delete restrict,
  constraint vendor_master_events_object_check check (jsonb_typeof(new_data) = 'object')
);

create index if not exists vendor_master_events_company_vendor_idx
  on public.vendor_master_events(company_id, vendor_id, created_at desc);

create or replace function private.enforce_user_actor_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;
  if (select auth.uid()) is null then
    raise exception 'Authenticated actor is required for this record' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.user_id is distinct from (select auth.uid()) then
    raise exception 'Record actor is not the authenticated user' using errcode = '42501';
  end if;
  new.user_id := (select auth.uid());
  return new;
end;
$$;

create or replace function private.enforce_vendor_event_actor()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;
  if (select auth.uid()) is null then
    raise exception 'Authenticated actor is required for Vendor history' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.actor_user_id is distinct from (select auth.uid()) then
    raise exception 'Vendor history actor is immutable' using errcode = '42501';
  end if;
  new.actor_user_id := (select auth.uid());
  return new;
end;
$$;

drop trigger if exists vendor_master_events_actor on public.vendor_master_events;
create trigger vendor_master_events_actor
before insert or update on public.vendor_master_events
for each row execute function private.enforce_vendor_event_actor();
drop trigger if exists vendor_master_events_company_boundary on public.vendor_master_events;
create trigger vendor_master_events_company_boundary
before insert or update on public.vendor_master_events
for each row execute function private.enforce_company_row_boundary();

alter table public.vendor_master_events enable row level security;
drop policy if exists vendor_master_events_select on public.vendor_master_events;
create policy vendor_master_events_select on public.vendor_master_events
for select to authenticated
using ((select public.has_company_permission(company_id, 'vendors.read')));
revoke all on table public.vendor_master_events from public, anon, authenticated;
grant select on table public.vendor_master_events to authenticated;

create or replace function private.prevent_vendor_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (select 1 from public.vendor_master_events e where e.company_id = old.company_id and e.vendor_id = old.id)
     or exists (select 1 from public.invoices i where i.company_id = old.company_id and i.vendor_id = old.id)
     or exists (select 1 from public.expenses e where e.company_id = old.company_id and e.vendor_id = old.id)
     or exists (select 1 from public.purchase_orders p where p.company_id = old.company_id and p.vendor_id = old.id)
     or exists (select 1 from public.rfq_invited_vendors r where r.company_id = old.company_id and r.vendor_id = old.id)
     or exists (select 1 from public.supplier_quotations q where q.company_id = old.company_id and q.vendor_id = old.id)
     or exists (select 1 from public.subcontracts s where s.company_id = old.company_id and s.vendor_id = old.id)
     or exists (select 1 from public.email_intake_profiles p where p.company_id = old.company_id and p.linked_vendor_id = old.id) then
    raise exception 'Vendor has dependent or auditable history; deactivate or supersede it instead of deleting it'
      using errcode = '23503';
  end if;
  return old;
end;
$$;

drop trigger if exists vendors_delete_history_guard on public.vendors;
create trigger vendors_delete_history_guard
before delete on public.vendors
for each row execute function private.prevent_vendor_delete();

create or replace function private.guard_vendor_lifecycle_edit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role') then
    return new;
  end if;
  if tg_op = 'UPDATE' and (
    new.company_id is distinct from old.company_id
    or new.user_id is distinct from old.user_id
    or new.active is distinct from old.active
    or new.archived_at is distinct from old.archived_at
    or new.deactivated_at is distinct from old.deactivated_at
    or new.deactivated_by_user_id is distinct from old.deactivated_by_user_id
    or new.deactivation_reason is distinct from old.deactivation_reason
  ) then
    raise exception 'Vendor ownership and lifecycle changes require the guarded Vendor workflow'
      using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and not new.active then
    raise exception 'Create the Vendor active; use the deactivation workflow afterward'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists vendors_lifecycle_guard on public.vendors;
create trigger vendors_lifecycle_guard
before insert or update on public.vendors
for each row execute function private.guard_vendor_lifecycle_edit();

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
  v_existing public.vendors;
  v_other public.vendors;
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
      or v_existing.email is distinct from coalesce(v_email, v_existing.email)
      or v_existing.phone is distinct from coalesce(v_phone, v_existing.phone)
      or v_existing.address is distinct from coalesce(v_address, v_existing.address)
      or v_existing.default_currency is distinct from coalesce(v_currency, v_existing.default_currency)
      or v_existing.default_category is distinct from coalesce(v_category, v_existing.default_category);
    v_before := to_jsonb(v_existing);
    update public.vendors v
    set name = v_name,
        normalized_name = v_normalized_name,
        tax_id = coalesce(v_tax_id, v.tax_id),
        email = coalesce(v_email, v.email),
        phone = coalesce(v_phone, v.phone),
        address = coalesce(v_address, v.address),
        default_currency = coalesce(v_currency, v.default_currency),
        default_category = coalesce(v_category, v.default_category),
        updated_at = now()
    where v.id = v_existing.id and v.company_id = v_company_id
    returning v.* into v_existing;
    v_idempotent := not v_changed;
    v_event_type := case when v_changed then 'UPDATED' else 'UPDATED' end;
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

create or replace function public.deactivate_vendor(p_vendor_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_company_id uuid := private.resolve_transition_company();
  v_vendor public.vendors;
  v_before jsonb;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_actor is null then raise exception 'Authentication is required to deactivate Vendors' using errcode = '42501'; end if;
  if not (select private.has_company_permission(v_company_id, 'vendors.manage')) then raise exception 'Vendor management permission is required' using errcode = '42501'; end if;
  if v_reason is null or length(v_reason) < 3 or length(v_reason) > 500 then raise exception 'A Vendor deactivation reason is required' using errcode = '22023'; end if;
  select v.* into v_vendor from public.vendors v where v.id = p_vendor_id and v.company_id = v_company_id for update;
  if not found then raise exception 'Vendor was not found in this deployment company' using errcode = '23503'; end if;
  if not v_vendor.active then return jsonb_build_object('vendor', to_jsonb(v_vendor), 'changed', false, 'idempotent', true); end if;
  v_before := to_jsonb(v_vendor);
  update public.vendors set active = false, archived_at = coalesce(archived_at, now()), deactivated_at = now(), deactivated_by_user_id = v_actor, deactivation_reason = v_reason, updated_at = now()
  where id = p_vendor_id and company_id = v_company_id returning * into v_vendor;
  insert into public.vendor_master_events (company_id, vendor_id, actor_user_id, event_type, previous_data, new_data)
  values (v_company_id, v_vendor.id, v_actor, 'DEACTIVATED', v_before, to_jsonb(v_vendor));
  return jsonb_build_object('vendor', to_jsonb(v_vendor), 'changed', true, 'idempotent', false);
end;
$$;

create or replace function public.reactivate_vendor(p_vendor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_company_id uuid := private.resolve_transition_company();
  v_vendor public.vendors;
  v_before jsonb;
begin
  if v_actor is null then raise exception 'Authentication is required to reactivate Vendors' using errcode = '42501'; end if;
  if not (select private.has_company_permission(v_company_id, 'vendors.manage')) then raise exception 'Vendor management permission is required' using errcode = '42501'; end if;
  select v.* into v_vendor from public.vendors v where v.id = p_vendor_id and v.company_id = v_company_id for update;
  if not found then raise exception 'Vendor was not found in this deployment company' using errcode = '23503'; end if;
  if v_vendor.active then return jsonb_build_object('vendor', to_jsonb(v_vendor), 'changed', false, 'idempotent', true); end if;
  v_before := to_jsonb(v_vendor);
  update public.vendors set active = true, archived_at = null, deactivated_at = null, deactivated_by_user_id = null, deactivation_reason = null, updated_at = now()
  where id = p_vendor_id and company_id = v_company_id returning * into v_vendor;
  insert into public.vendor_master_events (company_id, vendor_id, actor_user_id, event_type, previous_data, new_data)
  values (v_company_id, v_vendor.id, v_actor, 'REACTIVATED', v_before, to_jsonb(v_vendor));
  return jsonb_build_object('vendor', to_jsonb(v_vendor), 'changed', true, 'idempotent', false);
end;
$$;

revoke all on function public.create_or_update_vendor(jsonb) from public, anon;
grant execute on function public.create_or_update_vendor(jsonb) to authenticated;
revoke all on function public.deactivate_vendor(uuid, text) from public, anon;
grant execute on function public.deactivate_vendor(uuid, text) to authenticated;
revoke all on function public.reactivate_vendor(uuid) from public, anon;
grant execute on function public.reactivate_vendor(uuid) to authenticated;

-- The canonical Vendor RPC owns all authenticated writes. Reads remain direct
-- and company/permission-scoped; delete is always denied to the browser.
drop policy if exists vendors_company_insert on public.vendors;
drop policy if exists vendors_company_update on public.vendors;
drop policy if exists vendors_company_delete on public.vendors;
revoke insert, update, delete on table public.vendors from public, anon, authenticated;
grant select on table public.vendors to authenticated;

-- Actor integrity for legacy user_id evidence/history records. Trusted internal
-- SECURITY DEFINER workflows retain their DB-derived actor values.
drop trigger if exists invoice_extractions_actor_integrity on public.invoice_extractions;
create trigger invoice_extractions_actor_integrity before insert or update on public.invoice_extractions for each row execute function private.enforce_user_actor_identity();
drop trigger if exists invoice_review_events_actor_integrity on public.invoice_review_events;
create trigger invoice_review_events_actor_integrity before insert or update on public.invoice_review_events for each row execute function private.enforce_user_actor_identity();

-- 2. Preserve unknown invoice amounts and line fields as NULL rather than a
-- storage default of zero. Existing numeric history is unchanged.
alter table public.invoices alter column grand_total drop not null;
alter table public.invoices alter column grand_total drop default;
alter table public.invoice_line_items alter column quantity drop not null;
alter table public.invoice_line_items alter column quantity drop default;
alter table public.invoice_line_items alter column unit_price drop not null;
alter table public.invoice_line_items alter column unit_price drop default;
alter table public.invoice_line_items alter column line_total drop not null;
alter table public.invoice_line_items alter column line_total drop default;

-- 3. Database-level source/receipt idempotency. Gmail attachment identity is
-- separately keyed by message + attachment and is intentionally not collapsed
-- merely because another source has identical bytes.
create unique index if not exists expenses_company_receipt_source_active_unique
  on public.expenses(company_id, receipt_source_document_id)
  where receipt_source_document_id is not null and status <> 'VOID';
create unique index if not exists source_documents_company_manual_sha_unique
  on public.source_documents(company_id, sha256)
  where source_type in ('UPLOAD', 'MANUAL');

-- Backup registration state is observable on the primary source record.
alter table public.source_documents
  add column if not exists backup_registration_status text not null default 'NOT_CONFIGURED',
  add column if not exists backup_registration_error text,
  add column if not exists backup_registration_attempted_at timestamptz;
alter table public.source_documents drop constraint if exists source_documents_backup_registration_status_check;
alter table public.source_documents add constraint source_documents_backup_registration_status_check
  check (backup_registration_status in ('NOT_CONFIGURED', 'PENDING', 'REGISTERED', 'FAILED'));

-- 4. Supplier-derived Expense truth is copied from the verified supplier
-- invoice and cannot drift through ordinary table updates.
create or replace function public.validate_supplier_expense_provenance()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_invoice public.invoices;
begin
  if tg_op = 'UPDATE'
     and old.supplier_invoice_id is not null
     and new.supplier_invoice_id is distinct from old.supplier_invoice_id then
    raise exception 'Supplier invoice provenance is immutable after an Expense is linked' using errcode = '42501';
  end if;

  if new.supplier_invoice_id is not null then
    select i.* into v_invoice
    from public.invoices i
    where i.id = new.supplier_invoice_id
      and i.company_id = new.company_id
    for share;
    if not found or coalesce(v_invoice.lifecycle_status, 'ACTIVE') = 'VOID' or coalesce(v_invoice.review_status, 'NEEDS_REVIEW') <> 'VERIFIED' then
      raise exception 'Supplier-derived Expense requires a verified, non-void invoice in the same company' using errcode = '42501';
    end if;
    if v_invoice.vendor_id is null or new.vendor_id is distinct from v_invoice.vendor_id then
      raise exception 'Supplier-derived Expense Vendor must match the canonical supplier invoice Vendor' using errcode = '23514';
    end if;
    if v_invoice.grand_total is null or new.amount is distinct from v_invoice.grand_total then
      raise exception 'Supplier-derived Expense amount must match the verified supplier invoice total' using errcode = '23514';
    end if;
    if v_invoice.currency is null or new.currency is distinct from upper(v_invoice.currency) then
      raise exception 'Supplier-derived Expense currency must match the verified supplier invoice currency' using errcode = '23514';
    end if;
    if v_invoice.invoice_date is null or new.expense_date is distinct from v_invoice.invoice_date then
      raise exception 'Supplier-derived Expense date must match the verified supplier invoice date' using errcode = '23514';
    end if;
    if new.reference_number is distinct from nullif(btrim(v_invoice.invoice_number), '') then
      raise exception 'Supplier-derived Expense reference must match the supplier invoice number' using errcode = '23514';
    end if;
  end if;

  if new.vendor_id is not null and not exists (
    select 1 from public.vendors v where v.id = new.vendor_id and v.company_id = new.company_id
  ) then
    raise exception 'Expense Vendor provenance is outside the company' using errcode = '42501';
  end if;
  if new.purchase_order_id is not null and not exists (
    select 1 from public.purchase_orders po where po.id = new.purchase_order_id and po.company_id = new.company_id
  ) then
    raise exception 'Expense Purchase Order provenance is outside the company' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_supplier_provenance on public.expenses;
create trigger expenses_supplier_provenance
before insert or update on public.expenses
for each row execute function public.validate_supplier_expense_provenance();

create or replace function private.guard_expense_correction_edit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_changed boolean;
begin
  if tg_op = 'INSERT' then
    if current_user not in ('postgres', 'service_role')
       and (new.status = 'VOID' or new.archived_at is not null or new.voided_at is not null or new.voided_by_user_id is not null or new.void_reason is not null) then
      raise exception 'Create an Expense in an active status; use the Expense correction workflow for lifecycle changes' using errcode = '42501';
    end if;
    if new.supplier_invoice_id is not null and current_user not in ('postgres', 'service_role') then
      raise exception 'Supplier-derived Expenses must be created by the guarded supplier verification workflow' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.archived_at is distinct from old.archived_at
     or new.voided_at is distinct from old.voided_at
     or new.voided_by_user_id is distinct from old.voided_by_user_id
     or new.void_reason is distinct from old.void_reason
     or (new.status is distinct from old.status and (new.status = 'VOID' or old.status = 'VOID')) then
    if current_user not in ('postgres', 'service_role') then
      raise exception 'Use the Expense correction workflow for void, archive, or restore actions' using errcode = '42501';
    end if;
  end if;

  v_business_changed := new.project_id is distinct from old.project_id
    or new.project_cost_code_id is distinct from old.project_cost_code_id
    or new.expense_date is distinct from old.expense_date
    or new.category is distinct from old.category
    or new.description is distinct from old.description
    or new.payee is distinct from old.payee
    or new.amount is distinct from old.amount
    or new.currency is distinct from old.currency
    or new.payment_method is distinct from old.payment_method
    or new.reference_number is distinct from old.reference_number
    or new.receipt_source_document_id is distinct from old.receipt_source_document_id
    or new.supplier_invoice_id is distinct from old.supplier_invoice_id
    or new.vendor_id is distinct from old.vendor_id
    or new.purchase_order_id is distinct from old.purchase_order_id
    or new.notes is distinct from old.notes;

  if old.supplier_invoice_id is null and new.supplier_invoice_id is not null and current_user not in ('postgres', 'service_role') then
    raise exception 'Supplier invoice linkage is owned by the guarded verification workflow' using errcode = '42501';
  end if;
  if old.supplier_invoice_id is not null and v_business_changed then
    raise exception 'Supplier-derived Expense financial and provenance fields are immutable; void and create a deliberate correction instead' using errcode = '42501';
  end if;

  if current_user in ('postgres', 'service_role') then
    return new;
  end if;
  if old.status = 'PAID' and (new.status is distinct from old.status or v_business_changed) then
    raise exception 'Paid Expenses are immutable; use the Expense correction workflow for an auditable correction' using errcode = '42501';
  end if;
  if old.status = 'APPROVED' and (new.status not in ('APPROVED', 'PAID') or v_business_changed) then
    raise exception 'Approved Expenses must use the Expense correction workflow for an auditable correction' using errcode = '42501';
  end if;
  if old.status = 'VOID' and v_business_changed then
    raise exception 'Voided Expenses are immutable; original values and history must remain preserved' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_correction_edit_guard on public.expenses;
create trigger expenses_correction_edit_guard
before insert or update on public.expenses
for each row execute function private.guard_expense_correction_edit();

-- 5. Durable issued-document send intents prevent duplicate external sends.
insert into public.company_permission_catalog(permission_key, description)
values ('documents.send', 'Send immutable issued Purchase Orders and Client Invoices externally.')
on conflict (permission_key) do update set description = excluded.description;
insert into public.company_role_permissions(role_key, permission_key)
values ('COMPANY_ADMIN', 'documents.send'), ('FINANCE', 'documents.send')
on conflict (role_key, permission_key) do nothing;

create table if not exists public.document_send_intents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  snapshot_id uuid not null references public.issued_document_snapshots(id) on delete restrict,
  document_type text not null check (document_type in ('PURCHASE_ORDER', 'CLIENT_INVOICE')),
  document_id uuid not null,
  sender_user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null,
  trusted_sha256 text not null check (trusted_sha256 ~ '^[0-9a-f]{64}$'),
  recipients jsonb not null default '[]'::jsonb,
  cc jsonb not null default '[]'::jsonb,
  subject text not null,
  attachment_name text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'FAILED', 'UNKNOWN')),
  gmail_message_id text,
  error_message text,
  attempt_count integer not null default 1 check (attempt_count > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint document_send_intents_key_check check (length(btrim(idempotency_key)) between 1 and 200),
  constraint document_send_intents_scope_unique unique (company_id, idempotency_key)
);

create index if not exists document_send_intents_company_document_idx
  on public.document_send_intents(company_id, document_type, document_id, created_at desc);

create or replace function public.validate_document_send_intent_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.document_type = 'PURCHASE_ORDER' and not exists (
    select 1 from public.purchase_orders po where po.id = new.document_id and po.company_id = new.company_id
  ) then
    raise exception 'Purchase Order send intent is outside the company' using errcode = '42501';
  end if;
  if new.document_type = 'CLIENT_INVOICE' and not exists (
    select 1 from public.client_billings b where b.id = new.document_id and b.company_id = new.company_id
  ) then
    raise exception 'Client Invoice send intent is outside the company' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.issued_document_snapshots s
    where s.id = new.snapshot_id and s.company_id = new.company_id
      and s.document_type = new.document_type and s.document_id = new.document_id
  ) then
    raise exception 'Send intent must reference the same company-scoped immutable snapshot' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists document_send_intents_company_boundary on public.document_send_intents;
create trigger document_send_intents_company_boundary
before insert or update on public.document_send_intents
for each row execute function private.enforce_company_row_boundary();
drop trigger if exists document_send_intents_scope on public.document_send_intents;
create trigger document_send_intents_scope
before insert or update on public.document_send_intents
for each row execute function public.validate_document_send_intent_scope();
drop trigger if exists document_send_intents_updated_at on public.document_send_intents;
create trigger document_send_intents_updated_at
before update on public.document_send_intents
for each row execute function private.set_company_updated_at();

alter table public.document_send_intents enable row level security;
drop policy if exists document_send_intents_select on public.document_send_intents;
create policy document_send_intents_select on public.document_send_intents
for select to authenticated
using ((select public.has_company_permission(company_id, 'documents.send')));
revoke all on table public.document_send_intents from public, anon, authenticated;
grant select on table public.document_send_intents to authenticated;

alter table public.document_send_audits
  add column if not exists send_intent_id uuid references public.document_send_intents(id) on delete restrict,
  add column if not exists idempotency_key text;
create unique index if not exists document_send_audits_send_intent_unique
  on public.document_send_audits(send_intent_id)
  where send_intent_id is not null;

create or replace function public.validate_document_send_audit_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_intent public.document_send_intents;
begin
  if (select auth.uid()) is null or new.sender_user_id is distinct from (select auth.uid()) then
    raise exception 'Document send audit actor must be the authenticated sender' using errcode = '42501';
  end if;
  if new.send_intent_id is not null then
    select i.* into v_intent from public.document_send_intents i where i.id = new.send_intent_id and i.company_id = new.company_id;
    if not found or v_intent.status <> 'SENT' or v_intent.sender_user_id is distinct from new.sender_user_id
       or v_intent.snapshot_id is distinct from new.snapshot_id or v_intent.document_type is distinct from new.document_type
       or v_intent.document_id is distinct from new.document_id or v_intent.trusted_sha256 is distinct from new.attachment_sha256 then
      raise exception 'Document send audit must match a completed durable send intent' using errcode = '42501';
    end if;
    if new.idempotency_key is distinct from v_intent.idempotency_key then
      raise exception 'Document send audit idempotency key does not match its send intent' using errcode = '42501';
    end if;
  elsif not exists (
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

drop policy if exists document_send_audits_insert on public.document_send_audits;
create policy document_send_audits_insert on public.document_send_audits
for insert to authenticated
with check ((select public.has_company_permission(company_id, 'documents.send')));
drop policy if exists document_send_audits_select on public.document_send_audits;
create policy document_send_audits_select on public.document_send_audits
for select to authenticated
using (
  (select public.has_company_permission(company_id, 'documents.send'))
  and ((document_type = 'PURCHASE_ORDER' and (select public.has_company_permission(company_id, 'procurement.read')))
    or (document_type = 'CLIENT_INVOICE' and (select public.has_company_permission(company_id, 'projects.read'))))
);
revoke all on table public.document_send_audits from public, anon;
revoke insert on table public.document_send_audits from authenticated;
grant select on table public.document_send_audits to authenticated;

create or replace function public.claim_document_send_intent(
  p_snapshot_id uuid,
  p_document_type text,
  p_document_id uuid,
  p_idempotency_key text,
  p_trusted_sha256 text,
  p_recipients jsonb,
  p_cc jsonb,
  p_subject text,
  p_attachment_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_company_id uuid := private.resolve_transition_company();
  v_intent public.document_send_intents;
  v_key text := nullif(btrim(p_idempotency_key), '');
  v_sha text := lower(btrim(coalesce(p_trusted_sha256, '')));
  v_type text := upper(btrim(coalesce(p_document_type, '')));
  v_inserted boolean := false;
begin
  if v_actor is null then raise exception 'Authentication is required to send issued documents' using errcode = '42501'; end if;
  if not (select private.has_company_permission(v_company_id, 'documents.send')) then raise exception 'Issued document send permission is required' using errcode = '42501'; end if;
  if v_type not in ('PURCHASE_ORDER', 'CLIENT_INVOICE') then raise exception 'Unsupported issued document type' using errcode = '22023'; end if;
  if v_key is null or length(v_key) > 200 or v_key !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$' then raise exception 'Send idempotency key is invalid' using errcode = '22023'; end if;
  if v_sha !~ '^[0-9a-f]{64}$' then raise exception 'Trusted issued PDF hash is invalid' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_recipients, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_cc, '[]'::jsonb)) <> 'array' then raise exception 'Recipients must be arrays' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p_subject, '')), '') is null or length(p_subject) > 500 then raise exception 'Send subject is required' using errcode = '22023'; end if;
  if nullif(btrim(coalesce(p_attachment_name, '')), '') is null or length(p_attachment_name) > 180 then raise exception 'Send attachment name is required' using errcode = '22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_company_id::text || ':document-send:' || v_key, 0));
  select i.* into v_intent from public.document_send_intents i where i.company_id = v_company_id and i.idempotency_key = v_key for update;
  if found then
    if v_intent.snapshot_id is distinct from p_snapshot_id or v_intent.document_type <> v_type or v_intent.document_id is distinct from p_document_id or v_intent.trusted_sha256 <> v_sha then
      raise exception 'Send idempotency key is already bound to a different issued document or PDF' using errcode = '23514';
    end if;
    if v_intent.status = 'SENT' then return jsonb_build_object('intent', to_jsonb(v_intent), 'claimed', false, 'idempotent', true); end if;
    if v_intent.status in ('PENDING', 'UNKNOWN') then return jsonb_build_object('intent', to_jsonb(v_intent), 'claimed', false, 'reconcileRequired', true); end if;
    if v_intent.sender_user_id is distinct from v_actor then
      raise exception 'Only the original sender can retry a failed document send intent' using errcode = '42501';
    end if;
    update public.document_send_intents set status = 'PENDING', error_message = null, attempt_count = attempt_count + 1, updated_at = now() where id = v_intent.id returning * into v_intent;
  else
    insert into public.document_send_intents (company_id, snapshot_id, document_type, document_id, sender_user_id, idempotency_key, trusted_sha256, recipients, cc, subject, attachment_name)
    values (v_company_id, p_snapshot_id, v_type, p_document_id, v_actor, v_key, v_sha, coalesce(p_recipients, '[]'::jsonb), coalesce(p_cc, '[]'::jsonb), btrim(p_subject), btrim(p_attachment_name))
    on conflict (company_id, idempotency_key) do nothing
    returning * into v_intent;
    v_inserted := v_intent.id is not null;
    if not v_inserted then
      select i.* into v_intent from public.document_send_intents i where i.company_id = v_company_id and i.idempotency_key = v_key for update;
      if v_intent.snapshot_id is distinct from p_snapshot_id or v_intent.document_type <> v_type or v_intent.document_id is distinct from p_document_id or v_intent.trusted_sha256 <> v_sha then raise exception 'Send idempotency key is already bound to a different issued document or PDF' using errcode = '23514'; end if;
      if v_intent.status = 'SENT' then return jsonb_build_object('intent', to_jsonb(v_intent), 'claimed', false, 'idempotent', true); end if;
      if v_intent.status in ('PENDING', 'UNKNOWN') then return jsonb_build_object('intent', to_jsonb(v_intent), 'claimed', false, 'reconcileRequired', true); end if;
      if v_intent.sender_user_id is distinct from v_actor then
        raise exception 'Only the original sender can retry a failed document send intent' using errcode = '42501';
      end if;
      update public.document_send_intents set status = 'PENDING', error_message = null, attempt_count = attempt_count + 1, updated_at = now() where id = v_intent.id returning * into v_intent;
    end if;
  end if;
  return jsonb_build_object('intent', to_jsonb(v_intent), 'claimed', true, 'idempotent', false);
end;
$$;

create or replace function public.complete_document_send_intent(
  p_intent_id uuid,
  p_status text,
  p_gmail_message_id text default null,
  p_error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_company_id uuid := private.resolve_transition_company();
  v_intent public.document_send_intents;
  v_status text := upper(btrim(coalesce(p_status, '')));
begin
  if v_actor is null then raise exception 'Authentication is required to complete issued document sending' using errcode = '42501'; end if;
  if not (select private.has_company_permission(v_company_id, 'documents.send')) then raise exception 'Issued document send permission is required' using errcode = '42501'; end if;
  if v_status not in ('SENT', 'FAILED', 'UNKNOWN') then raise exception 'Invalid send intent completion state' using errcode = '22023'; end if;
  select i.* into v_intent from public.document_send_intents i where i.id = p_intent_id and i.company_id = v_company_id for update;
  if not found then raise exception 'Document send intent was not found' using errcode = '23503'; end if;
  if v_intent.sender_user_id is distinct from v_actor then raise exception 'Only the initiating sender can complete this send intent' using errcode = '42501'; end if;
  if v_intent.status = 'SENT' then return jsonb_build_object('intent', to_jsonb(v_intent), 'idempotent', true); end if;
  if v_intent.status <> 'PENDING' then raise exception 'Document send intent is already in a terminal or reconciliation state' using errcode = '40901'; end if;
  update public.document_send_intents set status = v_status, gmail_message_id = nullif(btrim(coalesce(p_gmail_message_id, '')), ''), error_message = nullif(left(btrim(coalesce(p_error_message, '')), 1000), ''), updated_at = now() where id = v_intent.id returning * into v_intent;
  return jsonb_build_object('intent', to_jsonb(v_intent), 'idempotent', false);
end;
$$;

revoke all on function public.claim_document_send_intent(uuid, text, uuid, text, text, jsonb, jsonb, text, text) from public, anon;
grant execute on function public.claim_document_send_intent(uuid, text, uuid, text, text, jsonb, jsonb, text, text) to authenticated;
revoke all on function public.complete_document_send_intent(uuid, text, text, text) from public, anon;
grant execute on function public.complete_document_send_intent(uuid, text, text, text) to authenticated;

create or replace function public.record_document_send_audit(
  p_intent_id uuid,
  p_gmail_message_id text default null,
  p_status text default 'SENT',
  p_error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_company_id uuid := private.resolve_transition_company();
  v_status text := upper(btrim(coalesce(p_status, '')));
  v_intent public.document_send_intents;
  v_audit public.document_send_audits;
begin
  if v_actor is null then raise exception 'Authentication is required to record issued document sending' using errcode = '42501'; end if;
  if not (select private.has_company_permission(v_company_id, 'documents.send')) then raise exception 'Issued document send permission is required' using errcode = '42501'; end if;
  if v_status not in ('SENT', 'FAILED') then raise exception 'Invalid document send audit status' using errcode = '22023'; end if;
  select i.* into v_intent from public.document_send_intents i where i.id = p_intent_id and i.company_id = v_company_id for update;
  if not found then raise exception 'Document send intent was not found' using errcode = '23503'; end if;
  if v_intent.sender_user_id is distinct from v_actor then raise exception 'Only the initiating sender can record this send audit' using errcode = '42501'; end if;
  if v_intent.status is distinct from v_status then raise exception 'Document send audit status does not match the durable send intent' using errcode = '42501'; end if;

  select a.* into v_audit from public.document_send_audits a where a.send_intent_id = v_intent.id for update;
  if found then return jsonb_build_object('audit', to_jsonb(v_audit), 'idempotent', true); end if;

  insert into public.document_send_audits (
    company_id, snapshot_id, document_type, document_id, sender_user_id, recipients, cc, subject,
    attachment_name, attachment_sha256, gmail_message_id, status, error_message, send_intent_id, idempotency_key
  ) values (
    v_intent.company_id, v_intent.snapshot_id, v_intent.document_type, v_intent.document_id, v_actor,
    v_intent.recipients, v_intent.cc, v_intent.subject, v_intent.attachment_name, v_intent.trusted_sha256,
    nullif(btrim(coalesce(p_gmail_message_id, '')), ''), v_status,
    nullif(left(btrim(coalesce(p_error_message, '')), 1000), ''), v_intent.id, v_intent.idempotency_key
  ) returning * into v_audit;
  return jsonb_build_object('audit', to_jsonb(v_audit), 'idempotent', false);
end;
$$;

revoke all on function public.record_document_send_audit(uuid, text, text, text) from public, anon;
grant execute on function public.record_document_send_audit(uuid, text, text, text) to authenticated;

-- 6. Durable per-user AI request budgets. Server routes still apply bounded
-- input validation and request timeouts; this table protects cost across
-- multiple application processes.
create table if not exists public.ai_request_budgets (
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  active_count integer not null default 0 check (active_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (company_id, user_id, operation),
  check (operation in ('INVOICE_EXTRACTION', 'EXPENSE_EXTRACTION', 'EMAIL_CLASSIFICATION', 'EMAIL_BATCH_CLASSIFICATION', 'ASSISTANT'))
);

alter table public.ai_request_budgets enable row level security;
revoke all on table public.ai_request_budgets from public, anon, authenticated;

create or replace function public.claim_company_ai_request(
  p_company_id uuid,
  p_operation text,
  p_window_seconds integer default 60,
  p_max_requests integer default 30,
  p_max_concurrency integer default 2
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_operation text := upper(btrim(coalesce(p_operation, '')));
  v_row public.ai_request_budgets;
  v_company_active integer := 0;
  v_now timestamptz := now();
  v_window integer := greatest(10, least(coalesce(p_window_seconds, 60), 3600));
  v_requests integer := greatest(1, least(coalesce(p_max_requests, 30), 1000));
  v_concurrency integer := greatest(1, least(coalesce(p_max_concurrency, 2), 50));
begin
  if v_actor is null then raise exception 'Authentication is required for AI requests' using errcode = '42501'; end if;
  if p_company_id is null or p_company_id is distinct from (select private.deployment_company_id()) then raise exception 'AI request company is outside the deployment' using errcode = '42501'; end if;
  if not (select private.is_active_company_member(p_company_id)) then raise exception 'Active company membership is required for AI requests' using errcode = '42501'; end if;
  if v_operation not in ('INVOICE_EXTRACTION', 'EXPENSE_EXTRACTION', 'EMAIL_CLASSIFICATION', 'EMAIL_BATCH_CLASSIFICATION', 'ASSISTANT') then raise exception 'AI request operation is invalid' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':ai-budget:' || v_operation, 0));
  insert into public.ai_request_budgets(company_id, user_id, operation) values (p_company_id, v_actor, v_operation) on conflict do nothing;
  select b.* into v_row from public.ai_request_budgets b where b.company_id = p_company_id and b.user_id = v_actor and b.operation = v_operation for update;
  if v_row.window_started_at <= v_now - make_interval(secs => v_window) then
    update public.ai_request_budgets set window_started_at = v_now, request_count = 0, active_count = 0, updated_at = v_now where company_id = p_company_id and user_id = v_actor and operation = v_operation returning * into v_row;
  end if;
  select coalesce(sum(b.active_count), 0)::integer into v_company_active from public.ai_request_budgets b where b.company_id = p_company_id and b.operation = v_operation;
  if v_row.request_count >= v_requests then return jsonb_build_object('allowed', false, 'reason', 'RATE_LIMITED', 'retryAfterSeconds', greatest(1, v_window - extract(epoch from (v_now - v_row.window_started_at))::integer)); end if;
  if v_company_active >= v_concurrency then return jsonb_build_object('allowed', false, 'reason', 'CONCURRENCY_LIMITED', 'retryAfterSeconds', 5); end if;
  update public.ai_request_budgets set request_count = request_count + 1, active_count = active_count + 1, updated_at = v_now where company_id = p_company_id and user_id = v_actor and operation = v_operation returning * into v_row;
  return jsonb_build_object('allowed', true, 'operation', v_operation, 'requestCount', v_row.request_count, 'activeCount', v_row.active_count);
end;
$$;

create or replace function public.release_company_ai_request(p_company_id uuid, p_operation text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_operation text := upper(btrim(coalesce(p_operation, '')));
begin
  if v_actor is null then return; end if;
  if p_company_id is distinct from (select private.deployment_company_id()) then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':ai-budget:' || v_operation, 0));
  update public.ai_request_budgets set active_count = greatest(active_count - 1, 0), updated_at = now() where company_id = p_company_id and user_id = v_actor and operation = v_operation;
end;
$$;

revoke all on function public.claim_company_ai_request(uuid, text, integer, integer, integer) from public, anon;
grant execute on function public.claim_company_ai_request(uuid, text, integer, integer, integer) to authenticated;
revoke all on function public.release_company_ai_request(uuid, text) from public, anon;
grant execute on function public.release_company_ai_request(uuid, text) to authenticated;

-- 7. Verification is fail-closed. A preserved supplier invoice may remain in
-- review until the human resolves every fact required to create authoritative
-- payable/Actual Cost truth.
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
  v_allocation_count integer := 0;
  v_expected_buyer_name text;
  v_actual_buyer_name text;
  v_expected_buyer_tin text;
  v_actual_buyer_tin text;
  v_verified_at timestamptz;
  v_updated_at timestamptz;
begin
  if v_actor is null then raise exception 'Authentication is required to verify supplier invoices' using errcode = '42501'; end if;
  select i.* into v_invoice from public.invoices i where i.id = p_invoice_id for update;
  if not found then raise exception 'Supplier invoice was not found' using errcode = '23503'; end if;
  v_company_id := v_invoice.company_id;
  if not (select private.has_company_permission(v_company_id, 'invoices.verify')) then raise exception 'Invoice verification permission is required' using errcode = '42501'; end if;
  if not (select private.has_company_permission(v_company_id, 'expenses.manage')) then raise exception 'Expense management permission is required to verify a supplier invoice' using errcode = '42501'; end if;
  if coalesce(v_invoice.lifecycle_status, 'ACTIVE') = 'VOID' then raise exception 'Voided supplier invoices cannot be verified' using errcode = '42501'; end if;

  -- A retry of an already-created authoritative Expense is safe even when the
  -- current source evidence is no longer complete; the Expense remains the
  -- authoritative payable record and no duplicate is created.
  select e.* into v_expense
  from public.expenses e
  where e.company_id = v_company_id and e.supplier_invoice_id = v_invoice.id
  for update;
  if found then
    if v_expense.status = 'VOID' then raise exception 'The linked Expense is VOID; use the Expense correction workflow before re-verifying' using errcode = '42501'; end if;
    if v_invoice.review_status <> 'VERIFIED' or v_invoice.current_data->>'linkedExpenseId' is distinct from v_expense.id::text then
      update public.invoices
      set current_data = jsonb_set(coalesce(current_data, '{}'::jsonb), '{linkedExpenseId}', to_jsonb(v_expense.id), true), review_status = 'VERIFIED', verified_at = coalesce(verified_at, now()), updated_at = now()
      where id = v_invoice.id and company_id = v_company_id;
    end if;
    select i.verified_at, i.updated_at into v_verified_at, v_updated_at from public.invoices i where i.id = v_invoice.id;
    return jsonb_build_object('invoiceId', v_invoice.id, 'reviewStatus', 'VERIFIED', 'verifiedAt', v_verified_at, 'updatedAt', v_updated_at, 'expense', to_jsonb(v_expense), 'idempotent', true);
  end if;

  if v_invoice.vendor_id is null then raise exception 'Resolve the supplier invoice to a canonical Vendor before verification' using errcode = '22023'; end if;
  select v.* into v_vendor from public.vendors v where v.id = v_invoice.vendor_id and v.company_id = v_company_id for share;
  if not found then raise exception 'The selected supplier Vendor is unavailable in this deployment company' using errcode = '23503'; end if;
  if nullif(btrim(v_invoice.invoice_number), '') is null then raise exception 'Invoice number is required before supplier verification' using errcode = '22023'; end if;
  if v_invoice.invoice_date is null then raise exception 'Invoice date is required before supplier verification; it cannot be replaced with today''s date' using errcode = '22023'; end if;
  if v_invoice.currency is null or upper(btrim(v_invoice.currency)) !~ '^[A-Z]{3}$' then raise exception 'Invoice currency is required before supplier verification; it cannot default to PHP' using errcode = '22023'; end if;
  if v_invoice.grand_total is null or v_invoice.grand_total <= 0 then raise exception 'A positive supplier invoice total is required before verification; unknown is not zero' using errcode = '22023'; end if;
  v_category := nullif(btrim(coalesce(v_invoice.current_data->>'category', '')), '');
  if v_category is null then raise exception 'Expense category is unresolved; confirm it before supplier verification' using errcode = '22023'; end if;
  v_description := nullif(btrim(coalesce(v_invoice.current_data->>'description', '')), '');
  if v_description is null then raise exception 'Expense description is unresolved; confirm it before supplier verification' using errcode = '22023'; end if;

  select coalesce(p.legal_name, c.name), p.vat_tin into v_expected_buyer_name, v_expected_buyer_tin
  from public.companies c left join public.company_document_profiles p on p.company_id = c.id where c.id = v_company_id;
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

  select count(*)::integer into v_allocation_count from public.invoice_project_allocations a where a.company_id = v_company_id and a.invoice_id = v_invoice.id and coalesce(a.allocation_amount, 0) > 0;
  if v_allocation_count = 1 then
    select a.project_id, a.project_cost_code_id into v_project_id, v_cost_code_id from public.invoice_project_allocations a where a.company_id = v_company_id and a.invoice_id = v_invoice.id and coalesce(a.allocation_amount, 0) > 0 order by a.created_at asc limit 1;
  end if;
  select m.purchase_order_id into v_po_id from public.purchase_order_invoice_matches m where m.company_id = v_company_id and m.invoice_id = v_invoice.id and m.status = 'CONFIRMED' order by m.confirmed_at desc nulls last, m.created_at desc limit 1;

  update public.invoices set review_status = 'VERIFIED', verified_at = coalesce(verified_at, now()), updated_at = now() where id = v_invoice.id and company_id = v_company_id;
  insert into public.expenses (
    id, user_id, company_id, project_id, project_cost_code_id, expense_date, category, description, payee, amount, currency, reference_number, status, supplier_invoice_id, vendor_id, purchase_order_id, notes
  ) values (
    gen_random_uuid(), v_actor, v_company_id, v_project_id, v_cost_code_id, v_invoice.invoice_date, v_category, v_description, v_vendor.name, v_invoice.grand_total, upper(v_invoice.currency), nullif(btrim(v_invoice.invoice_number), ''), 'DRAFT', v_invoice.id, v_vendor.id, v_po_id,
    format('Authoritative supplier payable created from preserved supplier invoice %s.', v_invoice.invoice_number)
  ) returning * into v_expense;

  update public.invoices set current_data = jsonb_set(coalesce(current_data, '{}'::jsonb), '{linkedExpenseId}', to_jsonb(v_expense.id), true), review_status = 'VERIFIED', verified_at = coalesce(verified_at, now()), updated_at = now() where id = v_invoice.id and company_id = v_company_id;
  select i.verified_at, i.updated_at into v_verified_at, v_updated_at from public.invoices i where i.id = v_invoice.id;
  insert into public.invoice_review_events (user_id, company_id, invoice_id, event_type, new_value) values (v_actor, v_company_id, v_invoice.id, 'VERIFIED_WITH_EXPENSE', jsonb_build_object('expenseId', v_expense.id, 'purchaseOrderId', v_po_id, 'projectId', v_project_id));
  return jsonb_build_object('invoiceId', v_invoice.id, 'reviewStatus', 'VERIFIED', 'verifiedAt', v_verified_at, 'updatedAt', v_updated_at, 'expense', to_jsonb(v_expense), 'idempotent', false);
end;
$$;

revoke all on function public.verify_supplier_invoice_and_create_expense(uuid) from public, anon;
grant execute on function public.verify_supplier_invoice_and_create_expense(uuid) to authenticated;

-- Keep trigger/helper entry points private to the database engine.
revoke execute on function private.normalize_vendor_name(text) from public, anon, authenticated;
revoke execute on function private.normalize_vendor_tax_id(text) from public, anon, authenticated;
revoke execute on function private.enforce_user_actor_identity() from public, anon, authenticated;
revoke execute on function private.enforce_vendor_event_actor() from public, anon, authenticated;
revoke execute on function private.prevent_vendor_delete() from public, anon, authenticated;
revoke execute on function private.guard_vendor_lifecycle_edit() from public, anon, authenticated;
revoke execute on function public.validate_supplier_expense_provenance() from public, anon, authenticated;
revoke execute on function public.validate_document_send_intent_scope() from public, anon, authenticated;
revoke execute on function public.validate_document_send_audit_scope() from public, anon, authenticated;

-- Final catalog audit found legacy anonymous Data API grants on company data tables. RLS is still required, but unauthenticated roles need no direct
-- table capability at all.
revoke all on table public.company_document_profiles, public.email_intake_profiles, public.profiles,
  public.project_cost_codes, public.purchase_order_invoice_match_lines, public.purchase_order_invoice_matches,
  public.purchase_order_lines, public.purchase_order_receipt_lines, public.purchase_order_receipts,
  public.purchase_orders, public.rfq_invited_vendors, public.rfq_lines, public.rfqs,
  public.subcontract_variation_lines, public.subcontract_variations, public.supplier_quotation_lines,
  public.supplier_quotations
from public, anon;

-- These SECURITY DEFINER helpers are called by database-owned workflows; they
-- are not an application API and must not retain PUBLIC EXECUTE.
revoke execute on function private.assignment_lifecycle_preflight(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.create_company_invitation(uuid, uuid, text, text, timestamptz, jsonb) from public, anon, authenticated;
revoke execute on function private.sync_subcontract_variation_net_amount() from public, anon, authenticated;
revoke execute on function private.worker_lifecycle_preflight(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.worker_lifecycle_preflight_authorized(uuid) from public, anon, authenticated;
