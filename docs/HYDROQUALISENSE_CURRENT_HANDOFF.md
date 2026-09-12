# HydroQualiSense Current Handoff

Status: **CURRENT — PR #158 MERGED / CURRENT MAIN HOSTED EXACT-SHA QA CERTIFIED / SUPPLIER PAYABLES CERTIFIED IN ISOLATED QA / WAVE 4D SMS PROVIDER IMPLEMENTATION IN PROGRESS / QA CERTIFICATION NOT READY / WORKER REGISTRATION PAUSED**
Date: **2026-09-12**
Repository: `Juvialski/InvoiceApp`

## Authoritative current baseline

The exact current application-bearing `main` SHA is:

`e4ee4ebde489629ee74429b4e37abb511943a51e`

That commit is merged PR #158, **fix supplier payable settlement truth**. It is the exact SHA currently served by the QA Render deployment and certified by the recovered Hosted QA run.

Relevant integrated work includes:

- Wave 1A Supplier Payable Lifecycle UX — PR #126;
- Wave 1B Client Receivable Lifecycle UX — PR #129;
- Wave 2 Cross-module Routing and Handoffs — PR #131;
- Wave 3 Payroll/Subcontract/PO Workflow Decisions — PRs #132 and #133;
- Wave 4A Company Document Templates / Mail Merge Foundation — PR #134;
- Wave 4B High-Fidelity PDF Finalization Foundation — PR #135;
- Wave 4C Outbound Issued-Document Gmail Delivery & Delivery History — PR #136;
- Wave 4D Email/SMS + Documents workspaces — integrated through PR #138 but still incomplete;
- full live-QA simulation harness and observed-flow hardening — PR #140;
- focused UI/UX remediation + connected Gmail QA audit — PR #144;
- Local-QA + canonical issued-PDF preview/download foundation — PR #146;
- staged Local-QA/UI/PDF quality plan — PR #147;
- Local-QA browser-key hardening — PR #148;
- comprehensive authenticated Local-QA UI/UX redo — PR #150;
- deep programmatic-PDF visual certification — PR #151 and subsequent document-quality work;
- Supplier Invoice monetary correction + buyer simplification work through PRs #152/#155;
- Phase 3 supported/fixture-backed Local-QA functional regression sweep — PR #155;
- Supplier Payables Settlement Truth & Consistency corrective phase, including migration `20260912082656_supplier_payables_settlement_consistency` — merged PR #158.

Read this handoff with:

- `AGENTS.md`;
- `docs/AGENTS_BASELINE_20260909.md`;
- `docs/AGENT_EXECUTION_EFFICIENCY.md`;
- `docs/CHATGPT_MIGRATION_OPERATOR_POLICY.md` when release/migration operations matter;
- `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`;
- `docs/HYDROQUALISENSE_LOCAL_QA_UI_PDF_PLAN.md`;
- `docs/HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md`;
- `docs/HYDROQUALISENSE_DEPLOYMENT_RUNBOOK.md` for release/provider operations.

Live repository state and `AGENTS.md` override remembered chat summaries.

## Completed quality sequence

### Phase 1 — Comprehensive authenticated Local-QA UI/UX redo — COMPLETE

PR #150 completed the authenticated Local-QA UI/UX pass against the isolated QA backend. The final evidence covered all canonical routes, responsive targets, dialogs, owner handoffs, project workspaces, and safe Compose review with a fail-closed coverage gate.

### Phase 2 — Programmatic PDF visual certification — COMPLETE

Purchase Order and Client Invoice programmatic PDF fallback output was visually remediated and certified across deliberate edge cases including logo geometry, long company/project/document values, large currency values, long terms/notes, narrow cells, and multi-page content.

Authenticated Local-QA evidence confirmed both issued document types use `PROGRAMMATIC_PDF_FALLBACK`, with Preview and Download using identical bytes for the exercised records. This does not certify company-template high-fidelity PDF conversion when the optional converter is unavailable.

### Phase 3 — Functional regression sweep — COMPLETE for supported/fixture-backed workflows

The integrated Local-QA rerun recorded 57/57 authenticated route scenarios and 7/7 functional workflows passing:

- RFQ creation/quotation comparison;
- partial Purchase Order receipt, remaining quantity, close guard, and Warehouse continuation;
- Supplier Invoice -> authoritative Expense -> Cash routing;
- Client Invoice -> Collection -> Cash routing;
- Payroll freshness/recalculation/approval;
- Documents -> Compose review without send;
- stale-record/deep-link recovery.

The RFQ coverage defect was a stale harness-tab assumption and was corrected without weakening the fail-closed gate. The Payroll defect was fixed by sharing one reduced payroll-period identity between calculation and approval fingerprints, preventing a fresh recalculation from falsely invalidating itself as stale.

The QA company still has no safe subcontract/claim fixture, so subcontract settlement remains `NOT TESTED`/fixture-blocked rather than a pass.

## Corrective phase — Supplier Payables Settlement Truth & Consistency Audit

This corrective implementation is complete on merged PR #158 and is certified against the exact current QA deployment.

The observed supplier-payables inconsistency had three related causes:

- verification intentionally created the linked supplier `Expense` as `DRAFT`, but the generic Expense settlement gate rejected every DRAFT Expense;
- linked-invoice summaries treated the invoice as transferred with a zero payable, so the Supplier Invoice overview and downstream open-payable counts dropped the record;
- directory badges, overdue counts, correction previews, and several project/report helpers read persisted extraction/document payment fields instead of one current cash-backed settlement projection.

The corrected contract is:

- the verified linked Expense is the one supplier payable/settlement authority, including when it remains DRAFT; generic direct DRAFT Expenses retain their existing ineligible behavior;
- payment state is derived from confirmed Cash & Banking matches only. OCR/document `amountPaid` is preserved as separate evidence and cannot make an obligation paid or reduce its outstanding balance;
- both canonical Expense matches and legacy invoice-target matches are aggregated once for the linked supplier relationship. Reversal is history-preserving and restores outstanding balance;
- date-only overdue means positive outstanding with `due_date <` the company business date. The due date itself is current;
- verified project cost and source-document provenance do not change when settlement evidence is created or reversed.

The shared projection now feeds Supplier Invoices, linked Expense detail, Cash & Banking candidate/target context, Dashboard, Projects, Reports, Assistant, correction previews, and invoice/project exports. Local evidence on this branch is clean Supabase replay/pgTAP (45 files, 1,531 tests), focused TypeScript/domain tests, build/lint, and demo browser QA (78 scenarios, 34 routes, 4 viewports, 59 interactions, zero console/page/network/overflow failures). These results are local/pre-merge evidence; they do not certify the hosted QA deployment.

The forward migration `20260912082656_supplier_payables_settlement_consistency` is present on current `main`. The protected QA release promoted that exact canonical migration to QA after the exact application SHA was live and independently verified migration parity afterward. Production migration was separately promoted under explicit authorization before this final handoff; this phase performed no production write.

### Supplier-payables QA certification evidence

The authenticated QA financial certification passed 12/12 assertions using a transaction-scoped synthetic fixture and the committed verification/settlement RPCs. It proved:

- document/OCR `amountPaid` remained evidence only and did not produce an operationally paid obligation;
- verification created exactly one linked `DRAFT` Expense, and repeated verification was idempotent;
- the linked Expense was the settlement authority, while generic direct `DRAFT` Expenses remained ineligible;
- legacy invoice-target evidence remained visible through the linked Expense projection;
- confirmed Cash & Banking evidence produced correct partial and full paid/outstanding values, and reversal restored outstanding balance while preserving history;
- the active linked invoice target was denied, project allocation/source linkage remained intact, cross-company summary access was denied, and RPC execution grants remained restricted to `authenticated` where intended.

The synthetic certification transaction rolled back its fixture rows after the assertions, so it left no additional supplier-payables records in QA.

## Phase 4 — Hosted exact-SHA QA certification — COMPLETE for current main

Certified application SHA:

`e4ee4ebde489629ee74429b4e37abb511943a51e`

### Exact QA identities

- Render QA service: `srv-dafno1id0e5s73d6e3b0`
- Render deployment at certification: `dep-daidc37qj5pc73ac6ta0`
- QA URL: `https://hydroqualisense-qa.onrender.com`
- logical deployment ID from health: `qa-hydroqualisense`
- QA Supabase project: `vrpuznofrntyqsbugrib`
- production Supabase project: `qijjshdwiylojvqojxyz`

The QA and production project identities were independently inspected and are distinct. Production remained read-only.

### Migration parity

Canonical repository migration head:

`20260912082656_supplier_payables_settlement_consistency`

The protected release found QA one migration behind, promoted only the missing canonical `20260912082656_supplier_payables_settlement_consistency` migration through the guarded QA path, and independently verified parity afterward. The connected QA inspection now ends at the exact same version/name as the repository.

The production migration was separately promoted under explicit authorization. This phase performed no production database, Auth, Storage, secret, or environment write; production was read-only for identity/parity verification.

### Exact hosted runtime evidence

`/api/health` matched:

- environment `qa`;
- deployment ID `qa-hydroqualisense`;
- repository SHA `e4ee4ebde489629ee74429b4e37abb511943a51e`;
- migration level `20260912082656`.

The protected hosted certification established:

- email/password QA authentication succeeded and persisted;
- unauthenticated `/settings` returned the sign-in boundary;
- all 9 hosted route contracts passed on the same exact SHA;
- zero console errors, page errors, and failed network requests on the successful attempt;
- the QA banner and synthetic deployment company identity were visible across hosted routes;
- the authenticated engineering-document Storage probe uploaded a small synthetic PDF object, read it back with an identical SHA-256, and removed it successfully;
- the Storage probe created zero metadata rows.

The first Hosted QA attempt in Protected QA Release run `34689351709` failed only in authentication preflight: no persisted Supabase session was established and the browser surfaced provider response `Failed to fetch`. Health/deployment identity had already passed. The failed Hosted QA job was retried against the **same SHA**, with no deployment, migration, configuration, or code change, and passed cleanly. The initial transient failure remains part of the evidence rather than being hidden.

### Current-tree scope and limitations

The Hosted QA harness proves exact deployment/identity/auth/route/Storage certification of the current merged application tree. It does not falsely claim to have re-clicked every earlier functional workflow; the supplier-payables behavior is covered separately by the 12/12 authenticated QA RPC certification recorded above.

PR #158 does not weaken the existing RFQ, Payroll, programmatic-PDF, document-delivery, or Documents -> Compose boundaries. Documents -> Compose retains the explicit `Preview / Review` -> `Confirm & Send` human boundary and no uncontrolled email or SMS was sent.

## Current provider and optional-capability truth

### Gmail

The exact hosted QA UI currently reports that Gmail authorization is expired or revoked and needs reconnection. Compose/review remains available, but live Gmail sync/send is **not certified for this exact state**. No uncontrolled external email was sent during Phase 4.

### SMS

The approved outbound choices are Company SIM Gateway (primary/recommended) and PhilSMS (optional hosted fallback). This implementation has no live gateway device or PhilSMS credentials available for runtime certification, so the UI remains truthful: SMS is not configured or not verified and no SMS was sent.

### Company-template upload / conversion

- server-authority safe-link template upload remains environment-limited where the required server-only Supabase Storage credential is absent;
- the native QA runtime does not expose the supported LibreOffice/`soffice` converter, so high-fidelity company-template PDF conversion remains `UNAVAILABLE`;
- programmatic PDF fallback remains separate and certified; do not represent converter scaffolding as converter runtime certification.

### Subcontract settlement

No safe subcontract/claim fixture exists in the QA company. This remains `NOT TESTED`/fixture-blocked.

## QA / production boundary

`QA CERTIFICATION: NOT READY`

Hosted exact-SHA certification and supplier-payables certification are complete for current `main`, but overall QA readiness is intentionally still not `READY` because:

- Wave 4D messaging-provider implementation and runtime evidence are incomplete;
- SMS has approved paths but no configured/provider-backed runtime-tested deployment;
- Gmail currently requires reauthorization for exact-state runtime proof;
- subcontract settlement remains fixture-blocked;
- optional server-authority template upload / high-fidelity company-template conversion retain documented environment limitations.

Do not weaken this gate merely because the core hosted exact-SHA release check is green.

Production remains read-only unless the user separately and explicitly authorizes a production operation under the migration/operator policy. The production migration promotion was a separate explicitly authorized operation; this final QA recovery/certification phase performed no production database, Auth, Storage, migration, secret, or environment write.

## Financial / security / history invariants

Preserve throughout all remaining work:

- one deployment -> one client company;
- active company membership / RLS / RBAC isolation;
- Supplier Invoice evidence remains distinct from authoritative linked Expense payable/cost truth;
- Client Invoice/Collection receivable truth remains distinct from Cash settlement evidence;
- Actual Cost remains distinct from Committed Cost;
- original-currency and explicit FX semantics remain intact;
- payroll settlement history and authority remain intact;
- Purchase Order receipt/close rules remain intact;
- immutable issued/finalized snapshots and artifact provenance remain intact;
- send/delivery history remains append-only and company-bound;
- permissions remain capability-based;
- Assistant consequential actions retain `prepare -> review -> human confirm -> execute`.

Do not weaken these boundaries to simplify provider work or QA.

## Required sequence from this handoff

1. **Comprehensive authenticated Local-QA UI/UX redo — COMPLETE**
2. **Deep PDF/export visual certification — COMPLETE for programmatic fallback**
3. **Company-template compatibility implementation — COMPLETE; converter runtime certification remains environment-limited**
4. **Functional regression sweep — COMPLETE for supported/fixture-backed Local-QA workflows**
5. **Supplier Payables Settlement Truth & Consistency Audit — COMPLETE in merged PR #158; 12/12 authenticated QA assertions passed**
6. **Hosted exact-SHA QA certification — COMPLETE for current `main` at `e4ee4ebde489629ee74429b4e37abb511943a51e`**
7. **Wave 4D messaging-provider selection/integration — IN PROGRESS**
8. **Wave 4D remaining readiness/completion evidence**
9. **Worker Registration — PAUSED until Wave 4D is genuinely complete and the user explicitly resumes it**
10. Site Attendance
11. Face-Recognition Attendance — design/privacy/security first
12. Final pre-production security/data-integrity certification

## Active implementation phase — Wave 4D messaging-provider selection/integration

Do not start Worker Registration.

The active implementation integrates the two approved practical SMS paths under the authoritative Wave 4D contract. It preserves:

- Company SIM Gateway as the primary/recommended private-server path;
- PhilSMS as the optional hosted Philippine fallback;
- the shared delivery intent/audit history rather than a competing SMS table;

- server-side provider credentials only;
- permission-aware send authority;
- explicit human review/confirmation before consequential sends;
- idempotency and duplicate-send protection;
- bounded retry/reconciliation;
- normalized delivery/failure state;
- delivery webhook/status handling where supported;
- company isolation and append-only delivery history;
- truthful UI states when provider capability is unavailable;
- no bulk unsolicited marketing scope.

The live official upstream contracts were checked for the implementation: Android private-server API paths/authentication/device status and PhilSMS API/Bearer/send/status/balance behavior. Provider account pricing, Sender ID approval, gateway/device health, and controlled QA delivery still require live deployment evidence; do not infer them from configuration or mocks.

Inbound Android SMS/reply ingestion is intentionally deferred to a separate bounded enhancement. Outbound SMS, safe status lookup, and the human-confirmed send boundary are the priority in this phase.

## Implementation workflow

For the active provider implementation and its QA follow-up:

- fetch and fast-forward current `main` and record the exact SHA once;
- read live `AGENTS.md`, baseline, efficiency guide, roadmap, this handoff, Wave 4D contract, and deployment/provider guidance;
- default to zero subagents; hard maximum two independent bounded subagents;
- generate at most one bounded context packet when useful;
- inspect existing provider adapter/delivery-history implementation before designing;
- keep credentials server-side and preserve the review/confirm boundary;
- run new/edited tests -> focused tests -> `npm.cmd run test:affected:agent` -> only relevant lint/build/browser/Workflow Map checks;
- use Docker/local Supabase only if DB/security/integrity contracts change;
- do not run `test:full` by ritual;
- review the complete final diff;
- push a feature branch and open a PR;
- Codex must not merge its own PR.

## Stop boundary

Do not let Wave 4D provider work expand into Worker Registration, Site Attendance, Face Recognition, broad CRM redesign, marketing/bulk messaging, unrelated AI redesign, or a new DB domain without validated scope.

Worker Registration remains paused until Wave 4D is genuinely complete and the user explicitly resumes it.

This final phase stopped after Hosted QA recovery, supplier-payables certification, and documentation synchronization. No SMS runtime certification and no Worker Registration were started.
