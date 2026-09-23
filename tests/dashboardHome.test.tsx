import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardRoute } from "../src/app/routes/DashboardRoute.tsx";
import { AppPermissionProvider } from "../src/app/AppPermissionContext.tsx";
import { buildDashboardViewData } from "../src/utils/dashboardViewModel.ts";
import { projectCostDataCompleteness } from "../src/utils/dataCompleteness.ts";

function sourceIfPresent(path: string) {
  try {
    return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  } catch {
    return "";
  }
}

const homeSource = sourceIfPresent("src/components/dashboard/HomeDashboard.tsx");
const routeSource = readFileSync(new URL("../src/app/routes/DashboardRoute.tsx", import.meta.url), "utf8");
const analyticsSource = readFileSync(new URL("../src/components/engineering/EngineeringCostOperationsDashboard.tsx", import.meta.url), "utf8");
const projectPageSource = readFileSync(new URL("../src/components/projects/ProjectsPage.tsx", import.meta.url), "utf8");
const projectCardsSource = readFileSync(new URL("../src/components/projects/ProjectPortfolioRegisterSection.tsx", import.meta.url), "utf8");

function dashboardData() {
  return buildDashboardViewData({
    projects: [],
    invoices: [],
    expenses: [],
    payroll: [],
    periods: [],
    workers: [],
    payrollEntries: [],
    payrollAllocations: [],
    payrollRuns: [],
    activityPeriod: "MONTH",
    today: "2026-09-23",
  });
}

const routeProps = {
  data: dashboardData(),
  projects: [],
  onActivityPeriodChange: () => {},
  onCurrencyChange: () => {},
  onNavigate: () => {},
  onOpenProject: () => {},
  onOpenInvoice: () => {},
};

function renderRoute(workspaceDataPending: boolean, incomplete = false) {
  const projectCostCompleteness = incomplete
    ? projectCostDataCompleteness(["*"], { sourceStates: { directExpenses: "incomplete" } })
    : undefined;
  return renderToStaticMarkup(
    <AppPermissionProvider permissions={["*"]} workspaceDataPending={workspaceDataPending} projectCostCompleteness={projectCostCompleteness}>
      <DashboardRoute {...routeProps} />
    </AppPermissionProvider>,
  );
}

test("Home keeps the same primary composition before and after workspace hydration", () => {
  const loadingMarkup = renderRoute(true);
  const hydratedMarkup = renderRoute(false);

  assert.ok(loadingMarkup.includes('data-dashboard-view="home"'), "Home should render while data is loading");
  assert.ok(hydratedMarkup.includes('data-dashboard-view="home"'), "Home should render after hydration");
  assert.doesNotMatch(loadingMarkup, /Executive Dashboard/);
  assert.doesNotMatch(hydratedMarkup, /Executive Dashboard/);
  assert.ok(/What do you want to do today/i.test(loadingMarkup), "the task launchpad should render while loading");
  assert.ok(/What do you want to do today/i.test(hydratedMarkup), "the task launchpad should render after hydration");
});

test("incomplete project-cost sources withhold affected insights without replacing Home", () => {
  const markup = renderRoute(false, true);

  assert.ok(markup.includes('data-dashboard-view="home"'), "incomplete sources should not replace Home");
  assert.ok(/project cost insights/i.test(markup), "the incomplete aggregate should be explained compactly");
  assert.ok(/Projects|Supplier Invoices/.test(markup), "permission-allowed source navigation should remain available");
  assert.doesNotMatch(markup, /Executive Dashboard/);
});

test("project-specific Home attention is wired to the exact project opener", () => {
  assert.match(homeSource, /activateDashboardAttention\(item,\s*onNavigate,\s*onOpenProject\)/);
});

test("Operations Insights framing retains the existing analytics dashboard", () => {
  const markup = renderToStaticMarkup(
    <AppPermissionProvider permissions={["*"]} workspaceDataPending={false}>
      {React.createElement(DashboardRoute, { ...routeProps, view: "insights", onNavigatePath: () => {} } as never)}
    </AppPermissionProvider>,
  );

  assert.ok(markup.includes('data-dashboard-view="insights"'), "the secondary view should identify Operations Insights");
  assert.ok(/Operations Insights/.test(markup), "the analytics destination should have clear framing");
  assert.ok(/Project budget position/.test(markup), "the existing analytics capability should remain available");
  assert.ok(/EngineeringCostOperationsDashboard/.test(analyticsSource), "the legacy analytics component should be retained");
});

test("Operations Insights stays reachable while withholding incomplete combined analysis", () => {
  const incomplete = projectCostDataCompleteness(["*"], { sourceStates: { directExpenses: "incomplete" } });
  const markup = renderToStaticMarkup(
    <AppPermissionProvider permissions={["*"]} workspaceDataPending={false} projectCostCompleteness={incomplete}>
      {React.createElement(DashboardRoute, { ...routeProps, view: "insights", onNavigatePath: () => {} } as never)}
    </AppPermissionProvider>,
  );

  assert.ok(markup.includes('data-dashboard-view="insights"'), "the Insights destination should remain reachable");
  assert.ok(/Combined project-cost analysis is withheld/.test(markup), "incomplete analytics should fail closed with a clear state");
  assert.ok(/Back to Home/.test(markup), "the secondary destination should provide a Home return path");
  assert.ok(!/Project budget position/.test(markup), "incomplete combined charts should not display false zeroes");
});

test("R4C structural surfaces use semantic theme styling", () => {
  const lightOnlyStructure = /\b(?:bg-white|bg-slate-50|text-slate-(?:950|900|800|700|600)|border-slate-(?:200|100))\b/;

  assert.ok(/hqs-(?:surface|primary-text|secondary-text|border)/.test(homeSource), "Home should use semantic surface and text tokens");
  assert.doesNotMatch(homeSource, lightOnlyStructure);
  assert.doesNotMatch(routeSource, lightOnlyStructure);
  assert.doesNotMatch(analyticsSource, lightOnlyStructure);
  assert.doesNotMatch(projectPageSource, lightOnlyStructure);
  assert.doesNotMatch(projectCardsSource, lightOnlyStructure);
});
