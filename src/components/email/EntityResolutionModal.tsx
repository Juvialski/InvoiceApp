import React, { useState } from "react";
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  HelpCircle,
  Info,
  Link2,
  PlusCircle,
  Receipt,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import type {
  EntityResolutionEnrichmentField,
  EntityResolutionResult,
  GmailMessageCandidate,
  Vendor,
} from "../../types.ts";
import type { FinancialAccount } from "../../lib/cashBanking.ts";

interface EntityResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: GmailMessageCandidate;
  resolution: EntityResolutionResult;
  allCandidates: GmailMessageCandidate[];
  allResolutions: Record<string, EntityResolutionResult>;
  vendors: Vendor[];
  financialAccounts: FinancialAccount[];
  onConfirmResolution?: (candidateId: string, updatedResolution: EntityResolutionResult) => void;
}

export const EntityResolutionModal: React.FC<EntityResolutionModalProps> = ({
  isOpen,
  onClose,
  candidate,
  resolution,
  allCandidates,
  allResolutions,
  vendors,
  financialAccounts,
  onConfirmResolution,
}) => {
  const [selectedEntityId, setSelectedEntityId] = useState<string>(resolution.matchedEntityId || "");
  const [selectedAction, setSelectedAction] = useState(resolution.proposedAction);
  const [acceptedEnrichments, setAcceptedEnrichments] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const e of resolution.proposedEnrichments) {
      map[e.field] = true;
    }
    return map;
  });

  if (!isOpen) return null;

  const isVendor = resolution.entityType === "VENDOR";
  const matchedVendor = isVendor && selectedEntityId ? vendors.find((v) => v.id === selectedEntityId) : null;
  const matchedAccount = !isVendor && selectedEntityId ? financialAccounts.find((a) => a.id === selectedEntityId) : null;

  const groupMembers = resolution.batchGroupId
    ? allCandidates.filter((c) => allResolutions[c.id]?.batchGroupId === resolution.batchGroupId)
    : [];

  const handleToggleEnrichment = (field: string) => {
    setAcceptedEnrichments((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleApply = () => {
    const updated: EntityResolutionResult = {
      ...resolution,
      proposedAction: selectedAction,
      matchedEntityId: selectedEntityId || undefined,
      matchedEntityName: isVendor
        ? matchedVendor?.name || resolution.matchedEntityName
        : matchedAccount?.displayName || resolution.matchedEntityName,
      proposedEnrichments: resolution.proposedEnrichments.filter((e) => acceptedEnrichments[e.field]),
    };
    if (onConfirmResolution) {
      onConfirmResolution(candidate.id, updated);
    }
    onClose();
  };

  const actionBadge = (action: string) => {
    switch (action) {
      case "LINK_EXISTING":
        return { label: "Likely Existing Record", bg: "bg-emerald-50 text-emerald-700 border-emerald-200" };
      case "ENRICH_EXISTING":
        return { label: "Possible Enrichment", bg: "bg-blue-50 text-blue-700 border-blue-200" };
      case "CREATE_NEW":
        return { label: "No Sender-Level Match", bg: "bg-purple-50 text-purple-700 border-purple-200" };
      case "POSSIBLE_DUPLICATE":
        return { label: "Possible Duplicate", bg: "bg-amber-50 text-amber-700 border-amber-200" };
      case "NEEDS_REVIEW":
      default:
        return { label: "Needs Human Review", bg: "bg-rose-50 text-rose-700 border-rose-200" };
    }
  };

  const badge = actionBadge(selectedAction);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="entity-resolution-modal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                isVendor ? "bg-indigo-50 text-indigo-600" : "bg-sky-50 text-sky-600"
              }`}
            >
              {isVendor ? <Building2 className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="entity-resolution-modal-title" className="text-base font-black text-slate-900">
                  {isVendor ? "Preliminary Vendor / Supplier Hint" : "Preliminary Financial Account Hint"}
                </h2>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase border ${badge.bg}`}>
                  {badge.label}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Sender-level advisory matching for &quot;{candidate.subject || candidate.sender || "Candidate"}&quot;. Final resolution is recalculated from extracted or parsed document evidence.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 text-slate-800">
          {resolution.conflicts.length > 0 && (
            <div className="p-4 rounded-2xl bg-rose-50/80 border border-rose-200 text-rose-950 space-y-2">
              <div className="flex items-center gap-2 text-xs font-black text-rose-800 uppercase tracking-wide">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>Sender-Level Identity Conflicts Detected</span>
              </div>
              <ul className="space-y-1.5 text-xs">
                {resolution.conflicts.map((conflict, idx) => (
                  <li key={idx} className="flex flex-col gap-0.5 pl-6">
                    <span className="font-semibold text-rose-900">• {conflict.label}: {conflict.reason}</span>
                    {conflict.existingValue && conflict.candidateValue && (
                      <span className="text-[11px] text-rose-700">
                        Existing: <code className="bg-rose-100 px-1 py-0.5 rounded text-rose-900">{conflict.existingValue}</code> vs Candidate: <code className="bg-rose-100 px-1 py-0.5 rounded text-rose-900">{conflict.candidateValue}</code>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-rose-700 italic pl-6">
                This mailbox hint cannot override later extracted or parsed identity evidence.
              </p>
            </div>
          )}

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
              <Info className="w-4 h-4 text-slate-500" />
              <span>Preliminary Evidence & Reasons</span>
            </h3>
            <ul className="space-y-1 text-xs text-slate-600 pl-5 list-disc">
              {resolution.matchReasons.map((reason, idx) => (
                <li key={idx}><span>{reason}</span></li>
              ))}
            </ul>
            <div className="mt-2 flex items-center gap-3 pt-2 border-t border-slate-200/60 text-[11px] text-slate-500">
              <span>
                Confidence: <strong className="text-slate-800 uppercase">{resolution.confidence}</strong> ({resolution.confidenceScore}%)
              </span>
              {resolution.batchGroupId && (
                <span>
                  Group: <code className="text-indigo-600 bg-indigo-50 px-1 rounded">{resolution.batchGroupId}</code>
                </span>
              )}
            </div>
          </div>

          {groupMembers.length > 1 && (
            <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-2">
              <div className="flex items-center gap-2 text-xs font-black text-indigo-900 uppercase">
                <Users className="w-4 h-4 text-indigo-600" />
                <span>Same-Batch Sender Hint Group ({groupMembers.length} emails)</span>
              </div>
              <p className="text-xs text-indigo-800 leading-relaxed">
                These mailbox candidates share compatible sender-level evidence. This grouping is advisory and will be recalculated from actual document identity after extraction or parsing.
              </p>
              <div className="divide-y divide-indigo-100/80 rounded-xl bg-white border border-indigo-100 overflow-hidden">
                {groupMembers.map((m) => (
                  <div key={m.id} className="p-2.5 flex items-center justify-between text-xs">
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="font-semibold text-slate-800 truncate">{m.subject || "No Subject"}</p>
                      <p className="text-[11px] text-slate-500 truncate">{m.sender}</p>
                    </div>
                    {m.id === candidate.id && (
                      <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-indigo-100 text-indigo-700">Current</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {resolution.proposedEnrichments.length > 0 && (
            <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-200 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-black text-blue-900 uppercase">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span>Potential Enrichment Hints</span>
              </div>
              <p className="text-xs text-blue-800">
                These are preliminary sender-level suggestions only. Selecting them here does not change master data and does not bypass final destination review.
              </p>
              <div className="space-y-2">
                {resolution.proposedEnrichments.map((enrichment) => (
                  <label
                    key={enrichment.field}
                    className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white border border-blue-100 cursor-pointer hover:bg-blue-50/30 transition text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(acceptedEnrichments[enrichment.field])}
                      onChange={() => handleToggleEnrichment(enrichment.field)}
                      className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="font-bold text-slate-800">{enrichment.label}: </span>
                      <span className="font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">{enrichment.proposedValue}</span>
                      {enrichment.currentValue && (
                        <p className="text-[10px] text-slate-400 mt-0.5">Current value: {enrichment.currentValue}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <label className="block text-xs font-black text-slate-800 uppercase">
              Preliminary {isVendor ? "Vendor" : "Financial Account"} Hint
            </label>
            {isVendor ? (
              <select
                value={selectedEntityId}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedEntityId(val);
                  setSelectedAction(val ? "LINK_EXISTING" : "CREATE_NEW");
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 bg-white focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">-- No existing Vendor hint: {resolution.matchedEntityName || "New Vendor"} --</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} {v.taxId ? `(TIN: ${v.taxId})` : ""} {v.email ? `• ${v.email}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={selectedEntityId}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedEntityId(val);
                  setSelectedAction(val ? "LINK_EXISTING" : "CREATE_NEW");
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 bg-white focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">-- No existing Account hint: {resolution.matchedEntityName || "New Account"} --</option>
                {financialAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.displayName} ({a.institutionName} •••• {a.maskedIdentifier?.slice(-4) || "N/A"} - {a.currency})
                  </option>
                ))}
              </select>
            )}
            <p className="text-[10px] text-slate-400">
              This only adjusts the mailbox hint shown for this candidate. The actual Vendor or FinancialAccount decision is recalculated from extracted or parsed document evidence in the destination review.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
          <p className="text-[11px] text-slate-500">
            Preliminary hint only. No master data or destination record is changed here.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs inline-flex items-center gap-2 transition"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Preliminary Hint</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
