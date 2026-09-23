import { companyApiRequest } from "./companyApi.ts";
import { requireActiveCompanyId } from "./companyContext.ts";
import { isDemoApplicationPath } from "../app/applicationMode.ts";
import { MAX_ENTITY_MEDIA_BYTES, validateEntityMediaBytes } from "./fileSecurity.ts";
import type { EntityMedia, EntityMediaBatch, EntityMediaEntityType, EntityMediaMutationResult } from "./entityMediaTypes.ts";

export class EntityMediaApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "EntityMediaApiError";
    this.code = code;
    this.status = status;
  }
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
    throw new EntityMediaApiError(payload.error || "The entity image request failed safely.", String(payload.code || "ENTITY_MEDIA_OPERATION_FAILED"), response.status);
  }
  return payload.data as T;
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize)));
  }
  if (typeof btoa === "function") return btoa(binary);
  return Buffer.from(bytes).toString("base64");
}

async function browserSha256Hex(bytes: Uint8Array): Promise<string> {
  const input = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", input);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function mediaUpdated(entityType: EntityMediaEntityType, entityId: string): void {
  if (typeof window === "undefined" || typeof CustomEvent === "undefined") return;
  window.dispatchEvent(new CustomEvent("hqs:entity-media-updated", { detail: { entityType, entityId } }));
}

const demoMediaOverrides = new Map<string, EntityMedia | null>();

function inDemoApplication(): boolean {
  return typeof window !== "undefined" && isDemoApplicationPath(window.location.pathname);
}

export function entityMediaCompanyId(): string {
  return inDemoApplication() ? "demo-company" : requireActiveCompanyId();
}

function demoMediaKey(entityType: EntityMediaEntityType, entityId: string): string {
  return `${entityType}:${entityId}`;
}

function demoFixture(entityType: EntityMediaEntityType, entityId: string): EntityMedia | null {
  const key = demoMediaKey(entityType, entityId);
  if (demoMediaOverrides.has(key)) return demoMediaOverrides.get(key) || null;
  const checksum = [...key].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  if (checksum % 2 !== 0) return null;
  const names: Record<EntityMediaEntityType, { src: string; alt: string; contentType: string }> = {
    PROJECT: { src: "/demo-media/entity-media/project.svg", alt: "Synthetic water infrastructure project illustration", contentType: "image/svg+xml" },
    EQUIPMENT: { src: "/demo-media/entity-media/equipment.svg", alt: "Synthetic industrial water pump illustration", contentType: "image/svg+xml" },
    MATERIAL: { src: "/demo-media/entity-media/material.svg", alt: "Synthetic concrete pipe material illustration", contentType: "image/svg+xml" },
  };
  const fixture = names[entityType];
  const now = "2026-09-23T00:00:00.000Z";
  return {
    id: `demo-media-${key}`,
    entityType,
    entityId,
    purpose: entityType === "PROJECT" ? "COVER" : "PRIMARY",
    url: fixture.src,
    contentType: fixture.contentType,
    sizeBytes: 0,
    sha256: "",
    altText: fixture.alt,
    createdAt: now,
    updatedAt: now,
  };
}

export function resetDemoEntityMedia(): void {
  for (const media of demoMediaOverrides.values()) {
    if (media?.url.startsWith("blob:")) URL.revokeObjectURL(media.url);
  }
  demoMediaOverrides.clear();
}

export async function loadEntityMediaBatch(
  companyId: string,
  entityType: EntityMediaEntityType,
  entityIds: readonly string[],
): Promise<EntityMediaBatch> {
  const ids = [...new Set(entityIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return { byEntityId: {} };
  if (inDemoApplication()) {
    return { byEntityId: Object.fromEntries(ids.flatMap((id) => {
      const media = demoFixture(entityType, id);
      return media ? [[id, media]] : [];
    })) };
  }
  const batches: string[][] = [];
  for (let offset = 0; offset < ids.length; offset += 100) batches.push(ids.slice(offset, offset + 100));
  const responses = await Promise.all(batches.map(async (batch) => {
    const query = new URLSearchParams({ ids: batch.join(",") });
    return requestJson<EntityMediaBatch>(`/api/entity-media/${encodeURIComponent(entityType)}?${query.toString()}`, { companyId });
  }));
  return { byEntityId: Object.assign({}, ...responses.map((data) => data?.byEntityId || {})) };
}

export async function loadEntityMedia(
  companyId: string,
  entityType: EntityMediaEntityType,
  entityId: string,
): Promise<EntityMedia | null> {
  if (inDemoApplication()) return demoFixture(entityType, entityId);
  const data = await requestJson<{ media: EntityMedia | null }>(`/api/entity-media/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`, { companyId });
  return data.media || null;
}

export async function uploadEntityMedia(
  companyId: string,
  entityType: EntityMediaEntityType,
  entityId: string,
  input: { file: File; expectedMediaId: string | null; altText?: string },
): Promise<EntityMediaMutationResult> {
  if (input.file.size > MAX_ENTITY_MEDIA_BYTES) throw new Error("Entity image exceeds the 5 MB limit.");
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  validateEntityMediaBytes(bytes, input.file.type, input.file.name);
  if (inDemoApplication()) {
    const current = demoFixture(entityType, entityId);
    if ((current?.id || null) !== input.expectedMediaId) {
      throw new EntityMediaApiError("This demo image changed in another session. Refresh it before retrying.", "EXPECTED_MEDIA_MISMATCH", 409);
    }
    const media: EntityMedia = {
      id: globalThis.crypto?.randomUUID?.() || `demo-upload-${Date.now()}`,
      entityType,
      entityId,
      purpose: entityType === "PROJECT" ? "COVER" : "PRIMARY",
      url: URL.createObjectURL(input.file),
      contentType: input.file.type,
      sizeBytes: bytes.byteLength,
      sha256: await browserSha256Hex(bytes),
      ...(input.altText?.trim() ? { altText: input.altText.trim() } : {}),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (current?.url.startsWith("blob:")) URL.revokeObjectURL(current.url);
    demoMediaOverrides.set(demoMediaKey(entityType, entityId), media);
    mediaUpdated(entityType, entityId);
    return { media, cleanupPending: false };
  }
  const data = await requestJson<EntityMediaMutationResult>(`/api/entity-media/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`, {
    companyId,
    method: "POST",
    body: {
      fileData: base64(bytes),
      fileName: input.file.name,
      mimeType: input.file.type,
      altText: input.altText,
      expectedMediaId: input.expectedMediaId,
    },
  });
  mediaUpdated(entityType, entityId);
  return data;
}

export async function removeEntityMedia(
  companyId: string,
  entityType: EntityMediaEntityType,
  entityId: string,
  mediaId: string,
): Promise<EntityMediaMutationResult> {
  if (inDemoApplication()) {
    const current = demoFixture(entityType, entityId);
    if (!current || current.id !== mediaId) {
      throw new EntityMediaApiError("This demo image changed in another session. Refresh it before retrying.", "EXPECTED_MEDIA_MISMATCH", 409);
    }
    if (current.url.startsWith("blob:")) URL.revokeObjectURL(current.url);
    demoMediaOverrides.set(demoMediaKey(entityType, entityId), null);
    mediaUpdated(entityType, entityId);
    return { media: null, cleanupPending: false };
  }
  const data = await requestJson<EntityMediaMutationResult>(
    `/api/entity-media/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/${encodeURIComponent(mediaId)}`,
    { companyId, method: "DELETE" },
  );
  mediaUpdated(entityType, entityId);
  return data;
}
