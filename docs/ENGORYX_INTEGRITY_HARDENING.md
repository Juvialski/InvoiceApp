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
2. project labor detail (`payroll.detail.read`)
3. direct expenses (`expenses.read`)

`src/utils/dataCompleteness.ts` formalizes the reusable completeness state with:

- `complete`
- `status`
- `requiredSources`
- `visibleSources`
- `missingSources`
- `reason`

A mathematically valid total is not an authoritative company/project total when one of its required sources is unavailable.

Current hardening behavior:

- The Dashboard withholds combined project-cost, utilization, trend, remaining-budget, and company-cost metrics when project-cost source visibility is incomplete.
- The Projects directory and Project workspace explicitly label locally calculated values as visible/partial where those views remain useful.
- Combined Project Reports and their export are suppressed when required source domains are incomplete.
- The Assistant project-cost summary fails closed unless all contributing source domains are readable. This prevents RLS-filtered empty arrays from becoming false zero-cost assertions.

No hardening rule grants Finance or Viewer access to individual payroll detail.

## Seeded role behavior

### COMPANY_ADMIN

Receives the intended full company capability set. Cross-domain cost views are complete when their source loads succeed.

### FINANCE

Can work with projects, supplier invoices, expenses, financial reports, and Gmail read surfaces according to the role matrix. Payroll aggregate visibility does not imply payroll-detail visibility. Combined project cost is therefore withheld unless a future safe server aggregate can supply labor cost without employee detail.

### PAYROLL

Can work with detailed payroll/workforce and project references. Supplier invoice and direct-expense data are not implied. Combined project cost is therefore withheld.

### VIEWER

Read-only financial/project surfaces remain inspectable. Create, save, verify, archive, delete, Gmail-management, and settlement-reversal controls are not presented without their corresponding permission. Invoice review is an inspection experience rather than a fake verification workflow.

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

## Intentionally deferred architecture

A safe server-side project labor aggregate remains the preferred follow-up for Finance/Viewer. Such an RPC should expose project-level labor cost only, never employee payroll rows, and must enforce company isolation, an aggregate-level permission, currency separation, lifecycle handling, and archived/void rules.

Until that RPC exists, Engoryx favors truthful incomplete-data behavior over broader access or authoritative-looking partial totals.
