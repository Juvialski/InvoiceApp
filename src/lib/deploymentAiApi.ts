import { companyApiRequest } from "./companyApi.ts";
import { requireActiveCompanyId } from "./companyContext.ts";
import type { CompanyAiConfigMetadata, CompanyAiStatus, CompanyAiTestStatus } from "../server/ai/companyAiTypes.ts";
import { DEPLOYMENT_AI_STATUS_UNAVAILABLE } from "./deploymentAiPresentation.ts";

function normalizeMetadata(value: unknown, companyId: string): CompanyAiConfigMetadata {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const statusValue = source.status;
  const testStatusValue = source.lastTestStatus ?? source.last_test_status;
  const configuredValue = source.credentialConfigured ?? source.credential_configured;
  const status = statusValue === "ACTIVE" || statusValue === "DISABLED" || statusValue === "INVALID" || statusValue === "NOT_CONFIGURED"
    ? statusValue
    : "NOT_CONFIGURED" as CompanyAiStatus;
  const testStatus = testStatusValue === "SUCCESS" || testStatusValue === "INVALID_CREDENTIAL" || testStatusValue === "QUOTA_LIMITED" || testStatusValue === "PROVIDER_UNAVAILABLE" || testStatusValue === "PROVIDER_ACCESS_DENIED" || testStatusValue === "MODEL_UNAVAILABLE"
    ? testStatusValue
    : "NOT_TESTED" as CompanyAiTestStatus;
  return {
    companyId,
    provider: "GEMINI",
    enabled: source.enabled === true,
    primaryModel: "gemini-3.5-flash-lite",
    fallbackModel: "gemini-3.7-flash",
    credentialConfigured: configuredValue === true,
    credentialLast4: typeof (source.credentialLast4 ?? source.credential_last4) === "string" ? String(source.credentialLast4 ?? source.credential_last4).slice(-4) : undefined,
    credentialVersion: Number.isInteger(source.credentialVersion ?? source.credential_version) ? Number(source.credentialVersion ?? source.credential_version) : 0,
    status,
    bootstrapAuthorized: source.bootstrapAuthorized === true || source.bootstrap_authorized === true,
    lastTestedAt: typeof (source.lastTestedAt ?? source.last_tested_at) === "string" ? String(source.lastTestedAt ?? source.last_tested_at) : undefined,
    lastTestStatus: testStatus,
    updatedAt: typeof (source.updatedAt ?? source.updated_at) === "string" ? String(source.updatedAt ?? source.updated_at) : undefined,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export async function readDeploymentAiResponse(response: Response, companyId: string, operation: "load" | "bootstrap") {
  let body: any = null;
  try { body = await response.json(); } catch { /* normalize below */ }
  if (!response.ok || body?.success === false) {
    if (response.status === 403) {
      throw new Error(operation === "load" ? DEPLOYMENT_AI_STATUS_UNAVAILABLE : "Initial deployment operator authorization is required.");
    }
    if (response.status === 409) throw new Error("Initial deployment AI configuration is already complete. Use the platform maintenance workflow.");
    if (response.status >= 500) throw new Error("The deployment AI configuration service is temporarily unavailable. Try again later.");
    throw new Error(typeof body?.error === "string" && body.error.trim() ? body.error : "Deployment AI configuration failed safely.");
  }
  if (!isRecord(body?.data)) throw new Error(DEPLOYMENT_AI_STATUS_UNAVAILABLE);
  return normalizeMetadata(body?.data, companyId);
}

export async function loadDeploymentAiConfig(companyId = requireActiveCompanyId()) {
  const response = await companyApiRequest("/api/deployment/company-ai", { companyId });
  return readDeploymentAiResponse(response, companyId, "load");
}

export async function bootstrapDeploymentGeminiKey(companyId: string, apiKey: string, validate = true) {
  const normalizedKey = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!normalizedKey) throw new Error("Gemini API key cannot be empty.");
  const response = await companyApiRequest("/api/deployment/company-ai/gemini/bootstrap", {
    companyId,
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: normalizedKey, validate }),
  });
  return readDeploymentAiResponse(response, companyId, "bootstrap");
}
