# HydroQualiSense UI/UX Round 2 — App-Wide Usability Simplification & Information Architecture

Status: **COMPLETE — IMPLEMENTED AND FINAL-REVIEWED IN PR #161**  
Approved by user: **2026-09-12**  
Finalized: **2026-09-13**  
Repository: `Juvialski/InvoiceApp`  
Baseline when this design was approved: `28f063c365fea287b5aa07c3ea7d94af05f3651c`  
Implementation baseline used by the PR: `746a4aacda9ccceff88a5093bfeb678b8b1046a8`  
Final application-bearing implementation head before documentation-only finalization: `486d8cd594eade2ad6399ed3160b6f0a227a17b8`  
Implementation engine: **Codex lead, zero subagents by default, maximum two concurrent bounded subagents**

This document is now the completed design-and-acceptance record for HydroQualiSense UI/UX Round 2. It preserves the approved workflow-first information-architecture rules as a standing UI baseline for later phases.

UI/UX Round 2 is no longer the next implementation phase. The exact next product phase after finalization is **Wave 4D messaging-provider integration/completion** under `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md`. Worker Registration remains paused until Wave 4D is genuinely complete and the user explicitly resumes it.

Live repository state, `AGENTS.md`, financial/security/history invariants, the active roadmap, and later explicit user instructions override this record if they conflict.

---

## 1. Why this phase existed

HydroQualiSense already had broad functionality, but parts of the authenticated product exposed too much implementation detail, system architecture, secondary information, flat navigation, oversized summary UI, cramped controls, and weak hierarchy directly in the primary user experience.

The problem was not merely cosmetic. It was **cognitive overload and weak information hierarchy**.

Representative problems included:

- dense compound controls where project allocation values, units, balance, allocation method, and actions were compressed into difficult rows;
- large summary/card regions consuming substantial vertical space before users reached the working register;
- internal source-of-truth or authority terminology appearing as primary business copy;
- raw or semi-raw record identifiers surfacing prominently when users mainly needed business identity and next actions;
- flat tab systems where too many views appeared equally important;
- excessive dead space alongside simultaneously cramped forms/tables;
- filters, explanations, technical context, and metrics competing with records/actions;
- controls that technically fit but were truncated, compressed, ambiguous, or difficult to understand;
- pages that were functionally correct but required knowledge of HydroQualiSense internals to operate confidently.

Previous UI/UX work had improved overflow, responsive behavior, browser coverage, and individual defects. Round 2 deliberately raised the bar from structural correctness to **workflow clarity and product understandability**.

---

## 2. Approved user decision and sequencing

The user explicitly approved this decision:

> HydroQualiSense may restructure navigation, tabs, page sections, filters, actions, and authenticated information architecture when doing so clearly improves usability and simplifies the product, as long as important features, permissions, financial truth, audit history, and workflow correctness are preserved.

The user deliberately placed UI/UX Round 2 before the remaining Wave 4D messaging-provider implementation/readiness work.

That temporary reprioritization is now complete. The current sequence is:

1. **UI/UX Round 2 — COMPLETE in PR #161.**
2. **Wave 4D messaging-provider integration/completion — NEXT / ACTIVE.**
3. **Worker Registration — PAUSED** until Wave 4D is genuinely complete and the user explicitly resumes it.
4. Site Attendance follows Worker Registration.
5. Face-Recognition Attendance follows only after explicit privacy/security design.
6. Final pre-production certification follows the major product domains.

UI/UX Round 2 did not cancel or redesign Wave 4D. Existing Email/SMS/Documents work, Company SIM Gateway primary direction, PhilSMS optional fallback direction, provider-neutral/server-side boundaries, durable delivery history, and human send-confirmation boundaries remain valid.

---

## 3. Product objective and standing success test

The app should remain feature-rich while being substantially easier to understand and operate.

The target experience remains:

- **task first, system architecture second**;
- the normal path through a workflow is visually obvious;
- advanced capability remains available without crowding the default experience;
- pages across Finance, Procurement, Projects, Inventory, Payroll, Documents, Communications, Engineering, Equipment, Settings, and other authenticated areas follow recognizable interaction patterns;
- ordinary users do not need database/source-of-truth terminology to perform business tasks;
- provenance and audit information remains available when needed;
- navigation may be reorganized when the existing structure is itself confusing;
- responsive layouts adapt the workflow instead of merely shrinking desktop UI.

### Standing three-question usability test

For every major authenticated screen, a first-time company user should be able to determine from the rendered interface within a few seconds:

1. **What is this page for?**
2. **What needs my attention?**
3. **What can I do next?**

A page does not satisfy the Round 2 standard merely because it loads, has no horizontal overflow, or looks polished.

---

## 4. Chosen design approach

Three approaches were considered.

### A. Cosmetic normalization only

Rejected as the primary approach because many reported problems were structural rather than cosmetic.

### B. Workflow-first restructuring — approved and implemented

Capabilities and contracts were preserved while the authenticated UI was reorganized around real user tasks. Page hierarchy, tabs, section ordering, action placement, filter density, terminology, and local navigation were allowed to change where that reduced cognitive load.

### C. Full application-shell rewrite

Rejected as the default because it would create unnecessary regression risk. Selective shell/navigation restructuring was allowed and implemented where justified, without a gratuitous frontend rewrite.

---

## 5. Standing UX principles

### 5.1 Task first, system architecture second

Primary UI should describe the business task. Internal authority semantics, provenance, record IDs, provider mechanics, and source relationships should not dominate the default view unless the user is performing an audit/admin task.

Technical truth should usually live in details, disclosures, source/provenance sections, drawers, explanatory badges, or history views.

### 5.2 Keep the features; reduce cognitive load

Simplification should come from hierarchy, grouping, progressive disclosure, clearer terminology, fewer equal-priority controls, better defaults, contextual actions, compact filters, and reusable interaction patterns—not by deleting legitimate capability.

### 5.3 One obvious primary action per context

Major pages and workflow states should have an obvious main action when one exists. Secondary, destructive, and uncommon actions should not visually compete with the normal path.

### 5.4 Main work before secondary explanation

Operational pages should surface the register, queue, calendar, form, table, list, editor, or workspace users came to work with near the top. Long explanations and decorative summaries must not bury the working surface.

### 5.5 Progressive disclosure

Raw IDs, detailed source evidence, immutable-history metadata, reconciliation provenance, provider mechanics, low-frequency admin controls, and uncommon lifecycle actions remain available without overwhelming common workflows.

### 5.6 Human business language

Prefer business wording such as `Linked expense`, `Open linked expense`, `Source document on file`, `Not assigned`, and human-readable business references instead of internal engineering terminology or UUID-first presentation.

Friendly wording must never change the underlying business meaning.

### 5.7 Dense where useful, spacious where helpful

Avoid both giant empty cards/dead space and cramped forms/tables that force unrelated controls together.

### 5.8 Consistent interaction grammar

Similar pages should place and style filters, actions, statuses, record details, disclosures, and secondary metadata consistently.

### 5.9 Responsive by workflow

Tablet/mobile layouts may reorder, collapse, stack, or convert tables to list/card views when useful. Responsive success is measured by workflow usability, not by forcing desktop structures to fit smaller widths.

### 5.10 Expert capability remains available

Finance, payroll, inventory, engineering, procurement, audit, configuration, documents, and administration remain available to permitted users.

---

## 6. Shared page anatomy

Major authenticated screens should generally follow this order where appropriate:

1. page title + concise purpose/context;
2. primary action / immediate next step;
3. critical state or decision-relevant summary;
4. main working surface;
5. secondary/supporting context;
6. advanced, provenance, audit, and technical details.

This is a grammar, not a rigid template.

Operational headers should avoid oversized hero treatment. Summary cards must earn their space by answering immediate business questions such as what needs attention, what is overdue, what is awaiting approval, or what balance/capacity matters now.

For register-heavy modules, search, common filters, and working data should appear quickly.

---

## 7. Filters, tables, records, and actions

### Filters

- show common filters by default;
- move low-frequency filters into advanced disclosure;
- avoid toolbars visually heavier than the content they control;
- preserve selected-filter clarity;
- provide a simple reset/clear path.

### Tables and registers

- optimize for scanning;
- put business identifiers before technical IDs;
- keep row actions consistent;
- avoid horizontal overflow where a better responsive representation exists;
- do not expose every available field merely because it exists;
- use concise status indicators with accessible explanations.

### Record actions

Prefer explicit business verbs such as View, Review, Verify, Open linked expense, Record payment, Allocate, Receive, Approve, Continue, Preview, and Send.

---

## 8. Forms and compound controls

Dense forms should be divided into meaningful sections or steps. Field width should match value type, unrelated controls should not be squeezed together, validation should stay close to the problem, and required fields must not be hidden behind advanced disclosure.

### Project Allocation — mandatory regression target and completed outcome

The original dense allocation treatment could combine project, amount/quantity, unit, remaining/balance, allocation semantics, and action in an unreadable strip.

The implemented result now provides readable responsive allocation views so users can understand project selection, allocation basis, quantity/value, unit, remaining balance, and actions without forcing large values into one narrow row. Desktop and constrained-width behavior were explicitly rechecked.

The implementation did not invent new financial or inventory semantics.

---

## 9. Navigation and information architecture

The user explicitly permitted reordering, renaming, grouping, and restructuring tabs/navigation when doing so improved simplicity.

Round 2 implemented grouped authenticated navigation while preserving canonical route vocabulary, permission-based visibility, and practical deep-link/query compatibility.

Allowed standing patterns include:

- grouped navigation rather than long flat strips;
- secondary navigation or segmented/local controls for related views;
- promotion of frequently used work;
- demotion of advanced/admin views;
- supporting context moved into detail panels/disclosures;
- consolidated entry points where route compatibility is preserved.

Navigation simplification is never authorization simplification. Visibility and actions remain capability-based rather than hardcoded to role names.

---

## 10. Module-by-module design baseline and completed outcomes

### 10.1 Dashboard / Home

Prioritize exceptions, pending work, overdue/attention-required items, useful cross-module handoffs, and a small number of decision-relevant summaries. Reduce duplicate/decorative metrics.

Round 2 also corrected a zero-valued Dashboard warning artifact found during visual certification.

### 10.2 Projects

Project status and next actions should be easy to scan. Users must be able to distinguish project overview, financial state, procurement commitments, inventory/material activity, engineering/operational records, documents, and supporting/audit context.

Round 2 corrected Project Allocation density and later tightened Projects search/sort space across desktop/tablet/phone certification.

Do not blur `contract_value`, `project_budget`, Actual Cost, Committed Cost, cash settlement, or inventory allocation semantics.

### 10.3 Procurement / Supplier Invoices / Expenses

The connected business flow should remain understandable:

`source document -> review -> verify -> linked Expense/payable authority -> settlement evidence`

Supplier evidence remains visible without dominating the Expense register. The Expense register remains the primary Expense working surface. Users can follow linked records using business context rather than interpreting internal IDs.

Round 2 also corrected usable search/sort space in Procurement during final visual certification.

Supplier Invoice evidence and authoritative Expense payable/cost truth remain distinct records.

### 10.4 Client Billing / Collections / Cash & Banking

Users should quickly see what is issued, outstanding, collected, needs action, and where to continue.

Client Invoice/Collection receivable truth remains distinct from Cash & Banking settlement evidence.

### 10.5 Inventory / Warehouse

Prioritize stock, movements, receiving, project allocation, and action-required states. Audit/provenance remains accessible without crowding the main workspace.

Current stock remains explainable from authoritative movements/source models; simplification must never become destructive balance editing.

### 10.6 Payroll — mandatory regression target and completed outcome

The former long flat equal-priority navigation was reorganized around a clearer mental model:

- Overview;
- People;
- Attendance & Time;
- Payroll Runs;
- Imports & Setup.

Existing internal tab values/workflows remain available behind the clearer grouping. Payroll privacy, calculation freshness, approval authority, settlement history, and permissions remain intact.

### 10.7 Documents — mandatory regression target and completed outcome

Documents is now search/list-first rather than primarily a registry/summary surface. Common find, open, preview, and handoff work appears ahead of secondary source/provenance context.

Canonical ownership remains in source domains; Documents remains a permission-aware index/workspace and not a competing document truth.

### 10.8 Email / SMS

The communications workspace remains task-oriented around Inbox/Intake, Compose, Sent/Delivery History, with provider/configuration state as secondary administrative context.

Provider mechanics should not dominate ordinary UI. Human review/confirmation remains required before consequential sends.

Round 2 preserved Wave 4D scaffolding and truthful unavailable states. Provider-backed messaging completion resumes after this phase.

### 10.9 Engineering / Equipment / operational modules

Current work/decisions should precede configuration, metadata, raw identifiers, and provenance. Round 2 applied hierarchy improvements to Equipment and engineering-related surfaces without changing source authority.

### 10.10 Settings / Admin

Settings remains the appropriate home for provider configuration/status, document-template administration, permissions/role templates, deployment/company configuration where supported, and other advanced controls.

Operational pages should not carry Settings-level complexity merely because the information exists.

---

## 11. Terminology and formatting baseline

Continue auditing user-facing language for:

- UUID/hash-first identity;
- source-of-truth engineering terminology;
- awkward lifecycle labels;
- raw enum values;
- database-like naming;
- verbose explanatory copy in primary working areas;
- inconsistent capitalization;
- inconsistent currency, quantity, and unit formatting;
- technically correct but unclear status labels.

Money should be human-readable and currency-aware while preserving original currency. Never invent FX or silently sum mixed currencies.

Business identifier/name/number/vendor/customer/document reference should generally precede raw technical IDs.

---

## 12. Shared component and design-system baseline

Recurring problems should be solved in shared primitives when appropriate. Round 2 introduced shared task-first operational UI primitives and aligned recurring patterns across routes.

Continue reviewing shared patterns for:

- page and section headers;
- cards/stat tiles;
- status chips/badges;
- primary/secondary/destructive actions;
- tables and toolbars;
- filters/search;
- form groups;
- tabs/subnavigation;
- drawers/modals;
- helper text;
- empty/loading/error/unavailable states;
- pagination;
- responsive action patterns.

Unrelated architectural refactoring remains out of scope unless separately approved.

---

## 13. Empty, loading, error, and unavailable states

Empty states should explain what belongs there, whether the view is genuinely empty or filtered, and what the user can do next.

Loading states should avoid major layout shifts.

Errors should use business-helpful wording instead of raw provider/database internals when a safe translation exists.

Capability unavailable states must remain truthful. Unsupported providers, AI prerequisites, converters, or features must never appear active simply to simplify the UI.

---

## 14. Accessibility and interaction quality

Preserve/improve keyboard access, visible focus, accessible labels, readable contrast, adequate touch targets, non-color-only status communication where practical, meaningful button/link labels, descriptions for ambiguous icons, dialog escape/close behavior, and sensible modal focus management.

Do not replace understandable text actions with ambiguous icon-only controls merely to reduce visual density.

---

## 15. Responsive behavior baseline

Round 2 deliberately exercised normal desktop, constrained laptop, tablet, and phone layouts.

The standing requirements remain:

- no page-level horizontal overflow;
- no clipped critical controls;
- no unusably narrow amount/quantity/select fields;
- actions remain discoverable;
- local navigation remains understandable;
- working content is not buried beneath excessive decorative UI;
- dialogs/drawers remain operable;
- tables/lists transform appropriately for smaller screens.

---

## 16. Local-QA and database boundary

Round 2 used the existing fail-closed Local-QA harness against the isolated QA backend for schema-compatible application work.

The approved loop remains useful for later UI work:

`feature branch -> local app -> isolated QA Supabase/Auth/Postgres/Storage -> authenticated workflow -> inspect rendered behavior -> fix -> focused regression`

Never hardcode account passwords, service-role keys, browser-unsafe privileged keys, or secrets in source/tests/docs.

Local QA is pre-merge functional evidence. It does not authorize production writes and does not replace hosted exact-SHA release certification when that is required.

Round 2 introduced **no migration, RLS, RPC, trigger, or database-contract change**. Database replay/pgTAP was therefore not required by the final application diff; the protected database workflow correctly classified the PR as database-unaffected.

---

## 17. Audit and workflow coverage standard

The route inventory should always be derived from live router/app behavior rather than an old hardcoded count.

Coverage should include canonical authenticated routes, major child tabs/subroutes, important details, consequential dialogs/drawers, creation/edit/review flows materially touched by a redesign, responsive states, and permission-sensitive navigation/action states where practical.

Audits must assess more than overflow: purpose clarity, hierarchy, primary-action clarity, navigation grouping, terminology, density, dead space, filter burden, record scanning, action discoverability, and responsive workflow quality.

Workflow regression should preserve applicable flows such as:

- supplier source -> verification -> linked Expense -> Cash & Banking;
- procurement/RFQ/PO -> receiving -> Warehouse;
- Client Invoice -> Collection -> Cash & Banking;
- Payroll people/time/attendance -> run/calculation -> approval navigation/freshness;
- Documents -> preview/open -> Compose/review without uncontrolled sending;
- project allocation/project-context handoffs;
- inventory/project allocation and receiving handoffs;
- deep-link/stale-record recovery where navigation changes affect them.

Provider or fixture limitations must remain explicit as blocked/not-tested rather than being silently counted as pass.

---

## 18. Final acceptance evidence — 2026-09-13

UI/UX Round 2 met the applicable acceptance criteria and was finalized in PR #161.

### Authenticated Local-QA route/responsive evidence

- **59/59 authenticated route scenarios passed.**
- Zero page-level overflow failures.
- Zero dialog-overflow failures.
- Zero interactive-overflow failures.
- The recorded authenticated visual-certification pass produced **80 route/state captures across desktop, constrained laptop, tablet, and phone, plus corrected Projects captures at desktop/tablet/phone**.
- The authenticated functional sweep recorded **8 PASS, 0 FAIL, 1 BLOCKED**; the one blocked case is the separate AI server-configuration prerequisite described below.

### Exact-head GitHub CI/browser evidence

At application-bearing head `486d8cd594eade2ad6399ed3160b6f0a227a17b8`:

- Application Validation & Build passed;
- affected application tests/smoke passed;
- lint/typecheck passed;
- production build passed;
- Workflow Map/source consistency passed;
- the database protected job safely fast-passed after classifying the PR as database-unaffected;
- exact-head Chromium demo QA passed and uploaded evidence;
- the GitHub visual-QA artifact independently contained **78 demo screenshots/scenarios across 34 routes and four viewport classes**, with zero failed scenarios, navigation failures, console errors, page errors, failed requests, and overflow failures.

The exact-head GitHub artifact is independent evidence from the separate authenticated Local-QA 80+ capture record; the two capture counts should not be conflated.

### Focused/affected evidence

The PR recorded:

- focused template/UI/harness suite: **38/38 pass**;
- `test:affected:agent`: **871 selected, 870 pass, 0 fail, 1 skipped**;
- lint: pass;
- build: pass.

A ritual full-suite rerun was not required by repository policy.

### Mandatory UX regression outcomes

- **Project Allocation:** readable responsive allocation views; large values, units, remaining/balance, and actions are no longer forced into an unreadable narrow strip.
- **Documents:** list/search-first working surface; common open/preview/handoff tasks precede secondary registry/provenance framing.
- **Expenses:** Expense register remains the main work surface; Supplier Invoice/source evidence remains supporting context; financial/source authority remains unchanged.
- **Payroll:** workflow-oriented grouping replaces the former flat equal-priority navigation while preserving underlying capability.

### Document Templates Starter + Upload persistence/retrieval

After the isolated QA server received the private `SUPABASE_STORAGE_SERVER_KEY`:

- `GET /api/document-templates/capability` returned `templateStorage.status=AVAILABLE`;
- Purchase Order Starter persisted immutable template metadata/version records, survived Settings refresh, and returned retrievable DOCX bytes;
- Client Invoice Starter did the same;
- safe Purchase Order DOCX Upload persisted, survived refresh, and retrieved successfully;
- safe Client Invoice DOCX Upload did the same;
- the Starter generator was corrected so its declared `company.vatTin` binding is emitted and activation validation becomes `VALID`.

Storage authority remains server-only. The capability response does not expose the secret.

### AI and PDF capability truth

AI template generation remains **NOT CERTIFIED**. The Local-QA deployment AI endpoint returned HTTP 503 with `AI_CREDENTIALS_SERVER_MISCONFIGURED` because the separate server AI configuration was absent. AI generation was not attempted and must not be represented as a Storage failure.

High-fidelity company-template PDF conversion remains independently `UNAVAILABLE`. The existing programmatic PDF fallback remains a separate capability.

These capability states must remain distinct:

1. Starter/Upload Storage persistence — **AVAILABLE and locally certified**;
2. AI template generation — **NOT CERTIFIED / blocked by separate AI server configuration**;
3. programmatic PDF fallback — separately certified for exercised records;
4. company-template converter-backed high-fidelity PDF — **UNAVAILABLE**.

### Safety/invariant result

Final review found no concrete regression requiring a code change in:

- company isolation;
- permission/capability boundaries;
- Supplier Invoice vs linked Expense financial/source authority;
- Client Invoice/Collection vs Cash & Banking authority;
- payroll privacy/freshness/approval history;
- inventory movement/allocation authority;
- immutable issued/finalized document history;
- append-only delivery history;
- route/deep-link intent;
- Assistant human-confirmation boundaries.

No uncontrolled email/SMS send and no production mutation occurred.

---

## 19. Permanent invariants this UI baseline must never weaken

Preserve at minimum:

- one deployment -> one client company;
- active membership, RLS, RBAC, permission-based authorization, and company isolation;
- Supplier Invoice evidence remains distinct from authoritative linked Expense payable/cost truth;
- Client Invoice/Collection receivable truth remains distinct from Cash & Banking settlement evidence;
- Actual Cost remains distinct from Committed Cost;
- `projects.contract_value` remains distinct from `projects.project_budget`;
- original currency remains explicit; no invented FX or silent mixed-currency summation;
- payroll privacy, calculation freshness, approval authority, and settlement history remain intact;
- Purchase Order receiving/close rules remain intact;
- inventory stock/allocation history remains authoritative and explainable;
- issued/finalized document snapshots and provenance remain immutable/history-preserving;
- delivery history remains append-only/company-bound;
- Assistant consequential mutations retain `prepare -> review -> human confirm -> execute`;
- provider capability remains truthful when unavailable/unverified;
- navigation simplification never becomes authorization simplification.

---

## 20. Explicit Round 2 out-of-scope boundary

UI/UX Round 2 did not expand into:

- new accounting semantics;
- unresolved VAT/withholding policy decisions;
- automatic FX policy;
- new inventory valuation/serial/lot systems;
- Worker Registration;
- Site Attendance;
- Face Recognition;
- new SMS provider selection research;
- live SMS provider deployment/credential work;
- broad CRM/marketing features;
- unrelated database redesign;
- production data mutation;
- provider bulk-send/marketing behavior;
- a gratuitous frontend rewrite.

The implementation preserved existing Wave 4D work for resumption afterward.

---

## 21. Final stop boundary and next phase

The UI/UX Round 2 stop boundary has been reached: the approved app-wide acceptance criteria were implemented, reviewed, and supported by authenticated Local-QA plus exact-head CI/browser evidence.

PR #161 did **not** begin Wave 4D provider deployment, Worker Registration, Site Attendance, Face Recognition, or unrelated backend work.

The exact next product phase is:

**Wave 4D — messaging-provider integration/completion**

Read `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md` before implementation. Preserve the completed task-first Email/SMS/Documents hierarchy, provider-neutral/server-side architecture, durable delivery intent/history, human confirmation, truthful unavailable states, and all permanent financial/security/history invariants.

Company SIM Gateway remains primary/recommended and PhilSMS remains the optional hosted Philippine fallback unless the user explicitly changes direction.

Worker Registration remains paused until Wave 4D is genuinely complete and the user explicitly resumes it.

---

## 22. Fresh-chat takeover checklist after Round 2 completion

A new ChatGPT or Codex session should:

1. read live `AGENTS.md`;
2. read `docs/AGENT_EXECUTION_EFFICIENCY.md`;
3. read `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`;
4. read `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`;
5. treat this document as the **completed Round 2 design/acceptance record and standing UI baseline**;
6. recognize **Wave 4D messaging-provider integration/completion as the exact next product phase** unless the user explicitly reprioritizes;
7. read `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md` before preparing or implementing that phase;
8. treat live repository state as authoritative;
9. preserve all financial/security/history/provider boundaries;
10. keep Worker Registration paused until Wave 4D is genuinely complete and the user explicitly resumes it.

The original user screenshots are not required to understand Round 2. Their important findings, design decisions, mandatory regression targets, final outcomes, and acceptance evidence are recorded here.
