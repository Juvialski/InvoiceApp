-- Add P3B/P3C sources to the existing workspace Realtime publication. This is
-- additive and idempotent; all-table publications are left unchanged.
do $$
declare
  table_name text;
begin
  if exists (
    select 1 from pg_publication
    where pubname = 'supabase_realtime' and not puballtables
  ) then
    foreach table_name in array array[
      'engineering_project_materials',
      'engineering_project_equipment',
      'engineering_daily_site_logs',
      'engineering_daily_site_log_weather',
      'engineering_daily_site_log_crew',
      'engineering_daily_site_log_equipment',
      'engineering_daily_site_log_work',
      'engineering_daily_site_log_material_deliveries',
      'engineering_daily_site_log_issues',
      'engineering_daily_site_log_safety',
      'engineering_daily_site_log_events',
      'engineering_daily_site_log_addenda'
    ] loop
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
