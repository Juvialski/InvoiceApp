export interface NarrationBeat {
  readonly sceneId: string;
  readonly line: string;
}

/** Final recording script. The visual masters remain silent until a reviewed voice track is imported. */
export const TAGLISH_NARRATION: readonly NarrationBeat[] = Object.freeze([
  { sceneId: "opening", line: "Sa engineering projects, maraming kailangang sabay-sabay bantayan." },
  { sceneId: "workspace-overview", line: "Sa HydroQualiSense, magkakasama ang mga project at review status." },
  { sceneId: "project-controls", line: "Buksan ang project para makita ang scope, budget, at cost records." },
  { sceneId: "operations-workbook", line: "May spreadsheet-style editing para sa piling records." },
  { sceneId: "supplier-invoice-review", line: "Magkatabi ang supplier invoice at extracted details. Suriin muna bago kumpirmahin." },
  { sceneId: "procurement", line: "Ihambing ang quotations, at sundan ang purchase order sa bawat hakbang." },
  { sceneId: "finance-and-operations", line: "Tingnan ang expenses at client billing. Subaybayan ang cash records, payroll, at warehouse. May sariling review at approval ang bawat workflow." },
  { sceneId: "engineering-records", line: "Nasa project din ang documents, RFIs, at site logs, para madaling balikan ang mga detalye." },
  { sceneId: "mobile-support", line: "Malawak na view sa desktop. Mobile view para sa site." },
  { sceneId: "closing", line: "HydroQualiSense. Engineering operations, simplified." },
]);
