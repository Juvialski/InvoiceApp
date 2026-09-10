# HydroQualiSense Active Roadmap

Status: **ACTIVE — WAVE 4D EMAIL/SMS WORKSPACE + DOCUMENTS WORKSPACE / QA CERTIFICATION NOT READY**  
Repository: `Juvialski/InvoiceApp`  
Last updated: **2026-09-10**

Product direction: `docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md`  
Current handoff: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`  
Wave 4D contract: `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md`  
Workflow UX audit: `docs/HYDROQUALISENSE_WORKFLOW_UX_AUDIT_20260909.md`  
Client deployment strategy: `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`

Live repository state and `AGENTS.md` override remembered chat summaries and historical Engoryx plans.

## Current exact product baseline

Wave 1A Supplier Payable Lifecycle UX is complete through PR #126.  
Wave 1B Client Receivable Lifecycle UX is complete through PR #129.  
Wave 2 Cross-module Routing and Handoffs is complete through PR #131.  
Wave 3 Payroll/Subcontract/PO Workflow Decisions is complete through PRs #132 and #133.  
Wave 4A Company Document Templates / Mail Merge Foundation is complete through PR #134.  
Wave 4B High-Fidelity PDF Finalization Foundation is complete through PR #135.  
Wave 4C Outbound Issued-Document Gmail Delivery & Delivery History is complete through PR #136.

Current merged application baseline before the Wave 4D documentation correction:

`3fd73039afd018b1bb630bfee2a68a38c6d37fcc`

Wave 4A-4C are **supporting foundations**, not completion of the broader Email/SMS + Documents product experience.

## Explicit user reprioritization — Wave 4D is next

The intended product architecture is now explicit:

1. the existing top-level **Email Intake** experience evolves into the top-level **Email / SMS** communications workspace while preserving inbound Gmail intake;
2. a separate top-level **Documents** workspace provides unified, permission-aware access to document-bearing records and immutable/generated artifacts without duplicating canonical ownership;
3. the existing Wave 4A template, Wave 4B PDF, and Wave 4C Gmail delivery/history foundations are integrated into those workspaces;
4. real SMS remains incomplete until an approved provider account is configured and provider-backed sending is runtime-tested in QA;
5. Worker Registration is paused until this phase is genuinely complete and the user explicitly resumes it.

The authoritative detailed scope and completion gate are in `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md`.

## Immediate product sequence

1. **Wave 4D — Email/SMS Workspace + Documents Workspace — NEXT / BLOCKING**
2. **Worker Registration — PAUSED** until Wave 4D completion criteria are satisfied and the user explicitly resumes it
3. Site Attendance state machine + registered site/device
4. Face-Recognition Attendance only after explicit privacy/security/retention/liveness/confidence/fallback design
5. final pre-production security/data-integrity certification before broad rollout

Do not prepare Worker Registration as the next implementation phase while Wave 4D remains incomplete.

## Wave 4D required product outcome

### Email / SMS

The top-level communications workspace must contain or coherently route:

- the existing read-only Gmail Inbox/Intake workflow;
- Gmail reconnect/re-consent behavior;
- outbound email compose and send;
- Assistant-assisted drafting with human review and confirmation;
- document/attachment selection from authorized context;
- unified sent/delivery history, retry, and reconciliation behavior;
- SMS composition/provider status;
- actual SMS delivery only after a real provider is selected/configured and QA-tested.

The Assistant may prepare messages, but it must not silently send consequential communications. Send authority must remain permission-based and no broader than the current user.

### Documents

The new top-level Documents workspace is a unified access/index surface over existing canonical domains. It does not become a second financial, procurement, engineering, payroll, or evidence truth.

At minimum it should provide:

- permission-aware unified document listing/search/filtering;
- preview/open/download for supported records/artifacts;
- links back to the authoritative owning workflow;
- issued/generated/source document classifications where useful;
- project/counterparty/type/status/date filters where supported by existing data;
- delivery status/history where applicable;
- continuation from a selected eligible document into Email / SMS compose;
- company document-template administration discoverable from Documents using the existing Wave 4A engine.

Examples of ownership that must remain intact:

- Purchase Order -> Procurement;
- Client Invoice -> Client Billing/Collections;
- Supplier Invoice source -> Supplier Invoice review / linked authoritative Expense semantics;
- Expense receipt/source -> Expense;
- bank statement -> Cash & Banking;
- Engineering Document/revision -> Engineering;
- generated DOCX/PDF -> immutable source/snapshot/template/version evidence.

## Existing Wave 4A-4C foundations to preserve

### Wave 4A

- company-bound DOCX templates for supported issued documents;
- deterministic immutable-snapshot mail merge;
- template validation/versioning/pinning;
- bounded AI-assisted mapping proposals with human review.

### Wave 4B

- high-fidelity server-side PDF finalization when the supported converter is operational;
- truthful programmatic PDF fallback where conversion is unavailable;
- exact generation/template/source provenance.

The current native Node/Render deployment does not install the optional LibreOffice converter, so it must continue to report that limitation truthfully unless the supported Docker runtime is deliberately enabled.

### Wave 4C

- Gmail sending for eligible issued Purchase Orders and Client Invoices;
- exact attachment identity/provenance;
- durable send intents and append-only delivery history;
- idempotency and explicit resend;
- reconciliation-required fail-closed behavior;
- document-read/send permission and lifecycle protections.

Wave 4C did not implement a unified communications center or provider-backed SMS.

## SMS provider boundary

No SMS provider is currently approved/configured as product truth.

Do not hard-code a vendor simply because an adapter can be written. Until the user chooses and configures an approved provider, SMS must remain visibly not configured/not active.

Provider-backed completion later requires at least:

- server-side credential storage/configuration;
- sender/originator rules for the selected provider/destination;
- bounded sending API;
- normalized status/failure handling;
- idempotency/retry/reconciliation semantics;
- delivery-status/webhook processing where supported;
- live QA proof with synthetic/test recipients and no production customer data.

## Permanent financial / history boundaries

Wave 4D is an information-architecture and communications/document-access phase. It must not change authoritative business truth.

Preserve:

- linked Expense as authoritative supplier payable/cost after invoice verification;
- Client Invoice/Collection receivable truth separate from Cash settlement evidence;
- Actual Cost distinct from Committed Cost;
- payroll settlement authority/history;
- Purchase Order receipt/close rules;
- original currency and explicit FX semantics;
- immutable issued/finalized document snapshots and artifact provenance;
- append-only delivery history and deliberate retry/reconciliation;
- RLS/RBAC/company isolation and permission parity;
- AI prepare/review/human-confirm/execute boundaries.

## Parallel QA / release-readiness track

`QA CERTIFICATION: NOT READY`

QA certification, provider validation, recovery evidence, deployment identity, migration parity, and production separation remain a parallel release/readiness track.

The last retained hosted certification artifact predates the newer Wave 1A-4C application-bearing changes and must not be used as proof for the current application baseline.

A newer application/runtime/migration-bearing main requires the normal sequence before becoming the certified QA baseline:

`exact intended app SHA -> verify QA deployment identity -> verify/promote canonical QA migrations when required -> hosted authenticated QA/provider/runtime checks`

Paid-only provider controls unavailable on the current Supabase Free plan are not blockers by themselves when an approved alternative validation path exists. Do not claim unavailable controls are enabled.

Remaining readiness work continues to include current-main hosted certification, approved QA AI/provider validation, and remaining recovery/Storage evidence as required by the deployment runbook and migration-operator policy.

## Production boundary

Production remains read-only unless explicitly authorized under `docs/CHATGPT_MIGRATION_OPERATOR_POLICY.md`.

A merge, green PR CI, Render deployment, QA success, or documentation update does not authorize production database/Auth/Storage/secret writes or migration promotion.

## Settings Features & Roadmap synchronization

`src/config/productFeatures.ts` must remain client-facing product truth.

During Wave 4D:

- do not mark SMS Available before real provider-backed QA evidence exists;
- update Email/SMS and Documents descriptions/status only when the user-facing workflows are genuinely usable;
- never expose internal waves, PRs, CI, SHAs, migration names, agent terminology, or provider secrets in Settings.

## Definition of Wave 4D completion

The broader Email/SMS + Documents phase is complete only when the completion criteria in `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md` are satisfied, including the separate Email/SMS and Documents product surfaces and real provider-backed SMS unless the user explicitly changes that requirement.

Until then:

**Worker Registration remains paused and is not the next product phase.**
