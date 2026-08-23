-- Add only the persisted workspace tables used by workspaceSync.ts to the
-- existing Supabase Realtime publication. This migration intentionally does
-- not create policies, grants, tables, or a replacement publication.
do $$
declare
  table_name text;
begin
  -- Supabase projects have this publication already. If it is absent, or is
  -- configured for all tables, leave it untouched rather than changing its
  -- existing membership semantics.
  if exists (
    select 1
      from pg_publication
     where pubname = 'supabase_realtime'
       and not puballtables
  ) then
    foreach table_name in array array[
      'invoices',
      'invoice_extractions',
      'invoice_project_allocations',
      'projects',
      'expenses',
      'departments',
      'workers',
      'project_worker_assignments',
      'payroll_periods',
      'work_entries',
      'payroll_runs',
      'payroll_entries',
      'payroll_project_allocations',
      'payroll_adjustments',
      'labor_cost_centers',
      'payroll_import_batches',
      'payroll_import_rows',
      'payroll_import_templates',
      'gmail_connections',
      'gmail_sync_state',
    ] loop
      -- The guard makes this safe to replay and avoids failing if a partially
      -- provisioned environment has not applied one of the domain migrations.
      if to_regclass(format('public.%I', table_name)) is not null
         and not exists (
           select 1
             from pg_publication p
             join pg_publication_rel pr on pr.prpubid = p.oid
             join pg_class c on c.oid = pr.prrelid
             join pg_namespace n on n.oid = c.relnamespace
            where p.pubname = 'supabase_realtime'
              and n.nspname = 'public'
              and c.relname = table_name
         ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end $$;
