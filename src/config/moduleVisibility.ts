export const DEPLOYMENT_MODULE_KEYS = [
  "dashboard",
  "cash",
  "invoices",
  "email-intake",
  "projects",
  "expenses",
  "payroll",
  "reports",
  "engineering-documents",
  "settings",
] as const;

export type DeploymentModuleKey = (typeof DEPLOYMENT_MODULE_KEYS)[number];

const DEPLOYMENT_MODULE_KEY_SET = new Set<string>(DEPLOYMENT_MODULE_KEYS);

export const MODULE_VISIBILITY_ENV_KEY = "VITE_ENGORYX_HIDDEN_MODULES";

function configuredHiddenModulesValue() {
  const viteValue = import.meta.env?.VITE_ENGORYX_HIDDEN_MODULES;
  if (typeof viteValue === "string") return viteValue;
  if (typeof process !== "undefined") {
    const processValue = process.env?.VITE_ENGORYX_HIDDEN_MODULES;
    if (typeof processValue === "string") return processValue;
  }
  return "";
}

/**
 * Deployment visibility is presentation/configuration only. It must never be
 * used as an authorization decision; RBAC/RLS remain authoritative.
 */
export function parseHiddenDeploymentModules(value?: string | null): ReadonlySet<DeploymentModuleKey> {
  const hidden = new Set<DeploymentModuleKey>();
  for (const token of String(value || "").split(",")) {
    const key = token.trim().toLowerCase();
    if (DEPLOYMENT_MODULE_KEY_SET.has(key)) hidden.add(key as DeploymentModuleKey);
  }
  return hidden;
}

export const DEPLOYMENT_HIDDEN_MODULES = parseHiddenDeploymentModules(configuredHiddenModulesValue());

export function isDeploymentModuleVisible(
  moduleKey: DeploymentModuleKey,
  hiddenModules: ReadonlySet<DeploymentModuleKey> = DEPLOYMENT_HIDDEN_MODULES,
) {
  return !hiddenModules.has(moduleKey);
}

export function visibleDeploymentModules(
  hiddenModules: ReadonlySet<DeploymentModuleKey> = DEPLOYMENT_HIDDEN_MODULES,
) {
  return DEPLOYMENT_MODULE_KEYS.filter((moduleKey) => isDeploymentModuleVisible(moduleKey, hiddenModules));
}
