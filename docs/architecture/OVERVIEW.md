# HydroQualiSense Architecture Overview

This document describes the current architectural boundaries of HydroQualiSense. It is a repository orientation guide, not a replacement for domain-specific design records, the active roadmap, or the generated Workflow Map.

## Deployment boundary

HydroQualiSense uses a **one deployment -> one client company** model. Each deployment has its own application environment, Supabase project/database/Storage, users, and provider credentials. `company_id`, membership checks, RLS, grants, company-bound foreign keys, and audited database functions remain defense-in-depth controls inside that isolated deployment.

The browser does not select a tenant. Company identity comes from the deployment/database authority, not a URL parameter, request header, local storage value, or Assistant argument.

## Runtime flow

`Browser/UI -> route components -> domain controllers/libs -> authenticated server APIs -> Supabase/Postgres/Storage`

### Client

- React 19 + TypeScript.
- Vite development/build pipeline.
- Route and navigation policy are centralized in the existing router/navigation models.
- UI primitives use Astryx with the HydroQualiSense theme plus application-specific components.
- Client state may stage edits and workflows, but protected business authority remains server/database controlled.

### Application server

- Express/Node entrypoint in `server.ts`, bundled to `dist/server.cjs` with esbuild for production.
- Server routes authenticate requests, resolve company/user context, enforce server-side permissions, call provider integrations, and coordinate protected persistence workflows.
- Provider secrets and privileged Supabase credentials are server-only.

### Data platform

- Supabase Auth supplies identity.
- PostgreSQL stores authoritative business records and history.
- RLS, grants, constraints, triggers, and checked database functions enforce data boundaries and lifecycle rules.
- Supabase Storage holds company-scoped source documents and generated/managed files where applicable.

## Source-of-truth boundaries

- Supplier invoice/source evidence is not automatically the same record as Expense/payable authority or settlement evidence.
- Client billing and client collections are distinct lifecycle events.
- Inventory balances are derived from authoritative stock movements or an equivalently auditable movement model.
- Payroll detail remains protected; project labor reporting may expose only authorized aggregates where the product contract requires that separation.
- Issued/finalized document history, source ownership, revisions, and generated-output provenance remain immutable/auditable according to their domain contracts.
- Authorization is permission-based inside a one-company deployment boundary; UI visibility alone is never treated as security.
- Consequential AI-assisted actions require verified context, authorization, and explicit human confirmation before execution.

## Financial and historical invariants

- Unknown monetary values remain unknown; they are never normalized to zero merely for convenience.
- Currency is explicit. Mixed currencies are not aggregated without an explicit supported conversion contract.
- Source invoice, recognized cost/expense, payment/settlement evidence, client billing, and client collection remain semantically distinct unless an approved domain contract says otherwise.
- A single economic event must not be recognized twice through two UI paths.
- Finalized financial, payroll, procurement, billing, collection, and settlement history is not silently rewritten.
- Document source evidence, ownership, revisions, generated-output provenance, and audit history remain traceable and company-bound.

## Authorization model

Application roles and permissions are enforced at multiple layers. Protected server routes and database operations independently validate the authenticated user, deployment company membership, required permission, and company-bound target rows.

Security-definer/RPC behavior must not trust client-supplied owner/company identifiers without authoritative validation. Changes to RLS, grants, migrations, RPCs, triggers, constraints, or concurrency-sensitive financial lifecycle behavior require real PostgreSQL/Supabase runtime validation.

## AI and provider boundaries

AI-assisted features are constrained by verified application context and existing authorization. Consequential writes use explicit review/confirmation rather than allowing the model to bypass application workflows.

Outbound providers are integrated server-side. Provider acceptance is not automatically equivalent to final delivery, payment, or other downstream business completion. Provider credentials are deployment-owned secrets and must never be exposed to client code.

## Repository intelligence developer tooling

HydroQualiSense is adding a developer-only Repository Intelligence layer that extends the existing curated Workflow Map with an incremental source index, provenance-preserving unified graph, bounded AI context engine, and optional interactive explorer.

The existing `scripts/workflow-map/graph.ts`, generated `APP_WORKFLOW_MAP.md`, machine-readable `workflow-map.json`, consistency checks, and bounded `agent:context` workflow remain foundations. Repository Intelligence is additive: source-derived and inferred relationships do not override curated financial, security, permission, history, or source-of-truth rules.

Repository Intelligence is not part of the customer application runtime or navigation. Its canonical architecture is `docs/repository-intelligence/README.md`.
## Testing and change discipline

Repository changes follow a focused -> affected validation ladder. New/edited tests run first, then relevant domain tests, `test:affected:agent`, and lint/build/browser/database checks when the diff makes them applicable. Exact-head CI evidence is required before merge.

Database-affecting changes require local Supabase/PostgreSQL execution when applicable; static SQL/string inspection is not equivalent to migration replay, pgTAP, RLS/RPC, upgrade-path, or concurrency validation.

## More detailed sources

- `AGENTS.md` — repository operating and safety rules.
- `docs/AGENT_EXECUTION_EFFICIENCY.md` — implementation and validation workflow.
- `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md` — active product/engineering sequence.
- `docs/HYDROQUALISENSE_CURRENT_HANDOFF.md` — latest completed state and next work.
- `docs/architecture/APP_WORKFLOW_MAP.md` — generated route/workflow structure.
- `docs/repository-intelligence/README.md` — Repository Intelligence architecture, context-engine design, explorer UX, and implementation roadmap.
- Domain-specific design/history documents — deeper contracts for the relevant subsystem.
