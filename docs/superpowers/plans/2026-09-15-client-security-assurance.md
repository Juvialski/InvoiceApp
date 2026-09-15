# Client Security Assurance & Handoff Implementation Plan

> **For agentic workers:** Execute this plan with Codex as the lead. Repository rules override generic subagent guidance: default to zero subagents, maximum two only for genuinely independent bounded work, and the lead owns security/DB interpretation, integration, validation, final diff, push, and PR.

**Goal:** Verify and, where necessary, harden Hydroqualisense's client security and post-handoff access model, implement safe company-defined custom roles, then produce a concise evidence-backed client security PDF using only synthetic/QA screenshots and verified claims.

**Architecture:** Treat security claims as outputs of an evidence pipeline rather than marketing copy. First establish current authority boundaries from code, migrations, current QA runtime and release configuration; then implement the approved flexible RBAC layer without weakening protected/root authority; then close any other material security gap that prevents the intended handoff model; finally generate the client-facing source/PDF and evidence manifest from the verified state. Production confidential data is never used as documentation evidence.

**Tech Stack:** React/TypeScript/Vite, Express server, Supabase Postgres/Auth/Storage/RLS/RPC, Render, GitHub Actions, existing browser/QA tooling, repository PDF/rendering tooling or a minimal reproducible HTML-to-PDF path if no suitable existing path exists.

**Spec:** `docs/HYDROQUALISENSE_CLIENT_SECURITY_ASSURANCE.md`

## Global Constraints

- Start from freshly fast-forwarded `origin/main`; record the exact main SHA once.
- Read `AGENTS.md`, the security phase spec, active roadmap/handoff, client deployment strategy, deployment runbook, migration operator policy, and only security-relevant implementation/migrations/tests.
- Codex only; zero subagents by default, maximum two.
- The current four roles (`COMPANY_ADMIN`, `FINANCE`, `PAYROLL`, `VIEWER`) are built-in starter templates, not the approved end-state limit.
- Authorized Company Administrators must be able to create/edit company-specific custom roles with custom operational access before the PDF claims flexible roles.
- Custom role names are never authorization primitives; effective permissions remain authoritative.
- Protected platform/root-administration authority must not be self-created through custom roles or ordinary member overrides.
- Use QA/demo/synthetic data for evidence. Do not inspect or copy production confidential records.
- Production data/schema writes are not authorized by this phase.
- No security/compliance claim without traceable evidence.
- Because custom roles are expected to alter RBAC/database contracts, use focused tests -> affected tests -> applicable strict DB runtime validation -> relevant build/browser/workflow checks -> exact final diff.
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
- [ ] Record the flexible-RBAC requirement explicitly: built-in roles are starter templates and Company Admins can create company-scoped custom roles with custom operational access.
- [ ] Enumerate every intended PDF claim and label its evidence class: `SOURCE`, `DB`, `QA_RUNTIME`, `CI_RELEASE`, `VENDOR_CONFIG`, or `HANDOFF_POLICY`.
- [ ] Mark any claim that is not currently provable as blocked rather than drafting persuasive wording around it.

### Task 2: Audit the current authorization model before redesign

**Files / sources to inspect:**
- `src/utils/accessControl.ts`
- `src/lib/companyAccess.ts`
- current Team/Access/Settings UI
- relevant server authorization routes
- `supabase/migrations/20260824090000_company_tenancy_rbac_foundation.sql`
- `supabase/migrations/20260828150000_single_company_deployment.sql`
- `supabase/migrations/20260828151000_single_company_access_guards.sql`
- `supabase/migrations/20260828152000_single_company_platform_maintenance.sql`
- `supabase/migrations/20260829003147_core_hardening_wave1_access_management.sql`
- later security/RLS/RPC/domain migrations that modify these contracts
- existing authorization/security tests

**Produces:** Exact current role/permission matrix, the current role-storage model, platform/developer access findings, and the migration design needed for safe custom roles.

- [ ] Derive the effective current role matrix from the final migrated database/catalog, not from an old documentation matrix.
- [ ] Prove the current built-in roles receive their expected permissions and identify all code/RPC/RLS paths that currently assume a fixed global `role_key`.
- [ ] Trace member-level permission overrides and identify the authoritative effective-permission resolver used by UI, server, RPC and RLS.
- [ ] Identify which permissions are currently member-assignable and which are deliberately protected/non-assignable.
- [ ] Verify representative denial paths for sensitive finance, payroll, member/settings, and cross-company access.
- [ ] Verify client deployments do not implicitly seed a platform operator and determine every supported path by which a platform-maintenance identity could be deliberately provisioned.
- [ ] Verify normal support does not require a developer account to be a production company member.
- [ ] Inspect privileged server endpoints and server-only secret boundaries for browser leakage or missing application-level authorization.
- [ ] Choose the smallest migration-safe custom-role data model after inspecting current contracts. Avoid dual authorities that can disagree about effective permissions.

### Task 3: Implement company-defined custom roles safely

**Produces:** End-to-end company-scoped role creation/editing/assignment with security enforcement and auditability.

#### Required product behavior

- [ ] Keep `COMPANY_ADMIN`, `FINANCE`, `PAYROLL`, and `VIEWER` as safe built-in starter templates for backwards compatibility.
- [ ] Treat built-in roles as canonical/protected templates: do not allow ordinary rename/delete that would destabilize existing contracts.
- [ ] Allow authorized Company Administrators to create a company-specific custom role with a business-facing name, optional description, and selected operational permissions.
- [ ] Allow a Company Administrator to create a custom role from scratch and, where practical, duplicate a built-in/custom role as a starting point.
- [ ] Allow editing a custom role's name/description/permission set.
- [ ] Allow assigning/reassigning a custom role to company members through the existing access-management experience.
- [ ] Make permission changes take effect through the shared effective-permission resolver without adding hardcoded checks for the new role's display name.
- [ ] Allow safe archive/retirement of an unused custom role; if assigned members exist, require explicit reassignment or an equally safe atomic workflow before retirement.
- [ ] Do not hard-delete roles in a way that strands members or changes authority silently.

#### Required security behavior

- [ ] Scope every custom role to exactly one deployment company.
- [ ] Deny cross-company role read/write/assignment attempts.
- [ ] Restrict role creation/editing/retirement to Company Admin/root client access administration unless a later approved design explicitly delegates it.
- [ ] Do not let custom roles grant `platform.*` or equivalent internal platform capabilities.
- [ ] Do not let ordinary custom-role configuration manufacture root Company Admin authority, core membership administration, or other protected permissions that the security design marks non-assignable.
- [ ] If a dedicated internal `company.roles.manage` permission is introduced, keep it protected/non-self-assignable through normal custom-role editing.
- [ ] Preserve current bounded member-level permission overrides and make them compose deterministically with custom roles. Existing deny precedence must remain explicit if that is the current rule.
- [ ] Ensure UI checks, server endpoints, RPCs and RLS all consume the same effective-permission outcome.
- [ ] Audit role create/update/archive and member role assignment/reassignment changes with no sensitive values leaked in audit metadata.

#### Tests first / regression matrix

- [ ] Add failing tests before implementation for custom-role create/update/assign/archive and privilege-escalation denial.
- [ ] Cover built-in role preservation/backwards compatibility.
- [ ] Cover custom role with read-only permissions, custom role with selected manage permissions, and custom role changes affecting an assigned synthetic user.
- [ ] Cover unauthorized FINANCE/PAYROLL/VIEWER attempts to create/edit roles.
- [ ] Cover protected-permission grant attempts.
- [ ] Cover cross-company role targeting even though the deployment is single-company by design.
- [ ] Cover in-use role retirement/reassignment behavior.
- [ ] Cover member override composition with a custom role.
- [ ] Cover stale/archived role IDs failing closed.
- [ ] Add concurrency/locking coverage if role update/assignment races can otherwise create inconsistent effective authority.

#### Mandatory DB validation

Because this changes RBAC/database contracts:

- [ ] clean local migration replay;
- [ ] pgTAP;
- [ ] migration tests;
- [ ] upgrade-path tests from existing built-in-role deployments;
- [ ] runtime RLS/RPC authorization tests;
- [ ] relevant concurrency tests;
- [ ] verify existing members keep their intended built-in roles after upgrade.

Static SQL/string tests are not sufficient.

### Task 4: Fix any additional security defects justified by the audit

**Files:** Determined by concrete findings only.

**Produces:** Minimal hardened implementation beyond the required custom-role work, or a documented finding that no additional security change is required.

- [ ] For each additional real defect, write or identify a failing regression test first.
- [ ] Implement the smallest change that closes the defect without weakening financial/history/source-of-truth invariants.
- [ ] Run the new/focused test and verify the original failure is prevented.
- [ ] If further migrations/RLS/RPC/grants/triggers/security-definer behavior change, include them in the same strict local Supabase/Docker validation pass.
- [ ] If Docker/Supabase is unavailable, stop short of claiming the DB fix certified and report exactly which runtime checks are missing.
- [ ] Do not apply production migrations or modify production data in this phase.

### Task 5: Define and verify the post-handoff custody checklist

**Files:**
- Create or update a focused handoff checklist referenced by the security spec, location chosen consistently under `docs/`.
- Update `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md` / runbook only where the verified handoff operating model requires durable clarification.

**Produces:** An actionable separation between application controls and external account custody.

- [ ] Define the minimum handoff checks for production Supabase, Render, Google/provider accounts, production Auth membership, platform-maintenance records, production secrets and release authority.
- [ ] Require the developer's normal support path to use QA/synthetic data and no standing client production membership/data-plane credential.
- [ ] Document the distinction between direct data-plane access and ability to submit/release reviewed code.
- [ ] Define an exceptional incident-access procedure: client-granted, bounded, auditable and revoked afterward; do not pretend the application can enforce ownership of external SaaS accounts.
- [ ] Add role-handoff checks: client Company Admin exists, custom roles are client-owned/configurable, built-in starter roles remain available, and no developer membership is required to administer roles.
- [ ] Provide a safe re-verification checklist clients/operators can repeat without exposing confidential records.

### Task 6: Capture synthetic security evidence

**Files:**
- Create: `artifacts/client-security/screenshots/`
- Create/update: `artifacts/client-security/EVIDENCE.md`

**Produces:** 4–6 client-understandable screenshots with no production data/secrets.

- [ ] Use the isolated QA deployment or safe local authenticated QA harness with purpose-built synthetic users.
- [ ] Capture Access / Team Management showing built-in starter roles and synthetic users.
- [ ] Capture the custom-role create/edit experience using a synthetic role such as `Project Manager` or `Procurement Officer` and a safe permission selection.
- [ ] Capture at least one restricted custom-role or Viewer denied-action example proving least privilege.
- [ ] Capture access/audit history for synthetic role creation/edit/assignment changes if the UI supports it clearly.
- [ ] Capture the QA/synthetic-data boundary and one safe credential/provider-status view only if it demonstrates a verified control without exposing identifiers/secrets.
- [ ] Inspect every screenshot manually; crop/redact/remove accidental emails, UUIDs, project refs, tokens, real filenames, financial values, or confidential content.
- [ ] Map each screenshot and each material PDF claim to its evidence source in `EVIDENCE.md`.

### Task 7: Generate the concise client security PDF

**Files:**
- Create: `docs/client-facing/HYDROQUALISENSE_CLIENT_SECURITY_OVERVIEW.md` or a focused HTML/source equivalent
- Create: `artifacts/client-security/Hydroqualisense_Client_Security_Overview.pdf`
- Use: `artifacts/client-security/screenshots/`
- Use: `artifacts/client-security/EVIDENCE.md`

**Produces:** A branded, regeneratable client PDF of about six pages.

- [ ] Draft only from the evidence matrix; remove or qualify any unsupported statement.
- [ ] Include: security-at-a-glance, role/access matrix, custom-role flexibility, isolation/data protection, integrations/secrets, post-handoff support model, evidence/shared responsibility.
- [ ] Present Company Admin / Finance / Payroll / Viewer as **starter roles**, not the only roles the platform supports.
- [ ] Include a clear business-facing statement that authorized Company Administrators can create/edit company-specific custom roles and choose the operational access required for those roles.
- [ ] State that role/access changes are company-scoped and auditable only after QA/security evidence proves it.
- [ ] State that protected platform/root-administration authority remains outside ordinary custom-role configuration.
- [ ] Keep the main role matrix business-friendly; raw permission keys belong in internal evidence, not the main PDF.
- [ ] State the handoff model precisely: no standing developer **data-plane** access after completed handoff, while reviewed software releases remain part of maintenance/change control.
- [ ] Avoid unsupported certifications, absolutes, vendor guarantees, retention/RTO claims, or vague “100% secure” wording.
- [ ] Use Hydroqualisense branding, readable tables and 4–6 useful screenshots.
- [ ] Generate the PDF using an existing reliable repository PDF path where suitable; otherwise use a minimal deterministic HTML/browser PDF path rather than introducing a large new dependency.

### Task 8: Visually certify the PDF and validate the final diff

**Produces:** Evidence that the delivered PDF is readable and matches the verified security state.

- [ ] Render/inspect every PDF page, not just the source document.
- [ ] Check page count, margins, logo, headings, tables, screenshot sharpness, text clipping/overflow, links and footer/page numbering.
- [ ] Verify no secret/PII/confidential data appears in the PDF or committed screenshots.
- [ ] Verify every flexible-role statement against the custom-role implementation and QA runtime evidence.
- [ ] Run focused RBAC/security/document-generation tests added or edited by this phase.
- [ ] Run `npm.cmd run test:affected:agent`.
- [ ] Run lint/build/browser/Workflow Map where the executable diff requires them.
- [ ] Complete strict DB validation because Task 3 changes database/security contracts.
- [ ] Review the complete final diff for scope creep and compare every PDF claim against `EVIDENCE.md`.
- [ ] Synchronize `AGENTS.md`, roadmap, handoff, phase spec, deployment docs and `src/config/productFeatures.ts` only where actual final product truth requires it.
- [ ] Push the feature branch and open a PR. Codex must not merge its own PR.

## Stop boundaries

- Stop rather than fabricating a client-facing claim when evidence is missing.
- Do not claim custom roles are available if only schema/backend work exists but the authorized client workflow is incomplete.
- Stop rather than accessing production confidential records merely to obtain a screenshot or prove a control.
- Stop rather than performing a production DB/security mutation without separate explicit production authorization.
- Stop rather than calling an external-account custody policy a technical guarantee.
- Do not let spare time expand this phase into Worker Registration, biometrics, deferred Documents work, unrelated UI redesign, or provider-readiness implementation.