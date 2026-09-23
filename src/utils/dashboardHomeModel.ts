import type { DashboardAttentionItem, DashboardViewData } from "../components/engineering/EngineeringCostOperationsDashboard.tsx";
import type { Project } from "../types.ts";
import type { PermissionKey } from "./accessControl.ts";
import type { DataCompleteness, ProjectCostSource } from "./dataCompleteness.ts";
import type { AppTab } from "./routes.ts";
import { getNavigationModel } from "../navigation/navigationModel.ts";

export interface DashboardLaunchItem {
  readonly id: string;
  readonly tab: AppTab;
  readonly label: string;
  readonly description: string;
  readonly emphasis: "primary" | "secondary";
}

const DASHBOARD_LAUNCH_ITEMS: readonly DashboardLaunchItem[] = Object.freeze([
  { id: "projects", tab: "projects", label: "Projects", description: "Open active work and project controls.", emphasis: "primary" },
  { id: "supplier-invoices", tab: "invoices", label: "Supplier Invoices", description: "Review source documents and payable status.", emphasis: "primary" },
  { id: "procurement", tab: "procurement", label: "Procurement", description: "Continue requests and purchase orders.", emphasis: "primary" },
  { id: "expenses", tab: "expenses", label: "Expenses", description: "Review or prepare direct expense records.", emphasis: "secondary" },
  { id: "payroll", tab: "payroll", label: "Payroll", description: "Continue the current payroll cycle.", emphasis: "secondary" },
  { id: "cash", tab: "cash", label: "Cash & Banking", description: "Review account activity and reconciliation.", emphasis: "secondary" },
  { id: "warehouse", tab: "warehouse", label: "Warehouse Inventory", description: "Review stock and recorded movements.", emphasis: "secondary" },
  { id: "equipment", tab: "equipment", label: "Equipment", description: "Review equipment records and allocation.", emphasis: "secondary" },
  { id: "documents", tab: "documents", label: "Documents", description: "Find managed and issued documents.", emphasis: "secondary" },
  { id: "email-sms", tab: "inbox", label: "Email / SMS", description: "Compose reviewed messages and check delivery history.", emphasis: "secondary" },
]);

function visibleDashboardTabs(permissions: Iterable<PermissionKey> | null | undefined): Set<AppTab> {
  return new Set(getNavigationModel({ permissions }).modules.flatMap((module) => module.routes.map((route) => route.appTab)));
}

export function dashboardLaunchItemsForPermissions(
  permissions: Iterable<PermissionKey> | null | undefined,
): DashboardLaunchItem[] {
  const visibleTabs = visibleDashboardTabs(permissions);
  return DASHBOARD_LAUNCH_ITEMS.filter((item) => visibleTabs.has(item.tab));
}

export interface DashboardHomeSnapshotItem {
  readonly id: "active-projects" | "invoice-review";
  readonly label: string;
  readonly value: number;
  readonly tab: AppTab;
}

export function dashboardSnapshotForHome(input: {
  projects: readonly Project[];
  data: DashboardViewData;
  permissions: Iterable<PermissionKey> | null | undefined;
  completeness: DataCompleteness<ProjectCostSource>;
  workspaceDataPending: boolean;
}): DashboardHomeSnapshotItem[] {
  if (input.workspaceDataPending) return [];

  const visibleTabs = visibleDashboardTabs(input.permissions);
  const snapshot: DashboardHomeSnapshotItem[] = [];
  if (visibleTabs.has("projects")) {
    snapshot.push({
      id: "active-projects",
      label: "Active projects",
      value: input.projects.filter((project) => project.status === "ACTIVE" || (project.status as string) === "IN_PROGRESS").length,
      tab: "projects",
    });
  }

  if (visibleTabs.has("invoices") && input.completeness.sourceStates.supplierInvoices === "detail") {
    snapshot.push({
      id: "invoice-review",
      label: "Invoices needing review",
      value: input.data.invoiceOperations.needsReviewCount,
      tab: "review",
    });
  }

  return snapshot;
}

function attentionNeedsCompleteProjectCost(item: DashboardAttentionItem) {
  return item.id === "unallocated-cost" || item.id.startsWith("project-");
}

function attentionNeedsInvoiceSource(item: DashboardAttentionItem) {
  return item.id === "invoice-review" || item.id === "invoice-overdue";
}

function attentionNeedsExpenseSource(item: DashboardAttentionItem) {
  return item.id === "invoice-overdue";
}

export function dashboardAttentionForHome(input: {
  items: readonly DashboardAttentionItem[];
  permissions: Iterable<PermissionKey> | null | undefined;
  completeness: DataCompleteness<ProjectCostSource>;
  workspaceDataPending: boolean;
}): DashboardAttentionItem[] {
  if (input.workspaceDataPending) return [];

  const visibleTabs = visibleDashboardTabs(input.permissions);
  return input.items
    .filter((item) => visibleTabs.has(item.action))
    .filter((item) => !attentionNeedsCompleteProjectCost(item) || input.completeness.complete)
    .filter((item) => !attentionNeedsInvoiceSource(item) || input.completeness.sourceStates.supplierInvoices === "detail")
    .filter((item) => !attentionNeedsExpenseSource(item) || input.completeness.sourceStates.directExpenses === "detail")
    .slice(0, 5);
}
