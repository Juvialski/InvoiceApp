begin;
select no_plan();

select has_column('public', 'company_role_catalog', 'company_id', 'custom roles are company scoped');
select has_column('public', 'company_role_catalog', 'archived_at', 'custom roles support safe retirement');
select has_function('public', 'create_company_role', 'Company Admin role creation RPC exists');
select has_function('public', 'update_company_role', 'Company Admin role update RPC exists');
select has_function('public', 'archive_company_role', 'Company Admin role archive RPC exists');
select has_function('public', 'platform_list_company_roles', 'role directory RPC exists');
select has_function('private', 'effective_company_permissions', 'shared effective permission resolver exists');
select is_empty(
  $$select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('company_role_catalog', 'company_role_permissions')
      and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')$$,
  'authenticated clients cannot write role tables directly'
);

create temp table custom_role_ids (
  company_id uuid not null,
  role_key text primary key,
  member_id uuid,
  other_role_key text
);
create temp table custom_role_users (
  admin_user uuid not null,
  finance_user uuid not null,
  payroll_user uuid not null,
  viewer_user uuid not null,
  custom_user uuid not null,
  company_id uuid not null,
  other_company_id uuid not null
);
grant select, insert on custom_role_ids to authenticated, service_role;

insert into custom_role_users values (
  '20000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000003',
  '20000000-0000-4000-8000-000000000004',
  '20000000-0000-4000-8000-000000000005',
  'cccccccc-0000-4000-8000-000000000001',
  'dddddddd-0000-4000-8000-000000000002'
);
grant select on custom_role_users to authenticated, service_role;

insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select id, email, 'x', now(), now(), now()
from (values
  ((select admin_user from custom_role_users), 'custom-admin@test.local'),
  ((select finance_user from custom_role_users), 'custom-finance@test.local'),
  ((select payroll_user from custom_role_users), 'custom-payroll@test.local'),
  ((select viewer_user from custom_role_users), 'custom-viewer@test.local'),
  ((select custom_user from custom_role_users), 'custom-role-user@test.local')
) users(id, email)
on conflict (id) do nothing;

insert into public.companies (id, name, company_code, status, default_currency, timezone)
values
  ((select company_id from custom_role_users), 'Custom Role Company', 'custom-role-company', 'ACTIVE', 'PHP', 'Asia/Manila'),
  ((select other_company_id from custom_role_users), 'Other Role Company', 'other-role-company', 'ACTIVE', 'USD', 'UTC');

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_id from custom_role_users));

insert into public.company_members (company_id, user_id, role_key, status)
values
  ((select company_id from custom_role_users), (select admin_user from custom_role_users), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_id from custom_role_users), (select finance_user from custom_role_users), 'FINANCE', 'ACTIVE'),
  ((select company_id from custom_role_users), (select payroll_user from custom_role_users), 'PAYROLL', 'ACTIVE'),
  ((select company_id from custom_role_users), (select viewer_user from custom_role_users), 'VIEWER', 'ACTIVE'),
  ((select company_id from custom_role_users), (select custom_user from custom_role_users), 'VIEWER', 'ACTIVE');

set local role service_role;
insert into public.company_role_catalog (role_key, company_id, display_name, description, assignable, is_platform_role, is_builtin)
values ('CUSTOM_OTHER_SECURITY', (select other_company_id from custom_role_users), 'Other Company Role', 'Must not cross company boundaries.', true, false, false);
insert into public.company_role_permissions (role_key, permission_key) values ('CUSTOM_OTHER_SECURITY', 'projects.read');
reset role;

set local role service_role;
insert into public.projects (
  id, user_id, company_id, project_code, project_name, status, project_budget, currency
) values (
  '30000000-0000-4000-8000-000000000001',
  (select admin_user from custom_role_users),
  (select company_id from custom_role_users),
  'PAY-REF-001',
  'Synthetic Payroll Reference Project',
  'ACTIVE',
  0,
  'PHP'
);
reset role;

-- The built-in Payroll profile keeps the separate payroll Reports surface but
-- no longer receives unrelated workspace permissions. Project labels come from
-- a narrow permission/RPC boundary rather than the full Projects table.
select is(
  (select count(*) from public.company_role_permissions
   where role_key = 'PAYROLL'
     and permission_key in (
       'dashboard.read', 'projects.read', 'engineering.documents.read',
       'engineering.rfis.read', 'engineering.submittals.read',
       'engineering.sitelogs.read'
     )),
  0::bigint,
  'Payroll no longer receives unrelated workspace permissions'
);
select is(
  (select count(*) from public.company_role_permissions
   where role_key in ('COMPANY_ADMIN', 'PAYROLL')
     and permission_key = 'payroll.project_reference.read'),
  2::bigint,
  'Company Admin and Payroll receive the narrow project-reference permission'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select payroll_user::text from custom_role_users), true);
select results_eq(
  $$select project_code || '|' || project_name || '|' || status
    from public.list_payroll_project_references((select company_id from custom_role_users))$$,
  $$values ('PAY-REF-001|Synthetic Payroll Reference Project|ACTIVE'::text)$$,
  'Payroll can read only the project reference projection'
);
select is_empty(
  $$select 1 from public.projects$$,
  'Payroll cannot read full project rows without projects.read'
);
select throws_ok(
  $$select * from public.list_payroll_project_references((select other_company_id from custom_role_users))$$,
  '42501', null, 'Payroll reference RPC rejects another deployment company'
);
select set_config('request.jwt.claim.sub', (select finance_user::text from custom_role_users), true);
select throws_ok(
  $$select * from public.list_payroll_project_references((select company_id from custom_role_users))$$,
  '42501', null, 'Finance cannot call the Payroll reference RPC without its permission'
);
select set_config('request.jwt.claim.sub', (select viewer_user::text from custom_role_users), true);
select throws_ok(
  $$select * from public.list_payroll_project_references((select company_id from custom_role_users))$$,
  '42501', null, 'Viewer cannot call the Payroll reference RPC without its permission'
);
reset role;

-- CREATE: only a Company Admin can create a role, and the role is stored under
-- the deployment company with effective permission rows.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from custom_role_users), true);
insert into custom_role_ids(company_id, role_key)
select (select company_id from custom_role_users), role_key
from public.create_company_role(
  (select company_id from custom_role_users),
  'Project Manager',
  'Project and expense coordination without payroll or access administration.',
  '["projects.read", "expenses.read"]'::jsonb,
  null
);
select is((select count(*) from custom_role_ids), 1::bigint, 'Company Admin can create a custom role');
select is((select company_id from public.company_role_catalog where role_key = (select role_key from custom_role_ids)), (select company_id from custom_role_users), 'custom role is company scoped');
select results_eq(
  $$select permission_key from public.company_role_permissions where role_key = (select role_key from custom_role_ids) order by permission_key$$,
  $$values ('expenses.read'::text), ('projects.read'::text)$$,
  'custom role receives exactly the selected read permissions'
);
select lives_ok(
  $$select public.create_company_role((select company_id from custom_role_users), 'Payroll Context', null, '["payroll.project_reference.read"]'::jsonb, null)$$,
  'custom roles may select the narrow payroll project-reference permission'
);

select set_config('request.jwt.claim.sub', (select finance_user::text from custom_role_users), true);
select throws_ok(
  $$select public.create_company_role((select company_id from custom_role_users), 'Finance Cannot Create', null, '["projects.read"]'::jsonb, null)$$,
  '42501', null, 'Finance cannot create a custom role'
);
select set_config('request.jwt.claim.sub', (select payroll_user::text from custom_role_users), true);
select throws_ok(
  $$select public.create_company_role((select company_id from custom_role_users), 'Payroll Cannot Create', null, '["projects.read"]'::jsonb, null)$$,
  '42501', null, 'Payroll cannot create a custom role'
);
select set_config('request.jwt.claim.sub', (select viewer_user::text from custom_role_users), true);
select throws_ok(
  $$select public.create_company_role((select company_id from custom_role_users), 'Viewer Cannot Create', null, '["projects.read"]'::jsonb, null)$$,
  '42501', null, 'Viewer cannot create a custom role'
);

-- PROTECTED PERMISSIONS: raw RPC payloads cannot manufacture access
-- administration or platform authority.
select set_config('request.jwt.claim.sub', (select admin_user::text from custom_role_users), true);
select throws_ok(
  $$select public.create_company_role((select company_id from custom_role_users), 'Escalation Attempt', null, '["company.members.manage"]'::jsonb, null)$$,
  '42501', null, 'custom roles cannot grant company access administration'
);
select throws_ok(
  $$select public.create_company_role((select company_id from custom_role_users), 'Platform Attempt', null, '["platform.manage"]'::jsonb, null)$$,
  '42501', null, 'custom roles cannot grant platform authority'
);
select throws_ok(
  $$select public.platform_update_company_member_permissions((select company_id from custom_role_users), (select id from public.company_members where user_id = (select viewer_user from custom_role_users)), '[{"permission_key":"company.members.manage","effect":"GRANT"}]'::jsonb)$$,
  '42501', null, 'member overrides cannot manufacture access administration'
);
reset role;

-- EDIT EFFECT: changing a custom role changes the effective permission set of
-- a member assigned to that role, without hard-coding its display role name.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from custom_role_users), true);
select lives_ok(
  $$select public.change_company_member_role((select id from public.company_members where user_id = (select custom_user from custom_role_users)), (select role_key from custom_role_ids))$$,
  'Company Admin can assign the custom role to a member'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select custom_user::text from custom_role_users), true);
select is(public.has_company_permission((select company_id from custom_role_users), 'projects.read'), true, 'assigned custom role grants selected project read permission');
select throws_ok(
  $$select public.update_company_role((select company_id from custom_role_users), (select role_key from custom_role_ids), 'Project Manager', 'Unauthorized update attempt', '["projects.manage"]'::jsonb)$$,
  '42501', null, 'assigned custom-role member cannot edit role definitions'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from custom_role_users), true);
select lives_ok(
  $$select public.update_company_role((select company_id from custom_role_users), (select role_key from custom_role_ids), 'Project Manager', 'Updated access', '["projects.manage"]'::jsonb)$$,
  'Company Admin can edit a custom role'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select custom_user::text from custom_role_users), true);
select is(public.has_company_permission((select company_id from custom_role_users), 'projects.read'), false, 'removed permission no longer remains effective');
select is(public.has_company_permission((select company_id from custom_role_users), 'projects.manage'), true, 'edited permission becomes effective for assigned member');
reset role;

-- OVERRIDES: the existing GRANT/DENY composition remains deterministic and
-- protected permissions remain unavailable.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from custom_role_users), true);
select lives_ok(
  $$select public.platform_update_company_member_permissions((select company_id from custom_role_users), (select id from public.company_members where user_id = (select custom_user from custom_role_users)), '[{"permission_key":"projects.read","effect":"GRANT"},{"permission_key":"projects.manage","effect":"DENY"}]'::jsonb)$$,
  'Company Admin can save bounded custom-role member overrides'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select custom_user::text from custom_role_users), true);
select is(public.has_company_permission((select company_id from custom_role_users), 'projects.read'), true, 'member GRANT composes with custom role');
select is(public.has_company_permission((select company_id from custom_role_users), 'projects.manage'), false, 'member DENY takes precedence over custom role grant');
reset role;

-- ISOLATION: another company's role is invisible and cannot be assigned.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from custom_role_users), true);
select is_empty(
  $$select 1 from public.platform_list_company_roles((select company_id from custom_role_users)) where role_key = 'CUSTOM_OTHER_SECURITY'$$,
  'role directory does not expose another company role'
);
select is_empty(
  $$select 1 from public.company_role_catalog where role_key = 'CUSTOM_OTHER_SECURITY'$$,
  'RLS does not expose another company role through the table'
);
select throws_ok(
  $$select public.change_company_member_role((select id from public.company_members where user_id = (select viewer_user from custom_role_users)), 'CUSTOM_OTHER_SECURITY')$$,
  '42501', null, 'assignment to another company role is rejected'
);
select throws_ok(
  $$select public.create_company_role((select other_company_id from custom_role_users), 'Wrong Company Role', null, '[]'::jsonb, null)$$,
  '42501', null, 'company id manipulation is rejected'
);
reset role;

-- LIFECYCLE: in-use roles cannot be archived; built-ins cannot be archived;
-- after reassignment, the custom role can be retired and stops assigning.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from custom_role_users), true);
select throws_ok(
  $$select public.archive_company_role((select company_id from custom_role_users), (select role_key from custom_role_ids))$$,
  '23514', null, 'an in-use custom role cannot be archived'
);
select throws_ok(
  $$select public.archive_company_role((select company_id from custom_role_users), 'VIEWER')$$,
  '22023', null, 'built-in starter roles cannot be archived'
);
select lives_ok(
  $$select public.platform_update_company_member((select company_id from custom_role_users), (select custom_user from custom_role_users), (select id from public.company_members where user_id = (select custom_user from custom_role_users)), 'VIEWER', null)$$,
  'member can be reassigned before role retirement'
);
select lives_ok(
  $$select public.archive_company_role((select company_id from custom_role_users), (select role_key from custom_role_ids))$$,
  'unused custom role can be archived'
);
select is((select assignable from public.company_role_catalog where role_key = (select role_key from custom_role_ids)), false, 'archived custom role is no longer assignable');
select throws_ok(
  $$select public.change_company_member_role((select id from public.company_members where user_id = (select custom_user from custom_role_users)), (select role_key from custom_role_ids))$$,
  '22023', null, 'archived custom role cannot be assigned again'
);
reset role;

-- BACKWARDS COMPATIBILITY and audit evidence.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from custom_role_users), true);
select is(public.has_company_permission((select company_id from custom_role_users), 'company.members.manage'), true, 'Company Admin compatibility remains intact');
select is((select count(*) from public.platform_list_company_roles((select company_id from custom_role_users)) where is_builtin), 4::bigint, 'all four starter roles remain available');
select isnt_empty($$select 1 from public.company_audit_events where event_type = 'CUSTOM_ROLE_CREATED' and company_id = (select company_id from custom_role_users)$$, 'custom role creation is audited');
select isnt_empty($$select 1 from public.company_audit_events where event_type = 'CUSTOM_ROLE_UPDATED' and company_id = (select company_id from custom_role_users)$$, 'custom role update is audited');
select isnt_empty($$select 1 from public.company_audit_events where event_type = 'CUSTOM_ROLE_ARCHIVED' and company_id = (select company_id from custom_role_users)$$, 'custom role archive is audited');
select isnt_empty($$select 1 from public.company_audit_events where event_type = 'MEMBER_ROLE_CHANGED' and company_id = (select company_id from custom_role_users)$$, 'member role reassignment is audited');
reset role;

select * from finish();
rollback;
