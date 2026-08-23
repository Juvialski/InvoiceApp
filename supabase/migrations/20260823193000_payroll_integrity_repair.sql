-- Payroll integrity repair, additive and data-preserving.
-- Existing active schedule duplicates are deactivated deterministically; rows and
-- all locked payroll history remain intact. Future generation uses one primary.
set search_path = public;

do $$
begin
  with ranked as (
    select id,
           row_number() over (
             partition by user_id
             order by updated_at desc nulls last, created_at desc nulls last, id desc
           ) as keep_rank
    from public.payroll_schedules
    where active
  )
  update public.payroll_schedules schedules
  set active = false, updated_at = now()
  from ranked
  where schedules.id = ranked.id
    and ranked.keep_rank > 1;
end $$;

create unique index if not exists payroll_schedules_one_active_per_user
  on public.payroll_schedules(user_id)
  where active = true;

create or replace function public.guard_single_active_payroll_schedule()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.active then
    update public.payroll_schedules
    set active = false, updated_at = now()
    where user_id = new.user_id
      and id <> new.id
      and active;
  end if;
  return new;
end;
$$;

drop trigger if exists payroll_schedules_single_active_guard on public.payroll_schedules;
create trigger payroll_schedules_single_active_guard
before insert or update on public.payroll_schedules
for each row execute function public.guard_single_active_payroll_schedule();

create or replace function public.validate_invoice_project_allocation_ownership()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.invoices i
    join public.projects p on p.id = new.project_id
    where i.id = new.invoice_id and i.user_id = new.user_id and p.user_id = new.user_id
  ) then raise exception 'Invoice and project must belong to the same workspace'; end if;
  return new;
end;
$$;

create or replace function public.validate_expense_project_ownership()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.project_id is not null and not exists (
    select 1 from public.projects p where p.id = new.project_id and p.user_id = new.user_id
  ) then raise exception 'Expense project is outside the current workspace'; end if;
  return new;
end;
$$;

create or replace function public.validate_project_worker_assignment_ownership()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.workers w join public.projects p on p.id = new.project_id
    where w.id = new.worker_id and w.user_id = new.user_id and p.user_id = new.user_id
  ) then raise exception 'Worker and project must belong to the same workspace'; end if;
  return new;
end;
$$;

create or replace function public.validate_work_entry_ownership()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.workers w join public.projects p on p.id = new.project_id
    where w.id = new.worker_id and w.user_id = new.user_id and p.user_id = new.user_id
  ) then raise exception 'Work entry worker and project must belong to the same workspace'; end if;
  if new.period_id is not null and not exists (
    select 1 from public.payroll_periods pp where pp.id = new.period_id and pp.user_id = new.user_id
  ) then raise exception 'Work entry payroll period is outside the current workspace'; end if;
  return new;
end;
$$;

create or replace function public.validate_payroll_run_ownership()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.payroll_periods p where p.id = new.period_id and p.user_id = new.user_id
  ) then raise exception 'Payroll period is outside the current workspace'; end if;
  return new;
end;
$$;

create or replace function public.validate_payroll_entry_ownership()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.payroll_runs r
    join public.workers w on w.id = new.worker_id
    where r.id = new.payroll_run_id and r.user_id = new.user_id and w.user_id = new.user_id
  ) then raise exception 'Payroll entry is outside the current workspace'; end if;
  return new;
end;
$$;

create or replace function public.validate_payroll_project_allocation_ownership()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.payroll_entries e
    join public.projects p on p.id = new.project_id
    where e.id = new.payroll_entry_id and e.user_id = new.user_id and p.user_id = new.user_id
  ) then raise exception 'Payroll allocation is outside the current workspace'; end if;
  return new;
end;
$$;

create or replace function public.validate_payroll_adjustment_ownership()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.payroll_entries e
    where e.id = new.payroll_entry_id and e.user_id = new.user_id
  ) then raise exception 'Payroll adjustment is outside the current workspace'; end if;
  return new;
end;
$$;

drop trigger if exists invoice_project_allocations_ownership on public.invoice_project_allocations;
create trigger invoice_project_allocations_ownership before insert or update on public.invoice_project_allocations for each row execute function public.validate_invoice_project_allocation_ownership();
drop trigger if exists expenses_ownership on public.expenses;
create trigger expenses_ownership before insert or update on public.expenses for each row execute function public.validate_expense_project_ownership();
drop trigger if exists project_worker_assignments_ownership on public.project_worker_assignments;
create trigger project_worker_assignments_ownership before insert or update on public.project_worker_assignments for each row execute function public.validate_project_worker_assignment_ownership();
drop trigger if exists work_entries_ownership on public.work_entries;
create trigger work_entries_ownership before insert or update on public.work_entries for each row execute function public.validate_work_entry_ownership();
drop trigger if exists payroll_runs_ownership on public.payroll_runs;
create trigger payroll_runs_ownership before insert or update on public.payroll_runs for each row execute function public.validate_payroll_run_ownership();
drop trigger if exists payroll_entries_ownership on public.payroll_entries;
create trigger payroll_entries_ownership before insert or update on public.payroll_entries for each row execute function public.validate_payroll_entry_ownership();
drop trigger if exists payroll_project_allocations_ownership on public.payroll_project_allocations;
create trigger payroll_project_allocations_ownership before insert or update on public.payroll_project_allocations for each row execute function public.validate_payroll_project_allocation_ownership();
drop trigger if exists payroll_adjustments_ownership on public.payroll_adjustments;
create trigger payroll_adjustments_ownership before insert or update on public.payroll_adjustments for each row execute function public.validate_payroll_adjustment_ownership();

create or replace function public.validate_department_metadata_ownership()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.manager_worker_id is not null and not exists (
    select 1 from public.workers w where w.id = new.manager_worker_id and w.user_id = new.user_id
  ) then raise exception 'Department manager must belong to the same workspace'; end if;
  return new;
end;
$$;

create or replace function public.validate_worker_metadata_ownership()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.department_id is not null and not exists (
    select 1 from public.departments d where d.id = new.department_id and d.user_id = new.user_id
  ) then raise exception 'Worker department must belong to the same workspace'; end if;
  if new.manager_worker_id is not null and not exists (
    select 1 from public.workers manager where manager.id = new.manager_worker_id and manager.user_id = new.user_id
  ) then raise exception 'Worker manager must belong to the same workspace'; end if;
  return new;
end;
$$;

drop trigger if exists departments_metadata_ownership on public.departments;
create trigger departments_metadata_ownership before insert or update on public.departments for each row execute function public.validate_department_metadata_ownership();
drop trigger if exists workers_metadata_ownership on public.workers;
create trigger workers_metadata_ownership before insert or update on public.workers for each row execute function public.validate_worker_metadata_ownership();

create or replace function public.validate_worker_compensation_profile_ownership()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.workers w where w.id = new.worker_id and w.user_id = new.user_id
  ) then raise exception 'Payroll profile worker is outside the current workspace'; end if;
  if new.default_project_id is not null and not exists (
    select 1 from public.projects p where p.id = new.default_project_id and p.user_id = new.user_id
  ) then raise exception 'Payroll profile default project is outside the current workspace'; end if;
  return new;
end;
$$;

create or replace function public.validate_recurring_payroll_component_ownership()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (
    select 1 from public.workers w where w.id = new.worker_id and w.user_id = new.user_id
  ) then raise exception 'Payroll component worker is outside the current workspace'; end if;
  return new;
end;
$$;

drop trigger if exists worker_compensation_profiles_ownership on public.worker_compensation_profiles;
create trigger worker_compensation_profiles_ownership before insert or update on public.worker_compensation_profiles for each row execute function public.validate_worker_compensation_profile_ownership();
drop trigger if exists recurring_payroll_components_ownership on public.recurring_payroll_components;
create trigger recurring_payroll_components_ownership before insert or update on public.recurring_payroll_components for each row execute function public.validate_recurring_payroll_component_ownership();

drop function if exists public.validate_engineering_child_ownership();
drop function if exists public.validate_workforce_metadata_ownership();
drop function if exists public.validate_payroll_profile_ownership();

alter table public.departments enable row level security;
alter table public.workers enable row level security;
alter table public.project_worker_assignments enable row level security;
alter table public.payroll_schedules enable row level security;
alter table public.payroll_schedule_versions enable row level security;
alter table public.worker_compensation_profiles enable row level security;
alter table public.recurring_payroll_components enable row level security;
alter table public.payroll_periods enable row level security;
alter table public.work_entries enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_entries enable row level security;
alter table public.payroll_project_allocations enable row level security;
alter table public.payroll_adjustments enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table
  public.departments,
  public.workers,
  public.project_worker_assignments,
  public.payroll_schedules,
  public.payroll_schedule_versions,
  public.worker_compensation_profiles,
  public.recurring_payroll_components,
  public.payroll_periods,
  public.work_entries,
  public.payroll_runs,
  public.payroll_entries,
  public.payroll_project_allocations,
  public.payroll_adjustments
to authenticated;
