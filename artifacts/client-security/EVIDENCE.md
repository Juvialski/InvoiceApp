# Hydroqualisense Client Security Evidence Matrix

Status: **QUALIFIED IMPLEMENTATION HANDOFF - LOCAL DB/RUNTIME PASS; HOSTED DEPLOYMENT CERTIFICATION PENDING**
Verification date: **2026-09-15**
Repository branch: `codex/client-security-follow-up`
Application release captured: `6aa6de1510927bbba01de170eea13c0c38280406`
Environment in scope: **local QA harness and isolated QA checks only; no production data**

Evidence categories are `SOURCE`, `DB`, `QA_RUNTIME`, `CI_RELEASE`,
`VENDOR_CONFIG`, and `HANDOFF_POLICY`. A handoff policy is an operational
responsibility, not a technical guarantee.

| Claim or artifact | Evidence category | Source | Verification result | Qualification |
| --- | --- | --- | --- | --- |
| Each client deployment is intended to have an isolated application, Supabase project, Auth, Storage boundary, and configured company. | SOURCE | `docs/HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md`; single-company deployment contract | PASS at source-contract level | Exact deployed client mapping remains an operator check. |
| Built-in roles remain protected starter templates and custom roles remain company-scoped. | SOURCE / DB / QA_RUNTIME | custom-role migration, effective-permission resolver, local replay/pgTAP, authenticated Company Access capture | PASS for the committed local implementation | Hosted deployment-specific certification remains separate. |
| Authorized Company Administrators can create, edit, duplicate, assign/reassign, and archive custom roles. | SOURCE / QA_RUNTIME | custom-role RPC and Settings access workflow; authenticated Company Access/custom-role editor capture | PASS in source and local QA evidence | The client must still record its selected custody model and exact deployment release. |
| Custom role names are descriptive; effective permissions remain authoritative. | SOURCE / DB / QA_RUNTIME | access-control source, custom-role migration, effective resolver, role matrix, local permission assertions | PASS | No display-role-name authorization branch was introduced. |
| Payroll no longer receives Dashboard, Projects, Documents, or unrelated engineering workspace access by default. | SOURCE / DB / QA_RUNTIME | forward Payroll reference migration, route/navigation tests, local replay/pgTAP, exact local role capture | PASS for the committed local implementation | The hosted QA deployment still serves the prior release until separately promoted. |
| Payroll retains the separate payroll Reports view while project context uses a narrow reference path. | SOURCE / DB / QA_RUNTIME | Payroll prop/type flow, reference RPC, aggregate guard, local replay/pgTAP, Payroll screenshot | PASS | The narrow reference projection is not a general Projects grant. |
| The Payroll reference RPC returns only project id/code/name/status/archive fields and rejects wrong-company or insufficient-permission calls. | DB | forward migration and `client_security_custom_roles_test.sql` | PASS in clean local replay and pgTAP | Remote QA migration promotion was not performed by this handoff. |
| Direct restricted URLs remain denied for Finance, Payroll, Viewer, and the restricted custom role. | SOURCE / QA_RUNTIME | App route guard, exact local role manifest, representative forbidden-path checks | PASS | Menu visibility was not used as the sole security boundary. |
| Automatic Payroll bootstrap does not write during an auth/company-access transition. | SOURCE / QA_RUNTIME | App guard regression test and exact local Payroll deep-link capture | PASS | This prevents transient reload state from attempting a write without ready access context. |
| The pre-fix QA audit detected real Payroll leakage. | QA_RUNTIME | prior exact QA health and pre-fix role capture | PASS as a historical defect finding | Those pre-fix screenshots are not current-release evidence and are not included in the PDF. |
| Server-only credentials remain outside ordinary browser state. | SOURCE | existing Supabase/Gmail/AI/Storage server boundaries and focused security tests | PASS at source/test level | Live deployment secret configuration remains an operator check. |
| The six role screenshots are authenticated, synthetic, exact-release captures with full navigation context. | QA_RUNTIME | `role-screenshot-manifest.json`; six PNG assets; manual image inspection | PASS for local QA harness | Manifest target: environment `qa`, deployment `local-qa-harness`, migration `20260915095911`, application SHA above. |
| The client PDF contains the two custody models and the current role evidence. | SOURCE / QA_RUNTIME | client source, six screenshots, PDF, pagewise Poppler renders | PASS: 7 source pages, 7 rendered PDF pages | It is a qualified handoff artifact, not a hosted or production security certification. |
| Managed Support Access and Independent Client Control are both legitimate handoff models. | HANDOFF_POLICY | client source, deployment strategy, handoff checklist | PASS as documented policy | The selected model is recorded per client; it is not application state. |
| Gmail authorization is server-held and refreshable. | SOURCE | existing Gmail authorization/credential boundaries | PASS at source level | External OAuth configuration and re-verification remain separate. |
| SMS delivery is available/certified. | VENDOR_CONFIG / QA_RUNTIME | approved provider direction in runbook | NOT CLAIMED - unavailable/unverified | No provider credentials or controlled delivery proof was used. |
| No standing developer/operator access to confidential production data remains after handoff. | HANDOFF_POLICY | custody checklist | NOT VERIFIED for a specific client | Requires client-owned account custody and removal/revocation evidence. |

## Local validation record

- `npm.cmd run lint` - PASS.
- focused role, Payroll reference, custom-role, screenshot-harness, and PDF-contract tests - PASS: 18/18 after the exact local capture existed.
- `npm.cmd run test:migrations` - PASS: 114 static migration checks and both upgrade-path fixtures.
- `npx.cmd supabase db reset --local --no-seed --yes` - PASS: all committed migrations, including `20260915095911`.
- `npx.cmd supabase test db --local` - PASS: 47 files, 1592 tests.
- exact local authenticated role capture - PASS: five role workspaces, representative forbidden deep links, clean console/page/request telemetry, and Company Access/custom-role editor.
- PDF render inspection - PASS: all seven letter pages rendered with Poppler and visually inspected.

## Screenshot artifact map

- `screenshots/company-admin-navigation-desktop.png` - Company Admin navigation;
- `screenshots/finance-navigation-desktop.png` - Finance navigation;
- `screenshots/payroll-navigation-desktop.png` - Payroll and payroll Reports navigation;
- `screenshots/viewer-navigation-desktop.png` - Viewer read-only navigation;
- `screenshots/custom-restricted-navigation-desktop.png` - custom Warehouse-only navigation;
- `screenshots/company-access-custom-role-editor-desktop.png` - Company Access and role editor.

The capture manifest contains only safe role labels, paths, assertions, telemetry,
and non-secret release metadata. It does not contain passwords, cookies, tokens,
user IDs, project IDs, or provider credentials.

## Blockers and skipped evidence

- The isolated hosted QA application remains at the earlier release/migration and was not changed by this handoff. The exact branch migration was not promoted remotely because the guarded path lacked the required protected direct-database credential/project contract; it refused before writing.
- No hosted-provider SMS configuration, controlled SMS send, or Gmail re-authorization proof was performed.
- No production records, production Storage, production Auth, production provider credentials, or confidential client data were inspected or changed.
- The local synthetic company and Auth users were created only in the disposable local Supabase stack for capture; they are not client or production evidence.
- A dedicated custom-role concurrency stress fixture was not added in this focused follow-up; existing local database/concurrency coverage remains applicable where selected by the repository tests.

## Evidence rule

The client security overview must be regenerated or re-certified only from this
matrix. If a future runtime result conflicts with a source-level claim, use the
narrower statement or fix the control before publishing the client document.
