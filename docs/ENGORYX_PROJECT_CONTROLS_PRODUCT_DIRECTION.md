# Engoryx Project Controls Product Direction

Status: **ACTIVE PRODUCT DIRECTION**  
Repository: `Juvialski/InvoiceApp`  
Architecture: **one deployment -> one client company**

## Product position

Engoryx remains an **Engineering Operations Platform**. The current deployment should emphasize:

**Project Controls + Finance + Field Operations + Engineering Documents**

The current client/project pattern is consistent with project-based engineering and contracting work, including water/wastewater treatment and rehabilitation projects. Do not hardcode Engoryx into only that specialty: the product must continue to support broader engineering clients.

This is a product-priority adjustment, not a rewrite of the existing architecture.

## Permanent product principles

1. **Project is the operational hub.** Business activity should link to a project whenever the underlying workflow is project-specific.
2. **Do not delete mature modules because one deployment does not need them.** Hide or disable irrelevant modules through deployment/module configuration while retaining the capability for other engineering clients.
3. **Engineering remains first-class.** Engineering Documents, immutable revisions, RFIs, Submittals, transmittal/as-built workflows, and their provenance must not be reduced to generic file attachments.
4. **Financial truth is derived, not manually invented.** Project costs and commercial metrics should be computed from authoritative business records whenever possible.
5. **Do not double count.** Existing invoice allocations, payroll allocations, expenses, settlements, and future commitments must have explicit accounting semantics.
6. **One deployment still means one client company.** Feature gating must never introduce unrelated-company switching or cross-company sharing.
7. **Broad product capability and deployment simplicity are compatible.** A deployment may expose only the modules that client needs while the repository retains the full engineering platform.

## Existing foundation to preserve

The current schema already provides an important Project Controls base:

- `projects.contract_value`
- `projects.project_budget`
- `invoice_project_allocations`
- project-linked `expenses`
- `work_entries`
- `payroll_project_allocations`
- `project_worker_assignments`
- `project_accounting_events`

The existing cost model intentionally keeps invoice allocations, payroll allocations, and direct expenses as separate authoritative sources. Preserve that separation rather than converting all project costs into duplicate expense rows.

Engineering Documents already use their own immutable document/revision lineage. Preserve it.

## Project financial model

The Projects UI should evolve from a simple:

`Budget -> Recorded Cost -> Remaining`

into a real project-controls model.

### Authoritative concepts

**Contract / Project Value**  
Client-facing value of the awarded project or current approved contract value. The existing `projects.contract_value` is the starting field.

**Approved Cost Budget**  
Internal planned cost ceiling/budget. The existing `projects.project_budget` remains distinct from contract value.

**Actual Cost**  
Derived confirmed project cost. It should come from authoritative posted/approved sources rather than a manually maintained total. Existing confirmed-cost semantics should continue to include only the appropriate lifecycle states for:

- verified invoice project allocations;
- approved/paid payroll project allocations;
- approved/paid direct project expenses;
- later approved/posted procurement or subcontract costs when those modules exist.

**Committed Cost**  
Approved obligations that may not yet be invoiced/paid, primarily future Purchase Orders and subcontract commitments.

**Forecast Cost**  
Expected final project cost. Initial versions may use a simple explicit forecast model, but must distinguish actual, committed, and forecast values.

**Budget Remaining**  
Approved cost budget minus recognized/forecast cost according to the chosen project-controls view. Do not confuse this with unbilled contract value.

**Billed to Client**  
Approved/issued progress billings or client invoices for the project.

**Collected**  
Client payments actually settled/received and matched to project billing.

**Forecast Margin**  
Contract value (including approved variations where applicable) minus forecast final cost. Display percentage only when the denominator and currency semantics are valid.

### Currency rule

Do not numerically aggregate different currencies without an explicit exchange-rate contract. Existing foreign-currency truthfulness rules remain in force.

## Project-centered relationship model

A Project should become the primary navigation/context hub for related operations:

```text
Project
  -> contract value + approved budget
  -> cost codes / budget lines
  -> invoice allocations
  -> direct expenses
  -> payroll / labor allocations
  -> suppliers / quotations
  -> purchase orders / commitments
  -> deliveries
  -> subcontractors
  -> change orders / variations
  -> client progress billing
  -> collections / settlements
  -> materials / equipment
  -> engineering documents / revisions
  -> RFIs / Submittals
  -> daily site logs
  -> project accounting / audit events
```

Relationships should point to existing authoritative domain records rather than copying their financial data into the Project row.

## Deployment module visibility

Introduce deployment-level module configuration in a future implementation wave. The exact storage mechanism must be designed against the current company/deployment configuration before implementation.

Conceptual module keys:

- `projects`
- `finance`
- `payroll`
- `procurement`
- `client_billing`
- `site_operations`
- `engineering`
- `materials_equipment`
- `assistant`

Rules:

- company/deployment admins may control visibility only where product policy permits;
- hiding a module does not delete its records;
- feature gating does not bypass RLS or permission checks;
- hidden modules may still contribute authoritative aggregates when required (for example, hidden Payroll can still contribute approved labor cost to a project summary if the current user is allowed to see the aggregate);
- do not use feature flags as authorization.

## Priority capabilities

### 1. Project Controls

- contract value vs approved cost budget;
- project cost codes / budget categories;
- actual cost from existing finance/payroll records;
- committed cost from procurement/subcontracts;
- budget/forecast variance;
- billed and collected values;
- forecast project margin;
- project financial snapshot and drill-down without exposing unauthorized payroll detail.

### 2. Procurement and Commercial Operations

- suppliers/vendors;
- quotation comparison;
- Purchase Orders;
- delivery/receipt status;
- supplier invoices linked back to PO/project commitment;
- subcontractors and scopes;
- subcontract commitments and progress claims;
- change orders / variations;
- client progress billing;
- retention and collection tracking.

### 3. Field / Site Operations

Daily Site Logs should evolve around practical project execution:

- manpower and crews;
- work accomplished;
- equipment used;
- material deliveries;
- weather;
- delays/issues;
- safety events;
- site photos/attachments when supported safely;
- linkage to the relevant project and, where useful, cost code/work package.

### 4. Engineering Document Control

Retain and strengthen:

- document register;
- immutable revisions;
- drawings/specifications;
- RFIs;
- Submittals;
- approval/status history;
- transmittals where implemented later;
- as-built/final records where implemented later.

Engineering records must preserve immutable/auditable history even when the deployment primarily uses financial/project-control features.

## Management dashboard direction

The management dashboard should prioritize actionable project/commercial metrics rather than generic record counts.

Candidate top-level metrics:

- active projects;
- total contract value;
- approved cost budget;
- actual cost;
- committed cost;
- forecast cost;
- billed to clients;
- collected;
- outstanding receivables;
- payroll/labor cost for the current period;
- forecast gross margin.

A later "Projects at Risk" view may surface evidence-based flags such as:

- cost/forecast over approved budget;
- overdue receivables;
- delayed procurement/commitments;
- overdue RFIs/Submittals;
- unusual labor-cost variance;
- schedule/delay indicators only after a reliable schedule contract exists.

Do not invent risk scores without explainable source metrics.

## What does not change

This direction does **not** authorize:

- deleting Finance, Payroll, Engineering, Cash & Banking, or Assistant capabilities;
- weakening RLS or permission checks;
- merging unrelated companies into one deployment;
- replacing immutable Engineering revision history with generic attachments;
- changing finalized financial history silently;
- treating Project as a giant denormalized record;
- adding scheduling/Gantt/CPM merely because project controls are now emphasized.

## Implementation sequencing

The active implementation sequence is maintained in `docs/ENGORYX_ACTIVE_ROADMAP.md`.

Infrastructure S1-S4 remain valid and are not discarded by this product adjustment. Storage/database work and project-controls product work are separate concerns that share the same security and company-boundary rules.
