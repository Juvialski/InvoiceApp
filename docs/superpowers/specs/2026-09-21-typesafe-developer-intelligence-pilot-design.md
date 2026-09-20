# TypeSafe Jev Developer Intelligence Pilot

## Purpose

This pilot evaluates whether TypeSafe Jev can reduce developer context and phase
duration for HydroQualiSense without changing customer/runtime behavior or
weakening deterministic validation. It is an advisory System One decision layer
over existing Repository Intelligence and test-impact outputs.

The pilot is successful only if it produces measured, reproducible evidence. A
small or unreliable reduction is a valid result and must be recorded as
experimental/deferred rather than converted into an adoption claim.

## Non-goals

The pilot does not add invoice or accounting intelligence, production AI, model
routing, automatic subagents, browser automation, MCP deployment, autonomous PR
actions, financial/security/database authority, or a replacement for RI-3 or
`test:affected:agent`. It does not process customer documents, private runtime
data, database dumps, provider credentials, or production/QA data.

## Architecture

```text
deterministic RI / Workflow Map / test-impact candidates
        -> fail-closed sanitizer and bounded payload
        -> optional TypeSafe System One judgment
        -> advisory ranking/classification
        -> deterministic must-keep and validation rules
        -> Codex lead decision and normal validation gates
```

The implementation lives only under
`scripts/developer-intelligence/typesafe/` plus focused tests and developer
documentation. The application, server runtime, customer navigation, database,
provider adapters, and normal CI do not import or invoke TypeSafe.

### Components

- `contracts.ts` defines JSON-safe candidate, diagnostic, fallback, and advisory
  result contracts. Results explicitly state that they are advisory and never
  provide a merge decision.
- `sanitize.ts` reuses RI path classification and applies bounded content/path
  checks. It rejects secret-like paths, credentials, tokens, connection strings,
  private keys, customer artifacts, personnel/payroll data markers, and oversized
  or invalid payloads before a request is constructed.
- `client.ts` lazily constructs the official `@typesafe-ai/sdk` client, reads
  `TYPESAFE_API_KEY` only through the SDK/environment-presence check, applies a
  short per-request timeout and no retry for pilot calls, validates responses,
  and returns bounded diagnostic codes without raw errors or request bodies.
- `contextReranker.ts` accepts only deterministic candidate collections produced
  by RI/Workflow Map selection. It batches candidate judgments in one request,
  preserves explicit `mustKeep` candidates regardless of Jev output, and falls
  back to the original deterministic collection on any unavailable, rejected,
  timed-out, or invalid call.
- `testTriage.ts` consumes the existing `ImpactSelectionResult`; it can order or
  group tests but always returns the complete deterministic `selectedTests` set
  as required tests and never suppresses a test.
- `ciTriage.ts` consumes a bounded sanitized failure excerpt and classifies it
  into a closed category set. A deterministic pattern classifier is the fallback.
- `completionCheck.ts` evaluates declared scope/evidence and may add advisory
  observations. Its result is explicitly `mergeDecision: "not-provided"`.
- `benchmark.ts` owns ten synthetic, sanitized fixtures and computes actual
  candidate counts, character sizes, approximate token sizes, must-keep
  retention, relevance retention, removal, latency, and fallback metrics. A
  default mock mode tests mechanics without credits; one optional live batch is
  used only when explicitly requested.
- `cli.ts` exposes one unified developer command with `doctor`, `context`,
  `test-triage`, `ci-triage`, `completion`, and `benchmark` subcommands. Live
  requests require an explicit `--live` opt-in.

## TypeSafe contract

Use the official TypeScript/JavaScript SDK `@typesafe-ai/sdk` and its typed
`TypeSafeClient.systemOne` API. Batch independent `noul`, `score`, or `choice`
questions in one request when possible. The client is constructed lazily and
only in the developer tooling directory. Automated tests inject a mock transport
and never consume credits.

The connectivity doctor sends exactly one synthetic, non-repository state when
run with `--live`; it asks a closed `choice` question and reports only parsed
category, latency, model/usage metadata when safe, and bounded failure status.

## Privacy boundary

Only bounded metadata and synthetic task text may cross the boundary. The
sanitizer fails closed for obviously sensitive paths or patterns; prompt text
alone is not treated as protection. No `.env` content, environment values,
credentials, tokens, passwords, connection strings, private keys, uploaded
documents, invoices/receipts, payroll/personnel data, production/QA data,
database dumps, private communications, session state, or sensitive logs may be
sent. The SDK key is never included in a state object, logged, persisted, or
returned by diagnostics.

## Compatibility and authority

`agent:context` without a TypeSafe flag/wrapper remains byte-for-byte behaviorally
unchanged. The opt-in `typesafe context` command uses the existing deterministic
RI-3 candidate packet as its only candidate source. Stale/unavailable RI data
continues to use the existing Workflow Map/Git/test-impact fallback.

`test:affected:agent` remains the final authoritative gate. TypeSafe cannot
reduce its selection, change fallback thresholds, skip tests, or decide database,
financial, security, lifecycle, authorization, or merge safety.

## Benchmark decision rule

The benchmark must retain 100% of manually declared must-keep files and must not
send sensitive fixture input. It reports actual character counts and a clearly
labeled `ceil(characters / 4)` token estimate only when no repository tokenizer
is available. A meaningful context reduction target is at least 20% on
repository-heavy fixtures, but no percentage is claimed unless measured from a
live or explicitly labeled mock run. Documentation will record whether the
pilot should be adopted, adopted with constraints, or deferred.

## Rollback and validation

Removing the developer tooling directory, package scripts, and devDependency
restores the pre-pilot behavior. Normal CI has no live TypeSafe path. Validation
is focused tests, RI/developer-tooling tests, benchmark, one opt-in live smoke
when credentials are available, final `test:affected:agent`, lint/typecheck,
and an application build to prove no runtime bundle import. Docker/Supabase,
browser QA, provider QA, and production checks are not applicable unless the
final diff unexpectedly crosses those domains.
