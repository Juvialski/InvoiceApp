# HydroQualiSense — Active Development Brief

**Updated:** 2026-10-12  
**Repository:** `Juvialski/InvoiceApp`  
**Snapshot baseline:** `24400b505111d5a22027601cb4f983ed43dbb7aa` (2026-10-08 `main` before WF-RESET-1)  
**Authority:** current `main`, `AGENTS.md`, product direction, and exact-source implementation override this snapshot.

## Current state

- Product: HydroQualiSense engineering operations software. Production corporate identity is **Hydroqualisense Solutions Corp.**; QA/software showcase uses a neutral identity. Architecture is one source repository, separate company-isolated deployments.
- The **hardening-first product freeze remains active**. Existing financial, payroll, procurement, inventory, engineering, document, communications, and Operations Workbook workflows must retain their canonical source/permission/history semantics. Deferred new feature domains do not resume automatically.
- **Excel simplicity, selected worksheet editing and Operations Workbook** are implemented for documented bounded scopes. `WB-3D+` and net-new domain expansion remain deferred. Relevant product contracts live under `docs/superpowers/specs/`; current product direction is `docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md`.
- **MKT-V3A**: two silent final visual masters (portrait and landscape), with app imagery, are recorded in the 2026-10-08 roadmap/handoff; Taglish narration/audio mix is **not complete** and should not be described as delivered.
- **QA release status (2026-10-12):** the Oct 8 remote-parity error occurred while the connected QA Supabase project was **INACTIVE**. A restore was attempted and denied because the owner's account has reached its **two-active-free-project limit**. QA was **not** restored, no migrations were run, and the separately configured production project remains untouched. The connection/pooler host must still be confirmed after an active QA slot is available. CI-EFF release classification is being corrected to skip remote QA parity on docs/tests/isolated marketing and release-tooling-only pushes; runtime, migrations, hosted QA and explicit manual release remain guarded.
- **CI baseline:** on the 2026-10-08 `main` commit, the four required validation workflows succeeded. The 2026-10-11 scheduled full regression also succeeded. These results certify that historical commit only, not future PR heads.
- Normal engineering implementation uses **one Codex lead, zero subagents by default, bounded scope, focused/affected tests, and a PR for ChatGPT safe-merge review**. Jev advisory calls and context packets are optional; CI/database/release safeguards remain mandatory when relevant.

## Next actionable priorities

1. **WF-RESET-1 (2026-10-12):** streamline `AGENTS.md` and execution guide, add this brief, and stop mandatory Jev/context/historical documentation rituals. This is a **developer-workflow documentation change**, not a change to application runtime, tests, CI configuration, QA, or production.
2. **QA-RECOVERY:** free an eligible Supabase active-project slot or upgrade the appropriate plan before restoring the inactive QA project; do **not** pause production or other projects by implication. Once QA is active, confirm the exact pooler host and canonical migration parity, then run controlled hosted QA. Remote promotion remains blocked until that evidence exists.
3. **Application re-audit:** pick high-impact usability, reliability and financial-workflow issues from the actual deployed/current code and user journeys. Group related fixes into coherent scoped PRs, with regression coverage and appropriate browser/database validation.
4. Return to product expansion only after explicit user reprioritization. Provider-backed claims, authenticated hosted document certification, and final marketing audio require their own real evidence.

## Source map — read selectively

- `AGENTS.md`: **active engineering and data-safety policy**.
- `docs/AGENT_EXECUTION_EFFICIENCY.md`: compact implementation/testing steps.
- `docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md`: current business/product semantics.
- `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`: detailed development decisions and historical phase evidence (over 2,500 lines). Consult relevant sections; do not read wholesale by default.
- `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`: chronological handoffs and historical validation details (over 3,000 lines). Consult a known phase only when needed.
- `docs/AGENTS_BASELINE_20260909.md`: **historical** original agent policy and enduring specialist/domain safety descriptions; obsolete model/agent limits and startup/test routines are superseded by current `AGENTS.md`.
- `docs/CHATGPT_MIGRATION_OPERATOR_POLICY.md`, deployment runbooks: mandatory when touching database promotions, hosted releases or production.
- `docs/HYDROQUALISENSE_OPERATIONS_WORKBOOK_CERTIFICATION.md`: workbook-specific QA scope and evidence.

## Keeping this brief current

Update only for genuine changes in active priority, release blockers, major capability readiness, or agent policy. Point to the canonical PR/phase evidence instead of copying detailed test logs or long retrospectives. This brief is an index, **not** permission to skip task-specific security/financial contracts or to claim an older certification covers a new release.
