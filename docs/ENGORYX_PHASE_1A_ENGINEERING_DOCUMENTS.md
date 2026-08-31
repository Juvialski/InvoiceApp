# Engoryx — Phase 1A: Engineering Documents and Blueprint Viewer

Phase 1A provides company-scoped engineering document control for project workspaces: real PDF source uploads, private revision storage, append-only revision provenance, revision-scoped redlines, and deep links into the viewer.

## Scope and implementation status

The Phase 1A implementation is an active hardening milestone. The route-layer extraction is complete, but the deeper domain-controller extraction remains technical debt: `AppShell`, `AppRouter`, and route containers exist while `src/App.tsx` still owns substantial cross-domain state and actions.

Phase 1B (RFIs and technical submittals) and Phase 1C (daily site logs, weather, crews, and equipment) are implemented and merged; the feature registry marks these shipped capabilities **ACTIVE**.

## Real PDF persistence flow

In an authenticated company workspace, creating a document or uploading a revision:

1. validates the PDF signature, extension/type, size, and non-empty content;
2. generates document/revision identifiers and calculates `sha256:<64 lowercase hex characters>` over the exact file bytes;
3. uploads the source to the private `engineering-documents` bucket with `upsert: false`;
4. commits the document/revision metadata and current-revision relationship through an atomic database RPC; and
5. updates the UI only after the Storage upload and metadata transaction are confirmed.

The Storage and database systems cannot share one transaction. If the metadata RPC fails after upload, the client makes a narrowly-scoped best-effort compensation attempt for the unprovenanced object and reports the failure; it never presents the document as saved. A failed authenticated operation does not fall back to a local-only company document. The unsaved form remains available for retry.

Guest/browser-only mode is deliberately separate. It may use local storage and explicitly labeled sample drawings. Sample data is not evidence of authenticated Storage, RLS, or database persistence.

## Database and Storage invariants

The foundation migration is `supabase/migrations/20260826130000_engineering_documents_foundation.sql`. The additive hardening migrations are `supabase/migrations/20260826140000_engineering_documents_hardening.sql`, `supabase/migrations/20260826234440_engineering_documents_annotation_immutability.sql`, `supabase/migrations/20260826235525_engineering_documents_source_validation.sql`, `supabase/migrations/20260827000204_engineering_documents_storage_path_policy.sql`, and `supabase/migrations/20260829100003_core_hardening_wave2c_engineering_corrections.sql`.

- `engineering_documents.current_revision_id` must reference a revision belonging to the same company and document.
- `engineering_document_revisions` is append-only after insertion. Normal authenticated users have no update or delete capability for revision rows.
- Revision source paths are bound to `companies/<company_id>/documents/<document_id>/revisions/<revision_id>/<file_name>`.
- New revision sources must be PDFs with a normalized SHA-256 fingerprint.
- The `engineering-documents` bucket remains private. Read access uses short-lived signed URLs; signed URLs are presentation-layer values and are never stored in the database.
- Normal Storage update and delete policies for revision source objects are removed. Archiving a document does not delete its revisions or source files.
- Only an untouched DRAFT shell with no revisions, annotations, coordination links, Storage objects, or meaningful lifecycle history can use `DELETE_UNUSED`. Used documents use the guarded `ARCHIVE` or `SUPERSEDE` action with a reason; neither action removes source files or revision lineage.
- Annotations are revision-scoped. Application deletes are denied and UI deletes are represented as `status = DELETED` so redline history remains auditable.

## Viewer behavior

The viewer resolves a private `revision.filePath` through `getEngineeringDocumentFileUrl`, then gives the ephemeral signed URL to PDF.js. It reports loading, missing-source, authorization, expired/missing-object, and malformed-PDF failures instead of silently rendering a synthetic blueprint. Explicit guest sample records are marked `SAMPLE`.

Annotations use normalized page coordinates. The Konva overlay applies the current zoom exactly once to page-space geometry while pointer input is converted back to page coordinates before normalization. The viewer supports page navigation, 50–500% zoom, fit page, fit width, resize, touch pinch zoom, and revision-scoped annotation reloads.

Annotation saves are debounced and persisted as one complete revision snapshot. The visible states are `Unsaved`, `Saving`, `Saved`, and `Retry Save`. A save is marked `Saved` only after the callback or remote batch upsert confirms every intended mutation. Local edits are retained on failure, retry is explicit, and generation/request checks prevent late responses from older saves changing the state of newer edits. Dirty annotations are saved successfully before a revision switch or viewer close; a failed save prevents the switch/close.

Drawing scale and sheet-size fields are source metadata only. No dimensional measurement tool is exposed until PDF calibration and crop/media-box validation are implemented; a text value such as `1:100` is not treated as trustworthy physical calibration.

## Project and permission boundaries

The project Documents tab shows only documents whose `projectId` equals the current project. Unassigned company documents are not silently presented as project-owned documents.

The UI receives independent capabilities for read, create/upload, annotation update, and lifecycle-management actions. The lifecycle review surface explains dependency blockers and requires confirmation/reason for archive or supersede. RLS, Storage policies, and the Wave 2C preflight/apply RPCs remain the security boundary; controls only reflect the same capability model for readers, creators, updaters, and managers.

## Lazy loading

`ProjectDocuments` lazy-loads `BlueprintViewer`, keeping PDF.js and Konva in the viewer chunk rather than the ordinary application route chunk. Build output must be checked to confirm the heavy viewer dependencies remain outside the initial bundle.

## Verification boundary

Static/unit validation covers fingerprints, immutable paths, save sequencing, revision filtering, route contracts, permissions, and migration contracts. A connected authenticated Supabase environment is still required to prove live RLS, Storage object existence, signed URL authorization, database RPC execution, and the complete real-PDF browser walkthrough.
