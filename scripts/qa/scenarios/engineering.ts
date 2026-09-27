import type { QaAssertion, QaScenarioAction } from "../structuredEvidence.ts";
import { READY_TIMEOUT_MS, waitForVisible } from "./shared.ts";

export const openDemoDrawingPreview: QaScenarioAction = async (page) => {
  await page.getByRole("button", { name: "Open original demo drawing", exact: true }).first().click();
  await waitForVisible(page, '[aria-label="Demo drawing preview"]');
  const count = await page.locator('[aria-label="Demo drawing preview"]').count();
  return [{ id: "blueprint-viewer-visible", passed: count === 1, details: `demo drawing preview panels: ${count}` } satisfies QaAssertion];
};
export const verifyRfiMissingRecordRecovery: QaScenarioAction = async (page) => {
  await page.locator("text=RFI not available").first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const unavailable = await page.locator("text=RFI not available").count();
  const returnToRegister = await page.getByRole("button", { name: "Return to register", exact: true }).count();
  return [
    { id: "rfi-missing-record-recovery-visible", passed: unavailable > 0, details: `RFI unavailable labels: ${unavailable}` },
    { id: "rfi-missing-record-return-visible", passed: returnToRegister === 1, details: `Return-to-register controls: ${returnToRegister}` },
  ] satisfies readonly QaAssertion[];
};
export const verifySubmittalMissingRecordRecovery: QaScenarioAction = async (page) => {
  await page.locator("text=Submittal not available").first().waitFor({ state: "visible", timeout: READY_TIMEOUT_MS });
  const unavailable = await page.locator("text=Submittal not available").count();
  const returnToRegister = await page.getByRole("button", { name: "Return to register", exact: true }).count();
  return [
    { id: "submittal-missing-record-recovery-visible", passed: unavailable > 0, details: `Submittal unavailable labels: ${unavailable}` },
    { id: "submittal-missing-record-return-visible", passed: returnToRegister === 1, details: `Return-to-register controls: ${returnToRegister}` },
  ] satisfies readonly QaAssertion[];
};

export const engineeringScenarioActions: Readonly<Record<string, QaScenarioAction>> = {
  openDemoDrawingPreview,
  verifyRfiMissingRecordRecovery,
  verifySubmittalMissingRecordRecovery,
};
