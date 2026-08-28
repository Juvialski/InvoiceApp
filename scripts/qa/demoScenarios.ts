import {
  defineQaScenario,
  QA_VIEWPORTS,
  type QaAssertion,
  type QaScenarioAction,
  type QaScenarioDefinition,
} from "./structuredEvidence.ts";

const PROJECT_ROOT = "/demo/app/projects/demo-project-warehouse";

const openProjectFromDirectory: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: "Open Quezon City Warehouse Expansion", exact: true }).first().click();
  await page.waitForTimeout(350);
  const count = await page.getByRole("heading", { name: "Quezon City Warehouse Expansion", exact: true }).count();
  return [{ id: "project-workspace-visible", passed: count === 1, details: `matching project headings: ${count}` } satisfies QaAssertion];
};

const openDemoDrawingPreview: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: "Open original demo drawing", exact: true }).first().click();
  await page.waitForTimeout(350);
  const count = await page.locator('[aria-label="Demo drawing preview"]').count();
  return [{ id: "blueprint-viewer-visible", passed: count === 1, details: `demo drawing preview panels: ${count}` } satisfies QaAssertion];
};

const openDemoTour: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: "Demo Tour", exact: true }).first().click();
  await page.waitForTimeout(350);
  const count = await page.locator('[aria-label="Engoryx Demo Tour"]').count();
  return [{ id: "demo-tour-visible", passed: count === 1, details: `tour panels: ${count}` } satisfies QaAssertion];
};

const openMobileNavigation: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await page.waitForTimeout(350);
  const count = await page.locator('button[aria-label="Close navigation"]').count();
  return [{ id: "mobile-navigation-visible", passed: count > 0, details: `close-navigation controls: ${count}` } satisfies QaAssertion];
};

function assertHeading(name: string, assertionId: string): QaScenarioAction {
  return async (page) => {
    const count = await page.getByRole("heading", { name, exact: true }).count();
    return [{ id: assertionId, passed: count > 0, details: `matching headings: ${count}` } satisfies QaAssertion];
  };
}

const verifyExtractorScreen = assertHeading("Extract invoice documents", "invoice-extractor-visible");
const verifyGmailInboxScreen = assertHeading("Gmail inbox", "gmail-inbox-visible");
const verifyVendorsScreen = assertHeading("Vendors", "vendor-directory-visible");

const verifyFeatureStatusRoadmap: QaScenarioAction = async (page) => {
  const panelCount = await page.locator('[aria-label="Product feature status"]').count();
  const comingSoonCount = await page.locator('text=Coming soon').count();
  const futureRoadmapCount = await page.locator('text=Future roadmap').count();
  return [
    { id: "feature-status-panel-visible", passed: panelCount === 1, details: `feature status panels: ${panelCount}` },
    { id: "planned-features-marked-coming-soon", passed: comingSoonCount > 0, details: `Coming soon labels: ${comingSoonCount}` },
    { id: "future-features-marked-roadmap", passed: futureRoadmapCount > 0, details: `Future roadmap labels: ${futureRoadmapCount}` },
  ] satisfies readonly QaAssertion[];
};

function route(id: string, canonicalPath: string) {
  return { id, canonicalPath } as const;
}

export const DEMO_QA_SCENARIOS: readonly QaScenarioDefinition[] = [
  defineQaScenario({ feature: "demo", route: route("landing", "/demo"), path: "/demo", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "dashboard", route: route("dashboard", "/dashboard"), path: "/demo/app/dashboard", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "dashboard", route: route("dashboard", "/dashboard"), path: "/demo/app/dashboard", interactionState: "base route loaded", viewport: QA_VIEWPORTS.laptop }),
  defineQaScenario({ feature: "dashboard", route: route("dashboard", "/dashboard"), path: "/demo/app/dashboard", interactionState: "mobile navigation opened", viewport: QA_VIEWPORTS.mobile, action: openMobileNavigation }),
  defineQaScenario({ feature: "projects", route: route("projects", "/projects"), path: "/demo/app/projects", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "project-workspace", route: route("project-overview", "/projects/:projectId"), path: "/demo/app/projects", interactionState: "project selected", viewport: QA_VIEWPORTS.desktop, action: openProjectFromDirectory }),
  defineQaScenario({ feature: "project-workspace", route: route("project-overview", "/projects/:projectId"), path: PROJECT_ROOT, interactionState: "base route loaded", viewport: QA_VIEWPORTS.tablet }),
  defineQaScenario({ feature: "project-workspace", route: route("project-documents", "/projects/:projectId/documents"), path: `${PROJECT_ROOT}/documents`, interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "project-workspace", route: route("project-documents", "/projects/:projectId/documents"), path: `${PROJECT_ROOT}/documents`, interactionState: "base route loaded", viewport: QA_VIEWPORTS.mobile }),
  defineQaScenario({ feature: "engineering-documents", route: route("blueprint-viewer", "/projects/:projectId/documents"), path: `${PROJECT_ROOT}/documents`, interactionState: "demo drawing preview opened", viewport: QA_VIEWPORTS.desktop, action: openDemoDrawingPreview }),
  defineQaScenario({ feature: "engineering-documents", route: route("engineering-documents", "/documents"), path: "/demo/app/documents", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "rfis", route: route("rfis", "/projects/:projectId/rfis"), path: `${PROJECT_ROOT}/rfis`, interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "rfis", route: route("rfi-detail", "/projects/:projectId/rfis?rfiId=:rfiId"), path: `${PROJECT_ROOT}/rfis?rfiId=demo-rfi-wh-001`, interactionState: "RFI detail opened", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "submittals", route: route("submittals", "/projects/:projectId/submittals"), path: `${PROJECT_ROOT}/submittals`, interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "submittals", route: route("submittal-detail", "/projects/:projectId/submittals?submittalId=:submittalId&roundId=:roundId"), path: `${PROJECT_ROOT}/submittals?submittalId=demo-sub-wh-014&roundId=demo-round-wh-014-2`, interactionState: "Submittal detail and round opened", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "site-logs", route: route("site-logs", "/projects/:projectId/site-logs"), path: `${PROJECT_ROOT}/site-logs`, interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "site-logs", route: route("site-log-detail", "/projects/:projectId/site-logs?siteLogId=:siteLogId"), path: `${PROJECT_ROOT}/site-logs?siteLogId=demo-site-log-wh-concrete`, interactionState: "Site Log detail opened", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "site-logs", route: route("site-logs", "/projects/:projectId/site-logs"), path: `${PROJECT_ROOT}/site-logs`, interactionState: "base route loaded", viewport: QA_VIEWPORTS.tablet }),
  defineQaScenario({ feature: "site-logs", route: route("site-logs", "/projects/:projectId/site-logs"), path: `${PROJECT_ROOT}/site-logs`, interactionState: "base route loaded", viewport: QA_VIEWPORTS.mobile }),
  defineQaScenario({ feature: "cash-banking", route: route("cash", "/cash"), path: "/demo/app/cash", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "cash-banking", route: route("cash-settlement", "/cash?transactionId=:transactionId"), path: "/demo/app/cash?transactionId=demo-transaction-split-01", interactionState: "cash settlement workspace opened", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "cash-banking", route: route("cash", "/cash"), path: "/demo/app/cash", interactionState: "base route loaded", viewport: QA_VIEWPORTS.tablet }),
  defineQaScenario({ feature: "invoice-extraction", route: route("extract", "/extract"), path: "/demo/app/extract", interactionState: "extractor screen rendered", viewport: QA_VIEWPORTS.desktop, action: verifyExtractorScreen }),
  defineQaScenario({ feature: "gmail-inbox", route: route("inbox", "/inbox"), path: "/demo/app/inbox", interactionState: "Gmail screen rendered in disconnected demo state", viewport: QA_VIEWPORTS.desktop, action: verifyGmailInboxScreen }),
  defineQaScenario({ feature: "invoices", route: route("invoices", "/invoices"), path: "/demo/app/invoices", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "invoices", route: route("invoice-detail", "/invoices/:invoiceId"), path: "/demo/app/invoices/demo-invoice-01", interactionState: "invoice detail opened", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "invoices", route: route("review", "/review?invoiceId=:invoiceId"), path: "/demo/app/review?invoiceId=demo-invoice-07", interactionState: "invoice review opened", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "vendors", route: route("vendors", "/vendors"), path: "/demo/app/vendors", interactionState: "vendor directory rendered", viewport: QA_VIEWPORTS.desktop, action: verifyVendorsScreen }),
  defineQaScenario({ feature: "payroll", route: route("payroll", "/payroll"), path: "/demo/app/payroll", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "payroll", route: route("payroll-run", "/payroll?runId=:runId"), path: "/demo/app/payroll?runId=demo-payroll-run-9", interactionState: "payroll run opened", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "expenses", route: route("expenses", "/expenses"), path: "/demo/app/expenses", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "reports", route: route("reports", "/reports"), path: "/demo/app/reports", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "settings", route: route("settings", "/settings"), path: "/demo/app/settings", interactionState: "feature status verified", viewport: QA_VIEWPORTS.desktop, action: verifyFeatureStatusRoadmap }),
  defineQaScenario({ feature: "assistant", route: route("assistant", "/assistant"), path: "/demo/app/assistant", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "demo", route: route("demo-tour", "/demo/app/dashboard"), path: "/demo/app/dashboard", interactionState: "demo tour opened", viewport: QA_VIEWPORTS.desktop, action: openDemoTour }),
];
