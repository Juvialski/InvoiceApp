# UI Round 4 — Current-State Audit Before R4C

Status: **DOCUMENTATION / AUDIT ONLY — NO RUNTIME IMPLEMENTATION**  
Date: **2026-09-22**  
Repository: `Juvialski/InvoiceApp`  
Audited `main`: `cde16084260749558b1ad4432ff40430a1ef5345`  
Round 4 state at audit: **R4A complete, R4B complete, R4C next**

## Purpose

This audit records the current UI state while implementation capacity is paused. It is intended to reduce rediscovery when Codex resumes UI-R4C and later UI-R4E.

The audit does **not** implement a Round 4 phase, change runtime behavior, change database/provider configuration, or certify production.

## Evidence and method

Evidence used:

1. current exact `main` source;
2. the approved Round 4 blueprint and R4B evidence;
3. the current shared semantic style layer in `src/index.css`;
4. a static scan of representative top-level and workflow UI components;
5. three deployed UI screenshots supplied by the user in the current session:
   - Dashboard permission-scoped/simplified state;
   - Payroll & labor;
   - Email / SMS compose with Brevo connection problem.

The supplied deployed screenshots contain account/company-identifying UI, so they are **not committed to the repository**. Their sanitized observations are recorded below.

A fresh independent live-browser screenshot sweep was not available from this ChatGPT runtime. Therefore, findings that depend on routes not visible in the supplied screenshots are marked as **source-supported / visual verification required**, not claimed as fresh hosted visual certification.

Static counts below are heuristics for migration debt. A count is not automatically a defect; it identifies surfaces that still depend heavily on pre-R4 one-off light/slate/button styling and therefore deserve visual inspection during R4E.

---

## Executive findings

### P1 — Dashboard currently has two competing compositions

**Observed:** the simplified permission-scoped Dashboard can appear briefly and then be replaced by the older analytics-heavy Dashboard after workspace data finishes loading.

**Source cause is explicit in `src/app/routes/DashboardRoute.tsx`:**

- when project-cost completeness is incomplete, the route renders the simplified `Permission-scoped workspace` shortcut layout;
- when completeness later becomes complete, the same route renders `EngineeringCostOperationsDashboard`.

This is not merely a paint flicker. The route intentionally switches products after hydration.

**Round 4 consequence:** R4C must establish **one authoritative Home composition** that remains Home before and after hydration. Completeness should change the availability of specific indicators/attention items, not replace Home with the legacy analytics wall.

The legacy `EngineeringCostOperationsDashboard` should remain available as the planned secondary **Operations Insights** destination.

Do not solve this by delaying render, forcing the incomplete branch, or hiding the transition behind a longer skeleton.

### P1 — The legacy analytics Dashboard directly conflicts with the R4C Home contract

`EngineeringCostOperationsDashboard.tsx` still contains:

- a permanent multi-control Dashboard filter card;
- four priority metric cards immediately below;
- Cash position;
- attention blocks;
- multiple charts;
- payroll/expense/unallocated/overhead analysis;
- a wide project-performance table;
- many explanatory micro-labels.

Static scan:

- 13 `bg-white` uses;
- 14 slate background uses;
- 57 slate text uses;
- 21 slate border uses;
- 28 uses of 9–11px text;
- 14 raw `<button>` controls;
- no R4B `hqs-*` semantic surface usage.

This remains useful analytics capability, but it is the wrong composition for the R4 Home screen.

### P1 — Dark/System theme rollout is still incomplete outside the proving scope

R4B correctly limited implementation to shared primitives plus Projects proving scope. Its own evidence recorded that the downstream Procurement route still showed legacy light fills in a Dark probe.

The current semantic CSS does **not** globally reinterpret Tailwind `bg-white` / `text-slate-*` utilities. Pages that keep those utilities therefore still require page-level migration/visual verification.

Highest visible/static migration debt is concentrated in:

- Engineering analytics Dashboard;
- Supplier Invoice viewer/review;
- Procurement registers/editors;
- Cash & Banking;
- Expenses;
- Warehouse Inventory;
- Equipment;
- Payroll;
- Email / SMS;
- Documents;
- Reports.

This is consistent with the approved R4E boundary. Do not reopen R4B; use R4E to finish the app-wide rollout.

### P1 — Payroll first viewport is substantially over-composed

The deployed Payroll screenshot shows, before core payroll work becomes visible:

- a full-width technical error banner;
- large page intro;
- period jump selector;
- a second current-period navigation strip;
- five metric cards;
- three review-state cards;
- five large workflow/navigation cards;
- only then the normal-cycle/settings work.

The selected period is repeated in multiple places.

Source scan for `PayrollPageV2.tsx`:

- 11 `bg-white` uses;
- 4 slate backgrounds;
- 24 slate text uses;
- 12 slate borders;
- 19 uses of 9–11px text;
- 7 raw buttons;
- no `hqs-*` semantic classes or shared `ActionButton`.

**R4E direction:** reduce the first viewport to period context, exception/next-step state, and compact workflow navigation. Move secondary metrics/settings deeper or into progressive disclosure.

The existing `Payroll period ownership and company are immutable` banner is also a separate persistence/reliability bug. Preserve the DB guard; fix update semantics instead of hiding the message.

### P1 — Brevo is currently a real runtime reliability blocker, not only a UI issue

The deployed Email / SMS screenshot currently shows:

- `Brevo · Connection problem`
- `Brevo connection status could not be checked safely.`

Provider readiness must therefore remain **unverified/unavailable** until separately investigated.

No uncontrolled external send is authorized by this audit.

### P2 — Email / SMS has too much vertical chrome before the task

Current deployed compose sequence:

1. page header;
2. workspace tabs;
3. large compose identity/action panel;
4. full-width Brevo status panel;
5. compose form.

This delays the actual `To` / `Subject` / message task.

The compose hero also presents `Browse Documents`, `Email setup`, and `Compose SMS` with similar visual weight.

Static scan for `EmailComposePanel.tsx`:

- 8 `bg-white`;
- 2 slate backgrounds;
- 19 slate text;
- 5 slate borders;
- 8 raw buttons;
- no shared R4 `ActionButton`.

**R4E direction:** compact the provider state into task-context status, make one action dominant, and reduce duplicate framing. Provider errors remain visible and actionable; do not bury a blocking state in hover-only help.

### P2 — Supplier Invoice surfaces have some of the largest remaining presentation debt

Representative static scan:

| File | Lines | bg-white | Slate text | Slate borders | 9–11px text | Raw buttons |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `InvoiceDirectory.tsx` | 115 | 4 | 22 | 8 | 12 | 8 |
| `SupplierInvoiceReview.tsx` | 353 | 10 | 20 | 6 | 35 | 10 |
| `InvoiceViewer.tsx` | 841 | 37 | 105 | 62 | 64 | 10 |

The source/review workflow is already functionally important and should not be redesigned casually. R4E should migrate hierarchy/theme/action grammar while preserving source evidence, verification, immutable history, and financial authority.

### P2 — Cash & Banking remains action-dense

`CashBankingPage.tsx` static scan:

- 16 `bg-white`;
- 16 slate backgrounds;
- 61 slate text;
- 23 slate borders;
- 18 uses of 9–11px text;
- 31 raw buttons;
- 8 native selects;
- no shared R4 `ActionButton`.

This is a high-value R4E visual/workflow surface. Preserve explicit consequential reconciliation/settlement actions; use the new action hierarchy for ordinary navigation/filter/utilities.

### P2 — Expenses remains dense and micro-text heavy

`ExpensesPage.tsx` static scan:

- 13 `bg-white`;
- 11 slate backgrounds;
- 55 slate text;
- 19 slate borders;
- **53 uses of 9–11px text**;
- 18 raw buttons;
- no shared R4 `ActionButton`.

The worksheet foundation itself is much cleaner; `ExpenseDraftWorksheet.tsx` has almost no hard-coded surface styling. This supports migrating page framing/chrome rather than replacing the worksheet engine.

### P2 — Warehouse Inventory and Equipment still use the pre-R4 card/control grammar

`WarehouseInventoryPage.tsx`:

- 10 `bg-white`;
- 12 slate backgrounds;
- 58 slate text;
- 22 slate borders;
- 38 uses of 9–11px text;
- 20 raw buttons.

`EquipmentPage.tsx`:

- 5 `bg-white`;
- 10 slate backgrounds;
- 36 slate text;
- 19 slate borders;
- 23 uses of 9–11px text;
- 18 raw buttons.

These are especially relevant to R4D/R4E because media is intended to improve entity recognition. Image support should not simply be added on top of the existing dense card grammar; media and hierarchy need to work together.

### P2 — Procurement child registers/editors remain legacy even though the parent page is comparatively restrained

Representative child surfaces:

| Surface | bg-white | Slate text | Slate borders | 9–11px text | Raw buttons |
| --- | ---: | ---: | ---: | ---: | ---: |
| Purchase Order register | 11 | 45 | 12 | 27 | 4 |
| RFQ register | 10 | 48 | 11 | 35 | 11 |
| Subcontract register | 7 | 51 | 11 | 28 | 9 |
| Purchase Order editor | 10 | 53 | 24 | 31 | 20 |

The registers already use existing data/grid authorities; R4E should change presentation and control hierarchy without weakening issue/approve/receive/settlement lifecycle boundaries.

The Purchase Order editor remains a particularly large surface and must be visually rechecked at constrained-laptop width during R4E certification.

### P2 — Documents is partially modernized, but not yet on the full R4 grammar

Positive:

- `DocumentsRoute.tsx` already uses `FilterBar` and `DisclosureSection`;
- advanced filters are progressively disclosed rather than permanently expanded.

Remaining debt:

- 8 `bg-white`;
- 22 slate text;
- 9 slate borders;
- 8 raw buttons;
- 9 uses of 9–11px text;
- document cards still use page-specific status/action styling.

This is a lower-risk migration target than Payroll/Cash because the interaction structure is already closer to R4.

### P2 — Tiny typography remains widespread

The R4 blueprint explicitly says not to return to 9–10px labels merely to fit more controls.

Large counts of 9–11px text remain in several important surfaces:

- Invoice Viewer: 64;
- Expenses: 53;
- Warehouse: 38;
- RFQ register: 35;
- Supplier Invoice Review: 35;
- PO editor: 31;
- Engineering analytics Dashboard: 28;
- Subcontract register: 28;
- PO register: 27;
- Equipment: 23;
- Payroll: 19.

Not every micro-label is wrong. R4E should specifically promote **task labels, status explanations, primary metadata, and action text** that are currently too small, while leaving genuinely secondary metadata compact.

### P2 — Shared button hierarchy adoption is still narrow

In the sampled high-level surfaces, shared `ActionButton` use is effectively absent except on the R4B proving surfaces.

This means visual meaning such as Primary / Secondary / Ghost / Destructive is still encoded by page-specific Tailwind combinations.

R4E should migrate touched surfaces to shared action semantics rather than creating new page-specific button colors.

---

## Strong existing foundations — preserve and reuse

### Projects portfolio core

`ProjectPortfolioRegisterSection.tsx` is the clearest R4 proving surface:

- 101 `hqs-*` semantic-class uses;
- 4 shared `ActionButton` uses;
- no hard-coded `bg-white`, slate background/text/border usage in the sampled component;
- compact filters and responsive view controls already exist.

R4C should refine project-card identity/composition, not replace the shared filter/action foundation.

### Settings

`Settings.tsx` is already strongly migrated:

- 35 `hqs-*` semantic-class uses;
- 1 shared `ActionButton`;
- no hard-coded white/slate utility debt in the sampled file.

Use it as another theme/reference surface.

### App shell and worksheet primitives

The App shell, OperationsGrid, WorksheetEditor, WorksheetTabs, ContextualHelp, and semantic `hqs-*` CSS provide the correct shared foundation.

The correct strategy is **migration onto this system**, not a new parallel design system.

---

## Navigation / shell observations

The desktop sidebar is structurally clear, but the current deployed screenshot shows a long vertical navigation stack and an expanded Supplier Invoices subtree consuming substantial height on a constrained desktop/laptop.

The model currently groups:

- Operations;
- Finance;
- People;
- Communications;
- Workspace settings.

Only Supplier Invoices has a multi-route expanded child treatment.

Round 4 should not redesign navigation casually, but R4E certification should verify:

- collapsed sidebar genuinely improves working width;
- expanded invoice children do not hide lower-priority destinations unnecessarily;
- current route remains obvious in Light and Dark;
- account/company controls do not compete with primary work;
- tablet/phone drawer remains task-oriented.

---

## Sanitized observations from current deployed screenshots

### Dashboard screenshot

Observed:

- the simplified permission-scoped Dashboard is visually calmer than the old analytics wall;
- the warning banner is long and dominates the top;
- the shortcut area is still a generic grid of similarly weighted cards;
- a large amount of lower-screen whitespace appears in this incomplete-data state;
- the screenshot is especially useful because this is the state that later disappears after hydration.

R4C should convert this from a fallback-only page into the stable Home shell: orientation, compact attention, useful launch cards, optional recent projects, and a secondary link to Operations Insights.

### Payroll screenshot

Observed:

- technical DB text is exposed directly at page level;
- period identity is repeated;
- metrics/state/navigation cards consume almost the entire first viewport;
- primary work begins below the fold;
- many rectangular cards have equal visual weight.

### Email / SMS screenshot

Observed:

- four stacked regions precede the message fields;
- Brevo failure is truthful but oversized for a status check;
- secondary actions have similar weight;
- actual composition fields are visually clean once reached.

---

## Recommended Round 4 execution impact

The approved sequence remains:

`R4C Home + Project Portfolio -> R4D media -> R4E app-wide rollout/certification`

This audit does **not** change that sequence.

### R4C — tighten the exact scope

Highest priority:

1. remove the dual Dashboard composition;
2. make the simplified Home stable before/after hydration;
3. preserve legacy analytics under Operations Insights;
4. make incomplete-source state affect only relevant indicators, not the whole Home identity;
5. refine project cards using the existing R4B filter/action system.

Do not spend R4C migrating every legacy page.

### R4D — media

Keep the approved entity-media boundary:

- Project cover/profile;
- Equipment image;
- Material image.

Because Inventory/Equipment card grammar is still legacy, implement media with an explicit plan for how R4E will finish those card surfaces rather than treating an image thumbnail alone as the design fix.

### R4E — execute as internal subwaves while remaining one approved program

Suggested internal order:

**R4E-1 — highest-friction daily workflows**
- Supplier Invoices / Viewer / Review;
- Payroll;
- Email / SMS;
- Cash & Banking;
- Expenses.

**R4E-2 — operational registers**
- Procurement registers/editors;
- Warehouse Inventory;
- Equipment;
- Documents;
- Reports;
- remaining Project workspace secondary panels.

**R4E-3 — full certification**
- shared Header/account controls;
- sidebar;
- all touched routes in Light/Dark/System;
- desktop/laptop/tablet/phone;
- keyboard/focus/touch;
- no P0/P1 visual blockers;
- lead screenshot inspection, not DOM/overflow checks alone.

This is sequencing within R4E, not authorization for new product capability.

---

## Separate reliability follow-ups that must not be hidden by UI work

1. **Payroll period persistence** — preserve ownership/company immutability; correct existing-row update semantics and add same-company multi-user regression coverage.
2. **Brevo status/runtime** — investigate status-check/configuration path; keep unavailable/unverified until controlled evidence exists.
3. **Dashboard hydration/completeness switching** — fix as part of R4C because it is both a UI correctness issue and the direct blocker to a stable Home.

---

## Audit stop boundary

No product source was modified.

No database, migration, RLS, RPC, Storage, provider, Render, Supabase, or production mutation was performed.

No live email/SMS was sent.

No new customer-facing product domain was authorized.

This report exists to give the next Codex run a concrete current-state evidence base and to prevent Round 4 from repeating broad visual rediscovery.


## 2026-09-23 field finding — Dark mode foreground contrast is currently unacceptable

The user reports that current deployed Dark mode largely darkens backgrounds while many foreground styles do not adapt with sufficient contrast. This matches the static audit: many non-proving surfaces still contain hard-coded light-theme `text-slate-*`, `bg-white`, `bg-slate-50`, and `border-slate-*` treatment instead of the R4B semantic layer.

**Disposition: P1 visual blocker for final Round 4 certification.**

Planning impact:

- **R4C:** Home and Project Portfolio must be genuinely Dark-ready on the exact touched surfaces. Do not ship a new Home that repeats the background-only theme failure.
- **R4D:** media/fallback/overlay/caption treatment must work in both themes where media appears.
- **R4E:** perform the app-wide contrast remediation and certification. This includes text, muted text, status copy, inputs, borders, focus, selected state, icons, charts/legends, disabled/placeholder states, dialogs/popovers, empty/error/loading states, and page-specific controls.
- Low-contrast Dark text/control defects are P1, not cosmetic follow-up.

The existing semantic `hqs-*`/Astryx token system remains the source of truth. The fix should migrate legacy structural styles onto that system rather than create a second dark palette or hundreds of unrelated `dark:` patches.
