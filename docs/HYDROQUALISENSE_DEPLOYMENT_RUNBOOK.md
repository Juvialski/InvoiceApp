# HydroQualiSense Deployment and Release Runbook

Status: **ACTIVE — bounded operator workflow for isolated client deployments**

This runbook supports the productization phase without introducing a shared client-tenant control plane.

## Operating model

HydroQualiSense uses one maintained repository and one isolated operational deployment per client:

`one repository -> one Render service + one Supabase project/database/Auth/Storage boundary -> one client company`

The application keeps `company_id`, membership/RBAC, RLS, company-bound integrity, Storage paths, and audit boundaries as defense in depth. The public requirements form is not an operational workspace and cannot create a company, user, deployment, credential, or secret.

## Public funnel deployment gate

The public product/requirements funnel is **disabled by default** so merging shared product code does not replace an operational client's root application with a marketing surface or turn a client database into a prospect-intake database accidentally.

A deployment intended to host the public funnel must be enabled deliberately at both layers:

1. Set the non-secret build variable `VITE_HYDROQUALISENSE_PUBLIC_FUNNEL_ENABLED=true` for that platform/QA deployment and rebuild it.
2. In that deployment's Supabase project, a privileged operator may enable prospect persistence only after confirming that the database is intended to receive prospective-client business contact data:

```sql
update private.public_prospect_funnel_configuration
set enabled = true,
    updated_at = now()
where singleton = true;
```

Do not enable either switch on an operational client production deployment merely because the shared code contains the public funnel. Client production remains an authenticated operational application unless an explicit deployment decision says otherwise. If the browser switch is enabled while the database gate is still disabled, submissions fail closed and no prospect record is inserted.

Before exposing the form broadly on the public internet, verify the hosting platform's reverse-proxy/client-IP behavior for the process-local rate limiter or replace it with an appropriate provider-level abuse-control mechanism.

## QA deployment bootstrap

QA is a separate deployment boundary, not a second company inside Client A production:

`one repository -> QA Render service + QA Supabase project/Auth/Storage -> synthetic data only`

Codex does not create either external resource. The operator creates the new Supabase project and Render service manually, then records their non-secret references in a private copy of `deployment/qa-inventory.template.json`. Never copy Client A financial, worker, authentication, document, Storage, or other production data into QA.

### QA identity and defaults

Set the following non-secret values in the QA Render build/runtime configuration. Keep the two identity pairs aligned:

```text
HYDROQUALISENSE_ENVIRONMENT=qa
HYDROQUALISENSE_DEPLOYMENT_ID=qa-hydroqualisense
HYDROQUALISENSE_QA_PROJECT_REF=<manually-created-qa-project-ref>
HYDROQUALISENSE_PRODUCTION_PROJECT_REF=<operator-recorded-production-project-ref>
VITE_HYDROQUALISENSE_ENVIRONMENT=qa
VITE_HYDROQUALISENSE_DEPLOYMENT_ID=qa-hydroqualisense
VITE_HYDROQUALISENSE_PUBLIC_FUNNEL_ENABLED=false
VITE_ENABLE_SAMPLE_INVOICES=false
```

The application shows an explicit `QA ENVIRONMENT · SYNTHETIC DATA ONLY` banner in the authenticated and public surfaces. A normal production build defaults to `production` and does not show the QA banner. The public funnel remains off until both the build flag and the database gate are deliberately enabled in QA.

### Blank-project migration sequence

From a clean checkout of the approved repository SHA:

1. Confirm the new QA project reference and set the QA environment assertions above in the operator shell or isolated deployment configuration. Do not put values in the repository.
2. Link this checkout to the new project. The Supabase CLI may prompt for the database password; do not place the password in command arguments or files:

   ```text
   npx.cmd supabase link --project-ref <QA_PROJECT_REF>
   ```

3. Confirm that `supabase/.temp/project-ref` contains the same QA project reference, then apply the complete forward migration chain without seed data:

   ```text
   npm.cmd run qa:db:push -- --project-ref <QA_PROJECT_REF> --confirm-qa
   ```

   The wrapper requires `HYDROQUALISENSE_ENVIRONMENT=qa`, a `qa-` deployment ID, an exact expected/linked project-reference match, and the explicit push confirmation. It invokes `supabase db push --linked --include-all --yes`; it does not create a project or seed production data.

   On the supported Windows runtime, the wrapper launches `npx.cmd` through `ComSpec` because direct `execFileSync("npx.cmd", ...)` can fail with `EINVAL`; do not replace the guarded wrapper with an unguarded CLI command.

   If `supabase link` or the wrapper reports that no Supabase access token is available, stop and complete the operator-owned CLI authentication step (`npx.cmd supabase login`) before continuing. Do not replace the guarded wrapper with direct SQL, dashboard SQL Editor, or MCP migration calls merely because those paths are available; the exact QA target and wrapper assertions are part of the safety boundary.
4. If a deliberate QA-only reset is required, use the guarded wrapper only after confirming the linked project is QA:

   ```text
   npm.cmd run qa:db:reset -- --project-ref <QA_PROJECT_REF> --confirm-qa-reset
   ```

   Reset requires a separate confirmation, uses `--no-seed`, and refuses production identity, missing assertions, mismatched linked projects, or a configured production-project match. Do not use raw `--db-url` or `--linked` reset commands for Client A production.
5. Verify migration history with the CLI and run the application smoke/auth/RLS checks against the QA URL. Record the observed repository SHA, migration level, configuration version, and backup/provider checks in the private QA inventory.

### Guarded company and initial-admin bootstrap

After the complete migration chain is applied, call `public.bootstrap_deployment_company(...)` from an operator-controlled `service_role` SQL/API session. Pass the existing confirmed Auth user UUID and explicit synthetic/client deployment company values. The authority creates the company, singleton deployment configuration, active `COMPANY_ADMIN` membership, and bootstrap audit event atomically; it serializes first bootstrap, refuses configured or historically populated projects, and returns the same result for an exact retry.

Do not grant this function to `anon` or `authenticated`, expose a service-role key to the browser, or replace it with direct `companies`, `deployment_configuration`, or `company_members` table edits. Verify the singleton configuration and membership after the call, then sign in through the normal authenticated application path.

The existing `/demo` route is the safe synthetic-data path for visual/product QA: it mounts no production Auth, Supabase queries, Storage, or company writes; its fictional records are session-local and resettable. The authenticated QA workspace may expose sample invoice presets only when the build is explicitly `qa`; those presets remain fictional and are never copied from Client A. `supabase/seed.sql` remains non-authoritative and empty, so a QA database reset is blank unless an explicitly approved synthetic-data procedure is later added.

### Company document identity bootstrap

The product shell name is not a client legal identity. A new deployment document profile derives only the explicitly supplied deployment company name; address, phone, email, TIN, logo, payment instructions, and terms remain incomplete until an authorized administrator supplies approved values. Existing configured profiles and immutable issued-document snapshots are preserved. Do not backfill HydroQualiSense legal/contact values into an unrelated deployment.

Buyer validation and new supplier-invoice posting must remain blocked when the deployment profile is incomplete or a supplied buyer TIN cannot be compared. Resolve the canonical profile and source evidence through the normal Settings and Supplier Review workflows; do not bypass the guarded verification RPC or invent legal identity.

### Initial deployment AI operator workflow

After `bootstrap_deployment_company(...)` has created the isolated company and initial confirmed Company Admin, the initial operator may use Settings → Deployment AI bootstrap once:

1. Confirm the browser is authenticated to the exact deployment and the operator is the initial Company Admin created by the guarded bootstrap audit.
2. Enter the approved Gemini key in the one-time form. The browser sends it only to the authenticated deployment server; it must not store it in local/session storage or expose `AI_CREDENTIALS_MASTER_KEY`, `SUPABASE_AI_SERVER_KEY`, or `service_role`.
3. The server encrypts the key with `AI_CREDENTIALS_MASTER_KEY`, persists only the encrypted envelope through the service-only `bootstrap_deployment_company_ai_credential` RPC, and records an audit event. The RPC is exact-deployment, initial-operator-bound, idempotent, and refuses replacement after first configuration.
4. Optionally run provider validation. The result distinguishes invalid credential, provider/quota/model/network failure, and server encryption/configuration failure without returning provider details.

Credential rotation, disablement, removal, and ongoing platform maintenance remain platform-operator operations. A normal Company Admin is not granted platform-admin authority by this bootstrap path. Do not manually edit `company_ai_settings` or `company_ai_credentials`.

### Authenticated hosted-QA certification harness

The reusable harness is intentionally opt-in and separate from ordinary PR/demo QA. Install the QA-only browser dependency, then run it only against the isolated QA deployment:

```text
npm.cmd install --no-save --package-lock=false playwright@1.55.0
npx.cmd playwright install chromium
$env:QA_E2E_BASE_URL = 'https://hydroqualisense-qa.onrender.com'
$env:QA_E2E_EMAIL = '<local secret>'
$env:QA_E2E_PASSWORD = '<local secret>'
npm.cmd run qa:hosted
```

Alternatively provide `QA_E2E_STORAGE_STATE_PATH` for a locally captured Playwright state. Treat that file as an authentication secret; it is ignored, never uploaded, and never committed. The harness rejects production hosts, requires QA health/deployment assertions, exercises authenticated deep links, captures sanitized console/request evidence, and can run the explicit synthetic Storage-byte probe with a publishable key only. The manual GitHub workflow is `workflow_dispatch`-only and must use QA environment secrets; it is not part of ordinary PR CI.

### Backup truth boundary

No application-recorded `database_backup_runs`, `database_restore_drills`, or `document_backup_replicas` were manufactured for this phase. The absence of app-level records is not proof that Supabase platform backups are absent or present. The operator must manually confirm provider backup status for each isolated deployment. A database backup alone does not prove that Storage object bytes, metadata, or permission behavior are recoverable.

## Inventory file

Copy `deployment/inventory.template.json` into an operator-controlled inventory location that is private to the deployment team. Validate it before use:

```text
npm.cmd run deployment:validate -- --file path/to/deployment-inventory.json
```

The inventory records identifiers and verification state only:

- client/deployment identifier and client name;
- production URL, Render service reference, and Supabase project reference;
- deployed repository SHA, app version, and migration level;
- explicitly enabled modules and bounded scalar configuration values;
- backup state and last successful/verified timestamps;
- expected release SHA/migration level, configuration compatibility, migration and backup prerequisites, and rollback expectation;
- the last health verification result and unresolved operator notes.

Do not put passwords, tokens, API keys, provider credentials, connection strings, private keys, or secret values in the inventory. Keep those in the isolated Render/Supabase/provider secret stores. The validator rejects secret-shaped field names as a second line of defense.

## Client A Supabase ownership transfer — pre-transfer checklist

This checklist prepares the existing Client A Supabase project for an ownership/organization transfer. It does not transfer the project, create a replacement database, copy or delete production data, change Render configuration, rotate keys, or create a QA project. Prefer transferring the existing project when Supabase supports the intended organization/account move; do not substitute a data-copy migration without a separately approved migration plan.

The current Supabase project-transfer workflow moves a project between organizations rather than between regions. Before scheduling it, confirm the [Supabase Project Transfers prerequisites](https://supabase.com/docs/guides/platform/project-transfer): the operator owns the source organization, is a member of the target organization, and the project has no active GitHub integration, project-scoped roles pointing to it, or log drains. A region change is a separate migration decision and is outside this phase.

Use a private, operator-controlled inventory entry. Do not commit the Client A inventory or any secret values. Before scheduling the transfer, record and independently confirm:

- the existing Supabase project reference;
- the current deployed repository SHA from the Client A Render release, not an assumed local branch SHA;
- the database migration level actually applied to Client A;
- the current Render service reference and production URL;
- the database backup status, last successful backup and last verified recovery evidence;
- Supabase Auth providers, email/confirmation/session settings, existing-user continuity and any client-specific Auth configuration;
- Supabase Auth site URL, redirect allow-list, custom domain and application/email redirect URLs;
- Storage bucket names, visibility, policies, company-prefixed path rules and object metadata;
- preservation evidence for existing Storage object bytes, hashes and issued/source document access;
- deployed Edge Functions, schedules, consumers and configuration names, or an explicit record that none are used;
- enabled database extensions and any client-specific database configuration;
- the singleton deployment configuration and the expected deployment company boundary;
- the Render environment variable names that must remain present, without copying their values;
- Gmail/OAuth, AI, email, backup and other integration/provider configuration and scopes;
- backup and recovery ownership, restore evidence, recovery target and rollback/forward-recovery expectation;
- the post-transfer smoke owner, timing and evidence location.

`supabaseProjectRef`, Render service reference, production URL, deployed SHA and migration level are operational metadata, not substitutes for live confirmation. Never place passwords, database connection strings, service-role keys, API keys, OAuth secrets, encryption keys or tokens in the repository, inventory, command arguments or generated report.

### Read-only transfer preflight

Run the preflight from the checked-out repository with the private inventory file:

```text
npm.cmd run deployment:transfer-preflight -- --file <private-inventory-file> [--deployment <deployment-id>]
```

The command reads only local repository metadata, the supplied inventory and `.env.example`. It does not call Supabase, Render, Storage or provider APIs; it does not inspect environment-variable values; and it never writes the inventory. With multiple deployments, pass `--deployment` explicitly. `--json` is available for a machine-readable report that still contains names/metadata only.

Interpret results as follows:

- `PASS`: the specific local or recorded fact passed; it is not proof that a remote provider check was performed;
- `BLOCKED`: do not proceed until the issue is corrected and the preflight is rerun;
- `MANUAL CHECK REQUIRED`: the tool cannot verify the remote or provider-side fact, so an authorized operator must collect evidence.

Exit code `0` means no check is blocked and no manual check remains in the supplied metadata; exit code `1` means at least one check is blocked; exit code `2` means no recorded blocker was found but manual checks remain. A normal Client A transfer should retain evidence for every manual check before the transfer is scheduled.

The backup check is deliberately strict. A PostgreSQL/database backup does not by itself prove that Supabase Storage object bytes, metadata and permission behavior have been backed up or are restorable. Treat missing Storage-byte evidence as unresolved even when the database backup is current.

## Client A Supabase ownership transfer — immediate post-transfer verification

After the existing project ownership/organization transfer completes, perform only non-destructive checks and record timestamps, actor and evidence. Do not delete, overwrite, rotate, reset, or bulk-rewrite production data as part of verification.

- the production URL loads the expected HydroQualiSense application;
- authentication succeeds and existing Client A users remain usable;
- the singleton deployment company is present and the deployment-company boundary is correct;
- RBAC, RLS and guarded RPC authorization checks succeed, including a rejected wrong-company/insufficient-permission probe;
- Projects load with the expected company scope;
- preserved supplier documents load according to permission;
- Expenses load and show the authoritative supplier payable/cost records;
- Procurement and Purchase Orders load;
- Warehouse inventory and movement history load;
- Payroll loads within the caller's permitted summary/detail boundary;
- Storage source/issued documents can be accessed according to permissions and company-prefixed paths remain intact;
- `/api/health` reports the expected non-secret release metadata, including the explicit deployment environment;
- the observed migration level matches the approved Client A inventory/release record;
- one non-destructive critical workflow smoke test completes and leaves no extra financial/inventory rows;
- the repaired verified supplier invoice -> linked Expense path works for a valid already-verified invoice and creates/reuses exactly one authoritative Expense.

Record any failed or unavailable check as `BLOCKED` or `MANUAL CHECK REQUIRED`; do not convert an unavailable provider check into a pass.

## Approved client lifecycle

1. Qualify the client requirements through the public funnel or a controlled operator conversation.
2. Approve the modules and resolve client-specific business rules that must not be inferred, including unresolved tax, FX, withholding, and accounting-period decisions.
3. Create the dedicated Supabase project/database/Auth/Storage boundary.
4. Create the dedicated Render service and production URL.
5. Configure environment variables and provider secrets in the isolated deployment. Never commit their values.
6. Apply the approved forward migration set from the shared repository.
7. Run the guarded company and initial admin bootstrap through the authorized operator process.
8. Configure private Storage, backup registration, approved integrations, and least-privilege access.
9. Run smoke, authentication/authorization, database/RLS, Storage, and backup verification checks.
10. Record the deployed repository SHA, application version, migration level, enabled configuration, and backup state in the inventory.
11. Confirm the release compatibility and rollback/recovery expectation before handover.
12. Hand over only authorized client access and retain the operator verification record.

The public form is a qualification input only. It never performs steps 3–8 and never receives production credentials.

## Release promotion

Promote a reviewed repository SHA deliberately, one isolated deployment at a time when client prerequisites differ. Before a migration-bearing release, the operator must confirm:

- a verified backup or an explicitly documented reason the release is blocked;
- the migration set is compatible with the client’s current state;
- the client-specific configuration is approved and compatible;
- the deployment’s health, authentication/authorization, database, and backup checks are ready to run.

The 2026-09-08 QA investigation found no migration command in the repository `build` or `start` paths, GitHub deployment workflows, or application runtime. If a routine Render application redeploy advances a production migration, inspect the Render service’s external pre-deploy/release command and remove the implicit database promotion. Keep migration promotion as a separately approved operation so QA may be ahead of an individual client deployment.

Set these non-secret runtime values in the isolated Render environment so `/api/health` can report what is actually running. Leave them unset rather than inventing a value when the release state is unknown:

```text
HYDROQUALISENSE_DEPLOYMENT_ID=
HYDROQUALISENSE_APP_VERSION=
HYDROQUALISENSE_MIGRATION_LEVEL=
HYDROQUALISENSE_CONFIGURATION_VERSION=
```

Render’s `RENDER_GIT_COMMIT` is also accepted when it is a full 40-character commit SHA. The health endpoint reports only release metadata and never returns secrets or provider configuration values.

Verify a deployed entry against its recorded expectation:

```text
npm.cmd run deployment:verify -- --file path/to/deployment-inventory.json --deployment <deployment-id>
```

Use `--record` only from the operator-controlled inventory workspace after reviewing the output. A result is `PASS` only when the health endpoint is successful and the manifest’s expected SHA, migration level, and configuration version are all reported and match. `UNKNOWN` means the deployment is healthy but one or more identity/version values are not explicitly recorded; it is not a release certification. `FAIL` requires investigation.

## Rollback and recovery

Application builds may be returned to a previous compatible build when the database state supports it. Database migrations remain forward-only: do not claim that restoring an older application build reverses an irreversible migration. If a migration has already been applied, use the documented forward recovery/correction path, restore drill, or isolated recovery target appropriate to the incident. Record the result and unresolved limitations in the inventory.

This phase does not provision Render or Supabase through the public website and does not create a provider secret store. External provisioning, backup/restore drills, fleet promotion, and rollback drills remain explicit operator actions and must be evidenced separately for each client deployment.
