begin;

select plan(7);

select ok(
  not has_table_privilege('authenticated', 'public.engineering_project_materials', 'INSERT'),
  'authenticated cannot insert Materials register rows directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.engineering_project_materials', 'UPDATE'),
  'authenticated cannot update Materials register rows directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.engineering_project_equipment', 'INSERT'),
  'authenticated cannot insert Equipment register rows directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.engineering_project_equipment', 'UPDATE'),
  'authenticated cannot update Equipment register rows directly'
);

select ok(
  exists (
    select 1
    from private.company_tenant_policy_catalog c
    where c.table_name in ('engineering_project_materials', 'engineering_project_equipment')
    group by 1
    having bool_and(not c.allow_insert and not c.allow_update and not c.allow_delete)
       and count(*) = 2
  ),
  'tenant policy catalog marks Materials and Equipment registers RPC-only for writes'
);

select ok(
  has_function_privilege('authenticated', 'public.save_engineering_project_material(jsonb)', 'EXECUTE'),
  'authenticated retains guarded Materials save RPC access'
);

select ok(
  has_function_privilege('authenticated', 'public.save_engineering_project_equipment(jsonb)', 'EXECUTE'),
  'authenticated retains guarded Equipment save RPC access'
);

select * from finish();
rollback;
