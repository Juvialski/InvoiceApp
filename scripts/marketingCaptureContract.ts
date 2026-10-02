import { demoPathForReviewInvoice, demoPathForTab } from "../src/demo/demoRouting.ts";
import { appPathForEmailWorkspace } from "../src/utils/appRouting.ts";
import { DEMO_PROJECT_IDS } from "../src/demo/data/projects.ts";
import { MARKETING_INVOICE_IDS, MARKETING_PROJECT_IDS } from "../src/demo/data/marketingWorkspace.ts";
import { demoAssistantPath, demoPathForAppPath, demoPathForProject } from "../src/demo/demoRouting.ts";

export const MARKETING_CAPTURE_DEFAULT_URL = "http://127.0.0.1:4178" as const;
export const MARKETING_CAPTURE_FIXED_TIME = "2026-09-29T04:00:00.000Z" as const;

export interface MarketingCaptureRoute {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly frame: string;
}

export interface MarketingCaptureProfile {
  readonly id: "desktop" | "vertical";
  readonly viewport: Readonly<{ width: number; height: number }>;
  readonly deviceScaleFactor: number;
  readonly videoSize: Readonly<{ width: number; height: number }>;
}

export type MarketingV2ADataset = "MKT-V1A Silverfern fictional workspace" | "Standard public synthetic demo";

export interface MarketingV2ACaptureShot {
  readonly id: string;
  readonly label: string;
  readonly path: string;
  readonly fileStem: string;
  readonly dataset: MarketingV2ADataset;
  readonly claimBoundary: string;
  readonly verticalStill: boolean;
  readonly preparation?: "procurement-rfqs" | "procurement-purchase-orders";
}

export interface MarketingV2AProfile {
  readonly id: "pc-1080p" | "vertical-stills";
  readonly viewport: Readonly<{ width: number; height: number }>;
  readonly deviceScaleFactor: number;
  readonly videoSize?: Readonly<{ width: number; height: number }>;
  readonly stableHoldMs: number;
}

export const MARKETING_CAPTURE_PROFILES: readonly MarketingCaptureProfile[] = Object.freeze([
  {
    id: "desktop",
    viewport: Object.freeze({ width: 1440, height: 900 }),
    deviceScaleFactor: 1,
    videoSize: Object.freeze({ width: 1440, height: 900 }),
  },
  {
    id: "vertical",
    viewport: Object.freeze({ width: 540, height: 960 }),
    deviceScaleFactor: 2,
    videoSize: Object.freeze({ width: 1080, height: 1920 }),
  },
]);

export const MARKETING_V2A_OUTPUT_DIRECTORY = "mkt-v2a-full-app" as const;
export const MARKETING_V2A_STABLE_HOLD_MS = 7_000 as const;

export const MARKETING_V2A_PROFILES: readonly MarketingV2AProfile[] = Object.freeze([
  {
    id: "pc-1080p",
    viewport: Object.freeze({ width: 1920, height: 1080 }),
    deviceScaleFactor: 2,
    videoSize: Object.freeze({ width: 1920, height: 1080 }),
    stableHoldMs: MARKETING_V2A_STABLE_HOLD_MS,
  },
  {
    id: "vertical-stills",
    viewport: Object.freeze({ width: 540, height: 960 }),
    deviceScaleFactor: 2,
    stableHoldMs: 0,
  },
]);

const SILVERFERN_DATASET: MarketingV2ADataset = "MKT-V1A Silverfern fictional workspace";
const PUBLIC_DEMO_DATASET: MarketingV2ADataset = "Standard public synthetic demo";
const DEMO_SHOWCASE_PROJECT_ID = DEMO_PROJECT_IDS.warehouse;

export function buildMarketingV2ACaptureShots(): readonly MarketingV2ACaptureShot[] {
  const demoProject = (view: Parameters<typeof demoPathForProject>[1]) => demoPathForProject(DEMO_SHOWCASE_PROJECT_ID, view);
  const emailPath = (view: Parameters<typeof appPathForEmailWorkspace>[0]) => demoPathForAppPath(appPathForEmailWorkspace(view));
  const silverfern = (shot: Omit<MarketingV2ACaptureShot, "dataset">) => ({ ...shot, dataset: SILVERFERN_DATASET });
  const publicDemo = (shot: Omit<MarketingV2ACaptureShot, "dataset">) => ({ ...shot, dataset: PUBLIC_DEMO_DATASET });

  return Object.freeze([
    silverfern({ id: "00-opening-dashboard", label: "Opening / workspace overview", path: demoPathForTab("dashboard"), fileStem: "00-opening-dashboard", claimBoundary: "No company performance, adoption, or savings claim.", verticalStill: true }),
    publicDemo({ id: "00-dashboard-breadth", label: "Dashboard / operating attention", path: demoPathForTab("dashboard"), fileStem: "00-dashboard-breadth", claimBoundary: "A sample overview only; no real performance metrics or adoption claim.", verticalStill: false }),
    silverfern({ id: "01-projects-portfolio", label: "Projects portfolio", path: demoPathForTab("projects"), fileStem: "01-projects-portfolio", claimBoundary: "Contract value and project budget remain distinct; the Silverfern company and records are fictional.", verticalStill: true }),
    silverfern({ id: "02-water-treatment-project", label: "Water-treatment project controls", path: demoPathForProject(MARKETING_PROJECT_IDS.clark), fileStem: "02-water-treatment-project", claimBoundary: "Silverfern project and all visible project records are fictional.", verticalStill: true }),
    publicDemo({ id: "03-project-overview", label: "Project overview and cost controls", path: demoProject("overview"), fileStem: "03-project-overview", claimBoundary: "Synthetic sample project context only.", verticalStill: false }),
    publicDemo({ id: "04-project-budget", label: "Project budget and cost summary", path: demoProject("budget"), fileStem: "04-project-budget", claimBoundary: "A sample view, not verified project performance or a guarantee of cost accuracy.", verticalStill: false }),
    publicDemo({ id: "05-client-billing", label: "Project client billing", path: demoProject("billing"), fileStem: "05-client-billing", claimBoundary: "Billing records are synthetic; no tax or collections-compliance claim.", verticalStill: false }),
    publicDemo({ id: "06-project-documents", label: "Project engineering documents", path: demoProject("documents"), fileStem: "06-project-documents", claimBoundary: "Shows the demo project document workflow; does not claim complete artifact aggregation.", verticalStill: false }),
    publicDemo({ id: "07-rfis", label: "Requests for information", path: demoProject("rfis"), fileStem: "07-rfis", claimBoundary: "Synthetic coordination records only.", verticalStill: false }),
    publicDemo({ id: "08-submittals", label: "Engineering submittals", path: demoProject("submittals"), fileStem: "08-submittals", claimBoundary: "Synthetic review history only; no engineering approval or compliance claim.", verticalStill: false }),
    publicDemo({ id: "08-materials-equipment", label: "Project materials and equipment", path: demoProject("materials-equipment"), fileStem: "08-materials-equipment", claimBoundary: "Sample project allocations; warehouse stock remains represented by recorded movements.", verticalStill: false }),
    silverfern({ id: "09-supplier-invoice-source-review", label: "Supplier invoice source review", path: demoPathForReviewInvoice(MARKETING_INVOICE_IDS.boosterPump), fileStem: "09-supplier-invoice-source-review", claimBoundary: "Fictional preloaded review data; no extraction-quality, tax, or provider-runtime claim.", verticalStill: true }),
    publicDemo({ id: "10-supplier-invoices", label: "Supplier invoices", path: demoPathForTab("invoices"), fileStem: "10-supplier-invoices", claimBoundary: "Synthetic supplier records; no extraction-quality or compliance claim.", verticalStill: false }),
    publicDemo({ id: "11-review-queue", label: "Review queue", path: demoPathForTab("review"), fileStem: "11-review-queue", claimBoundary: "Review remains a deliberate human workflow; no automatic approval claim.", verticalStill: false }),
    publicDemo({ id: "11-extract-invoice", label: "Invoice extraction workspace", path: demoPathForTab("extractor"), fileStem: "11-extract-invoice", claimBoundary: "The screen does not certify extraction accuracy, model performance, or a live provider connection.", verticalStill: false }),
    silverfern({ id: "12-expenses", label: "Expenses and linked supplier source", path: demoPathForTab("expenses"), fileStem: "12-expenses", claimBoundary: "Pending source invoices remain separate from authoritative Expense cost.", verticalStill: false }),
    silverfern({ id: "13-procurement-rfqs", label: "Procurement / requests for quotation", path: demoPathForTab("procurement"), fileStem: "13-procurement-rfqs", claimBoundary: "Quotation comparisons are synthetic; no supplier endorsement or savings claim.", verticalStill: true, preparation: "procurement-rfqs" }),
    silverfern({ id: "14-procurement-purchase-orders", label: "Procurement / purchase orders", path: demoPathForTab("procurement"), fileStem: "14-procurement-purchase-orders", claimBoundary: "Issued purchase orders are commitments; draft orders are not committed cost.", verticalStill: false, preparation: "procurement-purchase-orders" }),
    silverfern({ id: "15-operations-workbook", label: "Operations Workbook", path: demoPathForTab("workbook"), fileStem: "15-operations-workbook", claimBoundary: "Five current supported sheets; not full Excel parity or a formula engine.", verticalStill: false }),
    publicDemo({ id: "16-cash-banking", label: "Cash and banking", path: demoPathForTab("cash"), fileStem: "16-cash-banking", claimBoundary: "Synthetic balances and transactions; no bank connection or settlement certification claim.", verticalStill: false }),
    publicDemo({ id: "17-payroll", label: "Workforce and payroll", path: demoPathForTab("payroll"), fileStem: "17-payroll", claimBoundary: "Synthetic employee and payroll records; no payroll-compliance or payment claim.", verticalStill: false }),
    publicDemo({ id: "18-warehouse", label: "Warehouse inventory", path: demoPathForTab("warehouse"), fileStem: "18-warehouse", claimBoundary: "Sample stock and recorded movements; no live warehouse-device connection claim.", verticalStill: false }),
    publicDemo({ id: "18-equipment", label: "Equipment register", path: demoPathForTab("equipment"), fileStem: "18-equipment", claimBoundary: "Synthetic equipment registry and assignment state only.", verticalStill: false }),
    publicDemo({ id: "19-site-logs", label: "Daily site logs", path: demoProject("site-logs"), fileStem: "19-site-logs", claimBoundary: "Synthetic field notes; no safety or project-completion certification claim.", verticalStill: true }),
    publicDemo({ id: "20-documents", label: "Documents workspace", path: demoPathForTab("documents"), fileStem: "20-documents", claimBoundary: "Shows the recorded demo document scope; canonical source ownership remains with the source record.", verticalStill: true }),
    publicDemo({ id: "21-email-compose", label: "Email / SMS reviewed composition", path: emailPath("compose"), fileStem: "21-email-compose", claimBoundary: "Capture shows a reviewed composition surface only; no provider-backed send is performed or certified.", verticalStill: false }),
    publicDemo({ id: "22-email-history", label: "Email / SMS delivery history", path: emailPath("sent"), fileStem: "22-email-history", claimBoundary: "Synthetic history only; no live delivery or provider certification claim.", verticalStill: false }),
    publicDemo({ id: "23-sms-status", label: "SMS readiness and history", path: emailPath("sms"), fileStem: "23-sms-status", claimBoundary: "Provider readiness is environment-specific; no SMS is sent during capture.", verticalStill: false }),
    publicDemo({ id: "24-reports", label: "Reports", path: demoPathForTab("reports"), fileStem: "24-reports", claimBoundary: "Sample report views only; no measured company outcomes or performance percentages.", verticalStill: false }),
    publicDemo({ id: "25-vendors", label: "Vendors", path: demoPathForTab("vendors"), fileStem: "25-vendors", claimBoundary: "Fictional supplier records; no real vendor affiliation or endorsement.", verticalStill: false }),
    publicDemo({ id: "26-assistant", label: "Assistant workspace", path: demoAssistantPath(), fileStem: "26-assistant", claimBoundary: "The public demo uses local showcase interactions; this is not evidence of live model quality or autonomous actions.", verticalStill: false }),
    silverfern({ id: "99-closing-projects", label: "Closing / project portfolio", path: demoPathForTab("projects"), fileStem: "99-closing-projects", claimBoundary: "Closing frame is real application UI; add campaign titles outside operational records in the later editor.", verticalStill: false }),
  ]);
}

export function assertLocalMarketingCaptureUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Marketing capture preview URL must be a valid local HTTP URL.");
  }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Marketing capture is restricted to a plain 127.0.0.1 preview origin.");
  }
  return url;
}

export function buildMarketingCaptureRoutes(): readonly MarketingCaptureRoute[] {
  return [
    { id: "dashboard", label: "Dashboard / workspace", path: demoPathForTab("dashboard"), frame: "01-dashboard.png" },
    { id: "projects", label: "Projects portfolio", path: demoPathForTab("projects"), frame: "02-projects.png" },
    { id: "workbook", label: "Operations Workbook", path: demoPathForTab("workbook"), frame: "03-workbook-projects.png" },
    { id: "supplier-invoice-review", label: "Supplier Invoice Review", path: demoPathForReviewInvoice(MARKETING_INVOICE_IDS.boosterPump), frame: "15-supplier-invoice-source-review.png" },
    { id: "expenses", label: "Expenses", path: demoPathForTab("expenses"), frame: "13-expenses.png" },
    { id: "procurement", label: "Procurement", path: demoPathForTab("procurement"), frame: "17-procurement-rfqs.png" },
  ];
}
