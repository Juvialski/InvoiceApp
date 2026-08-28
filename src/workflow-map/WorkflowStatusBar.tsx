import React from "react";
import type { WorkflowGraph } from "../../scripts/workflow-map/types.ts";
import type { WorkflowCanvasFilter } from "./workflowCanvasTypes.ts";

interface WorkflowStatusBarProps {
  readonly graph: WorkflowGraph;
  readonly visibleNodeCount: number;
  readonly visibleEdgeCount: number;
  readonly filter: WorkflowCanvasFilter;
}

export function WorkflowStatusBar({
  graph,
  visibleNodeCount,
  visibleEdgeCount,
  filter,
}: WorkflowStatusBarProps) {
  const totalNodes = graph.nodes.length;
  const totalEdges = graph.edges.length;
  const totalInvariants = graph.invariants.length;

  return (
    <footer className="z-20 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white/95 px-4 py-1.5 text-[11px] text-slate-500 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-400 select-none">
      {/* Left: Visible vs Total Counts */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-slate-700 dark:text-slate-300">Visible Nodes:</span>
          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
            {visibleNodeCount}
          </span>
          <span className="text-slate-400">/ {totalNodes} total</span>
        </div>

        <div className="h-3 w-[1px] bg-slate-200 dark:bg-slate-700" />

        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-slate-700 dark:text-slate-300">Visible Edges:</span>
          <span className="font-mono font-bold text-sky-600 dark:text-sky-400">
            {visibleEdgeCount}
          </span>
          <span className="text-slate-400">/ {totalEdges} total</span>
        </div>

        <div className="h-3 w-[1px] bg-slate-200 dark:bg-slate-700" />

        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-slate-700 dark:text-slate-300">Invariants:</span>
          <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
            {totalInvariants}
          </span>
        </div>
      </div>

      {/* Right: Versioning, SHA, and Read-only notice */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="hidden items-center gap-1.5 sm:flex">
          <span className="text-slate-400">Canonical Source:</span>
          <code className="font-mono font-semibold text-slate-700 dark:text-slate-300">
            {graph.canonicalSource}
          </code>
        </div>

        <div className="h-3 w-[1px] bg-slate-200 dark:bg-slate-700" />

        <div className="flex items-center gap-1 font-mono text-[10px]">
          <span className="rounded bg-slate-100 px-1 py-0.2 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            schema v{graph.schemaVersion}
          </span>
          <span className="rounded bg-slate-100 px-1 py-0.2 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {graph.version}
          </span>
        </div>

        <div className="h-3 w-[1px] bg-slate-200 dark:bg-slate-700" />

        <div className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span>Read-Only Architecture Explorer</span>
        </div>
      </div>
    </footer>
  );
}
