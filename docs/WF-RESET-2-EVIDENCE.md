# WF-RESET-2 — Workflow cleanup and restored QA recovery

Date: 2026-10-12. Base/source under certification:
`1486caddfc035352629e401f24234c9f3176b3e5`.
Implementation branch: `codex/wf-reset-2`; exact final head and PR CI are
recorded by the PR. This report covers developer tooling and QA readiness,
not a new application capability, production release or provider certification.

## Cleanup and consumer decisions

- Audited imports, package declarations, CLI commands, tests, context generation,
  Workflow Map/RI and GitHub workflows. Normal `agent:context` and deterministic
  affected selection have no automatic Jev call, setup check or retry to remove.
- Retained optional TypeSafe CLI/SDK and its tests. Context, test/CI triage,
  completion and deliberate benchmarks have explicit supported consumers.
  The v2A fixtures support safety/calibration regressions; they are not unused
  application code. Removing them would discard useful optional functionality.
- Replaced six eager CLI runtime imports with per-command dynamic imports.
  Help/parsing works with neither advisory modules nor SDK present; command
  behavior, explicit live opt-in and deterministic fallback remain unchanged.
- Added an isolated subprocess regression that copies only the CLI entrypoint
  and verifies help/invalid arguments without neighboring advisory modules.
- Marked Jev research checkpoint schedules as historical/optional. No real
  Jev/AI advisory request, doctor, benchmark, retry or context packet was run.
- Replaced 2,550-line roadmap and 3,431-line handoff with short current records
  (approximately 5 KB and 4 KB). Complete former content is retained in
  `HYDROQUALISENSE_ACTIVE_ROADMAP_HISTORY_THROUGH_20261012.md` and
  `HYDROQUALISENSE_CURRENT_HANDOFF_HISTORY_THROUGH_20261012.md`.
  Verified normalized archive suffixes exactly match starting-main originals.
  Same-directory placement retains relative link bases. No old fragment-link
  consumers were found; canonical active paths remain available.
- Updated the active brief and documentation index for restored QA, merged
  #297/#298, current hardening priorities and deferred capability boundaries.
- No package/dependency, Workflow Map graph, required CI status, branch protection,
  application behavior, schema, migration or financial/security authority changed.

## Live QA evidence

QA Supabase `vrpuznofrntyqsbugrib` is `ACTIVE_HEALTHY`. Independent connector
reads succeeded (PostgreSQL 17.6). The protected workflow independently confirms
153 local / 153 remote migrations, no mismatches, canonical head
`20260927095636`, `needsPromotion=false` before and after the gate.
No migration was applied and no QA reset performed.

QA Render health and protected readiness both prove `environment=qa`,
`deploymentId=qa-hydroqualisense`, exact deployed SHA
`1486caddfc035352629e401f24234c9f3176b3e5`, migration `20260927095636`.
The actual Session Pooler `aws-0-ap-southeast-1.pooler.supabase.com` is recorded
by the successful protected connection/parity artifact; no hostname was guessed
or changed. Render MCP had no selected workspace; the known QA health endpoint
and protected readiness artifact supplied deployed identity without opening a
browser or changing workspace/service configuration.

[Protected release 38250226212](https://github.com/Juvialski/InvoiceApp/actions/runs/38250226212):
classification and protected promotion/parity gates **PASS**. Hosted QA:
authentication, exact release identity, QA/company markers and Storage byte
probe/cleanup **PASS**; routes **8/9 PASS**, zero console/page/request errors.
The only failure is a stale payroll helper-copy assertion. The captured current
page shows the protected-history guidance, period summary and settings sections.
The harness now checks those current elements, with a source-alignment regression.
This is a test-contract fix; payroll product/financial behavior is unchanged.

[Explicit workbook certification 38250823063](https://github.com/Juvialski/InvoiceApp/actions/runs/38250823063)
runs against the same deployed base after independently passing protected parity.
The matrix step and manifest are **PASS**: nine-sheet XLSX export/parsing,
stale conflict rejection with Apply disabled, eight protected-field checks,
explicit per-domain confirmation, five-sheet writes/authoritative refresh,
Project/Cost Code explicit blank persistence and RFQ/PO line preservation.
Console/page/request error counts are all zero. Laptop 1280x800 and phone
390x844 editor/review/Apply captures were inspected. Controls are reachable;
phone review tables are dense and horizontally scroll within their sections,
so this does not claim app-wide visual perfection. Alternate read-only/manage-only
profiles, company-context switches, induced partial-Apply failure and intermittent
REL-AUTH-1 verification were not exercised. Synthetic QA fixture edits are
retained by the existing harness; this was not a read-only workbook test. The first release
run did not request the matrix: explicit hosted recovery and workbook-matrix
selection are separate existing inputs. No security gate was bypassed.

Starting-main QA results do not certify this PR's newer head. The corrected
harness must be rerun through the guarded exact-source process after merge.
The failed original assertion remains visible in Actions; no green claim is made.

## Validation

- Advisory CLI/safety/calibration tests: **44/44 PASS**, offline/mock only.
- Hosted QA/release configuration, orchestration and contract tests: **39/39 PASS**.
- Final integrated affected selection: **76/76 PASS**, 11/399 files (2.8%),
  no fallback, database unaffected. An earlier 75/75 run preceded the concrete
  hosted payroll finding; only that new executable fix justified the final rerun.
- ESLint and TypeScript: **PASS**. Optional CLI help smoke: **PASS**.
- Final diff/archival preservation and active-link review: **PASS**.
- Full suite, build, local browser/Docker/Supabase and extra graph checks skipped:
  no runtime bundle, schema, permission, financial authority or graph change;
  focused/affected coverage and protected PR CI supply applicable evidence.
  Existing scheduled full regression and all four protected PR statuses retained.

## Claim limits and next action

Production `qijjshdwiylojvqojxyz` was neither queried nor modified. No live
provider message was sent. No user Chrome/Edge profile, visible browser,
desktop automation or local browser process was used. Zero subagents.
Raw downloaded QA artifacts/screenshots remain ignored; durable reporting uses
sanitized aggregates and Actions links, with no account identifiers or secrets.

This run verifies the configured QA account's authentication and route access,
not a complete multi-role/RLS/RPC penetration matrix. Supplier invoice review,
all consequential finance/payroll/receipt scenarios, real provider delivery and
authenticated converter-backed templates are not certified by nine route checks
or the five-sheet workbook matrix. Those boundaries need separately scoped
applicable runtime evidence; no broader company simulation/provider AI workflow
was dispatched merely to widen this developer-cleanup phase.

ChatGPT should review the exact PR head/CI, merge safely, then rerun the guarded
hosted checks with the corrected assertion and inspect applicable responsive
artifacts. Codex must not merge its own PR or begin unrelated product work.
