# HydroQualiSense Active Roadmap

Status: **ACTIVE — HARDENING-FIRST / NET-NEW PRODUCT FEATURES ARCHIVED / UI SIMPLIFICATION ROUND 3 COMPLETE FOR RECORDED SCOPE — UX-S3A + S3A2 COMPLETE / UX-S3B EVIDENCE CLOSED / UX-S3C IMPLEMENTED FOR RECORDED SCOPE / UX-S3D SUPPLIER INVOICE + CASH SETTLEMENT + PROCUREMENT LIFECYCLE + PAYROLL NORMAL-CYCLE SLICES IMPLEMENTED FOR RECORDED SCOPES / UX-S3E ACCESSIBILITY + RESPONSIVE + VISUAL CERTIFICATION COMPLETE FOR RECORDED LOCAL/DEMO SCOPE / REPOSITORY PROFESSIONALIZATION COMPLETE / UX-W1–UX-W5C IMPLEMENTED FOR RECORDED SCOPES / WIDE DOCUMENTS MANAGED FOUNDATION IMPLEMENTED / JEV V2A + V2B FOUNDATION COMPLETE / PROVIDER & RELEASE CERTIFICATION PARALLEL / UI-R4A + UI-R4B COMPLETE FOR RECORDED SCOPE / UI-R4C IMPLEMENTED FOR LOCAL/DEMO SCOPE / UI-R4D MERGED / REL-AUTH-1 IDLE SESSION & DEPLOYMENT ACCESS RECOVERY NEXT / UI-R4E AFTER REL-AUTH-1**
Repository: `Juvialski/InvoiceApp`  
Last updated: **2026-09-23**

Documentation map: `docs/README.md`  
Product direction: `docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md`  
Current handoff: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`  
Completed UI/UX Round 2 design/acceptance record: `docs/HYDROQUALISENSE_UI_UX_ROUND2_SIMPLIFICATION.md`  
Local-QA/UI/PDF staged plan: `docs/HYDROQUALISENSE_LOCAL_QA_UI_PDF_PLAN.md`  
Supplier Invoice monetary model: `docs/HYDROQUALISENSE_SUPPLIER_INVOICE_MONETARY_MODEL.md`  
**Completed corrective design:** `docs/superpowers/specs/2026-09-13-document-template-ai-autotagging-design.md`

**Email/SMS phase contract:** `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md`
**Security assurance contract:** `docs/HYDROQUALISENSE_CLIENT_SECURITY_ASSURANCE.md`
**Security assurance implementation/evidence plan:** `docs/superpowers/plans/2026-09-15-client-security-assurance.md`
**Repository Intelligence architecture:** `docs/repository-intelligence/README.md` — RI-1, RI-2, and RI-3 implemented
**Repository & Architecture Professionalization design:** `docs/superpowers/specs/2026-09-17-repository-architecture-professionalization-design.md`
**Excel-Native Operations UX workbook/authority design:** `docs/superpowers/specs/2026-09-18-excel-native-operations-ux-design.md` — foundations implemented through bounded Expenses/Supplier Payables
**Current selective workbook-editing interaction direction:** `docs/superpowers/specs/2026-09-20-selective-workbook-editing-ux-direction.md` — browse visually, edit like a spreadsheet, keep consequential workflows controlled
**Blocking worksheet density/clarity correction:** `docs/superpowers/specs/2026-09-20-worksheet-density-clarity-correction.md` — starts with app-wide screenshot investigation/visual triage before evidence-backed UI corrections and UX-W5
**Next developer-tooling research plan:** `docs/repository-intelligence/JEV_WORKFLOW_INTELLIGENCE_V2_RESEARCH.md`
Repository responsibility/evidence decisions: `docs/REPOSITORY_ARCHITECTURE_TRIAGE.md`, `docs/REPOSITORY_EVIDENCE_POLICY.md`
Workflow UX audit: `docs/HYDROQUALISENSE_WORKFLOW_UX_AUDIT_20260909.md`  
Current UI/UX audit evidence: `artifacts/ui-ux-audit/REPORT.md`  
UX-W4.5A visual triage report: `artifacts/ui-ux-audit/UX-W4.5A-REPORT.md`
UX-S3A comparative research and instruction-density audit: `artifacts/ui-ux-audit/UX-S3A-RESEARCH-AND-INSTRUCTION-DENSITY-AUDIT.md`
Client deployment strategy: `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`

Live repository state and `AGENTS.md` override remembered chat summaries and historical plans.

## 2026-09-21 hardening-first reprioritization and UI Simplification Round 3

The user has explicitly paused net-new product feature development in order to improve the quality of the existing application before expanding scope.

### Archived / deferred feature-expansion backlog

Preserve these phases for later, but do not select them as the next implementation work unless the user explicitly resumes feature expansion:

- Worker Registration;
- Site Attendance and new workforce attendance capability;
- Face Recognition Attendance;
- remaining UX-W5 workforce/product editors when they introduce new domain capability;
- Finance UX-W6 feature expansion;
- typed custom fields / Add Column product architecture;
- broader Wide Documents artifact aggregation and optional handover-package grouping;
- other net-new product domains or feature families.

These phases are **archived/deferred, not cancelled**.

### Active hardening tracks

The active program is now:

1. **UX-S3A + UX-S3A2 — Comparative UI research, app-wide instruction-density audit, and Jev-browser validation are complete for the recorded research boundary.** The durable report at `artifacts/ui-ux-audit/UX-S3A-RESEARCH-AND-INSTRUCTION-DENSITY-AUDIT.md` records direct public comparator observations, current safe-demo route/state evidence, the Keep / Shorten / Contextual Help / Help Center / Remove classification, matched Jev/Codex browser results, shared root causes, workflow friction, Help Center taxonomy, limitations, and the S3B readiness decision. No broad UI remediation was implemented.
2. **UX-S3B — Help Center + contextual-help foundation and targeted browser evidence are closed for the recorded boundary.** The canonical 35-topic/13-category registry, `/help` deep links, shared route-aware Help actions, contextual popovers, and durable structured scenarios are implemented. The merged PR #228 protected run was green but did not include Help scenarios; this continuation added the missing index/article responsive matrix, search/category/deep-link/history/fallback, two non-demo header actions, and Email attachment contextual-help Escape/focus coverage. Local production-server Demo Visual QA passed the full 123-scenario/36-route/4-viewport catalog with zero console, page, request, and overflow failures. This does not claim authenticated comparator parity, hosted/provider/production certification, or S3D completion.
3. **UX-S3C — App-wide visible-copy simplification is implemented for the recorded scope.** Shared page/section chrome was shortened, duplicate Email/SMS attachment/draft guidance was removed while the contextual Help and provider/human-confirmation semantics remained, Procurement workbook education now follows the working register, and representative Dashboard, Projects, Project Workspace, Cost Codes, Supplier Invoices, Expenses, Cash & Banking, Documents, Email/SMS, Payroll, Settings, Warehouse, Equipment, Vendors, Reports, and worksheet copy was simplified. Financial/source, lifecycle, permission, provenance, provider, approval/payment, and review-before-Apply boundaries remain visible.
4. **UX-S3D — Supplier Invoice review queue, Cash settlement/reconciliation, Procurement lifecycle, and Payroll normal-cycle hardening are implemented for their recorded scopes.** Supplier queue mode keeps one truthful `Verify & Create Expense & Next` action in the sticky queue footer; Cash uses non-mutating queue review, intentional transaction selection, explicit allocation confirmation, transfer separation, and result/return continuation; Procurement and Payroll keep their deliberate Save/Review/Approve/Issue/Payment boundaries. Source evidence, financial authority, warning confirmation, save state, audit/history, lifecycle, freshness, and settlement boundaries are unchanged.
5. **UX-S3E — Accessibility, responsive, and visual certification is complete for the recorded local/demo scope.** The final existing Demo Visual QA catalog passed 131/131 scenarios with 131 screenshots, 112 interactions, 36 routes, four viewports, and zero console/page/request/overflow failures. Keyboard/focus checks cover mobile navigation, contextual Help, RFQ/PO dialogs, and phone action-bar reachability. The durable evidence is `artifacts/ui-ux-audit/UX-S3E-ACCESSIBILITY-RESPONSIVE-VISUAL-CERTIFICATION.md`. This does not claim hosted/authenticated QA, provider certification, production readiness, full WCAG conformance, or populated RFI/Submittal detail certification.
6. **Application hardening in parallel.** Continue reliability, recovery, validation, concurrency, security/data-integrity, performance, provider/readiness certification, authenticated document/render certification, and exact-SHA release evidence when their prerequisites exist.
7. **Developer-efficiency hardening.** Jev/Repository Intelligence work may continue when it improves context selection, review, evidence, or implementation efficiency without expanding customer-facing product scope.

Canonical design/research contract: `docs/superpowers/specs/2026-09-21-ui-simplification-contextual-help-research.md`.


### 2026-09-22 user-directed UI Improvement Round 4 — next after UX-S3E

The user has explicitly authorized a new **UI Improvement Round 4** after the UX-S3E closeout. This is an existing-product design and usability program, not authorization to resume unrelated deferred product domains.

Round 4 must begin research-first rather than by immediately rewriting the Dashboard. The approved direction is:

1. **UI-R4A — research + design blueprint: COMPLETE.** Evidence is recorded in `artifacts/ui-ux-audit/UI-R4A-COMPARATIVE-VISUAL-RESEARCH.md` and the approved blueprint.
2. **UI-R4B — shared visual foundation: COMPLETE FOR RECORDED SCOPE.** Semantic theme behavior, shared controls, compact filters, and bounded Projects proving work are recorded in `artifacts/ui-ux-audit/UI-R4B-SHARED-VISUAL-FOUNDATION.md`.
3. **UI-R4C — Home Dashboard + Project Portfolio: IMPLEMENTED FOR LOCAL/DEMO SCOPE.** One stable Home, permission-aware launch and bounded attention, secondary Operations Insights, responsive project cards, Light/Dark coverage, and durable visual evidence are recorded in `artifacts/ui-ux-audit/UI-R4C-HOME-PROJECT-PORTFOLIO.md`.
4. **UI-R4D — relevant entity media foundation: COMPLETE FOR RECORDED LOCAL/DEMO + LOCAL-SUPABASE SCOPE.** Durable storage/security/database and lead-inspected visual evidence is recorded in `artifacts/ui-ux-audit/UI-R4D-ENTITY-MEDIA.md`. The S3-compatible bucket path, hosted QA, production, and provider certification remain unverified. [PR #240](https://github.com/Juvialski/InvoiceApp/pull/240) merged safely as `8df6685ae80452d1a62d6f853b51ddedc69bd735` after exact-head protected CI passed.
5. **REL-AUTH-1 — Idle Session & Deployment Access Recovery: NEXT.** Fix the user-confirmed false `Company access unavailable` state that can appear after extended idle/background time even though a normal refresh restores the same authorized user. Preserve last-known-good same-user access across transient verification failures, recover stale sessions once when the refresh token remains valid, distinguish terminal session expiry from confirmed revocation, keep real revocation/deployment mismatch fail-closed, and add idle-return regression/browser evidence. Do not absorb the broad R4E visual migration.
6. **UI-R4E — app-wide rollout + professional certification: AFTER REL-AUTH-1.** Apply the approved shared grammar to remaining existing routes and certify both light and dark themes across the standard four viewports, including keyboard/accessibility and visual inspection. Desktop shell cleanup includes removing the redundant permanent upper row, making normal successful sync silent, moving export actions to Documents/Reports/relevant workflows, and keeping account identity + Log out in the lower-left sidebar account area; mobile/tablet may retain a minimal navigation-trigger header.

**UI-R4A is complete as a research/documentation-only phase.** The lead inspected current source and the immediately preceding four-viewport S3E evidence, then performed a new direct visual pass over public screenshots/rendered examples from Procore, Autodesk Construction Cloud/Build, Buildertrend, Fieldwire, Raken, Linear, and Airtable. The evidence deliberately distinguishes transferable interaction principles from proprietary visual copying. The durable research artifact is `artifacts/ui-ux-audit/UI-R4A-COMPARATIVE-VISUAL-RESEARCH.md`; the implementation contract is `docs/superpowers/specs/2026-09-22-ui-r4-professional-design-blueprint.md`.

UI-R4B is implemented for its shared-foundation and bounded Projects proving scope. The durable evidence is `artifacts/ui-ux-audit/UI-R4B-SHARED-VISUAL-FOUNDATION.md`. It records the exact starting SHA, direct Linear/Fieldwire/Procore visual calibration, System/Light/Dark preference/bootstrap, semantic shared roots, Astryx-backed action hierarchy, compact filter/disclosure primitives, Projects proving integration, and the lead-inspected four-viewport safe-demo matrix. The local catalog passed 131/131 scenarios with zero console, page, request, navigation, or overflow failures. A downstream Procurement register still shows legacy light-card fills in a Dark probe; that broader rollout remains intentionally deferred rather than widened into R4B.

R4B is implemented for its shared-foundation and bounded Projects proving scope. R4C is now implemented for local safe-demo scope; its closeout records stable Home routing, permission/source behavior, project-card refinement, and lead-inspected Light/Dark evidence at desktop, constrained laptop, tablet, and phone. The durable report is `artifacts/ui-ux-audit/UI-R4C-HOME-PROJECT-PORTFOLIO.md`.

UI-R4D is now implemented for its recorded local/demo and local-Supabase scope; its durable storage/security/database and lead-inspected visual evidence is recorded in `artifacts/ui-ux-audit/UI-R4D-ENTITY-MEDIA.md`. Each Round 4 implementation slice must include actual screenshot inspection by the lead at affected standard viewports; automated overflow/accessibility checks are not sufficient evidence of professional visual quality. REL-AUTH-1 is the next bounded reliability phase; UI-R4E follows after REL-AUTH-1.

Key user concerns that Round 4 must address include the current Dashboard carrying too much detailed operational/analytics content, generic-looking project cards, oversized filter controls consuming multiple laptop rows, inconsistent button/action hierarchy, lack of dark mode, and lack of relevant imagery on projects/equipment/materials.

Round 4 must preserve the standing interaction rule: **browse visually -> edit like a spreadsheet -> execute sensitive workflows deliberately**. Detailed financial/operational analytics should be relocated or navigated to rather than deleted. Dark mode must cover charts, tables, inputs, dialogs, worksheets, status colors, and overlays rather than only changing the page background.

Worker Registration, Site Attendance expansion, Face Recognition, Finance UX-W6, custom-field architecture, and unrelated new product domains remain deferred unless explicitly resumed.

### UX-S3A2 Jev-browser comparative validation complete — UX-S3B ready

UX-S3A produced a useful baseline at source SHA
`567013c8f0b851468cc8d0c4bbe1eb11d3fdf6cf`. The report is
`artifacts/ui-ux-audit/UX-S3A-RESEARCH-AND-INSTRUCTION-DENSITY-AUDIT.md`.
It remains documentation/evidence only: no Help Center, contextual-help primitive,
visible-copy mass simplification, workflow redesign, provider work, database
change, or production operation was performed.

Review identified one evidence gap before UX-S3B: the intended deep multi-product
interactive Chrome investigation was not demonstrated, and the existing Jev
integration had not operated the browser. UX-S3A2 closed that gap for the
accessible public boundary on exact validation SHA
`4e00c1375c278394dd8db567732dd7ec56990022`: the community
`jev-browser-use` bridge operated through the existing CUA in-app browser,
matched Raken and Fieldwire tasks were independently verified, Procore was
inspected through a deeper process-guide hierarchy, and Autodesk/Buildertrend
limitations were recorded. The benchmark is small and does not establish a
general speedup; dynamic/stale accessibility state still requires Codex
handback and final verification. UX-S3B is now ready as the bounded
Help Center/contextual-help foundation.

S3A2 integration evidence: `wy-coliney/jev-browser-use` plugin `0.1.0` at
source commit `f14b60e0ae1ee90cd73eb6650e30a666a84c021a` was installed as a
runtime-only Skill outside InvoiceApp and imported through the existing Codex
CUA in-app browser. Raken and Fieldwire matched tasks both reached their target
pages after independent Codex verification (2/2); the small benchmark showed
stale-state handbacks and no general speedup claim. `browser-use/jev-ultrafast`
was reviewed at `1231850a0bf1a0c0341fe408ef1668dbbfdfac46` but not installed
because the primary bridge was compatible enough and the fallback uses a
separate Browser Harness architecture. No custom adapter, application
dependency, credential, browser profile, or external mutation was added.

This override supersedes older wording that names workforce expansion, Finance UX-W6, custom fields, broad Documents expansion, or other net-new feature work as the next implementation phase.

### 2026-09-22 UX-S3B evidence closeout + UX-S3C visible-copy simplification

The UX-S3B prerequisite and UX-S3C continuation start from synchronized `main`
SHA `aaef614e0c719adf105a54d2e07866ca6813a8e0` on branch
`codex/ux-s3c-visible-copy-simplification`. The earlier merged PR #228 exact
head and protected run remain historical S3B evidence; that run did not contain
the new Help scenarios, so this branch adds the missing durable coverage before
the S3C copy pass.

The implementation adds one canonical repository-backed Help model at
`src/help/helpCatalog.ts` and keeps `src/assistant/helpCatalog.ts` as a
compatibility projection. It contains **35** current-state topics across all
**13** S3A taxonomy categories and **16** business-route default mappings.
Topics include Supplier Invoice review, project costing, procurement workbook
review, Expenses, Cash & Banking/settlements, Documents/version history,
Email/SMS/provider status, payroll readiness/runs, company access/permissions,
warehouse/equipment, vendor identity, corrections/recovery, and worksheet
tips. No future/deferred product capability is documented as available.

`/help` is a known non-business route with stable `/help?topic=<id>` links,
search/category navigation, one selected article view, graceful unknown-topic
fallback, direct refresh, and browser history behavior. Major working-page
headers use one shared route-aware Help action; the Help Center opts out of its
own action and Help does not enter business permission routing or navigation
highlighting.

`ContextualHelp` is a native-button, click/tap, keyboard-reachable,
Escape/outside-dismissable, focus-restoring, non-trapping popover with bounded
responsive positioning and optional Help Center links. Safe exemplars are
Email/SMS attachment eligibility, Documents origin filtering, and regional
settings terminology. Existing provider, permission, source, financial,
history, lifecycle, and human-confirmation copy remains visible.

Validation for the implementation head:

- focused S3B/routing/Assistant/shared-UI suite: **42/42**;
- deterministic `npm.cmd run test:affected:agent`: **386/386**, 56/366 selected,
  database fallback disabled;
- the pre-review integrated `npm.cmd test` run was **2042 pass / 1 fail / 9 skipped**;
  the sole failure was a stale `PageHeader` source-shape assertion in
  `tests/uiHardeningShared.test.ts`. PR review aligned that assertion with the
  intentional `data-ui="page-header"` markup, and the corrected assertion is
  covered by exact-head affected validation. The full suite was not rerun after
  this test-only correction because focused/affected validation is sufficient;
- `npm.cmd run lint`: passed;
- `npm.cmd run build`: passed, with existing Astryx font/bundle-size and CJS
  `import.meta` warnings; generated theme artifacts were not included in the
  feature diff;
- `npm.cmd run workflow-map:consistency`: passed — 262 nodes, 346 edges,
  34 invariants, 10 diagrams;
- local CUA browser inspection: Help index, invoice-review deep link, unknown
  topic fallback, browser back, project route Help action, payroll search query,
  and Email attachment contextual popover click/Escape/focus behavior passed;
- local CUA verified Help index/article, search/category navigation,
  unknown-topic fallback, direct refresh, browser back/forward, Projects and
  Cash & Banking PageHeader Help actions, and Email attachment contextual Help
  click/Escape/focus restoration at desktop and phone width;
- local production-server `npm.cmd run qa:demo` passed **123/123** scenarios
  across **36** routes and **4** standard viewports, with **104** interaction
  scenarios, **123** screenshots, zero console/page/request failures, and zero
  horizontal-overflow failures;
- S3C regression coverage preserves critical safety/provider copy, removes the
  duplicate attachment instruction, and verifies Procurement workbook
  education follows the register. Visual inspection covered Projects,
  Procurement, Supplier Invoice review, Cash & Banking, Email/SMS, Payroll,
  Settings, and phone-width communications;
- S3C validation passed focused **42/42**, affected application selection
  **761/761** with one skipped test and database fallback disabled,
  lint/typecheck, and production build. Existing Astryx font/bundle and CJS
  `import.meta` warnings remain.

The single live Jev start/context checkpoint was attempted with sanitized
metadata but fell back with `WorkflowContextSelectionError`; no Jev judgment
was used. Deterministic context, source review, required tests, and browser
evidence remain authoritative. Database, provider, hosted QA, and production
checks were skipped because this is a static UI/application diff; no
migration, RLS/RPC, provider, or production mutation occurred.

The S3B targeted browser gate is closed for this continuation. UX-S3C is
implemented for the recorded visible-copy boundary; workflow redesign remains
out of scope. No Settings capability status changed.

### 2026-09-22 UX-S3D — Supplier Invoice queue action hardening

The bounded UX-S3D slice starts from synchronized `main` SHA
`031729c4ad789f22913d6b9930d572fc5455faf4` and is implemented in commit
`ce7f9b5a721c7c8ec52b952e560ff22bc4c0b16c` on branch
`codex/ux-s3d-workflow-friction`.

Queue-mode Supplier Invoice review now exposes the consequential
`Verify & Create Expense & Next` action only in the sticky queue footer. The
review-bar action is suppressed only while a review session is active;
standalone review continues to expose its direct `Verify & Create Expense`
action. The footer label is shared with the review-bar label source so repair
mode remains explicit as `Save & Create Expense & Next`.

No financial/source authority, supplier evidence, canonical Vendor resolution,
linked Expense ownership, warning confirmation, save/error recovery, audit
history, permission, concurrency, lifecycle, database, provider, or route
contract changed. This is a presentation/action-placement correction only.

Validation for the exact application-bearing commit:

- focused Supplier Invoice/worksheet suite: **13/13**;
- deterministic `npm.cmd run test:affected:agent`: **74/74**, **11/368** selected,
  database fallback disabled;
- Jev test-triage: **1** live request over **11/11** required tests, model
  `jev-1.13.0`, **1,573 / 159** input/output tokens, **742 ms**, fallback
  `false`; every required test was retained and the new queue regression was
  ranked highest;
- `npm.cmd run lint`: ESLint and TypeScript passed;
- `npm.cmd run build`: passed with existing Astryx font/chunk-size and CJS
  `import.meta` warnings;
- exact-head local production-server Demo Visual QA at commit
  `ce7f9b5a721c7c8ec52b952e560ff22bc4c0b16c`: **123/123** scenarios, **104**
  interactions, **123** screenshots, **36** routes, **4** viewports, zero
  console/page/request/overflow failures. Supplier Invoice review passed at
  desktop, tablet, and phone states;
- Workflow Map consistency was not run because no route/workflow-map contract
  changed. Docker/Supabase, hosted QA, provider, and production checks were
  not applicable to this UI-only diff. The full suite was not run by ritual.

### 2026-09-22 UX-S3D — Cash settlement and reconciliation workflow hardening

This bounded slice starts from synchronized `main` SHA
`d1cfa93ca04320f800db9737635ec23a6e002b36` on branch
`codex/ux-s3d-cash-settlement-hardening`.

Cash & Banking now presents one staged operating-settlement path:
`Browse account -> Choose transaction / target -> Review allocation -> Confirm /
continue`. The unresolved queue no longer confirms suggested matches directly;
its `Review allocation` link preserves the exact Cash route and any target/source
return context. The allocation workspace no longer selects an arbitrary first
transaction, marks candidates as advisory until confirmation, excludes confirmed
internal-transfer rows from operating-settlement choices, and reports the
recorded result with affected target and return/open-target continuation.

The dedicated internal-transfer workflow remains separate, including paired-row
confirmation/reversal semantics. Failed confirmation leaves draft allocation and
review context truthful. No settlement math, source-record ownership, lifecycle,
permission, RLS/RPC, migration, persistence, provider, or database contract
changed.

Validation for this implementation branch:

- focused Cash/settlement/demo/browser-contract tests: **43/43**;
- deterministic `npm.cmd run test:affected:agent`: **652/652**, **82/368**
  selected, database fallback disabled;
- `npm.cmd run lint`: ESLint and TypeScript passed;
- `npm.cmd run typecheck`: passed;
- `npm.cmd run build`: passed with existing Astryx font/chunk-size and CJS
  `import.meta` warnings;
- exact-head local production-preview Demo Visual QA: **124/124** scenarios,
  **124** screenshots, **36** routes, **4** viewports, zero console/page/request/
  overflow failures; Cash browse/choice, split confirmation/result desktop and
  mobile, transfer separation, supplier target context, and client collection
  target continuation all passed and representative screenshots were visually
  inspected;
- the single live Jev start/context checkpoint used the fresh deterministic
  packet, found no optional candidates, dispatched zero live requests, and fell
  back to deterministic source/evidence;
- the one sanitized Jev completion/evidence attempt returned a `TypeError`
  before a response; no Jev completion judgment was used and deterministic
  evidence remained authoritative;
- database validation was not applicable because no migration, RPC, RLS,
  persistence, locking, or financial guard changed. Hosted QA, provider, and
  production certification remain separate and unclaimed.

At this historical cash-slice checkpoint, the next unfinished S3D slice was
Procurement lifecycle hardening, followed by Payroll normal-cycle hardening;
UX-S3E accessibility/responsive/visual closeout remained later. The current
Procurement status is recorded in the section below.

### 2026-09-22 UX-S3D — Procurement lifecycle workflow hardening

This bounded slice starts from synchronized `main` SHA
`9b0810193ca4a6d7eb2221f6320b8d7177509164` on branch
`codex/ux-s3d-procurement-lifecycle`. The application-bearing implementation
head is `6f7a59f5cd2e979485e3b987b6b76d39a57f5411`; the exact demo-evidence
head is `7baa892c090ccdf17e0ad32fa2688b28ea3f5b44`.

The Procurement lifecycle now keeps the existing workflow staged and truthful:

- a new unsaved PO exposes `Save Draft` only, explains that approval requires a
  persisted draft, and never treats an Approve action as a save;
- a persisted draft still exposes the existing authoritative `Approve PO`
  transition separately from Save Draft;
- RFQ `Issue` opens an explicit confirmation stage that explains it does not
  select a supplier or create a PO, preserves retryable failure state, and then
  calls the existing lifecycle callback;
- successful selected-quotation conversion continues to Purchase Orders,
  filters to the requested PO number, and reports an uncommitted draft awaiting
  review/save/approval;
- issued POs with outstanding receipt quantity keep Close visibly disabled with
  the existing authoritative close guard preserved;
- the demo route now receives its seeded RFQ/quotation evidence so browser QA
  can inspect the real RFQ Issue state without inventing a lifecycle result.

The existing workbook hierarchy was verified in live source and browser
evidence: the active RFQ/PO register remains before the secondary workbook
panel. Import remains `Review proposals -> select -> confirm -> Apply`; no
workbook action performs approval, issue, receipt, close, cancellation, or
supplier selection.

Validation for the exact application/evidence head:

- focused Procurement/RFQ/PO/workbook/domain suite: **68/68**;
- deterministic `npm.cmd run test:affected:agent`: **359/359**, **55/368**
  selected, database fallback disabled;
- `npm.cmd run lint`: ESLint and TypeScript passed;
- `npm.cmd run build`: passed with existing Astryx font/chunk-size and CJS
  `import.meta` warnings;
- exact-head local production-preview Demo Visual QA at `7baa892`: **127/127**
  scenarios, **36** routes, **4** viewports, **108** interaction scenarios,
  **127** screenshots, zero console/page/request/overflow failures. RFQ Issue
  confirmation, its safety boundary, new-PO approval absence, save-before-
  approval notice, register-before-workbook hierarchy, and phone states passed;
- Jev start/context: deterministic packet had no Workflow Map match and the
  one live context checkpoint returned no candidates, dispatched zero live
  requests, and fell back deterministically;
- Jev completion/evidence: one sanitized live attempt returned `TypeError`
  before a response; no Jev completion judgment was used;
- no Docker/Supabase, hosted QA, provider, or production validation was run or
  claimed because no migration, RPC, RLS, schema, persistence, locking, or
  financial/inventory guard changed.

Financial/source authority, committed-cost semantics, RFQ/quotation history,
supplier-selection audit, PO approval/issue/receipt/close lifecycle, Warehouse
continuation, permissions, company isolation, concurrency, currency, and
review-before-Apply boundaries remain unchanged. The next unfinished S3D slice
is Payroll normal-cycle hardening; UX-S3E accessibility/responsive/visual
closeout remains later.

### 2026-09-22 UX-S3D — Payroll normal-cycle workflow hardening

This bounded slice starts from synchronized `main` SHA
`2a323638e88985648375216f9e6fd3ca27ef479c` on branch
`codex/ux-s3d-payroll-normal-cycle`.

The normal Payroll cycle now keeps the existing authority sequence explicit:
`select period -> prepare/import inputs -> review exceptions -> calculate -> review calculated snapshot -> approve -> Cash & Banking payment -> confirmed result/history`.

The implementation replaces the Overview-side calculation shortcut with a
concise next-step card; makes calculation await the authoritative App callback
with in-flight, retry, and post-resolution result states; adds an explicit
approval review/confirmation stage with period, entry, gross, employee net-pay,
allocation, unallocated-cost, warning, and stale-source information; surfaces
the existing source fingerprint/revision validator before approval; makes
period editing metadata-only with run/history-derived display state and no
editing of Approved/Paid/Void history; and keeps Approved distinct from Paid
with the existing Cash & Banking record-payment continuation.

Deterministic browser coverage now includes the Payroll overview next step and
approved Cash handoff at desktop and phone widths.

Validation for the integrated working tree:

- focused normal-cycle, Payroll, Cash settlement, lifecycle, routing, and
  authority regressions passed;
- deterministic `npm.cmd run test:affected:agent`: **651 pass / 0 fail / 1
  skipped**, **86/369** selected, database fallback disabled;
- `npm.cmd run lint:eslint`, `npm.cmd run typecheck`, and `npm.cmd run build`
  passed; build output retained the repository's existing Astryx font,
  chunk-size, and CJS `import.meta` warnings;
- exact local production-preview Demo Visual QA: **129 screenshots / 111
  interaction scenarios / 36 routes / 4 viewports**, zero console/page/request/
  overflow failures; all four new Payroll scenarios passed;
- Workflow Map tests passed after retaining the canonical pre-existing Payroll
  QA scenario IDs alongside the new states;
- Jev `agent:context` was attempted once and fell back before Jev because
  `payroll` is not a supported Workflow Map domain. The one live `test-triage`
  attempt over the deterministic affected set and the one live sanitized
  completion/evidence attempt both returned `TypeError` before a response;
  deterministic evidence remained authoritative and no Jev judgment was used;
- Docker/Supabase, migration replay, pgTAP, hosted QA, provider, and
  production validation were not applicable because no migration, RLS, RPC,
  DB guard, persistence authority, locking, or settlement DB behavior changed.

Payroll financial math, source fingerprints, approval permission checks,
finalized/void history, allocation visibility, company isolation, privacy, and
Cash settlement authority remain unchanged. UX-S3D is complete for its
recorded Payroll normal-cycle scope. The planned **UX-S3E
accessibility/responsive/visual certification** is now complete for the
recorded local/demo evidence scope; hosted/authenticated/provider/production
certification remains separate and unclaimed.

## Current priority sequence

1. **RI-2 → RI-3 → Repository & Architecture Professionalization Completion is complete in the current implementation boundary.** RI-2 graph/query, RI-3 bounded context integration, responsibility triage, repository hygiene, evidence policy, onboarding/front-door synchronization, safe current branding cleanup, and repository-identity evaluation are recorded with focused evidence.
2. **Professionalization completion gate is closed.** Remaining large/shared modules have explicit decomposition or intentional-retention decisions; current source/test ownership and tracked-vs-transient evidence policy are documented; the external repository rename is a documented manual administrative choice rather than an open architecture task.
3. **Excel Phase 0/readiness, the original shared foundation, Procurement, Projects/project controls, bounded Phase 4A Expenses + Supplier Payables, UX-W1, UX-W2, UX-W3, and all bounded UX-W4 draft editors are implemented.** **UX-W4.5A app-wide screenshot investigation, UX-W4.5B shared responsive/editor foundations, UX-W4.5C task-first hierarchy plus bounded workspace-width/visual-grammar corrections, UX-W4.5D Supplier Invoice/worksheet clarity, and UX-W4.5E App-Wide Visual Consistency & Professional-Finish Certification are implemented for their recorded scopes.** UX-W5A Project Materials & Project Equipment, UX-W5B Warehouse Item Master + Canonical Equipment Master, and UX-W5C Vendor Master worksheet maintenance are implemented for their bounded scopes; remaining UX-W5 operational bulk-data editors require separate bounded slices. App-wide Excel capability is not claimed.
4. **UX-S3A baseline research/evidence, UX-S3A2 Jev-browser comparative validation, UX-S3B targeted browser evidence, UX-S3C visible-copy simplification, UX-S3D Supplier Invoice queue, Cash settlement/reconciliation, Procurement lifecycle, Payroll normal-cycle hardening, and UX-S3E accessibility/responsive/visual certification are implemented for their recorded boundaries.** Exact local production-preview Demo Visual QA passed 131 scenarios across four viewports with zero browser/overflow failures; keyboard/focus and final screenshot inspection are recorded in `artifacts/ui-ux-audit/UX-S3E-ACCESSIBILITY-RESPONSIVE-VISUAL-CERTIFICATION.md`. This closes UI Simplification Round 3 for the defined local/demo scope; provider/readiness, hosted/authenticated, and production certification remain separate tracks.
5. **Jev Workflow Intelligence v2A — research, calibration, and integration design — is complete for this implementation run.** The durable report records read-only authenticated X research, official/community source review, 48 controlled live Jev requests over sanitized metadata, historical calibration, and a prioritized v2B design. Jev remains advisory only; see `docs/repository-intelligence/JEV_WORKFLOW_INTELLIGENCE_V2_RESEARCH.md`.
6. **Jev Workflow Intelligence v2B — payload-safe foundation slice — is implemented for this run.** Shared preflight/diagnostic primitives, deterministic clean-baseline task seeding, budget-aware ordered chunking, context reranking, broad test triage, and deterministic must-keep/required-test unions are now integrated. Remaining v2B experimental slices stay deferred; Jev remains advisory-only and no application/runtime Jev or automatic model/subagent routing was added.
7. **Complete remaining Wave 4D provider/readiness evidence when external prerequisites are available.** Controlled Brevo/SMS certification may proceed opportunistically whenever safe credentials/device/runtime exist without displacing the bounded UX-W5 slices.
8. **UX-W5C Vendor Master worksheet maintenance is implemented.** Remaining UX-W5 product slices stay queued and bounded; Workers, Attendance, Time Entries, and Project Assignments remain subject to the workforce/Worker Registration sequencing gate. Jev work is not a product dependency.
9. **Wide Documents managed standalone files, immutable versions, general upload, retained artifact registration, and Documents detail are implemented for the recorded scope.** Remaining broad artifact aggregation, authenticated HSC/render certification, and optional handover packaging remain separately bounded; **Worker Registration** stays paused until Wave 4D is genuinely complete and explicitly resumed. Site Attendance follows; Face Recognition still requires separate privacy/security design.
10. **RI-4 through RI-6 remain later developer tooling; RI-7 optional 3D is LAST.**

Release/readiness certification remains a parallel track and should run when its exact prerequisites exist. A structural merge never implies hosted certification or production authorization.

## 2026-09-21 TypeSafe Jev developer-intelligence — standard advisory workflow

The developer-only TypeSafe layer under
`scripts/developer-intelligence/typesafe/` uses the official
`@typesafe-ai/sdk` 0.6.0 for sanitized advisory context reranking, deterministic
test prioritization, failure classification, and completion/evidence checks.
The user has promoted Jev from a rare opt-in pilot to the standard advisory
checkpoint workflow for substantial bounded phases when `TYPESAFE_API_KEY` is
available. Deterministic RI/Workflow Map context, current source,
`test:affected:agent`, risk-domain validation, exact-head CI, and lead review
remain authoritative; normal CI and application/runtime bundles make no live
TypeSafe requests.

Standard checkpoints are: one context rerank immediately after clean
synchronization and the bounded deterministic context packet, optional
`test-triage` when the deterministic affected set is meaningfully broad, one
completion/evidence check before PR delivery, and conditional `ci-triage` only
for a real noisy failure. `doctor` is reserved for actual setup/API problems and
`benchmark` for deliberate evaluation rather than routine implementation.

Fresh worktrees must install the already-declared dev dependency when needed:
if `@typesafe-ai/sdk` is locked but missing locally, use
`npm ci --include=dev` and verify `npm ls @typesafe-ai/sdk`; do not change
dependency declarations merely to make Jev resolve. UX-W5A confirmed this path
with a successful live request using `jev-1.13.0`: 3 -> 3 candidates, 728 input
tokens, 55 output tokens, 776 ms, fallback=false. The earlier broader benchmark
remains useful evidence of where Jev can reduce optional context: 40 -> 18
candidates, 52.75% character reduction, 100% must-keep retention, 90%
expected-relevant retention, fallback=false.

Planning now prefers wider but still coherent bounded phases when related work
shares one workflow/authority model, roughly 1.5-3x the former micro-slice size
as a heuristic. Do not bundle unrelated domains, new DB/security authorities, or
multiple independent lifecycle systems merely to increase Jev usage. UX-W5A,
UX-W5B, and UX-W5C are implemented for their recorded scopes. Jev Workflow
Intelligence v2A research/calibration and the v2B payload-safe foundation are
complete; later v2B experiments remain deferred. Subsequent product slices use
the standard advisory checkpoints only when they provide useful evidence.

## 2026-09-21 Jev Workflow Intelligence v2B — payload-safe foundation implemented

The first v2B implementation slice is complete on feature branch
`codex/jev-workflow-intelligence-v2b`, starting from synchronized `main`
`94fc6a181edbf6162d7aa2f498e06802caaf2b53`. It remains developer-only and
advisory; no application/runtime, database, provider, customer-data, merge,
model-routing, or subagent authority changed.

Implemented foundations:

- exact serialized-payload preflight, question-key validation, safe neutral
  aliasing for semantic authority false positives, and unchanged 20,000-character
  sanitizer enforcement;
- normalized preflight, sanitizer, provider, success, fallback, chunk, usage,
  and sanitized effectiveness-ledger diagnostics;
- deterministic task seeding from explicit selectors, changed files, tracked
  developer-tooling scopes, and RI metadata, with truthful `no-candidates`
  fallback;
- reusable ordered serialized-budget chunking with local fail-open chunk
  fallback and duplicate-free coverage;
- multi-axis context judgments (relevance, boundary, validation, review risk)
  with raw axes retained and deterministic must-keep union;
- broad test triage chunking that keeps every deterministic required test and
  exposes Jev only as advisory ordering.

Stable-head live evidence used sanitized metadata only: context seeding/reranking
processed **28 candidates in 3 requests**, selected **14** with **14**
deterministic protected candidates, `jev-1.13.0`, **13,200 / 2,008** input /
output tokens, **2,041 ms**, `fallback=false`, and fresh RI status. The
synthetic 75-test case retained **75/75** required tests in **2** requests;
the earlier real affected set retained **11/11** in one request. Additional
working-tree synthetic 75-test evidence was successful with **2 requests**,
**9,173 / 1,113** tokens, **1,802 ms**, and no fallback.

Focused v2A/developer-intelligence tests pass **42/42**; TypeScript and focused
ESLint pass. The final affected runner passed **93/93** selected tests from
**11/355** deterministic files with database fallback disabled; full lint
exited **0**. The final live completion/evidence call fell back on a provider
API error after **653 ms**, while deterministic evidence found implementation,
tests, and documentation present with no unresolved uncertainty; it provided
no merge decision. Remaining v2B work includes later adjacency,
requirement/evidence, replay, routing-advice, and other experimental slices;
no automatic test skipping, merge/release/production decision, model downgrade,
or subagent authorization is present.

## 2026-09-20 selective workbook editing UX correction

The user clarified that the target is **not** to make every applicable landing page look like Excel. The desired product grammar is:

**Browse visually -> edit like a spreadsheet -> execute sensitive workflows deliberately.**

Immediate requirements:

- Projects becomes card-first so project names and identity are visually prominent; the whole card opens the project, with a clear secondary Edit Project Details action and an optional compact list for high-volume use.
- Project Details and Cost Codes become worksheet-style edit surfaces rather than conventional stacked forms.
- Supplier invoice extraction review places the source invoice image/PDF on top and the extracted editable header/vendor/line/totals data below in worksheet style.
- A separate shared worksheet-editing primitive should own cell editing, keyboard navigation, paste/multi-cell paste, row operations, validation, dirty/conflict state, protected cells, responsive fallback, and explicit Save/Apply. `OperationsGrid` remains primarily a browse/register primitive.
- Other strong worksheet candidates include RFQ/PO draft editing, Client Billing, direct editable Expenses, Workers, Attendance, Time Entries, Project Assignments, Project Materials/Equipment, Warehouse/Equipment masters, and Vendor master maintenance.
- Dashboard, project overview, Cash & Banking settlement/reconciliation decisions, finalized financial lifecycle actions, inventory movements, payroll approval/finalization, RFIs/Submittals, Documents, Email/SMS, Settings, RBAC/security, provider configuration, and lifecycle dialogs remain purpose-built.
- Add Row is domain-controlled. Add Column must not create arbitrary SQL columns; future custom columns require a typed custom-field architecture.
- Real `.xlsx` round trips remain required where supported, but import/export no longer defines what “Excel-native” means inside the app.

Canonical contract: `docs/superpowers/specs/2026-09-20-selective-workbook-editing-ux-direction.md`.

## 2026-09-20 UX-W4.5 — information density and worksheet clarity correction planned

This phase is now a **blocking usability gate before UX-W5**. The first card-first
and worksheet-native surfaces prove the interaction model but also expose an
over-labeling/over-containerization problem.

The required correction is documented in
`docs/superpowers/specs/2026-09-20-worksheet-density-clarity-correction.md`.

The UX-W4.5A evidence-first investigation is complete for source SHA
`b279b02730b79cccac5f72ac4c93553d957db07b`. The durable report is
`artifacts/ui-ux-audit/UX-W4.5A-REPORT.md`; it reviewed 89 baseline demo
screenshots plus 17 targeted editor/viewport captures across 34 routes and
the four viewport classes. It recorded 22 ACCEPTABLE, 28 NEEDS CORRECTION,
and 6 DEEPER WORKFLOW REVIEW state families, with 4 P1, 8 P2, and 2 P3
findings. The next work is bounded UX-W4.5B/C/D/E correction slices; this PR
does not implement those visual fixes.

Key requirements:

- The app-wide screenshot investigation is complete in the current evidence
  PR using the existing visual-QA infrastructure. Automated PASS, no-overflow,
  and clean console evidence remain separate from the recorded visual
  judgments in `artifacts/ui-ux-audit/UX-W4.5A-REPORT.md`.
- The investigation covers major routes plus representative dialogs/editors at
  desktop, constrained-laptop, tablet, and phone viewports and groups findings
  by shared root cause before implementation begins.
- Projects cards become the first dominant working content after a compact
  title/task toolbar; Portfolio analysis and Excel import/export remain
  available but secondary.
- `WorksheetEditor` keeps protected/read-only behavior, accessibility,
  data-state attributes, and tests, but ordinary protected cells no longer
  append a visible `PROTECTED` / `READ-ONLY` pill by default.
- Supplier Invoice review treats source evidence as the normal quiet state and
  reserves visible labels for decision-relevant exceptions such as manual
  corrections, unresolved values, validation errors, warnings, or conflicts.
- Repeated `WORKSHEET` headings, helper paragraphs, legends, warning text, and
  nested card chrome are consolidated through progressive disclosure.
- Project Details, Cost Codes, Supplier Invoice review, RFQ, Purchase Order,
  Client Billing, and Expense draft worksheets are audited for the same noise
  before any UX-W5 domain is added.

This phase is presentation-only unless the final implementation diff proves
otherwise. It must not weaken financial authority, lifecycle, permissions,
history, provenance, concurrency, RLS, or XLSX review-before-apply behavior.

## 2026-09-20 UX-W4.5B — shared responsive shell and worksheet foundations implemented

UX-W4.5B addresses the shared root causes behind UX45A-002, UX45A-003,
UX45A-006, and UX45A-010 without changing domain authority or persistence.

- `useDialogFocus` now locks document scrolling while modal-style workflows are
  open, reference-counts nested locks, restores prior styles on close, and
  keeps Escape/Tab/focus return behavior intact.
- The shell exposes a focus-safe scroll-padding boundary. Project Details,
  Expense Draft, RFQ, and Purchase Order modal surfaces use explicit
  overflow-hidden overlays and one deliberate dialog body scroll owner.
- `WorksheetEditor` retains the desktop table/grid, keyboard navigation,
  copy/paste, frozen identity column, validation, dirty/conflict state, and
  controlled row operations while adding a phone row/field fallback.
- Ordinary protected/read-only cells retain machine-readable semantics,
  non-editability, titles, restrained styling, and stable data attributes but
  no longer repeat visible `Protected` / `Read-only` pills.
- Representative Project Details, Cost Codes, Client Billing, Expense Draft,
  RFQ, Purchase Order, and Supplier Invoice surfaces expose stable responsive
  evidence markers for targeted QA.

Focused and affected application validation passed for the implementation
work. Interactive local safe-demo visual inspection covered phone and desktop
representative states at the qualified capture SHA. PR review advanced the
application-bearing head to `85efe8f951b96df0c20dd6ffd4869f0b083c2343` with quiet mobile read-only
presentation, unique responsive issue-description IDs, and hidden-control focus
filtering. The local Demo Visual QA runner was unavailable because that clean
worktree lacked Playwright; protected exact-head application/browser CI remains
the merge gate. DB validation was not applicable. The qualified visual record and exact disposition are in
`artifacts/ui-ux-audit/screenshots/ux-w4-5b/README.md` and the follow-up
section of `artifacts/ui-ux-audit/UX-W4.5A-REPORT.md`.

UX45A-002 is partial because the safe-demo SMS provider-unconfigured state did
not reproduce the original long provider workflow. UX45A-003 and UX45A-010
are resolved for the bounded worksheet consumers. UX45A-006 shared cell-state
noise is resolved; Supplier Invoice page-specific hierarchy was left for
UX-W4.5D. UX45A-004 was deliberately deferred from this slice.

## 2026-09-20 UX-W4.5C — task-first hierarchy and bounded visual grammar implemented

UX-W4.5C is implemented on the active branch as a presentation-only correction.
Projects now puts compact controls and card/list working content before Portfolio
snapshot and Excel tools. Expenses puts register controls/records before detail,
supplier-document follow-up, summary metrics, and workbook disclosure. Cash &
Banking puts account/transaction work and the existing settlement allocation
workspace before secondary cash summaries. Project Workspace and Budget Control
make the active surface and cost-code worksheet precede secondary analysis and
attention blocks while preserving authoritative financial labels and warnings.

The steered bounded audit also corrected data-heavy working-canvas width for
Purchase Order, RFQ, RFQ comparison, goods receipt, subcontract claim/editor/
variation, and supplier quotation surfaces. Confirmation/reason dialogs remain
compact. `WorksheetEditor` now exposes data-type alignment metadata and a shared
action-bar marker; Project Details/Cost Codes use explicit numeric/status
alignment; PO/RFQ Save/Close actions are owned by one stable modal footer.

Focused hierarchy/domain/procurement validation passed **120/120** in the
integrated implementation run. PR review advanced the application-bearing head
to `1652add981cb8d51ea24495f958273380627eb30`; exact-head Application
Validation selected **486/486** affected application tests with database fallback
disabled and passed lint/typecheck/build. Exact-head Workflow Map Consistency,
the database-unaffected migration/invariant gate, and Demo Visual QA also passed.
The protected screenshots were inspected directly. Review caught one remaining
Project Overview defect—the tall Management Attention wall—and corrected it to a
compact severity summary with evidence/drilldowns on demand, bringing the
financial-control working surface back into the initial useful desktop viewport.
Projects remained genuinely card-first and PO/RFQ retained the wide working
canvas and stable footer across the captured responsive states. The detailed
disposition and the WORKSPACE-WIDTH SUITABILITY and VISUAL-GRAMMAR CONSISTENCY
root causes are recorded in
`artifacts/ui-ux-audit/UX-W4.5A-REPORT.md`.

UX45A-001 and the bounded UX45A-005 hierarchy target are resolved for W4.5C;
UX45A-008, UX45A-009, UX45A-013, and UX45A-014 remain partial where they extend
beyond the touched surfaces; UX45A-004 was deferred from W4.5C into the
subsequent W4.5D slice. UX-W4.5E is explicitly strengthened as the future
**App-Wide Visual Consistency &
Professional-Finish Certification** phase. DB validation was not applicable.

## 2026-09-21 UX-W4.5D — Supplier Invoice and worksheet clarity implemented

The bounded UX-W4.5D correction is implemented at application-bearing SHA
`4d5b158acec8427fd684a64513df05a00fe6ba71`, from base SHA
`f4177ecd3c40d3baaf6bcdf51806e0d58a5e9534`.

Supplier Invoice review now keeps the populated safe-demo source image first,
uses a compact review status/action bar, presents extracted values before
blocking review items, and moves advanced provenance/accounting explanation
into disclosures. The four extracted worksheet sections share one aggregate
Save/Discard/Add-line toolbar; ordinary source provenance and calculated
markers remain machine-readable but visually quiet, while manual corrections
and unresolved values remain prominent. Canonical Vendor identity, linked
Expense/payable authority, project allocation, PO matching, intake,
verification, settlement, permissions, history, and concurrency boundaries are
unchanged.

The safe-demo review invoice uses the sanitized local image
`public/demo/supplier-invoice-review.svg`; no provider, Storage, database,
migration, RLS/RPC, or production change was introduced. The existing Project
Details, Cost Codes, RFQ, Purchase Order, Client Billing, and Expense worksheet
surfaces were audited for the same clarity risks and their W4.5B/C contracts
were preserved without unrelated redesign.

Validation for this implementation:

- focused migrated-worksheet/Supplier Invoice tests: **89/89**;
- `npm.cmd run test:affected:agent`: **293/293**, database fallback disabled;
- `npm.cmd run lint`: ESLint and TypeScript passed;
- `npm.cmd run build`: passed;
- manual local safe-demo visual inspection at desktop `1920x911` and responsive
  `652x698` for `/demo/app/review?invoiceId=demo-invoice-07`.

The automated Demo Visual QA command was attempted but this checkout lacks the
`playwright` package, so no automated browser PASS or promoted screenshot
artifact is claimed. Docker/Supabase and hosted/provider/production checks were
not applicable. The durable visual record and exact disposition are in
`artifacts/ui-ux-audit/UX-W4.5A-REPORT.md`.

**UX-W4.5E — App-Wide Visual Consistency & Professional-Finish Certification**
is implemented at application-bearing SHA
`3eb2819edd4da3527e083882bf451c171c35b6a4`. The shared visual grammar,
compact document-preview states, explicit RFI/Submittal recovery-state evidence, and
final safe-demo visual validation are recorded in
`artifacts/ui-ux-audit/UX-W4.5A-REPORT.md` and
`artifacts/ui-ux-audit/screenshots/ux-w4-5e/README.md`. UX-W5 is now
**unblocked from the visual gate**; no UX-W5 code was started in this phase.
The safe-demo dataset does not currently certify populated RFI/Submittal detail layouts; that P2 evidence gap remains recorded without reopening the P0/P1/shared-root visual gate.

## 2026-09-21 UX-W5A — Project Materials & Project Equipment worksheet register editing

The bounded UX-W5A slice replaces the conventional Project Material and Project
Equipment add/edit forms with the shared `WorksheetEditor` interaction only at
the explicit create/edit boundary. The existing Materials & Equipment browse,
summary, reconciliation, procurement, warehouse, site-evidence, and canonical
Equipment context remains the normal register surface.

Project Material worksheet cells cover material name/description,
reference/code, category, planned quantity, unit, permitted warehouse-item
link, project cost code, permitted PO-line link, register status, and notes.
Project Equipment worksheet cells cover asset/reference, equipment name,
type/category, source, provider/vendor, project-register start/end dates,
register status, and notes. Stable IDs, company/project ownership, warehouse
on-hand and movement truth, PO receiving quantities, site observations,
reconciliation, canonical Equipment Registry identity, assignment/transfer/
return, lifecycle, history, and other derived/source facts remain protected or
outside ordinary cells.

The worksheet stages dirty/new rows, supports keyboard navigation and bounded
paste through the shared editor, permits removal only for unsaved draft rows,
normalizes and validates inputs, and saves dirty rows sequentially through the
existing `onSaveMaterial` / `onSaveEquipment` callbacks. Failed rows remain
staged and visible; no parallel persistence or bulk transaction was introduced.
No migration, RLS/RPC, inventory, procurement, provider, or production contract
changed in this UI/application-only slice. Remaining UX-W5 domains outside the
implemented W5A/W5B slices are not started; Worker Registration remains paused.

Final validation for this implementation passed the focused worksheet/editor/
demo group **52/52**, `npm.cmd run test:affected:agent` **544/544** with
database fallback disabled, ESLint/TypeScript, and the production build. Targeted
local Playwright captures were inspected for the Materials & Equipment route at
desktop `1440x1000`, constrained laptop `1366x768`, tablet `768x1024`, and phone
`390x844`, including browse, material create/edit/validation, and equipment
create/edit/protected-identity states. Full database/Supabase validation was not
applicable; no Workflow Map source/generated contract changed.

## 2026-09-21 UX-W5B — Warehouse Item Master + Canonical Equipment Master worksheet maintenance

The bounded UX-W5B slice replaces the conventional canonical Warehouse Item and
Equipment add/edit forms with shared `WorksheetEditor` master-data maintenance.
Warehouse and Equipment browse/register pages remain the primary visual surfaces;
movement, receipt, issue/return, assignment, transfer, return, lifecycle,
observation, and history actions remain purpose-built outside the worksheet.

Warehouse editable cells are item name/description, item/reference code,
category, and stock unit only for new items or existing items without movement
or project-usage history. Existing status, on-hand, movement totals/counts,
movement provenance, receipt linkage, and protected stock units remain read-only.
Equipment editable cells are asset/reference, name, type/category, ownership/
source, provider/vendor, and notes. Lifecycle status, current state, current
Project, active assignment, assignment start, assignment history, and all
assignment/lifecycle actions remain protected. Existing lifecycle status is
carried through ordinary metadata saves so maintenance, out-of-service, and
retired assets cannot be reset.

Both worksheets support staged multi-row setup, keyboard/paste behavior, dirty
state, draft-only row removal, validation, explicit Save/Cancel, phone fallback,
and sequential authoritative callback saves with failed-row retention. The
shared draft/save helper is reused without adding a second grid system. No
migration, RLS/RPC, trigger, inventory movement, equipment assignment,
provider, or production contract changed.

Focused worksheet/editor coverage passed **43/43**; the focused inventory/
Equipment/domain group passed **53/55** with the two runtime DB tests skipped
because their explicit runtime environment flags were not enabled. The final
deterministic affected selector passed **476/476** with database fallback
disabled; ESLint/TypeScript and the production build passed. Workflow Map
consistency passed. Demo Visual QA against the production build passed **85/85
interaction scenarios**, **104 screenshots**, and zero console errors, page
errors, failed requests, or overflow failures. The lead agent inspected the
W5B screenshots at desktop `1440x1000`, constrained laptop `1366x768`, tablet
`768x1024`, and phone `390x844`; local/demo evidence remains non-hosted and
non-production certification.

Jev context ran against the clean baseline with **0 deterministic candidates /
0 selected**, fallback `false`; the live response did not return model/token/
latency fields. Jev test triage retained all **75/75** required tests and fell
back with `sanitizer-rejected`; deterministic affected selection remains
authoritative. Remaining UX-W5 work requires a new bounded handoff; Vendor
master, workforce domains, Worker Registration, and other out-of-scope slices
were not started.

## 2026-09-21 UX-W5C — Vendor Master worksheet maintenance

The bounded UX-W5C slice starts from synchronized `main` SHA
`3f9a087633f6e5508b0fe3562f4327a29d8563b0` on feature branch
`codex/ux-w5c-vendor-master`.

The Vendor directory remains browse-first: it searches and summarizes canonical
Vendor records, linked supplier-invoice counts, source-currency totals, state,
and review signals. Authorized users can deliberately open `Manage Vendors`,
edit a specific Vendor, or stage a new Vendor row in the shared responsive
`WorksheetEditor` surface.

The worksheet exposes only the live safe canonical Vendor fields: name, email,
phone, tax/business ID, address, default currency, and default category. Vendor
identity, company ownership, normalized identity, lifecycle state, archive and
deactivation metadata, timestamps, invoice evidence, procurement references,
Expenses/payables, settlement/payment truth, and history remain protected or
outside ordinary cells. Supplier Invoice extracted text remains evidence and is
not copied into the Vendor worksheet.

Persistence continues through the existing parent/controller `onAddVendor` /
`saveVendor` path; no second Vendor writer or XLSX subsystem was introduced.
Exact duplicate identity conflicts are surfaced before save, while server-side
Vendor identity rules remain authoritative. The forward-only
`20260921074220_vendor_worksheet_concurrency.sql` migration adds an optional
`expectedUpdatedAt` predicate to the existing canonical RPC so stale worksheet
rows fail closed with SQLSTATE `40001` / `EXPECTED_VERSION_MISMATCH`. RLS,
company isolation, guarded lifecycle RPCs, and append-only Vendor history remain
in force.

Focused Vendor/worksheet/browser-catalog tests passed **52/52**; the final
deterministic affected selector passed **226/226** tests from **36/356** files
with database fallback disabled. Full ESLint and TypeScript passed, the
production build passed, and Workflow Map consistency passed. The local Demo
Visual QA runner could not start because the clean worktree did not contain the
QA-only `playwright` package. Direct local browser inspection therefore covered
`/demo/app/vendors` at the default desktop viewport and explicit phone
`390x844`: browse directory, worksheet table, protected lifecycle state, staged
Add Row validation, and mobile row/field fallback were visually inspected.
This is local/demo evidence, not hosted or production certification.

The migration static suite passed **114/114** checks. Live pgTAP, clean replay,
upgrade-path, and runtime RLS/RPC/concurrency validation were not run because
Docker/Supabase was unavailable (`dockerDesktopLinuxEngine` missing;
`127.0.0.1:54322` refused the upgrade-test connection). The committed pgTAP
coverage extends R5 Vendor hardening with stale-version fail-closed and current
version success assertions for the canonical RPC.

Jev effectiveness for this real phase: deterministic context candidates **22**;
selected **14**; must-keep **11**; **2** payload-safe context requests/chunks;
model `jev-1.13.0`; **9,821 / 1,578** input/output tokens; **1,974 ms**;
fallback `false`. The context rerank retained all explicit/must-keep Vendor
paths and removed eight optional candidates. Deterministic test selection was
**36** required files; live test-triage used **1** request, retained/recommended
**36/36**, model `jev-1.13.0`, **4,848 / 534** tokens, **1,050 ms**, fallback
`false`. Live completion used **1** request over five evidence categories,
model `jev-1.13.0`, **694 / 89** tokens, **711 ms**, fallback `false`; the
advisory marked database evidence absent and kept `unresolvedUncertainty=true`
because the committed static-only database evidence and Playwright/Docker
limitations were explicit. Initial vague/invalid context
selector attempts were not useful; the corrected explicit-selector context call
was the useful checkpoint. No customer/private records, invoice contents,
credentials, browser/session state, or secrets were sent to Jev.

The exact next unfinished UX-W5 work is the workforce set (Workers, Attendance,
Time Entries, and Project Assignments), which remains gated by the paused
Worker Registration sequencing and the broader Wave 4D/product prerequisites.
Do not unpause Worker Registration here. Remaining Wide Documents and provider
certification work retain their separate roadmap order; later Finance UX-W6 and
custom-field work remain out of scope.

## 2026-09-20 UX-W1 — shared worksheet editing foundation implemented

UX-W1 adds the reusable `WorksheetEditor` family without migrating a product
domain. `src/components/ui/worksheetEditorModel.ts` owns the typed column
contract and pure edit/paste/navigation rules; `src/components/ui/WorksheetEditor.tsx`
owns the parent-controlled draft/edit surface; and
`src/components/ui/WorksheetTabs.tsx` provides controlled local worksheet tabs.

The API supports text, number, currency, date, and select columns; custom
parsers, formatters, renderers, validation, protected/read-only cells, dirty
and conflict state supplied by the parent, keyboard movement, explicit edit
commit/cancel, plain TSV copy, rectangular TSV paste, controlled Add Row and
Remove Row callbacks, Save/Apply/Cancel action slots, and contained responsive
scrolling. Paste never creates rows or columns, protected values remain
unchanged, invalid values remain visible as validation state, and persistence
remains parent-owned. `OperationsGrid` is unchanged and remains the browse/
register primitive.

Focused behavioral tests, ESLint, and TypeScript validation pass locally. The
component was intentionally foundation-only in UX-W1; route-level QA was
deferred to the first domain integration in UX-W2. No database, migration,
RLS/RPC, provider, or production change occurred. The exact next implementation
phase after the completed UX-W2 proving integration is **UX-W3 — Supplier
Invoice source-on-top + extracted-data worksheet review**.

## 2026-09-20 UX-W2 — Projects card-first portfolio + worksheets implemented

UX-W2 applies the selective workbook-editing interaction grammar to Projects:

- Projects now defaults to a responsive card-first portfolio across desktop,
  tablet, and phone. Project names and identity are visually dominant; the
  primary card region opens the Project Workspace with keyboard focus support;
  `Edit project details` is a secondary authorized action; and lifecycle access
  remains in a restrained More actions disclosure.
- The existing `OperationsGrid` remains available as an accessible Compact List
  toggle using the same filtered/sorted `displayedViews`. Portfolio summaries,
  filters, sorting, multi-currency grouping, partial/unavailable truth, and the
  distinct Contract Value, Approved Budget, Actual Cost, and Committed Cost cues
  remain parent-derived.
- `.xlsx` Projects/Cost Codes export, proposal-only import, validation, review,
  stale/conflict handling, human confirmation, grouped authoritative Apply, and
  refresh boundaries remain available behind the secondary **Excel import/export**
  disclosure. The workbook engine was not rewritten for presentation.
- Project Details now uses a wide one-row `WorksheetEditor` for the existing
  editable project fields, including code/name, currency, tax treatment,
  contract/budget values, client/manager, billing contact/email/address,
  location, status, and operational notes. Parent-owned validation and the
  existing `onSaveProject` authority remain in force for both New and Edit.
- Project Cost Codes now use a multi-row `WorksheetEditor` in Budget Control.
  Code, work package, description, approved budget, and forecast are staged for
  editing; Status, Actual Cost, Committed Cost, and derived variances remain
  protected. Add Row stages new codes, no arbitrary Remove Row exists, the
  existing `validateProjectCostCodeInput` contract runs before saves, stable
  `id`/`updatedAt` values are preserved, and archive/reactivate remain explicit
  lifecycle actions. Per-row save failures retain remaining unsaved rows.

No database, migration, RLS/RPC, provider, or production change occurred. The
final focused Projects group passed **88/88**; `npm.cmd run test:affected:agent`
passed **389/389** with database fallback disabled; ESLint and TypeScript
validation passed; and the production build passed. Targeted browser QA was not
run locally, so exact-head protected Demo Visual QA remains the browser evidence
gate. Docker/Supabase and hosted/provider checks were not required for this
UI-only diff. At the time of the UX-W2 handoff, the exact next implementation
phase was **UX-W3 — Supplier Invoice source-on-top + extracted-data worksheet
review**; UX-W3 is implemented in the section below.

## 2026-09-20 UX-W3 — Supplier Invoice source-first worksheet review implemented

UX-W3 applies the selective workbook-editing interaction grammar to the existing
Supplier Invoice review workspace without changing extraction, persistence,
database, or accounting authority.

- The preserved `SourceComparison` surface now appears before extracted review
  content in a responsive vertical flow. Image/PDF viewing, zoom, fit/actual
  size controls, preserved email access, comparison/history tabs, missing-source
  fallback, and source evidence remain available. The old desktop split pane and
  mobile Details/Source toggle are removed.
- `SupplierInvoiceWorksheet` consumes the shared `WorksheetEditor` for Invoice
  Header, Vendor Evidence, Line Items, and Totals / Monetary Facts. Existing
  safe posting context remains editable through the header worksheet; line rows
  retain stable IDs and controlled Add Row/Remove Row behavior.
- The worksheet reuses `financialFieldStatus` and the AI snapshot where present
  to show source, manual, calculated, and unresolved provenance. Calculated
  monetary facts and all verified/VOID cells are protected/read-only. Canonical
  Vendor identity is not a worksheet cell; Vendor link/create, project
  allocation, PO matching, material intake, verification, Expense authority,
  settlement, correction, lifecycle, retry, and revert actions remain explicit
  workflows.
- Focused Supplier Invoice, worksheet, procurement-boundary, and settlement
  regression coverage passed locally; `npm.cmd run test:affected:agent` passed
  **170/170** with database fallback disabled; ESLint, TypeScript, and the
  production build passed. Exact-head protected Demo Visual QA remains the
  browser merge gate. No database/Docker/Supabase/provider or production
  validation was applicable to this UI-only diff.

At the UX-W3 checkpoint, the exact next implementation phase was **UX-W4 —
bounded high-value transaction editors**, beginning with RFQ and Purchase
Order draft editing. That RFQ/PO proving slice is recorded below; do not claim
app-wide Excel-native editing from UX-W4.

## 2026-09-20 UX-W4 — RFQ + Purchase Order draft worksheet editors implemented

UX-W4 applies the shared worksheet interaction model to the ordinary RFQ and
Purchase Order draft editors without changing procurement persistence or
lifecycle ownership.

- RFQ header fields and RFQ lines now use `WorksheetEditor`; active project
  cost-code references, positive quantities, stable line identities, requested
  delivery dates, notes, Add Row, and safe draft row removal remain bounded by
  the existing domain model.
- Purchase Order header fields and PO lines now use `WorksheetEditor`; unit
  price, quantity, unit, description, project/cost-code references, calculated
  line amount, calculated total, and received quantity are represented with
  explicit protected semantics where applicable.
- Existing draft validation, project/company reference checks, permissions,
  and `updatedAt` optimistic-concurrency tokens remain authoritative through
  the existing parent callbacks and RFQ/PO save RPCs. No worksheet cell can
  approve, issue, receive, close, cancel, match, settle, or otherwise post a
  Purchase Order.
- RFQ comparison/quotation selection/issue/cancellation and Purchase Order
  approval/issue/receiving/close/cancellation/invoice matching/settlement
  remain purpose-built workflows. Existing Procurement `.xlsx` review/apply
  behavior was not rebuilt.
- Demo Visual QA scenarios now open both draft worksheet surfaces at desktop,
  tablet, and mobile viewports. The browser scenarios remain exact-head CI
  evidence; no local browser run was performed in this implementation pass.

Focused Procurement/worksheet tests, ESLint, and TypeScript validation pass
locally. This is a UI/application-only change: no migration, Docker/Supabase,
provider, hosted-QA, or production operation is included. Client Billing follows
in the implementation section below; do not claim app-wide Excel-native editing
from this RFQ/PO rollout.

## 2026-09-20 UX-W4 — Client Billing draft worksheet editing implemented

Client Billing draft create/edit now uses the shared `WorksheetEditor` foundation
through `ClientBillingDraftWorksheet`. Billing Details and Billing Lines remain
one draft aggregate with a single parent-owned Save draft boundary. Safe draft
metadata and line Description/Amount/Notes fields are editable; project identity,
currency, tax treatment, lifecycle/status, calculated total, collection position,
settlement state, and audit/history context remain visibly protected.

Add Row and draft-only Remove Row are controlled by the worksheet surface, and
temporary worksheet line keys are stripped before the existing authoritative save
path receives its payload. Submit, issue, cancel, void, preview, Collections, and
Cash & Banking workflows remain outside the worksheet.

The Client Billing save RPC now carries the draft metadata and an atomic expected
`updated_at` precondition in one aggregate transaction. Stale edits fail closed
with SQLSTATE `40001`; the existing company, permission, lifecycle, currency,
contract-ceiling, history, and line-derived total rules remain authoritative.
Local clean replay, full pgTAP (1,647 tests), and both upgrade fixtures pass for
this branch. Exact-head CI remains the merge gate; no production operation is
implied.

The bounded UX-W4 Expenses slice is now implemented. The next selective-workbook
candidate from the approved interaction direction is **UX-W5 operational
bulk-data editors** (Workers, Attendance, Time Entries, Project Assignments,
Project Materials/Equipment, and approved master-data slices). App-wide
Excel-native editing remains unclaimed; Worker Registration remains paused by
the current product sequence until the Wave 4D gate is genuinely complete and
explicitly resumed.

## 2026-09-20 UX-W4 — Expenses direct editable draft worksheet implemented

Direct Expense create/edit now uses the shared `WorksheetEditor` foundation
through `src/components/expenses/ExpenseDraftWorksheet.tsx`. The Expenses
register remains the browse surface; new direct records and eligible existing
unlinked DRAFT records open a contained worksheet with date, project, cost code,
category, description, payee, amount, currency, payment method, reference, and
notes fields. Project and cost-code references remain domain-backed and are
validated together.

Expense identity, status/lifecycle, source document and Supplier Invoice
provenance, Vendor and Purchase Order links, settlement state, base-currency/FX
presentation, archive/void state, and created/updated metadata are visibly
protected cells. Supplier-derived records do not expose a direct worksheet save
or editable monetary/provenance cells. Approval, payment, settlement,
reconciliation, correction, archive, void, FX confirmation, and source-document
workflows remain outside the worksheet.

The worksheet commits an active cell before saving, blocks visible validation
errors, normalizes only supported editable fields, preserves protected values
from the authoritative current Expense, and calls the existing parent Expense
save path with its `updated_at` freshness token. The existing Expenses `.xlsx`
export -> review -> explicit Apply round trip remains unchanged and still uses
the authoritative callback. This is a UI/application-only slice: no migration,
Docker/Supabase, provider, hosted-QA, or production operation is included.

The next selective-workbook candidate is **UX-W5 operational bulk-data
editors**, subject to the current Wave 4D/provider readiness and Worker
Registration sequencing gates. App-wide Excel-native editing remains unclaimed.

## Historical application / certification baselines

UI/UX Round 2 was implemented from `main` at:

`746a4aacda9ccceff88a5093bfeb678b8b1046a8`

The final application-bearing implementation head before documentation-only finalization was:

`486d8cd594eade2ad6399ed3160b6f0a227a17b8`

That exact application head passed the protected application/build, browser/demo, and workflow-map checks applicable to this phase. The database protected check correctly fast-passed after classifying the diff as database-unaffected. Documentation-only finalization commits may advance the PR head without changing the reviewed application code.

The last application SHA covered by the earlier hosted exact-SHA application certification remains:

`e4ee4ebde489629ee74429b4e37abb511943a51e`

That hosted evidence must not be generalized to the newer UI/UX Round 2 application code until a later hosted exact-SHA release/readiness pass establishes new evidence.

Relevant completed work includes:

- Wave 1A Supplier Payable Lifecycle UX — complete;
- Wave 1B Client Receivable Lifecycle UX — complete;
- Wave 2 cross-module routing and handoffs — complete;
- Wave 3 payroll/subcontract/PO workflow decisions — complete;
- Wave 4A Company Document Templates / Mail Merge Foundation — complete;
- Wave 4B High-Fidelity PDF Finalization Foundation — complete for the programmatic fallback;
- Wave 4C outbound issued-document email delivery/history foundation — complete;
- Wave 4D Email/SMS + Documents workspaces — partially implemented but **not complete**;
- full live-QA harness and observed-flow hardening — complete;
- first focused UI/UX remediation — complete;
- Local-QA + canonical issued-PDF preview/download foundation — complete;
- Local-QA browser-key hardening — complete;
- first comprehensive authenticated Local-QA UI/UX pass — complete in PR #150;
- deep programmatic-PDF visual certification — complete for the programmatic fallback;
- supported/fixture-backed Local-QA functional regression sweep — complete;
- Supplier Invoice monetary correction/buyer simplification — complete;
- Supplier Payables Settlement Truth & Consistency corrective phase — complete in PR #158 and separately QA-certified;
- **UI/UX Round 2 App-Wide Usability Simplification & Information Architecture — complete in PR #161.**

## 2026-09-13 UI/UX Round 2 completion state

PR #161 completed grouped authenticated navigation, shared task-first layout primitives, list-first Documents and Expenses surfaces, readable project allocation views, grouped Payroll navigation, and targeted hierarchy improvements across Dashboard, Supplier Invoices, Projects, Warehouse, Equipment, and Settings. Existing route IDs, deep-link query contracts, permissions, financial/source ownership, history, and provider boundaries remain unchanged. No database schema, RLS, RPC, trigger, or migration change is part of this UI/application work.

The mandatory regression areas were explicitly rechecked:

- **Project Allocation** now has readable responsive allocation views rather than forcing large amounts, balance, units, and selection semantics into one narrow desktop-style row.
- **Documents** is search/list-first with common open/preview/handoff work ahead of secondary source/provenance controls.
- **Expenses** keeps the Expense register primary while supplier documents remain supporting context and the linked Expense remains financially authoritative.
- **Payroll** is grouped around Overview, People, Attendance & Time, Payroll Runs, and Imports & Setup rather than exposing the former flat equal-priority tab strip.

The fresh authenticated Local-QA route matrix recorded **59/59 passing scenarios** with zero page-overflow, dialog-overflow, or interactive-overflow failures. The recorded authenticated visual-certification pass produced **80 route/state captures across desktop, constrained laptop, tablet, and phone, plus corrected Projects captures at desktop/tablet/phone**. Exact-head GitHub browser QA independently captured 78 demo scenarios/screenshots across 34 routes and four viewport classes with zero failed scenarios, navigation failures, console errors, page errors, failed requests, or overflow failures.

The Document Templates capability was rechecked after the isolated QA server received the private `SUPABASE_STORAGE_SERVER_KEY`. The restarted authenticated Local-QA server returned `templateStorage.status=AVAILABLE`; Purchase Order and Client Invoice Starter plus safe DOCX Upload each persisted immutable metadata/version records, refreshed Settings, and retrieved the stored DOCX successfully. The Starter generator was corrected so its declared `company.vatTin` binding is emitted and activation validation returns `VALID`.

Real authenticated Local-QA AI-template evidence is now obtained separately from Storage: `/api/deployment/company-ai` returned HTTP 200 with `runtimeCapability.status=AVAILABLE` while persisted `lastTestStatus` remained `NOT_TESTED`; no credential material was exposed. The HSC Purchase Order Analyze request returned `aiStatus=AVAILABLE` using `gemini-3.5-flash-lite`, the reviewed UI Prepare action created a VALID immutable `DUPLICATED` descendant from the uploaded version, the original SHA remained unchanged, and Test DOCX rendered both synthetic line items. The separate Generate with AI UI workflow passed for Purchase Order and Client Invoice, including persisted VALID AI drafts, refresh visibility, and DOCX downloads. PDF converter availability remains a separate `UNAVAILABLE` capability and does not gate DOCX persistence.

The broad Local-QA route matrix still requires separate harness cleanup/reconciliation because its long sweep recorded unrelated route/session failures; the isolated authenticated AI/template workflow itself passed. No uncontrolled email/SMS send and no production mutation occurred.

UI/UX Round 2 and the Document Template AI corrective phase are complete foundations on the current merged baseline. At the earlier 2026-09-14 checkpoint the user had reprioritized the implementation run to Email/SMS Reliability & UX Completion and the remaining Wide Documents managed slices were deferred. The managed standalone/version/artifact foundation is now recorded in the 2026-09-21 section above; Worker Registration remains paused.

## 2026-09-13 Document Template AI corrective phase

This urgent corrective phase executes before the remaining Wave 4D provider/readiness work because authenticated QA demonstrated that Analyze with AI could use the company runtime while Settings still disabled Generate from stale `lastTestStatus` metadata, and because tagless uploaded DOCX files could not be prepared inside the application.

The implementation contract is recorded in:

`docs/superpowers/specs/2026-09-13-document-template-ai-autotagging-design.md`

The corrective scope is:

- server-owned runtime capability shared by Analyze and Generate; persisted provider-test metadata remains informational;
- deterministic application-owned DOCX anchor discovery and allowlisted semantic mapping plans;
- human-reviewed in-app preparation of supported scalar fields and repeating line rows;
- immutable descendant draft creation through the existing version/parent model;
- fail-closed ambiguity, OOXML security, company isolation, AI budgeting, and financial snapshot boundaries;
- truthful Generate errors that remain distinct from Storage, PDF fallback, and converter capability.

Current implementation validation includes focused/affected tests, TypeScript lint/build, and real authenticated Local-QA AI/template evidence against the exact QA project. This is not hosted exact-SHA release certification and does not authorize production mutation. High-fidelity PDF conversion remains separately unavailable.

## Explicit 2026-09-12 reprioritization — UI/UX Round 2

The user reviewed multiple authenticated screens and determined that the app still exposed too much system architecture, technical wording, weak hierarchy, card-heavy whitespace, cramped controls, and flat navigation despite the earlier UI/UX pass.

The user explicitly approved a second, broader UI/UX round with permission to restructure navigation and tabs where that genuinely improves simplicity.

The authoritative completed phase contract and acceptance record is:

`docs/HYDROQUALISENSE_UI_UX_ROUND2_SIMPLIFICATION.md`

The phase was not a cosmetic polish pass. It was an app-wide **workflow-first usability simplification and information-architecture phase**.

### Standing design principles

- keep the features; reduce cognitive load;
- task first, internal architecture second;
- one obvious primary action per context;
- main work/register before secondary explanation;
- progressive disclosure for provenance, raw IDs, audit metadata, and advanced controls;
- human business terminology instead of engineering/source-of-truth jargon in primary UI;
- compact useful summaries rather than oversized metric/card walls;
- compact common filters with advanced filters progressively disclosed where appropriate;
- consistent page/header/table/form/action/navigation grammar across modules;
- navigation/tabs may be regrouped, renamed, reordered, or restructured when doing so simplifies real workflows;
- deep links/routes should remain compatible wherever practical;
- responsive layouts may reorganize the workflow rather than simply shrink desktop UI;
- expert capability, permissions, financial semantics, audit history, and source-of-truth boundaries remain intact.

These rules remain the UI baseline for later phases, including resumed Wave 4D work.

## 2026-09-14 Wide Documents Phase reprioritization and Slice 1

The user previously reprioritized product work to a Wide Documents Phase: Documents should become the central company Document Center, while preserving each owning domain as the source of truth. Official generated Word documents remain template-first and the actual approved DOCX remains the visual layout source of truth. XLSX remains programmatic by default.

Slice 1 is implemented on the merged baseline as the application Document Center shell. `/documents` provides durable `Library`, `Create`, and `Templates` views; Library remains a permission-filtered projection over existing owning records; and Settings keeps only a link to Documents -> Templates. Slice 2 now extends the template foundation with company-defined type metadata, safe custom/repeating schemas, dynamic Templates administration, and generic Create discovery. No company-defined type is a new financial, inventory, payroll, or other owning-domain record.

The durable contract is recorded in `docs/HYDROQUALISENSE_UNIFIED_DOCUMENT_CENTER.md` and the implementation design/plan are recorded in `docs/superpowers/specs/2026-09-14-unified-document-center-design.md` and `docs/superpowers/plans/2026-09-14-unified-document-center-slice1.md`.

The Slice 2 implementation proves that template-first generation through the supplied HSC Purchase Order, Checklist, and Warranty fixtures is driven by dynamic company-defined types. The HSC files remain exact acceptance fixtures; they are not hardcoded document-type registrations. Final authenticated Local-QA and render certification remains part of that phase’s readiness evidence.

## 2026-09-21 Wide Documents — managed Documents + retained artifacts foundation implemented

Starting from synchronized `main` SHA
`288847309ddadf66d4d6d644f445ba04afa0ee97`, the bounded foundation adds
company-scoped standalone managed-document identity, immutable file/version
history, a private `company-managed-documents` Storage contract, narrow
`documents.read`/`documents.manage` permissions, and guarded server RPCs for
create/version/archive operations. Optional project links use same-company
composite foreign keys; stale archive/version races fail closed with
`EXPECTED_VERSION_MISMATCH`/SQLSTATE `40001`; ordinary clients cannot rewrite
version rows or delete history.

The retained artifact index is provenance-only. It records the source domain,
source type/record reference, artifact type, immutable managed version, and
template hash/version when available. Existing issued Purchase Order and Client
Invoice generation remains authoritative through `document_generation_evidence`
and delivery history; an after-insert registration hook makes those generated
DOCX/PDF outputs discoverable without copying their financial or lifecycle
truth. Dynamic company-template generation also retains a managed artifact and
returns its managed identity through response headers while preserving the
existing binary download contract.

The Documents workspace now has managed/artifact browse rows, review-before-
commit standalone upload, detail/version history, authorized short-lived
retrieval, and deliberate new-version/archive actions. Deterministic safe-demo
fixtures cover a two-version Warranty Certificate and a generated Purchase
Order artifact. The interaction remains document-oriented; no universal grid,
custom-field platform, financial authority, or broad generator migration was
introduced.

Final PR review added source-aware private Storage authorization, same-company
Purchase Order/Client Invoice provenance validation, XLSM rejection, exact
managed-key parsing, exclusive managed-detail routing, hosted managed-detail
visual scenarios, and a protected-CI invocation of the dedicated two-connection
runtime RLS/stale-write/concurrency contract. The merge gate now covers clean
migration replay, pgTAP, historical upgrades, the dedicated managed runtime
contract, focused application tests, deterministic affected tests,
lint/typecheck, production build, Workflow Map consistency, and hosted Demo
Visual QA. Provider certification and production promotion remain unclaimed.

Jev remained advisory: clean context was deterministic **0/0** with
`no-candidates`; live test triage retained **135/135** required tests in **3**
requests (`jev-1.13.0`, **17,292 / 2,007** tokens, **2,529 ms**,
`fallback=false`); live completion used **1** request over **5** categories
(`jev-1.13.0`, **707 / 89** tokens, **919 ms**, `fallback=false`) and preserved
uncertainty for the unavailable automated/hosted browser evidence.

Remaining Wide Documents work is broader artifact aggregation, authenticated
HSC/render certification, and optional handover-package grouping. Worker
Registration, Attendance, Finance UX-W6, custom fields, provider certification,
and production promotion remain out of scope.

Current pre-merge evidence: the focused dynamic template/Create suite passes 68/68; lint, production build, Workflow Map consistency, and demo browser QA pass (82/82). Authenticated Local-QA passes its 59/59 route/responsive matrix, while its legacy template functional checks still target the former Settings mount and record 7/9 functional workflows. Dynamic HSC authenticated certification is not claimed because the new migration was not promoted to the QA target; local Docker is unavailable for replay/pgTAP/upgrade validation, and the bundled LibreOffice DOCX renderer is unavailable for visual conversion.

## 2026-09-14 Email/SMS Reliability & UX reprioritization

The user explicitly approved the Google Sign-In + Brevo Transactional Email
Migration as the current implementation slice. The remaining Wide Documents
managed upload/artifact work is deferred; it is not represented as complete or
cancelled.

The current branch implementation adds:

- compact Compose, Sent / Delivery History, Email Provider Status, and SMS provider
  status framing while preserving human confirmation, delivery history, idempotency,
  and reconciliation;
- Google Sign-In requests only `openid email profile`; Gmail mailbox/API read,
  intake, reconnect, refresh-token storage, and API send are removed from the live
  product;
- Brevo is the server-side outbound transactional-email provider, with deployment
  secrets and verified sender state reported truthfully;
- public, session-free `/privacy` and `/terms` pages linked from the public, sign-in,
  and authenticated-shell surfaces, plus the restrained Hydroqualisense homepage copy
  required for OAuth configuration. The canonical `hydroqualisense.com` host exposes
  the public homepage without a build flag; noncanonical operational deployments remain
  authenticated by default and may opt into the public funnel deliberately;
- no SMS provider configuration or controlled provider-backed QA evidence in the
  current environment. SMS remains `NOT_CONFIGURED`/unavailable and the approved
  Company SIM Gateway / PhilSMS choices remain unchanged.

The Google identity-only configuration, Brevo server-only setup, external Google
Cloud scope-removal action, provider readiness states, and operator checklist are
documented in `GOOGLE_SIGNIN_BREVO_SETUP.md`. No external Google publishing or
provider-runtime completion is claimed.

## 2026-09-15 Google OAuth branding verification remediation

The operator confirmed that Google Search Console reports `hydroqualisense.com` as a
verified owner through Domain name provider verification. No DNS, Cloudflare, domain
ownership, or Search Console configuration was changed in this repository.

The repository-side remediation now makes the canonical `hydroqualisense.com` root a
session-free public Hydroqualisense homepage, keeps `/privacy` and `/terms` public,
retains authentication for `/dashboard` and normal operational routes, and leaves the
existing public-funnel flag as the opt-in path for noncanonical deployments. The public
homepage and policy pages identify Hydroqualisense, explain that Google is identity-only,
and describe Brevo as the configured outbound provider when deployment setup is ready.
This is repository-side remediation only; external Google Cloud changes and provider
verification remain operator actions and are not claimed as complete.

Brevo runtime sender verification and controlled provider testing remain separate
operator work when deployment secrets are unavailable. SMS provider runtime completion
remains separate and unavailable until approved provider-backed QA evidence exists.
Worker Registration remains paused.

## 2026-09-15 Client Security Assurance & Handoff reprioritization

The user explicitly reprioritized this security phase ahead of the remaining Email/SMS provider/runtime work. The approved contract is `docs/HYDROQUALISENSE_CLIENT_SECURITY_ASSURANCE.md` and the implementation plan is `docs/superpowers/plans/2026-09-15-client-security-assurance.md`.

This branch adds the company-scoped custom-role contract and Settings access workflow while preserving the shared effective-permission authority, protected root/platform permissions, member override precedence, company isolation, and audit history. The four built-in roles remain protected starter templates. The Payroll boundary correction adds a narrow project-reference path without restoring broad Projects or Documents access. Local clean replay, pgTAP, migration/upgrade validation, exact authenticated synthetic-QA role captures, and the seven-page PDF render inspection all pass for the committed implementation. The handoff remains qualified rather than deployment-specific security certification because the isolated hosted QA release/migration was not promoted and production remains untouched.

The required handoff checklist and evidence matrix are:

- `docs/HYDROQUALISENSE_CLIENT_SECURITY_HANDOFF_CHECKLIST.md`
- `artifacts/client-security/EVIDENCE.md`

## 2026-09-16 Google Sign-In + Brevo implementation state

The current branch implements the approved identity/provider decision and is not
provider-runtime certified. Focused changed-surface tests pass 198/198; demo
browser QA passes 81/81 across responsive viewports; lint/build/Workflow Map
checks pass; static migration checks pass 114/114; both upgrade fixtures pass;
clean migration replay and pgTAP pass with 47 files and 1,597 tests. No approved
Brevo QA credentials, verified sender, or safe recipient were available, so live
Brevo sending remains not tested/unverified. The aggregate affected selector
selected all 321 tests but reached existing unrelated visual-harness lifecycle
failures; it is not represented as a green full-suite result. No production
mutation occurred.

## 2026-09-19 Repository & Architecture Professionalization — COMPLETE

The remaining professionalization boundary is complete for the current
repository. RI-2 supplies the provenance-aware graph/query API and RI-3
supplies bounded context integration behind the existing context commands. The
current repository triage records the remaining large/shared modules as
decomposed or intentionally cohesive, with explicit reasons tied to authority
and context budget.

Repository hygiene and onboarding are synchronized: npm is authoritative; RI
caches, build/coverage output, local environment files, logs, and new CI run
output are transient; durable sanitized security/UI evidence remains tracked
only where current contracts cite it; and current front-door docs describe the
live HydroQualiSense architecture.

The GitHub repository remains `Juvialski/InvoiceApp` in this run. A rename to
the recommended `HydroQualiSense` name was evaluated against remotes,
deployment inventory, Render/Actions/webhook references, and external
administration. Codex has no connected GitHub administration capability here,
so the external rename is documented as a manual administrative option and is
not represented as an unfinished repository implementation item. See
`docs/REPOSITORY_ARCHITECTURE_TRIAGE.md` and
`docs/REPOSITORY_EVIDENCE_POLICY.md`.

This completion is structural/developer-tooling evidence only. It does not
certify provider runtime, hosted QA, production, or Excel capability.

## 2026-09-19 Excel Phase 0 + shared foundation + bounded Procurement pilot — implemented

Phase 0 classified Procurement, Projects/Engineering, Expenses/Finance,
Inventory/Warehouse, Equipment, Workforce/Payroll, and Documents/communication
registers as Hybrid. The first implementation is intentionally limited to
RFQs and Purchase Orders because their register presentation and parent-owned
mutation callbacks are already bounded.

The implementation adds a reusable accessible `OperationsGrid`, a SheetJS-backed
workbook safety/metadata/parser layer, and a Procurement adapter for the
`RFQs`, `RFQ Lines`, `Purchase Orders`, `PO Lines`, and hidden
`_HydroQualiSense` workbook shape. Upload creates typed proposals and review
states; it never writes records. Draft-only editable fields are applied only
after explicit confirmation through the existing RFQ/PO save callbacks. Status,
workflow history, receiving/settlement evidence, derived totals, missing-row
deletion, and new-record creation remain protected or deferred.

Fresh host data is used for review/apply when the current application context
provides the Procurement refresh hook. Deterministic fingerprints and existing
`updatedAt` values detect stale changes at the review boundary. The current
save RPCs do not accept a version precondition, so this pilot does not claim an
atomic compare-and-apply guarantee across a race between refresh and mutation.
No migration, Docker/Supabase change, new spreadsheet dependency, production
operation, or app-wide Excel conversion is included.

## 2026-09-19 Projects + Project Controls Excel-native rollout — implemented

The Projects rollout extends the shared `OperationsGrid` and workbook engine to
the Projects portfolio and project cost-code controls. Desktop project and
cost-code registers now use dense keyboard-navigable grids with protected
financial columns, while the existing parent-owned filters, attention/health
derivation, detail/editor/lifecycle actions, and mobile card fallbacks remain.

The controlled workbook shape is `Projects`, `Cost Codes`, and hidden
`_HydroQualiSense`. Existing project and cost-code updates support reviewed
master-data/commercial edits only. Project lifecycle/status/archive metadata,
currency, Actual Cost, Committed Cost, billing/collection/settlement values,
cost-code status, parent identity, and audit metadata remain protected.
Missing rows are preserved, new workbook rows are unsupported, and no cell maps
directly to a database update. The review surface classifies unchanged,
workbook-only, app-only, stale/conflicting, protected, invalid, unauthorized,
unknown-reference, and unsupported-new-record states.

The final Apply boundary is atomic per project group: the project and affected
cost-code proposals are checked against expected `updated_at` tokens while the
project and all of its cost codes are locked, and the final active cost-code
budget is validated against the authoritative approved project budget before
mutation. RFQ/PO save RPCs now accept the same atomic expected-version contract,
closing the pilot's documented stale-write race. Creation and deletion through
the workbook remain deferred/unsupported.

Focused adapter/UI/grid/typecheck evidence is recorded on the implementation
branch. Local Docker/Supabase was unavailable during the Codex implementation
run, so the protected exact-head Database Migration & Invariant workflow is the
authoritative runtime gate for clean migration replay, pgTAP/invariants, and the
historical-data upgrade path before merge. Demo Visual QA is likewise an
exact-head merge gate for the changed Projects surfaces. Provider certification
and production promotion remain separate and unclaimed. That statement previously
identified Phase 4 — Expenses and Finance as next; bounded Phase 4A is now
implemented, and the 2026-09-20 selective workbook-editing UX correction
supersedes that old next-step wording.

## 2026-09-20 Excel Phase 4A — Expenses + Supplier Payables — implemented

Phase 4A extends the shared workbook engine and `OperationsGrid` to the Expenses
register and the supplier-payable context directly related to Expense records.
The workbook contains `Expenses`, read-only `Supplier Payables`, and hidden
`_HydroQualiSense` synchronization metadata. Only direct, existing, unlinked `DRAFT`
Expenses expose ordinary editable fields already supported by the normal Expense
workflow; status, lifecycle, source/vendor/PO identity, linked supplier
Expenses, settlement values, and derived fields remain protected.

Upload is proposal-only. Review validates company scope, hidden identity and
fingerprints, references, currencies, protected fields, stale state, missing
rows, and unsupported new rows before explicit Apply. Apply revalidates fresh
state and calls the existing Expense save path with its `updated_at` precondition;
the supplier invoice remains evidence and confirmed Cash & Banking matches
remain the settlement authority. No migration or production operation is part
of this bounded rollout. Direct editable Expense DRAFT worksheet editing is now
implemented in the UX-W4 section above. The next selective workbook candidate
is UX-W5 operational bulk-data editing, followed by later bounded Finance and
Cash & Banking/reconciliation work.

## 2026-09-18 Repository & Architecture Professionalization — Slice 5 Wave B

The repository professionalization track extracted the Subcontract register presentation into `src/components/procurement/SubcontractRegisterSection.tsx` while retaining subcontract, claim, variation, filtering, financial derivation, persistence, permission, lifecycle, and modal/drawer orchestration in `ProcurementPage.tsx`. The existing Claim and Variation workflow components remain authoritative. This is behavior-preserving architecture work; the later 2026-09-19 completion record closes the broader professionalization program for the current repository boundary.

At this historical 2026-09-18 checkpoint, the project-manager Excel-native
direction was approved as a future design contract at
`docs/superpowers/specs/2026-09-18-excel-native-operations-ux-design.md` and
implementation had not started: no `OperationsGrid`, shared sheet schema,
`.xlsx` reverse-import, import-review workflow, dependency, migration, or route
change was authorized by that entry. The 2026-09-19 Projects/project-controls
rollout supersedes this checkpoint while preserving its bounded-domain rule.
 
## 2026-09-18 Repository & Architecture Professionalization — Slice 5 Wave C
 
The repository professionalization track continues with Slice 5 Wave C, which extracts the Projects portfolio summary, search/filter controls, and responsive register presentation into `src/components/projects/ProjectPortfolioRegisterSection.tsx`. `ProjectsPage.tsx` line count is reduced from 1,413 lines to 713 lines. Authoritative project management view building (`buildProjectManagementView`), multi-currency portfolio summaries (`buildPortfolioManagementSummary`), deterministic filter/sort derivation (`filterAndSortProjectViews`), project editing, tax-treatment classification validation, and lifecycle action orchestration remain parent-owned.
 
This is behavior-preserving architecture work. No database, migration, RLS/RPC, financial-semantic, provider, production, or persistence contract changed. At this historical checkpoint Excel-native implementation remained deferred and no grid or spreadsheet dependency/code was introduced. Slice 5 Wave C is complete as this focused presentation extraction; the later 2026-09-19 Projects rollout is the first product implementation on top of that boundary.

## 2026-09-19 Repository Intelligence — RI-0 through RI-3

Repository Intelligence is now documented as an additive developer architecture built on the existing Workflow Map rather than a replacement for it. The canonical documentation is `docs/repository-intelligence/README.md` with separate architecture, graph/provenance, AI Context Engine, explorer UX, and implementation-roadmap documents.

RI-0 established the documentation-only architecture. RI-1 adds the local-only source index under `scripts/repository-intelligence/`: Git-tracked inventory, deterministic classification, SHA-256 content hashes, TypeScript/TSX compiler-API extraction, versioned manifest/per-file cache, full/incremental rebuilds, safe exclusions, concise CLI commands, and fixture-driven tests. RI-2 adds the provenance-aware unified graph/query API and RI-3 integrates bounded source/test/boundary context behind the existing `workflow-map:context` and `agent:context` interfaces with stale-index fallback.

RI-1 does not add a customer/runtime dependency, unified graph merge, provenance conflict resolution, context-engine replacement, explorer route, database/provider behavior, or production surface. Its disposable cache is `.cache/repository-intelligence/` and is ignored by Git. The exact validation evidence is recorded in the current handoff; hosted QA, browser QA, Docker/Supabase, migrations, and provider certification remain out of scope.

The planned core is model-provider-neutral. Current ChatGPT/Codex/Luna-compatible workflows may consume bounded packets where enabled, but Repository Intelligence does not depend on a model-specific API. No active/current DeepSeek dependency was found in the inspected main agent/roadmap/handoff/architecture documentation, so RI-0 does not rewrite historical records merely to remove a name.

Repository Intelligence core priority **RI-2 → RI-3** is complete. RI-4 through RI-6 are later developer-tooling improvements, and **RI-7 optional 3D is last**.

## Product dependency sequence

This sequence preserves the product/release dependency order established through the September reprioritizations. It is not the current structural implementation priority; the Current execution tracks section above governs that.

1. **Client Security Assurance & Handoff — IMPLEMENTATION EVIDENCE COMPLETE / DEPLOYMENT CERTIFICATION PENDING**
   - preserve the committed permission-based custom-role and Payroll reference boundaries;
   - carry the qualified evidence matrix, exact local synthetic-QA manifest, and seven-page client PDF into the deployment-specific release process;
   - promote and verify the exact branch release/migration in isolated hosted QA only when the guarded QA operator path is available; do not infer production authorization.

2. **Google Sign-In + Brevo Transactional Email Migration — PROVIDER DIRECTION IMPLEMENTED / RELIABILITY WORKSTREAM CONTINUES**
   - remove Gmail API read/send/intake and mailbox credential flows;
   - keep Google identity-only sign-in, Brevo server-side outbound email, human confirmation, historical Gmail provenance, and truthful provider states.

3. **Remaining Wave 4D messaging-provider/readiness completion**
   - Company SIM Gateway remains primary/recommended;
   - PhilSMS remains the optional hosted Philippine fallback;
   - keep SMS truthful as unavailable/unverified until controlled provider-backed runtime QA exists.

4. **Wide Documents Phase managed foundation — IMPLEMENTED for the recorded scope;** broader artifact aggregation and authenticated HSC/render certification remain separately bounded.

5. **Worker Registration — PAUSED** until broader Wave 4D is genuinely complete and the user explicitly resumes it.

6. **Site Attendance state machine + registered site/device** after Worker Registration.

7. **Face-Recognition Attendance** only after explicit identity/privacy/consent/retention/liveness/confidence/fallback/security design.

8. **Final pre-production security/data-integrity certification** before broad rollout.

## Completed UI/UX Round 2 implementation boundary

The completed phase used the approved schema-compatible application loop:

`feature branch -> local app -> isolated QA Supabase/Auth/Postgres/Storage -> authenticated workflow -> inspect -> fix -> focused regression`

The Local-QA harness remains fail-closed to QA and must reject production targets and privileged browser-unsafe keys.

Local QA is pre-merge functional evidence, not release certification.

### Database boundary

No migration/RLS/RPC/trigger/database-contract change was introduced by UI/UX Round 2. Docker/Supabase database replay was therefore not required by the final diff; the protected database workflow correctly classified the PR as database-unaffected.

Do not silently redefine backend financial/security contracts in later UI/provider work.

## Hosted QA / release-readiness track

`QA CERTIFICATION: NOT READY`

The last hosted-certified application SHA `e4ee4ebde489629ee74429b4e37abb511943a51e` passed hosted exact-SHA application certification and separate supplier-payables QA certification.

At that certified state:

- QA and production Supabase projects were independently distinct;
- repository/QA migration parity matched `20260912082656_supplier_payables_settlement_consistency`;
- hosted authentication persisted;
- route contracts passed;
- authenticated Storage upload/read/hash/cleanup passed;
- supplier-payables authenticated QA assertions passed;
- no uncontrolled email or SMS was sent.

Overall QA remains not ready because broader readiness/provider limitations remain:

- Wave 4D provider-backed completion/runtime evidence is incomplete;
- SMS has approved provider paths but no controlled configured runtime-certified deployment yet;
- Brevo sender/runtime proof requires client-specific QA configuration and a verified sender;
- subcontract settlement remains fixture-blocked where no safe fixture exists;
- company-template Starter/Upload Storage authority and the real authenticated AI Analyze/Prepare/Generate/Test DOCX workflow are locally certified for the exercised QA target; high-fidelity PDF conversion remains unavailable;
- the newer UI/UX Round 2 application code still requires appropriate hosted exact-SHA evidence before release-readiness claims can move from the older hosted-certified application SHA.

Production remains read-only unless separately and explicitly authorized under `docs/CHATGPT_MIGRATION_OPERATOR_POLICY.md`.

A green PR, merge, Render deploy, QA success, or documentation update does not authorize production database/Auth/Storage/secret writes or migration promotion.

## Permanent financial / security / history boundaries

Preserve throughout remaining work:

- one deployment -> one client company;
- RLS/RBAC/company isolation;
- Supplier Invoice evidence remains separate from authoritative linked Expense payable/cost truth;
- Client Invoice/Collection receivable truth remains separate from Cash & Banking settlement evidence;
- Actual Cost remains distinct from Committed Cost;
- `projects.contract_value` remains distinct from `projects.project_budget`;
- original currency remains explicit and mixed currency is not silently summed;
- payroll privacy, calculation freshness, approval authority, and settlement history remain intact;
- Purchase Order receipt/close rules remain intact;
- inventory movement/allocation history remains explainable/authoritative;
- immutable issued/finalized document snapshots and provenance remain intact;
- send/delivery history remains append-only and company-bound;
- Assistant consequential actions remain `prepare -> review -> human confirm -> execute`;
- navigation simplification is never authorization simplification.

## Worker Registration gate

**PAUSED.**

UI/UX Round 2 is complete. The current approved Email/SMS Reliability & UX slice and the broader Wave 4D gate must be genuinely complete before Worker Registration. Worker Registration still requires explicit user resumption.

## 2026-09-21 Jev Workflow Intelligence v2A — research/design complete

The bounded v2A developer-tooling research run is complete. The durable report
is `docs/repository-intelligence/JEV_WORKFLOW_INTELLIGENCE_V2_RESEARCH.md`.
It records official TypeSafe/SDK/evaluation sources, read-only X findings,
reviewed community source patterns, 48 live Jev requests over sanitized
synthetic/historical metadata, and a ten-commit labeled replay.

The research confirmed the UX-W5B `0/0` clean-baseline context result, the
current 64-candidate fallback, the 20,000-character sanitizer boundary, and
the 75-test `sanitizer-rejected` path. Isolated offline helpers/tests now
measure deterministic chunk coverage, multi-axis question shape, protected
candidate retention, and historical recall separately from context reduction.
The highest-value v2B candidates are deterministic task seeding,
payload-aware chunking/tournament selection, multi-axis advisory context
review, chunked test triage, mid-diff adjacency, and criterion-level evidence
checking. No v2B behavior was integrated into normal context/test/CI commands,
and no customer/runtime/database/provider contract changed.

V2B implementation remains separate from v2A and is now the next explicit
developer-tooling handoff. The first bounded slice should implement payload-safe
request primitives/diagnostics, deterministic clean-baseline task seeding,
budget-aware chunking for context and broad test sets, and deterministic
must-keep/required-test unions before richer routing experiments. Remaining
Wave 4D provider/readiness evidence may proceed opportunistically when safe
external prerequisites exist; remaining UX-W5 domains stay queued and
separately bounded. Worker Registration remains paused.


### Deployed follow-up findings — 2026-09-22

The following current deployed findings are now explicit follow-up blockers and should be re-verified from live source before implementation:

- **Dashboard stability:** the newer simplified Dashboard may render briefly and then revert to the legacy Dashboard after workspace hydration/data loading. Round 4 Dashboard completion requires a single stable authoritative render path.
- **Payroll persistence:** the UI currently surfaces `Payroll period ownership and company are immutable`. Preserve the database immutability guard; correct client persistence/update semantics rather than weakening ownership/history protection.
- **Brevo reliability:** Email / SMS currently reports that Brevo connection status could not be checked safely. Provider/runtime readiness is unverified until the status path and deployment configuration are investigated and controlled provider evidence is obtained.

These findings do not resume deferred product domains and do not authorize production/provider mutation.


### UI Round 4 current-state audit — 2026-09-22

Durable audit: `artifacts/ui-ux-audit/UI-R4-CURRENT-STATE-AUDIT-2026-09-22.md`.

The audit does not change the approved Round 4 sequence. It tightens R4C around one stable Dashboard/Home render path and records the remaining app-wide R4E migration/certification debt. In particular, the current Dashboard route deliberately switches from the simplified permission-scoped Home to the legacy analytics Dashboard once completeness changes, which matches the deployed reversion observed by the user.

R4E should migrate the remaining legacy page-level light/slate/button grammar onto the R4B semantic/action system rather than introduce another design system. Suggested internal R4E ordering is: high-friction daily finance/communication/payroll workflows first, then operations registers, then full Light/Dark/System and responsive certification.

Separate current reliability follow-ups remain the Payroll ownership-persistence error and Brevo connection/status failure; neither should be hidden by visual cleanup.


### 2026-09-23 Dark-mode contrast correction — mandatory Round 4 acceptance

Current deployed Dark mode is not accepted as complete. User review reports a background-first darkening effect with foreground text/control contrast that is not consistently usable, and the current-state audit shows substantial remaining hard-coded light-theme styling outside the R4B proving surfaces.

The approved sequence remains unchanged, with stronger acceptance gates:

- **UI-R4C — Home Dashboard + Project Portfolio:** implemented for the recorded local safe-demo scope. See `artifacts/ui-ux-audit/UI-R4C-HOME-PROJECT-PORTFOLIO.md` for source SHA, lead-inspected Light/Dark screenshots, and validation evidence.
- **UI-R4D — entity media:** next approved Round 4 phase; media overlays/fallbacks/captions must respect both themes, with the defined storage/security design and validation boundaries.
- **UI-R4E — app-wide rollout + certification:** explicitly owns app-wide Dark-mode foreground/background/border/control/status/focus remediation and contrast certification. Low-contrast Dark UI is a P1 Round 4 blocker.

Use the existing Astryx/HydroQualiSense semantic theme system. Do not introduce a separate dark palette or solve the app by scattering unrelated page-specific `dark:` utilities.

Final R4E certification must visually inspect actual screenshots in Light and Dark across desktop, constrained laptop, tablet, and phone and apply WCAG AA contrast expectations to text and relevant non-text controls/focus states.

### 2026-09-23 UI-R4D Entity Media Foundation closeout

The bounded implementation is in source commit `0a93f7c2fb79c5ece590aa87a416c32c8626d17b`, based on synchronized `main` SHA `c057ffc9585ab6a890f260cbec8ae8def8d3081c`. Project covers, canonical Equipment Registry assets, and canonical Warehouse Inventory items now share a private company-scoped media binding and cleanup flow. Project register references reuse canonical Equipment/Material images only when the existing corresponding read permission is present. No operational, financial, stock-movement, lifecycle, or audit authority moved into media.

The durable visual and technical evidence is `artifacts/ui-ux-audit/UI-R4D-ENTITY-MEDIA.md`, with 12 lead-inspected screenshots under `artifacts/ui-ux-audit/screenshots/r4d/`. The source-commit safe-demo matrix passed 12/12 with zero console/page/request/navigation/overflow failures. Local Supabase upgrade fixtures passed 3/3, the full local database catalog passed 1,693 assertions across 51 files, the local Storage HTTP integration passed, and lint/typecheck/build plus Workflow Map validation passed. The affected-test selector also exposed two unchanged stale-copy assertions; the viewport-catalog expectation it found was updated and focused validation passed. See the evidence report for exact qualification and failure details.

This does not claim S3-compatible provider credentials, hosted QA, provider/device certification, or production certification. REL-AUTH-1 is next; UI-R4E follows after the reliability fix.


### 2026-09-23 REL-AUTH-1 priority — idle session & deployment access recovery

**Priority override:** UI-R4D is merged. Before broad UI-R4E, implement **REL-AUTH-1 — Idle Session & Deployment Access Recovery** as a bounded reliability phase.

Deployed evidence to preserve:
- after the application remains idle/backgrounded for an extended period, an already-authorized user can be replaced by the blocking `Company access unavailable` screen;
- a normal browser refresh immediately restores that same user's valid deployment-company access;
- no administrator action, membership re-add, permission change, company switch, or manual sign-in is required;
- this makes a transient client/session/access-refresh transition the leading boundary, but the exact root cause remains unproven until a controlled reproduction is captured;
- a temporary inability to verify deployment access must not be presented as confirmed revocation;
- confirmed membership revocation, inactive membership/company, deployment mismatch, logout, or different-user state must continue to fail closed.

Current source-boundary investigation on merged R4D `main` identified these areas as the highest-value next inspection points:
- `src/context/CompanyAccessContext.tsx`;
- `src/lib/companyAccess.ts`;
- `src/lib/companyAccessRefresh.ts`;
- `src/lib/authenticatedRequestRecovery.ts`;
- `src/lib/deploymentCompany.ts`;
- `src/lib/supabase.ts`;
- `src/lib/companyApi.ts`;
- `src/components/access/AccessStates.tsx`;
- the access-gating branch in `src/App.tsx`.

The existing provider already preserves a same-user `ready` snapshot when the initial access/deployment RPC load throws during a background refresh, and generation/user guards prevent older access requests from overwriting a newer state. However, deployment-access resolution exceptions are currently promoted to terminal `error` without the same preservation path, and a transient auth transition that clears the ready snapshot can make the following load non-preserving. The application also renders technical access-load `error` through the same `Company access unavailable` framing used for true authorization loss. These are evidence-based investigation boundaries, not yet a proven root cause.

REL-AUTH-1 acceptance must distinguish:
- valid ready access + transient verification/network failure -> preserve the last confirmed same-user access temporarily, surface at most a small retrying/connection warning, and recover safely;
- stale access token + valid refresh token -> refresh authentication once/safely and re-resolve access without showing the terminal company-access screen;
- genuinely expired/invalid refresh session -> clear privileged context and show an explicit session-expired/sign-in-again state;
- successfully confirmed inactive/revoked membership, inactive company, or authoritative deployment denial -> remove permissions and fail closed;
- different user or logout -> never inherit the previous user's access snapshot;
- stale/concurrent access requests -> never clobber newer valid or newer revoked state.

Use controlled auth events, fake timers, mocks, bounded visibility/resume simulation, and targeted browser checks rather than an hours-long idle test. No production mutation is authorized by this investigation.

**Sequence:** `REL-AUTH-1 -> UI-R4E`.

The already-approved R4E shell direction remains queued, not part of REL-AUTH-1: desktop should remove the redundant global top row containing duplicate product/page identity, permanent successful-sync status, global Export, and duplicate account/email identity; normal successful sync should be silent; exports belong in Documents/Reports/relevant workflows; account identity plus logout belong in the lower-left sidebar account menu. Mobile/tablet may retain minimal top navigation for the menu trigger.

Keep Payroll's `Payroll period ownership and company are immutable` persistence bug, Brevo status reliability, broad R4E Dark-mode cleanup, Worker Registration, attendance, Face Recognition, and unrelated product domains separate from REL-AUTH-1.
