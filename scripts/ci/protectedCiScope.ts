export type ApplicationValidationMode = "application" | "qa-only" | "irrelevant";
export type WorkflowMapValidationMode = "source-contract" | "irrelevant";

export interface ChangedFileClassificationOptions {
  readonly eventName?: string;
  readonly fileListComplete?: boolean;
}

export interface ApplicationValidationScope {
  readonly mode: ApplicationValidationMode;
  readonly reason: string;
}

export interface WorkflowMapValidationScope {
  readonly mode: WorkflowMapValidationMode;
  readonly reason: string;
}

const QA_SCENARIO_MODULES = new Set([
  "cash",
  "dashboard",
  "documents",
  "engineering",
  "expenses",
  "help",
  "inventory",
  "invoices",
  "messaging",
  "payroll",
  "procurement",
  "projects",
  "settings",
  "shared",
]);

const QA_ONLY_SCRIPT_FILES = new Set([
  "scripts/ci/protectedCiScope.ts",
  "scripts/ci/selectProtectedCiScope.ts",
  "scripts/demo-visual-qa.ts",
  "scripts/qa/demoFeatureSelection.ts",
  "scripts/qa/demoScenarioActions.ts",
  "scripts/qa/demoScenarioMetadata.ts",
  "scripts/qa/demoScenarios.ts",
  "scripts/qa/selectDemoQaScope.ts",
  "scripts/qa/structuredEvidence.ts",
  "scripts/qa/workerPool.ts",
  "scripts/qa/browser-runtime/package.json",
  "scripts/qa/browser-runtime/package-lock.json",
]);

const WORKFLOW_MAP_IRRELEVANT_QA_FILES = new Set([
  "scripts/ci/protectedCiScope.ts",
  "scripts/ci/selectProtectedCiScope.ts",
  "scripts/demo-visual-qa.ts",
  "scripts/qa/demoFeatureSelection.ts",
  "scripts/qa/demoScenarioActions.ts",
  "scripts/qa/demoScenarios.ts",
  "scripts/qa/selectDemoQaScope.ts",
  "scripts/qa/workerPool.ts",
  "tests/structuredBrowserEvidence.test.ts",
  "tests/protectedCiScope.test.ts",
]);

function invalidScope(reason: string): ApplicationValidationScope {
  return { mode: "application", reason };
}

function invalidWorkflowScope(reason: string): WorkflowMapValidationScope {
  return { mode: "source-contract", reason };
}

function normalizeChangedPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || /^[a-z]:\//i.test(normalized) || normalized.split("/").includes("..")) return null;
  return normalized.replace(/\/+/g, "/");
}

function qaScenarioModulePath(repoPath: string): boolean {
  const match = /^scripts\/qa\/scenarios\/([a-z0-9-]+)\.ts$/i.exec(repoPath);
  return Boolean(match && QA_SCENARIO_MODULES.has(match[1]!.toLowerCase()));
}

function isDocumentationOrPolicyPath(repoPath: string): boolean {
  return /^(?:docs|artifacts)\//i.test(repoPath)
    || /^(?:README|CHANGELOG|LICENSE|CONTRIBUTING|CODE_OF_CONDUCT)(?:\.[^/]*)?$/i.test(repoPath)
    || /^AGENTS\.md$/i.test(repoPath);
}

function isQaOnlyScriptPath(repoPath: string): boolean {
  return QA_ONLY_SCRIPT_FILES.has(repoPath)
    || qaScenarioModulePath(repoPath)
    || /^tests\/demoQa[A-Za-z0-9_-]*\.test\.ts$/i.test(repoPath)
    || repoPath === "tests/structuredBrowserEvidence.test.ts"
    || repoPath === "tests/protectedCiScope.test.ts";
}

function isApplicationValidationInput(repoPath: string): boolean {
  return repoPath.startsWith("src/")
    || repoPath.startsWith("tests/")
    || repoPath.startsWith("scripts/")
    || repoPath.startsWith("public/")
    || /^package.*\.json$/.test(repoPath)
    || /^tsconfig(?:\.[^/]*)?\.json$/.test(repoPath)
    || repoPath === ".github/workflows/application-validation.yml";
}

function normalizeCompleteChangedFiles(
  changedFiles: unknown,
  options: ChangedFileClassificationOptions,
): string[] | null {
  if (options.eventName !== "pull_request") return null;
  if (options.fileListComplete !== true || !Array.isArray(changedFiles) || changedFiles.length === 0) return null;
  const normalized: string[] = [];
  for (const changedFile of changedFiles) {
    const path = normalizeChangedPath(changedFile);
    if (!path) return null;
    normalized.push(path);
  }
  return [...new Set(normalized)].sort();
}

export function classifyApplicationValidationScope(
  changedFiles: unknown,
  options: ChangedFileClassificationOptions = {},
): ApplicationValidationScope {
  if (options.eventName !== "pull_request") return invalidScope("non-pull-request-events-run-application-validation");
  const paths = normalizeCompleteChangedFiles(changedFiles, options);
  if (!paths) return invalidScope("changed-file-list-incomplete-or-invalid");

  let hasQaOnlyInput = false;
  for (const repoPath of paths) {
    if (isDocumentationOrPolicyPath(repoPath)
      || (repoPath.startsWith(".github/") && repoPath !== ".github/workflows/application-validation.yml")
      || repoPath.startsWith("supabase/")) continue;
    if (isQaOnlyScriptPath(repoPath)) {
      hasQaOnlyInput = true;
      continue;
    }
    if (isApplicationValidationInput(repoPath)) {
      return { mode: "application", reason: "application-or-unknown-validation-input" };
    }
    return invalidScope("unknown-changed-file-fails-closed");
  }

  return hasQaOnlyInput
    ? { mode: "qa-only", reason: "browser-qa-tooling-or-assertion-only-changes" }
    : { mode: "irrelevant", reason: "no-application-validation-inputs" };
}

function isWorkflowMapInput(repoPath: string): boolean {
  return repoPath.startsWith("src/utils/")
    || repoPath.startsWith("src/features/")
    || repoPath === "src/lib/engineeringCoordination.ts"
    || repoPath === "src/lib/dailySiteLogs.ts"
    || repoPath === "src/lib/financialSettlement.ts"
    || repoPath === "src/lib/payroll.ts"
    || repoPath === "src/types.ts"
    || repoPath.startsWith("src/assistant/")
    || repoPath.startsWith("src/server/assistant/")
    || repoPath === "src/app/applicationMode.ts"
    || repoPath.startsWith("src/demo/")
    || repoPath === "src/main.tsx"
    || repoPath.startsWith("scripts/workflow-map/")
    || repoPath === "scripts/qa/demoScenarioMetadata.ts"
    || repoPath === "scripts/qa/structuredEvidence.ts"
    || /^tests\/workflowMap.*\.test\.ts$/.test(repoPath)
    || repoPath.startsWith("supabase/migrations/")
    || repoPath.startsWith("docs/architecture/")
    || repoPath === "docs/ENGORYX_ENGINEERING_QA_AGENT_CONTEXT.md"
    || repoPath === "package.json"
    || repoPath === "package-lock.json"
    || repoPath === "tsconfig.json"
    || repoPath === ".github/workflows/workflow-map-consistency.yml";
}

function isWorkflowMapIrrelevantQaPath(repoPath: string): boolean {
  return WORKFLOW_MAP_IRRELEVANT_QA_FILES.has(repoPath)
    || qaScenarioModulePath(repoPath)
    || repoPath.startsWith("scripts/qa/browser-runtime/")
    || /^tests\/demoQa[A-Za-z0-9_-]*\.test\.ts$/i.test(repoPath);
}

export function classifyWorkflowMapScope(
  changedFiles: unknown,
  options: ChangedFileClassificationOptions = {},
): WorkflowMapValidationScope {
  if (options.eventName !== "pull_request") return invalidWorkflowScope("non-pull-request-events-run-source-contract-checks");
  const paths = normalizeCompleteChangedFiles(changedFiles, options);
  if (!paths) return invalidWorkflowScope("changed-file-list-incomplete-or-invalid");

  for (const repoPath of paths) {
    if (isWorkflowMapInput(repoPath)) return { mode: "source-contract", reason: "workflow-map-or-source-contract-input" };
    if (isWorkflowMapIrrelevantQaPath(repoPath)
      || isDocumentationOrPolicyPath(repoPath)
      || repoPath.startsWith(".github/")
      || repoPath.startsWith("supabase/")) continue;
    if (repoPath.startsWith("scripts/qa/")) {
      return invalidWorkflowScope("unknown-qa-workflow-map-boundary-fails-closed");
    }
  }

  return { mode: "irrelevant", reason: "no-workflow-map-or-source-contract-inputs" };
}
