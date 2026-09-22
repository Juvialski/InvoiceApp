# HydroQualiSense UI Improvement Round 4 — Professional Design Blueprint

Status: **APPROVED BY UI-R4A RESEARCH — R4B READY, NOT IMPLEMENTED**  
Date: **2026-09-22**  
Repository baseline: `8215dd632fbb33def0485fd92988000e659cea98`

Related evidence:

- `artifacts/ui-ux-audit/UI-R4A-COMPARATIVE-VISUAL-RESEARCH.md`
- `artifacts/ui-ux-audit/UX-S3E-ACCESSIBILITY-RESPONSIVE-VISUAL-CERTIFICATION.md`
- `artifacts/ui-ux-audit/UX-S3A-RESEARCH-AND-INSTRUCTION-DENSITY-AUDIT.md`
- `docs/superpowers/specs/2026-09-21-ui-simplification-contextual-help-research.md`

## 1. Round 4 objective

Round 4 is a visual-system and information-hierarchy improvement for existing HydroQualiSense capability.

It is not a feature-expansion program.

The outcome should look intentionally designed for an engineering / construction operations company: calm, trustworthy, efficient, data-aware, and suitable for repeated daily use.

The design principle is:

> **Show orientation, attention, and the next useful action first. Reveal analysis and advanced controls when the user asks for them.**

## 2. Visual quality rule for all Round 4 agents

Automated tests, accessibility trees, and “no overflow” checks are necessary but **not sufficient evidence of professional visual quality**.

Every implementation phase in R4B-R4E must include a visual loop:

1. inspect the current rendered state before changing it;
2. inspect at least one relevant external visual reference from the R4A evidence when the design pattern is being applied;
3. implement the bounded change;
4. capture the changed HydroQualiSense surface at the applicable standard viewports;
5. have the lead agent **actually inspect the screenshots** for hierarchy, spacing, density, alignment, consistency, theme quality, and accidental generic-card repetition;
6. correct visible problems before delivery;
7. record what was visually inspected.

Do not use a browser agent, Jev, screenshot script, or visual regression tool as a success oracle. The lead remains responsible for the visual interpretation.

Standard viewport set remains:

- desktop: 1440-class;
- constrained laptop: 1280-class;
- tablet: 768-class;
- phone: 390-class.

A phase may use fewer viewports while iterating, but its final affected visual surface must be checked at every viewport materially affected by that phase.

## 3. Product-wide visual language

### 3.1 Character

HydroQualiSense should feel:

- operational rather than promotional;
- modern but not trendy;
- visually calm even when the data is complex;
- field-usable on a laptop or tablet;
- compact without returning to micro-type;
- consistent across financial, project, inventory, and document workflows.

### 3.2 Surface hierarchy

Use four semantic surface levels rather than putting every block in an independent white card:

1. **Canvas** — application/body background.
2. **Primary surface** — the main working region.
3. **Raised/supporting surface** — cards, popovers, compact summaries.
4. **Exceptional surface** — warning/error/success/conflict states only.

Borders, spacing, typography, and subtle elevation should do most of the hierarchy work. Status color is reserved for meaning.

### 3.3 Density

Keep the existing 14px Astryx body base. Do not shrink important labels back to 9-10px just to fit more controls.

Normal page composition:

- compact page title row;
- optional one-sentence supporting copy only when useful;
- primary work / launch controls immediately after;
- supporting analytics or utilities later or behind disclosure.

### 3.4 Shape and elevation

Continue the existing Astryx radius system:

- controls: element radius;
- normal containers/cards: container radius;
- only large hero/landing regions use page radius.

Avoid excessive shadow. Prefer border + low elevation for normal cards and stronger elevation only for popovers/dialogs.

## 4. Theme architecture — R4B contract

### 4.1 Existing source of truth

Do not build another color system.

`src/ui/hydroqualisenseTheme.ts` already contains paired Light/Dark tokens for:

- body;
- surface/card/popover;
- muted surface;
- primary/secondary/disabled/accent text;
- border/emphasized border;
- semantic status;
- semantic category surfaces;
- syntax;
- shadow/overlay.

The generated `src/ui/hydroqualisense.css` already uses `light-dark()` and recognizes explicit `data-theme="light"` and `data-theme="dark"`.

### 4.2 Preference model

Implement exactly three user-facing choices:

- **System** — default;
- **Light**;
- **Dark**.

Recommended mechanics:

- persist the preference locally;
- for System, allow the generated `light-dark()` tokens to follow the OS color scheme instead of forcing a light/dark attribute;
- for explicit Light/Dark, set the matching `data-theme` on `html`;
- establish the theme before the main app paint to avoid a visible light-to-dark flash;
- expose the control in Settings and, if practical without duplication, a compact account-menu shortcut.

No company/database setting is needed for R4B.

### 4.3 Migration rule

Shared primitives and shell surfaces move first.

Replace hard-coded light-only treatment such as:

- `bg-white`;
- `bg-slate-50`;
- `text-slate-950`;
- `border-slate-200`;

with semantic theme-backed styles/components where the usage is structural rather than intentionally semantic.

Do not mechanically replace meaningful warning/success/error colors with neutral theme tokens.

Prefer Astryx primitives and a small HydroQualiSense semantic wrapper layer over hundreds of one-off `dark:` utilities.

### 4.4 Dark-mode appearance

Dark mode should use the existing slate family:

- body near `#0f172a`;
- surfaces near `#1e293b`;
- borders near `#334155`;
- primary text near `#f8fafc`;
- muted text near `#94a3b8`.

Do not use pure black for the full app and do not turn every card into a glowing elevated panel.

### 4.5 Theme acceptance criteria

R4B is not complete until:

- System/Light/Dark persistence works;
- no initial theme flash is visible in the normal app entry path;
- shell, page canvas, page headers, shared cards, shared inputs, dialogs/popovers, tables/worksheets, notifications, filter controls, and common buttons are legible in both themes;
- focus and selected states remain visible;
- disabled controls remain distinguishable;
- status semantics do not rely on color alone;
- screenshots are visually inspected in both Light and Dark.

## 5. Button / action hierarchy — R4B contract

### 5.1 Shared hierarchy

Use the same meanings everywhere:

**Primary**
- one dominant forward action in a region;
- examples: New project, Save, Apply confirmed changes, Verify and next.

**Secondary**
- normal adjacent alternative;
- examples: Export, Edit details, Preview.

**Ghost / tertiary**
- low-emphasis utility/navigation;
- examples: Cancel, Help, View analytics, More.

**Destructive**
- only for actual destructive/corrective action;
- examples: Delete unused, Deactivate, Void/Reverse when that workflow requires a destructive affordance.

**Icon-only**
- only when the icon is conventional and the accessible label is explicit;
- maintain a useful touch target.

### 5.2 Rules

- Do not color buttons by module.
- Do not show several primary-filled buttons in one toolbar.
- Use overflow menus for rare lifecycle/administrative actions.
- Keep consequential financial/lifecycle actions explicit; moving them to overflow must not make them ambiguous.
- Raw page-specific buttons should progressively migrate to the shared hierarchy when touched by Round 4.

## 6. Compact filter / action bar — R4B contract

The current large filter-card pattern should be replaced with a reusable responsive toolbar.

### Desktop / constrained laptop anatomy

Preferred order:

`[Search________________] [Status] [Health] [Filters (2)] [Sort] [View] ........ [Primary action]`

Rules:

- Search receives the flexible width.
- Show at most the highest-value one or two quick filters inline.
- Put the remaining filters in **Filters**.
- Display an active-filter count.
- Applied advanced filters may appear as a compact removable-chip row only when filters are actually active.
- “Clear all” appears only when there is something to clear.
- Sort and view mode are compact controls, not full cards.
- The primary create action stays visually separate.

Target: one toolbar row at ordinary laptop widths. A controlled second line is acceptable only when active-filter chips are present or the viewport materially requires it.

### Tablet

- search may occupy its own leading width;
- filter/sort/view controls stay in one compact action cluster;
- advanced filters open in a popover or sheet appropriate to available space.

### Phone

Preferred composition:

`[Search________________] [Filter] [Sort]`

Then, only if needed:

`[active chip] [active chip]`

The create action may remain in the page header or a stable compact action position. Do not create a tall filters card.

### Advanced-filter panel

The advanced panel should:

- use logical groups;
- preserve current filter semantics;
- show Apply/Done only if changes are staged; otherwise live filtering is acceptable when consistent;
- support clear/reset;
- be keyboard and touch accessible;
- return focus appropriately.

## 7. Home Dashboard redesign — R4C contract

### 7.1 Home purpose

Home answers:

1. Where am I?
2. What needs my attention?
3. What do I want to do next?
4. Where do I go for deeper analysis?

It does **not** answer every financial/project question on one screen.

### 7.2 Proposed information architecture

#### A. Compact orientation header

Example:

`Good afternoon` or a neutral `Company workspace` when no appropriate display name exists.

Show the active company and a short operational subtitle. Do not fabricate personalization.

#### B. General snapshot

Maximum three or four compact high-confidence indicators, permission-aware.

Good candidates:

- active projects;
- supplier invoices needing review;
- procurement items requiring action;
- another existing high-value count supported by reliable current data.

Avoid putting a large money wall on Home merely because financial data exists.

If an aggregate is incomplete or permission-limited, omit it or label it truthfully rather than presenting zero.

#### C. “Needs your attention”

A bounded queue, normally 3-5 items.

Examples may include existing, permission-safe states such as:

- invoices needing verification;
- procurement approvals / next-stage work;
- payroll normal-cycle item requiring action;
- unresolved cash/reconciliation work;
- document/provider problem already surfaced by the product.

Each row should have:

- clear label;
- compact reason/state;
- optional age/due context when authoritative;
- direct route to the source.

Do not build a new cross-domain workflow engine in R4C. Compose from existing state only.

#### D. “What do you want to do today?”

Permission-aware launch cards for existing destinations.

Candidate set:

- Projects;
- Supplier Invoices;
- Procurement;
- Expenses;
- Payroll;
- Cash & Banking;
- Warehouse / Equipment where allowed;
- Documents / Email-SMS as appropriate.

Card contents:

- icon;
- concise task label;
- one short supporting phrase;
- optional meaningful count;
- arrow / open affordance.

The launchpad should not repeat the sidebar mechanically. It should emphasize common work and current action.

#### E. Active / recent project entry

Show a small bounded project row/card group when it meaningfully helps navigation.

Do not duplicate the entire Projects portfolio on Home.

#### F. Operations Insights entry

Preserve the existing `EngineeringCostOperationsDashboard` capability as a secondary destination such as **Operations Insights**.

Recommended R4C routing:

- Home remains `/app/dashboard`;
- current analytics moves to a clearly reachable secondary route/mode under the Dashboard/Reports information architecture;
- exact route naming is finalized after inspecting existing route conventions.

The analytics code and financial truth must not be discarded merely because Home becomes simpler.

### 7.3 Incomplete data behavior

Current Dashboard can replace the main experience with a completeness warning.

R4C should instead:

- keep the permission-aware launchpad usable;
- show a compact warning for unavailable cross-domain cost insight;
- withhold only the affected aggregate/insight;
- preserve direct access to permitted source records.

## 8. Project Portfolio redesign — R4C contract

### 8.1 Card goal

A project card should feel like a recognizable project object, not a generic metrics container.

### 8.2 Proposed anatomy

Top/media region:
- R4C: deterministic branded fallback / project monogram / subtle visual field;
- R4D: real project cover image when available;
- status/health stays visible but restrained;
- rare actions use a top-right overflow control.

Identity region:
- **Project name is the strongest text**;
- code is secondary;
- client or location is one supporting line;
- project manager is shown only when useful and space permits.

Financial/context region:
- maximum 2-3 key values in the default card;
- preserve distinct labels and authoritative values;
- never merge Actual and Committed or show incomplete values as zero;
- detailed financial controls remain in the project workspace.

Bottom region:
- compact attention/status cue;
- whole primary card region opens the project;
- authorized **Edit details** remains a secondary action when needed.

### 8.3 Grid

Guideline, not a hard-coded count:

- wide desktop: usually 3 columns;
- constrained laptop: usually 2-3 depending on sidebar;
- tablet: 2;
- phone: 1.

Avoid cards becoming excessively tall. Metadata should truncate/wrap deliberately.

### 8.4 Compact List

Retain the existing Compact List for high-volume scanning.

Cards and list must consume the same filtered/sorted source state.

## 9. Media foundation — R4D contract

R4D is intentionally separate because real image support introduces storage, metadata, permissions, and potentially database/RLS changes.

### 9.1 Entities in scope

- project cover/profile image;
- equipment image;
- material image.

Worker/person imagery remains a future design extension only; do not resume Worker Registration or face-recognition work.

### 9.2 Visual behavior

Project:
- cover/thumbnail optimized for recognition;
- stable aspect ratio;
- fallback stays polished when no image exists.

Equipment:
- image supports physical identification;
- thumbnail in browse surfaces;
- larger preview in details.

Material:
- optional image where visual identification adds value;
- image must not displace item name/spec/unit/location data.

### 9.3 Data/security direction

R4D must inspect the existing Supabase/storage architecture before finalizing schema.

Preferred properties:

- company-bound ownership;
- explicit entity binding;
- content type / size validation;
- safe storage path;
- alt/description metadata where useful;
- no public cross-company URL assumptions;
- lifecycle/cleanup behavior;
- deterministic fallback when access fails.

Do not add ad-hoc unrestricted URL fields independently to Project, Equipment, and Material just to make screenshots look better.

If R4D changes migrations, RLS, storage policies, triggers, or DB authority, run the required real local Supabase/Docker validation.

## 10. Responsive composition

### Desktop

- use horizontal space for the task, not for more simultaneous explanation;
- keep data-heavy worksheets/registers wide when required;
- dashboard/home can use an intentional 12-column-style composition without making every region equal.

### Constrained laptop

This is a first-class target.

- filter/action controls must not consume two permanent rows by default;
- no narrow centered editor for wide structured data;
- sidebar collapse should materially increase working space;
- first useful content should remain visible without excessive scrolling.

### Tablet

- prefer two-column card groups where comfortable;
- advanced filter panels can become sheets/drawers;
- worksheets may use the existing responsive editing fallback rather than compressing all columns.

### Phone

- prioritize attention and immediate navigation;
- one-column cards;
- compact search/filter/sort;
- hide or defer secondary analytics;
- preserve explicit consequential actions and dialog action bars;
- never depend on hover.

## 11. Page/header standard

Round 4 page headers should normally include:

- optional eyebrow only when it adds orientation;
- page title;
- at most one compact description;
- one primary action;
- Help and secondary actions visually quiet.

Avoid:

- centered titles for ordinary operations pages;
- long subtitles that explain the whole domain;
- multiple action rows before content;
- summary cards above every page by default.

Alignment remains left-oriented for ordinary work pages.

## 12. Visual composition rules

### Use cards for

- selectable/recognizable entities;
- bounded summary/attention modules;
- meaningful grouped content;
- navigation launch items.

### Do not use cards merely for

- every filter;
- every metric;
- every label/value pair;
- every section heading;
- every line of explanatory copy.

### Use color for

- selected/focus state;
- status/health/attention;
- primary brand action;
- exceptional state.

### Do not use color for

- arbitrary module differentiation;
- making a page “less boring”;
- replacing text/icon state.

## 13. Round 4 phase boundaries

### UI-R4A — Research + design blueprint — COMPLETE

Deliverables:

- direct visual comparator research;
- current-state diagnosis;
- professional design principles;
- theme/button/filter/dashboard/project/media contracts;
- implementation boundaries;
- roadmap/handoff update.

No runtime UI implementation.

### UI-R4B — Theme + shared controls — NEXT

Implement only:

- System/Light/Dark infrastructure;
- semantic shared surface migration required to make them work;
- shared button hierarchy;
- compact filter/action bar + advanced-filter disclosure primitives;
- first bounded consumer integration needed to prove the primitives.

Do not redesign Home/Projects yet except the minimum integration necessary to prove shared controls.

Validation:

- focused component/state tests;
- affected tests;
- lint/build;
- targeted browser screenshots;
- Light/Dark visual inspection at applicable viewports;
- no Docker unless a DB change is unexpectedly introduced, which should normally be avoided.

### UI-R4C — Home + Project Portfolio

Implement:

- simplified Home;
- permission-aware task launchpad;
- bounded attention layer;
- secondary Operations Insights destination preserving current analytics;
- refined Project cards;
- compact project filters using R4B primitives;
- responsive composition.

No image-storage migration yet.

### UI-R4D — Entity media foundation

Implement:

- project/equipment/material media model and UX;
- secure storage/metadata;
- upload/replace/remove;
- thumbnails/fallbacks;
- relevant DB/RLS/storage validation.

### UI-R4E — App-wide rollout + certification

Apply shared theme/control grammar to remaining existing surfaces and certify:

- Light;
- Dark;
- System;
- desktop;
- constrained laptop;
- tablet;
- phone;
- keyboard/focus/touch;
- no visual P0/P1 blockers on the recorded scope.

## 14. R4B implementation priority order

To prevent R4B from becoming an uncontrolled app-wide rewrite:

1. theme preference/bootstrap;
2. semantic canvas/surface primitives;
3. Button/action hierarchy;
4. CompactActionBar / FilterBar primitive;
5. advanced filter popover/sheet;
6. migrate the shell and a bounded proving set;
7. inspect Light/Dark screenshots;
8. correct shared-root problems;
9. stop.

Do not use spare time to start Dashboard or Project-card redesign. Those are R4C.

## 15. Acceptance criteria for professional quality

Round 4 is successful only if the final product demonstrates all of the following:

- Home is understandable in the first viewport without reading an analytics wall.
- Common destinations are visible as a task-oriented launchpad.
- Current attention is clearer than background statistics.
- Projects are visually identifiable and names dominate.
- Filters no longer occupy large permanent card regions on normal pages.
- Button meanings look consistent across domains.
- rare actions are quieter than primary work.
- Light and Dark both look deliberately designed.
- status and focus remain accessible.
- media improves identification rather than acting as decoration.
- laptop layouts use horizontal space effectively.
- phone layouts show the most useful subset rather than compressing everything.
- financial/security/lifecycle truth remains unchanged.
- the lead agent visually reviewed the actual screenshots rather than relying only on automated PASS results.

## 16. Explicit non-goals

Round 4 does not authorize:

- Worker Registration;
- Site Attendance expansion;
- Face Recognition;
- Finance UX-W6 feature expansion;
- arbitrary custom fields;
- dashboard widget customization/product personalization;
- project favorites unless separately designed later;
- a new CMS;
- replacement of Astryx with another full component library;
- broad database changes before R4D;
- removal of audit/history/provenance/permission safeguards.


## 17. 2026-09-23 field correction — Dark mode contrast is a release blocker

A deployed-user review after R4B found that Dark mode is **not professionally usable app-wide yet**. On multiple remaining legacy surfaces, the background becomes dark while text, borders, muted labels, controls, and semantic states continue to use light-theme assumptions. The result is low contrast and inconsistent hierarchy.

This is now a binding Round 4 requirement, not optional polish.

### R4C requirement for touched surfaces

R4C remains **Home Dashboard + Project Portfolio**. It must not expand into an app-wide theme rewrite, but every surface it changes must be visually complete in Light and Dark:

- Home / Dashboard;
- Operations Insights entry and any changed analytics framing;
- Project Portfolio cards/list/filter controls;
- shared shell/header primitives only where R4C changes them.

For those touched surfaces, merely changing the canvas/background is insufficient. Text, secondary text, icons, borders, controls, selected/focus states, status surfaces, empty/loading/error states, tooltips/popovers, charts/legends where shown, and disabled states must all use semantic theme tokens and remain readable.

### R4E app-wide contrast remediation

R4E is the authoritative app-wide cleanup and certification phase. It must explicitly include **Dark-mode contrast remediation**, not only theme propagation.

R4E must:

1. inventory hard-coded light-theme text/background/border/control assumptions on every remaining existing route;
2. migrate structural styling to the existing Astryx/HydroQualiSense semantic theme layer rather than piling on page-specific `dark:` overrides;
3. verify ordinary body text and important labels against WCAG AA contrast expectations (normally 4.5:1 for regular text, 3:1 for large text);
4. verify non-text UI boundaries, focus indicators, selected states, input borders, meaningful icons, and actionable controls remain distinguishable (target 3:1 where WCAG non-text contrast applies);
5. preserve semantic warning/success/error meaning without producing unreadable colored text on dark fills;
6. check disabled and placeholder text for intentional hierarchy without making them illegible;
7. inspect real screenshots in Light and Dark at desktop, constrained laptop, tablet, and phone for the affected routes;
8. treat low-contrast text or controls that materially impair use as a **P1 visual blocker** for Round 4 certification.

Automated "no overflow", DOM, route, and screenshot-capture PASS results are not sufficient. The lead must visually inspect actual Dark screenshots.

### Explicit anti-pattern

Do **not** represent Dark mode as complete when only the page canvas or card background changes.

A valid Dark-mode migration requires coordinated semantic foreground, background, border, control, focus, and status treatment. Light-mode Tailwind assumptions such as `text-slate-900`, `text-slate-700`, `bg-white`, `bg-slate-50`, and `border-slate-200` must not remain as structural defaults on a dark surface unless intentionally mapped through the semantic theme layer.

This clarification does not change the approved sequence:

`R4C Home + Project Portfolio -> R4D entity media -> R4E app-wide rollout + contrast/accessibility certification`.
