/**
 * Server-side storage subsystem configuration and provider factory.
 * Manages provider resolution, credentials isolation, and health checks.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type DocumentStorageProvider,
  type S3ProviderConfig,
  type StorageConfig,
  type StorageHealthStatus,
  type StorageProviderId,
  StorageConfigurationError,
} from "./types.ts";
import { SupabaseStorageProvider } from "./providers/supabaseProvider.ts";
import { S3StorageProvider } from "./providers/s3Provider.ts";
import { MemoryStorageProvider } from "./providers/memoryProvider.ts";

export interface StorageEnvironment {
  STORAGE_PRIMARY_PROVIDER?: string;
  STORAGE_S3_ENDPOINT?: string;
  CLOUDFLARE_R2_ENDPOINT?: string;
  R2_ENDPOINT?: string;
  STORAGE_S3_BUCKET?: string;
  CLOUDFLARE_R2_BUCKET?: string;
  R2_BUCKET?: string;
  STORAGE_S3_REGION?: string;
  CLOUDFLARE_R2_REGION?: string;
  STORAGE_S3_ACCESS_KEY_ID?: string;
  CLOUDFLARE_R2_ACCESS_KEY_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  STORAGE_S3_SECRET_ACCESS_KEY?: string;
  CLOUDFLARE_R2_SECRET_ACCESS_KEY?: string;
  R2_SECRET_ACCESS_KEY?: string;
  STORAGE_S3_FORCE_PATH_STYLE?: string;
  STORAGE_S3_PUBLIC_READ_URL?: string;
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
}

function getEnvValue(env: StorageEnvironment, ...keys: (keyof StorageEnvironment)[]): string {
  for (const key of keys) {
    const val = env[key]?.trim();
    if (val) return val;
  }
  return "";
}

/**
 * Load and validate storage configuration from server environment.
 */
export function loadStorageConfig(env: StorageEnvironment = process.env): StorageConfig {
  const providerRaw = getEnvValue(env, "STORAGE_PRIMARY_PROVIDER").toLowerCase();
  let primaryProvider: StorageProviderId = "supabase";

  if (providerRaw === "s3" || providerRaw === "r2" || providerRaw === "cloudflare") {
    primaryProvider = "s3";
  } else if (providerRaw === "memory") {
    primaryProvider = "memory";
  } else if (providerRaw === "supabase" || !providerRaw) {
    primaryProvider = "supabase";
  }

  const endpoint = getEnvValue(env, "STORAGE_S3_ENDPOINT", "CLOUDFLARE_R2_ENDPOINT", "R2_ENDPOINT");
  const bucket = getEnvValue(env, "STORAGE_S3_BUCKET", "CLOUDFLARE_R2_BUCKET", "R2_BUCKET") || "invoice-originals";
  const region = getEnvValue(env, "STORAGE_S3_REGION", "CLOUDFLARE_R2_REGION") || "auto";
  const accessKeyId = getEnvValue(env, "STORAGE_S3_ACCESS_KEY_ID", "CLOUDFLARE_R2_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID");
  const secretAccessKey = getEnvValue(env, "STORAGE_S3_SECRET_ACCESS_KEY", "CLOUDFLARE_R2_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY");
  const forcePathStyleRaw = getEnvValue(env, "STORAGE_S3_FORCE_PATH_STYLE");
  const forcePathStyle = forcePathStyleRaw ? forcePathStyleRaw === "true" : true;
  const publicReadUrl = getEnvValue(env, "STORAGE_S3_PUBLIC_READ_URL") || undefined;

  let s3Config: S3ProviderConfig | undefined;
  if (endpoint && accessKeyId && secretAccessKey) {
    s3Config = {
      endpoint,
      bucket,
      region,
      accessKeyId,
      secretAccessKey,
      forcePathStyle,
      publicReadUrl,
    };
  }

  return {
    primaryProvider,
    s3: s3Config,
  };
}

// Global cached memory provider for shared test contexts if needed
let globalMemoryProvider: MemoryStorageProvider | null = null;

export function getSharedMemoryProvider(): MemoryStorageProvider {
  if (!globalMemoryProvider) {
    globalMemoryProvider = new MemoryStorageProvider();
  }
  return globalMemoryProvider;
}

export function resetSharedMemoryProvider(): void {
  globalMemoryProvider?.clear();
  globalMemoryProvider = null;
}

/**
 * Instantiate a DocumentStorageProvider by ID based on environment or explicit config.
 */
export function createStorageProvider(
  providerId: StorageProviderId,
  config?: StorageConfig,
  supabaseClientGetter?: () => SupabaseClient,
): DocumentStorageProvider {
  const loadedConfig = config || loadStorageConfig();

  switch (providerId) {
    case "memory":
      return getSharedMemoryProvider();

    case "s3": {
      if (!loadedConfig.s3) {
        throw new StorageConfigurationError(
          "S3 storage provider is requested but S3 configuration (endpoint, accessKeyId, secretAccessKey) is incomplete.",
        );
      }
      return new S3StorageProvider(loadedConfig.s3);
    }

    case "supabase":
    default: {
      if (!supabaseClientGetter) {
        throw new StorageConfigurationError("SupabaseStorageProvider requires a SupabaseClient supplier.");
      }
      return new SupabaseStorageProvider(supabaseClientGetter);
    }
  }
}

/**
 * Get the currently configured primary storage provider.
 */
export function getPrimaryStorageProvider(
  env: StorageEnvironment = process.env,
  supabaseClientGetter?: () => SupabaseClient,
): DocumentStorageProvider {
  const config = loadStorageConfig(env);
  return createStorageProvider(config.primaryProvider, config, supabaseClientGetter);
}

/**
 * Inspect storage configuration health without leaking secret keys.
 */
export function getStorageHealth(env: StorageEnvironment = process.env): StorageHealthStatus {
  const config = loadStorageConfig(env);
  const s3Configured = Boolean(config.s3 && config.s3.endpoint && config.s3.accessKeyId && config.s3.secretAccessKey);
  const supabaseUrl = getEnvValue(env, "SUPABASE_URL", "VITE_SUPABASE_URL");
  const supabaseConfigured = Boolean(supabaseUrl);

  const isConfigured =
    config.primaryProvider === "memory" ||
    (config.primaryProvider === "supabase" && supabaseConfigured) ||
    (config.primaryProvider === "s3" && s3Configured);

  return {
    primaryProvider: config.primaryProvider,
    isConfigured,
    details: {
      supabaseConfigured,
      s3Configured,
      s3Endpoint: config.s3?.endpoint ? new URL(config.s3.endpoint).origin : undefined,
      s3Bucket: config.s3?.bucket,
      s3Region: config.s3?.region,
    },
  };
}
