import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateForDailySiteLog,
  canTransitionDailySiteLog,
  createDraftDailySiteLog,
  emptyDailySiteLogsWorkspaceData,
  eventForDailySiteLogTransition,
  replaceDailySiteLogAggregate,
  reportNumberForSiteDate,
  mergeDailySiteLogsWorkspaceData,
  scopeDailySiteLogsToProject,
  transitionDailySiteLog,
  validateDailySiteLogAggregate,
} from "../src/lib/dailySiteLogs.ts";

const NOW = new Date("2026-08-27T08:00:00.000Z");

function draft() {
  return createDraftDailySiteLog({
    id: "00000000-0000-4000-8000-000000000001",
    companyId: "00000000-0000-4000-8000-000000000010",
    projectId: "00000000-0000-4000-8000-000000000020",
    siteDate: "2026-08-27",
    workSummary: "Placed concrete at the north bay.",
    weather: { condition: "CLEAR", temperature: 31, humidity: 60 },
    crew: [{ id: "00000000-0000-4000-8000-000000000101", crewLabel: "Concrete crew", headcount: 12, regularHours: 8 }],
    equipment: [{ id: "00000000-0000-4000-8000-000000000201", equipmentName: "Concrete pump", operatingHours: 6, idleHours: 0.5 }],
    safety: [{ id: "00000000-0000-4000-8000-000000000301", category: "Access", severity: "OBSERVATION", description: "Hose route was redirected.", actionTaken: "Route cordoned." }],
    now: NOW,
  });
}

test("daily Site Log domain normalizes a complete observational aggregate", () => {
  const aggregate = draft();
  assert.equal(aggregate.log.reportNumber, "DSL-20260827");
  assert.equal(aggregate.log.status, "DRAFT");
  assert.equal(aggregate.crew[0]?.headcount, 12);
  assert.equal(aggregate.equipment[0]?.operatingHours, 6);
  assert.equal(aggregate.safety[0]?.isResolved, true);
  validateDailySiteLogAggregate(aggregate);
});

test("daily Site Log lifecycle only permits draft submission and submitted finalization", () => {
  const aggregate = draft();
  assert.equal(canTransitionDailySiteLog("DRAFT", "SUBMITTED"), true);
  assert.equal(canTransitionDailySiteLog("DRAFT", "FINALIZED"), false);
  const submitted = transitionDailySiteLog(aggregate.log, "SUBMITTED", { actorUserId: "submitter", now: NOW });
  const finalized = transitionDailySiteLog(submitted, "FINALIZED", { actorUserId: "reviewer", now: new Date("2026-08-27T09:00:00.000Z") });
  assert.equal(finalized.status, "FINALIZED");
  assert.equal(finalized.submittedByUserId, "submitter");
  assert.equal(finalized.finalizedByUserId, "reviewer");
  assert.throws(() => transitionDailySiteLog(aggregate.log, "FINALIZED"), /cannot transition/i);
  assert.throws(() => transitionDailySiteLog(finalized, "VOID", { reason: "Correction" }), /cannot transition/i);
  assert.throws(() => transitionDailySiteLog(aggregate.log, "VOID"), /Void reason is required/i);
});

test("daily Site Log validation rejects invalid dates, missing work, crew, and child identity", () => {
  assert.equal(reportNumberForSiteDate("2026-02-28"), "DSL-20260228");
  assert.throws(() => reportNumberForSiteDate("2026-02-30"), /valid YYYY-MM-DD/i);
  const aggregate = draft();
  assert.throws(() => validateDailySiteLogAggregate({ ...aggregate, log: { ...aggregate.log, workSummary: "" } }), /Work summary is required/i);
  assert.throws(() => validateDailySiteLogAggregate({ ...aggregate, weather: undefined }), /Weather condition is required/i);
  assert.throws(() => validateDailySiteLogAggregate({ ...aggregate, crew: [] }), /crew\/headcount/i);
  assert.throws(() => createDraftDailySiteLog({ ...aggregate.log, projectId: aggregate.log.projectId, siteDate: "2026-02-31", now: NOW }), /valid YYYY-MM-DD/i);
  assert.throws(() => createDraftDailySiteLog({ projectId: aggregate.log.projectId, siteDate: aggregate.log.siteDate, crew: [{ headcount: 1 }] }), /needs a trade/i);
  assert.throws(() => createDraftDailySiteLog({ projectId: aggregate.log.projectId, siteDate: aggregate.log.siteDate, weather: { condition: "UNKNOWN_WEATHER" as never } }), /Weather condition is not supported/i);
  assert.throws(() => createDraftDailySiteLog({ projectId: aggregate.log.projectId, siteDate: aggregate.log.siteDate, safety: [{ category: "Test", severity: "UNKNOWN" as never, description: "Observation" }] }), /severity is not supported/i);
});

test("daily Site Log aggregate replacement preserves formal lifecycle history and scopes children", () => {
  const initial = draft();
  let data = replaceDailySiteLogAggregate(emptyDailySiteLogsWorkspaceData(), initial);
  const submitted = transitionDailySiteLog(initial.log, "SUBMITTED", { now: NOW });
  const event = eventForDailySiteLogTransition(initial.log, submitted, { now: NOW });
  data = replaceDailySiteLogAggregate(data, { ...initial, log: submitted, events: [...initial.events, event] });
  const selected = aggregateForDailySiteLog(data, initial.log.id);
  assert.equal(selected?.log.status, "SUBMITTED");
  assert.equal(selected?.events.length, 2);
  assert.equal(data.logs.length, 1);
  assert.equal(data.crew.length, 1);
});

test("project Site Log snapshots scope every child row and merge without discarding other projects", () => {
  const first = draft();
  const second = createDraftDailySiteLog({
    ...first.log,
    id: "00000000-0000-4000-8000-000000000002",
    projectId: "00000000-0000-4000-8000-000000000021",
    siteDate: "2026-08-28",
    workSummary: "Second project observation.",
    crew: first.crew.map((row) => ({ ...row, id: "00000000-0000-4000-8000-000000000102" })),
    equipment: first.equipment.map((row) => ({ ...row, id: "00000000-0000-4000-8000-000000000202" })),
    safety: first.safety.map((row) => ({ ...row, id: "00000000-0000-4000-8000-000000000302" })),
    now: NOW,
  });
  const companySnapshot = replaceDailySiteLogAggregate(
    replaceDailySiteLogAggregate(emptyDailySiteLogsWorkspaceData(), first),
    second,
  );

  const scoped = scopeDailySiteLogsToProject(companySnapshot, first.log.projectId);
  assert.deepEqual(scoped.logs.map((log) => log.id), [first.log.id]);
  assert.deepEqual(scoped.weather.map((row) => row.siteLogId), [first.log.id]);
  assert.deepEqual(scoped.crew.map((row) => row.siteLogId), [first.log.id]);
  assert.deepEqual(scoped.events.map((row) => row.siteLogId), [first.log.id]);

  const changed = { ...first, log: { ...first.log, workSummary: "Updated first project observation." } };
  const changedProjectData = replaceDailySiteLogAggregate(emptyDailySiteLogsWorkspaceData(), changed);
  const merged = mergeDailySiteLogsWorkspaceData(companySnapshot, first.log.projectId, changedProjectData);
  assert.equal(merged.logs.length, 2);
  assert.equal(merged.logs.find((log) => log.id === first.log.id)?.workSummary, "Updated first project observation.");
  assert.equal(merged.logs.find((log) => log.id === second.log.id)?.workSummary, "Second project observation.");
  assert.equal(merged.crew.filter((row) => row.siteLogId === second.log.id).length, 1);
});
