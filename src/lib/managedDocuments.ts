import { companyApiRequest } from "./companyApi.ts";
import { validateManagedDocumentBytes } from "./fileSecurity.ts";

export type ManagedDocumentCategory = "WARRANTY_CERTIFICATE" | "EQUIPMENT_MATERIALS_CHECKLIST" | "GENERAL_UPLOAD" | "GENERATED_DOCUMENT" | "GENERATED_ARTIFACT";
export type ManagedDocumentOrigin = "MANUAL_UPLOAD" | "GENERATED_DOCUMENT" | "GENERATED_ARTIFACT";

export interface ManagedDocumentVersion {
  readonly id: string;
  readonly documentId: string;
  readonly versionNumber: number;
  readonly sourceOrigin: ManagedDocumentOrigin;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly templateVersionId?: string;
  readonly uploadedByUserId?: string;
  readonly createdAt: string;
  readonly previewUrl?: string;
}

export interface RetainedDocumentArtifact {
  readonly id: string;
  readonly managedDocumentId: string;
  readonly managedVersionId: string;
  readonly sourceDomain: string;
  readonly sourceType: string;
  readonly sourceRecordId?: string;
  readonly sourceRecordReference?: string;
  readonly artifactType: string;
  readonly displayName: string;
  readonly templateVersionId?: string;
  readonly templateContentSha256?: string;
  readonly sourceArtifactVersionId?: string;
  readonly createdByUserId?: string;
  readonly createdAt: string;
}

export interface ManagedDocumentSummary {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly category: ManagedDocumentCategory;
  readonly origin: ManagedDocumentOrigin;
  readonly status: "ACTIVE" | "ARCHIVED";
  readonly projectId?: string;
  readonly currentVersionId?: string;
  readonly currentVersionNumber?: number;
  readonly currentFileName?: string;
  readonly currentMimeType?: string;
  readonly currentSizeBytes?: number;
  readonly currentSha256?: string;
  readonly createdByUserId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt?: string;
  readonly artifact?: RetainedDocumentArtifact;
}

export interface ManagedDocumentDetail extends ManagedDocumentSummary {
  readonly versions: readonly ManagedDocumentVersion[];
}

export class ManagedDocumentApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ManagedDocumentApiError";
    this.code = code;
    this.status = status;
  }
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize)));
  if (typeof btoa === "function") return btoa(binary);
  return Buffer.from(bytes).toString("base64");
}

async function jsonResponse(response: Response): Promise<Record<string, any>> {
  return await response.json().catch(() => ({}));
}

async function requestJson<T>(path: string, options: { companyId: string; method?: string; body?: unknown }): Promise<T> {
  const response = await companyApiRequest(path, {
    method: options.method || "GET",
    ...(options.body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(options.body) }),
    companyId: options.companyId,
  });
  const payload = await jsonResponse(response);
  if (!response.ok || payload.success === false) {
    throw new ManagedDocumentApiError(payload.error || "The managed document request failed safely.", String(payload.code || "MANAGED_DOCUMENT_OPERATION_FAILED"), response.status);
  }
  return payload.data as T;
}

export async function listManagedDocuments(companyId: string): Promise<readonly ManagedDocumentSummary[]> {
  const data = await requestJson<{ documents: ManagedDocumentSummary[] }>("/api/managed-documents", { companyId });
  return data.documents || [];
}

export async function getManagedDocument(companyId: string, documentId: string): Promise<ManagedDocumentDetail> {
  return requestJson<ManagedDocumentDetail>(`/api/managed-documents/${encodeURIComponent(documentId)}`, { companyId });
}

async function readFileBytes(file: Blob | ArrayBuffer | Uint8Array | File): Promise<{ bytes: Uint8Array; fileName: string; mimeType: string }> {
  const bytes = file instanceof Uint8Array
    ? new Uint8Array(file)
    : file instanceof ArrayBuffer
      ? new Uint8Array(file)
      : new Uint8Array(await file.arrayBuffer());
  const fileName = "name" in file ? String(file.name || "document.bin") : "document.bin";
  const mimeType = "type" in file ? String(file.type || "application/octet-stream") : "application/octet-stream";
  validateManagedDocumentBytes(bytes, mimeType, fileName);
  return { bytes, fileName, mimeType };
}

export async function uploadManagedDocument(
  companyId: string,
  input: { file: Blob | ArrayBuffer | Uint8Array | File; title: string; category: Exclude<ManagedDocumentCategory, "GENERATED_DOCUMENT" | "GENERATED_ARTIFACT">; description?: string; projectId?: string },
): Promise<ManagedDocumentDetail> {
  const prepared = await readFileBytes(input.file);
  return requestJson<ManagedDocumentDetail>("/api/managed-documents", {
    companyId,
    method: "POST",
    body: {
      fileData: base64(prepared.bytes),
      fileName: prepared.fileName,
      mimeType: prepared.mimeType,
      title: input.title,
      category: input.category,
      description: input.description,
      projectId: input.projectId,
    },
  });
}

export async function uploadManagedDocumentVersion(
  companyId: string,
  documentId: string,
  expectedUpdatedAt: string,
  file: Blob | ArrayBuffer | Uint8Array | File,
): Promise<ManagedDocumentDetail> {
  const prepared = await readFileBytes(file);
  return requestJson<ManagedDocumentDetail>(`/api/managed-documents/${encodeURIComponent(documentId)}/versions`, {
    companyId,
    method: "POST",
    body: { fileData: base64(prepared.bytes), fileName: prepared.fileName, mimeType: prepared.mimeType, expectedUpdatedAt },
  });
}

export async function archiveManagedDocument(companyId: string, documentId: string, expectedUpdatedAt: string, reason?: string): Promise<ManagedDocumentSummary> {
  return requestJson<ManagedDocumentSummary>(`/api/managed-documents/${encodeURIComponent(documentId)}/archive`, {
    companyId,
    method: "POST",
    body: { expectedUpdatedAt, reason },
  });
}

export async function getManagedDocumentVersionUrl(companyId: string, documentId: string, versionId: string, download = false): Promise<string> {
  const query = download ? "?download=1" : "";
  const data = await requestJson<{ url: string }>(`/api/managed-documents/${encodeURIComponent(documentId)}/versions/${encodeURIComponent(versionId)}/url${query}`, { companyId });
  return data.url;
}
