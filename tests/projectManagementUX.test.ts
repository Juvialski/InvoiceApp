import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import type { Project, ProjectCostCode, ProjectCostSummary } from "../src/types.ts";
import {
  buildPortfolioManagementSummary,
  buildProjectManagementView,
  filterAndSortProjectViews,
} from "../src/utils/projectManagementViewModel.ts";

const projectsPageSource = readFileSync(
  new URL("../src/components/projects/ProjectsPage.tsx", import.meta.url),
  "utf8",
);

const projectRegisterSectionSource = readFileSync(
  new URL("../src/components/projects/ProjectPortfolioRegisterSection.tsx", import.meta.url),
  "utf8",
);
const operationsGridSource = readFileSync(
  new URL("../src/components/ui/OperationsGrid.tsx", import.meta.url),
  "utf8",
);
const projectsSurfaceSource = `${projectsPageSource}\n${projectRegisterSectionSource}`;

const projectOverviewSource = readFileSync(
  new URL("../src/components/projects/ProjectOverview.tsx", import.meta.url),
  "utf8",
);
const projectDetailsWorksheetPath = new URL("../src/components/projects/ProjectDetailsWorksheet.tsx", import.meta.url);
const projectDetailsWorksheetSource = existsSync(projectDetailsWorksheetPath) ? readFileSync(projectDetailsWorksheetPath, "utf8") : "";

function createMockProject(overrides?: Partial<Project>): Project {
  return {
    id: "proj-1",
    projectCode: "PRJ-001",
    projectName: "Water Treatment Facility",
    clientName: "Metro Water Works",
    location: "Quezon City",
    projectManager: "Engr. Santos",
    status: "ACTIVE",
    contractValue: 5000000,
    projectBudget: 4000000,
    currency: "PHP",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function createMockSummary(overrides?: Partial<ProjectCostSummary>): ProjectCostSummary {
  return {
    budget: 4000000,
    invoiceCost: 1500000,
    paidInvoiceCost: 1000000,
    unpaidInvoiceCost: 500000,
    unallocatedPayrollCost: 0,
    pendingInvoiceCost: 200000,
    payrollCost: 800000,
    pendingPayrollCost: 100000,
    otherExpenseCost: 200000,
    pendingExpenseCost: 50000,
    totalActualCost: 2500000,
    committedCost: 0,
    remainingBudget: 1500000,
    budgetUsedPercent: 62.5,
    foreignCosts: {},
    unallocatedInvoiceCost: 0,
    unallocatedExpenseCost: 0,
    ...overrides,
  };
}

test("ProjectOverview executes all React hooks unconditionally before early return", () => {
  const hooksCallIndex = projectOverviewSource.indexOf("const managementView = useMemo");
  const completenessCheckIndex = projectOverviewSource.indexOf("if (!completeness.complete)");

  assert.ok(hooksCallIndex > 0, "managementView useMemo hook must be present");
  assert.ok(completenessCheckIndex > 0, "completeness.complete check must be present");
  assert.ok(
    hooksCallIndex < completenessCheckIndex,
    "All React hooks must execute before any conditional early return to prevent hook order mismatch",
  );
});

test("ProjectOverview engineering shortcuts respect both deployment visibility and permissions", () => {
  assert.match(projectOverviewSource, /canReadDocuments && isProjectWorkspaceTabDeploymentVisible\("documents"\)/);
  assert.match(projectOverviewSource, /canReadRfis && isProjectWorkspaceTabDeploymentVisible\("rfis"\)/);
  assert.match(projectOverviewSource, /canReadSubmittals && isProjectWorkspaceTabDeploymentVisible\("submittals"\)/);
  assert.match(projectOverviewSource, /canReadSiteLogs \? \[/);
});

test("ProjectsPage passes financial data completeness to project management views", () => {
  assert.match(projectsPageSource, /financialDataComplete: costDataComplete/);
});

test("ProjectsPage keeps a visual card portfolio and optional compact register", () => {
  // Check Portfolio Summary structure
  assert.match(projectsSurfaceSource, /(?:<details|<section) aria-label="Portfolio Management Summary"/);
  assert.match(projectsPageSource, /buildPortfolioManagementSummary\(projectViews\)/);
  assert.match(projectsSurfaceSource, /portfolio\.currencies\.map/);
  assert.match(projectsSurfaceSource, /Attention Signals/);

  // Check Filtering and Sorting controls
  assert.match(projectsPageSource, /filterAndSortProjectViews/);
  assert.match(projectsPageSource, /healthFilter/);
  assert.match(projectsPageSource, /sortField/);
  assert.match(projectsPageSource, /sortDirection/);

  // Cards are the default portfolio; the existing register remains optional.
  assert.match(projectRegisterSectionSource, /useState<"cards"\s*\|\s*"list">\("cards"\)/);
  assert.match(projectRegisterSectionSource, /Compact List/);
  assert.match(projectRegisterSectionSource, /grid grid-cols-1/);
  assert.match(projectsSurfaceSource, /aria-label="Projects table"/);
  assert.match(projectsSurfaceSource, /aria-label="Projects list cards"/);
  assert.match(projectRegisterSectionSource, /OperationsGrid/);
  assert.match(projectRegisterSectionSource, /protected:\s*true/);
  assert.match(operationsGridSource, /data-field-protected/);
  assert.match(operationsGridSource, /sticky/);
});

test("Projects portfolio defaults to cards and keeps compact list as an accessible secondary view", () => {
  assert.match(projectRegisterSectionSource, /useState<"cards"\s*\|\s*"list">\("cards"\)/);
  assert.match(projectRegisterSectionSource, /aria-pressed/);
  assert.match(projectRegisterSectionSource, /Cards/);
  assert.match(projectRegisterSectionSource, /Compact List/);
  assert.match(projectRegisterSectionSource, /Edit project details/);
  assert.match(projectRegisterSectionSource, /Open project workspace/i);
  assert.match(projectRegisterSectionSource, /grid-cols-1/);
  assert.match(projectRegisterSectionSource, /More actions/);
});

test("ProjectsPage exposes the required portfolio financial columns and deterministic controls", () => {
  for (const label of ["Project Manager", "Currency", "Contract Value", "Budget", "Actual", "Committed", "Billed", "Collected", "Outstanding", "Remaining to Bill"]) {
    assert.match(projectsSurfaceSource, new RegExp(label));
  }
  assert.match(projectsPageSource, /managerFilter/);
  assert.match(projectsPageSource, /currencyFilter/);
  assert.match(projectsPageSource, /clientBillings/);
  assert.match(projectsPageSource, /clientCollections/);
  assert.match(projectsSurfaceSource, /Partial · \$\{metric\.includedProjectCount\}/);
  assert.match(projectsSurfaceSource, /Unavailable/);
  assert.doesNotMatch(projectsSurfaceSource, /project_dashboard_totals/);
});

test("Project Details uses one shared worksheet for New and Edit with all current fields", () => {
  for (const field of ["Project Code", "Project Name", "Currency", "Tax Treatment", "Contract Value", "Approved Cost Budget", "Client Name", "Project Manager", "Billing Contact", "Billing Email", "Billing Address", "Location / City", "Status", "Operational Notes / Scope"]) {
    assert.match(projectDetailsWorksheetSource, new RegExp(field.replace("/", "\\/")));
  }
  assert.match(projectDetailsWorksheetSource, /WorksheetEditor/);
  assert.match(projectDetailsWorksheetSource, /kind:\s*["']select["']/);
  assert.match(projectDetailsWorksheetSource, /onSave/);
  assert.match(projectDetailsWorksheetSource, /onClose/);
  assert.match(projectDetailsWorksheetSource, /w-full[^\n]*max-w-\[95vw\]|max-w-\[95vw\][^\n]*w-full/);
});

test("ProjectOverview enforces single-source management snapshot and truthful commercial controls notice", () => {
  // Check buildProjectManagementView integration
  assert.match(projectOverviewSource, /buildProjectManagementView/);

  // Check Primary Financial Snapshot Heading & Structure
  assert.match(projectOverviewSource, /Project Financial Snapshot/);
  assert.match(projectOverviewSource, /Contract Value/);
  assert.match(projectOverviewSource, /Approved Cost Budget/);
  assert.match(projectOverviewSource, /Actual Cost/);
  assert.match(projectOverviewSource, /Pending Exposure/);
  assert.match(projectOverviewSource, /Budget Remaining/);

  // Check Work Package Budget Control context & direct CTA
  assert.match(projectOverviewSource, /Work Package Budget Control \(P1B\)/);
  assert.match(projectOverviewSource, /Open Budget Control Tab →/);

  // Check Commercial Controls Explanatory Notice (committed cost is implemented; later billing remains deferred)
  assert.match(projectOverviewSource, /Commercial Controls/);
  assert.match(projectOverviewSource, /Committed Cost/);
  assert.match(projectOverviewSource, /Client Progress Billing/);
  assert.match(projectOverviewSource, /Collections/);
  assert.match(projectOverviewSource, /Outstanding Receivables/);

  // Check Operational Shortcuts
  assert.match(projectOverviewSource, /Project Operations Navigation/);
});

test("Project management view model handles empty and edge state projects", () => {
  const emptyProject = createMockProject({
    id: "empty-p",
    contractValue: 0,
    projectBudget: 0,
  });
  const emptySummary = createMockSummary({
    budget: 0,
    totalActualCost: 0,
    remainingBudget: 0,
    budgetUsedPercent: 0,
  });

  const view = buildProjectManagementView(emptyProject, emptySummary);
  assert.equal(view.approvedCostBudget, 0);
  assert.equal(view.actualCost, 0);
  assert.equal(view.health, "NO BUDGET");
  assert.equal(view.remainingBudget, 0);
});

test("Portfolio summary calculates multi-currency and active status aggregates accurately", () => {
  const p1 = createMockProject({ id: "p1", status: "ACTIVE", currency: "PHP", contractValue: 2000000, projectBudget: 1500000 });
  const s1 = createMockSummary({ budget: 1500000, totalActualCost: 1000000 });

  const p2 = createMockProject({ id: "p2", status: "ON_HOLD", currency: "PHP", contractValue: 1000000, projectBudget: 800000 });
  const s2 = createMockSummary({ budget: 800000, totalActualCost: 200000 });

  const p3 = createMockProject({ id: "p3", status: "ARCHIVED", currency: "USD", contractValue: 100000, projectBudget: 80000 });
  const s3 = createMockSummary({ budget: 80000, totalActualCost: 50000 });

  const v1 = buildProjectManagementView(p1, s1);
  const v2 = buildProjectManagementView(p2, s2);
  const v3 = buildProjectManagementView(p3, s3);

  const portfolio = buildPortfolioManagementSummary([v1, v2, v3]);

  assert.equal(portfolio.totalProjects, 3);
  assert.equal(portfolio.activeProjects, 1);
  assert.equal(portfolio.onHoldProjects, 1);
  assert.equal(portfolio.archivedProjects, 1);
  assert.equal(portfolio.isMultiCurrency, true);

  // PHP Group
  assert.equal(portfolio.currencyGroups.PHP?.projectCount, 2);
  assert.equal(portfolio.currencyGroups.PHP?.totalContractValue, 3000000);
  assert.equal(portfolio.currencyGroups.PHP?.totalApprovedBudget, 2300000);
  assert.equal(portfolio.currencyGroups.PHP?.totalActualCost, 1200000);

  // USD Group
  assert.equal(portfolio.currencyGroups.USD?.projectCount, 1);
  assert.equal(portfolio.currencyGroups.USD?.totalContractValue, 100000);
  assert.equal(portfolio.currencyGroups.USD?.totalApprovedBudget, 80000);
  assert.equal(portfolio.currencyGroups.USD?.totalActualCost, 50000);
});
