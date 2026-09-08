# HydroQualiSense Current Handoff

Status: **CURRENT — QA LIVE INITIALIZATION NEXT**  
Date: **2026-09-08**  
Repository: `Juvialski/InvoiceApp`

Use this with `AGENTS.md`, `docs/AGENT_EXECUTION_EFFICIENCY.md`, `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`, `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`, and `docs/HYDROQUALISENSE_DEPLOYMENT_RUNBOOK.md`. Live repository state remains authoritative.

## Current repository state

Runtime baseline after merged PR #101:

`2daaff92b0f597eb3f52eeb06ecb0a03cf4dd881`

Completed recent phases:

- PR #95 — R5 Cross-Module Integration & Data-Contract Hardening.
- PR #96 — Warehouse Inventory & Project Allocation.
- PR #97 — Post-Warehouse Operational Integration.
- PR #99 — public client funnel + isolated deployment/release productization foundation.
- PR #100 — verified supplier invoice -> Expense repair + Client A transfer/readiness tooling.
- PR #101 — truthful supplier Expense-link readiness, guarded legacy re-review, explicit QA deployment identity, QA database push/reset wrappers, QA inventory template, and QA runbook guidance.

PR #101 exact head `b416686009fea69df63a28191e0c616c7b4663ac` passed the four protected checks before squash merge:

- Application Validation & Build;
- Database Migrations & Upgrade Suite;
- chromium-demo-qa;
- Graph and Source Contract Consistency.

## Live deployment topology

HydroQualiSense remains:

`one source repository -> many isolated client deployments`

### Client A production

- public URL: `https://hydroqualisense.com`
- Supabase project ref: `qijjshdwiylojvqojxyz`
- operational role: real Client A production
- current database migration level verified on 2026-09-08: `20260908024017_supplier_invoice_repair_guards`
- public prospect funnel must remain disabled unless a future explicit production decision changes that.
- production data must never be copied into QA merely for demos/testing.

Recommended explicit production identity values:

```text
HYDROQUALISENSE_ENVIRONMENT=production
HYDROQUALISENSE_DEPLOYMENT_ID=client-a-prod
VITE_HYDROQUALISENSE_ENVIRONMENT=production
VITE_HYDROQUALISENSE_DEPLOYMENT_ID=client-a-prod
VITE_HYDROQUALISENSE_PUBLIC_FUNNEL_ENABLED=false
VITE_ENABLE_SAMPLE_INVOICES=false
HYDROQUALISENSE_MIGRATION_LEVEL=20260908024017
```

Do not place secret values in repository documentation.

### QA

- Render URL: `https://hydroqualisense-qa.onrender.com`
- Supabase project ref: `vrpuznofrntyqsbugrib`
- role: isolated QA + temporary demo environment
- current state verified on 2026-09-08: Supabase project is active, has one Auth user, and has **zero HydroQualiSense public application tables / zero applied repository migrations**.
- therefore the current QA blocker is database initialization/bootstrap, not email confirmation.

Recommended explicit QA identity values after PR #101:

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

## Supplier invoice -> Expense status

PR #101 closes the misleading UI state that previously treated every `VERIFIED` unlinked invoice as ready to create an Expense.

Current rule:

- supplier invoice remains preserved source evidence;
- Expense remains the authoritative payable / Actual Cost row;
- `READY_TO_LINK` requires the guarded posting facts to be resolved, including canonical Vendor identity, invoice number/date/currency/positive total, Expense category/description, buyer compatibility, and valid allocation context where present;
- an already-verified invoice without an active Expense may be deliberately reopened to resolve missing facts;
- an invoice with an active linked Expense cannot be reopened through ordinary source editing;
- posting remains idempotent and must not create duplicate Actual Cost/payable truth.

The production example that exposed the issue had valid project allocation but unresolved canonical Vendor and Expense description. Do not hard-code or silently auto-repair that production row; resolve it through the human review workflow.

## NEXT — initialize and certify the QA deployment

This is the immediate next bounded phase before Worker Registration.

Goals:

1. update QA Render with the explicit PR #101 QA identity variables;
2. link an approved checkout to Supabase QA ref `vrpuznofrntyqsbugrib`;
3. apply the full forward migration chain using the guarded QA wrapper;
4. bootstrap one QA company and the already-confirmed QA Auth user through the existing guarded company/admin bootstrap authority — no manual unsafe table edits;
5. configure required Storage/Auth/provider settings for QA without copying production secrets/data;
6. verify RLS/RBAC/company boundary, `/api/health`, Storage, major read paths, and one safe supplier-review workflow;
7. seed only synthetic/demo data through an explicitly QA-only path;
8. record the actual QA migration level and release identity after successful initialization.

Preferred migration command after linking and setting the required local operator assertions:

```text
npm.cmd run qa:db:push -- --project-ref vrpuznofrntyqsbugrib --confirm-qa
```

Do not use the destructive reset wrapper unless a deliberate QA reset is required. Never run QA wrappers against Client A production.

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
6. inspect live QA Supabase migration state before assuming initialization has happened;
7. generate one bounded `agent:context` packet if implementation is required;
8. use Docker/local Supabase for DB-contract changes;
9. validate focused -> affected, then exact-head CI;
10. local Codex opens PRs but does not merge its own PR; ChatGPT reviews and merges safe exact heads automatically.
