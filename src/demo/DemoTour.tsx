import React from "react";
import { Bot, Building2, ChevronRight, ClipboardList, FileCheck2, FileStack, Gauge, HardHat, Landmark, Presentation, X } from "lucide-react";

export interface DemoTourStop {
  id: string;
  label: string;
  detail: string;
  path: string;
  icon: React.ElementType;
}

export const DEMO_TOUR_STOPS: DemoTourStop[] = [
  { id: "dashboard", label: "Executive Dashboard", detail: "Project cost, cash, payables, workforce, and operating attention in one screen.", path: "/demo/app/dashboard", icon: Gauge },
  { id: "projects", label: "Project Cost Control", detail: "Open the warehouse project to see supplier, labor, expense, and project context.", path: "/demo/app/projects/demo-project-warehouse", icon: Building2 },
  { id: "invoices", label: "AI Invoice Processing", detail: "Review realistic supplier invoices, VAT fields, status, and project allocation.", path: "/demo/app/invoices", icon: FileCheck2 },
  { id: "cash", label: "Cash & Banking", detail: "Explore operating cash, payroll funding, and reconciliation-ready transactions.", path: "/demo/app/cash", icon: Landmark },
  { id: "payroll", label: "Workforce & Payroll", detail: "See workers, attendance, overtime, leave, and weekly payroll history.", path: "/demo/app/payroll", icon: HardHat },
  { id: "documents", label: "Engineering Documents", detail: "Inspect project documents and immutable Rev 0 / Rev 1 history.", path: "/demo/app/documents", icon: FileStack },
  { id: "site-logs", label: "Daily Site Logs", detail: "Review weather, field progress, crew observations, equipment downtime, safety, and formal history.", path: "/demo/app/projects/demo-project-warehouse/site-logs", icon: ClipboardList },
  { id: "assistant", label: "AI Assistant", detail: "Ask operational questions or prepare a sandboxed employee action for confirmation.", path: "/demo/app/assistant", icon: Bot },
];

export function DemoTour({ open, onOpenChange, currentPath, onNavigate }: { open: boolean; onOpenChange: (open: boolean) => void; currentPath: string; onNavigate: (path: string) => void }) {
  const activeIndex = Math.max(0, DEMO_TOUR_STOPS.findIndex((stop) => currentPath === stop.path || currentPath.startsWith(`${stop.path}/`)));

  if (!open) {
    return (
      <button type="button" onClick={() => onOpenChange(true)} className="fixed bottom-4 right-4 z-50 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-800 shadow-lg shadow-slate-900/10 hover:bg-slate-50 sm:bottom-6 sm:right-6">
        <Presentation className="h-4 w-4 text-indigo-600" />
        Demo Tour
      </button>
    );
  }

  return (
    <aside className="fixed inset-x-3 bottom-3 z-50 max-h-[72vh] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[360px]" aria-label="Engoryx Demo Tour">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Engoryx Demo Tour</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Jump between client-presentation highlights.</p>
        </div>
        <button type="button" aria-label="Close demo tour" onClick={() => onOpenChange(false)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
      </div>
      <div className="max-h-[58vh] overflow-y-auto p-2">
        {DEMO_TOUR_STOPS.map((stop, index) => {
          const Icon = stop.icon;
          const active = index === activeIndex && (currentPath === stop.path || currentPath.startsWith(`${stop.path}/`));
          return (
            <button key={stop.id} type="button" onClick={() => onNavigate(stop.path)} className={`flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition ${active ? "bg-indigo-50 text-indigo-950" : "text-slate-700 hover:bg-slate-50"}`}>
              <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}><Icon className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-xs font-black"><span className="text-[10px] tabular-nums text-slate-400">{index + 1}</span>{stop.label}</span>
                <span className="mt-1 block text-[10px] leading-4 text-slate-500">{stop.detail}</span>
              </span>
              <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-slate-300" />
            </button>
          );
        })}
      </div>
    </aside>
  );
}
