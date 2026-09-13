# InvoiceApp / HydroQualiSense Development & Agent Rules

These rules apply only to `Juvialski/InvoiceApp`.

## Rule composition

The detailed rules that were live on `main` at `65464cd9e84381bad41fb258cbb95d10e108620d` are preserved verbatim in `docs/AGENTS_BASELINE_20260909.md` and remain authoritative unless this file explicitly overrides them.

Before implementation, PR review, migration/release work, or preparing a Codex prompt:

1. read this file;
2. read `docs/AGENTS_BASELINE_20260909.md`;
3. read `docs/CHATGPT_MIGRATION_OPERATOR_POLICY.md` when any database promotion, QA certification, deployment, or production release is involved;
4. continue to read the efficiency guide, active roadmap, current handoff, deployment strategy/runbook, and live repository state as required by the preserved baseline rules.

Live repository state overrides remembered chat summaries and old prompts.

## Codex implementation handoff fast-start — explicit 2026-09-11 override

This section overrides the preserved baseline and efficiency-guide startup language **for a fresh Codex implementation handoff only**. It does not weaken migration, release, security, data-integrity, or merge safety requirements. ChatGPT PR review uses the proportional validation override later in this file.

The normal manual workflow is:

`ChatGPT prepares prompt -> Codex implements and opens PR -> ChatGPT reviews/fixes/merges -> ChatGPT prepares next prompt`

Because ChatGPT may merge or correct the repository remotely between Codex runs, Codex must assume its local checkout may be stale. Do not spend startup time proving whether the old local checkout is current.

For a new Codex implementation task:

1. **First repository action: synchronize to the latest remote `main`.** Prefer `git fetch origin main`, switch to `main`, then `git pull --ff-only origin main`, and create the task branch from that updated `main`.
2. If the local worktree contains uncommitted work or local-only commits, do **not** discard or overwrite them. Preserve them and use a clean worktree/branch based on current `origin/main` instead.
3. After synchronization, record the resulting exact `main` SHA **once** (for example `git rev-parse HEAD`) and proceed. The successful pull/fetch is the normal freshness confirmation.
4. Do **not** inspect open PRs, old CI runs, historical merge state, remote branch history, or the previous prompt SHA during implementation startup unless the task itself is PR review/release work or the prompt explicitly requires that evidence.
5. Read `AGENTS.md`, then only the roadmap/handoff/phase/runbook documents materially needed for the assigned task. Do not re-read unrelated repository documentation by ritual.
6. Generate at most one bounded `agent:context` packet when useful, inspect only the task-relevant implementation, and begin implementation immediately.
7. Do not run a baseline full suite or broad repository audit merely to reconfirm a just-pulled `main`. Follow focused -> affected validation after changes are made.

Prompt creators should put the pull-first instruction at the top of every normal Codex implementation prompt. Avoid wording that tells Codex to spend time independently establishing the latest green remote baseline before pulling; **pull latest `main`, record the SHA once, then work**.

## Current product sequence — explicit 2026-09-12 reprioritization

The broad `Email/SMS + Documents` phase remains incomplete. The explicitly inserted second app-wide UI/UX simplification round is now complete, so the remaining Wave 4D provider/readiness work resumes as the next product phase.

Current sequence:

1. Wave 1A — Supplier Payable Lifecycle UX — complete on merged `main`.
2. Wave 1B — Client Receivable Lifecycle UX — complete on merged `main`.
3. Wave 2 — cross-module routing and handoffs — complete on merged `main`.
4. Wave 3 — deliberate payroll/subcontract/PO workflow decisions — complete on merged `main`.
5. Wave 4A — company document templates / mail merge foundation — complete.
6. Wave 4B — high-fidelity PDF finalization foundation — complete for the programmatic fallback; converter-backed company-template capability remains separately constrained/certified.
7. Wave 4C — issued-document Gmail delivery/history foundation — complete.
8. Wave 4D — Email/SMS Workspace + Documents Workspace — partially implemented but **not complete**.
9. **UI/UX Round 2 — App-Wide Usability Simplification & Information Architecture — COMPLETE in PR #161.** Its workflow-first information architecture and usability rules remain the application UI baseline.
10. **Wave 4D messaging-provider integration/completion — NEXT / ACTIVE** after UI/UX Round 2 finalization, unless the user explicitly reprioritizes again.
11. Worker Registration — **PAUSED by explicit user instruction** until Wave 4D is genuinely complete and the user explicitly resumes Worker Registration.
12. Site Attendance follows Worker Registration.
13. Face-Recognition Attendance follows only after explicit privacy/security design.
14. Final pre-production certification follows the major product domains.

The completed UI/UX Round 2 design and acceptance record is:

`docs/HYDROQUALISENSE_UI_UX_ROUND2_SIMPLIFICATION.md`

Treat that document as the standing usability/information-architecture baseline when later work touches authenticated UI. For the next implementation phase, also read `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md` because Wave 4D provider integration/completion is now the active unfinished product work.

The 2026-09-12 reprioritization did **not** cancel Wave 4D or change its approved provider direction. Existing Email/SMS/Documents implementation, Company SIM Gateway primary direction, PhilSMS optional fallback direction, delivery-intent history, provider-neutral/server-side adapter boundaries, and human send-confirmation boundaries remain valid and must be preserved during the resumed Wave 4D work.

The user explicitly permits UI navigation/tab restructuring when it improves and simplifies the product, provided important features, deep links where practical, permission boundaries, financial/source semantics, audit history, and workflow correctness are preserved.

The completed UI/UX Round 2 standard remains stronger than a no-overflow pass: major screens must make it apparent what the page is for, what needs attention, and what the user can do next without requiring knowledge of HydroQualiSense internals.

### Email/SMS + Documents completion gate

Do **not** suggest, prepare, or start Worker Registration as the next product phase while any of the following remain unfinished:

- the top-level **Email / SMS** communications workspace is not genuinely usable while preserving inbound Gmail intake;
- the separate top-level **Documents** workspace is not genuinely usable as permission-aware access to document-bearing records/artifacts without duplicating canonical source ownership;
- outbound email composition/history is still effectively limited to scattered record-local controls rather than being usable from the Email/SMS communications experience;
- SMS remains only scaffolding and no approved provider-backed sending path has been configured and runtime-tested in QA;
- Assistant-assisted message drafting/attachment selection does not preserve human review/confirmation before sending;
- existing Wave 4A/4B/4C template, PDF, Gmail delivery, idempotency, reconciliation, lifecycle, and immutable-history foundations are not integrated into the broader workspaces.

Wave 4A-4C are supporting foundations for the broader Email/SMS + Documents product phase. They must not be represented as satisfying this completion gate by themselves.

UI/UX Round 2 is complete. Resume the remaining Wave 4D provider/readiness work while preserving the completed workflow-first UI baseline and all existing provider boundaries.

QA certification/recovery/provider/deployment work remains a **parallel release/readiness track**. Do not represent unfinished QA certification as complete merely because product development continues, and do not infer production authorization from QA or merge success.

Read the active roadmap, current handoff, completed UI/UX Round 2 design record, and `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md` before preparing the resumed provider work.

All permanent financial, audit, RLS, company-isolation, inventory-history, document-history, payroll/privacy, AI confirmation, and migration-forward-only invariants in the preserved baseline remain in force.

## ChatGPT migration operator — explicit override

`docs/CHATGPT_MIGRATION_OPERATOR_POLICY.md` is now an authoritative repository policy and overrides the older blanket prohibition on ChatGPT-connected Supabase migration promotion.

### QA

During an authorized QA certification/release session, ChatGPT is authorized to perform QA database writes needed to promote committed canonical migrations. It should perform the operation itself through connected tooling when a safe connected path exists rather than requiring the user to run PowerShell or Supabase CLI manually.

The existing `qa:db:push` wrapper remains the default GitHub Actions/local-CLI path. ChatGPT-connected promotion is also approved when it proves the exact QA target, preserves the canonical repository migration version/name, applies only missing committed forward migrations in order, independently verifies parity afterward, and preserves all production boundaries.

The older rule saying to never use a direct MCP migration call is superseded only by the connected-operator policy. Do not use Supabase MCP `apply_migration` for an already-committed timestamped migration when it would generate a different server-side version and create migration drift. Use the exact-history mechanism defined in `docs/CHATGPT_MIGRATION_OPERATOR_POLICY.md`.

### Production

ChatGPT may perform production migration writes only after an explicit user instruction authorizing production promotion for the intended client/deployment or an explicitly identified fleet. A QA success, merge, Render deploy, generic PR review, or read-only production check does not authorize a production write.

When production promotion is explicitly authorized, ChatGPT should perform the guarded promotion itself when connected tooling permits it; do not require a manual operator terminal step merely by habit. Exact deployment-to-Supabase mapping, recovery/backup prerequisites, canonical migration history, isolated client scope, post-migration parity, and runtime/security verification remain mandatory.

Production promotion must never silently expand from one client to all clients. Fleet-wide writes require an explicit fleet instruction.

## QA release sequencing

For a migration-bearing QA release:

`exact main -> intended QA app SHA live when required -> inspect QA migration history -> guarded promotion -> independent canonical parity -> Hosted QA / RPC / provider checks`

The protected GitHub QA release workflow remains preferred for normal post-merge automation. If it is blocked solely by CI credentials while ChatGPT already has an approved connected Supabase operator path, ChatGPT may complete the same guarded promotion directly under the connected-operator policy instead of asking the user to run local commands.

Never certify a stale app SHA or divergent migration history. Never infer production promotion from QA success.

## Model / implementation workflow

Codex is the default implementation engine.

Default to **zero subagents**. Hard maximum: **2 concurrent Codex subagents**, and only for genuinely independent, tightly bounded work. Do not assume Luna, Gemini, Antigravity, or another external coding agent is available unless the user explicitly enables it for a specific task.

The lead Codex agent must continue implementation and must not block waiting for subagents. Stop stalled subagents instead of restarting broad tasks repeatedly.

The lead owns architecture/source-of-truth decisions, shared files and integration, financial semantics, migrations/RLS/RPC interpretation, security, App/router/provider integration, final diff review, validation, commit/push/PR delivery, and must not merge its own implementation PR.

When ChatGPT is performing the repository-native PR review/fix/finalization role, it follows the proportional PR-review/CI policy later in this file. Exact-head means the current PR head, but only checks applicable to the changed risk domains require manual verification.

## Mandatory roadmap and handoff synchronization gate

Roadmap/handoff maintenance is a required delivery step, not optional documentation cleanup.

Before **every implementation handoff, PR completion handoff, next-phase recommendation, or claim that a phase is complete**, the lead agent must reconcile the actual final repository state against all applicable product-truth documents and surfaces.

At minimum, inspect and update when stale:

- `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`;
- `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`;
- the active phase contract/design document, when one exists;
- `src/config/productFeatures.ts` for client-facing feature/roadmap truth when user-visible capability or status changed;
- `AGENTS.md` when the user changed product sequence, completion gates, or implementation policy.

Required final-handoff sequence:

1. review the complete final diff and exact implemented behavior;
2. compare that behavior with the active roadmap and current handoff;
3. mark completed work complete and identify the exact next unfinished phase—never infer completion from backend scaffolding or a partial UI;
4. carry forward explicit user reprioritizations, paused phases, blockers, and external-provider dependencies;
5. update client-facing Settings truth only to what is genuinely usable;
6. verify the updated roadmap/handoff do not contradict each other, `AGENTS.md`, or live implementation;
7. only then provide the final handoff or next-phase prompt.

A PR that materially changes product capability, phase status, or approved sequence is **not done** if the roadmap/handoff remain stale. Include required documentation synchronization in the same PR whenever practical. If an implementation PR is already merged and the docs are discovered stale during review, correct the docs immediately before recommending the next phase.

Never hand off with phrases such as “next is X” based only on an older roadmap entry. The next phase must be derived from the reconciled live roadmap after the current work's actual completion criteria are checked.

## Client-facing Features & Roadmap synchronization

For applicable product feature work, the `HydroQualiSense Features & Roadmap` section in Settings must remain synchronized with actual product state. Live implementation and `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md` remain development sources of truth; the Settings roadmap is their client-friendly representation.

- When a feature shown as `Planned` or `Future / Design Stage` is completed, the same PR must review and update its Settings status and description. Mark it `Available` only when the usable production-facing workflow is complete; backend-only scaffolding, migrations, hidden infrastructure, or incomplete UI flows are insufficient.
- Update an Available description when a material expansion changes what users can do. Update planned/future documentation whenever the approved roadmap changes; remove or correct stale promises when a feature is cancelled, replaced, renamed, split, or materially redesigned.
- During final diff review ask: `Does this implementation require a Settings Features & Roadmap status or description update?` Applicable synchronization is part of Definition of Done.
- Never copy internal engineering information into the client-facing roadmap, including PRs, migration names, CI/workflow status, QA certification terminology, Git SHAs, Codex/agent/subagent terminology, test commands, implementation notes, or internal security mechanics.

## ChatGPT proportional PR review / CI fast-path — explicit 2026-09-11 override

This section supersedes the preserved baseline and any earlier wording in this file that can be read as requiring manual inspection, waiting, or repeated polling of every protected CI check for every PR.

Start every ChatGPT PR review with the exact current PR head plus a **diff-first risk classification**. Validation must be proportional to what changed.

### A. Documentation / agent-policy only

Examples: Markdown documentation, `AGENTS.md`, roadmap/handoff text, comments or other non-executable policy text, with no executable configuration, workflow, package, test, migration, schema, source, or generated runtime artifact changes.

For a true documentation/policy-only PR:

1. inspect the exact changed-file list and complete relevant diff once;
2. confirm the classification is genuinely non-executable and does not alter CI, deployment, migration, security, financial, generated-source, or runtime contracts;
3. check the changed documentation for contradictions with current source-of-truth policy;
4. do **not** run or manually inspect application tests, builds, browser QA, Docker/Supabase, migration replay, pgTAP, hosted QA, Render state, provider state, or production state;
5. do **not** wait for or repeatedly poll protected CI merely because branch protection requires statuses;
6. when repository auto-merge is available, enable auto-merge after the diff review and immediately continue to the next requested task; GitHub branch protection may finish the required lightweight checks asynchronously;
7. when auto-merge is unavailable, check mergeability/status only when necessary to perform the merge, not as a ritual validation loop.

Documentation synchronization should normally be included in the implementation PR that made it necessary. A separate documentation-only follow-up PR is an exception for stale truth discovered after merge, not a default extra CI cycle.

### B. Application / UI / ordinary test changes

Review the exact diff and verify the exact-head checks applicable to application behavior. Do not manually investigate database, hosted-QA, provider, deployment, or production evidence unless the diff or a concrete failure crosses those domains.

### C. Database / security / financial / inventory integrity changes

Use the stricter exact-head database/security validation required by the preserved baseline: relevant focused tests plus applicable clean replay, pgTAP, upgrade-path, runtime/RLS/RPC/concurrency evidence. Never trade data-integrity or authorization safety for speed.

### D. CI / workflow / release-orchestration changes

Review the changed workflow/configuration itself and obtain enough exact-head evidence to prove the changed validation/release contract works. Do not rerun unrelated product QA merely because CI plumbing changed. Release/promotion changes still follow the migration/release operator policy where applicable.

### Protected-check fast-pass contract

The protected check names remain stable for branch protection, but their workflows may fast-pass when the PR does not touch their risk domain. An irrelevant fast-passed protected check does not require manual ChatGPT inspection. Manual exact-head verification is for the checks that actually executed material validation for the changed domains, plus any concrete failure or blocker.

The intended protected PR behavior is:

- `Application Validation & Build`: heavy only for application/test/script/public/package/TypeScript inputs;
- `Database Migrations & Upgrade Suite`: heavy only for migration/database-invariant/package inputs;
- `chromium-demo-qa`: heavy only for UI/demo/browser-QA inputs;
- `Graph and Source Contract Consistency`: heavy only for workflow-map/source-contract inputs.

For irrelevant PRs, each required job should report success after lightweight scope classification without `npm ci`, build, Supabase startup, migration replay, or Playwright/Chromium installation.

## Definition of done

A substantial task is done only when repository state is current, scope remains disciplined, applicable security/data-integrity/history invariants are preserved, relevant runtime evidence is obtained, exact-head CI is checked **when applicable to the changed risk domain**, **the mandatory roadmap/handoff synchronization gate has been completed**, and the final handoff says clearly what passed, what was skipped, what remains blocked, and what the reconciled next phase actually is.
