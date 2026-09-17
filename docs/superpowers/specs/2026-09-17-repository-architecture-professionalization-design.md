# Repository & Architecture Professionalization Design

Date: 2026-09-17
Repository: `Juvialski/InvoiceApp`
Baseline `main`: `382d997760f30ce5605553ce7605db20df837b4e`

## Objective

Make the repository itself communicate the maturity that already exists in the application, while reducing two genuine architectural liabilities: oversized application/server composition files and stale repository-facing metadata.

This phase is not a feature rewrite. It must preserve current financial semantics, authorization boundaries, audit/history behavior, deployment tenancy, document ownership, messaging behavior, and route compatibility.

## Scope

The work is split into three slices so each can be reviewed and validated independently.

Slice 1 is complete in PR #178. The later App.tsx and server.ts decomposition slices remain separate follow-up work and were not started by this PR.

### Slice 1 — Repository front door and hygiene

Update repository-facing material so an external engineer can understand the product and engineering model quickly and accurately.

Required changes:

- Rewrite `README.md` around the current HydroQualiSense product and current implementation rather than historical roadmap/reset material.
- Describe the actual architecture at a useful level: React/Vite client, Express server, Supabase/Postgres/RLS, Storage, server-side provider integrations, local/hosted QA, deployment model, and financial/security invariants.
- Add a concise `docs/architecture/OVERVIEW.md` explaining major layers and ownership boundaries without duplicating the generated Workflow Map.
- Rename the package from legacy `engoryx` to a HydroQualiSense-compatible package name while preserving runtime behavior.
- Remove obsolete package-manager ambiguity. `npm`/`package-lock.json` is authoritative because CI uses `npm ci`; remove `bun.lock` unless live repository instructions explicitly require Bun.
- Move root-level operational setup documentation into `docs/` and update internal links.
- Remove or rename stale Engoryx build/theme identifiers only where this is a mechanical branding cleanup with no style/runtime behavior change.
- Improve public GitHub repository metadata where the available API permits it: meaningful description, production homepage, and relevant topics. If repository administration capabilities do not expose these writes, document the exact remaining manual metadata changes instead of pretending they were applied.
- Add `CONTRIBUTING.md` only if it provides concrete repository-specific workflow value beyond `AGENTS.md`; do not create generic open-source boilerplate.
- Add `SECURITY.md` only if it accurately describes vulnerability reporting for this repository; do not publish fake contact channels.

### Slice 2 — `src/App.tsx` decomposition

`src/App.tsx` is currently an oversized application orchestration hub. Decompose it incrementally without changing product behavior.

Target structure:

- `App.tsx` remains the top-level authenticated/public composition entry.
- Domain workspace state and mutation orchestration move into focused controllers/hooks grouped around existing domain boundaries, for example projects/procurement, finance, payroll/workforce, engineering/documents, and inventory/equipment.
- Shared workspace synchronization/session/navigation concerns remain separate from business-domain controllers.
- Prefer existing `src/features`, `src/lib`, `src/context`, and `src/app` patterns instead of inventing a parallel architecture.
- Avoid a single replacement "mega hook" that merely moves the monolith to another file.
- Expose narrow typed interfaces from controllers to `AppRouter`; do not pass entire persistence modules or mutable global bags.
- Reduce `AppRouter` prop coupling where feasible by grouping stable domain-specific route contracts, but do not introduce a global state library solely for this cleanup.

Acceptance goals:

- `App.tsx` becomes primarily composition, lifecycle coordination, and cross-domain integration.
- Domain-specific mutations can be understood and tested without reading the entire application shell.
- Existing route behavior and deep links remain compatible.
- Existing financial/source-of-truth rules are unchanged.

### Slice 3 — `server.ts` decomposition

`server.ts` is currently an oversized API/composition hub. Decompose it by existing server-domain boundaries.

Target structure:

- `server.ts` owns process startup, middleware registration, common server composition, and router mounting.
- Shared request authentication/authorization helpers move into a dedicated server authorization module with fail-closed behavior unchanged.
- Existing messaging, document-template, storage, assistant, and AI modules remain authoritative rather than being duplicated.
- Inline routes still living in `server.ts` move into domain routers/services grouped by responsibility.
- Shared provider/environment resolution stays server-only.
- Route contracts, status codes, error codes, idempotency rules, and permission requirements remain stable unless a separately proven bug requires a compatibility-preserving correction.

Acceptance goals:

- New server routes have an obvious home.
- Authorization logic has one auditable implementation boundary.
- Domain routers can be tested without loading unrelated server functionality where practical.
- No secrets move into browser-visible code or client storage.

## Non-goals

- No database schema redesign.
- No new product features.
- No replacement of React, Express, Supabase, or the current persistence model.
- No Redux/NgRx or other state framework unless a concrete requirement emerges that cannot be handled by the existing architecture.
- No broad visual redesign.
- No financial-semantic simplification.
- No migration of production data.
- No change to current Email/SMS Phase 2 behavior while PR #176 is active.

## Safety and compatibility constraints

The following are invariants for all slices:

- one deployment serves one client company;
- `company_id`, membership checks, RLS, permission checks, and company-bound integrity remain defense-in-depth controls;
- financial, payroll, procurement, billing, collection, settlement, and inventory history remains auditable;
- unknown monetary values must never silently become zero;
- client billing remains distinct from collection;
- supplier cost/obligation remains distinct from settlement evidence;
- mixed currencies are never silently combined;
- consequential AI-assisted writes retain explicit authorization and human-confirmation boundaries;
- historical source documents and immutable snapshots keep existing ownership semantics;
- browser routes and supported deep links remain compatible wherever practical;
- production is not touched by this phase.

## Interaction with active work

PR #176 (`phase-2-authenticated-request-recovery`) is active and modifies:

- `src/lib/authenticatedRequestRecovery.ts`
- `src/lib/companyApi.ts`
- `tests/authenticatedRequestRecovery.test.ts`

This professionalization work must not edit those files until PR #176 is merged or explicitly abandoned. Any App/server decomposition must consume their eventual merged behavior rather than reimplementing it.

## Validation strategy

Follow the repository validation ladder proportionally for each slice.

For Slice 1:

- focused documentation/link/package metadata checks;
- `npm run lint` if package/theme identifiers change;
- `npm run build` when build-script/theme paths change;
- `npm run test:affected:agent` when application-relevant files change.

For Slice 2:

- new/edited controller tests first;
- focused route/workspace tests for each extracted domain;
- `npm run test:affected:agent`;
- lint and production build;
- browser/Workflow Map validation when routing/composition surfaces are touched.

For Slice 3:

- focused authorization/router tests first;
- server API contract tests for moved routes;
- `npm run test:affected:agent`;
- lint and production build;
- database runtime validation only if an actual DB/RPC/RLS contract changes, which is not planned.

Do not run the historical full suite merely because refactoring occurred. Escalate to `test:full` only if impact analysis falls back, shared contracts broaden unexpectedly, or failures justify it.

## Delivery strategy

Implement this as a dedicated feature branch and PR separate from the Email/SMS reliability PR. Keep commits slice-oriented and reviewable. Before opening the PR, review the complete diff for accidental behavior changes, stale branding, duplicated abstractions, and scope creep.

Codex/local implementation must not merge its own PR. A separate review pass should inspect the exact final head, applicable CI, mergeability, and unresolved blockers before merge.

## Success criteria

An external engineer reviewing the repository should be able to determine quickly that:

- this is a current business operations platform, not the original toy invoice application;
- the product has real persistence, authorization, financial lifecycle semantics, migrations, tests, CI, deployment, and QA infrastructure;
- the repository has clear architectural boundaries and documented invariants;
- the two largest orchestration files are being reduced into understandable, testable units rather than accumulating more unrelated behavior;
- documentation and metadata describe the live system rather than an obsolete historical state.
