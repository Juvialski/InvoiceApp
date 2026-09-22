# UX-S3D Cash Settlement & Reconciliation Workflow Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Cash & Banking settlement flow legible as Browse -> Choose transaction/target -> Review allocation -> Confirm -> Result/return, without changing financial authority or persistence contracts.

**Architecture:** Keep `CashBankingPage` responsible for ledger browsing and the unresolved review index, while `CashSettlementAllocationWorkspace` remains the single explicit settlement-confirmation surface. Share one deterministic predicate for excluding confirmed internal-transfer evidence from operating-settlement selection, preserve exact target/source route context, and keep all authoritative validation in the existing controller/RPC path.

**Tech Stack:** React 19, TypeScript, Tailwind utility classes, Node test runner with `tsx`, deterministic Demo Visual QA/Playwright, existing Cash & Banking and financial-settlement persistence adapters.

**Spec:** `docs/superpowers/specs/2026-09-21-ui-simplification-contextual-help-research.md` plus the UX-S3D Cash request in the task handoff.

## Global Constraints

- Preserve the governing interaction grammar: `Browse visually -> edit like a spreadsheet -> execute sensitive workflows deliberately`.
- Suggestions remain suggestions; selection and allocation never create settlement evidence until explicit confirmation succeeds.
- Preserve no-double-counting, settlement basis, lifecycle eligibility, partial allocation arithmetic, transfer pairing, immutable settlement history, reversal semantics, company isolation, RBAC/RLS, currency/FX rules, source-record ownership, and reconciliation status guards.
- Internal transfers remain separate from supplier/payroll/expense/client-collection settlement and continue through the dedicated transfer workflow.
- Do not change migrations, RPCs, RLS, grants, schema, persistence authority, settlement math, target types, providers, or production state.
- Keep source-record authority distinct from Cash & Banking evidence; confirmation does not mutate the source record.
- Stay inside the Cash settlement/reconciliation UX-S3D slice; do not begin Procurement, Payroll, UX-S3E, or net-new product domains.

## Review Focus

- A queue suggestion must not confirm anything or create a match before the allocation workspace's final action; covered by the non-mutating review-link behavior and Demo Visual QA.
- A base Cash route must not silently select an arbitrary transaction; covered by the workspace initial-state test/QA scenario.
- Confirmed internal-transfer rows must not appear as operating settlement choices; covered by the shared eligibility helper test and transfer QA state.
- A partial/split allocation must show selected total and remaining transaction amount without permitting over-allocation; covered by existing allocation tests plus the changed browser scenario.
- Failed confirmation/reversal must leave evidence truthful and retain the review context; covered by existing controller/persistence tests and the final browser/error inspection.

### Task 1: Add deterministic settlement-review eligibility coverage

**Files:**
- Modify: `src/lib/cashBanking.ts` near `confirmedMatchedAmount`/`findInternalTransferSuggestions`
- Test: `tests/cashBanking.test.ts`

**Interfaces:**
- Consumes: `FinancialTransaction[]` and `FinancialTransactionMatch[]`.
- Produces: `hasConfirmedInternalTransfer(transactionId, matches)` and `eligibleSettlementReviewTransactions(transactions, matches)` for the page and allocation workspace.

- [ ] **Step 1: Write the failing test.** Add focused cases proving that POSTED, non-ignored transactions remain reviewable, ignored/reversed rows are excluded, and a transaction with a confirmed `TRANSFER` match is excluded from operating-settlement review while an ordinary confirmed invoice/expense match is not excluded.

- [ ] **Step 2: Run the focused test to verify it fails for the missing helper.**

  Run: `npx.cmd tsx --test tests/cashBanking.test.ts`

  Expected: FAIL because the new helper import/contract is not implemented.

- [ ] **Step 3: Implement the minimal pure helpers.** Use exact status checks (`POSTED`, reconciliation status not `IGNORED`, and no confirmed `TRANSFER` match); do not change match totals or lifecycle eligibility.

- [ ] **Step 4: Run the focused test to verify it passes.**

  Run: `npx.cmd tsx --test tests/cashBanking.test.ts`

  Expected: PASS with the existing cash-flow, suggestion, and transfer tests still green.

### Task 2: Make the allocation workspace the single operating-settlement action path

**Files:**
- Modify: `src/components/CashBankingPage.tsx`
- Modify: `src/components/CashSettlementAllocationWorkspace.tsx`
- Modify: `src/app/routes/CashBankingRoute.tsx` only if the existing node composition needs a typed prop adjustment

**Interfaces:**
- Consumes: the helpers from Task 1, existing `CashSettlementTargetContext`, existing navigation callbacks, and existing `onSaveMatch`/`onSaveMatchBatch`/`onReverseMatch` callbacks.
- Produces: non-mutating queue review links, explicit stage markers, intentional transaction selection, transfer-separated transaction options, allocation/result summaries, and preserved source/target continuation links.

- [ ] **Step 1: Write the failing behavioral/browser assertions.** Extend the Cash settlement Demo QA action and catalog metadata so it expects `Review allocation`, no queue-level `Confirm match`, a visible `Choose transaction` state on the base route, a visible `Review allocation`/`Confirm settlement` distinction, a success result with the recorded target, and a preserved return-to-source link for target-context entry.

- [ ] **Step 2: Run the targeted scenario against the current implementation to verify the expected failures.**

  Run the existing production-server Demo Visual QA command after starting the documented local production preview; record the current failures as the red baseline for the changed scenario rather than treating them as product success.

- [ ] **Step 3: Replace queue-level confirmation with a non-mutating review navigation.** Remove the direct `confirmSuggestion` path from the unresolved queue, link each eligible suggestion to the canonical Cash transaction route while preserving `fromTargetType`, `fromTargetId`, and `returnTo`, and label the action `Review allocation`. Keep the advisory suggestion reason, score, amount, currency, lifecycle, and permission-blocked state visible.

- [ ] **Step 4: Remove implicit arbitrary transaction selection.** Let the workspace select a transaction from an exact route transaction or an already-linked target transaction only; otherwise render the intentional empty selection state. Use `eligibleSettlementReviewTransactions` for the selector so confirmed internal-transfer pairs are not presented as operating-settlement choices.

- [ ] **Step 5: Clarify the stages without changing the mutation boundary.** Add compact accessible stage labels for Browse/Choose, Review allocation, and Confirmation review; mark candidate cards as advisory/not confirmed; show target basis, linked amount, remaining amount, currency, and permission/lifecycle blockers; keep the final action explicit and amount-aware.

- [ ] **Step 6: Add truthful result/continuation state.** After the existing save callback resolves, retain a local result summary that says settlement evidence was recorded, lists the affected target(s) and amount(s), states that the source record was not changed, and exposes existing `Open target`/`Return to source` links when available. On failure, keep draft allocations and the current transaction context, show the existing safe error, and do not render the result state.

- [ ] **Step 7: Keep transfer suggestions visibly separate.** Preserve the dedicated internal-transfer section, its explicit confirmation, paired-row semantics, and reversal path; label it as a separate workflow and do not route it through allocation candidates.

- [ ] **Step 8: Run the focused tests and inspect the changed source.**

  Run: `npx.cmd tsx --test tests/cashBanking.test.ts tests/financialSettlement.test.ts tests/settlementDemo.test.ts tests/coreHardeningWave2B3SplitSettlement.test.ts`

  Expected: PASS; no database or persistence files changed.

### Task 3: Add focused Demo Visual QA evidence for changed Cash states

**Files:**
- Modify: `scripts/qa/demoScenarios.ts`
- Modify: `tests/structuredBrowserEvidence.test.ts` if the catalog contract needs an explicit Cash state assertion

**Interfaces:**
- Consumes: existing deterministic Meridian Demo fixtures and the structured evidence schema.
- Produces: durable scenario coverage for base browse/empty selection, target-context review, split allocation confirmation/result, internal transfer separation, and constrained/mobile action layout where the changed surface is visible.

- [ ] **Step 1: Add only the changed Cash scenarios.** Reuse the existing `/demo/app/cash` and `/demo/app/cash?transactionId=demo-transaction-split-01` routes where possible; add action assertions for non-mutating review, explicit confirmation, result/return state, and transfer separation rather than adding count-only screenshots.

- [ ] **Step 2: Run the structured catalog test.**

  Run: `npx.cmd tsx --test tests/structuredBrowserEvidence.test.ts`

  Expected: PASS with unique scenario IDs and the required Cash interaction states represented.

- [ ] **Step 3: Run the targeted browser evidence and visually inspect representative screenshots.** Verify desktop and mobile/phone changed states, zero console/page/request errors, no horizontal overflow, and that primary actions remain understandable without reading the secondary financial explanation.

### Task 4: Synchronize roadmap and handoff evidence

**Files:**
- Modify: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`
- Modify: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`

**Interfaces:**
- Consumes: the final diff, exact branch/base SHA, focused/affected/browser evidence, and Jev diagnostic output.
- Produces: an exact-scope UX-S3D Cash handoff that does not claim Procurement or Payroll completion and derives the next unfinished slice from the final live state.

- [ ] **Step 1: Record the exact Cash friction and corrections actually shipped.** Include that queue suggestions became non-mutating review navigation, allocation selection became intentional, transfer rows stayed separate, and result/recovery context became explicit.

- [ ] **Step 2: Record preserved invariants and validation boundaries.** State that no database/RPC/RLS/migration validation was applicable because persistence contracts were unchanged, and distinguish local focused/affected/browser evidence from hosted/provider/production certification.

- [ ] **Step 3: Record Jev diagnostics.** State the single start/context checkpoint result: deterministic packet was fresh, no optional candidates were available, no live request was used, and deterministic source/evidence remained authoritative.

### Task 5: Final validation, commit, push, and PR handoff

**Files:**
- Review: all final changed files and `git diff --check`

- [ ] **Step 1: Run the integrated validation ladder once.** Run new/edited focused tests, focused Cash/settlement tests, `npm.cmd run test:affected:agent`, lint/typecheck, production build, targeted Demo Visual QA, and exact final diff review. Run Workflow Map only if the final diff changes mapped route/workflow contracts. Do not start Docker/Supabase because no database contract changed.

- [ ] **Step 2: Run the sanitized completion checkpoint if the existing CLI can accept the final evidence metadata.** Treat it as advisory only and record its diagnostic/fallback status; do not use it as a merge decision.

- [ ] **Step 3: Commit the focused branch.** Use a message such as `fix: harden cash settlement workflow stages` and confirm the final SHA and clean working tree.

- [ ] **Step 4: Push the branch and open a PR against current `main`.** The PR body must include starting SHA `d1cfa93ca04320f800db9737635ec23a6e002b36`, friction found, corrections made, preserved financial invariants, actual validation, Jev diagnostics, DB applicability, and deliberately deferred Procurement/Payroll findings.

- [ ] **Step 5: Stop with the PR open.** Do not merge the PR from this implementation task.

