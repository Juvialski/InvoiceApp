# UX-RESET-1 — Implementation and visual evidence

Application source: **`fffda74308ef92f9de19ba574dd8314de848d759`**. Base main: `3bf5db9460b972408b8037bfdc1dddb3822cd83e`. Branch: `codex/ux-reset-1`. Captured 2026-10-12 with no uncommitted runtime diff. Later evidence/handoff commits do not change this executable tree. Final protected CI belongs to the PR's exact HEAD and must be read from its current checks.

Environment: local `http://127.0.0.1:3000`, Node 24.19.0, repository-pinned Playwright 1.63.0 / downloaded Chromium headless shell, isolated contexts. All company, bill, project, vendor, stock and payroll records are synthetic. No user's Chrome profile, visible browser, desktop automation, Hubstaff interaction, production data, database promotion or provider send was used.

## Validation

| Proof | Result / boundary |
| --- | --- |
| New/modified focused tests | PASS, including six new navigation/task/settlement/void/focus regressions and existing supplier readiness/worksheet/financial regressions |
| `npm.cmd run test:affected:agent` | PASS **411/411**, 51/400 selected files, no fallback, database unaffected |
| `npm.cmd run lint` | PASS ESLint and TypeScript |
| `npm.cmd run build` | PASS production frontend/server bundles; existing bundle-size and CJS `import.meta` warnings remain |
| Workflow Map | PASS check and source consistency: 266 nodes, 355 edges, 36 invariants, 11 diagrams. Generator run refreshed local output; no semantic map change |
| Existing domain browser matrix | PASS **32/32** scoped invoice/upload/supplier-payable/editor/workbook scenarios; keyboard Enter/Tab/Shift+Tab/Escape, protected fields, read-only source review and genuine XLSX round trips retained. Includes 1440/1280/tablet/390 viewport checks |
| Beginner journeys | PASS **8 journeys x 3 viewports**: 1920x1080, **1366x768**, **390x844**; 75 route/state captures, zero page errors and no page overflow |
| Lead visual inspection | All 17 base routes at three viewports inspected through contact sheets, with core Home/register/review/payment/stock/navigation captures inspected individually. Classification below is separate from browser PASS |
| DB/runtime/provider/production | No DB contract changed; Docker/local Supabase were not started. Actual payment submission, hosted authenticated RLS/RPC execution, production and provider-backed certification were not performed |
| Context/Jev/delegation | Zero context packets, zero Jev calls, zero subagents |

Initial stale label/tax-disclosure assertions were corrected to exercise the new presentation, preserving their permission, protected-field and editing checks. No historical full-suite run was completed. One mistyped browser feature selector was stopped when it attempted full-catalog fallback; the final browser runs used the explicitly scoped 32 scenarios. Local output is transient; only the reviewed sanitized manifest and curated captures are retained here.

## Protected CI follow-up

The first exact-head protected Chromium run on `8108176abaff744b677548e6f62e409dee1251c1` ran all 398 scenarios and passed 395. Three harness expectations still referenced the old upload label / old Warehouse primary action. The Add bill contrast and filter checks now select the new label, and Warehouse expects Assign stock as primary with Add item/Opening stock secondary. Their contrast, filter-removal, responsive and action-variant assertions are unchanged. The focused five-scenario rerun, lint/typecheck and follow-up affected tests (343/343 across 47 selected files, no fallback) passed; this follow-up changes only browser checks and this evidence note, not the application source or captured runtime tree. The PR's updated exact-head protected results remain authoritative.

## Actual beginner journeys

The runner is `scripts/qa/ux-reset-beginner.mjs`; run against a local server with `node scripts/qa/ux-reset-beginner.mjs`. Optional `UX_RESET_VIEWPORTS` narrows diagnosis; default validates all three required viewports. It refuses a non-local server.

1. Find/open a bill from Bills & Payments using an exact bill-number search.
2. Resolve necessary issues using Choose supplier, explicit existing-supplier linking and saved description; review the possible duplicate.
3. Edit an ordinary bill field; confirm is unavailable until worksheet edits are saved. Human duplicate/warning confirmation then invokes verification.
4. Confirmed bill has exactly **one** linked Expense, the reviewed description and selected canonical supplier; no repeat confirm action. Its Record payment control opens the existing guarded payment dialog, with account/date/reference/amount and Confirm Payment. **Submission is intentionally not exercised**.
5. Open a named project from its existing card.
6. Home stock shortcut -> Warehouse -> explicit project issue dialog; no quantity is changed without the existing movement workflow.
7. Home Workbook shortcut -> edit a permitted existing project-name cell -> Save demo edits. This proves the existing demo worksheet draft save, **not canonical database persistence**.
8. Keyboard open More Tools, then navigate to an authorized advanced workflow. Mobile uses the existing focused drawer and touch controls. Add bill also opens its file chooser from keyboard Enter without uploading a file or calling an extraction provider.

## Visual triage

Each base route/state has exact route, viewport and geometry in the [manifest](evidence/ux-reset-1/manifest.json). Contact sheets cover the entire base-route inventory; individual screenshots retain full core-view readability. All judgments below are lead inspection of actual captures, not inferred from automated geometry.

| Route / state | Classification | Severity / task impact | Root cause and direction |
| --- | --- | --- | --- |
| Home, daily navigation | ACCEPTABLE | Previous P1 entry-point overload corrected | Six daily destinations, four permitted tasks first; compact actionable queue and counts; optional analysis disclosed |
| Bills & Payments register | ACCEPTABLE | Previous P1 hidden payment column corrected | Quiet source presentation and compact fixed table; payment/review state visible on laptop, cards on phone |
| Bill review / unresolved issues | ACCEPTABLE | Previous P1 horizontally displaced facts corrected | Original source beside short fact grids on desktop/laptop; source above editor on phone; clickable issue resolvers and secondary diagnostics |
| Bill confirmation/payment continuation | ACCEPTABLE | P1 workflow-discovery and unsafe unsaved-confirm risk corrected | Save-before-confirm, explicit duplicate warning, visible linked settlement after confirmation; permission/void/conflict restrictions retain source authority |
| Projects / exact project detail | ACCEPTABLE | P2 specialist financial density remains | Existing recognizable project cards and primary details remain; no financial or lifecycle redesign |
| Workbook / edited field | ACCEPTABLE | Existing deliberate dense editing surface | Five sheets only, protected state and real XLSX controls; phone field list remains usable. Ordinary edit proof is qualified as demo draft save |
| Warehouse / stock issue dialog | ACCEPTABLE | Previous P1 buried stock entry corrected | Large repeated metric cards replaced with compact counts; explicit assignment entry; balances still movement-derived |
| Documents | ACCEPTABLE | P2 specialized source variety | Library first, source-owner links, secondary filters and existing create/template workflows |
| Expenses | ACCEPTABLE | P2 specialized finance copy remains | Direct and supplier-linked records retain canonical owner and correction controls; secondary navigation keeps them available |
| Cash & Banking | DEEPER WORKFLOW REVIEW | P2 specialist source/reconciliation concepts | Preserve guarded accounting evidence; any future simplification must distinguish balance, payment and reconciliation truth |
| Procurement | NEEDS CORRECTION | P2 mobile metric density | Existing multimetric summary pushes the register down; future bounded polish should reduce summary tiles. Workflows remain reachable via More Tools |
| Equipment | NEEDS CORRECTION | P2 mobile first-view density | Five colored status tiles precede assets; future bounded polish should condense counts. No assignment/lifecycle behavior changed |
| Payroll | ACCEPTABLE | Privacy/consequential workflow | Current period and genuine next action are visible; no Home payroll warning added, approval/payment/finalized history retained |
| Reports | DEEPER WORKFLOW REVIEW | P2 derived-financial interpretation | Secondary analytics retain explicit source/FX caveats; future polish needs source-aware financial review |
| Email / SMS | DEEPER WORKFLOW REVIEW | Provider readiness, not a cosmetic PASS | Demo shows truthful connection/restriction state and reviewed compose; actual configured provider workflow was not certified |
| Settings | ACCEPTABLE | Administrative density | Secondary placement, appearance and template administration retain existing boundaries |
| Suppliers master | NEEDS CORRECTION | P2 phone master-register scanning | Wide maintenance table still scrolls within its surface; invoice resolver is usable independently. Future bounded maintenance/read-projection work is specified in UX-RESET-2 |
| Add bill / review queue | ACCEPTABLE | Everyday task discoverability | Upload has a keyboard/touch chooser; review queue uses actionable labels and routes to preserved source evidence |

There are no remaining P0/P1 blockers in the implemented daily-task boundary. P2 specialist findings are explicitly retained for later bounded hardening rather than deleting features or changing their source semantics. This phase does not claim app-wide redesign, hosted acceptance or universal workbook coverage.

## Curated captures

- [Desktop Home](evidence/ux-reset-1/desktop-dashboard.png), [1366x768 Home](evidence/ux-reset-1/laptop-dashboard.png), [390x844 Home](evidence/ux-reset-1/mobile-dashboard.png).
- [Laptop Bills & Payments](evidence/ux-reset-1/laptop-invoices.png), [source and fact review](evidence/ux-reset-1/laptop-bill-review.png), [resolved issues](evidence/ux-reset-1/laptop-issues-resolved.png).
- [Phone issue review](evidence/ux-reset-1/mobile-issues-resolved.png), [payment workflow](evidence/ux-reset-1/mobile-payment-workflow.png), [stock allocation](evidence/ux-reset-1/laptop-stock-allocation.png), [phone More Tools](evidence/ux-reset-1/mobile-more-tools.png).
- Whole-route visual inventory: [desktop 1](evidence/ux-reset-1/audit-desktop-1.jpg), [desktop 2](evidence/ux-reset-1/audit-desktop-2.jpg), [desktop 3](evidence/ux-reset-1/audit-desktop-3.jpg); [laptop 1](evidence/ux-reset-1/audit-laptop-1.jpg), [laptop 2](evidence/ux-reset-1/audit-laptop-2.jpg), [laptop 3](evidence/ux-reset-1/audit-laptop-3.jpg); [phone 1](evidence/ux-reset-1/audit-mobile-1.jpg), [phone 2](evidence/ux-reset-1/audit-mobile-2.jpg), [phone 3](evidence/ux-reset-1/audit-mobile-3.jpg).

[Inventory and authority decisions](UX-RESET-1-INVENTORY.md) and [planning-only workbook expansion](UX-RESET-2-WORKBOOK-SPEC.md) complete the handoff. The implementation PR remains unmerged; protected CI and subsequent hosted/deployment evidence remain distinct from this local record.
