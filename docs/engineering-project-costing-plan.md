# Engineering project costing implementation plan

## Architecture

Projects are first-class UUID records owned by the current Supabase user. Supplier invoices remain the existing `invoices` records with immutable extraction attempts and append-only review events. `invoice_project_allocations` is the relational bridge and supports one invoice split across multiple projects using normalized amount or percentage allocations. Existing `invoices.current_data.projectReference` remains a non-authoritative text hint.

Direct costs live in `expenses`; project labor is modeled through `workers`, time entries, payroll periods/runs/entries, and normalized payroll project allocations. A future workspace/company membership layer can replace the current user ownership predicates without changing these relationships.

## Cost rules

- Confirmed supplier cost: `VERIFIED` invoice allocations only.
- Pending supplier cost: `NEEDS_REVIEW` allocations, shown separately.
- Confirmed labor cost: payroll allocations belonging to `APPROVED` or `PAID` runs.
- Pending labor cost: non-void draft/calculated/open runs.
- Confirmed direct cost: `APPROVED` or `PAID` expenses.
- Pending direct cost: `DRAFT` expenses; `VOID` is excluded.
- `actualProjectCost = confirmedInvoiceCost + confirmedPayrollCost + confirmedExpenseCost`.
- `remainingBudget = projectBudget - actualProjectCost`.
- `committedCost` currently means verified unpaid or partially-paid invoice allocations.
- Foreign currency is retained and reported separately; it is never silently added to a PHP total.

## Milestones implemented in this branch

1. Project foundation, allocation validation, project workspace, project invoice filter, deterministic matching, archive behavior, RLS, and tests.
2. Direct expenses with approval states, project allocation, guest persistence, and cost integration.
3. Payroll foundation with workers, project assignments, periods, manual time entries, payroll runs/entries, normalized allocations, and a statutory-payroll extension point.
4. Central cost utilities, company dashboard additions, project reports, and engineering workbook export.

The UI deliberately keeps Gmail authentication and full HR/accounting functionality out of scope. Guest mode uses best-effort local storage for the new modules and continues to use the existing invoice fallback.

## Deployment

Apply `supabase/migrations/20260823130000_engineering_project_costing_foundation.sql` after the existing invoice foundation migration. Confirm the authenticated Data API grants, RLS policies, deferred allocation triggers, and indexes in the Supabase dashboard. No seed data is required.

