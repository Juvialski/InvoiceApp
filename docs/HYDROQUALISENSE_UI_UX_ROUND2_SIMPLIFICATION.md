# HydroQualiSense UI/UX Round 2 — App-Wide Usability Simplification & Information Architecture

Status: **APPROVED DESIGN — NEXT IMPLEMENTATION PHASE**  
Approved by user: **2026-09-12**  
Repository: `Juvialski/InvoiceApp`  
Baseline when this design was approved: `28f063c365fea287b5aa07c3ea7d94af05f3651c`  
Implementation engine: **Codex lead, zero subagents by default, maximum two concurrent bounded subagents**

This document is the authoritative design contract for the next HydroQualiSense UI/UX phase. It exists so a fresh ChatGPT or Codex session can take over without relying on chat memory or screenshots from the original discussion.

Live repository state, `AGENTS.md`, financial/security/history invariants, and later explicit user instructions still override this document if they conflict.

---

## 1. Why this phase exists

HydroQualiSense now has broad functionality, but parts of the authenticated product expose too much implementation detail, system architecture, and secondary information directly in the primary user experience.

The resulting problem is not merely visual inconsistency. It is **cognitive overload and weak information hierarchy**.

Representative problems observed by the user include:

- dense compound controls where project allocation values, units, balance, allocation method, and actions are compressed into one difficult row;
- large sections or summary surfaces consuming significant vertical space before the user reaches the actual working register;
- internal system terminology such as authoritative ownership/source semantics being shown as primary UI copy instead of normal business language;
- raw or semi-raw record identifiers being surfaced prominently when the user mainly needs the business relationship and next action;
- flat tab systems where many views appear to have equal importance even though users think of them as a smaller number of workflows;
- oversized whitespace and card-heavy layouts that make feature-rich screens feel sparse and difficult to scan at the same time;
- filters, summary cards, explanations, and technical context visually competing with the records/actions users actually came to work on;
- controls that technically fit but are truncated, compressed, ambiguous, or difficult to understand;
- pages that are functionally correct but require knowledge of HydroQualiSense internals to understand what to do next.

Previous UI/UX work improved overflow, responsive behavior, browser coverage, and specific workflow defects. That work remains valid. This second round has a different goal: **simplify how the whole product is understood and operated without removing its capabilities**.

A page does not pass this phase merely because it loads, has no horizontal overflow, or looks more polished.

---

## 2. Explicit user decision and reprioritization

The user explicitly approved the following decision:

> HydroQualiSense may restructure navigation, tabs, page sections, filters, actions, and authenticated information architecture when doing so clearly improves usability and simplifies the product, as long as important features, permissions, financial truth, audit history, and workflow correctness are preserved.

This phase is intentionally placed **before continuing the remaining Wave 4D messaging-provider implementation/readiness work**.

The intended sequence is now:

1. **UI/UX Round 2 — App-Wide Usability Simplification & Information Architecture** — next/active implementation phase.
2. Resume **Wave 4D messaging-provider integration and completion/readiness evidence** after UI/UX Round 2 is merged and stabilized.
3. Worker Registration remains paused until Wave 4D is genuinely complete and the user explicitly resumes it.

Do not interpret this reprioritization as cancellation of Wave 4D. Existing Email/SMS/Documents work and approved Company SIM Gateway / PhilSMS direction remain valid and must be preserved.

---

## 3. Product objective

The app should remain feature-rich but feel substantially easier to understand and operate.

The target experience is:

- users see their **task first** and the software's internal architecture second;
- the normal path through a workflow is visually obvious;
- advanced capability remains available without crowding the default experience;
- pages across Finance, Procurement, Projects, Inventory, Payroll, Documents, Communications, Engineering, Equipment, Settings, and other authenticated areas follow a recognizable interaction grammar;
- users do not need to understand database/source-of-truth terminology to perform ordinary business tasks;
- technical provenance and audit information remains accessible when needed;
- navigation can be reorganized when the existing structure is itself a source of confusion;
- responsive layouts adapt the workflow instead of merely shrinking desktop UI.

### Primary success test

For every major authenticated screen, a first-time company user should be able to answer from the rendered interface alone, within a few seconds:

1. **What is this page for?**
2. **What needs my attention?**
3. **What can I do next?**

If those answers are not reasonably apparent, the screen is not complete even if automated overflow checks pass.

---

## 4. Chosen design approach

Three approaches were considered:

### A. Cosmetic normalization only

Standardize spacing, typography, cards, forms, buttons, tables, and responsive behavior while leaving page structures mostly unchanged.

Rejected as the primary approach because many of the reported problems are structural, not cosmetic.

### B. Workflow-first restructuring — **approved approach**

Preserve capabilities and contracts but reorganize the authenticated UI around real user tasks. Allow page hierarchy, tabs, section ordering, action placement, filter density, terminology, and local navigation to change.

This is the default approach for the phase.

### C. Full application-shell rewrite

Rebuild global navigation and most screens from scratch.

Rejected as the default because it creates unnecessary regression risk. Selective shell/navigation changes are allowed where the current navigation itself is demonstrably confusing, but this is not permission for a gratuitous full rewrite.

---

## 5. Core UX principles

### 5.1 Task first, system architecture second

Primary UI should describe the business task. Internal implementation details, authority semantics, provenance, record IDs, and source relationships should not dominate the default view unless the user is performing an audit/admin task.

Technical truth must remain available; it should usually move into:

- a details panel;
- expandable metadata;
- a source/provenance section;
- a drawer;
- a contextual badge with an explanation;
- an audit/history view.

### 5.2 Keep the features; reduce the cognitive load

Do not remove legitimate functionality merely to make a page look simpler.

Simplification should come from:

- hierarchy;
- grouping;
- progressive disclosure;
- clearer terminology;
- fewer equal-priority controls;
- better defaults;
- contextual actions;
- compact filters;
- reusable design patterns.

### 5.3 One obvious primary action per context

Every major page or workflow state should have an obvious main action when one exists.

Secondary actions should be visually subordinate or grouped. Destructive/uncommon actions must not compete with the normal path.

### 5.4 Main work before secondary explanation

Operational pages should normally surface the records, queue, calendar, form, table, or task list users came to work with near the top.

Do not force users to scroll through multiple summary cards or long architecture explanations before reaching the working surface.

### 5.5 Progressive disclosure

Advanced and audit-heavy content is allowed, but should not overwhelm common workflows.

Examples of secondary content:

- raw record IDs;
- detailed source evidence;
- immutable-history metadata;
- provider mechanics;
- reconciliation provenance;
- low-frequency admin controls;
- uncommon lifecycle actions.

### 5.6 Human business language

Primary UI copy should use business terminology rather than internal engineering wording.

Representative direction:

- `Expense #... owns cost` -> `Linked expense` / `Open linked expense` / another accurate business phrase;
- `preserved source evidence` -> `Source document on file` or equivalent;
- `Uncoded` -> `Not assigned`, `Not categorized`, or the domain-accurate phrase;
- raw UUID/hash-first presentation -> human-readable name/reference first, technical ID available in details;
- raw numeric money strings -> locale/currency-aware human formatting.

Do not change the underlying semantic meaning merely to make wording friendlier.

### 5.7 Dense where useful, spacious where helpful

Avoid both extremes:

- giant empty cards and excessive dead space;
- cramped forms/tables that force unrelated controls into a single row.

Space must support scanning and task completion.

### 5.8 Consistent interaction grammar

Similar screens should behave similarly. Users should not have to relearn where filters, actions, status, record details, and secondary metadata live on each route.

### 5.9 Responsive by workflow

Tablet/mobile layouts may reorder, collapse, stack, or convert tables to list/card views when useful.

A responsive implementation is not successful merely because desktop controls technically fit at smaller widths.

### 5.10 Expert capability remains available

Finance, payroll, inventory, engineering, procurement, audit, configuration, document, and administrative capability must remain available to permitted users.

This is simplification, not product de-scoping.

---

## 6. Shared page anatomy

Major authenticated screens should generally converge on this order where appropriate:

1. **Page title + concise purpose/context**
2. **Primary action / immediate next step**
3. **Critical state or decision-relevant summary**
4. **Main working surface** — register, queue, table, calendar, list, form, editor, or workspace
5. **Secondary/supporting context**
6. **Advanced, provenance, audit, and technical details**

This is a grammar, not a rigid template. A page may differ when its task demands it, but divergence should be intentional.

### Header guidance

Avoid oversized page heroes in operational screens. Page titles and descriptions should not consume a large portion of the first viewport unless there is a genuine onboarding need.

### Summary-card guidance

Summary cards must earn their space.

Use them when they answer an immediate business question such as:

- what requires attention;
- what is overdue;
- what is awaiting approval;
- what changed materially;
- what balance or capacity matters now.

Do not display large cards merely because metrics are available.

### Main-working-surface guidance

For register-heavy modules, the actual data/work should appear quickly. Search, filters, and common actions should be compact and close to that surface.

---

## 7. Filters, tables, lists, and records

### 7.1 Filters

- Show common filters by default.
- Move low-frequency filters into `More filters` / advanced disclosure.
- Avoid filter toolbars taller or visually heavier than the content they control.
- Use widths appropriate to the content type.
- Preserve selected-filter clarity.
- Provide a simple reset/clear mechanism when multiple filters can accumulate.

### 7.2 Tables and registers

- Optimize for scanning.
- Put business identifiers/names before technical IDs.
- Keep row actions consistent.
- Avoid horizontal overflow where a more appropriate responsive representation is possible.
- Do not place every possible field in the default table merely because it exists.
- Prefer concise status indicators with accessible explanations.

### 7.3 Record actions

Prefer explicit business verbs such as:

- View
- Review
- Verify
- Open linked expense
- Record payment
- Allocate
- Receive
- Approve
- Continue
- Preview
- Send

Avoid vague technical actions unless the domain requires them.

---

## 8. Forms and compound controls

Dense forms should be divided into meaningful sections or steps.

Guidelines:

- group fields by the user's mental model;
- align input width with expected value type;
- do not squeeze unrelated controls into one row;
- keep validation close to the field/problem;
- use help text only where it resolves a likely question;
- preserve easy access to save/continue actions;
- use sticky actions only where they improve long forms rather than creating constant visual noise;
- do not hide required fields behind advanced disclosure.

### Known Project Allocation regression case

The allocation UI shown in user evidence is a mandatory redesign target. The current dense treatment can combine project, amount/quantity, unit, remaining/balance, allocation semantics, and action in a way that is hard to read and can truncate values.

The redesigned control should make the user's decision sequence obvious. A likely structure is:

1. choose/confirm project;
2. choose allocation basis/type when applicable;
3. enter quantity/value;
4. show unit clearly;
5. show remaining/balance as supporting information;
6. provide an obvious allocation action;
7. show resulting allocation in a readable summary/history.

The exact component structure must follow the live implementation and domain semantics; do not invent new financial or inventory meaning.

---

## 9. Navigation and information architecture

The user explicitly permits navigation restructuring when it improves simplicity.

Allowed changes include:

- reordering tabs;
- renaming tabs in clearer business language;
- grouping related tabs;
- replacing long flat tab strips with secondary navigation, grouped menus, segmented controls, or local subnavigation;
- promoting frequently used views;
- demoting admin/advanced views;
- moving supporting context into detail panels/drawers;
- reorganizing page section order;
- consolidating duplicate or conceptually overlapping navigation entry points where existing route compatibility is preserved.

### Route/deep-link compatibility

Navigation simplification is not permission to break existing links casually.

Where practical:

- keep established routes resolving;
- preserve query/deep-link intent;
- add redirects/aliases when a view moves;
- preserve router/provider contracts;
- verify cross-module handoffs still reach the intended state.

If an old deep link cannot reasonably be preserved, document the exact exception and reason in the PR.

### No role-name shortcuts

Navigation visibility remains permission-based. UI simplification must not replace capability checks with hardcoded role-name assumptions.

---

## 10. Module-by-module design direction

The implementation must inspect the live routes before applying these directions. The descriptions below define intent, not an excuse to ignore current source behavior.

### 10.1 Dashboard / Home

Goal: turn the dashboard into a useful operational starting point rather than a collection of every available metric.

Prioritize:

- exceptions;
- pending approvals/tasks;
- overdue/attention-required items;
- useful cross-module handoffs;
- a small number of decision-relevant summaries.

Reduce duplicate metrics and decorative cards.

### 10.2 Projects

Goal: make project status and next actions easy to scan.

Organize project-level information so users can distinguish:

- project overview;
- financial state;
- procurement commitments;
- inventory/material activity;
- engineering/operational records;
- documents;
- supporting/audit context.

Project allocation controls are a known mandatory remediation target.

Do not blur `contract_value`, `project_budget`, Actual Cost, Committed Cost, cash settlement, or inventory allocation semantics.

### 10.3 Procurement / Supplier Invoices / Expenses

Goal: present these as a connected business flow while preserving distinct source-of-truth roles.

The normal sequence should be visually understandable:

`source document -> review -> verify -> linked Expense/payable authority -> settlement evidence`

Important UI direction:

- supplier source evidence should remain visible but should not dominate the Expense register;
- the Expense register should feel like the primary Expense working surface;
- technical phrases about authority/source ownership should be translated into accurate business wording;
- users should be able to open the relevant linked record without interpreting internal IDs;
- correction/reopen restrictions must remain truthful and aligned with DB guards.

Do **not** merge Supplier Invoice evidence and Expense payable truth into one canonical record.

### 10.4 Client Billing / Collections / Cash & Banking

Goal: make receivable and settlement progression immediately understandable.

Users should quickly see:

- what is issued;
- what is outstanding;
- what is collected;
- what requires action;
- where to continue the workflow.

Preserve the distinction between Client Invoice/Collection receivable truth and Cash & Banking settlement evidence.

### 10.5 Inventory / Warehouse

Goal: prioritize stock, movements, receiving, project allocation, and action-required states.

Audit/provenance should remain accessible without crowding the main workspace.

Current stock must remain explainable from authoritative movements or the established source model. UI simplification cannot become destructive balance editing.

### 10.6 Payroll

The existing broad flat navigation is a known mandatory review target.

The current mental model may be better represented by higher-level groups such as:

- Overview
- People
- Attendance & Time
- Payroll Runs
- Imports / Admin

This is a design direction, not a hardcoded final label set. Codex must inspect actual route responsibilities and choose grouping that reduces confusion without hiding capability.

Calendar, Attendance, Workers, Time, Runs, Imports, and related views should no longer appear as unrelated equal-priority concepts if the actual workflow can be expressed more clearly.

Preserve payroll privacy, calculation freshness, approval authority, settlement history, and permission boundaries.

### 10.7 Documents

The Documents workspace should feel like a usable document workspace rather than primarily a system registry.

Prioritize tasks such as:

- find/search;
- preview/open;
- create/continue work where applicable;
- send/handoff;
- understand meaningful document status.

Source/ownership/provenance filters remain available but should not dominate the first screen.

Avoid oversized summary/card regions that push the actual document list far below the initial viewport without a strong reason.

Canonical ownership remains in source domains; Documents stays a permission-aware index/workspace rather than becoming a competing document truth.

### 10.8 Email / SMS

Keep the communications workspace simple and task-oriented:

- Inbox / Intake
- Compose
- Sent / Delivery History
- provider/configuration status as secondary administrative context

Do not expose provider implementation mechanics to ordinary users.

Preserve human review/confirmation before consequential send actions.

Wave 4D provider implementation is temporarily sequenced after this phase; do not remove its existing scaffolding or truthful unavailable states.

### 10.9 Engineering / Equipment / other operational modules

Apply the same hierarchy rules:

- current work and decisions first;
- configuration and metadata second;
- technical identifiers/provenance in details;
- consistent actions and responsive behavior.

### 10.10 Settings / Admin

Settings is an appropriate home for more detailed configuration and technical state.

Examples include:

- provider configuration/status;
- document-template administration;
- permissions/role templates;
- deployment/company configuration where already supported;
- advanced identities and administrative controls.

Operational pages should not carry Settings-level complexity merely because the information is available.

---

## 11. Terminology and formatting audit

The phase must include an app-wide search/review for user-facing language that exposes internals unnecessarily.

Audit for:

- UUIDs/hashes used as primary labels;
- source-of-truth engineering terminology;
- awkward lifecycle labels;
- raw enum values;
- database-like naming;
- inconsistent capitalization;
- verbose explanatory copy in the main working area;
- inconsistent currency formatting;
- inconsistent quantity/unit formatting;
- status labels that are technically accurate but unclear to non-technical users.

### Money

Present money in a readable currency-aware format, e.g. `₱1,500,000.00` or domain-appropriate currency formatting, rather than raw `PHP 1500000.00`-style strings where human formatting is safe.

Never hide original currency or silently convert mixed currencies.

### IDs

Prefer a human-readable business identifier, name, number, vendor/customer, or document reference. Keep raw IDs available for diagnostics/audit where useful.

---

## 12. Shared component and design-system cleanup

Do not fix recurring problems page by page when a shared primitive is responsible.

Review reusable patterns for:

- page headers;
- section headers;
- cards;
- stat/metric tiles;
- status chips/badges;
- primary/secondary/destructive button hierarchy;
- tables and table toolbars;
- filters/search bars;
- form rows and field groups;
- tabs/subnavigation;
- drawers/modals;
- helper text;
- empty states;
- loading states;
- error banners;
- pagination;
- responsive action bars.

Targeted refactoring of shared UI components is in scope when it directly supports this phase. Unrelated architectural refactoring is not.

---

## 13. Empty, loading, error, and unavailable states

Every major workspace should handle non-happy paths intentionally.

### Empty states

Should explain:

- what belongs here;
- whether this is genuinely empty vs filtered empty;
- what the user can do next when an action exists.

### Loading states

Should avoid major layout shifts and preserve enough structure that the page does not appear broken.

### Errors

Use business-helpful wording. Do not surface raw technical/provider/database errors directly when an existing safe translation is possible.

### Capability unavailable

Continue truthful states for unavailable providers/converters/features. Do not make unsupported capability appear active merely to simplify the UI.

---

## 14. Accessibility and interaction quality

At minimum, preserve/improve:

- keyboard access for normal interactive elements;
- visible focus states;
- accessible labels for fields/actions;
- readable contrast;
- adequate touch targets;
- non-color-only status communication where practical;
- meaningful button/link labels;
- tooltip or accessible description for ambiguous icons;
- escape/close behavior for dialogs/drawers;
- sensible focus management in modal workflows.

Do not replace understandable text actions with icon-only controls merely to reduce visual density.

---

## 15. Responsive target behavior

The exact existing browser-QA viewport set remains authoritative when it already covers these classes, but this phase must intentionally inspect at least:

- normal desktop;
- laptop / constrained-height desktop;
- tablet-width layout;
- phone/mobile layout.

The QA goal is not pixel identity across breakpoints. The goal is workflow clarity.

Validate:

- no page-level horizontal overflow;
- no clipped interactive controls;
- no unusably narrow amount/quantity/select fields;
- actions remain discoverable;
- tab/subnavigation patterns remain understandable;
- important content is not pushed below excessive decorative/summary UI;
- dialogs/drawers fit and remain operable;
- table/list transformation remains usable.

---

## 16. Local-QA implementation and validation strategy

This phase should use the existing fail-closed Local-QA harness for schema-compatible application work.

Intended loop:

`feature branch -> local app -> isolated QA Supabase/Auth/Postgres/Storage -> authenticated workflow -> inspect rendered behavior -> fix immediately -> focused regression`

Use the already approved QA environment/account configuration through local environment variables or existing secure test configuration. **Never hardcode account passwords, service-role keys, browser-unsafe privileged keys, or secrets in source/tests/docs.**

Local QA is pre-merge functional evidence. It does not authorize production writes and does not replace hosted exact-SHA release certification when that is later required.

### Database boundary

This should remain primarily a UI/application phase.

Do not introduce migrations/RLS/RPC/financial-contract changes merely to make the redesign easier.

If investigation exposes a genuine backend/security/data-integrity defect:

- identify it explicitly;
- keep the UI phase from silently redefining the contract;
- use the project's required local Docker/Supabase validation for any DB-affecting correction;
- split a materially different database correction into a bounded follow-up when appropriate.

---

## 17. Required audit coverage

Codex must derive the route inventory from the live router/app rather than trusting an old hardcoded route count.

Coverage must include:

- every canonical authenticated top-level route;
- major child tabs/subroutes;
- important detail views;
- dialogs/drawers used for consequential workflows;
- record creation/edit/review flows materially touched by the redesign;
- responsive states for representative routes;
- permission-sensitive navigation/action states where existing test identities make this practical.

The audit must assess more than overflow:

- purpose clarity;
- hierarchy;
- primary action clarity;
- navigation grouping;
- terminology;
- visual density;
- dead space;
- filter burden;
- record scanning;
- action discoverability;
- responsive workflow quality.

---

## 18. Required workflow regression coverage

Do not perform screenshot tourism only. Exercise actual workflows affected by the restructure.

At minimum, preserve and retest applicable existing flows for:

- supplier source document -> verification -> linked Expense -> Cash & Banking settlement continuation;
- procurement/RFQ/PO -> receiving -> Warehouse continuation;
- Client Invoice -> Collection -> Cash & Banking;
- Payroll people/time/attendance -> calculation/run -> approval navigation and freshness boundaries;
- Documents -> preview/open -> Compose/review handoff without uncontrolled sending;
- Project allocation and project-context handoffs;
- Inventory/project allocation and receiving handoffs;
- deep-link/stale-record recovery where navigation changes touch those paths.

When a fixture or provider limitation prevents an applicable workflow, keep the result explicit as blocked/not-tested rather than silently treating it as pass.

---

## 19. Known mandatory regression examples

The following observed UI classes must be explicitly rechecked after implementation.

### 19.1 Project allocation density/truncation

The allocation experience must not compress large values, units, balance, and action semantics into an unreadable strip. Large values and normal laptop widths must remain usable.

### 19.2 Documents hierarchy

The actual document workspace/list must no longer be visually subordinated to oversized summary/registry framing. Common search/open/preview/handoff tasks should be obvious.

### 19.3 Expenses hierarchy and language

The Expense register should behave as the main Expense working surface. Supplier source evidence should remain linked/supporting context. Internal phrases such as record authority/ownership must not dominate the ordinary user view.

### 19.4 Payroll navigation

The long equal-priority tab set must be reviewed and reorganized around a clearer user mental model. The final grouping must be derived from live route responsibilities rather than blindly applying proposed labels.

These are seed examples. Passing only these four is insufficient.

---

## 20. Acceptance criteria

UI/UX Round 2 is complete only when all applicable criteria below are met.

### Information architecture

- Major routes follow a coherent task-first hierarchy.
- Reorganized tabs/navigation reduce rather than increase cognitive load.
- Existing important deep links still resolve or have deliberate compatibility handling.
- Common tasks are not hidden inside advanced/admin surfaces.

### Clarity

- First-time-user three-question test passes for major screens.
- Primary actions are apparent.
- Business wording replaces unnecessary engineering jargon.
- Technical identifiers/provenance remain accessible without dominating primary UI.

### Layout

- Known cramped compound controls are redesigned, not merely resized.
- Oversized dead space/card walls are reduced.
- Registers/lists/forms appear at a sensible point in the first working viewport.
- Common filters are compact; advanced filters are progressively disclosed where appropriate.

### Responsive behavior

- Desktop/laptop/tablet/mobile are deliberately exercised.
- No page-level horizontal overflow in supported target layouts.
- No clipped or unusably compressed critical controls.
- Local navigation remains usable at constrained widths.

### Workflow correctness

- Cross-module handoffs touched by navigation/layout changes still work.
- Permissions remain capability-based.
- No financial/security/history invariant is weakened.
- No uncontrolled external email/SMS occurs during QA.

### Shared consistency

- Repeated UI problems are fixed in shared primitives when appropriate.
- Buttons, badges, headers, filters, tables, form sections, and state displays follow consistent patterns.

### Automated/manual evidence

- new/edited tests pass;
- focused UI/domain tests pass;
- `npm.cmd run test:affected:agent` passes or its justified fallback is handled;
- production build is run because this is broad application/UI integration work;
- browser QA covers the changed/restructured routes and workflows;
- Workflow Map checks run only if mapped/generated contracts change;
- Docker/Supabase is **not** started by ritual for UI-only work, but is required if the phase crosses DB/security/integrity contracts;
- final integrated diff is reviewed for scope creep and invariant safety.

Do not require `test:full` merely because the phase is broad. Use it only under the repository's normal impact/fallback/release rules.

---

## 21. Regression-test direction

Prefer behavior-oriented browser/application coverage over brittle pixel snapshots.

Useful automated guards include:

- no page/dialog overflow at target viewport classes;
- key actions visible/reachable;
- route/deep-link compatibility;
- navigation group/tabs resolve expected content;
- important forms remain operable at constrained widths;
- row actions remain available;
- expected human-readable labels/statuses are present;
- technical IDs are not the only user-visible identity when a business identity exists;
- known cross-module handoffs still land in the intended state.

Visual screenshots/artifacts are useful evidence but should not become fragile exact-pixel tests unless a component genuinely requires that level of rendering stability.

---

## 22. Permanent invariants that this phase must not weaken

Preserve all live repository invariants, including at minimum:

- one deployment -> one client company;
- active membership, RLS, RBAC, permission-based authorization, and company isolation;
- Supplier Invoice evidence remains distinct from the authoritative linked Expense payable/cost truth;
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

## 23. Explicit out of scope

Unless a concrete defect forces a tightly bounded correction, this phase should not expand into:

- new accounting semantics;
- VAT/withholding policy decisions that remain unresolved;
- new automatic FX policy;
- new inventory valuation/serial/lot systems;
- Worker Registration;
- Site Attendance;
- Face Recognition;
- new SMS provider selection research;
- live SMS deployment/provider credential work;
- broad CRM/marketing features;
- unrelated database redesign;
- production data mutation;
- provider bulk-send/marketing behavior;
- a gratuitous full rewrite of the entire frontend stack.

Existing Wave 4D work must remain intact for resumption after this phase.

---

## 24. Implementation workflow for Codex

A future implementation prompt should instruct Codex to:

1. **First action:** fetch `origin/main`, fast-forward local `main`, record the new exact SHA once, and branch from it.
2. Read `AGENTS.md`, this design, the active roadmap, current handoff, and only other task-relevant docs.
3. Generate at most one bounded `agent:context` packet when useful.
4. Inspect the live router, application shell, shared UI primitives, and route implementations before changing navigation.
5. Default to zero subagents; hard maximum two concurrent Codex subagents for genuinely independent bounded route-group audits/refactors.
6. Keep the lead on global navigation, shared components, financial/security interpretation, integration, and final decisions.
7. Establish the live authenticated route/workflow inventory.
8. Implement workflow-first simplification, preferably fixing shared primitives before duplicating page-specific patches.
9. Use Local-QA repeatedly during implementation to inspect real authenticated behavior.
10. Run new/edited tests -> focused tests -> `test:affected:agent` -> relevant build/browser/Workflow Map checks.
11. Use Docker/local Supabase only if DB/security/integrity contracts actually change.
12. Review the complete integrated diff for broken routes, accidental feature loss, terminology mistakes, financial/security invariant drift, and scope creep.
13. Synchronize this document, `HYDROQUALISENSE_ACTIVE_ROADMAP.md`, `HYDROQUALISENSE_CURRENT_HANDOFF.md`, and client-facing Features/Roadmap only if actual implementation status requires it.
14. Push a focused branch and open a PR.
15. Codex must not merge its own PR.

---

## 25. Stop boundary

The phase stops when the approved app-wide UI/UX acceptance criteria are met and the implementation PR is ready for independent ChatGPT review.

Do not use remaining time to begin Wave 4D provider deployment, Worker Registration, attendance, face recognition, or unrelated backend domains inside the same PR.

After safe merge and any required exact-head UI/browser evidence, the roadmap should return to **Wave 4D messaging-provider integration/completion** unless the user explicitly reprioritizes again.

---

## 26. Fresh-chat takeover checklist

A new ChatGPT session asked to continue this phase should:

1. read live `AGENTS.md`;
2. read `docs/AGENT_EXECUTION_EFFICIENCY.md`;
3. read `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`;
4. read `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`;
5. read **this document in full**;
6. inspect current `main` and any relevant open implementation PR only when the requested task requires PR/release review;
7. treat live repository state as authoritative;
8. preserve all financial/security/history boundaries;
9. recognize **UI/UX Round 2 as the approved immediate implementation phase until it is completed or explicitly reprioritized**;
10. recognize **Wave 4D as incomplete but temporarily sequenced after this UI/UX phase**, not cancelled;
11. keep Worker Registration paused.

The original user screenshots are not required to understand the phase. Their important findings and acceptance cases are recorded above.
