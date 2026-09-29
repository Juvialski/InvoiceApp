import type { QaAssertion, QaScenarioAction } from "../structuredEvidence.ts";
import { READY_TIMEOUT_MS, applyThemePreferenceForVisualQa, assertHeading, contrastRatio, waitForHeading, waitForVisible } from "./shared.ts";

export const verifyExtractorScreen = assertHeading("Extract invoice documents", "invoice-extractor-visible");
export const verifySupplierInvoiceNavigation: QaScenarioAction = async (page) => {
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
export const verifySupplierPayableBridge: QaScenarioAction = async (page) => {
  const expenseDisclosure = page.locator('[data-testid="supplier-invoice-expense-disclosure"]').first();
  await expenseDisclosure.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const expenseBridgeBeforeOpen = await page.locator('[data-testid="supplier-invoice-expense-bridge"]:visible').count();
  await page.locator('[data-testid="supplier-invoice-expense-disclosure"] summary').first().click();
  await waitForVisible(page, '[data-testid="supplier-invoice-expense-bridge"]');

  const changeStatus = await page.getByRole("button", { name: "Change Status", exact: true }).count();
  const expenseLink = await page.getByRole("link", { name: /Open\/Correct linked Expense/ }).count();

  const secondaryActions = page.locator('[data-testid="supplier-invoice-secondary-actions"]').first();
  const secondaryActionsCount = await secondaryActions.count();
  const invoiceActionsBeforeOpen = await page.getByRole("button", { name: "Invoice actions", exact: true }).count();
  if (secondaryActionsCount === 1) {
    await page.locator('[data-testid="supplier-invoice-secondary-actions"] summary').first().click();
  }
  const invoiceActions = await page.getByRole("button", { name: "Invoice actions", exact: true }).count();

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
    { id: "supplier-expense-details-collapsed-by-default", passed: expenseBridgeBeforeOpen === 0, details: `visible Expense bridges before disclosure: ${expenseBridgeBeforeOpen}` },
    { id: "supplier-payment-change-status-visible", passed: changeStatus === 1, details: `Change Status controls: ${changeStatus}` },
    { id: "supplier-payment-dialog-visible", passed: paymentDialog === 1, details: `supplier payment dialogs: ${paymentDialog}` },
    { id: "supplier-payment-status-options-visible", passed: paidOption === 1 && partialOption === 1, details: `Paid/Partially Paid controls: ${paidOption}/${partialOption}` },
    { id: "supplier-payment-confirm-visible", passed: confirmPayment === 1, details: `Confirm Payment controls: ${confirmPayment}` },
    { id: "supplier-payment-inline-account-visible", passed: addAccount === 1, details: `Add Cash/Bank Account controls: ${addAccount}` },
    { id: "supplier-expense-secondary-correction-link-visible", passed: expenseLink === 1, details: `linked Expense correction links: ${expenseLink}` },
    { id: "supplier-invoice-secondary-actions-collapsed-by-default", passed: secondaryActionsCount === 1 && invoiceActionsBeforeOpen === 0, details: `secondary disclosures: ${secondaryActionsCount}; visible Invoice actions before open: ${invoiceActionsBeforeOpen}` },
    { id: "supplier-invoice-correction-continuation-visible", passed: invoiceActions > 0, details: `Invoice actions controls after disclosure: ${invoiceActions}` },
  ] satisfies readonly QaAssertion[];
};
export const verifySupplierInvoiceReview: QaScenarioAction = async (page) => {
  await waitForVisible(page, '[data-testid="supplier-invoice-side-by-side-review"]');
  const reviewLayout = await page.locator('[data-testid="supplier-invoice-side-by-side-review"]').count();
  const sourcePane = await page.locator('[data-testid="supplier-invoice-source-pane"]').count();
  const extractedPane = await page.locator('[data-testid="supplier-invoice-extracted-pane"]').count();
  const sourceSurface = await page.locator('[data-testid="supplier-invoice-source-surface"]').count();
  const sourceDocument = await page.locator('[data-testid="supplier-invoice-source-document"][data-source-state="available"]').count();
  const extractedWorksheet = await page.locator('[data-testid="supplier-invoice-extracted-worksheet"]').count();
  const worksheetActionBar = await page.locator('[data-testid="supplier-invoice-worksheet-action-bar"]').count();
  const headerWorksheet = await page.locator('[data-testid="supplier-invoice-header-worksheet"]').count();
  const lineWorksheet = await page.locator('[data-testid="supplier-invoice-line-items-worksheet"]').count();
  const totalsWorksheet = await page.locator('[data-testid="supplier-invoice-totals-worksheet"]').count();
  const worksheetEditors = await page.locator('[data-worksheet-editor="true"]').count();
  const geometry = await page.evaluate(() => {
    const grid = window.innerWidth < 768 ? "[data-worksheet-mobile-fallback='true']" : "[data-worksheet-desktop-grid='true']";
    const sourceElement = document.querySelector<HTMLElement>('[data-testid="supplier-invoice-source-pane"]');
    const extractedElement = document.querySelector<HTMLElement>('[data-testid="supplier-invoice-extracted-pane"]');
    const sourceDocumentElement = document.querySelector<HTMLElement>('[data-testid="supplier-invoice-source-document"][data-source-state="available"]');
    const firstEditableElement = document.querySelector<HTMLElement>(`[data-testid="supplier-invoice-header-worksheet"] ${grid} [data-worksheet-cell$=":invoiceNumber"]`);
    const sourceRect = sourceElement?.getBoundingClientRect();
    const extractedRect = extractedElement?.getBoundingClientRect();
    const sourceDocumentRect = sourceDocumentElement?.getBoundingClientRect();
    const firstEditableRect = firstEditableElement?.getBoundingClientRect();
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      pageWidth: document.documentElement.scrollWidth,
      source: sourceRect ? { left: sourceRect.left, right: sourceRect.right, top: sourceRect.top, bottom: sourceRect.bottom, width: sourceRect.width, height: sourceRect.height } : null,
      extracted: extractedRect ? { left: extractedRect.left, right: extractedRect.right, top: extractedRect.top, bottom: extractedRect.bottom, width: extractedRect.width, height: extractedRect.height } : null,
      sourceDocument: sourceDocumentRect ? { left: sourceDocumentRect.left, right: sourceDocumentRect.right, top: sourceDocumentRect.top, bottom: sourceDocumentRect.bottom, width: sourceDocumentRect.width, height: sourceDocumentRect.height } : null,
      firstEditable: firstEditableRect ? { left: firstEditableRect.left, right: firstEditableRect.right, top: firstEditableRect.top, bottom: firstEditableRect.bottom, width: firstEditableRect.width, height: firstEditableRect.height } : null,
      editableCursor: firstEditableElement ? getComputedStyle(firstEditableElement).cursor : "missing",
    };
  });
  const wide = geometry.width >= 1280;
  const widePanelsUsable = Boolean(geometry.source && geometry.extracted && geometry.source.width >= 320 && geometry.extracted.width >= 420 && geometry.source.right <= geometry.extracted.left + 2 && Math.abs(geometry.source.top - geometry.extracted.top) <= 16 && Math.max(geometry.source.top, geometry.extracted.top) < Math.min(geometry.source.bottom, geometry.extracted.bottom));
  const sourceAndFieldInFirstView = Boolean(geometry.sourceDocument && geometry.firstEditable && geometry.sourceDocument.top < geometry.height && geometry.sourceDocument.bottom > 0 && geometry.firstEditable.top < geometry.height && geometry.firstEditable.bottom > 0);
  const narrowPanelsStacked = Boolean(geometry.source && geometry.extracted && geometry.source.width >= geometry.width * 0.8 && geometry.extracted.width >= geometry.width * 0.8 && Math.abs(geometry.source.left - geometry.extracted.left) <= 4 && geometry.extracted.top >= geometry.source.bottom - 2);
  const noPageOverflow = geometry.pageWidth <= geometry.width + 2;

  const gridSelector = geometry.width < 768 ? "[data-worksheet-mobile-fallback='true']" : "[data-worksheet-desktop-grid='true']";
  const editableCellSelector = `[data-testid="supplier-invoice-header-worksheet"] ${gridSelector} [data-worksheet-cell$=":invoiceNumber"]`;
  const dateCellSelector = `[data-testid="supplier-invoice-header-worksheet"] ${gridSelector} [data-worksheet-cell$=":invoiceDate"]`;
  const editableCell = page.locator(editableCellSelector);
  await editableCell.click();
  const textEditor = page.locator(`${editableCellSelector} input[type="text"]`);
  await textEditor.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const pointerFocus = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") === "Invoice Number, row 1");
  const originalInvoiceNumber = await page.evaluate(() => {
    const grid = window.innerWidth < 768 ? "[data-worksheet-mobile-fallback='true']" : "[data-worksheet-desktop-grid='true']";
    const cell = document.querySelector<HTMLElement>(`[data-testid="supplier-invoice-header-worksheet"] ${grid} [data-worksheet-cell$=":invoiceNumber"]`);
    return cell?.querySelector<HTMLInputElement>("input")?.value || cell?.textContent?.trim() || "";
  });
  const copiedCell = await page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLInputElement)) return { text: "", prevented: false };
    const clipboard = new DataTransfer();
    const event = new ClipboardEvent("copy", { clipboardData: clipboard, bubbles: true, cancelable: true });
    active.dispatchEvent(event);
    return { text: clipboard.getData("text/plain"), prevented: event.defaultPrevented };
  });
  await textEditor.fill("UX-EDIT-1A-ESCAPE-CHECK");
  await page.keyboard.press("Escape");
  const escapedEditorClosed = (await page.locator(`${editableCellSelector} input, ${editableCellSelector} select`).count()) === 0;
  const escapeRestoredValue = await page.evaluate(() => {
    const grid = window.innerWidth < 768 ? "[data-worksheet-mobile-fallback='true']" : "[data-worksheet-desktop-grid='true']";
    const cell = document.querySelector<HTMLElement>(`[data-testid="supplier-invoice-header-worksheet"] ${grid} [data-worksheet-cell$=":invoiceNumber"]`);
    if (!cell) return "";
    return cell.querySelector<HTMLElement>("[data-worksheet-value]")?.textContent?.trim() || "";
  });

  await editableCell.press("Enter");
  await textEditor.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await textEditor.fill("UX-EDIT-1A-TAB-CHECK");
  await page.keyboard.press("Tab");
  const tabNavigation = await page.evaluate(() => ({
    selected: document.querySelector<HTMLElement>('[data-testid="supplier-invoice-header-worksheet"] [aria-selected="true"]')?.getAttribute("data-worksheet-cell") || "",
    value: document.querySelector<HTMLElement>('[data-testid="supplier-invoice-header-worksheet"] [data-worksheet-desktop-grid="true"] [data-worksheet-cell$=":invoiceNumber"]')?.textContent?.trim() || "",
  }));
  await page.locator(dateCellSelector).press("Shift+Tab");
  const shiftTabNavigation = await page.evaluate(() => document.activeElement?.getAttribute("data-worksheet-cell") || "");
  const discard = page.getByRole("button", { name: "Discard all worksheet edits", exact: true });
  if (await discard.count() === 1) await discard.click();

  const dateCell = page.locator(dateCellSelector);
  await dateCell.click();
  const dateEditor = page.locator(`${dateCellSelector} input[type="date"]`);
  await dateEditor.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await page.keyboard.press("Escape");
  const selectCellSelector = `[data-testid="supplier-invoice-line-items-worksheet"] ${gridSelector} [data-worksheet-cell$=":taxTreatment"]`;
  await page.locator(selectCellSelector).click();
  const selectEditor = page.locator(`${selectCellSelector} select`);
  await selectEditor.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const selectFocused = await page.evaluate(() => document.activeElement instanceof HTMLSelectElement);
  await page.keyboard.press("Escape");

  const saveAction = await page.getByRole("button", { name: "Save worksheet edits", exact: true }).count();
  const collapsedWorkflows = await page.evaluate(() => {
    const allocation = document.querySelector<HTMLDetailsElement>('[data-testid="supplier-invoice-project-allocation-disclosure"]');
    const purchaseOrder = document.querySelector<HTMLDetailsElement>('[data-testid="supplier-invoice-purchase-order-disclosure"]');
    const materialIntake = document.querySelector<HTMLDetailsElement>('[data-testid="supplier-invoice-material-intake-disclosure"]');
    const settlement = document.querySelector<HTMLDetailsElement>('[data-testid="supplier-invoice-settlement-disclosure"]');
    return {
      allocationPresent: Boolean(allocation),
      allocationOpen: Boolean(allocation?.open),
      purchaseOrderPresent: Boolean(purchaseOrder),
      purchaseOrderOpen: Boolean(purchaseOrder?.open),
      materialIntakePresent: Boolean(materialIntake),
      materialIntakeOpen: Boolean(materialIntake?.open),
      settlementPresent: Boolean(settlement),
      settlementOpen: Boolean(settlement?.open),
      secondaryActionsOpen: Boolean(document.querySelector<HTMLDetailsElement>('[data-testid="supplier-invoice-secondary-actions"]')?.open),
      extractedDetailsOpen: Boolean(document.querySelector<HTMLDetailsElement>('[data-testid="supplier-invoice-review"] details:not([data-testid="supplier-invoice-review-notes"])')?.open),
    };
  });
  const verifyWorkflow = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
    let count = 0;
    let outsideWorksheet = true;
    let stickyCount = 0;
    for (const button of buttons) {
      if (!/Verify & Create Expense/.test(button.textContent || "")) continue;
      count += 1;
      if (button.closest('[data-testid="supplier-invoice-extracted-worksheet"]')) outsideWorksheet = false;
      if (button.closest(".sticky.bottom-2")) stickyCount += 1;
    }
    return {
      count,
      outsideWorksheet,
      stickyCount,
    };
  });
  const stickyFooterCount = await page.locator(".sticky.bottom-2").count();
  const detailsToggle = await page.getByRole("button", { name: "Details", exact: true }).count();
  const sourceToggle = await page.getByRole("button", { name: "Source", exact: true }).count();
  const prominentCorrectionAction = await page.getByRole("button", { name: "Review correction options", exact: true }).count();
  return [
    { id: "supplier-invoice-wide-panels-visible", passed: reviewLayout === 1 && sourcePane === 1 && extractedPane === 1 && (wide ? widePanelsUsable && sourceAndFieldInFirstView : narrowPanelsStacked), details: `paired panes at ${geometry.width}px: source ${geometry.source?.width ?? 0}px, extracted ${geometry.extracted?.width ?? 0}px; source doc y=${geometry.sourceDocument?.top ?? "missing"}..${geometry.sourceDocument?.bottom ?? "missing"}, first field y=${geometry.firstEditable?.top ?? "missing"}..${geometry.firstEditable?.bottom ?? "missing"}, viewport=${geometry.height}px` },
    { id: "supplier-invoice-source-surface-visible", passed: sourceSurface === 1, details: `preserved source surfaces: ${sourceSurface}` },
    { id: "supplier-invoice-source-document-visible", passed: sourceDocument === 1, details: `available source documents: ${sourceDocument}` },
    { id: "supplier-invoice-extracted-worksheet-visible", passed: extractedWorksheet === 1, details: `extracted worksheets: ${extractedWorksheet}` },
    { id: "supplier-invoice-worksheet-action-bar-visible", passed: worksheetActionBar === 1, details: `aggregate worksheet action bars: ${worksheetActionBar}` },
    { id: "supplier-invoice-header-worksheet-visible", passed: headerWorksheet === 1, details: `header worksheets: ${headerWorksheet}` },
    { id: "supplier-invoice-line-worksheet-visible", passed: lineWorksheet === 1, details: `line-item worksheets: ${lineWorksheet}` },
    { id: "supplier-invoice-totals-worksheet-visible", passed: totalsWorksheet === 1, details: `totals worksheets: ${totalsWorksheet}` },
    { id: "supplier-invoice-four-worksheet-editors-visible", passed: worksheetEditors === 4, details: `worksheet editors: ${worksheetEditors}` },
    { id: "supplier-invoice-editable-cell-one-click", passed: geometry.editableCursor === "text" && pointerFocus, details: `cursor ${geometry.editableCursor}; input focused after one click: ${pointerFocus}` },
    { id: "supplier-invoice-copy-while-editing", passed: copiedCell.prevented && copiedCell.text === originalInvoiceNumber, details: `copy used the cell value while the editor was focused: ${copiedCell.text === originalInvoiceNumber}` },
    { id: "supplier-invoice-escape-cancels-edit", passed: escapedEditorClosed && originalInvoiceNumber === escapeRestoredValue, details: `editor closed ${escapedEditorClosed}; original "${originalInvoiceNumber}"; after Escape "${escapeRestoredValue}"` },
    { id: "supplier-invoice-keyboard-enter-edits", passed: tabNavigation.value.includes("UX-EDIT-1A-TAB-CHECK"), details: `Enter opened the editor and Tab committed: ${tabNavigation.value}` },
    { id: "supplier-invoice-tab-shift-tab-navigation", passed: tabNavigation.selected.endsWith(":invoiceDate") && shiftTabNavigation.endsWith(":invoiceNumber"), details: `Tab selected ${tabNavigation.selected}; Shift+Tab returned to ${shiftTabNavigation}` },
    { id: "supplier-invoice-date-editor-one-click", passed: (await page.locator(`${dateCellSelector} input[type="date"]`).count()) === 0, details: "date input opened on one click and Escape closed it" },
    { id: "supplier-invoice-select-editor-one-click", passed: selectFocused, details: `select control focused after one click: ${selectFocused}` },
    { id: "supplier-invoice-worksheet-save-visible", passed: saveAction === 1, details: `aggregate Save worksheet edits actions: ${saveAction}` },
    { id: "supplier-invoice-verify-workflow-separate", passed: verifyWorkflow.count === 1 && verifyWorkflow.outsideWorksheet && (stickyFooterCount === 0 || (stickyFooterCount === 1 && verifyWorkflow.stickyCount === 1)), details: `verify actions ${verifyWorkflow.count}, outside worksheet ${verifyWorkflow.outsideWorksheet}, sticky footers ${stickyFooterCount}, verify in footer ${verifyWorkflow.stickyCount}` },
    { id: "supplier-invoice-downstream-workflows-collapsed", passed: collapsedWorkflows.allocationPresent && !collapsedWorkflows.allocationOpen && collapsedWorkflows.purchaseOrderPresent && !collapsedWorkflows.purchaseOrderOpen && collapsedWorkflows.materialIntakePresent && !collapsedWorkflows.materialIntakeOpen, details: `allocation ${collapsedWorkflows.allocationPresent}/${collapsedWorkflows.allocationOpen}, PO match ${collapsedWorkflows.purchaseOrderPresent}/${collapsedWorkflows.purchaseOrderOpen}, material intake ${collapsedWorkflows.materialIntakePresent}/${collapsedWorkflows.materialIntakeOpen}` },
    { id: "supplier-invoice-secondary-details-collapsed", passed: !collapsedWorkflows.secondaryActionsOpen && !collapsedWorkflows.extractedDetailsOpen && (!collapsedWorkflows.settlementPresent || !collapsedWorkflows.settlementOpen), details: `more actions ${collapsedWorkflows.secondaryActionsOpen}; extracted details ${collapsedWorkflows.extractedDetailsOpen}; settlement ${collapsedWorkflows.settlementPresent}/${collapsedWorkflows.settlementOpen}` },
    { id: "supplier-invoice-correction-action-secondary", passed: prominentCorrectionAction === 0, details: `prominent correction buttons: ${prominentCorrectionAction}` },
    { id: "supplier-invoice-no-page-horizontal-overflow", passed: noPageOverflow, details: `page width ${geometry.pageWidth}px at viewport ${geometry.width}px` },
    { id: "supplier-invoice-old-mobile-pane-removed", passed: detailsToggle === 0 && sourceToggle === 0, details: `legacy Details/Source toggles: ${detailsToggle}/${sourceToggle}` },
  ] satisfies readonly QaAssertion[];
};
export const verifySupplierInvoiceReadOnlyCell: QaScenarioAction = async (page) => {
  const width = await page.evaluate(() => window.innerWidth);
  const gridSelector = width < 768 ? "[data-worksheet-mobile-fallback='true']" : "[data-worksheet-desktop-grid='true']";
  const cellSelector = `[data-testid="supplier-invoice-header-worksheet"] ${gridSelector} [data-worksheet-cell$=":invoiceNumber"]`;
  const cell = page.locator(cellSelector);
  await cell.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const before = await page.evaluate(() => ({
    readonly: document.querySelector<HTMLElement>(`[data-testid="supplier-invoice-header-worksheet"] ${window.innerWidth < 768 ? "[data-worksheet-mobile-fallback='true']" : "[data-worksheet-desktop-grid='true']"} [data-worksheet-cell$=":invoiceNumber"]`)?.getAttribute("aria-readonly"),
    editable: document.querySelector<HTMLElement>(`[data-testid="supplier-invoice-header-worksheet"] ${window.innerWidth < 768 ? "[data-worksheet-mobile-fallback='true']" : "[data-worksheet-desktop-grid='true']"} [data-worksheet-cell$=":invoiceNumber"]`)?.getAttribute("data-worksheet-editable"),
  }));
  await cell.click();
  const editorCount = await page.locator(`${cellSelector} input, ${cellSelector} select`).count();
  return [
    { id: "supplier-invoice-protected-cell-read-only", passed: before.readonly === "true" && before.editable === "false" && editorCount === 0, details: `aria-readonly ${before.readonly}; editable ${before.editable}; editors after click ${editorCount}` },
  ];
};
export const verifyStaleSupplierInvoiceRecovery: QaScenarioAction = async (page) => {
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
export const verifyR4ePrimaryButtonContrast: QaScenarioAction = async (page) => {
  const themeAssertions = await applyThemePreferenceForVisualQa(page, "dark");
  const button = page.getByRole("button", { name: "Upload supplier invoice", exact: true }).first();
  await button.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const colors = await page.evaluate(() => {
    const element = Array.from(document.querySelectorAll<HTMLElement>('[data-ui="page-header-actions"] button')).find((candidate) => candidate.textContent?.trim() === "Upload supplier invoice");
    return {
      background: element ? getComputedStyle(element).backgroundColor : "missing",
      foreground: element ? getComputedStyle(element).color : "missing",
    };
  });
  const contrast = contrastRatio(colors.foreground, colors.background);
  return [
    ...themeAssertions,
    { id: "r4e-dark-primary-action-uses-accent", passed: colors.background === "rgb(129, 140, 248)", details: `primary action background: ${colors.background}` },
    { id: "r4e-dark-primary-action-uses-on-accent-text", passed: colors.foreground === "rgb(15, 23, 42)", details: `primary action foreground: ${colors.foreground}` },
    { id: "r4e-dark-primary-action-aa", passed: contrast >= 4.5, details: `primary action contrast: ${contrast.toFixed(2)}:1 (${colors.foreground} on ${colors.background})` },
  ] satisfies readonly QaAssertion[];
};
export const verifyInvoiceRegisterCompactFilters: QaScenarioAction = async (page) => {
  const toolbarCount = await page.locator('[data-ui="compact-action-bar"]').count();
  const searchCount = await page.getByRole("searchbox", { name: "Search invoices", exact: true }).count()
    + await page.getByRole("textbox", { name: "Search invoices", exact: true }).count();
  const uploadCount = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[data-ui="page-header-actions"] button')).filter((button) => button.textContent?.trim() === "Upload supplier invoice").length);
  const filterButton = page.getByRole("button", { name: /^Filters/ }).first();
  const filterButtonCount = await filterButton.count();
  let activeChipCount = 0;
  let rowsBefore = 0;
  let rowsFiltered = 0;
  let rowsRestored = 0;
  if (filterButtonCount === 1) {
    await filterButton.click();
    const panel = page.getByRole("dialog", { name: "Filters options", exact: true });
    await panel.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
    const reviewFilter = page.getByRole("combobox", { name: "Review status", exact: true });
    rowsBefore = await page.locator("#invoice-directory-results tbody tr").count();
    await reviewFilter.selectOption("NEEDS_REVIEW");
    const removable = page.getByRole("button", { name: "Remove filter: Review: Needs review", exact: true });
    activeChipCount = await removable.count();
    rowsFiltered = await page.locator("#invoice-directory-results tbody tr").count();
    if (activeChipCount === 1) await removable.click();
    rowsRestored = await page.locator("#invoice-directory-results tbody tr").count();
  }
  return [
    { id: "invoice-register-one-compact-action-bar", passed: toolbarCount === 1, details: `compact action bars: ${toolbarCount}` },
    { id: "invoice-register-search-available", passed: searchCount === 1, details: `invoice search controls: ${searchCount}` },
    { id: "invoice-register-filters-disclosed", passed: filterButtonCount === 1, details: `Filters triggers: ${filterButtonCount}` },
    { id: "invoice-register-upload-primary", passed: uploadCount === 1, details: `Upload primary actions: ${uploadCount}` },
    { id: "invoice-register-active-filter-removable", passed: activeChipCount === 1 && rowsBefore > rowsFiltered && rowsRestored === rowsBefore, details: `rows before/filter/restored: ${rowsBefore}/${rowsFiltered}/${rowsRestored}; removable chips: ${activeChipCount}` },
  ] satisfies readonly QaAssertion[];
};
export const verifyInvoiceRegisterPhoneCards: QaScenarioAction = async (page) => {
  const layout = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-invoice-mobile-card="true"]'));
    const firstCard = cards[0];
    const table = document.querySelector<HTMLElement>('section[aria-label="Invoice directory table"]');
    const actionLabels = firstCard ? Array.from(firstCard.querySelectorAll("button")).map((button) => button.getAttribute("aria-label") || button.innerText) : [];
    return {
      cardCount: cards.length,
      firstText: firstCard?.innerText || "",
      openActionCount: actionLabels.filter((label) => /Open invoice/.test(label)).length,
      correctionActionCount: actionLabels.filter((label) => /Review correction options/.test(label)).length,
      tableVisible: Boolean(table && getComputedStyle(table).display !== "none" && table.getClientRects().length),
    };
  });
  return [
    { id: "invoice-register-phone-cards-visible", passed: layout.cardCount > 0, details: `responsive invoice cards: ${layout.cardCount}` },
    { id: "invoice-register-phone-key-fields-visible", passed: /Amount|Project|Date/.test(layout.firstText) && /Needs review|Verified/.test(layout.firstText), details: layout.firstText.slice(0, 240) || "first invoice card is missing" },
    { id: "invoice-register-phone-actions-touchable", passed: layout.openActionCount === 1 && layout.correctionActionCount <= 1, details: `open/correction actions: ${layout.openActionCount}/${layout.correctionActionCount}` },
    { id: "invoice-register-phone-hides-wide-table", passed: !layout.tableVisible, details: `wide invoice table visible: ${layout.tableVisible}` },
  ] satisfies readonly QaAssertion[];
};
export const verifyInvoiceFilterSheetPhone: QaScenarioAction = async (page) => {
  const filterButton = page.getByRole("button", { name: /^Filters/ }).first();
  await filterButton.click();
  const panel = page.getByRole("dialog", { name: "Filters options", exact: true });
  await panel.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const closeButton = page.getByRole("button", { name: "Close filters", exact: true });
  const closeButtonCount = await closeButton.count();
  const layout = await page.evaluate(() => {
    const element = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Filters options"]');
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: window.innerHeight,
      containsFocus: element.contains(document.activeElement),
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      overflowY: style.overflowY,
    };
  });
  let panelClosedByButton = false;
  let focusReturnedToTrigger = false;
  if (closeButtonCount === 1) {
    await closeButton.click();
    panelClosedByButton = await page.getByRole("dialog", { name: "Filters options", exact: true }).count() === 0;
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-controls")?.startsWith("advanced-filter-") === true, [], { timeout: READY_TIMEOUT_MS });
    focusReturnedToTrigger = await page.evaluate(() => document.activeElement?.getAttribute("aria-controls")?.startsWith("advanced-filter-") === true);
    await filterButton.click();
    await panel.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  }
  return [
    { id: "invoice-filter-phone-panel-within-viewport", passed: Boolean(layout && layout.left >= 0 && layout.right <= layout.viewportWidth && layout.top >= 0 && layout.bottom <= layout.viewportHeight), details: layout ? `panel bounds ${Math.round(layout.left)},${Math.round(layout.top)}–${Math.round(layout.right)},${Math.round(layout.bottom)} within ${layout.viewportWidth}×${layout.viewportHeight}` : "filter panel is missing" },
    { id: "invoice-filter-phone-first-control-focused", passed: layout?.containsFocus === true, details: `focus inside filter panel: ${layout?.containsFocus ?? false}` },
    { id: "invoice-filter-phone-long-panel-scrollable", passed: Boolean(layout && (layout.scrollHeight <= layout.clientHeight || layout.overflowY === "auto" || layout.overflowY === "scroll")), details: layout ? `panel scroll ${layout.clientHeight}/${layout.scrollHeight}px, overflow-y=${layout.overflowY}` : "filter panel is missing" },
    { id: "invoice-filter-phone-close-button-visible", passed: closeButtonCount === 1, details: `Close filters controls: ${closeButtonCount}` },
    { id: "invoice-filter-phone-close-restores-focus", passed: panelClosedByButton && focusReturnedToTrigger, details: `closed: ${panelClosedByButton}; focus returned: ${focusReturnedToTrigger}` },
  ] satisfies readonly QaAssertion[];
};
export const verifyDarkInvoiceFilterSheet: QaScenarioAction = async (page) => {
  const themeAssertions = await applyThemePreferenceForVisualQa(page, "dark");
  const filterAssertions = (await verifyInvoiceFilterSheetPhone(page)) || [];
  const colors = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Filters options"]');
    const control = panel?.querySelector<HTMLElement>("input, select, textarea");
    if (!panel || !control) return null;
    const panelStyle = getComputedStyle(panel);
    const controlStyle = getComputedStyle(control);
    return {
      panelBackground: panelStyle.backgroundColor,
      panelText: panelStyle.color,
      controlBackground: controlStyle.backgroundColor,
      controlText: controlStyle.color,
      controlBorder: controlStyle.borderTopColor,
    };
  });
  const panelTextContrast = colors ? contrastRatio(colors.panelText, colors.panelBackground) : 0;
  const controlTextContrast = colors ? contrastRatio(colors.controlText, colors.controlBackground) : 0;
  const controlBorderContrast = colors ? contrastRatio(colors.controlBorder, colors.controlBackground) : 0;
  return [...themeAssertions, ...filterAssertions,
    { id: "r4e-dark-phone-filter-surface", passed: colors?.panelBackground === "rgb(30, 41, 59)", details: `filter surface: ${colors?.panelBackground || "missing"}` },
    { id: "r4e-dark-phone-filter-text-aa", passed: panelTextContrast >= 4.5, details: `filter text contrast: ${panelTextContrast.toFixed(2)}:1` },
    { id: "r4e-dark-phone-filter-control-aa", passed: controlTextContrast >= 4.5, details: `filter control text contrast: ${controlTextContrast.toFixed(2)}:1` },
    { id: "r4e-dark-phone-filter-control-boundary", passed: controlBorderContrast >= 3, details: `filter control boundary contrast: ${controlBorderContrast.toFixed(2)}:1` },
  ] satisfies readonly QaAssertion[];
};

export const invoicesScenarioActions: Readonly<Record<string, QaScenarioAction>> = {
  verifyDarkInvoiceFilterSheet,
  verifyExtractorScreen,
  verifyInvoiceFilterSheetPhone,
  verifyInvoiceRegisterCompactFilters,
  verifyInvoiceRegisterPhoneCards,
  verifyR4ePrimaryButtonContrast,
  verifyStaleSupplierInvoiceRecovery,
  verifySupplierInvoiceNavigation,
  verifySupplierInvoiceReadOnlyCell,
  verifySupplierInvoiceReview,
  verifySupplierPayableBridge,
};
