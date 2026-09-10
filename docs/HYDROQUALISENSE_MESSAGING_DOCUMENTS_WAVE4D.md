# HydroQualiSense Wave 4D — Email/SMS Workspace + Documents Workspace

Status: **ACTIVE — WORKSPACE IMPLEMENTATION IN PROGRESS / SMS NOT CONFIGURED / BLOCKING BEFORE WORKER REGISTRATION**
Date: **2026-09-10**  
Repository: `Juvialski/InvoiceApp`  
Starting product baseline: merged `main` at `3fd73039afd018b1bb630bfee2a68a38c6d37fcc` (PR #136)

## User intent — authoritative clarification

The user has explicitly clarified the intended product information architecture:

1. The current top-level **Email Intake** area must evolve into a top-level **Email / SMS** communications workspace.
2. A separate top-level **Documents** workspace must handle unified access to company documents and document-bearing records/artifacts.
3. Worker Registration is paused and must not be suggested, prepared, or started until this broader Email/SMS + Documents experience is complete and the user explicitly resumes it.

This is not a cosmetic rename. The new workspaces must integrate the foundations already built in Waves 4A-4C into coherent user-facing product areas.

## What Waves 4A-4C actually completed

These waves are valuable foundations, but they do not complete the broader Email/SMS + Documents phase by themselves.

### Wave 4A — complete

- company-bound DOCX templates for supported issued financial documents;
- deterministic mail merge from authoritative immutable snapshots;
- template versioning, validation, pinning, and generation evidence;
- AI-assisted template/mapping proposals that remain bounded and reviewable.

### Wave 4B — complete

- server-side high-fidelity PDF finalization when the deployment has an operational supported converter;
- deterministic fallback to the existing programmatic issued PDF when high-fidelity conversion is unavailable;
- exact DOCX/PDF/template provenance and evidence.

### Wave 4C — complete through PR #136

- issued Purchase Order and Client Invoice sending through connected Gmail;
- exact attachment identity/provenance;
- durable send intents and append-only delivery history;
- idempotency, explicit resend, reconciliation-required failure handling;
- lifecycle and permission protections.

Wave 4C did **not** implement a unified communications workspace or a real SMS provider.

## Target top-level navigation

The intended authenticated product navigation must expose distinct primary areas:

- **Email / SMS**
- **Documents**

The old standalone `Email Intake` navigation item should not remain the primary product concept after Wave 4D. Existing inbound Gmail intake behavior must be preserved inside the Email / SMS workspace rather than deleted.

## Email / SMS workspace

The Email / SMS workspace is the company's communications center. It should unify inbound email intake and outbound communication without weakening canonical workflow ownership.

### Required sections / capabilities

At minimum, design and implement a coherent responsive workspace containing:

1. **Inbox / Intake**
   - preserve the current read-only Gmail-assisted search/sync/import workflow;
   - preserve routing of selected source evidence into Supplier Invoice, Expense, and Cash/Bank statement review workflows;
   - preserve original message/attachment evidence and current bounded processing controls;
   - reconnect Gmail from this workspace when authorization is missing/expired.

2. **Compose / New Message**
   - support outbound email composition using the connected Gmail account;
   - support recipient, CC where applicable, subject, body, and supported attachments;
   - allow attaching an eligible document from the new Documents workspace or from an owning record;
   - use the existing Wave 4C delivery/idempotency/history contracts instead of creating an unrelated email-sending system;
   - ordinary non-document email may be supported only through an equally auditable, permission-aware delivery contract rather than bypassing delivery history.

3. **Assistant-assisted drafting**
   - the Assistant may draft or prepare email/SMS content and suggest eligible attachments/recipients based on authorized context;
   - consequential send actions must remain `prepare -> review -> human confirm -> execute`;
   - the Assistant must not silently send email or SMS;
   - the Assistant must not gain broader read/send authority than the current user.

4. **Sent / Delivery History**
   - provide a unified, company-scoped view of supported outbound attempts;
   - surface channel, recipient, subject/summary, linked document when present, sender label, timestamp, status, and safe retry/reconciliation state;
   - preserve the immutable Wave 4C history and idempotency model;
   - do not expose provider credentials, raw tokens, unsafe provider errors, or cross-company records.

5. **SMS**
   - provide the product surface and provider abstraction needed for SMS;
   - SMS must remain visibly `Not configured` / unavailable when no approved provider is configured;
   - do not fake successful sending, delivery receipts, pricing, sender identity, or provider health;
   - once the user selects and configures an approved SMS provider, use server-side credentials only;
   - real provider-backed SMS delivery and delivery-status behavior must be runtime-tested in QA before SMS is marked Available.

### Gmail scope requirement

Outbound Gmail requires the connected Google identity to authorize at least the existing read scope needed by intake and the `gmail.send` scope needed by document/message delivery. Existing OAuth re-consent/reconnect behavior should be reused rather than creating a second Google identity system.

## Documents workspace

The Documents workspace is a unified document-management/index experience over existing authoritative domains. It must **not** create duplicate financial, procurement, engineering, payroll, or source-document truth.

### Core rule

> Documents is a unified access/index surface; the owning domain remains authoritative.

Examples:

- a Purchase Order remains owned by Procurement;
- a Client Invoice remains owned by Client Billing/Collections;
- a Supplier Invoice source remains owned by Supplier Invoice review and its authoritative linked Expense semantics;
- an Expense receipt/source remains owned by Expense/source evidence;
- a bank statement remains owned by Cash & Banking intake/reconciliation;
- an Engineering Document/revision remains owned by Engineering;
- generated document artifacts remain tied to the immutable source/snapshot/template/version that produced them.

### Required capabilities

1. top-level **Documents** navigation item;
2. unified permission-aware document register/index across existing supported document-bearing domains;
3. search and useful filters such as document type/domain, project, counterparty, date, status, source/issued/generated classification, and delivery state where relevant;
4. preview/open/download actions that reuse existing canonical record/artifact contracts;
5. direct navigation to the authoritative owning record/workflow;
6. eligible send/share continuation into the Email / SMS workspace while retaining the exact selected document context;
7. document delivery/history visibility where applicable;
8. company document-template administration discoverable from Documents rather than being buried only in Settings; reuse the existing Wave 4A template engine rather than duplicating it;
9. responsive desktop/tablet/mobile behavior with no forced horizontal overflow for the primary document register/cards and message-compose flows.

### Data architecture

Prefer an aggregation/view/service layer over existing records and immutable artifacts. Do not introduce a second persisted `documents` truth merely to populate the new page unless a concrete gap proves a dedicated registry is required. If a new registry/index is required, it must reference canonical source identities, remain company-bound, and never replace owning-domain lifecycle/history.

## Cross-workspace journeys

The implementation should support clear end-to-end journeys such as:

`Documents -> select issued PO -> Send -> Email / SMS compose with exact PO already attached -> review -> confirm -> delivery history`

`Procurement -> issued PO -> Send -> same Email / SMS compose contract -> delivery history`

`Email / SMS -> Inbox -> import supplier invoice -> authoritative Supplier Invoice/Expense workflow`

`Email / SMS -> Compose -> select eligible document from Documents -> review -> confirm -> send`

`Email / SMS -> Sent -> open linked document -> authoritative owning workflow`

Do not create competing send/history paths for the same channel/document combination.

## SMS provider boundary

No SMS provider is approved/configured at the start of this wave. Do not hard-code Brevo, Twilio, Vonage, Semaphore, or another provider as product truth without an explicit user/provider decision.

A provider integration should use a narrow server-side adapter/interface so provider credentials and provider-specific behavior do not leak through the rest of the application. Until credentials exist, implementation may complete the UI/provider contract and truthful `Not configured` state, but the broader Email/SMS + Documents phase remains **incomplete** for roadmap purposes.

When the user supplies a provider account later, the same wave must be finished with:

- server-side credential configuration;
- sender/originator rules applicable to the selected provider/country;
- bounded send endpoint;
- provider response normalization;
- idempotency/retry/reconciliation rules;
- delivery status/webhook handling when supported;
- safe failure wording;
- QA runtime proof using synthetic/test recipients and no production customer data.

## Permissions and security

Preserve permission-based authorization rather than role-name checks.

At minimum:

- inbound Gmail access follows the current authorized mailbox/user boundary;
- outbound email/SMS requires dedicated send authority consistent with existing `documents.send` semantics or an explicitly designed messaging permission that does not broaden authority accidentally;
- Documents visibility is the union of records/artifacts the user is already authorized to read, never a bypass around domain permissions;
- cross-company leakage is forbidden;
- credentials/tokens remain server-side or in the existing OAuth provider-token path as designed;
- no AI prompt or assistant tool may reveal inaccessible contacts/documents/history;
- immutable issued/finalized document history remains intact.

## Financial and history invariants

Wave 4D is a communication/document-access phase, not an accounting rewrite.

Do not change:

- Supplier Invoice -> authoritative linked Expense payable/cost ownership;
- Client Invoice/Collection receivable truth;
- Cash & Banking settlement/reconciliation semantics;
- Actual Cost versus Committed Cost;
- payroll settlement authority;
- Purchase Order close/receipt semantics;
- original currency/FX rules;
- immutable issued-document snapshots;
- document generation/delivery evidence;
- finalized/verified/paid/collected/voided/reversed history.

## Client-facing roadmap truth

During implementation, review `src/config/productFeatures.ts`.

- Keep SMS marked Planned/Not Active until real provider-backed QA evidence exists.
- Update the client-facing description when the Email/SMS and Documents workspaces become genuinely usable.
- Do not expose internal wave names, PRs, CI, SHAs, migrations, agent terminology, or provider secrets in Settings.

## Wave 4D completion criteria

Wave 4D / the broader Email/SMS + Documents phase is complete only when all of the following are true:

1. top-level Email Intake has been replaced/evolved into a functional **Email / SMS** workspace while inbound intake remains intact;
2. top-level **Documents** workspace exists and provides coherent permission-aware access to existing document-bearing records/artifacts without duplicating canonical ownership;
3. outbound email compose/send/history works coherently from the new communications flow and integrates existing Wave 4C safeguards;
4. Documents can hand an exact eligible document into the communications flow and return/open owning context cleanly;
5. Assistant message drafting/selection preserves human confirmation and permission parity;
6. company document templates are discoverable through Documents using the existing Wave 4A engine;
7. real SMS provider-backed sending is configured and QA runtime-tested, or the user explicitly changes the completion definition;
8. delivery history/retry/reconciliation remains safe for all enabled outbound channels;
9. Settings Features & Roadmap reflects actual usable state;
10. focused tests, affected tests, relevant lint/build/browser/Workflow Map validation, and exact-head CI pass;
11. if DB contracts are changed, clean local Supabase replay, pgTAP, migration static/upgrade tests, and relevant runtime/RLS/RPC/idempotency checks pass;
12. final diff confirms no duplicate document, financial, contact, or delivery authority was introduced.

## Worker Registration gate

**Worker Registration is paused.**

Do not prepare it as the next phase simply because Wave 4A, 4B, or 4C is merged. It may resume only after the Wave 4D completion criteria above are satisfied and the user explicitly resumes Worker Registration.

QA/release-readiness work may continue in parallel, but it does not substitute for this product completion gate.

## Implementation workflow

Follow live `AGENTS.md`, `docs/AGENTS_BASELINE_20260909.md`, and `docs/AGENT_EXECUTION_EFFICIENCY.md`.

- start from current latest green `main` and record exact SHA;
- generate one bounded `agent:context` packet;
- inspect existing Email Intake, routing/navigation, document generation, delivery history, Assistant, Settings templates, Engineering documents, and permission contracts before designing;
- Codex lead owns shared routing, permission decisions, integration, history semantics, final diff review, and validation;
- use zero subagents by default and no more than two concurrent Codex subagents under the current ChatGPT operating rules; use them only for genuinely independent bounded work;
- run new/edited and focused tests first, then `npm.cmd run test:affected:agent`;
- run lint/build/browser/Workflow Map checks when relevant;
- use local Supabase runtime validation only if DB/RLS/RPC/migration contracts change;
- do not run the historical full suite ritualistically;
- push a focused feature branch and open a PR;
- the implementation Codex agent must not merge its own PR.

## Stop boundary

Do not expand this wave into Worker Registration, Site Attendance, Face Recognition, broad CRM/contact-master redesign, marketing campaigns, bulk unsolicited messaging, new accounting semantics, or unrelated UI cleanup.

If a real SMS provider cannot be completed because the user has not yet created/configured an account, finish the provider-neutral workspace/integration contract, clearly report the external blocker, leave SMS truthfully not active, and **do not mark Wave 4D or Email/SMS + Documents complete**.
