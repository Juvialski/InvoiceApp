import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  appPathForInvoice,
  appPathForAttendanceDate,
  appPathForPayrollPeriod,
  appPathForPayrollRun,
  appPathForProject,
  appPathForReviewInvoice,
  appPathForTab,
  appTabForLocation,
  isKnownWorkspaceLocation,
  parseAppLocation,
  attendanceDateFromSearch,
  payrollPeriodIdFromSearch,
  payrollRunIdFromSearch,
} from "../src/utils/appRouting.ts";
import { pathForAssistantAction } from "../src/assistant/assistantNavigation.ts";

const payrollRouteSource = readFileSync(new URL("../src/app/routes/PayrollRoute.tsx", import.meta.url), "utf8");

test("parses project and project-subview deep links", () => {
  assert.deepEqual(parseAppLocation("/projects/project-42/invoices"), {
    kind: "project",
    tab: "projects",
    routeId: "projects",
    projectId: "project-42",
    view: "invoices",
    pathname: "/projects/project-42/invoices",
    search: "",
  });
  const payroll = parseAppLocation("/projects/project-42", "?view=payroll");
  assert.equal(payroll.kind, "project");
  if (payroll.kind === "project") assert.equal(payroll.view, "payroll");

  const documents = parseAppLocation("/projects/project-42/documents", "?docId=doc-99&revId=rev-3");
  assert.equal(documents.kind, "project");
  if (documents.kind === "project") {
    assert.equal(documents.view, "documents");
    assert.equal(documents.documentId, "doc-99");
    assert.equal(documents.revisionId, "rev-3");
  }
  const siteLogs = parseAppLocation("/projects/project-42/site-logs", "?siteLogId=log-77");
  assert.equal(siteLogs.kind, "project");
  if (siteLogs.kind === "project") {
    assert.equal(siteLogs.view, "site-logs");
    assert.equal(siteLogs.siteLogId, "log-77");
  }
});

test("parses invoice and review-session URLs with safe return paths", () => {
  const invoice = parseAppLocation("/invoices/invoice-7", "?from=%2Fprojects%2Fproject-42%2Finvoices");
  assert.equal(invoice.kind, "invoice");
  assert.equal(invoice.invoiceId, "invoice-7");
  assert.equal(invoice.returnTo, "/projects/project-42/invoices");

  const review = parseAppLocation("/review", "?invoiceId=invoice-7&from=%2Finbox");
  assert.equal(review.kind, "review-invoice");
  assert.equal(review.invoiceId, "invoice-7");
  assert.equal(review.returnTo, "/inbox");
});

test("builds predictable route URLs without embedding invoice contents", () => {
  assert.equal(appPathForTab("payroll"), "/payroll");
  assert.equal(appPathForTab("inbox"), "/email-intake");
  assert.equal(appPathForProject("project 42", "expenses"), "/projects/project%2042/expenses");
  assert.equal(appPathForProject("project 42", "documents", { docId: "doc-1", revId: "rev-2" }), "/projects/project%2042/documents?docId=doc-1&revId=rev-2");
  assert.equal(appPathForProject("project 42", "site-logs", { siteLogId: "log-7" }), "/projects/project%2042/site-logs?siteLogId=log-7");
  assert.equal(appPathForInvoice("invoice/7", "/projects/project-42/invoices"), "/invoices/invoice%2F7?from=%2Fprojects%2Fproject-42%2Finvoices");
  assert.equal(appPathForReviewInvoice("invoice-7", "/inbox"), "/review?invoiceId=invoice-7&from=%2Finbox");
  assert.equal(appPathForReviewInvoice("invoice-7", "/email-intake"), "/review?invoiceId=invoice-7&from=%2Femail-intake");
});

test("parses email-intake canonical route and legacy /inbox alias", () => {
  const canonical = parseAppLocation("/email-intake");
  assert.equal(canonical.kind, "tab");
  assert.equal(canonical.tab, "inbox");
  assert.equal(canonical.routeId, "inbox");
  assert.equal(canonical.pathname, "/email-intake");

  const legacy = parseAppLocation("/inbox");
  assert.equal(legacy.kind, "tab");
  assert.equal(legacy.tab, "inbox");
  assert.equal(legacy.routeId, "inbox");
  assert.equal(legacy.pathname, "/inbox");
});

test("payroll run links keep the canonical payroll route and target the exact run", () => {
  assert.equal(appPathForPayrollRun("run-42", "/cash"), "/payroll?runId=run-42&from=%2Fcash");
  assert.equal(payrollRunIdFromSearch("?runId=run-42&from=%2Fcash"), "run-42");
  assert.equal(pathForAssistantAction({ type: "OPEN_PAYROLL_RUN", entityId: "run-42" }), "/payroll?runId=run-42");
  assert.match(payrollRouteSource, /payrollRunIdFromSearch\(search\)/);
  assert.match(payrollRouteSource, /runs=\{\[requestedRun\]\}/);
  assert.match(payrollRouteSource, /selectedPeriodId=\{requestedPeriod\.id\}/);
});

test("payroll period links keep the canonical payroll route and target the exact period", () => {
  assert.equal(appPathForPayrollPeriod("period-42", "/dashboard"), "/payroll?periodId=period-42&from=%2Fdashboard");
  assert.equal(payrollPeriodIdFromSearch("?periodId=period-42&from=%2Fdashboard"), "period-42");
  assert.equal(pathForAssistantAction({ type: "OPEN_PAYROLL_PERIOD", entityId: "period-42" }), "/payroll?periodId=period-42");
  assert.match(payrollRouteSource, /payrollPeriodIdFromSearch\(search\)/);
  assert.match(payrollRouteSource, /selectedPeriodId=\{\s*!requestedRun\s*\?\s*requestedPeriod\?\.id\s*:\s*undefined\s*\}/);
});

test("attendance links keep the canonical payroll route and target the exact date", () => {
  assert.equal(appPathForAttendanceDate("2026-08-29", "/payroll"), "/payroll?attendanceDate=2026-08-29&from=%2Fpayroll");
  assert.equal(attendanceDateFromSearch("?attendanceDate=2026-08-29"), "2026-08-29");
  assert.equal(attendanceDateFromSearch("?attendanceDate=not-a-date"), undefined);
  assert.equal(pathForAssistantAction({ type: "OPEN_ATTENDANCE_DATE", date: "2026-08-29" }), "/payroll?attendanceDate=2026-08-29");
  assert.match(payrollRouteSource, /attendanceDateFromSearch\(search\)/);
  assert.match(payrollRouteSource, /attendanceDate=\{requestedAttendanceDate\}/);
});

test("legacy platform-company deep links fail closed instead of selecting a workspace", () => {
  const location = parseAppLocation("/platform/companies?companyId=00000000-0000-4000-8000-000000000001&tab=ai");
  assert.equal(location.kind, "unknown");
  assert.equal(appTabForLocation(location), "dashboard");
  assert.equal(isKnownWorkspaceLocation(location), false);
});

test("assistant navigation generates correct routes for project documents and views", () => {
  assert.equal(pathForAssistantAction({ type: "OPEN_PROJECT_DOCUMENTS", entityId: "proj-101" }), "/projects/proj-101/documents");
  assert.equal(pathForAssistantAction({ type: "OPEN_PROJECT", entityId: "proj-101", view: "documents" }), "/projects/proj-101/documents");
  assert.equal(pathForAssistantAction({ type: "OPEN_PROJECT", entityId: "proj-101", view: "expenses" }), "/projects/proj-101/expenses");
  assert.equal(pathForAssistantAction({ type: "OPEN_PROJECT", entityId: "proj-101" }), "/projects/proj-101");
});
