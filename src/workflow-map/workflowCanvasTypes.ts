import type {
  WorkflowDomain,
  WorkflowEdge,
  WorkflowEdgeKind,
  WorkflowInvariant,
  WorkflowNode,
  WorkflowNodeType,
} from "../../scripts/workflow-map/types.ts";
import type {
  WorkflowNodeEvidence,
  WorkflowNodeEvidenceState,
} from "../../scripts/workflow-map/evidence.ts";

export type Writable<T> = {
  -readonly [P in keyof T]: T[P];
};

export type WorkflowEvidenceMode = "off" | "status" | "failures";

export interface WorkflowCanvasPreset {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly category: "curated" | "domain" | "all";
  readonly nodeIds?: readonly string[];
  readonly domain?: WorkflowDomain;
}

export interface WorkflowCanvasFilter {
  readonly presetId: string;
  readonly selectedDomains: readonly WorkflowDomain[];
  readonly selectedNodeTypes: readonly WorkflowNodeType[];
  readonly searchQuery: string;
  readonly selectedNodeId: string | null;
  readonly focusNeighborhood: boolean;
  readonly neighborhoodHops: 1 | 2;
  readonly filterInvariantOnly: boolean;
  readonly evidenceMode: WorkflowEvidenceMode;
}

export interface DomainVisualMeta {
  readonly id: WorkflowDomain;
  readonly label: string;
  readonly description: string;
  readonly colorBg: string;
  readonly colorBorder: string;
  readonly colorText: string;
  readonly colorBadge: string;
  readonly colorDot: string;
  readonly colorRing: string;
}

export interface NodeTypeVisualMeta {
  readonly id: WorkflowNodeType;
  readonly label: string;
  readonly description: string;
  readonly colorBg: string;
  readonly colorText: string;
  readonly colorBorder: string;
  readonly iconName: string;
}

export interface EdgeKindVisualMeta {
  readonly id: WorkflowEdgeKind;
  readonly label: string;
  readonly color: string;
  readonly strokeDasharray?: string;
  readonly isDashed: boolean;
}

export interface WorkflowCustomNodeData {
  [key: string]: unknown;
  readonly node: WorkflowNode;
  readonly domainMeta: DomainVisualMeta;
  readonly typeMeta: NodeTypeVisualMeta;
  readonly isSelected: boolean;
  readonly isHighlighted: boolean;
  readonly isDimmed: boolean;
  readonly isDirectNeighbor: boolean;
  readonly isIncomingNeighbor: boolean;
  readonly isOutgoingNeighbor: boolean;
  readonly invariants: readonly WorkflowInvariant[];
  readonly incomingCount: number;
  readonly outgoingCount: number;
  readonly evidence?: WorkflowNodeEvidence;
  readonly evidenceMode: WorkflowEvidenceMode;
  readonly onSelectNode: (nodeId: string) => void;
  readonly onFocusNeighborhood: (nodeId: string) => void;
}

export interface WorkflowCustomEdgeData {
  [key: string]: unknown;
  readonly edge: WorkflowEdge;
  readonly isSelected: boolean;
  readonly isHighlighted: boolean;
  readonly isDimmed: boolean;
  readonly kindMeta: EdgeKindVisualMeta;
  readonly invariants: readonly WorkflowInvariant[];
}

export interface NodeNeighborhood {
  readonly selectedNodeId: string;
  readonly directIncomingNodeIds: ReadonlySet<string>;
  readonly directOutgoingNodeIds: ReadonlySet<string>;
  readonly neighborNodeIds: ReadonlySet<string>;
  readonly incidentEdgeIds: ReadonlySet<string>;
}

export interface NodeDetailViewData {
  readonly node: WorkflowNode;
  readonly domainMeta: DomainVisualMeta;
  readonly typeMeta: NodeTypeVisualMeta;
  readonly invariants: readonly WorkflowInvariant[];
  readonly incomingEdges: readonly { readonly edge: WorkflowEdge; readonly sourceNode: WorkflowNode }[];
  readonly outgoingEdges: readonly { readonly edge: WorkflowEdge; readonly targetNode: WorkflowNode }[];
  readonly fileRefs: readonly string[];
  readonly testRefs: readonly string[];
  readonly qaScenarioIds: readonly string[];
  readonly evidence?: WorkflowNodeEvidence;
  readonly screenshotUrls?: Record<string, string>;
}
