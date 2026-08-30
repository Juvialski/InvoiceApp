import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { CompanySwitcher } from "../src/components/access/AccessStates.tsx";
import { Settings } from "../src/components/Settings.tsx";
import { RouteLoadingSkeleton } from "../src/components/ui/RouteSkeleton.tsx";
import { AppPermissionProvider } from "../src/app/AppPermissionContext.tsx";
import { MetricCard } from "../src/components/ui/OperationsUI.tsx";
import { DashboardRoute } from "../src/app/routes/DashboardRoute.tsx";
import { ProjectsPage } from "../src/components/projects/ProjectsPage.tsx";
import { ExpensesPage } from "../src/components/expenses/ExpensesPage.tsx";
import { PayrollPageV2 } from "../src/components/payroll/PayrollPageV2.tsx";
import type { DashboardViewData } from "../src/components/engineering/EngineeringCostOperationsDashboard.tsx";
import { DEFAULT_COUNTRY, DEFAULT_CURRENCY, DEFAULT_LOCALE, DEFAULT_TIMEZONE } from "../src/config/regional.ts";
import type { CompanySummary } from "../src/lib/companyAccess.ts";

test("CompanySwitcher renders short and long company names with multi-line wrapping and accessibility attributes", () => {
  const shortCompany: CompanySummary = {
    id: "comp-1",
    name: "Acme Corp",
    status: "ACTIVE",
    defaultCurrency: "PHP",
    timezone: "Asia/Manila",
  };
  const longCompany: CompanySummary = {
    id: "comp-2",
    name: "HYDROQUALISENSE SOLUTIONS CORP · Heavy Industrial & Marine Systems",
    status: "ACTIVE",
    defaultCurrency: "PHP",
    timezone: "Asia/Manila",
  };

  // Test expanded view with long name
  const expandedMarkup = renderToStaticMarkup(
    <CompanySwitcher companies={[longCompany]} activeCompanyId="comp-2" collapsed={false} />
  );
  assert.match(expandedMarkup, /HYDROQUALISENSE SOLUTIONS CORP/);
  assert.match(expandedMarkup, /line-clamp-2/);
  assert.match(expandedMarkup, /break-words/);
  assert.match(expandedMarkup, /aria-label="Deployment company: HYDROQUALISENSE SOLUTIONS CORP/);

  // Test collapsed view with short name
  const collapsedMarkup = renderToStaticMarkup(
    <CompanySwitcher companies={[shortCompany]} activeCompanyId="comp-1" collapsed={true} />
  );
  assert.match(collapsedMarkup, /aria-label="Deployment company: Acme Corp"/);
  assert.match(collapsedMarkup, /title="Deployment company: Acme Corp"/);
  assert.doesNotMatch(collapsedMarkup, /line-clamp-2/);
});

test("Settings component renders full-width layout without max-w-7xl constraint", () => {
  const settings = {
    country: DEFAULT_COUNTRY,
    locale: DEFAULT_LOCALE,
    currency: DEFAULT_CURRENCY,
    timezone: DEFAULT_TIMEZONE,
  };
  const markup = renderToStaticMarkup(
    <Settings settings={settings} onChange={() => {}} showDeploymentAccessManagement={false} />
  );
  assert.match(markup, /Operational settings/);
  assert.doesNotMatch(markup, /max-w-7xl/);
});

test("RouteLoadingSkeleton renders with accessible loading status and structured skeletons", () => {
  const markup = renderToStaticMarkup(<RouteLoadingSkeleton />);
  assert.match(markup, /role="status"/);
  assert.match(markup, /aria-label="Loading workspace page"/);
  assert.match(markup, /animate-pulse/);
});

test("AppPermissionProvider resolves stable completeness when workspaceDataPending is true", () => {
  const markup = renderToStaticMarkup(
    <AppPermissionProvider
      permissions={["projects.read", "invoices.read", "expenses.read", "payroll.read"]}
      workspaceDataPending={true}
    >
      <div data-testid="child">Loaded</div>
    </AppPermissionProvider>
  );
  assert.match(markup, /Loaded/);
});

test("MetricCard renders animate-pulse skeleton placeholder when loading is true and value when false", () => {
  const loadingMarkup = renderToStaticMarkup(
    <MetricCard label="Total Budget" value="₱1,000,000" loading={true} />
  );
  assert.match(loadingMarkup, /animate-pulse/);
  assert.doesNotMatch(loadingMarkup, /₱1,000,000/);

  const loadedMarkup = renderToStaticMarkup(
    <MetricCard label="Total Budget" value="₱1,000,000" loading={false} />
  );
  assert.match(loadedMarkup, /₱1,000,000/);
  assert.doesNotMatch(loadedMarkup, /animate-pulse/);
});

test("DashboardRoute renders RouteLoadingSkeleton during initial workspace hydration", () => {
  const blankData: DashboardViewData = {
    selectedCurrency: "PHP",
    currencies: ["PHP"],
    activityPeriod: "MONTH",
    activityStart: "2026-08-01",
    activityEnd: "2026-08-31",
    activityLabel: "August 2026",
    activeProjects: 0,
    totalProjectBudget: 0,
    confirmedProjectCost: 0,
    pendingProjectCost: 0,
    availableAfterCommitments: 0,
    outstandingPayables: 0,
    projectRows: [],
    monthlyCostTrend: [],
    costComposition: [],
    budgetUtilization: [],
    payableAging: [],
    unknownDueDatePayables: 0,
    payrollTrend: [],
    expenseTrend: [],
    unallocatedByCurrency: [],
    overheadByCurrency: [],
    payrollDetailAvailable: true,
    payrollSummary: {
      currentPeriodLabel: "No period",
      activeWorkers: 0,
      grossPayroll: 0,
      projectLabor: 0,
      overhead: 0,
      unallocatedLabor: 0,
      runStatus: "NONE",
      blockingIssues: 0,
      warnings: 0,
    },
    expenseSummary: {
      selectedPeriodTotal: 0,
      confirmedProjectExpenses: 0,
      pendingProjectExpenses: 0,
      unallocatedExpenses: 0,
    },
    attention: [],
    invoiceOperations: {
      totalsByCurrency: {},
      outstandingByCurrency: {},
      vatByCurrency: {},
      overdueCount: 0,
      needsReviewCount: 0,
      verifiedCount: 0,
      totalCount: 0,
      phpVatable: 0,
      phpZeroRated: 0,
      phpExempt: 0,
      phpMissingVatDetails: 0,
      phNeedsReviewCount: 0,
      recent: [],
    },
  };

  // During hydration (workspaceDataPending = true, empty projects) -> renders skeleton
  const hydratingMarkup = renderToStaticMarkup(
    <AppPermissionProvider permissions={["*"]} workspaceDataPending={true}>
      <DashboardRoute
        data={blankData}
        projects={[]}
        onActivityPeriodChange={() => {}}
        onCurrencyChange={() => {}}
        onNavigate={() => {}}
        onOpenProject={() => {}}
        onOpenInvoice={() => {}}
      />
    </AppPermissionProvider>
  );
  assert.match(hydratingMarkup, /aria-label="Loading workspace page"/);
  assert.match(hydratingMarkup, /animate-pulse/);

  // After hydration completes (workspaceDataPending = false, legitimate 0 projects) -> renders dashboard
  const loadedMarkup = renderToStaticMarkup(
    <AppPermissionProvider permissions={["*"]} workspaceDataPending={false}>
      <DashboardRoute
        data={blankData}
        projects={[]}
        onActivityPeriodChange={() => {}}
        onCurrencyChange={() => {}}
        onNavigate={() => {}}
        onOpenProject={() => {}}
        onOpenInvoice={() => {}}
      />
    </AppPermissionProvider>
  );
  assert.match(loadedMarkup, /Operations overview/);
  assert.match(loadedMarkup, /Executive Dashboard/);
});

test("ProjectsPage and ExpensesPage render loading placeholders during hydration and real values after loading", () => {
  // ProjectsPage during hydration
  const hydratingProjects = renderToStaticMarkup(
    <AppPermissionProvider permissions={["*"]} workspaceDataPending={true}>
      <ProjectsPage
        projects={[]}
        summaries={{}}
        onSaveProject={() => {}}
        onOpenProject={() => {}}
        onPreviewProjectLifecycle={async () => ({} as any)}
        onApplyProjectLifecycle={async () => undefined}
      />
    </AppPermissionProvider>
  );
  assert.match(hydratingProjects, /animate-pulse/);

  // ProjectsPage after load with 0 projects
  const loadedProjects = renderToStaticMarkup(
    <AppPermissionProvider permissions={["*"]} workspaceDataPending={false}>
      <ProjectsPage
        projects={[]}
        summaries={{}}
        onSaveProject={() => {}}
        onOpenProject={() => {}}
        onPreviewProjectLifecycle={async () => ({} as any)}
        onApplyProjectLifecycle={async () => undefined}
      />
    </AppPermissionProvider>
  );
  assert.match(loadedProjects, /No projects yet/);

  // ExpensesPage during hydration
  const hydratingExpenses = renderToStaticMarkup(
    <AppPermissionProvider permissions={["*"]} workspaceDataPending={true}>
      <ExpensesPage
        expenses={[]}
        projects={[]}
        onSave={() => {}}
        onPreviewCorrection={async () => ({} as any)}
        onApplyCorrection={async () => undefined}
      />
    </AppPermissionProvider>
  );
  assert.match(hydratingExpenses, /animate-pulse/);

  // ExpensesPage after load with 0 expenses
  const loadedExpenses = renderToStaticMarkup(
    <AppPermissionProvider permissions={["*"]} workspaceDataPending={false}>
      <ExpensesPage
        expenses={[]}
        projects={[]}
        onSave={() => {}}
        onPreviewCorrection={async () => ({} as any)}
        onApplyCorrection={async () => undefined}
      />
    </AppPermissionProvider>
  );
  assert.match(loadedExpenses, /No expenses yet/);
});

test("PayrollPageV2 renders loading placeholders during hydration and real values after loading", () => {
  // PayrollPageV2 during hydration
  const hydratingPayroll = renderToStaticMarkup(
    <AppPermissionProvider permissions={["*"]} workspaceDataPending={true}>
      <PayrollPageV2
        workers={[]}
        assignments={[]}
        periods={[]}
        runs={[]}
        entries={[]}
        allocations={[]}
        adjustments={[]}
        workEntries={[]}
        projects={[]}
        onSaveWorker={() => {}}
        onSavePeriod={() => {}}
      />
    </AppPermissionProvider>
  );
  assert.match(hydratingPayroll, /animate-pulse/);

  // PayrollPageV2 after load with 0 workers/periods
  const loadedPayroll = renderToStaticMarkup(
    <AppPermissionProvider permissions={["*"]} workspaceDataPending={false}>
      <PayrollPageV2
        workers={[]}
        assignments={[]}
        periods={[]}
        runs={[]}
        entries={[]}
        allocations={[]}
        adjustments={[]}
        workEntries={[]}
        projects={[]}
        onSaveWorker={() => {}}
        onSavePeriod={() => {}}
      />
    </AppPermissionProvider>
  );
  assert.match(loadedPayroll, /Active workers/);
  assert.match(loadedPayroll, /No active period/);
});
