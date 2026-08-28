import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WORKFLOW_GRAPH } from "./graph.ts";
import type { WorkflowDiagram, WorkflowDomain, WorkflowGraph, WorkflowNode } from "./types.ts";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
export const WORKFLOW_MAP_REPOSITORY_ROOT = resolve(scriptDirectory, "../..");
export const WORKFLOW_MAP_JSON_PATH = "docs/architecture/workflow-map.json";
export const WORKFLOW_MAP_MARKDOWN_PATH = "docs/architecture/APP_WORKFLOW_MAP.md";

const DOMAIN_LABELS: Record<WorkflowDomain, string> = {
  "platform-tenancy": "Platform / Tenancy",
  dashboard: "Dashboard",
  projects: "Projects",
  engineering: "Engineering",
  finance: "Finance",
  workforce: "Workforce",
  reporting: "Reporting",
  assistant: "Assistant",
};

const DOMAIN_CLASS_NAMES: Record<WorkflowDomain, string> = {
  "platform-tenancy": "platformTenancy",
  dashboard: "dashboard",
  projects: "projects",
  engineering: "engineering",
  finance: "finance",
  workforce: "workforce",
  reporting: "reporting",
  assistant: "assistant",
};

function escapeMarkdown(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function escapeMermaidText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("|", "/")
    .replaceAll("\n", " ");
}

function mermaidId(value: string): string {
  return `n_${value.replace(/[^A-Za-z0-9_]/g, "_")}`;
}

function mermaidLabel(node: WorkflowNode): string {
  const details = [
    node.type.toUpperCase(),
    node.route?.canonicalPath,
    node.statusValues?.length ? node.statusValues.join(" → ") : undefined,
  ].filter(Boolean).join(" · ");
  return `${escapeMermaidText(node.label)}<br/><small>${escapeMermaidText(details)}</small>`;
}

function mermaidNodeDefinition(node: WorkflowNode): string {
  const id = mermaidId(node.id);
  const label = mermaidLabel(node);
  switch (node.type) {
    case "route": return `${id}(["${label}"])`;
    case "screen": return `${id}["${label}"]`;
    case "workflow": return `${id}{"${label}"}`;
    case "state": return `${id}("${label}")`;
    case "action": return `${id}("${label}")`;
    case "data": return `${id}[("${label}")]`;
    case "derived-data": return `${id}["${label}"]`;
    case "guard": return `${id}{{"${label}"}}`;
    case "external-boundary": return `${id}[["${label}"]]`;
  }
}

function diagramNodes(graph: WorkflowGraph, diagram: WorkflowDiagram): WorkflowNode[] {
  const requested = new Set(diagram.nodeIds);
  return graph.nodes.filter((node) => requested.has(node.id));
}

export function renderMermaid(graph: WorkflowGraph, diagram: WorkflowDiagram): string {
  const selectedNodes = diagramNodes(graph, diagram);
  const selectedIds = new Set(selectedNodes.map((node) => node.id));
  const lines = ["flowchart LR"];
  const domains = [...new Set(selectedNodes.map((node) => node.domain))];

  for (const domain of domains) {
    const className = DOMAIN_CLASS_NAMES[domain];
    lines.push(`  subgraph g_${className}["${DOMAIN_LABELS[domain]}"]`);
    for (const node of selectedNodes.filter((candidate) => candidate.domain === domain)) {
      lines.push(`    ${mermaidNodeDefinition(node)}`);
    }
    lines.push("  end");
  }

  for (const edge of graph.edges) {
    if (!selectedIds.has(edge.source) || !selectedIds.has(edge.target)) continue;
    lines.push(`  ${mermaidId(edge.source)} -->|${escapeMermaidText(edge.label)}| ${mermaidId(edge.target)}`);
  }

  lines.push(
    "  classDef platformTenancy fill:#eef2ff,stroke:#4f46e5,color:#1e1b4b;",
    "  classDef dashboard fill:#f1f5f9,stroke:#475569,color:#0f172a;",
    "  classDef projects fill:#ecfeff,stroke:#0891b2,color:#164e63;",
    "  classDef engineering fill:#f0fdf4,stroke:#16a34a,color:#14532d;",
    "  classDef finance fill:#fff7ed,stroke:#ea580c,color:#7c2d12;",
    "  classDef workforce fill:#fdf4ff,stroke:#c026d3,color:#701a75;",
    "  classDef reporting fill:#fefce8,stroke:#ca8a04,color:#713f12;",
    "  classDef assistant fill:#fdf2f8,stroke:#db2777,color:#831843;",
  );
  for (const node of selectedNodes) {
    lines.push(`  class ${mermaidId(node.id)} ${DOMAIN_CLASS_NAMES[node.domain]}`);
  }
  return lines.join("\n");
}

function referenceList(values: readonly string[] | undefined): string {
  if (!values?.length) return "—";
  return values.map((value) => `\`${escapeMarkdown(value)}\``).join("<br/>");
}

function routeDetails(node: WorkflowNode): string {
  if (!node.route) return "—";
  const routeId = node.route.routeId ? `\`${escapeMarkdown(node.route.routeId)}\`` : "demo-only";
  const query = node.route.queryKeys?.length ? `<br/>query: ${node.route.queryKeys.map((key) => `\`${escapeMarkdown(key)}\``).join(", ")}` : "";
  return `${routeId}<br/>\`${escapeMarkdown(node.route.canonicalPath)}\`${query}`;
}

function statusDetails(node: WorkflowNode): string {
  return node.statusValues?.length ? node.statusValues.map((value) => `\`${escapeMarkdown(value)}\``).join(" → ") : "—";
}

function renderNodeTable(graph: WorkflowGraph, domain: WorkflowDomain): string[] {
  const lines = [
    `### ${DOMAIN_LABELS[domain]}`,
    "",
    "| Node | Type | Scope / route | Status values | Permissions | Source / confirmation | Source files | Tests | QA-1 scenarios |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const node of graph.nodes.filter((candidate) => candidate.domain === domain && candidate.type !== "state")) {
    const confirmation = node.confirmationRequirement && node.confirmationRequirement !== "not-applicable" ? `<br/>confirmation: \`${node.confirmationRequirement}\`` : "";
    lines.push(`| **${escapeMarkdown(node.label)}**<br/><small>\`${node.id}\`</small> | \`${node.type}\` | \`${node.scope || "—"}\`<br/>${routeDetails(node)} | ${statusDetails(node)} | ${referenceList(node.permissionKeys)} | \`${node.sourceClassification}\`${confirmation} | ${referenceList(node.fileRefs)} | ${referenceList(node.testRefs)} | ${referenceList(node.qaScenarioIds)} |`);
  }
  return lines;
}

export function renderWorkflowMapMarkdown(graph: WorkflowGraph): string {
  const lines: string[] = [
    "# Engoryx Application Workflow Map",
    "",
    "> Generated from the single canonical graph source at `scripts/workflow-map/graph.ts`. Do not edit this file by hand.",
    "",
    "## How to use this map",
    "",
    "Use the overview for orientation, then choose the domain diagram closest to the change. Read the linked source files, guards, permissions, invariants, and tests before editing. The map is advisory context; current source, current CI, database contracts, and authenticated runtime evidence remain authoritative.",
    "",
    `- Generate: \`npm.cmd run workflow-map:generate\``,
    `- Check for drift: \`npm.cmd run workflow-map:check\``,
    `- Machine-readable graph: \`${WORKFLOW_MAP_JSON_PATH}\``,
    `- Canonical source: \`${graph.canonicalSource}\``,
    "",
    "## Graph metadata",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Schema version | \`${graph.schemaVersion}\` |`,
    `| Graph version | \`${graph.version}\` |`,
    `| Product | ${escapeMarkdown(graph.product)} |`,
    `| Source classification | \`${graph.sourceClassification}\` |`,
    `| Reviewed against | \`${graph.reviewedCommitSha || "not recorded"}\` |`,
    `| Reviewed at | \`${graph.reviewedAt || "not recorded"}\` |`,
    `| Node count | ${graph.nodes.length} |`,
    `| Edge count | ${graph.edges.length} |`,
    `| Invariant count | ${graph.invariants.length} |`,
    `| Phase/module tags | ${graph.phaseTags.map((tag) => `\`${escapeMarkdown(tag)}\``).join(", ")} |`,
    "",
    "## Canonical route rule",
    "",
    "Route references below mirror `src/utils/appRouting.ts` and `src/utils/routes.ts`; they are context links, not a second router. Project subviews remain one `projects` route with view/query selection. The standalone `/demo/app/documents` and `/demo/app/assistant` entries are explicitly demo-only.",
    "",
    "| Node | Route ID | Canonical path | Query keys | Scope |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const node of graph.nodes.filter((candidate) => candidate.type === "route")) {
    const routeReference = node.route;
    if (!routeReference) continue;
    lines.push(`| **${escapeMarkdown(node.label)}**<br/><small>\`${node.id}\`</small> | ${routeReference.routeId ? `\`${escapeMarkdown(routeReference.routeId)}\`` : "demo-only"} | \`${escapeMarkdown(routeReference.canonicalPath)}\` | ${routeReference.queryKeys?.map((key) => `\`${escapeMarkdown(key)}\``).join(", ") || "—"} | \`${node.scope || "—"}\` |`);
  }

  lines.push("", "## Generated diagrams", "");
  for (const diagram of graph.diagrams) {
    lines.push(`### ${escapeMarkdown(diagram.title)}`, "", escapeMarkdown(diagram.description), "", "```mermaid", renderMermaid(graph, diagram), "```", "");
  }

  lines.push(
    "## High-value invariants",
    "",
    "These invariants are intentionally explicit because generic import graphs cannot reliably infer their business meaning.",
    "",
    "| Invariant | Meaning | Source files | Tests |",
    "| --- | --- | --- | --- |",
  );
  for (const item of graph.invariants) {
    lines.push(`| **${escapeMarkdown(item.label)}**<br/><small>\`${item.id}\`</small> | ${escapeMarkdown(item.description)} | ${referenceList(item.fileRefs)} | ${referenceList(item.testRefs)} |`);
  }

  if (graph.explorationInputs?.length) {
    lines.push("", "## Exploratory architecture input", "", "GitDiagram was used only to accelerate repository discovery. The following record preserves what was useful and what required domain-specific correction before becoming Engoryx context.", "");
    for (const exploration of graph.explorationInputs) {
      lines.push(`### ${escapeMarkdown(exploration.tool)} — ${exploration.accessed ? "accessed" : "not accessed"}`, "", escapeMarkdown(exploration.role), "", "Useful findings:", "", ...exploration.usefulFindings.map((finding) => `- ${escapeMarkdown(finding)}`), "", "Corrections applied in the canonical graph:", "", ...exploration.corrections.map((correction) => `- ${escapeMarkdown(correction)}`), "");
    }
  }

  lines.push("## Workflow and source index", "", "State nodes are rendered in the lifecycle diagrams; the index below keeps the supporting workflow, route, screen, data, guard, action, and boundary context discoverable without listing every component or SQL function.", "");
  for (const domain of Object.keys(DOMAIN_LABELS) as WorkflowDomain[]) lines.push(...renderNodeTable(graph, domain), "");

  lines.push(
    "## QA-1 linkage seam",
    "",
    "Nodes carry stable `qaScenarioIds` only where the mapping to the declarative catalog in `scripts/qa/demoScenarios.ts` is deterministic and useful. WM-1 does not read CI artifacts or dynamically attach `artifacts/demo-visual-qa/manifest.json`; WM-4 may consume those records later while preserving the distinction between isolated demo evidence and authenticated production behavior.",
    "",
    "## Maintenance rule",
    "",
    "When a future product change introduces or materially changes a workflow, lifecycle, route, guard, permission, cross-domain relationship, or high-risk invariant, update `scripts/workflow-map/graph.ts` in the same implementation PR and regenerate both committed outputs. Trivial CSS and internal refactors that do not change workflow meaning do not require graph edits.",
    "",
    "WM-2 Visual Workflow Canvas is the next infrastructure stage. WM-1 deliberately does not add React Flow/xyflow, a customer-facing map, an external orchestrator, or a new financial/payroll behavior.",
    "",
  );
  return lines.join("\n");
}

export function serializeWorkflowGraph(graph: WorkflowGraph = WORKFLOW_GRAPH): string {
  return `${JSON.stringify(graph, null, 2)}\n`;
}

export function generateWorkflowMapFiles(repositoryRoot = WORKFLOW_MAP_REPOSITORY_ROOT): { jsonPath: string; markdownPath: string } {
  const jsonPath = resolve(repositoryRoot, WORKFLOW_MAP_JSON_PATH);
  const markdownPath = resolve(repositoryRoot, WORKFLOW_MAP_MARKDOWN_PATH);
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, serializeWorkflowGraph(), "utf8");
  writeFileSync(markdownPath, renderWorkflowMapMarkdown(WORKFLOW_GRAPH), "utf8");
  return { jsonPath, markdownPath };
}

export function readGeneratedWorkflowMapFiles(repositoryRoot = WORKFLOW_MAP_REPOSITORY_ROOT): { json: string; markdown: string } {
  return {
    json: readFileSync(resolve(repositoryRoot, WORKFLOW_MAP_JSON_PATH), "utf8"),
    markdown: readFileSync(resolve(repositoryRoot, WORKFLOW_MAP_MARKDOWN_PATH), "utf8"),
  };
}

if (basename(process.argv[1] || "") === "generate.ts") {
  const output = generateWorkflowMapFiles();
  console.log(`Generated ${output.jsonPath}`);
  console.log(`Generated ${output.markdownPath}`);
}
