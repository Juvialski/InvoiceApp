# Repository Intelligence

Status: **RI-0 architecture/documentation complete; implementation not started**

Repository Intelligence is the developer-facing index, graph, and bounded context layer for HydroQualiSense. Its primary purpose is to reduce repeated repository rediscovery by resolving a task to the smallest useful set of code, relationships, tests, invariants, permissions, and validation guidance.

The interactive explorer is a consumer of this information. It is not the architecture itself.

## Core outcome

For a task such as `Fix Gmail reconnect behavior`, Repository Intelligence should eventually resolve a bounded working set similar to:

`task -> Messaging domain -> relevant UI/controller -> auth/session/provider boundary -> persistence or server endpoint -> tests -> invariants -> validation scope`

Unrelated domains should remain excluded unless a concrete dependency crosses into them.

## Existing foundation

Repository Intelligence extends rather than replaces the current Workflow Map system:

- `scripts/workflow-map/graph.ts` remains the curated architecture/workflow source.
- `docs/architecture/workflow-map.json` remains the committed machine-readable Workflow Map artifact.
- `docs/architecture/APP_WORKFLOW_MAP.md` remains the generated Markdown/Mermaid representation.
- `workflow-map:check` and `workflow-map:consistency` continue protecting graph/source contracts.
- `workflow-map:context` remains a supported bounded graph-context interface.
- `agent:context` remains the normal lead-agent packet and already combines Git provenance, affected-test selection, bounded Workflow Map traversal, permissions, invariants, and hard character budgets.

Repository Intelligence adds source indexing and a unified query layer under those capabilities without weakening current safeguards.

## Canonical documents

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — target components, boundaries, CI/update flow, security, and generated artifacts.
- [`INDEX_AND_GRAPH_MODEL.md`](./INDEX_AND_GRAPH_MODEL.md) — node/edge model, provenance, versioning, confidence, source-of-truth rules, and graph identity.
- [`AI_CONTEXT_ENGINE.md`](./AI_CONTEXT_ENGINE.md) — task resolution, ranking, bounded traversal, context budgets, stale-index protection, test/invariant selection, and compatibility with current context commands.
- [`EXPLORER_UX.md`](./EXPLORER_UX.md) — structured/2D/3D developer explorer behavior and accessibility/performance rules.
- [`IMPLEMENTATION_ROADMAP.md`](./IMPLEMENTATION_ROADMAP.md) — staged RI-1 through RI-7 implementation, validation, migration, and rollback.

## Priority order

Repository Intelligence implementation should proceed **RI-1 → RI-2 → RI-3 first**, because those phases directly reduce repository rediscovery and improve bounded agent context.

After RI-3, pause Repository Intelligence presentation/tooling work unless explicitly reprioritized and return to the higher-priority HydroQualiSense structural/product queue. RI-4 through RI-6 are later developer-tooling improvements.

**RI-7 is the optional 3D explorer and is intentionally last.** The 3D/WebGL view is never a prerequisite for indexing, AI context, application development, QA certification, or release.
## Source-of-truth rule

Repository Intelligence must never flatten all graph facts into one level of authority. Every fact and relationship must retain provenance:

1. source-derived fact;
2. manually curated architecture fact;
3. generated/inferred relationship;
4. runtime-observed evidence, if added later.

Curated financial, security, permission, history, and source-of-truth rules remain stronger than heuristic inference. Current source, migrations, tests, runtime evidence, repository policy, and exact-head CI remain authoritative according to their existing contracts.

## Model/provider direction

The core index, graph, and context APIs are model-provider-neutral. Current development workflows may be consumed by ChatGPT, Codex, Luna when enabled, or future compatible agents without changing the graph architecture. No model-specific API is part of Repository Intelligence.

## Security boundary

Repository Intelligence is a developer tool. It must not be added to normal customer application navigation and must not expose source code, secrets, environment values, credentials, database connection details, provider tokens, private runtime metadata, or developer-only diagnostics to HydroQualiSense customers.

## Implementation status

RI-0 changes documentation only. No source indexer, graph store, explorer, dependency, route, database migration, provider integration, or customer-facing feature is introduced by this phase.
