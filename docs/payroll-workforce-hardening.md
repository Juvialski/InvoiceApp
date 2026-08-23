# Payroll and workforce hardening

## Source of truth

InvoiceApp keeps workers as the canonical workforce identity because project assignments, work entries, payroll entries, and project payroll allocations already reference workers. Confirmed project labor comes only from allocations belonging to APPROVED or PAID payroll runs. Draft and calculated labor remains pending; raw work-entry cost is not added separately.

The operational flow is worker -> project assignment -> period-linked work entry -> calculated payroll run -> payroll-entry snapshot -> normalized project payroll allocation -> project cost report.

## CoreHR audit matrix

| Feature | Reuse | Adapt | Reject/defer | Reason |
|---|---|---|---|---|
| Employee directory | Worker identity | Add status, title, manager, hire date, schedule metadata | Separate employees table | Avoid two workforce universes |
| Departments | Department concept | User-scoped departments with optional manager | Global RLS | Current tenancy is user_id ownership |
| Attendance and breaks | Data-model ideas | Keep period-linked work-entry extension point | Full portal and CoreHR tables | Payroll correctness comes first |
| Salary structures/history | Structured components | Earnings, deductions, employer-cost adjustments and snapshots | HRA/PF/INR formulas | CoreHR payroll is India-oriented |
| Payroll UX | Status-driven workflow | Explicit periods, calculate/approve/pay/lock display | Monthly-only workflow | Project labor needs time allocation |
| RBAC/RLS | Relationship checks | Preserve owner-only policies | CoreHR global/admin policies | Workspace roles are future work |
| Leave/assets/onboarding | Future roadmap | Documented extension points | Wholesale migrations/seeds | Outside this pass |

CoreHR was reviewed at public commit 871897accba3a4d1d2f79d1e38318f52e102b688. It is MIT licensed. No substantial CoreHR source was copied into InvoiceApp, so no source attribution notice was required.

## Payroll rules

DRAFT -> CALCULATED -> APPROVED -> PAID

VOID is explicit and terminal. Approval requires a calculated run, at least one unique worker entry, non-empty calculation snapshots, valid numeric totals, and valid allocation state. Database triggers reject illegal transitions, duplicate worker entries, and entry/allocation/adjustment mutations after approval, payment, or voiding.

Calculation utilities support hourly, daily, monthly, overtime, structured adjustments, deterministic snapshots, date-valid assignment pay overrides, worker-rate fallback, allocation validation, and visible unallocated labor. No Philippine statutory compliance is claimed.

## Security and migrations

The additive payroll migration adds duplicate preflight, period/date/ownership checks, state guards, locked-run mutation guards, allocation checks, relationship-scoped RLS, indexes, and grants. The additive workforce migration adds departments, worker metadata, calculated timestamps, and payroll component columns. New rows remain scoped by user_id = auth.uid(); relationship ownership is checked in database triggers.

Guest persistence includes departments, workers, assignments, periods, runs, entries, allocations, work entries, and adjustments. Authenticated persistence uses Supabase loaders under the same owner model.

## Deferred phases

- Versioned Philippine statutory rules using authoritative configuration.
- Attendance records and breaks, cross-midnight shifts, and conversion to approved work entries.
- Workspace tenancy with companies/workspaces, workspace_members, and owner/admin/accounting/hr/project-manager/engineer/employee roles.
- Leave, employee self-service, onboarding/documents, payslips, notifications, performance, and asset/equipment assignment.

Database execution requires applying the new Supabase migrations in a connected environment.
