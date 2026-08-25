-- Functional PostgreSQL test of the payroll workspace factory reset.
-- Runs against a throwaway database after the full migration chain applied.
-- Prints ALL_FUNCTIONAL_TESTS_PASSED on success; aborts on any failure.

-- Fixed identities for reproducible seeding (test-only values).
create temp table reset_test_ids as
select '11111111-1111-1111-1111-111111111111'::uuid as user_a,
       '22222222-2222-2222-2222-222222222222'::uuid as user_b,
       'aaaaaaaa-0000-0000-0000-00000000000a'::uuid as company_a,
       'bbbbbbbb-0000-0000-0000-00000000000b'::uuid as company_b;

\set ON_ERROR_STOP on

-- ============================================================
-- SEED: legacy payroll domain for company A, minimal data for B.
-- ============================================================
insert into auth.users (id, email, encrypted_password, confirmed_at, created_at, updated_at)
values ((select user_a from reset_test_ids), 'reset-owner-a@test.local', 'x', now(), now(), now()),
       ((select user_b from reset_test_ids), 'keep-owner-b@test.local', 'x', now(), now(), now())
on conflict (id) do nothing;

insert into public.companies (id, name, company_code, status, default_currency, timezone, created_by_user_id, legacy_owner_user_id)
values ((select company_a from reset_test_ids), 'Reset Target Co', 'reset-a', 'ACTIVE', 'PHP', 'Asia/Manila', (select user_a from reset_test_ids), (select user_a from reset_test_ids)),
       ((select company_b from reset_test_ids), 'Preserved Co', 'keep-b', 'ACTIVE', 'PHP', 'Asia/Manila', (select user_b from reset_test_ids), (select user_b from reset_test_ids));

insert into public.company_members (company_id, user_id, role_key, status)
values ((select company_a from reset_test_ids), (select user_a from reset_test_ids), 'COMPANY_ADMIN', 'ACTIVE'),
       ((select company_b from reset_test_ids), (select user_b from reset_test_ids), 'COMPANY_ADMIN', 'ACTIVE');

-- Legacy AI credential audit events that previously broke this migration's
-- allowlist with SQLSTATE 23514; they must remain valid afterwards.
insert into public.company_audit_events (company_id, actor_user_id, event_type, target_type)
values ((select company_a from reset_test_ids), (select user_a from reset_test_ids), 'COMPANY_AI_CREDENTIAL_CONFIGURED', 'company_ai_credential'),
       ((select company_a from reset_test_ids), (select user_a from reset_test_ids), 'COMPANY_AI_CREDENTIAL_ENABLED', 'company_ai_credential'),
       ((select company_a from reset_test_ids), (select user_a from reset_test_ids), 'COMPANY_AI_CREDENTIAL_TESTED', 'company_ai_credential');

insert into public.payroll_schedules (id, user_id, name, frequency, effective_from, configuration, pay_date_rule, company_id)
values ('cccccccc-0000-0000-0000-000000000001', (select user_a from reset_test_ids), 'Legacy semi-monthly', 'SEMI_MONTHLY', date '2025-01-01',
        '{"semiMonthlyFirstHalfStartDay":1,"semiMonthlySecondHalfStartDay":16}'::jsonb,
        '{"type":"BUSINESS_DAYS","offsetDays":2}'::jsonb,
        (select company_a from reset_test_ids));

insert into public.payroll_schedule_versions (id, schedule_id, version, effective_from, frequency, configuration, pay_date_rule, company_id)
values ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 1, date '2025-01-01', 'SEMI_MONTHLY',
        '{"semiMonthlyFirstHalfStartDay":1,"semiMonthlySecondHalfStartDay":16}'::jsonb,
        '{"type":"SAME_PERIOD_END"}'::jsonb,
        (select company_a from reset_test_ids));

insert into public.payroll_periods (id, user_id, company_id, period_start, period_end, status, auto_generated, schedule_id, schedule_version_id)
values ('eeeeeeee-0000-0000-0000-000000000001', (select user_a from reset_test_ids), (select company_a from reset_test_ids), date '2026-07-01', date '2026-07-15', 'APPROVED', true,  'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001'),
       ('eeeeeeee-0000-0000-0000-000000000002', (select user_a from reset_test_ids), (select company_a from reset_test_ids), date '2026-07-16', date '2026-07-31', 'VOID',    false, null, null),
       ('eeeeeeee-0000-0000-0000-000000000003', (select user_a from reset_test_ids), (select company_a from reset_test_ids), date '2026-08-01', date '2026-08-15', 'OPEN',    true,  'cccccccc-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001');

insert into public.workers (id, user_id, company_id, employee_code, first_name, last_name, display_name)
values ('51515151-0000-0000-0000-000000000001', (select user_a from reset_test_ids), (select company_a from reset_test_ids), 'EMP-001', 'Ada', 'Lovelace', 'Ada Lovelace');

insert into public.departments (id, user_id, company_id, name)
values ('61616161-0000-0000-0000-000000000001', (select user_a from reset_test_ids), (select company_a from reset_test_ids), 'Engineering');
update public.workers set department_id = '61616161-0000-0000-0000-000000000001' where id = '51515151-0000-0000-0000-000000000001';

insert into public.projects (id, user_id, company_id, project_code, project_name, status)
values ('70707070-0000-0000-0000-000000000001', (select user_a from reset_test_ids), (select company_a from reset_test_ids), 'PRJ-A', 'Project A', 'ACTIVE')
on conflict do nothing;

insert into public.payroll_runs (id, user_id, company_id, period_id, status)
values ('f0000000-0000-0000-0000-000000000001', (select user_a from reset_test_ids), (select company_a from reset_test_ids), 'eeeeeeee-0000-0000-0000-000000000001', 'DRAFT');

insert into public.payroll_entries (id, user_id, company_id, payroll_run_id, worker_id, gross_pay, net_pay, project_allocated_cost, calculation_snapshot)
values ('e2000000-0000-0000-0000-000000000001', (select user_a from reset_test_ids), (select company_a from reset_test_ids), 'f0000000-0000-0000-0000-000000000001', '51515151-0000-0000-0000-000000000001', 10000, 8000, 10000, '{"earnings":{"base":10000}}'::jsonb);

insert into public.payroll_project_allocations (id, user_id, company_id, payroll_entry_id, project_id, allocation_amount)
values ('a1000000-0000-0000-0000-000000000001', (select user_a from reset_test_ids), (select company_a from reset_test_ids), 'e2000000-0000-0000-0000-000000000001', '70707070-0000-0000-0000-000000000001', 10000);

insert into public.payroll_adjustments (id, user_id, company_id, payroll_entry_id, type, code, amount)
values ('a2000000-0000-0000-0000-000000000001', (select user_a from reset_test_ids), (select company_a from reset_test_ids), 'e2000000-0000-0000-0000-000000000001', 'EARNING', 'BONUS', 500);

insert into public.work_entries (id, user_id, company_id, worker_id, project_id, work_date, regular_hours, status, period_id)
values ('a3000000-0000-0000-0000-000000000001', (select user_a from reset_test_ids), (select company_a from reset_test_ids), '51515151-0000-0000-0000-000000000001', '70707070-0000-0000-0000-000000000001', date '2026-08-02', 8, 'APPROVED', 'eeeeeeee-0000-0000-0000-000000000003');

insert into public.attendance_records (id, user_id, company_id, worker_id, attendance_date, attendance_status, record_status, source, period_id)
values ('a4000000-0000-0000-0000-000000000001', (select user_a from reset_test_ids), (select company_a from reset_test_ids), '51515151-0000-0000-0000-000000000001', date '2026-08-03', 'PRESENT', 'CONFIRMED', 'MANUAL', 'eeeeeeee-0000-0000-0000-000000000003');

insert into public.overtime_requests (id, user_id, company_id, worker_id, overtime_date, requested_minutes, status, period_id, project_id, labor_context, source)
values ('a5000000-0000-0000-0000-000000000001', (select user_a from reset_test_ids), (select company_a from reset_test_ids), '51515151-0000-0000-0000-000000000001', date '2026-08-04', 120, 'PENDING', 'eeeeeeee-0000-0000-0000-000000000003', '70707070-0000-0000-0000-000000000001', 'PROJECT', 'MANUAL');

insert into public.leave_requests (id, user_id, company_id, worker_id, leave_type, start_date, end_date, partial_day, paid, status)
values ('a6000000-0000-0000-0000-000000000001', (select user_a from reset_test_ids), (select company_a from reset_test_ids), '51515151-0000-0000-0000-000000000001', 'VACATION_LEAVE', date '2026-08-06', date '2026-08-06', 'FULL', true, 'DRAFT');

insert into public.payroll_holidays (id, user_id, company_id, holiday_date, name)
values ('a7000000-0000-0000-0000-000000000001', (select user_a from reset_test_ids), (select company_a from reset_test_ids), date '2026-08-21', 'Ninoy Aquino Day');

insert into public.project_worker_assignments (id, user_id, company_id, worker_id, project_id, start_date)
values ('a8000000-0000-0000-0000-000000000001', (select user_a from reset_test_ids), (select company_a from reset_test_ids), '51515151-0000-0000-0000-000000000001', '70707070-0000-0000-0000-000000000001', date '2026-01-01');

insert into public.worker_compensation_profiles (id, user_id, company_id, worker_id, effective_from, frequency, rate)
values ('a9000000-0000-0000-0000-000000000001', (select user_a from reset_test_ids), (select company_a from reset_test_ids), '51515151-0000-0000-0000-000000000001', date '2026-01-01', 'MONTHLY', 20000);

insert into public.recurring_payroll_components (id, user_id, company_id, worker_id, type, code, name, amount, effective_from)
values ('aa000000-0000-0000-0000-000000000001', (select user_a from reset_test_ids), (select company_a from reset_test_ids), '51515151-0000-0000-0000-000000000001', 'EARNING', 'ALLOW-TRANSPO', 'Transport allowance', 1000, date '2026-01-01');

insert into public.labor_cost_centers (id, user_id, company_id, code, name, cost_center_type)
values ('ab000000-0000-0000-0000-000000000001', (select user_a from reset_test_ids), (select company_a from reset_test_ids), 'CC-1', 'Cost Center 1', 'OTHER');

insert into public.payroll_import_templates (id, user_id, company_id, name, structure_signature)
values ('ac000000-0000-0000-0000-000000000001', (select user_a from reset_test_ids), (select company_a from reset_test_ids), 'Legacy template', 'sig|v1');

insert into public.payroll_import_batches (id, user_id, company_id, original_filename, file_sha256, storage_path, detected_template_id, committed_payroll_period_id, committed_payroll_run_id)
values ('ad000000-0000-0000-0000-000000000001', (select user_a from reset_test_ids), (select company_a from reset_test_ids), 'legacy.xlsx', repeat('a', 64), 'payroll/legacy.xlsx', 'ac000000-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001');

insert into public.payroll_import_rows (id, user_id, company_id, batch_id, source_sheet, source_row, original_employee_name, raw_row, committed_work_entry_id, committed_payroll_entry_id)
values ('ae000000-0000-0000-0000-000000000001', (select user_a from reset_test_ids), (select company_a from reset_test_ids), 'ad000000-0000-0000-0000-000000000001', 'Sheet1', 1, 'EMP-001', '{}'::jsonb, 'a3000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001');

alter table public.payroll_runs add column if not exists import_batch_id uuid references public.payroll_import_batches(id) on delete set null;
update public.payroll_runs set import_batch_id = 'ad000000-0000-0000-0000-000000000001';

-- Company B keeps one period and one audit row through A's reset.
insert into public.payroll_periods (id, user_id, company_id, period_start, period_end, status, auto_generated)
values ('efefefef-0000-0000-0000-000000000001', (select user_b from reset_test_ids), (select company_b from reset_test_ids), date '2026-08-16', date '2026-08-31', 'OPEN', true);

insert into public.company_audit_events (company_id, actor_user_id, event_type, target_type)
values ((select company_b from reset_test_ids), (select user_b from reset_test_ids), 'COMPANY_CREATED', 'company');

-- Promote the seeded run through its legal transitions last so guards see a
-- consistent draft-turned-final run with children attached.
update public.payroll_runs set status = 'CALCULATED';
update public.payroll_runs set status = 'APPROVED';

-- ============================================================
-- TEST HELPERS
-- ============================================================
create or replace function pg_temp.count_company_rows(p_company uuid) returns bigint
language sql as $$
  select
    (select count(*) from public.payroll_schedules where company_id = p_company)
    + (select count(*) from public.payroll_schedule_versions where company_id = p_company)
    + (select count(*) from public.payroll_periods where company_id = p_company)
    + (select count(*) from public.payroll_runs where company_id = p_company)
    + (select count(*) from public.payroll_entries where company_id = p_company)
    + (select count(*) from public.payroll_project_allocations where company_id = p_company)
    + (select count(*) from public.payroll_adjustments where company_id = p_company)
    + (select count(*) from public.payroll_import_batches where company_id = p_company)
    + (select count(*) from public.payroll_import_rows where company_id = p_company)
    + (select count(*) from public.payroll_import_templates where company_id = p_company)
    + (select count(*) from public.labor_cost_centers where company_id = p_company)
    + (select count(*) from public.work_entries where company_id = p_company)
    + (select count(*) from public.attendance_records where company_id = p_company)
    + (select count(*) from public.overtime_requests where company_id = p_company)
    + (select count(*) from public.leave_requests where company_id = p_company)
    + (select count(*) from public.payroll_holidays where company_id = p_company)
    + (select count(*) from public.project_worker_assignments where company_id = p_company)
    + (select count(*) from public.worker_compensation_profiles where company_id = p_company)
    + (select count(*) from public.recurring_payroll_components where company_id = p_company)
    + (select count(*) from public.workers where company_id = p_company)
    + (select count(*) from public.departments where company_id = p_company);
$$;

create or replace function pg_temp.guards_all_enabled() returns boolean
language sql as $$
  select not exists (
    select 1 from pg_trigger
    where not tgisinternal and tgenabled <> 'O'
      and tgname in (
        'scheduled_payroll_period_mutation_guard', 'payroll_periods_workforce_source_guard',
        'payroll_runs_transition_guard', 'payroll_entries_mutation_guard',
        'payroll_project_allocations_mutation_guard', 'payroll_adjustments_mutation_guard',
        'work_entries_finalized_source_guard', 'attendance_records_finalized_source_guard',
        'leave_requests_finalized_source_guard', 'overtime_requests_finalized_source_guard')
  );
$$;

-- Act as company A's admin for RPC calls.
select set_config('request.jwt.claim.sub', (select user_a::text from reset_test_ids), false);

-- ============================================================
-- T1: anon must not be able to execute either RPC.
-- ============================================================
do $outer$
declare v_company uuid;
begin
  select company_a into v_company from reset_test_ids;
  set local role anon;
  begin
    perform public.preview_payroll_workspace_reset(v_company);
    raise exception 'T1 FAIL: anon could preview';
  exception when insufficient_privilege then null; end;
  begin
    perform public.apply_payroll_workspace_reset(v_company, null, 'RESET PAYROLL WORKSPACE');
    raise exception 'T1 FAIL: anon could apply';
  exception when insufficient_privilege then null; end;
  reset role;
end $outer$;
select 'T1_PASS_anon_blocked' as result;

-- ============================================================
-- T2: unauthenticated calls are refused even with the right phrase.
-- ============================================================
do $outer$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  begin
    perform public.apply_payroll_workspace_reset((select company_a from reset_test_ids), null, 'RESET PAYROLL WORKSPACE');
    raise exception 'T2 FAIL: unauthenticated call accepted';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub', (select user_a::text from reset_test_ids), false);
end $outer$;
select 'T2_PASS_unauthenticated_blocked' as result;

-- ============================================================
-- T3: a non-member authenticated user is refused.
-- ============================================================
do $outer$
begin
  perform set_config('request.jwt.claim.sub', (select user_b::text from reset_test_ids), false);
  begin
    perform public.apply_payroll_workspace_reset((select company_a from reset_test_ids), null, 'RESET PAYROLL WORKSPACE');
    raise exception 'T3 FAIL: outsider could reset company A';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub', (select user_a::text from reset_test_ids), false);
end $outer$;
select 'T3_PASS_outsider_blocked' as result;

-- ============================================================
-- T4: wrong confirmation phrases are refused and change nothing.
-- ============================================================
do $outer$
declare v_before bigint;
begin
  select pg_temp.count_company_rows((select company_a from reset_test_ids)) into v_before;
  begin
    perform public.apply_payroll_workspace_reset((select company_a from reset_test_ids), null, 'reset payroll workspace');
    raise exception 'T4 FAIL: lowercase phrase accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.apply_payroll_workspace_reset((select company_a from reset_test_ids), null, 'RESET PAYROLL WORKSPACE ');
    raise exception 'T4 FAIL: trailing-space phrase accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.apply_payroll_workspace_reset((select company_a from reset_test_ids), null, null);
    raise exception 'T4 FAIL: missing phrase accepted';
  exception when insufficient_privilege then null; end;
  if pg_temp.count_company_rows((select company_a from reset_test_ids)) <> v_before then
    raise exception 'T4 FAIL: rows changed by refused attempts';
  end if;
end $outer$;
select 'T4_PASS_confirmation_enforced' as result;

-- ============================================================
-- T5: preview counts match reality exactly for every counted table.
-- ============================================================
do $outer$
declare
  v_preview jsonb;
  v_counts jsonb;
  k text;
  v_expected bigint;
begin
  v_preview := public.preview_payroll_workspace_reset((select company_a from reset_test_ids), date '2026-08-25');
  v_counts := v_preview->'counts';
  foreach k in array array[
    'payroll_schedules','payroll_schedule_versions','payroll_periods','payroll_runs',
    'payroll_entries','payroll_project_allocations','payroll_adjustments',
    'payroll_import_batches','payroll_import_rows','payroll_import_templates',
    'labor_cost_centers','work_entries','attendance_records','overtime_requests',
    'leave_requests','payroll_holidays','project_worker_assignments',
    'worker_compensation_profiles','recurring_payroll_components','workers','departments']
  loop
    execute format('select count(*) from public.%I where company_id = $1', k)
      into v_expected using (select company_a from reset_test_ids);
    if (v_counts ->> k)::bigint <> v_expected then
      raise exception 'T5 FAIL: preview % = % but actual %', k, v_counts ->> k, v_expected;
    end if;
  end loop;
end $outer$;
select 'T5_PASS_preview_matches_reality' as result;

-- ============================================================
-- T6: a late-stage failure rolls back completely, restores guards, and
-- never writes a false audit event.
-- ============================================================
create or replace function pg_temp.sabotage_schedule_delete() returns trigger
language plpgsql as $$ begin raise exception 'SABOTAGE: simulated late-stage failure'; end $$;
create trigger sabotage_reset_test before delete on public.payroll_schedules
for each row execute function pg_temp.sabotage_schedule_delete();

do $outer$
declare v_before bigint;
begin
  select pg_temp.count_company_rows((select company_a from reset_test_ids)) into v_before;
  begin
    perform public.apply_payroll_workspace_reset((select company_a from reset_test_ids), date '2026-08-25', 'RESET PAYROLL WORKSPACE');
    raise exception 'T6 FAIL: sabotaged reset unexpectedly succeeded';
  exception when others then
    if sqlerrm <> 'SABOTAGE: simulated late-stage failure' then raise; end if;
  end;
  if pg_temp.count_company_rows((select company_a from reset_test_ids)) <> v_before then
    raise exception 'T6 FAIL: rollback left data deleted (% -> %)',
      v_before, pg_temp.count_company_rows((select company_a from reset_test_ids));
  end if;
  if not pg_temp.guards_all_enabled() then
    raise exception 'T6 FAIL: guards left disabled after failed reset';
  end if;
  if exists (select 1 from public.company_audit_events
             where event_type = 'PAYROLL_WORKSPACE_RESET'
               and metadata ->> 'action' is not null) then
    raise exception 'T6 FAIL: audit row written for failed reset';
  end if;
end $outer$;
drop trigger sabotage_reset_test on public.payroll_schedules;
drop function pg_temp.sabotage_schedule_delete();
select 'T6_PASS_rollback_atomic_and_guards_restored' as result;

-- ============================================================
-- T7: successful reset — isolation, preview parity, audit, guards.
-- ============================================================
create temp table keep_b_snapshot as
  select 'period' as kind, id::text as ref, status, period_start::text as extra from public.payroll_periods where company_id = (select company_b from reset_test_ids)
  union all
  select 'audit', event_type, '', '' from public.company_audit_events where company_id = (select company_b from reset_test_ids);

do $outer$
declare
  v_result jsonb;
  v_preview jsonb;
  v_audit jsonb;
  v_company_a uuid := (select company_a from reset_test_ids);
  k text;
  v_left bigint;
begin
  v_preview := public.preview_payroll_workspace_reset(v_company_a, date '2026-08-25');
  v_result := public.apply_payroll_workspace_reset(v_company_a, date '2026-08-25', 'RESET PAYROLL WORKSPACE');

  if (v_result ->> 'applied') is distinct from 'true' then
    raise exception 'T7 FAIL: applied flag not true';
  end if;
  if (v_result -> 'counts') <> (v_preview -> 'counts') then
    raise exception 'T7 FAIL: apply counts differ from preview counts';
  end if;

  -- Preview/apply parity: zero rows remain in every disclosed domain table.
  foreach k in array array[
    'payroll_schedules','payroll_schedule_versions','payroll_periods','payroll_runs',
    'payroll_entries','payroll_project_allocations','payroll_adjustments',
    'payroll_import_batches','payroll_import_rows','payroll_import_templates',
    'labor_cost_centers','work_entries','attendance_records','overtime_requests',
    'leave_requests','payroll_holidays','project_worker_assignments',
    'worker_compensation_profiles','recurring_payroll_components','workers','departments']
  loop
    execute format('select count(*) from public.%I where company_id = $1', k) into v_left using v_company_a;
    if v_left <> 0 then
      raise exception 'T7 FAIL: %.% still has % rows after reset', 'public', k, v_left;
    end if;
  end loop;

  -- Audit event: exactly one RPC-written row whose metadata matches the preview.
  select metadata into v_audit
  from public.company_audit_events
  where company_id = v_company_a
    and event_type = 'PAYROLL_WORKSPACE_RESET'
    and metadata ->> 'action' = 'FACTORY_RESET_PAYROLL';
  if not found then raise exception 'T7 FAIL: audit event missing'; end if;
  if (select count(*) from public.company_audit_events
      where company_id = v_company_a
        and event_type = 'PAYROLL_WORKSPACE_RESET'
        and metadata ->> 'action' = 'FACTORY_RESET_PAYROLL') <> 1 then
    raise exception 'T7 FAIL: duplicate audit events';
  end if;
  if (v_audit -> 'counts') <> (v_preview -> 'counts') then
    raise exception 'T7 FAIL: audit metadata counts differ from preview';
  end if;
  if coalesce((v_audit ->> 'total_rows'), '0')::bigint = 0 then
    raise exception 'T7 FAIL: total_rows should be nonzero for seeded company';
  end if;
  if (v_audit ->> 'reference_date') is distinct from '2026-08-25' then
    raise exception 'T7 FAIL: audit reference date missing';
  end if;
  if v_audit ?| array['gross_pay','net_pay','worker_names','entries'] then
    raise exception 'T7 FAIL: sensitive fields leaked into audit metadata';
  end if;

  if not pg_temp.guards_all_enabled() then
    raise exception 'T7 FAIL: guards left disabled after successful reset';
  end if;
end $outer$;

-- Company B must be byte-for-byte logically unchanged.
do $outer$
begin
  if exists (
    select 1 from (
      select * from (
        select 'period' as kind, id::text as ref, status, period_start::text as extra from public.payroll_periods where company_id = (select company_b from reset_test_ids)
        union all
        select 'audit', event_type, '', '' from public.company_audit_events where company_id = (select company_b from reset_test_ids)
      ) new_b
      except all
      select * from keep_b_snapshot
    ) diff
  ) then
    raise exception 'T7 FAIL: company B was modified by company A reset';
  end if;
  if (select count(*) from public.payroll_periods where company_id = (select company_b from reset_test_ids)) <> 1 then
    raise exception 'T7 FAIL: company B period lost';
  end if;
end $outer$;
select 'T7_PASS_apply_isolated_parity_audited_guards_on' as result;

-- ============================================================
-- T8: repeating a reset on an already-empty company stays safe.
-- ============================================================
do $outer$
begin
  perform public.apply_payroll_workspace_reset((select company_a from reset_test_ids), date '2026-08-25', 'RESET PAYROLL WORKSPACE');
  if (select count(*) from public.company_audit_events
      where company_id = (select company_a from reset_test_ids)
        and event_type = 'PAYROLL_WORKSPACE_RESET'
        and metadata ->> 'action' = 'FACTORY_RESET_PAYROLL') <> 2 then
    raise exception 'T8 FAIL: expected second audit row';
  end if;
  if not pg_temp.guards_all_enabled() then
    raise exception 'T8 FAIL: guards disabled after repeat reset';
  end if;
end $outer$;
select 'T8_PASS_repeat_reset_safe' as result;

select 'ALL_FUNCTIONAL_TESTS_PASSED' as final_result;
