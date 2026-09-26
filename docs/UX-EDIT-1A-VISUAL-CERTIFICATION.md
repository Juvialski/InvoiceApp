# UX-EDIT-1A — Supplier Invoice Visual Certification

Status: **PASS — LOCAL PRODUCTION-PREVIEW / SYNTHETIC DEMO ONLY**
Synchronized base: `c9498c01db92ed13fa6b1452d2cc3d56ea8b9235`
Implementation branch: `codex/ux-edit-1a`
Application commit: `ac138db65cf066debbd8cb78553587d975d94f3d`
Environment: local Vite production preview at `127.0.0.1:4173`, `/demo/app`
Data: deterministic, sanitized synthetic Supplier Invoice demo records

## Visual findings

The Supplier Invoice screen now presents the original document beside the
editable extracted worksheet at 1440×900 and 1280×800. At 1280×800, the source
document and first invoice fields are visible together without a page scroll.
The source pane stays available while the user scrolls the worksheet. Tablet
and phone layouts stack the source above the worksheet; they do not force narrow
columns. The primary review shows invoice identity, readiness, the worksheet,
and one sticky queue Verify action. Vendor/description resolvers and downstream
allocation, PO-match, receipt, settlement, diagnostic, and secondary-action
surfaces stay collapsed until requested.

The reviewed Canva reference was used for the source-left / extracted-right
composition and existing worksheet tokens. The browser adapts spacing and
progressive disclosure to the application rather than copying static frame
coordinates. All visible invoice content in these captures is synthetic.

## Screenshots

| Viewport | Evidence |
| --- | --- |
| 1440×900 | [Desktop review](/docs/evidence/ux-edit-1a/desktop-1440x900.png) |
| 1280×800 | [Constrained laptop review](/docs/evidence/ux-edit-1a/laptop-1280x800.png) |
| 768×1024 | [Tablet stacked review](/docs/evidence/ux-edit-1a/tablet-768x1024.png) |
| 390×844 | [Phone stacked review](/docs/evidence/ux-edit-1a/phone-390x844.png) |

## Browser matrix

The exact-head local Demo Visual QA run recorded **6/6 scenarios passed** across
the four requested review viewports plus verified read-only checks at 1280×800
and 390×844. It recorded zero console errors, page errors, failed requests,
navigation failures, or horizontal overflow.

The review scenarios checked that one pointer click opens and focuses text,
date, and select editors; Escape cancels; Enter edits; Tab and Shift+Tab commit
and navigate; copy returns the whole cell value while editing; Save remains
available; and Verify remains outside the worksheet and in the queue footer
when reviewing a queue. Verified invoice cells remain `aria-readonly` and do
not render an editor after a pointer click. The four downstream workflows and
secondary detail surfaces remain collapsed by default.

The browser run exercised only synthetic demo records. It is not hosted QA,
provider certification, production validation, or a claim of full WCAG
conformance.

## Invariants and validation boundary

- The preserved source document, email source, compare/history tabs, extraction
  snapshot, and correction history remain available.
- The four extracted worksheet sections share one draft and one Save/Discard
  boundary. Protected/calculated monetary facts, source provenance, canonical
  Vendor resolution, original currency, readiness checks, and human
  verification authority remain unchanged.
- Project allocation, PO matching, material intake, settlement/payment,
  correction, linked Expense details, and other consequential actions remain
  deliberate existing workflows. They were collapsed or moved behind secondary
  controls; no new authority or persistence path was added.
- No migration, RPC, RLS, schema, database contract, financial model, or
  provider behavior changed. Docker, Supabase, hosted, and production
  validation were not applicable and were not run.
- The TypeSafe context checkpoint was preflight-rejected with `no-candidates`
  and `fallback=true`; deterministic source inspection and test selection
  remained authoritative.

The next planned phase remains **WB-1 — Unified Operations Workbook Schema &
Shell**. It was not started in this implementation.
