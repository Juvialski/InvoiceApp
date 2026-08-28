import React, { useState, useEffect, useCallback, useMemo } from "react";
import { WORKFLOW_GRAPH } from "../../scripts/workflow-map/graph.ts";
import type { WorkflowCanvasFilter } from "./workflowCanvasTypes.ts";
import {
  DEFAULT_FILTER,
  filterGraph,
  formatWorkflowMapUrlQuery,
  parseWorkflowMapUrlState,
} from "./workflowCanvasUtils.ts";
import { WorkflowToolbar } from "./WorkflowToolbar.tsx";
import { WorkflowCanvas } from "./WorkflowCanvas.tsx";
import { WorkflowDetailsPanel } from "./WorkflowDetailsPanel.tsx";
import { WorkflowInvariantsModal } from "./WorkflowInvariantsModal.tsx";
import { WorkflowStatusBar } from "./WorkflowStatusBar.tsx";

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
    setFilter(DEFAULT_FILTER);
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

  // Compute visible counts for status bar
  const { visibleNodeCount, visibleEdgeCount } = useMemo(() => {
    const { nodes, edges } = filterGraph(WORKFLOW_GRAPH, filter);
    return { visibleNodeCount: nodes.length, visibleEdgeCount: edges.length };
  }, [filter]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-100 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Top Toolbar */}
      <WorkflowToolbar
        graph={WORKFLOW_GRAPH}
        filter={filter}
        onFilterChange={handleFilterChange}
        onResetFilter={handleResetFilter}
        onOpenInvariantsModal={() => setInvariantsModalOpen(true)}
        onSelectSearchNode={handleSelectSearchNode}
      />

      {/* Main Workspace: Canvas + Slide-in Details Drawer */}
      <main className="relative flex-1 overflow-hidden">
        <WorkflowCanvas
          graph={WORKFLOW_GRAPH}
          filter={filter}
          onSelectNode={handleSelectNode}
          onFocusNeighborhood={handleFocusNeighborhood}
        />

        {/* Node Details Slide-in Panel */}
        <WorkflowDetailsPanel
          graph={WORKFLOW_GRAPH}
          selectedNodeId={filter.selectedNodeId}
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
