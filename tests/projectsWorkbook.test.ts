import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import type { Project, ProjectCostCode } from "../src/types.ts";
import {
  PROJECTS_WORKBOOK_SCHEMA,
  applyProjectsImport,
  buildProjectsImportReview,
  exportProjectsWorkbook,
  type ProjectsImportContext,
} from "../src/lib/projectsWorkbook.ts";

const COMPANY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const COST_CODE_ID = "33333333-3333-4333-8333-333333333333";
const SECOND_COST_CODE_ID = "44444444-4444-4444-8444-444444444444";

function project(id = PROJECT_ID, code = "PRJ-001"): Project {
  return {
    id,
    projectCode: code,
    projectName: "Water Treatment Upgrade",
    description: "Civil and mechanical works",
    clientName: "Metro Water",
    clientReference: "MW-001",
    billingContactName: "Maria Santos",
    billingEmail: "billing@example.test",
    billingAddress: "Quezon City",
    location: "Quezon City",
    siteAddress: "Plant 1",
    projectManager: "Engr. Santos",
    status: "ACTIVE",
    startDate: "2026-01-10",
    targetEndDate: "2026-12-31",
    contractValue: 1500,
    projectBudget: 1000,
    currency: "PHP",
    taxTreatment: "VAT",
    notes: "Keep operational access clear.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
}

function costCode(id = COST_CODE_ID, projectId = PROJECT_ID, budget = 600): ProjectCostCode {
  return {
    id,
    projectId,
    code: id === COST_CODE_ID ? "CIVIL" : "MECH",
    name: id === COST_CODE_ID ? "Civil Works" : "Mechanical Works",
    description: "Work package",
    status: "ACTIVE",
    approvedBudgetAmount: budget,
    forecastAmount: budget + 50,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
}

function context(overrides: Partial<ProjectsImportContext> = {}): ProjectsImportContext {
  return {
    expectedCompanyId: COMPANY_ID,
    projects: [project(), project(SECOND_PROJECT_ID, "PRJ-002")],
    costCodes: [costCode(), costCode(SECOND_COST_CODE_ID, PROJECT_ID, 300)],
    canWrite: true,
    ...overrides,
  };
}

function setCell(bytes: Uint8Array, sheetName: string, header: string, value: unknown, rowNumber = 1) {
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  const headers = (rows[0] || []).map((item) => String(item));
  const column = headers.indexOf(header);
  assert.notEqual(column, -1, `${sheetName} must contain ${header}`);
  const address = XLSX.utils.encode_cell({ r: rowNumber, c: column });
  sheet[address] = { t: typeof value === "number" ? "n" : "s", v: value };
  sheet["!ref"] = sheet["!ref"] || `A1:${XLSX.utils.encode_cell({ r: rowNumber, c: headers.length - 1 })}`;
  return new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }));
}

test("Projects workbook exports the bounded schema with stable hidden identities", () => {
  assert.deepEqual(PROJECTS_WORKBOOK_SCHEMA.sheets.map((sheet) => sheet.name), ["Projects", "Cost Codes"]);
  const artifact = exportProjectsWorkbook({ ...context(), fileName: "projects.xlsx" });
  assert.equal(artifact.fileName, "projects.xlsx");
  const parsed = buildProjectsImportReview(artifact.bytes, context(), { fileName: artifact.fileName });
  assert.equal(parsed.proposals.length, 2);
  assert.equal(parsed.proposals.every((proposal) => proposal.status === "UNCHANGED"), true);
  assert.equal(parsed.omittedProjectIds.length, 0);
  assert.equal(parsed.omittedCostCodeIds.length, 0);
});

test("review permits safe project master-data edits but protects lifecycle and derived financial fields", () => {
  const artifact = exportProjectsWorkbook(context());
  let bytes = setCell(artifact.bytes, "Projects", "Project Name", "Water Treatment Upgrade - Revised");
  bytes = setCell(bytes, "Projects", "Status", "ARCHIVED");
  bytes = setCell(bytes, "Projects", "Currency", "USD");
  bytes = setCell(bytes, "Projects", "Actual Cost", 99999);
  const review = buildProjectsImportReview(bytes, context());
  const proposal = review.proposals.find((candidate) => candidate.projectId === PROJECT_ID);
  assert.ok(proposal);
  assert.equal(proposal?.status, "UNSUPPORTED_PROTECTED_FIELD");
  assert.equal(proposal?.canApply, false);
  assert.ok(proposal?.changes.some((change) => change.field === "projectName" && change.editable));
  assert.ok(proposal?.changes.some((change) => change.field === "status" && !change.editable));
  assert.ok(proposal?.changes.some((change) => change.field === "currency" && !change.editable));
  assert.ok(proposal?.changes.some((change) => change.field === "actualCost" && !change.editable));
});

test("review detects stale application edits and workbook identity tampering", () => {
  const artifact = exportProjectsWorkbook(context());
  const workbookEdit = setCell(artifact.bytes, "Projects", "Project Name", "Workbook Name");
  const stale = buildProjectsImportReview(workbookEdit, context({ projects: [project(PROJECT_ID, "PRJ-001"), { ...project(SECOND_PROJECT_ID, "PRJ-002"), projectName: "Changed in app", updatedAt: "2026-01-03T00:00:00.000Z" }] }));
  const staleProposal = stale.proposals.find((candidate) => candidate.projectId === PROJECT_ID);
  assert.equal(staleProposal?.status, "WORKBOOK_ONLY_CHANGE");

  const tampered = setCell(artifact.bytes, "Projects", "__HQ Record ID", SECOND_PROJECT_ID);
  const tamperedReview = buildProjectsImportReview(tampered, context());
  const tamperedProposal = tamperedReview.proposals.find((candidate) => candidate.label.includes("PRJ-001"));
  assert.ok(tamperedProposal?.status === "UNAUTHORIZED" || tamperedProposal?.status === "INVALID");
  assert.equal(tamperedProposal?.canApply, false);

  const fingerprintTampered = setCell(artifact.bytes, "Projects", "__HQ Fingerprint", "tampered-fingerprint");
  const fingerprintReview = buildProjectsImportReview(fingerprintTampered, context());
  const fingerprintProposal = fingerprintReview.proposals.find((candidate) => candidate.projectId === PROJECT_ID);
  assert.equal(fingerprintProposal?.status, "INVALID");
  assert.equal(fingerprintProposal?.canApply, false);
});

test("combined cost-code budgets are validated per project and new or missing rows never imply deletion", () => {
  const artifact = exportProjectsWorkbook(context());
  const overBudget = setCell(artifact.bytes, "Cost Codes", "Approved Budget", 800);
  const review = buildProjectsImportReview(overBudget, context());
  const proposal = review.proposals.find((candidate) => candidate.projectId === PROJECT_ID);
  assert.equal(proposal?.status, "INVALID");
  assert.equal(proposal?.canApply, false);
  assert.equal(review.omittedProjectIds.length, 0);

  const workbook = XLSX.read(artifact.bytes, { type: "array" });
  const costSheet = workbook.Sheets["Cost Codes"];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(costSheet, { header: 1, raw: true, defval: null });
  XLSX.utils.sheet_add_aoa(costSheet, [rows[1]], { origin: -1 });
  const duplicateBytes = new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array" }));
  const duplicateReview = buildProjectsImportReview(duplicateBytes, context());
  assert.ok(duplicateReview.proposals.some((candidate) => candidate.status === "INVALID"));
});

test("required workbook values fail closed instead of silently becoming zero or unchanged", () => {
  const artifact = exportProjectsWorkbook(context());
  const blankNameReview = buildProjectsImportReview(setCell(artifact.bytes, "Projects", "Project Name", ""), context());
  const blankNameProposal = blankNameReview.proposals.find((candidate) => candidate.projectId === PROJECT_ID);
  assert.equal(blankNameProposal?.status, "INVALID");
  assert.equal(blankNameProposal?.canApply, false);

  const bytes = setCell(artifact.bytes, "Projects", "Approved Project Budget", "not-a-number");
  const review = buildProjectsImportReview(bytes, context());
  const proposal = review.proposals.find((candidate) => candidate.projectId === PROJECT_ID);
  assert.equal(proposal?.status, "INVALID");
  assert.equal(proposal?.canApply, false);
  assert.ok(proposal?.messages.some((message) => message.includes("Project Name") || message.includes("Approved Project Budget")));

  const invalidTaxReview = buildProjectsImportReview(setCell(artifact.bytes, "Projects", "Tax Treatment", "INVALID"), context());
  const invalidTaxProposal = invalidTaxReview.proposals.find((candidate) => candidate.projectId === PROJECT_ID);
  assert.equal(invalidTaxProposal?.status, "INVALID");
  assert.equal(invalidTaxProposal?.canApply, false);

  const declassifiedReview = buildProjectsImportReview(setCell(artifact.bytes, "Projects", "Tax Treatment", "UNCLASSIFIED"), context());
  const declassifiedProposal = declassifiedReview.proposals.find((candidate) => candidate.projectId === PROJECT_ID);
  assert.equal(declassifiedProposal?.status, "INVALID");
  assert.equal(declassifiedProposal?.canApply, false);

  const alreadyUnclassified = { ...project(), taxTreatment: "UNCLASSIFIED" as const };
  const unclassifiedArtifact = exportProjectsWorkbook(context({ projects: [alreadyUnclassified, project(SECOND_PROJECT_ID, "PRJ-002")] }));
  const unchangedUnclassified = buildProjectsImportReview(
    unclassifiedArtifact.bytes,
    context({ projects: [alreadyUnclassified, project(SECOND_PROJECT_ID, "PRJ-002")] }),
  );
  assert.equal(unchangedUnclassified.proposals.find((candidate) => candidate.projectId === PROJECT_ID)?.status, "UNCHANGED");
});

test("Apply sends one authoritative group with expected versions and keeps read-only review non-mutating", async () => {
  const artifact = exportProjectsWorkbook(context());
  const bytes = setCell(artifact.bytes, "Projects", "Contract Value", 1700);
  const review = buildProjectsImportReview(bytes, context());
  const proposal = review.proposals.find((candidate) => candidate.projectId === PROJECT_ID);
  assert.ok(proposal?.canApply);

  const applied: unknown[] = [];
  const result = await applyProjectsImport(review, context(), {
    applyGroup: async (group) => { applied.push(group); },
  }, [proposal!.id]);
  assert.deepEqual(result.appliedProposalIds, [proposal!.id]);
  assert.equal(applied.length, 1);
  assert.equal((applied[0] as { expectedProjectUpdatedAt: string }).expectedProjectUpdatedAt, "2026-01-02T00:00:00.000Z");

  const appliedGroup = applied[0] as { project: Project };
  assert.equal(appliedGroup.project.contractValue, 1700);
  assert.equal(appliedGroup.project.projectBudget, 1000);

  const readOnlyReview = buildProjectsImportReview(bytes, context({ canWrite: false }));
  assert.equal(readOnlyReview.proposals.find((candidate) => candidate.projectId === PROJECT_ID)?.canApply, false);
});

test("real XLSX round trip re-exports authoritative applied state without conflating contract value and budget", async () => {
  let authoritativeProjects = context().projects.map((candidate) => ({ ...candidate }));
  const authoritativeCostCodes = context().costCodes.map((candidate) => ({ ...candidate }));
  const initial = exportProjectsWorkbook({ ...context(), projects: authoritativeProjects, costCodes: authoritativeCostCodes });
  const edited = setCell(initial.bytes, "Projects", "Contract Value", 1750);
  const review = buildProjectsImportReview(edited, context({ projects: authoritativeProjects, costCodes: authoritativeCostCodes }));
  const proposal = review.proposals.find((candidate) => candidate.projectId === PROJECT_ID);
  assert.ok(proposal?.canApply);

  await applyProjectsImport(
    review,
    context({ projects: authoritativeProjects, costCodes: authoritativeCostCodes }),
    {
      applyGroup: async (group) => {
        authoritativeProjects = authoritativeProjects.map((candidate) =>
          candidate.id === group.project.id
            ? { ...group.project, updatedAt: "2026-01-03T00:00:00.000Z" }
            : candidate,
        );
      },
    },
    [proposal!.id],
  );

  const updatedProject = authoritativeProjects.find((candidate) => candidate.id === PROJECT_ID);
  assert.equal(updatedProject?.contractValue, 1750);
  assert.equal(updatedProject?.projectBudget, 1000);

  const reexported = exportProjectsWorkbook({
    ...context(),
    projects: authoritativeProjects,
    costCodes: authoritativeCostCodes,
  });
  const cleanReview = buildProjectsImportReview(
    reexported.bytes,
    context({ projects: authoritativeProjects, costCodes: authoritativeCostCodes }),
  );
  assert.equal(cleanReview.proposals.find((candidate) => candidate.projectId === PROJECT_ID)?.status, "UNCHANGED");
});
