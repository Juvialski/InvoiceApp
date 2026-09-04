begin;

select plan(1);

select ok(
  exists (
    select 1
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace rel_ns on rel_ns.oid = rel.relnamespace
    join pg_class ref_rel on ref_rel.oid = c.confrelid
    join pg_namespace ref_ns on ref_ns.oid = ref_rel.relnamespace
    where c.contype = 'f'
      and c.conname = 'engineering_daily_site_log_material_deliveries_receipt_line_fk'
      and rel_ns.nspname = 'public'
      and rel.relname = 'engineering_daily_site_log_material_deliveries'
      and ref_ns.nspname = 'public'
      and ref_rel.relname = 'purchase_order_receipt_lines'
      and (
        select array_agg(a.attname order by cols.ord)
        from unnest(c.conkey) with ordinality as cols(attnum, ord)
        join pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = cols.attnum
      ) = array['company_id', 'purchase_order_receipt_id', 'purchase_order_line_id']::name[]
      and (
        select array_agg(a.attname order by cols.ord)
        from unnest(c.confkey) with ordinality as cols(attnum, ord)
        join pg_attribute a
          on a.attrelid = c.confrelid
         and a.attnum = cols.attnum
      ) = array['company_id', 'purchase_order_receipt_id', 'purchase_order_line_id']::name[]
      and c.confdeltype = 'r'
  ),
  'P3B/P3C material delivery receipt linkage enforces exact formal receipt line membership'
);

select * from finish();
rollback;
