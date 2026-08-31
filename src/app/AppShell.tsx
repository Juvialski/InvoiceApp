import React, { useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Cloud, Loader2, X } from "lucide-react";
import { Header, type AppTab } from "../components/Header";
import { CompanySwitcher } from "../components/access/AccessStates.tsx";
import { BRAND } from "../config/brand";
import type { CompanySummary } from "../lib/companyAccess";
import type { WorkspaceSyncStatus } from "../lib/workspaceSync";
import type { PermissionKey } from "../utils/accessControl";
import type { RouteId } from "../utils/routes";
import type { DataCompleteness, ProjectCostSource } from "../utils/dataCompleteness.ts";
import { AppPermissionProvider } from "./AppPermissionContext.tsx";
import { workspacePresentationState } from "../lib/workspacePresentation.ts";
import { ErrorState } from "../components/ui/OperationsUI.tsx";

export interface ShellNotification {
  type: "success" | "error" | "info";
  message: string;
}

export interface ShellRemoteInvoiceUpdate {
  invoiceId: string;
  [key: string]: unknown;
}

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onError?: (error: Error, errorInfo: unknown) => void;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class AppErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: unknown): void {
    if (import.meta.env.DEV) {
      console.error("[AppErrorBoundary] Uncaught component error:", error, errorInfo);
    }
    this.props.onError?.(error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (typeof this.props.fallback === "function") {
        return this.props.fallback(this.state.error || new Error("Unknown error"), this.reset);
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <ErrorState
          className="m-4"
          title="This workspace section could not be displayed"
          description="An unexpected display error interrupted this section. Try again, or reload the page if the problem continues."
          onRetry={this.reset}
          onReload={() => window.location.reload()}
        />
      );
    }
    return this.props.children;
  }
}

export interface AppShellProps {
  children: ReactNode;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  invoicesCount: number;
  reviewCount: number;
  onBatchExportExcel: () => void;
  workspaceSyncStatus?: WorkspaceSyncStatus;
  accountEmail?: string;
  onSignOut?: () => Promise<void> | void;
  companies?: readonly CompanySummary[];
  activeCompanyId?: string | null;
  visibleRouteIds?: readonly RouteId[];
  permissions?: readonly PermissionKey[];
  projectCostCompleteness?: DataCompleteness<ProjectCostSource>;

  // Notification banners
  notification?: ShellNotification | null;
  onDismissNotification?: () => void;

  // Remote invoice conflict
  remoteInvoiceUpdate?: ShellRemoteInvoiceUpdate | null;
  selectedInvoiceId?: string | null;
  saveState?: string;
  onReloadRemoteInvoice?: () => void;
  onKeepEditingRemoteInvoice?: () => void;

  // Workspace status
  isSupabaseConfigured?: boolean;
  workspaceLoading?: boolean;

  // Route error / not found
  routeNotFound?: boolean;
  onReturnToDashboard?: () => void;

  // Optional custom footer
  footerText?: string;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  activeTab,
  setActiveTab,
  invoicesCount,
  reviewCount,
  onBatchExportExcel,
  workspaceSyncStatus = "guest",
  accountEmail,
  onSignOut,
  companies = [],
  activeCompanyId,
  visibleRouteIds,
  permissions = [],
  projectCostCompleteness,
  notification,
  onDismissNotification,
  remoteInvoiceUpdate,
  selectedInvoiceId,
  saveState,
  onReloadRemoteInvoice,
  onKeepEditingRemoteInvoice,
  isSupabaseConfigured = true,
  workspaceLoading = false,
  routeNotFound = false,
  onReturnToDashboard,
  footerText = BRAND.footerText,
}) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("engoryx_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const handleToggleCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("engoryx_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  const workspacePresentation = workspacePresentationState({
    initialLoadPending: workspaceLoading,
    syncStatus: workspaceSyncStatus,
  });
  const workspaceDataPending = workspacePresentation.blocking;

  return (
    <AppPermissionProvider
      permissions={permissions}
      projectCostCompleteness={projectCostCompleteness}
      workspaceDataPending={workspaceDataPending}
    >
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
        <Header
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          invoicesCount={invoicesCount}
          reviewCount={reviewCount}
          onBatchExportExcel={onBatchExportExcel}
          workspaceSyncStatus={workspaceSyncStatus}
          accountEmail={accountEmail}
          onSignOut={onSignOut}
          companies={companies}
          activeCompanyId={activeCompanyId}
          visibleRouteIds={visibleRouteIds}
          permissions={permissions}
          collapsed={isSidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />

        <main
          className={`min-w-0 flex-1 overflow-x-hidden px-4 py-5 sm:px-6 lg:px-8 2xl:px-10 transition-[margin] duration-200 ${
            isSidebarCollapsed ? "lg:ml-[4.25rem]" : "lg:ml-[16.5rem]"
          }`}
        >
          {remoteInvoiceUpdate && selectedInvoiceId === remoteInvoiceUpdate.invoiceId && (
            <div
              role="status"
              className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs text-amber-950 sm:flex-row sm:items-center sm:justify-between"
            >
              <p>
                <strong>This invoice was updated in another browser.</strong> Your local edits are protected.
              </p>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={onReloadRemoteInvoice}
                  disabled={saveState === "saving"}
                  className="inline-flex min-h-10 items-center rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Reload latest
                </button>
                <button
                  type="button"
                  onClick={onKeepEditingRemoteInvoice}
                  className="inline-flex min-h-10 items-center rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white"
                >
                  Keep editing
                </button>
              </div>
            </div>
          )}

          {notification && (
            <div
              role={notification.type === "error" ? "alert" : "status"}
              className={`mb-5 flex items-start justify-between gap-3 rounded-2xl border p-3.5 text-sm shadow-sm ${
                notification.type === "success"
                  ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                  : notification.type === "error"
                    ? "bg-rose-50 text-rose-900 border-rose-200"
                    : "bg-white text-slate-800 border-slate-200"
              }`}
            >
              <div className="flex min-w-0 items-start gap-2.5">
                {notification.type === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span className="min-w-0 break-words font-semibold">{notification.message}</span>
              </div>
              {onDismissNotification && (
                <button
                  type="button"
                  aria-label="Dismiss notification"
                  onClick={onDismissNotification}
                  className="inline-flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {!isSupabaseConfigured && (
            <div className="mb-5 flex flex-col items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row">
              <Cloud className="w-5 h-5 text-amber-700 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-amber-900">Browser-only workspace</p>
                <p className="text-[11px] text-amber-800 mt-1">
                  Data in this workspace is stored on this device and will not sync to other browsers until you connect or sign in.
                </p>
              </div>
              <a href="/demo" className="inline-flex min-h-10 shrink-0 items-center rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-900 hover:bg-amber-100">
                Try the demo
              </a>
            </div>
          )}

          {workspaceLoading && (
            <div className="mb-5 flex min-h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3.5 text-sm font-semibold">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
              Loading workspace…
            </div>
          )}

          {routeNotFound && (
            <div className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-6">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-rose-700">Navigation error</p>
              <h2 className="mt-1 text-lg font-black text-rose-950">Page not found</h2>
              <p className="mt-1 text-xs text-rose-900">The requested workspace record or destination is not available.</p>
              {onReturnToDashboard && (
                <button
                  type="button"
                  onClick={onReturnToDashboard}
                  className="mt-4 inline-flex min-h-10 items-center rounded-xl bg-rose-700 px-3 py-2 text-xs font-black text-white"
                >
                  Return to dashboard
                </button>
              )}
            </div>
          )}

          <div className="mx-auto w-full max-w-[1600px]">
            <AppErrorBoundary>{children}</AppErrorBoundary>
          </div>
        </main>

        <footer
          className={`border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500 transition-[margin] duration-200 ${
            isSidebarCollapsed ? "lg:ml-[4.25rem]" : "lg:ml-[16.5rem]"
          }`}
        >
          {footerText}
        </footer>
      </div>
    </AppPermissionProvider>
  );
};

export { CompanySwitcher };
export default AppShell;