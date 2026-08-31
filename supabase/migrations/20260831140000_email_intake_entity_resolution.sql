-- Email Intake Phase 4B: Entity Resolution Linkage
-- Extends email_intake_profiles with optional company-scoped references to
-- existing Vendors and FinancialAccounts, plus default expense category.

alter table public.email_intake_profiles
  add column if not exists linked_vendor_id uuid references public.vendors(id) on delete set null,
  add column if not exists linked_financial_account_id uuid references public.financial_accounts(id) on delete set null,
  add column if not exists default_expense_category text;

create index if not exists email_intake_profiles_linked_vendor_idx
  on public.email_intake_profiles(company_id, linked_vendor_id)
  where linked_vendor_id is not null;

create index if not exists email_intake_profiles_linked_account_idx
  on public.email_intake_profiles(company_id, linked_financial_account_id)
  where linked_financial_account_id is not null;

-- Enforce company boundary on linked vendor and financial account
create or replace function public.validate_email_intake_profile_links()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.linked_vendor_id is not null and not exists (
    select 1 from public.vendors v where v.id = new.linked_vendor_id and v.company_id = new.company_id
  ) then
    raise exception 'Linked vendor is outside the company'
      using errcode = '42501';
  end if;

  if new.linked_financial_account_id is not null and not exists (
    select 1 from public.financial_accounts fa where fa.id = new.linked_financial_account_id and fa.company_id = new.company_id
  ) then
    raise exception 'Linked financial account is outside the company'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists email_intake_profiles_validate_links on public.email_intake_profiles;
create trigger email_intake_profiles_validate_links
  before insert or update on public.email_intake_profiles
  for each row execute function public.validate_email_intake_profile_links();
