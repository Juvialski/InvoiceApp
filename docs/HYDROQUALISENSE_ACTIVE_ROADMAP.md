# HydroQualiSense Active Roadmap

Status: **ACTIVE — EMAIL/SMS RELIABILITY + UX SLICE IN PROGRESS / PUBLIC OAUTH POLICY PAGES IMPLEMENTED / DURABLE GMAIL CREDENTIAL PATH IMPLEMENTED BUT EXTERNAL CONFIGURATION NOT CERTIFIED / SMS NOT CONFIGURED UNTIL QA RUNTIME PROOF / WIDE DOCUMENTS REMAINING SLICES DEFERRED / QA CERTIFICATION NOT READY / WORKER REGISTRATION PAUSED**
Repository: `Juvialski/InvoiceApp`  
Last updated: **2026-09-14**

Product direction: `docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md`  
Current handoff: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`  
Completed UI/UX Round 2 design/acceptance record: `docs/HYDROQUALISENSE_UI_UX_ROUND2_SIMPLIFICATION.md`  
Local-QA/UI/PDF staged plan: `docs/HYDROQUALISENSE_LOCAL_QA_UI_PDF_PLAN.md`  
Supplier Invoice monetary model: `docs/HYDROQUALISENSE_SUPPLIER_INVOICE_MONETARY_MODEL.md`  
**Completed corrective design:** `docs/superpowers/specs/2026-09-13-document-template-ai-autotagging-design.md`

**Active Email/SMS phase contract:** `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md`
Workflow UX audit: `docs/HYDROQUALISENSE_WORKFLOW_UX_AUDIT_20260909.md`  
Current UI/UX audit evidence: `artifacts/ui-ux-audit/REPORT.md`  
Client deployment strategy: `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`

Live repository state and `AGENTS.md` override remembered chat summaries and historical plans.

## Current repository / application baseline

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
- Wave 4C outbound issued-document Gmail delivery/history foundation — complete;
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

UI/UX Round 2 and the Document Template AI corrective phase are complete foundations on the current merged baseline. The user has now explicitly reprioritized the current implementation run to Email/SMS Reliability & UX Completion; the remaining Wide Documents managed slices are deferred. Worker Registration remains paused.

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

Current pre-merge evidence: the focused dynamic template/Create suite passes 68/68; lint, production build, Workflow Map consistency, and demo browser QA pass (82/82). Authenticated Local-QA passes its 59/59 route/responsive matrix, while its legacy template functional checks still target the former Settings mount and record 7/9 functional workflows. Dynamic HSC authenticated certification is not claimed because the new migration was not promoted to the QA target; local Docker is unavailable for replay/pgTAP/upgrade validation, and the bundled LibreOffice DOCX renderer is unavailable for visual conversion.

## 2026-09-14 Email/SMS Reliability & UX reprioritization

The user explicitly reprioritized the current implementation run to the focused
Email/SMS Reliability & UX Completion slice. The remaining Wide Documents managed
upload/artifact work is deferred; it is not represented as complete or cancelled.

The current branch implementation adds:

- a task-first Inbox / Intake hierarchy with Gmail status, Sync, Scan, Intake Rules,
  filters, and queue work ahead of a closed `How intake works` disclosure;
- compact Compose, Sent / Delivery History, and SMS provider status framing while
  preserving human confirmation, delivery history, idempotency, and reconciliation;
- encrypted company/user-scoped Gmail refresh credentials, server-side access-token
  refresh with one safe expiry retry, rotated-token persistence, and distinct safe
  provider/scope/permission/quota/revocation outcomes;
- public, session-free `/privacy` and `/terms` pages linked from the public and sign-in
  surfaces, plus the restrained Hydroqualisense homepage copy required for OAuth
  configuration. The homepage/requirements funnel remains deployment-gated;
- no SMS provider configuration or controlled provider-backed QA evidence in the
  current environment. SMS remains `NOT_CONFIGURED`/unavailable and the approved
  Company SIM Gateway / PhilSMS choices remain unchanged.

The durable Gmail migration, server-only keys, Google OAuth homepage/policy URLs,
Google Testing-state limitation, and operator verification checklist are documented
in `SUPABASE_GMAIL_SETUP.md`. No Google publishing/verification completion or
production mutation is claimed.

## Immediate implementation sequence

Unless the user explicitly reprioritizes again, proceed in this order:

1. **Email/SMS Reliability & UX Completion — ACTIVE by explicit user approval**
   - finish exact-head implementation and relevant authenticated browser checks for Inbox, Compose, Sent / Delivery History, SMS status, Gmail refresh recovery, and public OAuth pages;
   - configure and verify only the approved server-side Gmail/SMS paths when external credentials and provider runtime exist;
   - keep Gmail, SMS, Google publishing, and hosted QA capability states truthful when configuration or evidence is unavailable.

2. **Remaining Wave 4D messaging-provider/readiness completion — follows the active reliability slice**
   - Company SIM Gateway remains primary/recommended;
   - PhilSMS remains the optional hosted Philippine fallback;
   - keep SMS truthful as unavailable/unverified until controlled provider-backed runtime QA exists;
   - preserve the existing Email/SMS delivery, Gmail intake, AI confirmation, and idempotency contracts.

3. **Wide Documents Phase remaining managed slices — DEFERRED by explicit reprioritization**
   - resume managed uploads, retained artifacts, project discovery, and report/XLSX registration only through a later focused approval;
   - preserve the dynamic template/Create foundation and owning-domain boundaries.

4. **Worker Registration — PAUSED**
   - do not start until Wave 4D is genuinely complete and the user explicitly resumes it.

5. **Site Attendance state machine + registered site/device** after Worker Registration.

6. **Face-Recognition Attendance** only after explicit identity/privacy/consent/retention/liveness/confidence/fallback/security design.

7. **Final pre-production security/data-integrity certification** before broad rollout.

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
- Gmail exact-state provider proof may require reauthorization;
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
