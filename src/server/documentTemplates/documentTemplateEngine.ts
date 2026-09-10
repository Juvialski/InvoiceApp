import { createHash } from "node:crypto";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import type { FinancialDocumentSnapshot } from "../../lib/documentGeneration.ts";
import {
  getDocumentTemplateField,
  getDocumentTemplateFields,
  isDocumentTemplateFieldKey,
  minimumRequiredFieldKeys,
  resolveDocumentTemplateFieldValue,
  starterTemplateBlueprint,
  tagForDocumentTemplateField,
  validateDocumentTemplateBindings,
  validateTemplateBlueprint,
  type DocumentTemplateBinding,
  type DocumentTemplateType,
  type TemplateBlueprint,
  type TemplateValidationReport,
} from "../../lib/documentTemplateRegistry.ts";

export const MAX_DOCUMENT_TEMPLATE_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_TEMPLATE_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
export const MAX_DOCUMENT_TEMPLATE_ENTRIES = 500;
export const MAX_DOCUMENT_TEMPLATE_COMPRESSION_RATIO = 100;
export const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_FILE_SIGNATURE = 0x02014b50;
const ZIP_END_SIGNATURE = 0x06054b50;

export interface DocumentTemplateZipEntry {
  readonly name: string;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly compressionMethod: number;
  readonly encrypted: boolean;
}

export interface DocumentTemplateStructure {
  readonly entries: readonly string[];
  readonly paragraphs: readonly string[];
  readonly tables: readonly { rows: readonly (readonly string[])[] }[];
  readonly text: string;
  readonly tags: readonly string[];
}

export class DocumentTemplateValidationError extends Error {
  readonly report?: TemplateValidationReport;

  constructor(message: string, report?: TemplateValidationReport) {
    super(message);
    this.name = "DocumentTemplateValidationError";
    this.report = report;
  }
}

function fileExtension(fileName: string): string {
  return /\.([A-Za-z0-9]+)$/.exec(String(fileName || "").trim())?.[1]?.toLowerCase() || "";
}

function normalizedMime(mimeType?: string): string {
  return String(mimeType || "").split(";", 1)[0].trim().toLowerCase();
}

function readUint16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function decodeArchiveName(bytes: Uint8Array, utf8: boolean): string {
  return new TextDecoder(utf8 ? "utf-8" : "utf-8", { fatal: true }).decode(bytes);
}

function assertSafeArchiveName(name: string): void {
  if (!name || name.includes("\0") || name.includes("\\") || name.startsWith("/") || /^[A-Za-z]:/.test(name)) {
    throw new DocumentTemplateValidationError("The Word template contains an unsafe archive path.");
  }
  const segments = name.split("/");
  if (segments.some((segment, index) => (segment === "" && index !== segments.length - 1) || segment === "." || segment === "..")) {
    throw new DocumentTemplateValidationError("The Word template contains an unsafe archive path.");
  }
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const start = Math.max(0, bytes.byteLength - 65_557);
  for (let offset = bytes.byteLength - 22; offset >= start; offset -= 1) {
    if (readUint32(bytes, offset) === ZIP_END_SIGNATURE) return offset;
  }
  throw new DocumentTemplateValidationError("The uploaded file is not a valid ZIP/OOXML package.");
}

export function inspectDocxArchive(bytes: Uint8Array): readonly DocumentTemplateZipEntry[] {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new DocumentTemplateValidationError("The Word template is empty.");
  if (bytes.byteLength > MAX_DOCUMENT_TEMPLATE_BYTES) throw new DocumentTemplateValidationError("The Word template exceeds the 10 MB safety limit.");
  const endOffset = findEndOfCentralDirectory(bytes);
  const diskNumber = readUint16(bytes, endOffset + 4);
  const centralDisk = readUint16(bytes, endOffset + 6);
  const entryCount = readUint16(bytes, endOffset + 10);
  const centralSize = readUint32(bytes, endOffset + 12);
  const centralOffset = readUint32(bytes, endOffset + 16);
  if (diskNumber !== 0 || centralDisk !== 0 || entryCount === 0 || entryCount > MAX_DOCUMENT_TEMPLATE_ENTRIES || centralOffset + centralSize > endOffset) {
    throw new DocumentTemplateValidationError("The Word template ZIP directory is invalid or exceeds the safety limits.");
  }

  const entries: DocumentTemplateZipEntry[] = [];
  const names = new Set<string>();
  let cursor = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > endOffset || readUint32(bytes, cursor) !== ZIP_CENTRAL_FILE_SIGNATURE) {
      throw new DocumentTemplateValidationError("The Word template contains an invalid ZIP directory entry.");
    }
    const flags = readUint16(bytes, cursor + 8);
    const method = readUint16(bytes, cursor + 10);
    const compressedSize = readUint32(bytes, cursor + 20);
    const uncompressedSize = readUint32(bytes, cursor + 24);
    const nameLength = readUint16(bytes, cursor + 28);
    const extraLength = readUint16(bytes, cursor + 30);
    const commentLength = readUint16(bytes, cursor + 32);
    const localOffset = readUint32(bytes, cursor + 42);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd + extraLength + commentLength > endOffset) throw new DocumentTemplateValidationError("The Word template contains a truncated ZIP directory entry.");
    let name: string;
    try {
      name = decodeArchiveName(bytes.slice(nameStart, nameEnd), Boolean(flags & 0x800));
    } catch {
      throw new DocumentTemplateValidationError("The Word template contains an invalid archive filename.");
    }
    assertSafeArchiveName(name);
    if (names.has(name)) throw new DocumentTemplateValidationError("The Word template contains duplicate archive entries.");
    names.add(name);
    if ((flags & 0x1) !== 0) throw new DocumentTemplateValidationError("Encrypted Word templates are not supported.");
    if (method !== 0 && method !== 8) throw new DocumentTemplateValidationError("The Word template uses an unsupported ZIP compression method.");
    if (uncompressedSize > MAX_DOCUMENT_TEMPLATE_UNCOMPRESSED_BYTES || compressedSize > MAX_DOCUMENT_TEMPLATE_BYTES) {
      throw new DocumentTemplateValidationError("The Word template exceeds the decompression safety limit.");
    }
    if (uncompressedSize > 1_024 * 1024 && (compressedSize === 0 || uncompressedSize / compressedSize > MAX_DOCUMENT_TEMPLATE_COMPRESSION_RATIO)) {
      throw new DocumentTemplateValidationError("The Word template has an unsafe decompression ratio.");
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_DOCUMENT_TEMPLATE_UNCOMPRESSED_BYTES) throw new DocumentTemplateValidationError("The Word template expands beyond the safety limit.");
    if (localOffset >= centralOffset || localOffset + 30 > bytes.byteLength || readUint32(bytes, localOffset) !== ZIP_LOCAL_FILE_SIGNATURE) {
      throw new DocumentTemplateValidationError("The Word template contains an invalid local ZIP entry.");
    }
    entries.push({ name, compressedSize, uncompressedSize, compressionMethod: method, encrypted: false });
    cursor = nameEnd + extraLength + commentLength;
  }
  const required = ["[Content_Types].xml", "_rels/.rels", "word/document.xml"];
  for (const path of required) if (!names.has(path)) throw new DocumentTemplateValidationError("The uploaded file is not a complete supported Word document.");
  if (names.has("word/vbaProject.bin") || [...names].some((name) => /vbaProject|\.docm$/i.test(name))) {
    throw new DocumentTemplateValidationError("Macro-enabled Word templates are not supported.");
  }
  return entries;
}

export function validateDocxTemplateBytes(bytes: Uint8Array, fileName: string, mimeType?: string): readonly DocumentTemplateZipEntry[] {
  const extension = fileExtension(fileName);
  if (extension !== "docx") throw new DocumentTemplateValidationError("Only standard .docx templates are supported. Macro-enabled .docm files are rejected.");
  const mime = normalizedMime(mimeType);
  if (mime && mime !== DOCX_MIME_TYPE && mime !== "application/octet-stream") throw new DocumentTemplateValidationError("The template MIME type is not a supported DOCX type.");
  const entries = inspectDocxArchive(bytes);
  try {
    // checkCRC32 verifies the package after the central-directory safety pass.
    const zip = new PizZip(bytes, { checkCRC32: true });
    const contentTypes = zip.file("[Content_Types].xml")?.asText() || "";
    const documentXml = zip.file("word/document.xml")?.asText() || "";
    if (!/application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document\.main\+xml/i.test(contentTypes)
      || !/<w:document\b[^>]*xmlns:w=["'][^"']+wordprocessingml[^"']*["']/i.test(documentXml)
      || !/<w:body\b[^>]*>/i.test(documentXml)) {
      throw new DocumentTemplateValidationError("The uploaded file is not a complete supported Word document.");
    }
  } catch {
    throw new DocumentTemplateValidationError("The uploaded file is not a readable Word document.");
  }
  return entries;
}

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

function textFromWordXml(fragment: string): string {
  const pieces = [...fragment.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)].map((match) => decodeXmlText(match[1] || ""));
  const tabs = (fragment.match(/<w:tab\b[^>]*\/?>(?:<\/w:tab>)?/gi) || []).length;
  return pieces.join("") + (tabs ? "\t".repeat(tabs) : "");
}

function tagsFromText(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((match) => String(match[1] || "").trim()).filter(Boolean);
}

function structureFromXml(xml: string) {
  const paragraphs = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/gi)].map((match) => textFromWordXml(match[0] || "")).filter(Boolean);
  const tables = [...xml.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>/gi)].map((tableMatch) => {
    const rows = [...(tableMatch[0] || "").matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/gi)].map((rowMatch) =>
      [...(rowMatch[0] || "").matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/gi)].map((cellMatch) => textFromWordXml(cellMatch[0] || "")),
    );
    return { rows };
  });
  return { paragraphs, tables };
}

export function extractDocxStructure(bytes: Uint8Array, fileName = "template.docx"): DocumentTemplateStructure {
  const entries = validateDocxTemplateBytes(bytes, fileName, DOCX_MIME_TYPE);
  const zip = new PizZip(bytes, { checkCRC32: true });
  const paragraphs: string[] = [];
  const tables: Array<{ rows: readonly (readonly string[])[] }> = [];
  const allText: string[] = [];
  const xmlEntries = entries.filter((entry) => /^word\/(?:document|header\d+|footer\d+)\.xml$/i.test(entry.name));
  for (const entry of xmlEntries) {
    const xml = zip.file(entry.name)?.asText() || "";
    const result = structureFromXml(xml);
    paragraphs.push(...result.paragraphs);
    tables.push(...result.tables);
    allText.push(...result.paragraphs, ...result.tables.flatMap((table) => table.rows.flatMap((row) => row)));
  }
  const text = allText.join("\n").slice(0, 100_000);
  return {
    entries: entries.map((entry) => entry.name),
    paragraphs,
    tables,
    text,
    tags: [...new Set(tagsFromText(text))],
  };
}

function snapshotLineValue(snapshot: FinancialDocumentSnapshot, fieldKey: string, scope: unknown): string {
  const line = scope && typeof scope === "object" ? scope as FinancialDocumentSnapshot["lines"][number] : undefined;
  return resolveDocumentTemplateFieldValue(snapshot, snapshot.documentType, fieldKey, line);
}

function validateSnapshotForMerge(snapshot: FinancialDocumentSnapshot, bindings: readonly DocumentTemplateBinding[]) {
  if (snapshot.status === "CANCELLED" || snapshot.status === "VOIDED") throw new DocumentTemplateValidationError("Cancelled or voided financial documents cannot generate a company template document.");
  if (!snapshot.lines.length) throw new DocumentTemplateValidationError("The financial snapshot has no line items; a financial template cannot replace required values with an empty line.");
  for (const key of minimumRequiredFieldKeys(snapshot.documentType)) {
    if (key.startsWith("lines.")) continue;
    const value = resolveDocumentTemplateFieldValue(snapshot, snapshot.documentType, key);
    if (!value.trim()) throw new DocumentTemplateValidationError(`The authoritative snapshot is missing the required value for ${getDocumentTemplateField(snapshot.documentType, key)?.label || key}.`);
  }
  for (const binding of bindings) {
    if (binding.fieldKey.startsWith("lines.")) {
      if (snapshot.lines.some((line) => !snapshotLineValue(snapshot, binding.fieldKey, line).trim()) && getDocumentTemplateField(snapshot.documentType, binding.fieldKey)?.required) {
        throw new DocumentTemplateValidationError(`The authoritative snapshot is missing a required line value for ${getDocumentTemplateField(snapshot.documentType, binding.fieldKey)?.label || binding.fieldKey}.`);
      }
    }
  }
}

export function mergeDocxTemplate(
  bytes: Uint8Array,
  fileName: string,
  snapshot: FinancialDocumentSnapshot,
  bindings: readonly DocumentTemplateBinding[],
): Uint8Array {
  const structure = extractDocxStructure(bytes, fileName);
  const report = validateDocumentTemplateBindings(snapshot.documentType, structure.tags, bindings);
  if (report.state === "BLOCKED") throw new DocumentTemplateValidationError("The template is not valid for generation.", report);
  validateSnapshotForMerge(snapshot, bindings);
  const bindingMap = new Map(bindings.map((binding) => [binding.tag.trim(), binding.fieldKey.trim()]));
  const zip = new PizZip(bytes, { checkCRC32: true });
  const templater = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
    parser: (rawTag: string) => ({
      get: (scope: unknown) => {
        const tag = rawTag.trim();
        if (tag === "lines") return snapshot.lines;
        const fieldKey = bindingMap.get(tag) || (isDocumentTemplateFieldKey(snapshot.documentType, tag) ? tag : undefined);
        if (!fieldKey || !isDocumentTemplateFieldKey(snapshot.documentType, fieldKey)) {
          throw new DocumentTemplateValidationError(`The merge tag ${tag} is not allowlisted.`);
        }
        return snapshotLineValue(snapshot, fieldKey, scope);
      },
    }),
    nullGetter: () => "",
  });
  try {
    templater.render();
    return new Uint8Array(templater.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" }));
  } catch (error) {
    if (error instanceof DocumentTemplateValidationError) throw error;
    throw new DocumentTemplateValidationError("The Word template could not be merged safely.");
  }
}

function labelForField(documentType: DocumentTemplateType, key: string): string {
  return getDocumentTemplateField(documentType, key)?.label || key;
}

function textCell(text: string, bold = false) {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ children: [new TextRun({ text, bold, size: 18 })] })],
  });
}

function blueprintScalarKeys(blueprint: TemplateBlueprint): string[] {
  const keys = new Set<string>();
  if (blueprint.includeCompanyProfile) ["company.legalName", "company.address", "company.contactNumber", "company.email", "company.vatTin"].forEach((key) => keys.add(key));
  blueprint.sections.flatMap((section) => section.fields).forEach((key) => keys.add(key));
  keys.add(blueprint.documentType === "PURCHASE_ORDER" ? "purchaseOrder.totalAmount" : "invoice.subtotal");
  keys.add(blueprint.documentType === "PURCHASE_ORDER" ? "purchaseOrder.documentNumber" : "invoice.documentNumber");
  keys.add(blueprint.documentType === "PURCHASE_ORDER" ? "purchaseOrder.currency" : "invoice.currency");
  keys.add(blueprint.documentType === "PURCHASE_ORDER" ? "purchaseOrder.amountInWords" : "invoice.totalAmount");
  keys.add("processor.name");
  if (blueprint.includePaymentInstructions) keys.add("company.paymentInstructions");
  if (blueprint.includeTerms) keys.add(blueprint.documentType === "PURCHASE_ORDER" ? "purchaseOrder.termsAndConditions" : "invoice.termsAndConditions");
  return [...keys];
}

export function bindingsForTemplateBlueprint(blueprint: TemplateBlueprint): DocumentTemplateBinding[] {
  const bindings: DocumentTemplateBinding[] = blueprintScalarKeys(blueprint).map((fieldKey) => ({
    tag: fieldKey,
    fieldKey,
    confirmed: true,
  }));
  for (const fieldKey of blueprint.lineColumns) bindings.push({ tag: tagForDocumentTemplateField(fieldKey), fieldKey, confirmed: true });
  return [...new Map(bindings.map((binding) => [binding.tag, binding])).values()];
}

function templateParagraph(label: string, tag: string) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text: `${label}: `, bold: true, size: 18 }), new TextRun({ text: `{{${tag}}}`, size: 18 })],
  });
}

export async function buildDocxTemplateFromBlueprint(input: unknown, requestedType: DocumentTemplateType): Promise<{ bytes: Uint8Array; blueprint: TemplateBlueprint; bindings: readonly DocumentTemplateBinding[] }> {
  const validated = validateTemplateBlueprint(input, requestedType);
  if (validated.ok === false) throw new DocumentTemplateValidationError(`The template blueprint is invalid: ${validated.errors.join(" ")}`);
  const blueprint = validated.blueprint;
  const isPo = requestedType === "PURCHASE_ORDER";
  const scalarChildren: Array<Paragraph | Table> = [];
  if (blueprint.includeCompanyProfile) {
    scalarChildren.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "{{company.legalName}}", bold: true, size: 30, color: "173B73" })] }));
    scalarChildren.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "{{company.address}} · {{company.contactNumber}} · {{company.email}}", size: 16, color: "173B73" })] }));
  }
  scalarChildren.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 160, after: 120 }, children: [new TextRun({ text: blueprint.title, bold: true, size: 28, color: "173B73" })] }));
  scalarChildren.push(templateParagraph(isPo ? "No." : "Invoice no.", isPo ? "purchaseOrder.documentNumber" : "invoice.documentNumber"));
  scalarChildren.push(templateParagraph("Currency", isPo ? "purchaseOrder.currency" : "invoice.currency"));
  for (const section of blueprint.sections) {
    scalarChildren.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 180, after: 80 }, children: [new TextRun({ text: section.heading, bold: true, size: 20, color: "173B73" })] }));
    for (const key of section.fields) scalarChildren.push(templateParagraph(labelForField(requestedType, key), key));
  }
  const headers = blueprint.lineColumns.map((key) => labelForField(requestedType, key));
  const lineRowCells = blueprint.lineColumns.map((key, index) => {
    const children: Paragraph[] = [];
    if (index === 0) children.push(new Paragraph("{{#lines}}"));
    children.push(new Paragraph(`{{${tagForDocumentTemplateField(key)}}}`));
    if (index === blueprint.lineColumns.length - 1) children.push(new Paragraph("{{/lines}}"));
    return new TableCell({ verticalAlign: VerticalAlign.CENTER, children });
  });
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "7A8799" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "7A8799" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "7A8799" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "7A8799" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "C8D0DA" },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "C8D0DA" },
    },
    rows: [
      new TableRow({ children: headers.map((header) => textCell(header, true)) }),
      new TableRow({ children: lineRowCells }),
    ],
  });
  scalarChildren.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 80 }, children: [new TextRun({ text: "Line items", bold: true, size: 20, color: "173B73" })] }));
  scalarChildren.push(table);
  scalarChildren.push(new Paragraph({ spacing: { before: 160, after: 60 }, children: [new TextRun({ text: "Subtotal / total: ", bold: true, size: 18 }), new TextRun({ text: `{{${isPo ? "purchaseOrder.totalAmount" : "invoice.subtotal"}}}`, size: 18 })] }));
  if (!isPo) scalarChildren.push(templateParagraph("Total", "invoice.totalAmount"));
  scalarChildren.push(templateParagraph("Amount in words", isPo ? "purchaseOrder.amountInWords" : "invoice.amountInWords"));
  if (blueprint.includePaymentInstructions) scalarChildren.push(templateParagraph("Payment instructions", "company.paymentInstructions"));
  if (blueprint.includeTerms) scalarChildren.push(templateParagraph("Terms", isPo ? "purchaseOrder.termsAndConditions" : "invoice.termsAndConditions"));
  scalarChildren.push(new Paragraph({ spacing: { before: 320 }, children: [new TextRun({ text: "{{processor.name}}", bold: true, size: 18 }), new TextRun({ text: " · Prepared / processed by", size: 18 })] }));
  scalarChildren.push(new Paragraph({ spacing: { before: 260 }, children: [new TextRun({ text: blueprint.signatureLabels.join("    ____________________    "), size: 18 })] }));

  const footerText = blueprint.footerText || "Generated from an immutable HydroQualiSense document snapshot.";
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
        },
      },
      children: scalarChildren,
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: footerText, size: 14, color: "667085" })] })] }) },
    }],
  });
  const bytes = new Uint8Array(await Packer.toBuffer(doc));
  return { bytes, blueprint, bindings: bindingsForTemplateBlueprint(blueprint) };
}

export async function buildStarterDocxTemplate(documentType: DocumentTemplateType) {
  return buildDocxTemplateFromBlueprint(starterTemplateBlueprint(documentType), documentType);
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function generatedTemplateFileName(documentType: DocumentTemplateType, displayName: string): string {
  const prefix = documentType === "PURCHASE_ORDER" ? "Purchase_Order" : "Client_Invoice";
  const safe = String(displayName || "Template").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 100) || "Template";
  return `${prefix}_${safe}.docx`;
}
