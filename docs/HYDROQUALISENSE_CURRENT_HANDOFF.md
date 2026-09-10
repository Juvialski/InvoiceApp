# HydroQualiSense Current Handoff

Status: **CURRENT — WAVE 4D EMAIL/SMS + DOCUMENTS PRODUCT COMPLETION NEXT / QA CERTIFICATION NOT READY**  
Date: **2026-09-10**  
Repository: `Juvialski/InvoiceApp`

## Exact current product baseline

Current merged `main` before this documentation-only correction:

`3fd73039afd018b1bb630bfee2a68a38c6d37fcc`

Completed product work through that baseline:

- Wave 1A Supplier Payable Lifecycle UX — complete through PR #126;
- Wave 1B Client Receivable Lifecycle UX — complete through PR #129;
- Wave 2 Cross-module Routing and Handoffs — complete through PR #131;
- Wave 3 Payroll/Subcontract/PO Workflow Decisions — complete through PRs #132 and #133;
- Wave 4A Company Document Templates / Mail Merge Foundation — complete through PR #134;
- Wave 4B High-Fidelity PDF Finalization — complete through PR #135;
- Wave 4C Outbound Issued-Document Gmail Delivery & Delivery History — complete through PR #136.

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

## Next product phase — Wave 4D

**Wave 4D — Email/SMS Workspace + Documents Workspace** is the next blocking product phase.

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

## Gmail provider state

Inbound Gmail intake currently uses read-only Gmail access. Outbound email requires the existing OAuth connection to include Gmail send authorization. The current code already requests `gmail.readonly` plus `gmail.send` during explicit reconnect/re-consent; do not create a second Google-account system.

Real Gmail send/provider behavior still requires live authorized QA proof and is not established by unit/CI tests alone.

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

QA certification remains separate and parallel. Prior hosted QA evidence belongs only to the exact application-bearing SHA it certified and does not certify the newer Wave 1A-4C application changes.

The normal release sequence for current application/migration-bearing work remains:

`exact intended app SHA -> intended QA deployment live -> inspect/promote canonical QA migration history when required -> verify parity -> hosted authenticated QA / provider / runtime checks`

Remaining readiness work continues under `docs/CHATGPT_MIGRATION_OPERATOR_POLICY.md` and `docs/HYDROQUALISENSE_DEPLOYMENT_RUNBOOK.md`, including current-main hosted evidence, approved QA AI/provider validation, and required recovery/Storage evidence.

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
