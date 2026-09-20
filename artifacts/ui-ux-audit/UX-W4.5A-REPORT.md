# UX-W4.5A — App-Wide Screenshot Investigation & Visual Triage

Status: **Investigation complete; broad remediation intentionally deferred**
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
