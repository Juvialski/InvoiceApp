# HydroQualiSense — Active Development Brief

**Updated:** 2026-10-12  
**Repository:** `Juvialski/InvoiceApp`  
**Snapshot baseline:** `1486caddfc035352629e401f24234c9f3176b3e5` (2026-10-12 starting `main`)
**Authority:** current `main`, `AGENTS.md`, product direction, and exact-source implementation override this snapshot.

## Current state

- Product: HydroQualiSense engineering operations software. Production corporate identity is **Hydroqualisense Solutions Corp.**; QA/software showcase uses a neutral identity. Architecture is one source repository, separate company-isolated deployments.
- The **hardening-first product freeze remains active**. Existing financial, payroll, procurement, inventory, engineering, document, communications, and Operations Workbook workflows must retain their canonical source/permission/history semantics. Deferred new feature domains do not resume automatically.
- **Excel simplicity, selected worksheet editing and Operations Workbook** are implemented for documented bounded scopes. `WB-3D+` and net-new domain expansion remain deferred. Relevant product contracts live under `docs/superpowers/specs/`; current product direction is `docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md`.
- **MKT-V3A**: two silent final visual masters (portrait and landscape), with app imagery, are recorded in the 2026-10-08 roadmap/handoff; Taglish narration/audio mix is **not complete** and should not be described as delivered.
- **QA release status (2026-10-12):** QA Supabase `vrpuznofrntyqsbugrib` is restored and `ACTIVE_HEALTHY`; independent read-only checks found 153/153 canonical migrations, exact order and head `20260927095636`. QA health reports starting main SHA `1486caddfc035352629e401f24234c9f3176b3e5`. Protected parity and the authenticated workbook matrix passed; hosted routes passed 8/9 with a stale payroll assertion corrected in WF-RESET-2 and pending guarded rerun. Evidence and claim limits are in [WF-RESET-2](WF-RESET-2-EVIDENCE.md). Production `qijjshdwiylojvqojxyz` remains untouched. PR #298 is merged: unrelated docs/tests/isolated marketing/release-tooling pushes skip remote QA, while runtime/migrations and explicit release remain guarded.
- **CI baseline:** on the 2026-10-08 `main` commit, the four required validation workflows succeeded. The 2026-10-11 scheduled full regression also succeeded. These results certify that historical commit only, not future PR heads.
- Normal engineering implementation uses **one Codex lead, zero subagents by default, bounded scope, focused/affected tests, and a PR for ChatGPT safe-merge review**. Jev advisory calls and context packets are optional; CI/database/release safeguards remain mandatory when relevant.

## UX-RESET-1 implementation review

The user-authorized beginner-friendly simplification is implemented on `codex/ux-reset-1`: task-first daily navigation and Home, clearer supplier bill review/payment continuation, compact stock entry and responsive/shared controls. Route identities, permissions and financial source/history authority remain unchanged. This is an open-PR implementation boundary, not a merged or deployed release. See [inventory](UX-RESET-1-INVENTORY.md), [qualified evidence](UX-RESET-1-EVIDENCE.md) and the planning-only [UX-RESET-2 workbook specification](UX-RESET-2-WORKBOOK-SPEC.md). No broader workbook adapters are enabled.

## Next actionable priorities

1. **WF-RESET-2:** complete bounded workflow cleanup and restored-QA recovery. WF-RESET-1 (#297) and QA-RECOVERY (#298) are merged foundations. Jev/context remain optional; active roadmap/handoff are concise with complete historical archives.
2. **QA recovery:** inspect the protected exact-source certification result and resolve concrete remaining failures/configuration blockers; do not reset QA or touch production. Starting-main evidence and later PR-head CI remain distinct.
3. **Application re-audit:** pick high-impact usability, reliability and financial-workflow issues from the actual deployed/current code and user journeys. Group related fixes into coherent scoped PRs, with regression coverage and appropriate browser/database validation.
4. Return to product expansion only after explicit user reprioritization. Provider-backed claims, authenticated hosted document certification, and final marketing audio require their own real evidence.

## Source map — read selectively

- `AGENTS.md`: **active engineering and data-safety policy**.
- `docs/AGENT_EXECUTION_EFFICIENCY.md`: compact implementation/testing steps.
- `docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md`: current business/product semantics.
- `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`: concise current sequencing/capability boundaries, with a linked historical archive.
- `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`: concise current takeover/evidence record, with a linked historical archive.
- `docs/AGENTS_BASELINE_20260909.md`: **historical** original agent policy and enduring specialist/domain safety descriptions; obsolete model/agent limits and startup/test routines are superseded by current `AGENTS.md`.
- `docs/CHATGPT_MIGRATION_OPERATOR_POLICY.md`, deployment runbooks: mandatory when touching database promotions, hosted releases or production.
- `docs/HYDROQUALISENSE_OPERATIONS_WORKBOOK_CERTIFICATION.md`: workbook-specific QA scope and evidence.

## Keeping this brief current

Update only for genuine changes in active priority, release blockers, major capability readiness, or agent policy. Point to the canonical PR/phase evidence instead of copying detailed test logs or long retrospectives. This brief is an index, **not** permission to skip task-specific security/financial contracts or to claim an older certification covers a new release.
