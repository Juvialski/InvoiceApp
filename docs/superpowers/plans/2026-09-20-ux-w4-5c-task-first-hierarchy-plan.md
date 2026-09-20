# UX-W4.5C Task-First Hierarchy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder the bounded Projects, Expenses, Cash & Banking, Project Workspace, and Budget Control surfaces so primary records and deliberate actions appear before optional analysis, explanation, and workbook tools without changing domain authority.

**Architecture:** Keep existing parent-owned derivation, callbacks, permissions, lifecycle actions, settlement workflows, and worksheet persistence intact. Adjust JSX composition and add stable semantic surface markers so focused source-order tests can prove the hierarchy. Cash & Banking will receive the existing settlement workspace through an optional page-owned slot so its page identity and controls remain first while settlement moves ahead of secondary analytics.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind utility classes, Node test runner with `--experimental-strip-types`, existing demo visual-QA scenarios.

**Spec:** `docs/superpowers/specs/2026-09-20-worksheet-density-clarity-correction.md`

## Global Constraints

- **Primary work first:** title/primary action -> compact task controls -> primary records/working surface -> attention/exceptions -> secondary analysis -> optional tools/explanation.
- Preserve workbook import/export, portfolio metrics, filters, Compact List, source evidence, settlement/reconciliation, lifecycle actions, permissions, and financial semantics.
- Keep Project Contract Value, Approved Project Budget, Actual Cost, Committed Cost, original currency, and mixed-currency safeguards distinct.
- Cash & Banking remains purpose-built workflow UI; it does not become spreadsheet editing.
- Do not change database migrations, RLS/RPCs, provider behavior, production state, Supplier Invoice page hierarchy, or UX-W5 scope.
- Validate desktop, constrained laptop, tablet where materially different, and phone; no page-level horizontal overflow.

## Review Focus

- A later JSX wrapper must not reintroduce Projects workbook/portfolio content before the filters and first card row.
- Expenses must keep selected-record detail, supplier-document follow-up, correction, FX, payment, and workbook capabilities reachable exactly once after the register.
- Cash settlement must render once through the existing authorized callbacks, remain semantically distinct from ledger/reconciliation evidence, and not appear before page identity.
- Project Workspace overview must expose one attention region without duplicating it or hiding lifecycle/financial warnings.
- Budget Control must keep the cost-code worksheet before secondary warning/detail blocks while retaining every authoritative financial label and mixed-currency warning.

---

### Task 1: Projects card-first hierarchy

**Files:**
- Modify: `src/components/projects/ProjectsPage.tsx`
- Modify: `src/components/projects/ProjectPortfolioRegisterSection.tsx`
- Test: `tests/uiUxResponsive.test.ts`

**Interfaces:**
- Consumes: existing `ProjectPortfolioRegisterSectionProps`, parent-owned workbook callbacks, filters, view derivation, and lifecycle callbacks.
- Produces: stable `data-ux45c` markers for the Projects toolbar, cards/list working region, secondary portfolio content, and workbook disclosure.

- [ ] **Step 1: Write the failing hierarchy tests**

  Add source-order assertions that require the Projects toolbar before the cards/list region, the cards/list region before portfolio snapshot, and the page register before the workbook disclosure. Assert that `Compact List`, workbook, attention/filter controls, and project-card activation remain present.

- [ ] **Step 2: Run the focused test and verify RED**

  Run `npx.cmd tsx --test tests/uiUxResponsive.test.ts`.

  Expected: the new Projects hierarchy assertions fail because the current source renders the workbook disclosure and portfolio snapshot before the working controls/cards and has no new markers.

- [ ] **Step 3: Implement the minimum Projects reorder**

  Keep `PageHeader`, loading, tax/cost-data exception states, callbacks, and financial derivation unchanged. Move the `ProjectsWorkbookPanel` disclosure below `ProjectPortfolioRegisterSection`. Inside the register, put search/status/more-filters/sort/view controls in one compact toolbar, render cards/list immediately after it, and move portfolio snapshot/financial totals after the working region. Remove only redundant explanatory wrapper copy; retain Compact List and all filters/actions.

- [ ] **Step 4: Run the focused test and verify GREEN**

  Run `npx.cmd tsx --test tests/uiUxResponsive.test.ts` and confirm the full file passes.

- [ ] **Step 5: Commit**

  `git add src/components/projects/ProjectsPage.tsx src/components/projects/ProjectPortfolioRegisterSection.tsx tests/uiUxResponsive.test.ts && git commit -m "fix: make Projects portfolio task-first"`

---

### Task 2: Expenses register-first hierarchy

**Files:**
- Modify: `src/components/expenses/ExpensesPage.tsx`
- Test: `tests/uiUxResponsive.test.ts`

**Interfaces:**
- Consumes: existing Expense register/card/grid, selected Expense detail, supplier-document sections, workbook panel, lifecycle/correction/FX callbacks, and permissions.
- Produces: stable `data-ux45c` markers for Expense controls/register, selected detail, attention/supporting context, and workbook tools.

- [ ] **Step 1: Write the failing hierarchy tests**

  Add assertions that require the Expense controls/register before selected detail, supplier-document follow-up, summary/attention content, and workbook tools. Assert `Add expense`, direct draft editing, correction, settlement/source links, FX handling, and supplier invoice relationship strings remain present.

- [ ] **Step 2: Run the focused test and verify RED**

  Run `npx.cmd tsx --test tests/uiUxResponsive.test.ts`.

  Expected: the new Expenses assertions fail because the workbook, selected detail, and metric summary currently precede the register.

- [ ] **Step 3: Implement the minimum Expenses reorder**

  Render the PageHeader, register filters, and register/cards first. Place link errors and selected Expense detail after the register, then supplier-document follow-up and attention summary. Move the workbook panel to the final optional-tools position and keep its proposal-only Apply contract unchanged. Do not convert payment, settlement, correction, or FX actions into cells or alter Expense authority.

- [ ] **Step 4: Run the focused test and verify GREEN**

  Run `npx.cmd tsx --test tests/uiUxResponsive.test.ts tests/expensesRegisterGrid.test.tsx tests/expenseDraftWorksheet.test.tsx tests/expensesWorkbookUx.test.tsx`.

- [ ] **Step 5: Commit**

  `git add src/components/expenses/ExpensesPage.tsx tests/uiUxResponsive.test.ts && git commit -m "fix: put Expense register before supporting tools"`

---

### Task 3: Cash transaction and settlement hierarchy

**Files:**
- Modify: `src/components/CashBankingPage.tsx`
- Modify: `src/app/routes/CashBankingRoute.tsx`
- Modify: `tests/uiUxResponsive.test.ts`
- Test: existing `tests/cashBanking.test.ts`, `tests/coreHardeningWave2B3CashCorrections.test.ts`, `tests/clientCollectionSettlement.test.ts`

**Interfaces:**
- Consumes: existing `CashBankingPageProps` and `CashSettlementAllocationWorkspace` props/callbacks.
- Produces: optional page-owned settlement slot and stable `data-ux45c` markers for cash controls, transaction ledger, settlement, attention, and secondary summary.

- [ ] **Step 1: Write the failing hierarchy tests**

  Add assertions that require page identity and cash controls before the transaction ledger/settlement working region, and that require the working region before summary/analytics sections. Assert route composition mounts the settlement workspace through the page slot exactly once and preserves the existing settlement/reconciliation callback names.

- [ ] **Step 2: Run the focused test and verify RED**

  Run `npx.cmd tsx --test tests/uiUxResponsive.test.ts`.

  Expected: the new markers/order assertions fail against the current summary-first page and route-level settlement placement.

- [ ] **Step 3: Implement the minimum Cash reorder**

  Add an optional `primarySettlementWorkspace?: React.ReactNode` prop. In the route, create the existing `CashSettlementAllocationWorkspace` once and pass it into the page. In the page, keep PageHeader, target context, notice, account/currency controls, account selection, and transaction ledger before the settlement slot; move summary cards and other explanatory/analytical blocks after the working surface. Preserve account, transaction, import, reconciliation, settlement, reversal, and target permission callbacks without changing their behavior.

- [ ] **Step 4: Run the focused cash tests and verify GREEN**

  Run `npx.cmd tsx --test tests/uiUxResponsive.test.ts tests/cashBanking.test.ts tests/coreHardeningWave2B3CashCorrections.test.ts tests/clientCollectionSettlement.test.ts`.

- [ ] **Step 5: Commit**

  `git add src/components/CashBankingPage.tsx src/app/routes/CashBankingRoute.tsx tests/uiUxResponsive.test.ts && git commit -m "fix: prioritize Cash transaction and settlement work"`

---

### Task 4: Project Workspace overview and Budget Control working order

**Files:**
- Modify: `src/components/projects/ProjectOverview.tsx`
- Modify: `src/components/projects/ProjectBudgetControlPanel.tsx`
- Modify: `src/components/projects/ProjectWorkspace.tsx`
- Test: `tests/uiUxResponsive.test.ts`
- Test: `tests/projectWorkspaceNavigation.test.ts`, `tests/projectWorkspaceVisibility.test.ts`, `tests/projectOverviewFinancialTruth.test.ts`, `tests/projectCostCodesAndBudgetControl.test.ts`

**Interfaces:**
- Consumes: existing tab navigation, Project Overview attention/financial derivation, Cost Code worksheet callbacks, and budget-control warnings.
- Produces: stable `data-ux45c` markers for active workspace content, overview attention, budget summary, and cost-code working surface.

- [ ] **Step 1: Write the failing hierarchy tests**

  Add assertions that project identity/tab navigation precede active content, overview attention precedes secondary analytics/engineering summaries without duplication, and Budget Control summary precedes the cost-code worksheet while the worksheet precedes warning/detail blocks. Assert the existing tab labels, financial labels, and authority/worksheet callbacks remain in source.

- [ ] **Step 2: Run the focused test and verify RED**

  Run `npx.cmd tsx --test tests/uiUxResponsive.test.ts`.

  Expected: the new ordering assertions fail against the current late attention panel and warning-before-worksheet Budget Control order.

- [ ] **Step 3: Implement the minimum workspace/budget reorder**

  Keep Project Workspace identity and tab navigation stable, add only semantic markers, move the single Management Attention panel into the immediate overview working flow, and keep analytics/details disclosed after primary financial/work-package content. In `ProjectBudgetControlPanel`, keep the compact authoritative summary first, render the cost-code worksheet next, then render uncoded/payroll/mixed-currency attention blocks. Preserve all labels, warnings, permissions, row operations, and lifecycle actions.

- [ ] **Step 4: Run focused workspace/budget tests and verify GREEN**

  Run `npx.cmd tsx --test tests/uiUxResponsive.test.ts tests/projectWorkspaceNavigation.test.ts tests/projectWorkspaceVisibility.test.ts tests/projectOverviewFinancialTruth.test.ts tests/projectCostCodesAndBudgetControl.test.ts`.

- [ ] **Step 5: Commit**

  `git add src/components/projects/ProjectOverview.tsx src/components/projects/ProjectBudgetControlPanel.tsx src/components/projects/ProjectWorkspace.tsx tests/uiUxResponsive.test.ts && git commit -m "fix: clarify project workspace task hierarchy"`

---

### Task 5: Integrated validation, visual evidence, and handoff synchronization

**Files:**
- Modify: `artifacts/ui-ux-audit/UX-W4.5A-REPORT.md`
- Modify: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`
- Modify: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`
- Review: all implementation files and the complete final diff

- [ ] **Step 1: Run the integrated focused suite**

  Run the focused hierarchy/domain commands from Tasks 1–4, then run `npm.cmd run test:affected:agent`. Read the complete result and classify any baseline or unrelated failures without claiming success for them.

- [ ] **Step 2: Run relevant lint/build checks**

  Run `npm.cmd run lint:eslint`, `npm.cmd run typecheck`, and `npm.cmd run build` because this slice changes multiple React/route compositions. Do not start Docker/Supabase; the final diff is expected to be UI-only.

- [ ] **Step 3: Capture and inspect targeted visual evidence**

  Use the existing demo visual-QA path where available and inspect screenshots for Projects desktop/laptop/phone, Expenses desktop plus laptop/phone, Cash desktop plus tablet/phone, Project Workspace desktop/laptop, and Budget Control desktop/laptop/phone where materially different. Judge primary-content position, action discoverability, secondary-tool dominance, chrome-to-work ratio, hidden important content, responsive usefulness, and horizontal overflow. Record exact final SHA/environment/viewport/route/state and disposition in the existing audit structure; do not claim evidence that was unavailable.

- [ ] **Step 4: Synchronize roadmap, handoff, and finding disposition**

  Reconcile the final behavior and evidence with the roadmap and handoff. Record UX45A-001 as resolved only if all three register surfaces are genuinely task-first; record UX45A-005, UX45A-008, and UX45A-009 only for the bounded Project Workspace/Budget/Cash/Expenses improvements actually evidenced. Keep UX45A-004 deferred, do not claim UX-W4.5D or UX-W5 complete, and identify UX-W4.5D as next if the live state agrees.

- [ ] **Step 5: Final review, commit, push, and PR**

  Review the complete diff, run the final focused and affected commands again as required by the verification skill, commit documentation/evidence synchronization, push `codex/ux-w4-5c-task-first-hierarchy`, and open a PR into `main`. Do not merge the PR.

