# HydroQualiSense Active Roadmap

Updated **2026-10-12 (WF-RESET-2)**. Repository `Juvialski/InvoiceApp`.
Live source and [AGENTS.md](../AGENTS.md) govern implementation. Start with the
[active brief](ACTIVE_DEVELOPMENT_BRIEF.md); read specialist contracts selectively.

## Current priority

The **hardening-first / net-new product freeze remains active**. Improve and
certify existing workflows before expanding domains. WF-RESET-1 (#297) made
Jev/context optional; QA-RECOVERY (#298) skips remote QA for unrelated changes
while retaining guarded runtime/migration and explicit release checks.
WF-RESET-2 consolidates active documentation and resumes restored QA certification.

The explicitly authorized **UX-RESET-1** simplification is implemented for PR review: six daily destinations plus permission-filtered More Tools, four Home tasks, a clearer source-review-confirm-payment journey and stock entry. See [inventory](UX-RESET-1-INVENTORY.md) and [evidence](UX-RESET-1-EVIDENCE.md). The [UX-RESET-2 workbook specification](UX-RESET-2-WORKBOOK-SPEC.md) is planning-only; no broader adapters are enabled or certified by this phase.

Next bounded actions:

1. Resolve concrete protected exact-SHA QA failures; certify existing
   authenticated routes and the Operations Workbook matrix with real artifacts.
2. Select high-impact usability, reliability, permission or financial-workflow
   defects from current application evidence. Deliver coherent fixes with focused
   regression coverage and applicable exact-head CI.
3. Complete provider/readiness and existing-document render certification when
   safe credentials, devices and deployment prerequisites exist.
4. Resume product expansion only after explicit user reprioritization.

## Implemented capability boundaries

**UX-RESET-2, 2026-10-13:** The explicitly authorized existing-domain hardening phase adds Suppliers, Supplier Invoices and Warehouse to the in-app Workbook, staged/reviewed creation in four supported domains, exact bill and inventory workflow handoffs, and shared light/dark presentation. The dated five-sheet/planning-only statements above and below describe the earlier boundary. New in-app sheets do not expand the legacy XLSX contract. [Evidence and limitations](UX-RESET-2-EVIDENCE.md).

| Area | Implemented scope and authority |
| --- | --- |
| Projects and finance | Project controls/Cost Codes; supplier review linked to one canonical Expense/payable; Client Billing/Collections; Cash & Banking; explicit settlement/lifecycle workflows |
| Procurement and operations | RFQs/quotations/POs, receipts/matching, subcontracts/claims/variations, materials/equipment and movement-based warehouse history |
| Payroll and engineering | Existing payroll/workforce management; engineering documents, RFIs/coordination and Site Logs; permission-scoped detail/history |
| Documents and communications | Templates, immutable issued artifacts, programmatic PDF fallback, managed files/versions; reviewed composition, delivery intents/history, recovery and provider adapters |
| Worksheets and Operations Workbook | Eight permission-filtered in-app sheets: Projects, Cost Codes, Supplier Invoices, Direct Expenses, RFQs, POs, Suppliers and Warehouse. Reviewed row creation in four supported domains; existing canonical services remain authoritative. Legacy XLSX review/Apply keeps its existing domain contract |
| UI and architecture | Workflow-first navigation, contextual help, density/responsive corrections, entity media, public company/QA showcase separation; RI-1/2/3 and professionalization implemented |

These are implementation boundaries, not universal hosted/provider certification.
Consult [product direction](HYDROQUALISENSE_PRODUCT_DIRECTION.md),
[workbook contract](HYDROQUALISENSE_OPERATIONS_WORKBOOK_CERTIFICATION.md),
[Wave 4D](HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md), and
[Documents](HYDROQUALISENSE_UNIFIED_DOCUMENT_CENTER.md) for precise semantics.

## Readiness and incomplete capability

- QA Supabase `vrpuznofrntyqsbugrib` is restored and `ACTIVE_HEALTHY`;
  live canonical parity is 153/153, head `20260927095636` (2026-10-12).
  Exact-source certification and remaining blockers are in the
  [handoff](HYDROQUALISENSE_CURRENT_HANDOFF.md).
- Brevo and approved Company SIM Gateway/optional PhilSMS need safe real runtime
  evidence; adapters or UI do not prove delivery. Google is identity-only.
- Authenticated company-template/high-fidelity conversion certification is
  separate; QA health reports conversion unavailable, with the existing
  programmatic fallback available.
- MKT-V3A has two silent visual masters. Taglish narration, licensed music,
  audio mix and final audio review remain external/incomplete.
- QA does not authorize production. Production `qijjshdwiylojvqojxyz`
  remains a separate explicitly authorized target.

## Deferred backlog, not cancelled

Worker Registration, Site Attendance/face recognition, net-new workforce and
Finance UX-W6 expansion, typed custom fields/Add Column, WB-3D+ domains,
broader document aggregation/handover grouping and optional RI-4/5/6/7 remain
deferred. RI-7 3D presentation remains last. Historical NEXT/ACTIVE labels do
not resume work.

## Permanent boundaries

One repository, isolated client deployments, one client company per deployment.
Preserve company/RBAC/RLS/Storage isolation, canonical identity, currency/FX and
tax uncertainty, committed-versus-actual cost, source-versus-financial authority,
immutable finalized history, concurrency/idempotency and payroll privacy.
Worksheet/AI changes remain proposals until validated human confirmation.
Consequential lifecycle/provider actions remain explicit workflows.
Migrations move forward under the [operator policy](CHATGPT_MIGRATION_OPERATOR_POLICY.md)
and [runbook](HYDROQUALISENSE_DEPLOYMENT_RUNBOOK.md).

## Historical evidence

The complete former roadmap is preserved in
[roadmap history through 2026-10-12](HYDROQUALISENSE_ACTIVE_ROADMAP_HISTORY_THROUGH_20261012.md).
Phase reports, specs and Git history remain intact. Search a relevant phase in
this archive only when precise historical evidence is needed.
