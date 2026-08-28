import React from "react";
import { X, AlertTriangle, ShieldCheck, FileCode, TestTube2, Check, Copy } from "lucide-react";
import type { WorkflowInvariant } from "../../scripts/workflow-map/types.ts";

interface WorkflowInvariantsModalProps {
  readonly isOpen: boolean;
  readonly invariants: readonly WorkflowInvariant[];
  readonly onClose: () => void;
  readonly onSelectInvariantNode?: (invariantId: string) => void;
}

export function WorkflowInvariantsModal({
  isOpen,
  invariants,
  onClose,
  onSelectInvariantNode,
}: WorkflowInvariantsModalProps) {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="High-Risk Invariants Catalog"
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 p-4.5 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-rose-100 p-2 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Engoryx High-Risk Invariants ({invariants.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Architectural boundaries that protect financial correctness, data isolation, and safety invariants.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Invariant list */}
        <div className="flex-1 space-y-3.5 overflow-y-auto p-4.5 ops-scrollbar">
          {invariants.map((inv) => (
            <div
              key={inv.id}
              className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 transition-all dark:border-slate-800 dark:bg-slate-800/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {inv.label}
                  </h3>
                  <div className="flex items-center gap-2 font-mono text-[11px] text-rose-600 dark:text-rose-400">
                    <span>{inv.id}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(inv.id, inv.id)}
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      title="Copy Invariant ID"
                    >
                      {copiedId === inv.id ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              </div>

              <p className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                {inv.description}
              </p>

              {/* References */}
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-200/60 pt-2 text-[11px] text-slate-500 dark:border-slate-700/60 dark:text-slate-400">
                {inv.fileRefs.length > 0 && (
                  <div className="flex items-center gap-1">
                    <FileCode className="h-3.5 w-3.5 text-slate-400" />
                    <span>{inv.fileRefs.length} Source file{inv.fileRefs.length === 1 ? "" : "s"}</span>
                  </div>
                )}
                {inv.testRefs && inv.testRefs.length > 0 && (
                  <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <TestTube2 className="h-3.5 w-3.5" />
                    <span>{inv.testRefs.length} Test suite{inv.testRefs.length === 1 ? "" : "s"}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4.5 py-3 dark:border-slate-800 dark:bg-slate-900/50">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Source: <code className="font-mono font-semibold">scripts/workflow-map/graph.ts</code>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-indigo-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
