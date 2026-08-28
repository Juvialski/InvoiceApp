import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { WORKFLOW_GRAPH } from "../../scripts/workflow-map/graph.ts";
import type { WorkflowCanvasFilter } from "./workflowCanvasTypes.ts";
import {
  DEFAULT_FILTER,
  filterGraph,
  formatWorkflowMapUrlQuery,
  parseWorkflowMapUrlState,
} from "./workflowCanvasUtils.ts";
import {
  mapEvidenceToWorkflowGraph,
  parseQaManifest,
  type WorkflowMapEvidenceModel,
} from "../../scripts/workflow-map/evidence.ts";
import { WorkflowToolbar } from "./WorkflowToolbar.tsx";
import { WorkflowCanvas } from "./WorkflowCanvas.tsx";
import { WorkflowDetailsPanel } from "./WorkflowDetailsPanel.tsx";
import { WorkflowInvariantsModal } from "./WorkflowInvariantsModal.tsx";
import { WorkflowStatusBar } from "./WorkflowStatusBar.tsx";
import { AlertTriangle, X } from "lucide-react";

function relevantPresetForNode(nodeId: string): string {
  const curated = WORKFLOW_GRAPH.diagrams.find((diagram) => diagram.nodeIds.includes(nodeId));
  if (curated) return curated.id;

  const node = WORKFLOW_GRAPH.nodes.find((candidate) => candidate.id === nodeId);
  return node ? `domain-${node.domain}` : DEFAULT_FILTER.presetId;
}

export default function WorkflowMapRoot() {
  const [filter, setFilter] = useState<WorkflowCanvasFilter>(() => {
    const urlState = parseWorkflowMapUrlState(window.location.search);
    const selectedNodeId = urlState.selectedNodeId ?? DEFAULT_FILTER.selectedNodeId;
    const presetId =
      urlState.presetId ??
      (selectedNodeId ? relevantPresetForNode(selectedNodeId) : DEFAULT_FILTER.presetId);

    return { ...DEFAULT_FILTER, ...urlState, presetId };
  });

  const [invariantsModalOpen, setInvariantsModalOpen] = useState(false);
  const [evidenceModel, setEvidenceModel] = useState<WorkflowMapEvidenceModel | null>(null);
  const [screenshotUrls, setScreenshotUrls] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const screenshotUrlsRef = useRef(screenshotUrls);
  screenshotUrlsRef.current = screenshotUrls;

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      for (const url of Object.values(screenshotUrlsRef.current)) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  // Sync filter changes to URL query state
  useEffect(() => {
    const query = formatWorkflowMapUrlQuery(filter);
    const newUrl = `${window.location.pathname}${query}`;
    window.history.replaceState({}, "", newUrl);
  }, [filter]);

  const handleFilterChange = useCallback((update: Partial<WorkflowCanvasFilter>) => {
    setFilter((prev) => ({ ...prev, ...update }));
  }, []);

  const handleResetFilter = useCallback(() => {
    setFilter((prev) => ({
      ...DEFAULT_FILTER,
      evidenceMode: prev.evidenceMode,
    }));
  }, []);

  const handleSelectNode = useCallback((nodeId: string | null) => {
    setFilter((prev) => ({
      ...prev,
      selectedNodeId: nodeId,
      focusNeighborhood: nodeId ? prev.focusNeighborhood : false,
    }));
  }, []);

  const handleFocusNeighborhood = useCallback((nodeId: string) => {
    setFilter((prev) => ({
      ...prev,
      selectedNodeId: nodeId,
      focusNeighborhood: true,
    }));
  }, []);

  const handleSelectSearchNode = useCallback((nodeId: string) => {
    setFilter((prev) => ({
      ...prev,
      presetId: relevantPresetForNode(nodeId),
      selectedDomains: [],
      selectedNodeTypes: [],
      filterInvariantOnly: false,
      selectedNodeId: nodeId,
      focusNeighborhood: false,
      searchQuery: "",
    }));
  }, []);

  // Evidence handlers
  const handleLoadEvidenceFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const manifest = parseQaManifest(text);
      const model = mapEvidenceToWorkflowGraph(WORKFLOW_GRAPH, manifest);
      setEvidenceModel(model);
      setErrorMessage(null);
      setFilter((prev) => ({
        ...prev,
        evidenceMode: prev.evidenceMode === "off" ? "status" : prev.evidenceMode,
      }));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const handleAttachScreenshots = useCallback((files: FileList | File[]) => {
    const newMap: Record<string, string> = { ...screenshotUrlsRef.current };
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith("image/") || file.name.endsWith(".png")) {
        const url = URL.createObjectURL(file);
        // Map by filename (e.g. "scenario-id.png")
        newMap[file.name] = url;
        // Map by relative artifact path (e.g. "screenshots/scenario-id.png")
        newMap[`screenshots/${file.name}`] = url;
        // Map by base scenarioId without .png
        const baseName = file.name.replace(/\.png$/i, "");
        newMap[baseName] = url;
      }
    }
    setScreenshotUrls(newMap);
  }, []);

  const handleClearEvidence = useCallback(() => {
    for (const url of Object.values(screenshotUrlsRef.current)) {
      URL.revokeObjectURL(url);
    }
    setScreenshotUrls({});
    setEvidenceModel(null);
    setErrorMessage(null);
    setFilter((prev) => ({
      ...prev,
      evidenceMode: "off",
    }));
  }, []);

  const handleFocusFailures = useCallback(() => {
    if (!evidenceModel || evidenceModel.summary.failCount === 0) return;
    const firstFailId = evidenceModel.summary.failureNodeIds[0];
    const targetPreset = relevantPresetForNode(firstFailId);

    setFilter((prev) => ({
      ...prev,
      presetId: targetPreset,
      selectedDomains: [],
      selectedNodeTypes: [],
      selectedNodeId: firstFailId,
      evidenceMode: "failures",
      focusNeighborhood: false,
    }));
  }, [evidenceModel]);

  // Compute visible counts for status bar
  const { visibleNodes, visibleNodeCount, visibleEdgeCount } = useMemo(() => {
    const { nodes, edges } = filterGraph(WORKFLOW_GRAPH, filter);
    return { visibleNodes: nodes, visibleNodeCount: nodes.length, visibleEdgeCount: edges.length };
  }, [filter]);

  const visibleNodeIds = useMemo(() => visibleNodes.map((n) => n.id), [visibleNodes]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-100 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Error Alert Banner (if manifest parsing fails) */}
      {errorMessage && (
        <div className="z-50 flex items-center justify-between bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-md">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-white" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="rounded p-1 hover:bg-rose-700"
            title="Dismiss error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Top Toolbar */}
      <WorkflowToolbar
        graph={WORKFLOW_GRAPH}
        filter={filter}
        evidenceModel={evidenceModel}
        onFilterChange={handleFilterChange}
        onResetFilter={handleResetFilter}
        onOpenInvariantsModal={() => setInvariantsModalOpen(true)}
        onSelectSearchNode={handleSelectSearchNode}
        onLoadEvidenceFile={handleLoadEvidenceFile}
        onAttachScreenshots={handleAttachScreenshots}
        onClearEvidence={handleClearEvidence}
        onFocusFailures={handleFocusFailures}
      />

      {/* Main Workspace: Canvas + Slide-in Details Drawer */}
      <main className="relative flex-1 overflow-hidden">
        <WorkflowCanvas
          graph={WORKFLOW_GRAPH}
          filter={filter}
          evidenceModel={evidenceModel}
          onSelectNode={handleSelectNode}
          onFocusNeighborhood={handleFocusNeighborhood}
        />

        {/* Node Details Slide-in Panel */}
        <WorkflowDetailsPanel
          graph={WORKFLOW_GRAPH}
          selectedNodeId={filter.selectedNodeId}
          evidenceModel={evidenceModel}
          screenshotUrls={screenshotUrls}
          onClose={() => handleSelectNode(null)}
          onSelectNode={handleSelectNode}
          onFocusNeighborhood={handleFocusNeighborhood}
          isNeighborhoodFocused={filter.focusNeighborhood}
        />
      </main>

      {/* Bottom Status Bar */}
      <WorkflowStatusBar
        graph={WORKFLOW_GRAPH}
        visibleNodeCount={visibleNodeCount}
        visibleEdgeCount={visibleEdgeCount}
        filter={filter}
        evidenceModel={evidenceModel}
        visibleNodeIds={visibleNodeIds}
      />

      {/* Invariants Reference Modal */}
      <WorkflowInvariantsModal
        isOpen={invariantsModalOpen}
        invariants={WORKFLOW_GRAPH.invariants}
        onClose={() => setInvariantsModalOpen(false)}
      />
    </div>
  );
}
