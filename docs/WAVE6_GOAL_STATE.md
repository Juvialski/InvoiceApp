# Wave 6 Goal State

## Status

Wave 6A is merged in PR #45. Wave 6B implementation and local validation are complete on `hardening/wave6b-responsive-accessibility`; the focused PR is ready to publish and must not be merged by this task.

Base `main` was refreshed to `cfb212509be5415e530bacf2f303f20a15fe313a` before branching.

## Wave 6A merged

- SPA-local navigation, browser Back/Forward, and demo route namespace preservation remain in place.
- Invalid deep links recover safely, usable stale data remains visible during revalidation, and engineering/settlement refresh recovery is retained.
- Assistant request races remain guarded so a stale request cannot clear a newer request's busy/error state.

## Wave 6B confirmed findings and fixes

- Mobile workspace navigation was not a modal focus boundary: opening it left focus on the launcher, Escape did not close it, and focus was not restored. The drawer now exposes dialog semantics, traps Tab focus, closes safely on Escape, restores the opener, and exposes invoice disclosure state without invalid `menuitem` roles.
- Laptop-width dashboard metrics created nested horizontal scrollbars for currency values. Metric and summary values now wrap; the intentional project-register table scroller remains bounded.
- The demo tour launcher covered active mobile content. It is hidden at mobile widths because the in-flow Demo Workspace Tour control remains available; the open tour is labelled, focus-managed, and Escape-dismissible.
- Missing demo settlement evidence could remain indefinitely labelled as loading. It now has an explicit empty state, and settlement refresh failures expose a retry action while retaining local evidence.
- Demo settlement fallback links now retain the `/demo/app` namespace, including direct link targets; click-time host navigation remains SPA-local.
- Demo invoice/project deep links for missing records now show the shared “Page not found” recovery state with a return-to-dashboard action instead of a blank shell.
- Invoice allocation, engineering document, RFI, Submittal, Site Log, and project controls now wrap long content, expose accessible names/state, and keep narrow-screen action groups usable. Engineering and cash forms use bounded, scrollable short-screen dialogs.
- Cash modal close actions, payroll maintenance actions, locked attendance/date inputs, expense validation, and company-access changes now expose clearer busy/disabled/error states. Access suspension, revocation, and pending-authorization removal require an explicit confirmation.
- Project workspace sections and mobile invoice panes expose their active state. Lifecycle/correction and Assistant dialogs now have labelled modal boundaries, initial focus, Tab containment, Escape handling, and focus restoration; pending financial corrections cannot be closed while the mutation is in flight.

No database schema, RLS, financial lifecycle, payroll calculation, tenant, or Assistant authority contract was changed.

## Responsive and browser evidence

- Local/demo route checks covered 390px mobile, 768px tablet, 1280px laptop, and 1440px desktop-class viewports.
- Desktop route flow completed through Dashboard → Projects → project detail → Invoices → Payroll → Cash & Banking → Reports → Settings with canonical route changes, no document overflow, and no new console errors or warnings.
- Mobile checks covered primary navigation, Dashboard, invoice detail, project detail, Payroll, Cash & Banking, Settings, the expense form, Cash modal, lifecycle dialog, and the production browser-only Assistant panel. Document `scrollWidth` matched the client viewport on the checked routes.
- Representative keyboard evidence showed mobile navigation and Assistant/lifecycle/Cash dialogs receiving initial focus, closing with Escape, and restoring focus. Expense validation surfaced an associated alert without submitting a record.
- Long-content evidence included the wrapped Quezon City project title and bounded supplier/settlement content. Full authenticated/live-provider browser QA was not available in this environment.

## Validation

- `npm.cmd test`: 784 tests, 783 passed, 1 live database test skipped, 0 failed.
- Focused Wave 6B contracts: 17 passed across lead, responsive, and controls suites.
- `npm.cmd run lint`: passed.
- `npm.cmd run build`: passed; existing dynamic-import/chunk-size and unloaded Inter-font notices remain.
- `npm.cmd run test:migrations`: 74 static migration tests passed. Live PostgreSQL upgrade-path validation was skipped because `127.0.0.1:54322` refused the connection.
- `npm.cmd run workflow-map:check`: passed, 200 nodes and 240 edges.
- `npm.cmd run workflow-map:consistency`: passed, 200 nodes, 240 edges, 13 invariants, and 5 diagrams.
- `npm.cmd run test:workflow-map`: 59 tests passed.
- `git diff --check`: passed.

## Bounded risks and exit criteria

Wave 6B exit criteria are met for the scoped implementation and local/demo/browser-only evidence. Release-level Wave 6 proof remains bounded by unavailable authenticated Supabase/RLS/Storage/Realtime/provider/email validation and skipped live migration replay; those limitations must not be presented as production readiness.

## Exact next step toward Wave 7

Review the complete diff, publish the focused PR, and review exact-head CI plus authenticated/live evidence when available. Merge only after those release gates pass; then record Wave 6 sign-off before scoping Wave 7. Scheduling/Gantt/CPM remains frozen until the user explicitly lifts the freeze.
