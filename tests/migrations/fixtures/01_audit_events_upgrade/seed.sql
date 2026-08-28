-- Upgrade Test Seed: Insert historical companies, users, and audit records
-- representing the state of production before 20260826120000_cash_banking_foundation.sql.

do $$
declare
  v_company_id uuid := '11111111-1111-1111-1111-111111111111'::uuid;
  v_user_id uuid := '22222222-2222-2222-2222-222222222222'::uuid;
begin
  -- Ensure test user in auth.users if auth schema exists
  if to_regclass('auth.users') is not null then
    insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
    values (v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'historical-audit-tester@example.com', '{"name":"Audit Tester"}'::jsonb, now(), now())
    on conflict (id) do nothing;
  end if;

  -- Ensure company in public.companies
  insert into public.companies (id, name, company_code, status, default_currency, timezone, legacy_owner_user_id)
  values (v_company_id, 'Upgrade Test Corp', 'upg-corp', 'ACTIVE', 'PHP', 'Asia/Manila', v_user_id)
  on conflict (id) do nothing;

  -- Represent inherited operator state that the single-company closure must
  -- remove without depending on a named developer identity.
  insert into public.platform_admin_allowlist (normalized_email)
  values ('historical-audit-tester@example.com')
  on conflict (normalized_email) do nothing;
  insert into public.platform_admins (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  -- Seed representative historical audit rows across all pre-Cash categories
  insert into public.company_audit_events (company_id, actor_user_id, event_type, target_type, metadata)
  values
    -- Company & Member lifecycle
    (v_company_id, v_user_id, 'COMPANY_CREATED', 'company', '{"company_code":"upg-corp"}'::jsonb),
    (v_company_id, v_user_id, 'COMPANY_UPDATED', 'company', '{"timezone":"Asia/Manila"}'::jsonb),
    (v_company_id, v_user_id, 'USER_INVITED', 'invitation', '{"role_key":"FINANCE"}'::jsonb),
    (v_company_id, v_user_id, 'INVITE_ACCEPTED', 'invitation', '{"role_key":"FINANCE"}'::jsonb),
    (v_company_id, v_user_id, 'MEMBER_ROLE_CHANGED', 'membership', '{"role_key":"PAYROLL"}'::jsonb),
    -- Payroll Maintenance & Factory Reset
    (v_company_id, v_user_id, 'PAYROLL_REPAIR_APPLIED', 'payroll_maintenance', '{"repaired_periods":2}'::jsonb),
    (v_company_id, v_user_id, 'PAYROLL_CALENDAR_REBUILT', 'payroll_maintenance', '{"rebuilt_periods":4}'::jsonb),
    (v_company_id, v_user_id, 'PAYROLL_UNAPPROVED_RESET', 'payroll_maintenance', '{"reset_runs":1}'::jsonb),
    (v_company_id, v_user_id, 'PAYROLL_WORKSPACE_RESET', 'company', '{"confirmed":true}'::jsonb),
    -- Company AI Credentials & Hardening
    (v_company_id, v_user_id, 'COMPANY_AI_CREDENTIAL_CONFIGURED', 'company_ai_credential', '{"provider":"GEMINI"}'::jsonb),
    (v_company_id, v_user_id, 'COMPANY_AI_CREDENTIAL_ROTATED', 'company_ai_credential', '{"version":2}'::jsonb),
    (v_company_id, v_user_id, 'COMPANY_AI_CREDENTIAL_TESTED', 'company_ai_credential', '{"test_status":"SUCCESS"}'::jsonb),
    (v_company_id, v_user_id, 'COMPANY_AI_CREDENTIAL_ENABLED', 'company_ai_credential', '{"enabled":true}'::jsonb),
    (v_company_id, v_user_id, 'COMPANY_AI_CREDENTIAL_DISABLED', 'company_ai_credential', '{"disabled":true}'::jsonb),
    (v_company_id, v_user_id, 'COMPANY_AI_CREDENTIAL_REMOVED', 'company_ai_credential', '{"version":2}'::jsonb);
end $$;
