import { companyApiRequest } from "./companyApi.ts";
import { requireActiveCompanyId } from "./companyContext.ts";

export type EmailProviderUiStatus = "NOT_CONFIGURED" | "SENDER_SETUP_REQUIRED" | "READY" | "CONNECTION_PROBLEM";

export interface EmailProviderStatus {
  readonly status: EmailProviderUiStatus;
  readonly providerId?: "BREVO";
  readonly providerLabel?: "Brevo";
  readonly senderEmail?: string;
  readonly senderName?: string;
  readonly message: string;
}

const DEFAULT_STATUS: EmailProviderStatus = {
  status: "CONNECTION_PROBLEM",
  message: "Email provider status is unavailable.",
};

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "";
}

function email(value: unknown) {
  const normalized = text(value, 320).toLowerCase();
  return /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(normalized) ? normalized : "";
}

export function parseEmailProviderStatus(value: unknown): EmailProviderStatus {
  const row = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const rawStatus = text(row.status, 40).toUpperCase();
  const allowed = rawStatus === "NOT_CONFIGURED" || rawStatus === "SENDER_SETUP_REQUIRED" || rawStatus === "READY" || rawStatus === "CONNECTION_PROBLEM";
  if (!allowed) return DEFAULT_STATUS;
  const status = rawStatus as EmailProviderUiStatus;
  if (status !== "NOT_CONFIGURED" && text(row.providerId, 20).toUpperCase() !== "BREVO") return DEFAULT_STATUS;
  return {
    status,
    ...(status !== "NOT_CONFIGURED" ? { providerId: "BREVO" as const, providerLabel: "Brevo" as const } : {}),
    ...(email(row.senderEmail) ? { senderEmail: email(row.senderEmail) } : {}),
    ...(text(row.senderName, 120) ? { senderName: text(row.senderName, 120) } : {}),
    message: text(row.message, 300) || DEFAULT_STATUS.message,
  };
}

export async function loadEmailProviderStatus(): Promise<EmailProviderStatus> {
  try {
    const response = await companyApiRequest("/api/messaging/status", { companyId: requireActiveCompanyId() });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success !== true) return DEFAULT_STATUS;
    return parseEmailProviderStatus(payload.data?.email);
  } catch {
    return DEFAULT_STATUS;
  }
}
