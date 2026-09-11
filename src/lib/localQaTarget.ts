export const LOCAL_QA_PROJECT_REF = "vrpuznofrntyqsbugrib";
export const LOCAL_QA_PRODUCTION_PROJECT_REF = "qijjshdwiylojvqojxyz";
export const LOCAL_QA_DEPLOYMENT_ID = "local-qa-harness";

export interface LocalQaTargetInput {
  readonly supabaseUrl: string;
  readonly expectedQaProjectRef: string;
  readonly productionProjectRef: string;
  readonly environment: string;
  readonly deploymentId: string;
  readonly publishableKey: string;
}

export function projectRefFromSupabaseUrl(value: string) {
  const parsed = new URL(value.trim());
  const match = parsed.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
  if (parsed.protocol !== "https:" || !match) throw new Error("Local QA requires an HTTPS Supabase project URL.");
  return match[1].toLowerCase();
}

function legacySupabaseJwtRole(value: string) {
  const parts = value.trim().split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload.padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const decoded = globalThis.atob(padded);
    const parsed = JSON.parse(decoded) as { role?: unknown };
    return typeof parsed.role === "string" ? parsed.role.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Browser config may contain only a modern publishable key or a legacy anon JWT. */
export function isBrowserSafeSupabaseKey(value: string) {
  const key = value.trim();
  if (!key) return false;
  if (/^sb_publishable_/i.test(key)) return true;
  return legacySupabaseJwtRole(key) === "anon";
}

export function assertLocalQaTarget(input: LocalQaTargetInput) {
  const projectRef = projectRefFromSupabaseUrl(input.supabaseUrl);
  const expectedQaProjectRef = input.expectedQaProjectRef.trim().toLowerCase();
  const productionProjectRef = input.productionProjectRef.trim().toLowerCase();
  if (expectedQaProjectRef !== LOCAL_QA_PROJECT_REF) throw new Error("Local QA expected project reference is not the approved QA project.");
  if (productionProjectRef !== LOCAL_QA_PRODUCTION_PROJECT_REF) throw new Error("Local QA production collision guard is not configured with the approved production project.");
  if (!projectRef || projectRef !== expectedQaProjectRef) throw new Error("Local QA refuses a Supabase target other than the exact approved QA project.");
  if (String(projectRef) === productionProjectRef) throw new Error("Local QA refuses a QA/production project collision.");
  if (input.environment.trim().toLowerCase() !== "qa") throw new Error("Local QA requires HYDROQUALISENSE_ENVIRONMENT=qa.");
  if (input.deploymentId.trim() !== LOCAL_QA_DEPLOYMENT_ID) throw new Error("Local QA requires the local-qa-harness deployment identity.");
  if (!isBrowserSafeSupabaseKey(input.publishableKey)) throw new Error("Local QA browser configuration must use only a publishable or legacy anon key.");
  return { projectRef, productionProjectRef, deploymentId: input.deploymentId.trim() } as const;
}

/** Test the refusal path without making a network request or database write. */
export function assertProductionTargetIsRefused(input: LocalQaTargetInput) {
  try {
    assertLocalQaTarget({ ...input, supabaseUrl: `https://${input.productionProjectRef}.supabase.co` });
  } catch {
    return true;
  }
  throw new Error("Local QA production-target refusal did not trigger.");
}
