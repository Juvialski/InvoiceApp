# ENGORYX — Engineering Operations Platform

Engoryx is an integrated engineering operations platform for architecture, engineering, and construction (AEC) firms, contractors, and project teams. It unifies project costing, cash & banking operations, supplier invoice extraction & verification, workforce management, engineering payroll, direct expenses, and comprehensive reporting under a secure multi-tenant architecture.

For technical architecture and open-source roadmap details, see:
- [Engoryx Platform Architecture](docs/ENGORYX_PLATFORM_ARCHITECTURE.md)
- [Engoryx Open-Source Integrations Evaluation](docs/ENGORYX_OPEN_SOURCE_INTEGRATIONS.md)

---

## 1. Core Modules

1. **Operations Dashboard**: Central executive and project cost overview with multi-currency conversions and real-time KPI metrics.
2. **Cash & Banking**: Multi-account ledger, statement imports, balance freshness tracking, and transaction reconciliation against invoices, payroll, and expenses.
3. **Invoices & AI Extraction**: Multimodal invoice extraction with Gemini 3.5 Flash-Lite / 3.7 Flash, human verification queue, editable line items, and vendor directory.
4. **Project Workspaces**: Detailed project tracking combining budgets, confirmed supplier invoices, approved payroll allocations, and direct site expenses.
5. **Direct Expenses**: Project disbursement tracking for fuel, transport, equipment rentals, permits, and miscellaneous site costs.
6. **Workforce & Payroll**: Attendance rosters, overtime approvals, leave management, compensation profiles, recurring runs, and project labor cost allocation.
7. **Operational Reports**: Consolidated project cost reports, payroll operating cost summaries, and full multi-sheet Excel workbook exports.
8. **Engoryx Assistant**: Guarded operations assistant for natural language navigation, data queries, and multi-step action preparation with mandatory confirmation gates.

---

## 2. Phased Engineering Platform Roadmap

- **Phase 0 (Active)**: Engoryx Core Foundation, Multi-Tenant RBAC, Cash & Banking, Invoices, Projects, Expenses, Payroll, Reports, AI Assistant.
- **Phase 1 (Planned)**: Engineering Drawings & Blueprint Viewer (PDF.js + Konva), RFIs, Submittal Packages, Daily Site Logs with weather & heavy equipment tracking.
- **Phase 2 (Planned)**: Interactive Gantt Scheduling (Frappe Gantt), task dependency networks, CPM, milestone progress tracking.
- **Phase 3 (Planned)**: Field Capture & Barcode/QR Scanning (ZXing-js) for equipment check-in/out, tool tracking, and material delivery verification.
- **Phase 4 (Future)**: 3D CAD & BIM Model Inspection (Online3DViewer / web-ifc), GIS Site Boundaries & Drone Survey Orthomosaics (MapLibre + Turf + OpenDroneMap).
- **Phase 5 (Future)**: Procurement, Material Requisition Orders (MRO), and 3-way PO matching.
- **Phase 6 (Future)**: Subcontractor Portal & Self-Hosted Digital Signatures (Documenso).
- **Phase 7 (Future)**: Advanced Document Intelligence & Complex Layout Parsing (Docling).
- **Phase 8 (Future)**: Field SMS & Emergency Weather Broadcasts (httpSMS).

---

## 3. Development & Local Runbook

### Prerequisites & Windows PowerShell Notes
When executing in Windows PowerShell, always invoke 
pm.cmd and 
px.cmd to adhere to script execution policies (see AGENTS.md).

`ash
# Install dependencies
npm.cmd install

# Start development server (Port 3000)
npm.cmd run dev
`

### Full Validation Suite

`ash
# Run unit & domain tests (Node native test runner)
npm.cmd test

# Run TypeScript typecheck / lint
npm.cmd run lint

# Build production client and server bundles
npm.cmd run build

# Validate database migrations
npm.cmd run test:migrations
`

---

## 4. Required Environment Variables

`env
AI_CREDENTIALS_MASTER_KEY=BASE64_OF_32_RANDOM_BYTES
SUPABASE_AI_SERVER_KEY=SUPABASE_SECRET_KEY_FOR_COMPANY_AI_ONLY
ALLOW_GLOBAL_GEMINI_FALLBACK=false
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
`

---

## 5. Security, Tenancy & Financial Invariants

- **Multi-Tenancy**: All records are strictly company-isolated via PostgreSQL Row-Level Security (RLS).
- **Financial Immutability**: Historical financial transactions, approved payroll runs, and verified invoice baselines are append-only.
- **Controlled AI Actions**: AI operations produce previews only (PREPARED); write operations require explicit human confirmation.
- **Philippines-First Context**: Complies with official BIR/EOPT invoice guidance ([BIR RR No. 7-2024](https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%207-%202024.pdf), [RMC No. 77-2024](https://bir-cdn.bir.gov.ph/BIR/pdf/RMC%20No.%2077-2024.pdf)).
