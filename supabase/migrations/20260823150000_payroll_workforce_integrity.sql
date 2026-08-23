-- Payroll/workforce integrity hardening.
-- This migration is additive: legacy rows are retained. If duplicate payroll
-- entries already exist, the unique index preflight fails and asks for an
-- explicit data decision rather than deleting or selecting a survivor.

do $$
declare
  duplicate_count integer;
begin
  select count(*)
    into duplicate_count
  from (
    select user_id, payroll_run_id, worker_id
    from public.payroll_entries
    group by user_id, payroll_run_id, worker_id
    having count(*) > 1
  ) duplicates;

  if duplicate_count > 0 then
    raise exception
      'Cannot install payroll entry uniqueness: % duplicate (user_id, payroll_run_id, worker_id) group(s) require explicit reconciliation',
      duplicate_count;
  end if;
end $$;

create unique index if not exists payroll_entries_user_run_worker_unique
  on public.payroll_entries(user_id, payroll_run_id, worker_id);

-- New work entries must link to an owned payroll period. Existing unlinked
-- legacy rows remain readable and may be updated in place until the caller
-- supplies a period link.
create or replace function public.validate_payroll_work_entry_integrity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  period_owner uuid;
  period_start date;
  period_end date;
begin
  if new.period_id is null then
    if tg_op = 'UPDATE' and old.period_id is null then
      return new;
    end if;
    raise exception 'Work entry must link to a payroll period';
  end if;

  select pp.user_id, pp.period_start, pp.period_end
    into period_owner, period_start, period_end
  from public.payroll_periods pp
  where pp.id = new.period_id;

  if period_owner is null or period_owner is distinct from new.user_id then
    raise exception 'Work entry payroll period is outside the current workspace';
  end if;

  if new.work_date < period_start or new.work_date > period_end then
    raise exception 'Work entry date must fall within its payroll period';
  end if;

  if not exists (
    select 1
    from public.workers w
    join public.projects p on p.id = new.project_id
    where w.id = new.worker_id
      and w.user_id = new.user_id
      and p.user_id = new.user_id
  ) then
    raise exception 'Work entry worker and project must belong to the same workspace';
  end if;

  return new;
end;
$$;

drop trigger if exists work_entries_payroll_integrity on public.work_entries;
create trigger work_entries_payroll_integrity
before insert or update on public.work_entries
for each row execute function public.validate_payroll_work_entry_integrity();

-- Payroll runs have one legal forward path. VOID is explicit and terminal;
-- PAID is terminal. New rows always start in DRAFT.
create or replace function public.guard_payroll_run_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'DRAFT' then
      raise exception 'Payroll runs must be created in DRAFT status';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status in ('APPROVED', 'PAID') then
      raise exception 'Approved or paid payroll runs cannot be deleted';
    end if;
    return old;
  end if;

  if new.user_id is distinct from old.user_id
     or new.period_id is distinct from old.period_id then
    raise exception 'Payroll run ownership and period linkage are immutable';
  end if;

  if new.status = old.status then
    if old.status in ('APPROVED', 'PAID', 'VOID') and old is distinct from new then
      raise exception 'Approved, paid, or void payroll runs are immutable';
    end if;
    return new;
  end if;

  if not (
    (old.status = 'DRAFT' and new.status in ('CALCULATED', 'VOID'))
    or (old.status = 'CALCULATED' and new.status in ('APPROVED', 'VOID'))
    or (old.status = 'APPROVED' and new.status in ('PAID', 'VOID'))
  ) then
    raise exception 'Invalid payroll run transition: % -> %', old.status, new.status;
  end if;

  if old.status = 'APPROVED' and new.status in ('PAID', 'VOID') then
    if new.notes is distinct from old.notes
       or new.approved_at is distinct from old.approved_at then
      raise exception 'Approved payroll runs allow only the next state transition';
    end if;
  end if;

  if new.status = 'APPROVED' then
    if not exists (
      select 1
      from public.payroll_entries pe
      where pe.payroll_run_id = new.id
        and pe.user_id = new.user_id
    ) then
      raise exception 'Payroll run approval requires at least one payroll entry';
    end if;

    if exists (
      select 1
      from public.payroll_entries pe
      where pe.payroll_run_id = new.id
        and (
          pe.calculation_snapshot is null
          or jsonb_typeof(pe.calculation_snapshot) <> 'object'
          or pe.calculation_snapshot = '{}'::jsonb
        )
    ) then
      raise exception 'Payroll run approval requires a non-empty object snapshot on every entry';
    end if;

    new.approved_at := coalesce(new.approved_at, now());
    new.paid_at := null;
  elsif new.status = 'PAID' then
    new.paid_at := coalesce(old.paid_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists payroll_runs_transition_guard on public.payroll_runs;
create trigger payroll_runs_transition_guard
before insert or update or delete on public.payroll_runs
for each row execute function public.guard_payroll_run_transition();

create or replace function public.guard_payroll_entry_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op <> 'INSERT' then
    if exists (
      select 1
      from public.payroll_runs pr
      where pr.id = old.payroll_run_id
        and pr.status in ('APPROVED', 'PAID', 'VOID')
    ) then
      raise exception 'Payroll entries cannot be changed after the run is approved, paid, or void';
    end if;
  end if;

  if tg_op <> 'DELETE' and exists (
    select 1
    from public.payroll_runs pr
    where pr.id = new.payroll_run_id
      and pr.status in ('APPROVED', 'PAID', 'VOID')
  ) then
    raise exception 'Payroll entries cannot be added to an approved, paid, or void run';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.guard_payroll_allocation_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op <> 'INSERT' then
    if exists (
      select 1
      from public.payroll_entries pe
      join public.payroll_runs pr on pr.id = pe.payroll_run_id
      where pe.id = old.payroll_entry_id
        and pr.status in ('APPROVED', 'PAID', 'VOID')
    ) then
      raise exception 'Payroll allocations cannot be changed after the run is approved, paid, or void';
    end if;
  end if;

  if tg_op <> 'DELETE' and exists (
    select 1
    from public.payroll_entries pe
    join public.payroll_runs pr on pr.id = pe.payroll_run_id
    where pe.id = new.payroll_entry_id
      and pr.status in ('APPROVED', 'PAID', 'VOID')
  ) then
    raise exception 'Payroll allocations cannot be added to an approved, paid, or void run';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.guard_payroll_adjustment_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op <> 'INSERT' then
    if exists (
      select 1
      from public.payroll_entries pe
      join public.payroll_runs pr on pr.id = pe.payroll_run_id
      where pe.id = old.payroll_entry_id
        and pr.status in ('APPROVED', 'PAID', 'VOID')
    ) then
      raise exception 'Payroll adjustments cannot be changed after the run is approved, paid, or void';
    end if;
  end if;

  if tg_op <> 'DELETE' and exists (
    select 1
    from public.payroll_entries pe
    join public.payroll_runs pr on pr.id = pe.payroll_run_id
    where pe.id = new.payroll_entry_id
      and pr.status in ('APPROVED', 'PAID', 'VOID')
  ) then
    raise exception 'Payroll adjustments cannot be added to an approved, paid, or void run';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists payroll_entries_mutation_guard on public.payroll_entries;
create trigger payroll_entries_mutation_guard
before insert or update or delete on public.payroll_entries
for each row execute function public.guard_payroll_entry_mutation();

drop trigger if exists payroll_project_allocations_mutation_guard on public.payroll_project_allocations;
create trigger payroll_project_allocations_mutation_guard
before insert or update or delete on public.payroll_project_allocations
for each row execute function public.guard_payroll_allocation_mutation();

drop trigger if exists payroll_adjustments_mutation_guard on public.payroll_adjustments;
create trigger payroll_adjustments_mutation_guard
before insert or update or delete on public.payroll_adjustments
for each row execute function public.guard_payroll_adjustment_mutation();

-- Validate both aggregate amount and aggregate percentage. This stays
-- deferred so a caller can replace an allocation set in one transaction.
create or replace function public.assert_payroll_project_allocation_totals(target_entry uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  entry_cost numeric;
  allocated_amount numeric;
  allocated_percentage numeric;
begin
  select pe.project_allocated_cost
    into entry_cost
  from public.payroll_entries pe
  where pe.id = target_entry;

  if entry_cost is null then
    return;
  end if;

  select coalesce(sum(ppa.allocation_amount), 0),
         coalesce(sum(ppa.allocation_percentage), 0)
    into allocated_amount, allocated_percentage
  from public.payroll_project_allocations ppa
  where ppa.payroll_entry_id = target_entry;

  if allocated_percentage > 100.01 then
    raise exception 'Payroll allocation percentages exceed 100%% by %',
      round(allocated_percentage - 100, 2);
  end if;

  if allocated_amount > entry_cost + 0.01 then
    raise exception 'Payroll project allocation exceeds payroll entry cost by %',
      round(allocated_amount - entry_cost, 2);
  end if;
end;
$$;

create or replace function public.validate_payroll_project_allocation_totals()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.payroll_entry_id is distinct from new.payroll_entry_id) then
    perform public.assert_payroll_project_allocation_totals(old.payroll_entry_id);
  end if;
  if tg_op <> 'DELETE' then
    perform public.assert_payroll_project_allocation_totals(new.payroll_entry_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.validate_payroll_entry_allocation_total()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.assert_payroll_project_allocation_totals(new.id);
  return new;
end;
$$;

drop trigger if exists payroll_project_allocation_total_check on public.payroll_project_allocations;
create constraint trigger payroll_project_allocation_total_check
after insert or update or delete on public.payroll_project_allocations
deferrable initially deferred for each row
execute function public.validate_payroll_project_allocation_totals();

drop trigger if exists payroll_entry_allocation_total_check on public.payroll_entries;
create constraint trigger payroll_entry_allocation_total_check
after insert or update on public.payroll_entries
deferrable initially deferred for each row
execute function public.validate_payroll_entry_allocation_total();

-- Replace the broad owner-only policies with owner plus relationship checks.
-- UPDATE has both USING and WITH CHECK so ownership cannot be reassigned.
alter table public.payroll_periods enable row level security;
alter table public.work_entries enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_entries enable row level security;
alter table public.payroll_project_allocations enable row level security;
alter table public.payroll_adjustments enable row level security;

drop policy if exists payroll_periods_select_own on public.payroll_periods;
drop policy if exists payroll_periods_insert_own on public.payroll_periods;
drop policy if exists payroll_periods_update_own on public.payroll_periods;
drop policy if exists payroll_periods_delete_own on public.payroll_periods;
create policy payroll_periods_select_own on public.payroll_periods for select to authenticated using (user_id = (select auth.uid()));
create policy payroll_periods_insert_own on public.payroll_periods for insert to authenticated with check (user_id = (select auth.uid()));
create policy payroll_periods_update_own on public.payroll_periods for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy payroll_periods_delete_own on public.payroll_periods for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists work_entries_select_own on public.work_entries;
drop policy if exists work_entries_insert_own on public.work_entries;
drop policy if exists work_entries_update_own on public.work_entries;
drop policy if exists work_entries_delete_own on public.work_entries;
create policy work_entries_select_own on public.work_entries for select to authenticated
using (
  user_id = (select auth.uid())
  and exists (select 1 from public.workers w join public.projects p on p.id = work_entries.project_id where w.id = work_entries.worker_id and w.user_id = work_entries.user_id and p.user_id = work_entries.user_id)
  and (work_entries.period_id is null or exists (select 1 from public.payroll_periods pp where pp.id = work_entries.period_id and pp.user_id = work_entries.user_id))
);
create policy work_entries_insert_own on public.work_entries for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.workers w join public.projects p on p.id = work_entries.project_id where w.id = work_entries.worker_id and w.user_id = work_entries.user_id and p.user_id = work_entries.user_id)
  and exists (select 1 from public.payroll_periods pp where pp.id = work_entries.period_id and pp.user_id = work_entries.user_id)
);
create policy work_entries_update_own on public.work_entries for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.workers w join public.projects p on p.id = work_entries.project_id where w.id = work_entries.worker_id and w.user_id = work_entries.user_id and p.user_id = work_entries.user_id)
  and (work_entries.period_id is null or exists (select 1 from public.payroll_periods pp where pp.id = work_entries.period_id and pp.user_id = work_entries.user_id))
);
create policy work_entries_delete_own on public.work_entries for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists payroll_runs_select_own on public.payroll_runs;
drop policy if exists payroll_runs_insert_own on public.payroll_runs;
drop policy if exists payroll_runs_update_own on public.payroll_runs;
drop policy if exists payroll_runs_delete_own on public.payroll_runs;
create policy payroll_runs_select_own on public.payroll_runs for select to authenticated using (user_id = (select auth.uid()));
create policy payroll_runs_insert_own on public.payroll_runs for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.payroll_periods pp where pp.id = payroll_runs.period_id and pp.user_id = payroll_runs.user_id));
create policy payroll_runs_update_own on public.payroll_runs for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and exists (select 1 from public.payroll_periods pp where pp.id = payroll_runs.period_id and pp.user_id = payroll_runs.user_id));
create policy payroll_runs_delete_own on public.payroll_runs for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists payroll_entries_select_own on public.payroll_entries;
drop policy if exists payroll_entries_insert_own on public.payroll_entries;
drop policy if exists payroll_entries_update_own on public.payroll_entries;
drop policy if exists payroll_entries_delete_own on public.payroll_entries;
create policy payroll_entries_select_own on public.payroll_entries for select to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.payroll_runs pr join public.workers w on w.user_id = pr.user_id where pr.id = payroll_entries.payroll_run_id and pr.user_id = payroll_entries.user_id and w.id = payroll_entries.worker_id));
create policy payroll_entries_insert_own on public.payroll_entries for insert to authenticated
with check (user_id = (select auth.uid()) and exists (select 1 from public.payroll_runs pr join public.workers w on w.user_id = pr.user_id where pr.id = payroll_entries.payroll_run_id and pr.user_id = payroll_entries.user_id and w.id = payroll_entries.worker_id));
create policy payroll_entries_update_own on public.payroll_entries for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()) and exists (select 1 from public.payroll_runs pr join public.workers w on w.user_id = pr.user_id where pr.id = payroll_entries.payroll_run_id and pr.user_id = payroll_entries.user_id and w.id = payroll_entries.worker_id));
create policy payroll_entries_delete_own on public.payroll_entries for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists payroll_project_allocations_select_own on public.payroll_project_allocations;
drop policy if exists payroll_project_allocations_insert_own on public.payroll_project_allocations;
drop policy if exists payroll_project_allocations_update_own on public.payroll_project_allocations;
drop policy if exists payroll_project_allocations_delete_own on public.payroll_project_allocations;
create policy payroll_project_allocations_select_own on public.payroll_project_allocations for select to authenticated
using (user_id = (select auth.uid()) and exists (select 1 from public.payroll_entries pe join public.projects p on p.id = payroll_project_allocations.project_id where pe.id = payroll_project_allocations.payroll_entry_id and pe.user_id = payroll_project_allocations.user_id and p.user_id = payroll_project_allocations.user_id));
create policy payroll_project_allocations_insert_own on public.payroll_project_allocations for insert to authenticated
with check (user_id = (select auth.uid()) and exists (select 1 from public.payroll_entries pe join public.projects p on p.id = payroll_project_allocations.project_id where pe.id = payroll_project_allocations.payroll_entry_id and pe.user_id = payroll_project_allocations.user_id and p.user_id = payroll_project_allocations.user_id));
create policy payroll_project_allocations_update_own on public.payroll_project_allocations for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()) and exists (select 1 from public.payroll_entries pe join public.projects p on p.id = payroll_project_allocations.project_id where pe.id = payroll_project_allocations.payroll_entry_id and pe.user_id = payroll_project_allocations.user_id and p.user_id = payroll_project_allocations.user_id));
create policy payroll_project_allocations_delete_own on public.payroll_project_allocations for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists payroll_adjustments_select_own on public.payroll_adjustments;
drop policy if exists payroll_adjustments_insert_own on public.payroll_adjustments;
drop policy if exists payroll_adjustments_update_own on public.payroll_adjustments;
drop policy if exists payroll_adjustments_delete_own on public.payroll_adjustments;
create policy payroll_adjustments_select_own on public.payroll_adjustments for select to authenticated using (user_id = (select auth.uid()) and exists (select 1 from public.payroll_entries pe where pe.id = payroll_adjustments.payroll_entry_id and pe.user_id = payroll_adjustments.user_id));
create policy payroll_adjustments_insert_own on public.payroll_adjustments for insert to authenticated with check (user_id = (select auth.uid()) and exists (select 1 from public.payroll_entries pe where pe.id = payroll_adjustments.payroll_entry_id and pe.user_id = payroll_adjustments.user_id));
create policy payroll_adjustments_update_own on public.payroll_adjustments for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and exists (select 1 from public.payroll_entries pe where pe.id = payroll_adjustments.payroll_entry_id and pe.user_id = payroll_adjustments.user_id));
create policy payroll_adjustments_delete_own on public.payroll_adjustments for delete to authenticated using (user_id = (select auth.uid()));

grant usage on schema public to authenticated;
grant select, insert, update, delete on table
  public.payroll_periods,
  public.work_entries,
  public.payroll_runs,
  public.payroll_entries,
  public.payroll_project_allocations,
  public.payroll_adjustments
to authenticated;
