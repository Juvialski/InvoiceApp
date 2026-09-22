# UX-S3E Accessibility Responsive Visual Closeout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Certify the existing HydroQualiSense UI across the required viewports and interaction methods, repair the stale recovery evidence and any concrete shared interaction defect found, and deliver a truthful S3E closeout.

**Architecture:** Reuse the existing structured Demo Visual QA catalog and shared UI contracts. Keep product source changes evidence-driven; the known correction is in the QA scenario layer so missing-record recovery scenarios target IDs absent from the deterministic demo fixture. Add keyboard/focus assertions to existing representative navigation, contextual-help, and worksheet-dialog scenarios rather than creating a second browser harness.

**Tech Stack:** React 19, TypeScript/TSX, Tailwind-style class names, Node test runner, Playwright-backed Demo Visual QA, PowerShell on Windows, Markdown evidence/roadmap documents.

**Spec:** `docs/superpowers/specs/2026-09-21-ui-simplification-contextual-help-research.md`, `docs/superpowers/specs/2026-09-20-worksheet-density-clarity-correction.md`, and the UX-S3E implementation brief supplied for this task.

## Global Constraints

- Product freeze remains active: no Worker Registration, attendance/face-recognition, Finance UX-W6, custom fields, broad Documents aggregation, provider work, database work, or new product domain.
- Preserve the governing interaction grammar: browse visually -> edit like a spreadsheet -> execute sensitive workflows deliberately.
- Preserve permissions, lifecycle authority, financial/source truth, history, provenance, concurrency, review-before-Apply, payroll freshness/approval, PO receipt/close guards, Cash confirmation, Supplier Invoice -> Expense authority, and immutable document history.
- Use the existing QA viewports exactly: desktop `1440x1000`, laptop `1366x768`, tablet `768x1024`, phone `390x844`.
- Automated no-overflow/console PASS is not visual certification; manually inspect representative rendered screenshots and focused keyboard states.
- Local/demo evidence is not hosted QA, provider certification, production readiness, WCAG certification, or authenticated customer evidence.
- Do not start Docker/Supabase because this phase is UI/application/browser-only unless the final diff unexpectedly changes a database contract.

## Review Focus

- A missing-record recovery scenario must use an ID absent from the seeded demo data and expose the return-to-register control instead of silently exercising a populated detail state.
- Keyboard activation of mobile navigation must place focus inside the drawer and Escape must close it and restore focus to the opener.
- Contextual Help must open from keyboard activation, remain a non-modal popover (`aria-modal="false"`), and restore focus to its trigger on Escape.
- Data-heavy RFQ/PO dialogs must enter on their close/action control, keep actions reachable on phone, and restore focus to the opener after Escape.
- The final evidence must distinguish a route/state that is visually acceptable from a route/state that remains unverified because safe demo fixtures do not populate it.

---

### Task 1: Harden structured accessibility evidence and deterministic recovery coverage

**Files:**
- Modify: `scripts/qa/structuredEvidence.ts:45-74` to expose keyboard activation on QA locators.
- Modify: `scripts/qa/demoScenarios.ts:363-410,578-583,1019-1056,1123-1125,1192-1193` for keyboard/focus assertions and missing-fixture IDs.
- Modify: `tests/demoQaRouteCoverage.test.ts:47-end` with regression assertions for the S3E scenario contract.

**Interfaces:**
- Consumes: `QaBrowserLocator` and `QaBrowserPage` from `scripts/qa/structuredEvidence.ts`, the existing `DEMO_QA_SCENARIOS` catalog, and current demo fixture IDs in `src/demo/data/engineeringCoordination.ts`.
- Produces: QA locators with `press(key: string): Promise<void>`; deterministic RFI/Submittal recovery scenarios whose query IDs are `demo-rfi-missing-s3e` and `demo-sub-missing-s3e`; and representative assertions named `mobile-navigation-focus-entered`, `mobile-navigation-focus-restored`, `contextual-help-keyboard-opened`, `rfq-dialog-focus-entered`, `rfq-dialog-focus-restored`, `po-dialog-focus-entered`, and `po-dialog-focus-restored`.

- [ ] **Step 1: Write the failing regression tests**

Add focused assertions to `tests/demoQaRouteCoverage.test.ts`:

```ts
test("S3E demo evidence targets deterministic missing records and shared keyboard/focus states", () => {
  const scenariosSource = readFileSync(new URL("../scripts/qa/demoScenarios.ts", import.meta.url), "utf8");
  const rfi = DEMO_QA_SCENARIOS.find((scenario) => scenario.route.id === "rfi-detail");
  const submittal = DEMO_QA_SCENARIOS.find((scenario) => scenario.route.id === "submittal-detail");

  assert.ok(rfi?.path.includes("rfiId=demo-rfi-missing-s3e"));
  assert.ok(submittal?.path.includes("submittalId=demo-sub-missing-s3e"));
  assert.match(scenariosSource, /\.press\("Enter"\)/);
  assert.match(scenariosSource, /mobile-navigation-focus-restored/);
  assert.match(scenariosSource, /contextual-help-keyboard-opened/);
  assert.match(scenariosSource, /po-dialog-focus-restored/);
});
```

- [ ] **Step 2: Run the focused tests and verify the intended RED result**

Run:

```powershell
npx.cmd tsx --test tests/demoQaRouteCoverage.test.ts
```

Expected: FAIL because the current scenarios still target populated `demo-rfi-wh-001` / `demo-sub-wh-014` records and do not contain the new S3E focus assertions.

- [ ] **Step 3: Implement the minimal evidence changes**

Make the following bounded changes:

```ts
// structuredEvidence.ts
press(key: string): Promise<void>;

// demoScenarios.ts
await page.getByRole("button", { name: "Open navigation", exact: true }).press("Enter");
const focusedAfterOpen = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || "");
await page.keyboard.press("Escape");
const focusedAfterClose = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") || "");

// deterministic recovery paths
path: `\${PROJECT_ROOT}/rfis?rfiId=demo-rfi-missing-s3e`
path: `\${PROJECT_ROOT}/submittals?submittalId=demo-sub-missing-s3e&roundId=demo-round-missing-s3e`
```

Use `trigger.press("Enter")` for contextual Help, assert the dialog's `aria-modal` value is `false`, and assert the trigger regains focus after Escape. In the existing RFQ/PO worksheet action, capture the active element after opening each dialog, close with Escape, and assert the opener regains focus before continuing. Keep the existing workflow assertions and do not add mutations or fixture records.

- [ ] **Step 4: Run focused tests and the local production-preview evidence gate**

Run:

```powershell
npx.cmd tsx --test tests/demoQaRouteCoverage.test.ts tests/structuredBrowserEvidence.test.ts tests/contextualHelp.test.ts tests/uiHardeningShared.test.ts tests/uiUxResponsive.test.ts
$env:DEMO_QA_BASE_URL = "http://127.0.0.1:3000"
$env:DEMO_QA_OUTPUT_DIR = "artifacts/demo-visual-qa-ux-s3e-final"
npm.cmd run qa:demo
```

Expected: focused tests PASS; the final catalog completes with zero failed scenarios, zero console/page/request failures, and zero overflow failures across the four viewport definitions. Read the manifest and inspect representative final screenshots before treating the task as complete.

- [ ] **Step 5: Commit the evidence-harness correction**

```powershell
git add scripts/qa/structuredEvidence.ts scripts/qa/demoScenarios.ts tests/demoQaRouteCoverage.test.ts
git commit -m "test: strengthen UX-S3E browser accessibility evidence"
```

### Task 2: Produce the durable S3E certification and synchronize product truth

**Files:**
- Create: `artifacts/ui-ux-audit/UX-S3E-ACCESSIBILITY-RESPONSIVE-VISUAL-CERTIFICATION.md`.
- Modify: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md` in the current UX-S3 sequence and latest handoff sections.
- Modify: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md` in the latest UX-S3 sequence and current-state sections.

**Interfaces:**
- Consumes: the exact final branch SHA, final Demo Visual QA manifest/screenshots, focused/affected/lint/build results, manual CUA/Playwright keyboard evidence, and the prior UX-W4.5A / S3A reports.
- Produces: a sanitized exact-revision evidence report that records UX-S3E as complete for its defined local/demo certification scope, preserves non-claims and fixture limitations, and reconciles stale wording that still calls Payroll the unfinished S3D slice.

- [ ] **Step 1: Write the report and documentation updates**

The report must include the starting SHA `935c9083f08ffbda940cf3456f85b14938adf23a`, final branch SHA, environment/mode, viewport matrix, route/state families inspected, screenshot references, keyboard/focus checks, visual classifications, concrete evidence correction, regression coverage, exact commands/results, Jev context fallback (`no-candidates`, zero live requests), TypeSafe live-doc access limitation, Docker/Supabase non-applicability, and explicit non-claims. Use summarized route families and representative screenshot IDs; do not commit raw logs or sensitive data.

Update both roadmap and handoff so they state:

- UX-S3D Supplier Invoice, Cash settlement, Procurement lifecycle, and Payroll normal-cycle slices are complete for their recorded scopes;
- UX-S3E accessibility/responsive/visual certification is complete for its defined local/demo evidence scope;
- remaining limitations are evidence/fixture or hosted/provider/production boundaries, not an unfinished Payroll slice;
- no new feature domain was started and the product freeze/deferred backlog remains unchanged.

- [ ] **Step 2: Run final source and consistency checks**

Run:

```powershell
npm.cmd run test:affected:agent
npm.cmd run lint
npm.cmd run build
npm.cmd run workflow-map:consistency
git diff --check
git status --short
```

Expected: all applicable checks pass; no migration/RLS/RPC/database work is required; build warnings, if any, are recorded exactly and not misreported as failures; the final diff contains only the evidence harness, certification report, and roadmap/handoff synchronization.

- [ ] **Step 3: Review the final rendered evidence and exact diff**

Manually inspect the final manifest and representative screenshots at all four viewports, including Projects, Help, contextual Help, mobile navigation, Project/worksheet, Supplier Invoice, Cash result, Procurement dialog, Payroll handoff, Documents, Email/SMS, and recovery states. Re-check the three-question test on major pages and record ACCEPTABLE / NEEDS CORRECTION / DEEPER WORKFLOW REVIEW with limitations.

- [ ] **Step 4: Commit documentation and evidence**

```powershell
git add artifacts/ui-ux-audit/UX-S3E-ACCESSIBILITY-RESPONSIVE-VISUAL-CERTIFICATION.md docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md docs/HYDROQUALISENSE_CURRENT_HANDOFF.md
git commit -m "docs: close out UX-S3E certification"
```

- [ ] **Step 5: Push and open the focused PR**

```powershell
git push -u origin codex/ux-s3e-accessibility-responsive-visual-closeout
gh pr create --base main --head codex/ux-s3e-accessibility-responsive-visual-closeout --title "UX-S3E: certify accessibility responsive and visual UX" --body-file .superpowers/sdd/2026-09-22-ux-s3e-accessibility-responsive-visual-closeout/pr-body.md
```

The PR body must summarize inspected surfaces, evidence correction, keyboard/focus results, four-viewport results, final Demo Visual QA, tests/build/lint, Jev fallback, Docker/Supabase applicability, and known limitations. Do not merge the PR.
