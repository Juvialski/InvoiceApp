import React from "react";
import { ArrowDownRight, ArrowRight, Compass, Droplet, MoveRight, Waves } from "lucide-react";
import { HYDROQUALISENSE_PUBLIC_SITE } from "../config/publicBranding.ts";
import { PublicSiteFooter, PublicSiteHeader } from "./PublicSiteChrome.tsx";

const SERVICE_ICONS = { droplet: Droplet, waves: Waves, compass: Compass } as const;

function WaterSystemsIllustration() {
  return (
    <div aria-hidden="true" className="relative isolate aspect-[1.04/1] min-h-72 overflow-hidden rounded-[1.7rem] bg-[#0a3042] shadow-[0_26px_70px_-38px_rgba(6,39,52,0.72)] sm:aspect-[1.18/1] lg:aspect-[0.96/1]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_75%_18%,rgba(86,199,194,0.34),transparent_46%),linear-gradient(145deg,#0a2638_0%,#0d5360_62%,#137378_100%)]" />
      <div className="absolute inset-0 opacity-[0.14] [background-image:linear-gradient(rgba(203,242,239,0.35)_1px,transparent_1px),linear-gradient(90deg,rgba(203,242,239,0.35)_1px,transparent_1px)] [background-size:42px_42px]" />
      <svg viewBox="0 0 620 590" fill="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <path d="M-35 425C72 425 62 328 162 328H255C312 328 301 212 385 212H492C549 212 548 120 658 120" stroke="#b9eeea" strokeOpacity=".68" strokeWidth="2" />
        <path d="M-35 454C82 454 76 357 175 357H270C327 357 318 242 402 242H500C570 242 565 150 658 150" stroke="#7fd4d1" strokeOpacity=".48" strokeWidth="1.5" />
        <path d="M-35 483C93 483 91 386 190 386H286C342 386 334 271 418 271H510C592 271 584 180 658 180" stroke="#65bbb9" strokeOpacity=".35" strokeWidth="1.2" />
        <path d="M92 0V179C92 214 120 242 155 242H217C250 242 277 269 277 302V478" stroke="#8ee1db" strokeOpacity=".4" strokeWidth="1.4" strokeDasharray="5 8" />
        <path d="M495 0V102C495 137 465 167 430 167H373C338 167 310 195 310 230V590" stroke="#b9eeea" strokeOpacity=".24" strokeWidth="1.3" />
        <circle cx="162" cy="328" r="7" fill="#c7f2ed" />
        <circle cx="385" cy="212" r="7" fill="#c7f2ed" />
        <circle cx="492" cy="212" r="4" fill="#72d7d0" />
        <circle cx="277" cy="478" r="5" fill="#72d7d0" />
        <path d="M77 118C145 86 206 84 263 112" stroke="#d3f8f2" strokeOpacity=".18" strokeWidth="1" />
        <path d="M357 505C422 473 495 470 554 495" stroke="#d3f8f2" strokeOpacity=".2" strokeWidth="1" />
      </svg>
      <div className="absolute left-5 top-5 flex items-center gap-2 rounded-full border border-white/15 bg-[#082738]/70 px-3 py-2 text-[9px] font-bold uppercase tracking-[0.16em] text-[#d5f4ef] backdrop-blur sm:left-7 sm:top-7 sm:text-[10px]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#76d4ce]" /> Water systems · Engineering context
      </div>
      <div className="absolute bottom-5 left-5 right-5 grid grid-cols-3 gap-2 sm:bottom-7 sm:left-7 sm:right-7">
        {["Treatment", "Management", "Project"].map((label, index) => (
          <div key={label} className="border-t border-white/25 pt-2.5">
            <span className="block text-[8px] font-bold tracking-[0.16em] text-[#88cfcd]">0{index + 1}</span>
            <span className="mt-1 block text-[10px] font-semibold text-white/90 sm:text-xs">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompanyLanding() {
  return (
    <main id="public-main" data-public-site="company" className="overflow-hidden bg-[#fbfcfa] text-[#152b32]">
      <section id="home" aria-labelledby="company-hero-title" className="relative">
        <div className="mx-auto grid w-full max-w-7xl items-center gap-9 px-5 pb-14 pt-12 sm:px-8 sm:pb-20 sm:pt-16 lg:grid-cols-[1.03fr_0.97fr] lg:gap-14 lg:px-10 lg:pb-24 lg:pt-20">
          <div className="relative z-10 max-w-2xl">
            <p className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.2em] text-[#176c70] sm:text-xs">
              <span className="h-px w-8 bg-[#4caaa4]" /> Hydroqualisense Solutions Corp.
            </p>
            <h1 id="company-hero-title" className="mt-6 max-w-[13ch] font-serif text-[clamp(2.8rem,6vw,5.4rem)] font-medium leading-[0.98] tracking-[-0.045em] text-[#112f3a]">
              Engineering practical solutions for water and infrastructure.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-[#52666a] sm:text-lg sm:leading-8">
              An engineering company focused on water treatment, water management, and related engineering projects.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a href="/contact" className="inline-flex min-h-12 items-center gap-3 rounded-full bg-[#12676b] px-5 text-sm font-bold text-white transition hover:bg-[#0e5359] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#12676b]">
                Discuss a project <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </a>
              <a href="#services" className="inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-sm font-semibold text-[#31545a] transition hover:bg-[#eaf2ef] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12676b]">
                Explore services <ArrowDownRight aria-hidden="true" className="h-4 w-4" />
              </a>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-5 gap-y-2 border-t border-[#dfe8e4] pt-5 text-[9px] font-bold uppercase tracking-[0.15em] text-[#698084] sm:text-[10px]">
              <span>Water treatment</span><span aria-hidden="true" className="text-[#54a9a4]">/</span>
              <span>Water management</span><span aria-hidden="true" className="text-[#54a9a4]">/</span>
              <span>Engineering projects</span>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-[38rem] lg:max-w-none">
            <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full border border-[#7dbebb]/35 sm:-right-6 sm:-top-6 sm:h-36 sm:w-36" />
            <WaterSystemsIllustration />
          </div>
        </div>
      </section>

      <section id="services" aria-labelledby="services-title" className="border-y border-[#e3ebe7] bg-[#f2f6f3]">
        <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 sm:py-20 lg:px-10 lg:py-24">
          <div className="grid gap-5 md:grid-cols-[0.62fr_1.38fr] md:items-end md:gap-10">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#176c70]">Services and capabilities</p>
              <h2 id="services-title" className="mt-3 max-w-[13ch] font-serif text-4xl font-medium leading-tight tracking-[-0.035em] text-[#17363d] sm:text-5xl">Water-focused engineering.</h2>
            </div>
            <p className="max-w-2xl text-sm leading-7 text-[#607377] sm:text-base sm:leading-8">Work is grounded in the water need and the project context. The confirmed areas below are kept intentionally focused.</p>
          </div>
          <div className="mt-10 grid gap-3 md:grid-cols-3">
            {HYDROQUALISENSE_PUBLIC_SITE.services.map((service, index) => {
              const Icon = SERVICE_ICONS[service.icon];
              return (
                <article key={service.id} className="group rounded-2xl border border-[#dce7e2] bg-white p-5 transition duration-200 hover:-translate-y-0.5 hover:border-[#9ecac5] hover:shadow-[0_18px_42px_-34px_rgba(16,77,81,0.5)] sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#eaf4f1] text-[#176c70]"><Icon aria-hidden="true" className="h-5 w-5" /></span>
                    <span className="text-[10px] font-bold tracking-[0.16em] text-[#8aa0a1]">0{index + 1}</span>
                  </div>
                  <h3 className="mt-7 text-lg font-bold tracking-[-0.02em] text-[#17363d]">{service.title}</h3>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-[#617579]">{service.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="experience" aria-labelledby="experience-title" className="bg-[#0d2e3b] text-white">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.92fr_1.08fr] lg:items-center lg:gap-16 lg:px-10 lg:py-24">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#8ad3cc]">Projects and experience</p>
            <h2 id="experience-title" className="mt-4 max-w-[13ch] font-serif text-4xl font-medium leading-[1.08] tracking-[-0.035em] sm:text-5xl">Start with the conditions around the water.</h2>
            <p className="mt-5 max-w-xl text-sm leading-7 text-[#c0d0d2] sm:text-base sm:leading-8">Water-related engineering is shaped by the project need, the operating context, and the requirements that matter on site. A clear brief makes those conditions visible before the scope is set.</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-white/15 bg-white/[0.045]">
            {[
              ["01", "The need", "What water-related need is the project addressing?"],
              ["02", "The context", "Which project conditions and operating requirements matter?"],
              ["03", "The scope", "What engineering direction fits the confirmed requirements?"],
            ].map(([number, title, detail], index) => (
              <div key={number} className={`grid grid-cols-[2.5rem_1fr_auto] items-start gap-3 p-4 sm:gap-5 sm:p-6 ${index < 2 ? "border-b border-white/10" : ""}`}>
                <span className="pt-1 text-[10px] font-bold tracking-[0.15em] text-[#83c8c3]">{number}</span>
                <div><h3 className="text-sm font-bold text-white sm:text-base">{title}</h3><p className="mt-1.5 text-xs leading-5 text-[#b1c5c7] sm:text-sm sm:leading-6">{detail}</p></div>
                <MoveRight aria-hidden="true" className="mt-1 h-4 w-4 text-[#78bbb7]" />
              </div>
            ))}
          </div>
        </div>
        {HYDROQUALISENSE_PUBLIC_SITE.projectReferences.length > 0 ? (
          <div className="mx-auto grid w-full max-w-7xl gap-3 px-5 pb-16 sm:grid-cols-2 sm:px-8 lg:grid-cols-3 lg:px-10 lg:pb-24">
            {HYDROQUALISENSE_PUBLIC_SITE.projectReferences.map((project) => (
              <article key={project.id} className="overflow-hidden rounded-2xl border border-white/15 bg-white/[0.045]">
                {project.image && <img src={project.image.src} alt={project.image.alt} className="aspect-[16/9] w-full object-cover" />}
                <div className="p-5 sm:p-6"><p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#8ad3cc]">{project.service}{project.location ? ` · ${project.location}` : ""}</p><h3 className="mt-2 text-base font-bold text-white">{project.title}</h3><p className="mt-2 text-sm leading-6 text-[#c0d0d2]">{project.summary}</p></div>
              </article>
            ))}
          </div>
        ) : (
          <p role="status" className="mx-auto w-full max-w-7xl px-5 pb-16 text-xs leading-6 text-[#a8c0c2] sm:px-8 lg:px-10 lg:pb-24">{HYDROQUALISENSE_PUBLIC_SITE.projectReferencesPending}</p>
        )}
      </section>

      <section id="about" aria-labelledby="about-title" className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-16 sm:px-8 sm:py-20 md:grid-cols-[0.52fr_1.48fr] md:items-center lg:px-10 lg:py-24">
        <div className="flex min-h-44 items-center justify-center rounded-2xl border border-[#dce7e2] bg-[#f2f6f3] p-8 text-center">
          <div><span aria-hidden="true" className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#15676a] shadow-sm"><Waves className="h-6 w-6" /></span><p className="mt-4 text-[9px] font-bold uppercase tracking-[0.2em] text-[#688084]">Water-centered engineering</p></div>
        </div>
        <div className="max-w-3xl">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#176c70]">About the company</p>
          <h2 id="about-title" className="mt-3 font-serif text-3xl font-medium leading-tight tracking-[-0.035em] text-[#17363d] sm:text-4xl">{HYDROQUALISENSE_PUBLIC_SITE.identity.companyName}</h2>
          <p className="mt-4 text-sm leading-7 text-[#5e7377] sm:text-base sm:leading-8">An engineering company focused on water treatment, water management, and related engineering projects. Project needs and context are central to a clear engineering brief.</p>
        </div>
      </section>

      <section id="contact" aria-labelledby="contact-title" className="border-t border-[#deebe6] bg-[#edf4f1]">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-14 sm:px-8 sm:py-18 md:grid-cols-[1fr_0.82fr] md:items-center lg:px-10 lg:py-20">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#176c70]">Project inquiry</p>
            <h2 id="contact-title" className="mt-3 max-w-[14ch] font-serif text-4xl font-medium leading-tight tracking-[-0.035em] text-[#17363d] sm:text-5xl">Have a water-related project to discuss?</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[#607377]">A project conversation can begin with the water need, project conditions, and the questions that need engineering attention.</p>
          </div>
          <div className="rounded-2xl border border-[#d5e5de] bg-white p-5 shadow-[0_16px_44px_-36px_rgba(17,71,73,0.42)] sm:p-7">
            <p className="text-[9px] font-bold uppercase tracking-[0.17em] text-[#668286]">Contact channel</p>
            {HYDROQUALISENSE_PUBLIC_SITE.contact.email || HYDROQUALISENSE_PUBLIC_SITE.contact.phone ? (
              <div className="mt-2 space-y-2 text-sm font-bold text-[#17363d]">
                {HYDROQUALISENSE_PUBLIC_SITE.contact.email && <a className="block underline underline-offset-2" href={`mailto:${HYDROQUALISENSE_PUBLIC_SITE.contact.email}`}>{HYDROQUALISENSE_PUBLIC_SITE.contact.email}</a>}
                {HYDROQUALISENSE_PUBLIC_SITE.contact.phone && <a className="block underline underline-offset-2" href={`tel:${HYDROQUALISENSE_PUBLIC_SITE.contact.phone}`}>{HYDROQUALISENSE_PUBLIC_SITE.contact.phone}</a>}
              </div>
            ) : (
              <><p className="mt-2 text-sm font-bold text-[#17363d]">Public inquiry details are being confirmed.</p><p className="mt-2 text-xs leading-6 text-[#64797d]">{HYDROQUALISENSE_PUBLIC_SITE.contactPending}</p></>
            )}
            <a href="/dashboard" className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-full border border-[#cadbd5] px-4 text-xs font-bold text-[#28575c] transition hover:border-[#12676b] hover:bg-[#f4faf7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12676b]">
              Existing client? Client Portal <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

function CompanyContactPage() {
  return (
    <main id="public-main" data-public-site="company-contact" className="min-h-[65vh] bg-[#fbfcfa] text-[#152b32]">
      <div className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8 sm:py-20 lg:px-10 lg:py-24">
        <div className="grid gap-9 md:grid-cols-[0.86fr_1.14fr] md:items-start">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#176c70]">Project inquiry · Hydroqualisense Solutions Corp.</p>
            <h1 className="mt-4 max-w-[12ch] font-serif text-5xl font-medium leading-[1.02] tracking-[-0.04em] text-[#112f3a] sm:text-6xl">Discuss a water-related project.</h1>
            <p className="mt-5 max-w-xl text-sm leading-7 text-[#607377] sm:text-base sm:leading-8">The company&apos;s confirmed focus includes water treatment, water management, and related engineering projects.</p>
          </div>
          <div className="rounded-2xl border border-[#d9e6e1] bg-[#f2f6f3] p-5 sm:p-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#176c70]">Project inquiry contact</p>
            {HYDROQUALISENSE_PUBLIC_SITE.contact.email || HYDROQUALISENSE_PUBLIC_SITE.contact.phone ? (
              <div className="mt-3 space-y-2 text-sm font-bold text-[#17363d]">
                {HYDROQUALISENSE_PUBLIC_SITE.contact.email && <a className="block underline underline-offset-2" href={`mailto:${HYDROQUALISENSE_PUBLIC_SITE.contact.email}`}>{HYDROQUALISENSE_PUBLIC_SITE.contact.email}</a>}
                {HYDROQUALISENSE_PUBLIC_SITE.contact.phone && <a className="block underline underline-offset-2" href={`tel:${HYDROQUALISENSE_PUBLIC_SITE.contact.phone}`}>{HYDROQUALISENSE_PUBLIC_SITE.contact.phone}</a>}
              </div>
            ) : (
              <><h2 className="mt-3 text-xl font-bold tracking-[-0.02em] text-[#17363d]">Public contact details are pending confirmation.</h2><p className="mt-3 text-sm leading-7 text-[#607377]">{HYDROQUALISENSE_PUBLIC_SITE.contactPending}</p></>
            )}
            <a href="/" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#12676b] px-5 text-sm font-bold text-white transition hover:bg-[#0e5359] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#12676b]">Back to company overview <ArrowRight aria-hidden="true" className="h-4 w-4" /></a>
          </div>
        </div>
      </div>
    </main>
  );
}

export function CompanyPublicSite({ page = "landing" }: { page?: "landing" | "contact" }) {
  return (
    <div className="min-h-screen bg-[#fbfcfa]">
      <PublicSiteHeader variant="company" />
      {page === "contact" ? <CompanyContactPage /> : <CompanyLanding />}
      <PublicSiteFooter variant="company" />
    </div>
  );
}
