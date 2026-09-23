# UI-R4D Entity Media Foundation Implementation Plan

> **For agentic workers:** This handoff requires lead-only implementation. No subagents. Execute the listed focused tests during implementation and the integrated validation ladder once after the final diff.

**Goal:** Add secure company-bound primary images for existing Projects, canonical Equipment assets, and canonical Warehouse Inventory items, with compact previews, safe replacement/removal, and deterministic fallback behavior.

**Architecture:** Store one current media binding per entity and purpose in a shared `entity_media` table, with typed company-composite foreign keys to `projects`, `engineering_equipment_registry`, and `inventory_items`. Store private image bytes through the existing provider-neutral storage provider using a dedicated Supabase bucket and an `entity-media` object-key namespace; an authenticated server router validates entity permission and deployment company before service-side storage and metadata mutations. A cleanup queue records superseded, removed, and entity-cascade objects so storage cleanup can retry without blocking entity lifecycle changes.

**Tech Stack:** React, TypeScript, Express, Supabase Postgres/RLS/Storage, existing provider-neutral Storage abstraction, pgTAP, current demo QA runner.

**Spec:** `docs/superpowers/specs/2026-09-22-ui-r4-professional-design-blueprint.md`; implementation handoff supplied by the user in `Pasted text.txt`.

## Global Constraints

- Starting `main` SHA: `c057ffc9585ab6a890f260cbec8ae8def8d3081c`; branch: `codex/ui-r4d-entity-media`.
- Zero subagents; no comparator research, broad audit, baseline full suite, unrelated reliability work, or R4E expansion.
- Project, Equipment Registry, and Inventory Item remain authoritative; project assignment/material rows reuse those images only through their existing canonical references.
- Keep the Supabase bucket private, and use a dedicated private S3-compatible bucket (`STORAGE_ENTITY_MEDIA_BUCKET`, default `entity-media`) when S3 is primary. Paths are company-prefixed and server-built; uploads are limited to JPEG/PNG/WebP up to 5 MiB, with SVG and mismatched MIME/signatures rejected.
- Keep current entity images usable until a replacement object is stored and its metadata commit succeeds; compensate failed writes and retain cleanup work if deletion fails.
- Preserve deployment-company isolation, current read/manage permissions, entity lifecycle, financial semantics, inventory movements, and audit/provenance boundaries.
- Keep demo media synthetic and local; never persist demo images to production Storage.
- Any migration, RLS, RPC, or Storage-policy change requires one real local Supabase/Docker validation cycle on the integrated diff.
- Open a PR and stop; do not merge.

## Review Focus

1. Cross-company IDs, unauthorized callers, or unsupported entity types must not read, upload, replace, remove, or sign another entity's object.
2. Empty, oversized, malformed, unsupported, SVG, and declared-MIME/signature-mismatched uploads must fail before Storage is touched.
3. A failed metadata commit must not delete an object that may have committed; when its unreferenced status is proven, compensate it or retain a cleanup-queue entry.
4. A stale replacement/removal must leave the current image authoritative; failed old-object deletion must leave the new image active and cleanup retryable.
5. Deleting a Project, Equipment asset, or Inventory Item must not be blocked by media; the old object must become inaccessible and enter cleanup tracking.

---

### Task 1: Shared media contracts, validation, and object keys

**Files:**
- Modify: `src/lib/fileSecurity.ts`
- Modify: `src/lib/storage/keys.ts`
- Create: `src/lib/entityMediaTypes.ts`
- Test: `tests/entityMediaSecurity.test.ts`
- Test: `tests/storageSecurity.test.ts`

**Interfaces:**
- `EntityMediaEntityType = "PROJECT" | "EQUIPMENT" | "MATERIAL"`.
- `EntityMedia` contains the current media id, entity type/id, purpose, signed preview URL, content type, byte size, SHA-256, optional alt text, and timestamps; it never exposes a public URL as stored source data.
- `validateEntityMediaBytes(bytes, mimeType, fileName)` rejects empty/oversized input, unsupported MIME, SVG, and signature or extension mismatch.
- `buildEntityMediaStoragePath({ companyId, entityType, entityId, mediaId, contentType })` emits only `companies/<company>/entity-media/<entity-kind>/<entity>/<media>.<safe-extension>`.

- [ ] Write tests for supported JPEG/PNG/WebP signatures, SVG/HTML rejection, MIME/extension mismatch, zero bytes, 5 MiB boundary, and traversal-resistant object keys.
- [ ] Run the edited tests and confirm they fail for the missing validator/path builder.
- [ ] Implement the minimal shared types, byte validation, and path builder.
- [ ] Rerun the edited tests and confirm all boundary cases pass.

### Task 2: Company-bound media schema, RLS, Storage bucket, and lifecycle SQL

**Files:**
- Create: `supabase/migrations/<generated>_entity_media_foundation.sql` using `supabase migration new`.
- Create: `supabase/tests/database/44_entity_media_foundation.test.sql`.
- Modify only if required: `scripts/test-migrations.ts` and relevant existing runtime test harness.

**Interfaces:**
- `entity_media` stores one current `COVER` or `PRIMARY` image with typed nullable FK columns whose check constraint matches `entity_type`; all target FKs include `company_id` and cascade metadata cleanup without blocking the entity lifecycle.
- `entity_media_cleanup_queue` stores provider, bucket, company-scoped key, actor, reason, and retry timestamps; clients cannot mutate it.
- Service-only `server_replace_entity_media` and `server_remove_entity_media` mutations check deployment company, target ownership, exact object namespace, permitted MIME/size/hash shape, expected current media id, and return cleanup work atomically.
- Authenticated metadata and Storage object reads require the existing entity read permission. Authenticated direct upload/update/delete is denied; the validated server route uses existing server-only storage authority.
- The private `entity-media` Supabase bucket has a 5 MiB limit and JPEG/PNG/WebP allowlist.

- [ ] Add pgTAP cases for composite company FKs, one active slot, path checks, direct write denial, read permission, unauthorized cross-company reads, cleanup queue creation, and lifecycle deletion that cascades metadata without restriction.
- [ ] Run the migration tests and the new pgTAP file after SQL iteration.
- [ ] Create the forward-only migration, functions, triggers, RLS, grants, bucket, and Storage policies.
- [ ] Re-run focused SQL tests; defer the single Docker reset/replay and full relevant database suite to the integrated validation pass.

### Task 3: Authenticated server upload/read/replace/remove API

**Files:**
- Create: `src/server/storage/entityMediaRouter.ts`.
- Modify: `src/server/storage/storageRouter.ts` permission union.
- Modify: `server.ts` router registration.
- Create: `src/lib/entityMedia.ts` client API.
- Test: `tests/entityMediaRouter.test.ts`.

**Interfaces:**
- `GET /api/entity-media/:entityType?ids=<uuid,...>` returns only permission-filtered current images with short-lived signed URLs.
- `GET /api/entity-media/:entityType/:entityId` returns one authorized current image or deterministic no-image state.
- `POST /api/entity-media/:entityType/:entityId` accepts a base64 file, declared MIME, original filename, optional alt text, and expected current media id; it validates caller/company/entity/permission, stores a unique object, commits metadata, compensates on failure, then processes superseded cleanup.
- `DELETE /api/entity-media/:entityType/:entityId/:mediaId` removes only the expected current image and reports whether physical cleanup remains queued.
- Writes use `projects.manage`, `equipment.manage`, or `inventory.manage`; reads use the corresponding `*.read` permission.

- [ ] Test request auth, deployment-company mismatch, entity ownership, permissions, MIME/size rejection, signed read, upload failure, metadata failure compensation, stale replace, successful replace, removal, and cleanup retry with the real router and a test provider.
- [ ] Run the edited API tests and confirm they fail before implementation.
- [ ] Implement only the bounded routes and the client request adapter; do not modify document/invoice storage flows.
- [ ] Rerun the focused router/client tests.

### Task 4: Compact theme-aware media controls and entity previews

**Files:**
- Create: `src/components/ui/EntityMedia.tsx`.
- Create: `public/demo-media/entity-media/project.svg`, `equipment.svg`, and `material.svg` as static, repository-owned synthetic illustrations; upload validation continues to reject SVG.
- Modify: `src/lib/entityMedia.ts` and `src/demo/DemoWorkspaceProvider.tsx` for demo-local object URLs and reset cleanup.
- Modify: `src/components/projects/ProjectPortfolioRegisterSection.tsx`.
- Modify: `src/components/projects/ProjectMaterialsEquipment.tsx`.
- Modify: `src/components/projects/ProjectDetailsWorksheet.tsx`.
- Modify: `src/components/equipment/EquipmentPage.tsx`.
- Modify: `src/components/inventory/WarehouseInventoryPage.tsx`.
- Modify: `src/components/inventory/WarehouseItemWorksheet.tsx`.
- Modify: `src/components/projects/ProjectMaterialsEquipmentWorksheet.tsx`.
- Test: focused Project, Equipment, Warehouse, and media component tests.

**Interfaces:**
- `EntityMediaThumbnail` accepts a loaded `EntityMedia`, semantic fallback content, alt text, and compact sizing; an image load error renders the fallback without a broken-image icon.
- `EntityMediaControl` accepts entity type/id and `canManage`; it exposes only Upload/Add image, Replace, and Remove, with accessible progress, validation errors, and cleanup status.
- Project cards retain their monogram fallback and financial/status hierarchy; linked project-material rows show the canonical inventory image without adding another owner. Project Equipment assignment views reuse the registry image only when the caller also has `equipment.read`.

- [ ] Add focused behavior tests for no-image fallback, broken-image fallback, compact thumbnail rendering, authorized controls, unauthorized control hiding, invalid-file copy, and replacement/remove state.
- [ ] Run the focused tests and confirm expected failures.
- [ ] Implement semantic Light/Dark media surfaces and integrate only the listed surfaces.
- [ ] Rerun focused tests; inspect desktop and phone screenshots during iteration.

### Task 5: Workflow Map, durable evidence, and final delivery

**Files:**
- Modify: `scripts/workflow-map/graph.ts` and generated Workflow Map files only if the final diff changes a mapped storage boundary, authority, permission, or workflow.
- Modify: `scripts/qa/demoScenarios.ts` and `scripts/demo-visual-qa.ts` for a bounded R4D screenshot subset.
- Create: `artifacts/ui-ux-audit/UI-R4D-ENTITY-MEDIA.md` with inspected screenshots and actual validation evidence.
- Modify: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`.
- Modify: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`.
- Review: complete diff, migrations, generated outputs, and `git diff --check`.

- [ ] Decide explicitly whether the final diff changes a Workflow Map contract; if yes, generate and run all three Workflow Map checks.
- [ ] Run focused media/domain/storage tests, one local Supabase/Docker validation cycle, affected tests, lint/typecheck, build, and one bounded browser/demo pass.
- [ ] Visually inspect representative with-image/fallback states in Light and Dark at desktop and phone; add constrained laptop/tablet only if the changed layout materially differs.
- [ ] Record exact base/head, authority choices, permission keys, storage design, actual DB/browser/test evidence, Jev/context status, and non-certifications.
- [ ] Push the branch, open one focused PR, attach it, and stop without merging.
