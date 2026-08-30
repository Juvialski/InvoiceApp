# Wave 6A Goal State

## Status

Wave 6A implementation and local validation are complete on `hardening/wave6a-navigation-recovery`; publishing remains.

## Completed work

- Fast-forwarded `main` to `eaed437010868cec40d288012c7970a7b97541ec` before branching.
- Routed project RFI, submittal, and Site Log detail navigation through the host SPA router.
- Preserved the `/demo/app` namespace for shared project and settlement navigation.
- Added history-aware detail selection so browser Back/Forward restores register and detail state.
- Added safe unavailable-destination states for RFI, submittal, payroll, and cash deep links.
- Kept engineering document, coordination, and Site Log snapshots visible during refreshes and retryable failures after an initial successful load.
- Kept settlement evidence visible during refresh and added retry recovery for failed reads.
- Prevented stale Assistant requests from clearing a newer request's busy/error state.
- Kept internal invoice, payroll, cash, and settlement links SPA-local when the host supplies navigation.

## Confirmed browser findings

- Before the fix, selecting a demo RFI rewrote `/demo/app/...` to `/projects/...`, did not notify the router, and Back skipped the RFI register.
- After the fix, project detail URLs remain namespaced and Back/Forward restores the correct register/detail state.
- Desktop navigation among Dashboard, Projects, Payroll, Cash & Banking, Reports, Settings, and Dashboard works with no console errors.
- The Assistant remains open across route changes and retains an unsent composer draft.
- Mobile navigation and the Assistant panel remain usable at 390px with no document overflow beyond the viewport.

## Validation completed

- WM-5 packets: `platform-shell`, `assistant-screen`.
- `npm.cmd test`: 767 tests, 766 passed, 1 skipped, 0 failed.
- `npm.cmd run lint` passed.
- `npm.cmd run build` passed; only existing chunk-size/dynamic-import and missing Inter font notices were emitted.
- `npm.cmd run test:migrations`: 74 static migration tests passed; live PostgreSQL upgrade-path validation was skipped because `127.0.0.1:54322` was unavailable.
- `npm.cmd run workflow-map:check` passed: 200 nodes, 240 edges.
- `npm.cmd run workflow-map:consistency` passed: 200 nodes, 240 edges, 13 invariants, 5 diagrams.
- `npm.cmd run test:workflow-map` passed: 59 tests.
- `git diff --check` passed.
- Local browser QA passed in the demo and browser-only production workspace.

## Remaining work

- Review the final diff, commit, push, open a focused PR, and stop without merging.

## Exact next step

Review the final diff, commit the coherent change, push the branch, open the focused PR, and stop without merging.
