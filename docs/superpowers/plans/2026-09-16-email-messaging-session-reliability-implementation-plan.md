# Email/SMS Session Reliability Implementation Plan

**Date:** 2026-09-16  
**Repository:** `Juvialski/InvoiceApp`  
**Accepted design:** `docs/superpowers/specs/2026-09-16-email-messaging-session-reliability-design.md`  
**Planning baseline:** `fadd8e270da16a1f3f545ab843c466169e9a4ba6`

## Purpose

Implement the approved Email/SMS/session-reliability design in small, reviewable phases. Each phase is intentionally bounded so a fresh ChatGPT/Codex session can bootstrap from live repository state, complete one phase, validate it proportionally, update this handoff, and stop.

Live `AGENTS.md`, `docs/AGENT_EXECUTION_EFFICIENCY.md`, the active roadmap, current handoff, current `main`, open PRs, and exact-head CI always override stale details in this plan.

## Operating rules for every phase

- Codex is the default implementation engine.
- Use zero subagents by default; hard maximum is two concurrent Codex subagents for genuinely independent work.
- The lead owns architecture/source-of-truth decisions, shared files, security/RLS/RPC/migrations, financial semantics, integration, final diff review, validation, and PR delivery.
- Start from the latest green `main`; never assume the SHA in this document is still current.
- Generate one bounded `agent:context` packet for the active phase.
- Inspect the existing implementation before designing or editing.
- Write/update regression coverage for the scoped behavior before or alongside the smallest production fix; preserve TDD ordering where practical.
- Validate new/edited tests first, then focused domain tests, then `npm.cmd run test:affected:agent`. Add lint/build/browser/Workflow Map only when relevant.
- Do not run `test:full` by ritual. Run it only when impact analysis falls back, a broad shared contract genuinely requires it, CI/failures justify it, or it is explicitly requested.
- Use real local Supabase/Docker validation only when a phase changes migrations, RLS/grants, RPC/SECURITY DEFINER behavior, triggers/constraints, DB lifecycle guards, company-bound integrity, upgrade behavior, or concurrency/row locking.
- Review the exact final diff for scope creep, permissions/company isolation, provider truth, history/idempotency, financial semantics, and security regressions.
- Push a feature branch and open a PR. Codex must not merge its own PR. When ChatGPT is reviewing/finalizing a PR, it should merge automatically if the exact current head is safe and required CI belongs to that head.
- Never use CI from an older PR head as proof for a newer head.
- Implement exactly one numbered phase per fresh implementation chat unless a concrete blocker requires an even smaller split.
- Do not advance to Worker Registration / Attendance / Face Recognition while the approved Wave 4D Email/SMS work remains incomplete.

## Phase sequence

### Phase 1 — Company-access loading reliability

**Goal:** stop background company-access revalidation from blanking a valid authenticated workspace or falsely showing `No access` during transient refreshes.

Scope:
- distinguish cold/identity-changing access loads from same-user background revalidation;
- retain the last known-good same-user access snapshot during background refresh;
- expose transient refresh state/error separately from the authoritative access status;
- keep logout/user change immediate and invalidate old access at once;
- keep generation/request guards so stale async results cannot restore a previous user/company context;
- add focused regression coverage for background refresh, transient failure, and stale-request invalidation.

Out of scope: Email/SMS UI, provider caching, database changes, recipient work, batch sending.

### Phase 2 — Authenticated request recovery

**Goal:** make ordinary authenticated API requests recover cleanly from a stale/rotated session without request storms or false sign-out states.

Scope:
- centralize the applicable authenticated-request recovery path;
- on an eligible 401/session-auth failure, refresh/re-resolve the session and retry at most once;
- distinguish recoverable refresh from true session expiry;
- prevent infinite retry loops and duplicate mutations;
- add focused tests for success-after-refresh, terminal expiry, and retry bounds.

Out of scope: provider capability cache and Email/SMS redesign.

### Phase 3 — Provider capability cache

**Goal:** stop Brevo/provider readiness from refetching and flickering on routine tab changes.

Scope:
- per-user/per-company server/runtime capability state with a bounded freshness window;
- single-flight concurrent checks;
- background revalidation that preserves last-good status as stale on transient failure;
- explicit Verify/Refresh bypass;
- invalidate on user/company/logout changes;
- audit other applicable special capability statuses so they do not each grow independent reload loops.

Out of scope: composer redesign and recipient expansion.

### Phase 4 — Loading-state UI primitives

**Goal:** give affected authenticated surfaces consistent initial-loading, section-loading, background-refresh, empty, stale/error, forbidden, and signed-out presentation.

Scope:
- small shared primitives/patterns for the Email/SMS/access surfaces that need them;
- preserve usable content during background refresh;
- remove misleading full-page blocking states where data is already usable.

Out of scope: an app-wide visual rewrite.

### Phase 5 — Email composer + live preview

**Goal:** simplify one-off composing and remove the separate preview step.

Scope:
- editable Compose fields and continuously updated preview side-by-side on desktop/laptop;
- responsive preview behavior for tablet/phone without horizontal overflow;
- keep current one-off send permissions, provider path, attachment/document provenance, and human confirmation boundary unchanged.

Out of scope: batch sending and recipient-schema changes.

### Phase 6 — Email draft lifecycle

**Goal:** make transient compose state survive ordinary Email/SMS navigation while still resetting intentionally.

Scope:
- lift route/tab-persistent in-memory draft state to the appropriate Email/SMS workspace owner;
- successful accepted send clears the prior draft/attachment;
- failed/unknown send preserves the draft;
- explicit Reset starts a fresh draft;
- no new persistent browser storage/localStorage for email drafts.

### Phase 7 — Unified recipient picker: existing data only

**Goal:** replace manual-only addressing with a safe picker using data the app already owns.

Scope:
- active internal company users;
- built-in/custom role groups;
- manual external email addresses;
- search, chips, eligibility/exclusion explanations, dedupe, exact resolved-recipient review;
- server-owned company-scoped resolution shared by Compose and later Assistant work;
- no migration in this phase.

### Phase 8 — External company contacts

**Goal:** add a minimal company-scoped address book for reusable external recipients without turning the app into a CRM.

Scope:
- minimal `company_contacts` data model and company isolation;
- RLS/API/permission coverage;
- recipient-picker integration;
- mandatory clean migration replay, pgTAP/migration/upgrade and relevant runtime RLS validation.

Out of scope: CRM import/synchronization, marketing lists, automatic inclusion of clients/vendors.

### Phase 9 — Project recipients

**Goal:** resolve project-based internal recipient groups from an explicit, authoritative company-scoped relationship.

Scope:
- inspect current project/user/member relations first;
- reuse an authoritative existing relation if one exists;
- otherwise add only the minimal explicit company-scoped project-membership relation needed by the accepted design;
- resolve only eligible internal app users; never infer external recipients from financial/project records;
- if a migration is needed, perform the full applicable local Supabase validation.

Stop rather than improvising if there is no narrow authoritative project-user relationship.

### Phase 10 — Assistant → Email/SMS handoff

**Goal:** let the Assistant create useful, editable drafts that hand off to the normal composer.

Scope:
- structured draft/action contract for subject/body/recipient selectors/authorized attachment suggestions;
- `Use draft` populates/navigates to Compose;
- role/project recipient drafting uses the same authoritative resolver as Compose;
- ordinary email drafting must not require an attachment;
- Assistant never sees provider secrets and never directly sends; human review/confirmation remains mandatory.

### Phase 11 — Batch persistence + creation

**Goal:** create a durable, private, auditable batch model before introducing a worker.

Scope:
- batch and per-recipient job persistence;
- company-scoped RLS/permissions;
- transactional batch creation with exact resolved-recipient snapshot, dedupe and exclusions;
- one provider delivery target per recipient so addresses are never exposed to each other;
- reusable server-side creation/idempotency core;
- no background worker execution in this phase.

Mandatory DB validation applies.

### Phase 12 — Batch worker, controls, history + final certification

**Goal:** finish private durable delivery and certify the complete approved Email/SMS reliability phase.

Scope:
- server worker/leases/pacing and duplicate-worker safety;
- per-recipient idempotency and immutable accepted/unknown outcomes;
- safe retry/reconciliation behavior;
- pause/cancel remaining unsent jobs only;
- progress plus grouped batch history with per-recipient detail;
- responsive/browser idle-return certification and complete focused-to-affected regression validation;
- synchronize active roadmap, current handoff, Wave 4D documentation, and product-feature truth to actual proven state.

Do not claim the overall approved phase complete until the accepted design’s access/session, provider cache, compose, recipient, Assistant, private-batch, regression, and security acceptance criteria all pass.

## Current execution marker

- **Completed phase:** Phase 1 — Company-access loading reliability
- **Completion PR:** #175
- **Starting `main`:** `fadd8e270da16a1f3f545ab843c466169e9a4ba6`
- **Proven behavior:** same-user `ready` company access is retained during background revalidation; refresh progress/errors are separate from authoritative access state; logout/user changes still invalidate immediately; stale generation/user responses cannot restore obsolete access.
- **Database validation:** not applicable; Phase 1 changes no migrations, RLS, RPC, triggers, database lifecycle behavior, or financial semantics.
- **Next phase:** Phase 2 — Authenticated request recovery

This marker is present on the Phase 1 branch and becomes the durable handoff when PR #175 is safely merged. A fresh chat must still verify live `main`, PR state, and exact-head CI instead of trusting conversation history.

## Fresh-chat bootstrap

For Phase N:

1. Read live `AGENTS.md`.
2. Read `docs/AGENT_EXECUTION_EFFICIENCY.md`.
3. Read `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`.
4. Read `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`.
5. Read the accepted design and this implementation plan.
6. Inspect current `main`, open PRs/branches, and relevant exact-head CI.
7. Confirm the execution marker matches merged repository truth; correct documentation if stale.
8. Generate one bounded `agent:context` packet for that phase.
9. Implement only that numbered phase and its required regression coverage.
10. Validate focused → affected, plus conditional browser/build/Workflow Map/Supabase checks only when applicable.
11. Review the exact final diff, open/finalize the PR, and stop after the phase is safely merged and this marker/handoff are synchronized.

## Per-phase handoff template

At completion record:

- merged PR number and exact merged `main` SHA;
- phase number/name and concise behavior now proven;
- exact tests/CI run on the final head;
- whether Docker/Supabase validation applied, and results if so;
- any remaining blocker or deliberately deferred item;
- next numbered phase only.
