import { appPathForTab } from "../utils/appRouting.ts";
import type { RouteId } from "../utils/routes.ts";
import type { AssistantReference } from "./assistantTypes.ts";
import { BRAND } from "../config/brand.ts";

export type HelpEntryId =
  | "invoice-extraction"
  | "invoice-review"
  | "cash-banking"
  | "project-costing"
  | "engineering-documents"
  | "daily-site-logs"
  | "blueprint-revisions"
  | "redline-annotations"
  | "drawing-disciplines"
  | "expenses"
  | "attendance-overtime"
  | "payroll-readiness"
  | "payroll-runs-imports"
  | "reports"
  | "gmail-import"
  | "settings";

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
