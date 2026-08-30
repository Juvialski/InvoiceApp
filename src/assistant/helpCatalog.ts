import { appPathForTab } from "../utils/appRouting.ts";
import type { RouteId } from "../utils/routes.ts";
import type { AssistantReference } from "./assistantTypes.ts";
import { BRAND } from "../config/brand.ts";

export type HelpEntryId =
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
  | "gmail-import"
  | "settings"
  | "company-access";

export interface HelpCatalogEntry {
  readonly id: HelpEntryId;
  readonly title: string;
  readonly summary: string;
  readonly details: string;
  readonly routeId: RouteId;
  readonly keywords: readonly string[];
}

export const HELP_CATALOG: readonly HelpCatalogEntry[] = Object.freeze([
  {
    id: "invoice-extraction",
    title: "Invoice extraction",
    summary: "Upload PDF or supported image invoices and review the extracted fields.",
    details: `${BRAND.productName} extracts invoice details, keeps the source context, and sends uncertain results to review before they become trusted records.`,
    routeId: "extract",
    keywords: ["invoice", "extract", "upload", "pdf", "image", "ocr", "capture"],
  },
  {
    id: "invoice-review",
    title: "Invoice review",
    summary: "Verify extracted invoice fields and preserve review history.",
    details: "Use the Review Queue to inspect AI results, compare source values, correct fields, and mark invoices verified when they are ready.",
    routeId: "review",
    keywords: ["invoice", "review", "verify", "queue", "source", "confidence"],
  },
  {
    id: "cash-banking",
    title: "Cash & Banking",
    summary: "Monitor bank accounts, e-wallets, statement imports, transactions, and reconciliation.",
    details: "Cash & Banking tracks financial accounts (such as BDO, BPI, GCash, or petty cash), statement imports, transaction ledgers, balance freshness, and reconciliation against invoices, payroll, and expenses.",
    routeId: "cash",
    keywords: ["cash", "bank", "banking", "account", "balance", "statement", "import", "reconcile", "reconciliation", "gcash", "transfer", "ledger", "freshness"],
  },
  {
    id: "project-costing",
    title: "Project costing",
    summary: "Bring project budgets, invoice allocations, payroll, and direct expenses into one cost view.",
    details: "Projects show the cost picture for each project. Reports can compare budget, confirmed cost, pending commitments, and remaining budget.",
    routeId: "projects",
    keywords: ["project", "cost", "costing", "budget", "allocation", "actual", "supplier"],
  },
  {
    id: "project-lifecycle",
    title: "Project correction and lifecycle",
    summary: "Edit planning details, archive operational projects, and reactivate eligible archived projects.",
    details: "Open Projects to review dependencies before changing a project. Delete is limited to an unused project with no history; projects with operational or financial history are archived instead. An archived project can be reactivated only when it was archived from a non-terminal state.",
    routeId: "projects",
    keywords: ["project", "archive", "archived", "reactivate", "restore", "delete", "unused", "correction", "lifecycle"],
  },
  {
    id: "project-assignments",
    title: "Project worker assignments",
    summary: "Assign workers to projects with effective dates, role, and optional pay overrides.",
    details: "Project assignments are date-ranged workforce sources. An unused assignment can be deleted; an assignment with downstream work or payroll history must be ended with an effective date so history remains intact.",
    routeId: "payroll",
    keywords: ["assignment", "assign", "worker", "project", "end", "effective date", "labor"],
  },
  {
    id: "engineering-documents",
    title: "Engineering Documents & Blueprints",
    summary: "Manage architectural, structural, civil, MEP, and spec sheets with multi-page vector viewing and immutable revision history.",
    details: `${BRAND.productName} provides centralized engineering document control and high-performance blueprint viewing. Drawings, spec sheets, and calculation reports are organized by project and discipline with strict company-level multi-tenancy.`,
    routeId: "projects",
    keywords: ["drawing", "drawings", "blueprint", "blueprints", "document", "documents", "spec", "specification", "engineering", "sheet", "pdf", "cad", "discipline", "viewer"],
  },
  {
    id: "daily-site-logs",
    title: "Daily Site Logs",
    summary: "Record project-scoped field conditions, work progress, crew observations, equipment, delays, safety, and formal history.",
    details: "Daily Site Logs describe what happened on site. Crew and headcount are operational observations only; they never create payroll attendance, timesheets, overtime, or payroll changes.",
    routeId: "projects",
    keywords: ["site", "sites", "log", "logs", "daily", "weather", "crew", "headcount", "equipment", "downtime", "delay", "safety", "field", "progress"],
  },
  {
    id: "blueprint-revisions",
    title: "Blueprint Revisions and Lineage",
    summary: "Track document revisions, upload updated sheets, and preserve immutable revision history.",
    details: "Every drawing revision is immutable once uploaded. The assistant enforces non-destructive invariants: revisions cannot be deleted or destructively altered, ensuring full contractual lineage and audit history.",
    routeId: "projects",
    keywords: ["revision", "revisions", "version", "rev", "lineage", "immutable", "upload", "history", "superseded", "issue", "ifc"],
  },
  {
    id: "redline-annotations",
    title: "Redline Annotations and Markups",
    summary: "Add layered vector markup clouds, callouts, measurements, and text annotations to drawings.",
    details: "Redline annotations operate in normalized page coordinate space [0.0, 1.0], guaranteeing pixel-perfect rendering across zoom levels and high-DPI displays. Annotations support revision-specific markup layers, open/resolved statuses, and physical scale measurements.",
    routeId: "projects",
    keywords: ["redline", "redlines", "annotation", "annotations", "markup", "markups", "cloud", "callout", "measurement", "scale", "konva", "canvas"],
  },
  {
    id: "drawing-disciplines",
    title: "Drawing Discipline Filtering",
    summary: "Filter and organize documents by Architectural, Structural, Civil, MEP, Geotechnical, and General Engineering disciplines.",
    details: "Engineering documents are categorized by standardized AEC disciplines: Architectural (ARCHITECTURAL), Structural (STRUCTURAL), Civil (CIVIL), Mechanical (MECHANICAL), Electrical (ELECTRICAL), Plumbing (PLUMBING), Fire Protection (FIRE_PROTECTION), and Geotechnical (GEOTECHNICAL).",
    routeId: "projects",
    keywords: ["discipline", "disciplines", "architectural", "structural", "civil", "mechanical", "electrical", "plumbing", "mep", "filter", "category"],
  },
  {
    id: "expenses",
    title: "Expenses",
    summary: "Record direct costs such as fuel, transport, permits, meals, and other project expenses.",
    details: "Direct expenses stay separate from supplier invoices and can be associated with projects for costing and reports.",
    routeId: "expenses",
    keywords: ["expense", "direct cost", "fuel", "transport", "permit", "meal"],
  },
  {
    id: "invoice-corrections",
    title: "Invoice corrections",
    summary: "Correct, archive, restore, void, or delete an invoice only through its guarded lifecycle.",
    details: "Invoice correction checks dependencies and confirmed settlement evidence before changing anything. Unused records may be deleted, used records may be voided or archived, and archived records may be restored. A verified invoice still requires the verification permission to void.",
    routeId: "invoices",
    keywords: ["invoice", "correct", "correction", "void", "archive", "restore", "delete", "lifecycle"],
  },
  {
    id: "expense-corrections",
    title: "Expense corrections",
    summary: "Correct direct-expense mistakes without erasing project-cost history.",
    details: "Expense correction checks dependency and settlement evidence. Use delete-unused only when the database confirms there is no history; otherwise use archive for visibility or void to remove the source from active financial cost.",
    routeId: "expenses",
    keywords: ["expense", "correct", "correction", "void", "archive", "restore", "delete", "lifecycle"],
  },
  {
    id: "cash-corrections",
    title: "Cash and banking corrections",
    summary: "Create, correct, reverse, ignore, or return cash transactions to review with an audit reason.",
    details: "Manual uncommitted and unreconciled transactions can be corrected. Imported, provider, reconciled, transfer-linked, or used transactions must be reversed. Ignore and return-to-review are for unresolved reconciliation items and never hide confirmed evidence.",
    routeId: "cash",
    keywords: ["cash", "bank", "transaction", "correct", "correction", "reverse", "ignore", "review", "account"],
  },
  {
    id: "settlements-transfers",
    title: "Settlements and internal transfers",
    summary: "Link payment evidence to invoices or payroll and confirm exact internal transfer pairs.",
    details: "Settlement confirmation is a human-confirmed cash-evidence action, not project cost. Same-currency opposite transactions can be paired as an internal transfer. Reversals retain the original confirmation and require a reason.",
    routeId: "cash",
    keywords: ["settlement", "payment", "disbursement", "match", "split", "reverse", "transfer", "reconcile"],
  },
  {
    id: "attendance-overtime",
    title: "Attendance and overtime",
    summary: "Maintain attendance, leave, holidays, and overtime inputs inside Payroll.",
    details: "Attendance and overtime records are source inputs for payroll readiness. Review them against the open period before calculating a run.",
    routeId: "payroll",
    keywords: ["attendance", "overtime", "leave", "holiday", "time", "workforce"],
  },
  {
    id: "payroll-readiness",
    title: "Payroll readiness",
    summary: "Check workers, assignments, pay inputs, and the open period before a run.",
    details: "Payroll readiness means the correct people, dates, assignments, compensation inputs, attendance, and source imports are present and reviewable.",
    routeId: "payroll",
    keywords: ["payroll", "ready", "readiness", "worker", "period", "compensation", "assignment"],
  },
  {
    id: "payroll-runs-imports",
    title: "Payroll runs and imports",
    summary: "Stage workbook imports, review them, calculate runs, and keep approval explicit.",
    details: "Payroll imports are staged for review before commit. Runs can then be calculated and inspected before any approval or finalization step.",
    routeId: "payroll",
    keywords: ["payroll", "run", "calculate", "import", "workbook", "excel", "stage", "commit"],
  },
  {
    id: "workforce-lifecycle",
    title: "Worker correction and lifecycle",
    summary: "Edit worker details, delete an unused worker, or offboard/reactivate a worker with history preserved.",
    details: "Worker deletion is limited to a database-confirmed unused record. Workers with assignments, attendance, work, leave, overtime, payroll, or import history must be offboarded. Offboarding keeps the historical identity and prevents new active workforce activity; eligible workers can be reactivated.",
    routeId: "payroll",
    keywords: ["worker", "employee", "workforce", "edit", "delete", "unused", "offboard", "deactivate", "reactivate", "restore"],
  },
  {
    id: "compensation-components",
    title: "Compensation and recurring payroll components",
    summary: "Maintain effective-dated compensation profiles and recurring earnings, deductions, or employer costs.",
    details: "Compensation setup is effective-dated. New profiles can supersede overlapping setup without rewriting finalized payroll snapshots. Consumed profiles and recurring components must be ended, superseded, or deactivated instead of deleted or rewritten.",
    routeId: "payroll",
    keywords: ["compensation", "salary", "rate", "pay", "component", "earning", "deduction", "employer cost", "effective"],
  },
  {
    id: "reports",
    title: "Reports",
    summary: "Review invoice, project, expense, payroll cost, and export views.",
    details: "Reports provide read-oriented operational and financial summaries, including project cost reporting and workbook export.",
    routeId: "reports",
    keywords: ["report", "reports", "summary", "export", "financial", "payroll cost"],
  },
  {
    id: "gmail-import",
    title: "Gmail read-only import",
    summary: `Scan Gmail read-only messages and choose invoice sources to bring into ${BRAND.productName}.`,
    details: "Gmail intake is read-only. It helps find messages and attachments for invoice processing; it does not send or modify Gmail messages.",
    routeId: "inbox",
    keywords: ["gmail", "email", "inbox", "read-only", "readonly", "import", "message"],
  },
  {
    id: "settings",
    title: "Settings",
    summary: "Manage the regional settings used by the workspace.",
    details: "Settings contains the current workspace regional preferences, such as currency and timezone behavior where supported.",
    routeId: "settings",
    keywords: ["settings", "preferences", "currency", "timezone", "regional"],
  },
  {
    id: "company-access",
    title: "Company access and member permissions",
    summary: "Authorize exact emails, review effective access, and manage role or explicit permission overrides.",
    details: "A Company Admin authorizes an exact email for this deployment. The user signs up and verifies that email before membership is claimed. Roles are presets; explicit GRANT and DENY overrides remain company-bound, and the database protects self-access and the last access-management authority. Pending access is Awaiting signup, not a claim that an email was delivered.",
    routeId: "settings",
    keywords: ["access", "member", "permission", "role", "grant", "deny", "invite", "authorization", "awaiting signup", "suspend", "revoke"],
  },
]);

function normalizedTerms(query: string) {
  return query.toLowerCase().trim().split(/\s+/).filter(Boolean);
}

function scoreEntry(entry: HelpCatalogEntry, terms: readonly string[]) {
  if (!terms.length) return 0;
  const title = entry.title.toLowerCase();
  const searchable = [entry.title, entry.summary, entry.details, ...entry.keywords].join(" ").toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (title === term) score += 12;
    else if (title.startsWith(term)) score += 8;
    else if (entry.keywords.some((keyword) => keyword.toLowerCase() === term)) score += 7;
    else if (entry.keywords.some((keyword) => keyword.toLowerCase().includes(term))) score += 4;
    else if (searchable.includes(term)) score += 1;
    else return 0;
  }
  return score;
}

export function searchHelpCatalog(query: string, options: { limit?: number } = {}): HelpCatalogEntry[] {
  const terms = normalizedTerms(query);
  if (!terms.length) return [];
  const limit = Math.max(1, Math.min(20, Math.floor(options.limit ?? 5)));
  return HELP_CATALOG
    .map((entry, index) => ({ entry, score: scoreEntry(entry, terms), index }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map((result) => result.entry);
}

export const searchHelp = searchHelpCatalog;

export function getHelpEntry(value: unknown): HelpCatalogEntry | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  return HELP_CATALOG.find((entry) => entry.id === normalized || entry.title.toLowerCase() === normalized);
}

export function helpEntryReference(entry: HelpCatalogEntry): AssistantReference {
  return { type: "help", id: entry.id, label: entry.title };
}

export function helpEntryPath(entry: HelpCatalogEntry) {
  return appPathForTab(entry.routeId === "extract" ? "extractor" : entry.routeId === "inbox" ? "inbox" : entry.routeId);
}

export function unknownHelpResponse(query: string) {
  const label = query.trim() ? ` for “${query.trim().slice(0, 80)}”` : "";
  return `I don’t have a verified ${BRAND.productName} help answer${label} yet. I can help with Engineering Documents and blueprints, Daily Site Logs, Cash & Banking, invoice extraction and review, project costing, expenses, attendance and overtime, payroll readiness and runs/imports, reports, Gmail read-only import, or settings.`;
}

export type HelpResponse =
  | { kind: "matches"; matches: HelpCatalogEntry[]; references: AssistantReference[] }
  | { kind: "unknown"; message: string; matches: [] };

export function getHelpResponse(query: string, options: { limit?: number } = {}): HelpResponse {
  const matches = searchHelpCatalog(query, options);
  return matches.length
    ? { kind: "matches", matches, references: matches.map(helpEntryReference) }
    : { kind: "unknown", message: unknownHelpResponse(query), matches: [] };
}
