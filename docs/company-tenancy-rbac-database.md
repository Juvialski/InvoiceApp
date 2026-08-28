# Company tenancy and database RBAC

The database security workstream moves business-data authorization from `user_id` ownership to:

`company_id` + active company membership + company permission.

`user_id` remains in existing domain rows for actor/legacy lineage and compatibility. It is not used as the tenant read boundary. `profiles` remains user identity data.

## Ordered migrations

The migrations are intentionally additive and ordered:

1. `20260824090000_company_tenancy_rbac_foundation.sql` creates companies, memberships, invitations, role/permission catalogs, platform-admin tables, private authorization helpers, and the seeded `al.matubis17@gmail.com` allowlist.
2. `20260824091000_company_tenancy_backfill.sql` captures preservation baselines, adds `company_id` to every persisted tenant table, creates one deterministic legacy company per persisted owner, creates a `COMPANY_ADMIN` membership, backfills company ownership, enforces non-null/FK ownership, and replaces user-scoped unique indexes.
3. `20260824092000_company_tenancy_integrity.sql` adds company-boundary transition triggers, same-company relationship checks, company-scoped payroll schedule uniqueness, and preserves payroll/invoice immutability guards.
4. `20260824093000_company_tenancy_rls_and_admin_rpcs.sql` replaces user-only RLS with permission policies and adds audited platform/invitation RPCs.
5. `20260824094000_company_tenancy_rpc_rewrites.sql` makes invoice allocation and payroll import/rebuild RPCs company-scoped.
6. `20260824095000_company_tenancy_storage_and_verification.sql` adds company-path Storage policies, legacy read compatibility, Realtime publication coverage, and `verify_company_tenancy()`.
7. `20260824100000_company_tenancy_security_contract.sql` exposes the lead/server contract names and reasserts final public-schema grants/policies.
8. `20260824101000_company_tenancy_sql_corrections.sql` hardens Storage RLS and corrects invitation claiming's conflict-update alias.
9. `20260824102000_company_tenancy_final_grants.sql` reasserts the narrow RPC grants and revokes.

No migration in this workstream deletes tenant rows or Storage objects. The migration records numeric baselines for invoice totals, expenses, project budgets, finalized payroll counts/amounts, extraction/review history, source-document counts, and import-row counts. The verification RPC compares current values to those baselines.

## Stable RPC contract

All public RPCs are executable by `authenticated` only; `public`/`anon` execution is revoked. Security-definer functions use `set search_path = ''` and schema-qualified references.

Access/context:

- `is_platform_admin()`
- `is_active_company_member(company_id uuid)`
- `has_company_permission(company_id uuid, permission_key text)`
- `get_my_company_access()`
- `bootstrap_platform_admin()`
- `claim_company_invitations()`

Platform management:

- `platform_create_company(name, company_code, default_currency, timezone)`
- `platform_update_company(company_id, name, company_code, default_currency, timezone)`
- `platform_suspend_company(company_id)`
- `platform_archive_company(company_id)`
- `platform_reactivate_company(company_id)`
- `platform_invite_company_member(company_id, email, role_key, expires_at)`
- `platform_update_company_member(membership_id, role_key, status)`
- `platform_list_company_members(company_id)`
- `platform_list_access_audit(company_id)`

The lower-level `create_company`, `update_company`, `suspend_company`, `archive_company`, `reactivate_company`, `invite_company_member`, and membership RPCs remain as implementation-compatible aliases. All platform mutations check `private.is_platform_admin()` internally. No RPC trusts a caller-supplied `user_id` or email as actor identity.

## Roles

The catalog seeds `COMPANY_ADMIN`, `FINANCE`, `PAYROLL`, and `VIEWER`. Platform ownership is separate and is not assignable as a company role.

- `COMPANY_ADMIN`: all company permissions, including members/settings.
- `FINANCE`: invoices/extraction/review, projects, vendors, expenses, financial reports, Gmail read metadata, and payroll aggregate summaries; no payroll detail or compensation.
- `PAYROLL`: payroll/workforce/compensation/import/settings/approval/reporting and minimal project references; no invoice, expense, vendor, or Gmail management permissions.
- `VIEWER`: read-only financial/project surfaces and aggregate payroll summaries; no writes or payroll detail.

Company suspension/archival makes business-data permissions false even for active memberships. Suspended/revoked members can still see their own membership metadata through `get_my_company_access()`/membership RLS, not business data.

## Transition behavior

Existing code that inserts a tenant row without `company_id` can continue only when the authenticated user has exactly one active company. The `private.enforce_company_row_boundary()` trigger derives that company; zero or multiple active companies fail closed and require explicit `company_id`. `payroll_schedule_versions` derives the company from its schedule.

Current application persistence sends the selected company explicitly for Gmail and invoice-source storage. Gmail message upserts use the company-scoped conflict key `company_id,gmail_message_id`; Gmail sync-state reads/writes filter and persist `company_id`; source-document lookups include `company_id`; and invoice/email Storage paths are built with `companyStoragePath(...)` under the active company prefix. Multi-company safety therefore no longer depends on the old user-only Gmail conflict target or user-folder writes.

New Storage paths are:

- `companies/<company-id>/...` for invoice originals
- `companies/<company-id>/...` for email originals
- `companies/<company-id>/...` for payroll import sources

Legacy `<legacy-user-id>/...` objects remain readable only through `companies.legacy_owner_user_id` plus the caller's current company permission. Legacy inserts/updates/deletes are not allowed, and no object metadata is rewritten.

## Deployment and verification

The tenancy migrations are designed to be tested through the repository migration test harness and then applied through the normal deployment process. Production safety still depends on applying the full ordered migration set and verifying the live database, not on frontend capability hiding alone.

Before deployment:

1. Apply the ordered migrations to a disposable/staging Supabase project first.
2. Verify the migration preflight has no ambiguous company mappings or uniqueness collisions.
3. Call `bootstrap_platform_admin()` while signed in as the verified platform-owner account.
4. Call `select * from public.verify_company_tenancy();` as the bootstrapped platform admin and require every row to be `passed = true`.
5. Verify the application uses the selected `company_id` for persistence/server callers and clears active capability state during company switching.
6. Run the cross-company RLS/Storage/API matrix with two companies and at least one user in each role.

Frontend capability presentation is a usability and truthfulness layer only. RLS and permission-checking RPCs remain authoritative for company isolation and mutation authorization.
