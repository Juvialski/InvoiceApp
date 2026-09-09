export type QaDatabaseOperation = "push" | "reset";

export interface QaDatabaseTargetInput {
  environment?: unknown;
  deploymentId?: unknown;
  targetProjectRef?: unknown;
  expectedQaProjectRef?: unknown;
  linkedProjectRef?: unknown;
  productionProjectRef?: unknown;
  expectedDeploymentId?: unknown;
  confirmation?: unknown;
  operation: QaDatabaseOperation;
}

export interface QaDatabaseTargetValidation {
  valid: boolean;
  projectRef: string | null;
  errors: string[];
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

/**
 * Validate the explicit operator assertions used by the QA Supabase wrapper.
 * This function performs no network, database, or filesystem mutation.
 */
export function validateQaDatabaseTarget(input: QaDatabaseTargetInput): QaDatabaseTargetValidation {
  const errors: string[] = [];
  const environment = text(input.environment).toLowerCase();
  const deploymentId = text(input.deploymentId);
  const expectedQaProjectRef = text(input.expectedQaProjectRef).toLowerCase();
  const targetProjectRef = text(input.targetProjectRef || expectedQaProjectRef).toLowerCase();
  const linkedProjectRef = text(input.linkedProjectRef).toLowerCase();
  const productionProjectRef = text(input.productionProjectRef).toLowerCase();
  const expectedDeploymentId = text(input.expectedDeploymentId);
  const confirmation = text(input.confirmation);

  if (environment !== "qa") errors.push("QA database commands require HYDROQUALISENSE_ENVIRONMENT=qa.");
  if (!/^qa-[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/i.test(deploymentId)) errors.push("The deployment ID must identify a QA deployment with a qa- prefix (for example, qa-hydro-01).");
  if (expectedDeploymentId && deploymentId !== expectedDeploymentId) errors.push("The deployment ID does not match the expected protected QA deployment.");
  if (!expectedQaProjectRef) errors.push("Set HYDROQUALISENSE_QA_PROJECT_REF to the manually created QA project reference.");
  if (!targetProjectRef) errors.push("A QA Supabase project reference is required.");
  if (expectedQaProjectRef && targetProjectRef && expectedQaProjectRef !== targetProjectRef) errors.push("The requested project does not match HYDROQUALISENSE_QA_PROJECT_REF.");
  if (!linkedProjectRef) errors.push("Link this checkout to the intended QA project before running the command.");
  if (targetProjectRef && linkedProjectRef && targetProjectRef !== linkedProjectRef) errors.push("The linked Supabase project does not match the asserted QA project.");
  if (!productionProjectRef) errors.push("Set HYDROQUALISENSE_PRODUCTION_PROJECT_REF so the target can be proven non-production.");
  if (productionProjectRef && targetProjectRef === productionProjectRef) errors.push("The asserted QA project matches the configured production project; refusing to continue.");
  if (productionProjectRef && linkedProjectRef === productionProjectRef) errors.push("The linked Supabase project is the configured production project; refusing to continue.");
  if (input.operation === "push" && confirmation !== "QA_DATABASE_PUSH") errors.push("Confirm the QA migration push with --confirm-qa (QA_DATABASE_PUSH).");
  if (input.operation === "reset" && confirmation !== "QA_DATABASE_RESET") errors.push("Confirm the destructive QA reset with --confirm-qa-reset (QA_DATABASE_RESET).");

  return { valid: errors.length === 0, projectRef: targetProjectRef || null, errors };
}
