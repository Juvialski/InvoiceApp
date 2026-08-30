import React from "react";
import { ArrowRight, Check, CircleAlert, FileCheck2, X } from "lucide-react";
import { confirmationLabel, requiresAssistantConfirmation } from "./confirmationPolicy.ts";
import type { AssistantClientAction, AssistantPreparedAction } from "./assistantTypes.ts";

function riskLabel(riskTier: AssistantPreparedAction["riskTier"]) {
  if (riskTier === "FINANCIAL_FINALIZATION") return "Financial finalization";
  if (riskTier === "BULK_MUTATION") return "Bulk change";
  if (riskTier === "NORMAL_MUTATION") return "Workspace change";
  if (riskTier === "PREPARE") return "Prepared action";
  if (riskTier === "NAVIGATION") return "Navigation";
  return "Read-only";
}

function valueLabel(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? "identified record" : String(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (depth > 1) return "…";
  if (Array.isArray(value)) return value.slice(0, 8).map((item) => valueLabel(item, depth + 1)).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .slice(0, 8)
      .map(([key, item]) => `${key}: ${valueLabel(item, depth + 1)}`)
      .join(" • ");
  }
  return "—";
}

function previewLabel(key: string) {
  const labels: Record<string, string> = {
    operation: "Action",
    firstName: "First name",
    middleName: "Middle name",
    lastName: "Last name",
    displayName: "Name",
    employeeCode: "Employee code",
    employmentType: "Employment type",
    employmentStatus: "Status",
    defaultPayType: "Pay basis",
    defaultRate: "Rate",
    dailyRate: "Daily rate",
    currency: "Currency",
    writeStatus: "Write status",
  };
  return labels[key] || key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (value) => value.toUpperCase());
}

const HIDDEN_PREVIEW_KEYS = new Set(["contextGeneration", "expiresAt", "entityId", "projectId", "workerId", "accountId", "transactionId", "snapshotId", "assignmentId", "profileId", "componentId", "entryId", "documentId", "revisionId", "revisionIds", "rfiId", "submittalId", "roundId", "responseId", "reviewId", "siteLogId", "membershipId", "invitationId", "assignedUserId", "leftTransactionId", "rightTransactionId", "transferGroupId", "expectedUpdatedAt", "preflight", "currentRecord"]);

function preparedActionLabel(toolName: string) {
  const labels: Record<string, string> = {
    prepare_project_lifecycle: "Project lifecycle",
    prepare_financial_correction: "Financial correction",
    prepare_worker_update: "Worker update",
    prepare_worker_lifecycle: "Worker lifecycle",
    prepare_assignment_lifecycle: "Project assignment lifecycle",
    prepare_compensation_profile_lifecycle: "Compensation profile lifecycle",
    prepare_recurring_component_lifecycle: "Recurring payroll component lifecycle",
    prepare_workforce_source_lifecycle: "Workforce source correction",
    prepare_engineering_document_lifecycle: "Engineering document lifecycle",
    prepare_rfi_lifecycle: "RFI lifecycle",
    prepare_submittal_lifecycle: "Technical submittal lifecycle",
    prepare_site_log_lifecycle: "Daily Site Log lifecycle",
    prepare_site_log_addendum: "Daily Site Log correction",
    prepare_reopen_invoice_review: "Reopen invoice review",
    prepare_save_project_assignment: "Save project assignment",
    prepare_update_project: "Update project",
    prepare_update_attendance: "Correct attendance",
    prepare_save_compensation_profile: "Save compensation profile",
    prepare_save_recurring_component: "Save recurring payroll component",
    prepare_save_work_entry: "Save work entry",
    prepare_financial_account: "Save financial account",
    prepare_financial_account_lifecycle: "Financial account lifecycle",
    prepare_financial_snapshot: "Record manual balance",
    create_payroll_run: "Create draft payroll run",
    prepare_financial_transaction: "Create financial transaction",
    prepare_financial_transaction_correction: "Correct financial transaction",
    prepare_financial_transaction_lifecycle: "Financial transaction lifecycle",
    prepare_import_cash_statement: "Import cash statement",
    prepare_internal_transfer: "Confirm internal transfer",
    prepare_internal_transfer_reversal: "Reverse internal transfer",
    prepare_update_company_profile: "Update company profile",
    prepare_authorize_company_member: "Authorize company access",
    prepare_update_company_member: "Update company member",
    prepare_update_member_permissions: "Update member permissions",
    prepare_revoke_company_invitation: "Revoke pending access",
  };
  if (labels[toolName]) return labels[toolName];
  return toolName.replace(/^prepare_/, "").replace(/[._:-]+/g, " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

function clientActionLabel(action: AssistantClientAction) {
  if (action.label) return action.label;
  if (action.type === "OPEN_INVOICE") return "Open invoice";
  if (action.type === "OPEN_REVIEW_INVOICE") return "Review invoice";
  if (action.type === "OPEN_PROJECT") return "Open project";
  if (action.type === "OPEN_PROJECT_DOCUMENTS") return "Open project documents";
  if (action.type === "OPEN_ENGINEERING_DOCUMENT") return "Open engineering document";
  if (action.type === "OPEN_SITE_LOG") return "Open Site Log";
  if (action.type === "OPEN_PAYROLL_PERIOD") return "Open payroll";
  if (action.type === "OPEN_PAYROLL_RUN") return "Open payroll run";
  if (action.type === "OPEN_FINANCIAL_TRANSACTION") return "Open transaction";
  if (action.type === "OPEN_ATTENDANCE_DATE") return "Open attendance";
  if (action.type === "START_TOUR") return "Start guided tour";
  return "Open workspace";
}

export interface AssistantActionCardProps {
  preparedAction?: AssistantPreparedAction;
  clientAction?: AssistantClientAction;
  busy?: boolean;
  onConfirm?: (action: AssistantPreparedAction) => void;
  onCancel?: (action: AssistantPreparedAction) => void;
  onClientAction?: (action: AssistantClientAction) => void;
}

export const AssistantActionCard: React.FC<AssistantActionCardProps> = ({ preparedAction, clientAction, busy = false, onConfirm, onCancel, onClientAction }) => {
  if (preparedAction) {
    const actionable = preparedAction.status === "PREPARED" && requiresAssistantConfirmation(preparedAction.riskTier);
    return (
      <section data-tour="assistant-action-card" className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 rounded-lg bg-amber-100 p-1.5 text-amber-700"><FileCheck2 aria-hidden="true" className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-black text-amber-950">{confirmationLabel(preparedAction.riskTier)}</p>
              <span className="rounded-full border border-amber-200 bg-white/70 px-2 py-0.5 text-xs font-black uppercase tracking-wide text-amber-800">{riskLabel(preparedAction.riskTier)}</span>
            </div>
            <p className="mt-1 text-xs leading-5 text-amber-900">{preparedActionLabel(preparedAction.toolName)}</p>
            {Object.keys(preparedAction.preview).some((key) => !HIDDEN_PREVIEW_KEYS.has(key)) && (
              <dl className="mt-2 space-y-1.5 rounded-xl border border-amber-200/80 bg-white/60 p-2.5 text-xs leading-5 text-slate-700">
                {Object.entries(preparedAction.preview).filter(([key]) => !HIDDEN_PREVIEW_KEYS.has(key)).slice(0, 8).map(([key, value]) => <div key={key} className="flex gap-2"><dt className="min-w-0 flex-1 truncate font-bold text-slate-500">{previewLabel(key)}</dt><dd className="max-w-[65%] truncate text-right font-semibold">{valueLabel(value)}</dd></div>)}
              </dl>
            )}
            {preparedAction.status !== "PREPARED" && <p className="mt-2 text-xs font-bold text-slate-600">Status: {preparedAction.status.toLowerCase()}</p>}
            {actionable && <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => onConfirm?.(preparedAction)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-700 px-3 py-2 text-xs font-black text-white shadow-sm transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"><Check aria-hidden="true" className="h-3.5 w-3.5" /> Confirm</button>
              <button type="button" onClick={() => onCancel?.(preparedAction)} disabled={busy} className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"><X aria-hidden="true" className="h-3.5 w-3.5" /> Cancel</button>
            </div>}
          </div>
        </div>
      </section>
    );
  }

  if (!clientAction) return null;
  return (
    <button type="button" data-tour="assistant-action-card" onClick={() => onClientAction?.(clientAction)} disabled={busy} className="group inline-flex max-w-full items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-left text-xs font-black text-indigo-800 transition hover:border-indigo-300 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50">
      <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-indigo-600 transition group-hover:translate-x-0.5" />
      <span className="truncate">{clientActionLabel(clientAction)}</span>
    </button>
  );
};

export const AssistantPreparedActionCard = AssistantActionCard;

export function AssistantActionWarning({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 flex items-start gap-1.5 text-[10px] leading-4 text-amber-800"><CircleAlert aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />{children}</p>;
}
