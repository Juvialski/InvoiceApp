# Repository Intelligence Index and Graph Model

## Design rule

Graph structure and graph authority are separate concerns. A relationship may exist in the graph while remaining advisory. Consumers must be able to tell where every node and edge came from.

## Graph layers

### Source-derived layer

Deterministic facts extracted from repository content, for example:

- file existence, path, hash, language, size/LOC;
- symbol declarations and exports;
- static imports/re-exports;
- route registrations and known route contracts;
- server endpoints or handlers that can be tied to explicit registrations;
- test imports/references;
- package dependencies;
- conservative SQL object declarations when extraction is deterministic.

### Curated architecture layer

Human-reviewed facts from `scripts/workflow-map/graph.ts` and other explicitly approved architecture contracts, including:

- domain/workflow meaning;
- financial and historical invariants;
- permission and confirmation boundaries;
- source-of-truth separation;
- lifecycle semantics;
- manually declared runtime relationships that static analysis cannot prove safely.

### Inferred layer

Generated relationships that are useful but not authoritative, for example:

- likely test-to-source relationship based on naming and imports;
- likely feature/domain classification from paths and symbols;
- likely call/runtime relationship from conservative static heuristics;
- likely complexity/coupling warnings.

These edges must be labeled `inferred` and may carry confidence. They must never silently become an authorization, financial, history, or source-of-truth rule.

### Runtime-observed layer

Optional future evidence from controlled tests/traces, such as an observed endpoint path or browser execution path. Runtime evidence is evidence for the exact observed revision/environment, not universal truth.

## Core node types

Repository Intelligence should support at least:

- `file`;
- `symbol`;
- `module`;
- `domain`;
- `route`;
- `screen` or UI entry;
- `api-endpoint` / server handler;
- `database-object` such as table/view/RPC/function when known;
- `migration`;
- `test`;
- `invariant`;
- `permission`;
- `external-provider` boundary;
- existing Workflow Map workflow/state/action/guard nodes.

Do not create duplicate logical nodes where an existing Workflow Map node already represents the concept. Use aliases/mappings between source nodes and curated nodes.

## Core edge classes

Source-derived examples:

- `imports`, `exports`, `declares`, `references`, `tests`, `registers-route`, `handles-endpoint`, `defines-db-object`.

Curated/runtime examples:

- existing Workflow Map types such as `routes-to`, `reads`, `writes`, `derives`, `guards`, `requires-permission`, `requires-confirmation`, `executes-through`, `preserves`, and `separates`.

Inferred examples:

- `likely-tests`, `likely-belongs-to-domain`, `likely-runtime-call`, `likely-change-impact`.

## Stable identities

File IDs should be path-based within the repository. Symbol IDs should avoid line numbers because line movement should not create a new identity.

Recommended conceptual identity:

`symbol:<repo-path>#<qualified-name>:<kind>:<signature-disambiguator>`

The disambiguator should be deterministic and only needed for overloads/anonymous or repeated declarations.

Curated Workflow Map IDs remain unchanged for backward compatibility.

## Provenance record

Each node/edge should carry a provenance object conceptually equivalent to:

```text
kind: source-derived | curated | inferred | runtime-observed
authority: authoritative | advisory
producer: workflow-map | ts-indexer | route-indexer | test-mapper | runtime-evidence | ...
sourceRevision: git SHA
sourcePath/sourceSpan: when applicable
ruleVersion: extractor or heuristic version
confidence: only for inferred evidence
observedEnvironment/observedAt: only for runtime evidence
```

Confidence is not authority. A high-confidence inferred edge is still inferred.

## Files and symbols

Per-file records should include:

- path and Git status;
- content hash;
- language;
- generated/vendor/cache classification;
- LOC and other objective measurements;
- declared symbols;
- imports/exports;
- test classification;
- optional domain candidates.

Do not store secret file contents in the index.

## Modules and domains

Domains are semantic groupings, not merely folders. The current Workflow Map domain registry remains the initial canonical domain vocabulary. Source-derived files/symbols may map to zero, one, or several domains with provenance.

Unexpected cross-domain dependencies should be queryable and may become warnings, but crossing a domain boundary is not automatically wrong.

## Routes, APIs, providers, and database relationships

Prefer explicit registries/contracts over heuristics.

- Routes should map to the current routing utilities/contracts where possible.
- Server endpoints should be tied to concrete Express/router registrations.
- Provider edges should stop at explicit server/provider boundaries; credentials are never indexed.
- Database objects should begin with conservative DDL/RPC extraction plus curated mappings. Complex SQL semantics should remain curated until a reliable parser proves them.

## Tests

Test relationships have four possible evidence sources:

1. explicit Workflow Map `testRefs`;
2. direct test imports/references;
3. existing affected-test selection rules;
4. inferred naming/domain relationships.

The first three should outrank heuristic mapping. Repository Intelligence recommendations must not reduce the required validation below existing repository policy.

## Invariants and permissions

Existing Workflow Map invariant IDs and permission keys remain first-class graph nodes or attached references. Their curated meaning must not be re-derived from naming heuristics.

## Objective metrics vs heuristics

Objective measurements may include:

- LOC;
- symbol count;
- fan-in/fan-out;
- dependency-cycle membership;
- change frequency/churn from Git;
- number of mapped tests;
- number of cross-domain edges.

Configured warnings may include:

- oversized file;
- high coupling;
- cycle;
- high churn with weak test mapping;
- excessive responsibilities;
- unexpected cross-domain dependency.

Thresholds are configuration, not facts. Warnings are heuristics, not verdicts.

## Graph versioning and stale protection

Every generated index/graph should record:

- repository HEAD SHA;
- dirty/changed paths if generated from a worktree;
- index schema version;
- graph schema version;
- generator version;
- curated Workflow Map schema/version;
- file hashes for indexed records.

A packet must not claim fresh exact-revision context when its index revision differs from the current repository. The engine should either incrementally refresh changed files or fail closed to the current Workflow Map/targeted source inspection.

## Serialization

The graph library should expose bounded queries without requiring a model to load the whole graph. Serialization may be optimized later for explorer delivery, including per-domain chunks, but the in-memory/query contract should remain independent of the visualization format.
