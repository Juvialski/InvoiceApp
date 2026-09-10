import { companyApiRequest } from "./companyApi.ts";
import { requireActiveCompanyId } from "./companyContext.ts";

export type SmsProviderUiStatus = "NOT_CONFIGURED" | "READY" | "UNAVAILABLE";

export interface SmsProviderStatus {
  readonly status: SmsProviderUiStatus;
  readonly providerId?: string;
  readonly providerLabel?: string;
}

export async function loadSmsProviderStatus(): Promise<SmsProviderStatus> {
  const companyId = requireActiveCompanyId();
  try {
    const response = await companyApiRequest("/api/messaging/status", { companyId });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) throw new Error(payload.error || "SMS provider status is unavailable.");
    const status = payload.data?.sms?.status === "READY" ? "READY" : "NOT_CONFIGURED";
    return {
      status,
      ...(typeof payload.data?.sms?.providerId === "string" ? { providerId: payload.data.sms.providerId } : {}),
      ...(typeof payload.data?.sms?.providerLabel === "string" ? { providerLabel: payload.data.sms.providerLabel } : {}),
    };
  } catch {
    return { status: "UNAVAILABLE" };
  }
}
