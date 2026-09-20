# HydroQualiSense Documentation Map

This file is the navigation index for repository documentation. It does not override live source code or repository policy.

## Precedence

When documents disagree, use this order:

1. live repository state and current source/migrations/tests;
2. `AGENTS.md` and applicable repository policy;
3. `HYDROQUALISENSE_ACTIVE_ROADMAP.md`;
4. `HYDROQUALISENSE_CURRENT_HANDOFF.md`;
5. the active phase/design contract;
6. dated implementation plans and historical records.

Historical Engoryx-named files and old goal-state documents are context only unless a current source-of-truth document explicitly links to them.

## Start here

- `../AGENTS.md` — repository rules, validation policy, merge workflow, safety boundaries.
- `AGENT_EXECUTION_EFFICIENCY.md` — focused implementation/testing workflow.
- `HYDROQUALISENSE_ACTIVE_ROADMAP.md` — current sequencing and approved/deferred work.
- `HYDROQUALISENSE_CURRENT_HANDOFF.md` — current takeover snapshot and important evidence.
- `HYDROQUALISENSE_PRODUCT_DIRECTION.md` — durable product direction.
- `architecture/OVERVIEW.md` — concise architecture map.
- `architecture/APP_WORKFLOW_MAP.md` — generated detailed workflow map.
- `repository-intelligence/README.md` — canonical Repository Intelligence index, unified graph, AI-context, and developer-explorer architecture.
- `REPOSITORY_ARCHITECTURE_TRIAGE.md` — closed responsibility/context-budget decisions for the current professionalization boundary.
- `REPOSITORY_EVIDENCE_POLICY.md` — tracked versus transient evidence rules.

## Current structural work

- `repository-intelligence/README.md` — Repository Intelligence RI-1 source index, RI-2 graph/query API, RI-3 bounded context integration, and later explorer roadmap.
- `superpowers/specs/2026-09-17-repository-architecture-professionalization-design.md` — completed Repository & Architecture Professionalization design and closure record.
- `superpowers/plans/2026-09-18-subcontract-register-wave-b.md` — completed Slice 5 Wave B implementation plan; retained as execution history.
- `superpowers/plans/2026-09-18-projects-register-wave-c.md` — completed Slice 5 Wave C implementation plan; retained as execution history.

## Active / incomplete product contracts

- `HYDROQUALISENSE_MESSAGING_DOCUMENTS_WAVE4D.md` — Email/SMS + Documents completion contract.
- `superpowers/specs/2026-09-16-email-messaging-session-reliability-design.md` — Email/SMS reliability design.
- `superpowers/plans/2026-09-16-email-messaging-session-reliability-implementation-plan.md` — implementation plan for that isolated workstream.
- `HYDROQUALISENSE_UNIFIED_DOCUMENT_CENTER.md` — Wide Documents contract; remaining managed slices are deferred.

## Active Excel-native / worksheet UX designs

- `superpowers/specs/2026-09-18-excel-native-operations-ux-design.md` — workbook interchange, review/Apply, concurrency, protected-field, and domain-authority contract. Foundations are implemented through Procurement, Projects/Cost Codes, and bounded Expenses/Supplier Payables.
- `superpowers/specs/2026-09-20-selective-workbook-editing-ux-direction.md` — later approved in-app interaction correction: **browse visually, edit like a spreadsheet, execute sensitive workflows deliberately**. It defines card-first Projects, worksheet-style Project editing, source-on-top supplier invoice review, the shared WorksheetEditor direction, selective domain candidates, and the custom-field boundary.

The next implementation work is the shared worksheet editing foundation, then Projects and supplier-invoice review redesign, before later Finance/domain rollouts. Real `.xlsx` round trips remain required where supported: export -> external edit -> upload -> validate/compare -> human review -> authoritative apply.

The compatibility stub `HYDROQUALISENSE_EXCEL_NATIVE_OPERATIONS_UX.md` remains only so older links continue to resolve.

## Standing UX and domain contracts

- `HYDROQUALISENSE_UI_UX_ROUND2_SIMPLIFICATION.md` — standing workflow-first UX baseline.
- `HYDROQUALISENSE_DOCUMENT_TEMPLATES_WAVE4A.md` / `HYDROQUALISENSE_DOCUMENT_TEMPLATES_WAVE4B.md` — template and export foundations.
- `HYDROQUALISENSE_DOCUMENT_DELIVERY_WAVE4C.md` — issued-document delivery/history foundation.
- `HYDROQUALISENSE_SUPPLIER_INVOICE_MONETARY_MODEL.md` — supplier invoice monetary semantics.
- `CASH_BANKING.md` — Cash & Banking domain notes.
- `payroll-workforce-hardening.md` — payroll/workforce hardening contract.
- `company-tenancy-rbac-database.md` and `company-tenancy-rpc-contract.md` — tenancy/RBAC database contracts.

## Security, deployment, and release operations

- `HYDROQUALISENSE_CLIENT_SECURITY_ASSURANCE.md` — client security assurance contract.
- `HYDROQUALISENSE_CLIENT_SECURITY_HANDOFF_CHECKLIST.md` — handoff checklist.
- `HYDROQUALISENSE_CLIENT_DEPLOYMENT_STRATEGY.md` — one-client-per-deployment strategy.
- `HYDROQUALISENSE_DEPLOYMENT_RUNBOOK.md` — deployment/release operations.
- `CHATGPT_MIGRATION_OPERATOR_POLICY.md` — connected migration operator policy.
- `GOOGLE_SIGNIN_BREVO_SETUP.md` — identity-only Google Sign-In and Brevo configuration.
- `SINGLE_COMPANY_DEPLOYMENT.md` — deployment tenancy summary.

## Design specs and implementation plans

- `superpowers/specs/` contains design/architecture contracts.
- `superpowers/plans/` contains dated execution plans.
- Plans describe how a specific run was intended to execute; they do not outrank the live roadmap, handoff, or current source.

## Client-facing material

- `client-facing/` contains client-facing documentation. Keep internal agent/CI/PR details out of these documents.

## Legacy and historical material

Files beginning with `ENGORYX_`, older `WAVE*_GOAL_STATE.md` files, and similarly dated historical documents remain in place to avoid breaking old references. They are not current product sequencing authority. Do not use them to override HydroQualiSense-named source-of-truth documents.

Historical files remain in place unless a separately reviewed reference-impact change moves them. Do not mass-move them casually.
