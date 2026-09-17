# Repository Front Door Professionalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the current Hydroqualisense repository front door accurately communicate the maturity of the live platform and remove stale live Engoryx/npm/Bun identity signals without changing product behavior.

**Architecture:** This document is the original Slice 1 implementation plan for the approved professionalization design. Slice 1 updated executable branding/package contracts, removed package-manager ambiguity, rewrote the repository-facing documentation around the live architecture, and moved provider setup documentation into `docs/`. Slice 2 subsequently decomposed `src/App.tsx` in PR #180, and Slice 3 decomposed `server.ts` in PR #182.

**Tech Stack:** React 19, TypeScript, Vite, Express, Supabase/Postgres/RLS, Node test runner, GitHub Actions, Astryx theme tooling.

**Spec:** `docs/superpowers/specs/2026-09-17-repository-architecture-professionalization-design.md`

**Professionalization status (2026-09-18):** Slice 1 complete in PR #178. Slice 2 (`src/App.tsx` domain-controller decomposition) complete in PR #180 and merged as `822da0d6bde69bb9c25fc77fa1e55641ae67ff61`. Slice 3 (`server.ts` decomposition) complete in PR #182 and merged as `7b13b1723f400da4207c6112b314065cc2a4d7fd`. PR #176 Email/SMS reliability work remains isolated and was untouched by Slices 2-3.

## Slice 2 completion record

PR #180 extracted three focused controller boundaries from `App.tsx`:

- procurement -> `src/features/procurement/useProcurementController.ts`;
- inventory/materials/equipment -> `src/features/inventory/useInventoryEquipmentController.ts`;
- Cash & Banking/reconciliation -> `src/features/finance/useCashBankingController.ts`.

`App.tsx` still owns authentication, navigation, workspace synchronization, cross-domain derived views/integration, payroll and remaining invoice/expense orchestration, and `AppRouter` composition. This is a material context reduction, not a claim that `App.tsx` is fully decomposed. No replacement mega-controller/global state bag was introduced. PR #180 changed no database/migration/provider/production files and none of PR #176's owned recovery files. Its exact PR head passed all four protected checks before merge.

## Global Constraints

- Preserve one deployment -> one client company and all existing `company_id`, membership, RLS, permission, and company-bound integrity controls.
- Preserve financial, payroll, procurement, billing, collection, settlement, inventory, document, and audit/history semantics.
- Unknown monetary values must never silently become zero.
- Preserve routes/deep links and current Email/SMS/provider behavior.
- Do not edit PR #176-owned files while it remains active: `src/lib/authenticatedRequestRecovery.ts`, `src/lib/companyApi.ts`, `tests/authenticatedRequestRecovery.test.ts`.
- No database migration or production mutation.
- npm is authoritative because protected CI runs `npm ci`; remove `bun.lock`.
- Historical `docs/ENGORYX_*.md` filenames may remain as history. Current runtime/package/type identifiers should use Hydroqualisense/product-neutral naming.
- Run local validation when the repository environment supports it, while still requiring exact-head GitHub Actions evidence for the PR; do not infer provider, hosted-QA, or production certification from local tests.

---

### Task 1: Lock the current runtime identity with a failing regression test

**Files:**
- Modify: `tests/brandConfig.test.ts`

**Interfaces:**
- Consumes: `BRAND`, `package.json`, `src/main.tsx`, `src/ui/index.ts`.
- Produces: executable contract requiring current package/theme/provider naming.

- [x] **Step 1: Change package expectation before production code**

Replace:

```ts
assert.equal(pkgJson.name, 'engoryx');
```

with:

```ts
assert.equal(pkgJson.name, 'hydroqualisense');
```

Add source assertions that:

```ts
const mainSource = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const uiIndexSource = readFileSync(new URL('../src/ui/index.ts', import.meta.url), 'utf8');
assert.match(mainSource, /HydroqualisenseThemeProvider/);
assert.doesNotMatch(mainSource, /EngoryxThemeProvider/);
assert.match(uiIndexSource, /hydroqualisenseTheme/);
assert.doesNotMatch(uiIndexSource, /engoryxTheme/);
```

- [x] **Step 2: Commit only the red test**

Commit message: `test: require current Hydroqualisense runtime identity`.

- [x] **Step 3: Open the draft PR and verify exact-head Application Validation fails for the expected stale identity**

Expected failure: package name and/or live theme/provider identifiers still use Engoryx naming.

---

### Task 2: Normalize npm/package and live UI theme identity

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Delete: `bun.lock`
- Create: `src/ui/HydroqualisenseThemeProvider.tsx`
- Create: `src/ui/hydroqualisenseTheme.ts`
- Create/regenerate: `src/ui/hydroqualisense.css`
- Create/regenerate: `src/ui/hydroqualisense.js`
- Create/regenerate: `src/ui/hydroqualisense.d.ts`
- Create/regenerate: `src/ui/hydroqualisense.variants.d.ts`
- Modify: `src/ui/icons.ts`
- Modify: `src/ui/index.ts`
- Modify: `src/main.tsx`
- Delete: `src/ui/EngoryxThemeProvider.tsx`
- Delete: `src/ui/engoryxTheme.ts`
- Delete: `src/ui/engoryx.css`
- Delete: `src/ui/engoryx.js`
- Delete: `src/ui/engoryx.d.ts`

**Interfaces:**
- `HydroqualisenseThemeProvider`
- `HydroqualisenseThemeProviderProps`
- `hydroqualisenseTheme`
- `hydroqualisenseIconRegistry`
- Build command: `astryx theme build src/ui/hydroqualisenseTheme.ts --out src/ui/hydroqualisense.css --icons-specifier ./icons.ts`

- [x] **Step 1: Rename package identity only**

Set `package.json.name`, `package-lock.json.name`, and `package-lock.json.packages[""].name` to `hydroqualisense`. Preserve version `0.3.0` and every dependency/version.

- [x] **Step 2: Delete `bun.lock`**

Do not introduce another lockfile.

- [x] **Step 3: Rename theme symbols without changing visual values**

In the renamed theme source:

```ts
const hydroqualisenseSyntax = defineSyntaxTheme({
  name: "hydroqualisense-syntax",
  // existing tokens unchanged
});

export const hydroqualisenseTheme = defineTheme({
  name: "hydroqualisense",
  syntax: hydroqualisenseSyntax,
  // existing typography, motion, tokens and component values unchanged
  icons: hydroqualisenseIconRegistry,
});
```

The provider becomes:

```tsx
export interface HydroqualisenseThemeProviderProps {
  children: ReactNode;
  mode?: AstryxThemeMode;
}

export function HydroqualisenseThemeProvider({ children, mode = "light" }: HydroqualisenseThemeProviderProps) {
  return <Theme theme={hydroqualisenseTheme} mode={mode}>{children}</Theme>;
}
```

- [x] **Step 4: Update `src/main.tsx` and `src/ui/index.ts` to the new exports**

No route/component behavior changes.

- [x] **Step 5: Update `package.json` Astryx paths and regenerate equivalent generated artifacts**

Generated CSS/JS/type output must remain behaviorally equivalent except identifier/name strings and filenames.

- [x] **Step 6: Push and verify the Task 1 regression turns green**

Application Validation must also prove `npm ci`, TypeScript lint/typecheck, affected tests, and production build.

---

### Task 3: Remove current live Engoryx feature-registry type identifiers

**Files:**
- Modify: `tests/brandConfig.test.ts`
- Modify: `src/features/types.ts`
- Modify: `src/features/registry.ts`
- Modify: `src/features/availability.ts`
- Modify compile consumers only when exact-head CI identifies them.

**Interfaces:**
- `EngoryxFeatureDefinition` -> `ProductFeatureDefinition`
- `ENGORYX_FEATURE_REGISTRY` -> `PRODUCT_FEATURE_REGISTRY`
- Existing `getFeaturesByPhase`, `getFeaturesByStatus`, `getFeatureById` signatures remain functionally identical.

- [x] **Step 1: Change the test import first**

```ts
import { PRODUCT_FEATURE_REGISTRY, getFeaturesByPhase, getFeaturesByStatus, getFeatureById } from '../src/features/registry.ts';
```

Change the registry-length assertion to `PRODUCT_FEATURE_REGISTRY.length`.

- [x] **Step 2: Verify RED in exact-head CI because the new export does not yet exist**

- [x] **Step 3: Rename production types/constants mechanically**

Preserve feature IDs, phases, statuses, permissions, route IDs, open-source candidates, and historical documentation references exactly.

- [x] **Step 4: Fix only compile consumers of the renamed current identifiers**

No feature/status/roadmap behavior changes.

---

### Task 4: Replace README with the current repository front door

**Files:**
- Replace: `README.md`
- Create: `docs/architecture/OVERVIEW.md`

**Interfaces:**
- README links to `docs/architecture/OVERVIEW.md`, active roadmap, current handoff, deployment runbook/strategy, and generated Workflow Map.

- [x] **Step 1: Use these README sections**

```text
# Hydroqualisense
## What the platform does
## Architecture at a glance
## Engineering invariants
## Repository structure
## Local development
## Validation and CI
## Deployment model
## Current project status
```

The README must describe React/Vite, Express, Supabase/Postgres/RLS/Storage, server-only provider integrations, migrations, tests, protected CI, local/hosted QA, and the isolated-client deployment model. It must not lead with the old September 5 roadmap reset.

- [x] **Step 2: Add architecture overview**

Document this flow:

```text
Browser/UI -> route components -> domain controllers/libs -> authenticated server APIs -> Supabase/Postgres/Storage
```

Document these ownership boundaries:
- supplier invoices/source evidence vs Expense/payable authority;
- client billing vs collections;
- inventory movements vs derived balances;
- payroll detail vs project labor aggregates;
- immutable/issued document history;
- permission-based authorization and one-company deployment boundary;
- human confirmation for consequential AI-assisted actions.

- [x] **Step 3: Keep claims evidence-based**

No invented coverage percentage, uptime, compliance certification, provider readiness, or production certification.

---

### Task 5: Move Google/Brevo setup under `docs/` and update all references

**Files:**
- Create: `docs/GOOGLE_SIGNIN_BREVO_SETUP.md` with exact current root content.
- Delete: `GOOGLE_SIGNIN_BREVO_SETUP.md`
- Modify: `AGENTS.md`
- Modify: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`
- Modify: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`
- Modify any additional exact reference discovered by repository/API search.

**Interfaces:**
- Canonical path: `docs/GOOGLE_SIGNIN_BREVO_SETUP.md`.

- [x] **Step 1: Copy document content unchanged**
- [x] **Step 2: Replace every current reference with the canonical `docs/` path**
- [x] **Step 3: Delete the root file only after references are fixed**

---

### Task 6: Repository metadata and final exact-head verification

**Files:**
- No fake metadata/config file.
- Update PR description with any connector limitation.

**Interfaces:**
- Desired GitHub description: `Hydroqualisense — operations platform for projects, procurement, finance, payroll, inventory, documents, and business communications.`
- Desired homepage: `https://hydroqualisense.com`
- Desired topics: `typescript`, `react`, `supabase`, `operations`, `project-management`, `finance`, `payroll`, `inventory`.

- [x] **Step 1: Apply repository metadata only if a supported repository-update action exists**

If not exposed by the connected GitHub capability, state that precise limitation in the PR; do not pretend metadata changed.

- [x] **Step 2: Inspect the complete PR diff**

There must be no migration, database, financial-semantic, provider-behavior, route, permission, or PR #176-owned changes.

- [x] **Step 3: Verify exact-head CI**

Required evidence:
- Application Validation & Build: green on exact head.
- Database workflow: expected fast-pass/database-unaffected unless classifier behavior says otherwise.
- Browser/Workflow Map: inspect only if their classifiers mark this diff relevant.

- [x] **Step 4: Synchronize professionalization documentation only to completed truth**

Slice 1 completion was recorded after exact-head evidence. This document now also records the later Slice 2 completion without changing the active product sequence: Email/SMS reliability remains the active product track.

- [x] **Step 5: Merge only after separate exact-head review confirms safety**

PR #178 was merged after separate review. Slice 2 was subsequently implemented and merged independently in PR #180. Slice 3 was implemented and merged independently in PR #182 after exact-head review and CI verification.
