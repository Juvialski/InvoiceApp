import React from "react";
import { ArrowRight, Banknote, Boxes, ClipboardList, FileCheck2, FileStack, History, HardHat, LockKeyhole, Network } from "lucide-react";
import { currentDeploymentIdentity } from "../lib/deploymentIdentity.ts";
import { QA_SOFTWARE_SHOWCASE } from "../config/publicBranding.ts";
import { PublicSiteFooter, PublicSiteHeader } from "./PublicSiteChrome.tsx";

const CAPABILITY_ICONS = [Network, ClipboardList, FileCheck2, Banknote, FileStack, Boxes] as const;
const PREVIEW_AREAS = [
  [HardHat, "Projects"],
  [ClipboardList, "Procurement"],
  [FileCheck2, "Invoices"],
  [History, "Documents"],
] as const;

function WorkflowOverview() {
  return (
    <div aria-label="Illustrative synthetic workspace preview" role="img" className="relative overflow-hidden rounded-[1.5rem] border border-white/15 bg-[#102e3a]/90 p-3 shadow-[0_28px_70px_-38px_rgba(1,14,22,0.85)] sm:p-5">
      <div className="absolute -right-14 -top-20 h-52 w-52 rounded-full bg-cyan-400/10 blur-2xl" aria-hidden="true" />
      <div className="relative flex items-center justify-between gap-3 border-b border-white/10 pb-4">
        <p className="text-sm font-bold text-white">Engineering Operations Platform</p>
        <span className="shrink-0 rounded-full border border-cyan-200/20 bg-cyan-200/[0.08] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-cyan-100">Synthetic</span>
      </div>
      <div className="relative mt-4 grid gap-3 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:gap-4">
        <div className="hidden rounded-xl border border-white/10 bg-[#0b2531]/70 p-2.5 sm:block">
          <p className="px-2 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">Workspace</p>
          <div className="mt-1 space-y-1">
            {PREVIEW_AREAS.map(([Icon, title], index) => (
              <div key={title} className={`flex items-center gap-2 rounded-lg px-2 py-2 text-[10px] font-semibold ${index === 2 ? "bg-cyan-200/10 text-cyan-100" : "text-slate-300"}`}>
                <Icon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 truncate">{title}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0 rounded-xl border border-white/10 bg-[#0b2531]/70 p-3 sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-xs font-bold text-white">Supplier invoice review</p>
            <span className="rounded-full border border-amber-200/20 bg-amber-200/10 px-2 py-1 text-[9px] font-bold text-amber-100">Review</span>
          </div>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2 sm:gap-3">
            <div className="rounded-lg border border-white/10 bg-white/[0.035] p-2.5">
              <p className="flex items-center gap-2 text-[10px] font-bold text-slate-200"><FileStack aria-hidden="true" className="h-3.5 w-3.5 text-cyan-200" /> Source evidence</p>
              <div aria-hidden="true" className="mt-2.5 space-y-2 rounded-md bg-[#edf4f1] p-3">
                <span className="block h-1.5 w-2/5 rounded-full bg-slate-300" />
                <span className="block h-1.5 w-4/5 rounded-full bg-slate-200" />
                <span className="block h-1.5 w-3/5 rounded-full bg-slate-200" />
                <span className="block h-1.5 w-2/3 rounded-full bg-slate-200" />
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.035] p-2.5">
              <p className="flex items-center gap-2 text-[10px] font-bold text-slate-200"><FileCheck2 aria-hidden="true" className="h-3.5 w-3.5 text-cyan-200" /> Extracted fields</p>
              <div aria-hidden="true" className="mt-2.5 space-y-2.5 rounded-md border border-white/10 bg-black/10 p-3">
                <span className="block h-1.5 w-2/5 rounded-full bg-slate-400/50" />
                <span className="block h-1.5 w-4/5 rounded-full bg-white/15" />
                <span className="block h-1.5 w-1/3 rounded-full bg-slate-400/50" />
                <span className="block h-1.5 w-3/5 rounded-full bg-white/15" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SoftwareShowcaseLanding() {
  const intakeEnabled = currentDeploymentIdentity().publicFunnelEnabled;

  return (
    <div className="min-h-screen bg-[#f4f7f5] text-[#112d38]">
      <PublicSiteHeader variant="software-showcase" />
      <main id="public-main" data-public-site="software-showcase">
        <section id="home" aria-labelledby="showcase-title" className="overflow-hidden bg-[#071a27] text-white">
          <div className="relative mx-auto grid w-full max-w-7xl items-center gap-10 px-5 py-12 sm:px-8 sm:py-16 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16 lg:px-10 lg:py-20">
            <div className="absolute -left-36 top-8 h-80 w-80 rounded-full bg-[#159aa1]/10 blur-3xl" aria-hidden="true" />
            <div className="relative max-w-2xl">
              <h1 id="showcase-title" className="max-w-[17ch] font-serif text-[clamp(2.7rem,4.8vw,4.5rem)] font-medium leading-[1] tracking-[-0.04em] text-white">
                Engineering operations workflows.
              </h1>
              <div role="note" aria-label="Synthetic non-production disclosure" className="mt-5 flex max-w-xl items-start gap-3 rounded-xl border border-cyan-100/15 bg-cyan-100/[0.06] px-4 py-3">
                <LockKeyhole aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-cyan-200" />
                <p className="min-w-0 text-xs leading-5 text-slate-300">{QA_SOFTWARE_SHOWCASE.disclosure}</p>
              </div>
              <div className="mt-7 flex flex-wrap gap-3">
                <a href={QA_SOFTWARE_SHOWCASE.workspaceEntry.demoHref} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-cyan-300 px-5 text-sm font-bold text-[#092431] transition hover:bg-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-cyan-200">
                  {QA_SOFTWARE_SHOWCASE.workspaceEntry.demoLabel} <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </a>
                <a href={QA_SOFTWARE_SHOWCASE.workspaceEntry.signInHref} className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/25 px-5 text-sm font-bold text-white transition hover:border-white/50 hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-cyan-200">
                  {QA_SOFTWARE_SHOWCASE.workspaceEntry.signInLabel} <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </a>
                {intakeEnabled && <a href="/request-demo" className="inline-flex min-h-12 items-center rounded-full border border-white/20 px-5 text-sm font-semibold text-white transition hover:border-white/50 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-cyan-200">Request a software demo</a>}
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-xl lg:max-w-none"><WorkflowOverview /></div>
          </div>
        </section>

        <section id="capabilities" aria-labelledby="capabilities-title" className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8 sm:py-18 lg:px-10 lg:py-20">
          <h2 id="capabilities-title" className="font-serif text-3xl font-medium leading-tight tracking-[-0.035em] text-[#102f3a] sm:text-4xl">Capabilities</h2>
          <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {QA_SOFTWARE_SHOWCASE.capabilities.map((capability, index) => {
              const Icon = CAPABILITY_ICONS[index];
              return <article key={capability.id} className="flex min-h-28 items-center gap-4 rounded-2xl border border-[#dce7e2] bg-white p-5 transition hover:border-[#aaccc8] hover:shadow-[0_18px_40px_-34px_rgba(13,73,79,0.45)] sm:p-6"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eaf4f1] text-[#176c70]"><Icon aria-hidden="true" className="h-5 w-5" /></span><h3 className="text-sm font-bold text-[#17363d] sm:text-base">{capability.title}</h3></article>;
            })}
          </div>
        </section>

        <section id="workflow" aria-labelledby="workflow-title" className="border-y border-[#dce7e2] bg-[#eaf1ee]">
          <div className="mx-auto w-full max-w-7xl px-5 py-12 sm:px-8 sm:py-16 lg:px-10 lg:py-20">
            <h2 id="workflow-title" className="font-serif text-3xl font-medium leading-tight tracking-[-0.035em] text-[#102f3a] sm:text-4xl">Prepare. Review. Record.</h2>
            <div className="mt-6 grid gap-2 sm:grid-cols-3">
              {["Prepare", "Review", "Record"].map((step, index) => <div key={step} className="flex items-center gap-3 rounded-xl border border-[#d4e2dc] bg-white px-4 py-3"><span className="text-[9px] font-bold tracking-[0.15em] text-[#168186]">0{index + 1}</span><h3 className="text-sm font-bold text-[#17363d]">{step}</h3></div>)}
            </div>
          </div>
        </section>
      </main>
      <PublicSiteFooter variant="software-showcase" />
    </div>
  );
}

export default SoftwareShowcaseLanding;
