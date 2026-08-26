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
   - Core field capture flows support offline queuing with monotonic client sequence timestamps and automatic reconciliation upon reconnect.

---

## 2. Project Workspace Model

The Project is the central organizing aggregate in Engoryx. All cost, labor, documents, field records, and engineering artifacts roll up to the project workspace.

`
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
`

### Core Project Aggregates

- **Overview & Health**: High-level KPI metrics (contract value, committed costs, actual spend, gross margin, labor variance, schedule slippage).
- **Cost & Cash Accounting**: Direct mapping of supplier invoice allocations, direct site disbursements, and approved payroll labor.
- **Crew & Labor Allocations**: Worker assignments, hourly/daily cost attribution, equipment operator allocations, and productivity tracking.
- **Document Hub**: Centralized version-controlled blueprint repository, drawing sheet revisions, layered annotations, and approval registers.
- **Field Engineering Workflows**: RFIs with engineer-of-record threads, material submittals with sample logs, and daily weather/equipment logs.
- **Scheduling & Milestones**: Gantt timelines linked to milestone billings and labor allocation horizons.

---

## 3. Phased Implementation Roadmap

The platform evolution is structured into nine sequential, backward-compatible phases:

| Phase | Module / Domain | Status | Key Deliverables |
| :--- | :--- | :--- | :--- |
| **Phase 0** | **Rebrand & Core Foundation** | **Active** | Engoryx branding, multi-tenant RBAC, Cash & Banking, Invoices, Projects, Expenses, Payroll, Reports, AI Assistant. |
| **Phase 1** | **Engineering Documents & Field Workflows** | Planned | High-resolution blueprint viewer (PDF.js + Konva), RFIs, Submittals, Daily Site Logs with weather & heavy equipment tracking. |
| **Phase 2** | **Project Scheduling & Gantt** | Planned | Interactive Gantt charts (Frappe Gantt), task dependency networks, critical path method (CPM), milestone progress tracking. |
| **Phase 3** | **Field Capture & Barcode Asset Tagging** | Planned | Camera-based barcode/QR scanner (ZXing-js), equipment check-in/out, tool tracking, site material delivery validation. |
| **Phase 4** | **Spatial & Site Operations (BIM & GIS)** | Future | Browser-native 3D CAD/BIM model viewer (Online3DViewer/web-ifc), GIS site boundary mapping (MapLibre + Turf), Drone orthomosaic overlay (OpenDroneMap). |
| **Phase 5** | **Procurement & Material Requisitions** | Future | Bill of Quantities (BOQ) matching, Material Requisition Orders (MRO), 3-way PO matching, vendor quote comparisons. |
| **Phase 6** | **Subcontractor & Client Portal** | Future | Subcontractor portal, contract issuance, lien waiver tracking, digital document signing (Documenso). |
| **Phase 7** | **Document Intelligence & Advanced Parsing**| Future | Deep document layout analysis, multi-column contract parsing, CAD title-block OCR (Docling + Tesseract). |
| **Phase 8** | **Field Communications & SMS** | Future | Direct Android SMS dispatch (httpSMS), shift notifications, emergency weather alerts, automated worker reminders. |

---

## 4. App.tsx Decomposition Strategy

To maintain high code quality and testability while preserving single-page reactivity, App.tsx (~2,800 lines) will be systematically decomposed into focused layer controllers and route routers.

### Target Architecture

`
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
│   ├── payroll/                    # Payroll workflow, calendar, and run components
│   ├── expenses/                   # Direct expense forms & lists
│   ├── reports/                    # Operational & financial reports
│   └── assistant/                  # Guarded operations assistant
└── config/
    └── brand.ts                    # Central canonical branding constants & helpers
`

### Step-by-Step Refactoring Protocol

1. **Step 1: Extract Route Containers**:
   - Move tab-specific state machines (e.g. cashData, payrollData, invoiceProjectAllocations) into dedicated route wrappers (src/app/routes/*Route.tsx).
   - Leave core routing and notification bus in AppShell.

2. **Step 2: Consolidate Shared Action Handlers**:
   - Group mutation handlers into custom hooks (useInvoiceActions(), usePayrollActions(), useProjectActions()).
   - Enforce optimistic updates with rollback on network failure.

3. **Step 3: Preserve Navigation and Deep Link Integrity**:
   - Ensure all URL parameters (?tab=..., /projects/:id, /invoices/:id/review) continue to map 1:1 with canonical src/utils/routes.ts definitions.

---

## 5. Security, Tenancy & Audit Invariants

### Database Security Model
- Every table containing operational or financial data requires company_id uuid not null references companies(id).
- RLS policies must strictly use p_company_id = auth.current_company_id() or has_company_permission(company_id, permission_key).
- Platform admins access cross-company tools only through explicit administrative RPCs (is_platform_admin()).

### Auditing & Provenance
- All mutations record created_by, created_at, updated_by, updated_at.
- Staged imports (bank statements, payroll workbooks, invoices) retain raw source payloads, file hashes, and parser metadata for non-repudiation.
