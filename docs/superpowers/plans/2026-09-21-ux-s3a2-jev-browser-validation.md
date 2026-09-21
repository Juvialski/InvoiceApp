# UX-S3A2 Jev-Browser Comparative Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate the community `jev-browser-use` integration against the real public comparator research workload, deepen the S3A comparative evidence, and make a truthful S3B readiness decision without implementing S3B.

**Architecture:** Use the existing Codex CUA browser tab as the browser connection and the installed community bridge only for bounded mechanical navigation. Codex retains research strategy, text entry, visual interpretation, safety, and final verification. Persist only sanitized research evidence in the existing S3A report and synchronized roadmap/handoff documents; keep credentials, browser state, screenshots, and traces transient.

**Tech Stack:** Codex `mcp__cua_repl`, community `jev-browser-use` Skill/bridge, TypeSafe Jev through the existing configured API path, Markdown evidence artifacts, Git/GitHub PR workflow.

**Spec:** `docs/superpowers/specs/2026-09-21-ui-simplification-contextual-help-research.md` and the user-provided UX-S3A2 continuation brief.

## Global Constraints

- Do not implement UX-S3B, customer-facing features, database/provider/production changes, or a custom InvoiceApp/Codex Jev-browser adapter.
- Preserve the S3A baseline report; append a clearly separated S3A2 validation section rather than rewriting earlier evidence.
- Keep all external browser activity public/read-only; do not log in, submit forms, create records, send messages, upload files, change settings, or expose secrets/private browser state.
- Jev is advisory only; Codex independently verifies every outcome and owns all visual interpretation and conclusions.
- Do not add `jev-browser-use`, `jev-ultrafast`, credentials, browser profiles, cookies, traces, screenshots, or machine-specific configuration to InvoiceApp.
- Use zero subagents, do not run `test:full`, do not start Docker/Supabase, and do not perform provider or production operations.
- Track exact base SHA, current branch, source/tool versions, environment, public URLs, benchmark counts, limitations, and skipped validation truthfully.

## Review Focus

- S3A baseline preservation: the earlier report remains intact and its limitations are not silently rewritten.
- Authority split: Jev can select only observed safe mechanical controls; Codex verifies final state and determines applicability.
- Public evidence boundary: observations from help/documentation surfaces are not presented as authenticated product UI or responsive-product certification.
- Installation hygiene: global/local skill setup remains outside the InvoiceApp dependency graph and no credential/session artifact enters Git.
- S3B readiness: the decision distinguishes supported direction from unresolved product-UI or responsive evidence gaps and does not smuggle implementation scope into S3A2.

---

### Task 1: Establish the bounded research record

**Files:**
- Read: `AGENTS.md`, `docs/AGENTS_BASELINE_20260909.md`, `docs/AGENT_EXECUTION_EFFICIENCY.md`, `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`, `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`, `docs/superpowers/specs/2026-09-21-ui-simplification-contextual-help-research.md`, `artifacts/ui-ux-audit/UX-S3A-RESEARCH-AND-INSTRUCTION-DENSITY-AUDIT.md`, `docs/repository-intelligence/JEV_WORKFLOW_INTELLIGENCE_V2_RESEARCH.md`, and `docs/REPOSITORY_EVIDENCE_POLICY.md`.
- External source: `https://github.com/wy-coliney/jev-browser-use` at the observed `main` commit and its `INSTALL.md`, `SKILL.md`, bridge, and provider-configuration reference.
- External reference: `https://github.com/browser-use/jev-ultrafast` README/source metadata.
- Transient evidence: CUA browser states/screenshots and Jev session metrics for Raken, Fieldwire, Procore, Autodesk, and Buildertrend public surfaces.

**Interfaces:**
- Consumes: the synchronized `main` SHA `4e00c1375c278394dd8db567732dd7ec56990022`, the S3A baseline, and the user’s safety/authority split.
- Produces: a sanitized observation ledger with exact URLs, direct observations, benchmark metrics, limitations, and a separate interpretation layer for Task 2.

- [x] **Step 1: Confirm source and installation evidence**

  Record the upstream Jev Browser Use commit, installation mode, runtime requirements, browser connection model, and whether the current Codex task can import and run the bridge.

- [x] **Step 2: Run the matched benchmark**

  Compare ordinary CUA navigation and Jev-assisted navigation for two public tasks:

  ```text
  A. Raken Help Center -> Using Your Dashboard -> How to Use the Raken Dashboard.
  B. Fieldwire Knowledge Base -> Getting Started -> Getting started with Fieldwire!.
  ```

  Record executed browser actions, Jev decisions, Codex handoffs, stale/no-progress events, elapsed loop time, final verification, and limits of the tiny sample.

- [x] **Step 3: Inspect the mandatory comparator surfaces**

  Directly inspect public/read-only surfaces for Procore, Autodesk Construction Cloud/Build, Buildertrend, Fieldwire, and Raken. Record navigation, first useful viewport, help architecture, task/article hierarchy, mobile/responsive evidence, and any inaccessible or loading surfaces without inferring hidden authenticated UI.

### Task 2: Append S3A2 validation evidence

**Files:**
- Modify: `artifacts/ui-ux-audit/UX-S3A-RESEARCH-AND-INSTRUCTION-DENSITY-AUDIT.md`

**Interfaces:**
- Consumes: Task 1’s sanitized observation ledger and the existing S3A route/matrix/root-cause findings.
- Produces: a clearly separated `S3A2 validation` section containing integration evaluation, benchmark results, comparator observations, per-conclusion statuses (`CONFIRMED`, `STRENGTHENED`, `REFINED`, `REJECTED`, or `STILL_UNVERIFIED`), final S3B readiness answers, and a Jev efficiency ledger.

- [ ] **Step 1: Add the integration-evaluation record**

  Document the community status, exact source commit, runtime-only installation, current CUA/in-app-browser connection, ephemeral TypeSafe configuration boundary, current-run compatibility, no-runtime-dependency result, and the restart/new-task limitation for native Skill discovery.

- [ ] **Step 2: Add benchmark and comparator tables**

  Include only sanitized metrics and direct URLs. Mark Jev `DONE`/`step_limit`/`needs_verification` as advisory runtime outcomes and state Codex’s independent final verification separately.

- [ ] **Step 3: Add conclusion validation and readiness decision**

  Classify each material S3A conclusion, state which evidence strengthened or refined it, preserve public-help/authenticated-UI limitations, and answer the seven S3B readiness questions without adding implementation code.

### Task 3: Synchronize roadmap and handoff

**Files:**
- Modify: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`
- Modify: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`

**Interfaces:**
- Consumes: Task 2’s final S3A2 report section and exact branch/base state.
- Produces: mutually consistent documentation identifying UX-S3A2 as complete for the recorded research boundary and the exact S3B next boundary/limitations, with no new product capability claim.

- [ ] **Step 1: Update roadmap truth**

  Update the status/active-track/next-phase language and add a dated S3A2 outcome that links the report, records the integration decision, and preserves all product-freeze/deferred boundaries.

- [ ] **Step 2: Update handoff truth**

  Add the exact S3A2 completion evidence, benchmark limitation, S3B readiness decision, and next implementation boundary. Do not change Settings feature capability truth.

- [ ] **Step 3: Cross-check contradictions**

  Search the three documents for stale claims that S3A2 is still pending or that S3B was already implemented; retain historical S3A wording only where it is explicitly labeled as baseline/history.

### Task 4: Final evidence review and PR delivery

**Files:**
- Review: all changed Markdown files and Git metadata.
- Do not add: application source, tests, package files, browser artifacts, or credentials.

**Interfaces:**
- Consumes: Tasks 1–3 and the final working tree.
- Produces: verified documentation-only commit, pushed branch, and open PR against `main`; the PR remains unmerged.

- [ ] **Step 1: Run documentation-only validation**

  Run:

  ```powershell
  git diff --check
  git status --short --ignored
  $evidenceFiles = @(
    'artifacts/ui-ux-audit/UX-S3A-RESEARCH-AND-INSTRUCTION-DENSITY-AUDIT.md',
    'docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md',
    'docs/HYDROQUALISENSE_CURRENT_HANDOFF.md',
    'docs/superpowers/plans/2026-09-21-ux-s3a2-jev-browser-validation.md'
  )
  foreach ($file in $evidenceFiles) {
    rg -n -i 'TYPESAFE_API_KEY|OPENROUTER_API_KEY|-----BEGIN|cookie|session|access.?token|password' -- $file
  }
  ```

  Confirm only sanitized references exist and no browser/session artifact is tracked.

- [ ] **Step 2: Run one advisory completion/evidence checkpoint if available**

  Use the existing sanitized TypeSafe completion path once, record model/tokens/latency/fallback, and treat it only as an evidence flag. If the provider fails, retain deterministic documentation review as the authority.

- [ ] **Step 3: Perform final self-review**

  Review the complete diff against the user brief, this plan, the evidence policy, and the S3A baseline. Record any ruling or deferred minor in the execution ledger; do not claim application/browser/hosted certification.

- [ ] **Step 4: Commit, push, and open the PR**

  Commit the documentation/evidence changes on `codex/ux-s3a2-jev-browser-validation`, push it, create a PR targeting `main`, attach the PR artifact, and stop without merging.

---

## Self-review checklist

- [x] The plan covers tool evaluation, matched benchmark, all five mandatory comparator families, conclusion validation, S3B readiness, roadmap/handoff synchronization, and final evidence checks.
- [x] The plan contains no customer-facing implementation task and no custom adapter task.
- [x] The only persistent files are the plan, S3A evidence report, roadmap, and handoff; all browser/credential material is transient.
- [x] The review focus names the five highest-risk failure modes and assigns each to a concrete review step.
- [x] The bounded benchmark is treated as evidence, not as a general performance claim.
