# UI-R4A — Comparative Visual Research

Status: **COMPLETE — RESEARCH / DESIGN EVIDENCE ONLY**  
Date: **2026-09-22**  
Repository: `Juvialski/InvoiceApp`  
Starting `main`: `8215dd632fbb33def0485fd92988000e659cea98`  
Implementation boundary: **No R4B product UI implementation in this phase**

## 1. Purpose

UI-R4A establishes a visual and interaction direction for UI Improvement Round 4 before implementation starts.

The user specifically asked that the research not be based only on descriptions or generic UI advice. This phase therefore used **direct visual observation of public product screenshots / rendered help examples** in addition to current product documentation. The research is pattern-oriented: it does not copy proprietary branding, assets, or exact layouts.

The target is a professional enterprise operations UI that feels deliberate rather than generated from repeated generic cards.

The governing design principle is:

> **Make the next useful action obvious, keep high-value context visible, and move detailed analysis or secondary controls one level deeper.**

## 2. Evidence boundary

### HydroQualiSense

This phase used:

- current `main` source inspection at `8215dd632fbb33def0485fd92988000e659cea98`;
- the immediately preceding UX-S3E visual certification, which covered 36 routes across desktop, constrained laptop, tablet, and phone with 131 screenshots;
- the UX-S3A comparative / instruction-density audit;
- current shared shell, Dashboard route, Projects page, Astryx theme source, and global CSS.

The S3E product UI was already visually certified immediately before this phase. The R4A source inspection confirms that the current merge contains no new production UI rewrite after that certification; R4A therefore builds on that exact recent four-viewport visual baseline instead of repeating 131 screenshots without a design question.

### External research

Research was read-only. No external accounts or records were modified.

The visual pass directly inspected public screenshots / rendered examples for:

- Procore;
- Autodesk Construction Cloud / Autodesk Build;
- Buildertrend;
- Fieldwire;
- Raken;
- Linear;
- Airtable.

Official/help sources were used where available to verify what the observed controls or cards do.

## 3. Visual observations

### 3.1 Procore — project overview / operational landing

Sources:

- https://support.procore.com/products/online/user-guide/project-level/project-overview/tutorials/about-the-project-overview
- https://support.procore.com/products/online/user-guide/project-level/project-overview
- public Procore platform screenshot showing project timeline, open items, and insights.

Observed visually:

- strong project identity appears before detail;
- the landing surface emphasizes **open items, risks, timeline / current state, and direct action**;
- cards are modular but not every piece of information is boxed independently;
- dense lists live inside purposeful regions instead of the entire page being a wall of KPI cards;
- important creation / action affordances are visually separated from analysis;
- permission differences affect what users see.

Transferable principle:

**A home or project overview should orient the user and surface current action, while deeper analytics remain available without dominating the first viewport.**

Do not copy:

- Procore branding;
- customizable drag/reorder dashboard behavior in R4;
- weather or timeline widgets where HydroQualiSense has no clear operational need.

### 3.2 Autodesk Construction Cloud / Autodesk Build — modular Project Home

Sources:

- Autodesk University visual example of Project Home:
  https://static.au-uw2-prd.autodesk.com/Class_Presentation_CS502585_ClassPresentation-CS502585-Yang-AU2022.pdf
- Autodesk Build documentation / release material describing Project Home cards.

Observed visually:

- the page uses a **small set of calm, differently sized modules** rather than equal generic rectangles everywhere;
- project progress, quick links, work status, recent activity, and supporting context have distinct visual weight;
- “Welcome” / project orientation is simple and the useful cards begin quickly;
- quick links function as a launchpad without pretending to be analytics;
- analytics dashboards remain a separate concept from Project Home.

Transferable principle:

**Use composition and hierarchy, not more boxes, to distinguish navigation, current attention, and secondary context.**

### 3.3 Buildertrend — Jobs List and task surfaces

Sources:

- https://buildertrend.com/help-article/job-management/
- https://buildertrend.com/help-article/tasks-overview/
- https://buildertrend.com/help-article/job-costing-budget-overview/

Observed visually / in rendered examples:

- Jobs are treated as the primary organizing object;
- project/job identity is prominent and filtering/sorting supports fast retrieval;
- overview lists expose only key data while detailed cost information is available after drill-in;
- the new Tasks surface favors inline work and expandable detail instead of forcing every property into the default row;
- advanced detail is progressively disclosed.

Transferable principle:

**The default project surface should answer “which project do I need?” quickly; maintenance and detailed financial analysis should not crowd the same first view.**

### 3.4 Fieldwire — visual project selection

Sources:

- https://help.fieldwire.com/hc/en-us/articles/4402979114395-How-to-Create-a-Project-and-Use-the-Project-Dashboard-on-Web

Observed visually:

- projects use recognizable **thumbnail-led tiles**;
- title/identity remains dominant;
- favorite/star and overflow controls stay small and peripheral;
- filters are opened from a compact control rather than occupying a permanent multi-row card;
- sorting and filtering organize the dashboard without competing with the projects themselves.

Transferable principle:

**Project cards can become more recognizable through media, status, and restrained metadata, while rare actions move to overflow.**

HydroQualiSense qualification:

R4C should improve card composition without inventing a new “favorite” product feature. Real project imagery belongs to R4D after storage/RLS design; R4C must use a clean deterministic fallback.

### 3.5 Raken — activity-first home, analytics deeper

Sources:

- https://help.rakenapp.com/en/articles/14465496-how-to-use-the-raken-dashboard
- https://www.rakenapp.com/features/production-insights

Observed visually:

- the dashboard distinguishes Activity, Reports, Insights, and Live Views;
- Activity is the default home-like view;
- filters are scoped to the current section;
- card/table switching is used where it materially changes scanning;
- analytic charts are visually concentrated in an Insights surface rather than mixed into every home module;
- mobile intentionally exposes a reduced subset instead of compressing the full desktop dashboard.

Transferable principle:

**Do not shrink a desktop analytics warehouse onto mobile. Give mobile the subset that supports immediate work.**

### 3.6 Linear — dark theme and control restraint

Sources:

- https://linear.app/docs/account-preferences
- https://linear.app/docs/filters
- public Linear dark-interface screenshots.

Observed visually:

- dark mode uses layered charcoal/slate surfaces rather than pure black everywhere;
- hierarchy relies on typography, subtle border/elevation, selection states, and spacing rather than many colorful cards;
- filters are compact controls that open a menu and then summarize applied state;
- secondary actions remain visually quiet;
- status color is semantic, not decorative.

Transferable principle:

**Dark mode should be a coherent surface system, not an inversion pass. Dense enterprise information can remain calm when controls and color are restrained.**

### 3.7 Airtable — task-specific interfaces

Source:

- https://support.airtable.com/articles/8078126534-getting-started-with-airtable-interface-designer

Observed visually:

- search, sort, filter, grouping, and create actions are configurable around the current work;
- the interface concept explicitly avoids exposing all underlying data to every user;
- record manipulation can be separated from a simplified audience-facing interface.

Transferable principle:

**Expose controls that serve the current task. Availability of data is not a reason to show all of it at once.**

### 3.8 Accessibility reference

Sources:

- https://www.w3.org/TR/wcag/
- https://www.w3.org/WAI/WCAG22/Understanding/focus-visible

Relevant requirements / guidance:

- UI component and state boundaries need sufficient non-text contrast;
- keyboard focus must remain visible;
- custom focus treatment should be clearly distinguishable;
- information must not depend on color alone.

R4 must retain the keyboard/focus behavior already established by S3E while changing visual treatment.

## 4. Cross-product findings

The strongest repeated patterns are:

1. **Home is orientation, attention, and launch—not the entire reporting system.**
2. **Projects/jobs are recognizable objects**, not merely rows or homogeneous data blocks.
3. **Rare actions move to overflow**, while the primary action remains obvious.
4. **Filters are compact and contextual**; advanced filters open on demand.
5. **Cards vary by purpose and hierarchy**. Professional products do not make every section the same white rectangle with identical padding.
6. **Detailed analytics have a dedicated surface or mode.**
7. **Mobile is intentionally reduced**, not just a narrower desktop page.
8. **Dark mode uses semantic surface tokens**, subdued borders, and restrained status color.
9. **Images are useful when they improve recognition**, especially projects/assets; they are not decorative filler.
10. **Permission-aware content is normal** in enterprise tools and should be reflected in the launchpad.

## 5. Current HydroQualiSense visual diagnosis

### R4A-01 — Dashboard is still an analytics surface first

Current source:

- `src/app/routes/DashboardRoute.tsx` delegates to `EngineeringCostOperationsDashboard` whenever project-cost completeness is available.
- `src/App.tsx` maintains Dashboard activity period, custom range, currency, and project filters.

Effect:

The Home route behaves as a full cross-domain analytics dashboard. That explains the user's “too much information / overflow” feedback even after earlier density corrections.

Direction:

Keep the current analytics capability, but move it to a secondary **Operations Insights** surface during R4C. Home becomes a launchpad + attention surface.

### R4A-02 — Projects improved structurally but still look generic

Current source:

- Projects are card-first after UX-W2;
- the optional Excel import/export disclosure and portfolio support remain on the same long page;
- many surfaces still use generic border + white background containers.

Direction:

Refine card anatomy, make identity/media region visually distinctive, reduce visible metadata, keep financial truth limited to a small intentional metric set, and push lifecycle/rare actions to overflow.

### R4A-03 — Filter controls consume too much vertical space

Observed across prior visual evidence and current source:

- search/status/manager/currency/health/attention/sort/view controls can all appear together;
- these controls often sit in card-like containers with generous padding.

Direction:

Introduce one shared **CompactActionBar / FilterBar** pattern with advanced filters behind popover/drawer disclosure.

### R4A-04 — Button hierarchy is inconsistent

Current source combines:

- Astryx `Button`;
- many raw Tailwind buttons;
- domain-specific colored actions;
- one-off padding, type size, border, and radius choices.

Direction:

R4B must standardize primary / secondary / ghost / destructive / icon-only patterns before R4C consumes them.

### R4A-05 — Dark-theme tokens already exist, but the app forces light presentation

Current source:

- `src/ui/hydroqualisenseTheme.ts` already defines paired light/dark semantic tokens for body, surface, card, popover, text, border, statuses, and syntax;
- generated `src/ui/hydroqualisense.css` supports `html[data-theme="light"]`, `html[data-theme="dark"]`, and system-resolved `light-dark(...)`;
- `src/index.css` still forces `:root { color-scheme: light; }`, hard-coded light body/background values, and the app contains many `bg-white` / slate-only classes.

Direction:

Do **not** invent a second theme. R4B should activate the existing Astryx paired token system and migrate shared surfaces away from hard-coded light classes.

### R4A-06 — Images have no coherent entity-media contract yet

Direction:

R4C may design cards that are ready for imagery but must use deterministic non-media fallbacks. R4D separately introduces project/equipment/material media storage, security, metadata, upload, and display.

## 6. What “professional” means for Round 4

Round 4 should optimize for:

- **calm operational density** — enough context to act, not all context at once;
- **clear hierarchy** — page identity, current state, primary action, then supporting detail;
- **consistent interaction grammar** — buttons, filters, overflow, view toggles, dialogs;
- **recognizable entities** — project/equipment/material surfaces visually communicate what object the user is looking at;
- **financial truth over decoration** — incomplete or permission-limited data stays truthful;
- **responsive intent** — phone/laptop layouts are deliberately composed;
- **light/dark parity** — both themes look designed, not merely functional;
- **visual verification** — screenshot inspection is required, not just automated overflow PASS.

## 7. Anti-patterns explicitly rejected

R4 must not:

- place every available KPI on Home;
- show seven equal metric cards merely because seven metrics exist;
- use a permanent multi-row “filters card” when controls can be compact;
- add colors to make buttons “more interesting”;
- make all content a raised card;
- use photos as decorative wallpaper;
- add new user preference/product features solely because a comparator has them;
- make project cards carry the entire project financial model;
- hide task-critical warnings behind hover;
- weaken project-cost completeness, permissions, lifecycle, provenance, financial, or concurrency semantics;
- create a second competing component library;
- claim professional quality from tests alone without visual inspection.

## 8. Research conclusion

The user's requested direction is supported by the observed products, but the appropriate HydroQualiSense result is not a copy of any one of them.

The recommended visual identity is:

**construction/engineering clarity from Procore/Autodesk/Buildertrend + visual project recognition from Fieldwire + activity-first prioritization from Raken + control/theme restraint from Linear + task-specific disclosure from Airtable.**

The implementation contract is recorded in:

`docs/superpowers/specs/2026-09-22-ui-r4-professional-design-blueprint.md`.

UI-R4A makes no product/runtime/database change. UI-R4B is the next implementation phase.
