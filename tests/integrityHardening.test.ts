import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PERMISSION_KEYS,
  canAccessAppTab,
  permissionOptionsForAppTab,
  type PermissionKey,
} from "../src/utils/accessControl.ts";
import { projectCostDataCompleteness } from "../src/utils/dataCompleteness.ts";
import { ROUTE_DEFINITIONS } from "../src/utils/routes.ts";
import { isAssistantActionAllowed, sanitizeAssistantClientAction } from "../src/assistant/assistantActionPolicy.ts";
import { requireCompanyPermissions, routePermission } from "../src/server/assistant/toolAuthorization.ts";

const dashboardRoute = readFileSync(new URL("../src/app/routes/DashboardRoute.tsx", import.meta.url), "utf8");
const reportsRoute = readFileSync(new URL("../src/app/routes/ReportsRoute.tsx", import.meta.url), "utf8");
const invoicesRoute = readFileSync(new URL("../src/app/routes/InvoicesRoute.tsx", import.meta.url), "utf8");
const projectsPage = readFileSync(new URL("../src/components/projects/ProjectsPage.tsx", import.meta.url), "utf8");
const projectWorkspace = readFileSync(new URL("../src/components/projects/ProjectWorkspace.tsx", import.meta.url), "utf8");
const projectOverview = readFileSync(new URL("../src/components/projects/ProjectOverview.tsx", import.meta.url), "utf8");
const expensesPage = readFileSync(new URL("../src/components/expenses/ExpensesPage.tsx", import.meta.url), "utf8");
const settlementCard = readFileSync(new URL("../src/components/FinancialSettlementCard.tsx", import.meta.url), "utf8");
const assistantMessage = readFileSync(new URL("../src/assistant/AssistantMessage.tsx", import.meta.url), "utf8");
const companyAccess = readFileSync(new URL("../src/context/CompanyAccessContext.tsx", import.meta.url), "utf8");

const COMPANY_ADMIN = new Set<PermissionKey>(Object.values(PERMISSION_KEYS) as PermissionKey[]);
const FINANCE = new Set<PermissionKey>([
  PERMISSION_KEYS.dashboardView,
  PERMISSION_KEYS.projectsRead,
  PERMISSION_KEYS.projectsWrite,
  PERMISSION_KEYS.invoicesRead,
  PERMISSION_KEYS.invoicesWrite,
  PERMISSION_KEYS.invoicesVerify,
  PERMISSION_KEYS.invoicesExtract,
  PERMISSION_KEYS.gmailRead,
  PERMISSION_KEYS.expensesRead,
  PERMISSION_KEYS.expensesWrite,
  PERMISSION_KEYS.vendorsRead,
  PERMISSION_KEYS.vendorsManage,
  PERMISSION_KEYS.payrollAggregateRead,
  PERMISSION_KEYS.reportsRead,
]);
const PAYROLL = new Set<PermissionKey>([
  PERMISSION_KEYS.dashboardView,
  PERMISSION_KEYS.projectsRead,
  PERMISSION_KEYS.payrollAggregateRead,
  PERMISSION_KEYS.payrollSensitiveRead,
  PERMISSION_KEYS.payrollWrite,
  PERMISSION_KEYS.payrollApprove,
  PERMISSION_KEYS.payrollSettings,
  PERMISSION_KEYS.payrollImport,
  PERMISSION_KEYS.workersRead,
  PERMISSION_KEYS.workersCompensationRead,
  PERMISSION_KEYS.workersManage,
  PERMISSION_KEYS.reportsPayrollRead,
]);
const VIEWER = new Set<PermissionKey>([
  PERMISSION_KEYS.dashboardView,
  PERMISSION_KEYS.projectsRead,
  PERMISSION_KEYS.invoicesRead,
  PERMISSION_KEYS.expensesRead,
  PERMISSION_KEYS.vendorsRead,
  PERMISSION_KEYS.payrollAggregateRead,
  PERMISSION_KEYS.reportsRead,
]);

function permissionClient(allowed: ReadonlySet<string>) {
  return {
    rpc: async (_name: string, args: { p_permission_key?: string }) => ({
      data: Boolean(args.p_permission_key && allowed.has(args.p_permission_key)),
      error: null,
    }),
  } as any;
}

function authorizationContext(allowed: ReadonlySet<string>) {
  return {
    supabase: permissionClient(allowed),
    companyId: "00000000-0000-4000-8000-000000000001",
    userId: "00000000-0000-4000-8000-000000000002",
    context: { companyId: "00000000-0000-4000-8000-000000000001", generation: 0 },
  } as any;
}

test("seeded roles have explicit project-cost completeness semantics", () => {
  const admin = projectCostDataCompleteness(COMPANY_ADMIN);
  assert.equal(admin.complete, true);
  assert.deepEqual(admin.missingSources, []);

  const finance = projectCostDataCompleteness(FINANCE);
  assert.equal(finance.complete, false);
  assert.deepEqual(finance.missingSources, ["payrollLabor"]);

  const payroll = projectCostDataCompleteness(PAYROLL);
  assert.equal(payroll.complete, false);
  assert.deepEqual(payroll.missingSources, ["supplierInvoices", "directExpenses"]);

  const viewer = projectCostDataCompleteness(VIEWER);
  assert.equal(viewer.complete, false);
  assert.deepEqual(viewer.missingSources, ["payrollLabor"]);

  const financeWithAggregate = projectCostDataCompleteness(FINANCE, { sourceStates: { payrollLabor: "aggregate" } });
  assert.equal(financeWithAggregate.complete, true);
  assert.equal(financeWithAggregate.sourceStates.payrollLabor, "aggregate");
  assert.deepEqual(financeWithAggregate.missingSources, []);
  const aggregateUnavailable = projectCostDataCompleteness(FINANCE, { sourceStates: { payrollLabor: "unavailable" } });
  assert.equal(aggregateUnavailable.complete, false);
  assert.equal(aggregateUnavailable.reason, "load-error");
  const currencyConflict = projectCostDataCompleteness(FINANCE, { sourceStates: { payrollLabor: "currency-conflict" } });
  assert.equal(currencyConflict.complete, false);
  assert.equal(currencyConflict.reason, "currency-conflict");
});

test("route authorization is canonical for Assistant navigation and supports alternatives", () => {
  for (const route of ROUTE_DEFINITIONS) {
    assert.equal(routePermission(route.id), permissionOptionsForAppTab(route.appTab).join("|"), route.id);
  }
  assert.equal(routePermission("extract"), PERMISSION_KEYS.invoicesExtract);
  assert.equal(routePermission("payroll"), PERMISSION_KEYS.payrollRead);
  assert.equal(routePermission("reports"), `${PERMISSION_KEYS.reportsRead}|${PERMISSION_KEYS.reportsPayrollRead}`);
  assert.throws(() => routePermission("unknown-route"), /not authorized/i);
  assert.throws(() => routePermission(undefined), /not authorized/i);

  assert.equal(canAccessAppTab("reports", PAYROLL), true);
  assert.equal(canAccessAppTab("reports", FINANCE), true);
  assert.equal(canAccessAppTab("payroll", FINANCE), false);
  assert.equal(canAccessAppTab("payroll", VIEWER), false);
});

test("Assistant entity navigation cannot bypass or visibly advertise a forbidden route", () => {
  const payrollPeriod = sanitizeAssistantClientAction({ type: "OPEN_PAYROLL_PERIOD", entityId: "period-1", label: "Open payroll" });
  assert.ok(payrollPeriod);
  assert.equal(isAssistantActionAllowed(payrollPeriod, FINANCE), false);
  assert.equal(isAssistantActionAllowed(payrollPeriod, VIEWER), false);
  assert.equal(isAssistantActionAllowed(payrollPeriod, PAYROLL), true);
  assert.equal(sanitizeAssistantClientAction({ type: "NAVIGATE", routeId: "unknown-route" }), null);
  assert.match(assistantMessage, /message\.clientActions\.filter\(\(action\) => isAssistantActionAllowed\(action, permissions\)\)/);
  assert.match(assistantMessage, /visibleClientActions\.map/);
});

test("Assistant project cost summary uses the safe labor aggregate permission", async () => {
  await assert.doesNotReject(
    requireCompanyPermissions(authorizationContext(FINANCE), [PERMISSION_KEYS.projectsRead, PERMISSION_KEYS.reportsRead]),
  );
  await assert.rejects(
    requireCompanyPermissions(authorizationContext(PAYROLL), [PERMISSION_KEYS.projectsRead, PERMISSION_KEYS.reportsRead]),
    /permission/i,
  );
  await assert.doesNotReject(
    requireCompanyPermissions(authorizationContext(COMPANY_ADMIN), [PERMISSION_KEYS.projectsRead, PERMISSION_KEYS.reportsRead]),
  );
});

test("incomplete Dashboard, project Overview, and Reports suppress authoritative combined aggregates", () => {
  assert.match(dashboardRoute, /transientRefreshGap = !completeness\.complete/);
  assert.match(dashboardRoute, /workspaceDataPending/);
  assert.match(dashboardRoute, /completeness\.reason === "load-error"/);
  assert.match(dashboardRoute, /if \(!completeness\.complete && !transientRefreshGap\)/);
  assert.match(dashboardRoute, /Combined company cost position withheld/);
  assert.match(dashboardRoute, /filter\(\(\{ tab \}\) => canAccessAppTab\(tab, permissions\)\)/);
  assert.match(projectOverview, /if \(!completeness\.complete\)/);
  assert.match(projectOverview, /Combined project financial position withheld/);
  assert.match(projectOverview, /Confirmed cost, pending cost, available after commitments, utilization, health, composition, cost trend, and cumulative burn are not shown/);
  assert.match(reportsRoute, /transientRefreshGap = !projectCostCompleteness\.complete/);
  assert.match(reportsRoute, /projectCostCompleteness\.reason === "load-error"/);
  assert.match(reportsRoute, /projectCostCompleteness\.complete \|\| transientRefreshGap/);
  assert.match(reportsRoute, /Combined project-cost report and export unavailable for this role/);
  assert.match(reportsRoute, /missingProjectCostSources\.join/);
});

test("Viewer and read-only roles are not offered mutation workflows", () => {
  assert.match(projectsPage, /actions=\{canManage \?/);
  assert.match(projectsPage, /canManage && project\.status !== "ARCHIVED"/);
  assert.match(expensesPage, /actions=\{canManage \?/);
  assert.match(expensesPage, /\{canManage && <th/);
  assert.match(invoicesRoute, /InvoiceDirectoryReadOnly/);
  assert.match(invoicesRoute, /readOnly=\{!canVerifyInvoices\}/);
  assert.match(invoicesRoute, /canManageMailbox=\{canManageGmail\}/);
});

test("Project workspace hides inaccessible financial and workforce tabs instead of showing false empty states", () => {
  assert.match(projectWorkspace, /\.\.\.\(canReadInvoices \?/);
  assert.match(projectWorkspace, /\.\.\.\(canReadPayroll \?/);
  assert.match(projectWorkspace, /\.\.\.\(canReadExpenses \?/);
  assert.match(projectWorkspace, /\.\.\.\(canReadWorkers \?/);
  assert.match(projectWorkspace, /if \(visibleTabIds\.has\(initialTab\)\)/);
  assert.match(projectWorkspace, /Partial cost visibility/);
});

test("settlement reversal presentation fails closed unless cash reconciliation is granted", () => {
  assert.match(settlementCard, /canReverse = false/);
  assert.match(invoicesRoute, /PERMISSION_KEYS\.cashReconcile/);
  assert.match(invoicesRoute, /canReverse=\{canReverseSettlement\}/);
});

test("deployment-company access clears stale context before every authorization refresh", () => {
  assert.match(companyAccess, /resetAuthenticatedContext\("loading"/);
  assert.match(companyAccess, /clearCompanyContext\(\)/);
  assert.match(companyAccess, /loadDeploymentCompanyId/);
  assert.match(companyAccess, /resolveDeploymentCompanyAccess/);
  assert.doesNotMatch(companyAccess, /sessionStorage|activeCompanyStorageKey|chooseCompany/);
});
