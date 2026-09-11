export const PRODUCT_FEATURE_STATUSES = ["AVAILABLE", "PLANNED", "FUTURE_DESIGN"] as const;
export type ProductFeatureStatus = (typeof PRODUCT_FEATURE_STATUSES)[number];

export const PRODUCT_FEATURE_STATUS_LABELS: Readonly<Record<ProductFeatureStatus, string>> = Object.freeze({
  AVAILABLE: "Available",
  PLANNED: "Planned",
  FUTURE_DESIGN: "Future / Design Stage",
});

export const PRODUCT_FEATURE_CATEGORIES = [
  "Projects & Operations",
  "Project Financial Visibility",
  "Supplier Invoices & Expenses",
  "Client Billing & Collections",
  "Cash & Banking",
  "Payroll & Workforce",
  "Procurement",
  "Engineering & Field Operations",
  "Warehouse & Inventory",
  "Equipment",
  "Reporting & Oversight",
  "Email & Document Intake",
  "AI Assistance",
  "Access & Administration",
] as const;
export type ProductFeatureCategory = (typeof PRODUCT_FEATURE_CATEGORIES)[number];

export interface ProductFeatureDefinition {
  readonly id: string;
  readonly title: string;
  readonly category: ProductFeatureCategory;
  readonly status: ProductFeatureStatus;
  readonly shortDescription: string;
  readonly details: readonly string[];
  readonly sortOrder: number;
}

/**
 * Client-facing product truth for Settings. Keep this separate from the
 * internal operator feature registry: these descriptions explain usable
 * workflows and approved direction without exposing implementation metadata.
 */
export const CLIENT_PRODUCT_FEATURES: readonly ProductFeatureDefinition[] = Object.freeze([
  {
    id: "projects-operations",
    title: "Project management",
    category: "Projects & Operations",
    status: "AVAILABLE",
    shortDescription: "Manage projects and bring commercial, financial, workforce, materials, equipment, and field context together in one project workspace.",
    details: [
      "Create and manage project records, managers, status, location, contract value, and approved budget.",
      "Open project workspaces for budget control, cost codes, supplier documents, expenses, payroll, materials, equipment, engineering, billing, collections, and project reports.",
    ],
    sortOrder: 10,
  },
  {
    id: "project-financial-visibility",
    title: "Cost and budget controls",
    category: "Project Financial Visibility",
    status: "AVAILABLE",
    shortDescription: "Monitor contract value, budget, actual cost, committed cost, pending exposure, billing, and collections with clear source status.",
    details: [
      "Review project budget position and cost-code controls alongside the records that support the position.",
      "Incomplete source visibility or unresolved currency conversion is identified instead of being presented as a complete total.",
    ],
    sortOrder: 20,
  },
  {
    id: "supplier-invoices-expenses",
    title: "Supplier invoice review",
    category: "Supplier Invoices & Expenses",
    status: "AVAILABLE",
    shortDescription: "Browse and review supplier invoices, preserve source documents, and record authorized full or partial supplier payments directly from the invoice while the linked Expense remains authoritative.",
    details: [
      "Review supplier identity, invoice facts, project allocations, purchase-order matching, duplicate signals, and source history before confirmation.",
      "Verified supplier evidence links to the expense record that owns the payable and cost, without creating a second cost record.",
      "Use Change Status to record a full or partial payment against the linked Expense, including inline Cash/Bank account setup when permitted.",
      "Payment status is derived from confirmed linked-Expense settlement evidence; Cash & Banking remains available for deeper reconciliation, history, and corrections.",
      "Follow supplier invoice, Expense, purchase-order, and receipt context links to the exact record that owns each step of the workflow.",
    ],
    sortOrder: 30,
  },
  {
    id: "client-billing-collections",
    title: "Client invoices and collections",
    category: "Client Billing & Collections",
    status: "AVAILABLE",
    shortDescription: "Create draft and issued client progress billings, record partial or full collections, and follow each invoice's receivable history.",
    details: [
      "Collections allocate against issued client billings and keep commercial receipt history visible.",
      "Issued client invoices show amount collected, amount remaining, collection state, and related collection history without manual calculation.",
      "Recorded collections continue to Cash & Banking with the exact target context so legitimate bank evidence can be selected and reconciled separately from commercial collection truth.",
    ],
    sortOrder: 40,
  },
  {
    id: "cash-banking",
    title: "Cash and banking workspace",
    category: "Cash & Banking",
    status: "AVAILABLE",
    shortDescription: "Manage company bank, cash-on-hand, and GCash or e-wallet accounts, balances, statements, and explicit reconciliation for expenses and other obligations.",
    details: [
      "Import CSV or spreadsheet statements, review balance and duplicate checks, and confirm transaction matches.",
      "Payment entry can carry an exact Expense, payroll, or certified subcontract payable target into Cash & Banking, where legitimate evidence is selected and explicitly confirmed.",
      "If no payment account is configured, users with permission can add a bank, e-wallet, or permitted cash-on-hand account and continue the selected payment flow.",
      "The current workflow is ledger- and statement-based rather than a live bank connection; account, settlement, and correction history remains visible.",
    ],
    sortOrder: 50,
  },
  {
    id: "payroll-workforce",
    title: "Payroll operations",
    category: "Payroll & Workforce",
    status: "AVAILABLE",
    shortDescription: "Manage workforce records, project assignments, payroll schedules, time and attendance records, leave, overtime, compensation, recurring components, and payroll runs.",
    details: [
      "Import payroll workbooks, review exceptions, calculate drafts, approve runs, and record employee net-pay disbursement through Cash & Banking while retaining the resulting history.",
      "Connect approved project labor allocations to project cost visibility while keeping administrative and project labor distinct.",
    ],
    sortOrder: 60,
  },
  {
    id: "procurement",
    title: "Procurement workspace",
    category: "Procurement",
    status: "AVAILABLE",
    shortDescription: "Manage purchase orders and receipts, requests for quotation, supplier quotations, supplier selection, and project-linked procurement.",
    details: [
      "Track purchase commitments and received quantities, with supplier invoice matching available in the review workflow.",
      "After recording a receipt, continue to the exact Warehouse receipt context when explicit stock posting is required.",
      "Manage subcontracts, progress claims, and variations with their project context and history.",
      "Approved progress claims show the net certified payable and continue into legitimate Cash & Banking settlement without duplicating project cost or payable truth.",
    ],
    sortOrder: 70,
  },
  {
    id: "engineering-field-operations",
    title: "Engineering documents and site records",
    category: "Engineering & Field Operations",
    status: "AVAILABLE",
    shortDescription: "Keep project drawings, specifications, reports, calculations, RFIs, submittals, and daily site records in their project context.",
    details: [
      "Create history-preserving document revisions and retain source evidence, review links, coordination context, and annotations where supported.",
      "Record site weather, crew, equipment, materials, safety, and daily operational notes where enabled.",
    ],
    sortOrder: 80,
  },
  {
    id: "warehouse-inventory",
    title: "Warehouse inventory",
    category: "Warehouse & Inventory",
    status: "AVAILABLE",
    shortDescription: "Track inventory items, on-hand quantities, warehouse movements, project issues and returns, and procurement receipt context.",
    details: [
      "Receive stock, issue material to a project, record returns, and review movement history.",
      "Project material requirements and field observations remain visible alongside stock without replacing movement history.",
      "Open the authoritative Procurement receipt from a warehouse movement when persisted source metadata is available.",
    ],
    sortOrder: 90,
  },
  {
    id: "equipment",
    title: "Company equipment",
    category: "Equipment",
    status: "AVAILABLE",
    shortDescription: "Maintain a company equipment register with current lifecycle state and auditable project assignment, transfer, and return history.",
    details: [
      "Equipment identity and formal assignment remain separate from daily site observations.",
    ],
    sortOrder: 100,
  },
  {
    id: "reporting-oversight",
    title: "Operational and financial reports",
    category: "Reporting & Oversight",
    status: "AVAILABLE",
    shortDescription: "Review operational and financial summaries for projects, supplier activity, payroll, expenses, cash, payables, and reporting readiness.",
    details: [
      "Reports keep original currencies visible and flag information that still needs review.",
      "Project dashboards bring budget position, cost composition, commitments, billing, collections, and operational signals together.",
    ],
    sortOrder: 110,
  },
  {
    id: "email-document-intake",
    title: "Email and Documents workspace",
    category: "Email & Document Intake",
    status: "AVAILABLE",
    shortDescription: "Use one communications workspace for read-only Gmail intake, reviewed outbound email, delivery history, and a permission-aware Documents index.",
    details: [
      "Save sender and template routing rules where needed, and use the forwarded supplier invoice fallback when a mailbox is not connected.",
      "Compose ordinary email or send an eligible issued Purchase Order or Client Invoice through the shared permission-aware delivery history.",
      "Browse permission-approved document records and artifacts, preview supported issued documents, and return to the authoritative owning workflow.",
      "SMS status is visible in the workspace but remains not configured until an approved provider is connected and tested.",
    ],
    sortOrder: 120,
  },
  {
    id: "company-document-templates",
    title: "Company document templates",
    category: "Email & Document Intake",
    status: "AVAILABLE",
    shortDescription: "Keep company-designed Word templates for Purchase Orders and Client Invoices, then merge approved snapshot values into editable DOCX files and, where the deployment supports it, a matching PDF.",
    details: [
      "Upload an existing DOCX, start from a HydroQualiSense template, duplicate a version, or generate an editable draft with AI assistance.",
      "Review allowlisted field mappings and repeating line-item rows before activating a template version.",
      "Issued document generation stays tied to the immutable snapshot and template version used at issuance. If company-designed PDF finalization is unavailable in a deployment, the existing PDF option remains available and the limitation is shown.",
      "Send issued Purchase Orders and Client Invoices through a connected Gmail account using the exact supported PDF for that snapshot.",
      "Review immutable delivery history, recipients, status, attachment identity, and safe retry controls from the document workflow.",
    ],
    sortOrder: 125,
  },
  {
    id: "ai-assistance",
    title: "Assistant and AI extraction",
    category: "AI Assistance",
    status: "AVAILABLE",
    shortDescription: "Use the Hydroqualisense Assistant for navigation, questions, and preparing supported actions, plus AI-assisted invoice extraction and review.",
    details: [
      "Gemini-powered assistance can be enabled for the deployment when configured.",
      "Extracted fields and suggested actions remain reviewable; consequential changes require human confirmation.",
    ],
    sortOrder: 130,
  },
  {
    id: "access-administration",
    title: "Company access and administration",
    category: "Access & Administration",
    status: "AVAILABLE",
    shortDescription: "Manage the deployment company profile, users, roles, permissions, regional settings, AI configuration, and access history.",
    details: [
      "Permissions determine which work areas and actions each member can use.",
      "Important operational and financial history remains auditable, and source documents stay attached to the workflow that owns them.",
    ],
    sortOrder: 140,
  },
  {
    id: "email-sms-documents-improvements",
    title: "SMS provider-backed messaging",
    category: "Email & Document Intake",
    status: "PLANNED",
    shortDescription: "Add provider-backed SMS sending and delivery status after an approved provider is configured and runtime-tested.",
    details: [
      "Use server-side provider credentials, bounded sending, normalized status and safe failure handling.",
      "Provider-backed delivery requires idempotency, retry/reconciliation behavior, and synthetic-recipient QA before activation.",
      "No pricing, delivery guarantee, campaign automation, or provider health is implied before those controls are proven.",
    ],
    sortOrder: 210,
  },
  {
    id: "worker-registration",
    title: "Worker Registration",
    category: "Payroll & Workforce",
    status: "PLANNED",
    shortDescription: "Register workers through a project or site QR workflow, with supervisor review before they are added to the workforce system.",
    details: [
      "A worker opens a project or site QR link, submits the required identity and assignment details, and starts in a pending state.",
      "A supervisor or administrator checks duplicate identity, worker details, and project assignment before approval.",
      "Approval creates or links the worker record used by normal workforce, payroll, and project workflows.",
      "Uploaded images may support future enrollment evidence; they do not approve identity by themselves.",
    ],
    sortOrder: 220,
  },
  {
    id: "site-attendance",
    title: "Site Attendance",
    category: "Payroll & Workforce",
    status: "PLANNED",
    shortDescription: "Record project and site attendance through registered site devices with explicit time-in and time-out.",
    details: [
      "The planned workflow includes employee attendance history, duplicate-punch protection, and controlled attendance corrections.",
      "Offline-safe behavior will be designed as part of implementation, and payroll connections will follow approved attendance rules.",
      "This roadmap item does not promise automatic payroll posting rules that have not been approved.",
    ],
    sortOrder: 230,
  },
  {
    id: "face-recognition-attendance",
    title: "Face-Recognition Attendance",
    category: "Payroll & Workforce",
    status: "FUTURE_DESIGN",
    shortDescription: "Future / Design Stage — not currently active. Explore identity assistance for site attendance only after worker enrollment and attendance foundations are approved.",
    details: [
      "Enrollment would follow approved Worker Registration; a registered site device may assist with photo-based identification for time-in and time-out.",
      "A confident match could identify the worker, while an uncertain match would require confirmation or manual fallback and identity correction would remain possible.",
      "Production use first requires privacy and consent design, access controls, retention and deletion rules, liveness and anti-spoof protections, confidence thresholds, device and site controls, and correction history.",
    ],
    sortOrder: 310,
  },
] satisfies readonly ProductFeatureDefinition[]);

export function getProductFeaturesByStatus(status: ProductFeatureStatus): readonly ProductFeatureDefinition[] {
  return CLIENT_PRODUCT_FEATURES
    .filter((feature) => feature.status === status)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

export function getProductFeatureById(id: string): ProductFeatureDefinition | undefined {
  return CLIENT_PRODUCT_FEATURES.find((feature) => feature.id === id);
}
