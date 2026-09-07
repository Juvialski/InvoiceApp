import { readFileSync } from "node:fs";
import path from "node:path";
import { parseDeploymentManifest, validateDeploymentManifest } from "../../src/lib/deploymentManifest.ts";

function usage() {
  console.log("Usage: npm.cmd run deployment:validate -- --file <deployment-inventory.json>");
}

function fileArgument(args: readonly string[]) {
  const index = args.indexOf("--file");
  return index >= 0 && args[index + 1] ? args[index + 1] : "";
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  usage();
  process.exit(0);
}

const requestedFile = fileArgument(args);
if (!requestedFile) {
  usage();
  console.error("Error: --file <deployment-inventory.json> is required.");
  process.exit(1);
}

const filePath = path.resolve(process.cwd(), requestedFile);
try {
  const input = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  const result = validateDeploymentManifest(input);
  if (!result.valid) {
    console.error(JSON.stringify({ valid: false, file: filePath, errors: result.errors, warnings: result.warnings }, null, 2));
    process.exit(1);
  }
  const manifest = parseDeploymentManifest(input);
  console.log(JSON.stringify({ valid: true, file: filePath, schemaVersion: manifest.schemaVersion, repository: manifest.repository, deploymentCount: manifest.deployments.length, deploymentIds: manifest.deployments.map((entry) => entry.deploymentId), warnings: result.warnings }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ valid: false, file: filePath, errors: [error instanceof Error ? error.message : "The deployment manifest could not be read."] }, null, 2));
  process.exit(1);
}
