# HydroQualiSense Current Handoff

Status: **CURRENT — CLIENT FUNNEL + ISOLATED DEPLOYMENT PRODUCTIZATION NEXT**
Date: **2026-09-07**
Repository: `Juvialski/InvoiceApp`

Use this with `AGENTS.md`, `docs/AGENT_EXECUTION_EFFICIENCY.md`, `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`, and `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`. Live repository state remains authoritative if anything here becomes stale.

## Current repository state

- R4 is complete through PR #94.
- R5 implementation is complete in **PR #95 — `feat: R5 cross-module integration and data-contract hardening`**.
- Warehouse Inventory & Project Allocation is complete in merged **PR #96**.
- Post-Warehouse Operational Integration is complete in **PR #97 — `feat: integrate post-Warehouse operational workflows`**, including supplier allocation/Expense reconciliation, reviewed purchased-material intake, canonical Equipment authority, and the supplier Expense projection-guard follow-up hardening.
- The next bounded implementation phase is **Public client funnel + repeatable isolated deployment/provisioning tooling**.
- Protected workflow evidence must always belong to the exact current PR head; do not reuse CI from an older head after a fix.
- GitHub branch protection and review gates must not be weakened merely to force a merge.

## R5 outcome

R5 established the integration/security baseline that was required before another major operational domain.

### Canonical Vendor and supplier continuity

- `public.vendors` is the canonical Vendor master.
- Derived/extracted supplier text remains evidence, not a competing master directory.
- Vendor creation/update/deactivation is guarded and auditable.
- Vendor identity resolution is company-scoped and protected against concurrent duplicate creation.
- Historical Vendor relationships are preserved instead of being erased by ordinary deletion.

### Supplier Invoice -> Expense truth

- Supplier verification fails closed if required authoritative facts remain unresolved.
- Unknown source amount/date/currency/category and other required accounting facts are not silently defaulted.
- Canonical Vendor resolution is required before authoritative supplier verification.
- Supplier-derived Expense financial/provenance fields are protected from ordinary drift.
- Receipt/source-document duplicate creation is protected with DB-backed idempotency/integrity.

### Extraction and tax uncertainty

- Unknown extracted financial values remain unknown instead of being converted to zero.
- No hard-coded VAT rate is used to certify source-document arithmetic.
- Direct AI extraction validates base64/file type/MIME/magic bytes before model calls.
- AI extraction/classification is protected by durable request budgets plus bounded request handling.

### Issued documents and Gmail

- Issued Purchase Order and Client Invoice emails use trusted server-rendered immutable snapshot PDF bytes.
- Browser-provided PDF bytes are not accepted as authoritative issued artifacts.
- Durable send intents and idempotency keys protect retries/recovery.
- Send audit records are bound to completed intents and the authenticated sender.
- Gmail history/import work is bounded to avoid unbounded pagination/payload amplification.

Known external limitation: a real Gmail send still requires a connected Google account/OAuth consent and is not proven by CI alone.

### Audit/RBAC/RLS/security

- Review-event actor attribution is protected against spoofed `user_id` values.
- Vendor/send/audit direct-table bypasses were tightened.
- Unnecessary private SECURITY DEFINER exposure and legacy anonymous mutation grants were reduced.
- UI/server/RPC/RLS permission contracts were tightened for consequential document sending.
- Final database security inventory coverage was added for policies, grants, SECURITY DEFINER functions, triggers, constraints and indexes.
- Production response security headers and diagnostic exposure were hardened.

### Storage and backup

- Manual source-document race recovery resolves the correct canonical source type.
- Backup registration failures remain durable/observable rather than silently disappearing.
- Backup race recovery checks exact manifest identity.
- Restore drills use isolated server-generated targets rather than caller-controlled paths.

## Warehouse + Post-Warehouse outcome

Warehouse remains the authoritative stock domain and project allocation is represented through explainable movement history rather than destructive balance edits.

Post-Warehouse Integration closes the surrounding operational seams without introducing duplicate master records:

- canonical positive supplier-invoice allocations reconcile the existing supplier-derived Expense project/cost-code convenience projection;
- a supplier-derived Expense remains one authoritative payable/Actual Cost record and its financial/provenance fields remain immutable outside deliberate correction workflows;
- the reconciliation-only database flag is accepted only from privileged internal execution, so an authenticated caller cannot set the same GUC to bypass the Expense correction trigger;
- source/extraction evidence enters a human-reviewed purchased-material intake and then the existing Procurement receipt model with source/invoice provenance;
- PO line and exact-unit canonical Inventory Item confirmation remain human-controlled before receipt creation;
- partial receipt quantities remain explicit and Warehouse posting remains a separate deliberate exact-item movement;
- the company Equipment Registry is canonical, with guarded assign/transfer/return/lifecycle operations, auditable assignment/event history, derived current state, RLS, permissions, and concurrency protection;
- existing project Equipment rows and Daily Site Log observations remain legacy/evidence context rather than competing assignment authority.

Still undecided and intentionally excluded: inventory valuation/FIFO, depreciation, reservation semantics, serial/lot policy, reorder policy, barcode/QR rules, automatic receipt-to-stock posting, and broader accounting-period policy.

## Next implementation phase — Public client funnel + repeatable isolated deployment/provisioning tooling

HydroQualiSense must support multiple potential client companies through **isolated deployments**, not through an unrelated-company tenant switcher inside one operational deployment.

Architecture:

`one repository -> many isolated client deployments`

Each production client gets:

- one Render service/application deployment;
- one dedicated Supabase project/database/Auth/Storage boundary;
- separate environment configuration/secrets;
- independent deployment/version/backup state;
- no in-app switch between unrelated client companies.

The next phase should establish a production-honest, demo-ready productization slice:

- a public HydroQualiSense landing/requirements intake that is clearly separated from authenticated operational data;
- bounded intake for company/contact information, modules of interest, approximate workforce/project scale, pain points/integration needs, desired timeline, and demo/contact request;
- no financial source documents, employee records, biometrics, credentials, or other operationally sensitive data in the general public intake;
- no automatic creation of production infrastructure, companies, privileged users, credentials, or secrets from a public submission;
- repeatable operator-controlled provisioning/checklist or guarded tooling for one Render service + one Supabase project per approved client;
- a deployment inventory that can record client/deployment identity, production URL/service references, deployed repository SHA, migration level, backup state, bounded feature/configuration state, and health/release verification without plaintext secrets;
- deliberate release promotion across deployments instead of assuming every client upgrades simultaneously;
- smoke/auth/database/backup verification and upgrade/rollback readiness as explicit operator steps.

See `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md` for the authoritative productization contract.
The operator implementation checklist is in `docs/HYDROQUALISENSE_DEPLOYMENT_RUNBOOK.md`.

## Later confirmed major domain — Worker Registration & Attendance

Recommended dependency order:

1. project/site registration QR;
2. worker submission as `PENDING`;
3. supervisor/admin duplicate/identity/project review;
4. create/link canonical Worker + payroll/project assignment;
5. registered site/device;
6. controlled attendance state machine + corrections/offline sync;
7. face-recognition layer only after privacy/security design.

Face recognition must include explicit consent/access, retention/deletion/re-enrollment, liveness/anti-spoof, image quality, confidence thresholds, audited supervisor fallback, device/site binding, offline/concurrency handling and payroll-integration tests. Uncertain matches must never guess.

## Final security certification

Before broad production rollout across clients, run a dedicated final certification phase after the major domains stabilize. Include final DB security inventory, cross-company/permission attack tests, financial/inventory/attendance lifecycle and concurrency tests, storage backup/restore, secrets/configuration, dependency audit, public endpoints/security headers, external-token scopes, browser authorization/deep links, deployment upgrade/rollback, and biometric privacy review once applicable.

This final phase supplements rather than replaces security validation during each implementation phase.

## Permanent invariants

1. `one deployment -> one client company -> active membership/RBAC -> permitted workflows`.
2. One repository may serve many isolated client deployments; unrelated clients do not share an operational database/deployment.
3. Keep company-scoped RLS, permission checks, company-bound integrity and audit boundaries.
4. No double counting across supplier Invoice, Expense, PO, Client Billing, Collection or Cash truth.
5. Actual Cost and Committed Cost remain distinct.
6. Preserve original currency; never silently mix currencies or invent FX.
7. Preserve finalized/verified/issued/paid/collected/voided/reversed history through audited lifecycle/correction paths.
8. Derived summaries do not become canonical master data.
9. Consequential AI mutations remain prepare/validate/human-confirm/execute.
10. Inventory balances require explainable movement history.
11. Biometric attendance requires explicit privacy/identity/device/correction/audit semantics before production use.

Still unresolved by design: VAT rate, VAT-inclusive vs VAT-exclusive contract value, withholding/BIR classification, automatic/external FX-provider policy and broader accounting-period policy. Do not infer them.

## Fresh-session bootstrap

For the next implementation session:

1. inspect exact current `main`, open PRs, and exact-head CI;
2. read live `AGENTS.md`;
3. read `docs/AGENT_EXECUTION_EFFICIENCY.md`;
4. read `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`;
5. read this handoff and `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`;
6. generate one bounded `agent:context` packet;
7. inspect the existing public/auth routing, deployment configuration, bootstrap, backup/health, and Render/Supabase deployment support before designing;
8. preserve the isolated-client deployment boundary and keep the public funnel separated from operational data;
9. use Docker/local Supabase whenever the phase changes migrations, RLS, grants, RPCs, triggers, constraints, or lifecycle guards;
10. validate new/edited tests, focused domain tests, then `npm.cmd run test:affected:agent`, with lint/build/browser/Workflow Map only when relevant;
11. review the exact final diff for scope creep and security/data-integrity regressions;
12. local Codex opens the feature PR but does not merge its own PR; GitHub-native review uses exact-head CI as the merge gate.
