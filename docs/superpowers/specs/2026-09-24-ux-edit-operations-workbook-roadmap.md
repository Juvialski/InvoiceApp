# UX-EDIT-1 and Operations Workbook — Planned Direction

Status: **PLANNED / NOT ACTIVE / NO IMPLEMENTATION AUTHORIZED**  
Date recorded: **2026-09-24**  
Repository: `Juvialski/InvoiceApp`

This document records future UX and workbook direction only. It does not select
the next implementation phase, resume deferred feature expansion, or change any
database, security, financial, history, lifecycle, approval, or permission
authority.

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

## Priority and activation boundary

These items are **future planned work**. They remain behind the current
hardening, reliability, certification, and release-readiness priorities. The
existing net-new product feature freeze remains in force.

Do not start UX-EDIT-1, WB-1, WB-2, WB-3+, or WB-CERT merely because this
document exists. A future user instruction must explicitly activate the work,
and the live `AGENTS.md`, active roadmap, repository state, and then-current
risk boundaries remain authoritative when that happens.
