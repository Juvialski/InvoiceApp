# Repository Professionalization Continuation Design

Date: 2026-09-17
Repository: `Juvialski/InvoiceApp`
Baseline `main`: `1bc25b72cec3649115dc27a03f6d2a5b70fad589`
Predecessor design: `docs/superpowers/specs/2026-09-17-repository-architecture-professionalization-design.md`

## Purpose

Continue the Repository & Architecture Professionalization program after Slice 1 completed in PR #178.

The next work is not cosmetic cleanup. It has four linked goals:

1. reduce the largest architectural concentration risks in `src/App.tsx` and `server.ts`;
2. make ordinary domain changes require less irrelevant repository context, improving Codex token efficiency, edit reliability, test selection, and review speed;
3. close real static-analysis and repository-hygiene gaps identified by independent employer-style review;
4. make the public repository easy for a human engineer or hiring manager to understand without hiding the repository's AI-assisted development workflow.

This program must preserve current product behavior, financial semantics, company isolation, authorization, RLS, audit/history rules, routes, provider boundaries, and active product sequencing.

## Evidence motivating the continuation

Independent review of the current repository identified a mixed but credible engineering profile: strong database/security/CI discipline alongside concentrated application orchestration and uneven repository polish.

The following findings are treated as real engineering debt and therefore belong in this program:

- `src/App.tsx` is a multi-domain orchestration hub with very high state/effect/import coupling.
- `server.ts` remains a large API/composition hub even though several server domains are already factored into dedicated modules.
- other large UI modules such as Procurement, Projects, and Blueprint viewing may require follow-up decomposition after the two central hubs are reduced.
- `npm run lint` currently performs TypeScript checking only; there is no dedicated ESLint configuration.
- `tsconfig.json` does not enable TypeScript strict mode.
- current source still contains some stale Engoryx wording/identifiers that are not required compatibility contracts.
- `artifacts/` is ignored for new files while historical evidence files remain intentionally tracked, creating an unclear repository policy.
- the public repository is still named `InvoiceApp`, while the product is HydroQualiSense.
- human onboarding is weaker than agent onboarding: the repository contains strong invariants and agent instructions, but a new human engineer should not need to begin with `AGENTS.md` to understand the system.

The following observations are **not** treated as defects by themselves:

- explicit use of ChatGPT/Codex is not something to hide;
- lack of an open-source `LICENSE` is not automatically a problem for a commercial/proprietary codebase;
- generic `CONTRIBUTING.md`, issue templates, badges, or boilerplate policy files are not required unless they serve a real repository workflow;
- historical Engoryx filenames or compatibility identifiers may remain when changing them would break persisted data, migrations, storage paths, protocols, or historical references.

## Program principles

### 1. Architecture must reduce context surface

A successful decomposition is not measured by file count alone.

The target is that a future domain task can normally be understood through a small, bounded path such as:

`route/page -> domain controller -> domain persistence/service -> focused tests`

rather than requiring Codex to repeatedly ingest the full `App.tsx` or `server.ts`.

For each extracted unit, it should be possible to answer without reading unrelated domains:

- what responsibility does this unit own?
- what inputs does it accept?
- what stable interface does it expose?
- what persistence/services does it depend on?
- what focused tests prove its behavior?

Do not replace one monolith with a `useAppController.ts`, `serverHelpers.ts`, or other mega-module that merely moves the same coupling.

### 2. Optimize agent efficiency without weakening correctness

The program should reduce:

- irrelevant source loaded into context;
- unnecessary cross-domain searches;
- repeated edits to central high-conflict files;
- oversized diffs for otherwise local changes;
- overly broad test selection caused by shared-file fan-out;
- review effort caused by unrelated code appearing in the same change surface.

The program must **not** reduce financial, security, database, browser, or migration validation when those risk domains are actually affected.

### 3. Preserve source-of-truth boundaries

Refactoring must not alter:

- one deployment -> one client company;
- company membership, permission, RLS, and company-bound authorization;
- supplier payable/cost authority versus settlement evidence;
- client billing versus collection;
- payroll detail versus project labor aggregation;
- inventory movements versus derived balances;
- immutable/finalized financial and document history;
- mixed-currency safeguards;
- unknown monetary values remaining unknown rather than silently becoming zero;
- AI confirmation and permission boundaries;
- provider readiness truth and human send confirmation.

### 4. Prefer incremental extraction over rewrite

Each slice should preserve behavior and move one coherent responsibility at a time.

No React/Express/Supabase replacement, no new global state framework merely for cleanup, no database redesign, and no mass formatting churn mixed with architectural changes.

## Sequence

Slice 1 is complete. The continuation is intentionally split so each slice can be reviewed and rolled back independently.

### Slice 2 — `src/App.tsx` decomposition and context-surface reduction

This is the highest-priority architectural slice.

Target end state:

- `App.tsx` remains the public/authenticated composition entry point.
- session, navigation, top-level workspace synchronization, and cross-domain integration remain clearly separated from business-domain state.
- domain controllers/hooks own domain-specific loading, state transitions, persistence calls, and mutation orchestration.
- likely controller boundaries should follow existing product domains rather than arbitrary file-size targets, for example:
  - projects + procurement;
  - finance + banking + supplier/client financial flows;
  - payroll + workforce;
  - inventory + equipment;
  - engineering + documents.
- existing `src/features`, `src/lib`, `src/context`, and route patterns remain authoritative.
- `AppRouter` receives narrow, typed domain contracts rather than an ever-growing flat prop bag where practical.

Implementation method:

1. inventory the current `App.tsx` state/effect/callback groups and map them to existing domain ownership;
2. extract one coherent domain at a time;
3. add or reuse focused tests before changing integration wiring;
4. keep shared cross-domain lifecycle coordination in `App.tsx` only when it is genuinely cross-domain;
5. stop and redesign if an extraction requires a giant generic controller or widespread behavior changes.

Acceptance criteria:

- ordinary work in an extracted domain no longer requires reading the full `App.tsx` to understand mutations and persistence;
- `App.tsx` is materially smaller and primarily coordinates composition/lifecycle rather than containing domain implementations;
- no replacement mega-hook or mutable global state bag is introduced;
- route/deep-link behavior remains compatible;
- financial/security/history invariants are unchanged;
- affected-test selection becomes at least as narrow as before for domain-local edits and ideally narrower because fewer changes hit the central application file;
- future Codex prompts can normally point to a domain controller plus its service/persistence/tests instead of treating `App.tsx` as mandatory context.

### Slice 3 — `server.ts` decomposition and auditable server boundaries

Target end state:

- `server.ts` owns startup, common middleware, environment/bootstrap composition, and router mounting.
- request authentication and company authorization live behind a dedicated auditable server authorization module while preserving fail-closed behavior.
- existing server modules for messaging, document templates, storage, Assistant, AI, and related concerns remain authoritative rather than being duplicated.
- remaining inline endpoints move into domain routers/services based on responsibility.
- status codes, error codes, idempotency, permission requirements, provider behavior, request/response contracts, and server-only secret handling remain stable.

Acceptance criteria:

- a domain API change can normally be reasoned about through its router/service/auth boundary without reading the full server bootstrap file;
- authorization has a single clear implementation boundary and focused tests;
- `server.ts` is materially smaller and reads primarily as composition;
- provider/environment resolution remains server-only;
- no DB/RLS/RPC contract changes are introduced unless a separately proven defect requires them.

### Slice 4 — Static analysis and TypeScript hardening

Do this after the two central decomposition slices so strictness work is applied to clearer module boundaries rather than a monolith.

Scope:

- introduce ESLint with a deliberately small, useful rule set for correctness and maintainability rather than style churn;
- keep formatting policy simple; add Prettier only if it clearly reduces review noise and does not cause a repository-wide rewrite;
- define a staged path toward stronger TypeScript strictness;
- prefer making extracted/new modules strict first, then expanding coverage domain by domain;
- do not enable repository-wide strict mode in one uncontrolled flip if that would create hundreds of low-value casts or suppressions;
- prohibit broad `@ts-ignore`, unsafe `any`, or mass type assertions as a way to claim strictness completion.

Acceptance criteria:

- `npm run lint` performs an actual lint/static-analysis step rather than only `tsc --noEmit`;
- typechecking remains a separate explicit validation step or is clearly composed into the validation command without misleading naming;
- new/extracted modules have stronger type guarantees than the current baseline;
- strictness expands through measured fixes, not suppression debt;
- CI fast-pass behavior remains proportional.

### Slice 5 — Secondary large-module triage

After Slices 2-4, re-measure the largest remaining modules instead of blindly decomposing every large file.

Likely review targets include:

- Procurement page/workspace;
- Projects page/workspace;
- Blueprint viewer;
- other components with unusually high state/effect/event-handler concentration.

Decision rule:

File length alone is not enough. Decompose only when a module owns multiple independent responsibilities, produces broad context requirements, creates high conflict frequency, or makes focused testing difficult.

Acceptance criteria:

- each selected module is split along product/workflow boundaries, not arbitrary line-count boundaries;
- route/page components remain understandable entry points;
- no explosion of tiny files or indirection that increases context hopping;
- post-change domain tasks require fewer unrelated files, not more.

### Slice 6 — Repository hygiene and evidence policy

Scope:

- audit remaining live Engoryx references and classify each as:
  - stale current branding to rename;
  - historical documentation reference to retain;
  - compatibility/persisted identifier that must remain stable.
- define an explicit tracked-artifact policy:
  - curated evidence intentionally committed to the repository must live in a clearly documented tracked location/pattern;
  - transient generated QA output should remain ignored and be supplied through CI artifacts where appropriate;
  - eliminate the current ambiguity where `artifacts/` is ignored while selected contents are force-tracked without a clear policy.
- evaluate renaming the GitHub repository from `InvoiceApp` to `HydroQualiSense` only after checking Render, GitHub Actions, external links, deployment hooks, and local remotes.
- do not rename stable database/storage/history identifiers solely for appearance.

Acceptance criteria:

- current source no longer contains avoidable stale product branding;
- artifact tracking is intentional and documented;
- any repository rename is performed as a dedicated integration-aware change, not hidden inside another refactor;
- no compatibility contracts are broken for cosmetic reasons.

### Slice 7 — Human onboarding and employer-facing repository clarity

The repository should remain optimized for the actual ChatGPT/Codex workflow while also being understandable to a human engineer.

Scope:

- keep `AGENTS.md` because it documents the real development/validation process;
- make README and architecture docs the human front door rather than expecting a reviewer to start with agent policy;
- add one concise current architecture diagram or equivalent visual overview that shows browser/UI, domain controllers, server APIs, Supabase/Postgres/RLS/Storage, and provider boundaries;
- add a small number of current product screenshots only when they improve understanding rather than becoming a marketing gallery;
- provide a human-oriented local-development walkthrough covering prerequisites, environment setup, startup, focused tests, and where major domains live;
- document AI-assisted development honestly as an engineering workflow with review/validation controls, not as something to conceal or apologize for.

Do not add boilerplate `CONTRIBUTING.md`, issue templates, or open-source licensing merely to imitate a large public OSS project. Add those only if the actual repository workflow requires them.

Acceptance criteria:

- a technical reviewer can understand what HydroQualiSense is, how it is structured, how it is tested, and how to run it without reading agent-only instructions first;
- the repository clearly shows the distinction between product architecture, engineering invariants, active roadmap, and agent execution policy;
- documentation claims remain evidence-based and do not imply compliance, uptime, provider readiness, or production certification that has not been proven.

## Agent-efficiency acceptance standard

The architectural slices should be judged partly on whether they reduce the context needed for routine work.

Do not spend significant runtime trying to calculate exact token savings. Use cheap structural evidence instead:

- whether a domain task can avoid opening the full `App.tsx`/`server.ts`;
- whether domain-local changes avoid touching central composition files;
- whether affected-test selection remains focused;
- whether controller/router interfaces are narrow and typed;
- whether final diffs contain mostly the changed domain rather than unrelated orchestration;
- whether a bounded `agent:context` packet can represent the task without truncating away relevant code.

If decomposition increases file hopping, duplicate abstractions, or required context, treat that as a failed design even if individual files become shorter.

## Interaction with active Email/SMS work

PR #176 remains open and owns:

- `src/lib/authenticatedRequestRecovery.ts`;
- `src/lib/companyApi.ts`;
- `tests/authenticatedRequestRecovery.test.ts`.

This documentation does not change the active product sequence. Email/SMS reliability remains the active product track.

Do not start Slice 2 implementation from a stale baseline or edit PR #176-owned files while that work is active. When Slice 2 is actually started:

1. synchronize to the then-current merged `main`;
2. re-read live `AGENTS.md`, efficiency guide, active roadmap, handoff, this design, and the current `App.tsx`;
3. incorporate the merged authenticated-request-recovery behavior rather than recreating it;
4. generate only one bounded context packet when useful;
5. execute focused -> affected validation proportionally.

## Validation strategy by slice

Slice 2:
- focused tests for each extracted controller/domain contract;
- focused route/workspace tests;
- `npm.cmd run test:affected:agent`;
- TypeScript check/build;
- browser/Workflow Map checks only where composition/routing changes make them relevant.

Slice 3:
- focused authorization/router/API contract tests;
- `npm.cmd run test:affected:agent`;
- TypeScript check/build;
- no Docker/Supabase unless a DB/RLS/RPC contract is actually changed.

Slice 4:
- lint/typecheck rule tests/config validation where applicable;
- focused fixes for the strictness scope being enabled;
- affected tests + build;
- avoid repository-wide format churn.

Slice 5:
- focused component/controller tests for selected modules;
- affected tests;
- browser/visual validation where user flows or layout composition are touched.

Slices 6-7:
- proportional documentation/source-contract/build validation based on exact files changed;
- no provider/DB/production validation for documentation-only cleanup;
- integration validation if the repository itself is renamed.

`test:full` remains exceptional: use it only when impact analysis falls back, shared contracts genuinely broaden, failures justify it, release/deep-regression work requires it, or the user explicitly asks for it.

## Stop boundaries

Each slice should stop after its stated acceptance criteria are satisfied.

Do not use spare time in one slice to begin the next architectural domain. Do not combine a central refactor, repository-wide formatting, static-analysis migration, and product feature work into one PR.

No slice may mutate production merely because its PR merges.

## Program success criteria

The continuation is successful when:

- an employer can see real engineering discipline without needing to infer it from thousands of files;
- AI-assisted development is visible as a controlled workflow backed by tests, security checks, and review rather than as an excuse for architectural sprawl;
- `App.tsx` and `server.ts` are no longer mandatory giant context surfaces for ordinary domain work;
- domain changes produce smaller, more focused diffs and validation sets;
- static analysis and TypeScript guarantees better match the maturity of the database/security test infrastructure;
- stale branding and artifact-policy ambiguity are resolved without breaking compatibility;
- a human engineer can onboard from README/architecture documentation while `AGENTS.md` remains the authoritative agent execution policy.
