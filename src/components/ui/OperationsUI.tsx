import React from "react";
import { CheckCircle2, CircleAlert, Info, type LucideIcon } from "lucide-react";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const statusClasses: Record<StatusTone, string> = {
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
  info: "border-sky-200 bg-sky-50 text-sky-800",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  danger: "border-rose-200 bg-rose-50 text-rose-800",
};

const metricClasses: Record<StatusTone, string> = {
  neutral: "bg-slate-100 text-slate-700",
  info: "bg-sky-50 text-sky-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-rose-50 text-rose-700",
};

export function StatusBadge({ children, tone = "neutral", icon: Icon, className = "" }: { children: React.ReactNode; tone?: StatusTone; icon?: LucideIcon; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-5 ${statusClasses[tone]} ${className}`}>
    {Icon && <Icon aria-hidden="true" className="h-3 w-3" />}
    {children}
  </span>;
}

export function PageHeader({ eyebrow, title, description, actions, className = "" }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode; className?: string }) {
  return <div className={`flex flex-col gap-4 border-b border-slate-200/80 pb-5 sm:flex-row sm:items-end sm:justify-between ${className}`}>
    <div className="min-w-0">
      {eyebrow && <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-600">{eyebrow}</p>}
      <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-[1.75rem]">{title}</h1>
      {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>}
    </div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pb-0.5">{actions}</div>}
  </div>;
}

export function SectionHeader({ title, description, action, icon: Icon, className = "" }: { title: string; description?: string; action?: React.ReactNode; icon?: LucideIcon; className?: string }) {
  return <div className="flex items-start justify-between gap-3">
    <div className="min-w-0">
      <h2 className={`flex items-center gap-2 text-base font-bold text-slate-950 ${className}`}>{Icon && <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-indigo-600" />}{title}</h2>
      {description && <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>;
}

export function MetricCard({ label, value, detail, icon: Icon, tone = "neutral", emphasis = false, className = "" }: { label: string; value: React.ReactNode; detail?: string; icon?: LucideIcon; tone?: StatusTone; emphasis?: boolean; className?: string }) {
  return <article className={`min-w-0 rounded-xl border border-slate-200 bg-white p-4 ${emphasis ? "shadow-sm" : ""} ${className}`}>
    <div className="flex items-start justify-between gap-3">
      {Icon && <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${metricClasses[tone]}`}><Icon aria-hidden="true" className="h-4 w-4" /></span>}
      {emphasis && <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Key</span>}
    </div>
    <p className="mt-3 break-words text-2xl font-black tabular-nums tracking-tight text-slate-950">{value}</p>
    <p className="mt-1 text-sm font-semibold text-slate-700">{label}</p>
    {detail && <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>}
  </article>;
}

export function EmptyState({ title, description, icon: Icon = Info, action, className = "" }: { title: string; description?: string; icon?: LucideIcon; action?: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center ${className}`}>
    <Icon aria-hidden="true" className="mx-auto h-7 w-7 text-slate-300" />
    <h2 className="mt-3 text-base font-bold text-slate-800">{title}</h2>
    {description && <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>;
}

export function Notice({ children, tone = "info" }: { children: React.ReactNode; tone?: Exclude<StatusTone, "neutral"> }) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" || tone === "danger" ? CircleAlert : Info;
  return <div className={`flex items-start gap-2.5 rounded-xl border px-4 py-3.5 text-sm leading-6 ${statusClasses[tone]}`} role={tone === "danger" ? "alert" : "status"}>
    <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
    <div>{children}</div>
  </div>;
}
