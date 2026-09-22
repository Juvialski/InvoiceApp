# UI-R4B — Shared Visual Foundation

Status: **IMPLEMENTED FOR THE SHARED FOUNDATION AND BOUNDED PROJECTS PROVING SCOPE**  
Date: **2026-09-22**  
Repository: `Juvialski/InvoiceApp`  
Branch: `codex/ui-r4b-shared-visual-foundation`  
Starting `main`: `2a903c7d9d6db383457dac6c7a2d5d0c2e44a46a`  
Implementation/test head before this evidence commit: `acd6c01`

## Boundary

R4B activates the existing Astryx paired Light/Dark token system, adds local
System/Light/Dark preference persistence and early bootstrap, migrates shared
shell and worksheet/table primitives to semantic surfaces, adds the shared
button/action grammar, and proves compact filters on the Projects portfolio.

R4B does not redesign Home, relocate Operations Insights, redesign Project
card anatomy, add entity media, change database/storage/RLS/RPC authority, or
resume Worker Registration, Site Attendance, Face Recognition, Finance UX-W6,
or custom-field expansion.

## Direct visual calibration

Read-only Chrome inspection was performed by the lead before implementation:

- **Linear Filters documentation / rendered dark example:** charcoal layered
  surfaces, restrained borders and status color, compact filter controls,
  quick-search filters, and advanced filters disclosed on demand.
- **Fieldwire project dashboard example:** one visually dominant New project
  action above quiet Sort / Filter / Search controls and recognizable project
  tiles; filters do not occupy a permanent multi-row card.
- **Procore Project Overview example:** project identity, open items, risks,
  and direct actions are prioritized over an analytics wall; quick actions are
  separated from deeper analysis.

These observations informed the shared control hierarchy and disclosure only;
no proprietary branding, assets, or exact layout was copied.

## Implemented foundation

- `src/ui/themePreference.ts` defines and persists exactly `system`, `light`,
  and `dark`. `index.html` applies explicit `data-theme` before the React
  module executes; System removes the explicit attribute and follows
  `prefers-color-scheme` through Astryx `light-dark()` tokens.
- `HydroqualisenseThemeProvider` owns the preference context and synchronous
  runtime application. Settings exposes the three labelled radio choices.
- `src/index.css` now supplies Astryx-backed `hqs-*` semantic canvas,
  surface, raised surface, muted surface, popover, control, text, border,
  focus, exceptional-state, attention, row, and worksheet-cell classes.
- Shared `OperationsUI` primitives, `OperationsGrid`, `WorksheetEditor`,
  `WorksheetTabs`, `ContextualHelp`, AppShell, Header, and visible Settings
  surfaces use the semantic grammar. `ActionButton` delegates to Astryx
  variants `primary`, `secondary`, `ghost`, and `destructive`.
- `CompactActionBar` and `AdvancedFilterDisclosure` provide flexible search,
  one/two quick controls, active counts, chips, conditional Clear all,
  responsive Sort/View controls, keyboard Escape dismissal, outside dismissal,
  first-control focus, and focus restoration.
- Projects remains the only proving consumer. Existing parent-owned filter,
  sort, lifecycle, permission, and financial callbacks are unchanged. The
  card-first default, optional Compact List, Actual vs Committed distinction,
  partial/unavailable truth, and secondary portfolio/workbook disclosures are
  preserved.

## Visual evidence

Environment: local HydroQualiSense safe-demo at `http://127.0.0.1:3000`,
synthetic demo fixtures only, no external account mutation or production data.

The final local production-preview catalog is recorded in the transient
`artifacts/demo-visual-qa-r4b/manifest.json` and captures **131/131 PASS**:

- 131 screenshots;
- 112 interaction scenarios;
- 36 routes;
- desktop `1440x1000`, constrained laptop `1366x768`, tablet `768x1024`, and
  phone `390x844` viewports;
- zero console errors, page errors, failed requests, navigation failures, and
  overflow failures.

Representative screenshots inspected by the lead include:

- Projects card portfolio at desktop, laptop, tablet, and phone;
- Projects advanced filters open at desktop;
- Settings appearance controls at desktop;
- Projects Compact List / shared `OperationsGrid` in Dark mode through CUA;
- Projects and Settings in both explicit Light and Dark, with System observed
  following the local OS/browser dark preference before explicit changes;
- the local Procurement table/worksheet route in Dark as a downstream check.

Concrete observations:

- Desktop and laptop keep search, status, Filters, Sort, direction, and View
  in one compact toolbar row; the primary New project action remains distinct.
- Tablet wraps the view toggle into a controlled second line while retaining
  two-column project cards; phone reduces the toolbar to search plus compact
  Filters/Sort and uses one-column cards.
- The advanced filter panel overlays the working surface without shifting the
  project cards; CUA observed focus entering the first manager control.
- Light and Dark both retain readable project identity, financial labels,
  Actual/Committed distinction, attention states, selected controls, and
  touch-sized actions. Dark shared OperationsGrid rows and headers use layered
  semantic surfaces rather than white fills.
- The downstream Procurement register still contains legacy light card fills
  visible in a Dark probe. It is outside the R4B proving integration and is
  intentionally deferred to the later shared-grammar rollout; no page-specific
  workaround was added in this bounded slice.

## Validation

- Focused final R4B suite: 38/38 pass before the final QA-contract-only test
  alignment; the added demo route contract then passed 10/10 and the Settings
  provider-context harness cluster passed 60/60.
- Deterministic affected selector on the final application/test head:
  **85/372 selected files, 561/561 tests pass, fallback off, database
  unaffected**.
- `npm.cmd run lint`: passed without diagnostics; this includes ESLint and
  TypeScript typecheck.
- `npm.cmd run build`: passed. Existing Astryx Inter-font, chunk-size, and
  CJS `import.meta` warnings remain non-blocking; no generated theme drift was
  retained.
- `git diff --check`: passed.
- Docker/Supabase was not run because the final diff contains no database,
  migration, storage, RLS, RPC, trigger, or authority change.
- Hosted QA, provider runtime certification, authenticated customer-data
  evidence, production, and full-suite regression were not run or claimed.

## Jev / Repository Intelligence

- The single bounded `agent:context` attempt with generic `ui` was rejected as
  an unsupported workflow selector; deterministic source inspection was used.
- The valid `projects` TypeSafe context checkpoint found zero candidates and
  made zero live requests, so it fell back without removing any required file
  or test. Jev remained advisory and non-authoritative.

## Next phase

The exact next implementation phase is **UI-R4C — Home Dashboard + Project
Portfolio redesign**. R4C may simplify Home into orientation, attention, and
launch, and refine Project-card composition; it must preserve the R4B shared
grammar and all financial, permission, lifecycle, history, provenance,
concurrency, and review-before-Apply boundaries.
