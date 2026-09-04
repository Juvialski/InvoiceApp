import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildProjectEngineeringCoordinationSummary,
  controlledProjectEngineeringSourceState,
} from "../src/utils/projectEngineeringCoordination.ts";

const projectsPageSource = readFileSync(new URL("../src/components/projects/ProjectsPage.tsx", import.meta.url), "utf8");

test("controlled engineering data still respects domain read permission", () => {
  assert.deepEqual(controlledProjectEngineeringSourceState(false, false), { state: "not-permitted" });
  assert.deepEqual(controlledProjectEngineeringSourceState(false, undefined, true), { state: "loading" });
  assert.deepEqual(controlledProjectEngineeringSourceState(false, true), { state: "available" });
  assert.deepEqual(controlledProjectEngineeringSourceState(true, false), { state: "available" });
});

test("restricted engineering source states ignore accidentally supplied records", () => {
  const summary = buildProjectEngineeringCoordinationSummary({
    projectId: "project-1",
    today: "2026-09-04",
    documents: {
      state: "not-permitted",
      documents: [{ id: "doc-1", projectId: "project-1" } as never],
      revisions: [{ id: "rev-1", documentId: "doc-1", createdAt: "2026-09-01" } as never],
    },
    rfis: {
      state: "not-permitted",
      records: [{ id: "rfi-1", projectId: "project-1", rfiNumber: "RFI-1", status: "OPEN", dueDate: "2026-09-01" } as never],
    },
    submittals: {
      state: "loading",
      records: [{ id: "sub-1", projectId: "project-1", submittalNumber: "SUB-1", status: "UNDER_REVIEW", dueReviewDate: "2026-09-01" } as never],
    },
    siteLogs: {
      state: "unavailable",
      records: [{ id: "log-1", projectId: "project-1", status: "FINALIZED", siteDate: "2026-09-03" } as never],
    },
  });

  assert.equal(summary.documents.state, "not-permitted");
  assert.equal(summary.documents.count, undefined);
  assert.equal(summary.documents.latestActivityDate, undefined);
  assert.equal(summary.rfis.count, undefined);
  assert.equal(summary.rfis.openCount, undefined);
  assert.equal(summary.rfis.overdueCount, undefined);
  assert.equal(summary.submittals.count, undefined);
  assert.equal(summary.submittals.awaitingReviewCount, undefined);
  assert.equal(summary.siteLogs.count, undefined);
  assert.equal(summary.siteLogs.latestSiteDate, undefined);
  assert.deepEqual(summary.attentionSignals, []);
});

test("portfolio management keeps procurement-only detail out of actual-cost classification", () => {
  const marker = "return buildProjectManagementView(p, summary, {";
  const start = projectsPageSource.indexOf(marker);
  assert.notEqual(start, -1);
  const tail = projectsPageSource.slice(start + marker.length);
  const end = tail.indexOf("      });");
  assert.notEqual(end, -1);
  const optionsSource = tail.slice(0, end);

  assert.match(optionsSource, /subcontractClaims/);
  assert.doesNotMatch(optionsSource, /\bpurchaseOrders\b/);
  assert.doesNotMatch(optionsSource, /\bsubcontracts\b/);
  assert.doesNotMatch(optionsSource, /\bsubcontractVariations\b/);
  assert.match(optionsSource, /procurement-only detail out of cost-code actual classification/);
});
