# HydroQualiSense Hosted QA Operations Workbook Certification — REL-QA-WB-1

- Status: **HOSTED WORKBOOK CERTIFICATION NOT COMPLETE; LATEST EXACT-SHA RUN PASSED AUTHENTICATED ROUTES 9/9 BUT THE MATRIX STOPPED AT `wait-description-editor`; THE HARNESS ROW LOCATOR LOST ITS DESCRIPTION-TEXT MATCH WHEN THE CELL BECAME AN INPUT. A STABLE ROW-KEY FIX AND FOCUSED REGRESSION ARE ON THE CURRENT BRANCH; POST-FIX HOSTED VERIFICATION IS PENDING.**
- Initial `main` SHA: `32d59ec04afe09b653f6e210525f9094f26234a7`
- Latest merged `main` and QA app SHA: `169812902591276c9ce32a3670f1c9dbdf18071b`
- Current root-cause fix branch: `codex/rel-qa-wb-1-stable-expense-row-locator` (focused PR pending)
- Implementation branch: `codex/rel-qa-wb-1-hosted-workbook-cert`
- Delivery pull request: [#272](https://github.com/Juvialski/InvoiceApp/pull/272); exact-head protected CI status is tracked on GitHub.
- Executable hardening commit: `1f7908292eb16985859df026ebd562ec51a0317f`
- QA deployment: Render `qa-hydroqualisense`, `https://hydroqualisense-qa.onrender.com`
- Mapped QA database: Supabase `hydroqualisense-qa`, project ref `vrpuznofrntyqsbugrib`
- QA migration history: **153/153 exact canonical version/name matches**, latest `20260927095636`
- Hosted run: [GitHub Actions run 36356618577](https://github.com/Juvialski/InvoiceApp/actions/runs/36356618577)

This record covers the bounded authenticated certification follow-up to local/synthetic WB-CERT. It does not change the supported workbook domains, permissions, persistence authorities, lifecycle actions, schema, or RLS. WB-3D+ remains deferred.

Previous exact-SHA revalidation: source and QA app `864ec90ed5737cbb3deeef2b5b21b7a0768af761`; Hosted QA run [36364232002](https://github.com/Juvialski/InvoiceApp/actions/runs/36364232002), which failed. The closeout implementation branch is `codex/rel-qa-wb-1b-cert-closeout`, executable commit `f8ae23bad1ef0c795ff9937942ce899c815fd7bf`, delivery PR [#273](https://github.com/Juvialski/InvoiceApp/pull/273). It updates stale route assertions and adds sanitized matrix failure codes. The later pre-fix diagnostic run is recorded below.

## Hosted target and database evidence

The QA deployment mapping was taken from the repository QA runbook. The authenticated `/api/health` response identified environment `qa`, deployment `qa-hydroqualisense`, application SHA `32d59ec04afe09b653f6e210525f9094f26234a7`, and migration level `20260927095636`. The corresponding Supabase project ref is `vrpuznofrntyqsbugrib`.

The canonical repository migration inventory and QA history matched **153/153** by version and name, with no missing, remote-only, or name-divergent entries. This check was read-only. No migration promotion was needed or performed, and no production database or production application was accessed for a write.

## Previous exact-SHA revalidation — 2026-09-28

Before the run, `https://hydroqualisense-qa.onrender.com/api/health` reported `environment=qa`, `deploymentId=qa-hydroqualisense`, application SHA `864ec90ed5737cbb3deeef2b5b21b7a0768af761`, and migration level `20260927095636`. The mapped QA Supabase project `vrpuznofrntyqsbugrib` was `ACTIVE_HEALTHY`; read-only migration history matched all **153/153** canonical version/name pairs, with no missing, remote-only, or divergent entries. No QA migration promotion was needed. Production was not queried or mutated.

Run 36364232002 checked out that exact SHA. Authenticated preflight passed, including persisted-session reload, fresh protected navigation, unauthenticated protected-route handling, and the Storage probe. All **9/9 routes left the loading shell**. Seven route contracts passed; Dashboard failed two stale copy assertions and Payroll failed one. The captured pages showed the current `Home` Dashboard and Payroll task-first view. The lead inspected those two captures. There were **0 console errors, 0 page errors, and 0 failed requests**; the prior CSP violation did not recur. The full-page route captures contain authenticated account chrome and were not promoted into Git.

The workbook matrix authenticated and exported the combined workbook. Its parser accepted the existing contract and the export contained the five editable sheets (`Projects`, `Cost Codes`, `Expenses`, `RFQs`, and `Purchase Orders`), the supporting line/payable sheets, and `_HydroQualiSense`; `Supplier Payables` was present for this profile's `invoices.read` permission. The export contained one RFQ line and one PO line. The matrix then failed at `prepare-stale-workbook`. The old harness recorded only the stage and generic error category, so the exact failure code is unknown. It stopped before stale-version review, upload, responsive captures, or any Apply; this matrix attempt made no workbook edits. No laptop/phone import-review screenshots were produced.

The closeout branch updates the two outdated route contracts and records only bounded uppercase sentinel failure codes, replacing free-form errors with `UNCLASSIFIED_ERROR` so diagnostics cannot persist arbitrary error text. It ran against the hosted target in run 36369354473; that run still returned `UNCLASSIFIED_ERROR`. The local reproduction below identifies the failure and the narrow fix.

## 2026-09-28 latest diagnostic and local root-cause fix

Current `main` and the mapped QA app were both at SHA `1f9f177a93a8a933876538c1c2653a1f787b609a`; QA health reported environment `qa`, deployment `qa-hydroqualisense`, and migration level `20260927095636`. Read-only QA migration history remained **153/153** canonical version/name pairs. No migration promotion or QA database write was performed.

Hosted run [36369354473](https://github.com/Juvialski/InvoiceApp/actions/runs/36369354473) ran before the local fix. Authenticated preflight and route contracts passed **9/9** with **0 console errors, 0 page errors, and 0 failed requests**. The workbook export and schema parsing succeeded, then the matrix failed at `prepare-stale-workbook` with `UNCLASSIFIED_ERROR` before stale review, upload, Apply, or responsive captures. The attempt made no workbook changes.

The root cause was the Node ESM build of SheetJS using path-based `readFile` calls without a Node filesystem binding. The exact QA export reproduced `Cannot access file [temporary workbook path]` at that call. Binding `node:fs` with `XLSX.set_fs(nodeFs)` before the first path read allowed the same workbook to be rewritten and parsed successfully. A focused regression check ensures the binding precedes path reads. Local validation passed **18/18 focused hosted-QA tests**, **67/67 affected tests across 9/395 files (2.3%, no fallback)**, and lint/typecheck. No QA row was changed; production was not accessed or modified.

**Hosted verification of the fix reached QA at SHA `d8903494bb2787f18c70a8b1a7b89828df822371`, but REL-QA-WB-1 remains incomplete.** Run 36376472314 passed the authenticated route suite and failed during the matrix's direct Expense version setup before stale review, Apply, or responsive captures. The timeout diagnostic change and next exact-SHA run are pending.

## 2026-09-28 post-merge hosted attempt — direct Expense version setup timeout

- QA Render service `qa-hydroqualisense` was live and `/api/health` reported environment `qa`, deployment ID `qa-hydroqualisense`, app SHA `d8903494bb2787f18c70a8b1a7b89828df822371`, and migration level `20260927095636`. The Render deploy record for that SHA was live.
- The mapped Supabase project was `hydroqualisense-qa` / `vrpuznofrntyqsbugrib`, status `ACTIVE_HEALTHY`. Read-only comparison found **153/153** canonical migration version/name pairs, no missing or extra entries, and matching head `20260927095636_wb3c_header_only_procurement_saves`. No migration push or promotion was needed.
- Hosted QA run [36376472314](https://github.com/Juvialski/InvoiceApp/actions/runs/36376472314) checked out exact source SHA `d8903494bb2787f18c70a8b1a7b89828df822371` with `run_operations_workbook_matrix=true`. Authenticated preflight, route readiness, all **9/9 route contracts**, and the Storage probe passed. There were **0 console errors, 0 page errors, and 0 failed requests** in the route suite.
- The matrix exported and parsed the combined workbook. It found the five supported editable sheets, supporting sheets, and one RFQ line plus one PO line. It then failed at `advance-expense-version` with `TimeoutError` / `UNCLASSIFIED_ERROR`. Stale-version review, import/review, Apply, authoritative refresh, line-preservation assertions after Apply, and responsive review captures were not reached.
- The matrix manifest recorded **0 console errors, 0 page errors, and 0 failed requests**. A separate read-only QA query confirmed the synthetic direct Expense remained `REL-QA-WB-1 direct version A`, so this failed run did not save a direct Expense edit or apply a workbook change. Production was not queried or mutated.
- The current harness groups several UI waits under `advance-expense-version`, so the failed artifact does not identify the timed-out control. Focused diagnostics in [PR #275](https://github.com/Juvialski/InvoiceApp/pull/275) add fixed substeps, resolve the Description column from its header, check editability and the Save action explicitly, and preserve only allowlisted step labels in evidence. Focused Hosted QA contract tests passed **13/13**; `npm.cmd run test:affected:agent` passed **89/89 across 13/395 files (3.3%, no fallback)**; `npm.cmd run lint` passed. Hosted certification remains open until a subsequent exact-SHA run passes and the 1280×800 and 390×844 review/Apply captures are inspected.

## Authenticated hosted findings

Run 36356618577 was dispatched on exact source SHA `32d59ec04afe09b653f6e210525f9094f26234a7`. Deployment identity, migration identity, authenticated session persistence across reload, fresh protected-page navigation, and the QA Storage probe passed. The general authenticated route suite failed: **0/9** route checks resolved to their expected pages; captured pages remained on `Loading Engineering Operations Platform...`. The run recorded nine browser console errors, zero page errors, and zero failed HTTP requests. Console diagnostics showed the production Content Security Policy blocked the single inline theme bootstrap script because `script-src` allowed only `'self'`. The evidence confirms both a loading-shell/readiness problem and a concrete CSP violation, but it does not establish that the CSP violation caused the full loading duration.

At the time of run 36356618577, the route-readiness matcher did not recognize that loading shell, and the production CSP blocked the inline theme bootstrap. PR #272 added the missing initial/rechecking loading markers and regression coverage, and allows only the exact SHA-256 of the existing inline bootstrap while keeping `script-src 'self'` and excluding `unsafe-inline`. These corrections were later deployed; see the latest exact-SHA revalidation below for hosted results.

## Synthetic QA activity

The authenticated QA operator used synthetic test data only. A direct DRAFT Expense named `REL-QA-WB-1 synthetic direct draft Expense` was edited through the existing worksheet to `REL-QA-WB-1 direct version A` and remained present after reload and fresh navigation. A DRAFT Purchase Order `PO-26-6630` was created through the existing Procurement workflow with a synthetic **₱1.00 PHP** line. Neither record was approved, issued, received, settled, or advanced through another lifecycle action. The matrix harness expects these existing fixtures and reuses them with a unique run prefix.

No identity details, credentials, tokens, private invoices, or production data are stored in this record. Supplier Payables was present in the authenticated export, demonstrating that the tested profile had `invoices.read`; the no-invoice-read profile was not available for a paired negative-profile check.

## Implemented hosted matrix

An explicit `run_operations_workbook_matrix` input was added to the protected Hosted QA workflow and defaults to false. The hosted Playwright script uses the authenticated storage state created by the standard preflight. It first verifies QA deployment/SHA/migration identity, exports the combined XLSX, edits a local copy, parses it with the production workbook parser, uploads it, and checks review-before-Apply.

When run against a corrected QA deployment, its assertions cover:

- Existing Projects and Cost Codes edits, protected Project budget, and separate domain confirmation/Apply.
- A direct DRAFT Expense round trip and a stale-version conflict after an ordinary UI save.
- Supplier-linked Expense description, invoice reference, confirmed-paid amount, and settlement state remaining protected.
- Expense lifecycle status, RFQ lifecycle status, PO lifecycle status, and project financial values remaining protected.
- Existing RFQ/PO line identities surviving header-only workbook changes.
- Unchanged groups collapsed, Apply disabled until explicit confirmation, and refreshed exports reflecting the authoritative saved values.
- A review and Apply-action screenshot at **1280×800** and **390×844**, cropped to the import-review region; no whole-page horizontal overflow and the Projects Apply action reachable in the viewport.
- Zero console errors, page errors, or failed HTTP requests.

The matrices in runs 36364232002 and 36369354473 stopped at `prepare-stale-workbook` before stale review, upload, or Apply; run 36369354473 also passed the route suite with no runtime errors. The previous local CUA file-chooser limitation remains historical; the hosted Playwright runner is the approved upload path. The root cause is now identified and locally fixed; hosted verification is pending until the merged SHA reaches QA. Do not treat either pre-fix export as evidence for stale guards, protected-field classification, domain Apply, authoritative refresh, or responsive review.

## 2026-09-28 latest exact-SHA attempt — Expense editor row locator

- QA `/api/health` reported `environment=qa`, deployment ID `qa-hydroqualisense`, application SHA `169812902591276c9ce32a3670f1c9dbdf18071b`, and migration level `20260927095636`. The mapped Supabase project `hydroqualisense-qa` / `vrpuznofrntyqsbugrib` was `ACTIVE_HEALTHY`; a read-only canonical comparison matched **153/153** version/name pairs. No deployment or migration promotion was needed.
- Hosted QA run [36379277555](https://github.com/Juvialski/InvoiceApp/actions/runs/36379277555) used that exact source SHA with `run_operations_workbook_matrix=true`. Authenticated preflight, Storage probe, and **9/9** route contracts passed with **0 console errors, 0 page errors, and 0 failed requests**.
- Combined workbook export and parsing succeeded. The expected editable/supporting sheets were present, including one RFQ line and one PO line. The matrix failed at `advance-expense-version`, step `wait-description-editor`, with `TimeoutError` / `UNCLASSIFIED_ERROR`; matrix runtime counters were also zero. It stopped before text entry, Save, stale review, upload, workbook review, Apply, authoritative refresh, or responsive captures.
- Root cause: the harness filtered the target row by the current Description text. `WorksheetEditor` replaces that display text with an input when editing begins, so the live Playwright row locator stopped matching before the harness queried for the textbox. The matrix did not reach a save or Apply action.
- The current branch fixes the harness to locate the row by its UUID-backed `data-worksheet-row-key`, validates that selector input, and adds focused regression coverage for stable row identity during editing. Local Hosted QA/worksheet tests passed **45/45**. Post-fix hosted verification remains pending; no application runtime, database, migration, or production state changed.

## Evidence status and limitations

| Area | Result |
| --- | --- |
| QA target / deployment mapping | Verified: `qa-hydroqualisense` -> `vrpuznofrntyqsbugrib` |
| App and migration identity | Latest run 36379277555 verified QA SHA `169812902591276c9ce32a3670f1c9dbdf18071b`; migration parity **153/153** through `20260927095636` |
| Auth preflight / ordinary session recovery | Passed persisted reload, fresh protected navigation, and unauthenticated protected-route check; no identity details persisted |
| Hosted authenticated routes | Latest run 36379277555 passed **9/9** route contracts; 0 console errors, 0 page errors, 0 failed requests |
| Hosted combined XLSX export/import/review/Apply | Export and schema parsing passed; matrix stopped at `wait-description-editor` because its text-filtered row locator stopped matching when the editor replaced the cell text. The stable row-key correction is locally validated; post-fix hosted verification is pending |
| Protected-field classification and authoritative post-Apply refresh | Not reached in the hosted matrix |
| Supplier Payables permission boundary | Read-enabled export observed; no read-disabled profile available |
| Company-context invalidation | Not exercised in the single-company QA deployment |
| Partial sequential failure/retry | No safe deterministic hosted trigger available; not induced |
| REL-AUTH-1 intermittent verification trigger | Not reproduced; ordinary reload succeeded; temporary verification state, terminal expiry, and invalidation of an existing review were not exercised |
| Responsive combined import review | Not inspected; the matrix stopped before review screenshots at 1280×800 and 390×844 |
| Production writes or migration promotion | None |

The local browser permission issue does not change the hosted matrix result: the matrix uses Playwright on the protected CI runner, not the local Chrome file chooser. The hosted matrix has still not reached stale-version review, workbook review, Apply, authoritative refresh, or responsive review capture. No hosted workbook certification, provider certification, or production readiness is claimed by this record.

## Local implementation validation

- Focused hosted QA/CSP regression tests: **16/16 passed**.
- `npm.cmd run test:affected:agent`: **97 passed, 0 failed, 0 skipped**, **16/395 files (4.1%)**, no selector fallback; database unaffected.
- `npm.cmd run lint`: ESLint and TypeScript passed.
- `npm.cmd run build`: passed after the CSP source change; existing non-blocking Inter font, bundle-size, and CommonJS `import.meta` warnings remain. Later changes only touched QA scripts, tests, and workflow wiring.
- `workflow-map:check`: **266 nodes / 355 edges**, valid.
- `workflow-map:consistency`: **266 nodes / 355 edges / 36 invariants / 11 diagrams**, consistent.
- Exact-head protected CI for the final PR head is a delivery check and is not claimed in this record until GitHub reports it.
- REL-QA-WB-1B closeout candidate commit `f8ae23bad1ef0c795ff9937942ce899c815fd7bf`: focused Hosted QA contract tests **17/17 passed**; `npm.cmd run test:affected:agent` **89/89 passed across 14/395 files (3.5%, no fallback)**; `npm.cmd run lint` passed. No app build was run because the candidate changes are hosted-QA scripts and tests only. These local checks do not replace the pending hosted rerun.
- REL-QA-WB-1C local root-cause fix: the exact QA workbook path-read failure reproduced before the `XLSX.set_fs(nodeFs)` binding and rewrote/reparsed successfully after it; focused Hosted QA tests **18/18 passed**, `npm.cmd run test:affected:agent` **67/67 across 9/395 files (2.3%, no fallback)**, and `npm.cmd run lint` passed.
- REL-QA-WB-1E stable row locator correction: focused Hosted QA contract and WorksheetEditor tests **45/45 passed**; `npm.cmd run test:affected:agent` passed **121/121 across 14/395 files (3.5%, no fallback)**; `npm.cmd run lint` passed ESLint and TypeScript. No app build or database validation was applicable to this harness/test-only correction.

## Completion gate

REL-QA-WB-1 remains open. The latest run 36379277555 passed authenticated routes but stopped at the harness's Description-editor locator before stale review or Apply. The stable row-key correction must reach the standard exact-SHA Hosted QA workflow; then the complete matrix must pass its protected-field, stale-version, Apply/refresh, and line-preservation assertions, and the **1280×800** and **390×844** review/Apply captures must be manually inspected. Alternate-permission and company-context cases remain explicit limitations unless safe QA identities and contexts become available. WB-3D+ remains deferred.
