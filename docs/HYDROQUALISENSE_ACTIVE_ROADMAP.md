# HydroQualiSense Active Roadmap

Status: **ACTIVE — DEEP PDF/EXPORT VISUAL CERTIFICATION NEXT / WAVE 4D STILL INCOMPLETE / QA CERTIFICATION NOT READY**
Repository: `Juvialski/InvoiceApp`  
Last updated: **2026-09-11**

Product direction: `docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md`  
Current handoff: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`  
Local-QA/UI/PDF staged plan: `docs/HYDROQUALISENSE_LOCAL_QA_UI_PDF_PLAN.md`  
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
- comprehensive authenticated Local-QA UI/UX redo — PR #150, with 57 authenticated scenarios covering all 16 canonical top-level routes plus the mobile Documents check, three target viewport profiles, and responsive/action fixes for Projects, Procurement, and Equipment.

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

2. **Deep PDF/export visual certification — NEXT / REQUIRED P0 GATE**
   - visually inspect rendered Purchase Order and Client Invoice PDFs, not only byte/hash identity;
   - cover with/without logos, long branding/counterparties/projects/document numbers, long table content, long terms/notes, large amounts, multi-page output, and representative currencies;
   - fail the phase for title-centering errors, logo/title collisions, text outside boxes/cells, clipping, bad page breaks, unreadable continuation pages, or footer/signature overlap.

3. **Functional regression sweep using local QA**
   - retest the workflows changed or touched during the UI/PDF remediation;
   - fix schema-compatible defects immediately;
   - if a defect requires DB/RLS/RPC/migration changes, use local Docker/Supabase rather than applying unmerged schema work to shared QA.

4. **Hosted exact-SHA QA certification after merge**
   - exact merged `main` SHA must be deployed to the intended Render QA service;
   - verify deployment identity, migration parity/promotion when required, production separation, and applicable hosted authenticated/runtime checks.

5. **Wave 4D messaging-provider selection/integration**
   - only after the quality/certification sequence above is complete;
   - real SMS remains `Not configured` until an approved provider is selected, configured with server-side credentials, and runtime-tested in QA.

6. **Wave 4D completion/readiness evidence**
   - close remaining provider/AI/recovery/readiness evidence and synchronize client-facing product truth.

7. **Worker Registration — PAUSED** until Wave 4D is genuinely complete and the user explicitly resumes it.

8. Site Attendance state machine + registered site/device.

9. Face-Recognition Attendance only after explicit privacy/security/retention/liveness/confidence/fallback design.

10. Final pre-production security/data-integrity certification before broad rollout.

Do not skip the remaining PDF, regression, and hosted quality phases merely because Phase 1 is complete.

## Current Wave 4D product state — incomplete

The current implementation provides:

- top-level Email / SMS workspace with Inbox/Intake, Compose, Sent/Delivery History, and SMS/Provider Status;
- Gmail-assisted inbound source discovery/routing and outbound audited Gmail delivery;
- top-level Documents workspace as a permission-filtered index over canonical owning domains;
- document handoff into Compose;
- company document-template administration through the existing Settings/template flow;
- Assistant-assisted drafting with human review/confirmation boundaries.

Wave 4D remains incomplete because no outbound SMS provider is currently approved/configured/runtime-tested. The authoritative completion criteria remain in `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md`.

Provider work must not preempt the remaining PDF, regression, and hosted-certification sequence above.

## Local-QA development boundary

For schema-compatible UI/application work:

`feature branch -> local app -> isolated QA Supabase/Auth/Postgres/Storage -> synthetic QA data`

The local-QA harness is fail-closed to QA and rejects the production project. Browser configuration accepts only browser-safe publishable/anon credentials and rejects privileged Supabase keys/JWT roles.

Local QA is **pre-merge functional evidence**, not release certification.

Do not apply unmerged migrations to shared QA merely to make a branch work. Migration/RLS/RPC/trigger/financial-guard/company-integrity/concurrency work uses local Docker/Supabase validation before merge.

## PDF quality boundary

Issued programmatic PDF Preview and Download use the same canonical PDF bytes where available. This eliminates the old independent HTML-preview renderer divergence for that path.

However, byte equality does not certify layout quality. Deep visual certification remains outstanding and must explicitly inspect actual rendered pages for:

- correct title centering;
- safe logo/header separation;
- document-number containment;
- text staying inside boxes/tables;
- readable amounts/totals;
- complete multi-page content;
- safe page breaks;
- notes/terms/signature/footer containment.

Programmatic PDF fallback, company-template DOCX, and finalized company-template PDF remain distinct output paths and must be represented truthfully. The current native Node/Render deployment must not claim high-fidelity conversion when the optional supported converter is unavailable.

## QA / release-readiness track

`QA CERTIFICATION: NOT READY`

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
