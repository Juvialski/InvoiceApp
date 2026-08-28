import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type NodeMouseHandler,
  type EdgeMouseHandler,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import type { WorkflowGraph } from "../../scripts/workflow-map/types.ts";
import type { WorkflowCanvasFilter } from "./workflowCanvasTypes.ts";
import { WorkflowNodeComponent } from "./WorkflowNodeComponent.tsx";
import { WorkflowEdgeComponent } from "./WorkflowEdgeComponent.tsx";
import {
  buildReactFlowElements,
  filterGraph,
  layoutGraph,
  DOMAIN_META,
} from "./workflowCanvasUtils.ts";

import type { WorkflowMapEvidenceModel } from "../../scripts/workflow-map/evidence.ts";

const nodeTypes = {
  workflowNode: WorkflowNodeComponent,
};

const edgeTypes = {
  workflowEdge: WorkflowEdgeComponent,
};

const defaultEdgeOptions = {
  type: "workflowEdge",
  markerEnd: {
    type: MarkerType.ArrowClosed,
    width: 16,
    height: 16,
    color: "#64748b",
  },
};

interface WorkflowCanvasContentProps {
  readonly graph: WorkflowGraph;
  readonly filter: WorkflowCanvasFilter;
  readonly evidenceModel?: WorkflowMapEvidenceModel | null;
  readonly onSelectNode: (nodeId: string | null) => void;
  readonly onFocusNeighborhood: (nodeId: string) => void;
}

function WorkflowCanvasContent({
  graph,
  filter,
  evidenceModel,
  onSelectNode,
  onFocusNeighborhood,
}: WorkflowCanvasContentProps) {
  const reactFlow = useReactFlow();
  const lastPresetRef = useRef(filter.presetId);

  // 1. Filter nodes and edges based on current filter state
  const { filteredNodes, filteredEdges, positions } = useMemo(() => {
    const { nodes, edges } = filterGraph(graph, filter);
    const { nodePositions } = layoutGraph(nodes, edges, {
      rankdir: "LR",
      nodeWidth: 285,
      nodeHeight: 135,
      nodesep: 50,
      ranksep: 95,
    });
    return { filteredNodes: nodes, filteredEdges: edges, positions: nodePositions };
  }, [graph, filter]);

  // 2. Build React Flow elements
  const { flowNodes: initialNodes, flowEdges: initialEdges } = useMemo(() => {
    return buildReactFlowElements(
      filteredNodes,
      filteredEdges,
      graph,
      filter,
      {
        onSelectNode: (id) => onSelectNode(id),
        onFocusNeighborhood: (id) => onFocusNeighborhood(id),
      },
      positions,
      evidenceModel,
    );
  }, [filteredNodes, filteredEdges, graph, filter, onSelectNode, onFocusNeighborhood, positions, evidenceModel]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Synchronize state when elements change
  useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Auto fit-view on preset change or neighborhood focus
  useEffect(() => {
    const isPresetChange = lastPresetRef.current !== filter.presetId;
    lastPresetRef.current = filter.presetId;

    const timer = setTimeout(() => {
      if (filter.selectedNodeId && !isPresetChange) {
        const targetNode = nodes.find((n) => n.id === filter.selectedNodeId);
        if (targetNode) {
          reactFlow.setCenter(targetNode.position.x + 140, targetNode.position.y + 65, {
            duration: 600,
            zoom: 1.05,
          });
        }
      } else {
        reactFlow.fitView({ padding: 0.15, duration: 500 });
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [filter.presetId, filter.selectedNodeId, filter.focusNeighborhood, nodes, reactFlow]);

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => {
      onSelectNode(node.id);
    },
    [onSelectNode],
  );

  const handlePaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  // MiniMap node color logic
  const minimapNodeColor = useCallback((node: any) => {
    const domain = node.data?.node?.domain;
    switch (domain) {
      case "projects":
        return "#6366f1";
      case "engineering":
        return "#8b5cf6";
      case "finance":
        return "#10b981";
      case "workforce":
        return "#f59e0b";
      case "assistant":
        return "#f43f5e";
      case "reporting":
        return "#14b8a6";
      case "dashboard":
        return "#0ea5e9";
      default:
        return "#64748b";
    }
  }, []);

  return (
    <div className="relative h-full w-full bg-slate-50 dark:bg-slate-950">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        nodesDraggable={true}
        nodesConnectable={false}
        elementsSelectable={true}
        minZoom={0.2}
        maxZoom={2.0}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        className="touch-none"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.2}
          color="#94a3b8"
          className="opacity-40 dark:opacity-20"
        />
        <Controls
          showInteractive={false}
          className="!border-slate-200 !bg-white/90 !shadow-lg !rounded-xl dark:!border-slate-800 dark:!bg-slate-900/90"
        />
        <MiniMap
          nodeColor={minimapNodeColor}
          nodeStrokeWidth={2}
          zoomable
          pannable
          className="!hidden !border-slate-200 !bg-white/90 !shadow-lg !rounded-xl sm:!block dark:!border-slate-800 dark:!bg-slate-900/90"
        />
      </ReactFlow>
    </div>
  );
}

export function WorkflowCanvas(props: WorkflowCanvasContentProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasContent {...props} />
    </ReactFlowProvider>
  );
}
