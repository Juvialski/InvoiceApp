-- ============================================================================
-- Migration: 20260903145000_projects_company_composite_reference.sql
-- Description: Add tenant-safe composite keys required by P2B-2 claim FKs
-- ============================================================================

-- Project and subcontract-line IDs are already globally unique through their
-- primary keys. The explicit (company_id, id) keys give tenant-scoped claim
-- tables database-enforced FK targets without weakening existing identity rules.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.projects'::regclass
      and conname = 'projects_company_id_id_key'
  ) then
    alter table public.projects
      add constraint projects_company_id_id_key unique (company_id, id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.subcontract_lines'::regclass
      and conname = 'subcontract_lines_company_id_id_key'
  ) then
    alter table public.subcontract_lines
      add constraint subcontract_lines_company_id_id_key unique (company_id, id);
  end if;
end $$;
