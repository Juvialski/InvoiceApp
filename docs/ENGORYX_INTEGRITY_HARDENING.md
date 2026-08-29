# Engoryx authorization and data-integrity hardening

This document records the hardening contract for the current Engoryx application. It does not introduce Phase 2 Scheduling/Gantt or another product phase.

## Canonical authorization

Application route authorization is defined by `src/utils/accessControl.ts` and `src/utils/routes.ts`.

- `permissionOptionsForAppTab()` is the canonical route-permission contract.
- `canAccessAppTab()` is the client route-capability check.
- Assistant `navigate_to` authorization derives from the same route contract through `src/server/assistant/toolAuthorization.ts`.
- Unknown Assistant route IDs fail closed.
- Alternative route permissions, such as financial reports or payroll reports, remain explicit alternatives rather than duplicated role logic.

Frontend capability hiding is not a security boundary. PostgreSQL RLS and guarded RPCs remain authoritative.

## Aggregate data completeness

Cross-domain project cost requires three source domains:

1. supplier invoices (`invoices.read`)
2. project labor, supplied by payroll detail (`payroll.detail.read`) or the safe project labor aggregate (`payroll.summary.read`)
3. direct expenses (`expenses.read`)

`src/utils/dataCompleteness.ts` formalizes the reusable completeness state with:

- `complete`
- `status`
- `requiredSources`
- `visibleSources`
- `missingSources`
- `sourceStates` (`detail`, `aggregate`, `unavailable`, `incomplete`, or `currency-conflict`)
- `reason`

A mathematically valid total is not an authoritative company/project total when one of its required sources is unavailable.

Current hardening behavior:

- The Dashboard withholds combined project-cost, utilization, trend, remaining-budget, and company-cost metrics when project-cost source visibility is incomplete. When the safe aggregate is available, lifetime project rows and composition include its project labor total; payroll-period trend, overhead, and unallocated payroll detail remain explicitly restricted.
- The Projects directory and Project workspace use the same completeness result. Finance and Viewer can receive authoritative project-cost summaries when the aggregate load succeeds without receiving payroll detail.
- Combined Project Reports and their export use the project-level labor aggregate for Finance/Viewer. The payroll report tab and workbook sheet contain project/currency totals only when payroll detail is not permitted.
- The Assistant project-cost summary requires `payroll.summary.read` and calls the guarded aggregate RPC. It never queries payroll detail to calculate the answer, and it fails closed when the aggregate is unavailable or incomplete.

No hardening rule grants Finance or Viewer access to individual payroll detail.

## Seeded role behavior

### COMPANY_ADMIN

Receives the intended full company capability set. Cross-domain cost views are complete when their source loads succeed.

### FINANCE

Can work with projects, supplier invoices, expenses, financial reports, and Gmail read surfaces according to the role matrix. The safe project labor aggregate supplies project-level confirmed/pending labor cost through `payroll.summary.read`; this does not grant payroll-detail, compensation, attendance, deduction, net-pay, or employee access.

### PAYROLL

Can work with detailed payroll/workforce and project references. Supplier invoice and direct-expense data are not implied. Combined project cost is therefore withheld.

### VIEWER

Read-only financial/project surfaces remain inspectable. Create, save, verify, archive, delete, Gmail-management, and settlement-reversal controls are not presented without their corresponding permission. Invoice review is an inspection experience rather than a fake verification workflow.

Viewer receives the same project-level labor aggregate as Finance when `payroll.summary.read` is present. Viewer does not receive payroll entries, allocations, worker identities, rates, attendance, deductions, or net pay.

## Read-only and redacted behavior

- Invoice detail uses the existing read-only viewer when the role can read but cannot manage/verify invoices.
- Review Queue can remain visible as an inspection surface but does not offer verification actions to non-verifiers.
- Gmail read access does not expose connect/sync/import/configuration controls that require `gmail.manage`.
- Project workspace tabs for unauthorized financial/workforce domains are hidden instead of showing misleading zero-record states.
- Financial settlement history may be redacted by the settlement RPC when Cash & Banking transaction access is unavailable.
- Settlement reversal is opt-in and requires `cash.reconcile`; the component defaults to no reversal capability.

## Deployment-company access refresh

The browser receives a read-only identity for the company configured in the
current Engoryx deployment. It does not select, switch, or open an unrelated
client company. On sign-in, sign-out, session replacement, role or membership
change, Realtime access notification, and access refresh, the current company
context and permissions are cleared before the backend re-resolves the
deployment company and active membership. Workspace results and Assistant
state tied to the previous user or deployment identity are discarded while
that refresh is in flight.

The compatibility `X-Company-Id` header can only confirm the authoritative
deployment company. A missing deployment configuration, ambiguous legacy
company state, suspended company, inactive membership, or mismatched header
fails closed; none of those states is represented as an empty but usable
workspace.

## Financial boundaries preserved

This hardening does not change accounting semantics:

- cash settlement is evidence of payment, not project cost
- invoice document-reported paid amounts are not added to confirmed bank settlement
- payroll project labor cost is distinct from employee net-pay disbursement
- archived/void and immutable-history rules remain domain-specific
- currencies are not combined through an implicit FX conversion

## Implemented safe project labor aggregate

The forward migration `20260828153000_project_labor_cost_aggregate.sql` adds the authenticated-only RPC:

`public.get_project_labor_cost_aggregate(p_project_ids uuid[])`

It returns one row per requested project with only:

- `project_id`
- `currency`
- `confirmed_labor_cost`
- `pending_labor_cost`
- `aggregate_status` (`AVAILABLE`, `ZERO`, or `CURRENCY_CONFLICT`)

The RPC derives the company from `deployment_configuration`, validates the deployment header only as a matching assertion, requires an active membership plus `projects.read` and `payroll.summary.read`, and rejects missing/foreign projects, malformed input, suspended users, missing deployment configuration, and source/company integrity mismatches. It is `SECURITY DEFINER` with an empty `search_path`; execution is revoked from `PUBLIC`, `anon`, and the default authenticated grant is re-added explicitly.

The aggregate sums the canonical `payroll_project_allocations.allocation_amount`. `APPROVED` and `PAID` runs are confirmed; `DRAFT` and `CALCULATED` runs are pending; `VOID` runs are excluded. Explicit `ADMIN_OFFICE` and `GENERAL_OVERHEAD` contexts are excluded from project labor. Gross pay, net pay, worker identity, employee IDs, attendance, overtime, deductions, rates, and individual allocation rows are never returned. No mutation or historical payroll rewrite occurs. The current payroll run schema has no separate `POSTED`, `REVERSED`, or `SUPERSEDED` states; if those lifecycle states are introduced later, their inclusion/exclusion rules must be added to this RPC before use.

The current payroll schema has no currency column on payroll runs or project allocations. Therefore the RPC reports the deployment company's `default_currency` as the payroll allocation currency. A project whose currency differs receives `CURRENCY_CONFLICT`; application composition keeps the amount separate as a foreign amount and marks the project-cost source `currency-conflict`. No FX conversion is performed. `ZERO` is an authoritative no-row/zero-allocation result and is distinct from an unavailable or incomplete RPC load.

The aggregate is consumed by the Dashboard project-cost view, Projects/project Overview, combined Reports and export, and the Assistant `get_project_cost_summary` tool. Payroll-detail views continue to use the existing detail permission and are not broadened. If the RPC is unavailable, invalid, incomplete, or currency-incompatible, the shared completeness helper withholds combined totals rather than converting the result to zero.

## Core Hardening Wave 2A workforce correction boundary

The forward migration `20260829024150_core_hardening_wave2a_workforce_corrections.sql`
adds one company-derived lifecycle boundary for existing workforce/payroll
records. A dependency-free worker, assignment, profile, component, or draft
source may be deleted only after server/database checks. Used operational rows
are ended, offboarded, deactivated, cancelled, or voided. Finalized payroll
snapshots and project labor history remain immutable.

Worker home context is explicit (`PROJECT`, `ADMIN_OFFICE`,
`GENERAL_OVERHEAD`, or `UNALLOCATED_REVIEW`) and is separate from actual work
entries and finalized allocations. Office, overhead, and unresolved labor do
not become project labor; Main Office is never a fake project. Multiple active
project assignments are allowed and do not themselves create allocation
percentages or duplicate cost. Explicit actual project evidence takes
precedence over defaults.

The lifecycle RPCs require the existing effective `workers.manage` or
`payroll.manage` permission, active deployment membership, and target-company
validation. Direct authenticated DELETE is closed for covered tables. The
focused pgTAP suite records the worker, assignment, context, compensation,
component, work-entry, attendance, leave, overtime, RLS, permission, and audit
invariants. This is Wave 2A only; Finance/Projects Wave 2B, Engineering Wave
2C, and Assistant parity Wave 3 remain outstanding.
