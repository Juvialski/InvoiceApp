import React from "react";
import { ArrowRight, Workflow } from "lucide-react";
import { DeploymentEnvironmentBanner } from "../components/DeploymentEnvironmentBanner.tsx";
import { HYDROQUALISENSE_PUBLIC_SITE, QA_SOFTWARE_SHOWCASE, type PublicSiteVariant } from "../config/publicBranding.ts";

const companyLinkClass = "rounded-md px-2 py-2 text-xs font-semibold text-slate-600 transition hover:text-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 sm:px-1";
const showcaseLinkClass = "rounded-md px-2 py-2 text-xs font-semibold text-slate-300 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 sm:px-1";

export function PublicSiteHeader({ variant }: { variant: PublicSiteVariant }) {
  const isCompany = variant === "company";

  return (
    <>
      <a href="#public-main" className="sr-only z-[60] rounded-md bg-white px-4 py-3 font-bold text-slate-950 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:outline focus:outline-2 focus:outline-teal-700">
        Skip to main content
      </a>
      <DeploymentEnvironmentBanner />
      <header className={isCompany ? "border-b border-slate-200 bg-[#fbfcfa]" : "border-b border-white/10 bg-[#071a27] text-white"}>
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-4 sm:px-7 lg:px-10">
          {isCompany ? (
            <a href="/" aria-label={`${HYDROQUALISENSE_PUBLIC_SITE.identity.companyName} home`} className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700">
              <img src={HYDROQUALISENSE_PUBLIC_SITE.identity.logoPath} alt="Hydroqualisense Solutions Corp. logo" className="h-10 w-10 shrink-0 rounded-full object-contain" />
              <span className="min-w-0">
                <span className="block text-[11px] font-black uppercase tracking-[0.13em] text-slate-900 sm:text-xs">Hydroqualisense</span>
                <span className="mt-0.5 block text-[10px] font-medium text-slate-500 sm:text-[11px]">Solutions Corp.</span>
              </span>
            </a>
          ) : (
            <a href="/" aria-label={`${QA_SOFTWARE_SHOWCASE.softwareIdentity.neutralDescriptor} QA showcase home`} className="flex min-w-0 items-center gap-3 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-cyan-300">
              <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200"><Workflow className="h-5 w-5" /></span>
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-bold tracking-wide text-white sm:text-xs">{QA_SOFTWARE_SHOWCASE.softwareIdentity.productBrand || QA_SOFTWARE_SHOWCASE.softwareIdentity.neutralDescriptor}</span>
                <span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-200/80">{QA_SOFTWARE_SHOWCASE.softwareIdentity.label}</span>
              </span>
            </a>
          )}

          {isCompany ? (
            <a href="/dashboard" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-xs font-bold text-slate-800 transition hover:border-teal-700 hover:text-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 sm:order-3">
              Client Portal <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </a>
          ) : (
            <a href={QA_SOFTWARE_SHOWCASE.workspaceEntry.signInHref} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-cyan-300 px-4 text-[11px] font-bold text-[#08202c] transition hover:bg-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200 sm:order-3">
              {QA_SOFTWARE_SHOWCASE.workspaceEntry.signInLabel} <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </a>
          )}

          {isCompany ? (
            <nav aria-label="Main navigation" className="order-3 grid basis-full grid-cols-5 gap-x-1 border-t border-slate-200 pt-2 text-center sm:order-2 sm:flex sm:basis-auto sm:gap-5 sm:border-0 sm:pt-0 sm:text-left">
              <a href="/#home" className={companyLinkClass}>Home</a>
              <a href="/#services" className={companyLinkClass}>Services</a>
              <a href="/#experience" className={companyLinkClass}>Projects</a>
              <a href="/#about" className={companyLinkClass}>About</a>
              <a href="/contact" className={companyLinkClass}>Contact</a>
            </nav>
          ) : (
            <nav aria-label="Showcase navigation" className="order-3 flex basis-full flex-wrap items-center justify-center gap-x-4 border-t border-white/10 pt-2 sm:order-2 sm:basis-auto sm:justify-end sm:gap-5 sm:border-0 sm:pt-0">
              <a href="/#capabilities" className={showcaseLinkClass}>Capabilities</a>
              <a href="/#workflow" className={showcaseLinkClass}>Workflow</a>
              <a href="/demo" className={showcaseLinkClass}>Demo workspace</a>
            </nav>
          )}
        </div>
      </header>
    </>
  );
}

export function PublicSiteFooter({ variant }: { variant: PublicSiteVariant }) {
  const isCompany = variant === "company";
  const privacyHref = "/privacy";
  const termsHref = "/terms";

  return (
    <footer className={isCompany ? "border-t border-slate-200 bg-[#f1f5f3]" : "border-t border-white/10 bg-[#071a27] text-slate-300"}>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-7 text-xs leading-5 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
        <div>
          <p className={isCompany ? "font-bold text-slate-800" : "font-bold text-white"}>
            {isCompany ? HYDROQUALISENSE_PUBLIC_SITE.identity.companyName : `${QA_SOFTWARE_SHOWCASE.softwareIdentity.productBrand || QA_SOFTWARE_SHOWCASE.softwareIdentity.neutralDescriptor} · QA Software Showcase`}
          </p>
          <p className="mt-1 max-w-xl text-[11px] opacity-75">
            {isCompany ? "Water treatment · Water management · Related engineering projects" : "Synthetic demo context only. Not the production corporate services website."}
          </p>
        </div>
        <nav aria-label="Public policy navigation" className="flex flex-wrap gap-x-5 gap-y-2">
          <a href={privacyHref} className="rounded-sm font-semibold underline decoration-transparent underline-offset-4 transition hover:decoration-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">Privacy Policy</a>
          <a href={termsHref} className="rounded-sm font-semibold underline decoration-transparent underline-offset-4 transition hover:decoration-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">Terms of Service</a>
          {isCompany && <a href="/dashboard" className="rounded-sm font-semibold underline decoration-transparent underline-offset-4 transition hover:decoration-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">Client Portal</a>}
        </nav>
      </div>
    </footer>
  );
}
