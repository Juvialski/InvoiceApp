# Repository & Architecture Professionalization Design

Date: 2026-09-17
Repository: `Juvialski/InvoiceApp`
Baseline `main`: `382d997760f30ce5605553ce7605db20df837b4e`

## Objective

Make the repository itself communicate the maturity that already exists in the application, while reducing two genuine architectural liabilities: oversized application/server composition files and stale repository-facing metadata.

This phase is not a feature rewrite. It must preserve current financial semantics, authorization boundaries, audit/history behavior, deployment tenancy, document ownership, messaging behavior, and route compatibility.

## Scope

The work is split into reviewable slices so each can be reviewed and validated independently.

Current status: Slices 1-4 and Slice 5 Waves A-B are merged on `main`; Slice 5 Wave C is implemented on task branch; the broader professionalization program remains in progress. The approved future Excel-native UX is a separate deferred product-design track documented at `docs/superpowers/specs/2026-09-18-excel-native-operations-ux-design.md`; it must not be pulled into structural slices prematurely.

Slice 1 is complete in PR #178. Slice 2 (`src/App.tsx` decomposition) is complete in PR #180 and merged on `main` as `822da0d6bde69bb9c25fc77fa1e55641ae67ff61`. Slice 3 (`server.ts` decomposition) is complete in PR #182 and merged on `main` as `7b13b1723f400da4207c6112b314065cc2a4d7fd`; it remains separate from the active Email/SMS work.

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

`src/App.tsx` was an oversized application orchestration hub. Slice 2 decomposes it incrementally without changing product behavior.

Merged implementation in PR #180:

- procurement lifecycle state and mutations are owned by `src/features/procurement/useProcurementController.ts`;
- inventory, project materials/equipment, canonical equipment, and warehouse movement state/mutations are owned by `src/features/inventory/useInventoryEquipmentController.ts`;
- Cash & Banking state and reconciliation/transfer mutations are owned by `src/features/finance/useCashBankingController.ts`;
- `App.tsx` retains authentication, navigation, workspace synchronization, cross-domain synchronization/derived views, payroll and remaining invoice/expense orchestration, and `AppRouter` composition;
- the controllers expose explicit typed workspace/mutation contracts rather than persistence modules or a replacement global state bag;
- no database, migration, provider, production, or PR #176-owned Email/SMS reliability files changed.

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

Slice 2 materially advances these goals but does not claim that `App.tsx` is fully decomposed. Payroll/workforce, invoice/expense orchestration, engineering/document coordination, and broad `AppRouter` composition remain in `App.tsx`; those retained responsibilities are deliberate boundaries rather than a replacement mega-controller. PR #180 exact-head protected CI passed Application Validation & Build, Database Migrations & Upgrade Suite, `chromium-demo-qa`, and Graph and Source Contract Consistency before merge.

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

#### Slice 3 implementation status — 2026-09-18

The behavior-preserving decomposition was merged in PR #182. `server.ts` is reduced from 1,925 lines to 118 lines and now owns bootstrap, common middleware/body parsing, health, router mounting, Vite/static serving, and listen startup. Server authorization has one fail-closed implementation boundary at `src/server/auth/serverAuthorization.ts`.

The moved API boundaries are `publicProspects/publicProspectRouter.ts`, `ai/companyAiRouter.ts`, `invoiceExtraction/invoiceExtractionRouter.ts` plus its schema/service modules, `documentDelivery/documentDeliveryRouter.ts`, `documentDelivery/issuedDocumentRouter.ts` plus shared delivery helpers, `messaging/messagingRouter.ts`, and `storage/storageHealthRouter.ts`. The existing assistant, storage, document-template, AI, document-delivery, and messaging implementations remain the underlying authorities.

At the final reviewed PR head, focused authorization/router coverage, 191/191 affected application tests, TypeScript lint/typecheck, production build, Workflow Map consistency, Database Migration & Invariant Tests, and Demo Visual QA passed. No database, migration, provider-runtime, production, or PR #176-owned files changed in this slice.

#### Slice 4 implementation status — 2026-09-18

Slice 4 is implemented as the staged static-analysis and TypeScript-hardening slice. `eslint.config.mjs` now runs ESLint over JavaScript and TypeScript source while ignoring generated/transient outputs (`node_modules`, `dist`, `artifacts`, `coverage`, and `.worktrees`). Its repository-wide baseline is limited to six correctness rules: `no-debugger`, `no-duplicate-case`, `no-dupe-else-if`, `no-unreachable`, `no-unsafe-finally`, and `no-self-assign`.

The stronger TypeScript boundary is explicit for `server.ts`, the server authorization/assistant/public-prospect/storage routers, and the three extracted procurement, inventory, and cash-banking controllers. That surface enforces `@typescript-eslint/no-explicit-any` and `@typescript-eslint/ban-ts-comment` as errors. Package scripts now expose `lint:eslint` (`eslint .`) and `typecheck` (`tsc --noEmit`), with `lint` retaining both as the combined quality gate. TypeScript enables `forceConsistentCasingInFileNames`, `noFallthroughCasesInSwitch`, and `noImplicitOverride`; full repository-wide `strict: true` remains intentionally deferred. No Prettier, product behavior, database, provider, or production surface was added or changed.

#### Slice 5 implementation status — Wave A — 2026-09-18

Procurement secondary-module decomposition has started in Wave A. Purchase Order register presentation now lives in `src/components/procurement/PurchaseOrderRegisterSection.tsx`, and RFQ/Supplier Quotation register presentation now lives in `src/components/procurement/RfqRegisterSection.tsx`. `ProcurementPage.tsx` remains the owner of business state, filtering and derived metrics, lifecycle/mutation callbacks, routing context, and Purchase Order/RFQ/quotation modal orchestration. Subcontract, claim, and variation decomposition remains intentionally deferred. No database, financial-semantic, provider, or production contract changed; this does not complete the broader secondary-large-module program.

#### Slice 5 implementation status — Wave B — 2026-09-18

Wave B completes the next presentation boundary: the Subcontract register workspace now lives in `src/components/procurement/SubcontractRegisterSection.tsx`. The extracted section owns the Subcontract tab's KPI cards, filters, responsive card/table presentation, empty state, row display, Claims/Variations entry points, View/Edit entry, and lifecycle action presentation. `ProcurementPage.tsx` remains the owner of subcontract, claim, and variation state; filtering; parent-derived financial/register row models; committed-cost, claim, retention, and certified-value derivation; permissions; demo/live persistence; lifecycle/mutation callbacks; routing context; and all editor/drawer/detail/cancellation orchestration. The existing Claim and Variation components remain authoritative and were not duplicated.

After the extraction, `ProcurementPage.tsx` is 1,494 lines in the reviewed working tree. No database, financial-semantic, provider, production, route, or persistence contract changed. Slice 5 Wave B is complete as this focused presentation extraction, but the broader secondary-module and repository professionalization program remains incomplete; this status must not be read as completion of all of Slice 5 or later slices.
 
#### Slice 5 implementation status — Wave C — 2026-09-18
 
Wave C extracts the Projects portfolio and register presentation into `src/components/projects/ProjectPortfolioRegisterSection.tsx`. The extracted section owns the portfolio snapshot disclosure, project counts, attention-signal counts, multi-currency portfolio financial totals, search/status/manager/currency/health/attention filters, sort selector and direction toggles, filter reset, responsive desktop table, mobile/tablet cards (`ProjectRegisterCard`), status/health/attention badges, tax-treatment display, financial metric cells, work-package summaries, and Open/Edit/Lifecycle action presentation.
 
`ProjectsPage.tsx` remains the authoritative owner of project source data, cost summaries, client billing/collection data, permissions, completeness checks, `buildProjectManagementView(...)`, `buildPortfolioManagementSummary(...)`, `filterAndSortProjectViews(...)`, filter and sort state, manager and currency option derivation, editing draft creation and validation, project save orchestration, lifecycle preview loading, lifecycle actions, lifecycle reason/error/loading state, lifecycle and editing dialogs, and route/open behavior.
 
After the extraction, `ProjectsPage.tsx` is reduced from 1,414 lines to 713 lines. No database, financial-semantic, provider, production, route, or persistence contract changed. Slice 5 Wave C is complete as this focused presentation extraction. Excel-native implementation remains deferred; no grid or spreadsheet dependency/code was added. The broader secondary-module and repository professionalization program remains in progress.

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

PR #176 (`phase-2-authenticated-request-recovery`) remains isolated from this professionalization track and owns:

- `src/lib/authenticatedRequestRecovery.ts`
- `src/lib/companyApi.ts`
- `tests/authenticatedRequestRecovery.test.ts`

PR #180 did not edit those files. Any later App/server decomposition must continue consuming the Email/SMS reliability implementation rather than reimplementing or competing with it.

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

Implement each slice as a dedicated feature branch and PR separate from the Email/SMS reliability PR. Keep commits slice-oriented and reviewable. Before opening a PR, review the complete diff for accidental behavior changes, stale branding, duplicated abstractions, and scope creep.

Codex/local implementation must not merge its own PR. A separate review pass should inspect the exact final head, applicable CI, mergeability, and unresolved blockers before merge.

## Success criteria

An external engineer reviewing the repository should be able to determine quickly that:

- this is a current business operations platform, not the original toy invoice application;
- the product has real persistence, authorization, financial lifecycle semantics, migrations, tests, CI, deployment, and QA infrastructure;
- the repository has clear architectural boundaries and documented invariants;
- the two largest orchestration files are being reduced into understandable, testable units rather than accumulating more unrelated behavior;
- documentation and metadata describe the live system rather than an obsolete historical state.
