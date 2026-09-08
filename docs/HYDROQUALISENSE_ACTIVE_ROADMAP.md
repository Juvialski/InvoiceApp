# HydroQualiSense Active Roadmap

Status: **ACTIVE — QA LIVE INITIALIZATION BLOCKED, CERTIFICATION NOT READY**
Repository: `Juvialski/InvoiceApp`  
Last updated: **2026-09-08**  
Product direction: `docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md`  
Client deployment strategy: `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`  
Current handoff: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`

This file is the authoritative forward roadmap. Live repository state and `AGENTS.md` override stale chat summaries or historical Engoryx plans.

## Current state

Completed recent milestones:

- PR #93 — unified supplier invoice / Expense / Purchase Order / Client Invoice workflow.
- PR #94 — R4 redundancy/currency/tax/UX hardening.
- PR #95 — R5 cross-module integration and data-contract hardening.
- PR #96 — Warehouse Inventory & Project Allocation.
- PR #97 — Post-Warehouse Operational Integration.
- PR #99 — public client funnel + repeatable isolated deployment/release productization foundation.
- PR #100 — supplier Expense-link repair + Client A transfer/readiness tooling.
- PR #101 — supplier readiness truth + guarded legacy repair + QA deployment identity and guarded QA database tooling.
- PR #103 — streamlined supplier invoice repair UX, inline canonical Vendor resolution, explicit Expense-description confirmation, direct guarded posting, and clearer invoice lifecycle actions; no migration or database contract change.

Runtime baseline after PR #105:

`8c74bf1101aaad92d7e05170f7898be5988f881d`

Supabase connector, public health, and repository state re-verified on 2026-09-08 during the QA certification attempt:

- QA `vrpuznofrntyqsbugrib` is `ACTIVE_HEALTHY`, has one Auth user, zero HydroQualiSense public application/base tables, and zero applied repository migrations.
- Client A production `qijjshdwiylojvqojxyz` is `ACTIVE_HEALTHY`; a read-only query observed migration head `20260908051740_deployment_bootstrap_authority`, while `/api/health` reports stale migration metadata `20260908005120`.
- QA `/api/health` reports the correct repository SHA but incomplete identity metadata (`deploymentId=qa`, null environment/migration/configuration).
- Production inspection was read-only. No QA or production mutation was performed by Codex during this attempt.

The product architecture remains:

`one source repository -> many isolated client deployments`

Each production client receives its own Render service, Supabase project/database/Auth/Storage boundary, configuration and secrets. There is no in-app switch between unrelated client companies.

Core rules remain:

> **One concept -> one primary place -> one authoritative number.**

> **One business entity -> one canonical identity -> every module references it.**

## Completed — client deployment/productization foundation

The initial productization slice is complete enough to move into live QA initialization.

Established capabilities:

- public prospect funnel exists but is disabled by default on operational deployments;
- public prospect persistence has a separate database-side deployment gate;
- one repository can serve isolated production/QA/demo/staging identities;
- `/api/health` reports non-secret release/deployment metadata;
- deployment inventory/release verification tooling records non-secret deployment state;
- Client A transfer/readiness preflight exists;
- QA has explicit environment identity, visual warning banner, QA inventory template, and guarded `qa:db:push` / `qa:db:reset` wrappers;
- QA sample presets are gated to explicit QA builds;
- QA reset never seeds production data;
- release promotion remains deliberate per deployment.

Do not turn this into a shared multi-client operational control plane yet.

## Live deployment topology

### Client A production

- URL: `https://hydroqualisense.com`
- Supabase ref: `qijjshdwiylojvqojxyz`
- read-only observed database migration head: `20260908051740_deployment_bootstrap_authority`; this supersedes the prior handoff snapshot and was not applied by Codex during this phase.
- real client production data; never use as disposable QA data.
- default operational rule for the QA phase: production Supabase is read-only unless a separate explicit production change is approved.

### QA

- URL: `https://hydroqualisense-qa.onrender.com`
- Supabase ref: `vrpuznofrntyqsbugrib`
- current verified state on 2026-09-08: `ACTIVE_HEALTHY`, one confirmed Auth user, zero HydroQualiSense public application/base tables, zero applied repository migrations.
- intended role: isolated QA plus temporary client-demo environment using synthetic data only.
- QA is authorized for read/write initialization and certification work, but the current attempt is blocked before the first guarded migration write.

## NEXT — live QA initialization and certification

This is the immediate bounded phase.

Current gate result: `QA CERTIFICATION: NOT READY`. Worker Registration and all later product phases remain blocked.

Required outcome:

1. QA Render uses explicit QA environment/deployment identity.
2. The blank QA Supabase project receives the full approved migration chain.
3. A QA company and the already-confirmed QA user are bootstrapped through guarded existing authority, not raw unsafe table edits.
4. Storage/Auth/provider configuration is QA-specific and does not reuse/copy Client A operational data.
5. Synthetic/demo data is introduced only through an explicit QA-only path.
6. QA proves company boundary, RBAC/RLS/RPC behavior, major read paths, Storage access, `/api/health`, and one safe supplier-review flow.
7. QA release/migration identity is recorded after successful verification.
8. Client A production remains read-only by default throughout this phase; no production mutation is part of QA certification.

Use `docs/HYDROQUALISENSE_DEPLOYMENT_RUNBOOK.md` for the operator workflow.

### QA safety rules

- Never copy Client A financial, payroll, worker, document, Auth or Storage data into QA by default.
- Never place service-role/secret keys in browser variables or repository files.
- `qa:db:push` and `qa:db:reset` must fail closed unless explicit QA identity and exact project-ref assertions match.
- Do not treat an unavailable provider/backup check as a pass.
- Database backup evidence does not by itself prove Storage object recovery.
- Do not enable the public prospect funnel merely because QA exists; its build and DB gates remain deliberate.
- Production Supabase inspection during this phase is SELECT/read-only by default; do not invoke functions with mutation side effects.

## NEXT AFTER QA — Worker Registration foundation

Target sequence:

`project/site QR -> pending worker submission -> supervisor/admin duplicate/identity/project review -> canonical Worker/payroll/project assignment`

Rules:

- registration begins as `PENDING`;
- ambiguous identity/duplicates require review;
- approval creates or links canonical workforce truth;
- worker identity, project/site assignment and approval history remain auditable;
- uploaded images remain evidence/enrollment input and do not become authoritative identity by themselves.

## Later — Site Attendance state machine and device registration

Before biometric recognition, establish controlled attendance truth:

- registered site device bound to a project/site;
- explicit time-in/time-out transitions;
- duplicate-punch protection;
- offline queue/sync semantics;
- controlled correction/reason workflow;
- actor/device/site/project/timestamp/correction audit;
- payroll integration that does not silently rewrite finalized payroll history.

## Later — Face-Recognition Attendance

Face recognition is an identity-assistance layer, not the source of worker truth.

Before production use, explicitly design and validate:

- consent/access policy;
- enrollment/re-enrollment;
- biometric template vs raw-photo retention;
- deletion/retention requests;
- liveness/anti-spoof controls;
- image quality and PPE/lighting failure behavior;
- confidence thresholds;
- uncertain-match/manual-supervisor fallback;
- registered device/site binding;
- offline/concurrency handling;
- payroll integration and correction audit.

Uncertain recognition must never guess.

## Final pre-production security/data-integrity certification

After major operational domains stabilize and before broad multi-client rollout, run a dedicated certification phase covering at least:

- final DB RLS/grants/SECURITY DEFINER/RPC/trigger/constraint/index inventory;
- permission and cross-company attack tests;
- financial/history idempotency and correction tests;
- inventory/attendance concurrency and correction tests;
- Storage backup/restore verification;
- secrets/configuration review;
- dependency audit/remediation;
- public endpoints/security headers;
- external integration scopes/tokens;
- browser authorization/deep-link testing;
- deployment upgrade/recovery drill;
- biometric/privacy review once biometrics exist.

This certification supplements rather than replaces security validation during each phase.

## Permanent architecture and safety invariants

1. `one deployment -> one client company -> active membership/RBAC -> permitted workflows`.
2. One repository may serve many isolated deployments; unrelated clients do not share operational databases.
3. Keep `company_id`, company-scoped RLS, permission checks, company-bound integrity, audit boundaries and company-prefixed Storage paths.
4. Preserve auditable financial, payroll, procurement, project, engineering, inventory, attendance and document history.
5. Actual Cost and Committed Cost remain distinct.
6. Supplier invoice evidence linked to Expense must not create duplicate Actual Cost/payable truth.
7. Client Invoices/Collections remain distinct from supplier obligations/project Actual Cost.
8. Preserve original currency; base reporting requires explicit authoritative FX evidence.
9. Finalized/verified/issued/paid/collected/voided/reversed history changes only through deliberate lifecycle/correction paths.
10. Derived summaries are not canonical master records.
11. Consequential AI-assisted mutations preserve prepare/validate/human-confirm/execute boundaries.
12. Imported/AI identity is evidence and must not silently become canonical identity when ambiguous.
13. Inventory balances require explainable movement truth.
14. Biometric attendance requires explicit privacy, identity, correction, device and audit semantics before production use.
15. Navigation simplification is not authorization simplification.

Still unresolved by design: VAT rate, VAT-inclusive vs VAT-exclusive contract value, withholding/BIR classification, automatic/external FX-provider policy and broader accounting-period policy. Do not infer them.

## Explicit hold on historical plans

Old Engoryx planned/deferred phases are not implementation authority. Scheduling/Gantt/CPM, broad MRP/manufacturing expansion, autonomous accounting/AI posting and other historical future plans remain out unless explicitly reconfirmed.

## Current implementation sequence

Unless explicitly reprioritized:

1. **Live QA initialization and certification**
2. **Worker Registration foundation**
3. **Site Attendance state machine + device registration**
4. **Face-Recognition Attendance** after explicit privacy/security design
5. other client-confirmed requirements
6. **Final pre-production security/data-integrity certification** before broad rollout
