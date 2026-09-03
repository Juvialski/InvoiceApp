-- ============================================================================
-- Migration: 20260903145000_projects_company_composite_reference.sql
-- Description: Add the tenant-safe composite key required by P2B-2 claim FKs
-- ============================================================================

-- Project IDs are already globally unique through the primary key. The explicit
-- (company_id, id) key gives tenant-scoped child tables a database-enforced FK
-- target without weakening the existing project identity contract.
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
end $$;
