import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { CompanyAccessSnapshot } from "../src/lib/companyAccess.ts";
import { assertDeploymentCompanyId, resolveDeploymentCompanyAccess } from "../src/lib/deploymentCompany.ts";
import { clearCompanyContext, getActiveCompanyId, setActiveCompanyId } from "../src/lib/companyContext.ts";

const DEPLOYMENT = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";

function snapshot(overrides: Partial<CompanyAccessSnapshot> = {}): CompanyAccessSnapshot {
  return {
    status: "ready",
    isPlatformOwner: true,
    companies: [
      { id: DEPLOYMENT, name: "Deployment Co", status: "ACTIVE" },
      { id: OTHER, name: "Other Co", status: "ACTIVE" },
    ],
    memberships: [
      { companyId: DEPLOYMENT, roleKey: "COMPANY_ADMIN", status: "ACTIVE", permissions: ["dashboard.read", "company.members.manage"] },
      { companyId: OTHER, roleKey: "VIEWER", status: "ACTIVE", permissions: ["dashboard.read"] },
    ],
    activeCompanyId: null,
    permissions: [],
    ...overrides,
  };
}

test("deployment access resolves exactly the configured company and suppresses platform-owner semantics", () => {
  const resolved = resolveDeploymentCompanyAccess(snapshot(), DEPLOYMENT);
  assert.equal(resolved.status, "ready");
  assert.equal(resolved.activeCompanyId, DEPLOYMENT);
  assert.equal(resolved.isPlatformOwner, false);
  assert.deepEqual(resolved.companies.map((company) => company.id), [DEPLOYMENT]);
  assert.deepEqual(resolved.memberships.map((membership) => membership.companyId), [DEPLOYMENT]);
  assert.deepEqual(resolved.permissions, ["dashboard.read", "company.members.manage"]);
});

test("authenticated user without deployment membership receives explicit no-company access", () => {
  const resolved = resolveDeploymentCompanyAccess(snapshot({ memberships: [] }), DEPLOYMENT);
  assert.equal(resolved.status, "no-company");
  assert.equal(resolved.activeCompanyId, null);
  assert.deepEqual(resolved.permissions, []);
  assert.deepEqual(resolved.companies.map((company) => company.id), [DEPLOYMENT]);
});

test("suspended deployment is not opened as an empty or selectable workspace", () => {
  const resolved = resolveDeploymentCompanyAccess(snapshot({ companies: [{ id: DEPLOYMENT, name: "Deployment Co", status: "SUSPENDED" }] }), DEPLOYMENT);
  assert.equal(resolved.status, "company-suspended");
  assert.equal(resolved.activeCompanyId, null);
  assert.deepEqual(resolved.permissions, []);
});

test("missing, unknown, and duplicate deployment-company access fail clearly", () => {
  assert.throws(() => assertDeploymentCompanyId(null), /does not have a configured company/i);
  assert.throws(() => resolveDeploymentCompanyAccess(snapshot(), "00000000-0000-4000-8000-000000000099"), /not available/i);
  assert.throws(() => resolveDeploymentCompanyAccess(snapshot({ memberships: [
    { companyId: DEPLOYMENT, status: "ACTIVE", permissions: [] },
    { companyId: DEPLOYMENT, status: "ACTIVE", permissions: [] },
  ] }), DEPLOYMENT), /duplicate/i);
});

test("caller supplied company ids cannot override the deployment company", () => {
  assert.equal(assertDeploymentCompanyId(DEPLOYMENT, DEPLOYMENT), DEPLOYMENT);
  assert.equal(assertDeploymentCompanyId(DEPLOYMENT, null), DEPLOYMENT);
  assert.throws(() => assertDeploymentCompanyId(DEPLOYMENT, OTHER, "Assistant tool"), /outside this Engoryx deployment/i);
});

test("browser company context cannot switch directly between non-null companies", () => {
  clearCompanyContext();
  assert.equal(setActiveCompanyId(DEPLOYMENT), DEPLOYMENT);
  assert.equal(getActiveCompanyId(), DEPLOYMENT);
  assert.throws(() => setActiveCompanyId(OTHER), /cannot be switched/i);
  assert.equal(getActiveCompanyId(), DEPLOYMENT);
  clearCompanyContext();
  assert.equal(setActiveCompanyId(OTHER), OTHER);
  clearCompanyContext();
});

test("frontend has no authoritative stored company selection or company-picker UI", () => {
  const context = readFileSync(new URL("../src/context/CompanyAccessContext.tsx", import.meta.url), "utf8");
  const accessStates = readFileSync(new URL("../src/components/access/AccessStates.tsx", import.meta.url), "utf8");
  const api = readFileSync(new URL("../src/lib/companyApi.ts", import.meta.url), "utf8");
  assert.doesNotMatch(context, /sessionStorage|localStorage|activeCompanyStorageKey|readStoredCompanyId|chooseCompany|bootstrapPlatformAdmin/);
  assert.match(context, /loadDeploymentCompanyId/);
  assert.match(context, /resolveDeploymentCompanyAccess/);
  assert.match(context, /Creating another company is disabled/);
  assert.doesNotMatch(accessStates, /Choose company|role="listbox"|ChevronDown/);
  assert.match(accessStates, /Deployment company:/);
  assert.match(api, /requireActiveCompanyId\(\)/);
  assert.match(api, /assertDeploymentCompanyId\(deploymentCompanyId, options\.companyId/);
  assert.match(api, /headers\.set\("X-Company-Id", deploymentCompanyId\)/);
});

test("database migration keeps company_id boundaries while binding authorization to deployment configuration", () => {
  const migration = readFileSync(new URL("../supabase/migrations/20260828150000_single_company_deployment.sql", import.meta.url), "utf8");
  const guards = readFileSync(new URL("../supabase/migrations/20260828151000_single_company_access_guards.sql", import.meta.url), "utf8");
  assert.match(migration, /create table if not exists public\.deployment_configuration/);
  assert.match(migration, /exactly one ACTIVE company/i);
  assert.match(migration, /v_requested_id is distinct from v_company_id/);
  assert.match(migration, /p_company_id = \(select private\.deployment_company_id\(\)\)/);
  assert.match(migration, /ci\.company_id = v_company_id/);
  assert.match(migration, /company\.members\.manage/);
  assert.match(migration, /Creating additional companies is disabled/);
  assert.match(guards, /At least one active Company Admin must remain/);
  assert.match(guards, /Membership cannot target a company outside this Engoryx deployment/);
  assert.match(guards, /companies_single_deployment_guard/);
});

test("company access management is surfaced under deployment settings and remains permission based", () => {
  const settings = readFileSync(new URL("../src/components/Settings.tsx", import.meta.url), "utf8");
  const management = readFileSync(new URL("../src/components/access/DeploymentAccessManagement.tsx", import.meta.url), "utf8");
  assert.match(settings, /DeploymentAccessManagement/);
  assert.match(management, /PERMISSION_KEYS\.accessManage/);
  assert.match(management, /companyAccess\.can/);
  assert.doesNotMatch(management, /activeMembership\?\.roleKey|roleKey === "COMPANY_ADMIN"/);
  assert.match(management, /companyAccess\.inviteCompanyMember/);
  assert.match(management, /companyAccess\.updateCompanyMember/);
});
