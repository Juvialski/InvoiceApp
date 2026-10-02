# HydroQualiSense Marketing Video Plan

Status: **MKT-V3A Remotion studio and first local portrait commercial draft are implemented; Canva Premium finishing remains.**

## Campaign objective

Prepare a truthful product showcase for engineering and water-treatment contractors. The creative direction follows the reviewed contractor/workbook reel: start with real work materials, move into a familiar compact worksheet, then show source-first supplier invoice review and connected purchasing context.

The application footage must come from the real HydroQualiSense application. Canva may add titles, labels, transitions, and social layouts around those captures. Generated B-roll must not depict or replace HydroQualiSense UI.

## MKT-V3A Remotion production workspace and first commercial draft

MKT-V3A makes **Remotion the primary code-driven composition and motion system**. Canva Premium is the later finishing tool for a recorded Taglish voice track, music, timing polish, and platform exports. The Remotion draft is already rendered and designed to stand on its own before that finishing step.

The isolated workspace is `tools/marketing-video/`. It pins Remotion `4.0.530` and its media/transition packages in a workspace-local `package.json` and `package-lock.json`; no Remotion or React dependency was added to the application package. Its scene timeline, assets, motion tokens, easing, desktop/mobile frames, title/caption, callout, cursor, audio slots, asset preparation, validation, render, and contact-sheet tools are separated into small files.

The local contractor reel described by the earlier Excel-Simplicity note was still available in Downloads. It is a 136.51-second vertical MP4. I sampled it read-only from opening through closing: it starts with paperwork and a working contractor, moves quickly into real spreadsheet entry, uses brief natural Taglish lines, presents a short product offer near the end, then closes on a project cost/profit calculator sheet. MKT-V3A borrows the direct pacing and practical tone. It does not copy the reel's layout, logos, pricing, or workbook artwork. The sampled reference contact sheet is an ignored local review artifact at `artifacts/marketing-video/mkt-v3a/reference-reel-contact-sheet.png`.

Open-source research was read-only. Useful patterns came from the [Remotion Marketing Video Skill](https://github.com/xsourabhsharma/remotion-marketing-video-skill) (deterministic scene planning and asset checks), [SaaS Product Demo Video](https://github.com/noamdorr/saas-product-demo-video) (story beats and reusable motion primitives), [Marketing Studio](https://github.com/ucsandman/marketing-studio) (separate production engine from product-specific captures and tokens), and [product-demo-video](https://github.com/realruian/product-demo-video) (real application captures inside a steady, repeatable frame). Official [Remotion transition guidance](https://www.remotion.dev/docs/transitioning) was used for overlap-aware scene timing, and the current [`@remotion/media` video component guidance](https://www.remotion.dev/docs/html5-video) informed clip playback. No source code was copied.

The first commercial is `MKT-V3A — HydroQualiSense Full-App Commercial`:

| Scene | Source | Held duration |
| --- | --- | ---: |
| Opening | Dashboard | 5.0 s |
| Workspace overview | Projects portfolio | 5.0 s |
| Project controls | Water-treatment project | 6.5 s |
| Familiar editing | Operations Workbook | 4.5 s |
| Supplier invoice review | Source document beside extracted details | 8.0 s |
| Procurement | RFQs, then Purchase Orders | 7.0 s |
| Finance and operations | Expenses, Client Billing, Cash & Banking, Payroll, Warehouse | 9.0 s |
| Engineering records | Project documents, RFIs, Site Logs | 6.5 s |
| Mobile support | Desktop Site Logs into its vertical capture | 5.0 s |
| Closing | Projects portfolio into product end card | 7.0 s |

The ten scene holds total 63.5 seconds before overlap; the composed runtime is **58.7 seconds** after eight 18-frame transitions. Motion uses restrained easing, two slow detail pushes, stable frame sizes, three transition styles (fade, slide, wipe), and direct montage cuts. The workbook occupies 4.5 seconds, or about 7.7% of the finished runtime. The Taglish voiceover direction is in `tools/marketing-video/src/data/script.ts`; the draft itself is intentionally silent. Separate voiceover, music, and UI-sound slots are in `tools/marketing-video/src/data/audio.ts`. No paid TTS, music, or Higgsfield generation was used.

Every screen comes from the captured application. The recaptured MKT-V2A set contains 32 PC WebM clips and 39 stills; this composition copies only **16 selected PC WebM clips and one selected vertical Site Logs still** into ignored `tools/marketing-video/public/captures/`. Preparation prefers a matching WebM and falls back to that capture's still when the clip is missing. The copied manifest keeps route, dataset, dimensions, source SHA, and claim boundary. The screen's own synthetic-demo banner remains visible, and a small frame label also says `Synthetic sample data`. The standard demo and Silverfern fictional workspace remain separate.

The recorded PC WebM files begin with the route's load sequence before the seven-second steady hold. The local asset manifest trims 105 Remotion timeline frames (3.5 seconds at 30 FPS) to skip the initial loading layout. MKT-V2A's vertical set is still-only by design.

The MKT-V2A procurement label previously opened Purchase Orders for both shots. MKT-V3A fixes the local capture selector so the RFQ shot opens the RFQ tab; a focused contract test covers both selectors. This changes capture tooling only and does not change application behavior.

The 9:16 master is registered as `HydroQualiSenseCommercial9x16` at **1080×1920, 30 FPS**. A responsive `HydroQualiSenseCommercial16x9` composition is also registered at **1920×1080, 30 FPS**; it has a rendered layout-check still but no full landscape export in this phase.

The local preview render is `artifacts/marketing-video/mkt-v3a/hydroqualisense-mkt-v3a-preview.mp4` (H.264, CRF 18, 58.7 seconds, approximately 14.8 MB). The still/contact sheet are `artifacts/marketing-video/mkt-v3a/hydroqualisense-mkt-v3a-opening-frame.png` and `artifacts/marketing-video/mkt-v3a/hydroqualisense-mkt-v3a-contact-sheet.png`. These outputs and copied capture assets are ignored and are not committed. The source capture manifest records app SHA `1d08ff2c816245b768c40420d8bd03f8a055cd08` and `workingTreeClean: false` because the capture-tab correction is part of the current MKT-V3A branch.

From the repository root, run:

```powershell
npm.cmd --prefix tools/marketing-video ci
npm.cmd --prefix tools/marketing-video test
npm.cmd --prefix tools/marketing-video run typecheck
npm.cmd --prefix tools/marketing-video run assets:validate
npm.cmd --prefix tools/marketing-video run compositions
npm.cmd --prefix tools/marketing-video run render:preview
npm.cmd --prefix tools/marketing-video run contact-sheet
```

If the MKT-V2A capture folder is missing, rebuild the app and run `npx.cmd tsx scripts/marketing-capture.ts` from the repository root. `assets:prepare` will use WebM where available and use the corresponding still otherwise. Use `npm.cmd --prefix tools/marketing-video run render:landscape` for a 16:9 export; later platform cutdowns can use the same scene data with shorter scene selections.

Canva Premium finishing remains: record or commission natural Taglish narration, select properly licensed background music, align the mix to the existing scene timing, and export approved social cutdowns. Keep all application imagery tied to the real HydroQualiSense captures. The UI remains a real application capture in every format.

## MKT-V2A full-app marketing source capture

MKT-V2A expands the material library beyond workbook-led and mobile-heavy footage. It produces independent, silent PC clips and high-resolution stills for the app's existing project, finance, procurement, workforce, warehouse, engineering, document, and communications workflows. It does **not** assemble a storyboard, add narration, generate B-roll, or export a finished video.

Run `npm.cmd run build`, then `npx.cmd tsx scripts/marketing-capture.ts`. This now runs MKT-V2A. Add `--mkt-v1a` only to reproduce the earlier capture set. Output is written to the ignored local folder `artifacts/marketing-capture/mkt-v2a-full-app/`:

- `stills/pc-1080p/` contains one 3840×2160 PNG per captured PC route.
- `videos/pc-1080p/` contains one silent 1920×1080 WebM clip per PC route. Each route is captured in its own browser context, with a seven-second steady hold after the view is ready.
- `stills/vertical-stills/` contains seven selected 1080×1920 stills. MKT-V2A does not produce a vertical screen-recording session.
- `manifest.json` records the source SHA, dirty/clean source state, exact routes, dataset source, claim boundary, viewport, capture profile, stills, and clips.

The final committed-source local run produced **39 stills (32 PC, 7 vertical) and 32 PC clips**. The manifest records source SHA `e944eaa951c06ff0f52f72e4af30c4449983c192` with `workingTreeClean: true`; all 71 media references exist. The capture output is ignored and remains a local artifact.

The PC clips hide the pointer and suppress CSS animation and transitions during capture. They remain silent and have no subtitles, title cards, or voiceover so a later editor can place Tagalog/Taglish narration naturally. The PNGs are stable source frames for crop, framing, and title placement. The opening and closing images are unaltered application screens: the workspace Dashboard opens the material, and the Projects portfolio closes it. Titles and closing copy belong in the later editing stage, outside the operational records.

Capture records are intentionally separated by source dataset. The marked **MKT-V1A Silverfern fictional workspace** frames show the fictional water-treatment portfolio, procurement, expenses, and invoice review data. Broader workflow coverage uses the regular **Standard public synthetic demo** seed. These are separate clips; the broader demo records must not be described as Silverfern transactions. Both keep the visible synthetic-demo disclosure. No live provider send, invoice verification, financial lifecycle action, QA database, production service, or migration is used.

The expanded source surfaces are:

| Area | Captured views | Claim boundary |
| --- | --- | --- |
| Overview and projects | Dashboard, project portfolio, project overview, budget and cost controls | No customer performance, adoption, or savings claim; contract value and project budget stay separate |
| Client billing | Project billing workspace | Synthetic records only; no tax or collections-compliance claim |
| Procurement and supplier payables | RFQs, Purchase Orders, supplier invoices, review queue, source-first invoice review, Expenses | RFQ/PO values and invoice evidence keep their existing lifecycle meaning; no supplier endorsement, extraction-quality, or savings claim |
| Workforce, cash, and stock | Payroll, Cash & Banking, Warehouse, Equipment, project Materials & Equipment | Synthetic sample data; no payment, bank/device connection, payroll-compliance, or real-time-stock claim |
| Engineering and records | Project documents, RFIs, Submittals, daily Site Logs, Documents | Synthetic coordination data; no safety, engineering approval, completeness, or compliance certification claim |
| Communications and reporting | Email composition, delivery history, SMS status, Reports | Screens only; no provider-backed delivery certification, measured company outcomes, or performance percentages |
| Existing workbook | One Operations Workbook view | Five supported sheets; not full Excel parity or a formula engine |

The Assistant capture is a UI sample from the local public demo. Its scripted responses are not evidence of live model quality or autonomous actions; do not narrate a prepared action as executed. The extraction and invoice review screens likewise do not certify extraction accuracy, tax treatment, or a live provider connection.

Capture files are ignored working artifacts and are not committed to the repository. Run the command again on the desired source SHA to create a matching asset set.

## MKT-V1A dataset

The campaign workspace is `Silverfern Water Systems Corporation`, a fictional Philippine water-treatment contractor used only by the isolated local demo capture. Its names and records do not identify Hydroqualisense Solutions Corp. or assert a relationship with any real client or supplier.

The five project records are:

| Code | Project | State | Financial context |
| --- | --- | --- | --- |
| WTR-26-014 | Clark Industrial Water Treatment Upgrade | Active | PHP contract value and project budget remain separate |
| WTR-26-018 | Laguna Food Plant RO Expansion | Active | RO membrane procurement and treatment media costs |
| WTR-26-021 | San Fernando Commercial Center Water System Rehabilitation | Active | Booster-pump package and site repairs |
| WTR-26-008 | Bacolod Wastewater Treatment Recovery | Completed | Close-out cost-code history |
| WTR-26-023 | Meycauayan Process Water Reuse Assessment | Planning | Planning budget only; no contract value recorded |

Eight fictional vendors cover pumps and motors, industrial equipment, filtration, pipe and valve supply, control panels, process instrumentation, water-treatment chemicals, and calibration services. Cost codes use mobilization, mechanical equipment, piping, controls, civil works, treatment media, and commissioning categories. Eight project expenses use natural descriptions and varied DRAFT, APPROVED, and PAID states.

| Fictional supplier | Category |
| --- | --- |
| Flowcrest Pump & Motor Supply | Pumps and motors |
| Ridgepoint Industrial Equipment Trading | Mechanical equipment |
| Streamwell Filtration Supply | Filtration equipment |
| Polymark Pipe & Valve Supply | Piping and valves |
| Asteron Control Panel Works | Electrical and controls |
| Wellspring Process Instrumentation | Process instruments |
| Bluegate Water Treatment Chemicals | Treatment chemicals |
| Calibre Field Calibration Services | Calibration and service |

Expense descriptions include `Site mobilization and equipment hauling`, `UPVC Sch. 80 piping and fittings — treatment room`, `Cable trays and field control wiring`, `Activated carbon replacement media for pretreatment train`, `Process-water sampling and bench analysis`, and `Booster-pump plinth repairs and grout replacement`.

The dataset includes four RFQs, six supplier quotations, and three purchase orders. Two selected quotations lead to issued purchase orders; a third selected quotation leads only to a DRAFT order awaiting approval; a separate piping RFQ remains open for quotations.

| Procurement chain | Current records | Boundary |
| --- | --- | --- |
| San Fernando booster pumps | `RFQ-WTR-26-008` → selected `FPM-Q-2608-214` → issued `PO-WTR-26-006` (PHP 448,000) → `FPM-2609-184` | Invoice remains `NEEDS_REVIEW`; no Expense or confirmed PO match |
| Laguna RO membranes | `RFQ-WTR-26-011` → selected `SFS-Q-2609-063` → issued `PO-WTR-26-009` (PHP 1,216,000) → `SFS-2609-771` | Invoice remains `NEEDS_REVIEW`; no Expense or confirmed PO match |
| Clark water-quality analyzers | `RFQ-WTR-26-014` → selected `WPI-Q-2609-118` → DRAFT `PO-WTR-26-012` (PHP 517,500) | Approval and issue remain pending; not committed cost |
| Clark treatment-room piping | `RFQ-WTR-26-016` | Issued for quotations; no quote or order is invented |

Three professionally formatted supplier invoice documents are stored under `scripts/marketing-fixtures/invoices/` and are served to Playwright from those local fixture files. Two invoices remain `NEEDS_REVIEW` with no Expense or project allocation. One invoice is in a supported VERIFIED state and links to exactly one matching Expense and project allocation. Invoice line amounts reconcile to their stated totals. Tax classifications and tax inclusion stay `UNKNOWN`; no tax ID, tax rate, or tax treatment is invented. The issued PO values remain Committed Cost, and unverified invoice sources do not become Actual Cost or duplicate payable rows.

The fixture is generated by `src/demo/data/marketingWorkspace.ts` and injected into a fresh browser `sessionStorage` by `scripts/marketing-capture.ts`. The ordinary `/demo` seed and protected QA certification fixtures remain unchanged. Invoice artwork is outside `public/`, the application bundle, and any database path.

The current Operations Workbook has five authorized sheets: Projects, Cost Codes, Expenses, RFQs, and Purchase Orders. Supplier invoice review remains a separate source-first workflow. A verified invoice appears as protected linked-source evidence on its one authoritative Expense; no separate Supplier Payables workbook sheet was added.

## Approved feature and claim matrix

| Feature | Approved one-line claim | Capture evidence | Claim boundary |
| --- | --- | --- | --- |
| Workspace overview | `See project and review work at a glance.` | `/demo/app/dashboard` | No company performance or adoption metric |
| Projects | `Keep project scope and cost controls together.` | `/demo/app/projects` | Contract value and project budget are distinct fields |
| Operations Workbook | `Work with familiar spreadsheet-style project and operating data.` | `/demo/app/workbook` | Five current sheets; not full Excel parity or a formula engine |
| Expenses / supplier payables | `Track direct expenses and linked supplier invoice evidence.` | `/demo/app/expenses` and the Expenses workbook sheet | One verified source invoice links to one Expense; pending sources remain separate |
| Supplier invoice review | `Review supplier documents beside extracted invoice details.` | `/demo/app/review?invoiceId={invoiceId}` | Preloaded fictional review fields; not extraction accuracy or model-performance evidence |
| Procurement | `Compare quotations and trace selected bids to purchase orders.` | `/demo/app/procurement` and the RFQ / Purchase Order workbook sheets | An issued PO is a commitment; a DRAFT PO is not committed cost |
| Workbook interchange | `Import and export supported operational workbook data.` | Operations Workbook secondary Import / export disclosure | The capture shows the real controls; it makes no speed, compatibility, or error-free claim |

Avoid claims of fully autonomous accounting, guaranteed error elimination, automatic AI approvals/payments, compliance certification, customer adoption, customer savings, or performance percentages. Do not present this fictional dataset as actual customer transactions or use real third-party logos.

The supplier invoice capture demonstrates the existing source-first review surface. It does not certify AI extraction quality, tax compliance, or a live provider connection. The correction frame changes only a nonfinancial description inside the temporary browser session; it does not verify the pending invoice.

## MKT-V1A capture sequence and assets

To reproduce MKT-V1A, run `npm.cmd run build`, then `npx.cmd tsx scripts/marketing-capture.ts --mkt-v1a`. The capture command starts a Vite preview bound only to `127.0.0.1`, uses the isolated `/demo` route without credentials, fixes the demo clock to 29 September 2026 in Asia/Manila, and seeds separate desktop and vertical Playwright contexts. It fails if the preview port is already occupied rather than reusing an unknown server.

| Sequence | Surface / route | Frame files | Viewport |
| --- | --- | --- | --- |
| 1 | Dashboard / workspace — `/demo/app/dashboard` | `01-dashboard.png` | 1440×900; vertical also captured |
| 2 | Projects portfolio — `/demo/app/projects` | `02-projects.png` | 1440×900; vertical also captured |
| 3 | Operations Workbook — Projects, Cost Codes, Expenses, RFQs, Purchase Orders | `03`–`12-workbook-*.png` | 1440×900; vertical tab views also captured |
| 4 | Expenses register — `/demo/app/expenses` | `13-expenses.png`, `14-expenses-supplier-invoice-link.png` | 1440×900; vertical overview captured |
| 5 | Supplier Invoice Review — `/demo/app/review?invoiceId={invoiceId}` | `15-supplier-invoice-source-review.png`; vertical extracted worksheet `16-supplier-invoice-extracted-details.png` | 1440×900 side-by-side; 540×960 CSS viewport for vertical; 1080×1920 video output |
| 6 | Procurement — `/demo/app/procurement` | `17-procurement-rfqs.png`, `18-procurement-purchase-orders.png` | 1440×900; vertical views also captured |

The workbook sequence performs a single-cell project-name edit, saves it, and restores the original name before moving to the other sheets. The invoice review sequence corrects one extracted line description to match the displayed source and saves the worksheet draft; the invoice remains unverified. Import / export is exposed briefly as a secondary disclosure.

The generated files and `manifest.json` are in the ignored local output folder `artifacts/marketing-capture/mkt-v1a-final-deliverable/`. The manifest records source SHA, working-tree state, fixture date, viewport profiles, and screenshot file names. The videos are `videos/desktop-session.webm` and `videos/vertical-session.webm`. Browser chrome, credentials, UUIDs, and QA fixture labels are not recorded.

MKT-V1A's older capture set covers Projects, Expenses, Procurement, and source-first invoice review with Silverfern's records. MKT-V2A adds separate full-app clips for Client Billing, Documents, and the other existing application workflows using the standard public synthetic demo dataset; its manifest labels those records separately.

## Canva handoff

Create a storyboard and visual frames for 16:9 and 9:16 compositions using the PNGs and WebM files above as the only source of application UI. Add short labels from the approved feature matrix, restrained callouts, a title card, and an end card. Do not redraw the workbook, create fake app screens, or put campaign-only labels over operational records.

Use the current interface palette from `src/ui/hydroqualisenseTheme.ts` (HydroQualiSense indigo accent, navy/slate neutrals, white surfaces) and its Inter/system fallback stack. Do not introduce a competing repository design system. The capture surface intentionally keeps the neutral `Engineering Operations Platform` and synthetic-demo disclosure. The corporate mark at `/brand/hydroqualisense-logo.png` represents Hydroqualisense Solutions Corp.; do not use it to imply that the engineering company is the multi-client software vendor. No permanent creator/vendor lockup is selected in the repository. The campaign may use the user-requested `HydroQualiSense` product title as text without inventing a corporate-vendor relationship.

Suggested short labels: `Projects`, `Operations Workbook`, `Supplier Invoice Review`, `Expenses`, `RFQs`, `Purchase Orders`, and `Import / export`.

## Higgsfield handoff

Generate environmental B-roll only after the real application captures are selected:

1. Philippine engineering administrator reviewing paper invoices beside a calculator, phone, and closed or out-of-focus laptop.
2. Water-treatment pump and filtration equipment in a generic industrial plant environment.
3. Paperwork transitioning into a clean, generic digital workflow; keep all screen content unreadable.
4. Optional closing shot of an engineer walking through a water-treatment installation.

Do not generate HydroQualiSense UI, readable product screens, client/vendor logos, facility signage, or claims about a named customer site.

## Data safety and production boundary

- This phase uses a local built application and the isolated `/demo` route only.
- The marketing fixture is browser-session data. No QA database, migration, hosted QA, production database, production deployment, credentials, or provider connection is used.
- Invoice SVGs stay under `scripts/marketing-fixtures/invoices/` and are served only through local Playwright route interception; they are not public build assets.
- The marketing fixture generator is separate from the ordinary demo generator; current automated QA fixture names and records remain unchanged.
- `REL-QA-WB-1` certification is not reopened or modified.

## Next production step

Complete Canva Premium finishing for the MKT-V3A draft: add reviewed Taglish narration and licensed music, make final timing/color adjustments, and export requested social formats. Do not redraw or replace the HydroQualiSense application captures. Add environmental B-roll only if it fills a clear gap; paid Higgsfield generation is not part of MKT-V3A.
