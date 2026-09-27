import type { QaAssertion, QaScenarioAction } from "../structuredEvidence.ts";
import { READY_TIMEOUT_MS, applyThemePreferenceForVisualQa, verifyEntityMediaThumbnails, waitForHeading, waitForVisible } from "./shared.ts";

export const verifyWarehouseInventoryScreen: QaScenarioAction = async (page) => {
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
export const verifyWarehouseItemWorksheetCreate: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.locator('[data-worksheet-responsive-surface="warehouse-item-master"]').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const editor = await page.locator('[data-worksheet-responsive-surface="warehouse-item-master"] [data-worksheet-editor="true"]').count();
  const addRow = await page.locator('[data-worksheet-responsive-surface="warehouse-item-master"] [data-worksheet-add-row="true"]').count();
  await page.getByRole("button", { name: "Add row", exact: true }).click();
  const stagedRows = await page.locator('[data-worksheet-responsive-surface="warehouse-item-master"] [data-worksheet-row-key]').count();
  await page.getByRole("button", { name: "Save items", exact: true }).click();
  await page.locator('[data-worksheet-responsive-surface="warehouse-item-master"] [data-worksheet-state="error"]').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const errors = await page.locator('[data-worksheet-responsive-surface="warehouse-item-master"] [data-worksheet-state="error"]').count();
  const mobileFallback = await page.locator('[data-worksheet-responsive-surface="warehouse-item-master"] [data-worksheet-mobile-fallback="true"]').count();
  return [
    { id: "warehouse-item-worksheet-create-visible", passed: editor === 1, details: `Warehouse item worksheet editors: ${editor}` } satisfies QaAssertion,
    { id: "warehouse-item-worksheet-add-row-visible", passed: addRow === 1 && stagedRows > 1, details: `add-row controls: ${addRow}; staged rows: ${stagedRows}` } satisfies QaAssertion,
    { id: "warehouse-item-worksheet-validation-visible", passed: errors > 0, details: `validation error cells: ${errors}` } satisfies QaAssertion,
    { id: "warehouse-item-worksheet-mobile-fallback-visible", passed: mobileFallback === 1, details: `mobile fallbacks: ${mobileFallback}` } satisfies QaAssertion,
  ];
};
export const verifyWarehouseItemWorksheetEdit: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await page.locator('[data-worksheet-responsive-surface="warehouse-item-master"]').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const editableNames = await page.locator('[data-worksheet-responsive-surface="warehouse-item-master"] [data-worksheet-cell$=":itemName"][data-worksheet-editable="true"]').count();
  const protectedBalances = await page.locator('[data-worksheet-responsive-surface="warehouse-item-master"] [data-worksheet-cell$=":onHandQuantity"][data-worksheet-protected="true"]').count();
  const protectedMovements = await page.locator('[data-worksheet-responsive-surface="warehouse-item-master"] [data-worksheet-cell$=":movementCount"][data-worksheet-protected="true"]').count();
  const protectedStatuses = await page.locator('[data-worksheet-responsive-surface="warehouse-item-master"] [data-worksheet-cell$=":status"][data-worksheet-protected="true"]').count();
  return [
    { id: "warehouse-item-worksheet-edit-visible", passed: editableNames > 0, details: `editable item-name cells: ${editableNames}` } satisfies QaAssertion,
    { id: "warehouse-item-worksheet-protected-balance-visible", passed: protectedBalances > 0 && protectedMovements > 0, details: `protected balance cells: ${protectedBalances}; movement cells: ${protectedMovements}` } satisfies QaAssertion,
    { id: "warehouse-item-worksheet-status-protected", passed: protectedStatuses > 0, details: `protected status cells: ${protectedStatuses}` } satisfies QaAssertion,
  ];
};
export const verifyEquipmentRegistryScreen: QaScenarioAction = async (page) => {
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
export const verifyCanonicalEquipmentWorksheetCreate: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: "Add Equipment", exact: true }).click();
  await page.locator('[data-worksheet-responsive-surface="canonical-equipment-master"]').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const editor = await page.locator('[data-worksheet-responsive-surface="canonical-equipment-master"] [data-worksheet-editor="true"]').count();
  const addRow = await page.locator('[data-worksheet-responsive-surface="canonical-equipment-master"] [data-worksheet-add-row="true"]').count();
  const protectedLifecycle = await page.locator('[data-worksheet-responsive-surface="canonical-equipment-master"] [data-worksheet-cell$=":lifecycleStatus"][data-worksheet-protected="true"]').count();
  const protectedAssignments = await page.locator('[data-worksheet-responsive-surface="canonical-equipment-master"] [data-worksheet-cell$=":currentState"][data-worksheet-protected="true"]').count();
  const mobileFallback = await page.locator('[data-worksheet-responsive-surface="canonical-equipment-master"] [data-worksheet-mobile-fallback="true"]').count();
  return [
    { id: "canonical-equipment-worksheet-create-visible", passed: editor === 1, details: `Equipment worksheet editors: ${editor}` } satisfies QaAssertion,
    { id: "canonical-equipment-worksheet-add-row-visible", passed: addRow === 1, details: `add-row controls: ${addRow}` } satisfies QaAssertion,
    { id: "canonical-equipment-worksheet-lifecycle-protected", passed: protectedLifecycle > 0, details: `protected lifecycle cells: ${protectedLifecycle}` } satisfies QaAssertion,
    { id: "canonical-equipment-worksheet-state-protected", passed: protectedAssignments > 0, details: `protected current-state cells: ${protectedAssignments}` } satisfies QaAssertion,
    { id: "canonical-equipment-worksheet-mobile-fallback-visible", passed: mobileFallback === 1, details: `mobile fallbacks: ${mobileFallback}` } satisfies QaAssertion,
  ];
};
export const verifyCanonicalEquipmentWorksheetEdit: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await page.locator('[data-worksheet-responsive-surface="canonical-equipment-master"]').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const editableNames = await page.locator('[data-worksheet-responsive-surface="canonical-equipment-master"] [data-worksheet-cell$=":equipmentName"][data-worksheet-editable="true"]').count();
  const protectedLifecycle = await page.locator('[data-worksheet-responsive-surface="canonical-equipment-master"] [data-worksheet-cell$=":lifecycleStatus"][data-worksheet-protected="true"]').count();
  const protectedProjects = await page.locator('[data-worksheet-responsive-surface="canonical-equipment-master"] [data-worksheet-cell$=":currentProjectId"][data-worksheet-protected="true"]').count();
  const protectedAssignmentIds = await page.locator('[data-worksheet-responsive-surface="canonical-equipment-master"] [data-worksheet-cell$=":currentAssignmentId"][data-worksheet-protected="true"]').count();
  return [
    { id: "canonical-equipment-worksheet-edit-visible", passed: editableNames > 0, details: `editable equipment-name cells: ${editableNames}` } satisfies QaAssertion,
    { id: "canonical-equipment-worksheet-lifecycle-stays-protected", passed: protectedLifecycle > 0, details: `protected lifecycle cells: ${protectedLifecycle}` } satisfies QaAssertion,
    { id: "canonical-equipment-worksheet-assignment-stays-protected", passed: protectedProjects > 0 && protectedAssignmentIds > 0, details: `protected project cells: ${protectedProjects}; assignment cells: ${protectedAssignmentIds}` } satisfies QaAssertion,
  ];
};
export const verifyMaterialsEquipmentBrowse: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Materials & Equipment");
  const surface = await page.locator('[data-phase3b="materials-equipment"]').count();
  const materialRows = await page.locator('[data-phase3b="materials-equipment"] [class*="border-b"]').count();
  const receiptsBoundary = await page.locator("text=Formal receipts remain authoritative").count();
  return [
    { id: "materials-equipment-browse-surface-visible", passed: surface === 1, details: `materials/equipment surfaces: ${surface}` } satisfies QaAssertion,
    { id: "materials-equipment-browse-rows-visible", passed: materialRows > 0, details: `browse row regions: ${materialRows}` } satisfies QaAssertion,
    { id: "materials-equipment-receipt-boundary-visible", passed: receiptsBoundary > 0, details: `receipt boundary labels: ${receiptsBoundary}` } satisfies QaAssertion,
  ] satisfies readonly QaAssertion[];
};
export const verifyMaterialWorksheetCreate: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Materials & Equipment");
  await page.getByRole("button", { name: "Add material", exact: true }).click();
  await page.locator('[data-worksheet-responsive-surface="project-materials"]').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const editor = await page.locator('[data-worksheet-responsive-surface="project-materials"] [data-worksheet-editor="true"]').count();
  const addRow = await page.locator('[data-worksheet-responsive-surface="project-materials"] [data-worksheet-add-row="true"]').count();
  const mobileFallback = await page.locator('[data-worksheet-responsive-surface="project-materials"] [data-worksheet-mobile-fallback="true"]').count();
  return [
    { id: "material-worksheet-create-visible", passed: editor === 1, details: `material worksheet editors: ${editor}` } satisfies QaAssertion,
    { id: "material-worksheet-add-row-visible", passed: addRow === 1, details: `material add-row controls: ${addRow}` } satisfies QaAssertion,
    { id: "material-worksheet-mobile-fallback-visible", passed: mobileFallback === 1, details: `material mobile fallbacks: ${mobileFallback}` } satisfies QaAssertion,
  ] satisfies readonly QaAssertion[];
};
export const verifyMaterialWorksheetValidation: QaScenarioAction = async (page) => {
  await verifyMaterialWorksheetCreate(page);
  await page.getByRole("button", { name: "Save materials", exact: true }).click();
  await page.locator('[data-worksheet-responsive-surface="project-materials"] [data-worksheet-state="error"]').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const errors = await page.locator('[data-worksheet-responsive-surface="project-materials"] [data-worksheet-state="error"]').count();
  return [{ id: "material-worksheet-validation-visible", passed: errors > 0, details: `material worksheet error cells: ${errors}` } satisfies QaAssertion];
};
export const verifyMaterialWorksheetEdit: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Materials & Equipment");
  await page.locator('[data-phase3b="materials-equipment"] button:has-text("Edit")').first().click();
  await page.locator('[data-worksheet-responsive-surface="project-materials"]').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const editableNames = await page.locator('[data-worksheet-responsive-surface="project-materials"] [data-worksheet-cell$=":materialName"][data-worksheet-editable="true"]').count();
  const boundaryText = await page.locator("text=PO receiving and warehouse on-hand remain protected").count();
  return [
    { id: "material-worksheet-edit-visible", passed: editableNames > 0, details: `editable material-name cells: ${editableNames}` } satisfies QaAssertion,
    { id: "material-worksheet-protected-boundary-visible", passed: boundaryText > 0, details: `protected boundary notes: ${boundaryText}` } satisfies QaAssertion,
  ] satisfies readonly QaAssertion[];
};
export const verifyEquipmentWorksheetCreate: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Materials & Equipment");
  await page.getByRole("button", { name: "Equipment", exact: true }).first().click();
  await page.getByRole("button", { name: "Add equipment", exact: true }).click();
  await page.locator('[data-worksheet-responsive-surface="project-equipment"]').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const editor = await page.locator('[data-worksheet-responsive-surface="project-equipment"] [data-worksheet-editor="true"]').count();
  const canonicalIdentity = await page.locator('[data-worksheet-responsive-surface="project-equipment"] [data-worksheet-cell$=":canonicalEquipmentId"][data-worksheet-protected="true"]').count();
  return [
    { id: "equipment-worksheet-create-visible", passed: editor === 1, details: `equipment worksheet editors: ${editor}` } satisfies QaAssertion,
    { id: "equipment-canonical-identity-protected", passed: canonicalIdentity > 0, details: `canonical identity cells: ${canonicalIdentity}` } satisfies QaAssertion,
  ] satisfies readonly QaAssertion[];
};
export const verifyEquipmentWorksheetEdit: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Materials & Equipment");
  await page.getByRole("button", { name: "Equipment", exact: true }).first().click();
  await page.locator('[data-phase3b="materials-equipment"] button:has-text("Edit")').first().click();
  await page.locator('[data-worksheet-responsive-surface="project-equipment"]').first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const editableDates = await page.locator('[data-worksheet-responsive-surface="project-equipment"] [data-worksheet-cell$=":assignmentStart"][data-worksheet-editable="true"]').count();
  const mobileFallback = await page.locator('[data-worksheet-responsive-surface="project-equipment"] [data-worksheet-mobile-fallback="true"]').count();
  return [
    { id: "equipment-worksheet-edit-visible", passed: editableDates > 0, details: `editable project-start cells: ${editableDates}` } satisfies QaAssertion,
    { id: "equipment-worksheet-mobile-fallback-visible", passed: mobileFallback === 1, details: `equipment mobile fallbacks: ${mobileFallback}` } satisfies QaAssertion,
  ] satisfies readonly QaAssertion[];
};
export const verifyEquipmentMediaLight: QaScenarioAction = async (page) => [
  ...(await applyThemePreferenceForVisualQa(page, "light")),
  ...(await verifyEntityMediaThumbnails(page, "equipment")),
];
export const verifyEquipmentMediaDark: QaScenarioAction = async (page) => [
  ...(await applyThemePreferenceForVisualQa(page, "dark")),
  ...(await verifyEntityMediaThumbnails(page, "equipment")),
];
export const verifyMaterialMediaDark: QaScenarioAction = async (page) => [
  ...(await applyThemePreferenceForVisualQa(page, "dark")),
  ...(await verifyEntityMediaThumbnails(page, "material")),
];
export const verifyMaterialMediaLight: QaScenarioAction = async (page) => [
  ...(await applyThemePreferenceForVisualQa(page, "light")),
  ...(await verifyEntityMediaThumbnails(page, "material")),
];

export const inventoryScenarioActions: Readonly<Record<string, QaScenarioAction>> = {
  verifyCanonicalEquipmentWorksheetCreate,
  verifyCanonicalEquipmentWorksheetEdit,
  verifyEquipmentMediaDark,
  verifyEquipmentMediaLight,
  verifyEquipmentRegistryScreen,
  verifyEquipmentWorksheetCreate,
  verifyEquipmentWorksheetEdit,
  verifyMaterialMediaDark,
  verifyMaterialMediaLight,
  verifyMaterialWorksheetCreate,
  verifyMaterialWorksheetEdit,
  verifyMaterialWorksheetValidation,
  verifyMaterialsEquipmentBrowse,
  verifyWarehouseInventoryScreen,
  verifyWarehouseItemWorksheetCreate,
  verifyWarehouseItemWorksheetEdit,
};
