# HydroQualiSense Current Handoff

Status: **CURRENT — QA CERTIFICATION NOT READY (INITIALIZATION COMPLETE; EXTERNAL GATES BLOCKED)**
Date: **2026-09-08**  
Repository: `Juvialski/InvoiceApp`

Use this with `AGENTS.md`, `docs/AGENT_EXECUTION_EFFICIENCY.md`, `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`, `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`, and `docs/HYDROQUALISENSE_DEPLOYMENT_RUNBOOK.md`. Live repository state remains authoritative.

## Current repository state

Runtime baseline after merged PR #106:

`5d7ddd62be627ae8ae79cc9f6965b5554006cb97`

Completed recent phases:

- PR #95 — R5 Cross-Module Integration & Data-Contract Hardening.
- PR #96 — Warehouse Inventory & Project Allocation.
- PR #97 — Post-Warehouse Operational Integration.
- PR #99 — public client funnel + isolated deployment/release productization foundation.
- PR #100 — verified supplier invoice -> Expense repair + Client A transfer/readiness tooling.
- PR #101 — truthful supplier Expense-link readiness, guarded legacy re-review, explicit QA deployment identity, QA database push/reset wrappers, QA inventory template, and QA runbook guidance.
- PR #103 — streamlined supplier invoice repair UX with inline canonical Vendor resolution, human-confirmed Expense description repair, direct guarded posting, clearer delete/void/archive actions, and demo/responsive parity. Review also corrected the shared invoice/Expense permanent-delete confirmation so it remains entity-aware. No migration or database contract changed.
- PR #105 — guarded first-company/deployment bootstrap authority for a blank isolated deployment, with idempotency, serialization, audit coverage, and browser-role execute denial.
- PR #106 — recorded the previously blocked QA certification checkpoint.

PR #103 final exact head `722798b0e485c8288304e2e145db2de4528d2634` passed all four protected checks before squash merge:

- Application Validation & Build;
- Database Migrations & Upgrade Suite;
- chromium-demo-qa;
- Graph and Source Contract Consistency.

The exact-head database suite included static migration invariants, isolated local Supabase startup, clean migration replay, pgTAP schema assertions, and the historical-data upgrade-path suite.

## Live deployment topology

HydroQualiSense remains:

`one source repository -> many isolated client deployments`

Supabase connector, public health, repository state, and QA runtime state were re-verified on 2026-09-08. Codex performed only the approved QA migration, bootstrap, synthetic QA workflow, and rollback-scoped authorization probes. Production remained read-only.

### Client A production

- public URL: `https://hydroqualisense.com`
- Supabase project ref: `qijjshdwiylojvqojxyz`
- operational role: real Client A production
- current project health: `ACTIVE_HEALTHY`
- a read-only query during this checkpoint observed the actual latest migration as `20260908051740_deployment_bootstrap_authority`;
- production `/api/health` returned HTTP 200 but still reports repository SHA `8c74bf1101aaad92d7e05170f7898be5988f881d` and migration level `20260908005120`, stale relative to the observed database head and requiring separate operator-controlled reconciliation;
- public prospect funnel must remain disabled unless a future explicit production decision changes that.
- production data must never be copied into QA merely for demos/testing.
- during the QA certification phase, production Supabase is **read-only by default**. Do not perform DDL/DML, reset, seed, Auth/Storage mutations, secret/config writes, or side-effecting RPC calls unless a separate explicit production change is approved.

Recommended explicit production identity values:

```text
HYDROQUALISENSE_ENVIRONMENT=production
HYDROQUALISENSE_DEPLOYMENT_ID=client-a-prod
VITE_HYDROQUALISENSE_ENVIRONMENT=production
VITE_HYDROQUALISENSE_DEPLOYMENT_ID=client-a-prod
VITE_HYDROQUALISENSE_PUBLIC_FUNNEL_ENABLED=false
VITE_ENABLE_SAMPLE_INVOICES=false
HYDROQUALISENSE_MIGRATION_LEVEL=20260908051740
```

Do not place secret values in repository documentation.

### QA

- Render URL: `https://hydroqualisense-qa.onrender.com`
- Supabase project ref: `vrpuznofrntyqsbugrib`
- role: isolated QA + temporary demo environment
- current project health: `ACTIVE_HEALTHY`
- current state after the guarded push: `ACTIVE_HEALTHY`, one confirmed Auth user, the complete repository migration chain through `20260908051740_deployment_bootstrap_authority`, one synthetic QA company/configuration/admin membership/audit, and synthetic supplier-review data only;
- QA `/api/health` returned HTTP 200 with repository SHA `5d7ddd62be627ae8ae79cc9f6965b5554006cb97` and `environment=qa`, but still reports `deploymentId=qa` instead of `qa-hydroqualisense` and null migration/configuration metadata;
- unauthenticated `/projects` deep-linking rendered the Auth sign-in screen; an authenticated browser session/credentials were not available for hosted sign-in or byte-level Storage upload/read verification;
- QA initialization/bootstrap is complete. Current blockers are Render identity/release configuration, provider Auth checks, authenticated hosted-flow evidence, migration-promotion controls, and backup/recovery evidence.
- QA remains the only authorized read/write environment for bounded certification probes and synthetic QA data; do not repeat initialization unless a newer approved migration requires it.

Recommended explicit QA identity values:

```text
HYDROQUALISENSE_ENVIRONMENT=qa
HYDROQUALISENSE_DEPLOYMENT_ID=qa-hydroqualisense
HYDROQUALISENSE_QA_PROJECT_REF=vrpuznofrntyqsbugrib
HYDROQUALISENSE_PRODUCTION_PROJECT_REF=qijjshdwiylojvqojxyz
VITE_HYDROQUALISENSE_ENVIRONMENT=qa
VITE_HYDROQUALISENSE_DEPLOYMENT_ID=qa-hydroqualisense
VITE_HYDROQUALISENSE_PUBLIC_FUNNEL_ENABLED=false
VITE_ENABLE_SAMPLE_INVOICES=false
```

The QA Supabase Auth Site URL / redirect allow-list should point to `https://hydroqualisense-qa.onrender.com` for hosted confirmation/reset flows. This provider-side setting is manual and is not controlled by repository migrations.

## QA certification checkpoint — 2026-09-08

`QA CERTIFICATION: NOT READY`

The installed Supabase CLI was `2.117.0` and authenticated. The QA wrapper rejected the production ref before CLI invocation, linked exactly `vrpuznofrntyqsbugrib`, and initially failed on Windows because `execFileSync("npx.cmd", ...)` returned `EINVAL`. The focused wrapper fix invokes `npx.cmd` through `ComSpec`; the guarded push then completed the full approved chain through `20260908051740_deployment_bootstrap_authority`.

Bootstrap used `public.bootstrap_deployment_company(...)` with the existing confirmed Auth user and synthetic QA identity. Verification observed exactly one company, one singleton configuration, one active confirmed `COMPANY_ADMIN` membership, and one bootstrap audit. Exact retry returned `idempotent=true`; a conflicting retry failed closed with SQLSTATE `55000`; `anon` and `authenticated` lacked execute while `service_role` had execute.

Runtime RLS/RBAC/RPC probes passed for active admin access, missing membership, rollback-scoped suspended membership, rollback-scoped `VIEWER` permission limits, anonymous REST denial, wrong-company Storage insert denial, and guarded supplier posting. The synthetic supplier workflow created exactly one `4321.50 PHP` Expense projected to the synthetic QA project; retry was idempotent, and a deliberate VOID retained the row with one `EXPENSE_VOIDED` audit event. The synthetic project used `NON_VAT` only as an explicit fixture value; this is not a production tax-policy decision.

Storage metadata showed four private buckets: `email-originals`, `engineering-documents`, `invoice-originals`, and `payroll-import-sources`. Company-prefixed policy simulation passed, but authenticated browser upload/read of actual bytes remains unverified because no hosted QA credentials/session were available. Database, Storage-byte, and provider recovery evidence was not manufactured.

Security advisors after initialization reported 7 INFO `rls_enabled_no_policy` notices, 2 WARN anonymous `SECURITY DEFINER` notices, 153 WARN authenticated `SECURITY DEFINER` notices, and 1 WARN for disabled Auth leaked-password protection. `public.rls_auto_enable()` is a provider-owned event-trigger function absent from the repository; `submit_public_prospect` is an intentional anonymous-only RPC with the QA database gate verified `enabled=false`. The remaining provider Auth warning requires explicit operator confirmation and is not waived.

Remaining blockers and exact actions:

- Set QA Render `HYDROQUALISENSE_DEPLOYMENT_ID=qa-hydroqualisense`, `HYDROQUALISENSE_MIGRATION_LEVEL=20260908051740`, and the documented `VITE_*` QA identity values, then redeploy. Record an approved configuration version only when one exists; do not invent one.
- In QA Supabase Auth, set the Site URL and redirect allow-list for `https://hydroqualisense-qa.onrender.com`, and enable leaked-password protection. Record provider evidence.
- Sign in with the confirmed QA user and verify hosted authenticated deep links, permissions, Storage byte upload/read, and major read paths. Do not change the user password or create another user merely for this certification.
- Obtain separate PostgreSQL backup/restore, Storage-object recovery, deployment reconstruction/rollback, and required secret/configuration recovery evidence. App-level recovery tables are empty and do not prove provider recovery.
- Inspect the Render service’s external pre-deploy/release command. The repository `build`/`start` paths contain no migration push; routine application redeploy must not run database promotion. Move migration promotion to an explicit, separately approved QA/production operation.

Production remained read-only throughout this run. Codex caused no production mutation. Worker Registration remains blocked until a later run reaches `QA CERTIFICATION: READY`.

## Supplier invoice -> Expense status

PR #101 established truthful posting readiness and guarded legacy repair. PR #103 makes that repair path direct and understandable without weakening the same financial/source-of-truth boundaries.

Current rule:

- supplier invoice remains preserved source evidence;
- Expense remains the authoritative payable / Actual Cost row;
- `READY_TO_LINK` requires the guarded posting facts to be resolved, including canonical Vendor identity, invoice number/date/currency/positive total, Expense category/description, buyer compatibility, and valid allocation context where present;
- an already-verified invoice without an active Expense may be deliberately reopened to resolve missing facts;
- canonical Vendor selection/creation and Expense-description repair require explicit human confirmation;
- once complete, the guarded posting action is available directly from Supplier Review;
- an invoice with an active linked Expense cannot be reopened through ordinary source editing;
- invoice lifecycle actions remain guarded and distinguish permanent deletion of truly unused records from voiding and visibility-only archive/restore;
- posting remains idempotent and must not create duplicate Actual Cost/payable truth.

The production example that exposed the issue had valid project allocation but unresolved canonical Vendor and Expense description. Do not hard-code or silently auto-repair that production row; resolve it through the human review workflow.

## NEXT — complete QA certification

This is the immediate next bounded phase before Worker Registration.

Remaining goals:

1. verify QA Render reports the intended `qa` environment, `qa-hydroqualisense` deployment ID, truthful migration level, and any approved configuration version;
2. verify QA Supabase Auth Site URL/redirect allow-list and leaked-password protection with provider evidence;
3. use the confirmed QA user to verify hosted authenticated deep links, major read paths, effective permissions, and byte-level Storage upload/read using synthetic data only;
4. investigate material Supabase advisor findings against the initialized schema without weakening RLS/RBAC or broadening privileged function grants;
5. obtain separate database recovery, Storage-object recovery, deployment reconstruction/rollback, and required secret/configuration recovery evidence;
6. inspect and harden the external Render migration-promotion path so routine app redeploy cannot silently decide DB promotion;
7. re-confirm Client A production health/migration state read-only and unchanged.

The full migration chain is already applied through `20260908051740_deployment_bootstrap_authority`. Do not rerun `qa:db:push` solely because certification continues. Use the guarded wrapper again only if a newer approved merged migration must be applied, after re-verifying the exact QA target and current wrapper/CLI help. Never run QA wrappers against Client A production.

## After QA is healthy

Continue in this order unless the user reprioritizes:

1. Worker Registration foundation — project/site QR -> `PENDING` worker submission -> supervisor/admin duplicate/identity/project review -> canonical Worker/payroll/project linkage.
2. Site Attendance state machine + registered site/device + correction/offline/duplicate-punch semantics.
3. Face Recognition only after explicit consent/privacy, retention/deletion, liveness, confidence/fallback, device binding, offline/concurrency and payroll-boundary design.
4. other client-confirmed requirements.
5. final pre-production security/data-integrity certification before broad multi-client rollout.

## Permanent invariants

1. `one deployment -> one client company -> active membership/RBAC -> permitted workflows`.
2. One repository may serve many isolated deployments; unrelated clients do not share operational databases.
3. Keep company-scoped RLS, permissions, company-bound integrity, audit history, and company-prefixed Storage paths.
4. Supplier evidence linked to an Expense must not become duplicate payable/Actual Cost truth.
5. Actual Cost and Committed Cost remain distinct.
6. Client Invoices/Collections remain distinct from supplier obligations/project Actual Cost.
7. Preserve original currency and never invent FX.
8. Finalized/verified/issued/paid/collected/voided/reversed history changes only through deliberate auditable lifecycle/correction paths.
9. Imported/AI identity is evidence, not automatically canonical identity when ambiguous.
10. Inventory stock remains explainable from authoritative movements.
11. Biometric attendance requires explicit privacy/identity/device/correction/audit semantics before production use.

Still unresolved by design: VAT rate, VAT-inclusive vs VAT-exclusive contract value, withholding/BIR classification, automatic/external FX-provider policy, and broader accounting-period policy. Do not infer them.

## Fresh-session bootstrap

For the next chat/session:

1. inspect exact current `main`, open PRs, and exact-head CI;
2. read live `AGENTS.md`;
3. read `docs/AGENT_EXECUTION_EFFICIENCY.md`;
4. read `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`;
5. read this handoff and `docs/HYDROQUALISENSE_DEPLOYMENT_RUNBOOK.md`;
6. inspect live QA Supabase migration/state before assuming initialization or certification state;
7. treat QA as the only read/write Supabase target for the certification phase and production as read-only by default;
8. generate one bounded `agent:context` packet if implementation is required;
9. use Docker/local Supabase when a DB contract/migration must change; do not rerun broad historical validation merely because a new phase starts;
10. validate focused -> affected, then exact-head CI when repository changes are made;
11. local Codex opens PRs but does not merge its own PR; ChatGPT reviews and merges safe exact heads automatically.
