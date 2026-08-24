import {
  ASSISTANT_MAX_ATTACHMENT_BYTES,
  ASSISTANT_MAX_TOTAL_ATTACHMENT_BYTES,
  type AssistantAttachmentInput,
  type AssistantAttachmentReference,
} from "./assistantTypes.ts";

export { ASSISTANT_MAX_ATTACHMENT_BYTES, ASSISTANT_MAX_TOTAL_ATTACHMENT_BYTES } from "./assistantTypes.ts";

export type AttachmentRouteHint = "INVOICE_SOURCE" | "STRUCTURED_DATA" | "TEXT_CONTEXT";
export type AttachmentKind = AssistantAttachmentReference["kind"];

export interface AssistantFileLike {
  name: string;
  type?: string | null;
  size: number;
}

export interface AssistantAttachmentMetadata {
  fileName: string;
  mimeType: string;
  size: number;
  extension: string;
  kind: AttachmentKind;
  routeHint: AttachmentRouteHint;
  warning?: string;
}

export type AttachmentRejectionCode =
  | "EMPTY_NAME"
  | "UNSUPPORTED_TYPE"
  | "MIME_MISMATCH"
  | "INVALID_SIZE"
  | "FILE_TOO_LARGE"
  | "TOTAL_TOO_LARGE";

export type AttachmentValidationResult =
  | { ok: true; metadata: AssistantAttachmentMetadata }
  | { ok: false; code: AttachmentRejectionCode; message: string };

const EXTENSION_RULES: Readonly<Record<string, { kind: AttachmentKind; mimeTypes: readonly string[]; routeHint: AttachmentRouteHint; warning?: string }>> = Object.freeze({
  ".pdf": { kind: "PDF", mimeTypes: ["application/pdf"], routeHint: "INVOICE_SOURCE" },
  ".jpg": { kind: "IMAGE", mimeTypes: ["image/jpeg"], routeHint: "INVOICE_SOURCE" },
  ".jpeg": { kind: "IMAGE", mimeTypes: ["image/jpeg"], routeHint: "INVOICE_SOURCE" },
  ".png": { kind: "IMAGE", mimeTypes: ["image/png"], routeHint: "INVOICE_SOURCE" },
  ".webp": { kind: "IMAGE", mimeTypes: ["image/webp"], routeHint: "INVOICE_SOURCE" },
  ".xlsx": {
    kind: "XLSX",
    mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    routeHint: "STRUCTURED_DATA",
    warning: "Spreadsheet contents are treated as data only. Formulas and embedded instructions are not executed.",
  },
  ".csv": {
    kind: "CSV",
    mimeTypes: ["text/csv", "application/csv", "application/vnd.ms-excel"],
    routeHint: "STRUCTURED_DATA",
    warning: "Spreadsheet contents are treated as data only. Formulas and embedded instructions are not executed.",
  },
  ".txt": { kind: "TEXT", mimeTypes: ["text/plain"], routeHint: "TEXT_CONTEXT" },
});

export const ASSISTANT_ATTACHMENT_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.csv,.txt";
export const ASSISTANT_MAX_ATTACHMENTS = 10;

function normalizeMimeType(value: string | null | undefined) {
  return (value || "").split(";", 1)[0]!.trim().toLowerCase();
}

/** Strip browser-provided path fragments and control characters before display or upload. */
export function safeAttachmentFileName(value: string) {
  return value
    .trim()
    .replace(/[\\/\0]/g, "_")
    .replace(/[\u0001-\u001f\u007f]/g, "")
    .slice(0, 180);
}

function extensionFor(fileName: string) {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot >= 0 ? fileName.slice(lastDot).toLowerCase() : "";
}

function routeForKind(kind: AttachmentKind): AttachmentRouteHint {
  return kind === "TEXT" ? "TEXT_CONTEXT" : kind === "CSV" || kind === "XLSX" ? "STRUCTURED_DATA" : "INVOICE_SOURCE";
}

export function attachmentKindFor(fileName: string, mimeType?: string | null): AttachmentKind | null {
  const rule = EXTENSION_RULES[extensionFor(safeAttachmentFileName(fileName))];
  if (!rule) return null;
  const normalizedMime = normalizeMimeType(mimeType);
  return !normalizedMime || rule.mimeTypes.includes(normalizedMime) ? rule.kind : null;
}

/**
 * Validate only metadata. This is intentionally the sole routing decision for
 * assistant attachments; no workbook or document instructions are interpreted.
 */
export function validateAssistantAttachment(
  input: AssistantFileLike,
  options: { existingTotalBytes?: number; maxBytes?: number; maxTotalBytes?: number } = {},
): AttachmentValidationResult {
  const fileName = safeAttachmentFileName(input.name || "");
  if (!fileName) return { ok: false, code: "EMPTY_NAME", message: "That attachment needs a file name." };

  const extension = extensionFor(fileName);
  const rule = EXTENSION_RULES[extension];
  if (!rule) {
    return { ok: false, code: "UNSUPPORTED_TYPE", message: "Use a PDF, JPG, JPEG, PNG, WEBP, XLSX, CSV, or TXT file." };
  }

  const mimeType = normalizeMimeType(input.type);
  if (mimeType && !rule.mimeTypes.includes(mimeType)) {
    return { ok: false, code: "MIME_MISMATCH", message: `The file type for “${fileName}” does not match its extension.` };
  }

  const size = Number(input.size);
  if (!Number.isFinite(size) || size < 0 || !Number.isInteger(size)) {
    return { ok: false, code: "INVALID_SIZE", message: `The size for “${fileName}” is not valid.` };
  }

  const maxBytes = options.maxBytes ?? ASSISTANT_MAX_ATTACHMENT_BYTES;
  const maxTotalBytes = options.maxTotalBytes ?? ASSISTANT_MAX_TOTAL_ATTACHMENT_BYTES;
  if (size > maxBytes) {
    return { ok: false, code: "FILE_TOO_LARGE", message: `“${fileName}” is larger than the ${Math.round(maxBytes / (1024 * 1024))} MB per-file limit.` };
  }

  const existingTotalBytes = Number(options.existingTotalBytes ?? 0);
  if (!Number.isFinite(existingTotalBytes) || existingTotalBytes < 0 || existingTotalBytes + size > maxTotalBytes) {
    return { ok: false, code: "TOTAL_TOO_LARGE", message: `Attachments must stay under the ${Math.round(maxTotalBytes / (1024 * 1024))} MB total limit.` };
  }

  return {
    ok: true,
    metadata: {
      fileName,
      mimeType: mimeType || rule.mimeTypes[0]!,
      size,
      extension,
      kind: rule.kind,
      routeHint: rule.routeHint || routeForKind(rule.kind),
      warning: rule.warning,
    },
  };
}

function bytesToBase64(bytes: Uint8Array) {
  if (typeof globalThis.btoa !== "function") throw new Error("This browser cannot encode attachments safely.");
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return globalThis.btoa(binary);
}

export async function readAssistantAttachment(file: File): Promise<{ metadata: AssistantAttachmentMetadata; input: AssistantAttachmentInput }> {
  const validation = validateAssistantAttachment(file);
  if (validation.ok === false) throw new Error(validation.message);
  const dataBase64 = bytesToBase64(new Uint8Array(await file.arrayBuffer()));
  return {
    metadata: validation.metadata,
    input: {
      fileName: validation.metadata.fileName,
      mimeType: validation.metadata.mimeType,
      size: validation.metadata.size,
      dataBase64,
    },
  };
}

export function isAssistantAttachmentKind(value: unknown): value is AttachmentKind {
  return value === "TEXT" || value === "CSV" || value === "XLSX" || value === "IMAGE" || value === "PDF";
}
