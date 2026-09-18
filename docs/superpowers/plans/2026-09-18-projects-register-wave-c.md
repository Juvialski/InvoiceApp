# Projects Portfolio / Register Wave C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the Projects portfolio summary and register presentation into a typed `ProjectPortfolioRegisterSection` while preserving parent-owned workflow authority, and confirm that Excel-native operations UX remains deferred.

**Architecture:** `ProjectsPage` remains the orchestration, financial truth, and domain-authority boundary. It derives typed project management views, multi-currency-safe portfolio summaries, filter/sort options, and manages lifecycle/editing state, then passes those models and narrow callbacks into a presentation-only `ProjectPortfolioRegisterSection`. Existing project editing, tax-treatment classification validation, and lifecycle preview/mutation orchestration remain parent-owned.

**Tech Stack:** React, TypeScript, Vite, Node test runner, ESLint, Markdown documentation.

**Spec:** `docs/superpowers/specs/2026-09-17-repository-architecture-professionalization-design.md` plus the Slice 5 Wave C requirements.

## Global Constraints

- Preserve project financial, lifecycle, currency, tax treatment, permission, audit, route, and history behavior exactly.
- Keep project source data, cost summaries, client billings/collections, completeness checks, `buildProjectManagementView(...)`, `buildPortfolioManagementSummary(...)`, `filterAndSortProjectViews(...)`, manager/currency option derivation, editing draft creation, validation, and lifecycle action orchestration in `ProjectsPage.tsx`.
- Do not duplicate or replace project editing dialog, lifecycle modal, or domain view models.
- Add the new component to the existing stronger TypeScript ESLint boundary without `any`, ts-ignore, blanket disables, or unsafe casts.
- Do not change migrations, RLS, RPCs, Supabase, providers, dependencies, production state, or PR #176-owned files.
- Excel-native work is documentation only: no grid, schema, import/export code, dependency, migration, prototype, or route change.
- Validate focused tests first, then affected tests and lint on the integrated final diff; do not run `test:full` or Docker/Supabase for this scope.

---

### Task 1: Add ownership-boundary and static-analysis contracts

**Files:**
- Create: `tests/projectsPageArchitecture.test.ts`
- Modify: `tests/staticAnalysisConfig.test.ts`
- Modify: `eslint.config.mjs`

**Interfaces:**
- Consumes: existing architecture contract patterns and bounded TypeScript ESLint file list.
- Produces: regression assertions for `ProjectPortfolioRegisterSection` import/render, its card/table boundary, retained parent orchestration, and stronger lint coverage.

- [x] **Step 1: Create the architecture test**
  Assert that `ProjectsPage.tsx` imports and renders `<ProjectPortfolioRegisterSection`. Assert that the new section contains `ProjectRegisterCard` and `ProjectPortfolioRegisterSection`, while `ProjectsPage.tsx` still contains the editing and lifecycle dialogs and authoritative derivation. Assert that the new section does not import project persistence, lifecycle, or dialog focus modules.

- [x] **Step 2: Extend the static-analysis contract**
  Add `src/components/projects/ProjectPortfolioRegisterSection.tsx` to `boundedTypeScriptSurface` in `tests/staticAnalysisConfig.test.ts` and to `architecturalTypeScriptFiles` in `eslint.config.mjs`.

### Task 2: Create the presentation-only Projects portfolio/register boundary

**Files:**
- Create: `src/components/projects/ProjectPortfolioRegisterSection.tsx`

**Interfaces:**
- Consumes: typed `ProjectManagementView`, `PortfolioManagementSummary`, filter/sort states, and narrow callbacks.
- Produces: portfolio snapshot disclosure, financial totals grouped by currency, search/filter controls, desktop table, and mobile cards.

- [x] **Step 1: Implement `ProjectPortfolioRegisterSection` and `ProjectRegisterCard`**
  Move presentation helpers (`money`, `statusTone`, `healthBadgeTone`, `attentionTone`, `financialValue`, `FinancialValue`, `PortfolioFinancialValue`, `portfolioMetricInline`) and JSX (portfolio summary disclosure, search and filters toolbar, desktop table, and responsive cards).

### Task 3: Integrate `ProjectPortfolioRegisterSection` in `ProjectsPage.tsx`

**Files:**
- Modify: `src/components/projects/ProjectsPage.tsx`
- Modify: `tests/projectManagementUX.test.ts`

- [x] **Step 1: Replace inline portfolio and register JSX in `ProjectsPage.tsx`**
  Keep data loading, memoized derivation (`buildProjectManagementView`, `buildPortfolioManagementSummary`, `filterAndSortProjectViews`), editing state, and lifecycle preview/apply orchestration in `ProjectsPage.tsx`.

- [x] **Step 2: Align test assertions**
  Update `tests/projectManagementUX.test.ts` to inspect the project workspace presentation surface for table and column structure while verifying parent-owned derivations.

### Task 4: Validate and synchronize documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-09-17-repository-architecture-professionalization-design.md`
- Modify: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`
- Modify: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`
- Modify: `docs/README.md`

- [x] **Step 1: Run focused and affected tests**
  Validate with `npm run lint` and `npm run test:affected:agent`.

- [x] **Step 2: Synchronize roadmap and handoff documents**
  Record Slice 5 Wave C completion, line count reduction, and non-goals.
