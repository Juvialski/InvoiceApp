# UI-R4E App-wide Certification

Date: 2026-09-23
Repository: `Juvialski/InvoiceApp`
Branch: `codex/ui-r4e-app-wide-rollout`
Synchronized base: `bbd633f4709b36a1e0bc42d6cced202615aaa2d0`
Application source commit: `3ea57c1904a2ff3eb21296ab0149e00928fbc829`
Environment: local Windows development server, Chromium browser, synthetic HydroQualiSense demo workspace. No hosted, provider, live customer, QA deployment, or production environment was used.

## Scope delivered

- Removed the redundant permanent desktop shell row, duplicate product/page/account identity, permanent successful sync indicator, and global Export. Export is contextual to the authorized supplier-invoice register.
- Moved account identity, Settings, and Log out into the lower-left sidebar account area. Tablet and phone retain the compact navigation header.
- Routed legacy neutral surfaces, text, controls, borders, selected/focus states, and dark-mode contrast through the shared Astryx/HydroQualiSense semantic theme layer.
- Applied compact invoice filters, removable active-filter controls, and responsive invoice record cards. Narrow Expenses layouts use readable responsive cards including settlement and outstanding values.
- Applied the shared page/action hierarchy to Payroll, Email/SMS, Cash, Expenses, Equipment, Warehouse, and Procurement; retained consequential actions, confirmations, data authority, and persistence semantics.
- Preserved REL-AUTH-1 behavior and did not alter its state machine. No database, migration, payroll persistence, or auth/access behavior change was made.
- WEB-BRAND-1 remains separate and unimplemented.

## Certification runs

| Evidence | Result | Qualification |
|---|---:|---|
| Final R4E visual matrix | **188/188 passed** | 18 routes; Light and Dark across 1440, 1280, 768, and 390 px; System follows both OS preferences on Home, supplier invoices, and Payroll at all four widths; keyboard/account, responsive shell, filter overlay, route action, contrast, density, and demo chrome checks; 0 console errors, page errors, failed requests, navigation failures, or overflow failures |
| Supplemental Dark route audit | **15/15 passed** | Additional detail and recovery routes at desktop width after the main matrix |
| Focused affected UI/theme/shell tests | **42/42 passed** | Directly affected component test batch |
| Payroll lifecycle UI test | **4/4 passed** | Focused check after Payroll accessibility metadata correction |
| `npm.cmd run test:affected:agent` | **772 tests: 771 passed, 1 skipped, 0 failed** | 107 selected test files; database unaffected; no selector fallback |
| `npm.cmd run lint` | **passed** | Run on the integrated application source diff |
| `npm.cmd run build` | **passed** | Build completed; non-blocking existing toolchain warnings are recorded below |

The 188-scenario matrix and the 15 supplemental route checks were separate runs. The current `scripts/qa/demoScenarios.ts` includes those supplemental probes. The latest affected run completed after those QA scenario additions. Application lint/build evidence predates those QA-only scenario additions; no application source changed afterward.

The Light/Dark matrix used these local demo paths (each at 1440, 1280, 768, and 390 px):

| Route | Local demo path |
|---|---|
| Home | `/demo/app/dashboard` |
| Supplier Invoices | `/demo/app/invoices` |
| Invoice Review | `/demo/app/review?invoiceId=demo-invoice-07` |
| Payroll | `/demo/app/payroll` |
| Email and SMS | `/demo/app/email-sms?view=compose` |
| Cash and Banking | `/demo/app/cash` |
| Expenses | `/demo/app/expenses` |
| Procurement | `/demo/app/procurement` |
| Warehouse | `/demo/app/warehouse` |
| Equipment | `/demo/app/equipment` |
| Documents | `/demo/app/documents` |
| Reports | `/demo/app/reports` |
| Project Materials and Equipment | `/demo/app/projects/demo-project-warehouse/materials-equipment` |
| RFIs | `/demo/app/projects/demo-project-warehouse/rfis` |
| Submittals | `/demo/app/projects/demo-project-warehouse/submittals` |
| Site Logs | `/demo/app/projects/demo-project-warehouse/site-logs` |
| Vendors | `/demo/app/vendors` |
| Settings | `/demo/app/settings` |

System mode additionally followed OS Light and OS Dark on `/demo/app/dashboard`, `/demo/app/invoices`, and `/demo/app/payroll` at all four widths. The supplemental Dark desktop audit used these extra detail/recovery states:

- Project overview and financial control: `/demo/app/projects/demo-project-warehouse` and `/demo/app/projects/demo-project-solar`.
- Project documents and blueprint viewer: `/demo/app/projects/demo-project-warehouse/documents`.
- Engineering documents: `/demo/app/documents`.
- RFI missing-record recovery: `/demo/app/projects/demo-project-warehouse/rfis?rfiId=demo-rfi-missing-s3e`.
- Submittal missing-record recovery: `/demo/app/projects/demo-project-warehouse/submittals?submittalId=demo-sub-missing-s3e&roundId=demo-round-missing-s3e`.
- Site Log detail: `/demo/app/projects/demo-project-warehouse/site-logs?siteLogId=demo-site-log-wh-concrete`.
- Cash settlement: `/demo/app/cash?transactionId=demo-transaction-19`.
- Invoice extraction and supplier invoice detail: `/demo/app/extract` and `/demo/app/invoices/demo-invoice-01`.
- Payroll run: `/demo/app/payroll?runId=demo-payroll-run-9`.
- Client billing: `/demo/app/projects/demo-project-warehouse/billing?billingId=demo-client-billing-warehouse-02`.
- Assistant: `/demo/app/assistant`.
- Help Center article: `/help?topic=invoice-review`.

Initial bounded `agent:context` returned no matching workflow nodes; its single Jev context preflight had zero candidates and fell back without a live request. Jev test triage retained all 107 required test files (45/43/19 candidate stages; `jev-1.13.0`; 14,519 input / 1,587 output tokens; 1,355 ms; fallback=false). The deterministic selector remained authoritative.

The live Jev completion advisory observed all four declared evidence categories (`jev-1.13.0`; 4 candidates and 4 present; 615 input / 72 output tokens; 773 ms; fallback=false). It returned `unresolvedUncertainty=true` because its input also labeled database validation `not-applicable`; database work is outside this UI phase. The advisory does not make a merge decision.

## Lead visual inspection

The lead opened and inspected 49 captured screenshots, including all 18 Dark desktop routes, all four viewport widths in both Light and Dark for supplier invoices and Expenses, System snapshots, Home/Payroll/Email phone states, mobile filter sheet/focus, keyboard/account states, and action/gradient follow-ups.

Observed:

- Main page purpose and primary task content are visible without the removed desktop shell row.
- Dark foregrounds, control boundaries, selected/focus states, semantic status, and muted text remain legible in the inspected states. The Procurement gradient label measured 5.73:1 and its amount 10.92:1 against the corrected surface.
- Supplier invoice controls stay compact; active filters are removable; phone records remain readable without the wide register.
- Expenses no longer clips the register at 1440 px; responsive cards preserve description/date/category, project, payee, source, amount, settlement/outstanding, status, and actions.
- Phone navigation remains available, and Escape closes the account menu before the nav drawer while returning focus to the relevant trigger.
- No P0/P1 visual blocker was observed in the recorded local/demo scope.
- Settings shows an empty “Deployment company” placeholder in this synthetic demo because its DB-backed company controls are not mounted. This is a demo-data limitation, not evidence of hosted settings behavior.

Build emitted non-blocking warnings about the Inter theme font not loading, large chunks, and CJS `import.meta`. They did not fail the build.

## Remaining limits

This report certifies only the local synthetic/demo scope described above. Hosted QA, deployment session recovery trigger, external provider behavior, production, and live company settings remain unverified. The visual certification does not claim screen-reader certification or hosted/mobile-device certification.

## Screenshot manifest

All linked PNGs below were captured from the local synthetic/demo runs and are committed as durable evidence for the listed route, theme/state, and viewport. Filenames encode the scenario and viewport.

- [ui-r4e-invoice-directory--invoices--r4e-filter-disclosure-opened-at-phone-width--mobile-390.png](screenshots/r4e/ui-r4e-invoice-directory--invoices--r4e-filter-disclosure-opened-at-phone-width--mobile-390.png)
- [ui-r4e-keyboard-touch--dashboard--r4e-desktop-keyboard-focus-and-account-menu-verified--r4e-desktop-1440.png](screenshots/r4e/ui-r4e-keyboard-touch--dashboard--r4e-desktop-keyboard-focus-and-account-menu-verified--r4e-desktop-1440.png)
- [ui-r4e-keyboard-touch--dashboard--r4e-mobile-navigation-and-account-menu-verified--r4e-phone-390.png](screenshots/r4e/ui-r4e-keyboard-touch--dashboard--r4e-mobile-navigation-and-account-menu-verified--r4e-phone-390.png)
- [ui-r4e-theme-overlays--invoices--r4e-dark-phone-filter-sheet-contrast-and-focus-inspected--r4e-phone-390.png](screenshots/r4e/ui-r4e-theme-overlays--invoices--r4e-dark-phone-filter-sheet-contrast-and-focus-inspected--r4e-phone-390.png)
- [ui-r4e-visual-matrix--cash--r4e-dark-theme-visual-cash-and-banking--r4e-desktop-1440.png](screenshots/r4e/ui-r4e-visual-matrix--cash--r4e-dark-theme-visual-cash-and-banking--r4e-desktop-1440.png)
- [ui-r4e-visual-matrix--dashboard--r4e-dark-theme-visual-home--r4e-desktop-1440.png](screenshots/r4e/ui-r4e-visual-matrix--dashboard--r4e-dark-theme-visual-home--r4e-desktop-1440.png)
- [ui-r4e-visual-matrix--dashboard--r4e-dark-theme-visual-home--r4e-phone-390.png](screenshots/r4e/ui-r4e-visual-matrix--dashboard--r4e-dark-theme-visual-home--r4e-phone-390.png)
- [ui-r4e-visual-matrix--dashboard--r4e-light-theme-visual-home--r4e-phone-390.png](screenshots/r4e/ui-r4e-visual-matrix--dashboard--r4e-light-theme-visual-home--r4e-phone-390.png)
- [ui-r4e-visual-matrix--dashboard--r4e-system-os-dark-home--r4e-phone-390.png](screenshots/r4e/ui-r4e-visual-matrix--dashboard--r4e-system-os-dark-home--r4e-phone-390.png)
- [ui-r4e-visual-matrix--dashboard--r4e-system-os-light-home--r4e-phone-390.png](screenshots/r4e/ui-r4e-visual-matrix--dashboard--r4e-system-os-light-home--r4e-phone-390.png)
- [ui-r4e-visual-matrix--documents--r4e-dark-theme-visual-documents--r4e-desktop-1440.png](screenshots/r4e/ui-r4e-visual-matrix--documents--r4e-dark-theme-visual-documents--r4e-desktop-1440.png)
- [ui-r4e-visual-matrix--equipment--r4e-dark-theme-visual-equipment--r4e-desktop-1440.png](screenshots/r4e/ui-r4e-visual-matrix--equipment--r4e-dark-theme-visual-equipment--r4e-desktop-1440.png)
- [ui-r4e-visual-matrix--expenses--r4e-dark-theme-visual-expenses--r4e-desktop-1440.png](screenshots/r4e/ui-r4e-visual-matrix--expenses--r4e-dark-theme-visual-expenses--r4e-desktop-1440.png)
- [ui-r4e-visual-matrix--expenses--r4e-dark-theme-visual-expenses--r4e-laptop-1280.png](screenshots/r4e/ui-r4e-visual-matrix--expenses--r4e-dark-theme-visual-expenses--r4e-laptop-1280.png)
- [ui-r4e-visual-matrix--expenses--r4e-dark-theme-visual-expenses--r4e-phone-390.png](screenshots/r4e/ui-r4e-visual-matrix--expenses--r4e-dark-theme-visual-expenses--r4e-phone-390.png)
- [ui-r4e-visual-matrix--expenses--r4e-dark-theme-visual-expenses--r4e-tablet-768.png](screenshots/r4e/ui-r4e-visual-matrix--expenses--r4e-dark-theme-visual-expenses--r4e-tablet-768.png)
- [ui-r4e-visual-matrix--expenses--r4e-light-theme-visual-expenses--r4e-desktop-1440.png](screenshots/r4e/ui-r4e-visual-matrix--expenses--r4e-light-theme-visual-expenses--r4e-desktop-1440.png)
- [ui-r4e-visual-matrix--expenses--r4e-light-theme-visual-expenses--r4e-laptop-1280.png](screenshots/r4e/ui-r4e-visual-matrix--expenses--r4e-light-theme-visual-expenses--r4e-laptop-1280.png)
- [ui-r4e-visual-matrix--expenses--r4e-light-theme-visual-expenses--r4e-phone-390.png](screenshots/r4e/ui-r4e-visual-matrix--expenses--r4e-light-theme-visual-expenses--r4e-phone-390.png)
- [ui-r4e-visual-matrix--expenses--r4e-light-theme-visual-expenses--r4e-tablet-768.png](screenshots/r4e/ui-r4e-visual-matrix--expenses--r4e-light-theme-visual-expenses--r4e-tablet-768.png)
- [ui-r4e-visual-matrix--inbox--r4e-dark-theme-visual-email-and-sms--r4e-desktop-1440.png](screenshots/r4e/ui-r4e-visual-matrix--inbox--r4e-dark-theme-visual-email-and-sms--r4e-desktop-1440.png)
- [ui-r4e-visual-matrix--inbox--r4e-dark-theme-visual-email-and-sms--r4e-phone-390.png](screenshots/r4e/ui-r4e-visual-matrix--inbox--r4e-dark-theme-visual-email-and-sms--r4e-phone-390.png)
- [ui-r4e-visual-matrix--inbox--r4e-light-theme-visual-email-and-sms--r4e-phone-390.png](screenshots/r4e/ui-r4e-visual-matrix--inbox--r4e-light-theme-visual-email-and-sms--r4e-phone-390.png)
- [ui-r4e-visual-matrix--invoices--r4e-dark-theme-visual-supplier-invoices--r4e-desktop-1440.png](screenshots/r4e/ui-r4e-visual-matrix--invoices--r4e-dark-theme-visual-supplier-invoices--r4e-desktop-1440.png)
- [ui-r4e-visual-matrix--invoices--r4e-dark-theme-visual-supplier-invoices--r4e-laptop-1280.png](screenshots/r4e/ui-r4e-visual-matrix--invoices--r4e-dark-theme-visual-supplier-invoices--r4e-laptop-1280.png)
- [ui-r4e-visual-matrix--invoices--r4e-dark-theme-visual-supplier-invoices--r4e-phone-390.png](screenshots/r4e/ui-r4e-visual-matrix--invoices--r4e-dark-theme-visual-supplier-invoices--r4e-phone-390.png)
- [ui-r4e-visual-matrix--invoices--r4e-dark-theme-visual-supplier-invoices--r4e-tablet-768.png](screenshots/r4e/ui-r4e-visual-matrix--invoices--r4e-dark-theme-visual-supplier-invoices--r4e-tablet-768.png)
- [ui-r4e-visual-matrix--invoices--r4e-light-theme-visual-supplier-invoices--r4e-desktop-1440.png](screenshots/r4e/ui-r4e-visual-matrix--invoices--r4e-light-theme-visual-supplier-invoices--r4e-desktop-1440.png)
- [ui-r4e-visual-matrix--invoices--r4e-light-theme-visual-supplier-invoices--r4e-laptop-1280.png](screenshots/r4e/ui-r4e-visual-matrix--invoices--r4e-light-theme-visual-supplier-invoices--r4e-laptop-1280.png)
- [ui-r4e-visual-matrix--invoices--r4e-light-theme-visual-supplier-invoices--r4e-phone-390.png](screenshots/r4e/ui-r4e-visual-matrix--invoices--r4e-light-theme-visual-supplier-invoices--r4e-phone-390.png)
- [ui-r4e-visual-matrix--invoices--r4e-light-theme-visual-supplier-invoices--r4e-tablet-768.png](screenshots/r4e/ui-r4e-visual-matrix--invoices--r4e-light-theme-visual-supplier-invoices--r4e-tablet-768.png)
- [ui-r4e-visual-matrix--invoices--r4e-system-os-dark-supplier-invoices--r4e-desktop-1440.png](screenshots/r4e/ui-r4e-visual-matrix--invoices--r4e-system-os-dark-supplier-invoices--r4e-desktop-1440.png)
- [ui-r4e-visual-matrix--invoices--r4e-system-os-light-supplier-invoices--r4e-desktop-1440.png](screenshots/r4e/ui-r4e-visual-matrix--invoices--r4e-system-os-light-supplier-invoices--r4e-desktop-1440.png)
- [ui-r4e-visual-matrix--payroll--r4e-dark-theme-visual-payroll--r4e-desktop-1440.png](screenshots/r4e/ui-r4e-visual-matrix--payroll--r4e-dark-theme-visual-payroll--r4e-desktop-1440.png)
- [ui-r4e-visual-matrix--payroll--r4e-dark-theme-visual-payroll--r4e-phone-390.png](screenshots/r4e/ui-r4e-visual-matrix--payroll--r4e-dark-theme-visual-payroll--r4e-phone-390.png)
- [ui-r4e-visual-matrix--payroll--r4e-light-theme-visual-payroll--r4e-phone-390.png](screenshots/r4e/ui-r4e-visual-matrix--payroll--r4e-light-theme-visual-payroll--r4e-phone-390.png)
- [ui-r4e-visual-matrix--procurement--r4e-dark-theme-visual-procurement--r4e-desktop-1440.png](screenshots/r4e/ui-r4e-visual-matrix--procurement--r4e-dark-theme-visual-procurement--r4e-desktop-1440.png)
- [ui-r4e-visual-matrix--procurement--r4e-light-theme-visual-procurement--r4e-desktop-1440.png](screenshots/r4e/ui-r4e-visual-matrix--procurement--r4e-light-theme-visual-procurement--r4e-desktop-1440.png)
- [ui-r4e-visual-matrix--project-materials-equipment--r4e-dark-theme-visual-project-materials-and-equipment--r4e-desktop-1440.png](screenshots/r4e/ui-r4e-visual-matrix--project-materials-equipment--r4e-dark-theme-visual-project-materials-and-equipment--r4e-desktop-1440.png)
- [ui-r4e-visual-matrix--reports--r4e-dark-theme-visual-reports--r4e-desktop-1440.png](screenshots/r4e/ui-r4e-visual-matrix--reports--r4e-dark-theme-visual-reports--r4e-desktop-1440.png)
- [ui-r4e-visual-matrix--reports--r4e-light-theme-visual-reports--r4e-desktop-1440.png](screenshots/r4e/ui-r4e-visual-matrix--reports--r4e-light-theme-visual-reports--r4e-desktop-1440.png)
- [ui-r4e-visual-matrix--review--r4e-dark-theme-visual-invoice-review--r4e-desktop-1440.png](screenshots/r4e/ui-r4e-visual-matrix--review--r4e-dark-theme-visual-invoice-review--r4e-desktop-1440.png)
- [ui-r4e-visual-matrix--rfis--r4e-dark-theme-visual-rfis--r4e-desktop-1440.png](screenshots/r4e/ui-r4e-visual-matrix--rfis--r4e-dark-theme-visual-rfis--r4e-desktop-1440.png)
- [ui-r4e-visual-matrix--settings--r4e-dark-theme-visual-settings--r4e-desktop-1440.png](screenshots/r4e/ui-r4e-visual-matrix--settings--r4e-dark-theme-visual-settings--r4e-desktop-1440.png)
- [ui-r4e-visual-matrix--settings--r4e-light-theme-visual-settings--r4e-desktop-1440.png](screenshots/r4e/ui-r4e-visual-matrix--settings--r4e-light-theme-visual-settings--r4e-desktop-1440.png)
- [ui-r4e-visual-matrix--site-logs--r4e-dark-theme-visual-site-logs--r4e-desktop-1440.png](screenshots/r4e/ui-r4e-visual-matrix--site-logs--r4e-dark-theme-visual-site-logs--r4e-desktop-1440.png)
- [ui-r4e-visual-matrix--submittals--r4e-dark-theme-visual-submittals--r4e-desktop-1440.png](screenshots/r4e/ui-r4e-visual-matrix--submittals--r4e-dark-theme-visual-submittals--r4e-desktop-1440.png)
- [ui-r4e-visual-matrix--vendors--r4e-dark-theme-visual-vendors--r4e-desktop-1440.png](screenshots/r4e/ui-r4e-visual-matrix--vendors--r4e-dark-theme-visual-vendors--r4e-desktop-1440.png)
- [ui-r4e-visual-matrix--warehouse--r4e-dark-theme-visual-warehouse--r4e-desktop-1440.png](screenshots/r4e/ui-r4e-visual-matrix--warehouse--r4e-dark-theme-visual-warehouse--r4e-desktop-1440.png)
