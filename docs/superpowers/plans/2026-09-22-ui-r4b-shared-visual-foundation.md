# UI-R4B Shared Visual Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the existing Astryx light/dark token system, create a shared action/filter grammar, and prove it on the Projects portfolio without starting the R4C Dashboard or Project-card redesign.

**Architecture:** Keep the existing `@astryxdesign/core` theme and components as the only design-system source. A small `themePreference` module owns the browser-only System/Light/Dark preference, while the HTML entry bootstrap prevents a first-paint flash and the React provider exposes the same preference to Settings. Shared presentation primitives in `OperationsUI.tsx`, `OperationsGrid.tsx`, `WorksheetEditor.tsx`, the shell, and the new `CompactActionBar` use existing Astryx CSS variables; Projects remains parent-owned for filtering, sorting, permissions, lifecycle, and financial truth.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, `@astryxdesign/core`, Lucide icons, Node test runner with `tsx` for focused TSX/source-contract tests, local production preview and CUA browser inspection.

**Spec:** `docs/superpowers/specs/2026-09-22-ui-r4-professional-design-blueprint.md`

## Global Constraints

- Implement exactly `System`, `Light`, and `Dark`; System is the default and follows `prefers-color-scheme` through the existing paired Astryx tokens.
- Persist the presentation preference locally only; do not add a database setting, migration, storage bucket, RLS policy, or company preference.
- Preserve the four semantic surface levels: canvas, primary working surface, raised/supporting surface, and exceptional semantic surface.
- Preserve existing financial, permission, lifecycle, provenance, history, concurrency, and review-before-Apply authority; this is presentation/shared interaction infrastructure.
- Keep one dominant primary action per region; use secondary, ghost/tertiary, destructive, and labelled icon-only treatments consistently.
- Keep Projects filtering and sorting semantics parent-owned; the shared filter primitive only changes presentation and disclosure.
- Keep advanced filters keyboard/touch accessible, Escape-dismissable, and focus-restoring; never put task-critical state only in hover.
- Prove the shared foundation on Projects only; do not redesign Home, Project cards, Operations Insights, entity media, or other R4C-R4E scope.
- Do not run Docker/Supabase for this UI-only phase.
- Use zero subagents and stop after the R4B PR is open; do not merge the PR.

## Review Focus

- **Initial paint and System resolution:** a stored Dark preference must set `html[data-theme="dark"]` before app paint, while System must remove the explicit attribute and leave `light-dark()` to the OS. Test `themePreference` serialization, resolution, and entry bootstrap source.
- **Browser storage failure:** blocked or malformed local storage must fall back to System without throwing. Test read/write helpers with missing and invalid storage values.
- **Advanced-filter keyboard behavior:** opening the filter disclosure must expose a labelled panel, Escape must close it, and focus must return to the trigger. Test the source contract and focus-handling implementation.
- **Active-filter count and reset:** `ALL`, blank, null, and undefined values are inactive; meaningful status/manager/currency/health/attention values count and Clear all calls the existing parent reset. Test the pure count model and Projects wiring.
- **Theme parity for shared roots:** body, shell header, page header, cards, inputs, popovers, grids, and worksheet chrome must use semantic variables rather than structural light-only fills. Test the shared CSS/source contracts and inspect Light/Dark screenshots.

### Task 1: Theme preference model and first-paint bootstrap

**Files:**
- Create: `src/ui/themePreference.ts`
- Modify: `src/ui/HydroqualisenseThemeProvider.tsx`
- Modify: `src/main.tsx`
- Modify: `index.html`
- Test: `tests/themePreference.test.ts`
- Update: `tests/uiFoundation.test.ts`

**Interfaces:**
- Produces `ThemePreference = "system" | "light" | "dark"`, `THEME_PREFERENCE_STORAGE_KEY`, `normalizeThemePreference`, `readThemePreference`, `writeThemePreference`, `applyThemePreference`, and `useThemePreference`.
- `HydroqualisenseThemeProvider` passes the resolved preference to Astryx as its `mode`, defaults to System, applies changes to `document.documentElement`, and exposes `{ preference, setPreference }` through the hook.
- The synchronous `index.html` bootstrap reads the same key and only sets `data-theme` for explicit Light/Dark values; System removes the attribute.

- [ ] **Step 1: Write the failing theme tests.**

  Add tests that assert:

  ```ts
  assert.equal(normalizeThemePreference("light"), "light");
  assert.equal(normalizeThemePreference("dark"), "dark");
  assert.equal(normalizeThemePreference("unexpected"), "system");
  assert.equal(readThemePreference(memoryStorage({})), "system");
  assert.equal(readThemePreference(memoryStorage({ [THEME_PREFERENCE_STORAGE_KEY]: "dark" })), "dark");
  applyThemePreference("light", root);
  assert.equal(root.theme, "light");
  applyThemePreference("system", root);
  assert.equal(root.theme, undefined);
  assert.match(read("index.html"), /hydroqualisense_theme_preference/);
  assert.match(read("index.html"), /data-theme/);
  ```

  Use a tiny in-test memory storage and a root spy with `setAttribute`/`removeAttribute`; do not require a browser DOM.

- [ ] **Step 2: Run the focused test to verify the expected RED failure.**

  Run: `npx.cmd tsx --test tests/themePreference.test.ts`

  Expected: FAIL because the preference module and bootstrap contract do not yet exist.

- [ ] **Step 3: Implement the minimal preference model and provider integration.**

  Keep storage access inside `try/catch`, normalize every unknown stored value to System, write only the three allowed values, and make `applyThemePreference("system")` remove `data-theme`. Use `useLayoutEffect` for the React synchronization so a runtime preference change is applied before the next paint; the HTML bootstrap remains responsible for startup before React executes. Keep the existing generated `src/ui/hydroqualisense.js` import and `Theme` ownership unchanged.

- [ ] **Step 4: Add the synchronous entry bootstrap and update root fallback styling.**

  Place the small guarded bootstrap before `/src/main.tsx` in `index.html`. In `main.tsx`, keep the single root `HydroqualisenseThemeProvider` and change the Suspense fallback to semantic canvas/text classes so it is not a forced light surface.

- [ ] **Step 5: Run the focused tests and the existing UI foundation tests.**

  Run: `npx.cmd tsx --test tests/themePreference.test.ts tests/uiFoundation.test.ts`

  Expected: PASS with System as the default, explicit Light/Dark attribute behavior, malformed-storage fallback, and the existing Astryx ownership checks intact.

### Task 2: Semantic shared surfaces and action hierarchy

**Files:**
- Modify: `src/index.css`
- Modify: `src/app/AppShell.tsx`
- Modify: `src/components/Header.tsx`
- Modify: `src/components/ui/OperationsUI.tsx`
- Modify: `src/components/ui/OperationsGrid.tsx`
- Modify: `src/components/ui/ContextualHelp.tsx`
- Modify: `src/components/ui/WorksheetTabs.tsx`
- Modify: `src/components/ui/WorksheetEditor.tsx`
- Modify: `src/components/Settings.tsx`
- Create: `src/components/ui/ThemePreferenceSettings.tsx`
- Test: `tests/uiFoundation.test.ts`
- Test: `tests/uiSharedSurfaceContracts.test.ts`

**Interfaces:**
- Produces semantic CSS classes backed only by existing Astryx variables: `hqs-app-canvas`, `hqs-surface`, `hqs-surface-raised`, `hqs-surface-muted`, `hqs-popover`, `hqs-control`, `hqs-primary-text`, `hqs-secondary-text`, `hqs-border`, `hqs-focus-ring`, semantic exceptional surfaces, and action-control classes.
- Produces `ActionButton`, typed from Astryx `ButtonProps`, with variants `primary`, `secondary`, `ghost`, and `destructive`; it delegates rendering to Astryx `Button` and does not create a second component library.
- Produces `ThemePreferenceSettings`, which uses `useThemePreference` and exposes three labelled radio choices: System, Light, and Dark.

- [ ] **Step 1: Write failing semantic-contract tests.**

  Add source/CSS assertions that `index.css` no longer forces `color-scheme: light`, defines the semantic classes from existing `--color-*` variables, the shell uses `hqs-app-canvas`, the provider exposes `useThemePreference`, Settings renders all three labels, and shared grids/worksheets/popovers no longer use structural `bg-white`/`bg-slate-50` fills at their root surfaces.

- [ ] **Step 2: Run the focused contract tests to verify RED.**

  Run: `npx.cmd tsx --test tests/uiSharedSurfaceContracts.test.ts`

  Expected: FAIL on the missing semantic classes/provider hook and the existing light-only source matches.

- [ ] **Step 3: Add the semantic CSS layer.**

  Replace the global light-only root/body values with `color-scheme: light dark`, `light-dark()` fallbacks, and existing Astryx variables. Add the semantic surface, text, control, focus, exceptional-state, table, and worksheet classes. Keep status colors meaningful; use `--color-error-muted`, `--color-warning-muted`, `--color-accent-muted`, `--color-border`, and `--color-text-*` rather than introducing a new palette. Preserve reduced-motion rules and existing worksheet density rules.

- [ ] **Step 4: Migrate shared roots and common controls.**

  Change AppShell/header canvas and header popover surfaces, `Surface`/`PageHeader`/`SectionHeader`/`FilterBar`/`DisclosureSection`/`MetricCard`/`Notice`/loading/error primitives, OperationsGrid, ContextualHelp, WorksheetTabs, and WorksheetEditor chrome to semantic classes. Keep warnings, errors, success, selected, editing, dirty, and protected states explicit and distinguishable. Migrate Settings’ visible regional/template surfaces and use `ThemePreferenceSettings`; do not change Settings’ persistence or company-access behavior.

- [ ] **Step 5: Add and use the Astryx-backed ActionButton wrapper.**

  Implement `ActionButton` as a thin typed wrapper over `@astryxdesign/core/Button`, keep a 40px useful touch target, preserve accessible labels and icon-only requirements, and migrate the touched Settings and Projects primary/secondary/quiet actions to it. Do not recolor buttons by module.

- [ ] **Step 6: Run focused shared tests and TypeScript.**

  Run: `npx.cmd tsx --test tests/uiSharedSurfaceContracts.test.ts tests/uiFoundation.test.ts tests/projectsPageArchitecture.test.ts`

  Then run: `npm.cmd run typecheck`

  Expected: PASS with no new type errors and the existing parent-owned project/lifecycle contracts unchanged.

### Task 3: Compact action bar and advanced-filter disclosure

**Files:**
- Create: `src/components/ui/filterActionBarModel.ts`
- Modify: `src/components/ui/OperationsUI.tsx`
- Create: `tests/filterActionBar.test.ts`
- Modify: `tests/uiSharedSurfaceContracts.test.ts`

**Interfaces:**
- Produces `isActiveFilterValue(value: unknown): boolean` and `countActiveFilters(values: readonly unknown[]): number`.
- Produces `FilterChip`, `CompactSearchControl`, `AdvancedFilterDisclosureProps`, and `CompactActionBarProps`.
- `CompactActionBar` renders a flexible search control, optional one/two quick controls, a Filters disclosure with active count, compact sort/view slots, optional primary action, conditional active chips, and conditional Clear all.
- `AdvancedFilterDisclosure` owns only disclosure presentation and focus behavior; its children continue to call parent-owned filter callbacks.

- [ ] **Step 1: Write failing model and contract tests.**

  Cover:

  ```ts
  assert.equal(countActiveFilters(["ALL", "", null, undefined]), 0);
  assert.equal(countActiveFilters(["ACTIVE", "manager-a", "ALL", "CRITICAL"]), 3);
  ```

  Also assert the component source contains `data-ui="compact-action-bar"`, an `aria-expanded`/`aria-controls` pair, `role="dialog"` for the advanced panel, an Escape listener, focus restoration to the trigger, a mobile compact-control contract, and `Clear all` rendered only when active filters exist.

- [ ] **Step 2: Run the focused tests to verify RED.**

  Run: `npx.cmd tsx --test tests/filterActionBar.test.ts tests/uiSharedSurfaceContracts.test.ts`

  Expected: FAIL because the model and shared components do not yet exist.

- [ ] **Step 3: Implement the pure active-count model.**

  Treat `undefined`, `null`, empty strings, and the sentinel `ALL` as inactive; count every other value exactly once. Keep this model independent of React so filter semantics remain deterministic and directly testable.

- [ ] **Step 4: Implement `AdvancedFilterDisclosure`.**

  Use a native button trigger, stable generated IDs, `aria-expanded`, `aria-controls`, a labelled non-modal dialog panel, a document Escape handler, an outside-pointer close, and `requestAnimationFrame` focus restoration to the trigger. Focus the first available control after opening when one exists. Do not trap focus or mutate filter values.

- [ ] **Step 5: Implement `CompactActionBar`.**

  Give search the flexible width, hide optional quick filters on phone, keep Filter and Sort compact on phone, keep the normal desktop/laptop state to one toolbar row, render chips only when active, render Clear all only when active, and keep the primary action visually separate. Use semantic classes and `ActionButton`/native controls rather than a new component library.

- [ ] **Step 6: Run the model/contract tests and typecheck.**

  Run: `npx.cmd tsx --test tests/filterActionBar.test.ts tests/uiSharedSurfaceContracts.test.ts`

  Then run: `npm.cmd run typecheck`

  Expected: PASS with the disclosure’s keyboard/touch contract and responsive control anatomy represented in source.

### Task 4: Bounded Projects proving integration

**Files:**
- Modify: `src/components/projects/ProjectPortfolioRegisterSection.tsx`
- Modify: `src/components/projects/ProjectsPage.tsx`
- Modify: `tests/projectsPageArchitecture.test.ts`
- Modify: `tests/uiUxResponsive.test.ts`

**Interfaces:**
- Consumes `CompactActionBar`, `countActiveFilters`, semantic controls, and `ActionButton` from Tasks 2–3.
- Continues to consume every existing parent callback and filter value from `ProjectsPage`; no filter/business logic moves into the shared component.

- [ ] **Step 1: Write the failing Projects proving-contract assertions.**

  Assert that the Projects register imports and renders `CompactActionBar`, passes the existing search/status/manager/currency/health/attention/sort/view controls, computes an active count from the existing values, preserves every existing filter option and callback, keeps `ProjectPortfolioRegisterSection` before portfolio/workbook disclosures, and preserves the parent-owned lifecycle callbacks.

- [ ] **Step 2: Run the focused Projects tests to verify RED.**

  Run: `npx.cmd tsx --test tests/projectsPageArchitecture.test.ts tests/uiUxResponsive.test.ts`

  Expected: FAIL because the current filter card is still the old multi-row implementation.

- [ ] **Step 3: Replace only the Projects filter presentation.**

  Keep the existing filter state and handlers. Move the search input, status quick filter, manager/currency/health/attention advanced controls, sort selector/direction, and Cards/Compact List view toggle into the shared action bar. Build active chips from the current selected values; each chip calls the corresponding existing reset callback, and Clear all calls `onClearFilters`. Do not change `filterAndSortProjectViews` or financial summary derivation.

- [ ] **Step 4: Migrate the proving route’s structural surfaces.**

  Replace Project card/list root fills, menu/popover fills, metric sub-surface, and touched raw actions with semantic classes/`ActionButton`. Preserve status/attention colors through named semantic classes. Keep project names, identity, financial labels, Actual vs Committed distinction, partial/unavailable states, lifecycle actions, and card/list ordering unchanged. This is a theme/control proof, not a Project-card redesign.

- [ ] **Step 5: Run focused Projects tests and typecheck.**

  Run: `npx.cmd tsx --test tests/projectsPageArchitecture.test.ts tests/uiUxResponsive.test.ts tests/filterActionBar.test.ts tests/uiSharedSurfaceContracts.test.ts`

  Then run: `npm.cmd run typecheck`

  Expected: PASS with all current Project filter semantics and authority boundaries retained.

### Task 5: Integrated validation, screenshot inspection, and evidence synchronization

**Files:**
- Create: `artifacts/ui-ux-audit/UI-R4B-SHARED-VISUAL-FOUNDATION.md`
- Modify: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`
- Modify: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`
- Modify: `tests/uiFoundation.test.ts` when final source assertions require alignment

- [ ] **Step 1: Run the focused edited-test set on the integrated diff.**

  Run the edited theme, shared-surface, filter-action, Projects architecture, and responsive tests together. Record the exact result without claiming hosted/authenticated/provider/production evidence.

- [ ] **Step 2: Run the affected selector once.**

  Run: `npm.cmd run test:affected:agent`

  Record the selected count, fallback state, and any unchanged-surface failures separately. Do not weaken tests or rerun an unchanged failure.

- [ ] **Step 3: Run lint and build.**

  Run: `npm.cmd run lint` and `npm.cmd run build`. If the Astryx build regenerates unrelated generated drift, restore only unrelated generated changes and retain intentional theme artifacts. Do not start Docker/Supabase.

- [ ] **Step 4: Run local safe-demo visual QA for the changed surfaces.**

  Start the local app/production preview without external account mutation. Capture and personally inspect the shared shell, Settings appearance controls, Projects compact toolbar, advanced-filter disclosure, project cards/list, one OperationsGrid or worksheet surface, and one popover/dialog at:

  - desktop approximately `1440`;
  - constrained laptop approximately `1280`;
  - tablet `768`;
  - phone `390`.

  Inspect both Light and Dark, plus System resolution. Check hierarchy, spacing, borders, text contrast, selected/focus/disabled states, dark surface layering, filter footprint, wrapping, and phone reachability. Correct obvious shared-root issues before delivery.

- [ ] **Step 5: Write the durable R4B evidence.**

  Record starting SHA `2a903c7d9d6db383457dac6c7a2d5d0c2e44a46a`, final branch/head, environment, route/state, viewport/theme matrix, the directly inspected Linear/Fieldwire/Procore patterns, implemented primitives, visual findings, tests, skipped hosted/database/provider evidence, and the exact next phase `UI-R4C — Home Dashboard + Project Portfolio redesign`. Do not store secrets, private browser data, or external raw traces.

- [ ] **Step 6: Reconcile roadmap and handoff.**

  Mark UI-R4B complete only for this shared-foundation/proving scope, set UI-R4C as the exact next phase, preserve deferred product domains and all non-claims, and ensure the roadmap, handoff, AGENTS policy, and live implementation agree. No Settings feature-roadmap status is changed because this is shared presentation infrastructure, not a newly available customer capability.

- [ ] **Step 7: Review the complete final diff for scope creep.**

  Confirm no migration, DB/storage/RLS/RPC/security-authority, Dashboard, Project-card redesign, entity-media, Worker Registration, or unrelated cleanup files entered the diff. Run `git diff --check` and inspect the full changed-file list.

- [ ] **Step 8: Commit, push, and open the PR.**

  Use a focused commit such as `feat: add shared UI-R4B visual foundation`, push `codex/ui-r4b-shared-visual-foundation`, open a PR against current `main`, report the exact PR head SHA and validation evidence, and stop without merging.

