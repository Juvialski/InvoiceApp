# HydroQualiSense Selective Workbook Editing UX Direction

> **APPROVED UX CORRECTION — BROWSE VISUALLY, EDIT LIKE A SPREADSHEET, KEEP CONSEQUENTIAL ACTIONS CONTROLLED**

Status: **Approved direction; documentation-first correction before further Excel-native domain rollout**
Repository: `Juvialski/InvoiceApp`
Product: HydroQualiSense
Date: **2026-09-20**

This document refines the existing Excel-native Operations UX contract at
`docs/superpowers/specs/2026-09-18-excel-native-operations-ux-design.md`.

It does not cancel the implemented workbook round-trip foundation, controlled
Procurement rollout, Projects/Cost Codes workbook support, or bounded
Expenses/Supplier Payables rollout. It corrects the interaction model that
future implementation must follow.

The new governing principle is:

> **Browse visually. Edit like a spreadsheet. Execute sensitive workflows deliberately.**

HydroQualiSense must not make every page look like Excel. The main purpose of
spreadsheet familiarity is to make structured data entry, correction, bulk
editing, and repeated operational updates immediately familiar to engineers,
project managers, finance staff, and other users accustomed to Excel.

The live repository, `AGENTS.md`, the active roadmap, the current handoff,
the standing UI/UX Round 2 baseline, and domain-specific financial/security
contracts remain authoritative. This direction changes presentation and
editing grammar only. It does not weaken source ownership, permissions,
history, lifecycle, financial semantics, or database integrity.

---

## 1. Why this correction is necessary

The first Excel-native rollout proved important backend and interchange
capabilities:

- dense register presentation through `OperationsGrid`;
- real `.xlsx` export;
- reverse upload;
- validation and diff review;
- optimistic concurrency;
- protected fields;
- explicit human confirmation before Apply; and
- authoritative domain save paths.

Those capabilities remain valuable.

However, the current result is still too close to:

> **ordinary web form/register + separate Excel import/export panel**

That is not the intended end-user experience.

The actual target is:

- important business objects remain visually prominent and easy to discover;
- ordinary browse/list pages use the best UI for finding and understanding
  records, not an Excel imitation;
- structured edit/create/correction surfaces use a worksheet-like interaction
  model when spreadsheet familiarity reduces cognitive load;
- users can enter and revise rows/cells with familiar keyboard and paste
  behavior;
- complex or consequential workflows remain deliberate and purpose-built.

The existing `OperationsGrid` is therefore not the complete Excel-native
interaction model. It remains useful as a dense register/read/select primitive.
A separate reusable worksheet editing primitive is required.

---

## 2. Governing interaction grammar

### 2.1 Browse visually

Use cards, lists, dashboards, compact registers, status summaries, and search
interfaces when the user's main question is:

- What records exist?
- Which one should I open?
- Which project needs attention?
- What is the current state?
- Where should I continue?

Browse surfaces should emphasize identity, priority, status, and next action.

Examples:

- Projects portfolio;
- invoice directory;
- equipment directory;
- vendor directory;
- project workspace navigation;
- Documents library;
- engineering RFI/submittal registers.

A browse page must not become a spreadsheet merely because the underlying data
could be represented as rows.

### 2.2 Edit like a spreadsheet

Use a worksheet-style editor when the user's main task is:

- enter structured fields;
- correct extracted data;
- edit repeated lines;
- add rows;
- bulk update similar records;
- paste values from Excel;
- allocate amounts across multiple rows;
- maintain a master-data table; or
- work repeatedly across a predictable column schema.

Examples:

- Project Details;
- Project Cost Codes;
- supplier invoice extraction correction;
- RFQ lines;
- Purchase Order lines;
- Client Invoice lines;
- Expense editing;
- worker master data;
- attendance;
- time entries;
- project worker assignments;
- project materials;
- project equipment;
- warehouse item master;
- equipment master;
- vendor master.

### 2.3 Execute sensitive workflows deliberately

Do not turn consequential actions into ordinary editable cells.

Keep explicit workflow controls for:

- approval;
- issue/finalize;
- verification;
- archive/reactivate;
- void/reverse;
- payment/settlement;
- Cash & Banking reconciliation;
- inventory receipt/issue/return/adjustment;
- payroll calculation/approval/payment;
- supplier invoice -> authoritative Expense creation;
- PO receiving/close/cancel;
- RFI/submittal lifecycle transitions;
- document sending;
- provider actions;
- security/RBAC changes.

A user must never be able to change financial or lifecycle truth by typing a
new value into a spreadsheet cell that bypasses the authoritative workflow.

---

## 3. Shared UI architecture

The application should keep two distinct reusable primitives.

### 3.1 `OperationsGrid`

Purpose:

> **Browse, scan, sort, filter, select, and open records.**

It can remain appropriate for dense registers and read-oriented surfaces.

It is not required to provide free-form spreadsheet editing.

### 3.2 New `WorksheetEditor` family

Purpose:

> **Create and edit structured operational data using spreadsheet-familiar interactions.**

The exact implementation name may differ, but the shared contract should cover:

- editable cells;
- protected/read-only cells;
- selected cell state;
- selected row state;
- keyboard arrows;
- Enter;
- Tab / Shift+Tab;
- Escape;
- optional F2-style edit entry when appropriate;
- copy;
- paste;
- multi-cell paste from Excel/Sheets;
- row insertion where authorized;
- row removal where authorized and safe;
- field-aware dropdown/select cells;
- date cells;
- numeric/currency cells;
- validation states;
- dirty/unsaved row state;
- stale/conflict state;
- calculated cells;
- protected-source indicators;
- inline error markers;
- frozen headers;
- optional frozen identity columns;
- compact desktop density;
- responsive/mobile fallback;
- explicit Save/Apply boundary;
- reusable worksheet tabs where a record naturally has multiple structured
  sections;
- integration with existing `.xlsx` round-trip contracts where supported.

The editor should feel familiar to spreadsheet users without copying Microsoft
Excel branding or pretending the application is a general-purpose spreadsheet.

### 3.3 Do not force `OperationsGrid` to become the editor

The browse and edit concerns should remain separate enough that:

- register complexity stays manageable;
- permission semantics remain explicit;
- editing behavior can evolve without destabilizing every read-only register;
- mobile fallbacks can differ;
- domain workflows can choose the correct primitive.

---

## 4. Projects — revised UX contract

Projects are important first-class operational objects. Their identity must not
be visually buried inside a dense financial table.

### 4.1 Projects landing page

The default portfolio presentation should use large rectangular project
cards/tiles on desktop and mobile.

Each card should make the project name the dominant element.

Minimum useful card content:

- Project Name — visually dominant;
- Project Code;
- Client;
- Location;
- Project Manager;
- Status;
- Contract Value;
- Approved Project Budget;
- Actual Cost;
- Committed Cost;
- one or two high-value attention indicators.

The entire primary card area should open the Project Workspace.

The default project portfolio must not require users to discover the project
through tiny text inside a wide spreadsheet register.

An optional **Compact List** / register view may remain for users managing many
projects, but it should not make the card-first project identity less clear.

### 4.2 Project card actions

The normal card should expose only the actions needed for navigation and basic
maintenance.

Preferred pattern:

- primary interaction: click/tap card -> open project;
- secondary action: **Edit project details**;
- rare lifecycle actions: overflow menu or project workspace action area.

Archive/reactivate/delete-unused controls should not compete visually with
opening the project.

### 4.3 Project details editing

Replace the current conventional Project Edit form/modal with a
worksheet-style editor.

Suggested sheet structure:

- `Project Details`
- `Cost Codes`
- `Contacts`
- `Custom Fields` when custom-field support is implemented

The initial Project Details worksheet should cover the currently authoritative
editable project master fields, including where applicable:

- Project Code;
- Project Name;
- Status where lifecycle rules allow ordinary draft/master editing;
- Currency only where authoritative rules allow;
- Tax Treatment;
- Client;
- Location / Site Address;
- Project Manager;
- Billing Contact;
- Billing Email;
- Contract Value;
- Project Budget;
- other existing safe master-data fields.

Fields controlled by lifecycle, financial derivation, history, or source
authority remain protected.

### 4.4 Project Cost Codes

Cost Codes are a strong worksheet use case.

Support:

- row-oriented editing;
- Add Row;
- allowed row removal only under existing dependency/history rules;
- code;
- name;
- description;
- approved budget;
- forecast fields already supported by domain rules;
- inline validation;
- project-budget allocation validation;
- explicit Save/Apply.

### 4.5 Project custom columns / fields

The user requirement to keep supporting new columns and rows must not be
implemented as arbitrary SQL schema mutation from the browser.

Use two classes of columns:

1. **System columns**
   - owned by HydroQualiSense domain contracts;
   - mapped to explicit typed fields;
   - versioned and validated in source/database contracts.

2. **Custom columns**
   - company-defined metadata fields;
   - stored through a deliberate custom-field definition/value model;
   - typed;
   - permission-aware;
   - auditable where necessary;
   - supported by worksheet and export/import mapping.

Examples of future custom field definitions:

- Site Engineer — text;
- Contract Package — text;
- Mobilization Date — date;
- Internal Classification — select;
- External Reference — text.

Do not add physical database columns dynamically per company simply because a
user presses **Add Column**.

A separate implementation design must define the custom-field schema before
this capability becomes production-ready.

---

## 5. Supplier invoice extraction/review — revised UX contract

Invoice extraction review is a high-priority worksheet use case.

The current split-pane pattern should be replaced/refined so the source
document is visually clear and the extracted structured information is edited
below it in spreadsheet style.

### 5.1 Source first

The invoice image/PDF preview should appear at the top of the review workspace
with enough width and zoom/scroll support to inspect the source comfortably.

The source evidence remains:

- immutable/preserved according to current rules;
- visually distinct from editable extracted fields;
- never treated as a generated replacement.

### 5.2 Extracted data below

Below the source, show extracted information as worksheet-style sections.

Suggested structure:

#### Invoice Header

Columns/fields such as:

- Invoice Number;
- Invoice Date;
- Due Date;
- Currency;
- Purchase Order Number;
- Project / Reference;
- other currently supported extracted header fields.

#### Vendor

Structured vendor evidence such as:

- Name;
- Registered Name;
- Trade Name;
- TIN;
- Address;
- Email;
- Phone;
- tax-registration fields where supported.

Canonical Vendor resolution remains a controlled identity workflow, not an
ordinary free-form identity overwrite.

#### Line Items

Rows such as:

- Item / Line Number;
- Description;
- Quantity;
- Unit;
- Unit Price;
- Discount;
- Tax;
- Amount.

Support Add Row / Remove Row where the current review model permits.

#### Totals

Show source and calculated monetary facts with clear protection and
provenance.

### 5.3 Cell state vocabulary

Invoice review should visibly distinguish:

- extracted value;
- manually edited value;
- calculated value;
- unresolved value;
- validation warning/error;
- protected value;
- canonical linked identity;
- stale/conflicting value where relevant.

The original AI/extraction snapshot remains preserved according to current
correction/revert semantics.

### 5.4 Workflow boundaries remain explicit

Keep these as dedicated actions/panels rather than normal editable cells:

- canonical Vendor linking/creation;
- project allocation confirmation;
- Purchase Order matching;
- purchased-material intake;
- verify and create authoritative Expense;
- reopen/correction;
- settlement/payment;
- void/archive lifecycle.

---

## 6. Other high-value worksheet candidates

The following live modules should be assessed against this direction.

### 6.1 Procurement

#### RFQ editor

Strong worksheet candidate.

Use worksheet-style:

- header/master fields where safe;
- RFQ lines;
- quantities;
- units;
- cost codes;
- descriptions;
- dates/notes where appropriate.

Keep comparison, quotation selection, issue/finalization, cancellation, and
other consequential lifecycle actions purpose-built.

#### Purchase Order editor

Strong worksheet candidate.

Use worksheet-style:

- PO draft/master fields;
- PO lines;
- quantity;
- unit;
- unit price;
- cost code;
- delivery-related editable draft fields;
- total/read-only calculated values.

Keep approval/issue, receiving, close/cancel, invoice matching, and settlement
as dedicated workflows.

### 6.2 Client Billing

Client Invoice draft editing should use a worksheet model.

Suggested sections:

- Billing Details;
- Billing Lines;
- Totals.

Keep issue/submission/cancel/void lifecycle explicit.

### 6.3 Client Collections

The allocation table is already structurally close to the desired model.

Refine it into worksheet-like allocation editing:

- Billing;
- Date;
- Billed Amount;
- Previously Collected;
- Outstanding;
- Allocation.

Recording/finalizing the Collection remains explicit.

### 6.4 Expenses

The existing Expense form is a conventional form.

For direct editable draft Expenses, use a compact worksheet-style editor for
structured fields.

Supplier-derived Expenses and financial lifecycle/settlement fields remain
protected.

### 6.5 Workforce / Payroll

Strong candidates:

- Worker master data;
- Attendance;
- Time Entries;
- Project Assignments;
- permitted Payroll Profile input components.

Attendance is especially suitable for spreadsheet interaction:

- Worker;
- Status;
- Time In;
- Time Out;
- Overtime-related inputs where authoritative;
- Notes.

Payroll calculation, approvals, locks, finalized run results, settlement, and
history remain purpose-built/protected.

### 6.6 Project Materials / Equipment

Project Material and Project Equipment edit modals should move toward worksheet
editing for structured master/register fields.

Keep authoritative assignment, transfer, receiving, movement, lifecycle, and
history actions controlled.

### 6.7 Warehouse / Equipment master

Canonical item and equipment master maintenance can use worksheet editing,
especially for bulk setup.

Current stock balances and authoritative movement-derived state must remain
protected/read-only.

### 6.8 Vendor master

Vendor directory remains a browse/search register.

Vendor master maintenance can use a worksheet/bulk-edit surface for safe master
fields.

Supplier source evidence must not silently overwrite canonical identity.

---

## 7. Areas that should remain purpose-built

Do not apply spreadsheet editing merely for visual consistency.

Keep purpose-built UX for:

- Dashboard/Home;
- Project workspace overview;
- Cash & Banking settlement/reconciliation decisions;
- payment recording;
- financial correction/void/reversal;
- Payroll run calculation/approval/finalization;
- inventory movement execution;
- PO receiving;
- RFI and Submittal correspondence/review decisions;
- Document preview;
- template administration;
- official document generation review;
- Email/SMS composition and confirmation;
- Settings;
- RBAC/security administration;
- provider configuration;
- deployment configuration;
- lifecycle dialogs;
- audit/history viewers.

Read-only tables within these modules may still use dense register styling when
it improves scanning.

---

## 8. Add Row and Add Column rules

### 8.1 Add Row

Support Add Row continuously when a domain naturally owns repeated child data,
for example:

- Project Cost Codes;
- invoice lines;
- RFQ lines;
- PO lines;
- Client Billing lines;
- worker setup;
- attendance/time-entry rows where valid;
- material/equipment register rows where valid.

Every new row must still pass:

- permission checks;
- required-field validation;
- domain validation;
- duplicate/reference validation;
- parent/company binding;
- lifecycle rules;
- authoritative save behavior.

### 8.2 Add Column

Do not expose unrestricted Add Column until the custom-field architecture is
implemented.

Before that architecture exists:

- system columns remain fixed by domain contract;
- users may resize/hide/reorder supported columns if implemented;
- new business data fields require an intentional typed domain change.

After custom fields are implemented:

- Add Column means Add Custom Field;
- type must be selected;
- field identity must be stable;
- existing data must remain interpretable;
- exports/imports must retain field mapping;
- permissions and history requirements must be explicit.

---

## 9. Excel interoperability remains required

This UX correction does not weaken the existing real workbook round-trip
requirement.

For supported editable domains:

`App -> XLSX -> external edit -> upload -> validate/diff -> human review -> authoritative Apply -> App`

The in-app worksheet and external workbook should share a coherent field model.

However:

> **Excel import/export is a capability of the worksheet experience, not the definition of the worksheet experience.**

The user should not need to export a workbook merely to receive familiar
spreadsheet editing.

Import/export controls should move toward a compact worksheet toolbar/menu or
review dialog rather than dominating the main page as a large standalone
panel.

Existing safety rules remain:

- missing workbook rows do not imply deletion;
- protected fields remain protected;
- stale changes do not silently overwrite;
- server authority is rechecked on Apply;
- hidden metadata is comparison evidence, not authorization;
- permissions/RLS/lifecycle/history remain binding;
- no direct spreadsheet-to-database bypass.

---

## 10. Responsive behavior

Worksheet editing is desktop/laptop-first because that is where spreadsheet
interaction provides the most value.

For tablet/phone:

- do not force an unusably wide desktop spreadsheet;
- allow horizontal scrolling only inside the worksheet when necessary;
- preserve frozen identity context where practical;
- permit row-card or focused-cell editing fallback;
- keep primary actions reachable;
- preserve validation/error context;
- allow users to complete essential edits without desktop-only hover behavior.

Browse surfaces such as Project cards should remain strongly mobile-friendly.

---

## 11. Accessibility and interaction requirements

The worksheet model must preserve or improve:

- keyboard operation;
- visible focus;
- accessible labels;
- non-color-only validation/protection states;
- predictable tab order;
- screen-reader meaningful headers;
- accessible error association;
- minimum usable touch targets outside dense desktop-only cells;
- dialog/drawer focus management;
- readable contrast.

Do not sacrifice accessibility merely to look more like Excel.

---

## 12. Revised implementation sequence

This interaction correction should happen before continuing the remaining
Finance Excel rollout, because otherwise later domains will repeat the
incomplete register-plus-workbook pattern and require rework.

### Phase UX-W0 — documentation and live-surface inventory

- record this direction;
- synchronize roadmap/handoff/agent priority;
- identify all browse vs edit vs controlled-workflow surfaces;
- confirm exact current field/lifecycle contracts from live source.

### Phase UX-W1 — shared worksheet editing foundation

Implement reusable worksheet primitives without broadly migrating domains.

Required focus:

- editable/protected cell contract;
- keyboard navigation;
- paste/multi-cell paste;
- row operations;
- validation;
- dirty state;
- explicit Save/Apply;
- responsive fallback;
- tests for permissions/protection behavior.

Do not add arbitrary custom fields yet unless separately designed.

### Phase UX-W2 — Projects redesign

- card-first Projects portfolio;
- dominant project names;
- whole-card Project Workspace navigation;
- Edit Project Details action;
- Project Details worksheet;
- Cost Codes worksheet;
- preserve existing lifecycle and financial protections;
- optional compact list remains available.

### Phase UX-W3 — Supplier invoice review redesign

- source image/PDF on top;
- extracted data worksheet below;
- worksheet line items;
- clear extracted/manual/calculated/protected/error states;
- preserve Vendor/project/PO/verification/Expense authority workflows.

### Phase UX-W4 — high-value transaction editors

In bounded slices:

1. RFQ;
2. Purchase Order;
3. Client Billing;
4. Expenses.

### Phase UX-W5 — operational bulk-data editors

In bounded slices:

- Workers;
- Attendance;
- Time Entries;
- Project Assignments;
- Project Materials;
- Project Equipment;
- Warehouse item master;
- Equipment master;
- Vendor master.

### Phase UX-W6 — resume remaining Finance Excel rollout

After the interaction grammar is proven:

- remaining Client Receivables work;
- Cash & Banking/reconciliation presentation where appropriate;
- preserve controlled settlement/reconciliation actions.

### Phase UX-W7 — custom-field architecture

Only after an explicit schema/security/history design:

- company-defined field definitions;
- typed custom values;
- custom worksheet columns;
- export/import mapping;
- permissions/history behavior;
- migration/runtime validation.

### Phase UX-W8 — certification

Certify:

- desktop/laptop worksheet usability;
- mobile fallback;
- keyboard-only operation;
- copy/paste from Excel;
- multi-row editing;
- XLSX round trip;
- conflict handling;
- protected-field enforcement;
- no lifecycle/financial bypass;
- relevant browser regression evidence.

---

## 13. Acceptance criteria

This direction is successfully implemented only when all applicable criteria
are true.

### Projects

- Project names are visually dominant on the main Projects page.
- Each project has a large clickable card/rectangle with useful context.
- Opening a project is the obvious primary interaction.
- Editing project details opens a worksheet-style editor.
- Cost Codes support natural row editing.
- Lifecycle and derived financial fields remain protected.

### Supplier invoice review

- Source invoice image/PDF is visible above the edit area.
- Extracted header/vendor/line/totals data is presented in worksheet style.
- Users can correct permitted fields and rows with spreadsheet-familiar
  interaction.
- AI/source/manual/protected/error states are distinguishable.
- Verification and financial authority remain deliberate workflows.

### Shared worksheet behavior

- keyboard navigation works;
- editable vs protected cells are clear;
- paste from spreadsheet is supported where applicable;
- row addition works where authorized;
- validation errors are local and understandable;
- unsaved changes are clear;
- Save/Apply remains explicit;
- stale/conflicting data cannot silently overwrite current authoritative state.

### Cross-domain

- browse pages are not converted to spreadsheets without a real workflow reason;
- sensitive lifecycle and finance actions are not ordinary cells;
- external `.xlsx` round trip remains available in supported domains;
- mobile/responsive workflows remain usable;
- no source-of-truth, permission, history, currency, or company-isolation rule is
  weakened.

---

## 14. Explicit non-goals

This direction does not authorize:

- cloning Microsoft Excel branding or ribbon UI;
- formulas as a general-purpose scripting engine;
- arbitrary client-authored SQL/database columns;
- spreadsheet cells that directly mutate finalized financial truth;
- bypassing review/approval/lifecycle operations;
- replacing source documents with extracted tables;
- turning Documents, Settings, Email/SMS, security, or lifecycle dialogs into
  spreadsheets;
- automatic deletion because a row disappeared;
- silent overwrite of concurrent app changes;
- broad database redesign merely to imitate Excel;
- weakening mobile usability for desktop density;
- weakening accessibility.

---

## 15. Relationship to existing plans

The 2026-09-18 Excel-native design remains valid for:

- workbook interchange;
- validation/diff/apply;
- version/conflict protection;
- domain authority;
- controlled rollout;
- protected fields;
- financial/security invariants.

Where that design can be read as making the main operational register itself
the primary Excel-like experience, this document refines it:

> **The spreadsheet-familiar experience belongs primarily in edit/create/correction/bulk-entry surfaces. Browse surfaces should use the best visual hierarchy for the business object.**

The already implemented Procurement, Projects, and Expenses workbook features
are foundations, not evidence that those domains have reached the final desired
in-app worksheet UX.

Future implementation prompts must explicitly read both documents and treat
this 2026-09-20 interaction-direction correction as the later approved UX
decision.
