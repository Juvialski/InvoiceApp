import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  HelpCircle,
  Link2,
  Mail,
  PlusCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Undo2,
  Users,
} from "lucide-react";
import {
  EntityResolutionAction,
  EntityResolutionConflict,
  EntityResolutionResult,
  InvoiceData,
  Vendor,
} from "../types";
import { formatMoney } from "../utils/invoiceLogic";
import { formatDateTime } from "../config/regional";
import { listCompanyVendors } from "../lib/persistence";

interface ReviewPanelProps {
  invoice: InvoiceData;
  onVerify?: () => void;
  onReopen?: () => void | Promise<void>;
  onRevertToAI?: () => void;
  onFocusField?: (field: string) => void;
  onRevertField?: (field: string) => void;
  verifyLabel?: string;
  vendors?: Vendor[];
  onUpdateInvoice?: (updated: InvoiceData) => void;
}

const comparisonFields: Array<{ path: string; label: string }> = [
  { path: "invoiceNumber", label: "Invoice #" },
  { path: "invoiceDate", label: "Invoice date" },
  { path: "dueDate", label: "Due date" },
  { path: "projectReference", label: "Project / reference" },
  { path: "vendor.name", label: "Vendor" },
  { path: "vendor.taxId", label: "Vendor TIN" },
  { path: "customer.name", label: "Customer" },
  { path: "customer.taxId", label: "Customer TIN" },
  { path: "subtotal", label: "Subtotal" },
  { path: "totalTax", label: "Tax" },
  { path: "grandTotal", label: "Grand total" },
  { path: "balanceDue", label: "Balance due" },
  { path: "philippineTaxDetails.vatableSales", label: "VATable Sales" },
  { path: "philippineTaxDetails.vatAmount", label: "VAT Amount" },
  { path: "philippineTaxDetails.zeroRatedSales", label: "Zero-Rated Sales" },
  { path: "philippineTaxDetails.vatExemptSales", label: "VAT-Exempt Sales" },
  { path: "withholdingTaxAmount", label: "Withholding Tax" },
  { path: "items", label: "Line items" },
];

function valueAt(value: any, path: string) {
  return path.split(".").reduce((current, key) => current?.[key], value);
}

function shortValue(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function displayValue(path: string, value: unknown, currency: string) {
  if (typeof value === "number" && (path.includes("Tax") || path.includes("Sales") || ["subtotal", "totalTax", "grandTotal", "balanceDue"].includes(path))) {
    return currency ? formatMoney(value, currency) : "Currency unclear";
  }
  return shortValue(value);
}

function getResolutionActionBadge(
  action?: EntityResolutionAction,
  matchedName?: string,
  conflicts?: EntityResolutionConflict[],
) {
  const conflictSummary =
    conflicts && conflicts.length > 0 ? conflicts[0].reason : "Conflict detected";
  switch (action) {
    case "LINK_EXISTING":
      return {
        label: `Link: ${matchedName || "Existing Vendor"}`,
        bg: "bg-emerald-100 text-emerald-800 border-emerald-300",
        icon: Link2,
      };
    case "ENRICH_EXISTING":
      return {
        label: `Enrich: ${matchedName || "Existing Vendor"}`,
        bg: "bg-blue-100 text-blue-800 border-blue-300",
        icon: Sparkles,
      };
    case "CREATE_NEW":
      return {
        label: `New: ${matchedName || "New Vendor"}`,
        bg: "bg-purple-100 text-purple-800 border-purple-300",
        icon: PlusCircle,
      };
    case "POSSIBLE_DUPLICATE":
      return {
        label: `Similar: ${matchedName || "Existing Vendor"}`,
        bg: "bg-amber-100 text-amber-800 border-amber-300",
        icon: HelpCircle,
      };
    case "NEEDS_REVIEW":
    default:
      return {
        label: `Needs Review: ${conflictSummary}`,
        bg: "bg-rose-100 text-rose-800 border-rose-300",
        icon: AlertTriangle,
      };
  }
}

export const ReviewPanel: React.FC<ReviewPanelProps> = ({
  invoice,
  onVerify,
  onReopen,
  onRevertToAI,
  onFocusField,
  onRevertField,
  verifyLabel = "Mark verified",
  vendors,
  onUpdateInvoice,
}) => {
  const [expandedField, setExpandedField] = useState<string | null>(null);
  const [internalVendors, setInternalVendors] = useState<Vendor[]>(vendors || []);
  const issues = invoice.validation?.issues || [];
  const vat = invoice.validation?.philippineVat;
  const completeness = invoice.philippineInvoiceCompleteness;
  const needsReview = invoice.reviewStatus === "NEEDS_REVIEW";
  const readOnly = !needsReview;

  useEffect(() => {
    if (vendors && vendors.length > 0) {
      setInternalVendors(vendors);
    } else {
      listCompanyVendors().then(setInternalVendors).catch(() => {});
    }
  }, [vendors]);

  const changedFields = useMemo(() => {
    if (!invoice.aiSnapshot) return [];
    return comparisonFields
      .map(({ path, label }) => ({ path, label, before: valueAt(invoice.aiSnapshot, path), after: valueAt(invoice, path) }))
      .filter(({ before, after }) => JSON.stringify(before ?? null) !== JSON.stringify(after ?? null));
  }, [invoice]);

  const focusField = (field: string) => {
    setExpandedField(field);
    onFocusField?.(field);
  };

  const handleVendorSelect = (selectedId: string) => {
    if (!onUpdateInvoice) return;
    if (!selectedId) {
      const updatedResolution: EntityResolutionResult = {
        ...(invoice.entityResolution || {
          entityType: "VENDOR",
          candidateId: invoice.id,
          proposedAction: "CREATE_NEW",
          confidence: "MEDIUM",
          confidenceScore: 70,
          matchReasons: ["Proposing new vendor candidate upon reviewer selection."],
          conflicts: [],
          proposedEnrichments: [],
          extractedEvidence: {},
          normalizedEvidence: {},
        }),
        proposedAction: "CREATE_NEW",
        matchedEntityId: undefined,
        matchedEntityName: invoice.vendor?.registeredName || invoice.vendor?.name || "New Vendor",
      };
      onUpdateInvoice({
        ...invoice,
        entityResolution: updatedResolution,
      });
      return;
    }

    const v = internalVendors.find((item) => item.id === selectedId);
    if (v) {
      const updatedResolution: EntityResolutionResult = {
        ...(invoice.entityResolution || {
          entityType: "VENDOR",
          candidateId: invoice.id,
          proposedAction: "LINK_EXISTING",
          confidence: "HIGH",
          confidenceScore: 100,
          matchReasons: ["Reviewer explicitly confirmed existing vendor record."],
          conflicts: [],
          proposedEnrichments: [],
          extractedEvidence: {},
          normalizedEvidence: {},
        }),
        proposedAction: "LINK_EXISTING",
        matchedEntityId: v.id,
        matchedEntityName: v.name,
        matchedEntityDetails: {
          taxId: v.taxId,
          email: v.email,
          phone: v.phone,
          address: v.address,
        },
      };
      const updatedVendor = {
        ...invoice.vendor,
        name: v.name,
        registeredName: (v as any).registeredName || v.name,
        taxId: v.taxId || invoice.vendor?.taxId,
        email: v.email || invoice.vendor?.email,
        phone: v.phone || invoice.vendor?.phone,
        address: v.address || invoice.vendor?.address,
      };
      onUpdateInvoice({
        ...invoice,
        vendor: updatedVendor,
        entityResolution: updatedResolution,
      });
    }
  };

  const entityResolution = invoice.entityResolution;
  const actionBadge = entityResolution
    ? getResolutionActionBadge(
        entityResolution.proposedAction,
        entityResolution.matchedEntityName || invoice.vendor?.name,
        entityResolution.conflicts,
      )
    : null;
  const ActionIcon = actionBadge?.icon || Building2;

  return (
    <div data-tour="review-fields" className={`rounded-2xl border p-4 shadow-sm ${needsReview ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"}`}>
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="flex gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${needsReview ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
            {needsReview ? <AlertTriangle className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold">{needsReview ? "Human verification required" : "Invoice verified"}</h3>
              {readOnly && <span className="text-[9px] font-black uppercase tracking-wide rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">Verified</span>}
            </div>
            <p className="text-[10px] text-slate-600 mt-0.5">
              {issues.length ? `${issues.length} validation flag${issues.length === 1 ? "" : "s"} found.` : "Line totals and financial summary reconcile with the extracted data."}
              {invoice.confidenceScore !== undefined ? ` • AI confidence ${Math.round(invoice.confidenceScore)}%` : ""}
              {readOnly ? ` • Verified ${formatDateTime(invoice.verifiedAt)}` : ""}
            </p>
            {invoice.sourceType === "EMAIL" && (
              <p className="text-[10px] text-indigo-700 mt-1 flex items-center gap-1 truncate">
                <Mail className="w-3 h-3 shrink-0" />
                {invoice.sourceMetadata?.subject || "Extracted from email"}
                {invoice.sourceMetadata?.sender ? ` • ${invoice.sourceMetadata.sender}` : ""}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
          {needsReview && invoice.aiSnapshot && onRevertToAI && (
            <button onClick={onRevertToAI} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold">
              <Undo2 className="w-3.5 h-3.5" /> Revert all to original
            </button>
          )}
          {needsReview && onVerify ? (
            <button onClick={onVerify} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold">
              <CheckCircle2 className="w-3.5 h-3.5" /> {verifyLabel}
            </button>
          ) : (
            readOnly && onReopen && (
              <button onClick={() => void onReopen()} className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-300 bg-white text-emerald-800 text-xs font-bold">
                <RotateCcw className="w-3.5 h-3.5" /> Reopen for Review
              </button>
            )
          )}
        </div>
      </div>

      {changedFields.length > 0 && (
        <div className="mt-4 rounded-xl border border-sky-200 bg-white/70 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[9px] uppercase font-black tracking-wide text-sky-800">Field-level comparison</p>
            <span className="text-[9px] font-bold text-sky-700">{changedFields.length} edited</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {changedFields.map(({ path, label }) => (
              <button key={path} type="button" onClick={() => focusField(path)} className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-bold text-sky-800 hover:bg-sky-100">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />Edited · {label}
              </button>
            ))}
          </div>
          {expandedField && changedFields.some((field) => field.path === expandedField) && (
            <div className="mt-3 rounded-lg border border-sky-100 bg-sky-50/70 p-3 text-[10px]">
              <div className="flex items-center justify-between gap-2">
                <p className="font-black">{changedFields.find((field) => field.path === expandedField)?.label}</p>
                <button type="button" onClick={() => setExpandedField(null)} className="text-sky-700">Close</button>
              </div>
              <div className="grid sm:grid-cols-2 gap-2 mt-2">
                <div>
                  <p className="uppercase text-[9px] font-black text-slate-400">Original AI</p>
                  <p className="mt-1 font-sans tabular-nums break-all text-slate-700">{displayValue(expandedField, valueAt(invoice.aiSnapshot, expandedField), invoice.currency)}</p>
                </div>
                <div>
                  <p className="uppercase text-[9px] font-black text-slate-400">Current</p>
                  <p className="mt-1 font-sans tabular-nums break-all text-slate-700">{displayValue(expandedField, valueAt(invoice, expandedField), invoice.currency)}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                {onRevertField && (
                  <button type="button" onClick={() => onRevertField(expandedField)} className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-white px-2 py-1 font-bold text-slate-700 hover:bg-slate-50">
                    <Undo2 className="w-3 h-3" />Revert to original
                  </button>
                )}
                <button type="button" onClick={() => onFocusField?.(expandedField)} className="font-bold text-sky-700">Review field</button>
              </div>
            </div>
          )}
        </div>
      )}

      {entityResolution && actionBadge && (
        <div className="mt-4 rounded-xl border border-indigo-200 bg-white/95 p-3.5 space-y-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
              <span className="text-xs font-black text-slate-800 uppercase tracking-wide">Vendor Resolution</span>
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${actionBadge.bg}`}>
              <ActionIcon className="w-3 h-3" />
              {actionBadge.label}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[10px]">
            <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
              <p className="text-[9px] font-bold uppercase text-slate-400">Resolved Vendor</p>
              <p className="mt-0.5 font-bold text-slate-800 truncate" title={entityResolution.matchedEntityName || invoice.vendor?.name || "Unresolved"}>
                {entityResolution.matchedEntityName || invoice.vendor?.name || "Unresolved"}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
              <p className="text-[9px] font-bold uppercase text-slate-400">Extracted / Matched TIN</p>
              <p className="mt-0.5 font-mono font-bold text-slate-800">
                {(entityResolution.matchedEntityDetails?.taxId as string) || entityResolution.normalizedEvidence?.taxId || invoice.vendor?.taxId || "None"}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
              <p className="text-[9px] font-bold uppercase text-slate-400">Email / Domain</p>
              <p className="mt-0.5 font-bold text-slate-800 truncate" title={(entityResolution.matchedEntityDetails?.email as string) || entityResolution.normalizedEvidence?.email || invoice.vendor?.email || "None"}>
                {(entityResolution.matchedEntityDetails?.email as string) || entityResolution.normalizedEvidence?.email || invoice.vendor?.email || "None"}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
              <p className="text-[9px] font-bold uppercase text-slate-400">Confidence</p>
              <p className="mt-0.5 font-bold text-slate-800">
                {entityResolution.confidence} ({entityResolution.confidenceScore}%)
              </p>
            </div>
          </div>

          {entityResolution.batchGroupId && (entityResolution.groupMemberCount ?? 0) > 1 && (
            <div className="flex items-center gap-2 rounded-lg bg-indigo-50/70 border border-indigo-100 px-3 py-2 text-[10px] text-indigo-900">
              <Users className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span>
                <strong>Batch Group:</strong> Candidate grouped with {(entityResolution.groupMemberCount || 0) - 1} other candidate(s) in this intake batch using consistent identity evidence.
              </span>
            </div>
          )}

          {entityResolution.conflicts && entityResolution.conflicts.length > 0 && (
            <div className="rounded-lg border border-rose-200 bg-rose-50/90 p-3 space-y-1 text-xs text-rose-950">
              <div className="flex items-center gap-1.5 font-black text-rose-900 uppercase tracking-wide text-[10px]">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span>Authoritative Identity Conflicts</span>
              </div>
              <ul className="space-y-1 pl-4 list-disc text-[10px] text-rose-900">
                {entityResolution.conflicts.map((conflict, idx) => (
                  <li key={idx}>
                    <span className="font-semibold">{conflict.label}: </span>
                    <span>{conflict.reason}</span>
                    {conflict.existingValue && conflict.candidateValue && (
                      <span className="ml-1 text-rose-700">
                        (Existing: <code className="bg-rose-100 px-1 py-0.5 rounded">{conflict.existingValue}</code> vs Extracted: <code className="bg-rose-100 px-1 py-0.5 rounded">{conflict.candidateValue}</code>)
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {entityResolution.proposedEnrichments && entityResolution.proposedEnrichments.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 space-y-1.5 text-xs text-blue-950">
              <div className="flex items-center gap-1.5 font-black text-blue-900 uppercase tracking-wide text-[10px]">
                <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span>Non-Conflicting Enrichments Proposed</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
                {entityResolution.proposedEnrichments.map((enrichment, idx) => (
                  <div key={idx} className="rounded-md bg-white border border-blue-100 p-2">
                    <span className="font-bold text-slate-700">{enrichment.label}: </span>
                    <span className="font-semibold text-blue-700">{enrichment.proposedValue}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {entityResolution.matchReasons && entityResolution.matchReasons.length > 0 && (
            <div className="text-[10px] text-slate-500 space-y-1">
              <p className="font-bold text-slate-600 uppercase text-[9px]">Match Evidence</p>
              <ul className="pl-4 list-disc space-y-0.5">
                {entityResolution.matchReasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {!readOnly && onUpdateInvoice && (
            <div className="pt-2 border-t border-slate-100 space-y-1.5">
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700">
                Confirm or Change Master Vendor Link
              </label>
              <select
                aria-label="Confirm or Change Master Vendor Link"
                value={entityResolution.matchedEntityId || ""}
                onChange={(e) => handleVendorSelect(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">
                  -- Propose New Vendor: {invoice.vendor?.registeredName || invoice.vendor?.name || entityResolution.matchedEntityName || "New Vendor"} --
                </option>
                {internalVendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} {v.taxId ? `(TIN: ${v.taxId})` : ""} {v.email ? `• ${v.email}` : ""}
                  </option>
                ))}
              </select>
              <p className="text-[9px] text-slate-400 italic">
                Extractions link to existing master vendors or propose new vendors. Master vendor creation is decoupled from invoice verification.
              </p>
            </div>
          )}
        </div>
      )}

      {(vat?.applicable || completeness?.status && completeness.status !== "NOT_APPLICABLE" || invoice.withholdingTaxAmount !== undefined) && (
        <div className="grid md:grid-cols-3 gap-2 mt-4">
          <div className="bg-white/70 rounded-xl p-3">
            <p className="text-[9px] uppercase font-black text-slate-500">PH VAT validation</p>
            <p className={`text-xs font-black mt-1 ${vat?.status === "PASS" ? "text-emerald-700" : vat?.status === "REVIEW" ? "text-amber-700" : "text-slate-500"}`}>
              {vat?.status === "PASS" ? "PASS" : vat?.status === "REVIEW" ? "NEEDS REVIEW" : "Not applicable"}
            </p>
            {vat?.expectedVat !== undefined && (
              <p className="text-[9px] text-slate-600 font-sans tabular-nums mt-1">
                Expected {invoice.currency ? formatMoney(vat.expectedVat, invoice.currency) : "Currency unclear"} • Difference {invoice.currency ? formatMoney(vat.difference || 0, invoice.currency) : "Currency unclear"}
              </p>
            )}
          </div>
          <div className="bg-white/70 rounded-xl p-3">
            <p className="text-[9px] uppercase font-black text-slate-500">PH Invoice Completeness</p>
            <p className="text-xs font-black mt-1">{completeness?.status?.replaceAll("_", " ") || "Not applicable"}</p>
            <p className="text-[9px] text-slate-600 mt-1">Review aid, not legal certification.</p>
          </div>
          <div className="bg-white/70 rounded-xl p-3">
            <p className="text-[9px] uppercase font-black text-slate-500">Withholding</p>
            <p className="text-xs font-black font-sans tabular-nums mt-1">
              {invoice.withholdingTaxAmount !== undefined ? (invoice.currency ? formatMoney(invoice.withholdingTaxAmount, invoice.currency) : "Currency unclear") : "Not stated"}
            </p>
            {invoice.netAmountPayable !== undefined && (
              <p className="text-[9px] text-slate-600 font-sans tabular-nums mt-1">
                Net payable {invoice.currency ? formatMoney(invoice.netAmountPayable, invoice.currency) : "Currency unclear"} • invoice total unchanged
              </p>
            )}
          </div>
        </div>
      )}

      {issues.length > 0 && (
        <div className="grid md:grid-cols-2 gap-2 mt-4">
          {issues.slice(0, 6).map((issue) => (
            <button key={issue.id} type="button" onClick={() => focusField(issue.field)} className="text-left bg-white/70 rounded-xl p-3 border border-amber-100 hover:border-amber-300 hover:bg-white transition">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold text-slate-800">{issue.field}</p>
                <span className="text-[9px] font-black text-amber-700">Review field →</span>
              </div>
              <p className="text-[10px] text-slate-600 mt-0.5">{issue.message}</p>
              {issue.expected !== undefined && (
                <p className="text-[9px] text-slate-500 font-sans tabular-nums mt-1">
                  Expected {String(issue.expected)} • extracted {String(issue.actual)}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
