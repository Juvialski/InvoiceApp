import type { RouteId } from "../utils/routes.ts";
import { presentWorkspaceCopy } from "../config/workspacePresentation.ts";

export type HelpCategoryId =
  | "getting-started"
  | "projects"
  | "supplier-invoices-expenses"
  | "procurement"
  | "client-billing-cash"
  | "warehouse-equipment"
  | "vendors"
  | "documents"
  | "communications"
  | "payroll"
  | "settings-access"
  | "troubleshooting"
  | "worksheet-tips";

export type HelpTopicId =
  | "getting-started"
  | "invoice-extraction"
  | "invoice-review"
  | "cash-banking"
  | "project-costing"
  | "project-lifecycle"
  | "project-assignments"
  | "engineering-documents"
  | "daily-site-logs"
  | "blueprint-revisions"
  | "redline-annotations"
  | "drawing-disciplines"
  | "expenses"
  | "invoice-corrections"
  | "expense-corrections"
  | "cash-corrections"
  | "settlements-transfers"
  | "attendance-overtime"
  | "payroll-readiness"
  | "payroll-runs-imports"
  | "workforce-lifecycle"
  | "compensation-components"
  | "reports"
  | "communications"
  | "documents"
  | "document-version-history"
  | "settings"
  | "company-access"
  | "procurement-workbook"
  | "procurement-lifecycle"
  | "warehouse-inventory"
  | "equipment-lifecycle"
  | "vendor-identity"
  | "troubleshooting-recovery"
  | "worksheet-tips";

export interface HelpCategory {
  readonly id: HelpCategoryId;
  readonly label: string;
}

export interface HelpArticle {
  readonly purpose: string;
  readonly steps: readonly string[];
  readonly important?: readonly string[];
  readonly recovery?: readonly string[];
  readonly relatedTopicIds?: readonly HelpTopicId[];
}

export interface HelpTopic {
  readonly id: HelpTopicId;
  readonly categoryId: HelpCategoryId;
  readonly title: string;
  readonly summary: string;
  readonly assistantDetails: string;
  readonly article: HelpArticle;
  readonly routeId: RouteId;
  readonly keywords: readonly string[];
}

export interface HelpRouteRegistryEntry {
  readonly routeId: RouteId;
  readonly topicId: HelpTopicId;
  readonly summary?: string;
}

export const HELP_CATEGORIES: readonly HelpCategory[] = Object.freeze([
  { id: "getting-started", label: "Getting Started and workspace navigation" },
  { id: "projects", label: "Projects and project cost control" },
  { id: "supplier-invoices-expenses", label: "Supplier Invoices and Expenses" },
  { id: "procurement", label: "Procurement, RFQ, Purchase Orders, and receiving" },
  { id: "client-billing-cash", label: "Client Billing, Collections, and Cash & Banking" },
  { id: "warehouse-equipment", label: "Warehouse Inventory and Equipment" },
  { id: "vendors", label: "Vendors and identity resolution" },
  { id: "documents", label: "Documents, templates, previews, and version history" },
  { id: "communications", label: "Email / SMS, delivery history, and provider status" },
  { id: "payroll", label: "Payroll, workforce inputs, and payroll runs" },
  { id: "settings-access", label: "Settings, company access, roles, and permissions" },
  { id: "troubleshooting", label: "Troubleshooting and recovery" },
  { id: "worksheet-tips", label: "Keyboard, worksheet, import/export, and responsive-use tips" },
]);

const article = (
  purpose: string,
  steps: readonly string[],
  options: Omit<HelpArticle, "purpose" | "steps"> = {},
): HelpArticle => ({ purpose, steps, ...options });

const topic = (
  id: HelpTopicId,
  categoryId: HelpCategoryId,
  title: string,
  summary: string,
  assistantDetails: string,
  routeId: RouteId,
  keywords: readonly string[],
  topicArticle: HelpArticle,
): HelpTopic => ({ id, categoryId, title, summary, assistantDetails, routeId, keywords, article: topicArticle });

export const HELP_TOPICS: readonly HelpTopic[] = Object.freeze([
  topic("getting-started", "getting-started", "Getting started in the workspace", "Find the working area for projects, finance, documents, payroll, and communications.", "Use the workspace navigation to open the business area your role can access, then follow the page's primary action and visible state.", "dashboard", ["start", "getting started", "workspace", "navigation", "dashboard", "menu"], article("Orient yourself in the company workspace and reach the right source area.", ["Use the navigation groups to open the area for the task you need to complete.", "Read the page title, current state, and primary action before opening secondary tools.", "Use the shared Help action when you need a procedure or recovery explanation."], { relatedTopicIds: ["project-costing", "invoice-review", "communications", "company-access"] })),
  topic("invoice-extraction", "supplier-invoices-expenses", "Invoice extraction", "Upload supported invoice files and review the extracted fields before they become trusted records.", "Invoice extraction keeps the source context and sends uncertain results to review before they become trusted records.", "extract", ["invoice", "extract", "upload", "pdf", "image", "ocr", "capture"], article("Create a reviewable supplier-invoice record from a supported source file.", ["Upload a supported PDF or image, or use the available safe demo fixture.", "Wait for extraction to finish and inspect the source-linked result.", "Open the review queue when fields are uncertain, incomplete, or flagged."], { important: ["Extraction is evidence, not final verification.", "The source file and review history remain part of the invoice workflow."], recovery: ["Retry only when the source is still available and the current record shows an extraction failure."] })),
  topic("invoice-review", "supplier-invoices-expenses", "Supplier Invoice review", "Compare extracted values with the source, correct permitted fields, and verify only when the record is ready.", "Use the Review Queue to inspect AI results, compare source values, correct fields, and mark invoices verified when they are ready.", "review", ["invoice", "supplier invoice", "review", "verify", "queue", "source", "confidence", "extracted"], article("Review supplier-invoice evidence and make deliberate decisions before downstream payable or cost workflows.", ["Read the source invoice first and compare it with the extracted values.", "Correct permitted extracted fields and resolve vendor, project, or purchase-order questions when needed.", "Save the review, then verify only when the source and blocking review items are resolved.", "Continue to the linked Expense or settlement workflow only through its explicit action."], { important: ["Supplier Invoice evidence remains distinct from the authoritative linked Expense payable and cost record.", "Verification and settlement are deliberate actions; Help does not perform them."], recovery: ["If a value is unresolved or stale, keep the exception visible and refresh or return to the owning workflow before continuing."], relatedTopicIds: ["invoice-extraction", "expenses", "settlements-transfers", "procurement-workbook"] })),
  topic("cash-banking", "client-billing-cash", "Cash & Banking", "Review accounts, statement imports, transactions, reconciliation, and settlement evidence without treating the workspace as a live bank connection.", "Cash & Banking tracks financial accounts, statement imports, transaction ledgers, balance freshness, and reconciliation against invoices, payroll, and expenses.", "cash", ["cash", "bank", "banking", "account", "balance", "statement", "import", "ledger", "freshness", "wallet"], article("Understand the Cash & Banking workspace and its evidence boundaries.", ["Choose an account and review the transaction ledger or statement-import state.", "Inspect reconciliation candidates and the source evidence they reference.", "Use the explicit settlement or transfer action only after reviewing the proposed match."], { important: ["Cash & Banking is not presented as a live bank connection.", "Original currencies remain explicit and are not silently converted or combined."], relatedTopicIds: ["settlements-transfers", "cash-corrections", "reports"] })),
  topic("settlements-transfers", "client-billing-cash", "Cash settlements and internal transfers", "Link payment evidence to invoices, payroll, or expenses and confirm exact internal transfer pairs.", "Settlement confirmation is a human-confirmed cash-evidence action, not project cost. Same-currency opposite transactions can be paired as an internal transfer.", "cash", ["cash", "settlement", "payment", "disbursement", "match", "split", "reverse", "transfer", "reconcile", "confirmation"], article("Confirm cash evidence without rewriting the underlying invoice, Expense, payroll, or project record.", ["Review the candidate transaction and the target record side by side.", "Confirm the exact amount and currency allocation through the settlement workspace.", "For internal transfers, verify the same-currency opposite transaction pair.", "Use reversal with an auditable reason when a previously confirmed link is wrong."], { important: ["A confirmed settlement is cash evidence; it does not recreate project cost or payable truth.", "Nothing is auto-confirmed from a suggestion."], recovery: ["Keep unresolved or conflicting candidates in review and return to the source transaction when evidence is incomplete."], relatedTopicIds: ["cash-banking", "cash-corrections", "invoice-review"] })),
  topic("project-costing", "projects", "Projects and project costing", "Review project identity, budget controls, actual cost, committed cost, and related operational work in one project context.", "Projects show the cost picture for each project. Reports can compare budget, confirmed cost, pending commitments, and remaining budget.", "projects", ["project", "cost", "costing", "budget", "allocation", "actual", "committed", "supplier"], article("Use a project as operational context while keeping each source domain authoritative.", ["Open a project card or compact list row to enter its workspace.", "Use Budget Control and Cost Codes for approved budget and coding work.", "Follow supplier invoices, Expenses, procurement, inventory, documents, and payroll through their explicit project handoffs."], { important: ["Contract Value, Approved Project Budget, Actual Cost, and Committed Cost are distinct concepts.", "Mixed currencies remain separated when authoritative conversion evidence is unavailable."], relatedTopicIds: ["project-lifecycle", "procurement-workbook", "expenses", "worksheet-tips"] })),
  topic("project-lifecycle", "projects", "Project correction and lifecycle", "Edit planning details, archive operational projects, and reactivate eligible archived projects while preserving history.", "Delete is limited to an unused project with no history; projects with operational or financial history are archived instead.", "projects", ["project", "archive", "archived", "reactivate", "restore", "delete", "unused", "correction", "lifecycle"], article("Choose the safe project correction or lifecycle path for the record's current state.", ["Review the project and its dependencies before changing lifecycle state.", "Use ordinary editing for permitted planning details only.", "Archive records with operational or financial history; reactivate only when the lifecycle rules allow it."], { important: ["Finalized or historical project information is not silently erased."], relatedTopicIds: ["project-costing", "troubleshooting-recovery"] })),
  topic("project-assignments", "projects", "Project worker assignments", "Assign workers to projects with effective dates, role, and permitted pay context.", "Project assignments are date-ranged workforce sources. An assignment with downstream work or payroll history must be ended with an effective date.", "payroll", ["assignment", "assign", "worker", "project", "effective date", "labor"], article("Maintain project assignment inputs without rewriting downstream workforce or payroll history.", ["Choose the worker, project, role, and effective date required by the current workflow.", "Review overlapping or historical assignments before saving.", "End an assignment with an effective date when downstream history exists."], { important: ["Assignment inputs do not replace payroll calculation or approval authority."], relatedTopicIds: ["payroll-readiness", "workforce-lifecycle"] })),
  topic("engineering-documents", "projects", "Engineering Documents and Blueprints", "Manage project drawings, specifications, and immutable revisions by discipline.", presentWorkspaceCopy("HydroQualiSense provides centralized engineering document control and blueprint viewing with company-level multi-tenancy."), "projects", ["drawing", "drawings", "blueprint", "blueprints", "document", "documents", "spec", "engineering", "sheet", "viewer"], article("Find project engineering documents and understand their revision context.", ["Open the project Documents or engineering workspace.", "Filter by document number, discipline, or revision context when available.", "Open the source or revision history through the owning project workflow."], { important: ["Engineering revisions and source records remain owned by the engineering workflow."], relatedTopicIds: ["blueprint-revisions", "drawing-disciplines", "documents"] })),
  topic("daily-site-logs", "projects", "Daily Site Logs", "Record project-scoped field conditions, progress, crew observations, equipment, delays, safety, and formal history.", "Daily Site Logs describe what happened on site. Crew and headcount are operational observations only; they never create payroll attendance, timesheets, overtime, or payroll changes.", "projects", ["site", "sites", "log", "logs", "daily", "weather", "crew", "headcount", "equipment", "delay", "safety", "field", "progress"], article("Capture field observations without confusing them with attendance or payroll source records.", ["Open the project Site Logs workspace and choose the relevant date.", "Record field conditions, progress, crew observations, equipment, delay, and safety information.", "Use Payroll for attendance, overtime, and time-source inputs instead of Site Logs."], { important: ["Site Log crew and headcount observations never create payroll attendance, timesheets, overtime, or payroll changes."], relatedTopicIds: ["payroll-readiness", "project-costing"] })),
  topic("blueprint-revisions", "projects", "Blueprint revisions and lineage", "Track updated sheets and preserve immutable revision history.", "Every drawing revision is immutable once uploaded, preserving contractual lineage and audit history.", "projects", ["revision", "revisions", "version", "rev", "lineage", "immutable", "upload", "history", "superseded", "issue"], article("Understand how updated engineering source files remain traceable.", ["Open the document's revision history from the project engineering workspace.", "Upload a new revision through the deliberate revision workflow when permitted.", "Use the current revision for work while retaining the earlier lineage for audit."], { important: ["Existing revision bytes and history are not overwritten or deleted by ordinary editing."], relatedTopicIds: ["engineering-documents", "document-version-history"] })),
  topic("redline-annotations", "projects", "Redline annotations and markups", "Add revision-specific markup clouds, callouts, measurements, and text annotations.", "Redline annotations use normalized page coordinates [0.0, 1.0] and remain tied to the selected revision.", "projects", ["redline", "redlines", "annotation", "annotations", "markup", "markups", "cloud", "callout", "measurement", "scale"], article("Add review markup without changing the underlying drawing revision.", ["Open the target revision in the blueprint viewer.", "Add the required markup or measurement in the revision-scoped layer.", "Use the annotation status and history to distinguish open and resolved review work."], { important: ["Annotations do not rewrite the original revision source."], relatedTopicIds: ["blueprint-revisions"] })),
  topic("drawing-disciplines", "projects", "Drawing discipline filtering", "Filter engineering documents by Architectural, Structural, Civil, MEP, and other supported disciplines.", "Engineering documents use standardized AEC disciplines including ARCHITECTURAL, STRUCTURAL, CIVIL, MECHANICAL, ELECTRICAL, PLUMBING, FIRE_PROTECTION, and GEOTECHNICAL.", "projects", ["discipline", "disciplines", "architectural", "structural", "civil", "mechanical", "electrical", "plumbing", "mep", "filter", "category"], article("Narrow a document register to the discipline relevant to the current project task.", ["Open the engineering document register for the project.", "Choose a supported discipline filter.", "Clear the filter to return to the full permitted register."], { relatedTopicIds: ["engineering-documents", "blueprint-revisions"] })),
  topic("expenses", "supplier-invoices-expenses", "Expenses", "Record direct costs such as fuel, transport, permits, meals, and other project expenses.", "Direct expenses stay separate from supplier invoices and can be associated with projects for costing and reports.", "expenses", ["expense", "expenses", "direct cost", "fuel", "transport", "permit", "meal", "payee"], article("Create, review, and follow direct Expense records without duplicating supplier payable truth.", ["Use the Expense register to find the record or start a direct Expense draft.", "Edit only permitted draft fields through the worksheet or correction workflow.", "Follow source documents, supplier invoices, settlement, archive, or void through their explicit actions."], { important: ["A Supplier Invoice-linked Expense remains the authoritative payable/cost record for that supplier workflow.", "Settlement evidence belongs to Cash & Banking."], recovery: ["Use correction preview and the current lifecycle state before archive, void, restore, or delete-unused actions."], relatedTopicIds: ["invoice-review", "expense-corrections", "settlements-transfers", "worksheet-tips"] })),
  topic("invoice-corrections", "supplier-invoices-expenses", "Invoice corrections", "Correct, archive, restore, void, or delete an invoice only through its guarded lifecycle.", "Invoice correction checks dependencies and confirmed settlement evidence before changing anything.", "invoices", ["invoice", "correct", "correction", "void", "archive", "restore", "delete", "lifecycle"], article("Choose a safe invoice correction action based on the current record and its history.", ["Open the correction preview and read the current lifecycle and dependency state.", "Choose the permitted action and provide the required reason.", "Refresh the invoice and related settlement context after the action completes."], { important: ["Used or auditable records are corrected through deliberate lifecycle paths, not silent deletion."], relatedTopicIds: ["invoice-review", "troubleshooting-recovery"] })),
  topic("expense-corrections", "supplier-invoices-expenses", "Expense corrections", "Correct direct-expense mistakes without erasing project-cost history.", "Expense correction checks dependency and settlement evidence before allowing archive, void, restore, or delete-unused actions.", "expenses", ["expense", "correct", "correction", "void", "archive", "restore", "delete", "lifecycle"], article("Use the Expense correction workflow that matches the record's history and settlement state.", ["Open the correction preview from the Expense record.", "Review protected dependencies and settlement evidence.", "Apply the allowed action with a clear reason, then refresh the register."], { important: ["Financial and operational history remains preserved through guarded correction paths."], relatedTopicIds: ["expenses", "settlements-transfers"] })),
  topic("cash-corrections", "client-billing-cash", "Cash and Banking corrections", "Correct, reverse, ignore, or return cash transactions to review with an audit reason.", "Manual uncommitted and unreconciled transactions can be corrected. Imported, provider, reconciled, transfer-linked, or used transactions must be reversed.", "cash", ["cash", "bank", "transaction", "correct", "correction", "reverse", "ignore", "review", "account"], article("Choose a guarded correction path for a Cash & Banking transaction.", ["Review the transaction source, reconciliation state, and linked evidence.", "Use correction only for eligible manual, uncommitted, unreconciled rows.", "Use reverse, ignore, or return-to-review when the transaction history requires it, and provide the audit reason."], { important: ["Imported, provider, reconciled, transfer-linked, or used transactions are not silently edited."], relatedTopicIds: ["cash-banking", "settlements-transfers"] })),
  topic("attendance-overtime", "payroll", "Attendance and overtime", "Maintain attendance, leave, holidays, and overtime inputs inside Payroll.", "Attendance and overtime records are source inputs for payroll readiness. Review them against the open period before calculating a run.", "payroll", ["attendance", "overtime", "leave", "holiday", "time", "workforce"], article("Review workforce inputs that feed payroll readiness.", ["Open the Payroll period and choose Attendance & Time.", "Review attendance, leave, holiday, and overtime records for the open period.", "Resolve warnings before calculating a payroll run."], { important: ["Attendance inputs do not by themselves approve or finalize payroll."], relatedTopicIds: ["payroll-readiness", "payroll-runs-imports"] })),
  topic("payroll-readiness", "payroll", "Payroll readiness", "Check workers, assignments, pay inputs, attendance, and the open period before a run.", "Payroll readiness means the correct people, dates, assignments, compensation inputs, attendance, and source imports are present and reviewable.", "payroll", ["payroll", "ready", "readiness", "worker", "period", "compensation", "assignment"], article("Prepare the source inputs before a payroll run is calculated.", ["Confirm the open period and its date boundaries.", "Review workers, assignments, compensation, attendance, overtime, and imports.", "Resolve missing or stale inputs before calculating the run."], { important: ["Payroll privacy, calculation freshness, approval authority, and finalized history remain separate controls."], relatedTopicIds: ["attendance-overtime", "payroll-runs-imports", "project-assignments"] })),
  topic("payroll-runs-imports", "payroll", "Payroll runs and imports", "Stage workbook imports, review them, calculate runs, and keep approval explicit.", "Payroll imports are staged for review before commit. Runs can then be calculated and inspected before approval or finalization.", "payroll", ["payroll", "run", "calculate", "import", "workbook", "excel", "stage", "commit"], article("Move payroll source rows through review before calculation and approval.", ["Stage the import and inspect parsed rows, warnings, and worker/project matches.", "Commit only the reviewed import rows through the explicit action.", "Calculate the run, inspect its result, and use the separate approval/finalization workflow."], { important: ["Import commit, calculation, approval, payment, and finalization are separate actions."], recovery: ["Keep staged rows when validation or identity resolution fails; resolve the warning rather than assuming a row was committed."], relatedTopicIds: ["payroll-readiness", "attendance-overtime", "worksheet-tips"] })),
  topic("workforce-lifecycle", "payroll", "Worker correction and lifecycle", "Edit worker details, delete an unused worker, or offboard/reactivate a worker with history preserved.", "Worker deletion is limited to a database-confirmed unused record. Workers with history must be offboarded instead of erased.", "payroll", ["worker", "employee", "workforce", "edit", "delete", "unused", "offboard", "deactivate", "reactivate", "restore"], article("Choose the workforce correction or lifecycle path that preserves payroll history.", ["Review the worker dependency and history state.", "Edit permitted profile fields, or use delete-unused only when the authoritative check allows it.", "Offboard workers with downstream history and reactivate only when permitted."], { important: ["Historical worker identity and payroll records are preserved through lifecycle actions."], relatedTopicIds: ["payroll-readiness", "project-assignments"] })),
  topic("compensation-components", "payroll", "Compensation and recurring payroll components", "Maintain effective-dated compensation profiles and recurring earnings, deductions, or employer costs.", "Compensation setup is effective-dated. Consumed profiles and recurring components must be ended, superseded, or deactivated instead of rewritten.", "payroll", ["compensation", "salary", "rate", "pay", "component", "earning", "deduction", "employer cost", "effective"], article("Maintain payroll compensation inputs without rewriting finalized snapshots.", ["Open the worker or payroll setup context.", "Create or update an effective-dated profile or recurring component.", "End or supersede consumed setup instead of rewriting historical payroll."], { important: ["Finalized payroll snapshots remain authoritative history."], relatedTopicIds: ["payroll-readiness", "workforce-lifecycle"] })),
  topic("reports", "client-billing-cash", "Reports", "Review invoice, project, expense, payroll-cost, and export views with source boundaries intact.", "Reports provide read-oriented operational and financial summaries, including project cost reporting and workbook export.", "reports", ["report", "reports", "summary", "export", "financial", "payroll cost", "analysis"], article("Use reports to inspect operational summaries without treating them as new source records.", ["Choose the report family and date or project context.", "Read currency, source completeness, and unavailable-state indicators.", "Export only through the provided report action when a workbook is needed."], { important: ["Derived reports do not replace canonical invoices, Expenses, settlements, inventory movements, or payroll records."], relatedTopicIds: ["project-costing", "cash-banking", "expenses"] })),
  topic("communications", "communications", "Email / SMS workspace and provider status", "Compose reviewed messages, inspect delivery history, and understand truthful provider states.", "Compose uses the server-side outbound email path and always requires human confirmation. Sent / Delivery History distinguishes provider acceptance from confirmed delivery; SMS remains unavailable until configured and tested.", "inbox", ["email", "sms", "compose", "send", "delivery", "history", "provider", "brevo", "message", "status"], article("Prepare and review company communications without treating provider acceptance as delivery.", ["Choose Compose, Sent / Delivery History, or provider status in the Email / SMS workspace.", "Select an eligible document only when its immutable attachment path is available.", "Use Preview / Review, then Confirm & Send only after a human reviews the message.", "Reconcile unresolved delivery history before starting another attempt when the workspace requires it."], { important: ["Provider credentials remain server-side.", "Accepted is not the same as delivered, and SMS is not presented as ready without provider-backed QA."], recovery: ["Use Sent / Delivery History to reconcile accepted, delivered, failed, or unknown outcomes."], relatedTopicIds: ["documents", "document-version-history", "troubleshooting-recovery"] })),
  topic("documents", "documents", "Documents", "Search permission-approved document records and artifacts, then continue to the authoritative owning workflow.", "Documents is an access/index surface rather than a second business-document register. Source evidence and Engineering revisions remain owned by their canonical domains.", "documents", ["documents", "document", "files", "artifacts", "purchase order", "client invoice", "supplier invoice", "source", "issued", "origin"], article("Find document-bearing records without duplicating business-record ownership.", ["Use Library search and filters to find the permitted document or artifact.", "Open the owning record for business actions, lifecycle, or source context.", "Use Preview, Delivery History, or Compose when those actions are available for the record."], { important: ["Documents does not become a second canonical financial, engineering, or delivery register."], relatedTopicIds: ["document-version-history", "communications", "engineering-documents"] })),
  topic("document-version-history", "documents", "Document previews and version history", "Open permitted files and understand immutable managed-document versions.", "Managed document versions retain immutable file metadata and history; authorized users add a new version instead of replacing old bytes.", "documents", ["document", "version", "history", "preview", "download", "immutable", "managed", "artifact"], article("Review a document's current version and retained history.", ["Open the document detail from the Documents Library.", "Review the current version, source/origin, and version history.", "Use a deliberate new-version or archive action only when the permission and document state allow it."], { important: ["Old version bytes and immutable history are not silently replaced or deleted."], recovery: ["If a preview or retrieval is unavailable, keep the capability state visible and use the safe retry or owning workflow action."], relatedTopicIds: ["documents", "communications", "troubleshooting-recovery"] })),
  topic("settings", "settings-access", "Workspace settings", "Manage regional workspace preferences such as currency and timezone behavior where supported.", "Settings contains the current workspace regional preferences, such as currency and timezone behavior where supported.", "settings", ["settings", "preferences", "currency", "timezone", "regional", "workspace"], article("Understand the workspace settings available to the current deployment.", ["Open Settings from the workspace account/navigation area.", "Review the current regional values and any unavailable-state message.", "Save only the settings your current access profile is permitted to manage."], { important: ["Settings changes do not grant company access or change role permissions."], relatedTopicIds: ["company-access", "troubleshooting-recovery"] })),
  topic("company-access", "settings-access", "Company access and member permissions", "Authorize exact company members and understand effective roles and permission overrides.", "A Company Admin authorizes an exact email for this deployment. Roles are presets; explicit GRANT and DENY overrides remain company-bound, and pending access is Awaiting signup.", "settings", ["access", "member", "permission", "role", "grant", "deny", "invite", "authorization", "awaiting signup", "suspend", "revoke"], article("Manage company access without confusing an invitation, signup, role, or permission override.", ["Open Company Access from Settings when the current permission allows it.", "Authorize the exact email and review the member's effective access.", "Use roles as templates and explicit overrides only when a deliberate exception is required.", "Review the member's current state before suspension, revocation, or reassignment."], { important: ["Permissions are company-bound and remain enforced by the application and database.", "Awaiting signup is not a claim that an email was delivered."], relatedTopicIds: ["settings", "troubleshooting-recovery"] })),
  topic("procurement-workbook", "procurement", "Procurement workbook review", "Export, inspect, and review RFQ/Purchase Order workbook proposals before any explicit Apply.", "Procurement workbook upload creates typed proposals for review; it never writes records or infers deletion from missing rows.", "procurement", ["procurement", "rfq", "purchase order", "po", "workbook", "excel", "xlsx", "import", "export", "review", "apply"], article("Use the workbook as a review and interchange surface while keeping the procurement workflow authoritative.", ["Export the supported workbook shape from Procurement.", "Review validation, protected fields, stale state, missing rows, and unsupported new rows after upload.", "Confirm the reviewed proposal explicitly before Apply, when your permission allows it."], { important: ["Upload is proposal-only; missing workbook rows do not delete records.", "Lifecycle, receiving, settlement, protected fields, and history remain outside ordinary workbook edits."], recovery: ["Refresh before review or Apply when the workbook reports stale/conflicting state."], relatedTopicIds: ["procurement-lifecycle", "project-costing", "worksheet-tips"] })),
  topic("procurement-lifecycle", "procurement", "RFQ, Purchase Orders, and receiving", "Keep draft editing, comparison, issue, approval, receiving, close, and settlement as deliberate procurement workflows.", "RFQ and Purchase Order drafts can be edited through bounded worksheets, but comparison, approval, issue, receiving, close, matching, and settlement remain explicit workflows.", "procurement", ["procurement", "rfq", "purchase order", "quotation", "approval", "issue", "receive", "close", "matching", "settlement"], article("Move a procurement record through its current lifecycle without treating draft editing as approval or receipt.", ["Edit permitted draft fields and lines, then save the draft explicitly.", "Use comparison or quotation selection before issuing a procurement record.", "Use approval, issue, receiving, close, invoice matching, and settlement actions in their own workflow states."], { important: ["A worksheet cannot approve, issue, receive, close, cancel, match, or settle a Purchase Order by itself."], relatedTopicIds: ["procurement-workbook", "warehouse-inventory", "settlements-transfers"] })),
  topic("warehouse-inventory", "warehouse-equipment", "Warehouse inventory", "Review stock and custody derived from authoritative movements, receiving, issue, return, and allocation workflows.", "Warehouse quantity and custody are derived from authoritative movements. The register does not perform valuation or automatic procurement posting.", "warehouse", ["warehouse", "inventory", "stock", "movement", "receive", "issue", "return", "custody", "quantity"], article("Find inventory items and understand where stock quantity comes from.", ["Search the warehouse item register and review current movement-derived values.", "Use receiving, issue, return, adjustment, and project-allocation workflows for movement changes.", "Open movement history when source or custody context is needed."], { important: ["Current stock is not a destructive balance edit and is not automatically valued by this surface."], relatedTopicIds: ["procurement-lifecycle", "equipment-lifecycle", "worksheet-tips"] })),
  topic("equipment-lifecycle", "warehouse-equipment", "Equipment lifecycle and assignments", "Maintain canonical equipment identity while keeping assignment, transfer, return, lifecycle, and history actions explicit.", "Equipment has one canonical company identity; current state and assignment history remain auditable lifecycle context.", "equipment", ["equipment", "asset", "canonical", "assignment", "transfer", "return", "maintenance", "out of service", "retired", "lifecycle"], article("Find an asset and use the correct metadata or lifecycle workflow.", ["Search the Equipment Registry for the canonical asset.", "Edit safe descriptive metadata through the worksheet when permitted.", "Use assign, transfer, return, maintenance, out-of-service, or retired actions deliberately."], { important: ["Daily Site Log observations do not rewrite formal equipment assignment history."], relatedTopicIds: ["warehouse-inventory", "daily-site-logs", "project-assignments"] })),
  topic("vendor-identity", "vendors", "Vendor identity and maintenance", "Review canonical vendors separately from supplier-invoice evidence and resolve identity deliberately.", "Imported or extracted identity is evidence; canonical Vendor identity remains a controlled company master record.", "vendors", ["vendor", "vendors", "supplier", "identity", "canonical", "resolve", "extracted", "tax id", "duplicate"], article("Maintain canonical Vendor records without rewriting extracted supplier evidence.", ["Search the Vendor directory for the canonical company record.", "Review duplicate or identity-resolution signals before saving a maintenance change.", "Keep Supplier Invoice extracted text as evidence rather than copying it into canonical identity without review."], { important: ["Vendor identity, supplier-invoice evidence, payable truth, and settlement history remain distinct."], relatedTopicIds: ["invoice-review", "company-access"] })),
  topic("troubleshooting-recovery", "troubleshooting", "Validation, stale state, provider, and recovery", "Understand the next safe action when validation, stale data, provider, permission, or retrieval state blocks a workflow.", "A blocked or uncertain state remains visible until the current record is refreshed, reconciled, or returned to its owning workflow.", "dashboard", ["troubleshooting", "validation", "stale", "conflict", "provider", "recovery", "error", "retry", "refresh", "permission"], article("Recover safely without implying that a failed or uncertain mutation completed.", ["Read the visible blocking message and identify whether it is validation, stale/conflict, permission, provider, or retrieval state.", "Use the offered retry, refresh, return, or reconciliation action rather than repeating a consequential submission blindly.", "Confirm the refreshed record before continuing or starting another attempt."], { important: ["A failed or unknown provider/database result is not treated as a confirmed mutation."], recovery: ["If entered work remains staged, keep it visible while resolving the blocking state."], relatedTopicIds: ["invoice-corrections", "expense-corrections", "cash-corrections", "communications"] })),
  topic("worksheet-tips", "worksheet-tips", "Keyboard, worksheet, import/export, and responsive tips", "Use shared worksheet conventions while keeping Save, Apply, lifecycle, and protected fields deliberate.", "Worksheet surfaces support bounded keyboard and paste behavior, but protected fields and consequential actions remain parent-owned workflows.", "projects", ["keyboard", "worksheet", "excel", "xlsx", "csv", "import", "export", "paste", "responsive", "mobile", "save", "apply"], article("Understand the interaction conventions shared by supported worksheet surfaces.", ["Use Tab or the supported keyboard movement to move between editable cells.", "Paste only the supported bounded range; protected cells, rows, and columns remain unchanged.", "Save or Apply deliberately after reviewing validation, dirty, and stale/conflict state.", "On phone and tablet, use the row/field fallback when a wide grid is not practical."], { important: ["Add Row is domain-controlled and Add Column never changes SQL schema.", "Worksheet editing does not approve, issue, settle, receive, finalize, or otherwise post a consequential workflow."], relatedTopicIds: ["procurement-workbook", "project-costing", "expenses", "troubleshooting-recovery"] })),
]);

export const HELP_ROUTE_REGISTRY: Readonly<Record<RouteId, HelpRouteRegistryEntry>> = Object.freeze({
  dashboard: { routeId: "dashboard", topicId: "getting-started" },
  cash: { routeId: "cash", topicId: "cash-banking" },
  projects: { routeId: "projects", topicId: "project-costing" },
  procurement: { routeId: "procurement", topicId: "procurement-workbook" },
  warehouse: { routeId: "warehouse", topicId: "warehouse-inventory" },
  equipment: { routeId: "equipment", topicId: "equipment-lifecycle" },
  extract: { routeId: "extract", topicId: "invoice-extraction" },
  invoices: { routeId: "invoices", topicId: "invoice-review" },
  payroll: { routeId: "payroll", topicId: "payroll-readiness" },
  expenses: { routeId: "expenses", topicId: "expenses" },
  vendors: { routeId: "vendors", topicId: "vendor-identity" },
  reports: { routeId: "reports", topicId: "reports" },
  inbox: { routeId: "inbox", topicId: "communications" },
  review: { routeId: "review", topicId: "invoice-review" },
  documents: { routeId: "documents", topicId: "documents" },
  settings: { routeId: "settings", topicId: "company-access" },
});

const TOPICS_BY_ID = new Map<HelpTopicId, HelpTopic>(HELP_TOPICS.map((entry) => [entry.id, entry]));

function normalizedTerms(query: string) {
  return query.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

function scoreTopic(topicEntry: HelpTopic, terms: readonly string[]) {
  if (!terms.length) return 0;
  const title = topicEntry.title.toLowerCase();
  const searchable = [
    topicEntry.title,
    topicEntry.summary,
    topicEntry.assistantDetails,
    topicEntry.article.purpose,
    ...topicEntry.article.steps,
    ...(topicEntry.article.important || []),
    ...(topicEntry.article.recovery || []),
    ...topicEntry.keywords,
  ].join(" ").toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (title === term) score += 12;
    else if (title.startsWith(term)) score += 8;
    else if (topicEntry.keywords.some((keyword) => keyword.toLowerCase() === term)) score += 7;
    else if (topicEntry.keywords.some((keyword) => keyword.toLowerCase().includes(term))) score += 4;
    else if (searchable.includes(term)) score += 1;
    else return 0;
  }
  return score;
}

export function searchHelpTopics(query: string, options: { limit?: number } = {}): HelpTopic[] {
  const terms = normalizedTerms(query);
  if (!terms.length) return [];
  const limit = Math.max(1, Math.min(20, Math.floor(options.limit ?? 5)));
  return HELP_TOPICS
    .map((entry, index) => ({ entry, score: scoreTopic(entry, terms), index }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map((result) => result.entry);
}

export function getHelpTopic(value: unknown): HelpTopic | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return TOPICS_BY_ID.get(normalized as HelpTopicId)
    || HELP_TOPICS.find((entry) => entry.title.toLowerCase() === normalized)
    || searchHelpTopics(normalized, { limit: 1 })[0];
}

export function getDefaultHelpTopic(routeId: RouteId): HelpTopic | undefined {
  return getHelpTopic(HELP_ROUTE_REGISTRY[routeId]?.topicId);
}

export function helpTopicPath(topicId?: string): string {
  return topicId ? `/help?topic=${encodeURIComponent(topicId)}` : "/help";
}
