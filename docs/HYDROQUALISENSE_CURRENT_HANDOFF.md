# HydroQualiSense Current Handoff

Status: **CURRENT — PHASE 4 HOSTED EXACT-SHA QA CERTIFICATION COMPLETE / WAVE 4D SMS PROVIDER IMPLEMENTATION IN PROGRESS / QA CERTIFICATION NOT READY / WORKER REGISTRATION PAUSED**
Date: **2026-09-12**
Repository: `Juvialski/InvoiceApp`

## Authoritative current baseline

The exact application-bearing `main` SHA certified in Phase 4 is:

`32e5faf3666095391e7df09244ac0f0bb4479c81`

That commit is PR #155, **Complete Phase 3 local QA functional regression sweep**.

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
- Phase 3 supported/fixture-backed Local-QA functional regression sweep — PR #155.

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

## Phase 4 — Hosted exact-SHA QA certification — COMPLETE

Certified application SHA:

`32e5faf3666095391e7df09244ac0f0bb4479c81`

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

`20260911141452_supplier_invoice_buyer_simplification`

Live QA migration history ended at the same exact version/name both before and after the protected release check. The guarded migration-promotion step was skipped because parity already existed. **No QA migration write occurred in Phase 4.**

No production migration was promoted or modified.

### Exact hosted runtime evidence

`/api/health` matched:

- environment `qa`;
- deployment ID `qa-hydroqualisense`;
- repository SHA `32e5faf3666095391e7df09244ac0f0bb4479c81`;
- migration level `20260911141452`.

The protected hosted certification established:

- email/password QA authentication succeeded and persisted;
- unauthenticated `/settings` returned the sign-in boundary;
- all 9 hosted route contracts passed on the same exact SHA;
- zero console errors, page errors, and failed network requests on the successful attempt;
- the QA banner and synthetic deployment company identity were visible across hosted routes;
- the authenticated engineering-document Storage probe uploaded a small synthetic PDF object, read it back with an identical SHA-256, and removed it successfully;
- the Storage probe created zero metadata rows.

The first hosted attempt recorded transient browser-side Supabase CORS failures only on `/dashboard`. The single hosted job was retried against the **same SHA**, with no deployment, migration, configuration, or code change, and passed cleanly. The initial transient failure remains part of the evidence rather than being hidden.

### Phase 3-sensitive behavior on the certified tree

PR #155 changed the Local-QA harness/scenarios, Payroll freshness code/tests, and phase-status documentation. It did **not** change the programmatic PDF renderer, document delivery implementation, SMS provider implementation, or template-conversion implementation.

Therefore:

- the RFQ-tab coverage correction is present in the certified merged tree;
- the Payroll freshness correction is present in the certified merged tree and has focused regression coverage;
- programmatic Purchase Order / Client Invoice Preview/Download behavior retains the Phase 2/3 evidence on the same application tree;
- Documents -> Compose retains the explicit `Preview / Review` -> `Confirm & Send` human boundary and Phase 3 did not auto-send anything.

The route-focused hosted harness is not represented as having re-clicked every Phase 3 functional interaction. Its role is exact deployment/identity/auth/route/Storage certification of the merged application tree.

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

Phase 4 hosted exact-SHA certification is complete for the current application baseline, but overall QA readiness is intentionally still not `READY` because:

- Wave 4D messaging-provider implementation and runtime evidence are incomplete;
- SMS has approved paths but no configured/provider-backed runtime-tested deployment;
- Gmail currently requires reauthorization for exact-state runtime proof;
- subcontract settlement remains fixture-blocked;
- optional server-authority template upload / high-fidelity company-template conversion retain documented environment limitations.

Do not weaken this gate merely because the core hosted exact-SHA release check is green.

Production remains read-only unless the user separately and explicitly authorizes a production operation under the migration/operator policy. Phase 4 performed no production database, Auth, Storage, migration, secret, or environment write.

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
5. **Hosted exact-SHA QA certification — COMPLETE for `32e5faf3666095391e7df09244ac0f0bb4479c81`**
6. **Wave 4D messaging-provider selection/integration — IN PROGRESS**
7. **Wave 4D remaining readiness/completion evidence**
8. **Worker Registration — PAUSED until Wave 4D is genuinely complete and the user explicitly resumes it**
9. Site Attendance
10. Face-Recognition Attendance — design/privacy/security first
11. Final pre-production security/data-integrity certification

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
