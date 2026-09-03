export const WORKFLOW_MAP_SCHEMA_VERSION = 1 as const;

export type WorkflowSourceClassification = "code-derived" | "curated" | "mixed";

export type WorkflowDomain =
  | "platform-tenancy"
  | "dashboard"
  | "projects"
  | "procurement"
  | "commercial"
  | "engineering"
  | "finance"
  | "workforce"
  | "reporting"
  | "assistant";

export type WorkflowNodeType =
  | "route"
  | "screen"
  | "workflow"
  | "state"
  | "action"
  | "data"
  | "derived-data"
  | "guard"
  | "external-boundary";

export type WorkflowScope = "global" | "company" | "project" | "company-and-project" | "demo-only";

export type WorkflowConfirmationRequirement = "none" | "human" | "not-applicable";

export interface WorkflowRouteReference {
  readonly routeId?: string;
  readonly canonicalPath: string;
  readonly pathPattern?: string;
  readonly queryKeys?: readonly string[];
  readonly scope?: "production" | "demo" | "production-and-demo";
}

export interface WorkflowNode {
  readonly id: string;
  readonly label: string;
  readonly domain: WorkflowDomain;
  readonly type: WorkflowNodeType;
  readonly description: string;
  readonly sourceClassification: WorkflowSourceClassification;
  readonly scope?: WorkflowScope;
  readonly route?: WorkflowRouteReference;
  readonly fileRefs?: readonly string[];
  readonly testRefs?: readonly string[];
  readonly permissionKeys?: readonly string[];
  readonly statusValues?: readonly string[];
  readonly confirmationRequirement?: WorkflowConfirmationRequirement;
  readonly invariantIds?: readonly string[];
  readonly qaScenarioIds?: readonly string[];
  readonly tags?: readonly string[];
}

export type WorkflowEdgeType =
  | "contains"
  | "routes-to"
  | "opens"
  | "reads"
  | "writes"
  | "derives"
  | "transitions"
  | "guards"
  | "requires-permission"
  | "requires-confirmation"
  | "executes-through"
  | "links-to"
  | "feeds"
  | "preserves"
  | "separates"
  | "external";

export type WorkflowEdgeKind =
  | "context"
  | "navigation"
  | "read-flow"
  | "mutation"
  | "derived-data"
  | "state-transition"
  | "guard"
  | "permission"
  | "confirmation"
  | "external-boundary"
  | "history"
  | "separation";

export interface WorkflowEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly type: WorkflowEdgeType;
  readonly kind: WorkflowEdgeKind;
  readonly label: string;
  readonly condition?: string;
  readonly permissionKeys?: readonly string[];
  readonly confirmationRequirement?: WorkflowConfirmationRequirement;
  readonly invariantIds?: readonly string[];
  readonly testRefs?: readonly string[];
}

export interface WorkflowInvariant {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly sourceClassification: WorkflowSourceClassification;
  readonly fileRefs: readonly string[];
  readonly testRefs?: readonly string[];
}

export interface WorkflowDiagram {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly nodeIds: readonly string[];
}

export interface WorkflowExplorationInput {
  readonly tool: string;
  readonly accessed: boolean;
  readonly role: string;
  readonly usefulFindings: readonly string[];
  readonly corrections: readonly string[];
}

export interface WorkflowGraph {
  readonly schemaVersion: typeof WORKFLOW_MAP_SCHEMA_VERSION;
  readonly graphId: string;
  readonly version: string;
  readonly product: string;
  readonly purpose: string;
  readonly canonicalSource: string;
  readonly sourceClassification: WorkflowSourceClassification;
  readonly reviewedCommitSha?: string;
  readonly reviewedAt?: string;
  readonly phaseTags: readonly string[];
  readonly explorationInputs?: readonly WorkflowExplorationInput[];
  readonly invariants: readonly WorkflowInvariant[];
  readonly nodes: readonly WorkflowNode[];
  readonly edges: readonly WorkflowEdge[];
  readonly diagrams: readonly WorkflowDiagram[];
}
