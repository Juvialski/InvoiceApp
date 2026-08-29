import test from "node:test";
import assert from "node:assert/strict";
import { createDraftDailySiteLog } from "../src/lib/dailySiteLogs.ts";
import {
  dailySiteLogAggregateToRpcPayload,
  dailySiteLogCrewFromRow,
  dailySiteLogAddendumFromRow,
  dailySiteLogFromRow,
  readDailySiteLogsFromLocal,
  writeDailySiteLogsToLocal,
} from "../src/lib/dailySiteLogsPersistence.ts";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  } as unknown as Storage;
}

test("Daily Site Log persistence maps database rows and RPC payloads without payroll fields", () => {
  const row = dailySiteLogFromRow({ id: "log-1", company_id: "company-1", project_id: "project-1", site_date: "2026-08-27", report_number: "DSL-20260827", status: "SUBMITTED", work_summary: "Concrete", created_at: "2026-08-27T08:00:00Z", updated_at: "2026-08-27T09:00:00Z", submitted_at: "2026-08-27T09:00:00Z" });
  assert.equal(row.siteDate, "2026-08-27");
  assert.equal(row.status, "SUBMITTED");
  const crew = dailySiteLogCrewFromRow({ id: "crew-1", company_id: "company-1", site_log_id: "log-1", crew_label: "Concrete", headcount: "12", sort_order: 0, created_at: "2026-08-27T08:00:00Z", updated_at: "2026-08-27T08:00:00Z" });
  const aggregate = createDraftDailySiteLog({ projectId: "project-1", siteDate: "2026-08-27", workSummary: "Concrete", weather: { condition: "CLEAR" }, crew: [{ crewLabel: "Concrete", headcount: 12 }] });
  const payload = dailySiteLogAggregateToRpcPayload({ ...aggregate, crew: [crew] });
  assert.equal(payload.p_site_date, "2026-08-27");
  assert.equal((payload.p_crew as Array<Record<string, unknown>>)[0]?.crew_label, "Concrete");
  assert.equal("attendance" in payload, false);
  assert.equal("payroll" in payload, false);
  const addendum = dailySiteLogAddendumFromRow({ id: "addendum-1", company_id: "company-1", site_log_id: "log-1", addendum_number: 1, reason: "Corrected reference", correction_text: "Use inspection IR-204.", created_at: "2026-08-27T10:00:00Z" });
  assert.equal(addendum.addendumNumber, 1);
  assert.equal(addendum.correctionText, "Use inspection IR-204.");
});
test("Daily Site Log local fallback round-trips a complete isolated workspace", () => {
  const target = storage();
  const data = { logs: [{ id: "log-1" }], weather: [], crew: [], equipment: [], safety: [], events: [], addenda: [] } as any;
  writeDailySiteLogsToLocal(data, target);
  assert.deepEqual(readDailySiteLogsFromLocal(target), data);
});
