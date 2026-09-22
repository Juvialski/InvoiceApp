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

## TypeSafe Jev developer-intelligence — standard advisory checkpoints

For substantial bounded implementation phases, TypeSafe/Jev is now a standard
developer-side advisory accelerator whenever `TYPESAFE_API_KEY` is available.
It remains non-authoritative: deterministic Repository Intelligence / Workflow
Map context, current source, required tests, security/financial/database
reasoning, browser/database evidence, exact-head CI, and Codex lead review remain
the decision authority.

Use Jev at these checkpoints when applicable:

1. **Start/context:** after synchronizing a clean branch/worktree and generating
   the one bounded deterministic context packet, run one live context/reranking
   call before implementation edits. Jev may rank or reduce optional candidates
   but may not remove changed or must-keep files.
2. **Test prioritization:** after deterministic affected-test selection, use one
   live `test-triage` call only when the set is meaningfully broad. Jev may
   reorder required tests for earlier feedback; it may not remove required tests.
3. **Completion/evidence:** before PR delivery, use one live `completion` call
   over sanitized task/evidence metadata to flag potentially missing evidence.
   It does not make a merge decision.
4. **CI triage:** use `ci-triage` only for a real noisy failure where
   classification saves time. Do not call it for green CI.

Fresh worktrees must be Jev-ready. If `@typesafe-ai/sdk` is already declared in
`package.json` / `package-lock.json` but cannot resolve locally, do not edit
dependency declarations: run `npm ci --include=dev`, verify with
`npm ls @typesafe-ai/sdk`, and retry the intended checkpoint once. Use
`doctor` only for an actual setup/API-connectivity problem and `benchmark`
only for deliberate Jev evaluation, not routine product work.

Record useful Jev diagnostics in the implementation handoff when calls succeed:
candidate counts before/after, model, input/output tokens, latency, and fallback
status. Failures fall back immediately to deterministic behavior. Normal CI and
application/runtime bundles remain TypeSafe-free.

Jev changes phase sizing, not authority boundaries. Prefer **wider but still
coherent bounded phases** when related work shares one workflow, data authority,
and validation surface, because broader candidate sets give Jev more room to
remove optional context and let higher-capability Codex reasoning focus on
implementation. A practical planning heuristic is roughly 1.5-3x the old
micro-slice size, often 2-4 tightly related components within one domain/workflow.
Do not bundle unrelated domains, new DB/security authorities, or all remaining
UX work merely to create a larger Jev task.

## Codex implementation handoff fast-start — explicit 2026-09-11 override

This section overrides the preserved baseline and efficiency-guide startup language **for a fresh Codex implementation handoff only**. It does not weaken migration, release, security, data-integrity, or merge safety requirements. ChatGPT PR review uses the proportional validation override later in this file.

The normal manual workflow is:

`ChatGPT prepares prompt -> Codex implements and opens PR -> ChatGPT reviews/fixes/merges -> ChatGPT prepares next prompt`

Because ChatGPT may merge or correct the repository remotely between Codex runs, Codex must assume its local checkout may be stale. Do not spend startup time proving whether the old local checkout is current.

For a new Codex implementation task:

1. **First repository action: synchronize to the latest remote `main`.** Prefer `git fetch origin main`, switch to `main`, then `git pull --ff-only origin main`, and create the task branch from that updated `main`.
2. If the local worktree contains uncommitted work or local-only commits, do **not** discard or overwrite them. Preserve them and use a clean worktree/branch based on current `origin/main` instead.
   When the synchronized existing checkout is clean, create the task branch in that checkout and reuse its existing dependencies. A fresh worktree is exceptional, reserved for preserved local work or genuinely concurrent isolation.
3. After synchronization, record the resulting exact `main` SHA **once** (for example `git rev-parse HEAD`) and proceed. The successful pull/fetch is the normal freshness confirmation.
4. Do **not** inspect open PRs, old CI runs, historical merge state, remote branch history, or the previous prompt SHA during implementation startup unless the task itself is PR review/release work or the prompt explicitly requires that evidence.
5. Read `AGENTS.md`, then only the roadmap/handoff/phase/runbook documents materially needed for the assigned task. Do not re-read unrelated repository documentation by ritual.
6. Generate at most one bounded `agent:context` packet when useful, inspect only the task-relevant implementation, and begin implementation immediately.
7. Do not run a baseline full suite or broad repository audit merely to reconfirm a just-pulled `main`. Follow focused -> affected validation after changes are made.
8. Treat validation as **final-diff-first**: use narrow tests while editing, then run the applicable expensive validation ladder once on the integrated final diff. Do not repeatedly rerun unchanged broad suites after each small edit, and do not duplicate an equivalent protected CI job locally unless the changed risk domain requires earlier runtime evidence or a failure needs local diagnosis.

Prompt creators should put the pull-first instruction at the top of every normal Codex implementation prompt. Avoid wording that tells Codex to spend time independently establishing the latest green remote baseline before pulling; **pull latest `main`, record the SHA once, then work**.

## Selective workbook editing UX — explicit 2026-09-20 override

This later approved UX direction supersedes older wording that could be read as making dense Excel-like registers the primary experience on every applicable page.

Read both:

- `docs/superpowers/specs/2026-09-18-excel-native-operations-ux-design.md` for workbook interchange, diff/review/Apply, concurrency, protected-field, and domain-authority rules; and
- `docs/superpowers/specs/2026-09-20-selective-workbook-editing-ux-direction.md` for the current in-app interaction grammar.

The governing rule is:

**Browse visually -> edit like a spreadsheet -> execute sensitive workflows deliberately.**

Implementation consequences:

1. `OperationsGrid` remains a browse/read/register primitive. Do not force it to become the universal editor.
2. Build a separate shared worksheet-editing foundation for structured create/edit/correction/bulk-entry surfaces.
3. **UX-W1 shared worksheet foundation is implemented**, followed by **UX-W2 Projects card-first portfolio + worksheet editing** and **UX-W3 supplier invoice source-on-top + extracted worksheet review**, before resuming the remaining Finance rollout.
4. Project names must become visually dominant on the Projects landing page; the default portfolio should be large clickable project cards with an optional compact list rather than a wide financial grid as the only desktop emphasis.
5. Spreadsheet-style editing is preferred for Project Details/Cost Codes, supplier-invoice extracted fields/lines, RFQ/PO draft lines, Client Billing drafts, direct editable Expense drafts, Workers, Attendance, Time Entries, Project Assignments, Project Materials/Equipment, and appropriate master-data maintenance.
6. Approval, verification, issue/finalize, settlement/reconciliation, payment, void/reverse, receiving/movement, payroll approval/finalization, lifecycle, identity resolution, provider actions, RBAC/security, and similar consequential actions remain explicit workflows rather than ordinary editable cells.
7. **Add Row** is allowed only where the domain owns repeated child data and current permissions/validation/history rules allow it. **Add Column** must not dynamically mutate SQL schema; future user-defined columns require a separately designed typed custom-field definition/value model.
8. Existing real `.xlsx` round trips remain required where supported, but import/export is a capability of the worksheet experience rather than the definition of Excel-native UX.

Do not continue Client Receivables or Cash & Banking Excel rollout using the old register-plus-workbook pattern before this interaction correction is implemented, unless the user explicitly reprioritizes again.

## Worksheet density and clarity correction — explicit 2026-09-20 override

The first selective-workbook implementations exposed a presentation problem that must be corrected before the pattern expands to UX-W5. Read:

- `docs/superpowers/specs/2026-09-20-worksheet-density-clarity-correction.md`

**UX-W4 Expenses is implemented. UX-W4.5 — Information Density & Worksheet Clarity Correction is now the next product implementation gate before UX-W5.**

UX-W4.5 must begin with **UX-W4.5A — an app-wide screenshot investigation and visual triage**. The two user-provided screenshots are examples only. The investigation must capture representative authenticated/demo states across the major product surfaces and desktop, constrained-laptop, tablet, and phone viewports, then the lead agent must actually inspect the screenshots and classify findings before broad remediation starts. Automated browser PASS/no-overflow is not a visual-quality PASS.

Required consequences:

1. Produce a durable sanitized visual-triage report following `docs/REPOSITORY_EVIDENCE_POLICY.md`, with exact SHA/environment/viewport/route/state, screenshot evidence, ACCEPTABLE / NEEDS CORRECTION / DEEPER WORKFLOW REVIEW, severity, task impact, root cause, and proposed direction.
2. Primary working content must appear before optional explanations, analytics, workbook tools, and secondary disclosures.
3. Projects must surface the project cards immediately after a compact task toolbar; Portfolio analysis and Excel import/export stay available but secondary.
4. Protected/read-only semantics remain fully enforced, but `WorksheetEditor` must not repeat visible `PROTECTED` / `READ-ONLY` pills in every ordinary read-only cell by default.
5. Ordinary source-evidence provenance should be visually quiet; exceptional states such as unresolved, manually corrected, error, warning, or conflict may remain explicit.
6. Prefer progressive disclosure, section/column-level help, and accessible semantics over repeated helper paragraphs and badges.
7. Audit all existing authenticated surfaces for hierarchy, density, excessive chrome, repetition, scanability, action discoverability, responsive usefulness, technical jargon, consistency, and professional finish—not only worksheet pages.
8. Group repeated findings by shared root cause and fix shared primitives/components first where appropriate.
9. This is a presentation/usability correction only. It must not weaken permissions, lifecycle authority, financial truth, provenance, history, concurrency, RLS, or review-before-apply behavior.

Do not start UX-W5 operational bulk-data editors until UX-W4.5A is complete and the blocking P0/P1/shared-root-cause corrections from the visual investigation are implemented and validated.

## Hardening-first product freeze and UI Simplification Round 3 — explicit 2026-09-21 override

This section supersedes older `next`, `active`, and implementation-order wording when they conflict.

The user has temporarily frozen **net-new product feature expansion**. The active engineering focus is now **hardening, workflow improvement, usability simplification, reliability, certification, and developer-efficiency work on capabilities that already exist**.

Archive/defer until the user explicitly resumes them:

- Worker Registration;
- Site Attendance and workforce attendance expansion;
- Face Recognition Attendance;
- remaining UX-W5 workforce editors such as Workers, Attendance, Time Entries, and Project Assignments when they require new product/domain capability rather than hardening an existing workflow;
- Finance UX-W6 feature expansion;
- typed custom-field / Add Column product expansion;
- broader Wide Documents artifact aggregation and optional handover-package grouping;
- other product phases whose primary purpose is adding a new user-facing domain or capability.

Do **not** delete historical plans or describe these items as cancelled. Keep them as an archived/deferred backlog.

Still active because they harden or certify existing capability:

- UI simplification, workflow clarity, accessibility, responsive behavior, and consistency;
- reliability, recovery, validation, concurrency, error handling, security, RLS/RPC/data-integrity hardening, and performance work;
- Wave 4D provider/readiness certification when safe external prerequisites exist;
- authenticated HSC/document render certification for already-implemented document/template capability;
- hosted/exact-SHA QA and release-readiness evidence;
- Repository Intelligence/Jev work that measurably improves implementation/review efficiency without expanding customer-facing scope.

### UI Simplification Round 3 governing direction

Read `docs/superpowers/specs/2026-09-21-ui-simplification-contextual-help-research.md`.

The governing principle is:

**Show the task, data, state, and primary actions by default. Move education and secondary explanation behind consistent contextual help.**

Permanent visible helper prose is no longer the default teaching mechanism. For each page, classify explanatory content as one of:

1. **Keep visible** — essential to completing the current task safely, including blocking validation, irreversible consequences, current exceptional state, required field constraints, or a short statement necessary for most users.
2. **Shorten** — useful to most users but currently verbose; reduce to a compact label or single sentence.
3. **Contextual help** — brief secondary explanation available from an accessible info/help affordance, tooltip/popover, or section help control.
4. **Help Center** — detailed procedure, concepts, examples, onboarding, or rare troubleshooting moved to a dedicated in-app Help area with deep links from the current page.
5. **Remove** — text that merely restates obvious UI controls or duplicates nearby labels.

Do not put task-critical information only in mouse-hover tooltips. Contextual help must work with keyboard focus and a click/tap affordance on touch devices. Detailed instructions belong in Help Center content, not large always-visible panels.

### Research-first requirement

The next UI phase starts with **research and evidence, not implementation**. Codex may use the available Chrome/browser environment for read-only research into successful comparable construction/project/finance applications and established usability guidance. Prioritize products such as Procore, Autodesk Construction Cloud, Buildertrend, Fieldwire, and Raken, then add other close comparators only when they provide a distinct pattern.

Research must:

- use public/help/demo surfaces or the user's already-authorized browser session without mutating external accounts;
- examine navigation, first-view hierarchy, action density, view/edit states, tables/worksheets, filters, onboarding, contextual help, empty/error states, and responsive behavior;
- record patterns and principles rather than copying proprietary assets, branding, or exact layouts;
- compare findings against HydroQualiSense screenshots/routes and produce a durable evidence-backed recommendation before broad UI edits.

The expected implementation sequence is:

`UX-S3A research + app-wide instruction-density audit -> UX-S3B Help Center/contextual-help foundation -> UX-S3C app-wide visible-copy simplification -> UX-S3D workflow-friction hardening -> UX-S3E accessibility/responsive/visual certification`.

New customer-facing domains remain archived throughout this sequence unless the user explicitly changes priority.

## Current priority sequence — explicit 2026-09-19 override

This sequence supersedes older `active`, `next`, and implementation-order wording when they conflict. Live repository state still governs exact scope and merge safety.

1. **Repository Intelligence core + Professionalization Completion is complete in the current implementation run.** RI-1 is merged; RI-2 provides the provenance-aware graph/query API; RI-3 integrates bounded context behind the existing `workflow-map:context` / `agent:context` interfaces with tested fallback; and the remaining professionalization decisions are recorded in `docs/REPOSITORY_ARCHITECTURE_TRIAGE.md` and `docs/REPOSITORY_EVIDENCE_POLICY.md`.
2. **Excel-native implementation follows the completed professionalization boundary.** Excel Phase 0/readiness, the approved shared foundation, the bounded RFQ/Purchase Order pilot, and the Projects/project-controls rollout are implemented. Remaining Excel-native domains require their own bounded rollouts; app-wide Excel capability is not claimed.
3. **Professionalization completion gate.** Satisfied for this repository boundary: remaining large/shared modules are either decomposed or deliberately documented as cohesive; source/test ownership and evidence policy are explicit; safe current branding/onboarding cleanup is complete; and the repository rename is resolved as an external/manual administrative decision rather than open architecture work.
4. **Excel Phase 0/readiness, the original shared grid/workbook foundation, Procurement, Projects/project controls, bounded Phase 4A Expenses + Supplier Payables, UX-W1 through UX-W3, and all bounded UX-W4 draft editors are implemented.** Complete **UX-W4.5 Information Density & Worksheet Clarity Correction** next, beginning with UX-W4.5A app-wide screenshot investigation, before UX-W5. UX-W4.5 must make primary content visible sooner, quiet repetitive protection/provenance labels without weakening semantics, simplify nested worksheet chrome, and audit all already-migrated worksheet surfaces. Preserve real bidirectional `.xlsx` round trips, validation, permissions, history, financial authority, stale-workbook conflict review, and human confirmation before Apply.
5. **Complete remaining Wave 4D provider/readiness work** when required Brevo/SMS credentials, devices, or safe QA prerequisites become available. Provider certification may proceed opportunistically but must not displace the active RI-core/professionalization sequence.
6. **Wide Documents managed standalone files, immutable versions, general upload, retained artifact registration, and Documents detail are implemented for the recorded scope.** Broader artifact aggregation and authenticated HSC/render certification remain separately bounded.
7. **Worker Registration** only after the Wave 4D gate is genuinely complete and the user explicitly resumes it; Site Attendance follows, and Face Recognition requires its own privacy/security design first.
8. **Repository Intelligence RI-4 through RI-6** (structured/2D explorer, change intelligence, and agent-effectiveness hardening) remain later developer-tooling work and are not prerequisites for professionalization completion or Excel-native implementation.
9. **Repository Intelligence RI-7 — optional 3D explorer — LAST.** Do not prioritize or start the 3D/WebGL explorer while any earlier core, professionalization, approved product, provider-readiness, or release-critical work remains ahead of it unless the user explicitly changes this order.

The 3D explorer is presentation only. It is never a prerequisite for Repository Intelligence indexing/context value, customer product work, QA certification, or production release.
## Current implementation tracks — explicit 2026-09-18 override

This section supersedes older `active` / `current implementation` labels below when they conflict. Product dependency history remains useful, but current engineering work must follow this track summary and the live roadmap/handoff.

1. **Repository & Architecture Professionalization — COMPLETE for the current repository boundary.** Slices 1-4 and Slice 5 Waves A-C, RI-2/RI-3, responsibility triage, evidence policy, front-door synchronization, and repository-identity evaluation are recorded in the current repository state. This does not certify external GitHub/Render administration or provider readiness.
2. **Email/SMS Reliability — implementable slice complete; runtime certification pending.** Authenticated request recovery, Company SIM Gateway/PhilSMS provider adapters, reviewed one-recipient SMS flow, delivery-history/idempotency/reconciliation, and provider timeout hardening are on merged `main`. Real Brevo/SMS provider certification remains separate until safe credentials/device runtime exist; professionalization work must not absorb or rewrite messaging/provider boundaries.
3. **Excel-Native Operations UX — ACTIVE ROLLOUT WITH 2026-09-20 INTERACTION CORRECTION.** The workbook/authority contract is `docs/superpowers/specs/2026-09-18-excel-native-operations-ux-design.md`; the current in-app UX contract is `docs/superpowers/specs/2026-09-20-selective-workbook-editing-ux-direction.md`. Phase 0/readiness, the original shared foundation, RFQ/Purchase Order, Projects/project-controls, bounded Expenses/Supplier Payables, and UX-W1 shared worksheet foundation are implemented. The next work is UX-W2 Projects and then UX-W3 supplier-invoice review before later domain rollouts.
4. **Wide Documents managed foundation — IMPLEMENTED for the recorded scope.** Broader artifact aggregation and authenticated HSC/render certification remain separately bounded.
5. **Worker Registration — PAUSED** until the broader Wave 4D gate is genuinely complete and the user explicitly resumes it.

QA/release/provider certification remains a parallel readiness track. A structural merge does not imply hosted certification or production authorization.

## Earlier product sequence context — explicit 2026-09-14 reprioritization

The broad `Email/SMS + Documents` phase remains incomplete. This 2026-09-14 sequence is retained as product-dependency history; where it describes an item as the active implementation run, the 2026-09-18 Current implementation tracks section above now governs.

Historical product dependency sequence:

1. Wave 1A — Supplier Payable Lifecycle UX — complete on merged `main`.
2. Wave 1B — Client Receivable Lifecycle UX — complete on merged `main`.
3. Wave 2 — cross-module routing and handoffs — complete on merged `main`.
4. Wave 3 — deliberate payroll/subcontract/PO workflow decisions — complete on merged `main`.
5. Wave 4A — company document templates / mail merge foundation — complete.
6. Wave 4B — high-fidelity PDF finalization foundation — complete for the programmatic fallback; converter-backed company-template capability remains separately constrained/certified.
7. Wave 4C — issued-document email delivery/history foundation — complete.
8. Wave 4D — Email/SMS Workspace + Documents Workspace — partially implemented but **not complete**.
9. **UI/UX Round 2 — App-Wide Usability Simplification & Information Architecture — COMPLETE in PR #161.** Its workflow-first information architecture and usability rules remain the application UI baseline.
10. **Wide Documents Phase — managed foundation implemented for the recorded scope.** Broader artifact aggregation, authenticated HSC/render certification, and optional handover packaging remain incomplete and must be resumed deliberately.
11. **Client Security Assurance & Handoff — ACTIVE by explicit user approval.** Implement and security-test company-scoped custom roles, complete the focused handoff/security audit, produce evidence, and generate the client security PDF without unsupported claims or production mutation.
12. **Google Sign-In + Brevo Transactional Email Migration — ACTIVE by explicit user approval.** Google is identity-only; Gmail mailbox/API read, intake, and send are removed; Brevo is the server-side outbound email provider; preserve approved Company SIM Gateway / PhilSMS boundaries, human confirmation, and truthful provider readiness.
13. **Remaining Wave 4D provider/readiness completion — follows the active reliability slice while any approved provider-backed criteria remain incomplete.**
14. **Wide Documents broader managed/artifact follow-up — DEFERRED** after the managed foundation boundary; resume deliberately for aggregation or certification work.
15. Worker Registration — **PAUSED by explicit user instruction** until broader Wave 4D is genuinely complete and the user explicitly resumes Worker Registration.
16. Site Attendance follows Worker Registration.
17. Face-Recognition Attendance follows only after explicit privacy/security design.
18. Final pre-production certification follows the major product domains.

The active security phase contract and implementation plan are:

`docs/HYDROQUALISENSE_CLIENT_SECURITY_ASSURANCE.md`

`docs/superpowers/plans/2026-09-15-client-security-assurance.md`

The completed UI/UX Round 2 design and acceptance record is:

`docs/HYDROQUALISENSE_UI_UX_ROUND2_SIMPLIFICATION.md`

Treat that document as the standing usability/information-architecture baseline when later work touches authenticated UI. For the active Email/SMS phase, read `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md`, `docs/GOOGLE_SIGNIN_BREVO_SETUP.md`, and the existing Wave 4A-4C delivery/template contracts. Read the Wide Documents contract and current managed-artifact handoff when broader aggregation or certification is deliberately resumed.

The 2026-09-15 reprioritization does **not** cancel Wave 4D or change its approved provider direction. Existing Email/SMS/Documents implementation, Company SIM Gateway primary direction, PhilSMS optional fallback direction, delivery-intent history, provider-neutral/server-side adapter boundaries, and human send-confirmation boundaries remain valid and must be preserved after the security phase. The security phase must preserve company isolation, permission-based authority, protected platform/root boundaries, and truthful provider states.

The user explicitly permits UI navigation/tab restructuring when it improves and simplifies the product, provided important features, deep links where practical, permission boundaries, financial/source semantics, audit history, and workflow correctness are preserved.

The completed UI/UX Round 2 standard remains stronger than a no-overflow pass: major screens must make it apparent what the page is for, what needs attention, and what the user can do next without requiring knowledge of HydroQualiSense internals.

### Email/SMS + Documents completion gate

Do **not** suggest, prepare, or start Worker Registration as the next product phase while any of the following remain unfinished:

- the top-level **Email / SMS** communications workspace is not genuinely usable for reviewed Compose, Sent / Delivery History, and truthful provider status;
- the separate top-level **Documents** workspace is not genuinely usable as permission-aware access to document-bearing records/artifacts without duplicating canonical source ownership;
- outbound email composition/history is still effectively limited to scattered record-local controls rather than being usable from the Email/SMS communications experience;
- SMS remains only scaffolding and no approved provider-backed sending path has been configured and runtime-tested in QA;
- Assistant-assisted message drafting/attachment selection does not preserve human review/confirmation before sending;
- existing Wave 4A/4B/4C template, PDF, email delivery, idempotency, reconciliation, lifecycle, and immutable-history foundations are not integrated into the broader workspaces.

Wave 4A-4C are supporting foundations for the broader Email/SMS + Documents product phase. They must not be represented as satisfying this completion gate by themselves.

UI/UX Round 2 and the Document Template AI corrective phase are complete foundations. Complete the active Email/SMS Reliability & UX slice and the broader Wave 4D provider/readiness gate before Worker Registration, while preserving the workflow-first UI baseline and all existing provider boundaries.

QA certification/recovery/provider/deployment work remains a **parallel release/readiness track**. Do not represent unfinished QA certification as complete merely because product development continues, and do not infer production authorization from QA or merge success.

Read the active roadmap, current handoff, the client security assurance contract/plan, completed UI/UX Round 2 design record, and `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md` before preparing later security or resumed provider work.

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
