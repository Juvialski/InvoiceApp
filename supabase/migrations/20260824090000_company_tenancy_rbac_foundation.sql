-- Company tenancy, RBAC, audited platform administration, and transition-safe
-- tenant backfill for the InvoiceApp domain.
--
-- This migration is deliberately additive and data-preserving. It does not
-- delete financial history or move Storage objects. Existing user_id columns
-- remain as actor/legacy lineage; company_id is the authorization boundary.

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;

create table if not exists public.company_role_catalog (
  role_key text primary key,
  display_name text not null,
  description text not null default '',
  assignable boolean not null default true,
  is_platform_role boolean not null default false,
  created_at timestamptz not null default now(),
  check (role_key = upper(role_key) and role_key ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  check (not is_platform_role or not assignable)
);

create table if not exists public.company_permission_catalog (
  permission_key text primary key,
  description text not null default '',
  created_at timestamptz not null default now(),
  check (permission_key = lower(permission_key) and permission_key ~ '^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$')
);

create table if not exists public.company_role_permissions (
  role_key text not null references public.company_role_catalog(role_key) on delete cascade,
  permission_key text not null references public.company_permission_catalog(permission_key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_key, permission_key)
);

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  company_code text not null check (company_code = lower(company_code) and company_code ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED', 'ARCHIVED')),
  default_currency text not null default 'PHP' check (default_currency = upper(default_currency) and default_currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Asia/Manila',
  created_by_user_id uuid references auth.users(id) on delete set null,
  legacy_owner_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.platform_admin_allowlist (
  normalized_email text primary key check (normalized_email = lower(btrim(normalized_email)) and position('@' in normalized_email) > 1),
  created_at timestamptz not null default now()
);

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_key text not null references public.company_role_catalog(role_key) on update restrict,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED', 'REVOKED')),
  invited_by_user_id uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create table if not exists public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  normalized_email text not null check (normalized_email = lower(btrim(normalized_email)) and position('@' in normalized_email) > 1),
  role_key text not null references public.company_role_catalog(role_key) on update restrict,
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
  invited_by_user_id uuid references auth.users(id) on delete set null,
  accepted_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  expires_at timestamptz
);

create table if not exists public.company_audit_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in (
    'COMPANY_CREATED', 'COMPANY_UPDATED', 'COMPANY_SUSPENDED', 'COMPANY_ARCHIVED', 'COMPANY_REACTIVATED',
    'USER_INVITED', 'INVITE_REVOKED', 'INVITE_ACCEPTED',
    'MEMBER_ROLE_CHANGED', 'MEMBER_SUSPENDED', 'MEMBER_REACTIVATED', 'MEMBER_REVOKED'
  )),
  target_type text not null,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create unique index if not exists companies_company_code_unique
  on public.companies (lower(company_code));
create unique index if not exists companies_legacy_owner_unique
  on public.companies (legacy_owner_user_id)
  where legacy_owner_user_id is not null;
create index if not exists company_members_user_status_idx
  on public.company_members (user_id, status, company_id);
create index if not exists company_members_company_status_idx
  on public.company_members (company_id, status, user_id);
create unique index if not exists company_invitations_pending_unique
  on public.company_invitations (company_id, normalized_email)
  where status = 'PENDING';
create index if not exists company_invitations_email_status_idx
  on public.company_invitations (normalized_email, status, expires_at);
create index if not exists company_audit_events_company_created_idx
  on public.company_audit_events (company_id, created_at desc);

insert into public.company_role_catalog (role_key, display_name, description, assignable, is_platform_role)
values
  ('COMPANY_ADMIN', 'Company Admin', 'Full operational access within one company.', true, false),
  ('FINANCE', 'Finance', 'Invoices, projects, expenses, vendors, and financial reporting.', true, false),
  ('PAYROLL', 'Payroll', 'Workforce, compensation, payroll processing, and payroll reporting.', true, false),
  ('VIEWER', 'Viewer', 'Read-only company financial and project access.', true, false)
on conflict (role_key) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  assignable = excluded.assignable,
  is_platform_role = excluded.is_platform_role;

insert into public.company_permission_catalog (permission_key, description)
values
  ('dashboard.read', 'Read the permitted company dashboard.'),
  ('projects.read', 'Read company projects and project references.'),
  ('projects.manage', 'Create and manage company projects and project costing.'),
  ('invoices.read', 'Read invoices, source documents, and invoice history.'),
  ('invoices.manage', 'Create and edit invoices and invoice-related records.'),
  ('invoices.verify', 'Verify invoices and append review events.'),
  ('invoices.extract', 'Create and process invoice extraction/source records.'),
  ('gmail.read', 'Read imported Gmail messages and connection metadata.'),
  ('gmail.manage', 'Manage Gmail connections, sync state, and imports.'),
  ('expenses.read', 'Read company expenses.'),
  ('expenses.manage', 'Create and manage company expenses.'),
  ('vendors.read', 'Read company vendors.'),
  ('vendors.manage', 'Create and manage company vendors.'),
  ('payroll.summary.read', 'Read payroll periods and aggregate payroll summaries.'),
  ('payroll.detail.read', 'Read individual payroll entries and allocations.'),
  ('payroll.manage', 'Create and manage payroll processing records.'),
  ('payroll.approve', 'Approve and pay payroll runs.'),
  ('payroll.settings', 'Manage payroll schedules and settings.'),
  ('payroll.import', 'Manage payroll import batches, rows, and templates.'),
  ('workers.read', 'Read workforce records.'),
  ('workers.compensation.read', 'Read effective-dated worker compensation.'),
  ('workers.manage', 'Manage workforce and compensation records.'),
  ('reports.financial.read', 'Read permitted financial/project reports.'),
  ('reports.payroll.read', 'Read permitted payroll reports.'),
  ('company.settings.read', 'Read company settings.'),
  ('company.settings.manage', 'Manage company settings.'),
  ('company.members.read', 'Read company membership and access audit metadata.')
on conflict (permission_key) do update set description = excluded.description;

insert into public.company_role_permissions (role_key, permission_key)
select 'COMPANY_ADMIN', permission_key
from public.company_permission_catalog
on conflict do nothing;

insert into public.company_role_permissions (role_key, permission_key)
values
  ('FINANCE', 'dashboard.read'), ('FINANCE', 'projects.read'), ('FINANCE', 'projects.manage'),
  ('FINANCE', 'invoices.read'), ('FINANCE', 'invoices.manage'), ('FINANCE', 'invoices.verify'), ('FINANCE', 'invoices.extract'),
  ('FINANCE', 'gmail.read'), ('FINANCE', 'expenses.read'), ('FINANCE', 'expenses.manage'),
  ('FINANCE', 'vendors.read'), ('FINANCE', 'vendors.manage'), ('FINANCE', 'payroll.summary.read'), ('FINANCE', 'reports.financial.read'),
  ('PAYROLL', 'dashboard.read'), ('PAYROLL', 'projects.read'), ('PAYROLL', 'payroll.summary.read'), ('PAYROLL', 'payroll.detail.read'),
  ('PAYROLL', 'payroll.manage'), ('PAYROLL', 'payroll.approve'), ('PAYROLL', 'payroll.settings'), ('PAYROLL', 'payroll.import'),
  ('PAYROLL', 'workers.read'), ('PAYROLL', 'workers.compensation.read'), ('PAYROLL', 'workers.manage'), ('PAYROLL', 'reports.payroll.read'),
  ('VIEWER', 'dashboard.read'), ('VIEWER', 'projects.read'), ('VIEWER', 'invoices.read'), ('VIEWER', 'expenses.read'),
  ('VIEWER', 'vendors.read'), ('VIEWER', 'payroll.summary.read'), ('VIEWER', 'reports.financial.read')
on conflict do nothing;

insert into public.platform_admin_allowlist (normalized_email)
values ('al.matubis17@gmail.com')
on conflict (normalized_email) do nothing;

-- Preserve a one-time numeric baseline so the post-deployment verification RPC
-- can prove that the tenancy migration changed ownership metadata only.
create table if not exists private.company_tenancy_baseline (
  metric_key text primary key,
  metric_value numeric not null,
  captured_at timestamptz not null default now()
);

-- The policy catalog is private metadata used to generate the same RLS shape
-- for every business table. payroll_schedule_versions has no legacy user_id;
-- its company is derived from payroll_schedules during backfill.
create table if not exists private.company_tenant_policy_catalog (
  table_name text primary key,
  read_permission text not null,
  write_permission text not null,
  allow_insert boolean not null default true,
  allow_update boolean not null default true,
  allow_delete boolean not null default true
);

insert into private.company_tenant_policy_catalog (table_name, read_permission, write_permission, allow_insert, allow_update, allow_delete)
values
  ('gmail_connections', 'gmail.read', 'gmail.manage', true, true, true),
  ('gmail_sync_state', 'gmail.read', 'gmail.manage', true, true, true),
  ('email_messages', 'gmail.read', 'gmail.manage', true, true, true),
  ('source_documents', 'invoices.read', 'invoices.manage', true, true, false),
  ('vendors', 'vendors.read', 'vendors.manage', true, true, true),
  ('invoices', 'invoices.read', 'invoices.manage', true, true, false),
  ('invoice_line_items', 'invoices.read', 'invoices.manage', true, true, true),
  ('invoice_extractions', 'invoices.read', 'invoices.extract', true, false, false),
  ('invoice_review_events', 'invoices.read', 'invoices.verify', true, false, false),
  ('projects', 'projects.read', 'projects.manage', true, true, false),
  ('invoice_project_allocations', 'invoices.read', 'projects.manage', true, true, true),
  ('expenses', 'expenses.read', 'expenses.manage', true, true, true),
  ('workers', 'workers.read', 'workers.manage', true, true, false),
  ('project_worker_assignments', 'workers.read', 'workers.manage', true, true, true),
  ('departments', 'workers.read', 'workers.manage', true, true, true),
  ('worker_compensation_profiles', 'workers.compensation.read', 'workers.manage', true, true, true),
  ('recurring_payroll_components', 'workers.compensation.read', 'workers.manage', true, true, true),
  ('payroll_schedules', 'payroll.settings', 'payroll.settings', true, true, true),
  ('payroll_schedule_versions', 'payroll.settings', 'payroll.settings', true, true, true),
  ('payroll_periods', 'payroll.summary.read', 'payroll.manage', true, true, true),
  ('work_entries', 'payroll.detail.read', 'payroll.manage', true, true, true),
  ('payroll_runs', 'payroll.summary.read', 'payroll.manage', true, true, true),
  ('payroll_entries', 'payroll.detail.read', 'payroll.manage', true, true, true),
  ('payroll_project_allocations', 'payroll.detail.read', 'payroll.manage', true, true, true),
  ('payroll_adjustments', 'payroll.detail.read', 'payroll.manage', true, true, true),
  ('project_accounting_events', 'reports.financial.read', 'projects.manage', true, false, false),
  ('labor_cost_centers', 'payroll.import', 'payroll.import', true, true, true),
  ('payroll_import_batches', 'payroll.import', 'payroll.import', true, true, true),
  ('payroll_import_rows', 'payroll.import', 'payroll.import', true, true, true),
  ('payroll_import_templates', 'payroll.import', 'payroll.import', true, true, true)
on conflict (table_name) do update set
  read_permission = excluded.read_permission,
  write_permission = excluded.write_permission,
  allow_insert = excluded.allow_insert,
  allow_update = excluded.allow_update,
  allow_delete = excluded.allow_delete;

revoke all on table private.company_tenancy_baseline, private.company_tenant_policy_catalog from public, anon, authenticated;

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = (select auth.uid())
  );
$$;

create or replace function private.current_verified_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(btrim(u.email))
  from auth.users u
  where u.id = (select auth.uid())
    and u.email is not null
    and coalesce(u.email_confirmed_at, u.confirmed_at) is not null;
$$;

create or replace function private.is_active_company_member(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.company_members cm
    join public.companies c on c.id = cm.company_id
    where cm.company_id = p_company_id
      and cm.user_id = (select auth.uid())
      and cm.status = 'ACTIVE'
      and c.status = 'ACTIVE'
  );
$$;

create or replace function private.can_read_company_metadata(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.is_platform_admin())
      or exists (
        select 1
        from public.company_members cm
        where cm.company_id = p_company_id
          and cm.user_id = (select auth.uid())
      );
$$;

create or replace function private.has_company_permission(p_company_id uuid, p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.companies c
    where c.id = p_company_id
      and c.status = 'ACTIVE'
      and (
        (select private.is_platform_admin())
        or exists (
          select 1
          from public.company_members cm
          join public.company_role_permissions crp on crp.role_key = cm.role_key
          where cm.company_id = c.id
            and cm.user_id = (select auth.uid())
            and cm.status = 'ACTIVE'
            and crp.permission_key = p_permission_key
        )
      )
  );
$$;

create or replace function private.resolve_transition_company()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_company_count integer;
begin
  select min(cm.company_id), count(*)::integer
    into v_company_id, v_company_count
  from public.company_members cm
  join public.companies c on c.id = cm.company_id
  where cm.user_id = (select auth.uid())
    and cm.status = 'ACTIVE'
    and c.status = 'ACTIVE';

  if v_company_count <> 1 then
    raise exception 'Company context is unavailable or ambiguous; supply company_id explicitly'
      using errcode = '42501';
  end if;
  return v_company_id;
end;
$$;

create or replace function private.storage_company_id(p_name text)
returns uuid
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v_parts text[];
begin
  v_parts := storage.foldername(p_name);
  if coalesce(array_length(v_parts, 1), 0) < 2 or v_parts[1] <> 'companies' then
    return null;
  end if;
  begin
    return v_parts[2]::uuid;
  exception when invalid_text_representation then
    return null;
  end;
end;
$$;

create or replace function private.legacy_storage_company_id(p_name text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[];
  v_user_id uuid;
  v_company_id uuid;
begin
  v_parts := storage.foldername(p_name);
  if coalesce(array_length(v_parts, 1), 0) < 1 then
    return null;
  end if;
  begin
    v_user_id := v_parts[1]::uuid;
  exception when invalid_text_representation then
    return null;
  end;
  select c.id into v_company_id
  from public.companies c
  where c.legacy_owner_user_id = v_user_id
    and c.status = 'ACTIVE';
  return v_company_id;
end;
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.is_platform_admin(); $$;

create or replace function public.is_active_company_member(p_company_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.is_active_company_member(p_company_id); $$;

create or replace function public.has_company_permission(p_company_id uuid, p_permission_key text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.has_company_permission(p_company_id, p_permission_key); $$;

grant execute on function private.is_platform_admin() to authenticated;
grant execute on function private.current_verified_email() to authenticated;
grant execute on function private.is_active_company_member(uuid) to authenticated;
grant execute on function private.can_read_company_metadata(uuid) to authenticated;
grant execute on function private.has_company_permission(uuid, text) to authenticated;
grant execute on function private.resolve_transition_company() to authenticated;
grant execute on function private.storage_company_id(text) to authenticated;
grant execute on function private.legacy_storage_company_id(text) to authenticated;
revoke execute on function private.is_platform_admin() from public, anon;
revoke execute on function private.current_verified_email() from public, anon;
revoke execute on function private.is_active_company_member(uuid) from public, anon;
revoke execute on function private.can_read_company_metadata(uuid) from public, anon;
revoke execute on function private.has_company_permission(uuid, text) from public, anon;
revoke execute on function private.resolve_transition_company() from public, anon;
revoke execute on function private.storage_company_id(text) from public, anon;
revoke execute on function private.legacy_storage_company_id(text) from public, anon;
revoke execute on function public.is_platform_admin() from public, anon;
revoke execute on function public.is_active_company_member(uuid) from public, anon;
revoke execute on function public.has_company_permission(uuid, text) from public, anon;
grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_active_company_member(uuid) to authenticated;
grant execute on function public.has_company_permission(uuid, text) to authenticated;
