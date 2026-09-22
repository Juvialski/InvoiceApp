# UX-S3D Payroll Normal-Cycle Workflow Hardening

Status: **Implemented for the recorded Payroll normal-cycle scope**
Date: **2026-09-22**
Repository: `Juvialski/InvoiceApp`
Branch: `codex/ux-s3d-payroll-normal-cycle`
Synchronized starting `main` SHA: `2a323638e88985648375216f9e6fd3ca27ef479c`

## Scope and verified friction

The live source confirmed four bounded workflow problems:

1. Overview exposed a direct `Calculate payroll` callback, bypassing the Run
   review surface.
2. Run calculation and approval callbacks were effectively fire-and-forget;
   the UI could report progress/success before authoritative persistence
   completed and could submit duplicate clicks.
3. Approval was a direct mutation from the Run card without a focused review or
   confirmation stage.
4. `PayrollPeriods` exposed DRAFT/OPEN/CALCULATED/APPROVED/PAID/VOID as an
   ordinary editable status field even though run status owns finalization.

The database contract verified during inspection explicitly rejects
authenticated period APPROVED/PAID finalization and requires `payroll.approve`
for run finalization. Approved-to-Paid remains Cash & Banking settlement
evidence, not a Payroll-side toggle.

## Implemented design

- `PayrollPageV2` derives a concise next-step indicator from existing period,
  run, exception, and source-freshness data. Overview routes to Import, Run
  review, or Cash & Banking; it does not calculate directly.
- `PayrollRunView` accepts async mutation results, awaits calculation and
  approval, disables in-flight controls, keeps failures retryable, and renders
  an approval review/confirmation surface with the required financial and
  source-state summary.
- `buildPayrollSourceRevisionInput` is shared by App authority and UI guidance;
  `validatePayrollRunSourceRevision` remains the existing authoritative
  contract and the App handler still re-checks it.
- `PayrollPeriods` edits only period metadata. Visible lifecycle state is
  derived from run/history state, and Approved/Paid/Void history is not offered
  as editable metadata.
- App/AppRouter/PayrollRoute callback contracts now return authoritative
  Payroll results or rethrow a user-facing failure. Direct Payroll run links
  preserve the Cash navigation callback and source-freshness guidance.
- Demo evidence covers the next-step overview and approved Cash handoff at
  desktop and phone widths. No Paid state was fabricated; the existing
  approved fixture is used for the settlement boundary.

## Invariants preserved

- Payroll calculation math, snapshots, source revisions, fingerprints,
  allocations, warnings, and stale-source behavior remain unchanged.
- `payrollWrite`, `payrollApprove`, Cash reconciliation, Payroll privacy, and
  company-isolation boundaries remain authoritative in existing App/database
  checks.
- Approved, paid, and void history remains locked/auditable; no direct Payroll
  Paid mutation was introduced.
- Employee net pay remains the Cash settlement basis; Cash settlement does not
  recalculate or unlock Payroll.
- Import remains staged/reviewed/confirmed before commit.
- No migration, RLS, RPC, DB guard, persistence authority, locking, provider,
  statutory-tax, or new workforce capability changed.

## Evidence and validation

- Focused Payroll normal-cycle/Cash/authority regressions: passed.
- Deterministic `npm.cmd run test:affected:agent`: **651 pass / 0 fail / 1
  skipped**, **86/369** selected, database fallback disabled.
- `npm.cmd run lint:eslint`: passed.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run build`: passed; existing Astryx font/chunk-size and CJS
  `import.meta` warnings remain.
- Workflow Map tests: passed after preserving canonical Payroll QA references.
- Local production-preview Demo Visual QA: **129 screenshots / 111 interaction
  scenarios / 36 routes / 4 viewports**, zero console/page/request/overflow
  failures. New Payroll scenarios passed:
  - normal-cycle next step — desktop and phone;
  - approved Payroll Cash & Banking settlement handoff — desktop and phone.
- Docker/Supabase, pgTAP, migration replay, hosted QA, provider, and
  production checks: not applicable to this UI/application-only diff.

## Jev diagnostics

- One bounded `agent:context` packet was attempted after synchronization. It
  fell back before Jev because `payroll` is not a supported Workflow Map
  domain; no replacement broad context request was made.
- One live `test-triage` attempt over the deterministic 86-file/652-test set
  returned `TypeError` before a response. Required tests remained deterministic
  and complete.
- One live sanitized completion/evidence attempt returned `TypeError` before a
  response. No Jev judgment affected implementation, validation, or delivery.

## Remaining work

UX-S3D is complete for this recorded Payroll normal-cycle slice. UX-S3E
accessibility/responsive/visual certification is the next planned hardening
phase and was not started here. A populated calculated-run fixture was not
added solely for browser QA; the approved fixture was used for the safe Cash
handoff evidence.
