import { companyApiRequest } from "./companyApi.ts";
import type { DocumentTemplateBinding, DocumentTemplateMappingAnalysis, DocumentTemplateType, TemplateValidationReport } from "./documentTemplateRegistry.ts";

export interface DocumentTemplateVersion {
  id: string;
  templateId: string;
  companyId: string;
  documentType: DocumentTemplateType;
  displayName: string;
  origin: string;
  versionNumber: number;
  sourceFilename?: string;
  sourceStoragePath: string;
  contentStoragePath: string;
  storageProvider: string;
  storageBucket: string;
  mimeType: string;
  contentSize: number;
  contentSha256: string;
  sourceSha256?: string;
  mappingSchemaVersion: string;
  bindings: readonly DocumentTemplateBinding[];
  validationState: string;
  validationReport: Record<string, unknown>;
  status: string;
  parentVersionId?: string;
  activatedAt?: string;
  retiredAt?: string;
  createdAt?: string;
}

export interface DocumentTemplateRoot {
  id: string;
  companyId: string;
  documentType: DocumentTemplateType;
  displayName: string;
  variantKey: string;
  isDefault: boolean;
  createdAt?: string;
  versions: readonly DocumentTemplateVersion[];
}

export interface DocumentTemplateAnalysisResult {
  versionId: string;
  documentType: DocumentTemplateType;
  structure: { paragraphs: readonly string[]; tables: readonly { rows: readonly (readonly string[])[] }[]; text: string; tags: readonly string[] };
  aiStatus: "AVAILABLE" | "UNAVAILABLE";
  message?: string;
  analysis: DocumentTemplateMappingAnalysis;
  heuristic: DocumentTemplateMappingAnalysis;
  model?: string;
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
  if (!response.ok || payload.success === false) throw new Error(payload.error || "The document-template request failed safely.");
  return payload.data as T;
}

export async function listDocumentTemplates(companyId: string): Promise<readonly DocumentTemplateRoot[]> {
  const data = await requestJson<{ templates: DocumentTemplateRoot[] }>("/api/document-templates", { companyId });
  return data.templates || [];
}

export async function uploadDocumentTemplate(companyId: string, input: { documentType: DocumentTemplateType; file: File; displayName?: string }): Promise<DocumentTemplateVersion & { structure?: DocumentTemplateAnalysisResult["structure"]; preparation?: string }> {
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  return requestJson(`/api/document-templates/upload`, {
    companyId,
    method: "POST",
    body: { documentType: input.documentType, fileName: input.file.name, fileData: base64(bytes), displayName: input.displayName },
  });
}

export async function createStarterDocumentTemplate(companyId: string, input: { documentType: DocumentTemplateType; templateId?: string; displayName?: string; variantKey?: string }): Promise<DocumentTemplateVersion> {
  return requestJson("/api/document-templates/starter", { companyId, method: "POST", body: input });
}

export async function generateDocumentTemplateWithAi(companyId: string, input: { documentType: DocumentTemplateType; prompt: string; displayName?: string; variantKey?: string }): Promise<DocumentTemplateVersion & { blueprint?: unknown; model?: string }> {
  return requestJson("/api/document-templates/generate-ai", { companyId, method: "POST", body: input });
}

export async function analyzeDocumentTemplate(companyId: string, versionId: string): Promise<DocumentTemplateAnalysisResult> {
  return requestJson(`/api/document-templates/${encodeURIComponent(versionId)}/analyze`, { companyId, method: "POST", body: {} });
}

export async function updateDocumentTemplateBindings(companyId: string, versionId: string, bindings: readonly DocumentTemplateBinding[]): Promise<{ version: DocumentTemplateVersion; report: TemplateValidationReport }> {
  return requestJson(`/api/document-templates/${encodeURIComponent(versionId)}/bindings`, { companyId, method: "PUT", body: { bindings } });
}

export async function duplicateDocumentTemplate(companyId: string, versionId: string, displayName?: string): Promise<DocumentTemplateVersion> {
  return requestJson(`/api/document-templates/${encodeURIComponent(versionId)}/duplicate`, { companyId, method: "POST", body: displayName ? { displayName } : {} });
}

export async function activateDocumentTemplate(companyId: string, versionId: string): Promise<DocumentTemplateVersion> {
  return requestJson(`/api/document-templates/${encodeURIComponent(versionId)}/activate`, { companyId, method: "POST", body: {} });
}

export async function retireDocumentTemplate(companyId: string, versionId: string): Promise<DocumentTemplateVersion> {
  return requestJson(`/api/document-templates/${encodeURIComponent(versionId)}/retire`, { companyId, method: "POST", body: {} });
}

async function binaryRequest(path: string, companyId: string, body?: unknown): Promise<{ bytes: Uint8Array; fileName: string; headers: Headers }> {
  const response = await companyApiRequest(path, {
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    companyId,
  });
  if (!response.ok) {
    const payload = await jsonResponse(response);
    throw new Error(payload.error || "The DOCX operation failed safely.");
  }
  const contentDisposition = response.headers.get("Content-Disposition") || "";
  const fileName = /filename="([^"]+)"/i.exec(contentDisposition)?.[1] || "HydroQualiSense_Document.docx";
  return { bytes: new Uint8Array(await response.arrayBuffer()), fileName, headers: response.headers };
}

export async function downloadDocumentTemplate(companyId: string, versionId: string) {
  return binaryRequest(`/api/document-templates/${encodeURIComponent(versionId)}/content`, companyId);
}

export async function generateDocumentTemplateDocument(companyId: string, versionId: string, input: { documentType: DocumentTemplateType; snapshotId?: string; previewSnapshot?: unknown }) {
  return binaryRequest(`/api/document-templates/${encodeURIComponent(versionId)}/generate`, companyId, input);
}

export function downloadDocxBytes(bytes: Uint8Array, fileName: string) {
  if (typeof window === "undefined" || typeof document === "undefined") throw new Error("DOCX download is only available in a browser.");
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
