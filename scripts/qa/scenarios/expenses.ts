import type { QaAssertion, QaScenarioAction } from "../structuredEvidence.ts";
import { waitForVisible } from "./shared.ts";

export const verifyExpensePaymentSurface: QaScenarioAction = async (page) => {
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
export const verifyR4eExpenseRegisterFit: QaScenarioAction = async (page) => {
  const layout = await page.evaluate(() => {
    const section = document.querySelector<HTMLElement>('[data-ux45c="expenses-primary-register"]');
    const cardList = section?.querySelector<HTMLElement>('[aria-label="Expense register cards"]');
    const table = section?.querySelector<HTMLTableElement>('[data-operations-grid] table');
    const scroller = table?.parentElement;
    const actionHeader = table ? Array.from(table.querySelectorAll<HTMLElement>("thead th")).find((header) => header.innerText.trim() === "Actions") : undefined;
    const scrollerRect = scroller?.getBoundingClientRect();
    const actionRect = actionHeader?.getBoundingClientRect();
    return {
      cardsVisible: Boolean(cardList && getComputedStyle(cardList).display !== "none" && cardList.getClientRects().length > 0),
      cardCount: cardList?.querySelectorAll("[data-expense-register-card]").length ?? 0,
      cardDetailsText: cardList?.querySelector<HTMLElement>("[data-expense-register-card]")?.innerText.toLocaleLowerCase() || "",
      tableVisible: Boolean(table && table.getClientRects().length > 0),
      actionColumnVisible: Boolean(scrollerRect && actionRect && actionRect.right <= scrollerRect.right + 1),
      scrollerWidth: scroller?.clientWidth ?? 0,
      tableWidth: table?.scrollWidth ?? 0,
      mode: cardList && getComputedStyle(cardList).display !== "none" ? "cards" : "table",
    };
  });
  return [
    { id: "r4e-expense-register-uses-visible-responsive-path", passed: layout.cardsVisible || (layout.tableVisible && layout.actionColumnVisible), details: `register mode: ${layout.mode}; table ${layout.tableWidth}px inside ${layout.scrollerWidth}px; actions visible: ${layout.actionColumnVisible}` },
    ...(layout.cardsVisible ? [
      { id: "r4e-expense-card-rows-readable", passed: layout.cardCount > 0, details: `expense record cards visible: ${layout.cardCount}` },
      { id: "r4e-expense-card-retains-financial-and-source-detail", passed: ["project", "payee", "source", "amount", "settlement"].every((label) => layout.cardDetailsText.includes(label)), details: `card fields: ${layout.cardDetailsText.replaceAll("\n", " · ").slice(0, 220)}` },
    ] : []),
  ] satisfies readonly QaAssertion[];
};

export const verifyExpenseDraftWorksheet: QaScenarioAction = async (page) => {
  const addExpense = page.getByRole("button", { name: "Add expense", exact: true }).first();
  await addExpense.click();
  const worksheet = page.locator('[data-testid="expense-draft-worksheet"]');
  await worksheet.waitFor({ state: "visible" });

  const editableCell = page.locator('[data-testid="expense-draft-worksheet"] [data-worksheet-cell][data-worksheet-editable="true"]:visible').first();
  await editableCell.click();
  const editControl = page.locator('[data-testid="expense-draft-worksheet"] [data-worksheet-state="editing"] input:visible, [data-testid="expense-draft-worksheet"] [data-worksheet-state="editing"] select:visible').first();
  await editControl.waitFor({ state: "visible" });

  const state = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-testid="expense-draft-worksheet"]');
    const control = Array.from(root?.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      '[data-worksheet-state="editing"] input, [data-worksheet-state="editing"] select',
    ) || []).find((candidate) => candidate.getClientRects().length > 0);
    const cell = control?.closest<HTMLElement>("[data-worksheet-cell]");
    const controlStyle = control ? getComputedStyle(control) : undefined;
    return {
      worksheetVisible: Boolean(root && root.getClientRects().length > 0),
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      viewportWidth: window.innerWidth,
      editableCellCount: root?.querySelectorAll('[data-worksheet-cell][data-worksheet-editable="true"]').length || 0,
      protectedStatusCount: root?.querySelectorAll('[data-worksheet-cell$=":status"][data-worksheet-protected="true"]').length || 0,
      editing: cell?.dataset.worksheetState === "editing",
      selected: cell?.getAttribute("aria-selected") === "true",
      outline: cell ? getComputedStyle(cell).outlineStyle : "missing",
      inputBorder: controlStyle?.borderTopWidth || "missing",
      inputRadius: controlStyle?.borderTopLeftRadius || "missing",
    };
  });

  return [
    { id: "expense-draft-worksheet-visible", passed: state.worksheetVisible, details: "visible draft worksheet: " + state.worksheetVisible },
    { id: "expense-draft-single-click-editor", passed: state.editableCellCount > 0 && state.editing && state.selected, details: "editable cells=" + state.editableCellCount + "; editing=" + state.editing + "; selected=" + state.selected },
    { id: "expense-draft-integrated-editor-presentation", passed: state.outline === "solid" && state.inputBorder === "0px" && state.inputRadius === "0px", details: "cell outline=" + state.outline + "; input border=" + state.inputBorder + "; radius=" + state.inputRadius },
    { id: "expense-draft-protected-workflow-state-visible", passed: state.protectedStatusCount > 0, details: "protected Status cell instances: " + state.protectedStatusCount },
    { id: "expense-draft-no-page-horizontal-overflow", passed: state.documentWidth <= state.viewportWidth + 2, details: "document " + state.documentWidth + "px / viewport " + state.viewportWidth + "px" },
  ] satisfies readonly QaAssertion[];
};

export const expensesScenarioActions: Readonly<Record<string, QaScenarioAction>> = {
  verifyExpensePaymentSurface,
  verifyR4eExpenseRegisterFit,
  verifyExpenseDraftWorksheet,
};
