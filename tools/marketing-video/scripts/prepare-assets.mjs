import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assetDefinitions from "../src/data/assets.json" with { type: "json" };

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, "..");
const repositoryRoot = path.resolve(workspaceRoot, "..", "..");
const captureRoot = path.join(repositoryRoot, "artifacts", "marketing-capture", "mkt-v2a-full-app");
const outputRoot = path.join(workspaceRoot, "public", "captures");
const captureManifestPath = path.join(captureRoot, "manifest.json");
const outputManifestPath = path.join(outputRoot, "asset-manifest.json");
const CAPTURE_STARTUP_TRIM_FRAMES = 105;

function safeSourcePath(relativePath) {
  const resolved = path.resolve(captureRoot, relativePath);
  if (!resolved.startsWith(`${captureRoot}${path.sep}`)) {
    throw new Error(`MKT-V2A manifest contains an unsafe asset path: ${relativePath}`);
  }
  return resolved;
}

async function exists(filePath) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  let captureManifest;
  try {
    captureManifest = JSON.parse(await readFile(captureManifestPath, "utf8"));
  } catch {
    throw new Error(
      "MKT-V2A captures are unavailable. From the repository root, run `npm.cmd run build` and then `npx.cmd tsx scripts/marketing-capture.ts`.",
    );
  }

  if (captureManifest.campaignDataset !== "MKT-V2A") {
    throw new Error(`Expected an MKT-V2A capture manifest; received ${String(captureManifest.campaignDataset)}.`);
  }
  if (!Array.isArray(captureManifest.frames) || !Array.isArray(captureManifest.clips)) {
    throw new Error("MKT-V2A capture manifest must include frame and clip inventories.");
  }

  await mkdir(outputRoot, { recursive: true });
  const preparedAssets = {};
  let videoCount = 0;
  let stillCount = 0;

  for (const definition of assetDefinitions) {
    const frameRecord = captureManifest.frames.find(
      (item) => item.routeId === definition.routeId && item.profile === definition.profile && item.dataset === definition.dataset,
    );
    const clipRecord = definition.profile === "pc-1080p"
      ? captureManifest.clips.find((item) => item.routeId === definition.routeId && item.profile === definition.profile && item.dataset === definition.dataset)
      : undefined;

    const clipPath = clipRecord ? safeSourcePath(clipRecord.file) : undefined;
    // Ready-state stills avoid playback loops returning to route loading frames.
    const useClip = !frameRecord && clipPath ? await exists(clipPath) : false;
    const sourceRecord = useClip ? clipRecord : frameRecord;
    if (!sourceRecord) {
      throw new Error(`No matching MKT-V2A source frame or clip was found for ${definition.id} (${definition.routeId}).`);
    }

    const sourcePath = useClip ? clipPath : safeSourcePath(sourceRecord.file);
    if (!(await exists(sourcePath))) {
      throw new Error(`The selected MKT-V2A source file is missing for ${definition.id}: ${sourceRecord.file}`);
    }

    const kind = useClip ? "video" : "still";
    const file = `captures/${definition.id}.${useClip ? "webm" : "png"}`;
    const destination = path.join(workspaceRoot, "public", file.replaceAll("/", path.sep));
    await copyFile(sourcePath, destination);

    preparedAssets[definition.id] = {
      id: definition.id,
      file,
      kind,
      width: definition.width,
      height: definition.height,
      trimBeforeFrames: useClip ? CAPTURE_STARTUP_TRIM_FRAMES : 0,
      routeId: definition.routeId,
      dataset: definition.dataset,
      claimBoundary: definition.claimBoundary,
    };
    if (useClip) videoCount += 1;
    else stillCount += 1;
  }

  const preparedManifest = {
    campaignDataset: "MKT-V3A",
    sourceCaptureSha: captureManifest.sourceSha,
    sourceWorkingTreeClean: Boolean(captureManifest.workingTreeClean),
    sourceCapturedAt: captureManifest.capturedAt,
    generatedAt: new Date().toISOString(),
    assets: preparedAssets,
  };
  await writeFile(outputManifestPath, `${JSON.stringify(preparedManifest, null, 2)}\n`, "utf8");
  process.stdout.write(
    `Prepared ${Object.keys(preparedAssets).length} capture assets (${videoCount} WebM, ${stillCount} still fallback) from MKT-V2A.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
