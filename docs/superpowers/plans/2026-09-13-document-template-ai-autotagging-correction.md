# Document Template AI Auto-Tagging and Capability Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make document-template AI capability truthful and let supported uploaded DOCX files become immutable, validated, automatically tagged drafts through a human-reviewed deterministic preparation flow.

**Architecture:** The server will expose a safe runtime capability derived from the same company-scoped runtime resolver used by Analyze and Generate; persisted provider-test metadata will remain informational. A new application-owned auto-tagging module will derive stable OOXML anchors, validate AI/user semantic plans against the current source bytes, and modify only verified text/table-row locations before persisting a new descendant version through the existing server RPC.

**Tech Stack:** TypeScript, Express, React, Node test runner, `@google/genai`, Supabase server RPCs, `PizZip`, `docxtemplater`, existing DOCX security/registry/Storage contracts, Windows PowerShell commands through `npm.cmd`.

**Spec:** `docs/superpowers/specs/2026-09-13-document-template-ai-autotagging-design.md`

## Global Constraints

- Preserve `authoritative snapshot -> pinned immutable template version -> deterministic merge`; AI never calculates or mutates financial truth.
- Keep all AI credentials server-side; do not introduce a global-key fallback or expose secrets in browser/API payloads.
- Preserve company authorization, company isolation, AI `ASSISTANT` request budgeting/concurrency, Storage authority, DOCX archive/security checks, and lifecycle guards.
- Use existing `parentVersionId`, server version-creation RPC, and `DUPLICATED` origin for prepared descendants; do not add a cosmetic migration.
- Original uploaded bytes remain unchanged; preparation always creates a new `DRAFT` version and activation remains separate.
- Ambiguous anchors, unsupported structures, unknown registry fields, invalid AI output, and unsafe OOXML fail closed.
- Keep Storage, AI runtime, programmatic PDF fallback, and high-fidelity PDF conversion as separate capabilities.
- Use TDD: write each regression test, run it to observe the expected failure, implement the smallest change, then rerun focused tests.
- Do not touch production or send uncontrolled email/SMS; run authenticated validation only against Local-QA/QA when the target is proven non-production.
- Default to zero subagents and execute this plan inline on `codex/document-template-ai-autotagging-correction`.

---

### Task 1: Establish the server-owned AI runtime capability contract

**Files:**
- Modify: `src/server/ai/companyAiTypes.ts`
- Modify: `src/server/ai/companyAiRuntime.ts`
- Modify: `server.ts:870-882`
- Modify: `src/lib/deploymentAiApi.ts`
- Test: `tests/companyAiRuntime.test.ts`
- Test: `tests/companyAiServer.test.ts`
- Test: `tests/deploymentAiPresentation.test.ts`

**Interfaces:**
- Produce `CompanyAiRuntimeCapability` with `status: "AVAILABLE" | "UNAVAILABLE"`, safe `code`, safe `message`, provider, and optional model.
- Produce `resolveCompanyAiRuntimeCapability(options: { supabase: SupabaseClient; credentialSupabase?: SupabaseClient; companyId: string; environment?: NodeJS.ProcessEnv }): Promise<CompanyAiRuntimeCapability>`.
- Extend normalized client metadata with `runtimeCapability` without returning credentials or decrypted material.

- [ ] **Step 1: Write the failing runtime-capability tests.** Add cases proving an enabled company runtime resolves as `AVAILABLE` even when `lastTestStatus` is `NOT_TESTED`, `PROVIDER_UNAVAILABLE`, or `INVALID_CREDENTIAL` metadata, and a missing/disabled/misconfigured runtime returns `UNAVAILABLE` without a secret or provider response body.

- [ ] **Step 2: Run the focused tests and verify the expected failure.**

Run: `npm.cmd test tests/companyAiRuntime.test.ts tests/companyAiServer.test.ts tests/deploymentAiPresentation.test.ts`

Expected: the new capability assertions fail because no runtime capability contract exists.

- [ ] **Step 3: Implement the capability result from the existing runtime resolver.** Add the type and resolver wrapper; call `resolveCompanyAiRuntime` with the authorized company scope and the server credential path, map `CompanyAiError` codes to existing safe messages, and never include credential material or raw provider text.

- [ ] **Step 4: Add the capability to the deployment endpoint and client normalizer.** In `GET /api/deployment/company-ai`, keep existing metadata/bootstrap behavior and add the safe resolver result. Normalize missing capability data as unavailable rather than inferring readiness from `credentialConfigured` or `lastTestStatus`.

- [ ] **Step 5: Run the focused tests and confirm green.**

Run: `npm.cmd test tests/companyAiRuntime.test.ts tests/companyAiServer.test.ts tests/deploymentAiPresentation.test.ts`

Expected: all capability tests pass and no returned payload contains a key, ciphertext, token, or raw provider error.

- [ ] **Step 6: Commit the capability contract.**

```powershell
git add src/server/ai/companyAiTypes.ts src/server/ai/companyAiRuntime.ts server.ts src/lib/deploymentAiApi.ts tests/companyAiRuntime.test.ts tests/companyAiServer.test.ts tests/deploymentAiPresentation.test.ts
git commit -m "fix: expose truthful company AI runtime capability"
```

### Task 2: Add anchored DOCX structure discovery

**Files:**
- Create: `src/server/documentTemplates/documentTemplateAutoTagger.ts`
- Modify: `src/server/documentTemplates/documentTemplateEngine.ts` only where shared safe XML/package helpers must be exported
- Test: `tests/documentTemplateAutoTagging.test.ts`

**Interfaces:**
- Produce `DocumentTemplateAnchor`, `DocumentTemplateLineTableCandidate`, and `DocumentTemplateAnchorInventory` types.
- Produce `extractDocumentTemplateAnchorInventory(bytes: Uint8Array, fileName?: string): DocumentTemplateAnchorInventory`.
- Produce deterministic anchor IDs scoped to package part, structure kind, indexes, and occurrence.

- [ ] **Step 1: Write the failing anchor-discovery tests.** Build a sanitized tagless Purchase Order DOCX fixture containing labeled scalar values, a styled line table, a header/footer, an internal image part, and unrelated text. Assert that discovery returns deterministic body/header/footer anchors, table/cell indexes, normalized text, exact value spans where safely derivable, and a unique line-table candidate.

- [ ] **Step 2: Run the new test and verify it fails for the missing module/API.**

Run: `npm.cmd test tests/documentTemplateAutoTagging.test.ts`

Expected: module/function import failure, not a fixture assertion failure.

- [ ] **Step 3: Implement bounded XML part enumeration.** Reuse `validateDocxTemplateBytes` and `PizZip` after validation; inspect only `word/document.xml`, `word/header*.xml`, and `word/footer*.xml`; preserve package entries and ignore unsupported Word parts for transformation rather than treating them as editable anchors.

- [ ] **Step 4: Implement stable paragraph/cell anchor extraction.** Track paragraph, table, row, and cell indexes within each part; normalize XML text without losing the exact source text; derive a replaceable value span only for unambiguous colon/tab/label-value forms; record occurrence counts so duplicate text cannot be silently replaced.

- [ ] **Step 5: Implement unique line-table candidate detection.** Score header rows using allowlisted aliases for line number, description, quantity, unit, unit price, and amount; require description and amount plus a compatible data row; return no candidate when two tables tie or the structure cannot be safely mapped.

- [ ] **Step 6: Run the anchor tests and preserve existing compatibility tests.**

Run: `npm.cmd test tests/documentTemplateAutoTagging.test.ts tests/documentTemplates.test.ts tests/documentTemplateCompatibility.test.ts`

Expected: new anchor tests and existing security/merge tests pass.

- [ ] **Step 7: Commit the discovery unit.**

```powershell
git add src/server/documentTemplates/documentTemplateAutoTagger.ts src/server/documentTemplates/documentTemplateEngine.ts tests/documentTemplateAutoTagging.test.ts
git commit -m "feat: discover deterministic DOCX template anchors"
```

### Task 3: Extend the mapping schema with safe anchors and line columns

**Files:**
- Modify: `src/lib/documentTemplateRegistry.ts`
- Modify: `src/server/documentTemplates/documentTemplateRouter.ts:700-748,922-945`
- Test: `tests/documentTemplates.test.ts`
- Test: `tests/documentTemplateAutoTagging.test.ts`

**Interfaces:**
- Extend `DocumentTemplateMappingProposal` with optional bounded `anchorId` and `targetText`.
- Extend `DocumentTemplateMappingAnalysis.lineTable` with application-derived table identity and bounded column mappings.
- Produce `validateTemplateMappingAnalysisAgainstInventory(analysis, inventory, documentType)` that rejects unknown fields, anchors, indexes, mismatched text, duplicate targets, and unsafe line mappings.

- [ ] **Step 1: Write failing schema-validation tests.** Add tests for valid anchored scalar/line proposals, unknown field rejection, unknown anchor rejection, duplicate anchor use, stale target text, invalid column indexes, and unresolved ambiguous line candidates.

- [ ] **Step 2: Run the focused tests and observe the expected failure.**

Run: `npm.cmd test tests/documentTemplates.test.ts tests/documentTemplateAutoTagging.test.ts`

Expected: the new proposal fields are absent or invalid plans are accepted.

- [ ] **Step 3: Extend the application-owned types and validators.** Keep existing blueprint/tag validation unchanged; add bounded anchor/line-table properties, enforce the document-type registry, and validate the plan against the current inventory in a separate server-side step.

- [ ] **Step 4: Send only server-derived inventory to AI analysis.** Replace vague `location: "paragraph"`/`location: "table"` dependence with bounded anchor IDs, exact source text, and line-column candidates in `safeStructure`; update the Gemini response schema and heuristic fallback to produce unresolved proposals when no safe anchor exists.

- [ ] **Step 5: Run mapping/security tests and confirm green.**

Run: `npm.cmd test tests/documentTemplates.test.ts tests/documentTemplateAutoTagging.test.ts tests/documentTemplateCompatibility.test.ts tests/documentTemplateSecurityBoundary.test.ts`

- [ ] **Step 6: Commit the safe mapping contract.**

```powershell
git add src/lib/documentTemplateRegistry.ts src/server/documentTemplates/documentTemplateRouter.ts tests/documentTemplates.test.ts tests/documentTemplateAutoTagging.test.ts
git commit -m "feat: validate anchored document template mapping proposals"
```

### Task 4: Implement the deterministic DOCX transformer

**Files:**
- Modify: `src/server/documentTemplates/documentTemplateAutoTagger.ts`
- Test: `tests/documentTemplateAutoTagging.test.ts`
- Test: `tests/documentTemplateCompatibility.test.ts`

**Interfaces:**
- Produce `prepareDocxTemplate(bytes: Uint8Array, fileName: string, documentType: DocumentTemplateType, plan: DocumentTemplatePreparationPlan): { bytes: Uint8Array; bindings: readonly DocumentTemplateBinding[]; inventory: DocumentTemplateAnchorInventory; report: TemplateValidationReport }`.
- Produce a bounded `DocumentTemplatePreparationError` carrying safe unresolved/ambiguous issue details.

- [ ] **Step 1: Write the failing scalar-transformation tests.** Assert that a verified company name, PO number, supplier value, and footer/body value become supported merge tags while labels, unrelated text, run properties, and non-target XML remain present.

- [ ] **Step 2: Run the tests and verify they fail before transformation code exists.**

Run: `npm.cmd test tests/documentTemplateAutoTagging.test.ts`

Expected: transformed output does not yet contain the requested tags.

- [ ] **Step 3: Implement verified text-span replacement.** Re-open the original ZIP, locate the exact part/paragraph/cell and occurrence, replace only the verified target text with `{{fieldTag}}`, XML-escape inserted text, preserve `w:rPr` and surrounding runs, and reject any mismatch or duplicate target.

- [ ] **Step 4: Write and run the failing line-table transformation test.** Assert that the existing styled data row receives `{{#lines}}`, allowlisted line-field tags, and `{{/lines}}`; the table remains a table and a two-line authoritative demo snapshot renders both rows through `mergeDocxTemplate`.

- [ ] **Step 5: Implement repeating-row tagging.** Modify only the selected compatible row/cells, preserve `w:trPr`, `w:tcPr`, cell borders, widths, and run properties, place row markers in the same row contract consumed by `docxtemplater`, and create no output when candidate selection or column mapping is ambiguous.

- [ ] **Step 6: Revalidate transformed output.** Run `validateDocxTemplateBytes`, extract tags/structure, build confirmed bindings only from the validated plan, and call `validateDocumentTemplateBindings`; return the report instead of silently accepting partial tags.

- [ ] **Step 7: Run the transformer, security, and merge tests.**

Run: `npm.cmd test tests/documentTemplateAutoTagging.test.ts tests/documentTemplateCompatibility.test.ts tests/documentTemplates.test.ts tests/documentTemplateRelationshipEdgeCases.test.ts`

Expected: formatting/package-preservation, line-repeat, ambiguity, external-resource, and authoritative merge tests pass.

- [ ] **Step 8: Commit the transformer.**

```powershell
git add src/server/documentTemplates/documentTemplateAutoTagger.ts tests/documentTemplateAutoTagging.test.ts tests/documentTemplateCompatibility.test.ts
git commit -m "feat: deterministically prepare uploaded DOCX templates"
```

### Task 5: Add the immutable preparation route and client API

**Files:**
- Modify: `src/server/documentTemplates/documentTemplateRouter.ts`
- Modify: `src/lib/documentTemplates.ts`
- Test: `tests/documentTemplateCompatibility.test.ts`
- Test: `tests/documentTemplateStorageCapability.test.ts` only if shared capability assertions change

**Interfaces:**
- Add `POST /api/document-templates/:versionId/prepare`.
- Add `prepareDocumentTemplate(companyId: string, versionId: string, plan: DocumentTemplatePreparationPlan): Promise<{ version: DocumentTemplateVersion; preparation: "AI_AUTO_TAGGED"; report: TemplateValidationReport; structure: DocumentTemplateStructure }>`.

- [ ] **Step 1: Write the failing route test.** Extend the memory-storage router fixture to upload a tagless DOCX, prepare it with a reviewed plan, and assert a `201` response, a new version ID, `parentVersionId` equal to the uploaded version, `DRAFT` status, validated tags, and unchanged original stored bytes/hash.

- [ ] **Step 2: Run the route test and observe the missing-route failure.**

Run: `npm.cmd test tests/documentTemplateCompatibility.test.ts`

Expected: the preparation request returns `404` or lacks the expected descendant response.

- [ ] **Step 3: Implement request normalization and server validation.** Authorize with `company.settings.manage`, load the version through `readTemplateVersion`/`readTemplateBytes`, extract the current inventory, validate the untrusted plan against that inventory, and reject invalid/ambiguous plans without writing Storage or metadata.

- [ ] **Step 4: Persist the prepared descendant through `persistVersion`.** Use the same template root/document type, `origin: "DUPLICATED"`, `parentVersionId: version.id`, new bytes/hash/path, confirmed bindings, and transformed validation report; compensate Storage if metadata creation fails.

- [ ] **Step 5: Add the browser API wrapper and safe error normalization.** Send only the semantic plan JSON; never include raw XML, credentials, or financial values. Preserve server error code/message/reference boundaries.

- [ ] **Step 6: Run route/storage/security tests and confirm green.**

Run: `npm.cmd test tests/documentTemplateCompatibility.test.ts tests/documentTemplateStorageCapability.test.ts tests/documentTemplateSecurityBoundary.test.ts`

- [ ] **Step 7: Commit the preparation API.**

```powershell
git add src/server/documentTemplates/documentTemplateRouter.ts src/lib/documentTemplates.ts tests/documentTemplateCompatibility.test.ts tests/documentTemplateStorageCapability.test.ts
git commit -m "feat: persist immutable prepared template drafts"
```

### Task 6: Replace the Settings manual-tag dead end with mapping review and preparation

**Files:**
- Modify: `src/components/access/CompanyDocumentTemplatesSettings.tsx`
- Modify: `src/lib/deploymentAiApi.ts` if capability presentation needs shared helpers
- Modify: `tests/documentTemplates.test.ts` source/UI assertions
- Modify: `tests/documentTemplateStorageCapability.test.ts` stale gate assertions

**Interfaces:**
- Consume `runtimeCapability`, anchored `DocumentTemplateMappingAnalysis`, and `prepareDocumentTemplate`.
- Produce a reviewed `DocumentTemplatePreparationPlan` from selected allowlisted fields and anchor/line-table choices.

- [ ] **Step 1: Write failing UI contract assertions.** Assert that Settings no longer uses `lastTestStatus === "SUCCESS"` as the Generate gate, exposes an Apply/Prepare action for tagless analysis, shows mapping source/field/confidence/use state, and labels Word editing as an advanced fallback.

- [ ] **Step 2: Run the focused UI/document tests and observe the expected failure.**

Run: `npm.cmd test tests/documentTemplates.test.ts tests/documentTemplateStorageCapability.test.ts tests/companyAiUi.test.ts`

Expected: existing assertions still find the stale gate and manual-tag dead-end copy.

- [ ] **Step 3: Replace the AI capability gate.** Use only normalized `runtimeCapability.status` for enabling Generate; keep Storage and PDF capability states independent; show the safe runtime message when unavailable.

- [ ] **Step 4: Store and render analysis proposals.** Type the analysis state, preselect only safe/high-confidence proposals, render allowlisted field selectors, expose unresolved required fields and ambiguous line-table state, and retain user corrections before preparation.

- [ ] **Step 5: Add the Apply mappings / Prepare template action.** Submit the reviewed semantic plan, select the returned descendant version, refresh bindings/analysis/validation, and show that the original upload remains in version history.

- [ ] **Step 6: Change upload/analyze messaging.** Replace the ordinary “place tags in Word” instruction with the in-app preparation path; keep `Download / edit in Word` under an explicit advanced manual fallback label for unsupported/unresolved structures.

- [ ] **Step 7: Run UI/document tests and confirm green.**

Run: `npm.cmd test tests/documentTemplates.test.ts tests/documentTemplateStorageCapability.test.ts tests/companyAiUi.test.ts tests/deploymentAiPresentation.test.ts`

- [ ] **Step 8: Commit the Settings workflow.**

```powershell
git add src/components/access/CompanyDocumentTemplatesSettings.tsx src/lib/deploymentAiApi.ts tests/documentTemplates.test.ts tests/documentTemplateStorageCapability.test.ts tests/companyAiUi.test.ts tests/deploymentAiPresentation.test.ts
git commit -m "fix: prepare uploaded templates from reviewed mappings"
```

### Task 7: Make Generate failures truthful and preserve AI safety boundaries

**Files:**
- Modify: `src/server/documentTemplates/documentTemplateRouter.ts:882-920`
- Modify: `src/server/ai/companyAiRuntime.ts` only if shared safe operation-error mapping is needed
- Test: `tests/documentTemplates.test.ts`
- Test: `tests/companyAiRuntime.test.ts`

**Interfaces:**
- Generate continues through `aiJson` and existing `ASSISTANT` budget/concurrency limits.
- Provider failures return existing safe `CompanyAiError` code/reference semantics and a document-AI-specific actionable message.

- [ ] **Step 1: Write failing error-boundary tests.** Add route/source tests proving provider failure is not returned as Storage failure, malformed blueprint JSON is rejected, unknown blueprint fields are rejected, and no credential/provider response text is returned.

- [ ] **Step 2: Run the tests and observe the current generic/misleading behavior.**

Run: `npm.cmd test tests/documentTemplates.test.ts tests/companyAiRuntime.test.ts`

Expected: the provider/storage distinction assertion fails against the current generic Generate response.

- [ ] **Step 3: Implement safe actionable messages.** Preserve status/code/reference, distinguish runtime configuration, provider access/quota/model/network/timeout, malformed AI schema, and application validation failures, and keep all raw provider text out of the browser.

- [ ] **Step 4: Run the error-boundary and AI security tests.**

Run: `npm.cmd test tests/documentTemplates.test.ts tests/companyAiRuntime.test.ts tests/companyAiServer.test.ts tests/companyAiSecretKeyRuntime.test.ts`

- [ ] **Step 5: Commit the error-boundary correction.**

```powershell
git add src/server/documentTemplates/documentTemplateRouter.ts src/server/ai/companyAiRuntime.ts tests/documentTemplates.test.ts tests/companyAiRuntime.test.ts tests/companyAiServer.test.ts tests/companyAiSecretKeyRuntime.test.ts
git commit -m "fix: report document AI failures truthfully"
```

### Task 8: Synchronize product-truth documents and client-facing capability wording

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`
- Modify: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`
- Modify: `docs/HYDROQUALISENSE_DOCUMENT_TEMPLATES_WAVE4A.md`
- Modify: `src/config/productFeatures.ts` only if its current template wording is stale after implementation
- Test: `tests/productFeaturesRoadmap.test.ts` only if client-facing wording changes

- [ ] **Step 1: Compare the implemented behavior with each source-of-truth document.** Record UI/UX Round 2 as complete, this corrective phase as immediate, Wave 4D as resumed only after this correction, Worker Registration as paused, and separate Storage/runtime/PDF/converter states.

- [ ] **Step 2: Update roadmap/handoff/template documentation with only obtained evidence.** Do not mark AI generation certified from local code/tests; record Local-QA/provider blockers and exact SHA evidence only when actually obtained.

- [ ] **Step 3: Review Settings Features & Roadmap wording.** Keep AI template generation truthful and client-facing; do not include PRs, SHAs, migrations, test commands, or internal agent terms.

- [ ] **Step 4: Run documentation/product-truth tests.**

Run: `npm.cmd test tests/productFeaturesRoadmap.test.ts tests/documentTemplates.test.ts`

- [ ] **Step 5: Commit synchronized product truth.**

```powershell
git add AGENTS.md docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md docs/HYDROQUALISENSE_CURRENT_HANDOFF.md docs/HYDROQUALISENSE_DOCUMENT_TEMPLATES_WAVE4A.md src/config/productFeatures.ts tests/productFeaturesRoadmap.test.ts
git commit -m "docs: record document template AI corrective phase"
```

### Task 9: Run focused and affected validation

**Files:**
- Test: all changed document-template, AI, UI, and product-truth tests

- [ ] **Step 1: Run the focused document-template/AI suite.**

Run: `npm.cmd test tests/documentTemplates.test.ts tests/documentTemplateAutoTagging.test.ts tests/documentTemplateCompatibility.test.ts tests/documentTemplateRelationshipEdgeCases.test.ts tests/documentTemplateSecurityBoundary.test.ts tests/documentTemplateStorageCapability.test.ts tests/companyAiRuntime.test.ts tests/companyAiServer.test.ts tests/companyAiCredentials.test.ts tests/companyAiSecretKeyRuntime.test.ts tests/deploymentAiPresentation.test.ts tests/companyAiUi.test.ts`

- [ ] **Step 2: Run the affected-test selector.**

Run: `npm.cmd run test:affected:agent`

Expected: the selector reports its selected tests, with no unrelated full-suite ritual.

- [ ] **Step 3: Run TypeScript validation and production build.**

Run: `npm.cmd run lint`

Run: `npm.cmd run build`

- [ ] **Step 4: Review generated-file churn.** Restore only unrelated generated Astryx/version churn if the build changes it; retain intended source/test/documentation changes.

- [ ] **Step 5: Run `git diff --check` and inspect the complete diff.** Confirm no secrets, arbitrary OOXML execution, financial mutation, production target, unrelated Wave 4D work, or migration was introduced.

### Task 10: Perform non-production QA, final verification, push, and open the PR

**Files:**
- Review: complete repository diff and exact final branch state
- Evidence: Local-QA authenticated template workflow when configured

- [ ] **Step 1: Check the exact branch/base and clean status before QA.**

Run: `git status --short --branch; git rev-parse HEAD; git diff --stat origin/main...HEAD`

- [ ] **Step 2: Start only the required non-production application/Local-QA services.** Do not start Docker/Supabase unless a database contract changed; prove the target is QA/local-QA, not production.

- [ ] **Step 3: Run the same synthetic template workflow.** Upload a sanitized tagless Purchase Order, Analyze, review mappings, Apply mappings, verify a new tagged draft and unchanged original, Test DOCX with multiple demo rows, and leave Activate as a separate deliberate action. Run Generate with a small safe prompt only when the configured non-production AI runtime is proven; record unavailable/provider failures truthfully.

- [ ] **Step 4: Capture QA evidence boundaries.** Separate local/demo, authenticated Local-QA, hosted/provider, production, and exact-head CI evidence. Do not claim HSC-specific evidence unless the actual fixture is available and sanitized.

- [ ] **Step 5: Invoke the verification-before-completion checklist and resolve every applicable failure.**

- [ ] **Step 6: Commit any final test/doc corrections, push the branch, and open a focused PR against `main`.**

```powershell
git push -u origin codex/document-template-ai-autotagging-correction
gh pr create --base main --head codex/document-template-ai-autotagging-correction --title "Correct document template AI capability and auto-tagging" --body "Implements the server-owned AI runtime capability contract and deterministic, human-reviewed DOCX auto-tagging flow. Validation evidence and QA boundaries are included in the PR description."
```

- [ ] **Step 7: Stop after the PR opens.** Report the PR number, exact head SHA, changed-domain summary, focused/affected/lint/build results, QA evidence, skipped checks, and remaining external capability blockers. Do not merge the PR.
