# Jev Workflow Intelligence v2A Research and Integration Design Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a reproducible, privacy-safe research report and prioritized v2B design for deeper TypeSafe/Jev use in the Codex workflow without changing Jev's advisory-only authority boundary.

**Architecture:** Keep deterministic Repository Intelligence, Workflow Map, test-impact selection, sanitizer, risk-domain validation, and lead review authoritative. Add only offline-by-default experiment/evaluation helpers and sanitized fixtures when measurements require code; keep the normal Jev CLI unchanged unless a narrowly scoped experiment proves a change. Record official, X, community, and InvoiceApp evidence separately, then use labeled historical replay and live Jev diagnostics to choose v2B thresholds and checkpoint policies.

**Tech Stack:** TypeScript/Node 20, `@typesafe-ai/sdk` 0.6.0, existing `tsx` CLIs, Node test runner, Repository Intelligence metadata, Workflow Map metadata, Git history, Markdown research artifacts, authenticated Chrome for read-only X research, and official/community web sources.

**Spec:** `docs/repository-intelligence/JEV_WORKFLOW_INTELLIGENCE_V2_RESEARCH.md`

## Global Constraints

- Jev remains advisory only; deterministic source/test/authority/security/financial/database/browser/evidence decisions remain authoritative.
- Do not send secrets, credentials, customer data, private invoices, payroll PII, production records, raw browser/session data, or repository source contents to X or Jev.
- Preserve the existing sanitizer and 20,000-character cap; do not solve failures by making payloads arbitrarily large.
- Do not let Jev remove changed or must-keep files/tests, bypass required validation, choose production actions, or make a merge decision.
- v2A may add isolated offline experiment harnesses, sanitized fixtures, metrics, and focused tests; it must not broadly replace `agent:context`, `test:affected:agent`, CI triage, or runtime behavior.
- X research is read-only: search/open public material only; do not post, reply, like, repost, bookmark, follow, DM, change settings, or expose browser authentication material.
- Stop after v2A research/design; do not begin UX-W5, Vendor Master, workforce, Worker Registration, Finance rollout, Wide Documents, or the 3D explorer.

## Review Focus

- Empty clean-baseline candidate sets must produce an explicit deterministic seed/fallback path rather than a false Jev success; test with a task that has no current diff and a task with an exact file/domain selector.
- Candidate sets above the current 64-item ceiling must be chunked or staged without dropping must-keep items; test deterministic coverage, ordering, and tie behavior.
- Broad test sets must remain fully required when Jev is unavailable or a batch is rejected; test sanitizer rejection, partial batch failure, and all-required retention.
- Multi-axis scores must not be collapsed into an unsafe autonomous decision; test raw judgment preservation and deterministic policy composition.
- Historical calibration must distinguish retrieval reduction from safety; test relevant-file recall, must-keep retention, false negatives, and authority-boundary misses separately.

### Task 1: Establish baseline and source ledger

**Files:**
- Read: `AGENTS.md`, `docs/AGENTS_BASELINE_20260909.md`, `docs/AGENT_EXECUTION_EFFICIENCY.md`, `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`, `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`, `docs/repository-intelligence/JEV_WORKFLOW_INTELLIGENCE_V2_RESEARCH.md`, and `docs/repository-intelligence/README.md`.
- Read: `scripts/developer-intelligence/typesafe/*.ts`, `scripts/repository-intelligence/contextEngine.ts`, `scripts/workflow-map/context.ts`, `scripts/test-impact.ts`, and `tests/typesafeDeveloperIntelligence.test.ts`.
- Create/modify: `docs/repository-intelligence/JEV_WORKFLOW_INTELLIGENCE_V2_RESEARCH.md`.

**Interfaces:**
- Consumes: exact base SHA, current branch, current TypeSafe/RI behavior, official TypeSafe SDK/docs/blog, read-only X findings, and reviewed community source.
- Produces: a source ledger that labels every finding as official, X-official, X-community, community source, InvoiceApp measurement, or inference, with URL/handle/date and confidence.

- [ ] **Step 1: Record the clean repository and package baseline.**

  Run `git rev-parse HEAD`, `git status --short --branch`, `npm.cmd ls @typesafe-ai/sdk --depth=0`, and the deterministic context/test selectors. Do not include secrets or raw repository source in the external source ledger.

- [ ] **Step 2: Run one bounded `agent:context` packet for this developer-tooling objective.**

  Use an exact TypeSafe source selector, `--hops 1`, and a 10,000-character budget. Preserve the packet as inspection evidence only; it is not a source-of-truth decision.

- [ ] **Step 3: Run the standard live context checkpoint once when the key is available.**

  Record candidate count, selected count, model, token usage, latency, fallback reason, and whether the result was useful. If the deterministic seed set is empty, record that as an experiment result and use a seeded fixture for subsequent judgment experiments.

- [ ] **Step 4: Add official, X, and community source findings to the report.**

  Record only concise paraphrases and public links. Explicitly separate TypeSafe claims from independent measurements and community claims, and record limitations such as typed output not guaranteeing semantic correctness.

- [ ] **Step 5: Self-review the source ledger.**

  Confirm every material claim has a source class, public URL, and confidence; confirm no X action was state-changing and no sensitive local data was transmitted.

### Task 2: Reproduce current limitations with deterministic fixtures

**Files:**
- Read/modify only if needed: `scripts/developer-intelligence/typesafe/` experiment helpers.
- Create if needed: `scripts/developer-intelligence/typesafe/v2a/fixtures.ts`, `scripts/developer-intelligence/typesafe/v2a/metrics.ts`, `tests/typesafeWorkflowIntelligenceV2A.test.ts`.
- Modify: `docs/repository-intelligence/JEV_WORKFLOW_INTELLIGENCE_V2_RESEARCH.md`.

**Interfaces:**
- Consumes: sanitized `ContextCandidate` metadata, `ImpactSelectionResult`, deterministic RI/Workflow Map packets, and synthetic benchmark labels.
- Produces: offline reproducible fixtures and metrics for empty candidates, 64+ candidates, the 20k sanitizer cap, 75-test rejection, must-keep retention, and fallback behavior.

- [ ] **Step 1: Write failing tests for the four observed failure modes.**

  Pin that empty input is not a Jev judgment, candidate counts over 64 trigger the current deterministic fallback, a 20,001-character payload is rejected, and a 75-test synthetic selection remains fully required on sanitizer rejection.

- [ ] **Step 2: Run the focused tests and verify the baseline behavior.**

  Run `npx.cmd tsx --test tests/typesafeWorkflowIntelligenceV2A.test.ts`; record the exact baseline outcomes before adding any helper.

- [ ] **Step 3: Add the smallest offline fixture/metric helpers needed for replay.**

  Keep all values synthetic and metadata-only. The helpers must report candidate/test counts, must-keep retention, relevant retention, selected reduction, fallback reason, and deterministic ordering without calling the network.

- [ ] **Step 4: Run focused tests and add measured baseline results to the report.**

  Confirm the tests do not weaken the production sanitizer, alter required-test selection, or import the new helpers into the application bundle.

### Task 3: Run controlled live Jev experiments

**Files:**
- Modify: `docs/repository-intelligence/JEV_WORKFLOW_INTELLIGENCE_V2_RESEARCH.md`.
- Create only if required by Task 2: offline fixture/metrics files and focused tests.

**Interfaces:**
- Consumes: synthetic candidate/test/requirement metadata and deterministic ground truth labels.
- Produces: an experiment ledger with 15–30 distinct useful requests initially, or fewer when evidence converges, including request count, model, input/output tokens, latency, fallback, judgment, usefulness, and safety assessment.

- [ ] **Step 1: Define the experiment matrix before calling the API.**

  Cover context seeding, multi-axis file relevance, chunked/staged reranking, test triage, mid-diff adjacency, completion evidence, complexity routing, and confidence/escalation. Batch independent questions over one shared state where valid.

- [ ] **Step 2: Run small synthetic experiments first.**

  Compare Noul, Score, Choice, and composite question shapes on the same sanitized fixtures. Record raw typed outputs and keep deterministic combination policy outside Jev.

- [ ] **Step 3: Run chunking/staging experiments for candidate and test sets.**

  Compare full single-request rejection, bounded batches, tournament ranking, and must-keep union behavior. Never treat a chunk result as permission to drop required tests or authority files.

- [ ] **Step 4: Run completion/requirement evidence experiments.**

  Use synthetic acceptance criteria and evidence labels; evaluate proven/partial/unproven/uncertain classification while retaining deterministic missing-evidence checks.

- [ ] **Step 5: Summarize latency, tokens, cost, and usefulness.**

  Use the live response diagnostics when present. Mark missing provider metrics as unavailable instead of inventing them, and distinguish API/service failures from sanitizer or code failures.

### Task 4: Historical replay and calibration

**Files:**
- Read: representative merged PR metadata and changed-file/test/evidence records from Git history.
- Create if needed: `scripts/developer-intelligence/typesafe/v2a/historicalFixtures.ts`, `scripts/developer-intelligence/typesafe/v2a/evaluate.ts`, `tests/typesafeWorkflowIntelligenceV2A.test.ts`.
- Modify: `docs/repository-intelligence/JEV_WORKFLOW_INTELLIGENCE_V2_RESEARCH.md`.

**Interfaces:**
- Consumes: sanitized historical PR fixtures spanning UI/shared component, finance, inventory/equipment, DB/migration, security/RLS, documentation, browser-heavy, provider, and repository tooling work.
- Produces: labeled replay metrics for relevant-file recall, must-keep retention, optional reduction, false negatives/positives, authority-boundary misses, test-priority usefulness, latency/tokens/fallback, and threshold sweeps.

- [ ] **Step 1: Select a representative bounded PR sample.**

  Prefer 8–12 merged PRs with varied risk domains and known review/validation outcomes. Store only paths, categories, labels, test names, evidence classes, and sanitized review corrections.

- [ ] **Step 2: Write offline replay tests and metrics first.**

  Verify recall and must-keep retention are calculated independently; a reduction score may never compensate for a critical false negative or authority miss.

- [ ] **Step 3: Replay deterministic baseline and candidate policies.**

  Compare current one-axis thresholding with proposed multi-axis/chunked/staged policies. Sweep thresholds rather than adopting 0.5 by convention.

- [ ] **Step 4: Use live Jev only for distinct calibration questions.**

  Keep the labeled fixture set sanitized and record repeated-run variance where it affects confidence. Do not label a policy better from reduction alone.

- [ ] **Step 5: Record threshold conclusions and stop when evidence converges.**

  Recommend implement, experiment further, or reject/defer for each use case; document sample-size limitations and unresolved uncertainty.

### Task 5: Final report, roadmap synchronization, validation, and PR

**Files:**
- Modify: `docs/repository-intelligence/JEV_WORKFLOW_INTELLIGENCE_V2_RESEARCH.md`.
- Modify when stale: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`, `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`.
- Modify only if the client-facing capability/status changed: `src/config/productFeatures.ts`.
- Add focused tests/experiment files only if Tasks 2–4 require them.

**Interfaces:**
- Consumes: final source ledger, experiment ledger, historical replay metrics, exact diff, and validation results.
- Produces: a durable v2A report and PR handoff with the prioritized v2B design, checkpoint workflow for small/normal/wider phases, model-effort advisory policy, rejected/deferred ideas, privacy findings, and exact validation evidence.

- [ ] **Step 1: Write the report sections required by the phase contract.**

  Include X findings, official TypeSafe findings, community source findings, use-case matrix, live experiment results, historical calibration, threshold recommendations, cost/latency ledger, explicit limitation analysis, checkpoint workflow, model-effort routing, v2B priorities, rejected/deferred ideas, and privacy/sanitization conclusions.

- [ ] **Step 2: Reconcile roadmap and handoff against the actual final diff.**

  Mark v2A research/design complete only if the required evidence exists; preserve the next unfinished product/tooling phase and keep UX-W5/Worker Registration/3D/provider boundaries truthful.

- [ ] **Step 3: Run the final validation ladder.**

  Run edited experiment tests, applicable developer-tooling tests, `npm.cmd run test:affected:agent` only if changed-path impact makes it meaningful, lint/typecheck if scripts changed, and Workflow Map checks only if its source/generated contract changed. Do not run browser, Docker, Supabase, or production checks for this non-DB documentation/tooling phase.

- [ ] **Step 4: Inspect the complete final diff and run the completion checkpoint.**

  Verify no customer product code, authority boundary, raw secret, browser auth material, or unreviewed community code entered the diff. Use Jev completion only as an advisory missing-evidence check.

- [ ] **Step 5: Commit, push, and open the PR without merging.**

  Report starting SHA `b62273e4f19e066c9a6d8cb30d9686a56f0c0938`, final branch/head SHA, sources reviewed, live request/token/latency/fallback summaries, historical sample size, validation evidence, roadmap/handoff changes, and PR number.

## Self-Review Checklist

- [ ] Source class and public URL recorded for each material external claim.
- [ ] Official, X-community, community-code, InvoiceApp measurement, and inference are visibly distinct.
- [ ] Empty candidates, >64 candidates, 20k cap, and 75-test rejection have reproducible evidence.
- [ ] Required files/tests and authority boundaries are never dropped by Jev.
- [ ] Threshold recommendations are tied to labeled outcomes, not copied cookbook defaults.
- [ ] v2B candidates retain deterministic fallback and do not become normal workflow authority prematurely.
- [ ] Roadmap/handoff status matches the final diff and exact validation.
