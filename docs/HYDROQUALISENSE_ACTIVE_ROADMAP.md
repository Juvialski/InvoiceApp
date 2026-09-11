# HydroQualiSense Active Roadmap

Status: **ACTIVE — WAVE 4D EMAIL/SMS WORKSPACE + DOCUMENTS WORKSPACE / QA CERTIFICATION NOT READY**  
Repository: `Juvialski/InvoiceApp`  
Last updated: **2026-09-11**

Product direction: `docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md`  
Current handoff: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`  
Wave 4D contract: `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md`  
Workflow UX audit: `docs/HYDROQUALISENSE_WORKFLOW_UX_AUDIT_20260909.md`  
Current UI/UX audit evidence: `artifacts/ui-ux-audit/REPORT.md`
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
Wave 4D Email/SMS + Documents workspace implementation is integrated through PR #138, but Wave 4D remains incomplete until approved provider-backed SMS is configured and runtime-tested in QA.
PR #140 merged the full live-QA harness plus regression-covered hardening for the project-create identity, RFQ quotation payload, mixed-unit PO receipt continuation, payroll-run persistence, and hosted Documents assertion findings observed during the 2026-09-11 QA simulation.
PR #144 merged the focused UI/UX remediation and connected Gmail QA audit, including responsive operational registers, receipt-entry fixes, Gmail incremental-queue retention, document-preview mobile hardening, and programmatic PDF separator safety. It did not resolve the broader preview-versus-downloaded-PDF fidelity gap, which remains the next targeted UI/document-quality work.

Current merged application and QA-hardening baseline:

`46e0af036b7a66e6a6f86e0a4557bea576b605bf` (PR #144)

Wave 4A-4C are **supporting foundations**, not completion of the broader Email/SMS + Documents product experience.

## Explicit user reprioritization — Wave 4D is active and blocking

The intended product architecture is now explicit:

1. the existing top-level **Email Intake** experience evolves into the top-level **Email / SMS** communications workspace while preserving inbound Gmail intake;
2. a separate top-level **Documents** workspace provides unified, permission-aware access to document-bearing records and immutable/generated artifacts without duplicating canonical ownership;
3. the existing Wave 4A template, Wave 4B PDF, and Wave 4C Gmail delivery/history foundations are integrated into those workspaces;
4. real SMS remains incomplete until an approved provider account is configured and provider-backed sending is runtime-tested in QA;
5. Worker Registration is paused until this phase is genuinely complete and the user explicitly resumes it.

The authoritative detailed scope and completion gate are in `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md`.

## Wave 4D implementation progress — not complete

The current implementation provides the product surfaces needed to continue
this phase:

- the top-level Email / SMS workspace preserves Inbox / Intake and adds Compose,
  Sent / Delivery History, and SMS / Provider Status sections;
- outbound Gmail uses the existing company-scoped delivery intent, idempotency,
  immutable document provenance, and reconciliation safeguards, including
  audited ordinary messages without an attachment;
- the top-level Documents workspace is a permission-filtered index over existing
  Procurement, Client Billing, supplier evidence, Expenses, Cash & Banking, and
  Engineering records and routes actions back to their canonical owners;
- company document templates remain administered through the existing Settings
  workflow and are discoverable from Documents.

SMS provider activation remains blocked externally: no approved provider is
configured, so SMS is not active and real provider-backed delivery/status QA has
not been performed. Wave 4D remains **INCOMPLETE** until that boundary and the
remaining completion criteria are satisfied. Worker Registration remains
**PAUSED**.

## Immediate product sequence

1. **Wave 4D — Email/SMS Workspace + Documents Workspace — ACTIVE / BLOCKING**
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

## Full live QA company simulation — 2026-09-11

The original live QA company simulation was run against exact deployed QA
application SHA `36c0736a6f3d8703b1c6d0ab47519123a79a1acb`, deployment
`qa-hydroqualisense`, and canonical QA migration level `20260910131014`.
Synthetic run `QA-E2E-7F4K` remains in the isolated QA company for audit and
downstream verification. Production was read-only throughout.

That run proved working project, RFQ, vendor, PO, issue/approval, receipt,
Warehouse movement, equipment assignment/lifecycle, engineering revision,
client billing/collection/cash-linkage, manual Expense, and synthetic worker
setup flows. It also proved the Documents projection, Reports, Dashboard,
review-before-send compose state, truthful Gmail reconnect state, and truthful
SMS `Not configured` state. The same run exposed four application defects:
new-project persistence submitted an empty UUID, supplier quotation camelCase
line values persisted as zero, mixed-unit PO receipt continuation was hidden,
and payroll calculation could fall through to an invalid insert while saving an
existing lifecycle row.

PR #140 merged regression-covered fixes for all four defects plus the hosted
Documents semantic-text assertion. Protected QA Release run `34551019443`
then deployed exact SHA `ec51c29f2b1bdf6927f41746f38a4c967aeb5bff`, promoted
canonical QA migration `20260910233915`, independently re-verified migration
parity and production separation, and completed authenticated Hosted QA
successfully. The retained exact-head Hosted QA evidence reports deployment
readiness/authentication/reload/fresh-navigation PASS, `9/9` hosted routes,
Storage PASS, and `0` contract failures.

QA remains **NOT READY**. The provider/runtime blockers from the full company
simulation remain truthful: Gmail authorization was expired during that run; no
SMS provider is configured; the optional high-fidelity PDF converter is not
available on the current native Node/Render deployment; and the template/AI
provider path did not produce an acceptable live blueprint. In addition, the
exact-head Hosted QA run validates release/auth/route/Storage contracts but is
not a substitute for rerunning the four repaired business workflows through the
full live company simulation. Those repaired flows therefore still need direct
live UI retest on the current QA deployment before their live findings can be
closed.

The authoritative original simulation evidence is retained in local
`artifacts/live-qa` output and the durable `QA-E2E-7F4K` QA records. The current
exact-head Hosted QA artifact belongs only to SHA
`ec51c29f2b1bdf6927f41746f38a4c967aeb5bff` and must not be generalized beyond
the contracts it actually exercised. Wave 4D remains incomplete and Worker
Registration remains paused.

## Follow-up UI/UX and Gmail provider retest — 2026-09-11

The connected QA deployment was retested after Gmail was manually reconnected.
`GET /api/health` reported app SHA `2b48ea14b462c42577fc7ce9fd63ae2c6f34654b`,
deployment `qa-hydroqualisense`, migration `20260910233915`, and the expected
native-Node PDF finalization limitation. Gmail remained healthy after route
navigation and reload. A real 30-day finance scan succeeded and incremental
`Sync new` returned no new messages without provider authorization failure.

Only controlled synthetic outbound tests were retained: an ordinary email to
the connected QA account and one issued Client Invoice attachment send were
accepted through Gmail and appeared as `SENT` in company delivery history. The
attachment record returned to the authoritative Client Billing route. Actual
mailbox arrival was not separately inspected, and inbound import/routing was
not exercised because the scan returned non-controlled mailbox candidates that
were deliberately not imported or preserved.

The follow-up UI audit is recorded in `artifacts/ui-ux-audit/REPORT.md` and
`findings.json`. It covers the authenticated major workspaces and the bounded
local demo visual run: 76 scenarios across 34 routes and four viewport
profiles, with zero console/page errors, failed requests, overflow failures,
or failed scenarios. The merged PR #144 fixes preserve the existing source,
document, financial, permission, and delivery-history authorities.

QA remains **NOT READY**. SMS is not configured, native high-fidelity PDF
conversion is unavailable, inbound provider routing and separate mailbox
arrival proof remain unexercised, and recovery/AI/provider readiness evidence
is still outstanding. Worker Registration remains paused.

QA certification, provider validation, recovery evidence, deployment identity, migration parity, and production separation remain a parallel release/readiness track.

A newer application/runtime/migration-bearing main requires the normal sequence before becoming the certified QA baseline:

`exact intended app SHA -> verify QA deployment identity -> verify/promote canonical QA migrations when required -> hosted authenticated QA/provider/runtime checks`

Paid-only provider controls unavailable on the current Supabase Free plan are not blockers by themselves when an approved alternative validation path exists. Do not claim unavailable controls are enabled.

Remaining readiness work includes the exact-head full live regression of the repaired business flows, approved QA AI/provider validation, SMS provider-backed validation if/when configured, and remaining recovery evidence required by the deployment runbook and migration-operator policy.

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
