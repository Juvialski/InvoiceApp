# UX-S3E — Accessibility, Responsive, and Visual Certification

Status: **COMPLETE FOR THE RECORDED LOCAL/DEMO CERTIFICATION SCOPE**
Reviewed application/evidence SHA: `dd75c8c`
Starting synchronized `main` SHA: `935c9083f08ffbda940cf3456f85b14938adf23a`
Branch: `codex/ux-s3e-accessibility-responsive-visual-closeout`
Reviewed: **2026-09-22**

## Evidence boundary

This is local production-preview / safe-demo evidence. It is not authenticated
hosted QA, provider certification, production evidence, or full WCAG
certification.

| Field | Evidence |
| --- | --- |
| Environment | Local HydroQualiSense server at `http://127.0.0.1:3000`, demo application mode |
| Data | Synthetic repository fixtures only; no customer records, provider sends, production writes, destructive lifecycle actions, or fixture creation |
| Browser catalog | Existing `scripts/qa/demoScenarios.ts` and `scripts/qa/structuredEvidence.ts`; no parallel harness |
| Final manifest | `artifacts/demo-visual-qa-ux-s3e-final/manifest.json` (local/transient output) |
| Viewports | Desktop `1440x1000`; constrained laptop `1366x768`; tablet `768x1024`; phone `390x844` |
| Final catalog | 131 screenshots, 112 interaction scenarios, 36 routes, 4 viewports |
| Automated result | 131/131 PASS; 0 console errors; 0 page errors; 0 failed requests; 0 overflow failures |
| Manual browser evidence | CUA and Playwright inspection of shared focus, contextual Help, mobile navigation, dialogs, long phone workflows, and final screenshots |

## Coverage and visual disposition

The lead agent inspected the final rendered screenshots rather than treating
the browser exit code as visual certification.

| Family / representative final evidence | Viewports | Disposition |
| --- | --- | --- |
| Shared shell, header, mobile navigation, loading/error/empty framing | desktop, laptop, tablet, phone; `dashboard--dashboard--mobile-navigation-opened--mobile-390.png` | **ACCEPTABLE** — navigation drawer is visible, content is not hidden by the shell, and the drawer remains a deliberate overlay |
| Help Center index/article, route Help action, contextual Help | all four Help viewports; `help--help--help-center-index-rendered--mobile-390.png`; `contextual-help--inbox--email-attachment-contextual-help-verified--mobile-390.png` | **ACCEPTABLE** — task-first Help content remains readable; contextual explanation is secondary and keyboard/touch reachable |
| Projects card-first portfolio | desktop, laptop, tablet, phone; `projects--projects--portfolio-dashboard-verified--{desktop-1440,laptop-1366,tablet-768,mobile-390}.png` | **ACCEPTABLE** — title, compact toolbar, and project cards precede portfolio/workbook disclosures; cards preserve identity and attention signals |
| Project Workspace, Cost Codes/Budget Control, Materials/Equipment | desktop, laptop, tablet, phone representative states | **ACCEPTABLE** for the captured safe-demo states; worksheet fallbacks preserve row identity and protected semantics |
| Procurement registers and RFQ/PO draft editors | desktop, tablet, phone; `procurement--procurement--rfq-and-purchase-order-draft-worksheets-verified--mobile-390.png` | **ACCEPTABLE** — the PO working canvas uses available width, the phone dialog remains scrollable, and Save/Close/lifecycle actions remain reachable |
| Supplier Invoice source-first review and extracted worksheet | desktop, tablet, phone; `invoices--review--source-first-supplier-invoice-worksheet-review-opened--mobile-390.png` | **ACCEPTABLE** for the populated synthetic review; source remains first, normal provenance is quiet, exceptional states remain explicit |
| Cash & Banking browse, allocation, result, and return context | desktop, tablet, phone; `cash-banking--cash-settlement--cash-settlement-result-and-return-context-verified--mobile-390.png` | **ACCEPTABLE** — staged selection/review/confirmation/result remains legible; no transaction action is implied by suggestion alone |
| Payroll normal cycle and approved -> Cash & Banking continuation | desktop and phone; `payroll--payroll-run--approved-payroll-cash-banking-settlement-handoff-verified--mobile-390.png` | **ACCEPTABLE** — approved remains distinct from payment and the next settlement action is visible |
| Documents, previews, Email/SMS, Vendors, Reports, Settings, Warehouse, Equipment, Client Billing | representative desktop/tablet/phone catalog states | **ACCEPTABLE** for the available safe-demo fixtures; provider and authenticated data boundaries remain visible and truthful |
| RFI/Submittal detail recovery | desktop; `rfis--rfi-detail--missing-record-recovery-rendered--desktop-1440.png` and corresponding Submittal state | **ACCEPTABLE AS RECOVERY EVIDENCE ONLY** — missing records show a clear warning and Return to register; populated detail and stale recovery states remain **DEEPER WORKFLOW REVIEW** because the safe-demo evidence does not establish them |

No final rendered state was classified as a P0/P1 visual blocker. The one
concrete failure found during the initial run was stale QA fixture targeting,
not a hidden product mutation or permission defect.

## Accessibility and keyboard/focus evidence

- Mobile navigation was activated with keyboard Enter. Focus entered the
  drawer's Close navigation control; Escape closed the drawer and restored focus
  to Open navigation. The final scenario remains open at capture time so the
  screenshot also proves the visible mobile state.
- Contextual Help was activated with keyboard Enter. The final assertion verifies
  one dialog, `aria-modal="false"`, trigger focus while the non-modal popover is
  open, Escape dismissal, and focus restoration to Attachment eligibility help.
  CUA independently reproduced the same open/Escape/focus-return behavior.
- RFQ Issue, RFQ draft, and Purchase Order draft dialogs were opened at the
  desktop/tablet/phone scenario viewports. Focus entered the dialog, Escape
  restored focus to the opener, and the scenario reopened the PO editor so the
  final screenshot retained the working state.
- A targeted phone probe scrolled the Purchase Order dialog body from
  `scrollTop=0` to `scrollTop=1384`; the modal action bar remained fully
  visible in the `390x844` viewport (`top=769`, `bottom=836`).
- Account-menu Escape restoration was checked separately at desktop.
- Existing reduced-motion handling remains covered by the shared UI tests.
- No interactive confirmation, approval, payment, receipt, settlement, send,
  or lifecycle action was executed during visual certification.

## Concrete correction and regression coverage

### S3E-001 — stale missing-record scenario IDs — RESOLVED

The prior RFI scenario targeted populated `demo-rfi-wh-001` and the prior
Submittal scenario targeted populated `demo-sub-wh-014`, so the “missing
record recovery” assertions timed out even though the rendered routes were
healthy. The scenarios now target deterministic absent IDs
`demo-rfi-missing-s3e` and `demo-sub-missing-s3e`. The focused catalog
test prevents the evidence from silently drifting back to populated records.

The evidence harness also now covers keyboard activation and focus restoration
for mobile navigation, contextual Help, RFQ dialogs, and Purchase Order
dialogs. No product authority, persistence, lifecycle, financial, permission,
provenance, or database code was changed.

## Validation record

- `npx.cmd tsx --test tests/demoQaRouteCoverage.test.ts`: RED before the
  correction, then PASS.
- Focused UI/evidence suite:
  `npx.cmd tsx --test tests/demoQaRouteCoverage.test.ts tests/structuredBrowserEvidence.test.ts tests/contextualHelp.test.ts tests/uiHardeningShared.test.ts tests/uiUxResponsive.test.ts`
  — **48/48 PASS**.
- Final local production-preview Demo Visual QA:
  **131/131 PASS**, 131 screenshots, 112 interactions, 36 routes, 4
  viewports, zero console/page/request/overflow failures.
- `npm.cmd run test:affected:agent`: **148/148 PASS**, 18/369 tests
  selected, database fallback disabled/unaffected.
- `npm.cmd run lint`: ESLint and TypeScript passed.
- `npm.cmd run build`: passed. Existing Astryx Inter-font, chunk-size,
  and CJS `import.meta` warnings remain non-blocking repository warnings.
- `npm.cmd run workflow-map:consistency`: passed — 262 nodes, 346 edges,
  34 invariants, 10 diagrams.
- `git diff --check`: passed.
- Docker/Supabase was not applicable: no migration, RLS, RPC, trigger,
  persistence authority, financial guard, or database contract changed.
- Hosted QA, provider runtime certification, production, authenticated
  company-data evidence, and PDF-converter certification were not run or
  claimed.

## Jev / TypeSafe diagnostics

- Deterministic `agent:context` produced a fresh fallback packet because the
  broad S3E query had no exact Workflow Map match; it selected no source
  candidates and remained navigation-only.
- The one live TypeSafe context checkpoint returned
  `no-candidates`: zero live requests, zero selected candidates, fallback
  true. No required file or test was removed.
- The one sanitized live TypeSafe completion checkpoint returned `TypeError`
  before a response. No Jev completion judgment was used; deterministic tests,
  browser evidence, source inspection, and lead review remain authoritative.
- Live TypeSafe documentation URLs were unavailable through the configured web
  reader; the installed SDK, repository TypeSafe CLI contracts, and existing
  local guidance were used without inventing a new integration or changing
  dependencies.

## Final disposition and non-claims

UX-S3E is complete for the local/demo accessibility, keyboard/focus,
responsive, and visual certification scope recorded here. The result does not
claim hosted/authenticated QA, provider readiness, production readiness,
authenticated customer-data coverage, full WCAG conformance, or populated
RFI/Submittal detail certification. The product freeze remains active; no
Worker Registration or other net-new product phase was started.
