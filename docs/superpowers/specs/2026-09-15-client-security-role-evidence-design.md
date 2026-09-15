# Client Security Role Evidence and Custody Handoff Design

**Date:** 2026-09-15  
**Status:** Approved design for implementation  
**Scope:** Client Security Assurance & Handoff follow-up

## Goal

Make the client security handoff truthful and useful by separating managed
support access from independent client custody, correcting the verified Payroll
navigation boundary, and publishing current authenticated synthetic-QA evidence
for the built-in and company-defined access profiles.

The existing company-scoped custom-role foundation remains the authority. This
follow-up must not introduce role-name authorization, a second permission
resolver, a shared tenant switcher, or production evidence.

## Findings that drive the design

The current built-in `PAYROLL` permission profile includes `dashboard.read`,
`projects.read`, and read access to engineering documents, RFIs, submittals, and
daily site logs. The permission-filtered navigation therefore exposes the
Projects workspace and can expose the Documents projection. The application
also loads the full project workspace when `projects.read` is present, even
though Payroll needs only project identity/status for payroll context and
allocation labels.

The current direct-route guard is permission-based and should remain the route
boundary. Removing the broad Payroll permissions must therefore be paired with
a narrow server-authorized reference path so payroll processing does not lose
legitimate project context.

The current client PDF is six pages, but its source depends on prior screenshot
files that are not present in a clean checkout and it documents only the
independent-custody target. Current-release role screenshots are still absent.

The local Docker Linux engine is unavailable in the implementation environment.
That is a runtime-evidence blocker, not a reason to weaken the database design or
publish a certification claim. The guarded QA path remains the permitted route
for exact migration promotion and synthetic runtime evidence if its exact
target and credentials are available.

## Authorization design

### Narrow Payroll project reference capability

Add the operational permission `payroll.project_reference.read` to the existing
company permission catalog. It is a selectable operational permission for
company-defined roles. The built-in `COMPANY_ADMIN` and `PAYROLL` templates
receive it explicitly in the new forward migration.

Remove these permissions from the built-in `PAYROLL` role in the same forward
migration:

- `dashboard.read`
- `projects.read`
- `engineering.documents.read`
- `engineering.rfis.read`
- `engineering.submittals.read`
- `engineering.sitelogs.read`

Keep Payroll's payroll, workforce, payroll-report, aggregate, and project-cost
permissions unchanged unless focused runtime evidence proves another concrete
mismatch. The built-in roles remain protected starter templates; this migration
changes the verified default profile without allowing ordinary users to edit the
templates.

### Server reference boundary

Add an authenticated RPC named `list_payroll_project_references(p_company_id
uuid)` returning only:

- project id;
- project code;
- project name;
- lifecycle status;
- archive timestamp.

The function must be `SECURITY DEFINER` only because it reads a restricted
projection from the project table without granting Payroll broad direct table
access. Its body must explicitly require an authenticated actor, require the
requested company to equal the configured deployment company, and require
`private.has_company_permission(p_company_id,
'payroll.project_reference.read')`. It must query only rows whose
`company_id` equals the requested deployment company and return no financial,
client, address, notes, or other project columns.

Revoke execution from `public` and `anon`; grant execution only to
`authenticated`. The RPC is the only new reference path. Do not broaden the
`projects` table RLS policy to make the permission work, because that would let
an ordinary browser client select the full project row.

### Application data flow

Add a small `PayrollProjectReference` structural type containing only the RPC
fields. Add a loader in the project persistence boundary that calls the RPC and
maps its response without defaulting absent sensitive fields into a full
`Project` record.

Keep full `projects` state for users with `projects.read`. Keep Payroll
references in a separate state/prop used only by payroll screens and payroll
source-freshness/calculation paths. Payroll components may display project code,
name, status, and archived state, but must not receive or request the full
project workspace merely to populate a selector.

The existing local/demo mode may continue to use its local full project data.
Configured Supabase mode must use the narrow RPC for a user who has the Payroll
reference permission but not `projects.read`.

The existing `canAccessAppTab`, navigation model, App route guard, server
authorization helpers, RLS policies, and Assistant permission checks remain
permission-driven. No condition may inspect `roleKey`, display role names, or
special-case the `PAYROLL` string.

### Expected representative navigation

The final matrix is derived from the migrated permission catalog and captured
runtime, not copied from old documentation:

- Company Admin: all permitted company modules and Settings/access management.
- Finance: its finance and granted operational modules, without payroll detail,
  workforce administration, or company access administration.
- Payroll: Payroll and the separate payroll Reports view; project references are
  supporting data inside Payroll, not the Projects workspace or general
  Documents workspace.
- Viewer: only modules authorized by its read permissions; no ordinary manage,
  approve, settings, or member-administration controls.
- Custom restricted role: only modules corresponding to its selected explicit
  permissions, regardless of its display name.

Finance and Viewer permissions should not be changed unless the audit or
runtime evidence identifies a concrete unrelated-module leak. Their final
screenshots and tests must reflect the actual migrated grants.

## Test and runtime evidence design

### Automated behavior tests

Add tests for the final permission arrays and navigation model. They must assert
visible module ids, default landing behavior, and the absence of unrelated
modules for Company Admin, Finance, Payroll, Viewer, and a custom restricted
permission set. Include a custom role with the same permissions under a
different display name to prove role names are not authorization inputs.

Add direct-route tests that enter representative unauthorized paths and verify
the permission guard resolves them to an available destination or an access
denied state. Add source/contract assertions that the Payroll reference loader
uses the narrow RPC and that no full project loader is used for the restricted
profile.

Retain and extend database tests for custom-role creation, edit, assignment,
archive, protected-permission denial, cross-company denial, stale-role denial,
member override precedence, and audit history. Add database assertions for the
Payroll reference RPC, including authenticated permission denial, wrong-company
denial, and projection shape. Preserve clean replay, pgTAP, upgrade, RLS/RPC,
and relevant concurrency validation when Docker or the guarded QA path is
available.

### Authenticated screenshot harness

Create a repository-owned Playwright harness under `scripts/client-security/`
that:

1. accepts only an explicitly identified QA/local-QA base URL;
2. verifies non-production environment, deployment id, application SHA, and
   migration level from the non-secret health contract when configured;
3. authenticates separate synthetic credentials supplied only through process
   environment or protected local files;
4. waits for authenticated company access and the ready workspace state;
5. captures a consistent desktop viewport with the sidebar visible for Company
   Admin, Finance, Payroll, Viewer, and one custom restricted role;
6. captures the Company Access/custom-role editor for Company Admin;
7. navigates a representative forbidden deep link as each restricted profile
   and records the resulting path/access state;
8. asserts expected and forbidden visible module labels from the actual DOM;
9. records screenshot paths, exact release identity, role label, permission
   expectation, and redacted telemetry in a machine-readable manifest; and
10. refuses production-looking hosts, privileged browser keys, missing identity,
    and missing role credentials.

The harness must never modify DOM visibility, crop unwanted navigation, or edit
image pixels. Screenshots are evidence only when the authenticated account,
permission state, release identity, QA banner, and visible navigation assertions
all pass. If credentials, deployment, migration, or browser runtime is missing,
the harness records a blocked result and the PDF keeps the dependent claims
qualified.

The synthetic role setup is an operator/QA prerequisite, not a production
operation. It may create or assign synthetic accounts in the isolated QA target
through the existing Company Access workflow or an approved QA setup path. It
must not copy production users, records, documents, provider content, or
secrets.

## Client custody and support content

The checklist and client source document will present two legitimate models.

### Option A - Managed Support Access

The client keeps ownership of production and gives a named Hydroqualisense
support account the minimum provider access reasonably required for approved
maintenance under an NDA. The document will require individual accounts,
least privilege, MFA where supported, client-controlled granting and revocation,
available access logging, and no routine browsing of confidential records merely
because access exists. It will not claim provider roles are more fine-grained
than they actually are.

Pros: faster troubleshooting, easier approved migration/configuration work,
direct environment verification, less technical work for the client, and faster
recovery from production-only issues.

Cons: the operator retains some production access, the arrangement requires
trust/NDA/account controls/monitoring, granted permissions may reach client data,
and access must be reviewed and revoked when no longer needed.

### Option B - Independent Client Control

The client owns and controls production Supabase, Render, Auth, Storage, and
provider accounts and removes standing Hydroqualisense developer/operator
production access after handoff. Hydroqualisense can still develop and test
source-code fixes and deliver reviewed releases, but cannot directly inspect or
change the production environment unless the client grants access.

Pros: no standing developer data-plane access, strong separation of accounts,
complete client control over production access, and access only when the client
chooses to grant it.

Cons: some production problems take longer to diagnose, the client may perform
operational steps, production migration/configuration work may require client
execution or temporary access, and environment-specific diagnosis may wait for
evidence or temporary access.

The document must explicitly state that source-code fixes can be developed and
tested without standing production access. QA/synthetic environments are the
normal reproduction path. Direct production diagnosis, some production
migrations/configuration work, and environment-specific verification may require
client cooperation or temporary access. It must not say that no fixes or
updates are possible without database access.

### Temporary incident access

Both models use the same bounded process:

`client approval -> named limited account/access -> specific incident -> activity recorded where practical -> access removed`

No password sharing is required or documented.

## Client document and evidence package

Rewrite the client source into seven short pages unless final screenshot density
fits cleanly in six:

1. Security at a glance.
2. Who can access what, with starter roles and custom-role explanation.
3. Real role examples using current authenticated synthetic-QA screenshots.
4. How client data is isolated and protected.
5. Choose your support/access model, including incident access and maintenance
   versus production diagnosis.
6. Integrations and secrets, with SMS and provider states kept truthful.
7. Shared responsibility and verification, including the client checklist.

Use short paragraphs, business wording, small tables, screenshot captions, and
no migration names, RPC names, raw permission keys, test commands, Git SHAs,
agent terminology, CI mechanics, unsupported certifications, or vendor claims.
The role page will state that navigation follows permissions but that protected
routes and operations are checked again by the application/server/database in
plain language.

Track every screenshot used by the source under
`artifacts/client-security/screenshots/` so a clean checkout can regenerate the
PDF. Retain no secret, PII, production identifier, confidential record,
provider content, or real client document in the evidence package.

Update `EVIDENCE.md` with one row per material claim and screenshot, using the
categories `SOURCE`, `DB`, `QA_RUNTIME`, `CI_RELEASE`, `VENDOR_CONFIG`, and
`HANDOFF_POLICY`. A runtime-dependent role/custom-access claim remains qualified
until its exact release and synthetic runtime evidence passes. Update the
handoff checklist with a recorded custody-model field whose allowed values are
`MANAGED_SUPPORT_ACCESS` and `INDEPENDENT_CLIENT_CONTROL`; this is an operational
choice, not an application setting.

The PDF builder remains deterministic and source-driven. It must fail when the
source page count or a referenced screenshot is missing. Generate the final PDF,
render every page with Poppler, inspect every page visually, and record page
count, screenshots, claim qualifications, and no-secret/no-production checks in
`PDF_CHECKS.md`.

## Validation and stop conditions

Validation order is:

1. failing focused tests, then minimal implementation and passing focused tests;
2. focused navigation/RBAC/security tests;
3. `npm.cmd run test:affected:agent`;
4. lint and production build for executable/UI changes;
5. exact-release authenticated browser QA and screenshot inspection;
6. strict local or guarded-QA database replay, pgTAP, upgrade, RLS/RPC, and
   concurrency evidence when the environment allows it;
7. PDF generation, page rendering, and visual inspection;
8. exact final diff and evidence-to-claim review.

If Docker and guarded QA are both unavailable, leave database and runtime
claims explicitly blocked, keep screenshots uncaptured rather than fabricated,
and retain the PDF as a qualified implementation draft. Do not touch
production, start another product phase, self-merge, or claim security
certification from static tests, a demo workspace, or an older release.
