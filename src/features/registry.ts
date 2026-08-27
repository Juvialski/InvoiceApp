import type { EngoryxFeatureDefinition } from './types.ts';

export const ENGORYX_FEATURE_REGISTRY: readonly EngoryxFeatureDefinition[] = Object.freeze([
  // Phase 0: Core Foundation (Active)
  {
    id: 'core-dashboard',
    name: 'Operations Dashboard',
    description: 'Central executive and project cost operations dashboard with real-time currency conversions.',
    category: 'operations',
    phase: 0,
    status: 'ACTIVE',
    moduleId: 'dashboard',
    routeId: 'dashboard',
    requiredPermissions: ['dashboard.read'],
    documentationRef: 'docs/ENGORYX_PLATFORM_ARCHITECTURE.md',
  },
  {
    id: 'core-cash-banking',
    name: 'Cash and Banking Operations',
    description: 'Multi-account ledger, statement imports, transaction reconciliation, and live cash flow tracking.',
    category: 'financial',
    phase: 0,
    status: 'ACTIVE',
    moduleId: 'cash',
    routeId: 'cash',
    requiredPermissions: ['cash.accounts.read'],
    documentationRef: 'docs/ENGORYX_PLATFORM_ARCHITECTURE.md',
  },
  {
    id: 'core-invoices',
    name: 'Invoice Management and AI Extraction',
    description: 'Multimodal invoice extraction, human verification queue, and vendor directory.',
    category: 'financial',
    phase: 0,
    status: 'ACTIVE',
    moduleId: 'invoices',
    routeId: 'invoices',
    requiredPermissions: ['invoices.read'],
    documentationRef: 'docs/ENGORYX_PLATFORM_ARCHITECTURE.md',
  },
  {
    id: 'core-projects',
    name: 'Project Costing and Workspaces',
    description: 'Engineering project workspaces tracking budget, confirmed invoices, payroll allocations, and direct expenses.',
    category: 'engineering',
    phase: 0,
    status: 'ACTIVE',
    moduleId: 'projects',
    routeId: 'projects',
    requiredPermissions: ['projects.read'],
    documentationRef: 'docs/ENGORYX_PLATFORM_ARCHITECTURE.md',
  },
  {
    id: 'core-expenses',
    name: 'Direct Project Expenses',
    description: 'Tracking of fuel, transport, equipment rentals, permits, and miscellaneous site disbursements.',
    category: 'financial',
    phase: 0,
    status: 'ACTIVE',
    moduleId: 'expenses',
    routeId: 'expenses',
    requiredPermissions: ['expenses.read'],
    documentationRef: 'docs/ENGORYX_PLATFORM_ARCHITECTURE.md',
  },
  {
    id: 'core-payroll',
    name: 'Workforce and Engineering Payroll',
    description: 'Attendance, leave, overtime, compensation profiles, recurring runs, and project labor cost allocation.',
    category: 'workforce',
    phase: 0,
    status: 'ACTIVE',
    moduleId: 'payroll',
    routeId: 'payroll',
    requiredPermissions: ['payroll.read'],
    documentationRef: 'docs/ENGORYX_PLATFORM_ARCHITECTURE.md',
  },
  {
    id: 'core-reports',
    name: 'Operational and Financial Reporting',
    description: 'Consolidated project cost reports, payroll summaries, and full multi-sheet Excel workbook export.',
    category: 'operations',
    phase: 0,
    status: 'ACTIVE',
    moduleId: 'reports',
    routeId: 'reports',
    requiredPermissions: ['reports.read'],
    documentationRef: 'docs/ENGORYX_PLATFORM_ARCHITECTURE.md',
  },
  {
    id: 'core-assistant',
    name: 'Engoryx Assistant',
    description: 'Guarded conversational assistant for navigation, queries, and multi-step action preparation.',
    category: 'intelligence',
    phase: 0,
    status: 'ACTIVE',
    requiredPermissions: ['dashboard.read'],
    documentationRef: 'docs/ENGORYX_PLATFORM_ARCHITECTURE.md',
  },

  // Phase 1: Engineering Documents and Field Workflows (In Progress)
  {
    id: 'eng-drawings-viewer',
    name: 'Engineering Drawings and Spec Sheets',
    description: 'High-performance multi-page blueprint viewer with layered redlining, annotations, and revision comparison.',
    category: 'engineering',
    phase: 1,
    status: 'ACTIVE',
    moduleId: 'engineering-documents',
    routeId: 'projects',
    requiredPermissions: ['engineering.documents.read'],
    openSourceCandidates: ['Mozilla PDF.js', 'Konva.js / React-Konva'],
    documentationRef: 'docs/ENGORYX_PHASE_1A_ENGINEERING_DOCUMENTS.md',
  },
  {
    id: 'eng-rfis-submittals',
    name: 'RFIs and Technical Submittals',
    description: 'Request for Information (RFI) lifecycle, engineer-of-record reviews, submittal packages, and formal approvals.',
    category: 'engineering',
    phase: 1,
    status: 'ACTIVE',
    moduleId: 'projects',
    routeId: 'projects',
    requiredPermissions: ['engineering.rfis.read', 'engineering.submittals.read'],
    documentationRef: 'docs/ENGORYX_PHASE_1B_RFIS_SUBMITTALS.md',
  },
  {
    id: 'eng-daily-site-logs',
    name: 'Daily Site Logs and Weather Tracking',
    description: 'Daily construction logs tracking site weather conditions, crew headcounts, heavy equipment usage, and safety incidents.',
    category: 'field',
    phase: 1,
    status: 'ACTIVE',
    moduleId: 'projects',
    routeId: 'projects',
    requiredPermissions: ['projects.read', 'engineering.sitelogs.read'],
    documentationRef: 'docs/ENGORYX_PHASE_1C_DAILY_SITE_LOGS.md',
  },

  // Phase 2: Scheduling and Critical Path (Planned)
  {
    id: 'eng-schedule-gantt',
    name: 'Gantt Scheduling and Milestones',
    description: 'Interactive Gantt charts with task dependencies, critical path tracking, milestone billing, and progress baseline comparisons.',
    category: 'engineering',
    phase: 2,
    status: 'PLANNED',
    openSourceCandidates: ['Frappe Gantt'],
    documentationRef: 'docs/ENGORYX_OPEN_SOURCE_INTEGRATIONS.md',
  },

  // Phase 3: Field Capture and Barcode Asset Tagging (Planned)
  {
    id: 'field-barcode-qr-capture',
    name: 'Field QR and Barcode Material Tracking',
    description: 'Mobile camera QR/barcode scanner for equipment check-in/out, material delivery verification, and tool asset tracking.',
    category: 'field',
    phase: 3,
    status: 'PLANNED',
    openSourceCandidates: ['ZXing-js / @zxing/browser'],
    documentationRef: 'docs/ENGORYX_OPEN_SOURCE_INTEGRATIONS.md',
  },

  // Phase 4: Spatial and Site Operations (Future)
  {
    id: 'spatial-bim-3d-viewer',
    name: '3D CAD and BIM Model Viewer',
    description: 'Browser-native 3D model inspector for IFC, STEP, OBJ, and GLTF models with element isolation and cross-sections.',
    category: 'spatial',
    phase: 4,
    status: 'FUTURE',
    openSourceCandidates: ['Online3DViewer (kovacsv)', 'web-ifc (That Open Company / IFC.js)'],
    documentationRef: 'docs/ENGORYX_OPEN_SOURCE_INTEGRATIONS.md',
  },
  {
    id: 'spatial-gis-drone-mapping',
    name: 'GIS and Drone Orthomosaic Mapping',
    description: 'Geospatial mapping for site boundaries, drone survey orthomosaics, elevation contours, and cut/fill earthwork calculations.',
    category: 'spatial',
    phase: 4,
    status: 'FUTURE',
    openSourceCandidates: ['MapLibre GL JS', 'Turf.js', 'OpenDroneMap (ODM)'],
    documentationRef: 'docs/ENGORYX_OPEN_SOURCE_INTEGRATIONS.md',
  },

  // Phase 5: Procurement and Material Requisitions (Future)
  {
    id: 'procurement-material-requisitions',
    name: 'Material Requisitions and Purchase Orders',
    description: 'Bill of Quantities (BOQ) line-item matching, material requisition orders (MRO), 3-way matching, and supplier quotation comparison.',
    category: 'procurement',
    phase: 5,
    status: 'FUTURE',
    documentationRef: 'docs/ENGORYX_PLATFORM_ARCHITECTURE.md',
  },

  // Phase 6: Subcontractor and Client Portal (Future)
  {
    id: 'portal-subcontractor-signature',
    name: 'Subcontractor Contracts and Digital Signature',
    description: 'Subcontractor agreement issuance, lien waiver generation, and secure self-hosted digital document signing.',
    category: 'operations',
    phase: 6,
    status: 'FUTURE',
    openSourceCandidates: ['Documenso'],
    documentationRef: 'docs/ENGORYX_OPEN_SOURCE_INTEGRATIONS.md',
  },

  // Phase 7: Document Intelligence and Advanced Parsing (Future)
  {
    id: 'intel-docling-ocr',
    name: 'Advanced Document Intelligence and Complex Parsing',
    description: 'Deep layout analysis for complex multi-column contracts, CAD drawing title-block extraction, and table structural analysis.',
    category: 'intelligence',
    phase: 7,
    status: 'FUTURE',
    openSourceCandidates: ['Docling (DS4SD/IBM)', 'Tesseract.js'],
    documentationRef: 'docs/ENGORYX_OPEN_SOURCE_INTEGRATIONS.md',
  },

  // Phase 8: Field Communications and SMS (Future)
  {
    id: 'field-httpsms-alerts',
    name: 'Field SMS and Emergency Broadcasts',
    description: 'Direct-from-Android SMS dispatch for workforce scheduling, shift reminders, weather warnings, and site announcements.',
    category: 'field',
    phase: 8,
    status: 'FUTURE',
    openSourceCandidates: ['httpSMS'],
    documentationRef: 'docs/ENGORYX_OPEN_SOURCE_INTEGRATIONS.md',
  },
]);

export function getFeaturesByPhase(phase: number): readonly EngoryxFeatureDefinition[] {
  return ENGORYX_FEATURE_REGISTRY.filter((feature) => feature.phase === phase);
}

export function getFeaturesByStatus(status: EngoryxFeatureDefinition['status']): readonly EngoryxFeatureDefinition[] {
  return ENGORYX_FEATURE_REGISTRY.filter((feature) => feature.status === status);
}

export function getFeatureById(id: string): EngoryxFeatureDefinition | undefined {
  return ENGORYX_FEATURE_REGISTRY.find((feature) => feature.id === id);
}
