import fs from "node:fs/promises";
import path from "node:path";
import { WORKFLOW_GRAPH } from "./graph.ts";
import {
  generateWorkflowMapEvidenceOverlay,
  parseQaManifest,
} from "./evidence.ts";

function getArg(flag: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return fallback;
}

async function main(): Promise<void> {
  const manifestArg = getArg("--manifest", "artifacts/demo-visual-qa/manifest.json");
  const outArg = getArg("--out", "artifacts/demo-visual-qa/workflow-map-evidence.json");

  if (!manifestArg) {
    console.error("Error: --manifest argument is required.");
    process.exitCode = 1;
    return;
  }

  const manifestPath = path.resolve(manifestArg);
  const outputPath = path.resolve(outArg || path.join(path.dirname(manifestPath), "workflow-map-evidence.json"));

  let manifestContent: string;
  try {
    manifestContent = await fs.readFile(manifestPath, "utf8");
  } catch (err) {
    console.error(`Workflow Map Evidence Overlay: Could not read manifest at ${manifestPath}.`);
    console.error(`Reason: ${err instanceof Error ? err.message : String(err)}`);
    console.error("No overlay generated because the source manifest is absent or unreadable.");
    process.exitCode = 1;
    return;
  }

  let manifest;
  try {
    manifest = parseQaManifest(manifestContent);
  } catch (err) {
    console.error(`Workflow Map Evidence Overlay: Failed to parse manifest at ${manifestPath}.`);
    console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  const derivedOverlay = generateWorkflowMapEvidenceOverlay(WORKFLOW_GRAPH, manifest);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(derivedOverlay, null, 2)}\n`, "utf8");

  console.log(`Generated workflow map evidence overlay: ${outputPath}`);
  console.log(`Summary: ${derivedOverlay.summary.mappedNodes} mapped nodes (${derivedOverlay.summary.passCount} PASS, ${derivedOverlay.summary.failCount} FAIL, ${derivedOverlay.summary.partialCount} PARTIAL, ${derivedOverlay.summary.notRunCount} NOT_RUN) out of ${derivedOverlay.summary.totalNodes} total nodes.`);
  if (derivedOverlay.summary.unmappedRuntimeScenariosCount > 0) {
    console.log(`Notice: ${derivedOverlay.summary.unmappedRuntimeScenariosCount} runtime scenarios are not mapped to workflow nodes.`);
  }
}

main().catch((err) => {
  console.error("Workflow Map Evidence Overlay CLI failed:", err);
  process.exitCode = 1;
});
