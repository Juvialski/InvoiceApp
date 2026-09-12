# HydroQualiSense Local QA, UI/UX, and PDF Quality Plan

Status: **COMPLETE THROUGH PHASE 4 — LOCAL-QA UI/UX, PROGRAMMATIC PDF VISUAL CERTIFICATION, FUNCTIONAL REGRESSION, AND HOSTED EXACT-SHA QA COMPLETE / WAVE 4D NEXT**
Repository: `Juvialski/InvoiceApp`  
Last corrected: **2026-09-12**

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

For supported Purchase Orders and Client Invoices, the matrix covered:

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

For representative cases the phase opened in-app preview, captured sanitized evidence, downloaded the exact PDF, rendered every page to images, visually inspected first/continuation/final pages, fixed defects, and repeated until acceptance gates passed.

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

The historical Phase 1 run remained `FAIL` only because its Procurement action looked for `New RFQ` before entering the RFQ tab; the completion gate correctly remained fail-closed. Phase 3 corrected that stale harness assumption and the integrated rerun now passes the RFQ gate without weakening coverage.

This phase certifies only the programmatic fallback. Company-template DOCX and finalized company-template PDF remain separate paths and are not represented as high-fidelity conversion evidence when the optional converter is unavailable.

Programmatic PDF fallback, company-template DOCX, and finalized company-template PDF are separate output paths and must remain labeled truthfully. Do not claim high-fidelity conversion on a runtime where the supported converter is unavailable.

## Phase 3 — Functional regression sweep using the local-QA loop — COMPLETE

The integrated Local-QA rerun records 57/57 authenticated route scenarios and 7/7 broader functional workflows passing: RFQ/quotation comparison; partial Purchase Order receipt, remaining quantity, close guard, and Warehouse continuation; Supplier Invoice -> authoritative Expense -> Cash routing; Client Invoice -> Collection -> Cash routing; Payroll freshness/approval; Documents -> Compose review without send; and stale-record recovery.

The Supplier Invoice systemic correctness slice centralizes source monetary-basis reconciliation, keeps VAT-inclusive and VAT-exclusive arithmetic distinct, preserves unknown values and source line totals, removes buyer identity from supplier posting readiness, and retains the Vendor -> guarded verification -> one authoritative Expense and correction/history boundaries.

The New RFQ condition was diagnosed as a stale harness-tab assumption and corrected without weakening fail-closed coverage. The Payroll approval freshness defect found during the sweep was fixed by sharing one reduced period identity between calculation and approval fingerprints.

The QA company has no safe subcontract/claim fixture, so subcontract settlement remains `NOT TESTED`/fixture-blocked rather than represented as a pass. Gmail provider sync, server-authority template upload, and LibreOffice company-template PDF conversion remain environment/provider-limited and are not claimed as certified. No migration or database contract change was required by the broader functional sweep, and production was not touched.

If a discovered defect requires migration/RLS/RPC/trigger/financial-guard/company-integrity/concurrency changes, do **not** push an unmerged migration to shared QA. Use local Docker/Supabase runtime validation for that DB-bearing work, then allow the normal post-merge QA migration-promotion path to handle shared QA.

## Phase 4 — Hosted exact-SHA QA certification — COMPLETE

Certified application SHA:

`e4ee4ebde489629ee74429b4e37abb511943a51e`

Hosted evidence:

1. Render QA service `srv-dafno1id0e5s73d6e3b0`, deployment `dep-daidc37qj5pc73ac6ta0`, is live at `https://hydroqualisense-qa.onrender.com` from the exact certified SHA.
2. `/api/health` reports `environment=qa`, deployment ID `qa-hydroqualisense`, repository SHA `e4ee4ebde489629ee74429b4e37abb511943a51e`, and migration level `20260912082656`.
3. QA Supabase project `vrpuznofrntyqsbugrib` was independently verified as distinct from production project `qijjshdwiylojvqojxyz`.
4. Repository and QA migration heads both equal `20260912082656_supplier_payables_settlement_consistency`. The protected workflow promoted only the missing canonical migration and independently verified parity afterward.
5. The first authentication preflight failed with no persisted Supabase session and provider response `Failed to fetch`; the same exact SHA was retried without deployment, migration, configuration, or code changes and passed with session persistence plus the unauthenticated `/settings` sign-in boundary.
6. The exact-head hosted retry passed 9/9 route contracts with zero console errors, page errors, or failed requests.
7. The authenticated engineering-document Storage probe uploaded a small synthetic PDF object, read it back with an identical SHA-256, and cleaned it up successfully without metadata rows.
8. PR #158 adds the supplier-payables settlement correction; the separate authenticated QA RPC certification passed 12/12 assertions for cash-only payment truth, linked `DRAFT` Expense authority, legacy-match projection, partial/full/reversed states, generic-DRAFT and cross-company denials, project/source linkage, and RPC grants. The route-focused hosted harness is not misrepresented as re-clicking every earlier functional flow.
9. The exact hosted Email/SMS surface reports no SMS provider configured. Gmail currently reports authorization expired/revoked, so live Gmail sync/send was not certified and no uncontrolled message was sent. The approved SMS implementation paths are Company SIM Gateway (recommended) and PhilSMS (hosted fallback), but neither has runtime QA evidence in this record.
10. Optional company-template PDF conversion remains truthfully `UNAVAILABLE` when the supported converter runtime is absent. Safe-link server-authority template upload and subcontract settlement retain their documented environment/fixture limitations rather than being converted into PASS.

Production remained read-only throughout this QA recovery/certification phase. The production migration was separately promoted under explicit authorization outside this phase; no production database, Auth, Storage, secret, or environment write was performed here.

## Phase 5 — Wave 4D messaging-provider decision and integration — IN PROGRESS

The Email / SMS and Documents workspaces exist, and the two approved SMS adapters are being integrated. Wave 4D remains incomplete because no real SMS provider is currently configured and runtime-tested in QA.

The supported paths are:

- Company SIM Gateway — recommended private server path using the client's own Android phone and company SIM;
- PhilSMS — optional low-cost hosted Philippine SMS fallback with account credits and Sender ID approval requirements.

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
