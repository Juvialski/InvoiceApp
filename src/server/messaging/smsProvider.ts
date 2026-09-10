export type SmsProviderStatus = "NOT_CONFIGURED" | "READY";

export interface SmsSendRequest {
  readonly destination: string;
  readonly message: string;
  readonly originator?: string;
  readonly idempotencyKey: string;
}

export interface SmsSendResult {
  readonly providerMessageId?: string;
  readonly status: "ACCEPTED" | "FAILED" | "UNKNOWN";
  readonly providerStatus?: string;
  readonly reconciliationRequired: boolean;
}

/**
 * Server-only provider boundary. Vendor SDKs belong behind this interface;
 * React components and domain workflows never receive provider credentials.
 */
export interface SmsProvider {
  readonly id: string;
  readonly displayName: string;
  send(request: SmsSendRequest): Promise<SmsSendResult>;
}

export interface SmsProviderStatusResult {
  readonly status: SmsProviderStatus;
  readonly providerId?: string;
  readonly providerLabel?: string;
}

export function resolveSmsProvider(_env: Record<string, string | undefined> = process.env): SmsProvider | null {
  // No provider has been approved or configured for this deployment. Keep the
  // resolver explicit so a later adapter can be added without scattering a
  // vendor API through routes or React code.
  return null;
}

export function getSmsProviderStatus(env: Record<string, string | undefined> = process.env): SmsProviderStatusResult {
  const provider = resolveSmsProvider(env);
  return provider
    ? { status: "READY", providerId: provider.id, providerLabel: provider.displayName }
    : { status: "NOT_CONFIGURED" };
}
