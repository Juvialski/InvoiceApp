import type { QaAssertion, QaScenarioAction } from "../structuredEvidence.ts";
import { waitForHeading, waitForVisible } from "./shared.ts";

export const verifyCashBrowseAndChoice: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Cash & Banking");
  const browseStage = await page.locator('[data-testid="cash-stage-browse"]').count();
  const chooseStage = await page.locator('[data-testid="cash-stage-choose"]').count();
  const intentionalChoice = await page.locator('[data-testid="cash-settlement-empty-selection"]').count();
  const reviewLinks = await page.getByRole("link", { name: "Review allocation", exact: true }).count();
  const queueConfirmButtons = await page.getByRole("button", { name: "Confirm match", exact: true }).count();
  if (reviewLinks > 0) {
    await page.getByRole("link", { name: "Review allocation", exact: true }).first().click();
    await waitForVisible(page, '[data-testid="cash-settlement-workspace"]');
  }
  const resultAfterReview = await page.locator('[data-testid="cash-settlement-result"]').count();
  return [
    { id: "cash-browse-stage-visible", passed: browseStage >= 1, details: `browse stage markers: ${browseStage}` },
    { id: "cash-choose-stage-visible", passed: chooseStage >= 1, details: `choose stage markers: ${chooseStage}` },
    { id: "cash-settlement-requires-intentional-choice", passed: intentionalChoice === 1, details: `intentional empty selection states: ${intentionalChoice}` },
    { id: "cash-queue-review-allocation-visible", passed: reviewLinks > 0, details: `non-mutating review links: ${reviewLinks}` },
    { id: "cash-queue-confirm-match-removed", passed: queueConfirmButtons === 0, details: `queue-level Confirm match buttons: ${queueConfirmButtons}` },
    { id: "cash-review-link-does-not-confirm", passed: resultAfterReview === 0, details: `settlement results after review navigation: ${resultAfterReview}` },
  ] satisfies readonly QaAssertion[];
};
export const verifyCashSettlementResult: QaScenarioAction = async (page) => {
  await waitForVisible(page, '[data-testid="cash-settlement-workspace"]');
  const reviewStage = await page.locator('[data-testid="cash-stage-review"]').count();
  const candidateCount = await page.locator('[data-testid="cash-settlement-candidate"]').count();
  const allocate = page.getByRole("button", { name: "Allocate", exact: true }).first();
  const allocateCount = await allocate.count();
  if (allocateCount === 1) await allocate.click();
  const confirm = page.getByRole("button", { name: "Confirm settlement", exact: true });
  const confirmCount = await confirm.count();
  if (allocateCount === 1 && confirmCount === 1) {
    await confirm.click();
    await waitForVisible(page, '[data-testid="cash-settlement-result"]');
  }
  const result = await page.locator('[data-testid="cash-settlement-result"]').count();
  const sourceUnchanged = await page.locator("text=The source record was not changed").count();
  const openTarget = await page.getByRole("link", { name: "Open target", exact: true }).count();
  return [
    { id: "cash-review-stage-visible", passed: reviewStage === 1, details: `review stage markers: ${reviewStage}` },
    { id: "cash-candidate-visible", passed: candidateCount > 0, details: `eligible candidate cards: ${candidateCount}` },
    { id: "cash-allocation-confirmed-explicitly", passed: allocateCount === 1 && confirmCount === 1, details: `allocate/confirm controls: ${allocateCount}/${confirmCount}` },
    { id: "cash-settlement-result-visible", passed: result === 1, details: `settlement result panels: ${result}` },
    { id: "cash-result-source-authority-visible", passed: sourceUnchanged > 0, details: `source-authority messages: ${sourceUnchanged}` },
    { id: "cash-result-open-target-visible", passed: openTarget > 0, details: `open-target links: ${openTarget}` },
  ] satisfies readonly QaAssertion[];
};
export const verifyCashTransferWorkflowSeparation: QaScenarioAction = async (page) => {
  await waitForHeading(page, "Cash & Banking");
  const transferWorkflow = await page.locator('[data-testid="cash-transfer-workflow"]').count();
  const transferConfirm = await page.getByRole("button", { name: "Confirm transfer", exact: true }).count();
  const transferReverse = await page.getByRole("button", { name: "Reverse transfer", exact: true }).count();
  const transferCandidates = await page.locator('[data-testid="cash-settlement-candidate"][data-target-type="TRANSFER"]').count();
  return [
    { id: "cash-transfer-workflow-visible", passed: transferWorkflow === 1, details: `dedicated transfer workflow regions: ${transferWorkflow}` },
    { id: "cash-transfer-confirmation-explicit", passed: transferConfirm > 0 || transferReverse > 0, details: `transfer confirm/reverse controls: ${transferConfirm}/${transferReverse}` },
    { id: "cash-transfer-not-operating-candidate", passed: transferCandidates === 0, details: `transfer candidates in operating allocation: ${transferCandidates}` },
  ] satisfies readonly QaAssertion[];
};
export const verifyCashExpenseTarget: QaScenarioAction = async (page) => {
  await waitForVisible(page, '[data-testid="cash-target-context"]');
  const context = await page.locator('[data-testid="cash-target-context"]').count();
  const requested = await page.locator("text=Requested target").count();
  const returnToExpense = await page.getByRole("link", { name: /Return to Expense/ }).count();
  if (returnToExpense === 1) {
    await page.getByRole("link", { name: /Return to Expense/ }).click();
    await waitForVisible(page, '[data-testid="expense-detail-panel"]');
  }
  const returnedExpense = await page.locator('[data-testid="expense-detail-panel"]').count();
  return [
    { id: "cash-expense-target-context-visible", passed: context === 1, details: `cash target contexts: ${context}` },
    { id: "cash-expense-target-prioritized", passed: requested >= 1, details: `requested-target badges: ${requested}` },
    { id: "cash-expense-return-link-visible", passed: returnToExpense === 1, details: `Expense return links: ${returnToExpense}` },
    { id: "cash-expense-returned-to-exact-expense", passed: returnedExpense === 1, details: `returned Expense panels: ${returnedExpense}` },
  ] satisfies readonly QaAssertion[];
};

export const cashScenarioActions: Readonly<Record<string, QaScenarioAction>> = {
  verifyCashBrowseAndChoice,
  verifyCashExpenseTarget,
  verifyCashSettlementResult,
  verifyCashTransferWorkflowSeparation,
};
