import type { QaAssertion, QaScenarioAction } from "../structuredEvidence.ts";
import { READY_TIMEOUT_MS, applyThemePreferenceForVisualQa, contrastRatio, waitForVisible } from "./shared.ts";

export const verifyProcurementDraftWorksheets: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: "Requests for Quotation (RFQs)" }).click();
  await page.getByRole("button", { name: "Issue", exact: true }).first().click();
  await waitForVisible(page, '[role="dialog"]');
  const issueDialogFocusEntered = await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
  const issueConfirmation = await page.getByRole("button", { name: "Confirm Issue", exact: true }).count();
  const issueSafety = await page.locator("text=Issuing does not select a supplier or create a Purchase Order.").count();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  const issueDialogFocusRestored = await page.evaluate(() => document.activeElement?.textContent?.trim() === "Issue");
  await page.getByRole("button", { name: "New RFQ", exact: true }).first().click();
  await waitForVisible(page, '[data-testid="rfq-draft-worksheet"]');
  const rfqDialogFocusEntered = await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
  const rfqWorksheet = await page.locator('[data-testid="rfq-draft-worksheet"]').count();
  const rfqEditors = await page.locator('[data-testid="rfq-draft-worksheet"] [data-worksheet-editor="true"]').count();
  const rfqAddRow = await page.locator('[data-testid="rfq-draft-worksheet"] [data-worksheet-add-row="true"]').count();
  await page.keyboard.press("Escape");
  const rfqDialogFocusRestored = await page.evaluate(() => document.activeElement?.textContent?.trim() === "New RFQ");

  await page.getByRole("button", { name: "Purchase Orders" }).click();
  await page.getByRole("button", { name: "New Purchase Order", exact: true }).first().click();
  await waitForVisible(page, '[data-testid="purchase-order-draft-worksheet"]');
  const poDialogFocusEntered = await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
  const poWorksheet = await page.locator('[data-testid="purchase-order-draft-worksheet"]').count();
  const poEditors = await page.locator('[data-testid="purchase-order-draft-worksheet"] [data-worksheet-editor="true"]').count();
  const poAddRow = await page.locator('[data-testid="purchase-order-draft-worksheet"] [data-worksheet-add-row="true"]').count();
  const protectedCells = await page.locator('[data-testid="purchase-order-draft-worksheet"] [data-worksheet-protected="true"]').count();
  await page.keyboard.press("Escape");
  const poDialogFocusRestored = await page.evaluate(() => document.activeElement?.textContent?.trim() === "New Purchase Order");
  await page.getByRole("button", { name: "New Purchase Order", exact: true }).first().click();
  await waitForVisible(page, '[data-testid="purchase-order-draft-worksheet"]');
  const approval = await page.getByRole("button", { name: "Approve PO", exact: true }).count();
  const saveBeforeApproval = await page.locator("text=Save this draft before approval becomes available.").count();
  const receiptWorkflow = await page.getByRole("button", { name: /Record Delivery \/ Receipt/ }).count();

  return [
    { id: "rfq-issue-confirmation-visible", passed: issueConfirmation === 1, details: `RFQ issue confirmation controls: ${issueConfirmation}` },
    { id: "rfq-issue-safety-boundary-visible", passed: issueSafety === 1, details: `RFQ issue safety notices: ${issueSafety}` },
    { id: "rfq-issue-dialog-focus-entered", passed: issueDialogFocusEntered, details: `RFQ issue dialog received focus: ${issueDialogFocusEntered}` },
    { id: "rfq-issue-dialog-focus-restored", passed: issueDialogFocusRestored, details: `RFQ issue opener focus restored: ${issueDialogFocusRestored}` },
    { id: "rfq-draft-worksheet-visible", passed: rfqWorksheet === 1, details: `RFQ worksheet surfaces: ${rfqWorksheet}` },
    { id: "rfq-draft-worksheet-editors-visible", passed: rfqEditors === 2, details: `RFQ worksheet editors: ${rfqEditors}` },
    { id: "rfq-draft-worksheet-add-row-visible", passed: rfqAddRow === 1, details: `RFQ Add row controls: ${rfqAddRow}` },
    { id: "rfq-dialog-focus-entered", passed: rfqDialogFocusEntered, details: `RFQ dialog received focus: ${rfqDialogFocusEntered}` },
    { id: "rfq-dialog-focus-restored", passed: rfqDialogFocusRestored, details: `RFQ opener focus restored: ${rfqDialogFocusRestored}` },
    { id: "po-draft-worksheet-visible", passed: poWorksheet === 1, details: `PO worksheet surfaces: ${poWorksheet}` },
    { id: "po-draft-worksheet-editors-visible", passed: poEditors === 2, details: `PO worksheet editors: ${poEditors}` },
    { id: "po-draft-worksheet-add-row-visible", passed: poAddRow === 1, details: `PO Add row controls: ${poAddRow}` },
    { id: "po-draft-protected-cells-visible", passed: protectedCells > 0, details: `PO protected cells: ${protectedCells}` },
    { id: "po-dialog-focus-entered", passed: poDialogFocusEntered, details: `PO dialog received focus: ${poDialogFocusEntered}` },
    { id: "po-dialog-focus-restored", passed: poDialogFocusRestored, details: `PO opener focus restored: ${poDialogFocusRestored}` },
    { id: "po-draft-approval-workflow-outside-worksheet", passed: approval === 0, details: `new PO approval controls: ${approval}` },
    { id: "po-draft-save-before-approval-visible", passed: saveBeforeApproval === 1, details: `save-before-approval notices: ${saveBeforeApproval}` },
    { id: "po-draft-receiving-workflow-not-on-draft", passed: receiptWorkflow === 0, details: `draft receiving controls: ${receiptWorkflow}` },
  ] satisfies readonly QaAssertion[];
};
export const verifyProcurementSubcontractParity: QaScenarioAction = async (page) => {
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
export const verifySubcontractMobileSettlementWorkflow: QaScenarioAction = async (page) => {
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
export const verifyPurchaseOrderDocumentDeliverySurface: QaScenarioAction = async (page) => {
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
export const verifyVendorsScreen: QaScenarioAction = async (page) => {
  const heading = await page.getByRole("heading", { name: "Vendors", exact: true }).count();
  const directory = await page.locator('[data-vendor-directory="true"]').count();
  const manage = await page.getByRole("button", { name: "Manage Vendors", exact: true }).count();
  const rows = await page.locator('[data-vendor-directory="true"] tbody tr').count();
  return [
    { id: "vendor-directory-visible", passed: heading === 1, details: `Vendor headings: ${heading}` },
    { id: "vendor-directory-browse-surface-visible", passed: directory === 1 && rows > 0, details: `directory surfaces: ${directory}; rows: ${rows}` },
    { id: "vendor-directory-maintenance-action-visible", passed: manage === 1, details: `Manage Vendors controls: ${manage}` },
  ] satisfies readonly QaAssertion[];
};
export const verifyVendorMasterWorksheet: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: "Manage Vendors", exact: true }).click();
  await page.locator('[data-testid="vendor-master-worksheet"]').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const editor = await page.locator('[data-worksheet-responsive-surface="vendor-master"] [data-worksheet-editor="true"]').count();
  const editableNames = await page.locator('[data-worksheet-responsive-surface="vendor-master"] [data-worksheet-cell$=":name"][data-worksheet-editable="true"]').count();
  const protectedState = await page.locator('[data-worksheet-responsive-surface="vendor-master"] [data-worksheet-cell$=":active"][data-worksheet-protected="true"]').count();
  const addRow = await page.locator('[data-worksheet-responsive-surface="vendor-master"] [data-worksheet-add-row="true"]').count();
  await page.getByRole("button", { name: "Add row", exact: true }).click();
  const stagedRows = await page.locator('[data-worksheet-responsive-surface="vendor-master"] [data-worksheet-row-key]').count();
  await page.getByRole("button", { name: "Save Vendors", exact: true }).click();
  await page.locator('[data-worksheet-responsive-surface="vendor-master"] [data-worksheet-state="error"]:visible').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const validationErrors = await page.locator('[data-worksheet-responsive-surface="vendor-master"] [data-worksheet-state="error"]').count();
  const mobileFallback = await page.locator('[data-worksheet-responsive-surface="vendor-master"] [data-worksheet-mobile-fallback="true"]').count();
  return [
    { id: "vendor-master-worksheet-visible", passed: editor === 1, details: `Vendor worksheet editors: ${editor}` },
    { id: "vendor-master-safe-name-editable", passed: editableNames > 0, details: `editable Vendor-name cells: ${editableNames}` },
    { id: "vendor-master-lifecycle-protected", passed: protectedState > 0, details: `protected Vendor state cells: ${protectedState}` },
    { id: "vendor-master-add-row-visible", passed: addRow === 1 && stagedRows > 1, details: `Add row controls: ${addRow}; staged rows: ${stagedRows}` },
    { id: "vendor-master-validation-visible", passed: validationErrors > 0, details: `validation error cells: ${validationErrors}` },
    { id: "vendor-master-mobile-fallback-visible", passed: mobileFallback === 1, details: `mobile fallbacks: ${mobileFallback}` },
  ] satisfies readonly QaAssertion[];
};
export const verifyR4eProcurementMetricContrast: QaScenarioAction = async (page) => {
  const themeAssertions = await applyThemePreferenceForVisualQa(page, "dark");
  const colors = await page.evaluate(() => {
    const card = Array.from(document.querySelectorAll<HTMLElement>('[data-app-shell-main="true"] .bg-gradient-to-br')).find((candidate) => candidate.innerText.toLowerCase().includes("active committed"));
    if (!card) return null;
    const label = card.querySelector<HTMLElement>(".text-indigo-700");
    const value = card.querySelector<HTMLElement>(".text-lg");
    const backgroundImage = getComputedStyle(card).backgroundImage;
    return {
      backgroundImage,
      stops: backgroundImage.match(/rgba?\([^)]*\)/g) || [],
      label: label ? getComputedStyle(label).color : "missing",
      value: value ? getComputedStyle(value).color : "missing",
    };
  });
  const labelContrast = colors?.stops.map((stop) => contrastRatio(colors.label, stop)) || [];
  const valueContrast = colors?.stops.map((stop) => contrastRatio(colors.value, stop)) || [];
  const minimumLabelContrast = labelContrast.length ? Math.min(...labelContrast) : 0;
  const minimumValueContrast = valueContrast.length ? Math.min(...valueContrast) : 0;
  return [...themeAssertions,
    { id: "r4e-procurement-active-committed-tile-present", passed: Boolean(colors && colors.stops.length >= 2), details: `gradient stops: ${colors?.backgroundImage || "missing"}` },
    { id: "r4e-procurement-active-committed-label-aa", passed: minimumLabelContrast >= 4.5, details: `minimum label contrast across gradient stops: ${minimumLabelContrast.toFixed(2)}:1` },
    { id: "r4e-procurement-active-committed-value-aa", passed: minimumValueContrast >= 4.5, details: `minimum value contrast across gradient stops: ${minimumValueContrast.toFixed(2)}:1` },
  ] satisfies readonly QaAssertion[];
};

export const procurementScenarioActions: Readonly<Record<string, QaScenarioAction>> = {
  verifyProcurementDraftWorksheets,
  verifyProcurementSubcontractParity,
  verifyPurchaseOrderDocumentDeliverySurface,
  verifyR4eProcurementMetricContrast,
  verifySubcontractMobileSettlementWorkflow,
  verifyVendorMasterWorksheet,
  verifyVendorsScreen,
};
