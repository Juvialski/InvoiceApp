import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("narrow operational registers use progressive disclosure instead of forced tables", () => {
  const expenses = source("src/components/expenses/ExpensesPage.tsx");
  const procurement = source("src/components/procurement/ProcurementPage.tsx");
  const receipts = source("src/components/procurement/RecordReceiptModal.tsx");

  assert.match(expenses, /aria-label="Expense register cards"/);
  assert.match(expenses, /className="hidden lg:block ops-scrollbar overflow-auto"/);
  const projects = source("src/components/projects/ProjectsPage.tsx");
  assert.match(projects, /data-project-id=\{project\.id\}/);
  assert.match(projects, /className="min-w-0 w-full p-4 shadow-sm space-y-3"/);
  assert.match(projects, /className="flex min-w-0 flex-col gap-2 border-t border-slate-100 pt-2\.5 sm:flex-row/);
  assert.match(projects, /label="Open Project →"[\s\S]*className="w-full sm:w-auto"/);
  assert.match(procurement, /aria-label="Purchase order register cards"/);
  assert.match(procurement, /aria-label="RFQ register cards"/);
  assert.match(procurement, /flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-200/);
  assert.match(procurement, /flex shrink-0 items-center gap-2 border-b-2/);
  assert.match(procurement, /flex w-full min-w-0 flex-wrap items-center gap-2/);
  assert.match(procurement, /min-w-0 w-full rounded-lg border border-slate-200 bg-white px-2\.5 py-1\.5 text-xs text-slate-700/);
  assert.match(receipts, /aria-label="Receipt line cards"/);
  assert.match(receipts, /Leave lines that were not delivered blank or enter 0/);
  const equipment = source("src/components/equipment/EquipmentPage.tsx");
  assert.match(equipment, /minmax\(160px,1\.3fr\)_100px_110px_minmax\(130px,1fr\)_100px_minmax\(150px,1fr\)/);
});

test("remaining workspaces keep secondary framing behind the working surface", () => {
  const projects = source("src/components/projects/ProjectsPage.tsx");
  const settings = source("src/components/Settings.tsx");
  const warehouse = source("src/components/inventory/WarehouseInventoryPage.tsx");
  const equipment = source("src/components/equipment/EquipmentPage.tsx");
  assert.match(projects, /<details aria-label="Portfolio Management Summary"/);
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
