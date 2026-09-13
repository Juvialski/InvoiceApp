# HydroQualiSense Current Handoff

Status: **CURRENT — UI/UX ROUND 2 IMPLEMENTATION IN PROGRESS / DOCUMENT-TEMPLATE STORAGE AUTHORITY BLOCKED IN LOCAL-QA / LAST APPLICATION-BEARING MAIN HOSTED-QA CERTIFIED / SUPPLIER PAYABLES CERTIFIED / WAVE 4D INCOMPLETE / QA CERTIFICATION NOT READY / WORKER REGISTRATION PAUSED**
Date: **2026-09-13**
Repository: `Juvialski/InvoiceApp`

## Authoritative current baseline

The documentation reprioritization in this handoff was prepared from `main` at:

`28f063c365fea287b5aa07c3ea7d94af05f3651c`

The last application-bearing SHA currently covered by the successful hosted application certification remains:

`e4ee4ebde489629ee74429b4e37abb511943a51e`

That application SHA is merged PR #158, **fix supplier payable settlement truth**. The later `28f063c...` commit is documentation-only and does not itself change the deployed application contract.

Read this handoff with:

- `AGENTS.md`;
- `docs/AGENTS_BASELINE_20260909.md`;
- `docs/AGENT_EXECUTION_EFFICIENCY.md`;
- **`docs/HYDROQUALISENSE_UI_UX_ROUND2_SIMPLIFICATION.md` — authoritative design for the immediate next phase**;
- `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`;
- `docs/HYDROQUALISENSE_LOCAL_QA_UI_PDF_PLAN.md` for the earlier quality-program foundation;
- `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md` for the incomplete Wave 4D contract;
- `docs/CHATGPT_MIGRATION_OPERATOR_POLICY.md` and deployment runbook when release/migration operations matter.

Live repository state and `AGENTS.md` override remembered chat summaries.

---

## Explicit user reprioritization — 2026-09-12

The user reviewed several authenticated HydroQualiSense screens and determined that the application still contains too many confusing, technical, oversized, cramped, or weakly prioritized interfaces despite the earlier UI/UX pass.

The user explicitly approved a second, broader UI/UX phase and explicitly allowed navigation/tab restructuring when that improves and simplifies the experience.

### New immediate phase

**UI/UX Round 2 — App-Wide Usability Simplification & Information Architecture**

Authoritative phase design:

`docs/HYDROQUALISENSE_UI_UX_ROUND2_SIMPLIFICATION.md`

This phase now comes **before continuing the remaining Wave 4D messaging-provider integration/readiness work**.

Wave 4D is not cancelled. After UI/UX Round 2 is completed and merged, return to Wave 4D unless the user explicitly reprioritizes again.

Worker Registration remains paused and must not be suggested as the next phase.

### Current implementation branch state

This implementation branch started from the freshly synchronized `main` SHA:

`746a4aacda9ccceff88a5093bfeb678b8b1046a8`

The branch implements the grouped authenticated shell navigation, shared task-first controls/disclosures, mandatory Documents/Expenses/Project Allocation/Payroll improvements, and targeted hierarchy changes for Dashboard, Supplier Invoices, Projects, Warehouse, Equipment, and Settings. The changes preserve the existing route vocabulary, deep-link query contracts, permission checks, source ownership, financial boundaries, immutable history, and Assistant confirmation model. No database migration or schema contract changed.

The critical Document Templates investigation traced Starter, Upload, and AI persistence through the shared server Storage path. Authenticated Local-QA reached the real isolated backend and returned `TEMPLATE_STORAGE_UNAVAILABLE`: the QA server lacks the private `SUPABASE_STORAGE_SERVER_KEY`. The capability response and Settings UI now distinguish this server prerequisite from PDF converter health, gate persistence actions until Storage authority is available, and keep AI separately provider-gated. Starter/Upload/AI are not certified PASS on this branch: secure QA server configuration and the complete authenticated persistence/retrieval workflow are still required. The broader Local-QA harness was started but stalled before completion and was stopped, so it is recorded as incomplete rather than passed.

---

## UI/UX Round 2 purpose

The app should continue to expose its large feature set, but it must become much easier to understand and operate.

This is not a theme/color/spacing-only cleanup. It is a **workflow-first information-architecture and usability restructuring pass**.

The approved product rules are:

- task first, system architecture second;
- keep important functionality, reduce cognitive load;
- one obvious primary action per context;
- actual working content/register before long explanations or oversized summary regions;
- progressive disclosure for provenance, audit metadata, raw IDs, and advanced/rare actions;
- business-facing wording instead of engineering/source-of-truth jargon in ordinary UI;
- compact, useful summaries instead of card walls and dead space;
- common filters visible and compact, advanced filters progressively disclosed where appropriate;
- consistent page/action/filter/table/form/navigation grammar across modules;
- navigation/tabs may be renamed, regrouped, reordered, or restructured if that genuinely simplifies the user journey;
- preserve established routes/deep links wherever practical, with deliberate compatibility handling when views move;
- responsive layouts may reorganize workflows instead of merely shrinking desktop layouts;
- simplification must never weaken permissions, financial truth, audit history, source ownership, company isolation, or Assistant confirmation boundaries.

### Primary usability acceptance test

For every major authenticated screen, a first-time company user should be able to determine within a few seconds:

1. What is this page for?
2. What needs my attention?
3. What can I do next?

A screen is not complete merely because it loads cleanly or has no horizontal overflow.

---

## Mandatory known regression examples

These user-observed classes must be explicitly rechecked during implementation.

### Project Allocation

Current/observed dense allocation presentation can compress project, large values, units, balance, allocation semantics, and action into a difficult strip. Redesign the flow so the user's decision sequence is obvious and large values remain readable at normal laptop widths.

### Documents

The document list/workspace should be the primary working experience. Oversized summary/registry framing must not push common find/open/preview/handoff tasks far down the screen without a strong reason. Canonical ownership remains in source domains; Documents remains an index/workspace, not a competing source of truth.

### Expenses

The Expense register should behave as the main Expense workspace. Supplier Invoice evidence remains linked supporting context. Technical language such as record ownership/authority should not dominate the normal view, though the actual financial/source semantics must remain intact.

### Payroll

The current long flat navigation must be reviewed and reorganized around a clearer user mental model. A likely direction is higher-level grouping around overview, people, attendance/time, payroll runs, and imports/admin, but final grouping must come from live route responsibilities rather than blindly copying proposed labels.

These examples seed the audit. Fixing only these examples is insufficient.

---

## Required app-wide scope

Codex must inspect and simplify the authenticated application as a coherent product, not as isolated screenshots.

Coverage includes at minimum:

- Dashboard/Home;
- Projects and project sub-workspaces;
- Procurement/RFQ/Purchase Orders;
- Supplier Invoices;
- Expenses/payables;
- Client Billing/Client Invoices;
- Collections;
- Cash & Banking;
- Inventory/Warehouse/project allocation;
- Payroll/Workers/Attendance/Time/Runs/Imports;
- Documents;
- Email/SMS;
- Engineering;
- Equipment;
- Reports where they share affected layout/navigation patterns;
- Settings/Admin where advanced configuration properly belongs;
- other authenticated top-level routes and important child/detail/modal/drawer states derived from the live router.

Do not trust an old hardcoded route count. Derive the route inventory from current source.

---

## Shared UI grammar to enforce

Major operational pages should generally converge on:

1. page title + concise context;
2. primary action/next step;
3. only decision-relevant summary/state;
4. main working surface;
5. supporting context;
6. advanced/provenance/audit details.

Shared patterns should be reviewed centrally where possible:

- page headers;
- section headers;
- cards/stat tiles;
- buttons and action hierarchy;
- badges/status chips;
- filters/search;
- tables/registers;
- form groups;
- local navigation/tabs;
- dialogs/drawers;
- helper text;
- empty/loading/error/unavailable states;
- pagination;
- responsive action patterns.

Do not patch each route independently when a reusable component is the root cause.

---

## Terminology / formatting direction

Audit the app for technical or awkward user-facing language including:

- UUID/hash-first identity;
- raw enums;
- source-of-truth/authority jargon;
- `owns cost`-style wording;
- `preserved source evidence`-style wording;
- ambiguous `Uncoded`-style labels;
- inconsistent money/quantity/unit formatting;
- verbose explanatory copy placed ahead of the work itself.

Use human-readable business identity first and technical IDs/details second.

Money should be presented in readable currency-aware formatting while preserving original currency and without inventing FX.

---

## Local-QA implementation loop

This phase should heavily use the existing authenticated Local-QA harness because it allows a branch to be exercised against the isolated QA backend before merge.

Intended development loop:

`fresh branch from current main -> local app -> isolated QA backend -> authenticated workflow -> inspect rendered behavior -> fix -> focused regression`

Use the already approved QA environment/account configuration via local environment/test configuration. Never hardcode passwords, service-role credentials, or browser-unsafe privileged keys in repository files.

Local-QA is pre-merge functional evidence. It is not permission to modify production.

### Primarily application/UI scope

Do not add DB migrations/RLS/RPC/financial-guard changes simply to make the redesign easier.

If a genuine backend defect is exposed, identify it explicitly and use the repository's DB validation rules if it must be corrected. Do not silently redefine business truth inside UI code.

---

## Required workflow regression coverage

Do not limit validation to route loading and screenshots.

Exercise the workflows materially touched by the restructure, including applicable existing coverage for:

- supplier document -> verification -> linked Expense -> Cash & Banking;
- procurement/RFQ -> PO -> receipt -> Warehouse;
- Client Invoice -> Collection -> Cash & Banking;
- Payroll people/time/attendance -> run/calculation -> approval navigation and freshness;
- Documents -> preview/open -> Compose/review without uncontrolled sending;
- Project allocation and project-context handoffs;
- Inventory/project allocation and receiving handoffs;
- deep-link/stale-record recovery where navigation changes affect them.

If fixture/provider limitations prevent a workflow, report it as blocked/not-tested rather than as pass.

---

## Responsive / accessibility expectations

Deliberately exercise at least:

- normal desktop;
- laptop / constrained-height desktop;
- tablet width;
- phone/mobile width.

Check more than page overflow:

- no clipped critical controls;
- no unusably compressed money/quantity/select fields;
- primary actions remain discoverable;
- navigation remains understandable;
- actual working content is not buried beneath oversized header/card regions;
- dialogs/drawers remain operable;
- keyboard/focus/labels/touch targets remain reasonable;
- do not replace understandable text actions with ambiguous icon-only controls merely to save space.

---

## Validation ladder for this phase

Use the repository's proportional implementation workflow:

1. new/edited tests;
2. focused UI/domain tests;
3. `npm.cmd run test:affected:agent`;
4. production build because broad UI/application integration changes are expected;
5. targeted authenticated Local-QA/browser coverage for affected routes/workflows;
6. Workflow Map only when mapped/generated contracts change;
7. Docker/local Supabase only if DB/security/integrity contracts change;
8. `test:full` only if impact fallback, broad shared-contract risk, failures, release/deep-regression need, or explicit request justifies it;
9. exact integrated diff review for accidental feature loss, financial/security drift, broken routes, and scope creep.

Codex must not self-merge its implementation PR.

---

## Completed quality/application context that remains valid

### First comprehensive Local-QA UI/UX pass — complete

PR #150 previously established broad authenticated route/responsive coverage and fixed concrete UI issues. That pass remains valid evidence for what it tested, but it did not prove the app was optimally understandable. UI/UX Round 2 intentionally raises the bar from structural correctness to usability/information hierarchy.

### Programmatic PDF visual certification — complete

Programmatic Purchase Order / Client Invoice fallback output received deliberate visual certification, including centering, logos, long values, multi-page behavior, totals, signatures, and preview/download byte identity for exercised records.

Company-template high-fidelity conversion remains a separate capability and must not be falsely represented as certified when converter support is unavailable.

### Functional Local-QA sweep — complete for supported/fixture-backed workflows

The earlier integrated Local-QA sweep exercised key RFQ/PO/Warehouse, supplier payable, client receivable, payroll, Documents->Compose, and stale-record flows. Subcontract settlement remained fixture-blocked where no safe fixture existed.

### Supplier Payables Settlement Truth & Consistency — complete

Merged PR #158 established and certified the corrected supplier settlement model:

- the verified linked Expense is the supplier payable/settlement authority even when intentionally `DRAFT`;
- generic direct DRAFT Expense settlement remains ineligible;
- payment state comes from confirmed Cash & Banking evidence, not OCR/document-reported `amountPaid`;
- legacy invoice-target evidence projects through the linked Expense relationship;
- reversal restores outstanding while preserving history;
- project/source linkage and cost truth remain intact.

Do not weaken those semantics during UI simplification.

---

## Hosted exact-SHA QA evidence

Certified application SHA:

`e4ee4ebde489629ee74429b4e37abb511943a51e`

At certification:

- Render QA served the exact intended SHA;
- QA deployment identity/environment matched expectations;
- QA Supabase was independently distinct from production;
- repository and QA migration parity matched `20260912082656_supplier_payables_settlement_consistency`;
- email/password authentication persisted;
- protected route contracts passed;
- zero console/page/network failures were recorded on the successful hosted attempt;
- authenticated engineering-document Storage upload/read/hash/cleanup passed;
- separate supplier-payables QA assertions passed;
- synthetic financial certification fixtures were rolled back/cleaned;
- no uncontrolled email or SMS was sent.

This evidence belongs to that application SHA and must not be generalized blindly to the future UI/UX Round 2 head.

---

## Current provider / optional capability truth

### Gmail

Exact-state hosted provider proof may require reauthorization. Compose/review remains conceptually separate from uncontrolled send. UI work must preserve the human review/confirmation boundary.

### SMS

Approved provider direction remains:

- Company SIM Gateway — primary/recommended;
- PhilSMS — optional hosted fallback.

The provider work is **temporarily sequenced after UI/UX Round 2**, not cancelled. Real SMS remains unavailable/unverified until controlled provider-backed QA succeeds.

### Company-template upload/conversion

Programmatic PDF fallback is separate from company-template DOCX/finalized converter-backed PDF. Do not represent converter scaffolding as runtime certification where the supported converter/server authority is unavailable.

### Subcontract settlement

Remains fixture-limited/not-tested where no safe subcontract/claim fixture exists.

---

## QA / production boundary

`QA CERTIFICATION: NOT READY`

The hosted application and supplier-payables evidence are strong but narrower than full readiness.

Overall QA remains not ready because remaining provider/readiness limitations still exist and because the upcoming UI/UX Round 2 will produce a new application-bearing head requiring appropriate new evidence.

Production is read-only unless the user separately and explicitly authorizes a production operation under the migration/operator policy.

Never infer production authorization from:

- a green PR;
- a merge;
- a Render deployment;
- local QA success;
- hosted QA success;
- documentation changes.

---

## Permanent financial / security / history invariants

Preserve throughout UI/UX Round 2 and subsequent work:

- one deployment -> one client company;
- active membership, RLS, RBAC, capability-based authorization, and company isolation;
- Supplier Invoice evidence remains distinct from authoritative linked Expense payable/cost truth;
- Client Invoice/Collection receivable truth remains distinct from Cash & Banking settlement evidence;
- Actual Cost remains distinct from Committed Cost;
- `projects.contract_value` remains distinct from `projects.project_budget`;
- original currency remains explicit and mixed currencies are not silently summed;
- payroll privacy, calculation freshness, approval authority, and settlement history remain intact;
- Purchase Order receiving/close rules remain intact;
- inventory movement/allocation history remains authoritative/explainable;
- immutable issued/finalized document snapshots and provenance remain intact;
- delivery history remains append-only/company-bound;
- Assistant consequential actions retain `prepare -> review -> human confirm -> execute`;
- navigation simplification is never authorization simplification.

---

## Required sequence from this handoff

1. **UI/UX Round 2 — NEXT / ACTIVE**
2. **Resume Wave 4D messaging-provider integration/completion**
3. **Wave 4D remaining readiness/completion evidence**
4. **Worker Registration — PAUSED until Wave 4D complete and user explicitly resumes it**
5. Site Attendance
6. Face Recognition only after design/privacy/security work
7. Final pre-production security/data-integrity certification

Do not skip directly to Worker Registration.

---

## Fresh implementation handoff instructions

For UI/UX Round 2, Codex should:

- first fetch and fast-forward `main`, record the resulting exact SHA once, and branch from it;
- read `AGENTS.md`, the efficiency guide, active roadmap, this handoff, and `docs/HYDROQUALISENSE_UI_UX_ROUND2_SIMPLIFICATION.md`;
- default to zero subagents, hard maximum two concurrent bounded Codex subagents;
- use at most one bounded context packet when useful;
- inspect the live router/application shell/shared primitives before deciding navigation changes;
- derive the current authenticated route/workflow inventory from source;
- use authenticated Local-QA repeatedly while implementing;
- fix shared UI causes centrally where appropriate;
- preserve all business/security/history invariants;
- run focused -> affected -> relevant build/browser validation;
- use Docker/Supabase only if the change genuinely crosses DB/security/integrity contracts;
- review the complete final diff;
- update roadmap/handoff/design/client-facing roadmap truth only to match actual final capability;
- push/open PR and stop; Codex must not merge its own PR.

## Stop boundary

Do not let UI/UX Round 2 expand into provider deployment, Worker Registration, Site Attendance, Face Recognition, broad CRM, new accounting policy, or unrelated DB redesign.

When the UI/UX implementation is safely merged, return to Wave 4D provider integration unless the user explicitly changes priorities again.
