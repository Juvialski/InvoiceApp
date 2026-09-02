import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Calculator, X } from "lucide-react";
import { Button } from "@astryxdesign/core/Button";
import type { ProjectCostCode } from "../../types.ts";
import { validateProjectCostCodeInput } from "../../lib/projectCostCodes.ts";
import { useDialogFocus } from "../ui/useDialogFocus.ts";

export interface ProjectCostCodeModalProps {
  open: boolean;
  projectId: string;
  projectBudget: number;
  currency: string;
  costCode?: ProjectCostCode | null;
  existingCodes: readonly ProjectCostCode[];
  loading?: boolean;
  onSave: (costCode: {
    id?: string;
    projectId: string;
    code: string;
    name: string;
    description?: string;
    approvedBudgetAmount: number;
    forecastAmount?: number;
    status: ProjectCostCode["status"];
  }) => Promise<void> | void;
  onClose: () => void;
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0);
  } catch {
    return `${currency} ${(value || 0).toFixed(2)}`;
  }
}

export const ProjectCostCodeModal: React.FC<ProjectCostCodeModalProps> = ({
  open,
  projectId,
  projectBudget,
  currency,
  costCode,
  existingCodes,
  loading = false,
  onSave,
  onClose,
}) => {
  const isEditing = Boolean(costCode);
  const [code, setCode] = useState(costCode?.code || "");
  const [name, setName] = useState(costCode?.name || "");
  const [description, setDescription] = useState(costCode?.description || "");
  const [approvedBudgetAmount, setApprovedBudgetAmount] = useState<string>(
    costCode?.approvedBudgetAmount != null ? String(costCode.approvedBudgetAmount) : "",
  );
  const [forecastAmount, setForecastAmount] = useState<string>(
    costCode?.forecastAmount != null ? String(costCode.forecastAmount) : "",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const codeInputRef = useRef<HTMLInputElement>(null);

  const dialogRef = useDialogFocus({
    open,
    onClose: () => {
      if (!loading) onClose();
    },
    initialFocusRef: codeInputRef,
  });

  useEffect(() => {
    if (open) {
      setCode(costCode?.code || "");
      setName(costCode?.name || "");
      setDescription(costCode?.description || "");
      setApprovedBudgetAmount(costCode?.approvedBudgetAmount != null ? String(costCode.approvedBudgetAmount) : "");
      setForecastAmount(costCode?.forecastAmount != null ? String(costCode.forecastAmount) : "");
      setErrorMessage(null);
      setSubmitted(false);
    }
  }, [open, costCode]);

  if (!open) return null;

  const parsedBudget = approvedBudgetAmount.trim() === "" ? 0 : Number(approvedBudgetAmount);
  const parsedForecast = forecastAmount.trim() === "" ? undefined : Number(forecastAmount);

  const validation = validateProjectCostCodeInput(
    {
      id: costCode?.id,
      projectId,
      code,
      name,
      approvedBudgetAmount: Number.isFinite(parsedBudget) ? parsedBudget : 0,
      forecastAmount: parsedForecast !== undefined && Number.isFinite(parsedForecast) ? parsedForecast : undefined,
      status: costCode?.status || "ACTIVE",
    },
    existingCodes,
    projectBudget,
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);

    if (!validation.valid) {
      setErrorMessage(validation.message || "Please fix validation errors before saving.");
      return;
    }

    setErrorMessage(null);
    try {
      await onSave({
        id: costCode?.id,
        projectId,
        code: code.trim().toUpperCase(),
        name: name.trim(),
        description: description.trim() || undefined,
        approvedBudgetAmount: Math.max(0, parsedBudget || 0),
        forecastAmount: parsedForecast !== undefined && Number.isFinite(parsedForecast) ? Math.max(0, parsedForecast) : undefined,
        status: costCode?.status || "ACTIVE",
      });
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to save cost code.");
    }
  };

  const otherActiveAllocated = existingCodes
    .filter((c) => c.projectId === projectId && c.id !== costCode?.id && c.status === "ACTIVE")
    .reduce((sum, c) => sum + (Number(c.approvedBudgetAmount) || 0), 0);
  const remainingProjectBudget = Math.max(0, projectBudget - otherActiveAllocated);

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cost-code-modal-title"
      aria-busy={loading}
    >
      <section className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
              <Calculator className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="cost-code-modal-title" className="text-base font-black text-slate-950">
                {isEditing ? "Edit Cost Code" : "Add Cost Code"}
              </h2>
              <p className="text-xs text-slate-500">
                {isEditing
                  ? `Update work package code and budget ceiling for ${costCode?.code}.`
                  : "Create a work package cost code to structure and control project budget."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Close cost code modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {errorMessage && (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-slate-600">Total Project Budget:</span>
              <span className="font-black tabular-nums text-slate-900">{money(projectBudget, currency)}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <span>Unallocated Available:</span>
              <span className="font-bold tabular-nums text-indigo-700">{money(remainingProjectBudget, currency)}</span>
            </div>
          </div>

          <div>
            <label htmlFor="cost-code-input" className="block text-xs font-bold text-slate-800">
              Cost Code <span className="text-rose-600">*</span>
            </label>
            <p className="mt-0.5 text-[10px] text-slate-500">
              Unique uppercase identifier (max 50 chars), e.g. <code className="rounded bg-slate-100 px-1 font-mono">CIVIL</code>, <code className="rounded bg-slate-100 px-1 font-mono">MECH-01</code>.
            </p>
            <input
              ref={codeInputRef}
              id="cost-code-input"
              type="text"
              required
              maxLength={50}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. CIVIL, MECH-01, ELEC"
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs font-bold text-slate-900 outline-none uppercase placeholder:font-sans placeholder:font-normal placeholder:text-slate-400 placeholder:normal-case focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="cost-code-name-input" className="block text-xs font-bold text-slate-800">
              Name / Work Package <span className="text-rose-600">*</span>
            </label>
            <p className="mt-0.5 text-[10px] text-slate-500">
              Descriptive name for this cost package (max 200 chars).
            </p>
            <input
              id="cost-code-name-input"
              type="text"
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Civil Works & Earthmoving"
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label htmlFor="cost-code-desc-input" className="block text-xs font-bold text-slate-800">
              Description <span className="text-[10px] font-normal text-slate-400">(Optional)</span>
            </label>
            <textarea
              id="cost-code-desc-input"
              rows={2}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Scope, inclusions, or operational notes for this work package..."
              className="mt-1.5 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="cost-code-budget-input" className="block text-xs font-bold text-slate-800">
                Approved Budget ({currency}) <span className="text-rose-600">*</span>
              </label>
              <p className="mt-0.5 text-[10px] text-slate-500">Approved budget ceiling (&gt;= 0).</p>
              <input
                id="cost-code-budget-input"
                type="number"
                min={0}
                step={0.01}
                required
                value={approvedBudgetAmount}
                onChange={(e) => setApprovedBudgetAmount(e.target.value)}
                placeholder="0.00"
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold tabular-nums text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label htmlFor="cost-code-forecast-input" className="block text-xs font-bold text-slate-800">
                Forecast Amount ({currency}) <span className="text-[10px] font-normal text-slate-400">(Optional)</span>
              </label>
              <p className="mt-0.5 text-[10px] text-slate-500">Leave blank if not set.</p>
              <input
                id="cost-code-forecast-input"
                type="number"
                min={0}
                step={0.01}
                value={forecastAmount}
                onChange={(e) => setForecastAmount(e.target.value)}
                placeholder="Not set"
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold tabular-nums text-slate-900 outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {submitted && !validation.valid && (
            <div className="space-y-1">
              {validation.issues.map((issue, idx) => (
                <p key={idx} className="text-[11px] font-bold text-rose-600">
                  • {issue}
                </p>
              ))}
            </div>
          )}

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end border-t border-slate-100 pt-4">
            <Button
              type="button"
              variant="secondary"
              label="Cancel"
              isDisabled={loading}
              onClick={onClose}
            />
            <Button
              type="submit"
              variant="primary"
              label={loading ? "Saving…" : isEditing ? "Save Changes" : "Create Cost Code"}
              isDisabled={loading}
            />
          </div>
        </form>
      </section>
    </div>
  );
};

export default ProjectCostCodeModal;
