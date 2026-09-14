import PizZip from "pizzip";
import {
  DOCX_MIME_TYPE,
  DocumentTemplateValidationError,
  extractDocxStructure,
  validateDocxTemplateBytes,
} from "./documentTemplateEngine.ts";
import {
  getDocumentTemplateFieldCatalog,
  getDocumentTemplateField,
  isDocumentTemplateFieldKey,
  tagForDocumentTemplateField,
  validateDocumentTemplateBindings,
  type DocumentTemplateBinding,
  type DocumentTemplateMappingAnalysis,
  type TemplateValidationReport,
  type DocumentTemplateType,
} from "../../lib/documentTemplateRegistry.ts";
import type { DocumentTemplateTypeDefinition } from "../../lib/documentTemplateTypes.ts";

export type DocumentTemplatePartKind = "DOCUMENT" | "HEADER" | "FOOTER";
export type DocumentTemplateAnchorKind = "PARAGRAPH" | "CELL";
export type DocumentTemplateAnchorInsertionMode = "REPLACE" | "AFTER_LABEL" | "ADJACENT_CELL";

export interface DocumentTemplateAnchor {
  readonly id: string;
  readonly partName: string;
  readonly partKind: DocumentTemplatePartKind;
  readonly kind: DocumentTemplateAnchorKind;
  readonly paragraphIndex: number;
  readonly tableIndex?: number;
  readonly rowIndex?: number;
  readonly cellIndex?: number;
  readonly cellParagraphIndex?: number;
  readonly text: string;
  readonly targetText?: string;
  readonly insertionMode?: DocumentTemplateAnchorInsertionMode;
  readonly relatedCellIndex?: number;
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
  readonly repeatSectionKey?: string;
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
  const issuedDate = /^Issued this\s+(.+?)[.]$/i.exec(text);
  if (issuedDate?.[1]?.trim()) return issuedDate[1].trim();
  const leadingColon = /^:\s*(.+)$/.exec(text);
  if (leadingColon?.[1]?.trim()) return leadingColon[1].trim();
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

function anchorId(anchor: Pick<DocumentTemplateAnchor, "partName" | "kind" | "paragraphIndex" | "tableIndex" | "rowIndex" | "cellIndex" | "cellParagraphIndex">, occurrence: number, slot?: string): string {
  const slotSuffix = slot ? `:slot:${slot}` : "";
  if (anchor.kind === "CELL") {
    const paragraphSuffix = anchor.cellParagraphIndex === undefined ? "" : `:paragraph:${anchor.cellParagraphIndex}`;
    return `${anchor.partName}:cell:${anchor.tableIndex}:${anchor.rowIndex}:${anchor.cellIndex}${paragraphSuffix}${slotSuffix}:occurrence:${occurrence}`;
  }
  return `${anchor.partName}:paragraph:${anchor.paragraphIndex}${slotSuffix}:occurrence:${occurrence}`;
}

function suggestedFieldKey(headerText: string, definition?: DocumentTemplateTypeDefinition): string | undefined {
  const normalized = normalizeText(headerText).toLowerCase();
  const dynamicMatches = (definition?.repeatSections || []).flatMap((section) => section.fields
    .filter((field) => normalizeText(field.label).toLowerCase() === normalized || field.key.toLowerCase() === normalized)
    .map((field) => section.key + "." + field.key));
  if (dynamicMatches.length === 1) return dynamicMatches[0];
  const matches = LINE_HEADER_ALIASES.filter((candidate) => candidate.patterns.some((pattern) => pattern.test(headerText))).map((candidate) => candidate.fieldKey);
  return matches.length === 1 ? matches[0] : undefined;
}

function lineTableCandidate(partName: string, kind: DocumentTemplatePartKind, tableIndex: number, tableXml: string, definition?: DocumentTemplateTypeDefinition): DocumentTemplateLineTableCandidate | undefined {
  const rows = rowFragments(tableXml).map((rowXml) => cellFragments(rowXml).map((cellXml) => normalizeText(textFromWordXml(cellXml))));
  const candidates = rows.map((row, rowIndex) => {
    const columns = row.map((headerText, columnIndex) => ({ columnIndex, headerText, ...(suggestedFieldKey(headerText, definition) ? { suggestedFieldKey: suggestedFieldKey(headerText, definition) } : {}) }));
    const fieldKeys = new Set(columns.flatMap((column) => column.suggestedFieldKey ? [column.suggestedFieldKey] : []));
    const repeatSectionKey = definition?.repeatSections.find((section) => [...fieldKeys].some((fieldKey) => fieldKey.startsWith(section.key + ".")))?.key;
    const requiredCount = definition ? Number(Boolean(repeatSectionKey)) : Number(fieldKeys.has("lines.description")) + Number(fieldKeys.has("lines.amount"));
    return { rowIndex, columns, repeatSectionKey, score: requiredCount * 4 + fieldKeys.size };
  }).filter((candidate) => candidate.score >= (definition ? 4 : 8) && candidate.rowIndex < rows.length - 1);
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
    ...(selected.repeatSectionKey ? { repeatSectionKey: selected.repeatSectionKey } : {}),
    columns: selected.columns,
    score: selected.score,
  };
}

function inspectPart(partName: string, xml: string, anchors: DocumentTemplateAnchor[], lineTables: DocumentTemplateLineTableCandidate[], occurrences: Map<string, number>, warnings: string[], definition?: DocumentTemplateTypeDefinition) {
  const kind = partKind(partName);
  const tables = tableFragments(xml);
  tables.forEach((table, tableIndex) => {
    rowFragments(table.text).forEach((rowXml, rowIndex) => {
      const rowCells = cellFragments(rowXml);
      const rowTexts = rowCells.map((cellXml) => normalizeText(textFromWordXml(cellXml)));
      rowCells.forEach((cellXml, cellIndex) => {
        const text = normalizeText(textFromWordXml(cellXml));
        if (!text) return;
        const key = keyForOccurrence({ partName, kind: "CELL", text });
        const occurrence = (occurrences.get(key) || 0) + 1;
        occurrences.set(key, occurrence);
        const colonValueCell = rowTexts[cellIndex + 1] === ":" && rowTexts[cellIndex + 2] !== undefined;
        const relatedCellIndex = colonValueCell ? cellIndex + 2 : (!rowTexts[cellIndex + 1] && /\b(?:total|others|attested|prepared|received)\b/i.test(text) ? cellIndex + 1 : undefined);
        const insertionMode = relatedCellIndex !== undefined ? "ADJACENT_CELL" as const : /^.*:\s*$/.test(text) ? "AFTER_LABEL" as const : undefined;
        const base = { partName, partKind: kind, kind: "CELL" as const, paragraphIndex: -1, tableIndex, rowIndex, cellIndex, text, occurrence };
        anchors.push({ ...base, id: anchorId(base, occurrence), targetText: targetTextFor(text), ...(insertionMode ? { insertionMode } : {}), ...(relatedCellIndex === undefined ? {} : { relatedCellIndex }) });
        const nestedParagraphs = paragraphFragments(cellXml).map((paragraph, nestedIndex) => ({ text: normalizeText(textFromWordXml(paragraph.text)), nestedIndex })).filter((paragraph) => Boolean(paragraph.text));
        if (nestedParagraphs.length > 1) for (const nested of nestedParagraphs) {
          const nestedKey = keyForOccurrence({ partName, kind: "CELL", text: nested.text });
          const nestedOccurrence = (occurrences.get(nestedKey) || 0) + 1;
          occurrences.set(nestedKey, nestedOccurrence);
          const nestedAnchor = { ...base, text: nested.text, occurrence: nestedOccurrence, cellParagraphIndex: nested.nestedIndex };
          anchors.push({ ...nestedAnchor, id: anchorId(nestedAnchor, nestedOccurrence), targetText: targetTextFor(nested.text) });
        }
        const currencyMatch = /\btotal\s*\(([^)]+)\)/i.exec(text);
        if (currencyMatch?.[1]?.trim()) {
          const currencyTarget = currencyMatch[1].trim();
          const currencyKey = keyForOccurrence({ partName, kind: "CELL", text: currencyTarget });
          const currencyOccurrence = (occurrences.get(currencyKey) || 0) + 1;
          occurrences.set(currencyKey, currencyOccurrence);
          anchors.push({ ...base, id: anchorId(base, currencyOccurrence, "currency"), targetText: currencyTarget, insertionMode: "REPLACE", occurrence: currencyOccurrence });
        }
      });
    });
    const candidate = lineTableCandidate(partName, kind, tableIndex, table.text, definition);
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
    const insertionMode = /^.*:\s*$/.test(text) ? "AFTER_LABEL" as const : undefined;
    anchors.push({ ...base, id: anchorId(base, occurrence), targetText: targetTextFor(text), ...(insertionMode ? { insertionMode } : {}) });
    paragraphIndex += 1;
  }
  if (!tables.length && !paragraphIndex) warnings.push(`No editable text anchors were found in ${partName}.`);
}

export function extractDocumentTemplateAnchorInventory(bytes: Uint8Array, fileName = "template.docx", definition?: DocumentTemplateTypeDefinition): DocumentTemplateAnchorInventory {
  const entries = validateDocxTemplateBytes(bytes, fileName, DOCX_MIME_TYPE);
  const zip = new PizZip(bytes, { checkCRC32: true });
  const anchors: DocumentTemplateAnchor[] = [];
  const lineTableCandidates: DocumentTemplateLineTableCandidate[] = [];
  const occurrences = new Map<string, number>();
  const warnings: string[] = [];
  for (const entry of entries.filter((candidate) => /^word\/(?:document|header\d+|footer\d+)\.xml$/i.test(candidate.name))) {
    inspectPart(entry.name, zip.file(entry.name)?.asText() || "", anchors, lineTableCandidates, occurrences, warnings, definition);
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
  definition?: DocumentTemplateTypeDefinition,
): { ok: true; analysis: DocumentTemplateMappingAnalysis } | { ok: false; errors: readonly string[] } {
  const errors: string[] = [];
  const usedAnchors = new Set<string>();
  const normalizedMappings = [...analysis.mappings];
  const normalizationWarnings: string[] = [];
  const unresolved = [...analysis.unresolved];
  for (const [index, mapping] of analysis.mappings.entries()) {
    if (mapping.unresolved) continue;
    if (!mapping.fieldKey || !isDocumentTemplateFieldKey(documentType, mapping.fieldKey, definition)) {
      errors.push(`mapping ${index + 1} references an unavailable application field.`);
      continue;
    }
    if (!mapping.anchorId) {
      errors.push(`mapping ${index + 1} does not identify a deterministic source anchor.`);
      continue;
    }
    const anchor = inventory.anchors.find((candidate) => candidate.id === mapping.anchorId);
    if (!anchor) {
      normalizedMappings[index] = { ...mapping, fieldKey: undefined, targetText: undefined, unresolved: true };
      normalizationWarnings.push(`Mapping ${index + 1} was left unresolved because its source anchor was not found.`);
      unresolved.push(`Mapping ${index + 1} references an unknown source anchor.`);
      continue;
    }
    if (usedAnchors.has(anchor.id)) {
      normalizedMappings[index] = { ...mapping, fieldKey: undefined, targetText: undefined, unresolved: true };
      normalizationWarnings.push(`Mapping ${index + 1} was left unresolved because its source anchor was already used.`);
      unresolved.push(`Mapping ${index + 1} duplicates a source anchor.`);
      continue;
    }
    usedAnchors.add(anchor.id);
    if (!anchor.targetText) {
      normalizedMappings[index] = { ...mapping, fieldKey: undefined, targetText: undefined, unresolved: true };
      normalizationWarnings.push(`Mapping ${index + 1} was left unresolved because its source value is not safely replaceable.`);
      unresolved.push(`Mapping ${index + 1} does not identify a replaceable source value.`);
      continue;
    }
    else if (mapping.targetText !== anchor.targetText) normalizationWarnings.push(`Mapping ${index + 1} target text was normalized from the verified source anchor.`);
    if (anchor.targetText) normalizedMappings[index] = { ...mapping, targetText: anchor.targetText };
    if (getDocumentTemplateFieldCatalog(documentType, definition).find((field) => field.key === mapping.fieldKey)?.collection) {
      normalizedMappings[index] = { ...mapping, fieldKey: undefined, targetText: undefined, unresolved: true };
      normalizationWarnings.push(`Mapping ${index + 1} was left unresolved because repeating fields require a line table.`);
      unresolved.push(`Mapping ${index + 1} requires a repeating line table.`);
    }
  }

  const lineTable = analysis.lineTable;
  let normalizedLineTable = lineTable;
  if (lineTable) {
    let lineTableInvalid = false;
    if (!lineTable.candidateId) lineTableInvalid = true;
    const candidate = lineTable.candidateId ? inventory.lineTableCandidates.find((item) => item.id === lineTable.candidateId) : undefined;
    if (!candidate) lineTableInvalid = true;
    if (!inventory.lineTable || inventory.lineTable.id !== lineTable.candidateId) lineTableInvalid = true;
    const columns = lineTable.columns || [];
    const usedColumns = new Set<number>();
    for (const [index, column] of columns.entries()) {
      if (usedColumns.has(column.columnIndex)) lineTableInvalid = true;
      usedColumns.add(column.columnIndex);
      if (!candidate?.columns.some((item) => item.columnIndex === column.columnIndex)) lineTableInvalid = true;
      if (!isDocumentTemplateFieldKey(documentType, column.fieldKey, definition) || !getDocumentTemplateFieldCatalog(documentType, definition).find((field) => field.key === column.fieldKey)?.collection) lineTableInvalid = true;
    }
    if (!columns.length) lineTableInvalid = true;
    if (lineTableInvalid) {
      normalizedLineTable = undefined;
      normalizationWarnings.push("The repeating line-table proposal was left unresolved because its candidate or columns were ambiguous.");
      unresolved.push("Repeating line-table mapping needs review.");
    }
  }
  if (normalizedMappings.some((mapping) => mapping.fieldKey?.startsWith("lines.")) && !normalizedLineTable) {
    for (const [index, mapping] of normalizedMappings.entries()) {
      if (!mapping.fieldKey?.startsWith("lines.")) continue;
      normalizedMappings[index] = { ...mapping, fieldKey: undefined, targetText: undefined, unresolved: true };
    }
    normalizationWarnings.push("Repeating line fields were left unresolved because no unique line-item table was available.");
    unresolved.push("Repeating line fields require a unique line-item table.");
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    analysis: normalizationWarnings.length || normalizedLineTable !== analysis.lineTable
      ? { ...analysis, mappings: normalizedMappings, unresolved, warnings: [...analysis.warnings, ...normalizationWarnings], ...(normalizedLineTable ? { lineTable: normalizedLineTable } : { lineTable: undefined }) }
      : analysis,
  };
}

function xmlEscapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

interface TextNodeRange {
  readonly fullStart: number;
  readonly contentStart: number;
  readonly contentEnd: number;
  readonly fullEnd: number;
  readonly text: string;
}

function textNodeRanges(xml: string): readonly TextNodeRange[] {
  return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)].map((match) => {
    const fullStart = match.index ?? 0;
    const full = match[0] || "";
    const contentStart = fullStart + full.indexOf(">") + 1;
    const contentEnd = fullStart + full.lastIndexOf("<");
    return { fullStart, contentStart, contentEnd, fullEnd: fullStart + full.length, text: decodeXmlText(match[1] || "") };
  });
}

function normalizedSpan(source: string, target: string): readonly [number, number] | undefined {
  const directPositions: number[] = [];
  let directOffset = source.indexOf(target);
  while (directOffset >= 0) {
    directPositions.push(directOffset);
    directOffset = source.indexOf(target, directOffset + Math.max(target.length, 1));
  }
  if (directPositions.length === 1) return [directPositions[0]!, directPositions[0]! + target.length];
  if (directPositions.length > 1) throw new DocumentTemplatePreparationError("AMBIGUOUS_SOURCE_TEXT", "The selected source text occurs more than once in the identified Word location.");

  let normalized = "";
  const starts: number[] = [];
  const ends: number[] = [];
  let pendingSpace = false;
  for (let index = 0; index < source.length; index += 1) {
    if (/\s/.test(source[index] || "")) {
      pendingSpace = normalized.length > 0;
      continue;
    }
    if (pendingSpace && normalized && !normalized.endsWith(" ")) {
      normalized += " ";
      starts.push(index);
      ends.push(index);
    }
    pendingSpace = false;
    normalized += source[index];
    starts.push(index);
    ends.push(index + 1);
  }
  const normalizedTarget = normalizeText(target);
  const normalizedIndex = normalized.indexOf(normalizedTarget);
  if (normalizedIndex >= 0) {
    const second = normalized.indexOf(normalizedTarget, normalizedIndex + Math.max(normalizedTarget.length, 1));
    if (second >= 0) throw new DocumentTemplatePreparationError("AMBIGUOUS_SOURCE_TEXT", "The selected source text occurs more than once in the identified Word location.");
    const start = starts[normalizedIndex];
    const end = ends[normalizedIndex + normalizedTarget.length - 1];
    return start === undefined || end === undefined ? undefined : [start, end];
  }

  const compactSource = [...source].filter((character) => !/\s/.test(character));
  const compactStarts: number[] = [];
  const compactEnds: number[] = [];
  for (let index = 0; index < source.length; index += 1) {
    if (/\s/.test(source[index] || "")) continue;
    compactStarts.push(index);
    compactEnds.push(index + 1);
  }
  const compactTarget = [...normalizedTarget].filter((character) => !/\s/.test(character)).join("");
  const compactText = compactSource.join("");
  const compactIndex = compactText.indexOf(compactTarget);
  if (compactIndex < 0) return undefined;
  const compactSecond = compactText.indexOf(compactTarget, compactIndex + Math.max(compactTarget.length, 1));
  if (compactSecond >= 0) throw new DocumentTemplatePreparationError("AMBIGUOUS_SOURCE_TEXT", "The selected source text occurs more than once in the identified Word location.");
  const compactStart = compactStarts[compactIndex];
  const compactEnd = compactEnds[compactIndex + compactTarget.length - 1];
  return compactStart === undefined || compactEnd === undefined ? undefined : [compactStart, compactEnd];
}

function replaceTextSpan(xml: string, targetText: string, replacement: string): string {
  const nodes = textNodeRanges(xml);
  const source = nodes.map((node) => node.text).join("");
  const span = normalizedSpan(source, targetText);
  if (!span) throw new DocumentTemplatePreparationError("SOURCE_TEXT_MISMATCH", "The selected source text no longer matches the uploaded Word template.");
  const [start, end] = span;
  const replacements: Array<readonly [number, number, string]> = [];
  for (const node of nodes) {
    const nodeStart = nodes.slice(0, nodes.indexOf(node)).reduce((sum, item) => sum + item.text.length, 0);
    const nodeEnd = nodeStart + node.text.length;
    if (nodeEnd <= start || nodeStart >= end) continue;
    const overlapStart = Math.max(start, nodeStart) - nodeStart;
    const overlapEnd = Math.min(end, nodeEnd) - nodeStart;
    let nextText = node.text.slice(0, overlapStart);
    if (start >= nodeStart && start <= nodeEnd) nextText += replacement;
    if (end <= nodeEnd) nextText += node.text.slice(overlapEnd);
    replacements.push([node.contentStart, node.contentEnd, xmlEscapeText(nextText)]);
  }
  let result = xml;
  for (const [replacementStart, replacementEnd, value] of [...replacements].sort((left, right) => right[0] - left[0])) {
    result = `${result.slice(0, replacementStart)}${value}${result.slice(replacementEnd)}`;
  }
  return result;
}

function replaceRange(source: string, start: number, end: number, replacement: string): string {
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

function replaceCellInRow(rowXml: string, cellIndex: number, replace: (cellXml: string) => string): string {
  const cells = xmlRanges(rowXml, /<w:tc\b[\s\S]*?<\/w:tc>/gi);
  const cell = cells[cellIndex];
  if (!cell) throw new DocumentTemplatePreparationError("CELL_NOT_FOUND", "The selected line-table cell no longer exists in the uploaded Word template.");
  return replaceRange(rowXml, cell.start, cell.end, replace(cell.text));
}

function replaceRowInTable(tableXml: string, rowIndex: number, replace: (rowXml: string) => string): string {
  const rows = rowFragments(tableXml).map((text) => ({ text }));
  const rowRanges = xmlRanges(tableXml, /<w:tr\b[\s\S]*?<\/w:tr>/gi);
  const row = rowRanges[rowIndex];
  if (!row) throw new DocumentTemplatePreparationError("ROW_NOT_FOUND", "The selected line-item row no longer exists in the uploaded Word template.");
  return replaceRange(tableXml, row.start, row.end, replace(row.text));
}

function replaceTableInPart(xml: string, tableIndex: number, replace: (tableXml: string) => string): string {
  const tables = tableFragments(xml);
  const table = tables[tableIndex];
  if (!table) throw new DocumentTemplatePreparationError("TABLE_NOT_FOUND", "The selected line-item table no longer exists in the uploaded Word template.");
  return replaceRange(xml, table.start, table.end, replace(table.text));
}

function replaceParagraphInPart(xml: string, paragraphIndex: number, replace: (paragraphXml: string) => string): string {
  const tables = tableFragments(xml);
  const tableRanges = tables.map((table) => [table.start, table.end] as const);
  const paragraphs = paragraphFragments(xml).filter((paragraph) => !tableRanges.some(([start, end]) => paragraph.start >= start && paragraph.end <= end)).filter((paragraph) => Boolean(normalizeText(textFromWordXml(paragraph.text))));
  const paragraph = paragraphs[paragraphIndex];
  if (!paragraph) throw new DocumentTemplatePreparationError("PARAGRAPH_NOT_FOUND", "The selected paragraph no longer exists in the uploaded Word template.");
  return replaceRange(xml, paragraph.start, paragraph.end, replace(paragraph.text));
}

function updateFirstTextNode(xml: string, update: (value: string) => string, appendIfEmpty: string): string {
  const nodes = textNodeRanges(xml);
  if (!nodes.length) {
    const paragraphClose = xml.search(/<\/w:p>/i);
    if (paragraphClose < 0) {
      const emptyParagraph = xml.match(/<w:p\b[^>]*\/>/i);
      if (emptyParagraph?.[0]) return xml.replace(emptyParagraph[0], `${emptyParagraph[0].slice(0, -2)}><w:r><w:t>${xmlEscapeText(appendIfEmpty)}</w:t></w:r></w:p>`);
      throw new DocumentTemplatePreparationError("CELL_TEXT_UNSUPPORTED", "The selected Word cell has no supported paragraph content.");
    }
    return `${xml.slice(0, paragraphClose)}<w:r><w:t>${xmlEscapeText(appendIfEmpty)}</w:t></w:r>${xml.slice(paragraphClose)}`;
  }
  const node = nodes[0]!;
  const next = xmlEscapeText(update(node.text));
  return `${xml.slice(0, node.contentStart)}${next}${xml.slice(node.contentEnd)}`;
}

function updateLastTextNode(xml: string, update: (value: string) => string, appendIfEmpty: string): string {
  const nodes = textNodeRanges(xml);
  if (!nodes.length) return updateFirstTextNode(xml, () => appendIfEmpty, appendIfEmpty);
  const node = nodes[nodes.length - 1]!;
  const next = xmlEscapeText(update(node.text));
  return `${xml.slice(0, node.contentStart)}${next}${xml.slice(node.contentEnd)}`;
}

function replaceAnchorInPart(xml: string, anchor: DocumentTemplateAnchor, targetText: string, replacement: string): string {
  const replaceTarget = (fragment: string) => anchor.insertionMode === "AFTER_LABEL"
    ? replaceTextSpan(fragment, targetText, `${targetText}${replacement}`)
    : replaceTextSpan(fragment, targetText, replacement);
  if (anchor.kind === "PARAGRAPH") return replaceParagraphInPart(xml, anchor.paragraphIndex, replaceTarget);
  return replaceTableInPart(xml, anchor.tableIndex!, (tableXml) => replaceRowInTable(tableXml, anchor.rowIndex!, (rowXml) => {
    if (anchor.insertionMode === "ADJACENT_CELL" && anchor.relatedCellIndex !== undefined) {
      return replaceCellInRow(rowXml, anchor.relatedCellIndex, (cellXml) => updateFirstTextNode(cellXml, () => replacement, replacement));
    }
    return replaceCellInRow(rowXml, anchor.cellIndex!, replaceTarget);
  }));
}

function replaceLineTableInPart(xml: string, candidate: DocumentTemplateUniqueLineTable, columns: readonly DocumentTemplatePreparationLineColumn[], documentType: DocumentTemplateType, definition?: DocumentTemplateTypeDefinition): string {
  const repeatKey = candidate.repeatSectionKey || "lines";
  const catalog = getDocumentTemplateFieldCatalog(documentType, definition);
  return replaceTableInPart(xml, candidate.tableIndex, (tableXml) => replaceRowInTable(tableXml, candidate.dataRowIndex!, (rowXml) => {
    let nextRow = rowXml;
    for (const column of columns) {
      const field = catalog.find((candidateField) => candidateField.key === column.fieldKey);
      if (!field?.collection) throw new DocumentTemplatePreparationError("INVALID_LINE_FIELD", `${column.fieldKey} is not an allowed repeating field.`);
      nextRow = replaceCellInRow(nextRow, column.columnIndex, (cellXml) => {
        const cellText = normalizeText(textFromWordXml(cellXml));
        const target = targetTextFor(cellText) || cellText;
        const fieldTag = `{{${tagForDocumentTemplateField(column.fieldKey)}}}`;
        const section = definition?.repeatSections.find((candidateSection) => candidateSection.key === repeatKey);
        const checkboxField = section?.fields.find((candidateField) => candidateField.type === "BOOLEAN" && candidateField.source === "INPUT");
        const replacement = checkboxField && /[□☐☑]/.test(cellText) ? `{{${repeatKey}.${checkboxField.key}}} ${fieldTag}` : fieldTag;
        return target ? replaceTextSpan(cellXml, target, replacement) : updateFirstTextNode(cellXml, () => replacement, replacement);
      });
    }
    const rowCells = xmlRanges(nextRow, /<w:tc\b[\s\S]*?<\/w:tc>/gi);
    if (!rowCells.length) throw new DocumentTemplatePreparationError("ROW_NOT_FOUND", "The selected line-item row has no supported cells.");
    nextRow = replaceRange(nextRow, rowCells[0]!.start, rowCells[0]!.end, updateFirstTextNode(rowCells[0]!.text, (value) => value.startsWith(`{{#${repeatKey}}}`) ? value : `{{#${repeatKey}}}${value}`, `{{#${repeatKey}}}`));
    const refreshedCells = xmlRanges(nextRow, /<w:tc\b[\s\S]*?<\/w:tc>/gi);
    const lastIndex = refreshedCells.length - 1;
    nextRow = replaceRange(nextRow, refreshedCells[lastIndex]!.start, refreshedCells[lastIndex]!.end, updateLastTextNode(refreshedCells[lastIndex]!.text, (value) => value.endsWith(`{{/${repeatKey}}}`) ? value : `${value}{{/${repeatKey}}}`, `{{/${repeatKey}}}`));
    return nextRow;
  }));
}

export function validateDocumentTemplatePreparationPlan(
  plan: DocumentTemplatePreparationPlan,
  inventory: DocumentTemplateAnchorInventory,
  definition?: DocumentTemplateTypeDefinition,
): { ok: true; plan: DocumentTemplatePreparationPlan } | { ok: false; errors: readonly string[] } {
  const errors: string[] = [];
  const usedAnchors = new Set<string>();
  const usedFields = new Set<string>();
  for (const [index, mapping] of plan.mappings.entries()) {
    const field = getDocumentTemplateFieldCatalog(plan.documentType, definition).find((candidate) => candidate.key === mapping.fieldKey);
    const anchor = inventory.anchors.find((candidate) => candidate.id === mapping.anchorId);
    if (!field || field.collection) errors.push(`mapping ${index + 1} references an unavailable scalar field.`);
    if (!anchor) errors.push(`mapping ${index + 1} references an unknown source anchor.`);
    if (usedAnchors.has(mapping.anchorId)) errors.push(`mapping ${index + 1} duplicates a source anchor.`);
    if (usedFields.has(mapping.fieldKey)) errors.push(`mapping ${index + 1} duplicates an application field.`);
    if (mapping.confirmed === false) errors.push(`mapping ${index + 1} has not been confirmed.`);
    if (anchor && (!mapping.targetText || anchor.targetText !== mapping.targetText)) errors.push(`mapping ${index + 1} does not match the current source text.`);
    usedAnchors.add(mapping.anchorId);
    usedFields.add(mapping.fieldKey);
  }
  if (plan.lineTable) {
    const candidate = inventory.lineTableCandidates.find((item) => item.id === plan.lineTable?.candidateId);
    if (!candidate || !inventory.lineTable || inventory.lineTable.id !== plan.lineTable.candidateId) errors.push("The selected line-item table is unknown or ambiguous.");
    const usedColumns = new Set<number>();
    const usedLineFields = new Set<string>();
    for (const [index, column] of plan.lineTable.columns.entries()) {
      if (!candidate?.columns.some((item) => item.columnIndex === column.columnIndex)) errors.push(`line-table mapping ${index + 1} references an unknown column.`);
      const field = getDocumentTemplateFieldCatalog(plan.documentType, definition).find((candidate) => candidate.key === column.fieldKey);
      if (!field?.collection) errors.push(`line-table mapping ${index + 1} references an unavailable repeating field.`);
      if (usedColumns.has(column.columnIndex)) errors.push(`line-table mapping ${index + 1} duplicates a column.`);
      if (usedLineFields.has(column.fieldKey)) errors.push(`line-table mapping ${index + 1} duplicates a repeating field.`);
      usedColumns.add(column.columnIndex);
      usedLineFields.add(column.fieldKey);
    }
    if (!plan.lineTable.columns.length) errors.push("The selected line-item table has no reviewed column mappings.");
  }
  return errors.length ? { ok: false, errors } : { ok: true, plan };
}

export function prepareDocxTemplate(
  bytes: Uint8Array,
  fileName: string,
  documentType: DocumentTemplateType,
  plan: DocumentTemplatePreparationPlan,
  definition?: DocumentTemplateTypeDefinition,
): { bytes: Uint8Array; bindings: readonly DocumentTemplateBinding[]; inventory: DocumentTemplateAnchorInventory; report: TemplateValidationReport } {
  const inventory = extractDocumentTemplateAnchorInventory(bytes, fileName, definition);
  if (plan.documentType !== documentType) throw new DocumentTemplatePreparationError("DOCUMENT_TYPE_MISMATCH", "The preparation plan does not match the uploaded document type.");
  const validatedPlan = validateDocumentTemplatePreparationPlan(plan, inventory, definition);
  if (validatedPlan.ok === false) throw new DocumentTemplatePreparationError("INVALID_PREPARATION_PLAN", validatedPlan.errors.join(" "));
  const zip = new PizZip(bytes, { checkCRC32: true });
  for (const mapping of plan.mappings) {
    const anchor = inventory.anchors.find((candidate) => candidate.id === mapping.anchorId);
    if (!anchor) throw new DocumentTemplatePreparationError("ANCHOR_NOT_FOUND", "The selected source anchor no longer exists.");
    const part = zip.file(anchor.partName);
    if (!part) throw new DocumentTemplatePreparationError("PART_NOT_FOUND", "The selected Word package part no longer exists.");
    let nextXml: string;
    try {
      nextXml = replaceAnchorInPart(part.asText(), anchor, mapping.targetText, `{{${mapping.fieldKey}}}`);
    } catch (error) {
      if (error instanceof DocumentTemplatePreparationError && error.code === "SOURCE_TEXT_MISMATCH") {
        throw new DocumentTemplatePreparationError("SOURCE_TEXT_MISMATCH", `The selected ${mapping.fieldKey} source anchor no longer matches the uploaded Word template.`);
      }
      throw error;
    }
    zip.file(anchor.partName, nextXml);
  }
  const lineTable = plan.lineTable ? inventory.lineTable : undefined;
  if (plan.lineTable && !lineTable) throw new DocumentTemplatePreparationError("LINE_TABLE_NOT_UNIQUE", "The selected repeating line-item table is no longer uniquely identified.");
  if (plan.lineTable && lineTable) {
    const part = zip.file(lineTable.partName);
    if (!part) throw new DocumentTemplatePreparationError("PART_NOT_FOUND", "The selected Word package part no longer exists.");
    zip.file(lineTable.partName, replaceLineTableInPart(part.asText(), lineTable, plan.lineTable.columns, documentType, definition));
  }
  const preparedBytes = new Uint8Array(zip.generate({ type: "uint8array", compression: "DEFLATE" }));
  validateDocxTemplateBytes(preparedBytes, fileName, DOCX_MIME_TYPE);
  const structure = extractDocxStructure(preparedBytes, fileName);
  const bindings: DocumentTemplateBinding[] = plan.mappings.map((mapping) => ({ tag: mapping.fieldKey, fieldKey: mapping.fieldKey, ...(mapping.sourceLabel ? { sourceLabel: mapping.sourceLabel } : {}), ...(mapping.confidence === undefined ? {} : { confidence: mapping.confidence }), confirmed: true }));
  if (plan.lineTable) for (const column of plan.lineTable.columns) bindings.push({ tag: tagForDocumentTemplateField(column.fieldKey), fieldKey: column.fieldKey, confirmed: true });
  const repeatKey = inventory.lineTable?.repeatSectionKey;
  const repeatDefinition = repeatKey ? definition?.repeatSections.find((section) => section.key === repeatKey) : undefined;
  const checkboxField = repeatDefinition?.fields.find((field) => field.type === "BOOLEAN" && field.source === "INPUT");
  if (repeatKey && checkboxField) bindings.push({ tag: `${repeatKey}.${checkboxField.key}`, fieldKey: `${repeatKey}.${checkboxField.key}`, confirmed: true });
  const report = validateDocumentTemplateBindings(documentType, structure.tags, bindings, definition);
  return { bytes: preparedBytes, bindings, inventory: extractDocumentTemplateAnchorInventory(preparedBytes, fileName, definition), report };
}

export class DocumentTemplatePreparationError extends DocumentTemplateValidationError {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "DocumentTemplatePreparationError";
    this.code = code;
  }
}
