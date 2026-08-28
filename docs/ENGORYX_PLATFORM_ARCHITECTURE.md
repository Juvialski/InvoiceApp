# ENGORYX Platform Architecture

Engoryx is an integrated engineering operations platform designed for architecture, engineering, and construction (AEC) firms, general contractors, specialty subcontractors, and project management organizations.

This document outlines the architectural blueprint, data model invariants, modular feature roadmap, and code decomposition strategy for the Engoryx platform.

---

## 1. Executive Overview & Design Principles

Engoryx unifies financial operations, workforce management, document control, field engineering, and spatial visualization under a unified multi-tenant architecture.

### Architectural Invariants

1. **Financial Immutability & Audit Trail**:
   - Financial ledger entries, approved payroll runs, paid invoices, and posted bank transactions are append-only.
   - Adjustments, voiding, and corrections are made via additive offsetting entries with explicit reasons and user attribution.
   - Multi-currency conversions preserve the original invoice/account currency, exchange rate snapshot timestamp, and target converted amount.

2. **Strict Multi-Tenancy & RBAC Isolation**:
   - All tenant data belongs to a specific company_id enforced via PostgreSQL Row-Level Security (RLS) policies and indexed company_id foreign keys.
   - Company membership permissions (has_company_permission(p_company_id, p_permission_key)) fail closed.
   - Service-role bypass is forbidden on browser clients and restricted to explicit administrative migration/cron scripts.

3. **Guarded Multi-Step AI Operations**:
   - AI capabilities (such as invoice extraction, email classification, and Engoryx Assistant) are strictly assistive and non-destructive.
   - Mutations initiated via natural language tools create a PREPARED preview with deterministic validation.
   - Changes require explicit user review and interactive confirmation before execution.

4. **Progressive Web & Field Readiness**:
   - The platform is designed for responsive performance across desktop workstations (1440px+), field tablets (768px-1024px), and mobile smartphones (375px-430px).
   - Core field capture flows support offline queuing with monotonic client sequence timestamps and automatic reconciliation upon reconnect where an explicit synchronization contract exists.

5. **Verification Before Automation**:
   - Deterministic tests, database invariants, browser evidence, and repository-native workflow contracts remain authoritative for engineering verification.
   - Visual workflow maps and AI-assisted QA may improve understanding or prioritize defects but do not replace CI pass/fail semantics or silently mutate production state.

---

## 2. Project Workspace Model

The Project is the central organizing aggregate in Engoryx. All cost, labor, documents, field records, and engineering artifacts roll up to the project workspace.

```
+-------------------------------------------------------------------------------+
|                               ENGORYX PROJECT                                 |
|                                                                               |
|  +--------------------+  +--------------------+  +-------------------------+  |
|  |     FINANCIALS     |  |     WORKFORCE      |  |       DOCUMENTS         |  |
|  | * Budget & Baseline|  | * Active Crew      |  | * Drawings & Blueprints |  |
|  | * Supplier Invoices|  | * Site Attendance  |  | * Technical RFIs        |  |
|  | * Direct Expenses  |  | * Overtime Records |  | * Submittal Packages    |  |
|  | * Cash Banking     |  | * Cost Allocations |  | * Daily Site Logs       |  |
|  +--------------------+  +--------------------+  +-------------------------+  |
|                                                                               |
|  +--------------------+  +--------------------+  +-------------------------+  |
|  |     SCHEDULING     |  |     MATERIALS      |  |    SPATIAL & FIELD      |  |
|  | * Interactive Gantt|  | * Requisitions/MRO |  | * 3D CAD & BIM Models   |  |
|  | * Milestones & CPM |  | * QR/Barcode Assets|  | * GIS Drone Orthomosaics|  |
|  | * Progress Baselines| | * Vendor PO Matching| | * Cut/Fill Calculations |  |
|  +--------------------+  +--------------------+  +-------------------------+  |
+-------------------------------------------------------------------------------+
```

### Core Project Aggregates

- **Overview & Health**: High-level KPI metrics (contract value, committed costs, actual spend, gross margin, labor variance, schedule slippage).
- **Cost & Cash Accounting**: Direct mapping of supplier invoice allocations, direct site disbursements, approved payroll labor, and separate settlement evidence from Cash & Banking.
- **Crew & Labor Allocations**: Worker assignments, hourly/daily cost attribution, equipment operator allocations, and productivity tracking.
- **Document Hub**: Centralized version-controlled blueprint repository, drawing sheet revisions, layered annotations, and approval registers.
- **Field Engineering Workflows**: RFIs with formal response history, technical submittal rounds/reviews, and daily weather/equipment/site logs.
- **Scheduling & Milestones**: Gantt timelines linked to milestone billings and labor allocation horizons.

---

## 3. Phased Implementation Roadmap

### Current status snapshot - 2026-08-28

The current `main` baseline has moved beyond the original Phase 1 planning state:

- **Phase 0 core operations are established and active** across multi-tenant RBAC, Cash & Banking, Invoices, Projects, Expenses, Workforce & Payroll, Reports, and the guarded Engoryx Assistant.
- **Phase 1A is complete**: Engineering Documents & Blueprint Viewer with immutable revision lineage and normalized redlines.
- **Phase 1B is complete**: project-scoped RFIs and Technical Submittals with guarded lifecycle/history and immutable engineering-document revision references.
- **Phase 1C is complete**: Daily Site Logs with weather/site conditions, crew/headcount observations, equipment, delays, safety observations, and formal submission/finalization history.
- **Financial Settlement Integration is complete** across Cash & Banking, supplier invoices, payroll, supported expense compatibility, demo fixtures, and Assistant workflows. Settlement is authoritative payment/disbursement evidence but remains separate from project-cost and payroll-source semantics.
- **Next customer-facing product phase:** Phase 2 - Project Scheduling & Gantt.
- **Engineering-infrastructure status:** QA-1 Structured Browser Evidence and WM-1 through WM-5 are implemented. The repository-native workflow-map, consistency validation, browser evidence overlay, and bounded agent-context track is complete for the current roadmap. This track does not renumber the product roadmap.

### Customer-facing product roadmap

The customer-facing platform evolution remains structured into sequential, backward-compatible phases:

| Phase | Module / Domain | Status | Key Deliverables |
| :--- | :--- | :--- | :--- |
| **Phase 0** | **Rebrand & Core Foundation** | **Established / Active** | Engoryx branding, multi-tenant RBAC, Cash & Banking, Invoices, Projects, Expenses, Payroll, Reports, AI Assistant, plus the bounded Astryx UI foundation. |
| **Phase 1** | **Engineering Documents & Field Workflows** | **Complete / Active in product** | **Phase 1A (Complete)**: Blueprint viewer (PDF.js + Konva), immutable revisions, normalized redline markups.<br>**Phase 1B (Complete)**: RFIs & Technical Submittals with guarded lifecycle/history and document-revision linking.<br>**Phase 1C (Complete)**: Daily Site Logs & Weather, project-scoped field observations, equipment, delays, safety, and formal history. |
| **Cross-Domain Settlement** | **Financial Settlement Integration** | **Complete** | Guarded Cash & Banking settlement evidence for supplier invoices, payroll runs, and supported expenses; partial/split settlement, reversals, deep links, demo fixtures, and Assistant PREPARE/confirm/execute flows while preserving project-cost semantics. |
| **Phase 2** | **Project Scheduling & Gantt** | **Next / Planned** | Interactive Gantt charts (Frappe Gantt), task dependency networks, critical path method (CPM), milestone progress tracking, baseline-versus-actual schedule health, and project-scoped schedule navigation. |
| **Phase 3** | **Field Capture & Barcode Asset Tagging** | Planned | Camera-based barcode/QR scanner (ZXing-js), equipment check-in/out, tool tracking, site material delivery validation. |
| **Phase 4** | **Spatial & Site Operations (BIM & GIS)** | Future | Browser-native 3D CAD/BIM model viewer (Online3DViewer/web-ifc), GIS site boundary mapping (MapLibre + Turf), Drone orthomosaic overlay (OpenDroneMap). |
| **Phase 5** | **Procurement & Material Requisitions** | Future | Bill of Quantities (BOQ) matching, Material Requisition Orders (MRO), 3-way PO matching, vendor quote comparisons. |
| **Phase 6** | **Subcontractor & Client Portal** | Future | Subcontractor portal, contract issuance, lien waiver tracking, digital document signing (Documenso). |
| **Phase 7** | **Document Intelligence & Advanced Parsing** | Future | Deep document layout analysis, multi-column contract parsing, CAD title-block OCR (Docling + Tesseract). |
| **Phase 8** | **Field Communications & SMS** | Future | Direct Android SMS dispatch (httpSMS), shift notifications, emergency weather alerts, automated worker reminders. |

### Engineering infrastructure track - Workflow Map, QA & Agent Context

This is a cross-cutting development track rather than a customer-facing Engoryx phase. Its architecture is documented in [ENGORYX_ENGINEERING_QA_AGENT_CONTEXT.md](ENGORYX_ENGINEERING_QA_AGENT_CONTEXT.md).

The stack is deliberately repository-native:

- **one versioned machine-readable workflow graph** covering important routes, states, actions, guards, cross-domain relationships, and selected test references;
- **Mermaid and React Flow/xyflow rendering** for a visual workflow canvas with domain grouping, pan/zoom, filtering, and clickable context;
- **deterministic graph validation** for broken node/edge references, selected route/lifecycle inconsistencies, missing high-risk guard metadata, and orphaned workflow paths;
- **existing Playwright/browser QA** for rendered route interaction, responsive sweeps, screenshots, console/page errors, failed requests, and evidence attached to workflow nodes;
- **GitHub Issues, PRs, tests, and repository documentation** for durable defect/history context;
- **bounded feature-scoped context packets** for future coding-agent runs so agents receive the relevant workflow, invariants, files, and tests without loading an unbounded project history.

No external paid workflow-orchestration service is required. External repository-visualization tools may be used for exploration, but the Engoryx workflow graph remains the curated source for product-specific business semantics.

The rollout is complete through **WM-5**: WM-1 canonical workflow graph, WM-2 visual workflow canvas, WM-3 graph consistency validation, WM-4 browser evidence overlay, and WM-5 bounded agent-context generation are implemented. Later enhancements are optional and do not renumber the customer-facing roadmap.

---

## 4. App.tsx Decomposition Strategy

To maintain high code quality and testability while preserving single-page reactivity, App.tsx will be systematically decomposed into focused layer controllers and route routers as the application evolves.

### Target Architecture

```
src/
├── app/
│   ├── App.tsx                     # Slim root container (<150 lines)
│   ├── AppProviders.tsx            # Context provider stack (Auth, Tenancy, Brand, Assistant)
│   ├── AppShell.tsx                # Layout shell, Sidebar, Header, Breadcrumbs, ErrorBoundaries
│   └── routes/
│       ├── AppRouter.tsx           # Route matching & dynamic view switching
│       ├── DashboardRoute.tsx      # Dashboard lifecycle & data container
│       ├── CashBankingRoute.tsx    # Cash & banking state coordinator
│       ├── ProjectsRoute.tsx       # Project directory & workspace coordinator
│       ├── InvoicesRoute.tsx       # Invoice extraction, review, and directory
│       ├── PayrollRoute.tsx        # Payroll & workforce state coordinator
│       ├── ExpensesRoute.tsx       # Direct expense management
│       └── ReportsRoute.tsx        # Financial & project report generation
├── features/
│   ├── types.ts                    # Feature metadata & lifecycle contracts
│   ├── registry.ts                 # Feature registry and capability mapping
│   ├── dashboard/                  # Dashboard presentation & calculators
│   ├── cash/                       # Cash & banking domain components
│   ├── invoices/                   # Invoice extraction & verification components
│   ├── projects/                   # Project workspace & cost allocation components
│   ├── engineering/                # Documents, RFIs/Submittals, Site Logs
│   ├── payroll/                    # Payroll workflow, calendar, and run components
│   ├── expenses/                   # Direct expense forms & lists
│   ├── reports/                    # Operational & financial reports
│   └── assistant/                  # Guarded operations assistant
└── config/
    └── brand.ts                    # Central canonical branding constants & helpers
```

Phase 1 production closure applies this incrementally: project selection,
project persistence, archive lifecycle, and guest project storage are owned by
`src/features/projects/useProjectController.ts`; engineering document loading,
project isolation, PDF/revision persistence, compensation, archive, and
annotation snapshots are owned by
`src/features/engineering/useEngineeringDocumentsController.ts`. Phase 1B and
1C continue the engineering-feature boundary instead of expanding `App.tsx`.
`App.tsx` continues to own only cross-domain integration that has not yet been
moved into route/controller boundaries.

### Step-by-Step Refactoring Protocol

1. **Step 1: Extract Route Containers**:
   - Move tab-specific state machines (e.g. cashData, payrollData, invoiceProjectAllocations) into dedicated route wrappers (src/app/routes/*Route.tsx).
   - Leave core routing and notification bus in AppShell.

2. **Step 2: Consolidate Shared Action Handlers**:
   - Group mutation handlers into custom hooks (useInvoiceActions(), usePayrollActions(), useProjectActions()).
   - Enforce optimistic updates with rollback on network failure only where the underlying domain permits optimistic behavior.

3. **Step 3: Preserve Navigation and Deep Link Integrity**:
   - Ensure all URL parameters and project/document/financial deep links continue to map 1:1 with canonical route helpers.

---

## 5. Security, Tenancy & Audit Invariants

### Database Security Model
- Every table containing operational or financial data requires company_id uuid not null references companies(id).
- RLS policies must strictly use company-scoped permission checks and fail closed.
- Platform admins access cross-company tools only through explicit administrative RPCs (is_platform_admin()).

### Auditing & Provenance
- All mutations record actor/time lineage appropriate to the domain.
- Staged imports (bank statements, payroll workbooks, invoices) retain raw source payloads, file hashes, and parser metadata for non-repudiation where the existing domain contract requires it.
- Formal engineering records preserve lifecycle history instead of rewriting prior submitted/finalized state.
- Financial settlement reversals are additive and preserve original confirmation provenance.

### Development workflow-map provenance
- Workflow nodes and edges use stable identifiers and link back to live routes/files/tests where practical.
- Generated agent-context summaries are advisory snapshots and never replace live inspection of current `main`, current CI, and the actual source tree.
- Sensitive production financial, payroll, banking, document, or employee data must not be embedded in the workflow graph or generated context.
- Browser evidence attached to workflow nodes must distinguish demo/test evidence from authenticated production behavior.
