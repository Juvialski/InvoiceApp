import { companyApiRequest } from "./companyApi.ts";
import { requireActiveCompanyId } from "./companyContext.ts";
import { normalizePhilippineMobileNumber, SMS_MAX_MESSAGE_LENGTH } from "./smsNumber.ts";

export type SmsProviderUiStatus = "NOT_CONFIGURED" | "CONFIGURED_UNVERIFIED" | "READY" | "DEGRADED" | "UNAVAILABLE";

export interface SmsProviderStatus {
  readonly status: SmsProviderUiStatus;
  readonly providerId?: string;
  readonly providerLabel?: string;
  readonly message?: string;
  readonly lastSeen?: string;
  readonly deviceId?: string;
  readonly deviceLabel?: string;
  readonly simNumber?: number;
  readonly simPhoneNumber?: string;
  readonly simCarrier?: string;
}

export interface SmsProviderOverview extends SmsProviderStatus {
  readonly activeProviderId?: string;
  readonly providers: readonly SmsProviderStatus[];
}

export interface SendSmsMessageInput {
  readonly destination: string;
  readonly message: string;
  readonly idempotencyKey: string;
}

export interface SmsSendResult {
  readonly status: "PENDING" | "ACCEPTED" | "SENT" | "DELIVERED" | "FAILED" | "CANCELLED" | "UNKNOWN";
  readonly providerId?: string;
  readonly providerMessageId?: string;
  readonly providerStatus?: string;
  readonly idempotent?: boolean;
  readonly reconciliationRequired?: boolean;
}

export class SmsSendError extends Error {
  readonly code?: string;
  readonly status: number;
  readonly reconciliationRequired: boolean;

  constructor(message: string, options: { code?: string; status?: number; reconciliationRequired?: boolean } = {}) {
    super(message);
    this.name = "SmsSendError";
    this.code = options.code;
    this.status = options.status || 503;
    this.reconciliationRequired = options.reconciliationRequired === true;
  }
}

function defaultProviderChoices(): readonly SmsProviderStatus[] {
  return [
    { status: "NOT_CONFIGURED", providerId: "ANDROID_SIM_GATEWAY", providerLabel: "Company SIM Gateway", message: "No Company SIM Gateway is configured for this deployment." },
    { status: "NOT_CONFIGURED", providerId: "PHILSMS", providerLabel: "PhilSMS", message: "No PhilSMS account is configured for this deployment." },
  ];
}

export async function loadSmsProviderStatus(): Promise<SmsProviderOverview> {
  const companyId = requireActiveCompanyId();
  try {
    const response = await companyApiRequest("/api/messaging/status", { companyId });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) throw new Error(payload.error || "SMS provider status is unavailable.");
    const sms = payload.data?.sms || {};
    const statusValue = typeof sms.status === "string" ? sms.status : "";
    const status: SmsProviderUiStatus = ["NOT_CONFIGURED", "CONFIGURED_UNVERIFIED", "READY", "DEGRADED"].includes(statusValue) ? statusValue as SmsProviderUiStatus : "NOT_CONFIGURED";
    const providers = Array.isArray(sms.providers) ? sms.providers.map((provider: unknown) => {
      const row = provider && typeof provider === "object" ? provider as Record<string, unknown> : {};
      const rowStatusValue = typeof row.status === "string" ? row.status : "";
      const rowStatus: SmsProviderUiStatus = ["NOT_CONFIGURED", "CONFIGURED_UNVERIFIED", "READY", "DEGRADED"].includes(rowStatusValue) ? rowStatusValue as SmsProviderUiStatus : "NOT_CONFIGURED";
      return {
        status: rowStatus,
        ...(typeof row.providerId === "string" ? { providerId: row.providerId } : {}),
        ...(typeof row.providerLabel === "string" ? { providerLabel: row.providerLabel } : {}),
        ...(typeof row.message === "string" ? { message: row.message } : {}),
        ...(typeof row.lastSeen === "string" ? { lastSeen: row.lastSeen } : {}),
        ...(typeof row.deviceId === "string" ? { deviceId: row.deviceId } : {}),
        ...(typeof row.deviceLabel === "string" ? { deviceLabel: row.deviceLabel } : {}),
        ...(Number.isInteger(row.simNumber) ? { simNumber: row.simNumber as number } : {}),
        ...(typeof row.simPhoneNumber === "string" ? { simPhoneNumber: row.simPhoneNumber } : {}),
        ...(typeof row.simCarrier === "string" ? { simCarrier: row.simCarrier } : {}),
      };
    }) : defaultProviderChoices();
    return {
      status,
      ...(typeof sms.providerId === "string" ? { providerId: sms.providerId } : {}),
      ...(typeof sms.providerLabel === "string" ? { providerLabel: sms.providerLabel } : {}),
      ...(typeof sms.message === "string" ? { message: sms.message } : {}),
      ...(typeof sms.activeProviderId === "string" ? { activeProviderId: sms.activeProviderId } : {}),
      providers,
    };
  } catch {
    return { status: "UNAVAILABLE", providers: defaultProviderChoices() };
  }
}

export async function sendSmsMessage(input: SendSmsMessageInput): Promise<SmsSendResult> {
  const destination = normalizePhilippineMobileNumber(input.destination);
  const message = input.message.trim();
  if (!message) throw new SmsSendError("Enter an SMS message before confirming the send.", { status: 400 });
  if (message.length > SMS_MAX_MESSAGE_LENGTH) throw new SmsSendError(`SMS messages are limited to ${SMS_MAX_MESSAGE_LENGTH} characters.`, { status: 400 });
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(input.idempotencyKey.trim())) throw new SmsSendError("The SMS send identity is invalid. Start a new draft before retrying.", { status: 400 });
  const companyId = requireActiveCompanyId();
  let response: Response;
  try {
    response = await companyApiRequest("/api/messaging/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      companyId,
      body: JSON.stringify({ destination, message, idempotencyKey: input.idempotencyKey.trim(), confirmed: true }),
    });
  } catch {
    throw new SmsSendError("SMS acceptance could not be confirmed. Check Sent / Delivery History before retrying.", { code: "SMS_SEND_RECONCILE_REQUIRED", reconciliationRequired: true });
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true) {
    const code = typeof payload.code === "string" ? payload.code : undefined;
    const reconciliationRequired = payload.data?.reconciliationRequired === true
      || code === "SMS_SEND_RECONCILE_REQUIRED"
      || (!code && response.status >= 500)
      || (response.ok && payload.success !== true);
    throw new SmsSendError(payload.error || "The SMS could not be sent safely.", { code, status: response.status, reconciliationRequired });
  }
  return payload.data as SmsSendResult;
}

export async function reconcileSmsDelivery(intentId: string): Promise<SmsSendResult> {
  const companyId = requireActiveCompanyId();
  const response = await companyApiRequest("/api/messaging/sms/reconcile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    companyId,
    body: JSON.stringify({ intentId }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success !== true) throw new SmsSendError(payload.error || "SMS status could not be reconciled safely.", { code: payload.code, status: response.status, reconciliationRequired: true });
  return payload.data as SmsSendResult;
}
