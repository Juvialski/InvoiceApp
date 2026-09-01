# Engoryx Database & Storage Optimization Plan

Status: **Wave S1 completed (Current-State Audit & Storage Architecture Foundation established). Wave S2 is the next planned implementation target.**

Repository: `Juvialski/InvoiceApp`

Architecture: **one deployment -> one client company**.

This plan addresses long-term database and file-storage growth without weakening Engoryx security, auditability, source provenance, or existing finance workflows.

The core principle is:

```text
Postgres
  -> structured business data + document metadata + relationships + audit state

Private object storage
  -> actual PDF/image/spreadsheet/email attachment bytes
```

Large binary document contents should not live in Postgres unless there is a specific justified exception.

---

# Objectives

1. Keep the Supabase Postgres database focused on structured operational data.
2. Prevent PDFs, images, spreadsheets, and other binary files from consuming database capacity unnecessarily.
3. Store files in private object storage and fetch them only when a permitted user opens/downloads/previews them.
4. Preserve document provenance, integrity, duplicate detection, and audit relationships.
5. Avoid storing the same binary file multiple times when strong content-hash evidence proves it is identical.
6. Make the object-storage provider replaceable rather than scattering provider-specific calls throughout business code.
7. Provide usage visibility before storage pressure becomes an incident.
8. Introduce safe cleanup/orphan handling without deleting files still referenced by business records.
9. Preserve one-company-per-deployment boundaries and existing Supabase Auth/RLS permission contracts.
10. Migrate incrementally rather than performing a blind all-at-once storage rewrite.

---

# Non-goals

The first optimization wave must not:

- blindly migrate every existing object;
- delete existing source files merely to save space;
- weaken RLS or business permissions;
- make buckets public;
- expose long-lived file URLs;
- expose object-storage credentials to the browser;
- replace Supabase as the system of record for structured Engoryx data;
- change Invoice, Expense, Cash & Banking, Engineering Document, or Payroll lifecycle rules merely for storage convenience;
- remove existing audit/provenance data;
- introduce cross-company shared document access.

---

# Target architecture

```text
User / Gmail / Import
        |
        v
Document ingestion boundary
        |
        +--> validate type/size
        +--> compute SHA-256
        +--> check authoritative duplicate/reference rules
        |
        v
DocumentStorageProvider
        |
        +--> Supabase Storage provider (current/compatibility)
        |
        +--> external S3-compatible provider (future, e.g. Cloudflare R2)
        |
        v
Private object

Postgres stores:
- document ID
- company ID where required by current schema architecture
- storage provider
- object key/path
- original filename
- MIME type
- byte size
- SHA-256
- source type
- source identifiers
- document/business type
- processing state
- created/updated timestamps
- references to Invoice / Expense / Statement / Engineering Document / other domain records
- audit/provenance metadata
```

When a user opens a document:

```text
Engoryx UI
   -> backend/application authorization check
   -> confirm active company + effective permission
   -> request short-lived signed object URL or stream
   -> browser fetches object on demand
```

Do not persist permanent public URLs as the authorization mechanism.

---

# Storage provider strategy

Engoryx should introduce a provider-neutral document storage contract before switching providers.

Conceptual interface:

```ts
interface DocumentStorageProvider {
  put(input): Promise<StoredObjectRef>;
  head(objectKey): Promise<ObjectMetadata | null>;
  createReadUrl(objectKey, options): Promise<string>;
  delete(objectKey): Promise<void>;
}
```

Additional functions may be added only when real use cases require them.

Business modules should depend on the shared abstraction rather than directly knowing whether the object is in Supabase Storage, Cloudflare R2, or another compatible provider.

## Initial provider

The existing Supabase Storage path remains supported during the transition.

## Candidate external provider

Cloudflare R2 is a strong candidate because it is S3-compatible and suited to private object storage, but Engoryx should not encode R2-specific assumptions into Invoice/Expense/Statement business logic.

Provider selection and credentials are deployment environment configuration.

---

# Canonical document metadata

Before implementation, audit the existing `source_documents`, source metadata, storage paths, and module-specific document references.

Do not create a duplicate metadata system if the current `source_documents` model can be extended safely.

The canonical metadata contract should support at least:

- `id`
- company ownership/scope according to current schema conventions
- `storageProvider`
- `objectKey` / storage path
- `originalFilename`
- `mimeType`
- `sizeBytes`
- `sha256`
- `sourceType`
- `documentType`
- Gmail message/attachment identity where applicable
- processing/preservation state
- created/updated timestamps

Relationships to business records should reuse existing foreign keys/link tables where possible rather than adding many nullable columns without review.

---

# Binary-data rule

Do not store durable PDFs/images/spreadsheets as:

- Postgres `bytea` blobs unless specifically justified;
- base64 strings in ordinary business rows;
- large JSON fields;
- duplicated raw payloads across Invoice/Expense/source tables.

Temporary base64 may still exist at a bounded API/extraction boundary when required by a model/provider, but it should not become durable database storage.

Raw extracted text should also be reviewed for necessity. Persist only what is required for product functionality, auditability, or reliable reprocessing.

---

# SHA-256 deduplication

Every durable uploaded/preserved file should have a strong content hash where practical.

Target flow:

```text
new file
  -> compute SHA-256
  -> check company-scoped existing object/reference
  -> if same binary already exists:
       reuse object where safe
       create a new logical relationship/source reference if needed
     else:
       upload new object
       save metadata
```

Important distinction:

**Binary deduplication is not business-record deduplication.**

The same binary object may legitimately have more than one source/business relationship. Do not collapse Invoice/Expense/Statement records merely because their files share a hash without applying existing domain duplicate rules.

Never deduplicate across unrelated client deployments.

---

# Object key strategy

Object keys must be opaque enough to avoid leaking sensitive business information and structured enough for operational management.

Prefer identifiers over raw filenames.

Conceptual form:

```text
<deployment/company-scope>/<document-id>/<object-version-or-hash>
```

Original filenames remain metadata for display/download.

Do not use user-controlled filenames directly as authoritative object paths without sanitization.

---

# Private access and signed URLs

All durable business-document buckets remain private.

Read flow must enforce:

1. authenticated Engoryx session;
2. active deployment/company context;
3. effective domain permission;
4. existence of a valid document/business relationship;
5. short-lived signed access or protected streaming.

Signed URLs should expire quickly enough to avoid becoming durable bearer links while remaining usable for PDF/image preview.

Never expose storage service credentials to the frontend.

---

# Upload limits and validation

Define documented limits per document class based on real product needs.

Validate before durable upload where possible:

- allowed MIME types/extensions;
- maximum bytes;
- known unsupported formats;
- empty/corrupt files;
- file hash;
- filename sanitization.

Do not trust MIME type supplied by the browser alone when stronger validation is available.

---

# Lifecycle and orphan cleanup

Object deletion must be conservative.

A file is eligible for physical deletion only when Engoryx can prove it is no longer referenced by any live/auditable record that requires retention.

Recommended lifecycle:

```text
logical record deletion/archive
  -> retain metadata according to domain rules
  -> mark object/reference cleanup candidate
  -> verify no remaining references
  -> grace period
  -> delete object
  -> record cleanup result
```

Never run an unbounded delete sweep based only on object age.

Finance audit records may require longer retention than ordinary temporary uploads.

---

# Storage usage visibility

Add measurable storage accounting before hard limits become operational surprises.

Track or derive:

- total object bytes;
- total object count;
- bytes by document type;
- largest objects;
- recent growth rate;
- deduplicated bytes avoided where measurable;
- orphan cleanup candidates;
- failed/incomplete uploads;
- database-heavy tables separately from object-storage usage.

An Admin/Settings storage view may be introduced in a later wave after the metrics contract exists.

---

# Database optimization audit

File storage is expected to be the largest long-term growth concern, but the database must also be audited.

Inspect:

- largest tables and indexes;
- high-growth audit/history tables;
- large JSON/JSONB columns;
- duplicate denormalized payloads;
- raw extraction/model response retention;
- Gmail/source metadata growth;
- statement transaction/import history;
- stale temporary/preparation records;
- missing indexes on high-volume access paths;
- indexes that are redundant or disproportionately large;
- row retention/archival opportunities consistent with audit requirements.

Do not remove data merely because it is large. First classify it as operationally required, auditable/retained, reconstructable, or safely disposable.

---

# Migration safety

Any migration from Supabase Storage to an external provider must be resumable and verifiable.

Required concepts:

- provider field or equivalent migration-safe locator;
- old and new object reference available during transition;
- copy first, verify second, switch reference third, delete old object only later;
- compare size/hash after copy;
- idempotent backfill;
- per-object migration state;
- retryable failures;
- no global cutover requiring every object to succeed at once;
- rollback/read compatibility while migration is incomplete.

Never delete the original object in the same step that first copies it to a new provider.

---

# Recommended implementation waves

## Wave S1 — Current-State Audit + Storage Architecture Foundation

Status: **COMPLETED** (Deliverables in `docs/ENGORYX_STORAGE_CURRENT_STATE_AUDIT.md`, `scripts/database-storage-audit.sql`, `src/lib/storage/`, `tests/documentStorageFoundation.test.ts`, and `tests/databaseStorageAudit.test.ts`).

Accomplished:

- verified zero in-database binary blobs (0 `bytea` columns) and zero durable binary data in `localStorage`;
- inventoried every current private storage bucket (`invoice-originals`, `email-originals`, `payroll-import-sources`, `engineering-documents`) and mapped producers/consumers across Invoices, Email Intake, Expenses, Cash & Banking, Engineering Documents, and Payroll;
- verified `source_documents` role as canonical source boundary for Invoices, Expenses, and Cash & Banking, while preserving independent immutable revision lineage for Engineering Documents (`engineering_document_revisions`);
- audited database growth candidates across all tables and created `scripts/database-storage-audit.sql` for read-only production measurement;
- identified potentially redundant legacy `user_id` index candidates alongside single-tenant `company_id` indexes, pending production scan and query-plan measurements before any removal;
- implemented provider-neutral storage contracts and types in `src/lib/storage/types.ts`;
- implemented canonical company-scoped target object-key builder, filename sanitizer, and legacy path parser in `src/lib/storage/keys.ts`;
- implemented SHA-256 calculation and domain deduplication vs provenance contracts in `src/lib/storage/dedup.ts`;
- established signed-read authorization, migration state machine, and conservative orphan cleanup contracts;
- selected **Manual Invoice Source Documents** (`source_documents` under `invoice-originals`) as the recommended bounded pilot for Wave S2.

## Wave S2 — Provider Abstraction + Private External Storage Pilot

Goals:

- implement the provider abstraction;
- retain Supabase Storage provider compatibility;
- implement a private S3-compatible provider, likely Cloudflare R2;
- backend-only credentials;
- short-lived signed reads;
- pilot one bounded document flow;
- verify hash/size/source integrity;
- preserve existing business permissions and UX.

Do not migrate every document type in this wave.

## Wave S3 — Shared Document Migration + Deduplication

Goals:

- migrate supported source-document flows incrementally;
- content-hash object reuse where safe;
- resumable migration state;
- dual-read compatibility during rollout;
- old-object retention/grace period;
- strong migration/integrity tests.

## Wave S4 — Database Growth Optimization

Goals:

- address confirmed high-growth database structures from S1 measurements;
- reduce unnecessary durable raw/base64/model payloads;
- optimize high-value indexes/query patterns;
- introduce safe archival/retention only where product/audit requirements permit;
- avoid speculative schema churn without measured benefit.

## Wave S5 — Usage Monitoring + Lifecycle Cleanup

Goals:

- storage usage metrics;
- admin visibility;
- quotas/warnings where useful;
- orphan candidate detection;
- grace-period cleanup process;
- audit trail for cleanup;
- growth forecasting/operational documentation.

---

# Security invariants

1. One deployment serves one client company.
2. Object storage is private.
3. Storage credentials remain server-side/environment-only.
4. Signed reads are issued only after Engoryx authorization checks.
5. Existing RLS and domain permission rules remain authoritative.
6. Moving a file outside Supabase Storage does not move authorization outside Engoryx.
7. Original source provenance and SHA-256 integrity remain auditable.
8. Raw Gmail tokens and statement passwords are never stored with documents.
9. External object keys must not create cross-deployment access paths.
10. Provider migration must not create temporary public buckets or permanent public links.

---

# Compatibility invariants

Storage optimization must preserve:

- Invoice source preview/recovery;
- Invoice duplicate/source checks;
- Email Intake source preservation;
- bank statement import/review and duplicate provenance;
- password-protected statement security rules;
- Expense receipt preview/recovery and duplicate checks;
- Engineering Document access where already implemented;
- existing audit trails;
- file download names/MIME behavior;
- mobile/tablet/desktop preview behavior;
- demo mode isolation from production data/storage;
- existing company and permission boundaries.

---

# S1 completion gate

Wave S1 is complete only when the repository has been inspected and the following are known rather than guessed:

- where every major binary file type is currently stored;
- which modules write/read each storage path;
- whether any durable file bytes/base64 live in Postgres;
- which tables/fields are likely to drive database growth;
- the current source-document schema and dedup behavior;
- current permission checks for upload/read/delete;
- current object naming strategy;
- migration compatibility requirements;
- a reviewed provider-neutral storage contract;
- a safe, focused S2 pilot scope.

Required repository validation remains the same as other substantial waves: tests, lint/typecheck, build, relevant migration/invariant tests, workflow-map consistency when workflows change, and browser QA when user-visible behavior changes.

---

# Agent execution constraint

For substantial implementation work, `AGENTS.md` is authoritative:

- maximum 2 concurrent subagents;
- use non-overlapping workstreams;
- reuse the same agents sequentially for additional waves;
- lead agent owns shared interfaces, security decisions, migrations spanning workstreams, integration, final validation, push, and PR creation.
