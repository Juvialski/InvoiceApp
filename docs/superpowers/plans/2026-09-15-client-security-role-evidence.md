# Client Security Role Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct the permission-based Payroll boundary, capture current authenticated synthetic-QA role evidence, and publish a simple two-model client security handoff PDF.

**Architecture:** Keep the existing effective-permission resolver and route guard authoritative. Add one narrow Payroll project-reference permission and a server-authorized RPC projection so Payroll can retain legitimate project labels without receiving the full Projects workspace. Generate the client package from exact source/DB/QA/evidence state, with runtime-dependent claims remaining qualified whenever runtime proof is unavailable.

**Tech Stack:** React 19, TypeScript, Vite, Express, Supabase Postgres/Auth/RLS/RPC, Playwright QA tooling, Node test runner, Python ReportLab, Poppler.

**Spec:** `docs/superpowers/specs/2026-09-15-client-security-role-evidence-design.md`

## Global Constraints

- Start from freshly synchronized `main` at `ddbd9d683d91fd14f22bb8eb5883e36b7ed383b3`; preserve the isolated branch and do not touch production.
- The four built-in roles remain protected starter templates; authorization remains effective-permission-based and never display-role-based.
- Payroll may receive only the narrow project reference fields required by payroll context; it must not receive full project rows or the Projects workspace without `projects.read`.
- Database changes are forward-only, created with `npx.cmd supabase migration new`, and require strict replay/pgTAP/RLS/RPC/upgrade/concurrency validation when the runtime is available.
- QA evidence uses synthetic accounts and data only; screenshots must come from the tested authenticated release and must never be cosmetically altered to hide navigation.
- The client document contains no migration names, raw permission keys, test commands, Git SHAs, agent terminology, CI mechanics, secrets, PII, unsupported certification, or vendor guarantee.
- The support/custody choice is an operational record with allowed values `MANAGED_SUPPORT_ACCESS` and `INDEPENDENT_CLIENT_CONTROL`, not an application setting.
- Validate focused tests first, then `npm.cmd run test:affected:agent`, relevant lint/build/browser/DB/PDF checks, and the exact final diff; do not run the historical full suite by ritual.
- Codex is the lead, uses zero subagents, pushes the branch, opens a PR, and does not self-merge.

---

## File map

- `src/utils/accessControl.ts` remains the frontend permission vocabulary, route permission map, and default landing policy.
- `supabase/migrations/` receives one new forward migration for the narrow Payroll reference permission, built-in Payroll correction, and guarded reference RPC.
- `src/types.ts`, `src/lib/projects.ts`, `src/App.tsx`, `src/app/routes/AppRouter.tsx`, and payroll components carry a separate reference-only data shape.
- `tests/clientSecurityRoleNavigation.test.ts` and `tests/payrollProjectReferences.test.ts` prove role navigation and reference projection behavior.
- `supabase/tests/client_security_custom_roles_test.sql` gains final built-in-role and reference-RPC runtime assertions.
- `scripts/client-security/capture_role_screenshots.ts` is the reproducible authenticated QA evidence harness.
- `docs/client-facing/HYDROQUALISENSE_CLIENT_SECURITY_OVERVIEW.md`, `artifacts/client-security/EVIDENCE.md`, `artifacts/client-security/PDF_CHECKS.md`, and the handoff/deployment documents carry the evidence-backed client truth.
- `scripts/client-security/build_client_security_pdf.py` remains the deterministic PDF generator and must fail on missing source pages or screenshot assets.

---

### Task 1: Prove the final role navigation contract

**Files:**
- Create: `tests/clientSecurityRoleNavigation.test.ts`
- Modify: `tests/navigationModel.test.ts`
- Modify: `tests/appRouting.test.ts`
- Read/verify: `src/utils/accessControl.ts`, `src/navigation/navigationModel.ts`, `src/App.tsx`

**Interfaces:**
- Consumes: `getNavigationModel`, `defaultAppTabForPermissions`, `canAccessAppTab`, `PERMISSION_KEYS`.
- Produces: executable regression coverage for Company Admin, Finance, Payroll, Viewer, and a custom permission set.

- [ ] **Step 1: Write the failing navigation matrix test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { getNavigationModel } from "../src/navigation/navigationModel.ts";
import { defaultAppTabForPermissions, PERMISSION_KEYS } from "../src/utils/accessControl.ts";

const modules = (permissions: string[]) => getNavigationModel({ permissions }).modules.map((module) => module.id);

test("Payroll permissions expose only the Payroll workspace", () => {
  const permissions = [
    PERMISSION_KEYS.payrollRead,
    PERMISSION_KEYS.payrollWrite,
    PERMISSION_KEYS.payrollApprove,
    PERMISSION_KEYS.payrollSettings,
    PERMISSION_KEYS.payrollImport,
    PERMISSION_KEYS.workersRead,
    PERMISSION_KEYS.workersManage,
    PERMISSION_KEYS.workersCompensationRead,
    PERMISSION_KEYS.payrollAggregateRead,
    PERMISSION_KEYS.reportsPayrollRead,
  ];
  assert.deepEqual(modules(permissions), ["payroll", "reports"]);
  assert.equal(defaultAppTabForPermissions(permissions), "payroll");
});

test("a restricted custom role follows selected permissions, not its display name", () => {
  assert.deepEqual(modules([PERMISSION_KEYS.inventoryRead]), ["warehouse"]);
  assert.deepEqual(modules(["inventory.read"]), ["warehouse"]);
});
```

- [ ] **Step 2: Run the focused test and confirm the current mismatch is caught**

Run: `node --test --experimental-strip-types tests/clientSecurityRoleNavigation.test.ts`

Expected: FAIL because the current Payroll profile still exposes Dashboard/Projects/Documents through its existing permissions; the separate payroll Reports route remains an allowed payroll-related surface.

- [ ] **Step 3: Extend the matrix with the verified Finance, Viewer, and Company Admin expectations**

Assert that Finance includes its granted finance/operational modules but excludes `payroll` and `settings`; Viewer includes only read-capable modules and excludes `cash`, `email-sms`, `payroll`, and `settings`; Company Admin includes every permitted company module and `settingsRoute`. Use explicit permission arrays derived from the migrated grants, not `roleKey` strings.

- [ ] **Step 4: Add direct-route and access-denial regression assertions**

Assert `canAccessAppTab("projects", payrollPermissions)`, `canAccessAppTab("dashboard", payrollPermissions)`, and `canAccessAppTab("documents", payrollPermissions)` are false after the permission correction. Assert the existing `App.tsx` route-denial path still contains `routeDenied`, `canAccessAppTab`, `AccessDenied`, and a permission-derived fallback. Extend `tests/appRouting.test.ts` only for route semantics; do not make the test depend on a role label.

- [ ] **Step 5: Run the focused test to confirm the expanded red state**

Run: `node --test --experimental-strip-types tests/clientSecurityRoleNavigation.test.ts tests/navigationModel.test.ts tests/appRouting.test.ts`

Expected: the new Payroll assertions fail while unrelated route tests continue to pass.

---

### Task 2: Add the narrow Payroll reference permission and RPC

**Files:**
- Create: the migration generated by `npx.cmd supabase migration new payroll_project_reference_boundary` under `supabase/migrations/`
- Modify: `supabase/tests/client_security_custom_roles_test.sql`
- Modify: `tests/clientSecurityCustomRoles.test.ts`

**Interfaces:**
- Consumes: `private.deployment_company_id()`, `private.has_company_permission(uuid,text)`, `public.projects`.
- Produces: `payroll.project_reference.read` and `public.list_payroll_project_references(uuid)`.

- [ ] **Step 1: Create the canonical migration file through the Supabase CLI**

Run: `npx.cmd supabase migration new payroll_project_reference_boundary`

Expected: one new timestamped SQL file is created after `20260915024105_client_security_custom_roles.sql`; record its exact path for all later commands. Do not hand-invent the timestamp.

- [ ] **Step 2: Add failing static contract assertions for the new boundary**

In `tests/clientSecurityCustomRoles.test.ts`, read the generated migration and assert it contains the new permission key, deletes the six unrelated Payroll grants, defines `list_payroll_project_references`, checks `auth.uid()`, checks `private.deployment_company_id()`, checks `private.has_company_permission`, returns the five reference columns, revokes `public`/`anon`, and grants only `authenticated`.

Run: `node --test --experimental-strip-types tests/clientSecurityCustomRoles.test.ts`

Expected: FAIL because the generated migration is empty.

- [ ] **Step 3: Implement the forward migration**

Use this SQL shape in the generated file:

```sql
insert into public.company_permission_catalog (permission_key, description)
values (
  'payroll.project_reference.read',
  'Read project codes, names, and lifecycle status needed for payroll context.'
)
on conflict (permission_key) do update set description = excluded.description;

insert into public.company_role_permissions (role_key, permission_key)
values ('COMPANY_ADMIN', 'payroll.project_reference.read'),
       ('PAYROLL', 'payroll.project_reference.read')
on conflict do nothing;

delete from public.company_role_permissions
where role_key = 'PAYROLL'
  and permission_key in (
    'dashboard.read', 'projects.read', 'engineering.documents.read',
    'engineering.rfis.read', 'engineering.submittals.read',
    'engineering.sitelogs.read'
  );

drop function if exists public.list_payroll_project_references(uuid);
create function public.list_payroll_project_references(p_company_id uuid)
returns table(
  id uuid,
  project_code text,
  project_name text,
  status text,
  archived_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null then
    raise exception 'Authentication is required for payroll project references' using errcode = '42501';
  end if;
  if p_company_id is null or p_company_id is distinct from (select private.deployment_company_id()) then
    raise exception 'Payroll project references cannot target another HydroQualiSense deployment' using errcode = '42501';
  end if;
  if not (select private.has_company_permission(p_company_id, 'payroll.project_reference.read')) then
    raise exception 'Payroll project reference permission is required' using errcode = '42501';
  end if;

  return query
  select p.id, p.project_code, p.project_name, p.status, p.archived_at
  from public.projects p
  where p.company_id = p_company_id
  order by p.archived_at nulls first, lower(p.project_code), lower(p.project_name), p.id;
end;
$$;

revoke all on function public.list_payroll_project_references(uuid) from public, anon;
grant execute on function public.list_payroll_project_references(uuid) to authenticated;
```

Do not add a broader `projects` RLS allowance for this permission. The RPC is the column-limited boundary.

- [ ] **Step 4: Add database contract tests before runtime execution**

Extend `supabase/tests/client_security_custom_roles_test.sql` to assert that Payroll no longer owns the six unrelated grants, both Payroll and Company Admin retain the reference permission, and custom roles may select the reference permission while protected permissions remain rejected. Add authenticated calls proving a Payroll member can invoke the reference RPC for the configured company, while Finance/Viewer without the new permission and any wrong-company target receive `42501`.

- [ ] **Step 5: Run focused static tests and inspect the migration diff**

Run: `node --test --experimental-strip-types tests/clientSecurityCustomRoles.test.ts tests/clientSecurityRoleNavigation.test.ts`

Expected: static migration assertions pass; navigation assertions remain red until the application permission/data flow is updated.

---

### Task 3: Carry reference-only data through Payroll

**Files:**
- Modify: `src/types.ts`
- Modify: `src/utils/accessControl.ts`
- Modify: `src/lib/projects.ts`
- Modify: `src/App.tsx`
- Modify: `src/app/routes/AppRouter.tsx`
- Modify: `src/app/routes/PayrollRoute.tsx`
- Modify: `src/lib/payrollWorkflow.ts`
- Modify: `src/components/payroll/PayrollPageV2.tsx`
- Modify: `src/components/payroll/PayrollRunView.tsx`
- Modify: `src/components/payroll/PayrollEntryForm.tsx`
- Modify: `src/components/payroll/PayrollImportWorkflow.tsx`
- Modify: `src/components/payroll/PayrollProfiles.tsx`
- Modify: `src/components/payroll/WorkersTable.tsx`
- Modify: `src/components/payroll/ProjectAssignments.tsx`
- Modify: `src/components/payroll/TimeEntries.tsx`
- Create: `tests/payrollProjectReferences.test.ts`

**Interfaces:**
- Consumes: `list_payroll_project_references(uuid)`.
- Produces: `PayrollProjectReference`, `parsePayrollProjectReferences`, and `loadPayrollProjectReferencesFromSupabase()`; Payroll screens accept only the reference type.

- [ ] **Step 1: Write the failing reference projection test**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { parsePayrollProjectReferences } from "../src/lib/projects.ts";

test("payroll project references retain only identity and lifecycle fields", () => {
  const [reference] = parsePayrollProjectReferences([{
    id: "project-1",
    project_code: "QA-001",
    project_name: "Synthetic project",
    status: "ACTIVE",
    archived_at: null,
    project_budget: 999999,
    client_name: "Should not cross the reference boundary",
  }]);
  assert.deepEqual(reference, {
    id: "project-1",
    projectCode: "QA-001",
    projectName: "Synthetic project",
    status: "ACTIVE",
  });
  assert.equal("projectBudget" in reference, false);
  assert.equal("clientName" in reference, false);
});
```

- [ ] **Step 2: Run the reference test and confirm the import is missing**

Run: `node --test --experimental-strip-types tests/payrollProjectReferences.test.ts`

Expected: FAIL because `parsePayrollProjectReferences` and `PayrollProjectReference` do not yet exist.

- [ ] **Step 3: Implement the reference type, parser, and RPC loader**

Add this structural type next to `Project` in `src/types.ts`:

```ts
export interface PayrollProjectReference {
  id: string;
  projectCode: string;
  projectName: string;
  status: ProjectStatus;
  archivedAt?: string;
}
```

In `src/lib/projects.ts`, export `PAYROLL_PROJECT_REFERENCES_RPC`, a parser that accepts snake_case or camelCase RPC rows and returns only the five allowed fields, and a loader that authenticates through the existing Supabase client, resolves `requireActiveCompanyId()`, calls the RPC, and never calls `.from("projects").select("*")`.

Add `payrollProjectReferenceRead: "payroll.project_reference.read"` to `PERMISSION_KEYS`, its display label/group, and `ALL_PERMISSION_KEYS` through the existing object mechanism.

- [ ] **Step 4: Run the parser test and confirm it passes**

Run: `node --test --experimental-strip-types tests/payrollProjectReferences.test.ts`

Expected: PASS with no sensitive project fields in the parsed object.

- [ ] **Step 5: Separate Payroll reference state from full project state**

In `src/App.tsx`, add `payrollProjectReferences` state and clear it with the workspace reset. Extend the engineering refresh payload with a separate reference array. When the caller has `projects.read`, retain the existing full project loader; when the caller has only `payroll.project_reference.read`, call the new RPC loader and keep `projects` empty. Include the new permission in the engineering refresh-group allowance and failure accounting.

Use `const payrollProjectContext = projects.length ? projects : payrollProjectReferences` for Payroll source freshness/calculation and pass it through `AppRouter` only to the Payroll route. Do not apply reference rows to `projectController.applyProjects`.

- [ ] **Step 6: Type Payroll components against the narrow reference shape**

Change Payroll page/run/form/profile/worker/assignment/time-entry props and `payrollWorkflow` project inputs from `Project[]` to `PayrollProjectReference[]` wherever they only display `id`, `projectCode`, `projectName`, `status`, or `archivedAt`. Preserve full `Project[]` for non-Payroll routes. Keep payroll source fingerprints based on referenced project id/status/archive fields.

- [ ] **Step 7: Run the focused parser, navigation, and type checks**

Run: `node --test --experimental-strip-types tests/payrollProjectReferences.test.ts tests/clientSecurityRoleNavigation.test.ts tests/navigationModel.test.ts`; then `npm.cmd run lint`

Expected: focused tests and TypeScript checking pass; Payroll no longer gains route visibility from full project data.

---

### Task 4: Complete role-specific regression and direct-access coverage

**Files:**
- Modify: `tests/clientSecurityRoleNavigation.test.ts`
- Modify: `tests/navigationModel.test.ts`
- Modify: `tests/navigationRecovery.test.ts`
- Modify: `tests/clientSecurityCustomRoles.test.ts`
- Modify: `supabase/tests/client_security_custom_roles_test.sql`

**Interfaces:**
- Consumes: final migrated role grants, `getNavigationModel`, route guard source, custom-role RPCs.
- Produces: regression evidence for visible modules, hidden deep links, protected actions, custom-role name independence, and database lifecycle/security behavior.

- [ ] **Step 1: Add the final Finance/Viewer/Admin matrix assertions**

Use explicit permission arrays matching the final migration grants. Assert Finance has no `payroll.detail.read`, `workers.manage`, `company.members.manage`, or Settings route; Viewer has no manage/approve/settings/member controls in the permission-driven model; Company Admin can see Settings and the complete permitted company workspace. Assert a custom role with `displayName = "Payroll"` and only `inventory.read` still exposes only Warehouse, proving the label is not an authorization primitive.

- [ ] **Step 2: Add source-level direct-route guard assertions**

Assert `src/App.tsx` checks `canAccessAppTab(route.tab, permissions)` before rendering a route, returns `AccessDenied` for a denied authenticated route, and derives fallback from `defaultAppTabForPermissions`. Assert no new source checks compare `roleKey` or `roleDisplayName` to decide access.

- [ ] **Step 3: Extend pgTAP coverage for lifecycle, isolation, and overrides**

Retain existing custom-role create/edit/assign/archive, protected-permission, cross-company, stale-role, audit, and DENY-precedence tests. Add the final built-in-role matrix and reference-RPC denial/projection assertions. Do not replace runtime assertions with regex-only tests.

- [ ] **Step 4: Run the focused regression set**

Run: `node --test --experimental-strip-types tests/clientSecurityRoleNavigation.test.ts tests/navigationModel.test.ts tests/navigationRecovery.test.ts tests/clientSecurityCustomRoles.test.ts tests/payrollProjectReferences.test.ts`

Expected: all application-focused role/navigation/reference tests pass.

---

### Task 5: Add the authenticated synthetic-QA screenshot harness

**Files:**
- Create: `scripts/client-security/capture_role_screenshots.ts`
- Create: `tests/clientSecurityScreenshotHarness.test.ts`
- Modify: `artifacts/client-security/screenshots/README.md`

**Interfaces:**
- Consumes: Playwright, the non-secret health contract, environment-supplied synthetic role credentials, current permission-filtered navigation.
- Produces: stable PNGs under `artifacts/client-security/screenshots/` and a redacted `role-screenshot-manifest.json` with role, route, viewport, release identity, assertions, and status.

- [ ] **Step 1: Write the failing harness contract test**

Assert the new script contains separate credential names for Company Admin, Finance, Payroll, Viewer, and Custom; refuses production-looking hosts; checks exact environment/deployment/SHA/migration when supplied; scopes navigation selectors to `aside[aria-label="Workspace navigation"]`; captures the Company Access/custom-role editor; and does not call DOM hiding, CSS injection, image editing, or screenshot cropping.

Run: `node --test --experimental-strip-types tests/clientSecurityScreenshotHarness.test.ts`

Expected: FAIL because the harness does not exist.

- [ ] **Step 2: Implement safe target and credential validation**

Use process environment only; never print credential values. Require `CLIENT_SECURITY_QA_BASE_URL`, `CLIENT_SECURITY_QA_EXPECTED_SHA`, `CLIENT_SECURITY_QA_EXPECTED_MIGRATION`, and `CLIENT_SECURITY_QA_DEPLOYMENT_ID` for hosted QA evidence. Permit `localhost` only when `CLIENT_SECURITY_QA_ALLOW_LOCAL=1` and the health response reports `environment: "qa"`. Reject production project refs, production hostnames, privileged browser keys, missing credentials, and non-QA health identity.

- [ ] **Step 3: Implement exact authenticated role capture**

For each supplied synthetic account, create a fresh Playwright context, sign in through the real AuthScreen, wait for `[data-workspace-state="ready"]`, verify the QA banner and configured company text, and capture the same desktop viewport (`1440x1000`) with the complete visible viewport. Assert expected module labels and forbidden module labels from the actual sidebar DOM. Capture `/settings` for Company Admin and assert `Company access`, `Roles`, and `New custom role` are visible before saving `company-access-custom-role-editor-desktop.png`.

Use these expected module sets, derived from the final permission grants:

```ts
const EXPECTED_MODULES = {
  COMPANY_ADMIN: ["Dashboard", "Cash & Banking", "Email / SMS", "Documents", "Projects", "Procurement", "Warehouse Inventory", "Equipment Registry", "Supplier Invoices", "Expenses", "Payroll", "Reports"],
  FINANCE: ["Dashboard", "Cash & Banking", "Email / SMS", "Documents", "Projects", "Procurement", "Warehouse Inventory", "Equipment Registry", "Supplier Invoices", "Expenses", "Reports"],
  PAYROLL: ["Payroll", "Reports"],
  VIEWER: ["Dashboard", "Documents", "Projects", "Procurement", "Warehouse Inventory", "Equipment Registry", "Supplier Invoices", "Expenses", "Reports"],
  CUSTOM: ["Warehouse Inventory"],
} as const;
```

- [ ] **Step 4: Implement direct deep-link evidence without changing the DOM**

For Payroll, Viewer, and Custom, navigate manually to `/projects`, `/dashboard`, `/settings`, or another forbidden representative route as applicable. Record the final pathname and whether the access-denied state or permission-derived fallback was rendered. Do not treat a hidden menu as proof of denial.

- [ ] **Step 5: Write the redacted manifest and screenshot README**

Record only safe role labels, route paths, viewport, expected labels, observed labels, exact release identity, assertion results, and redacted telemetry. Document required environment variable names and the synthetic-data-only prerequisite in the README. Do not record emails, user ids, project ids, tokens, cookies, or provider content.

- [ ] **Step 6: Run the harness contract test**

Run: `node --test --experimental-strip-types tests/clientSecurityScreenshotHarness.test.ts`

Expected: PASS.

---

### Task 6: Run strict database/runtime checks and capture real evidence

**Files:**
- Modify: `artifacts/client-security/EVIDENCE.md`
- Create/update: `artifacts/client-security/screenshots/*.png`
- Create/update: `artifacts/client-security/role-screenshot-manifest.json`
- Modify: `docs/HYDROQUALISENSE_CLIENT_SECURITY_HANDOFF_CHECKLIST.md`

**Interfaces:**
- Consumes: generated migration, pgTAP suite, exact QA target, screenshot harness.
- Produces: qualified or runtime-verified evidence with explicit blockers.

- [ ] **Step 1: Check Docker and preserve the exact blocker if unavailable**

Run: `docker info`

If the Linux engine is available, continue with the local path. If it is unavailable, record the exact engine-pipe failure and do not call the DB contract certified.

- [ ] **Step 2: Run clean local replay when Docker is available**

Run: `npx.cmd supabase db reset --local --no-seed --yes`; then `npx.cmd supabase test db --local`; then `npm.cmd run test:migrations`; then `npm.cmd run test:migrations:upgrade`.

Expected: clean replay, pgTAP, migration, and upgrade suites pass. Any failure is inspected at the smallest useful region and corrected before continuing.

- [ ] **Step 3: Use only the guarded QA route when local Docker is unavailable and QA promotion is authorized**

Verify the exact QA target is not production, the intended app SHA is live, and the live migration history is canonical/non-divergent before running `npm.cmd run qa:db:push`. Re-read QA migration parity afterward. Never use `apply_migration` to create a remote-only timestamp for the committed migration.

- [ ] **Step 4: Run authenticated synthetic role capture against the exact tested release**

Run the new harness with protected role credentials and the exact SHA/migration environment. Create or assign the synthetic custom role only through the existing Company Access workflow or approved isolated QA setup. Verify every screenshot manually for real navigation, synthetic-only content, no secrets, no PII, and no cosmetic hiding.

- [ ] **Step 5: Update evidence status truthfully**

If runtime and screenshots pass, map each claim and screenshot to `SOURCE`, `DB`, `QA_RUNTIME`, `CI_RELEASE`, `VENDOR_CONFIG`, or `HANDOFF_POLICY` evidence. If a prerequisite fails, record `BLOCKED`, retain the PDF qualification, and do not substitute older screenshots as current-release proof.

---

### Task 7: Rewrite the client handoff source and checklist

**Files:**
- Modify: `docs/client-facing/HYDROQUALISENSE_CLIENT_SECURITY_OVERVIEW.md`
- Modify: `docs/HYDROQUALISENSE_CLIENT_SECURITY_HANDOFF_CHECKLIST.md`
- Modify: `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`
- Modify: `docs/HYDROQUALISENSE_CLIENT_SECURITY_ASSURANCE.md`
- Modify: `artifacts/client-security/EVIDENCE.md`
- Modify: `artifacts/client-security/screenshots/README.md`

**Interfaces:**
- Consumes: final role matrix, screenshot manifest, evidence matrix, deployment/provider facts.
- Produces: plain-language client source and an actionable operational handoff record.

- [ ] **Step 1: Add explicit custody-model fields to the checklist**

Add a clearly labeled field with exactly two choices:

```text
Selected support/custody model:
[ ] MANAGED_SUPPORT_ACCESS
[ ] INDEPENDENT_CLIENT_CONTROL
```

Explain that this is an operational handoff choice, not an application setting. Add the temporary incident process: `client approval -> named limited account/access -> specific incident -> activity recorded where practical -> access removed`.

- [ ] **Step 2: Add the two client-facing support models**

Describe Managed Support Access as client-owned production with a named, least-privilege support account under NDA, MFA where supported, client-controlled granting/revocation, available logging, and no routine browsing merely because access exists. Include the requested plain-language pros and cons without claiming provider permissions are finer-grained than they are.

Describe Independent Client Control as client-owned Supabase, Render, Auth, Storage, Google, AI, and SMS/provider custody with no standing developer data-plane access after handoff. Include its pros and cons and state that no password sharing is required.

- [ ] **Step 3: Make the maintenance/data-plane distinction unmistakable**

State that source-code fixes can still be developed and tested without standing production access; QA/synthetic environments are the normal reproduction path; direct production diagnosis, some production migrations/configuration work, and environment-specific verification may require client cooperation or temporary access. Do not use the inaccurate claim that no fixes or updates are possible without database access.

- [ ] **Step 4: Rewrite the client source into seven concise pages**

Use these page breaks and headings:

1. `Security at a glance`
2. `Who can access what`
3. `Real role examples`
4. `How your data stays isolated`
5. `Choose your support and custody model`
6. `Integrations and secrets`
7. `Shared responsibility and verification`

The role page must use the current screenshot assets and say in plain language that the menu follows permissions but protected routes and operations are checked again by the application/server/database. Keep the starter roles as business summaries; keep raw permission keys and implementation detail in `EVIDENCE.md` only.

- [ ] **Step 5: Make the evidence matrix match the final claims**

Add or narrow one row per material claim and one row per screenshot. Mark custom-role and role-specific runtime statements as verified only when exact DB/QA evidence exists; otherwise label them qualified/pending. Keep SMS `NOT_CONFIGURED`/unverified and external account custody as policy/manual evidence.

- [ ] **Step 6: Run documentation consistency checks**

Run: `git diff --check`; then search the client source for forbidden internal terms (`migration`, `RPC`, `Git SHA`, `Codex`, `CI`, raw permission keys) and for unsupported security/compliance claims. Inspect the source page-break count before PDF generation.

---

### Task 8: Regenerate and visually certify the PDF

**Files:**
- Modify: `scripts/client-security/build_client_security_pdf.py`
- Modify: `artifacts/client-security/Hydroqualisense_Client_Security_Overview.pdf`
- Modify: `artifacts/client-security/PDF_CHECKS.md`

**Interfaces:**
- Consumes: seven-page client source and tracked screenshot assets.
- Produces: the regenerated PDF and page-by-page visual-check record.

- [ ] **Step 1: Add a failing PDF source contract test**

Extend the relevant PDF fidelity test to require seven source pages, every role screenshot filename, the two custody model labels, and no internal implementation terms in the client source. Run the focused test before changing the builder.

- [ ] **Step 2: Run the focused PDF contract test and confirm it fails**

Run: `node --test --experimental-strip-types tests/pdfFidelity.test.ts`

Expected: FAIL because the current source has six pages, one custody model, and no current role screenshot references.

- [ ] **Step 3: Update the deterministic builder**

Keep ReportLab and the existing branding, but update the source page-count assertion to seven and make the screenshot resolver accept only tracked `artifacts/client-security/screenshots/` assets. Keep missing-asset failure behavior. Adjust screenshot widths/flow so labels remain legible, tables stay inside margins, and page numbering/header/footer remain consistent.

- [ ] **Step 4: Re-run the focused PDF contract test**

Run: `node --test --experimental-strip-types tests/pdfFidelity.test.ts`

Expected: PASS once the source and builder match. If screenshots are still blocked, keep the source references qualified and do not generate fabricated replacements.

- [ ] **Step 5: Mark the PDF artifact operation and generate the PDF**

Immediately before the first PDF create/edit command, run exactly once:

```text
node container_tools/mark_artifact_operation_started.mjs --operation-kind edit --expected-output-count 1 --output-format pdf
```

Then run: `python scripts/client-security/build_client_security_pdf.py`

Expected: the stable PDF path is written and the builder reports the output path.

- [ ] **Step 6: Render every page and inspect the PNGs**

Run: `pdfinfo artifacts/client-security/Hydroqualisense_Client_Security_Overview.pdf`; then `pdftoppm -png -r 150 artifacts/client-security/Hydroqualisense_Client_Security_Overview.pdf tmp/pdfs/client-security`

Inspect all seven rendered pages with the image viewer. Confirm no clipping, overlap, unreadable screenshots, hidden navigation, broken tables, missing branding, or unsupported claims. Delete only the temporary rendered PNGs after inspection.

- [ ] **Step 7: Record the visual evidence**

Update `artifacts/client-security/PDF_CHECKS.md` with page count, screenshot names, visual inspection result, source qualification status, and explicit no-production/no-secrets inspection. Never cite scratch PNGs as final artifacts.

---

### Task 9: Integrated validation, handoff synchronization, and PR

**Files:**
- Modify when stale: `AGENTS.md`
- Modify when stale: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`
- Modify when stale: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`
- Modify when user-facing capability truth changes: `src/config/productFeatures.ts`
- Review all changed source, migration, tests, evidence, screenshots, and PDF files.

**Interfaces:**
- Consumes: integrated branch behavior and all evidence results.
- Produces: exact final handoff, branch push, and open PR without self-merge.

- [ ] **Step 1: Run focused/new tests after all implementation changes**

Run: `node --test --experimental-strip-types tests/clientSecurityRoleNavigation.test.ts tests/payrollProjectReferences.test.ts tests/clientSecurityCustomRoles.test.ts tests/clientSecurityScreenshotHarness.test.ts tests/navigationModel.test.ts tests/navigationRecovery.test.ts tests/pdfFidelity.test.ts`

Expected: all applicable tests pass; skipped runtime tests remain explicitly identified.

- [ ] **Step 2: Run affected-test selection**

Run: `npm.cmd run test:affected:agent`

Expected: the selector reports the exact affected set and no unexpected failures.

- [ ] **Step 3: Run executable-surface checks**

Run: `npm.cmd run lint`; then `npm.cmd run build`; then `npm.cmd run workflow-map:consistency` when the final source changes touch mapped contracts.

Expected: each applicable command exits zero. Do not infer browser or DB success from these commands.

- [ ] **Step 4: Review the complete final diff and evidence package**

Run: `git status --short`; `git diff --stat`; `git diff --check`; `git diff -- supabase/migrations supabase/tests src tests docs artifacts scripts/client-security`.

Check that no production URL/data/secret was used, no role-name authorization exists, no historical migration was edited, and the PDF/evidence status matches actual runtime results.

- [ ] **Step 5: Reconcile roadmap and handoff truth**

Update the active roadmap and current handoff only after reviewing the final behavior. Record whether the security phase is complete or remains qualified/blocked, the exact next unfinished phase, Docker/QA/provider limitations, screenshot/PDF status, and that Email/SMS provider work, Wide Documents, Worker Registration, attendance, and biometrics remain out of scope.

- [ ] **Step 6: Commit, push, and open the PR**

Run: `git add --all`; `git commit -m "feat: complete client security role evidence handoff"`; `git push -u origin codex/client-security-follow-up`.

Open a PR from `codex/client-security-follow-up` to `main` with the starting SHA, final SHA, changed migration/RPC, tests/checks actually run, strict DB/browser/PDF evidence or exact blockers, and remaining limitations. Do not merge it.
