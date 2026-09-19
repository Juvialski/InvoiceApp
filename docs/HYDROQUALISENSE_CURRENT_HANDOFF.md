# HydroQualiSense Current Handoff

Status: **CURRENT — RI-1 COMPLETE / COMBINED RI-2+RI-3 NEXT / FULL PROFESSIONALIZATION COMPLETION BEFORE EXCEL / 3D LAST / PROVIDER READINESS SEPARATE / WORKER REGISTRATION PAUSED**
Date: **2026-09-19**
Repository: `Juvialski/InvoiceApp`

RI-0 Repository Intelligence planning was prepared from current `main` at `f2ff96c22e1c58e18d52ebbcd88dcddbdf1e7416`. RI-1 is now implemented on the fresh branch from `main` SHA `117a61b8a6046b8c5938baf9130ffdb8a5c12f00`; RI-2 and RI-3 remain unimplemented.

## Current repository state

The pre-Wave-C merged `main` baseline was:

`4f840b291f4efa28eedceceae5ed95843d7c3f58`

This handoff includes Slice 5 Wave C (Projects portfolio/register presentation decomposition) on top of that baseline. Slices 1-4 and Slice 5 Waves A-C are implemented in the current repository state; the broader professionalization program remains incomplete. The implementable Email/SMS Reliability & SMS Improvement slice is complete on merged `main`; live Brevo/SMS provider certification remains pending external credentials/device/runtime.

The approved future Excel-Native Operations UX is documented at `docs/superpowers/specs/2026-09-18-excel-native-operations-ux-design.md`. It is not implemented and must not be treated as current product capability.

### Earlier UI/UX and hosted-certification reference

UI/UX Round 2 was implemented from `main` at:

`746a4aacda9ccceff88a5093bfeb678b8b1046a8`

The final application-bearing implementation head before documentation-only finalization was:

`486d8cd594eade2ad6399ed3160b6f0a227a17b8`

That exact application head passed the protected application/build, browser/demo, and workflow-map checks applicable to this phase. The protected database workflow correctly fast-passed after classifying the diff as database-unaffected. Documentation-only finalization commits may advance the PR head without changing the reviewed application code.

The last application-bearing SHA currently covered by the earlier successful hosted application certification remains:

`e4ee4ebde489629ee74429b4e37abb511943a51e`

That hosted evidence belongs to the earlier certified application state and must not be generalized blindly to the newer UI/UX Round 2 application code.

Read this handoff with:

- `docs/README.md` — documentation map and precedence;
- `AGENTS.md`;
- `docs/AGENTS_BASELINE_20260909.md`;
- `docs/AGENT_EXECUTION_EFFICIENCY.md`;
- `docs/HYDROQUALISENSE_UI_UX_ROUND2_SIMPLIFICATION.md` — completed UI/UX Round 2 design/acceptance record and standing UI baseline;
- `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`;
- **`docs/HYDROQUALISENSE_UNIFIED_DOCUMENT_CENTER.md` — deferred Wide Documents Phase contract**;
- **`docs/superpowers/specs/2026-09-14-unified-document-center-design.md` — Slice 1 design**;
- `docs/superpowers/specs/2026-09-13-document-template-ai-autotagging-design.md` — completed corrective foundation;
- `docs/HYDROQUALISENSE_DOCUMENT_TEMPLATES_WAVE4A.md` — existing immutable template/mail-merge contract;
- `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md` — authoritative contract for the next product phase after this correction;
- `docs/repository-intelligence/README.md` — canonical Repository Intelligence architecture; RI-1 implemented, RI-2/RI-3 not implemented;
- `docs/superpowers/specs/2026-09-17-repository-architecture-professionalization-design.md` — active repository decomposition design;
- `docs/superpowers/specs/2026-09-18-excel-native-operations-ux-design.md` — approved future direction; implementation deferred;
- `docs/HYDROQUALISENSE_LOCAL_QA_UI_PDF_PLAN.md` for the earlier quality-program foundation;
- `docs/CHATGPT_MIGRATION_OPERATOR_POLICY.md` and deployment runbook when release/migration operations matter.

Live repository state and `AGENTS.md` override remembered chat summaries.

---

## UI/UX Round 2 — completed 2026-09-13

The user approved a second broad usability phase and allowed navigation/tab restructuring when that improved and simplified the product without weakening important features, permissions, financial truth, audit history, source ownership, or workflow correctness.

PR #161 completed that phase.

### Final implementation state

The implementation delivers grouped authenticated shell navigation, shared task-first controls/disclosures, mandatory Documents/Expenses/Project Allocation/Payroll improvements, and targeted hierarchy changes for Dashboard, Supplier Invoices, Projects, Warehouse, Equipment, and Settings. The changes preserve the existing route vocabulary, deep-link query contracts, permission checks, source ownership, financial boundaries, immutable history, and Assistant confirmation model. No database migration or schema contract changed.

The mandatory regression areas were explicitly rechecked:

- **Project Allocation** uses readable responsive allocation views so large values, units, remaining amounts, and selection/action semantics are no longer forced into one narrow row.
- **Documents** is search/list-first and keeps common open/preview/handoff work ahead of secondary registry/provenance framing.
- **Expenses** keeps the Expense register primary while Supplier Invoice/source documents remain supporting context and the linked Expense retains payable/cost authority.
- **Payroll** is grouped around Overview, People, Attendance & Time, Payroll Runs, and Imports & Setup instead of the former flat equal-priority tab strip.

The final authenticated Local-QA route matrix recorded **59/59 PASS** with zero page-overflow, dialog-overflow, or interactive-overflow failures. The recorded authenticated visual-certification pass produced **80 route/state captures across desktop, constrained laptop, tablet, and phone, plus corrected Projects captures at desktop/tablet/phone**. Exact-head GitHub browser QA independently captured 78 demo screenshots/scenarios across 34 routes and four viewport classes with zero failed scenarios, navigation failures, console errors, page errors, failed requests, or overflow failures.

The focused template/UI/harness suite passed 38/38. At the final application-bearing implementation head, `test:affected:agent` selected 871 tests with 870 pass, 0 fail, and 1 skipped; lint and production build passed. Workflow Map/source consistency passed. No database migration/RLS/RPC/trigger change or production write occurred.

### Document Templates capability truth

The critical Document Templates investigation traced Starter, Upload, and AI persistence through the shared server Storage path. After the private `SUPABASE_STORAGE_SERVER_KEY` was configured locally, the restarted authenticated Local-QA capability endpoint returned `templateStorage.status=AVAILABLE`.

Purchase Order and Client Invoice Starter plus safe Upload each:

- persisted immutable template metadata/version records;
- survived Settings refresh;
- returned retrievable DOCX bytes.

The Starter generator now emits the declared `company.vatTin` tag so activation validation is `VALID`.

Real authenticated Local-QA AI-template evidence is now obtained separately from Storage. `/api/deployment/company-ai` returned HTTP 200 with `runtimeCapability.status=AVAILABLE` while persisted `lastTestStatus` remained `NOT_TESTED`; no credential material was returned. The HSC Purchase Order Analyze request returned `aiStatus=AVAILABLE` with model `gemini-3.5-flash-lite`. The reviewed UI Prepare action created a VALID immutable `DUPLICATED` descendant from the uploaded HSC version, preserved the original SHA, and Test DOCX rendered both synthetic lines. The separate Generate with AI Settings workflow passed for Purchase Order and Client Invoice, persisted VALID AI drafts, survived refresh, downloaded AI DOCX artifacts, and their Test DOCX outputs rendered both synthetic lines.

High-fidelity company-template PDF conversion remains independently `UNAVAILABLE`. The existing programmatic PDF fallback remains a separate capability.

The broad Local-QA route matrix still needs separate harness cleanup/reconciliation because its long sweep recorded unrelated route/session failures; the isolated authenticated AI/template workflow passed. This is pre-merge QA evidence, not hosted exact-SHA release certification.

No secret was returned to the browser. No uncontrolled email/SMS send and no production mutation occurred.

### Standing UI baseline

Later product phases must preserve the completed workflow-first rules:

- task first, system architecture second;
- keep important functionality while reducing cognitive load;
- one obvious primary action per context;
- actual working content/register before long explanations or oversized summary regions;
- progressive disclosure for provenance, audit metadata, raw IDs, and advanced/rare actions;
- business-facing wording instead of engineering/source-of-truth jargon in ordinary UI;
- compact useful summaries and filters;
- consistent page/action/filter/table/form/navigation grammar;
- routes/deep links remain compatible wherever practical;
- responsive layouts may reorganize workflows rather than merely shrinking desktop layouts;
- simplification must never weaken permissions, financial truth, audit history, source ownership, company isolation, or Assistant confirmation boundaries.

---

## Immediate corrective phase — Document Template AI Auto-Tagging + AI Capability Correction

The user explicitly inserted this corrective phase before Wave 4D resumes. Its design is `docs/superpowers/specs/2026-09-13-document-template-ai-autotagging-design.md`.

The implementation corrects the stale deployment `lastTestStatus` gate by exposing a server-derived company AI runtime capability from the same resolver used by Analyze/Generate. It also adds deterministic server-owned anchors, allowlisted mapping validation, in-app `Prepare template`, repeating-row tagging, immutable descendant version creation, and safe provider-error wording. Original uploaded bytes remain unchanged; activation remains separate.

Focused local implementation evidence obtained so far:

- capability, DOCX anchor, mapping, transformer, immutable-version, UI-contract, AI-error, compatibility, storage-boundary, security-boundary, and company-AI tests pass;
- TypeScript lint passes;
- local DB-runtime checks remain skipped when their explicit runtime flag is absent;
- no hosted/provider AI certification, production mutation, or uncontrolled email/SMS send has occurred.

The corrective branch is merged into the current baseline. Its real authenticated non-production AI/template runtime evidence remains valid, while hosted exact-SHA certification, production authorization, and high-fidelity PDF conversion remain separate and incomplete.

The server-only company AI boundary remains unchanged: the configured Supabase server key may use the modern `sb_secret_` form or an approved legacy JWT `service_role`-compatible key, and neither belongs in browser state. Before configuration, QA metadata may truthfully report `NOT_CONFIGURED`; application deployment and database migration promotion remain separate operator actions, and production remains read-only unless explicitly authorized.

## Wide Documents Phase — Slice 1 implemented 2026-09-14

The user explicitly reprioritized the next product work to the Wide Documents Phase. Slice 1 makes Documents the central application entry point for document discovery and supported creation without creating a duplicate business-record owner.

The current implementation provides:

- `/documents` as the default Library view;
- durable `/documents?view=library|create|templates` navigation with invalid values defaulting to Library;
- permission-filtered Library projection over existing Purchase Order, Client Invoice, Supplier Invoice, Expense receipt, Bank statement, and Engineering Document sources;
- compact common search/type filters plus progressive project, counterparty, module, origin, and status filters;
- business-language Create links to existing owning workflows, with payroll and engineering options permission-filtered;
- explicit preparation-required states for Warranty Certificate, Equipment / Materials Checklist, and general company uploads rather than fake generators;
- full existing template administration discoverable at Documents -> Templates;
- a small Settings -> Documents template link instead of a competing full template-management surface.

No database, RLS, RPC, Storage, financial, payroll, or provider contract changed in Slice 1. The original owning record routes, Email/SMS handoffs, template capability gates, and existing source-history boundaries remain intact.

The completed Slice 2 implementation generalizes template types beyond hardcoded enums. A company administrator can define a safe business document type, declare bounded custom/repeating inputs and an allowed source context, upload the actual DOCX, review/prepare an immutable version, activate it, and discover it from Documents -> Create. The three supplied HSC DOCX files are exact client fixtures proving the generalized engine: Purchase Order uses the existing Procurement adapter; Checklist and Warranty are ordinary Project-context company-defined examples. The full Wide Documents Phase remains incomplete because retained managed-document/artifact slices are still deferred.

## Active user reprioritization — Client Security Assurance & Handoff

The user explicitly reprioritized the current implementation run on 2026-09-15 to
the evidence-first client security assurance and handoff phase. The authoritative
contract and plan are:

- `docs/HYDROQUALISENSE_CLIENT_SECURITY_ASSURANCE.md`
- `docs/superpowers/plans/2026-09-15-client-security-assurance.md`

This branch implements the flexible company-scoped RBAC layer: the four existing
roles remain protected starter templates, Company Administrators can create/edit/
duplicate/assign/reassign/archive custom roles through the Settings access
workflow, and permissions continue through the shared effective-permission
resolver rather than role-name checks. Protected company-access, company-settings,
and platform permissions are rejected by the database boundary, cross-company role
targeting is rejected, and role/member lifecycle events are auditable.

Validation status for this handoff is deliberately qualified. Focused TypeScript,
static contract, local clean replay, pgTAP, runtime RLS/RPC authorization,
upgrade-path, exact authenticated synthetic-QA role capture, and seven-page PDF
render inspection pass for the committed implementation. The local browser run
covers Company Admin, Finance, Payroll, Viewer, a restricted company-defined role,
representative forbidden deep links, and the Company Access/custom-role editor with
clean telemetry. The isolated hosted QA deployment still serves the earlier release
and was not promoted by this handoff; no production database was mutated and no
production records were inspected. The PDF is therefore a qualified implementation
handoff artifact, not deployment-specific security certification;
`artifacts/client-security/EVIDENCE.md` records each claim and remaining gap.

The handoff custody checklist is `docs/HYDROQUALISENSE_CLIENT_SECURITY_HANDOFF_CHECKLIST.md`.
The exact next release action is deployment-specific: run the committed migration
through the guarded QA release path when its protected operator prerequisites are
available, bind the hosted application to the same release and migration, and
re-verify the existing evidence. Production promotion remains unauthorized by this
implementation run.

## Active user reprioritization — Email/SMS Reliability & UX Completion

Email/SMS Reliability & UX Completion now follows the active security phase. The
remaining Wide Documents managed-upload/artifact work is deferred, not cancelled.

The implementation adds a compact Compose, Sent / Delivery History, Email Provider
Status, and SMS status experience; preserves historical email source evidence,
document ownership, human confirmation, delivery history, idempotency, and
reconciliation; and keeps SMS limited to Company SIM Gateway and PhilSMS.

Google Sign-In now requests only the identity scopes `openid email profile`; no
Gmail mailbox/API scope or provider-token handoff remains in the live product.
Outbound transactional email uses a server-side Brevo adapter with deployment
configuration, verified-sender checks, provider message IDs, and truthful
accepted/failed/unknown outcomes. No provider credential is kept in ordinary
browser local storage or returned to the browser.

The public `/privacy` and `/terms` pages are session-free and linked from the
public, sign-in, and authenticated-shell surfaces. The canonical
`hydroqualisense.com` root is now host-aware and public without a manual build
setting; noncanonical operational roots remain authenticated by default and can
still opt into the public funnel with the existing non-secret setting. The user
confirmed Google Auth Platform is in TESTING and is moving it toward production;
this repository does not claim that Google publishing or verification is complete.

Current branch evidence includes focused identity-only OAuth, Gmail-retirement,
Brevo adapter/delivery, public-policy, communications UX, server authorization,
migration replay, pgTAP, and upgrade-path validation. No approved Brevo QA
credentials/recipient or SMS credentials/device runtime is available in the
current environment, so provider runtime states remain not configured/unverified.

## 2026-09-15 Google OAuth branding verification remediation

The operator confirmed that Google Search Console reports `hydroqualisense.com` as a
verified owner through Domain name provider verification. This is external evidence;
the repository did not change DNS, Cloudflare, domain ownership, or Search Console
configuration.

The repository-side corrective slice makes the canonical homepage publicly reachable
without authentication, preserves public `/privacy` and `/terms`, keeps `/dashboard`
and normal operational routes behind the existing authentication and permission flow,
and leaves noncanonical deployment roots flag-gated. The public surfaces now use the
exact `Hydroqualisense` product name, explain the business-operations purpose and
identity-only Google Sign-In, and describe server-side Brevo email without claiming
provider readiness. External Google Cloud scope removal/publishing remains an
operator action and is not represented as complete here.

Brevo sender verification/controlled QA and SMS provider runtime completion remain
separate until controlled approved-provider evidence exists. Worker Registration
remains paused.

Slice 2 pre-merge evidence is separated by scope: focused dynamic template/Create tests pass 68/68, lint/build and Workflow Map consistency pass, and demo browser QA passes 82/82 responsive scenarios. Authenticated Local-QA records 59/59 route/responsive scenarios with no overflow/errors, but the legacy functional template checks still look for the former Settings-mounted template surface and record 7/9 functional workflows. The new dynamic HSC flow is not represented as authenticated QA-certified because its migration was not promoted to that QA target. Local Docker is unavailable for replay/pgTAP/upgrade validation, and the bundled LibreOffice renderer is unavailable for DOCX visual conversion.

## 2026-09-16 Google Sign-In + Brevo migration handoff

The approved provider decision is implemented on this branch: Google Sign-In is
identity-only with `openid email profile`; active Gmail mailbox/API read, intake,
reconnect, refresh-token storage, and send paths are removed; Brevo is the
server-side outbound transactional-email provider; SMS remains unchanged.
Historical Gmail-derived source and delivery rows remain readable and are not
treated as current mailbox access.

Validation for the exact branch includes 198/198 focused changed-surface tests,
81/81 demo browser scenarios across desktop/laptop/tablet/mobile with no overflow
or browser/network errors, TypeScript lint, production build, Workflow Map check
and consistency, 114/114 static migration checks, two passing upgrade fixtures,
clean local migration replay, and pgTAP PASS (47 files, 1,597 tests). The aggregate
affected selector selected all 321 repository tests and reached the existing
visual-harness lifecycle area after unrelated baseline failures; that aggregate is
not represented as green. No approved Brevo QA credentials/safe recipient were
available, so live provider sending remains NOT TESTED/UNVERIFIED. No production
data, provider credentials, or production sends were accessed.

The next release step is deployment-specific QA promotion and controlled Brevo
provider certification only when the exact QA SHA/migration, client-owned Brevo
credentials, verified sender, and safe recipient are available. Wide Documents
remaining managed slices stay deferred and Worker Registration stays paused.

## 2026-09-18 Repository & Architecture Professionalization — Slice 5 Wave B

The repository professionalization track remains in progress. Slice 5 Wave B extracts the Subcontract register presentation into `src/components/procurement/SubcontractRegisterSection.tsx`; the reviewed `ProcurementPage.tsx` is 1,494 lines. The new section owns only KPI/filter/register/card/table/action presentation. Subcontract, claim, and variation state, filtering, parent-derived financial values, persistence, permissions, lifecycle mutations, routing context, and all editor/drawer/detail/cancellation orchestration remain parent-owned. Existing Claim and Variation workflow components remain authoritative and were not duplicated.

This is behavior-preserving architecture work. No database, migration, RLS/RPC, provider, production, route, or persistence contract changed. The broader professionalization program and later slices remain incomplete.

The approved future Excel-Native Operations UX direction is documented at `docs/superpowers/specs/2026-09-18-excel-native-operations-ux-design.md`. It is documentation only in this handoff: implementation has not started, current registers are not claimed to satisfy it, and no `OperationsGrid`, shared sheet schema, `.xlsx` reverse-import, import-review UI, dependency, migration, or route change is included. Revisit it from live repository state after the shared architecture boundary is safe.

## 2026-09-18 Repository & Architecture Professionalization — Slice 5 Wave C

The repository professionalization track continues with Slice 5 Wave C.

- Extracted presentation component: `src/components/projects/ProjectPortfolioRegisterSection.tsx`
- What moved: portfolio snapshot disclosure, project counts, attention-signal counts, multi-currency portfolio financial totals, search/status/manager/currency/health/attention filters, sort selector and direction toggles, filter reset bar, responsive desktop table, mobile/tablet cards (`ProjectRegisterCard`), status/health/attention badges, tax-treatment display, financial metric cells, work-package summaries, and Open/Edit/Lifecycle action presentation.
- Pure presentation helpers moved: `money`, `statusTone`, `healthBadgeTone`, `attentionTone`, `financialValue`, `FinancialValue`, `PortfolioFinancialValue`, `portfolioMetricInline`.
- What stayed parent-owned: project source data, cost summaries, client billing/collection data, permissions, completeness checks, `buildProjectManagementView(...)`, `buildPortfolioManagementSummary(...)`, `filterAndSortProjectViews(...)`, filter and sort state, manager and currency option derivation, editing draft creation and validation, project save orchestration, lifecycle preview loading, lifecycle actions, lifecycle reason/error/loading state, lifecycle and editing dialogs, and route/open behavior.
- Line counts: `ProjectsPage.tsx` was reduced from 1,413 lines to 713 lines in the reviewed working tree.
- Invariant confirmation: project financial, lifecycle, currency, tax treatment, permission, audit, route, and history semantics remain completely unchanged. Unknown monetary values are not converted to zero, and mixed currencies are not combined.
- Excel-native confirmation: no Excel-native implementation, `OperationsGrid`, `.xlsx` parser, or spreadsheet dependency was added. Future Excel-native UX remains deferred.

## Wave 4D messaging-provider integration/completion and readiness gate

Wave 4D remains **partially implemented but not complete**. The current approved
Email/SMS Reliability & UX slice is active; do not rebuild the existing
communications workspace or Slice 1 Documents shell.

Approved provider direction remains:

- **Company SIM Gateway — primary/recommended**;
- **PhilSMS — optional hosted Philippine fallback**.

The remaining provider/readiness implementation should:

- inspect the live Wave 4D contract, current provider-neutral SMS scaffolding, delivery-intent/history model, Brevo implementation, permissions, and completed task-first Email/SMS/Documents UI before changing code;
- implement or finish the approved server-side provider path without exposing provider credentials to the browser;
- preserve one reviewed transactional recipient per SMS send and human review/confirmation before consequential outbound sends;
- keep SMS truthfully unavailable/unverified until controlled provider-backed runtime QA succeeds;
- keep Google Sign-In identity-only and preserve historical Gmail-derived source/delivery records without restoring mailbox access;
- certify Brevo only through a controlled QA deployment with client-specific secrets and a verified sender;
- preserve append-only/company-bound delivery history, idempotency/reconciliation boundaries, and source document ownership;
- keep AI/provider prerequisites separately truthful; the exercised QA runtime is now available while hosted/provider/release evidence remains separate from Storage and PDF converter truth;
- preserve the completed UI/UX Round 2 hierarchy while adding provider capability;
- close the remaining Wave 4D provider/AI/recovery/readiness evidence before any Worker Registration work.

Worker Registration remains paused and must not be suggested as the immediate next phase.

---

## 2026-09-19 Repository Intelligence — RI-0 and RI-1

A new developer-only Repository Intelligence initiative is documented at `docs/repository-intelligence/`.

RI-1 is implemented as a local-only, additive source index under
`scripts/repository-intelligence/`. It uses `git ls-files` as the primary inventory,
SHA-256 hashes eligible file bytes, classifies source/test/script/documentation/migration
and excluded generated/vendor/cache/secret/binary paths, and extracts deterministic
TypeScript/TSX symbols, imports, exports, and re-exports through the existing TypeScript
compiler API. Stable symbol IDs use repository path, qualified name, kind, and only a
content-derived disambiguator when duplicates require one; line numbers are never part of
identity.

The cache is a disposable ignored `.cache/repository-intelligence/` manifest plus per-file
records. Repository HEAD and dirty tracked paths are recorded so later RI phases can distinguish
exact-revision indexes from modified worktrees. Full rebuild, incremental update,
rename/add/modify/delete/hash invalidation,
schema/generator invalidation, corrupt-cache recovery, a direct `tsx scripts/repository-intelligence/cli.ts`
index/update/clean/status interface, and focused fixture coverage are included. The index stores
metadata and extracted structure, not full source contents, environment values, credentials,
tokens, connection strings, or private customer-document contents. RI-1 deliberately leaves
`package.json` and the global affected-test selector unchanged so this developer-only tooling
does not force the historical repository-wide regression fallback merely for convenience aliases.

Focused RI-1 evidence is 14/14 tests passing. The real CLI full rebuild indexed 1,129 eligible
files from 1,169 Git-tracked files, and the immediate incremental update reparsed 0 and reused
all 1,129 records with schema `1` and generator `ri-1.0.0`. Lint/typecheck passed on the
implementation head. The final exact-head affected-test and CI evidence belongs to the reviewed
PR head and must be used instead of the superseded earlier fallback run. No browser,
Docker/Supabase, migration, provider, hosted-QA, or production checks are required by this
developer-only slice unless the final diff expands into those domains.

RI-1 does not change `workflow-map:generate`, `workflow-map:check`,
`workflow-map:consistency`, `workflow-map:context`, or `agent:context`, and it introduces no
customer/runtime dependency. The exact next phase is **RI-2 — Unified Graph + Provenance
Query API**; RI-3, explorer work, and RI-7 remain out of scope.

The design preserves the current curated Workflow Map as the semantic foundation. RI-1 now provides the fast incremental source index; later phases add the provenance-preserving unified graph/query API, bounded AI Context Engine, structured/2D developer explorer, change intelligence, and optional 3D visualization.

Key decisions:

- the index/graph is the product; 2D/3D views are consumers;
- source-derived, curated, inferred, and future runtime-observed relationships remain distinguishable;
- curated financial/security/history/permission/source-of-truth facts are never overwritten by inference;
- `agent:context` remains the normal compatibility entry point and already provides Git provenance, affected-test selection, bounded Workflow Map traversal, invariants, permissions, and hard budgets;
- RI-3 should upgrade the graph/context internals while preserving `workflow-map:context` and `agent:context` interfaces;
- local disposable incremental cache is preferred over committing a large generated repository index;
- the explorer is local/developer-only by default and must never enter normal client navigation or expose secrets/source internals to customers;
- Markdown/Mermaid remain supported for GitHub, diffs, accessibility, and no-WebGL environments;
- change intelligence is scheduled before optional 3D because it has higher direct engineering value.

Model/provider direction is neutral. Current ChatGPT/Codex/Luna-compatible workflows can consume the context interface where enabled; no model-specific API is part of the architecture. The active/current main documents inspected for this phase contained no DeepSeek reference, so no historical records were rewritten.

Repository Intelligence core priority is now **RI-2 → RI-3**. After RI-3, pause explorer-focused work and return to the higher-priority structural/product queue unless the user explicitly reprioritizes it. **The optional 3D explorer is the final RI phase and should be last.**

## Completed quality/application context that remains valid

### First comprehensive Local-QA UI/UX pass — complete

PR #150 previously established broad authenticated route/responsive coverage and fixed concrete UI issues. UI/UX Round 2 then raised the bar from structural correctness to workflow clarity and information hierarchy.

### Programmatic PDF visual certification — complete

Programmatic Purchase Order / Client Invoice fallback output received deliberate visual certification, including centering, logos, long values, multi-page behavior, totals, signatures, and preview/download byte identity for exercised records.

Company-template high-fidelity conversion remains a separate capability and must not be falsely represented as certified when converter support is unavailable.

### Functional Local-QA sweep — complete for supported/fixture-backed workflows

The integrated Local-QA sweep exercises key RFQ/PO/Warehouse, supplier payable, client receivable, payroll, Documents->Compose, stale-record, and Document Templates Starter/Upload persistence/retrieval flows. Subcontract settlement remains fixture-blocked where no safe fixture exists. The isolated authenticated AI/template workflow now passes separately; the broad harness still needs route/session cleanup before an overall PASS claim.

### Supplier Payables Settlement Truth & Consistency — complete

Merged PR #158 established and certified the corrected supplier settlement model:

- the verified linked Expense is the supplier payable/settlement authority even when intentionally `DRAFT`;
- generic direct DRAFT Expense settlement remains ineligible;
- payment state comes from confirmed Cash & Banking evidence, not OCR/document-reported `amountPaid`;
- legacy invoice-target evidence projects through the linked Expense relationship;
- reversal restores outstanding while preserving history;
- project/source linkage and cost truth remain intact.

Do not weaken those semantics during Wave 4D or later UI work.

---

## Hosted exact-SHA QA evidence

Earlier hosted-certified application SHA:

`e4ee4ebde489629ee74429b4e37abb511943a51e`

At that certification:

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

That hosted evidence belongs to that earlier application SHA. The newer UI/UX Round 2 application code has strong Local-QA and exact-head CI/browser evidence, but still needs later hosted exact-SHA evidence before release-readiness claims can move forward.

---

## Current provider / optional capability truth

### Google Sign-In / Brevo

Google Sign-In is identity-only and does not grant company access without a
resolved membership and permission set. Brevo is the approved outbound email
provider when a client deployment has a server-only API key and verified sender;
the current branch has no approved QA credentials/recipient, so live provider
delivery remains unverified. Historical Gmail source and delivery rows remain
compatible and are presented as historical records.

### SMS

Approved provider direction remains:

- Company SIM Gateway — primary/recommended;
- PhilSMS — optional hosted fallback.

The approved provider implementation/completion is active in this reliability
slice. Real SMS remains unavailable/unverified until controlled provider-backed QA
succeeds.

### Company-template Storage / AI / conversion

- Starter and safe Upload Storage authority is **AVAILABLE and locally certified** for Purchase Order and Client Invoice persistence/retrieval.
- Real authenticated Local-QA AI template generation is **PASSED for the exercised QA workflow**: runtime capability AVAILABLE, HSC Analyze AVAILABLE, immutable Prepare VALID, Test DOCX passed, and Purchase Order/Client Invoice Generate + persist + refresh + download + Test DOCX passed. Hosted exact-SHA certification remains separate.
- Programmatic PDF fallback is separate and already certified for exercised records.
- Company-template high-fidelity converter-backed PDF remains independently `UNAVAILABLE`.

Do not collapse these four capability states into one generic template/PDF/AI status.

### Subcontract settlement

Remains fixture-limited/not-tested where no safe subcontract/claim fixture exists.

---

## QA / production boundary

`QA CERTIFICATION: NOT READY`

The hosted application and supplier-payables evidence are strong but narrower than full readiness. UI/UX Round 2 adds strong pre-merge authenticated Local-QA and exact-head CI/browser evidence, but the newer application-bearing state is not yet a replacement for hosted exact-SHA certification.

Overall QA remains not ready because remaining provider/readiness limitations still exist, including incomplete Wave 4D provider-backed runtime evidence.

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

Preserve throughout resumed Wave 4D and subsequent work:

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
- provider capability states remain truthful when unavailable/unverified;
- completed UI/UX simplification is never authorization simplification.

---

## Required sequence from this handoff

1. **Combined RI-2 + RI-3 implementation run.** RI-2 must land conceptually first inside the branch; RI-3 then consumes it. Preserve `workflow-map:context` / `agent:context` entry points, current safety-net test selection, curated authority, stale-index fail-closed behavior, and explicit fallback.
2. **Finish the entire remaining Repository & Architecture Professionalization program after RI-3.** Use the new bounded context to complete all still-valid structural and repository-facing work from the canonical professionalization design, not merely the pieces required for Excel.
3. **Professionalization must reach an explicit COMPLETE state before Excel.** No vague "broader program remains in progress" status may remain. Any item that cannot be performed automatically must be resolved into a deliberate documented decision/manual external action rather than left as open implementation scope.
4. **Only after that completion gate, perform Excel Phase 0/readiness, then Excel-Native Phase 1 and the Procurement RFQ/PO pilot.**
5. **Complete remaining Wave 4D provider/readiness evidence** opportunistically when safe provider credentials/devices/QA prerequisites exist.
6. **Resume Wide Documents remaining managed slices.**
7. **Worker Registration remains paused until Wave 4D is complete and explicitly resumed.** Site Attendance follows; Face Recognition remains separately privacy/security gated.
8. **RI-4 through RI-6 are later tooling; RI-7 optional 3D explorer remains LAST.**

Do not skip directly to Worker Registration, and do not let visualization work displace the index/context, reliability, professionalization, Excel-native, provider-readiness, or approved product work above.
---

## Next implementation handoff instructions

The next Luna Max/Codex run remains the combined RI-2 + RI-3 core run for efficiency. Do not mix Excel Phase 0 or Excel feature implementation into it.

After RI-2 and RI-3 merge, the immediate next run is **Repository & Architecture Professionalization Completion**. That run should use the new bounded Repository Intelligence context to finish the canonical remaining program in one deliberate consolidation pass where safe, with an explicit priority order and stop boundary.

Professionalization completion includes the still-valid goals in `docs/superpowers/specs/2026-09-17-repository-architecture-professionalization-design.md`: secondary large-module triage based on responsibilities/context budget, repository hygiene, current branding/repository-facing metadata cleanup where safe, tracked-vs-transient evidence policy, human onboarding/front-door clarity, and integration-aware repository identity/rename evaluation. It must not revive superseded App/server/static-analysis work that is already complete.

Efficiency rules remain strict: pull current main first, one bounded context packet, zero subagents by default, focused tests while editing, one final affected-test pass, and no ritual full suite. Browser/DB/provider validation remains conditional on the actual final diff.

Excel Phase 0/readiness starts only after the professionalization program is explicitly marked COMPLETE.

