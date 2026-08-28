import { applicationModeForPath, isDemoApplicationPath } from "../../src/app/applicationMode.ts";
import { ASSISTANT_PREPARED_ACTION_STATUSES } from "../../src/assistant/assistantTypes.ts";
import { CONFIRMATION_REQUIRED } from "../../src/assistant/confirmationPolicy.ts";
import { DEMO_QA_SCENARIOS } from "../qa/demoScenarios.ts";
import { DEMO_APP_ROOT_PATH, DEMO_ROOT_PATH, DEMO_ROUTE_CONTRACTS } from "../../src/demo/demoRouting.ts";
import { ENGORYX_FEATURE_REGISTRY } from "../../src/features/registry.ts";
import { DAILY_LOG_TRANSITIONS, DAILY_SITE_LOG_STATUSES } from "../../src/lib/dailySiteLogs.ts";
import { RFI_STATUSES, RFI_TRANSITIONS, SUBMITTAL_STATUSES, SUBMITTAL_TRANSITIONS } from "../../src/lib/engineeringCoordination.ts";
import { SETTLEMENT_RECORD_STATUSES } from "../../src/lib/financialSettlement.ts";
import { PAYROLL_RUN_STATUSES, PAYROLL_RUN_TRANSITIONS } from "../../src/lib/payroll.ts";
import { ASSISTANT_TOOL_DEFINITIONS } from "../../src/server/assistant/toolRegistry.ts";
import { ALL_PERMISSION_KEYS } from "../../src/utils/accessControl.ts";
import { APP_ROUTE_CONTRACTS } from "../../src/utils/appRouteContracts.ts";
import {
  appPathForCashTransaction,
  appPathForInvoice,
  appPathForPayrollRun,
  appPathForPlatformCompanies,
  appPathForProject,
  appPathForReviewInvoice,
  financialTransactionIdFromSearch,
  parseAppLocation,
  payrollRunIdFromSearch,
} from "../../src/utils/appRouting.ts";

export interface WorkflowRouteContract {
  readonly id: string;
  readonly routeId?: string;
  readonly canonicalPath: string;
  readonly pathPattern: string;
  readonly queryKeys?: readonly string[];
  readonly scope?: string;
}

export interface WorkflowLifecycleContract {
  readonly graphNodeId: string;
  readonly statuses: readonly string[];
  readonly transitions: Readonly<Record<string, readonly string[]>>;
  readonly stateNodePrefix: string;
}

export interface WorkflowSettlementStatusContract {
  readonly graphNodeId: string;
  readonly requiredStatuses: readonly string[];
}

export interface WorkflowAssistantToolContract {
  readonly name: string;
  readonly riskTier: string;
  readonly requiresConfirmation: boolean;
}

export interface WorkflowAssistantContract {
  readonly tools: readonly WorkflowAssistantToolContract[];
  readonly confirmationRequiredByRiskTier: Readonly<Record<string, boolean>>;
  readonly preparedActionStatuses: readonly string[];
}

export interface WorkflowQaScenarioContract {
  readonly id: string;
  readonly route: { readonly id: string; readonly canonicalPath: string };
  readonly path: string;
  readonly hasAction: boolean;
}

export interface WorkflowRouteRoundTripResult {
  readonly kind: string;
  readonly routeId: string | null;
  readonly pathname: string;
  readonly search: string;
  readonly selected: Readonly<Record<string, string | undefined>>;
}

export interface WorkflowRouteRoundTripContract {
  readonly graphNodeId: string;
  readonly description: string;
  readonly run: () => { readonly actual: WorkflowRouteRoundTripResult; readonly expected: WorkflowRouteRoundTripResult };
}

export interface WorkflowDemoIsolationContract {
  readonly modeForPath: (pathname: string, search?: string) => string;
  readonly isDemoPath: (pathname: string) => boolean;
  readonly checks: readonly { readonly label: string; readonly pathname: string; readonly search?: string; readonly expectedMode: string }[];
}

export interface WorkflowMapConsistencyContracts {
  readonly routeContracts: readonly WorkflowRouteContract[];
  readonly routeAdapter: Readonly<Record<string, string>>;
  readonly lifecycleContracts: readonly WorkflowLifecycleContract[];
  readonly settlementStatusContracts: readonly WorkflowSettlementStatusContract[];
  readonly permissionKeys: readonly string[];
  readonly activeFeatureRouteIds: readonly string[];
  readonly featureRouteNodeIds: readonly string[];
  readonly assistant: WorkflowAssistantContract;
  readonly demo: WorkflowDemoIsolationContract;
  readonly qaScenarios: readonly WorkflowQaScenarioContract[];
  readonly requiredCoverageNodeIds: readonly string[];
  readonly requiredCoverageInvariantIds: readonly string[];
  readonly requiredDiagramIds: readonly string[];
  readonly routeRoundTrips: readonly WorkflowRouteRoundTripContract[];
}

export const WORKFLOW_ROUTE_CONTRACT_IDS: Readonly<Record<string, string>> = Object.freeze({
  "route-platform-companies": "platform-companies",
  "route-demo-landing": "demo-landing",
  "route-demo-assistant": "demo-assistant",
  "route-demo-documents": "demo-documents",
  "route-dashboard": "dashboard",
  "route-cash": "cash",
  "route-projects": "projects",
  "route-project-workspace": "project-workspace",
  "route-project-documents": "project-documents",
  "route-project-rfis": "project-rfis",
  "route-rfi-detail": "rfi-detail",
  "route-project-submittals": "project-submittals",
  "route-submittal-detail": "submittal-detail",
  "route-project-site-logs": "project-site-logs",
  "route-site-log-detail": "site-log-detail",
  "route-extract": "extract",
  "route-inbox": "inbox",
  "route-invoices": "invoices",
  "route-invoice-detail": "invoice-detail",
  "route-review-invoice": "review-invoice",
  "route-vendors": "vendors",
  "route-payroll": "payroll",
  "route-payroll-run": "payroll-run",
  "route-expenses": "expenses",
  "route-reports": "reports",
  "route-settings": "settings",
});

function locationSummary(path: string): WorkflowRouteRoundTripResult {
  const [pathname, query = ""] = path.split("?", 2);
  const search = query ? `?${query}` : "";
  const location = parseAppLocation(pathname, search);
  const selected: Record<string, string | undefined> = {};

  if (location.kind === "platform-companies") {
    selected.companyId = location.managementCompanyId;
    selected.tab = location.managementTab;
  } else if (location.kind === "project") {
    selected.projectId = location.projectId;
    selected.view = location.view;
    selected.documentId = location.documentId;
    selected.revisionId = location.revisionId;
    selected.rfiId = location.rfiId;
    selected.submittalId = location.submittalId;
    selected.roundId = location.roundId;
    selected.siteLogId = location.siteLogId;
  } else if (location.kind === "invoice" || location.kind === "review-invoice") {
    selected.invoiceId = location.invoiceId;
    selected.returnTo = location.returnTo;
  } else if (location.kind === "tab" && location.routeId === "cash") {
    const query = new URLSearchParams(location.search);
    selected.transactionId = financialTransactionIdFromSearch(location.search);
    selected.fromTargetType = query.get("fromTargetType") || undefined;
    selected.fromTargetId = query.get("fromTargetId") || undefined;
  } else if (location.kind === "tab" && location.routeId === "payroll") {
    const query = new URLSearchParams(location.search);
    selected.runId = payrollRunIdFromSearch(location.search);
    selected.returnTo = query.get("from") || undefined;
  }

  return {
    kind: location.kind,
    routeId: "routeId" in location ? location.routeId : null,
    pathname: location.pathname,
    search: location.search,
    selected,
  };
}

function expectedLocation(path: string, kind: string, routeId: string | null, selected: Readonly<Record<string, string | undefined>>): WorkflowRouteRoundTripResult {
  const [pathname, query = ""] = path.split("?", 2);
  return { kind, routeId, pathname, search: query ? `?${query}` : "", selected };
}

function roundTrip(
  graphNodeId: string,
  description: string,
  build: () => string,
  expectedPath: string,
  expected: (path: string) => WorkflowRouteRoundTripResult,
): WorkflowRouteRoundTripContract {
  return {
    graphNodeId,
    description,
    run: () => {
      const path = build();
      return { actual: locationSummary(path), expected: expected(expectedPath) };
    },
  };
}

const PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const COMPANY_ID = "00000000-0000-4000-8000-000000000002";
const DOCUMENT_ID = "00000000-0000-4000-8000-000000000003";
const REVISION_ID = "00000000-0000-4000-8000-000000000004";
const RFI_ID = "00000000-0000-4000-8000-000000000005";
const SUBMITTAL_ID = "00000000-0000-4000-8000-000000000006";
const ROUND_ID = "00000000-0000-4000-8000-000000000007";
const SITE_LOG_ID = "00000000-0000-4000-8000-000000000008";
const INVOICE_ID = "00000000-0000-4000-8000-000000000009";
const TRANSACTION_ID = "00000000-0000-4000-8000-000000000010";
const PAYROLL_RUN_ID = "00000000-0000-4000-8000-000000000011";

const ROUTE_ROUND_TRIPS: readonly WorkflowRouteRoundTripContract[] = [
  roundTrip(
    "route-platform-companies",
    "platform company selection and management tab",
    () => appPathForPlatformCompanies(COMPANY_ID, "ai"),
    `/platform/companies?companyId=${COMPANY_ID}&tab=ai`,
    (path) => expectedLocation(path, "platform-companies", null, { companyId: COMPANY_ID, tab: "ai" }),
  ),
  roundTrip(
    "route-project-documents",
    "project document and revision selection",
    () => appPathForProject(PROJECT_ID, "documents", { docId: DOCUMENT_ID, revId: REVISION_ID }),
    `/projects/${PROJECT_ID}/documents?docId=${DOCUMENT_ID}&revId=${REVISION_ID}`,
    (path) => expectedLocation(path, "project", "projects", { projectId: PROJECT_ID, view: "documents", documentId: DOCUMENT_ID, revisionId: REVISION_ID }),
  ),
  roundTrip(
    "route-rfi-detail",
    "project RFI detail selection",
    () => appPathForProject(PROJECT_ID, "rfis", { rfiId: RFI_ID }),
    `/projects/${PROJECT_ID}/rfis?rfiId=${RFI_ID}`,
    (path) => expectedLocation(path, "project", "projects", { projectId: PROJECT_ID, view: "rfis", rfiId: RFI_ID }),
  ),
  roundTrip(
    "route-submittal-detail",
    "project submittal and formal round selection",
    () => appPathForProject(PROJECT_ID, "submittals", { submittalId: SUBMITTAL_ID, roundId: ROUND_ID }),
    `/projects/${PROJECT_ID}/submittals?submittalId=${SUBMITTAL_ID}&roundId=${ROUND_ID}`,
    (path) => expectedLocation(path, "project", "projects", { projectId: PROJECT_ID, view: "submittals", submittalId: SUBMITTAL_ID, roundId: ROUND_ID }),
  ),
  roundTrip(
    "route-site-log-detail",
    "project Daily Site Log detail selection",
    () => appPathForProject(PROJECT_ID, "site-logs", { siteLogId: SITE_LOG_ID }),
    `/projects/${PROJECT_ID}/site-logs?siteLogId=${SITE_LOG_ID}`,
    (path) => expectedLocation(path, "project", "projects", { projectId: PROJECT_ID, view: "site-logs", siteLogId: SITE_LOG_ID }),
  ),
  roundTrip(
    "route-invoice-detail",
    "invoice detail with safe return path",
    () => appPathForInvoice(INVOICE_ID, `/projects/${PROJECT_ID}/invoices`),
    `/invoices/${INVOICE_ID}?from=%2Fprojects%2F${PROJECT_ID}%2Finvoices`,
    (path) => expectedLocation(path, "invoice", "invoices", { invoiceId: INVOICE_ID, returnTo: `/projects/${PROJECT_ID}/invoices` }),
  ),
  roundTrip(
    "route-review-invoice",
    "invoice review queue selection",
    () => appPathForReviewInvoice(INVOICE_ID, "/inbox"),
    `/review?invoiceId=${INVOICE_ID}&from=%2Finbox`,
    (path) => expectedLocation(path, "review-invoice", "review", { invoiceId: INVOICE_ID, returnTo: "/inbox" }),
  ),
  roundTrip(
    "route-cash",
    "Cash & Banking transaction context",
    () => appPathForCashTransaction(TRANSACTION_ID, "INVOICE", INVOICE_ID),
    `/cash?transactionId=${TRANSACTION_ID}&fromTargetType=INVOICE&fromTargetId=${INVOICE_ID}`,
    (path) => expectedLocation(path, "tab", "cash", { transactionId: TRANSACTION_ID, fromTargetType: "INVOICE", fromTargetId: INVOICE_ID }),
  ),
  roundTrip(
    "route-payroll-run",
    "payroll run selection",
    () => appPathForPayrollRun(PAYROLL_RUN_ID, "/cash"),
    `/payroll?runId=${PAYROLL_RUN_ID}&from=%2Fcash`,
    (path) => expectedLocation(path, "tab", "payroll", { runId: PAYROLL_RUN_ID, returnTo: "/cash" }),
  ),
];

export const WORKFLOW_MAP_CONSISTENCY_CONTRACTS: WorkflowMapConsistencyContracts = {
  routeContracts: [
    ...APP_ROUTE_CONTRACTS,
    ...DEMO_ROUTE_CONTRACTS,
  ],
  routeAdapter: WORKFLOW_ROUTE_CONTRACT_IDS,
  lifecycleContracts: [
    { graphNodeId: "rfi-lifecycle", statuses: RFI_STATUSES, transitions: RFI_TRANSITIONS, stateNodePrefix: "rfi-state-" },
    { graphNodeId: "submittal-lifecycle", statuses: SUBMITTAL_STATUSES, transitions: SUBMITTAL_TRANSITIONS, stateNodePrefix: "submittal-state-" },
    { graphNodeId: "site-log-lifecycle", statuses: DAILY_SITE_LOG_STATUSES, transitions: DAILY_LOG_TRANSITIONS, stateNodePrefix: "site-log-state-" },
    { graphNodeId: "payroll-lifecycle", statuses: PAYROLL_RUN_STATUSES, transitions: PAYROLL_RUN_TRANSITIONS, stateNodePrefix: "payroll-state-" },
  ],
  settlementStatusContracts: [
    { graphNodeId: "cash-settlement-lifecycle", requiredStatuses: SETTLEMENT_RECORD_STATUSES },
  ],
  permissionKeys: ALL_PERMISSION_KEYS,
  activeFeatureRouteIds: [...new Set(ENGORYX_FEATURE_REGISTRY.filter((feature) => feature.status === "ACTIVE").flatMap((feature) => feature.routeId ? [feature.routeId] : []))],
  featureRouteNodeIds: ["route-dashboard", "route-cash", "route-projects", "route-invoices", "route-expenses", "route-payroll", "route-reports"],
  assistant: {
    tools: ASSISTANT_TOOL_DEFINITIONS.map(({ name, riskTier, requiresConfirmation }) => ({ name, riskTier, requiresConfirmation })),
    confirmationRequiredByRiskTier: CONFIRMATION_REQUIRED,
    preparedActionStatuses: ASSISTANT_PREPARED_ACTION_STATUSES,
  },
  demo: {
    modeForPath: applicationModeForPath,
    isDemoPath: isDemoApplicationPath,
    checks: [
      { label: "public demo landing", pathname: DEMO_ROOT_PATH, expectedMode: "demo" },
      { label: "demo payroll workspace", pathname: `${DEMO_APP_ROOT_PATH}/payroll`, expectedMode: "demo" },
      { label: "production dashboard", pathname: "/dashboard", expectedMode: "production" },
      { label: "workflow-map developer surface", pathname: "/workflow-map", expectedMode: "workflow-map" },
    ],
  },
  qaScenarios: DEMO_QA_SCENARIOS.map((scenario) => ({ id: scenario.id, route: scenario.route, path: scenario.path, hasAction: Boolean(scenario.action) })),
  requiredCoverageNodeIds: [
    "platform-entry",
    "route-project-workspace",
    "route-rfi-detail",
    "route-submittal-detail",
    "route-site-log-detail",
    "route-cash",
    "route-payroll-run",
    "rfi-lifecycle",
    "submittal-lifecycle",
    "site-log-lifecycle",
    "cash-settlement-lifecycle",
    "payroll-lifecycle",
    "assistant-prepared-action",
    "assistant-guarded-execution",
  ],
  requiredCoverageInvariantIds: [
    "demo-cannot-write-production",
    "invoice-project-cost-independent-from-settlement",
    "payroll-labor-cost-independent-from-net-pay-settlement",
    "approved-payroll-history-is-immutable",
    "formal-engineering-history-is-preserved",
    "settlement-reversal-is-additive-history",
    "assistant-mutations-require-confirmation",
  ],
  requiredDiagramIds: ["overview", "projects-engineering", "invoice-cash-settlement", "workforce-payroll", "assistant-guarded-mutations"],
  routeRoundTrips: ROUTE_ROUND_TRIPS,
};
