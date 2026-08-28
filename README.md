# ENGORYX — Engineering Operations Platform

Engoryx is an integrated engineering operations platform for architecture, engineering, and construction (AEC) firms, contractors, and project teams. It unifies project costing, cash & banking operations, supplier invoice extraction & verification, workforce management, engineering payroll, direct expenses, engineering document control, field workflows, financial settlement evidence, and comprehensive reporting under a secure multi-tenant architecture.

For technical architecture and roadmap details, see:
- [Engoryx Platform Architecture](docs/ENGORYX_PLATFORM_ARCHITECTURE.md)
- [Engoryx Phase 1A: Engineering Documents & Blueprint Viewer](docs/ENGORYX_PHASE_1A_ENGINEERING_DOCUMENTS.md)
- [Engoryx Phase 1B: RFIs & Technical Submittals](docs/ENGORYX_PHASE_1B_RFIS_SUBMITTALS.md)
- [Engoryx Phase 1C: Daily Site Logs & Weather Tracking](docs/ENGORYX_PHASE_1C_DAILY_SITE_LOGS.md)
- [Engoryx Financial Settlement Integration](docs/ENGORYX_FINANCIAL_SETTLEMENT_INTEGRATION.md)
- [Engoryx Workflow Map, QA & Agent Context Infrastructure](docs/ENGORYX_ENGINEERING_QA_AGENT_CONTEXT.md)
- [Engoryx Open-Source Integrations Evaluation](docs/ENGORYX_OPEN_SOURCE_INTEGRATIONS.md)
- [Engoryx UI Foundation & Astryx Pilot](docs/ENGORYX_UI_FOUNDATION.md)

---

## 1. Current Project Status

Roadmap snapshot as of **2026-08-28**:

- **Phase 0 core operations are established**: multi-tenant RBAC, Cash & Banking, Invoices, Projects, Expenses, Workforce & Payroll, Reports, and the guarded Engoryx Assistant are active platform foundations.
- **Phase 1 is functionally complete on `main`**:
  - **Phase 1A**: Engineering Drawings & Blueprint Viewer, immutable revision lineage, and normalized redlines.
  - **Phase 1B**: RFIs and Technical Submittals with guarded lifecycle/history and document-revision linking.
  - **Phase 1C**: Daily Site Logs with weather/site conditions, crew/headcount observations, equipment, delays, safety observations, and formal field-record history.
- **Financial Settlement Integration is complete**: Cash & Banking can provide guarded settlement evidence for supplier invoices, payroll runs, and supported expenses while keeping project-cost and payroll-source semantics separate.
- **The next customer-facing product phase is Phase 2: Project Scheduling & Gantt.**
- **QA-1 Structured Browser Evidence and WM-1 through WM-5 are implemented**: the repository contains generated machine-readable/Mermaid workflow-map outputs, a read-only developer canvas, deterministic graph-to-source contract checks, browser-evidence overlays, and an on-demand bounded agent-context generator.

---

## 2. Core Modules

1. **Operations Dashboard**: Central executive and project cost overview with multi-currency conversions and real-time KPI metrics.
2. **Cash & Banking**: Multi-account ledger, statement imports, balance freshness tracking, transaction reconciliation, and settlement evidence against invoices, payroll, and supported expenses.
3. **Invoices & AI Extraction**: Multimodal invoice extraction with Gemini models, human verification queue, editable line items, vendor directory, and authoritative settlement presentation.
4. **Project Workspaces**: Detailed project tracking combining budgets, confirmed supplier invoices, approved payroll allocations, direct site expenses, engineering documents, RFIs/Submittals, and Daily Site Logs.
5. **Engineering Documents & Drawings (Phase 1A)**: Multi-page blueprint viewer (PDF.js + Konva), immutable revision lineage, normalized vector redlines, and discipline filtering.
6. **Engineering Coordination (Phase 1B)**: Project-scoped RFIs and Technical Submittals with guarded lifecycle transitions, formal history, immutable document-revision references, and Assistant integration.
7. **Daily Site Logs (Phase 1C)**: Project-scoped daily field records for weather/site conditions, crew, equipment, delays, safety observations, and formal submission/finalization history.
8. **Direct Expenses**: Project disbursement tracking for fuel, transport, equipment rentals, permits, and miscellaneous site costs.
9. **Workforce & Payroll**: Attendance rosters, overtime approvals, leave management, compensation profiles, recurring runs, project labor cost allocation, and payroll disbursement evidence.
10. **Operational Reports**: Consolidated project cost reports, payroll operating cost summaries, and full multi-sheet Excel workbook exports.
11. **Engoryx Assistant**: Guarded operations assistant for natural language navigation, data queries, and multi-step action preparation with mandatory confirmation gates.

---

## 3. Phased Engineering Platform Roadmap

- **Phase 0 (Established / Active)**: Engoryx Core Foundation, Multi-Tenant RBAC, Cash & Banking, Invoices, Projects, Expenses, Payroll, Reports, AI Assistant, and the bounded Astryx UI-foundation pilot.
- **Phase 1 (Complete / Active in product)**:
  - **Phase 1A (Complete)**: Engineering Drawings & Blueprint Viewer (PDF.js + Konva), immutable revisions, normalized redlines.
  - **Phase 1B (Complete)**: RFIs and Technical Submittals with Engineer-of-Record-style coordination workflows and immutable document-revision references.
  - **Phase 1C (Complete)**: Daily Site Logs with weather/site conditions, crew headcount, equipment usage, delays, safety observations, and formal field-record history.
- **Cross-Domain Financial Settlement (Complete)**: Guarded settlement integration across Cash & Banking, supplier invoices, payroll, supported expenses, and Assistant workflows. Settlement remains evidence of payment/disbursement and does not create project cost.
- **Engineering Infrastructure Track (WM-1 through WM-5 implemented)**: the canonical source is [`scripts/workflow-map/graph.ts`](scripts/workflow-map/graph.ts), with generated [`workflow-map.json`](docs/architecture/workflow-map.json) and [`APP_WORKFLOW_MAP.md`](docs/architecture/APP_WORKFLOW_MAP.md). Use `npm.cmd run workflow-map:generate`, `npm.cmd run workflow-map:check`, `npm.cmd run workflow-map:consistency`, and `npm.cmd run workflow-map:context`; the track runs from repository code and existing CI/local tooling. Later enhancements are optional and do not renumber the customer-facing Engoryx roadmap. See [the dedicated plan](docs/ENGORYX_ENGINEERING_QA_AGENT_CONTEXT.md).
- **Phase 2 (Next Product Phase / Planned)**: Interactive Gantt Scheduling (Frappe Gantt), task dependency networks, CPM, milestone progress tracking, and project schedule health.
- **Phase 3 (Planned)**: Field Capture & Barcode/QR Scanning (ZXing-js) for equipment check-in/out, tool tracking, and material delivery verification.
- **Phase 4 (Future)**: 3D CAD & BIM Model Inspection (Online3DViewer / web-ifc), GIS Site Boundaries & Drone Survey Orthomosaics (MapLibre + Turf + OpenDroneMap).
- **Phase 5 (Future)**: Procurement, Material Requisition Orders (MRO), BOQ/vendor workflows, and 3-way PO matching.
- **Phase 6 (Future)**: Subcontractor Portal & Self-Hosted Digital Signatures (Documenso).
- **Phase 7 (Future)**: Advanced Document Intelligence & Complex Layout Parsing (Docling).
- **Phase 8 (Future)**: Field SMS & Emergency Weather Broadcasts (httpSMS).

---

## 4. Development & Local Runbook

### Prerequisites & Windows PowerShell Notes
When executing in Windows PowerShell, always invoke `npm.cmd` and `npx.cmd` to adhere to script execution policies (see AGENTS.md).

```bash
# Install dependencies
npm.cmd install

# Start development server (Port 3000)
npm.cmd run dev
```

### Full Validation Suite

```bash
# Run unit & domain tests (Node native test runner)
npm.cmd test

# Run TypeScript typecheck / lint
npm.cmd run lint

# Build production client and server bundles
npm.cmd run build

# Validate database migrations
npm.cmd run test:migrations
```

### Bounded workflow context for substantial work

WM-5 generates a disposable, feature-scoped orientation packet from the canonical graph and safe local Git metadata. Markdown is the default stdout format; use `--json` for machine-readable output. Packets are advisory and should not be committed as generated repository state.

```bash
# Exact workflow node
npm.cmd run workflow-map:context -- --node payroll-period

# Domain plus task keywords
npm.cmd run workflow-map:context -- --domain engineering --query "RFI detail"

# Route/workflow relationship as JSON
npm.cmd run workflow-map:context -- --route payroll --format json

# Locally changed files with an explicit smaller bound
npm.cmd run workflow-map:context -- --changed --budget 8000
```

---

## 5. Required Environment Variables

```env
AI_CREDENTIALS_MASTER_KEY=BASE64_OF_32_RANDOM_BYTES
SUPABASE_AI_SERVER_KEY=SUPABASE_SECRET_KEY_FOR_COMPANY_AI_ONLY
ALLOW_GLOBAL_GEMINI_FALLBACK=false
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

---

## 6. Security, Tenancy & Financial Invariants

- **Multi-Tenancy**: All records are strictly company-isolated via PostgreSQL Row-Level Security (RLS).
- **Financial Immutability**: Historical financial transactions, approved payroll runs, and verified invoice baselines are append-only.
- **Settlement Separation**: Confirmed cash settlement is evidence of payment/disbursement and does not independently create project cost or rewrite payroll-source history.
- **Controlled AI Actions**: AI operations produce previews only (PREPARED); write operations require explicit human confirmation.
- **Philippines-First Context**: Complies with official BIR/EOPT invoice guidance ([BIR RR No. 7-2024](https://bir-cdn.bir.gov.ph/BIR/pdf/RR%20No.%207-%202024.pdf), [RMC No. 77-2024](https://bir-cdn.bir.gov.ph/BIR/pdf/RMC%20No.%2077-%202024.pdf)).
