# ENGORYX Platform Architecture

Engoryx is an integrated engineering operations platform for architecture, engineering, and construction (AEC) firms, general contractors, specialty subcontractors, and project management organizations.

This document describes the current architectural invariants, project workspace model, roadmap boundaries, and code-organization direction.

---

## 1. Executive overview and design principles

Engoryx unifies financial operations, workforce management, document control, field engineering, and guarded AI assistance inside an isolated client deployment.

### Deployment topology

The production tenancy model is intentionally simple:

```text
Engoryx deployment
  -> one Supabase project/database/Storage
  -> one deployment_configuration.company_id
  -> one client company
  -> many company users
  -> membership role + permission set
  -> permitted Engoryx workflows
```

It is **not**:

```text
user -> choose arbitrary company -> switch tenant -> shared client database
```

Different client companies receive separate application deployments and separate Supabase projects. The source repository is reusable across deployments; company identity is provisioned in each target database rather than hardcoded into the application bundle.

Operational rows still retain `company_id`. Single-company application semantics do not remove database company boundaries: RLS, Storage prefixes, foreign-key relationship checks, import/export provenance, and audit history continue to use the configured deployment company as defense in depth.

### Architectural invariants

1. **Deployment isolation and RBAC**
   - A production deployment represents exactly one client company.
   - `public.deployment_configuration.company_id` is the deployment-company source of truth.
   - Users must have an ACTIVE membership in that company and the required permission for the operation.
   - Browser state, URLs, request headers, Assistant arguments, and stale local state cannot select another company.
   - PostgreSQL RLS/RPC authorization remains authoritative; frontend visibility is only a truthfulness/usability layer.

2. **Financial immutability and audit trail**
   - Verified invoice baselines, immutable extraction/review history, approved/paid payroll history, formal engineering history, and posted settlement evidence retain their domain-specific immutability rules.
   - Corrections use the existing additive/reversal mechanisms where required rather than rewriting historical meaning.
   - Original currencies remain separate; authoritative aggregates must not silently combine unrelated currencies.

3. **Guarded multi-step AI operations**
   - The Engoryx Assistant operates within the deployment company and current user's permissions.
   - Model/client-provided company IDs are untrusted and cannot override deployment context.
   - Natural-language mutations remain PREPARED/previewed and require explicit confirmation before execution.
   - Canonical route permissions, payroll-sensitive redaction, incomplete aggregate semantics, and deterministic server/database authorization remain authoritative.

4. **Demo isolation**
   - `/demo` and demo fixtures do not become authenticated production company state.
   - Demo reset and demo Assistant behavior remain sandboxed from production RPCs/Storage.

5. **Progressive web and field readiness**
   - The platform targets desktop workstations, field tablets, and mobile devices.
   - Offline or queued behavior is enabled only where a domain has an explicit reconciliation contract.

6. **Verification before automation**
   - Deterministic tests, migration replay, database invariants, browser evidence when available, and repository workflow contracts are authoritative engineering evidence.
   - Green CI is necessary but not sufficient for authorization/financial correctness; adversarial role and persisted-data review remains required for critical changes.

See also:

- [`company-tenancy-rbac-database.md`](company-tenancy-rbac-database.md)
- [`SINGLE_COMPANY_DEPLOYMENT.md`](SINGLE_COMPANY_DEPLOYMENT.md)
- [`ENGORYX_ENGINEERING_QA_AGENT_CONTEXT.md`](ENGORYX_ENGINEERING_QA_AGENT_CONTEXT.md)

---

## 2. Project workspace model

The Project remains the central organizing aggregate. Cost, labor, documents, field records, and engineering artifacts roll up to a project while retaining their own source-of-truth semantics.

```text
ENGORYX PROJECT

Financials                 Workforce                  Engineering
- Budget / baseline        - Worker assignments       - Documents / drawings
- Supplier invoices        - Attendance/work entries  - Revisions / redlines
- Direct expenses          - Overtime / leave         - RFIs
- Cash settlement evidence - Payroll allocations      - Technical submittals
                                                      - Daily Site Logs
```

### Core project aggregates

- **Overview and health**: permission-aware project KPIs. Combined financial position is withheld when the current role cannot read every contributing source.
- **Cost and cash accounting**: supplier invoice allocations, direct project expenses, and approved payroll labor are cost sources; Cash & Banking settlement is payment/disbursement evidence and must not create or duplicate project cost.
- **Crew and labor allocations**: workforce assignments, effective-dated compensation sources, payroll entries, and project labor allocation.
- **Document hub**: engineering documents, immutable revision lineage, and normalized annotations.
- **Engineering coordination**: RFIs, Technical Submittals, and Daily Site Logs with guarded lifecycle/history and project-scoped references.
- **Scheduling and milestones**: Phase 2 remains planned and is not implemented by the tenancy conversion.

---

## 3. Current status and roadmap

### Current status snapshot — 2026-08-28

- **Phase 0 core operations are established** across deployment-scoped company RBAC, Cash & Banking, Invoices, Projects, Expenses, Workforce & Payroll, Reports, and the guarded Engoryx Assistant.
- **Phase 1A is complete**: Engineering Documents & Blueprint Viewer with immutable revision lineage and normalized redlines.
- **Phase 1B is complete**: project-scoped RFIs and Technical Submittals with guarded lifecycle/history and immutable engineering-document revision references.
- **Phase 1C is complete**: Daily Site Logs with weather/site conditions, crew/headcount observations, equipment, delays, safety observations, and formal submission/finalization history.
- **Financial Settlement Integration is complete** across Cash & Banking, supplier invoices, payroll, supported expenses, and Assistant workflows. Settlement remains payment/disbursement evidence and does not replace project-cost or payroll-source semantics.
- **Single-company deployment architecture is the production tenancy direction**: one client company per deployment/Supabase project, while `company_id` remains a database defense boundary.
- **Next customer-facing product phase:** Phase 2 Project Scheduling & Gantt. The tenancy/hardening work does not implement it.
- **Engineering infrastructure:** QA-1 Structured Browser Evidence and WM-1 through WM-5 are repository infrastructure, not customer-facing roadmap phases.

### Customer-facing roadmap

| Phase | Module / domain | Status | Key deliverables |
| :--- | :--- | :--- | :--- |
| Phase 0 | Core Foundation | Established / Active | Engoryx branding, deployment-scoped RBAC, Cash & Banking, Invoices, Projects, Expenses, Payroll, Reports, Assistant. |
| Phase 1 | Engineering Documents & Field Workflows | Complete / Active | Phase 1A documents/drawings, Phase 1B RFIs/Submittals, Phase 1C Daily Site Logs. |
| Cross-domain settlement | Financial Settlement Integration | Complete | Settlement evidence, partial/split settlement, reversals, deep links, demo fixtures, Assistant confirmation flows. |
| Phase 2 | Project Scheduling & Gantt | Next / Planned | Interactive Gantt, dependencies, CPM, milestones, baseline-vs-actual schedule health. |
| Phase 3 | Field Capture & Barcode Asset Tagging | Planned | Equipment/tool/material scanning workflows. |
| Phase 4 | Spatial & Site Operations | Future | BIM/CAD/GIS/drone-oriented inspection and spatial workflows. |
| Phase 5 | Procurement & Material Requisitions | Future | BOQ/MRO/PO and vendor workflows. |
| Phase 6 | Subcontractor & Client Portal | Future | External collaboration and signing workflows. |
| Phase 7 | Advanced Document Intelligence | Future | Complex layout/document parsing. |
| Phase 8 | Field Communications | Future | Field notification/broadcast workflows. |

### Engineering infrastructure track

The canonical workflow graph remains `scripts/workflow-map/graph.ts`, with generated outputs under `docs/architecture/`. It maps routes, lifecycles, guards, permission relationships, high-risk invariants, and selected QA/test evidence.

The existing `company-rbac-is-authoritative` invariant remains valid: client visibility is never a substitute for database authorization. For the deployment model, read that invariant together with the single-company database/runtime contract documented here and in `company-tenancy-rbac-database.md`:

```text
deployment -> configured company -> active membership -> permission -> workflow
```

Generated workflow-map files must not be hand-edited. If the canonical graph is changed, regenerate and validate the outputs in the same change.

---

## 4. Application decomposition strategy

`App.tsx` remains a conflict-heavy integration surface and should continue moving toward focused route/controllers without changing protected business semantics merely for code-size goals.

Target ownership:

```text
src/
├── app/
│   ├── AppProviders.tsx
│   ├── AppShell.tsx
│   └── routes/
├── context/
│   └── CompanyAccessContext.tsx    # deployment company + membership/permission bootstrap
├── features/
│   ├── cash/
│   ├── invoices/
│   ├── projects/
│   ├── engineering/
│   ├── payroll/
│   ├── expenses/
│   ├── reports/
│   └── assistant/
└── lib/
    ├── companyContext.ts            # compatibility persistence context; deployment company semantics
    └── deploymentCompany.ts         # deployment identity validation/resolution
```

### Refactoring protocol

1. Extract route-specific state machines into route/controller boundaries.
2. Consolidate shared mutation handlers without weakening deterministic validation or rollback/error behavior.
3. Preserve canonical routing/deep links and permission checks.
4. Keep company/deployment identity outside domain components; repositories consume the already-resolved deployment context.
5. Do not replace explicit `company_id` persistence/RLS boundaries with frontend assumptions.

---

## 5. Security, company boundary, and audit invariants

### Database security model

- Operational/financial tables keep `company_id uuid not null references companies(id)` where the current domain contract uses company scoping.
- `deployment_configuration` must resolve exactly one deployment company at runtime.
- `has_company_permission(company_id, permission_key)` fails unless the target is the configured deployment company and the authenticated user has an active membership and permission.
- Company-prefixed Storage paths remain `companies/<company-id>/...` and are checked through company permissions.
- Invitation/member administration is deployment-scoped. `COMPANY_ADMIN` receives the explicit access-management permission; the last active Company Admin cannot be removed/demoted/suspended.
- A legacy internal-maintenance mechanism may remain for compatibility, but it is not a client role, is not shown in ordinary client navigation, and does not bypass business-data company permission checks.
- A fleet-wide operator console, if later required, belongs in a separate internal deployment/tool rather than in client tenant-switching UI.

### Authorization presentation

- Forbidden controls should be hidden/disabled before users hit inevitable RLS rejection.
- Unauthorized, load-error, deleted-record, and true-empty states are distinct.
- Deep links, browser back/forward, refresh, logout/login, and permission loss must re-run canonical authorization rather than trust stale UI state.

### Auditing and provenance

- Mutations record actor/time lineage appropriate to the domain.
- Staged imports retain source/provenance metadata required by their domain.
- Formal engineering records preserve lifecycle history.
- Financial settlement reversals preserve original settlement provenance and do not rewrite accounting cost.

### Assistant and server boundaries

- The Assistant receives the resolved deployment-company context and current permission set.
- Client/model company IDs are untrusted; browser API helpers and database authorization independently reject a different company.
- Unknown Assistant routes fail closed and route navigation uses canonical route permissions.
- Sensitive payroll detail and incomplete project-cost semantics follow the deterministic application authorization rules.
- Mutation confirmation remains mandatory where the current Assistant contract requires it.

### Development workflow-map provenance

- Workflow nodes/edges link back to live routes/files/tests where practical.
- Bounded context packets are advisory snapshots and never replace live source/CI inspection.
- Sensitive production financial, payroll, banking, document, employee, credential, or client-secret data must not be embedded in the workflow graph or generated context.
- Browser evidence must distinguish demo/test evidence from authenticated production behavior.
