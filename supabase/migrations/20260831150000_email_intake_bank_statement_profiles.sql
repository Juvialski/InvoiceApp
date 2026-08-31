-- Email Intake Phase 4D: Bank statement parser and template profiles
-- Extends email_intake_profiles with optional company-scoped parser profile,
-- expected institution, and expected currency for deterministic bank statement handling.

alter table public.email_intake_profiles
  add column if not exists statement_parser_profile text,
  add column if not exists expected_institution text,
  add column if not exists expected_currency text;

create index if not exists email_intake_profiles_parser_profile_idx
  on public.email_intake_profiles(company_id, statement_parser_profile)
  where statement_parser_profile is not null;
