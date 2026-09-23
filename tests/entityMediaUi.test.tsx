import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EntityMediaControl, EntityMediaThumbnail } from "../src/components/ui/EntityMedia.tsx";
import type { EntityMedia } from "../src/lib/entityMediaTypes.ts";

const media: EntityMedia = {
  id: "media-1",
  entityType: "PROJECT",
  entityId: "project-1",
  purpose: "COVER",
  url: "https://storage.example.test/signed-image",
  contentType: "image/png",
  sizeBytes: 1024,
  sha256: "a".repeat(64),
  altText: "Synthetic project image",
  createdAt: "2026-09-23T00:00:00.000Z",
  updatedAt: "2026-09-23T00:00:00.000Z",
};

test("entity image thumbnail keeps a fixed cropped surface and accessible alt text", () => {
  const html = renderToStaticMarkup(<EntityMediaThumbnail media={media} label="Project" alt="A water project" className="h-12 w-16 aspect-[4/3]" />);
  assert.match(html, /hqs-surface-muted/);
  assert.match(html, /aspect-\[4\/3\]/);
  assert.match(html, /src="https:\/\/storage\.example\.test\/signed-image"/);
  assert.match(html, /alt="A water project"/);
  assert.match(html, /object-cover/);
});

test("missing media uses a readable fallback without rendering a broken-image source", () => {
  const html = renderToStaticMarkup(<EntityMediaThumbnail label="Equipment" fallback={<span>EQ</span>} />);
  assert.match(html, />EQ</);
  assert.doesNotMatch(html, /<img/);
});

test("entity image mutation controls are hidden unless the caller has manage authority", () => {
  const readOnly = renderToStaticMarkup(<EntityMediaControl entityType="MATERIAL" entityId="item-1" label="Material" canManage={false} />);
  assert.doesNotMatch(readOnly, /Upload image|Replace|Remove/);

  const manager = renderToStaticMarkup(<EntityMediaControl entityType="MATERIAL" entityId="item-1" label="Material" canManage />);
  assert.match(manager, /Upload image/);
  assert.match(manager, /image\/jpeg,image\/png,image\/webp/);
  assert.match(manager, /Image description/);
});
