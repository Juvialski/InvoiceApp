# Hydroqualisense Client Security Evidence Matrix

Status: **QUALIFIED IMPLEMENTATION HANDOFF - NOT SECURITY CERTIFICATION**
Verification date: **2026-09-15**
Environment in scope: **local repository / no production data**

Evidence categories are `SOURCE`, `DB`, `QA_RUNTIME`, `CI_RELEASE`,
`VENDOR_CONFIG`, and `HANDOFF_POLICY`. A handoff policy is an operational
responsibility, not a technical guarantee.

| Claim | Evidence category | Source | Verification result | Date | Qualification |
| --- | --- | --- | --- | --- | --- |
| Each client deployment is intended to have an isolated application, Supabase project, Auth, Storage boundary, and configured company. | SOURCE | `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`; `supabase/migrations/20260828150000_single_company_deployment.sql` | PASS at source-contract level | 2026-09-15 | Exact deployed client mapping still requires operator verification. |
| Built-in roles remain protected starter templates. | SOURCE | `supabase/migrations/20260915024105_client_security_custom_roles.sql`; `src/components/access/CompanyRoleManagement.tsx` | PASS in static contract tests | 2026-09-15 | Local DB replay/runtime authorization is blocked by unavailable Docker. |
| Company Administrators can define company-scoped custom roles with selected operational permissions. | SOURCE | `supabase/migrations/20260915024105_client_security_custom_roles.sql`; `src/components/access/DeploymentAccessManagement.tsx`; `src/components/access/CompanyRoleManagement.tsx` | Implemented in source; runtime not verified | 2026-09-15 | Do not publish as an available/certified client capability until DB and QA evidence passes. |
| Custom role names are descriptive; effective permissions remain the authority. | SOURCE | `src/utils/accessControl.ts`; `supabase/migrations/20260915024105_client_security_custom_roles.sql`; existing `private.effective_company_permissions` contract | PASS in source review | 2026-09-15 | Runtime RLS/RPC proof remains blocked. |
| Protected platform/root permissions cannot be manufactured through custom roles or ordinary overrides. | SOURCE | `private.assert_custom_role_permissions`; `platform_update_company_member_permissions`; focused static tests | PASS in source/static tests | 2026-09-15 | Runtime DB denial tests are not executed. |
| Cross-company custom-role targeting fails closed. | SOURCE | `private.enforce_company_role_scope`; deployment-company guards; custom-role test contract | PASS in source/static tests | 2026-09-15 | Runtime cross-company denial is pending Docker/QA. |
| In-use custom roles cannot be archived and role/member changes are audited. | SOURCE | `archive_company_role`; audit allowlist and `private.write_company_audit` calls | PASS in source/static tests | 2026-09-15 | Runtime lifecycle and concurrency evidence is pending. |
| RLS/RPC/server/UI use the same effective-permission outcome. | DB | custom-role migration plus existing access/RLS/RPC migrations | BLOCKED - local Docker unavailable | 2026-09-15 | Do not call this DB/security-certified until clean replay, pgTAP, and runtime authorization pass. |
| Server-only credentials remain outside ordinary browser state. | SOURCE | `src/lib/supabase.ts`; Gmail/AI/Storage server boundaries; existing security tests | PASS at source/test level | 2026-09-15 | Live deployment secret configuration is not verified here. |
| QA/support uses synthetic data and separates release authority from production data-plane authority. | CI_RELEASE / HANDOFF_POLICY | `docs/HYDROQUALISENSE_DEPLOYMENT_RUNBOOK.md`; `docs/HYDROQUALISENSE_CLIENT_SECURITY_HANDOFF_CHECKLIST.md` | Policy/checklist present | 2026-09-15 | Operational completion must be recorded per client deployment. |
| Gmail authorization is server-held and refreshable. | SOURCE | `src/server/gmail/gmailAccess.ts`; `src/server/gmail/gmailAuthorization.ts`; `src/server/gmail/gmailCredentialEncryption.ts` | PASS at source level | 2026-09-15 | External OAuth configuration/reauthorization is not certified. |
| SMS delivery is available/certified. | VENDOR_CONFIG / QA_RUNTIME | Approved Company SIM Gateway and PhilSMS boundaries in runbook | NOT CLAIMED - unavailable/unverified | 2026-09-15 | No provider credentials/device runtime or controlled delivery evidence was used. |
| No standing developer/operator access to confidential production data remains after handoff. | HANDOFF_POLICY | `docs/HYDROQUALISENSE_CLIENT_SECURITY_HANDOFF_CHECKLIST.md` | NOT VERIFIED for a specific client | 2026-09-15 | Requires client-owned account custody and removal/revocation evidence; application RBAC alone is insufficient. |
| Client security PDF claims are evidence-backed. | SOURCE / DB / QA_RUNTIME | This matrix; `docs/client-facing/HYDROQUALISENSE_CLIENT_SECURITY_OVERVIEW.md`; generated PDF | Qualified draft only | 2026-09-15 | Runtime-dependent claims are explicitly marked pending; no certification or compliance badge is claimed. |

## Blockers and skipped evidence

- Local `supabase status` and `supabase db reset --local --no-seed --yes` could not connect to Docker Desktop's Linux engine pipe. Clean replay, pgTAP, runtime RLS/RPC tests, upgrade-path tests, and concurrency tests are therefore **BLOCKED**.
- No QA deployment was mutated or promoted during this implementation run.
- Two prior authenticated synthetic QA interface screenshots from the existing QA artifact set are included for context. A current-release custom-role/restricted-access screenshot is still pending; the PDF does not present the prior captures as proof of the new role feature.
- No production records, production Storage, production Auth, production provider credentials, or confidential client data were inspected.

## Evidence rule

The security overview must be regenerated or edited from this matrix. If a future
runtime result conflicts with a source-level claim, use the narrower statement or
fix the control before publishing the client document.
