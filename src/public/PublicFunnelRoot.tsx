import React, { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { HYDROQUALISENSE_PUBLIC_SITE, QA_SOFTWARE_SHOWCASE, type PublicSiteVariant } from "../config/publicBranding.ts";
import { currentDeploymentIdentity } from "../lib/deploymentIdentity.ts";
import { isCanonicalHydroqualisenseHost } from "../app/applicationMode.ts";
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
import { CompanyPublicSite } from "./CompanyPublicSite.tsx";
import { PublicSiteFooter, PublicSiteHeader } from "./PublicSiteChrome.tsx";
import { publicPageMetadataFor, applyPublicPageMetadata, type PublicPageKind } from "./publicMetadata.ts";
import { SoftwareShowcaseLanding } from "./SoftwareShowcaseLanding.tsx";

type PublicView = PublicPageKind;

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

const PUBLIC_POLICY_LAST_UPDATED = "September 15, 2026";
const GOOGLE_API_SERVICES_USER_DATA_POLICY_URL = "https://developers.google.com/terms/api-services-user-data-policy";

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
  if (normalized === "/contact") return "contact";
  if (normalized === "/request-demo") return "request-demo";
  return "landing";
}

function publicPath(pathname: string) {
  const normalized = normalizedPublicPath(pathname);
  if (normalized === "/" || normalized === "/contact" || normalized === "/request-demo" || normalized === "/privacy" || normalized === "/terms") return normalized;
  return "/contact";
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="mt-1 text-xs font-semibold text-rose-700">{message}</p> : null;
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
      title: "Google Sign-In and transactional email",
      paragraphs: [
        "Google Sign-In is used for identity only through the configured authentication service. Hydroqualisense requests the OIDC identity scopes openid, email, and profile and does not request Gmail mailbox read, modify, or send scopes.",
        "Hydroqualisense does not read, scan, import from, or send through a Gmail mailbox. Historical records that were deliberately created through an earlier email workflow may retain source and provider identifiers for audit and provenance; those identifiers do not represent current mailbox access.",
        "When enabled for a deployment, outbound transactional email is sent through the company's server-side Brevo configuration. The application requires human review and confirmation, preserves the immutable document/PDF provenance and delivery intent, and distinguishes Brevo provider acceptance from confirmed delivery.",
        "Google account identity information is not sold, used for advertising, or transferred to data brokers. Information may be processed by configured infrastructure, AI, and messaging providers only as necessary to deliver the requested feature and subject to the deployment's service boundaries.",
        "Users can revoke Google Sign-In authorization through their Google Account permissions or security settings. Revoking identity authorization prevents future sign-in through that provider but does not necessarily erase legitimate company records or historical source evidence already retained by the company.",
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
        "The product relies on configured infrastructure and integration providers, including the authentication/database/storage service, Google Sign-In for identity, Brevo for outbound email when configured, and the AI or SMS providers an operator deliberately configures. Provider availability, terms, retention, and regional handling may be governed by those providers' own policies. Hydroqualisense does not claim a provider is in use unless the relevant deployment configuration and workflow require it.",
      ],
    },
    {
      title: "Contact, deletion, and privacy requests",
      paragraphs: [
        "Operational records, selected source evidence, immutable snapshots, and delivery history may remain available so the company can preserve its business and audit context. Users should use the applicable company workflow to archive, correct, revoke, or remove information where supported; finalized or auditable history may require a deliberate correction or reversal rather than silent deletion.",
        "For a privacy question, access request, deletion/privacy request, or request to disconnect an integration, use the public Contact page at /contact and identify the relevant company and account without including passwords, API keys, financial source files, or other sensitive records. The page does not promise a particular response time or legal process.",
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
        "Google Sign-In, Brevo, SMS, and other supported providers remain third-party dependencies subject to their own terms, availability, permissions, and policy decisions. You are responsible for choosing the account you authorize and for reviewing messages, recipients, documents, and attachments before sending them.",
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
        "To ask a question about these Terms of Service, use the public Contact page at /contact without submitting confidential operational data.",
      ],
    },
  ],
} as const;

function PublicPolicyPage({ kind, variant }: { kind: "privacy" | "terms"; variant: PublicSiteVariant }) {
  const isPrivacy = kind === "privacy";
  const sections = POLICY_SECTIONS[kind];
  return (
    <main id="public-main" data-public-policy={kind} className="min-h-screen bg-slate-50 text-slate-950">
      <PublicSiteHeader variant={variant} />
      <article className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8 lg:px-12 lg:py-20">
        <a href="/" className="text-xs font-black text-indigo-700 hover:text-indigo-900">← Back to {variant === "company" ? HYDROQUALISENSE_PUBLIC_SITE.identity.companyName : QA_SOFTWARE_SHOWCASE.softwareIdentity.neutralDescriptor}</a>
        <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">{variant === "company" ? HYDROQUALISENSE_PUBLIC_SITE.identity.companyName : QA_SOFTWARE_SHOWCASE.softwareIdentity.label}</p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.03em] sm:text-4xl">{isPrivacy ? "Privacy Policy" : "Terms of Service"}</h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">{isPrivacy ? "How Hydroqualisense handles account, company, connected Google, and workflow information." : "The basic terms for authorized use of the Hydroqualisense client workspace."}</p>
          <p className="mt-3 text-xs font-semibold text-slate-500">Effective date: {PUBLIC_POLICY_LAST_UPDATED} · Last updated: {PUBLIC_POLICY_LAST_UPDATED}</p>
          <div className="mt-8 space-y-8">
            {sections.map((section) => {
              const id = `${kind}-${section.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
              return <section key={section.title} aria-labelledby={id}><h2 id={id} className="text-lg font-black text-slate-950">{section.title}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph} className="mt-3 text-sm leading-7 text-slate-700">{paragraph}</p>)}{isPrivacy && section.title === "Google Sign-In and transactional email" && <p className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm leading-7 text-indigo-950">Hydroqualisense&apos;s use and transfer of Google account information follows the <a href={GOOGLE_API_SERVICES_USER_DATA_POLICY_URL} target="_blank" rel="noreferrer" className="font-bold text-indigo-700 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-900">Google API Services User Data Policy</a>.</p>}</section>;
            })}
          </div>
        </div>
      </article>
      <PublicSiteFooter variant={variant} />
    </main>
  );
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
      <main id="public-main" data-public-funnel="form-success" className="min-h-screen bg-slate-50 text-slate-950">
        <PublicSiteHeader variant="software-showcase" />
        <div className="mx-auto flex w-full max-w-3xl px-5 py-16 sm:px-8 lg:py-24">
          <section className="w-full rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center sm:p-12">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-700" />
            <p className="mt-5 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Request received</p>
            <h1 className="mt-3 text-3xl font-black tracking-[-0.03em] text-emerald-950">Thanks for starting the conversation.</h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-emerald-900/80">Your software showcase request was received. The details you shared may be reviewed for follow-up. This request does not provision a deployment, company, user, credential, or secret.</p>
            <a href="/" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-800">Return to the software showcase <ArrowRight className="h-4 w-4" /></a>
          </section>
        </div>
      </main>
    );
  }

  return (
      <main id="public-main" data-public-funnel="form" className="min-h-screen bg-slate-50 text-slate-950">
      <PublicSiteHeader variant="software-showcase" />
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

          <label className="mt-7 flex cursor-pointer gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5"><input type="checkbox" checked={form.consentConfirmed} onChange={(event) => update("consentConfirmed", event.target.checked)} aria-invalid={Boolean(errors.consentConfirmed)} aria-describedby="consentConfirmed-error" className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" /><span className="text-xs font-semibold leading-5 text-slate-700">You confirm that these business contact details may be used to respond to this software request. Please do not include confidential records, passwords, API keys, or sensitive personal data. <span className="text-rose-600">*</span><FieldError id="consentConfirmed-error" message={errors.consentConfirmed} /></span></label>
          <input name="website" value={form.website} onChange={(event) => update("website", event.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-slate-500">No production resources are created from this form.</p><button type="submit" disabled={pending} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-black text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Sending request…" : "Send requirements request"} {!pending && <ArrowRight className="h-4 w-4" />}</button></div>
        </form>
      </div>
      <PublicSiteFooter variant="software-showcase" />
    </main>
  );
}

function SelectField<T extends string>({ id, label, value, options, required = false, error, onChange }: { id: string; label: string; value: T | ""; options: ReadonlyArray<{ value: T; label: string }>; required?: boolean; error?: string; onChange: (value: string) => void }) {
  return <div><label htmlFor={id} className="field-label">{label} {required && <span className="text-rose-600">*</span>}</label><select id={id} name={id} value={value} required={required} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={`${id}-error`} className="field-input mt-1.5"><option value="">Select one</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><FieldError id={`${id}-error`} message={error} /></div>;
}

export default function PublicFunnelRoot({ initialView }: PublicFunnelRootProps) {
  const deployment = currentDeploymentIdentity();
  const variant: PublicSiteVariant = deployment.isQa ? "software-showcase" : "company";
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
    applyPublicPageMetadata(publicPageMetadataFor(variant, view, window.location.pathname, isCanonicalHydroqualisenseHost(window.location.hostname)));
    return () => window.removeEventListener("popstate", handlePopState);
  }, [view, variant]);

  if (view === "privacy" || view === "terms") return <PublicPolicyPage kind={view} variant={variant} />;

  if (variant === "software-showcase") {
    if (view === "landing") return <SoftwareShowcaseLanding />;
    if (!deployment.publicFunnelEnabled) {
      return (
        <div className="min-h-screen bg-[#f4f7f5]">
          <PublicSiteHeader variant="software-showcase" />
          <main id="public-main" data-public-funnel="disabled" className="mx-auto flex min-h-[55vh] w-full max-w-4xl flex-col justify-center px-5 py-16 sm:px-8">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#11777a]">QA Software Showcase</p>
            <h1 className="mt-3 max-w-[16ch] font-serif text-4xl font-medium leading-tight tracking-[-0.035em] text-[#102f3a] sm:text-5xl">Software inquiries are not enabled here.</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[#5e7377]">You can still explore the synthetic demo workspace. No software inquiry details are collected by this build.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="/demo" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#12676b] px-5 text-sm font-bold text-white transition hover:bg-[#0e5359] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12676b]">Launch Demo Workspace <ArrowRight aria-hidden="true" className="h-4 w-4" /></a>
              <button type="button" onClick={() => navigate("/")} className="min-h-11 rounded-full border border-[#cadbd5] px-5 text-sm font-semibold text-[#28575c] transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12676b]">Back to showcase</button>
            </div>
          </main>
          <PublicSiteFooter variant="software-showcase" />
        </div>
      );
    }
    return <ProspectRequirementsForm onBack={() => navigate("/")} />;
  }

  if (view === "landing") return <CompanyPublicSite />;
  return <CompanyPublicSite page="contact" />;
}
