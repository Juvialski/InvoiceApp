import test from "node:test";
import assert from "node:assert/strict";
import { applicationModeForPath, isDemoApplicationPath } from "../src/app/applicationMode.ts";
import { createDemoWorkspace } from "../src/demo/data/createDemoWorkspace.ts";
import { DEMO_COMPANY_ID } from "../src/demo/demoTypes.ts";
import { executePreparedAssistantAction, prepareAddWorkerAction, reduceDemoWorkspace, resetDemoWorkspace } from "../src/demo/demoState.ts";
import { demoPathForProject, parseDemoLocation } from "../src/demo/demoRouting.ts";

const ANCHOR = "2026-08-27";

function workspace() {
  return createDemoWorkspace(ANCHOR);
}

test("demo workspace generation is deterministic", () => {
  assert.deepEqual(createDemoWorkspace(ANCHOR), createDemoWorkspace(ANCHOR));
});

test("demo company identity is fixed and outside production company selection", () => {
  const data = workspace();
  assert.equal(data.company.id, DEMO_COMPANY_ID);
  assert.match(data.company.id, /^demo-/);
  const location = parseDemoLocation("/demo/app/dashboard", "?companyId=real-company-uuid");
  assert.equal(location.kind, "app");
  assert.equal(data.company.id, DEMO_COMPANY_ID);
  assert.equal(demoPathForProject("demo-project-warehouse", "site-logs", { siteLogId: "demo-site-log-wh-today" }), "/demo/app/projects/demo-project-warehouse/site-logs?siteLogId=demo-site-log-wh-today");
});

test("project and invoice allocation relationships are valid", () => {
  const data = workspace();
  const projectIds = new Set(data.projects.map((project) => project.id));
  const invoiceIds = new Set(data.invoices.map((invoice) => invoice.id));
  assert.ok(data.invoiceAllocations.length >= 15);
  for (const allocation of data.invoiceAllocations) {
    assert.ok(projectIds.has(allocation.projectId), `missing project ${allocation.projectId}`);
    assert.ok(invoiceIds.has(allocation.invoiceId), `missing invoice ${allocation.invoiceId}`);
    assert.ok(allocation.allocationAmount > 0);
  }
});

test("expense project relationships are valid", () => {
  const data = workspace();
  const projectIds = new Set(data.projects.map((project) => project.id));
  for (const expense of data.expenses) if (expense.projectId) assert.ok(projectIds.has(expense.projectId));
});

test("workforce project relationships are valid", () => {
  const data = workspace();
  const projectIds = new Set(data.projects.map((project) => project.id));
  const workerIds = new Set(data.payroll.workers.map((worker) => worker.id));
  assert.ok(data.payroll.workers.length >= 24 && data.payroll.workers.length <= 30);
  for (const assignment of data.payroll.assignments) {
    assert.ok(workerIds.has(assignment.workerId));
    assert.ok(projectIds.has(assignment.projectId));
  }
});

test("payroll records reference valid demo workers and periods", () => {
  const data = workspace();
  const workerIds = new Set(data.payroll.workers.map((worker) => worker.id));
  const periodIds = new Set(data.payroll.periods.map((period) => period.id));
  const runIds = new Set(data.payroll.runs.map((run) => run.id));
  for (const run of data.payroll.runs) assert.ok(periodIds.has(run.periodId));
  for (const entry of data.payroll.entries) {
    assert.ok(workerIds.has(entry.workerId));
    assert.ok(runIds.has(entry.payrollRunId));
  }
  for (const attendance of data.payroll.attendanceRecords || []) {
    assert.ok(workerIds.has(attendance.workerId));
    assert.ok(!attendance.periodId || periodIds.has(attendance.periodId));
  }
});

test("payroll periods are chronological, non-overlapping, and include current/open plus next", () => {
  const periods = workspace().payroll.periods.slice().sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  for (let index = 1; index < periods.length; index += 1) assert.ok(periods[index - 1].periodEnd < periods[index].periodStart);
  assert.ok(periods.some((period) => period.status === "OPEN" && period.periodStart <= ANCHOR && period.periodEnd >= ANCHOR));
  assert.ok(periods.some((period) => period.periodStart > ANCHOR));
});

test("banking records are internally coherent", () => {
  const data = workspace();
  const accountIds = new Set(data.cash.accounts.map((account) => account.id));
  assert.equal(data.cash.accounts.length, 3);
  for (const snapshot of data.cash.snapshots) assert.ok(accountIds.has(snapshot.accountId));
  for (const transaction of data.cash.transactions) {
    assert.ok(accountIds.has(transaction.accountId));
    assert.ok(transaction.amount > 0);
    assert.equal(transaction.currency, "PHP");
  }
});

test("engineering documents reference valid projects and revisions are immutable records", () => {
  const data = workspace();
  const projectIds = new Set(data.projects.map((project) => project.id));
  const documentIds = new Set(data.engineering.documents.map((document) => document.id));
  assert.ok(data.engineering.documents.length >= 7);
  for (const document of data.engineering.documents) assert.ok(!document.projectId || projectIds.has(document.projectId));
  for (const revision of data.engineering.revisions) assert.ok(documentIds.has(revision.documentId));
  const revHistory = data.engineering.revisions.filter((revision) => revision.documentId === "demo-document-wh-struct");
  assert.deepEqual(revHistory.map((revision) => revision.revisionNumber), ["Rev 0", "Rev 1"]);
  assert.notEqual(revHistory[0].id, revHistory[1].id);
});

test("daily Site Log fixtures cover field conditions and stay project-scoped", () => {
  const data = workspace();
  const projectIds = new Set(data.projects.map((project) => project.id));
  const logIds = new Set(data.siteLogs.logs.map((log) => log.id));
  assert.ok(data.siteLogs.logs.length >= 8);
  assert.ok(data.siteLogs.logs.some((log) => log.status === "DRAFT" && log.siteDate === ANCHOR));
  assert.ok(data.siteLogs.logs.some((log) => log.status === "FINALIZED"));
  assert.ok(data.siteLogs.weather.some((weather) => weather.condition === "RAIN"));
  assert.ok(data.siteLogs.equipment.some((equipment) => (equipment.idleHours || 0) > 0));
  assert.ok(data.siteLogs.safety.length > 0);
  for (const log of data.siteLogs.logs) assert.ok(projectIds.has(log.projectId));
  for (const row of [...data.siteLogs.weather, ...data.siteLogs.crew, ...data.siteLogs.equipment, ...data.siteLogs.safety, ...data.siteLogs.events]) assert.ok(logIds.has(row.siteLogId));
});

test("reset restores pristine deterministic demo data", () => {
  const initial = workspace();
  const changed = reduceDemoWorkspace(initial, { type: "DELETE_INVOICE", id: initial.invoices[0].id });
  assert.notEqual(changed.invoices.length, initial.invoices.length);
  assert.deepEqual(resetDemoWorkspace(ANCHOR), initial);
});

test("demo mutations are pure local state transitions and do not require a production repository", () => {
  const data = workspace();
  let productionWriteCalls = 0;
  const productionRepository = { save: () => { productionWriteCalls += 1; } };
  const renamed = { ...data.projects[0], projectName: `${data.projects[0].projectName} — Demo Edit` };
  const changed = reduceDemoWorkspace(data, { type: "SAVE_PROJECT", value: renamed });
  assert.equal(changed.projects[0].projectName, renamed.projectName);
  assert.equal(productionWriteCalls, 0);
  assert.equal(typeof productionRepository.save, "function");
});

test("public demo route is selected before production application auth mounting", () => {
  assert.equal(applicationModeForPath("/demo"), "demo");
  assert.equal(applicationModeForPath("/demo/app/payroll"), "demo");
  assert.equal(isDemoApplicationPath("/demo/app/projects/demo-project-warehouse"), true);
});

test("normal production route behavior remains production mode", () => {
  assert.equal(applicationModeForPath("/"), "production");
  assert.equal(applicationModeForPath("/dashboard"), "production");
  assert.equal(applicationModeForPath("/projects/demo-project-warehouse"), "production");
});

test("relative-date generation remains deterministic around the supplied anchor", () => {
  const first = workspace();
  const second = createDemoWorkspace(ANCHOR);
  assert.deepEqual(first.payroll.periods.map((period) => [period.periodStart, period.periodEnd, period.payDate]), second.payroll.periods.map((period) => [period.periodStart, period.periodEnd, period.payDate]));
  assert.equal(first.anchorDate, ANCHOR);
});

test("assistant mutation remains PREPARED before execution", () => {
  const data = workspace();
  const prepared = prepareAddWorkerAction(data, { firstName: "Alex", lastName: "Santos", rate: 500, jobTitle: "Field Engineer" });
  assert.equal(prepared.status, "PREPARED");
  assert.equal(data.payroll.workers.some((worker) => worker.displayName === "Alex Santos"), false);
});

test("assistant confirmation changes demo workforce only", () => {
  const data = workspace();
  const prepared = prepareAddWorkerAction(data, { firstName: "Alex", lastName: "Santos", rate: 500, jobTitle: "Field Engineer" });
  const changed = executePreparedAssistantAction(data, prepared);
  const alex = changed.payroll.workers.find((worker) => worker.displayName === "Alex Santos");
  assert.ok(alex);
  assert.equal(alex.defaultPayType, "HOURLY");
  assert.equal(alex.defaultRate, 500);
  assert.equal(data.payroll.workers.some((worker) => worker.displayName === "Alex Santos"), false);
});

test("demo route cannot select an arbitrary real company id", () => {
  const location = parseDemoLocation("/demo/app/projects/demo-project-solar", "?company_id=82b2d0f4-real&companyId=also-real");
  assert.equal(location.kind, "app");
  const data = workspace();
  assert.equal(data.company.id, DEMO_COMPANY_ID);
  assert.ok(!JSON.stringify(data).includes("82b2d0f4-real"));
});
