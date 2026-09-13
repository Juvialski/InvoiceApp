# Document Template AI Auto-Tagging and Capability Correction

## Status

Approved design for implementation on `codex/document-template-ai-autotagging-correction`.

## Problem

Document-template AI currently has two conflicting capability truths. The Settings UI disables `Generate with AI` when persisted deployment metadata does not report `lastTestStatus === "SUCCESS"`, while Analyze and Generate execute through the server-side company AI runtime. A stale provider-test value can therefore disable a runtime that the application can use, while configuration-only assumptions would risk presenting an unusable provider as ready.

Uploaded DOCX files have a second gap. Analysis can produce semantic proposals, but a tagless uploaded document is left unchanged and the normal flow tells the user to edit Word manually. The product needs a safe application-owned preparation step that creates a new tagged draft without allowing AI to author OOXML or financial values.

## Goals

1. Make Analyze, Generate, and the Settings capability state use one company-scoped server/runtime contract.
2. Keep provider-test history informational; never use stale `lastTestStatus` as the sole client gate.
3. Let a supported tagless DOCX flow from upload through analysis, human review, deterministic preparation, validation, and test DOCX without ordinary manual Word editing.
4. Preserve the original upload and create a new immutable draft linked through the existing version model.
5. Preserve supported layout and package content, including styles, tables, headers, footers, images, hyperlinks, and unrelated text.
6. Keep AI proposal-only, allowlisted, company-isolated, budgeted, and unable to calculate or mutate financial truth.

## Non-goals

- No SMS, Wave 4D provider, Worker Registration, attendance, or unrelated UI work.
- No new financial calculation, master-data mutation, lifecycle transition, or issued-document source of truth.
- No arbitrary AI-generated OOXML, binary DOCX, merge values, or direct provider credentials in the browser.
- No cosmetic database migration. Existing `parentVersionId`, server version-creation RPC, and `DUPLICATED` origin are sufficient for prepared descendants.
- No claim that programmatic PDF fallback or high-fidelity PDF conversion is available merely because DOCX preparation succeeds.

## Capability contract

The authorized `GET /api/deployment/company-ai` response will include a safe `runtimeCapability` object. The server computes it by resolving the same encrypted, enabled, company-scoped runtime used by `withCompanyAiRuntime`; it never returns credentials or decrypted material. The contract has `AVAILABLE` and `UNAVAILABLE` states, a safe code/message, provider, and model identity where appropriate.

`lastTestStatus`, `lastTestedAt`, and related provider-test metadata remain visible as historical validation information but do not gate document-template actions. A missing or failed runtime resolution keeps actions unavailable. A successful resolution enables an attempt; the actual Analyze/Generate operation still runs through the existing AI request budget/concurrency guard and normalizes provider, credential, timeout, network, quota, and model failures into actionable safe errors. A provider operation failure must not be presented as Storage failure.

Analyze responses will also carry the safe runtime capability result. A successful real analysis may mark the Settings capability ready; an unavailable or malformed analysis remains a truthful fallback state. The client will not infer readiness from `credentialConfigured`, a global key, or old test metadata alone.

## Deterministic mapping model

The server will extend document structure extraction with an application-derived anchor inventory for `word/document.xml`, supported headers, and supported footers. Anchors identify their package part, paragraph or table/cell location, normalized exact source text, occurrence, and a deterministic ID. Line-table candidates additionally identify the table, header row, data row, and column indexes with normalized header text.

The AI analysis schema will return only:

- an allowlisted registry `fieldKey`;
- a server-derived `anchorId` and bounded target text/occurrence;
- confidence, reason, and unresolved state;
- a bounded line-table column mapping using server-derived table/column identities.

The server will reject unknown field keys, unknown anchors, mismatched source text, invalid indexes, duplicate replacements, unsafe structural requests, and ambiguous anchors. The browser may correct field selections, but the server re-derives and verifies every location against the bytes it reads at preparation time.

## Application-owned DOCX transformer

`documentTemplateAutoTagger` will transform only validated semantic plans. It will use `PizZip` after the existing archive, CRC, MIME, macro, path, decompression, and external-resource checks. Scalar preparation replaces only the verified value span in an existing paragraph/cell while retaining surrounding text and run properties. It does not rebuild the document or rewrite unrelated package entries.

For line tables, deterministic detection requires a unique supported candidate with the required description and amount columns and enough evidence for the selected fields. The transformer inserts the supported `{{#lines}}` and `{{/lines}}` row markers and field tags into an existing compatible data row, preserving row/cell properties and table styling. If the candidate or column mapping is ambiguous, preparation returns an unresolved report and creates no version.

The transformed bytes are revalidated, re-extracted, and passed through the existing `validateDocumentTemplateBindings` report before persistence. Unsupported Word constructs remain an advanced manual-edit fallback rather than being guessed or flattened.

## API and version flow

Add a server-authorized preparation route:

`POST /api/document-templates/:versionId/prepare`

The request contains the reviewed semantic mapping plan, not XML. The route reads the original version through the existing company-bound storage path, verifies the plan against the current source bytes, transforms them, re-extracts tags/bindings, validates required scalar and repeating fields, and persists a new `DRAFT` through the existing server version RPC with:

- the same template root and document type;
- `parentVersionId` equal to the uploaded source version;
- existing `DUPLICATED` origin semantics;
- the new content hash/storage identity;
- confirmed bindings only for mappings the user submitted for application.

The original version is never updated or overwritten. Activation remains a separate guarded action. Historical issued documents continue to use their pinned template/version and snapshot contracts.

## UX flow

The Settings workflow becomes:

`Upload DOCX -> Analyze -> review detected fields/mappings -> Apply mappings / Prepare template -> inspect new draft -> validate -> Test DOCX -> Activate`

The mapping review shows source text/location, application field, confidence, and use state. High-confidence safe proposals may be preselected, but preparation is a deliberate human action. Required unresolved fields and ambiguous line tables remain visible and actionable. `Download / edit in Word` remains available under an advanced manual fallback label and is no longer the ordinary tagless-template instruction.

## Security and financial invariants

- Company authorization and `company.settings.manage` remain required for analysis, preparation, binding updates, activation, and generation.
- AI output is untrusted JSON and passes application-owned schema and source-anchor validation.
- Only `documentTemplateRegistry` fields can become tags or bindings.
- Provider secrets remain server-side; no global-key fallback is introduced.
- Existing AI budgeting/concurrency, Storage authority, DOCX security, and external-resource rejection remain intact.
- All test and issued merges resolve values from authoritative snapshots; AI never invents totals, tax, FX, payment state, supplier/client data, or lifecycle state.

## Validation and evidence

Regression coverage will include capability mismatch and safe unavailability, secret non-exposure, tagless scalar preparation, preserved unrelated XML/package content, images and table structure, required Purchase Order and Client Invoice fields, repeating rows with multiple demo lines, original-byte immutability, parent-version lineage, ambiguous mapping rejection, UI preparation wording, and authoritative test DOCX output.

Use the existing document-template compatibility/security tests and add a sanitized representative DOCX fixture when the real `HSC P.O.Template` is not available locally. Validate focused tests first, then the affected-test selector, lint/build, and authenticated Local-QA template flow where credentials/fixtures permit. Do not touch production or perform database replay unless implementation reveals a genuine database contract change.

## Product-truth update

The same PR will record this corrective phase as the immediate phase before resuming Wave 4D, while keeping UI/UX Round 2 complete and Worker Registration paused. It will preserve separate truth for Storage, company AI runtime, programmatic PDF, and high-fidelity converter capability. AI template generation will not be marked certified solely because code or local tests pass; only obtained QA evidence will be recorded.

## QA evidence update — 2026-09-13

The configured non-production Local-QA runtime was restarted after its server-only AI settings were supplied. The authenticated capability check returned HTTP 200 with `runtimeCapability.status=AVAILABLE` and persisted `lastTestStatus=NOT_TESTED`, without exposing credential material.

The real HSC Purchase Order workflow then passed: Analyze returned `aiStatus=AVAILABLE` using `gemini-3.5-flash-lite`; reviewed Prepare created a VALID immutable `DUPLICATED` descendant linked to the uploaded version while the original SHA remained unchanged; Test DOCX rendered multiple demo lines; and the UI workflow exposed the new Prepare action. The separate Settings Generate with AI workflow passed for Purchase Order and Client Invoice, including VALID persisted AI drafts, refresh visibility, downloads, and Test DOCX rendering.

This is authenticated pre-merge QA evidence for the exercised QA target. It is not hosted exact-SHA release certification, production authorization, or PDF-converter certification. The broad route harness still has unrelated route/session reconciliation work and is not represented as an overall PASS.
