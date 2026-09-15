# HydroQualiSense Current Handoff

Status: **CURRENT — CLIENT SECURITY IMPLEMENTATION EVIDENCE COMPLETE WITH QUALIFIED LOCAL DB/RUNTIME AND PDF PASS / HOSTED DEPLOYMENT CERTIFICATION PENDING / EMAIL-SMS RELIABILITY FOLLOWS / PUBLIC OAUTH BRANDING REMEDIATION IMPLEMENTED / GOOGLE RE-VERIFICATION PENDING / SMS NOT CONFIGURED UNTIL QA RUNTIME PROOF / WIDE DOCUMENTS REMAINING SLICES DEFERRED / WORKER REGISTRATION PAUSED**
Date: **2026-09-15**
Repository: `Juvialski/InvoiceApp`

## Authoritative current baseline

UI/UX Round 2 was implemented from `main` at:

`746a4aacda9ccceff88a5093bfeb678b8b1046a8`

The final application-bearing implementation head before documentation-only finalization was:

`486d8cd594eade2ad6399ed3160b6f0a227a17b8`

That exact application head passed the protected application/build, browser/demo, and workflow-map checks applicable to this phase. The protected database workflow correctly fast-passed after classifying the diff as database-unaffected. Documentation-only finalization commits may advance the PR head without changing the reviewed application code.

The last application-bearing SHA currently covered by the earlier successful hosted application certification remains:

`e4ee4ebde489629ee74429b4e37abb511943a51e`

That hosted evidence belongs to the earlier certified application state and must not be generalized blindly to the newer UI/UX Round 2 application code.

Read this handoff with:

- `AGENTS.md`;
- `docs/AGENTS_BASELINE_20260909.md`;
- `docs/AGENT_EXECUTION_EFFICIENCY.md`;
- `docs/HYDROQUALISENSE_UI_UX_ROUND2_SIMPLIFICATION.md` — completed UI/UX Round 2 design/acceptance record and standing UI baseline;
- `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`;
- **`docs/HYDROQUALISENSE_UNIFIED_DOCUMENT_CENTER.md` — deferred Wide Documents Phase contract**;
- **`docs/superpowers/specs/2026-09-14-unified-document-center-design.md` — Slice 1 design**;
- `docs/superpowers/specs/2026-09-13-document-template-ai-autotagging-design.md` — completed corrective foundation;
- `docs/HYDROQUALISENSE_DOCUMENT_TEMPLATES_WAVE4A.md` — existing immutable template/mail-merge contract;
- `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md` — authoritative contract for the next product phase after this correction;
- `docs/HYDROQUALISENSE_LOCAL_QA_UI_PDF_PLAN.md` for the earlier quality-program foundation;
- `docs/CHATGPT_MIGRATION_OPERATOR_POLICY.md` and deployment runbook when release/migration operations matter.

Live repository state and `AGENTS.md` override remembered chat summaries.

---

## UI/UX Round 2 — completed 2026-09-13

The user approved a second broad usability phase and allowed navigation/tab restructuring when that improved and simplified the product without weakening important features, permissions, financial truth, audit history, source ownership, or workflow correctness.

PR #161 completed that phase.

### Final implementation state

The implementation delivers grouped authenticated shell navigation, shared task-first controls/disclosures, mandatory Documents/Expenses/Project Allocation/Payroll improvements, and targeted hierarchy changes for Dashboard, Supplier Invoices, Projects, Warehouse, Equipment, and Settings. The changes preserve the existing route vocabulary, deep-link query contracts, permission checks, source ownership, financial boundaries, immutable history, and Assistant confirmation model. No database migration or schema contract changed.

The mandatory regression areas were explicitly rechecked:

- **Project Allocation** uses readable responsive allocation views so large values, units, remaining amounts, and selection/action semantics are no longer forced into one narrow row.
- **Documents** is search/list-first and keeps common open/preview/handoff work ahead of secondary registry/provenance framing.
- **Expenses** keeps the Expense register primary while Supplier Invoice/source documents remain supporting context and the linked Expense retains payable/cost authority.
- **Payroll** is grouped around Overview, People, Attendance & Time, Payroll Runs, and Imports & Setup instead of the former flat equal-priority tab strip.

The final authenticated Local-QA route matrix recorded **59/59 PASS** with zero page-overflow, dialog-overflow, or interactive-overflow failures. The recorded authenticated visual-certification pass produced **80 route/state captures across desktop, constrained laptop, tablet, and phone, plus corrected Projects captures at desktop/tablet/phone**. Exact-head GitHub browser QA independently captured 78 demo screenshots/scenarios across 34 routes and four viewport classes with zero failed scenarios, navigation failures, console errors, page errors, failed requests, or overflow failures.

The focused template/UI/harness suite passed 38/38. At the final application-bearing implementation head, `test:affected:agent` selected 871 tests with 870 pass, 0 fail, and 1 skipped; lint and production build passed. Workflow Map/source consistency passed. No database migration/RLS/RPC/trigger change or production write occurred.

### Document Templates capability truth

The critical Document Templates investigation traced Starter, Upload, and AI persistence through the shared server Storage path. After the private `SUPABASE_STORAGE_SERVER_KEY` was configured locally, the restarted authenticated Local-QA capability endpoint returned `templateStorage.status=AVAILABLE`.

Purchase Order and Client Invoice Starter plus safe Upload each:

- persisted immutable template metadata/version records;
- survived Settings refresh;
- returned retrievable DOCX bytes.

The Starter generator now emits the declared `company.vatTin` tag so activation validation is `VALID`.

Real authenticated Local-QA AI-template evidence is now obtained separately from Storage. `/api/deployment/company-ai` returned HTTP 200 with `runtimeCapability.status=AVAILABLE` while persisted `lastTestStatus` remained `NOT_TESTED`; no credential material was returned. The HSC Purchase Order Analyze request returned `aiStatus=AVAILABLE` with model `gemini-3.5-flash-lite`. The reviewed UI Prepare action created a VALID immutable `DUPLICATED` descendant from the uploaded HSC version, preserved the original SHA, and Test DOCX rendered both synthetic lines. The separate Generate with AI Settings workflow passed for Purchase Order and Client Invoice, persisted VALID AI drafts, survived refresh, downloaded AI DOCX artifacts, and their Test DOCX outputs rendered both synthetic lines.

High-fidelity company-template PDF conversion remains independently `UNAVAILABLE`. The existing programmatic PDF fallback remains a separate capability.

The broad Local-QA route matrix still needs separate harness cleanup/reconciliation because its long sweep recorded unrelated route/session failures; the isolated authenticated AI/template workflow passed. This is pre-merge QA evidence, not hosted exact-SHA release certification.

No secret was returned to the browser. No uncontrolled email/SMS send and no production mutation occurred.

### Standing UI baseline

Later product phases must preserve the completed workflow-first rules:

- task first, system architecture second;
- keep important functionality while reducing cognitive load;
- one obvious primary action per context;
- actual working content/register before long explanations or oversized summary regions;
- progressive disclosure for provenance, audit metadata, raw IDs, and advanced/rare actions;
- business-facing wording instead of engineering/source-of-truth jargon in ordinary UI;
- compact useful summaries and filters;
- consistent page/action/filter/table/form/navigation grammar;
- routes/deep links remain compatible wherever practical;
- responsive layouts may reorganize workflows rather than merely shrinking desktop layouts;
- simplification must never weaken permissions, financial truth, audit history, source ownership, company isolation, or Assistant confirmation boundaries.

---

## Immediate corrective phase — Document Template AI Auto-Tagging + AI Capability Correction

The user explicitly inserted this corrective phase before Wave 4D resumes. Its design is `docs/superpowers/specs/2026-09-13-document-template-ai-autotagging-design.md`.

The implementation corrects the stale deployment `lastTestStatus` gate by exposing a server-derived company AI runtime capability from the same resolver used by Analyze/Generate. It also adds deterministic server-owned anchors, allowlisted mapping validation, in-app `Prepare template`, repeating-row tagging, immutable descendant version creation, and safe provider-error wording. Original uploaded bytes remain unchanged; activation remains separate.

Focused local implementation evidence obtained so far:

- capability, DOCX anchor, mapping, transformer, immutable-version, UI-contract, AI-error, compatibility, storage-boundary, security-boundary, and company-AI tests pass;
- TypeScript lint passes;
- local DB-runtime checks remain skipped when their explicit runtime flag is absent;
- no hosted/provider AI certification, production mutation, or uncontrolled email/SMS send has occurred.

The corrective branch is merged into the current baseline. Its real authenticated non-production AI/template runtime evidence remains valid, while hosted exact-SHA certification, production authorization, and high-fidelity PDF conversion remain separate and incomplete.

The server-only company AI boundary remains unchanged: the configured Supabase server key may use the modern `sb_secret_` form or an approved legacy JWT `service_role`-compatible key, and neither belongs in browser state. Before configuration, QA metadata may truthfully report `NOT_CONFIGURED`; application deployment and database migration promotion remain separate operator actions, and production remains read-only unless explicitly authorized.

## Wide Documents Phase — Slice 1 implemented 2026-09-14

The user explicitly reprioritized the next product work to the Wide Documents Phase. Slice 1 makes Documents the central application entry point for document discovery and supported creation without creating a duplicate business-record owner.

The current implementation provides:

- `/documents` as the default Library view;
- durable `/documents?view=library|create|templates` navigation with invalid values defaulting to Library;
- permission-filtered Library projection over existing Purchase Order, Client Invoice, Supplier Invoice, Expense receipt, Bank statement, and Engineering Document sources;
- compact common search/type filters plus progressive project, counterparty, module, origin, and status filters;
- business-language Create links to existing owning workflows, with payroll and engineering options permission-filtered;
- explicit preparation-required states for Warranty Certificate, Equipment / Materials Checklist, and general company uploads rather than fake generators;
- full existing template administration discoverable at Documents -> Templates;
- a small Settings -> Documents template link instead of a competing full template-management surface.

No database, RLS, RPC, Storage, financial, payroll, or provider contract changed in Slice 1. The original owning record routes, Email/SMS handoffs, template capability gates, and existing source-history boundaries remain intact.

The completed Slice 2 implementation generalizes template types beyond hardcoded enums. A company administrator can define a safe business document type, declare bounded custom/repeating inputs and an allowed source context, upload the actual DOCX, review/prepare an immutable version, activate it, and discover it from Documents -> Create. The three supplied HSC DOCX files are exact client fixtures proving the generalized engine: Purchase Order uses the existing Procurement adapter; Checklist and Warranty are ordinary Project-context company-defined examples. The full Wide Documents Phase remains incomplete because retained managed-document/artifact slices are still deferred.

## Active user reprioritization — Client Security Assurance & Handoff

The user explicitly reprioritized the current implementation run on 2026-09-15 to
the evidence-first client security assurance and handoff phase. The authoritative
contract and plan are:

- `docs/HYDROQUALISENSE_CLIENT_SECURITY_ASSURANCE.md`
- `docs/superpowers/plans/2026-09-15-client-security-assurance.md`

This branch implements the flexible company-scoped RBAC layer: the four existing
roles remain protected starter templates, Company Administrators can create/edit/
duplicate/assign/reassign/archive custom roles through the Settings access
workflow, and permissions continue through the shared effective-permission
resolver rather than role-name checks. Protected company-access, company-settings,
and platform permissions are rejected by the database boundary, cross-company role
targeting is rejected, and role/member lifecycle events are auditable.

Validation status for this handoff is deliberately qualified. Focused TypeScript,
static contract, local clean replay, pgTAP, runtime RLS/RPC authorization,
upgrade-path, exact authenticated synthetic-QA role capture, and seven-page PDF
render inspection pass for the committed implementation. The local browser run
covers Company Admin, Finance, Payroll, Viewer, a restricted company-defined role,
representative forbidden deep links, and the Company Access/custom-role editor with
clean telemetry. The isolated hosted QA deployment still serves the earlier release
and was not promoted by this handoff; no production database was mutated and no
production records were inspected. The PDF is therefore a qualified implementation
handoff artifact, not deployment-specific security certification;
`artifacts/client-security/EVIDENCE.md` records each claim and remaining gap.

The handoff custody checklist is `docs/HYDROQUALISENSE_CLIENT_SECURITY_HANDOFF_CHECKLIST.md`.
The exact next release action is deployment-specific: run the committed migration
through the guarded QA release path when its protected operator prerequisites are
available, bind the hosted application to the same release and migration, and
re-verify the existing evidence. Production promotion remains unauthorized by this
implementation run.

## Active user reprioritization — Email/SMS Reliability & UX Completion

Email/SMS Reliability & UX Completion now follows the active security phase. The
remaining Wide Documents managed-upload/artifact work is deferred, not cancelled.

The implementation adds a compact task-first Inbox / Intake, Compose, Sent /
Delivery History, and SMS status experience; preserves inbound Gmail, source
evidence, document ownership, human confirmation, delivery history, idempotency,
and reconciliation; and keeps SMS limited to Company SIM Gateway and PhilSMS.

Gmail OAuth callback material is captured once, removed from the React session
object, and submitted only to an authenticated server path. The server encrypts
the company/user-scoped refresh token with a dedicated key, refreshes access
tokens server-side, accepts rotation, retries one expired access token, and
returns distinct safe states for scopes, provider permission, quota/transient
failures, setup, and revoked authorization. No raw provider credential is kept in
ordinary browser local storage or returned to the browser.

The public `/privacy` and `/terms` pages are session-free and linked from the
public, sign-in, and authenticated-shell surfaces. The canonical
`hydroqualisense.com` root is now host-aware and public without a manual build
setting; noncanonical operational roots remain authenticated by default and can
still opt into the public funnel with the existing non-secret setting. The user
confirmed Google Auth Platform is in TESTING and is moving it toward production;
this repository does not claim that Google publishing or verification is complete.

Current branch evidence includes focused Gmail/OAuth, public-policy, communications
UX, server authorization, migration replay, pgTAP, and upgrade-path validation.
No approved SMS credentials/device runtime or controlled provider-backed QA proof
is available in the current environment, so SMS remains not configured/unverified.

## 2026-09-15 Google OAuth branding verification remediation

The operator confirmed that Google Search Console reports `hydroqualisense.com` as a
verified owner through Domain name provider verification. This is external evidence;
the repository did not change DNS, Cloudflare, domain ownership, or Search Console
configuration.

The repository-side corrective slice makes the canonical homepage publicly reachable
without authentication, preserves public `/privacy` and `/terms`, keeps `/dashboard`
and normal operational routes behind the existing authentication and permission flow,
and leaves noncanonical deployment roots flag-gated. The public surfaces now use the
exact `Hydroqualisense` product name, explain the business-operations purpose and
optional Gmail read/send access, and publish the Google API Services User Data Policy /
Limited Use disclosure. Google re-verification remains external and pending; it is not
represented as approved here.

Durable Gmail runtime credential setup remains a separate operator task, and SMS
provider runtime completion remains separate until controlled approved-provider QA
evidence exists. Worker Registration remains paused.

Slice 2 pre-merge evidence is separated by scope: focused dynamic template/Create tests pass 68/68, lint/build and Workflow Map consistency pass, and demo browser QA passes 82/82 responsive scenarios. Authenticated Local-QA records 59/59 route/responsive scenarios with no overflow/errors, but the legacy functional template checks still look for the former Settings-mounted template surface and record 7/9 functional workflows. The new dynamic HSC flow is not represented as authenticated QA-certified because its migration was not promoted to that QA target. Local Docker is unavailable for replay/pgTAP/upgrade validation, and the bundled LibreOffice renderer is unavailable for DOCX visual conversion.

## Wave 4D messaging-provider integration/completion and readiness gate

Wave 4D remains **partially implemented but not complete**. The current approved
Email/SMS Reliability & UX slice is active; do not rebuild the existing
communications workspace or Slice 1 Documents shell.

Approved provider direction remains:

- **Company SIM Gateway — primary/recommended**;
- **PhilSMS — optional hosted Philippine fallback**.

The remaining provider/readiness implementation should:

- inspect the live Wave 4D contract, current provider-neutral SMS scaffolding, delivery-intent/history model, Gmail implementation, permissions, and completed task-first Email/SMS/Documents UI before changing code;
- implement or finish the approved server-side provider path without exposing provider credentials to the browser;
- preserve one reviewed transactional recipient per SMS send and human review/confirmation before consequential outbound sends;
- keep SMS truthfully unavailable/unverified until controlled provider-backed runtime QA succeeds;
- preserve inbound Gmail intake and existing issued-document Gmail delivery/history behavior;
- reconnect/certify Gmail as needed for exact-state provider evidence rather than assuming old authorization is current;
- preserve append-only/company-bound delivery history, idempotency/reconciliation boundaries, and source document ownership;
- keep AI/provider prerequisites separately truthful; the exercised QA runtime is now available while hosted/provider/release evidence remains separate from Storage and PDF converter truth;
- preserve the completed UI/UX Round 2 hierarchy while adding provider capability;
- close the remaining Wave 4D provider/AI/recovery/readiness evidence before any Worker Registration work.

Worker Registration remains paused and must not be suggested as the immediate next phase.

---

## Completed quality/application context that remains valid

### First comprehensive Local-QA UI/UX pass — complete

PR #150 previously established broad authenticated route/responsive coverage and fixed concrete UI issues. UI/UX Round 2 then raised the bar from structural correctness to workflow clarity and information hierarchy.

### Programmatic PDF visual certification — complete

Programmatic Purchase Order / Client Invoice fallback output received deliberate visual certification, including centering, logos, long values, multi-page behavior, totals, signatures, and preview/download byte identity for exercised records.

Company-template high-fidelity conversion remains a separate capability and must not be falsely represented as certified when converter support is unavailable.

### Functional Local-QA sweep — complete for supported/fixture-backed workflows

The integrated Local-QA sweep exercises key RFQ/PO/Warehouse, supplier payable, client receivable, payroll, Documents->Compose, stale-record, and Document Templates Starter/Upload persistence/retrieval flows. Subcontract settlement remains fixture-blocked where no safe fixture exists. The isolated authenticated AI/template workflow now passes separately; the broad harness still needs route/session cleanup before an overall PASS claim.

### Supplier Payables Settlement Truth & Consistency — complete

Merged PR #158 established and certified the corrected supplier settlement model:

- the verified linked Expense is the supplier payable/settlement authority even when intentionally `DRAFT`;
- generic direct DRAFT Expense settlement remains ineligible;
- payment state comes from confirmed Cash & Banking evidence, not OCR/document-reported `amountPaid`;
- legacy invoice-target evidence projects through the linked Expense relationship;
- reversal restores outstanding while preserving history;
- project/source linkage and cost truth remain intact.

Do not weaken those semantics during Wave 4D or later UI work.

---

## Hosted exact-SHA QA evidence

Earlier hosted-certified application SHA:

`e4ee4ebde489629ee74429b4e37abb511943a51e`

At that certification:

- Render QA served the exact intended SHA;
- QA deployment identity/environment matched expectations;
- QA Supabase was independently distinct from production;
- repository and QA migration parity matched `20260912082656_supplier_payables_settlement_consistency`;
- email/password authentication persisted;
- protected route contracts passed;
- zero console/page/network failures were recorded on the successful hosted attempt;
- authenticated engineering-document Storage upload/read/hash/cleanup passed;
- separate supplier-payables QA assertions passed;
- synthetic financial certification fixtures were rolled back/cleaned;
- no uncontrolled email or SMS was sent.

That hosted evidence belongs to that earlier application SHA. The newer UI/UX Round 2 application code has strong Local-QA and exact-head CI/browser evidence, but still needs later hosted exact-SHA evidence before release-readiness claims can move forward.

---

## Current provider / optional capability truth

### Gmail

Exact-state hosted provider proof may require reauthorization. Compose/review remains separate from uncontrolled send. Wave 4D must preserve the human review/confirmation boundary.

### SMS

Approved provider direction remains:

- Company SIM Gateway — primary/recommended;
- PhilSMS — optional hosted fallback.

The approved provider implementation/completion is active in this reliability
slice. Real SMS remains unavailable/unverified until controlled provider-backed QA
succeeds.

### Company-template Storage / AI / conversion

- Starter and safe Upload Storage authority is **AVAILABLE and locally certified** for Purchase Order and Client Invoice persistence/retrieval.
- Real authenticated Local-QA AI template generation is **PASSED for the exercised QA workflow**: runtime capability AVAILABLE, HSC Analyze AVAILABLE, immutable Prepare VALID, Test DOCX passed, and Purchase Order/Client Invoice Generate + persist + refresh + download + Test DOCX passed. Hosted exact-SHA certification remains separate.
- Programmatic PDF fallback is separate and already certified for exercised records.
- Company-template high-fidelity converter-backed PDF remains independently `UNAVAILABLE`.

Do not collapse these four capability states into one generic template/PDF/AI status.

### Subcontract settlement

Remains fixture-limited/not-tested where no safe subcontract/claim fixture exists.

---

## QA / production boundary

`QA CERTIFICATION: NOT READY`

The hosted application and supplier-payables evidence are strong but narrower than full readiness. UI/UX Round 2 adds strong pre-merge authenticated Local-QA and exact-head CI/browser evidence, but the newer application-bearing state is not yet a replacement for hosted exact-SHA certification.

Overall QA remains not ready because remaining provider/readiness limitations still exist, including incomplete Wave 4D provider-backed runtime evidence.

Production is read-only unless the user separately and explicitly authorizes a production operation under the migration/operator policy.

Never infer production authorization from:

- a green PR;
- a merge;
- a Render deployment;
- local QA success;
- hosted QA success;
- documentation changes.

---

## Permanent financial / security / history invariants

Preserve throughout resumed Wave 4D and subsequent work:

- one deployment -> one client company;
- active membership, RLS, RBAC, capability-based authorization, and company isolation;
- Supplier Invoice evidence remains distinct from authoritative linked Expense payable/cost truth;
- Client Invoice/Collection receivable truth remains distinct from Cash & Banking settlement evidence;
- Actual Cost remains distinct from Committed Cost;
- `projects.contract_value` remains distinct from `projects.project_budget`;
- original currency remains explicit and mixed currencies are not silently summed;
- payroll privacy, calculation freshness, approval authority, and settlement history remain intact;
- Purchase Order receiving/close rules remain intact;
- inventory movement/allocation history remains authoritative/explainable;
- immutable issued/finalized document snapshots and provenance remain intact;
- delivery history remains append-only/company-bound;
- Assistant consequential actions retain `prepare -> review -> human confirm -> execute`;
- provider capability states remain truthful when unavailable/unverified;
- completed UI/UX simplification is never authorization simplification.

---

## Required sequence from this handoff

1. **Email/SMS Reliability & UX Completion — ACTIVE by explicit user approval**
2. **Remaining Wave 4D provider/readiness evidence after this reliability slice**
3. **Wide Documents remaining managed slices — DEFERRED by explicit reprioritization**
4. **Worker Registration — PAUSED until Wave 4D complete and user explicitly resumes it**
5. Site Attendance
6. Face Recognition only after design/privacy/security work
7. Final pre-production security/data-integrity certification

Do not skip directly to Worker Registration.

---

## Fresh implementation handoff instructions

For the current Email/SMS implementation run, Codex should:

- first fetch and fast-forward `main`, record the resulting exact SHA once, and branch from it;
- read `AGENTS.md`, the efficiency guide, active roadmap, this handoff, `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md`, `SUPABASE_GMAIL_SETUP.md`, and the existing Wave 4A-4C delivery/template contracts;
- read the completed UI/UX Round 2 design record only as needed to preserve the new interaction baseline;
- default to zero subagents, hard maximum two concurrent bounded Codex subagents;
- use at most one bounded context packet when useful;
- inspect the existing Email/SMS workspace, Gmail/Auth wiring, server Gmail routes, provider-neutral SMS adapter, delivery history/idempotency model, public entry flow, and permission surfaces before designing changes;
- preserve source-backed document ownership and the existing Wave 4A-4C delivery/history contracts;
- keep Gmail refresh credentials server-only and SMS limited to the two approved providers;
- keep the canonical `hydroqualisense.com` homepage public while noncanonical operational
  roots remain authenticated unless their deployment explicitly enables the public funnel;
  keep Privacy and Terms session-free;
- run focused -> affected -> relevant build/browser/communications and migration validation;
- use Docker/Supabase only if the change genuinely crosses DB/security/integrity contracts;
- review the complete final diff;
- synchronize roadmap/handoff/client-facing feature truth to actual final capability;
- push/open PR and stop; Codex must not merge its own PR.

## Stop boundary

Do not let resumed Wave 4D expand into Worker Registration, Site Attendance, Face Recognition, broad CRM, new accounting policy, or unrelated DB redesign.

Complete the current reliability slice and the remaining Wave 4D provider/readiness criteria before returning to deferred Wide Documents work or Worker Registration. Worker Registration remains paused until Wave 4D is genuinely complete and the user explicitly resumes it.
