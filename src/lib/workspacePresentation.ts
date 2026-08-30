import type { WorkspaceSyncStatus } from "./workspaceSync.ts";

export interface WorkspacePresentationInput {
  /** True only while the current user/company scope has no usable workspace data yet. */
  readonly initialLoadPending: boolean;
  readonly syncStatus: WorkspaceSyncStatus;
}

export interface WorkspacePresentationState {
  /** Existing route content may be replaced only during the first usable load. */
  readonly blocking: boolean;
  /** A status indicator may report this without hiding existing route content. */
  readonly backgroundRefreshing: boolean;
}

/**
 * Keep initial hydration separate from focus/visibility/realtime refreshes.
 * `initialLoadPending` is already cache-aware in App.tsx: it stays false when
 * a usable current or cached group can be rendered while revalidation runs.
 */
export function workspacePresentationState(
  input: WorkspacePresentationInput,
): WorkspacePresentationState {
  const backgroundRefreshing = !input.initialLoadPending
    && (input.syncStatus === "connecting" || input.syncStatus === "syncing");
  return {
    blocking: input.initialLoadPending,
    backgroundRefreshing,
  };
}
