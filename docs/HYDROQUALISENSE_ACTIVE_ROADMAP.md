# HydroQualiSense Active Roadmap

Status: **ACTIVE — SUPPLIER PAYABLES SETTLEMENT CORRECTIVE PHASE IMPLEMENTED / HOSTED EXACT-SHA QA CERTIFICATION COMPLETE FOR PRIOR BASELINE / COMPANY DOCX CONVERTER RUNTIME CERTIFICATION BLOCKED / WAVE 4D SMS PROVIDER IMPLEMENTATION IN PROGRESS / QA CERTIFICATION NOT READY**
Repository: `Juvialski/InvoiceApp`  
Last updated: **2026-09-12**

Product direction: `docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md`  
Current handoff: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`  
Local-QA/UI/PDF staged plan: `docs/HYDROQUALISENSE_LOCAL_QA_UI_PDF_PLAN.md`  
Supplier Invoice monetary model: `docs/HYDROQUALISENSE_SUPPLIER_INVOICE_MONETARY_MODEL.md`
Wave 4D contract: `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md`  
Workflow UX audit: `docs/HYDROQUALISENSE_WORKFLOW_UX_AUDIT_20260909.md`  
Current UI/UX audit evidence: `artifacts/ui-ux-audit/REPORT.md`  
Client deployment strategy: `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`

Live repository state and `AGENTS.md` override remembered chat summaries and historical plans.

## Current application / QA-hardening baseline

Phase 1 application and QA-harness work is integrated through PR #150.

The preceding application / QA-hardening baseline was:

`f1851b0c347da2ea29466d9748909889b67f03ed` (PR #148)

Relevant completed product work:

- Wave 1A Supplier Payable Lifecycle UX — PR #126;
- Wave 1B Client Receivable Lifecycle UX — PR #129;
- Wave 2 Cross-module Routing and Handoffs — PR #131;
- Wave 3 Payroll/Subcontract/PO Workflow Decisions — PRs #132 and #133;
- Wave 4A Company Document Templates / Mail Merge Foundation — PR #134;
- Wave 4B High-Fidelity PDF Finalization Foundation — PR #135;
- Wave 4C Outbound Issued-Document Gmail Delivery & Delivery History — PR #136;
- Wave 4D Email/SMS + Documents workspace implementation — integrated through PR #138, but not complete because real SMS provider-backed runtime QA remains outstanding;
- full live-QA harness and observed-flow hardening — PR #140;
- focused UI/UX remediation and connected Gmail QA audit — PR #144;
- local branch -> real QA development harness plus canonical PDF preview/download-byte foundation and initial PDF renderer hardening — PR #146;
- staged local-QA/UI/PDF quality plan — PR #147;
- local-QA browser-key hardening, including rejection of privileged legacy `service_role` JWTs — PR #148;
- comprehensive authenticated Local-QA UI/UX redo — PR #150, with 57 authenticated scenarios covering all 16 canonical top-level routes plus the mobile Documents check, three target viewport profiles, and responsive/action fixes for Projects, Procurement, and Equipment;
- Phase 3 supported/fixture-backed Local-QA functional regression sweep — PR #155, including the RFQ coverage correction and Payroll calculation/approval freshness fix.

## Important correction — PR #146 did not finish the UI/UX and PDF quality program

PR #146 completed **Phase 0**, the enabling foundation plus an initial document-remediation pass.

It proved that issued Purchase Order and Client Invoice Preview/Download can use the same exact PDF bytes and added synthetic torture cases. It also proved the local branch can exercise the isolated QA backend before merge.

That is not equivalent to comprehensive UI/UX certification or deep PDF visual certification.

In particular:

- route loading and generic overflow checks do not prove complete workflow usability;
- preview/download SHA equality proves artifact identity, not visual correctness;
- synthetic PDF torture cases are useful regression evidence, but they do not replace a deliberate visual inspection pass over real representative QA documents;
- title centering, logo/content collisions, box/table overflow, page breaks, totals, signatures, and long-content behavior remain explicit quality gates.

The authoritative staged sequence is `docs/HYDROQUALISENSE_LOCAL_QA_UI_PDF_PLAN.md`.

## Immediate implementation sequence

The next work must follow this order unless the user explicitly reprioritizes it:

1. **Comprehensive authenticated Local-QA UI/UX redo — COMPLETE in PR #150**
   - final authenticated Local-QA evidence covers all canonical routes, responsive states, dialogs, project tabs, owner handoffs, and safe compose review;
   - the final run recorded zero failed, blocked, not-tested, page-overflow, dialog-overflow, or clipped-interactive-control scenarios;
   - the Local-QA completion gate now refuses blocked, not-tested, or explicitly unavailable expected scenario coverage.

2. **Deep PDF/export visual certification — COMPLETE for the programmatic PDF fallback**
   - the shared renderer now keeps full-page title centering independent of the logo, reserves safe logo/header space, wraps long units and quantities, fits large currency values inside their cells, keeps long document-number metadata below the heading, and preserves full amount-in-words content;
   - the expanded matrix covers 12 Purchase Order / Client Invoice cases with no, normal, wide, tall, and transparent-normalized logos, missing optional values, long names/addresses/projects/document numbers, long descriptions/units, large EUR/USD/PHP values, one-line and multi-page tables, long notes/terms/payment/delivery content, and every generated page was rendered and checked for page-boundary, continuation, total, signature, and footer defects;
   - authenticated Local-QA exercised real issued Purchase Order and Client Invoice Preview/Download output. Both PDF sub-checks passed as `PROGRAMMATIC_PDF_FALLBACK` with exact preview/download SHA equality and rendered-page counts matching `pdfinfo` (1/1 each). The historical Phase 1 run remained fail-closed because the harness looked for `New RFQ` before entering the RFQ tab; Phase 3 corrected that stale harness assumption and the integrated rerun now passes the RFQ coverage gate;
   - Settings now provides an editable per-user document identity, so new issued documents use a human-readable Prepared by / Processed by name independent of the sign-in email; existing issued snapshots remain immutable;
   - company-template DOCX and finalized company-template PDF remain separate output paths. This phase does not claim high-fidelity template conversion where the supported converter is unavailable.

3. **Functional regression sweep using local QA — COMPLETE for supported/fixture-backed workflows**
   - retest the workflows changed or touched during the UI/PDF remediation;
   - fix schema-compatible defects immediately;
   - if a defect requires DB/RLS/RPC/migration changes, use local Docker/Supabase rather than applying unmerged schema work to shared QA.
   - the Supplier Invoice slice now centralizes source monetary semantics, removes false VAT/subtotal comparisons, preserves unresolved values, simplifies buyer identity to optional source evidence, and keeps Vendor -> verification -> one authoritative Expense boundaries intact;
   - focused Supplier Invoice regression, clean local Supabase replay/pgTAP, migration/upgrade validation, targeted authenticated/demo browser checks, and build/lint evidence are recorded on the implementation history;
   - the integrated Local-QA rerun records 57/57 route scenarios and 7/7 functional workflows passing, including RFQ/quotation comparison, partial PO receipt/close guard/Warehouse continuation, Supplier Invoice -> authoritative Expense -> Cash routing, Client Invoice -> Collection -> Cash routing, Payroll freshness/approval, Documents -> Compose review, and stale-record recovery;
   - a concrete Payroll approval defect was fixed by sharing the reduced period source identity between calculation and approval fingerprints; no migration or database contract change was required;
   - the QA company currently has no safe subcontract/claim fixture, so subcontract settlement remains `NOT TESTED`/fixture-blocked rather than represented as a pass. Gmail provider sync, server-authority template upload, and LibreOffice company-template conversion remain environment/provider-limited and are not claimed as certified.

3A. **Supplier Payables Settlement Truth & Consistency Audit — IMPLEMENTED in the current corrective branch; exact hosted QA pending merge**
   - the observed zero-card/zero-row failure was traced to the verification-shaped supplier `Expense` being intentionally created as `DRAFT`, while settlement/reporting code treated every linked invoice as transferred with zero invoice payable and the generic Expense gate rejected the DRAFT authority;
   - the corrected contract keeps that supplier-derived Expense `DRAFT`, leaves generic direct DRAFT Expense behavior unchanged, and makes the verified linked Expense the payable/settlement authority without mutating its lifecycle during payment;
   - supplier payment state is now derived from confirmed Cash & Banking evidence only. Document/OCR `amountPaid` remains separately visible evidence and cannot produce `PAID` or reduce outstanding. Reversed matches restore outstanding, legacy invoice-target matches remain visible through the linked Expense projection, and date-only overdue logic uses strict `due_date <` company business date;
   - Supplier Invoices, linked Expense detail, Cash & Banking candidates/target context, Dashboard, Projects, Reports, Assistant, correction previews, and invoice/project exports consume the shared projection. Verified project cost remains unchanged by settlement;
   - local validation on this branch includes clean Supabase replay/pgTAP (45 files, 1,531 tests), focused TypeScript/domain tests, production build/lint, and demo browser evidence (78 scenarios, 34 routes, 4 viewports, 59 interactions, zero console/page/network/overflow failures). This is local/pre-merge evidence, not hosted QA certification;
   - the new migration `20260912082656_supplier_payables_settlement_consistency` must be promoted only to the intended QA target after the exact merged application SHA is live and migration parity is checked. Production remains read-only.

4. **Hosted exact-SHA QA certification after merge — COMPLETE for prior baseline; rerun required for the corrective branch after merge**
   - Render QA service `srv-dafno1id0e5s73d6e3b0`, deployment `dep-daidc37qj5pc73ac6ta0`, is live at `https://hydroqualisense-qa.onrender.com` from the exact certified SHA;
   - `/api/health` reports `environment=qa`, logical deployment ID `qa-hydroqualisense`, repository SHA `32e5faf3666095391e7df09244ac0f0bb4479c81`, and migration level `20260911141452`;
   - QA Supabase project `vrpuznofrntyqsbugrib` is independently distinct from production project `qijjshdwiylojvqojxyz`;
   - repository and QA migration heads both equal `20260911141452_supplier_invoice_buyer_simplification`; the protected release independently verified parity before and after and skipped migration promotion, so Phase 4 performed no QA migration write;
   - the exact-head Protected QA Release retry passed: authenticated session persistence, unauthenticated `/settings` protection, 9/9 hosted route contracts, zero console/page/network errors, and a real authenticated engineering-document Storage upload/read/hash/cleanup probe all passed;
   - the first hosted route attempt had transient browser-side Supabase CORS failures only on `/dashboard`; a same-exact-SHA retry passed cleanly without deployment, migration, configuration, or code changes, so it is recorded as transient evidence rather than hidden;
   - Phase 3 regression-sensitive behavior remains represented by its exact merged code/tests and Local-QA evidence: the RFQ-tab coverage fix and Payroll freshness fix are present in PR #155; programmatic PO/Client Invoice PDF Preview/Download and Documents -> Compose review were not modified by PR #155. The hosted route harness proves that exact merged code tree is what is deployed but does not falsely claim to have re-clicked every Phase 3 workflow;
   - QA currently displays Gmail authorization as expired/revoked and no SMS provider configured. No uncontrolled email or SMS was sent. SMS remains truthfully unavailable until provider-backed QA exists;
   - company-template PDF conversion remains `UNAVAILABLE` on the native runtime when the supported converter is absent. Server-authority safe-link template upload and subcontract settlement retain their previously documented environment/fixture limitations.

5. **Wave 4D messaging-provider selection/integration — IN PROGRESS**
   - the approved paths are Company SIM Gateway (primary/recommended) and PhilSMS (optional hosted fallback);
   - both paths use the shared server-side adapter and durable delivery intent/audit contract;
   - real SMS remains `Not configured` or `Configured / awaiting verification` until a provider/device check succeeds, and remains unavailable for roadmap completion until controlled runtime QA is performed.

6. **Wave 4D completion/readiness evidence**
   - close remaining provider/AI/recovery/readiness evidence and synchronize client-facing product truth.

7. **Worker Registration — PAUSED** until Wave 4D is genuinely complete and the user explicitly resumes it.

8. Site Attendance state machine + registered site/device.

9. Face-Recognition Attendance only after explicit privacy/security/retention/liveness/confidence/fallback design.

10. Final pre-production security/data-integrity certification before broad rollout.

Do not skip the remaining Wave 4D provider/readiness work merely because the current exact application SHA passed hosted QA.

## Current Wave 4D product state — incomplete

The current implementation provides:

- top-level Email / SMS workspace with Inbox/Intake, Compose, Sent/Delivery History, and SMS/Provider Status;
- Gmail-assisted inbound source discovery/routing and outbound audited Gmail delivery;
- top-level Documents workspace as a permission-filtered index over canonical owning domains;
- document handoff into Compose;
- company document-template administration through the existing Settings/template flow;
- Assistant-assisted drafting with human review/confirmation boundaries.

Wave 4D remains incomplete because the approved SMS paths are not yet configured and provider-backed runtime-tested in QA. The authoritative completion criteria remain in `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md`.

Provider selection/integration is the active implementation phase. The two approved choices are Company SIM Gateway (primary/recommended) and PhilSMS (optional hosted fallback). Worker Registration remains paused.

## Local-QA development boundary

For schema-compatible UI/application work:

`feature branch -> local app -> isolated QA Supabase/Auth/Postgres/Storage -> synthetic QA data`

The local-QA harness is fail-closed to QA and rejects the production project. Browser configuration accepts only browser-safe publishable/anon credentials and rejects privileged Supabase keys/JWT roles.

Local QA is **pre-merge functional evidence**, not release certification.

Do not apply unmerged migrations to shared QA merely to make a branch work. Migration/RLS/RPC/trigger/financial-guard/company-integrity/concurrency work uses local Docker/Supabase validation before merge.

## PDF quality boundary

Issued programmatic PDF Preview and Download use the same canonical PDF bytes where available. This eliminates the old independent HTML-preview renderer divergence for that path.

However, byte equality does not certify layout quality. Deep visual certification is now complete for the programmatic fallback and explicitly inspected actual rendered pages for:

- correct title centering;
- safe logo/header separation;
- document-number containment;
- text staying inside boxes/tables;
- readable amounts/totals;
- complete multi-page content;
- safe page breaks;
- notes/terms/signature/footer containment.

The certification remains scoped to the programmatic fallback path. Company-template DOCX and finalized company-template PDF require their own converter-backed evidence when that capability is operational.

Programmatic PDF fallback, company-template DOCX, and finalized company-template PDF remain distinct output paths and must be represented truthfully. The current native Node/Render deployment must not claim high-fidelity conversion when the optional supported converter is unavailable.

## Company-template compatibility slice — implementation complete, runtime certification incomplete

The shared DOCX security boundary now classifies external OOXML references instead of rejecting every `TargetMode="External"` relationship. Official inert Word `mailto:` and `http(s):` hyperlinks, including equivalent `w:instrText` / `w:fldSimple` HYPERLINK fields, are preserved through extraction and deterministic merge without being resolved. Linked media, local/file/UNC/network paths, protocol-relative or FTP targets, attached templates, external data, OLE/objects, unknown external relationships, and `word/externalLinks/*` parts remain fail-closed. Stored-template reads and activation now revalidate through the same boundary, covering upload, starter, AI-generated, duplicate, analyze, binding, download, merge, and finalization paths.

Synthetic route and engine coverage passes for both Purchase Order and Client Invoice safe-link uploads, merge preservation, forbidden-resource rejection, and metadata-failure cleanup. Authenticated Local-QA browser evidence confirms the accurate forbidden-resource message and the independent converter capability state. Safe-link upload was not runtime-certified against the isolated QA backend because the local QA server configuration has no server-only Supabase storage key; the request is correctly blocked before metadata creation. The native runtime also has no `soffice`/`libreoffice` executable and leaves `DOCUMENT_PDF_CONVERTER_PATH` unset, so high-fidelity company-template PDF remains `UNAVAILABLE` with the programmatic fallback. The existing `Dockerfile.document-pdf` remains the approved optional path, but Docker was unavailable locally and no deployment configuration was changed.

## QA / release-readiness track

`QA CERTIFICATION: NOT READY`

Phase 4 hosted exact-SHA certification is complete for application SHA `32e5faf3666095391e7df09244ac0f0bb4479c81`. This status is narrower than overall release readiness. Wave 4D provider selection/runtime evidence remains incomplete, Gmail currently requires reauthorization, subcontract settlement remains fixture-blocked, and optional company-template conversion/server-authority limitations remain explicitly uncertified. Those limitations are not converted into PASS merely because the core hosted release gate is green.

Historical QA evidence remains useful for the exact SHAs and contracts it actually exercised, but it must not be generalized to newer heads.

The normal release sequence for application/migration-bearing work remains:

`exact intended app SHA -> intended QA deployment live -> inspect/promote canonical QA migration history when required -> verify parity and production separation -> hosted authenticated/provider/runtime checks`

Production remains read-only unless explicitly authorized under `docs/CHATGPT_MIGRATION_OPERATOR_POLICY.md`.

A green PR, merge, Render deploy, QA success, or documentation update does not authorize production database/Auth/Storage/secret writes or migration promotion.

## Permanent financial / security / history boundaries

Preserve throughout all remaining phases:

- one deployment -> one client company;
- RLS/RBAC/company isolation;
- Supplier Invoice evidence remains separate from authoritative linked Expense payable/cost truth;
- Client Invoice/Collection receivable truth remains separate from Cash settlement evidence;
- Actual Cost remains distinct from Committed Cost;
- original currency and explicit FX semantics remain intact;
- payroll settlement history/authority remains intact;
- Purchase Order receipt/close rules remain intact;
- immutable issued/finalized document snapshots and provenance remain intact;
- send/delivery history remains append-only and company-bound;
- Assistant actions remain `prepare -> review -> human confirm -> execute` for consequential operations.

## Worker Registration gate

**PAUSED.**

Worker Registration must not be suggested or prepared as the next implementation phase until:

- the comprehensive Local-QA UI/UX redo is complete;
- deep PDF/export visual certification is complete;
- the functional regression sweep is complete;
- the relevant merged exact SHA passes hosted QA certification;
- Wave 4D's provider-backed completion criteria are satisfied unless the user explicitly changes them;
- the user explicitly resumes Worker Registration.
