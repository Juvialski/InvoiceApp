-- Final grant reassertion. RPCs never accept caller-supplied user_id or email
-- as trusted identity; they derive actor identity from auth.uid()/auth.users.

revoke execute on function public.bootstrap_platform_admin() from public, anon;
revoke execute on function public.claim_company_invitations() from public, anon;
revoke execute on function public.get_my_company_access() from public, anon;
revoke execute on function public.has_company_permission(uuid, text) from public, anon;
grant execute on function public.bootstrap_platform_admin() to authenticated;
grant execute on function public.claim_company_invitations() to authenticated;
grant execute on function public.get_my_company_access() to authenticated;
grant execute on function public.has_company_permission(uuid, text) to authenticated;

revoke all on table public.platform_admin_allowlist from anon, authenticated;
revoke all on table private.company_tenancy_baseline, private.company_tenant_policy_catalog from anon, authenticated;
