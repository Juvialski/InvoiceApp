# Repository Front Door Professionalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the current Hydroqualisense repository front door accurately communicate the maturity of the live platform and remove stale live Engoryx/npm/Bun identity signals without changing product behavior.

**Architecture:** This plan implements Slice 1 of the approved professionalization design only. It updates executable branding/package contracts, removes package-manager ambiguity, rewrites the repository-facing documentation around the live architecture, and moves provider setup documentation into `docs/`. `src/App.tsx` and `server.ts` decomposition are deliberately separate follow-up plans after this slice is merged and the live files are re-inspected.

**Tech Stack:** React 19, TypeScript, Vite, Express, Supabase/Postgres/RLS, Node test runner, GitHub Actions, Astryx theme tooling.

**Spec:** `docs/superpowers/specs/2026-09-17-repository-architecture-professionalization-design.md`

**Slice 1 status (2026-09-17):** Complete on PR #178. Slice 2 (`src/App.tsx` decomposition) and Slice 3 (`server.ts` decomposition) remain intentionally unstarted.

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

Mark Slice 1 complete in the professionalization spec/plan or current handoff only after exact-head evidence supports it. Do not change the active product sequence: Email/SMS reliability remains the active product track.

- [ ] **Step 5: Merge only after separate exact-head review confirms safety**

After merge, re-read live `main` before planning Slice 2 (`src/App.tsx` decomposition).

> The merge step remains intentionally open for the separate ChatGPT review/merge pass; Codex does not merge its own PR.
