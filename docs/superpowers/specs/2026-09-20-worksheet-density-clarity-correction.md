# UX-W4.5 — Information Density & Worksheet Clarity Correction

Status: **APPROVED PLANNING / IMPLEMENTATION REQUIRED BEFORE UX-W5**
Date: **2026-09-20**
Repository: `Juvialski/InvoiceApp`

## 1. Why this phase exists

The selective worksheet direction is correct, but the first implemented surfaces
show a new usability failure mode: **the product explains and labels the UI so
aggressively that the actual work is pushed down the page or visually buried.**

Observed examples from the current implementation:

- the Projects page stacks the page introduction, Excel import/export disclosure,
  Portfolio snapshot disclosure, a large filters container, and a separate
  Projects heading container before the project cards;
- the project cards are therefore not the first meaningful content on a page
  whose primary purpose is opening and managing projects;
- Supplier Invoice review nests multiple bordered section containers around
  separate worksheets and repeats explanatory paragraphs above each grid;
- read-only/protected worksheet cells render a visible `PROTECTED` or
  `READ-ONLY` pill in every affected cell;
- Supplier Invoice cells can also repeat provenance pills such as
  `Source evidence` beside values, multiplying visual noise;
- the same semantic fact is communicated simultaneously through cell styling,
  a badge, a tooltip/title, a legend, section text, and surrounding warning
  text.

The result is technically explicit but operationally overwhelming. A user
should be able to identify the main record, scan its values, edit allowed
fields, and understand exceptions without reading a wall of UI instructions.

This phase is a **blocking usability correction before UX-W5**. Do not expand
the worksheet pattern into Workers, Attendance, Time Entries, or other new
domains until this correction is proven on the existing migrated surfaces.

## 2. Governing principle

Keep the existing interaction grammar:

**Browse visually -> edit like a spreadsheet -> execute sensitive workflows deliberately.**

Add a second rule:

**Show the work first. Explain only what the user needs at the moment they need it.**

Information hierarchy should be:

1. primary content/task;
2. primary action and compact task controls;
3. exceptional state or blocking validation;
4. optional secondary tools;
5. optional explanation/help/audit detail.

Ordinary safety semantics must remain enforced even when their visual
presentation becomes quieter.

## 3. Mandatory app-wide screenshot investigation before fixes

The two user-provided screenshots are **examples, not the audit scope**.

UX-W4.5 must begin with a separate visual-investigation slice that captures and
reviews the current authenticated application broadly enough for the agent to
find usability and visual-quality problems that the user has not already
identified.

The investigation is evidence-first. **Do not begin broad UI remediation while
capturing the audit.** First establish what is actually wrong, group repeated
root causes, and then implement the correction slices against that report.

### 3.1 Reuse existing QA infrastructure

Prefer the repository's existing browser evidence paths instead of creating a
second screenshot framework:

- `scripts/demo-visual-qa.ts`;
- `scripts/qa/demoScenarios.ts`;
- the authenticated Local-QA harness where safe fixtures/session access exist;
- the existing durable UI/UX audit format under `artifacts/ui-ux-audit/`.

Extend scenario coverage only where meaningful UI states are currently missing.
Do not duplicate identical captures merely to increase screenshot count.

### 3.2 Coverage target

The visual investigation should cover the normal authenticated product surface,
including representative states for:

- Dashboard;
- Projects landing page and Project Workspace;
- Project Details and Cost Codes editing;
- Procurement / RFQ / Purchase Order;
- Supplier Invoices and review;
- Expenses;
- Client Billing and Collections;
- Cash & Banking;
- Warehouse / Inventory;
- Equipment;
- Payroll / Workforce;
- Engineering Documents / coordination surfaces;
- Documents;
- Email / SMS;
- Reports;
- Settings;
- shared dialogs, drawers, tables, worksheet editors, empty states, and
  high-value creation/edit flows where fixtures safely allow them.

Do not perform real provider sends, production writes, destructive lifecycle
actions, or unsafe fixture creation merely to obtain screenshots.

### 3.3 Viewports

Use the current QA viewport vocabulary and include at least:

- normal desktop;
- constrained laptop / short-height desktop;
- tablet;
- phone.

The constrained-laptop view is especially important because a layout can look
acceptable at a large desktop width while still pushing the primary task below
the fold on the screens engineers commonly use.

### 3.4 The agent must visually inspect the screenshots

Passing browser assertions, no console errors, and no horizontal overflow are
**not** evidence that a screen is well designed.

For every captured route/state, the reviewing agent must actually inspect the
rendered screenshot and make a visual usability judgment.

Classify each reviewed screen/state as:

- **ACCEPTABLE** — no material visual/usability correction needed;
- **NEEDS CORRECTION** — one or more concrete presentation/usability defects;
- **DEEPER WORKFLOW REVIEW** — visual evidence suggests the workflow itself may
  need restructuring and cannot be safely judged from a screenshot alone.

Do not assign a screen `ACCEPTABLE` merely because automated QA passed.

### 3.5 Visual quality rubric

Judge screens against concrete criteria rather than personal style preference.

For each screenshot check:

1. **Primary task visibility** — can the user immediately see what they came to
   do, or is it pushed below secondary panels?
2. **Visual hierarchy** — is there one obvious page purpose and primary action?
3. **Information density** — is the screen useful without being crowded or
   excessively sparse?
4. **Chrome-to-work ratio** — do cards, borders, headings, helper panels, and
   legends consume more space than the actual work?
5. **Repetition** — are labels, warnings, badges, instructions, or metadata
   repeated without adding information?
6. **Scanability** — can a user quickly compare rows, cards, amounts, statuses,
   and editable values?
7. **Action discoverability** — are common actions obvious and rare actions
   secondary?
8. **Control grouping** — are search/filter/sort/view controls compact and
   logically grouped rather than scattered across containers?
9. **Alignment and spacing** — do columns, cards, labels, and controls line up
   cleanly with consistent spacing?
10. **Typography** — are headings, labels, helper text, and data values sized and
    weighted according to importance?
11. **Business-language clarity** — does ordinary UI avoid internal engineering,
    authority, or source-of-truth jargon when a simpler label works?
12. **State noise** — are normal states quiet and exceptional states prominent?
13. **Responsive usefulness** — does the layout reorganize appropriately rather
    than simply shrink or force excessive scrolling?
14. **Consistency** — do similar tasks look and behave like the same product?
15. **Professional finish** — does the screen look intentionally designed rather
    than like raw components stacked until all information fits?

The agent is explicitly authorized to identify screens as visually unacceptable
when these criteria fail, even if no previous user screenshot or issue mentions
that route.

### 3.6 Finding severity

For triage, classify concrete findings by user impact:

- **P0 — unusable/blocking:** primary task cannot reasonably be completed or
  critical controls/content are obscured;
- **P1 — major:** strong confusion, hidden primary task/action, severe clutter,
  broken hierarchy, or major responsive failure;
- **P2 — moderate:** repeated friction, poor scanability, unnecessary chrome,
  inconsistent grouping, awkward spacing, or confusing secondary emphasis;
- **P3 — polish:** smaller consistency, alignment, copy, or spacing defects that
  do not materially block work.

Severity is for implementation priority, not to create an arbitrary aesthetic
score.

### 3.7 Required investigation output

The investigation must produce a durable sanitized report, following
`docs/REPOSITORY_EVIDENCE_POLICY.md`, that records:

- exact source SHA;
- environment/mode used;
- viewport;
- route/workflow/state;
- screenshot/evidence reference;
- ACCEPTABLE / NEEDS CORRECTION / DEEPER WORKFLOW REVIEW;
- concrete problem;
- user task affected;
- severity;
- likely shared root cause/component when identifiable;
- proposed direction, without prematurely designing a large rewrite.

Scratch screenshots and browser output remain transient unless deliberately
promoted under the repository evidence policy. The durable report and any
promoted sanitized evidence must state their qualification clearly; local/demo
visual evidence is not production certification.

### 3.8 Root-cause grouping

Do not turn the report into dozens of unrelated pixel tweaks.

After screenshot review, group findings into reusable correction themes such as:

- primary content buried by summaries/tools;
- excessive card/container nesting;
- repeated state/provenance badges;
- overly verbose helper text;
- weak page hierarchy;
- oversized headers/empty space;
- dense working tables with poor scanability;
- actions scattered across multiple regions;
- mobile layouts that retain desktop assumptions;
- inconsistent editor/register patterns;
- technical language exposed to ordinary users.

The implementation plan should fix shared primitives/components first when a
root cause affects multiple screens.

### 3.9 Investigation stop boundary

UX-W4.5A is complete when the current app has been visually reviewed and the
triage report is specific enough to drive bounded correction slices.

Do **not** use spare time in the investigation run to:

- start UX-W5;
- redesign business workflows without evidence;
- make broad application changes before the findings are recorded;
- modify database/security/financial semantics;
- perform production/provider actions.


## 4. Semantic protection versus visual noise

Protected/read-only fields remain semantically protected. This phase does **not**
weaken any financial, lifecycle, permission, provenance, history, or concurrency
boundary.

However, protection does not require a repeated visible badge in every cell.

The shared `WorksheetEditor` should retain, where applicable:

- `aria-readonly`;
- non-editable keyboard/edit behavior;
- `data-worksheet-protected` / `data-worksheet-readonly`;
- protected/read-only state for automated tests;
- distinct but restrained read-only styling;
- contextual title/tooltip or accessible help when useful;
- explicit protected-field explanation at section/column level when the reason
  is not obvious.

By default it should **not** append a `PROTECTED` or `READ-ONLY` pill to every
read-only cell.

Visible badges should be reserved for information that is exceptional or
decision-relevant, such as:

- validation error;
- unresolved value;
- conflict/stale data;
- manually corrected evidence when that distinction matters;
- an unusual workflow lock that requires explanation.

A whole column or section that is read-only should normally communicate that
once through styling, a lock icon/legend, column header affordance, or concise
section note rather than repeating the same label on every cell.

## 5. Shared WorksheetEditor correction

Implement a quiet protection presentation before expanding the component to
new domains.

Candidate implementation direction:

- remove the automatic per-cell visible `Protected` / `Read-only` badge from
  the default display path;
- preserve the current semantic/accessibility/test attributes;
- preserve a subtle protected background or cursor/selection treatment;
- optionally support an explicit high-visibility protection presentation only
  for rare workflows that genuinely need it;
- keep error/warning/conflict presentation visually strong;
- do not make editable and protected cells indistinguishable;
- do not require color alone to explain editability;
- keep keyboard, copy/paste, focus, validation, dirty-state, and responsive
  behavior intact.

The desired result is closer to a familiar spreadsheet: editable cells feel
editable, locked cells feel locked, but the word `PROTECTED` is not repeated
across the sheet.

## 6. Projects landing-page correction

### Current problem

Project cards are visually useful but appear too far down the page. Several
secondary containers consume the initial viewport before the primary project
content.

### Required default hierarchy

For normal desktop/laptop use:

1. compact page title + **New project**;
2. compact search/status/filter/view toolbar;
3. project cards immediately;
4. optional portfolio analysis and Excel import/export after the primary card
   content or behind a clearly secondary disclosure/action.

The first project-card row should start within the initial useful viewport on a
typical desktop/laptop whenever the viewport reasonably allows it.

### Specific simplifications

- Keep the card grid as the default dominant content.
- Do not place a full-width boxed `Projects` explanation strip immediately
  above the cards if the page title and controls already establish context.
- Merge search, status, sort, Cards/Compact List, and a compact
  `More filters` action into one toolbar rather than multiple large boxes.
- Move `Excel import/export` out of the primary vertical flow. Suitable
  locations include a secondary toolbar action, menu, drawer, or lower-page
  disclosure.
- Move `Portfolio snapshot` below the card grid or expose it through a compact
  secondary action/summary. Attention counts can remain as a small signal near
  the toolbar without consuming a full section.
- Remove instructional sentences that merely restate obvious interactions such
  as telling the user to click a project card when the card is already clearly
  clickable.
- Keep Cards / Compact List available without giving the toggle its own large
  container.
- Avoid nested cards solely for grouping controls.

### Must preserve

- card-first project identity;
- attention indicators;
- search/filter/sort capability;
- Cards/Compact List;
- workbook import/export capability;
- portfolio analysis;
- permissions;
- lifecycle actions;
- all project financial semantics.

This is an information-hierarchy change, not a feature removal.

## 7. Supplier Invoice review correction

### Current problem

The review surface repeats section explanations, `WORKSHEET` labels,
`PROTECTED` pills, provenance badges, legends, and warning text. The user must
scan UI chrome instead of the invoice values.

### Required hierarchy

1. source invoice image/PDF;
2. compact extracted-data status/action bar;
3. extracted values/line items;
4. blocking errors or unresolved decisions;
5. advanced provenance/accounting explanation on demand.

### Section presentation

Keep logical groups such as:

- Invoice Header;
- Vendor;
- Line Items;
- Totals / Monetary Facts.

But simplify them:

- section title -> grid directly;
- remove redundant `WORKSHEET` subheaders when the grid itself is obviously
  the worksheet;
- make section descriptions short or move them behind an info affordance;
- avoid a separate bordered card inside another bordered card unless necessary
  for scrolling or accessibility;
- use one compact shared legend/help disclosure for the page rather than
  repeating explanations in each section.

### Provenance presentation

Provenance remains important, but it should be exception-driven.

- Do not render `Source evidence` beside every ordinary unchanged source value.
  Source evidence is the normal state on this review page.
- Keep `Manually corrected`, `Unresolved`, validation error, conflict, or
  calculated state visible when it affects a decision.
- A column/section-level indicator may communicate that values originated from
  the source invoice.
- Preserve provenance data internally even when the default visual label is
  suppressed.

### Vendor workflow

Canonical Vendor identity/link/create must remain a controlled workflow, but
the page should not repeat a long warning whenever the same boundary is already
clear from the dedicated Vendor controls.

Use a concise contextual note or info disclosure. Escalate to a strong warning
only when the current record actually has an unresolved/blocking vendor issue.

### Monetary facts

Protected calculated/accounting facts remain protected. Ordinary protected
values should be visually quiet. Unknown, inconsistent, unresolved, or
financially blocking values should remain prominent.

## 8. Progressive disclosure standard

Default-visible explanatory text should be limited to content needed to perform
the current task safely.

Use one of these patterns for secondary explanation:

- info icon + accessible tooltip/popover;
- `How this works` disclosure;
- compact help drawer;
- column header help;
- section-level note;
- inline explanation triggered only by an error/conflict/unresolved state.

Do not place long helper paragraphs above ordinary data unless a user must read
them before safely proceeding.

## 9. Container and chrome budget

For working pages:

- avoid a border + rounded card + shadow around every conceptual group;
- avoid nested white cards inside white cards where spacing/headers are enough;
- prefer one visual container around a working region, then lightweight
  separators within it;
- use whitespace deliberately but not as vertical padding that delays access to
  data;
- primary data should occupy substantially more screen area than explanatory
  chrome.

A worksheet should visually resemble a working tool, not a sequence of
documentation panels.

## 10. Existing migrated surfaces audit

After the shared correction, audit every current worksheet integration for the
same problems:

- Project Details;
- Cost Codes;
- Supplier Invoice review;
- RFQ draft;
- Purchase Order draft;
- Client Billing draft;
- Expense direct draft.

For each surface check:

- repeated read-only/protected labels;
- repeated legends;
- redundant `Worksheet` headings;
- unnecessary helper paragraphs;
- nested containers;
- actions duplicated in section and page chrome;
- primary editable values pushed below secondary information;
- mobile/tablet overflow after simplification.

Only make bounded presentation changes. Do not redesign domain semantics.

## 11. Suggested implementation slices

### UX-W4.5A — app-wide screenshot investigation and visual triage

- capture representative authenticated/demo screenshots across the full app;
- review every captured state visually using the rubric in this document;
- record ACCEPTABLE / NEEDS CORRECTION / DEEPER WORKFLOW REVIEW;
- produce the durable prioritized findings/root-cause report;
- do not perform broad remediation in this investigation slice.

### UX-W4.5B — shared visual-noise foundations

- simplify `WorksheetEditor` protected/read-only rendering;
- establish compact section/help/progressive-disclosure patterns;
- fix other shared primitives identified by the visual investigation when the
  evidence shows a repeated root cause;
- add accessibility/regression tests.

### UX-W4.5C — highest-priority page hierarchy corrections

Start with P0/P1 findings and repeated root causes from the report. Projects
first-view and other screens with buried primary content are expected candidates,
but the screenshot investigation decides the actual bounded list.

### UX-W4.5D — Supplier Invoice and worksheet clarity corrections

- remove redundant worksheet chrome where confirmed by the audit;
- suppress normal repeated provenance/protection labels;
- keep exceptional states prominent;
- compact section/help structure;
- apply the same evidence-backed correction to other migrated worksheet
  surfaces where appropriate.

### UX-W4.5E — app-wide visual consistency closeout

- re-capture changed screens at the relevant viewports;
- verify P0/P1 findings are closed;
- address bounded P2 findings that share the same implemented root causes;
- record deliberately deferred findings rather than silently ignoring them;
- no new UX-W5 domain.

Slices after UX-W4.5A may be regrouped into reviewable PRs based on the evidence,
but UX-W5 must not begin until the visual investigation is complete and the
blocking P0/P1/shared-root-cause corrections are resolved.

## 12. Acceptance criteria

### Projects

- project cards are the first dominant working content;
- the first card row appears without scrolling on a normal desktop viewport
  whenever reasonably possible;
- search/status/view controls remain immediately accessible;
- Excel import/export and portfolio analytics remain available but secondary;
- no feature is removed merely to reduce density;
- no large empty/explanatory container separates the toolbar from the cards.

### WorksheetEditor

- protected/read-only semantics remain enforced;
- default protected cells do not render repetitive `PROTECTED` pills;
- editable versus non-editable remains understandable without relying only on
  color;
- errors, unresolved states, warnings, and conflicts remain visible;
- keyboard/edit/paste/save behavior is unchanged unless deliberately improved.

### Supplier Invoice

- source remains visually first;
- extracted values are visible with materially less explanatory chrome;
- normal source-evidence cells do not repeat a provenance badge unnecessarily;
- protected state is not repeated in every protected cell;
- exceptional/manual/unresolved/conflict/error states remain clear;
- Vendor/Project/PO/Expense/verification authority remains unchanged;
- monetary source-of-truth rules remain unchanged.

### Cross-surface

- no page-level horizontal overflow;
- responsive laptop/tablet/mobile behavior remains usable;
- accessible read-only semantics remain machine-readable;
- focused and browser visual regression evidence demonstrates reduced clutter
  rather than merely asserting it.

## 13. Validation strategy

This is expected to be primarily UI/application work.

For **UX-W4.5A investigation**, do not run application test suites merely because
screenshots were captured. Use the existing browser/local-QA screenshot
infrastructure, inspect the resulting screenshots, and produce the durable
triage report. Add/adjust screenshot scenarios only when meaningful coverage is
missing.

For implementation slices after the investigation, use:

1. new/edited focused component tests;
2. focused tests for the actually changed domains/shared primitives;
3. `npm.cmd run test:affected:agent`;
4. lint/build only when relevant to the final diff;
5. targeted browser/Demo Visual QA at desktop, constrained laptop, tablet, and
   phone for changed routes;
6. visual comparison against the investigation findings;
7. exact final-diff review.

Do not start Docker/Supabase for presentation-only changes.

If implementation unexpectedly changes migrations, RLS, RPC, triggers,
constraints, company-bound integrity, or DB concurrency, then the normal real
Supabase runtime validation requirements apply.

Do not run `test:full` by ritual.

## 14. Out of scope

This correction must not become:

- UX-W5 Workers/Attendance/Time Entry implementation;
- remaining Client Receivables/Cash & Banking rollout;
- custom-field/Add Column architecture;
- new financial lifecycle semantics;
- a rewrite of Supplier Invoice authority;
- a new grid engine;
- a new design system;
- arbitrary schema changes;
- provider work;
- Wide Documents work;
- Repository Intelligence explorer work;
- production mutation.

## 15. Sequencing decision

The approved sequence becomes:

`UX-W4 complete -> UX-W4.5A app-wide screenshot investigation -> UX-W4.5 correction slices -> UX-W5 operational bulk-data editors -> UX-W6 Finance -> UX-W7 custom fields -> UX-W8 certification`

UX-W4.5 exists specifically to prevent the current over-labeled, over-boxed
worksheet presentation from being copied into every remaining domain.
