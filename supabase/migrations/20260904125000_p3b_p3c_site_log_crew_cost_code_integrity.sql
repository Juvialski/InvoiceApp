-- P3B/P3C Site Log crew cost-code referential integrity.
--
-- The Phase 1C crew table predates project-scoped cost-code assignments and
-- therefore carries only company_id + site_log_id. Persist the authoritative
-- parent project on the historical child before adding the composite FK.
alter table public.engineering_daily_site_log_crew
  add column if not exists project_id uuid;

-- This is a schema backfill, not an operational history edit. Temporarily
-- remove the formal child guard so finalized observations can receive the
-- derived project snapshot during migration; the guard is restored below.
drop trigger if exists engineering_daily_site_log_crew_formal_guard
  on public.engineering_daily_site_log_crew;

update public.engineering_daily_site_log_crew c
set project_id = l.project_id
from public.engineering_daily_site_logs l
where l.id = c.site_log_id;

do $$
begin
  if exists (
    select 1
    from public.engineering_daily_site_log_crew c
    left join public.engineering_daily_site_logs l on l.id = c.site_log_id
    where c.project_id is null
       or l.company_id is distinct from c.company_id
  ) then
    raise exception 'Site Log crew rows must resolve to a same-company parent project';
  end if;
end;
$$;

alter table public.engineering_daily_site_log_crew
  alter column project_id set not null;

create trigger engineering_daily_site_log_crew_formal_guard
before update or delete on public.engineering_daily_site_log_crew
for each row execute function private.prevent_daily_site_log_child_formal_mutation();

-- Derive project_id from the immutable parent log for both the legacy and v2
-- guarded RPCs. A caller-supplied project from another project is rejected.
create or replace function private.validate_daily_site_log_crew_cost_code_scope()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_log_company_id uuid;
  v_log_project_id uuid;
begin
  if tg_op = 'DELETE' then return old; end if;

  select l.company_id, l.project_id
    into v_log_company_id, v_log_project_id
  from public.engineering_daily_site_logs l
  where l.id = new.site_log_id;

  if v_log_company_id is null or v_log_company_id is distinct from new.company_id then
    raise exception 'Daily Site Log crew observation is outside the company' using errcode = '42501';
  end if;

  if new.project_id is null then
    new.project_id := v_log_project_id;
  elsif new.project_id is distinct from v_log_project_id then
    raise exception 'Daily Site Log crew observation project does not match the parent log' using errcode = '42501';
  end if;

  if new.project_cost_code_id is not null and not exists (
    select 1
    from public.project_cost_codes cc
    where cc.id = new.project_cost_code_id
      and cc.company_id = new.company_id
      and cc.project_id = v_log_project_id
  ) then
    raise exception 'Daily Site Log cost code must belong to the same project and company' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function private.validate_daily_site_log_crew_cost_code_scope() from public, anon, authenticated;

drop trigger if exists engineering_daily_site_log_crew_field_scope
  on public.engineering_daily_site_log_crew;
create trigger engineering_daily_site_log_crew_field_scope
before insert or update on public.engineering_daily_site_log_crew
for each row execute function private.validate_daily_site_log_crew_cost_code_scope();

create index if not exists engineering_daily_site_log_crew_cost_code_scope_idx
  on public.engineering_daily_site_log_crew(company_id, project_id, project_cost_code_id)
  where project_cost_code_id is not null;

-- The scope trigger validates the reference when a row is written; this FK
-- keeps it durable afterwards and prevents a cost code from being deleted
-- while a Site Log crew observation still points to it.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.engineering_daily_site_log_crew'::regclass
      and conname = 'engineering_daily_site_log_crew_cost_code_fk'
  ) then
    alter table public.engineering_daily_site_log_crew
      add constraint engineering_daily_site_log_crew_cost_code_fk
      foreign key (company_id, project_id, project_cost_code_id)
      references public.project_cost_codes(company_id, project_id, id)
      on delete restrict
      not valid;
  end if;
end;
$$;

alter table public.engineering_daily_site_log_crew
  validate constraint engineering_daily_site_log_crew_cost_code_fk;
