import React, { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Building2,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  FileText,
  HardHat,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { BRAND, formatPageTitle } from "../config/brand.ts";
import { BrandMark } from "../components/BrandMark.tsx";
import { DeploymentEnvironmentBanner } from "../components/DeploymentEnvironmentBanner.tsx";
import {
  PUBLIC_PROSPECT_FIELD_LIMITS,
  PUBLIC_PROSPECT_MODULES,
  PUBLIC_PROSPECT_PROJECT_SCALES,
  PUBLIC_PROSPECT_REQUEST_TYPES,
  PUBLIC_PROSPECT_TIMELINES,
  PUBLIC_PROSPECT_WORKFORCE_SCALES,
  type PublicProspectModuleKey,
  type PublicProspectProjectScale,
  type PublicProspectRequestType,
  type PublicProspectTimeline,
  type PublicProspectValidationFailure,
  type PublicProspectWorkforceScale,
  validatePublicProspectSubmission,
} from "../lib/publicProspect.ts";

type PublicView = "landing" | "request-demo" | "privacy" | "terms";

const CANONICAL_PRIVACY_URL = `${BRAND.canonicalOrigin}/privacy`;
const CANONICAL_TERMS_URL = `${BRAND.canonicalOrigin}/terms`;
const GOOGLE_API_SERVICES_USER_DATA_POLICY_URL = "https://developers.google.com/terms/api-services-user-data-policy";
const PUBLIC_POLICY_LAST_UPDATED = "September 15, 2026";

interface PublicFunnelRootProps {
  initialView?: PublicView;
}

interface ProspectFormState {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  modules: PublicProspectModuleKey[];
  workforceScale: PublicProspectWorkforceScale | "";
  projectScale: PublicProspectProjectScale | "";
  painPoints: string;
  integrationNeeds: string;
  desiredTimeline: PublicProspectTimeline | "";
  requestType: PublicProspectRequestType;
  consentConfirmed: boolean;
  website: string;
}

const CAPABILITY_CARDS: ReadonlyArray<{ icon: LucideIcon; title: string; detail: string }> = [
  { icon: BarChart3, title: "Project cost visibility", detail: "Keep project context, committed cost, actual cost, and source history distinct." },
  { icon: FileCheck2, title: "Supplier invoices and expenses", detail: "Review supplier evidence and preserve one authoritative payable path." },
  { icon: ClipboardList, title: "Procurement and receipts", detail: "Connect purchase orders, vendors, delivery evidence, and commitments." },
  { icon: Boxes, title: "Inventory and equipment", detail: "Explain warehouse stock, project allocation, and equipment through auditable records." },
  { icon: HardHat, title: "Field operations", detail: "Coordinate equipment, site logs, documents, and operational observations." },
  { icon: Building2, title: "Workforce and payroll", detail: "Support workforce and payroll operations with permission-aware access." },
  { icon: Mail, title: "Business communications", detail: "Review inbound business email and prepare user-confirmed outbound communication." },
];

const DEPLOYMENT_CARDS: ReadonlyArray<{ icon: LucideIcon; title: string; detail: string }> = [
  { icon: Building2, title: "Dedicated deployment", detail: "Independent URL, service reference, environment, and recovery boundary." },
  { icon: LockKeyhole, title: "Permission and history", detail: "Company-scoped access and deliberate lifecycle controls remain in force." },
  { icon: FileText, title: "Release visibility", detail: "Record the deployed SHA, migration level, backup state, and verification result." },
];

const INITIAL_FORM: ProspectFormState = {
  companyName: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  modules: [],
  workforceScale: "",
  projectScale: "",
  painPoints: "",
  integrationNeeds: "",
  desiredTimeline: "",
  requestType: "DEMO_AND_REQUIREMENTS",
  consentConfirmed: false,
  website: "",
};

function normalizedPublicPath(pathname: string) {
  const normalized = pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return normalized || "/";
}

function publicViewForPath(pathname: string): PublicView {
  const normalized = normalizedPublicPath(pathname);
  if (normalized === "/privacy") return "privacy";
  if (normalized === "/terms") return "terms";
  return normalized === "/" ? "landing" : "request-demo";
}

function publicPath(pathname: string) {
  const normalized = normalizedPublicPath(pathname);
  if (normalized === "/" || normalized === "/contact" || normalized === "/request-demo" || normalized === "/privacy" || normalized === "/terms") return normalized;
  return "/request-demo";
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="mt-1 text-xs font-semibold text-rose-700">{message}</p> : null;
}

function PublicHeader({ onRequestDemo }: { onRequestDemo?: () => void }) {
  return (
    <>
      <DeploymentEnvironmentBanner />
      <header className="border-b border-slate-200/80 bg-white/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8 lg:px-12">
        <a href="/" className="flex min-w-0 items-center gap-3" aria-label={`${BRAND.productName} home`}>
          <BrandMark variant="header" decorative={false} />
          <span className="min-w-0">
            <span className="block truncate text-xs font-black tracking-[0.24em] text-slate-950">{BRAND.displayUppercase}</span>
            <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-500">{BRAND.companyName}</span>
          </span>
        </a>
        <nav aria-label="Public site navigation" className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-xs font-bold text-slate-600">
          <a href="/#capabilities" className="transition hover:text-slate-950">Capabilities</a>
          <a href="/#deployment" className="transition hover:text-slate-950">Deployment model</a>
          {onRequestDemo ? <button type="button" onClick={onRequestDemo} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300">Talk to us <ArrowRight className="h-3.5 w-3.5" /></button> : <a href="/request-demo" className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300">Talk to us <ArrowRight className="h-3.5 w-3.5" /></a>}
          <a href="/dashboard" className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-slate-700 transition hover:border-slate-300 hover:text-slate-950">Client sign in</a>
        </nav>
      </div>
      </header>
    </>
  );
}

function PublicLandingPage({ onRequestDemo }: { onRequestDemo: () => void }) {
  return (
    <main data-public-funnel="landing" className="min-h-screen bg-slate-50 text-slate-950">
      <PublicHeader onRequestDemo={onRequestDemo} />
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(79,70,229,0.42),transparent_38%),radial-gradient(circle_at_12%_90%,rgba(14,165,233,0.18),transparent_35%)]" />
        <div className="relative mx-auto grid w-full max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20 lg:px-12 lg:py-28">
          <div className="max-w-2xl">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-indigo-300">Engineering operations, with a clear deployment boundary</p>
            <h1 className="mt-5 max-w-2xl text-4xl font-black leading-[1.02] tracking-[-0.04em] text-white sm:text-6xl">{BRAND.productName}: run the operation with confidence in the record behind it.</h1>
            <p className="mt-6 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
              {BRAND.productName} is a business operations platform connecting projects, procurement, finance, invoices, expenses, documents, payroll, communications, inventory, equipment, and field operations while preserving the source and history each workflow depends on.
            </p>
            <p className="mt-5 max-w-xl text-xs font-bold leading-6 text-slate-400">Projects · Procurement · Supplier invoices / expenses · Finance · Documents · Payroll · Inventory / equipment · Business communications</p>
            <p className="mt-4 max-w-xl text-xs leading-6 text-slate-400">Existing users can select Client sign in above to open their company workspace. Gmail is an optional connection explained below.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button type="button" onClick={onRequestDemo} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3.5 text-sm font-black text-white shadow-xl shadow-indigo-950/30 transition hover:bg-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300">
                Request a demo <ArrowRight className="h-4 w-4" />
              </button>
              <a href="/demo" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3.5 text-sm font-black text-slate-100 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-slate-400">
                Explore the sample workspace
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs font-semibold text-slate-400">
              <span>PHP-ready</span><span>Permission-aware</span><span>Audit-minded</span><span>Isolated per client</span>
            </div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5 shadow-2xl shadow-slate-950/30 sm:p-7">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-indigo-300">Operating principle</p>
                <h2 className="mt-2 text-xl font-black text-white">One concept. One primary place. One authoritative number.</h2>
              </div>
              <ShieldCheck className="h-8 w-8 shrink-0 text-cyan-300" />
            </div>
            <div className="mt-5 space-y-3">
              {[
                ["01", "Source first", "Evidence stays connected to the workflow that gives it meaning."],
                ["02", "History stays visible", "Issued, verified, paid, reversed, and corrected records remain auditable."],
                ["03", "Each client stays isolated", "Every operational deployment serves one client company and its own data boundary."],
              ].map(([number, title, detail]) => (
                <div key={number} className="flex gap-4 rounded-2xl border border-white/10 bg-slate-900/60 p-4">
                  <span className="text-xs font-black text-cyan-300">{number}</span>
                  <div><h3 className="text-sm font-black text-white">{title}</h3><p className="mt-1 text-xs leading-5 text-slate-400">{detail}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="gmail-integration" className="border-y border-indigo-100 bg-indigo-50/70">
        <div className="mx-auto grid w-full max-w-7xl gap-6 px-5 py-12 sm:px-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-start lg:px-12 lg:py-16">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-700">Optional integration</p>
            <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] text-slate-950">Optional Gmail integration</h2>
            <p className="mt-3 text-sm leading-7 text-slate-700">You choose whether to connect your own Google account. Hydroqualisense requests Gmail access only when a selected business-email workflow needs it.</p>
          </div>
          <ul className="grid gap-3 text-sm leading-6 text-slate-700 sm:grid-cols-2">
            <li className="rounded-2xl border border-indigo-100 bg-white p-4"><strong className="text-slate-950">Read access:</strong> <code className="text-xs font-bold text-indigo-700">gmail.readonly</code> supports authorized business-email intake and selected review workflows, including relevant messages and attachments.</li>
            <li className="rounded-2xl border border-indigo-100 bg-white p-4"><strong className="text-slate-950">Send access:</strong> <code className="text-xs font-bold text-indigo-700">gmail.send</code> is used only for outbound business communication that the user has reviewed and explicitly authorized.</li>
            <li className="rounded-2xl border border-indigo-100 bg-white p-4 sm:col-span-2"><strong className="text-slate-950">Bounded connection:</strong> connecting Gmail does not give Hydroqualisense unrestricted mailbox authority or create a wholesale mailbox backup.</li>
          </ul>
        </div>
      </section>

      <section id="capabilities" className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Connected, bounded workflows</p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.03em] sm:text-4xl">The parts of the operation can agree without becoming the same thing.</h2>
          <p className="mt-4 text-sm leading-7 text-slate-600">Start with the capabilities that matter to your team. Requirements are reviewed with a human before any client deployment is planned.</p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITY_CARDS.map(({ icon: Icon, title, detail }) => (
            <article key={title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/45">
              <Icon className="h-5 w-5 text-indigo-600" />
              <h3 className="mt-5 text-base font-black text-slate-950">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="deployment" className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:px-12 lg:py-24">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Designed for isolated client deployments</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.03em]">One maintained codebase. One dedicated operational boundary per client.</h2>
            <p className="mt-4 text-sm leading-7 text-slate-600">Approved clients receive a dedicated Render service and Supabase project/database/Auth/Storage boundary. The operational workspace never becomes an unrelated-company switcher.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {DEPLOYMENT_CARDS.map(({ icon: Icon, title, detail }) => (
              <article key={title} className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><Icon className="h-5 w-5 text-cyan-700" /><h3 className="mt-5 text-sm font-black text-slate-950">{title}</h3><p className="mt-2 text-xs leading-5 text-slate-600">{detail}</p></article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:px-12 lg:py-24">
        <div className="rounded-3xl bg-indigo-950 p-7 text-white sm:p-9">
          <Mail className="h-6 w-6 text-indigo-300" />
          <h2 className="mt-5 text-2xl font-black text-white">Let’s map the right first deployment.</h2>
          <p className="mt-3 max-w-lg text-sm leading-7 text-indigo-100/75">Share the business context, capabilities, approximate scale, and timeline. We will use it to prepare a focused conversation.</p>
          <button type="button" onClick={onRequestDemo} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-indigo-950 transition hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-white">Start the conversation <ArrowRight className="h-4 w-4" /></button>
        </div>
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-7 sm:p-9">
          <ShieldCheck className="h-6 w-6 text-amber-700" />
          <h2 className="mt-5 text-2xl font-black text-amber-950">A focused public intake</h2>
          <p className="mt-3 text-sm leading-7 text-amber-900/80">This form is for business requirements and demo contact only. It does not accept financial source documents, employee records, worker identity documents, biometrics, passwords, API keys, or other operationally sensitive records.</p>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}

const POLICY_SECTIONS = {
  privacy: [
    {
      title: "Information we handle",
      paragraphs: [
        "Hydroqualisense may handle information users provide directly, including account details, business contact details, company settings, operational notes, documents, invoices, expenses, project information, procurement records, workforce and payroll records, and communications created or imported through an authorized workflow.",
        "The product also stores business records and source evidence that an authorized company chooses to retain. The company and its authorized users remain responsible for deciding what operational information is entered and who should have access to it.",
      ],
    },
    {
      title: "Accounts and authentication",
      paragraphs: [
        "Authentication and account information are handled through the configured authentication service. Access to an operational deployment is controlled by the company membership and permissions assigned for that deployment. A sign-in account alone does not grant access to company data.",
      ],
    },
    {
      title: "Google Workspace and Gmail Data",
      paragraphs: [
        "When you voluntarily connect your own Google account, Hydroqualisense may access only the Google data needed for the approved workflow: Gmail message metadata; email sender, recipient, subject, and date information where needed; message content where needed for the selected workflow; selected attachments relevant to selected intake workflows; and Gmail sending capability for explicitly authorized outbound messages.",
        "The applicable Gmail permissions are gmail.readonly for read-only business-email intake and selected review or import workflows, and gmail.send for outbound business messages that the user explicitly authorizes. Hydroqualisense does not copy an entire mailbox as a wholesale backup and connecting Gmail does not give Hydroqualisense unrestricted mailbox authority.",
        "Hydroqualisense uses Gmail information to discover and review business emails; process supplier invoices, receipts, statements, or related authorized records; preserve source evidence when the user deliberately imports or routes a message or attachment; and prepare or send user-authorized outbound business messages.",
        "A selected message, attachment, or source item may become part of a company business record when the user intentionally imports or routes it. Gmail authorization credentials are handled separately from ordinary company records. Records that form part of financial or audit history may be retained according to the application's business-record and history model rather than silently deleted. Ordinary Gmail access is not a wholesale mailbox backup service.",
        "Google user data is not sold, is not used for advertising, and is not transferred to data brokers. Information may be processed by infrastructure or service providers only as necessary to deliver a user-requested feature and subject to the application's configured service boundaries, including Supabase for authentication, database, and storage; Google APIs when Gmail is connected; the configured AI service for a requested AI workflow; and an approved messaging provider when that capability is enabled.",
        "When a user invokes an AI-assisted workflow and selected Google-sourced content is needed, that selected content may be processed by the configured AI service solely to provide the requested product feature. Hydroqualisense does not use Google Workspace data to train generalized or non-personalized AI or machine-learning models. Hydroqualisense does not make independent promises about a third-party provider's practices beyond the service boundaries configured for the deployment.",
        "Routine manual reading of connected mailboxes is not part of the product workflow. Authorized personnel may access relevant information only as needed for support, security, abuse prevention, or legal requirements, or for a user/company-authorized troubleshooting request, subject to access controls.",
        "Users can revoke Google authorization through their Google Account permissions or security settings and can disconnect the integration in Hydroqualisense where supported. Revoking Gmail access prevents future API access, but does not necessarily erase legitimate company records or source evidence already deliberately imported into Hydroqualisense.",
      ],
    },
    {
      title: "Purpose, isolation, and security",
      paragraphs: [
        "Information is used to provide the business operations workflows requested by the company and its authorized users, preserve source and delivery history, support troubleshooting, and maintain access and security controls. Each operational deployment is intended for one client company with its own application, database, authentication, storage, and configuration boundary.",
        "Hydroqualisense applies access controls, company scoping, server-side handling of protected integration credentials, validation, and history-preserving workflow controls appropriate to the product. This summary does not promise a particular security certification or technical guarantee.",
      ],
    },
    {
      title: "Service providers",
      paragraphs: [
        "The product relies on configured infrastructure and integration providers, including the authentication/database/storage service, Google APIs when Gmail is connected, and the AI or messaging providers an operator deliberately configures. Provider availability, terms, retention, and regional handling may be governed by those providers' own policies. Hydroqualisense does not claim a provider is in use unless the relevant deployment configuration and workflow require it.",
      ],
    },
    {
      title: "Contact, deletion, and privacy requests",
      paragraphs: [
        "Operational records, selected source evidence, immutable snapshots, and delivery history may remain available so the company can preserve its business and audit context. Users should use the applicable company workflow to archive, correct, revoke, or remove information where supported; finalized or auditable history may require a deliberate correction or reversal rather than silent deletion.",
        "For a privacy question, access request, deletion/privacy request, or request to disconnect an integration, use the public Contact / requirements form at /contact and identify the relevant company and account without including passwords, API keys, financial source files, or other sensitive records. The form is a contact route, not a promise of a particular response time or legal process.",
      ],
    },
  ],
  terms: [
    {
      title: "Using the service",
      paragraphs: [
        "Hydroqualisense is a hosted business operations application. You may use it for legitimate business operations that your company has authorized, subject to the permissions and workflows available in your deployment.",
        "You must not use the service to access another company, bypass permissions, upload malicious or unlawful content, send unsolicited bulk messages, misuse connected accounts, or interfere with the availability or security of the service.",
      ],
    },
    {
      title: "Accounts and company data",
      paragraphs: [
        "You are responsible for protecting your sign-in details, using an account assigned to you, and promptly reporting suspected unauthorized access. Your company is responsible for the accuracy, lawful use, permissions, and retention decisions for the business data it enters or imports.",
        "Company and user-provided data remains subject to the company's rights and instructions. Hydroqualisense provides the configured application workflows and does not become the owner of a company's operational records merely because the records are stored or processed by the service.",
      ],
    },
    {
      title: "Connected services and messages",
      paragraphs: [
        "If you connect Google/Gmail or another supported provider, that service remains a third-party dependency and is subject to its own terms, availability, permissions, and policy decisions. You are responsible for choosing the account and scopes you authorize and for reviewing messages, recipients, documents, and attachments before sending them.",
        "You are responsible for the content and destination of messages and documents you send. The application may require review, confirmation, permissions, and reconciliation before a consequential send is completed.",
      ],
    },
    {
      title: "AI-assisted information",
      paragraphs: [
        "AI extraction, classification, drafting, and generated information are assistance features. You are responsible for reviewing AI-generated or AI-extracted information and confirming it against the source and the business context before relying on it or taking a consequential action. AI output does not replace required human, financial, tax, accounting, engineering, or legal review and is not a promise of accuracy or completeness.",
      ],
    },
    {
      title: "Availability and changes",
      paragraphs: [
        "The service depends on application infrastructure, authentication, storage, Google, messaging providers, network connectivity, and other third-party systems. Features may be unavailable, limited, delayed, or changed, and a provider may suspend or change access under its own policies. We may update the application, these Terms of Service, or a deployment's configuration as the product develops.",
      ],
    },
    {
      title: "Access removal and general terms",
      paragraphs: [
        "A company administrator or authorized operator may change permissions, suspend access, disconnect integrations, or remove an account from a deployment. Access removal does not by itself erase company records or finalized history that the product is designed to preserve.",
        "To ask a question about these Terms of Service, use the public Contact / requirements form at /contact without submitting confidential operational data.",
      ],
    },
  ],
} as const;

function PublicPolicyPage({ kind }: { kind: "privacy" | "terms" }) {
  const isPrivacy = kind === "privacy";
  const sections = POLICY_SECTIONS[kind];
  return (
    <main data-public-policy={kind} className="min-h-screen bg-slate-50 text-slate-950">
      <PublicHeader />
      <article className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8 lg:px-12 lg:py-20">
        <a href="/" className="text-xs font-black text-indigo-700 hover:text-indigo-900">← Back to {BRAND.productName}</a>
        <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">{BRAND.productName} · {BRAND.companyName}</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.03em] sm:text-4xl">{isPrivacy ? "Privacy Policy" : "Terms of Service"}</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">{isPrivacy ? "How Hydroqualisense handles account, company, connected Google, and workflow information." : "The basic terms for authorized use of the Hydroqualisense business operations platform."}</p>
          <p className="mt-3 text-xs font-semibold text-slate-500">Effective date: {PUBLIC_POLICY_LAST_UPDATED} · Last updated: {PUBLIC_POLICY_LAST_UPDATED}</p>
          <div className="mt-8 space-y-8">
            {sections.map((section) => {
              const id = `${kind}-${section.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
              return <section key={section.title} aria-labelledby={id}><h2 id={id} className="text-lg font-black text-slate-950">{section.title}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph} className="mt-3 text-sm leading-7 text-slate-700">{paragraph}</p>)}{isPrivacy && section.title === "Google Workspace and Gmail Data" && <p className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm leading-7 text-indigo-950">Hydroqualisense&apos;s use and transfer of information received from Google APIs adheres to the <a href={GOOGLE_API_SERVICES_USER_DATA_POLICY_URL} target="_blank" rel="noreferrer" className="font-bold text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-900">Google API Services User Data Policy, including the Limited Use requirements</a>.</p>}</section>;
            })}
          </div>
        </div>
      </article>
      <PublicFooter />
    </main>
  );
}

function PublicFooter() {
  return <footer className="border-t border-slate-200 bg-slate-100"><div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-5 py-7 text-xs leading-5 text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12"><span>{BRAND.productName} • {BRAND.companyName}</span><nav aria-label="Public policy navigation" className="flex flex-wrap gap-x-4 gap-y-1"><a href={CANONICAL_PRIVACY_URL} className="font-bold text-slate-700 hover:text-slate-950">Privacy Policy</a><a href={CANONICAL_TERMS_URL} className="font-bold text-slate-700 hover:text-slate-950">Terms of Service</a><a href="/contact" className="font-bold text-slate-700 hover:text-slate-950">Contact</a><a href="/dashboard" className="font-bold text-slate-700 hover:text-slate-950">Client sign in</a></nav></div></footer>;
}

function ProspectRequirementsForm({ onBack }: { onBack: () => void }) {
  const [form, setForm] = useState<ProspectFormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverMessage, setServerMessage] = useState("");

  const update = <K extends keyof ProspectFormState>(key: K, value: ProspectFormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key as string] && !current.form) return current;
      const next = { ...current };
      delete next[key as string];
      delete next.form;
      return next;
    });
  };

  const toggleModule = (module: PublicProspectModuleKey) => {
    const next = form.modules.includes(module) ? form.modules.filter((item) => item !== module) : [...form.modules, module];
    update("modules", next);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setServerMessage("");
    const validation = validatePublicProspectSubmission(form);
    if (!validation.ok) {
      setErrors((validation as PublicProspectValidationFailure).fields);
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/public/prospects", {
        method: "POST",
        headers: { "Accept": "application/json", "Content-Type": "application/json" },
        credentials: "omit",
        cache: "no-store",
        body: JSON.stringify(form),
      });
      const body = await response.json().catch(() => null) as unknown;
      if (!response.ok || !body || typeof body !== "object" || (body as { success?: unknown }).success !== true) {
        if (body && typeof body === "object" && "fields" in body && (body as { fields?: unknown }).fields && typeof (body as { fields: unknown }).fields === "object") {
          setErrors((body as { fields: Record<string, string> }).fields);
        }
        const message = response.status === 429
          ? "The form has reached its short-term request limit. Please try again later."
          : "The request could not be submitted right now. Please try again shortly.";
        throw new Error(message);
      }
      setSubmitted(true);
      setForm(INITIAL_FORM);
    } catch (error) {
      setServerMessage(error instanceof Error ? error.message : "The request could not be submitted right now. Please try again shortly.");
    } finally {
      setPending(false);
    }
  };

  if (submitted) {
    return (
      <main data-public-funnel="form-success" className="min-h-screen bg-slate-50 text-slate-950">
        <PublicHeader />
        <div className="mx-auto flex w-full max-w-3xl px-5 py-16 sm:px-8 lg:py-24">
          <section className="w-full rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center sm:p-12">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-700" />
            <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Request received</p>
            <h1 className="mt-3 text-3xl font-black tracking-[-0.03em] text-emerald-950">Thanks for starting the conversation.</h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-emerald-900/80">The Hydroqualisense team can now review the requirements you shared and contact you using the business details provided. This request does not provision a deployment, company, user, credential, or secret.</p>
            <a href="/" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-800">Return to Hydroqualisense <ArrowRight className="h-4 w-4" /></a>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main data-public-funnel="form" className="min-h-screen bg-slate-50 text-slate-950">
      <PublicHeader />
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[0.72fr_1.28fr] lg:px-12 lg:py-20">
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <button type="button" onClick={onBack} className="text-xs font-black text-indigo-700 transition hover:text-indigo-900">← Back to overview</button>
          <p className="mt-10 text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Prospective client intake</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] sm:text-5xl">Tell us what a useful first deployment needs to do.</h1>
          <p className="mt-5 text-sm leading-7 text-slate-600">A few bounded details help us prepare a relevant demo and requirements conversation. Fields marked required are the minimum needed to respond.</p>
          <div className="mt-8 space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            {["No uploads or sensitive documents", "No automatic infrastructure or user provisioning", "Requirements remain separate from operational client data"].map((item) => <p key={item} className="flex gap-2 text-xs font-semibold leading-5 text-slate-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{item}</p>)}
          </div>
        </aside>

        <form onSubmit={(event) => void handleSubmit(event)} noValidate className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/50 sm:p-8" aria-labelledby="prospect-form-title">
          <div className="border-b border-slate-200 pb-5"><h2 id="prospect-form-title" className="text-xl font-black">Requirements and demo contact</h2><p className="mt-1 text-sm text-slate-500">Keep the answers approximate where a decision is not final.</p></div>
          {errors.form || serverMessage ? <div role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold leading-6 text-rose-800">{errors.form || serverMessage}</div> : null}

          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <div><label htmlFor="companyName" className="field-label">Company name <span className="text-rose-600">*</span></label><input id="companyName" name="companyName" value={form.companyName} maxLength={PUBLIC_PROSPECT_FIELD_LIMITS.companyName} onChange={(event) => update("companyName", event.target.value)} aria-invalid={Boolean(errors.companyName)} aria-describedby="companyName-error" className="field-input mt-1.5" autoComplete="organization" /> <FieldError id="companyName-error" message={errors.companyName} /></div>
            <div><label htmlFor="contactName" className="field-label">Contact name <span className="text-rose-600">*</span></label><input id="contactName" name="contactName" value={form.contactName} maxLength={PUBLIC_PROSPECT_FIELD_LIMITS.contactName} onChange={(event) => update("contactName", event.target.value)} aria-invalid={Boolean(errors.contactName)} aria-describedby="contactName-error" className="field-input mt-1.5" autoComplete="name" /> <FieldError id="contactName-error" message={errors.contactName} /></div>
            <div><label htmlFor="contactEmail" className="field-label">Business email <span className="text-rose-600">*</span></label><input id="contactEmail" name="contactEmail" type="email" value={form.contactEmail} maxLength={PUBLIC_PROSPECT_FIELD_LIMITS.contactEmail} onChange={(event) => update("contactEmail", event.target.value)} aria-invalid={Boolean(errors.contactEmail)} aria-describedby="contactEmail-error" className="field-input mt-1.5" autoComplete="email" /> <FieldError id="contactEmail-error" message={errors.contactEmail} /></div>
            <div><label htmlFor="contactPhone" className="field-label">Business phone <span className="font-normal text-slate-400">(optional)</span></label><input id="contactPhone" name="contactPhone" type="tel" value={form.contactPhone} maxLength={PUBLIC_PROSPECT_FIELD_LIMITS.contactPhone} onChange={(event) => update("contactPhone", event.target.value)} aria-invalid={Boolean(errors.contactPhone)} aria-describedby="contactPhone-error" className="field-input mt-1.5" autoComplete="tel" /> <FieldError id="contactPhone-error" message={errors.contactPhone} /></div>
          </div>

          <fieldset className="mt-8"><legend className="field-label">Capabilities of interest <span className="font-normal text-slate-400">(choose up to 8)</span></legend><div className="mt-3 grid gap-3 sm:grid-cols-2">{PUBLIC_PROSPECT_MODULES.map((module) => <label key={module.value} className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-indigo-300 has-[:checked]:border-indigo-400 has-[:checked]:bg-indigo-50"><input type="checkbox" checked={form.modules.includes(module.value)} onChange={() => toggleModule(module.value)} className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" /><span><span className="block text-sm font-bold text-slate-800">{module.label}</span><span className="mt-0.5 block text-xs leading-5 text-slate-500">{module.detail}</span></span></label>)}</div><FieldError id="modules-error" message={errors.modules} /></fieldset>

          <div className="mt-8 grid gap-5 sm:grid-cols-2">
            <SelectField id="workforceScale" label="Approximate workforce scale" value={form.workforceScale} options={PUBLIC_PROSPECT_WORKFORCE_SCALES} required error={errors.workforceScale} onChange={(value) => update("workforceScale", value as ProspectFormState["workforceScale"])} />
            <SelectField id="projectScale" label="Approximate active projects" value={form.projectScale} options={PUBLIC_PROSPECT_PROJECT_SCALES} required error={errors.projectScale} onChange={(value) => update("projectScale", value as ProspectFormState["projectScale"])} />
            <SelectField id="desiredTimeline" label="Desired deployment timeline" value={form.desiredTimeline} options={PUBLIC_PROSPECT_TIMELINES} required error={errors.desiredTimeline} onChange={(value) => update("desiredTimeline", value as ProspectFormState["desiredTimeline"])} />
            <SelectField id="requestType" label="What would be most useful?" value={form.requestType} options={PUBLIC_PROSPECT_REQUEST_TYPES} required error={errors.requestType} onChange={(value) => update("requestType", value as PublicProspectRequestType)} />
          </div>

          <div className="mt-8 grid gap-5"><div><label htmlFor="painPoints" className="field-label">Current operational pain points <span className="font-normal text-slate-400">(optional)</span></label><textarea id="painPoints" name="painPoints" value={form.painPoints} maxLength={PUBLIC_PROSPECT_FIELD_LIMITS.painPoints} onChange={(event) => update("painPoints", event.target.value)} aria-invalid={Boolean(errors.painPoints)} aria-describedby="painPoints-error" className="field-input mt-1.5 min-h-28 resize-y" placeholder="For example: disconnected project costs, receipt visibility, or document history." /> <FieldError id="painPoints-error" message={errors.painPoints} /></div><div><label htmlFor="integrationNeeds" className="field-label">Integration needs or constraints <span className="font-normal text-slate-400">(optional)</span></label><textarea id="integrationNeeds" name="integrationNeeds" value={form.integrationNeeds} maxLength={PUBLIC_PROSPECT_FIELD_LIMITS.integrationNeeds} onChange={(event) => update("integrationNeeds", event.target.value)} aria-invalid={Boolean(errors.integrationNeeds)} aria-describedby="integrationNeeds-error" className="field-input mt-1.5 min-h-24 resize-y" placeholder="Name systems or provider constraints at a high level; do not share keys or credentials." /> <FieldError id="integrationNeeds-error" message={errors.integrationNeeds} /></div></div>

          <label className="mt-7 flex cursor-pointer gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5"><input type="checkbox" checked={form.consentConfirmed} onChange={(event) => update("consentConfirmed", event.target.checked)} aria-invalid={Boolean(errors.consentConfirmed)} aria-describedby="consentConfirmed-error" className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" /><span className="text-xs font-semibold leading-5 text-slate-700">You confirm that Hydroqualisense may use these business contact details to respond to this request. Please do not include confidential records, passwords, API keys, or sensitive personal data. <span className="text-rose-600">*</span><FieldError id="consentConfirmed-error" message={errors.consentConfirmed} /></span></label>
          <input name="website" value={form.website} onChange={(event) => update("website", event.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-slate-500">No production resources are created from this form.</p><button type="submit" disabled={pending} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Sending request…" : "Send requirements request"} {!pending && <ArrowRight className="h-4 w-4" />}</button></div>
        </form>
      </div>
      <PublicFooter />
    </main>
  );
}

function SelectField<T extends string>({ id, label, value, options, required = false, error, onChange }: { id: string; label: string; value: T | ""; options: ReadonlyArray<{ value: T; label: string }>; required?: boolean; error?: string; onChange: (value: string) => void }) {
  return <div><label htmlFor={id} className="field-label">{label} {required && <span className="text-rose-600">*</span>}</label><select id={id} name={id} value={value} required={required} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={`${id}-error`} className="field-input mt-1.5"><option value="">Select one</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><FieldError id={`${id}-error`} message={error} /></div>;
}

export default function PublicFunnelRoot({ initialView }: PublicFunnelRootProps) {
  const [view, setView] = useState<PublicView>(() => initialView || publicViewForPath(window.location.pathname));

  const navigate = useCallback((path: string, replace = false) => {
    const nextPath = publicPath(path);
    window.history[replace ? "replaceState" : "pushState"]({}, "", nextPath);
    setView(publicViewForPath(nextPath));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const handlePopState = () => setView(publicViewForPath(window.location.pathname));
    window.addEventListener("popstate", handlePopState);
    document.title = formatPageTitle(view === "landing" ? undefined : view === "privacy" ? "Privacy Policy" : view === "terms" ? "Terms of Service" : "Request a demo");
    return () => window.removeEventListener("popstate", handlePopState);
  }, [view]);

  if (view === "privacy" || view === "terms") return <PublicPolicyPage kind={view} />;
  return view === "landing"
    ? <PublicLandingPage onRequestDemo={() => navigate("/request-demo")} />
    : <ProspectRequirementsForm onBack={() => navigate("/")} />;
}
