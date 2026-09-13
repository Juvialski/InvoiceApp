# Unified Document Center — Slice 1 Design

## Status

Active user-prioritized design for the first implementation slice of the Wide Documents Phase. The repository baseline is `0f20b861d9fb5d081eb90c579aa0d74b5eaea9d5`; live repository state remains authoritative.

## User direction

Documents becomes the central company document workspace. Official DOCX output remains template-first: an approved/versioned DOCX supplies the visual layout, application-owned mappings supply merge tags, and deterministic server-side merge produces the generated DOCX. XLSX remains programmatic by default. Documents must remain a permission-aware access/index surface rather than a competing owner of financial, payroll, procurement, inventory, engineering, or banking truth.

The three supplied client DOCX files are layout/content fixtures, not agent instructions:

- `HSC P.O. Template - Revised.docx` — Purchase Order with a 15-row, 7-column line-item table and one logo image.
- `HSC Checklist Template - Revised.docx` — inventory/equipment-materials checklist with a 26-row, 2-column checklist table and one logo image.
- `Warranty Certificate Template - Revised.docx` — warranty certificate with approved warranty paragraphs, three tables, and two images.

The supplied documents currently contain no `MERGEFIELD` fields or content controls. Their exact bytes, wording, layout, tables, headers, signatures, and media are preserved for the template-engine slice; no approximation from screenshots or prose is acceptable.

## Scope of this slice

This slice establishes the user-facing Document Center shell and integrates existing capabilities without introducing a new database contract:

1. `/documents` defaults to `Library` and supports durable `Library`, `Create`, and `Templates` URL views.
2. Library remains a list-first, permission-filtered projection over the current Purchase Order, Client Invoice, Supplier Invoice, Expense receipt, Bank statement, and Engineering Document sources.
3. Create exposes business-language entry points to already-supported owning workflows and clearly marks preparation-required document types without pretending that unsupported generators exist.
4. Templates is the normal discoverability path for the existing company DOCX template administration component; Settings retains only a small link/reference.
5. Existing owner links, Email/SMS handoffs, template capability gates, Storage authority, and PDF capability truth remain unchanged.
6. Existing `/documents` and relevant Settings/deep-link behavior remain compatible.

This slice deliberately does not claim that the full Wide Documents Phase is complete. Managed Warranty/Checklist data, general uploads, generic generated-artifact persistence, broader report registration, and the exact HSC template preparation/generation flow belong to subsequent slices.

## Architecture

### Hybrid ownership

The existing `buildDocumentRegister` function remains a projection-only aggregation service. Each entry keeps its owning route and source identifiers; the Documents UI may discover and hand off a record but does not edit its business values or lifecycle. Permission visibility is calculated before rendering, and payroll-sensitive data is not added to the generic register by this slice.

The first slice does not add a generic `documents` table. A future managed-document slice may add Documents-owned records only for genuinely managed documents and must keep source identity, company ownership, private Storage, version lineage, and source permission checks explicit.

### URL information architecture

`DocumentWorkspaceView` is an allowlisted route query value:

```text
/documents                 -> Library
/documents?view=library    -> Library
/documents?view=create     -> Create
/documents?view=templates  -> Templates
```

Unknown or malformed values fail closed to `library`. A route helper owns construction and parsing so browser navigation, tests, deep links, and future assistant handoffs share one contract. The existing `/documents` path remains the canonical route.

### Permission boundaries

The Documents route continues to be visible when the user has any permission that exposes one of the projected sources. The Library never broadens those source permissions. The Templates view uses the existing company-settings read/manage boundary and existing server-side capability checks. Create options are shown only when their owning workflow permission is present; no UI label is treated as authorization.

### Template integration

The existing `CompanyDocumentTemplatesSettings` component remains the implementation owner for template upload, analysis, preparation, binding validation, activation, retirement, test DOCX, and capability messaging in this slice. It is rendered under Documents -> Templates and is not duplicated. Settings no longer mounts the full administration surface; it provides a small route link. The existing server-side Storage/AI/PDF boundaries and immutable template-version model are not changed here.

## UI behavior

The page header makes the purpose and primary actions obvious. A compact navigation control presents Library, Create, and Templates. Library keeps common search/type filters first and retains progressive disclosure for module, origin, and status. Create uses business terms such as Purchase Order, Client Invoice, Project reports, Payroll reports, and Engineering documents; links return to the owning workflow. Items that require a later managed-document/template slice are visibly labeled as preparation required and do not create fake records.

The UI remains list-first and responsive. Raw Storage paths, hashes, internal enum values, and source IDs remain secondary or hidden in the normal Library view. Existing preview/download and Email/SMS handoffs remain intact.

## Later slices

### Slice 2 — template-first managed document generation

Generalize the allowlisted template registry and merge context for `PROJECT_EQUIPMENT_MATERIALS_CHECKLIST` and `PROJECT_WARRANTY_CERTIFICATE`, add structured permitted inputs and authoritative project prefill, prepare the exact supplied DOCX files into immutable descendants, preserve warranty baseline wording, and add source-vs-generated visual and package-fidelity regression coverage. Add a forward migration only if existing template/version contracts cannot safely represent these types.

### Slice 3 — managed documents and artifacts

Add company-owned uploads, managed document/version history, retained generated artifacts, project/package discovery, and permission-safe artifact retrieval only after the ownership and RLS design is independently validated. Reuse existing report/XLSX generators and financial/payroll authority rather than copying calculations.

## Security and invariants

- Company isolation, active membership, permission-based authorization, private Storage, and server-only privileged credentials remain mandatory.
- Search results are protected data; unauthorized source records and payroll metadata must not leak through counts, filters, empty states, AI, or future artifact APIs.
- Financial, payroll, procurement, inventory, engineering, banking, issued-document, delivery, and audit history remain owned by their current domains.
- AI remains proposal-only and cannot author arbitrary official Word layout, calculate financial truth, rewrite warranty wording, activate templates, issue documents, or send messages.
- No production writes occur as part of this implementation.

## Validation

For this application/UI slice, add focused route, view, create-option, permission, and source-projection tests; run the affected selector, lint, build, and relevant Workflow Map/source-contract checks. Do not start Docker/Supabase because this slice makes no migration, RLS, RPC, trigger, constraint, or Storage-policy change. Authenticated browser/responsive validation is required before handoff. DOCX rendering/fidelity validation is intentionally deferred to Slice 2, where generated output exists.

