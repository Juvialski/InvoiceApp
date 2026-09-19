# Repository Intelligence AI Context Engine

## Purpose

The AI Context Engine is the highest-value Repository Intelligence consumer. It converts a task into a bounded, evidence-ranked working set so an agent can inspect the relevant implementation directly instead of rediscovering unrelated parts of the repository.

It complements `docs/AGENT_EXECUTION_EFFICIENCY.md`; it does not bypass repository policy, source inspection, exact-head CI, database runtime validation, or human review requirements.

## Existing baseline to preserve

The repository already has useful behavior:

- `workflow-map:context` accepts node/domain/route/file/query/changed-file selectors;
- the current context engine defaults to one hop and supports a hard maximum of two hops;
- Workflow Map context has hard character budgets and deterministic truncation;
- `agent:context` combines Git provenance, changed-file detection, affected-test selection, Workflow Map selection, invariants, permissions, and validation guidance;
- a missing bounded task/query match falls back to changed-file/impact context rather than triggering speculative repository-wide search.

RI-3 should preserve these interfaces while improving the graph behind them.

## Resolution pipeline

Conceptual task flow:

```text
task text + optional exact selectors + git change state
    -> candidate generation
    -> domain/workflow resolution
    -> file/symbol ranking
    -> bounded relationship expansion
    -> tests/invariants/permissions/validation selection
    -> budget enforcement
    -> compact context packet
```

### Stage 1: candidate generation

Use deterministic evidence first:

1. exact file/symbol/node/route/API selector;
2. curated Workflow Map match;
3. exact symbol/path/module terms from the source index;
4. direct route/server/test relationships;
5. inferred domain or relationship matches.

Do not make a language model scan the repository to discover the initial candidate set.

### Stage 2: ranking

Ranking should favor evidence quality and task proximity rather than graph degree.

Recommended relative priority:

- exact user selector or exact symbol/file match — highest;
- curated workflow/invariant/permission relation — very high;
- route/API/server/DB relationship derived from an explicit registry or declaration — high;
- direct import/export/reference edge — high;
- direct test relationship — high;
- one-hop same-domain dependency — medium;
- cross-domain dependency — lower unless curated or on a required execution path;
- documentation reference — supporting;
- inferred/heuristic edge — lowest and clearly labeled.

Changed files may receive a boost when the task is explicitly about the current diff.

### Stage 3: bounded traversal

Default to the existing one-hop behavior. Permit two hops only when the first hop does not reach a necessary server/DB/provider/test/invariant boundary or the caller explicitly requests it.

Traversal must:

- prioritize guards, permissions, invariants, mutation boundaries, history/source separation, and explicit runtime edges;
- penalize generic high-degree utility nodes that would explode the neighborhood;
- stop crossing domains unless the edge is strong enough to justify it;
- deduplicate files and symbols;
- report omissions/truncation rather than silently widening the budget.

## Context budgets

Keep current hard packet budgets as the initial compatibility baseline. `agent:context` currently defaults to 12,000 characters with a 4,000–16,000 character envelope; Workflow Map context has its own 10,000 default and 20,000 maximum.

RI-3 should measure before changing those limits.

Within the packet, use a soft allocation such as:

- 40–50% primary source/symbols;
- 15–20% direct dependencies and execution path;
- 10–15% tests;
- 10% invariants/permissions/security/source-of-truth boundaries;
- 10% validation/risk/change context;
- remaining space for supporting docs or secondary source.

Budgets are caps, not targets. A small task should produce a small packet.

## Primary vs supporting source

Packets should distinguish:

- `primarySource` — files/symbols the task is likely to edit or inspect first;
- `supportingSource` — direct dependencies needed to understand behavior;
- `tests` — focused tests and current affected-test recommendations;
- `boundaries` — invariants, permissions, confirmation/history/security rules;
- `runtimeOrData` — server endpoints, provider boundaries, DB objects when applicable;
- `documentation` — only current contracts materially relevant to the task.

An initial practical cap can target roughly 4–6 primary files, 4–8 supporting files, and a bounded set of tests/invariants, with deterministic widening only when evidence requires it.

## Suggested packet shape

```text
Task
Repository revision / dirty paths / index revision
Resolved domain(s) and workflow(s)
Primary source
Relevant symbols
Execution/dependency path
Server/API/provider boundaries
DB objects and migration relevance
Tests
Invariants / permissions / confirmation requirements
Risk/change notes
Suggested validation scope
Explicitly excluded unrelated domains
Staleness/truncation/provenance notes
```

The packet may include compact symbol signatures or tiny source excerpts later, but should not dump full files by default.

## Gmail reconnect example

For a task such as `Fix Gmail reconnect behavior`, the engine should resolve the current repository state rather than hardcoding a historical Gmail architecture. If current source has retired Gmail mailbox access, the packet should say so and direct the agent to the actual identity/session/provider code that now owns the behavior.

A hypothetical packet might contain:

- Domain: Messaging / platform identity;
- Primary source: relevant communications/session/auth files only;
- Supporting source: authenticated request recovery or provider/session boundary where directly connected;
- Tests: focused identity/session/provider tests plus affected-test output;
- Invariants: no secret exposure, human confirmation where sending is consequential, provider acceptance is not delivery;
- DB impact: `unlikely` unless a current persistence edge proves otherwise;
- Browser/provider runtime evidence: required only if the changed behavior crosses those boundaries;
- Procurement/Payroll/Warehouse: excluded.

## Test selection

Repository Intelligence should combine, not replace, current test-impact logic.

Candidate test set is the union of:

1. explicit Workflow Map `testRefs`;
2. source-index direct test imports/references;
3. current `test:affected:agent` selection;
4. carefully labeled inferred test mappings.

Until measured evidence proves a safe replacement, Repository Intelligence may add focused recommendations but must not silently reduce the current affected-test safety net.

## Invariants and permissions

Curated invariant IDs and permission keys are high-priority context. The engine should attach them when:

- a selected Workflow Map node/edge declares them;
- a selected source node maps to a curated node with them;
- a dependency path crosses a guarded server/DB boundary.

Do not infer a financial/security invariant purely from symbol naming.

## DB and provider impact

Context packets should make impact classification explicit:

- `none/unlikely` — no graph evidence of DB/provider impact;
- `possible` — indirect or inferred edge; inspect before deciding validation;
- `affected` — explicit route/RPC/migration/provider boundary in the selected path.

This classification recommends validation scope; repository policy remains authoritative.

## Stale-index protection

Before emitting a packet:

1. compare index repository SHA with current HEAD;
2. compare indexed hashes for dirty/changed files;
3. incrementally reindex changed files when possible;
4. record dirty paths and exact index/source revision in the packet;
5. refuse to present stale exact-revision claims when refresh fails.

Safe fallback:

`current curated Workflow Map + current Git diff/test impact + targeted source inspection`

Never fall back to an unbounded repository dump.

## Authoritative-source rules

- Source-derived edges describe source structure, not business authority.
- Curated Workflow Map semantics outrank inferred relationships for financial/security/history rules.
- Current source/migrations/tests/runtime evidence may reveal that a curated graph entry is stale; report the inconsistency and fix the source-of-truth contract rather than silently masking it.
- Runtime-observed evidence is scoped to its revision/environment.
- Heuristic confidence never grants authority.

## CLI compatibility

Preferred RI-3 transition:

1. add Repository Intelligence query/context libraries;
2. make `workflow-map:context` able to consume the unified graph while preserving current selectors/output compatibility;
3. make `agent:context` use the unified context provider while retaining its current entry point and affected-test integration;
4. keep a feature flag or internal fallback to the current Workflow Map context during rollout;
5. add `repo-intel:query` only for developer diagnostics if useful.

Agents should not need a new ritual command merely because the implementation underneath became richer.

## Success measurements

RI-7 should measure whether Repository Intelligence actually improves development:

- fewer unrelated files opened before the first correct edit;
- lower context packet size for equivalent tasks;
- fewer repeated repository-wide searches;
- focused tests selected earlier;
- no increase in missed invariants or validation requirements;
- acceptable indexing/query latency;
- deterministic packet generation for the same revision/task/selectors.