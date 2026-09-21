# HydroQualiSense Unified Document Center

Status: **ACTIVE — Slice 1 and dynamic company-template generation implemented; managed Documents + retained artifact foundation implemented for the recorded scope; broader artifact aggregation remains deferred**

Date: **2026-09-14**

## Product purpose

Documents is the company's simple, permission-aware place to find document records, start supported document workflows, manage approved Word templates, and later rediscover retained artifacts. It is an access and discovery layer over authoritative application domains, not a second financial, procurement, payroll, inventory, engineering, banking, or delivery system.

The owning domain remains authoritative:

- Procurement owns Purchase Orders and receipt/close semantics.
- Client Billing owns Client Invoice and collection truth.
- Supplier Invoice review and the linked Expense own supplier evidence/payable semantics.
- Cash & Banking owns settlement and reconciliation evidence.
- Payroll owns payroll calculations, privacy, approval, and settlement history.
- Inventory owns movement and allocation history.
- Engineering owns project document/revision history.
- Issued document snapshots and delivery history remain immutable and company-bound.

## User information architecture

The top-level Documents route is `/documents` and defaults to Library. Its compact views are:

1. **Library** — search and filter authorized document records, then open the owning workflow or supported preview/handoff.
2. **Create** — choose a business workflow such as Purchase Order, Client Invoice, supplier document intake, project report, payroll report, engineering document, or approved company template.
3. **Templates** — manage approved company DOCX templates, mappings, versions, test output, activation, retirement, and capability state.

The view query is allowlisted: `/documents?view=library|create|templates`; invalid values resolve to Library. Settings retains only a small link to Documents -> Templates.

The primary Library surface is list-first. Common search and type controls come before progressive project, counterparty, owning-module, origin, and status filters. Technical provenance, hashes, raw identifiers, Storage paths, and audit details do not dominate the everyday view.

## Source-backed and managed documents

Source-backed entries are projections over existing records. The current Library projects Purchase Orders, Client Invoices, Supplier Invoices, Expense receipts, bank statements, and Engineering Documents when the current user has the permission required by that source. Each entry preserves its owning route and source identity. Documents does not create an editable duplicate record.

Managed documents are a future Documents-owned model for genuinely standalone items such as Warranty Certificates, Equipment / Materials Checklists, general company uploads, and standalone generated artifacts. That model is not introduced by Slice 1. Any future schema must prove the ownership gap, enforce company isolation and source permissions, retain immutable version history, and avoid generic metadata paths that bypass protected domains.

## Permanent Word architecture

Every official generated Word document is template-first:

```text
APPROVED DOCX TEMPLATE
        -> VALIDATED MERGE FIELD / REPEATING REGION MAPPING
        -> AUTHORITATIVE APPLICATION DATA + PERMITTED DRAFT INPUT
        -> DETERMINISTIC MAIL MERGE
        -> GENERATED DOCX
```

DOCX:

`APPROVED TEMPLATE -> MAIL MERGE -> GENERATED DOCX`

The approved DOCX itself controls the visual layout. HydroQualiSense must preserve its logo, headers, footers, page geometry, tables, widths, borders, styles, signatures, wording, images, hyperlinks, and unrelated package content as closely as technically possible. If a structure cannot be transformed safely, the application fails closed and keeps a clearly labeled advanced Word-editing fallback.

AI may classify a template, identify anchors, suggest allowlisted mappings, prepare permitted narrative or draft inputs, and explain unresolved fields. AI does not author arbitrary OOXML/binary layout, calculate financial truth, invent facts, rewrite approved warranty wording, activate a template, issue a document, or send a message. Consequential actions remain `prepare -> review -> human confirm -> execute`.

Changing a layout means editing the actual DOCX in Word, uploading a new version, reviewing mappings, testing, and activating deliberately. Historical template bytes and issued outputs remain pinned and immutable.

The supplied HSC fixtures are real client acceptance examples for the dynamic template architecture, not permanent application document types:

- HSC Purchase Order — actual client logo/header, supplier block, line-item table, totals, delivery/terms, and signatures.
- HSC Equipment / Materials Checklist — actual project metadata, checkbox rows, Others/remarks area, and attestation signatures.
- HSC Warranty Certificate — actual approved warranty paragraphs, project metadata, signatory, acknowledgement, and images.

Any company administrator can create a new business document type, define safe custom/repeating inputs and an allowed source context, upload its DOCX, review deterministic/AI-proposed mappings, prepare an immutable descendant, activate it, and use it from Documents -> Create. New customer types do not require a TypeScript enum, route, schema enum, or dedicated generator. Existing Purchase Order and Client Invoice templates continue to use their owning-domain adapters and authoritative financial snapshots.

Their original bytes and approved warranty wording are not to be approximated or silently rewritten.

## Excel and report generation

XLSX has no mandatory template restriction:

`AUTHORITATIVE APPLICATION DATA -> PROGRAMMATIC XLSX GENERATOR -> WELL-FORMATTED WORKBOOK`

Existing report and export generators remain responsible for their domain calculations. Documents may make supported project, payroll, expense, inventory, invoice, and other reports discoverable and may retain their generated artifacts in a later slice. It must not copy financial calculations into a competing Documents truth. Payroll reports remain visible only with the existing payroll/report permissions, including protection against metadata/count leaks.

## Security and storage

Documents follows the current permission-filtered application paths and server-side private Storage contracts. Search results, titles, relationships, counts, and artifact metadata are protected data. Active membership, company-prefixed paths, signed/authorized retrieval, immutable history, and server-only privileged credentials remain mandatory. A navigation view never grants authorization.

Slice 1 changes no database, RLS, RPC, trigger, constraint, Storage bucket, or provider contract. Future managed-document work must add a forward-only migration only when the existing schema cannot safely represent the required ownership and version model, and must receive runtime RLS/permission/concurrency validation.

## Delivered boundary — Slice 1

Implemented on the Wide Documents feature branch:

- Library/Create/Templates URL views;
- permission-filtered existing source-backed Library;
- project and counterparty filtering with progressive disclosure;
- business-language Create destinations for supported owning workflows;
- truthful preparation-required states for Warranty Certificate, Equipment / Materials Checklist, and general uploads;
- Documents -> Templates as the normal template administration entry point;
- Settings -> Documents template link;
- preserved Email/SMS, owner-route, preview, delivery-history, template capability, and source-ownership contracts.

## Managed Documents + retained artifacts foundation — implemented 2026-09-21

The first durable Documents-owned model now covers genuinely standalone company
files without creating a parallel business-record authority:

- `managed_documents` stores company-scoped identity, title, description,
  bounded category/origin, optional same-company project context, active/archive
  lifecycle, current-version pointer, and creator timestamps;
- `managed_document_versions` stores immutable filename, MIME, size, SHA-256,
  provider/bucket/path, uploader, template relationship when present, and
  ordered version history;
- `document_artifact_registrations` points retained generated files back to a
  source domain/type/record reference and template provenance while the managed
  version owns only the immutable file reference;
- `documents.read` and `documents.manage` remain narrow permission boundaries;
  generated artifacts additionally require the source-domain permission;
- `company-managed-documents` is private and company-prefixed. Server-side
  RPCs perform actor/company/project checks, append-only version insertion,
  stale archive rejection, and artifact registration. Existing issued
  Purchase Order/Client Invoice generation registers generic artifact metadata
  through `document_generation_evidence` without replacing that authoritative
  evidence or delivery history;
- `/documents` now includes managed/artifact browse rows, document-oriented
  upload review, detail/version history, authorized short-lived retrieval, and
  deliberate version/archive actions. Safe demo fixtures cover standalone
  warranty history and a generated Purchase Order artifact.

This boundary does not migrate every existing generator, does not expose raw
Storage paths, and does not copy financial calculations/statuses/balances into
Documents.

## Deferred boundary

The following remain unfinished and must not be represented as available merely because the shell exists:

- final authenticated certification of the dynamic HSC fixture workflows and source-vs-generated render evidence;
- broader project/engineering/payroll/report artifact aggregation;
- optional handover package grouping;
- Wave 4D SMS/provider completion;
- Worker Registration, Attendance, and Face Recognition.

## Validation truth

Slice 1 and Slice 2 evidence remains valid. The managed foundation’s focused migration, Storage, router, client, workspace, and dynamic-generation tests pass; clean migration replay/upgrade fixtures and the managed runtime RLS/RPC/concurrency test pass locally. The final affected selector selected 128/362 files and passed 801/802 tests with one skip and zero failures; lint/typecheck/build and Workflow Map consistency pass. Manual local safe-demo inspection covered desktop and phone Documents browse/detail/upload-review states. The automated Demo Visual QA runner was not available in this worktree because the QA-only `playwright` package is not installed. Hosted QA, provider certification, and production validation remain unclaimed.
