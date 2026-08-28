import type { WorkflowGraph, WorkflowNode } from "./types.ts";
import {
  QA_EVIDENCE_SCHEMA_VERSION,
  type QaConsoleError,
  type QaFailedRequest,
  type QaNavigationResult,
  type QaOverflowResult,
  type QaPageError,
  type QaRoute,
  type QaRunArtifacts,
  type QaRunManifest,
  type QaRunMetadata,
  type QaRunSummary,
  type QaScenarioEvidence,
  type QaScenarioStatus,
  type QaViewport,
} from "../qa/structuredEvidence.ts";

export const WORKFLOW_MAP_EVIDENCE_SCHEMA_VERSION = 1 as const;
export const MAX_MANIFEST_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB limit

export type WorkflowNodeEvidenceState = "UNMAPPED" | "NOT_RUN" | "PARTIAL" | "PASS" | "FAIL";

export interface WorkflowNodeEvidence {
  readonly nodeId: string;
  readonly state: WorkflowNodeEvidenceState;
  readonly mappedScenarioIds: readonly string[];
  readonly presentScenarioIds: readonly string[];
  readonly missingScenarioIds: readonly string[];
  readonly failedScenarioIds: readonly string[];
  readonly scenarios: readonly QaScenarioEvidence[];
  readonly failureReasons: readonly string[];
  readonly testedViewports: readonly string[];
}

export interface WorkflowEvidenceSummary {
  readonly totalNodes: number;
  readonly mappedNodes: number;
  readonly passCount: number;
  readonly failCount: number;
  readonly partialCount: number;
  readonly notRunCount: number;
  readonly unmappedCount: number;
  readonly runtimeScenariosCount: number;
  readonly unmappedRuntimeScenariosCount: number;
  readonly unmappedScenarioIds: readonly string[];
  readonly failureNodeIds: readonly string[];
}

export interface VisibleEvidenceSummary {
  readonly visibleTotal: number;
  readonly visibleMapped: number;
  readonly visiblePass: number;
  readonly visibleFail: number;
  readonly visiblePartial: number;
  readonly visibleNotRun: number;
  readonly visibleUnmapped: number;
}

export interface WorkflowNodeEvidenceSummaryEntry {
  readonly nodeId: string;
  readonly state: WorkflowNodeEvidenceState;
  readonly mappedScenarioIds: readonly string[];
  readonly presentScenarioIds: readonly string[];
  readonly missingScenarioIds: readonly string[];
  readonly failedScenarioIds: readonly string[];
  readonly failureReasons: readonly string[];
  readonly testedViewports: readonly string[];
  readonly screenshots: readonly string[];
}

export interface WorkflowMapDerivedEvidence {
  readonly schemaVersion: typeof WORKFLOW_MAP_EVIDENCE_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly graph: {
    readonly schemaVersion: number;
    readonly version: string;
    readonly product: string;
    readonly totalNodes: number;
    readonly totalEdges: number;
    readonly mappedNodes: number;
  };
  readonly manifest: {
    readonly schemaVersion: number;
    readonly run: QaRunMetadata;
    readonly summary: QaRunSummary;
  };
  readonly summary: WorkflowEvidenceSummary;
  readonly nodes: readonly WorkflowNodeEvidenceSummaryEntry[];
}

export interface WorkflowMapEvidenceModel {
  readonly manifest: QaRunManifest;
  readonly provenance: QaRunMetadata;
  readonly nodesById: ReadonlyMap<string, WorkflowNodeEvidence>;
  readonly summary: WorkflowEvidenceSummary;
  readonly failureNodes: readonly WorkflowNodeEvidence[];
  readonly unmappedScenarioIds: readonly string[];
  evidenceForNode(nodeId: string): WorkflowNodeEvidence;
  visibleSummary(visibleNodeIds: ReadonlySet<string> | readonly string[]): VisibleEvidenceSummary;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeRelativePath(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const raw = value.trim().replaceAll("\\", "/");
  if (!raw || raw.startsWith("/") || raw.startsWith("//") || /^[A-Za-z]:\//.test(raw)) return false;
  const parts = raw.split("/");
  for (const part of parts) {
    if (part === "..") return false;
  }
  return true;
}

/**
 * Validates and parses a raw QA evidence manifest object or JSON string.
 * Enforces schema version, object shapes, array types, and safe paths.
 */
export function parseQaManifest(input: string | unknown, maxSizeBytes = MAX_MANIFEST_SIZE_BYTES): QaRunManifest {
  let rawObj: unknown = input;

  if (typeof input === "string") {
    const byteLength = new TextEncoder().encode(input).length;
    if (byteLength > maxSizeBytes) {
      throw new Error(`Manifest size (${(byteLength / 1024 / 1024).toFixed(2)} MB) exceeds maximum allowed size of ${(maxSizeBytes / 1024 / 1024).toFixed(2)} MB.`);
    }
    try {
      rawObj = JSON.parse(input);
    } catch (err) {
      throw new Error(`Malformed QA manifest JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!isPlainObject(rawObj)) {
    throw new Error("Invalid QA manifest: top-level value must be a JSON object.");
  }

  if (rawObj.schemaVersion !== QA_EVIDENCE_SCHEMA_VERSION) {
    throw new Error(`Unsupported QA manifest schema version: expected ${QA_EVIDENCE_SCHEMA_VERSION}, received ${String(rawObj.schemaVersion)}.`);
  }

  // Validate run metadata
  if (!isPlainObject(rawObj.run)) {
    throw new Error("Invalid QA manifest: missing or invalid 'run' metadata object.");
  }
  const run = rawObj.run;
  if (typeof run.commitSha !== "string" || !run.commitSha.trim()) {
    throw new Error("Invalid QA manifest: run.commitSha must be a non-empty string.");
  }
  if (typeof run.branch !== "string" || !run.branch.trim()) {
    throw new Error("Invalid QA manifest: run.branch must be a non-empty string.");
  }
  if (typeof run.timestamp !== "string" || !run.timestamp.trim()) {
    throw new Error("Invalid QA manifest: run.timestamp must be a non-empty ISO date string.");
  }
  if (typeof run.trigger !== "string" || !run.trigger.trim()) {
    throw new Error("Invalid QA manifest: run.trigger must be a non-empty string.");
  }
  if (run.appMode !== "demo") {
    throw new Error(`Invalid QA manifest: run.appMode must be 'demo', received '${String(run.appMode)}'.`);
  }

  // Validate summary
  if (!isPlainObject(rawObj.summary)) {
    throw new Error("Invalid QA manifest: missing or invalid 'summary' object.");
  }
  const summary = rawObj.summary;
  const summaryKeys = [
    "routesTested",
    "viewportsTested",
    "interactionScenarios",
    "screenshotsCaptured",
    "consoleErrors",
    "pageErrors",
    "failedRequests",
    "overflowFailures",
    "failedScenarios",
    "navigationFailures",
    "ignoredConsoleErrors",
    "ignoredFailedRequests",
  ] as const;
  for (const key of summaryKeys) {
    if (typeof summary[key] !== "number" || !Number.isFinite(summary[key])) {
      throw new Error(`Invalid QA manifest: summary.${key} must be a finite number.`);
    }
  }

  // Validate artifacts
  if (!isPlainObject(rawObj.artifacts)) {
    throw new Error("Invalid QA manifest: missing or invalid 'artifacts' object.");
  }
  const artifacts = rawObj.artifacts;
  if (!isSafeRelativePath(artifacts.manifestPath)) {
    throw new Error("Invalid QA manifest: artifacts.manifestPath must be a safe relative path.");
  }
  if (!isSafeRelativePath(artifacts.screenshotsDirectory)) {
    throw new Error("Invalid QA manifest: artifacts.screenshotsDirectory must be a safe relative path.");
  }
  if (!isSafeRelativePath(artifacts.logPath)) {
    throw new Error("Invalid QA manifest: artifacts.logPath must be a safe relative path.");
  }

  // Validate scenarios
  if (!Array.isArray(rawObj.scenarios)) {
    throw new Error("Invalid QA manifest: 'scenarios' must be an array.");
  }

  const validatedScenarios: QaScenarioEvidence[] = [];
  const seenScenarioIds = new Set<string>();

  for (let idx = 0; idx < rawObj.scenarios.length; idx++) {
    const sc = rawObj.scenarios[idx];
    if (!isPlainObject(sc)) {
      throw new Error(`Invalid QA manifest: scenario at index ${idx} must be an object.`);
    }

    if (typeof sc.scenarioId !== "string" || !sc.scenarioId.trim()) {
      throw new Error(`Invalid QA manifest: scenario at index ${idx} missing scenarioId.`);
    }
    if (seenScenarioIds.has(sc.scenarioId)) {
      throw new Error(`Invalid QA manifest: duplicate scenarioId '${sc.scenarioId}' at index ${idx}.`);
    }
    seenScenarioIds.add(sc.scenarioId);

    if (typeof sc.feature !== "string" || !sc.feature.trim()) {
      throw new Error(`Invalid QA manifest: scenario '${sc.scenarioId}' missing feature.`);
    }

    if (!isPlainObject(sc.route) || typeof sc.route.id !== "string" || typeof sc.route.canonicalPath !== "string") {
      throw new Error(`Invalid QA manifest: scenario '${sc.scenarioId}' missing valid route object.`);
    }

    if (typeof sc.requestedPath !== "string") {
      throw new Error(`Invalid QA manifest: scenario '${sc.scenarioId}' missing requestedPath.`);
    }

    if (typeof sc.interactionState !== "string") {
      throw new Error(`Invalid QA manifest: scenario '${sc.scenarioId}' missing interactionState.`);
    }

    if (
      !isPlainObject(sc.viewport) ||
      typeof sc.viewport.name !== "string" ||
      typeof sc.viewport.width !== "number" ||
      typeof sc.viewport.height !== "number"
    ) {
      throw new Error(`Invalid QA manifest: scenario '${sc.scenarioId}' missing valid viewport.`);
    }

    if (sc.status !== "PASS" && sc.status !== "FAIL") {
      throw new Error(`Invalid QA manifest: scenario '${sc.scenarioId}' status must be 'PASS' or 'FAIL', received '${String(sc.status)}'.`);
    }

    if (!Array.isArray(sc.failureReasons)) {
      throw new Error(`Invalid QA manifest: scenario '${sc.scenarioId}' failureReasons must be an array.`);
    }

    if (sc.screenshotPath !== null && typeof sc.screenshotPath !== "undefined" && !isSafeRelativePath(sc.screenshotPath)) {
      throw new Error(`Invalid QA manifest: scenario '${sc.scenarioId}' screenshotPath must be null or a safe relative path.`);
    }

    if (typeof sc.durationMs !== "number" || !Number.isFinite(sc.durationMs)) {
      throw new Error(`Invalid QA manifest: scenario '${sc.scenarioId}' durationMs must be a number.`);
    }

    if (typeof sc.timestamp !== "string") {
      throw new Error(`Invalid QA manifest: scenario '${sc.scenarioId}' timestamp must be a string.`);
    }

    validatedScenarios.push(sc as unknown as QaScenarioEvidence);
  }

  return {
    schemaVersion: QA_EVIDENCE_SCHEMA_VERSION,
    run: rawObj.run as unknown as QaRunMetadata,
    summary: rawObj.summary as unknown as QaRunSummary,
    scenarios: validatedScenarios,
    artifacts: rawObj.artifacts as unknown as QaRunArtifacts,
    ...(typeof rawObj.runError === "string" ? { runError: rawObj.runError } : {}),
  };
}

/**
 * Pure mapping function that correlates a loaded QA-1 manifest with a canonical workflow graph.
 * Does not mutate input graph or manifest.
 */
export function mapEvidenceToWorkflowGraph(
  graph: WorkflowGraph,
  manifest: QaRunManifest,
): WorkflowMapEvidenceModel {
  const scenarioMap = new Map<string, QaScenarioEvidence>();
  for (const sc of manifest.scenarios) {
    scenarioMap.set(sc.scenarioId, sc);
  }

  const allMappedScenarioIdsInGraph = new Set<string>();
  for (const node of graph.nodes) {
    if (node.qaScenarioIds) {
      for (const id of node.qaScenarioIds) {
        allMappedScenarioIdsInGraph.add(id);
      }
    }
  }

  // Find unmapped runtime scenarios (scenarios in manifest that are not mapped by any graph node)
  const unmappedScenarioIds: string[] = [];
  for (const sc of manifest.scenarios) {
    if (!allMappedScenarioIdsInGraph.has(sc.scenarioId)) {
      unmappedScenarioIds.push(sc.scenarioId);
    }
  }
  unmappedScenarioIds.sort();

  const nodesById = new Map<string, WorkflowNodeEvidence>();
  let mappedNodesCount = 0;
  let passCount = 0;
  let failCount = 0;
  let partialCount = 0;
  let notRunCount = 0;
  let unmappedCount = 0;
  const failureNodeIds: string[] = [];

  for (const node of graph.nodes) {
    const mappedIds = node.qaScenarioIds ? [...node.qaScenarioIds] : [];
    
    if (mappedIds.length === 0) {
      unmappedCount++;
      nodesById.set(node.id, {
        nodeId: node.id,
        state: "UNMAPPED",
        mappedScenarioIds: [],
        presentScenarioIds: [],
        missingScenarioIds: [],
        failedScenarioIds: [],
        scenarios: [],
        failureReasons: [],
        testedViewports: [],
      });
      continue;
    }

    mappedNodesCount++;
    const presentScenarios: QaScenarioEvidence[] = [];
    const presentIds: string[] = [];
    const missingIds: string[] = [];
    const failedIds: string[] = [];
    const failureReasonsSet = new Set<string>();
    const testedViewportsSet = new Set<string>();

    for (const scId of mappedIds) {
      const sc = scenarioMap.get(scId);
      if (sc) {
        presentScenarios.push(sc);
        presentIds.push(scId);
        testedViewportsSet.add(sc.viewport.name);
        if (sc.status === "FAIL") {
          failedIds.push(scId);
          for (const reason of sc.failureReasons) {
            failureReasonsSet.add(reason);
          }
        }
      } else {
        missingIds.push(scId);
      }
    }

    let state: WorkflowNodeEvidenceState;
    if (presentScenarios.length === 0) {
      state = "NOT_RUN";
      notRunCount++;
    } else if (failedIds.length > 0) {
      state = "FAIL";
      failCount++;
      failureNodeIds.push(node.id);
    } else if (missingIds.length > 0) {
      state = "PARTIAL";
      partialCount++;
    } else {
      state = "PASS";
      passCount++;
    }

    const failureReasons = Array.from(failureReasonsSet).sort();
    const testedViewports = Array.from(testedViewportsSet).sort();

    nodesById.set(node.id, {
      nodeId: node.id,
      state,
      mappedScenarioIds: mappedIds.sort(),
      presentScenarioIds: presentIds.sort(),
      missingScenarioIds: missingIds.sort(),
      failedScenarioIds: failedIds.sort(),
      scenarios: presentScenarios,
      failureReasons,
      testedViewports,
    });
  }

  failureNodeIds.sort();

  const failureNodes: WorkflowNodeEvidence[] = failureNodeIds
    .map((id) => nodesById.get(id))
    .filter((n): n is WorkflowNodeEvidence => Boolean(n));

  const summary: WorkflowEvidenceSummary = {
    totalNodes: graph.nodes.length,
    mappedNodes: mappedNodesCount,
    passCount,
    failCount,
    partialCount,
    notRunCount,
    unmappedCount,
    runtimeScenariosCount: manifest.scenarios.length,
    unmappedRuntimeScenariosCount: unmappedScenarioIds.length,
    unmappedScenarioIds,
    failureNodeIds,
  };

  const defaultUnmappedEvidence = (nodeId: string): WorkflowNodeEvidence => ({
    nodeId,
    state: "UNMAPPED",
    mappedScenarioIds: [],
    presentScenarioIds: [],
    missingScenarioIds: [],
    failedScenarioIds: [],
    scenarios: [],
    failureReasons: [],
    testedViewports: [],
  });

  return {
    manifest,
    provenance: manifest.run,
    nodesById,
    summary,
    failureNodes,
    unmappedScenarioIds,
    evidenceForNode(nodeId: string): WorkflowNodeEvidence {
      return nodesById.get(nodeId) || defaultUnmappedEvidence(nodeId);
    },
    visibleSummary(visibleNodeIds: ReadonlySet<string> | readonly string[]): VisibleEvidenceSummary {
      const idSet = visibleNodeIds instanceof Set ? visibleNodeIds : new Set(visibleNodeIds);
      let visibleMapped = 0;
      let visiblePass = 0;
      let visibleFail = 0;
      let visiblePartial = 0;
      let visibleNotRun = 0;
      let visibleUnmapped = 0;

      for (const id of idSet) {
        const ev = nodesById.get(id);
        if (!ev || ev.state === "UNMAPPED") {
          visibleUnmapped++;
        } else {
          visibleMapped++;
          if (ev.state === "PASS") visiblePass++;
          else if (ev.state === "FAIL") visibleFail++;
          else if (ev.state === "PARTIAL") visiblePartial++;
          else if (ev.state === "NOT_RUN") visibleNotRun++;
        }
      }

      return {
        visibleTotal: idSet.size,
        visibleMapped,
        visiblePass,
        visibleFail,
        visiblePartial,
        visibleNotRun,
        visibleUnmapped,
      };
    },
  };
}

/**
 * Generates the deterministic derived machine-readable overlay JSON structure.
 * Guaranteed to omit screenshot bytes, cookies, auth headers, and production customer data.
 */
export function generateWorkflowMapEvidenceOverlay(
  graph: WorkflowGraph,
  manifest: QaRunManifest,
): WorkflowMapDerivedEvidence {
  const model = mapEvidenceToWorkflowGraph(graph, manifest);

  // Deterministically sort node entries by nodeId
  const sortedNodes = [...graph.nodes].sort((a, b) => a.id.localeCompare(b.id));

  const nodeEntries: WorkflowNodeEvidenceSummaryEntry[] = sortedNodes.map((node) => {
    const ev = model.evidenceForNode(node.id);
    const screenshots = ev.scenarios
      .map((s) => s.screenshotPath)
      .filter((p): p is string => Boolean(p))
      .sort();

    return {
      nodeId: node.id,
      state: ev.state,
      mappedScenarioIds: [...ev.mappedScenarioIds].sort(),
      presentScenarioIds: [...ev.presentScenarioIds].sort(),
      missingScenarioIds: [...ev.missingScenarioIds].sort(),
      failedScenarioIds: [...ev.failedScenarioIds].sort(),
      failureReasons: [...ev.failureReasons].sort(),
      testedViewports: [...ev.testedViewports].sort(),
      screenshots,
    };
  });

  return {
    schemaVersion: WORKFLOW_MAP_EVIDENCE_SCHEMA_VERSION,
    generatedAt: manifest.run.timestamp,
    graph: {
      schemaVersion: graph.schemaVersion,
      version: graph.version,
      product: graph.product,
      totalNodes: graph.nodes.length,
      totalEdges: graph.edges.length,
      mappedNodes: model.summary.mappedNodes,
    },
    manifest: {
      schemaVersion: manifest.schemaVersion,
      run: manifest.run,
      summary: manifest.summary,
    },
    summary: model.summary,
    nodes: nodeEntries,
  };
}
