import {
  DEPLOYMENT_HIDDEN_MODULES,
  isDeploymentModuleVisible,
  type DeploymentModuleKey,
} from "../../config/moduleVisibility.ts";

export type ProjectWorkspaceVisibilityTab =
  | "overview"
  | "billing"
  | "budget"
  | "procurement"
  | "documents"
  | "rfis"
  | "submittals"
  | "site-logs"
  | "materials-equipment"
  | "invoices"
  | "payroll"
  | "expenses"
  | "people"
  | "reports";

const TAB_MODULES: Partial<Record<ProjectWorkspaceVisibilityTab, DeploymentModuleKey>> = {
  procurement: "procurement",
  documents: "engineering-documents",
  rfis: "engineering-documents",
  submittals: "engineering-documents",
  "materials-equipment": "materials-equipment",
  invoices: "invoices",
  payroll: "payroll",
  expenses: "expenses",
  reports: "reports",
};

/** Deployment visibility only; callers must still perform normal permission checks. */
export function isProjectWorkspaceTabDeploymentVisible(
  tab: ProjectWorkspaceVisibilityTab,
  hiddenModules: ReadonlySet<DeploymentModuleKey> = DEPLOYMENT_HIDDEN_MODULES,
) {
  const moduleKey = TAB_MODULES[tab];
  return moduleKey ? isDeploymentModuleVisible(moduleKey, hiddenModules) : true;
}
