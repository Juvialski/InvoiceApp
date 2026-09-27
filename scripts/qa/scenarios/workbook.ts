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
    { id: "workbook-project-sheet-tab-visible", passed: tabCount === 1 && projectTabCount === 1, details: `authorized sheet tabs: ${tabCount}; Projects tabs: ${projectTabCount}` },
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
    { id: "workbook-permission-fixture-shows-projects-only", passed: tabs.length === 1 && tabs[0]?.label === "Projects" && tabs[0]?.selected && !tabs[0]?.disabled, details: `visible worksheet tabs: ${tabs.map((tab) => tab.label).join(", ") || "none"}` },
    { id: "workbook-unavailable-domain-names-not-rendered-as-tabs", passed: !route.workbookTabs.some((label) => /payroll|invoice|expense|procurement|warehouse|equipment|vendor/i.test(label)), details: `tab labels: ${route.workbookTabs.join(", ") || "none"}` },
    { id: "workbook-route-retains-one-enabled-sheet", passed: route.tabIds.length === 1 && route.tabIds[0] === "projects", details: `active sheet IDs: ${route.tabIds.join(", ") || "none"}` },
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
    { id: "workbook-invalid-sheet-does-not-render-hidden-tab", passed: state.tabLabels.length === 1 && !state.tabLabels.some((label) => /payroll/i.test(label)), details: `visible tabs: ${state.tabLabels.join(", ") || "none"}` },
  ] satisfies readonly QaAssertion[];
};

export const verifyOperationsWorkbookEditableAndProtectedCells: QaScenarioAction = async (page) => {
  await page.locator(workbookRoot).waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const editableCell = page.locator('[data-worksheet-editable="true"]:visible').first();
  await editableCell.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await editableCell.click();
  const editControl = page.locator('[data-worksheet-editable="true"]:visible input').first();
  await editControl.waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  await editControl.fill("Synthetic QA project name");
  await page.keyboard.press("Escape");

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
    { id: "workbook-lifecycle-status-remains-protected", passed: !statusState.editable && statusState.protected && statusState.readonly && statusState.editorCount === 0, details: `editable=${statusState.editable}; protected=${statusState.protected}; readonly=${statusState.readonly}; editors=${statusState.editorCount}` },
    { id: "workbook-edit-cancel-leaves-no-open-editor", passed: editableControlCount === 0, details: `visible project-name editors after Escape: ${editableControlCount}` },
  ] satisfies readonly QaAssertion[];
};

export const workbookScenarioActions: Readonly<Record<string, QaScenarioAction>> = {
  verifyOperationsWorkbookLayout,
  verifyOperationsWorkbookPermissionTabs,
  verifyOperationsWorkbookInvalidSheetRecovery,
  verifyOperationsWorkbookEditableAndProtectedCells,
};
