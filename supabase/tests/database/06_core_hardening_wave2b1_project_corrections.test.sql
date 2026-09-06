begin;
select no_plan();

select has_function('public', 'preview_project_lifecycle', 'project lifecycle preflight exists');
select has_function('public', 'apply_project_lifecycle', 'project lifecycle RPC exists');
select is_empty(
  $$select 1
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name = 'projects'
     and grantee = 'authenticated'
     and privilege_type = 'DELETE'$$,
  'authenticated cannot bypass project lifecycle with direct DELETE'
);
select isnt_empty(
  $$select 1
    from pg_proc
   where oid = 'public.preview_project_lifecycle(uuid)'::regprocedure
     and prosecdef
     and coalesce(array_to_string(proconfig, ','), '') like '%search_path=""%'$$,
  'project preflight is SECURITY DEFINER with an empty search_path'
);
select isnt_empty(
  $$select 1
    from pg_proc
   where oid = 'public.apply_project_lifecycle(uuid,text,text)'::regprocedure
     and prosecdef
     and coalesce(array_to_string(proconfig, ','), '') like '%search_path=""%'$$,
  'project lifecycle RPC is SECURITY DEFINER with an empty search_path'
);
select is_empty(
  $$select 1
    from information_schema.routine_privileges
   where routine_schema = 'public'
     and routine_name in ('preview_project_lifecycle', 'apply_project_lifecycle')
     and lower(grantee) in ('anon', 'public')
     and privilege_type = 'EXECUTE'$$,
  'anonymous and public roles cannot execute project lifecycle RPCs'
);

create temp table wave2b1_ids as
select
  '00000000-0000-4000-8000-000000000201'::uuid as admin_user,
  '00000000-0000-4000-8000-000000000202'::uuid as finance_user,
  '00000000-0000-4000-8000-000000000203'::uuid as suspended_user,
  '00000000-0000-4000-8000-000000000204'::uuid as outsider_user,
  '00000000-0000-4000-8000-000000000205'::uuid as nonmember_user,
  '00000000-0000-4000-8000-000000000206'::uuid as denied_user,
  'aaaaaaaa-0000-4000-8000-000000000201'::uuid as company_a,
  'bbbbbbbb-0000-4000-8000-000000000202'::uuid as company_b,
  '10000000-0000-4000-8000-000000000201'::uuid as project_unused,
  '10000000-0000-4000-8000-000000000202'::uuid as project_used,
  '10000000-0000-4000-8000-000000000203'::uuid as project_stale,
  '10000000-0000-4000-8000-000000000204'::uuid as project_terminal,
  '20000000-0000-4000-8000-000000000201'::uuid as project_other_company,
  '30000000-0000-4000-8000-000000000201'::uuid as worker_used,
  '40000000-0000-4000-8000-000000000201'::uuid as period_used,
  '50000000-0000-4000-8000-000000000201'::uuid as run_used,
  '60000000-0000-4000-8000-000000000201'::uuid as entry_used,
  '70000000-0000-4000-8000-000000000201'::uuid as work_used,
  '80000000-0000-4000-8000-000000000201'::uuid as overtime_used,
  '90000000-0000-4000-8000-000000000201'::uuid as batch_used,
  'a0000000-0000-4000-8000-000000000201'::uuid as import_row_used,
  'b0000000-0000-4000-8000-000000000201'::uuid as invoice_used,
  'c0000000-0000-4000-8000-000000000201'::uuid as document_used,
  'd0000000-0000-4000-8000-000000000201'::uuid as accounting_event_used;

grant select on wave2b1_ids to authenticated, service_role;

insert into auth.users (id, email, encrypted_password, created_at, updated_at)
select id, email, 'x', now(), now()
from (values
  ((select admin_user from wave2b1_ids), 'wave2b1-admin@test.local'),
  ((select finance_user from wave2b1_ids), 'wave2b1-finance@test.local'),
  ((select suspended_user from wave2b1_ids), 'wave2b1-suspended@test.local'),
  ((select outsider_user from wave2b1_ids), 'wave2b1-outsider@test.local'),
  ((select nonmember_user from wave2b1_ids), 'wave2b1-nonmember@test.local'),
  ((select denied_user from wave2b1_ids), 'wave2b1-denied@test.local')
) users(id, email)
on conflict (id) do nothing;

insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values
  ((select company_a from wave2b1_ids), 'Wave 2B1 Test Company', 'wave2b1-a', 'ACTIVE', 'PHP', 'Asia/Manila', (select admin_user from wave2b1_ids), (select admin_user from wave2b1_ids)),
  ((select company_b from wave2b1_ids), 'Wave 2B1 Other Company', 'wave2b1-b', 'ACTIVE', 'USD', 'UTC', (select outsider_user from wave2b1_ids), (select outsider_user from wave2b1_ids));

insert into public.company_members (company_id, user_id, role_key, status)
values
  ((select company_a from wave2b1_ids), (select admin_user from wave2b1_ids), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_a from wave2b1_ids), (select finance_user from wave2b1_ids), 'FINANCE', 'ACTIVE'),
  ((select company_a from wave2b1_ids), (select suspended_user from wave2b1_ids), 'FINANCE', 'SUSPENDED'),
  ((select company_a from wave2b1_ids), (select denied_user from wave2b1_ids), 'FINANCE', 'ACTIVE'),
  ((select company_b from wave2b1_ids), (select outsider_user from wave2b1_ids), 'COMPANY_ADMIN', 'ACTIVE');

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_a from wave2b1_ids));

insert into public.company_member_permission_overrides (company_id, membership_id, permission_key, effect, created_by_user_id)
select cm.company_id, cm.id, 'projects.manage', 'DENY', (select admin_user from wave2b1_ids)
from public.company_members cm
where cm.company_id = (select company_a from wave2b1_ids)
  and cm.user_id = (select denied_user from wave2b1_ids);

insert into public.projects (id, user_id, company_id, project_code, project_name, status, project_budget, currency, tax_treatment)
values
  ((select project_unused from wave2b1_ids), (select admin_user from wave2b1_ids), (select company_a from wave2b1_ids), 'W2B1-U', 'Wave 2B1 Unused Project', 'PLANNING', 0, 'PHP', 'VAT'),
  ((select project_used from wave2b1_ids), (select admin_user from wave2b1_ids), (select company_a from wave2b1_ids), 'W2B1-H', 'Wave 2B1 Historical Project', 'ACTIVE', 100000, 'PHP', 'VAT'),
  ((select project_stale from wave2b1_ids), (select admin_user from wave2b1_ids), (select company_a from wave2b1_ids), 'W2B1-S', 'Wave 2B1 Stale Preview Project', 'ACTIVE', 100000, 'PHP', 'VAT'),
  ((select project_terminal from wave2b1_ids), (select admin_user from wave2b1_ids), (select company_a from wave2b1_ids), 'W2B1-T', 'Wave 2B1 Terminal Project', 'CANCELLED', 100000, 'PHP', 'VAT'),
  ((select project_other_company from wave2b1_ids), (select outsider_user from wave2b1_ids), (select company_b from wave2b1_ids), 'W2B1-X', 'Wave 2B1 Foreign Project', 'ACTIVE', 100000, 'USD', 'VAT');

set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from wave2b1_ids), true);

insert into public.invoices (id, user_id, company_id, invoice_number, currency, grand_total, payment_status, review_status, current_data)
values ((select invoice_used from wave2b1_ids), (select admin_user from wave2b1_ids), (select company_a from wave2b1_ids), 'W2B1-INV-001', 'PHP', 100, 'UNPAID', 'VERIFIED', '{}'::jsonb);

insert into public.invoice_project_allocations (id, user_id, company_id, invoice_id, project_id, allocation_type, allocation_amount, currency)
values (gen_random_uuid(), (select admin_user from wave2b1_ids), (select company_a from wave2b1_ids), (select invoice_used from wave2b1_ids), (select project_used from wave2b1_ids), 'AMOUNT', 100, 'PHP');

insert into public.expenses (id, user_id, company_id, project_id, expense_date, category, description, amount, currency, status)
values (gen_random_uuid(), (select admin_user from wave2b1_ids), (select company_a from wave2b1_ids), (select project_used from wave2b1_ids), date '2026-01-02', 'Materials', 'Historical project expense', 25, 'PHP', 'APPROVED');

insert into public.workers (id, user_id, company_id, employee_code, first_name, last_name, display_name, employment_status, employment_type, default_pay_type, default_rate, default_labor_context, default_project_id, active)
values ((select worker_used from wave2b1_ids), (select admin_user from wave2b1_ids), (select company_a from wave2b1_ids), 'W2B1-WORKER', 'Used', 'Worker', 'Wave 2B1 Worker', 'ACTIVE', 'REGULAR', 'MONTHLY', 1000, 'PROJECT', (select project_used from wave2b1_ids), true);

insert into public.payroll_periods (id, user_id, company_id, period_start, period_end, status, locked_at)
values ((select period_used from wave2b1_ids), (select admin_user from wave2b1_ids), (select company_a from wave2b1_ids), date '2026-01-01', date '2026-01-31', 'OPEN', null);

insert into public.payroll_runs (id, user_id, company_id, period_id, status)
values ((select run_used from wave2b1_ids), (select admin_user from wave2b1_ids), (select company_a from wave2b1_ids), (select period_used from wave2b1_ids), 'DRAFT');

insert into public.payroll_entries (id, user_id, company_id, payroll_run_id, worker_id, gross_pay, net_pay, project_allocated_cost, cost_context, calculation_snapshot)
values ((select entry_used from wave2b1_ids), (select admin_user from wave2b1_ids), (select company_a from wave2b1_ids), (select run_used from wave2b1_ids), (select worker_used from wave2b1_ids), 1000, 1000, 100, jsonb_build_object('type', 'PROJECT', 'projectId', (select project_used::text from wave2b1_ids)), '{}'::jsonb);

insert into public.payroll_project_allocations (id, user_id, company_id, payroll_entry_id, project_id, allocation_amount, allocation_percentage, source)
values (gen_random_uuid(), (select admin_user from wave2b1_ids), (select company_a from wave2b1_ids), (select entry_used from wave2b1_ids), (select project_used from wave2b1_ids), 100, 100, 'MANUAL');

insert into public.project_worker_assignments (id, user_id, company_id, worker_id, project_id, start_date, active, role_on_project)
values (gen_random_uuid(), (select admin_user from wave2b1_ids), (select company_a from wave2b1_ids), (select worker_used from wave2b1_ids), (select project_used from wave2b1_ids), date '2026-01-01', true, 'Lead');

insert into public.work_entries (id, user_id, company_id, worker_id, project_id, period_id, work_date, regular_hours, rate, status, labor_context)
values ((select work_used from wave2b1_ids), (select admin_user from wave2b1_ids), (select company_a from wave2b1_ids), (select worker_used from wave2b1_ids), (select project_used from wave2b1_ids), (select period_used from wave2b1_ids), date '2026-01-03', 8, 100, 'DRAFT', 'PROJECT');

insert into public.overtime_requests (id, user_id, company_id, worker_id, period_id, overtime_date, project_id, labor_context, requested_minutes, approved_minutes, status, source)
values ((select overtime_used from wave2b1_ids), (select admin_user from wave2b1_ids), (select company_a from wave2b1_ids), (select worker_used from wave2b1_ids), (select period_used from wave2b1_ids), date '2026-01-04', (select project_used from wave2b1_ids), 'PROJECT', 60, 0, 'PENDING', 'MANUAL');

insert into public.payroll_import_batches (id, user_id, company_id, original_filename, file_sha256, file_size, storage_path, status)
values ((select batch_used from wave2b1_ids), (select admin_user from wave2b1_ids), (select company_a from wave2b1_ids), 'wave2b1.xlsx', repeat('a', 64), 1, 'imports/wave2b1.xlsx', 'UPLOADED');

insert into public.payroll_import_rows (id, user_id, company_id, batch_id, source_sheet, source_row, project_match_status, labor_context_type, project_id)
values ((select import_row_used from wave2b1_ids), (select admin_user from wave2b1_ids), (select company_a from wave2b1_ids), (select batch_used from wave2b1_ids), 'Sheet1', 2, 'MATCHED', 'PROJECT', (select project_used from wave2b1_ids));

insert into public.engineering_documents (id, company_id, project_id, document_number, title, discipline, document_type, created_by_user_id)
values ((select document_used from wave2b1_ids), (select company_a from wave2b1_ids), (select project_used from wave2b1_ids), 'W2B1-DOC-001', 'Historical project drawing', 'GENERAL_ENGINEERING', 'DRAWING', (select admin_user from wave2b1_ids));

insert into public.project_accounting_events (id, user_id, company_id, project_id, entity_type, entity_id, event_type, description, metadata)
values ((select accounting_event_used from wave2b1_ids), (select admin_user from wave2b1_ids), (select company_a from wave2b1_ids), (select project_used from wave2b1_ids), 'project', (select project_used from wave2b1_ids), 'HISTORICAL_FIXTURE', 'Historical project accounting reference', '{}'::jsonb);

-- Anonymous callers cannot reach the public lifecycle surface.
reset role;
set local role anon;
select throws_ok(
  $$select public.preview_project_lifecycle('10000000-0000-4000-8000-000000000202'::uuid)$$,
  '42501', null,
  'anonymous project preflight execution is denied'
);
reset role;

-- The authorized active member sees bounded counts, not employee/payroll details.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from wave2b1_ids), true);
select is((public.preview_project_lifecycle((select project_unused from wave2b1_ids))->>'canDelete')::boolean, true, 'unused project is delete-eligible after authoritative preflight');
select is((public.preview_project_lifecycle((select project_unused from wave2b1_ids))->>'recommendedAction'), 'DELETE_UNUSED', 'unused project recommends explicit unused deletion');
select is((public.preview_project_lifecycle((select project_used from wave2b1_ids))->>'canDelete')::boolean, false, 'used project is not delete-eligible');
select is((public.preview_project_lifecycle((select project_used from wave2b1_ids))->>'recommendedAction'), 'ARCHIVE', 'used project recommends archive');
select is((public.preview_project_lifecycle((select project_used from wave2b1_ids))->'dependencies'->>'invoiceProjectAllocations')::bigint, 1::bigint, 'invoice allocation dependency is counted');
select is((public.preview_project_lifecycle((select project_used from wave2b1_ids))->'dependencies'->>'expenses')::bigint, 1::bigint, 'expense dependency is counted');
select is((public.preview_project_lifecycle((select project_used from wave2b1_ids))->'dependencies'->>'projectWorkerAssignments')::bigint, 1::bigint, 'worker assignment dependency is counted');
select is((public.preview_project_lifecycle((select project_used from wave2b1_ids))->'dependencies'->>'workEntries')::bigint, 1::bigint, 'work-entry dependency is counted');
select is((public.preview_project_lifecycle((select project_used from wave2b1_ids))->'dependencies'->>'overtimeRequests')::bigint, 1::bigint, 'overtime dependency is counted');
select is((public.preview_project_lifecycle((select project_used from wave2b1_ids))->'dependencies'->>'payrollProjectAllocations')::bigint, 1::bigint, 'payroll allocation dependency is counted');
select is((public.preview_project_lifecycle((select project_used from wave2b1_ids))->'dependencies'->>'payrollImportRows')::bigint, 1::bigint, 'payroll import provenance dependency is counted');
select is((public.preview_project_lifecycle((select project_used from wave2b1_ids))->'dependencies'->>'workerDefaultProjects')::bigint, 1::bigint, 'worker default-project dependency is counted');
select is((public.preview_project_lifecycle((select project_used from wave2b1_ids))->'dependencies'->>'engineeringDocuments')::bigint, 1::bigint, 'engineering document dependency is counted');
select is((public.preview_project_lifecycle((select project_used from wave2b1_ids))->'dependencies'->>'projectAccountingEvents')::bigint, 1::bigint, 'project accounting dependency is counted');
select is((public.preview_project_lifecycle((select project_used from wave2b1_ids))->>'totalDependencyCount')::bigint, 11::bigint, 'preflight total contains only bounded dependency counts');

select throws_ok(
  $$delete from public.projects where id = (select project_unused from wave2b1_ids)$$,
  '42501', null,
  'direct project DELETE is denied even for an unused project'
);
select throws_ok(
  $$select public.apply_project_lifecycle((select project_used from wave2b1_ids), 'DELETE_UNUSED', null)$$,
  '42501', null,
  'used project cannot be permanently deleted'
);
select is((select count(*) from public.company_audit_events where company_id = (select company_a from wave2b1_ids) and event_type = 'PROJECT_DELETED_UNUSED' and target_id = (select project_used from wave2b1_ids)), 0::bigint, 'failed used-project delete emits no false-success audit');

-- Archive preserves every linked identity represented by this fixture.
select is((public.apply_project_lifecycle((select project_used from wave2b1_ids), 'ARCHIVE', 'Project close-out correction')->'record'->>'status'), 'ARCHIVED', 'used project can be archived');
select is((select status from public.projects where id = (select project_used from wave2b1_ids)), 'ARCHIVED', 'archive preserves the project row');
select is((select count(*) from public.invoice_project_allocations where project_id = (select project_used from wave2b1_ids)), 1::bigint, 'archive preserves invoice allocation identity');
select is((select count(*) from public.expenses where project_id = (select project_used from wave2b1_ids)), 1::bigint, 'archive preserves expense identity');
select is((select count(*) from public.payroll_project_allocations where project_id = (select project_used from wave2b1_ids)), 1::bigint, 'archive preserves payroll allocation identity');
select is((select count(*) from public.engineering_documents where project_id = (select project_used from wave2b1_ids)), 1::bigint, 'archive preserves engineering document identity');
select is((select count(*) from public.project_accounting_events where project_id = (select project_used from wave2b1_ids)), 1::bigint, 'archive preserves project accounting identity');
select is((select count(*) from public.company_audit_events where company_id = (select company_a from wave2b1_ids) and event_type = 'PROJECT_ARCHIVED' and target_id = (select project_used from wave2b1_ids)), 1::bigint, 'archive emits one audit event');
select lives_ok($$select public.apply_project_lifecycle((select project_used from wave2b1_ids), 'ARCHIVE', null)$$, 'repeated archive is idempotent without a second reason');
select is((select count(*) from public.company_audit_events where company_id = (select company_a from wave2b1_ids) and event_type = 'PROJECT_ARCHIVED' and target_id = (select project_used from wave2b1_ids)), 1::bigint, 'repeated archive emits no duplicate audit');
select throws_ok(
  $$update public.projects set status = 'ACTIVE' where id = (select project_used from wave2b1_ids)$$,
  '42501', null,
  'generic project update cannot bypass lifecycle state changes'
);
select throws_ok(
  $$insert into public.expenses (user_id, company_id, project_id, expense_date, category, description, amount, currency, status) values ((select admin_user from wave2b1_ids), (select company_a from wave2b1_ids), (select project_used from wave2b1_ids), current_date, 'Materials', 'Archived project write', 1, 'PHP', 'DRAFT')$$,
  '42501', null,
  'archived project rejects new expenses'
);
select throws_ok(
  $$insert into public.engineering_documents (company_id, project_id, document_number, title, discipline, document_type, created_by_user_id) values ((select company_a from wave2b1_ids), (select project_used from wave2b1_ids), 'W2B1-DOC-ARCHIVED', 'Archived project drawing', 'GENERAL_ENGINEERING', 'DRAWING', (select admin_user from wave2b1_ids))$$,
  '42501', null,
  'archived project rejects new engineering records'
);

select is((public.preview_project_lifecycle((select project_used from wave2b1_ids))->>'canReactivate')::boolean, true, 'archived project from an active state can reactivate');
select is((public.preview_project_lifecycle((select project_used from wave2b1_ids))->>'recommendedAction'), 'REACTIVATE', 'archived project recommends explicit reactivation');
select is((public.apply_project_lifecycle((select project_used from wave2b1_ids), 'REACTIVATE', 'Project correction completed')->'record'->>'status'), 'ACTIVE', 'reactivation restores the prior non-terminal state');
select is((select archived_at from public.projects where id = (select project_used from wave2b1_ids)), null::timestamptz, 'reactivation clears the archive timestamp');
select is((select count(*) from public.company_audit_events where company_id = (select company_a from wave2b1_ids) and event_type = 'PROJECT_REACTIVATED' and target_id = (select project_used from wave2b1_ids)), 1::bigint, 'reactivation emits one audit event');

-- A preview is advisory; the mutation rechecks authoritative dependencies.
select is((public.preview_project_lifecycle((select project_stale from wave2b1_ids))->>'canDelete')::boolean, true, 'stale project initially appears unused');
insert into public.expenses (user_id, company_id, project_id, expense_date, category, description, amount, currency, status)
values ((select admin_user from wave2b1_ids), (select company_a from wave2b1_ids), (select project_stale from wave2b1_ids), current_date, 'Materials', 'Dependency added after preview', 1, 'PHP', 'DRAFT');
select throws_ok(
  $$select public.apply_project_lifecycle((select project_stale from wave2b1_ids), 'DELETE_UNUSED', null)$$,
  '42501', null,
  'delete rechecks a dependency added after preflight'
);
select is((select count(*) from public.projects where id = (select project_stale from wave2b1_ids)), 1::bigint, 'stale-preview project remains after authoritative recheck failure');
select is((select count(*) from public.company_audit_events where company_id = (select company_a from wave2b1_ids) and event_type = 'PROJECT_DELETED_UNUSED' and target_id = (select project_stale from wave2b1_ids)), 0::bigint, 'stale-preview failure emits no delete audit');

-- An unused project is deleted only through the lifecycle RPC.
select is((public.apply_project_lifecycle((select project_unused from wave2b1_ids), 'DELETE_UNUSED', null)->>'deleted')::boolean, true, 'unused project can be permanently deleted');
select is((select count(*) from public.projects where id = (select project_unused from wave2b1_ids)), 0::bigint, 'unused project was removed');
select is((select count(*) from public.company_audit_events where company_id = (select company_a from wave2b1_ids) and event_type = 'PROJECT_DELETED_UNUSED' and target_id = (select project_unused from wave2b1_ids)), 1::bigint, 'unused delete emits one audit event');

-- Archived projects from a terminal business state cannot be reactivated.
select lives_ok($$select public.apply_project_lifecycle((select project_terminal from wave2b1_ids), 'ARCHIVE', 'Retain cancelled project history')$$, 'terminal project can be archived');
select is((public.preview_project_lifecycle((select project_terminal from wave2b1_ids))->>'canReactivate')::boolean, false, 'terminal project is not reactivation-eligible');
select throws_ok(
  $$select public.apply_project_lifecycle((select project_terminal from wave2b1_ids), 'REACTIVATE', 'Attempted terminal bypass')$$,
  '42501', null,
  'reactivation cannot bypass a terminal prior project state'
);

-- Active/suspended/non-member/effective-deny/wrong-company authorization probes.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select suspended_user::text from wave2b1_ids), true);
select throws_ok($$select public.preview_project_lifecycle((select project_stale from wave2b1_ids))$$, '42501', null, 'suspended member cannot preview project lifecycle');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select nonmember_user::text from wave2b1_ids), true);
select throws_ok($$select public.preview_project_lifecycle((select project_stale from wave2b1_ids))$$, '42501', null, 'non-member cannot preview project lifecycle');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select denied_user::text from wave2b1_ids), true);
select throws_ok($$select public.apply_project_lifecycle((select project_stale from wave2b1_ids), 'ARCHIVE', 'Denied')$$, '42501', null, 'effective explicit DENY blocks project mutation');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select outsider_user::text from wave2b1_ids), true);
select throws_ok($$select public.apply_project_lifecycle((select project_stale from wave2b1_ids), 'ARCHIVE', 'Wrong company')$$, '42501', null, 'wrong-company project target is rejected');

-- Project lifecycle audit metadata is bounded and contains no sensitive values.
select is_empty(
  $$select 1
    from public.company_audit_events
   where company_id = (select company_a from wave2b1_ids)
     and event_type in ('PROJECT_DELETED_UNUSED', 'PROJECT_ARCHIVED', 'PROJECT_REACTIVATED')
     and metadata::text ~* '"(gross(_?pay)?|net(_?pay)?|salary(_?rate)?|default_?rate|rate|amount|base_?pay|regular_?pay|overtime_?pay|allowances|deductions|employer_?costs|bank_?account|account_?number)"[[:space:]]*:'$$,
  'project lifecycle audit metadata does not expose payroll or monetary fields'
);

reset role;
select * from finish();
rollback;
