import React, { useMemo } from "react";
import { FileText } from "lucide-react";
import type { EngineeringDocument, EngineeringDocumentRevision } from "../../lib/engineeringDocuments.ts";

export interface CoordinationRevisionPickerProps {
  documents: readonly EngineeringDocument[];
  revisions: readonly EngineeringDocumentRevision[];
  selectedRevisionIds: readonly string[];
  onChange: (revisionIds: string[]) => void;
  disabled?: boolean;
  label?: string;
}

export const CoordinationRevisionPicker: React.FC<CoordinationRevisionPickerProps> = ({
  documents,
  revisions,
  selectedRevisionIds,
  onChange,
  disabled = false,
  label = "Linked engineering revisions",
}) => {
  const rows = useMemo(() => documents.flatMap((document) => revisions
    .filter((revision) => revision.documentId === document.id)
    .map((revision) => ({ document, revision }))), [documents, revisions]);
  const selected = new Set(selectedRevisionIds);

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        No project engineering revisions are available yet. Add the source drawing/specification in Documents first, then link its immutable revision here.
      </div>
    );
  }

  return (
    <fieldset disabled={disabled} className="space-y-2">
      <legend className="mb-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</legend>
      <div className="max-h-48 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
        {rows.map(({ document, revision }) => {
          const checked = selected.has(revision.id);
          return (
            <label key={revision.id} className={`flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 transition ${checked ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(event.target.checked
                  ? [...selectedRevisionIds, revision.id]
                  : selectedRevisionIds.filter((id) => id !== revision.id))}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600"
              />
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <span className="min-w-0">
                <span className="block truncate text-xs font-bold text-slate-800">{document.documentNumber} · {document.title}</span>
                <span className="mt-0.5 block text-[10px] font-semibold text-slate-500">Revision {revision.revisionNumber}{revision.revisionLabel ? ` · ${revision.revisionLabel}` : ""} · {document.discipline.replaceAll("_", " ")}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
};
