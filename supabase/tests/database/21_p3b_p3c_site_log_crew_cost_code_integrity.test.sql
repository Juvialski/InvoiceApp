begin;

select plan(2);

select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'engineering_daily_site_log_crew'
      and column_name = 'project_id'
      and is_nullable = 'NO'
  ),
  'Site Log crew rows persist a non-null parent project snapshot'
);

select ok(
  exists (
    select 1
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace rel_ns on rel_ns.oid = rel.relnamespace
    join pg_class ref_rel on ref_rel.oid = c.confrelid
    join pg_namespace ref_ns on ref_ns.oid = ref_rel.relnamespace
    where c.contype = 'f'
      and c.conname = 'engineering_daily_site_log_crew_cost_code_fk'
      and rel_ns.nspname = 'public'
      and rel.relname = 'engineering_daily_site_log_crew'
      and ref_ns.nspname = 'public'
      and ref_rel.relname = 'project_cost_codes'
      and (
        select array_agg(a.attname order by cols.ord)
        from unnest(c.conkey) with ordinality as cols(attnum, ord)
        join pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = cols.attnum
      ) = array['company_id', 'project_id', 'project_cost_code_id']::name[]
      and (
        select array_agg(a.attname order by cols.ord)
        from unnest(c.confkey) with ordinality as cols(attnum, ord)
        join pg_attribute a
          on a.attrelid = c.confrelid
         and a.attnum = cols.attnum
      ) = array['company_id', 'project_id', 'id']::name[]
      and c.confdeltype = 'r'
  ),
  'Site Log crew cost-code linkage is durable and delete-restricted'
);

select * from finish();
rollback;
