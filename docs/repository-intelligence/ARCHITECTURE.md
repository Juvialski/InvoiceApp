# Repository Intelligence Architecture

## Objective

Build a practical local-first developer intelligence layer that turns repository state into bounded, queryable context for agents and humans without replacing the curated Workflow Map or encouraging repository-wide scans.

Target flow:

```text
Repository source
    |
    v
incremental source indexer
    |
    v
repository intelligence index
    |
    +--> curated Workflow Map overlay
    |
    v
unified repository graph/query layer
    |
    +--> AI Context Engine -> bounded task packet -> Codex/Luna/future agents
    |
    +--> developer explorer -> structured / 2D / optional 3D views
    |
    +--> existing generated Markdown/Mermaid documentation
```

## Architectural components

### 1. Source indexer

RI-1 should use the existing TypeScript dependency and compiler API before adding a new parser stack. The indexer should collect only information that can be derived deterministically and cheaply:

- tracked file inventory and file hash;
- language/type and generated/vendor classification;
- TypeScript/TSX symbols and stable symbol identities;
- imports, exports, re-exports, and module boundaries;
- route and server-endpoint references where the repository exposes deterministic registries/contracts;
- test files and source/test relationships that can be proven or conservatively mapped;
- package dependency references;
- migration/SQL object references when parsing is sufficiently deterministic;
- selected documentation references.

Do not attempt a perfect static call graph in RI-1.

### 2. Incremental cache

The initial cache should be local and disposable. A practical shape is a manifest plus per-file index records under an ignored cache directory such as `.cache/repository-intelligence/`.

Each record should include the file hash and index schema/generator version. A task run reindexes only:

- files added, deleted, renamed, or modified by Git;
- files whose stored hash no longer matches;
- files invalidated by an index schema/generator change.

A full rebuild remains available as a deterministic recovery path.

Large generated index files should not be committed merely so agents can read them. The query process may load/index metadata locally, but only bounded query results enter model context.

### 3. Curated Workflow Map overlay

`scripts/workflow-map/graph.ts` remains the manually reviewed semantic layer for important workflows, invariants, permissions, routes, confirmation boundaries, history rules, and source-of-truth relationships.

The new source index must not overwrite curated edges. When source-derived structure conflicts with a curated architecture rule, the conflict is reported for review rather than silently choosing the inferred result.

### 4. Unified graph/query layer

The query layer exposes one logical graph while retaining provenance per node and edge. It should support:

- exact node/file/symbol lookup;
- domain and route resolution;
- bounded neighbors by edge class and hop count;
- shortest/most-relevant path queries;
- source -> test and test -> source queries;
- route -> UI -> server -> DB/provider paths where evidence exists;
- invariant/permission attachment;
- changed-file blast-radius queries;
- domain isolation.

The graph API is a library first. CLI and explorer surfaces consume the library rather than maintaining separate graph logic.

### 5. AI Context Engine

The context engine ranks graph evidence, expands only high-value relationships, applies hard budgets, and emits a compact task packet. It is an evolution of the existing `workflow-map:context` and `agent:context` behavior, not a replacement for repository policy.

See [`AI_CONTEXT_ENGINE.md`](./AI_CONTEXT_ENGINE.md).

### 6. Developer explorer

The explorer reads sanitized Repository Intelligence metadata. RI-4 starts with structured/2D navigation because search, filtering, path inspection, and source details provide more value than 3D alone. Optional 3D becomes a later presentation layer.

See [`EXPLORER_UX.md`](./EXPLORER_UX.md).

## Current command compatibility

Backward compatibility is preferred:

- keep `workflow-map:generate`, `workflow-map:check`, and `workflow-map:consistency` unchanged while RI-1 is built;
- keep `workflow-map:context` working through RI-2;
- keep `agent:context` as the normal agent bootstrap interface;
- in RI-3, move the internals of context resolution to the unified graph behind those interfaces;
- add a new `repo-intel:*` diagnostic/query command only when it provides capability that cannot be expressed cleanly through existing commands.

## Generated and committed artifacts

During RI-1 and RI-2:

- source index/cache: generated locally, ignored, disposable;
- unified graph: generated/queryable locally; CI may build it temporarily;
- `docs/architecture/workflow-map.json`: remains the committed curated Workflow Map artifact;
- `docs/architecture/APP_WORKFLOW_MAP.md`: remains the generated Markdown/Mermaid fallback.

A later phase may add a compact committed Repository Intelligence manifest if it materially improves reviewability. Do not commit a large cache by default.

## CI/update process

Repository Intelligence should follow the current efficient validation model.

1. Indexer unit tests prove stable file/symbol/import extraction and incremental invalidation.
2. Unified graph tests prove merge/provenance rules and deterministic queries.
3. Workflow Map source-consistency checks remain authoritative for curated contracts.
4. RI-related source changes can later be classified into the existing `Graph and Source Contract Consistency` workflow rather than creating ritual expensive CI.
5. Documentation-only changes do not trigger app build, browser QA, Docker, Supabase, or provider checks.

CI should validate determinism and stale-artifact rules, not force a full repository reparse when changed-file classification can safely narrow work.

## Security boundaries

Default deployment model: local-only or developer-only.

The indexer must deny or ignore:

- `.env*`, secret files, credentials, tokens, local provider config, and private keys;
- `node_modules`, build outputs, binary artifacts, caches, downloaded customer documents, and temporary QA output;
- environment variable values and runtime secrets even when names are indexed;
- database connection strings or provider configuration values.

A future browser explorer should run as a separate developer surface or from safely generated non-secret metadata. It must not be mounted in the customer application shell.

## Failure and rollback

Repository Intelligence is additive. If an index is stale, corrupt, or unavailable:

- delete/rebuild the local cache;
- fall back to the current curated Workflow Map;
- keep `workflow-map:context`/`agent:context` compatibility behavior;
- perform targeted source inspection rather than broad repository dumping.

No product runtime, database, or customer workflow should depend on Repository Intelligence availability.