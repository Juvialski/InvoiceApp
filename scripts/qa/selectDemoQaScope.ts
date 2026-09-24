import fs from "node:fs";
import { selectDemoQaScope } from "./demoFeatureSelection.ts";

const eventName = process.env.GITHUB_EVENT_NAME || "pull_request";
const fileListComplete = process.env.DEMO_QA_CHANGED_FILES_COMPLETE === "true";
let changedFiles: unknown;
try {
  changedFiles = process.env.DEMO_QA_CHANGED_FILES ? JSON.parse(process.env.DEMO_QA_CHANGED_FILES) as unknown : undefined;
} catch {
  changedFiles = undefined;
}

const scope = selectDemoQaScope(changedFiles, { eventName, fileListComplete });
const outputs = [
  `run=${scope.mode === "skip" ? "false" : "true"}`,
  `mode=${scope.mode}`,
  `features=${scope.features.join(",")}`,
  `routes=${scope.routeIds.join(",")}`,
  `reason=${scope.reason}`,
].join("\n");

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${outputs}\n`, "utf8");
}
process.stdout.write(`${JSON.stringify(scope, null, 2)}\n`);
