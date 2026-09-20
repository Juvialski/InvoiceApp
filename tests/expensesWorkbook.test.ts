import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import type { Expense, InvoiceData, Project, ProjectCostCode, Vendor } from "../src/types.ts";
import type { SupplierInvoiceSettlementMatch, SupplierInvoiceSettlementProjection } from "../src/lib/supplierInvoiceSettlement.ts";
import {
  applyExpensesImport,
  buildExpensesImportReview,
  exportExpensesWorkbook,
  settlementForExpenseWorkbook,
  type ExpensesImportContext,
  type ExpensesWorkbookRecords,
} from "../src/lib/expensesWorkbook.ts";

const COMPANY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DIRECT_EXPENSE_ID = "11111111-1111-4111-8111-111111111111";
const LINKED_EXPENSE_ID = "22222222-2222-4222-8222-222222222222";
const APPROVED_EXPENSE_ID = "33333333-3333-4333-8333-333333333333";
const USD_EXPENSE_ID = "44444444-4444-4444-8444-444444444444";
const SUPPLIER_INVOICE_ID = "55555555-5555-4555-8555-555555555555";
const VENDOR_ID = "66666666-6666-4666-8666-666666666666";
const PROJECT_ONE_ID = "77777777-7777-4777-8777-777777777777";
const PROJECT_TWO_ID = "88888888-8888-4888-8888-888888888888";
const COST_CODE_ONE_ID = "99999999-9999-4999-8999-999999999999";
const COST_CODE_TWO_ID = "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const DIRECT_UPDATED_AT = "2026-09-20T00:00:00.000Z";
const NEXT_UPDATED_AT = "2026-09-21T00:00:00.000Z";

function project(id: string, projectCode: string, projectName: string): Project {
  return {
    id,
    projectCode,
    projectName,
    status: "ACTIVE",
    projectBudget: 100_000,
    currency: "PHP",
    taxTreatment: "VAT",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
  };
}

function costCode(id: string, projectId: string, code: string, name: string): ProjectCostCode {
  return {
    id,
    projectId,
    code,
    name,
    status: "ACTIVE",
    approvedBudgetAmount: 50_000,
    forecastAmount: 45_000,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
  };
}

function expense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: DIRECT_EXPENSE_ID,
    projectId: PROJECT_ONE_ID,
    projectCostCodeId: COST_CODE_ONE_ID,
    expenseDate: "2026-09-20",
    category: "Materials",
    description: "Site materials",
    payee: "Direct Supplier",
    amount: 1000,
    currency: "PHP",
    paymentMethod: "BANK",
    referenceNumber: "REF-001",
    status: "DRAFT",
    notes: "Original note",
    createdAt: "2026-09-19T00:00:00.000Z",
    updatedAt: DIRECT_UPDATED_AT,
    ...overrides,
  };
}

function invoice(): InvoiceData {
  return {
    id: SUPPLIER_INVOICE_ID,
    linkedExpenseId: LINKED_EXPENSE_ID,
    documentType: "INVOICE",
    reviewStatus: "VERIFIED",
    lifecycleStatus: "ACTIVE",
    invoiceNumber: "SUP-001",
    invoiceDate: "2026-09-18",
    dueDate: "2026-10-18",
    currency: "PHP",
    vendor: { name: "Canonical Supplier", vendorId: VENDOR_ID },
    items: [{ id: "line-1", description: "Pipe", quantity: 1, unitPrice: 2000, total: 2000 }],
    subtotal: 2000,
    totalTax: 0,
    grandTotal: 2000,
    amountPaid: 150,
    extractedAt: "2026-09-18T00:00:00.000Z",
    modelUsed: "test",
  };
}

function vendor(): Vendor {
  return { id: VENDOR_ID, companyId: COMPANY_ID, name: "Canonical Supplier", normalizedName: "canonical supplier", active: true };
}

function supplierProjection(): SupplierInvoiceSettlementProjection {
  return {
    invoiceId: SUPPLIER_INVOICE_ID,
    targetType: "EXPENSE",
    targetId: LINKED_EXPENSE_ID,
    linkedExpense: expense({
      id: LINKED_EXPENSE_ID,
      projectId: PROJECT_ONE_ID,
      projectCostCodeId: COST_CODE_ONE_ID,
      description: "Supplier payable",
      payee: "Canonical Supplier",
      amount: 2000,
      supplierInvoiceId: SUPPLIER_INVOICE_ID,
      vendorId: VENDOR_ID,
      status: "DRAFT",
      updatedAt: "2026-09-20T00:00:01.000Z",
    }),
    payable: true,
    paymentState: "PARTIALLY_PAID",
    settlement: {
      targetType: "EXPENSE",
      targetId: LINKED_EXPENSE_ID,
      currency: "PHP",
      lifecycleStatus: "DRAFT",
      settlementBasis: 2000,
      basisSource: "EXPENSE_AMOUNT",
      reconciledCashPaid: 150,
      documentReportedPaid: 150,
      effectiveSettled: 150,
      outstanding: 1850,
      settlementState: "PARTIALLY_PAID",
      authorityConflict: false,
      history: [],
    },
  };
}

function records(overrides: Partial<ExpensesWorkbookRecords> = {}): ExpensesWorkbookRecords {
  const direct = expense();
  const linked = expense({
    id: LINKED_EXPENSE_ID,
    projectId: PROJECT_ONE_ID,
    projectCostCodeId: COST_CODE_ONE_ID,
    description: "Supplier payable",
    payee: "Canonical Supplier",
    amount: 2000,
    supplierInvoiceId: SUPPLIER_INVOICE_ID,
    vendorId: VENDOR_ID,
    status: "DRAFT",
    updatedAt: "2026-09-20T00:00:01.000Z",
  });
  const approved = expense({ id: APPROVED_EXPENSE_ID, description: "Approved expense", status: "APPROVED", updatedAt: "2026-09-20T00:00:02.000Z" });
  const usd = expense({ id: USD_EXPENSE_ID, description: "Foreign expense", amount: 25, currency: "USD", projectId: undefined, projectCostCodeId: undefined, updatedAt: "2026-09-20T00:00:03.000Z" });
  return {
    expectedCompanyId: COMPANY_ID,
    expenses: [direct, linked, approved, usd],
    projects: [project(PROJECT_ONE_ID, "PRJ-001", "North Plant"), project(PROJECT_TWO_ID, "PRJ-002", "South Plant")],
    costCodes: [costCode(COST_CODE_ONE_ID, PROJECT_ONE_ID, "CIVIL", "Civil Works"), costCode(COST_CODE_TWO_ID, PROJECT_TWO_ID, "MECH", "Mechanical Works")],
    invoices: [invoice()],
    purchaseOrders: [],
    vendors: [vendor()],
    settlementProjections: new Map([[SUPPLIER_INVOICE_ID, supplierProjection()]]),
    settlementMatches: [],
    today: "2026-09-20",
    ...overrides,
  };
}

function context(overrides: Partial<ExpensesImportContext> = {}): ExpensesImportContext {
  return { ...records(), canWrite: true, ...overrides };
}

function exportedBytes(input: ExpensesWorkbookRecords = records()) {
  return exportExpensesWorkbook(input).bytes;
}

function readSheetNames(bytes: Uint8Array) {
  return XLSX.read(bytes, { type: "array" }).SheetNames;
}

function editCell(bytes: Uint8Array, sheetName: string, header: string, value: unknown, dataIndex = 0) {
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true, cellFormula: true });
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  const headers = (rows[0] || []).map((item) => String(item));
  const column = headers.indexOf(header);
  assert.notEqual(column, -1, `${sheetName} must contain ${header}`);
  const address = XLSX.utils.encode_cell({ r: dataIndex + 1, c: column });
  sheet[address] = typeof value === "number" ? { t: "n", v: value } : { t: "s", v: String(value) };
  return new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }));
}

function setExpenseCells(bytes: Uint8Array, values: Record<string, unknown>, dataIndex: number) {
  return Object.entries(values).reduce((current, [header, value]) => editCell(current, "Expenses", header, value, dataIndex), bytes);
}

function setHiddenCell(bytes: Uint8Array, entity: "EXPENSE", id: string, value: unknown) {
  const contextIndex = records().expenses.findIndex((candidate) => candidate.id === id);
  assert.notEqual(contextIndex, -1, `${entity} fixture must exist`);
  return editCell(bytes, "Expenses", "__HQ Company ID", value, contextIndex);
}

function addNewExpenseRow(bytes: Uint8Array) {
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
  const sheet = workbook.Sheets.Expenses;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  const newRow = [...(rows[1] || [])];
  const headers = (rows[0] || []).map((item) => String(item));
  newRow[headers.indexOf("Description")] = "Unsupported new expense";
  newRow[headers.indexOf("__HQ Record ID")] = null;
  newRow[headers.indexOf("__HQ Fingerprint")] = null;
  XLSX.utils.sheet_add_aoa(sheet, [newRow], { origin: -1 });
  return new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }));
}

function removeExpenseRow(bytes: Uint8Array) {
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
  const sheet = workbook.Sheets.Expenses;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  workbook.Sheets.Expenses = XLSX.utils.aoa_to_sheet([rows[0], ...rows.slice(1).slice(1)]);
  return new Uint8Array(XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }));
}

function proposalFor(review: ReturnType<typeof buildExpensesImportReview>, expenseId: string) {
  const proposal = review.proposals.find((candidate) => candidate.expenseId === expenseId);
  assert.ok(proposal, `Expected a proposal for ${expenseId}`);
  return proposal;
}

function supplierProposalFor(review: ReturnType<typeof buildExpensesImportReview>, invoiceId: string) {
  const proposal = review.proposals.find((candidate) => candidate.invoiceId === invoiceId);
  assert.ok(proposal, `Expected a supplier payable proposal for ${invoiceId}`);
  return proposal;
}

function changedDirectExpense() {
  return expense({ description: "Changed in app", updatedAt: "2026-09-22T00:00:00.000Z" });
}

test("exports Expenses and related Supplier Payables with stable metadata", () => {
  const artifact = exportExpensesWorkbook(records());
  assert.deepEqual(readSheetNames(artifact.bytes), ["Expenses", "Supplier Payables", "_HydroQualiSense"]);
  const review = buildExpensesImportReview(artifact.bytes, context(), { fileName: artifact.fileName });
  assert.equal(review.proposals.every((proposal) => proposal.status === "UNCHANGED"), true);
});

test("permits direct draft attribute and allocation edits but protects supplier and lifecycle authority", () => {
  let bytes = setExpenseCells(exportedBytes(), {
    Date: "2026-09-21",
    Category: "Fuel",
    Description: "Revised site fuel",
    Amount: 1250,
    Currency: "PHP",
    Project: "PRJ-002",
    "Cost Code": "MECH",
  }, 0);
  const review = buildExpensesImportReview(bytes, context());
  const direct = proposalFor(review, DIRECT_EXPENSE_ID);
  assert.equal(direct.status, "WORKBOOK_ONLY_CHANGE");
  assert.equal(direct.canApply, true);

  bytes = setExpenseCells(bytes, { Amount: 99999, Status: "APPROVED" }, 1);
  const linkedReview = buildExpensesImportReview(bytes, context());
  assert.equal(proposalFor(linkedReview, LINKED_EXPENSE_ID).status, "UNSUPPORTED_PROTECTED_FIELD");
  assert.equal(proposalFor(linkedReview, LINKED_EXPENSE_ID).canApply, false);
});

test("fails closed for stale state, hidden identity tampering, bad references, and invalid money", () => {
  const edited = setExpenseCells(exportedBytes(), { Description: "Workbook edit" }, 0);
  assert.equal(proposalFor(buildExpensesImportReview(edited, context({ expenses: [changedDirectExpense(), ...records().expenses.slice(1)] })), DIRECT_EXPENSE_ID).status, "STALE_CONFLICT");
  assert.equal(proposalFor(buildExpensesImportReview(editCell(edited, "Expenses", "__HQ Company ID", "other-company", 0), context()), DIRECT_EXPENSE_ID).status, "UNAUTHORIZED");
  const supplierTampered = editCell(exportedBytes(), "Supplier Payables", "__HQ Linked Expense ID", "other-expense", 0);
  assert.equal(supplierProposalFor(buildExpensesImportReview(supplierTampered, context()), SUPPLIER_INVOICE_ID).status, "INVALID");
  assert.equal(proposalFor(buildExpensesImportReview(setExpenseCells(exportedBytes(), { Project: "UNKNOWN" }, 0), context()), DIRECT_EXPENSE_ID).status, "UNKNOWN_REFERENCE");
  assert.equal(proposalFor(buildExpensesImportReview(setExpenseCells(exportedBytes(), { Amount: -1 }, 0), context()), DIRECT_EXPENSE_ID).status, "INVALID");
});

test("classifies app-only Expense changes without inventing workbook edits", () => {
  const bytes = exportedBytes();

  const editedInApp = changedDirectExpense();
  const editedReview = buildExpensesImportReview(bytes, context({
    expenses: [editedInApp, ...records().expenses.slice(1)],
  }));
  const editedProposal = proposalFor(editedReview, DIRECT_EXPENSE_ID);
  assert.equal(editedProposal.status, "APP_ONLY_CHANGE");
  assert.equal(editedProposal.canApply, false);
  assert.equal(editedProposal.changes.length, 0);

  const lifecycleChangedInApp = expense({ status: "APPROVED", updatedAt: "2026-09-22T00:00:00.000Z" });
  const lifecycleReview = buildExpensesImportReview(bytes, context({
    expenses: [lifecycleChangedInApp, ...records().expenses.slice(1)],
  }));
  const lifecycleProposal = proposalFor(lifecycleReview, DIRECT_EXPENSE_ID);
  assert.equal(lifecycleProposal.status, "APP_ONLY_CHANGE");
  assert.equal(lifecycleProposal.canApply, false);
  assert.equal(lifecycleProposal.changes.length, 0);
});

test("classifies app-only supplier settlement changes without protected-field false positives", () => {
  const bytes = exportedBytes();
  const changedProjection = supplierProjection();
  changedProjection.settlement = {
    ...changedProjection.settlement,
    reconciledCashPaid: 500,
    effectiveSettled: 500,
    outstanding: 1500,
    settlementState: "PARTIALLY_PAID",
  };
  const review = buildExpensesImportReview(bytes, context({
    settlementProjections: new Map([[SUPPLIER_INVOICE_ID, changedProjection]]),
  }));
  const proposal = supplierProposalFor(review, SUPPLIER_INVOICE_ID);
  assert.equal(proposal.status, "APP_ONLY_CHANGE");
  assert.equal(proposal.canApply, false);
  assert.equal(proposal.changes.length, 0);
});

test("rejects workbook reassignment to an archived project", () => {
  const archivedProject = { ...project(PROJECT_TWO_ID, "PRJ-002", "South Plant"), status: "ARCHIVED" as const };
  const bytes = setExpenseCells(exportedBytes(), { Project: "PRJ-002" }, 0);
  const review = buildExpensesImportReview(bytes, context({
    projects: [project(PROJECT_ONE_ID, "PRJ-001", "North Plant"), archivedProject],
  }));
  const proposal = proposalFor(review, DIRECT_EXPENSE_ID);
  assert.equal(proposal.status, "INVALID");
  assert.equal(proposal.canApply, false);
  assert.match(proposal.messages.join(" "), /archived project/i);
});

test("keeps mixed currencies explicit and treats missing/new rows as non-destructive unsupported states", () => {
  const review = buildExpensesImportReview(removeExpenseRow(addNewExpenseRow(exportedBytes())), context());
  assert.equal(review.omittedExpenseIds.includes(DIRECT_EXPENSE_ID), true);
  assert.equal(review.proposals.some((proposal) => proposal.status === "UNSUPPORTED_NEW_RECORD"), true);
  assert.equal(review.proposals.some((proposal) => proposal.expense?.currency === "USD" && proposal.expense.amount === 25), true);
});

test("supplier authority conflicts remain fail-closed in Expense settlement projections", () => {
  const source = records();
  const conflicting = expense({ id: "bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbb1", supplierInvoiceId: SUPPLIER_INVOICE_ID, amount: 1900, status: "DRAFT" });
  const settlement = settlementForExpenseWorkbook(conflicting, {
    invoices: source.invoices,
    settlementProjections: new Map([[SUPPLIER_INVOICE_ID, { ...supplierProjection(), authorityConflict: true }]]),
    settlementMatches: source.settlementMatches,
  });
  assert.equal(settlement.authorityConflict, true);
  assert.equal(settlement.settlementState, "UNPAID");
  assert.equal(settlement.reconciledCashPaid, 0);
});

test("read-only context cannot apply and Apply revalidates before calling the authoritative callback", async () => {
  const edited = setExpenseCells(exportedBytes(), { Description: "Approved workbook edit" }, 0);
  const review = buildExpensesImportReview(edited, context());
  const calls: Expense[] = [];
  const result = await applyExpensesImport(review, context(), { saveExpense: async (next) => { calls.push(next); } }, [proposalFor(review, DIRECT_EXPENSE_ID).id]);
  assert.deepEqual(result.appliedProposalIds, [proposalFor(review, DIRECT_EXPENSE_ID).id]);
  assert.equal(calls[0]?.updatedAt, DIRECT_UPDATED_AT);
  assert.equal(calls[0]?.description, "Approved workbook edit");
  await assert.rejects(() => applyExpensesImport(review, context({ canWrite: false }), { saveExpense: async () => {} }), /permission/i);
  await assert.rejects(() => applyExpensesImport(review, context({ expenses: [changedDirectExpense(), ...records().expenses.slice(1)] }), { saveExpense: async () => {} }, [proposalFor(review, DIRECT_EXPENSE_ID).id]), /stale|changed/i);
});

test("real XLSX round trip re-exports the authoritative applied direct Expense state", async () => {
  let authoritative = records().expenses.map((item) => ({ ...item }));
  const edited = setExpenseCells(exportExpensesWorkbook(records()).bytes, { Description: "Authoritative re-export" }, 0);
  const review = buildExpensesImportReview(edited, context({ expenses: authoritative }));
  await applyExpensesImport(review, context({ expenses: authoritative }), {
    saveExpense: async (next) => { authoritative = authoritative.map((item) => item.id === next.id ? { ...next, updatedAt: NEXT_UPDATED_AT } : item); },
  }, [proposalFor(review, DIRECT_EXPENSE_ID).id]);
  const reexported = exportExpensesWorkbook(records({ expenses: authoritative }));
  assert.equal(proposalFor(buildExpensesImportReview(reexported.bytes, context({ expenses: authoritative })), DIRECT_EXPENSE_ID).status, "UNCHANGED");
});
