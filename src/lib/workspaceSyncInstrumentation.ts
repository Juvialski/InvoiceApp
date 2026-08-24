import type { WorkspaceRefreshGroup } from "./workspaceSync.ts";

export const WORKSPACE_SYNC_INSTRUMENTATION_EVENTS = [
  "FULL_LOAD",
  "GROUP_REFRESH",
  "ACCESS_REFRESH",
  "SYNC_RECREATION",
  "COMPANY_CHANGE",
  "AUTH_SESSION",
] as const;

export type WorkspaceSyncInstrumentationEvent = (typeof WORKSPACE_SYNC_INSTRUMENTATION_EVENTS)[number];

export interface WorkspaceSyncInstrumentationDetails {
  userId?: string | null;
  companyId?: string | null;
  previousCompanyId?: string | null;
  group?: WorkspaceRefreshGroup | string;
  groups?: readonly (WorkspaceRefreshGroup | string)[];
  reason?: string;
  generation?: number;
  [key: string]: unknown;
}

export interface WorkspaceSyncInstrumentationRecord {
  readonly event: WorkspaceSyncInstrumentationEvent;
  readonly at: number;
  readonly details: Readonly<WorkspaceSyncInstrumentationDetails>;
}

export interface WorkspaceSyncInstrumentationOptions {
  /** Defaults to the current browser/build environment. */
  enabled?: boolean;
  now?: () => number;
  onEvent?: (record: WorkspaceSyncInstrumentationRecord) => void;
  logger?: (record: WorkspaceSyncInstrumentationRecord) => void;
}

export interface WorkspaceSyncInstrumentation {
  readonly enabled: boolean;
  record: (event: WorkspaceSyncInstrumentationEvent, details?: WorkspaceSyncInstrumentationDetails) => void;
  emit: (event: WorkspaceSyncInstrumentationEvent, details?: WorkspaceSyncInstrumentationDetails) => void;
  fullLoad: (details?: WorkspaceSyncInstrumentationDetails) => void;
  groupRefresh: (details?: WorkspaceSyncInstrumentationDetails) => void;
  accessRefresh: (details?: WorkspaceSyncInstrumentationDetails) => void;
  syncRecreation: (details?: WorkspaceSyncInstrumentationDetails) => void;
  companyChange: (details?: WorkspaceSyncInstrumentationDetails) => void;
  authSession: (details?: WorkspaceSyncInstrumentationDetails) => void;
}

type ImportMetaWithEnv = ImportMeta & { env?: { DEV?: boolean } };
type ProcessLike = { env?: { NODE_ENV?: string } };

/**
 * Detect the development/test builds supported by Vite and Node without
 * importing a runtime-specific dependency. Unknown environments are disabled
 * by default so a production bundle cannot accidentally start logging.
 */
export function isWorkspaceSyncDevelopment(): boolean {
  const importMetaEnv = (import.meta as ImportMetaWithEnv).env;
  if (typeof importMetaEnv?.DEV === "boolean") return importMetaEnv.DEV;
  const processLike = (globalThis as typeof globalThis & { process?: ProcessLike }).process;
  return processLike?.env?.NODE_ENV === "development" || processLike?.env?.NODE_ENV === "test";
}

function safeDetails(details: WorkspaceSyncInstrumentationDetails | undefined): Readonly<WorkspaceSyncInstrumentationDetails> {
  const copy: WorkspaceSyncInstrumentationDetails = { ...(details || {}) };
  if (Array.isArray(copy.groups)) copy.groups = Object.freeze([...copy.groups]);
  return Object.freeze(copy);
}

/**
 * Create no-op-by-default instrumentation for the workspace load/sync seams.
 * Production is silent unless a caller explicitly opts into `enabled`; the
 * normal application path should rely on the environment default.
 */
export function createWorkspaceSyncInstrumentation(
  options: WorkspaceSyncInstrumentationOptions = {},
): WorkspaceSyncInstrumentation {
  const enabled = options.enabled ?? isWorkspaceSyncDevelopment();
  const now = options.now || (() => Date.now());

  function record(event: WorkspaceSyncInstrumentationEvent, details?: WorkspaceSyncInstrumentationDetails) {
    if (!enabled) return;
    const recordValue = Object.freeze({
      event,
      at: now(),
      details: safeDetails(details),
    });
    try {
      options.onEvent?.(recordValue);
    } catch {
      // Instrumentation must never interfere with loading or synchronization.
    }
    try {
      if (options.logger) {
        options.logger(recordValue);
      } else if (!options.onEvent && typeof console !== "undefined" && typeof console.debug === "function") {
        console.debug(`[InvoiceApp workspaceSync] ${event}`, recordValue.details);
      }
    } catch {
      // Console/devtools adapters are also non-critical.
    }
  }

  const instrumentation: WorkspaceSyncInstrumentation = {
    enabled,
    record,
    emit: record,
    fullLoad: (details) => record("FULL_LOAD", details),
    groupRefresh: (details) => record("GROUP_REFRESH", details),
    accessRefresh: (details) => record("ACCESS_REFRESH", details),
    syncRecreation: (details) => record("SYNC_RECREATION", details),
    companyChange: (details) => record("COMPANY_CHANGE", details),
    authSession: (details) => record("AUTH_SESSION", details),
  };
  return instrumentation;
}
