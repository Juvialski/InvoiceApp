# HydroQualiSense Unified Document Center

Status: **ACTIVE — Slice 1 implemented; managed document and exact HSC template slices remain**

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

The supplied HSC fixtures are the primary acceptance assets for the next template slice:

- HSC Purchase Order — actual client logo/header, supplier block, line-item table, totals, delivery/terms, and signatures.
- HSC Equipment / Materials Checklist — actual project metadata, checkbox rows, Others/remarks area, and attestation signatures.
- HSC Warranty Certificate — actual approved warranty paragraphs, project metadata, signatory, acknowledgement, and images.

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

## Deferred boundary

The following remain unfinished and must not be represented as available merely because the shell exists:

- managed Warranty Certificate and Equipment / Materials Checklist draft persistence and generation;
- exact supplied HSC DOCX anchor preparation and visual fidelity certification;
- general company uploads and version history;
- generic retained generated-artifact index and authorized retrieval;
- broader project/engineering/payroll/report artifact aggregation;
- optional handover package grouping;
- Wave 4D SMS/provider completion;
- Worker Registration, Attendance, and Face Recognition.

## Validation truth

Slice 1 has focused routing, Documents shell, source-projection, Email/SMS handoff, and existing template-contract tests passing, plus TypeScript lint. It requires affected-test, production-build, Workflow Map, and authenticated responsive validation before release handoff. It has no database change and therefore does not require Docker/Supabase replay. DOCX render/fidelity evidence belongs to the next template slice, where the supplied actual templates are merged into generated output.

