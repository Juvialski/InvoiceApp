# HydroQualiSense Product Direction

Status: **ACTIVE PRODUCT DIRECTION / REQUIREMENTS INTAKE**  
Repository: `Juvialski/InvoiceApp`  
Architecture: **one deployment -> one client company**  
Canonical production domain: `https://hydroqualisense.com`

## Product position

HydroQualiSense is the client company's own operations platform. It is no longer being planned or documented as a generic Engoryx product intended for unrelated client companies.

The current application already contains substantial project, finance, procurement, workforce/payroll, engineering, field, reporting, assistant, and document functionality. That working foundation should be preserved while the client's revised requirements are collected and prioritized.

This direction is a product reset, not permission to discard validated history or bypass existing financial/security contracts.

## Current confirmed priorities

### 1. Company-specific identity

- Application name: **HydroQualiSense**.
- Canonical production domain: `hydroqualisense.com`.
- New current documentation and future implementation should use HydroQualiSense branding.
- Existing legacy branding in code/UI is technical debt to remove in a dedicated implementation pass.
- The application should be tailored to this company's actual workflows rather than preserving features merely for hypothetical unrelated clients.

### 2. Warehouse inventory connected to projects

The company maintains its own warehouse. HydroQualiSense must provide reliable inventory truth and project allocation.

At minimum, the future design must support the business questions:

- What materials/items are currently in the warehouse?
- What quantity is actually available?
- What entered or left stock, when, why, and by whom?
- What stock has been allocated, issued, returned, or otherwise associated with each project?
- What inventory remains after project allocations/issues?
- How does warehouse activity relate to procurement/delivery records without duplicating stock or cost truth?

Inventory must be auditable. Project allocation must not be represented by destructive edits to stock balances; balances should be explainable from authoritative movements or an equally rigorous source model.

Detailed warehouse rules remain pending client clarification.

### 3. Simplified invoice experience

The target product should not expose a generic invoice branch as an isolated business workflow when the invoice's meaning belongs to a more direct financial process.

Current intended split:

**Expense / payable side**

Supplier or company-paid invoice activity should be connected to the relevant expense/payable process and project-cost context where applicable.

**Client billing / receivable side**

Invoices sent to clients and their payment/collection state should be connected directly to client billing/receivables.

The desired simplification is primarily about business workflow, navigation, and source-of-truth alignment. It does not yet define the final database model.

Before implementation, confirm:

- when an incoming supplier invoice becomes or creates an expense/payable record;
- whether unpaid supplier invoices need a payable state distinct from paid expenses;
- how existing invoice verification/extraction should feed the simplified flow;
- how client invoice issuance, payment, collection, and settlement should appear;
- whether partial payments are needed;
- how project allocations work on both sides;
- what historical records must remain visible after the UI consolidation.

Until those answers are known, preserve existing verified/finalized records and avoid migrations that merge financial domains irreversibly.

## Existing foundation to preserve

The current implementation contains source records and controls that may remain useful even if the UI is simplified. Preserve their meaning until a replacement contract is proven, including where applicable:

- projects and project budgets/contract values;
- supplier/vendor and procurement records;
- purchase orders and delivery/receipt evidence;
- supplier invoice verification/source documents;
- project cost allocations;
- direct expenses;
- client billing and collections;
- cash/banking settlement evidence;
- payroll allocations;
- engineering/document history;
- Daily Site Logs and project field evidence;
- RBAC, RLS, membership checks, audit records, and company-bound validation.

A simpler user experience may reuse these authoritative sources rather than physically collapsing every table or lifecycle.

## Financial principles during the redesign

1. **No double counting.** Simplifying invoice navigation must not cause the same economic event to become both invoice cost and duplicate expense cost.
2. **Payment evidence is not automatically cost creation.** Preserve the distinction between source obligation, recognized cost, and settlement unless the revised business contract deliberately changes it.
3. **Client billing and collections remain distinct concepts.** An invoice sent to a client is not the same event as money received.
4. **Historical records stay auditable.** Finalized, verified, paid, collected, voided, reversed, or otherwise consequential financial history must not be silently rewritten.
5. **Project allocation stays traceable.** Cost/material associations with projects need explicit authoritative records.
6. **Currency remains explicit.** Never silently mix currencies or invent exchange rates.

## Product-specific architecture

The deployment remains:

`one deployment -> HydroQualiSense company -> active membership/RBAC -> permitted workflows`

Keep company-scoped database controls even though the deployment serves only this company. Single-company deployment is not a reason to weaken RLS, permission checks, company-bound foreign keys, or server-side credential boundaries.

## Planning hold

Do not use older Engoryx future plans as implementation authority. In particular, no previous deferred phase should automatically become next just because it already has a design document.

More client requirements are expected. The final sequence should be created only after those requirements are combined with the three confirmed directions above.

The authoritative forward plan is `docs/HYDROQUALISENSE_ACTIVE_ROADMAP.md`.