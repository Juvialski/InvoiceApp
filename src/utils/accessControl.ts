import type { AppTab } from "./routes.ts";

/**
 * Permission keys are the only frontend authorization vocabulary. Role names
 * are still useful for display, but modules and mutations must ask for one of
 * these capabilities rather than infer access from a role label.
 */
export const PERMISSION_KEYS = {
  dashboardView: "dashboard.read",
  cashSummaryRead: "cash.summary.read",
  cashTransactionsRead: "cash.transactions.read",
  cashAccountsManage: "cash.accounts.manage",
  cashTransactionsManage: "cash.transactions.manage",
  cashImport: "cash.import",
  cashReconcile: "cash.reconcile",
  cashConnectionsManage: "cash.connections.manage",
  invoicesRead: "invoices.read",
  invoicesWrite: "invoices.manage",
  invoicesExtract: "invoices.extract",
  gmailRead: "gmail.read",
  gmailManage: "gmail.manage",
  projectsRead: "projects.read",
  projectsWrite: "projects.manage",
  expensesRead: "expenses.read",
  expensesWrite: "expenses.manage",
  workersRead: "workers.read",
  workersManage: "workers.manage",
  workersCompensationRead: "workers.compensation.read",
  payrollRead: "payroll.detail.read",
  payrollWrite: "payroll.manage",
  payrollApprove: "payroll.approve",
  payrollSettings: "payroll.settings",
  payrollImport: "payroll.import",
  payrollAggregateRead: "payroll.summary.read",
  payrollSensitiveRead: "payroll.detail.read",
  reportsRead: "reports.financial.read",
  reportsExport: "reports.financial.read",
  settingsRead: "company.settings.read",
  companyManage: "company.settings.manage",
  accessManage: "company.members.read",
  platformManage: "platform.manage",
  engineeringDocumentsRead: "engineering.documents.read",
  engineeringDocumentsCreate: "engineering.documents.create",
  engineeringDocumentsUpdate: "engineering.documents.update",
  engineeringDocumentsManage: "engineering.documents.manage",
  engineeringRfisRead: "engineering.rfis.read",
  engineeringRfisCreate: "engineering.rfis.create",
  engineeringRfisRespond: "engineering.rfis.respond",
  engineeringRfisManage: "engineering.rfis.manage",
  engineeringSubmittalsRead: "engineering.submittals.read",
  engineeringSubmittalsCreate: "engineering.submittals.create",
  engineeringSubmittalsReview: "engineering.submittals.review",
  engineeringSubmittalsManage: "engineering.submittals.manage",
  engineeringSiteLogsRead: "engineering.site_logs.read",
  engineeringSiteLogsCreate: "engineering.site_logs.create",
  engineeringSiteLogsUpdate: "engineering.site_logs.update",
  engineeringSiteLogsSubmit: "engineering.site_logs.submit",
  engineeringSiteLogsManage: "engineering.site_logs.manage",
} as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[keyof typeof PERMISSION_KEYS] | (string & {});

export const ALL_PERMISSION_KEYS: readonly PermissionKey[] = Object.freeze(Object.values(PERMISSION_KEYS));

export const ROUTE_PERMISSION_REQUIREMENTS: Readonly<Partial<Record<AppTab, PermissionKey>>> = Object.freeze({
  dashboard: PERMISSION_KEYS.dashboardView,
  cash: PERMISSION_KEYS.cashSummaryRead,
  projects: PERMISSION_KEYS.projectsRead,
  extractor: PERMISSION_KEYS.invoicesExtract,
  inbox: PERMISSION_KEYS.gmailRead,
  review: PERMISSION_KEYS.invoicesRead,
  invoices: PERMISSION_KEYS.invoicesRead,
  payroll: PERMISSION_KEYS.payrollRead,
  expenses: PERMISSION_KEYS.expensesRead,
  vendors: "vendors.read",
  reports: PERMISSION_KEYS.reportsRead,
  settings: PERMISSION_KEYS.settingsRead,
});

export function normalizePermissionKey(value: unknown): PermissionKey | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized ? normalized as PermissionKey : null;
}

export function normalizePermissionKeys(values: unknown): PermissionKey[] {
  const candidates = Array.isArray(values)
    ? values
    : values && typeof values === "object"
      ? Object.entries(values as Record<string, unknown>).flatMap(([key, value]) => value ? [key] : [])
      : [];
  return [...new Set(candidates.map(normalizePermissionKey).filter((value): value is PermissionKey => Boolean(value)))];
}

export function hasPermission(permissions: Iterable<PermissionKey> | null | undefined, required: PermissionKey | null | undefined): boolean {
  if (!required) return true;
  for (const permission of permissions || []) if (permission === required || permission === "*") return true;
  return false;
}

export function hasAnyPermission(permissions: Iterable<PermissionKey> | null | undefined, required: readonly PermissionKey[]): boolean {
  return required.some((permission) => hasPermission(permissions, permission));
}

export function requiredPermissionForAppTab(tab: AppTab): PermissionKey | null {
  return ROUTE_PERMISSION_REQUIREMENTS[tab] || null;
}

export const ROUTE_PERMISSION_ALTERNATIVES: Readonly<Partial<Record<AppTab, readonly PermissionKey[]>>> = Object.freeze({
  reports: ["reports.payroll.read"],
});

export function canAccessAppTab(tab: AppTab, permissions: Iterable<PermissionKey> | null | undefined): boolean {
  return hasPermission(permissions, requiredPermissionForAppTab(tab)) || (ROUTE_PERMISSION_ALTERNATIVES[tab] || []).some((permission) => hasPermission(permissions, permission));
}

export function permittedAppTabs(permissions: Iterable<PermissionKey> | null | undefined): AppTab[] {
  return (Object.keys(ROUTE_PERMISSION_REQUIREMENTS) as AppTab[]).filter((tab) => canAccessAppTab(tab, permissions));
}

export function defaultAppTabForPermissions(permissions: Iterable<PermissionKey> | null | undefined): AppTab {
  if (hasPermission(permissions, PERMISSION_KEYS.payrollSensitiveRead) && !hasAnyPermission(permissions, [
    PERMISSION_KEYS.dashboardView,
    PERMISSION_KEYS.cashSummaryRead,
    PERMISSION_KEYS.invoicesRead,
    PERMISSION_KEYS.expensesRead,
    PERMISSION_KEYS.gmailRead,
    PERMISSION_KEYS.reportsRead,
  ])) return "payroll";
  if (hasPermission(permissions, PERMISSION_KEYS.dashboardView)) return "dashboard";
  return permittedAppTabs(permissions)[0] || "dashboard";
}

export function permissionDisplayName(permission: PermissionKey | null | undefined): string {
  const labels: Record<string, string> = {
    [PERMISSION_KEYS.dashboardView]: "Dashboard",
    [PERMISSION_KEYS.cashSummaryRead]: "Cash & Banking",
    [PERMISSION_KEYS.cashTransactionsRead]: "Cash transactions",
    [PERMISSION_KEYS.cashAccountsManage]: "Cash account management",
    [PERMISSION_KEYS.cashTransactionsManage]: "Manual cash transactions",
    [PERMISSION_KEYS.cashImport]: "Cash statement import",
    [PERMISSION_KEYS.cashReconcile]: "Cash reconciliation",
    [PERMISSION_KEYS.cashConnectionsManage]: "Cash connections",
    [PERMISSION_KEYS.invoicesRead]: "Invoices",
    [PERMISSION_KEYS.invoicesWrite]: "Invoice editing",
    [PERMISSION_KEYS.invoicesExtract]: "Invoice extraction",
    [PERMISSION_KEYS.gmailRead]: "Gmail",
    [PERMISSION_KEYS.gmailManage]: "Gmail connection management",
    [PERMISSION_KEYS.projectsRead]: "Projects",
    [PERMISSION_KEYS.projectsWrite]: "Project editing",
    [PERMISSION_KEYS.expensesRead]: "Expenses",
    [PERMISSION_KEYS.expensesWrite]: "Expense editing",
    [PERMISSION_KEYS.workersRead]: "Workforce",
    [PERMISSION_KEYS.workersManage]: "Workforce administration",
    [PERMISSION_KEYS.workersCompensationRead]: "Compensation details",
    [PERMISSION_KEYS.payrollWrite]: "Payroll editing",
    [PERMISSION_KEYS.payrollApprove]: "Payroll approval and payment",
    [PERMISSION_KEYS.payrollSettings]: "Payroll settings and maintenance",
    [PERMISSION_KEYS.payrollImport]: "Payroll imports",
    [PERMISSION_KEYS.payrollAggregateRead]: "Payroll cost summaries",
    [PERMISSION_KEYS.payrollSensitiveRead]: "Sensitive payroll details",
    [PERMISSION_KEYS.reportsRead]: "Reports",
    [PERMISSION_KEYS.settingsRead]: "Settings",
    [PERMISSION_KEYS.companyManage]: "Company settings",
    [PERMISSION_KEYS.accessManage]: "Access management",
    [PERMISSION_KEYS.platformManage]: "Platform management",
    [PERMISSION_KEYS.engineeringDocumentsRead]: "Engineering document viewing",
    [PERMISSION_KEYS.engineeringDocumentsCreate]: "Engineering document uploads",
    [PERMISSION_KEYS.engineeringDocumentsUpdate]: "Engineering annotations",
    [PERMISSION_KEYS.engineeringDocumentsManage]: "Engineering document management",
    [PERMISSION_KEYS.engineeringRfisRead]: "RFI register viewing",
    [PERMISSION_KEYS.engineeringRfisCreate]: "RFI creation and opening",
    [PERMISSION_KEYS.engineeringRfisRespond]: "RFI formal responses",
    [PERMISSION_KEYS.engineeringRfisManage]: "RFI closure and voiding",
    [PERMISSION_KEYS.engineeringSubmittalsRead]: "Technical submittal viewing",
    [PERMISSION_KEYS.engineeringSubmittalsCreate]: "Technical submittal submission",
    [PERMISSION_KEYS.engineeringSubmittalsReview]: "Technical submittal review",
    [PERMISSION_KEYS.engineeringSubmittalsManage]: "Technical submittal closure and voiding",
    [PERMISSION_KEYS.engineeringSiteLogsRead]: "Daily Site Log viewing",
    [PERMISSION_KEYS.engineeringSiteLogsCreate]: "Daily Site Log creation",
    [PERMISSION_KEYS.engineeringSiteLogsUpdate]: "Daily Site Log draft editing",
    [PERMISSION_KEYS.engineeringSiteLogsSubmit]: "Daily Site Log submission",
    [PERMISSION_KEYS.engineeringSiteLogsManage]: "Daily Site Log finalization and voiding",
  };
  return labels[permission || ""] || "this area";
}

export function roleDisplayName(roleKey: string | null | undefined): string {
  const normalized = (roleKey || "").trim().toUpperCase();
  const labels: Record<string, string> = {
    PLATFORM_OWNER: "Platform owner",
    COMPANY_ADMIN: "Company admin",
    FINANCE: "Finance",
    PAYROLL: "Payroll",
    VIEWER: "Viewer",
  };
  return labels[normalized] || roleKey || "Member";
}
