# Hydroqualisense Client Security Handoff Checklist

Status: **HANDOFF TEMPLATE - complete per isolated client deployment before making a final client assurance statement**
Date prepared: **2026-09-15**

This checklist separates controls implemented by Hydroqualisense source code from
account-custody and operational actions that only the client or authorized provider
operator can complete. An unchecked item is not evidence of completion. Do not put
passwords, tokens, keys, database URLs, private documents, or confidential client
rows in this file.

## Selected support and custody model

Record one choice for this isolated client deployment. This is an operational
handoff decision, not an application setting.

- [ ] `MANAGED_SUPPORT_ACCESS`
- [ ] `INDEPENDENT_CLIENT_CONTROL`

### Managed Support Access

The client keeps ownership of production and gives a named Hydroqualisense
support account the minimum access reasonably required for approved maintenance
and troubleshooting under an NDA. Use individual accounts, least privilege, MFA
where the provider supports it, client-controlled granting and revocation, and
available access logging. Do not treat access as permission for routine browsing
of confidential records.

Pros: faster troubleshooting, easier approved maintenance/configuration work,
direct environment verification, less technical work for the client, and faster
recovery from production-only issues.

Cons: the support operator retains some production access, the arrangement
requires trust and monitoring, granted permissions may reach client data, and
access must be reviewed and removed when no longer needed.

### Independent Client Control

The client owns and controls production Supabase, Render, Auth, Storage, Google,
AI, and SMS/provider accounts. Standing Hydroqualisense developer/operator
production access is removed after handoff. Hydroqualisense can still develop
and test source-code fixes and deliver reviewed updates, but direct production
inspection or changes require client cooperation or temporary access.

Pros: no standing developer data-plane access, strong account separation,
complete client control, and access only when the client decides it is needed.

Cons: some production issues take longer to diagnose, the client may perform
operational steps, some production changes may require client execution or
temporary access, and environment-specific diagnosis may wait for evidence.

Both models may use temporary incident access:

`client approval -> named limited account/access -> specific incident -> activity recorded where practical -> access removed`

Never share passwords. Source-code fixes and QA reproduction remain possible
without standing production database access; direct production diagnosis, some
production changes, and environment-specific verification may require client
cooperation.

## Technical controls to verify in the exact release

### Application, database, and access

- [ ] Exact application SHA and migration level are recorded for the isolated deployment.
- [ ] The deployment resolves one configured client company and keeps `company_id`, membership, permission, RLS/RPC, Storage-path, and audit boundaries enabled.
- [ ] The four built-in starter roles (`COMPANY_ADMIN`, `FINANCE`, `PAYROLL`, `VIEWER`) are present and protected from ordinary rename/archive operations.
- [ ] Company Admin can create, edit, duplicate, assign/reassign, and safely archive a company-scoped custom role through the authenticated access workflow.
- [ ] Custom-role permissions are resolved through the shared effective-permission authority used by UI, server, RPC, and RLS paths.
- [ ] Custom roles cannot grant `platform.*`, company access administration, company root/settings administration, or equivalent protected capabilities.
- [ ] A role from another company/deployment cannot be read, assigned, or used to affect effective permissions.
- [ ] An in-use custom role cannot be archived until members and pending authorizations are reassigned.
- [ ] Role creation, role changes, role archive, and member role changes appear in access audit history without secrets or unnecessary sensitive values.
- [ ] Member GRANT/DENY overrides remain deterministic, with DENY precedence and protected permissions excluded.

### Release and support boundaries

- [ ] QA validation uses synthetic accounts/data and the exact release SHA.
- [ ] Production migration promotion, production membership edits, and production data inspection are outside the normal support workflow.
- [ ] Server-only keys are absent from browser bundles, browser storage, logs, screenshots, health/status payloads, and generated documentation.
- [ ] The reviewed release path separates application deployment from migration promotion and records the deployment identity.
- [ ] The client can administer its own Company Admin membership and company-defined roles without a developer production membership.

## Handoff / operational controls

### Supabase client custody

- [ ] Client owns or controls the production Supabase organization/project.
- [ ] Developer/operator dashboard membership is removed or reduced to the client-approved non-data-plane role.
- [ ] Database password and service/admin keys are held only in the client-approved secret store; prior operator access is rotated or revoked where appropriate.
- [ ] Client controls Auth administration, user/session administration, and Storage administration.
- [ ] Client confirms backups, Storage-byte recoverability, and restore ownership using the provider's current evidence.

### Render and deployment custody

- [ ] Client owns or controls the production Render account/service and deployment settings.
- [ ] Production environment-variable and secret visibility is limited to client-approved operators.
- [ ] Deployment authority and reviewed source/release authority are documented separately from production data-plane access.

### Google, AI, email, and SMS/provider custody

- [ ] Client owns or controls the OAuth client and Gmail/provider account used for client data.
- [ ] AI credentials and encryption/master-key custody are assigned to the client-approved secret store.
- [ ] SMS provider/device accounts and sender identities are client-controlled where the client owns the messaging relationship.
- [ ] Gmail/SMS/provider readiness is recorded from live provider evidence; local/demo source evidence is not substituted for delivery certification.

### Developer support model

- [ ] Developer has no production company membership for routine support.
- [ ] No standing `platform_admin` or platform allowlist entry remains for routine support.
- [ ] Normal support reproduces issues with QA/synthetic data, applies reviewed source changes, validates them in QA, and releases through protected change control.
- [ ] If direct production investigation is unavoidable, the client records the reason, grants narrow/time-bounded access, records the activity, and revokes access afterward.

## Re-verification record

Record only safe metadata:

| Field | Value |
| --- | --- |
| Deployment identifier |  |
| Environment |  |
| Application SHA |  |
| Migration level |  |
| Verification date |  |
| Selected support/custody model | `MANAGED_SUPPORT_ACCESS` or `INDEPENDENT_CLIENT_CONTROL` |
| Client approver |  |
| Evidence location |  |

The application can enforce its own permission and release contracts. It cannot
revoke an external Supabase, Render, Google, AI, or SMS-provider account that it does
not own. The intended post-handoff statement is therefore:

> No standing developer/operator access to the client's confidential production data
> plane after completed handoff.

This does not claim that reviewed software releases cannot change production
behavior, and it does not replace client account-custody evidence.
