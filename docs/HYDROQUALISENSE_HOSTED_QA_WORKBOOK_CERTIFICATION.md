# HydroQualiSense Hosted QA Operations Workbook Certification — REL-QA-WB-1

- Status: **HOSTED WORKBOOK CERTIFICATION NOT COMPLETE; CSP VIOLATION AND ROUTE-READINESS DEFECT CORRECTED IN THE IMPLEMENTATION BRANCH, HOSTED ROUTE BEHAVIOR STILL UNVERIFIED**
- Base `main` SHA: `32d59ec04afe09b653f6e210525f9094f26234a7`
- QA app SHA at investigation: `32d59ec04afe09b653f6e210525f9094f26234a7`
- Implementation branch: `codex/rel-qa-wb-1-hosted-workbook-cert`
- Pull request: [#272](https://github.com/Juvialski/InvoiceApp/pull/272), open; exact-head protected CI status is tracked on GitHub.
- Executable hardening commit: `1f7908292eb16985859df026ebd562ec51a0317f`
- QA deployment: Render `qa-hydroqualisense`, `https://hydroqualisense-qa.onrender.com`
- Mapped QA database: Supabase `hydroqualisense-qa`, project ref `vrpuznofrntyqsbugrib`
- QA migration history: **153/153 exact canonical version/name matches**, latest `20260927095636`
- Hosted run: [GitHub Actions run 36356618577](https://github.com/Juvialski/InvoiceApp/actions/runs/36356618577)

This record covers the bounded authenticated certification follow-up to local/synthetic WB-CERT. It does not change the supported workbook domains, permissions, persistence authorities, lifecycle actions, schema, or RLS. WB-3D+ remains deferred.

## Hosted target and database evidence

The QA deployment mapping was taken from the repository QA runbook. The authenticated `/api/health` response identified environment `qa`, deployment `qa-hydroqualisense`, application SHA `32d59ec04afe09b653f6e210525f9094f26234a7`, and migration level `20260927095636`. The corresponding Supabase project ref is `vrpuznofrntyqsbugrib`.

The canonical repository migration inventory and QA history matched **153/153** by version and name, with no missing, remote-only, or name-divergent entries. This check was read-only. No migration promotion was needed or performed, and no production database or production application was accessed for a write.

## Authenticated hosted findings

Run 36356618577 was dispatched on exact source SHA `32d59ec04afe09b653f6e210525f9094f26234a7`. Deployment identity, migration identity, authenticated session persistence across reload, fresh protected-page navigation, and the QA Storage probe passed. The general authenticated route suite failed: **0/9** route checks resolved to their expected pages; captured pages remained on `Loading Engineering Operations Platform...`. The run recorded nine browser console errors, zero page errors, and zero failed HTTP requests. Console diagnostics showed the production Content Security Policy blocked the single inline theme bootstrap script because `script-src` allowed only `'self'`. The evidence confirms both a loading-shell/readiness problem and a concrete CSP violation, but it does not establish that the CSP violation caused the full loading duration.

The route-readiness matcher did not recognize that specific loading shell, allowing it to be mistaken for a resolved route. The implementation commit adds the missing initial/rechecking loading markers and a regression test. The production CSP now allows the exact SHA-256 of the existing inline theme bootstrap while keeping `script-src 'self'` and without `unsafe-inline`; a regression test recomputes the hash from `index.html`. These corrections are in the implementation branch and have **not** been deployed to QA. A rerun must prove route readiness and app behavior rather than assuming the CSP fix clears the loading shell.

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

The matrix is **not yet run**. The deployed app is at the base SHA and its route loading-shell behavior remains unresolved; the CSP correction and readiness guard are in this unmerged implementation branch. Running the matrix before the corrected app is deployed cannot certify the target workflow. The local CUA file chooser also continued to report Chrome extension file-URL access unavailable after the user enabled it for Profile Al and restarted the extension. The browser security policy blocked extension-settings navigation, so no workaround was attempted. The protected hosted Playwright matrix is the intended XLSX upload path after QA has the implementation deployed and the standard routes resolve.

## Evidence status and limitations

| Area | Result |
| --- | --- |
| QA target / deployment mapping | Verified: `qa-hydroqualisense` -> `vrpuznofrntyqsbugrib` |
| App and migration identity | Verified at base SHA `32d59ec04afe09b653f6e210525f9094f26234a7`; exact migration parity **153/153** |
| Auth preflight / ordinary session recovery | Passed reload and fresh protected navigation; no identity details persisted |
| Hosted authenticated routes | 0/9 route checks; loading shell persisted and a CSP violation was separately observed; root cause of full loading duration remains unverified |
| Hosted combined XLSX export/import/review/Apply | **Not run to completion** |
| Protected-field classification and authoritative post-Apply refresh | Harness implemented; hosted evidence pending |
| Supplier Payables permission boundary | Read-enabled export observed; no read-disabled profile available |
| Company-context invalidation | Not exercised in the single-company QA deployment |
| Partial sequential failure/retry | No safe deterministic hosted trigger available; not induced |
| REL-AUTH-1 intermittent verification trigger | Not reproduced; terminal expiry/access loss was not artificially induced |
| Responsive combined import review | Not inspected; direct worksheet view at 1280×800 and 390×844 had no whole-page horizontal overflow, but those captures were not persisted and do not certify import review |
| Production writes or migration promotion | None |

The local browser permission issue does not change the hosted matrix result: the matrix uses Playwright on the protected CI runner, not the local Chrome file chooser. It remains pending until the implementation is deployed to QA and route readiness is confirmed. No hosted workbook certification, provider certification, or production readiness is claimed by this record.

## Local implementation validation

- Focused hosted QA/CSP regression tests: **16/16 passed**.
- `npm.cmd run test:affected:agent`: **97 passed, 0 failed, 0 skipped**, **16/395 files (4.1%)**, no selector fallback; database unaffected.
- `npm.cmd run lint`: ESLint and TypeScript passed.
- `npm.cmd run build`: passed after the CSP source change; existing non-blocking Inter font, bundle-size, and CommonJS `import.meta` warnings remain. Later changes only touched QA scripts, tests, and workflow wiring.
- `workflow-map:check`: **266 nodes / 355 edges**, valid.
- `workflow-map:consistency`: **266 nodes / 355 edges / 36 invariants / 11 diagrams**, consistent.
- Exact-head protected CI for the final PR head is a delivery check and is not claimed in this record until GitHub reports it.

## Completion gate

REL-QA-WB-1 remains open until the implementation is deployed to the mapped QA app, the hosted loading shell is resolved, and the authenticated matrix completes with its manifest and cropped laptop/phone screenshots inspected by the lead and recorded as durable sanitized evidence. Alternate-permission and company-context cases remain explicit limitations unless safe QA identities and contexts become available. WB-3D+ remains deferred.
