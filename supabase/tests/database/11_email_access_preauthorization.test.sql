begin;
select no_plan();

-- The fixture deliberately exercises the browser-authenticated RPCs under
-- authenticated role. The service role is used only to seed trusted Auth and
-- historical rows that a browser cannot manufacture.
create temp table preauth_ids as
select
  '20000000-0000-4000-8000-000000000001'::uuid as admin_user,
  '20000000-0000-4000-8000-000000000002'::uuid as viewer_user,
  '20000000-0000-4000-8000-000000000003'::uuid as unauthorized_user,
  '20000000-0000-4000-8000-000000000004'::uuid as new_user,
  '20000000-0000-4000-8000-000000000005'::uuid as unverified_user,
  '20000000-0000-4000-8000-000000000006'::uuid as wrong_email_user,
  '20000000-0000-4000-8000-000000000007'::uuid as sent_user,
  '20000000-0000-4000-8000-000000000008'::uuid as failed_user,
  '20000000-0000-4000-8000-000000000009'::uuid as created_user,
  '20000000-0000-4000-8000-000000000010'::uuid as suspended_user,
  '20000000-0000-4000-8000-000000000011'::uuid as revoked_user,
  '20000000-0000-4000-8000-000000000012'::uuid as active_user,
  '20000000-0000-4000-8000-000000000013'::uuid as revoked_target_user,
  '20000000-0000-4000-8000-000000000014'::uuid as cross_deployment_user,
  '20000000-0000-4000-8000-000000000015'::uuid as expired_user,
  'cccccccc-0000-4000-8000-000000000001'::uuid as company_id,
  'dddddddd-0000-4000-8000-000000000002'::uuid as other_company_id;
grant select on preauth_ids to authenticated, service_role;

set local role service_role;
insert into auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select id, email, 'x', confirmed_at, now(), now()
from (values
  ((select admin_user from preauth_ids), 'preauth-admin@test.local', now()),
  ((select viewer_user from preauth_ids), 'preauth-viewer@test.local', now()),
  ((select unauthorized_user from preauth_ids), 'preauth-unauthorized@test.local', now()),
  ((select new_user from preauth_ids), 'New.User@Test.Local', now()),
  ((select unverified_user from preauth_ids), 'preauth-unverified@test.local', null::timestamptz),
  ((select wrong_email_user from preauth_ids), 'preauth-wrong@test.local', now()),
  ((select sent_user from preauth_ids), 'preauth-sent@test.local', now()),
  ((select failed_user from preauth_ids), 'preauth-failed@test.local', now()),
  ((select created_user from preauth_ids), 'preauth-created@test.local', now()),
  ((select suspended_user from preauth_ids), 'preauth-suspended@test.local', now()),
  ((select revoked_user from preauth_ids), 'preauth-revoked@test.local', now()),
  ((select active_user from preauth_ids), 'preauth-active@test.local', now()),
  ((select revoked_target_user from preauth_ids), 'preauth-revoked-target@test.local', now()),
  ((select cross_deployment_user from preauth_ids), 'preauth-cross-deployment@test.local', now()),
  ((select expired_user from preauth_ids), 'preauth-expired@test.local', now())
) users(id, email, confirmed_at)
on conflict (id) do nothing;

insert into public.companies (id, name, company_code, status, default_currency, timezone)
values
  ((select company_id from preauth_ids), 'Preauthorization Company', 'preauth-company', 'ACTIVE', 'PHP', 'Asia/Manila'),
  ((select other_company_id from preauth_ids), 'Other Deployment Company', 'other-preauth-company', 'ACTIVE', 'USD', 'UTC');

-- Seed one historical foreign-company authorization before configuring the
-- singleton deployment. The deployment trigger must preserve the row but the
-- claim function must never consider it.
insert into public.company_invitations (company_id, normalized_email, role_key, status, invited_by_user_id, expires_at, delivery_status)
values ((select other_company_id from preauth_ids), 'preauth-cross-deployment@test.local', 'VIEWER', 'PENDING', (select admin_user from preauth_ids), now() + interval '2 days', 'CREATED');

insert into public.company_role_catalog (role_key, display_name, description, assignable, is_platform_role)
values ('PREAUTH_PLATFORM_ONLY', 'Preauth platform-only role', 'Fixture role that must never be assignable.', false, true)
on conflict (role_key) do nothing;

insert into public.company_members (company_id, user_id, role_key, status)
values
  ((select company_id from preauth_ids), (select admin_user from preauth_ids), 'COMPANY_ADMIN', 'ACTIVE'),
  ((select company_id from preauth_ids), (select viewer_user from preauth_ids), 'VIEWER', 'ACTIVE'),
  ((select company_id from preauth_ids), (select suspended_user from preauth_ids), 'VIEWER', 'SUSPENDED'),
  ((select company_id from preauth_ids), (select revoked_user from preauth_ids), 'VIEWER', 'REVOKED'),
  ((select company_id from preauth_ids), (select active_user from preauth_ids), 'VIEWER', 'ACTIVE');

insert into public.deployment_configuration (singleton, company_id)
values (true, (select company_id from preauth_ids));
reset role;

select is(
  (select count(*) from pg_constraint where conname = 'company_members_company_id_user_id_key'),
  1::bigint,
  'membership company/user uniqueness protects concurrent claims'
);
select isnt_empty(
  $$select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'authorize_company_member_email'
      and grantee = 'authenticated'
      and privilege_type = 'EXECUTE'$$,
  'authenticated role can invoke the guarded authorization RPC'
);
select is_empty(
  $$select 1 from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'authorize_company_member_email'
      and lower(grantee) in ('public', 'anon')
      and privilege_type = 'EXECUTE'$$,
  'anonymous and public roles cannot invoke authorization RPC'
);

create temp table preauth_records (kind text primary key, invitation_id uuid);
grant select, insert on preauth_records to authenticated, service_role;

-- Only the active Company Admin can create an authorization. The browser
-- supplies no actor identity; auth.uid() is the database-side actor.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from preauth_ids), true);
insert into preauth_records
select 'new', ci.id
from public.authorize_company_member_email(
  (select company_id from preauth_ids),
  '  NEW.USER@TEST.LOCAL ',
  'viewer',
  '[{"permission_key":"projects.manage","effect":"GRANT"}]'::jsonb,
  now() + interval '2 days'
) ci;
reset role;
set local role service_role;
select is((select normalized_email from public.company_invitations where id = (select invitation_id from preauth_records where kind = 'new')), 'new.user@test.local'::text, 'authorization normalizes the exact email');
select is((select role_key from public.company_invitations where id = (select invitation_id from preauth_records where kind = 'new')), 'VIEWER'::text, 'authorization stores an assignable role');
select is((select status from public.company_invitations where id = (select invitation_id from preauth_records where kind = 'new')), 'PENDING'::text, 'authorization starts pending');
select is((select delivery_status from public.company_invitations where id = (select invitation_id from preauth_records where kind = 'new')), 'CREATED'::text, 'authorization does not require or fake email delivery');
select is((select count(*) from public.company_invitation_permission_overrides where invitation_id = (select invitation_id from preauth_records where kind = 'new') and permission_key = 'projects.manage' and effect = 'GRANT'), 1::bigint, 'authorization stores valid permission overrides before signup');
select is((select count(*) from public.company_audit_events where target_id = (select invitation_id from preauth_records where kind = 'new') and event_type = 'ACCESS_AUTHORIZATION_CREATED'), 1::bigint, 'authorization writes an explicit creation audit event');
select is((select count(*) from public.company_audit_events where target_id = (select invitation_id from preauth_records where kind = 'new') and event_type = 'INVITATION_SENT'), 0::bigint, 'authorization never writes a fake sent event');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from preauth_ids), true);

select set_config('request.jwt.claim.sub', (select viewer_user::text from preauth_ids), true);
select throws_ok(
  $$select public.authorize_company_member_email((select company_id from preauth_ids), 'viewer-cannot-authorize@test.local', 'VIEWER')$$,
  '42501', null, 'Viewer cannot authorize company access'
);
select set_config('request.jwt.claim.sub', (select unauthorized_user::text from preauth_ids), true);
select throws_ok(
  $$select public.authorize_company_member_email((select company_id from preauth_ids), 'unauthorized-cannot-authorize@test.local', 'VIEWER')$$,
  '42501', null, 'unauthorized member cannot authorize company access'
);
select set_config('request.jwt.claim.sub', (select admin_user::text from preauth_ids), true);
select throws_ok(
  $$select public.authorize_company_member_email((select other_company_id from preauth_ids), 'cross-company@test.local', 'VIEWER')$$,
  '42501', null, 'cross-company authorization is rejected'
);
select throws_ok(
  $$select public.authorize_company_member_email((select company_id from preauth_ids), 'not-an-email', 'VIEWER')$$,
  '22023', null, 'invalid email is rejected'
);
select throws_ok(
  $$select public.authorize_company_member_email((select company_id from preauth_ids), 'invalid-role@test.local', 'NOT_A_ROLE')$$,
  '22023', null, 'invalid role is rejected'
);
select throws_ok(
  $$select public.authorize_company_member_email((select company_id from preauth_ids), 'platform-role@test.local', 'PREAUTH_PLATFORM_ONLY')$$,
  '22023', null, 'platform-only role is rejected'
);
select throws_ok(
  $$select public.authorize_company_member_email((select company_id from preauth_ids), 'reserved-override@test.local', 'VIEWER', '[{"permission_key":"company.members.manage","effect":"GRANT"}]'::jsonb)$$,
  '42501', null, 'reserved administration permission cannot be manufactured'
);
select throws_ok(
  $$select public.authorize_company_member_email((select company_id from preauth_ids), 'unknown-override@test.local', 'VIEWER', '[{"permission_key":"not.in.catalog","effect":"GRANT"}]'::jsonb)$$,
  '42501', null, 'unknown permission override is rejected'
);
select throws_ok(
  $$select public.authorize_company_member_email((select company_id from preauth_ids), 'new.user@test.local', 'VIEWER')$$,
  '23505', null, 'duplicate pending authorization is rejected cleanly'
);
select throws_ok(
  $$select public.authorize_company_member_email((select company_id from preauth_ids), 'PREAUTH-ACTIVE@TEST.LOCAL', 'VIEWER')$$,
  '23505', 'This email already has company access.', 'existing active membership is rejected with a useful message'
);
select throws_ok(
  $$select public.authorize_company_member_email((select company_id from preauth_ids), 'preauth-suspended@test.local', 'VIEWER')$$,
  '23505', 'This email already has suspended company access. Reactivate or correct the existing membership instead of adding access.', 'suspended membership is not silently recreated'
);
select throws_ok(
  $$select public.authorize_company_member_email((select company_id from preauth_ids), 'preauth-revoked@test.local', 'VIEWER')$$,
  '23505', 'This email already has revoked company access. Reactivate or correct the existing membership instead of adding access.', 'revoked membership is not silently recreated'
);

-- Pending overrides can be corrected before signup, still under the same
-- company and permission catalog guards.
select lives_ok(
  $$select public.update_company_invitation_permissions(
    (select company_id from preauth_ids),
    (select invitation_id from preauth_records where kind = 'new'),
    '[{"permission_key":"projects.manage","effect":"GRANT"},{"permission_key":"invoices.read","effect":"DENY"}]'::jsonb
  )$$,
  'admin can update pending authorization overrides'
);
reset role;
set local role service_role;
select is((select count(*) from public.company_invitation_permission_overrides where invitation_id = (select invitation_id from preauth_records where kind = 'new')), 2::bigint, 'pending authorization override replacement is atomic');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from preauth_ids), true);
select throws_ok(
  $$select public.update_company_invitation_permissions((select other_company_id from preauth_ids), (select invitation_id from preauth_records where kind = 'new'), '[]'::jsonb)$$,
  '42501', null, 'pending override update rejects a cross-company target'
);
reset role;

-- Seed historical CREATED, FAILED, SENT, expired, and a replacement pending
-- row. They are old invitation records, but claim eligibility now depends on
-- verified email, deployment company, pending status, expiry, and active company
-- only.
set local role service_role;
insert into public.company_invitations (company_id, normalized_email, role_key, status, invited_by_user_id, expires_at, delivery_status)
values
  ((select company_id from preauth_ids), 'preauth-sent@test.local', 'VIEWER', 'PENDING', (select admin_user from preauth_ids), now() + interval '2 days', 'SENT'),
  ((select company_id from preauth_ids), 'preauth-failed@test.local', 'VIEWER', 'PENDING', (select admin_user from preauth_ids), now() + interval '2 days', 'FAILED'),
  ((select company_id from preauth_ids), 'preauth-created@test.local', 'VIEWER', 'PENDING', (select admin_user from preauth_ids), now() + interval '2 days', 'CREATED'),
  ((select company_id from preauth_ids), 'preauth-expired@test.local', 'VIEWER', 'PENDING', (select admin_user from preauth_ids), now() - interval '1 hour', 'CREATED');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from preauth_ids), true);
insert into preauth_records
select 'revoked', ci.id
from public.authorize_company_member_email(
  (select company_id from preauth_ids), 'preauth-revoked-target@test.local', 'VIEWER', '[]'::jsonb, now() + interval '2 days'
) ci;
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from preauth_ids), true);
select lives_ok(
  $$select public.revoke_company_invitation((select invitation_id from preauth_records where kind = 'revoked'))$$,
  'admin can revoke a pending email authorization'
);
reset role;
set local role service_role;
select is((select status from public.company_invitations where id = (select invitation_id from preauth_records where kind = 'revoked')), 'REVOKED'::text, 'revoked authorization cannot remain pending');
select is((select count(*) from public.company_audit_events where target_id = (select invitation_id from preauth_records where kind = 'revoked') and event_type = 'ACCESS_AUTHORIZATION_REVOKED'), 1::bigint, 'authorization revocation is audited explicitly');
reset role;

-- Matching verified email claims the CREATED authorization and transfers its
-- final override set exactly once. It remains CREATED as historical delivery
-- metadata, proving delivery is not the authorization boundary.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select new_user::text from preauth_ids), true);
select is((select count(*) from public.claim_company_invitations()), 1::bigint, 'matching verified email claims pending access without delivery');
select is((select count(*) from public.company_members where company_id = (select company_id from preauth_ids) and user_id = (select new_user from preauth_ids) and role_key = 'VIEWER' and status = 'ACTIVE'), 1::bigint, 'claim creates the configured membership role');
reset role;
set local role service_role;
select is((select count(*) from public.company_member_permission_overrides where company_id = (select company_id from preauth_ids) and membership_id = (select id from public.company_members where company_id = (select company_id from preauth_ids) and user_id = (select new_user from preauth_ids)) and permission_key = 'projects.manage' and effect = 'GRANT'), 1::bigint, 'claim transfers a custom grant exactly once');
select is((select count(*) from public.company_member_permission_overrides where company_id = (select company_id from preauth_ids) and membership_id = (select id from public.company_members where company_id = (select company_id from preauth_ids) and user_id = (select new_user from preauth_ids)) and permission_key = 'invoices.read' and effect = 'DENY'), 1::bigint, 'claim transfers a custom deny exactly once');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select new_user::text from preauth_ids), true);
select is(public.has_company_permission((select company_id from preauth_ids), 'projects.manage'), true, 'transferred grant is effective');
select is(public.has_company_permission((select company_id from preauth_ids), 'invoices.read'), false, 'transferred deny removes the role baseline');
reset role;
set local role service_role;
select is((select status from public.company_invitations where id = (select invitation_id from preauth_records where kind = 'new')), 'ACCEPTED'::text, 'claimed authorization becomes accepted');
select is((select delivery_status from public.company_invitations where id = (select invitation_id from preauth_records where kind = 'new')), 'CREATED'::text, 'claim does not rewrite historical delivery status');
select is((select count(*) from public.company_audit_events where target_id = (select invitation_id from preauth_records where kind = 'new') and event_type = 'ACCESS_AUTHORIZATION_ACCEPTED'), 1::bigint, 'accepted authorization is audited explicitly');
select is((select count(*) from public.company_audit_events where target_id = (select id from public.company_members where company_id = (select company_id from preauth_ids) and user_id = (select new_user from preauth_ids)) and event_type = 'MEMBERSHIP_CREATED'), 1::bigint, 'membership creation is audited explicitly');
select is((select count(*) from public.company_audit_events where target_id = (select id from public.company_members where company_id = (select company_id from preauth_ids) and user_id = (select new_user from preauth_ids)) and event_type = 'PERMISSION_OVERRIDES_TRANSFERRED'), 1::bigint, 'permission override transfer is audited explicitly');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select new_user::text from preauth_ids), true);
select is((select count(*) from public.claim_company_invitations()), 0::bigint, 'accepted authorization cannot be claimed twice');
reset role;

-- Unverified and nonmatching emails never claim pending access.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select unverified_user::text from preauth_ids), true);
select is((select count(*) from public.claim_company_invitations()), 0::bigint, 'unverified email cannot claim access');
select is((select count(*) from public.company_members where user_id = (select unverified_user from preauth_ids)), 0::bigint, 'unverified user receives no membership');
select set_config('request.jwt.claim.sub', (select wrong_email_user::text from preauth_ids), true);
select is((select count(*) from public.claim_company_invitations()), 0::bigint, 'nonmatching verified email cannot claim access');
select is((select count(*) from public.company_members where user_id = (select wrong_email_user from preauth_ids)), 0::bigint, 'nonmatching user receives no membership');
select set_config('request.jwt.claim.sub', (select revoked_target_user::text from preauth_ids), true);
select is((select count(*) from public.claim_company_invitations()), 0::bigint, 'revoked authorization cannot be claimed');
select set_config('request.jwt.claim.sub', (select sent_user::text from preauth_ids), true);
select is((select count(*) from public.claim_company_invitations()), 1::bigint, 'historical SENT authorization remains compatible');
select set_config('request.jwt.claim.sub', (select failed_user::text from preauth_ids), true);
select is((select count(*) from public.claim_company_invitations()), 1::bigint, 'historical FAILED authorization is claimable under new semantics');
select set_config('request.jwt.claim.sub', (select created_user::text from preauth_ids), true);
select is((select count(*) from public.claim_company_invitations()), 1::bigint, 'historical CREATED authorization is claimable under new semantics');
select set_config('request.jwt.claim.sub', (select cross_deployment_user::text from preauth_ids), true);
select is((select count(*) from public.claim_company_invitations()), 0::bigint, 'authorization from another deployment cannot be claimed');
reset role;

set local role service_role;
select is((select status from public.company_invitations where normalized_email = 'preauth-expired@test.local'), 'PENDING'::text, 'expired row is initially preserved for claim materialization');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', (select admin_user::text from preauth_ids), true);
select is((select status from public.platform_list_company_invitations_with_overrides((select company_id from preauth_ids)) where normalized_email = 'preauth-expired@test.local'), 'EXPIRED'::text, 'expired authorization is materialized as EXPIRED');
select set_config('request.jwt.claim.sub', (select expired_user::text from preauth_ids), true);
select is((select count(*) from public.claim_company_invitations()), 0::bigint, 'expired authorization cannot be claimed');
reset role;

-- Unauthorized authenticated users see no company rows through direct table
-- reads; the guarded directory RPC also refuses them.
set local role authenticated;
select set_config('request.jwt.claim.sub', (select unauthorized_user::text from preauth_ids), true);
select is((select count(*) from public.companies), 0::bigint, 'unauthorized authenticated user sees no company metadata');
select is((select count(*) from public.company_members), 0::bigint, 'unauthorized authenticated user sees no company membership rows');
select throws_ok(
  $$select * from public.platform_list_company_invitations_with_overrides((select company_id from preauth_ids))$$,
  '42501', null, 'unauthorized authenticated user cannot list access authorizations'
);
reset role;

-- No pending authorization created by the new browser RPC produces an
-- INVITATION_SENT audit event because the RPC never invokes delivery.
set local role service_role;
select is((select count(*) from public.company_audit_events where target_id = (select invitation_id from preauth_records where kind = 'new') and event_type = 'INVITATION_SENT'), 0::bigint, 'new authorization has no fake INVITATION_SENT audit history');
select is((select count(*) from public.company_members where company_id = (select other_company_id from preauth_ids) and user_id = (select cross_deployment_user from preauth_ids)), 0::bigint, 'cross-deployment user has no membership');
reset role;

select * from finish();
rollback;
