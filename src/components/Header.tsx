import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  BriefcaseBusiness,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FilePlus2,
  Files,
  HardHat,
  Mail,
  LogOut,
  Menu,
  MoreHorizontal,
  PanelLeftClose,
  Receipt,
  RefreshCw,
  Settings as SettingsIcon,
  ShoppingCart,
  UserCircle2,
  WifiOff,
  WalletCards,
  X,
} from "lucide-react";
import {
  getDefaultChildRoute,
  getNavigationModel,
  getPrimaryModuleForRoute,
  type NavigationModule,
  type NavigationRoute,
} from "../navigation/navigationModel.ts";
import { navigationModuleTourTarget, navigationRouteTourTarget } from "../navigation/navigationTours.ts";
import { getRouteForAppTab, type AppTab, type RouteId } from "../utils/routes";
import type { PermissionKey } from "../utils/accessControl.ts";
import type { WorkspaceSyncStatus } from "../lib/workspaceSync";
import { BrandMark } from "./BrandMark.tsx";
import { useDialogFocus } from "./ui/useDialogFocus.ts";
import type { CompanySummary } from "../lib/companyAccess";
import { BRAND } from "../config/brand.ts";

export type { AppTab } from "../utils/routes";

export interface HeaderProps {
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
  /** Optional direct permission input for callers that do not already build visibleRouteIds. */
  permissions?: readonly PermissionKey[];
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const routeIcons: Record<RouteId, React.ElementType> = {
  dashboard: BarChart3,
  cash: WalletCards,
  projects: BriefcaseBusiness,
  procurement: ShoppingCart,
  extract: FilePlus2,
  invoices: Files,
  payroll: HardHat,
  expenses: Receipt,
  vendors: Building2,
  reports: BarChart3,
  inbox: Mail,
  review: ClipboardCheck,
  settings: SettingsIcon,
};

function badgeCountFor(routeId: RouteId, invoicesCount: number, reviewCount: number) {
  if (routeId === "invoices") return invoicesCount;
  if (routeId === "review") return reviewCount;
  return 0;
}

function badgeLabelFor(routeId: RouteId, count: number) {
  if (!count) return "";
  if (routeId === "review") return `${count} item${count === 1 ? "" : "s"} needing review`;
  return `${count} invoice${count === 1 ? "" : "s"}`;
}

function workspaceSyncLabel(status: WorkspaceSyncStatus) {
  if (status === "guest") return "Browser-only workspace";
  if (status === "connecting") return "Connecting";
  if (status === "syncing") return "Syncing";
  if (status === "offline") return "Offline";
  if (status === "degraded") return "Reconnecting";
  if (status === "error") return "Sync issue";
  return "Synced";
}

function workspaceSyncClasses(status: WorkspaceSyncStatus) {
  if (status === "guest") return "border-slate-700 bg-slate-900 text-slate-300";
  if (status === "offline" || status === "error") return "border-rose-400/30 bg-rose-500/10 text-rose-200";
  if (status === "degraded" || status === "connecting") return "border-amber-400/30 bg-amber-500/10 text-amber-200";
  if (status === "syncing") return "border-indigo-400/30 bg-indigo-500/10 text-indigo-200";
  return "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
}

interface NavigationRouteButtonProps {
  route: NavigationRoute;
  active: boolean;
  menuItem?: boolean;
  sidebar?: boolean;
  collapsed?: boolean;
  invoicesCount: number;
  reviewCount: number;
  onSelect: (route: NavigationRoute) => void;
}

const NavigationRouteButton: React.FC<NavigationRouteButtonProps> = ({
  route,
  active,
  menuItem = false,
  sidebar = false,
  collapsed = false,
  invoicesCount,
  reviewCount,
  onSelect,
}) => {
  const Icon = routeIcons[route.id];
  const badgeCount = badgeCountFor(route.id, invoicesCount, reviewCount);
  const badgeLabel = badgeLabelFor(route.id, badgeCount);
  const accessibleLabel = badgeLabel ? `${route.label}, ${badgeLabel}` : route.label;

  if (sidebar && collapsed) {
    return (
      <button
        type="button"
        data-tour={navigationRouteTourTarget(route.id)}
        onClick={() => onSelect(route)}
        aria-label={accessibleLabel}
        aria-current={active ? "page" : undefined}
        title={accessibleLabel}
        className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition ${
          active
            ? "bg-white/15 text-white shadow-sm ring-1 ring-white/20"
            : "text-slate-400 hover:bg-white/10 hover:text-slate-100"
        } mx-auto`}
      >
        <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${active ? "text-indigo-300" : "text-slate-400 group-hover:text-slate-200"}`} />
        {badgeCount > 0 && (
          <span
            aria-hidden="true"
            className={`absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-black leading-none ${
              route.id === "review" ? "bg-amber-400 text-amber-950" : "bg-indigo-400 text-indigo-950"
            }`}
          >
            {badgeCount}
          </span>
        )}
      </button>
    );
  }

  const classes = sidebar
    ? `group flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${active ? "bg-white/12 text-white" : "text-slate-400 hover:bg-white/7 hover:text-slate-100"}`
    : `${menuItem ? "w-full justify-start" : ""} relative inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all sm:px-3 ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/70 hover:text-slate-900"}`;

  return (
    <button
      type="button"
      data-tour={navigationRouteTourTarget(route.id)}
      onClick={() => onSelect(route)}
      aria-label={accessibleLabel}
      aria-current={active ? "page" : undefined}
      title={accessibleLabel}
      className={classes}
    >
      <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${active && sidebar ? "text-indigo-300" : "text-slate-500 group-hover:text-slate-300"}`} />
      <span className="min-w-0 flex-1 truncate">{route.label}</span>
      {badgeCount > 0 && <span aria-hidden="true" className={`rounded-full px-1.5 text-[9px] leading-4 ${sidebar ? (route.id === "review" ? "bg-amber-400 text-amber-950" : "bg-indigo-400 text-indigo-950") : `text-white ${route.id === "review" ? "bg-amber-500" : "bg-indigo-600"}`}`}>{badgeCount}</span>}
    </button>
  );
};

interface NavigationModuleButtonProps {
  module: NavigationModule;
  active: boolean;
  sidebar?: boolean;
  collapsed?: boolean;
  expanded?: boolean;
  invoicesCount: number;
  onSelect: (module: NavigationModule) => void;
}

const NavigationModuleButton: React.FC<NavigationModuleButtonProps> = ({
  module,
  active,
  sidebar = false,
  collapsed = false,
  expanded = false,
  invoicesCount,
  onSelect,
}) => {
  const route = module.defaultRoute;
  if (!route) return null;
  const Icon = routeIcons[route.id];
  const accessibleLabel = module.id === "invoices" && invoicesCount > 0
    ? `${module.label}, ${invoicesCount} invoice${invoicesCount === 1 ? "" : "s"}`
    : module.label;

  if (sidebar && collapsed) {
    return (
      <button
        type="button"
        data-tour={navigationModuleTourTarget(module.id)}
        onClick={() => onSelect(module)}
        aria-label={accessibleLabel}
        aria-current={active ? "page" : undefined}
        aria-expanded={module.id === "invoices" ? expanded : undefined}
        title={accessibleLabel}
        className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition ${
          active
            ? "bg-white/15 text-white shadow-sm ring-1 ring-white/20"
            : "text-slate-400 hover:bg-white/10 hover:text-slate-100"
        } mx-auto`}
      >
        <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${active ? "text-indigo-300" : "text-slate-400 group-hover:text-slate-200"}`} />
        {module.id === "invoices" && invoicesCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-400 px-1 text-[9px] font-black leading-none text-indigo-950"
          >
            {invoicesCount}
          </span>
        )}
      </button>
    );
  }

  const classes = sidebar
    ? `group flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-bold transition ${active ? "bg-white/12 text-white" : "text-slate-300 hover:bg-white/7 hover:text-white"}`
    : `relative inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all sm:px-3 ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/70 hover:text-slate-900"}`;

  return (
    <button
      type="button"
      data-tour={navigationModuleTourTarget(module.id)}
      onClick={() => onSelect(module)}
      aria-label={accessibleLabel}
      aria-current={active ? "page" : undefined}
      aria-expanded={module.id === "invoices" ? expanded : undefined}
      aria-controls={module.id === "invoices" ? "invoice-navigation" : undefined}
      title={accessibleLabel}
      className={classes}
    >
      <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${active && sidebar ? "text-indigo-300" : "text-slate-500 group-hover:text-slate-300"}`} />
      <span className="min-w-0 flex-1 truncate">{module.label}</span>
      {module.id === "invoices" && invoicesCount > 0 && <span aria-hidden="true" className={`rounded-full px-1.5 text-[9px] leading-4 ${sidebar ? "bg-indigo-400 text-indigo-950" : "bg-indigo-600 text-white"}`}>{invoicesCount}</span>}
    </button>
  );
};

export const Header: React.FC<HeaderProps> = ({
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
  permissions,
  collapsed = false,
  onToggleCollapse,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [invoicesExpanded, setInvoicesExpanded] = useState(() => ["invoices", "extractor", "review", "vendors"].includes(activeTab));
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileCloseButtonRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useDialogFocus({
    open: mobileOpen,
    onClose: () => setMobileOpen(false),
    initialFocusRef: mobileCloseButtonRef,
  });
  const activeRoute = getRouteForAppTab(activeTab);
  const activeRouteId = activeRoute?.id || null;
  const activeModuleDefinition = getPrimaryModuleForRoute(activeRouteId);
  const activeCompany = companies.find((company) => company.id === activeCompanyId);
  const syncStatus = workspaceSyncStatus as WorkspaceSyncStatus;
  const effectivePermissions = syncStatus === "guest" && !accountEmail ? undefined : permissions;
  const navigationFilter = useMemo(() => ({ permissions: effectivePermissions, visibleRouteIds }), [effectivePermissions, visibleRouteIds]);
  const navigation = useMemo(() => getNavigationModel(navigationFilter), [navigationFilter]);
  const activeModule = activeModuleDefinition ? navigation.modules.find((module) => module.id === activeModuleDefinition.id) : undefined;
  const syncLabel = workspaceSyncLabel(syncStatus);
  const SyncIcon = syncStatus === "synced"
    ? CheckCircle2
    : syncStatus === "syncing"
      ? RefreshCw
      : syncStatus === "offline"
        ? WifiOff
        : syncStatus === "degraded" || syncStatus === "error"
          ? AlertTriangle
          : MoreHorizontal;
  const syncTitle = syncStatus === "guest"
    ? "Data in this workspace is stored on this device and will not sync to other browsers until you connect or sign in."
    : syncLabel;
  const accountHasActions = Boolean(accountEmail || onSignOut || navigation.settingsRoute);
  const routeContext = activeModule
    ? activeRouteId && activeRouteId !== activeModule.defaultRouteId
      ? `${activeModule.label} / ${activeRoute?.label || "Workspace"}`
      : activeModule.label
    : activeRoute?.label || "Workspace";

  useEffect(() => {
    setMobileOpen(false);
    setAccountOpen(false);
    if (activeModule?.id === "invoices") setInvoicesExpanded(true);
  }, [activeTab, activeModule?.id]);

  useEffect(() => {
    if (!mobileOpen && !accountOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (accountOpen) {
        setAccountOpen(false);
        accountButtonRef.current?.focus();
      } else {
        setMobileOpen(false);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [accountOpen, mobileOpen]);

  useEffect(() => {
    if (!accountOpen) return undefined;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node) && !accountButtonRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [accountOpen]);

  const selectRoute = (route: NavigationRoute) => {
    setActiveTab(route.appTab);
    setMobileOpen(false);
    setAccountOpen(false);
  };

  const selectModule = (module: NavigationModule) => {
    if (module.id === "invoices") setInvoicesExpanded((value) => !value);
    const route = getDefaultChildRoute(module.id, navigationFilter);
    if (route) {
      setActiveTab(route.appTab);
      setMobileOpen(false);
      setAccountOpen(false);
    }
  };

  const handleSignOut = async () => {
    if (!onSignOut) return;
    setAccountBusy(true);
    try {
      await onSignOut();
      setAccountOpen(false);
    } finally {
      setAccountBusy(false);
    }
  };

  return (
    <>
      {mobileOpen && <button type="button" aria-hidden="true" tabIndex={-1} aria-label="Close navigation" className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden" onClick={() => setMobileOpen(false)} />}
      <aside
        ref={mobileDrawerRef}
        id="workspace-navigation-drawer"
        role={mobileOpen ? "dialog" : undefined}
        aria-modal={mobileOpen ? "true" : undefined}
        className={`fixed inset-y-0 left-0 z-50 flex-col border-r border-slate-800 bg-slate-950 text-slate-100 shadow-2xl shadow-slate-950/20 transition-[width,transform] duration-200 lg:shadow-none ${
          collapsed ? "w-[4.25rem]" : "w-[16.5rem]"
        } ${mobileOpen ? "flex translate-x-0 !w-[16.5rem]" : "hidden lg:flex lg:translate-x-0"}`}
        aria-label="Workspace navigation"
      >
        {collapsed && !mobileOpen ? (
          <div className="flex flex-col items-center justify-center border-b border-white/10 px-2 py-4">
            <button
              type="button"
              onClick={onToggleCollapse}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500 text-white shadow-lg shadow-indigo-950/30 hover:bg-indigo-400 transition"
              title="Expand sidebar"
              aria-label="Expand sidebar"
            >
              <BrandMark variant="compact" decorative />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <BrandMark variant="sidebar" decorative />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black tracking-tight text-white">{BRAND.productName}</p>
                <p className="whitespace-normal break-words text-[10px] font-semibold leading-3 text-slate-400">{BRAND.companyName}</p>
              </div>
            </div>
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="hidden lg:flex items-center justify-center rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white transition"
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              ref={mobileCloseButtonRef}
              className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
              aria-label="Close navigation"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className={`min-h-0 flex-1 overflow-y-auto ${collapsed && !mobileOpen ? "px-1.5" : "px-3"} py-4 ops-scrollbar`}>
          {!collapsed || mobileOpen ? <p className="mb-2 px-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Operations</p> : null}
          <nav className="space-y-1" aria-label="Primary navigation">
            {navigation.modules.map((module) => (
              <div key={module.id}>
                <NavigationModuleButton
                  module={module}
                  active={activeModule?.id === module.id}
                  sidebar
                  collapsed={collapsed && !mobileOpen}
                  expanded={module.id === "invoices" ? invoicesExpanded : undefined}
                  invoicesCount={invoicesCount}
                  onSelect={selectModule}
                />
                {module.id === "invoices" && (!collapsed || mobileOpen) && module.routes.length > 1 && (
                  <div id="invoice-navigation" hidden={!invoicesExpanded} className="ml-4 mt-1 space-y-0.5 border-l border-white/10 pl-2" aria-label="Invoice navigation">
                    {module.routes.map((route) => (
                      <NavigationRouteButton
                        key={route.id}
                        route={route}
                        active={route.id === activeRouteId}
                        sidebar
                        menuItem
                        invoicesCount={invoicesCount}
                        reviewCount={reviewCount}
                        onSelect={selectRoute}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </nav>
          {navigation.settingsRoute && (
            <div className="mt-6 border-t border-white/10 pt-4">
              {!collapsed || mobileOpen ? <p className="mb-2 px-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Workspace</p> : null}
              <NavigationRouteButton
                route={navigation.settingsRoute}
                active={activeRouteId === navigation.settingsRoute.id}
                sidebar
                collapsed={collapsed && !mobileOpen}
                menuItem
                invoicesCount={invoicesCount}
                reviewCount={reviewCount}
                onSelect={selectRoute}
              />
            </div>
          )}
        </div>

        {collapsed && !mobileOpen ? (
          <div className="border-t border-white/10 px-2 py-3 flex flex-col items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg border text-xs font-bold ${workspaceSyncClasses(syncStatus)}`}
              title={syncTitle}
              aria-label={syncTitle}
            >
              <SyncIcon aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 ${syncStatus === "syncing" ? "animate-spin" : ""}`} />
            </div>
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 transition"
              title={accountEmail || activeCompany?.name || "Local workspace"}
              aria-label={accountEmail || activeCompany?.name || "Local workspace"}
            >
              <UserCircle2 aria-hidden="true" className="h-5 w-5 shrink-0" />
            </div>
          </div>
        ) : (
          <div className="border-t border-white/10 px-3 py-3">
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex min-w-0 items-center gap-2" title={accountEmail || activeCompany?.name || "Local workspace"}>
                <UserCircle2 aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-slate-300">{accountEmail || activeCompany?.name || "Local workspace"}</p>
                  <p className="truncate text-[10px] text-slate-500">{activeCompany?.name && accountEmail ? activeCompany.name : "Workspace context"}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>

      <header
        className={`sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur transition-[margin] duration-200 ${
          collapsed ? "lg:ml-[4.25rem]" : "lg:ml-[16.5rem]"
        }`}
      >
        <div className="flex min-h-14 items-center gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
          <button ref={mobileMenuButtonRef} type="button" onClick={() => setMobileOpen(true)} className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-600 shadow-sm hover:border-indigo-200 hover:text-indigo-700 lg:hidden" aria-label="Open navigation" aria-expanded={mobileOpen} aria-controls="workspace-navigation-drawer"><Menu className="h-4 w-4" /></button>
          <BrandMark variant="header" decorative />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-600 sm:text-base">
              <span className="hidden sm:inline"><span className="font-bold text-slate-900">{BRAND.productName}</span><span className="mx-1.5 text-slate-300">/</span></span>
              <span className="font-bold text-slate-900 sm:font-normal">{routeContext}</span>
            </p>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2 pb-0.5">
            <div className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold ${syncStatus === "guest" ? "border-amber-200 bg-amber-50 text-amber-800" : syncStatus === "offline" || syncStatus === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`} title={syncTitle} aria-label={syncTitle}><SyncIcon aria-hidden="true" className={`h-3.5 w-3.5 ${syncStatus === "syncing" ? "animate-spin" : ""}`} /><span className="hidden md:inline">{syncLabel}</span></div>
            {invoicesCount > 0 && <button type="button" onClick={onBatchExportExcel} className="hidden min-h-10 items-center gap-1.5 whitespace-nowrap rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 sm:inline-flex"><Download aria-hidden="true" className="h-3.5 w-3.5" /> Export</button>}
            {accountHasActions && <div className="relative shrink-0" ref={accountMenuRef}>
              <button ref={accountButtonRef} type="button" onClick={() => setAccountOpen((open) => !open)} aria-label={accountEmail ? `Account: ${accountEmail}` : "Account menu"} aria-expanded={accountOpen} aria-controls="header-account-menu" className="inline-flex min-h-10 max-w-[12rem] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-bold text-slate-700 shadow-sm hover:border-indigo-200 hover:text-indigo-700"><UserCircle2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-indigo-600" /><span className="hidden max-w-[9rem] truncate sm:inline">{accountEmail || "Account"}</span></button>
              {accountOpen && <div id="header-account-menu" role="menu" aria-label="Account menu" className="absolute right-0 top-[calc(100%+0.5rem)] z-50 max-h-[min(70vh,28rem)] w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
                {accountEmail && <p className="truncate px-2 py-1.5 text-xs font-bold text-slate-600">{accountEmail}</p>}
                <p className="px-2 pb-1.5 text-[10px] font-semibold text-slate-400">Account / Workspace</p>
                {navigation.settingsRoute && <button type="button" role="menuitem" data-tour="route:settings" aria-current={activeTab === navigation.settingsRoute.appTab ? "page" : undefined} onClick={() => selectRoute(navigation.settingsRoute!)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50"><SettingsIcon aria-hidden="true" className="h-3.5 w-3.5" />Workspace Settings</button>}
                {navigation.settingsRoute && onSignOut && <div className="my-1 border-t border-slate-100" />}
                {onSignOut && <button type="button" role="menuitem" onClick={() => void handleSignOut()} disabled={accountBusy} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><LogOut aria-hidden="true" className="h-3.5 w-3.5" />{accountBusy ? "Signing out…" : "Sign out"}</button>}
              </div>}
            </div>}
          </div>
        </div>
      </header>
    </>
  );
};
