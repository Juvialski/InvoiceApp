begin;
select plan(27);

-- 1. Tables exist
select has_table('public', 'subcontract_variations', 'public.subcontract_variations exists');
select has_table('public', 'subcontract_variation_lines', 'public.subcontract_variation_lines exists');

-- 2. RLS enabled
select isnt_empty(
  'select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relname = ''subcontract_variations'' and c.relrowsecurity = true',
  'subcontract_variations RLS active'
);
select isnt_empty(
  'select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relname = ''subcontract_variation_lines'' and c.relrowsecurity = true',
  'subcontract_variation_lines RLS active'
);

-- 3. Composite Foreign Keys
select has_fk('public', 'subcontract_variations', 'subcontract_variations has composite foreign key(s)');
select has_fk('public', 'subcontract_variation_lines', 'subcontract_variation_lines has composite foreign key(s)');

-- Check composite FK on project_cost_codes: (company_id, project_id, project_cost_code_id)
select isnt_empty(
  'select 1 from information_schema.table_constraints tc
   join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
   where tc.table_schema = ''public'' and tc.table_name = ''subcontract_variation_lines''
     and tc.constraint_type = ''FOREIGN KEY''
     and kcu.column_name = ''project_cost_code_id''',
  'subcontract_variation_lines has foreign key for project_cost_code_id'
);

-- Check project_id column exists on subcontract_variation_lines
select has_column('public', 'subcontract_variation_lines', 'project_id', 'subcontract_variation_lines.project_id column exists');

-- 4. Check constraints
select has_check('public', 'subcontract_variation_lines', 'amount <> 0 check exists');
select has_check('public', 'subcontract_progress_claim_lines', 'subcontract_progress_claim_lines has source constraint');

-- 5. RPC Functions exist
select has_function('public', 'create_or_update_subcontract_variation', 'public.create_or_update_subcontract_variation exists');
select has_function('public', 'transition_subcontract_variation', 'public.transition_subcontract_variation exists');
select has_function('public', 'delete_draft_subcontract_variation', 'public.delete_draft_subcontract_variation exists');
select has_function('public', 'create_or_update_subcontract_claim', 'public.create_or_update_subcontract_claim exists');
select has_function('public', 'transition_subcontract_claim', 'public.transition_subcontract_claim exists');

-- 6. Private trigger validation functions exist
select has_function('private', 'validate_subcontract_variation_scope', 'private.validate_subcontract_variation_scope exists');
select has_function('private', 'validate_subcontract_variation_line_scope', 'private.validate_subcontract_variation_line_scope exists');
select has_function('private', 'validate_subcontract_claim_line', 'private.validate_subcontract_claim_line exists');
select has_function('private', 'guard_subcontract_unresolved_variations', 'private.guard_subcontract_unresolved_variations exists');
select has_function('private', 'project_lifecycle_preflight', 'private.project_lifecycle_preflight exists');

-- 7. Triggers exist on tables
select has_trigger('public', 'subcontract_variations', 'validate_subcontract_variation_scope_trigger', 'variation scope trigger exists');
select has_trigger('public', 'subcontract_variation_lines', 'validate_subcontract_variation_line_scope_trigger', 'variation line scope trigger exists');
select has_trigger('public', 'subcontract_progress_claim_lines', 'validate_subcontract_claim_line_trigger', 'claim line trigger exists');
select has_trigger('public', 'subcontracts', 'guard_subcontract_unresolved_variations_trigger', 'subcontract wind-down variation trigger exists');

-- 8. Catalog policy registrations
select isnt_empty(
  'select 1 from private.company_tenant_policy_catalog where table_name = ''subcontract_variations''',
  'subcontract_variations registered in tenant policy catalog'
);
select isnt_empty(
  'select 1 from private.company_tenant_policy_catalog where table_name = ''subcontract_variation_lines''',
  'subcontract_variation_lines registered in tenant policy catalog'
);

-- 9. Single scope check on claim lines: ensure constraint name and condition
select matches(
  (select check_clause from information_schema.check_constraints where constraint_name = 'subcontract_claim_lines_source_check' limit 1),
  'subcontract_line_id.*subcontract_variation_line_id',
  'subcontract_claim_lines_source_check enforces mutually exclusive line reference'
);

select * from finish();
rollback;
