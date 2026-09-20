import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("narrow operational registers use progressive disclosure instead of forced tables", () => {
  const expenses = source("src/components/expenses/ExpensesPage.tsx");
  const procurement = source("src/components/procurement/ProcurementPage.tsx");
  const purchaseOrderRegister = source("src/components/procurement/PurchaseOrderRegisterSection.tsx");
  const rfqRegister = source("src/components/procurement/RfqRegisterSection.tsx");
  const receipts = source("src/components/procurement/RecordReceiptModal.tsx");

  assert.match(expenses, /aria-label="Expense register cards"/);
  assert.match(expenses, /className="hidden lg:block"/);
  const projectRegister = source("src/components/projects/ProjectPortfolioRegisterSection.tsx");
  assert.match(projectRegister, /data-project-id=\{project\.id\}/);
  assert.match(projectRegister, /className="min-w-0 w-full overflow-hidden shadow-sm"/);
  assert.match(projectRegister, /className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-t border-slate-100 p-3"/);
  assert.match(projectRegister, /Open project workspace for/);
  assert.match(purchaseOrderRegister, /aria-label="Purchase order register cards"/);
  assert.match(rfqRegister, /aria-label="RFQ register cards"/);
  assert.match(procurement, /flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-200/);
  assert.match(procurement, /flex shrink-0 items-center gap-2 border-b-2/);
  assert.match(purchaseOrderRegister, /flex w-full min-w-0 flex-wrap items-center gap-2/);
  assert.match(purchaseOrderRegister, /min-w-0 w-full rounded-lg border border-slate-200 bg-white px-2\.5 py-1\.5 text-xs text-slate-700/);
  assert.match(receipts, /aria-label="Receipt line cards"/);
  assert.match(receipts, /Leave lines that were not delivered blank or enter 0/);
  const equipment = source("src/components/equipment/EquipmentPage.tsx");
  assert.match(equipment, /minmax\(160px,1\.3fr\)_100px_110px_minmax\(130px,1fr\)_100px_minmax\(150px,1fr\)/);
});

test("remaining workspaces keep secondary framing behind the working surface", () => {
  const projectRegister = source("src/components/projects/ProjectPortfolioRegisterSection.tsx");
  const settings = source("src/components/Settings.tsx");
  const warehouse = source("src/components/inventory/WarehouseInventoryPage.tsx");
  const equipment = source("src/components/equipment/EquipmentPage.tsx");
  assert.match(projectRegister, /<details aria-label="Portfolio Management Summary"/);
  assert.ok(settings.indexOf("<CompanyDocumentTemplatesSettings") < settings.indexOf("<ProductFeaturesRoadmap"));
  assert.ok(warehouse.indexOf("Search inventory items") < warehouse.indexOf("Movement-derived stock truth"));
  assert.ok(equipment.indexOf("Search Equipment") < equipment.indexOf("Assignment authority is separate"));
});

test("Projects keeps the card/list working surface before secondary analysis and workbook tools", () => {
  const projectsPage = source("src/components/projects/ProjectsPage.tsx");
  const projectRegister = source("src/components/projects/ProjectPortfolioRegisterSection.tsx");
  const toolbar = projectRegister.indexOf('data-ux45c="projects-primary-toolbar"');
  const workingSurface = projectRegister.indexOf('data-ux45c="projects-primary-work"');
  const secondaryAnalysis = projectRegister.indexOf('data-ux45c="projects-secondary-analysis"');
  const workbook = projectsPage.indexOf('data-ux45c="projects-workbook"');
  const register = projectsPage.indexOf("<ProjectPortfolioRegisterSection");

  assert.ok(toolbar >= 0);
  assert.ok(workingSurface > toolbar);
  assert.ok(secondaryAnalysis > workingSurface);
  assert.ok(workbook > register);
  assert.match(projectRegister, /Compact List/);
  assert.match(projectRegister, /Open project workspace for/);
  assert.match(projectsPage, /onApplyProjectWorkbookGroup/);
});

test("Expenses keeps the register before detail, supporting context, and workbook tools", () => {
  const expenses = source("src/components/expenses/ExpensesPage.tsx");
  const controls = expenses.indexOf('data-ux45c="expenses-primary-controls"');
  const register = expenses.indexOf('data-ux45c="expenses-primary-register"');
  const detail = expenses.indexOf('data-ux45c="expenses-selected-detail"');
  const supporting = expenses.indexOf('data-ux45c="expenses-supporting-context"');
  const workbook = expenses.indexOf('data-ux45c="expenses-workbook"');

  assert.ok(controls >= 0);
  assert.ok(register > controls);
  assert.ok(detail > register);
  assert.ok(supporting > detail);
  assert.ok(workbook > supporting);
  assert.match(expenses, /Add expense/);
  assert.match(expenses, /Edit draft worksheet/);
  assert.match(expenses, /FinancialSettlementCard/);
  assert.match(expenses, /onOpenSupplierInvoiceReview/);
  assert.match(expenses, /onReviewCorrection/);
  assert.match(expenses, /Confirm FX/);
});

test("restricted dashboard keeps its purpose visible before completeness warnings", () => {
  const dashboard = source("src/app/routes/DashboardRoute.tsx");
  const incompleteBranch = dashboard.indexOf('data-dashboard-completeness="incomplete"');
  assert.ok(incompleteBranch >= 0);
  assert.ok(dashboard.indexOf("<PageHeader", incompleteBranch) > incompleteBranch);
});

test("supplier invoice register precedes supporting settlement overview", () => {
  const invoices = source("src/app/routes/InvoicesRoute.tsx");
  const register = invoices.lastIndexOf("<InvoiceDirectory");
  const settlement = invoices.lastIndexOf("<InvoiceSettlementDirectoryPanel");
  assert.ok(register >= 0);
  assert.ok(settlement >= 0);
  assert.ok(register < settlement);
});

test("dashboard hides a zero-valued optional FX warning instead of rendering a stray zero", () => {
  const dashboard = source("src/components/engineering/EngineeringCostOperationsDashboard.tsx");
  assert.match(dashboard, /\{data\.invoiceOperations\.phpFxRequired > 0 &&/);
  assert.doesNotMatch(dashboard, /\{data\.invoiceOperations\.phpFxRequired &&/);
});

test("desktop Procurement filters reserve readable space for the search field", () => {
  const purchaseOrderRegister = source("src/components/procurement/PurchaseOrderRegisterSection.tsx");
  assert.match(purchaseOrderRegister, /grid gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm xl:grid-cols-\[minmax\(18rem,1fr\)_minmax\(0,auto\)\] xl:items-center/);
  assert.match(purchaseOrderRegister, /flex w-full min-w-0 flex-wrap items-center gap-2 xl:w-auto/);
});

test("Procurement draft worksheets keep dense editing contained inside responsive surfaces", () => {
  const rfqEditor = source("src/components/procurement/RFQEditorModal.tsx");
  const purchaseOrderEditor = source("src/components/procurement/PurchaseOrderEditorModal.tsx");
  assert.match(rfqEditor, /data-testid="rfq-draft-worksheet"/);
  assert.match(rfqEditor, /ariaLabel="RFQ draft lines worksheet"/);
  assert.match(rfqEditor, /className="min-w-0 space-y-4"/);
  assert.match(purchaseOrderEditor, /data-testid="purchase-order-draft-worksheet"/);
  assert.match(purchaseOrderEditor, /ariaLabel="Purchase order draft lines worksheet"/);
  assert.match(purchaseOrderEditor, /className="min-w-0 space-y-4"/);
});

test("Client Billing draft worksheet keeps spreadsheet density inside contained surfaces", () => {
  const clientBilling = source("src/components/projects/ClientBillingDraftWorksheet.tsx");
  assert.match(clientBilling, /data-testid="client-billing-draft-worksheet"/);
  assert.match(clientBilling, /data-worksheet-scroll-container="client-billing-details"/);
  assert.match(clientBilling, /data-worksheet-scroll-container="client-billing-lines"/);
  assert.match(clientBilling, /ariaLabel="Client Billing lines worksheet"/);
  assert.match(clientBilling, /className="min-w-0 space-y-4"/);
});

test("Expense direct draft worksheet keeps wide spreadsheet editing inside contained responsive surfaces", () => {
  const expense = source("src/components/expenses/ExpenseDraftWorksheet.tsx");
  const expensesPage = source("src/components/expenses/ExpensesPage.tsx");
  assert.match(expense, /data-testid="expense-draft-worksheet"/);
  assert.match(expense, /data-worksheet-scroll-container="expense-draft"/);
  assert.match(expense, /ariaLabel="Expense draft worksheet"/);
  assert.match(expense, /className="min-w-0 space-y-4"/);
  assert.match(expensesPage, /max-w-\[95vw\]/);
  assert.match(expensesPage, /overflow-y-auto/);
});

test("shared shell and worksheet dialogs contain long mobile scrolling", () => {
  const shell = source("src/app/AppShell.tsx");
  const header = source("src/components/Header.tsx");
  const dialogFocus = source("src/components/ui/useDialogFocus.ts");
  const projectDetails = source("src/components/projects/ProjectDetailsWorksheet.tsx");
  const expensesPage = source("src/components/expenses/ExpensesPage.tsx");
  const rfq = source("src/components/procurement/RFQEditorModal.tsx");
  const purchaseOrder = source("src/components/procurement/PurchaseOrderEditorModal.tsx");

  assert.match(shell, /data-app-shell="true"/);
  assert.match(shell, /data-app-shell-main="true"/);
  assert.match(shell, /root\.style\.scrollPaddingTop/);
  assert.match(header, /data-app-shell-header="true"/);
  assert.match(dialogFocus, /document\.body\.style\.overflow\s*=\s*"hidden"/);
  assert.match(dialogFocus, /data-dialog-scroll-locked/);
  assert.match(dialogFocus, /getClientRects\(\)\.length > 0/);
  assert.match(projectDetails, /overflow-hidden/);
  assert.match(projectDetails, /data-dialog-scroll-container="project-details"/);
  assert.match(expensesPage, /useDialogFocus/);
  assert.match(expensesPage, /data-dialog-scroll-container="expense-draft"/);
  assert.match(rfq, /fixed inset-0 z-50 flex items-center justify-center overflow-hidden/);
  assert.match(rfq, /data-dialog-scroll-container="rfq-editor"/);
  assert.match(purchaseOrder, /fixed inset-0 z-50 flex items-center justify-center overflow-hidden/);
  assert.match(purchaseOrder, /data-dialog-scroll-container="purchase-order-editor"/);
});

test("representative worksheet consumers expose stable responsive surfaces and keep authority in parents", () => {
  const projectDetails = source("src/components/projects/ProjectDetailsWorksheet.tsx");
  const costCodes = source("src/components/projects/ProjectCostCodesWorksheet.tsx");
  const clientBilling = source("src/components/projects/ClientBillingDraftWorksheet.tsx");
  const expense = source("src/components/expenses/ExpenseDraftWorksheet.tsx");
  const rfq = source("src/components/procurement/RFQEditorModal.tsx");
  const purchaseOrder = source("src/components/procurement/PurchaseOrderEditorModal.tsx");
  const supplierInvoice = source("src/components/invoices/SupplierInvoiceWorksheet.tsx");

  assert.match(projectDetails, /data-worksheet-responsive-surface="project-details"/);
  assert.match(projectDetails, /onSave=\{handleSave\}/);
  assert.match(costCodes, /data-worksheet-responsive-surface="cost-codes"/);
  assert.match(costCodes, /onSave=\{canManageProject \? handleSave : undefined\}/);
  assert.match(clientBilling, /data-worksheet-responsive-surface="client-billing"/);
  assert.match(clientBilling, /data-testid="client-billing-save-draft"/);
  assert.match(expense, /data-worksheet-responsive-surface="expense-draft"/);
  assert.match(expense, /onSave=\{editable \? handleSave : undefined\}/);
  assert.match(rfq, /data-worksheet-responsive-surface="rfq-draft"/);
  assert.match(purchaseOrder, /data-worksheet-responsive-surface="purchase-order-draft"/);
  assert.match(supplierInvoice, /data-worksheet-responsive-surface="supplier-invoice"/);
  assert.match(supplierInvoice, /protectedWhen:/);
  assert.match(supplierInvoice, /onSave=\{!readOnly && onUpdateInvoice \?/);
});

test("desktop Projects filters reserve readable space for project search", () => {
  const projectRegister = source("src/components/projects/ProjectPortfolioRegisterSection.tsx");
  assert.match(projectRegister, /<div className="relative xl:col-span-2">[\s\S]*aria-label="Search projects"/);
  assert.match(projectRegister, /<details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-2 lg:col-span-2 xl:col-span-3"/);
  assert.match(projectRegister, /<div className="flex gap-2 xl:col-span-2">[\s\S]*aria-label="Sort projects by field"/);
});
