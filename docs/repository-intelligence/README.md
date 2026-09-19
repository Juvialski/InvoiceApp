# Repository Intelligence

Status: **RI-1 source index, RI-2 unified graph/query API, and RI-3 bounded context integration implemented**

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

Repository Intelligence adds source indexing, a provenance-aware unified graph/query layer, and a bounded context provider under those capabilities without weakening current safeguards.

## RI-1 implementation

RI-1 is an additive, local-only source index under `scripts/repository-intelligence/`.
It uses Git-tracked paths as its inventory, hashes eligible files with SHA-256, classifies
source/test/script/documentation/migration/generated/vendor/cache/excluded paths, and uses
the repository's existing TypeScript compiler API for deterministic TypeScript/TSX symbols,
imports, exports, and re-exports. Symbol identities are path/qualified-name based and do not
use line numbers. The index records the repository HEAD plus any dirty tracked paths so later
graph/context phases cannot mistake modified worktree content for exact-revision context.

The disposable cache is `.cache/repository-intelligence/` and is ignored by Git. The CLI is
available directly through `tsx scripts/repository-intelligence/cli.ts` with `index`/`update`,
`clean`, and `status` commands. RI-1 intentionally does not modify `package.json` or the global
test-impact selector merely to add convenience aliases. Indexing never becomes a customer-runtime
dependency and does not replace any `workflow-map:*` or `agent:context` command.

## Canonical documents

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — target components, boundaries, CI/update flow, security, and generated artifacts.
- [`INDEX_AND_GRAPH_MODEL.md`](./INDEX_AND_GRAPH_MODEL.md) — node/edge model, provenance, versioning, confidence, source-of-truth rules, and graph identity.
- [`AI_CONTEXT_ENGINE.md`](./AI_CONTEXT_ENGINE.md) — task resolution, ranking, bounded traversal, context budgets, stale-index protection, test/invariant selection, and compatibility with current context commands.
- [`EXPLORER_UX.md`](./EXPLORER_UX.md) — structured/2D/3D developer explorer behavior and accessibility/performance rules.
- [`IMPLEMENTATION_ROADMAP.md`](./IMPLEMENTATION_ROADMAP.md) — staged RI-1 through RI-7 implementation, validation, migration, and rollback.

## Priority order

RI-1, RI-2, and RI-3 are complete for the current repository boundary: RI-1 provides the source-index foundation, RI-2 the provenance-aware graph/query layer, and RI-3 bounded agent context behind the existing context interfaces.

Pause further Repository Intelligence presentation/tooling work unless
explicitly reprioritized and continue the approved HydroQualiSense product
queue, beginning with Excel Phase 0/readiness. RI-4 through RI-6 are later
developer-tooling improvements.

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

## RI-2 and RI-3 implementation

RI-2 is implemented in `scripts/repository-intelligence/graph.ts`. It merges
the RI-1 source index with the curated Workflow Map while retaining separate
source-derived, curated, inferred, and future runtime-observed provenance.
Authority is explicit and independent from confidence. Deterministic graph
queries cover exact IDs, paths, symbols, domains, neighbors, bounded paths,
source/test relationships, source-to-curated mappings, domain isolation, and
conflicts. Graph freshness carries repository revision, dirty paths, index and
graph versions, Workflow Map version, and indexed file hashes.

RI-3 is implemented in `scripts/repository-intelligence/contextEngine.ts` and
is consumed by the existing `workflow-map:context` and `agent:context` entry
points. It ranks exact and curated evidence ahead of inferred matches, keeps
packets bounded, includes source/symbol/test/boundary/validation information,
and refuses stale exact-revision claims. When the RI index is unavailable or
stale, the current Workflow Map plus Git diff/test-impact fallback remains the
bounded compatibility path.

RI-2/RI-3 are developer-only. They do not alter customer routing, database
contracts, provider behavior, or production runtime dependencies.

## Implementation status

RI-0 established the architecture and documentation. RI-1 provides the
incremental local source index, RI-2 provides the provenance-preserving graph
and query API, and RI-3 provides bounded context integration. No explorer
route, customer-facing navigation, new runtime dependency, migration,
database/provider behavior, or production surface is introduced. RI-4 through
RI-7 remain later developer-tooling phases, with the optional 3D explorer last.
