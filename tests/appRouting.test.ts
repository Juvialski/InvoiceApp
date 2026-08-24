import test from "node:test";
import assert from "node:assert/strict";
import {
  appPathForInvoice,
  appPathForProject,
  appPathForPlatformCompanies,
  appPathForReviewInvoice,
  appPathForTab,
  appTabForLocation,
  isKnownWorkspaceLocation,
  parseAppLocation,
  PLATFORM_COMPANIES_PATH,
} from "../src/utils/appRouting.ts";

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
  const payroll = parseAppLocation("/projects/project-42", "?view=payroll"); assert.equal(payroll.kind, "project"); if (payroll.kind === "project") assert.equal(payroll.view, "payroll");
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
  assert.equal(appPathForProject("project 42", "expenses"), "/projects/project%2042/expenses");
  assert.equal(appPathForInvoice("invoice/7", "/projects/project-42/invoices"), "/invoices/invoice%2F7?from=%2Fprojects%2Fproject-42%2Finvoices");
  assert.equal(appPathForReviewInvoice("invoice-7", "/inbox"), "/review?invoiceId=invoice-7&from=%2Finbox");
});

test("treats platform company management as a first-class non-workspace route", () => {
  const location = parseAppLocation(PLATFORM_COMPANIES_PATH);
  assert.deepEqual(location, { kind: "platform-companies", pathname: PLATFORM_COMPANIES_PATH, search: "" });
  assert.equal(appTabForLocation(location), "dashboard");
  assert.equal(isKnownWorkspaceLocation(location), false);
});

test("platform management deep links select a company and management tab without opening its workspace", () => {
  const companyId = "00000000-0000-4000-8000-000000000001";
  assert.equal(appPathForPlatformCompanies(companyId, "ai"), `${PLATFORM_COMPANIES_PATH}?companyId=${companyId}&tab=ai`);
  assert.deepEqual(parseAppLocation(`${PLATFORM_COMPANIES_PATH}?companyId=${companyId}&tab=ai`), {
    kind: "platform-companies",
    pathname: PLATFORM_COMPANIES_PATH,
    search: `?companyId=${companyId}&tab=ai`,
    managementCompanyId: companyId,
    managementTab: "ai",
  });
});
