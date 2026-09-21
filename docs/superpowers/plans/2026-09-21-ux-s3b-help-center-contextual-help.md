# UX-S3B — Help Center + Contextual Help Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the static `/help` Center, canonical topic registry, route-aware shared-header Help action, and accessible contextual-help primitive without starting UX-S3C/S3D or changing business authority.

**Architecture:** `src/help/helpCatalog.ts` is the single canonical content and route-topic registry. `src/assistant/helpCatalog.ts` becomes a compatibility adapter that preserves the Assistant's existing search/reference contract. `/help` is a dedicated known application location outside `AppTab` permissions; `HelpRoute` renders the searchable article/index surface. `PageHeader` renders one shared `HelpAction` resolved from the current route, and `ContextualHelp` owns click/tap, keyboard, focus-return, dismissal, and responsive popover behavior.

**Tech Stack:** React 19, TypeScript, existing Vite/history routing, Tailwind utility classes, lucide-react, Node `node:test` source/contract tests, existing `navigateInApp` helper, existing `PageHeader`/`AppShell`/`AppRouter` composition.

**Spec:** `docs/superpowers/specs/2026-09-21-ux-s3b-help-center-contextual-help-design.md`

## Global Constraints

- The governing rule is: **Show the task, data, state, and primary actions by default. Move education and secondary explanation behind consistent contextual help.**
- S3B is static repository-backed Help content; do not add a CMS, database table, migration, provider, or runtime AI help authoring system.
- Task-critical validation, stale/conflict, permission, provider, unresolved identity, financial/lifecycle, approval/payment/issue/receiving/reconciliation, and human-confirmation requirements remain visible inline.
- Preserve company isolation, RLS/RBAC, source ownership, financial truth, immutable history, provider truth, concurrency guards, and `prepare -> review -> human confirm -> execute` boundaries.
- Do not start UX-S3C mass visible-copy simplification, UX-S3D workflow redesign, Worker Registration, attendance expansion, Finance UX-W6, custom fields, broader Documents aggregation, or provider/production work.
- Use zero subagents; the lead implements and reviews the integrated branch.
- Use `npm.cmd`/`npx.cmd` in PowerShell; do not start Docker/Supabase for this UI-only change.
- Keep Assistant compatibility through the existing `src/assistant/helpCatalog.ts` exports and response shapes.

## Review Focus

- Unknown or malformed `/help?topic=` values must land on the index without silently selecting a different article; test `parseAppLocation` and Help route fallback.
- Adding Help must not create a new permission path or route denial; test `/help` with authenticated and browser-only route assumptions and inspect `App.tsx` permission guards.
- Route-aware `PageHeader` Help must render once per working header and must not render on the Help Center itself; test source contracts and direct current-path resolution.
- The popover must be usable without hover, close on Escape/outside pointer, return focus to its trigger, and remain bounded on narrow viewports; pin every behavior in a focused primitive contract test.
- Assistant search/get-topic results must keep stable IDs, legacy `details`, references, and existing route navigation paths while consuming only canonical topic content; retain the existing Assistant tests and add adapter assertions.

## File Map

- Create `src/help/helpCatalog.ts`: canonical topic/category/article model, content, search, route registry, stable topic paths, and route-default lookup.
- Modify `src/assistant/helpCatalog.ts`: compatibility adapter for the existing Assistant-facing entry shape and functions.
- Modify `src/utils/appRouteContracts.ts`, `src/utils/appRouting.ts`, and `src/utils/appRouteTarget.ts`: known `/help` location parsing, query helpers, and route dispatch.
- Create `src/components/help/HelpAction.tsx`: one secondary page-level Help link with internal navigation fallback.
- Create `src/components/help/HelpCenterPage.tsx`: search/category/index/article presentation.
- Create `src/app/routes/HelpRoute.tsx`: route adapter that reads `HelpLocation` state and passes navigation into the Help Center.
- Modify `src/app/routes/AppRouter.tsx`: lazy Help route dispatch before business route branches.
- Modify `src/components/ui/OperationsUI.tsx`: `PageHeader` Help action API and automatic current-route topic resolution with explicit hide/override support.
- Create `src/components/ui/ContextualHelp.tsx`: accessible popover primitive.
- Modify `src/app/App.tsx`, `src/app/AppShell.tsx`, and `src/components/Header.tsx`: Help location title, permission guard exclusion, shell context, and active-nav suppression.
- Modify `src/components/EmailComposePanel.tsx`, `src/app/routes/DocumentsRoute.tsx`, and `src/components/Settings.tsx`: three safe contextual-help exemplars with existing critical copy retained.
- Create/modify `tests/helpCatalog.test.ts`, `tests/helpRouting.test.ts`, `tests/contextualHelp.test.ts`, `tests/helpCenter.test.ts`, `tests/appRouting.test.ts`, and `tests/assistantHelpCatalog.test.ts`: focused model, route, Assistant, source-contract, and accessibility coverage.
- Modify `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md` and `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`: record actual S3B status, quantitative evidence, Jev no-candidate fallback, validation, and exact next phase only after acceptance is proven.

### Task 1: Canonical Help model, content, and Assistant adapter

**Files:**
- Create: `src/help/helpCatalog.ts`
- Modify: `src/assistant/helpCatalog.ts`
- Test: `tests/helpCatalog.test.ts`
- Test: `tests/assistantHelpCatalog.test.ts`

**Interfaces:**
- Produces `HelpTopicId`, `HelpCategoryId`, `HelpTopic`, `HelpArticle`, `HELP_TOPICS`, `HELP_CATEGORIES`, `HELP_ROUTE_REGISTRY`, `searchHelpTopics(query, options?)`, `getHelpTopic(value)`, `getDefaultHelpTopic(routeId)`, and `helpTopicPath(topicId?)`.
- Preserves `HelpEntryId`, `HelpCatalogEntry`, `HELP_CATALOG`, `searchHelpCatalog`, `getHelpEntry`, `helpEntryReference`, `helpEntryPath`, `getHelpResponse`, and `unknownHelpResponse` from `src/assistant/helpCatalog.ts`.

- [ ] **Step 1: Write failing canonical-model tests**

  Add tests that assert unique topic IDs, non-empty category labels, every `relatedTopicId` resolves, every route registry topic resolves, deterministic search ordering for `supplier invoice review`, `payroll import`, `cash settlement`, and `provider status`, stable `/help?topic=...` encoding, and a default topic for each current business `RouteId`.

  Add adapter assertions that the old Assistant search still returns `invoice-review`, `communications`, and `company-access`, that `details` remains present, and that references remain `{ type: "help", id, label }`.

- [ ] **Step 2: Run focused tests to verify the new contract fails**

  Run: `npx.cmd tsx --test tests/helpCatalog.test.ts tests/assistantHelpCatalog.test.ts`

  Expected: FAIL because the canonical module and new registry exports do not yet exist.

- [ ] **Step 3: Implement the canonical model and initial content**

  Move the existing topic data into `HELP_TOPICS` with user-task article fields. Add only high-value current topics: getting started, invoice extraction/review, project costing/lifecycle, procurement workbook review and RFQ/PO lifecycle, expenses/corrections, cash/banking/settlements, documents/version history, communications/provider status, payroll readiness/runs/imports, company access/permissions, warehouse/equipment, vendors, reports, and troubleshooting/worksheet tips. Keep source-vs-authority and human-confirmation constraints in article `important`/`recovery` fields. Freeze arrays/objects and use a deterministic category/topic order.

  Implement search using normalized terms and stable score/index tie-breaking. Implement `getDefaultHelpTopic(routeId)` from a finite registry rather than guessing by title. Implement `helpTopicPath` with `encodeURIComponent` and no user-controlled path segments.

  Replace the old catalog file's literal data with an adapter projection. The adapter may expose `details: topic.assistantDetails`, but must not duplicate article text or IDs. Preserve `helpEntryPath` as the existing business-route path helper for Assistant navigation; Help Center links use `helpTopicPath`.

- [ ] **Step 4: Run the focused tests to verify the model and adapter pass**

  Run: `npx.cmd tsx --test tests/helpCatalog.test.ts tests/assistantHelpCatalog.test.ts`

  Expected: PASS with all canonical uniqueness, route coverage, search, stable-link, and Assistant-compatibility assertions green.

- [ ] **Step 5: Commit the canonical contract**

  Run:

  ```powershell
  git add src/help/helpCatalog.ts src/assistant/helpCatalog.ts tests/helpCatalog.test.ts tests/assistantHelpCatalog.test.ts
  git commit -m "feat: establish canonical help topic registry"
  ```

### Task 2: Help location, deep-link parsing, and route dispatch

**Files:**
- Modify: `src/utils/appRouteContracts.ts`
- Modify: `src/utils/appRouting.ts`
- Modify: `src/utils/appRouteTarget.ts`
- Modify: `src/app/routes/AppRouter.tsx`
- Create: `src/app/routes/HelpRoute.tsx`
- Modify: `tests/appRouting.test.ts`
- Create: `tests/helpRouting.test.ts`

**Interfaces:**
- Produces `AppLocation` kind `help` with `{ kind: "help", pathname, search, topicId?, query? }`.
- Produces `appRouteTargetForLocation(helpLocation) === "help"` and `HelpRoute` props `{ search, onNavigatePath? }`.

- [ ] **Step 1: Write failing routing tests**

  Add assertions for `parseAppLocation("/help")`, `parseAppLocation("/help", "?topic=invoice-review")`, encoded topic IDs, and invalid/unknown topic query values. Assert `appRouteTargetForLocation` returns `help`, `/help` remains outside `isKnownWorkspaceLocation`, and `helpTopicPath` round-trips through the parser. Add a direct route-contract assertion for `/help` query keys `topic` and `q`.

- [ ] **Step 2: Run the routing tests to verify failure**

  Run: `npx.cmd tsx --test tests/helpRouting.test.ts tests/appRouting.test.ts`

  Expected: FAIL because `/help` currently resolves as an unknown workspace destination.

- [ ] **Step 3: Implement the known Help location and dispatcher**

  Add a Help route contract with no `routeId` and query keys `topic`/`q`. Parse `/help` before project/entity branches, preserve unknown raw topic only as an optional requested value for the Help index fallback, and do not route it through business permission checks. Update `appTabForLocation`, `isKnownWorkspaceLocation`, and affected App guards with explicit `help` handling rather than casting a fake business tab.

  Add `help` to `AppRouteTarget`, lazy-load `HelpRoute`, and dispatch it before business routes. `HelpRoute` must remain a thin route adapter and must not own content duplication.

- [ ] **Step 4: Run routing tests to verify pass**

  Run: `npx.cmd tsx --test tests/helpRouting.test.ts tests/appRouting.test.ts tests/navigationStability.test.ts`

  Expected: PASS with existing project/entity/deep-link assertions unchanged and new Help assertions green.

- [ ] **Step 5: Commit the route contract**

  Run:

  ```powershell
  git add src/utils/appRouteContracts.ts src/utils/appRouting.ts src/utils/appRouteTarget.ts src/app/routes/AppRouter.tsx src/app/routes/HelpRoute.tsx tests/appRouting.test.ts tests/helpRouting.test.ts
  git commit -m "feat: route the in-app help center"
  ```

### Task 3: Help Center search, categories, articles, and deep-link synchronization

**Files:**
- Create: `src/components/help/HelpCenterPage.tsx`
- Modify: `src/app/routes/HelpRoute.tsx`
- Test: `tests/helpCenter.test.ts`

**Interfaces:**
- Consumes canonical `HELP_TOPICS`, `HELP_CATEGORIES`, `getHelpTopic`, `searchHelpTopics`, `helpTopicPath`, and `HelpRoute` navigation.
- Produces search-first responsive Help Center markup with stable `data-help-*` markers for browser QA.

- [ ] **Step 1: Write failing Help Center contract tests**

  Add source/contract assertions for a search input with an accessible label, category navigation, Start here links, breadcrumb/article landmarks, topic links using `helpTopicPath`, a clear invalid-topic fallback, and responsive layout markers. Assert the selected article renders article fields rather than all topic bodies and that the Help header opts out of a second Help action.

- [ ] **Step 2: Run the Help Center tests to verify failure**

  Run: `npx.cmd tsx --test tests/helpCenter.test.ts`

  Expected: FAIL because the Help page presentation has not been created.

- [ ] **Step 3: Implement the Help Center surface**

  Build a compact `HelpCenterPage` with a `PageHeader` using `helpTopicId={null}`, a labelled search field, a short Start here row, responsive category/topic navigation, and one selected article. Use `button`/link semantics appropriate to index selection, keep query topic links stable, and update the selected topic through `onNavigatePath` with `helpTopicPath`. Show “topic not found” as a non-blocking index notice while preserving the user’s ability to search. Include purpose, numbered steps, important constraints, recovery guidance, related topic links, and a return-to-workspace link only when a known owning route exists.

  Keep visual chrome restrained: no article wall, no duplicate page-long instruction boxes, no new global navigation item, and no business mutation control. Make category and article lists usable on phone/tablet by stacking them and keeping article content in the main flow.

- [ ] **Step 4: Run focused Help Center tests**

  Run: `npx.cmd tsx --test tests/helpCenter.test.ts tests/helpRouting.test.ts`

  Expected: PASS with index/article/search/deep-link source contracts green.

- [ ] **Step 5: Commit the Help Center surface**

  Run:

  ```powershell
  git add src/components/help/HelpCenterPage.tsx src/app/routes/HelpRoute.tsx tests/helpCenter.test.ts
  git commit -m "feat: add searchable in-app help center"
  ```

### Task 4: Shared PageHeader Help action and shell behavior

**Files:**
- Create: `src/components/help/HelpAction.tsx`
- Modify: `src/components/ui/OperationsUI.tsx`
- Modify: `src/App.tsx`
- Modify: `src/app/AppShell.tsx`
- Modify: `src/components/Header.tsx`
- Test: `tests/helpRouting.test.ts`
- Test: `tests/headerNavigation.test.ts`

**Interfaces:**
- Produces `PageHeader` props `helpTopicId?: HelpTopicId | null` and `showHelp?: boolean` only if the explicit null/override API is needed by the implementation.
- `HelpAction` consumes `helpTopicPath`, `getDefaultHelpTopic`, `resolveRoute`, and `navigateInApp` and renders one accessible secondary link.

- [ ] **Step 1: Write failing shared-header tests**

  Add source assertions for a single `HelpAction` inside `PageHeader`, accessible text/name, stable topic-path use, current-route resolution, internal navigation fallback, and explicit Help Center opt-out. Add app-shell/header assertions that Help context has no active business route highlight and that Help is not permission-denied.

- [ ] **Step 2: Run the shared-header tests to verify failure**

  Run: `npx.cmd tsx --test tests/helpRouting.test.ts tests/headerNavigation.test.ts`

  Expected: FAIL because `PageHeader` and shell/header do not yet know the Help location.

- [ ] **Step 3: Implement the shared action and shell state**

  Add `HelpAction` once and append it to `PageHeader` actions after caller actions as a visually secondary outlined link. Resolve the current pathname with `resolveRoute`; use the canonical route registry, not route labels or ad hoc path checks. If no route topic exists, link to `/help` rather than inventing an article. The Help Center passes `helpTopicId={null}` or equivalent to avoid duplicate self-links.

  Update `App.tsx` title/auth-return/permission/route-recovery branches with explicit `help` cases. Pass `isHelpRoute` to `AppShell`; update `Header` context text and active route calculation so Help displays `Help Center` without making Dashboard appear selected. Preserve business route navigation and access checks exactly.

- [ ] **Step 4: Run shared-header and routing tests**

  Run: `npx.cmd tsx --test tests/helpRouting.test.ts tests/headerNavigation.test.ts tests/appRouting.test.ts tests/navigationStability.test.ts`

  Expected: PASS with all pre-existing navigation contracts intact.

- [ ] **Step 5: Commit the page-level action**

  Run:

  ```powershell
  git add src/components/help/HelpAction.tsx src/components/ui/OperationsUI.tsx src/App.tsx src/app/AppShell.tsx src/components/Header.tsx tests/helpRouting.test.ts tests/headerNavigation.test.ts
  git commit -m "feat: add route-aware page help action"
  ```

### Task 5: Accessible ContextualHelp primitive and three safe exemplars

**Files:**
- Create: `src/components/ui/ContextualHelp.tsx`
- Modify: `src/components/EmailComposePanel.tsx`
- Modify: `src/app/routes/DocumentsRoute.tsx`
- Modify: `src/components/Settings.tsx`
- Create: `tests/contextualHelp.test.ts`

**Interfaces:**
- Produces `ContextualHelp` props `{ label, title, children, articleTopicId?, align?, className? }`.
- The primitive exposes a native button trigger, `aria-expanded`, `aria-controls`, labelled popover content, optional article link, Escape/outside dismissal, and trigger focus return.

- [ ] **Step 1: Write failing primitive/exemplar tests**

  Add source assertions for a native button trigger, `aria-expanded`, generated IDs, `role="dialog"`, Escape listener, outside-pointer listener, trigger focus restoration, bounded `max-h`/viewport width classes, and optional `helpTopicPath` article link. Assert the three exemplar files import/use `ContextualHelp` and retain their current critical eligibility/ownership/settings copy.

- [ ] **Step 2: Run primitive tests to verify failure**

  Run: `npx.cmd tsx --test tests/contextualHelp.test.ts`

  Expected: FAIL because the primitive and exemplar usages do not exist.

- [ ] **Step 3: Implement the primitive**

  Use `useId`, `useRef`, and `useState`. Keep the trigger native so Enter/Space work automatically. On open, leave focus on the trigger; on Escape or close, restore trigger focus. Register document-level `pointerdown` only while open and close when neither wrapper nor trigger contains the event target. Use a non-trapping `role="dialog"` with `aria-labelledby`, a close button for touch users, bounded responsive width, and internal scrolling. Never require hover and do not use color alone as the explanation.

- [ ] **Step 4: Add safe representative usages**

  Add the primitive beside Email/SMS attachment eligibility, Documents ownership/origin filtering, and Settings regional terminology. Do not remove or demote current task-critical provider, permission, immutable-history, or capability-state copy; the examples only prove the reusable disclosure path for later S3C use.

- [ ] **Step 5: Run primitive/exemplar tests**

  Run: `npx.cmd tsx --test tests/contextualHelp.test.ts tests/helpCenter.test.ts`

  Expected: PASS with accessibility contract and all three safe usages present.

- [ ] **Step 6: Commit the contextual-help primitive**

  Run:

  ```powershell
  git add src/components/ui/ContextualHelp.tsx src/components/EmailComposePanel.tsx src/app/routes/DocumentsRoute.tsx src/components/Settings.tsx tests/contextualHelp.test.ts
  git commit -m "feat: add accessible contextual help primitive"
  ```

### Task 6: Integrated focused validation and docs synchronization

**Files:**
- Modify: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`
- Modify: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`
- Test: all S3B focused tests and Assistant/routing/shared-UI tests

- [ ] **Step 1: Review the complete integrated diff**

  Run: `git diff e5ae27c9c12ed0cab19902cd6cd53dc0626ed884...HEAD --stat` and `git diff e5ae27c9c12ed0cab19902cd6cd53dc0626ed884...HEAD`.

  Confirm only static Help, routing/shell/UI/test/docs files changed; no migrations, RLS/RPC, provider, secret, production, financial, lifecycle, or authority files slipped in.

- [ ] **Step 2: Run the focused S3B suite**

  Run: `npx.cmd tsx --test tests/helpCatalog.test.ts tests/helpRouting.test.ts tests/helpCenter.test.ts tests/contextualHelp.test.ts tests/assistantHelpCatalog.test.ts tests/appRouting.test.ts tests/headerNavigation.test.ts tests/navigationStability.test.ts`

  Expected: PASS, with stable topic IDs, all route defaults, Assistant compatibility, direct/unknown Help links, header action, and contextual primitive contracts green.

- [ ] **Step 3: Run the deterministic affected selector**

  Run: `npm.cmd run test:affected:agent`

  Expected: all selected tests pass; database fallback remains disabled and no full-suite claim is made unless the selector requires it.

- [ ] **Step 4: Run lint/typecheck and production build once on the integrated diff**

  Run: `npm.cmd run lint` then `npm.cmd run build`.

  Expected: ESLint, TypeScript, Vite production build, and server bundle pass.

- [ ] **Step 5: Run Workflow Map consistency because routing changed**

  Run: `npm.cmd run workflow-map:consistency`.

  Expected: pass or an explicitly documented generated-contract update limited to the new Help route.

- [ ] **Step 6: Perform targeted browser/Demo Visual QA**

  Inspect `/help` and `/help?topic=invoice-review` at desktop, constrained laptop, tablet, and phone; verify search/category/article navigation, refresh, browser back/forward, unknown-topic fallback, several route-level PageHeader Help links, popover click/touch, Escape/focus restoration, and no header/page overflow. If the local Playwright package is unavailable, record manual CUA inspection and leave automated browser evidence to exact-head CI; do not claim a missing automated PASS.

- [ ] **Step 7: Reconcile and update roadmap/handoff**

  Record exact implementation SHA/environment, canonical topic count and populated categories, route-default mapping count, three contextual exemplars, focused/affected/lint/build/Workflow Map/browser evidence, Jev start checkpoint as `0 deterministic candidates / no live request`, and explicit skipped DB/provider/production checks. Mark UX-S3B complete only if all acceptance criteria are met; set exact next phase to UX-S3C and preserve the hardening-first freeze.

- [ ] **Step 8: Run sanitized Jev completion/evidence checkpoint**

  Run the repository TypeSafe completion command once over sanitized evidence metadata if the live API is available. Record model, request count, tokens, latency, fallback, and any unresolved uncertainty. Jev is advisory only; deterministic diff/evidence review remains authoritative.

- [ ] **Step 9: Commit documentation synchronization**

  Run:

  ```powershell
  git add docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md docs/HYDROQUALISENSE_CURRENT_HANDOFF.md
  git commit -m "docs: record UX-S3B help foundation evidence"
  ```

### Task 7: Delivery review, push, and PR

- [ ] **Step 1: Verify final status and exact head**

  Run: `git status --short --branch; git log -1 --oneline; git diff origin/main...HEAD --check`.

  Expected: clean worktree, feature branch `codex/ux-s3b-help-center`, and no whitespace errors.

- [ ] **Step 2: Push the feature branch**

  Run: `git push -u origin codex/ux-s3b-help-center`.

- [ ] **Step 3: Open a PR against current `main`**

  Use the available repository PR mechanism and include: starting SHA; canonical Help model/Assistant adapter; `/help?topic=` routing; initial topic/category counts; route Help coverage; popover accessibility behavior; three exemplars; focused/affected/lint/build/Workflow Map/browser results; Jev diagnostics; skipped DB/provider/production checks; and explicit confirmation that UX-S3C/S3D were not started.

- [ ] **Step 4: Stop without merging**

  Attach the created PR artifact, report the PR URL and exact final head, and do not merge the implementation PR.
