import {
  defineQaScenario,
  QA_VIEWPORTS,
  type QaAssertion,
  type QaBrowserPage,
  type QaScenarioAction,
  type QaScenarioDefinition,
} from "./structuredEvidence.ts";

const PROJECT_ROOT = "/demo/app/projects/demo-project-warehouse";
const READY_TIMEOUT_MS = 30_000;

async function waitForVisible(page: QaBrowserPage, selector: string, timeout = READY_TIMEOUT_MS) {
  await page.locator(selector).first().waitFor({ state: "visible", timeout });
}

async function waitForHeading(page: QaBrowserPage, name: string | RegExp, timeout = READY_TIMEOUT_MS) {
  await page.getByRole("heading", typeof name === "string" ? { name, exact: true } : { name }).first().waitFor({ state: "visible", timeout });
}

const openProjectFromDirectory: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: /Quezon City Warehouse Expansion/ }).first().click();
  await waitForHeading(page, "Quezon City Warehouse Expansion");
  const count = await page.getByRole("heading", { name: "Quezon City Warehouse Expansion", exact: true }).count();
  return [{ id: "project-workspace-visible", passed: count === 1, details: `matching project headings: ${count}` } satisfies QaAssertion];
};

const verifyProjectFinancialControlDashboard: QaScenarioAction = async (page) => {
  const dashboardHeading = await page.getByRole("heading", { name: "Project Financial Control Dashboard", exact: true }).count();
  const costControlHeading = await page.getByRole("heading", { name: "Cost Control", exact: true }).count();
  const commercialControlHeading = await page.getByRole("heading", { name: "Commercial Control", exact: true }).count();
  const budgetControlCta = await page.getByRole("button", { name: /Open Budget Control Tab/ }).count();
  const financialMetrics = await page.locator("[data-financial-metric-status]").count();
  return [
    { id: "project-financial-control-heading-visible", passed: dashboardHeading === 1, details: `financial-control headings: ${dashboardHeading}` },
    { id: "project-cost-control-visible", passed: costControlHeading === 1, details: `cost-control headings: ${costControlHeading}` },
    { id: "project-commercial-control-visible", passed: commercialControlHeading === 1, details: `commercial-control headings: ${commercialControlHeading}` },
    { id: "project-budget-control-drilldown-visible", passed: budgetControlCta === 1, details: `budget-control CTAs: ${budgetControlCta}` },
    { id: "project-financial-metrics-visible", passed: financialMetrics >= 10, details: `financial metric cards: ${financialMetrics}` },
  ] satisfies readonly QaAssertion[];
};

const verifyPhpOnlyProjectControlState: QaScenarioAction = async (page) => {
  const mixedCurrencyCount = await page.locator("text=Mixed currencies present").count();
  const withheldChartCount = await page.locator("text=Complete budget position withheld while unconverted foreign-currency costs are present.").count();
  const partialMetricCount = await page.locator('[data-financial-metric-status="partial"]').count();
  const availableMetricCount = await page.locator('[data-financial-metric-status="available"]').count();
  return [
    { id: "php-only-mixed-currency-warning-absent", passed: mixedCurrencyCount === 0, details: `mixed-currency warnings: ${mixedCurrencyCount}` },
    { id: "php-only-budget-chart-not-withheld", passed: withheldChartCount === 0, details: `withheld budget chart messages: ${withheldChartCount}` },
    { id: "php-only-financial-metrics-not-partial", passed: partialMetricCount === 0, details: `partial financial metrics: ${partialMetricCount}` },
    { id: "php-only-financial-metrics-available", passed: availableMetricCount > 0, details: `available financial metrics: ${availableMetricCount}` },
  ] satisfies readonly QaAssertion[];
};

const openDemoDrawingPreview: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: "Open original demo drawing", exact: true }).first().click();
  await waitForVisible(page, '[aria-label="Demo drawing preview"]');
  const count = await page.locator('[aria-label="Demo drawing preview"]').count();
  return [{ id: "blueprint-viewer-visible", passed: count === 1, details: `demo drawing preview panels: ${count}` } satisfies QaAssertion];
};

const openDemoTour: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: "Demo Tour", exact: true }).first().click();
  await page.getByRole("dialog", { name: "Hydroqualisense Demo Tour", exact: true }).first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const count = await page.getByRole("dialog", { name: "Hydroqualisense Demo Tour", exact: true }).count();
  return [{ id: "demo-tour-visible", passed: count === 1, details: `tour panels: ${count}` } satisfies QaAssertion];
};

const verifySupplierPayableBridge: QaScenarioAction = async (page) => {
  await waitForVisible(page, '[data-testid="supplier-invoice-expense-bridge"]');
  const expenseLink = await page.getByRole("link", { name: /Open Expense/ }).count();
  const recordPayment = await page.getByRole("link", { name: /Record Payment/ }).count();
  return [
    { id: "supplier-expense-bridge-visible", passed: expenseLink === 1, details: `Open Expense links: ${expenseLink}` },
    { id: "supplier-expense-record-payment-visible", passed: recordPayment === 1, details: `Record Payment links: ${recordPayment}` },
  ] satisfies readonly QaAssertion[];
};

const verifyExpensePaymentSurface: QaScenarioAction = async (page) => {
  await waitForVisible(page, '[data-testid="expense-detail-panel"]');
  const panel = await page.locator('[data-testid="expense-detail-panel"]').count();
  const recordPayment = await page.getByRole("link", { name: /Record Payment/ }).count();
  return [
    { id: "expense-detail-visible", passed: panel === 1, details: `Expense detail panels: ${panel}` },
    { id: "expense-payment-cta-visible", passed: recordPayment === 1, details: `Record Payment links: ${recordPayment}` },
  ] satisfies readonly QaAssertion[];
};

const verifyCashExpenseTarget: QaScenarioAction = async (page) => {
  await waitForVisible(page, '[data-testid="cash-target-context"]');
  const context = await page.locator('[data-testid="cash-target-context"]').count();
  const requested = await page.locator("text=Requested target").count();
  return [
    { id: "cash-expense-target-context-visible", passed: context === 1, details: `cash target contexts: ${context}` },
    { id: "cash-expense-target-prioritized", passed: requested >= 1, details: `requested-target badges: ${requested}` },
  ] satisfies readonly QaAssertion[];
};

const openMobileNavigation: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: "Open navigation", exact: true }).click();
  await waitForVisible(page, 'button[aria-label="Close navigation"]');
  const count = await page.locator('button[aria-label="Close navigation"]').count();
  return [{ id: "mobile-navigation-visible", passed: count > 0, details: `close-navigation controls: ${count}` } satisfies QaAssertion];
};

function assertHeading(name: string | RegExp, assertionId: string): QaScenarioAction {
  return async (page) => {
    const count = await page.getByRole("heading", typeof name === "string" ? { name, exact: true } : { name }).count();
    return [{ id: assertionId, passed: count > 0, details: `matching headings: ${count}` } satisfies QaAssertion];
  };
}

const verifyExtractorScreen = assertHeading("Extract invoice documents", "invoice-extractor-visible");
const verifyGmailInboxScreen = assertHeading(/Email intake|Gmail inbox/, "gmail-inbox-visible");
const verifyVendorsScreen = assertHeading("Vendors", "vendor-directory-visible");

const verifyWarehouseInventoryScreen: QaScenarioAction = async (page) => {
  const headingCount = await page.getByRole("heading", { name: "Warehouse Inventory", exact: true }).count();
  const itemCount = await page.locator('[data-domain="warehouse-inventory"] [data-inventory-item]').count();
  const movementTruthCount = await page.locator("text=Movement-derived stock truth").count();
  await page.getByRole("button", { name: "History", exact: true }).first().click();
  await waitForVisible(page, '[role="dialog"]');
  const historyDialogCount = await page.getByRole("dialog", { name: /Ready-mix concrete 28 MPa/ }).count();
  const movementHistoryCount = await page.locator("text=Opening physical count").count();
  await page.getByRole("button", { name: "Close dialog", exact: true }).first().click();
  return [
    { id: "warehouse-heading-visible", passed: headingCount === 1, details: `warehouse headings: ${headingCount}` },
    { id: "warehouse-items-visible", passed: itemCount > 0, details: `warehouse item rows: ${itemCount}` },
    { id: "warehouse-movement-truth-visible", passed: movementTruthCount === 1, details: `movement truth banners: ${movementTruthCount}` },
    { id: "warehouse-history-dialog-visible", passed: historyDialogCount === 1, details: `item history dialogs: ${historyDialogCount}` },
    { id: "warehouse-history-movement-visible", passed: movementHistoryCount > 0, details: `opening movement rows: ${movementHistoryCount}` },
  ] satisfies readonly QaAssertion[];
};

const verifyEquipmentRegistryScreen: QaScenarioAction = async (page) => {
  const headingCount = await page.getByRole("heading", { name: "Equipment Registry", exact: true }).count();
  const registryCount = await page.locator('[data-domain="equipment-registry"]').count();
  const authorityCount = await page.locator("text=Assignment authority is separate from field evidence").count();
  const historyButtons = await page.getByRole("button", { name: "History", exact: true }).count();
  return [
    { id: "equipment-heading-visible", passed: headingCount === 1, details: `equipment headings: ${headingCount}` },
    { id: "equipment-registry-visible", passed: registryCount === 1, details: `equipment registry regions: ${registryCount}` },
    { id: "equipment-authority-boundary-visible", passed: authorityCount === 1, details: `authority banners: ${authorityCount}` },
    { id: "equipment-history-actions-visible", passed: historyButtons > 0, details: `history controls: ${historyButtons}` },
  ] satisfies readonly QaAssertion[];
};

const verifyPortfolioDashboard: QaScenarioAction = async (page) => {
  const headingCount = await page.getByRole("heading", { name: "Portfolio Management", exact: true }).count();
  const totalsCount = await page.locator('[aria-label="Portfolio Financial Totals"]').count();
  const remainingToBillCount = await page.locator('text=Remaining to Bill').count();
  return [
    { id: "portfolio-heading-visible", passed: headingCount === 1, details: `portfolio headings: ${headingCount}` },
    { id: "portfolio-financial-totals-visible", passed: totalsCount === 1, details: `portfolio total regions: ${totalsCount}` },
    { id: "portfolio-remaining-to-bill-visible", passed: remainingToBillCount > 0, details: `remaining-to-bill labels: ${remainingToBillCount}` },
  ] satisfies readonly QaAssertion[];
};

const verifyPortfolioAttention: QaScenarioAction = async (page) => {
  const attentionCount = await page.locator("text=Needs attention").count();
  const criticalCount = await page.locator("text=Critical signals").count();
  await page.locator('summary:has-text("More filters")').first().click();
  const filter = page.getByRole("combobox", { name: "Filter by financial health and attention signals", exact: true }).first();
  await filter.selectOption("NEEDS_ATTENTION");
  await page.locator("[data-project-id]").first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const flaggedProjects = await page.locator("[data-project-id]").count();
  await filter.selectOption("ALL");
  return [
    { id: "portfolio-attention-count-visible", passed: attentionCount > 0, details: `needs-attention labels: ${attentionCount}` } satisfies QaAssertion,
    { id: "portfolio-critical-count-visible", passed: criticalCount > 0, details: `critical-signal labels: ${criticalCount}` } satisfies QaAssertion,
    { id: "portfolio-needs-attention-filter-returns-projects", passed: flaggedProjects > 0, details: `flagged project result nodes: ${flaggedProjects}` } satisfies QaAssertion,
  ] satisfies readonly QaAssertion[];
};

const verifyProjectAttentionAndEngineering: QaScenarioAction = async (page) => {
  const managementAttention = await page.getByRole("heading", { name: "Management Attention", exact: true }).count();
  const engineeringSummary = await page.getByRole("heading", { name: "Engineering Coordination", exact: true }).count();
  const evidence = await page.locator("text=Evidence:").count();
  await page.locator('nav[aria-label="Project workspace sections"] button:has-text("Documents")').first().click();
  await waitForHeading(page, /Engineering Document Register/);
  const documentRegister = await page.getByRole("heading", { name: /Engineering Document Register/ }).count();
  await page.locator('nav[aria-label="Project workspace sections"] button:has-text("RFIs")').first().click();
  await waitForHeading(page, /Project RFIs|RFI Register/);
  const rfiRegister = await page.getByRole("heading", { name: /Project RFIs|RFI Register/ }).count();
  await page.locator('nav[aria-label="Project workspace sections"] button:has-text("Submittals")').first().click();
  await waitForHeading(page, /Technical Submittal Register|Submittals/);
  const submittalRegister = await page.getByRole("heading", { name: /Technical Submittal Register|Submittals/ }).count();
  await page.locator('nav[aria-label="Project workspace sections"] button:has-text("Site Logs")').first().click();
  await waitForHeading(page, /Daily Site Logs|Site Logs/);
  const siteLogRegister = await page.getByRole("heading", { name: /Daily Site Logs|Site Logs/ }).count();
  await page.locator('nav[aria-label="Project workspace sections"] button:has-text("Materials & Equipment")').first().click();
  await page.locator("text=Current warehouse on-hand").first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const projectWarehouseReadThrough = await page.locator("text=Current warehouse on-hand").count();
  return [
    { id: "project-management-attention-visible", passed: managementAttention === 1, details: `management-attention headings: ${managementAttention}` } satisfies QaAssertion,
    { id: "project-engineering-summary-visible", passed: engineeringSummary === 1, details: `engineering summaries: ${engineeringSummary}` } satisfies QaAssertion,
    { id: "project-signal-evidence-visible", passed: evidence > 0, details: `evidence labels: ${evidence}` } satisfies QaAssertion,
    { id: "project-documents-drilldown-visible", passed: documentRegister > 0, details: `document registers: ${documentRegister}` } satisfies QaAssertion,
    { id: "project-rfis-drilldown-visible", passed: rfiRegister > 0, details: `RFI registers: ${rfiRegister}` } satisfies QaAssertion,
    { id: "project-submittals-drilldown-visible", passed: submittalRegister > 0, details: `submittal registers: ${submittalRegister}` } satisfies QaAssertion,
    { id: "project-site-logs-drilldown-visible", passed: siteLogRegister > 0, details: `Site Log registers: ${siteLogRegister}` } satisfies QaAssertion,
    { id: "project-materials-warehouse-read-through-visible", passed: projectWarehouseReadThrough > 0, details: `project warehouse read-through labels: ${projectWarehouseReadThrough}` } satisfies QaAssertion,
  ] satisfies readonly QaAssertion[];
};

const verifyProcurementSubcontractParity: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: /^Subcontracts/ }).first().click();
  await page.locator("text=Total Subcontracts").first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const totalSubcontracts = await page.locator("text=Total Subcontracts").count();
  const claimsMetric = await page.locator("text=Approved progress claims").count();
  const variationsMetric = await page.locator("text=Variations").count();
  const rows = await page.locator("tbody tr").count();
  return [
    { id: "production-equivalent-subcontract-tab-visible", passed: totalSubcontracts > 0, details: `subcontract KPI labels: ${totalSubcontracts}` } satisfies QaAssertion,
    { id: "subcontract-claims-metric-visible", passed: claimsMetric > 0, details: `claim KPI labels: ${claimsMetric}` } satisfies QaAssertion,
    { id: "subcontract-variations-metric-visible", passed: variationsMetric > 0, details: `variation KPI labels: ${variationsMetric}` } satisfies QaAssertion,
    { id: "subcontract-records-not-dropped", passed: rows > 0, details: `subcontract row nodes: ${rows}` } satisfies QaAssertion,
  ] satisfies readonly QaAssertion[];
};

const verifySettingsScreen: QaScenarioAction = async (page) => {
  const settingsHeading = await page.getByRole("heading", { name: "Operational settings", exact: true }).count();
  const regionalPreferences = await page.getByRole("heading", { name: "Regional display preferences", exact: true }).count();
  const roadmapHeading = await page.getByRole("heading", { name: "Hydroqualisense Features & Roadmap", exact: true }).count();
  const plannedWorkerRegistration = await page.locator('[data-product-feature-id="worker-registration"][data-product-feature-status="PLANNED"]').count();
  const futureFaceAttendance = await page.locator('[data-product-feature-id="face-recognition-attendance"][data-product-feature-status="FUTURE_DESIGN"]').count();
  const internalFeatureRegistry = await page.locator('[aria-label="Internal feature registry"]').count();
  return [
    { id: "settings-heading-visible", passed: settingsHeading === 1, details: `settings headings: ${settingsHeading}` },
    { id: "regional-preferences-visible", passed: regionalPreferences === 1, details: `regional preference headings: ${regionalPreferences}` },
    { id: "client-roadmap-visible", passed: roadmapHeading === 1, details: `client roadmap headings: ${roadmapHeading}` },
    { id: "planned-worker-registration-visible", passed: plannedWorkerRegistration === 1, details: `Worker Registration cards: ${plannedWorkerRegistration}` },
    { id: "future-face-attendance-visible", passed: futureFaceAttendance === 1, details: `Future / Design Stage cards: ${futureFaceAttendance}` },
    { id: "internal-feature-registry-hidden", passed: internalFeatureRegistry === 0, details: `internal feature registry panels: ${internalFeatureRegistry}` },
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
  defineQaScenario({ feature: "projects", route: route("projects", "/projects"), path: "/demo/app/projects", interactionState: "portfolio dashboard verified", viewport: QA_VIEWPORTS.desktop, action: verifyPortfolioDashboard }),
  defineQaScenario({ feature: "projects", route: route("projects", "/projects"), path: "/demo/app/projects", interactionState: "attention filters verified", viewport: QA_VIEWPORTS.desktop, action: verifyPortfolioAttention }),
  defineQaScenario({ feature: "projects", route: route("projects", "/projects"), path: "/demo/app/projects", interactionState: "portfolio dashboard verified", viewport: QA_VIEWPORTS.laptop, action: verifyPortfolioDashboard }),
  defineQaScenario({ feature: "projects", route: route("projects", "/projects"), path: "/demo/app/projects", interactionState: "portfolio dashboard verified", viewport: QA_VIEWPORTS.tablet, action: verifyPortfolioDashboard }),
  defineQaScenario({ feature: "projects", route: route("projects", "/projects"), path: "/demo/app/projects", interactionState: "portfolio dashboard verified", viewport: QA_VIEWPORTS.mobile, action: verifyPortfolioDashboard }),
  defineQaScenario({ feature: "procurement", route: route("procurement", "/procurement"), path: "/demo/app/procurement", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "procurement", route: route("procurement", "/procurement"), path: "/demo/app/procurement", interactionState: "subcontract claim and variation parity verified", viewport: QA_VIEWPORTS.desktop, action: verifyProcurementSubcontractParity }),
  defineQaScenario({ feature: "warehouse-inventory", route: route("warehouse", "/warehouse"), path: "/demo/app/warehouse", interactionState: "warehouse ledger rendered", viewport: QA_VIEWPORTS.desktop, action: verifyWarehouseInventoryScreen }),
  defineQaScenario({ feature: "equipment-registry", route: route("equipment", "/equipment"), path: "/demo/app/equipment", interactionState: "Equipment Registry rendered", viewport: QA_VIEWPORTS.desktop, action: verifyEquipmentRegistryScreen }),
  defineQaScenario({ feature: "project-workspace", route: route("project-overview", "/projects/:projectId"), path: "/demo/app/projects", interactionState: "project selected", viewport: QA_VIEWPORTS.desktop, action: openProjectFromDirectory }),
  defineQaScenario({ feature: "project-workspace", route: route("project-overview", "/projects/:projectId"), path: PROJECT_ROOT, interactionState: "attention and engineering drilldowns verified", viewport: QA_VIEWPORTS.desktop, action: verifyProjectAttentionAndEngineering }),
  defineQaScenario({ feature: "project-financial-control", route: route("project-financial-control", "/projects/:projectId"), path: PROJECT_ROOT, interactionState: "financial control dashboard verified", viewport: QA_VIEWPORTS.desktop, action: verifyProjectFinancialControlDashboard }),
  defineQaScenario({ feature: "project-financial-control", route: route("project-financial-control", "/projects/:projectId"), path: PROJECT_ROOT, interactionState: "financial control dashboard verified", viewport: QA_VIEWPORTS.laptop, action: verifyProjectFinancialControlDashboard }),
  defineQaScenario({ feature: "project-financial-control", route: route("project-financial-control", "/projects/:projectId"), path: PROJECT_ROOT, interactionState: "financial control dashboard verified", viewport: QA_VIEWPORTS.tablet, action: verifyProjectFinancialControlDashboard }),
  defineQaScenario({ feature: "project-financial-control", route: route("project-financial-control", "/projects/:projectId"), path: PROJECT_ROOT, interactionState: "financial control dashboard verified", viewport: QA_VIEWPORTS.mobile, action: verifyProjectFinancialControlDashboard }),
  defineQaScenario({ feature: "project-financial-control", route: route("project-financial-control", "/projects/:projectId"), path: "/demo/app/projects/demo-project-solar", interactionState: "mixed-currency control state verified", viewport: QA_VIEWPORTS.desktop, action: verifyPhpOnlyProjectControlState }),
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
  defineQaScenario({ feature: "gmail-inbox", route: route("inbox", "/email-intake"), path: "/demo/app/inbox", interactionState: "Email Intake screen rendered in disconnected demo state", viewport: QA_VIEWPORTS.desktop, action: verifyGmailInboxScreen }),
  defineQaScenario({ feature: "invoices", route: route("invoices", "/invoices"), path: "/demo/app/invoices", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "invoices", route: route("invoice-detail", "/invoices/:invoiceId"), path: "/demo/app/invoices/demo-invoice-01", interactionState: "invoice detail opened", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "supplier-payables", route: route("invoice-detail", "/invoices/:invoiceId"), path: "/demo/app/invoices/demo-invoice-02", interactionState: "linked Expense payment surface opened", viewport: QA_VIEWPORTS.desktop, action: verifySupplierPayableBridge }),
  defineQaScenario({ feature: "supplier-payables", route: route("invoice-detail", "/invoices/:invoiceId"), path: "/demo/app/invoices/demo-invoice-02", interactionState: "linked Expense payment surface opened", viewport: QA_VIEWPORTS.mobile, action: verifySupplierPayableBridge }),
  defineQaScenario({ feature: "invoices", route: route("review", "/review?invoiceId=:invoiceId"), path: "/demo/app/review?invoiceId=demo-invoice-07", interactionState: "invoice review opened", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "vendors", route: route("vendors", "/vendors"), path: "/demo/app/vendors", interactionState: "vendor directory rendered", viewport: QA_VIEWPORTS.desktop, action: verifyVendorsScreen }),
  defineQaScenario({ feature: "payroll", route: route("payroll", "/payroll"), path: "/demo/app/payroll", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "payroll", route: route("payroll-run", "/payroll?runId=:runId"), path: "/demo/app/payroll?runId=demo-payroll-run-9", interactionState: "payroll run opened", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "expenses", route: route("expenses", "/expenses"), path: "/demo/app/expenses", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "supplier-payables", route: route("expenses", "/expenses?expenseId=:expenseId"), path: "/demo/app/expenses?expenseId=demo-expense-supplier-bm-02", interactionState: "authoritative Expense payment surface opened", viewport: QA_VIEWPORTS.desktop, action: verifyExpensePaymentSurface }),
  defineQaScenario({ feature: "supplier-payables", route: route("expenses", "/expenses?expenseId=:expenseId"), path: "/demo/app/expenses?expenseId=demo-expense-supplier-bm-02", interactionState: "authoritative Expense payment surface opened", viewport: QA_VIEWPORTS.mobile, action: verifyExpensePaymentSurface }),
  defineQaScenario({ feature: "supplier-payables", route: route("cash", "/cash?fromTargetType=:fromTargetType&fromTargetId=:fromTargetId"), path: "/demo/app/cash?fromTargetType=EXPENSE&fromTargetId=demo-expense-supplier-bm-02", interactionState: "Cash Expense target context opened", viewport: QA_VIEWPORTS.desktop, action: verifyCashExpenseTarget }),
  defineQaScenario({ feature: "supplier-payables", route: route("cash", "/cash?fromTargetType=:fromTargetType&fromTargetId=:fromTargetId"), path: "/demo/app/cash?fromTargetType=EXPENSE&fromTargetId=demo-expense-supplier-bm-02", interactionState: "Cash Expense target context opened", viewport: QA_VIEWPORTS.mobile, action: verifyCashExpenseTarget }),
  defineQaScenario({ feature: "reports", route: route("reports", "/reports"), path: "/demo/app/reports", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "settings", route: route("settings", "/settings"), path: "/demo/app/settings", interactionState: "settings product surface verified", viewport: QA_VIEWPORTS.desktop, action: verifySettingsScreen }),
  defineQaScenario({ feature: "assistant", route: route("assistant", "/assistant"), path: "/demo/app/assistant", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "demo", route: route("demo-tour", "/demo/app/dashboard"), path: "/demo/app/dashboard", interactionState: "demo tour opened", viewport: QA_VIEWPORTS.desktop, action: openDemoTour }),
];
