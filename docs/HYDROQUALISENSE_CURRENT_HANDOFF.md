# HydroQualiSense Current Handoff

Status: **CURRENT — QA CERTIFICATION NOT READY (LIVE INITIALIZATION BLOCKED)**
Date: **2026-09-08**  
Repository: `Juvialski/InvoiceApp`

Use this with `AGENTS.md`, `docs/AGENT_EXECUTION_EFFICIENCY.md`, `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`, `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`, and `docs/HYDROQUALISENSE_DEPLOYMENT_RUNBOOK.md`. Live repository state remains authoritative.

## Current repository state

Runtime baseline after merged PR #105:

`8c74bf1101aaad92d7e05170f7898be5988f881d`

Completed recent phases:

- PR #95 — R5 Cross-Module Integration & Data-Contract Hardening.
- PR #96 — Warehouse Inventory & Project Allocation.
- PR #97 — Post-Warehouse Operational Integration.
- PR #99 — public client funnel + isolated deployment/release productization foundation.
- PR #100 — verified supplier invoice -> Expense repair + Client A transfer/readiness tooling.
- PR #101 — truthful supplier Expense-link readiness, guarded legacy re-review, explicit QA deployment identity, QA database push/reset wrappers, QA inventory template, and QA runbook guidance.
- PR #103 — streamlined supplier invoice repair UX with inline canonical Vendor resolution, human-confirmed Expense description repair, direct guarded posting, clearer delete/void/archive actions, and demo/responsive parity. Review also corrected the shared invoice/Expense permanent-delete confirmation so it remains entity-aware. No migration or database contract changed.
- PR #105 — guarded first-company/deployment bootstrap authority for a blank isolated deployment, with idempotency, serialization, audit coverage, and browser-role execute denial.

PR #103 final exact head `722798b0e485c8288304e2e145db2de4528d2634` passed all four protected checks before squash merge:

- Application Validation & Build;
- Database Migrations & Upgrade Suite;
- chromium-demo-qa;
- Graph and Source Contract Consistency.

The exact-head database suite included static migration invariants, isolated local Supabase startup, clean migration replay, pgTAP schema assertions, and the historical-data upgrade-path suite.

## Live deployment topology

HydroQualiSense remains:

`one source repository -> many isolated client deployments`

Supabase connector, public health, and repository state were re-verified on 2026-09-08 during the QA certification attempt. No QA or production write was performed by Codex during this attempt. Production remains read-only for this phase.

### Client A production

- public URL: `https://hydroqualisense.com`
- Supabase project ref: `qijjshdwiylojvqojxyz`
- operational role: real Client A production
- current project health: `ACTIVE_HEALTHY`
- a read-only query during this checkpoint observed the actual latest migration as `20260908051740_deployment_bootstrap_authority`, although the prior handoff recorded `20260908024017_supplier_invoice_repair_guards`;
- production `/api/health` still reports `20260908005120`, so deployed release metadata is stale relative to the observed database head and requires a separate operator-controlled reconciliation;
- public prospect funnel must remain disabled unless a future explicit production decision changes that.
- production data must never be copied into QA merely for demos/testing.
- during the QA initialization/certification phase, production Supabase is **read-only by default**. Do not perform DDL/DML, reset, seed, Auth/Storage mutations, secret/config writes, or side-effecting RPC calls unless a separate explicit production change is approved.

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
- current state re-verified on 2026-09-08: one confirmed Auth user, **zero HydroQualiSense public application/base tables and zero applied repository migrations**;
- QA `/api/health` returned HTTP 200 with the repository SHA, but reported `deploymentId=qa` and null environment, migration, and configuration metadata instead of the required explicit QA identity;
- unauthenticated `/dashboard` rendered the Auth sign-in screen and `/api/storage/health` returned HTTP 401;
- therefore the current QA blockers are guarded database initialization/bootstrap and deployment/provider identity configuration, not repository migration compatibility.
- QA is authorized for read/write initialization and certification in the next bounded phase.

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

The repository migration chain passed clean local replay, pgTAP, static migration invariants, upgrade fixtures, and bounded application tests. Live QA certification did not proceed because the approved guarded CLI path could not link the checkout: the installed Supabase CLI (`2.117.0`) reported that no access token was available. The production ref was independently rejected by the QA wrapper before any CLI call.

The next operator action is to authenticate the CLI (`npx.cmd supabase login`), link only `vrpuznofrntyqsbugrib`, set the documented QA assertions, and rerun `npm.cmd run qa:db:push -- --project-ref vrpuznofrntyqsbugrib --confirm-qa`. Do not substitute direct SQL/MCP migration application for the guarded wrapper.

Additional unresolved certification checks:

- Auth Site URL/redirect allow-list and leaked-password protection require provider-side confirmation; the dashboard session available to this run was signed out.
- Storage buckets, company-prefixed object paths, authenticated upload/read behavior, and live RLS/RBAC/RPC behavior cannot be certified while QA has no repository migrations.
- QA Supabase security advisors currently report three WARN findings on the blank project: the provider `public.rls_auto_enable()` event-trigger function is executable by browser roles, and Auth leaked-password protection is disabled. Investigate/accept only with provider evidence after initialization.
- QA Render identity must be corrected to the documented `qa-hydroqualisense`/`qa` values and redeployed before release verification can be PASS.

No production mutation was performed by Codex during this QA attempt. Production had already advanced to `20260908051740_deployment_bootstrap_authority` through an operator-triggered Render redeploy before this checkpoint, and that observed state is now the accepted production baseline for further read-only verification. Worker Registration remains blocked until a later run reaches `QA CERTIFICATION: READY`.

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

## NEXT — initialize and certify the QA deployment

This is the immediate next bounded phase before Worker Registration.

Goals:

1. update/verify QA Render with the explicit QA identity variables;
2. link an approved checkout to Supabase QA ref `vrpuznofrntyqsbugrib`;
3. apply the full forward migration chain using the guarded QA wrapper;
4. bootstrap one QA company and the already-confirmed QA Auth user through the existing guarded company/admin bootstrap authority — no manual unsafe table edits;
5. configure required Storage/Auth/provider settings for QA without copying production secrets/data;
6. verify RLS/RBAC/company boundary, `/api/health`, Storage, major read paths, critical RPC behavior, and one safe supplier-review workflow;
7. seed only synthetic/demo data through an explicitly QA-only path;
8. run relevant Supabase security/performance advisor checks after initialization and investigate material findings;
9. record the actual QA migration level, release identity, bootstrap method, and certification evidence after successful initialization;
10. re-confirm Client A production health/migration state read-only and unchanged.

Preferred migration command after linking and setting the required local operator assertions:

```text
npm.cmd run qa:db:push -- --project-ref vrpuznofrntyqsbugrib --confirm-qa
```

Before any live write, inspect the current wrapper/CLI help and prove the exact target/project assertions. Do not use the destructive reset wrapper unless a deliberate QA reset is required. Never run QA wrappers against Client A production.

## After QA is healthy

Continue in this order unless the user reprioritizes:

1. Worker Registration foundation — project/site QR -> `PENDING` worker submission -> supervisor/admin duplicate/identity/project review -> canonical Worker/payroll/project linkage.
2. Site Attendance state machine + registered site/device + correction/offline/duplicate-punch semantics.
3. Face Recognition only after explicit consent/privacy, retention/deletion, liveness, confidence/fallback, device binding, offline/concurrency and payroll-boundary design.
4. other client-confirmed requirements.
5. final pre-production security/data-integrity certification before broad multi-client rollout.

## Permanent invariants

1. `one deployment -> one client company -> active membership/RBAC -> permitted workflows`.
2. One repository may serve many isolated client deployments; unrelated clients do not share operational databases.
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
6. inspect live QA Supabase migration/state before assuming initialization has happened;
7. treat QA as the only read/write Supabase target for the initialization/certification phase and production as read-only by default;
8. generate one bounded `agent:context` packet if implementation is required;
9. use Docker/local Supabase when a DB contract/migration must change; do not rerun broad historical validation merely because a new phase starts;
10. validate focused -> affected, then exact-head CI when repository changes are made;
11. local Codex opens PRs but does not merge its own PR; ChatGPT reviews and merges safe exact heads automatically.
