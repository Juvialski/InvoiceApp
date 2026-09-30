export interface NarrationBeat {
  readonly sceneId: string;
  readonly line: string;
}

/** Provisional natural Taglish direction; narration is not included in the MKT-V3A silent draft. */
export const TAGLISH_NARRATION: readonly NarrationBeat[] = Object.freeze([
  { sceneId: "opening", line: "Sa engineering projects, maraming kailangang sabay-sabay bantayan." },
  { sceneId: "workspace-overview", line: "Sa HydroQualiSense, kita ang project work at review status sa isang workspace." },
  { sceneId: "project-controls", line: "Nasa project context ang scope at cost controls." },
  { sceneId: "operations-workbook", line: "Kapag kailangan, may familiar spreadsheet-style editing para sa selected operational data." },
  { sceneId: "supplier-invoice-review", line: "I-check ang original supplier invoice kasabay ng extracted details." },
  { sceneId: "procurement", line: "I-compare ang quotations at sundan ang order workflow." },
  { sceneId: "finance-and-operations", line: "Kasama ang tools para sa expenses, billing, cash, payroll, at warehouse." },
  { sceneId: "engineering-records", line: "Documents, RFIs, at site logs stay close sa project." },
  { sceneId: "mobile-support", line: "Desktop para sa full view. Mobile workflow para sa field." },
  { sceneId: "closing", line: "HydroQualiSense. Engineering operations, simplified." },
]);
