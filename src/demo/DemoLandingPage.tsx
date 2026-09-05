import React from "react";
import { ArrowRight, Banknote, Bot, Building2, ClipboardList, FileCheck2, FileStack, HardHat, PlayCircle } from "lucide-react";
import { BRAND } from "../config/brand.ts";

const CAPABILITIES = [
  [HardHat, "Project Costing", "Projects, committed cost, labor, and direct expenses in one view."],
  [FileCheck2, "AI Invoice Processing", "Real invoice workflow with verification and project allocation context."],
  [Banknote, "Cash & Banking", "Operating cash, payroll funding, bank activity, and reconciliation."],
  [Building2, "Workforce & Payroll", "Workers, attendance, overtime, leave, payroll periods, and labor cost."],
  [FileStack, "Engineering Documents", "Disciplined project document and immutable revision history."],
  [ClipboardList, "Daily Site Logs", "Weather, field progress, crew observations, equipment, delays, and safety history."],
  [Bot, "AI Assistant", "Operational questions, navigation, and confirmed sandbox actions."],
] as const;

export function DemoLandingPage({ onLaunch, onStartTour }: { onLaunch: () => void; onStartTour: () => void }) {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-5 py-6 sm:px-8 lg:px-12 lg:py-10">
        <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <p className="text-xs font-black tracking-[0.26em] text-indigo-300">{BRAND.displayUppercase}</p>
            <p className="mt-1 text-xs font-semibold text-slate-400">Engineering Operations Platform</p>
          </div>
          <span className="rounded-md border border-indigo-400/30 bg-indigo-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-indigo-200">
            Client Demo
          </span>
        </header>

        <section className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-14">
          <div className="max-w-2xl">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-300">Meridian Engineering & Construction Corp.</p>
            <h1 className="mt-4 max-w-xl text-4xl font-black leading-[1.02] tracking-[-0.035em] text-white sm:text-5xl lg:text-6xl">
              Explore a fully populated engineering company workspace.
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
              Open the real {BRAND.productName} operations experience with realistic Philippine project, finance, workforce, payroll, and engineering-document data. No sign-up, setup, or production records are involved.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={onLaunch} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-500 px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-950/30 transition hover:bg-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300">
                Launch Demo Workspace
                <ArrowRight className="h-4 w-4" />
              </button>
              <button type="button" onClick={onStartTour} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-5 py-3 text-sm font-black text-slate-100 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-slate-400">
                <PlayCircle className="h-4 w-4" />
                Start Guided Tour
              </button>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-semibold text-slate-400">
              <span>PHP • en-PH</span>
              <span>Asia/Manila</span>
              <span>Sample data only</span>
              <span>Session-local changes</span>
            </div>
          </div>

          <div className="grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2">
            {CAPABILITIES.map(([Icon, title, detail]) => (
              <article key={title} className="bg-slate-900 p-5 sm:min-h-40">
                <Icon className="h-5 w-5 text-indigo-300" />
                <h2 className="mt-5 text-sm font-black text-white">{title}</h2>
                <p className="mt-2 text-xs leading-5 text-slate-400">{detail}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="border-t border-white/10 pt-5 text-[10px] leading-5 text-slate-500">
          This public workspace is intentionally isolated from authenticated {BRAND.productName} tenants. Demo edits are sandboxed to this browser session and can be reset at any time.
        </footer>
      </div>
    </main>
  );
}
