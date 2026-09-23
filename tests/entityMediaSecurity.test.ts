import test from "node:test";
import assert from "node:assert/strict";
import { MAX_ENTITY_MEDIA_BYTES, validateEntityMediaBytes } from "../src/lib/fileSecurity.ts";
import { buildEntityMediaStoragePath, isCompanyScopedPath, isEntityMediaStoragePath, parseStorageKey } from "../src/lib/storage/keys.ts";

const COMPANY_ID = "11111111-2222-4333-8444-555555555555";
const PROJECT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const MEDIA_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function bytes(prefix: readonly number[], size = prefix.length + 8): Uint8Array {
  const result = new Uint8Array(size);
  result.set(prefix);
  return result;
}

test("entity media accepts raster uploads only when declared MIME, filename, and signature agree", () => {
  const supported = [
    { contentType: "image/jpeg", fileName: "pump.jpg", prefix: [0xff, 0xd8, 0xff] },
    { contentType: "image/png", fileName: "project.png", prefix: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
    { contentType: "image/webp", fileName: "pipe.webp", prefix: [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50] },
  ] as const;

  for (const image of supported) {
    assert.doesNotThrow(() => validateEntityMediaBytes(bytes(image.prefix), image.contentType, image.fileName));
  }

  assert.throws(
    () => validateEntityMediaBytes(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/jpeg", "fake.jpg"),
    /signature|match/i,
  );
  assert.throws(
    () => validateEntityMediaBytes(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/svg+xml", "vector.svg"),
    /JPEG|PNG|WebP|supported/i,
  );
  assert.throws(
    () => validateEntityMediaBytes(new TextEncoder().encode("<svg><script>alert(1)</script></svg>"), "image/png", "vector.png"),
    /signature|match/i,
  );
});

test("entity media rejects empty and oversize byte payloads at the 5 MiB limit", () => {
  assert.throws(() => validateEntityMediaBytes(new Uint8Array(), "image/png", "empty.png"), /empty/i);
  assert.doesNotThrow(() => validateEntityMediaBytes(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], MAX_ENTITY_MEDIA_BYTES), "image/png", "limit.png"));
  assert.throws(
    () => validateEntityMediaBytes(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], MAX_ENTITY_MEDIA_BYTES + 1), "image/png", "large.png"),
    /5 MB|limit/i,
  );
});

test("entity media object keys bind company, entity kind, entity id, and opaque media id", () => {
  assert.equal(
    buildEntityMediaStoragePath({ companyId: COMPANY_ID, entityType: "PROJECT", entityId: PROJECT_ID, mediaId: MEDIA_ID, contentType: "image/png" }),
    `companies/${COMPANY_ID}/entity-media/project/${PROJECT_ID}/${MEDIA_ID}.png`,
  );
  assert.equal(
    buildEntityMediaStoragePath({ companyId: COMPANY_ID, entityType: "EQUIPMENT", entityId: PROJECT_ID, mediaId: MEDIA_ID, contentType: "image/jpeg" }),
    `companies/${COMPANY_ID}/entity-media/equipment/${PROJECT_ID}/${MEDIA_ID}.jpg`,
  );
  assert.equal(
    buildEntityMediaStoragePath({ companyId: COMPANY_ID, entityType: "MATERIAL", entityId: PROJECT_ID, mediaId: MEDIA_ID, contentType: "image/webp" }),
    `companies/${COMPANY_ID}/entity-media/material/${PROJECT_ID}/${MEDIA_ID}.webp`,
  );
  const projectPath = `companies/${COMPANY_ID}/entity-media/project/${PROJECT_ID}/${MEDIA_ID}.png`;
  assert.equal(isEntityMediaStoragePath(projectPath, COMPANY_ID, "PROJECT", PROJECT_ID, MEDIA_ID, "image/png"), true);
  assert.equal(parseStorageKey(projectPath).kind, "ENTITY_MEDIA");
  assert.equal(isCompanyScopedPath(projectPath, COMPANY_ID), true);
  assert.equal(isEntityMediaStoragePath(projectPath, "22222222-2222-4333-8444-555555555555", "PROJECT", PROJECT_ID, MEDIA_ID, "image/png"), false);
  assert.equal(parseStorageKey(projectPath.replace("project/", "project/../")).isValid, false);

  assert.throws(
    () => buildEntityMediaStoragePath({ companyId: COMPANY_ID, entityType: "PROJECT", entityId: "../other-company", mediaId: MEDIA_ID, contentType: "image/png" }),
    /identifier|segment|unsafe|traversal/i,
  );
  assert.throws(
    () => buildEntityMediaStoragePath({ companyId: COMPANY_ID, entityType: "PROJECT", entityId: PROJECT_ID, mediaId: MEDIA_ID, contentType: "image/svg+xml" }),
    /MIME|content type|supported/i,
  );
});
