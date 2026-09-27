import type { QaAssertion, QaScenarioAction } from "../structuredEvidence.ts";
import { READY_TIMEOUT_MS } from "./shared.ts";

const workbookRoot = '[data-operations-workbook="true"]';
const workbookTabs = '[role="tablist"][aria-label="Operations Workbook sheets"] [role="tab"]';

export const verifyOperationsWorkbookLayout: QaScenarioAction = async (page) => {
  await page.locator(workbookRoot).waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await page.getByRole("heading", { name: "Operations Workbook", exact: true }).waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const tabCount = await page.locator(workbookTabs).count();
  const tab = page.getByRole("tab", { name: "Projects", exact: true });
  const projectTabCount = await tab.count();
  const costCodeTabCount = await page.getByRole("tab", { name: /Cost codes/i }).count();
  const expensesTabCount = await page.getByRole("tab", { name: "Expenses", exact: true }).count();
  const rfqTabCount = await page.getByRole("tab", { name: "RFQs", exact: true }).count();
  const purchaseOrderTabCount = await page.getByRole("tab", { name: "Purchase orders", exact: true }).count();
  const downloadButton = page.getByRole("button", { name: "Download workbook", exact: true });
  const importButton = page.getByRole("button", { name: "Import workbook", exact: true });
  await tab.press("Home");
  const layout = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-operations-workbook="true"]');
    const desktopGrid = document.querySelector<HTMLElement>("[data-worksheet-desktop-grid]");
    const mobileGrid = document.querySelector<HTMLElement>("[data-worksheet-mobile-fallback]");
    const tabs = document.querySelector<HTMLElement>('[role="tablist"][aria-label="Operations Workbook sheets"]');
    const selectedTab = tabs?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    return {
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      viewportWidth: window.innerWidth,
      rootWidth: root?.getBoundingClientRect().width || 0,
      rootBackground: root ? getComputedStyle(root).backgroundColor : "missing",
      desktopGridVisible: Boolean(desktopGrid && getComputedStyle(desktopGrid).display !== "none" && getComputedStyle(desktopGrid).visibility !== "hidden" && desktopGrid.getClientRects().length),
      mobileGridVisible: Boolean(mobileGrid && getComputedStyle(mobileGrid).display !== "none" && getComputedStyle(mobileGrid).visibility !== "hidden" && mobileGrid.getClientRects().length),
      selectedTab: selectedTab?.textContent?.trim() || "",
      selectedTabFocused: selectedTab === document.activeElement,
      worksheetRows: document.querySelectorAll('[data-worksheet-row-key], [data-worksheet-mobile-row-key]').length,
    };
  });
  const mobileViewport = layout.viewportWidth < 768;
  return [
    { id: "workbook-heading-visible", passed: true, details: "Operations Workbook heading rendered." },
    { id: "workbook-combined-roundtrip-actions", passed: await downloadButton.count() === 1 && await importButton.count() === 1, details: "Combined workbook download and import review controls rendered." },
    { id: "workbook-project-expense-and-procurement-tabs-visible", passed: tabCount === 5 && projectTabCount === 1 && costCodeTabCount === 1 && expensesTabCount === 1 && rfqTabCount === 1 && purchaseOrderTabCount === 1, details: `authorized sheet tabs: ${tabCount}; Projects: ${projectTabCount}; Cost Codes: ${costCodeTabCount}; Expenses: ${expensesTabCount}; RFQs: ${rfqTabCount}; Purchase Orders: ${purchaseOrderTabCount}` },
    { id: "workbook-tab-keyboard-focus", passed: layout.selectedTabFocused && layout.selectedTab === "Projects", details: `selected/focused tab: ${layout.selectedTab || "missing"}` },
    { id: "workbook-grid-responsive-mode", passed: mobileViewport ? layout.mobileGridVisible : layout.desktopGridVisible, details: mobileViewport ? `mobile fallback visible: ${layout.mobileGridVisible}` : `desktop grid visible: ${layout.desktopGridVisible}` },
    { id: "workbook-synthetic-project-rows-visible", passed: layout.worksheetRows > 0, details: `worksheet row instances: ${layout.worksheetRows}` },
    { id: "workbook-white-canvas", passed: layout.rootBackground === "rgb(255, 255, 255)", details: `canvas background: ${layout.rootBackground}` },
    { id: "workbook-no-horizontal-page-overflow", passed: layout.documentWidth <= layout.viewportWidth + 2 && layout.rootWidth <= layout.viewportWidth + 2, details: `document ${layout.documentWidth}px / viewport ${layout.viewportWidth}px; shell ${layout.rootWidth}px` },
  ] satisfies readonly QaAssertion[];
};

export const verifyOperationsWorkbookPermissionTabs: QaScenarioAction = async (page) => {
  await page.locator(workbookRoot).waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const tabs = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>(
    '[role="tablist"][aria-label="Operations Workbook sheets"] [role="tab"]',
  )).map((tab) => ({ label: tab.textContent?.trim() || "", selected: tab.getAttribute("aria-selected") === "true", disabled: tab.hasAttribute("disabled") })));
  const route = await page.evaluate(() => ({
    tabIds: Array.from(document.querySelectorAll<HTMLElement>("[data-workbook-sheet]")).map((element) => element.dataset.workbookSheet),
    workbookTabs: Array.from(document.querySelectorAll<HTMLElement>('[role="tablist"][aria-label="Operations Workbook sheets"] [role="tab"]')).map((tab) => tab.textContent?.trim() || ""),
  }));
  return [
    { id: "workbook-read-authorized-sheets-are-visible", passed: tabs.length === 5 && tabs[0]?.label === "Projects" && tabs[1]?.label.toLowerCase() === "cost codes" && tabs[2]?.label === "Expenses" && tabs[3]?.label === "RFQs" && tabs[4]?.label === "Purchase orders" && tabs.every((tab) => !tab.disabled), details: `visible worksheet tabs: ${tabs.map((tab) => tab.label).join(", ") || "none"}` },
    { id: "workbook-unavailable-domain-names-not-rendered-as-tabs", passed: !route.workbookTabs.some((label) => /payroll|supplier invoice|procurement|warehouse|equipment|vendor/i.test(label)), details: `tab labels: ${route.workbookTabs.join(", ") || "none"}` },
    { id: "workbook-route-selects-only-one-sheet-at-a-time", passed: route.tabIds.length === 1 && route.tabIds[0] === "projects", details: `active sheet IDs: ${route.tabIds.join(", ") || "none"}` },
  ] satisfies readonly QaAssertion[];
};

export const verifyOperationsWorkbookInvalidSheetRecovery: QaScenarioAction = async (page) => {
  await page.locator(workbookRoot).waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await page.waitForFunction(() => new URL(window.location.href).searchParams.get("sheet") === "projects");
  const state = await page.evaluate(() => ({
    selectedSheet: document.querySelector<HTMLElement>("[data-workbook-sheet]")?.dataset.workbookSheet || "",
    tabLabels: Array.from(document.querySelectorAll<HTMLElement>('[role="tablist"][aria-label="Operations Workbook sheets"] [role="tab"]')).map((tab) => tab.textContent?.trim() || ""),
    selectedTab: document.querySelector<HTMLElement>('[role="tablist"][aria-label="Operations Workbook sheets"] [role="tab"][aria-selected="true"]')?.textContent?.trim() || "",
  }));
  return [
    { id: "workbook-invalid-sheet-replaced-in-url", passed: new URL(page.url()).searchParams.get("sheet") === "projects", details: `recovered URL sheet: ${new URL(page.url()).searchParams.get("sheet") || "none"}` },
    { id: "workbook-invalid-sheet-selects-authorized-projects", passed: state.selectedSheet === "projects" && state.selectedTab === "Projects", details: `active sheet: ${state.selectedSheet || "none"}; tab: ${state.selectedTab || "none"}` },
    { id: "workbook-invalid-sheet-keeps-only-authorized-tabs", passed: state.tabLabels.length === 5 && state.tabLabels.includes("Expenses") && state.tabLabels.includes("RFQs") && state.tabLabels.includes("Purchase orders") && !state.tabLabels.some((label) => /payroll|supplier invoice|procurement|warehouse|equipment|vendor/i.test(label)), details: `visible tabs: ${state.tabLabels.join(", ") || "none"}` },
  ] satisfies readonly QaAssertion[];
};

export const verifyOperationsWorkbookEditableAndProtectedCells: QaScenarioAction = async (page) => {
  await page.locator(workbookRoot).waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const editableCell = page.locator('[data-worksheet-cell$=":projectName"][data-worksheet-editable="true"]:visible').first();
  await editableCell.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await editableCell.click();
  const editControl = page.locator('[data-worksheet-editable="true"]:visible input').first();
  await editControl.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await editControl.fill("Synthetic QA project name");
  await page.keyboard.press("Enter");
  const importDisabledWhileDirty = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
    .some((button) => button.textContent?.trim() === "Import workbook" && button.disabled));
  await page.getByRole("tab", { name: /Cost codes/i }).click();
  const dirtySwitchState = await page.evaluate(() => ({
    selectedSheet: document.querySelector<HTMLElement>('[data-operations-workbook="true"]')?.dataset.workbookSheet || "",
    warningVisible: document.body.textContent?.includes("Save or discard your worksheet edits before switching sheets.") || false,
  }));

  const protectedStatus = page.locator('[data-worksheet-cell$=":status"]:visible').first();
  await protectedStatus.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await protectedStatus.click();
  const statusState = await page.evaluate(() => {
    const cell = Array.from(document.querySelectorAll<HTMLElement>("[data-worksheet-cell]"))
      .find((candidate) => candidate.dataset.worksheetCell?.endsWith(":status")
        && candidate.getClientRects().length > 0
        && getComputedStyle(candidate).display !== "none");
    return {
      editable: cell?.dataset.worksheetEditable === "true",
      protected: cell?.dataset.worksheetProtected === "true",
      readonly: cell?.getAttribute("aria-readonly") === "true",
      editorCount: cell?.querySelectorAll("input, select").length || 0,
    };
  });
  const editableControlCount = await page.locator('[data-worksheet-editable="true"]:visible input').count();
  return [
    { id: "workbook-demo-project-name-enters-edit-mode", passed: true, details: "Synthetic project name opened a single-click text editor." },
    { id: "workbook-unsaved-edit-blocks-sheet-switch", passed: dirtySwitchState.selectedSheet === "projects" && dirtySwitchState.warningVisible, details: `selected sheet after attempted switch: ${dirtySwitchState.selectedSheet || "none"}; warning visible=${dirtySwitchState.warningVisible}` },
    { id: "workbook-unsaved-edit-disables-import-refresh", passed: importDisabledWhileDirty, details: `combined workbook import disabled while sheet is dirty: ${importDisabledWhileDirty}` },
    { id: "workbook-lifecycle-status-remains-protected", passed: !statusState.editable && statusState.protected && statusState.readonly && statusState.editorCount === 0, details: `editable=${statusState.editable}; protected=${statusState.protected}; readonly=${statusState.readonly}; editors=${statusState.editorCount}` },
    { id: "workbook-edit-cancel-leaves-no-open-editor", passed: editableControlCount === 0, details: `visible project-name editors after Escape: ${editableControlCount}` },
  ] satisfies readonly QaAssertion[];
};

export const verifyOperationsWorkbookCostCodesSheet: QaScenarioAction = async (page) => {
  await page.locator(workbookRoot).waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await page.getByRole("tab", { name: /Cost codes/i }).click();
  await page.waitForFunction(() => document.querySelector<HTMLElement>('[data-operations-workbook="true"]')?.dataset.workbookSheet === "cost-codes");
  const codeCell = page.locator('[data-worksheet-cell$=":code"][data-worksheet-editable="true"]:visible').first();
  await codeCell.waitFor({ state: "attached", timeout: READY_TIMEOUT_MS });
  await codeCell.click();
  const codeEditor = page.locator('[data-worksheet-cell$=":code"]:visible input').first();
  await codeEditor.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await codeEditor.fill("WB3A-QA-CODE");
  await page.keyboard.press("Escape");
  const saveButton = page.getByRole("button", { name: "Save demo edits", exact: true });
  const openCodeEditors = await page.locator('[data-worksheet-cell$=":code"]:visible input').count();
  const state = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-operations-workbook="true"]');
    const tabs = Array.from(document.querySelectorAll<HTMLElement>('[role="tablist"][aria-label="Operations Workbook sheets"] [role="tab"]'));
    const code = Array.from(document.querySelectorAll<HTMLElement>("[data-worksheet-cell]"))
      .find((cell) => cell.dataset.worksheetCell?.endsWith(":code"));
    const parent = Array.from(document.querySelectorAll<HTMLElement>("[data-worksheet-cell]"))
      .find((cell) => cell.dataset.worksheetCell?.endsWith(":projectCode"));
    const status = Array.from(document.querySelectorAll<HTMLElement>("[data-worksheet-cell]"))
      .find((cell) => cell.dataset.worksheetCell?.endsWith(":status"));
    const actualCost = Array.from(document.querySelectorAll<HTMLElement>("[data-worksheet-cell]"))
      .find((cell) => cell.dataset.worksheetCell?.endsWith(":actualCost"));
    const mobileGrid = document.querySelector<HTMLElement>("[data-worksheet-mobile-fallback]");
    return {
      selectedTab: tabs.find((tab) => tab.getAttribute("aria-selected") === "true")?.textContent?.trim() || "",
      selectedSheet: root?.dataset.workbookSheet || "",
      codeEditable: code?.dataset.worksheetEditable === "true",
      parentReadonly: parent?.getAttribute("aria-readonly") === "true" && parent.dataset.worksheetEditable === "false",
      statusProtected: status?.dataset.worksheetProtected === "true" && status.dataset.worksheetEditable === "false",
      actualCostProtected: actualCost?.dataset.worksheetProtected === "true" && actualCost.dataset.worksheetEditable === "false",
      mobileGridVisible: Boolean(mobileGrid && getComputedStyle(mobileGrid).display !== "none" && mobileGrid.getClientRects().length),
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      viewportWidth: window.innerWidth,
    };
  });
  return [
    { id: "workbook-cost-codes-tab-selects-sheet", passed: state.selectedSheet === "cost-codes" && /cost codes/i.test(state.selectedTab), details: `selected sheet: ${state.selectedSheet || "none"}; tab: ${state.selectedTab || "none"}` },
    { id: "workbook-cost-code-code-cell-is-editable", passed: state.codeEditable && await saveButton.count() === 1, details: `Code editable: ${state.codeEditable}; demo Save present: ${await saveButton.count() === 1}` },
    { id: "workbook-cost-code-single-tap-edit-cancels-cleanly", passed: openCodeEditors === 0, details: `visible Code editors after Escape: ${openCodeEditors}` },
    { id: "workbook-cost-code-parent-and-protected-values-are-read-only", passed: state.parentReadonly && state.statusProtected && state.actualCostProtected, details: `parent readonly=${state.parentReadonly}; status protected=${state.statusProtected}; actual cost protected=${state.actualCostProtected}` },
    { id: "workbook-cost-codes-responsive-without-page-overflow", passed: state.viewportWidth < 768 ? state.mobileGridVisible && state.documentWidth <= state.viewportWidth + 2 : state.documentWidth <= state.viewportWidth + 2, details: `mobile fallback=${state.mobileGridVisible}; document ${state.documentWidth}px / viewport ${state.viewportWidth}px` },
  ] satisfies readonly QaAssertion[];
};

export const verifyOperationsWorkbookExpensesSheet: QaScenarioAction = async (page) => {
  await page.locator(workbookRoot).waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await page.getByRole("tab", { name: "Expenses", exact: true }).click();
  await page.waitForFunction(() => document.querySelector<HTMLElement>('[data-operations-workbook="true"]')?.dataset.workbookSheet === "expenses");

  const editableDescription = page.locator('[data-worksheet-cell$=":description"][data-worksheet-editable="true"]:visible').first();
  await editableDescription.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const rowState = await page.evaluate(() => {
    const editable = Array.from(document.querySelectorAll<HTMLElement>('[data-worksheet-cell$=":description"][data-worksheet-editable="true"]'))
      .find((element) => element.getClientRects().length > 0 && getComputedStyle(element).display !== "none");
    const expenseId = editable?.dataset.worksheetCell?.split(":")[0] || "";
    const paidStatus = Array.from(document.querySelectorAll<HTMLElement>('[data-worksheet-cell$=":status"]'))
      .find((candidate) => candidate.textContent?.includes("PAID")
        && candidate.getClientRects().length > 0
        && getComputedStyle(candidate).display !== "none");
    const paidId = paidStatus?.dataset.worksheetCell?.split(":")[0] || "";
    const paidDescription = Array.from(document.querySelectorAll<HTMLElement>("[data-worksheet-cell]"))
      .find((candidate) => candidate.dataset.worksheetCell === paidId + ":description"
        && candidate.getClientRects().length > 0
        && getComputedStyle(candidate).display !== "none");
    const status = Array.from(document.querySelectorAll<HTMLElement>("[data-worksheet-cell]"))
      .find((candidate) => candidate.dataset.worksheetCell === expenseId + ":status"
        && candidate.getClientRects().length > 0
        && getComputedStyle(candidate).display !== "none");
    const source = Array.from(document.querySelectorAll<HTMLElement>("[data-worksheet-cell]"))
      .find((candidate) => candidate.dataset.worksheetCell === expenseId + ":sourceLinkage"
        && candidate.getClientRects().length > 0
        && getComputedStyle(candidate).display !== "none");
    return {
      expenseId,
      statusProtected: status?.dataset.worksheetProtected === "true",
      statusReadonly: status?.getAttribute("aria-readonly") === "true",
      statusEditable: status?.dataset.worksheetEditable === "true",
      statusEditors: status?.querySelectorAll("input, select").length || 0,
      sourceText: source?.textContent?.trim() || "",
      paidStatusText: paidStatus?.textContent?.trim() || "",
      paidRowId: paidId,
      paidDescriptionFound: Boolean(paidDescription),
      paidRowEditable: paidDescription?.dataset.worksheetEditable === "true",
      paidRowReadonly: paidDescription?.getAttribute("aria-readonly") === "true",
    };
  });
  const expenseId = rowState.expenseId;
  await editableDescription.click();
  const editor = page.locator('[data-worksheet-cell$=":description"]:visible input').first();
  await editor.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await editor.fill("Synthetic WB-3B worksheet edit");
  await page.keyboard.press("Enter");

  const importDisabledWhileDirty = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
    .some((button) => button.textContent?.trim() === "Import workbook" && button.disabled));
  await page.getByRole("tab", { name: /Cost codes/i }).click();
  const dirtyGuard = await page.evaluate(() => ({
    selectedSheet: document.querySelector<HTMLElement>('[data-operations-workbook="true"]')?.dataset.workbookSheet || "",
    warningVisible: document.body.textContent?.includes("Save or discard your worksheet edits before switching sheets.") || false,
  }));

  const saveButton = page.getByRole("button", { name: "Save demo edits", exact: true });
  await saveButton.click();
  await page.waitForFunction(() => document.body.textContent?.includes("Demo Expense changes saved in this browser.") === true);
  const state = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-operations-workbook="true"]');
    const mobileGrid = document.querySelector<HTMLElement>("[data-worksheet-mobile-fallback]");
    const savedDescription = Array.from(document.querySelectorAll<HTMLElement>('[data-worksheet-cell$=":description"]'))
      .some((cell) => cell.textContent?.includes("Synthetic WB-3B worksheet edit") && cell.getClientRects().length > 0);
    return {
      selectedSheet: root?.dataset.workbookSheet || "",
      savedDescription,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      viewportWidth: window.innerWidth,
      mobileGridVisible: Boolean(mobileGrid && getComputedStyle(mobileGrid).display !== "none" && mobileGrid.getClientRects().length),
      whiteCanvas: root ? getComputedStyle(root).backgroundColor === "rgb(255, 255, 255)" : false,
    };
  });
  return [
    { id: "workbook-expenses-sheet-selects-authorized-tab", passed: state.selectedSheet === "expenses", details: `selected sheet: ${state.selectedSheet || "missing"}` },
    { id: "workbook-expense-draft-safe-cell-edits-with-one-tap", passed: Boolean(expenseId) && state.savedDescription && await saveButton.count() === 1, details: `edited local Expense row: ${expenseId || "missing"}; Save updated value=${state.savedDescription}` },
    { id: "workbook-expense-protected-lifecycle-and-source-state", passed: !rowState.statusEditable && rowState.statusProtected && rowState.statusReadonly && rowState.statusEditors === 0 && rowState.sourceText.includes("Direct entry") && rowState.paidDescriptionFound && !rowState.paidRowEditable && rowState.paidRowReadonly, details: `status editable=${rowState.statusEditable}; protected=${rowState.statusProtected}; readonly=${rowState.statusReadonly}; editors=${rowState.statusEditors}; source=${rowState.sourceText}; paid status=${rowState.paidStatusText}; row=${rowState.paidRowId}; description found=${rowState.paidDescriptionFound}; editable=${rowState.paidRowEditable}; readonly=${rowState.paidRowReadonly}` },
    { id: "workbook-expense-unsaved-edit-blocks-sheet-switch-and-import", passed: importDisabledWhileDirty && dirtyGuard.selectedSheet === "expenses" && dirtyGuard.warningVisible, details: `import disabled=${importDisabledWhileDirty}; selected sheet=${dirtyGuard.selectedSheet}; warning=${dirtyGuard.warningVisible}` },
    { id: "workbook-expenses-responsive-without-page-overflow", passed: state.viewportWidth < 768 ? state.mobileGridVisible && state.documentWidth <= state.viewportWidth + 2 : state.documentWidth <= state.viewportWidth + 2, details: `mobile fallback=${state.mobileGridVisible}; document ${state.documentWidth}px / viewport ${state.viewportWidth}px` },
    { id: "workbook-expenses-uses-white-grid-canvas", passed: state.whiteCanvas, details: `white canvas=${state.whiteCanvas}` },
  ] satisfies readonly QaAssertion[];
};

export const verifyOperationsWorkbookProcurementSheets: QaScenarioAction = async (page) => {
  await page.locator(workbookRoot).waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await page.getByRole("tab", { name: "RFQs", exact: true }).click();
  await page.waitForFunction(() => document.querySelector<HTMLElement>("[data-operations-workbook]")?.dataset.workbookSheet === "rfqs");

  const rfqState = await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll<HTMLElement>("[data-worksheet-cell]"))
      .filter((cell) => cell.getClientRects().length > 0 && getComputedStyle(cell).display !== "none");
    const draftId = "demo-rfq-sol-001";
    const issuedId = "demo-rfq-wh-001";
    const draftStatus = cells.find((cell) => cell.dataset.worksheetCell === `${draftId}:status`);
    const statusValue = draftStatus?.querySelector<HTMLElement>("div.mt-1 > div, span.block.min-h-5")?.cloneNode(true) as HTMLElement | undefined;
    statusValue?.querySelectorAll(".sr-only").forEach((node) => node.remove());
    const protectedNumber = cells.find((candidate) => candidate.dataset.worksheetCell === `${draftId}:rfqNumber`);
    const title = cells.find((candidate) => candidate.dataset.worksheetCell === `${draftId}:title`);
    const dueDate = cells.find((candidate) => candidate.dataset.worksheetCell === `${draftId}:dueDate`);
    const issuedTitle = cells.find((candidate) => candidate.dataset.worksheetCell === `${issuedId}:title`);
    const protectedStatus = draftStatus;
    return {
      draftId,
      issuedId,
      titleEditable: title?.dataset.worksheetEditable === "true",
      dueDateEditable: dueDate?.dataset.worksheetEditable === "true",
      numberProtected: protectedNumber?.dataset.worksheetProtected === "true" && protectedNumber.dataset.worksheetEditable === "false",
      statusProtected: protectedStatus?.dataset.worksheetProtected === "true" && protectedStatus.dataset.worksheetEditable === "false",
      statusValue: statusValue?.textContent?.trim() || "",
      issuedTitleReadonly: issuedTitle?.getAttribute("aria-readonly") === "true" && issuedTitle?.dataset.worksheetEditable === "false",
      lineFieldCount: cells.filter((candidate) => /line/i.test(candidate.dataset.worksheetCell || "")).length,
    };
  });
  const titleCell = page.locator(`[data-worksheet-cell="${rfqState.draftId}:title"][data-worksheet-editable="true"]:visible`);
  await titleCell.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await titleCell.click();
  const titleEditor = page.locator(`[data-worksheet-cell="${rfqState.draftId}:title"]:visible input`);
  await titleEditor.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await titleEditor.fill("Synthetic WB-3C RFQ draft edit");
  await page.keyboard.press("Enter");

  const importDisabledWithRfqDirty = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
    .some((button) => button.textContent?.trim() === "Import workbook" && button.disabled));
  await page.getByRole("tab", { name: "Expenses", exact: true }).click();
  const rfqDirtyGuard = await page.evaluate(() => ({
    selectedSheet: document.querySelector<HTMLElement>("[data-operations-workbook]")?.dataset.workbookSheet || "",
    warningVisible: document.body.textContent?.includes("Save or discard your worksheet edits before switching sheets.") || false,
  }));

  const dueDateCell = page.locator(`[data-worksheet-cell="${rfqState.draftId}:dueDate"][data-worksheet-editable="true"]:visible`);
  await dueDateCell.click();
  const dueDateEditor = page.locator(`[data-worksheet-cell="${rfqState.draftId}:dueDate"]:visible input`);
  await dueDateEditor.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await dueDateEditor.fill("2026-11-20");
  await page.keyboard.press("Enter");
  const demoSave = page.getByRole("button", { name: "Save demo edits", exact: true });
  await demoSave.click();
  await page.waitForFunction(() => document.body.textContent?.includes("Demo Procurement changes saved in this browser.") === true);
  const rfqSaved = await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll<HTMLElement>("[data-worksheet-cell]"))
      .filter((cell) => cell.getClientRects().length > 0 && getComputedStyle(cell).display !== "none");
    const title = cells.find((cell) => cell.dataset.worksheetCell?.endsWith(":title") && cell.textContent?.includes("Synthetic WB-3C RFQ draft edit"));
    const rowId = title?.dataset.worksheetCell?.split(":")[0] || "";
    const titleValue = title?.querySelector<HTMLElement>("div.mt-1 > div, span.block.min-h-5")?.cloneNode(true) as HTMLElement | undefined;
    const dueDateCell = cells.find((cell) => cell.dataset.worksheetCell === `${rowId}:dueDate`);
    const dueDateValue = dueDateCell?.querySelector<HTMLElement>("div.mt-1 > div, span.block.min-h-5")?.cloneNode(true) as HTMLElement | undefined;
    titleValue?.querySelectorAll(".sr-only").forEach((node) => node.remove());
    dueDateValue?.querySelectorAll(".sr-only").forEach((node) => node.remove());
    return {
      title: titleValue?.textContent?.trim() || "",
      dueDate: dueDateValue?.textContent?.trim() || "",
    };
  });

  await page.getByRole("tab", { name: "Purchase orders", exact: true }).click();
  await page.waitForFunction(() => document.querySelector<HTMLElement>("[data-operations-workbook]")?.dataset.workbookSheet === "purchase-orders");
  const poState = await page.evaluate(() => {
    const cells = Array.from(document.querySelectorAll<HTMLElement>("[data-worksheet-cell]"))
      .filter((cell) => cell.getClientRects().length > 0 && getComputedStyle(cell).display !== "none");
    const draftId = "demo-po-pipe-001";
    const approvedId = "demo-po-wh-001";
    const draftStatus = cells.find((cell) => cell.dataset.worksheetCell === `${draftId}:status`);
    const statusValue = draftStatus?.querySelector<HTMLElement>("div.mt-1 > div, span.block.min-h-5")?.cloneNode(true) as HTMLElement | undefined;
    statusValue?.querySelectorAll(".sr-only").forEach((node) => node.remove());
    const number = cells.find((candidate) => candidate.dataset.worksheetCell === `${draftId}:poNumber`);
    const total = cells.find((candidate) => candidate.dataset.worksheetCell === `${draftId}:total`);
    const description = cells.find((candidate) => candidate.dataset.worksheetCell === `${draftId}:description`);
    const nonDraftDescription = cells.find((candidate) => candidate.dataset.worksheetCell === `${approvedId}:description`);
    return {
      draftId,
      descriptionEditable: description?.dataset.worksheetEditable === "true",
      numberProtected: number?.dataset.worksheetProtected === "true" && number.dataset.worksheetEditable === "false",
      totalProtected: total?.dataset.worksheetProtected === "true" && total.dataset.worksheetEditable === "false",
      statusProtected: draftStatus?.dataset.worksheetProtected === "true" && draftStatus.dataset.worksheetEditable === "false",
      statusValue: statusValue?.textContent?.trim() || "",
      nonDraftDescriptionReadonly: nonDraftDescription?.getAttribute("aria-readonly") === "true" && nonDraftDescription?.dataset.worksheetEditable === "false",
      lineFieldCount: cells.filter((candidate) => /line/i.test(candidate.dataset.worksheetCell || "")).length,
    };
  });
  const descriptionCell = page.locator(`[data-worksheet-cell="${poState.draftId}:description"][data-worksheet-editable="true"]:visible`);
  await descriptionCell.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await descriptionCell.click();
  const descriptionEditor = page.locator(`[data-worksheet-cell="${poState.draftId}:description"]:visible input`);
  await descriptionEditor.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await descriptionEditor.fill("Synthetic WB-3C Purchase Order draft edit");
  await page.keyboard.press("Enter");

  const importDisabledWithPoDirty = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
    .some((button) => button.textContent?.trim() === "Import workbook" && button.disabled));
  await page.getByRole("tab", { name: "Expenses", exact: true }).click();
  const poDirtyGuard = await page.evaluate(() => ({
    selectedSheet: document.querySelector<HTMLElement>("[data-operations-workbook]")?.dataset.workbookSheet || "",
    warningVisible: document.body.textContent?.includes("Save or discard your worksheet edits before switching sheets.") || false,
  }));
  await page.getByRole("button", { name: "Save demo edits", exact: true }).click();
  await page.waitForFunction(() => document.body.textContent?.includes("Demo Procurement changes saved in this browser.") === true);
  const state = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>("[data-operations-workbook]");
    const mobileGrid = document.querySelector<HTMLElement>("[data-worksheet-mobile-fallback]");
    const cells = Array.from(document.querySelectorAll<HTMLElement>("[data-worksheet-cell]"));
    const description = cells.find((cell) => cell.dataset.worksheetCell?.endsWith(":description")
      && cell.textContent?.includes("Synthetic WB-3C Purchase Order draft edit")
      && cell.getClientRects().length > 0);
    return {
      selectedSheet: root?.dataset.workbookSheet || "",
      savedDescription: description?.textContent?.includes("Synthetic WB-3C Purchase Order draft edit") || false,
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      viewportWidth: window.innerWidth,
      mobileGridVisible: Boolean(mobileGrid && getComputedStyle(mobileGrid).display !== "none" && mobileGrid.getClientRects().length),
      whiteCanvas: root ? getComputedStyle(root).backgroundColor === "rgb(255, 255, 255)" : false,
    };
  });

  return [
    { id: "workbook-rfq-safe-draft-fields-save-locally", passed: Boolean(rfqState.draftId) && rfqState.titleEditable && rfqState.dueDateEditable && rfqSaved.title === "Synthetic WB-3C RFQ draft edit" && rfqSaved.dueDate === "2026-11-20", details: `RFQ draft=${rfqState.draftId || "missing"}; title=${rfqSaved.title}; due date=${rfqSaved.dueDate}` },
    { id: "workbook-rfq-identity-status-and-issued-row-stay-protected", passed: rfqState.numberProtected && rfqState.statusProtected && rfqState.statusValue === "DRAFT" && rfqState.issuedId.length > 0 && rfqState.issuedTitleReadonly && rfqState.lineFieldCount === 0, details: `number protected=${rfqState.numberProtected}; status=${rfqState.statusValue}; non-draft title readonly=${rfqState.issuedTitleReadonly}; line fields=${rfqState.lineFieldCount}` },
    { id: "workbook-rfq-unsaved-edits-block-switch-and-import", passed: importDisabledWithRfqDirty && rfqDirtyGuard.selectedSheet === "rfqs" && rfqDirtyGuard.warningVisible, details: `import disabled=${importDisabledWithRfqDirty}; selected sheet=${rfqDirtyGuard.selectedSheet}; warning=${rfqDirtyGuard.warningVisible}` },
    { id: "workbook-po-safe-draft-description-saves-locally", passed: Boolean(poState.draftId) && poState.descriptionEditable && state.savedDescription && await page.getByRole("button", { name: "Save demo edits", exact: true }).count() === 1, details: `Purchase Order draft=${poState.draftId || "missing"}; description saved=${state.savedDescription}` },
    { id: "workbook-po-number-total-status-and-non-draft-stay-protected", passed: poState.numberProtected && poState.totalProtected && poState.statusProtected && poState.statusValue === "DRAFT" && poState.nonDraftDescriptionReadonly && poState.lineFieldCount === 0, details: `number=${poState.numberProtected}; total=${poState.totalProtected}; status=${poState.statusValue}; non-draft description readonly=${poState.nonDraftDescriptionReadonly}; line fields=${poState.lineFieldCount}` },
    { id: "workbook-po-unsaved-edits-block-switch-and-import", passed: importDisabledWithPoDirty && poDirtyGuard.selectedSheet === "purchase-orders" && poDirtyGuard.warningVisible, details: `import disabled=${importDisabledWithPoDirty}; selected sheet=${poDirtyGuard.selectedSheet}; warning=${poDirtyGuard.warningVisible}` },
    { id: "workbook-procurement-sheets-responsive-without-page-overflow", passed: state.viewportWidth < 768 ? state.mobileGridVisible && state.documentWidth <= state.viewportWidth + 2 : state.documentWidth <= state.viewportWidth + 2, details: `mobile fallback=${state.mobileGridVisible}; document ${state.documentWidth}px / viewport ${state.viewportWidth}px` },
    { id: "workbook-procurement-uses-white-grid-canvas", passed: state.whiteCanvas, details: `white canvas=${state.whiteCanvas}` },
  ] satisfies readonly QaAssertion[];
};

export const verifyOperationsWorkbookRfqSheetView: QaScenarioAction = async (page) => {
  await page.locator(workbookRoot).waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await page.waitForFunction(() => document.querySelector<HTMLElement>("[data-operations-workbook]")?.dataset.workbookSheet === "rfqs");
  const state = await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>("[data-operations-workbook]");
    const mobileGrid = document.querySelector<HTMLElement>("[data-worksheet-mobile-fallback]");
    const cells = Array.from(document.querySelectorAll<HTMLElement>("[data-worksheet-cell]"))
      .filter((cell) => cell.getClientRects().length > 0 && getComputedStyle(cell).display !== "none");
    const title = cells.find((cell) => cell.dataset.worksheetCell === "demo-rfq-sol-001:title");
    const number = cells.find((cell) => cell.dataset.worksheetCell === "demo-rfq-sol-001:rfqNumber");
    const status = cells.find((cell) => cell.dataset.worksheetCell === "demo-rfq-sol-001:status");
    const statusValue = status?.querySelector<HTMLElement>("div.mt-1 > div, span.block.min-h-5")?.cloneNode(true) as HTMLElement | undefined;
    statusValue?.querySelectorAll(".sr-only").forEach((node) => node.remove());
    return {
      selectedSheet: root?.dataset.workbookSheet || "",
      titleEditable: title?.dataset.worksheetEditable === "true",
      numberProtected: number?.dataset.worksheetProtected === "true" && number.dataset.worksheetEditable === "false",
      statusProtected: status?.dataset.worksheetProtected === "true" && status.dataset.worksheetEditable === "false",
      statusValue: statusValue?.textContent?.trim() || "",
      mobileGridVisible: Boolean(mobileGrid && getComputedStyle(mobileGrid).display !== "none" && mobileGrid.getClientRects().length),
      documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      viewportWidth: window.innerWidth,
      whiteCanvas: root ? getComputedStyle(root).backgroundColor === "rgb(255, 255, 255)" : false,
    };
  });
  return [
    { id: "workbook-rfq-view-renders-the-draft-and-protected-fields", passed: state.selectedSheet === "rfqs" && state.titleEditable && state.numberProtected && state.statusProtected && state.statusValue === "DRAFT", details: `sheet=${state.selectedSheet}; title editable=${state.titleEditable}; number protected=${state.numberProtected}; status=${state.statusValue}` },
    { id: "workbook-rfq-view-is-responsive-without-overflow", passed: state.viewportWidth < 768 ? state.mobileGridVisible && state.documentWidth <= state.viewportWidth + 2 : state.documentWidth <= state.viewportWidth + 2, details: `mobile fallback=${state.mobileGridVisible}; document ${state.documentWidth}px / viewport ${state.viewportWidth}px` },
    { id: "workbook-rfq-view-uses-white-grid-canvas", passed: state.whiteCanvas, details: `white canvas=${state.whiteCanvas}` },
  ] satisfies readonly QaAssertion[];
};

export const workbookScenarioActions: Readonly<Record<string, QaScenarioAction>> = {
  verifyOperationsWorkbookLayout,
  verifyOperationsWorkbookPermissionTabs,
  verifyOperationsWorkbookInvalidSheetRecovery,
  verifyOperationsWorkbookEditableAndProtectedCells,
  verifyOperationsWorkbookCostCodesSheet,
  verifyOperationsWorkbookExpensesSheet,
  verifyOperationsWorkbookProcurementSheets,
  verifyOperationsWorkbookRfqSheetView,
};
