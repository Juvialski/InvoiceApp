# HydroQualiSense Current Handoff

Updated **2026-10-12 (WF-RESET-2)**. Repository `Juvialski/InvoiceApp`.
This is the current takeover record; older phase logs are archived, not current
execution instructions. [AGENTS.md](../AGENTS.md) and live source govern work.

## Scope and source identity

- Base `main`: `1486caddfc035352629e401f24234c9f3176b3e5`.
- Branch: `codex/wf-reset-2`; final head is recorded by the implementation PR.
- One developer-workflow cleanup and QA-readiness phase. No product expansion,
  migration, production change or user desktop/browser interaction.
- Existing checkout/local-only marketing commits preserved; this phase uses a
  clean worktree from fetched `origin/main`.

## Workflow cleanup

- WF-RESET-1 (#297) establishes one Codex lead, optional context/Jev and
  proportionate final-diff validation. No automatic Jev consumer exists in
  `agent:context`, affected-test selection, Workflow Map, application or CI.
- QA-RECOVERY (#298) retains release classification while skipping remote QA
  for unrelated docs/tests/isolated marketing/release-tooling changes.
- Optional `npm run typesafe` remains supported: explicit CLI consumers,
  bounded ranking/triage and offline safety regressions justify retention.
  Commands now load only the selected implementation; help and parsing do not
  eagerly load advisory modules/SDK. No live Jev call made.
- Active roadmap/handoff contain actionable current state. Complete former
  content is preserved in same-directory archives so relative links retain
  their original base. Specs, financial/security contracts and evidence remain.
- Required protected check names, deterministic tests, DB/pgTAP/upgrade/RLS/RPC,
  scoped browser QA and scheduled full regression remain intact.

## QA recovery evidence

Live verification on 2026-10-12:

- QA project `vrpuznofrntyqsbugrib`: `ACTIVE_HEALTHY`; read-only PostgreSQL
  succeeds, server version 17.6.
- Canonical history: **153/153**, no missing/unexpected versions, exact order,
  migration head `20260927095636`. No promotion/reset needed.
- Render QA `/api/health`: `environment=qa`,
  `deploymentId=qa-hydroqualisense`, SHA
  `1486caddfc035352629e401f24234c9f3176b3e5`, migration `20260927095636`.
- Protected release with hosted certification enabled:
  [run 38250226212](https://github.com/Juvialski/InvoiceApp/actions/runs/38250226212).
  Parity **PASS**, hosted routes **8/9** (stale payroll assertion fixed in this PR).
  Explicit [workbook run 38250823063](https://github.com/Juvialski/InvoiceApp/actions/runs/38250823063)
  matrix **PASS**; responsive captures inspected. Overall hosted workflow remains
  red until the corrected assertion is run through the guarded release.
  Final results are in the [WF-RESET-2 report](WF-RESET-2-EVIDENCE.md).
- Production `qijjshdwiylojvqojxyz` was not queried or modified.

Starting-main certification does not certify the later implementation head.
Workflow/docs changes preserve separately identified application-bearing
evidence; exact-head PR CI remains required. Browser PASS alone does not
establish manual visual quality, provider readiness or production readiness.

## UX-RESET-1 — current implementation handoff

- Starting main: `3bf5db9460b972408b8037bfdc1dddb3822cd83e`; branch `codex/ux-reset-1`.
- Application-bearing commit: `fffda74308ef92f9de19ba574dd8314de848d759`. Later evidence-only commits retain this executable source; final PR HEAD and protected checks must be read from the PR.
- One lead, no subagents, no Jev calls, no context packet. Existing local marketing commits were preserved in the original checkout; this phase used a clean isolated worktree.
- Default daily navigation, task-first Home, supplier issue resolution/confirmation/payment continuation and compact stock entry are implemented. Existing routes/deep links, deployment visibility, permission filtering, source/Expense/settlement authority and worksheet Apply protections are retained.
- [Feature inventory](UX-RESET-1-INVENTORY.md), [visual/test evidence](UX-RESET-1-EVIDENCE.md) and [UX-RESET-2 specification](UX-RESET-2-WORKBOOK-SPEC.md) are the bounded deliverables. Broader workbook adapters remain planning-only.
- Local browser evidence uses isolated headless synthetic sessions; actual settlement submission, authenticated hosted certification and production deployment are not claimed. No database changes or promotion occurred. Codex must not merge its own PR.

## Next action and incomplete scope

UX-RESET-2 now supplies central staged row creation for Suppliers, Cost Codes, Direct Expense drafts and Warehouse catalog items, supported edits, exact source/workflow links, and shared light/dark UI corrections. Existing Warehouse updates remain read-only because their canonical service has no atomic expected-version input. Supplier Invoices remain a projection over canonical bills/payables. Materials, Equipment and Payroll have no new production workbook tabs; XLSX remains the legacy permission-filtered version-1 contract. [Current implementation evidence](UX-RESET-2-EVIDENCE.md) records local synthetic browser/persistence and visual scope; no production or hosted certification is implied. Review the implementation PR; Codex must not merge it.

The hardening-first freeze remains active. Use the
[active roadmap](HYDROQUALISENSE_ACTIVE_ROADMAP.md) for implemented/deferred scope.
Provider runtime, authenticated template/render readiness and marketing audio
remain separate gates. Inspect the exact implementation PR and CI, then
ChatGPT may review/fix/merge safely. Codex must not self-merge.

## History and specialist evidence

- [Complete previous handoff](HYDROQUALISENSE_CURRENT_HANDOFF_HISTORY_THROUGH_20261012.md)
- [Complete previous roadmap](HYDROQUALISENSE_ACTIVE_ROADMAP_HISTORY_THROUGH_20261012.md)
- [Hosted workbook history](HYDROQUALISENSE_HOSTED_QA_WORKBOOK_CERTIFICATION.md)
- [Migration operator policy](CHATGPT_MIGRATION_OPERATOR_POLICY.md)
- [Deployment runbook](HYDROQUALISENSE_DEPLOYMENT_RUNBOOK.md)
- [Evidence policy](REPOSITORY_EVIDENCE_POLICY.md)

Search a known phase only when needed; do not load historical archives as
ordinary startup context.
