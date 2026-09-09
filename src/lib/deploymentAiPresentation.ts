import type { CompanyAiConfigMetadata } from "../server/ai/companyAiTypes.ts";

export const DEPLOYMENT_AI_STATUS_UNAVAILABLE = "AI configuration status is temporarily unavailable.";

export type DeploymentAiConfigLoadState =
  | { kind: "loading" }
  | { kind: "loaded"; config: CompanyAiConfigMetadata }
  | { kind: "error"; message: string };

/**
 * A bootstrap form is a privileged, one-time action. A loading or failed
 * metadata request is never evidence that a deployment has no credential.
 * INVALID remains available only for the existing server-authorized recovery
 * path for an invalid initial credential.
 */
export function shouldShowDeploymentAiBootstrap(
  state: DeploymentAiConfigLoadState,
  canAttemptInitialBootstrap: boolean,
): boolean {
  if (!canAttemptInitialBootstrap || state.kind !== "loaded") return false;
  return (state.config.status === "NOT_CONFIGURED" && !state.config.credentialConfigured)
    || state.config.status === "INVALID";
}

export function deploymentAiStatusText(config: CompanyAiConfigMetadata): string {
  if (config.status === "ACTIVE" && config.lastTestStatus === "SUCCESS") return "Enabled and provider-validated";
  if (config.status === "ACTIVE") {
    return config.lastTestStatus === "PROVIDER_UNAVAILABLE"
      ? "Enabled; provider unavailable during last test"
      : "Enabled; provider test not completed";
  }
  if (config.status === "INVALID") return "Provider credential needs attention";
  if (config.status === "DISABLED") return "Disabled; deployment maintenance is required to change it";
  return "Not configured";
}

export function deploymentAiEnabledLabel(config: CompanyAiConfigMetadata): string {
  if (config.status === "ACTIVE" && config.enabled) return "Enabled";
  if (config.status === "DISABLED" || !config.enabled) return "Disabled";
  if (config.status === "INVALID") return "Needs attention";
  return "Not configured";
}

export function deploymentAiValidationLabel(config: CompanyAiConfigMetadata): string {
  if (config.lastTestStatus === "SUCCESS") return "Provider validated";
  if (config.lastTestStatus === "NOT_TESTED") return "Not tested";
  if (config.lastTestStatus === "PROVIDER_UNAVAILABLE") return "Provider unavailable during last test";
  if (config.lastTestStatus === "INVALID_CREDENTIAL") return "Credential rejected during last test";
  if (config.lastTestStatus === "QUOTA_LIMITED") return "Provider quota limited during last test";
  if (config.lastTestStatus === "PROVIDER_ACCESS_DENIED") return "Provider access denied during last test";
  if (config.lastTestStatus === "MODEL_UNAVAILABLE") return "Model unavailable during last test";
  return "Test result unavailable";
}
