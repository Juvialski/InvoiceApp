export const DEPLOYMENT_ENVIRONMENTS = ["production", "qa", "staging", "demo"] as const;
export type DeploymentEnvironment = (typeof DEPLOYMENT_ENVIRONMENTS)[number];
export type RuntimeDeploymentEnvironment = DeploymentEnvironment | "unknown";

export interface DeploymentIdentity {
  environment: RuntimeDeploymentEnvironment;
  deploymentId: string | null;
  configurationVersion: string | null;
  publicFunnelEnabled: boolean;
  /** Sample invoice presets are never enabled by a production build. */
  sampleInvoicesEnabled: boolean;
  isQa: boolean;
}

function text(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function booleanValue(value: unknown) {
  return value === true || (typeof value === "string" && value.trim().toLowerCase() === "true");
}

function runtimeEnvironment(value: unknown): RuntimeDeploymentEnvironment {
  const normalized = text(value)?.toLowerCase();
  if (!normalized) return "production";
  return (DEPLOYMENT_ENVIRONMENTS as readonly string[]).includes(normalized)
    ? normalized as DeploymentEnvironment
    : "unknown";
}

function viteEnvironment(): Record<string, unknown> {
  return ((import.meta as ImportMeta & { env?: Record<string, unknown> }).env || {}) as Record<string, unknown>;
}

export function deploymentIdentityFromEnv(env: Readonly<Record<string, unknown>>): DeploymentIdentity {
  const environment = runtimeEnvironment(env.VITE_HYDROQUALISENSE_ENVIRONMENT);
  return {
    environment,
    deploymentId: text(env.VITE_HYDROQUALISENSE_DEPLOYMENT_ID),
    configurationVersion: text(env.VITE_HYDROQUALISENSE_CONFIGURATION_VERSION),
    publicFunnelEnabled: booleanValue(env.VITE_HYDROQUALISENSE_PUBLIC_FUNNEL_ENABLED),
    sampleInvoicesEnabled: environment === "qa" && booleanValue(env.VITE_ENABLE_SAMPLE_INVOICES),
    isQa: environment === "qa",
  };
}

export function currentDeploymentIdentity() {
  return deploymentIdentityFromEnv(viteEnvironment());
}
