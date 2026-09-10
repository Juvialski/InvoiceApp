import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  appPathForInvoice,
  appPathForPurchaseOrder,
  appPathForPurchaseOrderReceipt,
  appPathForSubcontractClaim,
  appPathForWarehouseMovement,
  appPathForWarehouseReceipt,
  appPathForExpense,
  appPathForCashTarget,
  appPathForAttendanceDate,
  appPathForPayrollPeriod,
  appPathForPayrollRun,
  appPathForProject,
  appPathForReviewInvoice,
  appPathForEmailWorkspace,
  appPathForTab,
  appTabForLocation,
  isKnownWorkspaceLocation,
  parseAppLocation,
  procurementContextFromSearch,
  warehouseContextFromSearch,
  attendanceDateFromSearch,
  cashSettlementTargetContextFromSearch,
  expenseIdFromSearch,
  payrollPeriodIdFromSearch,
  payrollRunIdFromSearch,
  emailWorkspaceContextFromSearch,
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

test("Expense detail and object-first cash routes preserve exact target context", () => {
  const expensePath = appPathForExpense("expense 42", "/invoices/invoice-7");
  assert.equal(expensePath, "/expenses?expenseId=expense+42&from=%2Finvoices%2Finvoice-7");
  const expense = parseAppLocation(expensePath);
  assert.deepEqual(expense, {
    kind: "expense",
    tab: "expenses",
    routeId: "expenses",
    expenseId: "expense 42",
    returnTo: "/invoices/invoice-7",
    pathname: "/expenses",
    search: "?expenseId=expense+42&from=%2Finvoices%2Finvoice-7",
  });
  assert.equal(expenseIdFromSearch(expense.search), "expense 42");

  const cashPath = appPathForCashTarget("EXPENSE", "expense-42");
  assert.equal(cashPath, "/cash?fromTargetType=EXPENSE&fromTargetId=expense-42");
  assert.deepEqual(cashSettlementTargetContextFromSearch(cashPath.split("?", 2)[1] || ""), {
    requested: true,
    invalid: false,
    targetType: "EXPENSE",
    targetId: "expense-42",
  });
  assert.equal(cashSettlementTargetContextFromSearch("fromTargetType=EXPENSE").invalid, true);
  const cashReturnPath = appPathForCashTarget("EXPENSE", "expense-42", expensePath);
  assert.equal(cashSettlementTargetContextFromSearch(cashReturnPath.split("?", 2)[1] || "").returnTo, expensePath);
});

test("client receivable routes preserve the selected billing and safe Cash return path", () => {
  const billingPath = appPathForProject("project 42", "billing", { billingId: "billing 7" });
  assert.equal(billingPath, "/projects/project%2042/billing?billingId=billing+7");
  const billingLocation = parseAppLocation(billingPath);
  assert.equal(billingLocation.kind, "project");
  if (billingLocation.kind === "project") {
    assert.equal(billingLocation.view, "billing");
    assert.equal(billingLocation.billingId, "billing 7");
  }

  const cashPath = appPathForCashTarget("CLIENT_COLLECTION", "collection 42", billingPath);
  assert.equal(cashPath, "/cash?fromTargetType=CLIENT_COLLECTION&fromTargetId=collection+42&returnTo=%2Fprojects%2Fproject%252042%2Fbilling%3FbillingId%3Dbilling%2B7");
  assert.deepEqual(cashSettlementTargetContextFromSearch(cashPath.split("?", 2)[1] || ""), {
    requested: true,
    invalid: false,
    targetType: "CLIENT_COLLECTION",
    targetId: "collection 42",
    returnTo: billingPath,
  });
  assert.equal(cashSettlementTargetContextFromSearch("fromTargetType=CLIENT_COLLECTION&fromTargetId=collection-42&returnTo=https%3A%2F%2Fevil.example").returnTo, undefined);
});

test("builds predictable route URLs without embedding invoice contents", () => {
  assert.equal(appPathForTab("payroll"), "/payroll");
  assert.equal(appPathForTab("inbox"), "/email-sms");
  assert.equal(appPathForTab("warehouse"), "/warehouse");
  assert.equal(appPathForProject("project 42", "expenses"), "/projects/project%2042/expenses");
  assert.equal(appPathForProject("project 42", "documents", { docId: "doc-1", revId: "rev-2" }), "/projects/project%2042/documents?docId=doc-1&revId=rev-2");
  assert.equal(appPathForProject("project 42", "site-logs", { siteLogId: "log-7" }), "/projects/project%2042/site-logs?siteLogId=log-7");
  assert.equal(appPathForInvoice("invoice/7", "/projects/project-42/invoices"), "/invoices/invoice%2F7?from=%2Fprojects%2Fproject-42%2Finvoices");
  assert.equal(appPathForReviewInvoice("invoice-7", "/inbox"), "/review?invoiceId=invoice-7&from=%2Finbox");
  assert.equal(appPathForReviewInvoice("invoice-7", "/email-intake"), "/review?invoiceId=invoice-7&from=%2Femail-intake");
});

test("cross-module procurement and warehouse links preserve exact source identifiers", () => {
  assert.equal(appPathForPurchaseOrder("po-42"), "/procurement?poId=po-42");
  const purchaseOrderPath = appPathForPurchaseOrderReceipt("po-42", "receipt-7", "/expenses?expenseId=expense-9");
  assert.equal(purchaseOrderPath, "/procurement?poId=po-42&receiptId=receipt-7&from=%2Fexpenses%3FexpenseId%3Dexpense-9");
  assert.deepEqual(procurementContextFromSearch(purchaseOrderPath.split("?", 2)[1] || ""), {
    requested: true,
    invalid: false,
    purchaseOrderId: "po-42",
    receiptId: "receipt-7",
    returnTo: "/expenses?expenseId=expense-9",
  });

  const warehouseReceiptPath = appPathForWarehouseReceipt("receipt-7", "/procurement?poId=po-42&receiptId=receipt-7");
  assert.equal(warehouseReceiptPath, "/warehouse?receiptId=receipt-7&from=%2Fprocurement%3FpoId%3Dpo-42%26receiptId%3Dreceipt-7");
  assert.deepEqual(warehouseContextFromSearch(warehouseReceiptPath.split("?", 2)[1] || ""), {
    requested: true,
    invalid: false,
    receiptId: "receipt-7",
    returnTo: "/procurement?poId=po-42&receiptId=receipt-7",
  });

  const movementPath = appPathForWarehouseMovement("movement-9", warehouseReceiptPath);
  assert.equal(warehouseContextFromSearch(movementPath.split("?", 2)[1] || "").movementId, "movement-9");
  assert.equal(parseAppLocation(movementPath).kind, "tab");
});

test("subcontract claim settlement links return to the exact procurement claim", () => {
  const procurementPath = appPathForSubcontractClaim("claim-42", "subcontract-7", "/cash");
  assert.equal(procurementPath, "/procurement?subcontractId=subcontract-7&subcontractClaimId=claim-42&from=%2Fcash");
  assert.deepEqual(procurementContextFromSearch(procurementPath.split("?", 2)[1] || ""), {
    requested: true,
    invalid: false,
    subcontractId: "subcontract-7",
    subcontractClaimId: "claim-42",
    returnTo: "/cash",
  });
  const cashPath = appPathForCashTarget("SUBCONTRACT_CLAIM", "claim-42", procurementPath);
  assert.deepEqual(cashSettlementTargetContextFromSearch(cashPath.split("?", 2)[1] || ""), {
    requested: true,
    invalid: false,
    targetType: "SUBCONTRACT_CLAIM",
    targetId: "claim-42",
    returnTo: procurementPath,
  });
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

test("builds and parses Email / SMS compose handoff with an exact issued document", () => {
  const path = appPathForEmailWorkspace("compose", { documentType: "PURCHASE_ORDER", documentId: "po-42", returnTo: "/documents" });
  assert.equal(path, "/email-sms?view=compose&documentType=PURCHASE_ORDER&documentId=po-42&from=%2Fdocuments");
  assert.deepEqual(emailWorkspaceContextFromSearch(path.split("?", 2)[1] || ""), {
    view: "compose",
    documentType: "PURCHASE_ORDER",
    documentId: "po-42",
    returnTo: "/documents",
  });
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
