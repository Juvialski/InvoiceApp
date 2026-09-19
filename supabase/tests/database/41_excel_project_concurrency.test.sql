begin;
select plan(12);

select ok(
  has_function_privilege('authenticated', 'public.save_rfq(jsonb,jsonb,uuid[],timestamptz)', 'EXECUTE'),
  'authenticated can execute version-aware RFQ save'
);

select ok(
  has_function_privilege('authenticated', 'public.save_purchase_order(jsonb,jsonb,timestamptz)', 'EXECUTE'),
  'authenticated can execute version-aware purchase-order save'
);

select ok(
  has_function_privilege('authenticated', 'public.save_project(jsonb,timestamptz)', 'EXECUTE'),
  'authenticated can execute version-aware project save'
);

select ok(
  has_function_privilege('authenticated', 'public.apply_project_cost_control_group(uuid,timestamptz,jsonb,jsonb)', 'EXECUTE'),
  'authenticated can execute grouped project cost-control Apply'
);

select ok(
  not has_function_privilege('anon', 'public.save_project(jsonb,timestamptz)', 'EXECUTE'),
  'anonymous callers cannot execute project save'
);

select ok(
  not has_function_privilege('public', 'public.apply_project_cost_control_group(uuid,timestamptz,jsonb,jsonb)', 'EXECUTE'),
  'public callers cannot execute grouped project Apply'
);

select ok(
  exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'save_rfq'
       and pg_get_function_identity_arguments(p.oid) = 'p_rfq jsonb, p_lines jsonb, p_invited_vendor_ids uuid[], p_expected_updated_at timestamp with time zone'
  ),
  'RFQ save carries an expected timestamp argument'
);

select ok(
  exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'save_purchase_order'
       and pg_get_function_identity_arguments(p.oid) = 'p_po jsonb, p_lines jsonb, p_expected_updated_at timestamp with time zone'
  ),
  'purchase-order save carries an expected timestamp argument'
);

select ok(
  exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'save_project'
       and pg_get_function_identity_arguments(p.oid) = 'p_project jsonb, p_expected_updated_at timestamp with time zone'
  ),
  'project save carries an expected timestamp argument'
);

select ok(
  exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'apply_project_cost_control_group'
       and pg_get_function_identity_arguments(p.oid) = 'p_project_id uuid, p_expected_project_updated_at timestamp with time zone, p_project jsonb, p_cost_codes jsonb'
  ),
  'grouped project Apply has project version and proposed cost-code payloads'
);

select ok(
  not has_table_privilege('authenticated', 'public.project_cost_codes', 'DELETE'),
  'cost-code deletion remains unavailable'
);

select ok(
  exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'apply_project_cost_control_group'
       and pg_get_functiondef(p.oid) ilike '%for update%'
       and pg_get_functiondef(p.oid) ilike '%40001%'
       and pg_get_functiondef(p.oid) ilike '%project_budget%'
  ),
  'grouped project Apply locks and exposes stale/budget safeguards'
);

select * from finish();
rollback;

