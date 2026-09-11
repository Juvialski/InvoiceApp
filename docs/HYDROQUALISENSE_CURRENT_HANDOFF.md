# HydroQualiSense Current Handoff

Status: **CURRENT — COMPREHENSIVE LOCAL-QA UI/UX REDO COMPLETE / DEEP PDF VISUAL CERTIFICATION NEXT / WAVE 4D INCOMPLETE / QA CERTIFICATION NOT READY**
Date: **2026-09-11**  
Repository: `Juvialski/InvoiceApp`

## Current merged application / QA-hardening baseline

`f1851b0c347da2ea29466d9748909889b67f03ed` (PR #148)

Relevant integrated work through this application baseline:

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
- local-QA browser-key hardening, including rejection of privileged legacy Supabase `service_role` JWTs — PR #148.

Read with:

- `AGENTS.md`;
- `docs/AGENT_EXECUTION_EFFICIENCY.md`;
- `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`;
- `docs/HYDROQUALISENSE_LOCAL_QA_UI_PDF_PLAN.md`;
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

The current feature branch completed the authenticated Local-QA UI/UX pass against the real isolated QA backend.

Final evidence recorded 57/57 scenarios passing across all 16 canonical top-level routes plus the mobile Documents check, project-workspace tabs, legacy Email Intake aliases, owner/Compose handoffs, safe dialogs, and the desktop/tablet/mobile target profiles. It recorded zero failed, blocked, not-tested, horizontal-overflow, dialog-overflow, or clipped-interactive-control scenarios.

Concrete schema-compatible defects fixed and retested in the same loop:

- mobile Project cards clipped the primary Open Project action;
- mobile Procurement tabs and the project filter select exceeded the usable viewport;
- desktop Equipment register actions exceeded the available content frame.

The final Local-QA evidence also proves the existing QA session recovery, route readiness, owner navigation, compose review gate, truthful SMS state, and issued-PDF preview/download byte identity. No database contract or provider implementation changed.

## Following phase — Deep PDF/export visual certification

After the completed UI/UX redo, perform a dedicated PDF/export certification pass.

Explicitly inspect actual rendered pages for both Purchase Orders and Client Invoices, including:

- with/without logos;
- wide/tall/transparent logos;
- long company/legal names and addresses;
- long supplier/client/project values;
- long document numbers;
- one-line, many-line, and multi-page tables;
- very long descriptions;
- long terms, notes, payment instructions, delivery details, and amount-in-words content;
- large amounts and representative currencies;
- missing optional data.

A PDF fails this phase if any of these remain:

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

For representative cases, compare in-app preview with the exact downloaded PDF and render every page to images for visual inspection. Generic DOM overflow checks or SHA equality are not sufficient certification.

## Then — Functional regression sweep

After UI and PDF remediation, perform a focused functional sweep over workflows touched during the audit/fixes.

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

Provider work is **not the next phase**. It follows the UI/UX redo, deep PDF visual certification, functional sweep, and hosted exact-SHA QA certification unless the user explicitly reprioritizes.

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

1. **Comprehensive authenticated Local-QA UI/UX redo — COMPLETE on the current feature branch**
2. **Deep PDF/export visual certification — NEXT**
3. **Functional regression sweep**
4. **Hosted exact-SHA QA certification**
5. **Wave 4D messaging-provider selection/integration**
6. **Wave 4D remaining readiness/completion evidence**
7. **Worker Registration — PAUSED until explicit user resume**
8. Site Attendance
9. Face-Recognition Attendance — design/privacy/security first
10. Final pre-production security/data-integrity certification

Do not skip from the PR #146 foundation directly to provider work.

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

Do not allow the next UI/UX quality phase to expand into SMS provider implementation, Worker Registration, Site Attendance, Face Recognition, broad CRM redesign, marketing/bulk messaging, new accounting semantics, or unrelated scope creep.
