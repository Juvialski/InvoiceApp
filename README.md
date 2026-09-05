# HydroQualiSense — Company Operations Platform

HydroQualiSense is the client company's internal operations platform for project controls, finance, procurement, workforce/payroll, engineering records, field operations, reporting, and related operational workflows.

**Canonical production domain:** `https://hydroqualisense.com`

**Deployment tenancy model:** one HydroQualiSense deployment serves one client company. The deployment uses its own Supabase project/database/Storage, users, environment configuration, and role/permission model. Database rows continue to carry `company_id` as a defense-in-depth authorization and audit boundary.

The repository may remain named `InvoiceApp`. Repository naming is not product branding.

Existing source/UI may still contain legacy Engoryx strings until the dedicated branding implementation is completed. New current documentation and future implementation must use **HydroQualiSense**.

For current product direction and planning, see:

- [HydroQualiSense Product Direction](docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md)
- [HydroQualiSense Active Roadmap](docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md)
- [Company boundary and database RBAC](docs/company-tenancy-rbac-database.md)
- [Single-company deployment runbook](docs/SINGLE_COMPANY_DEPLOYMENT.md)
- [Workflow Map](docs/architecture/APP_WORKFLOW_MAP.md)

---

## 1. Current Planning Status

On **2026-09-05**, the product roadmap was reset after direct client review.

All previously planned, deferred, or future Engoryx product phases are no longer active roadmap authority. Completed functionality remains valid implementation history, but no old future phase should be selected automatically as the next implementation target.

The only currently confirmed forward requirements are:

1. **HydroQualiSense branding** — remove legacy product branding and make HydroQualiSense the exclusive application identity, with `hydroqualisense.com` as the canonical production domain.
2. **Warehouse inventory** — track current warehouse stock and traceable stock movements, with inventory allocation/issue relationships to individual projects.
3. **Invoice workflow simplification** — incoming/supplier invoice activity should connect directly to expenses/payables, while outgoing client invoices and payment/collection state should connect directly to client billing/receivables instead of living as a separate generic invoice branch.
4. **Requirements hold** — additional client requirements are still being collected. Do not create a detailed implementation phase sequence until those requirements are consolidated.

The exact inventory model, invoice/payment lifecycle semantics, and detailed UX are intentionally not finalized yet.

---

## 2. Existing Implemented Foundation

The current application already contains substantial working functionality. Preserve it unless later client requirements explicitly replace, hide, consolidate, or remove it.

Current foundation includes, where implemented:

- project workspaces and project financial controls;
- supplier/vendor and procurement workflows;
- purchase orders and delivery/receipt tracking;
- supplier invoice extraction/verification and source documents;
- direct expenses and project cost allocations;
- client billing, collections, and cash/banking settlement evidence;
- workforce, attendance, payroll, and project labor allocation;
- engineering documents and immutable revisions;
- RFIs, Submittals, and Daily Site Logs;
- reports and management views;
- guarded AI-assisted operations;
- deployment-scoped RBAC, RLS, company-bound integrity, and audit/history controls.

The roadmap reset removes old **future authorization**; it does not mean these completed capabilities should be deleted.

---

## 3. Current Product Invariants

- **One deployment, one client company:** unrelated companies do not coexist in the same production deployment or Supabase project.
- **Database defense in depth:** keep `company_id`, RLS, membership checks, permissions, and company-bound foreign-key validation.
- **No tenant switching:** browser state, URLs, Assistant arguments, or request headers must not select another company.
- **Financial history remains auditable:** verified/finalized financial, payroll, procurement, billing, collection, and settlement records must not be silently rewritten.
- **No double counting:** simplification of invoice workflows must not cause one economic event to be recognized twice.
- **Client billing is not collection:** an invoice sent to a client and money received from the client remain distinct events unless a later explicit contract changes the model.
- **Supplier obligation/cost is not automatically settlement:** source invoices, recognized expense/cost, and payment evidence must retain explicit semantics until the revised workflow is fully specified.
- **Currency is explicit:** never silently combine mixed currencies or invent FX.
- **Inventory must be auditable:** future warehouse stock must be explainable from authoritative stock movements or an equally rigorous source model.
- **Controlled AI actions:** consequential AI-assisted writes require permission checks and explicit human confirmation.

---

## 4. Development & Local Runbook

### Windows PowerShell

Use `npm.cmd` and `npx.cmd` where plain PowerShell shims may be blocked.

```bash
npm.cmd install
npm.cmd run dev
```

### Normal validation ladder

Start with the changed surface rather than rerunning the full historical suite automatically.

```bash
# New/edited and focused tests first
npm.cmd run test:affected:agent

# When relevant
npm.cmd run lint
npm.cmd run build
```

For database-affecting work, use the real local Supabase stack when available:

```bash
docker info
npx.cmd supabase start
npx.cmd supabase db reset --local --no-seed --yes
npx.cmd supabase test db --local
npm.cmd run test:migrations
npm.cmd run test:migrations:upgrade
```

Static SQL/string checks do not replace runtime PostgreSQL/Supabase validation.

See `AGENTS.md` and `docs/AGENT_EXECUTION_EFFICIENCY.md` for the authoritative implementation and testing workflow.

---

## 5. Required Environment Variables

```env
AI_CREDENTIALS_MASTER_KEY=BASE64_OF_32_RANDOM_BYTES
SUPABASE_AI_SERVER_KEY=SUPABASE_SECRET_KEY_FOR_COMPANY_AI_ONLY
ALLOW_GLOBAL_GEMINI_FALLBACK=false
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Deployment company identity is stored in the target Supabase project's singleton `deployment_configuration` row rather than a browser-selected tenant identifier. See [the deployment runbook](docs/SINGLE_COMPANY_DEPLOYMENT.md).

---

## 6. Historical Documentation

Older files whose names contain `ENGORYX_` may remain in the repository as historical implementation/design references. They are **not** current branding and are **not** active future-roadmap authority.

When an older document conflicts with:

- `AGENTS.md`;
- `docs/HYDROQUALISENSE_PRODUCT_DIRECTION.md`; or
- `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`,

the current HydroQualiSense documents control.