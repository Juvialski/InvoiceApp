# Repository & Architecture Professionalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Hydroqualisense present and read like a professionally engineered operations platform while reducing the two largest orchestration hotspots without changing product behavior.

**Architecture:** Execute three independently reviewable slices. Slice 1 fixes repository-facing truth, npm/package hygiene, current runtime naming, and architecture documentation. Slice 2 extracts bounded application controllers from `src/App.tsx` using existing `src/features/*` patterns. Slice 3 extracts shared authorization and remaining inline API domains from `server.ts` into `src/server/*` modules while preserving route contracts.

**Tech Stack:** React 19, TypeScript, Vite, Express, Supabase/Postgres/RLS, Node test runner, GitHub Actions, Astryx theme tooling.

**Spec:** `docs/superpowers/specs/2026-09-17-repository-architecture-professionalization-design.md`

## Global Constraints

- Preserve one deployment -> one client company and all existing `company_id`, membership, RLS, permission, and company-bound integrity controls.
- Preserve financial, payroll, procurement, billing, collection, settlement, inventory, document, and audit history semantics.
- Unknown monetary values must never silently become zero.
- Preserve existing routes/deep links and current provider behavior.
- Do not edit PR #176-owned files while it remains active: `src/lib/authenticatedRequestRecovery.ts`, `src/lib/companyApi.ts`, `tests/authenticatedRequestRecovery.test.ts`.
- No database migration or production mutation is part of this work.
- npm is the authoritative package manager because CI runs `npm ci`.
- Use focused/new tests -> `npm run test:affected:agent` -> only relevant lint/build/browser/Workflow Map checks. Do not ritual-run `test:full`.
- Container-local validation is unavailable in this ChatGPT session because the container cannot resolve GitHub; use exact-head GitHub Actions evidence and do not claim local test execution.

---

## Slice 1 — Repository front door and runtime naming

### Task 1: Lock the current-brand contract with a failing regression test

**Files:**
- Modify: `tests/brandConfig.test.ts`

**Interfaces:**
- Consumes: `BRAND`, `package.json`, live UI entry files.
- Produces: an executable contract that current package and theme identifiers use Hydroqualisense naming while historical documentation filenames may remain unchanged.

- [ ] **Step 1: Change the package expectation before production code**

Replace:

```ts
assert.equal(pkgJson.name, 'engoryx');
```

with:

```ts
assert.equal(pkgJson.name, 'hydroqualisense');
```

Add source checks that read `src/main.tsx`, `src/ui/index.ts`, and `src/ui/HydroqualisenseThemeProvider.tsx` and assert that the live entry points contain `HydroqualisenseThemeProvider` / `hydroqualisenseTheme` and do not expose `EngoryxThemeProvider` / `engoryxTheme`.

- [ ] **Step 2: Commit the red test only**

Commit message:

```text
test: require current Hydroqualisense runtime identity
```

- [ ] **Step 3: Open/update the draft PR and verify the test fails for the intended reason**

Expected failing reason: the package and live theme/provider identifiers are still `engoryx` / `Engoryx` and/or the new Hydroqualisense provider file does not yet exist.

### Task 2: Normalize package manager and live theme identity

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Delete: `bun.lock`
- Create: `src/ui/HydroqualisenseThemeProvider.tsx`
- Create: `src/ui/hydroqualisenseTheme.ts`
- Regenerate/create: `src/ui/hydroqualisense.css`
- Regenerate/create: `src/ui/hydroqualisense.js`
- Regenerate/create: `src/ui/hydroqualisense.d.ts`
- Modify: `src/ui/icons.ts`
- Modify: `src/ui/index.ts`
- Modify: `src/main.tsx`
- Delete after replacements are wired: `src/ui/EngoryxThemeProvider.tsx`, `src/ui/engoryxTheme.ts`, `src/ui/engoryx.css`, `src/ui/engoryx.js`, `src/ui/engoryx.d.ts`

**Interfaces:**
- Produces: `HydroqualisenseThemeProvider`, `hydroqualisenseTheme`, `hydroqualisenseIconRegistry`.
- Build contract: `astryx theme build src/ui/hydroqualisenseTheme.ts --out src/ui/hydroqualisense.css --icons-specifier ./icons.ts`.

- [ ] **Step 1: Rename package identity without changing dependency versions**

Set `package.json.name` and the root package name entries in `package-lock.json` to `hydroqualisense`. Preserve version `0.3.0` and all dependency versions.

- [ ] **Step 2: Make npm the only committed lockfile**

Delete `bun.lock`. Do not add a replacement lockfile.

- [ ] **Step 3: Rename theme source symbols mechanically**

Use these exact public identifiers:

```ts
export const hydroqualisenseIconRegistry: IconRegistry = { ... }
export const hydroqualisenseTheme = defineTheme({ name: "hydroqualisense", ... })
export interface HydroqualisenseThemeProviderProps { ... }
export function HydroqualisenseThemeProvider(...) { ... }
```

Preserve all existing tokens, colors, typography, component configuration, and icons. This is a naming refactor, not a visual redesign.

- [ ] **Step 4: Update app entry and UI barrel imports**

`src/main.tsx` must wrap the app with `HydroqualisenseThemeProvider`. `src/ui/index.ts` must export the new theme/provider names and use current-product wording in its comment.

- [ ] **Step 5: Update Astryx build script**

Change only the source/output filenames required by the rename. Preserve the existing `astryx:theme` build step and all other scripts.

- [ ] **Step 6: Verify the brand regression is green through CI**

Required evidence: the targeted brand test passes; Application Validation can install with `npm ci`, typecheck, and build with the renamed generated theme files.

### Task 3: Remove live Engoryx feature-registry identifiers without rewriting historical docs

**Files:**
- Modify: `src/features/types.ts`
- Modify: `src/features/registry.ts`
- Modify: `src/features/availability.ts`
- Modify: `tests/brandConfig.test.ts`
- Modify any current imports discovered by exact compile/CI failure.

**Interfaces:**
- Rename `EngoryxFeatureDefinition` -> `ProductFeatureDefinition`.
- Rename `ENGORYX_FEATURE_REGISTRY` -> `PRODUCT_FEATURE_REGISTRY`.
- Preserve all feature IDs, statuses, permissions, routes, and historical `docs/ENGORYX_*.md` references.

- [ ] **Step 1: Update the existing test first**

Change the test import and assertions to use `PRODUCT_FEATURE_REGISTRY` before changing production exports.

- [ ] **Step 2: Commit the failing contract**

Expected red reason: the new exports do not exist yet.

- [ ] **Step 3: Rename only live TypeScript symbols**

Do not rename feature IDs or historical documentation filenames in this task.

- [ ] **Step 4: Run exact-head CI and fix compile consumers only**

No behavioral changes are permitted.

### Task 4: Replace the stale README with a current engineering front door

**Files:**
- Replace: `README.md`
- Create: `docs/architecture/OVERVIEW.md`

**Interfaces:**
- README links to the architecture overview, active roadmap, current handoff, deployment runbook, and Workflow Map.
- Architecture overview documents ownership boundaries rather than duplicating the generated Workflow Map.

- [ ] **Step 1: Rewrite README around current product truth**

Required top-level sections:

```text
Hydroqualisense
What the platform does
Architecture at a glance
Engineering invariants
Repository structure
Local development
Validation and CI
Deployment model
Current project status
```

The README must explicitly state the current stack and implemented capabilities, and must not lead with historical September 5 roadmap reset material.

- [ ] **Step 2: Add `docs/architecture/OVERVIEW.md`**

Document these boundaries:

```text
Browser/UI -> route components -> domain controllers/libs -> authenticated server APIs -> Supabase/Postgres/Storage
```

Explain that financial and operational source ownership is domain-specific, authorization is permission-based, consequential AI writes require confirmation, and one deployment serves one client company.

- [ ] **Step 3: Keep evidence truthful**

Describe tests/CI that exist; do not invent coverage percentages, certifications, SOC claims, uptime claims, or provider readiness.

### Task 5: Move provider setup documentation under `docs/`

**Files:**
- Create: `docs/GOOGLE_SIGNIN_BREVO_SETUP.md` with the exact current root document content.
- Delete: `GOOGLE_SIGNIN_BREVO_SETUP.md`
- Modify references in: `AGENTS.md`, `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`, `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`, and any other current file found by repository search.

**Interfaces:**
- New canonical path: `docs/GOOGLE_SIGNIN_BREVO_SETUP.md`.

- [ ] **Step 1: Copy content without changing provider policy**
- [ ] **Step 2: Update every live reference**
- [ ] **Step 3: Delete the root copy only after references are updated**

### Task 6: Record repository metadata limitation truthfully

**Files:**
- Modify: `README.md` only if needed to surface canonical production URL.
- No fake config file.

- [ ] **Step 1: Check connected GitHub capabilities for repository metadata writes**

Desired metadata:

```text
Description: Hydroqualisense — operations platform for projects, procurement, finance, payroll, inventory, documents, and business communications.
Homepage: https://hydroqualisense.com
Topics: typescript, react, supabase, operations, project-management, finance, payroll, inventory
```

- [ ] **Step 2: Apply only if the connector exposes a supported repository-update action**

If not exposed, record the limitation in the PR description rather than creating a misleading repository file.

### Task 7: Slice 1 final validation and diff review

**Files:**
- No new functional files unless validation exposes a concrete issue.

- [ ] **Step 1: Inspect the complete branch diff**

Reject scope creep: no database, financial-semantic, provider behavior, permission, route, or PR #176-owned changes.

- [ ] **Step 2: Require exact-head GitHub Actions evidence**

Expected applicable checks:
- Application Validation & Build — heavy, because package/source/tests changed.
- Demo/browser QA — only if its classifier marks the entry/UI rename relevant.
- Workflow Map — only if classifier marks affected inputs relevant.
- Database workflow should fast-pass as database-unaffected.

- [ ] **Step 3: Do not claim local validation**

The current ChatGPT container cannot reach GitHub/npm, so exact-head CI is the executable evidence for this slice.

---

## Slice 2 — `src/App.tsx` decomposition

### Task 8: Establish App composition boundary tests before extraction

**Files:**
- Create: `tests/appCompositionArchitecture.test.ts`
- Modify later: `src/App.tsx`
- Create later: focused controllers under existing `src/features/*` domains.

**Interfaces:**
- `App.tsx` remains the top-level production composition entry.
- New controllers expose explicit typed state/actions; no global state library.

- [ ] **Step 1: Add a structural regression that fails on the current monolith**

The test should verify that targeted domain orchestration imports are owned by dedicated controller modules rather than directly by `App.tsx`. Start with one bounded domain at a time; do not assert an arbitrary total line-count threshold.

- [ ] **Step 2: Verify RED through the draft PR CI**

### Task 9: Extract finance/cash/billing orchestration as the first App slice

**Files:**
- Create: `src/features/finance/useFinanceWorkspaceController.ts`
- Modify: `src/App.tsx`
- Add focused controller tests.

**Interfaces:**
- Controller owns cash/banking, client billing/collection, expense, FX, and supplier-settlement workspace orchestration already coordinated in `App.tsx`.
- It must consume existing `src/lib/*` functions rather than duplicating persistence or financial semantics.

- [ ] **Step 1: Write focused controller contract tests first**
- [ ] **Step 2: Move existing orchestration with behavior unchanged**
- [ ] **Step 3: Keep cross-domain callbacks explicit**
- [ ] **Step 4: Run focused -> affected -> lint/build -> relevant browser/Workflow Map CI**

### Task 10: Continue App extraction by existing domain boundaries

**Files:**
- Create as justified by actual App sections: `src/features/payroll/usePayrollWorkspaceController.ts`, `src/features/inventory/useInventoryWorkspaceController.ts`, `src/features/procurement/useProcurementWorkspaceController.ts`.
- Reuse existing project and engineering controllers instead of replacing them.
- Modify: `src/App.tsx`, `src/app/routes/AppRouter.tsx` only where narrow route-contract grouping reduces coupling.

**Interfaces:**
- Each controller has one domain responsibility.
- `AppRouter` may receive grouped immutable domain contracts instead of hundreds of unrelated scalar props, but route behavior must remain unchanged.

- [ ] **Step 1: One domain per red/green cycle**
- [ ] **Step 2: Do not create a single replacement mega-hook**
- [ ] **Step 3: Stop extraction where remaining code is genuinely cross-domain composition/session/navigation**

---

## Slice 3 — `server.ts` decomposition

### Task 11: Extract shared request authorization first

**Files:**
- Create: `src/server/auth/companyAuthorization.ts`
- Create focused tests under `tests/` using existing server authorization patterns.
- Modify: `server.ts`.

**Interfaces:**

```ts
requestBearerToken(req)
serverSupabaseConfiguration()
requestSupabaseClient(accessToken)
publicSupabaseClient()
authenticateServerRequest(req)
authorizeCompanyRequest(req, permission)
authorizePlatformCompanyRequest(req, companyId)
ApiAuthorizationError
```

Preserve current status codes, error codes, fail-closed behavior, deployment-company checks, and permission RPC calls exactly.

- [ ] **Step 1: Write authorization contract tests before moving code**
- [ ] **Step 2: Verify RED based on missing module exports**
- [ ] **Step 3: Move implementation without semantic edits**
- [ ] **Step 4: Run focused server authorization tests and exact-head affected CI**

### Task 12: Move remaining inline route domains into existing `src/server/*` structure

**Files:**
- Create routers only for inline domains that still live in `server.ts` after inspection.
- Modify: `server.ts` to middleware/process/router composition.

**Interfaces:**
- Existing assistant, AI, messaging, storage, document-template, and delivery modules remain authoritative.
- Moved routers receive required dependencies explicitly rather than importing browser-side state.

- [ ] **Step 1: Inventory inline `app.get/post/...` routes and group by existing domain**
- [ ] **Step 2: For each group, add/identify an API contract test and verify RED before extraction**
- [ ] **Step 3: Move one group at a time and preserve path/method/status/error/idempotency contracts**
- [ ] **Step 4: Leave `server.ts` responsible for startup, global middleware, dependency composition, router mounting, and static/Vite serving**

---

## Final synchronization

### Task 13: Reconcile documentation and handoff truth

**Files:**
- Modify only if stale: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`, `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`, active professionalization spec/plan.

- [ ] **Step 1: Review exact final diff and implemented slice status**
- [ ] **Step 2: Mark only actually completed slices complete**
- [ ] **Step 3: Preserve Email/SMS reliability as the active product track; this architecture effort does not silently replace product priorities**
- [ ] **Step 4: Verify no claim depends on stale CI or a different PR head**
