# UX-RESET-2 — Functional Workbook and daily workspace

2026-10-13. Base: `1490feaadf8d43c77b7cc78dcba34ec7ac0c286f`.
Branch: `codex/ux-reset-2-functional-workbook`. Application commit and final PR
head are recorded at delivery below. One lead; no subagents, paid coding agents,
interactive browser profiles, desktop automation, production writes or migration.

## Working behavior

The central Workbook now stages multiple Suppliers, Cost Codes, Direct Expense
drafts and Warehouse item catalog rows. Add Row focuses an editable input; Save
opens an additions/updates review. Confirmation delegates to the existing Vendor,
Cost Code, Expense or Inventory service. Successful rows leave the retry set;
failed rows and their errors remain staged. Saved records use canonical IDs and
survive reload in the isolated synthetic application journeys.

Suppliers preserve duplicate identity validation, protected existing TIN and the
atomic `expectedUpdatedAt` input. Cost Codes require an authorized active project,
validate aggregate budgets/duplicate codes and carry the existing update version.
Expenses remain direct DRAFT records; ordinary existing edits retain current-state
refresh and the existing version-aware save path. New Warehouse items contain
metadata only, with no opening balances or fabricated movement quantities.

The Supplier Invoices sheet searches real source records, displays original
currency/amount, review and derived payment state, and opens the exact bill for
source review/correction/payment. Project context requires Project read access.
Warehouse shows movement-derived balances and opens existing Stock In and
Stock Out / project allocation workflows. Add Project opens the complete existing
setup worksheet, including its required financial/tax fields.

Shared editing retains click/tap, Tab between editable fields, Enter, Escape,
arrow navigation, copy/paste, inline errors and explicit saves. Select choices
commit reliably without native dropdown/blur races. Sheet/route exit prompts
protect unsaved work; saving blocks route exits. Loading hides record contents.
Read-only/protected cells keep semantic and visual distinction without repeating
protection badges in every cell. Saved mobile records disclose secondary fields;
key amounts, states and bill actions stay visible.

## Canva-to-React implementation matrix

The connector found **HydroQualiSense UX Board**, design `DAHXzc7s2iw`, revision 2,
nine pages. The supplied shortlink did not resolve; search and content retrieval
succeeded. Page-thumbnail URLs could not be viewed through the web tool, so the
retrieved design content and the request's visual direction supplied the reference.
No new Canva design or marketing asset was created.

| Reference | Actual React implementation / intentional adaptation |
| --- | --- |
| 1. Navigation/principles | Existing daily destinations retained; quiet themed sidebar, restrained active state, consistent spacing and permission-filtered More Tools |
| 2. Desktop Home | Four task shortcuts, actionable queues and real compact snapshot; refined icons, typography and separators |
| 3. Laptop Home | Same working hierarchy at 1366px; no extra banners or repeated analytics |
| 4. Bills & Payments | Existing canonical register retained; shared readable heading/action/table styles and separate review/payment states |
| 5. Invoice review | Original source left, extracted worksheet right; shared legible controls/spacing; stacked source/details on mobile |
| 6. Workbook | Top sheet tabs, search, Add Row, emphasized Save, row numbers, gridlines, review and unsaved indicators; import/export stays secondary |
| 7. Warehouse | Real movement-derived stock; existing controlled receiving/issue/allocation/history actions; no direct balance edits |
| 8. Mobile | Record-level worksheet fields and disclosure; amounts/state/next actions remain visible; keyboard/tap help and contained scrolling |
| 9. Simplification | Shared surfaces, restrained indigo and consistent headings/controls across Home, Bills, Projects, Workbook, Warehouse and Documents |

Dark mode uses the shared theme. The previously unreadable sidebar status rectangle
now uses matching surface/text tokens. The Workbook no longer forces light color
scheme. Source invoice documents retain their original white appearance.

## Validation and claim limits

- Affected selection: **759/759 tests**, 113/401 files, no fallback, database
  unaffected. The initial run exposed stale permission/navigation expectations;
  those were corrected and the final integrated selection passed.
- Focused final checks after mobile/loading corrections: **60/60**. Additional
  regressions cover partial retries, context invalidation, canonical validation,
  expected versions, aggregate budgets, draft status, read-only balances,
  restricted roles and optional-reference review rendering.
- Workflow Map validation and consistency pass: 266 nodes, 355 edges, 36
  invariants and 11 diagrams.
- Lint/typecheck and production build results are recorded at delivery below.
- Browser: isolated repository-pinned headless Playwright, local `/demo/app`,
  synthetic company data, desktop 1920×1080, laptop 1366×768, mobile 390×844;
  light and dark screen captures. Browser artifacts identify source SHA/runtime
  diff hash, viewport, route and state. Representative screenshots were actually
  inspected; DOM/no-overflow alone is not treated as visual acceptance.
- Real legacy version-1 combined XLSX download/import review is exercised in the
  browser. Standalone/combined regression tests retain parser, permission,
  source-link, protected-cell, formula/macro/external-link and domain Apply guards.
- No SQL/RLS/RPC/service contract changed, so no new migration replay or hosted
  database certification is claimed. Persistence evidence here is local synthetic
  owner state plus existing domain callback/regression evidence, not live hosted
  authenticated writes or provider/production certification.

## Deliberate limitations

Existing Warehouse item metadata is read-only in the central Workbook because its
canonical update contract has no atomic expected-version input. A browser-only
freshness comparison would not close that gap. Supplier Invoice edits/confirmation
and payments use their original authorized workflows; no editable Paid flag or
second payable store was introduced. Materials, Equipment and Payroll remain in
their existing workflows, with no new placeholder Workbook tabs or payroll writes.

The new Suppliers/Supplier Invoices/Warehouse in-app sheets are not added to the
downloaded legacy combined XLSX. Its version-1 contract and existing standalone
formats remain unchanged; the transfer UI states the supported Excel domains.
Extra imported rows never automatically create or delete records. An expanded
export/import contract requires a separately versioned implementation.

## Delivery record

Final source identity, curated screenshot manifest, build/lint/browser results and
exact-head protected CI are appended after the final delivery checks. This phase
stops at one open PR; Codex does not merge it or begin another product phase.

- Application-bearing commit: `e0e3363ce39cafe1f212cf3422b4e086982100b2`.
- Full isolated browser matrix: **7/7 recorded functional journeys**, all three
  required viewports, **55 captures**, zero page errors and no viewport overflow.
  This covers actual synthetic save/reload, multiple suppliers, validation repair,
  Cost Code project selection, direct DRAFT Expense creation, zero-movement item
  creation, exact bill navigation, rejected sheet-exit discard, existing inventory
  workflow launch, complete Project setup launch and genuine v1 XLSX review.
- Lint/ESLint/typecheck: PASS. Production build: PASS, with the repository's
  existing large-chunk and server CJS `import.meta` warnings.
- Final visual correction: focused Add Row input clipping at laptop width was
  fixed with deliberate cell scrolling. Light/dark focused inputs now sit wholly
  inside the worksheet scroll frame (top 698.59, bottom 718.59, frame bottom
  728.75 at 1366x768). Post-correction editor/creation regressions: **40/40**.
- Initial full functional matrix and 759-test affected selection precede the final
  visual/CI follow-ups. The final Workbook browser scenarios pass **16/16** with
  reviewed saves and rejected discard prompts; focused dark scenarios pass
  **4/4**. Browser harness regression checks pass **47/47** and final editor/
  creation/theme checks pass **45/45**. Protected CI supplies final-head build,
  typecheck, affected selection and browser proof.
- CI exposed obsolete five-sheet/save expectations and contrast requirements.
  Scenarios now test eight authorized sheets, actual review confirmation, retained
  failed/discarded changes and authorized Supplier Payables export. Light controls
  retain the established accessible border; dark sidebar active labels use
  brighter text against indigo. Cost Codes show their protected budget currency.
- Documents search has 8px clearance between icon and text in both themes.
- Curated [screenshot manifest](evidence/ux-reset-2/manifest.json): **21** actual
  app captures refreshed at final application commit
  `0530b4d687f1c8ec5547810b991cdc59336082b3`, including light/dark Workbook and
  Documents. Earlier transient matrix output stays ignored locally.
- Exact final PR head and protected CI are recorded in the PR. No merge,
  authenticated hosted write, provider certification or production deployment is
  claimed by this local evidence.
- Final closeout theme/creation/browser-harness regressions: **59/59**.
