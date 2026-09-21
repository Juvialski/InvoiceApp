# HydroQualiSense UI Simplification Round 3 — Contextual Help & Workflow Hardening

Status: **APPROVED RESEARCH-FIRST HARDENING PROGRAM**  
Date: **2026-09-21**

## 1. Purpose

HydroQualiSense has completed multiple UI/UX and worksheet-density correction rounds, but many pages still teach the interface through always-visible explanatory prose. That creates high first-view density, pushes primary work below secondary information, and makes the product feel harder to learn even when the actual workflow is straightforward.

This program does not add a new product domain. It hardens the existing application by making pages self-explanatory through hierarchy, labels, states, predictable interaction, and contextual assistance.

The governing principle is:

**Show the task, data, state, and primary actions by default. Move education and secondary explanation behind consistent contextual help.**

## 2. Product freeze boundary

During this program, net-new customer-facing feature expansion is archived/deferred unless the user explicitly changes priority.

Deferred examples include Worker Registration, Site Attendance expansion, Face Recognition Attendance, workforce-domain expansion, Finance UX-W6 feature expansion, typed custom fields, broad Wide Documents aggregation, and optional handover-package grouping.

Hardening/certification of existing capability remains allowed, including provider readiness, authenticated document/render certification, reliability, recovery, security, data integrity, concurrency, performance, accessibility, and release evidence.

## 3. Why the previous simplification rounds were insufficient

The earlier rounds correctly reduced repeated protected/read-only badges, nested worksheet chrome, and some page hierarchy problems. They still allowed a substantial amount of explanatory copy to remain visible by default.

The new standard is stricter:

- obvious controls should not be explained by nearby prose;
- page titles and section labels should communicate purpose without a paragraph underneath;
- repeated workflow descriptions should move to help content;
- rare concepts should be discoverable on demand;
- exceptional states remain visible and explicit;
- task-critical requirements must never be hidden behind hover-only interactions.

## 4. External research requirement

UX-S3A begins with comparative research before broad implementation.

Codex may use the available Chrome/browser environment for read-only investigation of successful comparable software. Prioritize:

- Procore;
- Autodesk Construction Cloud;
- Buildertrend;
- Fieldwire;
- Raken.

Add other comparators only when they contribute a distinct pattern relevant to HydroQualiSense, such as accounting/work-order/document management or spreadsheet-oriented operations.

Research public/help/demo surfaces or the user's already-authorized browser session. Do not mutate external accounts, send messages, create records, or change settings. Do not copy proprietary assets, branding, exact layouts, or copyrighted help content. Extract interaction principles and evidence.

### Research dimensions

For each comparator, examine:

- information architecture and primary navigation;
- first useful viewport;
- page-header density;
- primary vs secondary actions;
- browse vs edit states;
- tables, filters, bulk actions, and worksheet-like editing;
- contextual help and help-center integration;
- onboarding and learning paths;
- empty, loading, error, warning, and conflict states;
- confirmation patterns;
- mobile/tablet adaptation;
- discoverability for new users without permanent instruction panels.

### Required research output

Create a durable report with:

- product/surface examined;
- observation;
- screenshot or source reference when repository evidence policy allows it;
- transferable principle;
- whether HydroQualiSense currently follows or violates the principle;
- candidate shared primitive or page family affected;
- recommendation;
- confidence / limitations.

The research report must distinguish direct observation from interpretation.

## 5. Instruction-density classification

Audit each major HydroQualiSense route and representative state. Every always-visible explanatory text block should be classified as one of:

### Keep visible

Use only when the information is necessary for most users to complete the current task safely.

Examples:

- blocking validation;
- irreversible consequence;
- required input format that is not obvious;
- current exceptional state;
- important financial/security consequence;
- concise instruction required at this exact step.

### Shorten

Use when the information is useful to most users but can be reduced to a compact sentence, label, status, or control caption.

### Contextual Help

Use for brief secondary explanation tied to a field, button, column, status, or section.

Preferred mechanisms:

- info/help icon with accessible tooltip/popover;
- button tooltip for non-obvious icons/actions;
- column header help;
- compact section help affordance;
- short popover opened by click/tap and keyboard.

Contextual help must not be mouse-only.

### Help Center

Use for:

- detailed workflows;
- onboarding;
- concepts and terminology;
- examples;
- troubleshooting;
- permissions/role explanations;
- multi-step procedures;
- rarely needed edge cases.

Provide route/topic deep links from relevant pages.

### Remove

Use for text that:

- merely repeats a button label;
- explains an obvious convention;
- duplicates another nearby explanation;
- describes internal implementation rather than user intent;
- adds no decision-relevant information.

## 6. Help architecture

### Dedicated Help area

Create a dedicated in-app Help Center rather than scattering large instruction panels across operational screens.

Expected capabilities:

- searchable or clearly categorized topics;
- Getting Started;
- Projects;
- Supplier Invoices;
- Procurement / RFQ / Purchase Orders;
- Expenses / Payables;
- Documents;
- Warehouse / Equipment;
- Vendors;
- Email / SMS;
- Settings / roles / permissions;
- common errors and recovery;
- keyboard/workflow tips where applicable.

The first implementation may be repository-backed static content. Do not introduce a CMS or new backend unless evidence later proves it necessary.

### Page-level Help action

Major working pages should expose one consistent Help action that opens the most relevant topic or context panel.

The action must be in a predictable location across pages.

### Contextual help registry

Prefer a reusable topic/help mapping rather than one-off tooltip strings scattered throughout components.

A route/feature/topic registry should make it possible to:

- map a page to its Help Center article;
- reuse concise microcopy;
- test that major routes have help coverage;
- avoid contradictory instructions.

### Accessibility

Do not rely on hover alone.

- tooltips must trigger on keyboard focus as well as mouse hover;
- touch devices need click/tap popovers or help controls;
- essential task information stays visible;
- help triggers need accessible names;
- opening help must not trap focus or break keyboard navigation;
- do not use color alone to communicate state.

## 7. Page simplification standard

For every major page:

1. identify the current task;
2. identify the primary working content;
3. identify the primary action(s);
4. put those elements in the first useful viewport;
5. move explanatory/secondary content after or behind help;
6. remove duplicate labels and nested instructional containers;
7. preserve warnings only when an actual warning condition exists;
8. keep state/action placement consistent with similar pages.

A normal page should not require users to read a paragraph before recognizing what they can do.

## 8. Workflow hardening standard

UX-S3D goes beyond copy reduction and audits existing workflows for friction.

Check:

- duplicate actions;
- the same action appearing in inconsistent locations;
- unnecessary confirmation dialogs;
- missing confirmation for consequential actions;
- avoidable page changes;
- excessive modal depth;
- ambiguous Save / Apply / Issue / Verify terminology;
- poor default focus;
- failure states that lose entered work;
- weak recovery from stale/conflict/network errors;
- missing next-step cues after successful completion;
- inconsistent view/edit modes;
- repeated data entry that could be safely carried forward;
- unnecessary choices where the system already knows a safe default.

Do not weaken financial authority, audit history, provenance, permission checks, or explicit consequential actions in the name of fewer clicks.

## 9. Implementation sequence

### UX-S3A — Comparative research + HydroQualiSense audit

Research comparable applications and inspect HydroQualiSense route/state screenshots.

Deliverables:

- comparative research report;
- app-wide instruction-density matrix;
- route/state prioritization;
- shared-root-cause findings;
- proposed Help Center taxonomy;
- candidate shared primitives;
- no broad UI remediation.

### UX-S3B — Help Center + contextual-help foundation

Implement:

- Help Center route/surface;
- topic registry/content structure;
- page-level Help action;
- accessible tooltip/popover primitive or standardized existing primitive;
- touch/click behavior;
- route/topic deep linking;
- initial high-value help topics.

Keep the first version intentionally lightweight and static unless evidence requires more.

### UX-S3C — App-wide visible-copy simplification

Apply the audit:

- remove redundant instructional paragraphs;
- shorten headers/subheaders;
- move detailed guidance into Help Center;
- move brief secondary explanations into contextual help;
- reduce nested instruction cards and legends;
- keep blocking/exception information visible;
- prioritize primary content and actions.

Fix shared primitives first where a repeated root cause exists.

### UX-S3D — Workflow-friction hardening

Use the research and audit evidence to improve existing workflows without adding new domains.

Prioritize the highest-frequency / highest-confusion flows.

### UX-S3E — Accessibility, responsive, and visual certification

Re-capture representative routes/states at:

- desktop;
- constrained laptop;
- tablet;
- phone.

Verify:

- first useful viewport;
- reduced visible instruction density;
- task/action discoverability;
- Help action consistency;
- keyboard/focus behavior;
- touch help behavior;
- no lost task-critical information;
- no overflow;
- no permission/financial/history regression.

Record deliberately deferred findings.

## 10. Suggested quantitative evidence

Do not optimize blindly for a single metric, but record useful before/after evidence such as:

- always-visible explanatory text blocks per route;
- approximate visible instructional word count above the primary work area;
- number of nested instructional containers;
- first-primary-content vertical position;
- number of primary actions shown simultaneously;
- number of Help Center/contextual-help mappings;
- unresolved P0/P1/P2 usability findings.

The target is not "minimum words." The target is **minimum unnecessary cognitive load while preserving safe task completion**.

## 11. Validation

UX-S3A is research/documentation/evidence only. Do not run application or DB suites by ritual.

For implementation slices:

1. new/edited focused tests;
2. focused shared-component/domain tests;
3. `npm.cmd run test:affected:agent`;
4. lint/build when relevant;
5. targeted Demo Visual QA / browser evidence for changed routes;
6. accessibility/keyboard/touch checks for contextual help;
7. exact final-diff review.

Do not start Docker/Supabase for presentation-only work.

If a hardening change modifies migrations, RLS/RPC, financial authority, lifecycle guards, or concurrency, apply the full database/security validation required by `AGENTS.md`.

## 12. Out of scope

This program must not turn into:

- Worker Registration;
- new attendance/face-recognition capability;
- new Finance domains;
- arbitrary custom fields;
- new document aggregation domains;
- a new backend/CMS merely for Help content;
- a wholesale design-system rewrite;
- removing required warnings or safeguards;
- weakening explicit approval/payment/issue/reconciliation/lifecycle actions;
- production mutation.

## 13. Definition of done

This program is successful when:

- major working pages are understandable without reading large instructional panels;
- detailed instructions are available through a consistent Help Center;
- brief secondary explanations are available contextually and accessibly;
- task-critical information remains visible at the moment it is needed;
- primary work and actions dominate the first useful viewport;
- common workflows have fewer avoidable steps and clearer state transitions;
- desktop, laptop, tablet, phone, keyboard, and touch evidence support the result;
- new product feature expansion remained archived unless explicitly resumed.
