# Client Security Assurance & Handoff Implementation Plan

> **For agentic workers:** Execute this plan with Codex as the lead. Repository rules override generic subagent guidance: default to zero subagents, maximum two only for genuinely independent bounded work, and the lead owns security/DB interpretation, integration, validation, final diff, push, and PR.

**Goal:** Verify and, where necessary, harden Hydroqualisense's client security and post-handoff access model, then produce a concise evidence-backed client security PDF using only synthetic/QA screenshots and verified claims.

**Architecture:** Treat security claims as outputs of an evidence pipeline rather than marketing copy. First establish current authority boundaries from code, migrations, current QA runtime and release configuration; then fix any material gap that prevents the intended no-standing-developer-data-access handoff; finally generate the client-facing source/PDF and evidence manifest from the verified state. Production confidential data is never used as documentation evidence.

**Tech Stack:** React/TypeScript/Vite, Express server, Supabase Postgres/Auth/Storage/RLS/RPC, Render, GitHub Actions, existing browser/QA tooling, repository PDF/rendering tooling or a minimal reproducible HTML-to-PDF path if no suitable existing path exists.

**Spec:** `docs/HYDROQUALISENSE_CLIENT_SECURITY_ASSURANCE.md`

## Global Constraints

- Start from freshly fast-forwarded `origin/main`; record the exact main SHA once.
- Read `AGENTS.md`, the security phase spec, active roadmap/handoff, client deployment strategy, deployment runbook, migration operator policy, and only security-relevant implementation/migrations/tests.
- Codex only; zero subagents by default, maximum two.
- Use QA/demo/synthetic data for evidence. Do not inspect or copy production confidential records.
- Production data/schema writes are not authorized by this phase.
- No security/compliance claim without traceable evidence.
- Do not expose secrets, credentials, user PII, financial rows, Gmail content, production files, tokens, project refs, or sensitive infrastructure identifiers in screenshots/PDF.
- If executable security/DB changes are needed, focused tests -> affected tests -> applicable strict DB runtime validation -> relevant build/browser/workflow checks -> exact final diff.
- Do not run the historical full suite by ritual.
- Codex opens the PR and does not self-merge.

---

### Task 1: Reconcile priority and build the evidence inventory

**Files:**
- Modify when stale: `AGENTS.md`
- Modify: `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`
- Modify: `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md`
- Read: `docs/HYDROQUALISENSE_CLIENT_SECURITY_ASSURANCE.md`
- Read: `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`
- Read: `docs/HYDROQUALISENSE_DEPLOYMENT_RUNBOOK.md`
- Create later: `artifacts/client-security/EVIDENCE.md`

**Produces:** A reconciled current sequence and an evidence checklist separating technical controls from handoff policy.

- [ ] Pull current `main`, record SHA, create the security-phase branch, and read only the required current documents.
- [ ] Update sequence/truth documents so **Client Security Assurance & Handoff** is the current prioritized implementation phase; Email/SMS provider readiness remains unfinished and resumes afterward; Worker Registration remains paused.
- [ ] Enumerate every intended PDF claim and label its evidence class: `SOURCE`, `DB`, `QA_RUNTIME`, `CI_RELEASE`, `VENDOR_CONFIG`, or `HANDOFF_POLICY`.
- [ ] Mark any claim that is not currently provable as blocked rather than drafting persuasive wording around it.

### Task 2: Audit actual authorization and deployment isolation

**Files / sources to inspect:**
- `src/utils/accessControl.ts`
- `src/lib/companyAccess.ts`
- relevant server authorization routes
- `supabase/migrations/20260824090000_company_tenancy_rbac_foundation.sql`
- `supabase/migrations/20260828150000_single_company_deployment.sql`
- `supabase/migrations/20260828151000_single_company_access_guards.sql`
- `supabase/migrations/20260828152000_single_company_platform_maintenance.sql`
- `supabase/migrations/20260829003147_core_hardening_wave1_access_management.sql`
- later security/RLS/RPC/domain migrations that modify these contracts
- existing authorization/security tests

**Produces:** Exact current role/permission matrix, platform/developer access findings, and a bounded list of concrete security defects if any.

- [ ] Derive the effective current role matrix from the final migrated database/catalog, not from an old documentation matrix.
- [ ] Prove that `COMPANY_ADMIN`, `FINANCE`, `PAYROLL`, and `VIEWER` receive their expected current permissions and that member-level overrides cannot manufacture non-assignable platform/member/settings authority.
- [ ] Verify representative server/RPC/RLS denial paths for sensitive finance, payroll, member/settings, and cross-company access.
- [ ] Verify that client deployments do not implicitly seed a platform operator and determine every supported path by which a platform-maintenance identity could be deliberately provisioned.
- [ ] Verify that normal support does not require a developer account to be a production company member.
- [ ] Inspect privileged server endpoints and server-only secret boundaries for browser leakage or missing application-level authorization.
- [ ] Record findings with severity and evidence. Do not broaden into a generic unbounded pentest.

### Task 3: Implement only security fixes justified by Task 2

**Files:** Determined by concrete findings only.

**Produces:** Minimal hardened implementation with regression coverage, or a documented finding that no code/database change is required.

- [ ] For each real defect, write or identify a failing regression test first.
- [ ] Implement the smallest change that closes the defect without weakening financial/history/source-of-truth invariants.
- [ ] Run the new/focused test and verify the original failure is prevented.
- [ ] If migrations/RLS/RPC/grants/triggers/security-definer behavior change, run clean local replay, pgTAP, upgrade-path and applicable runtime authorization tests using local Supabase/Docker.
- [ ] If Docker/Supabase is unavailable, stop short of claiming the DB fix certified and report exactly which runtime checks are missing.
- [ ] Do not apply production migrations or modify production data in this phase.

### Task 4: Define and verify the post-handoff custody checklist

**Files:**
- Create or update a focused handoff checklist referenced by the security spec, location chosen consistently under `docs/`.
- Update `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md` / runbook only where the verified handoff operating model requires durable clarification.

**Produces:** An actionable separation between application controls and external account custody.

- [ ] Define the minimum handoff checks for production Supabase, Render, Google/provider accounts, production Auth membership, platform-maintenance records, production secrets and release authority.
- [ ] Require the developer's normal support path to use QA/synthetic data and no standing client production membership/data-plane credential.
- [ ] Document the distinction between direct data-plane access and ability to submit/release reviewed code.
- [ ] Define an exceptional incident-access procedure: client-granted, bounded, auditable and revoked afterward; do not pretend the application can enforce ownership of external SaaS accounts.
- [ ] Provide a safe re-verification checklist clients/operators can repeat without exposing confidential records.

### Task 5: Capture synthetic security evidence

**Files:**
- Create: `artifacts/client-security/screenshots/`
- Create/update: `artifacts/client-security/EVIDENCE.md`

**Produces:** 4–6 client-understandable screenshots with no production data/secrets.

- [ ] Use the isolated QA deployment or safe local authenticated QA harness with purpose-built synthetic users.
- [ ] Capture Access/Team Management showing synthetic users and role controls.
- [ ] Capture at least one restricted-role/denied-action example proving least privilege.
- [ ] Capture access/audit history for synthetic role/member changes if the current UI supports it clearly.
- [ ] Capture the QA/synthetic-data boundary and one safe credential/provider-status view only if it demonstrates a verified control without exposing identifiers/secrets.
- [ ] Inspect every screenshot manually; crop/redact/remove accidental emails, UUIDs, project refs, tokens, real filenames, financial values, or confidential content.
- [ ] Map each screenshot and each material PDF claim to its evidence source in `EVIDENCE.md`.

### Task 6: Generate the concise client security PDF

**Files:**
- Create: `docs/client-facing/HYDROQUALISENSE_CLIENT_SECURITY_OVERVIEW.md` or a focused HTML/source equivalent
- Create: `artifacts/client-security/Hydroqualisense_Client_Security_Overview.pdf`
- Use: `artifacts/client-security/screenshots/`
- Use: `artifacts/client-security/EVIDENCE.md`

**Produces:** A branded, regeneratable client PDF of about six pages.

- [ ] Draft only from the evidence matrix; remove or qualify any unsupported statement.
- [ ] Include: security-at-a-glance, role/access matrix, isolation/data protection, integrations/secrets, post-handoff support model, evidence/shared responsibility.
- [ ] Keep the role matrix business-friendly; raw permission keys belong in internal evidence, not the main PDF.
- [ ] State the handoff model precisely: no standing developer **data-plane** access after completed handoff, while reviewed software releases remain part of maintenance/change control.
- [ ] Avoid unsupported certifications, absolutes, vendor guarantees, retention/RTO claims, or vague “100% secure” wording.
- [ ] Use Hydroqualisense branding, readable tables and 4–6 useful screenshots.
- [ ] Generate the PDF using an existing reliable repository PDF path where suitable; otherwise use a minimal deterministic HTML/browser PDF path rather than introducing a large new dependency.

### Task 7: Visually certify the PDF and validate the final diff

**Produces:** Evidence that the actual delivered PDF is readable and matches the verified security state.

- [ ] Render/inspect every PDF page, not just the source document.
- [ ] Check page count, margins, logo, headings, tables, screenshot sharpness, text clipping/overflow, links and footer/page numbering.
- [ ] Verify no secret/PII/confidential data appears in the PDF or committed screenshots.
- [ ] Run focused security/document-generation tests added or edited by this phase.
- [ ] Run `npm.cmd run test:affected:agent`.
- [ ] Run lint/build/browser/Workflow Map only when the actual executable diff requires them.
- [ ] Re-run strict DB validation if Task 3 changed database/security contracts.
- [ ] Review the complete final diff for scope creep and compare every PDF claim against `EVIDENCE.md`.
- [ ] Synchronize `AGENTS.md`, roadmap, handoff, phase spec, deployment docs and `src/config/productFeatures.ts` only where actual final product truth requires it.
- [ ] Push the feature branch and open a PR. Codex must not merge its own PR.

## Stop boundaries

- Stop rather than fabricating a client-facing claim when evidence is missing.
- Stop rather than accessing production confidential records merely to obtain a screenshot or prove a control.
- Stop rather than performing a production DB/security mutation without separate explicit production authorization.
- Stop rather than calling an external-account custody policy a technical guarantee.
- Do not let spare time expand this phase into Worker Registration, biometrics, deferred Documents work, unrelated UI redesign, or provider-readiness implementation.