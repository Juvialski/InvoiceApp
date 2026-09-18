# Subcontract Register Wave B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the Procurement Subcontracts register presentation into a typed `SubcontractRegisterSection` while preserving parent-owned workflow authority, and document the approved but deferred Excel-native operations UX direction.

**Architecture:** `ProcurementPage` remains the orchestration and domain-authority boundary. It will derive typed subcontract register rows, KPI totals, counts, and action-readiness values, then pass those view models and narrow callbacks into a presentation-only `SubcontractRegisterSection`. Existing subcontract editor/cancellation, Claims, and Variations components remain parent-orchestrated and authoritative.

**Tech Stack:** React, TypeScript, Vite, Node test runner, ESLint, Markdown documentation.

**Spec:** `docs/superpowers/specs/2026-09-17-repository-architecture-professionalization-design.md` plus the attached Slice 5 Wave B handoff requirements.

## Global Constraints

- Preserve subcontract financial, lifecycle, currency, permission, demo, persistence, audit, route, and history behavior exactly.
- Keep subcontract, claim, variation, filtering, financial derivation, persistence, permissions, and modal/drawer orchestration in `ProcurementPage.tsx`.
- Do not duplicate or replace `SubcontractEditorModal`, `SubcontractCancellationModal`, Claims drawer/editor, or Variations drawer/editor/detail components.
- Add the new component to the existing stronger TypeScript ESLint boundary without `any`, ts-ignore, blanket disables, or unsafe casts.
- Do not change migrations, RLS, RPCs, Supabase, providers, dependencies, production state, or PR #176-owned files.
- Excel-native work is documentation only: no grid, schema, import/export code, dependency, migration, prototype, or route change.
- Validate focused tests first, then affected tests and lint once on the integrated final diff; do not run `test:full` or Docker/Supabase for this scope.

---

### Task 1: Add failing ownership-boundary contracts

**Files:**
- Modify: `tests/procurementPageArchitecture.test.ts`
- Modify: `tests/staticAnalysisConfig.test.ts`
- Modify: `eslint.config.mjs`

**Interfaces:**
- Consumes: existing PO/RFQ architecture contract and bounded TypeScript ESLint file list.
- Produces: regression assertions for `SubcontractRegisterSection` import/render, its card boundary, retained parent orchestration, and stronger lint coverage.

- [ ] **Step 1: Extend the architecture test before implementation**

  Add a `subcontractSectionPath`, read the new source when it exists, and assert that `ProcurementPage.tsx` imports and renders `<SubcontractRegisterSection`. Assert that the new section contains `SubcontractRegisterCard`, while `ProcurementPage.tsx` still contains the editor, cancellation, Claims drawer/editor, Variations drawer/editor/detail usages and the subcontract transition/save/delete handler families. Assert that the new section does not contain persistence imports such as `saveSubcontract`, `transitionSubcontract`, `saveSubcontractClaim`, or `saveSubcontractVariation`.

- [ ] **Step 2: Extend the static-analysis contract before implementation**

  Add `src/components/procurement/SubcontractRegisterSection.tsx` to `boundedTypeScriptSurface` and add the same path to `architecturalTypeScriptFiles` in `eslint.config.mjs`.

- [ ] **Step 3: Run the focused contract tests and confirm the expected failure**

  Run:

  ```text
  npm.cmd exec tsx -- test --test-name-pattern="procurement register presentation|bounded TypeScript architecture policy" tests/procurementPageArchitecture.test.ts tests/staticAnalysisConfig.test.ts
  ```

  Expected: the new source-boundary assertions fail because the component and parent integration do not exist yet; do not broaden validation at this point.

### Task 2: Create the presentation-only Subcontract register boundary

**Files:**
- Create: `src/components/procurement/SubcontractRegisterSection.tsx`
- Test: `tests/procurementPageArchitecture.test.ts`

**Interfaces:**
- Consumes: `Subcontract`, `Project`, and `Vendor` display data; parent-derived `SubcontractRegisterRow`; typed KPI totals/counts; typed callbacks.
- Produces: exported `SubcontractRegisterSection`, `SubcontractRegisterSectionProps`, `SubcontractRegisterRow`, and `SubcontractRegisterCounts`.

- [ ] **Step 1: Define the narrow typed view model and callback contract**

  Export these shapes without domain mutation or persistence imports:

  ```ts
  export interface SubcontractRegisterRow {
    subcontract: Subcontract;
    vendorLabel: string;
    projectCode: string;
    projectName: string;
    variationCount: number;
    metrics: {
      originalAmount: number;
      revisedSubcontractValue: number;
      netApprovedVariations: number;
      cumulativeApprovedGross: number;
      remainingCommitment: number;
      claimsCount: number;
    };
    isApprovalReady: boolean;
  }

  export interface SubcontractRegisterCounts {
    total: number;
    active: number;
    drafts: number;
  }
  ```

  The props must include readonly row/totals collections, project/filter values, `canManage`, `canApprove`, `subcontractActionId`, `subcontractActionError`, filter setters, create/open Claims/open Variations/open editor callbacks, and narrow lifecycle callbacks for approve/activate/close/cancel/delete. Callbacks must not import or invoke persistence/domain transition helpers.

- [ ] **Step 2: Move the existing Subcontracts presentation into the new component**

  Preserve the current KPI labels, currency-separated totals, error state, search/project/status filters, status labels, contract/certified/remaining values, date formatting, empty-state behavior, Claims and Variations buttons, View/Edit behavior, permission gates, disabled busy state, approval readiness title, close confirmation, delete confirmation, and action callback ordering. Render a desktop table plus a compact mobile `SubcontractRegisterCard` representation so the extracted boundary owns the register's responsive presentation.

- [ ] **Step 3: Verify the component is presentation-only**

  Confirm its imports are limited to types, formatting/icons, `EmptyState`, and the component's parent-provided view model/callbacks. It must not import `subcontracts.ts`, `subcontractClaims.ts`, `subcontractVariations.ts`, persistence services, Supabase, or router state.

- [ ] **Step 4: Run the focused architecture contract**

  Run:

  ```text
  npm.cmd exec tsx -- test --test-name-pattern="procurement register presentation" tests/procurementPageArchitecture.test.ts
  ```

  Expected: the new component-boundary assertions pass after parent integration is completed in Task 3.

### Task 3: Move row derivation to the parent and integrate the section

**Files:**
- Modify: `src/components/procurement/ProcurementPage.tsx`
- Modify: `tests/subcontractClaimsUx.test.tsx`
- Modify: `tests/subcontractVariationsUx.test.tsx`

**Interfaces:**
- Consumes: `SubcontractRegisterRow` and `SubcontractRegisterCounts` from Task 2.
- Produces: parent-owned derived register rows/counts and the rendered `<SubcontractRegisterSection>`.

- [ ] **Step 1: Add parent-owned derived row models**

  Import the new section and its row/count types. Add a `useMemo` over `filteredSubcontracts`, `localClaims`, `localVariations`, `vendorMap`, and `projectMap` that computes each row's display labels, variation count, `computeSubcontractClaimMetrics(sc, localClaims, localVariations)` values, `subcontractTotal(sc)` original amount, and the existing positive-lines-and-total approval readiness. Add parent-owned total/active/draft counts without changing the existing KPI total derivations or mixed-currency behavior.

- [ ] **Step 2: Replace the inline Subcontracts JSX with the typed section**

  Render `<SubcontractRegisterSection>` in the existing `activeTab === "subcontracts"` branch. Wire filter setters directly, create/edit/drawer callbacks to existing state setters, and lifecycle callbacks to existing `runSubcontractRowAction`, `handleTransitionSubcontractInternal`, and `handleDeleteSubcontractInternal` wrappers. Keep all editor/drawer/detail/cancellation modal JSX below the section in `ProcurementPage.tsx`.

- [ ] **Step 3: Remove only imports made obsolete by the extraction**

  Remove formatting/icon imports used exclusively by the moved block, but retain imports still used by page header, tabs, RFQ cancellation, and modal orchestration. Do not reformat unrelated code.

- [ ] **Step 4: Run focused Subcontract/Claims/Variations render tests**

  Run:

  ```text
  npm.cmd exec tsx -- test tests/subcontractsUx.test.tsx tests/subcontractClaimsUx.test.tsx tests/subcontractVariationsUx.test.tsx
  ```

  Expected: all selected tests pass, including Contract Value/Remaining Commitment, Claims, and Variations entry assertions.

### Task 4: Add the authoritative future Excel-native operations UX design

**Files:**
- Create: `docs/HYDROQUALISENSE_EXCEL_NATIVE_OPERATIONS_UX.md`

**Interfaces:**
- Consumes: the attached approved future UX requirements and current UI/UX Round 2 baseline.
- Produces: a clearly deferred design contract for a fresh future implementation session.

- [ ] **Step 1: Write the status and current-capability boundary**

  Start with the exact status label `APPROVED FUTURE MAJOR UX DIRECTION — IMPLEMENTATION DEFERRED WHILE REPOSITORY/ARCHITECTURE PROFESSIONALIZATION IS IN PROGRESS`. State that implementation has not started and no current register is claimed to satisfy the future specification.

- [ ] **Step 2: Document the future interaction and architecture contract**

  Include the problem statement, `Sheet for everyday register work -> detail panel/editor for complex record work -> controlled workflow for consequential actions`, Sheet-native/Hybrid/Purpose-built classifications, desktop/tablet/mobile model, conceptual `OperationsGrid`, shared `OperationsSheetSchema`, real `.xlsx` report versus edit-round-trip exports, upload/parse/validate/compare/review/apply sequence, stable workbook metadata, stale/concurrency protection, new-row/deletion rules, protected/derived fields, financial/security/history invariants, reference/dropdown and multi-sheet workbook guidance, import review, partial application policy, provenance, workbook security, no generic spreadsheet-to-database writer, detail drawer, local workbook tabs, density, onboarding strategy, staged phases 0–8, acceptance criteria, usability testing, and sequencing.

- [ ] **Step 3: Add a fresh-chat handoff section**

  Include the required reading/inspection/rollout/validation sequence and explicit warnings against all-at-once redesign, treating every cell as editable, bypassing domain mutations, stale overwrite, absence-as-deletion, weakened financial/permission semantics, mandatory desktop grids on mobile, and confusing one-way `.xlsx` export with bidirectional round-trip support.

### Task 5: Synchronize professionalization roadmap and handoff truth

**Files:**
- Modify: `docs/superpowers/specs/2026-09-17-repository-architecture-professionalization-design.md`
- Modify: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`
- Modify: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`

**Interfaces:**
- Consumes: final implementation line count, final component boundary, and the new future design document.
- Produces: minimal truthful discoverability updates without reordering the live product sequence or claiming Slice 5 is fully complete.

- [ ] **Step 1: Record Slice 5 Wave B in the professionalization design**

  Replace the deferred Subcontract sentence with a dated Wave B status that names `SubcontractRegisterSection.tsx`, says parent orchestration and existing Claim/Variation surfaces remain in `ProcurementPage.tsx`, records the final page line count after implementation, and explicitly says the broader secondary-module program remains incomplete.

- [ ] **Step 2: Link the future design from the roadmap and handoff**

  Add only concise discoverability notes: the Excel-Native Operations UX direction is approved and documented at the new path, implementation is deferred while professionalization continues, and future work must begin from live state. Preserve the roadmap/handoff's active provider/security sequence and do not present the design as implemented or reorder unrelated phases.

- [ ] **Step 3: Check consistency and client-facing roadmap scope**

  Confirm no `src/config/productFeatures.ts` change is needed because this is a future design direction, not a user-visible available feature. Ensure the roadmap, handoff, and professionalization design do not claim the current Subcontract register is Excel-native.

### Task 6: Final proportional validation and delivery

**Files:**
- Review: complete final diff and changed-file list.
- Review: `src/lib/authenticatedRequestRecovery.ts`, `src/lib/companyApi.ts`, and `tests/authenticatedRequestRecovery.test.ts` remain unchanged.

**Interfaces:**
- Consumes: integrated implementation and documentation from Tasks 1–5.
- Produces: validated commit, pushed feature branch, and open PR against the recorded base `main` SHA.

- [ ] **Step 1: Run focused architecture/static/UI checks once on the integrated diff**

  Run:

  ```text
  npm.cmd exec tsx -- test tests/procurementPageArchitecture.test.ts tests/staticAnalysisConfig.test.ts tests/subcontractsUx.test.tsx tests/subcontractClaimsUx.test.tsx tests/subcontractVariationsUx.test.tsx
  ```

- [ ] **Step 2: Run the affected selector and lint**

  Run:

  ```text
  npm.cmd run test:affected:agent
  npm.cmd run lint
  ```

  Record any selector fallback or unrelated baseline failure precisely; do not label skipped/unavailable evidence as passing.

- [ ] **Step 3: Review scope and exact diff**

  Use `git diff --check`, `git status --short`, `git diff --stat`, and the complete staged/unstaged diff. Confirm no database/provider/production/dependency/Excel-native implementation changes and no protected PR-owned files changed. Recompute the final `ProcurementPage.tsx` line count.

- [ ] **Step 4: Commit and push the focused branch**

  Commit with a Slice 5 Wave B message, then push `codex/slice5-subcontract-register` without force-pushing.

- [ ] **Step 5: Open the PR and stop**

  Create a PR against current `main` with the exact base SHA, moved/retained ownership, final page line count, unchanged financial/security/provider/persistence contracts, focused/affected/lint results, delegated exact-head build/browser evidence, untouched PR #176/draft PR #179 confirmation, future-design-only Excel statement, and explicit `.xlsx` bidirectional round-trip requirement. Do not merge the PR.
