# UX-W4.5E visual evidence

Source revision: `3eb2819edd4da3527e083882bf451c171c35b6a4`

Environment: local Vite/Express safe demo at `http://127.0.0.1:3000`, headless
Chromium screenshots captured with Playwright after the UX-W4.5E implementation.
All records are sanitized synthetic repository fixtures. These images are local
visual evidence only; they are not authenticated hosted QA, provider, or
production certification.

| Screenshot | Route/state | Viewport | Claim supported |
| --- | --- | --- | --- |
| `document-preview-desktop-1440.png` | Procurement Purchase Order preview, PDF renderer loading state | 1440 x 900 | Loading preview no longer reserves a giant blank canvas; delivery history and actions remain visible. |
| `document-preview-mobile-390.png` | Procurement Purchase Order preview, PDF renderer loading state | 390 x 844 | Phone preview remains compact and keeps the next status/actions reachable. |
| `projects-desktop-1440.png` | Projects card-first portfolio | 1440 x 900 | Shared title/filter/metric grammar remains consistent while cards stay primary. |
| `reports-desktop-1440.png` | Reports overview | 1440 x 900 | Shared heading, metric, section, and card chrome is tighter without changing report semantics. |
| `email-compose-mobile-390.png` | Email / SMS compose review surface | 390 x 844 | Shared heading/action treatment remains usable on phone; human review and provider-gated send controls remain visible. |
| `rfi-detail-desktop-1440.png` | Project RFI missing-record recovery for `demo-rfi-wh-001` | 1440 x 900 | Deterministic recovery state is explicit and return-to-register remains available; populated RFI detail is not certified. |
| `submittal-detail-desktop-1440.png` | Project Submittal missing-record recovery for `demo-sub-wh-014`, round `demo-round-wh-014-2` | 1440 x 900 | Deterministic recovery state is explicit and return-to-register remains available; populated Submittal detail is not certified. |

The synchronized-base baseline and the final application-bearing revision both
passed the full Demo Visual QA catalog: **89/89 scenarios**, with zero console
errors, page errors, failed requests, or horizontal-overflow failures. The
final targeted captures above were inspected directly after implementation;
the final disposition is recorded in the UX-W4.5E follow-up section of
`artifacts/ui-ux-audit/UX-W4.5A-REPORT.md`.
