import React, { memo } from "react";
import { Handle, type NodeProps, Position } from "@xyflow/react";
import {
  Compass,
  Monitor,
  GitMerge,
  CircleDot,
  Zap,
  Database,
  BarChart3,
  ShieldAlert,
  Lock,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Focus,
  CheckCircle2,
  AlertOctagon,
  MinusCircle,
  Circle,
} from "lucide-react";
import type { WorkflowCustomNodeData } from "./workflowCanvasTypes.ts";

function NodeTypeIcon({ name, className }: { name: string; className?: string }) {
  switch (name) {
    case "Compass":
      return <Compass className={className} />;
    case "Monitor":
      return <Monitor className={className} />;
    case "GitMerge":
      return <GitMerge className={className} />;
    case "CircleDot":
      return <CircleDot className={className} />;
    case "Zap":
      return <Zap className={className} />;
    case "Database":
      return <Database className={className} />;
    case "BarChart3":
      return <BarChart3 className={className} />;
    case "ShieldAlert":
      return <ShieldAlert className={className} />;
    case "Lock":
      return <Lock className={className} />;
    default:
      return <CircleDot className={className} />;
  }
}

export const WorkflowNodeComponent = memo(function WorkflowNodeComponent({
  data,
  selected,
}: NodeProps & { data: WorkflowCustomNodeData }) {
  const {
    node,
    domainMeta,
    typeMeta,
    isSelected,
    isDimmed,
    isDirectNeighbor,
    isIncomingNeighbor,
    isOutgoingNeighbor,
    invariants,
    evidence,
    evidenceMode,
    onSelectNode,
    onFocusNeighborhood,
  } = data;

  const activeSelected = isSelected || selected;
  const isEvidenceActive = evidenceMode && evidenceMode !== "off" && Boolean(evidence);
  const isFail = isEvidenceActive && evidence?.state === "FAIL";

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectNode(node.id);
  };

  const handleFocusNeighborhood = (e: React.MouseEvent) => {
    e.stopPropagation();
    onFocusNeighborhood(node.id);
  };

  return (
    <div
      onClick={handleClick}
      className={`relative w-[285px] cursor-pointer rounded-xl border bg-white p-3 shadow-xs transition-all duration-200 dark:bg-slate-900 select-none ${
        isFail && evidenceMode === "failures"
          ? "border-rose-600 ring-2 ring-rose-500 ring-offset-2 shadow-xl dark:ring-offset-slate-950 scale-[1.015]"
          : activeSelected
            ? "border-indigo-600 ring-2 ring-indigo-500 ring-offset-2 shadow-lg dark:ring-offset-slate-950 scale-[1.01]"
            : isDirectNeighbor
              ? "border-sky-500 ring-1 ring-sky-400 shadow-md"
              : `${domainMeta.colorBorder} hover:border-slate-400 dark:hover:border-slate-500 hover:shadow-md`
      } ${isDimmed ? "opacity-25 grayscale-[40%]" : "opacity-100"}`}
    >
      {/* Target handle (left) */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-slate-500 transition-colors hover:!bg-indigo-600 dark:!border-slate-900"
      />

      {/* Source handle (right) */}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !rounded-full !border-2 !border-white !bg-slate-500 transition-colors hover:!bg-indigo-600 dark:!border-slate-900"
      />

      {/* Top Header: Domain + Node Type + Evidence Pill / Scope */}
      <div className="mb-2 flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${domainMeta.colorBadge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${domainMeta.colorDot}`} />
            <span className="truncate max-w-[100px]">{domainMeta.label}</span>
          </span>
          <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium border ${typeMeta.colorBg} ${typeMeta.colorText} ${typeMeta.colorBorder}`}>
            <NodeTypeIcon name={typeMeta.iconName} className="h-2.5 w-2.5" />
            <span>{typeMeta.label}</span>
          </span>
        </div>

        {/* Evidence Status Pill (if overlay active) */}
        {isEvidenceActive && evidence && (
          <div>
            {evidence.state === "FAIL" && (
              <span
                className="inline-flex items-center gap-1 rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-900 border border-rose-300 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-800"
                title={`Browser QA Failed: ${evidence.failedScenarioIds.length} failed scenario(s)`}
              >
                <AlertOctagon className="h-2.5 w-2.5 text-rose-700 dark:text-rose-400" />
                <span>QA Failed</span>
              </span>
            )}
            {evidence.state === "PASS" && (
              <span
                className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-900 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-200 dark:border-emerald-800"
                title={`Browser QA Passed (${evidence.presentScenarioIds.length} scenario${evidence.presentScenarioIds.length > 1 ? "s" : ""})`}
              >
                <CheckCircle2 className="h-2.5 w-2.5 text-emerald-700 dark:text-emerald-400" />
                <span>QA Passed</span>
              </span>
            )}
            {evidence.state === "PARTIAL" && (
              <span
                className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-900 border border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-800"
                title={`Partial Evidence: ${evidence.presentScenarioIds.length} passed, ${evidence.missingScenarioIds.length} missing`}
              >
                <CircleDot className="h-2.5 w-2.5 text-amber-700 dark:text-amber-400" />
                <span>Partial QA</span>
              </span>
            )}
            {evidence.state === "NOT_RUN" && (
              <span
                className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                title={`Mapped scenarios not run (${evidence.mappedScenarioIds.length})`}
              >
                <MinusCircle className="h-2.5 w-2.5 text-slate-500 dark:text-slate-400" />
                <span>Not Run</span>
              </span>
            )}
          </div>
        )}

        {/* Scope or neighbor pill (when evidence badge not occupying this space) */}
        {!isEvidenceActive && isIncomingNeighbor && (
          <span className="rounded bg-sky-100 px-1 py-0.2 text-[9px] font-bold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
            Source
          </span>
        )}
        {!isEvidenceActive && isOutgoingNeighbor && (
          <span className="rounded bg-indigo-100 px-1 py-0.2 text-[9px] font-bold text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
            Target
          </span>
        )}
        {!isEvidenceActive && !isIncomingNeighbor && !isOutgoingNeighbor && node.scope && node.scope !== "company" && (
          <span className="rounded bg-slate-100 px-1 py-0.2 text-[9px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            {node.scope}
          </span>
        )}
      </div>

      {/* Main Node Label */}
      <div className="mb-1 text-xs font-bold leading-tight text-slate-900 dark:text-slate-100">
        {node.label}
      </div>

      {/* Canonical Route or Description snippet */}
      {node.route?.canonicalPath ? (
        <div className="mb-1.5 flex items-center gap-1 text-[10px] font-mono text-slate-500 dark:text-slate-400">
          <Compass className="h-3 w-3 shrink-0 text-blue-500" />
          <span className="truncate font-semibold text-slate-700 dark:text-slate-300">
            {node.route.canonicalPath}
          </span>
        </div>
      ) : (
        <div className="mb-1.5 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">
          {node.description}
        </div>
      )}

      {/* Status Values (if present) */}
      {node.statusValues && node.statusValues.length > 0 && (
        <div className="mb-1.5 flex flex-wrap items-center gap-1">
          {node.statusValues.slice(0, 4).map((status, idx) => (
            <React.Fragment key={status}>
              <span className="rounded bg-slate-100 px-1 py-0.2 text-[9px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {status}
              </span>
              {idx < Math.min(node.statusValues!.length - 1, 3) && (
                <ArrowRight className="h-2 w-2 text-slate-400" />
              )}
            </React.Fragment>
          ))}
          {node.statusValues.length > 4 && (
            <span className="text-[9px] font-bold text-slate-400">
              +{node.statusValues.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Bottom Indicators & Badges */}
      <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-1.5 dark:border-slate-800">
        {/* Human Confirmation Guard */}
        {node.confirmationRequirement === "human" && (
          <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-900 border border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-800" title="Requires explicit human confirmation before execution">
            <ShieldCheck className="h-2.5 w-2.5 text-amber-700 dark:text-amber-400" />
            Human Confirm
          </span>
        )}

        {/* High Risk Invariants */}
        {invariants.length > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold text-rose-900 border border-rose-300 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-800" title={invariants.map(i => i.label).join("; ")}>
            <AlertTriangle className="h-2.5 w-2.5 text-rose-700 dark:text-rose-400" />
            {invariants.length === 1 ? invariants[0].label : `${invariants.length} Invariants`}
          </span>
        )}

        {/* Node ID indicator */}
        <span className="ml-auto font-mono text-[9px] text-slate-400 dark:text-slate-500">
          {node.id}
        </span>

        {/* Focus Neighborhood shortcut button on hover */}
        {activeSelected && (
          <button
            type="button"
            onClick={handleFocusNeighborhood}
            title="Focus direct 1-hop neighborhood"
            className="inline-flex items-center gap-0.5 rounded bg-indigo-50 px-1 py-0.5 text-[9px] font-bold text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300 dark:hover:bg-indigo-900"
          >
            <Focus className="h-2.5 w-2.5" />
            Focus
          </button>
        )}
      </div>
    </div>
  );
});
