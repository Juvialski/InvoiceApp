# HydroQualiSense Deployment and Release Runbook

Status: **ACTIVE — bounded operator workflow for isolated client deployments**

This runbook supports the productization phase without introducing a shared client-tenant control plane.

## Operating model

HydroQualiSense uses one maintained repository and one isolated operational deployment per client:

`one repository -> one Render service + one Supabase project/database/Auth/Storage boundary -> one client company`

The application keeps `company_id`, membership/RBAC, RLS, company-bound integrity, Storage paths, and audit boundaries as defense in depth. The public requirements form is not an operational workspace and cannot create a company, user, deployment, credential, or secret.

## Inventory file

Copy `deployment/inventory.template.json` into an operator-controlled inventory location that is private to the deployment team. Validate it before use:

```text
npm.cmd run deployment:validate -- --file path/to/deployment-inventory.json
```

The inventory records identifiers and verification state only:

- client/deployment identifier and client name;
- production URL, Render service reference, and Supabase project reference;
- deployed repository SHA, app version, and migration level;
- explicitly enabled modules and bounded scalar configuration values;
- backup state and last successful/verified timestamps;
- expected release SHA/migration level, configuration compatibility, migration and backup prerequisites, and rollback expectation;
- the last health verification result and unresolved operator notes.

Do not put passwords, tokens, API keys, provider credentials, connection strings, private keys, or secret values in the inventory. Keep those in the isolated Render/Supabase/provider secret stores. The validator rejects secret-shaped field names as a second line of defense.

## Approved client lifecycle

1. Qualify the client requirements through the public funnel or a controlled operator conversation.
2. Approve the modules and resolve client-specific business rules that must not be inferred, including unresolved tax, FX, withholding, and accounting-period decisions.
3. Create the dedicated Supabase project/database/Auth/Storage boundary.
4. Create the dedicated Render service and production URL.
5. Configure environment variables and provider secrets in the isolated deployment. Never commit their values.
6. Apply the approved forward migration set from the shared repository.
7. Run the guarded company and initial admin bootstrap through the authorized operator process.
8. Configure private Storage, backup registration, approved integrations, and least-privilege access.
9. Run smoke, authentication/authorization, database/RLS, Storage, and backup verification checks.
10. Record the deployed repository SHA, application version, migration level, enabled configuration, and backup state in the inventory.
11. Confirm the release compatibility and rollback/recovery expectation before handover.
12. Hand over only authorized client access and retain the operator verification record.

The public form is a qualification input only. It never performs steps 3–8 and never receives production credentials.

## Release promotion

Promote a reviewed repository SHA deliberately, one isolated deployment at a time when client prerequisites differ. Before a migration-bearing release, the operator must confirm:

- a verified backup or an explicitly documented reason the release is blocked;
- the migration set is compatible with the client’s current state;
- the client-specific configuration is approved and compatible;
- the deployment’s health, authentication/authorization, database, and backup checks are ready to run.

Set these non-secret runtime values in the isolated Render environment so `/api/health` can report what is actually running. Leave them unset rather than inventing a value when the release state is unknown:

```text
HYDROQUALISENSE_DEPLOYMENT_ID=
HYDROQUALISENSE_APP_VERSION=
HYDROQUALISENSE_MIGRATION_LEVEL=
HYDROQUALISENSE_CONFIGURATION_VERSION=
```

Render’s `RENDER_GIT_COMMIT` is also accepted when it is a full 40-character commit SHA. The health endpoint reports only release metadata and never returns secrets or provider configuration values.

Verify a deployed entry against its recorded expectation:

```text
npm.cmd run deployment:verify -- --file path/to/deployment-inventory.json --deployment <deployment-id>
```

Use `--record` only from the operator-controlled inventory workspace after reviewing the output. A result is `PASS` only when the health endpoint is successful and the manifest’s expected SHA, migration level, and configuration version are all reported and match. `UNKNOWN` means the deployment is healthy but one or more identity/version values are not explicitly recorded; it is not a release certification. `FAIL` requires investigation.

## Rollback and recovery

Application builds may be returned to a previous compatible build when the database state supports it. Database migrations remain forward-only: do not claim that restoring an older application build reverses an irreversible migration. If a migration has already been applied, use the documented forward recovery/correction path, restore drill, or isolated recovery target appropriate to the incident. Record the result and unresolved limitations in the inventory.

This phase does not provision Render or Supabase through the public website and does not create a provider secret store. External provisioning, backup/restore drills, fleet promotion, and rollback drills remain explicit operator actions and must be evidenced separately for each client deployment.
