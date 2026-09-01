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
  NODE_ENV?: string;
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
  // Independent Backup Provider Configuration
  STORAGE_BACKUP_PROVIDER?: string;
  STORAGE_BACKUP_ENDPOINT?: string;
  BACKBLAZE_B2_ENDPOINT?: string;
  B2_ENDPOINT?: string;
  STORAGE_BACKUP_BUCKET?: string;
  BACKBLAZE_B2_BUCKET?: string;
  B2_BUCKET?: string;
  STORAGE_BACKUP_REGION?: string;
  BACKBLAZE_B2_REGION?: string;
  B2_REGION?: string;
  STORAGE_BACKUP_ACCESS_KEY_ID?: string;
  BACKBLAZE_B2_ACCESS_KEY_ID?: string;
  B2_ACCESS_KEY_ID?: string;
  STORAGE_BACKUP_SECRET_ACCESS_KEY?: string;
  BACKBLAZE_B2_SECRET_ACCESS_KEY?: string;
  B2_SECRET_ACCESS_KEY?: string;
  STORAGE_BACKUP_FORCE_PATH_STYLE?: string;
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
  const nodeEnv = (env.NODE_ENV || process.env.NODE_ENV || "").toLowerCase();
  let primaryProvider: StorageProviderId;

  if (!providerRaw || providerRaw === "supabase") {
    primaryProvider = "supabase";
  } else if (providerRaw === "s3" || providerRaw === "r2" || providerRaw === "cloudflare") {
    primaryProvider = "s3";
  } else if (providerRaw === "memory") {
    if (nodeEnv === "production") {
      throw new StorageConfigurationError("Memory storage provider cannot be used as primary storage in production.");
    }
    primaryProvider = "memory";
  } else {
    throw new StorageConfigurationError(
      `Unsupported storage provider: "${providerRaw}". Supported durable providers for Wave S3 are "supabase" and "s3".`,
    );
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

  // Backup Provider Configuration
  const backupRaw = getEnvValue(env, "STORAGE_BACKUP_PROVIDER").toLowerCase();
  let backupProvider: StorageProviderId | undefined;
  if (backupRaw === "s3" || backupRaw === "b2" || backupRaw === "backblaze") {
    backupProvider = "s3";
  } else if (backupRaw === "memory") {
    if (nodeEnv === "production") {
      throw new StorageConfigurationError("Memory storage provider cannot be used as backup storage in production.");
    }
    backupProvider = "memory";
  } else if (backupRaw === "supabase") {
    backupProvider = "supabase";
  } else if (backupRaw) {
    throw new StorageConfigurationError(
      `Unsupported backup storage provider: "${backupRaw}". Supported backup providers are "s3", "b2", and "memory" (test only).`,
    );
  }

  const backupEndpoint = getEnvValue(env, "STORAGE_BACKUP_ENDPOINT", "BACKBLAZE_B2_ENDPOINT", "B2_ENDPOINT");
  const backupBucket = getEnvValue(env, "STORAGE_BACKUP_BUCKET", "BACKBLAZE_B2_BUCKET", "B2_BUCKET") || "engoryx-backups";
  const backupRegion = getEnvValue(env, "STORAGE_BACKUP_REGION", "BACKBLAZE_B2_REGION", "B2_REGION") || "auto";
  const backupAccessKeyId = getEnvValue(env, "STORAGE_BACKUP_ACCESS_KEY_ID", "BACKBLAZE_B2_ACCESS_KEY_ID", "B2_ACCESS_KEY_ID");
  const backupSecretAccessKey = getEnvValue(env, "STORAGE_BACKUP_SECRET_ACCESS_KEY", "BACKBLAZE_B2_SECRET_ACCESS_KEY", "B2_SECRET_ACCESS_KEY");
  const backupForcePathStyleRaw = getEnvValue(env, "STORAGE_BACKUP_FORCE_PATH_STYLE");
  const backupForcePathStyle = backupForcePathStyleRaw ? backupForcePathStyleRaw === "true" : true;

  let backupS3Config: S3ProviderConfig | undefined;
  if (backupEndpoint && backupAccessKeyId && backupSecretAccessKey) {
    backupS3Config = {
      endpoint: backupEndpoint,
      bucket: backupBucket,
      region: backupRegion,
      accessKeyId: backupAccessKeyId,
      secretAccessKey: backupSecretAccessKey,
      forcePathStyle: backupForcePathStyle,
    };
  }

  return {
    primaryProvider,
    s3: s3Config,
    backupProvider,
    backupS3: backupS3Config,
  };
}

// Global cached memory provider for shared test contexts
let globalMemoryProvider: MemoryStorageProvider | null = null;
let globalBackupMemoryProvider: MemoryStorageProvider | null = null;

export function getSharedMemoryProvider(): MemoryStorageProvider {
  if (!globalMemoryProvider) {
    globalMemoryProvider = new MemoryStorageProvider();
  }
  return globalMemoryProvider;
}

export function getSharedBackupMemoryProvider(): MemoryStorageProvider {
  if (!globalBackupMemoryProvider) {
    globalBackupMemoryProvider = new MemoryStorageProvider();
  }
  return globalBackupMemoryProvider;
}

export function resetSharedMemoryProvider(): void {
  globalMemoryProvider?.clear();
  globalMemoryProvider = null;
  globalBackupMemoryProvider?.clear();
  globalBackupMemoryProvider = null;
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
    case "memory": {
      const nodeEnv = (process.env.NODE_ENV || "").toLowerCase();
      if (nodeEnv === "production") {
        throw new StorageConfigurationError("Memory storage provider is for test environments only.");
      }
      return getSharedMemoryProvider();
    }

    case "s3": {
      if (!loadedConfig.s3) {
        throw new StorageConfigurationError(
          "S3 storage provider is requested but S3 configuration (endpoint, accessKeyId, secretAccessKey) is incomplete.",
        );
      }
      return new S3StorageProvider(loadedConfig.s3);
    }

    case "supabase": {
      if (!supabaseClientGetter) {
        throw new StorageConfigurationError("SupabaseStorageProvider requires a SupabaseClient supplier.");
      }
      return new SupabaseStorageProvider(supabaseClientGetter);
    }

    default:
      throw new StorageConfigurationError(
        `Unsupported storage provider: "${providerId}". Supported providers are "supabase" and "s3".`,
      );
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
 * Get the currently configured backup storage provider if one is configured.
 */
export function getBackupStorageProvider(
  env: StorageEnvironment = process.env,
  supabaseClientGetter?: () => SupabaseClient,
): DocumentStorageProvider | null {
  const config = loadStorageConfig(env);
  if (!config.backupProvider) return null;

  switch (config.backupProvider) {
    case "memory": {
      const nodeEnv = (process.env.NODE_ENV || "").toLowerCase();
      if (nodeEnv === "production") {
        throw new StorageConfigurationError("Memory backup storage provider is for test environments only.");
      }
      return getSharedBackupMemoryProvider();
    }

    case "s3": {
      if (!config.backupS3) {
        throw new StorageConfigurationError(
          "S3/B2 backup storage provider is requested but backup configuration (endpoint, accessKeyId, secretAccessKey) is incomplete.",
        );
      }
      return new S3StorageProvider(config.backupS3);
    }

    case "supabase": {
      if (!supabaseClientGetter) {
        throw new StorageConfigurationError("SupabaseStorageProvider requires a SupabaseClient supplier.");
      }
      return new SupabaseStorageProvider(supabaseClientGetter);
    }

    default:
      throw new StorageConfigurationError(`Unsupported backup storage provider: "${config.backupProvider}".`);
  }
}

/**
 * Inspect storage configuration health without leaking secret keys.
 */
export function getStorageHealth(env: StorageEnvironment = process.env): StorageHealthStatus {
  const config = loadStorageConfig(env);
  const s3Configured = Boolean(config.s3 && config.s3.endpoint && config.s3.accessKeyId && config.s3.secretAccessKey);
  const backupConfigured = Boolean(
    config.backupProvider === "memory" ||
    (config.backupProvider === "s3" && config.backupS3 && config.backupS3.endpoint && config.backupS3.accessKeyId && config.backupS3.secretAccessKey),
  );
  const supabaseUrl = getEnvValue(env, "SUPABASE_URL", "VITE_SUPABASE_URL");
  const supabaseConfigured = Boolean(supabaseUrl);

  const isConfigured =
    config.primaryProvider === "memory" ||
    (config.primaryProvider === "supabase" && supabaseConfigured) ||
    (config.primaryProvider === "s3" && s3Configured);

  let backupEndpointOrigin: string | undefined;
  if (config.backupS3?.endpoint) {
    try {
      backupEndpointOrigin = new URL(config.backupS3.endpoint).origin;
    } catch {
      backupEndpointOrigin = undefined;
    }
  }

  let s3EndpointOrigin: string | undefined;
  if (config.s3?.endpoint) {
    try {
      s3EndpointOrigin = new URL(config.s3.endpoint).origin;
    } catch {
      s3EndpointOrigin = undefined;
    }
  }

  return {
    primaryProvider: config.primaryProvider,
    backupProvider: config.backupProvider,
    isConfigured,
    details: {
      supabaseConfigured,
      s3Configured,
      s3Endpoint: s3EndpointOrigin,
      s3Bucket: config.s3?.bucket,
      s3Region: config.s3?.region,
      backupConfigured,
      backupEndpoint: backupEndpointOrigin,
      backupBucket: config.backupS3?.bucket,
      backupRegion: config.backupS3?.region,
    },
  };
}

