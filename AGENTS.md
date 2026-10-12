# HydroQualiSense / InvoiceApp — Agent Rules

Applies to `Juvialski/InvoiceApp`. Updated 2026-10-12 (WF-RESET-1).

## Authority and reading order

1. **This file** is the current development/agent operating policy. Later instructions in this file override historical agent plans.
2. Read `docs/ACTIVE_DEVELOPMENT_BRIEF.md` for a short current-state index. Read the applicable portion of `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`, `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`, product direction, phase design, or runbook **only when relevant**. The large roadmap/handoff contain historical evidence; their older "next" labels are not current commands.
3. `docs/AGENTS_BASELINE_20260909.md` preserves earlier **product/domain safety invariants and specialist contracts**. It is **not** authority for old agent limits, model requirements, startup rituals, mandatory Jev calls, full-suite habits, or superseded phase order.
4. For database promotion/release, `docs/CHATGPT_MIGRATION_OPERATOR_POLICY.md` and applicable deployment runbooks control the operation. For financial/workbook semantics, consult the relevant domain contract.
5. **Live source, latest `main`, and exact PR-head evidence override old reports, phase notes, or remembered chat summaries.** Never infer that a feature is delivered or certified from a historical plan.

## Permanent product and data boundaries

- Architecture: **one repository -> isolated deployments -> one client company per deployment**. Each client gets separate Render/Supabase/Auth/Storage/secrets. Keep company-scoped `company_id`, membership, grants/RLS, foreign-key/integrity validation, storage prefixes, and audit controls as defense in depth. Never introduce unrelated-company switching or cross-client data access.
- Keep `projects.contract_value` distinct from `projects.project_budget`; committed cost distinct from actual cost; supplier evidence distinct from the one canonical expense/payable; client invoices/collections distinct from supplier obligations; settlement/reconciliation evidence distinct from paid/collected truth.
- Derived figures must not replace authoritative records. Preserve original currency, require authoritative FX evidence before aggregating currencies, and do not infer unresolved VAT/withholding/BIR or FX policies.
- Maintain one canonical identity per business entity. AI/imported identity is provisional evidence until resolved. Never create duplicate financial truth or destructive inventory balances.
- Preserve immutable/traceable histories and explicit correction paths for verified, approved, issued, settled, paid, voided, reversed, or otherwise finalized records. Preserve idempotency, optimistic concurrency, security- and company-bound constraints.
- Payroll details remain permission-scoped; summary figures cannot broaden visibility. Biometric expansion requires prior privacy/consent/security design.
- All consequential AI-assisted writes must preserve prepare -> validate -> human review/confirmation -> execute. Simplifying UI must never weaken authorization, financial authority, source provenance, review-before-Apply, or lifecycle safety.
- Keep the **browse visually -> edit like a spreadsheet -> execute sensitive workflows deliberately** UX grammar. Protect spreadsheet fields, stale-workbook conflict review, controlled Add Row, and real supported XLSX round trips; do not create SQL columns from arbitrary worksheet edits.
- The current **hardening-first / net-new feature freeze** remains in force. Worker/site attendance, biometrics, broad new finance/warehouse/custom-field and deferred workbook expansion require explicit user reprioritization. Provider readiness and existing-document certification are separate, truthful gates.

## Codex execution: direct, bounded, minimal overhead

- **Codex is the implementation lead.** Default **0 subagents**; maximum **2** concurrent only for genuinely independent tasks with defined ownership and stop boundaries. The lead never waits idle for subagent results, and owns architecture, shared integration, security/financial/DB interpretations, final diff, validation and PR.
- At the start of a new implementation: `git fetch origin main`, fast-forward clean local `main`, record the SHA once, create a branch. Preserve local work via a separate worktree if necessary. Do not repeatedly audit old commits, previous PRs, or historical CI at startup.
- Read this file and only task-relevant implementation/contracts. Inspect existing code **before** designing or editing. Use at most one bounded `npm.cmd run agent:context` packet **when the task is broad enough to benefit**; for a clear small task, skip it. The Repository Intelligence/Workflow Map remain optional discovery tools and their deterministic contracts stay intact.
- **TypeSafe/Jev advisory calls are opt-in, not standard checkpoints.** No mandatory `context`, `test-triage`, `completion`, `doctor`, `benchmark`, or SDK installation solely to satisfy a workflow ritual. Use Jev only for a concrete difficult selection/CI question with expected measurable value; it never determines financial/security policy, required tests, PR decisions, or production actions. Fail closed to deterministic source/tests without retries on optional advisory setup failure.
- Prefer one **coherent bounded delivery** including related implementation, tests, UI finish and documentation, rather than micro-PRs for adjacent finishing touches. Do not bundle independent financial/DB/authorization domains or expand scope because time or tokens remain.
- Don't open the user's Chrome profiles or interactive browser/desktop during local implementation. If browser QA is necessary, use isolated headless automation in its own profile and avoid interfering with active work.
- Codex completes implementation, reviews its exact final diff, pushes a feature branch and opens a PR. **Codex must not merge its own PR.** ChatGPT performs proportional exact-head review, fixes blockers where necessary, and merges automatically **when safe**.

## Validation: tests stay, duplicated reasoning goes

- While editing: new/modified tests and the smallest relevant domain checks. On the integrated final executable diff: `npm.cmd run test:affected:agent` **once** where applicable; lint/build/browser/Workflow Map only when changed risk requires them or CI is not supplying equivalent evidence.
- Do **not** rerun the historical full suite by habit. `test:full` is justified by impact-selection fallback, an actual broad shared contract, a failing check, a release/deep-regression need, or explicit user request. Keep the scheduled independent full regression.
- **Database/security/inventory/financial integrity changes** require relevant runtime proof, not merely static SQL inspection: clean local Supabase migration replay, pgTAP, upgrade-path, RLS/RPC/grant, concurrency or row-lock checks as applicable. Do not start Docker/Supabase for UI-, policy-, or documentation-only changes.
- Four protected PR check names must remain stable: `Application Validation & Build`, `Database Migrations & Upgrade Suite`, `chromium-demo-qa`, `Graph and Source Contract Consistency`. Keep their domain-sensitive fast-pass logic and fail-closed behavior on unknown paths; don't use path filters that suppress a required job entirely.
- Review the **exact changed-file list and complete relevant diff first**, classify risk, then inspect only applicable checks on that exact head. A previous commit's green CI is not evidence for a newer head. Documentation-only PRs require policy/consistency review, not app/browser/database replay; eligible auto-merge may be enabled.
- On failure: inspect -> diagnose -> justified correction -> narrow rerun -> applicable final evidence. Do not repeat unchanged failure runs, recreate screenshots after documentation edits, or spawn late review subagents.
- Stop when the final diff, relevant evidence, and scope are satisfactory; don't start generic second opinions, extra Jev completion passes, duplicate local CI, or unrelated audits.

## QA, release and deployment guardrails

- QA migration path: exact intended commit -> verify target and migration history -> apply only canonical missing forward migrations -> independent parity verification -> applicable hosted QA. Never certify stale source or divergent migration history.
- The protected QA release pipeline is preferred when healthy. When approved, ChatGPT may use connected tools under `docs/CHATGPT_MIGRATION_OPERATOR_POLICY.md` with exact-target safeguards. Do not generate different migration versions for existing committed timestamped migrations.
- **Production migration writes require the user's explicit authorization for the precise deployment/client or fleet.** Merge, QA certification, a Render deployment, or a generic "continue" instruction is not production authorization. Verify target, backup/recovery prerequisites, forward-history integrity, post-promotion parity and security.
- A release CI failure caused by a remote QA connection is a release blocker until resolved, not a reason to skip target-isolation, migration parity, or authentication checks. Hosted/provider claims require real applicable evidence.

## Documentation and handoff — keep it short

- On a product/capability/policy change, update the **small current-state brief** and only the roadmap/handoff/domain/Settings entries whose truth materially changed. Update client-facing Settings Features & Roadmap only when real usable capability or status changed. Never put engineering details in client-facing roadmap copy.
- Ordinary test-only or internal refactor PRs do **not** require appending another historical essay to both multi-thousand-line files. Keep historical evidence accessible through Git history and existing phase reports.
- The final handoff states changed behavior, risk, tests performed/skipped, exact-head CI status, remaining blockers and real next priority. Mark incomplete functionality and external-provider gates honestly. Do not claim certification from compilation or scaffolding alone.
