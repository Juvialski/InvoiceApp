import type { DashboardAttentionItem, DashboardViewData } from "../components/engineering/EngineeringCostOperationsDashboard.tsx";
import type { Project } from "../types.ts";
import { hasAllPermissions, PERMISSION_KEYS, type PermissionKey } from "./accessControl.ts";
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

/** Task shortcuts use the same permissions as their destination's mutations. */
export function dashboardQuickTasksForPermissions(permissions: Iterable<PermissionKey> | null | undefined): DashboardLaunchItem[] {
  const effective = permissions ? [...permissions] : [];
  const visible = visibleDashboardTabs(effective);
  const tasks: DashboardLaunchItem[] = [];
  if (visible.has("extractor") && hasAllPermissions(effective, [PERMISSION_KEYS.invoicesWrite, PERMISSION_KEYS.invoicesExtract, PERMISSION_KEYS.invoicesVerify])) {
    tasks.push({ id: "add-bill", tab: "extractor", label: "Add bill", description: "Upload a supplier bill for review.", emphasis: "primary" });
  }
  if (visible.has("invoices") && visible.has("cash") && hasAllPermissions(effective, [PERMISSION_KEYS.cashSummaryRead, PERMISSION_KEYS.cashTransactionsManage, PERMISSION_KEYS.cashReconcile, PERMISSION_KEYS.expensesRead, PERMISSION_KEYS.expensesWrite])) {
    tasks.push({ id: "record-payment", tab: "invoices", label: "Record payment", description: "Choose a confirmed bill, then record its payment.", emphasis: "primary" });
  }
  if (visible.has("workbook")) tasks.push({ id: "open-workbook", tab: "workbook", label: "Open workbook", description: "Edit the fields your role can change.", emphasis: "primary" });
  if (visible.has("warehouse") && hasAllPermissions(effective, [PERMISSION_KEYS.inventoryRead, PERMISSION_KEYS.inventoryManage, PERMISSION_KEYS.projectsRead])) {
    tasks.push({ id: "assign-stock", tab: "warehouse", label: "Assign stock to a project", description: "Choose stock and issue it to a project.", emphasis: "primary" });
  }
  return tasks;
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

export function activateDashboardAttention(
  item: DashboardAttentionItem,
  onNavigate: (tab: AppTab) => void,
  onOpenProject: (projectId: string) => void,
): void {
  if (item.projectId) {
    onOpenProject(item.projectId);
    return;
  }
  onNavigate(item.action);
}
