import dagre from "dagre";
import type { Edge, Node } from "@xyflow/react";
import { WORKFLOW_GRAPH } from "../../scripts/workflow-map/graph.ts";
import type {
  WorkflowDomain,
  WorkflowEdge,
  WorkflowEdgeKind,
  WorkflowGraph,
  WorkflowInvariant,
  WorkflowNode,
  WorkflowNodeType,
} from "../../scripts/workflow-map/types.ts";
import type {
  DomainVisualMeta,
  EdgeKindVisualMeta,
  NodeDetailViewData,
  NodeNeighborhood,
  NodeTypeVisualMeta,
  WorkflowCanvasFilter,
  WorkflowCanvasPreset,
  WorkflowCustomEdgeData,
  WorkflowCustomNodeData,
  WorkflowEvidenceMode,
  Writable,
} from "./workflowCanvasTypes.ts";
import type { WorkflowMapEvidenceModel } from "../../scripts/workflow-map/evidence.ts";

export const DOMAIN_META: Record<WorkflowDomain, DomainVisualMeta> = {
  "platform-tenancy": {
    id: "platform-tenancy",
    label: "Platform / Tenancy",
    description: "Multi-tenant routing, company boundaries, and application lifecycle",
    colorBg: "bg-slate-50 dark:bg-slate-900/60",
    colorBorder: "border-slate-300 dark:border-slate-700",
    colorText: "text-slate-700 dark:text-slate-200",
    colorBadge: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
    colorDot: "bg-slate-500",
    colorRing: "ring-slate-400",
  },
  dashboard: {
    id: "dashboard",
    label: "Dashboard",
    description: "Operational executive overview and high-level cross-domain rollup",
    colorBg: "bg-sky-50 dark:bg-sky-950/40",
    colorBorder: "border-sky-300 dark:border-sky-800",
    colorText: "text-sky-800 dark:text-sky-200",
    colorBadge: "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-900/60 dark:text-sky-300 dark:border-sky-700",
    colorDot: "bg-sky-500",
    colorRing: "ring-sky-400",
  },
  projects: {
    id: "projects",
    label: "Projects",
    description: "Project directory, workspaces, aggregated costs, and subview navigation",
    colorBg: "bg-indigo-50 dark:bg-indigo-950/40",
    colorBorder: "border-indigo-300 dark:border-indigo-800",
    colorText: "text-indigo-800 dark:text-indigo-200",
    colorBadge: "bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/60 dark:text-indigo-300 dark:border-indigo-700",
    colorDot: "bg-indigo-500",
    colorRing: "ring-indigo-400",
  },
  engineering: {
    id: "engineering",
    label: "Engineering",
    description: "Documents, blueprint viewer, RFIs, Submittals, and Daily Site Logs",
    colorBg: "bg-violet-50 dark:bg-violet-950/40",
    colorBorder: "border-violet-300 dark:border-violet-800",
    colorText: "text-violet-800 dark:text-violet-200",
    colorBadge: "bg-violet-100 text-violet-800 border-violet-300 dark:bg-violet-900/60 dark:text-violet-300 dark:border-violet-700",
    colorDot: "bg-violet-500",
    colorRing: "ring-violet-400",
  },
  finance: {
    id: "finance",
    label: "Finance",
    description: "Invoice extraction, review, payable obligations, cash banking, and settlements",
    colorBg: "bg-emerald-50 dark:bg-emerald-950/40",
    colorBorder: "border-emerald-300 dark:border-emerald-800",
    colorText: "text-emerald-800 dark:text-emerald-200",
    colorBadge: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/60 dark:text-emerald-300 dark:border-emerald-700",
    colorDot: "bg-emerald-500",
    colorRing: "ring-emerald-400",
  },
  workforce: {
    id: "workforce",
    label: "Workforce",
    description: "Worker directory, compensation, attendance, and payroll calculation lifecycle",
    colorBg: "bg-amber-50 dark:bg-amber-950/40",
    colorBorder: "border-amber-300 dark:border-amber-800",
    colorText: "text-amber-800 dark:text-amber-200",
    colorBadge: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/60 dark:text-amber-300 dark:border-amber-700",
    colorDot: "bg-amber-500",
    colorRing: "ring-amber-400",
  },
  reporting: {
    id: "reporting",
    label: "Reporting",
    description: "Derived reporting views and non-authoritative operational summaries",
    colorBg: "bg-teal-50 dark:bg-teal-950/40",
    colorBorder: "border-teal-300 dark:border-teal-800",
    colorText: "text-teal-800 dark:text-teal-200",
    colorBadge: "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-900/60 dark:text-teal-300 dark:border-teal-700",
    colorDot: "bg-teal-500",
    colorRing: "ring-teal-400",
  },
  assistant: {
    id: "assistant",
    label: "Assistant",
    description: "Guarded AI actions: PREPARE → Validate → Human Confirm → Execute",
    colorBg: "bg-rose-50 dark:bg-rose-950/40",
    colorBorder: "border-rose-300 dark:border-rose-800",
    colorText: "text-rose-800 dark:text-rose-200",
    colorBadge: "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-900/60 dark:text-rose-300 dark:border-rose-700",
    colorDot: "bg-rose-500",
    colorRing: "ring-rose-400",
  },
};

export const NODE_TYPE_META: Record<WorkflowNodeType, NodeTypeVisualMeta> = {
  route: {
    id: "route",
    label: "Route",
    description: "URL-addressable page or subview path",
    colorBg: "bg-blue-100 dark:bg-blue-900/50",
    colorText: "text-blue-700 dark:text-blue-300",
    colorBorder: "border-blue-300 dark:border-blue-700",
    iconName: "Compass",
  },
  screen: {
    id: "screen",
    label: "Screen",
    description: "Interactive visual UI workspace or register",
    colorBg: "bg-indigo-100 dark:bg-indigo-900/50",
    colorText: "text-indigo-700 dark:text-indigo-300",
    colorBorder: "border-indigo-300 dark:border-indigo-700",
    iconName: "Monitor",
  },
  workflow: {
    id: "workflow",
    label: "Workflow",
    description: "Multi-step business process or orchestrator",
    colorBg: "bg-purple-100 dark:bg-purple-900/50",
    colorText: "text-purple-700 dark:text-purple-300",
    colorBorder: "border-purple-300 dark:border-purple-700",
    iconName: "GitMerge",
  },
  state: {
    id: "state",
    label: "State",
    description: "Discrete lifecycle state in a domain entity",
    colorBg: "bg-emerald-100 dark:bg-emerald-900/50",
    colorText: "text-emerald-700 dark:text-emerald-300",
    colorBorder: "border-emerald-300 dark:border-emerald-700",
    iconName: "CircleDot",
  },
  action: {
    id: "action",
    label: "Action",
    description: "User or system action triggering state changes",
    colorBg: "bg-amber-100 dark:bg-amber-900/50",
    colorText: "text-amber-700 dark:text-amber-300",
    colorBorder: "border-amber-300 dark:border-amber-700",
    iconName: "Zap",
  },
  data: {
    id: "data",
    label: "Data",
    description: "Authoritative persisted repository / database data",
    colorBg: "bg-cyan-100 dark:bg-cyan-900/50",
    colorText: "text-cyan-700 dark:text-cyan-300",
    colorBorder: "border-cyan-300 dark:border-cyan-700",
    iconName: "Database",
  },
  "derived-data": {
    id: "derived-data",
    label: "Derived",
    description: "Computed, aggregated, or non-authoritative read model",
    colorBg: "bg-teal-100 dark:bg-teal-900/50",
    colorText: "text-teal-700 dark:text-teal-300",
    colorBorder: "border-teal-300 dark:border-teal-700",
    iconName: "BarChart3",
  },
  guard: {
    id: "guard",
    label: "Guard",
    description: "Safety check, confirmation gate, or validation barrier",
    colorBg: "bg-orange-100 dark:bg-orange-900/50",
    colorText: "text-orange-700 dark:text-orange-300",
    colorBorder: "border-orange-300 dark:border-orange-700",
    iconName: "ShieldAlert",
  },
  "external-boundary": {
    id: "external-boundary",
    label: "Boundary",
    description: "External system, AI model, or storage boundary",
    colorBg: "bg-rose-100 dark:bg-rose-900/50",
    colorText: "text-rose-700 dark:text-rose-300",
    colorBorder: "border-rose-300 dark:border-rose-700",
    iconName: "Lock",
  },
};

export const EDGE_KIND_META: Record<WorkflowEdgeKind, EdgeKindVisualMeta> = {
  guard: {
    id: "guard",
    label: "Guard / Validation",
    color: "#f59e0b",
    strokeDasharray: "5 5",
    isDashed: true,
  },
  confirmation: {
    id: "confirmation",
    label: "Human Confirmation Gate",
    color: "#ea580c",
    strokeDasharray: "6 4",
    isDashed: true,
  },
  permission: {
    id: "permission",
    label: "Permission Check",
    color: "#d97706",
    strokeDasharray: "4 4",
    isDashed: true,
  },
  mutation: {
    id: "mutation",
    label: "State Mutation / Write",
    color: "#4f46e5",
    isDashed: false,
  },
  "state-transition": {
    id: "state-transition",
    label: "Lifecycle State Transition",
    color: "#0284c7",
    isDashed: false,
  },
  "derived-data": {
    id: "derived-data",
    label: "Derived Data Flow",
    color: "#0d9488",
    strokeDasharray: "3 3",
    isDashed: true,
  },
  "read-flow": {
    id: "read-flow",
    label: "Read / Query Flow",
    color: "#0369a1",
    isDashed: false,
  },
  navigation: {
    id: "navigation",
    label: "User Navigation",
    color: "#64748b",
    isDashed: false,
  },
  separation: {
    id: "separation",
    label: "Architectural Separation",
    color: "#e11d48",
    strokeDasharray: "6 6",
    isDashed: true,
  },
  "external-boundary": {
    id: "external-boundary",
    label: "External / Auth Boundary",
    color: "#9333ea",
    strokeDasharray: "5 5",
    isDashed: true,
  },
  history: {
    id: "history",
    label: "Immutable History / Audit",
    color: "#475569",
    strokeDasharray: "2 2",
    isDashed: true,
  },
  context: {
    id: "context",
    label: "Scope / Context",
    color: "#94a3b8",
    isDashed: false,
  },
};

export const ALL_DOMAINS: readonly WorkflowDomain[] = [
  "platform-tenancy",
  "dashboard",
  "projects",
  "engineering",
  "finance",
  "workforce",
  "reporting",
  "assistant",
];

export const ALL_NODE_TYPES: readonly WorkflowNodeType[] = [
  "route",
  "screen",
  "workflow",
  "state",
  "action",
  "data",
  "derived-data",
  "guard",
  "external-boundary",
];

export function getCanvasPresets(graph: WorkflowGraph = WORKFLOW_GRAPH): readonly WorkflowCanvasPreset[] {
  const curated: WorkflowCanvasPreset[] = graph.diagrams.map((d) => ({
    id: d.id,
    title: d.title,
    description: d.description,
    category: "curated",
    nodeIds: d.nodeIds,
  }));

  const domains: WorkflowCanvasPreset[] = ALL_DOMAINS.map((domain) => {
    const meta = DOMAIN_META[domain];
    const nodeIds = graph.nodes.filter((n) => n.domain === domain).map((n) => n.id);
    return {
      id: `domain-${domain}`,
      title: `${meta.label} Domain`,
      description: meta.description,
      category: "domain",
      domain,
      nodeIds,
    };
  });

  const allPreset: WorkflowCanvasPreset = {
    id: "all",
    title: "All Nodes (Complete Architecture)",
    description: `Full platform graph containing all ${graph.nodes.length} nodes and ${graph.edges.length} edges across all domains`,
    category: "all",
  };

  return [...curated, ...domains, allPreset];
}

export const DEFAULT_FILTER: WorkflowCanvasFilter = {
  presetId: "overview",
  selectedDomains: [],
  selectedNodeTypes: [],
  searchQuery: "",
  selectedNodeId: null,
  focusNeighborhood: false,
  neighborhoodHops: 1,
  filterInvariantOnly: false,
  evidenceMode: "off",
};

export function computeNeighborhood(
  graph: WorkflowGraph,
  selectedNodeId: string,
  hops: 1 | 2 = 1,
): NodeNeighborhood {
  const directIncoming = new Set<string>();
  const directOutgoing = new Set<string>();
  const incidentEdges = new Set<string>();
  const neighbors = new Set<string>([selectedNodeId]);

  for (const edge of graph.edges) {
    if (edge.target === selectedNodeId) {
      directIncoming.add(edge.source);
      neighbors.add(edge.source);
      incidentEdges.add(edge.id);
    }
    if (edge.source === selectedNodeId) {
      directOutgoing.add(edge.target);
      neighbors.add(edge.target);
      incidentEdges.add(edge.id);
    }
  }

  if (hops === 2) {
    const hop1Nodes = Array.from(neighbors);
    for (const h1Id of hop1Nodes) {
      for (const edge of graph.edges) {
        if (edge.target === h1Id || edge.source === h1Id) {
          neighbors.add(edge.source);
          neighbors.add(edge.target);
          incidentEdges.add(edge.id);
        }
      }
    }
  }

  return {
    selectedNodeId,
    directIncomingNodeIds: directIncoming,
    directOutgoingNodeIds: directOutgoing,
    neighborNodeIds: neighbors,
    incidentEdgeIds: incidentEdges,
  };
}

export function searchNodes(
  nodes: readonly WorkflowNode[],
  query: string,
): readonly WorkflowNode[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return nodes;

  const scoreNode = (node: WorkflowNode): number => {
    let score = 0;
    const labelLower = node.label.toLowerCase();
    const idLower = node.id.toLowerCase();
    const domainLower = node.domain.toLowerCase();
    const descLower = node.description.toLowerCase();
    const routeLower = (node.route?.canonicalPath || "").toLowerCase();
    const statusesLower = (node.statusValues || []).join(" ").toLowerCase();
    const invariantsLower = (node.invariantIds || []).join(" ").toLowerCase();

    if (idLower === normalized) score += 100;
    else if (idLower.startsWith(normalized)) score += 60;
    else if (idLower.includes(normalized)) score += 30;

    if (labelLower === normalized) score += 90;
    else if (labelLower.startsWith(normalized)) score += 50;
    else if (labelLower.includes(normalized)) score += 40;

    if (routeLower.includes(normalized)) score += 45;
    if (domainLower.includes(normalized)) score += 20;
    if (statusesLower.includes(normalized)) score += 25;
    if (invariantsLower.includes(normalized)) score += 35;
    if (descLower.includes(normalized)) score += 15;

    return score;
  };

  return [...nodes]
    .map((node) => ({ node, score: scoreNode(node) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.node);
}

export function filterGraph(
  graph: WorkflowGraph,
  filter: WorkflowCanvasFilter,
): { nodes: readonly WorkflowNode[]; edges: readonly WorkflowEdge[] } {
  let candidateNodeIds: Set<string>;

  if (filter.presetId === "all") {
    candidateNodeIds = new Set(graph.nodes.map((n) => n.id));
  } else if (filter.presetId.startsWith("domain-")) {
    const domain = filter.presetId.replace("domain-", "") as WorkflowDomain;
    candidateNodeIds = new Set(graph.nodes.filter((n) => n.domain === domain).map((n) => n.id));
  } else {
    const diagram = graph.diagrams.find((d) => d.id === filter.presetId);
    if (diagram) {
      candidateNodeIds = new Set(diagram.nodeIds);
    } else {
      // Fallback: if preset matches a domain or default to overview
      const fallbackDiagram = graph.diagrams[0];
      candidateNodeIds = new Set(fallbackDiagram ? fallbackDiagram.nodeIds : graph.nodes.map((n) => n.id));
    }
  }

  // If a node is explicitly selected and focusNeighborhood is ON, restrict candidate set to neighborhood
  if (filter.focusNeighborhood && filter.selectedNodeId) {
    const neighborhood = computeNeighborhood(graph, filter.selectedNodeId, filter.neighborhoodHops);
    candidateNodeIds = new Set(Array.from(neighborhood.neighborNodeIds));
  }

  // If a node is selected from search or deep link, make sure it is included even if outside current preset
  if (filter.selectedNodeId && !candidateNodeIds.has(filter.selectedNodeId)) {
    candidateNodeIds.add(filter.selectedNodeId);
  }

  let nodes = graph.nodes.filter((n) => candidateNodeIds.has(n.id));

  // Apply domain filter
  if (filter.selectedDomains.length > 0) {
    const domainSet = new Set(filter.selectedDomains);
    nodes = nodes.filter((n) => domainSet.has(n.domain) || n.id === filter.selectedNodeId);
  }

  // Apply node type filter
  if (filter.selectedNodeTypes.length > 0) {
    const typeSet = new Set(filter.selectedNodeTypes);
    nodes = nodes.filter((n) => typeSet.has(n.type) || n.id === filter.selectedNodeId);
  }

  // Apply invariant only filter
  if (filter.filterInvariantOnly) {
    nodes = nodes.filter((n) => (n.invariantIds && n.invariantIds.length > 0) || n.id === filter.selectedNodeId);
  }

  const finalNodeIds = new Set(nodes.map((n) => n.id));

  // Include edges whose source and target are both in finalNodeIds
  const edges = graph.edges.filter((e) => finalNodeIds.has(e.source) && finalNodeIds.has(e.target));

  return { nodes, edges };
}

export interface LayoutOptions {
  readonly rankdir?: "LR" | "TB" | "RL" | "BT";
  readonly nodeWidth?: number;
  readonly nodeHeight?: number;
  readonly nodesep?: number;
  readonly ranksep?: number;
}

export function layoutGraph(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
  options: LayoutOptions = {},
): { nodePositions: Map<string, { x: number; y: number }> } {
  const rankdir = options.rankdir || "LR";
  const nodeWidth = options.nodeWidth || 290;
  const nodeHeight = options.nodeHeight || 135;
  const nodesep = options.nodesep || 50;
  const ranksep = options.ranksep || 90;

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir,
    nodesep,
    ranksep,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    g.setNode(n.id, { width: nodeWidth, height: nodeHeight });
  }

  for (const e of edges) {
    g.setEdge(e.source, e.target);
  }

  dagre.layout(g);

  const nodePositions = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    const pos = g.node(n.id);
    if (pos) {
      // dagre returns center coordinates, React Flow expects top-left
      nodePositions.set(n.id, {
        x: Math.round(pos.x - nodeWidth / 2),
        y: Math.round(pos.y - nodeHeight / 2),
      });
    } else {
      nodePositions.set(n.id, { x: 0, y: 0 });
    }
  }

  return { nodePositions };
}

export function buildReactFlowElements(
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
  graph: WorkflowGraph,
  filter: WorkflowCanvasFilter,
  handlers: {
    onSelectNode: (nodeId: string) => void;
    onFocusNeighborhood: (nodeId: string) => void;
  },
  positions: Map<string, { x: number; y: number }>,
  evidenceModel?: WorkflowMapEvidenceModel | null,
): { flowNodes: Node<WorkflowCustomNodeData>[]; flowEdges: Edge<WorkflowCustomEdgeData>[] } {
  const invariantsById = new Map(graph.invariants.map((i) => [i.id, i]));

  const incomingCounts = new Map<string, number>();
  const outgoingCounts = new Map<string, number>();
  for (const edge of edges) {
    outgoingCounts.set(edge.source, (outgoingCounts.get(edge.source) || 0) + 1);
    incomingCounts.set(edge.target, (incomingCounts.get(edge.target) || 0) + 1);
  }

  const neighborhood = filter.selectedNodeId
    ? computeNeighborhood(graph, filter.selectedNodeId, filter.neighborhoodHops)
    : null;

  const hasSelection = Boolean(filter.selectedNodeId);

  const flowNodes: Node<WorkflowCustomNodeData>[] = nodes.map((node) => {
    const isSelected = node.id === filter.selectedNodeId;
    const isDirectNeighbor = neighborhood
      ? neighborhood.directIncomingNodeIds.has(node.id) || neighborhood.directOutgoingNodeIds.has(node.id)
      : false;
    const isIncomingNeighbor = neighborhood ? neighborhood.directIncomingNodeIds.has(node.id) : false;
    const isOutgoingNeighbor = neighborhood ? neighborhood.directOutgoingNodeIds.has(node.id) : false;
    
    const nodeEvidence = evidenceModel?.evidenceForNode(node.id);
    
    let isHighlighted = isSelected || isDirectNeighbor;
    let isDimmed = hasSelection && !isHighlighted;

    if (filter.evidenceMode === "failures" && evidenceModel) {
      if (nodeEvidence?.state === "FAIL") {
        isHighlighted = true;
        isDimmed = false;
      } else if (!hasSelection) {
        isDimmed = true;
      }
    }

    const nodeInvariants = (node.invariantIds || [])
      .map((id) => invariantsById.get(id))
      .filter((i): i is WorkflowInvariant => Boolean(i));

    const domainMeta = DOMAIN_META[node.domain] || DOMAIN_META["platform-tenancy"];
    const typeMeta = NODE_TYPE_META[node.type] || NODE_TYPE_META.workflow;

    const pos = positions.get(node.id) || { x: 0, y: 0 };

    return {
      id: node.id,
      type: "workflowNode",
      position: pos,
      data: {
        node,
        domainMeta,
        typeMeta,
        isSelected,
        isHighlighted,
        isDimmed,
        isDirectNeighbor,
        isIncomingNeighbor,
        isOutgoingNeighbor,
        invariants: nodeInvariants,
        incomingCount: incomingCounts.get(node.id) || 0,
        outgoingCount: outgoingCounts.get(node.id) || 0,
        evidence: nodeEvidence,
        evidenceMode: filter.evidenceMode,
        onSelectNode: handlers.onSelectNode,
        onFocusNeighborhood: handlers.onFocusNeighborhood,
      },
    };
  });

  const flowEdges: Edge<WorkflowCustomEdgeData>[] = edges.map((edge) => {
    const isConnectedToSelected = Boolean(
      filter.selectedNodeId && (edge.source === filter.selectedNodeId || edge.target === filter.selectedNodeId),
    );
    const isHighlighted = isConnectedToSelected;
    const isDimmed = hasSelection && !isHighlighted;

    const edgeInvariants = (edge.invariantIds || [])
      .map((id) => invariantsById.get(id))
      .filter((i): i is WorkflowInvariant => Boolean(i));

    const kindMeta = EDGE_KIND_META[edge.kind] || EDGE_KIND_META.context;

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "workflowEdge",
      animated: isConnectedToSelected || edge.kind === "guard" || edge.kind === "confirmation",
      data: {
        edge,
        isSelected: isConnectedToSelected,
        isHighlighted,
        isDimmed,
        kindMeta,
        invariants: edgeInvariants,
      },
    };
  });

  return { flowNodes, flowEdges };
}

export function getNodeDetails(
  graph: WorkflowGraph,
  nodeId: string,
  evidenceModel?: WorkflowMapEvidenceModel | null,
  screenshotUrls?: Record<string, string>,
): NodeDetailViewData | null {
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return null;

  const invariantsById = new Map(graph.invariants.map((i) => [i.id, i]));
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));

  const invariants = (node.invariantIds || [])
    .map((id) => invariantsById.get(id))
    .filter((i): i is WorkflowInvariant => Boolean(i));

  const incomingEdges = graph.edges
    .filter((e) => e.target === nodeId)
    .map((e) => ({ edge: e, sourceNode: nodesById.get(e.source)! }))
    .filter((item) => Boolean(item.sourceNode));

  const outgoingEdges = graph.edges
    .filter((e) => e.source === nodeId)
    .map((e) => ({ edge: e, targetNode: nodesById.get(e.target)! }))
    .filter((item) => Boolean(item.targetNode));

  const domainMeta = DOMAIN_META[node.domain] || DOMAIN_META["platform-tenancy"];
  const typeMeta = NODE_TYPE_META[node.type] || NODE_TYPE_META.workflow;

  return {
    node,
    domainMeta,
    typeMeta,
    invariants,
    incomingEdges,
    outgoingEdges,
    fileRefs: node.fileRefs || [],
    testRefs: node.testRefs || [],
    qaScenarioIds: node.qaScenarioIds || [],
    evidence: evidenceModel?.evidenceForNode(nodeId),
    screenshotUrls,
  };
}

export function parseWorkflowMapUrlState(search = window.location.search): Partial<Writable<WorkflowCanvasFilter>> {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const result: Partial<Writable<WorkflowCanvasFilter>> = {};

  const preset = params.get("preset");
  if (preset) result.presetId = preset;

  const node = params.get("node");
  if (node) result.selectedNodeId = node;

  const domain = params.get("domain");
  if (domain && ALL_DOMAINS.includes(domain as WorkflowDomain)) {
    result.selectedDomains = [domain as WorkflowDomain];
  }

  const query = params.get("q") || params.get("search");
  if (query) result.searchQuery = query;

  const focus = params.get("focus");
  if (focus === "true" || focus === "1") result.focusNeighborhood = true;

  const hops = params.get("hops");
  if (hops === "2") result.neighborhoodHops = 2;

  const evidence = params.get("evidence");
  if (evidence === "status" || evidence === "failures" || evidence === "off") {
    result.evidenceMode = evidence;
  }

  return result;
}

export function formatWorkflowMapUrlQuery(filter: WorkflowCanvasFilter): string {
  const params = new URLSearchParams();

  if (filter.presetId && filter.presetId !== "overview") {
    params.set("preset", filter.presetId);
  }
  if (filter.selectedNodeId) {
    params.set("node", filter.selectedNodeId);
  }
  if (filter.selectedDomains.length === 1) {
    params.set("domain", filter.selectedDomains[0]);
  }
  if (filter.searchQuery.trim()) {
    params.set("q", filter.searchQuery.trim());
  }
  if (filter.focusNeighborhood) {
    params.set("focus", "1");
  }
  if (filter.neighborhoodHops === 2) {
    params.set("hops", "2");
  }
  if (filter.evidenceMode && filter.evidenceMode !== "off") {
    params.set("evidence", filter.evidenceMode);
  }

  const queryStr = params.toString();
  return queryStr ? `?${queryStr}` : "";
}
