# HydroQualiSense Active Roadmap

Status: **ACTIVE — UI/UX ROUND 2 APPROVED AS NEXT IMPLEMENTATION PHASE / HOSTED EXACT-SHA QA PASS EXISTS FOR LAST APPLICATION-BEARING MAIN / SUPPLIER PAYABLES CERTIFIED / WAVE 4D INCOMPLETE AND TEMPORARILY SEQUENCED AFTER UI/UX ROUND 2 / QA CERTIFICATION NOT READY / WORKER REGISTRATION PAUSED**  
Repository: `Juvialski/InvoiceApp`  
Last updated: **2026-09-12**

Product direction: `docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md`  
Current handoff: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`  
**Approved UI/UX Round 2 design:** `docs/HYDROQUALISENSE_UI_UX_ROUND2_SIMPLIFICATION.md`  
Local-QA/UI/PDF staged plan: `docs/HYDROQUALISENSE_LOCAL_QA_UI_PDF_PLAN.md`  
Supplier Invoice monetary model: `docs/HYDROQUALISENSE_SUPPLIER_INVOICE_MONETARY_MODEL.md`  
Wave 4D contract: `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md`  
Workflow UX audit: `docs/HYDROQUALISENSE_WORKFLOW_UX_AUDIT_20260909.md`  
Current UI/UX audit evidence: `artifacts/ui-ux-audit/REPORT.md`  
Client deployment strategy: `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`

Live repository state and `AGENTS.md` override remembered chat summaries and historical plans.

## Current repository / application baseline

Documentation reprioritization is based on `main` at:

`28f063c365fea287b5aa07c3ea7d94af05f3651c`

The last application-bearing/certified application SHA remains:

`e4ee4ebde489629ee74429b4e37abb511943a51e`

That application SHA includes merged PR #158, **Supplier Payables Settlement Truth & Consistency**. The later `28f063c...` commit is documentation-only and does not invalidate the hosted application evidence for `e4ee4e...`.

Relevant completed work includes:

- Wave 1A Supplier Payable Lifecycle UX — complete;
- Wave 1B Client Receivable Lifecycle UX — complete;
- Wave 2 cross-module routing and handoffs — complete;
- Wave 3 payroll/subcontract/PO workflow decisions — complete;
- Wave 4A Company Document Templates / Mail Merge Foundation — complete;
- Wave 4B High-Fidelity PDF Finalization Foundation — complete;
- Wave 4C outbound issued-document Gmail delivery/history foundation — complete;
- Wave 4D Email/SMS + Documents workspaces — partially implemented but **not complete**;
- full live-QA harness and observed-flow hardening — complete;
- first focused UI/UX remediation — complete;
- Local-QA + canonical issued-PDF preview/download foundation — complete;
- Local-QA browser-key hardening — complete;
- first comprehensive authenticated Local-QA UI/UX pass — complete in PR #150;
- deep programmatic-PDF visual certification — complete for the programmatic fallback;
- supported/fixture-backed Local-QA functional regression sweep — complete;
- Supplier Invoice monetary correction/buyer simplification — complete;
- Supplier Payables Settlement Truth & Consistency corrective phase — complete in PR #158 and separately QA-certified.

## Explicit 2026-09-12 reprioritization — UI/UX Round 2

The user reviewed multiple authenticated screens and determined that the current app still exposes too much system architecture, technical wording, weak hierarchy, card-heavy whitespace, cramped controls, and flat navigation despite the earlier UI/UX pass.

The user explicitly approved a second, broader UI/UX round with permission to restructure navigation and tabs where that genuinely improves simplicity.

The authoritative phase contract is:

`docs/HYDROQUALISENSE_UI_UX_ROUND2_SIMPLIFICATION.md`

This is not a cosmetic polish pass. It is an app-wide **workflow-first usability simplification and information-architecture phase**.

### Approved design principles

- keep the features; reduce cognitive load;
- task first, internal architecture second;
- one obvious primary action per context;
- main work/register before secondary explanation;
- progressive disclosure for provenance, raw IDs, audit metadata, and advanced controls;
- human business terminology instead of engineering/source-of-truth jargon in primary UI;
- compact useful summaries rather than oversized metric/card walls;
- compact common filters with advanced filters progressively disclosed where appropriate;
- consistent page/header/table/form/action/navigation grammar across modules;
- navigation/tabs may be regrouped, renamed, reordered, or restructured when doing so simplifies real workflows;
- deep links/routes should remain compatible wherever practical;
- responsive layouts may reorganize the workflow rather than simply shrink desktop UI;
- expert capability, permissions, financial semantics, audit history, and source-of-truth boundaries remain intact.

### Known mandatory regression examples

The phase must explicitly address and recheck these classes of defects:

1. **Project Allocation** — large values, units, balance, allocation semantics, and action must not be compressed into an unreadable/truncated row.
2. **Documents** — the actual document workspace/list must not be buried below oversized registry/summary framing; common find/open/preview/handoff actions should be obvious.
3. **Expenses** — Expense register/work should be primary; Supplier Invoice evidence remains linked supporting context; phrases such as `owns cost` / `preserved source evidence` must not dominate normal user-facing UI.
4. **Payroll** — the long flat equal-priority tab set must be reorganized around a clearer workflow/mental model after inspecting the live route responsibilities.

These examples seed the app-wide audit; fixing only these four is insufficient.

## Immediate implementation sequence

Unless the user explicitly reprioritizes again, proceed in this order:

1. **UI/UX Round 2 — App-Wide Usability Simplification & Information Architecture — NEXT / ACTIVE**
   - audit every canonical authenticated route plus important child tabs, details, dialogs, drawers, forms, and responsive states;
   - derive the route inventory from the live router rather than an old hardcoded count;
   - restructure hierarchy/navigation where it improves user understanding;
   - standardize reusable layout/action/filter/form/table patterns when recurring problems share a component cause;
   - use authenticated Local-QA repeatedly during implementation;
   - retest the real workflows touched by restructuring, not only screenshot/overflow scenarios;
   - preserve route/deep-link compatibility where practical;
   - preserve all permission, financial, history, document, payroll, inventory, and Assistant confirmation boundaries;
   - remain primarily application/UI work; do not introduce DB changes merely for convenience;
   - complete the first-time-user test for every major screen: `What is this page for? What needs my attention? What can I do next?`.

2. **Resume Wave 4D messaging-provider integration/completion**
   - UI/UX Round 2 does not cancel or redesign the approved provider direction;
   - Company SIM Gateway remains primary/recommended;
   - PhilSMS remains the optional hosted Philippine fallback;
   - use the shared server-side provider adapter and durable delivery intent/audit contract;
   - keep SMS truthful as unavailable/unverified until controlled provider-backed runtime QA exists;
   - reconnect/certify Gmail as needed for exact-state provider evidence;
   - close remaining Wave 4D provider/AI/recovery/readiness evidence.

3. **Worker Registration — PAUSED**
   - do not start until Wave 4D is genuinely complete and the user explicitly resumes it.

4. **Site Attendance state machine + registered site/device** after Worker Registration.

5. **Face-Recognition Attendance** only after explicit identity/privacy/consent/retention/liveness/confidence/fallback/security design.

6. **Final pre-production security/data-integrity certification** before broad rollout.

## UI/UX Round 2 implementation boundary

For schema-compatible UI/application work:

`feature branch -> local app -> isolated QA Supabase/Auth/Postgres/Storage -> authenticated workflow -> inspect -> fix -> focused regression`

The Local-QA harness is fail-closed to QA and must reject production targets and privileged browser-unsafe keys.

Use existing approved QA account/environment configuration through local env/test setup. Do not hardcode passwords or keys in source/tests/docs.

Local QA is pre-merge functional evidence, not release certification.

### Database boundary

Do not start Docker/Supabase by ritual for UI-only changes.

If this phase crosses migrations, RLS/grants, RPC/SECURITY DEFINER behavior, DB constraints/triggers, financial/inventory guards, company-bound integrity, or concurrency, use the full applicable local Supabase validation required by `AGENTS.md` and the efficiency guide.

Do not silently redefine backend financial/security contracts to simplify a screen.

## UI/UX Round 2 acceptance summary

The phase is not complete merely because pages load without overflow.

Required evidence includes, where applicable:

- every major authenticated route has a clear task-first hierarchy;
- common action is obvious;
- main working content is not buried beneath decorative/secondary UI;
- internal jargon/raw identifiers are demoted or translated without changing semantics;
- navigation/tab restructuring reduces cognitive load;
- desktop/laptop/tablet/mobile layouts are deliberately exercised;
- no page-level overflow/clipped critical controls in supported target layouts;
- real affected workflows still complete correctly;
- route/deep-link handoffs remain valid or have deliberate compatibility handling;
- permission-based visibility remains intact;
- shared recurring UI defects are fixed centrally where appropriate;
- new/edited tests, focused tests, `test:affected:agent`, build, and relevant browser QA pass;
- Workflow Map runs only when mapped/generated contracts change;
- `test:full` remains conditional under repository policy;
- final integrated diff is reviewed for accidental feature loss, financial/security drift, and scope creep.

## Hosted QA / release-readiness track

`QA CERTIFICATION: NOT READY`

The last application-bearing SHA `e4ee4ebde489629ee74429b4e37abb511943a51e` passed hosted exact-SHA application certification and separate supplier-payables QA certification.

At that certified state:

- QA and production Supabase projects were independently distinct;
- repository/QA migration parity matched `20260912082656_supplier_payables_settlement_consistency`;
- hosted authentication persisted;
- route contracts passed;
- authenticated Storage upload/read/hash/cleanup passed;
- supplier-payables authenticated QA assertions passed;
- no uncontrolled email or SMS was sent.

Overall QA remains not ready because broader readiness/provider limitations remain:

- Wave 4D provider-backed completion/runtime evidence is incomplete;
- SMS has approved provider paths but no controlled configured runtime-certified deployment yet;
- Gmail exact-state provider proof may require reauthorization;
- subcontract settlement remains fixture-blocked where no safe fixture exists;
- optional server-authority company-template upload/converter capability remains environment-limited unless separately enabled/certified;
- UI/UX Round 2 will create a new application-bearing SHA that will require appropriate post-merge evidence before it can inherit release-readiness claims.

Production remains read-only unless separately and explicitly authorized under `docs/CHATGPT_MIGRATION_OPERATOR_POLICY.md`.

A green PR, merge, Render deploy, QA success, or documentation update does not authorize production database/Auth/Storage/secret writes or migration promotion.

## Permanent financial / security / history boundaries

Preserve throughout remaining work:

- one deployment -> one client company;
- RLS/RBAC/company isolation;
- Supplier Invoice evidence remains separate from authoritative linked Expense payable/cost truth;
- Client Invoice/Collection receivable truth remains separate from Cash & Banking settlement evidence;
- Actual Cost remains distinct from Committed Cost;
- `projects.contract_value` remains distinct from `projects.project_budget`;
- original currency remains explicit and mixed currency is not silently summed;
- payroll privacy, calculation freshness, approval authority, and settlement history remain intact;
- Purchase Order receipt/close rules remain intact;
- inventory movement/allocation history remains explainable/authoritative;
- immutable issued/finalized document snapshots and provenance remain intact;
- send/delivery history remains append-only and company-bound;
- Assistant consequential actions remain `prepare -> review -> human confirm -> execute`;
- navigation simplification is never authorization simplification.

## Worker Registration gate

**PAUSED.**

Worker Registration must not be suggested/prepared as the next implementation phase while UI/UX Round 2 is active. After UI/UX Round 2, resume and complete Wave 4D first unless the user explicitly changes the sequence. Worker Registration still requires explicit user resumption.
