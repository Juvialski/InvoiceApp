# WEB-BRAND-1 local visual and responsive evidence

**Source branch:** `codex/web-brand-1-company-public-site`

**Synchronized base SHA:** `59762f89fe308dd0f732c4af5f654acc813dd05d`

**Final reviewed PR head:** `b453a269436d66af36c133598867cfa3f20af413`

**Merged PR #249:** `2ca9a96b0799eec4f14364f308e9edc2d6c73d9a`

**Protected exact-head CI:** Application Validation & Build, Database Migrations & Upgrade Suite, Graph and Source Contract Consistency, and `chromium-demo-qa` all passed before merge.

**Date:** 2026-09-24

**Evidence scope:** local browser previews only; not hosted QA or production certification.

## Preview identities

- **Company site:** `http://localhost:3000`, `VITE_HYDROQUALISENSE_ENVIRONMENT=production`, explicit local preview flag enabled. Because the hostname is not the canonical company host, the preview correctly receives `noindex, nofollow` and no canonical URL. The title, description, Open Graph, and page content use the company identity.
- **QA showcase:** `http://localhost:3001`, `VITE_HYDROQUALISENSE_ENVIRONMENT=qa`, `VITE_HYDROQUALISENSE_PUBLIC_FUNNEL_ENABLED=false`. The public root still opens the software showcase; the optional prospect form remains unavailable. QA receives `noindex, nofollow`, has no canonical URL, and shows the QA/synthetic disclosure.

The production HTML shell and metadata unit tests verify company-focused title/description/Open Graph metadata and `https://hydroqualisense.com/` canonical behavior for the canonical company host. Local preview behavior is intentionally different because `localhost` is not that canonical host.

## Viewport matrix

Both public roots were captured and visually inspected at each viewport:

| Viewport | Company page | QA showcase |
| --- | --- | --- |
| Desktop — 1440 × 900 | `company-desktop.png` | `qa-desktop.png` |
| Constrained laptop — 1280 × 800 | `company-laptop.png` | `qa-laptop.png` |
| Tablet — 768 × 1024 | `company-tablet.png` | `qa-tablet.png` |
| Phone — 390 × 844 | `company-phone.png` | `qa-phone.png` |

Additional local captures covered production `/contact` at phone, QA `/request-demo` while intake is disabled at phone, `/demo` at phone, and `/demo/app/dashboard` at phone and desktop. `/privacy` and `/terms` were opened directly at desktop; QA footer navigation was also followed and stayed on the QA origin with the policy title, noindex metadata, and no canonical URL.

The matrix reported `documentElement.scrollWidth === innerWidth` at all tested sizes, zero missing image alt text, zero page errors, and zero console errors. The first keyboard Tab on both public marketing pages reaches the visible skip-to-content link. Demo routes begin with their expected visible buttons and are marked synthetic. The sample/demo landing, workspace header, assistant, tour, and sample company data use the neutral showcase identity.

The screenshots are disposable local QA output under the ignored path `artifacts/public-site/screenshots/`; they are not committed as durable evidence. The canonical production URL itself and the hosted QA deployment were not modified or certified.

## Unverified company content

No company-approved public portfolio entries, project photographs, public service-area text, inquiry email, or telephone details were present in the repository. The company page therefore remains capability-led and displays a truthful pending-contact state. This evidence does not certify those external facts or replace company approval.
