import { demoPathForReviewInvoice, demoPathForTab } from "../src/demo/demoRouting.ts";
import { MARKETING_INVOICE_IDS } from "../src/demo/data/marketingWorkspace.ts";

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
