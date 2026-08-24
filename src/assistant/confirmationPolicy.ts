import type { AssistantRiskTier } from "./assistantTypes.ts";

export const CONFIRMATION_REQUIRED: Readonly<Record<AssistantRiskTier, boolean>> = Object.freeze({
  READ: false,
  NAVIGATION: false,
  // A preview is read-only when returned by a read tool, but the current
  // workforce/payroll prepare tools create a persisted action that will write
  // on confirmation. Keep the button application-enforced.
  PREPARE: true,
  NORMAL_MUTATION: true,
  BULK_MUTATION: true,
  FINANCIAL_FINALIZATION: true,
});

export function requiresAssistantConfirmation(riskTier: AssistantRiskTier) {
  return CONFIRMATION_REQUIRED[riskTier];
}

export function confirmationLabel(riskTier: AssistantRiskTier) {
  if (riskTier === "FINANCIAL_FINALIZATION") return "Confirm final payroll action";
  if (riskTier === "BULK_MUTATION") return "Confirm bulk change";
  return "Confirm action";
}
