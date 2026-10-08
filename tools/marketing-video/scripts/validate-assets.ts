import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMMERCIAL_DURATION_IN_FRAMES, COMMERCIAL_DURATION_SECONDS, SCENES } from "../src/data/scenes";
import { MARKETING_ASSETS, MARKETING_ASSET_BY_ID, type PreparedCaptureManifest } from "../src/data/assets";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(workspaceRoot, "public", "captures", "asset-manifest.json");

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as PreparedCaptureManifest;
  assert.equal(manifest.campaignDataset, "MKT-V3A");
  assert.ok(manifest.sourceCaptureSha, "prepared manifest records source SHA");
  assert.ok(manifest.sourceCapturedAt, "prepared manifest records source capture time");

  const ids = SCENES.map((scene) => scene.id);
  assert.equal(new Set(ids).size, ids.length, "scene IDs are unique");
  assert.ok(SCENES.some((scene) => scene.id === "opening"), "opening scene exists");
  assert.ok(SCENES.some((scene) => scene.id === "closing"), "closing scene exists");
  assert.ok(COMMERCIAL_DURATION_IN_FRAMES > 0);
  assert.ok(COMMERCIAL_DURATION_SECONDS >= 55 && COMMERCIAL_DURATION_SECONDS <= 70, "runtime stays within the approved window");

  const workbook = SCENES.find((scene) => scene.id === "operations-workbook");
  assert.ok(workbook);
  assert.ok(workbook.durationInFrames / COMMERCIAL_DURATION_IN_FRAMES <= 0.10, "workbook stays under 10% of runtime");

  const referencedAssetIds = new Set(SCENES.flatMap((scene) => scene.beats.map((beat) => beat.assetId)));
  for (const scene of SCENES) {
    assert.ok(scene.durationInFrames > 0, `${scene.id} has a positive duration`);
    assert.ok(scene.title.trim().length > 0, `${scene.id} has a title`);
    assert.ok(scene.caption.split(/\s+/).filter(Boolean).length <= 10, `${scene.id} caption stays concise`);
    for (const beat of scene.beats) {
      assert.ok(beat.durationInFrames > 0, `${scene.id} beat has a positive duration`);
      assert.ok(MARKETING_ASSET_BY_ID.has(beat.assetId), `${scene.id} references a declared asset: ${beat.assetId}`);
    }
    if (scene.style === "montage") {
      assert.equal(scene.beats.reduce((sum, beat) => sum + beat.durationInFrames, 0), scene.durationInFrames, `${scene.id} beat durations add up`);
    }
    if (scene.style === "desktop" || scene.style === "closing") {
      assert.equal(scene.beats.length, 1, `${scene.id} uses one desktop capture`);
      assert.equal(scene.beats[0]?.durationInFrames, scene.durationInFrames, `${scene.id} beat covers the scene`);
    }
    if (scene.style === "mobile") {
      assert.equal(scene.beats.length, 2, "mobile transition uses the matched desktop and vertical Site Logs captures");
      assert.ok(scene.beats.every((beat) => beat.durationInFrames === scene.durationInFrames));
    }
  }

  for (const definition of MARKETING_ASSETS) {
    assert.ok(definition.width > 0 && definition.height > 0, `${definition.id} has a known source size`);
    assert.ok(definition.dataset.length > 0 && definition.claimBoundary.length > 0, `${definition.id} has source context`);
    const prepared = manifest.assets[definition.id];
    assert.ok(prepared, `prepared asset exists: ${definition.id}`);
    assert.equal(prepared.routeId, definition.routeId, `${definition.id} route is preserved`);
    assert.equal(prepared.dataset, definition.dataset, `${definition.id} dataset boundary is preserved`);
    assert.equal(prepared.width / prepared.height, definition.width / definition.height, `${definition.id} aspect ratio is known`);
    assert.ok(["video", "still"].includes(prepared.kind));
    assert.equal(prepared.kind === "video" ? prepared.trimBeforeFrames : 0, prepared.trimBeforeFrames, `${definition.id} startup trim matches media type`);
    if (prepared.kind === "video") assert.ok(prepared.trimBeforeFrames >= 90, `${definition.id} skips initial page load frames`);
    await access(path.join(workspaceRoot, "public", prepared.file.replaceAll("/", path.sep)));
  }

  assert.ok([...referencedAssetIds].every((id) => MARKETING_ASSET_BY_ID.has(id)));
  process.stdout.write(
    `Asset contract passed: ${SCENES.length} scenes, ${COMMERCIAL_DURATION_SECONDS.toFixed(1)} seconds, ${referencedAssetIds.size} scene assets.\n`,
  );
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
