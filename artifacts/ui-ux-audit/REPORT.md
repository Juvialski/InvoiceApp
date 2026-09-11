# HydroQualiSense UI UX Audit

Date: 2026-09-11
Base branch: `main` at `2b48ea14b462c42577fc7ce9fd63ae2c6f34654b`
Feature branch: `codex/ui-ux-audit-20260911`
Authenticated QA: `https://hydroqualisense-qa.onrender.com`
QA application SHA tested: `2b48ea14b462c42577fc7ce9fd63ae2c6f34654b`
QA migration level: `20260910233915`
QA deployment: `qa-hydroqualisense`

## Outcome

The product is understandable and usable across the major authenticated
workspaces, with the largest friction concentrated in narrow register and
document-preview layouts. The branch implements targeted improvements for
mobile progressive disclosure, receipt-entry clarity, Gmail queue retention,
page hierarchy, and client-facing capability wording. No financial, document,
permission, delivery-history, or Assistant authority was changed.

Severity counts:

| Severity | Count |
| --- | ---: |
| P0 | 0 |
| P1 | 2 |
| P2 | 9 |
| P3 | 0 |

## Evidence boundary

Authenticated QA was used for connection state, Gmail provider calls, delivery
history, owner navigation, the four PR #140 repaired flows, generated previews,
and the major company workspaces. The connected mailbox returned three finance
candidates during the bounded scan; their subjects, senders, and contents are
not retained here because they were not controlled synthetic test messages.
Nothing from those candidates was imported or preserved.

The local demo visual run exercised the integrated branch across 76 scenarios,
34 routes, and four viewport profiles. It captured 76 screenshots and reported
zero console errors, page errors, failed requests, overflow failures, or failed
scenarios. Local/demo evidence does not prove authenticated Supabase, Gmail,
Storage, or provider behavior.

## Findings

### UIUX-001 — P1 — Incremental Gmail sync cleared the visible review queue

- Route/workflow: Email / SMS → Inbox / Intake → Sync new
- Viewport: desktop 1440px
- Control/component: `EmailInbox` incremental sync state
- Problem/friction: A successful 30-day scan returned three candidates. `Sync new`
  returned no new messages and replaced the visible queue with an empty state,
  so an employee could lose sight of uncommitted review work.
- Before evidence: Authenticated QA provider scan and subsequent `Sync new`; no
  mailbox message text is recorded.
- Implemented fix: Use the route-owned Gmail callbacks so parent cursor state is
  updated, merge incremental results by provider message ID, and preserve an
  existing importing/imported/failed status.
- Status: Implemented on branch; authenticated QA redeploy retest pending.
- After evidence: `tests/gmailCandidates.test.ts` passes; local branch checks
  preserve the queue when incremental results are empty.
- Verification performed: Focused tests, affected tests, local demo visual QA.

### UIUX-002 — P1 — Untouched zero receipt quantities blocked a partial receipt

- Route/workflow: Procurement → issued mixed-unit PO → Record Delivery / Receipt
- Viewport: desktop 1440px; reproduced in the live QA form
- Control/component: `RecordReceiptModal` line quantity validation
- Problem/friction: The receipt form allowed `0` through its field affordance,
  but submitting a partial receipt with an untouched line at zero reported
  `Invalid quantity` for that line. Explicitly clearing the field was required
  before the two-line partial receipt could be recorded.
- Before evidence: QA synthetic PO `PO-QA-E2E-7F4K-001`; 40 m, 20 bags, and an
  untouched 0 pcs line. The first submission failed; the corrected submission
  succeeded.
- Implemented fix: Treat blank and zero UI values as skipped lines; reject only
  non-finite or negative quantities, and explain the rule beside the line list.
- Status: Implemented on branch; authenticated QA redeploy retest pending.
- After evidence: `parseReceiptQuantity` regression coverage passes; local
  mobile receipt cards render and accept untouched lines without table overflow.
- Verification performed: Live QA reproduction, focused tests, local 390px and
  768px checks, affected tests.

### UIUX-003 — P2 — Expense register actions were hidden behind horizontal scroll

- Route/workflow: Expenses → register
- Viewport: authenticated QA 390px
- Control/component: Expense register table
- Problem/friction: The table rendered at approximately 1110px inside a narrow
  scroller; the first columns were visible but source, amount, status, and
  correction actions were offscreen.
- Before evidence: QA DOM metrics showed a 1110px table with page width 375px;
  the mobile capture showed only the first two columns and a horizontal bar.
- Implemented fix: Add a card register below the desktop breakpoint containing
  project, payee, source links, amount, status, FX state, and correction actions.
- Status: Implemented on branch; authenticated QA redeploy retest pending.
- After evidence: Local 390px and 768px checks show cards, hidden desktop table,
  and no page-level horizontal overflow; demo visual QA passed.
- Verification performed: Local browser interaction, 76-scenario demo visual
  QA, focused source checks.

### UIUX-004 — P2 — Procurement register actions were hidden behind horizontal scroll

- Route/workflow: Procurement → Purchase Orders / RFQs
- Viewport: authenticated QA 390px
- Control/component: Purchase Order and RFQ register tables
- Problem/friction: The PO table rendered at approximately 1270px, making the
  record actions impractical to discover on a phone even though the page itself
  did not overflow.
- Before evidence: QA DOM metrics showed a 1270px table inside a 341px scroller.
- Implemented fix: Add responsive PO and RFQ cards below the desktop breakpoint
  with status, supplier, project, delivery/decision state, counts, amounts, and
  the same existing actions.
- Status: Implemented on branch; authenticated QA redeploy retest pending.
- After evidence: Local 390px and 768px checks show card registers and no page
  overflow; desktop tables remain available at the large breakpoint.
- Verification performed: Live QA DOM inspection, local browser interaction,
  focused tests, affected tests.

### UIUX-005 — P2 — Mobile receipt entry hid Qty receiving

- Route/workflow: Procurement → PO → Record Delivery / Receipt
- Viewport: authenticated QA 390px
- Control/component: `RecordReceiptModal` line-delivery table
- Problem/friction: The modal showed line description, ordered, and previous
  receipt columns while the quantity input was beyond the horizontal viewport.
- Before evidence: QA mobile capture of the receipt dialog showed the quantity
  column offscreen.
- Implemented fix: Add mobile line cards with ordered, received, remaining, a
  full-width quantity field, and a clear per-line receive-remaining action.
- Status: Implemented on branch; authenticated QA redeploy retest pending.
- After evidence: Local 390px capture shows each quantity field directly below
  its line summary; document/page widths remain within the viewport.
- Verification performed: Local browser interaction and demo visual QA.

### UIUX-006 — P2 — New Project dialog was labeled Edit

- Route/workflow: Projects → New project
- Viewport: authenticated QA 1440px
- Control/component: `ProjectsPage` project editor heading
- Problem/friction: The repaired project draft now receives a valid UUID before
  persistence, and the heading used that UUID as an existing-record signal,
  producing `Edit` with no project code.
- Before evidence: Live QA New project form showed heading `Edit` while code and
  name were blank.
- Implemented fix: Treat a draft with no project code as `Create New Project`;
  existing coded records continue to show their edit heading.
- Status: Implemented on branch; authenticated QA redeploy retest pending.
- After evidence: Local dialog heading is `Create New Project`; project draft
  and heading regression tests pass.
- Verification performed: Live QA inspection, local browser interaction, focused
  tests.

### UIUX-007 — P2 — Cash & Banking led with a secondary reconciliation panel

- Route/workflow: Cash & Banking landing page
- Viewport: authenticated QA desktop 1440px
- Control/component: `CashBankingRoute` section order
- Problem/friction: Reconciliation allocation appeared before the page title and
  primary Cash & Banking actions, making the first screen feel like a detail
  task rather than the workspace landing page.
- Before evidence: QA desktop capture and DOM order showed the allocation
  heading before the `Cash & Banking` page heading.
- Implemented fix: Render the Cash & Banking page header and summary first, then
  statement review and settlement allocation sections.
- Status: Implemented on branch; authenticated QA redeploy retest pending.
- After evidence: Local route inspection reports `Cash & Banking` as the first
  main heading with the allocation workflow continuing below.
- Verification performed: Live QA inspection, local 390px check, build/lint,
  affected tests.

### UIUX-008 — P2 — Mobile issued-document preview overlapped the title and number

- Route/workflow: Documents → issued Client Invoice / Purchase Order → Preview
- Viewport: authenticated QA 390px
- Control/component: `DocumentPreviewModal` branding and title block
- Problem/friction: The mobile preview placed the logo/company name and title/
  number box in overlapping absolute layouts. `INVOICE` collided with its
  document-number box.
- Before evidence: QA mobile preview capture showed the overlap; desktop preview
  was aligned.
- Implemented fix: Stack branding and the document number on small screens,
  retain the centered desktop title, use fixed-layout wrapping in preview
  line-item tables, and move focus into the modal with Escape/Tab handling.
- Status: Implemented on branch; authenticated QA redeploy retest pending.
- After evidence: Local mobile preview shows separated branding, title, and
  number; preview scroll width equals its client width, and the close control is
  the initial dialog focus target.
- Verification performed: Live QA preview inspection, local browser screenshot,
  focused tests, demo visual QA.

### UIUX-009 — P2 — Gmail read-only wording could imply outbound email is disabled

- Route/workflow: Email / SMS → Inbox / Intake
- Viewport: authenticated QA desktop and mobile
- Control/component: Gmail connection badge and inbox capability notice
- Problem/friction: `Read-only` and `Gmail is read-only on this screen` required
  the employee to infer that Compose still sends outbound email.
- Before evidence: QA DOM and desktop capture showed the ambiguous wording.
- Implemented fix: Use `Inbox access: read-only` and explicitly direct outbound
  email to Compose and Delivery History.
- Status: Implemented on branch; authenticated QA redeploy retest pending.
- After evidence: Local Email / SMS DOM contains the explicit inbox scope and
  Compose direction; the page has one visible top-level Email / SMS heading.
- Verification performed: Live QA inspection, local browser interaction, focused
  tests, demo visual QA.

### UIUX-010 — P2 — Settings roadmap understated the usable Email/Documents surface

- Route/workflow: Settings → HydroQualiSense Features & Roadmap
- Viewport: authenticated QA desktop
- Control/component: `src/config/productFeatures.ts`
- Problem/friction: The working Email / SMS and Documents workspace appeared
  only as a broad Planned item, while the actual usable email/document surface
  was not represented separately from the SMS dependency.
- Before evidence: QA Settings showed `Email / SMS + Documents improvements` as
  Planned even though the top-level Email / SMS and Documents routes were live.
- Implemented fix: Mark the usable `Email and Documents workspace` available,
  keep `SMS provider-backed messaging` planned, and describe the provider gate
  without internal engineering details.
- Status: Implemented on branch; authenticated QA redeploy retest pending.
- After evidence: Local Settings shows the Email/Documents capability under
  Available now and SMS under Planned; demo Settings assertions pass.
- Verification performed: Live QA inspection, local browser interaction, demo
  visual QA.

### UIUX-011 — P2 — Programmatic PDF separator rendered as a replacement glyph

- Route/workflow: generated Client Invoice PDF → project/tax line
- Viewport: A4 output render
- Control/component: programmatic PDF generation
- Problem/friction: The inspected synthetic Client Invoice PDF rendered the
  middle-dot separator before `Tax` as a replacement `?` in the downloaded
  output, despite the in-app preview being readable.
- Before evidence: `artifacts/ui-ux-audit/documents/Client_Invoice_CI-QA-E2E-7F4K-001.pdf`
  and its rendered `client-invoice-render/page-1.png`.
- Implemented fix: Replace the renderer-sensitive middle dot with an ASCII
  hyphen in `documentGeneration.ts`.
- Status: Implemented on branch; a newly generated QA PDF after redeploy is
  still required for hosted output confirmation.
- After evidence: Renderer-safe separator regression test passes; native
  high-fidelity converter remains truthfully unavailable on QA.
- Verification performed: PDF metadata/text extraction and visual PNG review;
  focused tests. The inspected PDF had one page and no clipping/overlap.

## Live QA workflow results

| Flow | Result | Evidence |
| --- | --- | --- |
| Project creation | PASS | Created `QA-UX-20260911`; save notification and post-reload presence verified. Dialog wording defect reproduced. |
| RFQ supplier quotation | PASS for new write | Created `QUO-QA-UX-20260911` with non-zero line prices 123.45, 45.60, and 789.01; comparison reloaded with total PHP 30,405.20. Two older QA quotations still display zero values and were not rewritten. |
| Mixed-unit PO receipt | PASS with defect reproduced | Recorded 40 m and 20 bags on `PO-QA-E2E-7F4K-001`; remaining quantities and a second receipt action stayed visible. The untouched zero line first triggered the validation defect. |
| Payroll draft calculation | PASS | Calculation notification reported one worker snapshotted; reload showed period `CALCULATED` and the run remained valid. |

## Gmail provider results

- Connection state: PASS. QA displayed the connected Gmail identity and did not
  require reconnect. The state survived navigation and reload.
- Finance scan: PASS. A real bounded 30-day provider scan succeeded and returned
  three finance candidates. No candidate was imported or preserved because the
  available messages were not controlled synthetic content.
- Incremental sync: PASS for provider call/no-new result; pre-fix UI queue
  retention defect recorded as UIUX-001.
- Ordinary controlled send: PASS. The synthetic subject
  `HydroQualiSense QA ordinary email 2026-09-11T03-22-02-084Z` was sent to the
  connected QA account through Gmail with no attachment.
- Document attachment send: PASS. Issued Client Invoice
  `CI-QA-E2E-7F4K-001` was sent through Gmail with the exact programmatic PDF
  fallback attachment and `SENT` delivery history.
- Delivery history: PASS. Both records persisted after navigation/reload; the
  issued-invoice record showed recipient, subject, attachment name/source,
  sender label, provider status, and exact Client Billing owner return.
- Actual mailbox receipt: NOT EXERCISED separately. The scan path is finance
  signal-bounded and no unrelated mailbox content was inspected to locate the
  ordinary synthetic message.
- Inbound source routing/classification: NOT EXERCISED. No controlled synthetic
  supplier invoice, expense receipt, bank statement, or unsupported message was
  available for safe import testing.
- SMS: NOT CONFIGURED. No provider-backed send or delivery claim was made.

## Generated-document results

- In-app Purchase Order and Client Invoice previews rendered with correct
  company, counterparty, number, dates, line items, totals, and immutable
  snapshot wording in the inspected QA records.
- The downloaded synthetic Client Invoice PDF is one-page A4, visually readable,
  and has no clipping or overlap in the rendered PNG. The inspected output
  exposed the separator-glyph issue tracked as UIUX-011.
- The QA PO PDF download action was attempted, but the in-app browser did not
  surface a local download event or file; hosted file inspection is therefore
  NOT EXERCISED for that output.
- Company-template PDF and DOCX controls were disabled because the selected
  historical snapshots had no pinned template version. The QA health endpoint
  reports native high-fidelity conversion `UNAVAILABLE`; no converter path is
  claimed active.

## Assistant and accessibility results

- Assistant: PASS for discoverability and boundary wording. The drawer exposed
  navigation/questions and the Compose action explicitly says to prepare a
  draft for review; no silent send was exercised.
- Keyboard/focus: Existing dialog focus controls and named buttons were visible
  in the inspected workflows. No broad framework rewrite was justified.
- Practical accessibility: Gmail scope wording, modal headings, labels, and
  mobile tap targets were improved where concrete evidence showed friction.

## Remaining blockers and recommendations

QA certification remains **NOT READY**. SMS provider configuration/runtime proof,
hosted retest of this branch, a newly generated hosted PDF output, controlled
inbound Gmail fixtures/routing, separate mailbox-arrival proof, approved AI /
template provider validation, and recovery evidence remain outstanding. The
optional native high-fidelity PDF converter is unavailable on the current
Node/Render deployment. Production remained read-only. Worker Registration is
still paused.

Full machine-readable finding records are in `artifacts/ui-ux-audit/findings.json`.
The local visual QA manifest and screenshots are under
`artifacts/ui-ux-audit/after/`; representative before/after captures are under
`artifacts/ui-ux-audit/screenshots/`.
