-- Transactional payroll maintenance for the company-scoped payroll domain.
-- Disposable generated calendar infrastructure is deleted; VOID remains a
-- protected historical state unless it is an empty generated system tombstone.

alter table public.company_audit_events
  drop constraint if exists company_audit_events_event_type_check;
alter table public.company_audit_events
  add constraint company_audit_events_event_type_check check (event_type in (
    'COMPANY_CREATED', 'COMPANY_UPDATED', 'COMPANY_SUSPENDED', 'COMPANY_ARCHIVED', 'COMPANY_REACTIVATED',
    'USER_INVITED', 'INVITE_REVOKED', 'INVITE_ACCEPTED',
    'MEMBER_ROLE_CHANGED', 'MEMBER_SUSPENDED', 'MEMBER_REACTIVATED', 'MEMBER_REVOKED',
    'PAYROLL_REPAIR_APPLIED', 'PAYROLL_CALENDAR_REBUILT', 'PAYROLL_UNAPPROVED_RESET'
  ));

create or replace function private.payroll_maintenance_system_note(p_notes text)
returns boolean language sql immutable security definer set search_path = ''
as $$
  select nullif(btrim(coalesce(p_notes, '')), '') is null
      or btrim(p_notes) in (
        'Retired by payroll integrity repair.',
        'Retired during payroll integrity repair.',
        'Retired during prospective payroll schedule reconciliation.',
        'Retired with an empty obsolete generated payroll period.',
        'Retired by the explicit unapproved payroll reset.'
      );
$$;

create or replace function private.payroll_maintenance_pay_date(p_period_end date, p_rule jsonb)
returns date language plpgsql immutable security definer set search_path = ''
as $$
declare
  v_type text := coalesce(p_rule->>'type', 'MANUAL');
  v_offset integer := coalesce(nullif(p_rule->>'offsetDays', '')::integer, 0);
  v_result date := p_period_end;
  v_remaining integer;
  v_direction integer;
  v_day integer;
begin
  if v_type in ('MANUAL', '') then return null; end if;
  if v_type = 'SAME_PERIOD_END' then return p_period_end; end if;
  if v_type = 'CALENDAR_DAYS' then return p_period_end + v_offset; end if;
  if v_type = 'BUSINESS_DAYS' then
    v_direction := case when v_offset < 0 then -1 else 1 end;
    v_remaining := abs(v_offset);
    while v_remaining > 0 loop
      v_result := v_result + v_direction;
      v_day := extract(isodow from v_result)::integer;
      if v_day between 1 and 5 then v_remaining := v_remaining - 1; end if;
    end loop;
    return v_result;
  end if;
  if v_type = 'FIXED_FOLLOWING_MONTH' then
    v_result := date_trunc('month', p_period_end + interval '1 month')::date;
    return v_result + least(
      greatest(coalesce(nullif(p_rule->>'dayOfMonth', '')::integer, 1), 1),
      extract(day from (v_result + interval '2 months' - interval '1 day'))::integer
    ) - 1;
  end if;
  raise exception 'Payroll schedule pay-date rule is invalid' using errcode = '22023';
end;
$$;

create or replace function private.payroll_maintenance_shape(
  p_frequency text, p_config jsonb, p_effective_from date, p_effective_to date,
  p_reference_date date, p_pay_date_rule jsonb
)
returns table(period_start date, period_end date, pay_date date)
language plpgsql immutable security definer set search_path = ''
as $$
declare
  v_start date;
  v_end date;
  v_anchor date;
  v_month_start date;
  v_month_end date;
  v_previous_month_start date;
  v_next_month_start date;
  v_following_month_start date;
  v_week_end_day integer;
  v_length integer;
  v_distance integer;
  v_cycles integer;
  v_start_day integer;
  v_end_day integer;
  v_cutoff_day integer;
begin
  if p_frequency = 'DAILY' then
    v_start := p_reference_date; v_end := p_reference_date;
  elsif p_frequency in ('WEEKLY', 'BIWEEKLY') then
    v_week_end_day := coalesce(nullif(p_config->>'weekEndDay', '')::integer, 6);
    v_anchor := nullif(p_config->>'anchorPeriodEnd', '')::date;
    if v_anchor is null and p_frequency = 'WEEKLY' then
      v_anchor := p_effective_from + ((v_week_end_day - extract(dow from p_effective_from)::integer + 7) % 7);
    end if;
    if v_anchor is null then raise exception 'BIWEEKLY payroll schedules require an anchor period end' using errcode = '22023'; end if;
    v_distance := p_reference_date - v_anchor;
    v_cycles := ceil(v_distance::numeric / case when p_frequency = 'WEEKLY' then 7 else 14 end)::integer;
    v_end := v_anchor + (v_cycles * case when p_frequency = 'WEEKLY' then 7 else 14 end);
    v_start := v_end - case when p_frequency = 'WEEKLY' then 6 else 13 end;
  elsif p_frequency = 'SEMI_MONTHLY' then
    v_month_start := date_trunc('month', p_reference_date)::date;
    v_month_end := (v_month_start + interval '1 month' - interval '1 day')::date;
    if extract(day from p_reference_date)::integer <= 15 then
      v_start := v_month_start; v_end := v_month_start + 14;
    else
      v_start := v_month_start + 15; v_end := v_month_end;
    end if;
  elsif p_frequency = 'MONTHLY' then
    v_start := date_trunc('month', p_reference_date)::date;
    v_end := (v_start + interval '1 month' - interval '1 day')::date;
  elsif p_frequency = 'CUSTOM' then
    v_length := nullif(p_config->>'customPeriodLengthDays', '')::integer;
    v_start_day := nullif(p_config->>'customPeriodStartDay', '')::integer;
    v_end_day := nullif(p_config->>'customPeriodEndDay', '')::integer;
    v_cutoff_day := coalesce(nullif(p_config->>'customCutoffDay', '')::integer, v_end_day, 15);
    v_month_start := date_trunc('month', p_reference_date)::date;
    v_month_end := (v_month_start + interval '1 month' - interval '1 day')::date;
    if v_length is not null then
      v_anchor := nullif(p_config->>'anchorPeriodEnd', '')::date;
      if v_anchor is null then raise exception 'Length-based CUSTOM payroll schedules require an anchor period end' using errcode = '22023'; end if;
      v_distance := p_reference_date - v_anchor;
      v_cycles := ceil(v_distance::numeric / v_length)::integer;
      v_end := v_anchor + (v_cycles * v_length);
      v_start := v_end - (v_length - 1);
    elsif v_start_day is not null and v_end_day is not null then
      v_next_month_start := (v_month_start + interval '1 month')::date;
      v_start := v_month_start + least(v_start_day, extract(day from v_month_end)::integer) - 1;
      if v_start_day <= v_end_day then
        v_end := v_month_start + least(v_end_day, extract(day from v_month_end)::integer) - 1;
      else
        v_end := v_next_month_start + least(v_end_day, extract(day from (v_next_month_start + interval '1 month' - interval '1 day'))::integer) - 1;
      end if;
      if p_reference_date < v_start then
        v_previous_month_start := (v_month_start - interval '1 month')::date;
        v_start := v_previous_month_start + least(v_start_day, extract(day from (v_month_start - interval '1 day'))::integer) - 1;
        v_end := case when v_start_day <= v_end_day
          then v_previous_month_start + least(v_end_day, extract(day from (v_month_start - interval '1 day'))::integer) - 1
          else v_month_start + least(v_end_day, extract(day from v_month_end)::integer) - 1 end;
      elsif p_reference_date > v_end then
        v_following_month_start := v_next_month_start;
        v_start := v_following_month_start + least(v_start_day, extract(day from (v_following_month_start + interval '1 month' - interval '1 day'))::integer) - 1;
        v_end := case when v_start_day <= v_end_day
          then v_following_month_start + least(v_end_day, extract(day from (v_following_month_start + interval '1 month' - interval '1 day'))::integer) - 1
          else (v_following_month_start + interval '1 month')::date + least(v_end_day, extract(day from (v_following_month_start + interval '2 months' - interval '1 day'))::integer) - 1 end;
      end if;
    else
      v_cutoff_day := least(greatest(v_cutoff_day, 1), 31);
      v_end := v_month_start + least(v_cutoff_day, extract(day from v_month_end)::integer) - 1;
      if p_reference_date <= v_end then
        v_previous_month_start := (v_month_start - interval '1 month')::date;
        v_start := v_previous_month_start + least(v_cutoff_day, extract(day from (v_month_start - interval '1 day'))::integer);
      else
        v_start := v_end + 1;
        v_next_month_start := (v_month_start + interval '1 month')::date;
        v_end := v_next_month_start + least(v_cutoff_day, extract(day from (v_next_month_start + interval '1 month' - interval '1 day'))::integer) - 1;
      end if;
    end if;
  else
    raise exception 'Payroll schedule frequency is invalid' using errcode = '22023';
  end if;
  if v_start < p_effective_from or (p_effective_to is not null and v_end > p_effective_to) then return; end if;
  period_start := v_start; period_end := v_end;
  pay_date := private.payroll_maintenance_pay_date(v_end, p_pay_date_rule);
  return next;
end;
$$;

create or replace function private.payroll_maintenance_period_is_disposable(p_company_id uuid, p_period_id uuid, p_action text)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_period public.payroll_periods;
begin
  select * into v_period from public.payroll_periods p where p.id = p_period_id and p.company_id = p_company_id;
  if not found or not v_period.auto_generated or v_period.locked_at is not null then return false; end if;
  if p_action = 'RESET_UNAPPROVED' then
    if v_period.status not in ('DRAFT', 'OPEN', 'CALCULATED', 'VOID') then return false; end if;
    if v_period.status = 'VOID' and not private.payroll_maintenance_system_note(v_period.notes) then return false; end if;
    if not private.payroll_maintenance_system_note(v_period.notes) then return false; end if;
    if exists (select 1 from public.payroll_runs r where r.company_id = p_company_id and r.period_id = v_period.id and r.status in ('DRAFT', 'VOID') and not private.payroll_maintenance_system_note(r.notes)) then return false; end if;
    if exists (select 1 from public.payroll_runs r join public.payroll_entries e on e.payroll_run_id = r.id where r.company_id = p_company_id and e.company_id = p_company_id and r.period_id = v_period.id and r.status = 'VOID') then return false; end if;
    if exists (select 1 from public.work_entries w where w.company_id = p_company_id and w.period_id = v_period.id and w.status <> 'VOID') then return false; end if;
    if exists (select 1 from public.payroll_runs r where r.company_id = p_company_id and r.period_id = v_period.id and r.status in ('APPROVED', 'PAID')) then return false; end if;
    if exists (select 1 from public.payroll_runs r where r.company_id = p_company_id and r.period_id = v_period.id and r.status not in ('DRAFT', 'CALCULATED', 'VOID')) then return false; end if;
    return true;
  end if;
  if v_period.status not in ('DRAFT', 'OPEN', 'VOID') or not private.payroll_maintenance_system_note(v_period.notes) then return false; end if;
  if exists (select 1 from public.payroll_runs r where r.company_id = p_company_id and r.period_id = v_period.id and r.status in ('DRAFT', 'VOID') and not private.payroll_maintenance_system_note(r.notes)) then return false; end if;
  if exists (select 1 from public.payroll_runs r where r.company_id = p_company_id and r.period_id = v_period.id and r.status in ('DRAFT', 'VOID') and r.import_batch_id is not null and not exists (select 1 from public.payroll_import_batches b where b.id = r.import_batch_id and b.company_id = p_company_id and b.status = 'VOIDED')) then return false; end if;
  if exists (select 1 from public.work_entries w where w.company_id = p_company_id and w.period_id = v_period.id and w.status <> 'VOID') then return false; end if;
  if exists (select 1 from public.payroll_runs r where r.company_id = p_company_id and r.period_id = v_period.id and r.status in ('CALCULATED', 'APPROVED', 'PAID')) then return false; end if;
  if exists (select 1 from public.payroll_entries e join public.payroll_runs r on r.id = e.payroll_run_id where e.company_id = p_company_id and r.company_id = p_company_id and r.period_id = v_period.id) then return false; end if;
  if exists (select 1 from public.payroll_import_batches b where b.company_id = p_company_id and b.status <> 'VOIDED' and b.committed_payroll_period_id = v_period.id) then return false; end if;
  return true;
end;
$$;

create or replace function private.payroll_maintenance_run_is_disposable(p_company_id uuid, p_run_id uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_run public.payroll_runs;
begin
  select * into v_run from public.payroll_runs r where r.id = p_run_id and r.company_id = p_company_id;
  if not found or v_run.status not in ('DRAFT', 'VOID') or not private.payroll_maintenance_system_note(v_run.notes) then return false; end if;
  if exists (select 1 from public.payroll_entries e where e.company_id = p_company_id and e.payroll_run_id = v_run.id) then return false; end if;
  if exists (select 1 from public.payroll_adjustments a join public.payroll_entries e on e.id = a.payroll_entry_id where a.company_id = p_company_id and e.payroll_run_id = v_run.id) then return false; end if;
  if v_run.import_batch_id is not null and not exists (select 1 from public.payroll_import_batches b where b.id = v_run.import_batch_id and b.company_id = p_company_id and b.status = 'VOIDED') then return false; end if;
  return true;
end;
$$;
create or replace function private.build_payroll_maintenance_plan(p_company_id uuid, p_action text, p_reference_date date)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_schedule_id uuid;
  v_schedule_name text;
  v_schedule_frequency text;
  v_schedule_effective_from date;
  v_schedule_config jsonb;
  v_schedule_pay_rule jsonb;
  v_schedule_auto_generate boolean;
  v_schedule_auto_calculate boolean;
  v_version_id uuid;
  v_version_config jsonb;
  v_version_pay_rule jsonb;
  v_version_frequency text;
  v_version_effective_from date;
  v_version_effective_to date;
  v_config jsonb;
  v_pay_rule jsonb;
  v_frequency text;
  v_effective_from date;
  v_effective_to date;
  v_auto_generate boolean;
  v_auto_create_runs boolean;
  v_current_start date;
  v_current_end date;
  v_cursor date;
  v_shape record;
  v_index integer;
  v_periods_to_delete bigint := 0;
  v_runs_to_delete bigint := 0;
  v_entries_to_delete bigint := 0;
  v_allocations_to_delete bigint := 0;
  v_adjustments_to_delete bigint := 0;
  v_import_batches_to_reopen bigint := 0;
  v_import_rows_to_reopen bigint := 0;
  v_periods_to_create bigint := 0;
  v_protected_approved_runs bigint := 0;
  v_protected_paid_runs bigint := 0;
  v_protected_locked_periods bigint := 0;
  v_protected_data_periods bigint := 0;
  v_manual_review_issues bigint := 0;
  v_no_changes boolean;
  v_target_period_ids uuid[];
  v_target_run_ids uuid[];
begin
  if p_company_id is null or p_action not in ('REPAIR', 'REBUILD_CALENDAR', 'RESET_UNAPPROVED') then raise exception 'Payroll maintenance request is invalid' using errcode = '22023'; end if;
  if not private.has_company_permission(p_company_id, 'payroll.settings') or not private.has_company_permission(p_company_id, 'payroll.manage') then raise exception 'You do not have permission to manage payroll maintenance' using errcode = '42501'; end if;

  drop table if exists pg_temp.payroll_maintenance_desired;
  create temporary table payroll_maintenance_desired (
    period_start date not null, period_end date not null, pay_date date,
    schedule_id uuid not null, schedule_version_id uuid not null,
    primary key (schedule_id, schedule_version_id, period_start, period_end)
  ) on commit drop;

  select s.id, s.name, s.frequency, s.effective_from, s.configuration, s.pay_date_rule, s.auto_generate_periods, s.auto_calculate
    into v_schedule_id, v_schedule_name, v_schedule_frequency, v_schedule_effective_from, v_schedule_config, v_schedule_pay_rule, v_schedule_auto_generate, v_schedule_auto_calculate
  from public.payroll_schedules s
  where s.company_id = p_company_id and s.active
  order by s.updated_at desc, s.id desc limit 1;

  if v_schedule_id is null then
    return jsonb_build_object(
      'action', p_action, 'referenceDate', p_reference_date, 'eligible', false, 'noChanges', true, 'manualReviewIssues', 1,
      'periodsToDelete', 0, 'runsToDelete', 0, 'entriesToDelete', 0, 'allocationsToDelete', 0, 'adjustmentsToDelete', 0,
      'importBatchesToReopen', 0, 'importRowsToReopen', 0, 'periodsToCreate', 0, 'runsToCreate', 0,
      'protectedApprovedRuns', 0, 'protectedPaidRuns', 0, 'protectedLockedPeriods', 0, 'protectedDataBearingPeriods', 0
    );
  end if;

  select sv.id, sv.frequency, sv.effective_from, sv.effective_to, sv.configuration, sv.pay_date_rule
    into v_version_id, v_version_frequency, v_version_effective_from, v_version_effective_to, v_version_config, v_version_pay_rule
  from public.payroll_schedule_versions sv
  where sv.company_id = p_company_id and sv.schedule_id = v_schedule_id and sv.active
    and sv.effective_from <= p_reference_date and (sv.effective_to is null or p_reference_date <= sv.effective_to)
  order by sv.version desc, sv.effective_from desc, sv.id desc limit 1;

  v_frequency := coalesce(v_version_frequency, v_schedule_frequency);
  v_effective_from := coalesce(v_version_effective_from, v_schedule_effective_from);
  v_effective_to := v_version_effective_to;
  v_config := coalesce(v_schedule_config, '{}'::jsonb) || coalesce(v_version_config, '{}'::jsonb);
  v_pay_rule := coalesce(v_version_pay_rule, v_schedule_pay_rule, '{}'::jsonb);
  v_auto_generate := coalesce((v_version_config->>'autoGeneratePeriods')::boolean, v_schedule_auto_generate, false);
  v_auto_create_runs := coalesce((v_config->>'autoCreateRuns')::boolean, (v_config->>'auto_calculate')::boolean, v_schedule_auto_calculate, false);

  if v_auto_generate and v_version_id is not null then
    select * into v_shape from private.payroll_maintenance_shape(v_frequency, v_config, v_effective_from, v_effective_to, p_reference_date, v_pay_rule);
    if found then
      insert into pg_temp.payroll_maintenance_desired values (v_shape.period_start, v_shape.period_end, v_shape.pay_date, v_schedule_id, v_version_id);
      v_current_start := v_shape.period_start; v_current_end := v_shape.period_end;
      v_cursor := v_current_start - 1;
      for v_index in 1..2 loop
        select * into v_shape from private.payroll_maintenance_shape(v_frequency, v_config, v_effective_from, v_effective_to, v_cursor, v_pay_rule);
        exit when not found;
        insert into pg_temp.payroll_maintenance_desired values (v_shape.period_start, v_shape.period_end, v_shape.pay_date, v_schedule_id, v_version_id) on conflict do nothing;
        v_cursor := v_shape.period_start - 1;
      end loop;
      v_cursor := v_current_end + 1;
      for v_index in 1..2 loop
        select * into v_shape from private.payroll_maintenance_shape(v_frequency, v_config, v_effective_from, v_effective_to, v_cursor, v_pay_rule);
        exit when not found;
        insert into pg_temp.payroll_maintenance_desired values (v_shape.period_start, v_shape.period_end, v_shape.pay_date, v_schedule_id, v_version_id) on conflict do nothing;
        v_cursor := v_shape.period_end + 1;
      end loop;
    end if;
  end if;

  select count(*) into v_periods_to_delete from public.payroll_periods p where p.company_id = p_company_id and private.payroll_maintenance_period_is_disposable(p_company_id, p.id, p_action) and (p_action = 'RESET_UNAPPROVED' or p.status = 'VOID' or not exists (select 1 from pg_temp.payroll_maintenance_desired d where d.schedule_id = p.schedule_id and d.schedule_version_id = p.schedule_version_id and d.period_start = p.period_start and d.period_end = p.period_end));

  select array_agg(r.id), array_agg(distinct r.period_id) into v_target_run_ids, v_target_period_ids
  from public.payroll_runs r join public.payroll_periods p on p.id = r.period_id and p.company_id = p_company_id
  where r.company_id = p_company_id and p_action = 'RESET_UNAPPROVED' and r.status in ('DRAFT', 'CALCULATED')
    and p.status not in ('APPROVED', 'PAID', 'VOID') and p.locked_at is null and private.payroll_maintenance_system_note(r.notes);

  select count(*) into v_runs_to_delete from public.payroll_runs r
  where r.company_id = p_company_id and (
    (p_action = 'RESET_UNAPPROVED' and r.status in ('DRAFT', 'CALCULATED') and private.payroll_maintenance_system_note(r.notes) and exists (
      select 1 from public.payroll_periods p where p.id = r.period_id and p.company_id = p_company_id and p.status not in ('APPROVED', 'PAID', 'VOID') and p.locked_at is null and private.payroll_maintenance_system_note(r.notes)
    ))
    or (r.status in ('DRAFT', 'VOID') and private.payroll_maintenance_run_is_disposable(p_company_id, r.id) and private.payroll_maintenance_period_is_disposable(p_company_id, r.period_id, p_action) and (p_action = 'RESET_UNAPPROVED' or r.status = 'VOID' or not exists (select 1 from pg_temp.payroll_maintenance_desired d join public.payroll_periods p on p.id = r.period_id where d.schedule_id = p.schedule_id and d.schedule_version_id = p.schedule_version_id and d.period_start = p.period_start and d.period_end = p.period_end)))
  );

  select count(*) into v_entries_to_delete from public.payroll_entries e join public.payroll_runs r on r.id = e.payroll_run_id join public.payroll_periods p on p.id = r.period_id
  where e.company_id = p_company_id and r.company_id = p_company_id and p.company_id = p_company_id and p_action = 'RESET_UNAPPROVED'
    and r.status in ('DRAFT', 'CALCULATED') and p.status not in ('APPROVED', 'PAID', 'VOID') and p.locked_at is null and private.payroll_maintenance_system_note(r.notes);
  select count(*) into v_allocations_to_delete from public.payroll_project_allocations a join public.payroll_entries e on e.id = a.payroll_entry_id join public.payroll_runs r on r.id = e.payroll_run_id join public.payroll_periods p on p.id = r.period_id
  where a.company_id = p_company_id and e.company_id = p_company_id and r.company_id = p_company_id and p.company_id = p_company_id and p_action = 'RESET_UNAPPROVED'
    and r.status in ('DRAFT', 'CALCULATED') and p.status not in ('APPROVED', 'PAID', 'VOID') and p.locked_at is null and private.payroll_maintenance_system_note(r.notes);
  select count(*) into v_adjustments_to_delete from public.payroll_adjustments a join public.payroll_entries e on e.id = a.payroll_entry_id join public.payroll_runs r on r.id = e.payroll_run_id join public.payroll_periods p on p.id = r.period_id
  where a.company_id = p_company_id and e.company_id = p_company_id and r.company_id = p_company_id and p.company_id = p_company_id and p_action = 'RESET_UNAPPROVED'
    and r.status in ('DRAFT', 'CALCULATED') and p.status not in ('APPROVED', 'PAID', 'VOID') and p.locked_at is null and private.payroll_maintenance_system_note(r.notes);

  select count(distinct b.id) into v_import_batches_to_reopen from public.payroll_import_batches b
  where b.company_id = p_company_id and b.status = 'COMMITTED' and p_action = 'RESET_UNAPPROVED' and (
    b.committed_payroll_run_id = any(coalesce(v_target_run_ids, '{}'::uuid[]))
    or b.committed_payroll_period_id = any(coalesce(v_target_period_ids, '{}'::uuid[]))
    or exists (select 1 from public.payroll_import_rows pir join public.payroll_entries e on e.id = pir.committed_payroll_entry_id where pir.company_id = p_company_id and e.company_id = p_company_id and pir.batch_id = b.id and e.payroll_run_id = any(coalesce(v_target_run_ids, '{}'::uuid[])))
  );
  select count(*) into v_import_rows_to_reopen from public.payroll_import_rows pir
  where pir.company_id = p_company_id and p_action = 'RESET_UNAPPROVED' and pir.status = 'COMMITTED' and (
    pir.batch_id in (select b.id from public.payroll_import_batches b where b.company_id = p_company_id and b.status = 'COMMITTED' and (b.committed_payroll_run_id = any(coalesce(v_target_run_ids, '{}'::uuid[])) or b.committed_payroll_period_id = any(coalesce(v_target_period_ids, '{}'::uuid[]))))
    or exists (select 1 from public.payroll_entries e where e.id = pir.committed_payroll_entry_id and e.company_id = p_company_id and e.payroll_run_id = any(coalesce(v_target_run_ids, '{}'::uuid[])))
  );

  select count(*) into v_periods_to_create from pg_temp.payroll_maintenance_desired d where not exists (
    select 1 from public.payroll_periods p where p.company_id = p_company_id and p.schedule_id = d.schedule_id and p.schedule_version_id = d.schedule_version_id and p.period_start = d.period_start and p.period_end = d.period_end and p.status <> 'VOID'
  );
  select count(*) into v_protected_approved_runs from public.payroll_runs r where r.company_id = p_company_id and r.status = 'APPROVED';
  select count(*) into v_protected_paid_runs from public.payroll_runs r where r.company_id = p_company_id and r.status = 'PAID';
  select count(*) into v_protected_locked_periods from public.payroll_periods p where p.company_id = p_company_id and (p.locked_at is not null or p.status in ('APPROVED', 'PAID') or (p.status = 'VOID' and not private.payroll_maintenance_period_is_disposable(p_company_id, p.id, p_action)));
  select count(*) into v_protected_data_periods from public.payroll_periods p where p.company_id = p_company_id and (
    exists (select 1 from public.work_entries w where w.company_id = p_company_id and w.period_id = p.id and w.status <> 'VOID')
    or exists (select 1 from public.payroll_entries e join public.payroll_runs r on r.id = e.payroll_run_id where e.company_id = p_company_id and r.company_id = p_company_id and r.period_id = p.id)
    or exists (select 1 from public.payroll_import_batches b where b.company_id = p_company_id and b.status <> 'VOIDED' and b.committed_payroll_period_id = p.id)
    or not private.payroll_maintenance_system_note(p.notes)
  );
  select count(*) into v_manual_review_issues from public.payroll_periods p where p.company_id = p_company_id and p.status <> 'VOID' and p.auto_generated
    and not private.payroll_maintenance_period_is_disposable(p_company_id, p.id, p_action)
    and not exists (select 1 from pg_temp.payroll_maintenance_desired d where d.schedule_id = p.schedule_id and d.schedule_version_id = p.schedule_version_id and d.period_start = p.period_start and d.period_end = p.period_end);

  v_no_changes := (v_periods_to_delete + v_runs_to_delete + v_entries_to_delete + v_allocations_to_delete + v_adjustments_to_delete + v_import_batches_to_reopen + v_import_rows_to_reopen + v_periods_to_create + case when v_auto_create_runs and exists (select 1 from pg_temp.payroll_maintenance_desired d where d.period_start <= p_reference_date and d.period_end >= p_reference_date) and not exists (select 1 from public.payroll_runs r join public.payroll_periods p on p.id = r.period_id where r.company_id = p_company_id and p.company_id = p_company_id and p.period_start <= p_reference_date and p.period_end >= p_reference_date) then 1 else 0 end = 0);
  return jsonb_build_object(
    'action', p_action, 'scheduleFrequency', v_frequency, 'scheduleName', v_schedule_name, 'referenceDate', p_reference_date,
    'rebuildStart', (select min(d.period_start) from pg_temp.payroll_maintenance_desired d), 'rebuildEnd', (select max(d.period_end) from pg_temp.payroll_maintenance_desired d),
    'periodsToDelete', v_periods_to_delete, 'runsToDelete', v_runs_to_delete, 'entriesToDelete', v_entries_to_delete,
    'allocationsToDelete', v_allocations_to_delete, 'adjustmentsToDelete', v_adjustments_to_delete,
    'importBatchesToReopen', v_import_batches_to_reopen, 'importRowsToReopen', v_import_rows_to_reopen,
    'periodsToCreate', v_periods_to_create,
    'runsToCreate', case when v_auto_create_runs and exists (select 1 from pg_temp.payroll_maintenance_desired d where d.period_start <= p_reference_date and d.period_end >= p_reference_date) and not exists (select 1 from public.payroll_runs r join public.payroll_periods p on p.id = r.period_id where r.company_id = p_company_id and p.company_id = p_company_id and p.period_start <= p_reference_date and p.period_end >= p_reference_date) then 1 else 0 end,
    'protectedApprovedRuns', v_protected_approved_runs, 'protectedPaidRuns', v_protected_paid_runs, 'protectedLockedPeriods', v_protected_locked_periods,
    'protectedDataBearingPeriods', v_protected_data_periods, 'manualReviewIssues', v_manual_review_issues, 'eligible', not v_no_changes, 'noChanges', v_no_changes
  );
end;
$$;
create or replace function public.preview_payroll_maintenance(p_company_id uuid, p_action text, p_reference_date date default current_date)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication is required for payroll maintenance' using errcode = '42501'; end if;
  return private.build_payroll_maintenance_plan(p_company_id, p_action, p_reference_date);
end;
$$;

create or replace function public.apply_payroll_maintenance(
  p_company_id uuid, p_action text, p_reference_date date default current_date, p_confirmation text default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_plan jsonb;
  v_schedule_id uuid;
  v_current_period_id uuid;
  v_auto_create_runs boolean;
  v_actor uuid := (select auth.uid());
  v_event_type text;
begin
  if v_actor is null then raise exception 'Authentication is required for payroll maintenance' using errcode = '42501'; end if;
  if p_action = 'RESET_UNAPPROVED' and p_confirmation is distinct from 'RESET UNAPPROVED PAYROLL' then raise exception 'Type RESET UNAPPROVED PAYROLL to confirm this action' using errcode = '42501'; end if;
  v_plan := private.build_payroll_maintenance_plan(p_company_id, p_action, p_reference_date);
  if coalesce((v_plan->>'noChanges')::boolean, false) then return v_plan || jsonb_build_object('applied', true, 'noOp', true); end if;
  if coalesce((v_plan->>'eligible')::boolean, false) is not true then raise exception 'No eligible payroll maintenance changes were found' using errcode = '42501'; end if;

  -- Re-lock and re-read at apply time. Preview counts never authorize deletion.
  perform 1 from public.payroll_schedules s where s.company_id = p_company_id and s.active for update;
  perform 1 from public.payroll_periods p where p.company_id = p_company_id for update;
  perform 1 from public.payroll_runs r where r.company_id = p_company_id for update;
  select s.id, coalesce((s.configuration->>'autoCreateRuns')::boolean, (s.configuration->>'auto_calculate')::boolean, s.auto_calculate, false)
    into v_schedule_id, v_auto_create_runs
  from public.payroll_schedules s where s.company_id = p_company_id and s.active order by s.updated_at desc, s.id desc limit 1;

  if p_action = 'RESET_UNAPPROVED' then
    drop table if exists pg_temp.payroll_maintenance_target_runs;
    drop table if exists pg_temp.payroll_maintenance_target_entries;
    drop table if exists pg_temp.payroll_maintenance_target_batches;
    create temporary table payroll_maintenance_target_runs on commit drop as
      select r.id, r.period_id
      from public.payroll_runs r join public.payroll_periods p on p.id = r.period_id and p.company_id = p_company_id
      where r.company_id = p_company_id and r.status in ('DRAFT', 'CALCULATED') and p.status not in ('APPROVED', 'PAID', 'VOID') and p.locked_at is null and private.payroll_maintenance_system_note(r.notes);
    create temporary table payroll_maintenance_target_entries on commit drop as
      select e.id from public.payroll_entries e where e.company_id = p_company_id and e.payroll_run_id in (select id from pg_temp.payroll_maintenance_target_runs);
    create temporary table payroll_maintenance_target_batches on commit drop as
      select distinct b.id from public.payroll_import_batches b
      where b.company_id = p_company_id and b.status = 'COMMITTED' and (
        b.committed_payroll_run_id in (select id from pg_temp.payroll_maintenance_target_runs)
        or b.committed_payroll_period_id in (select period_id from pg_temp.payroll_maintenance_target_runs)
        or exists (select 1 from public.payroll_import_rows pir where pir.batch_id = b.id and pir.committed_payroll_entry_id in (select id from pg_temp.payroll_maintenance_target_entries))
      );
    update public.payroll_import_rows pir
    set status = case when pir.status = 'COMMITTED' then 'READY' else pir.status end, committed_payroll_entry_id = null, updated_at = now()
    where pir.company_id = p_company_id and (pir.batch_id in (select id from pg_temp.payroll_maintenance_target_batches) or pir.committed_payroll_entry_id in (select id from pg_temp.payroll_maintenance_target_entries));
    update public.payroll_import_batches b
    set status = 'VALIDATED', committed_payroll_period_id = null, committed_payroll_run_id = null, committed_at = null, updated_at = now()
    where b.company_id = p_company_id and b.id in (select id from pg_temp.payroll_maintenance_target_batches);

    -- Dependency order: allocations, adjustments, import references, entries, runs.
    delete from public.payroll_project_allocations a where a.company_id = p_company_id and a.payroll_entry_id in (select id from pg_temp.payroll_maintenance_target_entries);
    delete from public.payroll_adjustments a where a.company_id = p_company_id and a.payroll_entry_id in (select id from pg_temp.payroll_maintenance_target_entries);
    delete from public.payroll_entries e where e.company_id = p_company_id and e.id in (select id from pg_temp.payroll_maintenance_target_entries);
    delete from public.payroll_runs r where r.company_id = p_company_id and r.id in (select id from pg_temp.payroll_maintenance_target_runs);
  end if;

  -- Re-evaluate safe deletion after reset. A CALCULATED run that became
  -- APPROVED after preview is excluded by the target query above.
  delete from public.payroll_runs r
  where r.company_id = p_company_id and private.payroll_maintenance_run_is_disposable(p_company_id, r.id)
    and private.payroll_maintenance_period_is_disposable(p_company_id, r.period_id, p_action)
    and (p_action = 'RESET_UNAPPROVED' or r.status = 'VOID' or not exists (select 1 from pg_temp.payroll_maintenance_desired d join public.payroll_periods p on p.id = r.period_id where d.schedule_id = p.schedule_id and d.schedule_version_id = p.schedule_version_id and d.period_start = p.period_start and d.period_end = p.period_end));
  delete from public.payroll_periods p
  where p.company_id = p_company_id and private.payroll_maintenance_period_is_disposable(p_company_id, p.id, p_action)
    and (p_action = 'RESET_UNAPPROVED' or p.status = 'VOID' or not exists (select 1 from pg_temp.payroll_maintenance_desired d where d.schedule_id = p.schedule_id and d.schedule_version_id = p.schedule_version_id and d.period_start = p.period_start and d.period_end = p.period_end));

  if exists (
    select 1 from pg_temp.payroll_maintenance_desired d
    join public.payroll_periods p on p.company_id = p_company_id and p.schedule_id = d.schedule_id and p.schedule_version_id = d.schedule_version_id and p.period_start = d.period_start and p.period_end = d.period_end and p.status = 'VOID'
    where not private.payroll_maintenance_period_is_disposable(p_company_id, p.id, p_action)
  ) then raise exception 'A protected VOID payroll period conflicts with the canonical calendar' using errcode = '42501'; end if;

  insert into public.payroll_periods (id, user_id, company_id, period_start, period_end, pay_date, schedule_id, schedule_version_id, auto_generated, status)
  select gen_random_uuid(), v_actor, p_company_id, d.period_start, d.period_end, d.pay_date, d.schedule_id, d.schedule_version_id, true, 'DRAFT'
  from pg_temp.payroll_maintenance_desired d
  where not exists (select 1 from public.payroll_periods p where p.company_id = p_company_id and p.schedule_id = d.schedule_id and p.schedule_version_id = d.schedule_version_id and p.period_start = d.period_start and p.period_end = d.period_end)
  on conflict do nothing;

  select p.id into v_current_period_id
  from public.payroll_periods p join pg_temp.payroll_maintenance_desired d on d.schedule_id = p.schedule_id and d.schedule_version_id = p.schedule_version_id and d.period_start = p.period_start and d.period_end = p.period_end
  where p.company_id = p_company_id and d.period_start <= p_reference_date and d.period_end >= p_reference_date order by p.updated_at desc, p.id desc limit 1;
  update public.payroll_periods p set status = 'OPEN', updated_at = now() where p.id = v_current_period_id and p.company_id = p_company_id and p.status = 'DRAFT' and p.locked_at is null;
  if v_auto_create_runs and v_current_period_id is not null and not exists (select 1 from public.payroll_runs r where r.company_id = p_company_id and r.period_id = v_current_period_id) then
    insert into public.payroll_runs (id, user_id, company_id, period_id, status) values (gen_random_uuid(), v_actor, p_company_id, v_current_period_id, 'DRAFT');
  end if;

  v_event_type := case p_action when 'REPAIR' then 'PAYROLL_REPAIR_APPLIED' when 'REBUILD_CALENDAR' then 'PAYROLL_CALENDAR_REBUILT' else 'PAYROLL_UNAPPROVED_RESET' end;
  perform private.write_company_audit(p_company_id, v_event_type, 'payroll_maintenance', null, jsonb_build_object(
    'action', p_action, 'reference_date', p_reference_date,
    'periods_to_delete', v_plan->'periodsToDelete', 'runs_to_delete', v_plan->'runsToDelete',
    'entries_to_delete', v_plan->'entriesToDelete', 'allocations_to_delete', v_plan->'allocationsToDelete',
    'adjustments_to_delete', v_plan->'adjustmentsToDelete', 'import_batches_reopened', v_plan->'importBatchesToReopen',
    'import_rows_reopened', v_plan->'importRowsToReopen', 'periods_to_create', v_plan->'periodsToCreate',
    'protected_approved_runs', v_plan->'protectedApprovedRuns', 'protected_paid_runs', v_plan->'protectedPaidRuns',
    'protected_locked_periods', v_plan->'protectedLockedPeriods', 'protected_data_bearing_periods', v_plan->'protectedDataBearingPeriods'
  ));
  return v_plan || jsonb_build_object('applied', true);
end;
$$;

revoke execute on function public.preview_payroll_maintenance(uuid, text, date) from public, anon;
revoke execute on function public.apply_payroll_maintenance(uuid, text, date, text) from public, anon;
grant execute on function public.preview_payroll_maintenance(uuid, text, date) to authenticated;
grant execute on function public.apply_payroll_maintenance(uuid, text, date, text) to authenticated;
revoke execute on function private.payroll_maintenance_system_note(text) from public, anon, authenticated;
revoke execute on function private.payroll_maintenance_pay_date(date, jsonb) from public, anon, authenticated;
revoke execute on function private.payroll_maintenance_shape(text, jsonb, date, date, date, jsonb) from public, anon, authenticated;
revoke execute on function private.payroll_maintenance_period_is_disposable(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function private.payroll_maintenance_run_is_disposable(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.build_payroll_maintenance_plan(uuid, text, date) from public, anon, authenticated;