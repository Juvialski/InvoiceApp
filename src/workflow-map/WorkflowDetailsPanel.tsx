import React, { useState } from "react";
import {
  X,
  Copy,
  Check,
  Focus,
  AlertTriangle,
  Compass,
  FileCode,
  TestTube2,
  Layers,
  ArrowRight,
  ArrowLeft,
  ShieldCheck,
  Tag,
  CheckCircle2,
  AlertOctagon,
  MinusCircle,
  CircleDot,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  AlertCircle,
} from "lucide-react";
import type { WorkflowGraph } from "../../scripts/workflow-map/types.ts";
import type { WorkflowMapEvidenceModel, WorkflowNodeEvidence } from "../../scripts/workflow-map/evidence.ts";
import { getNodeDetails } from "./workflowCanvasUtils.ts";
import type { QaScenarioEvidence } from "../../scripts/qa/structuredEvidence.ts";

interface WorkflowDetailsPanelProps {
  readonly graph: WorkflowGraph;
  readonly selectedNodeId: string | null;
  readonly evidenceModel?: WorkflowMapEvidenceModel | null;
  readonly screenshotUrls?: Record<string, string>;
  readonly onClose: () => void;
  readonly onSelectNode: (nodeId: string) => void;
  readonly onFocusNeighborhood: (nodeId: string) => void;
  readonly isNeighborhoodFocused: boolean;
}

export function WorkflowDetailsPanel({
  graph,
  selectedNodeId,
  evidenceModel,
  screenshotUrls,
  onClose,
  onSelectNode,
  onFocusNeighborhood,
  isNeighborhoodFocused,
}: WorkflowDetailsPanelProps) {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [expandedScenarios, setExpandedScenarios] = useState<Record<string, boolean>>({});

  if (!selectedNodeId) return null;

  const details = getNodeDetails(graph, selectedNodeId, evidenceModel, screenshotUrls);
  if (!details) return null;

  const {
    node,
    domainMeta,
    typeMeta,
    invariants,
    incomingEdges,
    outgoingEdges,
    fileRefs,
    testRefs,
    qaScenarioIds,
    evidence,
  } = details;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const toggleScenarioExpand = (scenarioId: string) => {
    setExpandedScenarios((prev) => ({
      ...prev,
      [scenarioId]: !prev[scenarioId],
    }));
  };

  return (
    <aside
      aria-label="Node Details Panel"
      className="absolute inset-y-0 right-0 z-40 flex w-full flex-col border-l border-slate-200 bg-white shadow-2xl transition-all duration-300 sm:w-[480px] md:w-[520px] dark:border-slate-800 dark:bg-slate-900"
    >
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-200 p-4 dark:border-slate-800">
        <div className="space-y-1 pr-2 overflow-hidden">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${domainMeta.colorBadge}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${domainMeta.colorDot}`} />
              {domainMeta.label}
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${typeMeta.colorBg} ${typeMeta.colorText} ${typeMeta.colorBorder}`}>
              {typeMeta.label}
            </span>
            {node.scope && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                Scope: {node.scope}
              </span>
            )}
          </div>
          <h2 className="text-base font-bold leading-tight text-slate-900 dark:text-slate-100">
            {node.label}
          </h2>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
            <span>ID: <code className="text-slate-800 dark:text-slate-200 font-semibold">{node.id}</code></span>
            <button
              type="button"
              onClick={() => handleCopy(node.id, "node-id")}
              className="inline-flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              title="Copy Node ID"
            >
              {copiedText === "node-id" ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onFocusNeighborhood(node.id)}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow-2xs transition-colors ${
              isNeighborhoodFocused
                ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            }`}
            title="Focus neighborhood (1-hop neighbors only)"
          >
            <Focus className="h-3.5 w-3.5" />
            <span>{isNeighborhoodFocused ? "Focused" : "Focus"}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            title="Close details drawer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body Content */}
      <div className="flex-1 space-y-5 overflow-y-auto p-4 ops-scrollbar">
        {/* Description */}
        <section className="space-y-1.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Description
          </h3>
          <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
            {node.description}
          </p>
        </section>

        {/* WM-4 Browser Evidence Section (if evidence loaded) */}
        {evidence && (
          <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-850/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-slate-100">
                <Layers className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <span>Browser QA Evidence (QA-1)</span>
              </div>
              <div>
                {evidence.state === "PASS" && (
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-850 border border-emerald-300 dark:bg-emerald-950/80 dark:text-emerald-200 dark:border-emerald-800">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    <span>QA Passed</span>
                  </span>
                )}
                {evidence.state === "FAIL" && (
                  <span className="inline-flex items-center gap-1 rounded bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-850 border border-rose-300 dark:bg-rose-950/80 dark:text-rose-200 dark:border-rose-800">
                    <AlertOctagon className="h-3 w-3 text-rose-600 dark:text-rose-400" />
                    <span>QA Failed</span>
                  </span>
                )}
                {evidence.state === "PARTIAL" && (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-850 border border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-800">
                    <CircleDot className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                    <span>Partial Evidence</span>
                  </span>
                )}
                {evidence.state === "NOT_RUN" && (
                  <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 border border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                    <MinusCircle className="h-3 w-3 text-slate-500 dark:text-slate-400" />
                    <span>Not Run</span>
                  </span>
                )}
                {evidence.state === "UNMAPPED" && (
                  <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
                    <span>Unmapped Node</span>
                  </span>
                )}
              </div>
            </div>

            {/* Explanatory Boundary Notice */}
            <div className="rounded-lg bg-slate-100/80 p-2 text-[10px] leading-relaxed text-slate-600 dark:bg-slate-800/80 dark:text-slate-400">
              <span className="font-semibold text-slate-800 dark:text-slate-200">Note:</span> Browser QA verification indicates that mapped deterministic Playwright scenarios passed their browser checks. It does not certify accounting calculations, RLS tenant isolation, payroll history immutability, or engineering lifecycle correctness.
            </div>

            {/* Scenario Breakdown Stats */}
            {evidence.mappedScenarioIds.length > 0 && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-750 dark:bg-slate-900">
                  <div className="text-[10px] text-slate-400">Mapped Scenarios</div>
                  <div className="font-bold text-slate-800 dark:text-slate-200">
                    {evidence.presentScenarioIds.length} / {evidence.mappedScenarioIds.length} present
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-750 dark:bg-slate-900">
                  <div className="text-[10px] text-slate-400">Tested Viewports</div>
                  <div className="font-bold text-slate-800 dark:text-slate-200 truncate">
                    {evidence.testedViewports.length > 0 ? evidence.testedViewports.join(", ") : "None"}
                  </div>
                </div>
              </div>
            )}

            {/* Missing Scenarios list (if any) */}
            {evidence.missingScenarioIds.length > 0 && (
              <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 dark:border-amber-900/50 dark:bg-amber-950/30 text-xs">
                <div className="flex items-center gap-1 font-bold text-amber-900 dark:text-amber-300 text-[11px]">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Missing Mapped Scenarios ({evidence.missingScenarioIds.length})</span>
                </div>
                <div className="space-y-1 font-mono text-[10px] text-amber-850 dark:text-amber-300">
                  {evidence.missingScenarioIds.map((id) => (
                    <div key={id} className="truncate">
                      • {id}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Present Scenarios Accordion / Cards */}
            {evidence.scenarios.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Present Scenario Evidence ({evidence.scenarios.length})
                </div>
                <div className="space-y-2">
                  {evidence.scenarios.map((sc) => {
                    const isExpanded = expandedScenarios[sc.scenarioId] ?? true;
                    const screenshotUrl = screenshotUrls?.[sc.scenarioId] || (sc.screenshotPath ? screenshotUrls?.[sc.screenshotPath] : undefined);

                    return (
                      <div
                        key={sc.scenarioId}
                        className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xs dark:border-slate-750 dark:bg-slate-900"
                      >
                        {/* Scenario Card Header */}
                        <div
                          onClick={() => toggleScenarioExpand(sc.scenarioId)}
                          className="flex cursor-pointer items-start justify-between gap-2"
                        >
                          <div className="space-y-0.5 overflow-hidden">
                            <div className="flex items-center gap-1.5">
                              {sc.status === "PASS" ? (
                                <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-850 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800">
                                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />
                                  PASS
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 rounded bg-rose-100 px-1.5 py-0.2 text-[10px] font-bold text-rose-850 border border-rose-300 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800">
                                  <AlertOctagon className="h-2.5 w-2.5 text-rose-600" />
                                  FAIL
                                </span>
                              )}
                              <span className="font-mono text-[10px] font-bold text-slate-700 dark:text-slate-300">
                                {sc.viewport.name} ({sc.viewport.width}x{sc.viewport.height})
                              </span>
                            </div>
                            <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              {sc.scenarioId}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 text-slate-400">
                            <span className="text-[10px] font-mono">{sc.durationMs}ms</span>
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </div>

                        {/* Scenario Details (Collapsible) */}
                        {isExpanded && (
                          <div className="mt-2.5 space-y-2 border-t border-slate-100 pt-2 dark:border-slate-800 text-xs">
                            {/* Failure Reasons Callout */}
                            {sc.failureReasons.length > 0 && (
                              <div className="rounded-lg border border-rose-200 bg-rose-50/80 p-2 dark:border-rose-900/50 dark:bg-rose-950/40">
                                <div className="text-[10px] font-bold uppercase text-rose-900 dark:text-rose-300">
                                  Failure Reasons
                                </div>
                                <div className="mt-0.5 flex flex-wrap gap-1">
                                  {sc.failureReasons.map((reason) => (
                                    <code key={reason} className="rounded bg-rose-100 px-1 py-0.2 font-mono text-[10px] font-bold text-rose-800 dark:bg-rose-900 dark:text-rose-200">
                                      {reason}
                                    </code>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Interaction & Route details */}
                            <div className="space-y-1 text-[11px]">
                              <div className="flex items-center justify-between text-slate-500">
                                <span>Interaction State:</span>
                                <span className="font-semibold text-slate-700 dark:text-slate-300">{sc.interactionState}</span>
                              </div>
                              <div className="flex items-center justify-between text-slate-500">
                                <span>Tested Path:</span>
                                <code className="font-mono text-slate-700 dark:text-slate-300">{sc.requestedPath}</code>
                              </div>
                              <div className="flex items-center justify-between text-slate-500">
                                <span>HTTP Status:</span>
                                <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                                  {sc.navigation.status !== null ? `HTTP ${sc.navigation.status}` : "No response"}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-slate-500">
                                <span>Horizontal Overflow:</span>
                                <span className={`font-mono ${sc.overflow.detected ? "font-bold text-rose-600" : "text-slate-700 dark:text-slate-300"}`}>
                                  {sc.overflow.detected ? `${sc.overflow.pixels}px detected` : "None (0px)"}
                                </span>
                              </div>
                            </div>

                            {/* Assertions */}
                            {sc.assertions.length > 0 && (
                              <div className="space-y-1">
                                <div className="text-[10px] font-bold uppercase text-slate-400">Deterministic Assertions</div>
                                <div className="space-y-0.5">
                                  {sc.assertions.map((a) => (
                                    <div key={a.id} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1 text-[10px] dark:bg-slate-800">
                                      <span className="font-mono text-slate-700 dark:text-slate-300">{a.id}</span>
                                      <span className={a.passed ? "font-bold text-emerald-600" : "font-bold text-rose-600"}>
                                        {a.passed ? "PASS" : "FAIL"}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Console Errors */}
                            {sc.consoleErrors.length > 0 && (
                              <div className="space-y-1">
                                <div className="text-[10px] font-bold uppercase text-slate-400">
                                  Console Errors ({sc.consoleErrors.length})
                                </div>
                                <div className="space-y-1">
                                  {sc.consoleErrors.map((err, idx) => (
                                    <div key={idx} className={`rounded p-1.5 font-mono text-[10px] leading-tight ${err.ignored ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" : "bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"}`}>
                                      {err.ignored && <span className="font-bold uppercase text-slate-400 mr-1">[IGNORED]</span>}
                                      {err.message}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Page Errors */}
                            {sc.pageErrors.length > 0 && (
                              <div className="space-y-1">
                                <div className="text-[10px] font-bold uppercase text-rose-500">
                                  Page Errors ({sc.pageErrors.length})
                                </div>
                                <div className="space-y-1">
                                  {sc.pageErrors.map((err, idx) => (
                                    <div key={idx} className="rounded bg-rose-50 p-1.5 font-mono text-[10px] leading-tight text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                                      {err.message}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Screenshot Preview / Relative Path */}
                            <div className="space-y-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                              <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span className="flex items-center gap-1">
                                  <ImageIcon className="h-3 w-3" />
                                  <span>Screenshot Artifact</span>
                                </span>
                                {sc.screenshotPath && (
                                  <button
                                    type="button"
                                    onClick={() => handleCopy(sc.screenshotPath!, "screenshot-path")}
                                    className="inline-flex items-center gap-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                    title="Copy relative screenshot path"
                                  >
                                    <Copy className="h-2.5 w-2.5" />
                                    <span>{copiedText === "screenshot-path" ? "Copied" : "Copy Path"}</span>
                                  </button>
                                )}
                              </div>
                              {screenshotUrl ? (
                                <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-950 dark:border-slate-700">
                                  <img
                                    src={screenshotUrl}
                                    alt={`Screenshot of scenario ${sc.scenarioId}`}
                                    className="max-h-56 w-full object-contain"
                                  />
                                </div>
                              ) : (
                                <div className="rounded bg-slate-50 px-2 py-1.5 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400 flex items-center justify-between">
                                  <span className="truncate">{sc.screenshotPath || "No screenshot captured"}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {/* High Risk Invariants Alert Section */}
        {invariants.length > 0 && (
          <section className="space-y-2 rounded-xl border border-rose-200 bg-rose-50/70 p-3 dark:border-rose-900/50 dark:bg-rose-950/30">
            <div className="flex items-center gap-1.5 text-xs font-bold text-rose-900 dark:text-rose-300">
              <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
              <span>High-Risk Invariant Boundary ({invariants.length})</span>
            </div>
            <div className="space-y-2">
              {invariants.map((inv) => (
                <div key={inv.id} className="rounded-lg border border-rose-200 bg-white/80 p-2.5 dark:border-rose-900/60 dark:bg-slate-900/80">
                  <div className="text-xs font-bold text-rose-950 dark:text-rose-200">
                    {inv.label}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-rose-600 dark:text-rose-400">
                    {inv.id}
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
                    {inv.description}
                  </p>
                  {inv.fileRefs.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1 text-[10px] text-slate-500">
                      <span className="font-semibold">Sources:</span>
                      {inv.fileRefs.map((ref) => (
                        <code key={ref} className="rounded bg-slate-100 px-1 py-0.2 font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {ref}
                        </code>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Route Details (if present) */}
        {node.route && (
          <section className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-200">
              <Compass className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span>Route & Navigation</span>
            </div>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-slate-400">Canonical Path:</span>
                <code className="rounded bg-white px-1.5 py-0.5 font-mono font-bold text-slate-800 border border-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700">
                  {node.route.canonicalPath}
                </code>
              </div>
              {node.route.pathPattern && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Pattern:</span>
                  <code className="font-mono text-slate-700 dark:text-slate-300">{node.route.pathPattern}</code>
                </div>
              )}
              {node.route.queryKeys && node.route.queryKeys.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Query Keys:</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">{node.route.queryKeys.join(", ")}</span>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Status Lifecycle Flow (if present) */}
        {node.statusValues && node.statusValues.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Lifecycle States
            </h3>
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40">
              {node.statusValues.map((status, idx) => (
                <React.Fragment key={status}>
                  <span className="inline-flex items-center rounded-md bg-white px-2 py-1 text-xs font-bold text-slate-800 shadow-2xs border border-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700">
                    {status}
                  </span>
                  {idx < node.statusValues!.length - 1 && (
                    <ArrowRight className="h-3 w-3 text-slate-400" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </section>
        )}

        {/* Guards & Permissions */}
        {(node.confirmationRequirement === "human" || (node.permissionKeys && node.permissionKeys.length > 0)) && (
          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Authorization & Guards
            </h3>
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40 text-xs">
              {node.confirmationRequirement === "human" && (
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-medium">
                  <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Requires explicit human user confirmation before execution.</span>
                </div>
              )}
              {node.permissionKeys && node.permissionKeys.length > 0 && (
                <div className="space-y-1">
                  <span className="text-slate-500 dark:text-slate-400">Required RBAC Permissions:</span>
                  <div className="flex flex-wrap gap-1">
                    {node.permissionKeys.map((p) => (
                      <code key={p} className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-indigo-700 border border-indigo-200 dark:bg-slate-900 dark:text-indigo-300 dark:border-indigo-800">
                        {p}
                      </code>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Connected Incoming Relationships */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Incoming Dependencies ({incomingEdges.length})
            </h3>
          </div>
          {incomingEdges.length === 0 ? (
            <p className="text-xs italic text-slate-400">No incoming workflow edges in current graph.</p>
          ) : (
            <div className="space-y-1.5">
              {incomingEdges.map(({ edge, sourceNode }) => (
                <div
                  key={edge.id}
                  onClick={() => onSelectNode(sourceNode.id)}
                  className="group flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 bg-white p-2 text-xs transition-colors hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/30"
                >
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <ArrowLeft className="h-3.5 w-3.5 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 shrink-0" />
                    <div className="overflow-hidden">
                      <div className="font-bold text-slate-800 group-hover:text-indigo-700 dark:text-slate-200 dark:group-hover:text-indigo-300 truncate">
                        {sourceNode.label}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        via <span className="font-semibold text-slate-600 dark:text-slate-300">{edge.label}</span> ({edge.kind})
                      </div>
                    </div>
                  </div>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    {sourceNode.domain}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Connected Outgoing Relationships */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Outgoing Dependencies ({outgoingEdges.length})
            </h3>
          </div>
          {outgoingEdges.length === 0 ? (
            <p className="text-xs italic text-slate-400">No outgoing workflow edges in current graph.</p>
          ) : (
            <div className="space-y-1.5">
              {outgoingEdges.map(({ edge, targetNode }) => (
                <div
                  key={edge.id}
                  onClick={() => onSelectNode(targetNode.id)}
                  className="group flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 bg-white p-2 text-xs transition-colors hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/30"
                >
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 shrink-0" />
                    <div className="overflow-hidden">
                      <div className="font-bold text-slate-800 group-hover:text-indigo-700 dark:text-slate-200 dark:group-hover:text-indigo-300 truncate">
                        {targetNode.label}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        via <span className="font-semibold text-slate-600 dark:text-slate-300">{edge.label}</span> ({edge.kind})
                      </div>
                    </div>
                  </div>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    {targetNode.domain}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Source Files */}
        {fileRefs.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Source Implementation Files ({fileRefs.length})
            </h3>
            <div className="space-y-1">
              {fileRefs.map((file) => (
                <div
                  key={file}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-center gap-1.5 overflow-hidden font-mono text-[11px] text-slate-700 dark:text-slate-300">
                    <FileCode className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{file}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(file, file)}
                    className="ml-2 inline-flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    title="Copy relative file path"
                  >
                    {copiedText === file ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Test Files */}
        {testRefs.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Test Coverage Files ({testRefs.length})
            </h3>
            <div className="space-y-1">
              {testRefs.map((testFile) => (
                <div
                  key={testFile}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-center gap-1.5 overflow-hidden font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
                    <TestTube2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    <span className="truncate">{testFile}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(testFile, testFile)}
                    className="ml-2 inline-flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    title="Copy relative test path"
                  >
                    {copiedText === testFile ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* QA-1 Scenarios (Architecture Catalog references) */}
        {qaScenarioIds.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Mapped Architecture QA Scenarios ({qaScenarioIds.length})
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {qaScenarioIds.map((scId) => (
                <span
                  key={scId}
                  className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-1 font-mono text-[10px] font-semibold text-purple-700 border border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800"
                >
                  <Layers className="h-3 w-3 text-purple-500" />
                  {scId}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Tags */}
        {node.tags && node.tags.length > 0 && (
          <section className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <Tag className="h-3 w-3" />
              <span>Tags:</span>
              <span className="text-slate-600 dark:text-slate-400">{node.tags.join(", ")}</span>
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
