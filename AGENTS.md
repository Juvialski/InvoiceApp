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

## Current product sequence — explicit 2026-09-10 reprioritization

The user has explicitly clarified that the broad `Email/SMS + Documents` phase is **not complete** merely because document templates, PDF generation, Gmail delivery, or delivery history exist inside individual record workflows.

Current state through merged PR #136:

1. Wave 1A — Supplier Payable Lifecycle UX — complete on merged `main`.
2. Wave 1B — Client Receivable Lifecycle UX — complete on merged `main`.
3. Wave 2 — cross-module routing and handoffs — complete on merged `main`.
4. Wave 3 — deliberate payroll/subcontract/PO workflow decisions — complete on merged `main`.
5. Wave 4A — company document templates / mail merge foundation — complete.
6. Wave 4B — high-fidelity PDF finalization foundation — complete.
7. Wave 4C — issued-document Gmail delivery/history foundation — complete through merged PR #136.
8. **Wave 4D — Email/SMS Workspace + Documents Workspace — NEXT and BLOCKING.**
9. Worker Registration — **PAUSED by explicit user instruction** until Wave 4D and the broader Email/SMS + Documents product experience are complete and the user explicitly resumes Worker Registration.
10. Site Attendance follows Worker Registration.
11. Face-Recognition Attendance follows only after explicit privacy/security design.
12. Final pre-production certification follows the major product domains.

The detailed Wave 4D contract is `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md` and is authoritative for this reprioritization. Where older priority wording in product-direction, handoff, or audit documents conflicts with this explicit sequence, this section plus the active roadmap and Wave 4D contract control the next-phase decision. Older documents remain authoritative for permanent product, financial, security, history, and architecture invariants unless specifically superseded.

### Email/SMS + Documents completion gate

Do **not** suggest, prepare, or start Worker Registration as the next product phase while any of the following remain unfinished:

- the current top-level `Email Intake` experience has not been evolved into the intended top-level **Email / SMS** communications workspace while preserving inbound Gmail intake;
- a separate top-level **Documents** workspace has not been implemented for unified, permission-aware access to document-bearing records/artifacts without duplicating canonical source ownership;
- outbound email composition/history is still limited to scattered record-local controls rather than being usable from the Email/SMS communications experience;
- SMS is only provider-neutral scaffolding and no approved provider-backed sending path has been configured and runtime-tested in QA;
- Assistant-assisted message drafting/attachment selection does not preserve human review/confirmation before sending;
- existing Wave 4A/4B/4C template, PDF, Gmail delivery, idempotency, reconciliation, lifecycle, and immutable-history foundations have not been integrated into the new workspaces.

Wave 4A-4C are supporting foundations for the broader Email/SMS + Documents product phase. They must not be represented as satisfying this completion gate by themselves.

QA certification/recovery/provider/deployment work remains a **parallel release/readiness track**. Do not represent unfinished QA certification as complete merely because product development continues, and do not infer production authorization from QA or merge success.

Read the active roadmap and `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md` before preparing the next implementation phase.

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

## Definition of done

A substantial task is done only when repository state is current, scope remains disciplined, applicable security/data-integrity/history invariants are preserved, relevant runtime evidence is obtained, exact-head CI is checked when applicable, **the mandatory roadmap/handoff synchronization gate has been completed**, and the final handoff says clearly what passed, what was skipped, what remains blocked, and what the reconciled next phase actually is.
