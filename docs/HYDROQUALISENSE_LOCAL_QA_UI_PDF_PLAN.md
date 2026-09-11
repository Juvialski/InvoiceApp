# HydroQualiSense Local QA, UI/UX, and PDF Quality Plan

Status: **ACTIVE QUALITY / DEVELOPMENT WORKFLOW PLAN**  
Repository: `Juvialski/InvoiceApp`  
Created: **2026-09-11**  
Baseline when created: `a40147c13e197e5986f47292885ab86e0c3a5fc7` (merged PR #146)

This document records the staged development plan agreed after the first broad UI/UX audit. It is intentionally separate from release certification. Live `AGENTS.md`, the active roadmap, and the current handoff remain authoritative if repository state later changes.

## Core development model

HydroQualiSense now uses two distinct QA layers:

1. **Pre-merge branch validation:** current local feature/fix branch -> local HydroQualiSense server -> real isolated QA Supabase/Auth/Postgres/Storage -> synthetic QA company data.
2. **Post-merge release validation:** exact merged `main` SHA -> hosted Render QA -> migration parity when required -> hosted authenticated/provider/runtime certification.

The local QA path exists so Codex can fix and retest schema-compatible UI/application defects immediately without merging merely to discover whether a fix works. Hosted QA remains the final deployed exact-SHA release gate.

Production remains read-only unless separately and explicitly authorized under the migration/operator policy.

## Phase 0 — Local QA development harness and canonical PDF preview — COMPLETE through PR #146

PR #146 established:

- ignored `.env.qa.local` configuration for the approved QA project;
- existing QA user authentication rather than a second synthetic login account;
- fail-closed target verification for QA project `vrpuznofrntyqsbugrib`;
- explicit refusal of production project `qijjshdwiylojvqojxyz`;
- persisted authenticated browser state only under ignored `.qa-e2e/`;
- bounded synthetic QA writes and sanitized local evidence;
- issued Purchase Order / Client Invoice preview using the exact generated PDF bytes used by download;
- PDF.js rendering of those bytes in the application preview;
- shared programmatic-PDF title centering, logo handling, wrapping, pagination, long notes/terms handling, and long-document-number containment;
- deliberate Purchase Order and Client Invoice torture-case generation/render checks.

This completion does **not** mean all UI/UX work is complete and does **not** complete Wave 4D.

## Phase 1 — Continuous branch-local UI/UX and functional remediation — ACTIVE

Use the local branch + real QA backend as the default fast feedback loop for schema-compatible application work.

For each defect:

`observe -> diagnose -> fix -> reload local branch -> retest the same QA workflow -> add regression coverage when appropriate`

Priority surfaces include:

- Dashboard;
- Projects;
- Procurement / RFQ / quotations;
- Purchase Orders and receipts;
- Supplier invoices and authoritative linked Expenses;
- Cash & Banking;
- Client Billing and Collections;
- Payroll;
- Warehouse / Inventory;
- Equipment;
- Engineering Documents;
- Email / SMS;
- Documents;
- Reports;
- Settings.

Validate meaningful create/edit/view/detail/modal/preview/download/navigation/error/empty/long-content states on desktop, tablet, and narrow/mobile layouts where applicable.

Do not weaken authorization, lifecycle, financial, document-history, or company-isolation rules to make local testing easier.

## Phase 2 — PDF/export visual fidelity maintenance — ACTIVE / P0 QUALITY GATE

PDF quality remains a standing acceptance gate, not a one-time cleanup.

For supported issued documents:

- Preview should represent the same PDF artifact/bytes used for download whenever available.
- Test with and without logos.
- Test long legal/company names, addresses, counterparty names, project names/codes, document numbers, descriptions, notes, terms, and large currency values.
- Test one-line, many-line, and multi-page documents.
- Render downloaded PDFs to images and inspect first, continuation, and final pages.

A PDF is not acceptable if any of these remain:

- visibly off-center title;
- logo/title/company-name collision;
- document-number/title collision;
- text escaping boxes or table cells;
- clipped totals or amounts;
- content crossing page boundaries;
- missing content between pages;
- unreadable continuation pages;
- material preview-versus-download mismatch.

Programmatic PDF fallback, company-template DOCX, and finalized company-template PDF remain separate output paths and must be labeled truthfully. Native Render must not claim high-fidelity conversion when the optional converter is unavailable.

## Phase 3 — Post-merge exact-SHA hosted QA for application-bearing changes — REQUIRED RELEASE GATE

After an application/runtime-bearing PR merges:

1. identify exact merged `main` SHA;
2. wait for the intended QA Render deployment to serve that SHA;
3. verify QA deployment identity;
4. verify canonical QA migration parity and promote committed migrations only when required;
5. run the applicable hosted authenticated QA/provider/runtime checks;
6. retain exact-SHA evidence.

Local QA evidence does not replace this release gate.

Unmerged migrations must never be applied to shared QA merely to make a local branch work. Migration/RLS/RPC/trigger/financial-guard/company-integrity/concurrency changes use local Docker/Supabase runtime validation before merge.

## Phase 4 — Wave 4D messaging-provider decision and integration — BLOCKED ON PROVIDER CHOICE

The Email / SMS and Documents workspaces exist, but Wave 4D remains incomplete because no real SMS provider is approved/configured/runtime-tested.

Provider evaluation may consider:

- low-cost Philippine SMS routes;
- Android phone / SIM gateway approaches;
- self-hosted SMS APIs;
- official WhatsApp Business Platform as a complementary opted-in channel;
- Viber Business Messages where economics fit;
- a managed Philippine SMS fallback.

Do not activate a provider merely because an adapter exists. The chosen provider must preserve server-side credentials, permission-aware sending, human review for consequential messages, idempotency, bounded retry/reconciliation, normalized status/failure handling, and delivery webhooks/status where available.

No bulk unsolicited marketing is in scope.

## Phase 5 — Wave 4D completion and remaining QA readiness

After an approved messaging provider is integrated and QA-proven:

- finish provider-backed delivery/status validation;
- close remaining inbound-provider evidence gaps where safe synthetic messages are available;
- complete remaining AI/provider and recovery/readiness evidence required by the deployment runbook;
- reconcile roadmap/handoff/client-facing Settings truth;
- declare Wave 4D complete only when its authoritative contract is actually satisfied.

Worker Registration remains paused until Wave 4D is genuinely complete **and the user explicitly resumes it**.

## Phase 6 — Worker Registration — PAUSED

When explicitly resumed, implement worker registration before attendance automation. Preserve data minimization, company/project boundaries, role/permission controls, auditability, and safe correction/offboarding semantics.

## Phase 7 — Site Attendance

After Worker Registration, implement the attendance state machine and registered site/device workflow. Preserve explicit time-in/time-out history and correction/audit semantics.

## Phase 8 — Face-Recognition Attendance — FUTURE / DESIGN-FIRST

Do not implement production biometric attendance until privacy/security design explicitly covers consent, identity proofing, retention/deletion, access, liveness/confidence thresholds, fallback/manual correction, device trust, audit history, and deployment constraints.

## Permanent boundaries

Across all phases preserve:

- one deployment -> one client company;
- RLS/RBAC/company isolation;
- Supplier Invoice evidence vs authoritative linked Expense semantics;
- Client Invoice/Collection truth vs Cash settlement evidence;
- Actual Cost vs Committed Cost;
- original currency and explicit FX semantics;
- payroll settlement history;
- Purchase Order lifecycle/receipt/close rules;
- immutable issued/finalized document snapshots and artifact provenance;
- append-only delivery history and deliberate retry/reconciliation;
- Assistant prepare/review/human-confirm/execute boundaries;
- production read-only unless explicitly authorized.

## Validation policy

Use the smallest applicable ladder:

1. new/edited tests;
2. focused domain tests;
3. `npm.cmd run test:affected:agent`;
4. lint/build/browser/Workflow Map only when relevant;
5. Docker/local Supabase when database/security/integrity contracts change;
6. exact final diff review;
7. PR creation without Codex self-merging.

Do not run the historical full suite by ritual. Do not treat generic browser overflow success as proof that PDF visual output is correct.
