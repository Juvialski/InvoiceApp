import React from "react";
import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { InvoiceDirectory } from "../src/components/InvoiceDirectory.tsx";
import { Header } from "../src/components/Header.tsx";
import { getNavigationModel } from "../src/navigation/navigationModel.ts";
import { parseHiddenDeploymentModules } from "../src/config/moduleVisibility.ts";
import { dashboardQuickTasksForPermissions } from "../src/utils/dashboardHomeModel.ts";
import { PERMISSION_KEYS as P } from "../src/utils/accessControl.ts";
import { SupplierInvoiceExpenseSurface } from "../src/components/SupplierInvoiceExpenseSurface.tsx";
import { SupplierInvoiceReview } from "../src/components/SupplierInvoiceReview.tsx";
import { createDemoWorkspace } from "../src/demo/data/createDemoWorkspace.ts";
import { WorksheetEditor } from "../src/components/ui/WorksheetEditor.tsx";

test("daily navigation keeps existing route identities and secondary tools remain permission filtered", () => {
  const all = getNavigationModel({ permissions: ["*"] });
  assert.deepEqual(all.groups[0].modules.map((module) => module.label), ["Home", "Bills & Payments", "Projects", "Workbook", "Warehouse", "Documents"]);
  assert.deepEqual(all.groups[1].modules.map((module) => module.id), ["expenses", "cash", "procurement", "equipment", "payroll", "reports", "email-sms"]);
  assert.deepEqual(all.modules.find((module) => module.id === "invoices")?.routes.map((route) => route.path), ["/invoices", "/extract", "/review", "/vendors"]);
  const restricted = getNavigationModel({ permissions: [P.invoicesRead], hiddenModules: parseHiddenDeploymentModules("documents") });
  assert.deepEqual(restricted.groups.map((group) => group.id), ["everyday"]);
  assert.deepEqual(restricted.modules.map((module) => module.id), ["operations-workbook", "invoices"]);
  const settingsOnly = getNavigationModel({ permissions: [P.settingsRead] });
  assert.equal(settingsOnly.groups.some((group) => group.id === "more-tools"), true);
  assert.equal(settingsOnly.settingsRoute?.id, "settings");
});

test("More Tools starts collapsed and its controls retain accessible disclosure semantics", () => {
  const markup = renderToStaticMarkup(<Header activeTab="dashboard" setActiveTab={() => {}} invoicesCount={0} reviewCount={0} permissions={["*"]} workspaceSyncStatus="synced" />);
  assert.match(markup, /aria-label="More Tools" aria-expanded="false" aria-controls="workspace-more-tools"/);
  assert.match(markup, /id="workspace-more-tools" hidden=""/);
  const restricted = renderToStaticMarkup(<Header activeTab="invoices" setActiveTab={() => {}} invoicesCount={1} reviewCount={1} permissions={[P.invoicesRead]} workspaceSyncStatus="synced" />);
  assert.doesNotMatch(restricted, /aria-label="More Tools"|>Payroll<|>Cash &amp; Banking</);
});

test("Home task permissions match the actual upload, settlement, workbook and stock workflows", () => {
  assert.deepEqual(dashboardQuickTasksForPermissions(["*"]).map((task) => [task.label, task.tab]), [["Add bill", "extractor"], ["Record payment", "invoices"], ["Open workbook", "workbook"], ["Assign stock to a project", "warehouse"]]);
  assert.deepEqual(dashboardQuickTasksForPermissions([P.invoicesRead]).map((task) => task.tab), ["workbook"]);
  assert.deepEqual(dashboardQuickTasksForPermissions([P.projectsRead]).map((task) => task.tab), ["workbook"]);
  assert.deepEqual(dashboardQuickTasksForPermissions([P.inventoryRead, P.inventoryManage]).map((task) => task.tab), ["workbook"]);
  assert.deepEqual(dashboardQuickTasksForPermissions([P.invoicesExtract]), []);
  assert.deepEqual(dashboardQuickTasksForPermissions([]), []);
});

test("confirmed bills show the linked settlement workflow and never offer payment to unauthorized, void or conflicted records", () => {
  const data = createDemoWorkspace("2026-10-12");
  const expense = data.expenses.find((item) => item.supplierInvoiceId && item.status !== "VOID");
  assert.ok(expense?.supplierInvoiceId);
  const source = data.invoices.find((item) => item.id === expense.supplierInvoiceId);
  assert.ok(source);
  const invoice = { ...source, reviewStatus: "VERIFIED" as const, amountPaid: 0, grandTotal: expense.amount, status: "APPROVED" as const };
  const render = (canRecordPayment: boolean, voided = false, authorityConflict = false) => renderToStaticMarkup(<SupplierInvoiceExpenseSurface invoice={voided ? { ...invoice, lifecycleStatus: "VOID" } : invoice} linkedExpenseId={expense.id} linkedExpense={{ ...expense, status: "APPROVED" }} canRecordPayment={canRecordPayment} authorityConflict={authorityConflict} />);
  assert.match(render(true), /data-testid="change-supplier-payment-status"/);
  assert.match(render(true), />Record payment</);
  assert.doesNotMatch(render(false), /data-testid="change-supplier-payment-status"/);
  assert.doesNotMatch(render(true, true), /data-testid="change-supplier-payment-status"/);
  assert.doesNotMatch(render(true, false, true), /data-testid="change-supplier-payment-status"/);
  const confirmed = renderToStaticMarkup(<SupplierInvoiceReview invoice={invoice} readOnly linkedExpense={expense} canRecordExpensePayment />);
  assert.doesNotMatch(confirmed, /data-testid="supplier-invoice-expense-disclosure"/);
  assert.match(confirmed, /data-testid="supplier-invoice-expense-bridge"/);
  assert.doesNotMatch(confirmed, />Confirm bill</);
});

test("multiple worksheet sections do not display selected-cell chrome before focus", () => {
  const markup = renderToStaticMarkup(<WorksheetEditor quietUnfocusedSelection ariaLabel="Test facts" rows={[{ id: "row", description: "Synthetic" }]} columns={[{ key: "description", header: "Description", editable: true }]} rowKey={(row) => row.id} />);
  assert.doesNotMatch(markup, /data-worksheet-state="selected"/);
  assert.match(markup, /tabindex="0"/);
});

test("voided bill payment labels cannot become an unpaid balance", () => {
  const source = createDemoWorkspace("2026-10-12").invoices[0];
  const markup = renderToStaticMarkup(<InvoiceDirectory invoices={[{ ...source, lifecycleStatus: "VOID", reviewStatus: "VERIFIED" }]} onSelectInvoice={() => {}} />);
  assert.match(markup, />Voided</);
  assert.doesNotMatch(markup, />Unpaid</);
  assert.doesNotMatch(markup, />Add bill</);
});
