-- HydroQualiSense R5 bounded database security inventory.
-- Read-only: every statement is SELECT/WITH and can be run against a replayed
-- database with psql. Review the final catalog, not only migration text.

-- SECURITY DEFINER functions, fixed search_path, and role EXECUTE grants.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  coalesce(array_to_string(p.proconfig, ','), '') as configuration,
  coalesce(r.rolname, 'PUBLIC') as grantee,
  x.privilege_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
left join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x on true
left join pg_roles r on r.oid = x.grantee
where n.nspname in ('public', 'private')
  and (p.prosecdef or n.nspname = 'public')
order by n.nspname, p.proname, grantee, x.privilege_type;

-- Every RLS-enabled public table and its active policies.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  p.policyname,
  p.cmd,
  p.roles,
  p.qual as using_expression,
  p.with_check as check_expression
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname, p.policyname;

-- Direct Data API table privileges; PUBLIC inheritance is visible through the
-- role grant view and is intentionally included.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'public')
order by table_name, grantee, privilege_type;

-- Actor-bearing columns retained for the bounded history/identity audit.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (
    column_name ilike '%user_id%'
    or column_name ilike '%created_by%'
    or column_name ilike '%updated_by%'
    or column_name ilike '%confirmed_by%'
    or column_name ilike '%actor%'
  )
order by table_name, column_name;

-- Company-bound foreign keys and all relationship FKs.
select
  con.conrelid::regclass as table_name,
  con.conname,
  con.confrelid::regclass as referenced_table,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_namespace n on n.oid = con.connamespace
where n.nspname = 'public' and con.contype = 'f'
order by con.conrelid::regclass::text, con.conname;

-- Lifecycle, immutability, actor, and append-only triggers.
select
  tg.tgrelid::regclass as table_name,
  tg.tgname as trigger_name,
  p.pronamespace::regnamespace::text || '.' || p.proname as trigger_function,
  pg_get_triggerdef(tg.oid) as definition
from pg_trigger tg
join pg_proc p on p.oid = tg.tgfoid
join pg_class c on c.oid = tg.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not tg.tgisinternal
  and n.nspname = 'public'
  and (
    tg.tgname ilike '%immut%'
    or tg.tgname ilike '%append%'
    or tg.tgname ilike '%actor%'
    or tg.tgname ilike '%lifecycle%'
    or tg.tgname ilike '%provenance%'
    or tg.tgname ilike '%boundary%'
    or tg.tgname ilike '%delete%'
  )
order by table_name, trigger_name;

-- Important uniqueness/idempotency constraints and indexes.
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and (
    indexdef ilike '%unique%'
    or indexname ilike '%idempot%'
    or indexname ilike '%dedup%'
    or indexname ilike '%supplier%'
    or indexname ilike '%send%'
    or indexname ilike '%receipt%'
    or indexname ilike '%vendor%'
  )
order by tablename, indexname;
