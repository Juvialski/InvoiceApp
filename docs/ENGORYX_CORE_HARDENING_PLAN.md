# Engoryx Core Hardening & Completion Plan

## Status

**ACTIVE PROGRAM — FEATURE EXPANSION FROZEN**

Engoryx is pausing planned/future product expansion while the existing product is hardened, completed, and made easier to correct safely.

Do not start Scheduling/Gantt/CPM or another roadmap module until this hardening program reaches its exit criteria and the feature freeze is explicitly lifted.

The architectural baseline is:

`one deployment -> one client company -> active membership/RBAC -> permitted workflows`

The goal of this program is not to add surface area. It is to make existing workflows complete, recoverable, permission-correct, financially truthful, and production-ready.

### Wave 1 status

Company profile editing, trusted invitation delivery/lifecycle state, and per-member permission overrides are implemented in the focused Wave 1 change. Final live Supabase replay, authenticated role probes, configured email delivery, and browser evidence remain release validation requirements; Scheduling/Gantt/CPM remain planned and frozen.

## Execution model

Each wave should normally be its own focused PR and fresh agent session.

For substantial scoped work:

- start with a bounded WM-5 packet;
- default to one hop and approximately 10k–12k characters;
- inspect only the source/tests needed to answer the task;
- use at most two concurrent subagents;
- keep shared/security-sensitive integration with the lead;
- hand CI monitoring to the GitHub-native lead after the implementation PR is pushed;
- do not let one hardening run expand into a repository-wide reread.

Security, RLS, migrations, payroll history, financial history, and destructive operations remain high-risk boundaries and require appropriate validation.

## Cross-cutting correction rule

Existing entities should converge on one understandable correction model:

1. **Unused accidental record** → guarded permanent delete when no dependent or auditable history exists.
2. **Used operational record** → archive, deactivate, offboard, cancel, end-date, or equivalent lifecycle action.
3. **Finalized/auditable record** → void, reverse, supersede, or deliberate correction workflow; never silently erase history.

The UI and Assistant must expose the same permitted lifecycle outcomes. A user should not be able to create a record and then discover that there is no safe way to correct the mistake.

## Wave 0 — Close current financial truth work

Finish the safe project labor-cost aggregate work already in progress before starting the hardening waves.

Exit criteria:

- aggregate exposes project-level labor cost only;
- payroll detail is not broadened;
- lifecycle/currency/completeness semantics remain truthful;
- clean migration replay, pgTAP/invariants, upgrade path, application tests, build, workflow-map checks, and affected browser QA are green on the exact PR head;
- PR is reviewed and merged before Wave 1 begins.

## Wave 1 — Company identity, invitations, and access control

### 1A. Editable deployment-company profile

The deployment company identity is fixed, but normal company metadata must be editable by authorized admins.

Audit and implement an appropriate profile surface for fields supported by the current domain, including where applicable:

- company/display name;
- company code where safe to edit;
- address/contact information;
- default currency;
- timezone;
- logo/branding;
- tax/business identifiers.

Requirements:

- `company_id` remains immutable;
- no tenant/company switching is introduced;
- replace visible migration/bootstrap labels such as `Legacy workspace ...` with the configured company name;
- provide a clear first-run/company-setup path for a newly provisioned deployment;
- company updates are permission-checked, audited, company-bound, and reflected across the UI after refresh.

### 1B. Real invitation delivery

Current database invitations are useful authorization state but are not sufficient UX if no message reaches the recipient.

Implement a real server-side invitation delivery path using the deployment's supported Supabase Auth/server/Edge Function architecture.

Requirements:

- never expose a service-role secret in the browser;
- invitation is bound to the exact normalized email and deployment company;
- recipient receives a usable Engoryx invitation/sign-in path;
- expiry/revoke/accept states remain authoritative in the database;
- login/claim only succeeds for the matching verified email;
- resend/revoke behavior is clear and audited;
- delivery failure must not be presented as a successfully sent email;
- invitation UI distinguishes `created`, `sent`, `delivery failed`, `accepted`, `revoked`, and `expired` as appropriate to the chosen implementation.

### 1C. Per-member permission customization

Keep the existing granular permission vocabulary. Do not create a separate authorization system.

Roles remain useful **presets**:

- COMPANY_ADMIN
- FINANCE
- PAYROLL
- VIEWER
- Custom presentation state when overrides differ from a preset

Implement membership-level effective permissions using a model equivalent to:

`role preset permissions + explicit member grants - explicit member denies`

Exact schema may differ after live inspection, but requirements are:

- database is authoritative for effective permissions;
- grants/denies are company-bound and membership-bound;
- pending invitations can carry intended overrides that transfer safely when claimed;
- Admin UI groups permissions by understandable feature/domain and supports easy check/uncheck controls;
- risky permissions remain visibly distinct from ordinary read permissions;
- changing a role preset does not silently discard explicit overrides unless the admin deliberately resets to preset;
- UI routes, deterministic mutations, server/RPC authorization, RLS helpers where applicable, and Assistant tools use the same effective permission contract;
- no email address alone becomes a permanent authorization principal after account creation; membership/user identity remains authoritative;
- an admin cannot remove the last active access-management authority and lock the deployment out.

### Wave 1 validation

At minimum cover:

- company-name/profile edit and refresh persistence;
- no company-ID mutation/switching;
- invitation create/send/accept/revoke/expire/resend paths;
- wrong-email claim rejection;
- delivery failure UX;
- role preset behavior;
- grant override;
- deny override;
- reset-to-preset behavior;
- active/suspended/revoked member behavior;
- last-admin/access-manager protection;
- Assistant permission parity;
- fresh and upgrade migration validation where schema/RPCs change;
- desktop/mobile Settings/access-management QA.

## Wave 2 — Correction and removal semantics

Audit every currently implemented entity for a safe correction path. Do not add raw deletion indiscriminately.

### Wave 2A — Workforce and payroll correction lifecycles (implemented in this PR)

Wave 2A hardens the existing worker/payroll domain without expanding the
product surface. The additive workforce correction migration and shared
`payrollLifecycle` contract provide:

- authoritative worker dependency preflight, unused-only deletion,
  offboarding, and reactivation;
- date-ranged project assignments with multiple concurrent projects, safe end
  semantics, archived-project rejection, and history-preserving unused delete;
- explicit `PROJECT`, `ADMIN_OFFICE`, `GENERAL_OVERHEAD`, and
  `UNALLOCATED_REVIEW` context rules, with actual work evidence kept separate
  from default/home context and no fake Main Office project;
- effective-dated compensation profile supersession/end protection and
  recurring component deactivation/end protection;
- guarded draft deletion, source void, and leave/overtime cancellation with
  reasons, while approved/paid/locked payroll sources remain immutable;
- existing permission vocabulary (`workers.read`, `workers.manage`,
  `workers.compensation.read`, `payroll.detail.read`, and `payroll.manage`),
  company-derived SECURITY DEFINER RPCs, closed direct DELETE paths, and
  lifecycle audit events.

The implementation is covered by focused application tests, migration
invariants, and a pgTAP suite. Fresh replay, historical upgrade replay,
authenticated RLS probes, and responsive browser evidence are release gates
to be recorded against the exact PR head; they are not inferred from static
checks.

### Wave 2B1 — Project correction lifecycle (implemented in this PR)

Project correction now uses one company-scoped lifecycle contract. The
database preflight counts project dependencies without returning payroll or
employee detail, and the mutation RPC locks the project and rechecks those
dependencies before any permanent delete.

| Project state or evidence | Permitted lifecycle outcome | History rule |
| --- | --- | --- |
| No operational, financial, workforce, payroll, engineering, import, or project-accounting dependency | `DELETE_UNUSED` after explicit confirmation | Permanently delete the accidental project and append a bounded audit event. |
| Any dependency exists | `ARCHIVE` after a reason and explicit confirmation | Preserve the project identity and every linked record; remove the project from active workflows. |
| Archived from `PLANNING`, `ACTIVE`, or `ON_HOLD` | Explicit `REACTIVATE` after a reason and confirmation | Restore the prior non-terminal state; do not rewrite historical records. |
| Archived from `COMPLETED` or `CANCELLED`, or with no known prior state | Remain archived | Reactivation is refused so a terminal business state cannot be bypassed. |

The authoritative dependency categories are invoice project allocations,
expenses, project-worker assignments, work entries, overtime requests, payroll
project allocations and project-context snapshots, payroll import rows,
worker and compensation-profile default projects, engineering documents,
RFIs, submittals, Daily Site Logs, and project accounting events. Archived
projects reject new direct and linked cost, workforce, import, engineering,
and project-accounting activity at the affected database paths. `projects.read`
authorizes preflight; `projects.manage` authorizes lifecycle mutation, with
active membership and explicit member DENY overrides enforced by the same
effective-permission helper used by RLS.

### Wave 2B2 — Invoice and expense correction lifecycle (implemented in this PR)

Invoices and direct expenses now use authoritative, company-scoped correction
preflight and mutation RPCs. The mutation locks the target row, reruns the
dependency scan, and records the original values, reason, actor, and bounded
preflight in the append-only audit trail before changing or deleting anything.

| Record state or evidence | Permitted lifecycle outcome | History and cost rule |
| --- | --- | --- |
| Truly unused invoice or `DRAFT` expense with no dependent or auditable history | `DELETE_UNUSED` after explicit confirmation | Guarded permanent deletion only; direct table `DELETE` remains closed. |
| Used operational invoice or expense with no confirmed settlement | `VOID` after a reason and explicit confirmation | Preserve source/history/allocations; exclude the record from active project cost. |
| Any invoice or expense where visibility should change without changing financial meaning | `ARCHIVE` or `RESTORE` after a reason and explicit confirmation | Change directory visibility only; preserve financial status and cost contribution. |
| Confirmed settlement evidence exists | No void or permanent delete | Correction is blocked and points to the deferred Wave 2B3 settlement-correction workflow. |

Voided invoices and expenses are immutable at the ordinary table-update path.
Invoice allocations and history remain preserved, while new allocations,
project-accounting events, and confirmed settlement matches cannot target a
voided record. Existing settlement rows are not silently reversed. `invoices.read`
or `expenses.read` authorizes preflight; `invoices.manage` or `expenses.manage`
authorizes mutation, with verified-invoice voids additionally requiring
`invoices.verify`. UI and Assistant paths use the same lifecycle semantics and
cannot bypass the database RPC boundary.

### Wave 2C — Engineering correction and removal lifecycles (implemented in this change)

The existing Engineering Documents, RFI, Technical Submittal, and Daily Site
Log workflows now converge on the same guarded correction model. Each public
lifecycle surface has a bounded read preflight and a company-derived,
permission-checked mutation RPC that locks the target and rechecks the current
state before changing or deleting it. Direct client deletes and lifecycle-field
updates remain closed.

| Engineering record state or evidence | Permitted lifecycle outcome | History rule |
| --- | --- | --- |
| Document is an untouched `DRAFT` shell with no revisions, annotations, RFI/Submittal links, Storage objects, or meaningful lifecycle history | `DELETE_UNUSED`, or `ARCHIVE` / `SUPERSEDE` after reason and confirmation | Only the unused shell may be removed; audit history remains append-only and no Storage object is deleted by the workflow. |
| Document has a revision, annotation, coordination link, Storage object, or formal history | `ARCHIVE` or `SUPERSEDE` after reason and confirmation | Revision lineage, annotations, links, and source files remain valid historical references. |
| RFI is an unused `DRAFT` with no response/link/history dependency | `DELETE_UNUSED` after confirmation | The guarded delete removes only the disposable draft; formal response history is never deleted. |
| RFI is `OPEN` or `ANSWERED` | Append a response with `CORRECTION` / `NOTE`, or `VOID` with reason | Responses remain append-only; `CLOSED` and `VOID` RFIs remain preserved. |
| Submittal is an unused `DRAFT` with only disposable Round 1 and no links/reviews | `DELETE_UNUSED` after confirmation | Submitted/reviewed rounds are never hard-deleted. |
| Submittal is submitted, reviewed, or requires resubmission | `VOID` / withdraw with reason, or create a new resubmission round through the existing path | Earlier rounds, review decisions, and revision links remain immutable; terminal records are not silently reopened. |
| Site Log is an editable `DRAFT` without formal submission/finalization/addendum history | Correct the draft or `DELETE_UNUSED` after confirmation | Draft observations may be removed with the disposable draft; submitted/finalized field history cannot be erased. |
| Site Log is `SUBMITTED` | `FINALIZED` through the existing path, or `VOID` with reason | Submitted observations remain protected from ordinary content edits. |
| Site Log is `FINALIZED` | Add an append-only correction/addendum with reason and correction text | Original weather, workforce, equipment, safety, delay, and narrative observations remain unchanged. |

The addendum table is read-only to clients and writable only through its
authenticated lifecycle RPC. Demo actions use the same state decisions against
isolated deterministic fixtures and never call production Supabase or Storage.

Deferred from this focused slice:

- Wave 2B3 — cash, banking, and settlement correction semantics;
- Wave 3 — Assistant project lifecycle/action parity.

Scheduling/Gantt/CPM remains frozen.

Priority known gaps include:

### Workforce / Payroll setup

- Workers: permanent delete only when truly unused; otherwise deactivate/offboard/archive with end date/status.
- Project worker assignments: edit/end/remove when safe.
- Compensation profiles: correct/remove future or unused profiles without rewriting historical payroll meaning.
- Recurring payroll components: activate/deactivate/end/correct safely.
- Work/time entries: delete/correct drafts where safe; protect finalized payroll sources.
- Attendance: explicit correction/void workflow with reason/history as required.
- Leave/overtime: complete cancel/void/correction behavior consistent with lifecycle guards.

### Finance / Projects

Verify and harmonize existing behavior for:

- invoices;
- expenses;
- projects;
- vendors;
- cash accounts/transactions;
- imports;
- reconciliation/settlements.

### Engineering

Verify archive/void/supersede behavior for:

- engineering documents and annotations;
- RFIs;
- technical submittals;
- Daily Site Logs.

Requirements for all domains:

- destructive actions require clear confirmation;
- dependency checks occur server-side/database-side where integrity requires it;
- archived/voided/reversed records are excluded from active totals according to canonical semantics;
- finalized history cannot be erased through browser or Assistant paths;
- restore/reactivate is offered when the lifecycle supports it;
- audit events record consequential changes where appropriate.

## Wave 3 — Assistant parity for existing workflows

Do not add new product domains. Bring the Assistant up to parity with safe operations that already exist in Engoryx.

Examples include, subject to current permissions/lifecycle rules:

- edit worker;
- safely delete an unused worker;
- offboard/deactivate a used worker;
- correct or void attendance/time records;
- end/remove assignments;
- manage recurring payroll setup;
- archive/cancel/void existing records;
- edit company profile;
- assist with invitation/member-permission management where safe.

Requirements:

- Assistant authorization exactly matches deterministic authorization;
- mutations use PREPARE → validate → human confirmation → execute;
- destructive previews explain whether the result is Delete, Archive/Offboard, Void, or Reverse;
- dependency conflicts produce a useful alternative rather than a misleading generic refusal;
- Assistant never gains a permission merely because another role or UI can perform the action;
- ambiguous targets require clarification rather than guessing.

## Wave 4 — CRUD and RBAC completeness audit

Build and test a current-feature matrix covering every implemented major entity and action:

- Create
- Read/View
- Edit/Correct
- Delete/Archive/Void/Reverse/Deactivate as appropriate
- Restore/Reactivate where supported
- Import/Export where applicable
- Assistant equivalent where applicable

For each action verify:

`visible UI affordance -> frontend permission -> server/RPC guard -> RLS/database invariant -> audit/history behavior`

Role/effective-permission smoke tests should include at least:

- Company Admin;
- Finance;
- Payroll;
- Viewer;
- custom-grant member;
- custom-deny member;
- suspended/revoked member.

Remove dead-end screens, controls that fail only after click when they can be accurately gated earlier, and hidden backend capabilities that users reasonably need to correct mistakes.

## Wave 5 — Financial and data-integrity audit

Perform adversarial checks of existing financial/workforce behavior without adding new modules.

Focus on:

- invoice/project allocation correctness;
- expense/project costing;
- project labor aggregates;
- payroll calculation and lifecycle transitions;
- attendance/overtime/leave source revision behavior;
- cash/settlement separation;
- reconciliation and reversal semantics;
- currency separation and no implicit FX;
- archived/voided/reversed exclusion rules;
- duplicate submission/idempotency risks;
- stale data and concurrent update behavior;
- immutable snapshots and historical meaning;
- import provenance;
- report/dashboard/Assistant completeness truthfulness.

Any total that cannot be authoritative must remain explicitly incomplete rather than becoming a plausible false number.

## Wave 6 — UX, browser, and recovery hardening

Run current-feature browser QA rather than feature expansion.

Audit:

- desktop/tablet/mobile layouts;
- empty states;
- loading states;
- error states;
- retry/recovery paths;
- confirmation dialogs;
- destructive-action wording;
- stale `InvoiceApp`, `Legacy workspace`, multi-company, or outdated terminology;
- awkward/missing controls;
- inaccessible controls/navigation;
- refresh/persistence behavior;
- cross-device persistence for stored assets;
- console/runtime/network errors;
- Assistant side-panel interaction with each major page.

Visual improvement should prioritize clarity, hierarchy, consistency, and recovery from mistakes rather than decorative redesign.

## Wave 7 — Production-readiness closure

Final integrated audit after Waves 1–6.

Required areas:

- exact-head CI only;
- clean fresh Supabase migration replay;
- historical upgrade-path migration suite;
- pgTAP/database invariants;
- full Node tests;
- lint/typecheck;
- production build;
- workflow-map generation/check/consistency/tests where applicable;
- representative browser QA at mobile/tablet/desktop widths;
- role/custom-permission smoke tests;
- Assistant authorization/destructive-action regression tests;
- no orphaned temporary scripts/logs/self-modifying CI;
- current docs match actual behavior;
- feature registry does not advertise planned features as available.

## Hardening program exit criteria

The feature freeze should be reconsidered only when all of the following are true:

1. company identity/profile is editable without reintroducing tenant switching;
2. invitation delivery is real, observable, and secure;
3. admins can safely customize effective permissions per member;
4. current entities have an intentional correction/removal lifecycle;
5. Assistant can perform the supported correction workflows with permission parity and confirmation;
6. CRUD/RBAC matrix has no unexplained major gaps;
7. financial/reporting totals are permission- and completeness-correct;
8. fresh and historical database validation is green;
9. current major workflows pass browser/responsive QA;
10. documentation and feature-status surfaces reflect the implemented product truth.

Only after this baseline is stable should the project reassess planned modules such as Scheduling/Gantt/CPM.

## Out of scope during the freeze

Unless explicitly required to fix an existing regression or the user explicitly lifts the freeze, do not implement:

- Phase 2 Scheduling/Gantt;
- CPM/critical path;
- schedule baselines;
- future roadmap modules;
- unrelated major UI redesigns;
- speculative new integrations;
- automatic FX conversion.
