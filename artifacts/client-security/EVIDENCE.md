# Hydroqualisense Client Security Evidence Matrix

Status: **QUALIFIED IMPLEMENTATION HANDOFF - NOT SECURITY CERTIFICATION**
Verification date: **2026-09-15**
Repository branch: `codex/client-security-follow-up`
Environment in scope: **isolated QA and local repository only; no production data**

Evidence categories are `SOURCE`, `DB`, `QA_RUNTIME`, `CI_RELEASE`,
`VENDOR_CONFIG`, and `HANDOFF_POLICY`. A handoff policy is an operational
responsibility, not a technical guarantee.

| Claim or artifact | Evidence category | Source | Verification result | Qualification |
| --- | --- | --- | --- | --- |
| Each client deployment is intended to have an isolated application, Supabase project, Auth, Storage boundary, and configured company. | SOURCE | `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`; single-company deployment contract | PASS at source-contract level | Exact deployed client mapping remains an operator check. |
| Built-in roles remain protected starter templates and custom roles remain company-scoped. | SOURCE / DB | `supabase/migrations/20260915024105_client_security_custom_roles.sql`; access-management UI | PASS in focused static tests | Runtime replay and authorization remain pending for this branch. |
| Authorized Company Administrators can create, edit, duplicate, assign/reassign, and archive custom roles. | SOURCE | custom-role RPC and Settings access workflow | Implemented in source | Do not call this a certified client capability until exact DB and authenticated QA evidence passes. |
| Custom role names are descriptive; effective permissions remain authoritative. | SOURCE | `src/utils/accessControl.ts`; custom-role migration; existing effective-permission resolver | PASS in source review and focused tests | Runtime RLS/RPC proof remains pending. |
| Payroll no longer receives Dashboard, Projects, or engineering workspace access by default. | SOURCE | `src/utils/accessControl.ts`; forward Payroll reference migration; role navigation tests | PASS in source and focused tests | The deployed QA release still has the pre-fix profile until this branch is deployed and its migration is applied. |
| Payroll retains the separate payroll Reports view while project labels use a narrow reference path. | SOURCE | `src/lib/projects.ts`; Payroll prop/type flow; Reports route permission behavior | PASS in source and focused tests | Exact DB/RPC and authenticated branch runtime proof remains pending. |
| The Payroll reference RPC returns only project id/code/name/status/archive fields and rejects wrong-company or insufficient-permission calls. | DB | generated forward migration and pgTAP assertions | BLOCKED - runtime not executed | Local Docker is unavailable; guarded QA promotion requires the exact branch release and protected DB access. |
| The pre-fix QA audit detected real Payroll leakage. | QA_RUNTIME | Exact QA health: environment `qa`, deployment `qa-hydroqualisense`, pre-fix release `ddbd9d6`, migration `20260915024105`; role screenshot harness manifest | FAIL by design for Payroll | The observed pre-fix screenshots are not current-release client evidence and are not retained for the final PDF. |
| Finance and Viewer showed their intended current pre-fix read/finance navigation, and the restricted custom role showed Warehouse only. | QA_RUNTIME | Authenticated synthetic role capture against the same pre-fix QA release | PASS for observed pre-fix profiles | Final branch screenshots must be recaptured after the exact branch release and migration are live. |
| Hidden modules also fail through direct URL entry and protected actions remain permission-checked. | SOURCE / QA_RUNTIME | App route guard; role harness deep-link results | Source PASS; Payroll pre-fix deep links exposed the defect | Final branch runtime result is pending. |
| Server-only credentials remain outside ordinary browser state. | SOURCE | existing Supabase/Gmail/AI/Storage server boundaries and focused security tests | PASS at source/test level | Live deployment secret configuration remains an operator check. |
| QA/support uses synthetic data and separates release authority from production data-plane authority. | CI_RELEASE / HANDOFF_POLICY | deployment runbook; custody checklist; role harness target guard | Policy and harness present | Per-client account-custody completion must be recorded at handoff. |
| Managed Support Access and Independent Client Control are both legitimate handoff models. | HANDOFF_POLICY | client source and `docs/HYDROQUALISENSE_CLIENT_SECURITY_HANDOFF_CHECKLIST.md` | PASS as documented policy | The selected model is recorded per client; it is not application state. |
| Gmail authorization is server-held and refreshable. | SOURCE | existing Gmail authorization/credential boundaries | PASS at source level | External OAuth configuration remains separate. |
| SMS delivery is available/certified. | VENDOR_CONFIG / QA_RUNTIME | approved provider direction in runbook | NOT CLAIMED - unavailable/unverified | No provider credentials or controlled delivery proof was used. |
| No standing developer/operator access to confidential production data remains after handoff. | HANDOFF_POLICY | custody checklist | NOT VERIFIED for a specific client | Requires client-owned account custody and removal/revocation evidence. |
| The final client PDF contains current role screenshots and certified flexible-role claims. | SOURCE / DB / QA_RUNTIME | client source, screenshot manifest, PDF | NOT READY - qualified draft only | The exact branch release is not deployed to the isolated QA application and the database migration is not promoted. |

## Screenshot artifact map

The final client PDF may use these assets only after the harness writes a `PASS`
manifest for the exact release and each file is manually inspected:

- `screenshots/company-admin-navigation-desktop.png` - Company Admin navigation;
- `screenshots/finance-navigation-desktop.png` - Finance navigation;
- `screenshots/payroll-navigation-desktop.png` - Payroll and payroll Reports navigation;
- `screenshots/viewer-navigation-desktop.png` - Viewer read-only navigation;
- `screenshots/custom-restricted-navigation-desktop.png` - custom Warehouse-only navigation;
- `screenshots/company-access-custom-role-editor-desktop.png` - Company Access and role editor.

The prior QA captures used to identify the Payroll defect are not final evidence
for this branch and must not be committed under these stable names.

## Blockers and skipped evidence

- Local Docker’s Linux engine is unavailable at `npipe:////./pipe/dockerDesktopLinuxEngine`; clean replay, pgTAP, runtime RLS/RPC, upgrade, and concurrency checks were not run locally.
- The guarded QA CLI path could not promote this branch from the local environment: the protected direct database credential is absent and the local QA file does not satisfy the guarded `HYDROQUALISENSE_QA_PROJECT_REF` direct-promotion contract.
- The isolated QA application currently serves the prior `ddbd9d683d91fd14f22bb8eb5883e36b7ed383b3` release and migration `20260915024105`, not this branch. The current-release role screenshots therefore remain pending.
- The authenticated pre-fix QA capture used synthetic accounts and exposed the real Payroll navigation/deep-link mismatch; its PNGs and manifest are temporary audit outputs, not final client artifacts.
- No production records, production Storage, production Auth, production provider credentials, or confidential client data were inspected.

## Evidence rule

The client security overview must be regenerated or re-certified only from this
matrix. If a future runtime result conflicts with a source-level claim, use the
narrower statement or fix the control before publishing the client document.
