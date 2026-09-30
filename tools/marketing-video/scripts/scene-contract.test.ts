import assert from "node:assert/strict";
import test from "node:test";
import { MARKETING_ASSET_BY_ID } from "../src/data/assets";
import { COMMERCIAL_DURATION_IN_FRAMES, COMMERCIAL_DURATION_SECONDS, SCENES } from "../src/data/scenes";

test("MKT-V3A scenes form a bounded, asset-backed commercial", () => {
  assert.equal(new Set(SCENES.map((scene) => scene.id)).size, SCENES.length);
  assert.equal(SCENES[0]?.id, "opening");
  assert.equal(SCENES.at(-1)?.id, "closing");
  assert.ok(COMMERCIAL_DURATION_IN_FRAMES > 0);
  assert.ok(COMMERCIAL_DURATION_SECONDS >= 55 && COMMERCIAL_DURATION_SECONDS <= 70);

  for (const scene of SCENES) {
    assert.ok(scene.durationInFrames > 0);
    assert.ok(scene.beats.length > 0);
    assert.ok(scene.beats.every((beat) => beat.durationInFrames > 0 && MARKETING_ASSET_BY_ID.has(beat.assetId)));
    assert.ok(scene.caption.split(/\s+/).filter(Boolean).length <= 10);
  }
});

test("the workbook is a brief part of the wider product story", () => {
  const workbook = SCENES.find((scene) => scene.id === "operations-workbook");
  assert.ok(workbook);
  assert.ok(workbook.durationInFrames / COMMERCIAL_DURATION_IN_FRAMES <= 0.15);
});
