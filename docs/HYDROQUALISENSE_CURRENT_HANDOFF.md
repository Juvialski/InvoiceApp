# HydroQualiSense Current Handoff

Status: **CURRENT — UX-S3A + S3A2 COMPLETE / UX-S3B READY NEXT / REPOSITORY PROFESSIONALIZATION COMPLETE / UX-W1–UX-W5C IMPLEMENTED FOR RECORDED SCOPES / WIDE DOCUMENTS MANAGED FOUNDATION IMPLEMENTED FOR RECORDED SCOPE / JEV WORKFLOW INTELLIGENCE V2A COMPLETE / V2B PAYLOAD-SAFE FOUNDATION IMPLEMENTED / REMAINING V2B EXPERIMENTAL SLICES DEFERRED / REMAINING UX-W5 BOUNDED / 3D LAST / PROVIDER READINESS SEPARATE / WORKER REGISTRATION PAUSED**
Date: **2026-09-21**
Repository: `Juvialski/InvoiceApp`

RI-0 Repository Intelligence planning was prepared from the earlier current
main snapshot. RI-1 is merged on `main`; this implementation run starts from
main SHA `0826d458a7b75693abead8e2ea12160649aa07ec` and implements RI-2 and
RI-3 sequentially behind the existing context interfaces.

## Current repository state

The pre-Wave-C merged `main` baseline was:

`4f840b291f4efa28eedceceae5ed95843d7c3f58`

This handoff includes Slice 5 Wave C (Projects portfolio/register presentation
decomposition), RI-2/RI-3, and the closed professionalization triage on top of
that baseline. Slices 1-4 and Slice 5 Waves A-C are implemented; the current
repository responsibility, hygiene, evidence, onboarding, branding, and
repository-identity decisions are now explicitly closed. The implementable
Email/SMS Reliability & SMS Improvement slice is complete on merged `main`;
live Brevo/SMS provider certification remains pending external
credentials/device/runtime.

The Excel-Native Operations workbook/authority contract is documented at `docs/superpowers/specs/2026-09-18-excel-native-operations-ux-design.md`. Phase 0/readiness, the original shared foundation, the bounded Procurement pilot, Projects/project-controls, and bounded Expenses/Supplier Payables are implemented; app-wide Excel capability remains unclaimed.

The later approved interaction correction is `docs/superpowers/specs/2026-09-20-selective-workbook-editing-ux-direction.md`. It now governs the in-app UX: **browse visually, edit like a spreadsheet, execute sensitive workflows deliberately**. UX-W1 shared worksheet editing foundation, UX-W2 Projects integration, UX-W3 Supplier Invoice source-first worksheet review, and all bounded UX-W4 draft editors are implemented. The UX-W4.5A investigation is complete for source SHA `b279b02730b79cccac5f72ac4c93553d957db07b`; the durable report is `artifacts/ui-ux-audit/UX-W4.5A-REPORT.md`. UX-W4.5B shared responsive shell/editor foundations, UX-W4.5C task-first hierarchy plus bounded workspace-width/visual-grammar corrections, and UX-W4.5D Supplier Invoice/worksheet clarity are implemented. UX-W4.5E App-Wide Visual Consistency & Professional-Finish Certification is implemented at application-bearing SHA `3eb2819edd4da3527e083882bf451c171c35b6a4`; the final disposition and evidence are recorded in the report and `artifacts/ui-ux-audit/screenshots/ux-w4-5e/README.md`. UX-W5A Project Materials & Project Equipment, UX-W5B Warehouse Item Master + Canonical Equipment Master, and UX-W5C Vendor Master worksheet maintenance are implemented for their bounded scopes. The user explicitly reprioritized the current run to Jev Workflow Intelligence v2A research/calibration and its first v2B payload-safe foundation slice (`docs/repository-intelligence/JEV_WORKFLOW_INTELLIGENCE_V2_RESEARCH.md`); remaining v2B experiments stay deferred and later UX-W5 slices retain separate bounded handoffs.

The governing correction contract is `docs/superpowers/specs/2026-09-20-worksheet-density-clarity-correction.md`. The user-provided Projects and Supplier Invoice screenshots were examples only; the completed UX-W4.5A report visually inspected the broader safe-demo product across desktop, constrained laptop, tablet, and phone before broad remediation begins.

### UX-S3A + UX-S3A2 — baseline research and Jev-browser validation complete; S3B ready

UX-S3A produced a baseline at exact source SHA
`567013c8f0b851468cc8d0c4bbe1eb11d3fdf6cf`. The durable evidence report is
`artifacts/ui-ux-audit/UX-S3A-RESEARCH-AND-INSTRUCTION-DENSITY-AUDIT.md`.
It records public comparator/help-surface research, current safe-demo route/state
evidence, the Keep / Shorten / Contextual Help / Help Center / Remove matrix,
shared root causes, workflow-hardening backlog, provisional S3B boundary, and
the sanitized Jev efficiency ledger. The run remained research-only: no Help
Center, contextual-help primitive, visible-copy mass simplification, workflow,
database, provider, or production change was made.

Review identified a remaining research gap: the intended deep multi-product
interactive Chrome investigation was not demonstrated, and the existing Jev
client had not operated the browser. UX-S3A2 closed that gap for the accessible
public boundary on validation SHA
`4e00c1375c278394dd8db567732dd7ec56990022`. The community
`jev-browser-use` bridge operated through the existing Codex CUA in-app browser;
Raken and Fieldwire matched tasks both reached their target pages after
independent Codex verification, and Procore, Autodesk, Buildertrend, Fieldwire,
and Raken public surfaces were directly inspected with limitations recorded.
The matched benchmark was deliberately small and showed stale-state handbacks;
it does not establish a general Jev speedup. Current HydroQualiSense evidence
remains local safe-demo evidence, and comparator evidence remains public
help/documentation evidence rather than authenticated or hosted certification.

UX-S3B is now ready as the bounded Help Center/contextual-help foundation. It
must use static repository-backed topics, route/topic deep links, a consistent
page-level Help action, accessible click/tap popovers for brief explanations,
and visible task-critical state. It must not claim authenticated comparator
parity, browse/edit certification, responsive product certification, or S3C/S3D
completion.

### UX-W4.5B — shared responsive shell and worksheet foundations

This bounded UI/application slice addresses the shared root causes behind
UX45A-002, UX45A-003, UX45A-006, and UX45A-010 without changing financial,
security, lifecycle, history, provenance, concurrency, or persistence
authority.

- `useDialogFocus` now reference-counts document scroll locking, restores prior
  scroll styles on close, and preserves focus containment/return.
- The app shell exposes a focus-safe scroll-padding boundary. Project Details,
  Expense Draft, RFQ, and Purchase Order modal wrappers use explicit
  overflow-hidden overlays and a deliberate dialog body scroll owner.
- `WorksheetEditor` preserves desktop grid/table behavior and adds a phone
  row/field fallback that reuses the same edit, parse, validation, conflict,
  dirty, clipboard, focus, Save/Apply, and row-operation contracts.
- Ordinary protected/read-only cells remain non-editable and machine-readable
  without repeating visible `Protected` / `Read-only` pills. Exceptional issue
  states remain prominent.
- Stable responsive-surface markers cover Project Details, Cost Codes, Client
  Billing, Expense Draft, RFQ, Purchase Order, and Supplier Invoice for
  targeted evidence.

Focused worksheet/responsive coverage passed 38/38; affected application
selection passed 479/479 with database fallback disabled; TypeScript, ESLint,
and the production build passed on the implementation run. Interactive local
safe-demo visual inspection covered representative phone and desktop states at
the qualified capture SHA. PR review then added the quiet mobile read-only,
unique issue-description ID, and hidden-responsive-control focus fixes at
`85efe8f951b96df0c20dd6ffd4869f0b083c2343`. The local Demo Visual QA runner was unavailable because that
clean worktree lacked Playwright; protected exact-head browser CI remains the
merge gate; the exact qualified visual disposition is recorded in
`artifacts/ui-ux-audit/screenshots/ux-w4-5b/README.md` and the follow-up
section of `artifacts/ui-ux-audit/UX-W4.5A-REPORT.md`.

UX45A-002 is partial because the safe-demo SMS provider-unconfigured state did
not reproduce the original long provider workflow. UX45A-003 and UX45A-010
are resolved for the bounded worksheet consumers. UX45A-006 shared cell-state
noise is resolved; Supplier Invoice page-specific hierarchy was left for
UX-W4.5D. UX45A-004 was deliberately deferred from this slice. DB validation
was not applicable.

### UX-W4.5C — task-first hierarchy, workspace width, and visual grammar implemented

The current implementation branch completes UX-W4.5C without changing database,
RLS/RPC, provider, lifecycle, financial authority, history, concurrency, or
workbook Apply contracts.

- Projects places compact search/filter/sort/view controls and the card/list
  working surface before Portfolio snapshot, exception notices, and Excel tools.
- Expenses places Add Expense/register controls and records before selected
  detail, supplier-document follow-up, summary metrics, and workbook disclosure.
- Cash & Banking keeps account/transaction controls, the ledger, reconciliation
  exceptions, and the existing settlement allocation workspace ahead of
  secondary cash summaries. Settlement remains purpose-built, not worksheet
  editing.
- Project Workspace exposes one active-surface region and moves the overview
  attention region before secondary analytics. Budget Control presents Contract
  Value plus the distinct approved budget/actual/committed controls, then the
  cost-code worksheet, then attention and mixed-currency warnings.
- A bounded Type A audit widened Purchase Order, RFQ, RFQ comparison, goods
  receipt, subcontract claim/editor/variation, and supplier quotation canvases
  to use the available desktop workspace. Type C reason/confirmation dialogs
  remain compact.
- `WorksheetEditor` exposes data-type alignment markers and a shared action-bar
  marker. Project Details/Cost Codes use explicit right-aligned financial fields
  and centered status fields. PO/RFQ Save/Close actions are owned by one stable
  modal footer; approval, issue, receiving, close, cancellation, matching, and
  settlement remain separate.

Integrated changed-surface focused validation passed **120/120**. PR review
advanced the application-bearing head to
`1652add981cb8d51ea24495f958273380627eb30`; exact-head Application Validation
selected and passed **486/486** affected application tests with database fallback
disabled and passed lint/typecheck/build. Exact-head Workflow Map Consistency,
the database-unaffected migration/invariant gate, and protected Demo Visual QA
also passed. The protected screenshot artifact was inspected directly. Review
found and fixed one remaining visual blocker: the Project Overview Management
Attention wall was too tall and buried financial controls, so it now presents a
compact severity summary with evidence/drilldowns disclosed on demand. Projects
remains card-first and PO/RFQ keep the wide working-canvas treatment across the
captured responsive states. Evidence and disposition are recorded in
`artifacts/ui-ux-audit/UX-W4.5A-REPORT.md`.

UX45A-001 and the bounded UX45A-005 hierarchy target are resolved for W4.5C;
UX45A-008, UX45A-009, UX45A-013, and UX45A-014 remain partial where they extend
beyond touched surfaces; UX45A-004 was deferred from W4.5C into UX-W4.5D.
UX-W4.5E is now explicitly the future
**App-Wide Visual Consistency & Professional-Finish Certification** phase.

### UX-W4.5D — Supplier Invoice and worksheet clarity implemented

The bounded UX-W4.5D correction is implemented at application-bearing SHA
`4d5b158acec8427fd684a64513df05a00fe6ba71`, from base SHA
`f4177ecd3c40d3baaf6bcdf51806e0d58a5e9534`.

- Supplier Invoice review keeps the populated safe-demo source image first,
  followed by a compact review status/action bar, extracted data, blocking
  review items, and collapsed review/provenance/accounting details.
- The four extracted worksheet sections share one aggregate Save/Discard/Add
  line toolbar. Ordinary source provenance and calculated markers remain
  machine-readable but are visually quiet; manual corrections and unresolved
  values remain visible.
- Canonical Vendor identity remains a controlled link/create workflow, and
  Supplier Invoice evidence remains separate from linked Expense payable/cost
  authority. No database, migration, RLS/RPC, provider, or production change
  occurred.
- The safe-demo review record uses `public/demo/supplier-invoice-review.svg`.
  The existing Project Details, Cost Codes, RFQ, Purchase Order, Client
  Billing, and Expense worksheet consumers were audited and their W4.5B/C
  contracts were preserved without unrelated redesign.

Validation passed: focused migrated-worksheet/Supplier Invoice coverage **89/89**;
`npm.cmd run test:affected:agent` **293/293** with database fallback disabled;
ESLint/TypeScript; and production build. Manual local safe-demo inspection
covered `/demo/app/review?invoiceId=demo-invoice-07` at desktop `1920x911` and
responsive `652x698`. Automated Demo Visual QA was attempted but this checkout
lacks the `playwright` package, so no automated browser PASS or promoted
screenshot artifact is claimed. Docker/Supabase and hosted/provider/production
checks were not applicable. The durable disposition is recorded in
`artifacts/ui-ux-audit/UX-W4.5A-REPORT.md`.

At the UX-W4.5D checkpoint, the exact next implementation phase was
**UX-W4.5E — App-Wide Visual Consistency & Professional-Finish Certification**.
The UX-W4.5E section below records that the visual gate is now closed for its
bounded scope.

### UX-W4.5E — app-wide visual consistency and professional-finish closeout

UX-W4.5E is implemented at application-bearing SHA
`3eb2819edd4da3527e083882bf451c171c35b6a4`. The shared OperationsUI grammar
now uses restrained, consistent page/section/filter/metric/disclosure/loading
and error treatment. Document preview loading/error states use compact,
explicit frames rather than reserving a large blank canvas. No financial,
security, lifecycle, provenance, history, concurrency, workbook, provider, or
database contract changed.

The final safe-demo Demo Visual QA run passed **89/89** scenarios with zero
console errors, page errors, failed requests, or horizontal-overflow failures.
Focused UX-W4.5E coverage passed **28/28**; the integrated affected selector
passed **146/146** with database fallback disabled; lint/typecheck and build
passed. The lead agent directly inspected representative changed surfaces at
desktop, constrained laptop, tablet, and phone sizes. The RFI/Submittal
query-string scenarios were confirmed as explicit missing-record recovery
states; populated RFI/Submittal detail layouts remain a P2 evidence gap. Preview
loading/action placement was inspected on desktop and phone. The durable report and promoted screenshots
are `artifacts/ui-ux-audit/UX-W4.5A-REPORT.md` and
`artifacts/ui-ux-audit/screenshots/ux-w4-5e/README.md`.

UX-W4.5E closes the remaining P0/P1/shared-root-cause visual gate for this
application boundary. UX45A-012 remains partial/non-blocking because the safe-demo
dataset does not certify populated RFI/Submittal detail layouts. **UX-W5 is
unblocked from the visual gate**, but no
UX-W5 code was started here; its operational bulk-data scope requires a new
bounded handoff and remains subject to the separate Wave 4D/provider and
product-sequencing gates. Local/demo evidence remains non-hosted and
non-production certification.

### UX-W5A — Project Materials & Project Equipment worksheet register editing

UX-W5A is implemented for the bounded Project Materials / Project Equipment
slice. The Materials & Equipment register remains the normal visual browse,
summary, reconciliation, procurement, warehouse, site-evidence, and canonical
Equipment context surface. Its explicit Add/Edit entry points now open a wide,
responsive shared `WorksheetEditor` modal for safe structured metadata.

Project Material editable cells are material name/description, reference/code,
category, planned quantity, unit, permitted warehouse-item link, project cost
code, permitted PO-line link, register status, and notes. Project Equipment
editable cells are asset/reference, equipment name, type/category, source,
provider/vendor, project-register start/end dates, register status, and notes.
Stable IDs, company/project ownership, warehouse on-hand and movement truth,
PO receiving quantities, site observations, reconciliation, canonical Equipment
Registry identity, assignment/transfer/return, lifecycle, history, and other
derived/source facts remain protected or outside ordinary cells.

The worksheet uses keyboard navigation, bounded paste, dirty/new row staging,
draft-only row removal, validation/normalization, a phone fallback, and
sequential dirty-row saves through the existing `onSaveMaterial` and
`onSaveEquipment` callbacks. A failed row remains staged and visible; no
parallel persistence or bulk transaction was introduced. This is a
UI/application-only change with no migration, RLS/RPC, inventory, procurement,
provider, or production contract change. Remaining UX-W5 domains outside W5A
and W5B are not started and Worker Registration remains paused.

Final validation passed the focused worksheet/editor/demo group **52/52**,
`npm.cmd run test:affected:agent` **544/544** with database fallback disabled,
ESLint/TypeScript, and the production build. Targeted local Playwright browser
captures were inspected for `/demo/app/projects/demo-project-warehouse/materials-equipment`
at desktop `1440x1000`, constrained laptop `1366x768`, tablet `768x1024`, and
phone `390x844`, covering the browse register, material create/edit/validation,
equipment create/edit, phone fallback, and protected canonical-identity state.
The full database/Supabase ladder was not applicable because no database
contract changed; no Workflow Map source/generated contract changed. Local/demo
browser evidence remains non-hosted and non-production certification.

### UX-W5B — Warehouse Item Master + Canonical Equipment Master worksheet maintenance

UX-W5B is implemented for the bounded Warehouse Item + canonical Equipment
master-data slice. Warehouse and Equipment browse/register pages remain the
normal visual surfaces; explicit movement, receipt, issue/return, assignment,
transfer, return, lifecycle, observation, and history workflows remain outside
ordinary worksheet cells.

Warehouse editable cells are item name/description, item/reference code,
category, and stock unit only for new items or existing items without movement
or project-usage history. Existing status, on-hand, movement totals/counts,
movement provenance, receipt linkage, and protected stock units are read-only.
Equipment editable cells are asset/reference, name, type/category, ownership/
source, provider/vendor, and notes. Lifecycle status, current state, current
Project, active assignment, assignment start, assignment history, and all
assignment/lifecycle actions remain protected. Existing lifecycle status is
carried through ordinary metadata saves, preserving MAINTENANCE,
OUT_OF_SERVICE, RETIRED, and other existing state values.

Both worksheets use the shared `WorksheetEditor` with staged multi-row setup,
keyboard and bounded paste behavior, dirty state, draft-only row removal,
validation, explicit Save/Cancel, phone fallback, and sequential authoritative
callback saves with failed-row retention. A narrow draft/save helper is shared
with the existing W5A worksheet family. No migration, RLS/RPC, trigger,
inventory movement, equipment assignment, provider, or production contract
changed.

Focused worksheet/editor coverage passed **43/43**; the focused inventory/
Equipment/domain group passed **53/55** with two explicit runtime DB tests
skipped because their runtime environment flags were not enabled. The final
deterministic affected selector passed **476/476** with database fallback
disabled; ESLint/TypeScript and the production build passed. Workflow Map
consistency passed. Production-build Demo Visual QA passed **85/85
interaction scenarios**, **104 screenshots**, and zero console errors, page
errors, failed requests, or overflow failures across desktop `1440x1000`,
constrained laptop `1366x768`, tablet `768x1024`, and phone `390x844`.
Local/demo evidence remains non-hosted and non-production certification.

The single Jev context checkpoint had **0 deterministic candidates / 0 selected**
with fallback `false`; the live response did not return model/token/latency
fields. Jev test triage retained all **75/75** required tests and fell back with
`sanitizer-rejected`; deterministic affected selection remains authoritative.
Vendor master is implemented below as UX-W5C. Workforce domains, Worker
Registration, and other out-of-scope UX-W5 slices were not started; Worker
Registration remains paused.

### UX-W5C — Vendor Master worksheet maintenance

UX-W5C starts from synchronized `main` SHA
`3f9a087633f6e5508b0fe3562f4327a29d8563b0` on feature branch
`codex/ux-w5c-vendor-master`.

The Vendor directory remains a browse/search surface with canonical identity,
linked supplier-invoice counts, source-currency totals, state, and review
signals. Authorized users can deliberately open `Manage Vendors`, edit a
specific Vendor, or stage a new Vendor row in the shared responsive
`WorksheetEditor`.

The worksheet exposes only safe live Vendor master fields: name, email, phone,
tax/business ID, address, default currency, and default category. Identity,
company ownership, normalized identity, lifecycle/archive/deactivation state,
timestamps, invoice evidence, procurement references, Expenses/payables,
settlement/payment truth, and history remain protected or outside ordinary
cells. Supplier Invoice extracted text remains evidence and is not rewritten by
Vendor master edits.

Persistence reuses the existing parent/controller `onAddVendor` / `saveVendor`
path; no parallel Vendor writer or new XLSX subsystem was added. Exact duplicate
identity conflicts surface before save. A forward-only migration
`20260921074220_vendor_worksheet_concurrency.sql` adds an optional
`expectedUpdatedAt` predicate to the existing canonical Vendor RPC so stale
worksheet rows fail closed with SQLSTATE `40001` / `EXPECTED_VERSION_MISMATCH`.
RLS, company isolation, guarded lifecycle RPCs, and append-only Vendor history
remain authoritative.

Focused Vendor/worksheet/browser-catalog coverage passed **52/52**; the final
deterministic affected selector passed **226/226** tests from **36/356** files
with database fallback disabled. Full ESLint and TypeScript passed, the
production build passed, and Workflow Map consistency passed. The repository
Demo Visual QA runner was unavailable because this clean worktree did not have
the QA-only `playwright` package. Direct local browser inspection covered
`/demo/app/vendors` at the default desktop viewport and explicit phone
`390x844`: browse directory, worksheet table, protected lifecycle state, staged
Add Row validation, and mobile row/field fallback were visibly inspected. This
is local/demo evidence, not hosted or production certification.

The migration static suite passed **114/114** checks. Live pgTAP, clean replay,
upgrade-path, and runtime RLS/RPC/concurrency checks were not run because
Docker/Supabase was unavailable (`dockerDesktopLinuxEngine` was missing and
`127.0.0.1:54322` refused the upgrade-test connection). The committed R5 pgTAP
coverage now asserts stale-version rejection and current-version success for
the canonical Vendor RPC.

Jev effectiveness for this real phase: deterministic context candidates **22**;
selected **14**; must-keep **11**; **2** payload-safe context requests/chunks;
model `jev-1.13.0`; **9,821 / 1,578** input/output tokens; **1,974 ms**;
fallback `false`. The rerank retained all explicit/must-keep Vendor paths and
removed eight optional candidates. Deterministic test selection was **36**
required files; live test-triage used **1** request, retained/recommended
**36/36**, model `jev-1.13.0`, **4,848 / 534** tokens, **1,050 ms**, fallback
`false`. Live completion used **1** request over five evidence categories,
model `jev-1.13.0`, **694 / 89** tokens, **711 ms**, fallback `false`; the
advisory marked database evidence absent and kept `unresolvedUncertainty=true`
because the committed static-only database evidence and Playwright/Docker
limitations were explicit. Initial vague/invalid
context selector attempts were not useful; the corrected explicit-selector
context call was useful. No customer/private records, invoice contents,
credentials, browser/session state, or secrets were sent to Jev.

The exact next unfinished UX-W5 work is the workforce set (Workers, Attendance,
Time Entries, and Project Assignments), which remains gated by the paused Worker
Registration sequencing and broader Wave 4D/product prerequisites. Do not
unpause Worker Registration here. Wide Documents, provider certification,
Finance UX-W6, and custom fields retain their separate roadmap order.

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
- **`docs/HYDROQUALISENSE_UNIFIED_DOCUMENT_CENTER.md` — Wide Documents authority contract and recorded managed-artifact foundation**;
- **`docs/superpowers/specs/2026-09-14-unified-document-center-design.md` — Slice 1 design**;
- `docs/superpowers/specs/2026-09-13-document-template-ai-autotagging-design.md` — completed corrective foundation;
- `docs/HYDROQUALISENSE_DOCUMENT_TEMPLATES_WAVE4A.md` — existing immutable template/mail-merge contract;
- `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md` — authoritative contract for the next product phase after this correction;
- `docs/repository-intelligence/README.md` — canonical Repository Intelligence architecture; RI-1, RI-2, and RI-3 implemented;
- `docs/superpowers/specs/2026-09-17-repository-architecture-professionalization-design.md` — active repository decomposition design;
- `docs/REPOSITORY_ARCHITECTURE_TRIAGE.md` and `docs/REPOSITORY_EVIDENCE_POLICY.md` — closed responsibility and evidence decisions;
- `docs/superpowers/specs/2026-09-18-excel-native-operations-ux-design.md` — workbook interchange/authority foundation and rollout record;
- `docs/superpowers/specs/2026-09-20-selective-workbook-editing-ux-direction.md` — current browse-vs-edit interaction contract;
- `docs/superpowers/specs/2026-09-20-worksheet-density-clarity-correction.md` — blocking UX-W4.5A visual-investigation and clarity-correction contract before UX-W5;
- `docs/HYDROQUALISENSE_LOCAL_QA_UI_PDF_PLAN.md` for the earlier quality-program foundation;
- `docs/CHATGPT_MIGRATION_OPERATOR_POLICY.md` and deployment runbook when release/migration operations matter.

Live repository state and `AGENTS.md` override remembered chat summaries.

## 2026-09-21 TypeSafe Jev developer-intelligence — standard advisory workflow

The TypeSafe layer under `scripts/developer-intelligence/typesafe/` uses the
official `@typesafe-ai/sdk` 0.6.0 and is now the standard advisory accelerator
for substantial bounded Codex phases when `TYPESAFE_API_KEY` is available.
It sanitizes repository-derived metadata before requests, preserves
`mustKeep` inputs, and falls back deterministically. The unified command is
`npm.cmd run typesafe -- <doctor|context|test-triage|ci-triage|completion|benchmark>`;
live requests require `--live`.

Required operating pattern for future prompts/chats:

- after clean sync and the one deterministic context packet, make one live
  `context` call before edits;
- use one live `test-triage` only when the deterministic affected-test set is
  meaningfully broad;
- make one live `completion` evidence check before PR delivery;
- use `ci-triage` only for an actual noisy CI failure;
- use `doctor` only for setup/connectivity diagnosis and `benchmark` only for
  deliberate Jev evaluation.

If a fresh worktree has the SDK declared/locked but not installed, run
`npm ci --include=dev` and verify `npm ls @typesafe-ai/sdk`; do not change
dependency declarations just to repair the worktree. Record candidate counts,
model, input/output tokens, latency, and fallback status for useful live calls.

UX-W5A demonstrated the corrected path: after the initial local module-load
failure, the existing dev dependencies were installed without declaration
changes and the live context checkpoint succeeded with model `jev-1.13.0`,
3 -> 3 candidates, 728 input tokens, 55 output tokens, 776 ms, fallback=false.
The earlier broader benchmark remains the context-reduction reference:
40 -> 18 candidates, 52.75% character reduction, 100% must-keep retention, 90%
expected-relevant retention, fallback=false.

Jev remains non-authoritative. RI-3/Workflow Map, current source,
`test:affected:agent`, security/financial/database reasoning, browser/database
evidence, exact-head CI, and lead review remain authoritative. The efficiency
goal is to preserve more Codex budget for higher-capability reasoning.

Future phases should therefore be somewhat wider when the work is genuinely
coherent: prefer one complete bounded workflow/domain slice with roughly 2-4
tightly related components (about 1.5-3x the old micro-slice size as a planning
heuristic) rather than needless single-file slices. Do not combine unrelated
domains, independent migrations, new security/financial authorities, or all
remaining UX work merely to create a bigger Jev candidate set. UX-W5A, UX-W5B,
and UX-W5C are complete for their recorded scopes; remaining UX-W5 domains
still require their own bounded handoffs.
Worker Registration remains paused under its existing gate.

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

The completed Slice 2 implementation generalizes template types beyond hardcoded enums. A company administrator can define a safe business document type, declare bounded custom/repeating inputs and an allowed source context, upload the actual DOCX, review/prepare an immutable version, activate it, and discover it from Documents -> Create. The three supplied HSC DOCX files are exact client fixtures proving the generalized engine: Purchase Order uses the existing Procurement adapter; Checklist and Warranty are ordinary Project-context company-defined examples. The managed standalone/version/artifact foundation is now implemented below; broader artifact aggregation and authenticated HSC/render certification remain deferred.

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

Email/SMS Reliability & UX Completion followed the active security phase at that
earlier checkpoint. The managed-upload/artifact foundation is now implemented
in the 2026-09-21 section below; broader aggregation and certification remain
separate, not cancelled.

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

## Wide Documents — managed Documents + retained artifacts foundation implemented 2026-09-21

This bounded implementation starts from synchronized `main` SHA
`288847309ddadf66d4d6d644f445ba04afa0ee97` on feature branch
`codex/wide-documents-managed-artifacts`.

The new authority boundary is:

- `managed_documents` owns only standalone company-document identity, bounded
  category/origin, optional same-company project context, archive state, and the
  current-version projection;
- `managed_document_versions` owns immutable file metadata and private Storage
  references. Create/version RPCs lock the parent row, preserve ordered history,
  and reject stale version/archive requests with SQLSTATE `40001`;
- `document_artifact_registrations` is a provenance-only index. It points a
  retained managed version back to source domain/type/record reference and
  template provenance without copying domain calculations, balances, statuses,
  approvals, or lifecycle truth;
- `documents.read` and `documents.manage` are narrow permissions. Artifact
  reads additionally resolve the source-domain permission. Direct browser table
  writes and ordinary version deletes are denied;
- `company-managed-documents` is private. Server-side upload/version routes
  validate safe file signatures, company-prefixed paths, MIME/extension pairs,
  size, and SHA-256 before guarded metadata RPCs; retrieval uses short-lived
  authorized signed URLs;
- existing issued Purchase Order/Client Invoice generation keeps
  `document_generation_evidence` and delivery history authoritative while an
  after-insert hook registers generic artifact metadata. Dynamic company-template
  generation retains its output in the managed layer and returns managed IDs in
  response headers while preserving the existing binary download contract.

Documents now has managed/artifact browse rows, document-oriented upload review,
detail/version history, authorized retrieval, and deliberate new-version/archive
actions. Deterministic demo fixtures cover a two-version Warranty Certificate
and a generated Purchase Order artifact. No financial, procurement, payroll,
inventory, engineering, delivery, custom-field, workforce, provider, or
production authority was expanded.

Final PR review hardened the foundation further before merge: direct private
Storage reads now resolve through the same managed-document/source-domain
authority as metadata reads; generated Purchase Order and Client Invoice
registrations must prove the referenced source record belongs to the deployment
company; macro-enabled XLSM uploads are rejected; managed Storage keys require
the exact canonical shape; conflicting managed-document/view query state is
normalized to the detail route; and protected database CI now runs the dedicated
two-connection managed-document RLS/concurrency contract.

Merge-gate validation for this handoff is intentionally recorded by category
rather than frozen intermediate counts: clean migration replay; pgTAP including
managed Storage/source-authority regression coverage; historical upgrade
fixtures; the dedicated runtime RLS/RPC/stale-write/concurrency contract;
focused managed Storage/router/client/workspace/generation coverage;
`test:affected:agent`; lint/typecheck; production build; Workflow Map
consistency; and hosted Demo Visual QA with explicit managed detail/version
history plus generated-artifact provenance/read-only scenarios. Provider
certification and production promotion remain separate and unclaimed.

TypeSafe/Jev diagnostics were advisory only. The clean-baseline context
checkpoint had **0 deterministic candidates / 0 selected**, `no-candidates`
fallback, and no live request; deterministic source inspection remained the
authority. The broad deterministic affected set retained **135/135** required
tests in a live test-triage checkpoint using **3** payload-safe requests,
`jev-1.13.0`, **17,292 / 2,007** input/output tokens, **2,529 ms**, and
`fallback=false`; advisory groups were **4 highest / 64 focused / 67
background**. The completion checkpoint used **1** request across **5**
evidence categories, `jev-1.13.0`, **707 / 89** input/output tokens,
**919 ms**, `fallback=false`, and found all declared categories present while
keeping `unresolvedUncertainty=true` because automated browser and hosted
certification were not available. Jev made no merge or release decision and
received no secrets, customer data, browser state, or raw source contents.

Remaining Wide Documents work is broader project/engineering/payroll/report
artifact aggregation, authenticated HSC/render certification, and optional
handover-package grouping. Worker Registration remains paused.

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

Slice 5 Wave B extracted the Subcontract register presentation into `src/components/procurement/SubcontractRegisterSection.tsx`; the reviewed `ProcurementPage.tsx` is 1,494 lines. The new section owns only KPI/filter/register/card/table/action presentation. Subcontract, claim, and variation state, filtering, parent-derived financial values, persistence, permissions, lifecycle mutations, routing context, and all editor/drawer/detail/cancellation orchestration remain parent-owned. Existing Claim and Variation workflow components remain authoritative and were not duplicated.

This is behavior-preserving architecture work. No database, migration, RLS/RPC, provider, production, route, or persistence contract changed. The later 2026-09-19 completion record closes the broader professionalization program for the current repository boundary.

At this historical 2026-09-18 checkpoint, the approved Excel-Native Operations UX direction was documentation only: implementation had not started, current registers were not claimed to satisfy it, and no `OperationsGrid`, shared sheet schema, `.xlsx` reverse-import, import-review UI, dependency, migration, or route change was included. The later 2026-09-19 rollout supersedes that checkpoint for Projects/project controls.

## 2026-09-18 Repository & Architecture Professionalization — Slice 5 Wave C

The repository professionalization track continues with Slice 5 Wave C.

- Extracted presentation component: `src/components/projects/ProjectPortfolioRegisterSection.tsx`
- What moved: portfolio snapshot disclosure, project counts, attention-signal counts, multi-currency portfolio financial totals, search/status/manager/currency/health/attention filters, sort selector and direction toggles, filter reset bar, responsive desktop table, mobile/tablet cards (`ProjectRegisterCard`), status/health/attention badges, tax-treatment display, financial metric cells, work-package summaries, and Open/Edit/Lifecycle action presentation.
- Pure presentation helpers moved: `money`, `statusTone`, `healthBadgeTone`, `attentionTone`, `financialValue`, `FinancialValue`, `PortfolioFinancialValue`, `portfolioMetricInline`.
- What stayed parent-owned: project source data, cost summaries, client billing/collection data, permissions, completeness checks, `buildProjectManagementView(...)`, `buildPortfolioManagementSummary(...)`, `filterAndSortProjectViews(...)`, filter and sort state, manager and currency option derivation, editing draft creation and validation, project save orchestration, lifecycle preview loading, lifecycle actions, lifecycle reason/error/loading state, lifecycle and editing dialogs, and route/open behavior.
- Line counts: `ProjectsPage.tsx` was reduced from 1,413 lines to 713 lines in the reviewed working tree.
- Invariant confirmation: project financial, lifecycle, currency, tax treatment, permission, audit, route, and history semantics remain completely unchanged. Unknown monetary values are not converted to zero, and mixed currencies are not combined.
- Excel-native confirmation: no Excel-native implementation, `OperationsGrid`, `.xlsx` parser, or spreadsheet dependency was added. Future Excel-native UX remains deferred.

## 2026-09-19 Repository & Architecture Professionalization — COMPLETE

The combined RI-2 -> RI-3 -> professionalization run is complete for the
current repository boundary. RI-2 provides the provenance-preserving graph and
deterministic query API over RI-1 plus the curated Workflow Map. RI-3 consumes
that graph behind `workflow-map:context` and `agent:context`, adds bounded
source/symbol/test/boundary/validation context, and refuses stale exact-
revision claims while preserving the current Workflow Map/Git impact fallback.

The remaining large/shared modules were triaged with RI evidence. App and
AppRouter remain composition boundaries; ProcurementPage remains the
financial/lifecycle orchestration owner after presentation extraction;
payrollWorkforce, documentTemplateRouter, shared types, Workflow Map context,
and the RI graph/context libraries are intentionally cohesive boundaries.
The exact decisions and reasons are recorded in
`docs/REPOSITORY_ARCHITECTURE_TRIAGE.md`.

Repository hygiene and front-door synchronization are complete for this
boundary. npm/package-lock is authoritative; transient RI/build/coverage/local
environment/log/CI output is not durable repository evidence; existing
sanitized evidence remains tracked only where cited by current contracts. The
current product-facing identity is HydroQualiSense; historical Engoryx files
and compatibility identifiers remain preserved where changing them would break
history or interfaces. The evidence rules are recorded in
`docs/REPOSITORY_EVIDENCE_POLICY.md`.

The GitHub repository remains `Juvialski/InvoiceApp`. A rename to the
recommended `HydroQualiSense` name was evaluated but not performed because
connected GitHub administration and linked Render/webhook verification are not
available in this run. The exact external follow-up is documented as a manual
administrative option, not unfinished repository architecture.

Excel Phase 0/readiness and the shared foundation are implemented together
with the bounded RFQ/Purchase Order pilot and the later Projects/project-controls
rollout described below. The next Excel-native implementation should reuse that
foundation rather than repeat readiness work.

## 2026-09-19 Excel Phase 0 + shared foundation + bounded Procurement pilot — implemented

The implemented Procurement pilot begins the approved Excel-native direction. Phase 0
classifies Procurement, Projects/Engineering, Expenses/Finance,
Inventory/Warehouse, Equipment, Workforce/Payroll, and Documents/communication
registers as Hybrid: dense registers may use a shared sheet-like interaction,
while complex detail, lifecycle, financial, approval, settlement, receiving,
composition, and history actions remain dedicated workflows.

The bounded implementation covers only RFQs and Purchase Orders. It adds the
shared `OperationsGrid`, SheetJS workbook safety/metadata/parser contracts,
the controlled five-sheet Procurement workbook (`RFQs`, `RFQ Lines`, `Purchase
Orders`, `PO Lines`, `_HydroQualiSense`), and an import review surface. The
pilot is update-only for existing draft records: upload produces proposals,
missing rows do not delete, new records are deferred, protected fields are
rejected, and explicit human confirmation is required before the existing
parent-owned RFQ/PO save callbacks are invoked.

The host refresh hook fetches current RFQ/PO records before review/apply when
available. Deterministic exported-state fingerprints plus `updatedAt` detect
stale edits and distinguish workbook-only, app-only, and both-changed states.
Read-only users can inspect proposals but cannot Apply. The existing save RPCs
do not accept a version precondition, so this pilot is truthful about a
remaining atomic compare-and-apply limitation; it does not claim protection
against a race after the final read and before mutation. No database migration,
Docker/Supabase replay, provider certification, production operation, or
non-Procurement reverse-import work is included.

## 2026-09-19 Projects + Project Controls Excel-native rollout — implemented

The Projects rollout is now implemented on top of the shared foundation. The
desktop portfolio register and project Budget Control cost-code register use
`OperationsGrid` with stable columns, keyboard movement, row selection,
sorting, protected numeric/financial cells, and preserved Open/Edit/Lifecycle
or archive/reactivate actions. Mobile and tablet contexts retain the existing
card fallback and purpose-built detail workflows.

The Projects workbook contains `Projects`, `Cost Codes`, and hidden
`_HydroQualiSense` synchronization metadata. It is update-only for existing
records. Safe project master-data/commercial fields and cost-code code/name/
description/approved-budget/forecast fields are reviewable; lifecycle status,
archive provenance, currency, parent identity, Actual Cost, Committed Cost,
billing/collection/settlement values, cost-code status, and audit metadata are
protected. Missing rows do not delete and new workbook rows remain unsupported.

Upload is proposal-only and groups review by project. The grouped Apply callback
revalidates fresh state and invokes one authoritative transaction per project:
project and affected cost codes are locked, expected `updated_at` tokens are
checked, and the final active cost-code budget is checked against the approved
project budget before mutation. Read-only users can review but cannot Apply.

The Procurement pilot's RFQ/PO save paths now also accept an atomic expected
version token, closing the previously documented race between the review read
and the guarded save RPC. No lifecycle, receiving, settlement, financial
history, mixed-currency, company-isolation, or source-ownership boundary was
weakened. Creation/deletion through workbook import remains deferred.

Focused workbook/grid/domain tests and TypeScript typecheck passed. A real
SheetJS export/review/apply/re-export round trip is covered by the adapter
tests. Local Docker/Supabase was unavailable during the Codex implementation
run; the protected exact-head Database Migration & Invariant workflow remains
the authoritative runtime gate for the changed Projects database contract.
Provider certification and production promotion remain separate and unclaimed.
The bounded Phase 4A Expenses and Supplier Payables rollout is implemented;
the selective-workbook correction now continues with UX-W1 (implemented), then
UX-W2 Projects and UX-W3 supplier-invoice review.

## 2026-09-20 Excel Phase 4A — Expenses + Supplier Payables — implemented

Phase 4A adds the controlled Expenses workbook and a read-only `Supplier
Payables` context sheet on the shared workbook foundation. The web Expense
register now uses `OperationsGrid` on desktop while retaining mobile cards,
detail, correction, source, FX, and settlement actions. The workbook includes
`Expenses`, `Supplier Payables`, and hidden `_HydroQualiSense` metadata.

Only direct, existing, unlinked `DRAFT` Expenses can propose ordinary date, category,
description, payee, amount, currency, payment method, reference, notes, and
authorized project/cost-code changes. Supplier-derived Expenses, source and
vendor identity, status/lifecycle, settlement/payment values, canonical supplier
allocations, and derived values are protected. Missing rows do not delete and
new rows remain unsupported.

Review is proposal-only and applies only after explicit confirmation. App-owned
refresh revalidates the workbook against current Expenses, Projects, cost codes,
supplier sources, and settlement projections; Apply calls the existing Expense
save path with its atomic `updated_at` precondition. Supplier invoices remain
source evidence and confirmed Cash & Banking matches remain settlement truth.
No migration, production mutation, hosted/provider certification, or full
Finance conversion is claimed. Remaining Finance work is client receivables,
then Cash & Banking/reconciliation.

## 2026-09-20 UX-W1 — shared worksheet editing foundation implemented

UX-W1 adds a separate reusable worksheet-editing family and deliberately does
not migrate Projects, Supplier Invoice Review, or any other product surface.
The shared model and component files are:

- `src/components/ui/worksheetEditorModel.ts` — typed column contract and
  pure cell edit, parsing, validation, navigation, TSV copy, and bounded paste
  rules;
- `src/components/ui/WorksheetEditor.tsx` — parent-owned draft editing surface
  with protected/read-only cells, keyboard movement, edit commit/cancel,
  dirty/conflict/validation state, controlled row callbacks, action slots, and
  contained responsive scrolling; and
- `src/components/ui/WorksheetTabs.tsx` — controlled local worksheet tabs.

The editor accepts text, number, currency, date, select, custom parser,
formatter, renderer, and validator columns. It rejects protected/read-only
edits, never expands paste into unauthorized rows or columns, preserves
invalid values as visible validation state without mutating authoritative rows,
and keeps Save/Apply/Cancel and persistence callbacks with the parent.
`OperationsGrid` remains unchanged as the browse/register primitive. No
database, migration, RLS/RPC, provider, route, or production change occurred.

Focused behavioral tests pass 21/21; ESLint and TypeScript validation pass.
Because UX-W1 was intentionally a foundation-only slice, its route-level QA was
deferred to the first domain integration in UX-W2. UX-W2 supplied that Projects
integration; UX-W3 now supplies the Supplier Invoice source-first proving
surface, recorded below.

## 2026-09-20 UX-W2 — Projects card-first portfolio + worksheets implemented

UX-W2 consumes the UX-W1 `WorksheetEditor` family on the approved Projects
proving surfaces without broad domain migration.

- The Projects landing page is card-first by default at every responsive size.
  The primary card region is a keyboard-focusable Project Workspace opener with
  dominant project identity, client/location/manager/status context, distinct
  Contract Value/Approved Budget/Actual Cost/Committed Cost cues, and restrained
  attention indicators. Authorized users get a secondary **Edit project details**
  action; lifecycle actions remain behind **More actions**.
- **Compact List** preserves the existing `OperationsGrid` for high-volume
  scanning. Cards and the compact list consume the same parent-derived
  `displayedViews`, so search, status/manager/currency/health/attention filters,
  sorting, portfolio summaries, mixed-currency grouping, and partial/unavailable
  financial truth remain shared.
- Existing Projects/Cost Codes `.xlsx` export, proposal-only import, validation,
  review, stale/conflict handling, explicit human confirmation, grouped
  authoritative Apply, and refresh-before/after boundaries remain available
  behind the collapsed **Excel import/export** disclosure. No workbook engine or
  authoritative persistence path was replaced.
- Project Details now uses a wide one-row `WorksheetEditor` for all fields that
  were editable in the previous form: Project Code, Project Name, Currency, Tax
  Treatment, Contract Value, Approved Cost Budget, Client Name, Project Manager,
  Billing Contact, Billing Email, Billing Address, Location / City, Status, and
  Operational Notes / Scope. New and Edit share the component; parent-owned
  required-field, VAT/NON_VAT, numeric normalization, and `onSaveProject`
  authority remain intact.
- Budget Control Cost Codes now use a multi-row `WorksheetEditor`. Code, Work
  Package, Description, Approved Budget, and Forecast Amount are staged edits;
  Status, Actual Cost, Committed Cost, Actual Variance, Forecast Variance, and
  other derived context remain protected. Add Row stages a new code, arbitrary
  Remove Row is not exposed, `validateProjectCostCodeInput` runs before saving,
  existing `id`/`updatedAt` values are retained, per-row failures retain the
  remaining staged edits, and Archive/Reactivate stay explicit callbacks.

No database, migration, RLS/RPC, provider, or production change occurred. The
final focused Projects group passed **88/88**; `npm.cmd run test:affected:agent`
passed **389/389** with database fallback disabled; ESLint and TypeScript
validation passed; and the production build passed. Targeted browser QA was not
run locally, so exact-head protected Demo Visual QA remains the browser evidence
gate. Docker/Supabase and hosted/provider checks were not required for this
UI-only diff. At that W2 handoff point, the exact next implementation phase was
**UX-W3 — Supplier Invoice source-on-top + extracted-data worksheet review**;
UX-W3 is implemented in the section below.

## 2026-09-20 UX-W3 — Supplier Invoice source-first worksheet review implemented

UX-W3 applies the corrected interaction grammar to the existing Supplier Invoice
review workspace. It is a UI/application slice only; extraction, persistence,
database, accounting, provider, and production boundaries are unchanged.

- The preserved `SourceComparison` surface is now the first review surface in a
  responsive vertical layout. Image/PDF viewing, zoom, fit/actual size,
  preserved email evidence, comparison/history tabs, and missing-source
  fallback remain available. The old desktop split pane and mobile
  Details/Source toggle are removed.
- `src/components/invoices/SupplierInvoiceWorksheet.tsx` composes four shared
  `WorksheetEditor` sections: Invoice Header, Vendor Evidence, Line Items, and
  Totals / Monetary Facts. Safe existing header/posting context remains in the
  worksheet; line rows keep stable IDs and controlled Add Row/Remove Row
  behavior. Explicit Save remains parent-owned.
- `financialFieldStatus` and the AI snapshot are reused where available for
  source/manual/calculated/unresolved provenance. Calculated monetary facts and
  verified/VOID worksheets are protected. Canonical Vendor identity is not an
  editable worksheet cell; Vendor link/create, project allocation, PO matching,
  material intake, verification, linked-Expense authority, settlement,
  correction, lifecycle, retry, and revert remain explicit workflows.
- Focused Supplier Invoice, worksheet, procurement-boundary, and settlement
  coverage passed locally; `npm.cmd run test:affected:agent` passed **170/170**
  with database fallback disabled; ESLint, TypeScript, and the production build
  passed. The new Demo Visual QA scenario covers the source-first surface at
  desktop, tablet, and mobile, but exact-head protected browser QA remains the
  merge gate. No database/Docker/Supabase/provider or production validation was
  applicable to this UI-only diff.

The RFQ/PO portion of UX-W4 is implemented. Client Billing and Expenses direct
DRAFT worksheet editing are recorded in the implementation sections below. At
that pre-W4.5 checkpoint, the next selective-workbook candidate was UX-W5
operational bulk-data editing; the current W4.5 gate now governs sequencing and
app-wide Excel-native editing is not claimed.

## 2026-09-20 UX-W4 — RFQ + Purchase Order draft worksheet editors implemented

This bounded UX-W4 slice moves the ordinary RFQ and Purchase Order draft
surfaces to the shared `WorksheetEditor` interaction model while retaining
Procurement authority in the existing parent callbacks and save paths.

- RFQ header fields and RFQ lines use separate shared worksheets with stable
  line IDs, active project cost-code options, required/positive-value checks,
  requested delivery dates, notes, controlled Add Row, and draft-only safe row
  removal.
- Purchase Order header fields and PO lines use shared worksheets with
  supplier/project/cost-code reference options, quantity/unit/unit-price and
  description editing, stable line IDs, controlled Add Row, and protected
  calculated Amount/Calculated Total/Received/Lifecycle cells.
- Existing `updatedAt` optimistic-concurrency tokens now flow from the edited
  RFQ/PO into the existing parent save callbacks and onward to the existing
  save RPC path. Project/company reference validation remains domain-bound.
- RFQ comparison, quotation evaluation/selection, issue/finalize, and
  cancellation remain outside the worksheet. PO approval, issue, receiving,
  close/cancel, supplier-invoice matching, and settlement remain explicit
  workflows outside ordinary cells.
- The existing Procurement `.xlsx` export/review/Apply path was preserved and
  not rebuilt. Demo scenarios cover both draft worksheet surfaces at desktop,
  tablet, and mobile viewports.

Focused Procurement/worksheet tests, ESLint, and TypeScript validation pass
locally. No migration, Docker/Supabase, provider, hosted-QA, or production
operation was required or performed for this RFQ/PO UI/application-only slice.
Client Billing follows in the implementation section below; app-wide
Excel-native editing remains unclaimed.

## 2026-09-20 UX-W4 — Client Billing draft worksheet editing implemented

Client Billing draft create/edit now uses
`src/components/projects/ClientBillingDraftWorksheet.tsx` and the shared
`WorksheetEditor` foundation. Billing Details and Billing Lines are one staged
draft aggregate with one parent-owned Save draft boundary. Safe metadata and
Description/Amount/Line Notes are editable; project identity, project currency,
tax treatment, status/lifecycle, calculated total, collection position, Cash &
Banking state, and audit/history context remain protected.

The extracted surface keeps Add Row and draft-only Remove Row inside the
worksheet, strips temporary row keys before persistence, and leaves Submit,
Issue, Cancel, Void, preview, Collection, and settlement controls in their
existing purpose-built parent workflows. The existing local/demo save paths
now fail closed on a stale edit token.

The Supabase save path now uses the forward migration
`20260920071201_client_billing_draft_concurrency_and_metadata.sql`. Header
metadata and replacement lines are persisted through one version-aware
`create_or_update_client_billing` RPC transaction; an existing draft requires
the expected `updated_at` token and a mismatch raises SQLSTATE `40001`. Existing
company, permission, currency, lifecycle, line-derived total, contract-ceiling,
event, audit, and collection boundaries remain authoritative.

Focused worksheet/domain/source tests and TypeScript validation pass locally.
Local clean replay, full pgTAP (1,647 tests), and both upgrade fixtures pass for
this branch. PR review corrected the stale R4 tax-field source assertion to follow
the implemented Project Details worksheet rather than the retired inline Projects
form. Local browser QA was not run because the Playwright QA dependency/server
harness was unavailable; exact-head protected CI and Demo Visual QA remain the
merge gates.
No production mutation is authorized. UX-W4 Expenses direct editable draft
editing is implemented in the section below. The next selective-workbook
candidate is UX-W5 operational bulk-data editing; Worker Registration remains
paused until the current Wave 4D gate is complete and the user explicitly
resumes it.

## 2026-09-20 UX-W4 — Expenses direct editable draft worksheet implemented

Direct Expense create/edit now uses the shared
`src/components/expenses/ExpenseDraftWorksheet.tsx` surface. The Expenses
register remains the browse surface; new direct records and eligible existing
unlinked DRAFT records open a contained worksheet with Expense Date, Project,
Cost Code, Category, Description, Payee, Amount, Currency, Payment Method,
Reference, and Notes. Project and cost-code selection remains domain-backed
and validated together.

Expense identity, status/lifecycle, source-document and Supplier Invoice
provenance, Vendor and Purchase Order links, settlement state, PHP/base-currency
and FX presentation, archive/void state, and created/updated metadata are
visible protected cells. Supplier-derived Expenses do not expose a direct
worksheet save or editable monetary/provenance cells. Approval, payment,
settlement, reconciliation, correction, archive, void, FX confirmation, and
source-document actions remain outside the worksheet.

The save boundary commits an active cell before reading staged data, blocks
worksheet validation errors, normalizes supported editable fields, preserves
authoritative protected values and the existing `updated_at` token, and calls
the existing parent Expense save path. Existing Expenses `.xlsx` export,
proposal-only review, explicit Apply, stale/conflict, protected-field, and
source/workbook behavior remains intact. No migration, Docker/Supabase,
provider, hosted-QA, or production operation is included in this UI/application
slice.

Focused Expense worksheet, workbook, shared worksheet, and responsive tests
pass **55/55** locally. `npm.cmd run test:affected:agent` passes **139/139**
with database fallback disabled; full ESLint, TypeScript, and production build
validation pass. Demo Visual QA was attempted but could not start because the
local dependency set does not include `playwright`; exact-head protected
browser QA remains the merge gate. No database migration, Docker/Supabase,
provider, hosted-QA, or production validation was applicable to this
UI/application-only diff.

At the UX-W4 Expenses checkpoint, the next selective-workbook candidate was
**UX-W5 operational bulk-data editors**. The current W4.5E visual gate now
precedes that candidate; Wave 4D/provider readiness and Worker Registration
sequencing gates also remain in force, and app-wide Excel-native editing
remains unclaimed.

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

## 2026-09-19 Repository Intelligence — RI-0 through RI-3

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

RI-2 is implemented in `scripts/repository-intelligence/graph.ts`. It merges
source-derived RI-1 records with curated Workflow Map nodes and edges while
preserving provenance, authority, conflicts, stable IDs, deterministic
neighbors/paths, source/test mappings, domain isolation, and freshness fields.
RI-3 is implemented in `scripts/repository-intelligence/contextEngine.ts` and
is consumed by the existing `workflow-map:context` and `agent:context` entry
points. It ranks exact/curated evidence, emits bounded source/symbol/test and
boundary context, and refuses stale exact-revision claims with an explicit
Workflow Map/Git impact fallback. Focused RI-2/RI-3 compatibility tests pass;
the final affected selector is intentionally full-fallback because this branch
touches `scripts/test-impact.ts`, whose policy marks that file as fallback-
sensitive.

Focused RI-1 evidence is 14/14 tests passing. The real CLI full rebuild indexed 1,129 eligible
files from 1,169 Git-tracked files, and the immediate incremental update reparsed 0 and reused
all 1,129 records with schema `1` and generator `ri-1.0.0`. Lint/typecheck passed on the
implementation head. The final exact-head affected-test and CI evidence belongs to the reviewed
PR head and must be used instead of the superseded earlier fallback run. No browser,
Docker/Supabase, migration, provider, hosted-QA, or production checks are required by this
developer-only slice unless the final diff expands into those domains.

RI-2 and RI-3 preserve `workflow-map:generate`, `workflow-map:check`,
`workflow-map:consistency`, `workflow-map:context`, and `agent:context` while
adding the provenance-aware graph/query layer and bounded source context. No
customer/runtime dependency is introduced. The exact next Repository
Intelligence work is later explorer/change-intelligence tooling; the next
product implementation direction is the bounded Excel **Phase 4 — Expenses and
Finance** rollout.

The design preserves the current curated Workflow Map as the semantic foundation. RI-1 provides the fast incremental source index; RI-2 provides the provenance-preserving unified graph/query API; RI-3 provides the bounded AI Context Engine; later phases may add structured/2D explorer, change intelligence, and optional 3D visualization.

Key decisions:

- the index/graph is the product; 2D/3D views are consumers;
- source-derived, curated, inferred, and future runtime-observed relationships remain distinguishable;
- curated financial/security/history/permission/source-of-truth facts are never overwritten by inference;
- `agent:context` remains the normal compatibility entry point and already provides Git provenance, affected-test selection, bounded Workflow Map traversal, invariants, permissions, and hard budgets;
- RI-3 upgrades the graph/context internals while preserving `workflow-map:context` and `agent:context` interfaces;
- local disposable incremental cache is preferred over committing a large generated repository index;
- the explorer is local/developer-only by default and must never enter normal client navigation or expose secrets/source internals to customers;
- Markdown/Mermaid remain supported for GitHub, diffs, accessibility, and no-WebGL environments;
- change intelligence is scheduled before optional 3D because it has higher direct engineering value.

Model/provider direction is neutral. Current ChatGPT/Codex/Luna-compatible workflows can consume the context interface where enabled; no model-specific API is part of the architecture. The active/current main documents inspected for this phase contained no DeepSeek reference, so no historical records were rewritten.

Repository Intelligence core priority **RI-2 → RI-3** is complete. Pause
explorer-focused work while the approved product queue proceeds; **the
optional 3D explorer is the final RI phase and should be last.**

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

1. **RI-2 + RI-3 implementation run — complete.** RI-2 lands conceptually first and RI-3 consumes it behind `workflow-map:context` / `agent:context`, preserving curated authority, current safety-net test selection, stale-index fail-closed behavior, and explicit fallback.
2. **Repository & Architecture Professionalization — COMPLETE for this repository boundary.** Responsibility triage, repository hygiene, evidence policy, front-door onboarding, safe branding cleanup, and repository-identity evaluation are recorded; no vague broader-program status remains.
3. **Excel Phase 0/readiness, original shared foundation, Procurement RFQ/PO, Projects/project controls, and bounded Phase 4A Expenses + Supplier Payables — implemented.**
4. **Selective workbook editing UX correction — UX-W1 + UX-W2 + UX-W3 + UX-W4 RFQ/PO + Client Billing + Expenses IMPLEMENTED.** The shared worksheet foundation now powers the card-first Projects portfolio, Project Details worksheet, Cost Codes worksheet, source-first Supplier Invoice review, RFQ draft editing, Purchase Order draft editing, Client Billing draft editing, and direct Expense DRAFT editing. Preserve all existing workbook round-trip/concurrency/authority contracts.
5. **UX-W4.5A through UX-W4.5E, UX-W5A, UX-W5B, and UX-W5C are implemented for their recorded scopes.** The durable visual evidence and authority limitations remain as documented; remaining UX-W5 workforce slices require separate bounded handoffs and remain subject to the Worker Registration/Wave 4D sequencing gate.
6. **UX-S3A baseline comparative research, instruction-density audit, and UX-S3A2 Jev-browser comparative validation are complete for the recorded public research boundary; UX-S3B is ready and exact next.** Preserve the current report and its S3A baseline section. Implement only the bounded static Help Center/contextual-help foundation in S3B; retain authenticated product UI, browse/edit, mobile/tablet, and populated deeper-state gaps as later evidence/workflow review rather than claiming parity.
7. **Jev Workflow Intelligence v2A research/design is complete for this handoff.** The durable report records read-only X research, official/community source review, 48 controlled sanitized Jev requests, representative historical replay, and the prioritized v2B design. This remains developer tooling, not a product dependency or merge authority.
8. **Jev Workflow Intelligence v2B — payload-safe foundation slice — is implemented for this handoff.** The shared request/diagnostic layer, deterministic seeding, budget-aware chunking, context integration, broad test triage, and deterministic must-keep/required-test unions are complete. Remaining v2B adjacency, requirement/evidence, replay, routing-advice, and other experimental work requires a later bounded handoff.
9. **Complete remaining Wave 4D provider/readiness evidence** opportunistically when safe provider credentials/devices/QA prerequisites exist; it remains separate from the completed v2B foundation and bounded UX-W5C product work.
10. **Remaining UX-W5 product slices remain queued and bounded.** Workers, Attendance, Time Entries, and Project Assignments remain behind the workforce/Worker Registration sequencing gate.
11. **Wide Documents managed standalone files, immutable versions, general upload, retained artifact registration, and Documents detail are implemented for the recorded scope.** Remaining broader artifact aggregation, authenticated HSC/render certification, and optional handover packaging require separate bounded follow-up.
12. **Worker Registration remains paused until Wave 4D is complete and explicitly resumed.** Site Attendance follows; Face Recognition remains separately privacy/security gated.
13. **RI-4 through RI-6 are later tooling; RI-7 optional 3D explorer remains LAST.**

Do not skip directly to Worker Registration, and do not let visualization work displace the index/context, reliability, professionalization, Excel-native, provider-readiness, or approved product work above.
---

## Next implementation handoff instructions

The user has explicitly reprioritized HydroQualiSense to a **hardening-first product freeze** after the merged Wide Documents managed-document foundation.

Current merged baseline before this documentation override:
`cbfbd4e4f1734cb280b119dd357715bb4d7b0836`.

### Do not start new product domains

Archive/defer Worker Registration, Site Attendance, Face Recognition Attendance, remaining workforce expansion, Finance UX-W6 feature expansion, typed custom fields, broader Wide Documents aggregation/grouping, and other net-new customer-facing capability until the user explicitly resumes feature development.

These phases are not cancelled. Preserve their historical contracts and backlog ordering.

### Exact next implementation program

The next implementation program is **UI Simplification Round 3 + workflow hardening**, continuing with **UX-S3B — Help Center/contextual-help foundation**. UX-S3A2 is complete for the recorded public research boundary. Read:

The UX-S3A baseline report is `artifacts/ui-ux-audit/UX-S3A-RESEARCH-AND-INSTRUCTION-DENSITY-AUDIT.md`. It is documentation/evidence only; no S3B implementation was started. Preserve it and validate/refine it rather than restarting the internal HydroQualiSense audit from zero.

- `AGENTS.md`;
- `docs/AGENTS_BASELINE_20260909.md`;
- `docs/AGENT_EXECUTION_EFFICIENCY.md`;
- `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`;
- this handoff;
- `docs/HYDROQUALISENSE_UI_UX_ROUND2_SIMPLIFICATION.md`;
- `docs/superpowers/specs/2026-09-20-worksheet-density-clarity-correction.md`;
- `docs/superpowers/specs/2026-09-21-ui-simplification-contextual-help-research.md`.

UX-S3A baseline research/evidence is complete. It used public help/documentation observations for Procore, Autodesk Construction Cloud/Autodesk Build, Buildertrend, Fieldwire, and Raken, plus a current local safe-demo route/state audit. It recorded patterns rather than copying branded/proprietary layouts. At that baseline checkpoint, a compatible Jev browser integration had not been demonstrated, so Jev was used through the existing sanitized TypeSafe client for comparator, route-copy, and root-cause judgments. UX-S3A2 then evaluated `wy-coliney/jev-browser-use` plugin `0.1.0` at source commit `f14b60e0ae1ee90cd73eb6650e30a666a84c021a` through the existing CUA in-app browser, independently verified 2/2 matched Raken/Fieldwire tasks, and recorded stale-state/long-list limitations. `browser-use/jev-ultrafast` was reviewed at `1231850a0bf1a0c0341fe408ef1668dbbfdfac46` but not installed.

The S3A2 responsibility split remains the standing rule: prefer an existing browser integration over inventing a new browser system; keep Codex responsible for research strategy, semantic/visual interpretation, text entry, sensitive decisions, and final verification; and keep all external browsing read-only.

The internal audit must inspect representative HydroQualiSense routes/states and classify always-visible explanatory text as:

- **Keep visible** — essential for task completion, safety, blocking validation, current exceptional state, irreversible consequence, or a short instruction needed by most users;
- **Shorten** — useful but too verbose;
- **Contextual help** — brief secondary explanation shown through an accessible help/info affordance;
- **Help Center** — detailed procedure, concept, example, onboarding, or troubleshooting moved to dedicated documentation with deep links;
- **Remove** — obvious, duplicated, or non-actionable explanation.

Do not put essential instructions only behind hover. Tooltips/popovers must be keyboard accessible and have click/tap behavior for touch devices.

UX-S3A produced the baseline research/audit report and UX-S3A2 validated/refined it. No broad UI remediation was performed. Proceed through:

`UX-S3A2 Jev-browser comparative validation (complete) -> UX-S3B Help Center/contextual-help foundation -> UX-S3C visible-copy simplification -> UX-S3D workflow-friction hardening -> UX-S3E accessibility/responsive/visual certification`.

Parallel hardening may continue for existing capabilities: provider/readiness certification, authenticated HSC/render certification, reliability/recovery, security/data-integrity, concurrency, performance, exact-SHA QA/release evidence, and bounded Jev/Repository Intelligence efficiency improvements.

Efficiency rules remain strict: synchronize current `main` first, record the SHA once, use one bounded context packet when useful, zero subagents by default with hard maximum two, focused -> affected validation, no ritual full suite, and exact final-diff review. Codex does not merge its own PR.

No production mutation is authorized by this handoff.

## 2026-09-21 UX-S3A2 Jev-browser comparative validation completion

The S3A2 evidence is appended to
`artifacts/ui-ux-audit/UX-S3A-RESEARCH-AND-INSTRUCTION-DENSITY-AUDIT.md` under
the clearly separated `UX-S3A2 — Jev-Browser Comparative Validation` section.

Completion facts:

- Base/validation SHA: `4e00c1375c278394dd8db567732dd7ec56990022`.
- Branch: `codex/ux-s3a2-jev-browser-validation`.
- Primary integration: `wy-coliney/jev-browser-use` plugin `0.1.0`, source
  commit `f14b60e0ae1ee90cd73eb6650e30a666a84c021a`, runtime-only installation
  outside InvoiceApp, direct bridge import through the existing CUA in-app
  browser.
- Matched public benchmark: Raken and Fieldwire both reached their target
  article pages after independent Codex verification; Jev returned
  `step_limit`/`needs_verification` rather than being treated as a success
  oracle. Procore’s dynamic process-guide list exposed a stale-state limitation.
- Mandatory comparator coverage: Procore, Autodesk Construction Cloud/Build,
  Buildertrend, Fieldwire, and Raken were directly inspected through public
  read-only help/documentation surfaces. The report separates observation from
  interpretation and records inaccessible/loading/authenticated UI limits.
- Secondary `browser-use/jev-ultrafast` was source-reviewed at commit
  `1231850a0bf1a0c0341fe408ef1668dbbfdfac46` and not installed because the
  primary bridge was compatible enough for the bounded task.
- Decision: S3B is ready as one coherent static Help Center/contextual-help
  foundation. It should use accessible click/tap popovers plus route/topic
  Help deep links, keep task-critical state visible, and leave broad copy
  simplification/workflow redesign to S3C/S3D.
- Completion/evidence checkpoint: one live sanitized TypeSafe completion
  request succeeded with model `jev-1.13.0`, 712 ms, 503 input / 38 output
  tokens, 930 serialized characters, fallback `false`, and documentation /
  browser evidence present `2/2`. Jev returned `mergeDecision:
  not-provided`; it flagged `unresolvedUncertainty=true` because one validation
  value was descriptive rather than exactly `passed`. Deterministic diff and
  evidence review remains authoritative.
- Limitations: no authenticated comparator workspace, live register/editor,
  mobile app, hosted QA, provider, database, or production certification was
  performed or claimed. The browser bridge did not expose token counts.

No custom adapter, InvoiceApp dependency, credential, browser profile, raw
trace, or external account mutation was introduced. This remains a
documentation/developer-tooling research handoff; Worker Registration and all
other deferred net-new product domains remain paused.

## 2026-09-21 Jev Workflow Intelligence v2A completion

The v2A research/design phase is complete on the current implementation branch;
The v2B implementation foundation is now included. The durable findings and
continuation boundary are in `docs/repository-intelligence/JEV_WORKFLOW_INTELLIGENCE_V2_RESEARCH.md`.

- Base `main`: `b62273e4f19e066c9a6d8cb30d9686a56f0c0938`.
- Research used 48 live Jev requests: 34 successful, 14 sanitizer fallbacks;
  aggregate input/output usage was 76,195 / 13,705 tokens where provider
  diagnostics were available. The model reported was `jev-1.13.0`.
- Compact recovery evidence succeeded for ten-candidate multi-axis chunks,
  75-test chunking, a bounded context tournament, and mid-diff adjacency.
- Ten labeled historical PR fixtures produced raw relevant recall `0.850`,
  raw must-keep retention `0.850`, and `0.925` relevant recall after the
  deterministic must-keep union. These are advisory research metrics, not
  merge or release evidence.
- Confirmed limitations: clean W5B context `0/0`, no developer-tooling
  Workflow Map seed, current context fallback above 64 candidates, 20,000
  character sanitizer boundary, sensitive-looking question-key rejection, and
  75-test single-request sanitizer rejection.
- Highest-value future v2B work: deterministic task seeding, budget-aware
  chunking/tournament selection, multi-axis context review, chunked test
  triage, mid-diff adjacency, criterion-level completion evidence, and a
  sanitized effectiveness ledger. No normal context/test/CI authority changed.
- Validation: focused v2A/developer-tooling tests **42/42**, staged affected
  tests **58/58**, and ESLint/TypeScript exit **0**. The final full suite exit
  was **1** on unchanged `tests/uiHardeningShared.test.ts` and
  `tests/visualHarnessCleanup.test.ts`; neither surface is in this diff.

This handoff now records the v2B payload-safe foundation below. Wave 4D
provider/readiness evidence may proceed opportunistically when safe external
prerequisites exist; separately bounded remaining UX-W5 work stays queued and
the managed Documents foundation is recorded above.
Worker Registration remains paused; no product/runtime/database/provider
change is authorized by this developer-tooling run.

## 2026-09-21 Jev Workflow Intelligence v2B payload-safe foundation

Starting `main` SHA: `94fc6a181edbf6162d7aa2f498e06802caaf2b53`.
Implementation commits: `97cd00c207c3a53a67d7c5104f5f2d55c8326ae2`,
`671bc556fc7fce19b17e740e95cab9a6c07f973e`.
Feature branch: `codex/jev-workflow-intelligence-v2b`.

The developer-only foundation adds exact serialized request preflight, safe
neutral question-key aliases without weakening the sanitizer, normalized
diagnostics/effectiveness records, deterministic tracked-path task seeding,
ordered payload-budget chunking, multi-axis context reranking, broad test
triage, and deterministic protected unions. Failed chunks fall back locally;
they do not erase their candidate/test members. Required tests remain required,
and Jev remains advisory-only.

Stable-head live context evidence used sanitized metadata only: RI status
`fresh`, **28 candidates**, **3 requests**, **14 selected**, **14 deterministic
protected**, model `jev-1.13.0`, **13,200 / 2,008** input/output tokens,
**2,041 ms**, fallback `false`. The measured synthetic 75-test evidence used
**2 requests**, retained **75/75** required tests, and had no fallback; a real
affected selection of **11 tests** also completed in one request. No API key,
customer/private source, production data, raw provider error, browser state, or
secret-bearing payload was stored.

Remaining v2B work is deferred: mid-diff adjacency/missed-contract analysis,
criterion-level evidence/replay tooling, calibrated routing advice, and later
experimental review/cascade features. No database/RLS/RPC/migration, provider,
application/runtime, model-routing, subagent, merge, release, or production
authority changed.

Validation for this handoff: focused developer-intelligence tests **42/42**;
deterministic affected runner **93/93** selected tests from **11/355** with
database fallback disabled; full ESLint plus TypeScript `npm.cmd run lint`
exit **0**. The live completion/evidence checkpoint made one request and
fell back with `api-error` after **653 ms**; deterministic evidence still found
implementation/tests/documentation present with no unresolved uncertainty and
returned `mergeDecision: not-provided`. Browser QA, Docker/Supabase, database,
provider, hosted-QA, production, and full-suite validation were not run because
the final diff is developer tooling/documentation only.
