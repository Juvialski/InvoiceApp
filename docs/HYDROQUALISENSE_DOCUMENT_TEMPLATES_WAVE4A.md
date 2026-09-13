# HydroQualiSense Document Templates — Wave 4A

Status: **COMPLETE through merged PR #134; integrated into the Wide Documents Phase**

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

Uploaded files are accepted only as standard `.docx` packages after size, archive-entry, compression-ratio, path, CRC, OOXML-structure and macro checks. Original bytes are preserved in company-prefixed private Storage. Arbitrary existing layouts are not destructively rewritten. If a file has no supported merge tags, the UI analyzes application-derived anchors and offers a reviewed in-app preparation step. Manual Word editing remains an advanced fallback for unsupported or ambiguous structures.

AI analysis receives bounded normalized structure/text marked as untrusted document data and returns schema-validated proposals. Proposals never activate a mapping. AI-generated templates use a schema-validated `TemplateBlueprint` and a deterministic DOCX builder; the model never writes binary DOCX bytes or financial values.

## Version and history boundary

Template roots and versions are company-bound. Versions start as `DRAFT`, can become `ACTIVE`, and can be `RETIRED`; content identity, Storage path, hash, origin and version number are immutable. Issuance pins the active validated default version and its SHA-256 when one exists. Historical snapshots without a pinned template deliberately use the legacy PDF fallback rather than silently selecting a newer template.

Issued DOCX generation stores immutable evidence tying the issued snapshot, template version/hash and generated artifact/hash together. Wave 4B extended this contract to optional server-side high-fidelity PDF finalization; Wave 4C extends the same evidence into outbound delivery and history.

See `docs/HYDROQUALISENSE_DOCUMENT_TEMPLATES_WAVE4B.md` for the completed PDF architecture and runtime requirement.

## Documents workspace entry point — 2026-09-14

Normal company template administration is now discoverable under `Documents -> Templates`. Settings retains a compact `Manage Document Templates` link for compatibility and configuration discoverability; it no longer mounts a competing full template-management surface. The underlying company-bound Storage, AI capability, immutable version, mapping, activation, issuance, and PDF capability contracts remain unchanged.

The broader Wide Documents Phase is still incomplete. The next template slice will extend this contract to the supplied HSC Purchase Order, Equipment / Materials Checklist, and Warranty Certificate DOCX files without replacing their actual Word layouts or approved wording.

## 2026-09-13 corrective extension — AI capability and uploaded-template preparation

The urgent corrective phase before Wave 4D is specified in `docs/superpowers/specs/2026-09-13-document-template-ai-autotagging-design.md`.

Analyze and Generate now use a server-derived company AI runtime capability rather than treating persisted `lastTestStatus` as the action authority. The runtime capability does not expose credentials or claim provider certification; actual provider failures remain actionable and separate from Storage/PDF capability.

For supported uploaded layouts, the application derives deterministic paragraph/cell/header/footer anchors and line-table candidates. AI returns only allowlisted semantic mappings to those anchors. After human review, the server-owned transformer inserts supported scalar and repeating-row tags while preserving unrelated package content and creates a new immutable `DUPLICATED` descendant linked through `parentVersionId`. The original upload remains unchanged and activation remains deliberate.

Real authenticated Local-QA evidence now covers the company AI runtime, HSC Purchase Order Analyze/Prepare/Test DOCX, and Purchase Order/Client Invoice Generate/refresh/download/Test DOCX workflows. This is not hosted exact-SHA release certification, does not complete Wave 4D, and does not certify the high-fidelity PDF converter. The extension must retain the existing authoritative snapshot, company isolation, DOCX security, AI budget, and immutable issuance/provenance boundaries.
