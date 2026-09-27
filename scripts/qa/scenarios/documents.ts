import type { QaAssertion, QaScenarioAction } from "../structuredEvidence.ts";
import { waitForHeading, waitForVisible } from "./shared.ts";

export const verifyDocumentsWorkspace: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Documents");
  const workspace = await page.locator('[data-documents-workspace]').count();
  const entries = await page.locator('[data-document-register-entry]').count();
  const ownerLinks = await page.getByRole("button", { name: "Open owning record", exact: true }).count();
  const libraryTab = await page.locator('[data-document-center-view="library"][aria-selected="true"]').count();
  const createTab = await page.getByRole("tab", { name: /Create/ }).count();
  const templatesTab = await page.getByRole("tab", { name: /Templates/ }).count();
  return [
    { id: "documents-workspace-visible", passed: workspace === 1, details: `Documents workspace surfaces: ${workspace}` },
    { id: "documents-register-populated", passed: entries > 0, details: `document register entries: ${entries}` },
    { id: "documents-owner-navigation-visible", passed: ownerLinks > 0, details: `owner navigation controls: ${ownerLinks}` },
    { id: "documents-library-default-visible", passed: libraryTab === 1, details: `selected Library tabs: ${libraryTab}` },
    { id: "documents-create-view-link-visible", passed: createTab === 1, details: `Create tabs: ${createTab}` },
    { id: "documents-templates-view-link-visible", passed: templatesTab === 1, details: `Templates tabs: ${templatesTab}` },
  ] satisfies readonly QaAssertion[];
};
export const verifyManagedDocumentDetail: QaScenarioAction = async (page) => {
  await waitForVisible(page, '[data-managed-document-detail="true"]');
  await waitForHeading(page, "Warranty Certificate · Quezon City Warehouse");
  const detail = await page.locator('[data-managed-document-detail="true"]').count();
  const history = await page.getByRole("heading", { name: "Version history", exact: true }).count();
  const versionTwo = await page.locator("text=Version 2 · NGL-WHX-warranty-revised.pdf · Current").count();
  const versionOne = await page.locator("text=Version 1 · NGL-WHX-warranty.pdf").count();
  const openCurrent = await page.getByRole("button", { name: "Open current file", exact: true }).count();
  return [
    { id: "managed-document-detail-visible", passed: detail === 1, details: `managed detail surfaces: ${detail}` },
    { id: "managed-document-version-history-visible", passed: history === 1 && versionTwo === 1 && versionOne === 1, details: `history/current/older rows: ${history}/${versionTwo}/${versionOne}` },
    { id: "managed-document-current-file-action-visible", passed: openCurrent === 1, details: `Open current file controls: ${openCurrent}` },
  ] satisfies readonly QaAssertion[];
};
export const verifyManagedArtifactDetail: QaScenarioAction = async (page) => {
  await waitForVisible(page, '[data-managed-document-detail="true"]');
  await waitForHeading(page, "Purchase Order PO-2026-017 (PDF)");
  const provenance = await page.locator("text=Generated source and template provenance").count();
  const source = await page.locator("text=PURCHASE_ORDER · PO-2026-017").count();
  const archive = await page.getByRole("button", { name: "Archive", exact: true }).count();
  const versionUpload = await page.locator('input[type="file"]').count();
  return [
    { id: "managed-artifact-provenance-visible", passed: provenance === 1 && source === 1, details: `provenance/source rows: ${provenance}/${source}` },
    { id: "managed-artifact-remains-read-only", passed: archive === 0 && versionUpload === 0, details: `archive/file-upload controls: ${archive}/${versionUpload}` },
  ] satisfies readonly QaAssertion[];
};
export const verifyDocumentsCreateWorkspace: QaScenarioAction = async (page) => {
  await page.getByRole("tab", { name: /Create/ }).click();
  await waitForVisible(page, '[data-document-create-view]');
  const workspace = await page.locator('[data-document-create-view]').count();
  const availableOptions = await page.locator('[data-document-create-option]').count();
  const managedTemplateCreate = await page.locator('[data-managed-document-create]').count();
  const businessLabels = await page.locator("text=Purchase Order").count();
  return [
    { id: "documents-create-view-visible", passed: workspace === 1, details: `Create view surfaces: ${workspace}` },
    { id: "documents-create-options-visible", passed: availableOptions > 0, details: `supported Create options: ${availableOptions}` },
    { id: "documents-create-business-label-visible", passed: businessLabels > 0, details: `Purchase Order labels: ${businessLabels}` },
    { id: "documents-create-managed-template-surface-visible", passed: managedTemplateCreate === 1, details: `managed template Create surfaces: ${managedTemplateCreate}` },
  ] satisfies readonly QaAssertion[];
};
export const verifyDocumentsTemplatesWorkspace: QaScenarioAction = async (page) => {
  await page.getByRole("tab", { name: /Templates/ }).click();
  await waitForVisible(page, '[data-document-templates-view]');
  const view = await page.locator('[data-document-templates-view]').count();
  const templateSettings = await page.locator('[data-document-template-settings]').count();
  const documentTemplates = await page.locator("text=Document templates").count();
  const settingsLink = await page.getByRole("tab", { name: /Templates/ }).count();
  return [
    { id: "documents-templates-view-visible", passed: view === 1, details: `Templates view surfaces: ${view}` },
    { id: "documents-template-settings-visible", passed: templateSettings === 1, details: `template administration surfaces: ${templateSettings}` },
    { id: "documents-template-heading-visible", passed: documentTemplates > 0, details: `Document templates headings: ${documentTemplates}` },
    { id: "documents-template-tab-remains-visible", passed: settingsLink === 1, details: `Templates tabs after navigation: ${settingsLink}` },
  ] satisfies readonly QaAssertion[];
};
export const verifyDocumentsToEmailHandoff: QaScenarioAction = async (page) => {
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

export const documentsScenarioActions: Readonly<Record<string, QaScenarioAction>> = {
  verifyDocumentsCreateWorkspace,
  verifyDocumentsTemplatesWorkspace,
  verifyDocumentsToEmailHandoff,
  verifyDocumentsWorkspace,
  verifyManagedArtifactDetail,
  verifyManagedDocumentDetail,
};
