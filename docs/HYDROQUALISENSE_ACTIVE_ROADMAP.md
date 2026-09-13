# HydroQualiSense Active Roadmap

Status: **ACTIVE — UI/UX ROUND 2 COMPLETE / WAVE 4D MESSAGING-PROVIDER INTEGRATION & COMPLETION NEXT / DOCUMENT-TEMPLATE STORAGE AVAILABLE AND STARTER-UPLOAD CERTIFIED IN LOCAL-QA / AI TEMPLATE GENERATION NOT CERTIFIED / PDF CONVERTER UNAVAILABLE / HOSTED EXACT-SHA QA PASS EXISTS FOR LAST HOSTED-CERTIFIED APPLICATION SHA / SUPPLIER PAYABLES CERTIFIED / QA CERTIFICATION NOT READY / WORKER REGISTRATION PAUSED**
Repository: `Juvialski/InvoiceApp`  
Last updated: **2026-09-13**

Product direction: `docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md`  
Current handoff: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`  
Completed UI/UX Round 2 design/acceptance record: `docs/HYDROQUALISENSE_UI_UX_ROUND2_SIMPLIFICATION.md`  
Local-QA/UI/PDF staged plan: `docs/HYDROQUALISENSE_LOCAL_QA_UI_PDF_PLAN.md`  
Supplier Invoice monetary model: `docs/HYDROQUALISENSE_SUPPLIER_INVOICE_MONETARY_MODEL.md`  
**Next-phase Wave 4D contract:** `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md`  
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

AI template generation remains **NOT CERTIFIED** separately: `/api/deployment/company-ai` returned `503 AI_CREDENTIALS_SERVER_MISCONFIGURED` because the Local-QA runtime lacks the separate AI server configuration; AI generation was not attempted and must not be attributed to Storage. PDF converter availability remains a separate `UNAVAILABLE` capability and does not gate DOCX persistence.

The functional Local-QA sweep recorded **8 PASS, 0 FAIL, 1 BLOCKED**, with the one blocked case being only the separate AI configuration prerequisite. No uncontrolled email/SMS send and no production mutation occurred.

UI/UX Round 2 is therefore complete. **Wave 4D messaging-provider integration/completion is the exact next product phase.** Worker Registration remains paused.

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

## Immediate implementation sequence

Unless the user explicitly reprioritizes again, proceed in this order:

1. **Wave 4D messaging-provider integration/completion — NEXT / ACTIVE**
   - UI/UX Round 2 does not cancel or redesign the approved provider direction;
   - Company SIM Gateway remains primary/recommended;
   - PhilSMS remains the optional hosted Philippine fallback;
   - use the shared server-side provider adapter and durable delivery intent/audit contract;
   - keep SMS truthful as unavailable/unverified until controlled provider-backed runtime QA exists;
   - reconnect/certify Gmail as needed for exact-state provider evidence;
   - preserve the completed task-first Email/SMS and Documents information architecture;
   - close remaining Wave 4D provider/AI/recovery/readiness evidence without beginning Worker Registration.

2. **Worker Registration — PAUSED**
   - do not start until Wave 4D is genuinely complete and the user explicitly resumes it.

3. **Site Attendance state machine + registered site/device** after Worker Registration.

4. **Face-Recognition Attendance** only after explicit identity/privacy/consent/retention/liveness/confidence/fallback/security design.

5. **Final pre-production security/data-integrity certification** before broad rollout.

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
- company-template Starter and safe Upload Storage authority is locally configured and certified; high-fidelity PDF conversion remains unavailable, and AI template generation remains blocked by separate server-side AI configuration;
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

UI/UX Round 2 is complete. Resume and genuinely complete Wave 4D before Worker Registration, unless the user explicitly changes the sequence. Worker Registration still requires explicit user resumption.
