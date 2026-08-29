-- Historical engineering records seeded before Core Hardening Wave 2C.
select set_config('request.jwt.claim.sub', 'd2c20000-0000-4000-8000-000000000001', false);

do $$
declare
  v_company_id uuid := 'd2c10000-0000-4000-8000-000000000001'::uuid;
  v_user_id uuid := 'd2c20000-0000-4000-8000-000000000001'::uuid;
  v_project_id uuid := 'd2c30000-0000-4000-8000-000000000001'::uuid;
  v_document_id uuid := 'd2c40000-0000-4000-8000-000000000001'::uuid;
  v_site_log_id uuid := 'd2c50000-0000-4000-8000-000000000001'::uuid;
begin
  insert into auth.users (id, email, encrypted_password, created_at, updated_at)
  values (v_user_id, 'engineering-upgrade@test.local', 'x', now(), now())
  on conflict (id) do nothing;

  insert into public.companies (id, name, company_code, status, default_currency, timezone, legacy_owner_user_id)
  values (v_company_id, 'Engineering Upgrade Company', 'engineering-upgrade', 'ACTIVE', 'PHP', 'Asia/Manila', v_user_id)
  on conflict (id) do nothing;

  insert into public.company_members (company_id, user_id, role_key, status)
  values (v_company_id, v_user_id, 'COMPANY_ADMIN', 'ACTIVE');

  insert into public.projects (id, user_id, company_id, project_code, project_name, status, project_budget, currency)
  values (v_project_id, v_user_id, v_company_id, 'UPG-ENG-01', 'Engineering Upgrade Project', 'ACTIVE', 100000, 'PHP');

  insert into public.engineering_documents (
    id, company_id, project_id, document_number, title, discipline, document_type,
    status, current_revision_number, created_by_user_id
  ) values (
    v_document_id, v_company_id, v_project_id, 'UPG-DOC-001', 'Historical superseded document',
    'STRUCTURAL', 'DRAWING', 'SUPERSEDED', '2', v_user_id
  );

  insert into public.engineering_daily_site_logs (
    id, company_id, project_id, site_date, report_number, status, prepared_by_user_id,
    submitted_by_user_id, finalized_by_user_id, work_summary, created_at, updated_at,
    submitted_at, finalized_at
  ) values (
    v_site_log_id, v_company_id, v_project_id, date '2026-08-27', 'UPG-DSL-001', 'FINALIZED', v_user_id,
    v_user_id, v_user_id, 'Historical finalized field observation', now(), now(), now(), now()
  );

  insert into public.engineering_daily_site_log_events (
    company_id, site_log_id, event_type, from_status, to_status, actor_user_id
  ) values
    (v_company_id, v_site_log_id, 'CREATED', null, 'DRAFT', v_user_id),
    (v_company_id, v_site_log_id, 'SUBMITTED', 'DRAFT', 'SUBMITTED', v_user_id),
    (v_company_id, v_site_log_id, 'FINALIZED', 'SUBMITTED', 'FINALIZED', v_user_id);
end $$;
