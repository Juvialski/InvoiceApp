begin;
select no_plan();

-- Schema, effective-permission, and privilege boundaries.
select has_table('public', 'company_member_permission_overrides', 'member permission overrides table exists');
select has_table('public', 'company_invitation_permission_overrides', 'pending invitation overrides table exists');
select has_column('public', 'company_permission_catalog', 'member_assignable', 'permission catalog records override eligibility');
select has_column('public', 'company_invitations', 'delivery_status', 'invitation delivery status exists');
select has_column('public', 'company_invitations', 'sent_at', 'invitation sent timestamp exists');
select has_function('public', 'platform_create_company_invitation', 'backend invitation creation RPC exists');
select has_function('public', 'platform_mark_company_invitation_delivery', 'backend invitation delivery RPC exists');
select has_function('public', 'platform_update_company_member_permissions', 'member permission update RPC exists');
select is_empty(
  $$select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name in ('platform_create_company_invitation', 'platform_mark_company_invitation_delivery', 'platform_reset_company_invitation_delivery')
      and lower(grantee) in ('public', 'anon', 'authenticated')
      and privilege_type = 'EXECUTE'$$,
  'browser roles cannot create or mark invitation delivery'
);
select isnt_empty(
  $$select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'platform_create_company_invitation'
      and lower(grantee) = 'service_role'
      and privilege_type = 'EXECUTE'$$,
  'service role can invoke backend invitation creation'
);
select is_empty(
  $$select 1 from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('company_member_permission_overrides', 'company_invitation_permission_overrides')
      and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')$$,
  'authenticated clients cannot write override tables directly'
);
select isnt_empty(
  $$select 1 from pg_class where oid = 'public.company_member_permission_overrides'::regclass and relrowsecurity$$,
  'member overrides use RLS defense in depth'
);

create temp table wave1_ids as
select
  '10000000-0000-4000-8000-000000000001'::uuid as admin_user,
  '10000000-0000-4000-8000-000000000002'::uuid as finance_user,
  '10000000-0000-4000-8000-000000000003'::uuid as viewer_user,
  '10000000-0000-4000-8000-000000000004'::uuid as suspended_user,
  '10000000-0000-4000-8000-000000000005'::uuid as invited_user,
  '10000000-0000-4000-8000-000000000006'::uuid as wrong_email_user,
  'aaaaaaaa-0000-4000-8000-000000000001'::uuid as company_id,
  'bbbbbbbb-0000-4000-8000-000000000002'::uuid as other_company_id;

insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select id, email, 'x', now(), now(), now()
from (values
  ((select admin_user from wave1_ids), 'wave1-admin@test.local'),
  ((select finance_user from wave1_ids), 'wave1-finance@test.local'),
  ((select viewer_user from wave1_ids), 'wave1-viewer@test.local'),
  ((select suspended_user from wave1_ids), 'wave1-suspended@test.local'),
  ((select invited_user from wave1_ids), 'wave1-invited@test.local'),
  ((select wrong_email_user from wave1_ids), 'wave1-wrong-email@test.local')
) users(id, email)
on conflict (id) do nothing;

insert into public.companies (id, name, company_code, status, default_currency, timezone)
values
  ((select company_id from wave1_ids), 'Wave 1 Company', 'wave1-company', 'ACTIVE', 'PHP', 'Asia/Manila'),
  ((select other_company_id from wave1_ids), 'Other Company', 'wave1-other', 'ACTIVE', 'USD', 'UTC');

insert into public.company_members (company_id, user_id, role_key, status)
values
  ((select company_id from wave1_ids), (select admin_user from wave1_ids), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_id from wave1_ids), (select finance_user from wave1_ids), 'FINANCE', 'ACTIVE'),
  ((select company_id from wave1_ids), (select viewer_user from wave1_ids), 'VIEWER', 'ACTIVE'),
  ((select company_id from wave1_ids), (select suspended_user from wave1_ids), 'VIEWER', 'SUSPENDED');

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_id from wave1_ids));

-- Company Admin can update the configured profile, but cannot target another
-- deployment company. Finance and suspended members cannot update it.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from wave1_ids), true);
select is((select name from public.platform_update_company(
  (select company_id from wave1_ids), 'Wave 1 Renamed', null, null, 'EUR', 'Europe/Berlin'
)), 'Wave 1 Renamed'::text, 'Company Admin can update deployment profile');
select throws_ok(
  $$select public.platform_update_company((select other_company_id from wave1_ids), 'Wrong Company', null, null, null, null)$$,
  '42501', null, 'wrong-company profile update is rejected'
);
select set_config('request.jwt.claim.sub', (select finance_user::text from wave1_ids), true);
select throws_ok(
  $$select public.platform_update_company((select company_id from wave1_ids), 'Finance Cannot Rename', null, null, null, null)$$,
  '42501', null, 'Finance cannot update company profile'
);
select set_config('request.jwt.claim.sub', (select suspended_user::text from wave1_ids), true);
select throws_ok(
  $$select public.platform_update_company((select company_id from wave1_ids), 'Suspended Cannot Rename', null, null, null, null)$$,
  '42501', null, 'suspended member cannot update company profile'
);
reset role;

-- Invitation creation is service-only after the server has independently
-- authenticated the actor. It starts CREATED and cannot be claimed yet.
set local role service_role;
select throws_ok(
  $$select public.platform_create_company_invitation((select finance_user from wave1_ids), (select company_id from wave1_ids), 'unauthorized@test.local', 'VIEWER', now() + interval '2 days', '[]'::jsonb)$$,
  '42501', null, 'actor without access-management permission cannot create an invitation'
);
create temp table wave1_invites (kind text primary key, invitation_id uuid);
insert into wave1_invites
select 'created', ci.id
from public.platform_create_company_invitation(
  (select admin_user from wave1_ids), (select company_id from wave1_ids), 'wave1-invited@test.local', 'VIEWER', now() + interval '2 days', '[]'::jsonb
) ci;
select is((select delivery_status from public.company_invitations where id = (select invitation_id from wave1_invites where kind = 'created')), 'CREATED'::text, 'new invitation starts in CREATED delivery state');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select invited_user::text from wave1_ids), true);
select is((select count(*) from public.claim_company_invitations()), 0::bigint, 'undelivered invitation cannot grant membership');
reset role;

-- Only the trusted service role can record SENT; the matching verified email
-- then claims once and transfers the intended role.
set local role service_role;
select lives_ok(
  $$select * from public.platform_mark_company_invitation_delivery((select admin_user from wave1_ids), (select invitation_id from wave1_invites where kind = 'created'), 'SENT', null)$$,
  'trusted service role can record SENT delivery'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select invited_user::text from wave1_ids), true);
select is((select count(*) from public.claim_company_invitations()), 1::bigint, 'matching verified email claims a sent invitation');
select is((select count(*) from public.company_members where company_id = (select company_id from wave1_ids) and user_id = (select invited_user from wave1_ids) and role_key = 'VIEWER' and status = 'ACTIVE'), 1::bigint, 'claimed invitation creates the intended membership');
select is((select status from public.company_invitations where id = (select invitation_id from wave1_invites where kind = 'created')), 'ACCEPTED'::text, 'claimed invitation is marked accepted');
select is((select count(*) from public.claim_company_invitations()), 0::bigint, 'consumed invitation is replay-safe');
reset role;

-- Active memberships cannot be invited again, and revocation closes a pending
-- invitation before any claim can occur.
set local role service_role;
select throws_ok(
  $$select public.platform_create_company_invitation((select admin_user from wave1_ids), (select company_id from wave1_ids), 'wave1-invited@test.local', 'VIEWER', now() + interval '2 days', '[]'::jsonb)$$,
  '23505', null, 'already-active member is rejected by invitation creation'
);
insert into wave1_invites
select 'revoked', ci.id
from public.platform_create_company_invitation(
  (select admin_user from wave1_ids), (select company_id from wave1_ids), 'revoked@test.local', 'VIEWER', now() + interval '2 days', '[]'::jsonb
) ci;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from wave1_ids), true);
select lives_ok(
  $$select * from public.revoke_company_invitation((select invitation_id from wave1_invites where kind = 'revoked'))$$,
  'authorized admin can revoke a pending invitation'
);
select is((select status from public.company_invitations where id = (select invitation_id from wave1_invites where kind = 'revoked')), 'REVOKED'::text, 'revoked invitation is stored as REVOKED');
reset role;

-- An invitation sent to a different address never claims for the wrong email.
set local role service_role;
insert into wave1_invites
select 'wrong-email', ci.id
from public.platform_create_company_invitation(
  (select admin_user from wave1_ids), (select company_id from wave1_ids), 'intended@test.local', 'VIEWER', now() + interval '2 days', '[]'::jsonb
) ci;
select lives_ok(
  $$select * from public.platform_mark_company_invitation_delivery((select admin_user from wave1_ids), (select invitation_id from wave1_invites where kind = 'wrong-email'), 'SENT', null)$$,
  'trusted service role can record the second SENT delivery'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select wrong_email_user::text from wave1_ids), true);
select is((select count(*) from public.claim_company_invitations()), 0::bigint, 'wrong verified email cannot claim invitation');
reset role;

-- Duplicate pending, reserved permission, unknown permission, and suspended
-- membership paths fail closed.
set local role service_role;
select throws_ok(
  $$select public.platform_create_company_invitation((select admin_user from wave1_ids), (select company_id from wave1_ids), 'intended@test.local', 'VIEWER', now() + interval '2 days', '[]'::jsonb)$$,
  '23505', null, 'duplicate pending invitation is rejected'
);
select throws_ok(
  $$select public.platform_create_company_invitation((select admin_user from wave1_ids), (select company_id from wave1_ids), 'protected@test.local', 'VIEWER', now() + interval '2 days', '[{"permission_key":"company.members.manage","effect":"GRANT"}]'::jsonb)$$,
  '42501', null, 'protected administration permission cannot be invited as an override'
);
select throws_ok(
  $$select public.platform_create_company_invitation((select admin_user from wave1_ids), (select company_id from wave1_ids), 'unknown@test.local', 'VIEWER', now() + interval '2 days', '[{"permission_key":"unknown.permission","effect":"GRANT"}]'::jsonb)$$,
  '42501', null, 'unknown permission cannot be invited as an override'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from wave1_ids), true);
select throws_ok(
  $$select public.platform_update_company_member_permissions((select other_company_id from wave1_ids), (select id from public.company_members where user_id = (select viewer_user from wave1_ids)), '[]'::jsonb)$$,
  '42501', null, 'cross-company override update is rejected'
);
select throws_ok(
  $$select public.platform_update_company_member_permissions((select company_id from wave1_ids), (select id from public.company_members where user_id = (select admin_user from wave1_ids)), '[]'::jsonb)$$,
  '42501', null, 'administrator cannot edit own overrides from this screen'
);
select lives_ok(
  $$select public.platform_update_company_member_permissions((select company_id from wave1_ids), (select id from public.company_members where user_id = (select viewer_user from wave1_ids)), '[{"permission_key":"payroll.detail.read","effect":"GRANT"}]'::jsonb)$$,
  'admin can save a custom GRANT'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select viewer_user::text from wave1_ids), true);
select is(public.has_company_permission((select company_id from wave1_ids), 'payroll.detail.read'), true, 'custom GRANT adds an allowed permission');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from wave1_ids), true);
select lives_ok(
  $$select public.platform_update_company_member_permissions((select company_id from wave1_ids), (select id from public.company_members where user_id = (select viewer_user from wave1_ids)), '[{"permission_key":"invoices.read","effect":"DENY"}]'::jsonb)$$,
  'admin can save a custom DENY'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select viewer_user::text from wave1_ids), true);
select is(public.has_company_permission((select company_id from wave1_ids), 'invoices.read'), false, 'custom DENY removes a role permission');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from wave1_ids), true);
select lives_ok(
  $$select public.platform_update_company_member_permissions((select company_id from wave1_ids), (select id from public.company_members where user_id = (select viewer_user from wave1_ids)), '[]'::jsonb)$$,
  'admin can reset member overrides to the role preset'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select viewer_user::text from wave1_ids), true);
select is(public.has_company_permission((select company_id from wave1_ids), 'invoices.read'), true, 'empty override set resets to role preset');
select is(public.has_company_permission((select company_id from wave1_ids), 'payroll.detail.read'), false, 'reset removes custom grant');
reset role;

-- An override cannot bypass suspension, and a user without access-management
-- permission cannot edit another member.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from wave1_ids), true);
select lives_ok(
  $$select public.platform_update_company_member_permissions((select company_id from wave1_ids), (select id from public.company_members where user_id = (select suspended_user from wave1_ids)), '[{"permission_key":"payroll.summary.read","effect":"GRANT"}]'::jsonb)$$,
  'admin can store an override for a suspended membership'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select suspended_user::text from wave1_ids), true);
select is(public.has_company_permission((select company_id from wave1_ids), 'payroll.summary.read'), false, 'suspended membership denies access despite override');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select finance_user::text from wave1_ids), true);
select throws_ok(
  $$select public.platform_update_company_member_permissions((select company_id from wave1_ids), (select id from public.company_members where user_id = (select viewer_user from wave1_ids)), '[]'::jsonb)$$,
  '42501', null, 'ordinary user without access-management cannot edit overrides'
);
reset role;

-- Expiry materialization is authoritative for the directory.
set local role service_role;
insert into public.company_invitations (company_id, normalized_email, role_key, status, invited_by_user_id, expires_at, delivery_status)
values ((select company_id from wave1_ids), 'expired@test.local', 'VIEWER', 'PENDING', (select admin_user from wave1_ids), now() - interval '1 hour', 'SENT');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from wave1_ids), true);
select is((select status from public.platform_list_company_invitations((select company_id from wave1_ids)) where normalized_email = 'expired@test.local'), 'EXPIRED'::text, 'expired invitation is materialized as EXPIRED');
reset role;

-- The direct trigger still protects the last active Company Admin even for a
-- privileged maintenance session.
set local role service_role;
select throws_ok(
  $$update public.company_members set status = 'SUSPENDED' where company_id = (select company_id from wave1_ids) and user_id = (select admin_user from wave1_ids)$$,
  '23514', null, 'last active Company Admin cannot be suspended'
);
reset role;

select * from finish();
rollback;
