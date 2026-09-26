# VIS-CANVA-1 — Visual Direction

Status: **COMPLETE — Canva reference created and inspected**

Date: **2026-09-26**

Synchronized base SHA: `3ef522b8398a7931d1d293fe016dff7f8552dd3b`

Canva reference: [VIS-CANVA-1 — HydroQualiSense Visual Blueprint](https://www.canva.com/d/XGTcgfzuO_yZHV5)

Canva design ID: `DAHWSiZsn1Y`

Canva page count: **7**

This is a visual reference contract for later bounded implementation. It does
not change application behavior, permissions, workflow authority, data models,
or responsive implementation requirements. Canva is a design layer; the live
repository and its domain contracts remain authoritative.

## Reference scope

The approved Canva deck covers:

1. Production Hydroqualisense Solutions Corp. landing, desktop and mobile.
2. Neutral QA software showcase, desktop and mobile.
3. Authenticated Supplier Invoice source review, wide and constrained-laptop.
4. One optional Operations Workbook shell reference for future WB-1.

The two public sites serve different audiences. They may share clarity and
craft, but the QA showcase must not imply that Hydroqualisense Solutions Corp.
is the software vendor. Permanent software creator/vendor branding remains
unselected.

## Visual contract

### Production company website

Use the approved company name and current public-company identity. The live
source uses a warm, light canvas (`#fbfcfa`), deep blue-green text (`#152b32`,
`#112f3a`), restrained water-green accents (`#4caaa4`, `#54a9a4`), and abstract
engineering linework (`#0a2638`, `#0d5360`, `#137378`). The Canva concept uses
an abstract water-systems illustration rather than an unapproved facility
photo. Its wordmark is text-only; later implementation should use the existing
approved asset at `public/brand/hydroqualisense-logo.png`, not invent a new
mark.

Use only these confirmed service labels and company description:

- Water treatment
- Water management
- Related engineering projects
- “An engineering company focused on water treatment, water management, and
  related engineering projects.”

Keep the hero and project inquiry focused on the water-related project need.
The current “Discuss a project” action remains the primary inquiry path. The
site has no approved public project references or photos, and its public email,
telephone, and location are unset. Show explicit pending-approval placeholders
for portfolio, company-profile/credibility, project photography, and contact
details. Abstract illustrations may set a water-engineering mood but must not
look like a claimed client facility or completed project.

On mobile, stack the hero, services, project placeholder, company information,
contact action, and footer. Keep the primary inquiry action easy to reach and
the full company identity readable.

### QA software showcase

Use the neutral descriptor **Engineering Operations Platform** and the
**QA Software Showcase** label. Keep the visible synthetic/non-production
disclosure near the first view. The showcase must remain distinct from the
production company site: do not use the company logo, company marketing copy,
or a permanent software-vendor identity.

The capability labels are grounded in `QA_SOFTWARE_SHOWCASE` in
`src/config/publicBranding.ts`:

- Project operations
- Procurement
- Supplier invoices and expenses
- Financial workflows
- Documents and history
- Workforce and operations

Use the existing dark navy (`#071a27`) and blue-green preview surface
(`#102e3a`) with cyan controls. Present the synthetic interface as a product
preview, not production-company evidence. Keep **Open demo** primary and
**Sign in to QA workspace** secondary.

On mobile, keep the disclosure before the preview, stack capability content,
and preserve clear demo/login actions without horizontal scrolling.

### Authenticated Supplier Invoice review

Use the existing application worksheet tokens and typography in
`src/ui/hydroqualisenseTheme.ts` as implementation authority. Current source
values include Inter for application text, white/light-slate surfaces
(`#ffffff`, `#f8fafc`), primary text `#0f172a`, accent `#4f46e5`, and border
`#e2e8f0`. The application also defines distinct success (`#059669`), warning
(`#d97706`), and error (`#e11d48`) colors. Canva-rendered values are not
replacements for these tokens.

The target visual returns to a source-aware, side-by-side comparison:

`original invoice evidence | extracted and permitted editable fields`

Keep the source document visibly available beside the worksheet at wide desktop
and constrained-laptop sizes. Preserve the synthetic marking on every sample
invoice value; use placeholders such as `[Synthetic vendor]`, `[Sample invoice
number]`, `[Sample date]`, and `[Sample amount]`. Never upload a real invoice or
financial record.

The reference shows a single-click/tap editing cue beside the extracted
worksheet title and sample unresolved, conflict, and validation states above
the worksheet. Show editable cells with a clear keyboard-focus cue. Keep
ordinary source-evidence, calculated, and protected states visually quiet;
make unresolved, validation, duplicate, and conflict states easy to find. A
protected value must remain non-editable regardless of its appearance.

Keep the actions distinct:

1. **Save worksheet edits** saves the permitted draft edits.
2. **Review** surfaces blocking facts and exceptions that need attention.
3. **Verify & Create Expense** remains an explicit consequential workflow action
   outside ordinary cell editing.

For a constrained laptop, tighten panel spacing and keep both source and
worksheet panes visible. If a future width cannot support both panels legibly,
provide a deliberate way to switch between them; do not discard source access
or hide blocking state.

### Optional Operations Workbook reference

The single workbook page is a visual reference only: white worksheet canvas,
compact toolbar, sheet tabs, restrained editable-cell cues, and quiet
protected/calculated values. It does not define new schema, persistence,
permissions, or domain authority and does not authorize WB-1 implementation.

## Implementation translation

Use existing repository tokens, route semantics, verified public copy,
permissions, worksheet behavior, and source evidence as the implementation
authority. Record visual principles where Canva does not reliably expose exact
font names or element measurements. Do not infer accessibility, responsive
behavior, lifecycle rules, or product truth from a static mockup.

The eventual browser implementation must retain keyboard/touch access,
readable contrast, responsive behavior, permission checks, source provenance,
validation, concurrency, lifecycle controls, and human confirmation. A Canva
preview is not browser, accessibility, hosted, database, provider, or production
certification.

## Canva artifact and inspection

The seven-page presentation contains a shared visual compass, desktop/mobile
company concepts, desktop/mobile QA showcase concepts, wide/constrained-laptop
invoice review, and one optional workbook-shell reference. The lead visually
inspected the saved page previews and checked their editable text after the
design was saved. Unsupported generated company claims and contact details were
replaced with approved copy or explicit pending placeholders. Invoice names and
amounts were replaced with synthetic placeholders.

Canva returns temporary signed thumbnail URLs rather than a durable export
through the connected tool. No local preview image was added; the Canva view
link above is the durable visual reference. The preview slide canvas is
1920×1080; mobile and laptop frames are visual concepts, not tested browser
viewports or responsive certification. Small preview thumbnails do not certify
detail-level text legibility.

The deck uses repository-approved company/software copy and synthetic invoice
placeholders. No customer, payroll, employee, credential, or real financial
data was uploaded.

## Handoff boundary

| Follow-up | Scope after VIS-CANVA-1 review |
| --- | --- |
| `LANDING-VIS-1` | Implement the approved production-company and neutral QA public visual direction while preserving route, SEO/noindex, content-truth, and audience boundaries. |
| `UX-EDIT-1A` | Improve single-click/tap editing cues and implement the source-aware Supplier Invoice review direction without changing financial authority, verification, permissions, or history. |
| `WB-1` | Later implement the planned Operations Workbook schema/shell using the single-page Canva reference only as a visual guide. |

No implementation for these follow-ups is included in VIS-CANVA-1.

## Validation record

Final Canva title, ID, page count, and view link were checked through the Canva
connector. The saved rich-text layer contains all six repository-approved QA
capability labels and explicit invoice exception-state labels. It no longer
contains `Aqua Solutions Ltd.`,
`$747.0`, or a fabricated company contact address; those visible text layers use
synthetic placeholders instead. The generated dashboard and invoice renderings
are QA/synthetic design imagery only. This phase is documentation/design only;
application tests, Docker/Supabase, and broad browser suites are not in scope.
Final repository checks: `git diff --check`, documentation content review, and
exact diff inspection.
