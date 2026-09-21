# TypeSafe Jev Developer Intelligence Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in, developer-only TypeSafe Jev advisory layer around deterministic Repository Intelligence and test-impact candidates, then measure whether it reduces bounded context without weakening required validation.

**Architecture:** Keep the official `@typesafe-ai/sdk` behind `scripts/developer-intelligence/typesafe/`. RI/Workflow Map and `test:affected:agent` remain candidate and safety authorities; a fail-closed sanitizer and bounded SDK adapter provide optional typed judgments, with deterministic fallback on every unavailable or invalid path. A unified CLI exposes doctor, context, test-triage, CI-triage, completion, and benchmark commands without changing the application bundle or normal CI.

**Tech Stack:** TypeScript/Node ESM, built-in `node:test`, existing RI-1/RI-2/RI-3 scripts, existing `ci-failure-context` helpers, official `@typesafe-ai/sdk@0.6.0`, `tsx` for developer CLI execution.

**Spec:** `docs/superpowers/specs/2026-09-21-typesafe-developer-intelligence-pilot-design.md`

## Global Constraints

- TypeSafe is an advisory System One decision layer, never implementation, financial, security, database, authorization, lifecycle, or merge authority.
- The deterministic RI/Workflow Map candidate generator remains the only source of context candidates; Jev may rank/filter only that bounded collection.
- `test:affected:agent` remains the final authoritative test gate; TypeSafe may prioritize but never suppress required tests.
- `agent:context` default behavior remains unchanged; TypeSafe use is explicit through the dedicated `typesafe context` command and `--live` opt-in.
- Never send secrets, environment values, credentials, tokens, connection strings, private keys, customer documents, invoices/receipts, payroll/personnel data, production/QA data, database dumps, private communications, session state, or sensitive logs.
- The official SDK reads `TYPESAFE_API_KEY` only from the process environment; its value must never be printed, persisted, committed, or included in request state.
- Normal CI and automated tests must not make live TypeSafe requests; tests inject a mock transport.
- All TypeSafe inputs are bounded and sanitized; sanitizer rejection falls back without constructing a live request.
- No application/runtime import, customer-facing route, migration, RLS/RPC, provider, browser, production, or Supabase change is allowed.
- The benchmark must report measured character counts and an explicitly labeled `ceil(characters / 4)` estimate; it must not fabricate token savings or adoption claims.
- Use zero subagents, focused tests while editing, one integrated affected-test run, and no ritual full-suite run beyond deterministic selector fallback caused by package metadata changes.

## Review Focus

- A secret-looking value embedded in a candidate, failure excerpt, or completion input must be rejected before the SDK call and must not appear in diagnostics; covered by Task 1 sanitizer tests.
- A TypeSafe response that omits candidates, uses an invalid score, or returns an unexpected category must trigger deterministic fallback; covered by Tasks 1–3 response-contract tests.
- Required deterministic tests and context must-keep files must remain present even when Jev ranks them low; covered by Task 2/3 must-keep tests.
- An explicit `--live` command must be the only CLI path that can spend credits, while default commands and normal CI stay offline; covered by Task 4 CLI tests.
- The benchmark must distinguish mock mechanics, live evidence, and fallback/no-evidence results instead of claiming savings from a failed or skipped live call; covered by Task 4 benchmark tests.

### Task 1: Sanitized official SDK adapter and doctor

**Files:**
- Create: `scripts/developer-intelligence/typesafe/contracts.ts`
- Create: `scripts/developer-intelligence/typesafe/sanitize.ts`
- Create: `scripts/developer-intelligence/typesafe/client.ts`
- Create: `scripts/developer-intelligence/typesafe/doctor.ts`
- Test: `tests/typesafeDeveloperIntelligence.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces `TypeSafeFallbackReason`, `TypeSafeDiagnostic`, `TypeSafeCallResult<T>`, `TypeSafeGateway`, `SanitizedCandidate`, `hasTypeSafeApiKey`, `sanitizeTypeSafePayload`, `invokeTypeSafe`, and `runTypeSafeDoctor` for later tasks.
- `TypeSafeGateway.systemOne(request, options)` accepts JSON-safe `state` and `questions` and returns the official SDK result shape through an injected interface.

- [ ] **Step 1: Write failing sanitizer and adapter tests**

  Add tests that assert:

  ```ts
  assert.equal(hasTypeSafeApiKey({ TYPESAFE_API_KEY: "ts-test-only" }), true);
  assert.equal(hasTypeSafeApiKey({ TYPESAFE_API_KEY: "   " }), false);
  assert.equal(sanitizeTypeSafePayload({ path: ".env", value: "x" }).ok, false);
  assert.equal(sanitizeTypeSafePayload({ text: "DATABASE_URL=postgres://user:secret@host/db" }).ok, false);
  assert.equal(sanitizeTypeSafePayload({ task: "synthetic", candidates: [{ id: "a", path: "src/a.ts" }] }).ok, true);
  ```

  Add adapter tests with an injected mock gateway for success, missing-key fallback, API failure, timeout, invalid response, bounded diagnostics, and the guarantee that the mock never receives the secret value.

- [ ] **Step 2: Run the focused test to verify the expected RED failure**

  Run:

  ```text
  node --test --experimental-strip-types tests/typesafeDeveloperIntelligence.test.ts
  ```

  Expected: FAIL because the new TypeSafe contracts and sanitizer exports do not yet exist.

- [ ] **Step 3: Implement the minimal contracts, sanitizer, lazy SDK adapter, and doctor**

  Use `@typesafe-ai/sdk@0.6.0` with `TypeSafeClient`, `choice`/`noul`/`score`, `logLevel: "off"` for pilot calls, per-call timeout, and `retry.maxRetries: 0`. Read only environment presence; map failures to closed diagnostic reasons without returning raw error messages. Reuse `classifyTrackedPath` for path exclusion and add bounded high-confidence secret/customer-data pattern checks. Make doctor’s live check synthetic and parse one closed `choice` answer.

- [ ] **Step 4: Run the focused test to verify GREEN**

  Run the same command. Expected: all Task 1 tests pass with no live request.

- [ ] **Step 5: Commit the foundation**

  ```text
  git add package.json package-lock.json scripts/developer-intelligence/typesafe tests/typesafeDeveloperIntelligence.test.ts docs/superpowers/specs/2026-09-21-typesafe-developer-intelligence-pilot-design.md
  git commit -m "feat: add sanitized TypeSafe developer adapter"
  ```

### Task 2: RI-bounded context reranking and test triage

**Files:**
- Create: `scripts/developer-intelligence/typesafe/contextReranker.ts`
- Create: `scripts/developer-intelligence/typesafe/testTriage.ts`
- Test: `tests/typesafeDeveloperIntelligence.test.ts`

**Interfaces:**
- Consumes Task 1 `TypeSafeGateway`, sanitizer, and result contracts.
- Produces `ContextCandidate`, `ContextRerankOptions`, `ContextRerankResult`, `rerankContextCandidates`, `TestTriageOptions`, `TestTriageResult`, and `triageAffectedTests`.

- [ ] **Step 1: Write failing context/test-triage tests**

  Add tests for one batched request over deterministic candidates, explicit `mustKeep` preservation, deterministic tie ordering, TypeSafe failure fallback, and test triage returning every input `selectedTests` as `requiredTests` even when the mock ranks one test low.

- [ ] **Step 2: Run the focused test to verify RED**

  ```text
  node --test --experimental-strip-types tests/typesafeDeveloperIntelligence.test.ts
  ```

  Expected: FAIL because reranking and triage exports do not yet exist.

- [ ] **Step 3: Implement bounded batched advisory logic**

  Build one question per bounded candidate in one request, select optional context by validated probability/score, retain every `mustKeep` candidate, and return the original deterministic collection on fallback. Accept only an existing `ImpactSelectionResult` for test triage; return advisory ordering/groups plus an unchanged `requiredTests` list. Never call RI or discover repository paths from inside Jev.

- [ ] **Step 4: Run focused tests GREEN**

  Run the focused file again. Expected: all Task 1 and Task 2 tests pass with mock transport only.

- [ ] **Step 5: Commit the bounded ranking helpers**

  ```text
  git add scripts/developer-intelligence/typesafe/contextReranker.ts scripts/developer-intelligence/typesafe/testTriage.ts tests/typesafeDeveloperIntelligence.test.ts
  git commit -m "feat: add advisory context and test triage"
  ```

### Task 3: CI failure triage and completion/evidence checks

**Files:**
- Create: `scripts/developer-intelligence/typesafe/ciTriage.ts`
- Create: `scripts/developer-intelligence/typesafe/completionCheck.ts`
- Test: `tests/typesafeDeveloperIntelligence.test.ts`

**Interfaces:**
- Consumes Task 1 adapter/sanitizer and the existing `scripts/ci-failure-context.ts` bounded excerpt helper.
- Produces `CiFailureCategory`, `classifyCiFailure`, `CompletionCheckInput`, `CompletionCheckResult`, and `checkCompletionEvidence`.

- [ ] **Step 1: Write failing classification/evidence tests**

  Add tests for all closed CI categories, deterministic fallback parsing for lint/browser/database excerpts, sanitizer rejection of a secret-bearing excerpt, evidence checks for changed developer tooling, and the invariant that `mergeDecision` is always `"not-provided"`.

- [ ] **Step 2: Run focused tests RED**

  ```text
  node --test --experimental-strip-types tests/typesafeDeveloperIntelligence.test.ts
  ```

  Expected: FAIL because CI/completion exports do not yet exist.

- [ ] **Step 3: Implement the bounded advisory checks**

  Use a single closed `choice` for CI category classification and bounded `noul` questions for independent evidence observations when live mode is enabled. Use deterministic pattern classification and evidence rules as fallback. Return explicit expected categories, present categories, missing categories, uncertainty, and `mergeDecision: "not-provided"`; never retry or alter code automatically.

- [ ] **Step 4: Run focused tests GREEN**

  Run the focused file again. Expected: all Task 1–3 tests pass without live calls.

- [ ] **Step 5: Commit CI/completion advisory logic**

  ```text
  git add scripts/developer-intelligence/typesafe/ciTriage.ts scripts/developer-intelligence/typesafe/completionCheck.ts tests/typesafeDeveloperIntelligence.test.ts
  git commit -m "feat: add advisory CI and evidence triage"
  ```

### Task 4: Unified CLI, RI wrapper, benchmark, and developer documentation

**Files:**
- Create: `scripts/developer-intelligence/typesafe/contextCommand.ts`
- Create: `scripts/developer-intelligence/typesafe/benchmark.ts`
- Create: `scripts/developer-intelligence/typesafe/cli.ts`
- Test: `tests/typesafeDeveloperIntelligence.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json` only if npm normalizes the scripts/dependency lock
- Modify: `docs/AGENT_EXECUTION_EFFICIENCY.md`
- Modify: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`
- Modify: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`
- Modify: `AGENTS.md` only if benchmark evidence supports standard workflow adoption

**Interfaces:**
- Consumes Tasks 1–3 and the existing RI/Workflow Map/test-impact interfaces.
- Produces the executable `npm.cmd run typesafe -- <subcommand>` CLI and deterministic ten-fixture benchmark result.

- [ ] **Step 1: Write failing CLI/benchmark tests**

  Add tests for offline default behavior, explicit `--live` gating, deterministic benchmark fixture order, 100% must-keep retention, measured character/token-estimate fields, and CLI parsing for `doctor`, `context`, `test-triage`, `ci-triage`, `completion`, and `benchmark`.

- [ ] **Step 2: Run focused tests RED**

  ```text
  node --test --experimental-strip-types tests/typesafeDeveloperIntelligence.test.ts
  ```

  Expected: FAIL because the unified CLI, RI wrapper, and benchmark exports do not yet exist.

- [ ] **Step 3: Implement the opt-in CLI and deterministic fixture benchmark**

  `contextCommand.ts` must obtain candidates only from the current RI-3 packet (`primarySource`, `supportingSource`, and explicit changed paths), pass them through the sanitizer/reranker, and never replace the normal `agent:context` output. Structured commands read bounded JSON/log input and return compact JSON/Markdown diagnostics. The benchmark defines exactly ten synthetic fixtures: UI worksheet, project hierarchy, migration/RLS, finance, documentation, CI lint, CI browser, supplier invoice UI, procurement, and RI tooling. Offline benchmark mode uses a deterministic mock gateway and labels itself `mock`; `--live` uses one batched request and labels live latency/fallbacks.

- [ ] **Step 4: Run focused tests GREEN**

  Run the focused file again. Expected: all Task 1–4 tests pass with no live request.

- [ ] **Step 5: Run the benchmark and the explicit live doctor smoke**

  Run:

  ```text
  npm.cmd run typesafe -- benchmark
  npm.cmd run typesafe -- doctor --live
  ```

  Expected: benchmark emits ten deterministic fixture rows and measured metrics; doctor emits only bounded parsed metadata. If live benchmark evidence is useful and credits permit, run `npm.cmd run typesafe -- benchmark --live` once; do not repeat live calls.

- [ ] **Step 6: Reconcile documentation with measured evidence**

  Update the efficiency guide, active roadmap, and current handoff with the exact pilot status, SDK version, command names, benchmark mode/results, and limitations. Update `AGENTS.md` only if the benchmark meets the adoption criteria; otherwise record the pilot as experimental/deferred and preserve the deterministic workflow as standard.

- [ ] **Step 7: Commit CLI, benchmark, and evidence documentation**

  ```text
  git add scripts/developer-intelligence/typesafe tests/typesafeDeveloperIntelligence.test.ts package.json package-lock.json docs/AGENT_EXECUTION_EFFICIENCY.md docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md docs/HYDROQUALISENSE_CURRENT_HANDOFF.md AGENTS.md
  git commit -m "feat: add opt-in TypeSafe developer intelligence pilot"
  ```

### Task 5: Integrated verification and delivery

**Files:**
- Review: complete final diff and exact changed-file list
- Test: existing focused RI/developer-tooling tests plus affected selector

**Interfaces:**
- Consumes all prior task outputs; produces exact-head verification evidence and one focused PR.

- [ ] **Step 1: Run the focused developer-tooling and RI tests**

  ```text
  node --test --experimental-strip-types tests/typesafeDeveloperIntelligence.test.ts tests/repositoryIntelligence.test.ts tests/repositoryIntelligenceGraph.test.ts tests/repositoryIntelligenceContext.test.ts tests/agentEfficiency.test.ts
  ```

  Expected: all selected tests pass; any failure is diagnosed before proceeding.

- [ ] **Step 2: Run the deterministic affected-test gate**

  ```text
  npm.cmd run test:affected:agent
  ```

  Expected: the selector reports its actual deterministic selection. Because `package.json` scripts/dependencies changed, a full fallback may be selected; report that exact result without weakening it.

- [ ] **Step 3: Run lint/typecheck and application build**

  ```text
  npm.cmd run lint
  npm.cmd run build
  ```

  Expected: lint/typecheck/build pass and the app bundle contains no TypeSafe import.

- [ ] **Step 4: Inspect the final diff and secret boundary**

  Check:

  ```text
  git diff --check
  git diff --name-only <starting-main-sha> HEAD
  git diff <starting-main-sha> HEAD -- . ':!package-lock.json' | rg -n "TYPESAFE_API_KEY|DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY|Bearer |sk_live|ghp_|xox[baprs]-"
  rg -n "@typesafe-ai/sdk|developer-intelligence/typesafe" src server.ts vite.config.* esbuild* 2>$null
  ```

  Expected: no secret values, no runtime import, no unrelated product changes, and no UX-W4.5E implementation.

- [ ] **Step 5: Commit any verification-only corrections and prepare the PR**

  Push `codex/typesafe-developer-intelligence-pilot`, open one PR against `main`, attach the PR artifact, and do not merge it locally.
