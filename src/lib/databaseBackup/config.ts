import type { S3ProviderConfig } from "../storage/types.ts";
import { validateEncryptionKey } from "./crypto.ts";
import {
  type DatabaseBackupConfig,
  type DatabaseBackupHealthStatus,
  DatabaseBackupConfigurationError,
} from "./types.ts";

export interface DatabaseBackupEnvironment {
  NODE_ENV?: string;
  DATABASE_BACKUP_ENCRYPTION_KEY?: string;
  DATABASE_BACKUP_KEY_ID?: string;

  DATABASE_BACKUP_STORAGE_PROVIDER?: string;
  STORAGE_BACKUP_PROVIDER?: string;
  DATABASE_BACKUP_S3_ENDPOINT?: string;
  STORAGE_BACKUP_ENDPOINT?: string;
  BACKBLAZE_B2_ENDPOINT?: string;
  B2_ENDPOINT?: string;
  DATABASE_BACKUP_S3_BUCKET?: string;
  STORAGE_BACKUP_BUCKET?: string;
  BACKBLAZE_B2_BUCKET?: string;
  B2_BUCKET?: string;
  DATABASE_BACKUP_S3_REGION?: string;
  STORAGE_BACKUP_REGION?: string;
  BACKBLAZE_B2_REGION?: string;
  B2_REGION?: string;
  DATABASE_BACKUP_S3_ACCESS_KEY_ID?: string;
  STORAGE_BACKUP_ACCESS_KEY_ID?: string;
  BACKBLAZE_B2_ACCESS_KEY_ID?: string;
  B2_ACCESS_KEY_ID?: string;
  DATABASE_BACKUP_S3_SECRET_ACCESS_KEY?: string;
  STORAGE_BACKUP_SECRET_ACCESS_KEY?: string;
  BACKBLAZE_B2_SECRET_ACCESS_KEY?: string;
  B2_SECRET_ACCESS_KEY?: string;
  DATABASE_BACKUP_S3_FORCE_PATH_STYLE?: string;
  STORAGE_BACKUP_FORCE_PATH_STYLE?: string;

  DATABASE_RESTORE_DRILLS_ENABLED?: string;
  DATABASE_RESTORE_TARGET_URL?: string;
  DATABASE_URL?: string;
  SUPABASE_DB_URL?: string;
  POSTGRES_URL?: string;
}

function getEnvValue(env: DatabaseBackupEnvironment, ...keys: (keyof DatabaseBackupEnvironment)[]): string {
  for (const key of keys) {
    const val = env[key]?.trim();
    if (val) return val;
  }
  return "";
}

export function loadDatabaseBackupConfig(
  env: DatabaseBackupEnvironment = process.env,
): DatabaseBackupConfig {
  const nodeEnv = (env.NODE_ENV || process.env.NODE_ENV || "").toLowerCase();

  const rawKey = getEnvValue(env, "DATABASE_BACKUP_ENCRYPTION_KEY");
  if (!rawKey) {
    throw new DatabaseBackupConfigurationError(
      "Missing DATABASE_BACKUP_ENCRYPTION_KEY in environment. Database backups require a 256-bit encryption key.",
    );
  }

  let keyBuffer: Buffer;
  try {
    keyBuffer = validateEncryptionKey(rawKey);
  } catch (err: any) {
    throw new DatabaseBackupConfigurationError(
      `Invalid DATABASE_BACKUP_ENCRYPTION_KEY: ${err.message}`,
    );
  }

  const keyId = getEnvValue(env, "DATABASE_BACKUP_KEY_ID") || "engoryx-db-primary-v1";

  const providerRaw = getEnvValue(
    env,
    "DATABASE_BACKUP_STORAGE_PROVIDER",
    "STORAGE_BACKUP_PROVIDER",
  ).toLowerCase();

  if (!providerRaw) {
    throw new DatabaseBackupConfigurationError(
      "Database backup storage is not configured. Set DATABASE_BACKUP_STORAGE_PROVIDER=s3 (or reuse STORAGE_BACKUP_PROVIDER) and provide the independent S3/B2 endpoint, bucket, and credentials.",
    );
  }

  let storageProvider: "s3" | "memory";
  if (providerRaw === "s3" || providerRaw === "b2" || providerRaw === "backblaze") {
    storageProvider = "s3";
  } else if (providerRaw === "memory") {
    if (nodeEnv !== "test") {
      throw new DatabaseBackupConfigurationError(
        "Memory storage provider is test-only and cannot be used for durable database backups outside NODE_ENV=test.",
      );
    }
    storageProvider = "memory";
  } else {
    throw new DatabaseBackupConfigurationError(
      `Unsupported database backup storage provider: "${providerRaw}". Supported durable provider is "s3"; "memory" is test-only.`,
    );
  }

  let s3Config: S3ProviderConfig | undefined;
  if (storageProvider === "s3") {
    const endpoint = getEnvValue(
      env,
      "DATABASE_BACKUP_S3_ENDPOINT",
      "STORAGE_BACKUP_ENDPOINT",
      "BACKBLAZE_B2_ENDPOINT",
      "B2_ENDPOINT",
    );
    const bucket = getEnvValue(
      env,
      "DATABASE_BACKUP_S3_BUCKET",
      "STORAGE_BACKUP_BUCKET",
      "BACKBLAZE_B2_BUCKET",
      "B2_BUCKET",
    );
    const region =
      getEnvValue(
        env,
        "DATABASE_BACKUP_S3_REGION",
        "STORAGE_BACKUP_REGION",
        "BACKBLAZE_B2_REGION",
        "B2_REGION",
      ) || "auto";
    const accessKeyId = getEnvValue(
      env,
      "DATABASE_BACKUP_S3_ACCESS_KEY_ID",
      "STORAGE_BACKUP_ACCESS_KEY_ID",
      "BACKBLAZE_B2_ACCESS_KEY_ID",
      "B2_ACCESS_KEY_ID",
    );
    const secretAccessKey = getEnvValue(
      env,
      "DATABASE_BACKUP_S3_SECRET_ACCESS_KEY",
      "STORAGE_BACKUP_SECRET_ACCESS_KEY",
      "BACKBLAZE_B2_SECRET_ACCESS_KEY",
      "B2_SECRET_ACCESS_KEY",
    );
    const forcePathStyleRaw = getEnvValue(
      env,
      "DATABASE_BACKUP_S3_FORCE_PATH_STYLE",
      "STORAGE_BACKUP_FORCE_PATH_STYLE",
    );
    const forcePathStyle = forcePathStyleRaw ? forcePathStyleRaw === "true" : true;

    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      throw new DatabaseBackupConfigurationError(
        "Incomplete S3/B2 database-backup configuration: endpoint, bucket, access key ID, and secret access key are all required when a durable backup provider is selected.",
      );
    }

    s3Config = {
      endpoint,
      bucket,
      region,
      accessKeyId,
      secretAccessKey,
      forcePathStyle,
    };
  }

  const restoreDrillsEnabled =
    getEnvValue(env, "DATABASE_RESTORE_DRILLS_ENABLED").toLowerCase() === "true";
  const restoreTargetUrl = getEnvValue(env, "DATABASE_RESTORE_TARGET_URL") || undefined;
  const databaseUrl =
    getEnvValue(env, "DATABASE_URL", "SUPABASE_DB_URL", "POSTGRES_URL") || undefined;

  return {
    encryption: {
      key: keyBuffer,
      keyId,
      algorithm: "AES-256-GCM",
    },
    storageProvider,
    s3Config,
    restoreDrillsEnabled,
    restoreTargetUrl,
    databaseUrl,
  };
}

export function getDatabaseBackupHealth(
  env: DatabaseBackupEnvironment = process.env,
): DatabaseBackupHealthStatus {
  let encryptionConfigured = false;
  let keyId: string | undefined;

  const rawKey = getEnvValue(env, "DATABASE_BACKUP_ENCRYPTION_KEY");
  if (rawKey) {
    try {
      validateEncryptionKey(rawKey);
      encryptionConfigured = true;
      keyId = getEnvValue(env, "DATABASE_BACKUP_KEY_ID") || "engoryx-db-primary-v1";
    } catch {
      encryptionConfigured = false;
    }
  }

  const providerRaw = getEnvValue(
    env,
    "DATABASE_BACKUP_STORAGE_PROVIDER",
    "STORAGE_BACKUP_PROVIDER",
  ).toLowerCase();

  let storageProvider: "s3" | "memory" | undefined;
  if (providerRaw === "s3" || providerRaw === "b2" || providerRaw === "backblaze") {
    storageProvider = "s3";
  } else if (providerRaw === "memory") {
    storageProvider = "memory";
  }

  const endpoint = getEnvValue(
    env,
    "DATABASE_BACKUP_S3_ENDPOINT",
    "STORAGE_BACKUP_ENDPOINT",
    "BACKBLAZE_B2_ENDPOINT",
    "B2_ENDPOINT",
  );
  const bucket = getEnvValue(
    env,
    "DATABASE_BACKUP_S3_BUCKET",
    "STORAGE_BACKUP_BUCKET",
    "BACKBLAZE_B2_BUCKET",
    "B2_BUCKET",
  );
  const accessKeyId = getEnvValue(
    env,
    "DATABASE_BACKUP_S3_ACCESS_KEY_ID",
    "STORAGE_BACKUP_ACCESS_KEY_ID",
    "BACKBLAZE_B2_ACCESS_KEY_ID",
    "B2_ACCESS_KEY_ID",
  );
  const secretAccessKey = getEnvValue(
    env,
    "DATABASE_BACKUP_S3_SECRET_ACCESS_KEY",
    "STORAGE_BACKUP_SECRET_ACCESS_KEY",
    "BACKBLAZE_B2_SECRET_ACCESS_KEY",
    "B2_SECRET_ACCESS_KEY",
  );

  const nodeEnv = (env.NODE_ENV || process.env.NODE_ENV || "").toLowerCase();
  const storageConfigured =
    (storageProvider === "s3" && Boolean(endpoint && bucket && accessKeyId && secretAccessKey)) ||
    (storageProvider === "memory" && nodeEnv === "test");

  let storageEndpointOrigin: string | undefined;
  if (endpoint) {
    try {
      storageEndpointOrigin = new URL(endpoint).origin;
    } catch {
      storageEndpointOrigin = undefined;
    }
  }

  const restoreDrillsEnabled =
    getEnvValue(env, "DATABASE_RESTORE_DRILLS_ENABLED").toLowerCase() === "true";
  const hasRestoreTarget = Boolean(getEnvValue(env, "DATABASE_RESTORE_TARGET_URL"));
  const hasSourceDatabaseUrl = Boolean(
    getEnvValue(env, "DATABASE_URL", "SUPABASE_DB_URL", "POSTGRES_URL"),
  );

  return {
    isConfigured: encryptionConfigured && storageConfigured,
    encryptionConfigured,
    keyId,
    storageProvider,
    storageConfigured,
    storageBucket: storageConfigured ? bucket || "database-backups" : undefined,
    storageEndpoint: storageEndpointOrigin,
    restoreDrillsEnabled,
    hasRestoreTarget,
    hasSourceDatabaseUrl,
  };
}

export function getDatabaseBackupStorageDescriptor(
  env: DatabaseBackupEnvironment = process.env,
): {
  providerId: "s3" | "memory";
  bucket: string;
  endpoint?: string;
  region?: string;
  isExternal: boolean;
} {
  const config = loadDatabaseBackupConfig(env);

  if (config.storageProvider === "memory") {
    return {
      providerId: "memory",
      bucket: "database-backups",
      isExternal: false,
    };
  }

  if (!config.s3Config) {
    throw new DatabaseBackupConfigurationError(
      "Durable database backup provider was selected but S3/B2 configuration is unavailable.",
    );
  }

  return {
    providerId: "s3",
    bucket: config.s3Config.bucket,
    endpoint: config.s3Config.endpoint,
    region: config.s3Config.region,
    isExternal: true,
  };
}
