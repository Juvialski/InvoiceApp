import type { AssetId } from "./assets";
import type { SceneTransitionKind } from "../motion/transitions";
import { MOTION_FRAMES } from "../motion/tokens";

export interface SceneBeat {
  readonly assetId: AssetId;
  readonly durationInFrames: number;
  readonly camera?: "restrained-push" | "hero-push";
}

export type SceneStyle = "desktop" | "montage" | "mobile" | "closing";

export interface MarketingScene {
  readonly id: string;
  readonly style: SceneStyle;
  readonly durationInFrames: number;
  readonly kicker: string;
  readonly title: string;
  readonly subtitle: string;
  readonly caption: string;
  readonly beats: readonly SceneBeat[];
  readonly transitionAfter?: SceneTransitionKind;
}

export const SCENES: readonly MarketingScene[] = Object.freeze([
  {
    id: "opening",
    style: "desktop",
    durationInFrames: 150,
    kicker: "ENGINEERING OPERATIONS",
    title: "Engineering work adds up fast.",
    subtitle: "See project and review work at a glance.",
    caption: "A clearer view of the work ahead.",
    beats: [{ assetId: "opening-dashboard", durationInFrames: 150 }],
    transitionAfter: "fade",
  },
  {
    id: "workspace-overview",
    style: "desktop",
    durationInFrames: 150,
    kicker: "ONE WORKSPACE",
    title: "Start with the full picture.",
    subtitle: "Move from the overview into active project work.",
    caption: "Projects and operations in view.",
    beats: [{ assetId: "projects-portfolio", durationInFrames: 150 }],
    transitionAfter: "fade",
  },
  {
    id: "project-controls",
    style: "desktop",
    durationInFrames: 195,
    kicker: "PROJECT CONTROLS",
    title: "Projects. Costs. Progress.",
    subtitle: "Keep scope and cost controls within project context.",
    caption: "Project detail with financial controls.",
    beats: [{ assetId: "project-controls", durationInFrames: 195 }],
    transitionAfter: "fade",
  },
  {
    id: "operations-workbook",
    style: "desktop",
    durationInFrames: 135,
    kicker: "STRUCTURED EDITING",
    title: "A familiar worksheet when you need it.",
    subtitle: "Edit selected project and operating data.",
    caption: "Spreadsheet-style editing, used selectively.",
    beats: [{ assetId: "operations-workbook", durationInFrames: 135 }],
    transitionAfter: "fade",
  },
  {
    id: "supplier-invoice-review",
    style: "desktop",
    durationInFrames: 240,
    kicker: "SOURCE-FIRST REVIEW",
    title: "Review the source beside the details.",
    subtitle: "Check the original document alongside extracted fields.",
    caption: "Human review stays in the workflow.",
    beats: [{ assetId: "supplier-invoice-review", durationInFrames: 240 }],
    transitionAfter: "fade",
  },
  {
    id: "procurement",
    style: "montage",
    durationInFrames: 210,
    kicker: "PROCUREMENT",
    title: "From quotation to purchase order.",
    subtitle: "Compare supplier offers, then follow the order.",
    caption: "RFQs and purchase orders, in view.",
    beats: [
      { assetId: "procurement-rfqs", durationInFrames: 105 },
      { assetId: "purchase-orders", durationInFrames: 105 },
    ],
    transitionAfter: "cut",
  },
  {
    id: "finance-and-operations",
    style: "montage",
    durationInFrames: 450,
    kicker: "FINANCE AND OPERATIONS",
    title: "Everyday finance and operations.",
    subtitle: "Expenses, billing, cash, payroll, and warehouse.",
    caption: "One product across operational workflows.",
    beats: [
      { assetId: "expenses", durationInFrames: 90 },
      { assetId: "client-billing", durationInFrames: 90 },
      { assetId: "cash-banking", durationInFrames: 90 },
      { assetId: "payroll", durationInFrames: 90 },
      { assetId: "warehouse", durationInFrames: 90 },
    ],
    transitionAfter: "fade",
  },
  {
    id: "engineering-records",
    style: "montage",
    durationInFrames: 270,
    kicker: "ENGINEERING RECORDS",
    title: "Keep records close to the project.",
    subtitle: "Documents. RFIs. Site logs.",
    caption: "Project records in their working context.",
    beats: [
      { assetId: "project-documents", durationInFrames: 90 },
      { assetId: "rfis", durationInFrames: 90 },
      { assetId: "site-logs", durationInFrames: 90 },
    ],
    transitionAfter: "fade",
  },
  {
    id: "mobile-support",
    style: "mobile",
    durationInFrames: 150,
    kicker: "DESKTOP AND MOBILE",
    title: "From desk to site.",
    subtitle: "Move between a full desktop view and mobile workflow.",
    caption: "A mobile view for field work.",
    beats: [
      { assetId: "site-logs", durationInFrames: 150 },
      { assetId: "mobile-site-logs", durationInFrames: 150 },
    ],
    transitionAfter: "fade",
  },
  {
    id: "closing",
    style: "closing",
    durationInFrames: 210,
    kicker: "HYDROQUALISENSE",
    title: "HydroQualiSense",
    subtitle: "Engineering operations, simplified.",
    caption: "",
    beats: [{ assetId: "closing-projects", durationInFrames: 210 }],
  },
]);

export function getCommercialDurationInFrames(scenes: readonly MarketingScene[] = SCENES): number {
  const sequenceFrames = scenes.reduce((sum, scene) => sum + scene.durationInFrames, 0);
  const overlaps = scenes.slice(0, -1).reduce((sum, scene) => {
    return sum + (scene.transitionAfter && scene.transitionAfter !== "cut" ? MOTION_FRAMES.transition : 0);
  }, 0);
  return sequenceFrames - overlaps;
}

export const COMMERCIAL_DURATION_IN_FRAMES = getCommercialDurationInFrames();
export const COMMERCIAL_DURATION_SECONDS = COMMERCIAL_DURATION_IN_FRAMES / 30;
