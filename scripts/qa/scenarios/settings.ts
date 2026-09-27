import type { QaAssertion, QaScenarioAction } from "../structuredEvidence.ts";

export const verifySettingsScreen: QaScenarioAction = async (page) => {
  const settingsHeading = await page.getByRole("heading", { name: "Operational settings", exact: true }).count();
  const regionalPreferences = await page.getByRole("heading", { name: "Regional display preferences", exact: true }).count();
  const roadmapHeading = await page.getByRole("heading", { name: "Hydroqualisense Features & Roadmap", exact: true }).count();
  const plannedWorkerRegistration = await page.locator('[data-product-feature-id="worker-registration"][data-product-feature-status="PLANNED"]').count();
  const futureFaceAttendance = await page.locator('[data-product-feature-id="face-recognition-attendance"][data-product-feature-status="FUTURE_DESIGN"]').count();
  const internalFeatureRegistry = await page.locator('[aria-label="Internal feature registry"]').count();
  const templateLink = await page.getByRole("button", { name: "Manage Document Templates", exact: true }).count();
  const fullTemplateSurface = await page.locator('[data-document-template-settings]').count();
  return [
    { id: "settings-heading-visible", passed: settingsHeading === 1, details: `settings headings: ${settingsHeading}` },
    { id: "regional-preferences-visible", passed: regionalPreferences === 1, details: `regional preference headings: ${regionalPreferences}` },
    { id: "client-roadmap-visible", passed: roadmapHeading === 1, details: `client roadmap headings: ${roadmapHeading}` },
    { id: "planned-worker-registration-visible", passed: plannedWorkerRegistration === 1, details: `Worker Registration cards: ${plannedWorkerRegistration}` },
    { id: "future-face-attendance-visible", passed: futureFaceAttendance === 1, details: `Future / Design Stage cards: ${futureFaceAttendance}` },
    { id: "internal-feature-registry-hidden", passed: internalFeatureRegistry === 0, details: `internal feature registry panels: ${internalFeatureRegistry}` },
    { id: "settings-template-link-visible", passed: templateLink === 1, details: `template navigation links: ${templateLink}` },
    { id: "settings-full-template-surface-relocated", passed: fullTemplateSurface === 0, details: `full template panels in Settings: ${fullTemplateSurface}` },
  ] satisfies readonly QaAssertion[];
};

export const settingsScenarioActions: Readonly<Record<string, QaScenarioAction>> = {
  verifySettingsScreen,
};
