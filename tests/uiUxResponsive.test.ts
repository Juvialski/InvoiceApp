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

test("desktop Projects filters reserve readable space for project search", () => {
  const projectRegister = source("src/components/projects/ProjectPortfolioRegisterSection.tsx");
  assert.match(projectRegister, /<div className="relative xl:col-span-2">[\s\S]*aria-label="Search projects"/);
  assert.match(projectRegister, /<details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 sm:col-span-2 lg:col-span-2 xl:col-span-3"/);
  assert.match(projectRegister, /<div className="flex gap-2 xl:col-span-2">[\s\S]*aria-label="Sort projects by field"/);
});
