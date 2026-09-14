# Wide Documents Phase Slice 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox ( - [ ] ) syntax for tracking.

**Goal:** Generalize HydroQualiSense’s company-bound DOCX template system so any company can define a safe document type, upload and prepare its own template, activate it, and generate an on-demand DOCX from authorized source data and structured inputs; prove the architecture with the three supplied HSC fixtures.

**Architecture:** Keep the existing immutable template root/version and deterministic OOXML pipeline. Replace the closed template-type assumption with company-bound type definitions that select one of a finite set of server-owned source contexts and contain bounded custom/repeating input schemas. Purchase Order and Client Invoice retain their existing authoritative financial adapters; company-defined types use a flat server-built render context and never gain arbitrary object traversal or database access.

**Tech Stack:** TypeScript, React, Express, Supabase/Postgres migrations and RLS, pizzip, docxtemplater, node:test, PowerShell, and the repository DOCX render/fidelity tooling.

**Spec:** docs/superpowers/specs/2026-09-14-wide-documents-slice2-template-generation-design.md

## Global Constraints

- The three HSC DOCX files are client templates and binary/layout/content acceptance fixtures, not permanent source-code document types.
- New company-defined document types must not require a TypeScript enum entry, switch case, route, schema enum, or dedicated generator.
- System-backed Purchase Order, Client Invoice, Payroll, Inventory, Engineering, Cash & Banking, and supplier evidence remain owned by their existing domains.
- Only finite application-owned source contexts and safe field catalog entries may reach a merge context; reject arbitrary paths, SQL, JavaScript, expressions, hidden fields, and executable OOXML.
- Preserve private company-prefixed Storage, server-only privileged credentials, active membership/RBAC, RLS, immutable versions, parent lineage, and deliberate activation.
- Standalone generated DOCX files are downloaded on demand; generic managed-document persistence and retained generated artifacts remain Slice 3 work.
- Approved warranty wording remains in the uploaded DOCX and must not be copied into source code or rewritten by AI.
- Production remains read-only; QA/local writes are allowed only through the repository-authorized migration/test paths.
- Use TDD for every new runtime behavior: write a focused failing test, run it and observe the expected failure, implement the smallest change, rerun to green, then refactor.
- Use zero subagents, as explicitly requested; the lead owns architecture, shared files, migrations, security, integration, validation, push, and PR creation.

---

### Task 1: Add exact HSC fixture assets and red tests for dynamic types

**Files:**
- Create binary fixtures: tests/fixtures/document-templates/hsc/HSC P.O. Template - Revised.docx, tests/fixtures/document-templates/hsc/HSC Checklist Template - Revised.docx, tests/fixtures/document-templates/hsc/Warranty Certificate Template - Revised.docx
- Create: tests/documentTemplateDynamicTypes.test.ts
- Create: tests/documentTemplateFixtureManifest.test.ts

**Interfaces:**
- Consumes the three supplied files from C:\Users\Al\Downloads\HydroQualiSense Word Templates - Revised.
- Produces fixture paths and expected SHA-256 values used by later preparation/fidelity tests.

- [ ] **Step 1: Copy the supplied binary fixtures without editing them.**

~~~
$sourceRoot = 'C:\Users\Al\Downloads\HydroQualiSense Word Templates - Revised'
$fixtureRoot = 'tests\fixtures\document-templates\hsc'
New-Item -ItemType Directory -Force -Path $fixtureRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceRoot 'HSC P.O. Template - Revised.docx') -Destination (Join-Path $fixtureRoot 'HSC P.O. Template - Revised.docx') -Force
Copy-Item -LiteralPath (Join-Path $sourceRoot 'HSC Checklist Template - Revised.docx') -Destination (Join-Path $fixtureRoot 'HSC Checklist Template - Revised.docx') -Force
Copy-Item -LiteralPath (Join-Path $sourceRoot 'Warranty Certificate Template - Revised.docx') -Destination (Join-Path $fixtureRoot 'Warranty Certificate Template - Revised.docx') -Force
Get-FileHash -Algorithm SHA256 (Join-Path $fixtureRoot '*.docx')
~~~

- [ ] **Step 2: Write the fixture-manifest test first.** Assert the three files exist, are valid ZIP/OOXML packages, contain the expected one/two media files, and match the SHA-256 values recorded from the copy command. Assert the warranty fixture contains two approved prose paragraphs at runtime without putting their wording in production source.
- [ ] **Step 3: Write dynamic-type red tests first.** Import the not-yet-existing type-definition validator/catalog functions and assert that two arbitrary keys such as warranty-certificate and inspection-report validate through the same API, while payroll.salary and an executable custom field definition are rejected.
- [ ] **Step 4: Run only the new tests and verify the failure is about missing dynamic type APIs, not fixture corruption.**

Run: node --test --experimental-strip-types tests/documentTemplateFixtureManifest.test.ts tests/documentTemplateDynamicTypes.test.ts

Expected: FAIL because the dynamic type-definition/catalog exports are not implemented yet; fixture manifest assertions must either pass or report the exact recorded hash mismatch.

- [ ] **Step 5: Commit the untouched fixtures and red tests.**

~~~
git add -- tests/fixtures/document-templates/hsc tests/documentTemplateFixtureManifest.test.ts tests/documentTemplateDynamicTypes.test.ts
git commit -m "test: add HSC fixtures for dynamic document templates"
~~~

### Task 2: Implement the company-defined type definition and safe field catalog

**Files:**
- Create: src/lib/documentTemplateTypes.ts
- Modify: src/lib/documentTemplateRegistry.ts
- Test: tests/documentTemplateDynamicTypes.test.ts
- Test: tests/documentTemplates.test.ts

**Interfaces:**
- DocumentTemplateType becomes a validated dynamic string key; SystemDocumentType remains "PURCHASE_ORDER" | "CLIENT_INVOICE" for financial adapters.
- DocumentTemplateTypeDefinition contains key, displayName, optional description/category, sourceContext, customFields, repeatSections, status, and bounded output filename metadata.
- DocumentTemplateCustomFieldDefinition contains a custom.<slug> key, label, type (TEXT | DATE | NUMBER | BOOLEAN | SELECT), required, and bounded options when type is SELECT.
- DocumentTemplateRepeatSectionDefinition contains a stable repeat key, label, source (INPUT | PROJECT_ASSETS), and bounded child field definitions. Child fields identify either a declared input value or one of the explicit project-asset values (item, notes, sourceType, quantity, unit).
- validateDocumentTemplateTypeDefinition(value: unknown) returns { ok: true; definition } or { ok: false; errors }.
- getDocumentTemplateFieldCatalog(typeKey: string, definition?: DocumentTemplateTypeDefinition) returns only system fields for the two system keys or the safe generic catalog plus the definition’s validated custom/repeating fields.
- isDocumentTemplateType(value: unknown) validates a bounded type-key syntax; isSystemDocumentType(value: unknown) narrows to the two existing system adapters.

- [ ] **Step 1: Add failing assertions for schema limits and catalog boundaries.** Cover maximum key/label lengths, custom field key namespace, SELECT options, repeat-section limits, project source-context visibility, rejection of payroll.*, arbitrary dotted paths, and two arbitrary definitions with no code registration.
- [ ] **Step 2: Run the red test.**

Run: node --test --experimental-strip-types tests/documentTemplateDynamicTypes.test.ts

Expected: FAIL with the missing validator/catalog exports.

- [ ] **Step 3: Add the dynamic schema module.** Keep schema validation deterministic and bounded. Store no executable text. Freeze returned definitions and arrays so callers cannot mutate a validated definition.
- [ ] **Step 4: Refactor the existing registry to use the dynamic key type without weakening system behavior.** Keep the current Purchase Order/Client Invoice field arrays and required-field rules. Add catalog lookup that requires a validated definition for non-system keys. Preserve existing imports and behavior for all current tests.
- [ ] **Step 5: Add generic binding validation rules.** Structural tags must match the declared repeat section key; collection fields must be inside the matching repeat block; every non-collection tag must map to a catalog field; required safe/system fields remain type/context-specific; custom required fields are required only when the definition declares them.
- [ ] **Step 6: Run the new and existing template tests to green.**

Run: node --test --experimental-strip-types tests/documentTemplateDynamicTypes.test.ts tests/documentTemplates.test.ts

Expected: PASS with all existing Purchase Order/Client Invoice assertions unchanged and the arbitrary-type assertions green.

- [ ] **Step 7: Commit the type/catalog foundation.**

~~~
git add -- src/lib/documentTemplateTypes.ts src/lib/documentTemplateRegistry.ts tests/documentTemplateDynamicTypes.test.ts tests/documentTemplates.test.ts
git commit -m "feat: add dynamic document type field catalog"
~~~

### Task 3: Add the forward-only Supabase type-definition contract

**Files:**
- Create through the CLI: one new file under supabase/migrations/ named by npx.cmd supabase migration new document_template_type_definitions
- Modify: the generated migration file only
- Create: tests/documentTemplateTypeMigration.test.ts
- Modify: relevant existing migration contract tests only when their assertions describe the old closed template type

**Interfaces:**
- Table public.document_template_type_definitions stores company-bound dynamic keys, display metadata, finite source context, validated custom/repeat schemas, status, and audit timestamps.
- public.server_create_document_template_type(jsonb, uuid) creates a definition only after deployment-company and company.settings.manage checks.
- public.server_update_document_template_type(text, jsonb, uuid) permits safe metadata/schema updates without deleting history; existing keys and field definitions remain stable when versions depend on them.
- public.server_retire_document_template_type(text, uuid) marks a type retired and never deletes its templates or versions.
- Existing document_templates.document_type and document_template_versions.document_type remain the storage column names for compatibility but become validated dynamic keys referencing (company_id, type_key) in the new definition table.

- [ ] **Step 1: Discover the installed CLI and migration-help syntax before creating the file.**

Run: npx.cmd supabase --version and npx.cmd supabase migration new --help

- [ ] **Step 2: Create the migration through the Supabase CLI.**

Run: npx.cmd supabase migration new document_template_type_definitions

- [ ] **Step 3: Write migration contract tests first.** Assert the migration creates the definition table with company identity, unique (company_id, type_key), finite source-context/status checks, JSON array/object checks, explicit grants, RLS, server-only mutation grants, and seeds PURCHASE_ORDER and CLIENT_INVOICE for every company. Assert it drops/replaces only the old template-root/version closed-type checks and leaves issued snapshot, generation evidence, send-intent, and delivery-history checks limited to their existing financial types.
- [ ] **Step 4: Run the migration contract test and verify it fails because the new migration lacks the required statements.**
- [ ] **Step 5: Implement the schema migration.** Create the definition table, seed system definitions, replace root/version checks with a bounded key check plus definition foreign key, preserve existing composite root/parent/version identity constraints, and validate custom/repeat JSON through the server function before persistence.
- [ ] **Step 6: Implement RLS and Storage classification.** Add a private parser for the dynamic type key in company template paths. Template read policies must use the definition’s source context and the caller’s permission; authenticated browsers receive no template-byte mutation policies; service-only RPC wrappers remain the only mutation path. Keep artifacts classified only for the existing issued financial paths.
- [ ] **Step 7: Implement the server-only create/update/retire functions.** Require auth.uid(), deployment-company equality, active membership through the existing permission functions, bounded keys, and validated schema. Retire by status update; never delete definitions or versions.
- [ ] **Step 8: Run the migration contract tests to green, then inspect the complete SQL for search-path, grant, RLS, and forward-only safety.**
- [ ] **Step 9: Commit the migration and contract tests.**

~~~
git add -- supabase/migrations tests/documentTemplateTypeMigration.test.ts
git commit -m "feat: store company-defined document template types"
~~~

### Task 4: Generalize deterministic merge contexts and DOCX preparation

**Files:**
- Create: src/server/documentTemplates/documentTemplateContext.ts
- Modify: src/server/documentTemplates/documentTemplateEngine.ts
- Modify: src/server/documentTemplates/documentTemplateAutoTagger.ts
- Modify: src/lib/documentTemplateRegistry.ts
- Create: tests/documentTemplateDynamicFidelity.test.ts
- Modify: tests/documentTemplateAutoTagging.test.ts
- Modify: tests/documentTemplateCompatibility.test.ts

**Interfaces:**
- DocumentTemplateRenderContext is a flat { typeKey, scalarValues, collections } object built only by server adapters or validated test previews.
- buildFinancialTemplateRenderContext(snapshot) adapts the existing Purchase Order/Client Invoice snapshot without changing its authoritative value semantics.
- buildManagedTemplateRenderContext(definition, sourceValues, validatedInputs) accepts only catalog keys and declared repeat fields.
- mergeDocumentTemplate(bytes, fileName, context, bindings, definition) is the shared deterministic merge entry point; mergeDocxTemplate remains a compatibility wrapper for financial snapshots.
- extractDocumentTemplateAnchorInventory(bytes, fileName, definition?) discovers generic safe anchors and repeat candidates using the supplied definition rather than HSC-specific conditions.
- prepareDocxTemplate(bytes, fileName, typeKey, plan, definition?) accepts reviewed scalar mappings and generic repeat-table plans, verifies anchors from current bytes, creates no side effects, and returns transformed bytes, bindings, inventory, and validation report.

- [ ] **Step 1: Write failing generic merge tests.** Use an arbitrary inspection-report definition with a custom date/text field and one input repeat section. Assert scalar replacement, multiple repeat rows, boolean rendering as checkbox text, unknown tag rejection, missing required input rejection, and deterministic byte output for the same context.
- [ ] **Step 2: Write failing exact-fixture preparation/fidelity tests.** Use the copied HSC PO as the existing PURCHASE_ORDER system type and define HSC Checklist/Warranty schemas inside the test as ordinary company-defined definitions. Assert preparation is driven only by inventory/plan/catalog data, not by a type switch; compare source/generated ZIP entries; require unchanged media/header/settings/style/relationship parts; keep non-target XML outside approved target ranges unchanged; assert the warranty paragraphs’ extracted text is unchanged after merge.
- [ ] **Step 3: Run the red fidelity tests and verify failures identify missing generic contexts/repeat support.**
- [ ] **Step 4: Refactor the merge engine to use a flat context.** Keep existing docxtemplater/PizZip safety checks and the financial wrapper. Resolve loop tags only from collections and field tags only from explicit scalarValues or the current validated row scope.
- [ ] **Step 5: Generalize registry validation for dynamic definitions.** Preserve existing lines behavior for system templates; validate arbitrary repeat section keys and custom field tags through the definition catalog.
- [ ] **Step 6: Generalize anchor inventory and transformer.** Add colon/adjacent blank slots, nested cell paragraph spans, safe issue-date-like spans, and repeat-table candidates based on declared field labels. Preserve source prefixes and signatures. Use one generic reserved-row transformation algorithm; reject ambiguous candidates instead of selecting by position. Do not include HSC text, logo names, or HSC coordinates in production code.
- [ ] **Step 7: Run focused merge/compatibility/fidelity tests to green.**

Run: node --test --experimental-strip-types tests/documentTemplateDynamicFidelity.test.ts tests/documentTemplateAutoTagging.test.ts tests/documentTemplateCompatibility.test.ts tests/documentTemplates.test.ts

- [ ] **Step 8: Commit the generic merge/preparation implementation.**

~~~
git add -- src/server/documentTemplates/documentTemplateContext.ts src/server/documentTemplates/documentTemplateEngine.ts src/server/documentTemplates/documentTemplateAutoTagger.ts src/lib/documentTemplateRegistry.ts tests/documentTemplateDynamicFidelity.test.ts tests/documentTemplateAutoTagging.test.ts tests/documentTemplateCompatibility.test.ts tests/documentTemplates.test.ts
git commit -m "feat: generalize DOCX preparation and merge contexts"
~~~

### Task 5: Implement dynamic type APIs and server-authoritative generation

**Files:**
- Modify: src/server/documentTemplates/documentTemplateRouter.ts
- Modify: src/server/documentTemplates/documentTemplateContext.ts
- Modify: src/lib/documentTemplates.ts
- Create: tests/documentTemplateDynamicRouter.test.ts
- Modify: existing document-template router/security tests

**Interfaces:**
- GET /api/document-templates/types returns safe company-bound type definitions visible to the caller.
- POST /api/document-templates/types creates a company-defined type from business metadata and validated schemas.
- PUT /api/document-templates/types/:typeKey updates only allowed non-destructive definition metadata/schema changes.
- POST /api/document-templates/types/:typeKey/retire marks a type retired without deleting versions.
- GET /api/document-templates/available returns active, VALID template versions paired with safe type metadata for authorized Documents -> Create discovery.
- Existing upload/analyze/prepare/list/generate routes accept dynamic type keys and load their definition server-side.
- POST /api/document-templates/managed-generate accepts { templateVersionId, typeKey, sourceId?, inputs }, rechecks type/version/company/permission/source ownership, builds a server context, and returns a DOCX without retaining an artifact.
- validateManagedDocumentInputs(definition, value) returns bounded typed scalar/repeat values and rejects unknown fields, sensitive field guesses, cross-company source IDs, invalid options, oversized strings, and excess rows.

- [ ] **Step 1: Write failing router tests for arbitrary type creation and listing.** Use the existing injected authorizer/storage/Supabase test seams. Create inspection-report and handover-form through the same request shape; assert both list without code registration and a retired type disappears from available while its version remains readable to administration.
- [ ] **Step 2: Write failing generation/security tests.** Assert an authorized Project-context type can generate using a selected project plus typed inputs; a guessed payroll.salary mapping, cross-company source ID, retired type, non-active/non-valid version, and browser-supplied financial total all fail closed. Assert the HSC fixtures use the same APIs and no warranty wording is present in router/registry source.
- [ ] **Step 3: Run the red router tests and verify failures are caused by missing dynamic routes/context adapters.**
- [ ] **Step 4: Add type-definition route helpers.** Load definitions by company/key, map safe API fields, authorize reads by declared source context, and keep raw Storage paths/hashes out of the available/Create response.
- [ ] **Step 5: Update upload/list/analyze/prepare/persist logic.** Resolve a type definition before reading/writing versions, use the dynamic key in paths and metadata, and pass the definition into catalog, anchor, and binding validation. Preserve the current financial PURCHASE_ORDER/CLIENT_INVOICE behavior.
- [ ] **Step 6: Add explicit server source adapters.** The Purchase Order adapter uses Procurement-owned PO/line/vendor/project data and existing snapshot semantics; the Project adapter reads only project plus permitted project material/equipment register fields and never warehouse balances/movements; General uses only safe company/current-user fields; Client Invoice keeps its existing owner route. Use company-scoped server reads and return only the flat context.
- [ ] **Step 7: Add managed input validation and generation.** Validate custom scalar/repeat values, combine project assets with declared checkbox/input overrides where the type definition allows them, require an active valid version, merge via mergeDocumentTemplate, and return a safe filename. Do not record issued-document evidence for standalone managed generation.
- [ ] **Step 8: Run focused router/security/compatibility tests to green.**

Run: node --test --experimental-strip-types tests/documentTemplateDynamicRouter.test.ts tests/documentTemplateSecurityBoundary.test.ts tests/documentTemplateCompatibility.test.ts tests/documentTemplateStorageCapability.test.ts

- [ ] **Step 9: Commit the server/API implementation.**

~~~
git add -- src/server/documentTemplates/documentTemplateRouter.ts src/server/documentTemplates/documentTemplateContext.ts src/lib/documentTemplates.ts tests/documentTemplateDynamicRouter.test.ts tests/documentTemplateSecurityBoundary.test.ts tests/documentTemplateCompatibility.test.ts tests/documentTemplateStorageCapability.test.ts
git commit -m "feat: generate documents from dynamic company templates"
~~~

### Task 6: Make Documents -> Templates a dynamic administration workflow

**Files:**
- Modify: src/components/access/CompanyDocumentTemplatesSettings.tsx
- Modify: src/lib/documentTemplates.ts
- Modify: tests/documentTemplatePreparationClient.test.ts
- Create: tests/documentTemplateDynamicSettings.test.ts

**Interfaces:**
- The client loads type definitions and roots from the server; DOCUMENT_TEMPLATE_TYPES is no longer the UI source of truth for type tabs/cards.
- New client functions are listDocumentTemplateTypes, createDocumentTemplateType, updateDocumentTemplateType, retireDocumentTemplateType, listAvailableDocumentTemplates, and generateManagedDocument.
- The type form uses business labels for name/category/source context/custom fields/repeating sections and serializes the bounded schema through the API.

- [ ] **Step 1: Write failing UI-contract tests.** Assert the settings source renders dynamic type data, includes a New template type path with business-language fields, does not render HSC-specific permanent cards, keeps system starter/AI actions limited to system-backed types, and retains the advanced Word fallback.
- [ ] **Step 2: Run the red UI-contract tests.**
- [ ] **Step 3: Add the client API types/functions.** Normalize dynamic type responses, preserve existing financial function signatures, and keep error messages safe.
- [ ] **Step 4: Replace hardcoded template tabs/cards with dynamic definitions.** Show type display name/category/status, upload/analyze/review/prepare/test/activate actions, version history, and a retire action for custom types. Do not display raw keys, hashes, Storage paths, or OOXML terms in the ordinary path.
- [ ] **Step 5: Add the bounded New template type form.** Allow a company administrator to define scalar custom fields and repeat-section fields, select only finite source contexts, and submit through the server validator. Allow editing only through the safe update route; do not add an arbitrary schema JSON editor.
- [ ] **Step 6: Pass the selected definition into mapping review and preparation.** Let the administrator choose catalog fields or declared custom inputs, show unresolved proposals as requiring review, and create an immutable descendant through the existing Prepare route.
- [ ] **Step 7: Run focused client/template tests to green.**

Run: node --test --experimental-strip-types tests/documentTemplateDynamicSettings.test.ts tests/documentTemplatePreparationClient.test.ts tests/documentTemplateDynamicTypes.test.ts

- [ ] **Step 8: Commit the dynamic administration UI.**

~~~
git add -- src/components/access/CompanyDocumentTemplatesSettings.tsx src/lib/documentTemplates.ts tests/documentTemplateDynamicSettings.test.ts tests/documentTemplatePreparationClient.test.ts
git commit -m "feat: manage company-defined document types in Templates"
~~~

### Task 7: Make Documents -> Create discover active company templates generically

**Files:**
- Create: src/components/documents/ManagedDocumentCreateView.tsx
- Modify: src/components/documents/DocumentCreateView.tsx
- Modify: src/app/routes/DocumentsRoute.tsx
- Modify: src/app/routes/AppRouter.tsx
- Modify: tests/documentCenter.test.ts
- Create: tests/documentCreateDynamicTemplates.test.ts

**Interfaces:**
- ManagedDocumentCreateView consumes projects, Purchase Orders, client billings where already authorized, the active company ID, and GET /api/document-templates/available data.
- The component selects { typeKey, templateVersionId, sourceId?, inputs } and calls generateManagedDocument; it never sends authoritative values assembled by the browser.
- Core system workflow links remain available separately; active company-defined types appear from server data without a source-code card or type switch.

- [ ] **Step 1: Write failing Create tests.** Assert an active arbitrary type appears automatically, a retired/no-active/invalid type does not, source-context permissions filter options, the wizard has choose-source -> review -> permitted-input -> final-review -> generate states, and guest/demo mode cannot call generation.
- [ ] **Step 2: Run the red tests.**
- [ ] **Step 3: Add generic available-type loading to the client and route.** Keep the existing Documents Library/Templates views and Settings link unchanged.
- [ ] **Step 4: Implement the generic type/source chooser.** Project-context types list authorized projects; Purchase Order context lists authorized POs; General types show only safe manual fields. Use display names/category/descriptions from the definition.
- [ ] **Step 5: Implement review/prefill/input steps.** Show only server-adapter prefill fields and declared custom fields. For project assets, show permitted names/units/planned quantities and checkbox/input controls without balances or movement history. Keep system PO totals read-only and sourced from the owning record.
- [ ] **Step 6: Implement final review and DOCX download.** Call the managed-generation API with IDs and validated structured input only, download the returned DOCX, and state clearly that no business record or retained artifact was created.
- [ ] **Step 7: Run focused Documents/Create tests and update existing Documents shell tests to green.**

Run: node --test --experimental-strip-types tests/documentCreateDynamicTemplates.test.ts tests/documentCenter.test.ts tests/documentTemplateDynamicSettings.test.ts

- [ ] **Step 8: Commit the generic Create workflow.**

~~~
git add -- src/components/documents/ManagedDocumentCreateView.tsx src/components/documents/DocumentCreateView.tsx src/app/routes/DocumentsRoute.tsx src/app/routes/AppRouter.tsx tests/documentCreateDynamicTemplates.test.ts tests/documentCenter.test.ts
git commit -m "feat: discover company templates from Documents Create"
~~~

### Task 8: Run database/runtime/fidelity validation and synchronize product truth

**Files:**
- Modify: docs/HYDROQUALISENSE_UNIFIED_DOCUMENT_CENTER.md
- Modify: docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md
- Modify: docs/HYDROQUALISENSE_CURRENT_HANDOFF.md
- Modify: src/config/productFeatures.ts
- Modify: docs/superpowers/specs/2026-09-14-wide-documents-slice2-template-generation-design.md
- Modify: docs/superpowers/plans/2026-09-14-wide-documents-slice2-template-generation.md

**Interfaces:**
- Final docs state that HSC is fixture evidence for a dynamic company-defined system, not a closed enum; Slice 2 may be marked only to the level actually verified; Slice 3 managed uploads/retained artifacts remain unfinished.

- [ ] **Step 1: Run all new/edited focused tests.**

Run: node --test --experimental-strip-types tests/documentTemplateFixtureManifest.test.ts tests/documentTemplateDynamicTypes.test.ts tests/documentTemplateDynamicFidelity.test.ts tests/documentTemplateDynamicRouter.test.ts tests/documentTemplateDynamicSettings.test.ts tests/documentCreateDynamicTemplates.test.ts tests/documentTemplates.test.ts tests/documentTemplateCompatibility.test.ts tests/documentTemplateSecurityBoundary.test.ts

- [ ] **Step 2: Run the affected selector, lint, and build.**

Run: npm.cmd run test:affected:agent, npm.cmd run lint, and npm.cmd run build.

Record selected tests, pass/fail/skip counts, and existing non-blocking build warnings separately.

- [ ] **Step 3: Run required Supabase validation for the migration.** Check Docker first, then use the repository commands:

~~~
docker info
npx.cmd supabase db reset --local --no-seed --yes
npx.cmd supabase test db --local
npm.cmd run test:migrations
npm.cmd run test:migrations:upgrade
~~~

Run relevant runtime/RLS tests for dynamic type isolation, source-context permission filtering, type retirement, version lineage, and cross-company rejection. If Docker is unavailable, record that exact blocker and do not call database validation passed.

- [ ] **Step 4: Render every HSC source and generated DOCX with the bundled renderer.** Use render_docx.py and inspect every page at 100% for clipping, overlap, page geometry, headers, tables, borders, logos, signatures, checkbox glyphs, and warranty wording. If the bundled LibreOffice binary is unavailable as observed during context inspection, record the exact renderer blocker and retain structural/package evidence without claiming converter-backed fidelity certification.
- [ ] **Step 5: Run authenticated Local-QA for all three HSC workflows plus one arbitrary second type.** Verify exact uploaded templates, reviewed mappings, immutable descendant lineage, original SHA preservation, multiple PO/checklist rows, checkbox/remarks/signatures, unchanged warranty wording/images, source permission filtering, and successful DOCX download/open/package validation. No production writes.
- [ ] **Step 6: Run responsive browser validation for desktop, constrained laptop, tablet, and phone on Documents -> Templates and Documents -> Create.** Keep the workflow task-first, one-primary-action, and free of raw engineering details. Record any broad harness instability separately from the isolated flows.
- [ ] **Step 7: Review the complete diff and synchronize docs/product truth.** Confirm no HSC prose/logo/geometry is hardcoded, no dynamic type is added to a TypeScript enum, no generic managed-document table/artifact retention slipped in, and Settings/status descriptions match only genuinely usable capability.
- [ ] **Step 8: Commit documentation synchronization and final evidence.**

~~~
git add -- docs/HYDROQUALISENSE_UNIFIED_DOCUMENT_CENTER.md docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md docs/HYDROQUALISENSE_CURRENT_HANDOFF.md src/config/productFeatures.ts docs/superpowers/specs/2026-09-14-wide-documents-slice2-template-generation-design.md docs/superpowers/plans/2026-09-14-wide-documents-slice2-template-generation.md
git commit -m "docs: record dynamic template slice 2 completion truth"
~~~

- [ ] **Step 9: Verify the final branch and open the PR without merging it.**

~~~
git diff origin/main...HEAD --stat
git diff origin/main...HEAD --check
git status --short --branch
git push -u origin codex/wide-documents-slice2-template-generation
~~~

Open the focused PR, include the base SHA 0aaf497a933b887396376debbc44b57a9bcdbe54, final SHA, migration/runtime evidence, fixture hashes, render status, skipped checks, and truthful remaining Slice 3/Wave 4D limitations. Do not self-merge.
