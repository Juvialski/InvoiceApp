import { appendFileSync, readFileSync } from "node:fs";
import { classifyQaReleasePaths } from "../../src/lib/qaReleaseOrchestration.ts";

const paths = readFileSync(0, "utf8").split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
const manualHostedQa = String(process.env.QA_RELEASE_MANUAL_HOSTED_QA || "").trim().toLowerCase() === "true";
const classification = classifyQaReleasePaths(paths, manualHostedQa);
const values = {
  change_class: classification.changeClass,
  has_migration: classification.hasMigration ? "true" : "false",
  has_runtime: classification.hasRuntime ? "true" : "false",
  has_hosted_qa_harness: classification.hasHostedQaHarness ? "true" : "false",
  requires_hosted_qa: classification.requiresHostedQa ? "true" : "false",
};

console.log(`QA release classification=${classification.changeClass} migration=${values.has_migration} runtime=${values.has_runtime} hosted-qa=${values.requires_hosted_qa}`);
const outputPath = String(process.env.GITHUB_OUTPUT || "").trim();
if (outputPath) appendFileSync(outputPath, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n")}\n`, "utf8");
