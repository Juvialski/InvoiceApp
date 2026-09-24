import React from "react";
import { ArrowRight, Banknote, Boxes, ClipboardList, FileCheck2, FileStack, History, HardHat, LockKeyhole, Network, Waypoints } from "lucide-react";
import { currentDeploymentIdentity } from "../lib/deploymentIdentity.ts";
import { QA_SOFTWARE_SHOWCASE } from "../config/publicBranding.ts";
import { PublicSiteFooter, PublicSiteHeader } from "./PublicSiteChrome.tsx";

const CAPABILITY_ICONS = [Network, ClipboardList, FileCheck2, Banknote, FileStack, Boxes] as const;
const WORKFLOW_AREAS = [
  [HardHat, "Project context", "Work, costs, and coordination"],
  [ClipboardList, "Procurement", "Purchasing through receipt"],
  [FileCheck2, "Supplier records", "Source review and expenses"],
  [History, "History", "Changes and handoffs"],
] as const;

function WorkflowOverview() {
  return (
    <div aria-label="Illustration of software workflow areas" role="img" className="relative overflow-hidden rounded-[1.5rem] border border-white/15 bg-[#102e3a]/90 p-4 shadow-[0_28px_70px_-38px_rgba(1,14,22,0.85)] sm:p-6">
      <div className="absolute -right-14 -top-20 h-52 w-52 rounded-full bg-cyan-400/10 blur-2xl" aria-hidden="true" />
      <div className="relative flex items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div><p className="text-[9px] font-bold uppercase tracking-[0.18em] text-cyan-200">Sample workspace map</p><p className="mt-1 text-sm font-bold text-white">Connected operational areas</p></div>
        <Waypoints aria-hidden="true" className="h-5 w-5 shrink-0 text-cyan-200" />
      </div>
      <div className="relative mt-2 divide-y divide-white/10">
        {WORKFLOW_AREAS.map(([Icon, title, detail], index) => (
          <div key={title} className="flex items-center gap-3 py-3.5 sm:gap-4 sm:py-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-100/10 bg-cyan-100/[0.06] text-cyan-100"><Icon aria-hidden="true" className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-white">{title}</span><span className="mt-1 block truncate text-[10px] text-slate-300">{detail}</span></span>
            <span className="text-[9px] font-bold tracking-[0.12em] text-cyan-200/75">0{index + 1}</span>
          </div>
        ))}
      </div>
      <div className="relative mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/10 px-3 py-2.5 text-[10px] leading-5 text-slate-300">
        <LockKeyhole aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-cyan-200" /> Sample values are synthetic and isolated to the demo.
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
              <p className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-200/[0.08] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.17em] text-cyan-100 sm:text-[10px]">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" /> QA software showcase · synthetic data
              </p>
              <h1 id="showcase-title" className="mt-6 max-w-[13ch] font-serif text-[clamp(2.7rem,5.6vw,5rem)] font-medium leading-[0.99] tracking-[-0.04em] text-white">
                See the workflows behind an engineering operation.
              </h1>
              <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300 sm:text-base sm:leading-8">Explore a non-production software showcase for project operations, procurement, finance, documents, and related workflows.</p>
              <p className="mt-4 max-w-xl text-[11px] leading-6 text-slate-400">{QA_SOFTWARE_SHOWCASE.disclosure}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="/demo" className="inline-flex min-h-12 items-center gap-2 rounded-full bg-cyan-300 px-5 text-sm font-bold text-[#092431] transition hover:bg-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-cyan-200">
                  Launch Demo Workspace <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </a>
                {intakeEnabled && <a href="/request-demo" className="inline-flex min-h-12 items-center rounded-full border border-white/20 px-5 text-sm font-semibold text-white transition hover:border-white/50 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-cyan-200">Request a software demo</a>}
              </div>
            </div>
            <div className="relative mx-auto w-full max-w-xl lg:max-w-none"><WorkflowOverview /></div>
          </div>
        </section>

        <section id="capabilities" aria-labelledby="capabilities-title" className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8 sm:py-18 lg:px-10 lg:py-20">
          <div className="grid gap-4 md:grid-cols-[0.7fr_1.3fr] md:items-end md:gap-8">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.19em] text-[#11777a]">Workspace areas</p><h2 id="capabilities-title" className="mt-3 max-w-[14ch] font-serif text-4xl font-medium leading-tight tracking-[-0.035em] text-[#102f3a] sm:text-5xl">One workspace. Connected context.</h2></div>
            <p className="max-w-2xl text-sm leading-7 text-[#5e7377] sm:text-base sm:leading-8">The showcase demonstrates how operational records and deliberate review steps can stay connected across an engineering business.</p>
          </div>
          <div className="mt-9 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {QA_SOFTWARE_SHOWCASE.capabilities.map((capability, index) => {
              const Icon = CAPABILITY_ICONS[index];
              return <article key={capability.id} className="rounded-2xl border border-[#dce7e2] bg-white p-5 transition hover:border-[#aaccc8] hover:shadow-[0_18px_40px_-34px_rgba(13,73,79,0.45)] sm:p-6"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eaf4f1] text-[#176c70]"><Icon aria-hidden="true" className="h-5 w-5" /></span><h3 className="mt-5 text-sm font-bold text-[#17363d] sm:text-base">{capability.title}</h3><p className="mt-2 text-xs leading-6 text-[#62767a] sm:text-sm">{capability.description}</p></article>;
            })}
          </div>
        </section>

        <section id="workflow" aria-labelledby="workflow-title" className="border-y border-[#dce7e2] bg-[#eaf1ee]">
          <div className="mx-auto grid w-full max-w-7xl gap-6 px-5 py-14 sm:px-8 sm:py-18 md:grid-cols-[0.74fr_1.26fr] md:items-center lg:px-10 lg:py-20">
            <div><p className="text-[10px] font-bold uppercase tracking-[0.19em] text-[#11777a]">Review and history</p><h2 id="workflow-title" className="mt-3 max-w-[13ch] font-serif text-4xl font-medium leading-tight tracking-[-0.035em] text-[#102f3a] sm:text-5xl">See how a record moves through work.</h2><p className="mt-4 max-w-lg text-sm leading-7 text-[#5e7377]">Browse the sample workspace to see source context, review states, and related activity alongside each workflow.</p></div>
            <div className="grid gap-2 sm:grid-cols-3">
              {[["01", "Prepare", "Start with the draft and source context."], ["02", "Review", "Check information and resolve open questions."], ["03", "Record", "Keep the resulting action in its workflow history."]].map(([number, title, detail]) => <article key={number} className="rounded-xl border border-[#d4e2dc] bg-white p-4 sm:p-5"><p className="text-[9px] font-bold tracking-[0.15em] text-[#168186]">{number}</p><h3 className="mt-3 text-sm font-bold text-[#17363d]">{title}</h3><p className="mt-1.5 text-xs leading-5 text-[#62767a]">{detail}</p></article>)}
            </div>
          </div>
        </section>

        <section aria-labelledby="demo-title" className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-5 py-12 sm:px-8 sm:py-16 md:flex-row md:items-center md:justify-between lg:px-10">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.19em] text-[#11777a]">Explore safely</p><h2 id="demo-title" className="mt-2 font-serif text-3xl font-medium tracking-[-0.03em] text-[#102f3a] sm:text-4xl">Open the synthetic demo workspace.</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#5e7377]">Demo edits stay isolated to the sample workspace and do not change production company records.</p></div>
          <a href="/demo" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-[#12676b] px-5 text-sm font-bold text-white transition hover:bg-[#0e5359] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#12676b]">Explore demo options <ArrowRight aria-hidden="true" className="h-4 w-4" /></a>
        </section>
      </main>
      <PublicSiteFooter variant="software-showcase" />
    </div>
  );
}

export default SoftwareShowcaseLanding;
