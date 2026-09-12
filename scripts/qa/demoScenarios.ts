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
  const changeStatus = await page.getByRole("button", { name: "Change Status", exact: true }).count();
  const expenseLink = await page.getByRole("link", { name: /Open\/Correct linked Expense/ }).count();
  const correctionLink = await page.getByRole("button", { name: /Review correction options/ }).count();
  if (changeStatus === 1) {
    await page.getByRole("button", { name: "Change Status", exact: true }).click();
    await waitForVisible(page, '[data-testid="supplier-payment-dialog"]');
  }
  const paymentDialog = await page.locator('[data-testid="supplier-payment-dialog"]').count();
  const paidOption = await page.getByRole("button", { name: "Paid", exact: true }).count();
  const partialOption = await page.getByRole("button", { name: "Partially Paid", exact: true }).count();
  const confirmPayment = await page.getByRole("button", { name: /Confirm Payment/ }).count();
  const addAccount = await page.getByRole("button", { name: /Add Cash\/Bank Account/ }).count();
  return [
    { id: "supplier-payment-change-status-visible", passed: changeStatus === 1, details: `Change Status controls: ${changeStatus}` },
    { id: "supplier-payment-dialog-visible", passed: paymentDialog === 1, details: `supplier payment dialogs: ${paymentDialog}` },
    { id: "supplier-payment-status-options-visible", passed: paidOption === 1 && partialOption === 1, details: `Paid/Partially Paid controls: ${paidOption}/${partialOption}` },
    { id: "supplier-payment-confirm-visible", passed: confirmPayment === 1, details: `Confirm Payment controls: ${confirmPayment}` },
    { id: "supplier-payment-inline-account-visible", passed: addAccount === 1, details: `Add Cash/Bank Account controls: ${addAccount}` },
    { id: "supplier-expense-secondary-correction-link-visible", passed: expenseLink === 1, details: `linked Expense correction links: ${expenseLink}` },
    { id: "supplier-invoice-correction-continuation-visible", passed: correctionLink > 0, details: `correction continuation controls: ${correctionLink}` },
  ] satisfies readonly QaAssertion[];
};

const verifySupplierInvoiceNavigation: QaScenarioAction = async (page) => {
  const moduleButton = await page.getByRole("button", { name: /Supplier Invoices/ }).count();
  const childRouteBefore = await page.getByRole("button", { name: /Supplier documents/ }).count();
  if (moduleButton === 1 && childRouteBefore === 0) await page.getByRole("button", { name: /Supplier Invoices/ }).click();
  await waitForHeading(page, "Supplier source documents");
  const register = await page.getByRole("heading", { name: "Supplier source documents", exact: true }).count();
  const childRoute = await page.getByRole("button", { name: /Supplier documents/ }).count();
  return [
    { id: "supplier-invoice-module-visible", passed: moduleButton === 1, details: `Supplier Invoices module controls: ${moduleButton}` },
    { id: "supplier-invoice-register-visible", passed: register === 1, details: `Supplier invoice register headings: ${register}` },
    { id: "supplier-invoice-child-route-visible", passed: childRoute === 1, details: `Supplier documents child routes: ${childRoute}` },
  ] satisfies readonly QaAssertion[];
};

const verifyStaleSupplierInvoiceRecovery: QaScenarioAction = async (page) => {
  const title = await page.getByRole("heading", { name: "Supplier invoice unavailable", exact: true }).count();
  const action = await page.getByRole("button", { name: "Return to Supplier Invoices", exact: true }).count();
  if (action === 1) {
    await page.getByRole("button", { name: "Return to Supplier Invoices", exact: true }).click();
    await waitForHeading(page, "Supplier source documents");
  }
  const recovered = await page.getByRole("heading", { name: "Supplier source documents", exact: true }).count();
  return [
    { id: "stale-supplier-invoice-recovery-visible", passed: title === 1, details: `recovery headings: ${title}` },
    { id: "stale-supplier-invoice-recovery-action-visible", passed: action === 1, details: `recovery actions: ${action}` },
    { id: "stale-supplier-invoice-recovered-to-register", passed: recovered === 1, details: `recovered register headings: ${recovered}` },
  ] satisfies readonly QaAssertion[];
};

const verifyExpensePaymentSurface: QaScenarioAction = async (page) => {
  await waitForVisible(page, '[data-testid="expense-detail-panel"]');
  const panel = await page.locator('[data-testid="expense-detail-panel"]').count();
  const recordPayment = await page.getByRole("link", { name: /Record Payment/ }).count();
  const supplierInvoice = await page.getByRole("link", { name: /View Supplier Invoice/ }).count();
  return [
    { id: "expense-detail-visible", passed: panel === 1, details: `Expense detail panels: ${panel}` },
    { id: "expense-payment-cta-visible", passed: recordPayment === 1, details: `Record Payment links: ${recordPayment}` },
    { id: "expense-source-invoice-link-visible", passed: supplierInvoice === 1, details: `supplier invoice source links: ${supplierInvoice}` },
  ] satisfies readonly QaAssertion[];
};

const verifyCashExpenseTarget: QaScenarioAction = async (page) => {
  await waitForVisible(page, '[data-testid="cash-target-context"]');
  const context = await page.locator('[data-testid="cash-target-context"]').count();
  const requested = await page.locator("text=Requested target").count();
  const returnToExpense = await page.getByRole("link", { name: /Return to Expense/ }).count();
  if (returnToExpense === 1) {
    await page.getByRole("link", { name: /Return to Expense/ }).click();
    await waitForVisible(page, '[data-testid="expense-detail-panel"]');
  }
  const returnedExpense = await page.locator('[data-testid="expense-detail-panel"]').count();
  return [
    { id: "cash-expense-target-context-visible", passed: context === 1, details: `cash target contexts: ${context}` },
    { id: "cash-expense-target-prioritized", passed: requested >= 1, details: `requested-target badges: ${requested}` },
    { id: "cash-expense-return-link-visible", passed: returnToExpense === 1, details: `Expense return links: ${returnToExpense}` },
    { id: "cash-expense-returned-to-exact-expense", passed: returnedExpense === 1, details: `returned Expense panels: ${returnedExpense}` },
  ] satisfies readonly QaAssertion[];
};

const verifyClientReceivableLifecycle: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Client Invoices & Collections");
  await waitForVisible(page, '[data-testid="client-invoice-collection-position"]');
  const position = await page.locator('[data-testid="client-invoice-collection-position"]').count();
  const recordCollection = await page.getByRole("button", { name: /Record Collection/ }).count();
  const collectionHistory = await page.locator('[data-testid="client-invoice-collection-history"]').count();

  await page.getByRole("button", { name: /Record Collection/ }).first().click();
  await waitForHeading(page, "Record client collection draft");
  const exactBillingContext = await page.locator('[data-testid="client-collection-target-context"]').count();
  await page.getByRole("button", { name: "Cancel", exact: true }).first().click();
  await page.getByRole("button", { name: /^Client Invoices \(/ }).first().click();
  await waitForVisible(page, '[data-testid="client-invoice-collection-history"]');
  await page.getByRole("button", { name: /Open collection/ }).first().click();
  await waitForVisible(page, '[data-testid="continue-client-collection-to-cash"]');
  const continueToCash = await page.locator('[data-testid="continue-client-collection-to-cash"]').count();
  await page.locator('[data-testid="continue-client-collection-to-cash"]').first().click();
  await waitForVisible(page, '[data-testid="cash-target-context"]');
  const cashTargetContext = await page.locator('[data-testid="cash-target-context"]').count();
  const requestedTarget = await page.locator("text=Requested target").count();
  const cashReturn = await page.locator('[data-testid="cash-return-to-client-invoice"]').count();

  const requestedAllocation = page.locator('article:has-text("COL-MEC-24-017-002") button:has-text("Allocate")').first();
  await requestedAllocation.click();
  await page.getByRole("button", { name: "Confirm settlement", exact: true }).click();
  await waitForVisible(page, '[data-testid="cash-return-to-client-invoice"]');
  await page.locator('[data-testid="cash-return-to-client-invoice"]').first().click();
  await waitForVisible(page, '[data-testid="client-invoice-collection-position"]');
  const returnedPosition = await page.locator('[data-testid="client-invoice-collection-position"]').count();
  const returnedHistory = await page.locator('[data-testid="client-invoice-collection-history"]').count();
  return [
    { id: "client-invoice-collection-position-visible", passed: position === 1, details: `invoice collection position panels: ${position}` } satisfies QaAssertion,
    { id: "client-invoice-record-collection-visible", passed: recordCollection === 1, details: `contextual Record Collection CTAs: ${recordCollection}` } satisfies QaAssertion,
    { id: "client-invoice-collection-history-visible", passed: collectionHistory === 1, details: `invoice collection history panels: ${collectionHistory}` } satisfies QaAssertion,
    { id: "client-collection-exact-billing-context-visible", passed: exactBillingContext === 1, details: `exact billing contexts in collection editor: ${exactBillingContext}` } satisfies QaAssertion,
    { id: "client-collection-cash-continuation-visible", passed: continueToCash === 1, details: `Cash continuation CTAs: ${continueToCash}` } satisfies QaAssertion,
    { id: "client-collection-cash-target-context-visible", passed: cashTargetContext === 1, details: `CLIENT_COLLECTION cash target contexts: ${cashTargetContext}` } satisfies QaAssertion,
    { id: "client-collection-cash-target-prioritized", passed: requestedTarget >= 1, details: `requested-target badges: ${requestedTarget}` } satisfies QaAssertion,
    { id: "client-collection-cash-return-visible", passed: cashReturn === 1, details: `client-invoice return links: ${cashReturn}` } satisfies QaAssertion,
    { id: "client-collection-returned-to-invoice", passed: returnedPosition === 1 && returnedHistory === 1, details: `returned invoice position/history panels: ${returnedPosition}/${returnedHistory}` } satisfies QaAssertion,
  ] satisfies readonly QaAssertion[];
};

const verifyPurchaseOrderDocumentDeliverySurface: QaScenarioAction = async (page) => {
  const preview = page.getByRole("button", { name: "Preview", exact: true }).first();
  const previewCount = await page.getByRole("button", { name: "Preview", exact: true }).count();
  if (previewCount > 0) await preview.click();
  await waitForVisible(page, '[data-document-delivery-history]');
  const documentPreview = await page.locator("#document-preview-title").count();
  const deliveryHistory = await page.locator('[data-document-delivery-history]').count();
  const fallbackPdf = await page.getByRole("button", { name: "Generate / Download PDF", exact: true }).count();
  const companyTemplatePdf = await page.getByRole("button", { name: "Company-template PDF", exact: true }).count();
  const sendButton = await page.getByRole("button", { name: /Send by Email|Resend by Email|Try send again/ }).count();
  const disconnectedHistory = await page.locator("text=Connect the authenticated workspace to load immutable delivery history.").count();
  return [
    { id: "po-document-preview-visible", passed: documentPreview === 1, details: `Purchase Order preview headings: ${documentPreview}` },
    { id: "po-delivery-history-surface-visible", passed: deliveryHistory === 1, details: `delivery history surfaces: ${deliveryHistory}` },
    { id: "po-programmatic-pdf-fallback-control-visible", passed: fallbackPdf === 1, details: `programmatic PDF controls: ${fallbackPdf}` },
    { id: "po-company-template-pdf-control-visible", passed: companyTemplatePdf === 1, details: `company-template PDF controls: ${companyTemplatePdf}` },
    { id: "po-email-send-control-visible", passed: sendButton === 1, details: `email send controls: ${sendButton}` },
    { id: "po-demo-history-disconnected-state-visible", passed: disconnectedHistory === 1, details: `disconnected delivery-history notices: ${disconnectedHistory}` },
  ] satisfies readonly QaAssertion[];
};

const verifyClientInvoiceDocumentDeliverySurface: QaScenarioAction = async (page) => {
  const preview = page.getByRole("button", { name: "Preview / generate Client Invoice", exact: true }).first();
  const previewCount = await page.getByRole("button", { name: "Preview / generate Client Invoice", exact: true }).count();
  if (previewCount > 0) await preview.click();
  await waitForVisible(page, '[data-document-delivery-history]');
  const documentPreview = await page.locator("#document-preview-title").count();
  const deliveryHistory = await page.locator('[data-document-delivery-history]').count();
  const fallbackPdf = await page.getByRole("button", { name: "Generate / Download PDF", exact: true }).count();
  const companyTemplatePdf = await page.getByRole("button", { name: "Company-template PDF", exact: true }).count();
  const sendButton = await page.getByRole("button", { name: /Send by Email|Resend by Email|Try send again/ }).count();
  const disconnectedHistory = await page.locator("text=Connect the authenticated workspace to load immutable delivery history.").count();
  return [
    { id: "client-invoice-document-preview-visible", passed: documentPreview === 1, details: `Client Invoice preview headings: ${documentPreview}` },
    { id: "client-invoice-delivery-history-surface-visible", passed: deliveryHistory === 1, details: `delivery history surfaces: ${deliveryHistory}` },
    { id: "client-invoice-programmatic-pdf-fallback-control-visible", passed: fallbackPdf === 1, details: `programmatic PDF controls: ${fallbackPdf}` },
    { id: "client-invoice-company-template-pdf-control-visible", passed: companyTemplatePdf === 1, details: `company-template PDF controls: ${companyTemplatePdf}` },
    { id: "client-invoice-email-send-control-visible", passed: sendButton === 1, details: `email send controls: ${sendButton}` },
    { id: "client-invoice-demo-history-disconnected-state-visible", passed: disconnectedHistory === 1, details: `disconnected delivery-history notices: ${disconnectedHistory}` },
  ] satisfies readonly QaAssertion[];
};

const verifyEmailSmsWorkspace: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Email / SMS");
  const workspace = await page.locator('[data-email-sms-workspace]').count();
  const tabs = await page.locator('[data-email-sms-tabs] button').count();
  const intake = await page.getByRole("heading", { name: "Inbox / Intake", exact: true }).count();
  const connect = await page.getByRole("heading", { name: "Connect Gmail", exact: true }).count();
  return [
    { id: "email-sms-workspace-visible", passed: workspace === 1, details: `Email / SMS workspace surfaces: ${workspace}` },
    { id: "email-sms-section-tabs-visible", passed: tabs === 4, details: `Email / SMS section tabs: ${tabs}` },
    { id: "email-sms-intake-preserved", passed: intake === 1, details: `Inbox / Intake headings: ${intake}` },
    { id: "email-sms-gmail-disconnected-state-visible", passed: connect > 0, details: `Gmail connection controls: ${connect}` },
  ] satisfies readonly QaAssertion[];
};

const verifyEmailComposeWorkspace: QaScenarioAction = async (page) => {
  await waitForVisible(page, '[data-email-compose]');
  const compose = await page.locator('[data-email-compose]').count();
  const to = await page.getByRole("textbox", { name: "To" }).count();
  const subject = await page.getByRole("textbox", { name: "Subject" }).count();
  const body = await page.getByRole("textbox", { name: "Message" }).count();
  const review = await page.getByRole("button", { name: "Preview / Review", exact: true }).count();
  const send = await page.getByRole("button", { name: "Confirm & Send", exact: true }).count();
  return [
    { id: "email-compose-visible", passed: compose === 1, details: `compose panels: ${compose}` },
    { id: "email-compose-fields-visible", passed: to === 1 && subject === 1 && body === 1, details: `To/Subject/Message fields: ${to}/${subject}/${body}` },
    { id: "email-compose-review-visible", passed: review === 1, details: `review controls: ${review}` },
    { id: "email-compose-confirm-visible", passed: send === 1, details: `confirm controls: ${send}` },
  ] satisfies readonly QaAssertion[];
};

const verifyDocumentsWorkspace: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Documents");
  const workspace = await page.locator('[data-documents-workspace]').count();
  const entries = await page.locator('[data-document-register-entry]').count();
  const ownerLinks = await page.getByRole("button", { name: "Open owning record", exact: true }).count();
  const templateLink = await page.getByRole("button", { name: "Document templates", exact: true }).count();
  return [
    { id: "documents-workspace-visible", passed: workspace === 1, details: `Documents workspace surfaces: ${workspace}` },
    { id: "documents-register-populated", passed: entries > 0, details: `document register entries: ${entries}` },
    { id: "documents-owner-navigation-visible", passed: ownerLinks > 0, details: `owner navigation controls: ${ownerLinks}` },
    { id: "documents-template-management-link-visible", passed: templateLink === 1, details: `template management controls: ${templateLink}` },
  ] satisfies readonly QaAssertion[];
};

const verifyDocumentsToEmailHandoff: QaScenarioAction = async (page) => {
  const send = page.getByRole("button", { name: "Send", exact: true }).first();
  const sendCount = await page.getByRole("button", { name: "Send", exact: true }).count();
  if (sendCount > 0) await send.click();
  await waitForVisible(page, '[data-email-compose]');
  const compose = await page.locator('[data-email-compose]').count();
  const selected = page.url();
  return [
    { id: "documents-to-email-compose-handoff", passed: compose === 1, details: `compose panels after handoff: ${compose}` },
    { id: "documents-to-email-exact-selection", passed: (selected.includes("documentType=PURCHASE_ORDER") || selected.includes("documentType=CLIENT_INVOICE")) && selected.includes("documentId="), details: `handoff URL: ${selected}` },
  ] satisfies readonly QaAssertion[];
};

const verifySmsNotConfigured: QaScenarioAction = async (page) => {
  await waitForHeading(page, "SMS setup");
  const status = await page.locator('[data-sms-provider-status="NOT_CONFIGURED"]').count();
  const notConfigured = await page.locator("text=SMS · Not configured").count();
  return [
    { id: "sms-not-configured-visible", passed: status === 1 && notConfigured === 1, details: `SMS not-configured panels/text: ${status}/${notConfigured}` },
  ] satisfies readonly QaAssertion[];
};

const verifySmsComposeWorkspace: QaScenarioAction = async (page) => {
  await waitForHeading(page, "New SMS");
  const compose = await page.locator('[data-sms-compose]').count();
  const recipient = await page.locator('[data-sms-compose] input[type="tel"]').count();
  const message = await page.locator('[data-sms-compose] textarea').count();
  const review = await page.getByRole("button", { name: "Preview / Review", exact: true }).count();
  if (recipient === 1 && message === 1) {
    await page.locator('[data-sms-compose] input[type="tel"]').fill("09171234567");
    await page.locator('[data-sms-compose] textarea').fill("Synthetic SMS draft prepared for review only.");
    if (review === 1) await page.getByRole("button", { name: "Preview / Review", exact: true }).click();
  }
  const reviewSurface = await page.locator('[data-sms-compose-review="true"]').count();
  const confirm = await page.getByRole("button", { name: "Confirm & Send SMS", exact: true }).count();
  return [
    { id: "sms-compose-visible", passed: compose === 1, details: `SMS compose panels: ${compose}` },
    { id: "sms-compose-fields-visible", passed: recipient === 1 && message === 1, details: `recipient/message fields: ${recipient}/${message}` },
    { id: "sms-compose-review-visible", passed: reviewSurface === 1, details: `SMS review surfaces: ${reviewSurface}` },
    { id: "sms-compose-confirm-visible", passed: confirm === 1, details: `SMS confirm controls: ${confirm}` },
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
const verifyGmailInboxScreen = assertHeading(/Inbox \/ Intake|Email intake|Gmail inbox/, "gmail-inbox-visible");
const verifyVendorsScreen = assertHeading("Vendors", "vendor-directory-visible");

const verifyWarehouseInventoryScreen: QaScenarioAction = async (page) => {
  const headingCount = await page.getByRole("heading", { name: "Warehouse Inventory", exact: true }).count();
  const itemCount = await page.locator('[data-domain="warehouse-inventory"] [data-inventory-item]').count();
  const movementTruthCount = await page.locator("text=Movement-derived stock truth").count();
  await page.getByRole("button", { name: "History", exact: true }).first().click();
  await waitForVisible(page, '[role="dialog"]');
  const historyDialogCount = await page.getByRole("dialog", { name: /Ready-mix concrete 28 MPa/ }).count();
  const movementHistoryCount = await page.locator("text=Opening physical count").count();
  const sourceLink = page.getByRole("link", { name: /Procurement receipt REC-24-0015/ }).first();
  const sourceLinkCount = await page.getByRole("link", { name: /Procurement receipt REC-24-0015/ }).count();
  if (sourceLinkCount === 1) {
    await sourceLink.click();
    await waitForHeading(page, "Procurement & Purchase Orders");
  } else {
    await page.getByRole("button", { name: "Close dialog", exact: true }).first().click();
  }
  const finalPath = page.url();
  return [
    { id: "warehouse-heading-visible", passed: headingCount === 1, details: `warehouse headings: ${headingCount}` },
    { id: "warehouse-items-visible", passed: itemCount > 0, details: `warehouse item rows: ${itemCount}` },
    { id: "warehouse-movement-truth-visible", passed: movementTruthCount === 1, details: `movement truth banners: ${movementTruthCount}` },
    { id: "warehouse-history-dialog-visible", passed: historyDialogCount === 1, details: `item history dialogs: ${historyDialogCount}` },
    { id: "warehouse-history-movement-visible", passed: movementHistoryCount > 0, details: `opening movement rows: ${movementHistoryCount}` },
    { id: "warehouse-authoritative-source-link-visible", passed: sourceLinkCount === 1, details: `Procurement source links: ${sourceLinkCount}` },
    { id: "warehouse-authoritative-source-link-opens-procurement", passed: sourceLinkCount === 1 && finalPath.includes("/procurement?poId=demo-po-wh-002&receiptId=demo-po-rec-wh-01"), details: `final source path: ${finalPath}` },
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

const verifySubcontractMobileSettlementWorkflow: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: /^Subcontracts/ }).first().click();
  await page.locator("text=Total Subcontracts").first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const claimsButton = page.getByRole("button", { name: /Claims \(/ }).first();
  await claimsButton.click();
  await page.getByRole("heading", { name: /Subcontract Claims:/ }).waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const responsiveCards = await page.locator('[aria-label="Responsive subcontract claim cards"]').count();
  const inspectClaim = page.getByRole("button", { name: /Inspect claim|Edit claim/ }).first();
  await inspectClaim.click();
  await page.locator("text=Net Certified Payable").first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const paymentEvidence = await page.locator("text=Payment / settlement").count();
  const netPayable = await page.locator("text=Net Certified Payable").count();
  const recordPayment = await page.getByRole("link", { name: /Record Payment/ }).count();
  return [
    { id: "subcontract-mobile-claim-cards-visible", passed: responsiveCards === 1, details: `responsive claim card regions: ${responsiveCards}` },
    { id: "subcontract-net-payable-visible", passed: netPayable > 0, details: `net certified payable labels: ${netPayable}` },
    { id: "subcontract-settlement-evidence-visible", passed: paymentEvidence > 0, details: `settlement evidence panels: ${paymentEvidence}` },
    { id: "subcontract-record-payment-visible", passed: recordPayment > 0, details: `Record Payment links: ${recordPayment}` },
  ] satisfies readonly QaAssertion[];
};

const verifySettingsScreen: QaScenarioAction = async (page) => {
  const settingsHeading = await page.getByRole("heading", { name: "Operational settings", exact: true }).count();
  const regionalPreferences = await page.getByRole("heading", { name: "Regional display preferences", exact: true }).count();
  const roadmapHeading = await page.getByRole("heading", { name: "Hydroqualisense Features & Roadmap", exact: true }).count();
  const plannedWorkerRegistration = await page.locator('[data-product-feature-id="worker-registration"][data-product-feature-status="PLANNED"]').count();
  const futureFaceAttendance = await page.locator('[data-product-feature-id="face-recognition-attendance"][data-product-feature-status="FUTURE_DESIGN"]').count();
  const internalFeatureRegistry = await page.locator('[aria-label="Internal feature registry"]').count();
  const templatePdfCapability = await page.locator('[data-document-pdf-capability="unavailable"]').count();
  return [
    { id: "settings-heading-visible", passed: settingsHeading === 1, details: `settings headings: ${settingsHeading}` },
    { id: "regional-preferences-visible", passed: regionalPreferences === 1, details: `regional preference headings: ${regionalPreferences}` },
    { id: "client-roadmap-visible", passed: roadmapHeading === 1, details: `client roadmap headings: ${roadmapHeading}` },
    { id: "planned-worker-registration-visible", passed: plannedWorkerRegistration === 1, details: `Worker Registration cards: ${plannedWorkerRegistration}` },
    { id: "future-face-attendance-visible", passed: futureFaceAttendance === 1, details: `Future / Design Stage cards: ${futureFaceAttendance}` },
    { id: "internal-feature-registry-hidden", passed: internalFeatureRegistry === 0, details: `internal feature registry panels: ${internalFeatureRegistry}` },
    { id: "template-pdf-capability-truthful", passed: templatePdfCapability === 1, details: `template PDF unavailable states: ${templatePdfCapability}` },
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
  defineQaScenario({ feature: "procurement", route: route("procurement", "/procurement"), path: "/demo/app/procurement", interactionState: "subcontract claim settlement workflow verified", viewport: QA_VIEWPORTS.mobile, action: verifySubcontractMobileSettlementWorkflow }),
  defineQaScenario({ feature: "document-delivery", route: route("procurement", "/procurement"), path: "/demo/app/procurement", interactionState: "Purchase Order delivery preview and disconnected history verified", viewport: QA_VIEWPORTS.desktop, action: verifyPurchaseOrderDocumentDeliverySurface }),
  defineQaScenario({ feature: "document-delivery", route: route("procurement", "/procurement"), path: "/demo/app/procurement", interactionState: "Purchase Order delivery preview and disconnected history verified", viewport: QA_VIEWPORTS.mobile, action: verifyPurchaseOrderDocumentDeliverySurface }),
  defineQaScenario({ feature: "warehouse-inventory", route: route("warehouse", "/warehouse"), path: "/demo/app/warehouse", interactionState: "warehouse ledger rendered", viewport: QA_VIEWPORTS.desktop, action: verifyWarehouseInventoryScreen }),
  defineQaScenario({ feature: "warehouse-inventory", route: route("warehouse", "/warehouse"), path: "/demo/app/warehouse", interactionState: "warehouse source continuation verified", viewport: QA_VIEWPORTS.mobile, action: verifyWarehouseInventoryScreen }),
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
  defineQaScenario({ feature: "documents", route: route("documents", "/documents"), path: "/demo/app/documents", interactionState: "unified document register rendered", viewport: QA_VIEWPORTS.desktop, action: verifyDocumentsWorkspace }),
  defineQaScenario({ feature: "documents", route: route("documents", "/documents"), path: "/demo/app/documents", interactionState: "unified document register rendered", viewport: QA_VIEWPORTS.tablet, action: verifyDocumentsWorkspace }),
  defineQaScenario({ feature: "documents", route: route("documents", "/documents"), path: "/demo/app/documents", interactionState: "unified document register rendered", viewport: QA_VIEWPORTS.mobile, action: verifyDocumentsWorkspace }),
  defineQaScenario({ feature: "documents", route: route("documents", "/documents"), path: "/demo/app/documents", interactionState: "exact document handoff to Email / SMS compose", viewport: QA_VIEWPORTS.desktop, action: verifyDocumentsToEmailHandoff }),
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
  defineQaScenario({ feature: "email-sms", route: route("inbox", "/email-sms"), path: "/demo/app/email-sms", interactionState: "Email / SMS workspace rendered with disconnected Gmail", viewport: QA_VIEWPORTS.desktop, action: verifyEmailSmsWorkspace }),
  defineQaScenario({ feature: "email-sms", route: route("inbox", "/email-sms"), path: "/demo/app/email-sms", interactionState: "Email / SMS workspace rendered with disconnected Gmail", viewport: QA_VIEWPORTS.tablet, action: verifyEmailSmsWorkspace }),
  defineQaScenario({ feature: "email-sms", route: route("inbox", "/email-sms"), path: "/demo/app/email-sms", interactionState: "Email / SMS workspace rendered with disconnected Gmail", viewport: QA_VIEWPORTS.mobile, action: verifyEmailSmsWorkspace }),
  defineQaScenario({ feature: "email-sms", route: route("inbox", "/email-sms"), path: "/demo/app/email-sms?view=compose", interactionState: "Email compose review surface rendered", viewport: QA_VIEWPORTS.desktop, action: verifyEmailComposeWorkspace }),
  defineQaScenario({ feature: "email-sms", route: route("inbox", "/email-sms"), path: "/demo/app/email-sms?view=compose", interactionState: "Email compose review surface rendered", viewport: QA_VIEWPORTS.mobile, action: verifyEmailComposeWorkspace }),
  defineQaScenario({ feature: "email-sms", route: route("inbox", "/email-sms"), path: "/demo/app/email-sms?view=compose&channel=sms", interactionState: "SMS compose review surface rendered", viewport: QA_VIEWPORTS.desktop, action: verifySmsComposeWorkspace }),
  defineQaScenario({ feature: "email-sms", route: route("inbox", "/email-sms"), path: "/demo/app/email-sms?view=compose&channel=sms", interactionState: "SMS compose review surface rendered", viewport: QA_VIEWPORTS.mobile, action: verifySmsComposeWorkspace }),
  defineQaScenario({ feature: "email-sms", route: route("inbox", "/email-sms"), path: "/demo/app/email-sms?view=sent", interactionState: "sent delivery history surface rendered", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "email-sms", route: route("inbox", "/email-sms"), path: "/demo/app/email-sms?view=sms", interactionState: "SMS not-configured surface rendered", viewport: QA_VIEWPORTS.desktop, action: verifySmsNotConfigured }),
  defineQaScenario({ feature: "email-sms", route: route("inbox", "/email-sms"), path: "/demo/app/email-sms?view=sms", interactionState: "SMS not-configured surface rendered", viewport: QA_VIEWPORTS.mobile, action: verifySmsNotConfigured }),
  defineQaScenario({ feature: "gmail-inbox", route: route("inbox", "/email-sms"), path: "/demo/app/email-intake", interactionState: "legacy Email Intake path opens the communications workspace", viewport: QA_VIEWPORTS.desktop, action: verifyGmailInboxScreen }),
  defineQaScenario({ feature: "invoices", route: route("invoices", "/invoices"), path: "/demo/app/invoices", interactionState: "supplier invoice navigation and register verified", viewport: QA_VIEWPORTS.desktop, action: verifySupplierInvoiceNavigation }),
  defineQaScenario({ feature: "invoices", route: route("invoice-detail", "/invoices/:invoiceId"), path: "/demo/app/invoices/demo-invoice-01", interactionState: "invoice detail opened", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "supplier-payables", route: route("invoice-detail", "/invoices/:invoiceId"), path: "/demo/app/invoices/demo-invoice-02", interactionState: "inline supplier payment modal opened", viewport: QA_VIEWPORTS.desktop, action: verifySupplierPayableBridge }),
  defineQaScenario({ feature: "supplier-payables", route: route("invoice-detail", "/invoices/:invoiceId"), path: "/demo/app/invoices/demo-invoice-02", interactionState: "inline supplier payment modal opened", viewport: QA_VIEWPORTS.mobile, action: verifySupplierPayableBridge }),
  defineQaScenario({ feature: "invoices", route: route("review", "/review?invoiceId=:invoiceId"), path: "/demo/app/review?invoiceId=demo-invoice-07", interactionState: "invoice review opened", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "vendors", route: route("vendors", "/vendors"), path: "/demo/app/vendors", interactionState: "vendor directory rendered", viewport: QA_VIEWPORTS.desktop, action: verifyVendorsScreen }),
  defineQaScenario({ feature: "payroll", route: route("payroll", "/payroll"), path: "/demo/app/payroll", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "payroll", route: route("payroll-run", "/payroll?runId=:runId"), path: "/demo/app/payroll?runId=demo-payroll-run-9", interactionState: "payroll run opened", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "expenses", route: route("expenses", "/expenses"), path: "/demo/app/expenses", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "supplier-payables", route: route("expenses", "/expenses?expenseId=:expenseId"), path: "/demo/app/expenses?expenseId=demo-expense-supplier-bm-02", interactionState: "authoritative Expense payment surface opened", viewport: QA_VIEWPORTS.desktop, action: verifyExpensePaymentSurface }),
  defineQaScenario({ feature: "supplier-payables", route: route("expenses", "/expenses?expenseId=:expenseId"), path: "/demo/app/expenses?expenseId=demo-expense-supplier-bm-02", interactionState: "authoritative Expense payment surface opened", viewport: QA_VIEWPORTS.mobile, action: verifyExpensePaymentSurface }),
  defineQaScenario({ feature: "supplier-payables", route: route("invoice-detail", "/invoices/:invoiceId"), path: "/demo/app/invoices/demo-missing-invoice", interactionState: "stale supplier invoice recovery verified", viewport: QA_VIEWPORTS.desktop, action: verifyStaleSupplierInvoiceRecovery }),
  defineQaScenario({ feature: "supplier-payables", route: route("cash", "/cash?fromTargetType=:fromTargetType&fromTargetId=:fromTargetId&returnTo=:returnTo"), path: "/demo/app/cash?fromTargetType=EXPENSE&fromTargetId=demo-expense-supplier-bm-02&returnTo=%2Fexpenses%3FexpenseId%3Ddemo-expense-supplier-bm-02", interactionState: "Cash Expense target and return context opened", viewport: QA_VIEWPORTS.desktop, action: verifyCashExpenseTarget }),
  defineQaScenario({ feature: "supplier-payables", route: route("cash", "/cash?fromTargetType=:fromTargetType&fromTargetId=:fromTargetId&returnTo=:returnTo"), path: "/demo/app/cash?fromTargetType=EXPENSE&fromTargetId=demo-expense-supplier-bm-02&returnTo=%2Fexpenses%3FexpenseId%3Ddemo-expense-supplier-bm-02", interactionState: "Cash Expense target and return context opened", viewport: QA_VIEWPORTS.mobile, action: verifyCashExpenseTarget }),
  defineQaScenario({ feature: "client-receivables", route: route("project-billing", "/projects/:projectId/billing?billingId=:billingId"), path: "/demo/app/projects/demo-project-warehouse/billing?billingId=demo-client-billing-warehouse-02", interactionState: "client invoice collection lifecycle verified", viewport: QA_VIEWPORTS.desktop, action: verifyClientReceivableLifecycle }),
  defineQaScenario({ feature: "client-receivables", route: route("project-billing", "/projects/:projectId/billing?billingId=:billingId"), path: "/demo/app/projects/demo-project-warehouse/billing?billingId=demo-client-billing-warehouse-02", interactionState: "client invoice collection lifecycle verified", viewport: QA_VIEWPORTS.mobile, action: verifyClientReceivableLifecycle }),
  defineQaScenario({ feature: "document-delivery", route: route("project-billing", "/projects/:projectId/billing?billingId=:billingId"), path: "/demo/app/projects/demo-project-warehouse/billing?billingId=demo-client-billing-warehouse-02", interactionState: "Client Invoice delivery preview and disconnected history verified", viewport: QA_VIEWPORTS.desktop, action: verifyClientInvoiceDocumentDeliverySurface }),
  defineQaScenario({ feature: "document-delivery", route: route("project-billing", "/projects/:projectId/billing?billingId=:billingId"), path: "/demo/app/projects/demo-project-warehouse/billing?billingId=demo-client-billing-warehouse-02", interactionState: "Client Invoice delivery preview and disconnected history verified", viewport: QA_VIEWPORTS.mobile, action: verifyClientInvoiceDocumentDeliverySurface }),
  defineQaScenario({ feature: "reports", route: route("reports", "/reports"), path: "/demo/app/reports", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "settings", route: route("settings", "/settings"), path: "/demo/app/settings", interactionState: "settings product surface verified", viewport: QA_VIEWPORTS.desktop, action: verifySettingsScreen }),
  defineQaScenario({ feature: "assistant", route: route("assistant", "/assistant"), path: "/demo/app/assistant", interactionState: "base route loaded", viewport: QA_VIEWPORTS.desktop }),
  defineQaScenario({ feature: "demo", route: route("demo-tour", "/demo/app/dashboard"), path: "/demo/app/dashboard", interactionState: "demo tour opened", viewport: QA_VIEWPORTS.desktop, action: openDemoTour }),
];
