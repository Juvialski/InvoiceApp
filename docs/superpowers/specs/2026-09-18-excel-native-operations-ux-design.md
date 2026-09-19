# HydroQualiSense Excel-Native Operations UX

> **APPROVED MAJOR UX DIRECTION — PROFESSIONALIZATION COMPLETE; IMPLEMENTATION STARTS AFTER EXCEL PHASE 0/READINESS**

Status: **Approved; Phase 0/readiness and the bounded Procurement pilot are implemented in the current feature branch; app-wide Excel capability is not claimed**
Repository: `Juvialski/InvoiceApp`
Product: HydroQualiSense
Approved direction: Make applicable operational work substantially more familiar to experienced Excel users without weakening HydroQualiSense business rules or turning the product into a generic spreadsheet.

This document is an authoritative future design contract. It does not claim that the current Projects, Procurement, Finance, Inventory, Workforce, Payroll, Documents, or Communications registers already satisfy this specification. Existing register/table work remains the current application behavior, and the Slice 5 Subcontract presentation extraction is repository architecture work only. No Excel-native grid, workbook import/export, reverse-upload, schema engine, migration, dependency, or prototype is introduced by this document.

The live repository, `AGENTS.md`, the active roadmap, the current handoff, and later approved implementation decisions remain authoritative when this document is eventually executed. Future work must start from live repository state rather than treating this document's examples or candidate classifications as a frozen code snapshot.

## 0. Phase 0/readiness record — 2026-09-19

The first implementation run audited the live register and mutation boundaries and recorded these rollout classifications:

| Domain | Classification | Boundary decision |
| --- | --- | --- |
| Procurement | Hybrid | RFQ and Purchase Order registers use dense sheet-like scanning; comparison, detail editing, receiving, approval, issue, close, cancellation, and quotation conversion remain dedicated workflows. |
| Projects / Engineering | Hybrid | Project and cost registers benefit from a future grid; engineering documents, site records, and lifecycle actions remain purpose-built. |
| Expenses / Finance | Hybrid | Registers and ledgers benefit from scanning; verification, correction, reconciliation, settlement, and approval remain workflow-controlled. |
| Inventory / Warehouse | Hybrid | Stock and movement registers benefit from a grid; receiving, issue/return, allocation, adjustment, and movement history remain authoritative workflows. |
| Equipment | Hybrid | The equipment register is grid-suitable; assignment, transfer, return, and lifecycle history remain controlled actions. |
| Workforce / Payroll | Hybrid | Worker, assignment, time, and permitted input registers may use a grid; calculation, approval, settlement, privacy, and history remain dedicated. |
| Documents / communication registers | Hybrid | Document and delivery history can use registers; composition, preview, template administration, provider actions, and confirmation remain purpose-built. |

The Procurement pilot deliberately supports update-only editing of existing draft RFQs and Purchase Orders. Its workbook shape is `RFQs`, `RFQ Lines`, `Purchase Orders`, `PO Lines`, and hidden `_HydroQualiSense` synchronization metadata. Stable record/line IDs, `updatedAt` where present, and a deterministic exported-state fingerprint are comparison evidence only; they are not authorization credentials.

The pilot's Apply strategy is: fetch current records when the host provides the refresh hook, parse and validate the workbook, compare against current state, require human review and explicit confirmation, then call the existing parent-owned `onSaveRFQ`/`onSavePO` callbacks. Status, approval/issue/close/cancel history, quotation selection, receiving/settlement evidence, committed totals, cost-code identity, audit metadata, missing-row deletion, and new-record creation remain protected or deferred. The existing authoritative save paths remain responsible for permission, lifecycle, history, and derived-total enforcement. No migration or spreadsheet dependency was added.

This run does not claim atomic cross-session optimistic concurrency: the current RFQ/PO save RPC contracts do not accept a version precondition. The pilot fails stale state at the fresh review/apply check and refuses the proposal when the current fingerprint differs; a future versioned mutation contract is required if the domain needs an atomic compare-and-apply guarantee.

---

## 1. Problem statement

HydroQualiSense is intentionally feature-rich, but at least one project manager has reported that the application is confusing to operate. Many engineers and project managers already perform operational work in Excel-style workflows and expect familiar patterns:

- rows and columns;
- registers;
- filters and sorting;
- keyboard navigation;
- copying and pasting;
- bulk editing;
- worksheets;
- exports; and
- offline spreadsheet work.

The future redesign should reduce the learning curve by making applicable operational surfaces feel familiar to experienced spreadsheet users. The objective is not to imitate Microsoft Excel cosmetically. The objective is:

**spreadsheet-native operational interaction + HydroQualiSense-controlled business semantics**

HydroQualiSense remains the system of record. Excel becomes a supported operational interchange and editing interface where a domain can safely support it. A familiar interaction model must not turn a workbook into an alternate database, an authorization bypass, or an unreviewed financial posting tool.

## 2. Core design principle

The governing interaction model is:

**Sheet for everyday register work -> detail panel/editor for complex record work -> controlled workflow for consequential actions.**

Spreadsheet interaction should improve scanning, filtering, sorting, routine edits, bulk edits, copy/paste, offline editing, importing, exporting, and familiarity.

It must not weaken:

- authorization or effective permission resolution;
- RLS and company isolation;
- domain validation;
- approval workflows;
- financial semantics and currency safeguards;
- record history and auditability;
- immutable records and snapshots;
- source-of-truth ownership;
- provider boundaries;
- concurrency safety; or
- explicit human confirmation for consequential actions.

An Excel-like UI is an interaction model, not a bypass around HydroQualiSense domain rules.

## 3. Future surface classification

Before implementation, authenticated workflows must be audited and classified as `Sheet-native`, `Hybrid`, or `Purpose-built`. A classification is a design hypothesis, not authorization to change a surface.

### A. Sheet-native

The primary working surface should be a spreadsheet/register when the domain's ordinary work is primarily repeated, row-oriented, and safe to scan or edit under controlled rules. Likely candidates include:

- Projects register;
- RFQ register;
- Purchase Order register;
- Subcontract register;
- Expenses and supplier payables;
- Client invoices and receivables;
- Cash & Banking transaction ledger;
- inventory stock register;
- inventory movement history;
- project material allocation;
- equipment register;
- workforce directory;
- project worker assignments;
- attendance;
- time entries;
- payroll run lines where permitted;
- project cost codes;
- project budgets;
- material requirements;
- document registers; and
- communication/delivery history where a register materially helps the task.

### B. Hybrid

A register is useful for overview and routine work, but complex actions stay in dedicated panels/editors. Likely examples include:

- RFQ register plus comparison workspace;
- Purchase Order register plus PO editor and receiving workflow;
- Subcontract register plus Claims/Variations workflow;
- Expense register plus verification/payment workflow;
- Cash ledger plus reconciliation workspace;
- payroll register plus approval/calculation workflow; and
- inventory register plus receiving/allocation workflows.

### C. Purpose-built UI

Keep task-specific interaction rather than forcing spreadsheet behavior onto work that is not safely or usefully row-oriented. Likely examples include:

- authentication;
- dashboards;
- application settings;
- access/RBAC configuration;
- Email/SMS composition;
- document preview;
- template design/configuration;
- document verification;
- complex approval dialogs;
- destructive and corrective workflows;
- Assistant review/confirmation; and
- public pages.

The future redesign is explicitly **not “make every page look like Excel.”** A purpose-built surface is a valid outcome of the audit.

## 4. Desktop, tablet, and mobile model

The future Excel-native experience primarily optimizes desktop/laptop operational work because that is where dense registers, keyboard interaction, and offline workbook interchange provide the most value. Existing mobile usability must not be sacrificed solely to achieve desktop spreadsheet familiarity.

### Desktop/laptop

- dense but readable grid;
- sticky headers;
- frozen identity columns where useful;
- horizontal scrolling only where justified by the domain;
- keyboard movement and selection;
- column controls;
- spreadsheet-style filtering;
- controlled copy/paste;
- detail drawer or panel; and
- clear workflow actions outside or alongside the grid.

### Tablet

- reduced visible columns;
- priority-column views;
- touch-friendly controls;
- optional horizontal grid; and
- a usable detail panel when the grid is not the best touch interaction.

### Mobile

- compact row/card representation;
- search and filters;
- task-focused detail screen;
- safe forms and actions;
- no requirement to reproduce desktop multi-cell spreadsheet interaction; and
- no requirement to expose every desktop column simultaneously.

Responsive behavior must reorganize the workflow where necessary. It must not merely shrink a desktop grid until controls become unusable.

## 5. Shared `OperationsGrid` concept

Future work should avoid independently reinventing tables for Projects, Procurement, Finance, Inventory, Payroll, Documents, and other register-heavy areas. A reusable conceptual component such as `OperationsGrid` should be evaluated, with final naming determined from live repository conventions.

Capabilities to evaluate include:

- sticky headers;
- frozen or pinned columns;
- resizable columns;
- reorderable columns;
- hide/show columns;
- sortable columns;
- multi-column sorting where useful;
- Excel-style filters;
- search;
- row selection;
- keyboard navigation;
- copy;
- paste where permitted;
- multi-cell selection where safe;
- numeric, date, currency, quantity, and percentage formatting;
- totals/footer rows;
- status cells;
- inline validation;
- compact, default, and comfortable density;
- saved user views;
- current-filter export;
- controlled row actions;
- detail drawer integration;
- accessibility; and
- responsive fallback.

This documentation phase does not commit HydroQualiSense to a third-party grid library. The future implementation phase must evaluate whether the current stack plus a focused grid is sufficient or whether a mature grid package is justified. The existing `xlsx` dependency, if still present and suitable at implementation time, may be evaluated or reused for workbook handling, but this phase changes no dependencies.

## 6. Shared sheet schema — critical architecture requirement

The React grid, Excel export, and Excel import must not define their schemas independently. They should be driven by one domain-aware shared contract conceptually similar to `OperationsSheetSchema`; the exact API is deferred until the first bounded implementation phase.

The shared schema should be capable of describing:

- stable field identity;
- human display label;
- field type;
- formatting;
- currency behavior;
- date behavior;
- required/optional state;
- read-only/editable state;
- domain validation;
- permission requirements;
- visibility;
- filtering;
- sorting;
- export mapping;
- import mapping;
- reference lookup;
- enum/dropdown options;
- protected and derived values;
- conflict behavior;
- create/update behavior; and
- archival/deactivation behavior.

The intended relationship is:

```text
OperationsSheetSchema
  -> application grid
  -> .xlsx export
  -> .xlsx import parser/validator
  -> review/diff workflow
```

This shared contract is necessary to prevent the UI, export file, reverse-import rules, and review experience from drifting apart.

## 7. Excel export is a real product contract

Every workspace eventually classified as Excel-native must support actual `.xlsx` output. CSV may remain an optional interoperability format where useful, but CSV is not equivalent to the primary Excel contract and cannot replace the `.xlsx` round-trip requirement.

Two export intentions must remain distinct.

### A. Report/current-view export

Purpose:

- sharing;
- reporting;
- current filters;
- current column selection;
- management review; and
- ad hoc analysis.

This workbook may prioritize presentation and does not necessarily imply that it can be uploaded back for editing.

### B. `Edit in Excel` round-trip export

Purpose:

- edit supported records externally;
- perform bulk updates;
- add supported records; and
- later upload the workbook back into HydroQualiSense.

This workbook must carry a controlled schema and synchronization metadata. The UI must make the difference between a report and an editable synchronization workbook clear.

## 8. Mandatory Excel round-trip capability

Any HydroQualiSense workspace presented as an Excel-native editable operational sheet must support a safe round trip where the domain allows editing:

```text
HydroQualiSense
  -> .xlsx
  -> external edit
  -> upload
  -> validate
  -> compare
  -> human review
  -> apply
  -> HydroQualiSense
```

Upload must never immediately overwrite the database. The future import pipeline is:

1. Upload.
2. Parse.
3. Identify workbook and schema.
4. Validate workbook compatibility.
5. Validate rows and cells.
6. Resolve references.
7. Compare against current HydroQualiSense state.
8. Detect conflicts.
9. Present additions, changes, errors, and conflicts.
10. Obtain human review and confirmation.
11. Apply permitted changes through authoritative domain paths.
12. Record audit/provenance as required.
13. Refresh authoritative UI state.

There is no silent database overwrite from file upload.

## 9. Workbook identity and metadata

Visible labels such as PO number, project code, employee name, supplier name, or document reference are not sufficient row identity. Round-trip workbooks need stable synchronization data.

Possible approaches include hidden columns or a hidden metadata sheet such as `_HydroQualiSense`. The future design must evaluate which metadata is visible, protected, signed, or omitted for each domain. Candidate metadata includes:

- workbook format/schema version;
- entity/workspace type;
- originating application/product version where relevant;
- export timestamp;
- company/deployment identity where safe;
- project or context scope;
- stable record IDs;
- record version or last-updated token; and
- allowed operations.

Relationship identity may also be required for line items, claims, variations, allocations, assignments, or other child records. Exact cryptographic/signing strategy is deferred to implementation and security design. Metadata must not expose secrets.

## 10. Concurrency and stale-workbook protection

The stale-workbook problem must be treated as a first-class design requirement.

Example:

1. A project manager exports on Monday.
2. Finance changes the same record on Tuesday.
3. The project manager uploads the old workbook on Wednesday.

The Wednesday upload must not silently overwrite Tuesday's newer data. Exported row/version information must be sufficient to detect stale records, subject to the domain's concurrency model.

Import review should be able to classify rows as:

- unchanged since export;
- changed only in the uploaded workbook;
- changed only in HydroQualiSense;
- changed in both;
- deleted or archived since export;
- no longer permitted; or
- relationship/reference changed.

Conflicting edits require explicit review. There is no last-write-wins behavior merely because a workbook was uploaded.

## 11. New rows

Where a domain allows user creation, a workbook may support rows without an existing stable record identity as proposed creations. Candidate examples may eventually include workers, material requirements, certain inventory master records, project cost rows, or other domain-approved records.

Proposed creations still require required-field validation, duplicate detection, reference resolution, permission checks, domain validation, and all applicable financial/security rules. A missing record ID is not proof that a row should be created. The domain schema determines whether creation from Excel is supported.

## 12. Deletion, archive, and deactivate rules

Never interpret:

```text
row missing from uploaded workbook
```

as:

```text
delete this database record
```

Absence from a workbook must not imply deletion. Where lifecycle changes are supported, the workbook must use an explicit controlled action concept such as `Action = Update / Add / Archive / Deactivate`, with actual options determined per domain.

Financial and history-bearing records may prohibit deletion entirely. Existing lifecycle and history semantics always win over spreadsheet convenience.

## 13. Protected and derived fields

Future schemas must classify fields rather than treating every visible cell as editable. Candidate categories are:

- normal editable;
- conditionally editable;
- reference editable;
- derived;
- calculated;
- workflow-controlled;
- approval-controlled;
- system metadata;
- immutable historical; and
- audit-only.

Examples of protected behavior:

### Purchase Orders

Fields such as description, line quantity, unit, requested delivery, or supplier may be editable before a domain-defined lifecycle lock. Issued lifecycle state, received quantity where receiving is authoritative, payment/settlement state, approval history, and committed-cost history are not freely editable through spreadsheet overwrite.

### Payroll

External editing must not directly overwrite calculated gross, deductions, net pay, approval state, settlement evidence, or historical payroll results. A payroll domain may expose supported source-input fields, but authoritative results must be recalculated through the existing payroll engine and approval boundaries.

### Cash & Banking

Workbook editing cannot manufacture confirmed settlement evidence by changing a `Paid` or `Matched` cell.

### Inventory

Inventory balances must continue to derive from authoritative inventory movements. A workbook cannot overwrite balance history directly.

### Project financials

Calculated Actual Cost, Committed Cost, receivable/payable status, and other source-of-truth financial fields remain governed by their existing authorities.

## 14. Permanent financial, security, and history invariants

The future Excel-native redesign must preserve established HydroQualiSense invariants, including:

- one deployment -> one client company;
- company isolation;
- RLS;
- effective permission/RBAC rules;
- source-document ownership;
- financial authority boundaries;
- Supplier Invoice evidence versus authoritative linked Expense payable/cost truth;
- Client Invoice/Collection receivable truth versus Cash & Banking settlement evidence;
- Actual Cost versus Committed Cost;
- `projects.contract_value` versus `projects.project_budget`;
- original currencies;
- no silent mixed-currency aggregation;
- unknown monetary values never silently becoming zero;
- payroll calculation freshness;
- payroll approval authority;
- payroll settlement history;
- Purchase Order receiving/close rules;
- inventory movement/allocation history;
- immutable issued/finalized documents;
- append-only audit/history where required; and
- consequential Assistant actions retaining `prepare -> review -> human confirm -> execute`.

Spreadsheet UX is never authorization simplification.

## 15. Reference data and Excel dropdowns

Exports should be genuinely usable workbooks rather than raw database dumps. Where technically practical and safe, controlled workbook editing may use:

- dropdown lists;
- validation lists;
- proper date cells;
- proper numeric cells;
- currency formats;
- percentage formats;
- reference sheets;
- locked/protected calculated columns;
- instructions; and
- required-field indicators.

Candidate references include project -> project reference list, supplier -> supplier list, status -> domain-supported values, employment type -> controlled values, unit -> controlled/validated unit, currency -> supported currency, and date -> actual Excel date type.

Re-upload reference resolution must use stable domain identity and server-side authorization, not merely trust a display string.

## 16. Multi-sheet workbook design

Some domains should export true workbooks rather than giant flattened sheets. Candidate structures include:

### Procurement

- RFQs;
- Quotations;
- Purchase Orders;
- PO Lines;
- Subcontracts;
- Claims;
- Variations;
- reference sheets where necessary; and
- hidden synchronization metadata.

### Inventory

- Stock;
- Movements;
- Project Allocations;
- Reference Data; and
- metadata.

### Workforce and Payroll

- Workers;
- Project Assignments;
- Attendance;
- Time Entries;
- payroll input sheets where allowed; and
- metadata.

These are candidate shapes, not a locked workbook contract. Workbook structure must follow domain semantics and transaction boundaries discovered during implementation.

## 17. Import review UX

The future product needs a dedicated import-review experience rather than silent upload. A review summary should be able to show:

- additions;
- modifications;
- unchanged rows;
- validation errors;
- stale conflicts;
- unauthorized edits;
- unsupported changes; and
- unresolved references.

Users must inspect differences before applying. A future diff view may resemble:

| Field | Current HydroQualiSense | Excel | Result |
| --- | --- | --- | --- |
| Quantity | 120 | 150 | Change |
| Unit | pcs | pcs | Unchanged |
| Project | P-014 | invalid reference | Error |

The exact component design is deferred. Human confirmation before applying imported changes is mandatory.

## 18. Partial application policy

The implementation phase must make a domain-specific decision about whether an import is:

- all-or-nothing;
- valid rows only;
- selectable changes; or
- transaction-group based.

No single policy is assumed to work for every module. A simple master-data import may permit selected valid rows. A financially linked multi-row operation may require atomic application. Each domain's transaction boundary must be documented before implementation.

## 19. Import audit and provenance

Reverse-imported changes must not become invisible edits. Where required by the existing history model, the system should retain provenance that a change originated through an Excel import. Future implementation should consider recording:

- upload/import event;
- actor;
- timestamp;
- original file identity or hash where appropriate;
- accepted/rejected counts;
- changed records;
- conflict decisions; and
- resulting lifecycle commands.

The system must not store unnecessary sensitive spreadsheet contents merely for convenience. Provenance must complement, not replace, existing domain audit/history.

## 20. Workbook security

Future implementation must assess spreadsheet-specific risks, including:

- formula injection;
- malformed files;
- oversized workbooks;
- unexpected sheets;
- hidden or malicious content;
- unsupported macros;
- external links;
- corrupted ZIP/XML structures;
- schema tampering;
- unauthorized record IDs;
- cross-company IDs;
- stale IDs;
- duplicate rows; and
- formulas where literal values are expected.

Round-trip import must never trust hidden metadata merely because HydroQualiSense originally exported the workbook. Server/domain authorization remains authoritative. Parser limits, content validation, safe formula handling, and error reporting must be designed before accepting real uploads.

## 21. No generic spreadsheet-to-database writer

Do not implement a universal mechanism that maps arbitrary Excel cells directly to arbitrary database columns.

Excel import must pass through the same domain-aware command and mutation boundaries used by the application. The intended architecture is:

```text
Workbook
  -> parse
  -> domain-aware proposed changes
  -> permission/validation/conflict checks
  -> review
  -> existing authoritative mutation/domain layer
```

It must never be:

```text
Workbook cell
  -> direct SQL update
```

This prohibition is especially important for financial records, payroll, inventory, procurement lifecycle, approvals, settlement, and historical records.

## 22. Detail drawer pattern

Selecting a spreadsheet row should generally preserve the user's register context. Where appropriate, open a right-side detail drawer/panel containing:

- detailed record information;
- relationships;
- documents;
- history;
- approvals;
- workflow actions; and
- advanced fields.

This reduces the current pattern of `register -> navigate/open -> close -> relocate previous row`. Complex domain editors may still use full dialogs/workspaces when justified. The drawer is a future interaction pattern, not a requirement to remove existing deep links or editors.

## 23. Workbook-like local navigation

For domains with multiple related registers, evaluate workbook-style local tabs. Candidate examples are:

### Procurement

`RFQs | Quotations | Purchase Orders | Receipts | Subcontracts | Claims | Variations`

### Project cost/control

`Budget | Commitments | Expenses | Payroll | Materials | Equipment | Billing`

This must not destroy canonical application navigation or deep links. The intention is a familiar local mental model, not route breakage.

## 24. Information density

Spreadsheet-native surfaces should have a more useful desktop density:

- more useful rows visible simultaneously;
- reduced decorative whitespace;
- fewer oversized cards;
- fewer giant page headings;
- lighter structural borders;
- tabular numbers;
- right-aligned numeric columns;
- familiar total rows;
- stable column headers;
- compact status presentation;
- clear selected-cell/row state; and
- restrained use of cards inside working registers.

Do not copy Microsoft Excel branding. HydroQualiSense retains its own product identity; familiarity comes from interaction patterns and information structure.

## 25. Excel interoperability as migration and onboarding strategy

Excel round-trip support is also an adoption strategy. Users should not feel that adopting HydroQualiSense requires abandoning existing spreadsheet habits immediately. Where safe, future workflows should support:

- initial Excel import;
- ongoing Excel export;
- offline edits;
- controlled reverse upload;
- copy/paste; and
- bulk entry.

HydroQualiSense adds the shared source of truth, permission control, validation, linked operational data, workflows, auditability, history, and automation. This interoperability is a major product advantage rather than a secondary export feature.

## 26. Future implementation phases

This is provisional planning, not implementation authorization.

### Phase 0 — Design and inventory

- audit all authenticated screens;
- classify Sheet-native, Hybrid, or Purpose-built;
- finalize interaction grammar;
- finalize schema architecture;
- define protected-field rules; and
- identify affected domain mutation boundaries.

### Phase 1 — Shared OperationsGrid and workbook engine

Build and certify shared primitives for the grid foundation, sheet schema, column behavior, selection, filters, keyboard behavior, density, export framework, controlled import parser, metadata/versioning, validation, compare/review engine, and conflict detection.

Begin this phase only after Repository & Architecture Professionalization is explicitly complete and the subsequent Excel Phase 0/readiness gate confirms the shared architecture boundary. The user wants the repository fully organized before new Excel-native feature work is added.

### Phase 2 — Procurement pilot

Procurement is the preferred pilot because register decomposition is already underway. Candidate surfaces are the RFQ and Purchase Order registers. Subcontracts may be deferred until the pattern is proven if lifecycle complexity makes them a poor first importer.

The pilot must prove both the Excel-native web interaction and an actual `.xlsx` round trip.

### Phase 3 — Projects and project controls

Candidate areas include Projects, budget, cost codes, materials, commitments, and client billing.

### Phase 4 — Expenses and Finance

Candidate areas include Expenses, supplier payables, client receivables, Cash & Banking registers, and reconciliation overview. Financial authority remains workflow-controlled.

### Phase 5 — Inventory and Equipment

Candidate areas include stock, movement ledger, project allocations, equipment register, and equipment assignments. Balance history remains movement-derived.

### Phase 6 — Workforce and Payroll

Candidate areas include workers, assignments, attendance, time entries, and payroll run lines. This phase requires especially strict calculation and approval protection.

### Phase 7 — Secondary registers

Possible areas include document register, communication delivery history, and other register-heavy workflows identified in Phase 0.

### Phase 8 — Round-trip and usability certification

Perform full usability and data-safety certification across each workspace that is declared Excel-native.

## 27. Future acceptance criteria

Every workspace eventually declared Excel-native must satisfy the applicable criteria below.

### Web grid

- familiar spreadsheet-like scanning;
- useful information density;
- sorting and filtering;
- keyboard usability on desktop where appropriate;
- stable responsive fallback;
- no loss of actions or workflows; and
- permissions preserved.

### Excel export

- produces a real `.xlsx`;
- uses correct field types;
- preserves currency/date/numeric semantics;
- includes required synchronization metadata for edit-mode export;
- does not leak secrets; and
- opens correctly in supported Excel-compatible software.

### Reverse import

- accepts only supported workbooks;
- validates schema/version;
- validates references;
- detects duplicates;
- detects invalid rows;
- detects stale/concurrent edits;
- rejects cross-company and unauthorized identities;
- creates a proposed-change set; and
- never immediately mutates authoritative data.

### Review

- clearly shows additions, changes, errors, and conflicts;
- distinguishes current app data from uploaded Excel values; and
- requires explicit user confirmation.

### Apply

- uses authoritative domain mutation paths;
- preserves lifecycle rules;
- preserves permissions;
- preserves history;
- preserves calculations;
- preserves currency safeguards; and
- writes provenance where required.

### Full round-trip certification

At minimum, test:

```text
App -> XLSX -> modify externally -> upload -> diff -> approve -> apply -> App -> re-export
```

Verify that intended editable fields changed, protected fields did not change, derived fields recalculated correctly, references remained correct, stale workbook conflicts were caught, permissions were enforced, financial semantics remained correct, and re-export matches authoritative state.

## 28. Usability testing

Future work must not certify success only through screenshots or automated DOM tests. It should include realistic task-based usability checks with engineering and project-manager participants or representative task scripts.

Representative tasks include:

- find a PO;
- filter by project;
- identify outstanding delivery;
- edit several allowed rows;
- add several allowed records;
- copy values from Excel;
- export a register;
- modify it externally;
- upload it;
- understand import review;
- resolve a conflict;
- apply valid changes; and
- return to the same register context.

The product goal is reduced training burden and faster routine work, not visual imitation of another product.

## 29. Documentation status and sequencing

The Excel-Native Operations UX direction is approved. Implementation has
**not** started. RI-1, RI-2, and RI-3 are complete, and the Repository &
Architecture Professionalization program is explicitly complete for the
current repository boundary. The next implementation run is Excel Phase
0/readiness, followed by a bounded shared foundation only after the live
architecture and readiness evidence support it.

By the latest explicit 2026-09-19 reprioritization, Excel must start from the
completed professionalized repository boundary recorded in
`docs/REPOSITORY_ARCHITECTURE_TRIAGE.md` and
`docs/REPOSITORY_EVIDENCE_POLICY.md`. Future implementation must still start
from live repository state and must not infer Excel capability from this design
document.

This document is linked for discoverability from the active roadmap and current handoff. It is not a competing roadmap and does not mark any current capability as available or certified.

## 30. Fresh-chat implementation handoff

Before implementing any Excel-native phase, a fresh ChatGPT/Codex session must:

1. Read live `AGENTS.md`.
2. Read `docs/AGENT_EXECUTION_EFFICIENCY.md`.
3. Read the live active roadmap.
4. Read the live current handoff.
5. Read this Excel-Native Operations UX design.
6. Inspect current `main`.
7. Inspect the architecture produced by Repository & Architecture Professionalization.
8. Inspect current register/table components.
9. Inspect existing Excel/XLSX import/export utilities.
10. Inspect existing financial, security, permission, concurrency, and history invariants.
11. Choose one bounded rollout phase.
12. Preserve domain authorities.
13. Implement focused -> affected validation.
14. Use DB/Docker validation only when the actual phase crosses DB/security/integrity contracts.
15. Push and open a PR without Codex self-merging.

The fresh session must not:

- redesign every screen at once;
- treat every visible field as editable;
- bypass domain mutations;
- map spreadsheets directly to database columns;
- silently overwrite stale data;
- interpret absent rows as deletions;
- weaken financial semantics;
- weaken permissions;
- make desktop spreadsheet behavior mandatory on mobile; or
- confuse `.xlsx` export with true bidirectional round-trip support.

The future agent should choose one bounded domain, record its transaction boundary and protected fields, prove review-before-apply behavior, and leave unsupported or unavailable capabilities truthful.
