import { companyApiRequest } from "./companyApi.ts";
import type { CompanyAiConfigMetadata, CompanyAiStatus, CompanyAiTestStatus } from "../server/ai/companyAiTypes.ts";

function normalizedMetadata(value: unknown, companyId: string): CompanyAiConfigMetadata {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const status = source.status === "ACTIVE" || source.status === "DISABLED" || source.status === "INVALID" || source.status === "NOT_CONFIGURED" ? source.status : "NOT_CONFIGURED" as CompanyAiStatus;
  const testStatus = source.lastTestStatus === "SUCCESS" || source.lastTestStatus === "INVALID_CREDENTIAL" || source.lastTestStatus === "QUOTA_LIMITED" || source.lastTestStatus === "PROVIDER_UNAVAILABLE" || source.lastTestStatus === "PROVIDER_ACCESS_DENIED" || source.lastTestStatus === "MODEL_UNAVAILABLE" ? source.lastTestStatus : "NOT_TESTED" as CompanyAiTestStatus;
  return {
    companyId,
    provider: "GEMINI",
    enabled: source.enabled === true,
    primaryModel: source.primaryModel === "gemini-3.5-flash-lite" ? source.primaryModel : "gemini-3.5-flash-lite",
    fallbackModel: source.fallbackModel === "gemini-3.7-flash" ? source.fallbackModel : "gemini-3.7-flash",
    credentialConfigured: source.credentialConfigured === true,
    credentialLast4: typeof source.credentialLast4 === "string" ? source.credentialLast4.slice(-4) : undefined,
    credentialVersion: Number.isInteger(source.credentialVersion) ? Number(source.credentialVersion) : 0,
    status,
    lastTestedAt: typeof source.lastTestedAt === "string" ? source.lastTestedAt : undefined,
    lastTestStatus: testStatus,
    lastTestErrorCode: typeof source.testErrorCode === "string" ? source.testErrorCode : undefined,
    lastTestReference: typeof source.reference === "string" ? source.reference : undefined,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : undefined,
  };
}

function redactMessage(value: string, secret?: string) {
  const message = value.slice(0, 400);
  return secret && secret.length > 0 ? message.split(secret).join("[redacted]") : message;
}

function requestErrorMessage(response: Response, body: any, secret?: string) {
  if (typeof body?.error === "string" && body.error.trim()) return redactMessage(body.error, secret);
  if (response.status === 401 || response.status === 403) return "You are not authorized to manage this company’s AI configuration.";
  if (response.status === 404) return "AI configuration is not available for this company.";
  if (response.status >= 500) return "The AI configuration service is temporarily unavailable. Try again later.";
  return "AI configuration request failed safely. Check the company and try again.";
}

async function requestAiConfig(companyId: string, path: string, init: RequestInit = {}, secret?: string) {
  const response = await companyApiRequest(path, { ...init, companyId });
  let body: any = null;
  try { body = await response.json(); } catch { /* normalize below */ }
  if (!response.ok || body?.success === false) {
    throw new Error(requestErrorMessage(response, body, secret));
  }
  return normalizedMetadata(body?.data, companyId);
}

function aiPath(companyId: string, suffix = "") {
  return `/api/platform/companies/${encodeURIComponent(companyId)}/ai-config${suffix}`;
}

export function loadCompanyAiConfig(companyId: string) {
  return requestAiConfig(companyId, aiPath(companyId));
}

export function saveCompanyGeminiKey(companyId: string, apiKey: string) {
  const normalizedKey = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!normalizedKey) return Promise.reject(new Error("Gemini API key cannot be empty."));
  return requestAiConfig(companyId, aiPath(companyId, "/gemini"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: normalizedKey }),
  }, normalizedKey);
}

export function testCompanyGeminiKey(companyId: string) {
  return requestAiConfig(companyId, aiPath(companyId, "/gemini/test"), { method: "POST" });
}

export function disableCompanyGemini(companyId: string) {
  return requestAiConfig(companyId, aiPath(companyId, "/gemini/disable"), { method: "POST" });
}

export function enableCompanyGemini(companyId: string) {
  return requestAiConfig(companyId, aiPath(companyId, "/gemini/enable"), { method: "POST" });
}

export function removeCompanyGeminiKey(companyId: string) {
  return requestAiConfig(companyId, aiPath(companyId, "/gemini"), { method: "DELETE" });
}
