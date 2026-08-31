import React from "react";
import { Badge as AstryxBadge } from "@astryxdesign/core/Badge";
import { EmptyState as AstryxEmptyState } from "@astryxdesign/core/EmptyState";
import { CheckCircle2, CircleAlert, Info, Loader2, RotateCcw, type LucideIcon } from "lucide-react";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const surfaceClasses = "rounded-xl border border-slate-200 bg-white";

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
  neutral: "bg-slate-100 text-slate-700",
  info: "bg-sky-50 text-sky-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-rose-50 text-rose-700",
};

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


export function PageHeader({ eyebrow, title, description, actions, className = "" }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode; className?: string }) {
  return <header className={`flex min-w-0 flex-col gap-4 border-b border-slate-200/80 pb-5 sm:flex-row sm:items-center sm:justify-between ${className}`}>
    <div className="min-w-0">
      {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">{eyebrow}</p>}
      <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-[1.75rem]">{title}</h1>
      {description && <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>}
    </div>
    {actions && <div className="flex w-full min-w-0 shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{actions}</div>}
  </header>;
}

export function SectionHeader({ title, description, action, icon: Icon, className = "" }: { title: string; description?: string; action?: React.ReactNode; icon?: LucideIcon; className?: string }) {
  return <div className="flex items-start justify-between gap-3">
    <div className="min-w-0">
      <h2 className={`flex items-center gap-2 text-base font-bold text-slate-950 ${className}`}>{Icon && <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-indigo-600" />}{title}</h2>
      {description && <p className="mt-1 text-xs sm:text-sm leading-5 text-slate-500">{description}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>;
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
  const valueTitle = !loading && (typeof value === "string" || typeof value === "number") ? String(value) : undefined;
  return (
    <article aria-label={`${label}: ${loading ? "Loading" : value}`} className={`flex min-w-0 h-full flex-col rounded-xl border border-slate-200 bg-white p-4 sm:p-5 ${emphasis ? "shadow-sm" : ""} ${className}`}>
      <div className="flex items-start justify-between gap-3">
        {Icon && <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${metricClasses[tone]}`}><Icon aria-hidden="true" className="h-4 w-4" /></span>}
        {emphasis && <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Key</span>}
      </div>
      <p className="mt-3 max-w-full break-words whitespace-normal text-lg font-black tabular-nums tracking-tight text-slate-950 sm:text-xl xl:text-2xl" title={valueTitle}>
        {loading ? <span className="inline-block h-6 w-16 animate-pulse rounded-md bg-slate-200 align-middle" /> : value}
      </p>
      <p className="mt-1 text-xs font-semibold leading-5 text-slate-700 sm:text-sm">{label}</p>
      {detail && <p className="mt-1 text-xs leading-5 text-slate-500 sm:min-h-5">{detail}</p>}
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
    <div className={`rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center ${className}`} role="region" aria-label={title}>
      <AstryxEmptyState
        title={title}
        description={description}
        icon={<Icon aria-hidden="true" className="mx-auto h-7 w-7 text-slate-400" />}
        actions={action}
      />
    </div>
  );
}

const noticeClasses: Record<Exclude<StatusTone, "neutral">, string> = {
  info: "border-sky-200 bg-sky-50 text-sky-950",
  success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  danger: "border-rose-200 bg-rose-50 text-rose-950",
};

export function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: Exclude<StatusTone, "neutral"> }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" || tone === "danger" ? CircleAlert : Info;
  return <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3.5 text-sm leading-6 ${noticeClasses[tone]}`} role={tone === "danger" ? "alert" : "status"} aria-live="polite">
    <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
    <div>{children}</div>
  </div>;
}

export function LoadingState({ label = "Loading", className = "" }: { label?: string; className?: string }) {
  return <div className={`flex min-h-24 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm font-semibold text-slate-500 ${className}`} role="status" aria-label={label}>
    <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-indigo-600" />
    <span>{label}</span>
  </div>;
}

export function ErrorState({ title = "We could not load this view", description = "Try again, or return to the previous screen if the problem continues.", onRetry, className = "" }: { title?: string; description?: string; onRetry?: () => void; className?: string }) {
  return <div className={`rounded-xl border border-rose-200 bg-rose-50 px-4 py-5 text-rose-950 ${className}`} role="alert">
    <div className="flex items-start gap-2.5">
      <CircleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" />
      <div className="min-w-0">
        <h2 className="text-sm font-black">{title}</h2>
        <p className="mt-1 text-sm leading-5 text-rose-900">{description}</p>
        {onRetry && <button type="button" onClick={onRetry} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-2 text-xs font-bold text-white hover:bg-rose-800"><RotateCcw aria-hidden="true" className="h-3.5 w-3.5" /> Try again</button>}
      </div>
    </div>
  </div>;
}

