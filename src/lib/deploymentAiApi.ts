import { companyApiRequest } from "./companyApi.ts";
import { requireActiveCompanyId } from "./companyContext.ts";
import type { CompanyAiConfigMetadata, CompanyAiStatus, CompanyAiTestStatus } from "../server/ai/companyAiTypes.ts";

function normalizeMetadata(value: unknown, companyId: string): CompanyAiConfigMetadata {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const status = source.status === "ACTIVE" || source.status === "DISABLED" || source.status === "INVALID" || source.status === "NOT_CONFIGURED"
    ? source.status
    : "NOT_CONFIGURED" as CompanyAiStatus;
  const testStatus = source.lastTestStatus === "SUCCESS" || source.lastTestStatus === "INVALID_CREDENTIAL" || source.lastTestStatus === "QUOTA_LIMITED" || source.lastTestStatus === "PROVIDER_UNAVAILABLE" || source.lastTestStatus === "PROVIDER_ACCESS_DENIED" || source.lastTestStatus === "MODEL_UNAVAILABLE"
    ? source.lastTestStatus
    : "NOT_TESTED" as CompanyAiTestStatus;
  return {
    companyId,
    provider: "GEMINI",
    enabled: source.enabled === true,
    primaryModel: "gemini-3.5-flash-lite",
    fallbackModel: "gemini-3.7-flash",
    credentialConfigured: source.credentialConfigured === true,
    credentialLast4: typeof source.credentialLast4 === "string" ? source.credentialLast4.slice(-4) : undefined,
    credentialVersion: Number.isInteger(source.credentialVersion) ? Number(source.credentialVersion) : 0,
    status,
    lastTestedAt: typeof source.lastTestedAt === "string" ? source.lastTestedAt : undefined,
    lastTestStatus: testStatus,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : undefined,
  };
}

async function readResponse(response: Response, companyId: string) {
  let body: any = null;
  try { body = await response.json(); } catch { /* normalize below */ }
  if (!response.ok || body?.success === false) {
    if (response.status === 403) throw new Error("Initial deployment operator authorization is required.");
    if (response.status === 409) throw new Error("Initial deployment AI configuration is already complete. Use the platform maintenance workflow.");
    if (response.status >= 500) throw new Error("The deployment AI configuration service is temporarily unavailable. Try again later.");
    throw new Error(typeof body?.error === "string" && body.error.trim() ? body.error : "Deployment AI configuration failed safely.");
  }
  return normalizeMetadata(body?.data, companyId);
}

export async function loadDeploymentAiConfig(companyId = requireActiveCompanyId()) {
  const response = await companyApiRequest("/api/deployment/company-ai", { companyId });
  return readResponse(response, companyId);
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
  return readResponse(response, companyId);
}
