# Repository Intelligence Implementation Roadmap

## Guiding principles

- preserve the existing Workflow Map and current context commands;
- deliver indexing/context value before visual novelty;
- incremental and local-first rather than distributed infrastructure;
- source-derived and curated facts remain distinguishable;
- no customer application dependency on Repository Intelligence;
- focused -> affected validation; no ritual full-suite, browser, or database work;
- every phase has an additive rollback path.

## RI-0 — Architecture and documentation

Status: **complete in this documentation phase**.

Deliverables:

- canonical `docs/repository-intelligence/` documentation;
- Workflow Map migration/preservation strategy;
- provenance and source-of-truth rules;
- bounded AI Context Engine design;
- structured/2D/3D explorer plan;
- incremental indexing strategy;
- security/performance/CI/rollback plan;
- active roadmap/handoff/documentation-map integration.

Explicitly not included:

- source indexer implementation;
- new graph artifacts;
- explorer UI;
- package dependencies;
- database/provider/customer feature changes.

Validation: documentation links/consistency and exact final diff review only unless graph/source contracts are modified.

Rollback: revert documentation-only branch.

## RI-1 — Incremental repository source index

Status: **complete**.

Goal: build a fast, deterministic source inventory without changing Workflow Map behavior.

Scope:

- `scripts/repository-intelligence/` library/CLI foundation;
- tracked file inventory;
- content hashes and incremental invalidation;
- TypeScript/TSX symbols using the existing TypeScript compiler API;
- imports/exports/re-exports;
- file/module/test classification;
- ignored secret/generated/vendor/cache rules;
- local disposable cache manifest and per-file records;
- full rebuild and incremental update modes;
- deterministic unit tests and small performance fixture.

Out of scope:

- unified semantic graph;
- replacing `agent:context`;
- DB semantic parsing beyond basic file/object inventory;
- explorer UI;
- 3D.

Evidence:

- unchanged files are not reparsed in incremental mode;
- rename/add/delete/hash-change behavior is deterministic;
- index from clean rebuild equals index from incremental path for the same revision;
- secret/env values are excluded;
- focused tests plus affected validation only.

Implemented foundation:

- `scripts/repository-intelligence/types.ts` — versioned index, cache, symbol, import/export, and run-summary contracts;
- `scripts/repository-intelligence/classification.ts` — deterministic language and source/test/tooling/documentation/migration/exclusion rules;
- `scripts/repository-intelligence/inventory.ts` — Git-tracked inventory, HEAD/dirty-tracked provenance, SHA-256 hashing, regular-file checks, and secret/binary denial;
- `scripts/repository-intelligence/typescriptExtractor.ts` — syntax-level TypeScript/TSX compiler-API extraction with line-independent symbol IDs;
- `scripts/repository-intelligence/cache.ts` — disposable manifest and per-file records with corrupt-cache recovery;
- `scripts/repository-intelligence/indexer.ts` — full/incremental planning, rename/hash/schema invalidation, deterministic serialization, and concise summaries;
- `scripts/repository-intelligence/cli.ts` — direct `index`/`update`/`clean`/`status` CLI without changing existing context commands or package scripts;
- `tests/repositoryIntelligence.test.ts` — fixture coverage for reuse, add/modify/delete/rename, hash and version invalidation, convergence, secrets, untracked files, and performance;
- `.gitignore` — ignored local cache path.

RI-1 deliberately leaves the global affected-test configuration unchanged. The focused RI test is part of the RI-1 change itself, so the final affected run can remain narrow instead of forcing the repository-wide fallback merely to register a new tooling directory.

The index contains metadata and extracted structure only; it does not persist full source,
environment values, credentials, tokens, connection strings, or private document contents.
The cache is safe to delete and is rebuilt when missing or corrupt.

Rollback: delete cache and remove RI-1 scripts; existing Workflow Map remains untouched.

## RI-2 — Unified graph and provenance query API

Status: **complete**.

Goal: merge source-derived index data with the curated Workflow Map without losing authority/provenance.

Scope:

- node/edge/provenance schema;
- stable file/symbol IDs;
- mapping between source nodes and existing Workflow Map nodes;
- deterministic graph merge;
- conservative route/server/test/DB-object relationships;
- graph query library for exact lookup, neighbors, paths, domain isolation, and provenance;
- conflict reporting when source evidence and curated contracts disagree;
- CI/source consistency integration where justified.

Evidence:

- no curated invariant/permission/source-of-truth edge is overwritten by inference;
- query ordering is deterministic;
- graph schema/version/staleness fields are tested;
- current Workflow Map generation/check/consistency remain green.

Implemented in `scripts/repository-intelligence/graph.ts` with focused
provenance, authority, conflict, deterministic-query, source/test, domain,
and freshness coverage.

Rollback: context commands continue to use the original Workflow Map directly.

## RI-3 — AI Context Engine integration

Status: **complete**.

Goal: make task -> relevant code/tests/invariants fast and bounded.

Scope:

- task candidate generation from unified graph;
- file/symbol/edge ranking;
- bounded traversal and cross-domain penalties;
- test/invariant/permission selection;
- DB/provider impact hints;
- stale-index refresh/fail-closed behavior;
- packet schema/rendering;
- preserve `workflow-map:context` and `agent:context` entry points;
- feature-gated/internal fallback to current context behavior during rollout.

Evidence:

- representative tasks such as messaging, procurement, payroll, warehouse, project engineering resolve to bounded correct working sets;
- unrelated domains are excluded unless linked by strong evidence;
- packets remain inside budget;
- current affected-test safety net is not reduced;
- deterministic packet snapshots.

Implemented in `scripts/repository-intelligence/contextEngine.ts` behind the
existing `workflow-map:context` and `agent:context` entry points. Focused tests
cover ranked bounded packets, compatibility formatting, and stale-index
fallback. The existing affected-test safety net remains authoritative; touching
its fallback-sensitive script correctly causes a full fallback recommendation.

Rollback: switch context provider back to current Workflow Map implementation.

## Priority pause after RI-3

RI-2 and RI-3 are the next near-term Repository Intelligence priority because RI-1 now supplies the incremental source data needed to improve bounded agent context for the rest of HydroQualiSense development. By explicit 2026-09-19 user reprioritization, they may be implemented in one sequential PR when RI-2 is built/tested first and RI-3 is layered only after that boundary is stable.

After RI-3 is stable, **pause Repository Intelligence explorer work** and close
the Repository & Architecture Professionalization program before Excel Phase
0/readiness or Excel feature implementation begins. The current run records
that completion in `docs/REPOSITORY_ARCHITECTURE_TRIAGE.md` and the evidence
policy in `docs/REPOSITORY_EVIDENCE_POLICY.md`. RI-4 through RI-6 can resume
later when they materially help active engineering or the user explicitly
reprioritizes them.

The optional 3D explorer is not part of this near-term efficiency milestone and must remain the final RI phase.
## RI-4 — Developer explorer MVP: structured + 2D

Goal: make the graph useful to humans before adding 3D complexity.

Scope:

- local/developer-only explorer shell;
- search and domain isolation;
- file/symbol details;
- provenance labels;
- dependency/path view;
- tests/invariants/permissions overlays;
- source opening/linking;
- accessible list/table equivalent.

Evidence:

- explorer uses Repository Intelligence query APIs rather than a duplicate graph;
- no customer navigation exposure;
- sanitized metadata only;
- keyboard/accessibility and low-power behavior verified proportionally.

Rollback: explorer can be removed without changing index/context behavior.

## RI-5 — Change intelligence

Goal: use Git changes to explain blast radius and validation scope.

Scope:

- changed-file/symbol overlay;
- bounded dependency impact;
- affected domains/tests/invariants;
- dependency-cycle and cross-domain warnings;
- objective churn/coupling/test-mapping metrics;
- heuristic warnings with explicit thresholds/provenance.

Why before 3D: change intelligence directly improves implementation/review efficiency and provides the most useful data layer for later 3D change mode.

Evidence:

- known PR/diff fixtures produce stable bounded impacts;
- inferred impacts are never presented as certain;
- recommendations remain compatible with `test:affected:agent` and repository policy.

Rollback: disable change overlay; base graph/context remains usable.

## RI-6 — Agent integration and effectiveness measurement

Goal: make Repository Intelligence the normal bounded bootstrap when appropriate and prove it saves work.

Scope:

- update agent bootstrap guidance only after RI-3 evidence is stable;
- Codex/Luna-compatible provider-neutral packet consumption;
- measure files opened before first edit, context size, query latency, repeated search count, and missed-boundary regressions;
- tune ranking/budgets using evidence;
- decide whether the old Workflow Map-only context internals can be retired while preserving command compatibility.

Evidence:

- measurable reduction in repository rediscovery for representative tasks;
- no regression in invariant/permission/test coverage;
- fallback behavior remains tested.

Rollback: continue using `agent:context` with its prior Workflow Map provider.

## RI-7 — Optional 3D explorer — FINAL

Goal: add a richer spatial architecture view without making it the only interface.

Scope:

- districts/domains;
- buildings/files;
- configurable objective height/footprint metrics;
- strong-edge filtering;
- APIs/DB/providers/tests/guards as special objects;
- risk/change overlays;
- level-of-detail rendering;
- automatic structured/2D fallback.

Do not add a 3D dependency before this phase. **RI-7 is intentionally the last Repository Intelligence phase and should remain behind all higher-priority structural, product, provider-readiness, and release-critical work unless the user explicitly changes the priority.**

Evidence:

- bounded graph remains responsive on the target development laptop;
- 3D can be disabled without loss of functionality;
- reduced-motion/mobile/low-power/accessibility fallbacks work;
- visual metrics are clearly labeled and not treated as quality scores.

Rollback: remove 3D presentation layer only.

## Recommended next implementation phase

**Accelerated RI-2 + RI-3 core run — complete.**

RI-2 was the first internal gate and built the additive provenance-aware graph
on RI-1. RI-3 then consumed that graph behind the existing context interfaces
with fallback. The stages share one implementation branch here, while their
tests and rollback boundaries remain distinct.

After RI-3, Repository & Architecture Professionalization is explicitly
closed before Excel. The reconciled order is therefore **RI-2 → RI-3 →
professionalization complete → Excel Phase 0/readiness**. RI-4 through RI-6
are later developer-tooling phases. **RI-7 optional 3D explorer is last.**

Start from the latest green `main`, create one bounded context packet, inspect only the existing Workflow Map/context and test-impact machinery needed for integration, and implement the indexer as a separate additive library.
