# HydroQualiSense Current Handoff

Status: **CURRENT — WAVE 4D EMAIL/SMS + DOCUMENTS IMPLEMENTATION ACTIVE / SMS NOT CONFIGURED / QA CERTIFICATION NOT READY**
Date: **2026-09-11**  
Repository: `Juvialski/InvoiceApp`

## Exact current product baseline

Current merged application and QA-hardening baseline:

`46e0af036b7a66e6a6f86e0a4557bea576b605bf` (PR #144)

Completed product work through that baseline:

- Wave 1A Supplier Payable Lifecycle UX — complete through PR #126;
- Wave 1B Client Receivable Lifecycle UX — complete through PR #129;
- Wave 2 Cross-module Routing and Handoffs — complete through PR #131;
- Wave 3 Payroll/Subcontract/PO Workflow Decisions — complete through PRs #132 and #133;
- Wave 4A Company Document Templates / Mail Merge Foundation — complete through PR #134;
- Wave 4B High-Fidelity PDF Finalization — complete through PR #135;
- Wave 4C Outbound Issued-Document Gmail Delivery & Delivery History — complete through PR #136;
- Wave 4D Email/SMS + Documents workspace implementation — integrated through PR #138, with SMS provider activation/runtime QA still blocking phase completion;
- Full live-QA company simulation harness and observed-flow hardening — integrated through PR #140, including fixes for project-create identity, RFQ quotation payload persistence, mixed-unit receipt continuation, payroll-run persistence, and hosted Documents semantic-text verification;
- Focused UI/UX remediation and connected Gmail QA audit — integrated through PR #144, including responsive Expense/PO/RFQ/receipt surfaces, Gmail incremental-queue retention, project dialog wording, Cash page hierarchy, mobile document-preview hardening, and programmatic PDF separator safety.
- The current local-QA/PDF-fidelity phase converges issued preview and download on the same PDF bytes and adds a deliberate pre-merge QA harness; hosted exact-SHA QA remains a separate release gate.

The detailed current priority is `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md`.

## Explicit user correction — do not skip this again

The broader Email/SMS + Documents product phase is **not complete**.

The user intended:

1. the current top-level **Email Intake** item to evolve into the top-level **Email / SMS** communications workspace;
2. a separate top-level **Documents** workspace to manage unified access to company documents/document-bearing records and artifacts;
3. the Wave 4A-4C foundations to be integrated into those workspaces;
4. actual SMS sending to remain incomplete until a real provider is selected/configured and runtime-tested;
5. Worker Registration to remain paused until the Email/SMS + Documents experience is genuinely complete and the user explicitly resumes Worker Registration.

Do not interpret merged Wave 4A, 4B, or 4C as permission to proceed to Worker Registration.

## What Waves 4A-4C delivered

### Wave 4A — COMPLETE

Company-bound editable DOCX templates for supported issued financial documents, deterministic immutable-snapshot merge, template validation/versioning/pinning, safe Storage/evidence contracts, and bounded AI-assisted mapping proposals.

### Wave 4B — COMPLETE

Server-side company-template PDF finalization using the supported LibreOffice path where available, with bounded isolated conversion and exact PDF/DOCX/template provenance. Native Node/Render deployments without the converter truthfully retain the programmatic PDF fallback.

### Wave 4C — COMPLETE through PR #136

Eligible issued Purchase Orders and Client Invoices can be sent through connected Gmail using the exact supported PDF. Durable send intents and append-only history preserve recipients, status, attachment identity/source, and template/generation provenance. Explicit resend creates a new attempt; ambiguous/incomplete delivery states remain fail-closed pending reconciliation. Cancelled/voided lifecycle restrictions and permission checks remain intact.

Wave 4C did **not** create a unified communications center and did **not** activate SMS.

## Wave 4D implementation progress — incomplete

The active implementation now provides:

- a top-level Email / SMS workspace with Inbox / Intake, Compose, Sent / Delivery History, and SMS / Provider Status sections;
- preserved Gmail-assisted source discovery and routing, with the existing OAuth identity and read/send scopes reused;
- shared audited Gmail delivery for ordinary messages and eligible issued-document attachments, retaining idempotency and reconciliation safeguards;
- a top-level Documents index over permission-approved existing records and artifacts, with owner-aware navigation and exact document handoff into Compose;
- a discoverable link from Documents to the existing company document-template administration in Settings;
- Assistant entry from Compose for reviewable drafting; the Assistant cannot silently send.

No SMS provider is approved or configured in the current deployment. SMS remains visibly not configured, and provider-backed delivery/status QA has not been performed. Wave 4D is **NOT COMPLETE**. Worker Registration remains **PAUSED**.

The focused UI/UX remediation and live-provider evidence are recorded in
`artifacts/ui-ux-audit/REPORT.md` and `artifacts/ui-ux-audit/findings.json`.

## Current local-QA and PDF-fidelity implementation handoff

The current branch contains an ignored `.env.qa.local` credential/configuration
set and `npm run qa:local`. The harness is fail-closed to QA project
`vrpuznofrntyqsbugrib`, explicitly refuses production project
`qijjshdwiylojvqojxyz`, uses the existing QA account, persists browser state
only under `.qa-e2e/`, and writes sanitized evidence only under ignored local
artifacts. It proves authenticated reload/fresh-route persistence, several
authenticated routes including 390px Documents, one bounded synthetic project
write, and exact preview/download hash equality for synthetic issued Purchase
Order and Client Invoice records.

The programmatic PDF path now renders the actual server PDF bytes in the modal
with PDF.js and reuses those bytes for download. Shared renderer hardening
covers true title centering, logo aspect/transparent handling, long values,
multi-page line content, long notes/terms, and document-number containment.
Deliberate PO and Client Invoice torture cases are generated and rendered to
ignored local artifacts. Native high-fidelity company-template conversion
remains truthfully unavailable when the optional converter is absent.

The local branch evidence is pre-merge functional evidence only. It does not
replace exact-head Hosted QA, provider validation, recovery evidence, migration
parity, or production separation checks after merge.

## Current product phase — Wave 4D

**Wave 4D — Email/SMS Workspace + Documents Workspace** remains the active blocking product phase.

### Email / SMS target

The existing Email Intake workflow must be preserved but moved/evolved into the broader Email / SMS communications experience.

Required product direction:

- Inbox / Intake using the current read-only Gmail-assisted import flow;
- Gmail reconnect/re-consent from the communications workspace;
- Compose / New Message for outbound email;
- eligible document attachment selection from Documents or owning records;
- Assistant-assisted drafting while preserving human review/confirmation;
- unified Sent / Delivery History using the existing Wave 4C history/idempotency/reconciliation foundation;
- SMS compose/provider state;
- actual provider-backed SMS only after approved provider configuration and QA runtime proof.

The Assistant must not silently send consequential messages and must not exceed the current user's permissions.

### Documents target

Add a separate top-level Documents workspace that provides permission-aware unified access to supported document-bearing records and immutable/generated artifacts.

Documents is an index/access surface, not a new authoritative business-record system.

Canonical ownership remains:

- Purchase Orders -> Procurement;
- Client Invoices -> Client Billing/Collections;
- Supplier Invoice source evidence -> Supplier Invoice workflow / authoritative linked Expense semantics;
- Expense receipts/source -> Expense;
- statements -> Cash & Banking;
- Engineering Documents/revisions -> Engineering;
- generated DOCX/PDF artifacts -> their immutable source/snapshot/template/version evidence.

The Documents workspace should support useful search/filtering, preview/open/download, authoritative-context navigation, delivery/history visibility where applicable, handoff into Email / SMS compose, and company-template administration using the existing Wave 4A engine.

## SMS provider state

No outbound SMS provider is currently approved/configured as HydroQualiSense product truth.

Do not claim SMS is Available and do not fake provider health/delivery. A future approved provider must use server-side credentials and the existing company-scoped permission/history/idempotency principles.

If Wave 4D implementation reaches the external-provider boundary before the user creates/configures an SMS account, report that blocker precisely, leave SMS truthfully not configured, and keep Wave 4D incomplete rather than moving on to Worker Registration.

## Server-side Supabase key and AI state

Modern `sb_secret_` server keys are accepted only by protected server-side
operations. Legacy JWT `service_role` keys are not exposed to browser code.
Missing or unavailable AI metadata remains distinct from the legitimate
`NOT_CONFIGURED` company state. Database migration promotion remains separate
from application deployment. Production remains read-only unless explicitly
authorized.

## Gmail provider state

Inbound Gmail intake currently uses read-only Gmail access. Outbound email requires the existing OAuth connection to include Gmail send authorization. The current code already requests `gmail.readonly` plus `gmail.send` during explicit reconnect/re-consent; do not create a second Google-account system.

The full live company simulation on the prior exact QA baseline observed an expired Gmail authorization. The exact-head protected Hosted QA after PR #140 proved application authentication, route, Storage, and release contracts, but it did not convert that provider result into a successful Gmail send. Treat Gmail provider-backed send as requiring explicit reconnect/re-consent and live QA proof.

Follow-up live QA on 2026-09-11 proved the current connected state: the QA
mailbox remained healthy after navigation and reload; a bounded 30-day finance
scan succeeded; incremental `Sync new` returned no new messages; one ordinary
synthetic email and one synthetic issued Client Invoice attachment were
accepted through Gmail and recorded as `SENT` in company delivery history. The
attachment history opened the exact authoritative Client Billing record. No
unrelated mailbox content was imported or retained. Actual mailbox arrival and
inbound routing were not separately exercised because no controlled synthetic
inbound candidate was available.

## Financial / security invariants

Wave 4D must preserve all existing source-of-truth and history contracts, including:

- Supplier Invoice evidence remains separate from authoritative linked Expense payable/cost truth;
- Client Invoice/Collection commercial truth remains separate from Cash settlement evidence;
- no duplicate Actual Cost/payable/collection truth;
- Actual Cost remains distinct from Committed Cost;
- original currency and explicit FX semantics remain intact;
- payroll settlement and Purchase Order lifecycle guards remain intact;
- immutable issued/finalized snapshots and document provenance remain intact;
- send/delivery history stays append-only and company-bound;
- permissions remain capability-based and Assistant parity remains fail-closed;
- one deployment -> one client company -> active membership/RBAC -> permitted workflows.

## Worker Registration gate

**PAUSED by explicit user instruction.**

Worker Registration must not be suggested or prepared as the next phase until:

- Wave 4D's Email / SMS workspace is implemented;
- the separate Documents workspace is implemented;
- existing Wave 4A-4C foundations are integrated coherently;
- real SMS provider-backed sending is QA-proven unless the user explicitly changes the completion definition;
- the user explicitly resumes Worker Registration.

Site Attendance and Face-Recognition Attendance remain later phases in that order, with biometric work requiring its dedicated privacy/security design.

## QA / release-readiness track

`QA CERTIFICATION: NOT READY`

### Full live QA company simulation — 2026-09-11

The original full live company simulation tested exact QA SHA
`36c0736a6f3d8703b1c6d0ab47519123a79a1acb` with QA migration level
`20260910131014` and deployment identity `qa-hydroqualisense`. Synthetic run
`QA-E2E-7F4K` remains in the isolated QA company; production remained strictly
read-only.

That run exercised the cross-module project, procurement/RFQ/PO, warehouse,
equipment, engineering-document revision, client billing/collection/cash
linkage, manual Expense, worker setup, Documents, Reports, Dashboard, and
Email/SMS review surfaces. It also exposed project-create identity, RFQ
quotation-payload, mixed-unit receipt, and payroll-run persistence defects. The
hosted Documents failure was a stale case-sensitive test contract rather than
missing live wording.

PR #140 merged regression-covered fixes for those four business-flow defects
and the hosted Documents assertion. Protected QA Release run `34551019443`
then deployed exact SHA `ec51c29f2b1bdf6927f41746f38a4c967aeb5bff`, promoted
canonical migration `20260910233915`, independently verified post-promotion
migration parity and production separation, and ran authenticated Hosted QA on
the exact deployed state. That exact-head Hosted QA reported deployment
readiness/authentication/reload/fresh-navigation PASS, `9/9` hosted routes,
Storage PASS, and `0` contract failures.

QA remains **NOT READY**. The expired Gmail authorization from the original
simulation has been resolved; the follow-up provider-backed Gmail read/send
checks passed as recorded above. SMS is not configured, the optional
high-fidelity PDF converter is unavailable on the native Node/Render
deployment, and the template/AI provider path did not produce an acceptable
live blueprint. The exact-head Hosted QA is valid evidence for
release/auth/route/Storage contracts only; it does not replace a direct live UI
retest of the four repaired business workflows. The current live retest covered
all four repaired flows; inbound import/routing and separate mailbox-arrival
proof remain unexercised. Keep the `QA-E2E-7F4K` records and original
`artifacts/live-qa` evidence for downstream audit.

The normal release sequence for current application/migration-bearing work remains:

`exact intended app SHA -> intended QA deployment live -> inspect/promote canonical QA migration history when required -> verify parity -> hosted authenticated QA / provider / runtime checks`

Remaining readiness work continues under `docs/CHATGPT_MIGRATION_OPERATOR_POLICY.md` and `docs/HYDROQUALISENSE_DEPLOYMENT_RUNBOOK.md`, including exact-head full live regression of the repaired flows, approved QA AI/provider validation, SMS provider-backed validation if/when configured, and required recovery evidence.

Production remains read-only unless the user explicitly authorizes promotion for the intended deployment/client. A green PR, merge, Render deploy, or QA success does not imply production-write permission.

## Implementation workflow for Wave 4D

Use this handoff with:

- `AGENTS.md`;
- `docs/AGENTS_BASELINE_20260909.md`;
- `docs/AGENT_EXECUTION_EFFICIENCY.md`;
- `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`;
- `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md`;
- `docs/HYDROQUALISENSE_WORKFLOW_UX_AUDIT_20260909.md`;
- deployment/migration docs when QA, provider, or release work is involved.

Start from exact current latest green `main`, generate one bounded lead context packet, inspect existing implementation before designing, preserve shared authority/history contracts, run focused then affected validation, use Docker/local Supabase only when DB contracts change, review the complete final diff, push a feature branch, and open a PR. The implementation Codex agent must not merge its own PR.

## Stop boundary

Do not allow Wave 4D to expand into Worker Registration, Site Attendance, Face Recognition, broad CRM/contact-master redesign, marketing campaigns, bulk unsolicited messaging, new accounting policy, or unrelated visual cleanup.
