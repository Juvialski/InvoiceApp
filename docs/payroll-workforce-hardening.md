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

## Core Hardening Wave 2A status

Wave 2A adds a correction lifecycle across the existing workforce/payroll
domain. It does not create a second employee or allocation system and it does
not add Scheduling/Gantt/CPM or percentage resource planning.

### Worker and assignment semantics

- A worker with no assignments, attendance, work, leave, overtime, payroll,
  compensation, recurring-component, import-row, or manager dependency may be
  permanently deleted after the authoritative database preflight.
- A used worker is offboarded (`active = false`, `employment_status =
  OFFBOARDED`, and an employment end date) rather than deleted. Reactivation
  restores an active worker without changing payroll snapshots.
- A project assignment is date-ranged context. Workers may have multiple
  concurrent assignments; membership does not mean a percentage split and does
  not duplicate payroll cost. Used assignments can be ended, while unused
  accidental assignments may be deleted.
- Assignment identity, start date, and pay overrides are protected after
  downstream workforce/payroll use. Project A -> Project B -> office changes
  do not rewrite earlier dates or allocations.

### Labor context and calculation boundaries

`PROJECT` may carry a real project. `ADMIN_OFFICE`, `GENERAL_OVERHEAD`, and
`UNALLOCATED_REVIEW` do not carry a project. Main Office is never represented
as a fake engineering project. Default/home context and default project are
convenience values only; explicit actual work/project evidence wins, and
unresolved labor stays unallocated. Project assignment membership alone never
creates a duplicate allocation.

### Profiles, components, and source correction

Compensation profiles are effective-dated. A new profile can supersede an older
profile by ending it the day before the replacement begins; a consumed profile
cannot be rewritten or deleted. Recurring components can be corrected while
unused and deactivated/end-dated after use. Payroll snapshots remain the
historical authority.

Draft work entries and draft attendance/leave/overtime may be deleted through
the guarded lifecycle boundary. Used work entries are voided, confirmed
attendance is voided, and pending/approved leave or overtime is cancelled with
a reason. Finalized or locked payroll sources remain immutable.

The Wave 2A database contract is implemented by the additive
`20260829024150_core_hardening_wave2a_workforce_corrections.sql` migration:
`preview_worker_lifecycle`, `apply_worker_lifecycle`,
`apply_project_worker_assignment_lifecycle`,
`save_worker_compensation_profile`, `apply_compensation_profile_lifecycle`,
`apply_recurring_component_lifecycle`, and
`apply_workforce_source_lifecycle`. These RPCs derive the configured
deployment company, require active membership plus the existing effective
`workers.manage` or `payroll.manage` permission, recheck dependencies under
row locks, and write company audit events. Direct authenticated DELETE is
closed for the covered tables.

The lifecycle audit additions are `WORKER_OFFBOARDED`,
`WORKER_REACTIVATED`, `WORKER_DELETED_UNUSED`, assignment end/delete,
compensation end/supersede, component deactivation, work-entry and attendance
void/delete, and leave/overtime cancel/delete events. Audit metadata contains
safe lifecycle context rather than salary or payroll amounts.

Validation coverage includes the pure lifecycle classification and canonical
calculation tests, migration invariants, application type checking, and the
focused pgTAP suite at
`supabase/tests/database/05_core_hardening_wave2_workforce_corrections.test.sql`.
Fresh replay, historical upgrade replay, authenticated RLS probes, and
browser evidence remain required on the exact PR head when a Supabase/Docker
environment is available.

## Deferred phases

- Versioned Philippine statutory rules using authoritative configuration.
- Attendance records and breaks, cross-midnight shifts, and conversion to approved work entries.
- Workspace tenancy with companies/workspaces, workspace_members, and owner/admin/accounting/hr/project-manager/engineer/employee roles.
- Leave, employee self-service, onboarding/documents, payslips, notifications, performance, and asset/equipment assignment.

Wave 2A does not complete the whole hardening program. Finance/Projects
correction semantics remain Wave 2B, Engineering correction semantics remain
Wave 2C, and Assistant action parity remains Wave 3. Scheduling remains
frozen.

Database execution requires applying the new Supabase migrations in a connected environment.
