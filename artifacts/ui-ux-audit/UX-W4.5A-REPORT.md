# UX-W4.5A — App-Wide Screenshot Investigation & Visual Triage

Status: **Investigation complete; UX-W4.5B/C/D bounded corrections implemented; UX-W4.5E app-wide visual consistency closeout implemented; UX-W5 disposition recorded below**
Reviewed source SHA: `b279b02730b79cccac5f72ac4c93553d957db07b`
Repository: `Juvialski/InvoiceApp`
Reviewed: **2026-09-20**

## Evidence boundary

This report records a local, safe-demo visual investigation. It is not
authenticated QA, hosted/provider certification, or production evidence.

| Field | Qualification |
| --- | --- |
| Mode | Vite preview at `http://127.0.0.1:4173`, `/demo` application mode |
| Data | Synthetic repository/demo fixtures only; no customer records were used |
| Baseline capture | `artifacts/demo-visual-qa-ux-w4-5a/manifest.json` |
| Baseline coverage | 89 screenshots, 34 routes, desktop/laptop/tablet/phone viewport vocabulary |
| Baseline machine result | 89/89 scenarios passed; zero console errors, page errors, failed requests, or overflow failures |
| Targeted capture | `artifacts/demo-visual-qa-ux-w4-5a-targeted/`; 9 full-page editor captures and 8 viewport/scroll checks |
| Promoted evidence | `artifacts/ui-ux-audit/screenshots/ux-w4-5a/` |
| Writes | No provider sends, production operations, destructive lifecycle actions, database mutations, or fixture creation |

The baseline runner's PASS result is recorded separately from the visual
judgment. The targeted editor script waited for existing selectors and captured
screens; it did not claim additional browser assertions.

## Review method and classification counts

Every baseline screenshot was opened and visually reviewed. The targeted
Project Details, Cost Codes/Budget Control, Client Billing draft, Expense
draft, SMS compose, and mobile scroll states were then reviewed separately.
Viewport repeats of the same workflow/state are grouped into one state family
in the counts below; the concrete scenario IDs remain in the baseline
manifest and the promoted evidence names identify the targeted captures.

| Classification | Distinct state families |
| --- | ---: |
| ACCEPTABLE | 22 |
| NEEDS CORRECTION | 28 |
| DEEPER WORKFLOW REVIEW | 6 |
| **Total** | **56** |

| Severity | Findings |
| --- | ---: |
| P0 | 0 |
| P1 | 4 |
| P2 | 8 |
| P3 | 2 |

## Coverage register

`*` denotes viewport repeats in the baseline manifest. A family marked
`DEEPER WORKFLOW REVIEW` is not a claim that the underlying workflow is broken;
the captured state did not provide enough valid evidence to prescribe a safe
presentation correction.

| State family | Route / evidence reference | Viewports | Classification | Findings |
| --- | --- | --- | --- | --- |
| Demo landing | `demo--landing--base-route-loaded--desktop-1440` | desktop | ACCEPTABLE | — |
| Executive Dashboard | `dashboard--dashboard--base-route-loaded--*` | desktop, laptop | NEEDS CORRECTION | UX45A-005 |
| Dashboard mobile navigation | `dashboard--dashboard--mobile-navigation-opened--mobile-390` | phone | ACCEPTABLE | — |
| Projects portfolio | `projects--projects--portfolio-dashboard-verified--*`; promoted `projects-desktop-1440.png`, `projects-mobile-390.png` | desktop, laptop, tablet, phone | NEEDS CORRECTION | UX45A-001, UX45A-005 |
| Projects attention filters | `projects--projects--attention-filters-verified--desktop-1440` | desktop | NEEDS CORRECTION | UX45A-001 |
| Procurement register | `procurement--procurement--base-route-loaded--desktop-1440` | desktop | NEEDS CORRECTION | UX45A-001, UX45A-010 |
| RFQ / Purchase Order draft worksheets | `procurement--procurement--rfq-and-purchase-order-draft-worksheets-verified--*` | desktop, tablet, phone | NEEDS CORRECTION | UX45A-003, UX45A-006, UX45A-010 |
| Subcontract register and claim state | `procurement--procurement--subcontract-*` | desktop, phone | NEEDS CORRECTION | UX45A-005, UX45A-008 |
| PO document preview / delivery state | `document-delivery--procurement--*` | desktop, phone | DEEPER WORKFLOW REVIEW | UX45A-011 |
| Warehouse ledger | `warehouse-inventory--warehouse--*` | desktop, phone | ACCEPTABLE | — |
| Equipment register | `equipment-registry--equipment--equipment-registry-rendered--desktop-1440` | desktop | ACCEPTABLE | — |
| Project workspace overview | `project-workspace--project-overview--project-selected--desktop-1440` | desktop | NEEDS CORRECTION | UX45A-005, UX45A-007 |
| Project attention / engineering drilldowns | `project-workspace--project-overview--attention-and-engineering-drilldowns-verified--desktop-1440` | desktop | NEEDS CORRECTION | UX45A-005, UX45A-007 |
| Project Budget Control dashboard | `project-financial-control--*financial-control-dashboard-verified--*` | desktop, laptop, tablet, phone | NEEDS CORRECTION | UX45A-005, UX45A-008 |
| Mixed-currency control state | `project-financial-control--*mixed-currency-control-state-verified--desktop-1440` | desktop | ACCEPTABLE | — |
| Project Documents register | `project-workspace--project-documents--*` | desktop, phone | ACCEPTABLE | — |
| Engineering drawing preview | `engineering-documents--blueprint-viewer--*` | desktop | ACCEPTABLE | — |
| Documents library | `documents--documents--unified-document-library-rendered--*` | desktop, tablet, phone | NEEDS CORRECTION | UX45A-009 |
| Documents create workspace | `documents--documents--document-center-create-rendered--*` | desktop, phone | ACCEPTABLE | — |
| Document templates | `documents--documents--document-center-templates-rendered--*` | desktop, phone | NEEDS CORRECTION | UX45A-007, UX45A-008 |
| Document handoff to Compose | `documents--documents--exact-document-handoff-to-email-sms-compose--desktop-1440` | desktop | ACCEPTABLE | — |
| RFI register | `rfis--rfis--base-route-loaded--desktop-1440` | desktop | ACCEPTABLE | — |
| RFI detail | `rfis--rfi-detail--rfi-detail-opened--desktop-1440` | desktop | DEEPER WORKFLOW REVIEW | UX45A-012 |
| Submittal register | `submittals--submittals--base-route-loaded--desktop-1440` | desktop | ACCEPTABLE | — |
| Submittal detail | `submittals--submittal-detail--*` | desktop | DEEPER WORKFLOW REVIEW | UX45A-012 |
| Site Log register | `site-logs--site-logs--*` | desktop, tablet, phone | ACCEPTABLE | — |
| Site Log detail | `site-logs--site-log-detail--site-log-detail-opened--desktop-1440` | desktop | NEEDS CORRECTION | UX45A-008 |
| Cash & Banking landing | `cash-banking--cash--base-route-loaded--*` | desktop, tablet | NEEDS CORRECTION | UX45A-005, UX45A-008 |
| Cash settlement workspace | `cash-banking--cash-settlement--*` | desktop | NEEDS CORRECTION | UX45A-005, UX45A-007 |
| Invoice extraction | `invoice-extraction--extract--*` | desktop | ACCEPTABLE | — |
| Email / SMS workspace | `email-sms--inbox--email-sms-workspace-rendered-*` | desktop, tablet, phone | ACCEPTABLE | — |
| Email compose | `email-sms--inbox--email-compose-review-surface-rendered-*` | desktop, phone | ACCEPTABLE | — |
| SMS compose | `email-sms--inbox--sms-compose-review-surface-rendered-*`; promoted `sms-compose-mobile-scrolled.png` | desktop, phone | NEEDS CORRECTION | UX45A-002, UX45A-003 |
| Sent / Delivery History | `email-sms--inbox--sent-delivery-history-surface-rendered--desktop-1440` | desktop | ACCEPTABLE | — |
| SMS provider status | `email-sms--inbox--sms-not-configured-surface-rendered-*` | desktop, phone | ACCEPTABLE | — |
| Supplier Invoice register | `invoices--invoices--supplier-invoice-navigation-and-register-verified--desktop-1440` | desktop | NEEDS CORRECTION | UX45A-009 |
| Supplier Invoice detail | `invoices--invoice-detail--invoice-detail-opened--desktop-1440` | desktop | NEEDS CORRECTION | UX45A-007, UX45A-008 |
| Supplier payment modal | `supplier-payables--invoice-detail--inline-supplier-payment-modal-opened-*` | desktop, phone | NEEDS CORRECTION | UX45A-003, UX45A-010 |
| Supplier Invoice review | `invoices--review--*`; promoted `supplier-invoice-review-desktop-1440.png`, `supplier-invoice-review-mobile-390.png` | desktop, tablet, phone | NEEDS CORRECTION | UX45A-004, UX45A-006, UX45A-007 |
| Vendor register | `vendors--vendors--vendor-directory-rendered--desktop-1440` | desktop | ACCEPTABLE | — |
| Payroll overview | `payroll--payroll--base-route-loaded--desktop-1440` | desktop | ACCEPTABLE | — |
| Payroll run | `payroll--payroll-run--payroll-run-opened--desktop-1440` | desktop | NEEDS CORRECTION | UX45A-009 |
| Expenses register | `expenses--expenses--base-route-loaded--desktop-1440` | desktop | NEEDS CORRECTION | UX45A-001, UX45A-009 |
| Expense payment surface | `supplier-payables--expenses--authoritative-expense-payment-surface-opened-*` | desktop, phone | NEEDS CORRECTION | UX45A-005, UX45A-007 |
| Stale Supplier Invoice recovery | `supplier-payables--invoice-detail--stale-supplier-invoice-recovery-verified--desktop-1440` | desktop | DEEPER WORKFLOW REVIEW | UX45A-012 |
| Client Invoices / Collections | `client-receivables--project-billing--client-invoice-collection-lifecycle-verified-*` | desktop, phone | NEEDS CORRECTION | UX45A-002, UX45A-005 |
| Client Billing draft catalog state | `client-receivables--project-billing--client-billing-draft-worksheet-editing-verified--*` | desktop, tablet, phone | DEEPER WORKFLOW REVIEW | UX45A-012 |
| Client Billing draft worksheet | promoted `client-billing-draft-desktop.png`, `client-billing-draft-mobile-top.png` | desktop, phone | NEEDS CORRECTION | UX45A-003, UX45A-006, UX45A-010 |
| Client Invoice document preview | `document-delivery--project-billing--client-invoice-delivery-preview-and-disconnected-history-verified-*` | desktop, phone | DEEPER WORKFLOW REVIEW | UX45A-011 |
| Reports | `reports--reports--base-route-loaded--desktop-1440` | desktop | NEEDS CORRECTION | UX45A-005, UX45A-008 |
| Settings | `settings--settings--settings-product-surface-verified--desktop-1440` | desktop | ACCEPTABLE | — |
| Assistant | `assistant--assistant--base-route-loaded--desktop-1440` | desktop | ACCEPTABLE | — |
| Demo Tour overlay | `demo--demo-tour--demo-tour-opened--desktop-1440` | desktop | ACCEPTABLE | — |
| Project Details worksheet | promoted `project-details-desktop.png`, `project-details-mobile-top.png` | desktop, laptop, phone | NEEDS CORRECTION | UX45A-003, UX45A-006, UX45A-010 |
| Budget Control / Cost Codes worksheet | promoted `budget-control-mobile.png` | desktop, phone | NEEDS CORRECTION | UX45A-003, UX45A-005, UX45A-010 |
| Expense draft worksheet | promoted `expense-draft-desktop.png`, `expense-draft-mobile-top.png` | desktop, phone | NEEDS CORRECTION | UX45A-003, UX45A-006, UX45A-010 |

## Prioritized findings

| ID | Severity | Concrete problem and affected task | Likely root cause | Recommended direction | Treatment |
| --- | --- | --- | --- | --- | --- |
| UX45A-001 | P1 | Projects, Expenses, and Cash & Banking put optional workbook tools, analytics, summary metrics, or follow-up sections before the primary records/actions. Users opening a register must filter through secondary chrome before doing the main task. | Page-level hierarchy inherited from feature accumulation rather than a shared task-first ordering rule. | Put the working register/cards first after a compact title/action/filter bar; move analytics, workbook utilities, and long follow-up sections behind secondary actions or below the primary work. | Page-specific presentation plus shared hierarchy guidance |
| UX45A-002 | P1 | On long phone workflows, the mobile shell/header can cover active content after scrolling. This was visible in SMS compose and Client Billing/worksheet viewport checks. | Shared responsive shell and body-scroll containment do not keep fixed navigation separate from long editor content. | Lock background scroll while dialogs are open, keep one shell header in the viewport, and test top/mid/end scroll positions at 390px. | Shared responsive primitive |
| UX45A-003 | P1 | Project Details, Cost Codes, Client Billing, and Expense editors remain wide desktop worksheets inside mobile contexts; dialog content/actions become clipped or unstable after a phone scroll. | `WorksheetEditor` has no reliable row-card/focused-cell fallback and editor dialogs do not consistently own scrolling/focus. | Add a compact mobile fallback, preserve identity columns, make the worksheet scroll region explicit, and keep Save/Cancel reachable without horizontal hunting. | Shared editor + responsive treatment |
| UX45A-004 | P1 | Supplier Invoice review makes users scan repeated `WORKSHEET`, `PROTECTED`, `Source evidence`, legends, explanations, match cards, and intake panels before the extracted values and exceptions. | Review surface communicates the same state through cell styling, badges, section copy, and surrounding warnings. | Source -> compact review bar -> extracted data -> exceptions; make ordinary provenance/protection quiet and reserve labels for decision-relevant states. | Shared worksheet primitive plus page-specific review hierarchy |
| UX45A-005 | P2 | Dashboard, Project Workspace, Budget Control, Cash & Banking, Reports, and Expense detail present many equal-weight cards/attention blocks. The next action is not always obvious even when all data is available. | Repeated summary-card composition and attention panels are allowed to grow without a chrome budget. | Define a compact primary summary, one attention region, and progressive disclosure for secondary analytics/source rules. | Shared card/section composition plus page-specific ordering |
| UX45A-006 | P2 | Ordinary worksheet sections repeat the same headings and state labels across RFQ/PO, Project Details, Cost Codes, Client Billing, Expense, and Supplier Invoice surfaces. | Shared `WorksheetEditor` integration leaves section-level semantics duplicated by every parent. | Support one section/column explanation and restrained read-only state styling; do not repeat visible labels in every ordinary cell. | Shared WorksheetEditor |
| UX45A-007 | P2 | Normal UI exposes technical boundary language such as authority, source evidence, immutable history, aggregate-only, and protected semantics at the same visual weight as business data. | Safety copy is rendered as permanent instructional prose instead of contextual help. | Keep the invariant but shorten default copy; move detailed explanation to info/disclosure/help affordances and escalate only on exceptions. | Copy simplification/progressive disclosure |
| UX45A-008 | P2 | Nested cards, borders, shadows, and empty panel space reduce the amount of actual business data visible in Project Workspace, Cash, Reports, Templates, and Site Log detail. | Each domain section independently wraps content in the full card treatment. | Establish a one-container working-region budget with lightweight separators inside; reserve bordered cards for distinct workflows or exceptions. | Shared visual primitive |
| UX45A-009 | P2 | Long Documents, Supplier Invoice, Payroll, Expense, and Cash registers become difficult to scan because secondary sections and repeated rows continue far below the primary task. | Registers have no compact paging/filter prioritization or progressive disclosure for secondary records. | Keep the primary register concise, group secondary records behind tabs/disclosures, and preserve filters/actions close to the affected records. | Page-specific presentation |
| UX45A-010 | P2 | Wide tables and worksheets still assume desktop columns on phone/tablet, especially Cost Codes, Client Billing, Expense, PO/RFQ, and payment dialogs. | Responsive behavior is mostly width reduction rather than a deliberate row-card/focused-edit model. | Add row-card/focused-cell fallbacks and keep horizontal scrolling only inside a clearly bounded worksheet region. | Shared responsive worksheet treatment |
| UX45A-011 | P2 | PO and Client Invoice document previews can show a large blank/loading/unavailable canvas while the useful status and actions are pushed to the bottom of a tall modal. | Preview capability/loading/error states are not given a compact, explicit state layout in the safe-demo fixture. | Separate loading, unavailable, and rendered states; size the preview region to the actual state and make the next action/status visible without a blank wall. | Deeper workflow review before implementation |
| UX45A-012 | P2 | RFI/Submittal detail and stale-invoice routes captured unavailable/recovery states rather than valid detail states; the original Client Billing scenario also captured after closing its editor. | Demo fixture IDs and scenario actions do not preserve the intended detail/editor state for screenshot evidence. | Add deterministic safe fixtures or scenario capture points; do not infer visual quality of the missing workflow from an unavailable state. | Harness/evidence coverage |
| UX45A-013 | P3 | Template, Reports, and some operational headings use high-contrast uppercase labels and long explanatory subtitles that compete with ordinary values. | Typography/copy conventions are applied uniformly to primary and secondary information. | Reduce uppercase/weight for secondary labels and shorten subtitles where the page purpose is already clear. | Copy/typography polish |
| UX45A-014 | P3 | Similar actions vary between page bars, worksheet headers, modal footers, and inline cards, making Save/Close/Review/Preview placement less predictable. | Each domain implemented its own local action grouping around the shared editor. | Standardize a compact action-bar grammar while retaining explicit lifecycle/financial workflow buttons. | Shared action grouping |

## Root-cause groups and recommended correction sequence

1. **UX-W4.5B — shared responsive shell and editor foundations.** Fix mobile
   scroll containment, dialog stability, worksheet row-card/focused-cell
   fallback, and quiet protected/provenance rendering. This addresses the P1
   mobile/editor findings before new domains are migrated.
2. **UX-W4.5C — task-first hierarchy on high-frequency landing surfaces.** Start
   with Projects, Expenses, Cash & Banking, and the Project Workspace/Budget
   Control ordering. Move the primary working content ahead of optional tools,
   summaries, and long secondary sections.
3. **UX-W4.5D — worksheet and Supplier Invoice clarity.** Remove redundant
   worksheet chrome and ordinary-state badges across Supplier Invoice, Project
   Details, Cost Codes, RFQ, PO, Client Billing, and Expense while preserving
   all authority, permission, history, and review-before-apply semantics.
4. **UX-W4.5E — preview, coverage, and consistency closeout.** Correct the
   document preview state layout after its capability/loading contract is
   clarified, repair deterministic RFI/Submittal/detail/editor capture points,
   and re-capture only the changed findings at the relevant viewports.

Do not start UX-W5 until the P1/shared-root-cause work above is implemented and
validated. This report does not authorize broad UI remediation in the
investigation PR.

## Coverage gaps and non-claims

- The baseline has only three constrained-laptop state groups (Dashboard,
  Projects, and Project Financial Control); other routes have desktop,
  tablet, and/or phone evidence but should receive laptop captures when their
  correction slices are implemented.
- The demo RFI and Submittal detail identifiers rendered unavailable states;
  no visual judgment of a populated detail workflow is claimed.
- Supplier Invoice review source panels reported the source as unavailable in
  the demo fixture; the populated image/PDF source layout is not certified by
  this run.
- The original Client Billing worksheet scenario closed the editor before the
  baseline screenshot. Targeted captures were added for evidence, but the
  scenario catalog still needs a deliberate capture-state contract if this
  workflow becomes a later correction target.
- The local/demo runner proves route/screenshot/structural browser behavior
  only. It does not prove authenticated Supabase, Storage/RLS, provider,
  hosted, or production behavior.

## Stop-boundary result

Representative coverage was captured, every available rendered state was
visually inspected, findings were grouped, P0/P1 priorities are explicit, and
bounded correction slices are documented. No broad UI remediation was made.

## UX-W4.5B follow-up — shared responsive shell and worksheet foundations

The bounded UX-W4.5B implementation received targeted local synthetic safe-demo
visual inspection at source revision
`5011d137829cceef70cee6d8dcb96157aae02a39`. PR review then advanced the
application-bearing head to `85efe8f951b96df0c20dd6ffd4869f0b083c2343` to remove the repeated mobile
`Locked` label, keep responsive issue-description IDs unique, and exclude
CSS-hidden responsive controls from dialog focus traversal. The targeted visual
record remains qualified to its capture SHA at
`artifacts/ui-ux-audit/screenshots/ux-w4-5b/README.md`; exact-head protected
application/browser CI is the merge gate for the reviewed application head.

Implemented shared corrections:

- `useDialogFocus` now reference-counts document scroll locking and restores
  prior body/document scroll styles after modal-style workflows close.
- The shared shell exposes a focus-safe scroll-padding boundary; representative
  Project Details, Expense, RFQ, and Purchase Order workflows now have one
  deliberate dialog body scroll owner, while Client Billing and worksheet
  consumers retain parent-owned actions.
- `WorksheetEditor` keeps the desktop table/grid, keyboard navigation,
  copy/paste, frozen identity columns, validation, dirty/conflict state, and
  row-operation contracts, and adds a CSS-selected phone row/field fallback.
- Ordinary protected/read-only cells retain `aria-readonly`, data-state
  attributes, non-editability, titles, and restrained styling without a
  repeated visible `Protected` / `Read-only` pill.

Disposition from this correction slice:

- **UX45A-002:** **PARTIAL** — shared shell/dialog containment is implemented
  and representative modal states were visually inspected; the safe-demo SMS
  provider-unconfigured state did not reproduce the original long-scroll
  provider workflow, and automated Demo Visual QA was blocked by the missing
  Playwright dependency.
- **UX45A-003:** **RESOLVED for the bounded worksheet consumers** — Project
  Details, Cost Codes/Project Controls, Client Billing, Expense Draft, RFQ,
  and Purchase Order use the shared mobile fallback and contained modal/editor
  behavior. Broader non-worksheet dialogs remain out of scope.
- **UX45A-006:** **SHARED PORTION RESOLVED** — ordinary repeated protected/read-
  only cell labels are quiet. Supplier Invoice page-specific repeated headings,
  legends, and explanatory hierarchy remain UX-W4.5D work.
- **UX45A-010:** **RESOLVED for the bounded worksheet consumers** — changed
  worksheets use deliberate phone row/field rendering and preserved desktop
  contained tables. Unchanged non-worksheet register/payment surfaces remain
  out of scope.
- **UX45A-004:** **DELIBERATELY DEFERRED** — full Supplier Invoice hierarchy
  and provenance/source presentation remains UX-W4.5D.

The interactive captures are local/demo, synthetic, and non-certifying. The
repository Demo Visual QA command was not claimed as passed because the clean
worktree lacks its `playwright` dependency; no screenshots were promoted as
automated persisted artifacts.

## UX-W4.5C follow-up — task-first hierarchy, workspace width, and visual grammar

The steered UX-W4.5C implementation was inspected from the active worktree at
application revision `597a2de77774e777d56c59ed7a7fe0ac8133d230` using the local
safe demo at `http://127.0.0.1:3000` in the Codex browser surface. The manually
inspected desktop viewport was the visible `1280x900` browser surface. These
captures were interactive visual inspections, not hosted certification, and no
automated screenshot artifacts were promoted because this worktree does not have
the repository's Playwright dependency.

### Manual visual evidence inspected

| Surface | Route/state | Viewport | Visual judgment |
| --- | --- | --- | --- |
| Projects | `/demo/app/projects`, card portfolio | desktop browser surface | **ACCEPTABLE for the inspected viewport** — title/New Project, compact filters, and the first card row are visible before Portfolio snapshot and Excel tools. |
| Expenses | `/demo/app/expenses`, register loaded | desktop browser surface | **ACCEPTABLE for the inspected viewport** — Add Expense, register controls, and records precede supplier-document follow-up, summary metrics, and workbook disclosure. |
| Cash & Banking | `/demo/app/cash`, active account ledger and settlement workspace | desktop browser surface | **ACCEPTABLE for the inspected viewport** — controls/accounts/ledger are above settlement; summary cards are below the working and exception regions. |
| Project Workspace | `/demo/app/projects/demo-project-warehouse`, Overview | desktop browser surface + protected exact-head desktop capture | **ACCEPTABLE after PR-review correction** — the attention region is now a compact severity summary with evidence/drilldowns disclosed on demand, so the Project Financial Control Dashboard begins immediately after it instead of being buried below a tall wall of alerts. |
| Budget Control | same project, `Budget Control` tab | desktop browser surface + exact-head structural/browser regression evidence | **ACCEPTABLE for the bounded W4.5C correction** — the cost-code worksheet follows the compact metrics and six-column metric density now begins only at `2xl`; the protected run reported no responsive overflow. A dedicated Budget Control-tab visual recapture remains part of the later W4.5E certification rather than being overclaimed here. |
| Purchase Order | New Purchase Order draft working canvas | desktop browser surface | **ACCEPTABLE for the inspected viewport** — the editor uses nearly the full useful width, internal worksheet scroll remains bounded to genuinely wide columns, and one footer action bar owns Close/Save/lifecycle actions. |
| RFQ | New RFQ draft working canvas | desktop browser surface | **ACCEPTABLE for the inspected viewport** — header/vendor/line worksheets use the same wide-canvas treatment and the stable footer owns Save/Cancel. |

The implementation-run local browser did not provide constrained-laptop/phone
captures, but PR review subsequently inspected protected Demo Visual QA from
application-bearing head `1652add981cb8d51ea24495f958273380627eb30`.
That exact head passed Application Validation, Workflow Map Consistency,
Database Migration & Invariant Tests (database-unaffected fast path), and Demo
Visual QA. The protected artifact was inspected directly for Projects at
desktop/laptop/tablet/phone, Purchase Order/RFQ at desktop/tablet/phone, and
Project Workspace/Project Financial Control at the available desktop/laptop/
tablet/phone states. The review found the tall Project Overview attention wall,
corrected it to compact progressive disclosure, and re-inspected the resulting
exact-head desktop capture before merge.

### Bounded width and grammar decisions

- **Type A working canvases widened:** Purchase Order, RFQ, RFQ comparison,
  goods receipt, subcontract claim, subcontract editor, subcontract variation
  draft/detail, and supplier quotation now expose a `data-working-canvas` marker
  and use a roughly `96vw` desktop canvas with workflow-specific sensible caps.
  The Project Details worksheet is already a `95vw` canvas and is marked as such.
- **Type C dialogs intentionally kept compact:** nested RFQ comparison selection,
  Purchase Order cancellation/delete, receipt void, variation rejection/
  cancellation, and other short reason/confirmation dialogs retain their
  conventional `max-w-md`-class widths because the decision content is not a
  working table.
- **Worksheet grammar:** `WorksheetEditor` now exposes machine-readable
  `data-worksheet-align` values on headers, desktop cells, and mobile fields,
  plus a shared action-bar marker. Text defaults left, numeric/currency columns
  use right alignment, and status columns on Project Details/Cost Codes use
  centered alignment. Existing protected/read-only semantics remain quiet and
  machine-readable.
- **Action grammar:** PO/RFQ draft Save/Close controls are owned by one stable
  modal footer; duplicate worksheet-level Save/Close controls were removed.
  Approval, issue, receiving, close, cancellation, matching, and settlement
  remain separate lifecycle actions.

### UX-W4.5C disposition

- **UX45A-001:** **RESOLVED for the bounded Projects, Expenses, and Cash task-first
  hierarchy**, with source-order regression coverage plus protected responsive
  browser evidence on the relevant captured states.
- **UX45A-005:** **RESOLVED for the bounded W4.5C Project Workspace/Budget/Cash
  hierarchy** — PR review replaced the oversized Project Overview attention wall
  with a compact severity summary and on-demand evidence disclosure. Broader
  app-wide hierarchy certification remains W4.5E.
- **UX45A-008:** **PARTIAL** — touched modal canvases and worksheet chrome now
  use more of the desktop workspace; no app-wide card/container rewrite was
  attempted.
- **UX45A-009:** **PARTIAL** — Expenses/Cash secondary sections now follow the
  primary task; broader register pagination/coverage remains out of scope.
- **UX45A-013:** **PARTIAL** — touched worksheet labels, alignment metadata, and
  action/title treatment were normalized; app-wide typography remains UX-W4.5E.
- **UX45A-014:** **PARTIAL** — PO/RFQ Save/Close placement is normalized; other
  workflow families remain for the app-wide consistency phase.
- **New recurring root cause — WORKSPACE-WIDTH SUITABILITY:** a working canvas
  with large tables/worksheets must be evaluated against available desktop
  width; large unused margins plus internal horizontal scrolling indicates a
  too-narrow workspace.
- **New recurring root cause — VISUAL-GRAMMAR CONSISTENCY:** equivalent
  workflows must share title hierarchy, data-type alignment, column sizing,
  spacing rhythm, and action-bar placement.
- **UX45A-004:** **DELIBERATELY DEFERRED** — Supplier Invoice hierarchy remains
  UX-W4.5D.

UX-W4.5E is strengthened as **APP-WIDE VISUAL CONSISTENCY & PROFESSIONAL-FINISH
CERTIFICATION**. It remains a future app-wide pass covering title hierarchy,
subtitles, alignment, numeric formatting, action placement, modal/workspace
sizing, toolbars, spacing, typography, buttons, badges, card treatment,
progressive disclosure, responsive consistency, and professional finish.

## UX-W4.5D follow-up — Supplier Invoice and worksheet clarity

The bounded UX-W4.5D correction is implemented at application-bearing SHA
`4d5b158acec8427fd684a64513df05a00fe6ba71`, from base SHA
`f4177ecd3c40d3baaf6bcdf51806e0d58a5e9534`.

### Scope and implementation evidence

- Supplier Invoice review keeps the preserved source image/PDF above the
  extracted review flow. The safe-demo review invoice
  (`/demo/app/review?invoiceId=demo-invoice-07`) now has the deterministic,
  fictional source image `/demo/supplier-invoice-review.svg`; no Storage,
  provider, database, or production evidence was introduced.
- The review status/action bar is compact. Blocking review items now follow the
  extracted worksheet, while review notes and monetary/provenance diagnostics
  are collapsed disclosures.
- The four Supplier Invoice worksheet sections share one page-level
  Save/Discard/Add-line toolbar. Section headings lead directly to their
  working grids; ordinary `Source evidence` and `Calculated` markers remain
  machine-readable but are visually quiet. Manual corrections and unresolved
  values remain visible.
- Vendor identity remains a controlled link/create workflow. Supplier Invoice
  evidence remains separate from authoritative linked Expense payable/cost
  truth, and no financial, lifecycle, permission, history, concurrency, or
  provenance authority changed.
- Project Details, Cost Codes, RFQ, Purchase Order, Client Billing, and Expense
  worksheet consumers were audited against the same repetition/chrome risks.
  Their W4.5B/C action, responsive, width, and alignment corrections were
  preserved; no unrelated redesign was warranted in this bounded slice.

### Visual evidence inspected

| Route/state | Environment | Viewport | Evidence and judgment |
| --- | --- | --- | --- |
| `/demo/app/review?invoiceId=demo-invoice-07`, source image and review flow | local safe demo at `http://127.0.0.1:3000`, CUA browser | desktop `1920x911` | **ACCEPTABLE for the bounded correction** — the populated source is visually first, the source scroll region is bounded, and the extracted status/action bar follows the source without repeated section action bars. |
| `/demo/app/review?invoiceId=demo-invoice-07`, source image and extracted worksheet | same local safe demo, in-app browser | responsive `652x698` | **ACCEPTABLE for the inspected responsive state** — the source is available, worksheet rows use the phone fallback, Save/Discard/Add line remain reachable, and ordinary source provenance is not repeated as visible pills. This is transient live-browser evidence, not a promoted screenshot artifact. |
| Project Details, Cost Codes, RFQ, Purchase Order, Client Billing, Expense draft | current source plus existing W4.5B/C qualified evidence | relevant existing demo states | **PRESERVED / no new correction required in W4.5D** — existing width, action ownership, alignment, and responsive fallback contracts remain intact; no new page-specific chrome was added. |

The repository Demo Visual QA command was attempted but could not start because
the checkout does not contain the `playwright` package (`ERR_MODULE_NOT_FOUND`).
No automated Demo Visual QA PASS is claimed, and no new screenshot artifact was
promoted. The manual screenshots above were inspected directly; the limitation
does not invalidate the local application/test/build evidence below but keeps
protected exact-head browser QA as the visual merge gate.

### Validation and disposition

- Focused worksheet/Supplier Invoice/other migrated-surface tests: **89/89**.
- `npm.cmd run test:affected:agent`: **293/293**, database fallback disabled.
- `npm.cmd run lint`: ESLint and TypeScript passed.
- `npm.cmd run build`: passed. The build emitted the repository's existing
  Astryx Inter-font notice, chunk-size notices, and CJS `import.meta` warning;
  generated theme version churn was restored and is not part of this diff.
- Docker/Supabase, migrations, RLS/RPC, provider, hosted QA, and production
  validation: **not applicable** to this presentation-only diff.
- **UX45A-004:** **RESOLVED for Supplier Invoice review** — source-first
  hierarchy, quiet normal provenance/protection, compact status/actions, and
  post-worksheet blocking review are implemented.
- **UX45A-006:** **RESOLVED for the Supplier Invoice page portion**; the shared
  quiet protected-cell behavior remains as established in W4.5B.
- **UX45A-007:** **RESOLVED for the touched Supplier Invoice defaults** —
  technical explanation is disclosed, while decision-relevant exceptions stay
  prominent.
- **UX45A-008 / UX45A-009:** **PARTIAL** — app-wide card/container and register
  closeout remain UX-W4.5E work.
- **UX45A-012:** **UNCHANGED / DEFERRED** — stale/unavailable detail capture
  coverage remains a deeper W4.5E workflow/evidence concern.

At the UX-W4.5D checkpoint, UX-W4.5E was the next phase. The UX-W4.5E
follow-up below records the completed app-wide visual-consistency and
professional-finish gate.

## UX-W4.5E follow-up — app-wide visual consistency and professional finish

The bounded UX-W4.5E implementation is complete for the remaining shared
visual root causes and preview/evidence closeout at application-bearing SHA
`3eb2819edd4da3527e083882bf451c171c35b6a4`. The final reviewed application
SHA is the same value; documentation-only finalization does not alter the
reviewed application behavior.

### Implementation boundary

- `src/components/ui/OperationsUI.tsx` now provides a quieter shared grammar
  for PageHeader, SectionHeader, FilterBar, DisclosureSection, MetricCard,
  EmptyState, Notice, LoadingState, and ErrorState: restrained eyebrow/title
  hierarchy, consistent section markers, lighter container treatment, tighter
  metric/filter/disclosure spacing, and no repeated visible `Key` label.
- `src/components/documentPreviewPresentation.ts` and
  `src/components/DocumentPreviewModal.tsx` give loading, ready, and error
  preview states explicit compact sizing. A loading or unavailable preview no
  longer reserves the former `min-h-[760px]` blank wall, so delivery history
  and the next relevant action remain visible.
- The change is presentation-only. No financial, lifecycle, permission,
  company-isolation, provenance, history, concurrency, workbook, provider, or
  database contract changed.
- Existing deterministic demo RFI/Submittal detail fixtures now render valid
  populated states at `demo-rfi-wh-001` and `demo-sub-wh-014` / round
  `demo-round-wh-014-2`; no fixture or production data behavior was changed.

### Final visual evidence inspected

The final safe-demo run captured all 89 scenarios across the repository's
desktop, constrained-laptop, tablet, and phone viewport vocabulary. The lead
agent directly inspected the changed surfaces at desktop `1440x900`,
constrained laptop `1366` width, tablet `768` width, and phone `390x844`,
including the promoted evidence in
`artifacts/ui-ux-audit/screenshots/ux-w4-5e/README.md`.

| Surface/state | Viewports directly inspected | Judgment |
| --- | --- | --- |
| Shared title/filter/metric grammar: Projects, Reports, Email/SMS | Projects desktop/laptop/tablet; Reports desktop; Email/SMS phone | **ACCEPTABLE** — hierarchy is consistent, primary work remains first, and tighter shared chrome does not hide actions or semantics. |
| Purchase Order document preview loading state | Desktop `1440x900`, phone `390x844` | **ACCEPTABLE** — the preview state is deliberately compact; delivery history and download/send actions remain in the visible modal flow. |
| RFI detail and Submittal detail | Desktop `1440x900` | **ACCEPTABLE** — deterministic safe fixtures render the intended populated detail workflows. |
| Existing Projects card-first and Supplier Invoice source-first workflows | Desktop, laptop, tablet, phone evidence from final catalog plus promoted prior qualified states | **PRESERVED** — no regression to primary card/source ordering or worksheet authority was observed. |

### W4.5A finding dispositions after UX-W4.5E

| Finding | Final disposition | Evidence / reason |
| --- | --- | --- |
| UX45A-001 | **RESOLVED for the bounded task-first surfaces** | Projects, Expenses, Cash & Banking, and Project Workspace retain primary work before secondary tools; final full demo run passed. |
| UX45A-002 | **RESOLVED for inspected shared-shell and representative long workflows** | W4.5B scroll containment plus final phone inspection; no shell overlap or hidden primary action was observed. Broader provider-runtime behavior remains separately unverified. |
| UX45A-003 | **RESOLVED for bounded worksheet consumers** | W4.5B responsive worksheet/dialog foundation remains green under focused and affected tests. |
| UX45A-004 | **RESOLVED for Supplier Invoice review** | W4.5D source-first hierarchy and quiet normal provenance remain preserved. |
| UX45A-005 | **RESOLVED for the inspected app-wide summary/card surfaces** | Shared metric treatment is quieter; primary working surfaces remain ordered first. Domain-specific analytical walls remain purpose-built where appropriate. |
| UX45A-006 | **RESOLVED for shared worksheet and touched Supplier Invoice surfaces** | Ordinary protected/read-only and source-evidence labels remain semantic and quiet. |
| UX45A-007 | **RESOLVED for touched surfaces; accepted as-is elsewhere** | Technical detail remains available in context/disclosures; no financial or source authority was changed. |
| UX45A-008 | **RESOLVED for shared primitive chrome; accepted as-is for distinct workflow containers** | Shared surfaces use lighter borders/spacing; distinct workflows retain containers when they carry separate actions or exception states. |
| UX45A-009 | **PARTIAL / accepted as-is for long authoritative registers** | Final catalog remains scanable and responsive; deeper pagination/tab restructuring would be a separate domain workflow change, outside this presentation closeout. |
| UX45A-010 | **RESOLVED for bounded worksheet consumers** | Final full run passed responsive browser assertions; phone/tablet fallbacks remain in place. |
| UX45A-011 | **RESOLVED for applicable document preview states** | Loading/unavailable/error frame sizing is compact and directly inspected on desktop/phone. Rendered PDF page fidelity remains covered by the existing document/PDF contracts. |
| UX45A-012 | **RESOLVED for deterministic RFI/Submittal detail capture; PARTIAL for stale-invoice recovery by design** | Final fixtures render populated RFI/Submittal details; stale missing-record recovery remains a deliberate recovery state, not a fabricated detail. |
| UX45A-013 | **RESOLVED for shared PageHeader/metric/section grammar; accepted as-is for domain-specific status labels** | Ordinary page hierarchy is less uppercase-heavy and secondary copy is restrained without removing meaningful status vocabulary. |
| UX45A-014 | **PARTIAL / non-blocking** | Shared page/header and worksheet markers now expose consistent grouping; rare domain lifecycle controls remain purpose-built by design and were not converted into generic cells. |

### Validation and non-claims

- New/focused visual consistency tests: **28/28**.
- `npm.cmd run test:affected:agent`: **146/146**, database fallback disabled.
- `npm.cmd run lint`: ESLint and TypeScript passed.
- `npm.cmd run build`: passed. Existing Inter-font, chunk-size, and CJS
  `import.meta` warnings remain non-blocking repository warnings.
- Final `npm.cmd run qa:demo` at the application-bearing revision: **89/89**
  scenarios passed; zero console errors, page errors, failed requests, or
  horizontal-overflow failures.
- Docker/Supabase not required — no database contract changed. No migration,
  RLS, RPC, trigger, constraint, provider, hosted-QA, or production operation
  was performed.
- TypeSafe/Jev was not used; the deterministic repository path was sufficient
  and remains authoritative.
- The visual evidence is local/demo synthetic evidence. It does not certify
  authenticated hosted QA, provider delivery, production behavior, or PDF
  converter availability.

### UX-W4.5E gate result

The remaining P0/P1/shared-root-cause visual blockers are closed for the
inspected application boundary. UX-W5 is **unblocked from the visual gate**,
but its operational bulk-data scope remains subject to the separate product
sequence, Wave 4D/provider prerequisites, and a new bounded implementation
handoff. No UX-W5 code was started in this closeout.
