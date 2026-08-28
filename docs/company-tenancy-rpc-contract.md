# Company access RPC contract

The final lead-integration migration is `20260824103000_company_tenancy_lead_rpc_shapes.sql`; the single-company deployment contract is finalized by the migrations dated `20260828150000` through `20260828152000`.

`get_my_company_access()` returns one JSON object:

- `is_platform_owner: boolean` (legacy compatibility field; the single-company client resolver always treats it as `false`)
- `companies: [{ id, name, company_code, status, default_currency, timezone, created_at, updated_at }]`
- `memberships: [{ id, company_id, user_id, role_key, status, permissions, joined_at, updated_at }]`
- `permissions_by_company: { [companyId]: string[] }`

The platform RPC argument names match the current lead callers:

- `platform_create_company(p_name, p_company_code, p_default_currency, p_timezone)`
- `platform_update_company(p_company_id, p_name, p_status, p_default_currency, p_timezone, p_company_code)`
- `platform_invite_company_member(p_company_id, p_normalized_email, p_role_key, p_expires_at)`
- `platform_update_company_member(p_company_id, p_user_id, p_membership_id, p_role_key, p_status)`
- `platform_list_company_members(p_company_id)`
- `platform_list_access_audit(p_company_id)`; the deployment company ID is required and `NULL` is rejected.

The platform-named RPCs remain compatibility/internal-maintenance contracts. In a client deployment, company creation is disabled, member/company targets must equal the configured deployment company, actor identity is derived from `auth.uid()`, and platform maintenance requires an explicitly provisioned `platform_admins` record. No client deployment migration provisions a platform operator automatically.
