import type { SupabaseClient } from "@supabase/supabase-js";

export const COMPANY_AI_PROVIDER = "GEMINI" as const;
export const COMPANY_AI_PRIMARY_MODEL = "gemini-3.5-flash-lite" as const;
export const COMPANY_AI_FALLBACK_MODEL = "gemini-3.7-flash" as const;
export const COMPANY_AI_ENCRYPTION_VERSION = 1 as const;

export type CompanyAiStatus = "NOT_CONFIGURED" | "ACTIVE" | "DISABLED" | "INVALID";
export type CompanyAiTestStatus = "SUCCESS" | "INVALID_CREDENTIAL" | "QUOTA_LIMITED" | "PROVIDER_UNAVAILABLE" | "PROVIDER_ACCESS_DENIED" | "MODEL_UNAVAILABLE" | "NOT_TESTED";

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
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 503) {
    super(message);
    this.name = "CompanyAiError";
    this.code = code;
    this.status = status;
  }
}
