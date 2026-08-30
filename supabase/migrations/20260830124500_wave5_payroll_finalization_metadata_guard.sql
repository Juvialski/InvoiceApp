-- Wave 5 follow-up: approval authority finalizes an existing payroll result;
-- it must not be usable to rewrite unrelated run metadata in the same UPDATE.

create or replace function public.guard_payroll_run_finalization_metadata()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.status = 'CALCULATED' and new.status = 'APPROVED' then
    if new.created_at is distinct from old.created_at
       or new.notes is distinct from old.notes then
      raise exception 'Payroll approval cannot rewrite existing run metadata'
        using errcode = '42501';
    end if;
  elsif old.status = 'APPROVED' and new.status in ('PAID', 'VOID') then
    if new.created_at is distinct from old.created_at then
      raise exception 'Payroll finalization cannot rewrite run creation history'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists payroll_runs_finalization_metadata_guard on public.payroll_runs;
create trigger payroll_runs_finalization_metadata_guard
before update on public.payroll_runs
for each row execute function public.guard_payroll_run_finalization_metadata();

revoke execute on function public.guard_payroll_run_finalization_metadata() from public, anon, authenticated;
