import { DEMO_QA_SCENARIOS } from "./demoScenarios.ts";
import type { QaScenarioDefinition } from "./structuredEvidence.ts";

export type DemoQaScopeMode = "full" | "affected" | "skip";

export interface DemoQaScope {
  readonly mode: DemoQaScopeMode;
  readonly routeIds: readonly string[];
  readonly features: readonly string[];
  readonly reason: string;
}

export interface DemoQaScopeOptions {
  readonly eventName?: string;
  readonly fileListComplete?: boolean;
}

export interface DemoQaScenarioFilterResult {
  readonly mode: "full" | "affected";
  readonly scenarios: readonly QaScenarioDefinition[];
  readonly reason?: string;
}

const ROUTE_FAMILIES = {
  assistant: ["assistant"],
  cash: ["cash", "cash-settlement"],
  dashboard: ["dashboard"],
  documents: ["documents", "project-documents", "project-overview", "project-workspace", "blueprint-viewer", "engineering-documents", "procurement", "project-billing", "invoice-detail", "invoices", "review", "extract", "expenses", "cash", "equipment", "warehouse", "project-materials-equipment"],
  engineering: ["blueprint-viewer", "engineering-documents", "rfis", "rfi-detail", "submittals", "submittal-detail", "site-logs", "site-log-detail", "project-overview", "project-workspace", "project-documents", "project-financial-control", "reports", "payroll"],
  expenses: ["expenses", "invoice-detail", "cash", "cash-settlement"],
  financial: ["cash", "cash-settlement", "project-billing", "project-financial-control", "reports", "expenses", "invoice-detail", "procurement", "payroll", "payroll-run"],
  help: ["help", "projects", "cash", "inbox"],
  invoices: ["invoices", "invoice-detail", "review", "extract", "expenses", "cash", "procurement", "project-billing"],
  inventory: ["warehouse", "equipment", "project-materials-equipment"],
  messaging: ["inbox"],
  payroll: ["payroll", "payroll-run"],
  procurement: ["procurement", "vendors", "invoice-detail", "expenses", "cash", "project-billing"],
  projects: ["projects", "project-overview", "project-workspace", "project-documents", "project-financial-control", "project-materials-equipment", "project-billing", "equipment", "warehouse"],
  reports: ["reports", "project-financial-control"],
  settings: ["settings"],
} as const;

type RouteFamily = keyof typeof ROUTE_FAMILIES;

const COMPONENT_ROUTE_FAMILIES: Readonly<Record<string, RouteFamily>> = {
  dashboard: "dashboard",
  documents: "documents",
  engineering: "engineering",
  equipment: "inventory",
  expenses: "expenses",
  financial: "financial",
  help: "help",
  inventory: "inventory",
  invoices: "invoices",
  payroll: "payroll",
  procurement: "procurement",
  projects: "projects",
};

const FEATURE_ROUTE_FAMILIES: Readonly<Record<string, RouteFamily>> = {
  engineering: "engineering",
  finance: "financial",
  inventory: "inventory",
  procurement: "procurement",
  projects: "projects",
};

const TEST_FILE_ROUTE_FAMILIES: readonly { readonly pattern: RegExp; readonly family: RouteFamily }[] = [
  { pattern: /payroll|attendance/i, family: "payroll" },
  { pattern: /cash|banking|settlement/i, family: "cash" },
  { pattern: /supplier|invoice|receivable|billing/i, family: "invoices" },
  { pattern: /procurement|purchase.?order|rfq|subcontract|vendor/i, family: "procurement" },
  { pattern: /expense/i, family: "expenses" },
  { pattern: /warehouse|inventory|equipment|materials?/i, family: "inventory" },
  { pattern: /project/i, family: "projects" },
  { pattern: /engineering|blueprint|rfi|submittal|site.?log/i, family: "engineering" },
  { pattern: /document/i, family: "documents" },
  { pattern: /email|sms|messaging/i, family: "messaging" },
  { pattern: /dashboard/i, family: "dashboard" },
  { pattern: /help/i, family: "help" },
  { pattern: /settings|company.?profile/i, family: "settings" },
  { pattern: /report/i, family: "reports" },
  { pattern: /assistant/i, family: "assistant" },
];

const LIB_FILE_ROUTE_FAMILIES: readonly { readonly pattern: RegExp; readonly family: RouteFamily }[] = [
  { pattern: /^(?:payroll|attendance)/i, family: "payroll" },
  { pattern: /^cashBanking/i, family: "cash" },
  { pattern: /^(?:financialSettlement|financialFx|financialLifecycle|accountingStatistics)/i, family: "financial" },
  { pattern: /^(?:clientBilling|clientCollections)/i, family: "invoices" },
  { pattern: /^supplierInvoice/i, family: "invoices" },
  { pattern: /^(?:purchaseOrder|rfqs?|vendors?|subcontracts?|subcontractClaims?|subcontractVariations?)/i, family: "procurement" },
  { pattern: /^(?:expenses?|expenseDuplicateDetection)/i, family: "expenses" },
  { pattern: /^(?:inventory|equipment|materialsEquipment)/i, family: "inventory" },
  { pattern: /^(?:projects?|projectCostCodes|entityMedia)/i, family: "projects" },
  { pattern: /^(?:engineering|dailySiteLogs?|engineeringDocuments?|engineeringCoordination|rfis?|submittals?)/i, family: "engineering" },
  { pattern: /^(?:documentDelivery|documentEmail|documentGeneration|documentRegister|documentSnapshots|documentTemplate|managedDocuments?)/i, family: "documents" },
  { pattern: /^(?:emailMessaging|messaging|smsNumber)/i, family: "messaging" },
  { pattern: /^(?:companyProfile|companyDocumentProfile|userProfile)/i, family: "settings" },
];

const DEMO_QA_INFRASTRUCTURE_TESTS = new Set([
  "tests/demoQaExecution.test.ts",
  "tests/demoQaRouteCoverage.test.ts",
  "tests/demoWorkspace.test.ts",
  "tests/structuredBrowserEvidence.test.ts",
]);

function fullScope(reason: string): DemoQaScope {
  return { mode: "full", routeIds: [], features: [], reason };
}

function normalizeRepoPath(value: string): string | null {
  const normalized = value.trim().replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || /^[a-z]:\//i.test(normalized) || normalized.split("/").includes("..")) return null;
  return normalized.replace(/\/+/g, "/");
}

function isDocumentationOnlyPath(repoPath: string): boolean {
  return /^(?:docs|artifacts)\//i.test(repoPath)
    || /^(?:README|CHANGELOG|LICENSE|CONTRIBUTING|CODE_OF_CONDUCT)(?:\.[^/]*)?$/i.test(repoPath)
    || /^AGENTS\.md$/i.test(repoPath);
}

function isSharedOrInfrastructurePath(repoPath: string): boolean {
  return repoPath.startsWith(".github/")
    || repoPath.startsWith("scripts/")
    || repoPath.startsWith("public/")
    || repoPath.startsWith("supabase/")
    || repoPath === "package.json"
    || repoPath === "package-lock.json"
    || repoPath === "tsconfig.json"
    || repoPath === "vite.config.ts"
    || repoPath === "index.html"
    || repoPath.startsWith("src/app/")
    || repoPath.startsWith("src/navigation/")
    || repoPath.startsWith("src/context/")
    || repoPath.startsWith("src/config/")
    || repoPath.startsWith("src/auth/")
    || repoPath.startsWith("src/access/")
    || repoPath.startsWith("src/domain/")
    || repoPath.startsWith("src/data/")
    || repoPath.startsWith("src/demo/")
    || repoPath.startsWith("src/server/")
    || repoPath.startsWith("src/workflow-map/")
    || repoPath.startsWith("src/ui/")
    || repoPath === "src/App.tsx"
    || repoPath === "src/main.tsx"
    || repoPath === "src/types.ts"
    || repoPath.startsWith("src/components/ui/")
    || repoPath.startsWith("src/components/access/")
    || repoPath.startsWith("src/components/auth/")
    || repoPath === "src/components/help/HelpAction.tsx"
    || repoPath.toLowerCase().endsWith(".css");
}

function routeFamilyForPath(repoPath: string): RouteFamily | undefined {
  if (repoPath.startsWith("src/components/")) {
    const componentArea = repoPath.slice("src/components/".length).split("/")[0]?.toLowerCase();
    return componentArea ? COMPONENT_ROUTE_FAMILIES[componentArea] : undefined;
  }

  if (repoPath.startsWith("src/features/")) {
    const featureArea = repoPath.slice("src/features/".length).split("/")[0]?.toLowerCase();
    return featureArea ? FEATURE_ROUTE_FAMILIES[featureArea] : undefined;
  }

  if (repoPath.startsWith("src/lib/")) {
    const fileName = repoPath.slice("src/lib/".length).split("/")[0] || "";
    return LIB_FILE_ROUTE_FAMILIES.find(({ pattern }) => pattern.test(fileName))?.family;
  }

  if (repoPath.startsWith("src/assistant/")) return "assistant";
  if (repoPath.startsWith("src/help/")) return "help";

  if (repoPath.startsWith("tests/")) {
    if (DEMO_QA_INFRASTRUCTURE_TESTS.has(repoPath) || /^tests\/workflowMap/i.test(repoPath)) return undefined;
    const fileName = repoPath.slice("tests/".length).split("/").at(-1) || "";
    return TEST_FILE_ROUTE_FAMILIES.find(({ pattern }) => pattern.test(fileName))?.family;
  }

  return undefined;
}

function routesForFamilies(families: ReadonlySet<RouteFamily>): string[] {
  return [...new Set([...families].flatMap((family) => ROUTE_FAMILIES[family]))].sort();
}

export function selectDemoQaScope(changedFiles: unknown, options: DemoQaScopeOptions = {}): DemoQaScope {
  if (options.eventName !== "pull_request") return fullScope("non-pull-request-events-run-full");
  if (options.fileListComplete !== true) return fullScope("changed-file-list-incomplete-or-unknown");
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) return fullScope("changed-file-list-empty-or-invalid");

  const normalizedPaths: string[] = [];
  for (const changedFile of changedFiles) {
    if (typeof changedFile !== "string") return fullScope("changed-file-entry-invalid");
    const normalized = normalizeRepoPath(changedFile);
    if (!normalized) return fullScope("changed-file-path-invalid");
    normalizedPaths.push(normalized);
  }

  const uniquePaths = [...new Set(normalizedPaths)].sort();
  const relevantPaths = uniquePaths.filter((repoPath) => !isDocumentationOnlyPath(repoPath));
  if (relevantPaths.length === 0) return { mode: "skip", routeIds: [], features: [], reason: "documentation-only-changes" };

  const families = new Set<RouteFamily>();
  for (const repoPath of relevantPaths) {
    if (isSharedOrInfrastructurePath(repoPath)) return fullScope("shared-or-browser-infrastructure-change");
    const family = routeFamilyForPath(repoPath);
    if (!family) return fullScope("unknown-or-unmapped-relevant-file");
    families.add(family);
  }

  const routeIds = routesForFamilies(families);
  const knownRoutes = new Set(DEMO_QA_SCENARIOS.map((scenario) => scenario.route.id));
  if (routeIds.length === 0 || routeIds.some((routeId) => !knownRoutes.has(routeId))) return fullScope("route-family-not-covered-by-scenario-catalog");

  const routeSet = new Set(routeIds);
  const features = [...new Set(DEMO_QA_SCENARIOS
    .filter((scenario) => routeSet.has(scenario.route.id))
    .map((scenario) => `${scenario.feature}@${scenario.route.id}`))].sort();
  if (features.length === 0) return fullScope("route-family-has-no-scenarios");
  return { mode: "affected", routeIds, features, reason: "mapped-domain-routes" };
}

function parseFeatureSelector(value: string): { readonly feature: string; readonly routeId?: string } | null {
  const selector = value.trim();
  if (!selector) return null;
  const separatorIndex = selector.indexOf("@");
  if (separatorIndex < 0) return { feature: selector };
  if (separatorIndex === 0 || separatorIndex === selector.length - 1 || selector.indexOf("@", separatorIndex + 1) >= 0) return null;
  return { feature: selector.slice(0, separatorIndex), routeId: selector.slice(separatorIndex + 1) };
}

export function filterDemoQaScenarios(
  scenarios: readonly QaScenarioDefinition[],
  featureFilters: readonly string[],
): DemoQaScenarioFilterResult {
  const selectors = [...new Set(featureFilters.map((value) => value.trim()).filter(Boolean))];
  if (selectors.length === 0) return { mode: "full", scenarios, reason: "no-feature-filter" };

  const parsed = selectors.map(parseFeatureSelector);
  if (parsed.some((selector) => selector === null)) return { mode: "full", scenarios, reason: "invalid-feature-filter" };

  const selected = scenarios.filter((scenario) => parsed.some((selector) =>
    selector !== null
    && selector.feature === scenario.feature
    && (selector.routeId === undefined || selector.routeId === scenario.route.id)));
  const unmatched = parsed.filter((selector) => selector !== null && !scenarios.some((scenario) =>
    selector.feature === scenario.feature
    && (selector.routeId === undefined || selector.routeId === scenario.route.id)));
  if (selected.length === 0 || unmatched.length > 0) return { mode: "full", scenarios, reason: "unmatched-feature-filter" };
  return { mode: "affected", scenarios: selected };
}
