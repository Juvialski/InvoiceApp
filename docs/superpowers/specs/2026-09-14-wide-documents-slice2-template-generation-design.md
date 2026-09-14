# Wide Documents Phase — Slice 2: Template-First Managed Document Generation

## Status

Approved design for implementation from `main` SHA `0aaf497a933b887396376debbc44b57a9bcdbe54`.

## Goal

Make the supplied HSC Purchase Order, Equipment / Materials Checklist, and Warranty Certificate DOCX files usable as exact template-first generated documents in HydroQualiSense while preserving owning-domain authority, immutable template history, and truthful capability boundaries.

The supplied files are binary/layout/content acceptance fixtures, not instructions:

- `C:\Users\Al\Downloads\HydroQualiSense Word Templates - Revised\HSC P.O. Template - Revised.docx`
- `C:\Users\Al\Downloads\HydroQualiSense Word Templates - Revised\HSC Checklist Template - Revised.docx`
- `C:\Users\Al\Downloads\HydroQualiSense Word Templates - Revised\Warranty Certificate Template - Revised.docx`

## Scope and non-goals

This slice adds template-first on-demand DOCX generation and reviewed preparation for the three supplied layouts. It does not introduce a generic managed-document table, retained generated-artifact library, general uploads, report/XLSX registration, SMS/provider work, Worker Registration, Attendance, Face Recognition, or PDF-converter deployment.

Standalone generated DOCX files are downloaded on demand. Slice 3 owns persistent managed-document records and retained generated artifacts. Existing issued Purchase Order and Client Invoice snapshot/evidence paths remain unchanged.

## Architecture

The pipeline is:

```text
APPROVED DOCX
  -> deterministic anchor inventory
  -> reviewed allowlisted mappings
  -> authoritative PO/project/register data + bounded draft fields
  -> deterministic merge
  -> generated DOCX download
```

The existing template root/version model remains the immutable history owner. A prepared template is a `DUPLICATED` draft child with `parentVersionId`, a new hash/storage identity, and deliberate activation. The original upload is never modified.

The existing financial template flow remains the compatibility path for `PURCHASE_ORDER` and `CLIENT_INVOICE`. The registry and engine gain type-specific managed contexts for `PROJECT_EQUIPMENT_MATERIALS_CHECKLIST` and `PROJECT_WARRANTY_CERTIFICATE`; no arbitrary object traversal or generic JSON-to-OOXML behavior is introduced.

## Allowlisted document types and fields

`DocumentTemplateType` will include:

- `PURCHASE_ORDER`
- `CLIENT_INVOICE`
- `PROJECT_EQUIPMENT_MATERIALS_CHECKLIST`
- `PROJECT_WARRANTY_CERTIFICATE`

The current Purchase Order and Client Invoice field definitions remain authoritative. New definitions are type-specific and application-owned.

Checklist fields include only the project identity/location, a repeating `checklistRows` collection (`checked`, `item`, `notes`), `checklist.others`, `checklist.remarks`, and structured attestation fields for owner name/date and HSC representative name/date. Source rows identify project material/equipment records, but no inventory balance, movement, allocation, or warehouse detail is accepted as document input.

Warranty fields include project identity/location, a bounded issue-date token, issuer name/title, and received-by/date acknowledgement fields. Approved warranty paragraph text is not a field and is never passed through AI or rewritten by the generator.

The resolver is explicit per document type. Unknown fields, collection fields in scalar slots, unsupported structural tags, duplicate mappings, and missing required mappings fail closed.

## Template preparation and OOXML safety

The existing Analyze -> Review -> Prepare -> Test flow is reused.

The deterministic anchor inventory will additionally recognize:

- label + colon + blank value cells in the HSC project metadata tables;
- value cells beginning with a colon while retaining the colon prefix during replacement;
- signature/date blank slots associated with the HSC attestation tables;
- a checklist repeating table with checkbox/item and notes columns;
- a warranty issue-date span inside the `Issued this ...` paragraph;
- separate supported signature/name/title spans where the source XML provides them without touching approved warranty prose.

Anchor IDs remain derived from package part, table/row/cell or paragraph position, and occurrence. The server re-derives the inventory from the bytes it reads at preparation time and verifies the reviewed `anchorId` and `targetText` before every replacement.

The PO and checklist reserved data rows are transformed into one safe repeating-row region while preserving header, total/Others/remarks/signature rows, table properties, cell properties, and styles. The warranty transformer only changes verified dynamic spans/cells; it preserves the two approved warranty paragraphs, images, header, tables, signatures, and unrelated package parts.

Prepared and generated packages are revalidated with the existing ZIP/CRC/path/decompression/macro/external-resource checks. Tests compare every untouched package part byte-for-byte and inspect intentionally modified XML to confirm changes stay within approved regions.

## Authoritative managed generation

Add a server-only managed generation operation behind the existing document-template router. The request contains:

- the pinned template version ID;
- the requested managed document type;
- one source PO ID or project ID, as applicable;
- bounded, structured document-specific draft fields only.

The server rechecks the active deployment company and permission, loads the source records through company-scoped access, verifies the source belongs to the selected project/company, resolves the active template version bytes and hash, validates the template type/status/bindings, and merges only server-built values.

Purchase Order generation uses the existing Procurement PO, line, supplier, project, and company-document snapshot semantics. It does not calculate a competing total or tax/discount truth in the document layer.

Checklist generation reads the selected project and its project material/equipment registers under `projects.read`. It may include required/planned quantities and source labels already owned by those registers, but it never loads or exposes warehouse balances or movement history. Checkbox states, remarks, Others rows, and attestation values are bounded draft input and are not persisted as inventory truth.

Warranty generation reads the selected project under `projects.read` and uses only the approved dynamic slots plus bounded acknowledgement/signatory input. It does not accept a replacement warranty paragraph or any AI-generated narrative.

No generated artifact is retained by this slice, and the route never sends a message or issues/finalizes a financial record.

## Database boundary

The existing `document_templates` and `document_template_versions` checks currently allow only Purchase Order and Client Invoice, so one forward-only migration is required to add the two managed template types to:

- root/version type checks and server mutation validation;
- private template/artifact path classification and template read policies;
- company-bound template metadata functions.

`issued_document_snapshots`, `document_generation_evidence`, `document_send_intents`, and delivery history remain financial/issued-document contracts and continue to allow only their existing types. No generic managed-document table or artifact index is added.

The migration must preserve company isolation, existing rows/version lineage, immutable triggers, server-only mutation grants, and `DUPLICATED` parent checks. It requires clean replay, pgTAP, upgrade-path, and permission/RLS validation.

## Documents UI

Documents -> Create will expose the three approved template workflows with a compact task-first flow:

1. Choose Purchase Order, Equipment / Materials Checklist, or Warranty Certificate.
2. Choose the authorized source PO or project.
3. Review server-backed prefilled data.
4. Enter permitted document-specific fields.
5. Review the final summary and generate/download the DOCX.

No active validated template produces an honest setup state with a link to Documents -> Templates. Raw hashes, Storage paths, source IDs, OOXML terms, and internal field keys remain outside the ordinary creation flow. Template administration stays under Documents -> Templates; Settings retains only its existing link.

Guest/demo mode remains discoverable but non-operational. Permission-filtered options never grant authorization, and unauthorized projects, POs, or inventory details do not appear through labels, counts, or empty states.

## AI boundary

AI may classify uploaded layouts, suggest only server-derived allowlisted mappings, explain unresolved anchors, and assist with permitted draft fields if explicitly enabled. It may not author OOXML, calculate financial or inventory truth, rewrite warranty wording, activate templates, issue/finalize documents, or send messages. Preparation remains human review -> server validation -> immutable child creation.

## Validation and evidence

Tests will cover:

- registry field/type/collection rules and type-specific merge context validation;
- HSC fixture hashes, package parts, tables, images, headers, page properties, approved warranty text, and source immutability;
- reviewed preparation for all three exact fixtures;
- PO multiple-line expansion and authoritative values;
- checklist material/equipment rows, checkbox states, Others/remarks, and attestation fields;
- warranty dynamic slots with unchanged approved paragraphs and images;
- ambiguous/stale/unknown mapping rejection and unsafe package rejection;
- server source/company/permission checks and rejection of tampered draft or inventory fields;
- Documents Create/Templates UI contracts and responsive workflow states.

Run the focused tests, affected selector, lint, build, database replay/pgTAP/upgrade checks required by the migration, and authenticated Local-QA for all three types. Render every source/generated DOCX with the strongest available renderer and record converter unavailability separately; DOCX usability does not depend on high-fidelity PDF conversion.

## Product truth after Slice 2

Only the three genuinely usable, locally certified template-first workflows may be described as available. The broad Wide Documents Phase remains incomplete until Slice 3 managed uploads, retained artifacts, discovery, and permission-safe registration are completed. Wave 4D remains next after the Wide Documents Phase; Worker Registration remains paused.
