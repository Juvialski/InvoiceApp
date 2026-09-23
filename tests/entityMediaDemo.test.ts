import assert from "node:assert/strict";
import test from "node:test";
import { loadEntityMedia, loadEntityMediaBatch, removeEntityMedia, uploadEntityMedia } from "../src/lib/entityMedia.ts";

test("demo entity images stay synthetic and local while replacement/removal never call the production API", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { pathname: "/demo/app/projects" }, dispatchEvent: () => true },
  });
  try {
    const ids = ["demo-project-media-a", "demo-project-media-b"];
    const batch = await loadEntityMediaBatch("demo-company", "PROJECT", ids);
    const entityId = Object.keys(batch.byEntityId)[0] || ids[0];
    const initial = await loadEntityMedia("demo-company", "PROJECT", entityId);
    if (initial) {
      assert.match(initial.url, /^\/demo-media\/entity-media\/project\.svg$/);
      assert.equal(initial.contentType, "image/svg+xml");
    }

    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4];
    const file = new File([new Uint8Array(signature)], "synthetic-cover.png", { type: "image/png" });
    const uploaded = await uploadEntityMedia("demo-company", "PROJECT", entityId, {
      file,
      expectedMediaId: initial?.id || null,
      altText: "Synthetic local QA image",
    });
    assert.equal(uploaded.cleanupPending, false);
    assert.match(uploaded.media?.url || "", /^blob:/);
    assert.equal((await loadEntityMedia("demo-company", "PROJECT", entityId))?.altText, "Synthetic local QA image");

    const removed = await removeEntityMedia("demo-company", "PROJECT", entityId, uploaded.media!.id);
    assert.equal(removed.media, null);
    assert.equal((await loadEntityMedia("demo-company", "PROJECT", entityId)), null);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
