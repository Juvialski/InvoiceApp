# Wide Documents Managed Documents and Retained Artifacts Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first durable, company-scoped managed-document/version layer, authorized private Storage workflow, retained generated-artifact index, and Documents browse/detail experience without duplicating any owning business domain.

**Architecture:** `managed_documents` owns only standalone document identity and reversible archive state; `managed_document_versions` owns immutable file metadata and Storage references; `document_artifact_registrations` points retained generated files back to their authoritative source record, template provenance, and managed version. Server routes perform authorization, file validation, private Storage writes, and signed retrieval; guarded database functions perform company/project checks, append-only version insertion, current-version projection, stale archive protection, and artifact registration. Existing issued Purchase Order/Client Invoice generation keeps `document_generation_evidence` as its delivery/source authority and gains an after-insert registration hook into the generic artifact index.

**Tech Stack:** React 19, TypeScript/TSX, Express, Supabase Postgres/RLS/SECURITY DEFINER RPCs, provider-neutral Storage, Node test runner, pgTAP/runtime migration checks, deterministic safe-demo fixtures.

**Spec:** User-provided `Wide Documents — Managed Documents + Retained Artifacts Foundation` phase contract; `docs/HYDROQUALISENSE_UNIFIED_DOCUMENT_CENTER.md`.

## Global Constraints

- Documents is a discovery/access/creation surface, never a second financial, procurement, payroll, inventory, engineering, banking, or delivery authority.
- Preserve the established interaction model: browse visually, edit like a spreadsheet where appropriate, execute sensitive workflows deliberately.
- Company identity is derived from the deployment context; callers cannot choose another `company_id`.
- All binary writes use private, company-prefixed Storage paths and server-side Storage authority; no public bucket or arbitrary client path is allowed.
- Version bytes and version metadata are immutable after commit; replacement means append a new version and advance the current-version pointer.
- RLS, permission checks, explicit `SECURITY DEFINER` actor/company checks, and least privilege remain authoritative; direct client writes to managed tables are denied.
- Project linkage is optional and must use a same-company composite foreign key plus a permission check; it must never disclose project data to users without project access.
- Issued financial snapshots, delivery history, template versions, source documents, and existing domain lifecycle/settlement/history semantics remain unchanged.
- Generated artifact registration stores provenance and retrieval references only; it does not copy calculations, balances, approvals, statuses, or lifecycle truth.
- Production remains read-only; QA/provider certification is not inferred from local or structural evidence.

## Review Focus

- A user submits a project ID from another company or without project permission: the RPC rejects it and no Storage object or metadata row survives.
- Two authenticated uploads create a new version at the same time: the parent row lock yields one ordered version sequence with no lost update or duplicate version number.
- An archive request uses an old `updated_at`: the RPC returns `40001`/`EXPECTED_VERSION_MISMATCH` and leaves the active document unchanged.
- A client supplies a path outside `companies/<deployment-company>/managed-documents/<document>/<version>/...`: file validation or the RPC rejects it before durable metadata commit.
- A user can read an artifact only when the source-domain permission allows it: artifact titles, counts, version metadata, and signed URLs do not become a central-workspace bypass.

---

### Task 1: Database, permission, RLS, and immutable-history foundation

**Files:**
- Create: `supabase/migrations/20260921095140_wide_documents_managed_artifacts_foundation.sql`
- Create: `tests/managedDocumentsMigration.test.ts`
- Create: `tests/managedDocumentsRuntime.test.ts`
- Create: `tests/migrations/fixtures/03_managed_documents_upgrade/meta.json`
- Create: `tests/migrations/fixtures/03_managed_documents_upgrade/seed.sql`
- Create: `tests/migrations/fixtures/03_managed_documents_upgrade/post_assert.sql`
- Modify: `scripts/test-migrations.ts`

**Interfaces:**
- Produces `managed_documents`, `managed_document_versions`, and `document_artifact_registrations` with company/project/template/version foreign-key scope.
- Produces `server_create_managed_document_with_version(jsonb, uuid)`, `server_create_managed_document_version(jsonb, uuid)`, `server_archive_managed_document(uuid, timestamptz, uuid)`, and `server_register_generated_document_artifact(jsonb, uuid)` as service-only mutation boundaries.
- Produces RLS read policies, private Storage bucket/path policies, immutable triggers, and permission catalog entries `documents.read` and `documents.manage`.

- [ ] **Step 1: Generate the canonical migration file**

Run:

```powershell
npx.cmd supabase migration new wide_documents_managed_artifacts_foundation
```

Use the generated timestamped file; do not hand-invent its filename.

- [ ] **Step 2: Write migration invariant tests first**

Assert that the generated migration contains all three tables, company-scoped composite foreign keys, `documents.read`/`documents.manage`, RLS enablement, private bucket creation, no authenticated direct mutation grants, immutable version/delete guards, expected-version archive checking, Storage path validation, artifact source-permission checks, and the generation-evidence registration trigger.

- [ ] **Step 3: Run the focused migration test and observe failure**

Run:

```powershell
npx.cmd tsx --test tests/managedDocumentsMigration.test.ts
```

Expected: FAIL because the migration does not yet contain the managed-document contract.

- [ ] **Step 4: Implement the schema and permission catalog**

Add company-scoped tables with `uuid` IDs, `timestamptz` timestamps, `bigint` byte sizes, SHA-256 checks, explicit allowlists for category/origin/artifact type/status, indexes for company/status/date, and composite same-company references to `projects`, `document_template_versions`, and managed versions. Add the private bucket `company-managed-documents` with a path regex for `companies/<company>/managed-documents/<document>/versions/<version>/<safe-name>`.

- [ ] **Step 5: Implement RLS and guarded functions**

Use `(select public.has_company_permission(...))` in policies, private security-definer helpers with explicit `auth.uid()`/active-membership checks for artifact-source permission resolution, and service-only wrappers that accept the already-authenticated actor ID. Lock the parent row before computing the next version number, validate expected timestamps inside the archive mutation, reject archived-document uploads, and write company audit events or immutable managed history for create/version/archive/register actions.

- [ ] **Step 6: Add upgrade fixture assertions and run static migration checks**

Run:

```powershell
npx.cmd tsx --test tests/managedDocumentsMigration.test.ts
npm.cmd run test:migrations
```

Expected: focused assertions pass; static migration checks pass, while live upgrade/runtime output is classified separately if PostgreSQL is unavailable.

- [ ] **Step 7: Add conditional runtime concurrency/isolation coverage**

The runtime test must use throwaway IDs and skip unless `MANAGED_DOCUMENTS_RUNTIME_DB=1`. It must create two users/company memberships, exercise cross-company/project denial, call two concurrent version RPCs, assert versions `2` and `3` with one current pointer, assert stale archive rejection, and clean up in an admin transaction. The upgrade fixture must apply the migration after its boundary and assert the tables/functions/policies exist without changing earlier source/template rows.

### Task 2: Safe file policy, Storage helpers, and server managed-document API

**Files:**
- Modify: `src/lib/fileSecurity.ts`
- Modify: `src/lib/storage/keys.ts`
- Create: `src/server/managedDocuments/managedDocumentRouter.ts`
- Modify: `src/server/storage/storageRouter.ts`
- Modify: `server.ts`
- Create: `tests/managedDocumentStorage.test.ts`
- Create: `tests/managedDocumentRouter.test.ts`

**Interfaces:**
- Produces `validateManagedDocumentBytes(bytes, mimeType, fileName)`, `buildManagedDocumentStoragePath(companyId, documentId, versionId, fileName)`, and `isManagedDocumentStoragePath(...)`.
- Produces authenticated endpoints under `/api/managed-documents`: bounded list/detail, review-confirmed initial upload, immutable new-version upload, version signed retrieval, and stale-checked archive.

- [ ] **Step 1: Write failing file-policy/path tests**

Cover valid PDF/JPEG/PNG/WEBP/DOCX/XLSX/CSV/TXT signatures, active HTML/SVG/XML rejection, MIME/extension mismatch, the 10 MB limit, path traversal sanitization, company mismatch, and version/document UUID mismatch.

- [ ] **Step 2: Run the storage tests to confirm red**

Run:

```powershell
npx.cmd tsx --test tests/managedDocumentStorage.test.ts
```

Expected: FAIL because the new validator and path helpers are absent.

- [ ] **Step 3: Implement the allowlist and canonical path helpers**

Reuse existing signature utilities and filename sanitization; reject unsupported or active-content files before provider calls. Keep the new path parser company-scoped and exact; do not reuse a caller-supplied bucket/path as authority.

- [ ] **Step 4: Write the router authorization and compensation tests**

Use the existing Express/fake-authorizer pattern. Verify upload writes through the provider, calls the guarded RPC with actor/company metadata, compensates the object when the RPC fails, returns only safe metadata, signs URLs for authorized versions, and denies archive/version actions for read-only or cross-company callers.

- [ ] **Step 5: Implement the router**

Use `authorizeStorageRequest` with `documents.read`/`documents.manage` and an explicit any-of read resolver for source-backed artifacts. Store through the provider-neutral primary provider using the private bucket for Supabase, verify the returned hash/size, persist through the service-only RPC, and delete only uncommitted objects during failure compensation. Return bounded metadata and short-lived signed URLs; never return raw Storage paths as the primary UI payload.

- [ ] **Step 6: Register the router and run focused server tests**

Mount `createManagedDocumentRouter()` before the SPA fallback, then run:

```powershell
npx.cmd tsx --test tests/managedDocumentStorage.test.ts tests/managedDocumentRouter.test.ts
```

### Task 3: Client API, generated-artifact adapter, and authoritative generation retention

**Files:**
- Create: `src/lib/managedDocuments.ts`
- Modify: `src/server/documentTemplates/documentTemplateRouter.ts`
- Modify: `src/lib/documentTemplates.ts`
- Create: `tests/managedDocumentsClient.test.ts`
- Modify: `tests/documentTemplateDynamicRouter.test.ts`
- Modify: `tests/documentTemplateSecurityBoundary.test.ts`

**Interfaces:**
- Produces typed `ManagedDocumentSummary`, `ManagedDocumentDetail`, `ManagedDocumentVersion`, and `RetainedDocumentArtifact` models plus list/detail/upload/version/archive API functions.
- Extends generated DOCX retention to return `X-Managed-Document-Id` and `X-Managed-Version-Id` while preserving existing binary download behavior.

- [ ] **Step 1: Write failing client and adapter assertions**

Assert API paths and response mapping, generated managed documents are stored in the private bucket, the issued-generation path still calls the existing `record_document_generation_evidence`, and the generic artifact index records Purchase Order/Client Invoice source type, source ID, template version, immutable version, and hash without copying financial fields.

- [ ] **Step 2: Implement typed client requests**

Follow `companyApiRequest`/`DocumentTemplateApiError` conventions, base64-encode only after client-side file validation, and expose `previewUrl` only from the short-lived retrieval endpoint.

- [ ] **Step 3: Retain dynamic managed-template output**

In `/managed-generate`, allocate document/version IDs, store the merged DOCX through the private provider, call `server_register_generated_document_artifact`, and clean up only when registration fails before the metadata transaction commits. Keep template/source context and actor metadata; do not serialize source-domain business calculations into the managed row.

- [ ] **Step 4: Add the existing generation registration hook**

Register a generic artifact from the committed `document_generation_evidence` insert through a database trigger/private helper. Preserve existing evidence rows and delivery lookups as the authority; the generic row is only an authorized retrieval projection.

- [ ] **Step 5: Run focused generation/client tests**

Run:

```powershell
npx.cmd tsx --test tests/managedDocumentsClient.test.ts tests/documentTemplateDynamicRouter.test.ts tests/documentTemplateSecurityBoundary.test.ts
```

### Task 4: Documents browse/detail/create UX and routing

**Files:**
- Modify: `src/utils/appRouting.ts`
- Modify: `src/app/routes/AppRouter.tsx`
- Modify: `src/lib/documentRegister.ts`
- Create: `src/components/documents/ManagedDocumentUploadView.tsx`
- Create: `src/components/documents/ManagedDocumentDetailView.tsx`
- Modify: `src/components/documents/DocumentCreateView.tsx`
- Modify: `src/app/routes/DocumentsRoute.tsx`
- Modify: `src/utils/accessControl.ts`
- Create: `tests/managedDocumentsWorkspace.test.tsx`
- Modify: `tests/documentCenter.test.ts`
- Modify: `tests/appRouting.test.ts`

**Interfaces:**
- Adds `documents.read` and `documents.manage` to the frontend permission vocabulary and preserves source-domain alternatives.
- Adds a `managedId` Documents query/deep link while keeping `/documents`, `view=create`, and `view=templates` backward-compatible.
- Keeps `OperationsGrid` out of the normal upload/detail flow; version history is a document-oriented list with explicit actions.

- [ ] **Step 1: Write failing route/register/UI assertions**

Cover managed/artifact register kinds, detail deep-link parsing, permission-gated upload/archive/version actions, quiet source provenance, prominent exceptional errors/conflicts, and no raw Storage path exposure.

- [ ] **Step 2: Implement route and register contracts**

Add `managedId` parsing/path helpers, append permission-filtered managed/artifact rows to `buildDocumentRegister`, and map source/project labels without copying domain financial values.

- [ ] **Step 3: Implement the document-oriented upload review surface**

Create file -> title/category/description/project draft state, show a review step with filename/type/size and the selected project, then commit through the parent API. Keep progress, validation, conflict, and failure states visible and offer a detail link after commit.

- [ ] **Step 4: Implement detail/version history**

Show title/category/current file/provenance/project/version history/download, explicit Upload new version for `documents.manage`, and archive only with the current `updatedAt`. Generated artifacts show source-domain/template provenance and remain immutable/read-only.

- [ ] **Step 5: Integrate the route and run focused UI tests**

Run:

```powershell
npx.cmd tsx --test tests/managedDocumentsWorkspace.test.tsx tests/documentCenter.test.ts tests/appRouting.test.ts
```

### Task 5: Deterministic demo fixtures and browser evidence

**Files:**
- Create: `src/demo/data/managedDocuments.ts`
- Modify: `src/app/routes/DocumentsRoute.tsx`
- Create: `tests/managedDocumentsDemo.test.ts`
- Modify: `scripts/qa/demoScenarios.ts`

- [ ] **Step 1: Add sanitized managed-document and artifact fixtures**

Use fictional titles, hashes, IDs, and version timestamps only. Include one standalone warranty/checklist upload with two versions and one generated Purchase Order artifact linked to the existing demo PO without financial duplication.

- [ ] **Step 2: Add responsive demo scenarios**

Cover Documents Library with managed/artifact rows, detail/version history, Create upload review, mobile version list, and protected read-only artifact state at desktop, constrained-laptop, tablet, and phone viewports.

- [ ] **Step 3: Run the demo scenario contract test**

Run `npx.cmd tsx --test tests/managedDocumentsDemo.test.ts` and keep demo data entirely local/non-production.

### Task 6: Roadmap, handoff, and phase-contract synchronization

**Files:**
- Modify: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`
- Modify: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`
- Modify: `docs/HYDROQUALISENSE_UNIFIED_DOCUMENT_CENTER.md`
- Modify: `src/config/productFeatures.ts` only if the client-facing feature status changes after validation

- [ ] **Step 1: Record the exact starting SHA and implemented boundary**

Document `288847309ddadf66d4d6d644f445ba04afa0ee97`, the feature branch, migration, Storage bucket/path, RPC/RLS authority, and the two representative generated paths integrated.

- [ ] **Step 2: Update the product truth only after implementation is verified**

Mark managed standalone documents, version history, general upload, retained artifact index, and Documents detail as available only for the actually working scope. Keep hosted QA, provider, production, broad artifact migration, workforce, and custom-field work explicitly deferred.

- [ ] **Step 3: Remove stale next-phase language**

Replace the old Jev-v2B “next implementation” paragraph with the reconciled next unfinished Wide Documents slice and current provider/Worker Registration gates.

### Task 7: Final integrated validation and handoff

**Files:**
- Modify: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md` with final evidence only

- [ ] **Step 1: Run the final focused and deterministic affected ladder**

Run edited tests, focused Documents/Storage/security tests, `npm.cmd run test:affected:agent`, lint, typecheck, build, Workflow Map consistency if changed paths require it, and the Jev test-triage checkpoint only if the deterministic selection is broad enough to benefit.

- [ ] **Step 2: Run the required DB/Storage ladder**

Run `docker info`, `npx.cmd supabase start`, clean local reset, pgTAP, migration static checks, upgrade fixtures, managed-document runtime RLS/RPC/concurrency tests, and Storage policy tests. If Docker or Supabase is unavailable, record the exact unavailable command/error and do not claim DB certification.

- [ ] **Step 3: Run browser/demo QA and inspect representative screenshots**

Run the relevant demo runner against the integrated branch, inspect Documents browse/detail/upload/version states at desktop/laptop/tablet/phone, and distinguish local/demo evidence from hosted/production certification.

- [ ] **Step 4: Run one sanitized Jev completion/evidence check**

Record candidate/selected counts, required-test retention, latency/model/token diagnostics when available, and unresolved uncertainty. Jev cannot make the merge/release decision.

- [ ] **Step 5: Review the complete diff and prepare the PR**

Verify no parallel business-record authority, cross-company leakage, public/raw Storage exposure, mutable history, artifact provenance loss, permission broadening, or out-of-scope workforce/provider/financial changes. Commit, push the feature branch, open the PR, and stop without merging it.
