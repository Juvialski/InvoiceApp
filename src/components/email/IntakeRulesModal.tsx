import React, { useState } from "react";
import {
  AlertCircle,
  Check,
  Edit3,
  FileSpreadsheet,
  FileText,
  Globe,
  Loader2,
  Mail,
  Plus,
  Receipt,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import type { EmailIntakeProfile, EmailIntakeProfileInput, Vendor } from "../../types.ts";
import type { FinancialAccount } from "../../lib/cashBanking.ts";
import { validateEmailIntakeProfile } from "../../lib/emailIntake.ts";
import { getBuiltInStatementParserProfiles } from "../../lib/statementParserProfiles.ts";

interface IntakeRulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  profiles: EmailIntakeProfile[];
  vendors?: Vendor[];
  financialAccounts?: FinancialAccount[];
  onSaveProfile: (input: EmailIntakeProfileInput) => Promise<void>;
  onDeleteProfile: (id: string) => Promise<void>;
  onToggleProfile: (id: string, enabled: boolean) => Promise<void>;
  initialForm?: Partial<EmailIntakeProfileInput> | null;
  canManageMailbox?: boolean;
}

export const IntakeRulesModal: React.FC<IntakeRulesModalProps> = ({
  isOpen,
  onClose,
  profiles,
  vendors = [],
  financialAccounts = [],
  onSaveProfile,
  onDeleteProfile,
  onToggleProfile,
  initialForm,
  canManageMailbox = true,
}) => {
  const [view, setView] = useState<"list" | "form">(initialForm ? "form" : "list");
  const [editingId, setEditingId] = useState<string | undefined>(initialForm?.id);
  const [name, setName] = useState(initialForm?.name || "");
  const [senderEmail, setSenderEmail] = useState(initialForm?.senderEmail || "");
  const [senderDomain, setSenderDomain] = useState(initialForm?.senderDomain || "");
  const [subjectContains, setSubjectContains] = useState(initialForm?.subjectContains || "");
  const [attachmentCondition, setAttachmentCondition] = useState(initialForm?.attachmentCondition || "");
  const [suggestedDestination, setSuggestedDestination] = useState<"INVOICE" | "BANK_STATEMENT" | "EXPENSE">(
    initialForm?.suggestedDestination || "INVOICE"
  );
  const [linkedVendorId, setLinkedVendorId] = useState<string>(initialForm?.linkedVendorId || "");
  const [linkedFinancialAccountId, setLinkedFinancialAccountId] = useState<string>(initialForm?.linkedFinancialAccountId || "");
  const [statementParserProfile, setStatementParserProfile] = useState<string>(initialForm?.statementParserProfile || "");
  const [expectedInstitution, setExpectedInstitution] = useState<string>(initialForm?.expectedInstitution || "");
  const [expectedCurrency, setExpectedCurrency] = useState<string>(initialForm?.expectedCurrency || "");
  const [defaultExpenseCategory, setDefaultExpenseCategory] = useState<string>(initialForm?.defaultExpenseCategory || "");
  const [enabled, setEnabled] = useState(initialForm?.enabled !== undefined ? initialForm.enabled : true);

  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);

  const builtInParserProfiles = React.useMemo(() => getBuiltInStatementParserProfiles(), []);

  React.useEffect(() => {
    if (initialForm) {
      setEditingId(initialForm.id);
      setName(initialForm.name || "");
      setSenderEmail(initialForm.senderEmail || "");
      setSenderDomain(initialForm.senderDomain || "");
      setSubjectContains(initialForm.subjectContains || "");
      setAttachmentCondition(initialForm.attachmentCondition || "");
      setSuggestedDestination(initialForm.suggestedDestination || "INVOICE");
      setLinkedVendorId(initialForm.linkedVendorId || "");
      setLinkedFinancialAccountId(initialForm.linkedFinancialAccountId || "");
      setStatementParserProfile(initialForm.statementParserProfile || "");
      setExpectedInstitution(initialForm.expectedInstitution || "");
      setExpectedCurrency(initialForm.expectedCurrency || "");
      setDefaultExpenseCategory(initialForm.defaultExpenseCategory || "");
      setEnabled(initialForm.enabled !== undefined ? initialForm.enabled : true);
      setView("form");
      setErrorMessages([]);
      setFeedback(null);
    }
  }, [initialForm]);

  if (!isOpen) return null;

  const resetForm = () => {
    setEditingId(undefined);
    setName("");
    setSenderEmail("");
    setSenderDomain("");
    setSubjectContains("");
    setAttachmentCondition("");
    setSuggestedDestination("INVOICE");
    setLinkedVendorId("");
    setLinkedFinancialAccountId("");
    setStatementParserProfile("");
    setExpectedInstitution("");
    setExpectedCurrency("");
    setDefaultExpenseCategory("");
    setEnabled(true);
    setErrorMessages([]);
    setFeedback(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setView("form");
  };

  const handleEditProfile = (profile: EmailIntakeProfile) => {
    setEditingId(profile.id);
    setName(profile.name);
    setSenderEmail(profile.senderEmail || "");
    setSenderDomain(profile.senderDomain || "");
    setSubjectContains(profile.subjectContains || "");
    setAttachmentCondition(profile.attachmentCondition || "");
    setSuggestedDestination(profile.suggestedDestination);
    setLinkedVendorId(profile.linkedVendorId || "");
    setLinkedFinancialAccountId(profile.linkedFinancialAccountId || "");
    setStatementParserProfile(profile.statementParserProfile || "");
    setExpectedInstitution(profile.expectedInstitution || "");
    setExpectedCurrency(profile.expectedCurrency || "");
    setDefaultExpenseCategory(profile.defaultExpenseCategory || "");
    setEnabled(profile.enabled);
    setErrorMessages([]);
    setFeedback(null);
    setView("form");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageMailbox) {
      setErrorMessages(["Mailbox management permission is required to save sender rules."]);
      return;
    }

    const payload: EmailIntakeProfileInput = {
      id: editingId,
      name: name.trim(),
      senderEmail: senderEmail.trim() || undefined,
      senderDomain: senderDomain.trim() || undefined,
      subjectContains: subjectContains.trim() || undefined,
      attachmentCondition: attachmentCondition.trim() || undefined,
      suggestedDestination,
      linkedVendorId: (suggestedDestination === "INVOICE" || suggestedDestination === "EXPENSE") ? (linkedVendorId || undefined) : undefined,
      linkedFinancialAccountId: suggestedDestination === "BANK_STATEMENT" ? (linkedFinancialAccountId || undefined) : undefined,
      statementParserProfile: suggestedDestination === "BANK_STATEMENT" ? (statementParserProfile || undefined) : undefined,
      expectedInstitution: suggestedDestination === "BANK_STATEMENT" ? (expectedInstitution || undefined) : undefined,
      expectedCurrency: suggestedDestination === "BANK_STATEMENT" ? (expectedCurrency || undefined) : undefined,
      enabled,
    };

    const validation = validateEmailIntakeProfile(payload);
    if (!validation.valid) {
      setErrorMessages(validation.errors);
      return;
    }

    setSaving(true);
    setErrorMessages([]);
    try {
      await onSaveProfile(payload);
      setFeedback(`Rule "${payload.name}" saved successfully.`);
      setTimeout(() => {
        resetForm();
        setView("list");
      }, 400);
    } catch (err: any) {
      setErrorMessages([err?.message || "Failed to save sender rule."]);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, ruleName: string) => {
    if (!canManageMailbox) return;
    if (!window.confirm(`Are you sure you want to delete rule "${ruleName}"? This action cannot be undone.`)) {
      return;
    }
    setDeletingId(id);
    try {
      await onDeleteProfile(id);
    } catch (err: any) {
      setErrorMessages([err?.message || "Failed to delete sender rule."]);
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggle = async (profile: EmailIntakeProfile) => {
    if (!canManageMailbox) return;
    setTogglingId(profile.id);
    try {
      await onToggleProfile(profile.id, !profile.enabled);
    } catch (err: any) {
      setErrorMessages([err?.message || "Failed to update rule status."]);
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="intake-rules-modal-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
    >
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h2 id="intake-rules-modal-title" className="text-base font-black text-slate-900">
                Email Intake Rules
              </h2>
              <p className="text-xs text-slate-500">
                Saved company sender and template profiles for deterministic routing
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

        {/* Tab / View switch */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setView("list");
                setErrorMessages([]);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                view === "list"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Saved Rules ({profiles.length})
            </button>
            {canManageMailbox && (
              <button
                type="button"
                onClick={handleOpenAdd}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition ${
                  view === "form" && !editingId
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-indigo-600 hover:bg-indigo-50"
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                Add New Rule
              </button>
            )}
          </div>
          {view === "form" && editingId && (
            <span className="text-xs font-semibold text-slate-500">Editing rule</span>
          )}
        </div>

        {/* Feedback / Errors */}
        {feedback && (
          <div className="mx-6 mt-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600" />
            {feedback}
          </div>
        )}

        {errorMessages.length > 0 && (
          <div className="mx-6 mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex flex-col gap-1">
            <div className="flex items-center gap-1.5 font-bold">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Please review the following:</span>
            </div>
            <ul className="list-disc list-inside text-[11px] pl-1 space-y-0.5">
              {errorMessages.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {view === "list" ? (
            profiles.length === 0 ? (
              <div className="text-center py-12 px-4 border-2 border-dashed border-slate-200 rounded-2xl">
                <Mail className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <h3 className="text-sm font-black text-slate-800">No saved sender rules yet</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
                  Create rules for recurring suppliers, bank statement senders, or receipt providers to automatically discover and classify incoming emails with zero AI calls.
                </p>
                {canManageMailbox && (
                  <button
                    type="button"
                    onClick={handleOpenAdd}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create First Rule
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {profiles.map((profile) => {
                  const isToggling = togglingId === profile.id;
                  const isDeleting = deletingId === profile.id;

                  const destBadgeClass =
                    profile.suggestedDestination === "BANK_STATEMENT"
                      ? "bg-sky-50 text-sky-700 border-sky-200"
                      : profile.suggestedDestination === "EXPENSE"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-emerald-50 text-emerald-700 border-emerald-200";

                  const destLabel =
                    profile.suggestedDestination === "BANK_STATEMENT"
                      ? "Bank Statement"
                      : profile.suggestedDestination === "EXPENSE"
                        ? "Expense Receipt"
                        : "Invoice";

                  return (
                    <div
                      key={profile.id}
                      className={`p-4 rounded-2xl border transition ${
                        profile.enabled
                          ? "border-slate-200 bg-white hover:border-slate-300"
                          : "border-slate-200 bg-slate-50/70 opacity-75"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-xs font-black text-slate-900 truncate">
                              {profile.name}
                            </h4>
                            <span
                              className={`text-[9px] px-2 py-0.5 rounded-full font-black uppercase border ${destBadgeClass}`}
                            >
                              {destLabel}
                            </span>
                            {!profile.enabled && (
                              <span className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-slate-200 text-slate-600">
                                Disabled
                              </span>
                            )}
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                            {profile.senderEmail && (
                              <div className="inline-flex items-center gap-1 text-[11px]">
                                <Mail className="w-3 h-3 text-slate-400" />
                                <span>{profile.senderEmail}</span>
                              </div>
                            )}
                            {profile.senderDomain && (
                              <div className="inline-flex items-center gap-1 text-[11px]">
                                <Globe className="w-3 h-3 text-slate-400" />
                                <span>@{profile.senderDomain}</span>
                              </div>
                            )}
                            {profile.subjectContains && (
                              <div className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                                <span>Subject contains:</span>
                                <span className="font-semibold text-slate-700">
                                  &quot;{profile.subjectContains}&quot;
                                </span>
                              </div>
                            )}
                            {profile.attachmentCondition && (
                              <div className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                                <span>Attachment:</span>
                                <span className="font-semibold text-slate-700">
                                  {profile.attachmentCondition}
                                </span>
                              </div>
                            )}
                            {profile.linkedVendorId && (
                              <div className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                                <span>Linked Vendor:</span>
                                <span className="font-semibold">
                                  {vendors.find((v) => v.id === profile.linkedVendorId)?.name || profile.linkedVendorId}
                                </span>
                              </div>
                            )}
                            {profile.linkedFinancialAccountId && (
                              <div className="inline-flex items-center gap-1 text-[11px] text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200/60">
                                <span>Linked Account:</span>
                                <span className="font-semibold">
                                  {financialAccounts.find((a) => a.id === profile.linkedFinancialAccountId)?.displayName || profile.linkedFinancialAccountId}
                                </span>
                              </div>
                            )}
                            {profile.defaultExpenseCategory && (
                              <div className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                                <span>Default Category:</span>
                                <span className="font-semibold">{profile.defaultExpenseCategory}</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        {canManageMailbox && (
                          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                            <button
                              type="button"
                              onClick={() => handleToggle(profile)}
                              disabled={isToggling}
                              className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition ${
                                profile.enabled
                                  ? "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                              }`}
                            >
                              {isToggling ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : profile.enabled ? (
                                "Disable"
                              ) : (
                                "Enable"
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => handleEditProfile(profile)}
                              className="p-1.5 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition"
                              title="Edit rule"
                              aria-label={`Edit rule ${profile.name}`}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDelete(profile.id, profile.name)}
                              disabled={isDeleting}
                              className="p-1.5 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50 transition"
                              title="Delete rule"
                              aria-label={`Delete rule ${profile.name}`}
                            >
                              {isDeleting ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            /* Form View */
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-800 uppercase mb-1">
                  Rule Name / Label <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Steel Billing, Monthly BDO Statement, Grab Receipts"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-800 uppercase mb-1">
                    Sender Email
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. billing@supplier.example"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Exact sender address (strongest signal)
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-800 uppercase mb-1">
                    Sender Domain
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. supplier.example (no @ or *)"
                    value={senderDomain}
                    onChange={(e) => setSenderDomain(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Organization domain (generic webmails like @gmail.com are not permitted)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-800 uppercase mb-1">
                    Subject Contains (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Statement of Account, Monthly Bill"
                    value={subjectContains}
                    onChange={(e) => setSubjectContains(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-800 uppercase mb-1">
                    Attachment Condition (Optional)
                  </label>
                  <select
                    value={attachmentCondition}
                    onChange={(e) => setAttachmentCondition(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 bg-white focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">Any supported attachment</option>
                    <option value="SPREADSHEET">Spreadsheet (CSV / XLSX / XLS)</option>
                    <option value="PDF">PDF document</option>
                    <option value="IMAGE">Image / Receipt photo</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-800 uppercase mb-2">
                  Suggested Destination <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setSuggestedDestination("INVOICE")}
                    className={`p-3 rounded-2xl border text-left flex flex-col gap-1 transition ${
                      suggestedDestination === "INVOICE"
                        ? "border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs font-black text-slate-900">Invoice</span>
                    </div>
                    <p className="text-[10px] text-slate-500">Bills and sales invoices</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSuggestedDestination("BANK_STATEMENT")}
                    className={`p-3 rounded-2xl border text-left flex flex-col gap-1 transition ${
                      suggestedDestination === "BANK_STATEMENT"
                        ? "border-sky-500 bg-sky-50/50 ring-2 ring-sky-500/20"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <FileSpreadsheet className="w-4 h-4 text-sky-600" />
                      <span className="text-xs font-black text-slate-900">Statement</span>
                    </div>
                    <p className="text-[10px] text-slate-500">Bank / account records</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSuggestedDestination("EXPENSE")}
                    className={`p-3 rounded-2xl border text-left flex flex-col gap-1 transition ${
                      suggestedDestination === "EXPENSE"
                        ? "border-amber-500 bg-amber-50/50 ring-2 ring-amber-500/20"
                        : "border-slate-200 hover:border-slate-300 bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Receipt className="w-4 h-4 text-amber-600" />
                      <span className="text-xs font-black text-slate-900">Expense</span>
                    </div>
                    <p className="text-[10px] text-slate-500">Receipts and claims</p>
                  </button>
                </div>
              </div>

              {/* Linked Entity Options */}
              {(suggestedDestination === "INVOICE" || suggestedDestination === "EXPENSE") && (
                <div>
                  <label className="block text-xs font-black text-slate-800 uppercase mb-1">
                    Link to Existing Vendor (Optional)
                  </label>
                  <select
                    value={linkedVendorId}
                    onChange={(e) => setLinkedVendorId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 bg-white focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">No vendor link (resolve dynamically)</option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name} {v.taxId ? `(TIN: ${v.taxId})` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Advisory hint for entity resolution. Contradictory document tax IDs will still require human review.
                  </p>
                </div>
              )}

              {suggestedDestination === "BANK_STATEMENT" && (
                <div className="space-y-4 rounded-xl border border-sky-100 bg-sky-50/40 p-3.5">
                  <div>
                    <label className="block text-xs font-black text-slate-800 uppercase mb-1">
                      Link to Existing Financial Account (Optional)
                    </label>
                    <select
                      value={linkedFinancialAccountId}
                      onChange={(e) => setLinkedFinancialAccountId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 bg-white focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="">No account link (match by statement data)</option>
                      {financialAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.displayName} ({a.institutionName} •••• {a.maskedIdentifier?.replace(/\D/g, "").slice(-4) || "N/A"} - {a.currency})
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Advisory hint for bank statement routing. Contradictory currencies or account suffixes will require review.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-black text-slate-800 uppercase mb-1">
                        Statement Parser Profile (Optional)
                      </label>
                      <select
                        value={statementParserProfile}
                        onChange={(e) => setStatementParserProfile(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 bg-white focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">Auto-detect / Standard structure detection</option>
                        {builtInParserProfiles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-400 mt-1">
                        Advisory parser format. Validated against actual sheet headers before use.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-black text-slate-800 uppercase mb-1">
                        Expected Institution / Bank (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. BDO, BPI, Metrobank"
                        value={expectedInstitution}
                        onChange={(e) => setExpectedInstitution(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 bg-white placeholder:text-slate-400 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                      />
                      <p className="text-[10px] text-slate-400 mt-1">
                        Institution identity hint for account resolution.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-800 uppercase mb-1">
                      Expected Currency (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. PHP, USD (leave empty if not reliably fixed)"
                      value={expectedCurrency}
                      onChange={(e) => setExpectedCurrency(e.target.value)}
                      maxLength={3}
                      className="w-full sm:w-1/2 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 bg-white uppercase placeholder:text-slate-400 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Never assumed. Missing statement currency remains unknown unless specified here.
                    </p>
                  </div>
                </div>
              )}

              {suggestedDestination === "EXPENSE" && (
                <div>
                  <label className="block text-xs font-black text-slate-800 uppercase mb-1">
                    Default Expense Category (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Travel & Transportation, Office Supplies, Meals"
                    value={defaultExpenseCategory}
                    onChange={(e) => setDefaultExpenseCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Initial category suggestion for recurring expense receipts
                  </p>
                </div>
              )}

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="rule-enabled-checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="rule-enabled-checkbox" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Enable this rule for mailbox candidate search and classification
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setView("list");
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm inline-flex items-center gap-2 disabled:opacity-60 transition"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {editingId ? "Update Rule" : "Save Rule"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};