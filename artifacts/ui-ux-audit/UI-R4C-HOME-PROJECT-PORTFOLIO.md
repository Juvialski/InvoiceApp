# UI-R4C — Home Dashboard + Project Portfolio

| Field | Value |
| --- | --- |
| Status | **IMPLEMENTED FOR LOCAL SAFE-DEMO SCOPE** |
| Date | **2026-09-23** |
| Repository | `Juvialski/InvoiceApp` |
| Branch | `codex/ui-r4c-home-project-portfolio` |
| Starting `main` | `aa665150d1dabd7f09352f2d157408b55506824a` |
| Implementation/source SHA captured by final demo run | `e55e15d917e0f072d60238d651fe14c7f77ff405` |

## Boundary and implementation

R4C gives `/dashboard` one stable Home composition across loading, workspace
hydration, permission changes, and incomplete project-cost sources. The existing
`EngineeringCostOperationsDashboard` remains available at
`/dashboard?view=insights`; the Home link uses that same dashboard permission
boundary. Combined analysis is withheld while its source data is pending or
incomplete.

Home is composed from existing permission-filtered route state: a task
launchpad, up to five source-backed attention items, a compact snapshot that
omits unavailable counts instead of rendering false zeros, a small active
project list, and a secondary Operations Insights link. Project-specific
attention opens the exact project; general signals keep their existing route.
It does not introduce a cross-domain workflow engine or change source authority.

Project cards use deterministic monograms and project identity as the primary
open target. Status/attention sits below identity; Contract Value and Approved
Project Budget remain distinct from Actual Cost and Committed Cost. Existing
card/list selection, search, filtering, sorting, permissions, edit actions,
lifecycle controls, and workbook review/apply behavior remain parent-owned.
Responsive card columns flow with available width; Compact List remains
available.

The R4C Home, Insights framing, Projects cards/filters, and touched dialogs and
states use the existing `hqs-*` / paired Astryx semantic theme layer. The Light
warning text token was adjusted to pass the added AA contrast contract on both
primary and muted paired surfaces. Financial calculations, database schema,
RLS/RBAC, lifecycle, audit history, provenance, concurrency, and workbook
authority were not changed.

## Visual evidence

Environment: local production preview of the isolated safe-demo app at
`http://127.0.0.1:4173`, synthetic seeded data only. The final run used source
SHA `e55e15d917e0f072d60238d651fe14c7f77ff405`. No real account/company data was
saved, and no external account was mutated.

The final demo catalog captured **150 screenshots across 36 routes and 131
interaction scenarios** with **0** console errors, page errors, failed
requests, navigation failures, overflow failures, or failed scenarios. The 19
R4C-specific screenshots each passed their theme and page assertions and were
visually inspected by the lead at the final source SHA:

| Viewport | Home | Project Portfolio |
| --- | --- | --- |
| Desktop 1440 | [Light](screenshots/r4c/dashboard--dashboard--r4c-home-light-theme-visual--r4c-desktop-1440.png) / [Dark](screenshots/r4c/dashboard--dashboard--r4c-home-dark-theme-visual--r4c-desktop-1440.png) | [Light](screenshots/r4c/projects--projects--r4c-project-portfolio-light-theme-visual--r4c-desktop-1440.png) / [Dark](screenshots/r4c/projects--projects--r4c-project-portfolio-dark-theme-visual--r4c-desktop-1440.png) |
| Constrained laptop 1280 | [Light](screenshots/r4c/dashboard--dashboard--r4c-home-light-theme-visual--r4c-laptop-1280.png) / [Dark](screenshots/r4c/dashboard--dashboard--r4c-home-dark-theme-visual--r4c-laptop-1280.png) | [Light](screenshots/r4c/projects--projects--r4c-project-portfolio-light-theme-visual--r4c-laptop-1280.png) / [Dark](screenshots/r4c/projects--projects--r4c-project-portfolio-dark-theme-visual--r4c-laptop-1280.png) |
| Tablet 768 | [Light](screenshots/r4c/dashboard--dashboard--r4c-home-light-theme-visual--r4c-tablet-768.png) / [Dark](screenshots/r4c/dashboard--dashboard--r4c-home-dark-theme-visual--r4c-tablet-768.png) | [Light](screenshots/r4c/projects--projects--r4c-project-portfolio-light-theme-visual--r4c-tablet-768.png) / [Dark](screenshots/r4c/projects--projects--r4c-project-portfolio-dark-theme-visual--r4c-tablet-768.png) |
| Phone 390 | [Light](screenshots/r4c/dashboard--dashboard--r4c-home-light-theme-visual--r4c-phone-390.png) / [Dark](screenshots/r4c/dashboard--dashboard--r4c-home-dark-theme-visual--r4c-phone-390.png) | [Light](screenshots/r4c/projects--projects--r4c-project-portfolio-light-theme-visual--r4c-phone-390.png) / [Dark](screenshots/r4c/projects--projects--r4c-project-portfolio-dark-theme-visual--r4c-phone-390.png) |

Additional inspected states: [Dark Projects filters and attention at 1280](screenshots/r4c/projects--projects--r4c-project-portfolio-dark-filters-and-attention-visual--r4c-laptop-1280.png), [Operations Insights Light at 1440](screenshots/r4c/dashboard--dashboard--r4c-operations-insights-light-theme-visual--r4c-desktop-1440.png), and [Operations Insights Dark at 1440](screenshots/r4c/dashboard--dashboard--r4c-operations-insights-dark-theme-visual--r4c-desktop-1440.png).

Visual findings: Home keeps attention and launch actions before secondary
analysis. Tablet and phone stack the sections without horizontal overflow; the
project list remains compact. Project cards use three columns at desktop, two
at constrained laptop/tablet, and one on phone. Both themes retain readable
names, status, financial distinctions, controls, and warning treatment. The
filter disclosure remains usable in Dark at laptop width. The existing
Operations Insights analytics remain present behind the secondary destination.

The safe-demo wrapper’s shared Demo Workspace notice remains light in Dark mode
and is visible in the screenshots. That harness-level shell was not changed by
R4C; app-wide shell remediation remains in the later R4E scope. The local safe
demo does not certify authenticated hosted QA, provider readiness, or production
behavior.

## Validation

- Focused Dashboard, routing, Projects, and shared-theme tests: **34/34 pass**.
- `npm.cmd run test:affected:agent`: **812/812 pass** across 121/374 selected
  test files; database impact unaffected; deterministic fallback off.
- `npm.cmd run lint`: passed (ESLint and TypeScript typecheck).
- `npm.cmd run build`: passed. Existing Inter font, large-chunk, and CJS
  `import.meta` warnings remain.
- `git diff --check`: passed before evidence/doc closeout.
- Demo Visual QA: **150/150 scenarios**, 36 routes, 8 viewport names, 131
  interactions, 0 console/page/request/navigation/overflow failures.
- Contrast regression checks verify primary, secondary, accent, green, yellow,
  and red semantic foreground tokens meet 4.5:1 on paired surface/muted
  backgrounds in Light and Dark.
- No migrations, database/RLS/RPC changes, Supabase/Docker validation,
  production action, provider certification, or full-suite run was required or
  claimed.

## Jev / Repository Intelligence

- One bounded `agent:context` packet had no primary source/test candidates and
  used the deterministic fallback.
- Live Jev context found zero candidates and made zero requests. The single
  live test-triage attempt returned `TypeError`; deterministic required tests
  were retained unchanged.
- The single live completion checkpoint ran before the final review correction
  and found all four expected evidence categories present. Jev `jev-1.13.0`:
  4 candidates / 4 selected, 732 input tokens, 72 output tokens, 492 ms, no
  fallback. The direct-project navigation correction was covered by focused /
  affected tests and final browser recapture; no second live call was made.
  The advisory provided no merge decision.

## Next phase

The next approved Round 4 phase remains **UI-R4D — entity media foundation**,
subject to its existing bounded design and storage/security validation
requirements. R4C did not begin media, storage, or schema work.
