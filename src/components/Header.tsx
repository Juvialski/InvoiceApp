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
  MoreHorizontal,
  Receipt,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldCheck,
  UserCircle2,
  WifiOff,
} from "lucide-react";
import {
  getDefaultChildRoute,
  getNavigationModel,
  getPrimaryModuleForRoute,
  type NavigationModule,
  type NavigationRoute,
} from "../navigation/navigationModel.ts";
import { navigationModuleTourTarget, navigationRouteTourTarget } from "../navigation/navigationTours.ts";
import {
  getRouteForAppTab,
  type AppTab,
  type RouteId,
} from "../utils/routes";
import type { PermissionKey } from "../utils/accessControl.ts";
import type { WorkspaceSyncStatus } from "../lib/workspaceSync";
import { CompanySwitcher } from "./access/AccessStates";
import type { CompanySummary } from "../lib/companyAccess";

export type { AppTab } from "../utils/routes";

interface HeaderProps {
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
  isPlatformOwner?: boolean;
  onSelectCompany?: (companyId: string) => Promise<void> | void;
  onOpenPlatformManagement?: () => void;
  visibleRouteIds?: readonly RouteId[];
  /** Optional direct permission input for callers that do not already build visibleRouteIds. */
  permissions?: readonly PermissionKey[];
}

const routeIcons: Record<RouteId, React.ElementType> = {
  dashboard: BarChart3,
  projects: BriefcaseBusiness,
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
const MOBILE_PRIMARY_MODULE_COUNT = 3;

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
  if (status === "guest") return "border-slate-200 bg-slate-50 text-slate-600";
  if (status === "offline" || status === "error") return "border-rose-200 bg-rose-50 text-rose-700";
  if (status === "degraded" || status === "connecting") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "syncing") return "border-indigo-200 bg-indigo-50 text-indigo-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

interface NavigationRouteButtonProps {
  route: NavigationRoute;
  active: boolean;
  compact?: boolean;
  menuItem?: boolean;
  invoicesCount: number;
  reviewCount: number;
  onSelect: (route: NavigationRoute) => void;
}

const NavigationRouteButton: React.FC<NavigationRouteButtonProps> = ({ route, active, compact = false, menuItem = false, invoicesCount, reviewCount, onSelect }) => {
  const Icon = routeIcons[route.id];
  const badgeCount = badgeCountFor(route.id, invoicesCount, reviewCount);
  const badgeLabel = badgeLabelFor(route.id, badgeCount);
  const accessibleLabel = badgeLabel ? `${route.label}, ${badgeLabel}` : route.label;

  return (
    <button
      type="button"
      data-tour={navigationRouteTourTarget(route.id)}
      role={menuItem ? "menuitem" : undefined}
      onClick={() => onSelect(route)}
      aria-label={accessibleLabel}
      aria-current={active ? "page" : undefined}
      title={accessibleLabel}
      className={`${menuItem ? "w-full justify-start" : ""} relative inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all sm:px-3 ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/70 hover:text-slate-900"}`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      <span className={compact ? "hidden sm:inline" : undefined}>{route.label}</span>
      {badgeCount > 0 && <span aria-hidden="true" className={`ml-0.5 rounded-full px-1.5 text-[9px] leading-4 text-white ${route.id === "review" ? "bg-amber-500" : "bg-indigo-600"}`}>{badgeCount}</span>}
    </button>
  );
};

interface NavigationModuleButtonProps {
  module: NavigationModule;
  active: boolean;
  compact?: boolean;
  menuItem?: boolean;
  invoicesCount: number;
  onSelect: (module: NavigationModule) => void;
}

const NavigationModuleButton: React.FC<NavigationModuleButtonProps> = ({ module, active, compact = false, menuItem = false, invoicesCount, onSelect }) => {
  const route = module.defaultRoute;
  if (!route) return null;
  const Icon = routeIcons[route.id];
  const accessibleLabel = module.id === "invoices" && invoicesCount > 0
    ? `${module.label}, ${invoicesCount} invoice${invoicesCount === 1 ? "" : "s"}`
    : module.label;

  return (
    <button
      type="button"
      data-tour={navigationModuleTourTarget(module.id)}
      role={menuItem ? "menuitem" : undefined}
      onClick={() => onSelect(module)}
      aria-label={accessibleLabel}
      aria-current={active ? "page" : undefined}
      title={accessibleLabel}
      className={`${menuItem ? "w-full justify-start" : ""} relative inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all sm:px-3 ${active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/70 hover:text-slate-900"}`}
    >
      <Icon aria-hidden="true" className="h-3.5 w-3.5" />
      <span className={compact ? "hidden sm:inline" : undefined}>{module.label}</span>
      {module.id === "invoices" && invoicesCount > 0 && <span aria-hidden="true" className="ml-0.5 rounded-full bg-indigo-600 px-1.5 text-[9px] leading-4 text-white">{invoicesCount}</span>}
    </button>
  );
};

function ContextualSubtabs({
  activeModule,
  activeRouteId,
  invoicesCount,
  reviewCount,
  onSelect,
}: {
  activeModule: NavigationModule | undefined;
  activeRouteId: RouteId | null;
  invoicesCount: number;
  reviewCount: number;
  onSelect: (route: NavigationRoute) => void;
}) {
  if (!activeModule || activeModule.routes.length < 2) return null;

  return (
    <div className="mt-1 flex min-w-0 items-center gap-1 overflow-x-auto border-t border-slate-200/80 pt-1 whitespace-nowrap" aria-label={`${activeModule.label} navigation`}>
      {activeModule.routes.map((route) => (
        <NavigationRouteButton
          key={route.id}
          route={route}
          active={route.id === activeRouteId}
          invoicesCount={invoicesCount}
          reviewCount={reviewCount}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab, invoicesCount, reviewCount, onBatchExportExcel, workspaceSyncStatus = "guest", accountEmail, onSignOut, companies = [], activeCompanyId, isPlatformOwner = false, onSelectCompany, onOpenPlatformManagement, visibleRouteIds, permissions }) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const navigationFilter = useMemo(() => ({ permissions, visibleRouteIds, isPlatformOwner }), [isPlatformOwner, permissions, visibleRouteIds]);
  const navigation = useMemo(() => getNavigationModel(navigationFilter), [navigationFilter]);
  const activeRoute = getRouteForAppTab(activeTab);
  const activeRouteId = activeRoute?.id || null;
  const activeModuleDefinition = getPrimaryModuleForRoute(activeRouteId);
  const activeModule = activeModuleDefinition ? navigation.modules.find((module) => module.id === activeModuleDefinition.id) : undefined;
  const mobilePrimaryModules = navigation.modules.slice(0, MOBILE_PRIMARY_MODULE_COUNT);
  const mobileOverflowModules = navigation.modules.slice(MOBILE_PRIMARY_MODULE_COUNT);
  const syncLabel = workspaceSyncLabel(workspaceSyncStatus as WorkspaceSyncStatus);
  const SyncIcon = workspaceSyncStatus === "synced"
    ? CheckCircle2
    : workspaceSyncStatus === "syncing"
      ? RefreshCw
      : workspaceSyncStatus === "offline"
        ? WifiOff
        : workspaceSyncStatus === "degraded" || workspaceSyncStatus === "error"
          ? AlertTriangle
          : MoreHorizontal;
  const syncTitle = workspaceSyncStatus === "guest"
    ? "Data in this workspace is stored on this device and will not sync to other browsers until you connect or sign in."
    : syncLabel;
  const accountHasActions = Boolean(accountEmail || onSignOut || navigation.settingsRoute || (isPlatformOwner && onOpenPlatformManagement));

  useEffect(() => {
    if (!moreOpen) return undefined;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!moreMenuRef.current?.contains(target) && !moreButtonRef.current?.contains(target)) setMoreOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMoreOpen(false);
      moreButtonRef.current?.focus();
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreOpen]);

  useEffect(() => {
    if (!accountOpen) return undefined;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!accountMenuRef.current?.contains(target) && !accountButtonRef.current?.contains(target)) setAccountOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setAccountOpen(false);
      accountButtonRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountOpen]);

  useEffect(() => {
    setMoreOpen(false);
    setAccountOpen(false);
  }, [activeTab]);

  const selectRoute = (route: NavigationRoute) => {
    setActiveTab(route.appTab);
    setMoreOpen(false);
    setAccountOpen(false);
  };

  const selectModule = (module: NavigationModule) => {
    const route = getDefaultChildRoute(module.id, navigationFilter);
    if (route) selectRoute(route);
  };

  const moreLabel = activeModule && mobileOverflowModules.some((module) => module.id === activeModule.id)
    ? `More modules, current module: ${activeModule.label}`
    : "More modules";
  const handleSignOut = async () => {
    if (!onSignOut || accountBusy) return;
    setAccountBusy(true);
    try {
      await onSignOut();
      setAccountOpen(false);
    } finally {
      setAccountBusy(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-sm">
      <div className="w-full px-3 sm:px-5 lg:px-7 2xl:px-8">
        <div className="flex min-h-16 flex-col gap-3 py-3 lg:flex-row lg:items-start">
          <div className="flex min-w-0 items-center justify-between gap-3 lg:w-[24rem] lg:shrink-0 lg:pt-1">
            <div className="flex min-w-0 items-center gap-3">
              <div aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-500/20"><Files className="h-5 w-5" /></div>
              <div className="min-w-0">
                <h1 className="truncate text-base font-bold tracking-tight text-slate-900 sm:text-lg">Invoice Operations</h1>
                <p className="truncate text-[11px] font-medium text-slate-500 sm:text-xs">Invoice intake → extraction → review → verified record</p>
              </div>
            </div>
            {invoicesCount > 0 && <button type="button" onClick={onBatchExportExcel} className="shrink-0 rounded-xl bg-indigo-600 p-2 text-white transition hover:bg-indigo-700 xl:hidden" aria-label="Export all invoices" title="Export all invoices"><Download aria-hidden="true" className="h-4 w-4" /></button>}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex min-w-0 items-center justify-end gap-2 overflow-x-auto pb-0.5">
              {companies.length > 0 && onSelectCompany && <CompanySwitcher companies={companies} activeCompanyId={activeCompanyId} isPlatformOwner={isPlatformOwner} onSelect={onSelectCompany} />}
              {accountHasActions && <div className="relative shrink-0" ref={accountMenuRef}>
                <button ref={accountButtonRef} type="button" onClick={() => setAccountOpen((open) => !open)} aria-label={accountEmail ? `Account: ${accountEmail}` : "Account menu"} aria-expanded={accountOpen} aria-controls="header-account-menu" className="inline-flex max-w-[13rem] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-bold text-slate-700 shadow-sm hover:border-indigo-200 hover:text-indigo-700">
                  <UserCircle2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-indigo-600" /><span className="hidden max-w-[10rem] truncate sm:inline">{accountEmail || "Account"}</span>
                </button>
                {accountOpen && <div id="header-account-menu" role="menu" aria-label="Account menu" className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
                  {accountEmail && <p className="truncate px-2 py-1.5 text-[10px] font-bold text-slate-500">{accountEmail}</p>}
                  <p className="px-2 pb-1.5 text-[10px] font-semibold text-slate-400">Account / Workspace</p>
                  {navigation.settingsRoute && <button type="button" role="menuitem" data-tour="route:settings" aria-current={activeTab === navigation.settingsRoute.appTab ? "page" : undefined} onClick={() => selectRoute(navigation.settingsRoute!)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50"><SettingsIcon aria-hidden="true" className="h-3.5 w-3.5" />Settings</button>}
                  {isPlatformOwner && onOpenPlatformManagement && <button type="button" role="menuitem" onClick={() => { onOpenPlatformManagement(); setAccountOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50"><ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-indigo-600" />Platform management</button>}
                  {(navigation.settingsRoute || (isPlatformOwner && onOpenPlatformManagement)) && onSignOut && <div className="my-1 border-t border-slate-100" />}
                  {onSignOut && <button type="button" role="menuitem" onClick={() => void handleSignOut()} disabled={accountBusy} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><LogOut aria-hidden="true" className="h-3.5 w-3.5" />{accountBusy ? "Signing out…" : "Sign out"}</button>}
                </div>}
              </div>}
              <div className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-2 text-[10px] font-bold ${workspaceSyncClasses(workspaceSyncStatus as WorkspaceSyncStatus)}`} title={syncTitle} aria-label={syncTitle}>
                <SyncIcon aria-hidden="true" className={`h-3.5 w-3.5 ${workspaceSyncStatus === "syncing" ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">{syncLabel}</span>
              </div>
              {invoicesCount > 0 && <button type="button" onClick={onBatchExportExcel} className="hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-200 transition hover:bg-indigo-700 xl:flex" aria-label="Export all invoices" title="Export all invoices"><Download aria-hidden="true" className="h-3.5 w-3.5" /> Export All</button>}
            </div>

            <nav aria-label="Primary navigation" className="min-w-0 rounded-xl border border-slate-200/80 bg-slate-100 p-1">
              <div className="hidden min-w-0 flex-col lg:flex">
                <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto whitespace-nowrap">
                  {navigation.modules.map((module) => <NavigationModuleButton key={module.id} module={module} active={activeModule?.id === module.id} invoicesCount={invoicesCount} onSelect={selectModule} />)}
                </div>
                <ContextualSubtabs activeModule={activeModule} activeRouteId={activeRouteId} invoicesCount={invoicesCount} reviewCount={reviewCount} onSelect={selectRoute} />
              </div>

              <div className="flex min-w-0 flex-col lg:hidden">
                <div className="flex min-w-0 items-center gap-1">
                  <div className="flex min-w-0 flex-1 items-center justify-start gap-1 overflow-hidden">
                    {mobilePrimaryModules.map((module) => <NavigationModuleButton key={module.id} module={module} compact active={activeModule?.id === module.id} invoicesCount={invoicesCount} onSelect={selectModule} />)}
                  </div>
                  {mobileOverflowModules.length > 0 && <div className="relative shrink-0" ref={moreMenuRef}>
                    <button
                      ref={moreButtonRef}
                      type="button"
                      onClick={() => setMoreOpen((open) => !open)}
                      aria-label={moreLabel}
                      aria-expanded={moreOpen}
                      aria-controls="header-more-menu"
                      aria-current={activeModule && mobileOverflowModules.some((module) => module.id === activeModule.id) ? "page" : undefined}
                      title={moreLabel}
                      className={`relative inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all sm:px-3 ${activeModule && mobileOverflowModules.some((module) => module.id === activeModule.id) ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:bg-white/70 hover:text-slate-900"}`}
                    >
                      <MoreHorizontal aria-hidden="true" className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">More</span>
                      {activeModule && mobileOverflowModules.some((module) => module.id === activeModule.id) && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-indigo-600" />}
                    </button>

                    {moreOpen && <div id="header-more-menu" role="menu" aria-label="More modules" className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10">
                      <div role="presentation" className="px-2.5 pb-1.5 pt-1 text-[10px] font-black uppercase tracking-wider text-slate-400">More modules</div>
                      {mobileOverflowModules.map((module) => <NavigationModuleButton key={module.id} module={module} menuItem active={activeModule?.id === module.id} invoicesCount={invoicesCount} onSelect={selectModule} />)}
                    </div>}
                  </div>}
                </div>
                <ContextualSubtabs activeModule={activeModule} activeRouteId={activeRouteId} invoicesCount={invoicesCount} reviewCount={reviewCount} onSelect={selectRoute} />
              </div>
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
};
