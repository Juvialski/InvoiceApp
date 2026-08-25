import type { SupabaseClient } from "@supabase/supabase-js";

export const COMPANY_AI_PROVIDER = "GEMINI" as const;
export const COMPANY_AI_PRIMARY_MODEL = "gemini-3.5-flash-lite" as const;
export const COMPANY_AI_FALLBACK_MODEL = "gemini-3.7-flash" as const;
export const COMPANY_AI_ENCRYPTION_VERSION = 1 as const;

export type CompanyAiStatus = "NOT_CONFIGURED" | "ACTIVE" | "DISABLED" | "INVALID";
export type CompanyAiTestStatus = "SUCCESS" | "INVALID_CREDENTIAL" | "QUOTA_LIMITED" | "PROVIDER_UNAVAILABLE" | "PROVIDER_ACCESS_DENIED" | "MODEL_UNAVAILABLE" | "NOT_TESTED";
export type CompanyAiErrorCode =
  | "AI_CREDENTIAL_INVALID"
  | "AI_QUOTA_LIMITED"
  | "AI_PROVIDER_ACCESS_DENIED"
  | "AI_MODEL_UNAVAILABLE"
  | "AI_PROVIDER_UNAVAILABLE"
  | "AI_REQUEST_REJECTED"
  | "AI_TIMEOUT"
  | "AI_NETWORK_ERROR"
  | "AI_NOT_CONFIGURED_FOR_COMPANY"
  | "AI_DISABLED_FOR_COMPANY"
  | "AI_CONFIG_UNAVAILABLE"
  | "AI_CREDENTIAL_UNAVAILABLE"
  | "AI_CREDENTIALS_SERVER_MISCONFIGURED";

export type CompanyAiDiagnosticValue = string | number | boolean | null;
export type CompanyAiDiagnostics = Readonly<Record<string, CompanyAiDiagnosticValue>>;

export interface CompanyAiConfigMetadata {
  companyId: string;
  provider: typeof COMPANY_AI_PROVIDER;
  enabled: boolean;
  primaryModel: typeof COMPANY_AI_PRIMARY_MODEL;
  fallbackModel: typeof COMPANY_AI_FALLBACK_MODEL;
  credentialConfigured: boolean;
  credentialLast4?: string;
  credentialVersion: number;
  status: CompanyAiStatus;
  lastTestedAt?: string;
  lastTestStatus: CompanyAiTestStatus;
  /** Returned only by the live Test Connection response; not persisted as credential data. */
  lastTestErrorCode?: string;
  lastTestReference?: string;
  updatedAt?: string;
}

export interface CompanyAiCredentialEnvelope {
  companyId: string;
  provider: typeof COMPANY_AI_PROVIDER;
  enabled: boolean;
  status: CompanyAiStatus;
  credentialVersion: number;
  encryptionVersion: number;
  ciphertext: string;
  iv: string;
  authTag: string;
  keyLast4?: string;
}

/**
 * Resolution metadata is returned even when a settings row exists without a
 * usable encrypted credential. That distinction prevents a disabled or
 * removed company from silently falling through to the local/demo fallback.
 */
export interface CompanyAiCredentialResolution {
  companyId: string;
  provider: typeof COMPANY_AI_PROVIDER;
  enabled: boolean;
  status: CompanyAiStatus;
  credentialVersion: number;
  encryptionVersion: number;
  keyLast4?: string;
  credential?: CompanyAiCredentialEnvelope;
}

export interface CompanyAiRuntime {
  companyId: string;
  provider: typeof COMPANY_AI_PROVIDER;
  primaryModel: typeof COMPANY_AI_PRIMARY_MODEL;
  fallbackModel: typeof COMPANY_AI_FALLBACK_MODEL;
  credentialVersion: number;
  geminiClient: {
    models: {
      generateContent: (parameters: any) => Promise<any>;
    };
  };
}

export interface CompanyAiSupabaseResolverOptions {
  supabase: SupabaseClient;
  companyId: string;
}

export class CompanyAiError extends Error {
  readonly code: CompanyAiErrorCode | string;
  readonly status: number;
  readonly correlationRef: string;
  readonly diagnostics?: CompanyAiDiagnostics;

  constructor(code: CompanyAiErrorCode | string, message: string, status = 503, options: { correlationRef?: string; diagnostics?: CompanyAiDiagnostics } = {}) {
    super(message);
    this.name = "CompanyAiError";
    this.code = code;
    this.status = status;
    this.correlationRef = options.correlationRef || createCorrelationRef();
    this.diagnostics = options.diagnostics;
  }
}

let correlationCounter = 0;

function createCorrelationRef() {
  try {
    const value = globalThis.crypto?.randomUUID?.().replaceAll("-", "").slice(0, 12).toUpperCase();
    if (value) return `AI-${value}`;
  } catch {
    // Fall through to the monotonic, non-sensitive local reference.
  }
  correlationCounter = (correlationCounter + 1) % 0xFFFFFF;
  return `AI-${Date.now().toString(36).toUpperCase()}-${correlationCounter.toString(36).padStart(4, "0").toUpperCase()}`;
}
