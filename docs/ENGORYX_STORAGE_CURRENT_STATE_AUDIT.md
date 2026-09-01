# Engoryx Document Storage & Database Growth Audit (Wave S1)

Status: **Completed Wave S1 Baseline**  
Repository: Juvialski/InvoiceApp  
Architecture: **one deployment -> one client company**  
Target Date: September 2026

---

## 1. Executive Summary

This document establishes the verified current-state audit of all durable document storage paths, database growth drivers, and index access patterns across the Engoryx platform. It also defines the provider-neutral storage architecture foundation required for future non-disruptive migration to private external object storage (e.g., Cloudflare R2) in Wave S2 and S3.

### Key Architectural Invariants Verified
1. **Zero in-database binary blobs**: Verified that 0 ytea or BLOB columns exist in PostgreSQL. All durable physical files (PDFs, images, workbooks, .eml files) are stored in private Supabase Storage.
2. **Zero durable binaries in localStorage**: Frontend localStorage contains only JSON workspace caches for guest/demo mode and UI preferences. File previews use short-lived (1-hour TTL) signed URLs.
3. **source_documents is the canonical finance source boundary**: Invoices, Expenses, and Cash & Banking statements reference public.source_documents for file provenance, SHA-256 integrity, and file metadata.
4. **Engineering document revisions maintain independent immutable provenance**: engineering_document_revisions retains its own append-only revision records, physical files, and ile_fingerprint hashes. It is not forced into source_documents.
5. **Physical binary reuse is strictly separated from logical business provenance**: Identical byte content does not collapse independent business records, payroll import batches, or engineering revisions.
6. **No external storage credentials in browser code**: Future S2 providers execute server-side; clients interact exclusively via authenticated backend RPCs and short-lived signed URLs.

---

## 2. Current-State Storage Inventory & Flow Specifications

### 2.1 Private Supabase Storage Buckets

| Bucket Name | Visibility | Storage RLS Read Policy | Storage RLS Insert Policy | Delete Policy | Stored Content |
| :--- | :--- | :--- | :--- | :--- | :--- |
| invoice-originals | Private | invoices.read or expenses.read via private.storage_company_id(name) | invoices.manage or expenses.manage via private.storage_company_id(name) | Revoked / No policy (compensation via client before DB commit) | Manual invoice scans, receipts, Gmail invoice/statement attachments |
| email-originals | Private | gmail.read via private.storage_company_id(name) | gmail.manage via private.storage_company_id(name) | Revoked / No policy | Raw RFC822 .eml email source files ingested from Gmail |
| payroll-import-sources | Private | payroll.import via private.storage_company_id(name) | payroll.import via private.storage_company_id(name) | payroll.import allowed for uncommitted staging cleanup | Staged payroll timesheets and workbook files (CSV, XLS, XLSX, XLSM) |
| engineering-documents | Private | engineering.documents.read via private.storage_company_id(name) | engineering.documents.create, update, manage | engineering.documents.manage (compensation only) | Blueprint drawings, CAD sheet exports, and revision PDFs |

---

### 2.2 Durable Document Flow Breakdown

#### Detailed Flow Specifications:

#### Flow 1: Manual Invoice Uploads
- **Domain**: Invoices
- **File Types**: PDF, PNG, JPEG, WebP (max 10 MB)
- **Producer**: src/lib/persistence.ts:saveManualSourceDocument
- **Consumer**: Invoice Extraction Engine, Review UI, Invoice List
- **Bucket**: invoice-originals
- **Path Pattern**: companies/<companyId>/invoices/manual/<year>/<month>/<shaPrefix>-<uuid8>-<safeFileName>
- **Metadata Table**: public.source_documents -> public.invoices.source_document_id (ON DELETE SET NULL)
- **SHA-256 Behavior**: SHA-256 calculated prior to upload. If a matching (company_id, sha256) row exists, reuses existing record and skips binary re-upload.
- **Validation**: Magic byte signature verification (alidateInvoiceDocumentBytes) and extension matching.
- **Signed URL**: 3600s TTL generated on demand for preview.
- **Compensation**: Upload failure cleans up orphan storage object via cleanupUploadedObject.

#### Flow 2: Email Intake (Raw Messages & Attachments)
- **Domain**: Email Intake / Cash & Banking / Invoices
- **File Types**: Raw .eml (RFC822); PDF, PNG, JPEG, WebP, CSV, XLSX, XLS attachments
- **Producer**: src/lib/persistence.ts:saveGmailMessageSource, src/lib/emailIntake.ts
- **Consumer**: Email Intake Review Queue, Bank Statement Importer, Expense Creator
- **Buckets**: email-originals (EML) and invoice-originals (Attachments)
- **Path Patterns**:
  - Raw EML: companies/<companyId>/emails/<year>/<month>/<messageToken>/message.eml
  - Attachments: companies/<companyId>/invoices/<year>/<month>/<messageToken>/<attachmentToken>-<shaPrefix>-<safeFileName>
- **Metadata Tables**: public.email_messages (EML) and public.source_documents (Attachments)
- **SHA-256 Behavior**: Tokenized hashed paths for opaque Gmail IDs. Unique constraint on (company_id, email_message_id, gmail_attachment_id).
- **Validation**: alidateGmailRawMessage, alidateGmailAttachmentEnvelope (max 20 attachments, max 25 MB aggregate), alidateGmailAttachmentBytes.

#### Flow 3: Cash & Banking Bank Statement Imports
- **Domain**: Cash & Banking
- **File Types**: CSV, XLSX, XLS, PDF statements
- **Producer**: src/lib/cashBankingPersistence.ts, src/lib/emailIntakeStatementProvenance.ts
- **Consumer**: Statement Reconciliation Workspace, Match Engine, Transaction Ledger
- **Bucket**: invoice-originals (when ingested via Email Intake / source preservation)
- **Metadata Table**: public.financial_import_batches (source_document_id referencing public.source_documents via ON DELETE RESTRICT)
- **Duplicate Behavior**: Exact duplicate statement detection based on account, transaction dates, and source hash blocks accidental re-import.

#### Flow 4: Adaptive Payroll Import Sources
- **Domain**: Workforce & Payroll
- **File Types**: CSV, XLS, XLSX, XLSM (max 15 MB)
- **Producer**: src/lib/payrollImportPersistence.ts:uploadPayrollImportSourceToSupabase
- **Consumer**: Payroll Import Mapper, Verification, and Reconciliation Engine
- **Bucket**: payroll-import-sources
- **Path Pattern**: companies/<companyId>/payroll-imports/<batchId>/<safeFileName>
- **Metadata Table**: public.payroll_import_batches (storage_path, ile_sha256)
- **SHA-256 Behavior**: ile_sha256 recorded on batch; duplicate batch check warns user on re-imports. Staging rows (payroll_import_rows) reference the batch ID.
- **Validation**: alidatePayrollImportBytes (ZIP/OLE magic bytes and non-binary CSV check).

#### Flow 5: Engineering Document Revisions
- **Domain**: Engineering & Field Operations
- **File Types**: PDF only (max 50 MB)
- **Producer**: src/lib/engineeringDocumentsPersistence.ts:uploadEngineeringDocumentFile
- **Consumer**: Blueprint Viewer, PDF Annotation Engine, Sheet Calibration
- **Bucket**: engineering-documents
- **Path Pattern**: companies/<companyId>/documents/<documentId>/revisions/<revisionId>/<safeFileName>.pdf
- **Metadata Tables**: public.engineering_documents & public.engineering_document_revisions
- **SHA-256 Behavior**: ile_fingerprint format sha256:<hex64>; indexed by (company_id, file_fingerprint).
- **Immutability Invariant**: Committed revisions are strictly append-only. Revision records and storage paths cannot be altered or overwritten once committed.
- **Compensation**: Unprovenanced uploads compensated via compensateUnprovenancedEngineeringDocumentUpload if atomic DB RPC fails.

#### Flow 6: Assistant Attachment & File Handling
- **Domain**: AI Assistant
- **Storage Mode**: **Transient in-memory request context by default.**
- **Details**:
  - Uploaded files in chat turns are validated in src/assistant/attachmentRouter.ts and encoded into in-memory base64 buffers.
  - Passed to src/server/assistant/assistantAttachments.ts where they are converted directly into model prompt parts (inlineData for images/PDFs, extracted text for tabular files).
  - They are **not** written to Supabase storage or database tables during chat turns.
  - If a user explicitly clicks to process an attached invoice (via onProcessAttachedInvoice), the file is handed off to saveManualSourceDocument(), which permanently stores the binary in invoice-originals and creates a source_documents record.

---

## 3. Database Growth Audit & Candidate Classification

### 3.1 Schema Growth Inventory

Across all 74 database migrations and 46 application tables, large text and JSON/JSONB columns were audited:

| Category | Table & Column | Data Type | Growth Driver |
| :--- | :--- | :--- | :--- |
| **Finance / Invoices** | invoices.current_data | JSONB | Complete structured snapshot of invoice fields |
| **Finance / Invoices** | invoice_extractions.raw_result | TEXT | Raw OCR / LLM response payload |
| **Finance / Invoices** | invoice_extractions.structured_result | JSONB | Parsed candidate JSON data |
| **Finance / Invoices** | invoice_extractions.validation_result | JSONB | Extraction warnings and verification checks |
| **Finance / Invoices** | invoice_review_events.previous_value / new_value | JSONB | Field-level correction audit history |
| **Email Intake** | email_messages.body_text / body_html | TEXT | Raw email message bodies |
| **Email Intake** | email_messages.ai_classification | JSONB | Classification confidence and extraction flags |
| **Workforce / Payroll** | payroll_entries.calculation_snapshot | JSONB | Gross-to-net, deduction, allowance calculations |
| **Workforce / Payroll** | payroll_entries.cost_context | JSONB | Project labor allocation breakdown |
| **Workforce / Payroll** | payroll_import_rows.raw_row | JSONB | Cell-by-cell spreadsheet dumps (**high row volume**) |
| **Workforce / Payroll** | payroll_import_rows.canonical_data | JSONB | Parsed employee staging record |
| **Workforce / Payroll** | payroll_import_batches.mapping_snapshot | JSONB | Field mapping state for batch |
| **Engineering** | drawing_annotations.geometry | JSONB | Vector coordinates, bounding boxes, markup paths |
| **Engineering** | drawing_annotations.style | JSONB | Color, opacity, stroke, text styling |
| **AI Assistant** | ssistant_messages.content | JSONB | Chat turn history |
| **AI Assistant** | ssistant_action_events.normalized_args / preview | JSONB | Action proposal payloads |
| **Compliance / System** | company_audit_events.metadata | JSONB | Regulatory tenant audit trail |
| **Project Ledger** | project_accounting_events.metadata | JSONB | Cost allocation event history |

---

### 3.2 Candidate Retention & Growth-Risk Classification

| Candidate Classification | Entities / Columns | Retention & Operational Rationale | Action for S2/S4 |
| :--- | :--- | :--- | :--- |
| **Authoritative / Must Retain** | invoices.current_data, invoice_line_items.item_data, payroll_entries.calculation_snapshot, payroll_entries.cost_context, inancial_transactions, inancial_transaction_matches, engineering_documents, engineering_document_revisions, drawing_annotations, master entities | Permanent business and engineering truth. Protected by core financial integrity and revision immutability policies. | Retain permanently; ensure optimized indexing. |
| **Audit History / Retention-Sensitive** | company_audit_events.metadata, project_accounting_events.metadata, invoice_review_events, engineering_daily_site_log_events | Regulatory, compliance, and RBAC tracking. Must follow formal company data retention policies. | Retain; archive to cold storage only under formal policy. |
| **Reconstructable** | invoice_extractions (aw_result, structured_result, alidation_result), inancial_balance_snapshots | Extraction outputs are derived from immutable source_documents via AI/OCR; balance snapshots can be recalculated. | Eligible for compression or truncation in S4. |
| **Temporary / Staging** | payroll_import_rows (STAGED, READY, SKIPPED, ERROR), uncommitted payroll_import_batches, pending ssistant_action_events (PREPARED) | Active operational staging prior to commit or confirmation. | Retain during active workflow; safe cleanup on failure. |
| **Potentially Safely Prunable Later** | 1. Failed/voided import batches (payroll_import_batches with status FAILED/VOIDED).<br>2. Expired assistant actions (ssistant_action_events where expires_at < now() - interval '30 days').<br>3. payroll_import_rows.raw_row JSONB dumps after batch is committed.<br>4. Discarded draft extractions without linked invoices. | High-safety pruning candidates for future retention/cleanup automation once measurement baseline is established. | Implement safe cleanup jobs in S4/S5. |
| **Unknown Pending Measurement** | Exact TOAST vs heap compression ratios for company_audit_events.metadata vs payroll_import_rows.raw_row on live data. | Measurable via scripts/database-storage-audit.sql in staging/production deployments. | Execute measurement script in live environment. |

---

### 3.3 Index Access Paths & Redundancy Audit

#### A. Redundant Legacy Index Pairs (User-ID vs Company-ID)
During the transition from single-user to single-company deployment architecture, company_id-prefixed composite indexes were added, but several legacy user_id-prefixed indexes remain active:
1. **payroll_import_rows**:
   - Legacy: payroll_import_rows_batch_source_idx (user_id, batch_id, source_sheet, source_row)
   - Legacy: payroll_import_rows_worker_idx (user_id, worker_id, status)
   - Company: payroll_import_rows_company_batch_idx (company_id, batch_id, source_sheet, source_row)
   - Company: payroll_import_rows_company_worker_idx (company_id, worker_id)
   - Company: payroll_import_rows_company_project_idx (company_id, project_id)
   - *Impact*: 5 separate index writes per row on high-volume spreadsheet ingestion.
2. **payroll_entries**:
   - Legacy: payroll_entries_user_run_worker_unique (user_id, payroll_run_id, worker_id)
   - Legacy: payroll_entries_run_idx (user_id, payroll_run_id, worker_id)
   - Company: payroll_entries_company_run_worker_unique (company_id, payroll_run_id, worker_id)
   - Company: payroll_entries_company_run_idx (company_id, payroll_run_id, worker_id)
3. **source_documents**:
   - Legacy: source_documents_user_sha_idx, source_documents_gmail_attachment_unique
   - Company: source_documents_company_sha_idx, source_documents_company_gmail_attachment_unique

#### B. Index Opportunity
- **work_entries**: Has company_id column added in tenancy migrations, but only has work_entries_project_date_idx (user_id, project_id, work_date desc) and work_entries_worker_date_idx (user_id, worker_id, work_date desc). In Wave S4, a composite index on (company_id, project_id, work_date) should replace legacy user indexes.

---

## 4. Read-Only Database Diagnostic Tooling

To provide accurate production measurements without modifying database state, Wave S1 introduces:

- **Script**: scripts/database-storage-audit.sql
- **Safety Test**: 	ests/databaseStorageAudit.test.ts (100% passing)

### Diagnostic Capabilities:
1. **Global Database Overview**: Server version, total database bytes, table/index counts, live tuple estimates.
2. **Relation Sizing Breakdown**: Dissects relation size into table heap, index footprint, and TOAST storage.
3. **Index Scan Efficiency**: Measures index size, scan counts, uniqueness, and identifies zero-scan indexes.
4. **Column Storage Inventory**: Maps all JSON, JSONB, TEXT, ARRAY, and BYTEA columns across the public schema.
5. **High-Growth Event Table Activity**: Analyzes recency distributions (24h, 7d, 30d, 90d+) for audit and event tables.
6. **Temporary & Staging Row Counts**: Measures uncommitted import rows, voided batches, expired AI actions, and unlinked documents.
7. **Storage Object Tracking**: Inventories tracked file counts and aggregate byte sizes recorded across source_documents, engineering_document_revisions, and payroll_import_batches.

### Safety Guarantees:
- **Strictly read-only**: Only SELECT and WITH (CTE) statements.
- **Zero DDL / DML**: No CREATE, ALTER, DROP, INSERT, UPDATE, DELETE, TRUNCATE.
- **Zero Lock / Maintenance**: No VACUUM FULL, REINDEX, CLUSTER, or table locks.
- **Zero Privilege Escalation**: No SET ROLE, GRANT, or RLS disabling.
- **Zero Hardcoded Credentials**: No database URLs or secrets.

---

## 5. Canonical Storage Architecture & Foundation Contracts

### 5.1 Provider-Neutral Interface (src/lib/storage/types.ts)

`	s
export interface DocumentStorageProvider {
  readonly id: StorageProviderId;
  putObject(input: PutObjectInput): Promise<PutObjectResult>;
  getObject(query: ObjectLookupQuery): Promise<GetObjectResult>;
  getSignedUrl(query: ObjectLookupQuery, options?: ReadUrlOptions): Promise<string>;
  deleteObject(query: ObjectLookupQuery): Promise<void>;
  headObject(query: ObjectLookupQuery): Promise<ObjectMetadata | null>;
}
`

### 5.2 Canonical Target Object-Key Contract (src/lib/storage/keys.ts)

Future object keys follow the canonical pattern:
`	ext
companies/<companyId>/objects/<documentId>/<versionOrHash>/<safeFileName>
`

#### Key Rules:
1. **Company Scope Enforced**: Key must start with companies/<companyId>/.
2. **Opaque Document Identifiers**: Uses UUID or random document IDs; no raw Gmail message IDs or confidential vendor/employee names in paths.
3. **Filename Sanitization**: Original filename is sanitized (sanitizeStorageFileName) to prevent path traversal (../, ..\), strip control/null characters, block hidden files (.env), and rename Windows reserved devices (CON, PRN, AUX, NUL).
4. **Legacy Path Compatibility**: parseStorageKey recognizes and categorizes all existing legacy path formats (LEGACY_INVOICE_MANUAL, LEGACY_INVOICE_EMAIL, LEGACY_EMAIL_EML, LEGACY_PAYROLL_IMPORT, LEGACY_ENGINEERING_REVISION, LEGACY_USER_SCOPED).

---

### 5.3 Binary Deduplication Contract (src/lib/storage/dedup.ts)

#### Core Deduplication Invariants:
1. **SHA-256 identifies identical bytes**: calculateSha256Hex computes standard 64-char hex digests.
2. **Company isolation**: Deduplication checks never cross deployment / company boundaries.
3. **Binary dedup != Business record dedup**: The same binary bytes may legitimately correspond to multiple invoices, expense receipts, or email messages.
4. **Engineering revisions preserve per-revision provenance**: Even if a PDF matches an earlier revision, an independent revision record is created.
5. **Payroll imports preserve batch isolation**: Even if a workbook repeats, each import batch preserves its isolated staging rows and audit trail.
6. **Physical object deletion safety**: A physical storage object cannot be deleted while any live or auditable business record references it.

---

### 5.4 Signed-Read Authorization Contract

A document is never accessible solely because its object key is known.

`	ext
User / Browser Request
  ↓
1. Authenticated Engoryx Session (Supabase Auth)
  ↓
2. Active Deployment Company Resolution
  ↓
3. Domain Permission Verification (e.g. invoices.read, engineering.documents.read)
  ↓
4. Business Record Existence & Relationship Check (e.g. invoice belongs to active company)
  ↓
5. Issue Time-Bounded Signed URL (TTL: 3600s / 1 hour) or Protected Stream
  ↓
Browser fetches private binary on demand
`

- **No permanent public URLs**: Signed URLs expire after a short TTL.
- **No stored signed URLs**: Database stores only canonical object keys/paths.
- **Provider neutrality**: For Supabase Storage, uses Supabase Storage signing; for future S3/R2 providers, the backend server signs the request using server-side credentials.

---

### 5.5 Migration & Backfill State Machine (Wave S2 / S3)

`	ext
DISCOVERED -> COPYING -> VERIFYING -> DUAL_READ -> PRIMARY_SWITCH -> GRACE_PERIOD -> AUDIT_PROOF -> CLEANUP
`

#### Migration Guarantees:
- **Resumable & Idempotent**: Per-object migration tracking.
- **Verify before switch**: Never switch pointers without verified byte size and SHA-256 digest.
- **Dual-read compatibility**: Old and new objects remain accessible during rollout.
- **No immediate delete**: Legacy objects are retained in a grace period before physical cleanup.

---

### 5.6 Conservative Orphan Cleanup Contract

An object is **never** an orphan merely because:
- It is old.
- Its immediate UI draft was cancelled.
- It is not currently displayed on an active screen.

#### Cleanup Preconditions:
1. Proof that no active or auditable record (invoices, expenses, inancial_import_batches, payroll_import_batches, engineering_document_revisions, email_messages) references the object.
2. The record was in an uncommitted/failed staging state (e.g. upload compensation after DB RPC failure).
3. Formal retention grace period has elapsed.

---

## 6. Recommended S2 Pilot Scope

### Evaluation of Candidates

| Candidate Document Flow | Volume | Security Complexity | Provenance Complexity | Immutability Invariant | Rollback Ease | Recommendation |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Manual Invoice Source Documents** | Medium | Standard (invoices.read/manage) | Single source_documents record | Reversible lifecycle | **High (Isolated)** | **RECOMMENDED PILOT** |
| **Email Intake Raw .eml Files** | Medium-High | High (RFC822 parser & Gmail tokens) | Multi-attachment parent | Moderate | Medium | Wait for S3 |
| **Adaptive Payroll Import Sources** | Low | High (Workforce staging lifecycle) | Batch & Staging row hierarchy | High (Audit) | Medium | Wait for S3 |
| **Engineering Document Revisions** | Low-Medium | Very High (Annotation & CAD tools) | Append-only revision lineage | Very High (Strict) | Low | Wait for S3 |
| **Bank Statement Import Files** | Low | High (Financial reconciliation ledger) | Import batch & Match links | High (Audit) | Low | Wait for S3 |

### Recommended Pilot: **Manual Invoice Source Documents** (source_documents under invoice-originals)

#### Rationale:
1. **Isolated & Bounded**: Manual invoice uploads interact with a clean boundary (src/lib/persistence.ts:saveManualSourceDocument and getInvoiceSourceUrl).
2. **Proven SHA-256 Foundation**: source_documents already stores storage_path, sha256, mime_type, and ile_size.
3. **Low Blast Radius**: Affects only manual invoice uploads; Email Intake, Payroll, and Engineering revisions remain on Supabase Storage.
4. **Complete Rollback Capability**: If the external provider encounters issues during the pilot, the system can instantly fall back to Supabase Storage without database schema corruption.

---

## 7. Verification & Deliverables Summary

### Deliverables Created in Wave S1:
1. docs/ENGORYX_STORAGE_CURRENT_STATE_AUDIT.md (this audit document).
2. scripts/database-storage-audit.sql (read-only diagnostic script for deployment administrators).
3. src/lib/storage/types.ts (provider-neutral storage interface and document contracts).
4. src/lib/storage/keys.ts (canonical target object-key builder, legacy parser, and filename sanitizer).
5. src/lib/storage/dedup.ts (SHA-256 hashing and binary vs logical dedup evaluator).
6. src/lib/storage/index.ts (storage module barrel).
7. 	ests/databaseStorageAudit.test.ts (safety and structural test for diagnostic SQL).
8. 	ests/documentStorageFoundation.test.ts (unit tests for storage keys, sanitization, and dedup contracts).

### Validation Run:
- 
pm.cmd test: **1016 passed, 0 failed, 1 skipped** (100% pass rate).
- 
pm.cmd run lint: **0 errors**.
- 
pm.cmd run build: **Success (17.33s)**.
- 
pm.cmd run test:migrations: **75 static migration invariant tests passed**.
- 
pm.cmd run workflow-map:check: **Valid (200 nodes, 240 edges)**.
- 
pm.cmd run workflow-map:consistency: **Consistent (200 nodes, 240 edges, 13 invariants, 5 diagrams)**.
