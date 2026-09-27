import assert from "node:assert/strict";
import test from "node:test";
import type { Project, ProjectCostCode } from "../src/types.ts";
import {
  applyCostCodeWorkbookDraftValue,
  applyProjectControlsWorkbookSheetDrafts,
  applyProjectWorkbookDraftValue,
  buildProjectControlsWorkbookApplyPlan,
  ProjectControlsWorkbookApplyError,
  saveProjectControlsWorkbookRows,
  type ProjectControlsWorkbookRecords,
} from "../src/lib/projectsWorkbookEditing.ts";

const project: Project = {
  id: "project-1",
  projectCode: "PRJ-001",
  projectName: "Water Upgrade",
  clientName: "Aqua Client",
  status: "ACTIVE",
  startDate: "2026-01-01",
  contractValue: 2500,
  projectBudget: 1000,
  currency: "PHP",
  taxTreatment: "VAT",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const costCode: ProjectCostCode = {
  id: "cost-code-1",
  companyId: "company-1",
  projectId: project.id,
  code: "01-GEN",
  name: "General works",
  description: "Mobilization",
  status: "ACTIVE",
  approvedBudgetAmount: 500,
  forecastAmount: 450,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

function records(overrides: Partial<ProjectControlsWorkbookRecords> = {}): ProjectControlsWorkbookRecords {
  return { projects: [project], costCodes: [costCode], ...overrides };
}

function plan(input: {
  sheetId: "projects" | "cost-codes";
  stagedRows: readonly (Project | ProjectCostCode)[];
  baseRecords?: ProjectControlsWorkbookRecords;
  currentRecords?: ProjectControlsWorkbookRecords;
}) {
  const baseRecords = input.baseRecords || records();
  return buildProjectControlsWorkbookApplyPlan({
    sheetId: input.sheetId,
    stagedRows: input.stagedRows,
    baseRecords,
    currentRecords: input.currentRecords || baseRecords,
    expectedCompanyId: "company-1",
  });
}

test("Projects worksheet applies only supported master fields through the existing project group contract", () => {
  let staged = applyProjectWorkbookDraftValue(project, "projectCode", " prj-002 ");
  staged = applyProjectWorkbookDraftValue(staged, "projectName", " River Intake ");
  staged = applyProjectWorkbookDraftValue(staged, "billingEmail", "billing@example.com");
  staged = applyProjectWorkbookDraftValue(staged, "contractValue", 3000);
  staged = applyProjectWorkbookDraftValue(staged, "projectBudget", 900);

  const result = plan({ sheetId: "projects", stagedRows: [staged] });
  assert.deepEqual(result.issues, []);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0]?.expectedProjectUpdatedAt, project.updatedAt);
  assert.equal(result.groups[0]?.project.projectCode, "PRJ-002");
  assert.equal(result.groups[0]?.project.projectName, "River Intake");
  assert.equal(result.groups[0]?.project.billingEmail, "billing@example.com");
  assert.equal(result.groups[0]?.project.contractValue, 3000);
  assert.equal(result.groups[0]?.project.projectBudget, 900);
  assert.equal(result.groups[0]?.project.status, project.status);
  assert.equal(result.groups[0]?.project.currency, project.currency);
  assert.deepEqual(result.groups[0]?.costCodes, []);
});

test("Cost Codes worksheet applies safe fields while retaining parent, status, and expected versions", () => {
  let staged = applyCostCodeWorkbookDraftValue(costCode, "code", "02-civil");
  staged = applyCostCodeWorkbookDraftValue(staged, "name", "Earthworks");
  staged = applyCostCodeWorkbookDraftValue(staged, "description", "Excavation");
  staged = applyCostCodeWorkbookDraftValue(staged, "approvedBudgetAmount", 600);
  staged = applyCostCodeWorkbookDraftValue(staged, "forecastAmount", 575);

  const result = plan({ sheetId: "cost-codes", stagedRows: [staged] });
  assert.deepEqual(result.issues, []);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0]?.project.id, project.id);
  assert.equal(result.groups[0]?.expectedProjectUpdatedAt, project.updatedAt);
  assert.deepEqual(result.groups[0]?.costCodes, [{
    id: costCode.id,
    projectId: project.id,
    code: "02-CIVIL",
    name: "Earthworks",
    description: "Excavation",
    approvedBudgetAmount: 600,
    forecastAmount: 575,
    status: "ACTIVE",
    updatedAt: costCode.updatedAt,
  }]);
});

test("project identity, lifecycle, currency, cost-code parent, and lifecycle metadata cannot be staged", () => {
  const changedProject = { ...project, projectName: "Changed", status: "COMPLETED" as const };
  const projectResult = plan({ sheetId: "projects", stagedRows: [changedProject] });
  assert.equal(projectResult.groups.length, 0);
  assert.equal(projectResult.issues.some((item) => item.kind === "access"), true);

  const changedCode = { ...costCode, code: "02-CIVIL", projectId: "other-project", status: "ARCHIVED" as const };
  const codeResult = plan({ sheetId: "cost-codes", stagedRows: [changedCode] });
  assert.equal(codeResult.groups.length, 0);
  assert.equal(codeResult.issues.some((item) => item.kind === "access"), true);
});

test("invalid required, numeric, date, email, and cost-code values block all groups", () => {
  const invalidProject = applyProjectWorkbookDraftValue(project, "projectName", "   ");
  const missingName = plan({ sheetId: "projects", stagedRows: [invalidProject] });
  assert.equal(missingName.groups.length, 0);
  assert.ok(missingName.issues.some((item) => item.fieldId === "projectName"));

  let invalidAmounts = applyProjectWorkbookDraftValue(project, "contractValue", -1);
  invalidAmounts = applyProjectWorkbookDraftValue(invalidAmounts, "billingEmail", "invalid-email");
  invalidAmounts = applyProjectWorkbookDraftValue(invalidAmounts, "targetEndDate", "2026-02-31");
  invalidAmounts = applyProjectWorkbookDraftValue(invalidAmounts, "projectBudget", Number.NaN);
  const projectErrors = plan({ sheetId: "projects", stagedRows: [invalidAmounts] });
  assert.equal(projectErrors.groups.length, 0);
  assert.ok(projectErrors.issues.some((item) => item.fieldId === "contractValue"));
  assert.ok(projectErrors.issues.some((item) => item.fieldId === "billingEmail"));
  assert.ok(projectErrors.issues.some((item) => item.fieldId === "targetEndDate"));
  assert.ok(projectErrors.issues.some((item) => item.fieldId === "projectBudget"));

  const invalidCode = applyCostCodeWorkbookDraftValue(costCode, "approvedBudgetAmount", -1);
  const codeErrors = plan({ sheetId: "cost-codes", stagedRows: [invalidCode] });
  assert.equal(codeErrors.groups.length, 0);
  assert.ok(codeErrors.issues.some((item) => item.fieldId === "approvedBudgetAmount"));
});

test("duplicate Project Codes proposed across multiple staged rows are rejected before Apply", () => {
  const secondProject: Project = {
    ...project,
    id: "project-2",
    projectCode: "PRJ-002",
    projectName: "Pump Station",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
  const baseRecords: ProjectControlsWorkbookRecords = {
    projects: [project, secondProject],
    costCodes: [costCode],
  };
  const firstDraft = applyProjectWorkbookDraftValue(project, "projectCode", "PRJ-NEW");
  const secondDraft = applyProjectWorkbookDraftValue(secondProject, "projectCode", "prj-new");

  const result = plan({
    sheetId: "projects",
    stagedRows: [firstDraft, secondDraft],
    baseRecords,
    currentRecords: baseRecords,
  });

  assert.equal(result.groups.length, 0);
  assert.ok(result.issues.some((item) => item.fieldId === "projectCode" && /more than one project/i.test(item.message)));
});

test("active cost-code budgets cannot exceed the approved project budget from either sheet", () => {
  const lowerBudget = applyProjectWorkbookDraftValue(project, "projectBudget", 400);
  const projectPlan = plan({ sheetId: "projects", stagedRows: [lowerBudget] });
  assert.equal(projectPlan.groups.length, 0);
  assert.ok(projectPlan.issues.some((item) => item.fieldId === "projectBudget" && /Active cost-code budgets/.test(item.message)));

  const higherCodeBudget = applyCostCodeWorkbookDraftValue(costCode, "approvedBudgetAmount", 1100);
  const codePlan = plan({ sheetId: "cost-codes", stagedRows: [higherCodeBudget] });
  assert.equal(codePlan.groups.length, 0);
  assert.ok(codePlan.issues.some((item) => item.fieldId === "approvedBudgetAmount" && /Active cost-code budgets/.test(item.message)));
});

test("stale Project and Cost Code timestamps block overwrite", () => {
  const projectDraft = applyProjectWorkbookDraftValue(project, "projectName", "Workbook edit");
  const staleProject = { ...project, projectName: "Changed elsewhere", updatedAt: "2026-01-03T00:00:00.000Z" };
  const projectResult = plan({ sheetId: "projects", stagedRows: [projectDraft], currentRecords: records({ projects: [staleProject] }) });
  assert.equal(projectResult.groups.length, 0);
  assert.ok(projectResult.issues.some((item) => item.kind === "conflict"));

  const costCodeDraft = applyCostCodeWorkbookDraftValue(costCode, "name", "Workbook edit");
  const staleCostCode = { ...costCode, name: "Changed elsewhere", updatedAt: "2026-01-03T00:00:00.000Z" };
  const codeResult = plan({ sheetId: "cost-codes", stagedRows: [costCodeDraft], currentRecords: records({ costCodes: [staleCostCode] }) });
  assert.equal(codeResult.groups.length, 0);
  assert.ok(codeResult.issues.some((item) => item.kind === "conflict"));
});

test("authoritative refresh revalidates stale Projects and Cost Codes before any group is applied", async () => {
  const projectDraft = applyProjectWorkbookDraftValue(project, "projectName", "Workbook edit");
  const latestProject = { ...project, projectName: "Changed elsewhere", updatedAt: "2026-01-03T00:00:00.000Z" };
  let projectApplies = 0;
  await assert.rejects(
    applyProjectControlsWorkbookSheetDrafts({
      sheetId: "projects",
      stagedRows: [projectDraft],
      baseRecords: records(),
      refresh: async () => records({ projects: [latestProject] }),
      applyGroup: async () => { projectApplies += 1; },
      isContextCurrent: () => true,
    }),
    (error: unknown) => error instanceof ProjectControlsWorkbookApplyError && error.kind === "conflict" && error.phase === "preflight",
  );
  assert.equal(projectApplies, 0);

  const costCodeDraft = applyCostCodeWorkbookDraftValue(costCode, "name", "Workbook edit");
  const latestCostCode = { ...costCode, name: "Changed elsewhere", updatedAt: "2026-01-03T00:00:00.000Z" };
  let costCodeApplies = 0;
  await assert.rejects(
    applyProjectControlsWorkbookSheetDrafts({
      sheetId: "cost-codes",
      stagedRows: [costCodeDraft],
      baseRecords: records(),
      refresh: async () => records({ costCodes: [latestCostCode] }),
      applyGroup: async () => { costCodeApplies += 1; },
      isContextCurrent: () => true,
    }),
    (error: unknown) => error instanceof ProjectControlsWorkbookApplyError && error.kind === "conflict" && error.phase === "preflight",
  );
  assert.equal(costCodeApplies, 0);
});

test("worksheet Apply refreshes before mutation and after success, grouped by project", async () => {
  const draft = applyCostCodeWorkbookDraftValue(costCode, "forecastAmount", 475);
  const events: string[] = [];
  let refreshCount = 0;
  const result = await applyProjectControlsWorkbookSheetDrafts({
    sheetId: "cost-codes",
    stagedRows: [draft],
    baseRecords: records(),
    expectedCompanyId: "company-1",
    refresh: async () => {
      refreshCount += 1;
      events.push("refresh");
      return records();
    },
    applyGroup: async (group) => {
      events.push("apply");
      assert.equal(group.expectedProjectUpdatedAt, project.updatedAt);
      assert.equal(group.costCodes.length, 1);
    },
    isContextCurrent: () => true,
  });

  assert.deepEqual(events, ["refresh", "apply", "refresh"]);
  assert.equal(refreshCount, 2);
  assert.equal(result.appliedGroupCount, 1);
});

test("company or access changes stop an in-flight Apply before the domain callback", async () => {
  const draft = applyProjectWorkbookDraftValue(project, "projectName", "Workbook edit");
  let applies = 0;
  await assert.rejects(
    applyProjectControlsWorkbookSheetDrafts({
      sheetId: "projects",
      stagedRows: [draft],
      baseRecords: records(),
      refresh: async () => records(),
      applyGroup: async () => { applies += 1; },
      isContextCurrent: () => false,
    }),
    (error: unknown) => error instanceof ProjectControlsWorkbookApplyError && error.kind === "context",
  );
  assert.equal(applies, 0);
});

test("synthetic demo save stays local and never calls project persistence or refresh", async () => {
  const draft = applyProjectWorkbookDraftValue(project, "projectName", "Synthetic edit");
  let localSaves = 0;
  let domainApplies = 0;
  let refreshes = 0;
  const result = await saveProjectControlsWorkbookRows({
    writeMode: "synthetic-demo",
    sheetId: "projects",
    stagedRows: [draft],
    baseRecords: records(),
    saveSyntheticRows: async (rows) => {
      localSaves += 1;
      assert.equal((rows[0] as Project).projectName, "Synthetic edit");
    },
    refresh: async () => {
      refreshes += 1;
      throw new Error("Demo must not refresh production records.");
    },
    applyGroup: async () => { domainApplies += 1; },
    isContextCurrent: () => true,
  });

  assert.equal(result.writeMode, "synthetic-demo");
  assert.equal(localSaves, 1);
  assert.equal(domainApplies, 0);
  assert.equal(refreshes, 0);
});

test("separate project groups do not claim a cross-project transaction after a later failure", async () => {
  const secondProject: Project = {
    ...project,
    id: "project-2",
    projectCode: "PRJ-002",
    projectName: "Pump Station",
  };
  const secondCostCode: ProjectCostCode = {
    ...costCode,
    id: "cost-code-2",
    projectId: secondProject.id,
    code: "02-GEN",
  };
  const baseRecords: ProjectControlsWorkbookRecords = {
    projects: [project, secondProject],
    costCodes: [costCode, secondCostCode],
  };
  const firstDraft = applyCostCodeWorkbookDraftValue(costCode, "forecastAmount", 475);
  const secondDraft = applyCostCodeWorkbookDraftValue(secondCostCode, "forecastAmount", 525);
  let calls = 0;

  await assert.rejects(
    applyProjectControlsWorkbookSheetDrafts({
      sheetId: "cost-codes",
      stagedRows: [firstDraft, secondDraft],
      baseRecords,
      refresh: async () => baseRecords,
      applyGroup: async (group) => {
        calls += 1;
        if (group.project.id === secondProject.id) throw new Error("Network interruption");
      },
      isContextCurrent: () => true,
    }),
    (error: unknown) => error instanceof ProjectControlsWorkbookApplyError
      && error.appliedGroupCount === 1
      && !error.allGroupsApplied
      && error.phase === "apply",
  );
  assert.equal(calls, 2);
});
