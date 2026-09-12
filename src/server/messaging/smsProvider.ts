import { createHash } from "node:crypto";
import { normalizePhilippineMobileNumber, SMS_MAX_MESSAGE_LENGTH } from "../../lib/smsNumber.ts";

export const SMS_PROVIDER_IDS = Object.freeze({
  androidSimGateway: "ANDROID_SIM_GATEWAY",
  philsms: "PHILSMS",
} as const);

export type SmsProviderId = (typeof SMS_PROVIDER_IDS)[keyof typeof SMS_PROVIDER_IDS];
export type SmsProviderStatus = "NOT_CONFIGURED" | "CONFIGURED_UNVERIFIED" | "READY" | "DEGRADED";
export type SmsDeliveryStatus = "PENDING" | "ACCEPTED" | "SENT" | "DELIVERED" | "FAILED" | "CANCELLED" | "UNKNOWN";

export interface SmsSendRequest {
  readonly destination: string;
  readonly message: string;
  readonly originator?: string;
  readonly idempotencyKey: string;
  readonly simNumber?: number;
  readonly deviceId?: string;
}

export interface SmsSendResult {
  readonly providerId: SmsProviderId;
  readonly providerMessageId?: string;
  readonly status: SmsDeliveryStatus;
  readonly providerStatus?: string;
  readonly safeMessage: string;
  readonly reconciliationRequired: boolean;
}

export interface SmsProviderStatusResult {
  readonly status: SmsProviderStatus;
  readonly providerId?: SmsProviderId;
  readonly providerLabel?: string;
  readonly message?: string;
  readonly lastSeen?: string;
  readonly deviceId?: string;
  readonly deviceLabel?: string;
  readonly simNumber?: number;
  readonly simPhoneNumber?: string;
  readonly simCarrier?: string;
}

export interface SmsProviderOverview {
  readonly status: SmsProviderStatus;
  readonly providerId?: SmsProviderId;
  readonly providerLabel?: string;
  readonly activeProviderId?: SmsProviderId;
  readonly providers: readonly SmsProviderStatusResult[];
}

export type SmsProviderFetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Server-only provider boundary. Vendor HTTP, authentication, response
 * parsing, and status interpretation stay behind this interface.
 */
export interface SmsProvider {
  readonly id: SmsProviderId;
  readonly displayName: string;
  send(request: SmsSendRequest): Promise<SmsSendResult>;
  checkStatus(): Promise<SmsProviderStatusResult>;
  lookupStatus(providerMessageId: string): Promise<SmsSendResult>;
}

export const PHILSMS_DEFAULT_API_BASE_URL = "https://app.philsms.com/api/v3";

const ANDROID_SIM_GATEWAY_LABEL = "Company SIM Gateway";
const PHILSMS_LABEL = "PhilSMS";
const MAX_PROVIDER_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_PROVIDER_TIMEOUT_MS = 8_000;
const ANDROID_GATEWAY_ONLINE_WINDOW_MS = 30 * 60_000;

class ProviderProtocolError extends Error {}
class ProviderNetworkError extends Error {}

function text(value: unknown, max = 200): string {
  return typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "";
}

function safeProviderStatus(value: unknown): string | undefined {
  const normalized = text(value, 80);
  return normalized ? normalized : undefined;
}

function finitePositiveInt(value: unknown, minimum: number, maximum: number): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : undefined;
}

function providerTimeoutMs(env: Record<string, string | undefined>): number {
  return finitePositiveInt(env.SMS_PROVIDER_TIMEOUT_MS, 2_000, 30_000) || DEFAULT_PROVIDER_TIMEOUT_MS;
}

function selectedProviderId(env: Record<string, string | undefined>): SmsProviderId | undefined {
  const value = text(env.SMS_PROVIDER, 40).toUpperCase();
  return value === SMS_PROVIDER_IDS.androidSimGateway || value === SMS_PROVIDER_IDS.philsms
    ? value
    : undefined;
}

function safeProviderId(value: unknown): string | undefined {
  const normalized = text(value, 200);
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(normalized) ? normalized : undefined;
}

function providerMessageIdForIdempotency(idempotencyKey: string): string {
  return `hs_${createHash("sha256").update(idempotencyKey, "utf8").digest("hex").slice(0, 32)}`;
}

function normalizeHttpsBaseUrl(value: unknown, fallback?: string): string | null {
  const raw = text(value, 500) || fallback || "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

function normalizeGatewayApiBaseUrl(value: unknown): string | null {
  const base = normalizeHttpsBaseUrl(value);
  if (!base) return null;
  const parsed = new URL(base);
  const path = parsed.pathname.replace(/\/+$/, "");
  if (/\/api\/3rdparty\/v1$/i.test(path)) return base;
  if (/\/api$/i.test(path)) return `${base}/3rdparty/v1`;
  if (/\/3rdparty\/v1$/i.test(path)) return `${parsed.origin}${path.replace(/\/3rdparty\/v1$/i, "/api/3rdparty/v1")}`;
  return `${base}/api/3rdparty/v1`;
}

function safeFetch(fetchImpl?: SmsProviderFetch): SmsProviderFetch | null {
  if (fetchImpl) return fetchImpl;
  if (typeof globalThis.fetch !== "function") return null;
  return globalThis.fetch.bind(globalThis) as SmsProviderFetch;
}

async function requestJson(
  fetchImpl: SmsProviderFetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ response: Response; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new ProviderNetworkError("The SMS provider request timed out.");
    throw new ProviderNetworkError(error instanceof Error ? error.message : "The SMS provider request failed.");
  } finally {
    clearTimeout(timer);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new ProviderProtocolError("The SMS provider response was too large.");
  }
  let raw = "";
  try {
    raw = await response.text();
  } catch {
    throw new ProviderProtocolError("The SMS provider response could not be read.");
  }
  if (raw.length > MAX_PROVIDER_RESPONSE_BYTES) throw new ProviderProtocolError("The SMS provider response was too large.");
  if (!raw.trim()) return { response, body: {} };
  try {
    return { response, body: JSON.parse(raw) as unknown };
  } catch {
    throw new ProviderProtocolError("The SMS provider response was not valid JSON.");
  }
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function firstObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return objectRecord(value[0]);
  return objectRecord(value);
}

function firstString(values: readonly unknown[], max = 200): string | undefined {
  for (const value of values) {
    const normalized = text(value, max);
    if (normalized) return normalized;
  }
  return undefined;
}

function extractProviderMessageId(body: unknown): string | undefined {
  const root = objectRecord(body);
  const dataRow = firstObject(root?.data);
  return safeProviderId(firstString([
    root?.id,
    root?.uid,
    root?.message_id,
    root?.messageId,
    dataRow?.id,
    dataRow?.uid,
    dataRow?.message_id,
    dataRow?.messageId,
  ]));
}

function extractLocationId(response: Response): string | undefined {
  const location = response.headers.get("location") || "";
  const candidate = location.split("/").filter(Boolean).pop() || "";
  try {
    return safeProviderId(decodeURIComponent(candidate));
  } catch {
    return undefined;
  }
}

function extractGatewayState(body: unknown): string | undefined {
  const root = objectRecord(body);
  const recipients = Array.isArray(root?.recipients) ? firstObject(root.recipients[0]) : null;
  return firstString([root?.state, recipients?.state], 80);
}

function extractPhilSmsState(body: unknown): string | undefined {
  const root = objectRecord(body);
  const row = firstObject(root?.data);
  return firstString([
    row?.status,
    row?.state,
    row?.delivery_status,
    row?.deliveryStatus,
    row?.report_status,
    row?.message_status,
    row?.messageStatus,
  ], 80);
}

export function normalizeAndroidGatewayStatus(value: unknown): SmsDeliveryStatus {
  const normalized = text(value, 80).toUpperCase().replace(/[\s-]+/g, "_");
  if (["PENDING", "PROCESSED", "QUEUED", "ACCEPTED", "CANCELLING"].includes(normalized)) return "ACCEPTED";
  if (normalized === "SENT") return "SENT";
  if (normalized === "DELIVERED") return "DELIVERED";
  if (["FAILED", "ERROR", "REJECTED", "UNDELIVERED"].includes(normalized)) return "FAILED";
  if (["CANCELLED", "CANCELED"].includes(normalized)) return "CANCELLED";
  return "UNKNOWN";
}

export function normalizePhilSmsStatus(value: unknown): SmsDeliveryStatus {
  const normalized = text(value, 80).toUpperCase().replace(/[\s-]+/g, "_");
  if (["PENDING", "QUEUED", "PROCESSING", "ACCEPTED", "SUBMITTED"].includes(normalized)) return "ACCEPTED";
  if (["SENT", "SMSC_ACCEPTED"].includes(normalized)) return "SENT";
  if (["DELIVERED", "DELIVERY_CONFIRMED"].includes(normalized)) return "DELIVERED";
  if (["FAILED", "ERROR", "REJECTED", "UNDELIVERED", "EXPIRED"].includes(normalized)) return "FAILED";
  if (["CANCELLED", "CANCELED"].includes(normalized)) return "CANCELLED";
  return "UNKNOWN";
}

function validateSendRequest(request: SmsSendRequest): string {
  const destination = normalizePhilippineMobileNumber(request.destination);
  const message = text(request.message, SMS_MAX_MESSAGE_LENGTH);
  if (!message) throw new Error("A non-empty SMS message is required.");
  if (request.message.length > SMS_MAX_MESSAGE_LENGTH) throw new Error(`SMS messages are limited to ${SMS_MAX_MESSAGE_LENGTH} characters.`);
  if (!text(request.idempotencyKey, 200)) throw new Error("An SMS idempotency key is required.");
  return destination;
}

function sendResult(
  providerId: SmsProviderId,
  status: SmsDeliveryStatus,
  options: { providerMessageId?: string; providerStatus?: string; safeMessage: string; reconciliationRequired?: boolean },
): SmsSendResult {
  return {
    providerId,
    status,
    ...(options.providerMessageId ? { providerMessageId: options.providerMessageId } : {}),
    ...(options.providerStatus ? { providerStatus: options.providerStatus } : {}),
    safeMessage: options.safeMessage,
    reconciliationRequired: options.reconciliationRequired === true || status === "UNKNOWN",
  };
}

function gatewayFailure(response: Response, providerId: SmsProviderId): SmsSendResult {
  if (response.status >= 400 && response.status < 500) {
    return sendResult(providerId, "FAILED", { safeMessage: "The Android SIM Gateway rejected the SMS request." });
  }
  return sendResult(providerId, "UNKNOWN", { safeMessage: "The Android SIM Gateway response could not be confirmed. Reconciliation is required before retrying." });
}

function philSmsFailure(response: Response, providerId: SmsProviderId): SmsSendResult {
  if (response.status >= 400 && response.status < 500) {
    return sendResult(providerId, "FAILED", { safeMessage: "PhilSMS rejected the SMS request." });
  }
  return sendResult(providerId, "UNKNOWN", { safeMessage: "PhilSMS acceptance could not be confirmed. Reconciliation is required before retrying." });
}

function androidDeviceRows(body: unknown): readonly Record<string, unknown>[] {
  const root = objectRecord(body);
  const rows = Array.isArray(body) ? body : root && Array.isArray(root.data) ? root.data : [];
  return rows.map(objectRecord).filter((row): row is Record<string, unknown> => Boolean(row));
}

function latestDevice(devices: readonly Record<string, unknown>[]): { device: Record<string, unknown>; lastSeen?: string; lastSeenAt?: number } | null {
  let result: { device: Record<string, unknown>; lastSeen?: string; lastSeenAt?: number } | null = null;
  for (const device of devices) {
    const lastSeen = text(device.lastSeen, 80);
    const parsed = lastSeen ? Date.parse(lastSeen) : Number.NaN;
    if (!result || (Number.isFinite(parsed) && (!result.lastSeenAt || parsed > result.lastSeenAt))) {
      result = { device, ...(lastSeen ? { lastSeen } : {}), ...(Number.isFinite(parsed) ? { lastSeenAt: parsed } : {}) };
    }
  }
  return result;
}

function androidStatusResult(
  status: SmsProviderStatus,
  options: Omit<SmsProviderStatusResult, "status" | "providerId" | "providerLabel"> = {},
): SmsProviderStatusResult {
  return { status, providerId: SMS_PROVIDER_IDS.androidSimGateway, providerLabel: ANDROID_SIM_GATEWAY_LABEL, ...options };
}

function philsmsStatusResult(
  status: SmsProviderStatus,
  options: Omit<SmsProviderStatusResult, "status" | "providerId" | "providerLabel"> = {},
): SmsProviderStatusResult {
  return { status, providerId: SMS_PROVIDER_IDS.philsms, providerLabel: PHILSMS_LABEL, ...options };
}

export function createAndroidSimGatewayProvider(
  env: Record<string, string | undefined> = process.env,
  fetchImpl?: SmsProviderFetch,
): SmsProvider | null {
  const baseUrl = normalizeGatewayApiBaseUrl(env.SMS_GATEWAY_BASE_URL);
  const username = text(env.SMS_GATEWAY_USERNAME, 200);
  const password = text(env.SMS_GATEWAY_PASSWORD, 500);
  const simNumberValue = env.SMS_GATEWAY_SIM_NUMBER === undefined || env.SMS_GATEWAY_SIM_NUMBER.trim() === ""
    ? undefined
    : finitePositiveInt(env.SMS_GATEWAY_SIM_NUMBER, 1, 3);
  const deviceId = text(env.SMS_GATEWAY_DEVICE_ID, 21);
  if (!baseUrl || !username || !password || (env.SMS_GATEWAY_SIM_NUMBER && simNumberValue === undefined) || (env.SMS_GATEWAY_DEVICE_ID && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,20}$/.test(deviceId))) return null;
  const requestFetch = safeFetch(fetchImpl);
  if (!requestFetch) return null;
  const authHeader = `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
  const timeoutMs = providerTimeoutMs(env);
  const id = SMS_PROVIDER_IDS.androidSimGateway;

  const lookupStatus = async (providerMessageId: string): Promise<SmsSendResult> => {
    const safeId = safeProviderId(providerMessageId);
    if (!safeId) return sendResult(id, "UNKNOWN", { safeMessage: "The Android SIM Gateway message reference is invalid. Reconciliation is required." });
    try {
      const { response, body } = await requestJson(requestFetch, `${baseUrl}/messages/${encodeURIComponent(safeId)}`, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: authHeader },
      }, timeoutMs);
      if (!response.ok) return sendResult(id, "UNKNOWN", { providerMessageId: safeId, safeMessage: "The Android SIM Gateway message state could not be confirmed. Reconciliation is required." });
      const providerStatus = extractGatewayState(body);
      const status = normalizeAndroidGatewayStatus(providerStatus);
      return sendResult(id, status, {
        providerMessageId: safeId,
        ...(safeProviderStatus(providerStatus) ? { providerStatus: safeProviderStatus(providerStatus) } : {}),
        safeMessage: status === "DELIVERED"
          ? "Delivery was confirmed by the Android SIM Gateway."
          : status === "SENT"
            ? "The Android SIM Gateway reports that the SMS was sent."
            : status === "FAILED"
              ? "The Android SIM Gateway reports that the SMS failed."
              : status === "CANCELLED"
                ? "The Android SIM Gateway reports that the SMS was cancelled."
                : status === "ACCEPTED"
                  ? "The Android SIM Gateway has accepted the SMS for device delivery."
                  : "The Android SIM Gateway message state could not be interpreted. Reconciliation is required.",
      });
    } catch {
      return sendResult(id, "UNKNOWN", { providerMessageId: safeId, safeMessage: "The Android SIM Gateway message state could not be confirmed. Reconciliation is required." });
    }
  };

  return {
    id,
    displayName: ANDROID_SIM_GATEWAY_LABEL,
    async send(request) {
      const destination = validateSendRequest(request);
      if (request.simNumber !== undefined && finitePositiveInt(request.simNumber, 1, 3) === undefined) throw new Error("The configured SIM selection is invalid.");
      if (request.deviceId !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,20}$/.test(request.deviceId)) throw new Error("The configured gateway device selection is invalid.");
      const providerMessageId = providerMessageIdForIdempotency(request.idempotencyKey);
      const payload = {
        id: providerMessageId,
        phoneNumbers: [destination],
        textMessage: { text: request.message },
        ...(request.simNumber || simNumberValue ? { simNumber: request.simNumber || simNumberValue } : {}),
        ...(request.deviceId || deviceId ? { deviceId: request.deviceId || deviceId } : {}),
      };
      try {
        const { response, body } = await requestJson(requestFetch, `${baseUrl}/messages`, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: authHeader, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }, timeoutMs);
        if (response.status === 409) return lookupStatus(providerMessageId);
        if (!response.ok) return gatewayFailure(response, id);
        const returnedId = extractProviderMessageId(body) || extractLocationId(response);
        const providerStatus = extractGatewayState(body) || "Pending";
        const status = normalizeAndroidGatewayStatus(providerStatus);
        if (!returnedId || status === "UNKNOWN") {
          return sendResult(id, "UNKNOWN", {
            ...(returnedId ? { providerMessageId: returnedId } : {}),
            ...(safeProviderStatus(providerStatus) ? { providerStatus: safeProviderStatus(providerStatus) } : {}),
            safeMessage: "The Android SIM Gateway response could not be confirmed. Reconciliation is required before retrying.",
          });
        }
        return sendResult(id, status, {
          providerMessageId: returnedId,
          ...(safeProviderStatus(providerStatus) ? { providerStatus: safeProviderStatus(providerStatus) } : {}),
          safeMessage: status === "DELIVERED"
            ? "Delivery was confirmed by the Android SIM Gateway."
            : status === "SENT"
              ? "The Android SIM Gateway reports that the SMS was sent."
              : "The Android SIM Gateway accepted the SMS for device delivery.",
        });
      } catch (error) {
        if (error instanceof Error && !(error instanceof ProviderNetworkError) && !(error instanceof ProviderProtocolError)) throw error;
        return sendResult(id, "UNKNOWN", { safeMessage: "The Android SIM Gateway response could not be confirmed. Reconciliation is required before retrying." });
      }
    },
    async checkStatus() {
      try {
        const { response, body } = await requestJson(requestFetch, `${baseUrl}/devices`, {
          method: "GET",
          headers: { Accept: "application/json", Authorization: authHeader },
        }, timeoutMs);
        if (!response.ok) {
          return androidStatusResult("DEGRADED", { message: response.status === 401 || response.status === 403 ? "Gateway credentials were rejected." : "The gateway server could not be checked safely." });
        }
        const devices = androidDeviceRows(body);
        if (!devices.length) return androidStatusResult("DEGRADED", { message: "The gateway server responded, but no Android phone is registered." });
        const latest = latestDevice(devices);
        const device = latest?.device || devices[0];
        const lastSeenAt = latest?.lastSeenAt;
        const now = Date.now();
        const recent = Boolean(lastSeenAt && now - lastSeenAt <= ANDROID_GATEWAY_ONLINE_WINDOW_MS && now - lastSeenAt >= -60_000);
        const simCards = Array.isArray(device.simCards) ? device.simCards.map(firstObject).filter((item): item is Record<string, unknown> => Boolean(item)) : [];
        const selectedSim = simNumberValue ? simCards.find((sim) => Number(sim.simNumber) === simNumberValue) : simCards[0];
        return androidStatusResult(recent ? "READY" : "DEGRADED", {
          message: recent
            ? "The Android phone is checking in through the configured gateway server."
            : "The gateway server responded, but the Android phone has not checked in recently.",
          ...(latest?.lastSeen ? { lastSeen: latest.lastSeen } : {}),
          ...(text(device.id, 80) ? { deviceId: text(device.id, 80) } : {}),
          deviceLabel: text(device.name, 120) || "Android phone",
          ...(Number.isInteger(Number(selectedSim?.simNumber)) ? { simNumber: Number(selectedSim?.simNumber) } : simNumberValue ? { simNumber: simNumberValue } : {}),
          ...(text(selectedSim?.phoneNumber, 40) ? { simPhoneNumber: text(selectedSim?.phoneNumber, 40) } : {}),
          ...(text(selectedSim?.carrierName, 80) ? { simCarrier: text(selectedSim?.carrierName, 80) } : {}),
        });
      } catch {
        return androidStatusResult("DEGRADED", { message: "The Android SIM Gateway could not be checked safely." });
      }
    },
    lookupStatus,
  };
}

function philSmsSenderId(value: unknown): string | null {
  const sender = text(value, 32);
  return sender && !/[\u0000-\u001f\u007f]/.test(sender) ? sender : null;
}

export function createPhilSmsProvider(
  env: Record<string, string | undefined> = process.env,
  fetchImpl?: SmsProviderFetch,
): SmsProvider | null {
  const token = text(env.PHILSMS_API_TOKEN, 500);
  const senderId = philSmsSenderId(env.PHILSMS_SENDER_ID);
  const baseUrl = normalizeHttpsBaseUrl(env.PHILSMS_API_BASE_URL, PHILSMS_DEFAULT_API_BASE_URL);
  const requestFetch = safeFetch(fetchImpl);
  if (!token || !senderId || !baseUrl || !requestFetch) return null;
  const id = SMS_PROVIDER_IDS.philsms;
  const timeoutMs = providerTimeoutMs(env);
  const authHeader = `Bearer ${token}`;

  const lookupStatus = async (providerMessageId: string): Promise<SmsSendResult> => {
    const safeId = safeProviderId(providerMessageId);
    if (!safeId) return sendResult(id, "UNKNOWN", { safeMessage: "The PhilSMS message reference is invalid. Reconciliation is required." });
    try {
      const { response, body } = await requestJson(requestFetch, `${baseUrl}/sms/${encodeURIComponent(safeId)}`, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: authHeader },
      }, timeoutMs);
      if (!response.ok) return sendResult(id, "UNKNOWN", { providerMessageId: safeId, safeMessage: "PhilSMS message status could not be confirmed. Reconciliation is required." });
      const providerStatus = extractPhilSmsState(body);
      const status = normalizePhilSmsStatus(providerStatus);
      return sendResult(id, status, {
        providerMessageId: safeId,
        ...(safeProviderStatus(providerStatus) ? { providerStatus: safeProviderStatus(providerStatus) } : {}),
        safeMessage: status === "DELIVERED"
          ? "PhilSMS reports that the SMS was delivered."
          : status === "SENT"
            ? "PhilSMS reports that the SMS was sent."
            : status === "FAILED"
              ? "PhilSMS reports that the SMS failed."
              : status === "CANCELLED"
                ? "PhilSMS reports that the SMS was cancelled."
                : status === "ACCEPTED"
                  ? "PhilSMS has accepted the SMS for delivery."
                  : "PhilSMS message status could not be interpreted. Reconciliation is required.",
      });
    } catch {
      return sendResult(id, "UNKNOWN", { providerMessageId: safeId, safeMessage: "PhilSMS message status could not be confirmed. Reconciliation is required." });
    }
  };

  return {
    id,
    displayName: PHILSMS_LABEL,
    async send(request) {
      const destination = validateSendRequest(request);
      const originator = request.originator === undefined ? senderId : philSmsSenderId(request.originator);
      if (!originator) throw new Error("The configured PhilSMS Sender ID is invalid.");
      const type = /^[\u0000-\u007f]*$/.test(request.message) ? "plain" : "unicode";
      try {
        const { response, body } = await requestJson(requestFetch, `${baseUrl}/sms/send`, {
          method: "POST",
          headers: { Accept: "application/json", Authorization: authHeader, "Content-Type": "application/json" },
          body: JSON.stringify({ recipient: destination, sender_id: originator, type, message: request.message }),
        }, timeoutMs);
        if (!response.ok) return philSmsFailure(response, id);
        const root = objectRecord(body);
        if (root?.status !== "success") return sendResult(id, "FAILED", { safeMessage: "PhilSMS rejected the SMS request." });
        const providerMessageId = extractProviderMessageId(body);
        if (!providerMessageId) return sendResult(id, "UNKNOWN", { safeMessage: "PhilSMS accepted an ambiguous response. Reconciliation is required before retrying." });
        const providerStatus = extractPhilSmsState(body);
        const normalizedStatus = providerStatus ? normalizePhilSmsStatus(providerStatus) : "ACCEPTED";
        const status = normalizedStatus === "UNKNOWN" ? "ACCEPTED" : normalizedStatus;
        return sendResult(id, status, {
          providerMessageId,
          ...(safeProviderStatus(providerStatus) ? { providerStatus: safeProviderStatus(providerStatus) } : {}),
          safeMessage: status === "DELIVERED"
            ? "PhilSMS reports that the SMS was delivered."
            : status === "SENT"
              ? "PhilSMS reports that the SMS was sent."
              : "PhilSMS accepted the SMS for delivery.",
        });
      } catch (error) {
        if (error instanceof Error && !(error instanceof ProviderNetworkError) && !(error instanceof ProviderProtocolError)) throw error;
        return sendResult(id, "UNKNOWN", { safeMessage: "PhilSMS acceptance could not be confirmed. Reconciliation is required before retrying." });
      }
    },
    async checkStatus() {
      try {
        const { response, body } = await requestJson(requestFetch, `${baseUrl}/balance`, {
          method: "GET",
          headers: { Accept: "application/json", Authorization: authHeader },
        }, timeoutMs);
        const root = objectRecord(body);
        if (!response.ok || root?.status !== "success") {
          return philsmsStatusResult("DEGRADED", { message: response.status === 401 || response.status === 403 ? "PhilSMS credentials were rejected." : "PhilSMS account status could not be checked safely." });
        }
        return philsmsStatusResult("READY", { message: "PhilSMS account status was verified. Sender approval and controlled delivery QA remain deployment checks." });
      } catch {
        return philsmsStatusResult("DEGRADED", { message: "PhilSMS account status could not be checked safely." });
      }
    },
    lookupStatus,
  };
}

function staticProviderStatus(id: SmsProviderId, env: Record<string, string | undefined>): SmsProviderStatusResult {
  const active = selectedProviderId(env);
  if (active !== id) return id === SMS_PROVIDER_IDS.androidSimGateway
    ? androidStatusResult("NOT_CONFIGURED", { message: "Company SIM Gateway is not the selected SMS path for this deployment." })
    : philsmsStatusResult("NOT_CONFIGURED", { message: "PhilSMS is not the selected SMS path for this deployment." });
  const provider = id === SMS_PROVIDER_IDS.androidSimGateway
    ? createAndroidSimGatewayProvider(env)
    : createPhilSmsProvider(env);
  if (!provider) return id === SMS_PROVIDER_IDS.androidSimGateway
    ? androidStatusResult("NOT_CONFIGURED", { message: "Complete the server-side Company SIM Gateway configuration before verifying it." })
    : philsmsStatusResult("NOT_CONFIGURED", { message: "Complete the server-side PhilSMS token and Sender ID configuration before verifying it." });
  return { status: "CONFIGURED_UNVERIFIED", providerId: provider.id, providerLabel: provider.displayName, message: "Configuration is present. Verify the provider connection before treating SMS as ready." };
}

export function resolveSmsProvider(env: Record<string, string | undefined> = process.env): SmsProvider | null {
  const selected = selectedProviderId(env);
  if (selected === SMS_PROVIDER_IDS.androidSimGateway) return createAndroidSimGatewayProvider(env);
  if (selected === SMS_PROVIDER_IDS.philsms) return createPhilSmsProvider(env);
  return null;
}

/** Configuration-only status retained for callers that must not make a network request. */
export function getSmsProviderStatus(env: Record<string, string | undefined> = process.env): SmsProviderStatusResult {
  const active = selectedProviderId(env);
  if (!active) return { status: "NOT_CONFIGURED" };
  return staticProviderStatus(active, env);
}

/**
 * Performs the bounded provider/device check used by the authenticated status
 * endpoint. Credentials and raw provider responses never leave this module.
 */
export async function checkSmsProviderOverview(env: Record<string, string | undefined> = process.env): Promise<SmsProviderOverview> {
  const active = selectedProviderId(env);
  const choices = [SMS_PROVIDER_IDS.androidSimGateway, SMS_PROVIDER_IDS.philsms] as const;
  const configured = choices.map((id) => staticProviderStatus(id, env));
  if (!active) return { status: "NOT_CONFIGURED", providers: configured };
  const provider = resolveSmsProvider(env);
  if (!provider) {
    const current = configured.find((choice) => choice.providerId === active) || configured[0];
    return { status: current.status, providerId: current.providerId, providerLabel: current.providerLabel, activeProviderId: active, providers: configured };
  }
  const checked = await provider.checkStatus();
  const providers = configured.map((choice) => choice.providerId === active ? checked : choice);
  return {
    status: checked.status,
    providerId: checked.providerId,
    providerLabel: checked.providerLabel,
    activeProviderId: active,
    providers,
  };
}
