# LANDING-VIS-1 Visual Certification

Status: **LOCAL BROWSER CERTIFICATION COMPLETE — PR NOT MERGED**

Implementation branch: `codex/landing-vis-1`

Synchronized base SHA: `fff58451dc96fd2b7dea0ca8a125ebffa3acaca8`

Validated implementation commit: `97da2d932c9b7aa7fc9809ccdfd19e1fb7f29b25`

Canva reference: [VIS-CANVA-1 — HydroQualiSense Visual Blueprint](https://www.canva.com/design/DAHWSiZsn1Y/rqs0wE7g1xIhosj2LK8yqQ/view) · design ID `DAHWSiZsn1Y`

## Preview identity

- **Company:** `http://localhost:3000`, `VITE_HYDROQUALISENSE_ENVIRONMENT=production`, and `VITE_HYDROQUALISENSE_PUBLIC_FUNNEL_ENABLED=true`. Because localhost is not the canonical company host, the preview uses `noindex, nofollow` and has no canonical URL.
- **QA:** `http://localhost:3001`, `VITE_HYDROQUALISENSE_ENVIRONMENT=qa`, and `VITE_HYDROQUALISENSE_PUBLIC_FUNNEL_ENABLED=false`. The QA landing remains available while prospect intake is disabled; its metadata is `noindex, nofollow` with no canonical URL.

## Landing viewport matrix

Each capture is a sanitized browser viewport screenshot from the validated implementation commit. Full-page desktop captures are also linked below.

| Viewport | Company landing | QA showcase |
| --- | --- | --- |
| Desktop — 1440 × 900 | [Company screenshot](evidence/landing-vis-1/company-desktop-fold.png) | [QA screenshot](evidence/landing-vis-1/qa-desktop-fold.png) |
| Constrained laptop — 1280 × 800 | [Company screenshot](evidence/landing-vis-1/company-laptop-fold.png) | [QA screenshot](evidence/landing-vis-1/qa-laptop-fold.png) |
| Tablet — 768 × 1024 | [Company screenshot](evidence/landing-vis-1/company-tablet-fold.png) | [QA screenshot](evidence/landing-vis-1/qa-tablet-fold.png) |
| Phone — 390 × 844 | [Company screenshot](evidence/landing-vis-1/company-phone-fold.png) | [QA screenshot](evidence/landing-vis-1/qa-phone-fold.png) |

Full-page desktop captures: [company](evidence/landing-vis-1/company-desktop-full.png) and [QA](evidence/landing-vis-1/qa-desktop-full.png).

Additional route captures: production [`/contact` at 390 × 844](evidence/landing-vis-1/company-contact-phone-fold.png) and QA [`/demo` at 390 × 844](evidence/landing-vis-1/qa-demo-phone-fold.png).

## Browser results

- Both landing roots rendered one H1 at all four viewports.
- All eight landing captures had no horizontal overflow, console errors, failed requests, or page errors.
- Header navigation and public-policy links had touch targets at least 44 px high. The first keyboard Tab reached the visible skip-to-content link.
- `Open demo` remained the primary `/demo` action. `Sign in to QA workspace` remained a separate secondary `/dashboard` action.
- The production-company `/contact` and QA `/demo` routes rendered. Privacy Policy and Terms links were followed from both preview origins; each opened the correct page title with `noindex, nofollow` and no canonical URL.
- The local company root retained the company title and description, and correctly had no production canonical URL. The QA root retained a neutral software title and its synthetic/non-production disclosure.
- Browser-visible text, counted with `document.body.innerText` including headers and footers, decreased from **320 to 110 words** on the company root and from **296 to 98 words** on QA.

The evidence covers local previews only. The canonical production host, hosted QA deployment, production, external providers, and live client data were not used or certified.

## Content and Canva disposition

- Both public surfaces are complete for this bounded phase. Company project references, approved project photos, profile details, credentials, location/service-area wording, inquiry email, and public phone remain pending company confirmation.
- The company page retains the approved logo asset and existing abstract water-systems illustration. It adds no project photography, project names, metrics, credentials, or contact details.
- The QA preview is static and illustrative. Its visible fields contain no customer, vendor, invoice, or amount data.
- Canva page 5 showed its synthetic/non-production caption colliding with nearby explanatory text. The browser implementation puts the disclosure in its own padded semantic note. The Canva reference was not edited.
- The implementation follows the Canva hierarchy and palette while using responsive browser layout and shorter copy instead of reproducing the static frame literally.

## Follow-on

The next planned phase is **UX-EDIT-1A — Direct Worksheet Editing + Supplier Invoice Side-by-Side Review**. It was not started in LANDING-VIS-1.
