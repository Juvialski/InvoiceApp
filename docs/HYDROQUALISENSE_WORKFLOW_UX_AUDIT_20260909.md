# Hydroqualisense Workflow UX Audit — 2026-09-09

Status: **ACTIVE INTERNAL PRODUCT AUDIT**  
Repository: `Juvialski/InvoiceApp`  
Baseline reviewed: merged `main` at `354cfd6ad9a834979c81ef990365f661b33fc829` (PR #126 merged)

This document preserves the broad user-facing workflow audit that produced the current remediation waves. It is an internal development source of truth, not a client-facing roadmap or implementation log.

Live repository source, runtime behavior, migrations, RLS, tests, and exact-head CI override this audit whenever they conflict. Findings marked `UNCERTAIN — needs runtime/manual confirmation` must not be treated as defects until runtime evidence confirms them.

## Purpose and scope

The audit asked whether existing Hydroqualisense business workflows are complete, discoverable, and easy to continue from a normal user's perspective. It covered:

- supplier invoices and Expenses;
- client billing and collections;
- Cash & Banking;
- procurement, subcontracts, and Warehouse;
- Projects and Payroll;
- Engineering;
- Gmail / Email Intake;
- Assistant and Settings;
- navigation, empty states, and mobile behavior.

The audit does **not** authorize redesign of accounting or financial truth, RLS, company isolation, audit history, canonical source ownership, migration semantics, payroll privacy, or other permanent repository invariants.

## Classification labels

- `EXISTS — UX/discoverability gap`: capability exists but the user cannot easily discover or continue the workflow.
- `PARTIAL — workflow incomplete`: part of the workflow exists, but a meaningful user-facing continuation or lifecycle step is missing.
- `MISSING — product capability gap`: the product genuinely lacks the required capability.
- `UNCERTAIN — needs runtime/manual confirmation`: source inspection is insufficient to classify the behavior safely.

A finding may keep its original audit classification while its **current remediation status** becomes resolved after implementation.

## Permanent financial and source-of-truth invariants

Never solve payment or collection UX by adding a naive manual `Mark Paid` action.

Payment and collection state must derive from authoritative settlement/reconciliation evidence. Preserve:

- authoritative financial source ownership;
- partial and full settlement;
- reversals and history;
- permissions;
- original currency and explicit FX semantics;
- auditability.

Supplier invoice evidence linked to an Expense must not become duplicate payable or duplicate Actual Cost truth. The linked Expense owns the payable/cost after verification while the supplier invoice remains source evidence. Client invoices and collections remain separate from supplier obligations and project Actual Cost.

## Audit findings

### UX-001 — P1

**Classification:** `EXISTS — UX/discoverability gap`  
**Finding:** A supplier invoice lost the obvious payment continuation after its linked Expense became the authoritative payable/cost record. Users needed an obvious `Open Expense` continuation followed by a legitimate payment path.  
**Current status:** **RESOLVED in Wave 1A.** Merged PR #126 provides the supplier-invoice → authoritative Expense continuation without restoring financial authority to the invoice.

### UX-002 — P1

**Classification:** `PARTIAL — workflow incomplete`  
**Finding:** Expense lacked a clear object-first `Record Payment` / settlement workflow.  
**Current status:** **RESOLVED in Wave 1A.** The Expense now continues into the existing Cash & Banking settlement model rather than creating a manual paid flag or fabricated transaction.

### UX-003 — P2

**Classification:** `EXISTS — UX/discoverability gap`  
**Finding:** Expense relationships to supplier invoice, PO, and related financial evidence were too passive.  
**Current status:** **PARTIALLY REMEDIATED.** Wave 1A improved supplier-invoice/Expense navigation and context, but broader relationship/source navigation remains a Wave 2 target. Do not introduce duplicate financial authority to improve navigation.

### UX-004 — P1

**Classification:** `EXISTS — UX/discoverability gap`  
**Finding:** Cash settlement target type `EXPENSE` lacked reliable navigation back to the exact Expense.  
**Current status:** **RESOLVED in Wave 1A.** Object → Cash and Cash → Expense navigation now use canonical Expense routing.

### UX-005 — P1

**Classification:** `PARTIAL — workflow incomplete`  
**Finding:** Object-first settlement target context was incomplete; Cash & Banking forced users to rediscover the intended target manually.  
**Current status:** **RESOLVED in Wave 1A for Expense targets.** The exact `EXPENSE` target is carried into Cash & Banking and visibly prioritized. This is the reusable routing pattern for later receivable work.

### UX-006 — P1

**Classification:** `PARTIAL — workflow incomplete`  
**Finding:** An issued client invoice lacks an obvious contextual `Record Collection` path that preserves authoritative Cash/Bank settlement semantics.  
**Current status:** **OPEN — Wave 1B primary target.**

### UX-007 — P2

**Classification:** `PARTIAL — workflow incomplete`  
**Finding:** Client invoice detail does not present sufficiently clear per-invoice amount collected, amount remaining, collection state, and collection history.  
**Current status:** **OPEN — Wave 1B.**

### UX-008 — P2

**Classification:** `UNCERTAIN — needs runtime/manual confirmation`  
**Finding:** Purchase Order close guard may need lifecycle hardening. Static inspection alone was insufficient to prove unsafe behavior.  
**Current status:** **UNCERTAIN / OPEN.** Before any fix, prove at runtime/database level whether received or committed obligations prevent unsafe close.

### UX-009 — P2

**Classification:** `EXISTS — UX/discoverability gap`  
**Finding:** Procurement receipt → Warehouse continuation is hidden or weak.  
**Current status:** **OPEN — Wave 2.** Improve truthful handoff/navigation only; do not create a second receipt or stock source of truth.

### UX-010 — P1

**Classification:** `PARTIAL — workflow incomplete`  
**Finding:** Payroll exposes or conceptually permits manual-paid semantics that conflict with authoritative settlement evidence.  
**Current status:** **OPEN — Wave 3 deliberate design.** Do not opportunistically change payroll payment semantics during supplier/client waves. Dedicated review must define finalized payroll, payable obligation, Cash/Bank transaction, settlement evidence, partial/full payment if supported, reversals/corrections, permissions, and payroll-detail privacy.

### UX-011 — P1

**Classification:** `MISSING — product capability gap`  
**Finding:** An approved/certified subcontract claim can reach `Net Certified Payable` but lacks an explicit accounting/payable bridge.  
**Current status:** **OPEN — Wave 3 deliberate design.** Define the authoritative payable bridge without duplicating Expense, payable, or Actual Cost truth before implementation.

### UX-012 — P2

**Classification:** `EXISTS — UX/discoverability gap`  
**Finding:** Warehouse movement/source relationships need better source navigation.  
**Current status:** **OPEN — Wave 2.** Preserve immutable movement/history semantics.

### UX-013 — P2

**Classification:** `UNCERTAIN — needs runtime/manual confirmation`  
**Finding:** Email Intake post-import continuation may be unclear after importing into an invoice, statement, Expense, or review workflow.  
**Current status:** **UNCERTAIN / OPEN.** Runtime/manual confirmation must precede redesign.

### UX-014 — P2

**Classification:** `PARTIAL — workflow incomplete`  
**Finding:** Stale or invalid deep links fall back too generically.  
**Current status:** **OPEN — Wave 2.** Prefer domain-aware recovery for missing, deleted/archived, inaccessible, malformed, or no-longer-valid targets without exposing unauthorized object existence.

### UX-015 — P2

**Classification:** `EXISTS — UX/mobile gap`  
**Finding:** Expense mobile UI has min-width / dense-layout risk around 390px.  
**Current status:** **PARTIALLY EVIDENCED, still open.** Wave 1A's new supplier/Expense/Cash target scenarios passed deterministic browser QA at approximately 390px with no horizontal overflow for those specific flows. That does not prove every Expense register/table state is fully mobile-optimized, so the broader finding remains open and bounded.

### UX-016 — P2

**Classification:** `EXISTS — UX/mobile gap`  
**Finding:** Subcontract claim UI is too table-dense on mobile.  
**Current status:** **OPEN — address with the later subcontract workflow phase**, not as an isolated CSS patch.

## Remediation waves

### Wave 1A — Supplier Payable Lifecycle UX

**Status: COMPLETE on merged `main` through PR #126.**

Implemented journey:

`Supplier Invoice`  
→ `Open authoritative Expense`  
→ `Record Payment`  
→ `Cash & Banking` with exact `EXPENSE` target context  
→ choose/import/use legitimate financial transaction under existing rules  
→ explicit settlement confirmation  
→ partial/full payment state + history/reversal  
→ navigate back to Expense or supplier invoice

Wave 1A preserves Expense authority, supplier evidence, no duplicate Actual Cost/payable, no manual paid flag, settlement history/reversals, RBAC, currency/FX semantics, and canonical Expense deep linking. The Expense detail route remains separate from the older correction-opening behavior.

### Wave 1B — Client Receivable Lifecycle UX

**Status: NEXT USER-PRIORITIZED PRODUCT WORKFLOW WAVE.**

Target journey:

`Issued Client Invoice`  
→ `Record Collection`  
→ `Cash & Banking` with exact client-invoice/collection target context  
→ legitimate bank/cash transaction  
→ explicit settlement confirmation  
→ partial/full collection state + history  
→ return directly to client invoice

Required user-facing information:

- invoice amount;
- collected amount;
- remaining amount;
- collection state;
- collection history;
- reversals where supported;
- contextual `Record Collection` CTA only when permitted and lifecycle-eligible.

Reuse the object-first settlement routing pattern from Wave 1A. Do not combine client receivable truth with supplier payable truth.

### Wave 2 — Cross-module routing and handoffs

**Status: PLANNED after Wave 1B.**

Primary targets: UX-003, any residual UX-004 routing gaps, UX-009, UX-012, UX-013 after runtime confirmation, UX-014, and bounded mobile/discoverability improvements that do not redesign canonical ownership.

Keep Wave 2 focused on navigation, context, discoverability, and truthful handoffs. Do not invent duplicate domain records to simplify navigation.

### Wave 3 — Deliberate business-workflow decisions

**Status: PLANNED after Wave 2.**

Primary targets:

- UX-010 payroll settlement semantics;
- UX-011 subcontract payable bridge;
- UX-008 PO close guard only after runtime/database confirmation;
- UX-016 subcontract mobile workflow together with the subcontract lifecycle work.

These are not routing-polish tasks. Financial/source-of-truth decisions must be explicitly designed and reviewed before implementation.

## Product sequence and parallel release/readiness track

### Immediate user-prioritized product workflow sequence

1. Wave 1A — Supplier Payable Lifecycle UX — **COMPLETE**
2. Wave 1B — Client Receivable Lifecycle UX — **NEXT**
3. Wave 2 — Cross-module routing/handoffs
4. Wave 3 — payroll/subcontract/PO workflow decisions
5. Resume the broader approved product roadmap unless the user reprioritizes again:
   - Email/SMS + Documents;
   - Worker Registration;
   - Site Attendance;
   - Face-Recognition Attendance only after explicit privacy/security design;
   - final pre-production certification.

### Parallel QA/release-readiness track

QA certification, recovery evidence, provider validation, deployment identity, migration parity, and production-separation requirements remain valid operational gates in parallel with UX development. UX progress does **not** make unfinished QA certification complete, and a documentation-only change does not provide hosted runtime certification for a newer application-bearing SHA.

Production Supabase remains read-only unless explicitly authorized under repository policy.

## Explicit out-of-scope boundaries

This audit does not authorize:

- naive/manual paid or collected flags;
- duplicate Expense/payable/Actual Cost or collection truth;
- new accounting semantics, VAT/withholding policy, or invented FX;
- weakening RLS/RBAC/company isolation;
- silent rewriting of finalized financial, inventory, payroll, engineering, or document history;
- payroll payment redesign during Wave 1B;
- subcontract payable implementation before source-of-truth design;
- PO close changes before runtime/database evidence;
- Email Intake redesign before UX-013 runtime confirmation;
- Worker Registration, Attendance, Face Recognition, or Email/SMS/Documents work inside the UX waves unless explicitly scoped later.

## Client-facing roadmap boundary

Internal IDs (`UX-*`), waves, PR numbers, CI, migrations, SHAs, agent terminology, and engineering notes belong only in internal documentation. The client-facing `Hydroqualisense Features & Roadmap` must describe only actual usable behavior and approved future product direction.

At the reviewed baseline, Wave 1A's material user-facing behavior is already reflected in the Available Supplier Invoices/Expenses and Cash & Banking descriptions. No additional client-facing roadmap change is required solely to persist this audit.