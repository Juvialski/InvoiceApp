import PizZip from "pizzip";
import {
  DOCX_MIME_TYPE,
  DocumentTemplateValidationError,
  validateDocxTemplateBytes,
} from "./documentTemplateEngine.ts";
import {
  getDocumentTemplateField,
  isDocumentTemplateFieldKey,
  type DocumentTemplateMappingAnalysis,
  type DocumentTemplateType,
} from "../../lib/documentTemplateRegistry.ts";

export type DocumentTemplatePartKind = "DOCUMENT" | "HEADER" | "FOOTER";
export type DocumentTemplateAnchorKind = "PARAGRAPH" | "CELL";

export interface DocumentTemplateAnchor {
  readonly id: string;
  readonly partName: string;
  readonly partKind: DocumentTemplatePartKind;
  readonly kind: DocumentTemplateAnchorKind;
  readonly paragraphIndex: number;
  readonly tableIndex?: number;
  readonly rowIndex?: number;
  readonly cellIndex?: number;
  readonly text: string;
  readonly targetText?: string;
  readonly occurrence: number;
}

export interface DocumentTemplateLineTableColumn {
  readonly columnIndex: number;
  readonly headerText: string;
  readonly suggestedFieldKey?: string;
}

export interface DocumentTemplateLineTableCandidate {
  readonly id: string;
  readonly partName: string;
  readonly partKind: DocumentTemplatePartKind;
  readonly tableIndex: number;
  readonly headerRowIndex: number;
  readonly dataRowIndex?: number;
  readonly columns: readonly DocumentTemplateLineTableColumn[];
  readonly score: number;
}

export interface DocumentTemplateUniqueLineTable extends DocumentTemplateLineTableCandidate {
  readonly status: "UNIQUE";
}

export interface DocumentTemplateAnchorInventory {
  readonly anchors: readonly DocumentTemplateAnchor[];
  readonly lineTableCandidates: readonly DocumentTemplateLineTableCandidate[];
  readonly lineTable?: DocumentTemplateUniqueLineTable;
  readonly warnings: readonly string[];
}

export interface DocumentTemplatePreparationMapping {
  readonly fieldKey: string;
  readonly anchorId: string;
  readonly targetText: string;
  readonly confidence?: number;
  readonly sourceLabel?: string;
  readonly reason?: string;
  readonly confirmed?: boolean;
}

export interface DocumentTemplatePreparationLineColumn {
  readonly columnIndex: number;
  readonly fieldKey: string;
}

export interface DocumentTemplatePreparationLineTable {
  readonly candidateId: string;
  readonly columns: readonly DocumentTemplatePreparationLineColumn[];
}

export interface DocumentTemplatePreparationPlan {
  readonly documentType: DocumentTemplateType;
  readonly mappings: readonly DocumentTemplatePreparationMapping[];
  readonly lineTable?: DocumentTemplatePreparationLineTable;
}

const LINE_HEADER_ALIASES: readonly { readonly fieldKey: string; readonly patterns: readonly RegExp[] }[] = [
  { fieldKey: "lines.lineNumber", patterns: [/^(?:#|no|number|line|item)(?:\.?|\s*(?:no|number))?$/i, /item\s*(?:no|number)/i] },
  { fieldKey: "lines.description", patterns: [/description/i, /item|particular|scope|details?/i] },
  { fieldKey: "lines.quantity", patterns: [/^qty\.?$/i, /quantity/i] },
  { fieldKey: "lines.unit", patterns: [/^uom$/i, /^unit$/i, /unit\s*of\s*measure/i] },
  { fieldKey: "lines.unitPrice", patterns: [/unit\s*price/i, /price/i, /rate/i] },
  { fieldKey: "lines.amount", patterns: [/amount/i, /line\s*total/i, /^total$/i, /extended/i] },
  { fieldKey: "lines.notes", patterns: [/notes?/i, /remarks?/i] },
];

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_match, number) => String.fromCodePoint(Number(number)))
    .replace(/&amp;/g, "&");
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function textFromWordXml(fragment: string): string {
  const pieces = [...fragment.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)].map((match) => decodeXmlText(match[1] || ""));
  const tabs = (fragment.match(/<w:tab\b[^>]*\/?>(?:<\/w:tab>)?/gi) || []).length;
  const breaks = (fragment.match(/<w:br\b[^>]*\/?>(?:<\/w:br>)?/gi) || []).length;
  return pieces.join("") + (tabs ? "\t".repeat(tabs) : "") + (breaks ? "\n".repeat(breaks) : "");
}

function partKind(partName: string): DocumentTemplatePartKind {
  if (/^word\/header\d+\.xml$/i.test(partName)) return "HEADER";
  if (/^word\/footer\d+\.xml$/i.test(partName)) return "FOOTER";
  return "DOCUMENT";
}

function targetTextFor(sourceText: string): string | undefined {
  const text = normalizeText(sourceText);
  if (!text) return undefined;
  const colon = /^(?:[^:]{1,120}):\s*(.+)$/.exec(text);
  if (colon?.[1]?.trim()) return colon[1].trim();
  const tab = /^\S[^\t]{0,120}\t+(.+)$/.exec(sourceText);
  if (tab?.[1]?.trim()) return normalizeText(tab[1]);
  return text;
}

function xmlRanges(xml: string, expression: RegExp): readonly { readonly text: string; readonly start: number; readonly end: number }[] {
  return [...xml.matchAll(expression)].map((match) => ({
    text: match[0] || "",
    start: match.index ?? 0,
    end: (match.index ?? 0) + (match[0] || "").length,
  }));
}

function cellFragments(rowXml: string): readonly string[] {
  return xmlRanges(rowXml, /<w:tc\b[\s\S]*?<\/w:tc>/gi).map((entry) => entry.text);
}

function rowFragments(tableXml: string): readonly string[] {
  return xmlRanges(tableXml, /<w:tr\b[\s\S]*?<\/w:tr>/gi).map((entry) => entry.text);
}

function tableFragments(xml: string): readonly { readonly text: string; readonly start: number; readonly end: number }[] {
  return xmlRanges(xml, /<w:tbl\b[\s\S]*?<\/w:tbl>/gi);
}

function paragraphFragments(xml: string): readonly { readonly text: string; readonly start: number; readonly end: number }[] {
  return xmlRanges(xml, /<w:p\b[\s\S]*?<\/w:p>/gi);
}

function keyForOccurrence(anchor: Pick<DocumentTemplateAnchor, "partName" | "kind" | "text">): string {
  return `${anchor.partName}|${anchor.kind}|${anchor.text}`;
}

function anchorId(anchor: Pick<DocumentTemplateAnchor, "partName" | "kind" | "paragraphIndex" | "tableIndex" | "rowIndex" | "cellIndex">, occurrence: number): string {
  if (anchor.kind === "CELL") {
    return `${anchor.partName}:cell:${anchor.tableIndex}:${anchor.rowIndex}:${anchor.cellIndex}:occurrence:${occurrence}`;
  }
  return `${anchor.partName}:paragraph:${anchor.paragraphIndex}:occurrence:${occurrence}`;
}

function suggestedFieldKey(headerText: string): string | undefined {
  const matches = LINE_HEADER_ALIASES.filter((candidate) => candidate.patterns.some((pattern) => pattern.test(headerText))).map((candidate) => candidate.fieldKey);
  return matches.length === 1 ? matches[0] : undefined;
}

function lineTableCandidate(partName: string, kind: DocumentTemplatePartKind, tableIndex: number, tableXml: string): DocumentTemplateLineTableCandidate | undefined {
  const rows = rowFragments(tableXml).map((rowXml) => cellFragments(rowXml).map((cellXml) => normalizeText(textFromWordXml(cellXml))));
  const candidates = rows.map((row, rowIndex) => {
    const columns = row.map((headerText, columnIndex) => ({ columnIndex, headerText, ...(suggestedFieldKey(headerText) ? { suggestedFieldKey: suggestedFieldKey(headerText) } : {}) }));
    const fieldKeys = new Set(columns.flatMap((column) => column.suggestedFieldKey ? [column.suggestedFieldKey] : []));
    const requiredCount = Number(fieldKeys.has("lines.description")) + Number(fieldKeys.has("lines.amount"));
    return { rowIndex, columns, score: requiredCount * 4 + fieldKeys.size };
  }).filter((candidate) => candidate.score >= 8 && candidate.rowIndex < rows.length - 1);
  const selected = candidates.sort((left, right) => right.score - left.score)[0];
  if (!selected) return undefined;
  const dataRowIndex = selected.rowIndex + 1 < rows.length ? selected.rowIndex + 1 : undefined;
  if (dataRowIndex === undefined) return undefined;
  return {
    id: `${partName}:table:${tableIndex}:header:${selected.rowIndex}`,
    partName,
    partKind: kind,
    tableIndex,
    headerRowIndex: selected.rowIndex,
    dataRowIndex,
    columns: selected.columns,
    score: selected.score,
  };
}

function inspectPart(partName: string, xml: string, anchors: DocumentTemplateAnchor[], lineTables: DocumentTemplateLineTableCandidate[], occurrences: Map<string, number>, warnings: string[]) {
  const kind = partKind(partName);
  const tables = tableFragments(xml);
  tables.forEach((table, tableIndex) => {
    rowFragments(table.text).forEach((rowXml, rowIndex) => {
      cellFragments(rowXml).forEach((cellXml, cellIndex) => {
        const text = normalizeText(textFromWordXml(cellXml));
        if (!text) return;
        const key = keyForOccurrence({ partName, kind: "CELL", text });
        const occurrence = (occurrences.get(key) || 0) + 1;
        occurrences.set(key, occurrence);
        const base = { partName, partKind: kind, kind: "CELL" as const, paragraphIndex: -1, tableIndex, rowIndex, cellIndex, text, occurrence };
        anchors.push({ ...base, id: anchorId(base, occurrence), targetText: targetTextFor(text) });
      });
    });
    const candidate = lineTableCandidate(partName, kind, tableIndex, table.text);
    if (candidate) lineTables.push(candidate);
  });

  const tableRanges = tables.map((table) => [table.start, table.end] as const);
  let paragraphIndex = 0;
  for (const paragraph of paragraphFragments(xml)) {
    const insideTable = tableRanges.some(([start, end]) => paragraph.start >= start && paragraph.end <= end);
    if (insideTable) continue;
    const text = normalizeText(textFromWordXml(paragraph.text));
    if (!text) continue;
    const key = keyForOccurrence({ partName, kind: "PARAGRAPH", text });
    const occurrence = (occurrences.get(key) || 0) + 1;
    occurrences.set(key, occurrence);
    const base = { partName, partKind: kind, kind: "PARAGRAPH" as const, paragraphIndex, text, occurrence };
    anchors.push({ ...base, id: anchorId(base, occurrence), targetText: targetTextFor(text) });
    paragraphIndex += 1;
  }
  if (!tables.length && !paragraphIndex) warnings.push(`No editable text anchors were found in ${partName}.`);
}

export function extractDocumentTemplateAnchorInventory(bytes: Uint8Array, fileName = "template.docx"): DocumentTemplateAnchorInventory {
  const entries = validateDocxTemplateBytes(bytes, fileName, DOCX_MIME_TYPE);
  const zip = new PizZip(bytes, { checkCRC32: true });
  const anchors: DocumentTemplateAnchor[] = [];
  const lineTableCandidates: DocumentTemplateLineTableCandidate[] = [];
  const occurrences = new Map<string, number>();
  const warnings: string[] = [];
  for (const entry of entries.filter((candidate) => /^word\/(?:document|header\d+|footer\d+)\.xml$/i.test(candidate.name))) {
    inspectPart(entry.name, zip.file(entry.name)?.asText() || "", anchors, lineTableCandidates, occurrences, warnings);
  }
  const sortedCandidates = [...lineTableCandidates].sort((left, right) => right.score - left.score);
  const best = sortedCandidates[0];
  const second = sortedCandidates[1];
  const lineTable = best && (!second || best.score > second.score)
    ? { ...best, status: "UNIQUE" as const }
    : undefined;
  if (best && second && best.score === second.score) warnings.push("Multiple line-item tables were equally plausible; choose one manually or use the advanced Word fallback.");
  if (!best) warnings.push("No supported repeating line-item table was confidently identified.");
  return {
    anchors,
    lineTableCandidates: sortedCandidates,
    ...(lineTable ? { lineTable } : {}),
    warnings,
  };
}

export function validateTemplateMappingAnalysisAgainstInventory(
  analysis: DocumentTemplateMappingAnalysis,
  inventory: DocumentTemplateAnchorInventory,
  documentType: DocumentTemplateType,
): { ok: true; analysis: DocumentTemplateMappingAnalysis } | { ok: false; errors: readonly string[] } {
  const errors: string[] = [];
  const usedAnchors = new Set<string>();
  for (const [index, mapping] of analysis.mappings.entries()) {
    if (mapping.unresolved) continue;
    if (!mapping.fieldKey || !isDocumentTemplateFieldKey(documentType, mapping.fieldKey)) {
      errors.push(`mapping ${index + 1} references an unavailable application field.`);
      continue;
    }
    if (!mapping.anchorId) {
      errors.push(`mapping ${index + 1} does not identify a deterministic source anchor.`);
      continue;
    }
    const anchor = inventory.anchors.find((candidate) => candidate.id === mapping.anchorId);
    if (!anchor) {
      errors.push(`mapping ${index + 1} references an unknown source anchor.`);
      continue;
    }
    if (usedAnchors.has(anchor.id)) errors.push(`mapping ${index + 1} duplicates a source anchor that is already mapped.`);
    usedAnchors.add(anchor.id);
    if (!mapping.targetText || !anchor.targetText || mapping.targetText !== anchor.targetText) {
      errors.push(`mapping ${index + 1} no longer matches the uploaded source text.`);
    }
    if (getDocumentTemplateField(documentType, mapping.fieldKey)?.collection) {
      errors.push(`mapping ${index + 1} is a repeating line field and must be mapped through a line table.`);
    }
  }

  const lineTable = analysis.lineTable;
  if (lineTable) {
    if (!lineTable.candidateId) errors.push("The repeating line-table proposal does not identify a deterministic table candidate.");
    const candidate = lineTable.candidateId ? inventory.lineTableCandidates.find((item) => item.id === lineTable.candidateId) : undefined;
    if (!candidate) errors.push("The repeating line-table proposal references an unknown table candidate.");
    if (!inventory.lineTable || inventory.lineTable.id !== lineTable.candidateId) errors.push("The repeating line-item table is ambiguous or no longer uniquely identified.");
    const columns = lineTable.columns || [];
    const usedColumns = new Set<number>();
    for (const [index, column] of columns.entries()) {
      if (usedColumns.has(column.columnIndex)) errors.push(`line-table column ${index + 1} is mapped more than once.`);
      usedColumns.add(column.columnIndex);
      if (!candidate?.columns.some((item) => item.columnIndex === column.columnIndex)) errors.push(`line-table column ${index + 1} is outside the identified table.`);
      if (!isDocumentTemplateFieldKey(documentType, column.fieldKey) || !getDocumentTemplateField(documentType, column.fieldKey)?.collection) errors.push(`line-table column ${index + 1} references an unavailable repeating field.`);
    }
    if (!columns.length) errors.push("The repeating line-table proposal does not contain column mappings.");
  }
  if (analysis.mappings.some((mapping) => mapping.fieldKey?.startsWith("lines.")) && !lineTable) errors.push("Repeating line fields require a uniquely identified line-item table.");
  return errors.length ? { ok: false, errors } : { ok: true, analysis };
}

export class DocumentTemplatePreparationError extends DocumentTemplateValidationError {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DocumentTemplatePreparationError";
    this.code = code;
  }
}
