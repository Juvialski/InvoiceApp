import { appendFileSync } from "node:fs";
import {
  classifyApplicationValidationScope,
  classifyWorkflowMapScope,
} from "./protectedCiScope.ts";

const scopeKind = process.env.PROTECTED_CI_SCOPE;
const eventName = process.env.GITHUB_EVENT_NAME || "";
const fileListComplete = process.env.PROTECTED_CI_FILE_LIST_COMPLETE === "true";
let changedFiles: unknown;
try {
  changedFiles = process.env.PROTECTED_CI_CHANGED_FILES
    ? JSON.parse(process.env.PROTECTED_CI_CHANGED_FILES) as unknown
    : undefined;
} catch {
  changedFiles = undefined;
}

const scope = scopeKind === "workflow-map"
  ? classifyWorkflowMapScope(changedFiles, { eventName, fileListComplete })
  : classifyApplicationValidationScope(changedFiles, { eventName, fileListComplete });
const outputs = [
  "run=" + (scope.mode === "irrelevant" ? "false" : "true"),
  "mode=" + scope.mode,
  "reason=" + scope.reason,
].join("\n");

if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, outputs + "\n", "utf8");
process.stdout.write(JSON.stringify(scope, null, 2) + "\n");
