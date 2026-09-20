import React, { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Project, ProjectStatus } from "../../types.ts";
import { WorksheetEditor, type WorksheetColumn } from "../ui/WorksheetEditor.tsx";
import { useDialogFocus } from "../ui/useDialogFocus.ts";

export interface ProjectDetailsWorksheetProps {
  project: Project;
  projectStatuses: readonly ProjectStatus[];
  errorMessage?: string;
  onClose: () => void;
  onSave: (project: Project) => Promise<boolean | void> | boolean | void;
}

function textValue(value: unknown) {
  return String(value ?? "");
}

function requiredField(label: string) {
  return (value: unknown) => textValue(value).trim() ? undefined : `${label} is required.`;
}

function nonNegativeField(label: string) {
  return (value: unknown) => {
    const numberValue = Number(value ?? 0);
    return Number.isFinite(numberValue) && numberValue >= 0 ? undefined : `${label} must be a non-negative number.`;
  };
}

function projectCurrency(row: Project) {
  return (row.currency || "PHP").toUpperCase();
}

export function ProjectDetailsWorksheet({
  project,
  projectStatuses,
  errorMessage,
  onClose,
  onSave,
}: ProjectDetailsWorksheetProps) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useDialogFocus({ open: true, onClose, initialFocusRef: closeButtonRef });
  const rows = useMemo(() => [project], [project]);
  const columns = useMemo<readonly WorksheetColumn<Project>[]>(() => [
    {
      key: "projectCode",
      header: "Project Code",
      minWidth: "12rem",
      frozen: true,
      value: (row) => row.projectCode,
      setValue: (row, value) => ({ ...row, projectCode: textValue(value) }),
      validate: requiredField("Project Code"),
    },
    {
      key: "projectName",
      header: "Project Name",
      minWidth: "18rem",
      value: (row) => row.projectName,
      setValue: (row, value) => ({ ...row, projectName: textValue(value) }),
      validate: requiredField("Project Name"),
    },
    {
      key: "currency",
      header: "Currency",
      minWidth: "8rem",
      value: (row) => row.currency,
      parse: (raw) => raw.trim().toUpperCase(),
      setValue: (row, value) => ({ ...row, currency: textValue(value).toUpperCase() }),
      validate: requiredField("Currency"),
    },
    {
      key: "taxTreatment",
      header: "Tax Treatment",
      kind: "select",
      minWidth: "11rem",
      options: [
        { value: "VAT", label: "VAT" },
        { value: "NON_VAT", label: "Non-VAT" },
      ],
      value: (row) => row.taxTreatment || "",
      setValue: (row, value) => ({ ...row, taxTreatment: value as Project["taxTreatment"] }),
      validate: (value) => value === "VAT" || value === "NON_VAT" ? undefined : "Choose VAT or Non-VAT before saving.",
    },
    {
      key: "contractValue",
      header: "Contract Value",
      kind: "currency",
      align: "right",
      minWidth: "12rem",
      currency: projectCurrency,
      value: (row) => row.contractValue ?? 0,
      setValue: (row, value) => ({ ...row, contractValue: Number(value ?? 0) }),
      validate: nonNegativeField("Contract Value"),
    },
    {
      key: "projectBudget",
      header: "Approved Cost Budget",
      kind: "currency",
      align: "right",
      minWidth: "14rem",
      currency: projectCurrency,
      value: (row) => row.projectBudget,
      setValue: (row, value) => ({ ...row, projectBudget: Number(value ?? 0) }),
      validate: nonNegativeField("Approved Cost Budget"),
    },
    {
      key: "clientName",
      header: "Client Name",
      minWidth: "14rem",
      value: (row) => row.clientName || "",
      setValue: (row, value) => ({ ...row, clientName: textValue(value) }),
    },
    {
      key: "projectManager",
      header: "Project Manager",
      minWidth: "14rem",
      value: (row) => row.projectManager || "",
      setValue: (row, value) => ({ ...row, projectManager: textValue(value) }),
    },
    {
      key: "billingContactName",
      header: "Billing Contact",
      minWidth: "14rem",
      value: (row) => row.billingContactName || "",
      setValue: (row, value) => ({ ...row, billingContactName: textValue(value) }),
    },
    {
      key: "billingEmail",
      header: "Billing Email",
      minWidth: "16rem",
      value: (row) => row.billingEmail || "",
      setValue: (row, value) => ({ ...row, billingEmail: textValue(value) }),
      validate: (value) => {
        const email = textValue(value).trim();
        return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? undefined : "Enter a valid billing email or leave it blank.";
      },
    },
    {
      key: "billingAddress",
      header: "Billing Address",
      minWidth: "20rem",
      value: (row) => row.billingAddress || "",
      setValue: (row, value) => ({ ...row, billingAddress: textValue(value) }),
    },
    {
      key: "location",
      header: "Location / City",
      minWidth: "14rem",
      value: (row) => row.location || "",
      setValue: (row, value) => ({ ...row, location: textValue(value) }),
    },
    {
      key: "status",
      header: "Status",
      kind: "select",
      minWidth: "12rem",
      options: projectStatuses.map((status) => ({ value: status, label: status.replaceAll("_", " ") })),
      value: (row) => row.status,
      setValue: (row, value) => ({ ...row, status: value as ProjectStatus }),
    },
    {
      key: "description",
      header: "Operational Notes / Scope",
      minWidth: "24rem",
      value: (row) => row.description || row.notes || "",
      setValue: (row, value) => ({ ...row, description: textValue(value), notes: textValue(value) }),
    },
  ], [projectStatuses]);

  const handleSave = async (nextRows: readonly Project[]) => {
    const nextProject = nextRows[0];
    if (!nextProject) return;
    setSaveError(null);
    try {
      const saved = await onSave(nextProject);
      if (saved !== false) onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save project details.");
    }
  };

  return (
    <div ref={dialogRef} data-project-details-worksheet="true" className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-slate-950/50 p-2 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="project-details-worksheet-title">
      <section className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[95vw] min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">Project master data</p>
            <h2 id="project-details-worksheet-title" className="mt-1 text-lg font-black text-slate-950">{project.id && project.projectCode.trim() ? `Edit Project Details · ${project.projectCode}` : "Create New Project"}</h2>
            <p className="mt-1 text-xs text-slate-500">Edit structured project details in one worksheet. Save still uses the project authority and validation owned by the parent.</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" aria-label="Close project details worksheet"><X className="h-4 w-4" /></button>
        </div>
        {(errorMessage || saveError) && <p role="alert" className="mx-4 mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 sm:mx-5">{saveError || errorMessage}</p>}
        <div data-dialog-scroll-container="project-details" className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
          <WorksheetEditor
            ariaLabel="Project Details worksheet"
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            onSave={handleSave}
            onCancel={onClose}
            saveLabel="Save project"
            cancelLabel="Cancel"
            emptyState="Project details are unavailable."
            className="min-w-0"
            density="comfortable"
          />
        </div>
      </section>
    </div>
  );
}

export default ProjectDetailsWorksheet;
