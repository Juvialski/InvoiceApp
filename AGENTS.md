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

## Current product sequence

The user has explicitly reprioritized the immediate product workflow sequence through `docs/HYDROQUALISENSE_WORKFLOW_UX_AUDIT_20260909.md`. Unless the user reprioritizes again:

1. Wave 1A — Supplier Payable Lifecycle UX — complete on merged `main`
2. Wave 1B — Client Receivable Lifecycle UX
3. Wave 2 — cross-module routing and handoffs
4. Wave 3 — deliberate payroll/subcontract/PO workflow decisions
5. Resume the broader approved product roadmap: Email/SMS + Documents, Worker Registration, Site Attendance, Face-Recognition Attendance after explicit privacy/security design, then final pre-production certification

QA certification/recovery/provider/deployment work remains a **parallel release/readiness track**, not a reason to erase or skip the user-prioritized UX sequence. Do not represent unfinished QA certification as complete merely because product development continues.

Read the active roadmap and workflow UX audit before preparing the next implementation phase.

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

Codex remains the default lead implementation/integration engine. During the currently authorized pre-demo sprint, Luna may be used up to the ceiling defined in `docs/AGENTS_BASELINE_20260909.md`; that is a ceiling, not a quota. The lead owns shared contracts, migrations/RLS/RPC interpretation, security/financial semantics, final diff review, validation, commit/push/PR delivery, and must not merge its own implementation PR.

When ChatGPT is performing the repository-native PR review/fix/finalization role, it must inspect exact current head and exact-head CI, fix concrete issues, and merge automatically if safe as defined by the baseline rules.

## Client-facing Features & Roadmap synchronization

For applicable product feature work, the `HydroQualiSense Features & Roadmap` section in Settings must remain synchronized with actual product state. Live implementation and `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md` remain development sources of truth; the Settings roadmap is their client-friendly representation.

- When a feature shown as `Planned` or `Future / Design Stage` is completed, the same PR must review and update its Settings status and description. Mark it `Available` only when the usable production-facing workflow is complete; backend-only scaffolding, migrations, hidden infrastructure, or incomplete UI flows are insufficient.
- Update an Available description when a material expansion changes what users can do. Update planned/future documentation whenever the approved roadmap changes; remove or correct stale promises when a feature is cancelled, replaced, renamed, split, or materially redesigned.
- During final diff review ask: `Does this implementation require a Settings Features & Roadmap status or description update?` Applicable synchronization is part of Definition of Done.
- Never copy internal engineering information into the client-facing roadmap, including PRs, migration names, CI/workflow status, QA certification terminology, Git SHAs, Codex/agent/subagent terminology, test commands, implementation notes, or internal security mechanics.
## Definition of done

A substantial task is done only when repository state is current, scope remains disciplined, applicable security/data-integrity/history invariants are preserved, relevant runtime evidence is obtained, exact-head CI is checked when applicable, and the final handoff says clearly what passed, what was skipped, and what remains blocked.