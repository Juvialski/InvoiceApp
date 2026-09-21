-- This fixture intentionally seeds only the historical company boundary. The
-- managed-document layer is additive and must create its own tables/functions
-- without rewriting earlier source/template/delivery rows.
do $$
declare
  v_company_id uuid := '55555555-5555-4555-8555-555555555555'::uuid;
begin
  insert into public.companies (id, name, company_code, status, default_currency, timezone)
  values (v_company_id, 'Managed Documents Upgrade Company', 'managed-docs-upgrade', 'ACTIVE', 'PHP', 'Asia/Manila')
  on conflict (id) do nothing;
end $$;
