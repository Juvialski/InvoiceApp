# Workspace persistence and conflict audit

Wave 1, Agent 2 audit for `feat/engineering-project-costing` (2026-08-23).
This note records the current behavior and the pure contracts added in
`src/utils/remoteConflict.ts`. It does not implement the application sync
layer.

## Current persistence matrix

| Domain | Authenticated loader / tables | Authenticated writers | Guest fallback | Proposed refresh group |
| --- | --- | --- | --- | --- |
| Invoices | `loadInvoicesFromSupabase()`; `invoices`, latest `invoice_extractions`, signed source previews | `persistNewInvoice`, `updateInvoiceInSupabase`, `persistExtractionAttempt`, `deleteInvoiceFromSupabase` | App key `extracted_invoices` | INVOICES |
| Invoice sources and history | Used by invoice persistence: `source_documents`, `email_messages`, `vendors`, `invoice_line_items`, `invoice_review_events` | Source/email save helpers and append-only review events | No operational local mirror | INVOICES when a change affects visible invoice/source state; review history alone is not currently loaded by App |
| Projects | `loadProjectsFromSupabase()`; `projects` | `saveProjectToSupabase`, `archiveProjectInSupabase` | `engineering_projects` | ENGINEERING |
| Invoice project allocations | `loadInvoiceProjectAllocationsFromSupabase()`; `invoice_project_allocations` | `replaceInvoiceProjectAllocationsOnSupabase()` RPC | `engineering_invoice_project_allocations` | ENGINEERING |
| Expenses | `loadExpensesFromSupabase()`; `expenses` | `saveExpenseToSupabase`, `archiveExpenseInSupabase` | `engineering_expenses` | ENGINEERING |
| Workforce and payroll | `loadPayrollWorkspaceFromSupabase()`; `departments`, `workers`, `project_worker_assignments`, `work_entries`, `payroll_periods`, `payroll_runs`, `payroll_entries`, `payroll_project_allocations`, `payroll_adjustments` | Per-domain save helpers plus `replacePayrollRunEntriesToSupabase()` | `engineering_*` keys for each payroll collection | PAYROLL |
| Payroll imports | `loadPayrollImportWorkspaceFromSupabase()`; `labor_cost_centers`, `payroll_import_batches`, `payroll_import_rows`, `payroll_import_templates` | Import batch/row/template helpers and commit RPC | `engineering_labor_cost_centers`, `engineering_payroll_import_*` | PAYROLL_IMPORTS |
| Gmail state | `loadGmailSyncState()`; `gmail_sync_state` (and connection state on write) | `saveGmailSyncState()`; provider tokens are browser local keys | No Gmail workspace mirror | GMAIL |
| Project accounting events | Not loaded by the current app; written by allocation RPC | `replace_invoice_project_allocations` records events | None | Do not refresh alone; refresh with the allocation change |

The guest and authenticated paths are conceptually separate: App effects
write operational local collections only when `session` is falsy, while the
authenticated path loads and writes through Supabase. The initial render is
still seeded from local data before auth resolution completes, so a stale
authenticated result must never be allowed to apply after sign-out or a user
switch. A deferred remote result must also never be written back into the
guest namespace.

## Concrete findings

1. **Authenticated load results have no session/request guard.** `loadWorkspace`
   captures a session but applies every awaited result without checking that
   the same user/session generation is still current. The initial
   `getSession()` guard only protects the callback before `loadWorkspace` is
   started. An old load can therefore finish after sign-out or a user switch,
   replace the guest/new-user state, and trigger the local-storage effect.
   `canApplyWorkspaceLoad()` and its test define the required integration
   guard: both user ID and monotonic request generation must still match.

2. **A remote invoice refresh would currently overwrite a selected draft.**
   The route/invoice effect resolves `invoices.find(invoice.id)` and calls
   `setSelectedInvoice` whenever the invoice list changes. That is correct for
   a clean/read-only view, but it would replace the selected local object while
   `saveState` is `unsaved`, `saving`, or `error`. The new
   `decideRemoteInvoiceRefresh()` contract defers those three cases and marks
   the remote result pending; it applies records outside the selected route
   immediately.

3. **Verified invoice allocation display can remain stale for the same ID.**
   `InvoiceViewer` correctly receives `readOnly={isVerified}`, and a remote
   invoice refresh does not itself reopen the invoice. However,
   `ProjectAssignmentPanel` resets its local allocation state only when
   `invoice.id` changes. A background allocation refresh for the currently
   viewed verified invoice keeps the old allocations in the panel even though
   the parent props changed. This needs a focused integration decision about
   clean versus locally edited allocation state; it is not safe to “fix” by
   resetting every time props change because that would erase an active draft.

4. **No Realtime, scheduler, focus/visibility fallback, or publication setup is
   present in this branch.** There are no `realtime`/`supabase_realtime`
   references in source or migrations. Cross-browser changes therefore do not
   currently trigger canonical refetches. The required implementation remains
   lead-owned and should debounce domain refreshes, rerun when a refresh was
   requested during an in-flight load, and apply the session guard above.

5. **The initial engineering refresh is all-or-nothing at the state boundary.**
   The four engineering loaders run with `Promise.allSettled`, but successful
   projects/allocations/expenses are applied only if all four (including
   payroll) succeed. A missing or temporarily failing payroll migration can
   therefore leave otherwise valid remote engineering data unrefreshed.
   Domain-level refreshes should apply successful groups independently and
   report failed groups as degraded.

6. **Loader calls independently resolve the current auth user.** Each domain
   loader calls `supabase.auth.getUser()` on its own. If auth changes while the
   parallel load is running, a single workspace refresh can mix results from
   different auth states unless the integration invalidates the whole load and
   starts a new generation.

7. **Active form audit.** Invoice fields are controlled by the selected App
   invoice, so they need the explicit conflict decision above. Expense,
   payroll, project, import, and allocation editors generally keep their draft
   in component state and do not reset it on list-prop changes. No evidence was
   found for a broad refresh-induced draft wipe. The project list's
   `initialEditingProject` effect and the same-ID allocation panel are the
   narrow places to revisit during integration.

## Existing protections to preserve

- `enqueueSerializedSave()` serializes invoice writes per invoice ID and uses
  the last successful persisted snapshot as the next `previous` value.
- Invoice edit revisions prevent an older debounced save from changing the
  visible save state for a newer edit, and verification rechecks the latest
  local revision before finalizing.
- App route effects already resolve project and invoice records by route ID;
  `resolveEntityById()` captures that identity rule and returns `null` for a
  remotely missing record so the existing not-found state can handle it.
- Guest local collections remain namespaced by domain and must not be merged
  into an authenticated Supabase workspace without an explicit future import
  workflow.

## Scope and blockers

This wave intentionally adds no App integration, shared UI, existing
persistence-module edits, Realtime migration, or Supabase network tests. The
lead agent must wire the pure contracts into the authenticated refresh layer,
pending-invoice UX, and domain scheduler, then validate with two authenticated
browser sessions. Supabase RLS remains the security boundary; same-user
cross-browser sync is not a multi-user/company workspace feature.
