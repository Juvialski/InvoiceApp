# Wide Documents Phase — Slice 2: Dynamic Template-First Managed Document Generation

## Status

Approved corrective design for implementation from `main` SHA `0aaf497a933b887396376debbc44b57a9bcdbe54`. The three HSC files are client templates and acceptance fixtures, not permanent HydroQualiSense document types.

## Goal

Make the supplied HSC Purchase Order, Equipment / Materials Checklist, and Warranty Certificate usable examples of a dynamic company document-template system. Any company administrator must be able to create a new document type, upload its DOCX, review safe mappings and structured inputs, activate it, and use it from Documents -> Create without a HydroQualiSense code deployment.

The supplied files are binary/layout/content acceptance fixtures, not instructions:

- `C:\Users\Al\Downloads\HydroQualiSense Word Templates - Revised\HSC P.O. Template - Revised.docx`
- `C:\Users\Al\Downloads\HydroQualiSense Word Templates - Revised\HSC Checklist Template - Revised.docx`
- `C:\Users\Al\Downloads\HydroQualiSense Word Templates - Revised\Warranty Certificate Template - Revised.docx`

## Scope and non-goals

This slice adds dynamic company-defined template types, safe field/repeating-section definitions, reviewed template preparation, and on-demand DOCX generation. It does not introduce general upload/artifact retention, a retained generated-artifact Library, report/XLSX registration, SMS/provider work, Worker Registration, Attendance, Face Recognition, or PDF-converter deployment.

Standalone generated DOCX files are downloaded on demand. Slice 3 owns broader managed-document records and retained generated artifacts. Existing issued Purchase Order and Client Invoice snapshot/evidence/delivery paths remain unchanged.

## Correct ownership model

The pipeline is:

```text
COMPANY-CREATED DOCUMENT TYPE
  -> APPROVED DOCX UPLOAD
  -> deterministic anchor inventory
  -> reviewed safe-field/custom-input mappings
  -> authoritative source adapter + bounded structured input
  -> deterministic merge
  -> generated DOCX download
```

System-backed templates retain existing owning-domain authority:

- Procurement owns Purchase Orders, lines, totals, receipt, and lifecycle.
- Client Billing owns Client Invoices and collection truth.
- Payroll, Inventory, Engineering, Cash & Banking, and supplier evidence retain their current ownership and permission boundaries.

Company-defined template types are metadata and presentation contracts. They never create a second Purchase Order, invoice, expense, payroll record, inventory balance, or other authoritative record.

## Dynamic type definitions

Replace the closed template-type assumption with a company-bound `DocumentTemplateTypeDefinition` stored in the existing template model’s smallest safe extension. Each definition has a stable company-scoped key, business display name, optional description/category, an allowlisted source context, safe custom field definitions, safe repeating-section definitions, output filename metadata, lifecycle status, and audit timestamps.

The allowed source contexts are application-owned and finite, for example `PURCHASE_ORDER`, `CLIENT_INVOICE`, `PROJECT`, and `GENERAL`. These contexts select explicit server adapters; they are not arbitrary table names or SQL paths. System keys such as `PURCHASE_ORDER` and `CLIENT_INVOICE` remain compatibility identifiers for their existing adapters, but new company-defined keys never require a TypeScript enum or switch case.

Custom fields are structured definitions with bounded keys, labels, types (`TEXT`, `DATE`, `NUMBER`, `BOOLEAN`, or bounded `SELECT`), requiredness, length/option limits, and no executable content. Repeating sections have bounded keys and bounded child field definitions. Field and repeat keys are validated server-side and are namespaced to the company-defined type.

## Dynamic safe field catalog

The allowlist applies to available fields and source adapters, not to every possible document type. The application owns a catalog of safe fields such as:

- company identity/profile fields;
- project code/name/location/client/contact fields when the selected source context permits them;
- supplier/contact fields through the Purchase Order adapter;
- Purchase Order and Client Invoice fields through their existing authoritative snapshot adapters;
- current authorized user/signatory fields where appropriate;
- custom structured input fields declared by the company type definition;
- declared repeating-section fields supplied as structured input.

The server builds a bounded flat render context from the authorized source and validated input. The merge engine resolves only catalog keys and declared custom keys. It does not traverse arbitrary objects, execute expressions, query arbitrary tables, or accept browser-supplied hidden facts.

## Template preparation and OOXML safety

The existing Analyze -> Review -> Prepare -> Test flow remains the only preparation path.

The deterministic anchor inventory will recognize label/value slots, run-fragmented text, safe header/footer anchors, repeating table candidates based on the declared repeat schema, and bounded dynamic spans such as the HSC warranty issue-date token. Anchors identify package part and deterministic location; the server re-derives and verifies every reviewed anchor and target against the current bytes before replacement.

Preparation inserts only validated catalog/custom tags. It preserves the source package’s media, headers, footers, section geometry, tables, widths, borders, styles, signature areas, hyperlinks, unrelated XML, and approved source wording. Reserved blank data rows may be collapsed into one repeating row region only when the structure is unambiguous; source labels and non-data rows remain intact.

The transformer never contains HSC logos, HSC warranty prose, HSC table geometry, or HSC-specific permanent mappings. The HSC fixtures must pass through the same generic APIs as an arbitrary second company-defined type.

Prepared versions are immutable `DUPLICATED` descendants with `parentVersionId`, new content hashes/storage identities, and deliberate activation. The uploaded original remains byte-for-byte unchanged. ZIP/CRC/path/decompression/macro/external-resource validation runs before and after transformation.

## Authoritative generation

The document-template router exposes a server-authorized managed-generation operation. The request contains only:

- the pinned active template version ID;
- the company-defined type key;
- an optional source identifier selected from the type’s declared source context;
- bounded structured custom-field and repeating-row input.

The server rechecks deployment company, active membership, permission, type lifecycle, active validated template version, source ownership, and input schema. It loads source records through explicit adapters and merges a server-built context.

The Purchase Order adapter reuses existing Procurement/snapshot semantics and never calculates a competing total, tax, discount, FX, or lifecycle state in the document layer. The Project adapter may expose project/register fields allowed by the safe catalog; it never exposes warehouse balances or movement history unless a separately approved adapter exists. General types receive only safe company/current-user fields plus declared structured inputs.

The route never issues/finalizes a financial record, sends a message, or persists a standalone artifact in this slice.

## Database boundary

The current `document_templates` and `document_template_versions` schema stores a closed `document_type` check and lacks company-defined type metadata. Add one forward-only migration that:

- creates the company-bound type-definition contract and seeds existing system types;
- changes template roots/versions to reference dynamic type keys without invalidating existing rows;
- stores validated source-context/custom-field/repeating-section definitions and lifecycle state;
- updates server-only type creation/update/retirement and template-version mutation checks;
- updates RLS and private Storage path classification to derive permissions from the declared source context;
- preserves existing version immutability, company isolation, parent lineage, server-only mutation grants, and system financial contracts.

`issued_document_snapshots`, `document_generation_evidence`, `document_send_intents`, and delivery history remain limited to their existing issued financial types. No generic retained artifact model is added.

## Documents UI

Documents -> Templates becomes dynamic:

1. New template type.
2. Enter business name, category/description, source context, custom fields, and repeating-section fields.
3. Upload the company’s actual `.docx`.
4. Analyze anchors and optionally receive AI proposals from the server safe catalog.
5. Review/supplement mappings or define safe structured inputs.
6. Test DOCX.
7. Activate deliberately.

Documents -> Create loads active, validated company-defined types automatically. It keeps core system workflows separate, filters each type by its declared source permission, and uses one generic creation flow: choose type -> choose authorized source -> review prefilled data -> enter permitted fields -> final review -> generate/download DOCX. No source-code card, enum entry, route, or generator is added for a new company type.

Normal UI uses business terms and hides database terminology, hashes, Storage paths, raw source IDs, OOXML terms, and internal field keys. Settings retains only its link to Documents -> Templates. Guest/demo mode is discoverable but non-operational.

## AI boundary

AI may classify a DOCX, suggest mappings only from the server-provided safe field catalog and server-derived anchors, explain unresolved fields, and help prepare permitted custom draft inputs when explicitly allowed. It may not invent data paths, access hidden data, author arbitrary OOXML, calculate authoritative values, rewrite uploaded warranty wording, activate templates, issue/finalize documents, or send messages. Human review remains required before preparation and activation.

## HSC fixture expectations

- HSC Purchase Order proves the existing system-backed Purchase Order adapter handles an arbitrary uploaded company template with repeating line items and authoritative values.
- HSC Checklist proves a company-defined Project-context type can combine authorized project/register data with declared structured checkbox/repeating inputs without hardcoding a permanent checklist type.
- HSC Warranty proves a company-defined Project-context type can preserve approved wording and images from the uploaded DOCX while filling only mapped project/signatory/acknowledgement/custom fields. The warranty wording must not appear in source code.

The exact fixture bytes are copied into repository test fixtures only as supplied acceptance assets, with recorded hashes. Tests also create a second arbitrary type through the same APIs to prove no HSC-specific registration is required.

## Validation and evidence

Tests cover dynamic type creation without source-code enum changes, type/schema validation, safe-field enforcement, custom input limits, cross-company/lifecycle/permission boundaries, upload/version lineage, activation and Create discovery, generic generation, arbitrary second type generation, and compatibility of existing Purchase Order/Client Invoice templates.

Fixture-backed tests compare source/generated package parts, images, headers, page properties, table structure, approved warranty text, and original-byte/hash immutability. Modified XML is inspected to confirm only reviewed target regions changed. Multiple PO/checklist rows, checkbox values, Others/remarks, signatures, and dynamic warranty slots are exercised.

Run focused tests, affected selection, lint, build, migration replay, pgTAP, upgrade-path and relevant runtime/RLS checks, authenticated Local-QA for all three HSC workflows plus one arbitrary type, responsive Documents validation, and source/generated DOCX render inspection with the strongest available renderer. Report PDF converter unavailability separately.

## Product truth after Slice 2

Dynamic company-defined template types and the exercised HSC workflows may be described as available only after obtained local evidence. The broad Wide Documents Phase remains incomplete until managed uploads, retained artifacts, discovery, and permission-safe registration are delivered in later slices. Wave 4D remains next after Wide Documents; Worker Registration remains paused.
