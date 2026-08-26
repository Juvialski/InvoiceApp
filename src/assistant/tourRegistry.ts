import { getRouteDefinition, type RouteId } from "../utils/routes.ts";
import { BRAND } from "../config/brand.ts";

export const ASSISTANT_TOUR_IDS = [
  "invoiceapp-overview",
  "cash-banking",
  "first-invoice",
  "gmail-import",
  "projects-costing",
  "payroll-basics",
  "attendance-overtime",
  "payroll-run",
  "reports",
  "assistant-basics",
] as const;
export type AssistantTourId = (typeof ASSISTANT_TOUR_IDS)[number];

export const ASSISTANT_DATA_TOUR_TARGETS = [
  "assistant-launcher",
  "assistant-panel",
  "assistant-message-list",
  "assistant-quick-start",
  "assistant-composer",
  "assistant-attach",
  "assistant-send",
  "assistant-action-card",
] as const;
export type AssistantDataTourTarget = (typeof ASSISTANT_DATA_TOUR_TARGETS)[number];

export const ROUTE_TOUR_TARGETS = [
  "route:dashboard",
  "route:cash",
  "route:projects",
  "route:extract",
  "route:invoices",
  "route:review",
  "route:payroll",
  "route:expenses",
  "route:reports",
  "route:inbox",
  "route:settings",
] as const;
export type RouteTourTarget = (typeof ROUTE_TOUR_TARGETS)[number];
export type AssistantTourTarget = AssistantDataTourTarget | RouteTourTarget;

export interface AssistantTourStep {
  id: string;
  title: string;
  body: string;
  target: AssistantTourTarget;
  routeId?: RouteId;
}

export interface AssistantTour {
  id: AssistantTourId;
  title: string;
  summary: string;
  steps: readonly AssistantTourStep[];
}

const assistantStep = (id: string, title: string, body: string, target: AssistantDataTourTarget): AssistantTourStep => ({ id, title, body, target });
const routeStep = (id: string, title: string, body: string, routeId: RouteId): AssistantTourStep => ({ id, title, body, target: `route:${routeId}` as RouteTourTarget, routeId });

export const TOUR_REGISTRY: Readonly<Record<AssistantTourId, AssistantTour>> = Object.freeze({
  "invoiceapp-overview": {
    id: "invoiceapp-overview",
    title: `${BRAND.productName} overview`,
    summary: "See how invoices, projects, payroll, Gmail intake, and reports fit together.",
    steps: [
      routeStep("overview-dashboard", "Start at the dashboard", "Use the dashboard for the current cost and operations picture.", "dashboard"),
      routeStep("overview-invoices", "Work with invoices", "Extract new invoices, review AI results, and keep verified invoice records together.", "invoices"),
      routeStep("overview-reports", "Finish with reports", "Reports bring invoice, project, expense, and payroll information together for review.", "reports"),
      assistantStep("overview-assistant", "Ask for help", `Open ${BRAND.assistantName} whenever you need a verified feature explanation or a safe navigation shortcut.`, "assistant-panel"),
    ],
  },
  "cash-banking": {
    id: "cash-banking",
    title: "Explore Cash & Banking",
    summary: "Understand financial accounts, balances, transactions, and reconciliation.",
    steps: [
      routeStep("cash-overview", "Open Cash & Banking", "Cash & Banking is the central place to monitor bank accounts, e-wallets, and petty cash.", "cash"),
      routeStep("cash-reconciliation", "Reconciliation and freshness", "Review balances, import bank statements, and match transactions with confidence.", "cash"),
    ],
  },
  "first-invoice": {
    id: "first-invoice",
    title: "Process your first invoice",
    summary: "Extract an invoice, review the result, and return to the invoice directory.",
    steps: [
      routeStep("first-invoice-extract", "Upload for extraction", "Start from Extract to upload a PDF or supported image for AI extraction.", "extract"),
      routeStep("first-invoice-review", "Review before trusting it", "Use the Review Queue to verify fields and preserve the source context.", "review"),
      routeStep("first-invoice-directory", "Find the saved record", "The Invoices directory is the place to reopen verified invoice records.", "invoices"),
    ],
  },
  "gmail-import": {
    id: "gmail-import",
    title: "Import from Gmail",
    summary: "Use Gmail read-only intake to find messages and bring invoice sources into review.",
    steps: [
      routeStep("gmail-inbox", "Open Gmail Inbox", "Connect Gmail with read-only access, scan messages, and choose what to import.", "inbox"),
      routeStep("gmail-review", "Review imported invoices", "Imported sources still go through the normal invoice review flow.", "review"),
    ],
  },
  "projects-costing": {
    id: "projects-costing",
    title: "Track project costing",
    summary: "See how invoice allocations, payroll, and expenses contribute to project cost.",
    steps: [
      routeStep("project-workspace", "Open Projects", "Projects keep budgets, supplier invoices, payroll allocations, and direct expenses together.", "projects"),
      routeStep("project-reports", "Review project reports", "Use Reports for a cross-project view of budget and actual cost.", "reports"),
    ],
  },
  "payroll-basics": {
    id: "payroll-basics",
    title: "Understand payroll basics",
    summary: "Get oriented around workforce setup, periods, and payroll readiness.",
    steps: [
      routeStep("payroll-workspace", "Open Payroll", "Payroll is where workforce records, periods, runs, attendance, and imports are managed.", "payroll"),
      routeStep("payroll-readiness", "Check readiness", "Review workers, assignments, pay inputs, and the open period before calculating a run.", "payroll"),
    ],
  },
  "attendance-overtime": {
    id: "attendance-overtime",
    title: "Record attendance and overtime",
    summary: "Find the attendance and overtime workflow inside Payroll.",
    steps: [
      routeStep("attendance-payroll", "Open Payroll", "Attendance, leave, holidays, and overtime are kept in the Payroll workspace.", "payroll"),
      routeStep("attendance-ready", "Keep inputs reviewable", "Save source records first, then review how they affect the period before a run is calculated.", "payroll"),
    ],
  },
  "payroll-run": {
    id: "payroll-run",
    title: "Prepare a payroll run",
    summary: "Move from an open period to a calculated run with review gates.",
    steps: [
      routeStep("run-period", "Choose the period", "Start with the correct open payroll period and confirm its date range.", "payroll"),
      routeStep("run-import", "Review imports", "Stage payroll workbook data through the import review flow before committing it.", "payroll"),
      routeStep("run-calculate", "Calculate and review", "Calculate the run, inspect entries and allocations, and keep approval/finalization explicit.", "payroll"),
    ],
  },
  reports: {
    id: "reports",
    title: "Use reports",
    summary: "Find invoice, project, expense, payroll cost, and export views.",
    steps: [
      routeStep("reports-route", "Open Reports", "Reports provide the read-oriented view of operational and financial source records.", "reports"),
      routeStep("reports-project-cost", "Compare project cost", "Use project reporting to compare budget, invoices, payroll, other expenses, and remaining budget.", "reports"),
    ],
  },
  "assistant-basics": {
    id: "assistant-basics",
    title: `Use ${BRAND.assistantName}`,
    summary: "Ask questions, attach bounded source files, and confirm actions deliberately.",
    steps: [
      assistantStep("assistant-panel", "Open the assistant", `This drawer is your workspace for verified ${BRAND.productName} help and safe navigation.`, "assistant-panel"),
      assistantStep("assistant-composer", "Ask a focused question", "Describe the invoice, project, expense, attendance, payroll, report, Gmail, or settings task you need.", "assistant-composer"),
      assistantStep("assistant-attach", "Attach source context", "Attach only supported PDF, image, spreadsheet, CSV, or text files within the size limits.", "assistant-attach"),
      assistantStep("assistant-send", "Review before acting", "The assistant can show references and prepared actions; financial changes always remain confirmation-gated.", "assistant-send"),
    ],
  },
});

export function isRegisteredTourId(value: unknown): value is AssistantTourId {
  return typeof value === "string" && ASSISTANT_TOUR_IDS.includes(value as AssistantTourId);
}

export function isRegisteredTourTarget(value: unknown): value is AssistantTourTarget {
  return typeof value === "string" && (ASSISTANT_DATA_TOUR_TARGETS.includes(value as AssistantDataTourTarget) || ROUTE_TOUR_TARGETS.includes(value as RouteTourTarget));
}

export function getAssistantTour(tourId: unknown) {
  return isRegisteredTourId(tourId) ? TOUR_REGISTRY[tourId] : undefined;
}

export function tourTargetSelector(target: AssistantDataTourTarget) {
  return `[data-tour="${target}"]`;
}

export interface TourRegistryValidation {
  valid: boolean;
  errors: string[];
}

export function validateTourRegistry(registry: Readonly<Record<string, AssistantTour>> = TOUR_REGISTRY): TourRegistryValidation {
  const errors: string[] = [];
  for (const id of ASSISTANT_TOUR_IDS) {
    const tour = registry[id];
    if (!tour) {
      errors.push(`Missing tour: ${id}`);
      continue;
    }
    if (tour.id !== id) errors.push(`Tour id mismatch: ${id}`);
    if (!tour.steps.length) errors.push(`Tour has no steps: ${id}`);
    for (const step of tour.steps) {
      if (!step.id || !step.title || !step.body) errors.push(`Incomplete step: ${id}/${step.id}`);
      if (!isRegisteredTourTarget(step.target)) errors.push(`Unregistered target: ${id}/${step.target}`);
      if (step.routeId && !getRouteDefinition(step.routeId)) errors.push(`Unregistered route: ${id}/${step.routeId}`);
    }
  }
  return { valid: errors.length === 0, errors };
}
