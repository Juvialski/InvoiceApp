# Hydroqualisense Client Security Assurance & Handoff Phase

Status: **PRIORITIZED — EVIDENCE-FIRST SECURITY AUDIT, FLEXIBLE RBAC HARDENING, HANDOFF CONTROL, AND CLIENT SECURITY PDF**  
Date: **2026-09-15**  
Repository: `Juvialski/InvoiceApp`

This phase is explicitly prioritized by the user before later product expansion. It does **not** replace the unfinished Email/SMS provider-readiness work; that work remains incomplete and can resume after this security phase. Worker Registration remains paused.

## Purpose

Produce a concise, client-facing security document that explains how Hydroqualisense protects a client's operational data using only verified technical and operational facts. The primary deliverable is a polished PDF with safe screenshots from QA/synthetic data. If the audit finds a concrete security gap that prevents an intended client-facing statement from being true, fix the gap before publishing that statement.

This phase also includes an approved RBAC product requirement: the four current roles are starter templates, not the permanent limit of the system. Authorized Company Administrators must be able to create company-specific custom roles with custom operational access, edit those custom roles safely, assign them to users, and audit the resulting access changes. This capability must be implemented and security-tested before the PDF claims that role access is flexible/editable.

The phase must not turn aspirational security language into a claim. Every material statement in the PDF must have traceable evidence from current source, current migrations/database behavior, current QA runtime behavior, or an explicitly documented handoff policy.

## Core handoff objective

The intended post-handoff operating model is:

> **No standing developer/operator access to a client's confidential production data plane after handoff.** Normal maintenance is performed by reproducing issues with QA/synthetic data, fixing the shared codebase, validating the change in QA, and releasing reviewed code to the client's production deployment.

This statement is a **target security property**, not an automatic claim about every current deployment.

The final client PDF may state it only after the phase verifies the actual handoff controls for the deployment being described. In particular, application RBAC alone does not prove that the developer cannot access production data if the developer still retains Supabase dashboard access, production database credentials, Render secret access, production Auth administration, a production company membership, an explicitly provisioned platform-maintenance identity, or another equivalent data-plane credential.

### Precise boundary

The desired promise is about **direct standing access to client records and production administration**, not a claim that software maintenance can have no effect on production. A reviewed code release or approved migration can change application behavior or database structure by design. The client-facing document must distinguish:

- **data-plane access:** direct access to production database rows, Storage objects, Auth users, confidential documents, provider credentials, or privileged admin consoles;
- **code/release access:** ability to prepare and release reviewed application code through the approved deployment pipeline;
- **temporary incident access:** exceptional access explicitly granted by the client for a bounded support incident, if ever needed.

Do not claim that a developer is technically incapable of affecting production through a software release if the developer retains release authority. Instead, document the actual change-control and data-access boundaries accurately.

## Existing security foundations to verify, not merely repeat

The repository already contains substantial security architecture that this phase must inspect and runtime-test before using it as client-facing evidence:

- one maintained source repository with **one isolated deployment + one Supabase project/database/Auth/Storage boundary per client**;
- one configured deployment company per client database, with `company_id` retained as defense in depth;
- company membership, permission-based RBAC, company-scoped RLS, company-bound foreign keys, permission-checked RPCs, Storage boundaries, and audit history;
- protected server-only secrets that are not intended for browser exposure;
- immutable/history-preserving patterns for sensitive financial/document workflows;
- a separate QA deployment using synthetic data only;
- guarded production migration/release rules rather than treating QA success as production authorization.

Authoritative starting references include:

- `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`
- `docs/HYDROQUALISENSE_DEPLOYMENT_RUNBOOK.md`
- `src/utils/accessControl.ts`
- `src/lib/companyAccess.ts`
- tenancy/RBAC/RLS/security migrations under `supabase/migrations/`
- domain-specific security, audit, financial-integrity, Storage, provider, and secret-handling migrations/tests

### Planning observations already verified on 2026-09-15

These observations are useful inputs but are **not** a substitute for the phase's final exact-state certification:

- the current QA role catalog contains four assignable client roles: `COMPANY_ADMIN`, `FINANCE`, `PAYROLL`, and `VIEWER`;
- those four roles are the **current built-in role templates**, not the approved end-state limit;
- current QA role permissions are permission-based and differ materially by role;
- current QA and current production each reported **zero rows** in both `platform_admins` and `platform_admin_allowlist` during a read-only planning check;
- the single-company platform-maintenance migration explicitly clears legacy inherited platform-operator records and requires any later maintenance operator to be provisioned deliberately;
- the guarded deployment bootstrap creates the initial client `COMPANY_ADMIN` through a service-role-only authority and does not expose that bootstrap RPC to ordinary browser roles.

These facts must be rechecked where necessary before publication. Do not publish account-specific or production-sensitive identifiers in the client PDF.

## Flexible roles and access — approved required capability

The security phase must implement and verify a flexible company-scoped RBAC model before the PDF advertises it.

### Built-in starter roles

Keep these four roles as safe built-in starter templates:

- `COMPANY_ADMIN`
- `FINANCE`
- `PAYROLL`
- `VIEWER`

They provide useful defaults and backwards compatibility. They are **not** the only roles a client may use.

Built-in starter roles should remain canonical/protected rather than being renamed or deleted in place. A Company Administrator should be able to duplicate/use them as a starting point for a custom role when the company needs a different access profile.

### Company-defined custom roles

An authorized Company Administrator must be able to create company-specific roles such as:

- Project Manager
- Procurement Officer
- Warehouse Staff
- Site Engineer
- Accounts Payable Reviewer
- any other business role the company needs

A custom role must support:

- company-scoped unique identity;
- business-facing name and optional description;
- a selectable set of currently assignable operational permissions;
- editing of its name/description/permission set;
- duplication from a built-in or custom role where useful;
- assignment/reassignment to company members;
- safe archival/retirement;
- audit history for create/update/archive and member assignment changes.

Changes to a custom role's permissions must affect the effective permissions of members assigned to that role without requiring hardcoded application changes for each new role name.

### Protected authority boundary

Custom roles must **not** become a privilege-escalation mechanism.

At minimum:

- no custom role may manufacture any `platform.*` or equivalent internal platform capability;
- ordinary role customization must not grant the authority to create/modify root Company Admin authority;
- company member/access administration and company settings/root administration must remain protected according to the final verified security design;
- role creation/editing itself must be restricted to Company Admin/root client administration unless a later explicitly approved design safely introduces delegated role-management authority;
- custom roles and their permissions are always scoped to the deployment company;
- custom roles must never affect another client deployment/company;
- server/RPC/RLS enforcement must resolve effective permissions independently of the display role name.

The implementation may introduce a dedicated protected role-management permission internally if that produces a cleaner authority model, but it must not make that capability freely self-assignable through ordinary custom roles.

### Lifecycle safety

Do not hard-delete a role in a way that strands assigned members or silently changes their authority.

Preferred behavior:

- built-in starter roles cannot be deleted;
- custom roles can be archived/retired;
- an in-use custom role must require reassignment of its members before retirement, or an equally explicit atomic reassignment workflow;
- all consequential role/member changes are auditable;
- stale/deleted role identifiers cannot grant permissions accidentally.

### Current role summaries for the client PDF

The PDF should explain the built-in roles as starter templates, then explain that Company Administrators can create company-specific roles with custom access.

#### Company Admin

Expected client-facing summary: full operational access within the configured company, including company settings and member/access administration. Verify the exact current permission set before publishing.

#### Finance

Expected client-facing summary: finance-focused operational access such as cash/banking, invoices, expenses, vendors, procurement, inventory/project financial work, and financial reports, while excluding payroll-detail/workforce administration and company member/settings administration unless the verified model explicitly allows a safe customization path. Verify exact current behavior.

#### Payroll

Expected client-facing summary: workforce/payroll access, including payroll detail, payroll processing/approval/settings/import and payroll reporting, without general finance/invoice/cash administration. Verify exact current behavior.

#### Viewer

Expected client-facing summary: read-only access to the permitted company operational/financial/project surfaces and aggregate payroll summary where currently allowed, with no ordinary manage/approve/settings/member-administration authority. Verify exact current behavior.

#### Custom roles

Expected client-facing summary: authorized Company Administrators can create and edit company-specific roles and choose the operational access needed for that role. Protected platform/root-administration capabilities remain outside ordinary custom-role configuration.

### Member-level permission overrides

The existing bounded member-level permission override concept may remain available for fine-tuning individual access, but it must compose cleanly with custom roles rather than becoming a second contradictory authority system. Verify and preserve the rule that privileged platform/root administration cannot be manufactured through ordinary overrides.

Do not present a `Platform Owner` as a normal client role. Client deployments should not receive an implicit global platform operator.

## Security-gap audit before writing the PDF

Codex must audit the real system before deciding that no security code change is required. Focus on the intended client handoff model and high-impact authorization boundaries rather than performing an unbounded generic security review.

Audit at least:

1. **Client/deployment isolation**
   - one configured client company per deployment;
   - company-bound access in RLS/RPC/Storage;
   - no cross-company fallback or arbitrary company targeting.
2. **Role and permission enforcement**
   - UI permissions are not the sole control;
   - server/RPC/RLS paths enforce the same authority;
   - sensitive payroll/finance/member/settings actions are denied to unauthorized roles;
   - custom role names never become the authorization primitive;
   - custom role permissions resolve through the same effective-permission authority used by RLS/RPC/server/UI;
   - protected permissions cannot be added through custom roles or ordinary member overrides.
3. **Custom-role lifecycle and escalation resistance**
   - company-scoped role creation/edit/update/archive;
   - role assignment/reassignment safety;
   - in-use role retirement cannot strand users;
   - cross-company role targeting is denied;
   - unauthorized role-management attempts are denied;
   - built-in/root authority cannot be overwritten through custom-role paths;
   - concurrent edits/assignments preserve a deterministic final authority state where applicable.
4. **Developer/platform access after handoff**
   - no implicit or seeded platform administrator survives in client production;
   - no developer account needs a client company membership for normal support;
   - any exceptional maintenance identity is explicit, auditable, and removable;
   - document the external credential/account-custody steps needed so the developer does not retain Supabase/Render/provider data-plane access after handoff.
5. **Privileged server endpoints and secrets**
   - service/secret keys stay server-only;
   - no privileged key is emitted to browser state, logs, status responses, screenshots, or generated documentation;
   - server endpoints using elevated keys still enforce authenticated company/permission/business rules as applicable.
6. **Audit/history/integrity**
   - sensitive access-management and consequential business changes preserve the intended audit/history behavior;
   - immutable financial/document history claims used in the PDF are supported by current implementation/tests.
7. **QA/support boundary**
   - QA uses synthetic data only;
   - production confidential data is not copied into QA as a normal debugging workflow;
   - the bugfix flow works without routine production record inspection.
8. **Release/change control**
   - protected `main`, applicable CI, exact-head review, migration separation, and deployment identity are represented accurately;
   - distinguish code deployment authority from database/data-plane authority.
9. **External integrations**
   - Gmail/AI/SMS/provider credentials are server-side where designed;
   - scopes and human confirmation boundaries are represented accurately;
   - unfinished provider certification is not presented as a completed security control.

Because custom roles change authorization and database contracts, this phase is expected to require executable security/database work unless live inspection proves an equivalent capability already exists. Database/RLS/RPC/security changes require the repository's strict local Supabase/Docker validation, including applicable clean migration replay, pgTAP, upgrade-path, runtime authorization, and relevant concurrency checks. Do not replace runtime proof with string/static SQL tests.

## Post-handoff production custody model

The phase must create a practical handoff checklist. The target model is:

- client owns or controls the production Supabase organization/project access;
- client owns or controls the production Render account/service and production secrets, or an equivalent arrangement that prevents standing developer access to those secrets/data after handoff;
- client controls production Google/provider accounts where client data is involved;
- the developer does not keep a production company membership merely for support;
- no standing `platform_admin`/platform allowlist entry remains for the developer after handoff;
- direct production database, Storage, Auth-user, and secret access is removed from the developer's normal support workflow;
- normal bug reports are reproduced with QA/synthetic fixtures;
- fixes are validated against QA and delivered through protected, reviewed source control/release paths;
- migration-bearing production releases require the approved production migration process and client/operator authorization rather than ad-hoc SQL/data edits;
- if extraordinary production inspection is genuinely necessary, access must be deliberately client-granted, narrowly scoped where the provider allows, time-bounded, used only for the incident, and revoked afterward.

The checklist must identify which items are **technical controls** and which depend on **external account ownership/operational policy**. Do not imply the application can revoke access to a Supabase or Render account it does not control.

## Evidence rules — no hallucinations

Before drafting client prose, build an internal evidence matrix. Each material statement must point to one or more of:

- `SOURCE` — current application/server code;
- `DB` — current migration, policy, grant, trigger, function, or runtime database proof;
- `QA_RUNTIME` — authenticated/synthetic QA evidence;
- `CI_RELEASE` — current protected release/change-control evidence;
- `VENDOR_CONFIG` — safely observed provider configuration without exposing secrets;
- `HANDOFF_POLICY` — an operational policy/checklist item that is not itself enforced by application code.

Rules:

- Never convert a `HANDOFF_POLICY` item into a technical-guarantee statement.
- If evidence conflicts, use the narrower claim or fix the control.
- If a claim cannot be verified, omit it or label it as a customer/operator responsibility.
- Do not claim flexible/custom roles until the custom-role implementation is complete and QA/security evidence proves it.
- Do not claim certifications that have not been obtained: no SOC 2, ISO 27001, PCI DSS, HIPAA, GDPR certification, OWASP certification, third-party penetration-test result, or similar badge by implication.
- Do not claim generic phrases such as “military-grade,” “unhackable,” “zero risk,” or “100% secure.”
- Do not promise encryption characteristics, backup recovery times, retention periods, geographic residency, or vendor guarantees unless the exact current configuration/evidence supports them.
- Do not include secrets, full tokens, private keys, passwords, confidential client rows, production employee data, production financial data, real Gmail content, or real client source documents in evidence artifacts.

## Client PDF deliverable

Create a polished, branded PDF with a source document that can be regenerated. Target **about 6 concise pages**, not a long security whitepaper.

Suggested structure:

1. **Security at a glance** — isolated client deployment, authenticated access, least privilege, audit/history, server-side secrets, separate QA.
2. **Who can access what** — compact starter-role matrix for Company Admin / Finance / Payroll / Viewer plus a clear custom-role capability section showing that companies can create/edit their own roles and choose permitted operational access.
3. **How client data is isolated and protected** — one-client deployment boundary, company/RLS/RPC/Storage defense in depth, sensitive-history controls.
4. **Integrations and secrets** — Google/Gmail, AI, SMS/other providers only to the extent currently verified; human review/confirmation boundaries where applicable.
5. **After handoff: client-controlled production** — no standing developer data-plane access target, QA-first bugfix model, reviewed release path, emergency-access exception policy.
6. **Evidence and shared responsibility** — selected screenshots, what Hydroqualisense controls, what the client controls, verification date/version.

Recommended client-facing wording after implementation is verified:

> **Flexible role-based access:** Hydroqualisense includes built-in starter roles and lets authorized Company Administrators create company-specific roles with custom operational access. Role definitions and access changes are company-scoped and auditable, while protected platform/root-administration capabilities remain outside ordinary custom-role configuration.

Keep client language clear and business-facing. Avoid exposing migration names, internal agent terminology, test commands, service-role implementation details, raw permission keys, database internals, or GitHub plumbing unless a short technical note materially improves trust.

### Screenshots

Use **QA, demo, or purpose-built synthetic accounts/data only**. Never capture production confidential content.

Prefer 4–6 useful screenshots integrated into the relevant pages, for example:

- Access / Team Management showing built-in starter roles and synthetic users;
- the custom-role create/edit experience showing a synthetic role and selected permissions;
- a restricted custom-role or Viewer view / denied action demonstrating least privilege;
- access/audit history showing synthetic role creation/edit/assignment changes;
- QA environment banner / synthetic-data boundary;
- a safe provider/security status surface that demonstrates credentials are not displayed.

Crop screenshots tightly. Redact or replace any accidental email address, UUID, project ref, token, provider identifier, confidential filename, or other unnecessary identifier. Do not use screenshots merely as decoration.

### PDF quality

The final PDF must:

- use Hydroqualisense branding/logo cleanly;
- have consistent margins, page numbers, headings, and readable tables;
- avoid clipped text, screenshot scaling artifacts, broken links, excessive technical jargon, or tiny footnotes;
- render screenshots sharply enough to read at normal zoom;
- be visually inspected page-by-page after generation;
- preserve a regeneratable source plus an evidence manifest in the repository.

Recommended repository outputs:

- phase contract: `docs/HYDROQUALISENSE_CLIENT_SECURITY_ASSURANCE.md`;
- implementation plan: `docs/superpowers/plans/2026-09-15-client-security-assurance.md`;
- client-facing source: `docs/client-facing/HYDROQUALISENSE_CLIENT_SECURITY_OVERVIEW.md` or a focused HTML/source equivalent;
- PDF: `artifacts/client-security/Hydroqualisense_Client_Security_Overview.pdf`;
- evidence manifest: `artifacts/client-security/EVIDENCE.md`;
- screenshots: `artifacts/client-security/screenshots/`.

The implementation may choose an existing repository PDF/rendering path instead if it produces a more reliable artifact, but it must keep the final PDF and reproducible source/evidence association clear.

## Acceptance criteria

The phase is complete only when:

- current security architecture and handoff boundaries have been reviewed against live source/database contracts;
- flexible company-defined custom roles are implemented end-to-end, not merely documented;
- the four built-in roles remain safe starter templates rather than the only allowed roles;
- an authorized Company Administrator can create, edit, duplicate where supported, assign/reassign, and safely archive company-scoped custom roles with custom operational access;
- custom role changes flow through the same effective-permission authority enforced by server/RPC/RLS/UI boundaries;
- protected platform/root administration cannot be manufactured through custom roles or ordinary member overrides;
- role lifecycle and access changes are auditable and cannot strand users silently;
- cross-company custom-role targeting is denied;
- any concrete high-impact security defect discovered in scope is fixed and regression-tested;
- the role summary is derived from the current role/permission source of truth and verified in QA;
- the intended no-standing-developer-data-access handoff model has a concrete checklist and clearly separates app controls from external account custody;
- the PDF contains no unsupported security or compliance claims;
- screenshots use only synthetic/non-confidential data and contain no secrets;
- the final PDF is concise, polished, readable, and visually certified page-by-page;
- the evidence manifest maps material client claims to verified evidence;
- roadmap/handoff/agent policy are synchronized to reflect this prioritized phase and its final state;
- unfinished Gmail/SMS/Google verification/provider readiness remains represented truthfully;
- Worker Registration remains paused unless the user explicitly reprioritizes again.

## Out of scope

This phase does not automatically authorize:

- production data mutation or exploratory production-data access;
- copying production data into QA;
- a broad penetration test against production;
- new biometric/face-recognition work;
- Worker Registration;
- resuming deferred Wide Documents work;
- making unverified legal/compliance certifications;
- changing financial, payroll, inventory, or document source-of-truth semantics merely to simplify the PDF;
- allowing custom roles to create platform-wide authority or weaken the single-company deployment boundary.

Production remains protected by the existing authorization policy. Any production migration or data-changing action still requires the repository's explicit production authorization process.