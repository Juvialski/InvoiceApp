# InvoiceApp / HydroQualiSense Development & Agent Rules

These rules apply only to `Juvialski/InvoiceApp`.

The repository may remain named `InvoiceApp`, but the product is **HydroQualiSense**, developed by **HydroQualiSense Solutions Corp.**, with canonical product domain `https://hydroqualisense.com`.

## Architecture baseline

HydroQualiSense permanently uses:

`one source repository -> many isolated client deployments`

Every operational deployment remains:

`one deployment -> one client company -> active membership/RBAC -> permitted workflows`

Each unrelated client should have a separate Render service/deployment, Supabase project/database/Auth/Storage boundary, environment configuration and secrets. Do not add an in-app switch between unrelated client companies.

Keep `company_id`, company-prefixed Storage paths, RLS, membership/permission checks, company-bound foreign-key validation and audit boundaries as defense in depth even when a database contains only one active company.

## Current source of truth

Read these before deciding scope:

- `docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md`
- `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`
- `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md` for the current takeover snapshot
- `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md` when deployment/productization work matters
- `docs/AGENT_EXECUTION_EFFICIENCY.md` when implementation/testing workflow matters

Live repository state overrides remembered chat summaries, old prompts and historical Engoryx plans.

R5 Cross-Module Integration & Data-Contract Hardening is complete in PR #95. Current sequence unless explicitly reprioritized:

1. **Warehouse Inventory & Project Allocation**
2. **Public client funnel + repeatable isolated deployment/provisioning tooling** — bounded parallel work when independent
3. **Worker Registration foundation**
4. **Site Attendance state machine + device registration**
5. **Face-Recognition Attendance** — only after explicit design/privacy/security review
6. other client-confirmed requirements
7. **Final pre-production security/data-integrity certification** before broad rollout

Old Scheduling/Gantt/CPM, broad MRP/manufacturing expansion, autonomous accounting/AI posting and other historical Engoryx future phases are not authorized unless explicitly reconfirmed.

## Permanent product and financial rules

1. Project is operational context, but Finance, Payroll, Procurement, Engineering, Inventory, attendance and document history retain explicit source semantics.
2. Preserve `projects.contract_value` and `projects.project_budget` as distinct concepts unless a later approved contract explicitly changes them.
3. Actual Cost comes only from authoritative lifecycle-eligible sources; do not invent a competing total.
4. Committed Cost remains distinct from Actual Cost.
5. Supplier invoice evidence linked to an Expense must not become duplicate Actual Cost/payable truth.
6. Client Invoices/Collections remain distinct from supplier obligations and project Actual Cost.
7. Cash/bank settlement/reconciliation evidence must not double-count collection or payable truth.
8. Preserve original currency; never silently sum mixed currencies or invent FX. Base reporting requires authoritative conversion evidence.
9. Project payroll aggregates must not broaden payroll-detail visibility.
10. Finalized/verified/issued/paid/collected/voided/reversed records remain auditable and are corrected through deliberate lifecycle/correction paths, never silent erasure.
11. Derived summaries must not masquerade as canonical master records.
12. Imported/AI-extracted identity is evidence, not automatically canonical master data when identity is ambiguous.
13. Inventory stock must remain explainable from authoritative movements or an equally rigorous source model; project allocation is not destructive balance editing.
14. Biometric attendance requires explicit identity, privacy/consent, access, retention/deletion, correction, device and audit semantics before production use.
15. Navigation/UX simplification is not authorization simplification.
16. Consequential AI-assisted mutations preserve prepare/validate/human-confirm/execute boundaries.
17. One shared codebase must never become shared unrelated-client operational data.

Still unresolved by design: VAT rate, VAT-inclusive vs VAT-exclusive contract value, withholding/BIR classification, automatic/external FX-provider policy and broader accounting-period policy. Do not infer them.

## Tool and model policy — accelerated pre-demo mode

HydroQualiSense is being prepared for presentation to multiple potential clients on **Thursday, September 10, 2026**.

**Codex is the default lead implementation/integration engine.** The lead owns architecture/source-of-truth decisions, shared files, financial semantics, migrations/RLS/RPCs/triggers, security, App/router/provider integration, final diff review, validation and PR delivery.

**Luna is explicitly enabled** for the current accelerated sprint:

- up to **5 concurrent Luna subagents**;
- use only for genuinely independent, bounded work with explicit owned files/domain, acceptance criteria and stop boundary;
- five is a ceiling, not a quota;
- do not duplicate broad audits or let multiple agents independently decide shared financial/security/DB/inventory contracts;
- lead continues implementation while subagents run and integrates/reviews their actual diffs;
- stop stalled/low-value subagents rather than restarting broad work.

Astra is optional for a dedicated later audit/review and must not block normal implementation when allowance is unavailable. Do not assume Gemini, Antigravity, OpenRouter, Kilo or another external implementation agent unless the user explicitly enables it.

After the September 10 presentation, reassess the temporary five-Luna limit before carrying it forward.

## Fresh-session bootstrap

Before implementation, PR review or preparing a Codex prompt:

1. inspect exact current `main`/HEAD;
2. inspect relevant open PRs and exact-head CI;
3. read this `AGENTS.md`;
4. read `docs/AGENT_EXECUTION_EFFICIENCY.md` when workflow/testing matters;
5. read `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md` when deciding the next phase;
6. read `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md` for the current takeover snapshot;
7. read `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md` when client/deployment/productization work matters;
8. inspect existing implementation before designing;
9. never rely on an old prompt SHA or stale chat summary when repository state differs.

A newly started phase normally begins from the latest green merged `main`. Do not rerun the historical full suite merely because a phase started.

## Agent context / Workflow Map

For substantial feature/debugging/security/financial/architecture work, generate one bounded lead packet first:

```text
npm.cmd run agent:context -- --task "<objective>" --domain <domain> --hops 1 --budget 10000
```

Default: one lead packet, 0-1 workflow hops, roughly 8k-12k characters, about 6-8 primary source files, exact symbols/ranges instead of whole-file dumps. Derive narrow subagent assignments from that source-of-truth context instead of making every subagent rediscover the repository.

Workflow Map is navigation only. Current source, migrations, runtime behavior, RLS, tests and exact-head CI remain authoritative.

## Implementation workflow

For a fresh phase:

1. start from latest green `main`;
2. generate one bounded `agent:context` packet;
3. inspect current implementation;
4. split only genuinely independent work to Luna, up to five during the accelerated sprint;
5. keep the lead on the critical/shared path;
6. run new/edited tests;
7. run focused domain tests;
8. run `npm.cmd run test:affected:agent` on the integrated branch;
9. run lint/build/browser/Workflow Map only when relevant;
10. use Docker-backed local Supabase validation when DB contracts change;
11. review the final integrated diff for correctness/scope creep;
12. push a focused feature branch and open a PR;
13. the local implementation lead must **not merge its own PR**.

Run `test:full` only when impact analysis falls back, a broad shared contract genuinely requires it, CI/failures justify it, release/deep regression requires it or the user explicitly requests it.

Parallel validation is useful only when it avoids duplicated expensive work. Final evidence must belong to the integrated final branch.

## Warehouse implementation rules

Warehouse Inventory is the next major operational domain unless reprioritized.

Before schema implementation, inspect existing materials, procurement receipts, project costing and shared master contracts. Do not invent a second materials/procurement truth.

Required invariant:

> **Current stock must be explainable from authoritative movements or an equally rigorous source model.**

Do not implement project allocation as direct destructive balance editing. DB integrity must survive retries, double-clicks and concurrent clients. Keep valuation, warehouse/location count, reservation semantics, serial/lot tracking, reorder rules, purchase-receipt automation, barcode/QR policy and adjustment authority explicit/undecided until approved.

## Client deployment / productization rules

When working on public landing, requirements intake, provisioning or deployment fleet tooling:

- operational clients remain isolated by deployment/database;
- public prospect intake stays separate from authenticated operational data;
- provisioning privileged users/resources is explicit and auditable;
- do not store plaintext secrets in deployment inventory;
- prefer one maintained codebase and controlled configuration over client source forks;
- releases/migrations are promoted deliberately across client deployments;
- storage optimization must not delete authoritative source/audit evidence merely to reduce cost.

## Failure/log discipline

- Do not dump/reopen whole large files or successful logs when symbols/ranges/summaries are enough.
- On failure inspect the smallest useful error region first.
- Use `npm.cmd run ci:failure-context -- --file <log>` for oversized saved logs.
- Never loop an unchanged failure.

Failure loop:

`inspect -> diagnose -> justified change -> narrow rerun -> continue validation ladder`

## Existing-data correction/removal

- Unused accidental record: guarded permanent delete only when no dependent/auditable history exists.
- Used operational record: archive/deactivate/offboard/cancel or equivalent reversible lifecycle state.
- Finalized/auditable financial, inventory, engineering, attendance or payroll history: void/reverse/supersede/deliberate correction; never silently erase.

Do not add raw Delete paths that bypass dependency/history checks.

## RBAC and Assistant parity

Authorization is permission-based, not role-name-based. UI/API authorization, server/RPC checks, RLS and Assistant tools must resolve the same effective permissions. The Assistant never gets broader authority than the current user.

Client-facing role templates are allowed only as mappings to explicit permissions. Sensitive finance, payroll, backup, document-send, inventory-adjustment and future biometric actions should retain dedicated permissions.

## Database / migration safety

Protect approved/finalized payroll, verified supplier/source-document history, Expense/payable history, Client Billing/Collection/settlement history, inventory movement/allocation history, future attendance history, engineering history, project allocations, committed procurement provenance and audit trails.

Once a migration may have reached a shared/protected environment or any client deployment, do not edit it in place. Add a forward migration unless it is proven never to have applied anywhere and the failed transaction fully rolled back.

Shared-repository migrations must remain compatible with the intended client deployment fleet or have an explicit controlled upgrade path.

## Docker / local Supabase validation

Docker Desktop is normally available on the user's Windows laptop.

Use real local Supabase validation for changes to migrations, RLS/grants, RPC/SECURITY DEFINER behavior, triggers/constraints, financial lifecycle guards, inventory guards, company-bound integrity, migration upgrades or DB concurrency/locking.

Expected applicable commands:

```text
docker info
npx.cmd supabase start
npx.cmd supabase db reset --local --no-seed --yes
npx.cmd supabase test db --local
npm.cmd run test:migrations
npm.cmd run test:migrations:upgrade
```

Add relevant runtime/RPC/concurrency tests for the changed contract. Static SQL/string tests are not equivalent to runtime DB validation.

Do **not** start Docker/Supabase for UI-only, documentation-only or unrelated non-DB work. If unavailable, state exactly which runtime checks were not performed. Do not close Docker Desktop itself.

## Validation ladder

1. new/edited tests;
2. focused domain tests;
3. `npm.cmd run test:affected:agent`;
4. smoke when useful;
5. lint after code stabilizes;
6. build when production/runtime/UI integration is affected;
7. Docker/Supabase validation for DB-affecting work;
8. Workflow Map checks when mapped/generated contracts changed;
9. targeted browser QA for significant user-facing changes;
10. full regression only when justified.

Never claim browser/database/runtime validation passed when it was skipped or unavailable.

## Windows local commands

Prefer `npm.cmd` / `npx.cmd` in PowerShell. Check for an existing dev server or local Supabase stack before starting another.

## Git / PR review workflow

Prefer focused branches/PRs. Never force-push by default or rewrite production history.

When the user asks ChatGPT to **check, review, fix, finalize, prepare the next phase**, or similar:

1. inspect the live PR and exact current head;
2. review the complete relevant diff;
3. fix concrete issues when necessary;
4. add regression coverage when appropriate;
5. re-check the new exact head;
6. verify required CI belongs to that exact head;
7. confirm base/head/mergeability and unresolved review blockers;
8. **merge automatically if safe; do not ask for separate merge confirmation**;
9. re-check `main`;
10. provide the next phase/prompt immediately if requested.

Never use CI from an older head as proof for a newer head. Do not merge with a real safety/security/data-integrity/migration/failing-CI blocker.

Do not weaken branch protection merely to bypass a required independent approval. If GitHub requires another reviewer and the connected identity cannot self-approve, complete every other safe step and report that exact external gate.

## Prompt creation

Every substantial implementation prompt should carry forward:

- current exact `main` SHA;
- Codex lead ownership;
- Luna explicitly enabled up to the current 5-subagent pre-demo ceiling;
- one bounded lead context packet and narrow subagent assignments;
- current financial/security/history/inventory/attendance invariants;
- explicit scope/out-of-scope boundaries;
- focused -> affected validation;
- conditional Docker validation;
- no ritual full-suite runs;
- exact integrated diff review;
- PR creation without local-agent self-merging.

For wide/unattended runs, set explicit priority order and stop boundary. Spare time/subagent capacity is not permission for unrelated scope creep.

For deliberately parallel phases, split only contracts that do not compete for shared DB/financial/inventory/identity ownership. The lead remains final integration owner.

## Final handoff

For substantial work report concisely:

- starting/base SHA;
- branch/final SHA and PR;
- major files/migrations;
- tests/checks actually run and results;
- Docker/Supabase runtime evidence or exact blocker;
- browser/Workflow Map results when relevant;
- skipped validation;
- remaining limitations/follow-up;
- agent-context selector used;
- Luna/Codex subagents used and any stopped.

For client-deployment work also report affected deployment/configuration assumptions and whether any fleet upgrade/rollback validation was performed.

## Definition of done

A substantial task is done when current repository state was verified, scope stayed disciplined, financial/security/history semantics were preserved, subagent work was integrated/reviewed, changed files were reviewed, appropriate changed-surface validation was obtained, required DB runtime evidence was obtained when applicable, exact-head CI was checked and the handoff states clearly what did and did not pass.

Before broad multi-client production rollout, a dedicated final security/data-integrity certification remains required in addition to phase-level validation.
