# UI-R4D — Entity Media Foundation

Status: **Implemented for the recorded local/demo and local-Supabase scope.** [PR #240](https://github.com/Juvialski/InvoiceApp/pull/240) is open for review and has not been merged. The implementation source is commit `0a93f7c2fb79c5ece590aa87a416c32c8626d17b` on `codex/ui-r4d-entity-media`, based on synchronized `main` commit `c057ffc9585ab6a890f260cbec8ae8def8d3081c`.

## What this evidence covers

The change adds one shared media surface for existing company-owned entities:

- Project covers remain attached to `public.projects`.
- Equipment images attach to the canonical `engineering_equipment_registry`. Project equipment references reuse that image only when `equipment.read` is present.
- Material images attach to canonical `inventory_items`. A project material reference reuses the linked item image only when `inventory.read` is present.
- A single `entity_media` table holds the current binding. The `entity-media` Supabase bucket is private; S3-compatible storage uses a dedicated private bucket configured by server-only `STORAGE_ENTITY_MEDIA_BUCKET`.
- Uploads accept JPEG, PNG, and WebP up to 5 MiB. The server validates the byte signature, declared MIME type, and file extension; builds the company/entity/media object key; verifies provider metadata; and commits the current binding through a service-only RPC with an expected-current-media concurrency check.
- Reads require the existing entity read permission and return a 15-minute signed URL. Authenticated clients have no direct metadata or object write path.
- Replacement, removal, and failed-upload cleanup use a retry queue. Entity deletion cascades current media metadata, and cleanup is best effort so object-store availability is not a prerequisite for entity lifecycle work.
- Demo mode uses only repository-owned synthetic SVG illustrations and browser-local object URLs. SVG is not accepted by the upload endpoint; demo reset revokes locally created object URLs.

No financial, inventory movement, equipment assignment, project lifecycle, document ownership, or audit authority moved into the media layer.

## Visual evidence

Environment: local production build served by Vite preview, safe `/demo/app` runtime, synthetic demo records, source commit above. The lead inspected the screenshots directly. The 12-scenario catalog covered four routes and four viewport definitions; every scenario returned HTTP 200, with zero console errors, page errors, failed requests, navigation failures, or horizontal overflow.

| Route | State | Viewport | Visual triage | Screenshot |
|---|---|---|---|---|
| `/demo/app/projects` | Project media and deterministic fallback · Light | 1440×1000 desktop | ACCEPTABLE — image previews sit with project identity; fallback remains legible | [PNG](screenshots/r4d/entity-media--projects--r4d-project-media-and-deterministic-fallback-light--desktop-1440.png) |
| `/demo/app/projects` | Project media and deterministic fallback · Light | 1280×800 constrained laptop | ACCEPTABLE — two-column cards retain image and project-name hierarchy | [PNG](screenshots/r4d/entity-media--projects--r4d-project-media-and-deterministic-fallback-constrained-laptop--r4d-laptop-1280.png) |
| `/demo/app/projects` | Project media and deterministic fallback · Dark | 390×844 phone | ACCEPTABLE — cards stack; fallback and image crops remain visible | [PNG](screenshots/r4d/entity-media--projects--r4d-project-media-and-deterministic-fallback-dark-phone--mobile-390.png) |
| `/demo/app/projects` | Replace/Remove controls · Dark | 1440×1000 desktop | ACCEPTABLE — preview, description, Replace/Remove, and parent Save remain distinct | [PNG](screenshots/r4d/entity-media--projects--r4d-project-image-replace-remove-controls-dark--desktop-1440.png) |
| `/demo/app/projects` | Replace/Remove controls · Dark | 390×844 phone | ACCEPTABLE — controls remain reachable and do not obscure the image description | [PNG](screenshots/r4d/entity-media--projects--r4d-project-image-replace-remove-controls-dark-phone--mobile-390.png) |
| `/demo/app/projects/demo-project-solar` | Linked canonical Project Material media · Light | 1440×1000 desktop | ACCEPTABLE — linked material image stays beside its project/source context | [PNG](screenshots/r4d/entity-media--project-workspace--r4d-linked-project-material-media-and-text-context-light--desktop-1440.png) |
| `/demo/app/equipment` | Canonical Equipment media and fallback · Light | 1440×1000 desktop | ACCEPTABLE — thumbnails augment asset identity without changing registry actions | [PNG](screenshots/r4d/entity-media--equipment--r4d-canonical-equipment-media-and-fallback-light--desktop-1440.png) |
| `/demo/app/equipment` | Canonical Equipment media and fallback · Dark | 1280×800 constrained laptop | ACCEPTABLE — row identity and action groups remain readable | [PNG](screenshots/r4d/entity-media--equipment--r4d-canonical-equipment-media-and-fallback-constrained-laptop--r4d-laptop-1280.png) |
| `/demo/app/equipment` | Canonical Equipment media and fallback · Dark | 390×844 phone | ACCEPTABLE — compact rows preserve image, identity, state, and actions | [PNG](screenshots/r4d/entity-media--equipment--r4d-canonical-equipment-media-and-fallback-dark-phone--mobile-390.png) |
| `/demo/app/warehouse` | Canonical Material media and fallback · Dark | 1440×1000 desktop | ACCEPTABLE — image previews remain secondary to canonical item and stock data | [PNG](screenshots/r4d/entity-media--warehouse--r4d-canonical-material-media-and-fallback-dark--desktop-1440.png) |
| `/demo/app/warehouse` | Canonical Material media and fallback · Light | 768×1024 tablet | ACCEPTABLE — table/list content adapts without horizontal overflow | [PNG](screenshots/r4d/entity-media--warehouse--r4d-canonical-material-media-and-fallback-tablet--r4d-tablet-768.png) |
| `/demo/app/warehouse` | Canonical Material media and fallback · Light | 390×844 phone | ACCEPTABLE — item details and actions stack with the image thumbnail | [PNG](screenshots/r4d/entity-media--warehouse--r4d-canonical-material-media-and-fallback-light-phone--mobile-390.png) |

The lead found the entity-media hierarchy, permission-aware controls, and deterministic fallbacks visually acceptable across all captured R4D states. A separate shared-shell observation remains: the existing floating Demo Tour launcher overlaps a portion of dense register content in some screenshots. Root cause is the route-global tour control; task impact is limited to nearby non-media actions. Classify this as **DEEPER WORKFLOW REVIEW, P2**, for the app-wide R4E shell review; it is not introduced by entity media and does not block these media surfaces.

The machine-readable local run was `artifacts/demo-visual-qa-r4d/manifest.json` (transient/ignored), with 12 screenshots and 12/12 passing scenarios. The durable screenshots are checked in under `artifacts/ui-ux-audit/screenshots/r4d/`.

## Validation evidence

- Local Docker/Supabase upgrade fixtures: **3/3 passed** using `npm.cmd run test:migrations:upgrade`.
- Local migration reset completed. `npx.cmd supabase test db --local`: **51 SQL test files, 1,693 assertions passed**, including the 28-assertion entity-media contract.
- Real local Supabase Storage HTTP runtime: **1/1 passed** for authorized upload, signed download, replacement, outsider read/write denial, failed-metadata compensation, and removal. The test used only the already-configured local deployment company and removed its own temporary user, membership, project, metadata, cleanup rows, and objects.
- Focused entity-media/project/material tests passed **66 tests with 1 intentional runtime skip** in the focused suite. Subsequent final focused runs passed **14/14** for runtime plus structured browser evidence and **17/17** for demo, security, and scenario-catalog checks.
- `npm.cmd run lint` passed, including ESLint and TypeScript.
- `npm.cmd run build` passed. It reported non-blocking theme-font, large-chunk, and CommonJS `import.meta` diagnostics; the R4D browser bundle no longer imports the Node crypto fallback.
- Workflow Map generated, validated, and checked for consistency: **266 nodes, 355 edges, 36 invariants, 11 diagrams**.
- `git diff --check` passed before documentation closeout.

The first affected-test run selected 160/380 test files (42.1%), without fallback, and reported 1,062 pass, 3 fail, and 2 skipped across 1,067 tests. It exposed an expected viewport-catalog update for the two R4D viewports; that contract was updated and `tests/structuredBrowserEvidence.test.ts` then passed 14/14 in the runtime/browser focused run. Two remaining affected-test failures are stale phrase assertions in unchanged Expenses and Vendor sources (`tests/coreHardeningWave2B2.test.ts` and `tests/r5IntegrationHardening.test.ts`). Separately, `npm.cmd run test:migrations` stopped in its static phase on two unchanged legacy phrase assertions (`tests/coreHardeningWave1.test.ts` and `tests/coreHardeningWave2B2.test.ts`); it did not enter the live upgrade phase. The standalone local upgrade fixtures above passed. No unrelated copy or assertion changes were made.

A narrow reproduction of the two remaining affected-test failures passed 8/10 assertions and confirmed the mismatch is confined to old exact-copy expectations: Expenses expects the archive/void explanation phrase, while the current unchanged Vendor page uses shorter supplier-evidence copy. Neither corresponding page nor test file is part of this change.

## Scope limits

This evidence is local/demo and local-Supabase only. It does not certify an external S3 bucket, hosted QA, a provider account/device, a production deployment, or a production database. The R4D UI does not claim full app-wide theme/accessibility certification; UI-R4E remains the next approved phase after this change is safely merged.

Jev context selection returned zero Workflow Map candidates, so no Jev request was made for this bounded phase.
