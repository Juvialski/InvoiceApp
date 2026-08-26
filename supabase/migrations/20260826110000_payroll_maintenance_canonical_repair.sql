-- Migration: Additive repair semantics preserving canonical payroll periods and calendar boundaries.

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
    and (
      (sv.effective_from <= p_reference_date and (sv.effective_to is null or p_reference_date <= sv.effective_to))
      or (sv.effective_from > p_reference_date)
    )
  order by case when sv.effective_from <= p_reference_date then 0 else 1 end, sv.version desc, sv.effective_from desc, sv.id desc limit 1;

  v_frequency := coalesce(v_version_frequency, v_schedule_frequency);
  v_effective_from := coalesce(v_version_effective_from, v_schedule_effective_from);
  v_effective_to := v_version_effective_to;
  v_config := coalesce(v_schedule_config, '{}'::jsonb) || coalesce(v_version_config, '{}'::jsonb);
  v_pay_rule := coalesce(v_version_pay_rule, v_schedule_pay_rule, '{}'::jsonb);
  v_auto_generate := coalesce((v_version_config->>'autoGeneratePeriods')::boolean, v_schedule_auto_generate, false);
  v_auto_create_runs := coalesce((v_config->>'autoCreateRuns')::boolean, (v_config->>'auto_calculate')::boolean, v_schedule_auto_calculate, false);

  if v_auto_generate and v_version_id is not null then
    select * into v_shape from private.payroll_maintenance_shape(v_frequency, v_config, v_effective_from, v_effective_to, greatest(p_reference_date, v_effective_from), v_pay_rule);
    if found then
      insert into pg_temp.payroll_maintenance_desired values (v_shape.period_start, v_shape.period_end, v_shape.pay_date, v_schedule_id, v_version_id) on conflict do nothing;
      v_current_start := v_shape.period_start; v_current_end := v_shape.period_end;
      v_cursor := v_current_start - 1;
      for v_index in 1..2 loop
        if v_cursor < v_effective_from then exit; end if;
        select * into v_shape from private.payroll_maintenance_shape(v_frequency, v_config, v_effective_from, v_effective_to, v_cursor, v_pay_rule);
        exit when not found;
        insert into pg_temp.payroll_maintenance_desired values (v_shape.period_start, v_shape.period_end, v_shape.pay_date, v_schedule_id, v_version_id) on conflict do nothing;
        v_cursor := v_shape.period_start - 1;
      end loop;
      v_cursor := v_current_end + 1;
      for v_index in 1..2 loop
        if v_effective_to is not null and v_cursor > v_effective_to then exit; end if;
        select * into v_shape from private.payroll_maintenance_shape(v_frequency, v_config, v_effective_from, v_effective_to, v_cursor, v_pay_rule);
        exit when not found;
        insert into pg_temp.payroll_maintenance_desired values (v_shape.period_start, v_shape.period_end, v_shape.pay_date, v_schedule_id, v_version_id) on conflict do nothing;
        v_cursor := v_shape.period_end + 1;
      end loop;
    end if;
  end if;

  if p_action = 'REPAIR' then
    select count(*) into v_periods_to_delete
    from public.payroll_periods p
    where p.company_id = p_company_id
      and private.payroll_maintenance_period_is_disposable(p_company_id, p.id, p_action)
      and (
        p.status = 'VOID'
        or exists (
          select 1 from public.payroll_periods p2
          where p2.company_id = p_company_id and p2.schedule_id = p.schedule_id
            and p2.period_start = p.period_start and p2.period_end = p.period_end
            and p2.id <> p.id and (p2.created_at < p.created_at or (p2.created_at = p.created_at and p2.id < p.id))
        )
      );
  elsif p_action = 'REBUILD_CALENDAR' then
    select count(*) into v_periods_to_delete
    from public.payroll_periods p
    where p.company_id = p_company_id
      and private.payroll_maintenance_period_is_disposable(p_company_id, p.id, p_action)
      and (p.status = 'VOID' or not exists (
        select 1 from pg_temp.payroll_maintenance_desired d
        where d.schedule_id = p.schedule_id and d.period_start = p.period_start and d.period_end = p.period_end
      ));
  else
    select count(*) into v_periods_to_delete
    from public.payroll_periods p
    where p.company_id = p_company_id and private.payroll_maintenance_period_is_disposable(p_company_id, p.id, p_action);
  end if;

  select array_agg(r.id), array_agg(distinct r.period_id) into v_target_run_ids, v_target_period_ids
  from public.payroll_runs r join public.payroll_periods p on p.id = r.period_id and p.company_id = p_company_id
  where r.company_id = p_company_id and p_action = 'RESET_UNAPPROVED' and r.status in ('DRAFT', 'CALCULATED')
    and p.status not in ('APPROVED', 'PAID', 'VOID') and p.locked_at is null and private.payroll_maintenance_system_note(r.notes);

  select count(*) into v_runs_to_delete from public.payroll_runs r
  where r.company_id = p_company_id and (
    (p_action = 'RESET_UNAPPROVED' and r.status in ('DRAFT', 'CALCULATED') and private.payroll_maintenance_system_note(r.notes) and exists (
      select 1 from public.payroll_periods p where p.id = r.period_id and p.company_id = p_company_id and p.status not in ('APPROVED', 'PAID', 'VOID') and p.locked_at is null and private.payroll_maintenance_system_note(r.notes)
    ))
    or (r.status in ('DRAFT', 'VOID') and private.payroll_maintenance_run_is_disposable(p_company_id, r.id) and private.payroll_maintenance_period_is_disposable(p_company_id, r.period_id, p_action) and (p_action = 'RESET_UNAPPROVED' or r.status = 'VOID' or not exists (select 1 from pg_temp.payroll_maintenance_desired d join public.payroll_periods p on p.id = r.period_id where d.schedule_id = p.schedule_id and d.period_start = p.period_start and d.period_end = p.period_end)))
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
  where pir.company_id = p_company_id and pir.status = 'COMMITTED' and p_action = 'RESET_UNAPPROVED' and (
    pir.batch_id = any(coalesce((select array_agg(b.id) from public.payroll_import_batches b where b.company_id = p_company_id and b.status = 'COMMITTED' and (b.committed_payroll_run_id = any(coalesce(v_target_run_ids, '{}'::uuid[])) or b.committed_payroll_period_id = any(coalesce(v_target_period_ids, '{}'::uuid[])))), '{}'::uuid[]))
    or pir.committed_payroll_entry_id in (select e.id from public.payroll_entries e where e.company_id = p_company_id and e.payroll_run_id = any(coalesce(v_target_run_ids, '{}'::uuid[])))
  );

  select count(*) into v_periods_to_create
  from pg_temp.payroll_maintenance_desired d
  where not exists (
    select 1 from public.payroll_periods p
    where p.company_id = p_company_id and p.schedule_id = d.schedule_id
      and p.period_start = d.period_start and p.period_end = d.period_end
      and p.status <> 'VOID'
  );

  select count(*) into v_protected_approved_runs from public.payroll_runs r where r.company_id = p_company_id and r.status = 'APPROVED';
  select count(*) into v_protected_paid_runs from public.payroll_runs r where r.company_id = p_company_id and r.status = 'PAID';
  select count(*) into v_protected_locked_periods from public.payroll_periods p where p.company_id = p_company_id and (p.locked_at is not null or p.status in ('APPROVED', 'PAID', 'VOID')) and not private.payroll_maintenance_period_is_disposable(p_company_id, p.id, p_action);
  select count(*) into v_protected_data_periods from public.payroll_periods p where p.company_id = p_company_id and not private.payroll_maintenance_period_is_disposable(p_company_id, p.id, p_action);
  select count(*) into v_manual_review_issues from public.payroll_periods p where p.company_id = p_company_id and not private.payroll_maintenance_period_is_disposable(p_company_id, p.id, p_action) and p.status = 'VOID';

  v_no_changes := (v_periods_to_delete + v_runs_to_delete + v_entries_to_delete + v_allocations_to_delete + v_adjustments_to_delete + v_import_batches_to_reopen + v_import_rows_to_reopen + v_periods_to_create) = 0;

  return jsonb_build_object(
    'action', p_action,
    'scheduleFrequency', v_frequency,
    'scheduleName', v_schedule_name,
    'referenceDate', p_reference_date,
    'rebuildStart', (select min(period_start) from pg_temp.payroll_maintenance_desired),
    'rebuildEnd', (select max(period_end) from pg_temp.payroll_maintenance_desired),
    'periodsToDelete', v_periods_to_delete,
    'runsToDelete', v_runs_to_delete,
    'entriesToDelete', v_entries_to_delete,
    'allocationsToDelete', v_allocations_to_delete,
    'adjustmentsToDelete', v_adjustments_to_delete,
    'importBatchesToReopen', v_import_batches_to_reopen,
    'importRowsToReopen', v_import_rows_to_reopen,
    'periodsToCreate', v_periods_to_create,
    'runsToCreate', case when v_auto_create_runs and v_periods_to_create > 0 then 1 else 0 end,
    'protectedApprovedRuns', v_protected_approved_runs,
    'protectedPaidRuns', v_protected_paid_runs,
    'protectedLockedPeriods', v_protected_locked_periods,
    'protectedDataBearingPeriods', v_protected_data_periods,
    'manualReviewIssues', v_manual_review_issues,
    'eligible', not v_no_changes,
    'noChanges', v_no_changes
  );
end;
$$;

create or replace function public.apply_payroll_maintenance(p_company_id uuid, p_action text, p_reference_date date default current_date, p_confirmation text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_plan jsonb;
  v_actor_user_id uuid := auth.uid();
  v_target_run_ids uuid[];
  v_target_period_ids uuid[];
  v_created_period_count integer := 0;
  v_created_run_count integer := 0;
  v_current_period_id uuid;
begin
  if p_company_id is null or p_action not in ('REPAIR', 'REBUILD_CALENDAR', 'RESET_UNAPPROVED') then raise exception 'Payroll maintenance request is invalid' using errcode = '22023'; end if;
  if not private.has_company_permission(p_company_id, 'payroll.settings') or not private.has_company_permission(p_company_id, 'payroll.manage') then raise exception 'You do not have permission to manage payroll maintenance' using errcode = '42501'; end if;
  if p_action = 'RESET_UNAPPROVED' and p_confirmation is distinct from 'RESET UNAPPROVED PAYROLL' then raise exception 'Type RESET UNAPPROVED PAYROLL to confirm unapproved reset' using errcode = '22023'; end if;

  v_plan := private.build_payroll_maintenance_plan(p_company_id, p_action, p_reference_date);

  select array_agg(r.id), array_agg(distinct r.period_id) into v_target_run_ids, v_target_period_ids
  from public.payroll_runs r join public.payroll_periods p on p.id = r.period_id and p.company_id = p_company_id
  where r.company_id = p_company_id and p_action = 'RESET_UNAPPROVED' and r.status in ('DRAFT', 'CALCULATED')
    and p.status not in ('APPROVED', 'PAID', 'VOID') and p.locked_at is null and private.payroll_maintenance_system_note(r.notes);

  if p_action = 'RESET_UNAPPROVED' then
    delete from public.payroll_project_allocations a
    where a.company_id = p_company_id and exists (
      select 1 from public.payroll_entries e where e.id = a.payroll_entry_id and e.company_id = p_company_id and e.payroll_run_id = any(coalesce(v_target_run_ids, '{}'::uuid[]))
    );
    delete from public.payroll_adjustments a
    where a.company_id = p_company_id and exists (
      select 1 from public.payroll_entries e where e.id = a.payroll_entry_id and e.company_id = p_company_id and e.payroll_run_id = any(coalesce(v_target_run_ids, '{}'::uuid[]))
    );
    delete from public.payroll_entries e where e.company_id = p_company_id and e.payroll_run_id = any(coalesce(v_target_run_ids, '{}'::uuid[]));
    delete from public.payroll_runs r where r.company_id = p_company_id and r.id = any(coalesce(v_target_run_ids, '{}'::uuid[]));

    update public.payroll_import_rows pir
    set status = case when pir.status = 'COMMITTED' then 'READY' else pir.status end,
        committed_payroll_entry_id = null,
        updated_at = clock_timestamp()
    where pir.company_id = p_company_id and (
      pir.committed_payroll_entry_id is not null and not exists (select 1 from public.payroll_entries e where e.id = pir.committed_payroll_entry_id and e.company_id = p_company_id)
      or pir.batch_id = any(coalesce(v_target_run_ids, '{}'::uuid[]))
    );

    update public.payroll_import_batches b
    set status = case when b.status = 'COMMITTED' then 'VALIDATED' else b.status end,
        committed_payroll_period_id = null,
        committed_payroll_run_id = null,
        committed_at = null,
        updated_at = clock_timestamp()
    where b.company_id = p_company_id and (
      b.committed_payroll_run_id = any(coalesce(v_target_run_ids, '{}'::uuid[]))
      or b.committed_payroll_period_id = any(coalesce(v_target_period_ids, '{}'::uuid[]))
    );
  end if;

  -- Delete disposable runs
  delete from public.payroll_runs r
  where r.company_id = p_company_id and (
    (r.status in ('DRAFT', 'VOID') and private.payroll_maintenance_run_is_disposable(p_company_id, r.id) and private.payroll_maintenance_period_is_disposable(p_company_id, r.period_id, p_action) and (p_action = 'RESET_UNAPPROVED' or r.status = 'VOID' or not exists (select 1 from pg_temp.payroll_maintenance_desired d join public.payroll_periods p on p.id = r.period_id where d.schedule_id = p.schedule_id and d.period_start = p.period_start and d.period_end = p.period_end)))
  );

  -- Delete disposable periods
  if p_action = 'REPAIR' then
    delete from public.payroll_periods p
    where p.company_id = p_company_id
      and private.payroll_maintenance_period_is_disposable(p_company_id, p.id, p_action)
      and (
        p.status = 'VOID'
        or exists (
          select 1 from public.payroll_periods p2
          where p2.company_id = p_company_id and p2.schedule_id = p.schedule_id
            and p2.period_start = p.period_start and p2.period_end = p.period_end
            and p2.id <> p.id and (p2.created_at < p.created_at or (p2.created_at = p.created_at and p2.id < p.id))
        )
      );

    -- Update metadata (version ID, pay_date) on matching disposable periods in-place
    update public.payroll_periods p
    set schedule_version_id = d.schedule_version_id,
        pay_date = coalesce(d.pay_date, p.pay_date),
        updated_at = clock_timestamp()
    from pg_temp.payroll_maintenance_desired d
    where p.company_id = p_company_id and p.schedule_id = d.schedule_id
      and p.period_start = d.period_start and p.period_end = d.period_end
      and p.status not in ('APPROVED', 'PAID', 'VOID') and p.locked_at is null
      and (p.schedule_version_id is distinct from d.schedule_version_id or (d.pay_date is not null and p.pay_date is distinct from d.pay_date));
  elsif p_action = 'REBUILD_CALENDAR' then
    delete from public.payroll_periods p
    where p.company_id = p_company_id
      and private.payroll_maintenance_period_is_disposable(p_company_id, p.id, p_action)
      and (p.status = 'VOID' or not exists (
        select 1 from pg_temp.payroll_maintenance_desired d
        where d.schedule_id = p.schedule_id and d.period_start = p.period_start and d.period_end = p.period_end
      ));
  else
    delete from public.payroll_periods p
    where p.company_id = p_company_id and private.payroll_maintenance_period_is_disposable(p_company_id, p.id, p_action);
  end if;

  -- Insert missing canonical periods
  insert into public.payroll_periods (
    company_id, schedule_id, schedule_version_id, period_start, period_end, pay_date, status, auto_generated, notes, created_by
  )
  select p_company_id, d.schedule_id, d.schedule_version_id, d.period_start, d.period_end, d.pay_date,
         case when d.period_start <= p_reference_date and d.period_end >= p_reference_date then 'OPEN' else 'DRAFT' end,
         true, 'Generated by payroll maintenance', v_actor_user_id
  from pg_temp.payroll_maintenance_desired d
  where not exists (
    select 1 from public.payroll_periods p
    where p.company_id = p_company_id and p.schedule_id = d.schedule_id
      and p.period_start = d.period_start and p.period_end = d.period_end
      and p.status <> 'VOID'
  )
  on conflict do nothing;

  GET DIAGNOSTICS v_created_period_count = ROW_COUNT;

  -- Auto-create run for active current period if needed
  select p.id into v_current_period_id
  from public.payroll_periods p
  where p.company_id = p_company_id and p.period_start <= p_reference_date and p.period_end >= p_reference_date and p.status <> 'VOID'
  order by p.period_start desc limit 1;

  if v_current_period_id is not null and not exists (select 1 from public.payroll_runs r where r.company_id = p_company_id and r.period_id = v_current_period_id and r.status <> 'VOID') then
    insert into public.payroll_runs (
      company_id, period_id, run_type, status, notes, created_by
    ) values (
      p_company_id, v_current_period_id, 'REGULAR', 'DRAFT', 'Created by payroll maintenance', v_actor_user_id
    ) on conflict do nothing;
    GET DIAGNOSTICS v_created_run_count = ROW_COUNT;
  end if;

  insert into public.company_audit_events (
    company_id, user_id, event_type, payload
  ) values (
    p_company_id, v_actor_user_id,
    case when p_action = 'REPAIR' then 'PAYROLL_REPAIR_APPLIED'
         when p_action = 'REBUILD_CALENDAR' then 'PAYROLL_CALENDAR_REBUILT'
         else 'PAYROLL_UNAPPROVED_RESET' end,
    jsonb_build_object('plan', v_plan, 'createdPeriods', v_created_period_count, 'createdRuns', v_created_run_count, 'referenceDate', p_reference_date)
  );

  return v_plan || jsonb_build_object('applied', true, 'createdPeriods', v_created_period_count, 'createdRuns', v_created_run_count);
end;
$$;
