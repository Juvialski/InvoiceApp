import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { Badge as AstryxBadge } from "@astryxdesign/core/Badge";
import { EmptyState as AstryxEmptyState } from "@astryxdesign/core/EmptyState";
import { Button as AstryxButton, type ButtonProps, type ButtonVariant } from "@astryxdesign/core/Button";
import { CheckCircle2, CircleAlert, Info, Loader2, RotateCcw, type LucideIcon } from "lucide-react";
import { HelpAction } from "../help/HelpAction.tsx";
import type { HelpTopicId } from "../../help/helpCatalog.ts";
import { countActiveFilters } from "./filterActionBarModel.ts";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const surfaceClasses = "hqs-surface rounded-lg";

export function Surface({
  children,
  className = "",
  as: Component = "section",
  ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  as?: keyof React.JSX.IntrinsicElements;
  ariaLabel?: string;
}) {
  return <Component className={`${surfaceClasses} ${className}`} aria-label={ariaLabel}>{children}</Component>;
}

const toneToVariant = (tone: StatusTone) => {
  switch (tone) {
    case "success": return "success" as const;
    case "warning": return "warning" as const;
    case "danger": return "error" as const;
    case "info": return "info" as const;
    case "neutral":
    default: return "neutral" as const;
  }
};

const metricClasses: Record<StatusTone, string> = {
  neutral: "hqs-surface-muted hqs-secondary-text",
  info: "hqs-attention-info",
  success: "hqs-exception-success",
  warning: "hqs-exception-warning",
  danger: "hqs-exception-danger",
};

export type ActionButtonProps = Omit<ButtonProps, "variant"> & { variant?: ButtonVariant };

export function ActionButton({ variant = "secondary", className = "", ...props }: ActionButtonProps) {
  return <AstryxButton {...props} variant={variant} className={`hqs-action-button ${className}`} />;
}

export interface FilterChip {
  id: string;
  label: string;
  onRemove: () => void;
}

export interface CompactSearchControl {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
}

export interface AdvancedFilterDisclosureProps {
  children: React.ReactNode;
  activeCount?: number;
  label?: string;
  onClear?: () => void;
}

export function AdvancedFilterDisclosure({
  children,
  activeCount = 0,
  label = "Filters",
  onClear,
}: AdvancedFilterDisclosureProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = `advanced-filter-${useId().replace(/:/g, "")}`;
  const close = useCallback((restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const firstControl = panelRef.current?.querySelector<HTMLElement>("button, input, select, textarea, [tabindex]:not([tabindex='-1'])");
    firstControl?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) close(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [close, open]);

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        className="hqs-control hqs-focus-ring inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        {activeCount > 0 && <span className="hqs-accent-text rounded-full px-1.5 text-[10px] font-black">{activeCount}</span>}
      </button>
      {open && (
        <div ref={panelRef} id={panelId} role="dialog" aria-label={`${label} options`} className="hqs-popover absolute left-0 top-[calc(100%+0.5rem)] z-40 w-[min(36rem,calc(100vw-2rem))] rounded-xl p-3.5 sm:right-0 sm:left-auto">
          <div className="grid gap-3 sm:grid-cols-2">{children}</div>
          {onClear && activeCount > 0 && <div className="hqs-border mt-3 flex justify-end border-t pt-3"><button type="button" className="hqs-control hqs-focus-ring rounded-lg px-2.5 py-1.5 text-xs font-bold" onClick={onClear}>Clear filters</button></div>}
        </div>
      )}
    </div>
  );
}

export interface CompactActionBarProps {
  search?: CompactSearchControl;
  quickFilters?: React.ReactNode;
  advancedFilters?: React.ReactNode;
  activeFilterValues?: readonly unknown[];
  activeFilters?: readonly FilterChip[];
  sort?: React.ReactNode;
  view?: React.ReactNode;
  primaryAction?: React.ReactNode;
  resultLabel?: React.ReactNode;
  onClearAll?: () => void;
  ariaLabel?: string;
  className?: string;
}

export function CompactActionBar({
  search,
  quickFilters,
  advancedFilters,
  activeFilterValues = [],
  activeFilters = [],
  sort,
  view,
  primaryAction,
  resultLabel,
  onClearAll,
  ariaLabel = "Filters and actions",
  className = "",
}: CompactActionBarProps) {
  const activeFilterCount = countActiveFilters(activeFilterValues);
  return (
    <section data-ui="compact-action-bar" aria-label={ariaLabel} className={`hqs-surface-raised rounded-xl p-2.5 sm:p-3 ${className}`}>
      <div className="flex min-w-0 flex-wrap items-center gap-2 lg:flex-nowrap">
        {search && (
          <label className="hqs-input hqs-search-control flex min-w-0 basis-full items-center rounded-lg px-3 sm:basis-auto sm:flex-1">
            <span className="sr-only">{search.ariaLabel}</span>
            <input type="search" value={search.value} onChange={(event) => search.onChange(event.currentTarget.value)} placeholder={search.placeholder} aria-label={search.ariaLabel} className="h-10 min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" />
          </label>
        )}
        {quickFilters && <div className="hidden min-w-0 items-center gap-2 sm:flex">{quickFilters}</div>}
        {advancedFilters && <AdvancedFilterDisclosure activeCount={activeFilterCount} onClear={onClearAll}>{advancedFilters}</AdvancedFilterDisclosure>}
        {sort && <div className="min-w-0 shrink-0">{sort}</div>}
        {view && <div className="hidden shrink-0 items-center sm:flex">{view}</div>}
        {primaryAction && <div className="ml-auto shrink-0">{primaryAction}</div>}
      </div>
      {(activeFilterCount > 0 && activeFilters.length > 0) && (
        <div className="hqs-border mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2">
          {activeFilters.map((filter) => <button key={filter.id} type="button" onClick={filter.onRemove} className="hqs-control hqs-focus-ring inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold">{filter.label}<span aria-hidden="true">×</span></button>)}
          {onClearAll && <button type="button" onClick={onClearAll} className="hqs-accent-text ml-1 min-h-8 px-1 text-[11px] font-bold hover:underline">Clear all</button>}
        </div>
      )}
      {resultLabel && <div className="hqs-secondary-text mt-2 text-xs font-semibold" role="status" aria-live="polite">{resultLabel}</div>}
    </section>
  );
}

export function StatusBadge({
  children,
  tone = "neutral",
  icon: Icon,
  className = "",
}: {
  children: React.ReactNode;
  tone?: StatusTone;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center ${className}`}>
      <AstryxBadge
        variant={toneToVariant(tone)}
        label={children}
        icon={Icon ? <Icon aria-hidden="true" className="h-3 w-3" /> : undefined}
      />
    </span>
  );
}

export function PageHeader({ eyebrow, title, description, actions, className = "", helpTopicId }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode; className?: string; helpTopicId?: HelpTopicId | null }) {
  return <header data-ui="page-header" className={`flex min-w-0 flex-col gap-3 border-b hqs-border pb-4 sm:flex-row sm:items-center sm:justify-between ${className}`}>
    <div className="min-w-0">
      {eyebrow && <p className="hqs-accent-text text-[11px] font-semibold tracking-[0.12em]">{eyebrow}</p>}
      <h1 data-ui="page-header-title" className="hqs-primary-text mt-0.5 text-[1.65rem] font-extrabold tracking-tight sm:text-[1.75rem]">{title}</h1>
      {description && <p className="hqs-secondary-text mt-1 max-w-2xl text-sm leading-5">{description}</p>}
    </div>
    <div data-ui="page-header-actions" className="flex w-full min-w-0 shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{actions}<HelpAction topicId={helpTopicId} /></div>
  </header>;
}

export function SectionHeader({ title, description, action, icon: Icon, className = "" }: { title: string; description?: string; action?: React.ReactNode; icon?: LucideIcon; className?: string }) {
  return <div data-ui="section-header" className="flex items-start justify-between gap-3">
    <div className="min-w-0">
      <h2 className={`hqs-primary-text flex items-center gap-2 text-base font-bold ${className}`}>{Icon && <Icon aria-hidden="true" className="hqs-accent-text h-4 w-4 shrink-0" />}{title}</h2>
      {description && <p className="hqs-secondary-text mt-0.5 max-w-2xl text-xs leading-5 sm:text-sm">{description}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>;
}

export function PageActionBar({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={"flex min-w-0 flex-wrap items-center gap-2 " + className}>{children}</div>;
}

export function ResponsiveActionGroup({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={"flex min-w-0 flex-wrap items-center gap-2 " + className}>{children}</div>;
}

export function FilterBar({
  children,
  resultLabel,
  hasActiveFilters = false,
  onReset,
  resetLabel = "Clear filters",
  ariaLabel = "Filters",
  className = "",
}: {
  children: React.ReactNode;
  resultLabel?: React.ReactNode;
  hasActiveFilters?: boolean;
  onReset?: () => void;
  resetLabel?: string;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <section data-ui="filter-bar" className={"hqs-surface rounded-lg p-2.5 sm:p-3 " + className} aria-label={ariaLabel}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">{children}</div>
        {(resultLabel || (hasActiveFilters && onReset)) && (
          <div className="hqs-secondary-text flex shrink-0 flex-wrap items-center gap-2 text-xs font-semibold">
            {resultLabel && <span role="status" aria-live="polite">{resultLabel}</span>}
            {hasActiveFilters && onReset && <button type="button" onClick={onReset} className="hqs-control hqs-focus-ring inline-flex min-h-9 items-center rounded-lg px-2.5 py-1.5 text-xs font-bold">{resetLabel}</button>}
          </div>
        )}
      </div>
    </section>
  );
}

export function DisclosureSection({
  title,
  description,
  children,
  defaultOpen = false,
  className = "",
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = "disclosure-" + useId().replace(/:/g, "");
  return (
    <section data-ui="disclosure-section" className={"hqs-surface rounded-lg " + className}>
      <button
        type="button"
        className="flex min-h-10 w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((value) => !value)}
      >
          <span className="min-w-0">
          <span className="hqs-primary-text block text-sm font-black">{title}</span>
          {description && <span className="hqs-secondary-text mt-0.5 block text-xs leading-5">{description}</span>}
        </span>
        <span aria-hidden="true" className={"hqs-secondary-text shrink-0 text-lg leading-none transition-transform " + (open ? "rotate-180" : "")}>⌄</span>
      </button>
      {open && <div id={contentId} className="hqs-border border-t p-3.5">{children}</div>}
    </section>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
  emphasis = false,
  loading = false,
  className = "",
}: {
  label: string;
  value: React.ReactNode;
  detail?: string;
  icon?: LucideIcon;
  tone?: StatusTone;
  emphasis?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const valueText = typeof value === "string" || typeof value === "number" ? String(value) : undefined;
  const valueTitle = !loading ? valueText : undefined;
  const metricAriaLabel = loading ? `${label}: Loading` : valueText ? `${label}: ${valueText}` : label;
  return (
    <article data-ui="metric-card" aria-label={metricAriaLabel} className={`hqs-surface-raised flex min-w-0 h-full flex-col rounded-lg p-3.5 sm:p-4 ${emphasis ? "border-indigo-100" : ""} ${className}`}>
      <div className="flex items-start justify-between gap-3">
        {Icon && <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${metricClasses[tone]}`}><Icon aria-hidden="true" className="h-4 w-4" /></span>}
      </div>
      <p className="hqs-primary-text mt-2 max-w-full break-words whitespace-normal text-lg font-black tabular-nums tracking-tight sm:text-xl xl:text-[1.35rem]" title={valueTitle}>
        {loading ? <span className="hqs-muted-fill inline-block h-6 w-16 animate-pulse rounded-md align-middle" /> : value}
      </p>
      <p className="hqs-secondary-text mt-1 text-xs font-semibold leading-5 sm:text-sm">{label}</p>
      {detail && <p className="hqs-secondary-text mt-0.5 text-xs leading-5 sm:min-h-5">{detail}</p>}
    </article>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon = Info,
  action,
  className = "",
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`hqs-surface rounded-lg border-dashed px-5 py-6 text-center ${className}`} role="region" aria-label={title}>
      <AstryxEmptyState
        title={title}
        description={description}
        icon={<Icon aria-hidden="true" className="hqs-secondary-text mx-auto h-7 w-7" />}
        actions={action}
      />
    </div>
  );
}

const noticeClasses: Record<Exclude<StatusTone, "neutral">, string> = {
  info: "hqs-exception-info",
  success: "hqs-exception-success",
  warning: "hqs-exception-warning",
  danger: "hqs-exception-danger",
};

export function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: Exclude<StatusTone, "neutral"> }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" || tone === "danger" ? CircleAlert : Info;
  return <div className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm leading-5 ${noticeClasses[tone]}`} role={tone === "danger" ? "alert" : "status"} aria-live="polite">
    <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
    <div>{children}</div>
  </div>;
}

export function LoadingState({ label = "Loading", className = "" }: { label?: string; className?: string }) {
  return <div className={`hqs-surface hqs-secondary-text flex min-h-20 items-center justify-center gap-2 rounded-lg px-4 py-5 text-sm font-semibold ${className}`} role="status" aria-label={label}>
    <Loader2 aria-hidden="true" className="hqs-accent-text h-4 w-4 animate-spin" />
    <span>{label}</span>
  </div>;
}

export function ErrorState({ title = "We could not load this view", description = "Try again, or return to the previous screen if the problem continues.", onRetry, onReload, className = "" }: { title?: string; description?: string; onRetry?: () => void; onReload?: () => void; className?: string }) {
  return <div className={`hqs-exception-danger rounded-lg px-4 py-4 ${className}`} role="alert">
    <div className="flex items-start gap-2.5">
      <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" />
      <div className="min-w-0">
        <h2 className="text-sm font-black">{title}</h2>
        <p className="mt-1 text-sm leading-5">{description}</p>
        {(onRetry || onReload) && <div className="mt-3 flex flex-wrap gap-2">
          {onRetry && <button type="button" onClick={onRetry} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white hover:bg-rose-800"><RotateCcw aria-hidden="true" className="h-3.5 w-3.5" /> Try again</button>}
          {onReload && <button type="button" onClick={onReload} className="hqs-control inline-flex min-h-10 items-center rounded-lg px-3 py-2 text-xs font-bold">Reload page</button>}
        </div>}
      </div>
    </div>
  </div>;
}
