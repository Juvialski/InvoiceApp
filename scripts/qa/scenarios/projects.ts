import type { QaAssertion, QaScenarioAction } from "../structuredEvidence.ts";
import { READY_TIMEOUT_MS, applyDarkTheme, applyLightTheme, applyThemePreferenceForVisualQa, verifyEntityMediaThumbnails, waitForHeading, waitForVisible } from "./shared.ts";

export const verifyPortfolioDashboard: QaScenarioAction = async (page) => {
  const headingCount = await page.getByRole("heading", { name: "Portfolio Management", exact: true }).count();
  const totalsCount = await page.locator('[aria-label="Portfolio Financial Totals"]').count();
  const remainingToBillCount = await page.locator('text=Remaining to Bill').count();
  return [
    { id: "portfolio-heading-visible", passed: headingCount === 1, details: `portfolio headings: ${headingCount}` },
    { id: "portfolio-financial-totals-visible", passed: totalsCount === 1, details: `portfolio total regions: ${totalsCount}` },
    { id: "portfolio-remaining-to-bill-visible", passed: remainingToBillCount > 0, details: `remaining-to-bill labels: ${remainingToBillCount}` },
  ] satisfies readonly QaAssertion[];
};
export const verifyPortfolioAttention: QaScenarioAction = async (page) => {
  const attentionCount = await page.locator("text=Needs attention").count();
  const criticalCount = await page.locator("text=Critical signals").count();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  const filter = page.getByRole("combobox", { name: "Filter by financial health and attention signals", exact: true }).first();
  await filter.selectOption("NEEDS_ATTENTION");
  const projectCards = page.locator('[aria-label="Projects list cards"] [data-project-id]');
  await projectCards.first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const flaggedProjects = await projectCards.count();
  await filter.selectOption("ALL");
  return [
    { id: "portfolio-attention-count-visible", passed: attentionCount > 0, details: `needs-attention labels: ${attentionCount}` } satisfies QaAssertion,
    { id: "portfolio-critical-count-visible", passed: criticalCount > 0, details: `critical-signal labels: ${criticalCount}` } satisfies QaAssertion,
    { id: "portfolio-needs-attention-filter-returns-projects", passed: flaggedProjects > 0, details: `flagged project card nodes: ${flaggedProjects}` } satisfies QaAssertion,
  ] satisfies readonly QaAssertion[];
};
const verifyProjectCardActionPopover: QaScenarioAction = async (page) => {
  const cardSelector = '[aria-label="Projects list cards"] [data-project-id]:has(summary[aria-label^="More actions for"])';
  const card = page.locator(cardSelector).first();
  await card.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const trigger = page.locator(`${cardSelector} summary[aria-label^="More actions for"]`).first();
  await trigger.click();
  const popover = page.locator(`${cardSelector} .hqs-popover`).first();
  await popover.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await page.evaluate(() => document.querySelector<HTMLElement>('[aria-label="Projects list cards"] [data-project-id] .hqs-popover')?.scrollIntoView({ block: "nearest", inline: "nearest" }));

  const layout = await page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('[aria-label="Projects list cards"] [data-project-id]');
    const popover = card?.querySelector<HTMLElement>(".hqs-popover");
    const lifecycleAction = popover?.querySelector<HTMLButtonElement>("button");
    if (!card || !popover || !lifecycleAction) return null;

    const cardRect = card.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const lifecycleRect = lifecycleAction.getBoundingClientRect();
    const lifecycleHit = document.elementFromPoint(lifecycleRect.left + lifecycleRect.width / 2, lifecycleRect.top + lifecycleRect.height / 2);
    const style = getComputedStyle(popover);
    return {
      card: { left: cardRect.left, right: cardRect.right, top: cardRect.top, bottom: cardRect.bottom, width: cardRect.width, height: cardRect.height },
      popover: { left: popoverRect.left, right: popoverRect.right, top: popoverRect.top, bottom: popoverRect.bottom, width: popoverRect.width, height: popoverRect.height },
      lifecycle: { left: lifecycleRect.left, right: lifecycleRect.right, top: lifecycleRect.top, bottom: lifecycleRect.bottom, width: lifecycleRect.width, height: lifecycleRect.height },
      cardOverflow: getComputedStyle(card).overflow,
      popoverVisible: popover.getClientRects().length > 0 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || 1) > 0,
      lifecycleHit: lifecycleHit === lifecycleAction || lifecycleAction.contains(lifecycleHit),
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: window.innerHeight,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
      popoverBottom: popoverRect.bottom,
      cardBottom: cardRect.bottom,
      lifecycleBottom: lifecycleRect.bottom,
    };
  });
  const lifecycleAction = page.locator(`${cardSelector} .hqs-popover button`).first();
  const lifecycleActionCount = await lifecycleAction.count();
  await lifecycleAction.click();
  const lifecycleDialog = page.locator('[role="dialog"][aria-labelledby="project-lifecycle-title"]');
  await lifecycleDialog.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const lifecycleDialogCount = await lifecycleDialog.count();

  const viewportTolerance = 2;
  const popoverWithinViewport = Boolean(layout && layout.popover.left >= -viewportTolerance && layout.popover.right <= layout.viewportWidth + viewportTolerance && layout.popover.top >= -viewportTolerance && layout.popover.bottom <= layout.viewportHeight + viewportTolerance);
  const lifecycleWithinViewport = Boolean(layout && layout.lifecycle.left >= -viewportTolerance && layout.lifecycle.right <= layout.viewportWidth + viewportTolerance && layout.lifecycle.top >= -viewportTolerance && layout.lifecycle.bottom <= layout.viewportHeight + viewportTolerance);
  const popoverExtendsBeyondCard = Boolean(layout && layout.popoverBottom > layout.cardBottom);
  return [
    { id: "project-card-more-trigger-opens-popover", passed: Boolean(layout?.popoverVisible), details: layout ? `popover ${Math.round(layout.popover.width)}×${Math.round(layout.popover.height)} at ${Math.round(layout.popover.left)},${Math.round(layout.popover.top)}` : "popover geometry missing" },
    { id: "project-card-popover-card-boundary-allows-reachability", passed: layout?.cardOverflow === "visible" && layout.lifecycleHit === true, details: `card overflow: ${layout?.cardOverflow || "missing"}; popover extends beyond card: ${popoverExtendsBeyondCard}; card bottom: ${layout ? Math.round(layout.cardBottom) : "missing"}; popover bottom: ${layout ? Math.round(layout.popoverBottom) : "missing"}` },
    { id: "project-card-popover-within-viewport", passed: popoverWithinViewport && lifecycleWithinViewport, details: layout ? `popover ${Math.round(layout.popover.left)},${Math.round(layout.popover.top)}–${Math.round(layout.popover.right)},${Math.round(layout.popover.bottom)}; lifecycle ${Math.round(layout.lifecycle.left)},${Math.round(layout.lifecycle.top)}–${Math.round(layout.lifecycle.right)},${Math.round(layout.lifecycle.bottom)} within ${layout.viewportWidth}×${layout.viewportHeight}` : "popover geometry missing" },
    { id: "project-card-lifecycle-action-hit-target-visible", passed: lifecycleActionCount === 1 && layout?.lifecycleHit === true, details: `lifecycle action count: ${lifecycleActionCount}; center hit target: ${layout?.lifecycleHit ?? false}` },
    { id: "project-card-popover-does-not-create-horizontal-overflow", passed: Boolean(layout && layout.documentWidth <= layout.viewportWidth + 2), details: layout ? `document width: ${layout.documentWidth}px; viewport: ${layout.viewportWidth}px` : "document geometry missing" },
    { id: "project-card-lifecycle-dialog-opens", passed: lifecycleDialogCount === 1, details: `lifecycle dialogs: ${lifecycleDialogCount}` },
  ] satisfies readonly QaAssertion[];
};
export function projectCardActionTheme(theme: "light" | "dark"): QaScenarioAction {
  return async (page) => {
    const themeAssertions = theme === "dark" ? await applyDarkTheme(page) : await applyLightTheme(page);
    const actionAssertions = await verifyProjectCardActionPopover(page);
    return [
      ...(Array.isArray(themeAssertions) ? themeAssertions : []),
      ...(Array.isArray(actionAssertions) ? actionAssertions : []),
    ];
  };
}
export const openProjectFromDirectory: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: /Quezon City Warehouse Expansion/ }).first().click();
  await waitForHeading(page, "Quezon City Warehouse Expansion");
  const count = await page.getByRole("heading", { name: "Quezon City Warehouse Expansion", exact: true }).count();
  return [{ id: "project-workspace-visible", passed: count === 1, details: `matching project headings: ${count}` } satisfies QaAssertion];
};
export const verifyProjectAttentionAndEngineering: QaScenarioAction = async (page) => {
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
export const verifyProjectFinancialControlDashboard: QaScenarioAction = async (page) => {
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
export const verifyPhpOnlyProjectControlState: QaScenarioAction = async (page) => {
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
export const verifyClientReceivableLifecycle: QaScenarioAction = async (page) => {
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
  const cashReturn = await page.locator('[data-testid="cash-return-to-client-invoice"]').count();

  const transactionSelect = page.locator('select[aria-label="Transaction to reconcile"]').first();
  await transactionSelect.selectOption("demo-transaction-client-collection-02");
  await waitForVisible(page, '[data-testid="cash-settlement-candidate"]');
  const requestedTarget = await page.locator("text=Requested target").count();
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
export const verifyClientBillingDraftWorksheet: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Client Invoices & Collections");
  await page.getByRole("button", { name: "Edit draft", exact: true }).first().click();
  await waitForVisible(page, '[data-testid="client-billing-draft-worksheet"]');
  const worksheet = await page.locator('[data-testid="client-billing-draft-worksheet"]').count();
  const editors = await page.locator('[data-testid="client-billing-draft-worksheet"] [data-worksheet-editor="true"]').count();
  const addRow = await page.locator('[data-testid="client-billing-draft-worksheet"] [data-worksheet-add-row="true"]').count();
  const protectedCells = await page.locator('[data-testid="client-billing-draft-worksheet"] [data-worksheet-protected="true"]').count();
  const save = await page.getByRole("button", { name: "Save draft", exact: true }).count();
  const submit = await page.getByRole("button", { name: "Submit", exact: true }).count();
  const issue = await page.getByRole("button", { name: "Issue Client Invoice", exact: true }).count();
  const collection = await page.getByRole("button", { name: "Record Collection", exact: true }).count();
  await page.getByRole("button", { name: "Cancel", exact: true }).first().click();
  return [
    { id: "client-billing-draft-worksheet-visible", passed: worksheet === 1, details: `Client Billing draft worksheet surfaces: ${worksheet}` },
    { id: "client-billing-draft-worksheet-editors-visible", passed: editors === 2, details: `Client Billing worksheet editors: ${editors}` },
    { id: "client-billing-draft-worksheet-add-row-visible", passed: addRow === 1, details: `Client Billing Add row controls: ${addRow}` },
    { id: "client-billing-draft-protected-cells-visible", passed: protectedCells > 0, details: `Client Billing protected cells: ${protectedCells}` },
    { id: "client-billing-draft-single-save-visible", passed: save === 1, details: `Client Billing Save draft controls: ${save}` },
    { id: "client-billing-draft-lifecycle-outside-worksheet", passed: submit === 0 && issue === 0, details: `worksheet lifecycle buttons: submit=${submit}, issue=${issue}` },
    { id: "client-billing-draft-collections-outside-worksheet", passed: collection === 0, details: `worksheet collection buttons: ${collection}` },
  ] satisfies readonly QaAssertion[];
};
export const verifyClientInvoiceDocumentDeliverySurface: QaScenarioAction = async (page) => {
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
export const verifyPortfolioAttentionDark: QaScenarioAction = async (page) => {
  const themeResult = await applyDarkTheme(page);
  const filterResult = await verifyPortfolioAttention(page);
  return [
    ...(Array.isArray(themeResult) ? themeResult : []),
    ...(Array.isArray(filterResult) ? filterResult : []),
  ];
};
export const verifyProjectMediaLight: QaScenarioAction = async (page) => [
  ...(await applyThemePreferenceForVisualQa(page, "light")),
  ...(await verifyEntityMediaThumbnails(page, "project")),
];
export const verifyProjectMediaDark: QaScenarioAction = async (page) => [
  ...(await applyThemePreferenceForVisualQa(page, "dark")),
  ...(await verifyEntityMediaThumbnails(page, "project")),
];
export const verifyProjectMediaControls: QaScenarioAction = async (page) => {
  const themeAssertions = await applyThemePreferenceForVisualQa(page, "dark");
  await page.getByRole("button", { name: "Edit project details", exact: true }).first().click();
  await page.locator('[data-entity-media-panel="true"]').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await page.getByRole("button", { name: "Replace", exact: true }).first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const panelCount = await page.locator('[data-entity-media-panel="true"]').count();
  const replaceCount = await page.getByRole("button", { name: "Replace", exact: true }).count();
  const removeCount = await page.getByRole("button", { name: "Remove", exact: true }).count();
  return [
    ...themeAssertions,
    { id: "project-image-panel-visible", passed: panelCount === 1, details: `project image panels: ${panelCount}` },
    { id: "project-image-replace-control-visible", passed: replaceCount === 1, details: `Replace controls: ${replaceCount}` },
    { id: "project-image-remove-control-visible", passed: removeCount === 1, details: `Remove controls: ${removeCount}` },
  ];
};
export const verifyProjectMaterialImage: QaScenarioAction = async (page) => {
  const themeAssertions = await applyThemePreferenceForVisualQa(page, "light");
  await page.getByRole("tab", { name: "Materials & Equipment", exact: true }).click();
  await waitForVisible(page, '[data-phase3b="materials-equipment"]');
  await page.locator('[data-entity-media-thumbnail="true"][data-entity-media-fallback="false"] img').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const media = await page.locator('[data-entity-media-thumbnail="true"][data-entity-media-fallback="false"] img').count();
  const materialName = await page.locator("text=110mm heavy-duty PVC conduit").count();
  const plannedQty = await page.locator("text=800 pcs").count();
  return [
    ...themeAssertions,
    { id: "linked-project-material-image-visible", passed: media > 0, details: `linked Warehouse image previews: ${media}` },
    { id: "project-material-identity-visible", passed: materialName > 0, details: `linked material labels: ${materialName}` },
    { id: "project-material-quantity-context-visible", passed: plannedQty > 0, details: `planned quantity context labels: ${plannedQty}` },
  ];
};

export const projectsScenarioActions: Readonly<Record<string, QaScenarioAction>> = {
  openProjectFromDirectory,
  verifyClientBillingDraftWorksheet,
  verifyClientInvoiceDocumentDeliverySurface,
  verifyClientReceivableLifecycle,
  verifyPhpOnlyProjectControlState,
  verifyPortfolioAttention,
  verifyPortfolioAttentionDark,
  verifyPortfolioDashboard,
  verifyProjectAttentionAndEngineering,
  verifyProjectFinancialControlDashboard,
  verifyProjectMaterialImage,
  verifyProjectMediaControls,
  verifyProjectMediaDark,
  verifyProjectMediaLight,
  "projectCardActionTheme:light": projectCardActionTheme("light"),
  "projectCardActionTheme:dark": projectCardActionTheme("dark"),
};
