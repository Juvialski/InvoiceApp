# UI-R4E App-wide Rollout Implementation Plan

> **For agentic workers:** Execute natively in the lead session with `superpowers:executing-plans`. The user explicitly selected Codex as lead and zero subagents by default. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved Round 4 shell, theme, action, and density system to the remaining authenticated HydroQualiSense routes and certify the delivered local/demo scope.

**Architecture:** Keep Astryx/HydroQualiSense tokens and the existing `hqs-*`, `ActionButton`, `CompactActionBar`, `FilterBar`, and `PageHeader` primitives as the only visual authority. Remove duplicate desktop shell chrome, make the narrow-screen header navigation-only, move invoice export to the invoice register, and route remaining structural neutral/status styling through semantic theme tokens. Make focused page corrections only where the current rendered route shows avoidable action density or hierarchy problems.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Astryx Design Core, Playwright demo visual QA, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-22-ui-r4-professional-design-blueprint.md`, including its 2026-09-23 Dark-mode contrast acceptance.

## Global Constraints

- Preserve the governing interaction rule: **browse visually -> edit like a spreadsheet -> execute sensitive workflows deliberately**.
- Keep user-visible theme choices exactly System, Light, and Dark; System continues to follow the OS preference.
- Preserve explicit payment, approval, verification, issue/finalize, reconciliation, correction, permission, and audit workflows.
- Preserve REL-AUTH-1 same-user recovery, fail-closed confirmed access loss, user/logout isolation, and stale-request rejection.
- Do not add database, migration, storage, provider, production, auth-state-machine, or public-site work.
- Use the existing Astryx/HydroQualiSense semantic theme and control system; do not create a second palette or page-specific dark-mode patch framework.
- Scope any compatibility mapping for legacy classes to `[data-app-shell="true"]` so the public site keeps its current design boundary.
- Keep Hydroqualisense company and authenticated workspace identity unchanged; WEB-BRAND-1 remains planned and out of scope.
- Keep financial/source truth, permissions, lifecycle, history, provenance, concurrency, RLS, and review-before-Apply behavior unchanged.

## Review Focus

- **Confirmed access loss vs transient verification failure:** the shell cleanup must not hide or relabel REL-AUTH-1 status; retain the existing recovery notice and fail-closed behavior.
- **System preference under either OS scheme:** System mode must leave the explicit theme unset and use the generated `light-dark()` tokens; verify both OS Light and OS Dark behavior.
- **Selected and exceptional states on dark surfaces:** status, focus, selected, input, disabled, and warning/success/error treatment must remain distinguishable and readable.
- **Invoice export permission/context:** the batch export moves into the supplier invoice register and stays visible only inside the already-authorized invoice surface.
- **Narrow viewport shell and actions:** at 768px and 390px the navigation trigger, account menu, active filters, export, and primary actions must remain reachable without horizontal overflow.

---

### Task 1: Desktop shell and contextual invoice export

**Files:**
- Modify: `src/app/AppShell.tsx`
- Modify: `src/components/Header.tsx`
- Modify: `src/App.tsx`
- Modify: `src/app/routes/AppRouter.tsx`
- Modify: `src/app/routes/InvoicesRoute.tsx`
- Modify: `src/components/InvoiceDirectory.tsx`
- Modify: `src/components/InvoiceDirectoryReadOnly.tsx`
- Modify: `src/demo/DemoWorkspace.tsx` only to remove the obsolete `AppShell` export prop wiring.
- Test: `tests/uiHardeningShared.test.ts`

**Interfaces:**
- `AppShell` no longer accepts or forwards a global invoice-export action.
- `AppRouter` accepts one optional invoice-register export callback and forwards it only to `InvoicesRoute`.
- `InvoicesRoute` forwards that callback only to the supplier invoice register, including its permission-aware read-only variant; invoice-detail and review workflows do not receive a global export action.
- `Header` keeps mobile drawer navigation, receives no page-title or export props, and owns the lower-left account menu and conditional sync indication.

- [x] Add assertions to `tests/uiHardeningShared.test.ts` that the desktop shell does not render product/page identity, global Export, or a permanent successful Synced label; the sidebar account menu contains the account identity and Log out action; and the mobile navigation trigger remains present.
- [x] Run `npx.cmd tsx --test tests/uiHardeningShared.test.ts` and confirm the new shell assertions fail against the current source.
- [x] Move the account identity/menu, Settings shortcut, and Log out action to the sidebar footer; make the collapsed sidebar account control keyboard accessible and keep Escape/outside dismissal and focus return.
- [x] Hide the redundant desktop header row while retaining a compact tablet/phone header containing navigation access and only meaningful temporary sync/offline/error status. Keep successful sync silent.
- [x] Remove the shell-level invoice export and thread its existing callback to the supplier invoice register without changing the export implementation or settlement projection data passed to it.
- [x] Add a contextual `Export invoices to Excel` secondary action beside the invoice register's Upload action when writable and as a standalone secondary action when read-only; show it only when an export callback exists and the user can access the invoice register.
- [x] Run `npx.cmd tsx --test tests/uiHardeningShared.test.ts` and verify shell/account/export assertions pass; inspect the changed shell and invoice-register images at 1440px and 390px.

### Task 2: Semantic theme coverage and shared action calibration

**Files:**
- Modify: `src/index.css`
- Modify: `src/ui/hydroqualisenseTheme.ts`
- Modify: `src/components/ui/OperationsUI.tsx` only for semantic variants needed by the audited routes.
- Modify: `scripts/qa/demoScenarios.ts` for a focused computed-style contrast scenario.

**Interfaces:**
- Existing structural neutral and pale status utilities resolve through the existing `--color-*` Astryx tokens in Light, Dark, and System mode.
- Existing exceptional warning/success/error/accent meanings map to their corresponding semantic token families.
- The shared primary action uses the existing `--color-on-accent` token so Light and Dark foregrounds remain legible.

- [x] Add a `ui-r4e-theme` browser scenario on the Payroll page that applies explicit Dark theme and measures the contrast between a semantic heading and its legacy white-surface ancestor, plus a visible form-control boundary.
- [x] Run `npm.cmd run qa:demo` with `DEMO_QA_FEATURES=ui-r4e-theme` and confirm the legacy white background/semantic foreground pairing fails its contrast assertions before implementation.
- [x] Add one shared token-backed compatibility mapping in `src/index.css` for legacy structural neutrals and pale status classes, including their hover, placeholder, border, selected, and focus treatments; leave semantic saturated/destructive colors intact.
- [x] Bind native and legacy input/select/textarea boundaries to a token-backed control-border color that reaches the 3:1 non-text contrast target in both themes; keep ordinary card separators visually quiet.
- [x] Change the Astryx primary-button foreground from a fixed white value to `var(--color-on-accent)` and add only shared semantic classes required by the route audit.
- [x] Rerun the filtered `ui-r4e-theme` scenario and verify the semantic surface and control-boundary assertions pass; use the local browser to compare Payroll, Cash, Invoice, and Warehouse states in Light and Dark before moving on.

### Task 3: Compact supplier-invoice register controls

**Files:**
- Modify: `src/components/InvoiceDirectory.tsx`
- Modify: `src/components/InvoiceDirectoryReadOnly.tsx` for shared contextual action consistency if required by the source review.
- Modify: `src/components/ui/OperationsUI.tsx` to give removable filter chips explicit accessible action labels.
- Modify: `scripts/qa/demoScenarios.ts` to cover filter review/chips and the phone register layout.

**Interfaces:**
- Existing controlled filter state and exact filter semantics remain owned by `InvoiceDirectory`.
- `CompactActionBar` receives the existing search, one quick review-state filter, advanced payment/project/lifecycle/tax/type/source/duplicate/date filters, removable active chips, result counts, Upload primary action, and contextual Export secondary action.
- Status chips and result counts continue to reflect the original `counts` and `filtered` values.

- [x] Add browser assertions that the invoice register renders one compact action bar, a search field, the advanced filter disclosure, removable active-filter controls, and one Upload primary action; add a phone scenario requiring readable record cards without the wide table.
- [x] Run `npm.cmd run qa:demo` with `DEMO_QA_FEATURES=ui-r4e-invoice-directory` and confirm the toolbar/card assertions fail against the current multi-row filter card and compressed phone table.
- [x] Replace the permanent multi-row filter card with `CompactActionBar`; retain All / Needs review / Verified / Overdue semantics through the quick review control and result summary, with remaining filters available through the disclosure.
- [x] Render responsive invoice summary cards below the wide-register breakpoint so project, date, amount, review/payment state, and open/correction actions remain readable on phone without removing the wide desktop register.
- [x] Keep the existing invoice table, status meanings, source evidence, payment semantics, correction paths, and read-only data exactly intact.
- [x] Rerun the filtered `ui-r4e-invoice-directory` browser scenarios and capture the register at desktop, constrained laptop, tablet, and phone widths for visual iteration.

### Task 4: Existing high-friction route hierarchy and action grammar

**Files:**
- Modify: `src/components/payroll/PayrollPageV2.tsx` for the first-view normal-cycle sequence and compact section navigation.
- Modify: `src/components/EmailComposePanel.tsx` for a compact compose toolbar and provider status hierarchy.
- Modify: `src/app/routes/EmailSmsRoute.tsx` for short phone tab labels with full accessible names.
- Modify: `src/demo/DemoWorkspace.tsx` to compress repeated safe-demo framing; keep the existing desktop Tour launcher and expose Tour inside the phone Demo tools disclosure.
- Modify: `src/components/CashBankingPage.tsx`, `src/components/expenses/ExpensesPage.tsx`, `src/components/equipment/EquipmentPage.tsx`, `src/components/inventory/WarehouseInventoryPage.tsx`, and `src/components/procurement/ProcurementPage.tsx` to use shared page-header action variants.
- Modify: `scripts/qa/demoScenarios.ts` to assert the changed first-view and page-header action contracts.
- Reuse: `PageHeader`, `SectionHeader`, `ActionButton`, `CompactActionBar`, `FilterBar`, and `DisclosureSection` from `src/components/ui/OperationsUI.tsx`.
- Test: the directly affected UI tests selected for those components.

**Interfaces:**
- Existing parent-owned route, permission, persistence, validation, and workflow callbacks stay unchanged.
- Ordinary page-level create/save/navigation actions use the shared Primary, Secondary, Ghost, or Destructive variant appropriate to the action.
- Consequential financial/lifecycle actions remain explicit and retain their current confirmation and authority boundaries.
- Dense page-level filters use the shared compact bar or disclosure only where the current rendered page shows a permanent multi-row filter wall.

- [x] Add focused browser assertions that Payroll's next-step card and Email's To field appear in the first phone viewport, safe-demo chrome stays compact, provider failure remains visible, and each changed PageHeader region has one shared primary action plus labelled secondary actions.
- [x] Run the narrowly filtered `ui-r4e-payroll-hierarchy`, `ui-r4e-email-compose`, `ui-r4e-demo-chrome`, and `ui-r4e-action-grammar` scenarios and confirm they expose the existing presentation before implementation.
- [x] Promote the Payroll normal-cycle next step, period context, and exception state in the first view; compact redundant period/navigation framing and disclose only secondary summary/settings detail without changing payroll behavior.
- [x] Compact Email/SMS compose framing so the To/Subject/Message task appears earlier; retain a visible provider error/status and keep Compose, Sent/Delivery History, Email Provider Status, and SMS Status reachable.
- [x] Apply shared ActionButton variants to Cash, Expenses, Equipment, Warehouse, and Procurement page-header actions; use one Primary per header and retain important settlement, stock movement, equipment lifecycle, and procurement actions explicitly.
- [x] Run the focused tests for the changed routes and inspect each changed major surface at its narrowest materially affected viewport before continuing.

### Task 5: App-wide visual certification, evidence, and delivery

**Files:**
- Modify: `scripts/qa/demoScenarios.ts` only to add the R4E shell/theme/responsive scenarios required by this phase.
- Create: `artifacts/ui-ux-audit/UI-R4E-APP-WIDE-CERTIFICATION.md`
- Create: `artifacts/ui-ux-audit/screenshots/r4e/` captures listed by the certification report.
- Modify: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`
- Modify: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`

- [x] Add one final certification matrix covering System, Light, and Dark; desktop 1440-class, constrained laptop 1280-class, tablet 768-class, and phone 390-class; keyboard-visible focus, account/menu navigation, touch-sized controls, and material horizontal overflow.
- [x] Run new/edited focused tests, then directly affected UI/theme/shell tests, then `npm.cmd run test:affected:agent` once on the integrated executable/test diff.
- [x] Run `npm.cmd run lint`, `npm.cmd run build`, and the final relevant browser/visual certification once; do not start Docker/Supabase because this phase contains no database work.
- [x] Open and inspect the actual final screenshots for hierarchy, spacing, alignment, density, Light/Dark contrast, repeated card chrome, clipping, action prominence, keyboard focus, and phone usability; fix any P0/P1 visual blocker before delivery.
- [x] Record source SHA, local/demo environment, exact route/state/viewport/theme, screenshot paths, direct visual observations, tests/checks, and remaining hosted/provider/production limitations in the R4E evidence report.
- [x] Reconcile roadmap and handoff to state only the scope actually delivered; run `git diff --check`; review the complete final diff for behavior, REL-AUTH-1, WEB-BRAND-1, financial, permission, lifecycle, and audit regressions.
- [ ] Commit, push `codex/ui-r4e-app-wide-rollout`, open the focused PR, attach its URL to the task, and stop without merging.
