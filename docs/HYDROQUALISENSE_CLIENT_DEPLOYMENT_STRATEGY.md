# HydroQualiSense Client Deployment Strategy

Status: **ACTIVE — post-R5 operating direction**  
Repository: `Juvialski/InvoiceApp`  
Updated: **2026-09-06**

This document defines how one HydroQualiSense codebase can serve multiple client companies without turning a deployed application into a shared multi-company tenant switcher.

## Core deployment model

HydroQualiSense uses:

`one source repository -> many isolated client deployments`

Each client deployment remains:

`one deployment -> one client company -> active membership/RBAC -> permitted workflows`

For each client company, provision at minimum:

- one Render service/application deployment;
- one dedicated Supabase project/database;
- isolated Supabase Auth users;
- isolated Storage and backup configuration;
- client-specific environment variables and secrets;
- client-specific domain/subdomain and branding/configuration where approved;
- independent operational monitoring and recovery boundaries.

There is no in-app switch between unrelated client companies. `company_id`, company-scoped RLS, company-bound foreign keys, permission checks, audit boundaries and company-prefixed storage keys remain mandatory defense in depth even when a database currently contains one active company.

## Shared codebase, controlled configuration

The repository is the product codebase. Client differences should be configuration or bounded feature policy, not long-lived source forks unless a genuinely incompatible client requirement is approved.

Prefer:

- one maintained `main` branch;
- versioned migrations that replay safely in every client database;
- environment-driven deployment identity;
- explicit feature/config contracts;
- reusable provisioning scripts/checklists;
- release notes and migration compatibility across the client fleet.

Avoid copying the repository into independently drifting client implementations.

## Public landing and client-requirements funnel

A future public HydroQualiSense landing surface may explain capabilities and collect prospective-client requirements without exposing an operational client deployment.

The public funnel should remain separate from authenticated operational data. It may collect bounded business requirements such as:

- company and contact information;
- operational modules of interest;
- approximate workforce/project scale;
- current pain points and integration needs;
- desired deployment timeline;
- optional request for demonstration/contact.

Do not collect financial source documents, employee records, biometrics, credentials or other operationally sensitive data through a general marketing intake form unless a dedicated secure workflow is explicitly designed.

A prospective-client submission is not permission to provision production automatically. Provisioning remains an explicit operator-controlled action.

## Client provisioning lifecycle

Target lifecycle:

1. qualify client requirements;
2. decide enabled modules and unresolved business rules;
3. create dedicated Supabase project;
4. create dedicated Render service/deployment;
5. generate client environment configuration and secrets;
6. apply the exact approved migration set from the shared repository;
7. create the initial authorized company/admin records through guarded bootstrap tooling;
8. configure storage/backup/provider settings;
9. connect approved external services such as Gmail only for that client deployment;
10. run deployment smoke, authorization, DB and backup checks;
11. record deployed repository SHA and database migration state;
12. hand over client access.

Provisioning automation may reduce manual work, but it must not silently create production companies, privileged users or secrets.

## Fleet/version management

As the number of client deployments grows, maintain a small operator-facing deployment inventory recording at least:

- client/deployment identifier;
- production URL;
- Render service identifier/reference;
- Supabase project reference;
- deployed repository SHA/version;
- migration level;
- backup status;
- enabled bounded configuration/features;
- last successful health/release verification;
- operator notes for unresolved client-specific rules.

The inventory must not contain plaintext secrets.

A release should be promoted deliberately across client deployments. Do not assume all clients can be upgraded simultaneously when a migration or feature depends on client-specific decisions.

## Role and permission model

Authorization remains permission-based rather than role-name-based.

Client deployments may expose practical role templates such as administrator, finance, procurement, project/site operations, payroll/workforce, engineering and read-only/reviewer roles, but templates only map to explicit permissions.

Rules:

- UI, server/service, RPC and RLS decisions resolve the same effective permissions;
- no client receives an implicit platform-wide operator inside the application;
- initial admin/bootstrap authority is explicit and auditable;
- least privilege is the default for invitations and later role changes;
- sensitive workflows such as payroll, financial settlement, backups, document sending and future biometrics retain dedicated permissions rather than broad generic access.

## Storage and backup lifecycle

R5 establishes stronger source-document, dedupe, backup registration and restore-drill contracts. Future scaling should preserve these principles:

- authoritative source files retain integrity hashes and provenance;
- duplicate prevention is DB-backed where identity must survive concurrent clients/retries;
- storage paths remain company-prefixed and provider-neutral;
- backup expectation is durable and observable rather than best-effort silent state;
- restore drills use isolated server-generated targets;
- large AI/email payloads are bounded before model/provider calls;
- retention/archive/deletion rules must distinguish source evidence, issued/auditable history and disposable generated/cache artifacts.

Before introducing automatic lifecycle deletion, explicitly classify which objects are legally/operationally auditable and which are reproducible. Never delete source evidence merely to reduce storage usage.

For cost optimization, prefer dedupe, bounded previews, compression where lossless/appropriate, archive tiers/provider lifecycle rules for eligible objects, and monitoring of database/storage growth before destructive retention.

## Post-R5 phase order

Unless explicitly reprioritized, the product sequence after R5 is:

1. **Warehouse Inventory & Project Allocation**
2. **Public landing/client requirements + repeatable deployment/provisioning tooling** — may run in parallel only where it does not alter operational financial/inventory contracts
3. **Worker Registration foundation**
4. **Attendance state machine and site/device registration**
5. **Face-recognition attendance** only after explicit privacy/consent, biometric retention/deletion, liveness, confidence/fallback and device-security design
6. additional client-confirmed operational requirements
7. **final pre-production security/data-integrity certification** before broad production rollout

The exact numbering can be adjusted as requirements mature; data and security dependencies are more important than labels.

## Parallel execution rules

Parallel development is allowed only for independent contracts.

Examples that can often proceed independently:

- public marketing/requirements UI vs warehouse DB design;
- deployment inventory/provisioning tooling vs operational UI polish;
- bounded test/documentation work vs an isolated UI surface.

Do not parallelize competing ownership of:

- shared financial semantics;
- Vendor/project/worker canonical identity;
- migration/RLS/RPC contracts;
- inventory movement truth;
- attendance identity/state contracts;
- central App/router/provider integration.

The lead implementation agent owns shared contracts and final integrated validation. During the current pre-demo sprint, follow live `AGENTS.md` for the temporary Luna concurrency allowance.

## Warehouse dependency

Warehouse Inventory must establish authoritative movement/allocation semantics before broader materials automation.

Required invariant:

> Current stock must be explainable from authoritative movements or an equally rigorous source model.

Do not derive stock by destructively editing a balance without movement history. Do not decide valuation, reservation, barcode/QR, lot/serial or purchase-receipt automation until client rules are explicit.

## Worker registration and attendance dependency

Worker registration should precede biometric attendance.

Recommended sequence:

`registration QR -> pending identity submission -> supervisor approval -> canonical Worker/project assignment -> registered site/device -> attendance state machine -> biometric recognition layer`

Face recognition is an identity-assistance mechanism, not the source of worker truth. Uncertain matches must fail to confirmation/manual fallback rather than guess.

Before production biometric use define and test:

- consent and access policy;
- enrollment/re-enrollment;
- biometric template vs raw-photo retention;
- deletion/retention requests;
- liveness/anti-spoof controls;
- confidence thresholds;
- PPE/lighting/camera failure behavior;
- supervisor-assisted fallback;
- device/site binding;
- offline queue and duplicate-punch protection;
- correction history;
- payroll integration boundaries.

## Final security certification phase

Before broad client production rollout, run a dedicated certification phase after major operational domains stabilize. It should not be treated as a substitute for security during implementation.

Minimum final review:

- final database catalog inventory for RLS, grants, SECURITY DEFINER functions, triggers, constraints, indexes and exposed RPCs;
- cross-company/permission attack tests even though deployments are single-company;
- privileged bootstrap/admin review;
- financial/history mutation and replay/idempotency tests;
- storage/backup/restore verification;
- secrets/configuration review;
- dependency audit and remediation decisions;
- production security headers and public endpoint review;
- external integration scopes/tokens;
- browser authorization/deep-link testing;
- deployment/fleet upgrade and rollback drill;
- biometric/privacy review when that domain exists.

No unresolved safety, security, data-integrity or migration blocker should be waived merely to accelerate a client launch.
