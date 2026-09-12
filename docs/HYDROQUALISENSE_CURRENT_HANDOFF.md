# HydroQualiSense Current Handoff

Status: **CURRENT — LOCAL-QA UI/UX REDO COMPLETE / PROGRAMMATIC PDF VISUAL CERTIFICATION COMPLETE / COMPANY DOCX COMPATIBILITY IMPLEMENTATION COMPLETE / CONVERTER RUNTIME CERTIFICATION BLOCKED / PHASE 3 LOCAL-QA REGRESSION SWEEP COMPLETE / WAVE 4D INCOMPLETE / QA CERTIFICATION NOT READY**
Date: **2026-09-12**
Repository: `Juvialski/InvoiceApp`

## Current application / QA-hardening baseline

Phase 1 application and Local-QA harness work is integrated through PR #150.

The preceding application / QA-hardening baseline was:

`f1851b0c347da2ea29466d9748909889b67f03ed` (PR #148)

Relevant integrated work:

- Wave 1A Supplier Payable Lifecycle UX — PR #126;
- Wave 1B Client Receivable Lifecycle UX — PR #129;
- Wave 2 Cross-module Routing and Handoffs — PR #131;
- Wave 3 Payroll/Subcontract/PO Workflow Decisions — PRs #132 and #133;
- Wave 4A Company Document Templates / Mail Merge Foundation — PR #134;
- Wave 4B High-Fidelity PDF Finalization Foundation — PR #135;
- Wave 4C Outbound Issued-Document Gmail Delivery & Delivery History — PR #136;
- Wave 4D Email/SMS + Documents workspaces — integrated through PR #138 but still incomplete;
- full live-QA simulation harness and observed-flow hardening — PR #140;
- focused UI/UX remediation + connected Gmail QA audit — PR #144;
- local branch -> real QA development harness + canonical issued-PDF preview/download foundation + initial PDF renderer hardening — PR #146;
- staged local-QA/UI/PDF quality plan — PR #147;
- local-QA browser-key hardening, including rejection of privileged legacy Supabase `service_role` JWTs — PR #148;
- comprehensive authenticated Local-QA UI/UX redo and stricter completion gate — PR #150.

Read with:

- `AGENTS.md`;
- `docs/AGENT_EXECUTION_EFFICIENCY.md`;
- `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`;
- `docs/HYDROQUALISENSE_LOCAL_QA_UI_PDF_PLAN.md`;
- `docs/HYDROQUALISENSE_SUPPLIER_INVOICE_MONETARY_MODEL.md`;
- `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md`;
- deployment/migration runbooks only when release/DB/provider work actually requires them.

## Critical correction — do not treat PR #146 as final UI/PDF certification

PR #146 completed the enabling Local-QA/PDF foundation and an initial remediation pass.

It established:

- ignored `.env.qa.local` configuration;
- `npm run qa:local` against the exact isolated QA project;
- explicit production-project refusal;
- normal QA-user authentication and persisted ignored browser state;
- bounded synthetic writes and sanitized local evidence;
- issued Purchase Order / Client Invoice Preview using the same exact generated PDF bytes as Download;
- PDF.js rendering of those bytes;
- initial renderer improvements for centering, logos, wrapping, long content, and pagination;
- synthetic PDF torture cases.

PR #148 additionally ensures browser/local-QA configuration cannot accept modern secret keys or legacy privileged `service_role` JWTs.

These are foundations, not the end of the quality program.

**Preview/download hash equality proves byte identity only. It does not prove that title placement, logo separation, table geometry, page breaks, totals, signatures, or long content are visually correct.**

## Phase 1 result — Comprehensive authenticated Local-QA UI/UX redo complete

PR #150 completed the authenticated Local-QA UI/UX pass against the real isolated QA backend.

Final implementation evidence recorded 57/57 scenarios passing across all 16 canonical top-level routes plus the mobile Documents check, project-workspace tabs, legacy Email Intake aliases, owner/Compose handoffs, safe dialogs, and the desktop/tablet/mobile target profiles. It recorded zero failed, blocked, not-tested, horizontal-overflow, dialog-overflow, or clipped-interactive-control scenarios.

Concrete schema-compatible defects fixed and retested in the same loop:

- mobile Project cards clipped the primary Open Project action;
- mobile Procurement tabs and the project filter select exceeded the usable viewport;
- desktop Equipment register actions exceeded the available content frame.

PR #150 also hardens the Local-QA completion gate so the harness cannot report overall PASS when a comprehensive scenario is failed, blocked, not tested, or an expected control is unavailable.

The Local-QA evidence proves the existing QA session recovery, route readiness, owner navigation, compose review gate, truthful SMS state, and issued-PDF preview/download byte identity for the exercised implementation. No database contract or provider implementation changed.

## Phase 2 result — Deep PDF/export visual certification complete for the programmatic fallback

The dedicated visual certification pass is complete for the programmatic PDF fallback. Actual rendered pages for both Purchase Orders and Client Invoices were inspected, including:

- with/without logos;
- wide/tall/transparent logos;
- long company/legal names and addresses;
- long supplier/client/project values;
- long document numbers;
- one-line, many-line, and multi-page tables;
- very long descriptions;
- long terms, notes, payment instructions, delivery details, and amount-in-words content;
- large amounts and representative currencies;
- missing optional data;
- long unit/quantity labels and extremely long document numbers.

The renderer fixes addressed the discovered risks: logo/header reservation, title/document-number metadata spacing, wrapped narrow-cell values, centered fitted currency values, dynamic amount-in-words height, and safe continuation/footer pagination. The visual acceptance gates now pass for the programmatic fallback:

- title not visually centered;
- title/logo/company-name collision;
- document-number/title collision;
- text outside boxes or cells;
- clipped/overlapping totals or amounts;
- content crossing page edges;
- missing content between pages;
- unreadable continuation pages;
- bad page breaks;
- footer/signature overlap;
- material Preview/Download discrepancy.

Authenticated Local-QA PDF evidence also passed on the real isolated QA backend: Purchase Order and Client Invoice both reported `PROGRAMMATIC_PDF_FALLBACK`, exact Preview/Download SHA equality, and rendered-page counts matching the PDF page count (1/1 each). Sanitized preview screenshots and downloaded PDFs were retained under the ignored `artifacts/local-qa/` evidence directory.

Settings now provides an editable per-user document identity. New issued documents use that human-readable name in the Prepared by / Processed by line rather than the sign-in email; existing issued snapshots remain immutable.

The historical Phase 1 Local-QA command remained fail-closed because its Procurement action tried to find `New RFQ` before selecting the RFQ tab. Phase 3 corrected that stale harness assumption and the integrated rerun now passes the RFQ gate. This remains pre-merge Local-QA evidence, not hosted QA certification.

This result does not certify company-template DOCX or finalized company-template PDF output. The supported high-fidelity converter remains truthfully unavailable where it is not operational.

## Supplemental result — Company-template compatibility and converter investigation

The DOCX validator now uses an explicit OOXML relationship policy. Official inert Word `mailto:` and `http(s):` hyperlink relationships are accepted and preserved without application or converter dereferencing. Equivalent HYPERLINK field codes in `w:instrText` and `w:fldSimple` are treated the same way. Linked HTTPS media, file/FTP/protocol-relative/UNC/local resources, attached templates, external data, OLE/objects, unknown external relationships, and `word/externalLinks/*` resource parts remain rejected with an accurate linked-resource explanation. The validator is reused for stored-template reads and activation as well as upload, starter, AI-generated, duplicate, analyze, binding, download, deterministic merge, and PDF finalization paths.

Synthetic engine and route tests pass for both Purchase Order and Client Invoice safe-link uploads, extraction/merge preservation, forbidden resources, AI/starter origins, and failed metadata cleanup. Authenticated Local-QA browser evidence passes for the new forbidden-resource message and independent converter capability panel. Safe-link upload is not runtime-certified against the isolated QA backend: the local QA server has no server-only `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_STORAGE_SERVER_KEY`, so the server-authority storage path returns 503 before metadata creation. The native runtime also has no `soffice`/`libreoffice` executable and `DOCUMENT_PDF_CONVERTER_PATH` is unset; the capability correctly remains `UNAVAILABLE` and explains the programmatic fallback. The existing `Dockerfile.document-pdf` is unchanged as the approved optional converter architecture; local Docker was unavailable, so real LibreOffice conversion and deployed container certification remain open.

## Phase 3 result — Supplier Invoice systemic correctness slice

The Supplier Invoice correctness investigation is complete on the current
implementation branch. The broader supported/fixture-backed functional
regression sweep is recorded below; hosted exact-SHA certification remains open.

The implementation now uses one shared monetary reconciliation contract for
direct upload, Gmail/email intake, review, exports, and PO comparison:

- source-displayed line amounts are preserved rather than replaced by a
  quantity x unit-price assumption;
- unit-price, line-total, and subtotal bases are explicit or remain UNKNOWN;
- VAT-exclusive, VAT-inclusive, zero-tax, invoice-level/line-level discount,
  centavo rounding, explicit tax without a rate, amount-due, and withholding
  evidence are reconciled without adding VAT twice;
- known incompatible values remain warnings, while missing or ambiguous
  components are bounded informational advisories;
- `grandTotal` remains the gross source amount carried into the single linked
  authoritative Expense, and withholding/net payable remains separate; and
- manual edits preserve source evidence and visibly distinguish source,
  calculated, manually corrected, and unresolved values.

Buyer/customer identity is no longer a Supplier Invoice readiness or posting
requirement. It remains optional legacy/source evidence only. Vendor resolution,
company isolation, permission checks, the guarded verification RPC, the active
Expense link, correction boundary, and immutable history remain in force.

The slice includes the forward buyer-gate migration
`20260911141452_supplier_invoice_buyer_simplification.sql`, focused monetary
regression coverage, updated review/PO/export surfaces, and the documented
model in `docs/HYDROQUALISENSE_SUPPLIER_INVOICE_MONETARY_MODEL.md`.

Validation evidence for this slice:

- focused unit/domain tests and the affected-test selector passed;
- clean local migration replay, 1,476 pgTAP assertions, migration static
  checks, and both upgrade-path fixtures passed;
- the local database query confirmed the guarded verification function remains
  SECURITY DEFINER, executable by `authenticated`, company-projection aware,
  and free of buyer-gate enforcement;
- authenticated local-QA route/session checks passed, and targeted demo
  browser checks showed a VAT-inclusive basis with no false subtotal or
  grand-total mismatch plus a genuine mismatch warning after an explicit
  source inconsistency; and
- the integrated Local-QA rerun now passes the RFQ coverage gate; this remains
  pre-merge evidence and is not release certification.

This is pre-merge evidence. It does not certify the merged head, hosted QA,
provider state, or production, and production remains read-only.

## Phase 3 result — Broader functional regression sweep

The integrated `qa:local` rerun records 57/57 route scenarios and 7/7 functional workflows passing: RFQ/quotation comparison; partial Purchase Order receipt, remaining quantity, close guard, and Warehouse continuation; Supplier Invoice -> authoritative Expense -> Cash routing; Client Invoice -> Collection -> Cash routing; Payroll freshness/approval; Documents -> Compose review without send; and stale-record recovery.

The New RFQ condition was diagnosed as a stale harness-tab assumption. The positive path now enters the RFQ tab before looking for the control, while missing required controls still fail closed. A concrete Payroll approval freshness defect was fixed by sharing one reduced period source identity between calculation and approval fingerprints. No migration, RLS, RPC, trigger, financial-guard, or inventory-guard change was required.

The QA company has no safe subcontract/claim fixture, so subcontract settlement remains `NOT TESTED`/fixture-blocked rather than represented as a pass. Gmail provider sync, server-authority template upload, and LibreOffice company-template PDF conversion remain environment/provider-limited and are not claimed as certified. Production was not touched.

Schema-compatible defects should be fixed immediately against local QA.

If a discovered issue requires migration/RLS/RPC/trigger/financial-guard/company-integrity/concurrency work, use local Docker/Supabase for the unmerged branch. Do not apply unmerged schema/migration changes to shared QA merely to make the branch work.

## Then — Hosted exact-SHA QA certification

After the quality/regression PR merges:

`exact merged main SHA -> intended Render QA deployment live -> deployment identity -> migration parity/promotion when required -> production separation -> hosted authenticated/provider/runtime checks`

Local QA is pre-merge functional evidence. It never replaces hosted exact-SHA release certification.

Do not declare the UI/PDF quality sequence complete before the applicable hosted checks are clean on the exact merged head.

## Only after those phases — Wave 4D provider completion

The broader Email/SMS + Documents product phase remains incomplete.

Current product surfaces include:

- top-level Email / SMS workspace with Inbox/Intake, Compose, Sent/Delivery History, and SMS/Provider Status;
- connected Gmail read/send workflows with audited delivery history;
- top-level Documents workspace as a permission-filtered index over existing canonical domains;
- document handoff into Compose;
- company document-template administration through the existing template workflow;
- Assistant-assisted drafting with human review/confirmation.

No outbound SMS provider is currently approved/configured/runtime-tested. SMS must remain truthfully `Not configured` until a real provider is selected and proven in QA.

Provider work is **not the next phase**. It follows deep PDF visual certification, the functional regression sweep, and hosted exact-SHA QA certification unless the user explicitly reprioritizes.

## Wave 4D completion gate

The authoritative requirements remain in `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md`.

Wave 4D is not complete until the current Email/SMS + Documents experience satisfies its product/permission/history requirements and real provider-backed SMS is QA-proven, unless the user explicitly changes the completion definition.

Worker Registration remains paused until Wave 4D is genuinely complete **and the user explicitly resumes it**.

## Current Gmail / provider state

Gmail reconnect/re-consent and bounded read/send checks were previously proven in QA with controlled synthetic outbound tests and company delivery history.

Do not generalize historical provider evidence to future exact heads beyond the behavior actually retested.

Inbound routing/separate mailbox-arrival proof and other remaining provider/readiness evidence should be closed later under the release/readiness track where safe controlled inputs exist.

SMS remains not configured.

## PDF output-path truth

HydroQualiSense has distinct document-output paths:

1. programmatic PDF fallback;
2. company-template DOCX;
3. finalized company-template PDF when the supported converter is operational.

The current native Node/Render deployment must continue to represent the optional high-fidelity conversion limitation truthfully when the converter is unavailable.

The deep PDF certification phase must not confuse exact-byte programmatic preview/download parity with certification of the company-template conversion path.

## Financial / security / history invariants

Preserve throughout all remaining work:

- one deployment -> one client company;
- active company membership / RLS / RBAC isolation;
- Supplier Invoice evidence remains distinct from authoritative linked Expense payable/cost truth;
- Client Invoice/Collection receivable truth remains distinct from Cash settlement evidence;
- Actual Cost remains distinct from Committed Cost;
- original-currency and explicit FX semantics remain intact;
- payroll settlement history remains intact;
- Purchase Order receipt/close rules remain intact;
- immutable issued/finalized snapshots and artifact provenance remain intact;
- send/delivery history remains append-only and company-bound;
- permissions remain capability-based;
- Assistant consequential actions retain `prepare -> review -> human confirm -> execute`.

Do not weaken these boundaries to make UI testing easier.

## QA / production boundary

`QA CERTIFICATION: NOT READY`

Production remains read-only unless the user explicitly authorizes the intended production operation under the migration/operator policy.

A green PR, merge, Render deployment, local-QA success, hosted-QA success, or documentation update does not itself authorize production database/Auth/Storage/secret writes or migration promotion.

## Required sequence from this handoff

1. **Comprehensive authenticated Local-QA UI/UX redo — COMPLETE in PR #150**
2. **Deep PDF/export visual certification — COMPLETE for programmatic fallback**
3. **Company-template compatibility implementation — COMPLETE on the current branch; converter runtime certification remains blocked by environment configuration**
4. **Functional regression sweep — COMPLETE for supported/fixture-backed Local-QA workflows; subcontract/provider limitations remain explicitly unverified**
5. **Hosted exact-SHA QA certification — NEXT**
6. **Wave 4D messaging-provider selection/integration**
7. **Wave 4D remaining readiness/completion evidence**
8. **Worker Registration — PAUSED until explicit user resume**
9. Site Attendance
10. Face-Recognition Attendance — design/privacy/security first
11. Final pre-production security/data-integrity certification

Do not skip from the completed Phase 1 pass directly to provider work.

## Implementation workflow

For the next Codex phase:

- fetch and fast-forward current `main` and record the exact SHA once;
- create a fresh feature branch;
- read live `AGENTS.md`, efficiency guide, roadmap, this handoff, and the Local-QA/UI/PDF plan;
- default to zero subagents, hard maximum two genuinely independent bounded subagents;
- generate at most one bounded context packet when useful;
- inspect existing implementation before designing;
- use the local-QA harness as the fast feedback loop for schema-compatible application work;
- run new/edited tests -> focused tests -> `npm.cmd run test:affected:agent` -> only relevant lint/build/browser/Workflow Map checks;
- use Docker/local Supabase only if DB/security/integrity contracts change;
- do not run `test:full` by ritual;
- review the complete final diff;
- push a feature branch and open a PR;
- Codex must not merge its own PR.

## Stop boundary

Do not allow this Supplier Invoice correctness phase to expand into SMS provider
implementation, Worker Registration, Site Attendance, Face Recognition, broad
CRM redesign, marketing/bulk messaging, or unrelated scope creep. The next
release/readiness step remains the broader regression completion followed by
hosted exact-SHA QA certification.
