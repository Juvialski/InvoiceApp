import React from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileText,
  Landmark,
  Lightbulb,
  Mail,
  Receipt,
  ShoppingCart,
  ShieldCheck,
  Sparkles,
  Users,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {
  getProductFeaturesByStatus,
  PRODUCT_FEATURE_STATUS_LABELS,
  type ProductFeatureCategory,
  type ProductFeatureDefinition,
  type ProductFeatureStatus,
} from "../config/productFeatures.ts";
import { SectionHeader, StatusBadge, type StatusTone } from "./ui/OperationsUI.tsx";

const categoryIcons: Readonly<Record<ProductFeatureCategory, LucideIcon>> = {
  "Projects & Operations": BriefcaseBusiness,
  "Project Financial Visibility": BarChart3,
  "Supplier Invoices & Expenses": Receipt,
  "Client Billing & Collections": FileText,
  "Cash & Banking": Landmark,
  "Payroll & Workforce": Users,
  Procurement: ShoppingCart,
  "Engineering & Field Operations": FileText,
  "Warehouse & Inventory": Warehouse,
  Equipment: Wrench,
  "Reporting & Oversight": BarChart3,
  "Email & Document Intake": Mail,
  "AI Assistance": Sparkles,
  "Access & Administration": ShieldCheck,
};

const statusMeta: Readonly<Record<ProductFeatureStatus, { heading: string; description: string; tone: StatusTone; icon: LucideIcon }>> = {
  AVAILABLE: {
    heading: "Available now",
    description: "Completed, user-facing workflows that are available in the current product.",
    tone: "success",
    icon: CheckCircle2,
  },
  PLANNED: {
    heading: "Planned",
    description: "Approved direction for a future implementation. These cards are informational and do not activate access.",
    tone: "warning",
    icon: Clock3,
  },
  FUTURE_DESIGN: {
    heading: "Future / Design Stage",
    description: "Longer-term direction that still requires product, privacy, security, or workflow design before implementation.",
    tone: "neutral",
    icon: Lightbulb,
  },
};

const statusOrder: readonly ProductFeatureStatus[] = ["AVAILABLE", "PLANNED", "FUTURE_DESIGN"];

function FeatureCard({ feature }: { feature: ProductFeatureDefinition }) {
  const Icon = categoryIcons[feature.category];
  const meta = statusMeta[feature.status];
  const cardTone = feature.status === "AVAILABLE"
    ? "border-emerald-100 bg-emerald-50/30"
    : feature.status === "PLANNED"
      ? "border-amber-100 bg-amber-50/20"
      : "border-slate-200 bg-slate-50/50";

  return (
    <article
      data-product-feature-id={feature.id}
      data-product-feature-status={feature.status}
      className={`flex min-w-0 flex-col rounded-xl border p-4 ${cardTone}`}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/70">
          <Icon aria-hidden="true" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{feature.category}</p>
          <h4 className="mt-1 break-words text-sm font-black text-slate-950">{feature.title}</h4>
        </div>
        <StatusBadge tone={meta.tone}>{PRODUCT_FEATURE_STATUS_LABELS[feature.status]}</StatusBadge>
      </div>

      <p className="mt-3 text-xs leading-5 text-slate-700">{feature.shortDescription}</p>

      {feature.details.length > 0 && (
        <details className="mt-3 border-t border-slate-200/80 pt-2">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[10px] font-black text-indigo-700 [&::-webkit-details-marker]:hidden">
            <span>What this includes</span>
            <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 transition-transform details-open:rotate-180" />
          </summary>
          <ul className="mt-2 space-y-1.5 text-[11px] leading-4 text-slate-600">
            {feature.details.map((detail) => <li key={detail} className="flex items-start gap-2"><span aria-hidden="true" className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-indigo-400" />{detail}</li>)}
          </ul>
        </details>
      )}
    </article>
  );
}

function StatusSection({ status }: { status: ProductFeatureStatus }) {
  const meta = statusMeta[status];
  const features = getProductFeaturesByStatus(status);
  const Icon = meta.icon;

  return (
    <section aria-labelledby={`product-features-${status.toLowerCase()}-heading`} className="border-t border-slate-100 pt-5 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <Icon aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${status === "AVAILABLE" ? "text-emerald-600" : status === "PLANNED" ? "text-amber-600" : "text-slate-500"}`} />
          <div className="min-w-0">
            <h3 id={`product-features-${status.toLowerCase()}-heading`} className="text-sm font-black text-slate-950">{meta.heading}</h3>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">{meta.description}</p>
          </div>
        </div>
        <StatusBadge tone={meta.tone}>{features.length} {features.length === 1 ? "capability" : "capabilities"}</StatusBadge>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {features.map((feature) => <FeatureCard key={feature.id} feature={feature} />)}
      </div>
    </section>
  );
}

/** Client-facing product truth surface. Informational only; it does not activate roadmap work. */
export const ProductFeaturesRoadmap: React.FC = () => (
  <section aria-label="Hydroqualisense Features & Roadmap" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
        <Sparkles aria-hidden="true" className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <SectionHeader
          title="Hydroqualisense Features & Roadmap"
          description="A clear guide to what is available now, what is approved next, and what remains in future design. No delivery dates are implied."
        />
      </div>
    </div>

    <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3.5 py-3 text-xs leading-5 text-indigo-950">
      Available items reflect completed user-facing workflows. Planned and future cards describe direction only; they do not add routes, permissions, or product access.
    </div>

    <div className="mt-5 space-y-5">
      {statusOrder.map((status) => <StatusSection key={status} status={status} />)}
    </div>
  </section>
);

export default ProductFeaturesRoadmap;
