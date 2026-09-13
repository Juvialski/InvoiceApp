# Unified Document Center Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/documents` a simple, permission-aware Library/Create/Templates workspace while preserving existing source ownership, document handoffs, and template capability boundaries.

**Architecture:** Add one allowlisted URL view contract for the existing Documents route. Keep `buildDocumentRegister` as a projection-only source aggregator, add a small business-language Create surface for supported owning workflows, render the existing template administration component under Documents -> Templates, and leave Settings with a link only. No database or Storage schema changes are part of this slice.

**Tech Stack:** React, TypeScript, existing app-router helpers, OperationsUI primitives, Vitest/node:test source-contract tests, Vite build, Workflow Map validation.

**Spec:** `docs/superpowers/specs/2026-09-14-unified-document-center-design.md`

## Global Constraints

- Existing domain records remain authoritative; Documents is a projection and handoff surface.
- `DocumentWorkspaceView` accepts only `library`, `create`, or `templates`; invalid values resolve to `library`.
- Template administration remains behind the existing company settings read/manage and server capability boundaries.
- Do not add a generic `documents` table, migration, RLS policy, Storage bucket, provider, DOCX fixture, or generated Word layout in this slice.
- Do not expose payroll metadata unless the existing payroll/report permission is present.
- Preserve `/documents`, existing owner routes, Email/SMS handoff query contracts, and Settings/deep-link compatibility.
- Use business language in the primary UI; keep provenance and technical metadata secondary.
- Run focused tests first, then the affected selector, lint, build, Workflow Map checks, and authenticated responsive validation when available.

---

### Task 1: Add the Documents workspace URL contract

**Files:**
- Modify: `src/utils/appRouteContracts.ts`
- Modify: `src/utils/appRouting.ts`
- Test: `tests/appRouting.test.ts`

**Interfaces:**
- Produces `DocumentWorkspaceView = "library" | "create" | "templates"`.
- Produces `documentWorkspaceContextFromSearch(search: string): { view: DocumentWorkspaceView }`.
- Produces `appPathForDocumentsWorkspace(view?: DocumentWorkspaceView): string`.
- Existing `/documents` remains the default path and resolves to `{ view: "library" }`.

- [ ] **Step 1: Extend the route query contract**

Add `documents: ["view"]` to `BASE_ROUTE_QUERY_KEYS` in `src/utils/appRouteContracts.ts`. Do not add unbounded query keys or accept arbitrary values.

- [ ] **Step 2: Add the typed parser and builder**

In `src/utils/appRouting.ts`, add:

```ts
export type DocumentWorkspaceView = "library" | "create" | "templates";

export interface DocumentWorkspaceContext {
  readonly view: DocumentWorkspaceView;
}

export function documentWorkspaceContextFromSearch(search: string): DocumentWorkspaceContext {
  const value = new URLSearchParams(search.startsWith("?") ? search : `?${search}`).get("view");
  return { view: value === "create" || value === "templates" ? value : "library" };
}

export function appPathForDocumentsWorkspace(view: DocumentWorkspaceView = "library") {
  const query = new URLSearchParams();
  if (view !== "library") setRouteQueryValue(query, "documents", "view", view, true);
  const suffix = query.toString();
  return `${appPathForTab("documents")}${suffix ? `?${suffix}` : ""}`;
}
```

Use the existing contract helper for query writes and keep `library` canonical as `/documents`.

- [ ] **Step 3: Write routing regression tests**

Add tests to `tests/appRouting.test.ts` that assert:

```ts
assert.deepEqual(documentWorkspaceContextFromSearch(""), { view: "library" });
assert.deepEqual(documentWorkspaceContextFromSearch("?view=create"), { view: "create" });
assert.deepEqual(documentWorkspaceContextFromSearch("view=templates"), { view: "templates" });
assert.deepEqual(documentWorkspaceContextFromSearch("?view=unknown"), { view: "library" });
assert.equal(appPathForDocumentsWorkspace(), "/documents");
assert.equal(appPathForDocumentsWorkspace("create"), "/documents?view=create");
assert.equal(appPathForDocumentsWorkspace("templates"), "/documents?view=templates");
```

- [ ] **Step 4: Run the focused routing test**

Run: `npm.cmd test -- --test-name-pattern="Documents workspace|documents workspace|route URLs" tests/appRouting.test.ts`

Expected: PASS, with no existing routing regression.

- [ ] **Step 5: Commit the routing contract**

```text
git add src/utils/appRouteContracts.ts src/utils/appRouting.ts tests/appRouting.test.ts
git commit -m "feat: add Documents workspace view routing"
```

### Task 2: Build the Library/Create/Templates shell

**Files:**
- Modify: `src/app/routes/AppRouter.tsx`
- Modify: `src/app/routes/DocumentsRoute.tsx`
- Create: `src/components/documents/DocumentCreateView.tsx`
- Test: `tests/documentCenter.test.ts`

**Interfaces:**
- `DocumentsRoute` consumes `view?: DocumentWorkspaceView` and existing source arrays.
- `DocumentCreateView` consumes `onNavigatePath?: AppNavigate` and the current permission snapshot from `useAppPermissions()`.
- The route renders the existing Library for `library`, the business-oriented Create view for `create`, and delegates Templates to the existing `CompanyDocumentTemplatesSettings` component for `templates`.

- [ ] **Step 1: Add source-contract tests for the shell**

Create `tests/documentCenter.test.ts` with assertions that the route source contains `Library`, `Create`, `Templates`, `data-document-center-nav`, and the existing `buildDocumentRegister` call; assert the Create component contains business labels and does not expose internal implementation class names. Also assert a permissions-only fixture can still build the existing mixed projection through `buildDocumentRegister`.

- [ ] **Step 2: Pass the parsed view from the router**

Import `documentWorkspaceContextFromSearch` in `src/app/routes/AppRouter.tsx` and pass `view={documentWorkspaceContextFromSearch(route.search).view}` to `DocumentsRoute`. Keep all current source props and owner handlers unchanged.

- [ ] **Step 3: Add the route navigation control**

In `DocumentsRoute.tsx`, add a compact navigation element with three buttons/links that call `onNavigatePath?.(appPathForDocumentsWorkspace(view))` or the existing browser fallback. Set `aria-current` for the active view and `data-document-center-nav="true"`. Keep the page header and Library actions understandable.

- [ ] **Step 4: Extract the Create view**

Create `DocumentCreateView.tsx` with permission-filtered options:

```ts
type CreateOption = {
  id: "purchase-order" | "client-invoice" | "supplier-document" | "project-report" | "payroll-report" | "engineering-document" | "templates";
  label: string;
  description: string;
  permission: PermissionKey;
  path: string;
};
```

Use these existing destinations: Purchase Order -> `/procurement`, Client Invoice -> `/projects`, Supplier document -> `/extract`, Project report -> `/reports`, Payroll report -> `/reports`, Engineering document -> `/projects`, Templates -> `appPathForDocumentsWorkspace("templates")`. Do not label the destination as a generated artifact. Hide payroll options without `reports.payroll.read`, and hide engineering options without `engineering.documents.create` or `engineering.documents.read`. Use `hasPermission` and `PERMISSION_KEYS`; do not infer from role names.

- [ ] **Step 5: Make Library filters and actions view-aware**

Keep the current search/type filters first and retain More filters. Ensure Library-only controls and summary use `data-documents-list`, `Open owning record`, and existing preview/send/history handlers. Add project and counterparty selectors only if their values are already present in `DocumentRegisterEntry`; do not add a new data fetch or duplicate source state.

- [ ] **Step 6: Render the three views**

Render the existing Library markup for `library`; render `DocumentCreateView` for `create`; render a Templates wrapper with `data-document-templates-view="true"` and the existing `CompanyDocumentTemplatesSettings` for `templates`. If template administration is unavailable for the current permission profile, show a clear read-only/access explanation instead of an empty shell.

- [ ] **Step 7: Run the focused Document Center tests**

Run: `npm.cmd test -- --test-name-pattern="Document Center|Documents workspace|projection" tests/documentCenter.test.ts tests/emailSmsDocumentsWorkspace.test.ts`

Expected: PASS, including the existing source-ownership and Email/SMS handoff assertions.

- [ ] **Step 8: Commit the shell**

```text
git add src/app/routes/AppRouter.tsx src/app/routes/DocumentsRoute.tsx src/components/documents/DocumentCreateView.tsx tests/documentCenter.test.ts
git commit -m "feat: add unified Documents workspace shell"
```

### Task 3: Move template discoverability out of Settings

**Files:**
- Modify: `src/components/Settings.tsx`
- Modify: `src/app/routes/SettingsRoute.tsx`
- Modify: `src/app/routes/AppRouter.tsx`
- Test: `tests/documentCenter.test.ts`
- Test: `tests/documentTemplates.test.ts`

**Interfaces:**
- `SettingsRoute` accepts `onNavigatePath?: AppNavigate`.
- Settings renders a small `Manage Document Templates` route link, not the full template administration component.
- Documents -> Templates remains the only full normal template-management surface.

- [ ] **Step 1: Add the Settings navigation prop**

Extend `SettingsRouteProps` and `Settings` props with `onNavigatePath?: AppNavigate`; pass the existing router callback from `AppRouter`.

- [ ] **Step 2: Replace the full Settings template surface with a link**

Remove the `CompanyDocumentTemplatesSettings` mount from `Settings.tsx`. Add a compact section explaining that Word template administration lives in Documents and a button/link that opens `appPathForDocumentsWorkspace("templates")` through `onNavigatePath` or the browser fallback. Keep company profile, regional settings, provider configuration, and Features & Roadmap in Settings.

- [ ] **Step 3: Preserve capability wording tests**

Update source-contract assertions so they verify the full template component is rendered by DocumentsRoute and Settings contains `Manage Document Templates` plus the Documents route, while the existing template component still contains its Storage/AI/PDF truth and prepare/review wording.

- [ ] **Step 4: Run focused template/navigation tests**

Run: `npm.cmd test -- --test-name-pattern="template|Documents|Settings" tests/documentTemplates.test.ts tests/documentCenter.test.ts tests/navigationRoutes.test.ts tests/navigationModel.test.ts`

Expected: PASS, with no change to server template APIs or capability gating.

- [ ] **Step 5: Commit the template relocation**

```text
git add src/components/Settings.tsx src/app/routes/SettingsRoute.tsx src/app/routes/AppRouter.tsx tests/documentCenter.test.ts tests/documentTemplates.test.ts
git commit -m "feat: make Documents the template workspace entry point"
```

### Task 4: Synchronize product-truth documentation

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`
- Modify: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`
- Modify: `docs/HYDROQUALISENSE_DOCUMENT_TEMPLATES_WAVE4A.md`
- Create: `docs/HYDROQUALISENSE_UNIFIED_DOCUMENT_CENTER.md`
- Modify: `src/config/productFeatures.ts` only if its user-facing Documents description is stale

**Interfaces:**
- Documentation records the explicit user reprioritization to Wide Documents and the first-slice boundary.
- Client-facing Settings truth describes only usable Library/Create/Templates behavior; it does not mention PRs, SHAs, migrations, internal phases, or agent mechanics.

- [ ] **Step 1: Record the durable product contract**

Create `docs/HYDROQUALISENSE_UNIFIED_DOCUMENT_CENTER.md` from the approved design, documenting Library/Create/Templates, projection ownership, the permanent DOCX template-first rule, programmatic XLSX default, permission boundaries, current supported sources, and deferred managed-document/artifact work.

- [ ] **Step 2: Reconcile active sequence and handoff**

Update the active roadmap and current handoff so the user reprioritization is recorded as the active Wide Documents Phase, Slice 1 is implemented, the exact next slice is template-first managed document generation using the three supplied HSC DOCX fixtures, Wave 4D provider work remains later, and Worker Registration remains paused.

- [ ] **Step 3: Update Wave 4A wording**

State that normal template administration is discoverable under Documents -> Templates while Settings retains only a link; preserve the existing server Storage/AI/PDF capability truth.

- [ ] **Step 4: Review client-facing feature truth**

Inspect `src/config/productFeatures.ts`. Update only the Documents description/status if it still says the workspace is merely a limited projection; do not mark managed uploads, HSC generation, or the entire Wide Documents Phase Available before those slices exist.

- [ ] **Step 5: Run documentation/source-contract checks**

Run: `npm.cmd test -- --test-name-pattern="feature|product truth|document" tests/productFeaturesRoadmap.test.ts tests/productTruthSurfaces.test.ts tests/documentCenter.test.ts`

Expected: PASS with no internal engineering terms leaking into client-facing feature copy.

- [ ] **Step 6: Commit documentation synchronization**

```text
git add AGENTS.md docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md docs/HYDROQUALISENSE_CURRENT_HANDOFF.md docs/HYDROQUALISENSE_DOCUMENT_TEMPLATES_WAVE4A.md docs/HYDROQUALISENSE_UNIFIED_DOCUMENT_CENTER.md src/config/productFeatures.ts
git commit -m "docs: establish Unified Document Center phase contract"
```

### Task 5: Integrated validation and handoff

**Files:**
- Review: all changed files and `git diff --check`

- [ ] **Step 1: Run the edited tests**

Run the exact focused commands from Tasks 1-4 and record pass/fail counts.

- [ ] **Step 2: Run affected validation**

Run: `npm.cmd run test:affected:agent`

Expected: the selector chooses the routing, navigation, Documents, template, and product-truth clusters; report any intentional skips separately.

- [ ] **Step 3: Run lint and build**

Run: `npm.cmd run lint` and `npm.cmd run build`.

Expected: both pass; existing non-blocking warnings remain identified rather than hidden.

- [ ] **Step 4: Run Workflow Map/source-contract validation**

Run the repository’s relevant Workflow Map consistency command discovered from `package.json` and the changed route contract tests. Confirm the new Documents query contract is represented wherever the repository requires generated route metadata.

- [ ] **Step 5: Perform authenticated responsive validation when credentials/runtime are available**

Open `/documents`, `/documents?view=create`, and `/documents?view=templates` in QA/local authenticated mode at desktop, constrained laptop, tablet, and phone widths. Verify Library is default, controls do not overflow, Create options respect permissions, Templates is reachable, Settings link routes correctly, and no production target is used. If QA credentials or Storage authority are unavailable, report the exact boundary as NOT TESTED/BLOCKED; do not substitute demo rendering for persistence evidence.

- [ ] **Step 6: Review the final diff and status**

Run: `git diff --check`, `git status --short --branch`, and `git diff --stat`.

Confirm no migration, production write, provider work, Worker Registration, attendance, or unrelated UI cleanup entered the branch.

- [ ] **Step 7: Commit any final correction and report the handoff**

Report the base SHA, branch/head SHA, changed architecture, tests/checks, browser evidence, skipped evidence, and the exact next slice. Do not claim the full Wide Documents Phase, HSC template generation, managed uploads, or artifact persistence complete until their dedicated slices pass.

