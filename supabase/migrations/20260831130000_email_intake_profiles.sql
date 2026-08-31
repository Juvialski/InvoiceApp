-- Email Intake Phase 4A: Company-scoped saved sender and template profiles for
-- deterministic candidate discovery and financial classification.

insert into private.company_tenant_policy_catalog (table_name, read_permission, write_permission, allow_insert, allow_update, allow_delete)
values
  ('email_intake_profiles', 'gmail.read', 'gmail.manage', true, true, true)
on conflict (table_name) do update set
  read_permission = excluded.read_permission,
  write_permission = excluded.write_permission,
  allow_insert = excluded.allow_insert,
  allow_update = excluded.allow_update,
  allow_delete = excluded.allow_delete;

create table if not exists public.email_intake_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  enabled boolean not null default true,
  sender_email text,
  sender_domain text,
  subject_contains text,
  attachment_condition text,
  suggested_destination text not null check (suggested_destination in ('INVOICE', 'BANK_STATEMENT', 'EXPENSE')),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_intake_profiles_name_nonblank check (btrim(name) <> ''),
  constraint email_intake_profiles_sender_boundary check (
    (sender_email is not null and btrim(sender_email) <> '') or
    (sender_domain is not null and btrim(sender_domain) <> '')
  ),
  constraint email_intake_profiles_sender_email_format check (
    sender_email is null or btrim(sender_email) = '' or
    btrim(sender_email) ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
  ),
  constraint email_intake_profiles_sender_domain_format check (
    sender_domain is null or btrim(sender_domain) = '' or (
      lower(btrim(sender_domain)) ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
      and lower(btrim(sender_domain)) not in (
        'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.com.ph', 'hotmail.com',
        'outlook.com', 'live.com', 'icloud.com', 'aol.com', 'proton.me',
        'protonmail.com', 'mail.com', 'me.com', 'msn.com', 'com', 'net',
        'org', 'ph', 'com.ph'
      )
    )
  )
);

create index if not exists email_intake_profiles_company_idx
  on public.email_intake_profiles(company_id, enabled);

create index if not exists email_intake_profiles_sender_email_idx
  on public.email_intake_profiles(company_id, lower(sender_email))
  where sender_email is not null;

create index if not exists email_intake_profiles_sender_domain_idx
  on public.email_intake_profiles(company_id, lower(sender_domain))
  where sender_domain is not null;

drop trigger if exists email_intake_profiles_updated_at on public.email_intake_profiles;
create trigger email_intake_profiles_updated_at
  before update on public.email_intake_profiles
  for each row execute function private.set_company_updated_at();

alter table public.email_intake_profiles enable row level security;

drop policy if exists email_intake_profiles_company_select on public.email_intake_profiles;
create policy email_intake_profiles_company_select on public.email_intake_profiles
  for select to authenticated
  using ((select public.has_company_permission(company_id, 'gmail.read')));

drop policy if exists email_intake_profiles_company_insert on public.email_intake_profiles;
create policy email_intake_profiles_company_insert on public.email_intake_profiles
  for insert to authenticated
  with check ((select public.has_company_permission(company_id, 'gmail.manage')));

drop policy if exists email_intake_profiles_company_update on public.email_intake_profiles;
create policy email_intake_profiles_company_update on public.email_intake_profiles
  for update to authenticated
  using ((select public.has_company_permission(company_id, 'gmail.manage')))
  with check ((select public.has_company_permission(company_id, 'gmail.manage')));

drop policy if exists email_intake_profiles_company_delete on public.email_intake_profiles;
create policy email_intake_profiles_company_delete on public.email_intake_profiles
  for delete to authenticated
  using ((select public.has_company_permission(company_id, 'gmail.manage')));
