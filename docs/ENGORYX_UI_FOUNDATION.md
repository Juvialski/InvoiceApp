# ENGORYX UI Foundation

This document defines the UI-system direction for Engoryx and the controlled evaluation of Meta's open-source Astryx design system.

## Decision

Astryx is approved for a **bounded UI-foundation pilot**, not a whole-application rewrite.

Upstream evaluation as of 2026-08-27:

- Repository: `facebook/astryx`
- License: MIT
- Status: Beta
- Current upstream core package inspected: `@astryxdesign/core` 0.5.0
- React requirement: React 19+
- Styling model for consumers: pre-built CSS with typed React components; Tailwind/CSS overrides remain supported through `className`
- Core capabilities: accessible components, themes, dark mode, templates/patterns, and agent-oriented CLI/documentation

Astryx is valuable to Engoryx because the application contains many repeated internal-operations UI patterns: forms, tables, filters, dialogs, navigation, status indicators, detail pages, and multi-step workflows. Those patterns should become more consistent without replacing Engoryx's domain-specific engineering interfaces.

## UI ownership model

Engoryx UI should be layered rather than replaced wholesale:

1. **Astryx primitives and patterns** — common controls and repeatable application patterns.
2. **Engoryx visual identity** — product-specific typography, colors, density, spacing, status semantics, and AEC-oriented presentation.
3. **Specialized Engoryx interfaces** — domain UIs that require custom behavior or specialist rendering.

Specialized interfaces remain Engoryx-owned. In particular, Astryx must not replace:

- the PDF.js + Konva Blueprint Viewer and redline canvas;
- engineering drawing coordinate/annotation logic;
- Recharts-based operational analytics unless a later chart evaluation justifies migration;
- payroll calendars and payroll calculation workflows merely for visual uniformity;
- project costing, cash/banking, invoice verification, or other domain logic;
- Supabase, RLS, authorization, audit, or persistence contracts.

## Pilot scope

The first implementation must remain intentionally small.

Preferred pilot surfaces:

- one shared UI-primitives layer; and
- Dashboard plus Projects, or another similarly representative CRUD-heavy surface if the current code structure makes that safer.

The pilot should exercise enough of the design system to test real compatibility:

- Button / IconButton
- Card / layout primitives
- form fields and selectors
- Dialog / AlertDialog
- DropdownMenu / MoreMenu
- Tabs
- Badge / status indicators
- Tooltip
- Empty, loading, and error states
- table/list patterns where appropriate

Do not migrate unrelated pages simply to increase Astryx usage.

## Pilot acceptance gates

The pilot is successful only if all of the following are demonstrated:

1. **No behavior regression** — existing navigation, permissions, data mutations, deep links, forms, and error handling retain their meaning.
2. **Accessibility** — keyboard navigation, focus visibility, labels, dialogs, and interactive states remain correct or improve.
3. **Responsive quality** — desktop, laptop, tablet, and mobile layouts remain usable; field workflows must not become desktop-only.
4. **Bundle discipline** — adopting Astryx must not accidentally pull large unused component groups into the initial bundle. Prefer component-level imports and verify Vite production output.
5. **Visual consistency** — typography, spacing, control sizing, states, and page hierarchy become more coherent rather than producing a mixed "two design systems" appearance.
6. **Theme ownership** — Engoryx retains its own identity instead of shipping a stock Astryx theme unchanged.
7. **Agent usability** — coding agents use Astryx's documented component APIs/templates instead of guessing props or recreating components that already exist.
8. **Rollback safety** — the pilot stays isolated enough that it can be reverted without touching domain data or business logic.

## Dependency and lockfile safety

Astryx is still beta, so dependency changes must be deliberate.

Current Engoryx uses React 19, which satisfies Astryx's React requirement. However, the upstream neutral theme inspected at version 0.5.0 declares a dependency on `lucide-react ^1.18.0`, while Engoryx currently uses an older Lucide release. Therefore:

- do not blindly install or upgrade the stock neutral theme in a GitHub-only edit;
- validate the Lucide dependency impact in an npm-capable/local environment first;
- prefer an Engoryx-owned theme/token layer if it avoids an unnecessary icon-library migration;
- update `package.json` and `package-lock.json` together using npm; never hand-wave or intentionally desynchronize the lockfile;
- keep `npm ci` compatibility for CI.

When the pilot dependency is introduced, run the full validation suite and inspect the production bundle before merging.

## Tailwind coexistence

Engoryx should keep Tailwind during the pilot. Astryx explicitly supports consumer overrides through normal CSS/class names and provides a Tailwind token bridge. There is no reason to rewrite existing Tailwind styling simply to adopt the component library.

The migration strategy is therefore progressive:

`existing Engoryx UI -> shared Astryx-backed primitives/patterns -> page-by-page adoption`

not:

`existing Engoryx UI -> full styling rewrite`

## Agent workflow

Once Astryx dependencies are actually installed in the repository, agents working on UI should consult the installed Astryx CLI/documentation before inventing an equivalent primitive.

Recommended local workflow after installation:

```text
npm.cmd run astryx -- component --list
npm.cmd run astryx -- component Button
npm.cmd run astryx -- template --list
```

If the repository runs Astryx `init`, any generated additions to `AGENTS.md` must be reviewed and reconciled with Engoryx's existing repository rules rather than overwriting them.

UI implementation remains subject to the project agent policy:

- ChatGPT owns architecture/integration and final review;
- Antigravity is preferred for browser-driven visual and responsive QA;
- Kilo/free models may perform tightly bounded mechanical conversions after a pattern is established;
- Codex is reserved for difficult multi-file/runtime integration when justified;
- no more than two concurrent subagents are permitted.

## Rollout sequence

1. **Pilot preparation** — dependency compatibility, lockfile-safe installation, theme approach, shared wrapper/primitives boundary.
2. **Pilot implementation** — limited representative surfaces only.
3. **Browser/visual QA** — desktop, laptop, tablet, mobile, keyboard, empty/loading/error states.
4. **Bundle + CI review** — tests, lint/typecheck, production build, initial-chunk comparison.
5. **Pilot decision** — adopt, adjust, or revert based on evidence.
6. **Progressive migration** — shared controls first, then high-value CRUD/operations pages.
7. **New feature default** — after the pilot is accepted, Phase 1B and later ordinary application UI should prefer the established Engoryx/Astryx system from day one while specialist engineering canvases remain custom.

## Explicit non-goals

This pilot does not authorize:

- a full-app visual rewrite;
- replacing domain logic while changing components;
- changing RLS, auth, migrations, financial history, payroll history, or audit semantics;
- replacing PDF.js/Konva;
- adopting Astryx canary chart packages as a production dependency;
- automatic major upgrades of unrelated dependencies merely to satisfy a theme package.

The design-system integration should reduce UI inconsistency and future maintenance cost while keeping Engoryx's operational behavior and engineering specialization intact.
