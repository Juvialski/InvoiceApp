import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ExpenseDraftWorksheet,
  isEditableExpenseDraft,
  normalizeExpenseDraft,
} from "../src/components/expenses/ExpenseDraftWorksheet.tsx";
import type { Expense, Project, ProjectCostCode } from "../src/types.ts";

const pageSource = readFileSync(new URL("../src/components/expenses/ExpensesPage.tsx", import.meta.url), "utf8");
const worksheetSource = readFileSync(new URL("../src/components/expenses/ExpenseDraftWorksheet.tsx", import.meta.url), "utf8");

const projects: Project[] = [
  {
    id: "project-1",
    projectCode: "PRJ-001",
    projectName: "Site Project",
    status: "ACTIVE",
    currency: "PHP",
    projectBudget: 100_000,
    taxTreatment: "VAT",
    createdAt: "2026-09-19T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
  },
  {
    id: "project-2",
    projectCode: "PRJ-002",
    projectName: "Second Site",
    status: "ACTIVE",
    currency: "PHP",
    projectBudget: 100_000,
    taxTreatment: "VAT",
    createdAt: "2026-09-19T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
  },
];

const costCodes: ProjectCostCode[] = [
  {
    id: "cost-code-1",
    projectId: "project-1",
    code: "SITE",
    name: "Site works",
    status: "ACTIVE",
    approvedBudgetAmount: 50_000,
    createdAt: "2026-09-19T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
  },
  {
    id: "cost-code-2",
    projectId: "project-2",
    code: "MECH",
    name: "Mechanical",
    status: "ACTIVE",
    approvedBudgetAmount: 50_000,
    createdAt: "2026-09-19T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
  },
];

const directExpense: Expense = {
  id: "expense-direct-1",
  projectId: "project-1",
  projectCostCodeId: "cost-code-1",
  expenseDate: "2026-09-20",
  category: "Fuel",
  description: "Site fuel",
  payee: "Direct Supplier",
  amount: 1_000,
  currency: "PHP",
  paymentMethod: "Cash",
  referenceNumber: "REF-001",
  status: "DRAFT",
  notes: "Original note",
  createdAt: "2026-09-19T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z",
};

const supplierExpense: Expense = {
  ...directExpense,
  id: "expense-supplier-1",
  supplierInvoiceId: "invoice-1",
  vendorId: "vendor-1",
  purchaseOrderId: "po-1",
};

test("Expenses replaces the direct form with the shared draft worksheet while preserving the register and workbook", () => {
  assert.match(pageSource, /ExpenseDraftWorksheet/);
  assert.doesNotMatch(pageSource, /import \{ ExpenseForm \}/);
  assert.match(pageSource, /ExpensesWorkbookPanel/);
  assert.match(pageSource, /onApplyExpenseWorkbook/);
  assert.match(pageSource, /onReviewCorrection/);
  assert.match(pageSource, /FinancialSettlementCard/);
  assert.match(pageSource, /Edit draft worksheet/);
});

test("direct draft worksheet exposes ordinary fields and visibly protected authority context", () => {
  const html = renderToStaticMarkup(
    <ExpenseDraftWorksheet
      projects={projects}
      costCodes={costCodes}
      expense={directExpense}
      baseCurrency="PHP"
      onSave={() => undefined}
      onCancel={() => undefined}
    />,
  );

  for (const label of [
    "Expense Date", "Project", "Cost Code", "Category", "Description", "Payee", "Amount",
    "Currency", "Payment Method", "Reference", "Notes", "Expense Identity", "Status",
    "Source Document", "Vendor", "Purchase Order", "Settlement State", "PHP / Base Currency",
    "Created", "Updated",
  ]) {
    assert.match(html, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), label);
  }

  assert.match(html, /data-testid="expense-draft-worksheet"/);
  assert.match(html, /data-worksheet-scroll-container="expense-draft"/);
  assert.match(html, /Save expense draft/);
  assert.match(html, /data-worksheet-cell="expense-direct-1:status"[^>]*data-worksheet-protected="true"/);
  assert.match(html, /data-worksheet-cell="expense-direct-1:supplierInvoice"[^>]*data-worksheet-protected="true"/);
  assert.match(html, /data-worksheet-cell="expense-direct-1:amount"[^>]*data-worksheet-editable="true"/);
  assert.match(html, /Approval, payment, settlement, reconciliation, correction, archive, and void actions remain outside this worksheet/);
});

test("supplier-derived Expenses never expose direct worksheet save or editable monetary/provenance cells", () => {
  assert.equal(isEditableExpenseDraft(supplierExpense), false);
  const html = renderToStaticMarkup(
    <ExpenseDraftWorksheet
      projects={projects}
      costCodes={costCodes}
      expense={supplierExpense}
      baseCurrency="PHP"
      onSave={() => undefined}
      onCancel={() => undefined}
    />,
  );
  assert.doesNotMatch(html, /Save expense draft/);
  assert.match(html, /data-worksheet-cell="expense-supplier-1:amount"[^>]*data-worksheet-editable="false"/);
  assert.match(html, /data-worksheet-cell="expense-supplier-1:supplierInvoice"[^>]*data-worksheet-protected="true"/);
  assert.match(html, /Supplier Invoice evidence remains protected/);
});

test("worksheet normalization preserves protected identity, lifecycle, provenance, and stale updatedAt while normalizing editable values", () => {
  const normalized = normalizeExpenseDraft({
    ...directExpense,
    description: "  Revised site fuel  ",
    category: "  Fuel  ",
    amount: 1250,
    currency: "usd",
    projectId: "project-2",
    projectCostCodeId: "cost-code-2",
    payee: "  Revised supplier ",
    paymentMethod: "Bank Transfer",
    referenceNumber: " REF-002 ",
    notes: "  Updated note ",
  }, directExpense);

  assert.equal(normalized.description, "Revised site fuel");
  assert.equal(normalized.category, "Fuel");
  assert.equal(normalized.currency, "USD");
  assert.equal(normalized.projectId, "project-2");
  assert.equal(normalized.projectCostCodeId, "cost-code-2");
  assert.equal(normalized.updatedAt, directExpense.updatedAt);
  assert.equal(normalized.status, directExpense.status);
  assert.equal(normalized.id, directExpense.id);
  assert.equal(normalized.supplierInvoiceId, directExpense.supplierInvoiceId);
  assert.equal(normalized.vendorId, directExpense.vendorId);
  assert.equal(normalized.purchaseOrderId, directExpense.purchaseOrderId);
});

test("worksheet save boundary commits active edits and blocks invalid cells before the parent save path", () => {
  assert.match(worksheetSource, /activeElement\.blur\(\)/);
  assert.match(worksheetSource, /requestAnimationFrame/);
  assert.match(worksheetSource, /data-worksheet-state="error"/);
  assert.match(worksheetSource, /Resolve the highlighted worksheet validation errors before saving/);
  assert.match(worksheetSource, /onSave\(normalized\)/);
  assert.match(worksheetSource, /updatedAt/);
  assert.match(worksheetSource, /getSelectableCostCodes/);
  assert.match(worksheetSource, /currentCode\?\.projectId === nextProjectId/);
});

test("existing Expense workbook round-trip and controlled lifecycle surfaces remain outside the worksheet", () => {
  const workbookSource = readFileSync(new URL("../src/components/expenses/ExpensesWorkbookPanel.tsx", import.meta.url), "utf8");
  const workbookModel = readFileSync(new URL("../src/lib/expensesWorkbook.ts", import.meta.url), "utf8");
  assert.match(workbookSource, /buildExpensesImportReview/);
  assert.match(workbookSource, /applyExpensesImport/);
  assert.match(workbookModel, /saveExpense\(proposal\.applyExpense\)/);
  assert.match(pageSource, /onPreviewCorrection/);
  assert.match(pageSource, /onApplyCorrection/);
  assert.match(pageSource, /appPathForCashTarget\("EXPENSE"/);
  assert.match(pageSource, /onSaveFinancialFxSnapshot/);
});
