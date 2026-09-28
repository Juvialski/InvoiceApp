import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyApplicationValidationScope,
  classifyWorkflowMapScope,
} from "../scripts/ci/protectedCiScope.ts";

const pullRequest = { eventName: "pull_request", fileListComplete: true } as const;

test("Application Validation gives domain QA tooling its lint/typecheck and QA-test-only path", () => {
  assert.deepEqual(
    classifyApplicationValidationScope([
      "scripts/qa/scenarios/invoices.ts",
      "tests/demoQaInvoiceScenarios.test.ts",
      "docs/implementation-notes.md",
    ], pullRequest),
    { mode: "qa-only", reason: "browser-qa-tooling-or-assertion-only-changes" },
  );
});

test("Application Validation keeps real product and mixed product/QA changes on the full path", () => {
  assert.equal(classifyApplicationValidationScope(["src/components/invoices/SupplierInvoiceReview.tsx"], pullRequest).mode, "application");
  assert.equal(classifyApplicationValidationScope([
    "scripts/qa/scenarios/invoices.ts",
    "src/components/invoices/SupplierInvoiceReview.tsx",
  ], pullRequest).mode, "application");
  assert.equal(classifyApplicationValidationScope(["scripts/qa/scenarios/unmapped.ts"], pullRequest).mode, "application");
});

test("Application Validation fast-passes documentation-only changes", () => {
  assert.equal(classifyApplicationValidationScope(["docs/AGENT_EXECUTION_EFFICIENCY.md"], pullRequest).mode, "irrelevant");
});

test("Application Validation fast-passes unrelated workflow-only changes without masking application files", () => {
  const workflowPath = ".github/workflows/one-time-prod-migration-20260927095636.yml";
  assert.equal(classifyApplicationValidationScope([workflowPath], pullRequest).mode, "irrelevant");
  assert.equal(classifyApplicationValidationScope([
    workflowPath,
    "src/components/expenses/ExpensesPage.tsx",
  ], pullRequest).mode, "application");
});

test("Application Validation fails closed for incomplete, invalid, and non-PR scope", () => {
  assert.equal(classifyApplicationValidationScope(["docs/README.md"], { eventName: "pull_request", fileListComplete: false }).mode, "application");
  assert.equal(classifyApplicationValidationScope(["../outside.ts"], pullRequest).mode, "application");
  assert.equal(classifyApplicationValidationScope([], pullRequest).mode, "application");
  assert.equal(classifyApplicationValidationScope(["docs/README.md"], { eventName: "push", fileListComplete: true }).mode, "application");
});

test("Workflow Map fast-passes domain assertion modules but keeps metadata and evidence bridges", () => {
  assert.equal(classifyWorkflowMapScope(["scripts/qa/scenarios/invoices.ts"], pullRequest).mode, "irrelevant");
  assert.equal(classifyWorkflowMapScope(["scripts/qa/scenarios/shared.ts"], pullRequest).mode, "irrelevant");
  assert.equal(classifyWorkflowMapScope(["scripts/qa/demoScenarioActions.ts"], pullRequest).mode, "irrelevant");
  assert.equal(classifyWorkflowMapScope(["scripts/qa/demoScenarioMetadata.ts"], pullRequest).mode, "source-contract");
  assert.equal(classifyWorkflowMapScope(["scripts/qa/structuredEvidence.ts"], pullRequest).mode, "source-contract");
});

test("Workflow Map fast-passes unrelated workflow-only changes and retains mapped sources", () => {
  const workflowPath = ".github/workflows/one-time-prod-migration-20260927095636.yml";
  assert.equal(classifyWorkflowMapScope([workflowPath], pullRequest).mode, "irrelevant");
  assert.equal(classifyWorkflowMapScope([workflowPath, "src/utils/routes.ts"], pullRequest).mode, "source-contract");
});

test("Workflow Map does not fast-pass unknown QA bridge files or source-contract inputs", () => {
  for (const path of [
    "scripts/qa/unmappedBridge.ts",
    "scripts/workflow-map/graph.ts",
    "tests/workflowMapConsistency.test.ts",
    "src/features/registry.ts",
    ".github/workflows/workflow-map-consistency.yml",
  ]) {
    assert.equal(classifyWorkflowMapScope([path], pullRequest).mode, "source-contract", `${path} must stay protected`);
  }
});

test("Workflow Map fails closed for incomplete, invalid, and non-PR scope", () => {
  assert.equal(classifyWorkflowMapScope(["scripts/qa/scenarios/invoices.ts"], { eventName: "pull_request", fileListComplete: false }).mode, "source-contract");
  assert.equal(classifyWorkflowMapScope(["../outside.ts"], pullRequest).mode, "source-contract");
  assert.equal(classifyWorkflowMapScope([], pullRequest).mode, "source-contract");
  assert.equal(classifyWorkflowMapScope(["docs/README.md"], { eventName: "push", fileListComplete: true }).mode, "source-contract");
});
