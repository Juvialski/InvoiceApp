# Hydroqualisense

## What the platform does

HydroQualiSense is an operations platform for engineering and project-based companies. It combines project controls, supplier invoices and expenses, cash and banking, procurement, workforce/payroll, engineering records, reporting, document workflows, and controlled outbound communications in one company-scoped application.

The GitHub repository may remain named `InvoiceApp`; that repository name is not product branding.

## Architecture at a glance

The application uses a React 19 + TypeScript + Vite client, an Express/Node server, and Supabase for PostgreSQL, Auth, Storage, RLS, database functions, and persisted business history. Production bundles the client with Vite and the server with esbuild. Deployments run as a web service, with Render used by the current deployment workflow.

Each production deployment belongs to exactly one client company and uses that company's own Supabase project, environment configuration, users, storage, and provider credentials. Rows still carry `company_id` and database authorization remains company-bound as defense in depth.

See [Architecture Overview](docs/architecture/OVERVIEW.md) and the generated [Workflow Map](docs/architecture/APP_WORKFLOW_MAP.md) for more detail.

## Product domains

Current implemented domains include project workspaces and cost controls, supplier invoices and human verification, direct expenses, cash and banking reconciliation, procurement and purchase orders, client billing and collections, attendance/payroll and labor allocation, engineering documents and revisions, RFIs/submittals/site logs, reporting, document templates/exports, guarded AI assistance, and Email/SMS workflows.

## Engineering invariants

- One deployment serves one client company; browser state, URLs, Assistant arguments, or headers cannot switch tenant context.
- RBAC and database RLS both enforce authorization. Security-definer database functions must perform their own membership and permission checks.
- Financial values keep explicit meaning: unknown amounts stay unknown, currencies are not silently mixed, and one economic event must not be counted twice.
- Verified/finalized financial, payroll, procurement, billing, collection, settlement, document, and audit history is not silently rewritten.
- Document ownership, revisions, source evidence, and generated-output provenance remain traceable.
- Consequential AI-assisted actions remain permission-gated and require the product's explicit confirmation flow.

## Repository structure

- `src/` — React/Vite application, route components, domain controllers/libs, shared authorization, and UI foundations.
- `server.ts` — Express composition and authenticated server API routes.
- `supabase/` — forward-only PostgreSQL migrations and database tests for RLS, grants, lifecycle, and integrity contracts.
- `scripts/` — focused test selection, Workflow Map tooling, QA harnesses, and deployment/release checks.
- `docs/` — current product direction, architecture, deployment, provider setup, domain contracts, and the [Documentation Map](docs/README.md).
- `.github/workflows/` — protected application, database, browser-QA, and source-contract validation.

## Local development

Use Node/npm as the repository package workflow. `package-lock.json` is authoritative; Bun is not part of the supported workflow.

```bash
npm ci
npm run dev
```

On Windows PowerShell, use `npm.cmd` / `npx.cmd` when script shims are blocked.

Repository work must follow [AGENTS.md](AGENTS.md) and [Agent Execution Efficiency](docs/AGENT_EXECUTION_EFFICIENCY.md). Start from current green `main`, inspect the existing implementation before changing it, keep changes bounded, and use the focused-to-affected validation ladder rather than running the full suite by ritual.

Typical validation for application changes:

```bash
npm run test:affected:agent
npm run lint
npm run build
```

Database/security-contract changes additionally require real local Supabase validation when applicable: clean migration replay, pgTAP, migration/upgrade-path tests, and relevant runtime RLS/RPC/concurrency coverage. Static SQL checks are not a substitute for PostgreSQL execution.

## Validation and CI

Pull requests use repository workflows for application validation, database migration/invariant checks, Workflow Map consistency, and browser/visual QA where applicable. Evidence must belong to the exact PR head being reviewed; results from an older commit do not certify a newer one.

QA is the read/write certification environment. Production changes follow the deployment and migration policies in the repository and are not part of ordinary feature validation.

## Deployment model

HydroQualiSense is deployed one company per application/Supabase environment. See [Single-Company Deployment](docs/SINGLE_COMPANY_DEPLOYMENT.md), [Deployment Runbook](docs/HYDROQUALISENSE_DEPLOYMENT_RUNBOOK.md), and [Google Sign-In and Brevo Setup](docs/GOOGLE_SIGNIN_BREVO_SETUP.md).

Never commit provider secrets or expose server-only credentials through `VITE_` variables, client responses, logs, screenshots, or generated documents.

## Current project status

Repository & Architecture Professionalization is the active structural track. The repository front door, App/domain-controller decomposition, server/router decomposition, staged static-analysis hardening, and Procurement register presentation decomposition through Slice 5 Wave B are merged. Email/SMS reliability remains an independent workstream, and the approved Excel-Native Operations UX is a future major UX direction whose implementation is deliberately deferred until the shared architecture boundaries are ready.

For the current source-of-truth hierarchy and document locations, start with:

- [Documentation Map](docs/README.md)
- [Active Roadmap](docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md)
- [Current Handoff](docs/HYDROQUALISENSE_CURRENT_HANDOFF.md)
- [Product Direction](docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md)

Historical files with legacy names remain implementation/history references only where still applicable. They do not override `AGENTS.md`, the active roadmap, the current handoff, or live repository state.
