# Engoryx single-company deployment runbook

## Purpose

Each client receives an isolated Engoryx stack:

- one application deployment;
- one Supabase project/database;
- one Storage namespace/project;
- one environment/secrets configuration;
- one configured company identity;
- many users and roles within that company.

Do not reuse a client Supabase project for another unrelated company. The deployment identity is fixed by its database configuration and is shown as a read-only company badge.

## New-client provisioning

### 1. Create the isolated infrastructure

Create a new Supabase project and a new Render/service deployment from the same Engoryx source repository. Use client-specific infrastructure configuration outside git. Do not commit client names, API keys, service-role keys, passwords, or production URLs to the repository.

### 2. Apply the complete migration set

Apply migrations in repository order. Run both fresh-reset and upgrade-path migration validation before using the project for production data.

The single-company migration does not invent a company when a new database contains none. That is intentional: production identity must be provisioned explicitly.

### 3. Create the initial authenticated administrator

Create/invite the client's initial administrator through the normal Supabase Auth administration flow. Confirm the user's UUID and verified email in the target Supabase project.

### 4. Provision exactly one deployment company

Use an administrative SQL/service-role provisioning step, not a browser-exposed company-creation workflow. Replace placeholders before execution:

```sql
begin;

insert into public.companies (
  name,
  company_code,
  status,
  default_currency,
  timezone
)
values (
  '<CLIENT COMPANY NAME>',
  '<lowercase-company-code>',
  'ACTIVE',
  'PHP',
  'Asia/Manila'
)
returning id;

-- Use the returned company UUID below.
insert into public.deployment_configuration (singleton, company_id)
values (true, '<COMPANY UUID>'::uuid);

insert into public.company_members (
  company_id,
  user_id,
  role_key,
  status,
  joined_at
)
values (
  '<COMPANY UUID>'::uuid,
  '<INITIAL ADMIN AUTH USER UUID>'::uuid,
  'COMPANY_ADMIN',
  'ACTIVE',
  now()
);

commit;
```

Verify that `public.deployment_configuration` has exactly one row and that its `company_id` matches the one company intended for this deployment.

Do not create a second client company in this Supabase project. The forward database guards reject additional company inserts after deployment configuration.

### 5. Configure application secrets

Configure the deployment's Supabase URL/publishable key and any existing server-side AI secrets in the hosting provider. Email access preauthorization does not require SMTP, `SUPABASE_INVITATION_SERVER_KEY`, or a service-role key in the browser. Supabase Auth confirmation redirects must still be allow-listed for the deployed application origin. Company AI credentials or global fallback credentials must follow the existing server-side encryption and fallback policy; never expose secret/service-role credentials to the browser bundle.

Use `.env.example` as a shape reference only. Real production values belong in deployment secret management.

### 6. Deploy Engoryx

Build and deploy the web/server service. The same source branch/tag can serve different clients because company identity comes from each Supabase project's deployment configuration, not from a hardcoded UUID in source.

### 7. Validate deployment-company bootstrap

With the initial Company Admin account:

- sign in successfully;
- verify the header shows a read-only deployment-company identity, not a selector;
- verify `get_deployment_company_id()` resolves the expected company;
- verify Settings → Company access shows only that company's users;
- verify a fabricated `X-Company-Id` for another UUID is rejected;
- verify logout/login does not restore stale browser company state because deployment identity is re-resolved from the database.

A missing deployment company must produce an explicit configuration error. An upgraded database with multiple active companies and no singleton configuration must fail as ambiguous rather than selecting the first row.

### 8. Validate RLS and Storage

Run the database verification/migration harness and targeted probes for:

- business-row reads/writes with the deployment `company_id`;
- rejection of a different company ID;
- Storage paths under `companies/<deployment-company-id>/...`;
- rejection of a different company prefix;
- Gmail connection/sync/message rows scoped to the deployment company;
- invoice/email/payroll/engineering source attachments staying inside company-prefixed Storage paths;
- immutable payroll, invoice, engineering-history, and settlement invariants.

### 9. Invite the remaining users

Use Settings → Company profile and Company access as a Company Admin. Edit the deployment company's display name, code, default currency, and timezone; then authorize users directly in the deployment company and assign one of the seeded roles:

- `COMPANY_ADMIN`;
- `FINANCE`;
- `PAYROLL`;
- `VIEWER`.

The administrator manages users only within the configured deployment company. Database RPCs reject membership operations outside that company. Add user access creates a pending authorization for the exact normalized email; the user signs up normally, verifies that email through Supabase Auth, and then claims membership automatically. The access editor distinguishes role defaults, custom grants, and custom denies; reserved administration permissions remain role-controlled. The database also prevents removal/demotion/suspension/deletion of the last active Company Admin and blocks self-editing from the access screen.

### 10. Run role smoke tests

At minimum verify each seeded role against login, Dashboard, Projects/project workspace, Invoices/review, Gmail, Expenses, Payroll, Reports, Cash & Banking, Settings, and Assistant behavior.

Preserve the existing hardening expectations:

- Finance/Viewer do not receive payroll-sensitive detail;
- Payroll does not receive supplier invoice/expense detail without those permissions;
- Viewer does not receive mutation controls;
- Gmail read and Gmail manage remain distinct;
- incomplete cross-domain totals are withheld or explicitly partial;
- canonical route/deep-link authorization fails closed;
- Assistant actions use the same permissions and confirmation gates as deterministic application actions.

## Legacy multi-company database conversion

If an older Supabase project contains multiple real client companies, do not configure one row and abandon the others as a production migration strategy.

Instead:

1. inventory every company's database rows and Storage prefixes;
2. create a separate Supabase project/deployment per client;
3. export/import each company's scoped data with preserved IDs/history where safe;
4. validate RLS, foreign keys, Storage references, currency/history semantics, and user memberships per destination;
5. cut over each client separately;
6. archive the legacy shared deployment only after reconciliation.

The single-company migration intentionally preserves historical extra-company rows and fails closed when no unambiguous deployment company can be resolved. It does not perform destructive automatic tenant splitting.

## Platform-owner strategy

Global cross-company administration does not belong in an ordinary client Engoryx deployment. Legacy platform-admin tables and maintenance RPC names remain for migration compatibility and explicit internal maintenance only. The final deployment migration clears inherited platform-admin and allowlist records because the legacy tables do not preserve seed provenance; an internal operator must be provisioned deliberately afterward if needed. Client product navigation does not expose a global company directory and platform ownership does not bypass company business-data permissions.

If Engoryx later needs fleet-wide operations across client deployments, build that as a separate internal operator service/tool that connects to explicitly authorized deployments. Keep that capability outside the client application.

## Release checklist

Before declaring a client deployment production-ready, record:

- application commit/tag;
- Supabase migration level;
- configured deployment company UUID;
- successful fresh/upgrade migration validation where applicable;
- RLS and Storage isolation results;
- role smoke-test results;
- Assistant authorization/confirmation tests;
- dependency/security audit findings and accepted deferrals;
- backup/restore procedure and recovery owner;
- production smoke-test result after deployment.
