# Engoryx Phase 1B — RFIs & Technical Submittals

Phase 1B adds formal engineering coordination to the existing Phase 1A Engineering Documents foundation. It deliberately reuses the same project context and immutable `engineering_document_revisions`; it does not introduce another file/blob subsystem.

## Scope

Phase 1B is project-scoped and contains two separate workflows:

- **RFIs** — question / clarification records with explicit open, answer, and close semantics.
- **Technical Submittals** — formal review packages with explicit review outcomes and resubmission rounds.

They share project identity, discipline vocabulary, immutable document-revision references, company RBAC, audit infrastructure, and Assistant confirmation conventions. They do **not** share a generic lifecycle abstraction because their domain semantics differ.

## RFI model and lifecycle

Primary records live in `engineering_rfis`; formal responses live in append-only `engineering_rfi_responses`; immutable document/revision references live in `engineering_rfi_document_links`.

Supported lifecycle:

`DRAFT → OPEN → ANSWERED → CLOSED`

`VOID` is terminal and is available only through the guarded lifecycle operation.

Important rules:

- A draft can be prepared before formal opening.
- Once opened, company/project identity, RFI number, subject, question, discipline, creator, and creation timestamp are immutable.
- Responses are append-only. Corrections are new response records, not edits to formal history.
- A final response operation records the response and transitions an OPEN RFI to ANSWERED atomically.
- CLOSED and VOID are terminal states.
- Due dates are tracked separately from lifecycle status so overdue open RFIs remain visible.

## Technical Submittal model and lifecycle

Primary records live in `engineering_submittals`; formal rounds live in `engineering_submittal_rounds`; review decisions live in append-only `engineering_submittal_reviews`; revision references live in `engineering_submittal_document_links`.

Supported statuses include:

- `DRAFT`
- `SUBMITTED`
- `UNDER_REVIEW`
- `APPROVED`
- `APPROVED_AS_NOTED`
- `REVISE_AND_RESUBMIT`
- `REJECTED`
- `CLOSED`
- `VOID`

Important rules:

- Creation produces the submittal and its first draft round.
- Submission makes the formal submittal identity immutable.
- Review decisions are append-only records tied to a specific round number and round ID.
- `REVISE_AND_RESUBMIT` does not overwrite the rejected/revision-requested package. Resubmission creates a new round while retaining all prior round metadata, revision links, and review decisions.
- `APPROVED_AS_NOTED` is distinct from `APPROVED`.
- Formal round identity is immutable after submission.

## Immutable Engineering Documents linkage

Phase 1B links to the existing Phase 1A records:

- `engineering_documents`
- `engineering_document_revisions`

A link stores both document ID and revision ID. Server-side validation confirms that the revision belongs to the stated document, the same company, and the same project as the parent RFI/Submittal. Existing Phase 1A private-file delivery and signed-URL rules are unchanged.

This prevents coordination records from silently drifting when a newer revision is later uploaded.

## Database and write boundary

Migration: `supabase/migrations/20260827140000_engineering_coordination_phase1b.sql`.

Lifecycle mutations are operation-specific RPCs rather than arbitrary client status updates. Examples include:

- `create_engineering_rfi`
- `open_engineering_rfi`
- `respond_engineering_rfi`
- `close_engineering_rfi`
- `create_engineering_submittal`
- `submit_engineering_submittal`
- `start_engineering_submittal_review`
- `review_engineering_submittal`
- `resubmit_engineering_submittal`

The RPC surface uses authenticated `auth.uid()` identity, company permission checks, `SECURITY DEFINER` with an empty search path, project/company validation, and revision-reference validation. Public/anonymous execution is revoked.

Formal response/review/revision-link history is protected by append-only triggers. Identity-guard triggers prevent direct updates from rewriting formal records after the relevant lifecycle boundary.

## RBAC

Phase 1B adds explicit capabilities instead of inferring authority from page visibility:

### RFIs

- `engineering.rfis.read`
- `engineering.rfis.create`
- `engineering.rfis.respond`
- `engineering.rfis.manage`

### Technical Submittals

- `engineering.submittals.read`
- `engineering.submittals.create`
- `engineering.submittals.review`
- `engineering.submittals.manage`

`COMPANY_ADMIN` receives the full Phase 1B capability set by default. Existing operational roles receive read access only unless explicitly expanded. The client permission hook fails closed for authenticated production workspaces and only returns full access in the explicitly isolated demo guest mode.

## Audit trail

Phase 1B extends the company audit allowlist with named lifecycle events for RFI create/open/respond/close/void and Submittal create/submit/review-start/review/resubmit/close/void.

The repository migration invariant now requires the full 51-event audit superset through Phase 1B so a future migration cannot accidentally drop older audit event types.

## AI Assistant integration

The Assistant receives bounded company-scoped read tools for searching and opening RFIs/Submittals, plus navigation actions that route directly to a verified project RFI/Submittal record.

Mutations use the existing PREPARE → human confirmation → execute model:

- `prepare_create_rfi`
- `prepare_respond_rfi`
- `prepare_close_rfi`
- `prepare_create_submittal`
- `prepare_submit_submittal`
- `prepare_review_submittal`
- `prepare_resubmit_submittal`

Preparation does not write. On confirmation, the server revalidates the normalized arguments, rechecks company permissions, then calls the same guarded Phase 1B database RPC used by the application domain before the Assistant action can be marked `EXECUTED`.

The model is never the source of truth for lifecycle state or persisted success.

## Demo isolation

The public Meridian Engineering & Construction Corp. demo contains deterministic Phase 1B fixture data, including:

- six RFIs across active projects,
- an overdue open structural RFI,
- answered/closed historical RFIs,
- six technical submittals,
- approved, under-review, revise/resubmit, and approved-as-noted examples,
- a structural-steel submittal with a preserved Round 1 `REVISE_AND_RESUBMIT` decision and a Round 2 `APPROVED_AS_NOTED` decision.

The demo uses local/session browser state and fictional IDs. It does not mount production company queries, Supabase writes, Storage uploads, or real company identifiers. Reset Demo restores the deterministic Phase 1B fixture state.

## Validation

Phase 1B is covered by the repository's existing validation lanes:

- TypeScript typecheck (`npm run lint`)
- Node native test suite (`npm test`)
- production bundle build (`npm run build`)
- static migration invariants
- clean isolated Supabase migration replay
- pgTAP schema/security assertions
- historical-data upgrade migration suite
- Chromium demo visual QA

The Phase 1B PR must remain unmerged until the feature-specific navigation/demo review and acceptance checklist are complete.

## Intentionally deferred

The following are not part of Phase 1B:

- transmittals,
- richer document workflows beyond the existing Phase 1A foundation,
- drawing comparison,
- automatic engineering conclusions from the AI model,
- any new accounting or payroll coupling.
