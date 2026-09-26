# Canva-Assisted UI and Landing Page Workflow

Status: **ACTIVE PLANNING CONTRACT — VIS-CANVA-1 SELECTED AS NEXT BOUNDED PHASE**  
Date: **2026-09-26**  
Repository: `Juvialski/InvoiceApp`  
Activation baseline: `26d7480d6e8de44f6a59404c8dd0128eca08bfbb`

This contract adds a visual-design stage to the existing HydroQualiSense UI workflow without making Canva an application source of truth.

It extends rather than replaces:

- `AGENTS.md`;
- `docs/AGENT_EXECUTION_EFFICIENCY.md`;
- `docs/superpowers/specs/2026-09-24-ux-edit-operations-workbook-roadmap.md`;
- the hardening-first / no-unbounded-feature-expansion policy;
- the existing production-company / QA-software-showcase audience split.

## Governing workflow

Use:

`LIVE APP + CURRENT DESIGN SYSTEM -> CANVA VISUAL REFERENCE -> REPOSITORY DESIGN CONTRACT -> CODEX IMPLEMENTATION -> BROWSER VISUAL CERTIFICATION`

Canva is a visual exploration, mockup, composition, and asset tool. It does not become the authority for application state, domain behavior, accessibility, responsive behavior, persistence, RBAC, financial semantics, history, security, or React architecture.

Codex remains the implementation owner.

## Why this stage exists

Recent UI work has improved hierarchy and consistency, but implementation-only redesign can still spend model time exploring visual direction while editing production code. A bounded visual reference should reduce that ambiguity.

The target is not to mock every screen. The target is to establish a small number of representative visual exemplars that are strong enough to guide later implementation consistently.

## VIS-CANVA-1 — next bounded phase

VIS-CANVA-1 is a design/reference phase. It must not perform broad React UI rewrites.

Use the connected Canva account to create or refine a dedicated HydroQualiSense visual-reference design containing three representative families:

1. **Production corporate landing**
   - Hydroqualisense Solutions Corp. remains an engineering company focused on approved water-related services and projects.
   - Preserve the current public-company content contract.
   - Do not invent project names, metrics, certifications, clients, addresses, phone numbers, claims, awards, or capabilities.
   - Where verified company content is still missing, use clearly marked layout placeholders rather than fabricated facts.

2. **QA software showcase landing**
   - Present the engineering-operations software as a neutral QA/demo showcase.
   - Preserve synthetic/non-production disclosure.
   - Do not present Hydroqualisense Solutions Corp. as the software vendor.
   - Do not select or invent the permanent creator/vendor brand.

3. **Authenticated operations exemplar**
   - Use the Supplier Invoice review workflow as the primary in-app exemplar because it combines source evidence, editable structured data, verification state, and worksheet behavior.
   - Preserve the intended source-aware side-by-side review pattern.
   - Show clear single-click/tap editability cues for safe worksheet cells.
   - Keep normal protected/read-only state visually quiet and exception state prominent.
   - Consequential verification/posting/payment/lifecycle actions remain explicit controls outside ordinary cell editing.

The same Canva design may include a lightweight **Operations Workbook visual reference page** for later WB-1 planning, but VIS-CANVA-1 must not implement the workbook or expand its domain coverage.

## Required design outputs

The phase should produce:

- one durable Canva design or clearly linked set of designs;
- desktop and mobile/constrained-width concepts for both landing audiences;
- a desktop/constrained-laptop authenticated Supplier Invoice exemplar;
- an optional workbook shell reference page;
- a concise repository-backed visual contract that records:
  - page hierarchy;
  - spacing/density principles;
  - navigation and CTA hierarchy;
  - card/surface treatment;
  - worksheet/grid treatment;
  - source/evidence placement;
  - image direction;
  - responsive intent;
  - accessibility requirements;
  - what is reusable across public and authenticated surfaces;
  - what must remain audience-specific;
- sanitized exported previews/screenshots where technically practical and appropriate for repository evidence.

If exact font names, colors, element measurements, or other style attributes are not reliably exposed by the Canva tooling, do not invent them. Treat the rendered visual plus existing repository design tokens as the source for implementation translation.

## Canva safety and content rules

- Never upload real customer invoices, payroll data, credentials, financial records, employee data, or other client-sensitive material to Canva.
- Use repository-safe synthetic/demo content only.
- Do not weaken the production/QA brand separation.
- Do not introduce unverified marketing claims.
- Do not make stock/Premium assets a hidden runtime dependency. Only ship assets that can be exported and used appropriately in the application.
- Do not use Canva-generated application code as architecture authority.
- Do not redesign domain meaning merely to match a mockup.
- Preserve keyboard/touch accessibility, readable contrast, responsive behavior, and reduced-motion expectations in the eventual implementation.

## Follow-on implementation sequence

After VIS-CANVA-1 is reviewed and its design contract is stable, prefer this order:

### LANDING-VIS-1 — public landing implementation

Implement the approved visual direction for:

- the Hydroqualisense Solutions Corp. production company landing; and
- the neutral QA software-showcase landing.

Keep current routing, SEO/noindex rules, audience separation, and content-truth boundaries. This can be one bounded public-UI phase if the two surfaces still share implementation primitives without conflating their identities.

### UX-EDIT-1A — direct worksheet editing + Supplier Invoice review

Activate the highest-value part of the already-planned UX-EDIT-1 direction:

- single-click/tap entry into safe editable cells;
- clear editable-cell cues;
- predictable keyboard navigation;
- quiet protected/read-only cells;
- source-aware side-by-side Supplier Invoice review;
- responsive laptop/tablet behavior.

This is usability hardening, not a financial-authority or lifecycle rewrite.

### WB-1 — Operations Workbook shell

Only after the editing grammar is stable, implement the unified workbook shell/metadata/navigation foundation from the existing workbook roadmap. Use the Canva workbook reference as a visual guide, not as a persistence contract.

### VIS-CERT — representative visual certification

For each implementation slice:

- capture representative browser screenshots at the applicable desktop, constrained-laptop, tablet, and phone widths;
- compare them against the approved visual contract;
- inspect the screenshots visually rather than treating no-overflow automation as a visual-quality pass;
- run accessibility/responsive checks appropriate to the changed surfaces;
- record only durable, sanitized evidence.

## Scope control

VIS-CANVA-1 must not become:

- an app-wide implementation rewrite;
- a database or migration phase;
- a new financial/workflow authority phase;
- a new customer-facing domain;
- a creator/vendor rebrand;
- a broad content-writing exercise;
- an excuse to redesign every page before validating a representative exemplar.

The best use of Canva here is to remove visual ambiguity before code changes, not to expand scope.

## Validation and execution policy

For VIS-CANVA-1 itself:

- default to zero subagents;
- use at most one bounded `agent:context` packet if useful;
- no baseline full suite;
- no Docker/Supabase unless the actual phase unexpectedly changes database-relevant code, which this design-only phase should not do;
- no broad protected browser run merely for documentation/Canva changes;
- inspect the final repository diff exactly;
- update roadmap/handoff with the Canva design reference and next implementation boundary;
- push a feature branch and open a PR;
- Codex must not merge its own PR.

Later implementation phases return to the normal focused -> affected -> relevant browser/build validation ladder.
