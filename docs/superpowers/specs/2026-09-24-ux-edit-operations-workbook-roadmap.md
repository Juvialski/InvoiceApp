# UX-EDIT-1 and Operations Workbook — Direction

Status: **UX-EDIT-1A IMPLEMENTED FOR RECORDED SCOPE / WB-1 IMPLEMENTED FOR RECORDED SCOPE / WB-2+ NOT STARTED**
Date recorded: **2026-09-24**  
Repository: `Juvialski/InvoiceApp`

WB-1 implementation closeout: **2026-09-27**

This document records the UX-EDIT/WB direction and acceptance boundaries.
UX-EDIT-1A and WB-1 are implemented for their recorded scopes. WB-2 and later
remain separate planned phases. WB-1 does not change database, security,
financial, history, lifecycle, approval, or permission authority.

It extends, rather than replaces:

- `docs/superpowers/specs/2026-09-18-excel-native-operations-ux-design.md`;
- `docs/superpowers/specs/2026-09-20-selective-workbook-editing-ux-direction.md`;
- the hardening-first / net-new-feature freeze recorded in `AGENTS.md` and the
  active roadmap.

## Governing interaction direction

**BROWSE VISUALLY -> EDIT LIKE A SPREADSHEET WHERE APPROPRIATE -> EXECUTE SENSITIVE WORKFLOWS DELIBERATELY**

Normal pages should remain strong visual browsing and navigation surfaces.
Spreadsheet-style editing is appropriate where users are working with
structured operational data, but spreadsheet appearance must never imply that
every field or lifecycle transition is freely editable.

The normal state should be visually quiet. Exceptions, conflicts, validation
failures, stale data, unresolved source evidence, and other states that require
attention should be prominent.

## UX-EDIT-1 — lighter direct worksheet editing

Future worksheet-backed editing should improve speed and discoverability without
weakening domain authority.

Planned direction:

- make editable worksheet cells enter edit mode with a single click/tap where
  the field is safe for direct editing;
- keep keyboard navigation efficient and predictable for dense data entry;
- strengthen Excel-like visual cues so editable cells look editable without
  requiring users to discover a double-click convention;
- use a clearer white/grid-oriented worksheet treatment where appropriate;
- improve density and use of available desktop/laptop screen space without
  making touch layouts unusable;
- keep similar worksheet-backed domains behaviorally consistent;
- keep ordinary read-only/protected state visually quiet while making blocked,
  invalid, conflicted, stale, or exceptional state obvious;
- preserve source-aware and side-by-side invoice review where comparing original
  evidence with extracted/editable data improves verification;
- retain embedded worksheet editors on normal domain pages where they remain the
  best local editing surface.

Consequential actions remain deliberate controls outside ordinary cell editing.
This includes, as applicable, verification, approval, posting, issue/finalize,
payment, settlement/reconciliation, void/reverse, receipt/movement, payroll
approval/finalization, lifecycle transitions, identity resolution, and other
operations that create authoritative or historical effects.

UX-EDIT-1 is a usability refinement of the existing selective-workbook model.
It is not authorization cleanup and is not a rewrite of financial authority.

## Operations Workbook — separate full-page workspace

A future **Operations Workbook** may provide one dedicated, high-density,
Excel-like workspace across supported operational domains. This is separate
from normal card/list/detail pages rather than a requirement to make every page
look like Excel.

Planned characteristics:

- a separate full-page workbook workspace;
- white, grid-oriented working canvas;
- sheet tabs for supported domains the current user is authorized to access;
- high-density review and editing for suitable structured records;
- normal visual/card/list pages remain available for browsing, navigation, and
  workflow context;
- existing embedded worksheet editors remain useful where local editing is
  appropriate;
- protected, calculated, historical, immutable, lifecycle-controlled, and
  otherwise non-editable values remain controlled;
- permissions and domain authority continue to come from the existing
  application/RBAC/domain model, never from spreadsheet appearance.

The workbook is an alternate operational surface over existing domain
contracts, not a new source of financial or historical truth.

## Proposed workbook roadmap

### WB-1 — Unified Workbook Schema & Shell

Plan a shared workbook foundation before adding many domains:

- common workbook and sheet model;
- sheet navigation and ordering;
- field metadata, including type, display, editability, validation, protection,
  and authority semantics;
- shared workbook shell;
- common selection/editing behavior;
- consistent safety semantics for protected and consequential fields/actions.

WB-1 should define how a sheet delegates persistence to existing domain
services rather than creating an alternate persistence authority.

### WB-2 — Multi-sheet XLSX Round Trip

Extend supported workbook interchange into one multi-sheet artifact:

- export multiple supported operational sheets into one workbook;
- import the workbook back through explicit parsing and review;
- preserve existing standalone workbook compatibility;
- preserve review-before-Apply;
- never silently overwrite application state;
- preserve version/fingerprint/concurrency review where the domain requires it;
- surface unsupported/protected/calculated changes as review information rather
  than silently applying them.

The multi-sheet workbook should become the primary combined downloadable
workbook only after its compatibility and safety contracts are proven.

### WB-3+ — Bounded Domain Coverage

Onboard suitable domains gradually in independently reviewable slices. Likely
candidates include already spreadsheet-oriented operational records such as:

- Projects;
- Cost Codes;
- Expenses;
- Supplier Invoice draft/review data;
- RFQs;
- Purchase Orders;
- Materials;
- Equipment;
- Warehouse registers;
- other already worksheet-backed operational registers.

This list is directional, not a promise that every domain belongs in the
workbook. Each domain must preserve its existing lifecycle, security, history,
calculation, concurrency, and authority boundaries. A domain should not be
added merely to maximize sheet count.

### WB-CERT — Full Round-trip Certification

Before treating the unified workbook as mature, certify the complete supported
round trip:

`export -> edit -> import review -> apply`

Certification should cover:

- formatting and data preservation;
- supported standalone-workbook backwards compatibility;
- multi-sheet backwards/forwards compatibility rules;
- stale-data and concurrency behavior;
- permission enforcement;
- calculated/protected field handling;
- lifecycle-controlled and immutable-history fields;
- financial and history integrity;
- explicit review-before-Apply;
- rejected/unsupported edits;
- partial-failure and retry behavior;
- responsive usability where the workbook surface is intended to be usable.

## Non-negotiable invariants

Future UX-EDIT/WB work must preserve the repository's existing invariants:

- one authoritative business/financial truth per domain;
- no double counting;
- no silent rewrite of verified/finalized/paid/issued/approved/history-bearing
  records;
- company isolation, RBAC, RLS/RPC and server authority remain unchanged unless
  a separately approved security/database phase explicitly changes them;
- calculated values do not become ordinary user-editable inputs;
- lifecycle transitions remain explicit;
- source evidence and provenance remain traceable;
- concurrency/stale-workbook review remains enforced where applicable;
- imports do not silently destructively overwrite current records;
- spreadsheet appearance does not create new schema columns or dynamic SQL
  authority;
- domain-specific validation and audit/history rules remain authoritative.

## WB-1 implementation record — 2026-09-27

Implementation branch: `codex/wb-1-operations-workbook`
Synchronized base `main` SHA: `6a31facf172864b465f55defe46e897e10a1da64`
Implementation source commit SHA: `e17760f94d83773be285f1ebc9eec917de0c4ff1`

The user explicitly activated WB-1 with the bounded implementation handoff.
This record closes only WB-1; WB-2, WB-3+, and WB-CERT remain unstarted.

### Shared model and registry

`src/lib/operationsWorkbookModel.ts` defines an in-app workbook contract that
is separate from `src/lib/operationsWorkbook.ts`, which remains the standalone
XLSX parser/export contract. The new model includes workbook and sheet identity,
stable ordering, domain ownership, readiness, read/write capability, existing
permission requirements, row identity, typed field/value types, validation,
formatting, empty state, and explicit ordinary-editable/read-only/protected/
calculated/source-evidence/lifecycle-controlled/workflow-only authority.

The registry order is Projects, Cost Codes, Supplier Invoices, Expenses, RFQs,
Purchase Orders, Materials, Equipment, Warehouse, Vendors, and Payroll. Only
Projects has an enabled page adapter: a bounded read-only production identity
sheet containing Project Code, Project Name, Client, and Status. Cost Codes is
foundation-only; every other entry is marked future-adapter. The Payroll
definition requires the existing `payroll.detail.read` permission and does not
use aggregate/report permissions.

### Access, routing, and persistence boundary

`/workbook` is a normal app route and `/workbook?sheet=projects` is its selected
sheet deep link. Navigation and the direct-route guard use a small presentation
access helper that requires at least one enabled sheet and that sheet's existing
domain read permission. Sheet tabs are independently filtered. Unknown,
disabled, and unauthorized IDs replace to the first authorized sheet without
rendering hidden sheet metadata. The route is grouped in Operations and obeys
the presentation-only `operations-workbook` deployment visibility setting.

WB-1 adds no `workbook.*` permission or other authorization vocabulary. Write
permission is checked separately from read permission. The production Projects
exemplar has no write adapter, so its ordinary master-data field remains
read-only there. The synthetic demo enables a local Project Name edit solely to
exercise the worksheet interaction; Save updates component-local sample state
and never reaches production persistence. Status stays lifecycle-controlled.
The adapter contract provides domain-owned value access/draft staging,
row-specific edit checks, save/apply delegation, validation/issues, dirty and
conflict state, optional concurrency metadata, and reload behavior. It is not
an arbitrary object/database writer.

The shell uses the existing `WorksheetEditor` and `WorksheetTabs`; no second
spreadsheet engine was added. The full page uses a white/light, grid-oriented
canvas, accessible horizontal tabs, desktop grid, and the existing responsive
row fallback. Existing standalone Projects, Procurement, and Expenses workbook
imports/exports, hidden metadata, parser limits, review-before-Apply, and
concurrency checks were not changed. No database/RLS/RPC/migration work was
needed.

### Validation and visual evidence

- Synchronized base: `6a31facf172864b465f55defe46e897e10a1da64`.
- Focused workbook, standalone parser, worksheet editor, route/navigation, role
  visibility, browser catalog, and Workflow Map tests passed **132/132**.
- `npm.cmd run test:affected:agent`: **665 passed, 0 failed, 0 skipped** across
  **100/389 selected test files**, no fallback, database unaffected.
- `npm.cmd run lint` and `npm.cmd run build` passed. Build retained the
  repository's existing unloaded Inter font, large-chunk, and CommonJS
  `import.meta` warnings.
- Workflow Map check/consistency passed: **266 nodes, 355 edges, 36
  invariants, 11 diagrams**; generated outputs contain no unrelated graph
  changes.
- Local production-preview Demo QA ran **8/8** synthetic scenarios at
  1440×900, 1280×800, 768×1024, and 390×844. Permission-filtered tabs,
  invalid/unauthorized recovery, and editable versus lifecycle-protected cells
  passed. There were zero horizontal page overflow, console errors, page
  errors, or failed requests. The lead inspected the screenshot matrix:
  [desktop](../../evidence/wb-1/desktop-1440x900.png),
  [constrained laptop](../../evidence/wb-1/laptop-1280x800.png),
  [tablet](../../evidence/wb-1/tablet-768x1024.png), and
  [phone](../../evidence/wb-1/phone-390x844.png). This is local synthetic demo
  evidence, not hosted, authenticated-client, or production certification.
- Jev start/context preflight found no candidates (`requestCount=0`,
  `fallback=true`), so deterministic source inspection remained authoritative.
  Jev test-triage completed with `jev-1.13.0`; it kept all **100/100** required
  tests across 3 chunks (47/44/9 candidates), used 13,040 input and 1,483
  output tokens, took 1,332 ms, and reported `fallback=false`.

WB-1 did not create a multi-sheet XLSX export/import, combined fingerprints,
cross-domain Apply, or new production editing adapters beyond the read-only
Projects exemplar. Those remain WB-2 and WB-3+ work.

## Priority and activation boundary

The original 2026-09-24 plan preceded the user's explicit WB-1 activation on
2026-09-27, recorded above. WB-2, WB-3+, and WB-CERT remain planned and are not
authorized by this WB-1 closeout. The hardening-first feature freeze and all
existing database, security, financial, history, lifecycle, approval, and
permission boundaries remain in force.
