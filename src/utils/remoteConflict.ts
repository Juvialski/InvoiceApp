/**
 * Persistence decisions that must stay independent from React and Supabase.
 *
 * The application can use these decisions at the integration boundary when a
 * background refresh completes. They deliberately do not mutate records or
 * navigate; callers decide how to apply, defer, or surface the result.
 */

export type InvoiceSaveState = "saved" | "saving" | "unsaved" | "error";

export interface WorkspaceLoadToken {
  /** Monotonic value advanced whenever the authenticated workspace changes. */
  generation: number;
  /** Supabase auth user whose result was requested. */
  userId: string;
}

/**
 * A completed loader may update state only if it belongs to the current
 * authenticated generation and user. Requiring a non-empty user ID keeps an
 * authenticated result from being applied after sign-out.
 */
export function canApplyWorkspaceLoad(
  started: WorkspaceLoadToken,
  current: WorkspaceLoadToken | null | undefined,
): boolean {
  return Boolean(
    started.userId
      && current?.userId
      && started.generation === current.generation
      && started.userId === current.userId,
  );
}

export type RemoteInvoiceRefreshAction = "apply" | "defer";

export type RemoteInvoiceRefreshReason =
  | "not-selected"
  | "selected-clean"
  | "selected-removed"
  | "selected-unsaved"
  | "selected-saving"
  | "selected-save-error";

export interface RemoteInvoiceRefreshInput {
  invoiceId: string;
  selectedInvoiceId?: string | null;
  saveState: InvoiceSaveState;
  /** False means the canonical refresh no longer returned this invoice. */
  remoteExists: boolean;
}

export interface RemoteInvoiceRefreshDecision {
  action: RemoteInvoiceRefreshAction;
  reason: RemoteInvoiceRefreshReason;
  /** A deferred result should be retained as a pending remote update. */
  shouldMarkRemotePending: boolean;
  remoteExists: boolean;
}

/**
 * Decide whether a refreshed invoice can replace the current view.
 *
 * A selected invoice with unsaved, saving, or failed local work is protected
 * even when the server deleted/archived it. The caller can keep the local
 * draft, record the remote result as pending, and offer an explicit reload
 * after the local save state is resolved. Records outside the selected route
 * are safe to apply immediately.
 */
export function decideRemoteInvoiceRefresh(input: RemoteInvoiceRefreshInput): RemoteInvoiceRefreshDecision {
  const selected = input.selectedInvoiceId === input.invoiceId;
  if (!selected) {
    return {
      action: "apply",
      reason: "not-selected",
      shouldMarkRemotePending: false,
      remoteExists: input.remoteExists,
    };
  }

  if (input.saveState === "unsaved") {
    return { action: "defer", reason: "selected-unsaved", shouldMarkRemotePending: true, remoteExists: input.remoteExists };
  }
  if (input.saveState === "saving") {
    return { action: "defer", reason: "selected-saving", shouldMarkRemotePending: true, remoteExists: input.remoteExists };
  }
  if (input.saveState === "error") {
    return { action: "defer", reason: "selected-save-error", shouldMarkRemotePending: true, remoteExists: input.remoteExists };
  }

  return {
    action: "apply",
    reason: input.remoteExists ? "selected-clean" : "selected-removed",
    shouldMarkRemotePending: false,
    remoteExists: input.remoteExists,
  };
}

/** Resolve a refreshed record by the route's stable ID, never by position. */
export function resolveEntityById<T extends { id: string }>(records: readonly T[], routeId: string | null | undefined): T | null {
  if (!routeId) return null;
  return records.find((record) => record.id === routeId) || null;
}

/** Operational localStorage is valid only after auth has resolved to guest mode. */
export function shouldPersistGuestWorkspace(authResolved: boolean, userId?: string | null): boolean {
  return authResolved && !userId;
}
