# HydroQualiSense Document Templates — Wave 4A

Status: **COMPLETE through merged PR #134**

Wave 4A adds a company-bound DOCX template foundation for `PURCHASE_ORDER` and `CLIENT_INVOICE`. It does not replace the existing programmatic PDF fallback, Gmail send contract, or authoritative financial snapshot builders.

## Architecture decision

The document pipeline is:

`authoritative issued snapshot -> pinned immutable template version -> deterministic merge -> DOCX`

The template registry is application-owned and allowlisted. It resolves explicit snapshot fields and line collections; it does not expose arbitrary object traversal, SQL, JavaScript, or financial calculation.

## DOCX dependencies

- `docxtemplater` `3.69.3` — MIT, run-safe placeholder parsing and repeating table-row merge support.
- `pizzip` `3.2.0` — MIT OR GPL-3.0, ZIP/OOXML container handling used after archive safety checks.
- `docx` `9.7.1` — MIT, deterministic editable DOCX generation for starter and validated AI blueprints.

The basic workflow uses no paid document-processing vendor or proprietary module. Package versions are pinned through `package-lock.json`; dependency maintenance, license and security review remain part of normal release review.

## Upload and preparation boundary

Uploaded files are accepted only as standard `.docx` packages after size, archive-entry, compression-ratio, path, CRC, OOXML-structure and macro checks. Original bytes are preserved in company-prefixed private Storage. Arbitrary existing layouts are not destructively rewritten. If a file has no supported merge tags, the UI reports that manual Word binding is required and keeps starter/manual setup available.

AI analysis receives bounded normalized structure/text marked as untrusted document data and returns schema-validated proposals. Proposals never activate a mapping. AI-generated templates use a schema-validated `TemplateBlueprint` and a deterministic DOCX builder; the model never writes binary DOCX bytes or financial values.

## Version and history boundary

Template roots and versions are company-bound. Versions start as `DRAFT`, can become `ACTIVE`, and can be `RETIRED`; content identity, Storage path, hash, origin and version number are immutable. Issuance pins the active validated default version and its SHA-256 when one exists. Historical snapshots without a pinned template deliberately use the legacy PDF fallback rather than silently selecting a newer template.

Issued DOCX generation stores immutable evidence tying the issued snapshot, template version/hash and generated artifact/hash together. Wave 4B extends this contract to optional server-side high-fidelity PDF finalization; Wave 4C will address outbound delivery/history UX.

See `docs/HYDROQUALISENSE_DOCUMENT_TEMPLATES_WAVE4B.md` for the active PDF architecture and runtime requirement.
