# HydroQualiSense Local QA, UI/UX, and PDF Quality Plan

Status: **ACTIVE — PHASE 1 COMPLETE / PHASE 2 PROGRAMMATIC PDF VISUAL CERTIFICATION COMPLETE / PHASE 3 NEXT**
Repository: `Juvialski/InvoiceApp`  
Last corrected: **2026-09-11**

This document is the authoritative staged quality plan for the local-QA, UI/UX, PDF/export, functional-regression, and hosted-QA work that must be completed before the project moves on to provider completion and later Worker Registration.

Live `AGENTS.md`, the active roadmap, and the current handoff remain authoritative if repository state changes.

## Core development model

HydroQualiSense uses two distinct QA layers:

1. **Pre-merge branch validation:** current feature/fix branch -> local HydroQualiSense server -> real isolated QA Supabase/Auth/Postgres/Storage -> synthetic QA company data.
2. **Post-merge release validation:** exact merged `main` SHA -> hosted Render QA -> migration parity when required -> hosted authenticated/provider/runtime certification.

The local QA path exists so Codex can fix and retest schema-compatible application defects immediately without first merging them. Hosted QA remains the deployed exact-SHA release gate.

Production remains read-only unless separately and explicitly authorized under the migration/operator policy.

## Phase 0 — Local QA harness + canonical PDF preview foundation — COMPLETE

Completed through PR #146, with browser-key safety hardened by PR #148.

This foundation established:

- ignored local QA configuration and persisted browser state;
- exact approved-QA project targeting and explicit production-project refusal;
- normal QA-user authentication through existing RLS/RBAC rather than privileged browser access;
- bounded synthetic QA writes and sanitized local evidence;
- issued Purchase Order and Client Invoice preview using the same generated PDF bytes used by download;
- PDF.js rendering of those bytes in the application preview;
- initial programmatic-PDF hardening for title centering, logo handling, width-aware wrapping, pagination, long notes/terms, and long document numbers;
- synthetic Purchase Order and Client Invoice torture-case generation/rendering;
- explicit rejection of privileged modern Supabase secret keys and legacy `service_role` JWTs from the browser/local-QA path.

**Phase 0 is infrastructure and an initial remediation pass. It is not comprehensive UI/UX certification and it is not deep PDF visual certification.**

Exact preview/download SHA equality proves that Preview and Download use the same bytes. It does **not** prove that those bytes produce a visually correct document.

## Phase 1 — Comprehensive authenticated Local-QA UI/UX redo — COMPLETE in PR #150

PR #150 completed the authenticated Local-QA UI/UX phase against the real isolated QA backend.

The phase exercised meaningful authenticated workflows rather than only route loading, across:

- Dashboard;
- Projects;
- Procurement / RFQs / quotations;
- Purchase Orders and receipts;
- Supplier invoices and authoritative linked Expenses;
- Expenses;
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

The scenario catalog covers all 16 canonical top-level routes at desktop, tablet, and narrow/mobile target viewports, plus legacy Email Intake aliases, project workspace tabs, safe owner/Compose handoffs, compose review without send, SMS provider status without send, and mobile Documents preview behavior.

### Phase 1 outcome

The implementation evidence recorded 57/57 scenarios passing, with zero failed, blocked, not-tested, horizontal-overflow, dialog-overflow, or clipped-interactive-control scenarios.

The pass fixed and retested three concrete responsive defects: clipped mobile Project primary actions, clipped mobile Procurement tabs/filter controls, and desktop Equipment register actions exceeding the content frame.

The completion gate was then hardened so an overall Local-QA PASS is refused whenever a comprehensive scenario is failed, blocked, not tested, or an expected control is unavailable. This prevents future incomplete coverage from being represented as certification.

No database contract, provider, SMS, production, or deep PDF visual-certification behavior changed in Phase 1.

## Phase 2 — Deep PDF/export visual certification — COMPLETE FOR PROGRAMMATIC PDF FALLBACK

The dedicated document-quality phase is complete for the programmatic PDF fallback. The purpose was not merely to prove that Preview and Download share bytes, but to prove that the actual rendered pages are visually correct.

For supported Purchase Orders and Client Invoices, exercise representative and deliberate edge cases including:

- with and without a logo;
- wide, tall, and transparent logos;
- short and very long legal/company names;
- long addresses/contact details;
- long supplier/client names and addresses;
- long project names/codes;
- long document numbers;
- one line item, many line items, and multi-page tables;
- extremely long descriptions;
- long units/labels;
- large currency values;
- supported non-PHP currency where relevant;
- long notes, terms, payment instructions, delivery information, and amount-in-words content;
- missing optional values;
- long unit/quantity labels, large PHP/EUR/USD amounts, and extremely long document numbers.

For representative cases:

1. open the in-app preview;
2. capture sanitized preview evidence;
3. download the exact PDF;
4. render every PDF page to images;
5. visually inspect first, continuation, and final pages;
6. fix defects;
7. regenerate and repeat until the acceptance gates pass.

A document failed this phase if any of the following remained:

- visibly incorrect title centering;
- title/logo/company-name collision;
- document-number/title collision;
- text leaving a bordered box or table cell;
- amounts/totals clipping or overlapping;
- long descriptions crossing boundaries;
- content touching or crossing page edges;
- missing content between pages;
- broken or unreadable continuation pages;
- bad page breaks that split important sections incorrectly;
- footer/signature overlap;
- material preview-versus-download disagreement.

The shared renderer was remediated for logo/header reservation, full-page title centering, long document-number spacing, narrow unit/quantity wrapping, centered fitted currency values, complete amount-in-words wrapping, and safe continuation/footer pagination. The expanded matrix covered 12 cases, rendered every generated page, and visually checked first, continuation, and final page structures across no-logo, normal, wide, tall, and transparent-normalized logo variants.

Real isolated authenticated Local-QA PDF evidence passed for both issued document types: `PROGRAMMATIC_PDF_FALLBACK`, exact preview/download SHA equality, and rendered page count equal to the PDF page count (1/1 for each QA document). Sanitized preview screenshots were captured.

The authenticated Settings surface also exposes an editable per-user document identity. New issued documents use that human-readable Prepared by / Processed by name instead of the sign-in email; existing issued snapshots remain immutable.

The overall Local-QA run remains `FAIL` only because the QA account does not expose `New RFQ` for Procurement at desktop, tablet, or mobile; the completion gate remains intentionally fail-closed. This is a separate Phase 1 coverage/data-state blocker, not a PDF rendering failure.

This phase certifies only the programmatic fallback. Company-template DOCX and finalized company-template PDF remain separate paths and are not represented as high-fidelity conversion evidence when the optional converter is unavailable.

Programmatic PDF fallback, company-template DOCX, and finalized company-template PDF are separate output paths and must remain labeled truthfully. Do not claim high-fidelity conversion on a runtime where the supported converter is unavailable.

## Phase 3 — Functional regression sweep using the local-QA loop

After the visual remediation phase, perform a focused end-to-end functional sweep across the workflows affected or touched during the UI/PDF audit.

Examples include:

- project create/edit;
- RFQ quotation entry/comparison;
- Purchase Order issue/receipt/continuation/close flows;
- supplier-invoice and linked-Expense navigation/correction rules;
- Cash & Banking interactions;
- client billing/collection navigation;
- document-owner routing;
- document -> Email compose handoff;
- permission-aware behavior.

Schema-compatible application defects should be fixed on the current branch and immediately retested against QA.

If a discovered defect requires migration/RLS/RPC/trigger/financial-guard/company-integrity/concurrency changes, do **not** push an unmerged migration to shared QA. Use local Docker/Supabase runtime validation for that DB-bearing work, then allow the normal post-merge QA migration-promotion path to handle shared QA.

## Phase 4 — Hosted exact-SHA QA certification — REQUIRED AFTER MERGE

Once the quality/regression implementation PR is merged:

1. identify the exact merged `main` SHA;
2. verify the intended Render QA deployment serves that exact SHA;
3. verify deployment identity;
4. inspect/promote canonical QA migrations only when required;
5. verify migration parity and production separation;
6. run applicable hosted authenticated/provider/runtime checks;
7. retain exact-SHA evidence.

Local QA evidence does not replace this release gate.

Do not call the UI/PDF quality work complete until the relevant hosted exact-SHA checks are clean.

## Phase 5 — Wave 4D messaging-provider decision and integration

Only after Phases 1-4 are complete should provider work become the next implementation priority.

The Email / SMS and Documents workspaces exist, but Wave 4D remains incomplete because no real SMS provider is currently approved/configured/runtime-tested.

Do not activate a provider merely because an adapter can be written. A selected provider must preserve:

- server-side credentials only;
- permission-aware send authority;
- human review/confirmation for consequential messages;
- idempotency;
- bounded retry/reconciliation;
- normalized delivery/failure status;
- delivery webhooks/status where supported;
- company isolation and append-only delivery history.

No bulk unsolicited marketing is in scope.

## Phase 6 — Wave 4D completion + remaining readiness evidence

After an approved provider is integrated and QA-proven:

- close remaining provider-backed delivery/status evidence;
- close safe synthetic inbound-provider evidence gaps where possible;
- finish remaining AI/provider and recovery/readiness evidence required by the deployment runbook;
- synchronize roadmap/handoff/client-facing Settings truth;
- declare Wave 4D complete only when the authoritative Wave 4D contract is actually satisfied.

Worker Registration remains paused until Wave 4D is genuinely complete **and the user explicitly resumes it**.

## Phase 7 — Worker Registration — PAUSED

When explicitly resumed, implement worker registration before attendance automation. Preserve data minimization, company/project boundaries, permission controls, auditability, correction, and offboarding semantics.

## Phase 8 — Site Attendance

After Worker Registration, implement the attendance state machine and registered site/device workflow. Preserve explicit time-in/time-out history and correction/audit semantics.

## Phase 9 — Face-Recognition Attendance — FUTURE / DESIGN-FIRST

Do not implement production biometric attendance until privacy/security design explicitly covers consent, identity proofing, retention/deletion, access, liveness/confidence thresholds, fallback/manual correction, device trust, audit history, and deployment constraints.

## Permanent boundaries

Across every phase preserve:

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
- Assistant `prepare -> review -> human confirm -> execute` boundaries;
- production read-only unless explicitly authorized.

## Validation policy

Use the smallest applicable ladder:

1. new/edited tests;
2. focused domain tests;
3. `npm.cmd run test:affected:agent`;
4. lint/build/browser/Workflow Map only when relevant;
5. Docker/local Supabase only when database/security/integrity contracts change;
6. exact final diff review;
7. feature branch + PR; Codex does not merge its own PR.

Do not run the historical full suite by ritual. Do not treat generic browser-overflow success, route-loading success, or preview/download hash equality as proof that PDF visual output is correct.
