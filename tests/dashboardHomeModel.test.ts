import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { activateDashboardAttention, dashboardAttentionForHome, dashboardSnapshotForHome } from "../src/utils/dashboardHomeModel.ts";
import { projectCostDataCompleteness } from "../src/utils/dataCompleteness.ts";
import { buildDashboardViewData } from "../src/utils/dashboardViewModel.ts";
import type { Project } from "../src/types.ts";

test("Dashboard launch items contain only destinations allowed by the effective permissions", async () => {
  const modelPath = new URL("../src/utils/dashboardHomeModel.ts", import.meta.url);
  const modelSource = existsSync(modelPath) ? readFileSync(modelPath, "utf8") : "";
  assert.match(modelSource, /export function dashboardLaunchItemsForPermissions/);

  const { dashboardLaunchItemsForPermissions } = await import("../src/utils/dashboardHomeModel.ts");
  const projectsOnly = dashboardLaunchItemsForPermissions(["projects.read"]);
  const invoicesAndCash = dashboardLaunchItemsForPermissions(["invoices.read", "cash.summary.read"]);
  const noWorkflowPermissions = dashboardLaunchItemsForPermissions([]);

  assert.deepEqual(projectsOnly.map((item) => item.tab), ["projects", "documents"]);
  assert.deepEqual(invoicesAndCash.map((item) => item.tab), ["invoices", "cash", "documents"]);
  assert.equal(projectsOnly.some((item) => item.tab === "payroll"), false);
  assert.equal(invoicesAndCash.some((item) => item.tab === "payroll"), false);
  assert.deepEqual(noWorkflowPermissions, []);
});

test("project attention opens the exact project while general attention keeps its existing route", () => {
  const calls: string[] = [];
  const handlers = {
    onNavigate: (tab: string) => calls.push(`tab:${tab}`),
    onOpenProject: (projectId: string) => calls.push(`project:${projectId}`),
  };

  activateDashboardAttention({
    id: "project-project-42",
    label: "Project needs budget attention",
    detail: "Budget threshold requires review.",
    action: "projects",
    projectId: "project-42",
  }, handlers.onNavigate, handlers.onOpenProject);
  activateDashboardAttention({
    id: "invoice-review",
    label: "Invoices need review",
    detail: "Verify source documents.",
    action: "review",
  }, handlers.onNavigate, handlers.onOpenProject);

  assert.deepEqual(calls, ["project:project-42", "tab:review"]);
});

test("Home withholds only attention items that depend on incomplete cost sources", () => {
  const completeness = projectCostDataCompleteness(["*"], { sourceStates: { directExpenses: "incomplete" } });
  const items = [
    { id: "invoice-review", label: "Invoices need review", detail: "Verify the source document.", count: 2, action: "review" as const },
    { id: "invoice-overdue", label: "Overdue invoices", detail: "Review payable state.", count: 1, action: "invoices" as const },
    { id: "project-project-1", label: "Project needs budget attention", detail: "Cost position is incomplete.", action: "projects" as const },
  ];

  const visible = dashboardAttentionForHome({ items, permissions: ["*"], completeness, workspaceDataPending: false });

  assert.deepEqual(visible.map((item) => item.id), ["invoice-review"]);
});

test("unrelated payroll incompleteness does not hide available supplier invoice attention", () => {
  const completeness = projectCostDataCompleteness(["*"], { sourceStates: { payrollLabor: "incomplete" } });
  const items = [
    { id: "invoice-review", label: "Invoices need review", detail: "Verify the source document.", count: 2, action: "review" as const },
    { id: "invoice-overdue", label: "Overdue invoices", detail: "Review payable state.", count: 1, action: "invoices" as const },
    { id: "project-project-1", label: "Project needs budget attention", detail: "Combined cost state.", action: "projects" as const },
  ];

  const visible = dashboardAttentionForHome({ items, permissions: ["*"], completeness, workspaceDataPending: false });

  assert.deepEqual(visible.map((item) => item.id), ["invoice-review", "invoice-overdue"]);
});

test("Home snapshot omits unavailable invoice counts without hiding the independent project count", () => {
  const completeness = projectCostDataCompleteness(["projects.read", "invoices.read"], {
    sourceStates: { supplierInvoices: "incomplete" },
  });
  const data = buildDashboardViewData({
    projects: [], invoices: [], expenses: [], payroll: [], periods: [], workers: [], payrollEntries: [],
    payrollAllocations: [], payrollRuns: [], activityPeriod: "MONTH", today: "2026-09-23",
  });
  const projects = [
    { id: "active-project", status: "ACTIVE" },
    { id: "planned-project", status: "PLANNING" },
  ] as unknown as Project[];

  const snapshot = dashboardSnapshotForHome({ projects, data, permissions: ["projects.read", "invoices.read"], completeness, workspaceDataPending: false });
  const loading = dashboardSnapshotForHome({ projects, data, permissions: ["projects.read", "invoices.read"], completeness, workspaceDataPending: true });

  assert.deepEqual(snapshot, [{ id: "active-projects", label: "Active projects", value: 1, tab: "projects" }]);
  assert.deepEqual(loading, []);
});
