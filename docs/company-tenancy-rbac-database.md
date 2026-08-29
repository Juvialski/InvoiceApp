# Company boundary and database RBAC

## Deployment tenancy model

One deployed Engoryx instance serves exactly one client company.

Different client companies use separate application deployments, separate Supabase projects/databases, separate Storage, separate environment/secrets, and separate user populations. A client deployment has no product workflow for selecting or switching among unrelated companies.

Within that deployment, authorization remains:

`deployment company_id` + active company membership + company permission.

`company_id` remains on operational rows and Storage paths as a defense-in-depth boundary. This preserves explicit RLS scoping, auditability, backup/restore clarity, migration compatibility, and protection against accidental cross-company identifiers without requiring a destructive schema rewrite.

`user_id` remains on existing domain rows for actor/legacy lineage and compatibility. It is not the company read boundary. `profiles` remains user identity data.

## Deployment company source of truth

`20260828150000_single_company_deployment.sql` adds the singleton `public.deployment_configuration` table. Its `company_id` is the authoritative company identity for the Supabase project.

Upgrade behavior is deliberately fail closed:

- if the configuration table is empty and exactly one ACTIVE company exists, the migration configures that company automatically;
- if no active company exists, no arbitrary company is created or selected;
- if multiple active companies exist, no row is selected and authenticated application bootstrap fails with an explicit ambiguous-deployment diagnostic;
- client/model/request-supplied company IDs may confirm the configured company but cannot choose another one.

`public.get_deployment_company_id()` is the authenticated runtime resolver. `private.resolve_transition_company()` remains for backward-compatible persistence/RPC code, but it now resolves only the deployment company and rejects a mismatched `X-Company-Id` header.

The browser compatibility module `src/lib/companyContext.ts` still exposes historical `activeCompanyId` function names because many repositories use them. Their meaning is now “resolved deployment company.” Replacing one non-null company with another non-null company at runtime throws instead of switching.

## Ordered tenancy migrations

The original tenancy migrations remain additive and data-preserving:

1. `20260824090000_company_tenancy_rbac_foundation.sql` creates companies, memberships, invitations, role/permission catalogs, platform-admin maintenance tables, and private authorization helpers.
2. `20260824091000_company_tenancy_backfill.sql` captures preservation baselines, adds `company_id` to persisted company data, creates deterministic legacy companies/memberships, backfills ownership, and replaces user-scoped unique indexes.
3. `20260824092000_company_tenancy_integrity.sql` adds company-boundary triggers and relationship checks while preserving payroll/invoice immutability guards.
4. `20260824093000_company_tenancy_rls_and_admin_rpcs.sql` replaces user-only RLS with permission policies and introduces audited access RPCs.
5. `20260824094000_company_tenancy_rpc_rewrites.sql` company-scopes invoice allocation and payroll import/rebuild RPCs.
6. `20260824095000_company_tenancy_storage_and_verification.sql` adds company-path Storage policies, legacy read compatibility, Realtime coverage, and `verify_company_tenancy()`.
7. `20260824100000_company_tenancy_security_contract.sql` exposes stable server contract names and reasserts grants/policies.
8. `20260824101000_company_tenancy_sql_corrections.sql` corrects invitation claiming and Storage details.
9. Later compatibility migrations align lead/server RPC shapes and domain additions.
10. `20260828150000_single_company_deployment.sql` converts application semantics to one configured deployment company, removes platform-owner business-data override, binds invitations/member administration to that company, and disables authenticated creation of additional companies.
11. `20260828151000_single_company_access_guards.sql` prevents membership/invitation retargeting, prevents creating another company after deployment configuration, and prevents demoting/revoking/suspending/deleting the last active `COMPANY_ADMIN`.
12. `20260828151500_single_company_platform_update_signature_transition.sql` and `20260828152000_single_company_platform_maintenance.sql` finalize compatibility RPC signatures and bind internal maintenance to the configured deployment company.
13. `20260829003147_core_hardening_wave1_access_management.sql` adds company-bound member/invitation permission overrides, effective-permission evaluation, audited historical delivery state, and company-admin profile editing.
14. `20260829132712_email_access_preauthorization.sql` adds authenticated email access authorization, pending override editing, verified-email claim lifecycle, and explicit authorization/membership audit events without requiring invitation delivery.

No single-company migration deletes business rows, historical companies, or Storage objects. Historical extra-company rows on an upgraded database remain preserved but are inaccessible through ordinary client-deployment authorization once a deployment company is configured. They should be exported/split deliberately if a legacy multi-company database is ever converted into separate client deployments.

## Runtime authorization contract

All public application RPCs remain `authenticated`-only with `public`/`anon` execution revoked where applicable. Security-definer functions use an empty `search_path` and schema-qualified references.

Runtime bootstrap:

- `get_deployment_company_id()` resolves the configured company or raises an explicit configuration error.
- `get_my_company_access()` returns only that deployment company and the current user's membership/effective permissions in it. It does not project global platform-owner state into the client app.
- `claim_company_invitations()` claims only unexpired pending authorizations for the deployment company and matching verified email. Historical delivery state is not an authorization condition, and the function never reactivates an existing suspended or revoked membership.
- `has_company_permission(company_id, permission_key)` succeeds only when `company_id` is the configured deployment company and the authenticated user has an ACTIVE membership with role-baseline or explicit grant access that is not explicitly denied in an ACTIVE company.

The legacy company header remains a compatibility transport for Express endpoints, but it is not a selection mechanism. Browser `companyApiRequest()` replaces it with the resolved deployment-company ID and rejects a mismatched caller-supplied ID before sending a request. Database permission helpers independently reject a different company ID, so frontend hiding is not the security boundary.

## Roles and access management

Seeded company roles remain:

- `COMPANY_ADMIN`: broad company operations plus settings/access administration.
- `FINANCE`: invoice/extraction/review, projects, vendors, expenses, financial reports, Gmail read metadata, and payroll aggregate summaries; no payroll detail/compensation.
- `PAYROLL`: payroll/workforce/compensation/import/settings/approval/reporting and minimal project references; no supplier invoice/expense/vendor/Gmail access unless separately granted.
- `VIEWER`: read-only permitted financial/project surfaces and payroll aggregate summaries; no writes or payroll detail.

`company.members.read` allows permitted access-directory/audit reading. `company.members.manage` and `company.settings.manage` remain role-controlled administration capabilities; they are intentionally not assignable through member overrides. Other catalog permissions may be explicitly granted or denied only when the acting administrator already holds the permission and the catalog marks it member-assignable.

Company administrators manage the profile, members, and pending email access authorizations under the Settings surface for the deployment company. Profile edits, role changes, suspension/reactivation, revocation, authorization creation, and permission overrides are authorized again at the database RPC layer; the administrator does not choose a company. The primary authorization path uses the authenticated browser session and does not call the Express invitation-delivery endpoint. Historical `CREATED`, `SENT`, or `FAILED` delivery state remains readable for compatibility, while database triggers and override RPC checks prevent removing the last usable access-management authority.

Platform-owner maintenance tables/RPC names remain for migration compatibility and explicit internal maintenance only. The final deployment migration clears inherited platform-admin and allowlist records because the legacy tables do not preserve seed provenance; an internal operator must be provisioned deliberately afterward if needed. Ordinary client deployments do not expose global navigation or platform-owner business-data access. A future fleet operator console belongs in a separate internal deployment/tool.

## Persistence, Storage, Gmail, and Assistant boundaries

Production writes continue to use `company_id` through `companyScopedRow(...)`, company-scoped RPCs, or explicit same-company foreign-key checks.

Storage remains prefixed:

- `companies/<company-id>/...` for invoice/email originals and attachments;
- the same company prefix for payroll/import and engineering artifacts where those domains persist files.

Existing Storage RLS resolves the company prefix and calls company permission helpers; because those helpers now require the deployment company, a historical/foreign company path is denied even if supplied manually.

Gmail connections, sync state, imported messages, source documents, and conflict keys remain company-scoped. There is no Gmail company selector. Clearing/re-resolving authenticated company access also clears the browser persistence context before another request can be issued.

The Engoryx Assistant runs with the same deployment company and current effective permission set as the rest of the application. `companyApiRequest()` rejects a mismatched company target, server/database permission checks remain authoritative, canonical route authorization remains unchanged, and the integrity hardening for payroll-detail redaction, incomplete aggregates, read-only invoice behavior, Gmail read/manage separation, project nested routes, and mutation confirmation remains in force.

## Demo isolation

Single-company production resolution does not turn demo fixtures into production company data. Browser-only/demo mode remains separate from Supabase-backed authenticated mode, and production company context is unavailable until authenticated deployment access resolves. Demo identifiers must still never be sent to production RPCs or Storage paths.

## Provisioning and verification

For a new client, follow [`SINGLE_COMPANY_DEPLOYMENT.md`](SINGLE_COMPANY_DEPLOYMENT.md). The important sequence is:

1. create a separate Supabase project and application deployment;
2. apply all migrations;
3. create exactly one client company and set `deployment_configuration.company_id` using an administrative/service-role provisioning step;
4. create the initial `COMPANY_ADMIN` membership;
5. configure the Supabase URL/publishable key and any existing server-side AI secrets; no invitation-delivery secret or SMTP configuration is required for access authorization;
6. run RLS/Storage/role smoke tests before inviting remaining users.

Production verification should include `verify_company_tenancy()` where supported, the repository migration test suites, role-specific route tests, wrong-company header/RPC probes, Storage-prefix probes, invitation/member administration, logout/login stale-context checks, and explicit validation that the deployment has exactly one configured company.

Frontend presentation is a usability/truthfulness layer. PostgreSQL RLS, permission RPCs, company-boundary triggers, immutable domain rules, and server authorization remain authoritative.
