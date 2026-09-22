import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("S3C shortens routine page chrome while retaining critical financial and provider boundaries", () => {
  const projects = read("src/components/projects/ProjectsPage.tsx");
  const cash = read("src/components/CashBankingPage.tsx");
  const expenses = read("src/components/expenses/ExpensesPage.tsx");
  const email = read("src/components/EmailComposePanel.tsx");
  const documents = read("src/app/routes/DocumentsRoute.tsx");
  const settings = read("src/components/Settings.tsx");

  assert.match(projects, /Open project cards for current health and action\./);
  assert.doesNotMatch(projects, /Scan project health and commercial position, then open the register for evidence and action\./);

  assert.match(cash, /Selected-currency totals; no implicit FX\./);
  assert.doesNotMatch(cash, /Totals are selected-currency only; no implicit FX conversion is applied\./);
  assert.match(cash, /Suggestions aid review; confirmation never mutates the source record\./);

  assert.match(expenses, /Linked supplier documents support the Expense record\. Archive changes visibility; void changes active cost\./);
  assert.doesNotMatch(expenses, /Review and manage expense records here\. Linked supplier documents provide supporting context; archive changes visibility, while void changes active financial cost\./);

  assert.match(email, /Only issued Purchase Orders and issued Client Invoices can use the immutable document attachment path\./);
  assert.match(email, /Provider acceptance is not confirmation of delivery\./);
  assert.doesNotMatch(email, /Only issued Purchase Orders and issued Client Invoices are eligible for the immutable document attachment path\.<\/span>/);

  assert.match(documents, /Find records, then continue to the owning workflow\./);
  assert.doesNotMatch(documents, /Find, preview, and continue work on document records from across your company workflows\./);
  assert.match(settings, /Regional settings and company access for this deployment\./);
});

test("S3C puts optional procurement workbook education after the working register", () => {
  const procurement = read("src/components/procurement/ProcurementPage.tsx");
  const workbook = read("src/components/procurement/ProcurementWorkbookPanel.tsx");
  const workbookIndex = procurement.indexOf("<ProcurementWorkbookPanel");
  const tabsIndex = procurement.indexOf("{/* Sub-Tabs:");
  assert.ok(workbookIndex > tabsIndex, "workbook tools should follow the procurement tabs/register entry point");
  assert.match(workbook, /Review before Apply/);
});
